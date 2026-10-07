/** Separately versioned native-value graph-only wallet binding. Historical flat modules remain unchanged. */
/** One fixed owner child and surviving private keeper for local fake values.
 * The keeper retains the password/checkpoint, and is trusted on the common OS.
 * This is process separation, not a hostile-host enclave or general keystore. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openTrustedNativeValueOwnerCustody, ownerCopy, ownerDigest, NATIVE_VALUE_OWNER_PROFILE } from '../signing/native-value-owner-custody-v3.mjs';
import { createNativeValueOwnerObserver, assertOwnedNativeValueOwnerObserver } from '../observers/native-value-owner-observer-v2.mjs';
import { assertOwnedNativeValueWalletSystem } from '../../../backend/src/operations/deployments/native-value/native-value-wallet-binding-v2.mjs';
import { exactRecord, FIELD_MODULUS, canonicalField } from '../../../backend/src/execution/encoding/commitments.mjs';
import { loadPinned, resourceModuleURL } from '../../../proofs/src/tooling/tooling.mjs';
import { createRoleProofClient } from '../../../proofs/src/jobs/role-client.mjs';
import { LIMITS } from '../../../proofs/src/catalog.mjs';

const FILE = fileURLToPath(import.meta.url), PROTOCOL = 'NATIVE_VALUE_OWNER_PRIVATE_IPC_V2', LIMIT = 2 * 1024 * 1024;
const OWNER = ['prepareNativeNotePreparation', 'prepareDeposit', 'prepareDepositIntent', 'bindDepositIntentDelivery', 'reconcileDepositIntent',
  'prepareAuthorization', 'invoiceRequests', 'authorize', 'prepareWithdrawal',
  'renewEpoch', 'bindSubmission', 'acknowledgeSubmitted', 'reconcile', 'reconcileCompetingReservation', 'reconcileRecovery'];
const PROOF = ['depositWitness', 'withdrawalWitness', 'proveAuthorization', 'proveDepositIntent'];
const plane = method => OWNER.includes(method) ? 'owner' : PROOF.includes(method) ? 'ownerProof'
  : method === 'selectRole' ? 'role' : ['privateSummary', 'preparationTerms', 'nativeNotePreparations', 'graphPreparationTerms'].includes(method) ? 'ownerView' : ['summary', 'close'].includes(method) ? 'lifecycle' : null;
const ownedProcesses = new WeakMap();
const code = error => /^(?:FLAT|NATIVE_VALUE)_[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'FLAT_OWNER_OPERATION_FAILED';
const failure = text => Object.assign(new Error(text), { code: text });
function bounded(value) { const clone = ownerCopy(value); assert.ok(JSON.stringify(clone).length <= LIMIT, 'FLAT_OWNER_IPC_LIMIT'); return clone; }
function opaque(methods) {
  const result = Object.create(null);
  for (const [key, value] of Object.entries(methods)) Object.defineProperty(result, key, { value });
  Object.defineProperty(result, 'toJSON', { value() { throw Error('FLAT_OWNER_CAPABILITY_NOT_SERIALIZABLE'); } });
  return Object.freeze(result);
}
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
// This closure has only the detached role packet, no process or owner reference.
function scoped(value) { const packet = frozen(ownerCopy(value)); return opaque({ select: () => frozen(ownerCopy(packet)) }); }
/** Called only inside the fixed child. No private field tuples cross IPC and
 * no parent callback can replace the hash. Backend lifetime is one envelope. */
async function withPinnedOwnerHash(work) {
  assert.equal(process.argv[2], '--native-value-owner-child-v2'); assert.equal(typeof process.send, 'function');
  const helpers = await import(resourceModuleURL); helpers.verifyToolchain();
  const bb = await loadPinned('@aztec/bb.js'); let backend;
  try {
    backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
      skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
    return await work(async fields => {
      assert.ok(Array.isArray(fields) && fields.length <= 137, 'FLAT_OWNER_HASH_TUPLE');
      const inputs = fields.map(value => { assert.ok(typeof value === 'bigint' && value >= 0n && value < FIELD_MODULUS);
        return Buffer.from(value.toString(16).padStart(64, '0'), 'hex'); });
      const result = Buffer.from((await backend.poseidon2Hash({ inputs })).hash).toString('hex'); canonicalField(result); return result;
    });
  } finally { await backend?.destroy(); }
}

