/** Read-only encrypted OWNER observations of the same graph's wallet notes.
 * This port creates no proof, transfer, spend capability or journal effect. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,readOriginalPrivateProofRecipientV1,closePrivateProofRecipientV1,openPrivateProofJobV1,sealPrivateProofJobV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
import {normalizeDevicePagedPortfolioRequestV3,normalizeDevicePagedWalletPortfolioV3} from '@lianum/mobile-protocol/device/paged-wallet-portfolio-v3';

const sha=value=>createHash('sha256').update(value).digest('hex');
export function createDevicePagedWalletPortfolioChannelV3(rawDescriptor,readPortfolio){
 assert.equal(arguments.length,2);assert.equal(typeof readPortfolio,'function');
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),recipients=new Map();let closed=false,inFlight=false;
 const live=()=>assert.ok(!closed&&P.devicePagedNowV3()<descriptor.deadlineMs,'PAGED_WALLET_PORTFOLIO_CLOSED');
 return Object.freeze({
  prepare(jobId){
   live();assert.ok(!inFlight&&recipients.size===0,'PAGED_WALLET_PORTFOLIO_BUSY');
   const mode=P.DEVICE_PAGED_MODES_V3.reserve,recipient=createPrivateProofRecipientV1({relation:mode.relation,role:mode.role,jobId});
   recipients.set(jobId,recipient);return readPrivateProofRecipientV1(recipient);
  },
  discardReady(jobId){const recipient=recipients.get(jobId);assert.ok(recipient,'PAGED_WALLET_PORTFOLIO_ORIGINAL_RECIPIENT');recipients.delete(jobId);closePrivateProofRecipientV1(recipient);},
  async submit(rawConsent,signature,ciphertext){
   live();assert.ok(!inFlight,'PAGED_WALLET_PORTFOLIO_BUSY');
   const consent=C.normalizeDevicePagedGraphConsentV3(rawConsent);assert.equal(consent.action,'READ_PORTFOLIO');assert.deepEqual(consent.descriptor,descriptor);
   const recipient=recipients.get(consent.jobId);assert.ok(recipient,'PAGED_WALLET_PORTFOLIO_ORIGINAL_RECIPIENT');recipients.delete(consent.jobId);inFlight=true;
   let opened,reply;
   try{
    C.validateDevicePagedGraphConsentFreshV3(consent);
    assert.deepEqual(readPrivateProofRecipientV1(recipient),consent.recipient);opened=openPrivateProofJobV1(recipient,ciphertext);
    const original=readOriginalPrivateProofRecipientV1(opened),input=P.pagedOwnerExactV3(opened.inputs,['profile','consent','signature','command']);
    assert.equal(input.profile,C.DEVICE_PAGED_GRAPH_OWNER_V3);assert.deepEqual(input.consent,consent);assert.equal(input.signature,signature);
    assert.equal(original.jobId,consent.jobId);assert.equal(original.relation,consent.recipient.relation);assert.equal(original.role,consent.recipient.role);assert.equal(opened.expectedPublicInputs,null);
    assert.equal(opened.authorization.kind,'ORIGINAL_CONSENT_V1');assert.equal(opened.authorization.jobId,consent.jobId);
    assert.equal(opened.authorization.consentSHA256,sha(C.devicePagedGraphPermissionMessageV3(consent)));assert.equal(opened.authorization.witnessSHA256,consent.commandSHA256);
    assert.equal(sha(JSON.stringify(input.command)),consent.commandSHA256);
    const command=normalizeDevicePagedPortfolioRequestV3(input.command);C.validateDevicePagedGraphConsentFreshV3(consent);
    reply=P.snapshotDevicePagedWitnessV3(P.pagedOwnerExactV3(await readPortfolio(command.outputs,consent),['view','status']));live();C.validateDevicePagedGraphConsentFreshV3(consent);
    const status=C.validateDevicePagedGraphPublicFreshV3(reply.status),view=normalizeDevicePagedWalletPortfolioV3(reply.view,descriptor);
    assert.deepEqual(status.descriptor,descriptor,'PAGED_WALLET_PORTFOLIO_DESCRIPTOR');
    for(const key of ['graphId','rootId','revision','authorizationRoot']){assert.equal(status[key],consent[key],'PAGED_WALLET_PORTFOLIO_SCOPE');assert.equal(view[key],status[key],'PAGED_WALLET_PORTFOLIO_SCOPE');}
    assert.equal(view.phase,status.phase);assert.equal(view.pending,status.pending);
    assert.equal(view.ledger.blockHash,status.blockHash,'PAGED_WALLET_PORTFOLIO_HEAD');assert.equal(view.ledger.blockNumber,status.blockNumber,'PAGED_WALLET_PORTFOLIO_HEAD');
    assert.equal(view.outputs.length,command.outputs.length);
    for(const [index,row]of view.outputs.entries())for(const key of ['role','id','commitment','nullifier','amount'])assert.equal(row[key],command.outputs[index][key],'PAGED_WALLET_PORTFOLIO_OUTPUT');
    return {status,ciphertext:sealPrivateProofJobV1({...consent.recipient,recipientPublicKey:consent.replyPublicKey},{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,jobId:consent.jobId,reply:view},expectedPublicInputs:null,authorization:opened.authorization})};
   }finally{inFlight=false;closePrivateProofRecipientV1(recipient);wipePrivateProofInputsV1(opened);wipePrivateProofInputsV1(reply);}
  },
  close(){closed=true;for(const recipient of recipients.values())closePrivateProofRecipientV1(recipient);recipients.clear();}
 });
}
