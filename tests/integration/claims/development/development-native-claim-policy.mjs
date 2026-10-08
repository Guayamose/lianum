import assert from 'node:assert/strict';

export const DEVELOPMENT_NATIVE_CLAIM_PROFILE = 'FRESH_BTC_SOL_CUSTODIAL_PRIVATE_CLAIM_ROUNDTRIPS_V1';
export const DEVELOPMENT_NATIVE_CLAIM_RESULT = 'LIANUM_DEVELOPMENT_NATIVE_CLAIM_ROUNDTRIPS_V1';
export function assertDevelopmentNativeClaimResult(value) {
  assert.equal(value.format, DEVELOPMENT_NATIVE_CLAIM_RESULT);
  assert.equal(value.profile, DEVELOPMENT_NATIVE_CLAIM_PROFILE);
  assert.equal(value.success, true); assert.equal(value.phase, 'completed');
  for (const name of ['localOnly', 'fakeFundsOnly', 'sourceUnchanged']) assert.equal(value[name], true);
  for (const name of ['publicNetwork', 'nativeSelfCustody', 'independentOperators', 'nativeProcessRestartEstablished',
    'keeperLossRecoveryEstablished', 'graphExecutionEstablished', 'fullWalletAcceptance'])
    assert.equal(value[name], false, 'DEVELOPMENT_CLAIM_ACCEPTANCE_SCOPE');
  assert.deepEqual(value.selectedAssets, [0, 1]);
  const expected = { deposit_intent: 2, native_claim_ingress_v3: 2, withdraw_balance: 2, native_claim_discharge: 2 };
  const counts = {};
  for (const proof of value.proofs) {
    assert.ok(Object.hasOwn(expected, proof.relation), 'DEVELOPMENT_CLAIM_ORIGINAL_RELATION_ONLY');
    counts[proof.relation] = (counts[proof.relation] ?? 0) + 1;
    assert.match(proof.proofSHA256, /^[0-9a-f]{64}$/); assert.match(proof.publicInputsSHA256, /^[0-9a-f]{64}$/);
    assert.equal(proof.evidence?.acceptedResult === true || proof.evidence?.selfVerified === true, true,
      'DEVELOPMENT_CLAIM_GENUINE_PROOF_RESULT');
    assert.equal(proof.evidence.resourceReceiptCompleted, true, 'DEVELOPMENT_CLAIM_COMPLETED_PROOF_RECEIPTS');
    if (proof.relation === 'withdraw_balance') assert.match(proof.evidence.telemetrySHA256, /^[0-9a-f]{64}$/);
    else for (const field of ['manifestSHA256', 'resultSHA256', 'resourcesSHA256']) assert.match(proof.evidence[field], /^[0-9a-f]{64}$/);
    if (proof.relation === 'native_claim_ingress_v3') {
      assert.equal(proof.evidence.sourceVersion, '65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555');
      assert.equal(proof.evidence.keySHA256, '11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f');
    }
    if (proof.relation === 'native_claim_discharge')
      assert.equal(proof.evidence.keySHA256, '0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83');
  }
  assert.deepEqual(counts, expected);
  assert.equal(new Set(value.proofs.map(row => row.proofSHA256)).size, 8);
  assert.deepEqual(value.nativeEffects, { bitcoin: 2, solana: 2, graphBitcoin: 0, graphSolana: 0, eachBroadcastOnce: true });
  assert.deepEqual(value.redemptions.map(row => [row.assetIndex, row.amount, row.status, row.duplicateNoEffect]),
    [[0, '100000', 'DISCHARGED', true], [1, '3000000', 'DISCHARGED', true]]);
  for (const name of ['registeredOriginalQuorumPreflight', 'ownerOfflineNativeIngress', 'originalNotesCreditedOnce',
    'cleanKeeperRestartNoSend', 'ownerChildAndCoordinatorRestartNoSend', 'originalPrivateExitViaHttp',
    'originalRedemptionViaHttp', 'admittedResponseDiscarded', 'originalJournalResumeNoSend',
    'dualNonceInfrastructureExcluded', 'dualNonceIngressAndPayoutAdvanced', 'allOriginalLiabilitiesClosed'])
    assert.equal(value.checks?.[name], true, 'DEVELOPMENT_CLAIM_ORIGINAL_LIFECYCLE');
  assert.deepEqual(value.finalClaimState.map(row => [row.wrapperSupply, row.pendingRedemptions, row.pendingRefunds,
    row.heldUnissued, row.reservedFees, row.intentCount, row.ticketCount]),
  [['0', '0', '0', '0', '0', '1', '1'], ['0', '0', '0', '0', '0', '1', '1']]);
  for (const name of ['closedEvm', 'closedBitcoin', 'closedSolana', 'closedController', 'closedKeeper'])
    assert.equal(value.cleanup?.[name], true, 'DEVELOPMENT_CLAIM_OWNED_CLEANUP');
  assert.deepEqual(value.cleanup.errors, []);
  assert.equal(value.cleanup.evmScratch.scratchRemoved, true);
  assert.equal(value.cleanup.bitcoin.result.syntheticWalletsAndLedgerRemoved, true); assert.equal(value.cleanup.bitcoin.result.forced, false);
  assert.equal(value.cleanup.solana.result.syntheticKeysAndLedgerRemoved, true); assert.equal(value.cleanup.solana.result.forced, false);
  return { scope: DEVELOPMENT_NATIVE_CLAIM_PROFILE, custodyRoundTrips: ['BTC', 'SOL'],
    originalPrivateNoteExit: true, nativePayoutAndDischarge: true, duplicateNoEffect: true,
    nativeProcessRestartEstablished: false, graphExecutionEstablished: false, fullWalletAcceptance: false };
}
