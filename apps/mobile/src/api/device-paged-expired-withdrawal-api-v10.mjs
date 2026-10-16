/** Original pinned recovery SDK. Creating a broker cannot spend a note; its
 * later W39 needs a separate exact financial approval in the wallet. */
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as EW from '@lianum/mobile-protocol/device/paged-expired-withdrawal-v10';
import {normalizeDevicePagedExpiredWithdrawalConnectionReplyV10} from '@lianum/mobile-protocol/device/paged-expired-withdrawal-connection-v10';
import {normalizeOriginalAccountSignatureV2} from '../../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import {getRandomBytesAsync} from './device-paged-graph-crypto-provider-v3.ts';
import {readDevicePagedSourceRecoveryScopeV4,assertDevicePagedSourceRecoveryTokenV4} from '../custody/device-paged-note-vault-v3.ts';
import {readOriginalDevicePagedExpiredWithdrawalTransportCoreV10} from './device-paged-pinned-transport-core-v3.ts';
const clients=new WeakMap(),challenges=new WeakMap(),replies=new WeakMap();
const need=v=>{if(!v)throw Error('MOBILE_PAGED_EXPIRED_WITHDRAWAL_SDK');},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function createDevicePagedExpiredWithdrawalApiV10({sourceToken,transport}){
 const scope=await readDevicePagedSourceRecoveryScopeV4(sourceToken),descriptor=scope.descriptor;
 const original=readOriginalDevicePagedExpiredWithdrawalTransportCoreV10(transport,sourceToken),state={closed:false,busy:false,controllers:new Set(),work:new Set()};let api;
 const current=async()=>{need(!state.closed);await assertDevicePagedSourceRecoveryTokenV4(sourceToken);need(!state.closed);readOriginalDevicePagedExpiredWithdrawalTransportCoreV10(transport,sourceToken);};
 function run(fn){need(!state.closed&&!state.busy);state.busy=true;const work=Promise.resolve().then(fn);state.work.add(work);void work.finally(()=>{state.busy=false;state.work.delete(work);}).catch(()=>{});return work;}
 async function post(path,body){await current();const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),60000);state.controllers.add(abort);try{const response=await original.fetchImpl(descriptor.origin+'/v1/mobile/paged-owner/expired-withdrawal/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-lianum-paged-pairing-id':descriptor.pairingId},body:JSON.stringify(body),signal:abort.signal});await current();const text=await response.text();need(new TextEncoder().encode(text).length<=65536&&response.status===200);return JSON.parse(text);}finally{clearTimeout(timer);state.controllers.delete(abort);}}
 api=Object.freeze({descriptor,
  challenge(selection){return run(async()=>{await current();const random=await getRandomBytesAsync(32);let intentId;try{intentId=Array.from(random,b=>b.toString(16).padStart(2,'0')).join('');}finally{random.fill(0);}const request=EW.normalizeDevicePagedExpiredWithdrawalRequestV10({...selection,intentId}),consent=EW.normalizeDevicePagedExpiredWithdrawalConsentV10(await post('challenges',request));need(same(consent.sourceDescriptor,descriptor)&&same(consent.request,request));await P.awaitDevicePagedIssuedTimeV3(consent.issuedAt);await current();EW.validateDevicePagedExpiredWithdrawalConsentFreshV10(consent);challenges.set(consent,{api,used:false});return consent;});},
  submit(consent,rawSignature){return run(async()=>{const held=challenges.get(consent);need(held?.api===api&&!held.used);held.used=true;const checked=EW.validateDevicePagedExpiredWithdrawalConsentFreshV10(consent),signature=normalizeOriginalAccountSignatureV2(rawSignature);const raw=await post('requests',{consent:checked,signature});await current();let result;
   if(checked.request.action==='READ_TARGETS'){result=EW.normalizeDevicePagedExpiredWithdrawalReplyV10(raw);need(same(result.sourceDescriptor,descriptor));await P.awaitDevicePagedIssuedTimeV3(result.issuedAt);need(P.devicePagedWallNowV3()<result.expiresAt);for(const target of result.targets){if(checked.request.rootId!==null)need(target.rootId===checked.request.rootId&&target.revision===checked.request.revision);need(same(target.output,checked.request.output));}}
   else{result=normalizeDevicePagedExpiredWithdrawalConnectionReplyV10(raw);need(same(result.sourceDescriptor,descriptor)&&same(result.request,checked.request));}
   replies.set(result,{api,consent:checked});return result;});},
  close(){state.closed=true;for(const controller of state.controllers)controller.abort();return Promise.allSettled([...state.work]).then(()=>transport.close());}
 });clients.set(api,{...state,original:state,sourceToken,current});return api;
}
export async function readDevicePagedExpiredWithdrawalConsentV10(raw){const held=challenges.get(raw),state=held&&clients.get(held.api);need(held&&!held.used&&state&&!state.original.closed);await state.current();return EW.validateDevicePagedExpiredWithdrawalConsentFreshV10(raw);}
export async function readDevicePagedExpiredWithdrawalReplyV10(raw,sourceToken){const held=replies.get(raw),state=held&&clients.get(held.api);need(state&&!state.original.closed&&state.sourceToken===sourceToken);await state.current();if(held.consent.request.action==='READ_TARGETS')need(P.devicePagedWallNowV3()<raw.expiresAt);return raw;}
