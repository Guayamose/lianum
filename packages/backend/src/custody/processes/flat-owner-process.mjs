/** One fixed owner child and surviving private keeper for local fake values.
 * The keeper retains the password/checkpoint, and is trusted on the common OS.
 * This is process separation, not a hostile-host enclave or general keystore. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openTrustedFlatOwnerCustody, ownerCopy, ownerDigest, FLAT_OWNER_PROFILE,FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_V2,FLAT_OWNER_PRIVATE_CLAIM_TRUST_V2 } from '@lianum/custody/owner';
import { createFlatOwnerObserver, assertOwnedFlatOwnerObserver } from '../observers/flat-owner-observer.mjs';
import { exactRecord, FIELD_MODULUS, canonicalField } from '@lianum/components/encoding/commitments';
import { loadPinned, resourceModuleURL } from '@lianum/proofs/tooling/tooling';
import { createRoleProofClient } from '@lianum/backend/proving/roles/role-client';
import { LIMITS } from '@lianum/proofs/catalog';
import {claimReceiptSecret,claimRefundSalt} from '@lianum/engine/claims/framing';
import {buildClaimIngressInputs} from '@lianum/engine/claims/inputs';
import {sealPrivateProofJobV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';

import {retainWrappedPrivateLifetimePartV1,readWrappedPrivateLifetimePartV1,updateWrappedPrivateLifetimePartV1,assertWrappedPrivateLifetimePartSealedV1,assertWrappedPrivateLifetimeAttemptV1} from '../../claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs';
import {retainOriginalWrappedRecoverySectionV1,consumeOriginalWrappedRecoverySectionV1,originalWrappedRecoverySectionIdentityV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';

const FILE = fileURLToPath(import.meta.url), PROTOCOL = 'FLAT_OWNER_PRIVATE_IPC_V1', LIMIT = 2 * 1024 * 1024;
const OWNER = ['reauthorizeManualPreparation', 'prepareManualPreparation', 'prepareDeposit', 'prepareDepositIntent', 'bindDepositIntentDelivery', 'reconcileDepositIntent',
  'createNativeClaimIngressHandoff', 'createPrivateNativeClaimIngressHandoffV2', 'renewNativeClaimDepositIntent',
  'prepareAuthorization', 'invoiceRequests', 'authorize', 'prepareWithdrawal',
  'renewEpoch', 'bindSubmission', 'acknowledgeSubmitted', 'reconcile', 'reconcileCompetingReservation', 'reconcileRecovery'];
const PROOF = ['depositWitness', 'withdrawalWitness', 'proveAuthorization', 'proveDepositIntent'];
const plane = method => OWNER.includes(method) ? 'owner' : PROOF.includes(method) ? 'ownerProof'
  : ['bindNativeClaimIssuance','preparePrivateNativeClaimIngressProofV2','sealPrivateNativeClaimIngressProofV2'].includes(method) ? 'claimIngress'
    : method === 'selectRole' ? 'role' : ['privateSummary', 'preparationTerms', 'manualPreparations', 'graphPreparationTerms'].includes(method) ? 'ownerView' : ['summary', 'close'].includes(method) ? 'lifecycle' : null;
const ownedProcesses = new WeakMap();
const ownedNativeClaimHandoffs = new WeakMap(),ownedPrivateNativeClaimHandoffsV2=new WeakMap();
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
export function assertOwnedNativeClaimIngressHandoff(capability, expected = {}) {
  const packet = ownedNativeClaimHandoffs.get(capability);
  assert.ok(packet, 'FLAT_OWNER_OWNED_CLAIM_HANDOFF_REQUIRED');
  for (const key of Object.keys(expected)) {
    assert.ok(['claimDomain', 'ownerIdentitySHA256', 'ingressProverIdentity'].includes(key));
    assert.equal(packet[key], expected[key], 'FLAT_OWNER_CLAIM_HANDOFF_BINDING');
  }
}


// Minted only from the fixed child response below. The controller cannot mint
// this brand by copying the public packet or substituting a proof callback.
function privateNativeClaimHandoffV2(value,request) {
  const packet=frozen(ownerCopy(value));let prepared=false,sealed=false;
  assert.equal(packet.profile,FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_V2,'FLAT_OWNER_PRIVATE_CLAIM_PROFILE');
  const capability=opaque({select(){assert.equal(arguments.length,0,'FLAT_OWNER_PRIVATE_CI51_ARITY');return frozen(ownerCopy(packet));},
    prepareProof(common){assert.equal(arguments.length,1,'FLAT_OWNER_PRIVATE_CI51_ARITY');assert.equal(prepared,false,'FLAT_OWNER_PRIVATE_CI51_ONE_PREPARATION');prepared=true;return request('preparePrivateNativeClaimIngressProofV2',{packet,common});},
    sealProof(recipient){assert.equal(arguments.length,1,'FLAT_OWNER_PRIVATE_CI51_ARITY');assert.ok(prepared&&!sealed,'FLAT_OWNER_PRIVATE_CI51_PREPARATION_REQUIRED');sealed=true;return request('sealPrivateNativeClaimIngressProofV2',{handoffIdentitySHA256:packet.handoffIdentitySHA256,recipient});}});
  ownedPrivateNativeClaimHandoffsV2.set(capability,packet);return capability;
}
export function assertOwnedPrivateNativeClaimIngressHandoffV2(capability,expected={}) {
  assert.ok([1,2].includes(arguments.length),'FLAT_OWNER_PRIVATE_CI51_ARITY');
  const packet=ownedPrivateNativeClaimHandoffsV2.get(capability);assert.ok(packet,'FLAT_OWNER_ORIGINAL_PRIVATE_CLAIM_HANDOFF_REQUIRED');
  for(const key of Object.keys(expected)){assert.ok(['claimDomain','ownerIdentitySHA256','ingressProverIdentity'].includes(key));assert.equal(packet[key],expected[key],'FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_BINDING');}
}
// Runs inside the original holder child, never a wallet/API parent. A scoped
// receipt secret is not the opening or spend key; it still stays private DATA.
function privateClaimPacketV2(legacy) {
  const {opening,handoffIdentitySHA256,...body}=ownerCopy(legacy);
  try {
    const input={claimDomain:body.claimDomain,noteSecret:opening.noteSecret,outputQ:body.statement.output};
    const packet={...body,version:2,profile:FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_V2,trust:FLAT_OWNER_PRIVATE_CLAIM_TRUST_V2,
      receiptBinding:{secret:claimReceiptSecret(input),refundSalt:claimRefundSalt(input)}};
    input.noteSecret=null;return {...packet,handoffIdentitySHA256:ownerDigest(packet)};
  } finally {wipePrivateProofInputsV1(opening);}
}

/** Called only inside the fixed child. No private field tuples cross IPC and
 * no parent callback can replace the hash. Backend lifetime is one envelope. */
