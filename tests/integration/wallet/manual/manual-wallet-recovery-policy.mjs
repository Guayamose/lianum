/** Fixed local timeout-F acceptance. This is distinct from the SDK happy path,
 * preserves the intentional post-delivery interruption and reports solver loss. */
import assert from 'node:assert/strict';
export const MANUAL_WALLET_RECOVERY_FORMAT = 'FLAT_MANUAL_WALLET_TIMEOUT_RECOVERY_RESULT_V1';
export const MANUAL_WALLET_RECOVERY_PROOFS = Object.freeze(['deposit_balance', 'deposit_intent', 'authorization',
  'reservation', 'dependency', 'ready', 'recovery']);

export function assertManualWalletRecoveryResult(result) {
  assert.equal(result.format, MANUAL_WALLET_RECOVERY_FORMAT);
  assert.equal(result.phase, 'completed'); assert.equal(result.success, true);
  for (const field of ['localOnly', 'fakeFundsOnly', 'sourceUnchanged', 'manualConsentContractVerified',
    'actualTimeoutFRecoveryAcceptance', 'controlledPostDeliveryInterruption', 'targetOwnerExitedBeforeDelivery',
    'targetOwnerSuspendedAfterExactHttpAdmission']) assert.equal(result[field], true, field);
  for (const field of ['publicNetwork', 'walletSdkEvmFlowCompleted', 'privateVaultGraphAcceptance',
    'fullWalletAcceptance', 'keeperRestart', 'nodeRestart', 'systemicPrivacyAcceptance', 'performanceTargetAchieved'])
    assert.equal(result[field], false, field);
  assert.equal(result.cleanup.closedEvm, true);
  assert.deepEqual(result.proofs.map(row => row.relation), MANUAL_WALLET_RECOVERY_PROOFS);
  for (const row of result.proofs) {
    assert.match(row.proofSHA256, /^[0-9a-f]{64}$/);
    assert.match(row.publicInputsSHA256, /^[0-9a-f]{64}$/);
  }
  assert.equal(result.expectedInterruptionCode, 'MANUAL_ACCEPTANCE_CONTROLLED_AFTER_DELIVERY');
  assert.equal(result.expectedInterruptionPreserved, true);
  assert.equal(result.actualAdmissionFailureCode, 'FLAT_ACCOUNT_OPERATION_FAILED');
  const failed = result.originalFailedAdmission;
  assert.equal(failed.action, 'execute'); assert.equal(failed.requestId, 'private_vault_graph');
  assert.equal(failed.state, 'FAILED'); assert.equal(failed.errorCode, result.actualAdmissionFailureCode);
  assert.ok(Number.isSafeInteger(failed.sequence) && failed.sequence > 0);
  assert.equal(result.nativeEffects.evmVault, 1);
  const recovered = result.failureRecovery;
  for (const field of ['ownerAbsentAtIssuance', 'recoveryThroughExactSDK', 'originalFailurePreserved',
    'catalogueAdmissionsFenced']) assert.equal(recovered[field], true, field);
  assert.equal(recovered.solverPayoutIssued, false); assert.equal(recovered.ownerExitsAttempted, false);
  assert.equal(recovered.nativeVaultEffects, 1); assert.equal(recovered.solverUnderlyingLoss, '100');
  // recovery is a provenance subset of available (or locked), never another
  // spendable amount: 500 = original change380 + F refund120, not 620.
  assert.deepEqual(result.recoveryBalances, {
    source: { available: '500', reserved: '0', recovery: '120', locked: '0' },
    target: { available: '100', reserved: '0', recovery: '0', locked: '0' },
    solverPaltAtomic: '0', targetExternalBltvAtomic: '0',
    sourcePoolBackingAtomic: '500', targetPoolBackingAtomic: '100',
    vaultAssetsAtomic: '100', vaultSharesAtomic: '100',
  });
  assert.deepEqual(result.originalFRecovery, { actualFProofAccepted: true, originalRequestId: 'private_vault_graph',
    disposition: 'RECOVERED', recoveryCutoffPreserved: true, repeatedRecoveryNoEffect: true,
    nativeLegNotResubmitted: true, ownersRestartedAfterRecovery: true,
    coordinatorMode: 'SAME_ORIGINAL_AUTHENTICATED_JOURNAL_REOPEN', coordinatorProcessRestart: false,
    originalListenerReplaced: true, oldGrantRejected: true, originalBindingsUnchanged: true });
  assert.equal(result.finalPools.length, 2);
  for (const pool of result.finalPools) assert.equal(pool.liveReservations, 0);
  assert.equal(result.finalPools[0].backedAmount, '500');
  assert.equal(result.finalPools[1].backedAmount, '100');
  assert.equal(result.sourceFundingConfirmed, true);
  assert.deepEqual(result.responseLoss, { requestId: 'vault_top_up', discardedActualAdmissionReply: true,
    sdkReportedUnknown: true, executeHttpRequests: 1, originalJournalReconciled: true,
    noAutomaticResubmit: true, actualNetworkOutage: false });
  assert.equal(result.originalGeneration.poolCount, 2);
  assert.equal(result.originalGeneration.bindingsUnchanged, true);
  assert.match(result.originalGeneration.generationId, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.originalGeneration.requestIds, ['vault_top_up', 'private_vault_graph']);
  const evidence = [...result.exactActionEvidenceBeforeRestart, ...result.exactActionEvidenceAfterRestart];
  const handoffs = evidence.filter(item => item.check === 'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED');
  const confirmations = evidence.filter(item => item.check === 'EXPLICIT_HANDOFF_CONFIRMATION');
  assert.equal(handoffs.length, 6);
  assert.deepEqual(confirmations.map(item => item.action),
    ['accountPrepare', 'accountExecute', 'accountRecover', 'accountRecover', 'accountReconcile']);
  for (const item of confirmations) {
    const matches = handoffs.filter(review => review.reviewId === item.reviewId && review.listenerId === item.listenerId
      && review.action === item.action && review.requestId === item.requestId);
    assert.equal(matches.length, 1); const review = matches[0];
    for (const key of ['reviewId', 'listenerId', 'generationId', 'accountIdentitySHA256'])
      assert.match(review[key], /^[0-9a-f]{64}$/);
    assert.equal(review.generationId, result.originalGeneration.generationId);
    assert.equal(item.requestId, 'private_vault_graph');
    assert.equal(review.explicitScriptedAuthorization, true); assert.equal(review.sent, false);
    assert.equal(review.headAvailable, ['accountPrepare', 'accountExecute'].includes(item.action));
  }
  assert.equal(new Set(confirmations.map(item => item.reviewId)).size, confirmations.length);
  assert.equal(new Set(confirmations.map(item => item.listenerId)).size, 2);
  assert.equal(new Set(handoffs.map(item => item.accountIdentitySHA256)).size, 1);
  const pending = evidence.filter(item => item.check === 'UNSPENT_HANDOFF_LISTENER_GRANT');
  assert.equal(pending.length, 1); assert.equal(pending[0].action, 'accountReconcile');
  assert.equal(pending[0].requestId, 'private_vault_graph');
  assert.equal(pending[0].listenerId, confirmations[0].listenerId);
  assert.ok(handoffs.some(item => item.reviewId === pending[0].reviewId && item.listenerId === pending[0].listenerId));
  assert.ok(!confirmations.some(item => item.reviewId === pending[0].reviewId));
  assert.ok(evidence.some(item => item.check === 'OLD_LISTENER_GRANT_REJECTED'));
  return { scope: 'MANUAL_EXACT_ONLY_ORIGINAL_TIMEOUT_F_AFTER_NATIVE_DELIVERY', actualFRecoveryAcceptance: true,
    happyPathCompleted: false, arbitraryDeFiAcceptance: false, fullWalletAcceptance: false };
}
