/** Explicit source opt-in, fixed complete graph outcome. Importing is pure. */
import assert from 'node:assert/strict';
import { validateClaimGraphV3CommonResult, CLAIM_GRAPH_PROOF_COUNTS } from './native-claim-graph-artifacts.mjs';
import { CLAIM_GRAPH_V3_NATIVE_PROTOCOL } from './native-claim-graph-v3-nonce-checks.mjs';
import { NATIVE_INGRESS_V3_RELATION, NATIVE_INGRESS_V3_SOURCE_VERSION, NATIVE_INGRESS_V3_KEY_SHA256 }
  from '../proof-workers/native-ingress-v3-profile.mjs';
export const CLAIM_GRAPH_V3_REAL_RUN_DISABLED = true;
export const CLAIM_GRAPH_V3_PROFILE = 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH_INGRESS_V3';
export const CLAIM_GRAPH_V3_PROOF_COUNTS = Object.freeze(Object.fromEntries(Object.entries(CLAIM_GRAPH_PROOF_COUNTS)
  .map(([relation, count]) => [relation === 'native_claim_ingress' ? NATIVE_INGRESS_V3_RELATION : relation, count])));
export function validateClaimGraphV3Result(result) {
  validateClaimGraphV3CommonResult(result);
  assert.equal(result.fullNativeGraphAcceptance, true, 'CLAIM_GRAPH_V3_FULL_PATH_REQUIRED');
  assert.equal(result.ingressRelation, NATIVE_INGRESS_V3_RELATION);
  assert.equal(result.ingressSourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION);
  assert.equal(result.ingressKeySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
  assert.equal(result.acceptance.nonceIngressObserved, true);
  assert.deepEqual(result.nativeProtocol, CLAIM_GRAPH_V3_NATIVE_PROTOCOL);
  assert.deepEqual(result.nonceInfrastructure, { profile: 'SYNTHETIC_DUAL_NONCE_INFRASTRUCTURE_NOT_USER_BACKING',
    bootstrapFinalized: true, bootstrapBroadcastOnce: true, independentBootstrapCount: 2,
    createInstruction: 0, initializeInstruction: 1, separatePayers: true, depositorAndEscrowAuthorities: true,
    claimAccountCount: 3, infrastructureAccountCount: 4, rentExcludedFromUserBacking: true,
    bootstrapFeeExcludedFromClaimFees: true, bootstrapExcludedFromClaimTransfers: true,
    depositorFeesSeparateFromEscrowReserve: true, nonceAdvancedWithObservedIngress: true, nonceAdvancedWithObservedPayout: true });
  const counts = {};
  for (const proof of result.proofs) {
    counts[proof.relation] = (counts[proof.relation] ?? 0) + 1;
    if (proof.relation === NATIVE_INGRESS_V3_RELATION) {
      assert.equal(proof.evidence.relation, NATIVE_INGRESS_V3_RELATION);
      assert.equal(proof.evidence.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION);
      assert.equal(proof.evidence.keySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
      assert.equal(proof.evidence.selfVerified, true);
    }
  }
  assert.deepEqual(counts, CLAIM_GRAPH_V3_PROOF_COUNTS, 'CLAIM_GRAPH_V3_EXACT_PROOF_COUNTS');
  const replay = result.claimFundedGraph.solverPayoutReplay;
  assert.equal(replay.status, 'REJECTED_WITHOUT_SECOND_PAYOUT');
  assert.ok(['ASSET_INSUFFICIENT_BACKING', 'NOTE_ALREADY_SPENT'].includes(replay.actualReason));
  for (const key of ['exactOriginalProofAndNullifier', 'originalNullifierRemainsSpent',
    'claimTokenPoolNativeAccountingUnchanged', 'protocolStateAndHistoryUnchanged', 'gasFeePaid']) assert.equal(replay[key], true);
  assert.equal(replay.logs, 0); assert.equal(replay.additionalTransactions, 1); assert.equal(replay.senderNonceIncrease, 1);
  assert.equal(replay.nativePrincipalTransferred, '0');
  return Object.freeze({ profile: CLAIM_GRAPH_V3_PROFILE, fullNativeGraphAcceptance: true,
    fullWalletAcceptance: false, originalClaimSplitAndNativeRedemptions: true, originalCutoffRefund: true,
    separateDepositorAndEscrowNonces: true, independentSolverLiquidity: true, economicReplayRejected: true });
}
