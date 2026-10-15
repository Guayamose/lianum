/** Fixed transport for one privately Original issuer. Paths, references and
 * public DTOs select requests only; no opaque financial token crosses HTTP. */
import assert from 'node:assert/strict';
import {createOriginalDeviceSepoliaDefiSharesAuthorityV4} from './device-sepolia-defi-shares-authority-v4.mjs';
const handlers=new WeakMap();
export async function createOriginalDeviceSepoliaDefiSharesHttpV4(runtime,target,input){
 assert.equal(arguments.length,3);const account=await createOriginalDeviceSepoliaDefiSharesAuthorityV4(runtime,target,input),d=account.descriptor;const handler=Object.freeze({descriptor:d,account,
  async dispatch(path,payload,pairingId,reference=null){assert.equal(pairingId,d.pairingId,'SEPOLIA_DEFI_HTTP_PAIRING');assert.ok(typeof path==='string'&&!path.includes('?')&&!path.includes('#'));assert.ok(Buffer.byteLength(JSON.stringify(payload))<=(path.endsWith('/private-operations')?16384:8192));const prefix='/v1/mobile/sepolia-defi-shares/';assert.ok(path.startsWith(prefix),'SEPOLIA_DEFI_HTTP_ROUTE');switch(path.slice(prefix.length)){
   case'challenges':assert.deepEqual(payload,{});return account.challenge();
   case'defi-reviews':assert.deepEqual(Object.keys(payload),['review']);return account.review(payload.review);
   case'defi-read-review':return account.readReviewReference(payload);
   case'defi-authorizations':assert.deepEqual(Object.keys(payload).sort(),['challenge','signature']);await account.authorizeReview(payload.challenge,payload.signature);return{reference:payload.challenge.review.reference,authorized:true,financialNativeMounted:false};
   case'reviews':return account.reviewNote(payload,reference);
   case'private-operations':case'operations':return account.operation(payload);
   case'status':return account.status(payload);
   default:assert.fail('SEPOLIA_DEFI_HTTP_ROUTE');
  }},close:()=>account.close()});handlers.set(handler,{runtime,target,account});return handler;
}
export function assertOriginalDeviceSepoliaDefiSharesHttpV4(handler){assert.equal(arguments.length,1);assert.ok(handlers.has(handler),'SEPOLIA_DEFI_ORIGINAL_HTTP');return handler;}
