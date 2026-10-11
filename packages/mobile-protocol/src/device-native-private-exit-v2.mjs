/** Closed Native W39 profile. Original V1 roles, bytes and domains remain intact. */
import * as V1 from './device-exit-consent-v1.mjs';
/** @typedef {import('./device-native-private-exit-v2.mjs').NativePrivateExitConsentV2} NativePrivateExitConsentV2 */
/** @typedef {import('./device-native-private-exit-v2.mjs').DeviceExitConsentEitherV2} DeviceExitConsentEitherV2 */
/** @typedef {import('./device-native-private-exit-v2.mjs').DeviceExitQuoteEitherV2} DeviceExitQuoteEitherV2 */
/** @typedef {import('./device-native-private-exit-v2.mjs').DeviceExitStatusEitherV2} DeviceExitStatusEitherV2 */
export const DEVICE_NATIVE_PRIVATE_EXIT_V2='LIANUM_DEVICE_ORIGINAL_W39_PRIVATE_V2';
export const DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2='ORIGINAL_NATIVE_DEVICE_W39_PRIVATE_TRANSIT_V2';
/** @type {(value: unknown) => asserts value} */
const need=v=>{if(!v)throw Error('MOBILE_NATIVE_PRIVATE_W39_INVALID');};
/** @param {unknown} v @param {readonly string[]} n @returns {Record<string, unknown>} */
function exact(v,n){need(v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===n.length);return Object.fromEntries(n.map(k=>{const d=Object.getOwnPropertyDescriptor(v,k);need(d&&d.enumerable&&Object.hasOwn(d,'value'));return[k,d.value];}));}
/** @template T @param {T} v @returns {T} */
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const fields=['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt','binding','poolTerms','parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','noteRevision','noteRole','statement','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure'];
/** @param {unknown} raw @returns {NativePrivateExitConsentV2} */
export function normalizeNativePrivateExitConsentV2(raw){const q=exact(raw,[...fields,'privateProof']);need(q.version===2&&q.profile===DEVICE_NATIVE_PRIVATE_EXIT_V2&&(q.noteRole==='deposit'||q.noteRole==='change'||q.noteRole==='recovery'));
 const {privateProof,...base}=q,v=V1.normalizeDeviceExitConsentV1({...base,version:1,profile:V1.DEVICE_EXIT_CONSENT_V1,noteRole:q.noteRole==='deposit'?'change':q.noteRole,openingDisclosure:q.action==='PROVE_W39'?V1.DEVICE_EXIT_DISCLOSURE_V1:null});
 if(q.action==='PROVE_W39'){need(q.openingDisclosure==='ENCRYPTED_W39_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT');
  const p=exact(privateProof,['profile','recipient','path','transcriptSHA256']),r=exact(p.recipient,['type','profile','relation','role','jobId','recipientPublicKey']);
  need(p.profile===DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2&&typeof p.transcriptSHA256==='string'&&/^[0-9a-f]{64}$/.test(p.transcriptSHA256)&&r.type==='flat-private-proof-input-ready'&&r.profile==='ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1'&&r.relation==='withdraw_balance'&&r.role==='owner'&&typeof r.jobId==='string'&&/^[a-z0-9-]{8,100}$/.test(r.jobId)&&typeof r.recipientPublicKey==='string'&&/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/.test(r.recipientPublicKey));
  const path=normalizeDeviceExitQuoteEitherV2({version:2,profile:'LIANUM_DEVICE_ORIGINAL_W39_QUOTE_PRIVATE_V2',...Object.fromEntries(['origin','pairingId','devicePublicKey','quoteId','expiresAt','parentJobId','nativeBindingSHA256','rootId','noteRevision','noteRole','statement','poolTerms','observed'].map(k=>[k,q[k]])),nullifierSpent:false,path:p.path}).path;
  return freeze({...v,version:2,profile:q.profile,noteRole:q.noteRole,openingDisclosure:q.openingDisclosure,privateProof:{profile:p.profile,recipient:{type:r.type,profile:r.profile,relation:r.relation,role:r.role,jobId:r.jobId,recipientPublicKey:r.recipientPublicKey},path,transcriptSHA256:p.transcriptSHA256}});}
 need(q.openingDisclosure===null&&privateProof===null);return freeze({...v,version:2,profile:q.profile,noteRole:q.noteRole,openingDisclosure:null,privateProof:null});}
