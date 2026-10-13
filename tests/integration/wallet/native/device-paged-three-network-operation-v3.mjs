/** One actual Paged operation through the same encrypted SDK and runner as the
 * mobile app. The Expo hardware ports are the explicit Node software oracle.
 * Native ledgers, proofs, keys, deployed consumers and receipts stay original.
 * This source alone establishes neither acceptance nor a device/public run. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {readOriginalPagedNativeExecutionContextV3} from '../../../../packages/backend/src/operations/local/funded-paged-native-operator-v3.mjs';
import {readOriginalFundedPagedGraphDeploymentV3} from '../../../../packages/backend/src/operations/local/funded-graph-paged-deployment-v3.mjs';
import {runDevicePagedPayoutSettlementV3} from '@lianum/mobile-protocol/device/paged-payout-settlement-v3';
import {assertOriginalPagedMobileHostV3} from './device-paged-mobile-host-v3.mjs';
import {prepareOriginalPagedMobileUniswapNodeV3,prepareOriginalPagedMobileUniswapNodeFromBackendV3} from './device-paged-uniswap-mobile-flow-v3.mjs';
import {assertOriginalPagedMixedBackendProcessV3} from './device-paged-mixed-backend-client-v3.mjs';
import {openOriginalPagedMixedBackendTransportV3} from './device-paged-mixed-backend-transport-v3.mjs';
import {emitOriginalDevicePagedProviderRetentionV3,reopenOriginalDevicePagedPrivateOwnerV3} from '../../../../packages/backend/src/accounts/authority/device-paged-note-authority-v3.mjs';
import {readOriginalPagedNativeProviderCheckpointV3,reloadOriginalPagedNativeProviderV3} from '../../../../packages/backend/src/providers/funded-paged-native-provider-v3.mjs';

export const PAGED_THREE_NETWORK_OPERATION_PLAN_V3=Object.freeze({
 profile:'ORIGINAL_PAGED_THREE_NETWORK_MOBILE_OPERATION_V3',
 pages:1,nodes:3,nativeDeliveries:3,proofBudget:13,terminalClosures:1,withdrawals:1,
 softwareCustody:true,localSynthetic:true,publicNetwork:false,phone:false,independentOperators:false,
});
const project=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
assert.equal(fileURLToPath(import.meta.url),join(project,'tests/integration/wallet/native/device-paged-three-network-operation-v3.mjs'),'PAGED_THREE_NETWORK_CANONICAL_NAMESPACE');
const sources=Object.freeze({owner:'api/device-paged-owner-api-v3.mjs',graph:'api/device-paged-graph-api-v3.mjs',vault:'custody/device-paged-note-vault-v3.ts',key:'custody/key-store.ts',runner:'api/device-paged-operation-runner-v3.mjs',session:'custody/wallet-session-v1.ts',actor:'state/private-wallet-state-v1.mjs',portfolio:'state/wallet-portfolio-v1.mjs',readPlan:'state/wallet-connection-read-plan-v1.mjs',registry:'state/public-connection-registry-v1.mjs'});
const hex=value=>'0x'+value,word=value=>'0x'+BigInt(value).toString(16).padStart(64,'0');
async function originalMobile(role){
 assert.ok(Object.hasOwn(sources,role));const path=join(project,'apps/mobile/src',sources[role]);
 assert.equal(await realpath(path),path,'PAGED_THREE_NETWORK_ORIGINAL_MOBILE_SOURCE');return import(pathToFileURL(path).href);
}

export async function runOriginalPagedThreeNetworkOperationV3(product,host){
 assert.equal(arguments.length,2);return runOperation(product,host,false);
}

/** Same original three deliveries, with credential reload and private OWNER
 * replacement after the first confirmed node. Parent authority/ledgers live. */
export async function runOriginalPagedThreeNetworkContinuityV3(product,host){
 assert.equal(arguments.length,2);return runOperation(product,host,true);
}

export async function runOriginalPagedMixedOperationV3(product,host,tls){assert.equal(arguments.length,3);const context=readOriginalPagedNativeExecutionContextV3(product);assert.ok(context.uniswapContext,'PAGED_MIXED_ORIGINAL_CONTEXT');const uniswap=await prepareOriginalPagedMobileUniswapNodeV3(context.uniswapContext,host,{certificate:tls.cert,privateKey:tls.key},{listenerManagedByOperator:true});try{return await runOperation(product,host,false,uniswap);}finally{await uniswap.close();}}

