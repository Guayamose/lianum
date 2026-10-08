/** Synthetic result validation only. These values are not native/proof evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MANUAL_WALLET_RECOVERY_FORMAT, MANUAL_WALLET_RECOVERY_PROOFS,
  assertManualWalletRecoveryResult } from './manual-wallet-recovery-policy.mjs';
import { runManualWalletRecoverySupervisor } from '../../native/native-flow-supervisor.mjs';
import { recoveryPolicyFixture as fixture } from './manual-wallet-recovery-policy-fixture.mjs';
test('timeout F policy describes its limited scope separately from the happy path', () => {
  assert.deepEqual(assertManualWalletRecoveryResult(fixture()), {
    scope: 'MANUAL_EXACT_ONLY_ORIGINAL_TIMEOUT_F_AFTER_NATIVE_DELIVERY', actualFRecoveryAcceptance: true,
    happyPathCompleted: false, arbitraryDeFiAcceptance: false, fullWalletAcceptance: false });
});
test('timeout policy rejects wrong proofs, repayment, duplicate delivery, changed originals and false scope', () => {
  const mutations = [r => r.proofs[6].relation = 'settlement', r => r.proofs.pop(),
    r => r.proofs[0].proofSHA256 += '\n', r => r.walletSdkEvmFlowCompleted = true,
    r => r.failureRecovery.solverPayoutIssued = true, r => r.failureRecovery.solverUnderlyingLoss = '0',
    r => r.failureRecovery.ownerAbsentAtIssuance = false, r => r.failureRecovery.catalogueAdmissionsFenced = false,
    r => r.nativeEffects.evmVault = 2, r => r.expectedInterruptionPreserved = false,
    r => r.actualAdmissionFailureCode = 'UNFILTERED_PRIVATE_ERROR',
    r => r.originalFailedAdmission.state = 'SUCCEEDED', r => r.originalFailedAdmission.sequence = 0,
    r => r.originalFRecovery.repeatedRecoveryNoEffect = false, r => r.originalFRecovery.nativeLegNotResubmitted = false,
    r => r.originalFRecovery.originalRequestId = 'replacement_graph', r => r.originalFRecovery.recoveryCutoffPreserved = false,
    r => r.originalFRecovery.coordinatorProcessRestart = true, r => r.originalFRecovery.oldGrantRejected = false,
    r => r.recoveryBalances.source.available = '380', r => r.recoveryBalances.target.available = '0',
    r => r.finalPools[0].liveReservations = 1, r => r.fullWalletAcceptance = true,
    r => r.exactActionEvidenceAfterRestart = [], r => r.responseLoss.executeHttpRequests = 2,
    r => r.originalGeneration.requestIds.push('new_exit_1'),
    r => r.sourceUnchanged = false, r => r.cleanup.closedEvm = false];
  for (const change of mutations) { const value = fixture(); change(value); assert.throws(() => assertManualWalletRecoveryResult(value)); }
});
test('fixed timeout profile refuses caller-selected options before any launch', async () => {
  await assert.rejects(runManualWalletRecoverySupervisor({ mode: 'replacement' }), /MANUAL_WALLET_RECOVERY_NO_SUPERVISOR_OPTIONS/);
});
