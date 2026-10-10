/** Explicit Native D26 private intake; V1 bytes/domains are preserved. */
import {normalizeDeviceDepositConsentV1,validateDeviceDepositConsentFreshV1,deviceDepositConsentMessageV1,
 DEVICE_DEPOSIT_CONSENT_V1,normalizeDeviceDepositWitnessV1,deviceDepositWitnessBytesV1} from './device-deposit-consent-v1.mjs';
export const DEVICE_NATIVE_PRIVATE_DEPOSIT_V2='LIANUM_DEVICE_ORIGINAL_D26_PRIVATE_V2';
export const DEVICE_NATIVE_PRIVATE_PROOF_V2='ORIGINAL_NATIVE_DEVICE_D26_PRIVATE_TRANSIT_V2';
const need=v=>{if(!v)throw Error('MOBILE_NATIVE_PRIVATE_D26_INVALID');};
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
function exact(v,names){need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===names.length);
 return Object.fromEntries(names.map(n=>{const d=Object.getOwnPropertyDescriptor(v,n);need(d?.enumerable&&Object.hasOwn(d,'value'));return[n,d.value];}));}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const fields=['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt','binding',
 'poolTerms','statement','rootId','noteRevision','jobId','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure'];
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
  return freeze({...v,version:2,profile:q.profile,openingDisclosure:q.openingDisclosure,privateProof:{...p,recipient:r}});
 }
 need(q.openingDisclosure===null&&privateProof===null);
 return freeze({...v,version:2,profile:q.profile,privateProof:null});
}
export function normalizeDeviceDepositConsentEitherV2(raw){
 const d=raw&&Object.getOwnPropertyDescriptor(raw,'version');need(d&&Object.hasOwn(d,'value'));
 return d.value===2?normalizeNativePrivateDepositConsentV2(raw):normalizeDeviceDepositConsentV1(raw);
}
export function validateDeviceDepositConsentEitherFreshV2(raw,now=Date.now()){
 const v=normalizeDeviceDepositConsentEitherV2(raw);
 if(v.version===1)return validateDeviceDepositConsentFreshV1(v,now);
 need(Number.isSafeInteger(now)&&v.expiresAt>now&&v.expiresAt<=now+15000);return v;
}
export function deviceDepositConsentEitherMessageV2(raw){
 const v=normalizeDeviceDepositConsentEitherV2(raw);if(v.version===1)return deviceDepositConsentMessageV1(v);
 const text='LIANUM_NATIVE_D26_PERMISSION/2\n'+JSON.stringify(v);need(text.length<=8192&&/^[\x20-\x7e\n]*$/.test(text));
 return new TextEncoder().encode(text);
}
export function nativePrivateDepositTranscriptBytesV2(raw){
 const c=normalizeNativePrivateDepositConsentV2(raw);need(c.action==='PROVE_D26'&&c.privateProof);
 const {privateProof,...consent}=c;
 return new TextEncoder().encode(JSON.stringify({profile:DEVICE_NATIVE_PRIVATE_PROOF_V2,consent,recipient:privateProof.recipient}));
}
export function nativePrivateDepositPublicInputsV2(raw){
 const c=normalizeNativePrivateDepositConsentV2(raw),s=c.statement,words=x=>Array.from({length:8},(_,i)=>String(Number.parseInt(x.slice(i*8,i*8+8),16)));
 need(c.action==='PROVE_D26');return[...words(s.scope),...words(s.policy),s.epoch,s.amount,...words(s.output)];
}
export {normalizeDeviceDepositWitnessV1,deviceDepositWitnessBytesV1};