export async function runOriginalPagedMixedColdOperationV3(backend,host,tls){
 assert.equal(arguments.length,3);assertOriginalPagedMixedBackendProcessV3(backend);assertOriginalPagedMobileHostV3(host);
 const transport=openOriginalPagedMixedBackendTransportV3(backend,tls);let uniswap;
 try{uniswap=await prepareOriginalPagedMobileUniswapNodeFromBackendV3(backend,host,{certificate:tls.cert,privateKey:tls.key});return await runOperation(null,host,false,uniswap,{backend,transport});}finally{await Promise.all([uniswap?.close(),transport.close()]);}
}
// These read-only adapters are private to a genuine fixed backend child. No
// runtime/proof/dispatch authority is manufactured from its public IPC DATA.
function mixedBackendAdapter(backend,transport){
 assertOriginalPagedMixedBackendProcessV3(backend);const data=backend.data(),descriptor=backend.descriptor;
 const runtime={accounts:data.receiverAccounts,block:()=>backend.query('block'),balance:async address=>BigInt(await backend.query('balance',[address]))};
 const system={manifestSHA256:descriptor.manifestSHA256,consumerSHA256:descriptor.consumerSHA256,pool:descriptor.pool};
 const d={call(kind,method,args){assert.equal(kind,'pool');assert.ok(args.length===1&&['graphOutcomes(bytes32)','spentNullifiers(bytes32)'].includes(method));return backend.query(method==='graphOutcomes(bytes32)'?'graph-outcome':'spent-nullifier',args);}};
 return{runtime,system,d,descriptor,fetchImpl:transport.fetchImpl};
}
async function runOperation(product,host,continuity,uniswap=null,cold=null){
 assertOriginalPagedMobileHostV3(host);
 const ctx=cold?mixedBackendAdapter(cold.backend,cold.transport):readOriginalPagedNativeExecutionContextV3(product),{runtime,system}=ctx,descriptor=cold?ctx.descriptor:product.descriptor;
 const d=cold?ctx.d:readOriginalFundedPagedGraphDeploymentV3(runtime,system);
 // The host has already installed its explicit software Expo oracle. Every
 // source below is the canonical mobile body, including its protected PoP.
 const [{createDevicePagedOwnerApiV3},{createDevicePagedGraphApiV3},{createDevicePagedGraphNoteVaultV3},key,{runDevicePagedOperationV3}]=await Promise.all(['owner','graph','vault','key','runner'].map(originalMobile));
 assert.equal(await key.readDevicePublicKey(),descriptor.devicePublicKey);assert.equal(host.devicePublicKey,descriptor.devicePublicKey);
 const proofs=new Map(),native=new Map(),commands=[];let status,last=null,reopened=false,continuityEvidence=null,managedSession=null,lostReplyInjected=false,lostReplyArmed=false;const coldEvidence=[],portfolioEvidence=[];let actor=null,actorModules=null,actorTasks=null,actorAfterDrain=null;const actorDrainEvidence=[];
 const progress=(stage,extra={})=>process.stdout.write(JSON.stringify({profile:'PAGED_THREE_NETWORK_STEP',stage,...extra})+'\n');
 // Preserve the exact TLS port and response bytes. Only public status clock
 // numbers are retained, so a clock failure can be diagnosed without exporting
 // a command, ciphertext, permission, note opening or witness.
 const fetchImpl=async(url,init)=>{
  const response=await ctx.fetchImpl(url,init),readText=response.text.bind(response),dropThisReply=lostReplyArmed&&url===descriptor.origin+'/v1/mobile/paged-owner/graph/operations'&&response.status===200;if(lostReplyArmed&&url===descriptor.origin+'/v1/mobile/paged-owner/graph/operations')lostReplyArmed=false;
  Object.defineProperty(response,'text',{value:async()=>{
   const body=await readText(),receivedAt=Date.now();if(dropThisReply){lostReplyInjected=true;progress('original-ethereum-reply-lost');throw Error('PAGED_MIXED_ACCEPTANCE_DISCARDED_REPLY');}let frame;
   try{frame=JSON.parse(body);}catch{return body;}
   const clock=frame?.status;
   if(Number.isSafeInteger(clock?.issuedAt)&&Number.isSafeInteger(clock?.expiresAt)&&Number.isSafeInteger(clock?.descriptor?.deadlineMs))
    progress('status-clock',{issuedAt:clock.issuedAt,expiresAt:clock.expiresAt,deadlineMs:clock.descriptor.deadlineMs,receivedAt,ageMs:receivedAt-clock.issuedAt});
   return body;
  }});return response;
 };
 let vault=await createDevicePagedGraphNoteVaultV3(descriptor),note=createDevicePagedOwnerApiV3({descriptor,fetchImpl}),api=createDevicePagedGraphApiV3({descriptor,fetchImpl});
 function retainProof(job,action,elapsedMs){
  if(!job?.proofSHA256||proofs.has(job.jobId))return;
  assert.match(job.proofSHA256,/^[0-9a-f]{64}$/);proofs.set(job.jobId,{mode:job.mode,sha256:job.proofSHA256,action,elapsedMs});
  progress('proof-complete',{count:proofs.size,mode:job.mode,elapsedMs});
 }
 async function noteStatus(){
  const consent=await note.challenge(await vault.readDraft()),signature=await key.signDevicePagedOwnerPermissionV3(consent,descriptor.origin,descriptor.pairingId);
  const result=await note.submit(consent,signature);await vault.acceptStatus(result);return result;
 }
 async function command(action,body,options={}){
  const request=await vault.graphCommand(action,body),started=performance.now();let reply,result;progress('command-start',{action});
  try{
   const arm=await vault.armGraphCommand(request);
   const consent=await api.challenge(action,request.graphId,request.jobId,request.rootId,request.revision,request.command),signature=await key.signDevicePagedGraphPermissionV3(consent,descriptor.origin,descriptor.pairingId,options.signal,options.authorization?{authorization:options.authorization,command:request.command}:undefined);
   await vault.consumeArmedGraphConsent(arm,consent);if(cold&&!lostReplyInjected&&action==='EXECUTE_NATIVE'&&body.id==='ethereum-payment')lostReplyArmed=true;reply=await api.submit(consent,signature,request.command);await vault.acceptGraphReply(reply);
   status=reply.status;const elapsedMs=Math.round(performance.now()-started);commands.push({action,elapsedMs});retainProof(status.job,action,elapsedMs);
   P.pagedOwnerWipeV3(last);last=structuredClone(reply.private);
   if(action==='EXECUTE_NATIVE'&&reply.private.delivery?.nativeId){
    const delivery=reply.private.delivery,prior=native.get(delivery.id);if(prior)assert.equal(prior.nativeId,delivery.nativeId,'PAGED_THREE_NETWORK_NO_RESEND');
    else{assert.ok(![...native.values()].some(row=>row.nativeId===delivery.nativeId));native.set(delivery.id,{id:delivery.id,nativeId:delivery.nativeId});progress('native-delivery',{count:native.size,status:delivery.status});}
   }
   await options.onReply?.(reply);
   // The runner owns this private copy and wipes it after consuming it. The
   // actual vault has already retained its authenticated original SDK reply.
   result=structuredClone(reply.private);P.pagedOwnerWipeV3(reply.private);progress('command-complete',{action,elapsedMs});
   if(cold&&action==='NEXT_COMMAND'&&['1','2'].includes(result.completed)&&!coldEvidence.some(row=>row.completed===result.completed)){
    const completed=result.completed;P.pagedOwnerWipeV3(result);result=null;await restartMixed(completed==='1'?'after-uniswap':'after-ethereum',completed);return command('NEXT_COMMAND',{});
   }
   if(continuity&&!reopened&&action==='NEXT_COMMAND'&&result.completed==='1'){
    reopened=true;assert.equal(native.size,1);const beforeProofs=proofs.size,beforeNative=[...native.values()],beforePublic=structuredClone(status),checkpoint=readOriginalPagedNativeProviderCheckpointV3(ctx.provider);
    const token=await emitOriginalDevicePagedProviderRetentionV3(ctx.account,ctx.provider,'RELOAD',checkpoint);
    await reloadOriginalPagedNativeProviderV3(ctx.provider,token);
    assert.deepEqual(readOriginalPagedNativeProviderCheckpointV3(ctx.provider),checkpoint);
    const restored=await reopenOriginalDevicePagedPrivateOwnerV3(ctx.account);
    assert.equal(restored.public.progressCommitment,beforePublic.progressCommitment);assert.equal(restored.public.authorizationRoot,beforePublic.authorizationRoot);
    const current=readOriginalPagedNativeExecutionContextV3(product);assert.equal(current.account,ctx.account);assert.equal(current.provider,ctx.provider);assert.equal(current.runtime,runtime);assert.equal(current.nativeRuntime,ctx.nativeRuntime);
    assert.equal(proofs.size,beforeProofs);assert.deepEqual([...native.values()],beforeNative);
    continuityEvidence={profile:'ORIGINAL_PAGED_QUIESCENT_OWNER_PROVIDER_CONTINUITY_V3',completedBeforeReopen:1,ownerReopens:1,providerReloads:1,progressCommitment:restored.public.progressCommitment,sameAuthorityAndProvider:true,sameLiveRuntimes:true,proofsRepeatedDuringReopen:0,nativeSendsDuringReopen:0,fullSupervisorRestart:false};
    progress('continuity-reopened',{completed:1,ownerReopens:1,providerReloads:1});
    P.pagedOwnerWipeV3(result);result=null;await perform('OBSERVE_GRAPH',{});return command('NEXT_COMMAND',{});
   }
   const returned=result;result=null;return returned;
  }finally{P.pagedOwnerWipeV3(result);P.pagedOwnerWipeV3(reply?.private);P.pagedOwnerWipeV3(request.command);}
 }
 async function perform(action,body){const reply=await command(action,body);P.pagedOwnerWipeV3(reply);}
 async function restartMixed(stage,completed=null){
  assert.ok(cold);const before=structuredClone(status),beforeProofs=proofs.size,beforeNative=[...native.values()];
  let abandonedObservation=null;
  if(stage==='after-owner-payouts'){
   // Reproduce leaving the completed operation while an original read is
   // awaiting authorization. Never sign or submit this consent.
   const pending=await vault.graphCommand('OBSERVE_GRAPH',{});
   try{const consent=await api.challenge(pending.action,pending.graphId,pending.jobId,pending.rootId,pending.revision,pending.command);assert.equal(consent.action,'OBSERVE_GRAPH');assert.equal(consent.graphId,before.graphId);abandonedObservation={action:consent.action,operationsSubmitted:0,originalExpiry:consent.expiresAt};}
   finally{P.pagedOwnerWipeV3(pending.command);}
   progress('completed-graph-read-abandoned',{action:'OBSERVE_GRAPH',operationsSubmitted:0});
  }
  await uniswap.suspend();await Promise.all([api.close(),note.close(),vault.close()]);await cold.transport.drain();
  const restarted=await cold.backend.restart();assert.equal(proofs.size,beforeProofs);assert.deepEqual([...native.values()],beforeNative);
  vault=await createDevicePagedGraphNoteVaultV3(descriptor);note=createDevicePagedOwnerApiV3({descriptor,fetchImpl});api=createDevicePagedGraphApiV3({descriptor,fetchImpl});
  const target=await uniswap.reconnect();assert.equal(target.jobs.find(row=>row.jobId===uniswap.originalD27.jobId).consentFields.proofSHA256,uniswap.originalD27.proofSHA256);
  await noteStatus();if(before){await perform('OBSERVE_GRAPH',{});for(const field of ['graphId','rootId','revision','authorizationRoot','reserveNullifier','progressCommitment','sourceCommitment','sourceNullifier','pages','nodes','budget','settleBefore','phase'])assert.deepEqual(status[field],before[field],'PAGED_MIXED_REOPEN_GRAPH_JOIN');}
  const evidence={stage,completed,...restarted,...(abandonedObservation?{abandonedObservation}:{}),proofsRepeatedDuringReopen:0,nativeSendsDuringReopen:0,sameD27:true,sameDeviceCustody:true,fullSupervisorRestart:true,physicalPhone:false};coldEvidence.push(evidence);progress('mixed-cold-reopened',{stage,completed,oldBackendPID:restarted.oldBackendPID,newBackendPID:restarted.newBackendPID});return evidence;
 }
 async function verifyActorAfterDrain(stage,expectedAvailable,resume){
  await uniswap.suspend();await Promise.all([api.close(),note.close(),vault.close()]);if(cold)await cold.transport.drain();
  const projected=actor.snapshot(),groups=actorModules.portfolio.walletPortfolioGroupsV1(projected.rows);
  assert.equal(projected.scope,'REGISTERED_CONNECTIONS_AND_CUSTODIES');assert.equal(projected.coverage.current,2);assert.equal(projected.coverage.total,2);assert.equal(projected.completePortfolio,true,'PAGED_MIXED_COMPLETE_PORTFOLIO_AFTER_DRAIN');
  assert.equal(groups.assets.length,2);assert.equal(groups.assets.find(asset=>asset.unit==='DEMO_UNITS').quantities.available.amount,expectedAvailable);assert.equal(groups.assets.find(asset=>asset.unit==='TOKEN_ATOMIC').quantities.available.amount,'100');
  const evidence={stage,originalReadWindowOnly:true,scope:projected.scope,registered:2,completePortfolio:true,assets:2,demoAvailable:expectedAvailable,tokenAtomicAvailable:'100',backingAddedAsBalance:false,permissionsRetained:false};actorDrainEvidence.push(evidence);
  if(resume){vault=await createDevicePagedGraphNoteVaultV3(descriptor);note=createDevicePagedOwnerApiV3({descriptor,fetchImpl});api=createDevicePagedGraphApiV3({descriptor,fetchImpl});await uniswap.reconnect();await noteStatus();await perform('OBSERVE_GRAPH',{});}
  return evidence;
 }
 async function readPortfolio(stage,expectedAvailable){
  await perform('OBSERVE_GRAPH',{});const request=await vault.graphPortfolioRequest(),view=await command('READ_PORTFOLIO',request);
  try{assert.equal(view.type,'wallet-portfolio');assert.equal(view.phase,'FULFILLED');assert.equal(view.pending,false);const outputs=view.outputs,source=outputs.find(row=>row.role==='source'),recovery=outputs.find(row=>row.role==='recovery');assert.equal(source.state,'SPENT');assert.equal(recovery.state,'LOCKED');assert.equal(outputs.filter(row=>row.role==='payout').length,4);const available=outputs.filter(row=>row.state==='LIVE').reduce((sum,row)=>sum+BigInt(row.available),0n);assert.equal(available,BigInt(expectedAvailable));const display=await vault.walletDisplay();assert.ok(display.portfolio,'PAGED_MIXED_ORIGINAL_PORTFOLIO_DISPLAY');assert.deepEqual(display.portfolio.outputs,outputs);actor.setRegisteredReadPlan(actorTasks);const pagedTask=actorTasks.find(task=>task.kind==='PAGED'),targetTask=actorTasks.find(task=>task.kind==='EXTERNAL_FLAT');actor.beginRegisteredRead(pagedTask.key);await actor.acceptPaged(display);assert.equal(actor.finishRegisteredRead(pagedTask.key,true),true);actor.beginRegisteredRead(targetTask.key);const target=await uniswap.observeTarget();actor.acceptExternal(target);assert.equal(actor.finishRegisteredRead(targetTask.key,true),true);actor.finishRegisteredReads();const projected=actor.snapshot(),groups=actorModules.portfolio.walletPortfolioGroupsV1(projected.rows);assert.equal(projected.coverage.current,2);assert.equal(projected.coverage.total,2);assert.equal(projected.scope,'REGISTERED_CONNECTIONS_AND_CUSTODIES');assert.equal(projected.completePortfolio,true,'PAGED_MIXED_COMPLETE_REGISTERED_PORTFOLIO');assert.equal(groups.assets.length,2,'PAGED_MIXED_SEPARATE_TOKEN_AND_DEMO_ASSETS');assert.equal(groups.assets.find(asset=>asset.unit==='DEMO_UNITS').quantities.available.amount,expectedAvailable);assert.equal(groups.assets.find(asset=>asset.unit==='TOKEN_ATOMIC').quantities.available.amount,'100');assert.ok(groups.assets.every(asset=>asset.underlyingValuationIncluded===false&&asset.bucketsAdditive===false));const value={stage,available:String(available),ledger:structuredClone(view.ledger),outputs:structuredClone(outputs),actor:{registered:2,demoAvailable:expectedAvailable,tokenAtomicAvailable:'100',assets:2,backingAddedAsBalance:false}};portfolioEvidence.push(value);return value;}finally{P.pagedOwnerWipeV3(view);}
 }

 try{
  const pairing=await api.pairing(),networks=pairing.nativePreparation?.networks;
  if(uniswap){
   const [{createPrivateWalletStateV1},portfolio,readPlan,registry]=await Promise.all(['actor','portfolio','readPlan','registry'].map(originalMobile));actor=createPrivateWalletStateV1();actorModules={portfolio,readPlan};
   const transport=(cold?cold.backend.data().uniswap:product.uniswap).targetConnection.transport;
   const packets=[{format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport},{format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',pairing:uniswap.targetDescriptor,transport}];
   const entries=packets.map(packet=>registry.normalizePublicWalletConnectionV1(JSON.stringify(packet),host.devicePublicKey)).map(entry=>({id:createHash('sha256').update(entry.profile).digest('hex'),profile:entry.profile}));actorTasks=readPlan.walletConnectionReadTasksV1(entries,host.devicePublicKey);
  }

  assert.ok(Array.isArray(networks)&&networks.length===3);assert.deepEqual(new Set(networks.map(network=>network.family)),new Set(['EVM','BTC','SOL']));
  const initial=await noteStatus(),prepared=await vault.prepareDeposit(initial,'600');
  const depositStart=performance.now(),consent=await note.challenge(prepared.draft),signature=await key.signDevicePagedOwnerPermissionV3(consent,descriptor.origin,descriptor.pairingId);
  await vault.latch(consent);let deposited;
  try{deposited=await note.submit(consent,signature,prepared.witness);await vault.acceptRow(deposited);}finally{P.pagedOwnerWipeV3(prepared.witness);}
  assert.equal(deposited.stage,'PROVED');retainProof({...deposited,mode:'deposit'},'D26',Math.round(performance.now()-depositStart));
  if(cold)await restartMixed('before-source-funding');
  const fundConsent=await note.challenge(await vault.effectDraft('FUND_D26',deposited.jobId)),fundSignature=await key.signDevicePagedOwnerPermissionV3(fundConsent,descriptor.origin,descriptor.pairingId);
  await vault.latch(fundConsent);await vault.acceptRow(await note.submit(fundConsent,fundSignature));
  const source=await noteStatus();assert.equal(source.note.state,'LIVE');assert.equal(source.note.available,'600');progress('source-funded');
  const timestamp=BigInt((await runtime.block()).timestamp),cutoff=(uniswap&&BigInt(uniswap.intent.validUntil)>timestamp+7200n?BigInt(uniswap.intent.validUntil):timestamp+7200n).toString(),budget=uniswap?'400':'300';
  const seed=await vault.prepareGraph(source,{budget,fundingNotBefore:timestamp.toString(),fundingValidUntil:(timestamp+3600n).toString(),settleBefore:cutoff});
  try{await perform('BEGIN_GRAPH',seed.command);}finally{P.pagedOwnerWipeV3(seed.command);}
  const nodes=['EVM','BTC','SOL'].map((family,index)=>{
   const network=networks.find(row=>row.family===family);assert.ok(network.destinations?.length);
   return {id:['ethereum-payment','bitcoin-payment','solana-payment'][index],dependsOn:index?[['ethereum-payment','bitcoin-payment'][index-1]]:[],chainDomain:network.chainDomain,evidencePolicy:network.evidencePolicy,
    amount:'100',intent:{family,recipient:network.destinations[0].address,amount:family==='EVM'?'1000000000000000':family==='BTC'?'100000':'1000000'}};
  });
  if(uniswap){nodes[0].dependsOn=['uniswap-swap'];nodes.unshift({id:'uniswap-swap',dependsOn:[],chainDomain:uniswap.configuration.chainDomain,evidencePolicy:uniswap.configuration.evidencePolicy,amount:'100',intent:uniswap.intent});}
  const page=await vault.prepareGraphPage(nodes);assert.equal(page.nodes.length,uniswap?4:3);
  assert.ok(!JSON.stringify(page).includes('receiptSecret')&&!JSON.stringify(page).includes('privateKey'));
  const nativeRequest=await vault.graphNativePreparationCommand();try{await perform('PREPARE_NATIVE_PAGE',nativeRequest);}finally{P.pagedOwnerWipeV3(nativeRequest);}
  const actions=await vault.graphNativeActions();let appended;
  try{appended=await vault.completeGraphPage(actions);await perform('APPEND_PAGE',appended.command);}finally{P.pagedOwnerWipeV3(actions);P.pagedOwnerWipeV3(appended?.command);}
  await perform('SEAL_GRAPH',{});
  for(let index=0;index<3&&(await vault.graphSummary()).phase==='SIGNING';index++){
   const plan=await vault.graphSignaturePlan(),signatureCommand=await vault.graphSignatureCommand(plan.pageIndex,plan.finish);
   try{await perform('SIGN_GRAPH',signatureCommand);}finally{P.pagedOwnerWipeV3(signatureCommand);}
  }
  assert.equal(status.phase,'PREPARED');assert.equal(status.pages,'1');assert.equal(status.nodes,uniswap?'4':'3');assert.equal(status.budget,budget);progress('graph-authorized');
  let outcome;
  for(let poll=0;poll<61;poll++){
   outcome=await runDevicePagedOperationV3({command,isUnconfirmedReply:error=>api.isUnconfirmedReply(error),onProgress(value){progress('operation-progress',{stage:value.stage,completed:value.completed,total:value.total});},maxCommands:80});
   if(outcome.type!=='pending')break;
   assert.ok(['send-native','await-native-finality','await-chain-time'].includes(outcome.stage),'PAGED_THREE_NETWORK_UNEXPECTED_PENDING');
   assert.ok(poll<60,'PAGED_THREE_NETWORK_FINALITY_WAIT_BOUND');await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(outcome.type,'complete');assert.equal(outcome.phase,'FULFILLED');assert.equal(status.phase,'FULFILLED');
  assert.equal(native.size,uniswap?4:3);let defiAcceptance=null;if(uniswap){const received=await uniswap.observeTarget(),job=received.jobs.find(row=>row.jobId===uniswap.originalD27.jobId);assert.ok(job&&job.stage==='CONFIRMED','PAGED_MIXED_ORIGINAL_OUTPUT_UNCONFIRMED');assert.equal(job.consentFields.statement.output,uniswap.intent.outputCommitment);assert.equal(job.consentFields.statement.amount,uniswap.intent.outputAmount);assert.ok(job.observation&&job.observation.status==='CONFIRMED');defiAcceptance={protocol:'UNISWAP_V3_EXACT_OUTPUT_SINGLE',outputAmount:uniswap.intent.outputAmount,outputCommitment:uniswap.intent.outputCommitment,originalD27:uniswap.originalD27,receiptTransactionHash:job.observation.transactionHash,custodyCopy:uniswap.custodyCopy,outputCustodyOnDeviceSoftware:true};}
  assert.equal(await d.call('pool','graphOutcomes(bytes32)',[hex(status.authorizationRoot)]),word(2));
  progress('operation-fulfilled');
  if(uniswap){const beforeChange=await readPortfolio('before-change','600');assert.equal(beforeChange.outputs.find(row=>row.role==='change').available,'200');assert.ok(beforeChange.outputs.filter(row=>row.role==='payout').every(row=>row.state==='LIVE'&&row.available==='100'));await verifyActorAfterDrain('before-change','600',true);}
  const outputs=await vault.graphWithdrawalOptions(),change=outputs.find(output=>output.role==='change'&&!output.withdrawn);assert.ok(change&&BigInt(change.amount)>0n,'PAGED_THREE_NETWORK_POSITIVE_CHANGE');assert.equal(change.amount,uniswap?'200':'300');
  const recipient=runtime.accounts[1],before=await runtime.balance(recipient);await perform('READ_OUTPUT',{role:'change',id:null,recipient});
  assert.equal(last.type,'output-withdrawal-request');const nullifier=last.nullifier,withdrawnAmount=last.opening.value;
  const withdrawal=await vault.graphOutputCommand();try{await perform('PROVE_OUTPUT_W39',withdrawal);}finally{P.pagedOwnerWipeV3(withdrawal);}
  // The original dispatcher chooses WITHDRAW_OUTPUT_W39 and its exact pending
  // proof. No driver-provided health or manual calldata is accepted.
  const next=await command('NEXT_COMMAND',{});try{assert.equal(next.action,'WITHDRAW_OUTPUT_W39');await perform(next.action,next.command);}finally{P.pagedOwnerWipeV3(next);}
  assert.equal(await d.call('pool','spentNullifiers(bytes32)',[hex(nullifier)]),word(1));assert.equal(await runtime.balance(recipient)-before,BigInt(withdrawnAmount));
  assert.equal(proofs.size,uniswap?16:PAGED_THREE_NETWORK_OPERATION_PLAN_V3.proofBudget,'PAGED_THREE_NETWORK_ORIGINAL_PROOF_COUNT');progress('change-withdrawn');
  let payoutSettlement=null,economicSettlement=null;
  if(uniswap){const afterChange=await readPortfolio('after-change','400');assert.equal(afterChange.outputs.find(row=>row.role==='change').state,'SPENT');}
  if(uniswap){
   // Optional mixed-only phase. Payout openings/PC23 keys still belong to the
   // OWNER Vault. Original SDK W39, not a solver claim, pays the provider EOA.
   await perform('OBSERVE_GRAPH',{});const originalOutputs=await vault.graphWithdrawalOptions(),payouts=originalOutputs.filter(output=>output.role==='payout');assert.equal(payouts.length,4);assert.equal(payouts.reduce((sum,row)=>sum+BigInt(row.amount),0n),400n);
   // The financial HOST uses the exact app's managed session, encrypted SDK
   // read and original Vault review. Only the physical Expo ports are software;
   // no backend DATA getter or caller-created payout plan grants authority.
   const session=managedSession=await originalMobile('session'),controller=new AbortController();
   let originalReview=null,authorization=null,prepared=null,currentLeaf=null;
   await session.openWalletSessionV1(controller.signal);
   const readSettlementState=async()=>{
    const request=await vault.graphEconomicRequest();let originalStatus;
    const privateReply=await command('READ_ECONOMIC_SETTLEMENT',request,{signal:controller.signal,onReply:async raw=>{
     originalReview=await vault.graphEconomicReview(raw);originalStatus=raw.status;
     const job=raw.status.job;if(authorization&&job?.mode==='withdraw'&&job.stage==='PROVED'){
      const nf=P.devicePagedWordsHexV3(job.publicInputs,25),row=originalReview.plan.payouts.find(value=>value.nullifier===nf);assert.ok(row,'PAGED_MIXED_ORIGINAL_PAYOUT_PROOF_SCOPE');
      currentLeaf=session.walletSessionPagedSettlementLeafV3(authorization,row.id);session.bindWalletSessionPagedWithdrawalProofV1(currentLeaf,raw);
     }
    }});P.pagedOwnerWipeV3(privateReply);assert.ok(originalReview&&originalReview.eligible&&originalReview.changeConfirmed,'PAGED_MIXED_ORIGINAL_ECONOMIC_REVIEW');return{status:originalStatus,ledger:originalReview.view.ledger};
   };
   await perform('OBSERVE_GRAPH',{});await readSettlementState();const firstReview=originalReview,economic=firstReview.view.rows,beneficiary=economic[0].beneficiary,plan=firstReview.plan;
   assert.equal(plan.depositAmount,'600');assert.equal(plan.changeAmount,'200');assert.equal(plan.payouts.length,4);assert.equal(plan.beneficiary,beneficiary.address);assert.notEqual(beneficiary.address,recipient);assert.notEqual(beneficiary.address,runtime.accounts[0]);assert.notEqual(beneficiary.address,system.pool);
   const settlementCommand=async(action,body)=>{
    assert.ok(authorization,'PAGED_MIXED_ORIGINAL_SETTLEMENT_APPROVAL');
    if(action==='READ_OUTPUT'){
     currentLeaf=session.walletSessionPagedSettlementLeafV3(authorization,body.id);
     return command(action,body,{signal:controller.signal,onReply:async raw=>{prepared=await vault.graphOutputCommand();session.bindWalletSessionPagedWithdrawalV1(currentLeaf,raw,prepared);}});
    }
    if(['PROVE_OUTPUT_W39','WITHDRAW_OUTPUT_W39'].includes(action)){
     assert.ok(currentLeaf);return command(action,body,{signal:controller.signal,authorization:currentLeaf,onReply:action==='PROVE_OUTPUT_W39'?raw=>session.bindWalletSessionPagedWithdrawalProofV1(currentLeaf,raw):undefined});
    }
    assert.equal(action,'NEXT_COMMAND');return command(action,body,{signal:controller.signal});
   };
   try{
    payoutSettlement=await runDevicePagedPayoutSettlementV3({plan,signal:controller.signal,command:settlementCommand,readState:async()=>{const observed=await readSettlementState();assert.deepEqual(originalReview.plan,plan);assert.equal(originalReview.rootId,firstReview.rootId);assert.equal(originalReview.revision,firstReview.revision);assert.equal(originalReview.providerIdentity,firstReview.providerIdentity);assert.equal(originalReview.signerIdentity,firstReview.signerIdentity);return observed;},readOutputs:async()=>{const values=await vault.graphWithdrawalOptions();return values.map(({role,id,amount,nullifier,withdrawn})=>({role,id,amount,nullifier,withdrawn}));},async prepareWithdrawal(){assert.ok(prepared);const value=prepared;prepared=null;return value;},async approve(review){assert.deepEqual(review,plan);assert.deepEqual(originalReview.plan,plan);authorization=await session.approveWalletSessionPagedSettlementV3(originalReview,controller.signal);progress('owner-payout-plan-approved',{payouts:review.payouts.length,originalManagedSession:true,softwareBiometric:true});},onProgress(value){progress('owner-payout-confirmed',{completed:value.completed,total:value.total});}});
   }finally{P.pagedOwnerWipeV3(prepared);if(authorization)session.closeWalletSessionPagedSettlementV3(authorization);controller.abort();}
   assert.equal(payoutSettlement.payoutAmount,'400');assert.equal(payoutSettlement.collectedThisRun,'400');assert.equal(payoutSettlement.completed,'4');assert.equal(payoutSettlement.solverAutonomousClaim,false);assert.equal(payoutSettlement.after.backedAmount,'0');assert.equal(BigInt(payoutSettlement.before.heldAmount)-BigInt(payoutSettlement.after.heldAmount),400n);assert.equal(BigInt(payoutSettlement.after.beneficiaryBalance)-BigInt(payoutSettlement.before.beneficiaryBalance),400n);assert.equal(BigInt(payoutSettlement.depositAmount),BigInt(payoutSettlement.changeAmount)+BigInt(payoutSettlement.payoutAmount));assert.equal(proofs.size,20,'PAGED_MIXED_ORIGINAL_BASE_PLUS_PAYOUT_PROOFS');
   const feeGroups=new Map();for(const row of economic){const fee=row.native.fee;if(fee.status!=='OBSERVED'){assert.equal(fee.amount,null);continue;}assert.match(fee.amount,/^(0|[1-9][0-9]*)$/);const key=JSON.stringify([row.native.genesis,fee.asset,fee.unit]),previous=feeGroups.get(key);feeGroups.set(key,{genesis:row.native.genesis,asset:fee.asset,unit:fee.unit,amount:String(BigInt(previous?.amount??'0')+BigInt(fee.amount)),deliveries:(previous?.deliveries??0)+1});}
   economicSettlement={profile:'ORIGINAL_PAGED_MIXED_OWNER_ECONOMIC_SETTLEMENT_V3',ownerCustody:true,solverAutonomousClaim:false,originalProviderIdentity:economic[0].providerIdentity,beneficiary,depositAmount:'600',changeWithdrawnAmount:'200',providerPayoutAmount:'400',nativeCosts:economic.map(row=>({id:row.id,actionCommitment:row.actionCommitment,signerIdentity:row.signerIdentity,payoutCommitment:row.payoutCommitment,payoutAmount:row.payoutAmount,native:row.native,checkpoint:row.checkpoint})),nativeFeeTotals:[...feeGroups.values()],feeCoverage:{observed:economic.filter(row=>row.native.fee.status==='OBSERVED').length,unknown:economic.filter(row=>row.native.fee.status!=='OBSERVED').length,total:economic.length},crossAssetRatesApplied:false,netSolverProfitEstablished:false,payoutSettlement};progress('owner-payouts-settled',{payouts:4,pagedProofs:20,totalProofsIncludingD27:21});
  }
  if(uniswap){const settled=await readPortfolio('after-owner-payouts','0');assert.equal(settled.ledger.heldAmount,'0');assert.equal(settled.ledger.backedAmount,'0');assert.ok(settled.outputs.filter(row=>['change','payout'].includes(row.role)).every(row=>row.state==='SPENT'));if(cold){await restartMixed('after-owner-payouts','4');const restored=await readPortfolio('after-settlement-reopen','0');assert.deepEqual(restored.ledger,settled.ledger,'PAGED_MIXED_REOPEN_SAME_LEDGER');assert.deepEqual(restored.outputs,settled.outputs,'PAGED_MIXED_REOPEN_SAME_NULLIFIERS');const received=await uniswap.observeTarget();assert.equal(received.jobs.find(row=>row.jobId===uniswap.originalD27.jobId).stage,'CONFIRMED');assert.equal(coldEvidence.length,4);assert.equal(lostReplyInjected,true,'PAGED_MIXED_ORIGINAL_LOST_REPLY_EXERCISED');}}
  if(uniswap)actorAfterDrain=await verifyActorAfterDrain('after-settlement','0',false);
  if(continuity)assert.ok(reopened&&continuityEvidence,'PAGED_THREE_NETWORK_CONTINUITY_NOT_EXERCISED');
  return Object.freeze({...PAGED_THREE_NETWORK_OPERATION_PLAN_V3,...(uniswap?{profile:'ORIGINAL_PAGED_MIXED_UNISWAP_THREE_NETWORK_OPERATION_V3',nodes:4,proofBudget:21,pagedProofBudget:20,defiDeliveries:1,defiAcceptance,economicSettlement,portfolioEvidence,actorAfterDrain,actorDrainEvidence,...(cold?{profile:'ORIGINAL_PAGED_MIXED_UNISWAP_THREE_NETWORK_COLD_OPERATION_V3',coldContinuity:coldEvidence,lostReply:{action:'EXECUTE_NATIVE',id:'ethereum-payment',discardedAfterOriginalBackendReply:true,recoveredByOriginalSdkObservation:true,automaticResend:false}}:{})}:{}),...(continuity?{profile:'ORIGINAL_PAGED_THREE_NETWORK_CONTINUITY_V3',continuity:continuityEvidence}:{}),classification:'LOCAL_SYNTHETIC_COMMON_OPERATOR_ORIGINAL_MOBILE_SOFTWARE_CUSTODY',manifestSHA256:system.manifestSHA256,consumerSHA256:system.consumerSHA256,authorizationRoot:status.authorizationRoot,reserveNullifier:status.reserveNullifier,
   proofs:[...proofs.values()],nativeDeliveries:uniswap?native.size-1:native.size,terminalClosures:1,withdrawals:uniswap?5:1,commands,oldRawAdopted:false,closed:true});
 }finally{
  managedSession?.lockWalletSessionV1();
  P.pagedOwnerWipeV3(last);const drained=await Promise.allSettled([api.close(),note.close(),vault.close()]);assert.ok(drained.every(result=>result.status==='fulfilled'),'PAGED_THREE_NETWORK_MOBILE_CUSTODY_DRAIN');
 }
}