async function childMain() {
  assert.equal(process.argv.length, 3); assert.deepEqual(process.execArgv, []);
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  globalThis.fetch = async () => { throw Error('FLAT_OWNER_OFFLINE_HASH_ONLY'); };
  for (const name of ['log', 'info', 'warn', 'error', 'debug', 'trace']) console[name] = () => {};
  let session = null, custody, busy = false, stopped = false, next = 1, sequence = 0, pendingHost = null, proofClient = null;
  const send = value => new Promise((resolve, reject) => process.send(bounded({ protocol: PROTOCOL, session, ...value }), error => error ? reject(error) : resolve()));
  async function host(method, input = null) {
    assert.ok(!pendingHost && !stopped); const id = ++sequence;
    const result = new Promise((resolve, reject) => { pendingHost = { id, resolve, reject }; }); result.catch(() => {});
    await send({ type: 'host', id, method, input }); return result;
  }
  function stop() { if (stopped) return; stopped = true; proofClient?.stop(); try { custody?.close(); } catch {} custody = null;
    pendingHost?.reject(failure('FLAT_OWNER_PARENT_LOST')); pendingHost = null; if (process.connected) process.disconnect(); }
  process.on('disconnect', stop);
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  process.once('exit', () => { proofClient?.stop(); });
  process.on('message', raw => { void (async () => {
    const message = bounded(raw); assert.equal(message.protocol, PROTOCOL);
    if (message.type === 'boot') {
      assert.ok(!session && !busy); session = message.session; busy = true;
      try {
        custody = await openTrustedNativeValueOwnerCustody(message.config, {
          observer: { readSnapshot: () => host('readSnapshot'), readTransaction: input => host('readTransaction', input),
            readDepositIntentDelivery: input => host('readDepositIntentDelivery', input),
            readNativeClaimIntent: input => host('readNativeClaimIntent', input) },
          onCheckpoint: input => host('checkpoint', input), withHashFields: withPinnedOwnerHash });
        message.config.password = ''; await send({ type: 'ready' });
      } catch (error) { await send({ type: 'startupFailure', code: code(error) }); stop(); }
      finally { busy = false; } return;
    }
    assert.equal(message.session, session);
    if (message.type === 'hostResult') {
      assert.equal(message.id, pendingHost?.id); const pending = pendingHost; pendingHost = null;
      if (message.ok) pending.resolve(message.result); else pending.reject(failure(message.code)); return;
    }
    assert.ok(message.type === 'request' && custody && !busy && message.id === next++
      && plane(message.method) !== null && plane(message.method) === message.plane);
    busy = true;
    try {
      let result;
      if (message.method === 'proveDepositIntent') {
        assert.equal(message.input, null);
        // Ordinary D27 proving returns no opening or detached signature to the
        // keeper. The separate claim handoff explicitly discloses one opening;
        // only the fixed owner proof role receives the complete D27 witness.
        let job = await custody.depositIntentProofJob();
        if (job.proofResult) result = job.proofResult;
        else {
          proofClient = createRoleProofClient('owner');
          try {
            const proof = await proofClient.prove({ relation: 'deposit_intent', inputs: job.inputs,
              expectedPublicInputs: job.publicInputs });
            result = await custody.retainDepositIntentProof(proof);
          } finally { job = null; proofClient.close(); proofClient = null; }
        }
      } else if (message.method === 'proveAuthorization') {
        assert.equal(message.input, null);
        // The full graph stays in the owner child and its fixed owner proof
        // worker. Only public proof/metrics cross the keeper IPC boundary.
        let job = await custody.ownerProofJob(); proofClient = createRoleProofClient('owner');
        try { result = await proofClient.prove({ relation: 'authorization', inputs: job.inputs, expectedPublicInputs: job.publicInputs }); }
        finally { job = null; proofClient.close(); proofClient = null; }
      } else result = await custody[message.method](message.input);
      await send({ type: 'result', id: message.id, ok: true, result }); }
    catch (error) { await send({ type: 'result', id: message.id, ok: false, code: code(error) }); }
    finally { busy = false; }
    if (message.method === 'close') stop();
  })().catch(stop); });
}

export function assertOwnedNativeValueOwnerProcess(capability, expected) {
  const value = ownedProcesses.get(capability); assert.ok(value && !value.closed(), 'NATIVE_VALUE_OWNER_OWNED_PROCESS_REQUIRED');
  assertOwnedNativeValueWalletSystem(value.runtime, value.system);
  if (expected) for (const key of Object.keys(expected)) { assert.ok(['runtime', 'system', 'poolIndex'].includes(key)); assert.equal(value[key], expected[key]); }
}

