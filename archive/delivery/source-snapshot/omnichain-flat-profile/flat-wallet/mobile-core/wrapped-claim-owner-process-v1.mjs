import { inspectWrappedInstallationSourcesV2 } from '../integration/wrapped-installation-source-inspector-v2.mjs';
// This fixed selector adds source checks only; it never supplies ownership.
const FILE = fileURLToPath(import.meta.url);
const ORIGINAL_WRAPPED_OWNER_CHILD_V1 = Boolean(process.argv[1] && resolve(process.argv[1]) === FILE
  && process.argv[2] === '--wrapped-claim-owner-child-v1');
if (ORIGINAL_WRAPPED_OWNER_CHILD_V1) inspectWrappedInstallationSourcesV2();
const { assertOwnedWrappedClaimWalletSystemV1 } = await import('../wallet-platform/modules/ops/wrapped-claim-wallet-binding-v1.mjs');
const { openTrustedFlatOwnerCustody, ownerCopy, ownerDigest, FLAT_OWNER_PROFILE } = await import('./flat-owner-custody.mjs');
const { createWrappedClaimOwnerObserverV1: createFlatOwnerObserver, assertOwnedWrappedClaimOwnerObserverV1: assertOwnedFlatOwnerObserver } = await import('./wrapped-claim-owner-observer-v1.mjs');
const { exactRecord, FIELD_MODULUS, canonicalField } = await import('../wallet-platform/modules/paeg/commitments.mjs');
const { loadPinned, resourceModuleURL } = await import('../proof-workers/tooling.mjs');
const { createRoleProofClient } = await import('../proof-workers/role-client.mjs');
const { LIMITS } = await import('../proof-workers/catalog.mjs');
if (ORIGINAL_WRAPPED_OWNER_CHILD_V1) inspectWrappedInstallationSourcesV2();
/** One fixed owner child and surviving private keeper for local fake values.
 * The keeper retains the password/checkpoint, and is trusted on the common OS.
 * This is process separation, not a hostile-host enclave or general keystore. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const PROTOCOL = 'WRAPPED_CLAIM_OWNER_PRIVATE_IPC_V1', LIMIT = 2 * 1024 * 1024;
const OWNER = ['reauthorizeManualPreparation', 'prepareManualPreparation', 'prepareDeposit', 'prepareDepositIntent', 'bindDepositIntentDelivery', 'reconcileDepositIntent',
  'createNativeClaimIngressHandoff', 'renewNativeClaimDepositIntent',
  'prepareAuthorization', 'invoiceRequests', 'authorize', 'prepareWithdrawal',
  'renewEpoch', 'bindSubmission', 'acknowledgeSubmitted', 'reconcile', 'reconcileCompetingReservation', 'reconcileRecovery'];
const PROOF = ['depositWitness', 'withdrawalWitness', 'proveAuthorization', 'proveDepositIntent', 'retainedWithdrawalWitness', 'retainedWithdrawalSubmissionWitness'];
const plane = method => OWNER.includes(method) ? 'owner' : PROOF.includes(method) ? 'ownerProof'
  : method === 'bindNativeClaimIssuance' ? 'claimIngress'
    : method === 'selectRole' ? 'role' : ['privateSummary', 'preparationTerms', 'manualPreparations', 'graphPreparationTerms'].includes(method) ? 'ownerView' : ['summary', 'close'].includes(method) ? 'lifecycle' : null;
const ownedProcesses = new WeakMap();
const { createClaimRecordStore, openClaimRecordStore } = await import('../wallet-platform/modules/native-claims/segmented-record-store.mjs');
const {retainWrappedPrivateLifetimePartV1,readWrappedPrivateLifetimePartV1,updateWrappedPrivateLifetimePartV1,assertWrappedPrivateLifetimePartSealedV1}=await import('../wallet-platform/modules/native-claims/wrapped-private-lifetime-registry-v1.mjs');
const { retainOriginalWrappedRecoverySectionV1, consumeOriginalWrappedRecoverySectionV1 } = await import('../wallet-platform/modules/native-claims/wrapped-recovery-authority-v1.mjs');
const ownedNativeClaimHandoffs = new WeakMap();
const code = error => /^FLAT_[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'FLAT_OWNER_OPERATION_FAILED';
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
function nativeClaimHandoff(value, bind) {
  const packet = frozen(ownerCopy(value)), capability = opaque({ select: () => frozen(ownerCopy(packet)),
    bindIssuance: input => {
      exactRecord(input, ['transactionHash', 'calldataSHA256']);
      return bind({ ...ownerCopy(input), handoffIdentitySHA256: packet.handoffIdentitySHA256 });
    } });
  ownedNativeClaimHandoffs.set(capability, packet); return capability;
}
/** Provenance of the real child-produced handoff only. Synthetic custody
 * fixtures and objects with a select() method cannot mint this private brand. */
