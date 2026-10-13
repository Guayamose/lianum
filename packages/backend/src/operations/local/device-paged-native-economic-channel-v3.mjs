/** Encrypted OWNER view of the original retained settlement and ledger.
 * The privately bound reader returns DATA only: this channel cannot prove,
 * sign, send, journal an effect or expose an output opening. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,readOriginalPrivateProofRecipientV1,closePrivateProofRecipientV1,openPrivateProofJobV1,sealPrivateProofJobV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
import {normalizeDevicePagedEconomicRequestV3,normalizeDevicePagedEconomicViewV3} from '@lianum/mobile-protocol/device/paged-economic-view-v3';

const sha=value=>createHash('sha256').update(value).digest('hex');

export function createDevicePagedNativeEconomicChannelV3(rawDescriptor,readSettlement){
 assert.equal(arguments.length,2);assert.equal(typeof readSettlement,'function');
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),recipients=new Map();let closed=false,inFlight=false;
 const live=()=>assert.ok(!closed&&P.devicePagedNowV3()<descriptor.deadlineMs,'PAGED_NATIVE_ECONOMIC_CLOSED');
 return Object.freeze({
  prepare(jobId){
   live();assert.ok(!inFlight&&recipients.size===0,'PAGED_NATIVE_ECONOMIC_BUSY');
   const mode=P.DEVICE_PAGED_MODES_V3.reserve,recipient=createPrivateProofRecipientV1({relation:mode.relation,role:mode.role,jobId});
   recipients.set(jobId,recipient);return readPrivateProofRecipientV1(recipient);
  },
  discardReady(jobId){const recipient=recipients.get(jobId);assert.ok(recipient,'PAGED_NATIVE_ECONOMIC_ORIGINAL_RECIPIENT');recipients.delete(jobId);closePrivateProofRecipientV1(recipient);},
  async submit(rawConsent,signature,ciphertext){
   live();assert.ok(!inFlight,'PAGED_NATIVE_ECONOMIC_BUSY');
   const consent=C.normalizeDevicePagedGraphConsentV3(rawConsent);assert.equal(consent.action,'READ_ECONOMIC_SETTLEMENT');assert.deepEqual(consent.descriptor,descriptor);
   const recipient=recipients.get(consent.jobId);assert.ok(recipient,'PAGED_NATIVE_ECONOMIC_ORIGINAL_RECIPIENT');recipients.delete(consent.jobId);inFlight=true;
   let opened,reply;
   try{
    // Consume the ready recipient even when the permission expires between
    // authority PoP acceptance and this channel's intake freshness check.
    C.validateDevicePagedGraphConsentFreshV3(consent);
    assert.deepEqual(readPrivateProofRecipientV1(recipient),consent.recipient);opened=openPrivateProofJobV1(recipient,ciphertext);
    const bound=readOriginalPrivateProofRecipientV1(opened),input=P.pagedOwnerExactV3(opened.inputs,['profile','consent','signature','command']);
    assert.equal(input.profile,C.DEVICE_PAGED_GRAPH_OWNER_V3);assert.deepEqual(input.consent,consent);assert.equal(input.signature,signature);
    assert.equal(bound.jobId,consent.jobId);assert.equal(bound.relation,consent.recipient.relation);assert.equal(bound.role,consent.recipient.role);assert.equal(opened.expectedPublicInputs,null);
    assert.equal(opened.authorization.kind,'ORIGINAL_CONSENT_V1');assert.equal(opened.authorization.jobId,consent.jobId);
    assert.equal(opened.authorization.consentSHA256,sha(C.devicePagedGraphPermissionMessageV3(consent)));assert.equal(opened.authorization.witnessSHA256,consent.commandSHA256);
    assert.equal(sha(JSON.stringify(input.command)),consent.commandSHA256);
    const command=normalizeDevicePagedEconomicRequestV3(input.command);C.validateDevicePagedGraphConsentFreshV3(consent);
    // Reader DATA may be frozen and retained by its original owner. Only the
    // bounded detached transport snapshot is wiped here.
    reply=P.snapshotDevicePagedWitnessV3(P.pagedOwnerExactV3(await readSettlement(command.outputs,consent),['view','status']));live();C.validateDevicePagedGraphConsentFreshV3(consent);
    const status=C.validateDevicePagedGraphPublicFreshV3(reply.status),view=normalizeDevicePagedEconomicViewV3(reply.view,descriptor);
    assert.deepEqual(status.descriptor,descriptor,'PAGED_NATIVE_ECONOMIC_DESCRIPTOR');
    for(const key of ['graphId','rootId','revision','authorizationRoot'])assert.equal(status[key],consent[key],'PAGED_NATIVE_ECONOMIC_STATUS_SCOPE');
    assert.equal(view.ledger.blockHash,status.blockHash,'PAGED_NATIVE_ECONOMIC_LEDGER_HEAD');assert.equal(view.ledger.blockNumber,status.blockNumber,'PAGED_NATIVE_ECONOMIC_LEDGER_HEAD');
    assert.equal(view.graphId,consent.graphId,'PAGED_NATIVE_ECONOMIC_GRAPH');assert.equal(view.authorizationRoot,consent.authorizationRoot,'PAGED_NATIVE_ECONOMIC_ROOT');
    assert.equal(view.outputs.length,command.outputs.length,'PAGED_NATIVE_ECONOMIC_OUTPUTS');
    view.outputs.forEach((output,index)=>{assert.equal(output.id,command.outputs[index].id,'PAGED_NATIVE_ECONOMIC_OUTPUT_ID');assert.equal(output.nullifier,command.outputs[index].nullifier,'PAGED_NATIVE_ECONOMIC_OUTPUT_NULLIFIER');});
    const replyCiphertext=sealPrivateProofJobV1({...consent.recipient,recipientPublicKey:consent.replyPublicKey},{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,jobId:consent.jobId,reply:view},expectedPublicInputs:null,authorization:opened.authorization});
    return {ciphertext:replyCiphertext,status};
   }finally{inFlight=false;closePrivateProofRecipientV1(recipient);wipePrivateProofInputsV1(opened);wipePrivateProofInputsV1(reply);}
  },
  close(){closed=true;for(const recipient of recipients.values())closePrivateProofRecipientV1(recipient);recipients.clear();}
 });
}
