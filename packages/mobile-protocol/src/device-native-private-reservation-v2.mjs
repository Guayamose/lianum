import {boundedPermissionSha256V1} from './bounded-permission-sha256-v1.mjs';
/** Fixed Native U intake. V1 S/observation and all proof artifacts stay original. */
import * as V1 from './device-reservation-consent-v1.mjs';
/** @typedef {import('./device-native-private-reservation-v2.mjs').NativePrivateReservationConsentV2} NativePrivateReservationConsentV2 */
/** @typedef {import('./device-native-private-reservation-v2.mjs').DeviceReservationConsentEitherV2} DeviceReservationConsentEitherV2 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationWitnessV1} DeviceReservationWitnessV1 */
import {normalizeExternalFlatGraphPrivateProofV2,externalFlatGraphPrivateDigestV2} from './device-external-flat-graph-v1.mjs';
/** Preserve this consent domain's original invalid-data error.
 * @param {unknown} bytes @returns {Uint8Array} */
function sha256(bytes){need(bytes instanceof Uint8Array&&bytes.length<=8192);return boundedPermissionSha256V1(bytes);}

export const DEVICE_NATIVE_PRIVATE_RESERVATION_V2='LIANUM_DEVICE_ORIGINAL_U_PRIVATE_V2';
export const DEVICE_NATIVE_PRIVATE_U_PROOF_V2='ORIGINAL_NATIVE_DEVICE_U_PRIVATE_TRANSIT_V2';
/** @type {(value: unknown) => asserts value} */
const need=v=>{if(!v)throw Error('MOBILE_NATIVE_PRIVATE_U_INVALID');};
/** @template T @param {T} v @returns {T} */
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
/** @param {unknown} raw @param {readonly string[]} names @returns {Record<string, unknown>} */
function exact(raw,names){
 if(raw===null||typeof raw!=='object'||Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==names.length)throw Error('DEVICE_EXTERNAL_FLAT_DATA');
 return Object.fromEntries(names.map(name=>{const d=Object.getOwnPropertyDescriptor(raw,name);
  if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error('DEVICE_EXTERNAL_FLAT_DATA');return[name,d.value];}));
}
/** @param {unknown} value @returns {string} */
function string(value){need(typeof value==='string');return value;}
/** @param {unknown} raw @returns {NativePrivateReservationConsentV2['privateProof']['recipient']} */
function recipient(raw){const r=exact(raw,['type','profile','relation','role','jobId','recipientPublicKey']);
 return{type:string(r.type),profile:string(r.profile),relation:string(r.relation),role:string(r.role),jobId:string(r.jobId),recipientPublicKey:string(r.recipientPublicKey)};}
/** Recheck the imported validator's unknown result before exposing the Native contract.
 * @param {unknown} raw @returns {NativePrivateReservationConsentV2['privateProof']} */
function checkedPrivateProof(raw){
 const p=exact(raw,['profile','recipient','resultRecipient','context','transcriptSHA256']);
 const c=exact(p.context,['domain','proposalSHA256','capsuleOptionsSHA256','invoiceSignaturesSHA256','sourceAmount']);
 const d=exact(c.domain,['scope','policy','asset','hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace']);
 const domain=Object.fromEntries(Object.entries(d).map(([key,value])=>[key,string(value)]));
 return{profile:DEVICE_NATIVE_PRIVATE_U_PROOF_V2,recipient:recipient(p.recipient),resultRecipient:recipient(p.resultRecipient),
  context:{domain,proposalSHA256:string(c.proposalSHA256),capsuleOptionsSHA256:string(c.capsuleOptionsSHA256),invoiceSignaturesSHA256:string(c.invoiceSignaturesSHA256),sourceAmount:string(c.sourceAmount)},transcriptSHA256:string(p.transcriptSHA256)};
}
const names=['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt','binding','poolTerms','depositJobId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure'];
/** @param {unknown} raw @returns {NativePrivateReservationConsentV2} */
export function normalizeNativePrivateReservationConsentV2(raw){
 const q=exact(raw,[...names,'privateProof']);need(q.version===2&&q.profile===DEVICE_NATIVE_PRIVATE_RESERVATION_V2&&q.action==='PROVE_U'&&q.openingDisclosure==='ENCRYPTED_U_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT');
 const {privateProof,...base}=q,v=V1.normalizeDeviceReservationConsentV1({...base,version:1,profile:V1.DEVICE_RESERVATION_CONSENT_V1,openingDisclosure:V1.DEVICE_RESERVATION_DISCLOSURE_V1});
 const pp=exact(privateProof,['profile','recipient','resultRecipient','context','transcriptSHA256']);need(pp.profile===DEVICE_NATIVE_PRIVATE_U_PROOF_V2);
 const p=checkedPrivateProof(normalizeExternalFlatGraphPrivateProofV2({...pp,profile:'ORIGINAL_DEVICE_GRAPH_U_PRIVATE_TRANSIT_V2'}));
 for(const [a,b]of /** @type {const} */ ([['scope','scope'],['policy','policy'],['asset','assetIdentity']]))need(p.context.domain[a]===v.poolTerms[b]);
 return freeze({...v,version:2,profile:q.profile,action:q.action,openingDisclosure:q.openingDisclosure,privateProof:p});
}
/** @param {unknown} raw @returns {DeviceReservationConsentEitherV2} */
export function normalizeDeviceReservationConsentEitherV2(raw){need(raw!==null&&typeof raw==='object');const d=Object.getOwnPropertyDescriptor(raw,'version');need(d&&Object.hasOwn(d,'value'));return d.value===2?normalizeNativePrivateReservationConsentV2(raw):V1.normalizeDeviceReservationConsentV1(raw);}
/** @param {unknown} raw @param {number} [now] @returns {DeviceReservationConsentEitherV2} */
export function validateDeviceReservationConsentEitherFreshV2(raw,now=Date.now()){const c=normalizeDeviceReservationConsentEitherV2(raw);if(c.version===1)return V1.validateDeviceReservationConsentFreshV1(c,now);need(Number.isSafeInteger(now)&&c.expiresAt>now&&c.expiresAt<=now+15000);return c;}
/** @param {unknown} v @returns {string} */
function canonical(v){if(v===null||typeof v!=='object'){const encoded=JSON.stringify(v);need(typeof encoded==='string');return encoded;}
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 const record=/** @type {Record<string, unknown>} */(v);
 return '{'+Object.keys(record).sort().map(k=>JSON.stringify(k)+':'+canonical(record[k])).join(',')+'}';}

