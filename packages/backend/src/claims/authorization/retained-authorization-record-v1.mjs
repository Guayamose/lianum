// @ts-check
/** Pure comparison of a retained authorization with the current operator view.
 * No signer, original token, quorum, dispatch or ownership can be constructed.
 * The caller remains responsible for obtaining its private original record. */
import assert from 'node:assert/strict';
import {claimUint,claimHash} from '@lianum/engine/claims/value-codecs';
/** @typedef {{kind:string,message:unknown,digest:string,signature:unknown,abiSignature:unknown}} AuthorizationRecord */
/** @typedef {{signerIndex:number,head:{timestamp:string,[key:string]:unknown},
 * authorizations:readonly AuthorizationRecord[]}} AuthorizationView */
/** @param {string} kind @param {unknown} message @param {Buffer} frame
 * @param {unknown} original @param {string} originalFrame @param {AuthorizationView} view
 * @returns {AuthorizationRecord} */
export function validateRetainedClaimAuthorizationV1(kind,message,frame,original,originalFrame,view){
 assert.ok(original&&typeof original==='object'&&!Array.isArray(original),'CLAIM_ORIGINAL_AUTHORIZATION_REQUIRED');
 assert.ok('kind' in original&&'signerIndex' in original&&'head' in original&&'message' in original&&
  'digest' in original&&'signature' in original&&'abiSignature' in original,'CLAIM_ORIGINAL_AUTHORIZATION_REQUIRED');
 assert.equal(original.kind,kind,'CLAIM_ORIGINAL_AUTHORIZATION_KIND');
 assert.equal(original.signerIndex,view.signerIndex,'CLAIM_ORIGINAL_AUTHORIZATION_SIGNER');
 assert.deepEqual(original.head,view.head,'CLAIM_ORIGINAL_AUTHORIZATION_HEAD');
 assert.ok(original.message&&typeof original.message==='object'&&'validFrom' in original.message&&
  'validUntil' in original.message,'CLAIM_ORIGINAL_AUTHORIZATION_MESSAGE');
 const now=claimUint(view.head.timestamp),from=claimUint(original.message.validFrom),until=claimUint(original.message.validUntil);
 // Inclusion occurs at the original head's timestamp + 1. Never renew the
 // canonical time bounds, original bytes or their retained signature.
 assert.ok(from<=now&&now+1n<until&&until-from<=30n,'CLAIM_ORIGINAL_AUTHORIZATION_EXPIRED');
 assert.deepEqual(message,original.message,'CLAIM_ORIGINAL_AUTHORIZATION_MESSAGE');
 assert.equal(frame.toString('hex'),originalFrame,'CLAIM_ORIGINAL_AUTHORIZATION_FRAME');
 const digest=claimHash(frame);assert.equal(digest,original.digest,'CLAIM_ORIGINAL_AUTHORIZATION_DIGEST');
 const matches=view.authorizations.filter(row=>row.kind===kind&&row.digest===digest);
 assert.equal(matches.length,1,'CLAIM_ORIGINAL_AUTHORIZATION_MISSING');
 const prior=matches[0];assert.ok(prior.signature&&prior.abiSignature,'CLAIM_ORIGINAL_AUTHORIZATION_UNFINISHED');
 assert.deepEqual(prior.kind,original.kind,'CLAIM_ORIGINAL_AUTHORIZATION_RECORD_CHANGED');
 assert.deepEqual(prior.message,original.message,'CLAIM_ORIGINAL_AUTHORIZATION_RECORD_CHANGED');
 assert.deepEqual(prior.digest,original.digest,'CLAIM_ORIGINAL_AUTHORIZATION_RECORD_CHANGED');
 assert.deepEqual(prior.signature,original.signature,'CLAIM_ORIGINAL_AUTHORIZATION_RECORD_CHANGED');
 assert.deepEqual(prior.abiSignature,original.abiSignature,'CLAIM_ORIGINAL_AUTHORIZATION_RECORD_CHANGED');
 return prior;
}
