/** Separately versioned native-value graph-only wallet binding. Historical flat modules remain unchanged. */
/** One fixed owner child and surviving private keeper for local fake values.
 * The keeper retains the password/checkpoint, and is trusted on the common OS.
 * This is process separation, not a hostile-host enclave or general keystore. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { Vault } from '../../../engine/src/crypto/vault.mjs';
import { nativeValueOriginalRecoverySourceV1 } from '../../../backend/src/operations/deployments/native-value/native-value-system-v2.mjs';
import { assertNativeEconomicRecoveryCaptureV1, nativeEconomicRecoverySectionIdentityV1, consumeNativeEconomicRecoverySectionV1 }
  from '../../../backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
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
export async function createNativeValueOwnerProcess(input) { return createOriginalOwnerProcess(input); }
async function createOriginalOwnerProcess(input, recovery = null) {
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
  const processIdentitySHA256 = recovery?.processIdentitySHA256 ?? randomBytes(32).toString('hex');
  let password = input.password, checkpoint = ownerCopy(input.checkpoint), child = null, pending = null,
    generation = recovery?.generation ?? 0, closed = false, lifecycle = false, hostBusy = false;
  let capturing = false, captureStarted = false, captureIdentity = null, captured = null, captureStopping = false;
  const parentVault = new Vault(join(directory, 'native-owner-parent-checkpoint.vault'));
  let parentRecord = recovery ? await parentVault.read(password) : null;
  if (recovery) {
    assert.equal(ownerDigest(parentRecord), recovery.parentCheckpointSHA256, 'NATIVE_OWNER_PARENT_CHECKPOINT_CHANGED');
    assert.deepEqual(parentRecord.data, { version: 1, identitySHA256: ownerDigest(observer.identity), processIdentitySHA256, checkpoint });
  }
  input = null;
  const identity = ownerCopy(observer.identity), poolArtifact = ownerCopy(observer.poolArtifact);
  let nextId = 1, hostId = 0, startupResolve, startupReject, exitResolve, ready = false, session;
  let exited = Promise.resolve(), childClosed = Promise.resolve(), closeResolve, lastExit = null, failed = null, terminationTimer = null;
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
    checkpoint = ownerCopy(next);
    if (parentRecord !== null) {
      assert.deepEqual(await parentVault.read(password), parentRecord, 'NATIVE_OWNER_PARENT_STORAGE_CHANGED');
      const retained = await parentVault.update(password, parentRecord.revision, data => ({ ...data, checkpoint: ownerCopy(next) }));
      assert.deepEqual(await parentVault.read(password), retained, 'NATIVE_OWNER_PARENT_STORAGE_CHANGED'); parentRecord = retained;
    }
    await onCheckpoint(frozen(ownerCopy(next)));
    return { retained: true };
  }
  async function start(create) {
    assert.ok(!closed && (!child || child.exitCode !== null || child.signalCode !== null));
    assertOwnedNativeValueOwnerObserver(observer, { runtime, system, poolIndex });
    ready = false; failed = null; nextId = 1; hostId = 0; session = randomBytes(32).toString('hex'); generation++; assert.ok(Number.isSafeInteger(generation) && generation > 0, 'NATIVE_OWNER_GENERATION_LIMIT');
    const startup = new Promise((resolve, rejectStart) => { startupResolve = resolve; startupReject = rejectStart; }); startup.catch(() => {});
    exited = new Promise(resolve => { exitResolve = resolve; });
    childClosed = new Promise(resolve => { closeResolve = resolve; });
    const started = fork(FILE, ['--native-value-owner-child-v2'], { cwd: directory, env: { LANG: 'C.UTF-8', PATH: '/usr/bin:/bin' },
      execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'json', windowsHide: true }); child = started;
    const startedSession = session;
    const closeOriginal = closeResolve; started.once('close', closeOriginal);
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
    if (!captureStopping) assertOwnedNativeValueWalletSystem(runtime, system);
    assert.ok(!closed && (!capturing || (captureStopping && method === 'close')) && ready && !failed && !pending && !hostBusy, 'FLAT_OWNER_BUSY_OR_UNAVAILABLE');
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
    report: () => ({ profile: 'OWNED_NATIVE_VALUE_OWNER_PROCESS_V2', custodyProfile: NATIVE_VALUE_OWNER_PROFILE, generation, closed, available: ready && !failed && !capturing,
      childExited: !child || child.exitCode !== null || child.signalCode !== null, exit: ownerCopy(lastExit),
      childRestart: true, keeperRestart: false }),
    suspend: async () => { assert.ok(!capturing && !lifecycle && !closed && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { await stopChild(); return { suspended: true, childExited: true }; } finally { lifecycle = false; } },
    restart: async () => { assert.ok(!capturing && !lifecycle && !closed && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { await stopChild(); await start(false); return { available: true, generation }; } finally { lifecycle = false; } },
    close: async () => { assert.ok((!capturing || closed) && !lifecycle && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { if (!closed) await stopChild(); closed = true; password = null; return { closed: true, childExited: true }; } finally { lifecycle = false; } },
  });
  async function encryptedOwnerHash() {
    const path = join(directory, 'native-value-owner-v2.vault'), info = await lstat(path);
    assert.ok(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0 && info.size <= LIMIT, 'NATIVE_OWNER_ORIGINAL_VAULT_REQUIRED');
    const bytes = await readFile(path);
    try { assert.equal(bytes.length, info.size); return createHash('sha256').update(bytes).digest('hex'); }
    finally { bytes.fill(0); }
  }
  const privateState = { runtime, system, poolIndex, closed: () => closed || capturing,
    identity() { assert.ok(!closed && !capturing); return frozen({ identitySHA256: ownerDigest(identity), processIdentitySHA256, generation }); },
    fence(authority) {
      const admitted = assertNativeEconomicRecoveryCaptureV1(authority);
      assertOwnedNativeValueWalletSystem(runtime, system);
      assert.equal(nativeValueOriginalRecoverySourceV1(runtime, system), admitted.sourceSHA256, 'NATIVE_OWNER_ORIGINAL_SOURCE_CHANGED');
      assert.ok(!closed && !capturing && !lifecycle && !pending && !hostBusy && ready && !failed, 'NATIVE_OWNER_CAPTURE_IDLE_REQUIRED');
      assert.ok(checkpoint !== null, 'NATIVE_OWNER_ORIGINAL_CHECKPOINT_REQUIRED');
      captureIdentity = admitted; capturing = true; // synchronous, before any asynchronous snapshot
    },
    async capture(token) {
      const admitted = nativeEconomicRecoverySectionIdentityV1(token, 'owner');
      assert.ok(capturing && !closed && !captureStarted, 'NATIVE_OWNER_ORIGINAL_CAPTURE_REQUIRED');
      assert.deepEqual(admitted, captureIdentity); captureStarted = true;
      if (parentRecord === null) parentRecord = await parentVault.create({ version: 1, identitySHA256: ownerDigest(identity),
        processIdentitySHA256, checkpoint: ownerCopy(checkpoint) }, password);
      assert.deepEqual(await parentVault.read(password), parentRecord, 'NATIVE_OWNER_PARENT_STORAGE_CHANGED');
      assert.deepEqual(parentRecord.data.checkpoint, checkpoint);
      captured = { schema: 'ORIGINAL_NATIVE_OWNER_ECONOMIC_RECOVERY_V1', sourceSHA256: admitted.sourceSHA256,
        poolIndex, directory, password, processIdentitySHA256, generation, identitySHA256: ownerDigest(identity),
        checkpoint: ownerCopy(checkpoint), parentCheckpointSHA256: ownerDigest(parentRecord), ownerVaultSHA256: await encryptedOwnerHash() };
      return ownerCopy(captured); // delivered only to the issuer's private encrypted owner section
    },
    async stop(token) {
      assert.deepEqual(nativeEconomicRecoverySectionIdentityV1(token, 'owner'), captureIdentity);
      assert.ok(capturing && captured && !closed && !pending && !hostBusy && !lifecycle, 'NATIVE_OWNER_CAPTURE_OWNS_LIFETIME');
      captureStopping = true;
      try {
        await stopChild(); await childClosed;
        assert.deepEqual(lastExit, { code: 0, signal: null }, 'NATIVE_OWNER_ORIGINAL_CLOSE_UNCONFIRMED');
        assert.equal(child.connected, false, 'NATIVE_OWNER_ORIGINAL_IPC_OPEN');
        assert.equal(await encryptedOwnerHash(), captured.ownerVaultSHA256, 'NATIVE_OWNER_ORIGINAL_VAULT_CHANGED');
        assert.equal(ownerDigest(await parentVault.read(password)), captured.parentCheckpointSHA256, 'NATIVE_OWNER_PARENT_STORAGE_CHANGED');
        closed = true; password = null; checkpoint = null; parentRecord = null; captured = null;
        return { closed: true, originalResourcesStopped: true };
      } finally { captureStopping = false; }
    },
    async abort(token) {
      assert.deepEqual(nativeEconomicRecoverySectionIdentityV1(token, 'owner'), captureIdentity);
      captureStopping = true;
      try { await stopChild(); await childClosed; closed = true; password = null; return { closed: true, originalResourcesStopped: true }; }
      finally { captureStopping = false; }
    },
  };
  try { await start(initialCreate); }
  catch (error) { await stopChild(); await childClosed; closed = true; password = null; throw error; }
  ownedProcesses.set(capability, privateState); return capability;
}

/** Private native producer only: no path, checkpoint, key or callback supplied
 * by a wallet request can mint this owner lifetime. */
