import { inspectWrappedInstallationSourcesV2 } from '../../../../../tests/integration/deployments/wrapped/wrapped-installation-source-inspector-v2.mjs';
inspectWrappedInstallationSourcesV2();
const { ROOT, LIMITS, SETTINGS } = await import('../../catalog.mjs');
const { regular, hash, assertID, loadPinned, resourceModuleURL } = await import('../../tooling/tooling.mjs');
const { wrappedClaimRelationV1, wrappedClaimPublicWordsV1, WRAPPED_CLAIM_PROFILE_V1 } = await import('../metadata/wrapped-claim-profile-v1.mjs');
const { WRAPPED_CLAIM_GLOBAL_LOCK_V1: GLOBAL_PROOF_LOCK, WRAPPED_CLAIM_WORKER_V1: WORKER, WRAPPED_CLAIM_ROLE_PROCESS_V1: ROLE_PROCESS, WRAPPED_CLAIM_LOCAL_V1: LOCAL, json,readJSON,writeNew,replace,wrappedClaimRuntimePinsV1,receiveWrappedClaimJobV1 } = await import('../tooling/wrapped-claim-tooling-v1.mjs');
const { loadWrappedClaimRoleProofArtifactsV1, assertWrappedClaimRoleProofArtifactsV1 } = await import('../../../../backend/src/operations/releases/wrapped/wrapped-claim-proof-artifacts-v1.mjs');
inspectWrappedInstallationSourcesV2();
/** One wrapped CI/CO proof. Reviewed retained program/key only; no key regeneration. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';





for(const name of ['log','info','warn','error','debug','trace'])console[name]=()=>{};globalThis.fetch=async()=>{throw Error('WRAPPED_JOB_OFFLINE_REQUIRED');};
assert.equal(process.argv.length,5);const role=process.argv[2],spec=wrappedClaimRelationV1(role);assert.deepEqual(process.execArgv,[]);assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');assert.equal(realpathSync(process.argv[1]),WORKER);
const runId=assertID(process.argv[3]),jobId=assertID(process.argv[4]),attempt=join(LOCAL,'attempts',runId);
const lock=readJSON(GLOBAL_PROOF_LOCK);assert.equal(lock.pid,process.ppid);assert.equal(lock.runId,runId);assert.equal(lock.jobId,jobId);assert.equal(lock.relation,spec.name);assert.equal(lock.role,role);
const parentArgs=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parentArgs.length,3);assert.equal(realpathSync(parentArgs[1]),ROLE_PROCESS);assert.equal(parentArgs[2],role);assert.equal(realpathSync(`/proc/${process.ppid}/exe`),realpathSync(process.execPath));assert.equal(realpathSync(process.cwd()),ROOT);
const pins=readJSON(join(attempt,'runtime-pins.json')),began=performance.now();
const result={format:'WRAPPED_SCOPED_PROOF_RESULT_V1',profile:WRAPPED_CLAIM_PROFILE_V1,relation:spec.name,role,mode:'prove-wrapped-v1',runId,jobId,phase:'starting',limits:LIMITS,settings:SETTINGS,runtimePinsSHA256:hash(json(pins)),
 keyGenerated:false,keyRecomputed:false,proofGenerated:false,witnessPersisted:false,maximumPages:pins.maximumPages,threads:1,hostLimitsChanged:false,metrics:{initializationMilliseconds:0,jobPreparationMilliseconds:0,witnessMilliseconds:0,proofMilliseconds:0,verificationMilliseconds:0,totalMilliseconds:0,otherMilliseconds:0}};
const save=()=>replace(join(attempt,'result.json'),result),phase=value=>{result.phase=value;save();};
const disconnect=()=>{if(result.phase!=='completed'){result.phase='failed';result.errorCode='WRAPPED_JOB_PARENT_DISCONNECTED';try{save();}finally{process.exit(1);}}};process.once('disconnect',disconnect);
const measured=async(name,work)=>{const start=performance.now();try{return await work();}finally{result.metrics[name]+=performance.now()-start;}};
let backend,job,compressedWitness,rawWitness;
try{
 save();assert.deepEqual(await wrappedClaimRuntimePinsV1(role),pins,'WRAPPED_JOB_INITIAL_PINS_CHANGED');
 const artifacts=await loadWrappedClaimRoleProofArtifactsV1(role);assertWrappedClaimRoleProofArtifactsV1(artifacts,role);assert.equal(artifacts.maximumPages,pins.maximumPages);
 phase('receiving-scoped-job');job=await measured('jobPreparationMilliseconds',()=>receiveWrappedClaimJobV1(role,jobId,artifacts.program.abi));process.once('message',disconnect);
 const expected=[...job.expectedPublicInputs],helpers=await import(resourceModuleURL),bb=await loadPinned('@aztec/bb.js'),{Noir}=await loadPinned('@noir-lang/noir_js');
 inspectWrappedInstallationSourcesV2();assertWrappedClaimRoleProofArtifactsV1(artifacts,role);assert.deepEqual(helpers.verifyCRS(),artifacts.crs);phase('initializing');
 await measured('initializationMilliseconds',async()=>{backend=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:artifacts.maximumPages}});
 await backend.srsInitSrs({pointsBuf:regular(helpers.CRS+'bn254_g1_compressed.dat'),numPoints:LIMITS.provingCRSPoints,g2Point:regular(helpers.CRS+'bn254_g2.dat')});});
 inspectWrappedInstallationSourcesV2();phase('executing-witness');({witness:compressedWitness}=await measured('witnessMilliseconds',()=>new Noir(artifacts.program).execute(job.inputs)));job.inputs=undefined;job=undefined;
 inspectWrappedInstallationSourcesV2();phase('proving');let generated;
 await measured('proofMilliseconds',async()=>{rawWitness=gunzipSync(compressedWitness);generated=await backend.circuitProve({circuit:{name:spec.name,bytecode:gunzipSync(artifacts.compressed),verificationKey:artifacts.key},witness:rawWitness,settings:SETTINGS});});
 rawWitness.fill(0);rawWitness=undefined;compressedWitness.fill(0);compressedWitness=undefined;
 const proof=Buffer.concat(generated.proof.map(value=>Buffer.from(value))),inputs=wrappedClaimPublicWordsV1(spec,generated.publicInputs.map(value=>'0x'+Buffer.from(value).toString('hex')));
 assert.deepEqual(inputs,expected);assert.ok(proof.length>0&&proof.length%32===0&&proof.length<=LIMITS.outputBytes);
 inspectWrappedInstallationSourcesV2();phase('self-verifying');const verified=await measured('verificationMilliseconds',()=>new bb.UltraHonkVerifierBackend(backend).verifyProof({proof,publicInputs:inputs.map(value=>'0x'+BigInt(value).toString(16).padStart(64,'0')),verificationKey:artifacts.key},{verifierTarget:'evm'}));assert.equal(verified,true,'WRAPPED_JOB_INVALID_PROOF');
 assert.deepEqual(await wrappedClaimRuntimePinsV1(role),pins,'WRAPPED_JOB_FINAL_PINS_CHANGED');const live=await loadWrappedClaimRoleProofArtifactsV1(role);assert.equal(live.keySHA256,artifacts.keySHA256);assert.equal(live.sourceVersion,artifacts.sourceVersion);
 inspectWrappedInstallationSourcesV2();writeNew(join(attempt,'proof.bin'),proof);writeNew(join(attempt,'public-inputs.json'),inputs);
 const manifest={format:'WRAPPED_SCOPED_PUBLIC_PROOF_V1',profile:WRAPPED_CLAIM_PROFILE_V1,relation:spec.name,role,runId,jobId,
  sourceVersion:artifacts.sourceVersion,keySHA256:artifacts.keySHA256,keyManifestSHA256:artifacts.keyManifestSHA256,
  abiSHA256:artifacts.abiSHA256,compiledManifestSHA256:artifacts.compiledManifestSHA256,artifactSHA256:artifacts.artifactSHA256,bytecodeSHA256:artifacts.bytecodeSHA256,
  proofReleaseSHA256:artifacts.proofReleaseSHA256,hostSourceClosureSHA256:artifacts.hostSourceClosureSHA256,proofSHA256:hash(proof),proofBytes:proof.length,runtimePinsSHA256:hash(json(pins)),publicInputsSHA256:hash(json(inputs)),publicWords:spec.publicWords,backendPublicWords:spec.publicWords+8,publicInputOffset:5,maximumPages:pins.maximumPages,selfVerified:true,settings:SETTINGS};
 writeNew(join(attempt,'proof-manifest.json'),manifest);Object.assign(result,{proofGenerated:true,selfVerified:true,keySHA256:artifacts.keySHA256,sourceVersion:artifacts.sourceVersion,proofSHA256:manifest.proofSHA256});phase('completed');
}catch(error){result.failureStage=result.phase;result.phase='failed';result.errorCode=String(error.message).match(/\b(?:WRAPPED|PW|PC\d+|PROOF_JOB)_[A-Z0-9_]+\b/)?.[0]??'WRAPPED_SCOPED_PROOF_FAILED';process.exitCode=1;}
finally{
 rawWitness?.fill(0);compressedWitness?.fill(0);job=undefined;
 if(backend){try{await backend.destroy();result.backendDestroyed=true;}catch{result.phase='failed';result.errorCode='WRAPPED_JOB_BACKEND_CLEANUP_FAILED';process.exitCode=1;}}
 result.metrics.totalMilliseconds=performance.now()-began;result.metrics.otherMilliseconds=Math.max(0,result.metrics.totalMilliseconds-['initializationMilliseconds','jobPreparationMilliseconds','witnessMilliseconds','proofMilliseconds','verificationMilliseconds'].reduce((sum,name)=>sum+result.metrics[name],0));save();process.removeListener('disconnect',disconnect);process.removeListener('message',disconnect);if(process.connected)process.disconnect();
}
