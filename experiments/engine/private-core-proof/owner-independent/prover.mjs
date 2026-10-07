import {PRIVATE_RESOURCE_FLOORS,PRIVATE_RESOURCE_POLICY,PRIVATE_PROOF_WORKER_RSS_LIMIT} from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
/** PC18 official bounded prover. Defining/importing this module executes no proof.
 * Private witnesses are never persisted. A/J/L input arrays are not public-chain
 * data and are NEVER written by this default helper. Callers retain operational
 * proof packages privately; public metrics contain only hashes and timings.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,statfsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Noir} from '@noir-lang/noir_js';
import {Barretenberg,BackendType,UltraHonkBackend,UltraHonkVerifierBackend,deflattenFields,BN254_FR_MODULUS,BN254_G1_GENERATOR} from '@aztec/bb.js';
import {initializePrivateVerifierCRS} from '../../../../packages/engine/src/crypto/private-verifier-crs.mjs';
import {sha256} from '../../../../packages/engine/src/notes/private-note-encoding.mjs';
import {ASSEMBLY_PUBLIC_WORDS,ASSEMBLY_RECURSIVE_MODES,assertAssemblyStatement} from '../../../../packages/engine/src/assembly/private-assembly-encoding.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const digest=b=>sha256(b).toString('hex');
const resources=()=>{const s=statfsSync(root);return{availableRAM:Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024,freeDisk:s.bavail*s.bsize,rss:process.memoryUsage().rss};};
function guard(){const r=resources();assert.ok(r.availableRAM>=PRIVATE_RESOURCE_FLOORS.availableRAM,'PC18_AVAILABLE_RAM_FLOOR');assert.ok(r.freeDisk>=PRIVATE_RESOURCE_FLOORS.freeDisk,'PC18_DISK_FLOOR');return r;}
let busy=false;
async function produceAssembly(mode,input,label,expectedVerification,maximumPages=32768) {
 assert.ok([32768,65536].includes(maximumPages));if(maximumPages===65536)assert.equal(mode,'btc_ready','PC18_BTC_V2_CAPACITY_ONLY');
 assert.ok(Object.hasOwn(ASSEMBLY_PUBLIC_WORDS,mode),'PC18_PROOF_MODE');assert.match(label,/^[a-zA-Z0-9_-]{1,100}$/,'PC18_PROOF_LABEL');assert.equal(busy,false,'PC18_SEQUENTIAL_PROOFS_ONLY');busy=true;
 const recursive=ASSEMBLY_RECURSIVE_MODES.includes(mode),settings={verifierTarget:recursive?'noir-recursive':'evm'},stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
 const record={classification:expectedVerification?'REAL_PC18_PROOF_ATTEMPT_PUBLIC_METRICS_ONLY':'REAL_EXPECTED_INVALID_RECURSIVE_CANDIDATE',mode,label,target:settings.verifierTarget,maximumPages,startedAt:new Date().toISOString(),phase:'initializing',proofGenerated:false,verified:false};
 mkdirSync(root+'../../../evidence/m18-proof-attempts',{recursive:true});const path=root+'../../../evidence/m18-proof-attempts/'+stamp+'-'+label+'.json';
 const save=()=>writeFileSync(path,JSON.stringify(record,null,2)+'\n');
 const phase=p=>{record.phase=p;record.resources=guard();save();};let api;const began=performance.now(),oldFetch=globalThis.fetch;
 const failStop=message=>{record.phase='bounded-abort';record.failure={message};record.processResourceUsage=process.resourceUsage();save();process.exit(2);};
 const monitor=setInterval(()=>{try{guard();}catch(error){failStop(error.message);}},1000),timer=setTimeout(()=>failStop('PC18_PROOF_15_MINUTE_BOUND'),900000);
 try {
  phase('pinned-program-key-and-crs');const program=JSON.parse(readFileSync(root+'.local/compiled/'+mode+'.json')),key=readFileSync(root+'.local/prepared/'+mode+'.vk'),keyRecord=JSON.parse(readFileSync(root+'.local/prepared/'+mode+'.key.json'));
  assert.equal(keyRecord.phase,'completed');assert.equal(keyRecord.target,settings.verifierTarget);assert.equal(digest(key),keyRecord.keySHA256);assert.equal(digest(Buffer.from(program.bytecode,'base64')),keyRecord.circuitSHA256,'PC18_PROGRAM_KEY_PIN');if(maximumPages===65536)assert.equal(keyRecord.circuitSHA256,'aa9295c48bff839e59f171f5c5945a15e4e33476019ee97202df932747d8902e','PC18_MEASURED_BTC_V2_ONLY');
  record.circuitSHA256=keyRecord.circuitSHA256;record.verificationKeySHA256=keyRecord.keySHA256;record.sourceSHA256=digest(readFileSync(root+'circuits/'+mode+'/src/main.nr'));assert.equal(record.sourceSHA256,keyRecord.sourceSHA256,'PC18_SOURCE_KEY_PIN');
  const crs=root+'../native-notes/.local/crs/2097152/',provenance=JSON.parse(readFileSync(crs+'provenance.json'));for(const f of provenance.records){const b=readFileSync(crs+f.file);assert.equal(b.length,f.bytes);assert.equal(digest(b),f.sha256);}
  globalThis.fetch=async()=>{throw Error('PC18_OFFLINE_PROOF_REQUIRED');};
  api=await Barretenberg.new({backend:BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:maximumPages}});await api.srsInitSrs({pointsBuf:readFileSync(crs+'bn254_g1_compressed.dat'),numPoints:2097152,g2Point:readFileSync(crs+'bn254_g2.dat')});
  phase('private-witness-in-memory');let t=performance.now();const {witness}=await new Noir(program).execute(input);record.witnessMilliseconds=performance.now()-t;
  phase('actual-proof-generation');t=performance.now();const result=await new UltraHonkBackend(program.bytecode,api).generateProof(witness,settings);record.proofMilliseconds=performance.now()-t;record.proofGenerated=true;
  assertAssemblyStatement(mode,result.publicInputs);phase('actual-proof-verification');t=performance.now();record.verified=await new UltraHonkVerifierBackend(api).verifyProof({...result,verificationKey:key},settings);record.verificationMilliseconds=performance.now()-t;assert.equal(record.verified,expectedVerification,expectedVerification?'PC18_ACTUAL_PROOF_REJECTED':'PC18_INVALID_CANDIDATE_ACCEPTED');
  record.proofBytes=result.proof.length;record.proofSHA256=digest(result.proof);record.publicInputCount=result.publicInputs.length;record.publicInputsSHA256=digest(Buffer.from(JSON.stringify(result.publicInputs)));record.readiness600SecondWindowExceeded=mode.endsWith('_ready')&&performance.now()-began>=600000;
  const extra={};if(recursive){extra.vkFields=JSON.parse(readFileSync(root+'.local/prepared/'+mode+'.fields.json'));extra.proofFields=deflattenFields(result.proof);assert.equal(extra.vkFields.length,115);assert.equal(extra.proofFields.length,458);for(const f of [...extra.vkFields,...extra.proofFields,...result.publicInputs])assert.ok(BigInt(f)>=0n&&BigInt(f)<BigInt(BN254_FR_MODULUS));}
  record.phase='completed';record.processResourceUsage=process.resourceUsage();record.totalMilliseconds=performance.now()-began;save();return{...result,...extra,metrics:structuredClone(record)};
 } catch(error){record.failedPhase=record.phase;record.phase='failed';record.failure={name:error.name,code:/^PC18_[A-Z0-9_]+$/.test(error.message)?error.message:'TOOLCHAIN_OR_CONSTRAINT_FAILURE_DETAILS_NOT_PUBLISHED'};throw error;}
 finally{clearInterval(monitor);clearTimeout(timer);if(api)await api.destroy();globalThis.fetch=oldFetch;record.totalMilliseconds=performance.now()-began;record.completedAt=new Date().toISOString();record.processResourceUsage=process.resourceUsage();record.resources=resources();save();busy=false;}
}

// Parent-approved bounded native profile: only exact measured BTC v2 uses4GiB.
export const proveAssembly=(mode,input,label=mode)=>produceAssembly(mode,input,label,true,mode==='btc_ready'?65536:32768);
/** One explicitly authorized R_BTC v2 capacity probe; production defaults stay unchanged. */
export const proveAssemblyCapacityProbe=(mode,input,label)=>produceAssembly(mode,input,label,true,65536);
/** Capability-test only: produces a candidate and requires actual verifier false. */
export const proveRejectedAssemblyCandidate=(mode,input,label)=>produceAssembly(mode,input,label,false);

