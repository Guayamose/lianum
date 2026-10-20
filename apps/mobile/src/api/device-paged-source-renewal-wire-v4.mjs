/** Dedicated original READ_RECOVER SDK. No arbitrary transport callback,
 * retained DATA permission or legacy financial deadline is accepted here. */
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import * as S from '@lianum/mobile-protocol/device/paged-source-renewal-v4';
import {devicePagedChannelSourceBindingDataV4} from '@lianum/mobile-protocol/device/paged-channel-lease-v4';
import {normalizeOriginalAccountSignatureV2} from '../../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import * as Crypto from './device-paged-graph-crypto-provider-v3.ts';
import {createDevicePagedGraphReplyRecipientV3,closeDevicePagedGraphReplyRecipientV3,openDevicePagedSourceRenewalReplyV4} from './device-paged-graph-transit-v3.mjs';
import {readOriginalDevicePagedSourceRenewalTransportCoreV4} from './device-paged-pinned-transport-core-v3.ts';
const clients=new WeakMap(),challenges=new WeakMap(),replies=new WeakMap(),unconfirmed=new WeakMap();
const need=ok=>{if(!ok)throw Error('MOBILE_PAGED_SOURCE_RENEWAL_ORIGINAL_SDK');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function newIntent(){const bytes=await Crypto.getRandomBytesAsync(16);try{need(bytes instanceof Uint8Array&&bytes.length===16);return'source-channel-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}finally{bytes?.fill(0);}}
export async function createDevicePagedSourceRenewalWireV4(raw){
 need(arguments.length===1);const input=P.pagedOwnerExactV3(raw,['sourceToken','transport','descriptor','guard']),sourceToken=input.sourceToken,descriptor=P.normalizeDevicePagedDescriptorV3(input.descriptor),transport=readOriginalDevicePagedSourceRenewalTransportCoreV4(input.transport,sourceToken);need(typeof input.guard==='function');
 // The callback can only revoke this original pinned channel; it cannot
 // replace TLS, construct a challenge or issue an authenticated reply.
 await input.guard();
 const state={sourceToken,descriptor,guard:input.guard,closed:false,busy:false,handles:new Set(),controllers:new Set(),work:new Set()};let api,closeWork;
 const live=()=>need(!state.closed);
 const current=async()=>{live();await input.guard();live();readOriginalDevicePagedSourceRenewalTransportCoreV4(input.transport,sourceToken);live();};
 function track(fn){live();need(!state.busy);state.busy=true;const task=Promise.resolve().then(fn);state.work.add(task);task.finally(()=>{state.busy=false;state.work.delete(task);}).catch(()=>{});return task;}
 async function post(path,body){await current();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300000);state.controllers.add(controller);
  try{const response=await transport.fetchImpl(descriptor.origin+'/v1/mobile/paged-owner/source-renewal/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-lianum-paged-pairing-id':descriptor.pairingId},body:JSON.stringify(body),signal:controller.signal});await current();need(response.status===200);const text=await response.text();await current();need(typeof text==='string'&&new TextEncoder().encode(text).length<=65536);return JSON.parse(text);}
  catch(error){if(path==='renewals'){const failure=Error('MOBILE_PAGED_SOURCE_RENEWAL_RESPONSE_UNCONFIRMED');unconfirmed.set(failure,{api});throw failure;}throw error;}
  finally{clearTimeout(timer);state.controllers.delete(controller);}
 }
 async function challenge(action,pending){await current();let handle;
  try{const intentId=pending?.intentId??await newIntent();await current();handle=await createDevicePagedGraphReplyRecipientV3(intentId);state.handles.add(handle);const request=S.normalizeDevicePagedSourceRenewalRequestDataV4({profile:S.DEVICE_PAGED_SOURCE_RENEWAL_REQUEST_V4,action,sourceBinding:devicePagedChannelSourceBindingDataV4(descriptor),intentId,expectedGeneration:pending?.expectedGeneration??null,expectedLeaseId:pending?.expectedLeaseId??null,replyPublicKey:handle.publicKey},descriptor),c=S.normalizeDevicePagedSourceRenewalChallengeDataV4(await post('challenges',request),descriptor);need(same(c.request,request));await P.awaitDevicePagedIssuedTimeV3(c.issuedAt);await current();S.validateDevicePagedSourceRenewalChallengeFreshV4(c,descriptor);challenges.set(c,{api,handle,used:false});return c;}
  catch(error){if(handle){state.handles.delete(handle);closeDevicePagedGraphReplyRecipientV3(handle);}throw error;}
 }
 api=Object.freeze({descriptor,
  prepare(action,pending){need(['READ_CHANNEL_STATE','READ_RENEWAL_INTENT','RENEW_CHANNEL'].includes(action));return track(()=>challenge(action,pending));},
  retryNotIssuedIntent(originalReply){return track(async()=>{const held=replies.get(originalReply);need(held?.api===api&&!held.retryUsed);const accepted=await readDevicePagedSourceRenewalWireReplyV4(originalReply,sourceToken);need(accepted.data.intentState==='NOT_ISSUED');held.retryUsed=true;const request=accepted.challenge.request;return challenge('RENEW_CHANNEL',{intentId:request.intentId,expectedGeneration:request.expectedGeneration,expectedLeaseId:request.expectedLeaseId});});},
  submit(originalChallenge,rawSignature){const own=challenges.get(originalChallenge);need(own?.api===api&&!own.used);own.used=true;challenges.delete(originalChallenge);const c=S.validateDevicePagedSourceRenewalChallengeFreshV4(originalChallenge,descriptor),signature=normalizeOriginalAccountSignatureV2(rawSignature);
   return track(async()=>{try{await current();S.validateDevicePagedSourceRenewalChallengeFreshV4(c,descriptor);const envelope=P.pagedOwnerExactV3(await post('renewals',{challenge:c,signature}),['profile','ciphertext']);need(envelope.profile===S.DEVICE_PAGED_SOURCE_RENEWAL_REPLY_V4);S.validateDevicePagedSourceRenewalChallengeFreshV4(c,descriptor);const clear=await openDevicePagedSourceRenewalReplyV4(own.handle,descriptor,c,envelope.ciphertext);
    try{await current();const data=S.normalizeDevicePagedSourceRenewalReplyDataV4(clear,descriptor,c);await P.awaitDevicePagedIssuedTimeV3(data.issuedAt);await current();S.validateDevicePagedSourceRenewalReplyFreshV4(data,descriptor,c);const result=Object.freeze({data,challenge:c});replies.set(result,{api,retryUsed:false});await current();S.validateDevicePagedSourceRenewalReplyFreshV4(data,descriptor,c);return result;}finally{P.pagedOwnerWipeV3(clear);}
   }finally{state.handles.delete(own.handle);closeDevicePagedGraphReplyRecipientV3(own.handle);}});
  },
  isUnconfirmedReply(error){return !state.closed&&unconfirmed.get(error)?.api===api;},
  close(){if(closeWork)return closeWork;state.closed=true;for(const controller of state.controllers)controller.abort();for(const handle of state.handles)closeDevicePagedGraphReplyRecipientV3(handle);state.handles.clear();return closeWork=Promise.allSettled([...state.work]).then(()=>input.transport.close());}
 });clients.set(api,state);return api;
}
export async function readDevicePagedSourceRenewalWireChallengeV4(raw){
 need(arguments.length===1);const own=challenges.get(raw),state=own&&clients.get(own.api);need(own&&!own.used&&state&&!state.closed);await state.guard();need(!state.closed);return Object.freeze({descriptor:state.descriptor,challenge:S.validateDevicePagedSourceRenewalChallengeFreshV4(raw,state.descriptor)});
}
export async function readDevicePagedSourceRenewalWireReplyV4(raw,sourceToken){
 need(arguments.length===2);const own=replies.get(raw),state=own&&clients.get(own.api);need(state&&!state.closed&&state.sourceToken===sourceToken);await state.guard();need(!state.closed);S.validateDevicePagedSourceRenewalReplyFreshV4(raw.data,state.descriptor,raw.challenge);return raw;
}
