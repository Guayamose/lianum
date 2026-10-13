/** Original SDK read failure and bounded scheduling; no custody, proof or RPC. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {createDevicePagedOwnerApiV3} from '../../../../apps/mobile/src/api/device-paged-owner-api-v3.mjs';
const source=await readFile(new URL('../../../../apps/mobile/src/api/device-paged-read-retry-v3.mjs',import.meta.url),'utf8');
function policy(){const clock={now:100};const create=runInNewContext(source.replace(/^export /gm,'')+'\ncreateDevicePagedReadRetryV3;',{performance:{now:()=>clock.now},Error});return{clock,retry:create()};}
const hash=value=>createHash('sha256').update(value).digest('hex');
const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9444',pairingId:'read-retry-original-sdk',devicePublicKey:'0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',deadlineMs:P.devicePagedNowV3()+3600000,chainId:'31337',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(name=>[name,hash(name)])),...Object.fromEntries(['pool','state','native','math'].map((name,i)=>[name,'0x'+String(i+1).repeat(40)]))});
const draft=()=>({action:'READ_STATE',jobId:'read-state-'+Math.random().toString(16).slice(2),rootId:hash('root'),revision:1,mode:null,publicInputs:null,witnessSHA256:null,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null});
test('actual owner SDK failure retries fresh read challenges only, then stops',async()=>{
 const calls=[],api=createDevicePagedOwnerApiV3({descriptor,fetchImpl:async(url,request)=>{const body=JSON.parse(request.body);calls.push({url,body});throw Error('OFFLINE_FIXTURE');}}),{clock,retry}=policy();
 try{for(let attempt=0;attempt<4;attempt++){
  assert.equal(retry.available(),true);const next=draft();let error;try{await api.challenge(next);}catch(value){error=value;}assert.equal(error.message,'MOBILE_PAGED_SERVICE_UNAVAILABLE');assert.equal(retry.failed(error),attempt<3);
  if(attempt<3){assert.equal(retry.available(),false);clock.now+=12000;}
 }
 assert.equal(retry.available(),false);assert.equal(retry.exhausted(),true);assert.equal(new Set(calls.map(row=>row.body.jobId)).size,4);assert(calls.every(row=>row.url.endsWith('/challenges')&&row.body.action==='READ_STATE'));assert.equal(calls.filter(row=>row.url.endsWith('/operations')).length,0);
 }finally{await api.close();}
});
test('retry window and invalid monotonic time stop new reads; explicit reset starts a new window',()=>{
 const {clock,retry}=policy(),error=Error('MOBILE_PAGED_GRAPH_SERVICE_UNAVAILABLE');assert(retry.failed(error));clock.now+=120000;assert.equal(retry.available(),false);assert(retry.exhausted());retry.reset();assert(retry.available());assert(retry.failed(error));clock.now--;assert.equal(retry.available(),false);assert(retry.exhausted());
});
test('only recognized read clocks retry; corrupted scope, cancellation and getters fail closed',()=>{
 for(const code of ['MOBILE_PAGED_CLOCK_FUTURE','MOBILE_PAGED_CLOCK_EXPIRED','MOBILE_PAGED_GRAPH_STATUS_FUTURE','MOBILE_PAGED_GRAPH_STATUS_EXPIRED']){const {retry}=policy();assert(retry.failed(Object.defineProperty(Error('MOBILE_PAGED_GRAPH_MESSAGE'),'code',{value:code})));}
 for(const code of ['MOBILE_PAGED_GRAPH_ORIGINAL_SDK','MOBILE_PAGED_OWNER_BINDING','MOBILE_CUSTODY_AES_DECRYPT','MOBILE_PAGED_CLOCK_INVALID','MOBILE_PAGED_CLOCK_BINDING','MOBILE_PAGED_CLOCK_CANCELLED','MOBILE_PAGED_SCREEN_CLOSED']){const {retry}=policy();assert.equal(retry.failed(Error(code)),false);assert.equal(retry.available(),false);}
 let called=false;const bad=Object.defineProperty(Error('MOBILE_PAGED_GRAPH_MESSAGE'),'code',{get(){called=true;throw Error('PRIVATE_PAYLOAD');}});const {retry}=policy();assert.equal(retry.failed(bad),false);assert.equal(called,false);
});
