/** Original owner channel. Public requests carry only scope and commitments. */
import {sha256} from '@noble/hashes/sha2.js';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import * as C from '../../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs';
import {normalizeDevicePagedSourceContinuationDataV4} from '../../../../packages/mobile-protocol/src/device-paged-source-continuation-v4.mjs';
import {createDevicePagedGraphReplyRecipientV3,closeDevicePagedGraphReplyRecipientV3,sealDevicePagedGraphCommandV3,openDevicePagedGraphReplyV3} from './device-paged-graph-transit-v3.mjs';
const clients=new WeakMap(),consents=new WeakMap(),observations=new WeakMap(),privateReplies=new WeakMap(),unconfirmedReplies=new WeakMap();
const need=v=>{if(!v)throw Error('MOBILE_PAGED_GRAPH_ORIGINAL_SDK');};
const digest=v=>Array.from(sha256(new TextEncoder().encode(JSON.stringify(v))),b=>b.toString(16).padStart(2,'0')).join('');
export function createDevicePagedGraphApiV3(raw){
 need(arguments.length===1);const input=P.pagedOwnerExactV3(raw,['descriptor','fetchImpl']),descriptor=P.normalizeDevicePagedDescriptorV3(input.descriptor);need(typeof input.fetchImpl==='function');
 const state={closed:false,work:new Set(),controllers:new Set(),handles:new Set()};let closeWork;const live=()=>need(!state.closed&&P.devicePagedNowV3()<descriptor.deadlineMs);
 function track(fn){live();const task=Promise.resolve().then(()=>{live();return fn();});state.work.add(task);task.finally(()=>state.work.delete(task)).catch(()=>{});return task;}
 async function post(path,body,timeout){live();const controller=new AbortController();state.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),timeout);try{const r=await input.fetchImpl(descriptor.origin+'/v1/mobile/paged-owner/graph/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-lianum-paged-pairing-id':descriptor.pairingId},body:JSON.stringify(body),signal:controller.signal});live();need(r.status===200);const text=await r.text();live();need(text.length<=4*1024*1024);return JSON.parse(text);}catch{const failure=Error('MOBILE_PAGED_GRAPH_SERVICE_UNAVAILABLE');if(path==='operations')unconfirmedReplies.set(failure,{api});throw failure;}finally{clearTimeout(timer);state.controllers.delete(controller);}}
 const api=Object.freeze({descriptor,
 // Classification permits a fresh read of this graph, never a replay or a
 // financial grant. Challenge, integrity and copied errors are not members.
 isUnconfirmedReply(error){return arguments.length===1&&!state.closed&&P.devicePagedNowV3()<descriptor.deadlineMs&&unconfirmedReplies.get(error)?.api===api;},
 pairing(){return track(async()=>{const response=await post('pairing',{},15000),hasNative=Object.hasOwn(response,'nativePreparation'),raw=P.pagedOwnerExactV3(response,['profile','descriptor',...(hasNative?['nativePreparation']:[])]);if(hasNative)raw.nativePreparation=C.normalizeDevicePagedNativePreparationV3(raw.nativePreparation,descriptor);need(raw.profile===C.DEVICE_PAGED_GRAPH_OWNER_V3);need(JSON.stringify(P.normalizeDevicePagedDescriptorV3(raw.descriptor))===JSON.stringify(descriptor));return Object.freeze(raw);});},
 challenge(action,graphId,jobId,rootId,revision,rawCommand){live();const captured=C.snapshotDevicePagedGraphCommandV3(rawCommand);return track(async()=>{let handle;try{handle=await createDevicePagedGraphReplyRecipientV3(jobId);live();state.handles.add(handle);const draft=C.normalizeDevicePagedGraphDraftV3({action,graphId,jobId,rootId,revision,commandSHA256:digest(captured),replyPublicKey:handle.publicKey}),c=C.normalizeDevicePagedGraphConsentV3(await post('challenges',draft,15000));live();need(JSON.stringify(c.descriptor)===JSON.stringify(descriptor));for(const k of Object.keys(draft))need(c[k]===draft[k]);await P.awaitDevicePagedIssuedTimeV3(c.expiresAt-15000);live();C.validateDevicePagedGraphConsentFreshV3(c);consents.set(c,{api,handle});return c;}catch(e){if(handle){state.handles.delete(handle);closeDevicePagedGraphReplyRecipientV3(handle);}throw e;}finally{P.pagedOwnerWipeV3(captured);}});},
 submit(rawConsent,signature,rawCommand){live();const original=consents.get(rawConsent);need(original?.api===api);consents.delete(rawConsent);const c=C.validateDevicePagedGraphConsentFreshV3(rawConsent),captured=C.snapshotDevicePagedGraphCommandV3(rawCommand);return track(async()=>{const controller=new AbortController();state.controllers.add(controller);try{need(digest(captured)===c.commandSHA256);const ciphertext=await sealDevicePagedGraphCommandV3(c,signature,captured,controller.signal);live();C.validateDevicePagedGraphConsentFreshV3(c);const raw=await post('operations',{consent:c,signature,ciphertext},C.devicePagedGraphProvesV3(c.action)?900000:['EXECUTE_NATIVE','READ_ECONOMIC_SETTLEMENT','READ_ECONOMIC_OPERATION','READ_PORTFOLIO'].includes(c.action)?60000:15000),reply=C.normalizeDevicePagedGraphReplyV3(raw),status=reply.status;need(JSON.stringify(status.descriptor)===JSON.stringify(descriptor)&&status.graphId===c.graphId&&status.rootId===c.rootId&&status.revision===c.revision);await P.awaitDevicePagedIssuedTimeV3(status.issuedAt,controller.signal);live();C.validateDevicePagedGraphPublicFreshV3(status);const decrypted=await openDevicePagedGraphReplyV3(original.handle,c,reply.ciphertext,controller.signal);try{live();C.validateDevicePagedGraphPublicFreshV3(status);observations.set(status,{api});const result=Object.freeze({status,private:decrypted});privateReplies.set(result,{api,consent:c});return result;}catch(e){P.pagedOwnerWipeV3(decrypted);throw e;}}finally{P.pagedOwnerWipeV3(captured);closeDevicePagedGraphReplyRecipientV3(original.handle);state.handles.delete(original.handle);state.controllers.delete(controller);}});},
 close(){if(closeWork)return closeWork;state.closed=true;for(const c of state.controllers)c.abort();for(const h of state.handles)closeDevicePagedGraphReplyRecipientV3(h);state.handles.clear();return closeWork=Promise.allSettled([...state.work]).then(()=>undefined);}
 });clients.set(api,state);return api;
}
const same=(map,value)=>{const original=map.get(value);need(original&&clients.has(original.api)&&!clients.get(original.api).closed);return value;};
export function readDevicePagedGraphConsentV3(value){return C.validateDevicePagedGraphConsentFreshV3(same(consents,value));}
export function readDevicePagedGraphStatusV3(value){return C.validateDevicePagedGraphPublicFreshV3(same(observations,value));}
export function readDevicePagedGraphReplyV3(value){same(privateReplies,value);readDevicePagedGraphStatusV3(value.status);return value;}

/** Same live SDK reply only; retained original consent is data, not a grant. */
export function readDevicePagedGraphReplyConsentV3(value){need(arguments.length===1);readDevicePagedGraphReplyV3(value);return privateReplies.get(value).consent;}

/** Only the same live original encrypted reply from the predecessor can be
 * read as a source handoff. Parsed/retained DATA cannot enter this reader. */
export function readDevicePagedSourceContinuationV4(rawReply){
 need(arguments.length===1);const reply=readDevicePagedGraphReplyV3(rawReply),consent=readDevicePagedGraphReplyConsentV3(rawReply),status=readDevicePagedGraphStatusV3(reply.status);
 need(consent.action==='READ_SOURCE_CONTINUATION_V4'&&consent.commandSHA256===digest({})&&['FULFILLED','RECOVERED'].includes(status.phase)&&!status.pending);
 const data=normalizeDevicePagedSourceContinuationDataV4(structuredClone(reply.private),status.descriptor);
 need(data.walletRootId===status.rootId&&data.predecessor.walletRootId===status.rootId&&data.predecessor.sourceRevision===String(status.revision));
 readDevicePagedGraphReplyV3(rawReply);return data;
}
