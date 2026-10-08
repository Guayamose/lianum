/** Acceptance assertions only. These cannot verify a proof, create original
 * runtime/custody authority or turn UNKNOWN native finality into success. */
import assert from 'node:assert/strict';
export const DEVELOPMENT_BTC_SOL_GRAPH_REAL_RUN_DISABLED = false;
export const DEVELOPMENT_BTC_SOL_GRAPH_PROFILE = 'FRESH_PRIVATE_CBTC_INVOICE_SOL_DELIVERY_V1';
export const DEVELOPMENT_BTC_SOL_GRAPH_RESULT = 'LIANUM_DEVELOPMENT_BTC_SOL_GRAPH_RESULT_V1';
const digest = value => assert.match(value, /^[0-9a-f]{64}$/);
export function assertDevelopmentBtcSolGraphResult(value) {
  assert.equal(arguments.length, 1);
  assert.equal(value.format, DEVELOPMENT_BTC_SOL_GRAPH_RESULT); assert.equal(value.profile, DEVELOPMENT_BTC_SOL_GRAPH_PROFILE);
  assert.equal(value.phase, 'completed'); assert.equal(value.success, true);
  for (const field of ['localOnly', 'fakeFundsOnly', 'sourceUnchanged', 'graphExecutionEstablished']) assert.equal(value[field], true);
  for (const field of ['publicNetwork', 'nativeSelfCustody', 'independentOperators', 'nativeProcessRestartEstablished',
    'keeperLossRecoveryEstablished', 'fullWalletAcceptance']) assert.equal(value[field], false, 'BTC_SOL_ACCEPTANCE_SCOPE');
  assert.deepEqual(value.selectedAssets, [0]);
  const expected = { deposit_intent: 1, native_claim_ingress_v3: 1, authorization: 1, reservation: 1,
    dependency: 1, ready: 1, admission: 1, node: 4, settlement: 1, withdraw_balance: 2, native_claim_discharge: 2 };
  const counts = {};
  for (const row of value.proofs) {
    assert.ok(Object.hasOwn(expected, row.relation), 'BTC_SOL_ORIGINAL_RELATION_ONLY');
    counts[row.relation] = (counts[row.relation] ?? 0) + 1;
    digest(row.proofSHA256); digest(row.publicInputsSHA256);
    assert.equal(row.evidence?.resourceReceiptCompleted, true, 'BTC_SOL_ORIGINAL_COMPLETED_PROOF_RECEIPTS');
    assert.equal(row.evidence.selfVerified === true || row.evidence.acceptedResult === true, true);
    if (row.relation === 'withdraw_balance') digest(row.evidence.telemetrySHA256);
    else for (const field of ['manifestSHA256','resultSHA256','resourcesSHA256']) digest(row.evidence[field]);
    if (row.relation === 'native_claim_ingress_v3') {
      assert.equal(row.evidence.sourceVersion, '65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555');
      assert.equal(row.evidence.keySHA256, '11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f');
    }
    if (row.relation === 'native_claim_discharge')
      assert.equal(row.evidence.keySHA256, '0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83');
  }
  assert.deepEqual(counts, expected); assert.equal(new Set(value.proofs.map(row => row.proofSHA256)).size, 16);
  assert.deepEqual(value.proofs.filter(row => row.relation === 'withdraw_balance').map(row => row.evidence.purpose).sort(), ['owner','recipient']);
  assert.equal(new Set(value.proofs.map(row => row.evidence.runId ?? row.evidence.id)).size, 16, 'BTC_SOL_FRESH_PROOF_ATTEMPTS');
  assert.deepEqual(value.nativeEffects, { bitcoin: 3, solana: 0, graphBitcoin: 0, graphSolana: 1, eachBroadcastOnce: true });
  assert.deepEqual(value.redemptions.map(row => [row.assetIndex,row.amount,row.role,row.status,row.duplicateNoEffect]),
    [[0,'80000','change','DISCHARGED',true],[0,'20000','solver','DISCHARGED',true]]);
  for (const field of ['registeredOriginalQuorumPreflight','ownerOfflineNativeIngress','originalNotesCreditedOnce',
    'cleanKeeperRestartNoSend','ownerChildAndCoordinatorRestartNoSend','originalPrivateExitViaHttp',
    'originalRedemptionViaHttp','admittedResponseDiscarded','originalJournalResumeNoSend','dualNonceInfrastructureExcluded',
    'ownerAbsentBeforeAnyNativeGraphSend','solCustodyAndInfrastructureNeverSpent','originalGraphBackingClosed','allOriginalLiabilitiesClosed'])
    assert.equal(value.checks[field], true, 'BTC_SOL_ORIGINAL_LIFECYCLE');
  assert.equal(value.checks.dualNonceIngressAndPayoutAdvanced, undefined, 'BTC_SOL_CUSTODY_NONCES_NEVER_USED');
  assert.deepEqual(value.finalClaimState.map(row => [row.wrapperSupply,row.pendingRedemptions,row.pendingRefunds,
    row.heldUnissued,row.reservedFees,row.intentCount,row.ticketCount]),
    [['0','0','0','0','0','1','2'],['0','0','0','0','0','0','0']]);
  assert.equal(value.graph.sourceAsset, 'CBTC'); assert.equal(value.graph.payoutAsset, 'CBTC');
  assert.equal(value.graph.deliveryFamily, '2');
  assert.deepEqual([value.graph.sourceAtomic,value.graph.payoutAtomic,value.graph.changeAtomic,value.graph.deliveredLamports],
    ['100000','20000','80000','1000000']);
  for (const field of ['ownerAbsentDuringNativeAndSettlement','originalConfirmedHttpJournal','originalFinalizedSignatureOnce',
    'separateSolverLiquidity','custodyPrincipalAndNoncesUnchangedDuringGraph','claimsAndPoolBackingConserved',
    'allFourCompletionSlotsConsumed','duplicateRestartReconcileRecoverNoSend','solverPayoutExited','solverNativeRedemptionDischarged'])
    assert.equal(value.graph[field], true, 'BTC_SOL_ORIGINAL_GRAPH');
  assert.equal(value.graph.originalRequestId, 'development_btc_claim_sol_graph');
  assert.equal(value.graph.nativeBtcRedemptionRecipient, 'FIXED_OWNED_CUSTODY_RECIPIENT_FOR_BOTH_REDEMPTIONS');
  assert.match(value.graph.originalCutoff, /^[1-9][0-9]*$/);
  for (const field of ['coordinatorProcessRestart','actualFRecoveryAcceptance','evmVaultAcceptance','fullWalletAcceptance',
    'priceDiscoveryEstablished','sameAssetBridgeEstablished'])
    assert.equal(value.graph[field], false, 'BTC_SOL_ORIGINAL_GRAPH_SCOPE');
  for (const field of ['closedEvm','closedBitcoin','closedSolana','closedController','closedKeeper']) assert.equal(value.cleanup[field], true);
  assert.deepEqual(value.cleanup.errors, []); assert.equal(value.cleanup.evmScratch.scratchRemoved, true);
  assert.equal(value.cleanup.bitcoin.result.syntheticWalletsAndLedgerRemoved, true); assert.equal(value.cleanup.bitcoin.result.forced, false);
  assert.equal(value.cleanup.solana.result.syntheticKeysAndLedgerRemoved, true); assert.equal(value.cleanup.solana.result.forced, false);
  return { scope: DEVELOPMENT_BTC_SOL_GRAPH_PROFILE, privateInvoiceAsset: 'CBTC', nativeDelivery: 'SOL',
    btcCustodialIngress: true, paegGraphExecution: true, originalPrivateNoteExit: true, nativePayoutAndDischarge: true,
    duplicateNoEffect: true, evmVaultAcceptance: false, actualFRecoveryAcceptance: false,
    browserVisualAcceptance: false, fullWalletAcceptance: false };
}
