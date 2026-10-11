/** Read-only public projection of this exact stopped retry. No native wire,
 * signature, key, witness or encrypted journal is exported. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { nativeClaimSourcePins } from '../../../tests/integration/claims/lifecycle/native-claim-source-pins.mjs';
import { claimGraphProofPackets } from '../../../tests/integration/claims/graph/validation/native-claim-graph-artifacts.mjs';
import { NATIVE_CLAIM_CONTRACT_PIN } from '../../../packages/backend/src/operations/deployments/claims/native-claim-artifacts.mjs';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
const runId='3bad9fb7-6a5e-4666-a819-dbe53d7af306',out='experiments/native-claim-graph-v3-retry-20261005';
const attempt='.local/native-claim-graph-v3-flow/attempt-'+runId;
const json=p=>JSON.parse(readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const write=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const result=json(join(attempt,'result.json')),resources=json(join(attempt,'resources.json')),processOutcome=json(join(out,'original-process-outcome.json'));
assert.equal(result.runId,runId);assert.equal(result.success,false);assert.equal(result.phase,'failed');
assert.equal(result.errorCode,'FLAT_OPERATOR_SIGNING_UNCERTAIN');assert.equal(resources.resultAccepted,false);
assert.equal(resources.sourceClosureUnchanged,true);assert.equal(resources.ownedGroupCleanupConfirmed,true);
assert.equal(processOutcome.originalProcessReturnCode,1);assert.equal(processOutcome.gateRestored,true);
for(const k of ['workerExit','workerClose']){assert.equal(resources[k].code,1);assert.equal(resources[k].signal,null);}
assert.equal(resources.lockReleased,true);
for(const k of ['closedEvm','closedBitcoin','closedSolana','closedController','closedKeeper'])assert.equal(result.cleanup[k],true);
assert.equal(result.cleanup.application.closed,true);assert.equal(result.cleanup.application.keeper.exitObserved,true);assert.deepEqual(result.cleanup.application.errors,[]);
const sourcePins=json(join(attempt,'source-pins.json'));
assert.equal(sha(readFileSync(join(attempt,'source-pins.json'))),resources.sourcePinsSHA256);assert.deepEqual(sourcePins,result.sourcePins);assert.deepEqual(sourcePins,resources.sourcePins);
const current=nativeClaimSourcePins(),expected=structuredClone(sourcePins),policy='integration/native-claim-graph-v3-policy.mjs',policyBytes=readFileSync(policy);
const row=expected.local.find(r=>r.path==='flat-wallet/'+policy);
assert.equal(row.sha256,'5a2ffbaa01e478a83ce66e06cc52b9a7a55d4dbb5f12275e7f680394b05442fa');
assert.equal(sha(policyBytes),'57dd5321d6af449be15dfe9676a23ec57a4f2d86fafe3015aec4a706ae2f9abe');
row.sha256=sha(policyBytes);row.bytes=policyBytes.length;assert.deepEqual(current,expected,'ONLY_SELECTED_GATE_RESTORED');
const locks=['.local/native-claim-graph-v3-flow/active.lock','.local/proof-workers/active.lock','/tmp/lianum-paeg-proof-host.lock'];assert.ok(locks.every(p=>!existsSync(p)));
const execution=json(join(attempt,'private-audit/claim-funded-graph-execution.json'));
const state=execution.execution,account=execution.accountStatus.operations;
assert.equal(state.errorCode,'FLAT_OPERATOR_SIGNING_UNCERTAIN');assert.deepEqual(state.errorCauseCodes,['FLAT_OPERATOR_AUDIT_TOO_OLD']);
assert.deepEqual(state.errorAuditBudget,{elapsedMilliseconds:30199,limitMilliseconds:30000,phase:'after-claim-coverage'});
assert.equal(state.stage,'ORIGINAL_OUTCOME_UNRESOLVED');assert.equal(state.outcome,null);assert.equal(state.admittedReceipts,0);assert.deepEqual(state.nativeExposure,[]);
assert.equal(account.length,1);assert.equal(account[0].stage,'UNKNOWN');assert.equal(account[0].errorCode,state.errorCode);assert.deepEqual(account[0].errorAuditBudget,state.errorAuditBudget);
const original=json(join(attempt,'private-audit/solana.json')).transfers;
assert.equal(original.length,1);const deposit=original[0];assert.equal(deposit.route,'deposit');assert.equal(deposit.phase,'OBSERVED_FINALIZED');assert.equal(deposit.broadcastAttempts,1);assert.equal(deposit.intent.lamports,'3000000');assert.ok(deposit.observation);
const graph=json(join(attempt,'private-audit/graph-native.json')),btc=json(join(attempt,'private-audit/bitcoin.json'));
assert.equal(graph.bitcoin.transfers.length,0);assert.equal(graph.solana.transfers.length,0);assert.equal(btc.transfers.length,0);
assert.deepEqual(result.claims,[{assetIndex:1,amount:'3000000',status:'ISSUED',ownerAbsent:true}]);assert.deepEqual(result.redemptions,[]);
const relations=['deposit_intent','native_claim_ingress_v3','authorization','reservation'];assert.deepEqual(result.proofs.map(p=>p.relation),relations);
const funded=result.fundedGraphAttestationPreflight;
assert.deepEqual(funded,{checkpoint:true,health:true,issuedClaimAmount:'3000000',beforeGraphProofs:true,custodyTransfers:1,graphTransfers:0,originalFinalizedDepositOnly:true,noCheckpointTransactionSubmitted:true});
assert.ok(result.ownerStops.some(s=>s.phase==='after-reservation-before-graph-native'&&s.ownerAbsent===true&&s.noNativeGraphEffectYet===true));
const error=json(join(attempt,'private-audit/error-location.json'));
const frames=error.frames.map(f=>f.replace(process.cwd()+'/',''));
const evm=json(join(attempt,'private-audit/evm.json'));
const bytes=readFileSync(join('.local/native-claims-contracts',NATIVE_CLAIM_CONTRACT_PIN.runId,'compiled.json'));assert.equal(sha(bytes),NATIVE_CLAIM_CONTRACT_PIN.compiledSHA256);
const artifact=JSON.parse(bytes).contracts['native-claims/NativeClaimGateway.sol'].NativeClaimGateway;
const methods=Object.fromEntries(Object.entries(artifact.evm.methodIdentifiers).map(([s,x])=>['0x'+x,s.split('(')[0]]));
const addresses=label=>evm.receipts.filter(r=>r.label===label).map(r=>r.receipt.contractAddress.toLowerCase());
const gateways=addresses('deploy native claim NativeClaimGateway'),tokens=addresses('deploy native claim NativeClaimToken'),pools=addresses('deploy flat PrivateFlatAssetNotePool.sol:PrivateFlatAssetNotePool');
assert.equal(gateways.length,2);assert.equal(tokens.length,2);assert.equal(pools.length,2);
const publicReceipt=r=>({transactionHash:r.transactionHash,status:r.receipt.status,blockNumber:r.receipt.blockNumber,gasUsed:r.gasUsed,logCount:r.receipt.logs.length});
const gatewayCalls=evm.receipts.filter(r=>gateways.includes(r.request.to?.toLowerCase())).map(r=>({method:methods[r.request.data.slice(0,10)],...publicReceipt(r)}));
assert.deepEqual(gatewayCalls.filter(r=>r.method!=='seal').map(r=>r.method),['preposition','reserveSignedEffect','issue']);assert.ok(gatewayCalls.every(r=>r.status==='0x1'));
const reservation=evm.receipts.filter(r=>r.label==='flat-account-reservation');assert.equal(reservation.length,1);assert.equal(reservation[0].receipt.status,'0x1');assert.equal(reservation[0].request.to,pools[1]);
const packets=claimGraphProofPackets(reservation[0].request.data);assert.equal(packets.name,'reserveGenericGuarded');assert.deepEqual(packets.packets.map(p=>p.relation),['authorization','reservation']);
const publicProofs=[];
for(const proof of result.proofs){
 const binary=readFileSync(join(attempt,'public-proofs',proof.file+'.bin')),inputs=readFileSync(join(attempt,'public-proofs',proof.file+'.inputs.json'));
 assert.equal(sha(binary),proof.proofSHA256);assert.equal(sha(inputs),proof.publicInputsSHA256);
 if(['authorization','reservation'].includes(proof.relation)){const packet=packets.packets.find(p=>p.relation===proof.relation);assert.equal(packet.proof,binary.toString('hex'));assert.deepEqual(packet.publicInputs,JSON.parse(inputs).map(String));}
 if(proof.relation==='native_claim_ingress_v3'){
  assert.equal(proof.evidence.sourceVersion,'65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555');
  assert.equal(proof.evidence.keySHA256,'11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f');assert.equal(proof.evidence.selfVerified,true);
 }
 const binName='public-'+proof.file+'.bin',inName='public-'+proof.file+'.inputs.json';
 writeFileSync(join(out,binName),binary,{flag:'wx',mode:0o600});writeFileSync(join(out,inName),inputs,{flag:'wx',mode:0o600});
 publicProofs.push({relation:proof.relation,binary:binName,inputs:inName,proofSHA256:sha(binary),publicInputsSHA256:sha(inputs)});
}
const transferTopic='0x'+publicKeccak256(Buffer.from('Transfer(address,address,uint256)')).toString('hex'),zero='0x'+'0'.repeat(64);
const tokenAccounting=tokens.map((token,i)=>{let minted=0n,burned=0n,poolNet=0n;const pool='0x'+'0'.repeat(24)+pools[i].slice(2);
 for(const row of evm.receipts)for(const log of row.receipt.logs){if(log.address.toLowerCase()!==token||log.topics[0]!==transferTopic)continue;assert.equal(log.topics.length,3);const amount=BigInt(log.data);if(log.topics[1]===zero)minted+=amount;if(log.topics[2]===zero)burned+=amount;if(log.topics[2]===pool)poolNet+=amount;if(log.topics[1]===pool)poolNet-=amount;}
 return{assetIndex:i,mintedAtomic:String(minted),burnedAtomic:String(burned),outstandingSupplyFromEvents:String(minted-burned),poolTokenBalanceFromEvents:String(poolNet)};});
assert.deepEqual(tokenAccounting,[{assetIndex:0,mintedAtomic:'0',burnedAtomic:'0',outstandingSupplyFromEvents:'0',poolTokenBalanceFromEvents:'0'},
 {assetIndex:1,mintedAtomic:'3000000',burnedAtomic:'0',outstandingSupplyFromEvents:'3000000',poolTokenBalanceFromEvents:'3000000'}]);
const observed=deposit.observation;
assert.equal(BigInt(observed.sourceBefore)-BigInt(observed.sourceAfter),3000000n+BigInt(observed.feeLamports));assert.equal(BigInt(observed.recipientAfter)-BigInt(observed.recipientBefore),3000000n);
const nativeAccounting={amountLamports:'3000000',feeLamports:observed.feeLamports,depositorBefore:observed.sourceBefore,depositorAfter:observed.sourceAfter,escrowBefore:observed.recipientBefore,escrowAfter:observed.recipientAfter,scope:'EXACT_ORIGINAL_FINALIZED_DEPOSIT_OBSERVATION_NOT_NEW_FINAL_RPC_READ'};
for(const [source,name]of[['attempt.json','original-application-attempt.json'],['resources.json','original-application-resources.json'],['result.json','original-application-result.json'],['source-pins.json','original-application-source-pins.json']])writeFileSync(join(out,name),readFileSync(join(attempt,source)),{flag:'wx',mode:0o600});
write('original-error-location.sanitized.json',{errorCode:error.errorCode,causeCode:error.causeCode,frames,causeFrames:error.causeFrames.map(f=>f.replace(process.cwd()+'/',''))});
write('original-execution-failure.sanitized.json',{stage:state.stage,outcome:state.outcome,errorCode:state.errorCode,errorCauseCodes:state.errorCauseCodes,errorAuditBudget:state.errorAuditBudget,admittedReceipts:0,nativeExposure:[],accountStage:account[0].stage,failureDiagnostics:result.failureDiagnostics});
write('original-economic-public-receipts.json',{gatewayCalls,reservation:{method:packets.name,...publicReceipt(reservation[0]),exactOriginalUSPacketsMatched:true},tokenAccounting,nativeAccounting});
write('gate-restoration-check.json',{onlySelectedGateRestored:true,disabledPolicySHA256:sha(policyBytes),sourceModules:current.local.length,runSourcePinsSHA256:resources.sourcePinsSHA256,postRestoreSourcePinsSHA256:sha(JSON.stringify(current,null,2)+'\n'),locks:locks.map(path=>({path,present:false}))});
write('terminal-sanitized.json',{format:'LIANUM_NATIVE_CLAIM_GRAPH_V3_RETRY_TERMINAL_V1',runId,priorStoppedRun:'30e3131f-9928-4a79-9e8c-4ae0e75727e0',success:false,
 errorCode:result.errorCode,underlyingErrorCode:'FLAT_OPERATOR_AUDIT_TOO_OLD',auditBudget:state.errorAuditBudget,
 failureBoundary:'POST_S_GRAPH_SIGNING_AUDIT_BEFORE_ANY_GRAPH_NATIVE_SEND',failedStage:result.stages.at(-1).name,
 originalProcessReturnCode:processOutcome.originalProcessReturnCode,supervisorFailure:resources.failure,workerExit:resources.workerExit,workerClose:resources.workerClose,
 originalDeposit:{amountLamports:'3000000',phase:'OBSERVED_FINALIZED',broadcastAttempts:1,nativeAccounting},
 originalRegisteredDomainV3Issuance:{status:'ISSUED',amountAtomic:'3000000',ownerOffline:true,duplicateNoteCreditPrevented:true},
 keeperCleanRestartAndCrashRecovery:result.acceptance.keeperProcessRestart&&result.acceptance.keeperCrashRecovery,
 sameLiveFixtureFundedPostmintPreflight:funded,sourceReservationSIncluded:true,exactOriginalUSPacketsMatched:true,ownerSuspendedAfterSBeforeNative:true,
 originalGraph:{sourceClaimAtomic:'3000000',payoutReserveAtomic:'1200000',ownerChangeAtomic:'1800000',solverNativeTargetLamports:'1000000',source:'FIXED_ACCEPTANCE_GRAPH_WITH_ORIGINAL_INCLUDED_US',settled:false,exited:false},
 nativeEffects:{solanaCustody:{records:1,broadcastAttempts:1,finalized:1},bitcoinCustody:0,solanaGraph:0,bitcoinGraph:0},
 graphSettlement:false,timeoutRecovery:false,noteExits:false,nativeRedemptions:false,separateOriginalCutoffRefund:false,tokenAccounting,
 finalNativeInventoryCaptured:existsSync(join(attempt,'private-audit/final-native.json')),independentlyReobservedFinalBalances:false,
 allClaimLiabilitiesClosedEstablished:false,publicProofs,noAutomaticRetryOrReplacement:true,
 sourceClosureUnchanged:true,sourceModules:sourcePins.local.length,ownedGroupCleanupConfirmed:true,
 runtimeCleanup:Object.fromEntries(['closedEvm','closedBitcoin','closedSolana','closedController','closedKeeper'].map(k=>[k,true])),keeperExitObserved:true,
 applicationCleanupErrors:[],applicationLockReleased:true,ownedLocksAbsent:true,selectedGraphGateRestored:true,disabledPolicySHA256:sha(policyBytes),
 changedRetainedSuccessArtifactCheckerRun:false,freshnessGuardRelaxed:false,cutoffChanged:false,realFunds:false,publicNetwork:false,
 oldUnknownDepositsRecovered:false,fullNativeGraphAcceptance:false,fullWalletAcceptance:false,
 limitation:'Original3M issued claim and its included1.2M reservation/1.8M change remain unsettled and unexited. This attempt does not establish economic recovery or latest native balances after teardown.'});
console.log(JSON.stringify({retained:true,runId,errorCode:result.errorCode,underlyingErrorCode:'FLAT_OPERATOR_AUDIT_TOO_OLD',nativeDepositFinalizedOnce:true,claimIssued:'3000000',sourceReservationIncluded:true,graphNativeEffects:0,cleanupConfirmed:true,gateRestored:true,proofs:relations}));