export function assertOwnedWrappedClaimIngressHandoffV1(capability, expected = {}) {
  const packet = ownedNativeClaimHandoffs.get(capability);
  assert.ok(packet, 'FLAT_OWNER_OWNED_CLAIM_HANDOFF_REQUIRED');
  for (const key of Object.keys(expected)) {
    assert.ok(['claimDomain', 'ownerIdentitySHA256', 'ingressProverIdentity'].includes(key));
    assert.equal(packet[key], expected[key], 'FLAT_OWNER_CLAIM_HANDOFF_BINDING');
  }
}

/** Called only inside the fixed child. No private field tuples cross IPC and
 * no parent callback can replace the hash. Backend lifetime is one envelope. */
async function withPinnedOwnerHash(work) {
  assert.equal(process.argv[2], '--wrapped-claim-owner-child-v1'); assert.equal(typeof process.send, 'function');
  const helpers = await import(resourceModuleURL); helpers.verifyToolchain();
  const bb = await loadPinned('@aztec/bb.js'); inspectWrappedInstallationSourcesV2(); let backend;
  try {
    backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
      skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
    inspectWrappedInstallationSourcesV2();return await work(async fields => {
      assert.ok(Array.isArray(fields) && fields.length <= 137, 'FLAT_OWNER_HASH_TUPLE');
      const inputs = fields.map(value => { assert.ok(typeof value === 'bigint' && value >= 0n && value < FIELD_MODULUS);
        return Buffer.from(value.toString(16).padStart(64, '0'), 'hex'); });
      inspectWrappedInstallationSourcesV2();const result = Buffer.from((await backend.poseidon2Hash({ inputs })).hash).toString('hex');
      inspectWrappedInstallationSourcesV2();canonicalField(result); return result;
    });
  } finally { await backend?.destroy(); }
}

