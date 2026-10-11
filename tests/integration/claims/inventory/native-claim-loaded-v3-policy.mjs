/** Fixed disabled V3 loaded redemption unit. Pure source/result predicates;
 * no entrypoint, fixture, clock, key, transaction or arbitrary profile input. */
import assert from 'node:assert/strict';
import { CLAIM_GRAPH_V3_NATIVE_PROTOCOL } from '../graph/validation/native-claim-graph-v3-nonce-checks.mjs';
import { NATIVE_INGRESS_V3_RELATION, NATIVE_INGRESS_V3_SOURCE_VERSION, NATIVE_INGRESS_V3_KEY_SHA256 }
  from '@lianum/proofs/native-ingress/metadata/native-ingress-v3-profile';
export const CLAIM_LOADED_V3_REAL_RUN_DISABLED = true;
export const CLAIM_LOADED_V3_PROFILE = 'SOLANA_LOADED_POST_DELIVERY_REDEMPTION_INGRESS_V3';
export const CLAIM_LOADED_V3_SCOPE = 'LOADED_POST_DELIVERY_REDEMPTION_INGRESS_V3_ONLY';
export function assertLoadedV3ProofBoundary(relations, phase) {
  assert.ok(['issued', 'redeemed'].includes(phase), 'CLAIM_LOADED_V3_PROOF_PHASE');
  assert.deepEqual(relations, ['deposit_intent', NATIVE_INGRESS_V3_RELATION,
    ...(phase === 'redeemed' ? ['withdraw_balance', 'native_claim_discharge'] : [])],
  'CLAIM_LOADED_V3_EXACT_PROOF_BOUNDARY');
}

/** Project only existing consumed original-authorization evidence. This pure
 * assertion does not manufacture provenance from a serialized journal. The
 * worker obtains the journal from its original live owned controller keeper. */
