/** Finite device ERC20 routes. TLS is infrastructure, never note custody.
 * The original account consumes each signed permission before effects. */
import {createServer} from 'node:https';
import {createPrivateKey,X509Certificate} from 'node:crypto';
import {types} from 'node:util';
import {externalFlatWipeV1} from '../../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
import {isIP} from 'node:net';
import {privateFailureDiagnostic} from '../../execution/account/reconciliation/failure-diagnostics.mjs';
import {AssertionError} from 'node:assert';
import {lstatSync,realpathSync} from 'node:fs';
import {join,relative,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,FLAT,GOLDEN} from '../../../../proofs/src/catalog.mjs';
import {assertOriginalDeviceExternalFlatNoteAuthorityV1,assertOriginalRetainedDeviceExternalFlatNoteAuthorityV1} from '../../accounts/authority/device-external-flat-note-authority-v1.mjs';
const listeners=new WeakSet(),diagnosticSlots=new WeakMap(),MAX_BODY=8192,MAX_REPLY=65536;
const fail=()=>{throw Error('DEVICE_EXTERNAL_FLAT_TLS_CONFIGURATION');};
const DIAGNOSTIC_TYPES=new Map([[AssertionError.prototype,'ASSERTION_ERROR'],[TypeError.prototype,'TYPE_ERROR'],[RangeError.prototype,'RANGE_ERROR'],[Error.prototype,'ERROR'],[AggregateError.prototype,'AGGREGATE_ERROR']]);
const ROOTS=Object.freeze([['flat-wallet',ROOT],['golden',GOLDEN],['mobile-protocol',join(FLAT,'mobile-protocol')]]);
// Node24 V8 exposes stack through an intrinsic getter even after assignment.
// Only that captured getter is callable; no custom stack formatter/accessor is.
const ORIGINAL_ERROR=Error,ERROR_PARENT=Object.getPrototypeOf(Error);
const NATIVE_STACK_GETTER=Object.getOwnPropertyDescriptor(new Error(),'stack')?.get;
const ORIGINAL_PREPARE=Object.getOwnPropertyDescriptor(Error,'prepareStackTrace');
const PROTOTYPE_CHAINS=new Map([...DIAGNOSTIC_TYPES.keys()].map(start=>{
 const chain=[];for(let value=start;value!==null;value=Object.getPrototypeOf(value))chain.push(value);
 return[start,chain];
}));
const PROTOTYPE_PROPERTIES=new Map([...new Set([...PROTOTYPE_CHAINS.values()].flat())].map(value=>[value,Object.getOwnPropertyDescriptors(value)]));
function sameDescriptor(a,b){
 if(!a||!b)return a===b;
 return Reflect.ownKeys(a).length===Reflect.ownKeys(b).length
  &&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&a[key]===b[key]);
}
function originalFormatting(){
 if(Error!==ORIGINAL_ERROR||Object.getPrototypeOf(ORIGINAL_ERROR)!==ERROR_PARENT)return false;
 // The fixed authenticated child loads this module before user work. Retain
 // Node's original data-function reference, never authorize one by its name.
 if(ORIGINAL_PREPARE&&(!Object.hasOwn(ORIGINAL_PREPARE,'value')
   ||(ORIGINAL_PREPARE.value!==undefined&&typeof ORIGINAL_PREPARE.value!=='function')))return false;
 if(!sameDescriptor(Object.getOwnPropertyDescriptor(ORIGINAL_ERROR,'prepareStackTrace'),ORIGINAL_PREPARE))return false;
 for(let value=ERROR_PARENT;value!==null;value=Object.getPrototypeOf(value))
  if(types.isProxy(value)||Object.getOwnPropertyDescriptor(value,'prepareStackTrace'))return false;
 return true;
}
function stackText(error){
 const chain=PROTOTYPE_CHAINS.get(Object.getPrototypeOf(error));if(!chain||!originalFormatting())return undefined;
 let current=Object.getPrototypeOf(error);
 for(const prototype of chain){
  if(current!==prototype||types.isProxy(current))return undefined;
  const saved=PROTOTYPE_PROPERTIES.get(prototype),actual=Object.getOwnPropertyDescriptors(prototype),keys=Reflect.ownKeys(saved);
  if(keys.length!==Reflect.ownKeys(actual).length||keys.some(key=>!Object.hasOwn(actual,key)||!sameDescriptor(saved[key],actual[key])))return undefined;
  current=Object.getPrototypeOf(current);
 }
 if(current!==null)return undefined;
 // V8's default formatting may read name/message; accept data strings only.
 for(const key of['name','message']){
  let descriptor=Object.getOwnPropertyDescriptor(error,key);
  for(const prototype of chain){if(descriptor)break;descriptor=Object.getOwnPropertyDescriptor(prototype,key);}
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string')return undefined;
 }
 const descriptor=Object.getOwnPropertyDescriptor(error,'stack');if(!descriptor)return undefined;
 if(Object.hasOwn(descriptor,'value'))return typeof descriptor.value==='string'?descriptor.value:undefined;
 if(typeof NATIVE_STACK_GETTER!=='function'||descriptor.get!==NATIVE_STACK_GETTER)return undefined;
 try{return Reflect.apply(NATIVE_STACK_GETTER,error,[]);}catch{return undefined;}
}

