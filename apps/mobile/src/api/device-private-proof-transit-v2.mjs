/** Fixed D27 recipient encryption. Only the signed original worker key can
 * receive this bounded witness. No root key, RPC or caller crypto options. */
import * as Crypto from 'expo-crypto';
import {x25519} from '@noble/curves/ed25519.js';
import {hkdf} from '@noble/hashes/hkdf.js';
import {sha256} from '@noble/hashes/sha2.js';
import {normalizeExternalFlatConsentV1,normalizeExternalFlatSignatureV1,validateExternalFlatFreshV1,
  externalFlatPermissionMessageV1,externalFlatPrivateProofTranscriptBytesV2,externalFlatIntentPublicInputsV2,
  DEVICE_EXTERNAL_FLAT_PRIVATE_WALLET_V3,externalFlatPrivateWalletTranscriptBytesV3,externalFlatWalletPublicInputsV3,
  externalFlatWitnessV1,externalFlatWitnessBytesV1,externalFlatWipeV1}
  from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import * as Graph from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
const encoder=new TextEncoder(),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const fail=()=>{throw Error('MOBILE_PRIVATE_D27_TRANSIT_REJECTED');};
const need=value=>{if(!value)fail();};
const prefix=Uint8Array.from([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x6e,0x03,0x21,0x00]);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function encode(bytes){let text='';for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2];
 text+=alphabet[a>>2]+alphabet[((a&3)<<4)|(b??0)>>4]+(b===undefined?'=':alphabet[((b&15)<<2)|(c??0)>>6])+(c===undefined?'=':alphabet[c&63]);}return text;}
function decode(value,maximum){need(typeof value==='string'&&value.length<=maximum&&value.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.exec(value)?.[0]===value);
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,out=new Uint8Array(value.length/4*3-padding);let pos=0;
 for(let i=0;i<value.length;i+=4){const a=alphabet.indexOf(value[i]),b=alphabet.indexOf(value[i+1]),c=value[i+2]==='='?0:alphabet.indexOf(value[i+2]),d=value[i+3]==='='?0:alphabet.indexOf(value[i+3]);need(a>=0&&b>=0&&c>=0&&d>=0);const n=(a<<18)|(b<<12)|(c<<6)|d;out[pos++]=(n>>16)&255;if(pos<out.length)out[pos++]=(n>>8)&255;if(pos<out.length)out[pos++]=n&255;}
 need(encode(out)===value);return out;}
export async function sealOriginalDeviceDepositIntentWitnessV2(rawConsent,rawSignature,rawWitness){
 need(arguments.length===3);return sealFixedWitness(rawConsent,rawSignature,rawWitness,false);
}
export async function sealOriginalDeviceWalletNoteWitnessV3(rawConsent,rawSignature,rawWitness){
 need(arguments.length===3);return sealFixedWitness(rawConsent,rawSignature,rawWitness,true);
}
export async function sealOriginalDeviceGraphOutputWitnessV3(rawConsent,rawSignature,rawWitness){
 need(arguments.length===3);return sealFixedWitness(rawConsent,rawSignature,rawWitness,true,true);
}
async function sealFixedWitness(rawConsent,rawSignature,rawWitness,wallet,graph=false){
 const wrapper=graph?Graph.normalizeExternalFlatGraphOutputConsentV1(rawConsent):null,c=wrapper?wrapper.consent:normalizeExternalFlatConsentV1(rawConsent),signature=normalizeExternalFlatSignatureV1(rawSignature);
 need(wallet?['PROVE_D26','PROVE_W39'].includes(c.action)&&c.privateProof?.profile===DEVICE_EXTERNAL_FLAT_PRIVATE_WALLET_V3:c.action==='PROVE_D27'&&c.privateProof);
 const mode=wallet?(c.action==='PROVE_D26'?'deposit_balance':'withdraw_balance'):'deposit_intent';if(wallet)need(graph?c.privateProof.noteRole===wrapper.noteRole:c.privateProof.noteRole===null);validateExternalFlatFreshV1(c);
 let witness,bytes,secret,sender,recipient,shared,salt,iv,keyBytes,aad,clear,combined,der;
 try{
  need(hex(sha256(wallet?externalFlatPrivateWalletTranscriptBytesV3(c):externalFlatPrivateProofTranscriptBytesV2(c)))===c.privateProof.transcriptSHA256);
  witness=externalFlatWitnessV1(mode,rawWitness);bytes=externalFlatWitnessBytesV1(mode,witness);
  need(hex(sha256(bytes))===c.witnessSHA256);
  const expected=wallet?externalFlatWalletPublicInputsV3(mode,c.statement):externalFlatIntentPublicInputsV2(c.statement),r=c.privateProof.recipient;
  der=decode(r.recipientPublicKey,60);need(der.length===44&&prefix.every((b,i)=>der[i]===b));recipient=der.slice(12);
  secret=await Crypto.getRandomBytesAsync(32);validateExternalFlatFreshV1(c);need(secret instanceof Uint8Array&&secret.length===32);
  sender=x25519.getPublicKey(secret);shared=x25519.getSharedSecret(secret,recipient);need(shared.some(b=>b!==0));
  const senderDer=new Uint8Array(44);senderDer.set(prefix);senderDer.set(sender,12);
  const authorization={kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,
    consentSHA256:hex(sha256(wrapper?Graph.externalFlatGraphOutputPermissionMessageV1(wrapper):externalFlatPermissionMessageV1(c))),witnessSHA256:c.witnessSHA256};
  const header={profile:r.profile,relation:r.relation,role:r.role,jobId:r.jobId,recipientPublicKey:r.recipientPublicKey,
    senderPublicKey:encode(senderDer),authorization,publicInputsSHA256:hex(sha256(encoder.encode(JSON.stringify(expected))))};
  senderDer.fill(0);aad=encoder.encode(JSON.stringify(header));
  const text=JSON.stringify({inputs:{profile:wallet?'DEVICE_WALLET_NOTE_PRIVATE_WITNESS_INPUT_V3':'DEVICE_D27_PRIVATE_WITNESS_INPUT_V2',consent:wrapper??c,signature,witness},expectedPublicInputs:expected});
  need(text.length<=12288);clear=encoder.encode(text);need(clear.length<=12288);
  salt=await Crypto.getRandomBytesAsync(32);iv=await Crypto.getRandomBytesAsync(12);validateExternalFlatFreshV1(c);
  need(salt instanceof Uint8Array&&salt.length===32&&iv instanceof Uint8Array&&iv.length===12);
  keyBytes=hkdf(sha256,shared,salt,aad,32);const key=await Crypto.AESEncryptionKey.import(keyBytes);validateExternalFlatFreshV1(c);
  const sealed=await Crypto.aesEncryptAsync(clear,key,{nonce:{bytes:iv},tagLength:16,additionalData:aad});validateExternalFlatFreshV1(c);
  combined=decode(await sealed.combined('base64'),16424);validateExternalFlatFreshV1(c);
  need(combined.length===clear.length+28&&iv.every((b,i)=>combined[i]===b));
  return{type:'flat-private-proof-inputs',...header,salt:encode(salt),iv:encode(iv),
    tag:encode(combined.subarray(combined.length-16)),ciphertext:encode(combined.subarray(12,combined.length-16))};
 }finally{externalFlatWipeV1(witness);for(const ownedBytes of [bytes,secret,sender,recipient,shared,salt,iv,keyBytes,aad,clear,combined,der])ownedBytes?.fill(0);}
}
