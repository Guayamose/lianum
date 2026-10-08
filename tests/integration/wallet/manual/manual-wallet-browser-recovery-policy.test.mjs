/** Synthetic policy regression only; no browser, native node or prover runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryPolicyFixture } from './manual-wallet-recovery-policy-fixture.mjs';
import { MANUAL_WALLET_BROWSER_RECOVERY_FORMAT, assertManualWalletBrowserRecoveryResult } from './manual-wallet-browser-recovery-policy.mjs';
import { assertManualWalletRecoveryResult } from './manual-wallet-recovery-policy.mjs';
import { assertManualWalletBrowserResult } from './manual-wallet-browser-policy.mjs';
import { runManualWalletBrowserRecoverySupervisor } from '../../native/native-flow-supervisor.mjs';
function fixture() {
  const result = recoveryPolicyFixture();
  result.format = MANUAL_WALLET_BROWSER_RECOVERY_FORMAT;
  result.walletBrowserEvmFlowCompleted = false; result.walletBrowserTimeoutFRecoveryCompleted = true;
  result.independentOperators = false; result.realClockFinalityAcceptance = false; result.partialDeliveryRecoveryAcceptance = false;
  result.failureRecovery.recoveryThroughExactSDK = false; result.failureRecovery.recoveryThroughExactBrowser = true;
  delete result.responseLoss.sdkReportedUnknown; result.responseLoss.browserReportedUnknown = true;
  result.listenerRestart = { originalSessionRetained: true, originalCatalogueRetained: true,
    oldGrantRejected: true, originalIdsRetained: true, keeperRestart: false, nodeRestart: false,
    coordinatorMode: 'SAME_ORIGINAL_AUTHENTICATED_JOURNAL_REOPEN', coordinatorProcessRestart: false };
  result.browserClosures = [1, 2].map(index => ({ browserOwnedCleanupConfirmed: true, guardPassed: true,
    sandboxedRendererObserved: true, exit: { code: 0, signal: null }, sandboxedRenderers: [{ pid: 1000 + index,
      startTimeTicks: '2000', uids: [1000,1000,1000,1000], noNewPrivileges: 1, seccomp: 2 }],
    newChromeProcessesRemaining: 0, outsideOwnedGroup: [], signals: [], maximumOwnedBrowserRSSBytes: 1024 }));
  const evidence = [...result.exactActionEvidenceBeforeRestart, ...result.exactActionEvidenceAfterRestart];
  for (const row of evidence) {
    if (row.check === 'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED') Object.assign(row,
      { visibleTermsVerified: true, browserConsentInitiallyUnchecked: true });
    if (row.check === 'EXPLICIT_HANDOFF_CONFIRMATION') row.browserCheckboxChecked = true;
  }
  for (const [index, action] of ['prepare', 'execute', 'reconcile'].entries()) {
    result.exactActionEvidenceBeforeRestart.push({ action, requestId: 'vault_top_up',
      via: 'BROWSER_DOM_EXACT_ONLY_HTTP', httpAdmission: 'VOLATILE_UI_QUEUE_ONLY' },
      { action: 'account' + action[0].toUpperCase() + action.slice(1), requestId: 'vault_top_up',
        reviewId: (index + 7).toString(16).repeat(64), listenerId: 'b'.repeat(64),
        check: 'EXACT_BROWSER_CAPABILITY_IMPORTED_AFTER_VISIBLE_REVIEW', explicitScriptedAuthorization: true,
        visibleTermsVerified: true, browserConsentInitiallyUnchecked: true, sent: false });
  }
  for (const action of ['prepare', 'recover', 'reconcile']) result.exactActionEvidenceAfterRestart.push({
    action, requestId: 'private_vault_graph', via: 'BROWSER_DOM_EXACT_ONLY_HTTP', httpAdmission: 'VOLATILE_UI_QUEUE_ONLY' });
  return result;
}
test('DOM timeout F has its own limited acceptance and cannot impersonate either existing profile', () => {
  const result = fixture();
  assert.deepEqual(assertManualWalletBrowserRecoveryResult(result), {
    scope: 'MANUAL_BROWSER_EXACT_ONLY_ORIGINAL_TIMEOUT_F_AFTER_NATIVE_DELIVERY', actualFRecoveryAcceptance: true,
    happyPathCompleted: false, arbitraryDeFiAcceptance: false, fullWalletAcceptance: false });
  assert.throws(() => assertManualWalletRecoveryResult(result));
  assert.throws(() => assertManualWalletBrowserResult(result));
  assert.throws(() => assertManualWalletBrowserRecoveryResult(recoveryPolicyFixture()));
});
test('DOM F rejects SDK evidence, absent consent, stale authority and weakened Chrome lifetimes', () => {
  const changes = [r => r.failureRecovery.recoveryThroughExactSDK = true,
    r => r.failureRecovery.recoveryThroughExactBrowser = false,
    r => { delete r.responseLoss.browserReportedUnknown; r.responseLoss.sdkReportedUnknown = true; },
    r => r.walletBrowserEvmFlowCompleted = true, r => r.walletBrowserTimeoutFRecoveryCompleted = false,
    r => r.independentOperators = true, r => r.realClockFinalityAcceptance = true,
    r => r.exactActionEvidenceBeforeRestart.find(x => x.visibleTermsVerified).visibleTermsVerified = false,
    r => r.exactActionEvidenceBeforeRestart.find(x => x.browserConsentInitiallyUnchecked).browserConsentInitiallyUnchecked = false,
    r => r.exactActionEvidenceAfterRestart.find(x => x.browserCheckboxChecked).browserCheckboxChecked = false,
    r => r.exactActionEvidenceBeforeRestart.find(x => x.via).via = 'NODE_SDK_EXACT_ONLY_HTTP',
    r => r.listenerRestart.oldGrantRejected = false, r => r.listenerRestart.coordinatorProcessRestart = true,
    r => r.browserClosures.pop(), r => r.browserClosures[1].guardPassed = false,
    r => r.browserClosures[1].signals.push({ pid: 1002, signal: 'SIGTERM' }),
    r => r.browserClosures[1].outsideOwnedGroup.push(1234),
    r => r.browserClosures[0].maximumOwnedBrowserRSSBytes = 1024 ** 3 + 1,
    r => r.browserClosures[0].sandboxedRenderers[0].seccomp = 0,
    r => r.browserClosures[1].exit.code = 1,
    r => r.recoveryBalances.source.available = '620', r => r.failureRecovery.catalogueAdmissionsFenced = false,
    r => r.failureRecovery.solverPayoutIssued = true, r => r.proofs[6].relation = 'settlement',
    r => r.originalFRecovery.nativeLegNotResubmitted = false, r => r.nativeEffects.evmVault = 2,
    r => r.originalFailedAdmission.state = 'SUCCEEDED', r => r.originalFRecovery.recoveryCutoffPreserved = false];
  for (const change of changes) { const result = fixture(); change(result);
    assert.throws(() => assertManualWalletBrowserRecoveryResult(result)); }
});
test('fixed DOM timeout entry rejects options before touching processes or sources', async () => {
  await assert.rejects(runManualWalletBrowserRecoverySupervisor({ browser: true }), /MANUAL_BROWSER_RECOVERY_NO_SUPERVISOR_OPTIONS/);
});