function location(raw,line,column){
 try{
  const path=raw.startsWith('file://')?fileURLToPath(raw):raw;
  if(!isAbsolute(path)||resolve(path)!==path||!path.endsWith('.mjs'))return null;
  const selected=ROOTS.find(([,root])=>path.startsWith(root+'/'));if(!selected)return null;
  const name=relative(selected[1],path);
  if(/^[A-Za-z0-9_./-]+$/.exec(name)?.[0]!==name||name.split('/').some(part=>!part||part.startsWith('.'))||realpathSync(path)!==path)return null;
  const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||info.size>1048576)return null;
  return Object.freeze({root:selected[0],path:name,line:Number(line),column:Number(column)});
 }catch{return null;}
}
function privateFirstError(error){
 const native=!!error&&typeof error==='object'&&!types.isProxy(error)&&types.isNativeError(error);
 const errorType=native?(DIAGNOSTIC_TYPES.get(Object.getPrototypeOf(error))??'OTHER_NATIVE_ERROR'):'THROWN_VALUE';
 const stack=native?stackText(error):undefined,frames=[];
 if(typeof stack==='string')for(const row of stack.slice(0,65536).split('\n').slice(1,257)){
  const match=/^\s+at (?:[^()\r\n]* \()?((?:file:\/\/)?\/[^()\r\n?#]+\.mjs):([1-9][0-9]{0,8}):([1-9][0-9]{0,8})\)?$/.exec(row);
  if(!match)continue;const frame=location(match[1],match[2],match[3]);if(frame)frames.push(frame);if(frames.length===16)break;
 }
 return Object.freeze({errorType,frames:Object.freeze(frames)});
}

const DIAGNOSTIC_CODE=/^(?:(?:DEVICE_EXTERNAL_FLAT|NATIVE_ECONOMIC|LOCAL_EVM|EVM|FLAT|VAULT|PW|NATIVE)_[A-Z0-9_]{1,100}|ERR_ASSERTION)$/;
const DIAGNOSTIC_PHASES=new Set(['REQUEST','CHALLENGE','REVIEW','OPERATE','STATUS']);
const DIAGNOSTIC_ACTIONS=new Set(['PROVE_D26','PROVE_D27','OBSERVE_D27','FUND_D26','OBSERVE_D26','QUOTE_W39','PROVE_W39','WITHDRAW_W39','OBSERVE_W39']);
function retainFailure(account,error,phase,action){
 const slot=diagnosticSlots.get(account);if(!slot||!DIAGNOSTIC_PHASES.has(phase)||(action!==null&&!DIAGNOSTIC_ACTIONS.has(action)))return;
 try{
  const original=privateFirstError(error),safe=!!error&&typeof error==='object'&&!types.isProxy(error);
  const supplied=safe?Object.getOwnPropertyDescriptor(error,'code')?.value:undefined,sourceLabel=safe&&types.isNativeError(error)?Object.getOwnPropertyDescriptor(error,'message')?.value:undefined;
  const diagnostic=privateFailureDiagnostic(error),closed=value=>typeof value==='string'&&DIAGNOSTIC_CODE.exec(value)?.[0]===value?value:null;
  slot.latest=Object.freeze({format:'LIANUM_DEVICE_EXTERNAL_FLAT_HTTP_LATEST_ERROR_PRIVATE_V1',phase,action,errorType:original.errorType,errorCode:closed(supplied)??closed(sourceLabel)??closed(diagnostic.code)??null,frames:original.frames});
 }catch{ /* A diagnostic cannot replace or release the original failure. */ }
}
/** Private fixed-caller diagnostic only. The key is the SAME account accepted
 * by this original TLS factory; copies cannot read it. Closure grants no view,
 * proof, key, send or reopen authority. Never exports exception/raw payload. */
export function readOriginalDeviceExternalFlatHttpFailureV1(account){
 if(arguments.length!==1||!account||types.isProxy(account)||!diagnosticSlots.has(account))fail();
 const value=diagnosticSlots.get(account).latest;return value===null?null:structuredClone(value);
}
function exact(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value')))fail();}
function reply(response,status,value){if(response.destroyed||response.writableEnded)return;let bytes=Buffer.from(JSON.stringify(value));if(bytes.length>MAX_REPLY){status=403;bytes=Buffer.from('{"error":"REQUEST_REJECTED"}');}
 response.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':bytes.length,'cache-control':'no-store','connection':'close','x-content-type-options':'nosniff'});response.end(bytes);}
async function body(request,maximum=MAX_BODY){if(maximum!==MAX_BODY&&maximum!==65536)fail();if(request.headers['content-type']!=='application/json'||request.headers['content-encoding']!==undefined||request.headers['transfer-encoding']!==undefined)fail();
 const length=request.headers['content-length'];if(typeof length!=='string'||/^(0|[1-9][0-9]{0,5})$/.exec(length)?.[0]!==length||Number(length)<2||Number(length)>maximum)fail();
 const parts=[];let count=0,bytes;try{for await(const part of request){parts.push(part);count+=part.length;if(count>Number(length)||count>maximum)fail();}if(count!==Number(length))fail();bytes=Buffer.concat(parts);return JSON.parse(bytes.toString('utf8'));}finally{bytes?.fill(0);parts.forEach(p=>p.fill(0));}}
const retainedListeners=new WeakMap(),graphListeners=new WeakMap();
/** Private fixed ordered-capture seam. The public close still closes account. */
export function quiesceOriginalRetainedDeviceExternalFlatTlsServerV1(listener,account){
 if(arguments.length!==2||types.isProxy(listener)||types.isProxy(account))fail();const original=retainedListeners.get(listener);if(!original||original.account!==account)fail();assertOriginalRetainedDeviceExternalFlatNoteAuthorityV1(account);return original.quiesce();
}
export async function createOriginalDeviceExternalFlatTlsServerV1(input){
 if(arguments.length!==1)fail();const keys=input&&!types.isProxy(input)&&Object.hasOwn(input,'host')?['account','tls','host']:['account','tls'];exact(input,keys);exact(input.tls,['certificate','privateKey']);
 const reader=input.account,descriptor=assertOriginalDeviceExternalFlatNoteAuthorityV1(reader),origin=new URL(descriptor.origin),host=input.host??'127.0.0.1',hostname=origin.hostname.replace(/^\[|\]$/g,'');
 if(!['127.0.0.1','0.0.0.0'].includes(host)||listeners.has(reader)||typeof input.tls.certificate!=='string'||Buffer.byteLength(input.tls.certificate)>65536||typeof input.tls.privateKey!=='string'||Buffer.byteLength(input.tls.privateKey)>16384)fail();
 let certificate;try{certificate=new X509Certificate(input.tls.certificate);const key=createPrivateKey(input.tls.privateKey);if(certificate.ca||!certificate.checkPrivateKey(key)||(isIP(hostname)?certificate.checkIP(hostname)!==hostname:certificate.checkHost(hostname,{subject:'never',wildcards:false})!==hostname))fail();}catch{fail();}
 const current=()=>{const now=Date.now();if(now<certificate.validFromDate.getTime()||now>=certificate.validToDate.getTime())fail();};current();
 const privateKey=Buffer.from(input.tls.privateKey),running=new Set(),sockets=new Set();let closed=false,closing,server;
 const prefix=descriptor.profile==='LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1'?'/v1/mobile/external-flat-share':'/v1/mobile/external-flat';
 const routes=Object.freeze({[prefix+'/challenges']:'challenge',[prefix+'/reviews']:'review',[prefix+'/operations']:'operate',[prefix+'/status']:'status'});
 listeners.add(reader);diagnosticSlots.set(reader,{latest:null});
 try{server=createServer({cert:input.tls.certificate,key:privateKey,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',ALPNProtocols:['http/1.1'],maxHeaderSize:8192,handshakeTimeout:2000},(request,response)=>{
  let resetResponseTimeout,requestBody,phase='REQUEST',action=null;
  const work=(async()=>{if(closed)fail();current();if(request.socket.encrypted!==true||request.headers.host!==origin.host||request.headers.origin!==descriptor.origin||request.method!=='POST'||!Object.hasOwn(routes,request.url))fail();
   phase={challenge:'CHALLENGE',review:'REVIEW',operate:'OPERATE',status:'STATUS'}[routes[request.url]];
   const value=requestBody=await body(request);if(closed)fail();
   const declared=routes[request.url]==='outputOperate'?value?.consent?.consent?.action:routes[request.url]==='outputReview'?value?.draft?.draft?.action:routes[request.url]==='operate'?value?.consent?.action:routes[request.url]==='review'?value?.draft?.action:null;action=DIAGNOSTIC_ACTIONS.has(declared)?declared:null;
   // Permission admission remains15s. Only waiting for the SAME original
   // finite worker result uses its unchanged900000ms operation bound.
   if(routes[request.url]==='operate'&&['PROVE_D26','PROVE_D27','PROVE_W39'].includes(value?.consent?.action))resetResponseTimeout(900000);assertOriginalDeviceExternalFlatNoteAuthorityV1(reader);
   if(routes[request.url]==='challenge'){exact(value,[]);return reader.challenge();}return reader[routes[request.url]](value);})().catch(error=>{retainFailure(reader,error,phase,action);throw error;}).finally(()=>externalFlatWipeV1(requestBody?.witness));
  running.add(work);work.finally(()=>running.delete(work)).catch(()=>{});let timer;
  const timeout=new Promise((_,reject)=>{resetResponseTimeout=milliseconds=>{clearTimeout(timer);timer=setTimeout(()=>reject(Error('DEVICE_EXTERNAL_FLAT_HTTP_TIMEOUT')),milliseconds);timer.unref();};resetResponseTimeout(15000);});
  Promise.race([work,timeout]).then(v=>reply(response,200,v),error=>{retainFailure(reader,error,phase,action);reply(response,closed?503:403,{error:closed?'DISCONNECTED':'REQUEST_REJECTED'});}).finally(()=>clearTimeout(timer)).catch(()=>{});
 });}catch(error){listeners.delete(reader);await reader.close();throw error;}finally{privateKey.fill(0);}
 server.headersTimeout=2000;server.requestTimeout=15000;server.keepAliveTimeout=1;server.maxRequestsPerSocket=1;server.maxConnections=4;
 const track=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));};server.on('connection',track);server.on('secureConnection',track);server.on('tlsClientError',(_error,socket)=>socket.destroy());
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(origin.port||443),host,()=>{server.off('error',reject);resolve();});});}
 catch(error){closed=true;const accountClose=reader.close();listeners.delete(reader);const ownedSockets=[...sockets],drain=Promise.all(ownedSockets.map(socket=>new Promise(resolve=>socket.once('close',resolve))));for(const socket of ownedSockets)socket.destroy();await Promise.all([accountClose,drain,new Promise(resolve=>server.close(()=>resolve()))]);throw error;}
 let networkClosing;
 function drainNetwork(){if(networkClosing)return networkClosing;const admitted=[...running],ownedSockets=[...sockets],socketDrain=Promise.all(ownedSockets.map(socket=>new Promise(resolve=>socket.once('close',resolve))));const network=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));for(const socket of ownedSockets)socket.destroy();
  networkClosing=(async()=>{const results=await Promise.allSettled([...admitted,network,socketDrain]);return{results,admitted:admitted.length};})();return networkClosing;}
 function stoppedNetwork(result){if(result.results.slice(result.admitted).some(r=>r.status==='rejected')||sockets.size||running.size)throw Error('DEVICE_EXTERNAL_FLAT_TLS_CLOSE_UNCONFIRMED');listeners.delete(reader);return{closed:true,ownedSocketsRemaining:0,originalOperationsInFlight:0,deviceNoteKeysRetainedOnDevice:true};}
 const listener=Object.freeze({descriptor,url:descriptor.origin,
  close(){if(arguments.length!==0)fail();if(closing)return closing;closed=true;const accountClose=reader.close(),network=drainNetwork();closing=(async()=>{const result=await network;await accountClose;return stoppedNetwork(result);})();return closing;},
 });
 retainedListeners.set(listener,{account:reader,quiesce(){if(closing)fail();closed=true;const network=drainNetwork();return(async()=>stoppedNetwork(await network))();}});return listener;
}


