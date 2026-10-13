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
