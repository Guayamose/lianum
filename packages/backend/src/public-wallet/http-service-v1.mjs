import {createServer} from 'node:http';
import {once} from 'node:events';
import {join} from 'node:path';
import {mkdir,lstat,opendir} from 'node:fs/promises';
import {isIP} from 'node:net';
import {createHash,timingSafeEqual} from 'node:crypto';
import {createAgentWalletBackendV1} from './agent-wallet-backend-v1.mjs';
import {createPublicWalletAuthV1} from './auth-v1.mjs';
import {readCloudConnectionDirectoryV1} from './connection-directory-v1.mjs';
import {dispatchMoonPayHttpV1} from '../fiat/moonpay-http-v1.mjs';
import {createMoonPayGatewayV1} from '../fiat/moonpay-gateway-v1.mjs';
import {createNativeWalletServiceV1} from '../native-wallet/index.mjs';
import {nativePublicNetworksV1} from '../native-wallet/networks-v1.mjs';
import {validateNativeAccountV1,validateNativeAddressV1,nativeAtomicV1,nativeNetworkV1} from '@lianum/crypto/native-wallet-v1';
import {NATIVE_WALLET_AUTH_ROUTES_V1} from '@lianum/crypto/native-wallet-auth-v1';

export const PUBLIC_WALLET_LIMITS_V1=Object.freeze({
 active:16,clientActive:8,clientRequests:120,clientChallenges:60,clients:1024,
 clientWindowMs:60000,clientIdleMs:600000,challengeBytes:2048,bodyBytes:2000000,
 webhookBytes:262144,requestDeadlineMs:20000,residentOwners:16,persistedOwners:64,
 pendingChallenges:256,
});
const OWNER=/^[0-9a-f]{64}$/,ID=/^[0-9a-f-]{36}$/;
const loopback=value=>value==='127.0.0.1'||value==='::1'||value==='::ffff:127.0.0.1';
function refuse(code){throw Error(code);}
function errorCode(error){const value=error?.code??error?.message;return typeof value==='string'&&/^(?:NATIVE_[A-Z_]+|FIAT_[A-Z_]+)$/.test(value)?value:'NATIVE_SERVICE_UNAVAILABLE';}
function nativeFailureDiagnostic(path,error,code){
 // No request, signature, transaction bytes, headers or provider text.
 const locations=[...(typeof error?.stack==='string'?error.stack:'').matchAll(/\/(?:native-wallet|public-wallet|crypto)\/([a-z0-9-]+\.mjs):([0-9]{1,6}):([0-9]{1,6})/g)].slice(0,3).map(m=>m[1]+':'+m[2]+':'+m[3]);
 try{console.error('LIANUM_NATIVE_REQUEST_FAILURE_V24',JSON.stringify({path,code,locations,httpStatus:Number.isInteger(error?.httpStatus)?error.httpStatus:null,rpcCode:Number.isInteger(error?.rpcErrorCode)?error.rpcErrorCode:null}));}catch{}
}
function exactBody(value,required,optional=[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)refuse('NATIVE_HTTP_BODY');
 const keys=Object.keys(value);if(!required.every(key=>keys.includes(key))||!keys.every(key=>required.concat(optional).includes(key)))refuse('NATIVE_HTTP_BODY');
}
function accountBody(value){exactBody(value,['networkId','chain','network','address','path','publicKey']);validateNativeAccountV1(value);}
function validateNativeBody(path,body){
 if(path==='/v1/native/account'){accountBody(body);return;}
 if(path==='/v1/native/prepare'){
  exactBody(body,['account','recipient','amountAtomic'],['operationId','networkId']);accountBody(body.account);validateNativeAddressV1(body.account.networkId,body.recipient);
  if(nativeAtomicV1(body.amountAtomic)<=0n||body.operationId!==undefined&&!ID.test(body.operationId)||body.networkId!==undefined&&body.networkId!==body.account.networkId)refuse('NATIVE_HTTP_BODY');
  return;
 }
 if(path==='/v1/native/submit'){exactBody(body,['quoteId','rawTransaction'],['networkId']);if(body.networkId!==undefined)nativeNetworkV1(body.networkId);if(!ID.test(body.quoteId)||typeof body.rawTransaction!=='string'||!body.rawTransaction.length||body.rawTransaction.length>800000)refuse('NATIVE_HTTP_BODY');return;}
 if(path==='/v1/native/cancel'){exactBody(body,['id'],['networkId']);if(body.networkId!==undefined)nativeNetworkV1(body.networkId);if(!ID.test(body.id))refuse('NATIVE_HTTP_BODY');return;}
 if(path==='/v1/native/status'){exactBody(body,['id'],['networkId']);if(body.networkId!==undefined)nativeNetworkV1(body.networkId);if(typeof body.id!=='string'||body.id.length>128||!/^[0-9a-zA-Z-]+$/.test(body.id))refuse('NATIVE_HTTP_BODY');return;}
 refuse('NATIVE_ROUTE_NOT_FOUND');
}
function responseStatus(code){
 if(code==='NATIVE_HTTP_CAPACITY'||code==='NATIVE_HTTP_RATE_LIMIT'||code==='NATIVE_HTTP_CLIENT_CAPACITY')return 429;
 if(code==='NATIVE_HTTP_BODY_LIMIT')return 413;
 if(code==='NATIVE_SERVICE_CLOSED'||code==='NATIVE_SERVICE_CAPACITY'||code==='NATIVE_SERVICE_OWNER_CAPACITY')return 503;
 if(code==='NATIVE_HTTP_DEADLINE')return 504;
 if(code.includes('AUTH_'))return 403;
 return code.includes('NOT_CONFIGURED')||code.includes('PROVIDER_')||code==='NATIVE_SERVICE_UNAVAILABLE'?503:400;
}
function send(response,status,body,rejectBody=false){
 if(response.destroyed||response.writableEnded||response.headersSent)return;
 response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(rejectBody?{connection:'close'}:{})});
 response.end(JSON.stringify(body));if(rejectBody)response.once('finish',()=>response.destroy());
}
function clientAddress(request){
 const peer=request.socket.remoteAddress;
 // The listener is loopback-only. Only its fixed Caddy ingress may replace the
 // client header; an untrusted remote peer never gains forwarded-header authority.
 if(!loopback(peer))refuse('NATIVE_HTTP_CLIENT');
 const forwarded=request.headers['x-forwarded-for'];
 if(forwarded===undefined)return peer==='::ffff:127.0.0.1'?'127.0.0.1':peer;
 if(typeof forwarded!=='string'||forwarded.length>64||forwarded.trim()!==forwarded||isIP(forwarded)===0)refuse('NATIVE_HTTP_CLIENT');
 return forwarded;
}
function createAdmission(){
 const clients=new Map();let active=0;
 return request=>{
  if(active>=PUBLIC_WALLET_LIMITS_V1.active)refuse('NATIVE_HTTP_CAPACITY');
  const address=clientAddress(request),now=performance.now();
  for(const [key,row]of clients)if(row.active===0&&now-row.last>=PUBLIC_WALLET_LIMITS_V1.clientIdleMs)clients.delete(key);
  let row=clients.get(address);
  if(!row){if(clients.size>=PUBLIC_WALLET_LIMITS_V1.clients)refuse('NATIVE_HTTP_CLIENT_CAPACITY');row={start:now,last:now,requests:0,challenges:0,active:0};clients.set(address,row);}
  row.last=now;if(now-row.start>=PUBLIC_WALLET_LIMITS_V1.clientWindowMs){row.start=now;row.requests=0;row.challenges=0;}
  if(row.active>=PUBLIC_WALLET_LIMITS_V1.clientActive)refuse('NATIVE_HTTP_CAPACITY');
  const challenge=request.url==='/v1/auth/challenge';
  if(row.requests>=PUBLIC_WALLET_LIMITS_V1.clientRequests||challenge&&row.challenges>=PUBLIC_WALLET_LIMITS_V1.clientChallenges)refuse('NATIVE_HTTP_RATE_LIMIT');
  row.requests++;row.active++;active++;
  let released=false;return{
   release(){if(released)return;released=true;row.active--;active--;row.last=performance.now();},
   issueChallenge(issue){
    if(row.challenges>=PUBLIC_WALLET_LIMITS_V1.clientChallenges)refuse('NATIVE_HTTP_RATE_LIMIT');
    const result=issue();row.challenges++;return result;
   },
  };
 };
}
function bodyLimit(path){return path==='/v1/auth/challenge'?PUBLIC_WALLET_LIMITS_V1.challengeBytes:path==='/v1/fiat/moonpay/webhook'?PUBLIC_WALLET_LIMITS_V1.webhookBytes:PUBLIC_WALLET_LIMITS_V1.bodyBytes;}
async function readBody(request,limit,signal){
 if(!/^application\/json(?:;.*)?$/i.test(request.headers['content-type']??''))refuse('NATIVE_HTTP_CONTENT_TYPE');
 const declared=request.headers['content-length'];if(declared!==undefined&&(!/^[0-9]+$/.test(declared)||BigInt(declared)>BigInt(limit)))refuse('NATIVE_HTTP_BODY_LIMIT');
 const chunks=[];let length=0;const onAbort=()=>request.destroy();signal.addEventListener('abort',onAbort,{once:true});
 try{for await(const chunk of request){if(signal.aborted)refuse('NATIVE_HTTP_CANCELLED');length+=chunk.length;if(length>limit)refuse('NATIVE_HTTP_BODY_LIMIT');chunks.push(Buffer.from(chunk));}if(signal.aborted)refuse('NATIVE_HTTP_CANCELLED');return Buffer.concat(chunks);}
 finally{signal.removeEventListener('abort',onAbort);for(const chunk of chunks)chunk.fill(0);}
}
async function privateDirectory(directory){
 await mkdir(directory,{recursive:true,mode:0o700});const stat=await lstat(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700)refuse('NATIVE_SERVICE_DIRECTORY');
}
async function originalOwners(directory){
 const owners=new Set(),handle=await opendir(directory);
 for await(const entry of handle){
  if(!OWNER.test(entry.name)||!entry.isDirectory()||entry.isSymbolicLink())refuse('NATIVE_SERVICE_DIRECTORY');
  await privateDirectory(join(directory,entry.name));owners.add(entry.name);
  if(owners.size>PUBLIC_WALLET_LIMITS_V1.persistedOwners)refuse('NATIVE_SERVICE_OWNER_CAPACITY');
 }
 return owners;
}

