/** Explicit Native D26 private intake; V1 bytes/domains are preserved. */
/** @typedef {import('./device-native-private-deposit-v2.mjs').NativePrivateDepositConsentV2} NativePrivateDepositConsentV2 */
/** @typedef {import('./device-native-private-deposit-v2.mjs').DeviceDepositConsentEitherV2} DeviceDepositConsentEitherV2 */
import {normalizeDeviceDepositConsentV1,validateDeviceDepositConsentFreshV1,deviceDepositConsentMessageV1,
 DEVICE_DEPOSIT_CONSENT_V1,normalizeDeviceDepositWitnessV1,deviceDepositWitnessBytesV1} from './device-deposit-consent-v1.mjs';
export const DEVICE_NATIVE_PRIVATE_DEPOSIT_V2='LIANUM_DEVICE_ORIGINAL_D26_PRIVATE_V2';
export const DEVICE_NATIVE_PRIVATE_PROOF_V2='ORIGINAL_NATIVE_DEVICE_D26_PRIVATE_TRANSIT_V2';
/** @type {(value: unknown) => asserts value} */
const need=v=>{if(!v)throw Error('MOBILE_NATIVE_PRIVATE_D26_INVALID');};
/** @param {unknown} v @returns {v is string} */
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
/** @param {unknown} v @param {readonly string[]} names @returns {Record<string, unknown>} */
function exact(v,names){need(v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===names.length);
 return Object.fromEntries(names.map(n=>{const d=Object.getOwnPropertyDescriptor(v,n);need(d&&d.enumerable&&Object.hasOwn(d,'value'));return[n,d.value];}));}
/** @template T @param {T} v @returns {T} */
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const fields=['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt','binding',
 'poolTerms','statement','rootId','noteRevision','jobId','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure'];
/** @param {unknown} raw @returns {NativePrivateDepositConsentV2} */
export function normalizeNativePrivateDepositConsentV2(raw){
 const q=exact(raw,[...fields,'privateProof']);need(q.version===2&&q.profile===DEVICE_NATIVE_PRIVATE_DEPOSIT_V2);
 const {privateProof,...base}=q;
 const v=normalizeDeviceDepositConsentV1({...base,version:1,profile:DEVICE_DEPOSIT_CONSENT_V1,
  openingDisclosure:q.action==='PROVE_D26'?'ONE_D26_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER':null});
 if(q.action==='PROVE_D26'){
  need(q.openingDisclosure==='ENCRYPTED_D26_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT');
  const p=exact(privateProof,['profile','recipient','transcriptSHA256']),r=exact(p.recipient,['type','profile','relation','role','jobId','recipientPublicKey']);
  need(p.profile===DEVICE_NATIVE_PRIVATE_PROOF_V2&&hex(p.transcriptSHA256)&&r.type==='flat-private-proof-input-ready'
   &&r.profile==='ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1'&&r.relation==='deposit_balance'&&r.role==='owner'
   &&typeof r.jobId==='string'&&/^[a-z0-9-]{8,100}$/.test(r.jobId)
   &&typeof r.recipientPublicKey==='string'&&/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/.test(r.recipientPublicKey));
  return freeze({...v,version:2,profile:q.profile,openingDisclosure:q.openingDisclosure,privateProof:{
   profile:p.profile,recipient:{type:r.type,profile:r.profile,relation:r.relation,role:r.role,jobId:r.jobId,recipientPublicKey:r.recipientPublicKey},transcriptSHA256:p.transcriptSHA256}});
 }
 need(q.openingDisclosure===null&&privateProof===null);
 return freeze({...v,version:2,profile:q.profile,openingDisclosure:null,privateProof:null});
}
/** @param {unknown} raw @returns {DeviceDepositConsentEitherV2} */
export function normalizeDeviceDepositConsentEitherV2(raw){
 need(raw!==null&&typeof raw==='object');
 const d=Object.getOwnPropertyDescriptor(raw,'version');need(d&&Object.hasOwn(d,'value'));
 return d.value===2?normalizeNativePrivateDepositConsentV2(raw):normalizeDeviceDepositConsentV1(raw);
}
/** @param {unknown} raw @param {number} [now] @returns {DeviceDepositConsentEitherV2} */
export function validateDeviceDepositConsentEitherFreshV2(raw,now=Date.now()){
 const v=normalizeDeviceDepositConsentEitherV2(raw);
 if(v.version===1)return validateDeviceDepositConsentFreshV1(v,now);
 need(Number.isSafeInteger(now)&&v.expiresAt>now&&v.expiresAt<=now+15000);return v;
}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceDepositConsentEitherMessageV2(raw){
 const v=normalizeDeviceDepositConsentEitherV2(raw);if(v.version===1)return deviceDepositConsentMessageV1(v);
 const text='LIANUM_NATIVE_D26_PERMISSION/2\n'+JSON.stringify(v);need(text.length<=8192&&/^[\x20-\x7e\n]*$/.test(text));
 return new TextEncoder().encode(text);
}
/** @param {unknown} raw @returns {Uint8Array} */
export function nativePrivateDepositTranscriptBytesV2(raw){
 const c=normalizeNativePrivateDepositConsentV2(raw);need(c.action==='PROVE_D26'&&c.privateProof);
 const {privateProof,...consent}=c;
 return new TextEncoder().encode(JSON.stringify({profile:DEVICE_NATIVE_PRIVATE_PROOF_V2,consent,recipient:privateProof.recipient}));
}
/** @param {string} x @returns {string[]} */
const words=x=>Array.from({length:8},(_,i)=>String(Number.parseInt(x.slice(i*8,i*8+8),16)));
/** @param {unknown} raw @returns {string[]} */
export function nativePrivateDepositPublicInputsV2(raw){
 const c=normalizeNativePrivateDepositConsentV2(raw),s=c.statement;
 need(c.action==='PROVE_D26');return[...words(s.scope),...words(s.policy),s.epoch,s.amount,...words(s.output)];
}
export {normalizeDeviceDepositWitnessV1,deviceDepositWitnessBytesV1};
