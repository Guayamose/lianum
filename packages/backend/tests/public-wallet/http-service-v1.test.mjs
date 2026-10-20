import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {hex} from '@scure/base';
import {deriveNativeAccountV1} from '@lianum/crypto/native-wallet-v1';
import {createPublicWalletHttpServiceV1,PUBLIC_WALLET_LIMITS_V1 as limits} from '../../src/public-wallet/http-service-v1.mjs';
import {nativeWalletAuthMessageV1,nativeWalletBodyHashV1} from '../../../crypto/src/native-wallet-auth-v1.mjs';

const origin='https://wallet.example';
const account=byte=>deriveNativeAccountV1(new Uint8Array(32).fill(byte),'ethereum-mainnet');
const jsonHeaders={'content-type':'application/json'};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function identity(byte){
 const key=new Uint8Array(32).fill(byte),devicePublicKey=hex.encode(secp256k1.getPublicKey(key,false));
 return{key,devicePublicKey};
}
function challengeInput(own,path,body){return{origin,path,bodySHA256:nativeWalletBodyHashV1(body),devicePublicKey:own.devicePublicKey};}
async function signedRequest(url,own,path,value){
 const body=JSON.stringify(value),expected=challengeInput(own,path,body);
 const response=await fetch(url+'/v1/auth/challenge',{method:'POST',headers:jsonHeaders,body:JSON.stringify(expected)});
 assert.equal(response.status,200);const challenge=await response.json();
 const signature=hex.encode(secp256k1.sign(nativeWalletAuthMessageV1(challenge,expected),own.key,{prehash:true,lowS:true}));
 return{challenge,signature,body};
}
async function fixture(t,nativeFactory){
 const directory=await mkdtemp(join(tmpdir(),'lianum-public-http-'));
 const service=await createPublicWalletHttpServiceV1({origin,directory,nativeConfiguration:{networks:[]},nativeFactory});
 const address=await service.listen(),url=`http://127.0.0.1:${address.port}`;
 t.after(async()=>{try{await service.close();}finally{await rm(directory,{recursive:true,force:true});}});
 return{directory,service,url};
}

test('public HTTP service authenticates the exact real account and isolates owner journals',async t=>{
 const seen=[],services=[];
 const {service,url}=await fixture(t,async options=>{
  services.push(options);return{readAccount:async body=>{seen.push(body);return{address:body.address};},close:async()=>{}};
 });
 assert.equal((await(await fetch(url+'/v1/fiat/capabilities')).json()).configured,false);
 for(const byte of [1,2]){
  const own=identity(byte),path='/v1/native/account',body=account(byte),payload=await signedRequest(url,own,path,body);
  const result=await fetch(url+path,{method:'POST',headers:jsonHeaders,body:JSON.stringify(payload)});
  assert.equal(result.status,200);assert.equal((await result.json()).address,body.address);
  const replay=await fetch(url+path,{method:'POST',headers:jsonHeaders,body:JSON.stringify(payload)});assert.equal(replay.status,403);
 }
 assert.equal(seen.length,2);assert.notEqual(services[0].directory,services[1].directory);
 assert.deepEqual(services[0].configuration,{networks:[]});
 await assert.rejects(service.listen({host:'0.0.0.0'}),/NATIVE_SERVICE_LOOPBACK/);
});

test('authenticated prepare failure logs bounded diagnostics without request or provider secrets',async t=>{
 const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));let known=false;
 const {url}=await fixture(t,async()=>({prepareSend:async()=>{throw Error(known?'NATIVE_WALLET_BTC_FEE_ESTIMATE':'PRIVATE_PROVIDER_TEXT_WITH_SECRET');},close:async()=>{}}));
 const own=identity(13),path='/v1/native/prepare',body={account:account(13),recipient:account(14).address,amountAtomic:'1'};
 for(const expected of ['NATIVE_SERVICE_UNAVAILABLE','NATIVE_WALLET_BTC_FEE_ESTIMATE']){
  const payload=await signedRequest(url,own,path,body),response=await fetch(url+path,{method:'POST',headers:jsonHeaders,body:JSON.stringify(payload)});
  assert.deepEqual(await response.json(),{error:expected});known=true;
 }
 assert.equal(logs.length,2);
 for(const [tag,raw]of logs){assert.equal(tag,'LIANUM_NATIVE_REQUEST_FAILURE_V24');const d=JSON.parse(raw);assert.equal(d.path,path);assert.deepEqual(Object.keys(d).sort(),['code','httpStatus','locations','path','rpcCode']);assert.ok(d.locations.every(s=>/^[a-z0-9-]+\.mjs:\d+:\d+$/.test(s)));assert.ok(!raw.includes('PRIVATE_PROVIDER_TEXT')&&!raw.includes(body.recipient)&&!raw.includes(own.devicePublicKey));}
});

