import {reconcileRecoveryReorgV1} from '../reconciliation/recovery-reorg-reconcile-v1.mjs';
import {sendRetainedTerminalV2, observeRetainedTerminalV2, recoverRetainedTerminalV2} from '../reconciliation/terminal-actions-v2.mjs';
import {reconcileRetainedTerminalV2} from '../reconciliation/terminal-reconciliation-v2.mjs';
import {nativeSourceRecoverySectionIdentityV1,retainOriginalNativeSourceSectionV1,consumeOriginalNativeSourceSectionV1,resumeOriginalNativeSourceSectionV1,updateOriginalNativeSourceSectionV1} from '../../../operations/recovery/native-original-source-lifecycle-v1.mjs';
import {assertOwnedNativeDurableSourceReceiverV1} from '../../../operations/recovery/native-original-source-lifecycle-v1.mjs';
import {buildOwnerNativeGraphRoute} from '../../account/preparation/owner-native-graph-review-v1.mjs';
import {createHash as recoveryHash} from 'node:crypto';
import {canonical as recoveryCanonical} from '@lianum/engine/crypto/privacy';
const privateRecoveryDigest=value=>recoveryHash('sha256').update(recoveryCanonical(value)).digest('hex');
import { assertWrappedWalletAccountReleasedV1 } from '../../../operations/releases/wrapped/wrapped-wallet-release-v1.mjs';
import { refreshNativeValueReceiverClock } from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
/** ADDITIVE native-value branch of the existing four-slot keeper. Original U/S/P/R/N/T/F roles and graph semantics stay fixed; only the new I role and original native-value custody differ. No test capability or caller backend is accepted. */
/** Private execution keeper for the accepted four-slot flat protocol.
 * The disposable account coordinator gets opaque operation references. This
 * keeper retains scoped packets and original outcomes, never an owner key.
 * Its survival and trusted local OS are explicit availability assumptions.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { types } from 'node:util';
import { Vault } from '@lianum/engine/crypto/vault';
import { canonical } from '@lianum/engine/crypto/privacy';
import { assertLocalEvm } from '../../../chains/evm/runtime/local-evm-ownership.mjs';
import { assertOwnedNativeValueSystem as nativeSystem, nativeValueOriginalRecoverySourceV1 } from '../../../operations/deployments/native-value/native-value-system-v2.mjs';
import { assertOwnedNativeValueQuorum as nativeQuorum } from '../../../operations/operators/native-value/native-value-operators-v4.mjs';
import { assertOwnedNativeValueProviderCustody as nativeCustody, ownedNativeValueProviderCustodyReview as nativeCustodyReview } from '../../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import { createOwnedNativeValueProvider as nativeProvider } from '../../../chains/evm/dispatch/native-value-evm-dispatch-gate.mjs';
import { createOwnedNativeValueGraphAdmission as nativeAdmission } from '../preparation/native-value-graph-admission-v2.mjs';
import { createNativeValueSystemStateReader as nativeReader } from '../reconciliation/native-value-system-state-v2.mjs';
import { createNativeValueTerminalObserver as nativeTerminal, readOriginalNativeRecoveryCheckpointV1 } from '../reconciliation/native-value-terminal-observer-v2.mjs';
import { createCommitmentCodec, exactRecord, fixedArray, bytes32, canonicalField } from '@lianum/components/encoding/commitments';
import { decodeStatement, joinReadiness, joinAdmission, joinSettlement } from '@lianum/components/encoding/statements';
import { buildDependencyInputs, buildReadyInputs } from '../../account/preparation/readiness-inputs.mjs';
import { validateFlatExecutionPreparation } from '../../account/execution/flat-native-execution.mjs';
import { nativeValueOriginalAdmissionConsumer } from '../preparation/native-value-dev-admission-consumer-v5.mjs';
import { loadNativeValueLiveArtifacts } from '../../../proving/native-value/metadata/native-value-live-v2-artifacts.mjs';
import { assertNativeEconomicRecoveryCaptureV1, nativeEconomicRecoverySectionIdentityV1, consumeNativeEconomicRecoverySectionV1 }
  from '../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { assertNativeValueBootstrapNativeRuntime } from '../../../operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import { buildNodeInputs, buildSettlementInputs } from '../../account/reconciliation/completion-inputs.mjs';
import { flatCompletionWindow } from '../../account/reconciliation/flat-completion-window.mjs';
import { nativeValueFailureDiagnostic } from '../reconciliation/native-value-failure-retention.mjs';
import { recoveryWitness } from '../../account/preparation/funding-inputs.mjs';
import { encodeFlatTransaction } from '../../encoding/transaction-codec.mjs';
import {withFlatHash, loadFlatABI} from '@lianum/proofs/tooling/scoped-proof-tools';
import {createFlatProofRunner} from '@lianum/backend/proving/roles/scoped-proof-runner';

import { assertOwnedWrappedClaimWalletSystemV1 } from '../../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs';
import { assertOwnedNativeValueQuorum as wrappedQuorum } from '../../../operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
import { assertOwnedNativeValueProviderCustody as wrappedCustody, ownedNativeValueProviderCustodyReview as wrappedCustodyReview } from '../../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs';
import { createOwnedNativeValueProvider as wrappedProvider } from '../../../chains/shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs';
import { createOwnedWrappedWalletGraphAdmissionV1 } from '../../wrapped/preparation/wrapped-wallet-graph-admission-v1.mjs';
import { createWrappedWalletStateReaderV1 } from '../../wrapped/reconciliation/wrapped-wallet-state-v1.mjs';
import { createWrappedWalletTerminalObserverV1 } from '../reconciliation/native-value-terminal-observer-v2.mjs';
export const WRAPPED_WALLET_EXECUTION_PROFILE_V1 = 'OWNED_WRAPPED_WALLET_EXECUTION_KEEPER_V1';
export const FLAT_EXECUTION_PROFILE = 'OWNED_NATIVE_VALUE_EXECUTION_KEEPER_V2';
const originalFReorgProbeTokensV1 = new WeakMap();
export function consumeOriginalNativeFReorgProbeV1(token, runtime, phase) {
  assert.equal(arguments.length, 3); const saved = originalFReorgProbeTokensV1.get(token);
  assert.ok(saved && saved.runtime === runtime && saved.phase === phase && !saved.used, 'F_REORG_PROBE_ORIGINAL_EXECUTOR_TOKEN');
  saved.assertCurrent(); saved.used = true; return saved;
}
export async function rewindOriginalNativeFReorgProbeV1(execution, ref) {
  assert.equal(arguments.length, 2); const original = owners.get(execution);
  assert.ok(original && !original.wrapped, 'F_REORG_PROBE_ORIGINAL_EXECUTOR'); original.live(); return original.rewindRecoveryProbe(ref);
}
const originalFReorgWires = new WeakMap();
export async function reconcileOriginalDeviceNativeRecoveryV1(execution, account, ref) {
  assert.equal(arguments.length, 3); const state = owners.get(execution);
  assert.ok(state && !state.wrapped, 'F_REORG_ORIGINAL_EXECUTOR_REQUIRED'); state.live();
  return state.reconcileRecovery(account, ref);
}
export function consumeOriginalNativeRecoveryReorgWireV1(token, runtime) {
  assert.equal(arguments.length, 2); const saved = originalFReorgWires.get(token);
  assert.ok(saved && saved.runtime === runtime && !saved.used, 'F_REORG_ORIGINAL_WIRE_TOKEN_REQUIRED');
  saved.assertCurrent(); saved.used = true; return saved;
}
const owners = new WeakMap(), ZERO = '0'.repeat(64), MAX_OPERATIONS = 8;
const fresh = () => randomBytes(32).toString('hex');
const copy = value => JSON.parse(canonical(value));
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const dataHash = data => createHash('sha256').update(Buffer.from(data.slice(2), 'hex')).digest('hex');
const prefix = value => '0x' + value;
const bare = value => { assert.ok(typeof value === 'string' && value.length === 66 && /^0x[0-9a-f]{64}$/.test(value)); return value.slice(2); };
const reference = value => bytes32(value, true);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const detached = value => freeze(copy(value));
const path = opening => ({ root: opening.root, index: opening.index, siblings: [...opening.siblings] });
const shaPath = opening => ({ root: bare(opening.root), index: opening.index, siblings: opening.siblings.map(bare) });
const shaLeafPath = opening => ({ leaf: bare(opening.leaf), index: opening.index, siblings: opening.siblings.map(bare) });
const fieldLeafPath = opening => ({ leaf: opening.leaf, index: opening.index, siblings: [...opening.siblings] });
function notePath(view, commitment) {
  const position = view.ledger.commitments.indexOf(prefix(commitment));
  assert.ok(position >= 0, 'FLAT_EXECUTION_NOTE_NOT_INCLUDED'); return view.ledger.tree.path(position);
}
function receiptPath(view, leaf) {
  const position = view.receiptLeaves.indexOf(leaf);
  assert.ok(position >= 0, 'FLAT_EXECUTION_RECEIPT_NOT_INCLUDED'); return path(view.receiptTree.path(position));
}
const healthFields = permit => ({ healthFrom: permit.message.validFrom,
  healthUntil: permit.message.validUntil, healthSignatures: permit.abiSignatures });

export function assertOwnedNativeValueExecution(capability, binding) {
  const state = owners.get(capability); assert.ok(state && state.wrapped === false, 'FLAT_EXECUTION_OWNED_CAPABILITY'); state.live();
  for (const key of ['runtime', 'system', 'poolIndex']) assert.equal(state[key], binding[key], 'FLAT_EXECUTION_OWNED_BINDING');
}

/** Original private retained preparation only, never caller-supplied route data. */
export function ownedNativeValueManualGraphReview(capability, reference, binding) {
  assertOwnedNativeValueExecution(capability, binding);
  return owners.get(capability).manualReview(reference);
}

