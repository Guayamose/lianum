/** Fixture producer only: actual signed Original Graph + private OWNER AEAD.
 * Terminal outcome is an explicit HOST capsule fact; no prove action, RPC,
 * financial Source capability, W39 preparation or grant is performed. */
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey} from 'node:crypto';
import * as Transit from '@lianum/engine/crypto/private-proof-transit-v1';
import {freshKey,signature,nullifier} from '@lianum/engine/notes/private-note-encoding';
import {walletNoteCommitment} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {nativeTransferActionCommitment} from '@lianum/engine/execution/native/dispatch/native-capsules';
import {nativeReceiptKeyCommitment} from '@lianum/engine/execution/native/state/native-receipt';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
import * as Owner from '../../src/operations/local/device-paged-private-graph-v3.mjs';
import * as Store from '../../src/operations/local/device-paged-owner-retention-v3.mjs';
const h=value=>createHash('sha256').update('Reader selected output HOST '+value).digest('hex');
export async function createHostOriginalTerminalOwnerGraphV15({descriptor,devicePrivateJWK,rootId,revision,config,phase='FULFILLED'}){
 assert.ok(['FULFILLED','RECOVERED'].includes(phase));
 const privateKey=createPrivateKey({key:devicePrivateJWK,format:'jwk'}),device={privateKey,publicKey:createPublicKey(privateKey)},owner=freshKey(),payout=freshKey(),change=freshKey(),recovery=freshKey(),note=(key,label,value)=>({type:4,rho:h(label+'rho'),x:key.x.toString('hex'),y:key.y.toString('hex'),value,secret:h(label+'secret')});
 const controller=Owner.createOriginalDevicePagedPrivateGraphV3(descriptor),graphId='reader-selected-original-graph-v15';let writer,reader,capsule;
 try{
 const seed={operationId:h('operation'),budget:'1',fundingNotBefore:'1',fundingValidUntil:'50',settleBefore:'100',reservationNonce:h('nonce'),reserveSecret:h('reserve'),graphSalt:h('salt'),inputNote:note(owner,'input','25'),changeNote:note(change,'change','24'),recoveryNote:note(recovery,'recovery','1')};
 const source=walletNoteCommitment(descriptor.scope,descriptor.policy,seed.inputNote).toString('hex'),facts={sourceCommitment:source,sourceNullifier:nullifier(descriptor.scope,source,seed.inputNote.secret).toString('hex'),revocationSequence:'0',timestamp:'2'};let counter=0;
 async function command(action,body,extra={}){
  const jobId='owner-read-recovery-job-'+(++counter),mode=C.DEVICE_PAGED_GRAPH_COMMANDS_V3[action],recipient=Transit.createPrivateProofRecipientV1({relation:P.DEVICE_PAGED_MODES_V3[mode].relation,role:P.DEVICE_PAGED_MODES_V3[mode].role,jobId}),ready=Transit.readPrivateProofRecipientV1(recipient),pub=controller.summary();let opened;
  try{const consent=C.normalizeDevicePagedGraphConsentV3({version:3,profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,descriptor,action,graphId,jobId,rootId,revision,commandSHA256:createHash('sha256').update(JSON.stringify(body)).digest('hex'),replyPublicKey:ready.recipientPublicKey,challengeId:'owner-read-recovery-challenge-'+counter,nonce:h('nonce'+counter),authorizationRoot:pub.authorizationRoot,reserveNullifier:pub.reserveNullifier,progressCommitment:pub.progressCommitment,recipient:ready,expiresAt:Date.now()+15000}),authorization={kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:createHash('sha256').update(C.devicePagedGraphPermissionMessageV3(consent)).digest('hex'),witnessSHA256:consent.commandSHA256},packet=Transit.sealPrivateProofJobV1(ready,{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,consent,signature:signature(device,C.devicePagedGraphPermissionMessageV3(consent)).toString('hex'),command:body},expectedPublicInputs:null,authorization});opened=Transit.openPrivateProofJobV1(recipient,packet);const result=Owner.readOriginalDevicePagedPrivateGraphResultV3(controller,await controller.command(opened,{...facts,...extra}));return structuredClone(result.privateReply);}
  catch(error){const code=/^([A-Z][A-Z0-9_]{3,120})/.exec(String(error.message))?.[1]??error.code??error.name;throw Error('HOST_TERMINAL_OWNER_PHASE '+action+' '+code);}
  finally{Transit.wipePrivateProofInputsV1(opened);Transit.closePrivateProofRecipientV1(recipient);}
 }
 await command('BEGIN_GRAPH',seed);const receiptSecret=h('receipt-secret'),receiptRho=h('receipt-rho'),action={chainDomain:h('chain'),signerIdentity:h('provider'),sourceCommitment:h('native-source'),destinationCommitment:h('destination'),amount:'1',custodyKind:1,custodyCommitment:h('custody'),executionFrom:'1',executionUntil:'100',settleBefore:'100',receiptKeyCommitment:nativeReceiptKeyCommitment(descriptor.hubDomain,receiptSecret),receiptRho,deliveryRiskCommitment:h('risk'),actionSalt:h('action-salt')};
 await command('APPEND_PAGE',{pageIndex:'0',salt:h('page'),nodes:[{id:'ethereum',chainDomain:action.chainDomain,evidencePolicy:h('evidence-policy'),actionCommitment:nativeTransferActionCommitment(action),action,localCommitment:h('local'),dispatchId:h('dispatch'),receiptRho,receiptSecret,dependsOn:[],payout:{x:payout.x.toString('hex'),y:payout.y.toString('hex'),value:'1',secret:h('payout-secret'),randomness:h('randomness')}}]});
 const sealed=await command('SEAL_GRAPH',{}),ownerSignature=signature(owner,Buffer.from(sealed.request.message,'hex')).toString('hex'),invoice=await command('SIGN_GRAPH',{ownerSignature,pageIndex:'0',invoices:[],finish:false});await command('SIGN_GRAPH',{ownerSignature:null,pageIndex:null,invoices:invoice.requests.map(q=>({id:q.id,signature:signature(payout,Buffer.from(q.message,'hex')).toString('hex')})),finish:true});

  // The signed graph is actual. Only the terminal phase/chain acceptance below
  // is HOST input, matching the Root producer's retained-metadata fixture.
  capsule=Owner.retainOriginalDevicePagedPrivateGraphV3(controller);capsule.phase=phase;capsule.public.phase=phase;await controller.close();
  writer=await Store.createDevicePagedOwnerRetentionV3({...config,expected:null},descriptor);const checkpoint=await writer.commit(capsule);writer.close();writer=null;
  reader=await Store.openOriginalDevicePagedOwnerTerminalOutputTargetsV5(config,descriptor,checkpoint);
  const selected={change:await Store.readOriginalDevicePagedOwnerTerminalOutputTargetV5(reader,{role:'change',id:null})};
  if(phase==='FULFILLED')selected.payout=await Store.readOriginalDevicePagedOwnerTerminalOutputTargetV5(reader,{role:'payout',id:'ethereum'});else selected.recovery=await Store.readOriginalDevicePagedOwnerTerminalOutputTargetV5(reader,{role:'recovery',id:null});
  return {graphId,checkpoint,public:structuredClone(checkpoint.public),selected};
 }finally{if(reader)await Store.closeOriginalDevicePagedOwnerTerminalOutputTargetsV5(reader);writer?.close();await controller.close();Transit.wipePrivateProofInputsV1(capsule);}
}
