/** Fixed TLS client for explicit READ consents only. No automatic signing,
 * retry, balance persistence, portfolio adoption or economic operation. */
import * as Crypto from 'expo-crypto';
import {normalizeDeviceDefiPositionDescriptorV1,normalizeDeviceDefiPositionAccessV1,normalizeDeviceDefiPositionReadV1,
 validateDeviceDefiPositionFreshV1,normalizeDeviceDefiPositionSignatureV1,normalizeDeviceDefiPositionObservationV1,
 validateDeviceDefiPositionHeadsFreshV1,deviceDefiPositionStateBytesV1,deviceDefiPositionTargetsV1}
 from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
const fail=()=>{throw Error('MOBILE_DEFI_POSITION_READ_REJECTED');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const observations=new WeakMap();
export function readDeviceDefiPositionObservationV1(value){
 const expiresAt=observations.get(value);if(expiresAt===undefined||Date.now()>=expiresAt)fail();
 validateDeviceDefiPositionHeadsFreshV1(value.positions);return value;
}
/** Display DATA only. The original review and head deadlines remain fixed;
 * closing a transport does not turn an accepted read into a spending grant. */
export function readDeviceDefiPositionObservationWindowV1(value){
 readDeviceDefiPositionObservationV1(value);const original=observations.get(value);
 const heads=value.positions.positions.flatMap(row=>[row.ownership,row.valuation]).filter(row=>row.status==='LIVE').map(row=>row.observed.observedAt+15000);
 return Object.freeze({issuedAt:original-15000,expiresAt:Math.min(original,...heads)});
}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export function createDeviceDefiPositionReadApiV1({descriptor,fetchImpl=globalThis.fetch}={}){
 const original=normalizeDeviceDefiPositionDescriptorV1(descriptor);if(typeof fetchImpl!=='function')fail();let closed=false;
 const accesses=new WeakMap(),reviews=new WeakMap(),controllers=new Set();
 function live(){if(closed)fail();}
 function scope(v){live();if(Object.keys(original).some(k=>v[k]!==original[k]))fail();return validateDeviceDefiPositionFreshV1(v);}
 async function post(path,payload){live();const controller=new AbortController();controllers.add(controller);let timer,reader;
  try{const target=original.origin+'/v1/mobile/defi-positions/'+path;
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('MOBILE_DEFI_POSITION_READ_TIMEOUT'));},15000);});
   return await Promise.race([(async()=>{const response=await fetchImpl(target,{method:'POST',headers:{Accept:'application/json',Origin:original.origin,'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});live();
    if(controller.signal.aborted||!response.ok||response.redirected||response.url&&response.url!==target||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))fail();
    const length=response.headers.get('content-length');if(length!==null&&(/^(0|[1-9][0-9]{0,5})$/.exec(length)?.[0]!==length||Number(length)>65536))fail();
    if(!response.body||typeof response.body.getReader!=='function')fail();reader=response.body.getReader();const bytes=new Uint8Array(65536);let used=0;
    try{for(;;){const part=await reader.read();live();if(controller.signal.aborted)fail();if(part.done)break;if(!(part.value instanceof Uint8Array)||used+part.value.byteLength>bytes.length)fail();bytes.set(part.value,used);used+=part.value.byteLength;}
     if(length!==null&&used!==Number(length))fail();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,used)));}finally{bytes.fill(0);}
   })(),timeout]);
  }finally{clearTimeout(timer);controller.abort();controllers.delete(controller);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
 return Object.freeze({
  async challenge(){if(arguments.length!==0)fail();const v=normalizeDeviceDefiPositionAccessV1(await post('challenges',{}));scope(v);accesses.set(v,{consumed:false});return v;},
  async openReview(access,signature){if(arguments.length!==2)fail();const row=accesses.get(access);if(!row||row.consumed)fail();scope(access);signature=normalizeDeviceDefiPositionSignatureV1(signature);row.consumed=true;
   const v=normalizeDeviceDefiPositionReadV1(await post('reviews',{access,signature}));scope(v);if(v.accessChallengeId!==access.challengeId)fail();reviews.set(v,{consumed:false});return v;},
  async read(review,signature){if(arguments.length!==2)fail();const row=reviews.get(review);if(!row||row.consumed)fail();scope(review);signature=normalizeDeviceDefiPositionSignatureV1(signature);row.consumed=true;
   const v=normalizeDeviceDefiPositionObservationV1(await post('observations',{review,signature}));scope(review);if(Object.keys(original).some(k=>v[k]!==original[k])||v.reviewId!==review.challengeId||v.observationSHA256!==review.observationSHA256||!same(deviceDefiPositionTargetsV1(v.positions),review.targets))fail();
   validateDeviceDefiPositionHeadsFreshV1(v.positions);const digest=hex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,deviceDefiPositionStateBytesV1(v.positions))));scope(review);
   if(digest!==v.observationSHA256)fail();observations.set(v,review.expiresAt);return v;},
  close(){if(arguments.length!==0)fail();closed=true;for(const controller of controllers)controller.abort();return{closed:true};},
 });
}
