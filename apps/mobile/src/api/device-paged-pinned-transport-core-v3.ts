import {Platform} from 'react-native';
import bridge from '../native-specs/NativeLianumPagedPinnedTls.ts';
function fail(code:string):never{throw Error(code);}
export type Transport={fetchImpl:typeof fetch;close:()=>Promise<void>};
type Pin={certificatePEM:string;certificateSHA256:string};
export type Group='PAGED'|'PAGED_SOURCE_RENEWAL_V4'|'PAGED_EXPIRED_WITHDRAWAL_V10'|'EXTERNAL_FLAT'|'POSITIONS'|'SEPOLIA_DEFI_V7';
function routes(group:Group):Map<string,number>{
 const result=new Map<string,number>();
 if(group==='PAGED')for(const path of ['/v1/mobile/paged-owner/challenges','/v1/mobile/paged-owner/operations','/v1/mobile/paged-owner/graph/pairing','/v1/mobile/paged-owner/graph/challenges','/v1/mobile/paged-owner/graph/operations'])result.set(path,4*1024*1024);
 else if(group==='PAGED_SOURCE_RENEWAL_V4')for(const route of ['challenges','renewals'])result.set('/v1/mobile/paged-owner/source-renewal/'+route,8192);
 else if(group==='PAGED_EXPIRED_WITHDRAWAL_V10')for(const route of ['challenges','requests'])result.set('/v1/mobile/paged-owner/expired-withdrawal/'+route,8192);
 else if(group==='POSITIONS')for(const path of ['challenges','reviews','observations'])result.set('/v1/mobile/defi-positions/'+path,8192);
 else if(group==='SEPOLIA_DEFI_V7')for(const route of ['challenges','defi-proposals','defi-reviews','defi-read-review','defi-authorizations','reviews','private-operations','operations','status','financial-submit','financial-observe','withdrawal-review','withdrawal-arm','redeem-submit'])result.set('/v1/mobile/sepolia-defi-shares/'+route,route==='private-operations'?16384:8192);
 else{
  for(const family of ['external-flat','external-flat-share'])for(const route of ['challenges','reviews','operations','private-operations','status'])result.set('/v1/mobile/'+family+'/'+route,route==='private-operations'?16384:8192);
  for(const route of ['challenges','preparations','reviews','operations','private-operations','status','output-quotes','output-reviews','output-operations','private-output-operations'])result.set('/v1/mobile/external-flat/source-graph/'+route,65536);
  for(const relation of ['morpho-blue','aave-static','metamorpho'])for(const route of ['challenges','reviews','operations','status'])result.set('/v1/mobile/external-flat/'+relation+'/'+route,8192);
 }
 return result;
}

// The fixed SDKs need text() or getReader(). Native has already bounded and
// validated the exact UTF-8 bytes. Preserve its real response headers so the
// ExternalFlat SDK performs its original length/type/stream checks on them.
function sdkResponse(reply:{status:number;body:string;contentType:string|null;contentLength:string|null},url:string):Response{
 let used=false,locked=false,done=false;const bytes=new TextEncoder().encode(reply.body),headers=new Headers();
 if(reply.contentType!==null)headers.set('Content-Type',reply.contentType);
 if(reply.contentLength!==null)headers.set('Content-Length',reply.contentLength);
 const cancel=async()=>{done=true;bytes.fill(0);};
 const body={getReader(){if(used||locked)fail('MOBILE_PAGED_TLS_RESPONSE_USED');used=true;locked=true;return{
  async read(){if(done)return{done:true,value:undefined};const value=Uint8Array.from(bytes);done=true;bytes.fill(0);return{done:false,value};},
  cancel,releaseLock(){locked=false;}
 };},cancel};
 return {status:reply.status,statusText:'',ok:reply.status>=200&&reply.status<300,redirected:false,url,type:'basic',headers,body,get bodyUsed(){return used;},
  async text(){if(used)fail('MOBILE_PAGED_TLS_RESPONSE_USED');used=true;try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}finally{bytes.fill(0);done=true;}}
 } as unknown as Response;
}