/** @param {unknown} raw @returns {Uint8Array} */
export function deviceReservationConsentEitherMessageV2(raw){const c=normalizeDeviceReservationConsentEitherV2(raw);if(c.version===1)return V1.deviceReservationConsentMessageV1(c);const b=new TextEncoder().encode(canonical(c)),tag=new TextEncoder().encode('LIANUM_NATIVE_U_PERMISSION/2/full-consent-sha256');/** @type {Uint8Array | undefined} */let digest;try{need(b.length<=8192);digest=sha256(b);const out=new Uint8Array(8+tag.length+32),view=new DataView(out.buffer);view.setUint32(0,tag.length,false);out.set(tag,4);view.setUint32(4+tag.length,32,false);out.set(digest,8+tag.length);return out;}finally{b.fill(0);digest?.fill(0);}}
/** @param {unknown} raw @returns {Uint8Array} */
export function nativePrivateReservationTranscriptBytesV2(raw){const c=normalizeNativePrivateReservationConsentV2(raw),{privateProof,...consent}=c;return new TextEncoder().encode(canonical({profile:privateProof.profile,consent,recipient:privateProof.recipient,resultRecipient:privateProof.resultRecipient,context:privateProof.context}));}
export const nativePrivateReservationDigestV2=externalFlatGraphPrivateDigestV2;
/** @param {unknown} raw @param {unknown} witness @returns {NativePrivateReservationConsentV2} */
export function validateNativePrivateReservationWitnessV2(raw,witness){const c=validateDeviceReservationConsentEitherFreshV2(raw);need(c.version===2);/** @type {DeviceReservationWitnessV1 | undefined} */let w;/** @type {Uint8Array | undefined} */let bytes,digest;try{bytes=nativePrivateReservationTranscriptBytesV2(c);digest=sha256(bytes);need(Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')===c.privateProof.transcriptSHA256);w=V1.normalizeDeviceReservationWitnessV1(witness);const input=w.input;const proposal=Object.fromEntries((/** @type {const} */(['scope','policy','asset','operationId','budget','fundingNotBefore','fundingValidUntil','settleBefore','nodes'])).map(k=>[k,input[k]]));need(nativePrivateReservationDigestV2(proposal)===c.privateProof.context.proposalSHA256&&nativePrivateReservationDigestV2(w.envelopePreparation.capsuleOptions)===c.privateProof.context.capsuleOptionsSHA256&&nativePrivateReservationDigestV2(w.invoiceSignatures)===c.privateProof.context.invoiceSignaturesSHA256&&w.input.inputNote.value===c.privateProof.context.sourceAmount);return c;}finally{bytes?.fill(0);digest?.fill(0);V1.wipeDeviceReservationWitnessV1(w);}}
export {normalizeDeviceReservationWitnessV1,deviceReservationWitnessBytesV1,wipeDeviceReservationWitnessV1} from './device-reservation-consent-v1.mjs';
