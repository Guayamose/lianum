/** Fixed Native U intake. V1 S/observation and all proof artifacts stay original. */
import * as V1 from './device-reservation-consent-v1.mjs';
import {externalFlatExactV1 as exact} from './device-external-flat-note-v1.mjs';
import {normalizeExternalFlatGraphPrivateProofV2,externalFlatGraphPrivateDigestV2} from './device-external-flat-graph-v1.mjs';
function sha256(bytes){
 const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 need(bytes instanceof Uint8Array&&bytes.length<=8192);
 const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),W=new Uint32Array(64),padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64),view=new DataView(padded.buffer),rot=(v,n)=>(v>>>n)|(v<<(32-n));
 padded.set(bytes);padded[bytes.length]=128;view.setUint32(padded.length-4,bytes.length*8,false);
 try{for(let offset=0;offset<padded.length;offset+=64){for(let i=0;i<16;i++)W[i]=view.getUint32(offset+4*i,false);for(let i=16;i<64;i++){const x=W[i-15],y=W[i-2];W[i]=(W[i-16]+(rot(x,7)^rot(x,18)^(x>>>3))+W[i-7]+(rot(y,17)^rot(y,19)^(y>>>10)))>>>0;}
  let [a,b,c,d,e,f,g,h]=H;for(let i=0;i<64;i++){const t1=(h+(rot(e,6)^rot(e,11)^rot(e,25))+((e&f)^(~e&g))+K[i]+W[i])>>>0,t2=((rot(a,2)^rot(a,13)^rot(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}[a,b,c,d,e,f,g,h].forEach((x,i)=>H[i]=(H[i]+x)>>>0);
 }const result=new Uint8Array(32),out=new DataView(result.buffer);H.forEach((x,i)=>out.setUint32(i*4,x,false));return result;}finally{padded.fill(0);W.fill(0);H.fill(0);}
}

export const DEVICE_NATIVE_PRIVATE_RESERVATION_V2='LIANUM_DEVICE_ORIGINAL_U_PRIVATE_V2';
export const DEVICE_NATIVE_PRIVATE_U_PROOF_V2='ORIGINAL_NATIVE_DEVICE_U_PRIVATE_TRANSIT_V2';
const need=v=>{if(!v)throw Error('MOBILE_NATIVE_PRIVATE_U_INVALID');};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const names=['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt','binding','poolTerms','depositJobId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure'];
export function normalizeNativePrivateReservationConsentV2(raw){
 const q=exact(raw,[...names,'privateProof']);need(q.version===2&&q.profile===DEVICE_NATIVE_PRIVATE_RESERVATION_V2&&q.action==='PROVE_U'&&q.openingDisclosure==='ENCRYPTED_U_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT');
 const {privateProof,...base}=q,v=V1.normalizeDeviceReservationConsentV1({...base,version:1,profile:V1.DEVICE_RESERVATION_CONSENT_V1,openingDisclosure:V1.DEVICE_RESERVATION_DISCLOSURE_V1});
 const pp=exact(privateProof,['profile','recipient','resultRecipient','context','transcriptSHA256']);need(pp.profile===DEVICE_NATIVE_PRIVATE_U_PROOF_V2);
 const p=normalizeExternalFlatGraphPrivateProofV2({...pp,profile:'ORIGINAL_DEVICE_GRAPH_U_PRIVATE_TRANSIT_V2'});
 for(const [a,b]of [['scope','scope'],['policy','policy'],['asset','assetIdentity']])need(p.context.domain[a]===v.poolTerms[b]);
 return freeze({...v,version:2,profile:q.profile,openingDisclosure:q.openingDisclosure,privateProof:{...p,profile:pp.profile}});
}
export function normalizeDeviceReservationConsentEitherV2(raw){const d=raw&&Object.getOwnPropertyDescriptor(raw,'version');need(d&&Object.hasOwn(d,'value'));return d.value===2?normalizeNativePrivateReservationConsentV2(raw):V1.normalizeDeviceReservationConsentV1(raw);}
export function validateDeviceReservationConsentEitherFreshV2(raw,now=Date.now()){const c=normalizeDeviceReservationConsentEitherV2(raw);if(c.version===1)return V1.validateDeviceReservationConsentFreshV1(c,now);need(Number.isSafeInteger(now)&&c.expiresAt>now&&c.expiresAt<=now+15000);return c;}
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
export function deviceReservationConsentEitherMessageV2(raw){const c=normalizeDeviceReservationConsentEitherV2(raw);if(c.version===1)return V1.deviceReservationConsentMessageV1(c);const b=new TextEncoder().encode(canonical(c)),tag=new TextEncoder().encode('LIANUM_NATIVE_U_PERMISSION/2/full-consent-sha256');let digest;try{need(b.length<=8192);digest=sha256(b);const out=new Uint8Array(8+tag.length+32),view=new DataView(out.buffer);view.setUint32(0,tag.length,false);out.set(tag,4);view.setUint32(4+tag.length,32,false);out.set(digest,8+tag.length);return out;}finally{b.fill(0);digest?.fill(0);}}
export function nativePrivateReservationTranscriptBytesV2(raw){const c=normalizeNativePrivateReservationConsentV2(raw),{privateProof,...consent}=c;return new TextEncoder().encode(canonical({profile:privateProof.profile,consent,recipient:privateProof.recipient,resultRecipient:privateProof.resultRecipient,context:privateProof.context}));}
export const nativePrivateReservationDigestV2=externalFlatGraphPrivateDigestV2;
export function validateNativePrivateReservationWitnessV2(raw,witness){const c=validateDeviceReservationConsentEitherFreshV2(raw);need(c.version===2);let w,bytes,digest;try{bytes=nativePrivateReservationTranscriptBytesV2(c);digest=sha256(bytes);need(Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')===c.privateProof.transcriptSHA256);w=V1.normalizeDeviceReservationWitnessV1(witness);const proposal=Object.fromEntries(['scope','policy','asset','operationId','budget','fundingNotBefore','fundingValidUntil','settleBefore','nodes'].map(k=>[k,w.input[k]]));need(nativePrivateReservationDigestV2(proposal)===c.privateProof.context.proposalSHA256&&nativePrivateReservationDigestV2(w.envelopePreparation.capsuleOptions)===c.privateProof.context.capsuleOptionsSHA256&&nativePrivateReservationDigestV2(w.invoiceSignatures)===c.privateProof.context.invoiceSignaturesSHA256&&w.input.inputNote.value===c.privateProof.context.sourceAmount);return c;}finally{bytes?.fill(0);digest?.fill(0);V1.wipeDeviceReservationWitnessV1(w);}}
export {normalizeDeviceReservationWitnessV1,deviceReservationWitnessBytesV1,wipeDeviceReservationWitnessV1} from './device-reservation-consent-v1.mjs';
