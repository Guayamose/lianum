/** Public projection of this exact one-shot result; never exports native wires,
 * signatures, private keys, witnesses, encrypted stores or private audit files. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { nativeClaimSourcePins } from '../../../../tests/integration/claims/lifecycle/native-claim-source-pins.mjs';
import { claimGraphProofPackets } from '../../../../tests/integration/claims/graph/validation/native-claim-graph-artifacts.mjs';
import { validateClaimGraphV3Result } from '../../../../tests/integration/claims/graph/validation/native-claim-graph-v3-policy.mjs';
import { NATIVE_CLAIM_CONTRACT_PIN } from '../../../../packages/backend/src/operations/deployments/claims/native-claim-artifacts.mjs';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
const out='experiments/native-claim-graph-v3-audit-lifecycle-20261005';
const json=p=>JSON.parse(readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const emitted=[];
const write=(name,value)=>{writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});emitted.push(name);};
const optional=p=>existsSync(p)?json(p):null;
const pick=(value,keys)=>value?Object.fromEntries(keys.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]])):null;
const processOutcome=json(join(out,'original-process-outcome.json'));
assert.equal(processOutcome.launchCount,1);assert.equal(processOutcome.newAttempts.length,1);
const attempt=processOutcome.newAttempts[0];assert.match(attempt,/^\.local\/native-claim-graph-v3-flow\/attempt-[0-9a-f-]{36}$/);
const runId=attempt.split('attempt-')[1],result=json(join(attempt,'result.json')),resources=json(join(attempt,'resources.json'));
assert.equal(result.runId,runId);assert.equal(resources.runId,runId);
assert.ok(['completed','failed'].includes(resources.phase));assert.equal(resources.ownedGroupCleanupConfirmed,true);
assert.equal(resources.sourceClosureUnchanged,true);assert.equal(resources.lockReleased,true);
assert.equal(resources.finalResources.ownedGroupLiveCount,0);assert.deepEqual(resources.finalResources.ownedProcesses,[]);
assert.equal(resources.workerExitObserved,true);assert.equal(resources.workerCloseObserved,true);
assert.equal(processOutcome.supervisorTerminalAndOwnedCleanup,true);assert.equal(processOutcome.gateRestored,true);
assert.equal(sha(readFileSync(join(attempt,'resources.json'))),processOutcome.resourceReportSHA256);
const sourcePins=json(join(attempt,'source-pins.json'));
assert.equal(sha(readFileSync(join(attempt,'source-pins.json'))),resources.sourcePinsSHA256);
assert.deepEqual(sourcePins,result.sourcePins);assert.deepEqual(sourcePins,resources.sourcePins);
const current=nativeClaimSourcePins(),expected=structuredClone(sourcePins),policy='integration/native-claim-graph-v3-policy.mjs';
const row=expected.local.find(r=>r.path==='flat-wallet/'+policy),policyBytes=readFileSync(policy);
assert.equal(row.sha256,'5a2ffbaa01e478a83ce66e06cc52b9a7a55d4dbb5f12275e7f680394b05442fa');
assert.equal(sha(policyBytes),'57dd5321d6af449be15dfe9676a23ec57a4f2d86fafe3015aec4a706ae2f9abe');
row.sha256=sha(policyBytes);row.bytes=policyBytes.length;assert.deepEqual(current,expected,'ONLY_SELECTED_GATE_RESTORED');
const locks=['.local/native-claim-graph-v3-flow/active.lock','.local/proof-workers/active.lock','/tmp/lianum-paeg-proof-host.lock'];
assert.ok(locks.every(p=>!existsSync(p)));
const ownedProcesses=[resources.supervisorIdentity,...resources.processHistory].map(row=>{
 let state=null,startTimeTicks=null;
 try {const text=readFileSync('/proc/'+row.pid+'/stat','utf8'),fields=text.slice(text.lastIndexOf(') ')+2).trim().split(/\s+/);state=fields[0];startTimeTicks=fields[19];}
 catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
 const sameIdentityLive=startTimeTicks===row.startTimeTicks&&!['Z','X'].includes(state);
 assert.equal(sameIdentityLive,false,'EXACT_OWNED_PROCESS_STILL_LIVE');
 return{pid:row.pid,startTimeTicks:row.startTimeTicks,role:row.role??'supervisor',sameIdentityLive,
   currentIdentityPresent:startTimeTicks!==null,currentIdentityMatches:startTimeTicks===row.startTimeTicks,currentState:state};
});
if(resources.resultAccepted){assert.equal(result.success,true);assert.equal(processOutcome.originalProcessReturnCode,0);validateClaimGraphV3Result(result);}
else assert.equal(result.fullNativeGraphAcceptance,false);
const privateRoot=join(attempt,'private-audit');
const execution=optional(join(privateRoot,'claim-funded-graph-execution.json'));
const executionState=pick(execution?.execution,['stage','outcome','errorCode','errorCauseCodes','errorAuditBudget','admittedReceipts']);
if(executionState)executionState.nativeExposureCount=execution.execution.nativeExposure?.length??null;
const error=optional(join(privateRoot,'error-location.json'));
const errorLocation=error?{...pick(error,['errorCode','causeCode']),frames:(error.frames??[]).map(f=>f.replace(process.cwd()+'/','')),
 causeFrames:(error.causeFrames??[]).map(f=>f.replace(process.cwd()+'/',''))}:null;
const transferSummary=record=>({route:record.route??null,phase:record.phase??null,broadcastAttempts:record.broadcastAttempts??null,
 amountAtomic:record.intent?.lamports??record.intent?.amount??null,observation:pick(record.observation,
 ['sourceBefore','sourceAfter','recipientBefore','recipientAfter','feeLamports','feeSatoshis'])});
const custody={bitcoin:optional(join(privateRoot,'bitcoin.json')),solana:optional(join(privateRoot,'solana.json'))};
const graph=optional(join(privateRoot,'graph-native.json'));
const nativeEffects={custody:Object.fromEntries(Object.entries(custody).map(([name,data])=>[name,data?data.transfers.map(transferSummary):null])),
 graph:graph?Object.fromEntries(['bitcoin','solana'].map(name=>[name,graph[name].transfers.map(transferSummary)])):null};
const finalNative=optional(join(privateRoot,'final-native.json'));
const finalNativeAccounting=finalNative?.map(record=>({family:record.family,accounts:record.accounts.map(row=>pick(row,['role','total','spendable','unlockedSpendable','rentExemptMinimum'])),
 signingUnresolved:record.signingUnresolved,scope:'RETAINED_LIVE_FIXTURE_FINAL_INVENTORY_NOT_POST_TEARDOWN_RPC'}))??null;
const evm=optional(join(privateRoot,'evm.json'));
let economicReceipts=null,matchedPackets=[];
if(evm){
 const bytes=readFileSync(join('.local/native-claims-contracts',NATIVE_CLAIM_CONTRACT_PIN.runId,'compiled.json'));
 assert.equal(sha(bytes),NATIVE_CLAIM_CONTRACT_PIN.compiledSHA256);
 const artifact=JSON.parse(bytes).contracts['native-claims/NativeClaimGateway.sol'].NativeClaimGateway;
 const methods=Object.fromEntries(Object.entries(artifact.evm.methodIdentifiers).map(([s,x])=>['0x'+x,s.split('(')[0]]));
 const addresses=label=>evm.receipts.filter(r=>r.label===label).map(r=>r.receipt.contractAddress.toLowerCase());
 const gateways=addresses('deploy native claim NativeClaimGateway'),tokens=addresses('deploy native claim NativeClaimToken'),pools=addresses('deploy flat PrivateFlatAssetNotePool.sol:PrivateFlatAssetNotePool');
 const publicReceipt=r=>({label:r.label,transactionHash:r.transactionHash,status:r.receipt.status,blockNumber:r.receipt.blockNumber,gasUsed:r.receipt.gasUsed,logCount:r.receipt.logs.length});
 const gatewayCalls=evm.receipts.filter(r=>gateways.includes(r.request.to?.toLowerCase())).map(r=>({method:methods[r.request.data.slice(0,10)]??'unknown',...publicReceipt(r)}));
 const graphCalls=[];
 for(const r of evm.receipts){
  if(!['flat-account-reservation','flat-admit','flat-fulfill'].includes(r.label)&&!r.label?.includes('claim-graph'))continue;
  try{const packets=claimGraphProofPackets(r.request.data);graphCalls.push({method:packets.name,...publicReceipt(r)});if(r.receipt.status==='0x1')matchedPackets.push(...packets.packets);}catch{}
 }
 // Include exact packet matches regardless of the receipt label, but only for
 // the existing three graph methods and successful original transactions.
 for(const r of evm.receipts){if(r.receipt.status!=='0x1'||typeof r.request.data!=='string')continue;
  try{const packets=claimGraphProofPackets(r.request.data);if(!graphCalls.some(x=>x.transactionHash===r.transactionHash))graphCalls.push({method:packets.name,...publicReceipt(r)});
   for(const packet of packets.packets)if(!matchedPackets.some(x=>x.relation===packet.relation&&x.proof===packet.proof))matchedPackets.push(packet);
  }catch{}
 }
 const transferTopic='0x'+publicKeccak256(Buffer.from('Transfer(address,address,uint256)')).toString('hex'),zero='0x'+'0'.repeat(64);
 const tokenAccounting=tokens.map((token,i)=>{let minted=0n,burned=0n,poolNet=0n;const pool=pools[i]?'0x'+'0'.repeat(24)+pools[i].slice(2):null;
  for(const row of evm.receipts)for(const log of row.receipt.logs){if(log.address.toLowerCase()!==token||log.topics[0]!==transferTopic)continue;
   assert.equal(log.topics.length,3);const amount=BigInt(log.data);if(log.topics[1]===zero)minted+=amount;if(log.topics[2]===zero)burned+=amount;if(log.topics[2]===pool)poolNet+=amount;if(log.topics[1]===pool)poolNet-=amount;}
  return{assetIndex:i,mintedAtomic:String(minted),burnedAtomic:String(burned),outstandingSupplyFromEvents:String(minted-burned),poolTokenBalanceFromEvents:pool?String(poolNet):null};});
 economicReceipts={gatewayCalls,graphCalls,tokenAccounting,scope:'RETAINED_SUCCESSFUL_TRANSACTION_LOGS_NOT_NEW_FINAL_RPC_READ'};
}
const publicProofs=[];
for(const proof of result.proofs){
 const binary=readFileSync(join(attempt,'public-proofs',proof.file+'.bin')),inputs=readFileSync(join(attempt,'public-proofs',proof.file+'.inputs.json'));
 assert.equal(sha(binary),proof.proofSHA256);assert.equal(sha(inputs),proof.publicInputsSHA256);
 const matched=matchedPackets.some(packet=>packet.relation===proof.relation&&packet.proof===binary.toString('hex')&&JSON.stringify(packet.publicInputs)===JSON.stringify(JSON.parse(inputs).map(String)));
 const binName='public-'+proof.file+'.bin',inName='public-'+proof.file+'.inputs.json';
 writeFileSync(join(out,binName),binary,{flag:'wx',mode:0o600});writeFileSync(join(out,inName),inputs,{flag:'wx',mode:0o600});emitted.push(binName,inName);
 publicProofs.push({relation:proof.relation,binary:binName,inputs:inName,proofSHA256:sha(binary),publicInputsSHA256:sha(inputs),graphCalldataPacketMatched:matched});
}
for(const [source,name]of[['attempt.json','original-application-attempt.json'],['resources.json','original-application-resources.json'],['source-pins.json','original-application-source-pins.json']]){
 writeFileSync(join(out,name),readFileSync(join(attempt,source)),{flag:'wx',mode:0o600});emitted.push(name);
}
const resultProjection=pick(result,['format','runId','profile','selectedAssets','phase','success','localOnly','fakeFundsOnly','publicNetwork','stages','ownerStops','claims','redemptions','proofs','transactions','keeperRestarts','nativeProtocol','cleanup','acceptance','independentOperators','nativeSelfCustody','keeperRestart','nativeNodeRestart','operatorKeyRestart','fullHostRestart','systemicPrivacyAcceptance','fullWalletAcceptance','fullNativeGraphAcceptance','ingressRelation','ingressSourceVersion','ingressKeySHA256','disclosure','graphAttestationPreflight','nonceInfrastructure','fundedGraphAttestationPreflight','privatePortfolio','failureDiagnostics','errorCode','causeCode','errorCauseCodes','errorAuditBudget','claimFundedGraph','expiredDepositRefund','finalClaimState','nativeEffects','finalAuditUnavailable','interruption']);
write('original-application-result.sanitized.json',resultProjection);
write('owned-cleanup-verification.json',{runId,workerExit:resources.workerExit,workerClose:resources.workerClose,
 ownedGroupCleanupConfirmed:true,finalResources:resources.finalResources,ownedProcesses,applicationCleanup:result.cleanup,
 sourceClosureUnchanged:true,sourceModules:sourcePins.local.length,onlySelectedGateRestored:true,disabledPolicySHA256:sha(policyBytes),
 runSourcePinsSHA256:resources.sourcePinsSHA256,postRestoreSourcePinsSHA256:sha(JSON.stringify(current,null,2)+'\n'),locks:locks.map(path=>({path,present:false}))});
write('original-economic-public-receipts.json',{runId,...economicReceipts,nativeEffects,finalNativeAccounting});
if(errorLocation)write('original-error-location.sanitized.json',errorLocation);
if(executionState)write('original-execution-status.sanitized.json',{runId,execution:executionState,
 accountOperations:execution.accountStatus?.operations?.map(row=>pick(row,['stage','errorCode','errorCauseCodes','errorAuditBudget']))??null});
const artifactCheck=optional(join(attempt,'artifact-check.json'));
if(artifactCheck){assert.equal(artifactCheck.runId,runId);write('original-artifact-check.json',artifactCheck);}
write('terminal-sanitized.json',{format:'LIANUM_NATIVE_CLAIM_GRAPH_V3_AUDIT_LIFECYCLE_TERMINAL_V1',runId,
 priorStoppedRun:'3bad9fb7-6a5e-4666-a819-dbe53d7af306',success:result.success,resultAccepted:resources.resultAccepted,
 errorCode:result.errorCode??null,causeCode:result.causeCode??null,errorCauseCodes:result.errorCauseCodes??[],errorAuditBudget:result.errorAuditBudget??null,
 supervisorFailure:resources.failure,failedStage:result.success?null:result.stages.at(-1)?.name??null,originalProcessReturnCode:processOutcome.originalProcessReturnCode,
 execution:executionState,acceptance:result.acceptance,claimFundedGraph:result.claimFundedGraph??null,
 sameLiveFixtureFundedPostmintPreflight:result.fundedGraphAttestationPreflight??null,claims:result.claims,redemptions:result.redemptions,
 originalCutoffRefund:result.expiredDepositRefund??null,finalClaimState:result.finalClaimState??null,
 tokenAccounting:economicReceipts?.tokenAccounting??null,nativeEffects,finalNativeInventoryCaptured:finalNative!==null,
 independentlyReobservedFinalBalances:finalNative!==null,finalObservationScope:finalNative?'RETAINED_LIVE_FIXTURE_FINAL_INVENTORY':'NO_FINAL_NATIVE_INVENTORY_RETAINED',
 allClaimLiabilitiesClosedEstablished:result.acceptance.allClaimLiabilitiesClosed===true,
 proofPackets:publicProofs.length,publicProofs,sourceClosureUnchanged:true,sourceModules:sourcePins.local.length,
 ownedGroupCleanupConfirmed:true,selectedGraphGateRestored:true,ownedLocksAbsent:true,
 retainedSuccessArtifactCheckerRun:artifactCheck!==null,noAutomaticRetryOrReplacement:true,originalFailedFixtureRecovered:false,
 realFunds:false,publicNetwork:false,fullNativeGraphAcceptance:resources.resultAccepted===true&&result.fullNativeGraphAcceptance===true,fullWalletAcceptance:false});
const publicFiles=['README.md','capture-source.py','check-launch.mjs','run-once.py','retain-terminal.mjs','frozen-source-pins.json','frozen-checkpoint-identity.json','launch-checkpoint.json','launch-started.json','original-process-outcome.json',...emitted];
// Reject any literal original native wire or native transaction signature in
// textual exports. These values are read locally only for exclusion checks.
const forbidden=[];
const gather=value=>{if(!value||typeof value!=='object')return;for(const[k,v]of Object.entries(value)){
 if(['nativeWire','nativeId','signatureHex','signatureBase58','secretKey','privateKey'].includes(k)&&typeof v==='string'&&v.length>=64)forbidden.push(v);
 else if(v&&typeof v==='object')gather(v);
}};
gather(custody);gather(graph);
for(const name of publicFiles.filter(name=>!name.endsWith('.bin'))){const text=readFileSync(join(out,name),'utf8');assert.ok(forbidden.every(value=>!text.includes(value)),'PRIVATE_NATIVE_VALUE_IN_EXPORT');}
write('backup-public-allowlist.json',{format:'LIANUM_NATIVE_CLAIM_GRAPH_V3_PUBLIC_BACKUP_ALLOWLIST_V1',runId,
 scope:'PUBLIC_OR_SANITIZED_RESULTS_AND_FIXED_SOURCE_ONLY',records:publicFiles.map(path=>{const bytes=readFileSync(join(out,path));return{path,bytes:bytes.length,sha256:sha(bytes)};}),manifestSelf:'backup-public-allowlist.json',
 excluded:['original-supervisor.stdout','original-supervisor.stderr','private-audit','signed native wires','native signatures','private keys','witnesses','encrypted stores','native ledgers'],originalNativeWireAndSignatureAbsentFromExports:true});
console.log(JSON.stringify({retained:true,runId,success:result.success,resultAccepted:resources.resultAccepted,errorCode:result.errorCode??null,proofPackets:publicProofs.length,sourceModules:sourcePins.local.length,cleanupConfirmed:true,gateRestored:true,allowlistedFiles:publicFiles.length}));
