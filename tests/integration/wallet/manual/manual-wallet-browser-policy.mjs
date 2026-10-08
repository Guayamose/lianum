/** Reviewed local development release, 2026-10-08. The supervisor checkpoints
 * the complete current closure before starting its exclusive bounded worker.
 * Only fresh fake-value laboratories are allowed; no env/CLI release override. */
import assert from 'node:assert/strict';
export const MANUAL_WALLET_REAL_RUN_DISABLED = false;
export const MANUAL_WALLET_PROOFS = Object.freeze(['deposit_balance', 'deposit_intent', 'authorization',
  'reservation', 'dependency', 'ready', 'admission', 'node', 'node', 'node', 'node', 'settlement',
  'withdraw_balance', 'withdraw_balance', 'withdraw_balance']);
export const MANUAL_WALLET_BROWSER_FORMAT = 'FLAT_MANUAL_WALLET_BROWSER_ACCEPTANCE_RESULT_V1';
export function assertManualWalletBrowserResult(result) {
  assert.equal(result.format, MANUAL_WALLET_BROWSER_FORMAT);
  assert.equal(result.phase, 'completed'); assert.equal(result.success, true);
  assert.equal(result.localOnly, true); assert.equal(result.fakeFundsOnly, true); assert.equal(result.publicNetwork, false);
  assert.equal(result.sourceUnchanged, true); assert.equal(result.cleanup.closedEvm, true);
  assert.equal(result.walletSdkEvmFlowCompleted, false);
  assert.equal(result.walletBrowserEvmFlowCompleted, true);
  assert.equal(result.manualConsentContractVerified, true);
  assert.equal(result.targetOwnerSuspendedAfterExactHttpAdmission, true);
  assert.deepEqual(result.responseLoss, { requestId: 'vault_top_up', discardedActualAdmissionReply: true,
    browserReportedUnknown: true, executeHttpRequests: 1, originalJournalReconciled: true,
    noAutomaticResubmit: true, actualNetworkOutage: false });
  assert.deepEqual(result.proofs.map(proof => proof.relation), MANUAL_WALLET_PROOFS);
  assert.deepEqual(result.economics, { decimals: 6, sourceDepositAtomic: '500', privatePayoutAtomic: '120',
    sourceChangeAtomic: '380', solverOwnUnderlyingAtomic: '100', deliveredPrivateSharesAtomic: '100',
    redeemedExternalUnderlyingAtomic: '100' });
  const app = result.walletApplicationHttpAcceptance;
  for (const key of ['originalAccountTopUpAndExit', 'originalDeFiPrepareExecuteReconcileReopen', 'originalRequestIdsRetained',
    'accountHttp200WasVolatileOnly', 'confirmedOriginalJournalObserved', 'manualGraphThroughExactBrowser',
    'ownerLocalImmutablePreparations', 'oneMixedKeeper', 'oneCatalogueGeneration', 'originalGenerationDeFiFacade',
    'exactOneUseReplayRejected', 'noImplicitReauthorization', 'originalHostManualHandoff',
    'authenticatedGrantCommitment', 'explicitScriptedHandoffConfirm']) assert.equal(app[key], true, 'MANUAL_ACCEPTANCE_MISSING_' + key);
  assert.equal(app.graphUsedOriginalPrivateHarnessApi, false); assert.equal(app.graphExecutionExposed, false);
  assert.equal(app.browserVisualAcceptance, true); assert.equal(result.fullWalletAcceptance, false);
  assert.equal(result.actualGlobalClaim.sourceOwnerAbsent, true); assert.equal(result.actualGlobalClaim.targetOwnerAbsent, true);
  assert.equal(result.actualGlobalClaim.solverPayout, '120'); assert.equal(result.actualGlobalClaim.exactShares, '100');
  assert.equal(result.actualGlobalClaim.actualUnderlying, '100'); assert.equal(result.nativeEffects.evmVault, 1);
  assert.equal(result.originalGeneration.poolCount, 2); assert.equal(result.originalGeneration.bindingsUnchanged, true);
  assert.deepEqual(result.originalGeneration.requestIds, ['vault_top_up', 'private_vault_graph', 'vault_exit_0', 'vault_exit_1']);
  assert.deepEqual(result.offlineOriginalRecovery, { reconcile: true, recover: true, terminalNoOp: true, actualFProofAccepted: false });
  assert.deepEqual(result.listenerRestart, { originalSessionRetained: true, originalCatalogueRetained: true,
    oldGrantRejected: true, originalIdsRetained: true, keeperRestart: false, nodeRestart: false,
    coordinatorMode: 'SAME_ORIGINAL_AUTHENTICATED_JOURNAL_REOPEN', coordinatorProcessRestart: false });
  assert.equal(result.solverPayoutReplay.status, 'REJECTED_WITHOUT_SECOND_PAYOUT');
  assert.equal(result.solverPayoutReplay.tokenVaultPoolAccountingUnchanged, true);
  assert.equal(result.solverPayoutReplay.originalNullifierRemainsSpent, true);
  assert.equal(result.manualPrivateShareExitRedemption.phase, 'REDEEMED');
  assert.equal(result.manualPrivateShareExitRedemption.redeemedUnderlying, '100');
  assert.equal(result.manualPrivateShareExitRedemption.duplicateNoEffect, true);
  assert.deepEqual(result.finalRecipients, { changePaltAtomic: '380', solverPaltAtomic: '120', targetPaltAtomic: '100',
    targetBltvAtomic: '0', paltTotalSupplyAtomic: '1000000' });
  assert.deepEqual(result.finalVault, { totalAssets: '0', totalShares: '0' });
  assert.deepEqual(result.finalCapacity, { fundedObligations: '0', conservativeOutputCapacity: [3, 0],
    paddingSpendable: false, capacityReclaimed: false, repeatedWalletRolloverAccepted: false });
  assert.equal(result.finalPools.length, 2);
  for (const [index, pool] of result.finalPools.entries()) {
    assert.equal(pool.backedAmount, '0'); assert.equal(pool.actualAssetBalance, '0'); assert.equal(pool.liveReservations, 0);
    assert.equal(pool.outputCapacity, index === 0 ? 3 : 0);
  }
  const evidence = [...result.exactActionEvidenceBeforeRestart, ...result.exactActionEvidenceAfterRestart];
  for (const requestId of result.originalGeneration.requestIds) for (const action of ['prepare', 'execute', 'reconcile'])
    assert.ok(evidence.some(entry => entry.requestId === requestId && entry.action === action
      && entry.via === 'BROWSER_DOM_EXACT_ONLY_HTTP' && entry.httpAdmission === 'VOLATILE_UI_QUEUE_ONLY'));
  assert.ok(evidence.some(entry => entry.action === 'recover' && entry.requestId === 'private_vault_graph'));
  assert.ok(evidence.some(entry => entry.check === 'OLD_LISTENER_GRANT_REJECTED'));
  for (const action of ['accountPrepare', 'accountExecute', 'accountReconcile', 'accountRecover',
    'defiPrepare', 'defiExecute', 'defiReconcile', 'defiReopen'])
    assert.ok(evidence.some(entry => entry.action === action && entry.check === 'USED_EXACT_GRANT_REJECTED'));
  const handoffs = evidence.filter(entry => entry.check === 'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED');
  const confirmations = evidence.filter(entry => entry.check === 'EXPLICIT_HANDOFF_CONFIRMATION');
  for (const action of ['accountPrepare', 'accountExecute', 'accountReconcile', 'accountRecover']) {
    const confirmed = confirmations.filter(entry => entry.action === action && entry.requestId === 'private_vault_graph');
    assert.ok(confirmed.length > 0, 'MANUAL_ACCEPTANCE_HANDOFF_CONFIRMATION_MISSING');
    for (const entry of confirmed) {
      const matches = handoffs.filter(review => review.reviewId === entry.reviewId && review.listenerId === entry.listenerId
        && review.action === action && review.requestId === entry.requestId);
      assert.equal(matches.length, 1, 'MANUAL_ACCEPTANCE_HANDOFF_ORIGINAL_REVIEW_REQUIRED');
      const review = matches[0];
      for (const key of ['reviewId', 'listenerId', 'generationId', 'accountIdentitySHA256']) assert.match(review[key], /^[0-9a-f]{64}$/);
      assert.equal(review.generationId, result.originalGeneration.generationId);
      assert.equal(review.explicitScriptedAuthorization, true); assert.equal(review.sent, false);
      if (['accountPrepare', 'accountExecute'].includes(action)) assert.equal(review.headAvailable, true);
    }
  }
  assert.deepEqual(confirmations.map(entry => entry.action),
    ['accountPrepare', 'accountExecute', 'accountReconcile', 'accountRecover', 'accountReconcile']);
  assert.equal(handoffs.length, 6);
  const pending = evidence.filter(entry => entry.check === 'UNSPENT_HANDOFF_LISTENER_GRANT');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].requestId, 'private_vault_graph'); assert.equal(pending[0].action, 'accountReconcile');
  assert.equal(pending[0].listenerId, confirmations[0].listenerId);
  assert.ok(!confirmations.some(entry => entry.reviewId === pending[0].reviewId));
  assert.ok(handoffs.some(entry => entry.reviewId === pending[0].reviewId && entry.listenerId === pending[0].listenerId));
  assert.equal(new Set(handoffs.map(entry => entry.accountIdentitySHA256)).size, 1);
  assert.equal(new Set(confirmations.map(entry => entry.reviewId)).size, confirmations.length);
  assert.ok(confirmations.filter(entry => entry.action === 'accountReconcile').some(entry =>
    handoffs.some(review => review.reviewId === entry.reviewId && review.headAvailable === false)));
  assert.ok(confirmations.filter(entry => entry.action === 'accountRecover').some(entry =>
    handoffs.some(review => review.reviewId === entry.reviewId && review.headAvailable === false)));
  assert.equal(new Set(confirmations.map(entry => entry.listenerId)).size, 2);
  assert.equal(result.browserClosures.length, 2);
  for (const closure of result.browserClosures) {
    assert.equal(closure.browserOwnedCleanupConfirmed, true);
    assert.equal(closure.guardPassed, true);
    assert.equal(closure.sandboxedRendererObserved, true);
    assert.deepEqual(closure.exit, { code: 0, signal: null });
    assert.ok(closure.sandboxedRenderers.length > 0);
    for (const renderer of closure.sandboxedRenderers) {
      assert.equal(renderer.noNewPrivileges, 1); assert.equal(renderer.seccomp, 2);
      assert.ok(Number.isSafeInteger(renderer.pid) && renderer.pid > 0);
      assert.match(renderer.startTimeTicks, /^[0-9]+$/);
      assert.ok(Array.isArray(renderer.uids) && renderer.uids.length === 4
        && renderer.uids.every(uid => Number.isSafeInteger(uid) && uid === renderer.uids[0]));
    }
    assert.equal(closure.newChromeProcessesRemaining, 0);
    assert.deepEqual(closure.outsideOwnedGroup, []);
    assert.deepEqual(closure.signals, []);
    assert.ok(closure.maximumOwnedBrowserRSSBytes > 0 && closure.maximumOwnedBrowserRSSBytes <= 1024 ** 3);
  }
  assert.equal(result.originalExitReviewStateUnchanged, true);
  for (const row of handoffs) {
    assert.equal(row.visibleTermsVerified, true);
    assert.equal(row.browserConsentInitiallyUnchecked, true);
  }
  for (const row of confirmations) assert.equal(row.browserCheckboxChecked, true);
  const simpleReviews = evidence.filter(row => row.check === 'EXACT_BROWSER_CAPABILITY_IMPORTED_AFTER_VISIBLE_REVIEW');
  assert.deepEqual(simpleReviews.map(row => row.action), [
    'accountPrepare','accountExecute','accountReconcile',
    'accountPrepare','accountExecute','accountReconcile',
    'accountPrepare','accountExecute','accountReconcile',
    'defiPrepare','defiExecute','defiReopen','defiPrepare','defiReconcile']);
  assert.equal(new Set(simpleReviews.map(row => row.reviewId)).size, simpleReviews.length);
  for (const row of simpleReviews) {
    assert.equal(row.explicitScriptedAuthorization, true);
    assert.equal(row.visibleTermsVerified, true);
    assert.equal(row.browserConsentInitiallyUnchecked, true);
    assert.equal(row.sent, false);
    assert.match(row.reviewId, /^[0-9a-f]{64}$/);
    assert.match(row.listenerId, /^[0-9a-f]{64}$/);
  }
  return { scope: 'MANUAL_BROWSER_EXACT_ONLY_ONE_GENERATION_EVM_VAULT', actualFRecoveryAcceptance: false,
    sameAssetRolloverAcceptance: false, v2PoolDeployment: false, fullWalletAcceptance: false };
}
