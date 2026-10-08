import assert from 'node:assert/strict';
import test from 'node:test';
import { DEVELOPMENT_NATIVE_CLAIM_PROFILE, DEVELOPMENT_NATIVE_CLAIM_RESULT, assertDevelopmentNativeClaimResult } from './development-native-claim-policy.mjs';
function report() {
  const rows = ['deposit_intent', 'native_claim_ingress_v3', 'withdraw_balance', 'native_claim_discharge'];
  const proofs = rows.flatMap((relation,index) => [0,1].map(asset => ({ relation,
    proofSHA256: String(index * 2 + asset + 1).padStart(64,'0'), publicInputsSHA256: 'a'.repeat(64),
    evidence: { selfVerified: true, resourceReceiptCompleted: true, manifestSHA256: 'b'.repeat(64),
      resultSHA256: 'c'.repeat(64), resourcesSHA256: 'd'.repeat(64), telemetrySHA256: 'e'.repeat(64),
      ...(relation === 'native_claim_ingress_v3' ? { sourceVersion: '65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555',
        keySHA256: '11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f' } : {}),
      ...(relation === 'native_claim_discharge' ? { keySHA256: '0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83' } : {}) } })));
  return { format: DEVELOPMENT_NATIVE_CLAIM_RESULT, profile: DEVELOPMENT_NATIVE_CLAIM_PROFILE,
    success: true, phase: 'completed', localOnly: true, fakeFundsOnly: true, sourceUnchanged: true,
    publicNetwork: false, nativeSelfCustody: false, independentOperators: false, nativeProcessRestartEstablished: false,
    keeperLossRecoveryEstablished: false, graphExecutionEstablished: false, fullWalletAcceptance: false, selectedAssets: [0,1], proofs,
    nativeEffects: { bitcoin: 2, solana: 2, graphBitcoin: 0, graphSolana: 0, eachBroadcastOnce: true },
    redemptions: [{ assetIndex: 0, amount: '100000', status: 'DISCHARGED', duplicateNoEffect: true },
      { assetIndex: 1, amount: '3000000', status: 'DISCHARGED', duplicateNoEffect: true }],
    checks: Object.fromEntries(['registeredOriginalQuorumPreflight', 'ownerOfflineNativeIngress', 'originalNotesCreditedOnce',
      'cleanKeeperRestartNoSend', 'ownerChildAndCoordinatorRestartNoSend', 'originalPrivateExitViaHttp',
      'originalRedemptionViaHttp', 'admittedResponseDiscarded', 'originalJournalResumeNoSend',
      'dualNonceInfrastructureExcluded', 'dualNonceIngressAndPayoutAdvanced', 'allOriginalLiabilitiesClosed'].map(name => [name,true])),
    finalClaimState: [0,1].map(() => ({ wrapperSupply: '0', pendingRedemptions: '0', pendingRefunds: '0', heldUnissued: '0', reservedFees: '0', intentCount: '1', ticketCount: '1' })),
    cleanup: { closedEvm: true, closedBitcoin: true, closedSolana: true, closedController: true, closedKeeper: true, errors: [],
      evmScratch: { scratchRemoved: true }, bitcoin: { result: { syntheticWalletsAndLedgerRemoved: true, forced: false } },
      solana: { result: { syntheticKeysAndLedgerRemoved: true, forced: false } } } };
}
test('the new profile accepts only its exact bounded custodial lifecycle', () => {
  assert.equal(assertDevelopmentNativeClaimResult(report()).nativePayoutAndDischarge, true);
  for (const flag of ['publicNetwork','nativeSelfCustody','independentOperators','nativeProcessRestartEstablished',
    'keeperLossRecoveryEstablished','graphExecutionEstablished','fullWalletAcceptance']) {
    const value=report(); value[flag]=true; assert.throws(()=>assertDevelopmentNativeClaimResult(value),/DEVELOPMENT_CLAIM_ACCEPTANCE_SCOPE/);
  }
});
test('missing discharge, substituted keys, duplicate sends or retained native secrets fail', () => {
  const missing=report(); missing.proofs.pop(); assert.throws(()=>assertDevelopmentNativeClaimResult(missing));
  const wrong=report(); wrong.proofs.find(row=>row.relation==='native_claim_ingress_v3').evidence.keySHA256='b'.repeat(64);
  assert.throws(()=>assertDevelopmentNativeClaimResult(wrong));
  const duplicate=report(); duplicate.nativeEffects.bitcoin++; assert.throws(()=>assertDevelopmentNativeClaimResult(duplicate));
  const cleanup=report(); cleanup.cleanup.solana.result.syntheticKeysAndLedgerRemoved=false;
  assert.throws(()=>assertDevelopmentNativeClaimResult(cleanup));
  const unknown=report(); unknown.redemptions[0].status='UNKNOWN'; assert.throws(()=>assertDevelopmentNativeClaimResult(unknown));
});