/** Keyless API behind a loopback-only HTTPS ingress. Limits apply before body
 * allocation and journal birth. Shutdown aborts reads and drains admitted signed
 * submissions; their gateway persists UNKNOWN rather than rebroadcasting. */
export async function createPublicWalletHttpServiceV1({origin,directory,nativeConfiguration,moonpayConfiguration=null,connectionDirectoryPath=null,nativeFactory=createNativeWalletServiceV1,fiatFactory=createMoonPayGatewayV1,agent=null,agentBackendToken=null,agentMarketReader}){
 const connections=await readCloudConnectionDirectoryV1(connectionDirectoryPath,origin);
 const auth=createPublicWalletAuthV1(origin,{maxPending:PUBLIC_WALLET_LIMITS_V1.pendingChallenges}),nativeServices=new Map(),active=new Set(),contexts=new Set(),admit=createAdmission();
 let closed=false,closeWork,ownerQueue=Promise.resolve();
 await privateDirectory(directory);const nativeDirectory=join(directory,'native');await privateDirectory(nativeDirectory);
 const owners=await originalOwners(nativeDirectory),fiat=await fiatFactory({configuration:moonpayConfiguration,directory:join(directory,'fiat')});
 const partition=new Map(['mainnet','testnet'].map(network=>[network,(nativeConfiguration?.networks??[]).filter(row=>nativeNetworkV1(row.id).network===network)]));
 const mixedEnvironments=partition.get('mainnet').length>0&&partition.get('testnet').length>0;
 if(mixedEnvironments)nativePublicNetworksV1(nativeConfiguration);
 function native(ownerId,network){
  if(!OWNER.test(ownerId)||!['mainnet','testnet'].includes(network))refuse('NATIVE_AUTH_BINDING');if((partition.get('mainnet').length||partition.get('testnet').length)&&!partition.get(network).length)refuse('NATIVE_WALLET_NETWORK_NOT_CONFIGURED');const serviceKey=mixedEnvironments?ownerId+':'+network:ownerId;let promise=nativeServices.get(serviceKey);if(promise)return promise;
  const residentOwners=new Set([...nativeServices.keys()].map(key=>key.slice(0,64)));
  if(!residentOwners.has(ownerId)&&residentOwners.size>=PUBLIC_WALLET_LIMITS_V1.residentOwners)refuse('NATIVE_SERVICE_CAPACITY');
  promise=ownerQueue.then(async()=>{
   if(closed)refuse('NATIVE_SERVICE_CLOSED');
   if(!owners.has(ownerId)){if(owners.size>=PUBLIC_WALLET_LIMITS_V1.persistedOwners)refuse('NATIVE_SERVICE_OWNER_CAPACITY');await privateDirectory(join(nativeDirectory,ownerId));owners.add(ownerId);}
   // Keep the existing mainnet journal and its configuration fingerprint
   // byte compatible. Testnet gets a separate Original gateway/journal.
   const target=mixedEnvironments&&network==='testnet'?join(nativeDirectory,ownerId,'testnet-v2'):join(nativeDirectory,ownerId);
   await privateDirectory(target);
   return nativeFactory({directory:target,configuration:mixedEnvironments?{networks:partition.get(network)}:nativeConfiguration});
  });
  ownerQueue=promise.then(()=>{},()=>{});nativeServices.set(serviceKey,promise);promise.catch(()=>{if(nativeServices.get(serviceKey)===promise)nativeServices.delete(serviceKey);});return promise;
 }
 const agentWallet=agentBackendToken?await createAgentWalletBackendV1({directory:join(directory,'agent-wallets'),native,networks:(nativeConfiguration?.networks??[]).map(row=>row.id),...(agentMarketReader?{marketReader:agentMarketReader}:{})}):null;
 let backendServer=null;
 async function dispatch(request,response,context){
  let raw,nativeActionStarted=false;const path=request.url;
  try{
   if(closed)refuse('NATIVE_SERVICE_CLOSED');
   if(request.method==='GET'&&path==='/health'){send(response,200,{ready:true});return;}
   if(request.method==='GET'&&path==='/v1/fiat/capabilities'){send(response,200,fiat.capabilities());return;}
   if(request.method==='GET'&&path==='/v1/agent/capabilities'){send(response,200,agent?await agent.capabilities(context.abort.signal):{profile:'LIANUM_AGENT_CAPABILITIES_V1',configured:false});return;}
   const allowed=path==='/v1/auth/challenge'||path==='/v1/fiat/moonpay/webhook'||NATIVE_WALLET_AUTH_ROUTES_V1.includes(path);
   if(request.method!=='POST'||!allowed){send(response,404,{error:'NATIVE_ROUTE_NOT_FOUND'},true);return;}
   raw=await readBody(request,bodyLimit(path),context.abort.signal);
   if(path==='/v1/fiat/moonpay/webhook'){send(response,200,await fiat.receiveWebhook(raw,request.headers['moonpay-signature-v2']));return;}
   let envelope;try{envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{refuse('NATIVE_HTTP_BODY');}
   if(path==='/v1/auth/challenge'){send(response,200,context.admission.issueChallenge(()=>auth.issue(envelope)));return;}
   const {ownerId,devicePublicKey,body}=auth.consume(path,envelope);
   if(context.abort.signal.aborted)refuse('NATIVE_HTTP_CANCELLED');
   if(path.startsWith('/v1/agent/')){
    if(!agent)refuse('NATIVE_AGENT_NOT_CONFIGURED');
    const identity={ownerId,devicePublicKey,connections:connections.filter(row=>row.descriptor.devicePublicKey===devicePublicKey)};
    if(path==='/v1/agent/wallet'){
     if(!agentWallet)refuse('NATIVE_AGENT_BACKEND_NOT_CONFIGURED');
     // The agent's deployment allowlist is checked before registry creation.
     await agent.dispatch(identity,'/v1/agent/state',{},context.abort.signal);
     const linked=await agentWallet.link(identity,body);
     send(response,200,await agent.dispatch(identity,path,linked,context.abort.signal));return;
    }
    if(path==='/v1/agent/stream'){
     for await(const chunk of agent.stream(identity,body,context.abort.signal)){
      if(context.abort.signal.aborted||response.destroyed)break;
      if(!response.headersSent){response.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-accel-buffering':'no'});response.flushHeaders();}
      if(!response.write(chunk))await once(response,'drain',{signal:context.abort.signal});
     }if(!response.destroyed)response.end();return;
    }
    send(response,200,await agent.dispatch(identity,path,body,context.abort.signal));return;
   }
   if(path==='/v1/wallet/connections'){
    exactBody(body,[]);
    send(response,200,{profile:'LIANUM_CLOUD_CONNECTIONS_V1',devicePublicKey,connections:connections.filter(row=>row.descriptor.devicePublicKey===devicePublicKey)});return;
   }
   if(path.startsWith('/v1/fiat/')){const result=await dispatchMoonPayHttpV1('POST',path,body,ownerId,fiat,context.abort.signal);send(response,result.status,result.body);return;}
   validateNativeBody(path,body);
   nativeActionStarted=path==='/v1/native/prepare'||path==='/v1/native/submit';
   const network=path==='/v1/native/account'?body.network:path==='/v1/native/prepare'?body.account.network:body.networkId!==undefined?nativeNetworkV1(body.networkId).network:mixedEnvironments?'mainnet':partition.get('testnet').length?'testnet':'mainnet';
   const service=await native(ownerId,network);
   if(context.abort.signal.aborted)refuse('NATIVE_HTTP_CANCELLED');
   let result;
   if(path==='/v1/native/account')result=await service.readAccount(body,context.abort.signal);
   else if(path==='/v1/native/prepare')result=await service.prepareSend(body,context.abort.signal);
   else if(path==='/v1/native/submit')result=await service.submitSigned(body,context.abort.signal);
   else if(path==='/v1/native/status')result=await service.observeTransfer(body.networkId===undefined?body.id:{id:body.id,networkId:body.networkId},context.abort.signal);
   else result=await service.cancelQuote(body,context.abort.signal);
   send(response,200,result);
  }catch(error){if(response.headersSent){response.end();return;}const code=context.deadline?'NATIVE_HTTP_DEADLINE':errorCode(error);if(nativeActionStarted)nativeFailureDiagnostic(path,error,code);send(response,responseStatus(code),{error:code},!request.complete);}
  finally{raw?.fill(0);}
 }
 function receive(request,response){
  let admission;
  try{if(closed)refuse('NATIVE_SERVICE_CLOSED');admission=admit(request);}
  catch(error){const code=errorCode(error);send(response,responseStatus(code),{error:code},true);return;}
  const context={abort:new AbortController(),deadline:false,admission};
  contexts.add(context);
  const cancelled=()=>context.abort.abort(),onClose=()=>{if(!response.writableEnded)cancelled();};
  request.once('aborted',cancelled);response.once('close',onClose);
  const timer=setTimeout(()=>{context.deadline=true;cancelled();},PUBLIC_WALLET_LIMITS_V1.requestDeadlineMs);
  const work=dispatch(request,response,context);active.add(work);
  const finish=()=>{clearTimeout(timer);request.removeListener('aborted',cancelled);response.removeListener('close',onClose);contexts.delete(context);active.delete(work);admission.release();};
  void work.then(finish,finish);
 }
 const server=createServer(receive);server.requestTimeout=PUBLIC_WALLET_LIMITS_V1.requestDeadlineMs;server.headersTimeout=15000;server.maxHeadersCount=32;
 return Object.freeze({
  server,
  async listen({host='127.0.0.1',port=0}={}){
   if(!['127.0.0.1','::1'].includes(host))refuse('NATIVE_SERVICE_LOOPBACK');
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});return server.address();
  },
  async listenAgentBackend({port=8791}={}){
   if(!agentWallet||backendServer||typeof agentBackendToken!=='string'||agentBackendToken.length<32||/[\r\n]/.test(agentBackendToken))refuse('NATIVE_AGENT_BACKEND_CONFIGURATION');
   const digest=value=>createHash('sha256').update(value).digest(),expected=digest('Bearer '+agentBackendToken);
   backendServer=createServer((request,response)=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);const cancel=()=>controller.abort();response.once('close',cancel);
    const work=(async()=>{try{
     if(closed||!loopback(request.socket.remoteAddress)||!timingSafeEqual(expected,digest(request.headers.authorization??''))){send(response,403,{error:'NATIVE_AGENT_BACKEND_AUTH'});request.resume();return;}
     if(request.method!=='POST'||request.url!=='/snapshot'){send(response,404,{error:'NATIVE_AGENT_BACKEND_ROUTE'});request.resume();return;}
     const bytes=await readBody(request,65536,controller.signal),body=JSON.parse(bytes.toString('utf8'));bytes.fill(0);exactBody(body,['ownerId','network']);
     send(response,200,await agentWallet.snapshot(body.ownerId,body.network,controller.signal));
    }catch(error){send(response,400,{error:errorCode(error)});}finally{clearTimeout(timer);response.removeListener('close',cancel);}})();active.add(work);void work.finally(()=>active.delete(work));
   });backendServer.requestTimeout=30000;backendServer.headersTimeout=5000;backendServer.maxHeadersCount=16;
   await new Promise((resolve,reject)=>{backendServer.once('error',reject);backendServer.listen(port,'127.0.0.1',()=>{backendServer.removeListener('error',reject);resolve();});});return backendServer.address();
  },
  close(){
   if(closeWork)return closeWork;closed=true;
   closeWork=(async()=>{
    const stopped=new Promise(resolve=>server.close(()=>resolve())),backendStopped=backendServer?new Promise(resolve=>{backendServer.closeAllConnections();backendServer.close(resolve);}):Promise.resolve();
    for(const context of contexts)context.abort.abort();
    await Promise.allSettled([...active]);await stopped;await backendStopped;
    auth.close();const failures=[];
    try{await fiat.close();}catch(error){failures.push(error);}
    for(const promise of nativeServices.values()){const value=await promise.catch(()=>null);try{await value?.close();}catch(error){failures.push(error);}}
    if(failures.length)refuse('NATIVE_SERVICE_CLOSE_UNCONFIRMED');
   })();return closeWork;
  },
 });
}
