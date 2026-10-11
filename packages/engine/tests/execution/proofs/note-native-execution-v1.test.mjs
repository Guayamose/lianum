/** HOST framing, encrypted journal and actual close/verify continuation only.
 * No circuit witness, account authority, native process or financial state. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Vault} from '../../../src/crypto/vault.mjs';
import {copy as accountCopy} from '../../../src/execution/accounts/generic-account-journal.mjs';
import {captureNativeDeviceOriginalW39MetricsFrameV1,restoreNativeDeviceOriginalW39MetricsFrameV1}
  from '../../../../backend/src/accounts/authority/native-device-original-w39-metrics-frame-v1.mjs';
import {createContext,Script} from 'node:vm';
import {NOTE_NATIVE_PROFILE_V1,NOTE_NATIVE_THREADS_V1,NOTE_NATIVE_BINARY_V1,NOTE_NATIVE_BINARY_SHA256_V1,
 NOTE_NATIVE_PINS_V1,NOTE_NATIVE_WORKERS_V1,NOTE_NATIVE_LINEAGE_V1,classifyNativeEconomicNoteProcessV1,assertNativeEconomicNoteTelemetryV1,
 assertNativeEconomicNoteReceiptV1} from '@lianum/proofs/execution/note-native-execution-v1';
import {PRIVATE_NOTE_NATIVE_PROFILE_V1,assertNativePrivateEconomicNoteReceiptV3}
 from '@lianum/proofs/jobs/native-private-note-execution-v3';
import {nativeProofProcessResources,nativeResourceFailure,nativeWalletUnfundedProcessFailure,NATIVE_FLOW_LIMITS}
 from '../../../../../tests/integration/native/native-flow-supervisor.mjs';
import {PRIVATE_RESOURCE_POLICY} from '@lianum/components/resources/private-resource-policy';
import {LIMITS,MEMORY} from '@lianum/proofs/catalog';
function receipt(mode){
 const execution={profile:NOTE_NATIVE_PROFILE_V1,backend:'NativeUnixSocket',threads:12,bbVersion:'5.2.0',
  binarySHA256:NOTE_NATIVE_BINARY_SHA256_V1,originalPreparedKeyRequired:true,oneEphemeralJob:true,
  memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',rssLimitBytes:LIMITS.workerRSS,
  childIdentity:{pid:43,ppid:42,pgrp:40,session:40,startTimeTicks:'100'},childClose:{code:0,signal:null},outputBytes:1,
  outputByteAccounting:'RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND',outputStreamsClosed:true,socketClosed:true,socketRemoved:true};
 const worker={...NOTE_NATIVE_LINEAGE_V1[mode],threads:12,maximumPages:null,preparedMaximumPages:32768,
  zeroKnowledgeEnabled:true,verified:true,
  toolchain:{node:'v24.19.0',noir:'1.0.0-beta.25',barretenberg:'5.2.0',auditSHA256:'81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6'},
  crs:{points:2097152,provenanceSHA256:'e24f63bcea7cc9d1430c3696c109569015fc38c6e44d5a46ebab3a64013939e3',records:[
   {file:'bn254_g1_compressed.dat',bytes:67108864,sha256:'3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37'},
   {file:'bn254_g2.dat',bytes:128,sha256:'01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f'}]},nativeBackendExecution:execution,
  independentVerification:{backend:'Wasm',threads:1,maximumPages:32768,originalPreparedKeyRequired:true,
   verifierCRSOnly:true,backendDestroyed:true,nativeProducerClosedBeforeVerification:true}};
 return{worker,resource:{nativeChildrenGone:true,nativeBackendExecution:structuredClone(execution),
  nativeChildIdentities:[execution.childIdentity],nativeMemoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',peakWorkerRSS:1}};
}
test('fixed D26/W39 preserve prepared lineage, native receipt and an opaque constructor/reopen profile without changing legacy',async()=>{
 assert.equal(NOTE_NATIVE_THREADS_V1,12);
 for(const mode of ['deposit_balance','withdraw_balance']){
  const parent={pid:42,argv:[process.execPath,NOTE_NATIVE_WORKERS_V1[mode]]};
  const bb=[NOTE_NATIVE_BINARY_V1,'msgpack','run','--input','/tmp/bb-42-0-0.sock'];
  const label=classifyNativeEconomicNoteProcessV1(parent.argv,process.execPath,null);
  assert.deepEqual(label,{role:'economic-note-native-coordinator',proofWorker:false});
  const native=classifyNativeEconomicNoteProcessV1(bb,NOTE_NATIVE_BINARY_V1,parent);
  assert.deepEqual(native,{role:'economic-note-native-backend',proofWorker:true});
  assert.throws(()=>classifyNativeEconomicNoteProcessV1([...bb.slice(0,-1),'/tmp/caller.sock'],NOTE_NATIVE_BINARY_V1,parent));
  assert.equal(classifyNativeEconomicNoteProcessV1([...parent.argv,mode],process.execPath,null),null);
  assert.equal(classifyNativeEconomicNoteProcessV1(bb,NOTE_NATIVE_BINARY_V1,{pid:42,argv:[process.execPath,'/tmp/caller.mjs']}),null);
  const rows=[{pid:42,ppid:40,state:'R',rssBytes:800000000,...label},
   {pid:43,ppid:42,state:'S',rssBytes:2400000000,...native}];
  const host={availableRAMBytes:NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes,freeDiskBytes:NATIVE_FLOW_LIMITS.minimumFreeDiskBytes,
   mainWorkerRSSBytes:0,supervisorRSSBytes:0};
  assert.equal(nativeProofProcessResources(rows).liveProofWorkers,1);
  assert.equal(nativeProofProcessResources(rows.slice(0,1)).liveProofWorkers,1);
  assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources(rows)}),null);
  assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([rows[0],{...rows[1],rssBytes:2500000000}])}),'NATIVE_PROOF_WORKER_RSS_LIMIT');
  assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([...rows,{...rows[1],pid:44,rssBytes:1}])}),'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS');
  assert.equal(nativeWalletUnfundedProcessFailure(rows.slice(0,1)),'NATIVE_WALLET_UNFUNDED_PROOF_FORBIDDEN');
  const okay=receipt(mode);assert.equal(assertNativeEconomicNoteReceiptV1(mode,okay.worker,okay.resource),true);
  for(const change of [
   r=>{r.worker.keySHA256='34'.repeat(32);},r=>{r.worker.circuitSHA256='34'.repeat(32);},
   r=>{r.worker.provenanceSHA256='34'.repeat(32);},r=>{r.worker.artifactSHA256='34'.repeat(32);},
   r=>{r.worker.crs.records[0].sha256='34'.repeat(32);},r=>{r.worker.toolchain.barretenberg='6.0.0';},
   r=>{r.worker.threads=1;},r=>{r.worker.maximumPages=32768;},r=>{r.worker.zeroKnowledgeEnabled=false;},
   r=>{r.worker.independentVerification.threads=12;},r=>{r.worker.independentVerification.nativeProducerClosedBeforeVerification=false;},
   r=>{r.worker.independentVerification.backendDestroyed=false;},r=>{r.resource.nativeChildrenGone=false;},
   r=>{r.resource.peakWorkerRSS=LIMITS.workerRSS+1;},r=>{r.resource.nativeChildIdentities=[];},
   r=>{r.worker.nativeBackendExecution.childClose={code:null,signal:'SIGKILL'};},
   r=>{r.worker.nativeBackendExecution.socketRemoved=false;},r=>{r.resource.nativeBackendExecution.outputStreamsClosed=false;},
  ]){const row=receipt(mode);change(row);assert.throws(()=>assertNativeEconomicNoteReceiptV1(mode,row.worker,row.resource));}
  assert.throws(()=>assertNativeEconomicNoteReceiptV1(mode==='deposit_balance'?'withdraw_balance':'deposit_balance',okay.worker,okay.resource));
 }
 function telemetry(mode){const row=receipt(mode),proofSHA256='12'.repeat(32),publicInputsSHA256='23'.repeat(32);
  const e={...NOTE_NATIVE_LINEAGE_V1[mode],...row.resource,id:'01234567-89ab-4cde-8fab-0123456789ab',mode,operation:'prove',purpose:'owner',
   classification:'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY',phase:'completed',acceptedResult:true,exit:{code:0,signal:null},
   lockPreserved:false,zeroKnowledgeEnabled:true,policy:structuredClone(PRIVATE_RESOURCE_POLICY),threads:12,maximumPages:null,preparedMaximumPages:32768,
   worker:{...row.worker,proofSHA256,publicInputsSHA256,publicInputCount:mode==='deposit_balance'?26:39},
   resourceSamples:[{availableRAM:PRIVATE_RESOURCE_POLICY.floors.availableRAM,freeDisk:PRIVATE_RESOURCE_POLICY.floors.freeDisk,workerRSS:1}]};
  return{relation:mode,returnedMetrics:e,storedMetrics:structuredClone(e),proofSHA256,publicInputsSHA256,telemetrySHA256:'34'.repeat(32)};
 }
 for(const mode of ['deposit_balance','withdraw_balance']){
  assert.equal(assertNativeEconomicNoteTelemetryV1(telemetry(mode)).resourceReceiptCompleted,true);
  for(const mutate of[e=>{e.lockPreserved=true;},e=>{e.worker.proofSHA256='45'.repeat(32);},
   e=>{e.resourceSamples[0].workerRSS=LIMITS.workerRSS+1;},e=>{e.threads=1;},e=>{e.preparedMaximumPages=65536;},e=>{e.phase='failed';}]){
   const value=telemetry(mode);mutate(value.returnedMetrics);value.storedMetrics=structuredClone(value.returnedMetrics);
   assert.throws(()=>assertNativeEconomicNoteTelemetryV1(value));
  }
  const changed=telemetry(mode);changed.storedMetrics.worker.proofSHA256='45'.repeat(32);assert.throws(()=>assertNativeEconomicNoteTelemetryV1(changed));
 }
 // Execute original constructor bodies and original one-use recovery prefix.
 // These HOST stubs expose selection only, never an account/system authority.
 const physical=import.meta.url.includes('/packages/engine/tests/');
 const authority=readFileSync(new URL(physical?'../../../../backend/src/accounts/authority/native-value-account-authority-v2.mjs'
  :'../../../omnichain-flat-profile/flat-wallet/wallet-platform/modules/global-state/native-value-account-authority-v2.mjs',import.meta.url),'utf8');
 const legacy=authority.slice(authority.indexOf('export async function createNativeValueAccountAuthority('),authority.indexOf('/** New fixed economic note producer;'));
 const begin=authority.indexOf('export async function createNativeEconomicNoteAccountAuthorityV1('),end=authority.indexOf('export async function createWrappedWalletAccountAuthorityV1(',begin);
 assert.ok(begin>=0&&end>begin);
 const context=createContext({assert,createAccountAuthority:(...values)=>values});
 const constructors=new Script(legacy.replace('export ','')+authority.slice(begin,end).replace('export ','')+
  ';({legacy:createNativeValueAccountAuthority,native:createNativeEconomicNoteAccountAuthorityV1})').runInContext(context);
 const input={},callbacks={};assert.deepEqual(Array.from(await constructors.legacy(input,callbacks)),[input,callbacks,false]);
 assert.deepEqual(Array.from(await constructors.native(input,callbacks)),[input,callbacks,false,null,true]);
 await assert.rejects(constructors.native(input,callbacks,'caller-backend'),/CONSTRUCTOR_ARITY/);
 const reopenBegin=authority.indexOf('export async function reopenOriginalNativeAccountEconomicRecoveryV1('),
  reopenEnd=authority.indexOf("  assert.equal(retained.sourceSHA256, admitted.sourceSHA256);",reopenBegin);
 assert.ok(reopenBegin>=0&&reopenEnd>reopenBegin);
 const prefix=authority.slice(reopenBegin,reopenEnd).replace('export ','')+'return nativeNote; }';
 const issued=Object.freeze(Object.create(null));let used=false,currentSchema;
 const recoveryContext=createContext({assert,exactRecord:(value,keys)=>assert.deepEqual(Object.keys(value).sort(),Array.from(keys).sort()),
  nativeEconomicRecoverySectionIdentityV1:token=>{assert.equal(token,issued);return{sourceSHA256:'56'.repeat(32)};},
  nativeValueOriginalRecoverySourceV1:()=> '56'.repeat(32),consumeNativeEconomicRecoverySectionV1:token=>{
   assert.equal(token,issued);assert.equal(used,false);used=true;return Object.fromEntries([
    ['schema',currentSchema],...['sourceSHA256','poolIndex','directory','password','accountId','journalId','checkpointSHA256',
     'identitySHA256','accountIdentity','ownerIdentity','hasNativeExecution','manualMode','providerBindings'].map(name=>[name,null])]);}});
 const reopen=new Script('('+prefix+')').runInContext(recoveryContext),contexts={runtime:{},system:{},owner:{},nativeExecution:null,providerCustody:{}};
 for(const [schema,expected]of[['ORIGINAL_NATIVE_ACCOUNT_ECONOMIC_RECOVERY_V1',false],['ORIGINAL_NATIVE_NOTE_ACCOUNT_ECONOMIC_RECOVERY_V1',true]]){
  currentSchema=schema;used=false;assert.equal(await reopen(issued,contexts),expected);
  await assert.rejects(reopen(issued,contexts));
 }
 currentSchema='caller-backend';used=false;await assert.rejects(reopen(issued,contexts),/ORIGINAL_RECOVERY_PROFILE/);
 used=false;await assert.rejects(reopen(Object.freeze(Object.create(null)),contexts));
 // Execute the actual facade finish boundary: missing startup capture is
 // unknown, even after the original coordinator close. This synthetic HOST
 // metadata establishes no actual subprocess/lock or financial acceptance.
 const facade=readFileSync(new URL(physical?'../../../../proofs/src/execution/proof-process.mjs':'../../src/paeg/proof-process.mjs',import.meta.url),'utf8');
 const finishBegin=facade.indexOf('const finish = (exitCode, signal) => {'),finishEnd=facade.indexOf('    current = { done, stop };',finishBegin);
 assert.ok(finishBegin>=0&&finishEnd>finishBegin);const finishBody=facade.slice(finishBegin,finishEnd);
 function finishFixture(body,identities){
  const report={nativeChildIdentities:identities,phase:'aborting'},released=[],persisted=[],failures=[];
  const context=createContext({finished:false,monitor:null,deadline:null,killTimer:null,payload:null,report,
   began:0,performance:{now:()=>1},failure:Object.assign(new Error('PAEG_PROOF_STARTUP_FAILURE'),{code:'PAEG_PROOF_STARTUP_FAILURE'}),
   resultSeen:false,nativeNote:true,nativeProducer:true,mode:'deposit_balance',result:null,
   sample:()=>({}),nativeProcStatV1:()=>null,need:(value,code)=>assert.ok(value,code),
   proofError:code=>Object.assign(new Error(code),{code}),filePin:()=>{},nativeNoteRunnerFile:'public-host-runner',workerFile:'public-host-worker',
   legacyWorkerFile:'public-host-legacy',fileURLToPath:()=> 'public-host-parent',codePins:{nativeNoteRunner:{},nativeNoteEntries:{deposit_balance:{}},worker:{},parent:{}},
   persist:()=>persisted.push(structuredClone(report)),releaseLock:()=>released.push(true),
   current:{},activeHostJob:{},lastReport:null,child:{stdio:[]},structuredClone,wipePrivate:()=>{},
   rejectDone:error=>failures.push(error),resolveDone:()=>{throw Error('HOST_FAILED_JOB_NEVER_ACCEPTED');},clearInterval:()=>{},clearTimeout:()=>{}});
  // import.meta is data-only here; the source body otherwise remains original.
  const finish=new Script(body.replace('import.meta.url',"'public-host-parent'")+';finish').runInContext(context);
  finish(1,null);return{report,released,persisted,failures};
 }
 const unknown=finishFixture(finishBody,[]);assert.equal(unknown.report.nativeChildrenGone,false);
 assert.equal(unknown.report.lockPreserved,true);assert.equal(unknown.report.acceptedResult,false);
 assert.equal(unknown.released.length,0);assert.equal(unknown.persisted.at(-1).lockPreserved,true);
 assert.equal(unknown.failures[0].code,'PAEG_PROOF_STARTUP_FAILURE');
 const prior=finishBody.replace(/report.nativeChildrenGone=\(!nativeProducer\|\|Array.isArray\(report.nativeChildIdentities\)\&\&report.nativeChildIdentities.length>0\)\s*\&\&\(report.nativeChildIdentities\?\.every\(identity=>nativeProcStatV1\(identity.pid\)===null\)\?\?!nativeProducer\);/,
  'report.nativeChildrenGone=report.nativeChildIdentities?.every(identity=>nativeProcStatV1(identity.pid)===null)??true;');
 assert.notEqual(prior,finishBody);const old=finishFixture(prior,[]);assert.equal(old.released.length,1,'HOST_REPRO_OLD_EMPTY_CAPTURE_RELEASED');
 const captured=finishFixture(finishBody,[{pid:43,ppid:42,pgrp:40,session:40,startTimeTicks:'100'}]);
 assert.equal(captured.report.nativeChildrenGone,true);assert.equal(captured.report.lockPreserved,false);assert.equal(captured.released.length,1);
 assert.equal(captured.report.acceptedResult,false,'HOST_CLOSED_FAILURE_STAYS_REJECTED');
 assert.throws(()=>{NOTE_NATIVE_PINS_V1[0][1]='34'.repeat(32);},TypeError);
});
test('actual note verification continuation waits for original Child.close and never opens Wasm after rejected closure',async()=>{
 const source=readFileSync(new URL(import.meta.url.includes('/packages/engine/tests/')?'../../../../proofs/src/execution/note-native-execution-v1.mjs'
  :'../../src/paeg/note-native-execution-v1.mjs',import.meta.url),'utf8');
 const begin=source.indexOf('async function verifyOriginalNoteAfterNativeCloseV1('),end=source.indexOf('export async function proveNativeEconomicNoteV1(',begin);
 assert.ok(begin>=0&&end>begin);const original=source.slice(begin,end);
 function fixture(close,verified=true){
  const events=[],key=Uint8Array.of(1),proof=Uint8Array.of(2);
  const api={async destroy(){events.push('wasm-destroyed');}};
  const bb={BackendType:{Wasm:'Wasm'},BN254_G1_GENERATOR:'public-host-generator',
   Barretenberg:{async new(options){assert.equal(options.backend,'Wasm');assert.equal(options.threads,1);
    assert.equal(options.memory.maximum,32768);events.push('wasm-opened');return api;}},
   UltraHonkVerifierBackend:class{constructor(value){assert.equal(value,api);}async verifyProof(request,options){
    assert.equal(request.verificationKey,key);assert.equal(request.proof,proof);
    assert.deepEqual(Array.from(request.publicInputs),['0x'+'3'.padStart(64,'0')]);assert.equal(options.verifierTarget,'evm');
    events.push('wasm-verified');return verified;}}};
  const context=createContext({assert,MEMORY,CRS:'public-host/',readFileSync:()=>Uint8Array.of(4),
   initializePrivateVerifierCRS:async()=>{events.push('verifier-crs-only');}});
  const action=new Script('('+original+')').runInContext(context);
  return{events,run:()=>action(bb,{key},{proof},['3'],async()=>{events.push('native-close-started');await close();events.push('native-closed');})};
 }
 let release;const pending=new Promise(resolve=>{release=resolve;}),delayed=fixture(()=>pending),work=delayed.run();
 await Promise.resolve();assert.deepEqual(delayed.events,['native-close-started']);release();const verified=await work;
 assert.deepEqual(delayed.events,['native-close-started','native-closed','wasm-opened','verifier-crs-only','wasm-verified','wasm-destroyed']);
 assert.equal(verified.nativeProducerClosedBeforeVerification,true);
 const error=new Error('PW_NATIVE_ORIGINAL_CLOSE_REJECTED'),failed=fixture(async()=>{throw error;});
 await assert.rejects(failed.run(),value=>value===error);assert.deepEqual(failed.events,['native-close-started']);
 const invalid=fixture(async()=>{},false);await assert.rejects(invalid.run(),/SELF_VERIFICATION_FAILED/);
 assert.equal(invalid.events.at(-1),'wasm-destroyed');
});

// Real journal/Vault roundtrip over explicit synthetic released-format metadata.
// This test runs no BB, circuit, chain, witness, opening or financial authority.
test('original W39 metric frames survive encrypted account journal reopening without truncating fractional telemetry',async t=>{
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),mode='withdraw_balance',row=receipt(mode);
 const proof={proof:'11'.repeat(32),publicInputs:Array(39).fill('1')};
 const metrics={...NOTE_NATIVE_LINEAGE_V1[mode],...row.resource,id:'01234567-89ab-4cde-8fab-0123456789ab',mode,operation:'prove',purpose:'owner',
  classification:'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY',phase:'completed',acceptedResult:true,exit:{code:0,signal:null},
  lockPreserved:false,zeroKnowledgeEnabled:true,policy:structuredClone(PRIVATE_RESOURCE_POLICY),threads:12,maximumPages:null,preparedMaximumPages:32768,
  totalMilliseconds:1.375,worker:{...row.worker,proofSHA256:digest(Buffer.from(proof.proof,'hex')),publicInputsSHA256:digest(JSON.stringify(proof.publicInputs)),
   proofBytes:32,publicInputCount:39,witnessMilliseconds:0.125,proofMilliseconds:0.25,nativeCloseMilliseconds:0.375,verificationMilliseconds:0.625,totalMilliseconds:0.875},
  resourceSamples:[{availableRAM:PRIVATE_RESOURCE_POLICY.floors.availableRAM,freeDisk:PRIVATE_RESOURCE_POLICY.floors.freeDisk,workerRSS:1}]};
 assert.throws(()=>accountCopy(metrics),TypeError,'HOST_REPRO_ORIGINAL_INTEGER_JOURNAL_REJECTS_TIMINGS');
 const frame=captureNativeDeviceOriginalW39MetricsFrameV1(metrics,proof);assert.equal(frame.json,JSON.stringify(metrics));
 const directory=await mkdtemp(join(tmpdir(),'w39-metrics-frame-host-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const path=join(directory,'operations.vault'),password='HOST_W39_FRAME_ONLY',vault=new Vault(path);
 await vault.create({deviceExits:[{stage:'PROVING',proof:null}]},password);
 const saved=await vault.update(password,0,data=>({...data,deviceExits:[{stage:'PROVED',proof:accountCopy(proof),originalPublicProofMetricsFrame:frame}]}));
 const readback=await new Vault(path).read(password);assert.deepEqual(accountCopy(readback),saved);
 const retained=readback.data.deviceExits[0],restored=restoreNativeDeviceOriginalW39MetricsFrameV1(retained.originalPublicProofMetricsFrame,retained.proof);
 assert.deepEqual(restored,metrics);assert.equal(JSON.stringify(restored),JSON.stringify(metrics));
 assert.equal(restored.totalMilliseconds,1.375);assert.equal(restored.worker.verificationMilliseconds,0.625);
 assert.throws(()=>restoreNativeDeviceOriginalW39MetricsFrameV1({...frame,json:frame.json+' '},proof),/FRAME_CHANGED/);
 for(const json of [' '+frame.json,'{"mode":"withdraw_balance",'+frame.json.slice(1)])
  assert.throws(()=>restoreNativeDeviceOriginalW39MetricsFrameV1({...frame,json,sha256:digest(json)},proof),/FRAME_EXACT/);
 assert.throws(()=>restoreNativeDeviceOriginalW39MetricsFrameV1(frame,{...proof,proof:'22'.repeat(32)}),/METRICS_PROOF_CHANGED/);
 assert.throws(()=>restoreNativeDeviceOriginalW39MetricsFrameV1(frame,{...proof,publicInputs:Array(39).fill('2')}),/METRICS_INPUTS_CHANGED/);
 const noncanonicalProof={...proof,publicInputs:['1\n',...proof.publicInputs.slice(1)]},noncanonicalMetrics=structuredClone(metrics);
 noncanonicalMetrics.worker.publicInputsSHA256=digest(JSON.stringify(noncanonicalProof.publicInputs));
 assert.throws(()=>captureNativeDeviceOriginalW39MetricsFrameV1(noncanonicalMetrics,noncanonicalProof),/METRICS_INPUT_ENCODING/);
 assert.throws(()=>captureNativeDeviceOriginalW39MetricsFrameV1({...metrics,id:metrics.id+'\n'},proof));
 const altered=structuredClone(metrics);altered.worker.independentVerification.nativeProducerClosedBeforeVerification=false;
 const alteredJSON=JSON.stringify(altered);
 assert.throws(()=>restoreNativeDeviceOriginalW39MetricsFrameV1({...frame,json:alteredJSON,sha256:digest(alteredJSON)},proof));
 for(const value of [NaN,Infinity,-0])assert.throws(()=>captureNativeDeviceOriginalW39MetricsFrameV1({...metrics,totalMilliseconds:value},proof),/METRICS_NUMBER/);
 assert.throws(()=>captureNativeDeviceOriginalW39MetricsFrameV1({...metrics,threads:12.5},proof),/METRICS_NUMBER/);
 assert.throws(()=>captureNativeDeviceOriginalW39MetricsFrameV1({...metrics,other:{totalMilliseconds:0.5}},proof),/METRICS_NUMBER/);
 let invoked=0;const accessor={...metrics};Object.defineProperty(accessor,'totalMilliseconds',{enumerable:true,get(){invoked++;throw Error('HOST_GETTER');}});
 assert.throws(()=>captureNativeDeviceOriginalW39MetricsFrameV1(accessor,proof),/METRICS_ACCESSOR/);assert.equal(invoked,0);
 assert.throws(()=>captureNativeDeviceOriginalW39MetricsFrameV1(new Proxy(metrics,{ownKeys(){invoked++;throw Error('HOST_PROXY');}}),proof),/METRICS_PLAIN/);assert.equal(invoked,0);
 // Historical integer telemetry objects continue down the unchanged old row
 // reader. The new frame also preserves their fixed Wasm1 interpretation.
 const legacy=structuredClone(metrics);delete legacy.lockPreserved;delete legacy.nativeChildrenGone;delete legacy.nativeBackendExecution;
 delete legacy.nativeChildIdentities;delete legacy.nativeMemoryScope;delete legacy.peakWorkerRSS;delete legacy.preparedMaximumPages;
 delete legacy.worker.nativeBackendExecution;delete legacy.worker.independentVerification;delete legacy.worker.preparedMaximumPages;
 legacy.threads=legacy.worker.threads=1;legacy.maximumPages=legacy.worker.maximumPages=32768;
 legacy.totalMilliseconds=1;for(const name of ['witnessMilliseconds','proofMilliseconds','nativeCloseMilliseconds','verificationMilliseconds','totalMilliseconds'])delete legacy.worker[name];
 assert.deepEqual(accountCopy(legacy),legacy);
 const historical=captureNativeDeviceOriginalW39MetricsFrameV1(legacy,proof);
 assert.deepEqual(restoreNativeDeviceOriginalW39MetricsFrameV1(historical,proof),legacy);
 // Explicit HOST V3 public metadata, no witness/proof generation. The original
 // encrypted worker has the same Native12 lineage but a distinct close profile.
 const encrypted=structuredClone(metrics);
 encrypted.worker.nativeBackendExecution.profile=PRIVATE_NOTE_NATIVE_PROFILE_V1;
 encrypted.nativeBackendExecution.profile=PRIVATE_NOTE_NATIVE_PROFILE_V1;
 encrypted.privateWorkerIntake={profile:'ORIGINAL_NATIVE_NOTE_PRIVATE_WORKER_INPUT_V3',recipientJobId:'host-v3-recipient',
  originalConsentBound:true,jobId:'host-v3-w39-job',consentSHA256:digest('host-v3-consent'),witnessSHA256:digest('host-v3-witness')};
 const {recipientJobId,...childIntake}=encrypted.privateWorkerIntake;encrypted.worker.privateWorkerIntake=childIntake;
 assert.equal(assertNativePrivateEconomicNoteReceiptV3(mode,encrypted.worker,encrypted),true);
 assert.throws(()=>assertNativeEconomicNoteReceiptV1(mode,encrypted.worker,encrypted),/PAEG_PROOF_NOTE_CLOSE_JOIN/,
  'HOST_REPRO_V3_ORIGINAL_CLOSE_REJECTED_BY_LEGACY_VALIDATOR');
 const privateFrame=captureNativeDeviceOriginalW39MetricsFrameV1(encrypted,proof);
 const privateSaved=await vault.update(password,readback.revision,data=>({...data,deviceExits:[{stage:'PROVED',proof:accountCopy(proof),
  originalPublicProofMetricsFrame:privateFrame}]}));
 const privateReadback=await new Vault(path).read(password);assert.deepEqual(accountCopy(privateReadback),privateSaved);
 assert.deepEqual(restoreNativeDeviceOriginalW39MetricsFrameV1(privateReadback.data.deviceExits[0].originalPublicProofMetricsFrame,proof),encrypted);
 // Hashing a copied/altered DATA frame cannot merge intake, closure or proof.
 for(const change of [value=>{value.worker.privateWorkerIntake.consentSHA256=digest('foreign-consent');},
  value=>{value.worker.privateWorkerIntake.jobId='foreign-w39-job';},
  value=>{value.privateWorkerIntake.originalConsentBound=false;},
  value=>{delete value.worker.privateWorkerIntake;},
  value=>{value.worker.nativeBackendExecution.profile=NOTE_NATIVE_PROFILE_V1;},
  value=>{value.nativeBackendExecution.profile=NOTE_NATIVE_PROFILE_V1;},
  value=>{value.worker.independentVerification.nativeProducerClosedBeforeVerification=false;}]){
  const mixed=structuredClone(encrypted);change(mixed);const json=JSON.stringify(mixed);
  assert.throws(()=>restoreNativeDeviceOriginalW39MetricsFrameV1({...privateFrame,json,sha256:digest(json)},proof));
 }
 assert.throws(()=>restoreNativeDeviceOriginalW39MetricsFrameV1(privateFrame,{...proof,proof:'22'.repeat(32)}),/METRICS_PROOF_CHANGED/);
 assert.deepEqual(restoreNativeDeviceOriginalW39MetricsFrameV1(frame,proof),metrics,'HOST_LEGACY_NATIVE12_FRAME_STILL_EXACT');
});
