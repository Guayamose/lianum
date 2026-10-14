/** Readonly encrypted handoff from the original predecessor Authority. This
 * channel returns DATA and cannot create custody, authorize or fund a note. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,readOriginalPrivateProofRecipientV1,closePrivateProofRecipientV1,openPrivateProofJobV1,sealPrivateProofJobV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
import {normalizeDevicePagedSourceContinuationDataV4} from '@lianum/mobile-protocol/device/paged-source-continuation-v4';

const sha=value=>createHash('sha256').update(value).digest('hex');

export function createDevicePagedSourceContinuationChannelV4(rawDescriptor,readOriginal){
 assert.equal(arguments.length,2);assert.equal(typeof readOriginal,'function');
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),recipients=new Map();let closed=false,inFlight=false;
 const live=()=>assert.ok(!closed&&P.devicePagedNowV3()<descriptor.deadlineMs,'PAGED_SOURCE_CONTINUATION_CLOSED');
 return Object.freeze({
  prepare(jobId){live();assert.ok(!inFlight&&recipients.size===0,'PAGED_SOURCE_CONTINUATION_BUSY');const mode=P.DEVICE_PAGED_MODES_V3.reserve,recipient=createPrivateProofRecipientV1({relation:mode.relation,role:mode.role,jobId});recipients.set(jobId,recipient);return readPrivateProofRecipientV1(recipient);},
  discardReady(jobId){const recipient=recipients.get(jobId);assert.ok(recipient,'PAGED_SOURCE_CONTINUATION_ORIGINAL_RECIPIENT');recipients.delete(jobId);closePrivateProofRecipientV1(recipient);},
  async submit(rawConsent,signature,ciphertext){
   live();assert.ok(!inFlight,'PAGED_SOURCE_CONTINUATION_BUSY');const consent=C.normalizeDevicePagedGraphConsentV3(rawConsent);assert.equal(consent.action,'READ_SOURCE_CONTINUATION_V4');assert.deepEqual(consent.descriptor,descriptor);
   const recipient=recipients.get(consent.jobId);assert.ok(recipient,'PAGED_SOURCE_CONTINUATION_ORIGINAL_RECIPIENT');recipients.delete(consent.jobId);inFlight=true;let opened,reply;
   try{
    C.validateDevicePagedGraphConsentFreshV3(consent);assert.deepEqual(readPrivateProofRecipientV1(recipient),consent.recipient);opened=openPrivateProofJobV1(recipient,ciphertext);
    const bound=readOriginalPrivateProofRecipientV1(opened),input=P.pagedOwnerExactV3(opened.inputs,['profile','consent','signature','command']);assert.equal(input.profile,C.DEVICE_PAGED_GRAPH_OWNER_V3);assert.deepEqual(input.consent,consent);assert.equal(input.signature,signature);
    assert.equal(bound.jobId,consent.jobId);assert.equal(bound.relation,consent.recipient.relation);assert.equal(bound.role,consent.recipient.role);assert.equal(opened.expectedPublicInputs,null);assert.equal(opened.authorization.kind,'ORIGINAL_CONSENT_V1');assert.equal(opened.authorization.jobId,consent.jobId);
    assert.equal(opened.authorization.consentSHA256,sha(C.devicePagedGraphPermissionMessageV3(consent)));assert.equal(opened.authorization.witnessSHA256,consent.commandSHA256);P.pagedOwnerExactV3(input.command,[]);assert.equal(sha(JSON.stringify(input.command)),consent.commandSHA256);C.validateDevicePagedGraphConsentFreshV3(consent);
    reply=P.snapshotDevicePagedWitnessV3(P.pagedOwnerExactV3(await readOriginal(consent),['view','status']));live();C.validateDevicePagedGraphConsentFreshV3(consent);
    const status=C.validateDevicePagedGraphPublicFreshV3(reply.status),view=normalizeDevicePagedSourceContinuationDataV4(reply.view,descriptor);assert.deepEqual(status.descriptor,descriptor);assert.ok(['FULFILLED','RECOVERED'].includes(status.phase)&&!status.pending,'PAGED_SOURCE_CONTINUATION_TERMINAL');
    for(const key of ['graphId','rootId','revision','authorizationRoot','reserveNullifier','progressCommitment'])assert.equal(status[key],consent[key],'PAGED_SOURCE_CONTINUATION_SCOPE');assert.equal(view.predecessor.walletRootId,status.rootId);assert.equal(view.predecessor.sourceRevision,String(status.revision));
    const encrypted=sealPrivateProofJobV1({...consent.recipient,recipientPublicKey:consent.replyPublicKey},{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,jobId:consent.jobId,reply:view},expectedPublicInputs:null,authorization:opened.authorization});return {ciphertext:encrypted,status};
   }finally{inFlight=false;closePrivateProofRecipientV1(recipient);wipePrivateProofInputsV1(opened);wipePrivateProofInputsV1(reply);}
  },
  close(){closed=true;for(const recipient of recipients.values())closePrivateProofRecipientV1(recipient);recipients.clear();}
 });
}