/** Public trusted bootstrap material, with no proof or witness operation. */
export function assemblyVerificationPins(modes=ASSEMBLY_RECURSIVE_MODES) {
 return Object.fromEntries(modes.map(mode=>{assert.ok(Object.hasOwn(ASSEMBLY_PUBLIC_WORDS,mode));const r=JSON.parse(readFileSync(root+'.local/prepared/'+mode+'.key.json')),vk=readFileSync(root+'.local/prepared/'+mode+'.vk');assert.equal(r.phase,'completed');assert.equal(digest(vk),r.keySHA256);const recursive=ASSEMBLY_RECURSIVE_MODES.includes(mode);assert.equal(r.target,recursive?'noir-recursive':'evm');return[mode,{target:r.target,keySHA256:r.keySHA256,circuitSHA256:r.circuitSHA256,statementWords:ASSEMBLY_PUBLIC_WORDS[mode],...(recursive?{vkFields:JSON.parse(readFileSync(root+'.local/prepared/'+mode+'.fields.json'))}:{})}];}));
}

/** Actual pinned verifier, not host shape validation. No proof is generated. */
export async function verifyAssembly(mode,proofPackage) {
 assert.equal(busy,false,'PC18_SEQUENTIAL_PROOFS_ONLY');busy=true;let api;const priorFetch=globalThis.fetch;
 try {
  guard();assertAssemblyStatement(mode,proofPackage.publicInputs);assert.ok(proofPackage.proof instanceof Uint8Array,'PC18_PROOF_BYTES');
  const pins=assemblyVerificationPins([mode])[mode],vk=readFileSync(root+'.local/prepared/'+mode+'.vk');
  if(ASSEMBLY_RECURSIVE_MODES.includes(mode)) {
   assert.deepEqual(proofPackage.vkFields?.map(BigInt),pins.vkFields.map(BigInt),'PC18_PACKAGE_FULL_VK');
   assert.equal(proofPackage.proofFields?.length,458,'PC18_PACKAGE_PROOF_FIELDS');
   assert.deepEqual(proofPackage.proofFields.map(BigInt),deflattenFields(proofPackage.proof).map(BigInt),'PC18_PACKAGE_PROOF_FIELD_BYTES');
  }
  const crs=root+'../native-notes/.local/crs/2097152/',provenance=JSON.parse(readFileSync(crs+'provenance.json'));
  for(const r of provenance.records){const b=readFileSync(crs+r.file);assert.equal(b.length,r.bytes);assert.equal(digest(b),r.sha256);}
  globalThis.fetch=async()=>{throw Error('PC18_OFFLINE_VERIFY_REQUIRED');};
  api=await Barretenberg.new({backend:BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});
  await initializePrivateVerifierCRS(api,BN254_G1_GENERATOR,readFileSync(crs+'bn254_g2.dat'));
  return await new UltraHonkVerifierBackend(api).verifyProof({proof:proofPackage.proof,publicInputs:proofPackage.publicInputs,verificationKey:vk},{verifierTarget:pins.target});
 } finally {if(api)await api.destroy();globalThis.fetch=priorFetch;busy=false;}
}
