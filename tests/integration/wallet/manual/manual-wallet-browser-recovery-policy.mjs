/** Fixed original timeout-F route through the production wallet DOM.
 * Seven fresh proofs and both strict Chrome closures are required. */
import assert from 'node:assert/strict';
import { assertManualWalletOriginalRecoveryFacts } from './manual-wallet-recovery-policy.mjs';
import { assertManualWalletBrowserClosures } from './manual-wallet-browser-policy.mjs';
export const MANUAL_WALLET_BROWSER_RECOVERY_FORMAT = 'FLAT_MANUAL_WALLET_BROWSER_TIMEOUT_RECOVERY_RESULT_V1';

export function assertManualWalletBrowserRecoveryResult(result) {
  assert.equal(result.format, MANUAL_WALLET_BROWSER_RECOVERY_FORMAT);
  assertManualWalletOriginalRecoveryFacts(result);
  assert.equal(result.walletBrowserTimeoutFRecoveryCompleted, true);
  assert.equal(result.walletBrowserEvmFlowCompleted, false);
  assert.equal(result.walletSdkEvmFlowCompleted, false);
  for (const field of ['independentOperators', 'realClockFinalityAcceptance', 'partialDeliveryRecoveryAcceptance'])
    assert.equal(result[field], false, field);
  assert.equal(result.failureRecovery.recoveryThroughExactBrowser, true);
  assert.equal(result.failureRecovery.recoveryThroughExactSDK, false);
  assert.deepEqual(result.responseLoss, { requestId: 'vault_top_up', discardedActualAdmissionReply: true,
    browserReportedUnknown: true, executeHttpRequests: 1, originalJournalReconciled: true,
    noAutomaticResubmit: true, actualNetworkOutage: false });
  assert.deepEqual(result.listenerRestart, { originalSessionRetained: true, originalCatalogueRetained: true,
    oldGrantRejected: true, originalIdsRetained: true, keeperRestart: false, nodeRestart: false,
    coordinatorMode: 'SAME_ORIGINAL_AUTHENTICATED_JOURNAL_REOPEN', coordinatorProcessRestart: false });
  assertManualWalletBrowserClosures(result);
  const evidence = [...result.exactActionEvidenceBeforeRestart, ...result.exactActionEvidenceAfterRestart];
  for (const action of ['prepare', 'execute', 'reconcile']) assert.ok(evidence.some(row =>
    row.requestId === 'vault_top_up' && row.action === action && row.via === 'BROWSER_DOM_EXACT_ONLY_HTTP'
    && row.httpAdmission === 'VOLATILE_UI_QUEUE_ONLY'));
  // Execute intentionally has a retained FAILED admission after its actual
  // DOM confirmation. It must not manufacture a successful journal record.
  for (const action of ['prepare', 'recover', 'reconcile']) assert.ok(evidence.some(row =>
    row.requestId === 'private_vault_graph' && row.action === action && row.via === 'BROWSER_DOM_EXACT_ONLY_HTTP'
    && row.httpAdmission === 'VOLATILE_UI_QUEUE_ONLY'));
  const handoffs = evidence.filter(row => row.check === 'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED');
  const confirmations = evidence.filter(row => row.check === 'EXPLICIT_HANDOFF_CONFIRMATION');
  for (const row of handoffs) {
    assert.equal(row.visibleTermsVerified, true); assert.equal(row.browserConsentInitiallyUnchecked, true);
  }
  for (const row of confirmations) assert.equal(row.browserCheckboxChecked, true);
  const fundingReviews = evidence.filter(row => row.check === 'EXACT_BROWSER_CAPABILITY_IMPORTED_AFTER_VISIBLE_REVIEW');
  assert.deepEqual(fundingReviews.map(row => row.action), ['accountPrepare', 'accountExecute', 'accountReconcile']);
  assert.equal(new Set(fundingReviews.map(row => row.reviewId)).size, fundingReviews.length);
  for (const row of fundingReviews) {
    assert.equal(row.requestId, 'vault_top_up'); assert.equal(row.explicitScriptedAuthorization, true);
    assert.equal(row.visibleTermsVerified, true); assert.equal(row.browserConsentInitiallyUnchecked, true);
    assert.equal(row.sent, false); assert.match(row.reviewId, /^[0-9a-f]{64}$/); assert.match(row.listenerId, /^[0-9a-f]{64}$/);
    assert.equal(row.listenerId, confirmations[0].listenerId);
  }
  return { scope: 'MANUAL_BROWSER_EXACT_ONLY_ORIGINAL_TIMEOUT_F_AFTER_NATIVE_DELIVERY',
    actualFRecoveryAcceptance: true, happyPathCompleted: false, arbitraryDeFiAcceptance: false,
    fullWalletAcceptance: false };
}