export async function createDevicePagedPinnedTransportCoreV3(group:Group,origin:string,deadlineMs:number,pin:Pin,signal?:AbortSignal,pairingId=''):Promise<Transport>{
 const native=bridge;
 if(Platform.OS!=='android'||!native?.open||!native?.post||!native?.cancel||!native?.close)fail('MOBILE_PAGED_TLS_BRIDGE_REQUIRED');
 if(typeof pin.certificatePEM!=='string'||pin.certificatePEM.length>32768||typeof pin.certificateSHA256!=='string'||!/^[a-f0-9]{64}$/.test(pin.certificateSHA256))fail('MOBILE_PAGED_TLS_PROFILE');
 if(signal?.aborted)fail('MOBILE_PAGED_TLS_CANCELLED');
 const session:string=await native.open(group,origin,pin.certificatePEM,pin.certificateSHA256,deadlineMs,pairingId);
 let closed=false,closing:Promise<void>|undefined,sequence=0;
 const close=():Promise<void>=>{if(closing)return closing;closed=true;signal?.removeEventListener('abort',abort);return closing=Promise.resolve(native.close(session)).then(()=>undefined);};
 const abort=()=>{void close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted){await close();fail('MOBILE_PAGED_TLS_CANCELLED');}
 const allowed=routes(group),replyLimit=group==='PAGED'?4*1024*1024:65536;
 const fetchImpl=(async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
  if(closed||Date.now()>=deadlineMs)fail('MOBILE_PAGED_TLS_CLOSED');
  if(typeof input!=='string'||!init||init.method!=='POST'||typeof init.body!=='string')fail('MOBILE_PAGED_TLS_REQUEST');
  const url=new URL(input);if(url.origin!==origin||url.search||url.hash||url.username||url.password||!allowed.has(url.pathname)||input!==origin+url.pathname||new TextEncoder().encode(init.body).length>allowed.get(url.pathname)!)fail('MOBILE_PAGED_TLS_REQUEST');
  const actualHeaders=new Headers(init.headers),expectedHeaders:Record<string,string>=(group==='PAGED'||group==='PAGED_SOURCE_RENEWAL_V4'||group==='PAGED_EXPIRED_WITHDRAWAL_V10')?{'Content-Type':'application/json','x-lianum-paged-pairing-id':pairingId}:{Accept:'application/json',Origin:origin,'Content-Type':'application/json'};
  if(group==='SEPOLIA_DEFI_V7'){
   expectedHeaders['x-lianum-defi-pairing-id']=pairingId;
   if(url.pathname==='/v1/mobile/sepolia-defi-shares/reviews'){
    const reference=JSON.parse(init.body).reference;
    if(typeof reference!=='string'||!/^[0-9a-f]{64}$/.test(reference))fail('MOBILE_PAGED_TLS_REQUEST');
    expectedHeaders['x-lianum-defi-review-reference']=reference;
   }
  }
  if([...actualHeaders.keys()].length!==Object.keys(expectedHeaders).length||Object.entries(expectedHeaders).some(([key,value])=>actualHeaders.get(key)!==value))fail('MOBILE_PAGED_TLS_REQUEST');
  const requestId='request-'+(++sequence),requestSignal=init.signal;
  if(sequence>999999999||requestSignal?.aborted)fail('MOBILE_PAGED_TLS_CANCELLED');
  const cancel=()=>{native.cancel(session,requestId);};requestSignal?.addEventListener('abort',cancel,{once:true});
  try{
   if(requestSignal?.aborted)fail('MOBILE_PAGED_TLS_CANCELLED');
   const reply=await native.post(session,requestId,url.pathname,init.body);
   if(closed||signal?.aborted||requestSignal?.aborted)fail('MOBILE_PAGED_TLS_CANCELLED');
   if(!reply||!Number.isInteger(reply.status)||reply.status<100||reply.status>599||typeof reply.body!=='string'||new TextEncoder().encode(reply.body).length>replyLimit||reply.contentType!==null&&typeof reply.contentType!=='string'||reply.contentLength!==null&&typeof reply.contentLength!=='string')fail('MOBILE_PAGED_TLS_UNAVAILABLE');
   return sdkResponse(reply,input);
  }finally{requestSignal?.removeEventListener('abort',cancel);}
 }) as typeof fetch;
 return {fetchImpl,close};
}


// A short original pinned transport, never a financial V3 connection. The
// higher custody constructor validates the SourceToken before issuing it.
const sourceRenewalTransportsV4=new WeakMap<object,{sourceToken:object;transport:Transport;closed:boolean}>();
export async function createDevicePagedSourceRenewalPinnedTransportCoreV4(profile:{descriptor:any;transport:Pin},sourceToken:object,signal?:AbortSignal):Promise<Readonly<{close:()=>Promise<void>}>>{
 const transport=await createDevicePagedPinnedTransportCoreV3('PAGED_SOURCE_RENEWAL_V4',profile.descriptor.origin,Date.now()+60000,profile.transport,signal,profile.descriptor.pairingId);
 const held={sourceToken,transport,closed:false},handle=Object.freeze({async close(){held.closed=true;sourceRenewalTransportsV4.delete(handle);await transport.close();}});sourceRenewalTransportsV4.set(handle,held);return handle;
}
export function readOriginalDevicePagedSourceRenewalTransportCoreV4(handle:object,sourceToken:object):Transport{
 if(arguments.length!==2)fail('MOBILE_PAGED_SOURCE_RECOVERY_TRANSPORT');const own=sourceRenewalTransportsV4.get(handle);if(!own||own.sourceToken!==sourceToken||own.closed)fail('MOBILE_PAGED_SOURCE_RECOVERY_TRANSPORT');return own.transport;
}

const expiredWithdrawalTransportsV10=new WeakMap<object,{sourceToken:object;transport:Transport;closed:boolean}>();
export async function createDevicePagedExpiredWithdrawalTransportCoreV10(profile:{descriptor:any;transport:Pin},sourceToken:object,signal?:AbortSignal):Promise<Readonly<{close:()=>Promise<void>}>>{
 const Vault=await import('../custody/device-paged-note-vault-v3.ts');const scope=await Vault.readDevicePagedSourceRecoveryScopeV4(sourceToken);
 if(JSON.stringify(scope.descriptor)!==JSON.stringify(profile.descriptor))fail('MOBILE_PAGED_EXPIRED_WITHDRAWAL_TRANSPORT');
 const transport=await createDevicePagedPinnedTransportCoreV3('PAGED_EXPIRED_WITHDRAWAL_V10',profile.descriptor.origin,Date.now()+60000,profile.transport,signal,profile.descriptor.pairingId);
 const held={sourceToken,transport,closed:false},handle=Object.freeze({async close(){held.closed=true;expiredWithdrawalTransportsV10.delete(handle);await transport.close();}});
 try{await Vault.assertDevicePagedSourceRecoveryTokenV4(sourceToken);expiredWithdrawalTransportsV10.set(handle,held);return handle;}catch(error){await transport.close();throw error;}
}
export function readOriginalDevicePagedExpiredWithdrawalTransportCoreV10(handle:object,sourceToken:object):Transport{
 const own=expiredWithdrawalTransportsV10.get(handle);if(!own||own.sourceToken!==sourceToken||own.closed)fail('MOBILE_PAGED_EXPIRED_WITHDRAWAL_TRANSPORT');return own.transport;
}
