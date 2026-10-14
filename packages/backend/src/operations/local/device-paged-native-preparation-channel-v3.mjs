/** Narrow encrypted quote channel. It prepares provider terms and cannot
 * sign, send, admit, prove or accept a native transfer. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,readOriginalPrivateProofRecipientV1,closePrivateProofRecipientV1,openPrivateProofJobV1,sealPrivateProofJobV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function createDevicePagedNativePreparationChannelV3(rawDescriptor,preparePage){
 assert.equal(arguments.length,2);assert.equal(typeof preparePage,'function');const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),recipients=new Map();let closed=false;
 const live=()=>assert.ok(!closed&&P.devicePagedNowV3()<descriptor.deadlineMs,'PAGED_NATIVE_PREPARATION_CLOSED');
 return Object.freeze({
  prepare(jobId){live();assert.equal(recipients.size,0);const mode=P.DEVICE_PAGED_MODES_V3.reserve,recipient=createPrivateProofRecipientV1({relation:mode.relation,role:mode.role,jobId});recipients.set(jobId,recipient);return readPrivateProofRecipientV1(recipient);},
  discardReady(jobId){const recipient=recipients.get(jobId);assert.ok(recipient);recipients.delete(jobId);closePrivateProofRecipientV1(recipient);},
  async submit(rawConsent,signature,ciphertext,rawContext){
   live();const c=C.validateDevicePagedGraphConsentFreshV3(rawConsent);assert.equal(c.action,'PREPARE_NATIVE_PAGE');assert.deepEqual(c.descriptor,descriptor);
   const recipient=recipients.get(c.jobId);assert.ok(recipient,'PAGED_NATIVE_PREPARATION_ORIGINAL_RECIPIENT');recipients.delete(c.jobId);
   let opened,reply;
   try{
    assert.deepEqual(readPrivateProofRecipientV1(recipient),c.recipient);opened=openPrivateProofJobV1(recipient,ciphertext);
    const bound=readOriginalPrivateProofRecipientV1(opened),input=P.pagedOwnerExactV3(opened.inputs,['profile','consent','signature','command']);
    assert.equal(input.profile,C.DEVICE_PAGED_GRAPH_OWNER_V3);assert.deepEqual(input.consent,c);assert.equal(input.signature,signature);assert.equal(bound.jobId,c.jobId);assert.equal(bound.relation,c.recipient.relation);assert.equal(bound.role,c.recipient.role);assert.equal(opened.expectedPublicInputs,null);
    assert.equal(opened.authorization.kind,'ORIGINAL_CONSENT_V1');assert.equal(opened.authorization.consentSHA256,sha(C.devicePagedGraphPermissionMessageV3(c)));assert.equal(opened.authorization.witnessSHA256,c.commandSHA256);assert.equal(sha(JSON.stringify(input.command)),c.commandSHA256);
    const command=C.normalizeDevicePagedNativePageRequestV3(input.command),context=P.pagedOwnerExactV3(rawContext,['pageIndex','firstNode','settleBefore',...(Object.hasOwn(rawContext,'quoteScope')?['quoteScope']:[])]);
    assert.equal(command.preparation.pageIndex,context.pageIndex);assert.equal(command.settleBefore,context.settleBefore);P.pagedOwnerUintV3(context.firstNode,true);
    command.preparation.nodes.forEach((node,index)=>assert.equal(node.ordinal,(BigInt(context.firstNode)+BigInt(index)).toString(),'PAGED_NATIVE_PREPARATION_ORIGINAL_ORDINAL'));
    C.validateDevicePagedGraphConsentFreshV3(c);reply=P.pagedOwnerExactV3(await preparePage(command,context.quoteScope),['preparationId','actions']);live();C.validateDevicePagedGraphConsentFreshV3(c);
    assert.equal(reply.preparationId,command.preparation.preparationId);assert.ok(Array.isArray(reply.actions)&&reply.actions.length===command.preparation.nodes.length);const used=new Set();
    for(const raw of reply.actions){const item=P.pagedOwnerExactV3(raw,['id','action','localCommitment','dispatchId',...(Object.hasOwn(raw,'quote')?['quote']:[])]),node=command.preparation.nodes.find(n=>n.id===item.id);assert.ok(node&&!used.has(item.id));used.add(item.id);P.pagedOwnerHexV3(item.localCommitment);P.pagedOwnerHexV3(item.dispatchId);for(const k of ['chainDomain','receiptKeyCommitment','receiptRho'])assert.equal(item.action[k],node[k]);assert.equal(item.action.settleBefore,command.settleBefore);}
    return sealPrivateProofJobV1({...c.recipient,recipientPublicKey:c.replyPublicKey},{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,jobId:c.jobId,reply:{type:'native-page-actions',response:reply}},expectedPublicInputs:null,authorization:opened.authorization});
   }finally{closePrivateProofRecipientV1(recipient);wipePrivateProofInputsV1(opened);wipePrivateProofInputsV1(reply);}
  },
  close(){closed=true;for(const recipient of recipients.values())closePrivateProofRecipientV1(recipient);recipients.clear();}
 });
}
