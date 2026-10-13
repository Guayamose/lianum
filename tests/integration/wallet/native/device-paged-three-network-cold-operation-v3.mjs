/** One actual Paged operation through the same encrypted SDK and runner as the
 * mobile app. The Expo hardware ports are the explicit Node software oracle.
 * Native ledgers, proofs, keys, deployed consumers and receipts stay original.
 * This source alone establishes neither acceptance nor a device/public run. */
import assert from 'node:assert/strict';
import {realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {assertOriginalPagedBackendProcessV3} from './device-paged-backend-client-v3.mjs';
import {assertOriginalPagedMobileHostV3} from './device-paged-mobile-host-v3.mjs';
import {request as httpsRequest} from 'node:https';
import {createHash,X509Certificate} from 'node:crypto';

export const PAGED_THREE_NETWORK_OPERATION_PLAN_V3=Object.freeze({
 profile:'ORIGINAL_PAGED_THREE_NETWORK_MOBILE_OPERATION_V3',
 pages:1,nodes:3,nativeDeliveries:3,proofBudget:13,terminalClosures:1,withdrawals:1,
 softwareCustody:true,localSynthetic:true,publicNetwork:false,phone:false,independentOperators:false,
});
const project=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
assert.equal(fileURLToPath(import.meta.url),join(project,'tests/integration/wallet/native/device-paged-three-network-cold-operation-v3.mjs'),'PAGED_THREE_NETWORK_CANONICAL_NAMESPACE');
const sources=Object.freeze({owner:'api/device-paged-owner-api-v3.mjs',graph:'api/device-paged-graph-api-v3.mjs',vault:'custody/device-paged-note-vault-v3.ts',key:'custody/key-store.ts',runner:'api/device-paged-operation-runner-v3.mjs'});
const hex=value=>'0x'+value,word=value=>'0x'+BigInt(value).toString(16).padStart(64,'0');
async function originalMobile(role){
 assert.ok(Object.hasOwn(sources,role));const path=join(project,'apps/mobile/src',sources[role]);
 assert.equal(await realpath(path),path,'PAGED_THREE_NETWORK_ORIGINAL_MOBILE_SOURCE');return import(pathToFileURL(path).href);
}

export async function runOriginalPagedThreeNetworkColdOperationV3(backend,host,tls){
 assert.equal(arguments.length,3);assertOriginalPagedBackendProcessV3(backend);assertOriginalPagedMobileHostV3(host);
 P.pagedOwnerExactV3(tls,['cert','key']);const descriptor=backend.descriptor;
 // Read-only private IPC observations never confer an original runtime/proof
 // brand. Every economic command below still uses the actual original TLS SDK.
 const data=backend.data(),runtime={accounts:data.receiverAccounts,block:()=>backend.query('block'),balance:async address=>BigInt(await backend.query('balance',[address]))};
 const system={manifestSHA256:descriptor.manifestSHA256,consumerSHA256:descriptor.consumerSHA256};
 const d={call(kind,method,args){assert.equal(kind,'pool');assert.ok(args.length===1&&['graphOutcomes(bytes32)','spentNullifiers(bytes32)'].includes(method));return backend.query(method==='graphOutcomes(bytes32)'?'graph-outcome':'spent-nullifier',args);}};
 const certificate=new X509Certificate(tls.cert),pin=createHash('sha256').update(certificate.raw).digest('hex'),sockets=new Set(),activeFetches=new Set();
 const fetchFixed=(url,init)=>{const target=new URL(url);assert.equal(target.origin,descriptor.origin);assert.ok(['/v1/mobile/paged-owner/challenges','/v1/mobile/paged-owner/operations','/v1/mobile/paged-owner/graph/pairing','/v1/mobile/paged-owner/graph/challenges','/v1/mobile/paged-owner/graph/operations'].includes(target.pathname));assert.equal(init.method,'POST');assert.equal(init.headers['Content-Type'],'application/json');assert.ok(Buffer.byteLength(init.body)<=4*1024*1024);
  const task=new Promise((resolveFetch,reject)=>{let verified=false;const req=httpsRequest(target,{family:4,ca:tls.cert,agent:false,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',method:'POST',headers:{...init.headers,'Content-Length':Buffer.byteLength(init.body)},signal:init.signal},res=>{let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024)res.destroy(Error('PAGED_COLD_REPLY_BOUND'));chunks.push(chunk);});res.once('error',error=>{chunks.forEach(b=>b.fill(0));reject(error);});res.once('aborted',()=>{chunks.forEach(b=>b.fill(0));reject(Error('PAGED_COLD_REPLY_ABORTED'));});res.once('end',()=>{let body;try{assert.ok(verified,'PAGED_COLD_TLS_VERIFIED');body=Buffer.concat(chunks);resolveFetch(new Response(Uint8Array.from(body),{status:res.statusCode,headers:res.headers}));}catch(error){reject(error);}finally{body?.fill(0);chunks.forEach(b=>b.fill(0));}});});req.once('error',reject);req.on('socket',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.once('secureConnect',()=>{try{assert.equal(socket.getProtocol(),'TLSv1.3');assert.equal(createHash('sha256').update(socket.getPeerCertificate().raw).digest('hex'),pin);verified=true;}catch(error){req.destroy(error);}});});req.end(init.body);});activeFetches.add(task);task.finally(()=>activeFetches.delete(task)).catch(()=>{});return task;
 };
 // The host has already installed its explicit software Expo oracle. Every
 // source below is the canonical mobile body, including its protected PoP.
 const [{createDevicePagedOwnerApiV3},{createDevicePagedGraphApiV3},{createDevicePagedGraphNoteVaultV3},key,{runDevicePagedOperationV3}]=await Promise.all(['owner','graph','vault','key','runner'].map(originalMobile));
 assert.equal(await key.readDevicePublicKey(),descriptor.devicePublicKey);assert.equal(host.devicePublicKey,descriptor.devicePublicKey);
 const proofs=new Map(),native=new Map(),commands=[];let status,last=null,reopened=false,continuityEvidence=null;
 const progress=(stage,extra={})=>process.stdout.write(JSON.stringify({profile:'PAGED_THREE_NETWORK_STEP',stage,...extra})+'\n');
 // Preserve the exact TLS port and response bytes. Only public status clock
 // numbers are retained, so a clock failure can be diagnosed without exporting
 // a command, ciphertext, permission, note opening or witness.
 const fetchImpl=async(url,init)=>{
  const response=await fetchFixed(url,init),readText=response.text.bind(response);
  Object.defineProperty(response,'text',{value:async()=>{
   const body=await readText(),receivedAt=Date.now();let frame;
   try{frame=JSON.parse(body);}catch{return body;}
   const clock=frame?.status;
   if(Number.isSafeInteger(clock?.issuedAt)&&Number.isSafeInteger(clock?.expiresAt)&&Number.isSafeInteger(clock?.descriptor?.deadlineMs))
    progress('status-clock',{issuedAt:clock.issuedAt,expiresAt:clock.expiresAt,deadlineMs:clock.descriptor.deadlineMs,receivedAt,ageMs:receivedAt-clock.issuedAt});
   return body;
  }});return response;
 };
 const vault=await createDevicePagedGraphNoteVaultV3(descriptor),note=createDevicePagedOwnerApiV3({descriptor,fetchImpl}),api=createDevicePagedGraphApiV3({descriptor,fetchImpl});
 function retainProof(job,action,elapsedMs){
  if(!job?.proofSHA256||proofs.has(job.jobId))return;
  assert.match(job.proofSHA256,/^[0-9a-f]{64}$/);proofs.set(job.jobId,{mode:job.mode,sha256:job.proofSHA256,action,elapsedMs});
  progress('proof-complete',{count:proofs.size,mode:job.mode,elapsedMs});
 }
 async function noteStatus(){
  const consent=await note.challenge(await vault.readDraft()),signature=await key.signDevicePagedOwnerPermissionV3(consent,descriptor.origin,descriptor.pairingId);
  const result=await note.submit(consent,signature);await vault.acceptStatus(result);return result;
 }
 async function command(action,body){
  const request=await vault.graphCommand(action,body),started=performance.now();let reply,result;progress('command-start',{action});
  try{
   const consent=await api.challenge(action,request.graphId,request.jobId,request.rootId,request.revision,request.command),signature=await key.signDevicePagedGraphPermissionV3(consent,descriptor.origin,descriptor.pairingId);
   await vault.latchGraph(consent);reply=await api.submit(consent,signature,request.command);await vault.acceptGraphReply(reply);
   status=reply.status;const elapsedMs=Math.round(performance.now()-started);commands.push({action,elapsedMs});retainProof(status.job,action,elapsedMs);
   P.pagedOwnerWipeV3(last);last=structuredClone(reply.private);
   if(action==='EXECUTE_NATIVE'&&reply.private.delivery?.nativeId){
    const delivery=reply.private.delivery,prior=native.get(delivery.id);if(prior)assert.equal(prior.nativeId,delivery.nativeId,'PAGED_THREE_NETWORK_NO_RESEND');
    else{assert.ok(![...native.values()].some(row=>row.nativeId===delivery.nativeId));native.set(delivery.id,{id:delivery.id,nativeId:delivery.nativeId});progress('native-delivery',{count:native.size,status:delivery.status});}
   }
   // The runner owns this private copy and wipes it after consuming it. The
   // actual vault has already retained its authenticated original SDK reply.
   result=structuredClone(reply.private);P.pagedOwnerWipeV3(reply.private);progress('command-complete',{action,elapsedMs});
   if(!reopened&&action==='NEXT_COMMAND'&&result.completed==='1'){
    reopened=true;assert.equal(native.size,1);const beforeProofs=proofs.size,beforeNative=[...native.values()],beforePublic=structuredClone(status);
    assert.equal(activeFetches.size,0,'PAGED_COLD_REQUESTS_DRAINED');const restored=await backend.restart();
    assert.equal(proofs.size,beforeProofs);assert.deepEqual([...native.values()],beforeNative);
    continuityEvidence={profile:'ORIGINAL_PAGED_NEW_BACKEND_PROCESS_CONTINUITY_V3',completedBeforeReopen:1,...restored,proofsRepeatedDuringReopen:0,nativeSendsDuringReopen:0,fullSupervisorRestart:true,physicalPhone:false};
    progress('cold-backend-reopened',{completed:1,oldBackendPID:restored.oldBackendPID,newBackendPID:restored.newBackendPID});
    P.pagedOwnerWipeV3(result);result=null;await perform('OBSERVE_GRAPH',{});
    assert.equal(status.authorizationRoot,beforePublic.authorizationRoot);assert.equal(status.reserveNullifier,beforePublic.reserveNullifier);assert.equal(status.progressCommitment,beforePublic.progressCommitment);
    return command('NEXT_COMMAND',{});
   }
   const returned=result;result=null;return returned;
  }finally{P.pagedOwnerWipeV3(result);P.pagedOwnerWipeV3(reply?.private);P.pagedOwnerWipeV3(request.command);}
 }
 async function perform(action,body){const reply=await command(action,body);P.pagedOwnerWipeV3(reply);}
 try{
  const pairing=await api.pairing(),networks=pairing.nativePreparation?.networks;
  assert.ok(Array.isArray(networks)&&networks.length===3);assert.deepEqual(new Set(networks.map(network=>network.family)),new Set(['EVM','BTC','SOL']));
  const initial=await noteStatus(),prepared=await vault.prepareDeposit(initial,'600');
  const depositStart=performance.now(),consent=await note.challenge(prepared.draft),signature=await key.signDevicePagedOwnerPermissionV3(consent,descriptor.origin,descriptor.pairingId);
  await vault.latch(consent);let deposited;
  try{deposited=await note.submit(consent,signature,prepared.witness);await vault.acceptRow(deposited);}finally{P.pagedOwnerWipeV3(prepared.witness);}
  assert.equal(deposited.stage,'PROVED');retainProof({...deposited,mode:'deposit'},'D26',Math.round(performance.now()-depositStart));
  const fundConsent=await note.challenge(await vault.effectDraft('FUND_D26',deposited.jobId)),fundSignature=await key.signDevicePagedOwnerPermissionV3(fundConsent,descriptor.origin,descriptor.pairingId);
  await vault.latch(fundConsent);await vault.acceptRow(await note.submit(fundConsent,fundSignature));
  const source=await noteStatus();assert.equal(source.note.state,'LIVE');assert.equal(source.note.available,'600');progress('source-funded');
  const timestamp=BigInt((await runtime.block()).timestamp),cutoff=(timestamp+7200n).toString();
  const seed=await vault.prepareGraph(source,{budget:'300',fundingNotBefore:timestamp.toString(),fundingValidUntil:(timestamp+3600n).toString(),settleBefore:cutoff});
  try{await perform('BEGIN_GRAPH',seed.command);}finally{P.pagedOwnerWipeV3(seed.command);}
  const nodes=['EVM','BTC','SOL'].map((family,index)=>{
   const network=networks.find(row=>row.family===family);assert.ok(network.destinations?.length);
   return {id:['ethereum-payment','bitcoin-payment','solana-payment'][index],dependsOn:index?[['ethereum-payment','bitcoin-payment'][index-1]]:[],chainDomain:network.chainDomain,evidencePolicy:network.evidencePolicy,
    amount:'100',intent:{family,recipient:network.destinations[0].address,amount:family==='EVM'?'1000000000000000':family==='BTC'?'100000':'1000000'}};
  });
  const page=await vault.prepareGraphPage(nodes);assert.equal(page.nodes.length,3);
  assert.ok(!JSON.stringify(page).includes('receiptSecret')&&!JSON.stringify(page).includes('privateKey'));
  const nativeRequest=await vault.graphNativePreparationCommand();try{await perform('PREPARE_NATIVE_PAGE',nativeRequest);}finally{P.pagedOwnerWipeV3(nativeRequest);}
  const actions=await vault.graphNativeActions();let appended;
  try{appended=await vault.completeGraphPage(actions);await perform('APPEND_PAGE',appended.command);}finally{P.pagedOwnerWipeV3(actions);P.pagedOwnerWipeV3(appended?.command);}
  await perform('SEAL_GRAPH',{});
  for(let index=0;index<3&&(await vault.graphSummary()).phase==='SIGNING';index++){
   const plan=await vault.graphSignaturePlan(),signatureCommand=await vault.graphSignatureCommand(plan.pageIndex,plan.finish);
   try{await perform('SIGN_GRAPH',signatureCommand);}finally{P.pagedOwnerWipeV3(signatureCommand);}
  }
  assert.equal(status.phase,'PREPARED');assert.equal(status.pages,'1');assert.equal(status.nodes,'3');assert.equal(status.budget,'300');progress('graph-authorized');
  let outcome;
  for(let poll=0;poll<61;poll++){
   outcome=await runDevicePagedOperationV3({command,onProgress(value){progress('operation-progress',{stage:value.stage,completed:value.completed,total:value.total});},maxCommands:80});
   if(outcome.type!=='pending')break;
   assert.ok(['send-native','await-native-finality','await-chain-time'].includes(outcome.stage),'PAGED_THREE_NETWORK_UNEXPECTED_PENDING');
   assert.ok(poll<60,'PAGED_THREE_NETWORK_FINALITY_WAIT_BOUND');await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(outcome.type,'complete');assert.equal(outcome.phase,'FULFILLED');assert.equal(status.phase,'FULFILLED');
  assert.equal(native.size,3);assert.equal(await d.call('pool','graphOutcomes(bytes32)',[hex(status.authorizationRoot)]),word(2));
  progress('operation-fulfilled');
  const outputs=await vault.graphWithdrawalOptions(),change=outputs.find(output=>output.role==='change'&&!output.withdrawn);assert.ok(change&&BigInt(change.amount)>0n,'PAGED_THREE_NETWORK_POSITIVE_CHANGE');assert.equal(change.amount,'300');
  const recipient=runtime.accounts[1],before=await runtime.balance(recipient);await perform('READ_OUTPUT',{role:'change',id:null,recipient});
  assert.equal(last.type,'output-withdrawal-request');const nullifier=last.nullifier,withdrawnAmount=last.opening.value;
  const withdrawal=await vault.graphOutputCommand();try{await perform('PROVE_OUTPUT_W39',withdrawal);}finally{P.pagedOwnerWipeV3(withdrawal);}
  // The original dispatcher chooses WITHDRAW_OUTPUT_W39 and its exact pending
  // proof. No driver-provided health or manual calldata is accepted.
  const next=await command('NEXT_COMMAND',{});try{assert.equal(next.action,'WITHDRAW_OUTPUT_W39');await perform(next.action,next.command);}finally{P.pagedOwnerWipeV3(next);}
  assert.equal(await d.call('pool','spentNullifiers(bytes32)',[hex(nullifier)]),word(1));assert.equal(await runtime.balance(recipient)-before,BigInt(withdrawnAmount));
  assert.equal(proofs.size,PAGED_THREE_NETWORK_OPERATION_PLAN_V3.proofBudget,'PAGED_THREE_NETWORK_ORIGINAL_PROOF_COUNT');progress('change-withdrawn');
  // The completed ledger is larger than the midpoint checkpoint. Reopen that
  // exact final state too: no new proof, native delivery or withdrawal occurs.
  const terminalPublic=structuredClone(status),terminalProofs=proofs.size,terminalNative=[...native.values()];
  const terminalReopen=await backend.restart();await perform('OBSERVE_GRAPH',{});
  assert.equal(status.phase,'FULFILLED');assert.equal(status.authorizationRoot,terminalPublic.authorizationRoot);
  assert.equal(status.reserveNullifier,terminalPublic.reserveNullifier);assert.equal(status.progressCommitment,terminalPublic.progressCommitment);
  assert.equal(proofs.size,terminalProofs);assert.deepEqual([...native.values()],terminalNative);
  assert.equal(await d.call('pool','spentNullifiers(bytes32)',[hex(nullifier)]),word(1));
  assert.equal(await runtime.balance(recipient),before+BigInt(withdrawnAmount));
  const terminalContinuity=Object.freeze({...terminalReopen,afterChangeWithdrawal:true,proofsRepeatedDuringReopen:0,nativeSendsDuringReopen:0});
  progress('terminal-backend-reopened',{oldBackendPID:terminalReopen.oldBackendPID,newBackendPID:terminalReopen.newBackendPID});
  assert.ok(reopened&&continuityEvidence,'PAGED_THREE_NETWORK_COLD_CONTINUITY_NOT_EXERCISED');
  return Object.freeze({...PAGED_THREE_NETWORK_OPERATION_PLAN_V3,profile:'ORIGINAL_PAGED_THREE_NETWORK_COLD_CONTINUITY_V3',continuity:continuityEvidence,terminalContinuity,classification:'LOCAL_SYNTHETIC_COMMON_OPERATOR_ORIGINAL_MOBILE_SOFTWARE_CUSTODY',manifestSHA256:system.manifestSHA256,consumerSHA256:system.consumerSHA256,authorizationRoot:status.authorizationRoot,reserveNullifier:status.reserveNullifier,
   proofs:[...proofs.values()],nativeDeliveries:native.size,terminalClosures:1,withdrawals:1,commands,oldRawAdopted:false,closed:true});
 }finally{
  P.pagedOwnerWipeV3(last);const drained=await Promise.allSettled([api.close(),note.close(),vault.close()]);assert.ok(drained.every(result=>result.status==='fulfilled'),'PAGED_THREE_NETWORK_MOBILE_CUSTODY_DRAIN');await Promise.allSettled([...activeFetches]);for(const socket of sockets)socket.destroy();assert.equal(activeFetches.size,0);
 }
}
