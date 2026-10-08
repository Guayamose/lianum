/** Deliberately synthetic metadata. No node, prover, fake proof acceptance or
 * runtime authority is created by these negative acceptance-policy checks. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEVELOPMENT_BTC_SOL_GRAPH_PROFILE, DEVELOPMENT_BTC_SOL_GRAPH_RESULT, assertDevelopmentBtcSolGraphResult }
  from './development-btc-sol-graph-policy.mjs';
function report() {
  const relations = ['deposit_intent','native_claim_ingress_v3','authorization','reservation','dependency','ready','admission',
    'node','node','node','node','settlement','withdraw_balance','withdraw_balance','native_claim_discharge','native_claim_discharge'];
  return { format: DEVELOPMENT_BTC_SOL_GRAPH_RESULT, profile: DEVELOPMENT_BTC_SOL_GRAPH_PROFILE, phase: 'completed', success: true,
    localOnly: true, fakeFundsOnly: true, sourceUnchanged: true, graphExecutionEstablished: true,
    publicNetwork: false, nativeSelfCustody: false, independentOperators: false, nativeProcessRestartEstablished: false,
    keeperLossRecoveryEstablished: false, fullWalletAcceptance: false, selectedAssets: [0],
    proofs: relations.map((relation,index) => ({ relation, proofSHA256: String(index+1).padStart(64,'0'), publicInputsSHA256: 'a'.repeat(64),
      evidence: { resourceReceiptCompleted: true, selfVerified: true, runId: 'fixture-'+index,
        manifestSHA256: 'b'.repeat(64), resultSHA256: 'c'.repeat(64), resourcesSHA256: 'd'.repeat(64), telemetrySHA256: 'e'.repeat(64),
        ...(relation === 'withdraw_balance' ? { purpose: index===12 ? 'owner' : 'recipient' } : {}),
        ...(relation === 'native_claim_ingress_v3' ? { sourceVersion: '65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555',
          keySHA256: '11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f' } : {}),
        ...(relation === 'native_claim_discharge' ? { keySHA256: '0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83' } : {}) } })),
    nativeEffects: { bitcoin: 3, solana: 0, graphBitcoin: 0, graphSolana: 1, eachBroadcastOnce: true },
    redemptions: [{ assetIndex: 0, amount: '80000', role: 'change', status: 'DISCHARGED', duplicateNoEffect: true },
      { assetIndex: 0, amount: '20000', role: 'solver', status: 'DISCHARGED', duplicateNoEffect: true }],
    checks: Object.fromEntries(['registeredOriginalQuorumPreflight','ownerOfflineNativeIngress','originalNotesCreditedOnce',
      'cleanKeeperRestartNoSend','ownerChildAndCoordinatorRestartNoSend','originalPrivateExitViaHttp','originalRedemptionViaHttp',
      'admittedResponseDiscarded','originalJournalResumeNoSend','dualNonceInfrastructureExcluded','ownerAbsentBeforeAnyNativeGraphSend',
      'solCustodyAndInfrastructureNeverSpent','originalGraphBackingClosed','allOriginalLiabilitiesClosed'].map(field=>[field,true])),
    finalClaimState: [{ wrapperSupply:'0',pendingRedemptions:'0',pendingRefunds:'0',heldUnissued:'0',reservedFees:'0',intentCount:'1',ticketCount:'2' },
      { wrapperSupply:'0',pendingRedemptions:'0',pendingRefunds:'0',heldUnissued:'0',reservedFees:'0',intentCount:'0',ticketCount:'0' }],
    graph: { sourceAsset:'CBTC',payoutAsset:'CBTC',deliveryFamily:'2',sourceAtomic:'100000',payoutAtomic:'20000',changeAtomic:'80000',deliveredLamports:'1000000',
      ownerAbsentDuringNativeAndSettlement:true,originalConfirmedHttpJournal:true,originalFinalizedSignatureOnce:true,separateSolverLiquidity:true,
      custodyPrincipalAndNoncesUnchangedDuringGraph:true,claimsAndPoolBackingConserved:true,allFourCompletionSlotsConsumed:true,
      duplicateRestartReconcileRecoverNoSend:true,solverPayoutExited:true,solverNativeRedemptionDischarged:true,
      originalRequestId:'development_btc_claim_sol_graph',originalCutoff:'123456789',coordinatorProcessRestart:false,
      actualFRecoveryAcceptance:false,evmVaultAcceptance:false,fullWalletAcceptance:false,
      nativeBtcRedemptionRecipient:'FIXED_OWNED_CUSTODY_RECIPIENT_FOR_BOTH_REDEMPTIONS',priceDiscoveryEstablished:false,sameAssetBridgeEstablished:false },
    cleanup: { closedEvm:true,closedBitcoin:true,closedSolana:true,closedController:true,closedKeeper:true,errors:[],evmScratch:{scratchRemoved:true},
      bitcoin:{result:{syntheticWalletsAndLedgerRemoved:true,forced:false}},solana:{result:{syntheticKeysAndLedgerRemoved:true,forced:false}} } };
}
test('new scope binds a CBTC invoice to SOL delivery and keeps other acceptance claims false', () => {
  const scope = assertDevelopmentBtcSolGraphResult(report());
  assert.deepEqual([scope.privateInvoiceAsset,scope.nativeDelivery,scope.paegGraphExecution,scope.browserVisualAcceptance],['CBTC','SOL',true,false]);
  for (const field of ['publicNetwork','nativeSelfCustody','independentOperators','nativeProcessRestartEstablished','keeperLossRecoveryEstablished','fullWalletAcceptance']) {
    const value=report();value[field]=true;assert.throws(()=>assertDevelopmentBtcSolGraphResult(value),/BTC_SOL_ACCEPTANCE_SCOPE/);
  }
  for (const field of ['coordinatorProcessRestart','actualFRecoveryAcceptance','evmVaultAcceptance','fullWalletAcceptance',
    'priceDiscoveryEstablished','sameAssetBridgeEstablished']) {
    const value=report();value.graph[field]=true;assert.throws(()=>assertDevelopmentBtcSolGraphResult(value),/BTC_SOL_ORIGINAL_GRAPH_SCOPE/);
  }
});
test('missing graph relations, reused jobs, disguised recipient W39 and failed proof resources are rejected', () => {
  for (const mutate of [v=>v.proofs.splice(7,1),v=>{v.proofs[0].evidence.runId=v.proofs[1].evidence.runId;},
    v=>{v.proofs[13].evidence.purpose='owner';},v=>{v.proofs[3].evidence.resourceReceiptCompleted=false;},
    v=>{v.proofs[15].evidence.keySHA256='f'.repeat(64);},v=>{v.proofs[1].evidence.sourceVersion='f'.repeat(64);}]) {
    const value=report();mutate(value);assert.throws(()=>assertDevelopmentBtcSolGraphResult(value));
  }
});
test('UNKNOWN finality, another send, changed units, source principal loss or incomplete cleanup cannot complete the new profile', () => {
  for (const mutate of [v=>{v.redemptions[1].status='UNKNOWN';},v=>{v.nativeEffects.graphSolana++;},
    v=>{v.nativeEffects.solana=1;},v=>{v.graph.sourceAsset='CSOL';},v=>{v.graph.deliveredLamports='20000';},
    v=>{v.graph.claimsAndPoolBackingConserved=false;},v=>{v.checks.solCustodyAndInfrastructureNeverSpent=false;},
    v=>{v.finalClaimState[0].wrapperSupply='20000';},v=>{v.cleanup.bitcoin.result.forced=true;}]) {
    const value=report();mutate(value);assert.throws(()=>assertDevelopmentBtcSolGraphResult(value));
  }
});