export function assertOwnedWrappedWalletExecutionV1(capability, binding) {
  const state = owners.get(capability); assert.ok(state && state.wrapped === true, 'WRAPPED_WALLET_ORIGINAL_EXECUTION_REQUIRED'); state.live();
  assertOwnedWrappedClaimWalletSystemV1(state.runtime, state.system); wrappedQuorum(state.system.quorum, { runtime: state.runtime, system: state.system });
  for (const key of ['runtime', 'system', 'poolIndex']) assert.equal(state[key], binding[key], 'WRAPPED_WALLET_EXECUTION_BINDING');
}
export function ownedWrappedWalletManualGraphReviewV1(capability, reference, binding) {
  assertOwnedWrappedWalletExecutionV1(capability, binding); return owners.get(capability).manualReview(reference);
}
export async function createNativeValueExecution(input, callbacks = {}) { return createExecution(input, callbacks, false); }
export async function createWrappedWalletExecutionV1(input) {
  assertWrappedWalletAccountReleasedV1();
  assert.equal(arguments.length, 1, 'WRAPPED_WALLET_NO_OVERRIDES'); return createExecution(input, {}, true);
}
async function createExecution(input, callbacks, wrapped, recovery=null) {
  const assertOwnedFlatSystem = wrapped ? assertOwnedWrappedClaimWalletSystemV1 : nativeSystem;
  const assertOwnedNativeValueQuorum = wrapped ? wrappedQuorum : nativeQuorum;
  const assertOwnedNativeValueProviderCustody = wrapped ? wrappedCustody : nativeCustody;
  const ownedNativeValueProviderCustodyReview = wrapped ? wrappedCustodyReview : nativeCustodyReview;
  const createOwnedNativeValueProvider = wrapped ? wrappedProvider : nativeProvider;
  const createOwnedNativeValueGraphAdmission = wrapped ? createOwnedWrappedWalletGraphAdmissionV1 : nativeAdmission;
  const createFlatSystemStateReader = wrapped ? createWrappedWalletStateReaderV1 : nativeReader;
  const createFlatTerminalObserver = wrapped ? createWrappedWalletTerminalObserverV1 : nativeTerminal;
  const profile = wrapped ? WRAPPED_WALLET_EXECUTION_PROFILE_V1 : FLAT_EXECUTION_PROFILE;
  assert.ok(input && typeof input === 'object' && !types.isProxy(input), 'FLAT_EXECUTION_INPUT');
  exactRecord(input, ['runtime','system','poolIndex','quorum']);
  const { runtime, system, poolIndex, quorum } = input;
  assertOwnedFlatSystem(runtime,system);await assertLocalEvm(runtime);
  assert.equal(system.claimsEnabled,wrapped,'EXECUTION_EXACT_PROFILE_REQUIRED');
  assert.ok(poolIndex===0||poolIndex===1,'NV2_EXECUTION_POOL');
  assert.equal(quorum,system.quorum,'NV2_EXECUTION_ORIGINAL_QUORUM');
  assertOwnedNativeValueQuorum(quorum,{runtime,system});
  // Gate before storage, checkpoint signatures, native custody or any proof.
  if(wrapped)await loadNativeValueLiveArtifacts();else await nativeValueOriginalAdmissionConsumer(runtime,system).load();
  assert.ok(Object.keys(callbacks).every(key => ['onStage', 'onProof', 'onPrivateAudit'].includes(key)), 'FLAT_EXECUTION_CALLBACKS');
  const onStage = callbacks.onStage ?? (async () => {}), onProof = callbacks.onProof ?? (async () => {}),
    onPrivateAudit = callbacks.onPrivateAudit ?? (async () => {});
  for (const callback of [onStage, onProof, onPrivateAudit]) assert.equal(typeof callback, 'function');
  const pool = system.pools[poolIndex], reader = await createFlatSystemStateReader({ runtime, system, poolIndex });
  const terminalObserver = await createFlatTerminalObserver({ runtime, system, poolIndex });
  const directory = recovery?recovery.record.directory:await mkdtemp(join(runtime.metadata.scratchDirectory, 'native-value-execution-'));
  const vault = new Vault(join(directory, 'operations.vault')); let password = recovery?recovery.record.password:fresh();
  let record = recovery?await vault.read(password):await vault.create({ version: 1, profile,
    pool: pool.address, domainCommitment: pool.domainCommitment, operations: [] }, password);
  assert.deepEqual(await vault.read(password), record);
  if(recovery){assert.equal(record.data.profile,profile);assert.equal(record.data.pool,pool.address);assert.equal(record.data.domainCommitment,pool.domainCommitment);assert.equal(privateRecoveryDigest(record),recovery.record.checkpointSHA256,'WRAPPED_EXECUTION_ORIGINAL_CHECKPOINT_CHANGED');}
  let lifetimeHandle=null,lifetimeState=null,lifetimeRegistry=null;
  if(wrapped){lifetimeRegistry=await import('../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');const binding={profile:'WRAPPED_EXECUTION_LIFETIME_V1',pool:pool.address,domainCommitment:pool.domainCommitment,poolIndex};lifetimeState={directory,password,checkpointSHA256:privateRecoveryDigest(record),pendingUpdate:null};
    if(recovery){const original=await lifetimeRegistry.readWrappedPrivateLifetimePartV1(runtime,'wallet-execution-'+poolIndex,binding);assert.equal(privateRecoveryDigest(original.privateState),privateRecoveryDigest(lifetimeState),'WRAPPED_EXECUTION_REGISTRY_CHECKPOINT_CHANGED');lifetimeHandle=original.handle;}
    else lifetimeHandle=await lifetimeRegistry.retainWrappedPrivateLifetimePartV1(runtime,'wallet-execution-'+poolIndex,binding,lifetimeState);}
  async function retainLifetime(next){if(wrapped){await lifetimeRegistry.updateWrappedPrivateLifetimePartV1(lifetimeHandle,next);lifetimeState=copy(next);}}
  const providerSets = new Map(), admissionAdapters = new Map(), abis = {}, proofs = createFlatProofRunner({ onProof });
  let nativeCaptureIdentity = null, nativeCaptureRecord = null,sourceHandle=null,sourceIdentity=null,sourceWrapper=null,sourcePending=null;
  function sourceSeed(){const selected=[...providerSets].map(([reference,rows])=>({reference,providers:rows.map(({custody,...row})=>({...copy(row),custodyIdentitySHA256:privateRecoveryDigest(nativeCustodyReview(custody,{runtime,system,poolIndex}))}))}));assert.ok(selected.flatMap(row=>row.providers).every(row=>row.slot===0),'NATIVE_SOURCE_FIXED_EXECUTOR_PROVIDER');assert.ok(admissionAdapters.size<=1,'NATIVE_SOURCE_FIXED_EXECUTOR_LEASE');return {schema:'ORIGINAL_NATIVE_EXECUTOR_SOURCE_SEED_V1',poolIndex,directory,password,checkpointSHA256:privateRecoveryDigest(record),providerBindings:selected,adapters:[...admissionAdapters].map(([key,value])=>({key,slot:value.slot}))};}
  async function sourceCheckpoint(candidate){if(sourceHandle){const next={...sourceWrapper,confirmed:sourceSeed(),candidate};await updateOriginalNativeSourceSectionV1(sourceHandle,next);sourceWrapper=next;}}
  let closed = false, poisoned = false, busy = false, cancelled = false, capturing=false, captureStarted=false, captureProviders=null,captureProviderBindings=null, activeDone = Promise.resolve(), releaseActive;
  const live = () => assert.ok(!closed && !poisoned && !capturing, 'FLAT_EXECUTION_UNAVAILABLE');
  async function healthy() { live(); assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
    assert.equal(system.claimsEnabled,wrapped,'EXECUTION_EXACT_PROFILE_REQUIRED');assertOwnedNativeValueQuorum(quorum,{runtime,system});
    assert.deepEqual(await vault.read(password), record, 'FLAT_EXECUTION_STORAGE_CHANGED'); }
  async function write(change) {
    try { await healthy();const changed=change(copy(record.data));if(sourceHandle)await sourceCheckpoint({kind:'EXECUTOR_RECORD_CAS',revision:record.revision+1,dataSHA256:privateRecoveryDigest(changed)});if(wrapped)await retainLifetime({...lifetimeState,pendingUpdate:{revision:record.revision+1,dataSHA256:privateRecoveryDigest(changed)}});const next = await vault.update(password, record.revision, ()=>changed);
      assert.deepEqual(await vault.read(password), next);if(wrapped)await retainLifetime({...lifetimeState,checkpointSHA256:privateRecoveryDigest(next),pendingUpdate:null});record = next;if(sourceHandle)await sourceCheckpoint(sourcePending); }
    catch (error) { poisoned = true; throw error; }
  }
  function operation(ref) { reference(ref); const item = record.data.operations.find(value => value.reference === ref);
    assert.ok(item, 'FLAT_EXECUTION_ORIGINAL_PREPARATION_REQUIRED'); return item; }
  async function update(ref, values) { await write(state => ({ ...state, operations: state.operations.map(item =>
    item.reference === ref ? { ...item, ...copy(values) } : item) })); }
  async function stage(ref, name) { assert.ok(!cancelled, 'FLAT_EXECUTION_CANCELLED');
    await update(ref, { stage: name }); await onStage({ reference: ref, stage: name }); }
  async function exclusive(work) { live(); assert.ok(!busy && !cancelled, 'FLAT_EXECUTION_BUSY'); busy = true;
    activeDone = new Promise(resolve => { releaseActive = resolve; });
    try { if(sourceHandle){sourcePending={kind:'EXECUTOR_EXCLUSIVE',checkpointSHA256:privateRecoveryDigest(record)};await sourceCheckpoint(sourcePending);}await healthy();const result=await work();if(sourceHandle){await healthy();await sourceCheckpoint(null);sourcePending=null;}return result; }
    catch(error){if(sourceHandle)poisoned=true;throw error;}finally { busy = false; releaseActive(); releaseActive = null; } }
  async function abi(name) { abis[name] ??= await loadFlatABI(name); return abis[name]; }
  async function prove(ref, name, job, label) { await stage(ref, 'prove-' + label); return proofs.prove(name, job, label); }
  async function beforeTerminalSend(ref, kind) {
    if (!wrapped && kind === 'recovery') {
      const probe = await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');
      if (probe.isOwnedOriginalNativeFReorgReceiverV1(runtime)) {
        const token = originalProbeToken(ref, 'BEFORE_F');
        try { await probe.retainOwnedOriginalFReorgProbeV1(runtime, token); }
        finally { originalFReorgProbeTokensV1.delete(token); }
      }
    }
  }
  async function send(ref, kind, target, calldata) {
    return sendRetainedTerminalV2(ref, kind, target, calldata, {
      operation, update, calldataHash: dataHash, beforeSend: beforeTerminalSend,
      send: (label, request) => runtime.send(label, request), bareHash: bare,
    });
  }
  async function observedSubmission(ref, kind) {
    return observeRetainedTerminalV2(ref, kind, {
      operation, update, detached, wrapped, observe: query => terminalObserver.observe(query),
      recoveryCheckpoint: observed => readOriginalNativeRecoveryCheckpointV1(terminalObserver, observed),
    });
  }
  function originalProbeToken(ref, phase) {
    const entry = operation(ref); assert.ok(busy && !wrapped && entry.recoverySubmission, 'F_REORG_PROBE_ORIGINAL_OPERATION');
    const revision = record.revision;
    const assertCurrent = () => { live(); assert.ok(busy && !cancelled); assert.equal(record.revision, revision); };
    const revalidate = async () => { await healthy(); assertCurrent(); };
    const token = Object.freeze({}); originalFReorgProbeTokensV1.set(token, { runtime, ref, phase, used: false,
      settleBefore: entry.binding.settleBefore, checkpoint: entry.originalFCheckpoint, assertCurrent, revalidate }); return token;
  }
  async function rewindRecoveryProbe(ref) { return exclusive(async () => {
    const entry = operation(ref); assert.equal(entry.outcome, 'RECOVERED'); assert.equal(entry.nativeFReorg, undefined);
    assert.ok(entry.originalFCheckpoint && entry.recoverySubmission?.transactionHash, 'F_REORG_PROBE_ORIGINAL_CONFIRMED_F');
    assert.deepEqual(entry.originalFCheckpoint.query.binding, entry.binding);
    assert.deepEqual(entry.originalFCheckpoint.query.statement, entry.recoveryStatement);
    assert.deepEqual(entry.originalFCheckpoint.query.submission, entry.recoverySubmission);
    await observedSubmission(ref, 'recovery');
    const { rewindOwnedOriginalFReorgProbeV1 } = await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');
    const token = originalProbeToken(ref, 'REWIND_CONFIRMED_F');
    try { return await rewindOwnedOriginalFReorgProbeV1(runtime, token); }
    finally { originalFReorgProbeTokensV1.delete(token); }
  }); }
  async function reconcileRecovery(account,ref){return exclusive(async()=>{
    assert.ok(!wrapped,'F_REORG_NATIVE_ONLY');
    const binding=await import('../../../accounts/authority/native-value-account-authority-v2.mjs');
    return reconcileRecoveryReorgV1(account,ref,{wrapped,binding,keeper,operation,runtime,terminalObserver,update,healthy,
      readRevision:()=>record.revision,assertActive:()=>{live();assert.ok(busy&&!cancelled);},observedSubmission,
      async emit(saved){
        const token=Object.freeze({});originalFReorgWires.set(token,saved);
        try{const {reemitOwnedOriginalNativeRecoveryV1}=await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');
          await reemitOwnedOriginalNativeRecoveryV1(runtime,token);
        }finally{originalFReorgWires.delete(token);}
      }
    });
  });}
  async function checkpoint(ref) {
    await refreshNativeValueReceiverClock(runtime);
    const permit = await quorum.checkpoint({ poolIndex, requestId: fresh() }), message = permit.message;
    await runtime.send('flat-execution-checkpoint-' + ref, { to: system.hub.address,
      data: encodeFlatTransaction('recordCheckpoint', { pool: pool.address, expectedPoolSequence: message.expectedPoolSequence,
        expectedHubStateSequence: message.expectedHubStateSequence, requestId: message.requestId,
        validUntil: message.validUntil, signatures: permit.abiSignatures }) });
    const view = await reader.read(); return { view, recorded: view.checkpoints.at(-1) };
  }
  async function expose(ref, selected, local, dependencyPacket) {
    const entry = operation(ref), { view, recorded } = await checkpoint(ref);
    const authorization = await reader.authorizationPath(view, entry.binding.envelope);
    const readyFrom = recorded.snapshot.timestamp, cutoff = BigInt(entry.binding.settleBefore);
    const dependencyABI = await abi('dependency'), readyABI = await abi('ready');
    const predecessorSlots = dependencyPacket.dependency.value.predecessors
      .slice(0, Number(dependencyPacket.dependency.value.dependencyCount)).map(value => Number(value.sourceSlot));
    const incoming = predecessorSlots.map(slot => { const receipt = operation(ref).receipts.find(value => value.slot === slot);
      assert.ok(receipt, 'FLAT_EXECUTION_PREDECESSOR_NOT_ADMITTED'); return { opening: receipt.opening, path: receiptPath(view, receipt.leaf) }; });
    const readyUntil = String([BigInt(readyFrom) + 7200n, cutoff, BigInt(local.action.executionUntil),
      ...incoming.map(value => BigInt(value.opening.validUntil))].reduce((a, b) => a < b ? a : b));
    assert.ok(BigInt(readyUntil) > BigInt(readyFrom), 'FLAT_EXECUTION_READY_WINDOW_CLOSED');
    const pJob = await withFlatHash(hashFields => buildDependencyInputs({ packet: dependencyPacket, authorization,
      snapshot: recorded.snapshot, readyFrom, readyUntil, predecessorReceipts: incoming, revokedEntries: view.revokedEntries },
    { hashFields, abi: dependencyABI }));
    const rJob = await withFlatHash(hashFields => buildReadyInputs({ packet: local, authorization, snapshot: recorded.snapshot,
      readyFrom, readyUntil, reservePath: shaPath(notePath(view, entry.binding.reserveCommitment)),
      poolSpentEntries: [...view.ledger.nullifiers.map(bare), ...Array(64 - view.ledger.nullifiers.length).fill(ZERO)],
      readinessBlind: fresh() }, { hashFields, abi: readyABI }));
    joinReadiness(pJob.statement, rJob.statement);
    const dependency = await prove(ref, 'dependency', pJob, 'leg-' + selected.slot + '-dependency');
    const readiness = await prove(ref, 'ready', rJob, 'leg-' + selected.slot + '-readiness');
    await stage(ref, 'dispatch-native-leg-' + selected.slot);
    await update(ref, { exposures: [...operation(ref).exposures,
      { slot: selected.slot, family: selected.family, status: 'POSSIBLE', nativeId: null }] });
    const request={dependencyProof:dependency,readyProof:readiness,readinessOpening:rJob.admissionOpening,
      action:local.action,deliveryRiskSalt:selected.deliveryRiskSalt,receiptSpendSecret:local.receiptSpendSecret};
    // The lease is minted only by original quote-bound custody after these real
    // P/R proofs. No callback/caller-selected provider can replace it.
    const dispatchLease=await selected.custody.bindDispatch({request});
    const provider=await createOwnedNativeValueProvider({runtime,system,poolIndex,dispatchLease});
    const adapter=await createOwnedNativeValueGraphAdmission({runtime,system,poolIndex,provider});
    const key=ref+':'+selected.slot;assert.ok(!admissionAdapters.has(key),'NV2_EXECUTION_ORIGINAL_ADAPTER_ONLY');
    admissionAdapters.set(key,{adapter,provider,slot:selected.slot});
    const admitted=await adapter.admit(request),receipt={slot:selected.slot,...admitted.receipt};
    const included=await reader.read();receiptPath(included,receipt.leaf);
    await update(ref,{receipts:[...operation(ref).receipts,receipt],exposures:operation(ref).exposures.map(value=>value.slot===selected.slot
      ? {...value,status:'ADMITTED',nativeId:receipt.opening.globalEffectId}:value)});
    await onPrivateAudit({reference:ref,stage:'native-admitted',receipt,transactionHash:admitted.transactionHash,
      ...(admitted.originalProofEvidence?{originalProofEvidence:admitted.originalProofEvidence}:{})});
  }
  async function currentHealth(){
    await refreshNativeValueReceiverClock(runtime);
    const view=await reader.read(),permit=await quorum.health({poolIndex,validUntil:(BigInt(view.head.timestamp)+30n).toString()});
    assert.deepEqual(permit.head,view.head,'NV2_EXECUTION_HEALTH_HEAD');await reader.assertCurrent(view);return permit;
  }

  const keeper = Object.freeze({
    async prepare(ref, raw, providers) { return exclusive(async () => {
      reference(ref); assert.ok(Array.isArray(providers) && providers.length > 0 && providers.length <= 4);
      const checked = await withFlatHash(hashFields => validateFlatExecutionPreparation(raw, pool.domain, hashFields));
      const packets = checked.prepared.rolePackets, active = packets.local.map((value, slot) => value.local.value.active ? slot : null).filter(value => value !== null);
      assert.deepEqual(providers.map(value => value.slot), active, 'FLAT_EXECUTION_PROVIDER_SLOTS');
      assert.equal(new Set(providers.map(value=>value.custody)).size,providers.length,'NV2_EXECUTION_DISTINCT_ORIGINAL_CUSTODIES');
      const captured=providers.map(value=>{
        exactRecord(value,['slot','custody','deliveryRiskSalt']);
        assertOwnedNativeValueProviderCustody(value.custody,{runtime,system,poolIndex});
        assert.equal(value.custody.report().quoteBound,true,'NV2_EXECUTION_ACCEPTED_QUOTE_REQUIRED');
        bytes32(value.deliveryRiskSalt,true);
        const offer=value.custody.offer(),review=ownedNativeValueProviderCustodyReview(value.custody,{runtime,system,poolIndex}),local=packets.local[value.slot];
        assert.equal(offer.evidencePolicy,local.local.value.evidencePolicy,'NV2_EXECUTION_PROFILE');
        assert.deepEqual(offer.actionTemplate,Object.fromEntries(Object.keys(offer.actionTemplate).map(key=>[key,local.action[key]])),'NV2_EXECUTION_ACTION');
        assert.equal(review.payoutCommitment,local.local.value.payoutCommitment,'NV2_EXECUTION_PAYOUT');
        assert.equal(review.deliveryRiskCommitment,local.action.deliveryRiskCommitment,'NV2_EXECUTION_RISK');
        assert.equal(review.settleBefore,checked.binding.settleBefore,'NV2_EXECUTION_CUTOFF');
        return {...value,family:review.family,offer,review};
      });
      const providerBindings=captured.map(({custody,...value})=>copy(value));
      const preparationSHA256 = digest({ prepared: checked.prepared, providerBindings });
      const old = record.data.operations.find(value => value.reference === ref);
      if (old) { assert.equal(old.preparationSHA256, preparationSHA256);
        const original=providerSets.get(ref);assert.ok(original&&original.length===captured.length,'NV2_EXECUTION_ORIGINAL_CUSTODIES_REQUIRED');
        captured.forEach((value,i)=>assert.equal(value.custody,original[i].custody,'NV2_EXECUTION_CUSTODY_REBOUND'));return detached(old.binding); }
      assert.ok(record.data.operations.length < MAX_OPERATIONS, 'FLAT_EXECUTION_CAPACITY');
      assert.ok(!record.data.operations.some(value => value.binding.envelope === checked.binding.envelope), 'FLAT_EXECUTION_ENVELOPE_REUSED');
      await write(state => ({ ...state, operations: [...state.operations, { reference: ref, preparationSHA256,
        binding: checked.binding, prepared: checked.prepared, providerBindings, stage: 'PREPARED', executionStarted: false,
        exposures: [], receipts: [], settlementStatement: null, recoveryStatement: null, settlementSubmission: null, recoverySubmission: null,
        outcome: null, errorCode: null }] }));
      providerSets.set(ref, captured); return checked.binding;
    }); },
    async execute(ref) { return exclusive(async () => {
      await refreshNativeValueReceiverClock(runtime);
      const original = operation(ref);
      if (original.outcome) return observedSubmission(ref, original.outcome === 'RECOVERED' ? 'recovery' : 'settlement');
      assert.equal(original.executionStarted, false, 'FLAT_EXECUTION_RECONCILE_OR_RECOVER_ORIGINAL');
      const view = await reader.read(); notePath(view, original.binding.reserveCommitment);
      assert.ok(view.ledger.nullifiers.includes(prefix(original.binding.inputNullifier)), 'FLAT_EXECUTION_RESERVATION_REQUIRED');
      assert.ok(!view.ledger.nullifiers.includes(prefix(original.binding.reserveNullifier)), 'FLAT_EXECUTION_RESERVE_SPENT');
      await reader.authorizationPath(view, original.binding.envelope);
      await update(ref, { executionStarted: true, stage: 'EXECUTING' });
      try {
        const selected = providerSets.get(ref); assert.ok(selected, 'FLAT_EXECUTION_ORIGINAL_PROVIDERS_REQUIRED');
        const packets = operation(ref).prepared.rolePackets;
        for (const provider of selected) await expose(ref, provider, packets.local[provider.slot], packets.dependency[provider.slot]);
        const finalView = await reader.read(), authorization = await reader.authorizationPath(finalView, original.binding.envelope);
        const period = flatCompletionWindow({ timestamp: finalView.head.timestamp,
          settleBefore: original.binding.settleBefore,
          receipts: operation(ref).receipts.map(({ opening }) => ({
            validFrom: opening.validFrom, validUntil: opening.validUntil })) });
        const nodeABI = await abi('node'), completionOpenings = [], completions = [], statements = [];
        for (let slot = 0; slot < 4; slot++) {
          const receipt = operation(ref).receipts.find(value => value.slot === slot);
          const job = await withFlatHash(hashFields => buildNodeInputs({ packet: packets.local[slot], authorization,
            stateOpening: finalView.stateOpening, evidenceState: finalView.evidenceState, revokedEntries: finalView.revokedEntries,
            receiptOpening: receipt?.opening ?? null, receiptPath: receipt ? receiptPath(finalView, receipt.leaf) : null,
            ...period, completionBlind: fresh() }, { hashFields, abi: nodeABI }));
          completionOpenings.push(job.completionOpening); statements.push(job.statement);
          completions.push(await prove(ref, 'node', job, 'slot-' + slot + '-completion'));
        }
        const settlementABI = await abi('settlement');
        const job = await withFlatHash(hashFields => buildSettlementInputs({ packet: packets.assembler, authorization,
          evidenceState: finalView.evidenceState, reservePath: shaPath(notePath(finalView, original.binding.reserveCommitment)),
          completions: completionOpenings, ...period }, { hashFields, abi: settlementABI }));
        joinSettlement(statements, job.statement);
        const settlement = await prove(ref, 'settlement', job, 'global-fulfillment');
        const permit = await currentHealth();
        await update(ref, { settlementStatement: job.statement });
        await stage(ref, 'submit-global-fulfillment');
        await send(ref, 'settlement', pool.address, encodeFlatTransaction('fulfillGeneric', { settlement, completions, ...healthFields(permit) }));
        const confirmed = await observedSubmission(ref, 'settlement');
        await update(ref, { outcome: 'FULFILLED', stage: 'FULFILLED' }); return confirmed;
      } catch (error) {
        // Observe the first error and last retained memory BEFORE an economic
        // state write can fail its original quorum/storage validation. This
        // diagnostic is never a durable commit or authority to resume/send.
        const diagnostic = nativeValueFailureDiagnostic(error), retained = operation(ref);
        const failure = { reference: ref, stage: 'execution-first-failure', diagnostic,
          retainedState: { stage: retained.stage, executionStarted: retained.executionStarted,
            nativeExposure: retained.exposures.map(({ slot, family, status }) => ({ slot, family, status })),
            admittedReceipts: retained.receipts.length }, authoritativeErrorCommit: 'NOT_ATTEMPTED' };
        // Only the existing private audit callback can inspect the original error.
        // It stays outside enumerable diagnostic/result projections and authority.
        Object.defineProperty(failure, 'originalError', { value: error });
        try { Promise.resolve(onPrivateAudit(failure)).catch(() => {}); } catch {} // reporting cannot replace the first error
        try {
          await update(ref, { errorCode: diagnostic.code, errorCauseCodes: diagnostic.causeCodes,
            ...(diagnostic.auditBudget ? { errorAuditBudget: diagnostic.auditBudget } : {}),
            stage: 'ORIGINAL_OUTCOME_UNRESOLVED' });
          try { Promise.resolve(onPrivateAudit({ reference: ref, stage: 'execution-error-commit', status: 'COMMITTED' })).catch(() => {}); } catch {}
          try { await onPrivateAudit({ reference: ref, stage: 'execution-failed', operation: detached(operation(ref)),
            errorCode: diagnostic.code, errorCauseCodes: diagnostic.causeCodes,
            ...(diagnostic.auditBudget ? { auditBudget: diagnostic.auditBudget } : {}) }); } catch {}
        } catch (commitError) {
          // write() retains its original poison-on-failure behavior. Never
          // bypass it, fabricate a commit, or replace the first failure.
          try { Promise.resolve(onPrivateAudit({ reference: ref, stage: 'execution-error-commit', status: 'UNAVAILABLE',
            diagnostic: nativeValueFailureDiagnostic(commitError) })).catch(() => {}); } catch {}
        }
        throw error;
      }
    }); },
    async reconcile(ref) {
      return exclusive(() => reconcileRetainedTerminalV2(ref, {
        operation, admissions: admissionAdapters, read: () => reader.read(),
        assertReceipt: receiptPath, update, observe: observedSubmission,
      }));
    },
    async recover(ref) {
      return exclusive(() => recoverRetainedTerminalV2(ref, {
        refresh: () => refreshNativeValueReceiverClock(runtime), operation,
        read: () => reader.read(), observe: observedSubmission, prefix, prove, update, stage, onStage,
        async prepare(entry, view) {
          const authorization = await reader.authorizationPath(view, entry.binding.envelope);
          return withFlatHash(hashFields => recoveryWitness(entry.prepared.rolePackets.recovery,
            {authorizationRoot: authorization.root, authorizationPath: fieldLeafPath(view.authorizationTree.path(authorization.index)),
              poolRoot: bare(view.ledger.tree.root), reservePath: shaLeafPath(notePath(view, entry.binding.reserveCommitment))}, {hashFields}));
        },
        send: (reference, proof) => send(reference, 'recovery', pool.address, encodeFlatTransaction('recoverGeneric', proof)),
      }));
    },
    snapshot(ref) { live(); const entry = operation(ref); return detached({ reference: ref, stage: entry.stage,
      outcome: entry.outcome, executionStarted: entry.executionStarted,
      nativeExposure: entry.exposures.map(({ slot, family, status }) => ({ slot, family, status })),
      admittedReceipts: entry.receipts.length, errorCode: entry.errorCode, errorCauseCodes: entry.errorCauseCodes ?? [],
      ...(entry.errorAuditBudget ? { errorAuditBudget: entry.errorAuditBudget } : {}),
      keeperRestart: false, nodeRestart: false, fullWalletAcceptance: false,claimsEnabled:wrapped }); },
    async abort() { assert.ok(wrapped || !capturing, 'NATIVE_EXECUTION_CAPTURE_OWNS_LIFETIME'); cancelled = true; for(const {adapter} of admissionAdapters.values())adapter.stop(); await proofs.abort(); await activeDone; return { aborted: true }; },
    async close() { if (closed) return { closed: true }; assert.ok(wrapped || !capturing, 'NATIVE_EXECUTION_CAPTURE_OWNS_LIFETIME'); await keeper.abort(); await proofs.close();const failures=[];
      for(const {adapter,provider} of admissionAdapters.values()){try{adapter.close();}catch(error){failures.push(error);}try{await provider.close();}catch(error){failures.push(error);}}
      closed = true; password = undefined; providerSets.clear();admissionAdapters.clear();
      if(failures.length)throw new AggregateError(failures,'NV2_EXECUTION_CLEANUP_FAILED');return { closed: true }; },
  });
  owners.set(keeper, { runtime, system, poolIndex, live, wrapped, reconcileRecovery, rewindRecoveryProbe,
    async sourceRetain(token){const identity=nativeSourceRecoverySectionIdentityV1(token,'executor');assert.ok(!wrapped&&!closed&&!poisoned&&!busy&&!cancelled&&!capturing&&!sourceHandle,'NATIVE_SOURCE_ORIGINAL_IDLE_EXECUTOR');assertOwnedNativeDurableSourceReceiverV1(runtime);assert.equal(nativeValueOriginalRecoverySourceV1(runtime,system),identity.sourceSHA256);await healthy();sourceIdentity=identity;sourceWrapper={schema:'ORIGINAL_NATIVE_EXECUTOR_DURABLE_SOURCE_V1',sourceSHA256:identity.sourceSHA256,ownedProcesses:[],confirmed:sourceSeed(),candidate:null};sourceHandle=await retainOriginalNativeSourceSectionV1(token,'executor',sourceWrapper);return {retainedOriginalSource:true};},
    async sourceResume(token,wrapper){const identity=nativeSourceRecoverySectionIdentityV1(token,'executor');assert.ok(!wrapped&&!closed&&!poisoned&&!busy&&!sourceHandle);assertOwnedNativeDurableSourceReceiverV1(runtime);await healthy();assert.equal(privateRecoveryDigest(sourceSeed()),privateRecoveryDigest(wrapper.confirmed),'NATIVE_SOURCE_EXECUTOR_SEED_CHANGED');sourceIdentity=identity;sourceWrapper=copy(wrapper);sourceHandle=resumeOriginalNativeSourceSectionV1(token,'executor');await sourceCheckpoint(null);},
    initialization(){assert.ok(wrapped&&!closed&&!capturing);return {directory,password,poolIndex};},
    fence(){assert.ok(wrapped&&!closed&&!poisoned&&!busy&&!cancelled&&!capturing,'WRAPPED_EXECUTION_ORIGINAL_CAPTURE_REQUIRED');capturing=true;
      captureProviders=[...providerSets].map(([reference,rows])=>({reference,providers:rows.map(row=>({...row}))}));
      captureProviderBindings=captureProviders.map(({reference,providers})=>({reference,providers:providers.map(({custody,...row})=>({...row,custodyIdentitySHA256:privateRecoveryDigest(ownedNativeValueProviderCustodyReview(custody,{runtime,system,poolIndex}))}))}));return captureProviders;},
    async capture(){
      if(!capturing)owners.get(keeper).fence();assert.ok(!captureStarted,'WRAPPED_EXECUTION_CAPTURE_ONCE');captureStarted=true;
      assert.deepEqual(await vault.read(password),record,'FLAT_EXECUTION_STORAGE_CHANGED');
      const providers=captureProviders,providerBindings=captureProviderBindings;
      return {record:{schema:'WRAPPED_ORIGINAL_EXECUTION_RECOVERY_V1',poolIndex,directory,password,checkpointSHA256:privateRecoveryDigest(record),providerBindings,
        adapters:[...admissionAdapters].map(([key,value])=>({key,slot:value.slot}))},providers};
    },
    nativeFence(authority) {
      const admitted = assertNativeEconomicRecoveryCaptureV1(authority);
      assert.ok(!wrapped && !closed && !poisoned && !busy && !cancelled && !capturing && !sourceHandle, 'NATIVE_EXECUTION_ORIGINAL_IDLE_REQUIRED');
      assert.equal(nativeValueOriginalRecoverySourceV1(runtime, system), admitted.sourceSHA256, 'NATIVE_EXECUTION_ORIGINAL_SOURCE_CHANGED');
      // Review while these exact providers are live; a later provider fence
      // must not require reopening any old economic capability for capture.
      const selected = [...providerSets].map(([reference, rows]) => ({ reference, providers: rows.map(row => ({ ...row })) }));
      const all = selected.flatMap(row => row.providers);
      assert.ok(all.every(row => row.slot === 0 && row.custody === all[0]?.custody), 'NATIVE_EXECUTION_FIXED_ORIGINAL_PROVIDER_REQUIRED');
      assert.ok(admissionAdapters.size <= 1, 'NATIVE_EXECUTION_ONE_ORIGINAL_LEASE_REQUIRED');
      const bindings = selected.map(({ reference, providers }) => ({ reference, providers: providers.map(({ custody, ...row }) =>
        ({ ...row, custodyIdentitySHA256: privateRecoveryDigest(nativeCustodyReview(custody, { runtime, system, poolIndex })) })) }));
      nativeCaptureIdentity = admitted; captureProviders = selected; captureProviderBindings = bindings; capturing = true;
    },
    async nativeCapture(token) {
      const admitted = nativeEconomicRecoverySectionIdentityV1(token, 'executor');
      assert.ok(!wrapped && capturing && !closed && !captureStarted, 'NATIVE_EXECUTION_ORIGINAL_CAPTURE_REQUIRED');
      assert.deepEqual(admitted, nativeCaptureIdentity); captureStarted = true;
      assert.deepEqual(await vault.read(password), record, 'FLAT_EXECUTION_STORAGE_CHANGED');
      nativeCaptureRecord = { schema: 'ORIGINAL_NATIVE_EXECUTION_ECONOMIC_RECOVERY_V1', sourceSHA256: admitted.sourceSHA256,
        poolIndex, directory, password, checkpointSHA256: privateRecoveryDigest(record), providerBindings: copy(captureProviderBindings),
        adapters: [...admissionAdapters].map(([key, value]) => ({ key, slot: value.slot })) };
      return copy(nativeCaptureRecord);
    },
    async nativeStop(token) {
      assert.deepEqual(nativeEconomicRecoverySectionIdentityV1(token, 'executor'), nativeCaptureIdentity);
      assert.ok(!wrapped && capturing && nativeCaptureRecord && !busy && !closed, 'NATIVE_EXECUTION_CAPTURE_OWNS_LIFETIME');
      // All admitted jobs have drained before fencing. These adapters own role
      // workers; provider key/journal lifetime belongs to the provider section.
      for (const { adapter } of admissionAdapters.values()) adapter.stop();
      await proofs.close();
      for (const { adapter } of admissionAdapters.values()) adapter.close();
      assert.equal(privateRecoveryDigest(await vault.read(password)), nativeCaptureRecord.checkpointSHA256, 'FLAT_EXECUTION_STORAGE_CHANGED');
      closed = true; password = undefined; providerSets.clear(); admissionAdapters.clear(); nativeCaptureRecord = null;
      return { closed: true, originalResourcesStopped: true };
    },
    async nativeAbort(token) {
      assert.deepEqual(nativeEconomicRecoverySectionIdentityV1(token, 'executor'), nativeCaptureIdentity);
      assert.ok(!wrapped && capturing, 'NATIVE_EXECUTION_CAPTURE_OWNS_LIFETIME');
      for (const { adapter } of admissionAdapters.values()) adapter.stop();
      await proofs.abort(); await activeDone; await proofs.close();
      for (const { adapter } of admissionAdapters.values()) adapter.close();
      closed = true; password = undefined; providerSets.clear(); admissionAdapters.clear();
      return { closed: true, originalResourcesStopped: true };
    },
    manualReview(ref) {
      live(); assert.ok(!cancelled, 'FLAT_EXECUTION_CANCELLED');
      const entry = operation(ref), selected = providerSets.get(ref), packets = entry.prepared.rolePackets;
      if(selected?.length!==1||selected[0]?.slot!==0||packets.dependency[0].dependency.value.dependencyCount!=='0')
        return buildOwnerNativeGraphRoute({binding:entry.binding,packets,selected,wrapped,
          reviewProvider:chosen=>ownedNativeValueProviderCustodyReview(chosen.custody,{runtime,system,poolIndex})});
      // Manual one-leg native flow has one original recipient approval and
      // keeps every accepted owner cutoff/quote term. Generic keeper slots remain four.
      assert.ok(selected?.length===1&&selected[0].slot===0,'NV2_EXECUTION_MANUAL_ONE_LEG');
      assert.equal(packets.dependency[0].dependency.value.dependencyCount,'0','NV2_EXECUTION_MANUAL_NO_DEPENDENCY');
      const chosen=selected[0],review=ownedNativeValueProviderCustodyReview(chosen.custody,{runtime,system,poolIndex});
      assert.equal(review.settleBefore,entry.binding.settleBefore,'NV2_EXECUTION_MANUAL_CUTOFF');
      assert.equal(review.payoutCommitment,packets.local[0].local.value.payoutCommitment,'NV2_EXECUTION_MANUAL_PAYOUT');
      return detached({ ...review, envelope: entry.binding.envelope,
        fundingNotBefore: packets.reservation.funding.value.fundingNotBefore,
        fundingValidUntil: packets.reservation.funding.value.fundingValidUntil });
    } });
  if(recovery){
    const restored=recovery.providers.map(({reference,providers})=>({reference,providers:providers.map(({custody,...row})=>({...row,
      custodyIdentitySHA256:privateRecoveryDigest(ownedNativeValueProviderCustodyReview(custody,{runtime,system,poolIndex}))}))}));
    assert.equal(privateRecoveryDigest(restored),privateRecoveryDigest(recovery.record.providerBindings),'WRAPPED_EXECUTION_ORIGINAL_PROVIDERS_CHANGED');
    for(const {reference,providers}of recovery.providers)providerSets.set(reference,Object.freeze(providers.map(row=>Object.freeze({...row}))));
    assert.deepEqual(recovery.adapters.map(({key,slot})=>({key,slot})),recovery.record.adapters,'WRAPPED_EXECUTION_ORIGINAL_ADAPTERS_CHANGED');
    try{for(const {key,slot,dispatchLease}of recovery.adapters){
      if (recovery.native) {
        const ref = key.slice(0, key.lastIndexOf(':')), retained = operation(ref);
        if (retained.recoverySubmission !== null || retained.settlementSubmission !== null
          || retained.receipts.some(value => value.slot === slot)) continue;
      }
      const provider=await createOwnedNativeValueProvider({runtime,system,poolIndex,dispatchLease});
      let adapter;try{adapter=await createOwnedNativeValueGraphAdmission({runtime,system,poolIndex,provider});}catch(error){await provider.close();throw error;}
      admissionAdapters.set(key,{adapter,provider,slot});
    }}catch(error){await keeper.close();throw error;}
  }
  return keeper;
}


