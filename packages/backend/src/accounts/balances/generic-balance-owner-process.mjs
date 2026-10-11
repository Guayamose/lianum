/** Surviving private keeper for one fixed owner child. Production construction
 * requires the branded owned runtime/system/observer; no URL, script, key,
 * identity, path, checkpoint or signing callback is accepted from a caller.
 * Only the child opens the Vault. The parent retains its password/checkpoint so
 * a child restart can preserve custody within this same trusted lifetime. */
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {assertLocalEvm} from '@lianum/engine/execution/local/local-evm';
import {assertOwnedNativeSystem} from '../../execution/native/dispatch/native-deployment.mjs';
import {objectDigest, validateIdentity, PROFILE, OBSERVATION_TRUST} from '@lianum/engine/execution/balances/generic-balance-custody';
import {BALANCE_OWNER_PROTOCOL, OWNER_METHODS, createFrameReader, writeFrame,
  clone, exact, need, problem, safeCode, methodPlane, validateRecoveryObservationQuery} from '@lianum/engine/execution/balances/generic-balance-owner-protocol';

const childFile = fileURLToPath(new URL('../../../../engine/src/execution/balances/generic-balance-owner-child.mjs', import.meta.url));
const ownedProcesses = new WeakMap();
const same = (a, b) => objectDigest(a) === objectDigest(b);
const privateRecord = cp => cp.pending
  ? {revision: cp.pending.revision, stateSHA256: cp.pending.stateSHA256} : cp.acknowledged;
const opaque = () => randomBytes(32).toString('hex');

export function assertOwnedGenericBalanceOwnerProcess(process, expected = undefined) {
  const bound = ownedProcesses.get(process);
  need(bound, 'BALANCE_OWNER_OWNED_PROCESS_REQUIRED');
  if (expected !== undefined) {
    need(expected && Object.getPrototypeOf(expected) === Object.prototype
      && Object.keys(expected).every(key => ['runtime', 'system', 'poolIndex', 'identitySHA256'].includes(key)),
      'BALANCE_OWNER_BINDING_FIELDS');
    for (const key of Object.keys(expected)) need(bound[key] === expected[key], 'BALANCE_OWNER_DEPLOYMENT_BINDING');
  }
}

function publicResult(method, value) {
  if (method === 'summary') {
    exact(value, ['profile', 'storageAvailable', 'trust', 'backing', 'masterRootKeyWallet']);
    need(value.profile === PROFILE && value.trust === OBSERVATION_TRUST && value.backing === 'SYNTHETIC_LOCAL_POOL_ASSET'
      && typeof value.storageAvailable === 'boolean' && value.masterRootKeyWallet === false, 'BALANCE_OWNER_PUBLIC_RESULT');
  } else {
    exact(value, ['ownerOperationRef', 'kind', 'stage', 'reconcileRequired', 'dispatchAllowed']);
    need(typeof value.ownerOperationRef === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value.ownerOperationRef)
      && ['D26','S66','W39'].includes(value.kind) && ['PREPARED','SIGNING','AUTHORIZED','SUBMITTING','UNKNOWN','CONFIRMED','ABANDONED'].includes(value.stage)
      && value.dispatchAllowed === false && typeof value.reconcileRequired === 'boolean', 'BALANCE_OWNER_PUBLIC_RESULT');
  }
  return clone(value);
}