async function childMain() {
  inspectWrappedInstallationSourcesV2();assert.equal(process.argv.length, 3); assert.deepEqual(process.execArgv, []);
  assert.equal(ORIGINAL_WRAPPED_OWNER_CHILD_V1, true);assert.equal(realpathSync(process.argv[1]), FILE);
  assert.equal(typeof process.send, 'function');assert.ok(process.connected);
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
        inspectWrappedInstallationSourcesV2();custody = await openTrustedFlatOwnerCustody(message.config, {
          observer: { readSnapshot: () => host('readSnapshot'), readTransaction: input => host('readTransaction', input),
            readDepositIntentDelivery: input => host('readDepositIntentDelivery', input),
            readNativeClaimIntent: input => host('readNativeClaimIntent', input) },
          onCheckpoint: input => host('checkpoint', input), withHashFields: withPinnedOwnerHash });
        message.config.password = ''; inspectWrappedInstallationSourcesV2();await send({ type: 'ready' });
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
      if (message.method !== 'close') inspectWrappedInstallationSourcesV2();
      let result;
      if (message.method === 'proveDepositIntent') {
        assert.equal(message.input, null);
        // Ordinary D27 proving returns no opening or detached signature to the
        // keeper. The separate claim handoff explicitly discloses one opening;
        // only the fixed owner proof role receives the complete D27 witness.
        let job = await custody.depositIntentProofJob();
        if (job.proofResult) result = job.proofResult;
        else {
          inspectWrappedInstallationSourcesV2();proofClient = createRoleProofClient('owner');
          try {
            const proof = await proofClient.prove({ relation: 'deposit_intent', inputs: job.inputs,
              expectedPublicInputs: job.publicInputs });
            inspectWrappedInstallationSourcesV2();result = await custody.retainDepositIntentProof(proof);
          } finally { job = null; proofClient.close(); proofClient = null; }
        }
      } else if (message.method === 'proveAuthorization') {
        assert.equal(message.input, null);
        // The full graph stays in the owner child and its fixed owner proof
        // worker. Only public proof/metrics cross the keeper IPC boundary.
        let job = await custody.ownerProofJob(); inspectWrappedInstallationSourcesV2();proofClient = createRoleProofClient('owner');
        try { result = await proofClient.prove({ relation: 'authorization', inputs: job.inputs, expectedPublicInputs: job.publicInputs }); }
        finally { job = null; proofClient.close(); proofClient = null; }
      } else result = await custody[message.method](message.input);
      if (message.method !== 'close') inspectWrappedInstallationSourcesV2();
      await send({ type: 'result', id: message.id, ok: true, result }); }
    catch (error) { await send({ type: 'result', id: message.id, ok: false, code: code(error) }); }
    finally { busy = false; }
    if (message.method === 'close') stop();
  })().catch(stop); });
}

export function assertOwnedWrappedClaimOwnerProcessV1(capability, expected) {
  const value = ownedProcesses.get(capability); assert.ok(value && !value.closed(), 'WRAPPED_OWNER_OWNED_PROCESS_REQUIRED');
  value.assertSourceLive();assertOwnedWrappedClaimWalletSystemV1(value.runtime, value.system);
  if (expected) for (const key of Object.keys(expected)) { assert.ok(['runtime', 'system', 'poolIndex'].includes(key)); assert.equal(value[key], expected[key]); }
}

/** PRIVATE bootstrap. directory/password/checkpoint never come from a wallet
 * request. The caller durably retains each checkpoint before acknowledging it.
 * create=false requires the exact retained acknowledged or pending candidate. */