export function captureLoadedV3RedemptionAudit(records) {
  assert.ok(Array.isArray(records), 'CLAIM_LOADED_V3_EVM_HISTORY');
  const matches = records.filter(row => row.stage === 'REDEEM' && row.method === 'requestRedemption');
  assert.equal(matches.length, 1, 'CLAIM_LOADED_V3_ONE_REDEMPTION_DISPATCH');
  const row = matches[0], audit = row.finalAudit;
  assert.equal(row.status, 'SUCCEEDED', 'CLAIM_LOADED_V3_REDEMPTION_INCLUDED');
  assert.equal(row.receipt?.status, '0x1', 'CLAIM_LOADED_V3_REDEMPTION_RECEIPT');
  assert.ok(row.signed?.nativeId && row.signed?.nativeWire && row.prepared, 'CLAIM_LOADED_V3_ORIGINAL_PREPARATION');
  assert.equal(audit?.profile, 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4', 'CLAIM_LOADED_V3_FINAL_AUDIT_PROFILE');
  assert.equal(audit.phase, 'CONSUMED_BEFORE_KEY', 'CLAIM_LOADED_V3_FINAL_AUDIT_CONSUMED');
  assert.equal(audit.limitMilliseconds, 30_000, 'CLAIM_LOADED_V3_FINAL_AUDIT_LIMIT');
  assert.ok(Number.isSafeInteger(audit.auditElapsedMilliseconds) && audit.auditElapsedMilliseconds >= 0
    && audit.auditElapsedMilliseconds < 30_000, 'CLAIM_LOADED_V3_FINAL_AUDIT_BUDGET');
  for (const key of ['originalAuthorizationSHA256', 'preparedSHA256']) assert.match(audit[key], /^[0-9a-f]{64}$/);
  return { profile: audit.profile, phase: audit.phase, limitMilliseconds: audit.limitMilliseconds,
    finalAuditWithinBudget: true, redemptionReceiptSucceeded: true,
    originalAuthorizationSHA256: audit.originalAuthorizationSHA256, preparedSHA256: audit.preparedSHA256 };
}

export function validateClaimLoadedV3Result(result) {
  assert.equal(result.profile, CLAIM_LOADED_V3_PROFILE, 'CLAIM_LOADED_V3_RESULT_PROFILE');
  assert.equal(result.fullNativeGraphAcceptance, false, 'CLAIM_LOADED_V3_SCOPE');
  assert.equal(result.fullWalletAcceptance, false, 'CLAIM_LOADED_V3_SCOPE');
  assert.equal(result.claimFundedGraph, undefined, 'CLAIM_LOADED_V3_NO_GRAPH_EXECUTION');
  assert.deepEqual(result.selectedAssets, [1], 'CLAIM_LOADED_V3_SCOPE');
  assert.equal(result.claimCollectionProfile, 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3');
  assert.equal(result.claimAuthorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4');
  assert.equal(result.payoutFinalSendProfile, 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2');
  assert.equal(result.ingressRelation, NATIVE_INGRESS_V3_RELATION);
  assert.equal(result.ingressSourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION);
  assert.equal(result.ingressKeySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
  assertLoadedV3ProofBoundary(result.proofs?.map(proof => proof.relation), 'redeemed');
  const ingress = result.proofs[1].evidence;
  assert.equal(ingress?.relation, NATIVE_INGRESS_V3_RELATION);
  assert.equal(ingress.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION);
  assert.equal(ingress.keySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
  assert.equal(ingress.selfVerified, true);
  assert.deepEqual(result.nativeProtocol, CLAIM_GRAPH_V3_NATIVE_PROTOCOL);
  assert.deepEqual(result.nonceInfrastructure, { profile: 'SYNTHETIC_DUAL_NONCE_INFRASTRUCTURE_NOT_USER_BACKING',
    bootstrapFinalized: true, bootstrapBroadcastOnce: true, independentBootstrapCount: 2,
    createInstruction: 0, initializeInstruction: 1, separatePayers: true, depositorAndEscrowAuthorities: true,
    claimAccountCount: 3, infrastructureAccountCount: 4, rentExcludedFromUserBacking: true,
    bootstrapFeeExcludedFromClaimFees: true, bootstrapExcludedFromClaimTransfers: true,
    depositorFeesSeparateFromEscrowReserve: true, nonceAdvancedWithObservedIngress: true, nonceAdvancedWithObservedPayout: true });
  const probe = result.loadedFactsProbe;
  assert.equal(probe?.scope, CLAIM_LOADED_V3_SCOPE, 'CLAIM_LOADED_V3_SCOPE');
  for (const key of ['success', 'factualChecksPassed', 'ownerClaimFullyRedeemed', 'originalFinalizedOnce', 'retainedOriginalClaimBinding',
    'health', 'checkpoint', 'sameEvmHead', 'custodyUnchanged', 'solverSeparateLiquidity', 'noAttestationTransactionSubmitted'])
    assert.equal(probe[key], true, 'CLAIM_LOADED_V3_INCOMPLETE');
  for (const key of ['providerProofs', 'graphSettlement', 'fullNativeGraphAcceptance']) assert.equal(probe[key], false, 'CLAIM_LOADED_V3_SCOPE');
  assert.equal(probe.issuedClaimAmount, '3000000'); assert.equal(probe.solverNativeAmount, '1000000');
  assert.equal(probe.factsCalls, 1); assert.equal(probe.retainedGraphFactPerSigner, 1);
  for (const key of ['requestedNativeAssetsIssued', 'ownerOfflineIssue', 'originalNotesCreditedOnce', 'coherentPrivateAccount',
    'requestedNativeRedemptions', 'allClaimLiabilitiesClosed', 'nonceBootstrapFinalized', 'nonceInfrastructureExcluded',
    'nonceIngressObserved', 'noncePayoutObserved', 'nonceAdvanceBoundToOriginal']) assert.equal(result.acceptance?.[key], true, 'CLAIM_LOADED_V3_ACCEPTANCE');
  assert.equal(result.acceptance.expiredOriginalSourceRefund, false, 'CLAIM_LOADED_V3_NO_REFUND');
  assert.deepEqual(result.redemptions, [{ assetIndex: 1, amount: '3000000', status: 'DISCHARGED', duplicateHadNoEffect: true }]);
  assert.deepEqual(result.nativeEffects, { bitcoin: 0, solana: 2, eachBroadcastOnce: true });
  assert.equal(result.finalNativeInventoryCaptured, true, 'CLAIM_LOADED_V3_FINAL_INVENTORY');
  assert.equal(result.finalGraphBalancesReobserved, true, 'CLAIM_LOADED_V3_FINAL_GRAPH_BALANCES');
  assert.equal(result.finalClaimState?.length, 2, 'CLAIM_LOADED_V3_FINAL_CLAIMS');
  for (const [i, gateway] of result.finalClaimState.entries()) {
    for (const name of ['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees'])
      assert.equal(gateway[name], '0', 'CLAIM_LOADED_V3_OPEN_LIABILITY');
    assert.equal(gateway.intentCount, String(i)); assert.equal(gateway.ticketCount, String(i));
  }
  assert.equal(result.redemptionAuthorization?.profile, 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4');
  assert.equal(result.redemptionAuthorization.phase, 'CONSUMED_BEFORE_KEY');
  assert.equal(result.redemptionAuthorization.limitMilliseconds, 30_000);
  assert.equal(result.redemptionAuthorization.finalAuditWithinBudget, true);
  assert.equal(result.redemptionAuthorization.redemptionReceiptSucceeded, true);
  for (const name of ['originalAuthorizationSHA256', 'preparedSHA256']) assert.match(result.redemptionAuthorization[name], /^[0-9a-f]{64}$/);
  return Object.freeze({ profile: CLAIM_LOADED_V3_PROFILE, scope: CLAIM_LOADED_V3_SCOPE,
    fullNativeGraphAcceptance: false, fullWalletAcceptance: false, ownerClaimFullyRedeemed: true,
    originalAuthorizationFinalUseValidated: true, allClaimLiabilitiesClosed: true });
}