export async function captureWrappedWalletExecutionForReopenV1(execution){
 const state=owners.get(execution);assert.ok(state?.wrapped,'WRAPPED_EXECUTION_ORIGINAL_REQUIRED');return state.capture();
}
export async function stopCapturedWrappedWalletExecutionV1(execution){
 const state=owners.get(execution);assert.ok(state?.wrapped,'WRAPPED_EXECUTION_ORIGINAL_REQUIRED');return execution.close();
}
export async function reopenWrappedWalletExecutionFromRecoveryV1(token){
 const {consumeWrappedWalletRecoveryPartV1}=await import('../../../operations/wallet/wrapped-wallet-composition-v1.mjs');
 const retained=consumeWrappedWalletRecoveryPartV1(token,'execution');exactRecord(retained,['input','record','providers','adapters']);
 exactRecord(retained.record,['schema','poolIndex','directory','password','checkpointSHA256','providerBindings','adapters']);
 assert.equal(retained.record.schema,'WRAPPED_ORIGINAL_EXECUTION_RECOVERY_V1');assert.equal(retained.input.poolIndex,retained.record.poolIndex);
 assertWrappedWalletAccountReleasedV1();return createExecution(retained.input,{},true,retained);
}

export function wrappedWalletExecutionPrivateInitializationV1(execution){const state=owners.get(execution);assert.ok(state?.wrapped);return state.initialization();}