test('HTTP rejects body/client/global capacity before reading or creating a journal',async t=>{
 let created=0;const {directory,service,url}=await fixture(t,async()=>{created++;return{close:async()=>{}};});
 const post=body=>fetch(url+'/v1/auth/challenge',{method:'POST',headers:jsonHeaders,body});
 const tooLarge=await post(' '.repeat(limits.challengeBytes+1));assert.equal(tooLarge.status,413);
 assert.deepEqual(await tooLarge.json(),{error:'NATIVE_HTTP_BODY_LIMIT'});
 const forwarded=await fetch(url+'/health',{headers:{'x-forwarded-for':'198.51.100.1, 198.51.100.2'}});
 assert.equal(forwarded.status,400);assert.deepEqual(await forwarded.json(),{error:'NATIVE_HTTP_CLIENT'});
 const malformed=await signedRequest(url,identity(3),'/v1/native/account',{address:'not-an-account'});
 const rejected=await fetch(url+'/v1/native/account',{method:'POST',headers:jsonHeaders,body:JSON.stringify(malformed)});
 assert.equal(rejected.status,400);assert.equal(created,0);assert.deepEqual(await readdir(join(directory,'native')),[]);

 // Incomplete HTTP bodies, rather than gateway jobs, demonstrate that capacity
 // rejects the next request before reading or allocating its body.
 const held=[];t.after(()=>{for(const request of held)request.destroy();});
 async function hold(ip){
  const accepted=deferred();service.server.once('request',accepted.resolve);
  const request=httpRequest(url+'/v1/auth/challenge',{method:'POST',headers:{...jsonHeaders,'x-forwarded-for':ip,'content-length':'500'}});
  request.on('error',()=>{});request.on('response',response=>response.resume());request.flushHeaders();held.push(request);await accepted.promise;
 }
 for(let i=0;i<limits.clientActive;i++)await hold('198.51.100.10');
 const clientFull=await fetch(url+'/health',{headers:{'x-forwarded-for':'198.51.100.10'}});assert.equal(clientFull.status,429);
 for(let i=0;i<limits.active-limits.clientActive;i++)await hold('198.51.100.11');
 const globalFull=await post(' '.repeat(limits.challengeBytes+1));assert.equal(globalFull.status,429);
 assert.deepEqual(await globalFull.json(),{error:'NATIVE_HTTP_CAPACITY'});assert.equal(created,0);
 await service.close();for(const request of held)request.destroy();
});

test('overall deadline and service close abort original gateway signals and drain cleanup',async t=>{
 const originalTimeout=globalThis.setTimeout,deadlineCallbacks=[];
 t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{
  if(delay===limits.requestDeadlineMs)deadlineCallbacks.push(callback);
  return originalTimeout(callback,delay,...args);
 });
 let entered=deferred(),aborts=0,closed=0,calls=0;
 const {service,url}=await fixture(t,async()=>({
  readAccount:async(_body,signal)=>{
   calls++;entered.resolve();return new Promise((_resolve,reject)=>{
    const aborted=()=>{aborts++;reject(Error('NATIVE_HTTP_CANCELLED'));};
    if(signal.aborted)aborted();else signal.addEventListener('abort',aborted,{once:true});
   });
  },
  close:async()=>{closed++;},
 }));
 const own=identity(4),path='/v1/native/account';
 const payload=await signedRequest(url,own,path,account(4));
 const pending=fetch(url+path,{method:'POST',headers:jsonHeaders,body:JSON.stringify(payload)});
 await entered.promise;deadlineCallbacks.at(-1)();
 const expired=await pending;assert.equal(expired.status,504);assert.deepEqual(await expired.json(),{error:'NATIVE_HTTP_DEADLINE'});
 entered=deferred();const second=await signedRequest(url,own,path,account(4));
 const interrupted=fetch(url+path,{method:'POST',headers:jsonHeaders,body:JSON.stringify(second)});
 await entered.promise;await service.close();const response=await interrupted;
 assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'NATIVE_HTTP_CANCELLED'});
 assert.equal(calls,2);assert.equal(aborts,2);assert.equal(closed,1);
 await service.close();assert.equal(closed,1,'close must not close a gateway twice');
});

