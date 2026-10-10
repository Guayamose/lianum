/** Paged D26/W39 encryption only to the recipient bound by the device consent. */
import * as Crypto from './native-private-crypto-provider-v2.ts';
import {x25519} from '@noble/curves/ed25519.js';
import {hkdf} from '@noble/hashes/hkdf.js';
import {sha256} from '@noble/hashes/sha2.js';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {normalizeOriginalAccountSignatureV2} from '../../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
const encoder=new TextEncoder(),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const fail=()=>{throw Error('MOBILE_PAGED_PRIVATE_TRANSIT_REJECTED');};
const need=value=>{if(!value)fail();};
const prefix=Uint8Array.from([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x6e,0x03,0x21,0x00]);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function encode(bytes){let text='';for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2];
 text+=alphabet[a>>2]+alphabet[((a&3)<<4)|(b??0)>>4]+(b===undefined?'=':alphabet[((b&15)<<2)|(c??0)>>6])+(c===undefined?'=':alphabet[c&63]);}return text;}
function decode(value,maximum){need(typeof value==='string'&&value.length<=maximum&&value.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.exec(value)?.[0]===value);
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,out=new Uint8Array(value.length/4*3-padding);let pos=0;
 for(let i=0;i<value.length;i+=4){const a=alphabet.indexOf(value[i]),b=alphabet.indexOf(value[i+1]),c=value[i+2]==='='?0:alphabet.indexOf(value[i+2]),d=value[i+3]==='='?0:alphabet.indexOf(value[i+3]);need(a>=0&&b>=0&&c>=0&&d>=0);const n=(a<<18)|(b<<12)|(c<<6)|d;out[pos++]=(n>>16)&255;if(pos<out.length)out[pos++]=(n>>8)&255;if(pos<out.length)out[pos++]=n&255;}
 need(encode(out)===value);return out;}
export async function sealDevicePagedWitnessV3(rawConsent,rawSignature,rawWitness){
 need(arguments.length===3);const c=P.validateDevicePagedConsentFreshV3(rawConsent),signature=normalizeOriginalAccountSignatureV2(rawSignature);need(['deposit','withdraw'].includes(c.mode));let witness,secret,sender,recipient,shared,salt,iv,keyBytes,aad,clear,combined,der,bytes;
 try{witness=P.snapshotDevicePagedWitnessV3(rawWitness);bytes=encoder.encode(JSON.stringify(witness));need(hex(sha256(bytes))===c.witnessSHA256);const expected=P.assertDevicePagedPublicJoinV3(c),r=c.recipient;der=decode(r.recipientPublicKey,60);need(der.length===44&&prefix.every((b,i)=>der[i]===b));recipient=der.slice(12);secret=await Crypto.getRandomBytesAsync(32);P.validateDevicePagedConsentFreshV3(c);need(secret instanceof Uint8Array&&secret.length===32);sender=x25519.getPublicKey(secret);shared=x25519.getSharedSecret(secret,recipient);need(shared.some(b=>b!==0));const senderDer=new Uint8Array(44);senderDer.set(prefix);senderDer.set(sender,12);const authorization={kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,consentSHA256:hex(sha256(P.devicePagedPermissionMessageV3(c))),witnessSHA256:c.witnessSHA256};const header={profile:r.profile,relation:r.relation,role:r.role,jobId:r.jobId,recipientPublicKey:r.recipientPublicKey,senderPublicKey:encode(senderDer),authorization,publicInputsSHA256:hex(sha256(encoder.encode(JSON.stringify(expected))))};senderDer.fill(0);aad=encoder.encode(JSON.stringify(header));clear=encoder.encode(JSON.stringify({inputs:{profile:'ORIGINAL_DEVICE_PAGED_PRIVATE_INPUT_V3',consent:c,signature,witness},expectedPublicInputs:expected}));need(clear.length<=2*1024*1024);salt=await Crypto.getRandomBytesAsync(32);iv=await Crypto.getRandomBytesAsync(12);P.validateDevicePagedConsentFreshV3(c);need(salt instanceof Uint8Array&&salt.length===32&&iv instanceof Uint8Array&&iv.length===12);keyBytes=hkdf(sha256,shared,salt,aad,32);const key=await Crypto.AESEncryptionKey.import(keyBytes);P.validateDevicePagedConsentFreshV3(c);const sealed=await Crypto.aesEncryptAsync(clear,key,{nonce:{bytes:iv},tagLength:16,additionalData:aad});P.validateDevicePagedConsentFreshV3(c);combined=decode(await sealed.combined('base64'),4*Math.ceil((2*1024*1024+28)/3));P.validateDevicePagedConsentFreshV3(c);need(combined.length===clear.length+28&&iv.every((b,i)=>combined[i]===b));return{type:'flat-private-proof-inputs',...header,salt:encode(salt),iv:encode(iv),tag:encode(combined.subarray(combined.length-16)),ciphertext:encode(combined.subarray(12,combined.length-16))};
 }finally{P.pagedOwnerWipeV3(witness);for(const b of [bytes,secret,sender,recipient,shared,salt,iv,keyBytes,aad,clear,combined,der])b?.fill(0);}
}
