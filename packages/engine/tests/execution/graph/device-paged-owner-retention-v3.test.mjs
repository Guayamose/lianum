/** Actual private Graph, parent client, encrypted Vault and signed IPC. Only
 * subprocess/prover ports are HOST fixtures. No SNARK, RPC or acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as Graph from '../../../src/execution/graph/funded-graph-paged-v3.mjs';
import * as Transit from '../../../src/crypto/private-proof-transit-v1.mjs';
import {freshKey,signature,nullifier} from '../../../src/notes/private-note-encoding.mjs';
import {walletNoteCommitment} from '../../../src/wallet/notes/private-wallet-note-encoding.mjs';
import {nativeTransferActionCommitment} from '../../../src/execution/native/dispatch/native-capsules.mjs';
import {nativeReceiptKeyCommitment} from '../../../src/execution/native/state/native-receipt.mjs';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';

const h=value=>createHash('sha256').update('Paged recovery HOST '+value).digest('hex');
test('encrypted checkpoints reopen the same OWNER and pending transition without recomputing a proof',async t=>{
 const proofResults=new WeakMap(),children=[];let failNext=false;
 const prover={async provePrepared(compiled,job){const original=Graph.readOriginalFundedPagedGraphProofJobV3(compiled,job);Graph.closeFundedPagedGraphProofJobV3(job);try{if(failNext){failNext=false;throw Error('PAEG_PAGED_NO_PAYLOAD_STDERR');}const result=Object.freeze({});proofResults.set(result,{mode:original.mode,inputs:original.expectedPublicInputs});return result;}finally{Transit.wipePrivateProofInputsV1(original.inputs);}},async close(){}};
 t.mock.module('@lianum/proofs/tooling/original-paged-artifacts-v3',{exports:{Graph,createFundedPagedGraphProofClientV3:()=>prover,readOriginalFundedPagedGraphProofResultV3(_client,result,mode){const original=proofResults.get(result);assert.equal(original?.mode,mode);return{proof:Buffer.from([1]),publicInputs:[...original.inputs]};}}});
 const Owner=await import('../../../../backend/src/operations/local/device-paged-private-graph-v3.mjs');
 const {createDevicePagedOwnerRetentionV3}=await import('../../../../backend/src/operations/local/device-paged-owner-retention-v3.mjs');
 const directory=await mkdtemp(join(tmpdir(),'lianum-owner-retention-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const retention={path:join(directory,'private-owner.vault'),password:h('retention-password')};
 let proved=0;
 class HostChild extends EventEmitter{
  constructor(){super();this.pid=process.pid;this.stdout=new EventEmitter();this.stderr=new EventEmitter();this.connected=true;this.exitCode=null;this.signalCode=null;this.kills=0;this.controller=null;this.recipient=null;this.scope=null;this.fault=null;this.retention=null;children.push(this);}
  send(frame,callback){callback?.(null);queueMicrotask(async()=>{try{
   if(frame.type==='birth'){this.retention=await createDevicePagedOwnerRetentionV3(frame.retention,frame.descriptor);this.controller=frame.retention.expected?await Owner.reopenOriginalDevicePagedPrivateGraphV3(frame.descriptor,this.retention.restored()):Owner.createOriginalDevicePagedPrivateGraphV3(frame.descriptor);const checkpoint=frame.retention.expected?this.retention.checkpoint():await this.commit();this.emit('message',{type:'born',checkpoint,...(frame.retention.expected?{restoredPending:Owner.readOriginalDevicePagedPrivatePendingV3(this.controller)}:{})});return;}
   if(frame.type==='prepare'){assert.equal(this.recipient,null);const mode=C.DEVICE_PAGED_GRAPH_COMMANDS_V3[frame.action],scope={relation:P.DEVICE_PAGED_MODES_V3[mode].relation,role:P.DEVICE_PAGED_MODES_V3[mode].role,jobId:frame.jobId};this.scope=scope;this.recipient=Transit.createPrivateProofRecipientV1(scope);this.emit('message',{type:'prepared',ready:Transit.readPrivateProofRecipientV1(this.recipient)});return;}
   if(frame.type==='confirm'){const pub=this.controller.confirmOriginal(frame.jobId);this.emit('message',{type:'confirmed',jobId:frame.jobId,public:pub,checkpoint:await this.commit()});return;}
   assert.equal(frame.type,'command');let opened,result;
   try{opened=Transit.openPrivateProofJobV1(this.recipient,frame.ciphertext);result=Owner.readOriginalDevicePagedPrivateGraphResultV3(this.controller,await this.controller.command(opened,frame.facts));const c=frame.consent,ready={type:'flat-private-proof-input-ready',profile:c.recipient.profile,...this.scope,recipientPublicKey:c.replyPublicKey};const ciphertext=Transit.sealPrivateProofJobV1(ready,{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,jobId:c.jobId,reply:result.privateReply},expectedPublicInputs:null,authorization:opened.authorization});if(result.proof)proved++;this.emit('message',{type:'result',jobId:c.jobId,public:result.public,proof:result.proof,effectHealth:result.effectHealth,ciphertext,checkpoint:await this.commit()});}
   finally{Transit.closePrivateProofRecipientV1(this.recipient);this.recipient=null;this.scope=null;Transit.wipePrivateProofInputsV1(opened);Transit.wipePrivateProofInputsV1(result?.privateReply);}
  }catch(error){let failure;try{failure=Owner.readOriginalDevicePagedPrivateGraphProofFailureV3(this.controller,error);assert.throws(()=>Owner.readOriginalDevicePagedPrivateGraphProofFailureV3(this.controller,error),/ORIGINAL_PROOF_FAILURE/);}catch{failure={type:'failed',code:'PAGED_GRAPH_PRIVATE_COMMAND_FAILED'};}if(this.fault==='extra')failure={...failure,unexpected:true};if(this.fault==='wrong-job')failure={...failure,jobId:'paged-job-foreign-proof'};this.emit('message',failure);}});}
  async commit(){const capsule=Owner.retainOriginalDevicePagedPrivateGraphV3(this.controller);try{return await this.retention.commit(capsule);}finally{Transit.wipePrivateProofInputsV1(capsule);}}
  kill(signal){if(!this.connected)return;this.kills++;this.connected=false;this.signalCode=signal;void Promise.resolve(this.controller?.close()).then(()=>{this.retention?.close();this.emit('close',null,signal);});}
 }
 t.mock.module('node:child_process',{exports:{spawn:()=>new HostChild()}});
 const {createOriginalDevicePagedGraphClientV3,reopenOriginalDevicePagedGraphClientV3}=await import('../../../src/execution/local/device-paged-graph-client-v3.mjs');
 const device=freshKey(),owner=freshKey(),payout=freshKey(),change=freshKey(),recovery=freshKey(),note=(key,label,value)=>({type:4,rho:h(label+'rho'),x:key.x.toString('hex'),y:key.y.toString('hex'),value,secret:h(label+'secret')});
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9443',pairingId:'host-proof-recovery-v3',devicePublicKey:'04'+device.x.toString('hex')+device.y.toString('hex'),deadlineMs:P.devicePagedNowV3()+3600000,chainId:'31337',
  ...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(key=>[key,h(key)])),...Object.fromEntries(['pool','state','native','math'].map((key,i)=>[key,'0x'+String(i+1).repeat(40)])),domain:Graph.pagedGraphHashV3('domain',['scope','policy','assetIdentity','hubDomain','registryCommitment'].map(key=>Buffer.from(h(key),'hex')))});
 const seed={operationId:h('operation'),budget:'1',fundingNotBefore:'1',fundingValidUntil:'50',settleBefore:'100',reservationNonce:h('nonce'),reserveSecret:h('reserve'),graphSalt:h('salt'),inputNote:note(owner,'input','2'),changeNote:note(change,'change','1'),recoveryNote:note(recovery,'recovery','1')};
 const source=walletNoteCommitment(descriptor.scope,descriptor.policy,seed.inputNote).toString('hex');let sourceRoot=source;for(let i=0;i<8;i++)sourceRoot=createHash('sha256').update(Buffer.concat([Buffer.from([1]),Buffer.from(sourceRoot,'hex'),Buffer.alloc(32)])).digest('hex');const facts={sourceCommitment:source,sourceNullifier:nullifier(descriptor.scope,source,seed.inputNote.secret).toString('hex'),sourcePath:{root:sourceRoot,siblings:Array(8).fill('0'.repeat(64)),index:'0'},revocationSequence:'0',timestamp:'2',nativeEvidence:h('native-evidence'),nativeReceiptRoot:Graph.pagedGraphSparseWitnessV3('admitted',[],'0').root};
 let number=0;
 async function command(client,action,body){const jobId='paged-job-host-'+(++number),ready=await client.prepare(action,jobId),replyRecipient=Transit.createPrivateProofRecipientV1({relation:ready.relation,role:ready.role,jobId});
  const pub=children.find(child=>child.controller&&child.connected&&child.recipient?.publicKey===ready.recipientPublicKey)?.controller?.summary()??children.find(child=>child.connected)?.controller.summary();
  const c=C.normalizeDevicePagedGraphConsentV3({version:3,profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,descriptor,action,graphId:'paged-graph-'+h('graph').slice(0,32),jobId,rootId:h('root'),revision:1,commandSHA256:createHash('sha256').update(JSON.stringify(body)).digest('hex'),replyPublicKey:Transit.readPrivateProofRecipientV1(replyRecipient).recipientPublicKey,challengeId:'paged-challenge-'+number,nonce:h('nonce'+number),authorizationRoot:pub.authorizationRoot,reserveNullifier:pub.reserveNullifier,progressCommitment:pub.progressCommitment,recipient:ready,expiresAt:P.devicePagedWallNowV3()+15000});
  const authorization={kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:createHash('sha256').update(C.devicePagedGraphPermissionMessageV3(c)).digest('hex'),witnessSHA256:c.commandSHA256};const packet=Transit.sealPrivateProofJobV1(ready,{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,consent:c,signature:signature(device,C.devicePagedGraphPermissionMessageV3(c)).toString('hex'),command:body},expectedPublicInputs:null,authorization});
  try{const result=await client.submit(c,packet,facts),opened=Transit.openPrivateProofJobV1(replyRecipient,result.ciphertext);try{return{result,reply:structuredClone(opened.inputs.reply)};}finally{Transit.wipePrivateProofInputsV1(opened);}}finally{Transit.closePrivateProofRecipientV1(replyRecipient);}
 }
 async function prepared(){const client=await createOriginalDevicePagedGraphClientV3(descriptor,retention);t.after(()=>client.close());await command(client,'BEGIN_GRAPH',seed);const receiptSecret=h('receipt-secret'),receiptRho=h('receipt-rho'),action={chainDomain:h('chain'),signerIdentity:h('provider'),sourceCommitment:h('native-source'),destinationCommitment:h('destination'),amount:'1',custodyKind:1,custodyCommitment:h('custody'),executionFrom:'1',executionUntil:'100',settleBefore:'100',receiptKeyCommitment:nativeReceiptKeyCommitment(descriptor.hubDomain,receiptSecret),receiptRho,deliveryRiskCommitment:h('risk'),actionSalt:h('action-salt')};await command(client,'APPEND_PAGE',{pageIndex:'0',salt:h('page'),nodes:[{id:'ethereum',chainDomain:action.chainDomain,evidencePolicy:h('evidence-policy'),actionCommitment:nativeTransferActionCommitment(action),action,localCommitment:h('local'),dispatchId:h('dispatch'),receiptRho,receiptSecret,dependsOn:[],payout:{x:payout.x.toString('hex'),y:payout.y.toString('hex'),value:'1',secret:h('payout-secret'),randomness:h('randomness')}}]});const sealed=await command(client,'SEAL_GRAPH',{});const ownerSignature=signature(owner,Buffer.from(sealed.reply.request.message,'hex')).toString('hex'),invoice=await command(client,'SIGN_GRAPH',{ownerSignature,pageIndex:'0',invoices:[],finish:false});await command(client,'SIGN_GRAPH',{ownerSignature:null,pageIndex:null,invoices:invoice.reply.requests.map(q=>({id:q.id,signature:signature(payout,Buffer.from(q.message,'hex')).toString('hex')})),finish:true});const reserve=await command(client,'PROVE_R',{});await client.confirm(reserve.result);return client;}
 let client=await prepared();const old=children.at(-1),before=old.controller.summary(),beforeProofs=proved;
 const encrypted=await readFile(retention.path,'utf8');assert.equal(encrypted.includes(seed.reserveSecret),false);assert.equal(encrypted.includes(seed.inputNote.secret),false);
 const checkpoint=client.checkpoint();assert.equal(checkpoint.public.progressCommitment,before.progressCommitment);
 const reopened=await client.restartOwner(before);assert.notEqual(children.at(-1),old);assert.equal(old.connected,false);assert.deepEqual(reopened.public,before);assert.equal(proved,beforeProofs);
 await assert.rejects(()=>client.prepare('NEXT_COMMAND','before-fresh-read'),/PROOF_OBSERVATION_REQUIRED/);
 await command(client,'OBSERVE_GRAPH',{});const plan=await command(client,'NEXT_COMMAND',{});assert.equal(plan.reply.action,'PROVE_EDGE');
 const proof=await command(client,plan.reply.action,plan.reply.command),pending=children.at(-1).controller.summary(),count=proved;
 assert.equal(client.ownerReopenRequired(),false);
 await client.prepare('OBSERVE_GRAPH','expired-unsent-observation');
 const killed=children.at(-1);const ended=new Promise(resolve=>killed.once('close',resolve));killed.kill('SIGTERM');await ended;
 assert.equal(client.ownerReopenRequired(),true,'a dead acknowledged OWNER is distinguished from an active one');
 await client.discardReady('expired-unsent-observation');
 await client.restartOwner(pending);assert.equal(proved,count,'reopen does not recompute the original proof');await command(client,'OBSERVE_GRAPH',{});
 assert.equal(client.ownerReopenRequired(),false);
 const coldCheckpoint=client.checkpoint(),oldParentClient=client;await oldParentClient.close();client=await reopenOriginalDevicePagedGraphClientV3(descriptor,retention,coldCheckpoint);t.after(()=>client.close());assert.notEqual(client,oldParentClient);assert.equal(proved,count,'a new parent client also retains the actual pending transition');await assert.rejects(client.prepare('NEXT_COMMAND','paged-before-cold-read'),/PROOF_OBSERVATION_REQUIRED/);await command(client,'OBSERVE_GRAPH',{});await assert.rejects(client.confirm(proof.result),{name:'AssertionError'});assert.equal(client.restoredPending().jobId,proof.result.jobId);await assert.rejects(client.confirmRestoredOriginal('paged-foreign-job'),/RESTORED_PENDING/);await client.confirmRestoredOriginal(proof.result.jobId);const confirmed=children.at(-1).controller.summary();assert.notEqual(confirmed.progressCommitment,pending.progressCommitment,'original retained next progress is applied once');
 await assert.rejects(client.confirmRestoredOriginal(proof.result.jobId),/RESTORED_PENDING/);assert.equal(proved,count,'cold confirmation neither reproves nor repeats the retained transition');
 const fresh=await command(client,'NEXT_COMMAND',{});assert.equal(fresh.reply.action,'EXECUTE_NATIVE');assert.equal(fresh.reply.currentNodeId,'ethereum');
 const latest=await readFile(retention.path);await writeFile(retention.path,encrypted,{mode:0o600});await assert.rejects(()=>client.restartOwner(children.at(-1).controller.summary()),/PAGED_GRAPH_PRIVATE_COMMAND_FAILED/);
 await writeFile(retention.path,latest,{mode:0o600});
 await writeFile(retention.path+'.lock','HOST stale lock',{mode:0o600});
 await assert.rejects(()=>createDevicePagedOwnerRetentionV3({...retention,expected:client.checkpoint()},descriptor),/PAGED_OWNER_CHECKPOINT_LOCKED/);
 await rm(retention.path+'.lock');
 const stolen={...retention,password:h('foreign-password'),expected:client.checkpoint()};await assert.rejects(()=>createDevicePagedOwnerRetentionV3(stolen,descriptor));
 const malformed=JSON.parse(latest.toString());malformed.ciphertext='00';await writeFile(retention.path,JSON.stringify(malformed));await assert.rejects(()=>createDevicePagedOwnerRetentionV3({...retention,expected:client.checkpoint()},descriptor));
 await writeFile(retention.path,latest,{mode:0o600});
});
