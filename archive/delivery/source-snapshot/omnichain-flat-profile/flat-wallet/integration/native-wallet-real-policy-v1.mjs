/** Source-only gates. Only the main task may review an exact installed release.
 * No environment, CLI, caller profile, retained receipt or old run opens a gate. */
import assert from 'node:assert/strict';
export { NATIVE_WALLET_UNFUNDED_RELEASE_V1, NATIVE_WALLET_REAL_RELEASE_V1 } from './native-wallet-real-release-v4.mjs';
export const NATIVE_WALLET_RESULT_V1 = 'NATIVE_VALUE_REAL_WALLET_ACCEPTANCE_RESULT_V1';
export const NATIVE_WALLET_PREFLIGHT_RESULT_V1 = 'NATIVE_VALUE_REAL_WALLET_UNFUNDED_RESULT_V1';
export const NATIVE_WALLET_ECONOMICS_V1 = Object.freeze({ sourceDepositAtomic: '50000',
  solverPayoutAtomic: '10000', sourceChangeAtomic: '40000', solverNativeDeliveryAtomic: '100000' });
// Derived from this fixed driver's D26, original owner U, account S, one P/R/I,
// four ordinary completion slots, T, recipient W39 and owner-change W39 calls.
export const NATIVE_WALLET_PROOF_ROLES_V1 = Object.freeze([
  ['deposit_balance', 26], ['authorization', 16], ['reservation', 58], ['dependency', 42], ['ready', 50],
  ['admission_native_value_v2', 84], ['node', 32], ['node', 32], ['node', 32], ['node', 32],
  ['settlement', 138], ['withdraw_balance', 39], ['withdraw_balance', 39],
].map(Object.freeze));
export const NATIVE_WALLET_REQUEST_IDS_V1 = Object.freeze(['native_top_up', 'native_value_graph', 'native_change_exit']);
const digest = value => assert.match(value, /^[0-9a-f]{64}$/);
export function assertNativeWalletUnfundedResult(result) {
  assert.equal(result.format, NATIVE_WALLET_PREFLIGHT_RESULT_V1);
  common(result); assert.deepEqual(result.proofs, []); assert.equal(result.admissionProof, null);
  assert.equal(result.funded, false); assert.equal(result.nativeDeliveryCount, 0);
  assert.equal(result.preflight.confirmedSourceValueTransfers, 0);
  assert.equal(result.preflight.manualReviewCancelledWithoutConsent, true);
  assert.equal(result.preflight.sourcePoolBalance, '0');
  assert.equal(result.fullWalletAcceptance, false);
  return { scope: 'ONE_GENUINE_UNFUNDED_EVM_NATIVE_WALLET_PREFLIGHT', funded: false, fullWalletAcceptance: false };
}
function common(result) {
  assert.equal(result.phase, 'completed'); assert.equal(result.success, true);
  assert.equal(result.localOnly, true); assert.equal(result.fakeFundsOnly, true); assert.equal(result.publicNetwork, false);
  assert.equal(result.sourceUnchanged, true); assert.equal(result.cleanup.closedEvm, true); assert.equal(result.cleanup.closedNativeEvm, true);
  assert.equal(result.keeperRestart, false); assert.equal(result.nodeRestart, false);
  const pre = result.preflight;
  for (const key of ['genuineArtifactsLoadedBeforeRuntimes', 'genuineOriginalFactories', 'constructorStorageVerified',
    'sameOriginalFixture', 'sameOriginalOwnerAccountSession', 'exactRegisteredNativeProfile', 'allTwelveVerifierLineages',
    'emptyCurrentFullInventoryHealth', 'nativeDeliveryAbsent', 'sourceFundingAbsent']) assert.equal(pre[key], true, key);
  assert.equal(result.nativeProfile.chainId, '1'); assert.equal(result.nativeProfile.publicNetwork, false);
  assert.equal(result.nativeProfile.productionClientAcceptance, 'UNVERIFIED');
  assert.equal(result.nativeProfile.publicConsensusOrFinalityVerified, false);
  digest(result.artifacts.provenanceSHA256); digest(result.artifacts.admissionKeySHA256);
}
export function assertNativeWalletRealResult(result) {
  assert.equal(result.format, NATIVE_WALLET_RESULT_V1); common(result);
  assert.equal(result.funded, true); assert.equal(result.nativeDeliveryCount, 1);
  assert.deepEqual(result.economics, NATIVE_WALLET_ECONOMICS_V1);
  assert.deepEqual(result.proofs.map(p => [p.relation, p.publicWords]),
    NATIVE_WALLET_PROOF_ROLES_V1.filter(([role]) => role !== 'admission_native_value_v2'));
  assert.equal(result.admissionProof.relation, 'admission_native_value_v2'); assert.equal(result.admissionProof.publicWords, 84);
  for (const p of [...result.proofs, result.admissionProof]) { digest(p.proofSHA256); digest(p.publicInputsSHA256); }
  assert.equal(result.admissionProof.originalCanonicalCall, true); assert.equal(result.admissionProof.deployedVerifierAccepted, true);
  assert.equal(result.admissionProof.originalI84ArtifactBound, true);
  assert.deepEqual(result.health.map(h => h.phase), ['empty', 'loaded-before-authorization', 'reserved-before-native', 'settled-loaded', 'closed']);
  assert.deepEqual(result.health.map(h => h.inventoryCounts), [['0','0','0'], ['0','0','0'], ['0','0','0'], ['1','1','1'], ['1','1','1']]);
  for (const h of result.health) { assert.equal(h.exactCurrentHead, true); assert.equal(h.fullInventories, true); assert.equal(h.blockers, 0); assert.equal(h.originalThirtySecondGuard, true); }
  for (const key of ['ownerAbsentDuringNativeAndSettlement', 'ordinaryFourSlotNTSettlement', 'ownerRestartedOriginal',
    'recipientReopenedOriginal', 'sameSessionReopened', 'oldListenerGrantRejected', 'duplicateRequestsNoEffect',
    'payoutReplayRejected', 'exactSourceConservation', 'exactNativeConservation', 'sourceReservationClosed']) assert.equal(result.acceptance[key], true, key);
  assert.deepEqual(result.confirmedRequestIds, NATIVE_WALLET_REQUEST_IDS_V1);
  assert.deepEqual(result.finalAccounting, { sourcePoolBacked: '0', sourcePoolActual: '0', unusedPoolBacked: '0', unusedPoolActual: '0', liveReservations: 0,
    sourceChangeDelta: '40000', solverPayoutDelta: '10000', nativeRecipientDelta: '100000', nativeSenderValueAndGasAccounted: true, receiverFundingAndGasAccounted: true });
  const e = result.httpEvidence;
  for (const requestId of NATIVE_WALLET_REQUEST_IDS_V1) for (const action of ['prepare','execute','reconcile'])
    assert.ok(e.some(r => r.requestId === requestId && r.action === action && r.via === 'NODE_SDK_EXACT_ONLY_HTTP'
      && r.httpAdmission === 'VOLATILE_UI_QUEUE_ONLY'));
  for (const requestId of NATIVE_WALLET_REQUEST_IDS_V1) for (const action of ['accountPrepare','accountExecute','accountReconcile']) {
    const confirmations=e.filter(r=>r.requestId===requestId&&r.action===action&&r.check==='EXPLICIT_HANDOFF_CONFIRMATION');
    assert.ok(confirmations.length>0);
    for(const c of confirmations) assert.equal(e.filter(r=>r.check==='TOKENLESS_HANDOFF_COMMITMENT_VERIFIED'
      &&r.reviewId===c.reviewId&&r.listenerId===c.listenerId&&r.requestId===requestId&&r.action===action).length,1);
    assert.ok(e.some(r=>r.requestId===requestId&&r.action===action&&r.check==='USED_EXACT_GRANT_REJECTED'));
  }
  assert.equal(result.fullWalletAcceptance, false); assert.equal(result.actualFRecoveryAcceptance, false);
  return { scope: 'ONE_GENUINE_LOCAL_EVM_NATIVE_WALLET_GRAPH_AND_NOTE_CLOSURE',
    genuineNativeValueGraphAccepted: true, fullWalletAcceptance: false, actualFRecoveryAcceptance: false };
}