export function nativeValueOwnerEconomicIdentityV1(owner, expected) {
  assert.equal(arguments.length, 2); assertOwnedNativeValueOwnerProcess(owner, expected);
  return ownedProcesses.get(owner).identity();
}
export function fenceOriginalNativeOwnerEconomicRecoveryV1(owner, authority) {
  assert.equal(arguments.length, 2); const state = ownedProcesses.get(owner);
  assert.ok(state, 'NATIVE_OWNER_ORIGINAL_PROCESS_REQUIRED'); return state.fence(authority);
}
export function captureOriginalNativeOwnerEconomicRecoveryV1(owner, token) {
  assert.equal(arguments.length, 2); const state = ownedProcesses.get(owner);
  assert.ok(state, 'NATIVE_OWNER_ORIGINAL_PROCESS_REQUIRED'); return state.capture(token);
}
export function stopCapturedNativeOwnerEconomicRecoveryV1(owner, token) {
  assert.equal(arguments.length, 2); const state = ownedProcesses.get(owner);
  assert.ok(state, 'NATIVE_OWNER_ORIGINAL_PROCESS_REQUIRED'); return state.stop(token);
}
export function abortNativeOwnerEconomicRecoveryV1(owner, token) {
  assert.equal(arguments.length, 2); const state = ownedProcesses.get(owner);
  assert.ok(state, 'NATIVE_OWNER_ORIGINAL_PROCESS_REQUIRED'); return state.abort(token);
}
export async function reopenOriginalNativeOwnerEconomicRecoveryV1(token, contexts) {
  assert.equal(arguments.length, 2); exactRecord(contexts, ['runtime', 'system']);
  const admitted = nativeEconomicRecoverySectionIdentityV1(token, 'owner');
  assert.equal(nativeValueOriginalRecoverySourceV1(contexts.runtime, contexts.system), admitted.sourceSHA256);
  const retained = consumeNativeEconomicRecoverySectionV1(token, 'owner');
  exactRecord(retained, ['schema', 'sourceSHA256', 'poolIndex', 'directory', 'password', 'processIdentitySHA256',
    'generation', 'identitySHA256', 'checkpoint', 'parentCheckpointSHA256', 'ownerVaultSHA256']);
  assert.equal(retained.schema, 'ORIGINAL_NATIVE_OWNER_ECONOMIC_RECOVERY_V1');
  assert.equal(retained.sourceSHA256, admitted.sourceSHA256);
  assert.ok(Number.isSafeInteger(retained.generation) && retained.generation > 0 && retained.generation < Number.MAX_SAFE_INTEGER);
  assert.match(retained.processIdentitySHA256, /^[0-9a-f]{64}$/);
  const path = join(retained.directory, 'native-value-owner-v2.vault'), info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0 && info.size <= LIMIT);
  const bytes = await readFile(path);
  try { assert.equal(createHash('sha256').update(bytes).digest('hex'), retained.ownerVaultSHA256, 'NATIVE_OWNER_ORIGINAL_VAULT_CHANGED'); }
  finally { bytes.fill(0); }
  const owner = await createOriginalOwnerProcess({ ...contexts, poolIndex: retained.poolIndex, directory: retained.directory,
    password: retained.password, create: false, checkpoint: retained.checkpoint, onCheckpoint: async () => {} }, retained);
  try { assert.equal(nativeValueOwnerEconomicIdentityV1(owner, { ...contexts, poolIndex: retained.poolIndex }).identitySHA256, retained.identitySHA256); return owner; }
  catch (error) { await owner.close(); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === FILE && process.argv[2] === '--native-value-owner-child-v2')
  await childMain();
