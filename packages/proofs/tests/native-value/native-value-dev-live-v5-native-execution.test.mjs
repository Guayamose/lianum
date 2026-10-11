import {fileURLToPath} from 'node:url';
/** HOST execution framing only. No process, proof, key regeneration, filesystem
 * publication or native/financial acceptance is created by these fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {ROOT,LIMITS} from '../../src/catalog.mjs';
import {I84_NATIVE_PROFILE_V1,I84_NATIVE_BINARY_V1,I84_NATIVE_BINARY_SHA256_V1,I84_NATIVE_LIMITS_V1,
  classifyI84NativeProcessV1,assertI84NativeReceiptV1,nativeI84ExecutionSourcesV1}
  from '../../../backend/src/proving/native-value/runtime/native-value-dev-live-v5-native-execution.mjs';
import {NATIVE_VALUE_LIVE_V2_SPEC,NATIVE_VALUE_LIVE_V2_SOURCE_VERSION,NATIVE_VALUE_LIVE_V2_KEY_SHA256,NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256}
  from '../../src/native-value/metadata/native-value-live-v2-profile.mjs';
import {nativeProofProcessResources,nativeResourceFailure,NATIVE_FLOW_LIMITS}
  from '../../../../tests/integration/native/native-flow-supervisor.mjs';
const runId='01234567-89ab-4def-8abc-0123456789ab',jobId='89abcdef-0123-4567-89ab-cdef01234567';
const argv=[process.execPath,fileURLToPath(new URL('../../../backend/src/proving/native-value/runtime/native-value-dev-live-v5-worker.mjs',import.meta.url)),runId,jobId];
const parent={pid:42,argv};
const bbargv=[I84_NATIVE_BINARY_V1,'msgpack','run','--input','/tmp/bb-42-0-0.sock'];
function receipt(){
  const childIdentity={pid:43,ppid:42,pgrp:40,session:40,startTimeTicks:'100',uid:process.getuid()};
  const execution={profile:I84_NATIVE_PROFILE_V1,backend:'NativeUnixSocket',threads:12,bbVersion:'5.2.0',binarySHA256:I84_NATIVE_BINARY_SHA256_V1,
    originalPreparedKeyRequired:true,oneEphemeralJob:true,memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',rssLimitBytes:LIMITS.workerRSS,
    childIdentity,childClose:{code:null,signal:'SIGTERM'},outputBytes:1,outputByteAccounting:'RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND',
    outputStreamsClosed:true,socketClosed:true,socketRemoved:true};
  const result={sourceVersion:NATIVE_VALUE_LIVE_V2_SOURCE_VERSION,keySHA256:NATIVE_VALUE_LIVE_V2_KEY_SHA256,keyManifestSHA256:NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256,
    runtimePinsSHA256:'12'.repeat(32),limits:I84_NATIVE_LIMITS_V1,threads:12,maximumPages:null,preparedMaximumPages:65536,nativeBackendExecution:execution,
    independentVerification:{backend:'Wasm',threads:1,maximumPages:65536,originalPreparedKeyRequired:true,verifierCRSOnly:true,backendDestroyed:true}};
  const resources={runtimePinsSHA256:result.runtimePinsSHA256,limits:I84_NATIVE_LIMITS_V1,nativeBackendExecution:structuredClone(execution),
    nativeMemoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',nativeChildIdentities:[childIdentity],nativeChildrenGone:true,peakWorkerRSS:100};
  return{result,resources};
}
test('only the exact fixed I84 V5 coordinator and original socket child get their execution labels',()=>{
  assert.deepEqual(classifyI84NativeProcessV1(argv,process.execPath,null),{role:'native-value-dev-live-v5-native-coordinator',proofWorker:false});
  assert.deepEqual(classifyI84NativeProcessV1(bbargv,I84_NATIVE_BINARY_V1,parent),{role:'native-value-dev-live-v5-native-backend',proofWorker:true});
  for(const invalid of[[...argv,'Wasm'],[process.execPath,fileURLToPath(new URL('../../../backend/src/proving/native-value/runtime/native-value-live-v2-worker.mjs',import.meta.url)),runId,jobId],
    [process.execPath,fileURLToPath(new URL('../../src/jobs/worker.mjs',import.meta.url)),'authorization','prove',runId]])
    assert.equal(classifyI84NativeProcessV1(invalid,process.execPath,null),null);
  assert.equal(classifyI84NativeProcessV1(bbargv,I84_NATIVE_BINARY_V1,{pid:42,argv:[process.execPath,'caller.mjs']}),null);
  assert.throws(()=>classifyI84NativeProcessV1([...bbargv.slice(0,-1),'/tmp/caller.sock'],I84_NATIVE_BINARY_V1,parent),/FIXED_CHILD_ARGUMENTS/);
  assert.throws(()=>nativeI84ExecutionSourcesV1({paths:[]}),{code:'ERR_ASSERTION'});
});
test('native12 receipts join original program/key provenance, thread/limits/source and actual child/socket closure',()=>{
  const okay=receipt();assert.equal(assertI84NativeReceiptV1(NATIVE_VALUE_LIVE_V2_SPEC,okay.result,okay.resources),true);
  assert.equal(LIMITS.threads,1);assert.equal(LIMITS.workerRSS,3221225472);
  const mutations=[
    r=>{r.result.threads=11;},r=>{r.result.threads=13;},r=>{r.result.nativeBackendExecution.threads=16;},
    r=>{r.result.limits={...I84_NATIVE_LIMITS_V1,threads:11};},r=>{r.resources.runtimePinsSHA256='34'.repeat(32);},
    r=>{r.result.keySHA256='34'.repeat(32);},r=>{r.result.keyManifestSHA256='34'.repeat(32);},r=>{r.result.sourceVersion='34'.repeat(32);},
    r=>{r.result.maximumPages=65536;},r=>{r.result.nativeBackendExecution.binarySHA256='34'.repeat(32);},
    r=>{r.resources.nativeChildrenGone=false;},r=>{r.result.nativeBackendExecution.socketClosed=false;},
    r=>{r.result.nativeBackendExecution.childClose={code:null,signal:'SIGKILL'};},r=>{r.resources.nativeChildIdentities[0]={...r.resources.nativeChildIdentities[0],uid:process.getuid()+1};},
    r=>{r.result.independentVerification.backendDestroyed=false;},r=>{r.resources.peakWorkerRSS=LIMITS.workerRSS+1;},
  ];
  for(const change of mutations){const value=receipt();change(value);assert.throws(()=>assertI84NativeReceiptV1(NATIVE_VALUE_LIVE_V2_SPEC,value.result,value.resources));}
});
test('coordinator plus its sole native child share the existing 3 GiB bound and heavy-job count',()=>{
  const measured=nativeProofProcessResources([
    {pid:42,ppid:40,state:'R',role:'native-value-dev-live-v5-native-coordinator',proofWorker:false,rssBytes:800000000},
    {pid:43,ppid:42,state:'S',role:'native-value-dev-live-v5-native-backend',proofWorker:true,rssBytes:2500000000},
  ]);
  assert.equal(measured.liveProofWorkers,1);assert.equal(measured.maximumProofWorkerRSSBytes,3300000000);
  assert.equal(nativeResourceFailure({...measured,availableRAMBytes:NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes,
    freeDiskBytes:NATIVE_FLOW_LIMITS.minimumFreeDiskBytes,mainWorkerRSSBytes:0,supervisorRSSBytes:0}),'NATIVE_PROOF_WORKER_RSS_LIMIT');
});