async function withPinnedOwnerHash(work) {
  assert.equal(process.argv[2], '--flat-owner-child'); assert.equal(typeof process.send, 'function');
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
  let session = null, custody, busy = false, stopped = false, next = 1, sequence = 0, pendingHost = null, proofClient = null,privateClaimJob=null,privateClaimPrepared=false;
  const send = value => new Promise((resolve, reject) => process.send(bounded({ protocol: PROTOCOL, session, ...value }), error => error ? reject(error) : resolve()));
  async function host(method, input = null) {
    assert.ok(!pendingHost && !stopped); const id = ++sequence;
    const result = new Promise((resolve, reject) => { pendingHost = { id, resolve, reject }; }); result.catch(() => {});
    await send({ type: 'host', id, method, input }); return result;
  }
  function stop() { if (stopped) return; stopped = true;wipePrivateProofInputsV1(privateClaimJob?.inputs);privateClaimJob=null; proofClient?.stop(); try { custody?.close(); } catch {} custody = null;
    pendingHost?.reject(failure('FLAT_OWNER_PARENT_LOST')); pendingHost = null; if (process.connected) process.disconnect(); }
  process.on('disconnect', stop);
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  process.once('exit', () => { proofClient?.stop(); });
  process.on('message', raw => { void (async () => {
    const message = bounded(raw); assert.equal(message.protocol, PROTOCOL);
    if (message.type === 'boot') {
      assert.ok(!session && !busy); session = message.session; busy = true;
      try {
        custody = await openTrustedFlatOwnerCustody(message.config, {
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
      if(message.method==='createPrivateNativeClaimIngressHandoffV2') {
        const legacy=await custody.createNativeClaimIngressHandoff(message.input);
        try{result=privateClaimPacketV2(legacy);}finally{wipePrivateProofInputsV1(legacy);}
      } else if(message.method==='preparePrivateNativeClaimIngressProofV2') {
        exactRecord(message.input,['packet','common']);assert.equal(privateClaimPrepared,false,'FLAT_OWNER_PRIVATE_CI51_ONE_PREPARATION');privateClaimPrepared=true;assert.equal(privateClaimJob,null,'FLAT_OWNER_PRIVATE_CI51_ONE_PREPARATION');
        const p=message.input.packet;assert.equal(p.profile,FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_V2,'FLAT_OWNER_PRIVATE_CLAIM_PROFILE');
        const legacy=await custody.createNativeClaimIngressHandoff({claimDomain:p.claimDomain,ingressProverIdentity:p.ingressProverIdentity,statement:p.statement});
        let built;try {
          assert.deepEqual(privateClaimPacketV2(legacy),p,'FLAT_OWNER_PRIVATE_CI51_ORIGINAL_HANDOFF');
          built=await withPinnedOwnerHash(hashFields=>buildClaimIngressInputs({...message.input.common,noteOpening:legacy.opening},{hashFields}));
          assert.equal(built.statement.claimDomain,p.claimDomain,'FLAT_OWNER_PRIVATE_CI51_DOMAIN');assert.equal(built.statement.outputQ,p.statement.output,'FLAT_OWNER_PRIVATE_CI51_OUTPUT');assert.equal(built.statement.amountQ,p.statement.amount,'FLAT_OWNER_PRIVATE_CI51_AMOUNT');
          const inputs=ownerCopy(built.inputs);privateClaimJob={handoffIdentitySHA256:p.handoffIdentitySHA256,inputs,expectedPublicInputs:ownerCopy(built.expectedPublicInputs),statement:ownerCopy(built.statement),witnessSHA256:ownerDigest(inputs)};
          result={statement:privateClaimJob.statement,expectedPublicInputs:privateClaimJob.expectedPublicInputs,witnessSHA256:privateClaimJob.witnessSHA256};
        } finally {wipePrivateProofInputsV1(built?.inputs);wipePrivateProofInputsV1(legacy);}
      } else if(message.method==='sealPrivateNativeClaimIngressProofV2') {
        exactRecord(message.input,['handoffIdentitySHA256','recipient']);const job=privateClaimJob;assert.ok(job,'FLAT_OWNER_PRIVATE_CI51_PREPARATION_REQUIRED');privateClaimJob=null;
        try {
          assert.equal(message.input.handoffIdentitySHA256,job.handoffIdentitySHA256,'FLAT_OWNER_PRIVATE_CI51_ORIGINAL_HANDOFF');
          const recipient=message.input.recipient;assert.equal(recipient.relation,'native_claim_ingress','FLAT_OWNER_PRIVATE_CI51_RELATION');assert.equal(recipient.role,'claim_ingress','FLAT_OWNER_PRIVATE_CI51_ROLE');
          const authorization={kind:'SCOPED_JOB_V1',jobId:recipient.jobId,consentSHA256:ownerDigest({profile:FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_V2,handoffIdentitySHA256:job.handoffIdentitySHA256,statement:job.statement,expectedPublicInputs:job.expectedPublicInputs}),witnessSHA256:job.witnessSHA256};
          result={packet:sealPrivateProofJobV1(recipient,{inputs:job.inputs,expectedPublicInputs:job.expectedPublicInputs,authorization}),authorization};
        } finally {wipePrivateProofInputsV1(job.inputs);}
      } else if (message.method === 'proveDepositIntent') {
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

export function assertOwnedFlatOwnerProcess(capability, expected) {
  const value = ownedProcesses.get(capability); assert.ok(value, 'FLAT_OWNER_OWNED_PROCESS_REQUIRED');
  if (expected) for (const key of Object.keys(expected)) { assert.ok(['runtime', 'system', 'poolIndex'].includes(key)); assert.equal(value[key], expected[key]); }
}

/** PRIVATE bootstrap. directory/password/checkpoint never come from a wallet
 * request. The caller durably retains each checkpoint before acknowledging it.
 * create=false requires the exact retained acknowledged or pending candidate. */
export async function createFlatOwnerProcess(input) { return flatOwnerProcess(input,false); }
export async function createRetainedFlatOwnerProcessV1(input) {
  assert.equal(input.create,true,'FLAT_OWNER_ORIGINAL_CREATE_REQUIRED');
  return flatOwnerProcess(input,true);
}
async function flatOwnerProcess(input,durable) {
  const delivery = Object.hasOwn(input, 'deliveryObserver'), claim = Object.hasOwn(input, 'nativeClaimObserver');
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'directory', 'password', 'create', 'checkpoint', 'onCheckpoint',
    ...(delivery ? ['deliveryObserver'] : []), ...(claim ? ['nativeClaimObserver'] : [])]);
  const { runtime, system, poolIndex } = input;
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
    try { module = await import('../observers/flat-owner-native-claim-observer.mjs'); }
    catch { throw failure('FLAT_OWNER_CLAIM_OBSERVER_REQUIRED'); }
    assertNativeClaimObserver = module.assertOwnedFlatOwnerNativeClaimObserver;
    assert.ok(typeof assertNativeClaimObserver === 'function', 'FLAT_OWNER_CLAIM_OBSERVER_REQUIRED');
    nativeClaimObserver = input.nativeClaimObserver;
    assertNativeClaimObserver(nativeClaimObserver, { runtime, system, poolIndex });
  }
  const onCheckpoint = input.onCheckpoint, initialCreate = input.create;
  let password = input.password, checkpoint = ownerCopy(input.checkpoint), child = null, pending = null,
    generation = 0, closed = false, lifecycle = false, hostBusy = false, capturing = false, lifetimeHandle = null, capturedCheckpoint = null;
  input = null;
  const identity = ownerCopy(observer.identity), poolArtifact = ownerCopy(observer.poolArtifact);
  const lifetimeIdentity={profile:'FLAT_ORIGINAL_OWNER_LIFETIME_V1',identity};
  const lifetimeState=()=>({directory,password,checkpoint:ownerCopy(checkpoint)});
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
    checkpoint = ownerCopy(next);
    if(durable)await updateWrappedPrivateLifetimePartV1(lifetimeHandle,lifetimeState());
    await onCheckpoint(frozen(ownerCopy(next)));
    return { retained: true };
  }
  async function start(create) {
    assert.ok(!closed && (!child || child.exitCode !== null || child.signalCode !== null));
    assertOwnedFlatOwnerObserver(observer, { runtime, system, poolIndex });
    ready = false; failed = null; nextId = 1; hostId = 0; session = randomBytes(32).toString('hex'); generation++;
    const startup = new Promise((resolve, rejectStart) => { startupResolve = resolve; startupReject = rejectStart; }); startup.catch(() => {});
    exited = new Promise(resolve => { exitResolve = resolve; });
    const started = fork(FILE, ['--flat-owner-child'], { cwd: directory, env: { LANG: 'C.UTF-8', PATH: '/usr/bin:/bin' },
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
    await send({ type: 'boot', config: { path: join(directory, 'flat-owner.vault'), password, identity, poolArtifact,
      create, checkpoint } });
    try { await startup; } catch (error) { await exited; throw error; }
  }
  async function request(method, value = null) {
    assert.ok(!closed && (!capturing || method==='close') && ready && !failed && !pending && !hostBusy, 'FLAT_OWNER_BUSY_OR_UNAVAILABLE');
    if(durable&&method!=='close')assertWrappedPrivateLifetimePartSealedV1(lifetimeHandle);
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
      : method === 'createPrivateNativeClaimIngressHandoffV2' ? async input=>privateNativeClaimHandoffV2(await request(method,input),request)
      : input => request(method, input ?? null)])));
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
      manualPreparations: () => request('manualPreparations'),
      graphPreparationTerms: () => request('graphPreparationTerms') }),
    publicView: opaque({ summary: () => request('summary') }),
    report: () => ({ profile: FLAT_OWNER_PROFILE, generation, closed, available: ready && !failed,
      childExited: !child || child.exitCode !== null || child.signalCode !== null, exit: ownerCopy(lastExit),
      childRestart: true, keeperRestart: false }),
    suspend: async () => { assert.ok(!capturing && !lifecycle && !closed && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { await stopChild(); return { suspended: true, childExited: true }; } finally { lifecycle = false; } },
    restart: async () => { assert.ok(!capturing && !lifecycle && !closed && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { await stopChild(); await start(false); return { available: true, generation }; } finally { lifecycle = false; } },
    close: async () => { assert.ok(!lifecycle && !pending && !hostBusy, 'FLAT_OWNER_LIFECYCLE_BUSY'); lifecycle = true;
      try { if (!closed) await stopChild(); closed = true; password = null; return { closed: true, childExited: true }; } finally { lifecycle = false; } },
  });
  if(durable){
    if(initialCreate)lifetimeHandle=await retainWrappedPrivateLifetimePartV1(runtime,'owner-'+poolIndex,lifetimeIdentity,lifetimeState());
    else {const saved=await readWrappedPrivateLifetimePartV1(runtime,'owner-'+poolIndex,lifetimeIdentity);
      assert.deepEqual(saved.privateState,lifetimeState(),'FLAT_OWNER_ORIGINAL_LIFETIME_CHANGED');lifetimeHandle=saved.handle;}
  }
  await start(initialCreate);
  ownedProcesses.set(capability, { runtime, system, poolIndex, durable,
    inventory(){assert.ok(durable&&!capturing&&!closed&&!pending&&!hostBusy&&ready&&!failed,'FLAT_OWNER_INVENTORY_UNAVAILABLE');assertWrappedPrivateLifetimePartSealedV1(lifetimeHandle);return {poolIndex,identitySHA256:ownerDigest(identity),checkpoint:ownerCopy(checkpoint)};},
    fence(){assert.ok(durable&&!capturing&&!lifecycle&&!closed&&!pending&&!hostBusy&&ready&&!failed,'FLAT_OWNER_CAPTURE_UNAVAILABLE');
      assertWrappedPrivateLifetimePartSealedV1(lifetimeHandle);capturing=true;},
    capture(){assert.ok(capturing&&checkpoint,'FLAT_OWNER_ORIGINAL_CHECKPOINT_REQUIRED');capturedCheckpoint=ownerCopy(checkpoint);return {poolIndex,identity:ownerCopy(lifetimeIdentity),state:lifetimeState()};},
    async stopCaptured(){assert.ok(capturing&&!pending&&!hostBusy);await stopChild();closed=true;password=null;
      assert.deepEqual(checkpoint,capturedCheckpoint,'FLAT_OWNER_CLOSE_CHECKPOINT_CHANGED');
      assert.ok(lastExit&&(lastExit.code===0||lastExit.signal==='SIGTERM')&&lastExit.signal!=='SIGKILL','FLAT_OWNER_ORIGINAL_STOP_UNCERTAIN');}
  });return capability;
}

if (process.argv[1] && resolve(process.argv[1]) === FILE && process.argv[2] === '--flat-owner-child')
  await childMain();

/** Only the fixed recovery dispatcher may publish or consume an owner pair. */
export async function retainFlatOwnersForReopenV1(input){
 exactRecord(input,['owners','attemptAuthority']);assert.ok(Array.isArray(input.owners)&&input.owners.length===2&&input.owners[0]!==input.owners[1]);
 const states=input.owners.map((owner,poolIndex)=>{const s=ownedProcesses.get(owner);assert.ok(s?.durable&&s.poolIndex===poolIndex,'FLAT_OWNER_ORIGINAL_PAIR_REQUIRED');return s;});
 assert.equal(states[0].runtime,states[1].runtime);assert.equal(states[0].system,states[1].system);
 assertWrappedPrivateLifetimeAttemptV1(states[0].runtime,originalWrappedRecoverySectionIdentityV1(input.attemptAuthority,'owners'));
 const fenced=[];let failure;
 try{for(const s of states){s.fence();fenced.push(s);}await retainOriginalWrappedRecoverySectionV1(input.attemptAuthority,'owners',
   {schema:'EXTERNAL_ORIGINAL_FLAT_OWNER_PAIR_V1',owners:states.map(s=>s.capture())});}catch(error){failure=error;}
 const stopped=await Promise.allSettled(fenced.map(s=>s.stopCaptured()));const errors=stopped.filter(x=>x.status==='rejected').map(x=>x.reason);
 if(failure||errors.length)throw new AggregateError([...(failure?[failure]:[]),...errors],'FLAT_OWNER_CAPTURE_FAILED');
 return {retained:true,originalResourcesStopped:true};
}
export async function reopenFlatOwnersFromAuthorityV1(input){return reopenOriginalFlatOwnerPairV1(input,false);}
/** Fixed EXIT-only continuation: no reconstructed GRAPH/delivery observer. */
export async function reopenFlatOwnersForVaultExitV1(input){assert.equal(arguments.length,1);return reopenOriginalFlatOwnerPairV1(input,true);}
async function reopenOriginalFlatOwnerPairV1(input,vaultExit){
 exactRecord(input,vaultExit?['runtime','system','attemptAuthority']:['runtime','system','deliveryObservers','attemptAuthority']);if(vaultExit)assert.equal(originalWrappedRecoverySectionIdentityV1(input.attemptAuthority,'owners').profile,'EXTERNAL_DEFI_PRIVATE_RECOVERY_AUTHORITY_V1','EXTERNAL_EXIT_ORIGINAL_OWNER_ISSUER');else assert.ok(Array.isArray(input.deliveryObservers)&&input.deliveryObservers.length===2);
 assertWrappedPrivateLifetimeAttemptV1(input.runtime,originalWrappedRecoverySectionIdentityV1(input.attemptAuthority,'owners'));
 const saved=consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority,'owners');exactRecord(saved,['schema','owners']);
 assert.equal(saved.schema,'EXTERNAL_ORIGINAL_FLAT_OWNER_PAIR_V1');assert.equal(saved.owners.length,2);const owners=[];
 try{for(let poolIndex=0;poolIndex<2;poolIndex++){
  const row=saved.owners[poolIndex];exactRecord(row,['poolIndex','identity','state']);assert.equal(row.poolIndex,poolIndex);
  const retained=await readWrappedPrivateLifetimePartV1(input.runtime,'owner-'+poolIndex,row.identity);
  assert.deepEqual(retained.privateState,row.state,'FLAT_OWNER_ORIGINAL_LIFETIME_CHANGED');
  exactRecord(row.state,['directory','password','checkpoint']);assert.ok(row.state.checkpoint,'FLAT_OWNER_ORIGINAL_CHECKPOINT_REQUIRED');
  const owner=await flatOwnerProcess({runtime:input.runtime,system:input.system,poolIndex,...row.state,create:false,
    ...(vaultExit?{}:{deliveryObserver:input.deliveryObservers[poolIndex]}),onCheckpoint:async()=>{}},true);owners.push(owner);
 }return Object.freeze(owners);}catch(error){const r=await Promise.allSettled(owners.map(owner=>owner.close()));throw new AggregateError([error,...r.filter(x=>x.status==='rejected').map(x=>x.reason)],'FLAT_OWNER_REOPEN_FAILED');}
}

export function retainedFlatOwnerInventoryV1(owner){const s=ownedProcesses.get(owner);assert.ok(s?.durable);return frozen(s.inventory());}
