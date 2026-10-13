import {Platform} from 'react-native';
import bridge from '../native-specs/NativeLianumPagedPinnedTls';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {normalizeExternalFlatDescriptorV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {normalizeDeviceDefiPositionDescriptorV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
import {normalizePublicWalletConnectionV1} from '../state/public-connection-registry-v1.mjs';

export type DevicePagedConnectionProfileV3={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3';descriptor:any;transport:{type:'ANDROID_PINNED_TLS_V1';certificatePEM:string;certificateSHA256:string}};
function fail(code:string):never{throw Error(code);}
export function parseDevicePagedConnectionProfileV3(text:string):DevicePagedConnectionProfileV3{
 if(text.length>65536)fail('MOBILE_PAGED_TLS_PROFILE');
 const packet=P.pagedOwnerExactV3(JSON.parse(text),['format','descriptor','transport']);
 const transport=P.pagedOwnerExactV3(packet.transport,['type','certificatePEM','certificateSHA256']);
 if(packet.format!=='DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3'||transport.type!=='ANDROID_PINNED_TLS_V1'||typeof transport.certificatePEM!=='string'||transport.certificatePEM.length>32768||!transport.certificatePEM.includes('-----BEGIN CERTIFICATE-----')||typeof transport.certificateSHA256!=='string'||!/^[a-f0-9]{64}$/.test(transport.certificateSHA256))fail('MOBILE_PAGED_TLS_PROFILE');
 return {format:packet.format,descriptor:P.normalizeDevicePagedDescriptorV3(packet.descriptor),transport:Object.freeze({...transport})};
}
export async function readDevicePagedConnectionClipboardV3():Promise<string>{
 if(Platform.OS!=='android'||!bridge?.readConnectionProfile)fail('MOBILE_PAGED_TLS_BRIDGE_REQUIRED');
 const text=await bridge.readConnectionProfile('PAGED');if(typeof text!=='string')fail('MOBILE_PAGED_TLS_PROFILE');
 parseDevicePagedConnectionProfileV3(text);return text;
}
export async function readDeviceExternalFlatConnectionClipboardV1():Promise<string>{
 if(Platform.OS!=='android'||!bridge?.readConnectionProfile)fail('MOBILE_PAGED_TLS_BRIDGE_REQUIRED');
 return bridge.readConnectionProfile('EXTERNAL_FLAT');
}
export type DeviceDefiPositionsConnectionProfileV1={format:'DEVICE_DEFI_POSITIONS_CONNECTION_V1';descriptor:ReturnType<typeof normalizeDeviceDefiPositionDescriptorV1>;transport:{type:'ANDROID_PINNED_TLS_V1';certificatePEM:string;certificateSHA256:string}};
export function parseDeviceDefiPositionsConnectionProfileV1(text:string):DeviceDefiPositionsConnectionProfileV1{
 const value=normalizePublicWalletConnectionV1(text);if(value.kind!=='POSITIONS')fail('MOBILE_PAGED_TLS_PROFILE');
 return JSON.parse(value.profile) as DeviceDefiPositionsConnectionProfileV1;
}
export async function readDeviceDefiPositionsConnectionClipboardV1():Promise<string>{
 if(Platform.OS!=='android'||!bridge?.readConnectionProfile)fail('MOBILE_PAGED_TLS_BRIDGE_REQUIRED');
 const text=await bridge.readConnectionProfile('POSITIONS');parseDeviceDefiPositionsConnectionProfileV1(text);return text;
}
type Transport={fetchImpl:typeof fetch;close:()=>Promise<void>};
type Pin={certificatePEM:string;certificateSHA256:string};
type Group='PAGED'|'EXTERNAL_FLAT'|'POSITIONS';
function routes(group:Group):Map<string,number>{
 const result=new Map<string,number>();
 if(group==='PAGED')for(const path of ['/v1/mobile/paged-owner/challenges','/v1/mobile/paged-owner/operations','/v1/mobile/paged-owner/graph/pairing','/v1/mobile/paged-owner/graph/challenges','/v1/mobile/paged-owner/graph/operations'])result.set(path,4*1024*1024);
 else if(group==='POSITIONS')for(const path of ['challenges','reviews','observations'])result.set('/v1/mobile/defi-positions/'+path,8192);
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

/** Only this constructor-scoped original descriptor can supply either SDK. */
export async function createDevicePagedConnectionTransportV3(profile:DevicePagedConnectionProfileV3,signal?:AbortSignal):Promise<Transport>{
 const packet=parseDevicePagedConnectionProfileV3(JSON.stringify(profile)),descriptor=packet.descriptor;
 return createPinnedTransport('PAGED',descriptor.origin,descriptor.deadlineMs,packet.transport,signal);
}
export async function createDeviceExternalFlatPinnedTransportV1(input:{descriptor:unknown;certificatePEM:string;certificateSHA256:string;signal?:AbortSignal}):Promise<Transport>{
 const descriptor=normalizeExternalFlatDescriptorV1(input.descriptor);
 return createPinnedTransport('EXTERNAL_FLAT',descriptor.origin,Date.now()+9*60*60*1000,input,input.signal);
}
export async function createDeviceDefiPositionsPinnedTransportV1(profile:DeviceDefiPositionsConnectionProfileV1,signal?:AbortSignal):Promise<Transport>{
 const packet=parseDeviceDefiPositionsConnectionProfileV1(JSON.stringify(profile));
 return createPinnedTransport('POSITIONS',packet.descriptor.origin,Date.now()+9*60*60*1000,packet.transport,signal);
}
async function createPinnedTransport(group:Group,origin:string,deadlineMs:number,pin:Pin,signal?:AbortSignal):Promise<Transport>{
 const native=bridge;
 if(Platform.OS!=='android'||!native?.open||!native?.post||!native?.cancel||!native?.close)fail('MOBILE_PAGED_TLS_BRIDGE_REQUIRED');
 if(typeof pin.certificatePEM!=='string'||pin.certificatePEM.length>32768||typeof pin.certificateSHA256!=='string'||!/^[a-f0-9]{64}$/.test(pin.certificateSHA256))fail('MOBILE_PAGED_TLS_PROFILE');
 if(signal?.aborted)fail('MOBILE_PAGED_TLS_CANCELLED');
 const session:string=await native.open(group,origin,pin.certificatePEM,pin.certificateSHA256,deadlineMs);
 let closed=false,closing:Promise<void>|undefined,sequence=0;
 const close=():Promise<void>=>{if(closing)return closing;closed=true;signal?.removeEventListener('abort',abort);return closing=Promise.resolve(native.close(session)).then(()=>undefined);};
 const abort=()=>{void close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted){await close();fail('MOBILE_PAGED_TLS_CANCELLED');}
 const allowed=routes(group),replyLimit=group==='PAGED'?4*1024*1024:65536;
 const fetchImpl=(async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
  if(closed||Date.now()>=deadlineMs)fail('MOBILE_PAGED_TLS_CLOSED');
  if(typeof input!=='string'||!init||init.method!=='POST'||typeof init.body!=='string')fail('MOBILE_PAGED_TLS_REQUEST');
  const actualHeaders=new Headers(init.headers),expectedHeaders=group==='PAGED'?{'Content-Type':'application/json'}:{Accept:'application/json',Origin:origin,'Content-Type':'application/json'};
  if([...actualHeaders.keys()].length!==Object.keys(expectedHeaders).length||Object.entries(expectedHeaders).some(([key,value])=>actualHeaders.get(key)!==value))fail('MOBILE_PAGED_TLS_REQUEST');
  const url=new URL(input);if(url.origin!==origin||url.search||url.hash||url.username||url.password||!allowed.has(url.pathname)||input!==origin+url.pathname||new TextEncoder().encode(init.body).length>allowed.get(url.pathname)!)fail('MOBILE_PAGED_TLS_REQUEST');
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
