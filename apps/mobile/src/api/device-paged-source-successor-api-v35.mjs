/** Dedicated storage-succession SDK. A provisioning reply remains public DATA;
 * only the separate original encrypted graph reply can hand off custody. */
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import * as S from '../../../../packages/mobile-protocol/src/device-paged-source-successor-v35.mjs';
const clients=new WeakMap(),challenges=new WeakMap(),replies=new WeakMap();
const need=(value,code='MOBILE_PAGED_SOURCE_SUCCESSOR_ORIGINAL_SDK')=>{if(!value)throw Error(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const rejectionCodes=new Map([
 ['PAGED_MIXED_SUCCESSOR_WALLET_QUOTA','MOBILE_PAGED_SOURCE_SUCCESSOR_WALLET_QUOTA'],
 ['MIXED_SUCCESSOR_SIGNED_WALLET_QUOTA','MOBILE_PAGED_SOURCE_SUCCESSOR_WALLET_QUOTA'],
 ['PAGED_MIXED_SUCCESSOR_NOT_SETTLED','MOBILE_PAGED_SOURCE_SUCCESSOR_NOT_SETTLED'],
 ['PAGED_MIXED_SUCCESSOR_BUSY','MOBILE_PAGED_SOURCE_SUCCESSOR_BUSY'],
]);
function rejectionCode(status,text){
 if(status!==403)return 'MOBILE_PAGED_SOURCE_SUCCESSOR_UNAVAILABLE';
 try{const value=JSON.parse(text);if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'error')&&typeof value.error==='string')return rejectionCodes.get(value.error)??'MOBILE_PAGED_SOURCE_SUCCESSOR_UNAVAILABLE';}catch{}
 return 'MOBILE_PAGED_SOURCE_SUCCESSOR_UNAVAILABLE';
}
export function createDevicePagedSourceSuccessorApiV35({descriptor:rawDescriptor,transport,fetchImpl}){
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor);need(typeof fetchImpl==='function'&&transport?.type==='ANDROID_PINNED_TLS_V1');let closed=false;const active=new Set(),work=new Set();let closing;
 const live=()=>need(!closed&&P.devicePagedNowV3()<descriptor.deadlineMs);
 function track(fn){live();const pending=Promise.resolve().then(fn);work.add(pending);pending.finally(()=>work.delete(pending)).catch(()=>{});return pending;}
 async function post(path,body){live();const controller=new AbortController();active.add(controller);const timer=setTimeout(()=>controller.abort(),300000);try{const response=await fetchImpl(descriptor.origin+'/v1/mobile/paged-owner/source-successor/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-lianum-paged-pairing-id':descriptor.pairingId},body:JSON.stringify(body),signal:controller.signal});live();const text=await response.text();live();need(text.length<=65536,'MOBILE_PAGED_SOURCE_SUCCESSOR_UNAVAILABLE');need(response.status===200,rejectionCode(response.status,text));return JSON.parse(text);}finally{clearTimeout(timer);active.delete(controller);}}
 const api=Object.freeze({
  challenge(raw){const request=S.normalizeDevicePagedSourceSuccessorRequestV35(raw);return track(async()=>{const challenge=S.normalizeDevicePagedSourceSuccessorChallengeV35(await post('challenges',{request}),descriptor);need(same(request,challenge.request));await P.awaitDevicePagedIssuedTimeV3(challenge.issuedAt);live();S.validateDevicePagedSourceSuccessorChallengeFreshV35(challenge,descriptor);challenges.set(challenge,{api,descriptor,live});return challenge;});},
  submit(raw,signature){const held=challenges.get(raw);need(held?.api===api);const consent=S.validateDevicePagedSourceSuccessorChallengeFreshV35(raw,descriptor);need(typeof signature==='string'&&/^[0-9a-f]{128}$/.test(signature));challenges.delete(raw);return track(async()=>{S.validateDevicePagedSourceSuccessorChallengeFreshV35(consent,descriptor);const reply=S.normalizeDevicePagedSourceSuccessorReplyV35(await post('requests',{consent,signature}),descriptor,consent);need(same(reply.connection.transport,transport),'MOBILE_PAGED_SOURCE_SUCCESSOR_TLS_CHANGED');replies.set(reply,{api,descriptor,challenge:consent,live});return reply;});},
  close(){if(closing)return closing;closed=true;for(const controller of active)controller.abort();return closing=Promise.allSettled([...work]).then(()=>undefined);}
 });clients.set(api,{live});return api;
}
export function readDevicePagedSourceSuccessorChallengeV35(raw){const value=challenges.get(raw);need(value&&clients.has(value.api));value.live();S.validateDevicePagedSourceSuccessorChallengeFreshV35(raw,value.descriptor);return{challenge:raw,descriptor:value.descriptor};}
export function readDevicePagedSourceSuccessorProvisionV35(raw){const value=replies.get(raw);need(value&&clients.has(value.api));value.live();return{reply:raw,challenge:value.challenge,descriptor:value.descriptor};}
