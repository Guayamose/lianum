/** Public tracking checkpoints only, never custody, balance or permission.
 * Immutable chunks precede a CAS pointer so a closed app keeps the last
 * complete review/reference and can observe the original server job. */
import * as Crypto from 'expo-crypto';
import {normalizeDeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import {normalizeDeviceSepoliaDefiReviewV4} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import {externalFlatExactV1 as exact,externalFlatHexV1 as hex} from '@lianum/mobile-protocol/device/source-note-v1';
const need=value=>{if(!value)throw Error('MOBILE_SEPOLIA_DEFI_ACTIVITY');};
const sha=async text=>Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export function createDeviceSepoliaDefiActivityV7({connection,storage}) {
  const profile=normalizeDeviceSepoliaDefiConnectionV7(connection),d=profile.descriptor,prefix='lianum.defi.activity.v7.'+d.pairingId;
  need(storage&&['get','set'].every(k=>typeof storage[k]==='function'));let work=Promise.resolve();
  const serial=fn=>{const next=work.then(fn);work=next.catch(()=>{});return next;};
  const key=action=>{need(['INVEST','REDEEM'].includes(action));return prefix+'.'+action;};
  function payload(raw) {
    const value=exact(raw,['profile','review','jobId']);need(value.profile==='DEVICE_SEPOLIA_DEFI_ACTIVITY_V7');
    const review=normalizeDeviceSepoliaDefiReviewV4(value.review);need(JSON.stringify(review.descriptor)===JSON.stringify(d)&&review.protocol===profile.protocol&&(profile.terms.underlyingReceiver===null||review.underlyingReceiver===profile.terms.underlyingReceiver)&&review.shareWithdrawalRecipient===profile.terms.shareWithdrawalRecipient);
    need(value.jobId===null||typeof value.jobId==='string');if(value.jobId!==null)hex(value.jobId);
    return Object.freeze({profile:value.profile,review,jobId:value.jobId});
  }
  async function read(action) {
    const raw=await storage.get(key(action));if(raw===null)return{raw,value:null,pointer:null};
    const pointer=exact(JSON.parse(raw),['sha256','parts','length']);hex(pointer.sha256);need(Number.isSafeInteger(pointer.length)&&pointer.length>0&&pointer.length<=8192&&pointer.parts===Math.ceil(pointer.length/1200));
    let text='';for(let index=0;index<pointer.parts;index++){const part=await storage.get(key(action)+'.'+pointer.sha256+'.'+index);need(typeof part==='string'&&part.length>0&&part.length<=1200);text+=part;}
    need(text.length===pointer.length&&await sha(text)===pointer.sha256&&await storage.get(key(action))===raw);
    const value=payload(JSON.parse(text));need(value.review.action===action);return{raw,value,pointer};
  }
  return Object.freeze({
    read:action=>serial(async()=>(await read(action)).value),
    save:(rawReview,jobId=null)=>serial(async()=>{
      const value=payload({profile:'DEVICE_SEPOLIA_DEFI_ACTIVITY_V7',review:rawReview,jobId}),action=value.review.action,previous=await read(action);
      if(previous.value){need(JSON.stringify(previous.value.review)===JSON.stringify(value.review));need(previous.value.jobId===null||previous.value.jobId===jobId);}
      const text=JSON.stringify(value);need(text.length<=8192);const digest=await sha(text),parts=Math.ceil(text.length/1200);
      for(let index=0;index<parts;index++){const chunkKey=key(action)+'.'+digest+'.'+index,part=text.slice(index*1200,(index+1)*1200),old=await storage.get(chunkKey);need(old===null||old===part);if(old===null)await storage.set(chunkKey,part);need(await storage.get(chunkKey)===part);}
      need(await storage.get(key(action))===previous.raw);const pointer=JSON.stringify({sha256:digest,parts,length:text.length});await storage.set(key(action),pointer);need(await storage.get(key(action))===pointer);return value;
    }),
  });
}
