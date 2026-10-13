/** The paired owner selects one retained node over an encrypted channel.
 * This channel does not issue a ready grant: the authority rechecks original
 * dependency progress and the deployed state before signing and sending. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,readOriginalPrivateProofRecipientV1,closePrivateProofRecipientV1,openPrivateProofJobV1,sealPrivateProofJobV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
const sha=value=>createHash('sha256').update(value).digest('hex');

export function createDevicePagedNativeExecutionChannelV3(rawDescriptor,executeNode){
 assert.equal(arguments.length,2);assert.equal(typeof executeNode,'function');
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),recipients=new Map();let closed=false;
 const live=()=>assert.ok(!closed&&P.devicePagedNowV3()<descriptor.deadlineMs,'PAGED_NATIVE_EXECUTION_CLOSED');
 return Object.freeze({
  prepare(jobId){live();assert.equal(recipients.size,0);const mode=P.DEVICE_PAGED_MODES_V3.reserve,recipient=createPrivateProofRecipientV1({relation:mode.relation,role:mode.role,jobId});recipients.set(jobId,recipient);return readPrivateProofRecipientV1(recipient);},
  discardReady(jobId){const recipient=recipients.get(jobId);assert.ok(recipient);recipients.delete(jobId);closePrivateProofRecipientV1(recipient);},
  async submit(rawConsent,signature,ciphertext){
   live();const consent=C.validateDevicePagedGraphConsentFreshV3(rawConsent);assert.equal(consent.action,'EXECUTE_NATIVE');assert.deepEqual(consent.descriptor,descriptor);
   const recipient=recipients.get(consent.jobId);assert.ok(recipient,'PAGED_NATIVE_EXECUTION_ORIGINAL_RECIPIENT');recipients.delete(consent.jobId);let opened,reply;
   try{
    assert.deepEqual(readPrivateProofRecipientV1(recipient),consent.recipient);opened=openPrivateProofJobV1(recipient,ciphertext);
    const bound=readOriginalPrivateProofRecipientV1(opened),input=P.pagedOwnerExactV3(opened.inputs,['profile','consent','signature','command']);
    assert.equal(input.profile,C.DEVICE_PAGED_GRAPH_OWNER_V3);assert.deepEqual(input.consent,consent);assert.equal(input.signature,signature);assert.equal(bound.jobId,consent.jobId);assert.equal(bound.relation,consent.recipient.relation);assert.equal(bound.role,consent.recipient.role);assert.equal(opened.expectedPublicInputs,null);
    assert.equal(opened.authorization.kind,'ORIGINAL_CONSENT_V1');assert.equal(opened.authorization.consentSHA256,sha(C.devicePagedGraphPermissionMessageV3(consent)));assert.equal(opened.authorization.witnessSHA256,consent.commandSHA256);assert.equal(sha(JSON.stringify(input.command)),consent.commandSHA256);
    const command=P.pagedOwnerExactV3(input.command,['id']);assert.match(command.id,/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/);C.validateDevicePagedGraphConsentFreshV3(consent);
    reply=await executeNode(command.id,consent);live();
    // Finality observation can outlive the send permission. No new signing or
    // sending is authorized here after executeNode has returned.
    P.pagedOwnerExactV3(reply,['type','delivery','admission']);assert.equal(reply.type,'native-delivery');
    return sealPrivateProofJobV1({...consent.recipient,recipientPublicKey:consent.replyPublicKey},{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,jobId:consent.jobId,reply},expectedPublicInputs:null,authorization:opened.authorization});
   }finally{closePrivateProofRecipientV1(recipient);wipePrivateProofInputsV1(opened);wipePrivateProofInputsV1(reply);}
  },
  close(){closed=true;for(const recipient of recipients.values())closePrivateProofRecipientV1(recipient);recipients.clear();}
 });
}