export async function createGenericBalanceOwnerProcess(input) {
  // Runtime objects contain methods, so they are never run through JSON codecs.
  need(input && Object.getPrototypeOf(input) === Object.prototype
    && Object.keys(input).sort().join(',') === 'observer,poolIndex,runtime,system', 'BALANCE_OWNER_CONSTRUCTOR_FIELDS');
  const {runtime, system, poolIndex, observer} = input;
  await assertLocalEvm(runtime); assertOwnedNativeSystem(runtime, system);
  need(Number.isInteger(poolIndex) && poolIndex >= 0 && poolIndex < system.pools.length, 'BALANCE_OWNER_POOL_INDEX');
  const {assertOwnedGenericBalanceObserver} = await import('./generic-balance-observer.mjs');
  assertOwnedGenericBalanceObserver(observer, {runtime, system, poolIndex});
  const pool = system.pools[poolIndex], identity = validateIdentity(observer.identity), artifact = clone(observer.poolArtifact);
  need(identity.chainId === runtime.metadata.chainId && identity.evmGenesis === runtime.metadata.evmGenesis.slice(2)
    && identity.pool === pool.address.slice(2) && identity.poolCodeHash === pool.codeHash.slice(2)
    && identity.scope === pool.scope.slice(2) && identity.policy === pool.policy.slice(2)
    && identity.asset.identity === system.assetIdentity.slice(2)
    && identity.hubDomain === system.hubDomain.slice(2) && identity.registryCommitment === system.registryCommitment.slice(2)
    && same(artifact, pool.artifact) && identity.poolAbiSHA256 === objectDigest(artifact), 'BALANCE_OWNER_DEPLOYMENT_BINDING');
  const identitySHA256 = objectDigest(identity);
  const directory = await mkdtemp(join(runtime.metadata.scratchDirectory, 'generic-balance-owner-'));
  const path = join(directory, 'custody.vault');
  let password = 'synthetic-' + opaque(), checkpoint = null, job = null, generation = 0, closed = false;
  let suspended = false, lifecycleBusy = false;
  let lastSummary = null, lastRecovery = null;

  async function assertBinding() {
    await assertLocalEvm(runtime); assertOwnedNativeSystem(runtime, system);
    assertOwnedGenericBalanceObserver(observer, {runtime, system, poolIndex});
    need(objectDigest(observer.identity) === identitySHA256, 'BALANCE_OWNER_IDENTITY_CHANGED');
  }

  function retainCheckpoint(next, allowRecovery) {
    exact(next, ['version', 'identitySHA256', 'acknowledged', 'pending']);
    need(next.version === 3 && next.identitySHA256 === identitySHA256, 'BALANCE_OWNER_CHECKPOINT_IDENTITY');
    exact(next.acknowledged, ['revision', 'stateSHA256']);
    need(Number.isSafeInteger(next.acknowledged.revision) && next.acknowledged.revision >= 0, 'BALANCE_OWNER_CHECKPOINT_REVISION');
    if (next.pending) {
      exact(next.pending, ['revision', 'stateSHA256', 'mutation']);
      need(next.pending.revision === next.acknowledged.revision + 1, 'BALANCE_OWNER_CHECKPOINT_REVISION');
    }
    if (checkpoint === null) need(next.pending === null && next.acknowledged.revision === 0, 'BALANCE_OWNER_INITIAL_CHECKPOINT');
    else if (next.pending) {
      need(same(next.acknowledged, checkpoint.acknowledged), 'BALANCE_OWNER_CHECKPOINT_BASE');
      if (checkpoint.pending && !same(next.pending, checkpoint.pending)) {
        need(allowRecovery && next.pending.mutation.type === 'RECOVERY', 'BALANCE_OWNER_CHECKPOINT_PENDING_CHANGED');
        const previous = checkpoint.pending.mutation;
        need(same(next.pending.mutation.original, previous.type === 'RECOVERY' ? previous.original : previous)
          && next.pending.mutation.originalCandidateSHA256 === (previous.type === 'RECOVERY'
            ? previous.originalCandidateSHA256 : checkpoint.pending.stateSHA256), 'BALANCE_OWNER_RECOVERY_CHECKPOINT');
      }
    } else need(same(next.acknowledged, privateRecord(checkpoint)), 'BALANCE_OWNER_CHECKPOINT_ACK');
    checkpoint = clone(next); // Retain before acknowledging the private child.
  }

  function send(j, message) {
    need(j === job && !j.exited, 'BALANCE_OWNER_CHILD_UNAVAILABLE');
    return writeFrame(j.child.stdin, {protocol: BALANCE_OWNER_PROTOCOL, session: j.session, ...message});
  }

  async function start(mode) {
    need(!closed && (!job || job.exited), 'BALANCE_OWNER_ALREADY_STARTED'); await assertBinding();
    const child = spawn(process.execPath, [childFile], {
      cwd: directory, env: {LANG: 'C.UTF-8'}, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let readyResolve, readyReject, exitResolve;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; }); ready.catch(() => {});
    const exited = new Promise(resolve => { exitResolve = resolve; });
    const j = {child, session: opaque(), mode, generation: ++generation, ready: false, exited: false,
      readyPromise: ready, exitedPromise: exited, nextId: 1, hostSequence: 0, hostBusy: false, pending: null,
      failure: null, stopping: false, stderrBytes: 0, exit: null, hostWork: null};
    job = j;
    let startupTimer, killTimer;
    function fail(error) {
      j.failure ??= problem(safeCode(error)); readyReject(j.failure);
      if (j.pending) { clearTimeout(j.pending.timer); j.pending.reject(j.failure); j.pending = null; }
      if (!j.exited && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => { if (!j.exited) child.kill('SIGKILL'); }, 5000);
      }
    }
    j.fail = fail;
    async function host(message) {
      need(!j.hostBusy && message.sequence === ++j.hostSequence, 'BALANCE_OWNER_HOST_SEQUENCE'); j.hostBusy = true;
      try {
        let result;
        if (message.method === 'checkpoint') { retainCheckpoint(message.input, mode === 'recoverAbsent' && !j.ready); result = {retained: true}; }
        else {
          await assertBinding();
          if (message.method === 'readSnapshot') result = await observer.readSnapshot();
          else {
            need(message.input.identitySHA256 === identitySHA256, 'BALANCE_OWNER_OBSERVER_IDENTITY');
            need(j.pending && ['reconcile', 'reconcileRecovery'].includes(j.pending.method), 'BALANCE_OWNER_OBSERVER_COMMAND');
            if (j.pending.method === 'reconcileRecovery') {
              validateRecoveryObservationQuery(j.pending.input, message.input, identitySHA256);
            } else need(message.input.ownerOperationRef === j.pending.input, 'BALANCE_OWNER_OBSERVER_COMMAND');
            result = await observer.readTransaction(clone(message.input));
          }
        }
        await send(j, {type: 'hostReply', sequence: message.sequence, ok: true, result});
      } catch (error) {
        await send(j, {type: 'hostReply', sequence: message.sequence, ok: false, code: safeCode(error)}).catch(fail);
      } finally { j.hostBusy = false; }
    }
    const reader = createFrameReader(message => {
      need(message.session === j.session, 'BALANCE_OWNER_SESSION');
      if (message.type === 'hostRequest') {
        j.hostWork = host(message).catch(fail); return;
      }
      if (message.type === 'ready') {
        need(!j.ready, 'BALANCE_OWNER_READY_ONCE'); j.ready = true; clearTimeout(startupTimer);
        lastSummary = publicResult('summary', message.summary); lastRecovery = clone(message.recovery); readyResolve(); return;
      }
      if (message.type === 'startupFailure') { fail(problem(message.code)); return; }
      need(message.type === 'result' && j.ready && j.pending && message.id === j.pending.id, 'BALANCE_OWNER_RESULT_SEQUENCE');
      const pending = j.pending; j.pending = null; clearTimeout(pending.timer);
      if (message.ok) {
        const result = pending.plane === 'public' ? publicResult(pending.method, message.result) : clone(message.result);
        if (pending.method === 'summary') lastSummary = result;
        pending.resolve(result);
      } else pending.reject(problem(message.code));
    });
    child.stdout.on('data', bytes => { try { reader.push(bytes); } catch (error) { fail(error); } finally { bytes.fill(0); } });
    child.stdout.on('end', () => { try { reader.end(); } catch (error) { fail(error); } });
    child.stderr.on('data', bytes => { j.stderrBytes += bytes.length; bytes.fill(0);
      if (j.stderrBytes > 16 * 1024) fail(problem('BALANCE_OWNER_LOG_LIMIT')); });
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', () => fail(problem('BALANCE_OWNER_IO')));
    child.once('error', () => fail(problem('BALANCE_OWNER_SPAWN')));
    child.once('close', (code, signal) => {
      j.exited = true; j.ready = false; j.exit = {code, signal};
      clearTimeout(startupTimer); clearTimeout(killTimer); reader.close();
      if (j.pending || !j.stopping) fail(problem('BALANCE_OWNER_CHILD_EXIT'));
      readyReject(problem('BALANCE_OWNER_CHILD_EXIT'));
      for (const stream of child.stdio) stream?.destroy(); exitResolve();
    });
    startupTimer = setTimeout(() => fail(problem('BALANCE_OWNER_START_TIMEOUT')), 60000);
    await send(j, {type: 'boot', mode, config: {path, password, identity: clone(identity), poolArtifact: clone(artifact),
      create: mode === 'create', checkpoint: clone(checkpoint)}}).catch(fail);
    try { await ready; } catch (error) { await exited; throw error; }
    return j;
  }

  async function request(method, input = null) {
    const normalized = clone(input), plane = methodPlane(method), j = job;
    need(!closed && j?.ready && !j.exited && !j.failure && !j.pending && !j.hostBusy, 'BALANCE_OWNER_BUSY_OR_UNAVAILABLE');
    if (plane === 'owner') await assertBinding();
    need(j === job && !j.pending && !j.exited, 'BALANCE_OWNER_BUSY_OR_UNAVAILABLE');
    const id = j.nextId++;
    const result = new Promise((resolve, reject) => {
      j.pending = {id, method, input: normalized, plane, resolve, reject,
        timer: setTimeout(() => j.fail(problem('BALANCE_OWNER_REQUEST_TIMEOUT')), 60000)};
    });
    await send(j, {type: 'request', id, plane, method, input: normalized}).catch(j.fail);
    return result;
  }

  async function stopChild() {
    const j = job; if (!j || j.exited) return;
    j.stopping = true;
    if (j.ready && !j.pending && !j.hostBusy && !j.failure) {
      await request('close').catch(() => {});
    } else j.fail(problem('BALANCE_OWNER_RESTARTED'));
    const force = setTimeout(() => { if (!j.exited) j.child.kill('SIGKILL'); }, 5000);
    try { await j.exitedPromise; await j.hostWork; } finally { clearTimeout(force); }
  }

  const owner = Object.freeze(Object.fromEntries([...OWNER_METHODS, 'authenticateCommittedWrite', 'resumePendingWrite']
    .map(method => [method, input => request(method, input ?? null)])));
  const publicView = Object.freeze({summary: () => request('summary'), operation: reference => request('projection', reference)});
  const capability = Object.freeze({
    owner, publicView,
    report: () => ({profile: BALANCE_OWNER_PROTOCOL, generation, available: Boolean(!closed && job?.ready && !job.failure),
      suspended, closed, childExited: job?.exited ?? false, exit: clone(job?.exit ?? null), childRestart: true, keeperRestart: false,
      failureCode: job?.failure?.code ?? null}),
    async suspend() {
      need(!closed && !lifecycleBusy, 'BALANCE_OWNER_LIFECYCLE_BUSY'); lifecycleBusy = true;
      try { await stopChild(); suspended = true; return {suspended: true, closed: false, childExited: job?.exited ?? true}; }
      finally { lifecycleBusy = false; }
    },
    async restart(options = {}) {
      need(!closed && !lifecycleBusy, 'BALANCE_OWNER_LIFECYCLE_BUSY'); exact(options, Object.hasOwn(options, 'recoverUncommitted') ? ['recoverUncommitted'] : []);
      need(options.recoverUncommitted === undefined || typeof options.recoverUncommitted === 'boolean', 'BALANCE_OWNER_RESTART_OPTIONS');
      lifecycleBusy = true;
      try { await stopChild(); suspended = true; await start(options.recoverUncommitted ? 'recoverAbsent' : 'recover');
        suspended = false; return {summary: clone(lastSummary), recovery: clone(lastRecovery)}; }
      finally { lifecycleBusy = false; }
    },
    async close() {
      need(!lifecycleBusy, 'BALANCE_OWNER_LIFECYCLE_BUSY'); lifecycleBusy = true;
      try { if (!closed) { await stopChild(); closed = true; suspended = false; password = null; }
        return {closed: true, exited: job?.exited ?? true}; }
      finally { lifecycleBusy = false; }
    },
  });
  await start('create'); ownedProcesses.set(capability, {runtime, system, poolIndex, identitySHA256}); return capability;
}