test('only authenticated native submit extends processing, with the original signal and a fixed total deadline',async t=>{
 const originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout,timers=[];
 t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{
  const handle=originalTimeout(callback,delay,...args);if(delay===limits.requestDeadlineMs||delay>limits.requestDeadlineMs&&delay<=limits.nativeSubmitDeadlineMs)timers.push({callback,delay,handle,cleared:false});return handle;
 });
 t.mock.method(globalThis,'clearTimeout',handle=>{const entry=timers.find(row=>row.handle===handle);if(entry)entry.cleared=true;return originalClear(handle);});
 let entered=deferred(),release=deferred(),receivedSignal,calls=0;
 const {service,url}=await fixture(t,async()=>({
  submitSigned:async(_body,signal)=>{calls++;receivedSignal=signal;entered.resolve();return Promise.race([release.promise,new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('NATIVE_HTTP_CANCELLED')),{once:true});})]);},
  close:async()=>{},
 }));
 assert.equal(service.server.requestTimeout,limits.requestDeadlineMs);assert.equal(service.server.headersTimeout,15000);
 const path='/v1/native/submit',body={quoteId:'12345678-1234-1234-1234-123456789abc',rawTransaction:'synthetic-fixture-wire'},own=identity(17);
 const invalid=await signedRequest(url,own,path,{quoteId:'invalid',rawTransaction:'fixture'}),before=timers.length;
 const rejected=await fetch(url+path,{method:'POST',headers:jsonHeaders,body:JSON.stringify(invalid)});assert.equal(rejected.status,400);assert.ok(timers.slice(before).every(row=>row.delay===limits.requestDeadlineMs));assert.equal(calls,0);
 const payload=await signedRequest(url,own,path,body),pending=fetch(url+path,{method:'POST',headers:jsonHeaders,body:JSON.stringify(payload)});
 await entered.promise;const extended=timers.at(-1),initial=timers.at(-2);
 assert.equal(initial.delay,limits.requestDeadlineMs);assert.equal(initial.cleared,true);assert.ok(extended.delay>limits.requestDeadlineMs&&extended.delay<=limits.nativeSubmitDeadlineMs);assert.equal(receivedSignal.aborted,false);
 release.resolve({status:'SUBMITTED'});const success=await pending;assert.equal(success.status,200);assert.deepEqual(await success.json(),{status:'SUBMITTED'});assert.equal(extended.cleared,true);
 entered=deferred();release=deferred();const again=await signedRequest(url,own,path,body),expiring=fetch(url+path,{method:'POST',headers:jsonHeaders,body:JSON.stringify(again)});
 await entered.promise;timers.at(-1).callback();const expired=await expiring;
 assert.equal(expired.status,504);assert.deepEqual(await expired.json(),{error:'NATIVE_HTTP_DEADLINE'});assert.equal(receivedSignal.aborted,true);assert.equal(calls,2,'HTTP layer never repeats submit');
});

test('disconnecting an extended native submission cancels its gateway immediately',async t=>{
 const entered=deferred(),cancelled=deferred();let calls=0;
 const {url}=await fixture(t,async()=>({submitSigned:async(_body,signal)=>{calls++;entered.resolve();return new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{cancelled.resolve();reject(Error('NATIVE_HTTP_CANCELLED'));},{once:true});});},close:async()=>{}}));
 const path='/v1/native/submit',payload=await signedRequest(url,identity(18),path,{quoteId:'12345678-1234-1234-1234-123456789abc',rawTransaction:'synthetic-fixture-wire'}),controller=new AbortController();
 const pending=fetch(url+path,{method:'POST',headers:jsonHeaders,body:JSON.stringify(payload),signal:controller.signal}).then(()=>null,error=>error);
 await entered.promise;controller.abort();assert.equal((await pending).name,'AbortError');await cancelled.promise;assert.equal(calls,1);
});
