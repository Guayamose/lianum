/** Designated fresh WASM child. No private input/witness/proof logging or file writes. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {root,project,assembly,spec,hash,filePin,guard,resources,fields,verifyPins,cacheLineage,startupLogger,safeError} from './common.mjs';
import {readDerivedCache} from '../crs-cache-latency/cache-files.mjs';
throw Error('WT_PAUSED_BY_USER_NOT_EXECUTED_PREPARATION_INCOMPLETE');
const began=performance.now();
for(const name of ['log','info','warn','error','debug'])console[name]=()=>{};
assert.equal(process.env.WT_SUPERVISED,'btc-v2-one-pair-v1','WT_SUPERVISOR_REQUIRED');
assert.equal(typeof process.send,'function','WT_IPC_REQUIRED');
const request=await new Promise(resolve=>process.once('message',resolve));
const {role,threads,manifestSHA256,crossProof}=request;
const send=message=>new Promise((resolve,reject)=>process.send(message,error=>error?reject(error):resolve()));
const metrics={classification:'SYNTHETIC_BTC_READINESS_V2_GENUINE_PROOF_THREAD_COMPARISON',role,threads,mode:spec.mode,target:spec.target,
 maximumPages:role==='prove'?spec.maximumPages:32768,phase:'starting',startedAt:new Date().toISOString(),timingsMilliseconds:{},privateMaterialPersisted:false,
 zeroKnowledgeEnabled:true,provingVK:'official-generateProof-empty-verificationKey',newProofGenerated:false};
const times=metrics.timingsMilliseconds;
const phase=async value=>{metrics.phase=value;guard();await send({type:'phase',phase:value});};
let api,witness,reconstruction,result,pointsBuf,g2Point;
const priorFetch=globalThis.fetch;
try{
 assert.ok(role==='prove'||role==='verify-only','WT_ROLE');assert.equal(process.env.WT_ROLE,role,'WT_ROLE_ENV');assert.ok(role==='prove'?[1,4].includes(threads):threads===1,'WT_THREAD_SELECTION');
 await phase('pin-checks');let t=performance.now();
 const checked=verifyPins(manifestSHA256);metrics.toolchain=checked.toolchain;metrics.crsIntegrity=checked.crsIntegrity;
 const {manifest}=checked;metrics.manifestSHA256=manifestSHA256;
 const cache=manifest.cache;
 const lineage=cacheLineage(cache.sourceManifestSHA256,checked.toolchain,checked.crsIntegrity);
 const cached=readDerivedCache(join(project,cache.directory),cache.derivationSHA256,lineage,false);
 assert.equal(cached.record.cache.sha256,cache.sha256,'WT_CACHE_FIXED_HASH');assert.equal(cached.record.cache.bytes,134217728,'WT_CACHE_FIXED_SIZE');
 metrics.cache=cached.reference;times.pinChecks=performance.now()-t;
 globalThis.fetch=async()=>{throw Error('WT_OFFLINE_REQUIRED');};
 await phase('module-import');t=performance.now();
 const bb=await import('@aztec/bb.js');
 const {Barretenberg,BackendType,UltraHonkBackend,UltraHonkVerifierBackend,BN254_G1_GENERATOR}=bb;
 const encoding=await import('../../../src/private-assembly-encoding.mjs');
 const key=readFileSync(join(assembly,'.local/prepared/btc_ready.vk'));
 const keyRecord=JSON.parse(readFileSync(join(assembly,'.local/prepared/btc_ready.key.json')));
 assert.equal(keyRecord.phase,'completed','WT_KEY_COMPLETED');assert.equal(keyRecord.target,spec.target,'WT_KEY_TARGET');assert.equal(keyRecord.maximumPages,spec.maximumPages,'WT_EXISTING_CAPACITY_EXCEPTION');
 assert.equal(keyRecord.circuitSHA256,spec.circuitSHA256,'WT_EXACT_BTC_V2_CIRCUIT');assert.equal(keyRecord.keySHA256,spec.keySHA256,'WT_KEY_RECORD');assert.equal(hash(key),spec.keySHA256,'WT_KEY_BYTES');
 assert.equal(hash(readFileSync(join(assembly,'circuits/btc_ready/src/main.nr'))),spec.sourceSHA256,'WT_CIRCUIT_SOURCE');
 const expectedPublicInputs=JSON.parse(readFileSync(join(project,'evidence/m18-readiness-v2',spec.currentRun,'btc-readiness-v2-capacity-probe/public-inputs.json')));
 assert.equal(hash(JSON.stringify(expectedPublicInputs)),spec.publicInputsSHA256,'WT_EXPECTED_PUBLIC_INPUTS');
 metrics.pins={circuitSHA256:spec.circuitSHA256,keySHA256:spec.keySHA256,sourceSHA256:spec.sourceSHA256,expectedPublicInputsSHA256:spec.publicInputsSHA256};
 times.moduleImport=performance.now()-t;
 let program;
 if(role==='prove'){
  await phase('complete-capability-and-input-checks');t=performance.now();
  const {readFixedCapability}=await import('../../../src/private-payment-engine.mjs');
  const fixed=await readFixedCapability();assert.ok(fixed.proofs.some(p=>p.mode==='btc_ready'&&p.circuitSHA256===spec.circuitSHA256&&p.verified),'WT_FIXED_CAPABILITY');
  const {reconstructSyntheticInput}=await import('./synthetic-input.mjs');
  reconstruction=reconstructSyntheticInput();
  metrics.inputProvenance=reconstruction.summary;metrics.ephemeralInputSHA256=reconstruction.inputHash;
  program=JSON.parse(readFileSync(join(assembly,'.local/compiled/btc_ready.json')));
  assert.equal(hash(Buffer.from(program.bytecode,'base64')),spec.circuitSHA256,'WT_PROGRAM_PIN');
  times.completeCapabilityAndInputChecks=performance.now()-t;
 }
 await phase('api-construction');t=performance.now();
 const startup=startupLogger(threads,metrics.maximumPages);
 metrics.taskThreadsBeforeApi=readdirSync('/proc/self/task').length;
 api=await Barretenberg.new({backend:BackendType.Wasm,threads,skipSrsInit:true,memory:{initial:37,maximum:metrics.maximumPages},logger:startup.logger});
 metrics.startup=startup.validate();metrics.taskThreadsAfterApi=readdirSync('/proc/self/task').length;
 times.apiConstruction=performance.now()-t;
 await phase('crs-buffer-read');t=performance.now();
 const rs=await import('../wallet-notes/resources.mjs');g2Point=readFileSync(rs.CRS+'bn254_g2.dat');
 assert.equal(hash(g2Point),checked.crsIntegrity.records[1].sha256,'WT_G2_PIN');
 if(role==='prove')pointsBuf=readDerivedCache(join(project,cache.directory),cache.derivationSHA256,lineage,true).points;
 times.crsBufferRead=performance.now()-t;
 await phase('crs-initialization');t=performance.now();
 if(role==='prove'){
  const response=await api.srsInitSrs({pointsBuf,numPoints:2097152,g2Point});
  assert.equal(response.pointsBuf.length,0,'WT_UNCOMPRESSED_REQUIRED');metrics.fullProvingCrsPoints=2097152;
 }else{
  const {initializePrivateVerifierCRS}=await import('../../../src/private-verifier-crs.mjs');
  metrics.verificationOnlyCRS=await initializePrivateVerifierCRS(api,BN254_G1_GENERATOR,g2Point);
 }
 times.crsInitialization=performance.now()-t;pointsBuf?.fill(0);g2Point.fill(0);pointsBuf=g2Point=undefined;
 const verifier=new UltraHonkVerifierBackend(api);
 const verify=(candidate,verificationKey=key)=>verifier.verifyProof({...candidate,verificationKey},{verifierTarget:'evm'});
 function assertPackage(candidate){assert.ok(candidate?.proof instanceof Uint8Array,'WT_PROOF_BYTES');assert.equal(candidate.proof.length,spec.proofBytes,'WT_PROOF_LENGTH');encoding.assertAssemblyStatement('btc_ready',candidate.publicInputs);assert.deepEqual(fields(candidate.publicInputs),fields(expectedPublicInputs),'WT_PUBLIC_INPUT_BINDING');}
 if(role==='prove'){
  await phase('verify-retained-A-and-J');t=performance.now();
  for(const p of reconstruction.packages)assert.equal(await verifier.verifyProof({proof:p.proof,publicInputs:p.publicInputs,verificationKey:p.vk},{verifierTarget:'noir-recursive'}),true,'WT_RETAINED_CHILD_REJECTED');
  metrics.retainedAAndJVerified=true;times.retainedAAndJVerification=performance.now()-t;
  await phase('witness-execution');t=performance.now();
  const {Noir}=await import('@noir-lang/noir_js');({witness}=await new Noir(program).execute(reconstruction.input));
  times.witnessExecution=performance.now()-t;metrics.ephemeralWitnessSHA256=hash(witness);
  await phase('generate-proof');t=performance.now();
  const backend=new UltraHonkBackend(program.bytecode,api);times.proofBackendConstruction=performance.now()-t;t=performance.now();
  const proof=await backend.generateProof(witness,{verifierTarget:'evm'});times.generateProof=performance.now()-t;metrics.newProofGenerated=true;
  witness.fill(0);witness=undefined;reconstruction.clear();reconstruction=undefined;
  assertPackage(proof);
  await phase('verify-original-key');t=performance.now();assert.equal(await verify(proof),true,'WT_GENUINE_REJECTED');
  times.genuineVerification=performance.now()-t;times.throughPrimaryVerification=performance.now()-began;
  metrics.verified=true;metrics.proofBytes=proof.proof.length;metrics.publicInputCount=proof.publicInputs.length;
  metrics.proofSHA256=hash(proof.proof);metrics.publicInputsSHA256=hash(JSON.stringify(proof.publicInputs));metrics.canonicalPublicInputsSHA256=hash(JSON.stringify(fields(proof.publicInputs)));
  await send({type:'primary',metrics});
  await phase('reject-mutations');t=performance.now();metrics.cryptographicRejections={};
  async function rejects(name,candidate,vk=key){let accepted,via='boolean';const start=performance.now();try{accepted=await verify(candidate,vk);}catch{accepted=false;via='exception';}assert.equal(accepted,false,'WT_INVALID_ACCEPTED');const elapsed=performance.now()-start;assert.equal(await verify(proof),true,'WT_GENUINE_AFTER_NEGATIVE_REJECTED');metrics.cryptographicRejections[name]={rejected:true,via,validAfterward:true,milliseconds:elapsed};}
  const corrupted=Uint8Array.from(proof.proof);corrupted[corrupted.length-1]^=1;
  await rejects('mutatedProof',{...proof,proof:corrupted});corrupted.fill(0);
  const changed=[...proof.publicInputs];changed[changed.length-1]='0x'+(BigInt(changed.at(-1))^1n).toString(16).padStart(64,'0');
  encoding.assertAssemblyStatement('btc_ready',changed);await rejects('mutatedPublicInput',{...proof,publicInputs:changed});changed.fill('0');
  const wrongVK=readFileSync(join(assembly,'.local/prepared/fulfill.vk'));
  assert.equal(wrongVK.length,key.length,'WT_WRONG_KEY_SHAPE');assert.notEqual(hash(wrongVK),spec.keySHA256,'WT_WRONG_KEY_DIFFERENT');
  const wrongRecord=JSON.parse(readFileSync(join(assembly,'.local/prepared/fulfill.key.json')));assert.equal(wrongRecord.target,'evm','WT_WRONG_KEY_TARGET');assert.equal(hash(wrongVK),wrongRecord.keySHA256,'WT_WRONG_KEY_PIN');
  await rejects('differentPinnedSameTargetVK',proof,wrongVK);wrongVK.fill(0);times.negativeChecks=performance.now()-t;
  if(crossProof){await phase('cross-proof-verification');t=performance.now();assert.equal(threads,4,'WT_CROSS_DIRECTION');assertPackage(crossProof);assert.equal(await verify(crossProof),true,'WT_CROSS_PROOF_REJECTED');metrics.crossProofVerified=true;metrics.crossProofSHA256=hash(crossProof.proof);times.crossProofVerification=performance.now()-t;}
  result={metrics,proof:{proof:proof.proof,publicInputs:proof.publicInputs}};
 }else{
  await phase('reciprocal-verification-only');t=performance.now();assertPackage(crossProof);assert.equal(await verify(crossProof),true,'WT_RECIPROCAL_REJECTED');
  times.reciprocalVerification=performance.now()-t;metrics.verified=true;metrics.crossProofVerified=true;metrics.crossProofSHA256=hash(crossProof.proof);metrics.noWitnessReconstructed=true;result={metrics};
 }
 metrics.phase='completed';
}catch(error){metrics.failedPhase=metrics.phase;metrics.phase='failed';metrics.failure=safeError(error);result={metrics};process.exitCode=1;}
finally{
 witness?.fill(0);reconstruction?.clear();pointsBuf?.fill(0);g2Point?.fill(0);
 let t=performance.now();if(api)try{await api.destroy();}catch{metrics.cleanupError=true;metrics.phase='failed';process.exitCode=1;}
 times.backendDestroy=performance.now()-t;metrics.taskThreadsAfterDestroy=readdirSync('/proc/self/task').length;
 globalThis.fetch=priorFetch;times.workerTotal=performance.now()-began;metrics.resourcesAfter=resources();metrics.resourceUsage=process.resourceUsage();metrics.completedAt=new Date().toISOString();
 await send({type:'result',...result});result?.proof?.proof?.fill(0);crossProof?.proof?.fill(0);process.disconnect();
}
