/** Host-only synthetic result policy and source/gate checks. No acceptance run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MANUAL_WALLET_REAL_RUN_DISABLED, MANUAL_WALLET_PROOFS, assertManualWalletResult } from './manual-wallet-acceptance-policy.mjs';
import { runManualWalletSupervisor } from '../../native/native-flow-supervisor.mjs';
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
function synthetic() {
 const ids = ['vault_top_up','private_vault_graph','vault_exit_0','vault_exit_1'];
 const result = { format:'FLAT_MANUAL_WALLET_ACCEPTANCE_RESULT_V1', phase:'completed', success:true, localOnly:true,
 fakeFundsOnly:true, publicNetwork:false, sourceUnchanged:true, cleanup:{closedEvm:true}, walletSdkEvmFlowCompleted:true,
 manualConsentContractVerified:true,targetOwnerSuspendedAfterExactHttpAdmission:true,
 responseLoss:{requestId:'vault_top_up',discardedActualAdmissionReply:true,sdkReportedUnknown:true,executeHttpRequests:1,originalJournalReconciled:true,noAutomaticResubmit:true,actualNetworkOutage:false},
 proofs:MANUAL_WALLET_PROOFS.map(relation=>({relation})), fullWalletAcceptance:false,
 economics:{decimals:6,sourceDepositAtomic:'500',privatePayoutAtomic:'120',sourceChangeAtomic:'380',solverOwnUnderlyingAtomic:'100',deliveredPrivateSharesAtomic:'100',redeemedExternalUnderlyingAtomic:'100'},
 walletApplicationHttpAcceptance:{ originalAccountTopUpAndExit:true,originalDeFiPrepareExecuteReconcileReopen:true,originalRequestIdsRetained:true,
 accountHttp200WasVolatileOnly:true,confirmedOriginalJournalObserved:true,manualGraphThroughExactSDK:true,ownerLocalImmutablePreparations:true,
 oneMixedKeeper:true,oneCatalogueGeneration:true,originalGenerationDeFiFacade:true,exactOneUseReplayRejected:true,noImplicitReauthorization:true,
 originalHostManualHandoff:true,authenticatedGrantCommitment:true,explicitScriptedHandoffConfirm:true,
 graphUsedOriginalPrivateHarnessApi:false,graphExecutionExposed:false,browserVisualAcceptance:false },
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
 result.exactActionEvidenceBeforeRestart=ids.flatMap(requestId=>['prepare','execute','reconcile'].map(action=>({requestId,action,via:'NODE_SDK_EXACT_ONLY_HTTP',httpAdmission:'VOLATILE_UI_QUEUE_ONLY'})));
 result.exactActionEvidenceAfterRestart=[{action:'recover',requestId:'private_vault_graph'},{check:'OLD_LISTENER_GRANT_REJECTED'},
 ...['accountPrepare','accountExecute','accountReconcile','accountRecover','defiPrepare','defiExecute','defiReconcile','defiReopen'].map(action=>({action,check:'USED_EXACT_GRANT_REJECTED'}))];
 for (const [index, action] of ['accountPrepare','accountExecute','accountReconcile','accountRecover','accountReconcile'].entries()) {
  const pair={ action,requestId:'private_vault_graph',reviewId:String(index+1).repeat(64),listenerId:(index<2?'b':'c').repeat(64) };
  (index<2?result.exactActionEvidenceBeforeRestart:result.exactActionEvidenceAfterRestart).push(
   {...pair,check:'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED',generationId:'a'.repeat(64),accountIdentitySHA256:'d'.repeat(64),headAvailable:index<2||index===4,explicitScriptedAuthorization:true,sent:false},
   {...pair,check:'EXPLICIT_HANDOFF_CONFIRMATION'});
 }
 const pending={action:'accountReconcile',requestId:'private_vault_graph',reviewId:'6'.repeat(64),listenerId:'b'.repeat(64)};
 result.exactActionEvidenceBeforeRestart.push({...pending,check:'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED',generationId:'a'.repeat(64),accountIdentitySHA256:'d'.repeat(64),headAvailable:false,explicitScriptedAuthorization:true,sent:false},
  {...pending,check:'UNSPENT_HANDOFF_LISTENER_GRANT'});
 return result;
}
test('pure policy validates only exact bounded economics and explicitly limited scope',()=>{
 assert.deepEqual(assertManualWalletResult(synthetic()),{scope:'MANUAL_EXACT_ONLY_ONE_GENERATION_EVM_VAULT',actualFRecoveryAcceptance:false,sameAssetRolloverAcceptance:false,v2PoolDeployment:false,fullWalletAcceptance:false});
});
test('policy rejects a private GRAPH bypass, wrong economics, extra generations, lost IDs, false closure and padding erasure',()=>{
 for(const change of [r=>r.walletApplicationHttpAcceptance.graphUsedOriginalPrivateHarnessApi=true,
 r=>r.walletApplicationHttpAcceptance.originalHostManualHandoff=false,
 r=>r.walletApplicationHttpAcceptance.authenticatedGrantCommitment=false,
 r=>r.walletApplicationHttpAcceptance.explicitScriptedHandoffConfirm=false,
 r=>r.exactActionEvidenceBeforeRestart.find(x=>x.check==='TOKENLESS_HANDOFF_COMMITMENT_VERIFIED').generationId='e'.repeat(64),
 r=>r.exactActionEvidenceBeforeRestart.find(x=>x.check==='TOKENLESS_HANDOFF_COMMITMENT_VERIFIED').sent=true,
 r=>r.exactActionEvidenceAfterRestart.find(x=>x.check==='EXPLICIT_HANDOFF_CONFIRMATION').reviewId='f'.repeat(64),
 r=>r.walletApplicationHttpAcceptance.manualGraphThroughExactSDK=false,r=>r.economics.sourceDepositAtomic='500000000',
 r=>r.originalGeneration.poolCount=8,r=>r.originalGeneration.requestIds[1]='replacement_graph',r=>r.finalVault.totalAssets='1',
 r=>r.finalCapacity.conservativeOutputCapacity[0]=0,r=>r.finalPools[0].backedAmount='120',
 r=>r.offlineOriginalRecovery.actualFProofAccepted=true,r=>r.listenerRestart.coordinatorProcessRestart=true,
 r=>r.walletSdkEvmFlowCompleted=false,r=>r.manualConsentContractVerified=false,r=>r.targetOwnerSuspendedAfterExactHttpAdmission=false,
 r=>r.responseLoss.executeHttpRequests=2,r=>r.responseLoss.originalJournalReconciled=false,
 r=>r.exactActionEvidenceAfterRestart=[],r=>r.proofs.pop(),r=>r.sourceUnchanged=false,r=>r.cleanup.closedEvm=false]) {
  const result=synthetic();change(result);assert.throws(()=>assertManualWalletResult(result));
 }
});
test('source has exactly one generation, no private GRAPH API, no parallel generic keeper and no renewal',()=>{
 const worker=source('./manual-wallet-acceptance.mjs');
 assert.equal((worker.match(/await createFlatJournalGeneration\(/g)||[]).length,1);
 assert.equal((worker.match(/await createFlatJournalCatalogue\(/g)||[]).length,1);
 assert.match(worker,/createFlatManualGraphCatalogueSession\(\{ runtime, catalogue \}\)/);
 assert.match(worker,/createGenerationPrivateVaultExit\(\{ runtime, catalogue, services: \[vaultExit\] \}\)/);
 for(const forbidden of [/createGenericAccountKeeper/,/startFlatAccountHttp/,/await request\(/,/appendGeneration\(/,
 /createFlatManualGraphAccountSession\(/,/renewEpoch\(/,/confirmReauthorization\(/,/reviewReauthorization\(/,
 /owner\.prepareDeposit\(/,/owner\.prepareWithdrawal\(/,/ownerActions\.registerTopUp\(/,/ownerActions\.registerExit\(/]) assert.doesNotMatch(worker,forbidden);
 assert.match(worker,/catalogue\.reviewOwnerPreparation/);assert.match(worker,/catalogue\.confirmOwnerPreparation/);
 assert.match(worker,/approveManualEvmGraph/);assert.match(worker,/bootstrap\.bindManualGraph\(approval\)/);
 assert.match(worker,/appAccount\('recover'/);assert.match(worker,/appDriver\.reviewAccount\('execute'/);
 assert.match(worker,/coordinatorProcessRestart: false/);
});
test('fixed source pins include new worker and preserve original closure roots',()=>{
 const pins=source('./manual-wallet-source-pins.mjs'), supervisor=source('./native-flow-supervisor.mjs');
 assert.match(pins,/const base = evmVaultSourcePins\(\)/);
 assert.match(pins,/'integration\/run-manual-wallet-acceptance.mjs', 'integration\/manual-wallet-acceptance.mjs'/);
 assert.doesNotMatch(source('./source-pins.mjs'), /manualWalletSourcePins|manual-wallet-acceptance/);
 assert.match(supervisor,/sourcePins: manualWalletSourcePins/);assert.match(supervisor,/assertManualWalletResult\(result\)/);
});
test('reviewed fixed local release accepts no caller launch options',async()=>{
 assert.equal(MANUAL_WALLET_REAL_RUN_DISABLED,false);
 await assert.rejects(runManualWalletSupervisor({profile:'replacement'}),/MANUAL_WALLET_NO_SUPERVISOR_OPTIONS/);
 const supervisor=source('./native-flow-supervisor.mjs');
 assert.match(supervisor,/writeExclusive\(sourcePath, json\(sourcePins\)\)/);
 assert.match(supervisor,/NATIVE_SOURCE_CLOSURE_CHANGED/);
});

test('fixed actual composition uses production SDK and explicit host steps with no private GRAPH send or token callback',()=>{
 const driver=source('./manual-wallet-app-driver.mjs'), sdk=source('../wallet-platform/modules/api/wallet-application-client.mjs');
 assert.match(driver,/app\.createManualActionHandoff\(\)/);assert.match(driver,/host\.authorizeReview\(request\)/);
 assert.match(driver,/sdk\.acceptManualActionGrant\(grant\)/);assert.match(driver,/sdk\.getManualActionReview\(\)/);
 assert.match(driver,/sdk\.confirm\(\)/);assert.match(driver,/TOKENLESS_HANDOFF_COMMITMENT_VERIFIED/);
 assert.match(source('./manual-wallet-acceptance.mjs'),/appDriver\.unspentGraphGrantForListenerReplacement\(graphId\)/);
 assert.match(sdk,/manualActionHandoff: credentials\.manualActionHandoff/);
 assert.doesNotMatch(driver,/createGenericAccountKeeper|startFlatAccountHttp|flatManualGraphActionTarget|reviewReauthorization|confirmReauthorization/);
 for(const name of ['./manual-wallet-acceptance.mjs','./manual-wallet-app-driver.mjs','../wallet-platform/modules/api/wallet-application-client.mjs'])
  assert.doesNotMatch(source(name),/mock\.module|registerHooks|--experimental-loader/);
});