export function fenceWrappedWalletExecutionRecoveryV1(execution){const state=owners.get(execution);assert.ok(state?.wrapped);return state.fence();}

/** Fixed native producers. Shape copies and wrapped/D26 tokens cannot mint an
 * executor, and no caller callback/role factory is accepted on reopening. */
export function fenceOriginalNativeExecutionEconomicRecoveryV1(execution, authority) {
  assert.equal(arguments.length, 2); const state = owners.get(execution);
  assert.ok(state?.wrapped === false, 'NATIVE_EXECUTION_ORIGINAL_REQUIRED'); return state.nativeFence(authority);
}
export function captureOriginalNativeExecutionEconomicRecoveryV1(execution, token) {
  assert.equal(arguments.length, 2); const state = owners.get(execution);
  assert.ok(state?.wrapped === false, 'NATIVE_EXECUTION_ORIGINAL_REQUIRED'); return state.nativeCapture(token);
}
export function stopCapturedNativeExecutionEconomicRecoveryV1(execution, token) {
  assert.equal(arguments.length, 2); const state = owners.get(execution);
  assert.ok(state?.wrapped === false, 'NATIVE_EXECUTION_ORIGINAL_REQUIRED'); return state.nativeStop(token);
}
export function abortNativeExecutionEconomicRecoveryV1(execution, token) {
  assert.equal(arguments.length, 2); const state = owners.get(execution);
  assert.ok(state?.wrapped === false, 'NATIVE_EXECUTION_ORIGINAL_REQUIRED'); return state.nativeAbort(token);
}
export async function reopenOriginalNativeExecutionEconomicRecoveryV1(token, contexts) {
  assert.equal(arguments.length, 2); exactRecord(contexts, ['runtime', 'system', 'nativeRuntime', 'bootstrap', 'providerCustody', 'dispatchLease']);
  const { runtime, system, nativeRuntime, bootstrap, providerCustody, dispatchLease } = contexts;
  const admitted = nativeEconomicRecoverySectionIdentityV1(token, 'executor');
  assert.equal(nativeValueOriginalRecoverySourceV1(runtime, system), admitted.sourceSHA256);
  const retained = consumeNativeEconomicRecoverySectionV1(token, 'executor');
  exactRecord(retained, ['schema', 'sourceSHA256', 'poolIndex', 'directory', 'password', 'checkpointSHA256', 'providerBindings', 'adapters']);
  assert.equal(retained.schema, 'ORIGINAL_NATIVE_EXECUTION_ECONOMIC_RECOVERY_V1');
  assert.equal(retained.sourceSHA256, admitted.sourceSHA256);
  nativeCustody(providerCustody, { runtime, system, poolIndex: retained.poolIndex });
  const profileCommitment = providerCustody.offer().evidencePolicy;
  assertNativeValueBootstrapNativeRuntime(bootstrap, { runtime, system, nativeRuntime, profileCommitment });
  return restoreOriginalNativeExecution(retained,contexts);
}
async function restoreOriginalNativeExecution(retained,contexts){
  const {runtime,system,providerCustody,dispatchLease}=contexts;
  const providers = retained.providerBindings.map(({ reference, providers }) => ({ reference,
    providers: providers.map(({ custodyIdentitySHA256, ...row }) => {
      assert.equal(row.slot, 0, 'NATIVE_EXECUTION_FIXED_ORIGINAL_PROVIDER_REQUIRED');
      assert.equal(privateRecoveryDigest(nativeCustodyReview(providerCustody, { runtime, system, poolIndex: retained.poolIndex })), custodyIdentitySHA256);
      return { ...row, custody: providerCustody };
    }) }));
  assert.ok(retained.adapters.length <= 1);
  const adapters = retained.adapters.map(row => { exactRecord(row, ['key', 'slot']); assert.equal(row.slot, 0);
    assert.ok(dispatchLease !== null, 'NATIVE_EXECUTION_ORIGINAL_LEASE_REQUIRED'); return { ...row, dispatchLease }; });
  return createExecution({ runtime, system, poolIndex: retained.poolIndex, quorum: system.quorum }, {}, false,
    { native: true, record: retained, providers, adapters });
}

