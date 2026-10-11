/** Fixed development consumer of the original I84 algorithm. No new ACIR, VK or historical release. */
/** One scoped native-value V2 proof. Retained program/key are fixed; no key regeneration. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ROOT, LIMITS, SETTINGS, CATALOG } from '@lianum/proofs/catalog';
import { regular, hash, assertID, loadPinned, resourceModuleURL, verifierCRSModuleURL, verifierWords } from '@lianum/proofs/tooling/tooling';
import { NATIVE_VALUE_LIVE_V2_SPEC, nativeValueLivePublicWords } from '@lianum/proofs/native-value/metadata/native-value-live-v2-profile';
import { NATIVE_VALUE_LIVE_V2_LOCAL,GLOBAL_PROOF_LOCK,NV2_WORKER,NV2_ROLE_PROCESS,json,readJSON,writeNew,replace,runtimePins,receiveNativeValueLiveV2Job } from '../tooling/native-value-dev-live-v5-tooling.mjs';
import { loadNativeValueDevLiveArtifactsV5 } from '../metadata/native-value-dev-live-v5-artifacts.mjs';
import {I84_NATIVE_LIMITS_V1,initializeI84NativeV1,assertI84NativeCurrentV1,destroyI84NativeV1} from './native-value-dev-live-v5-native-execution.mjs';
import {createI84FullProvingCRSReaderV1} from './native-value-dev-live-v5-public-crs.mjs';
for(const name of ['log','info','warn','error','debug','trace'])console[name]=()=>{};globalThis.fetch=async()=>{throw Error('NV2_JOB_OFFLINE_REQUIRED');};
assert.equal(process.argv.length,4);assert.deepEqual(process.execArgv,[]);assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');assert.equal(realpathSync(process.argv[1]),NV2_WORKER);
const runId=assertID(process.argv[2]),jobId=assertID(process.argv[3]),attempt=join(NATIVE_VALUE_LIVE_V2_LOCAL,'attempts',runId);
const lock=readJSON(GLOBAL_PROOF_LOCK);assert.equal(lock.pid,process.ppid);assert.equal(lock.runId,runId);assert.equal(lock.jobId,jobId);assert.equal(lock.relation,NATIVE_VALUE_LIVE_V2_SPEC.name);
const parentArgs=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parentArgs.length,3);assert.equal(realpathSync(parentArgs[1]),NV2_ROLE_PROCESS);assert.equal(parentArgs[2],NATIVE_VALUE_LIVE_V2_SPEC.name);assert.equal(realpathSync(`/proc/${process.ppid}/exe`),realpathSync(process.execPath));assert.equal(realpathSync(process.cwd()),ROOT);
const pins=readJSON(join(attempt,'runtime-pins.json')),began=performance.now();
const result={format:'NV2_SCOPED_PROOF_RESULT_V1',profile:'LIANUM_DYNAMIC_NATIVE_VALUE_ADMISSION_V2',relation:NATIVE_VALUE_LIVE_V2_SPEC.name,role:'local',mode:'prove-dyadic21',runId,jobId,phase:'starting',limits:I84_NATIVE_LIMITS_V1,settings:SETTINGS,runtimePinsSHA256:hash(json(pins)),
 keyGenerated:false,keyRecomputed:false,proofGenerated:false,witnessPersisted:false,maximumPages:null,preparedMaximumPages:65536,threads:I84_NATIVE_LIMITS_V1.threads,hostLimitsChanged:false,metrics:{initializationMilliseconds:0,jobPreparationMilliseconds:0,witnessMilliseconds:0,proofMilliseconds:0,verificationMilliseconds:0,totalMilliseconds:0,otherMilliseconds:0}};
const save=()=>replace(join(attempt,'result.json'),result),phase=value=>{result.phase=value;save();};
const disconnect=()=>{if(result.phase!=='completed'){result.phase='failed';result.errorCode='NV2_JOB_PARENT_DISCONNECTED';try{save();}finally{process.exit(1);}}};process.once('disconnect',disconnect);
const measured=async(name,work)=>{const start=performance.now();try{return await work();}finally{result.metrics[name]+=performance.now()-start;}};
let backend,verifier,crsReader,job,compressedWitness,rawWitness;
try{
 save();assert.deepEqual(await runtimePins(),pins,'NV2_JOB_INITIAL_PINS_CHANGED');
 const artifacts=await loadNativeValueDevLiveArtifactsV5();assert.equal(artifacts.stats.numGatesDyadic,2097152,'NV2_JOB_FIXED_DYADIC21_PROFILE');
 phase('receiving-scoped-job');job=await measured('jobPreparationMilliseconds',()=>receiveNativeValueLiveV2Job(jobId,artifacts.program.abi));process.once('message',disconnect);
 const expected=[...job.expectedPublicInputs],helpers=await import(resourceModuleURL),bb=await loadPinned('@aztec/bb.js'),{Noir}=await loadPinned('@noir-lang/noir_js');
 assert.deepEqual(helpers.verifyCRS(),artifacts.crs);phase('initializing');
 await measured('initializationMilliseconds',async()=>{
  backend=await initializeI84NativeV1(bb);crsReader=await createI84FullProvingCRSReaderV1();
  const pointsBuf=crsReader.read();try{await backend.srsInitSrs({pointsBuf,numPoints:LIMITS.provingCRSPoints,g2Point:regular(helpers.CRS+'bn254_g2.dat')});}finally{pointsBuf.fill(0);}
  result.publicProvingCRS=crsReader.report;assertI84NativeCurrentV1(backend);crsReader.assertCurrent();
 });
 phase('executing-witness');({witness:compressedWitness}=await measured('witnessMilliseconds',()=>new Noir(artifacts.program).execute(job.inputs)));job.inputs=undefined;job=undefined;
 phase('proving');let generated;
 await measured('proofMilliseconds',async()=>{rawWitness=gunzipSync(compressedWitness);generated=await backend.circuitProve({circuit:{name:NATIVE_VALUE_LIVE_V2_SPEC.name,bytecode:gunzipSync(artifacts.compressed),verificationKey:artifacts.key},witness:rawWitness,settings:SETTINGS});});
 rawWitness.fill(0);rawWitness=undefined;compressedWitness.fill(0);compressedWitness=undefined;
 const proof=Buffer.concat(generated.proof.map(value=>Buffer.from(value))),inputs=nativeValueLivePublicWords(NATIVE_VALUE_LIVE_V2_SPEC,generated.publicInputs.map(value=>'0x'+Buffer.from(value).toString('hex')));
 assert.deepEqual(inputs,expected);assert.ok(proof.length>0&&proof.length%32===0&&proof.length<=LIMITS.outputBytes);
 // Close the original native producer before independent verification. No
 // native/WASM backend reuse, extra proof or overlapping heavy process.
 phase('closing-native-producer');assertI84NativeCurrentV1(backend);const producer=backend;backend=undefined;
 result.nativeBackendExecution=await destroyI84NativeV1(producer);result.backendDestroyed=true;
 phase('self-verifying');
 await measured('initializationMilliseconds',async()=>{
  verifier=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:65536},logger:()=>{}});
  assert.equal(verifier.backend.wasm.getNumThreads(),1,'NV2_INDEPENDENT_FIXED_VERIFY_THREADS');
  const {initializePrivateVerifierCRS}=await import(verifierCRSModuleURL);
  result.verifierCRS=await initializePrivateVerifierCRS(verifier,bb.BN254_G1_GENERATOR,regular(helpers.CRS+'bn254_g2.dat'));
 });
 const verified=await measured('verificationMilliseconds',()=>new bb.UltraHonkVerifierBackend(verifier).verifyProof({proof,publicInputs:verifierWords(CATALOG.admission,inputs),verificationKey:artifacts.key},{verifierTarget:'evm'}));assert.equal(verified,true,'NV2_JOB_INVALID_PROOF');
 const verifying=verifier;verifier=undefined;await verifying.destroy();
 result.independentVerification={backend:'Wasm',threads:1,maximumPages:65536,originalPreparedKeyRequired:true,verifierCRSOnly:true,backendDestroyed:true};
 crsReader.assertCurrent();
 assert.deepEqual(await runtimePins(),pins,'NV2_JOB_FINAL_PINS_CHANGED');const live=await loadNativeValueDevLiveArtifactsV5();assert.equal(live.keySHA256,artifacts.keySHA256);assert.equal(live.sourceVersion,artifacts.sourceVersion);
 writeNew(join(attempt,'proof.bin'),proof);writeNew(join(attempt,'public-inputs.json'),inputs);
 const manifest={format:'NV2_SCOPED_PUBLIC_PROOF_V1',profile:'LIANUM_DYNAMIC_NATIVE_VALUE_ADMISSION_V2',relation:NATIVE_VALUE_LIVE_V2_SPEC.name,role:'local',runId,jobId,
  sourceVersion:artifacts.sourceVersion,keySHA256:artifacts.keySHA256,keyManifestSHA256:artifacts.keyManifestSHA256,
  compiledManifestSHA256:artifacts.compiledManifestSHA256,artifactSHA256:artifacts.artifactSHA256,bytecodeSHA256:artifacts.bytecodeSHA256,
  proofSHA256:hash(proof),proofBytes:proof.length,runtimePinsSHA256:hash(json(pins)),publicInputsSHA256:hash(json(inputs)),publicWords:84,backendPublicWords:92,publicInputOffset:5,maximumPages:null,preparedMaximumPages:65536,executionBackend:'NativeUnixSocket',threads:I84_NATIVE_LIMITS_V1.threads,selfVerified:true,settings:SETTINGS};
 writeNew(join(attempt,'proof-manifest.json'),manifest);Object.assign(result,{proofGenerated:true,selfVerified:true,keySHA256:artifacts.keySHA256,keyManifestSHA256:artifacts.keyManifestSHA256,sourceVersion:artifacts.sourceVersion,proofSHA256:manifest.proofSHA256});phase('completed');
}catch(error){result.failureStage=result.phase;result.phase='failed';result.errorCode=String(error.message).match(/\b(?:NV2|PW|NATIVE_VALUE|PC\d+|PROOF_JOB)_[A-Z0-9_]+\b/)?.[0]??'NV2_SCOPED_PROOF_FAILED';process.exitCode=1;}
finally{
 rawWitness?.fill(0);compressedWitness?.fill(0);job=undefined;
 if(backend){try{result.nativeBackendExecution=await destroyI84NativeV1(backend);result.backendDestroyed=true;}catch{result.phase='failed';result.errorCode='NV2_JOB_BACKEND_CLEANUP_FAILED';process.exitCode=1;}}
 if(verifier){try{await verifier.destroy();}catch{result.phase='failed';result.errorCode='NV2_JOB_VERIFIER_CLEANUP_FAILED';process.exitCode=1;}}
 if(crsReader){try{crsReader.close();}catch{result.phase='failed';result.errorCode='NV2_JOB_PUBLIC_CRS_CLEANUP_FAILED';process.exitCode=1;}}
 result.metrics.totalMilliseconds=performance.now()-began;result.metrics.otherMilliseconds=Math.max(0,result.metrics.totalMilliseconds-['initializationMilliseconds','jobPreparationMilliseconds','witnessMilliseconds','proofMilliseconds','verificationMilliseconds'].reduce((sum,name)=>sum+result.metrics[name],0));save();process.removeListener('disconnect',disconnect);if(process.connected)process.disconnect();
}