/** The fixed before-funding composition owns all three route namespaces;
 * closed paths select only the original source, share and workspace brands.
 * The outer product retains note-account custody and closes it after drain. */
export async function createOriginalDeviceExternalFlatGraphTlsServerV1(input){
 if(arguments.length!==1)fail();const keys=input&&!types.isProxy(input)&&Object.hasOwn(input,'host')?['account','targetAccount','workspace','tls','host']:['account','targetAccount','workspace','tls'];exact(input,keys);exact(input.tls,['certificate','privateKey']);
 const reader=input.account,target=input.targetAccount,workspace=input.workspace;const {assertOriginalDeviceExternalFlatGraphWorkspaceV1}=await import('../../operations/local/device-external-flat-source-graph-service-v1.mjs');assertOriginalDeviceExternalFlatGraphWorkspaceV1(workspace,{account:reader,targetAccount:target});const targetDescriptor=assertOriginalDeviceExternalFlatNoteAuthorityV1(target);const descriptor=assertOriginalDeviceExternalFlatNoteAuthorityV1(reader),origin=new URL(descriptor.origin),host=input.host??'127.0.0.1',hostname=origin.hostname.replace(/^\[|\]$/g,'');
 if(descriptor.profile!=='LIANUM_DEVICE_EXTERNAL_FLAT_SOURCE_NOTE_V1'||targetDescriptor.profile!=='LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1'||targetDescriptor.origin!==descriptor.origin||targetDescriptor.devicePublicKey!==descriptor.devicePublicKey||listeners.has(target))fail();
 if(!['127.0.0.1','0.0.0.0'].includes(host)||listeners.has(reader)||typeof input.tls.certificate!=='string'||Buffer.byteLength(input.tls.certificate)>65536||typeof input.tls.privateKey!=='string'||Buffer.byteLength(input.tls.privateKey)>16384)fail();
 let certificate;try{certificate=new X509Certificate(input.tls.certificate);const key=createPrivateKey(input.tls.privateKey);if(certificate.ca||!certificate.checkPrivateKey(key)||(isIP(hostname)?certificate.checkIP(hostname)!==hostname:certificate.checkHost(hostname,{subject:'never',wildcards:false})!==hostname))fail();}catch{fail();}
 const current=()=>{const now=Date.now();if(now<certificate.validFromDate.getTime()||now>=certificate.validToDate.getTime())fail();};current();
 const privateKey=Buffer.from(input.tls.privateKey),running=new Set(),sockets=new Set();let closed=false,closing,server;
 const routes=Object.freeze({'/v1/mobile/external-flat/challenges':'challenge','/v1/mobile/external-flat/reviews':'review','/v1/mobile/external-flat/operations':'operate','/v1/mobile/external-flat/status':'status',
 '/v1/mobile/external-flat-share/challenges':'challenge','/v1/mobile/external-flat-share/reviews':'review','/v1/mobile/external-flat-share/operations':'operate','/v1/mobile/external-flat-share/status':'status',
 '/v1/mobile/external-flat/source-graph/challenges':'challenge','/v1/mobile/external-flat/source-graph/preparations':'preparation','/v1/mobile/external-flat/source-graph/reviews':'review','/v1/mobile/external-flat/source-graph/operations':'operate','/v1/mobile/external-flat/source-graph/status':'status','/v1/mobile/external-flat/source-graph/output-quotes':'outputQuote','/v1/mobile/external-flat/source-graph/output-reviews':'outputReview','/v1/mobile/external-flat/source-graph/output-operations':'outputOperate'});
 listeners.add(reader);listeners.add(target);diagnosticSlots.set(reader,{latest:null});
 try{server=createServer({cert:input.tls.certificate,key:privateKey,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',ALPNProtocols:['http/1.1'],maxHeaderSize:8192,handshakeTimeout:2000},(request,response)=>{
  let resetResponseTimeout,requestBody,phase='REQUEST',action=null;
  const work=(async()=>{if(closed)fail();current();if(request.socket.encrypted!==true||request.headers.host!==origin.host||request.headers.origin!==descriptor.origin||request.method!=='POST'||!Object.hasOwn(routes,request.url))fail();
   const graph=request.url.startsWith('/v1/mobile/external-flat/source-graph/'),selected=graph?workspace:request.url.startsWith('/v1/mobile/external-flat-share/')?target:reader;
   phase={challenge:'CHALLENGE',preparation:'REVIEW',review:'REVIEW',operate:'OPERATE',status:'STATUS',outputQuote:'REVIEW',outputReview:'REVIEW',outputOperate:'OPERATE'}[routes[request.url]];
   const value=requestBody=await body(request,graph?65536:MAX_BODY);if(closed)fail();
   const declared=routes[request.url]==='outputOperate'?value?.consent?.consent?.action:routes[request.url]==='outputReview'?value?.draft?.draft?.action:routes[request.url]==='operate'?value?.consent?.action:routes[request.url]==='review'?value?.draft?.action:null;action=DIAGNOSTIC_ACTIONS.has(declared)?declared:null;
   // Permission admission remains15s. Only waiting for the SAME original
   // finite worker result uses its unchanged900000ms operation bound.
   if(routes[request.url]==='outputOperate'&&value?.consent?.consent?.action==='PROVE_W39')resetResponseTimeout(900000);
   if(routes[request.url]==='operate'&&(!graph&&['PROVE_D26','PROVE_D27','PROVE_W39'].includes(value?.consent?.action)||graph&&['PROVE_U','RESERVE_S','EXECUTE_GRAPH','RECOVER_GRAPH'].includes(value?.consent?.draft?.action)))resetResponseTimeout(900000);assertOriginalDeviceExternalFlatNoteAuthorityV1(reader);assertOriginalDeviceExternalFlatNoteAuthorityV1(target);assertOriginalDeviceExternalFlatGraphWorkspaceV1(workspace,{account:reader,targetAccount:target});
   if(routes[request.url]==='challenge'){exact(value,[]);return selected.challenge();}return selected[routes[request.url]](value);})().catch(error=>{retainFailure(reader,error,phase,action);throw error;}).finally(()=>externalFlatWipeV1(requestBody?.witness));
  running.add(work);work.finally(()=>running.delete(work)).catch(()=>{});let timer;
  const timeout=new Promise((_,reject)=>{resetResponseTimeout=milliseconds=>{clearTimeout(timer);timer=setTimeout(()=>reject(Error('DEVICE_EXTERNAL_FLAT_HTTP_TIMEOUT')),milliseconds);timer.unref();};resetResponseTimeout(15000);});
  Promise.race([work,timeout]).then(v=>reply(response,200,v),error=>{retainFailure(reader,error,phase,action);reply(response,closed?503:403,{error:closed?'DISCONNECTED':'REQUEST_REJECTED'});}).finally(()=>clearTimeout(timer)).catch(()=>{});
 });}catch(error){listeners.delete(reader);listeners.delete(target);await workspace.close();throw error;}finally{privateKey.fill(0);}
 server.headersTimeout=2000;server.requestTimeout=15000;server.keepAliveTimeout=1;server.maxRequestsPerSocket=1;server.maxConnections=4;
 const track=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));};server.on('connection',track);server.on('secureConnection',track);server.on('tlsClientError',(_error,socket)=>socket.destroy());
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(origin.port||443),host,()=>{server.off('error',reject);resolve();});});}
 catch(error){closed=true;const accountClose=workspace.close();listeners.delete(reader);listeners.delete(target);const ownedSockets=[...sockets],drain=Promise.all(ownedSockets.map(socket=>new Promise(resolve=>socket.once('close',resolve))));for(const socket of ownedSockets)socket.destroy();await Promise.all([accountClose,drain,new Promise(resolve=>server.close(()=>resolve()))]);throw error;}
 let networkClosing;
 function drainNetwork(){if(networkClosing)return networkClosing;const admitted=[...running],ownedSockets=[...sockets],socketDrain=Promise.all(ownedSockets.map(socket=>new Promise(resolve=>socket.once('close',resolve))));const network=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));for(const socket of ownedSockets)socket.destroy();
  networkClosing=(async()=>{const results=await Promise.allSettled([...admitted,network,socketDrain]);return{results,admitted:admitted.length};})();return networkClosing;}
 function stoppedNetwork(result){if(result.results.slice(result.admitted).some(r=>r.status==='rejected')||sockets.size||running.size)throw Error('DEVICE_EXTERNAL_FLAT_TLS_CLOSE_UNCONFIRMED');listeners.delete(reader);listeners.delete(target);return{closed:true,ownedSocketsRemaining:0,originalOperationsInFlight:0,deviceNoteKeysRetainedOnDevice:true};}
 const listener=Object.freeze({descriptor,url:descriptor.origin,
  close(){if(arguments.length!==0)fail();if(closing)return closing;closed=true;const accountClose=workspace.close(),network=drainNetwork();closing=(async()=>{const result=await network;await accountClose;return stoppedNetwork(result);})();return closing;},
 });
 graphListeners.set(listener,{workspace,quiesce(){if(closing)fail();closed=true;const network=drainNetwork();return(async()=>stoppedNetwork(await network))();}});
 return listener;
}

export function quiesceOriginalDeviceExternalFlatGraphTlsServerV1(listener,workspace){if(arguments.length!==2||types.isProxy(listener)||types.isProxy(workspace))fail();const s=graphListeners.get(listener);if(!s||s.workspace!==workspace)fail();return s.quiesce();}
