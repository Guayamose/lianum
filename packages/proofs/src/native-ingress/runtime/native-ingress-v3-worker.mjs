/** One scoped V3 proof. Retained program/key are fixed; no key regeneration. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ROOT, LIMITS, SETTINGS, CATALOG } from '../../catalog.mjs';
import { regular, hash, assertID, loadPinned, resourceModuleURL, verifierWords } from '../../tooling/tooling.mjs';
import { NATIVE_INGRESS_V3_SPEC, NATIVE_INGRESS_V3_LOCAL, publicWordsWithNativeIngressV3 } from '../metadata/native-ingress-v3-profile.mjs';
import { GLOBAL_PROOF_LOCK,V3_WORKER,V3_ROLE_PROCESS,json,readJSON,writeNew,replace,runtimePins,receiveNativeIngressV3Job } from '../tooling/native-ingress-v3-tooling.mjs';
import { loadNativeClaimIngressV3ProofArtifacts } from '../../../../backend/src/operations/deployments/claims/native-claim-ingress-v3-artifacts.mjs';
for(const name of ['log','info','warn','error','debug','trace'])console[name]=()=>{};globalThis.fetch=async()=>{throw Error('V3_JOB_OFFLINE_REQUIRED');};
assert.equal(process.argv.length,4);assert.deepEqual(process.execArgv,[]);assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');assert.equal(realpathSync(process.argv[1]),V3_WORKER);
const runId=assertID(process.argv[2]),jobId=assertID(process.argv[3]),attempt=join(NATIVE_INGRESS_V3_LOCAL,'attempts',runId);
const lock=readJSON(GLOBAL_PROOF_LOCK);assert.equal(lock.pid,process.ppid);assert.equal(lock.runId,runId);assert.equal(lock.jobId,jobId);assert.equal(lock.relation,NATIVE_INGRESS_V3_SPEC.name);
const parentArgs=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parentArgs.length,3);assert.equal(realpathSync(parentArgs[1]),V3_ROLE_PROCESS);assert.equal(parentArgs[2],NATIVE_INGRESS_V3_SPEC.name);assert.equal(realpathSync(`/proc/${process.ppid}/exe`),realpathSync(process.execPath));assert.equal(realpathSync(process.cwd()),ROOT);
const pins=readJSON(join(attempt,'runtime-pins.json')),began=performance.now();
const result={format:'V3_SCOPED_PROOF_RESULT_V1',profile:'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',relation:NATIVE_INGRESS_V3_SPEC.name,role:'claim_ingress',mode:'prove',runId,jobId,phase:'starting',limits:LIMITS,settings:SETTINGS,
 keyGenerated:false,keyRecomputed:false,proofGenerated:false,witnessPersisted:false,metrics:{initializationMilliseconds:0,jobPreparationMilliseconds:0,witnessMilliseconds:0,proofMilliseconds:0,verificationMilliseconds:0,totalMilliseconds:0,otherMilliseconds:0}};
const save=()=>replace(join(attempt,'result.json'),result),phase=value=>{result.phase=value;save();};
const disconnect=()=>{if(result.phase!=='completed'){result.phase='failed';result.errorCode='V3_JOB_PARENT_DISCONNECTED';try{save();}finally{process.exit(1);}}};process.once('disconnect',disconnect);
const measured=async(name,work)=>{const start=performance.now();try{return await work();}finally{result.metrics[name]+=performance.now()-start;}};
let backend,job,compressedWitness,rawWitness;
try{
 save();assert.deepEqual(await runtimePins(),pins,'V3_JOB_INITIAL_PINS_CHANGED');
 const artifacts=await loadNativeClaimIngressV3ProofArtifacts();assert.equal(artifacts.stats.numGatesDyadic,1048576,'V3_JOB_FIXED_STANDARD_PROFILE');
 phase('receiving-scoped-job');job=await measured('jobPreparationMilliseconds',()=>receiveNativeIngressV3Job(jobId,artifacts.program.abi));process.once('message',disconnect);
 const expected=[...job.expectedPublicInputs],helpers=await import(resourceModuleURL),bb=await loadPinned('@aztec/bb.js'),{Noir}=await loadPinned('@noir-lang/noir_js');
 assert.deepEqual(helpers.verifyCRS(),artifacts.crs);phase('initializing');
 await measured('initializationMilliseconds',async()=>{backend=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});
 await backend.srsInitSrs({pointsBuf:regular(helpers.CRS+'bn254_g1_compressed.dat'),numPoints:LIMITS.provingCRSPoints,g2Point:regular(helpers.CRS+'bn254_g2.dat')});});
 phase('executing-witness');({witness:compressedWitness}=await measured('witnessMilliseconds',()=>new Noir(artifacts.program).execute(job.inputs)));job.inputs=undefined;job=undefined;
 phase('proving');let generated;
 await measured('proofMilliseconds',async()=>{rawWitness=gunzipSync(compressedWitness);generated=await backend.circuitProve({circuit:{name:NATIVE_INGRESS_V3_SPEC.name,bytecode:gunzipSync(artifacts.compressed),verificationKey:artifacts.key},witness:rawWitness,settings:SETTINGS});});
 rawWitness.fill(0);rawWitness=undefined;compressedWitness.fill(0);compressedWitness=undefined;
 const proof=Buffer.concat(generated.proof.map(value=>Buffer.from(value))),inputs=publicWordsWithNativeIngressV3(NATIVE_INGRESS_V3_SPEC,generated.publicInputs.map(value=>'0x'+Buffer.from(value).toString('hex')));
 assert.deepEqual(inputs,expected);assert.ok(proof.length>0&&proof.length%32===0&&proof.length<=LIMITS.outputBytes);
 phase('self-verifying');const verified=await measured('verificationMilliseconds',()=>new bb.UltraHonkVerifierBackend(backend).verifyProof({proof,publicInputs:verifierWords(CATALOG.native_claim_ingress,inputs),verificationKey:artifacts.key},{verifierTarget:'evm'}));assert.equal(verified,true,'V3_JOB_INVALID_PROOF');
 assert.deepEqual(await runtimePins(),pins,'V3_JOB_FINAL_PINS_CHANGED');const live=await loadNativeClaimIngressV3ProofArtifacts();assert.equal(live.keySHA256,artifacts.keySHA256);assert.equal(live.sourceVersion,artifacts.sourceVersion);
 writeNew(join(attempt,'proof.bin'),proof);writeNew(join(attempt,'public-inputs.json'),inputs);
 const manifest={format:'V3_SCOPED_PUBLIC_PROOF_V1',profile:'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',relation:NATIVE_INGRESS_V3_SPEC.name,role:'claim_ingress',runId,jobId,
  sourceVersion:artifacts.sourceVersion,keySHA256:artifacts.keySHA256,keyManifestSHA256:artifacts.keyManifestSHA256,
  compiledManifestSHA256:artifacts.compiledManifestSHA256,artifactSHA256:artifacts.artifactSHA256,bytecodeSHA256:artifacts.bytecodeSHA256,
  proofSHA256:hash(proof),publicInputsSHA256:hash(json(inputs)),publicWords:51,selfVerified:true,settings:SETTINGS};
 writeNew(join(attempt,'proof-manifest.json'),manifest);Object.assign(result,{proofGenerated:true,selfVerified:true,keySHA256:artifacts.keySHA256,sourceVersion:artifacts.sourceVersion,proofSHA256:manifest.proofSHA256});phase('completed');
}catch(error){result.failureStage=result.phase;result.phase='failed';result.errorCode=String(error.message).match(/\b(?:V3|PW|CLAIM|PC\d+|PROOF_JOB)_[A-Z0-9_]+\b/)?.[0]??'V3_SCOPED_PROOF_FAILED';process.exitCode=1;}
finally{
 rawWitness?.fill(0);compressedWitness?.fill(0);job=undefined;
 if(backend){try{await backend.destroy();result.backendDestroyed=true;}catch{result.phase='failed';result.errorCode='V3_JOB_BACKEND_CLEANUP_FAILED';process.exitCode=1;}}
 result.metrics.totalMilliseconds=performance.now()-began;result.metrics.otherMilliseconds=Math.max(0,result.metrics.totalMilliseconds-['initializationMilliseconds','jobPreparationMilliseconds','witnessMilliseconds','proofMilliseconds','verificationMilliseconds'].reduce((sum,name)=>sum+result.metrics[name],0));save();process.removeListener('disconnect',disconnect);if(process.connected)process.disconnect();
}
