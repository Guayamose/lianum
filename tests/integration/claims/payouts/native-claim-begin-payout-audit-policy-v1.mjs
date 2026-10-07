/** A partial, terminal audit gate. This cannot validate full redemption. */
import assert from 'node:assert/strict';
import { CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, assertBeginPayoutAuditReceiptV1 }
  from '../../../../packages/backend/src/claims/payouts/begin-payout-audit-policy-v1.mjs';
import { CLAIM_GRAPH_V3_NATIVE_PROTOCOL } from '../graph/validation/native-claim-graph-v3-nonce-checks.mjs';
import { NATIVE_INGRESS_V3_RELATION, NATIVE_INGRESS_V3_SOURCE_VERSION, NATIVE_INGRESS_V3_KEY_SHA256 }
  from '../../../../packages/proofs/src/native-ingress/metadata/native-ingress-v3-profile.mjs';
export const BEGIN_PAYOUT_AUDIT_RESULT_V1 = 'LIANUM_SOL_BEGIN_PAYOUT_BACKING_AUDIT_RESULT_V1';
export function assertBeginPayoutAuditResultV1(result) {
  assert.equal(result.format, BEGIN_PAYOUT_AUDIT_RESULT_V1); assert.equal(result.profile, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1);
  assert.equal(result.boundaryReached, true); assert.equal(result.boundaryAccepted, true); assert.equal(result.completeRedemption, false);
  assert.equal(result.fullWalletAcceptance, false); assert.equal(result.fullNativeGraphAcceptance, false);
  assert.equal(result.independentOperators, false); assert.equal(result.nativeSelfCustody, false);
  assert.equal(result.localOnly, true); assert.equal(result.fakeFundsOnly, true); assert.equal(result.publicNetwork, false);
  assert.equal(result.ingressRelation, NATIVE_INGRESS_V3_RELATION);
  assert.equal(result.ingressSourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION); assert.equal(result.ingressKeySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
  assert.deepEqual(result.nativeProtocol, CLAIM_GRAPH_V3_NATIVE_PROTOCOL);
  assert.equal(result.payoutFinalSendProfile, 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2');
  assert.equal(result.acceptance.allClaimLiabilitiesClosed, false); assert.equal(result.acceptance.requestedNativeRedemptions, false);
  assert.equal(result.acceptance.expiredOriginalSourceRefund, false); assert.deepEqual(result.redemptions, []);
  assert.equal(result.claimFundedGraph, undefined); assert.equal(result.expiredDepositRefund, undefined);
  assert.deepEqual(result.selectedAssets, [1]);
  assert.deepEqual(result.proofs.map(row => row.relation), ['deposit_intent', NATIVE_INGRESS_V3_RELATION, 'withdraw_balance']);
  assert.equal(result.proofs[1].evidence?.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION);
  assert.equal(result.proofs[1].evidence?.keySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
  assert.equal(result.proofs[1].evidence?.selfVerified, true);
  assert.equal(result.claimCollectionProfile, 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3');
  assert.equal(result.claimAuthorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4');
  assert.equal(result.redemptionAuthorization?.profile, 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4');
  assert.equal(result.redemptionAuthorization?.phase, 'CONSUMED_BEFORE_KEY');
  assert.equal(result.redemptionAuthorization?.finalAuditWithinBudget, true);
  assert.equal(result.redemptionAuthorization?.redemptionReceiptSucceeded, true);
  assert.equal(result.redemptionAuthorization?.limitMilliseconds, 30000);
  for (const key of ['originalAuthorizationSHA256', 'preparedSHA256']) assert.match(result.redemptionAuthorization[key], /^[0-9a-f]{64}$/);
  assertBeginPayoutAuditReceiptV1(result.beginPayoutAudit);
  assert.deepEqual(result.auditTerminal, { beginPayoutRequests: 0, evmRequestsUnchanged: true,
    nativePayoutPresignReached: false, nativePayoutKeyAuthorityCreated: false,
    nativePayoutSigningReached: false, nativePayoutSendReached: false,
    custodySolTransfers: 1, custodyBtcTransfers: 0, graphSolTransfers: 1, graphBtcTransfers: 0,
    originalEffectsUnchanged: true, preparationUnwound: true, originalHeadUnchanged: true,
    pendingRedemptions: '3000000', reservedFees: '5000', wrapperSupply: '0',
    pendingRefunds: '0', heldUnissued: '0', activePayoutIsZero: true,
    solTicketState: '1', solIntentCount: '1', solTicketCount: '1', completedRedemptions: 0 });
  assert.equal(result.loadedFactsProbe?.factualChecksPassed, true);
  assert.equal(result.loadedFactsProbe?.issuedClaimAmount, '3000000');
  assert.equal(result.loadedFactsProbe?.solverNativeAmount, '1000000');
  assert.equal(result.loadedFactsProbe?.retainedGraphFactPerSigner, 1);
  assert.equal(result.loadedFactsProbe?.factsCalls, 1);
  for (const key of ['solverSeparateLiquidity', 'originalFinalizedOnce', 'retainedOriginalClaimBinding',
    'health', 'checkpoint', 'sameEvmHead', 'custodyUnchanged', 'noAttestationTransactionSubmitted'])
    assert.equal(result.loadedFactsProbe[key], true);
  for (const key of ['ownerClaimFullyRedeemed', 'providerProofs', 'graphSettlement', 'fullNativeGraphAcceptance'])
    assert.equal(result.loadedFactsProbe[key], false);
  const stopped = result.ownerStops.filter(row => row.phase === 'after-source-exit-before-audit-redemption');
  assert.equal(stopped.length, 1); assert.equal(stopped[0].assetIndex, 1);
  assert.equal(stopped[0].ownerAbsent, true); assert.equal(stopped[0].childExited, true);
  assert.equal(result.finalNativeInventoryCaptured, true); assert.equal(result.finalGraphBalancesReobserved, true);
  return Object.freeze({ profile: CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, boundaryAccepted: true,
    completeRedemption: false, allClaimLiabilitiesClosed: false, fullWalletAcceptance: false,
    fullNativeGraphAcceptance: false, pendingRedemptions: '3000000', reservedFees: '5000' });
}