/** PRIVATE bootstrap. directory/password/checkpoint never come from a wallet
 * request. The caller durably retains each checkpoint before acknowledging it.
 * create=false requires the exact retained acknowledged or pending candidate. */
export async function createNativeValueOwnerProcess(input) {
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'directory', 'password', 'create', 'checkpoint', 'onCheckpoint']);
  const { runtime, system, poolIndex } = input;
  assertOwnedNativeValueWalletSystem(runtime, system);
  assert.equal(typeof input.onCheckpoint, 'function'); assert.equal(typeof input.create, 'boolean');
  assert.ok(typeof input.password === 'string' && input.password.length > 0);
  const directory = resolve(input.directory), info = await lstat(directory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, 'FLAT_OWNER_PRIVATE_DIRECTORY');
  const observer = await createNativeValueOwnerObserver({ runtime, system, poolIndex });
  // No native claims capability or caller observer is accepted by this profile.
  const nativeClaimObserver = null, assertNativeClaimObserver = null;
  const onCheckpoint = input.onCheckpoint, initialCreate = input.create;
  const processIdentitySHA256 = randomBytes(32).toString('hex');
  let password = input.password, checkpoint = ownerCopy(input.checkpoint), child = null, pending = null,
    generation = 0, closed = false, lifecycle = false, hostBusy = false;
  input = null;
  const identity = ownerCopy(observer.identity), poolArtifact = ownerCopy(observer.poolArtifact);
  let nextId = 1, hostId = 0, startupResolve, startupReject, exitResolve, ready = false, session;
  let exited = Promise.resolve(), lastExit = null, failed = null, terminationTimer = null;
  function reject(error) { failed ??= failure(code(error)); ready = false; startupReject?.(failed);
    if (pending) { clearTimeout(pending.timer); pending.reject(failed); pending = null; }
    const terminating = child; terminating?.kill('SIGTERM');
    terminationTimer ??= setTimeout(() => {
      if (terminating?.exitCode === null && terminating?.signalCode === null) terminating.kill('SIGKILL');
    }, 10000);
  }
  const send = value => new Promise((resolve, rejectSend) => {
    assert.ok(child?.connected); child.send(bounded({ protocol: PROTOCOL, session, ...value }), error => error ? rejectSend(error) : resolve());
  });
  async function retain(next) {
    exactRecord(next, ['version', 'identitySHA256', 'acknowledged', 'pending']); assert.equal(next.version, 1);
    assert.equal(next.identitySHA256, ownerDigest(identity));
    const mark = value => { exactRecord(value, ['revision', 'stateSHA256']); assert.ok(Number.isSafeInteger(value.revision) && value.revision >= 0);
      assert.ok(typeof value.stateSHA256 === 'string' && value.stateSHA256.length === 64 && /^[0-9a-f]+$/.test(value.stateSHA256)); };
    mark(next.acknowledged); if (next.pending) { mark(next.pending); assert.equal(next.pending.revision, next.acknowledged.revision + 1); }
    if (checkpoint === null) assert.ok(next.acknowledged.revision === 0 && next.pending === null);
    else if (next.pending) { assert.equal(ownerDigest(next.acknowledged), ownerDigest(checkpoint.acknowledged));
      if (checkpoint.pending) assert.equal(ownerDigest(checkpoint.pending), ownerDigest(next.pending)); }
    else assert.equal(ownerDigest(next.acknowledged), ownerDigest(checkpoint.pending ?? checkpoint.acknowledged));
    // Keep the pending candidate even when the outside keeper's acknowledgement
    // is uncertain. Never replace it with the old base on a retry.
    checkpoint = ownerCopy(next); await onCheckpoint(frozen(ownerCopy(next)));
    return { retained: true };
  }
  async function start(create) {
    assert.ok(!closed && (!child || child.exitCode !== null || child.signalCode !== null));
    assertOwnedNativeValueOwnerObserver(observer, { runtime, system, poolIndex });
    ready = false; failed = null; nextId = 1; hostId = 0; session = randomBytes(32).toString('hex'); generation++;
    const startup = new Promise((resolve, rejectStart) => { startupResolve = resolve; startupReject = rejectStart; }); startup.catch(() => {});
    exited = new Promise(resolve => { exitResolve = resolve; });
    const started = fork(FILE, ['--native-value-owner-child-v2'], { cwd: directory, env: { LANG: 'C.UTF-8', PATH: '/usr/bin:/bin' },
      execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'json', windowsHide: true }); child = started;
    const startedSession = session;
    const sendHere = value => new Promise((resolveSend, rejectSend) => {
      assert.ok(started.connected && child === started, 'FLAT_OWNER_GENERATION_CLOSED');
      started.send(bounded({ protocol: PROTOCOL, session: startedSession, ...value }),
        error => error ? rejectSend(error) : resolveSend());
    });
    const rejectHere = error => { if (child === started) reject(error); };
    const timeout = setTimeout(() => rejectHere(failure('FLAT_OWNER_START_TIMEOUT')), 60000);
    let stderrBytes = 0;
    started.stderr.on('data', bytes => { stderrBytes += bytes.length; bytes.fill(0); if (stderrBytes > 16384) rejectHere(failure('FLAT_OWNER_LOG_LIMIT')); });
    started.on('error', rejectHere);
    started.on('message', raw => { void (async () => {
      assert.equal(started, child); const message = bounded(raw); assert.equal(message.protocol, PROTOCOL); assert.equal(message.session, session);
      if (message.type === 'host') {
        assert.ok(!hostBusy && message.id === ++hostId); hostBusy = true;
        try { let result;
          if (message.method === 'checkpoint') result = await retain(message.input);
          else {
            assertOwnedNativeValueOwnerObserver(observer, { runtime, system, poolIndex });
            assert.ok(pending, 'FLAT_OWNER_UNSOLICITED_OBSERVATION');
            if (message.method === 'readSnapshot') result = await observer.readSnapshot();
            else if (message.method === 'readDepositIntentDelivery') {
              assert.equal(pending.method, 'reconcileDepositIntent', 'FLAT_OWNER_UNSOLICITED_DELIVERY');
              assert.equal(message.input.transactionHash, pending.input.transactionHash);
              assert.equal(message.input.calldataSHA256, pending.input.calldataSHA256);
              if (nativeClaimObserver) {
                assertNativeClaimObserver(nativeClaimObserver, { runtime, system, poolIndex });
                result = await nativeClaimObserver.readDepositIntentDelivery(message.input);
              } else result = await observer.readDepositIntentDelivery(message.input);
            }
            else if (message.method === 'readNativeClaimIntent') {
              assert.equal(pending.method, 'renewNativeClaimDepositIntent', 'FLAT_OWNER_UNSOLICITED_CLAIM_INTENT');
              assert.equal(message.input.handoffIdentitySHA256, pending.input.handoffIdentitySHA256);
              assert.equal(message.input.identitySHA256, ownerDigest(identity));
              assert.ok(nativeClaimObserver && assertNativeClaimObserver, 'FLAT_OWNER_CLAIM_OBSERVER_REQUIRED');
              assertNativeClaimObserver(nativeClaimObserver, { runtime, system, poolIndex });
              result = await nativeClaimObserver.readNativeClaimIntent(message.input);
            }
            else { assert.equal(message.method, 'readTransaction');
              assert.ok(['reconcile', 'reconcileCompetingReservation', 'reconcileRecovery'].includes(pending.method));
              if (pending.method === 'reconcileRecovery') {
                assert.ok(['reservation', 'recovery'].includes(message.input.kind));
                if (message.input.kind === 'recovery') {
                  assert.equal(message.input.transactionHash, pending.input.transactionHash);
                  assert.equal(message.input.calldataSHA256, pending.input.calldataSHA256);
                }
              } else assert.equal(message.input.kind, pending.method === 'reconcile' ? pending.input.kind : 'reservation');
              if (pending.method === 'reconcileCompetingReservation') {
                assert.equal(message.input.transactionHash, pending.input.transactionHash);
                assert.equal(message.input.calldataSHA256, pending.input.calldataSHA256);
              }
              result = await observer.readTransaction(message.input); }
          }
          await sendHere({ type: 'hostResult', id: message.id, ok: true, result });
        } catch (error) { await sendHere({ type: 'hostResult', id: message.id, ok: false, code: code(error) }); }
        finally { hostBusy = false; } return;
      }
      if (message.type === 'ready') { assert.ok(!ready); ready = true; clearTimeout(timeout); startupResolve(); return; }
      if (message.type === 'startupFailure') throw failure(message.code);
      assert.equal(message.type, 'result'); assert.equal(message.id, pending?.id);
      const request = pending; pending = null; clearTimeout(request.timer);
      if (message.ok) request.resolve(frozen(ownerCopy(message.result))); else request.reject(failure(message.code));
    })().catch(rejectHere); });
    started.once('exit', (exitCode, signal) => { clearTimeout(timeout); clearTimeout(terminationTimer); terminationTimer = null;
      ready = false; lastExit = { code: exitCode, signal };
      if (pending) { clearTimeout(pending.timer); pending.reject(failure('FLAT_OWNER_CHILD_EXIT')); pending = null; }
      startupReject(failure('FLAT_OWNER_CHILD_EXIT')); exitResolve(); });
    await send({ type: 'boot', config: { path: join(directory, 'native-value-owner-v2.vault'), password, identity, poolArtifact,
      create, checkpoint, processIdentitySHA256, processGeneration: generation } });
    try { await startup; } catch (error) { await exited; throw error; }
  }
  async function request(method, value = null) {
    assertOwnedNativeValueWalletSystem(runtime, system);
    assert.ok(!closed && ready && !failed && !pending && !hostBusy, 'FLAT_OWNER_BUSY_OR_UNAVAILABLE');
    const normalized = bounded(value); assert.ok(plane(method));
    const id = nextId++; const result = new Promise((resolve, rejectRequest) => {
      pending = { id, method, input: normalized, resolve, reject: rejectRequest,
        timer: setTimeout(() => reject(failure('FLAT_OWNER_REQUEST_TIMEOUT')),
          ['proveAuthorization', 'proveDepositIntent'].includes(method) ? LIMITS.phaseTimeoutMilliseconds + 30000 : 120000) };
    }); result.catch(() => {});
    try { await send({ type: 'request', id, plane: plane(method), method, input: normalized }); }
    catch (error) { reject(error); } return result;
  }
  async function stopChild() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    if (ready && !pending && !hostBusy && !failed) await request('close').catch(() => {});
    else child.kill('SIGTERM');
    const force = setTimeout(() => child?.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(force); }
  }
  const owner = opaque(Object.fromEntries(OWNER.map(method => [method, input => request(method, input ?? null)])));
  const ownerProof = opaque({ deposit: () => request('depositWitness'), proveAuthorization: () => request('proveAuthorization'),
    proveDepositIntent: () => request('proveDepositIntent'),
    withdrawal: role => request('withdrawalWitness', { role }) });
  const roles = opaque({ reservation: async () => scoped(await request('selectRole', { role: 'reservation' })),
    recovery: async () => scoped(await request('selectRole', { role: 'recovery' })),
    assembler: async () => scoped(await request('selectRole', { role: 'assembler' })),
    local: async slot => scoped(await request('selectRole', { role: 'local', slot })),
    dependency: async slot => scoped(await request('selectRole', { role: 'dependency', slot })) });
  const capability = opaque({ owner, ownerProof, roles,
    ownerView: opaque({ summary: () => request('privateSummary'),
      preparationTerms: input => request('preparationTerms', input),
      nativeNotePreparations: () => request('nativeNotePreparations'),
      graphPreparationTerms: () => request('graphPreparationTerms') }),
    publicView: opaque({ summary: () => request('summary') }),
    report: () => ({ profile: 'OWNED_NATIVE_VALUE_OWNER_PROCESS_V2', custodyProfile: NATIVE_VALUE_OWNER_PROFILE, generation, closed, available: ready && !failed,
      childExited: !child || child.exitCode !== null || child.signalCode !== null, exit: ownerCopy(lastExit),
      childRestart: true, keeperRestart: false }),
    suspend: async () => { assert.ok(!lifecycle && !closed && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { await stopChild(); return { suspended: true, childExited: true }; } finally { lifecycle = false; } },
    restart: async () => { assert.ok(!lifecycle && !closed && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { await stopChild(); await start(false); return { available: true, generation }; } finally { lifecycle = false; } },
    close: async () => { assert.ok(!lifecycle && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { if (!closed) await stopChild(); closed = true; password = null; return { closed: true, childExited: true }; } finally { lifecycle = false; } },
  });
  await start(initialCreate); ownedProcesses.set(capability, { runtime, system, poolIndex, closed: () => closed }); return capability;
}

if (process.argv[1] && resolve(process.argv[1]) === FILE && process.argv[2] === '--native-value-owner-child-v2')
  await childMain();