export function retainOriginalNativeExecutorSourceV1(token,execution){assert.equal(arguments.length,2);const state=owners.get(execution);assert.ok(state&&!state.wrapped,'NATIVE_SOURCE_ORIGINAL_EXECUTOR');return state.sourceRetain(token);}
export async function reopenOriginalNativeExecutorSourceV1(token,contexts){
 assert.equal(arguments.length,2);exactRecord(contexts,['runtime','system','nativeRuntime','bootstrap','providerCustody','dispatchLease']);assertOwnedNativeDurableSourceReceiverV1(contexts.runtime);const identity=nativeSourceRecoverySectionIdentityV1(token,'executor'),wrapper=consumeOriginalNativeSourceSectionV1(token,'executor');assert.equal(wrapper.schema,'ORIGINAL_NATIVE_EXECUTOR_DURABLE_SOURCE_V1');assert.equal(wrapper.candidate,null);assert.equal(wrapper.sourceSHA256,identity.sourceSHA256);const retained=wrapper.confirmed;exactRecord(retained,['schema','poolIndex','directory','password','checkpointSHA256','providerBindings','adapters']);assert.equal(retained.schema,'ORIGINAL_NATIVE_EXECUTOR_SOURCE_SEED_V1');assert.equal(nativeValueOriginalRecoverySourceV1(contexts.runtime,contexts.system),identity.sourceSHA256);nativeCustody(contexts.providerCustody,{runtime:contexts.runtime,system:contexts.system,poolIndex:retained.poolIndex});
 assertNativeValueBootstrapNativeRuntime(contexts.bootstrap,{runtime:contexts.runtime,system:contexts.system,nativeRuntime:contexts.nativeRuntime,profileCommitment:contexts.providerCustody.offer().evidencePolicy});const execution=await restoreOriginalNativeExecution(retained,contexts);try{await owners.get(execution).sourceResume(token,wrapper);return execution;}catch(error){try{await execution.close();}catch{}throw error;}
}