/** @param {unknown} raw @returns {DeviceExitConsentEitherV2} */
export function normalizeDeviceExitConsentEitherV2(raw){need(raw!==null&&typeof raw==='object');const d=Object.getOwnPropertyDescriptor(raw,'version');need(d&&Object.hasOwn(d,'value'));return d.value===2?normalizeNativePrivateExitConsentV2(raw):V1.normalizeDeviceExitConsentV1(raw);}
/** @param {unknown} raw @param {number} [now] @returns {DeviceExitConsentEitherV2} */
export function validateDeviceExitConsentEitherFreshV2(raw,now=Date.now()){const v=normalizeDeviceExitConsentEitherV2(raw);need(Number.isSafeInteger(now)&&v.expiresAt>now&&v.expiresAt<=now+15000);return v;}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceExitConsentEitherMessageV2(raw){const v=normalizeDeviceExitConsentEitherV2(raw);if(v.version===1)return V1.deviceExitConsentMessageV1(v);const t='LIANUM_NATIVE_W39_PERMISSION/2\n'+JSON.stringify(v);need(t.length<=8192&&/^[\x20-\x7e\n]*$/.test(t));return new TextEncoder().encode(t);}
/** @param {unknown} raw @returns {Uint8Array} */
export function nativePrivateExitTranscriptBytesV2(raw){const c=normalizeNativePrivateExitConsentV2(raw);need(c.action==='PROVE_W39'&&c.privateProof);const {privateProof,...consent}=c;return new TextEncoder().encode(JSON.stringify({profile:DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2,consent,recipient:privateProof.recipient,path:privateProof.path}));}
/** @param {string} x @returns {string[]} */
const w=x=>Array.from({length:8},(_,i)=>String(Number.parseInt(x.slice(i*8,i*8+8),16)));
/** @param {unknown} raw @returns {string[]} */
export function nativePrivateExitPublicInputsV2(raw){const c=normalizeNativePrivateExitConsentV2(raw);need(c.action==='PROVE_W39');const s=c.statement;return[...w(s.scope),...w(s.policy),s.epoch,...w(s.root),...w(s.nullifier),s.amount,...Array.from({length:5},(_,i)=>String(Number.parseInt(s.recipient.slice(i*8,i*8+8),16)))];}
/** @param {unknown} raw @returns {DeviceExitQuoteEitherV2} */
export function normalizeDeviceExitQuoteEitherV2(raw){need(raw!==null&&typeof raw==='object');const d=Object.getOwnPropertyDescriptor(raw,'version');need(d&&Object.hasOwn(d,'value'));if(d.value===1)return V1.normalizeDeviceExitQuoteV1(raw);const q=exact(raw,['version','profile','origin','pairingId','devicePublicKey','quoteId','expiresAt','parentJobId','nativeBindingSHA256','rootId','noteRevision','noteRole','nullifierSpent','statement','path','poolTerms','observed']);need(q.version===2&&q.profile==='LIANUM_DEVICE_ORIGINAL_W39_QUOTE_PRIVATE_V2'&&(q.noteRole==='deposit'||q.noteRole==='change'||q.noteRole==='recovery'));const v=V1.normalizeDeviceExitQuoteV1({...q,version:1,profile:'LIANUM_DEVICE_ORIGINAL_W39_QUOTE_V1',noteRole:q.noteRole==='deposit'?'change':q.noteRole});return freeze({...v,version:2,profile:q.profile,noteRole:q.noteRole});}
/** @param {unknown} raw @returns {DeviceExitStatusEitherV2} */
export function normalizeDeviceExitStatusEitherV2(raw){
 const outer=exact(raw,['jobId','stage','statement','consentFields','observation','errorCode','authorizationSHA256']);
 const fields=exact(outer.consentFields,['parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','noteRevision','noteRole','statement','witnessSHA256','proofSHA256','publicInputsSHA256']);
 const role=fields.noteRole;if(role!=='deposit')return V1.normalizeDeviceExitStatusV1(raw);
 const observation=outer.observation===null?null:exact(outer.observation,['profile','jobId','parentJobId','rootId','noteRole','commitment','nullifier','amount','recipient','transactionHash','blockHash','blockNumber','calldataSHA256','timestamp','domainCommitment']);
 const v=V1.normalizeDeviceExitStatusV1({...outer,consentFields:{...fields,noteRole:'change'},observation:observation===null?null:{...observation,noteRole:'change'}});
 need(observation===null||observation.noteRole==='deposit');
 return freeze({...v,consentFields:{...v.consentFields,noteRole:role},observation:v.observation===null?null:{...v.observation,noteRole:role}});
}
export {normalizeDeviceExitWitnessV1,deviceExitWitnessBytesV1,wipeDeviceExitWitnessV1} from './device-exit-consent-v1.mjs';
