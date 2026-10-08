/** HOST framing/orchestration only. These fixtures create no native process,
 * proof, account, key provenance or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {join} from 'node:path';
import {ROOT,LIMITS,MEMORY} from '../../src/catalog.mjs';
import {RESERVATION_NATIVE_PROFILE_V1,RESERVATION_NATIVE_BINARY_V1,RESERVATION_NATIVE_BINARY_SHA256_V1,RESERVATION_NATIVE_LINEAGE_V1,
  usesNativeReservationV1,classifyReservationNativeProcessV1,assertNativeReservationReceiptV1} from '../../src/jobs/reservation-native-execution-v1.mjs';
import {classifyNodeNativeProcessV1} from '../../src/jobs/node-native-execution-v1.mjs';
import {classifyAuthorizationNativeProcessV1} from '../../src/jobs/authorization-native-execution-v1.mjs';
import {limitsForMode,PROVING_LIMITS,RESERVATION_NATIVE_PROVING_LIMITS_V1} from '../../src/jobs/proving-execution.mjs';
import {nativeProofProcessResources,nativeResourceFailure,nativeWalletUnfundedProcessFailure,NATIVE_FLOW_LIMITS}
  from '../../../../tests/integration/native/native-flow-supervisor.mjs';
const runId='01234567-89ab-4def-8abc-0123456789ab';
const argv=[process.execPath,join(ROOT,'proof-workers/worker.mjs'),'reservation','prove',runId],parent={pid:42,argv};
const bbargv=[RESERVATION_NATIVE_BINARY_V1,'msgpack','run','--input','/tmp/bb-42-0-0.sock'];
function receipts(){
 const execution={profile:RESERVATION_NATIVE_PROFILE_V1,backend:'NativeUnixSocket',threads:12,bbVersion:'5.2.0',binarySHA256:RESERVATION_NATIVE_BINARY_SHA256_V1,
  originalPreparedKeyRequired:true,oneEphemeralJob:true,memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',rssLimitBytes:LIMITS.workerRSS,
  childIdentity:{pid:43,ppid:42,pgrp:40,session:40,startTimeTicks:'100'},childClose:{code:null,signal:'SIGTERM'},outputBytes:1,
  outputByteAccounting:'RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND',outputStreamsClosed:true,socketClosed:true,socketRemoved:true};
 const result={threads:12,maximumPages:null,preparedMaximumPages:MEMORY.standard,limits:RESERVATION_NATIVE_PROVING_LIMITS_V1,
  ...RESERVATION_NATIVE_LINEAGE_V1,runtimePinsSHA256:'12'.repeat(32),nativeBackendExecution:execution,
  independentVerification:{backend:'Wasm',threads:1,maximumPages:MEMORY.standard,originalPreparedKeyRequired:true,verifierCRSOnly:true,
   backendDestroyed:true,nativeProducerClosedBeforeVerification:true}};
 const resources={limits:RESERVATION_NATIVE_PROVING_LIMITS_V1,runtimePinsSHA256:result.runtimePinsSHA256,nativeBackendExecution:structuredClone(execution),
  nativeMemoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',nativeChildIdentities:[execution.childIdentity],nativeChildrenGone:true,peakWorkerRSS:100};
 return{result,resources};
}
test('only original S proving selects native12 and is classified before the strict U same-binary matcher',()=>{
 assert.equal(RESERVATION_NATIVE_PROFILE_V1,'LIANUM_ORIGINAL_S_NATIVE_UNIX_SOCKET_V1');
 assert.equal(usesNativeReservationV1({name:'reservation'},'prove'),true);assert.equal(usesNativeReservationV1({name:'reservation'},'compile'),false);
 assert.equal(usesNativeReservationV1({name:'authorization'},'prove'),false);
 assert.equal(limitsForMode({name:'reservation'},'prove'),RESERVATION_NATIVE_PROVING_LIMITS_V1);
 assert.equal(limitsForMode({name:'reservation'},'verify'),LIMITS);assert.equal(limitsForMode({name:'ready'},'prove'),PROVING_LIMITS);
 assert.deepEqual(classifyReservationNativeProcessV1(argv,process.execPath,null),{role:'flat-reservation-native-coordinator',proofWorker:false});
 assert.deepEqual(classifyReservationNativeProcessV1(bbargv,RESERVATION_NATIVE_BINARY_V1,parent),{role:'flat-reservation-native-backend',proofWorker:true});
 assert.equal(classifyNodeNativeProcessV1(bbargv,RESERVATION_NATIVE_BINARY_V1,parent),null);
 assert.throws(()=>classifyAuthorizationNativeProcessV1(bbargv,RESERVATION_NATIVE_BINARY_V1,parent),/ORIGINAL_PARENT/);
 for(const relation of ['authorization','node','ready','settlement']){
  const other={pid:42,argv:[...argv.slice(0,2),relation,...argv.slice(3)]};
  assert.equal(classifyReservationNativeProcessV1(other.argv,process.execPath,null),null);
  assert.equal(classifyReservationNativeProcessV1(bbargv,RESERVATION_NATIVE_BINARY_V1,other),null);
 }
 assert.equal(classifyReservationNativeProcessV1([...argv,'NativeUnixSocket'],process.execPath,null),null);
 assert.throws(()=>classifyReservationNativeProcessV1([...bbargv.slice(0,-1),'/tmp/caller.sock'],RESERVATION_NATIVE_BINARY_V1,parent),/FIXED_CHILD_ARGUMENTS/);
});
test('new S receipts require retained original ACIR/key, close joins and independent Wasm1 after native closure',()=>{
 const okay=receipts();assert.equal(assertNativeReservationReceiptV1({name:'reservation'},okay.result,okay.resources),true);
 for(const change of [
  r=>{r.result.keySHA256='34'.repeat(32);},r=>{r.result.bytecodeSHA256='34'.repeat(32);},r=>{r.result.sourceVersion='34'.repeat(32);},r=>{r.result.artifactSHA256='34'.repeat(32);},
  r=>{r.result.keyManifestSHA256='34'.repeat(32);},r=>{r.result.maximumPages=MEMORY.standard;},
  r=>{r.result.threads=4;},r=>{r.result.limits=PROVING_LIMITS;r.resources.limits=PROVING_LIMITS;},
  r=>{r.result.independentVerification.threads=12;},r=>{r.result.independentVerification.backendDestroyed=false;},
  r=>{r.result.independentVerification.nativeProducerClosedBeforeVerification=false;},
  r=>{r.resources.nativeChildrenGone=false;},r=>{r.resources.peakWorkerRSS=LIMITS.workerRSS+1;},
  r=>{r.resources.runtimePinsSHA256='34'.repeat(32);},
  r=>{r.result.nativeBackendExecution.socketClosed=false;r.resources.nativeBackendExecution=structuredClone(r.result.nativeBackendExecution);},
  r=>{r.result.nativeBackendExecution.childClose={code:null,signal:'SIGKILL'};r.resources.nativeBackendExecution=structuredClone(r.result.nativeBackendExecution);},
 ]){const row=receipts();change(row);assert.throws(()=>assertNativeReservationReceiptV1({name:'reservation'},row.result,row.resources));}
 assert.throws(()=>assertNativeReservationReceiptV1({name:'authorization'},okay.result,okay.resources));
});
test('S coordinator and BB share one 3GiB slot; independent verification keeps that slot until worker close',()=>{
 const coordinator={pid:42,ppid:40,state:'R',rssBytes:800000000,...classifyReservationNativeProcessV1(argv,process.execPath,null)},
  backend={pid:43,ppid:42,state:'S',rssBytes:2400000000,...classifyReservationNativeProcessV1(bbargv,RESERVATION_NATIVE_BINARY_V1,parent)};
 const host={availableRAMBytes:NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes,freeDiskBytes:NATIVE_FLOW_LIMITS.minimumFreeDiskBytes,mainWorkerRSSBytes:0,supervisorRSSBytes:0};
 assert.equal(nativeProofProcessResources([coordinator,backend]).liveProofWorkers,1);
 assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([coordinator,backend])}),null);
 assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([coordinator,{...backend,rssBytes:2500000000}])}),'NATIVE_PROOF_WORKER_RSS_LIMIT');
 assert.equal(nativeProofProcessResources([coordinator]).liveProofWorkers,1);
 assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([coordinator,{pid:44,ppid:40,state:'R',rssBytes:1,proofWorker:true}])}),'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS');
 assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([coordinator,{...backend,rssBytes:1},{...backend,pid:44,rssBytes:1}])}),'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS');
 assert.equal(nativeWalletUnfundedProcessFailure([coordinator]),'NATIVE_WALLET_UNFUNDED_PROOF_FORBIDDEN');
});
test('the actual S verification continuation awaits native close and never opens Wasm on a close refusal',async()=>{
 const canonicalWorker=new URL('../../src/jobs/worker.mjs',import.meta.url);
 const source=readFileSync(existsSync(canonicalWorker)?canonicalWorker:join(ROOT,'proof-workers/worker.mjs'),'utf8');
 const begin=source.indexOf('async function verifyNativeReservationIndependently('),end=source.indexOf('async function verifyNativeNodeIndependently(',begin);
 assert.ok(begin>=0&&end>begin);const original=source.slice(begin,end).trim();
 function fixture(close){
  const events=[],key=Uint8Array.of(1),proof=Uint8Array.of(2),words=['3'];
  const context={assert,MEMORY,nativeReservation:true,reservationNativeActive:true,report:{},spec:{name:'reservation'},api:null,
   phase:()=>{},freezeCheck:()=>{},verifierWords:(_spec,input)=>input,measured:(_name,work)=>work()};
  context.destroy=async()=>{if(context.reservationNativeActive){events.push('native-close-started');await close();context.reservationNativeActive=false;
    context.report.nativeBackendExecution={hostFixture:true};events.push('native-closed');}else events.push('wasm-destroyed');};
  context.initialize=async(_bb,pages,only)=>{assert.equal(context.reservationNativeActive,false);assert.equal(pages,MEMORY.standard);assert.equal(only,true);
   events.push('wasm-opened');context.api={hostFixture:true};};
  const bb={UltraHonkVerifierBackend:class{constructor(api){assert.equal(api,context.api);}async verifyProof(request,options){
    assert.equal(request.verificationKey,key);assert.equal(request.proof,proof);assert.equal(request.publicInputs,words);
    assert.equal(JSON.stringify(options),JSON.stringify({verifierTarget:'evm'}));events.push('wasm-verified');return true;}}};
  const action=new Script('('+original+')').runInContext(createContext(context));
  return{events,context,run:()=>action(bb,{key},proof,words)};
 }
 let release;const pending=new Promise(resolve=>{release=resolve;}),delayed=fixture(()=>pending),result=delayed.run();
 await Promise.resolve();assert.deepEqual(delayed.events,['native-close-started']);release();await result;
 assert.deepEqual(delayed.events,['native-close-started','native-closed','wasm-opened','wasm-verified','wasm-destroyed']);
 assert.equal(delayed.context.report.independentVerification.nativeProducerClosedBeforeVerification,true);
 const rejection=new Error('PW_NATIVE_ORIGINAL_CLOSE_REJECTED'),failed=fixture(async()=>{throw rejection;});
 await assert.rejects(failed.run(),error=>error===rejection);assert.deepEqual(failed.events,['native-close-started']);
 assert.equal(failed.context.report.independentVerification,undefined);
});
