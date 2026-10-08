/** HOST-ONLY: synthetic policy records; no browser, proof, chain or acceptance.
 * Rejections prevent a complete SDK run or an unsafe browser lifetime from
 * being reported as the new scoped production-DOM acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MANUAL_WALLET_BROWSER_FORMAT, MANUAL_WALLET_PROOFS,
  assertManualWalletBrowserResult } from './manual-wallet-browser-policy.mjs';
function syntheticBrowser() {
 const ids = ['vault_top_up','private_vault_graph','vault_exit_0','vault_exit_1'];
 const result = { format:MANUAL_WALLET_BROWSER_FORMAT, phase:'completed', success:true, localOnly:true,
 fakeFundsOnly:true, publicNetwork:false, sourceUnchanged:true, cleanup:{closedEvm:true}, walletSdkEvmFlowCompleted:false,walletBrowserEvmFlowCompleted:true,
 manualConsentContractVerified:true,targetOwnerSuspendedAfterExactHttpAdmission:true,
 responseLoss:{requestId:'vault_top_up',discardedActualAdmissionReply:true,browserReportedUnknown:true,executeHttpRequests:1,originalJournalReconciled:true,noAutomaticResubmit:true,actualNetworkOutage:false},
 proofs:MANUAL_WALLET_PROOFS.map(relation=>({relation})), fullWalletAcceptance:false,
 economics:{decimals:6,sourceDepositAtomic:'500',privatePayoutAtomic:'120',sourceChangeAtomic:'380',solverOwnUnderlyingAtomic:'100',deliveredPrivateSharesAtomic:'100',redeemedExternalUnderlyingAtomic:'100'},
 walletApplicationHttpAcceptance:{ originalAccountTopUpAndExit:true,originalDeFiPrepareExecuteReconcileReopen:true,originalRequestIdsRetained:true,
 accountHttp200WasVolatileOnly:true,confirmedOriginalJournalObserved:true,manualGraphThroughExactBrowser:true,ownerLocalImmutablePreparations:true,
 oneMixedKeeper:true,oneCatalogueGeneration:true,originalGenerationDeFiFacade:true,exactOneUseReplayRejected:true,noImplicitReauthorization:true,
 originalHostManualHandoff:true,authenticatedGrantCommitment:true,explicitScriptedHandoffConfirm:true,
 graphUsedOriginalPrivateHarnessApi:false,graphExecutionExposed:false,browserVisualAcceptance:true },
 actualGlobalClaim:{sourceOwnerAbsent:true,targetOwnerAbsent:true,solverPayout:'120',exactShares:'100',actualUnderlying:'100'},nativeEffects:{evmVault:1},
 originalGeneration:{generationId:'a'.repeat(64),poolCount:2,bindingsUnchanged:true,requestIds:ids},
 offlineOriginalRecovery:{reconcile:true,recover:true,terminalNoOp:true,actualFProofAccepted:false},
 listenerRestart:{originalSessionRetained:true,originalCatalogueRetained:true,oldGrantRejected:true,originalIdsRetained:true,keeperRestart:false,nodeRestart:false,
 coordinatorMode:'SAME_ORIGINAL_AUTHENTICATED_JOURNAL_REOPEN',coordinatorProcessRestart:false},
 solverPayoutReplay:{status:'REJECTED_WITHOUT_SECOND_PAYOUT',tokenVaultPoolAccountingUnchanged:true,originalNullifierRemainsSpent:true},
 manualPrivateShareExitRedemption:{phase:'REDEEMED',redeemedUnderlying:'100',duplicateNoEffect:true},
 finalRecipients:{changePaltAtomic:'380',solverPaltAtomic:'120',targetPaltAtomic:'100',targetBltvAtomic:'0',paltTotalSupplyAtomic:'1000000'},
 finalVault:{totalAssets:'0',totalShares:'0'},
 finalCapacity:{fundedObligations:'0',conservativeOutputCapacity:[3,0],paddingSpendable:false,capacityReclaimed:false,repeatedWalletRolloverAccepted:false},
 finalPools:[3,0].map(outputCapacity=>({backedAmount:'0',actualAssetBalance:'0',liveReservations:0,outputCapacity})),
 exactActionEvidenceBeforeRestart:[],exactActionEvidenceAfterRestart:[] };
 result.exactActionEvidenceBeforeRestart=ids.flatMap(requestId=>['prepare','execute','reconcile'].map(action=>({requestId,action,via:'BROWSER_DOM_EXACT_ONLY_HTTP',httpAdmission:'VOLATILE_UI_QUEUE_ONLY'})));
 result.exactActionEvidenceAfterRestart=[{action:'recover',requestId:'private_vault_graph'},{check:'OLD_LISTENER_GRANT_REJECTED'},
 ...['accountPrepare','accountExecute','accountReconcile','accountRecover','defiPrepare','defiExecute','defiReconcile','defiReopen'].map(action=>({action,check:'USED_EXACT_GRANT_REJECTED'}))];
 for (const [index, action] of ['accountPrepare','accountExecute','accountReconcile','accountRecover','accountReconcile'].entries()) {
  const pair={ action,requestId:'private_vault_graph',reviewId:String(index+1).repeat(64),listenerId:(index<2?'b':'c').repeat(64) };
  (index<2?result.exactActionEvidenceBeforeRestart:result.exactActionEvidenceAfterRestart).push(
   {...pair,check:'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED',generationId:'a'.repeat(64),accountIdentitySHA256:'d'.repeat(64),headAvailable:index<2||index===4,explicitScriptedAuthorization:true,visibleTermsVerified:true,browserConsentInitiallyUnchecked:true,sent:false},
   {...pair,check:'EXPLICIT_HANDOFF_CONFIRMATION',browserCheckboxChecked:true});
 }
 const pending={action:'accountReconcile',requestId:'private_vault_graph',reviewId:'6'.repeat(64),listenerId:'b'.repeat(64)};
 result.exactActionEvidenceBeforeRestart.push({...pending,check:'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED',generationId:'a'.repeat(64),accountIdentitySHA256:'d'.repeat(64),headAvailable:false,explicitScriptedAuthorization:true,visibleTermsVerified:true,browserConsentInitiallyUnchecked:true,sent:false},
  {...pending,check:'UNSPENT_HANDOFF_LISTENER_GRANT'});
 result.browserClosures = [0,1].map(() => ({browserOwnedCleanupConfirmed:true,guardPassed:true,
  sandboxedRendererObserved:true,exit:{code:0,signal:null},sandboxedRenderers:[{pid:123,startTimeTicks:'456',uids:[1000,1000,1000,1000],noNewPrivileges:1,seccomp:2}],
  newChromeProcessesRemaining:0,outsideOwnedGroup:[],signals:[],maximumOwnedBrowserRSSBytes:123456}));
 result.originalExitReviewStateUnchanged=true;
 const simpleActions=['accountPrepare','accountExecute','accountReconcile','accountPrepare','accountExecute','accountReconcile',
  'accountPrepare','accountExecute','accountReconcile','defiPrepare','defiExecute','defiReopen','defiPrepare','defiReconcile'];
 for (const [index,action] of simpleActions.entries()) result.exactActionEvidenceAfterRestart.push({action,
  check:'EXACT_BROWSER_CAPABILITY_IMPORTED_AFTER_VISIBLE_REVIEW',reviewId:(index+10).toString(16).padStart(64,'0'),
  listenerId:'c'.repeat(64),explicitScriptedAuthorization:true,visibleTermsVerified:true,browserConsentInitiallyUnchecked:true,sent:false});
 return result;
}

test('a fully constrained synthetic DOM record retains the original economic limits', () => {
  assert.deepEqual(assertManualWalletBrowserResult(syntheticBrowser()), {
    scope:'MANUAL_BROWSER_EXACT_ONLY_ONE_GENERATION_EVM_VAULT',actualFRecoveryAcceptance:false,
    sameAssetRolloverAcceptance:false,v2PoolDeployment:false,fullWalletAcceptance:false,
  });
});
test('SDK flags and unchecked consent cannot establish production DOM acceptance', () => {
  const changes = [
    r=>r.walletSdkEvmFlowCompleted=true, r=>r.walletBrowserEvmFlowCompleted=false,
    r=>r.responseLoss.browserReportedUnknown=false, r=>r.responseLoss.executeHttpRequests=2,
    r=>r.walletApplicationHttpAcceptance.manualGraphThroughExactBrowser=false,
    r=>r.walletApplicationHttpAcceptance.browserVisualAcceptance=false,
    r=>r.exactActionEvidenceBeforeRestart.find(x=>x.check==='TOKENLESS_HANDOFF_COMMITMENT_VERIFIED').visibleTermsVerified=false,
    r=>r.exactActionEvidenceBeforeRestart.find(x=>x.check==='TOKENLESS_HANDOFF_COMMITMENT_VERIFIED').browserConsentInitiallyUnchecked=false,
    r=>r.exactActionEvidenceBeforeRestart.find(x=>x.check==='EXPLICIT_HANDOFF_CONFIRMATION').browserCheckboxChecked=false,
    r=>r.exactActionEvidenceAfterRestart.find(x=>x.check==='EXACT_BROWSER_CAPABILITY_IMPORTED_AFTER_VISIBLE_REVIEW').sent=true,
    r=>r.exactActionEvidenceAfterRestart.find(x=>x.check==='EXACT_BROWSER_CAPABILITY_IMPORTED_AFTER_VISIBLE_REVIEW').browserConsentInitiallyUnchecked=false,
    r=>{const rows=r.exactActionEvidenceAfterRestart.filter(x=>x.check==='EXACT_BROWSER_CAPABILITY_IMPORTED_AFTER_VISIBLE_REVIEW');rows[1].reviewId=rows[0].reviewId;},
    r=>r.originalExitReviewStateUnchanged=false,
  ];
  for (const change of changes) {const result=syntheticBrowser();change(result);assert.throws(()=>assertManualWalletBrowserResult(result));}
});
test('escaped, signalled, unclosed or unsandboxed Chrome rejects even valid economics', () => {
  for (const change of [
    r=>r.browserClosures.pop(), r=>r.browserClosures[1].guardPassed=false,
    r=>r.browserClosures[0].browserOwnedCleanupConfirmed=false,
    r=>r.browserClosures[0].sandboxedRendererObserved=false,
    r=>r.browserClosures[0].sandboxedRenderers=[],
    r=>r.browserClosures[0].sandboxedRenderers[0].seccomp=0,
    r=>r.browserClosures[0].sandboxedRenderers[0].uids[1]=0,
    r=>r.browserClosures[0].exit.signal='SIGSEGV',
    r=>r.browserClosures[0].exit.code=1,
    r=>r.browserClosures[0].outsideOwnedGroup.push({pid:123}),
    r=>r.browserClosures[0].newChromeProcessesRemaining=1,
    r=>r.browserClosures[0].signals.push({pid:123,signal:'SIGTERM'}),
    r=>r.browserClosures[0].maximumOwnedBrowserRSSBytes=1024**3+1,
  ]) {const result=syntheticBrowser();change(result);assert.throws(()=>assertManualWalletBrowserResult(result));}
});
test('DOM evidence cannot replace missing proofs, pool backing or original journal identity', () => {
  for (const change of [r=>r.proofs.pop(),r=>r.finalPools[1].backedAmount='100',
    r=>r.originalGeneration.bindingsUnchanged=false,r=>r.originalGeneration.poolCount=3,
    r=>r.originalGeneration.requestIds[1]='replacement',r=>r.sourceUnchanged=false,
    r=>r.listenerRestart.coordinatorProcessRestart=true,r=>r.fullWalletAcceptance=true,
    r=>r.walletApplicationHttpAcceptance.graphUsedOriginalPrivateHarnessApi=true]) {
    const result=syntheticBrowser();change(result);assert.throws(()=>assertManualWalletBrowserResult(result));
  }
});
