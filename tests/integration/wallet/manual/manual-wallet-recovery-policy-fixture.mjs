/** Synthetic policy fixtures only; these are not native/proof/browser evidence. */
import { MANUAL_WALLET_RECOVERY_FORMAT, MANUAL_WALLET_RECOVERY_PROOFS } from './manual-wallet-recovery-policy.mjs';
export function recoveryPolicyFixture() {
  const value = { format: MANUAL_WALLET_RECOVERY_FORMAT, phase: 'completed', success: true,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, sourceUnchanged: true,
    manualConsentContractVerified: true, actualTimeoutFRecoveryAcceptance: true,
    controlledPostDeliveryInterruption: true, targetOwnerExitedBeforeDelivery: true,
    targetOwnerSuspendedAfterExactHttpAdmission: true, walletSdkEvmFlowCompleted: false,
    privateVaultGraphAcceptance: false, fullWalletAcceptance: false, keeperRestart: false,
    nodeRestart: false, systemicPrivacyAcceptance: false, performanceTargetAchieved: false,
    cleanup: { closedEvm: true }, proofs: MANUAL_WALLET_RECOVERY_PROOFS.map(relation => ({ relation,
      proofSHA256: '1'.repeat(64), publicInputsSHA256: '2'.repeat(64) })),
    expectedInterruptionCode: 'MANUAL_ACCEPTANCE_CONTROLLED_AFTER_DELIVERY', expectedInterruptionPreserved: true,
    actualAdmissionFailureCode: 'FLAT_ACCOUNT_OPERATION_FAILED',
    originalFailedAdmission: { sequence: 3, action: 'execute', requestId: 'private_vault_graph',
      state: 'FAILED', errorCode: 'FLAT_ACCOUNT_OPERATION_FAILED' },
    nativeEffects: { evmVault: 1 }, failureRecovery: { ownerAbsentAtIssuance: true, recoveryThroughExactSDK: true,
      originalFailurePreserved: true, catalogueAdmissionsFenced: true, solverPayoutIssued: false,
      ownerExitsAttempted: false, nativeVaultEffects: 1, solverUnderlyingLoss: '100' },
    recoveryBalances: { source: { available: '500', reserved: '0', recovery: '120', locked: '0' },
      target: { available: '100', reserved: '0', recovery: '0', locked: '0' }, solverPaltAtomic: '0',
      targetExternalBltvAtomic: '0', sourcePoolBackingAtomic: '500', targetPoolBackingAtomic: '100',
      vaultAssetsAtomic: '100', vaultSharesAtomic: '100' },
    originalFRecovery: { actualFProofAccepted: true, originalRequestId: 'private_vault_graph', disposition: 'RECOVERED',
      recoveryCutoffPreserved: true, repeatedRecoveryNoEffect: true, nativeLegNotResubmitted: true,
      ownersRestartedAfterRecovery: true, coordinatorMode: 'SAME_ORIGINAL_AUTHENTICATED_JOURNAL_REOPEN',
      coordinatorProcessRestart: false, originalListenerReplaced: true, oldGrantRejected: true,
      originalBindingsUnchanged: true },
    finalPools: [{ liveReservations: 0, backedAmount: '500' }, { liveReservations: 0, backedAmount: '100' }],
    sourceFundingConfirmed: true,
    responseLoss: { requestId: 'vault_top_up', discardedActualAdmissionReply: true, sdkReportedUnknown: true,
      executeHttpRequests: 1, originalJournalReconciled: true, noAutomaticResubmit: true, actualNetworkOutage: false },
    originalGeneration: { generationId: 'a'.repeat(64), poolCount: 2, bindingsUnchanged: true,
      requestIds: ['vault_top_up', 'private_vault_graph'] }, exactActionEvidenceBeforeRestart: [], exactActionEvidenceAfterRestart: [] };
  const actions = ['accountPrepare', 'accountExecute', 'accountRecover', 'accountRecover', 'accountReconcile'];
  for (const [index, action] of actions.entries()) {
    const pair = { action, requestId: 'private_vault_graph', reviewId: String(index+1).repeat(64),
      listenerId: (index < 2 ? 'b' : 'c').repeat(64) };
    const target = index < 2 ? value.exactActionEvidenceBeforeRestart : value.exactActionEvidenceAfterRestart;
    target.push({ ...pair, check: 'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED', generationId: 'a'.repeat(64),
      accountIdentitySHA256: 'd'.repeat(64), headAvailable: index < 2, explicitScriptedAuthorization: true, sent: false },
      { ...pair, check: 'EXPLICIT_HANDOFF_CONFIRMATION' });
  }
  const pending = { action: 'accountReconcile', requestId: 'private_vault_graph', reviewId: '6'.repeat(64), listenerId: 'b'.repeat(64) };
  value.exactActionEvidenceBeforeRestart.push({ ...pending, check: 'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED',
    generationId: 'a'.repeat(64), accountIdentitySHA256: 'd'.repeat(64), headAvailable: false,
    explicitScriptedAuthorization: true, sent: false }, { ...pending, check: 'UNSPENT_HANDOFF_LISTENER_GRANT' });
  value.exactActionEvidenceAfterRestart.push({ check: 'OLD_LISTENER_GRANT_REJECTED' });
  return value;
}
