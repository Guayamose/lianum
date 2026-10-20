/** Fixed device Paged routes. Only this live SDK instance brands replies. */
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {sha256} from '@noble/hashes/sha2.js';
const clients=new WeakMap(),consents=new WeakMap(),rows=new WeakMap(),statuses=new WeakMap();
const need=v=>{if(!v)throw Error('MOBILE_PAGED_ORIGINAL_SDK');};
const encoder=new TextEncoder(),base64Alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const hexDigest=bytes=>Array.from(sha256(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
function sealedLength(value,maximum){need(typeof value==='string'&&value.length>0&&value.length<=4*Math.ceil(maximum/3)&&value.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(value));const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,bytes=value.length/4*3-padding,last=base64Alphabet.indexOf(value[value.length-padding-1]);need(bytes>0&&bytes<=maximum&&last>=0&&(padding===0||padding===1&&(last&3)===0||padding===2&&(last&15)===0));return bytes;}
function historicalSealedPacket(consent,raw){const c=P.validateDevicePagedConsentFreshV3(consent);need(c.action==='PROVE_W39'&&c.mode==='withdraw'&&c.publicInputs.length===39);const p=P.pagedOwnerExactV3(raw,['type','profile','relation','role','jobId','recipientPublicKey','senderPublicKey','authorization','publicInputsSHA256','salt','iv','tag','ciphertext']);need(p.type==='flat-private-proof-inputs');for(const key of ['profile','relation','role','jobId','recipientPublicKey'])need(p[key]===c.recipient[key]);need(typeof p.senderPublicKey==='string'&&/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/.test(p.senderPublicKey)&&sealedLength(p.senderPublicKey,44)===44);const a=P.pagedOwnerExactV3(p.authorization,['kind','jobId','consentSHA256','witnessSHA256']);need(a.kind==='ORIGINAL_CONSENT_V1'&&a.jobId===c.jobId&&a.consentSHA256===hexDigest(P.devicePagedPermissionMessageV3(c))&&a.witnessSHA256===c.witnessSHA256);need(p.publicInputsSHA256===hexDigest(encoder.encode(JSON.stringify(P.assertDevicePagedPublicJoinV3(c)))));need(sealedLength(p.salt,32)===32&&sealedLength(p.iv,12)===12&&sealedLength(p.tag,16)===16);sealedLength(p.ciphertext,2*1024*1024);return{...p,authorization:a};}
export function createDevicePagedOwnerApiV3(input){need(arguments.length===1);const {descriptor:raw,fetchImpl}=P.pagedOwnerExactV3(input,['descriptor','fetchImpl']),descriptor=P.normalizeDevicePagedDescriptorV3(raw);need(typeof fetchImpl==='function');const state={closed:false,controllers:new Set(),work:new Set()};const live=()=>need(!state.closed&&P.devicePagedNowV3()<descriptor.deadlineMs);
 // A signed read can reconcile an old public-chain attempt. Allow that read
 // to finish without extending the consent lifetime or retrying any POST.
 const readTimeout=()=>P.DEVICE_OPERATION_REQUEST_MS_V41;
 // Proof challenges validate the original source and open the durable worker
 // before issuing their bounded consent. Receiving it may take longer.
 const challengeTimeout=()=>P.DEVICE_OPERATION_REQUEST_MS_V41;
 async function post(path,data,limit){
  live();const controller=new AbortController();state.controllers.add(controller);
  const started=Date.now(),action=data.consent?.action??data.action;let httpStatus=null,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},limit),run=(async()=>{
   const response=await fetchImpl(descriptor.origin+'/v1/mobile/paged-owner/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-lianum-paged-pairing-id':descriptor.pairingId},body:JSON.stringify(data),signal:controller.signal});
   httpStatus=response.status;live();const text=await response.text();live();need(text.length<=4*1024*1024);const result=JSON.parse(text);
   if(response.status===403&&result&&Object.getPrototypeOf(result)===Object.prototype&&Object.keys(result).length===1&&['PAGED_DEVICE_NOTE_EPOCH_CHANGED','PAGED_DEVICE_NOTE_EPOCH_TOO_SHORT'].includes(result.error))throw Error(result.error==='PAGED_DEVICE_NOTE_EPOCH_CHANGED'?'MOBILE_PAGED_NOTE_EPOCH_CHANGED':'MOBILE_PAGED_NOTE_EPOCH_TOO_SHORT');
   need(response.status===200);return result;
  })();
  state.work.add(run);
  try{return await run;}
  catch(error){
   // Never log request/reply bodies, credentials, keys or provider messages.
   console.warn('LIANUM_PAGED_REQUEST_FAILURE',JSON.stringify({path,action,elapsedMs:Date.now()-started,httpStatus,reason:timedOut?'TIMEOUT':state.closed?'CLOSED':httpStatus!==null?'REJECTED':'TRANSPORT'}));
   if(['MOBILE_PAGED_NOTE_EPOCH_CHANGED','MOBILE_PAGED_NOTE_EPOCH_TOO_SHORT'].includes(error?.message))throw error;
   throw Error('MOBILE_PAGED_SERVICE_UNAVAILABLE');
  }finally{clearTimeout(timer);state.controllers.delete(controller);state.work.delete(run);}
 }

 const api=Object.freeze({descriptor,async challenge(draft){const d=P.normalizeDevicePagedDraftV3(draft);const c=P.normalizeDevicePagedConsentV3(await post('challenges',d,challengeTimeout(d)));need(JSON.stringify(c.descriptor)===JSON.stringify(descriptor));for(const k of Object.keys(d))need(JSON.stringify(c[k])===JSON.stringify(d[k]));await P.awaitDevicePagedIssuedTimeV3((c.issuedAt??c.expiresAt-15000));live();P.validateDevicePagedConsentFreshV3(c);consents.set(c,{api});return c;},async submit(raw,signature,witness=null){live();const original=consents.get(raw);need(original?.api===api);consents.delete(raw);const c=P.validateDevicePagedConsentFreshV3(raw);need(typeof signature==='string'&&/^[0-9a-f]{128}$/.test(signature));let ciphertext=null;if(c.mode!==null){need(witness!==null);const {sealDevicePagedWitnessV3}=await import('./device-paged-owner-transit-v3.mjs');live();P.validateDevicePagedConsentFreshV3(c);ciphertext=await sealDevicePagedWitnessV3(c,signature,witness);live();P.validateDevicePagedConsentFreshV3(c);}else need(witness===null);const reply=await post('operations',{consent:c,signature,ciphertext},c.mode===null?readTimeout(c.action):P.DEVICE_OPERATION_REQUEST_MS_V41);if(c.action==='READ_STATE'){const s=P.normalizeDevicePagedStatusV3(reply);need(JSON.stringify(s.descriptor)===JSON.stringify(descriptor));await P.awaitDevicePagedIssuedTimeV3(s.issuedAt);live();P.validateDevicePagedStatusFreshV3(s);statuses.set(s,{api});return s;}const row=P.normalizeDevicePagedRowV3(reply);need(JSON.stringify(row.descriptor)===JSON.stringify(descriptor)&&row.jobId===c.jobId&&row.rootId===c.rootId&&row.revision===c.revision);rows.set(row,{api});return row;},async submitHistoricalSealedWithdrawalV16(raw,signature,sealedPacket){need(arguments.length===3);live();const original=consents.get(raw);need(original?.api===api);consents.delete(raw);const c=P.validateDevicePagedConsentFreshV3(raw);need(c.action==='PROVE_W39'&&c.mode==='withdraw'&&typeof signature==='string'&&/^[0-9a-f]{128}$/.test(signature));const ciphertext=historicalSealedPacket(c,sealedPacket);P.validateDevicePagedConsentFreshV3(c);const row=P.normalizeDevicePagedRowV3(await post('operations',{consent:c,signature,ciphertext},P.DEVICE_OPERATION_REQUEST_MS_V41));need(JSON.stringify(row.descriptor)===JSON.stringify(descriptor)&&row.mode==='withdraw'&&row.jobId===c.jobId&&row.rootId===c.rootId&&row.revision===c.revision&&row.witnessSHA256===c.witnessSHA256&&JSON.stringify(row.publicInputs)===JSON.stringify(c.publicInputs));rows.set(row,{api});return row;},async close(){state.closed=true;for(const c of state.controllers)c.abort();await Promise.allSettled([...state.work]);}});clients.set(api,state);return api;}
function same(map,value){const own=map.get(value);need(own&&clients.has(own.api)&&!clients.get(own.api).closed);return value;}
export function readDevicePagedConsentV3(value){return same(consents,value);}
export function readDevicePagedRowV3(value){return same(rows,value);}
export function readDevicePagedStatusV3(value){return P.validateDevicePagedStatusFreshV3(same(statuses,value));}
