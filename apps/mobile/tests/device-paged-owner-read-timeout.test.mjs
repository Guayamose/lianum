/** Inert HTTP fixtures: bounded reads, cancellation and diagnostic privacy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../packages/backend/tests/providers/fixtures/paged-mixed-host-v7.mjs';
import * as P from '../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {createDevicePagedOwnerApiV3} from '../src/api/device-paged-owner-api-v3.mjs';

const draft=action=>({action,jobId:'host-read-timeout',rootId:'a'.repeat(64),revision:1,mode:null,publicInputs:null,witnessSHA256:null,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null});
function pending(signal){return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('PRIVATE_PROVIDER_MESSAGE')),{once:true}));}

test('slow state and observation challenges get one bounded read, with no replay or private diagnostics',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const logs=[];t.mock.method(console,'warn',(...args)=>logs.push(args));
 for(const action of ['READ_STATE','OBSERVE_JOB']){
  let calls=0,signal;
  const api=createDevicePagedOwnerApiV3({descriptor:fixture().authority.entries[0].authority.descriptor,fetchImpl:async(_url,options)=>{calls++;signal=options.signal;return pending(signal);}});
  const result=assert.rejects(api.challenge(draft(action)),/MOBILE_PAGED_SERVICE_UNAVAILABLE/);
  t.mock.timers.tick(15000);assert.equal(signal.aborted,false);
  t.mock.timers.tick(44999);assert.equal(signal.aborted,false);
  t.mock.timers.tick(1);await result;assert.equal(calls,1);await api.close();
 }
 assert.equal(logs.length,2);
 for(const [tag,json]of logs){assert.equal(tag,'LIANUM_PAGED_REQUEST_FAILURE');const row=JSON.parse(json);assert.equal(row.reason,'TIMEOUT');assert.equal(row.path,'challenges');assert.deepEqual(Object.keys(row).sort(),['action','elapsedMs','httpStatus','path','reason']);}
 assert.ok(!JSON.stringify(logs).includes('PRIVATE_PROVIDER_MESSAGE'));
});

test('a signed read can outlast fifteen seconds; closing its SDK cancels it without repeating submission',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});t.mock.method(console,'warn',()=>{});
 const descriptor=fixture().authority.entries[0].authority.descriptor;let operationPosts=0,operationSignal;
 const api=createDevicePagedOwnerApiV3({descriptor,fetchImpl:async(url,options)=>{
  if(url.endsWith('/challenges'))return Response.json({...JSON.parse(options.body),version:3,profile:P.DEVICE_PAGED_OWNER_V3,descriptor,challengeId:'host-read-consent',nonce:'b'.repeat(64),recipient:null,expiresAt:Date.now()+15000});
  operationPosts++;operationSignal=options.signal;return pending(operationSignal);
 }});
 const consent=await api.challenge(draft('READ_STATE'));
 const result=assert.rejects(api.submit(consent,'0'.repeat(128)),/MOBILE_PAGED_SERVICE_UNAVAILABLE/);
 t.mock.timers.tick(20000);assert.equal(operationSignal.aborted,false);
 await api.close();await result;assert.equal(operationSignal.aborted,true);assert.equal(operationPosts,1);
 await assert.rejects(api.submit(consent,'0'.repeat(128)),/MOBILE_PAGED_ORIGINAL_SDK/);assert.equal(operationPosts,1);
});

test('financial-effect challenges keep their original short timeout and are never retried',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});t.mock.method(console,'warn',()=>{});let calls=0,signal;
 const api=createDevicePagedOwnerApiV3({descriptor:fixture().authority.entries[0].authority.descriptor,fetchImpl:async(_url,options)=>{calls++;signal=options.signal;return pending(signal);}});
 const result=assert.rejects(api.challenge(draft('WITHDRAW_W39')),/MOBILE_PAGED_SERVICE_UNAVAILABLE/);
 t.mock.timers.tick(15000);await result;assert.equal(signal.aborted,true);assert.equal(calls,1);await api.close();
});

test('opening the original proof worker may exceed fifteen seconds without retrying or extending consent validity',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});t.mock.method(console,'warn',()=>{});let calls=0,signal;
 const descriptor=fixture().authority.entries[0].authority.descriptor;
 const words=hex=>Array.from({length:hex.length/8},(_,i)=>String(BigInt('0x'+hex.slice(i*8,i*8+8))));
 const proofDraft={...draft('PROVE_W39'),mode:'withdraw',publicInputs:[...words(descriptor.scope),...words(descriptor.policy),'1',...words('c'.repeat(64)),...words('d'.repeat(64)),'10',...words('e'.repeat(40))],witnessSHA256:'f'.repeat(64)};
 const api=createDevicePagedOwnerApiV3({descriptor,fetchImpl:async(_url,options)=>{calls++;signal=options.signal;return pending(signal);}});
 const result=assert.rejects(api.challenge(proofDraft),/MOBILE_PAGED_SERVICE_UNAVAILABLE/);
 t.mock.timers.tick(60000);assert.equal(signal.aborted,false);
 t.mock.timers.tick(60000);await result;assert.equal(signal.aborted,true);assert.equal(calls,1);await api.close();
});