export async function createWrappedClaimOwnerProcessV1(input) {
  const delivery = false, claim = true;
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'directory', 'password', 'create', 'checkpoint', 'onCheckpoint',
    ...(delivery ? ['deliveryObserver'] : []), ...(claim ? ['nativeClaimObserver'] : [])]);
  const { runtime, system, poolIndex } = input;
  assertOwnedWrappedClaimWalletSystemV1(runtime, system); // Original artifact-bound owner before filesystem/child work.
  assert.equal(typeof input.onCheckpoint, 'function'); assert.equal(typeof input.create, 'boolean');
  assert.ok(typeof input.password === 'string' && input.password.length > 0);
  const directory = resolve(input.directory), info = await lstat(directory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, 'FLAT_OWNER_PRIVATE_DIRECTORY');
  const observer = await createFlatOwnerObserver({ runtime, system, poolIndex,
    ...(delivery ? { deliveryObserver: input.deliveryObserver } : {}) });
  // Optional private bootstrap capability. Its implementation must construct
  // and brand from the owned runtime and deployed gateway/code pins. A request
  // cannot install a callback, claim an observer brand, or provide a boolean.
  let nativeClaimObserver = null, assertNativeClaimObserver = null;
  if (claim) {
    let module;
    try { module = await import('./wrapped-claim-owner-claim-observer-v1.mjs'); }
    catch { throw failure('FLAT_OWNER_CLAIM_OBSERVER_REQUIRED'); }
    assertNativeClaimObserver = module.assertOwnedWrappedOwnerClaimObserverV1;
    assert.ok(typeof assertNativeClaimObserver === 'function', 'FLAT_OWNER_CLAIM_OBSERVER_REQUIRED');
    nativeClaimObserver = input.nativeClaimObserver;
    assertNativeClaimObserver(nativeClaimObserver, { runtime, system, poolIndex });
  }
  const onCheckpoint = input.onCheckpoint, initialCreate = input.create;
  let password = input.password, checkpoint = ownerCopy(input.checkpoint), child = null, pending = null,
    generation = 0, closed = false, lifecycle = false, hostBusy = false, capturing = false, checkpointStore = null, checkpointRecord=null, lifetimeHandle=null, retainedLineage = null;
  input = null;
  const processIdentitySHA256 = randomBytes(32).toString('hex');
  const identity = ownerCopy(observer.identity), poolArtifact = ownerCopy(observer.poolArtifact);
  let nextId = 1, hostId = 0, startupResolve, startupReject, exitResolve, ready = false, session;
  let exited = Promise.resolve(), lastExit = null, failed = null, terminationTimer = null, sourceFaulted = false;
  function assertOwnerSourceLiveV1() {
    assert.ok(!sourceFaulted, 'WRAPPED_OWNER_SOURCE_PERMANENTLY_FAULTED');
    try { inspectWrappedInstallationSourcesV2();assertOwnedWrappedClaimWalletSystemV1(runtime, system); }
    catch (error) { sourceFaulted = true;reject(error);throw error; }
  }
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
    assertOwnerSourceLiveV1();
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
    checkpoint = ownerCopy(next);
    const updated=await checkpointStore.update(checkpointRecord.revision,data=>{data.checkpoint=ownerCopy(next);return data;});
    const actual=await checkpointStore.read();assert.deepEqual(actual,updated,'FLAT_OWNER_PARENT_CHECKPOINT_READBACK');checkpointRecord=actual;
    await updateWrappedPrivateLifetimePartV1(lifetimeHandle,{directory,password,parentPath:join(directory,'wrapped-owner-parent-checkpoint-v1.vault'),checkpoint:ownerCopy(next)});
    await onCheckpoint(frozen(ownerCopy(next)));assertOwnerSourceLiveV1();
    return { retained: true };
  }
  async function start(create) {
    assertOwnerSourceLiveV1();
    assert.ok(!closed && (!child || child.exitCode !== null || child.signalCode !== null));
    assertOwnedFlatOwnerObserver(observer, { runtime, system, poolIndex });
    ready = false; failed = null; nextId = 1; hostId = 0; session = randomBytes(32).toString('hex'); generation++;
    const startup = new Promise((resolve, rejectStart) => { startupResolve = resolve; startupReject = rejectStart; }); startup.catch(() => {});
    exited = new Promise(resolve => { exitResolve = resolve; });
    const started = fork(FILE, ['--wrapped-claim-owner-child-v1'], { cwd: directory, env: { LANG: 'C.UTF-8', PATH: '/usr/bin:/bin' },
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
            assertOwnedFlatOwnerObserver(observer, { runtime, system, poolIndex });
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
          assertOwnerSourceLiveV1();await sendHere({ type: 'hostResult', id: message.id, ok: true, result });
        } catch (error) { await sendHere({ type: 'hostResult', id: message.id, ok: false, code: code(error) }); }
        finally { hostBusy = false; } return;
      }
      if (message.type === 'ready') { assertOwnerSourceLiveV1();assert.ok(!ready); ready = true; clearTimeout(timeout); startupResolve(); return; }
      if (message.type === 'startupFailure') throw failure(message.code);
      assert.equal(message.type, 'result'); assert.equal(message.id, pending?.id);
      if (pending.method !== 'close') assertOwnerSourceLiveV1();
      const request = pending; pending = null; clearTimeout(request.timer);
      if (message.ok) request.resolve(frozen(ownerCopy(message.result))); else request.reject(failure(message.code));
    })().catch(rejectHere); });
    started.once('exit', (exitCode, signal) => { clearTimeout(timeout); clearTimeout(terminationTimer); terminationTimer = null;
      ready = false; lastExit = { code: exitCode, signal };
      if (pending) { clearTimeout(pending.timer); pending.reject(failure('FLAT_OWNER_CHILD_EXIT')); pending = null; }
      startupReject(failure('FLAT_OWNER_CHILD_EXIT')); exitResolve(); });
    await send({ type: 'boot', config: { path: join(directory, 'wrapped-claim-owner-v1.vault'), password, identity, poolArtifact,
      create, checkpoint } });
    try { await startup; } catch (error) { await exited; throw error; }
  }
  async function request(method, value = null) {
    if (method !== 'close') { assertOwnerSourceLiveV1(); assert.ok(!capturing && !lifecycle, 'FLAT_OWNER_LIFECYCLE_BUSY'); }
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
  const owner = opaque(Object.fromEntries(OWNER.map(method => [method, method === 'createNativeClaimIngressHandoff'
    ? async input => nativeClaimHandoff(await request(method, input), value => request('bindNativeClaimIssuance', value))
      : input => request(method, input ?? null)])));
  function assertRetainedCheckpoint(expected){
    assert.ok(!closed&&!capturing&&!lifecycle&&!pending&&!hostBusy&&!failed&&ready&&!sourceFaulted,'FLAT_OWNER_RETAINED_PARENT_NOT_IDLE');
    assert.ok(checkpoint&&checkpoint.pending===null,'FLAT_OWNER_RETAINED_CHECKPOINT_UNCERTAIN');
    assert.deepEqual(expected,checkpoint.acknowledged,'FLAT_OWNER_RETAINED_CHECKPOINT_CHANGED');
    assertWrappedPrivateLifetimePartSealedV1(lifetimeHandle);return true;
  }
  const ownerProof = opaque({ assertRetainedCheckpoint, deposit: () => request('depositWitness'), proveAuthorization: () => request('proveAuthorization'),
    proveDepositIntent: () => request('proveDepositIntent'),
    withdrawal: role => request('withdrawalWitness', { role }),retainedWithdrawal:async role=>{
      const retained=await request('retainedWithdrawalWitness',{role});
      assert.ok(checkpoint&&checkpoint.pending===null,'FLAT_OWNER_RETAINED_CHECKPOINT_UNCERTAIN');
      assert.deepEqual(retained.checkpoint,checkpoint.acknowledged,'FLAT_OWNER_RETAINED_CHECKPOINT_CHANGED');
      const current=await readWrappedPrivateLifetimePartV1(runtime,'owner-'+poolIndex,parentIdentity);
      assert.equal(ownerDigest(current.privateState.checkpoint),ownerDigest(checkpoint),'FLAT_OWNER_RETAINED_REGISTRY_CHANGED');
      assertRetainedCheckpoint(retained.checkpoint);return retained;
    },retainedWithdrawalSubmission:async role=>{
      const retained=await request('retainedWithdrawalSubmissionWitness',{role});
      assert.ok(checkpoint&&checkpoint.pending===null,'FLAT_OWNER_RETAINED_CHECKPOINT_UNCERTAIN');
      assert.deepEqual(retained.checkpoint,checkpoint.acknowledged,'FLAT_OWNER_RETAINED_CHECKPOINT_CHANGED');
      const current=await readWrappedPrivateLifetimePartV1(runtime,'owner-'+poolIndex,parentIdentity);
      assert.equal(ownerDigest(current.privateState.checkpoint),ownerDigest(checkpoint),'FLAT_OWNER_RETAINED_REGISTRY_CHANGED');
      assertRetainedCheckpoint(retained.checkpoint);return retained;
    } });
  const roles = opaque({ reservation: async () => scoped(await request('selectRole', { role: 'reservation' })),
    recovery: async () => scoped(await request('selectRole', { role: 'recovery' })),
    assembler: async () => scoped(await request('selectRole', { role: 'assembler' })),
    local: async slot => scoped(await request('selectRole', { role: 'local', slot })),
    dependency: async slot => scoped(await request('selectRole', { role: 'dependency', slot })) });
  const capability = opaque({ owner, ownerProof, roles,
    ownerView: opaque({ summary: () => request('privateSummary'),
      preparationTerms: input => request('preparationTerms', input),
      manualPreparations: () => request('manualPreparations'),
      graphPreparationTerms: () => request('graphPreparationTerms') }),
    publicView: opaque({ summary: () => request('summary') }),
    report: () => ({ profile: FLAT_OWNER_PROFILE, processIdentitySHA256, generation, closed, available: ready && !failed && !sourceFaulted,
      childExited: !child || child.exitCode !== null || child.signalCode !== null, exit: ownerCopy(lastExit),
      childRestart: true, keeperRestart: false }),
    suspend: async () => { assert.ok(!capturing && !lifecycle && !closed && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { await stopChild(); return { suspended: true, childExited: true }; } finally { lifecycle = false; } },
    restart: async () => { assert.ok(!capturing && !lifecycle && !closed && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { await stopChild(); retainedLineage=null; await start(false); return { available: true, generation }; } finally { lifecycle = false; } },
    close: async () => { assert.ok(!capturing && !lifecycle && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { if (!closed) await stopChild(); closed = true; password = null; checkpointStore?.close(); return { closed: true, childExited: true }; } finally { lifecycle = false; } },
  });
  const parentIdentity={profile:'WRAPPED_OWNER_PARENT_CHECKPOINT_V1',identity:ownerCopy(identity)},parentPath=join(directory,'wrapped-owner-parent-checkpoint-v1.vault');
  const lifetimeState={directory,password,parentPath,checkpoint:ownerCopy(checkpoint)};
  if(initialCreate)lifetimeHandle=await retainWrappedPrivateLifetimePartV1(runtime,'owner-'+poolIndex,parentIdentity,lifetimeState);
  else{const retained=await readWrappedPrivateLifetimePartV1(runtime,'owner-'+poolIndex,parentIdentity);assert.equal(ownerDigest(retained.privateState),ownerDigest(lifetimeState),'FLAT_OWNER_ORIGINAL_LIFETIME_CHANGED');lifetimeHandle=retained.handle;}
  checkpointStore=initialCreate?await createClaimRecordStore({path:parentPath,password,identity:parentIdentity},{checkpoint:ownerCopy(checkpoint)}):await openClaimRecordStore({path:parentPath,password,identity:parentIdentity});
  try{checkpointRecord=await checkpointStore.read();assert.deepEqual(checkpointRecord.data.checkpoint,checkpoint,'FLAT_OWNER_PARENT_CHECKPOINT_CHANGED');await start(initialCreate);}catch(error){checkpointStore.close();password=null;throw error;}
  ownedProcesses.set(capability, { runtime, system, poolIndex, closed: () => closed, assertSourceLive: assertOwnerSourceLiveV1,
    beginCapture() {
      assertOwnerSourceLiveV1();
      assert.ok(!capturing && !lifecycle && !closed && !pending && !hostBusy && ready && !failed, 'FLAT_OWNER_LIFECYCLE_BUSY');
      capturing = true;
    },
    async capture() {
      assert.ok(capturing && !closed && checkpoint, 'FLAT_OWNER_ORIGINAL_CAPTURE_REQUIRED');
      const parentIdentity = { profile: 'WRAPPED_OWNER_PARENT_CHECKPOINT_V1', identity: ownerCopy(identity) };
      const parentPath = join(directory, 'wrapped-owner-parent-checkpoint-v1.vault');
      const store = checkpointStore??await createClaimRecordStore({path:parentPath,password,identity:parentIdentity}, {checkpoint:ownerCopy(checkpoint)});
      try {
        const record = await store.read();assert.deepEqual(record.data.checkpoint,checkpoint,'FLAT_OWNER_PARENT_CHECKPOINT_CHANGED');
        const originalLifetimes=[...(retainedLineage?.originals??[]),{processIdentitySHA256,generation}];assert.ok(originalLifetimes.length<=64,'FLAT_OWNER_RECOVERY_GENERATION_LIMIT');
        return {poolIndex,directory,password,checkpoint:ownerCopy(checkpoint),identity:ownerCopy(identity),
          originalProcessIdentitySHA256:processIdentitySHA256,originalGeneration:generation,originalLifetimes,parentPath,parentIdentity,
          parentCheckpoint:{revision:record.revision,commitment:record.commitment}};
      } finally { if(store!==checkpointStore)store.close(); }
    },
    async stopCaptured() {
      assert.ok(capturing && !pending && !hostBusy, 'FLAT_OWNER_ORIGINAL_CAPTURE_REQUIRED');
      try { await stopChild(); }
      finally { closed = true; password = null; checkpointStore?.close(); }
      assert.ok(lastExit && (lastExit.code === 0 || lastExit.signal === 'SIGTERM') && lastExit.signal !== 'SIGKILL', 'FLAT_OWNER_ORIGINAL_STOP_UNCERTAIN');
    },
    assertOriginalLifetime(expected) {
      assertOwnerSourceLiveV1();assert.ok(!closed&&!capturing,'FLAT_OWNER_ORIGINAL_LIFETIME_CLOSED');
      const current={processIdentitySHA256,generation};
      assert.ok(ownerDigest(current)===ownerDigest(expected)||retainedLineage&&generation===retainedLineage.reopenedGeneration&&retainedLineage.originals.some(original=>ownerDigest(original)===ownerDigest(expected)),'FLAT_OWNER_ORIGINAL_LIFETIME_CHANGED');
    },
    attachCheckpointStore(store) { assert.equal(checkpointStore,null); checkpointStore=store; },
    verifyReopened(retained) {
      assert.deepEqual(identity,retained.identity,'FLAT_OWNER_ORIGINAL_REOPEN_IDENTITY');
      assert.notEqual(processIdentitySHA256,retained.originalProcessIdentitySHA256,'FLAT_OWNER_ORIGINAL_PROCESS_NOT_REPLACED');
      assert.ok(Number.isSafeInteger(retained.originalGeneration)&&retained.originalGeneration>0);
      assert.ok(Array.isArray(retained.originalLifetimes)&&retained.originalLifetimes.length>0&&retained.originalLifetimes.length<=64);
      for(const original of retained.originalLifetimes){exactRecord(original,['processIdentitySHA256','generation']);assert.match(original.processIdentitySHA256,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(original.generation)&&original.generation>0);}
      assert.deepEqual(retained.originalLifetimes.at(-1),{processIdentitySHA256:retained.originalProcessIdentitySHA256,generation:retained.originalGeneration});
      retainedLineage={originals:ownerCopy(retained.originalLifetimes),reopenedGeneration:generation};
    },
  }); return capability;
}

/** Private authenticated lineage assertion. The current child keeps its real
 * process identity. This proves original obligation provenance only, never
 * renews spend/sign consent. Ordinary later restart invalidates this bridge. */
export function assertWrappedClaimOwnerOriginalLifetimeV1(owner,expected){
  exactRecord(expected,['processIdentitySHA256','generation']);
  const state=ownedProcesses.get(owner);assert.ok(state,'FLAT_OWNER_ORIGINAL_PROCESS_REQUIRED');state.assertOriginalLifetime(expected);
}
/** Private fixed-pair capture. Fence both owners synchronously before touching
 * storage; preserve every pending checkpoint and never export owner material. */
export async function retainWrappedClaimOwnersForReopenV1(input) {
  exactRecord(input,['owners','attemptAuthority']);
  assert.ok(Array.isArray(input.owners) && input.owners.length === 2 && input.owners[0] !== input.owners[1]);
  const states=input.owners.map((owner,poolIndex)=>{
    const state=ownedProcesses.get(owner);assert.ok(state && state.poolIndex===poolIndex,'FLAT_OWNER_ORIGINAL_PAIR_REQUIRED');return state;
  });
  assert.equal(states[0].runtime,states[1].runtime);assert.equal(states[0].system,states[1].system);
  const fenced=[];
  try {
    for(const state of states){state.beginCapture();fenced.push(state);}
    const owners=[];for(const state of states) owners.push(await state.capture());
    await retainOriginalWrappedRecoverySectionV1(input.attemptAuthority,'owners',{schema:'WRAPPED_ORIGINAL_OWNER_PAIR_V1',owners});
  } catch(error) {
    const cleanup=await Promise.allSettled(fenced.map(state=>state.stopCaptured()));
    const failed=cleanup.filter(row=>row.status==='rejected').map(row=>row.reason);
    if(failed.length)throw new AggregateError([error,...failed],'FLAT_OWNER_CAPTURE_AND_STOP_FAILED',{cause:error});
    throw error;
  }
  const stopped=await Promise.allSettled(states.map(state=>state.stopCaptured()));
  const failed=stopped.filter(row=>row.status==='rejected').map(row=>row.reason);
  if(failed.length)throw new AggregateError(failed,'FLAT_OWNER_CAPTURE_STOP_FAILED');
  return {retained:true,originalResourcesStopped:true};
}
export async function reopenWrappedClaimOwnersV1(input) {
  exactRecord(input,['runtime','system','nativeClaimObservers','attemptAuthority']);
  assertOwnedWrappedClaimWalletSystemV1(input.runtime,input.system);
  assert.ok(Array.isArray(input.nativeClaimObservers)&&input.nativeClaimObservers.length===2);
  const retained=consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority,'owners');
  exactRecord(retained,['schema','owners']);assert.equal(retained.schema,'WRAPPED_ORIGINAL_OWNER_PAIR_V1');
  assert.ok(Array.isArray(retained.owners)&&retained.owners.length===2);
  const owners=[];
  try {
    for(let poolIndex=0;poolIndex<2;poolIndex++) {
      const row=retained.owners[poolIndex];
      exactRecord(row,['poolIndex','directory','password','checkpoint','identity','originalProcessIdentitySHA256','originalGeneration','originalLifetimes','parentPath','parentIdentity','parentCheckpoint']);
      assert.equal(row.poolIndex,poolIndex);assert.equal(row.parentPath,join(row.directory,'wrapped-owner-parent-checkpoint-v1.vault'));
      const store=await openClaimRecordStore({path:row.parentPath,password:row.password,identity:row.parentIdentity});
      let owner;
      try {
        let record=await store.read();
        assert.deepEqual({revision:record.revision,commitment:record.commitment},row.parentCheckpoint,'FLAT_OWNER_PARENT_CHECKPOINT_CHANGED');
        assert.deepEqual(record.data.checkpoint,row.checkpoint,'FLAT_OWNER_PARENT_CHECKPOINT_CHANGED');
        owner=await createWrappedClaimOwnerProcessV1({runtime:input.runtime,system:input.system,poolIndex,directory:row.directory,
          password:row.password,create:false,checkpoint:ownerCopy(record.data.checkpoint),nativeClaimObserver:input.nativeClaimObservers[poolIndex],
          onCheckpoint:async()=>{}});
        store.close();owners.push(owner);
        ownedProcesses.get(owner).verifyReopened(row);
      } catch(error) { if(!owner)store.close();throw error; }
    }
    return Object.freeze(owners);
  } catch(error) {
    const stopped=await Promise.allSettled(owners.map(owner=>owner.close()));
    const failed=stopped.filter(row=>row.status==='rejected').map(row=>row.reason);
    if(failed.length)throw new AggregateError([error,...failed],'FLAT_OWNER_REOPEN_AND_STOP_FAILED',{cause:error});
    throw error;
  }
}

if (ORIGINAL_WRAPPED_OWNER_CHILD_V1)
  await childMain();
