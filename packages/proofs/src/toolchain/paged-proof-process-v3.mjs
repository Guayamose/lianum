/** Fixed original V3 proof child; ciphertext input and public result only. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {projectRoot,resourceRoot} from '@lianum/environment';
import * as resources from '@lianum/components/resources/wallet-resources';
import {loadOfficialProofLibrariesV1} from './official-proof-libraries.mjs';
import {initializePrivateVerifierCRS} from '@lianum/components/resources/private-verifier-crs';
import {initializePagedNativeProverV3,assertPagedNativeProverCurrentV3,destroyPagedNativeProverV3,PAGED_NATIVE_PROVER_PROFILE_V3} from './paged-native-prover-v3.mjs';
import {PAEG_PAGED_ARTIFACT_DIRECTORY_V3,PAEG_PAGED_WORDS_V3,loadFundedPagedGraphArtifactsV3} from './paged-artifacts-v3.mjs';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,openPrivateProofJobV1,closePrivateProofRecipientV1,wipePrivateProofInputsV1,privateProofBindingSHA256V1} from '@lianum/engine/crypto/private-proof-transit-v1';
const role=Object.freeze({reserve:'owner',fold:'owner',terminal:'owner',admission:'local',withdraw:'recipient'});
const [mode,jobId,manifestSHA256]=process.argv.slice(2);let manifest,recipient,used=false,terminal=false,inputs,api,verifier,witness,rawWitness,nativeClosure,nativeAcquisition,verifierAcquisition,nativeClosing,verifierClosing,abortWork,aborting=false;
let stage='STARTUP';
const began=performance.now(),timings={};
const timed=async(name,fn)=>{const start=performance.now();try{return await fn();}finally{timings[name]=Math.max(0,Math.round(performance.now()-start));}};
// Stage durations are public operational DATA; no witness, opening, statement
// or exception text is retained, and they cannot issue a result or capability.
function retainPerformance(){try{const directory=join(resourceRoot('engine'),'evidence/paeg-proof-attempts');mkdirSync(directory,{recursive:true,mode:0o700});writeFileSync(join(directory,'paged-proof-'+jobId+'-performance.json'),JSON.stringify({profile:PAGED_NATIVE_PROVER_PROFILE_V3,mode,jobId,manifestSHA256,completed:true,timings,totalMilliseconds:Math.round(performance.now()-began),nativeProducerClosedBeforeVerification:true,nativeClosure})+'\n',{mode:0o600,flag:'wx'});}catch{}}
// Retain fixed stages and source locations only, never error text or witnesses.
function retainFailure(error){try{
 if(typeof jobId!=='string'||!/^[a-f0-9-]{36}$/.test(jobId))return;
 const frames=[];
 for(const row of String(error?.stack??'').slice(0,65536).split('\n').slice(1,65)){
  const m=/\b(file:\/\/[^()\r\n?#]+\.mjs):([1-9][0-9]{0,8}):([1-9][0-9]{0,8})\)?$/.exec(row);
  if(!m)continue;const file=new URL(m[1]).pathname,path=relative(projectRoot,file);
  if(!file.startsWith(projectRoot+'/')||!/^[A-Za-z0-9_./-]+$/.test(path)||path.split('/').includes('..'))continue;
  frames.push({path,line:Number(m[2]),column:Number(m[3])});if(frames.length===6)break;
 }
 // Noir errors can have no JavaScript stack. Keep source locations and opcode
 // numbers only; assertion payloads and exception messages can contain inputs.
 const noirFrames=[],opcodes=[];
 for(const row of Array.isArray(error?.noirCallStack)?error.noirCallStack.slice(0,16):[]){
  if(typeof row!=='string'||row.length>4096)continue;
  const match=/\(([A-Za-z0-9_./-]+\.nr):([1-9][0-9]{0,8}):([1-9][0-9]{0,8})\)$/.exec(row);
  if(match)noirFrames.push({path:match[1],line:Number(match[2]),column:Number(match[3])});
 }
 for(const row of Array.isArray(error?.callStack)?error.callStack.slice(0,16):[])
  if(typeof row==='string'&&/^[0-9]{1,9}(?:\.[0-9]{1,9}){0,4}$/.test(row))opcodes.push(row);
 const acirFunctionId=Number.isSafeInteger(error?.acirFunctionId)&&error.acirFunctionId>=0?error.acirFunctionId:null;
 const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,100}$/.test(error.code)?error.code:typeof error?.message==='string'&&/^PAEG_PAGED_[A-Z0-9_]{1,100}$/.test(error.message)?error.message:null;
 const directory=join(resourceRoot('engine'),'evidence/paeg-proof-attempts');mkdirSync(directory,{recursive:true,mode:0o700});
 writeFileSync(join(directory,'paged-proof-'+jobId+'-failure.json'),JSON.stringify({format:'PAGED_PROOF_PRIVATE_FAILURE_METADATA_V3',mode,stage,code,frames,noirFrames,opcodes,acirFunctionId})+'\n',{mode:0o600,flag:'wx'});
}catch{}}
const closeNative=()=>nativeClosing??=(async()=>{const original=api??await nativeAcquisition?.catch(()=>null);api=null;if(original)return destroyPagedNativeProverV3(original);})();
const closeVerifier=()=>verifierClosing??=(async()=>{const original=verifier??await verifierAcquisition?.catch(()=>null);verifier=null;if(original)await original.destroy();})();
const abort=()=>{if(abortWork)return abortWork;aborting=true;process.exitCode=1;wipePrivateProofInputsV1(inputs);witness?.fill(0);rawWitness?.fill(0);if(recipient)closePrivateProofRecipientV1(recipient);return abortWork=(async()=>{const closed=await Promise.allSettled([closeNative(),closeVerifier()]);for(const result of closed)if(result.status==='rejected')retainFailure(result.reason);if(process.connected)process.disconnect();})();};
try{
 assert.equal(process.argv.length,5,'PAEG_PAGED_FIXED_WORKER_ARGUMENTS');assert.ok(Object.hasOwn(PAEG_PAGED_WORDS_V3,mode),'PAEG_PAGED_FIXED_MODE');assert.match(jobId,/^[a-f0-9-]{36}$/,'PAEG_PAGED_JOB_ID');assert.ok(process.send&&process.connected,'PAEG_PAGED_IPC_PARENT');
 assert.equal(realpathSync('/proc/'+process.ppid+'/exe'),realpathSync(process.execPath),'PAEG_PAGED_OWNED_NODE_PARENT');
 manifest=loadFundedPagedGraphArtifactsV3(manifestSHA256);
 recipient=createPrivateProofRecipientV1({relation:'funded_graph_paged_'+mode,role:role[mode],jobId});
 stage='INTAKE';
}catch(error){retainFailure(error);abort();}
if(recipient){
process.once('disconnect',()=>{if(!terminal)void abort();});
process.once('SIGTERM',()=>{void abort();});
process.on('message',async packet=>{
 if(used){abort();return;}used=true;
 try{
  const opened=openPrivateProofJobV1(recipient,packet);inputs=opened.inputs;assert.equal(opened.authorization.jobId,jobId,'PAEG_PAGED_JOB_BINDING');
  const expected=opened.expectedPublicInputs;assert.equal(expected.length,PAEG_PAGED_WORDS_V3[mode],'PAEG_PAGED_EXPECTED_WORDS');
  stage='TOOLCHAIN';await timed('pins',()=>{resources.verifyToolchain();resources.verifyCRS();resources.guard();});
  const kit=await timed('libraries',loadOfficialProofLibrariesV1);const {Noir}=kit;
  const program=JSON.parse(readFileSync(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'prepared',mode+'.json')));const vk=readFileSync(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'prepared',mode+'.vk'));
  // Fixed native twelve-thread producer; one ephemeral job and the same total
  // 3GiB coordinator+backend watchdog, CRS, prepared VK and ZK/EVM settings.
  assert.ok(!aborting,'PAEG_PAGED_CLIENT_DRAIN');globalThis.fetch=async()=>{throw new Error('PAEG_PAGED_OFFLINE_REQUIRED');};nativeAcquisition=timed('backendInitialization',initializePagedNativeProverV3);api=await nativeAcquisition;assert.ok(!aborting,'PAEG_PAGED_CLIENT_DRAIN');
  await timed('crsInitialization',()=>api.srsInitSrs({pointsBuf:readFileSync(resources.CRS+'bn254_g1_compressed.dat'),numPoints:2097152,g2Point:readFileSync(resources.CRS+'bn254_g2.dat')}));assertPagedNativeProverCurrentV3(api);
  stage='WITNESS';({witness}=await timed('witness',()=>new Noir(program).execute(inputs)));wipePrivateProofInputsV1(inputs);inputs=null;
  stage='PROVE';
  // The wrapper logs to stdout and falls back to an empty VK. Call the same
  // official API with the authenticated prepared key and original EVM settings.
  rawWitness=gunzipSync(witness);
  assertPagedNativeProverCurrentV3(api);
  const generated=await timed('prove',()=>api.circuitProve({witness:rawWitness,circuit:{name:mode,bytecode:gunzipSync(Buffer.from(program.bytecode,'base64')),verificationKey:vk},settings:{ipaAccumulation:false,oracleHashType:'keccak',disableZk:false,optimizedSolidityVerifier:false}}));assertPagedNativeProverCurrentV3(api);
  rawWitness.fill(0);rawWitness=null;
  const proof={proof:Buffer.concat(generated.proof.map(field=>Buffer.from(field))),publicInputs:generated.publicInputs.map(field=>'0x'+Buffer.from(field).toString('hex'))};
  assert.deepEqual(proof.publicInputs.map(v=>BigInt(v).toString()),expected,'PAEG_PAGED_PUBLIC_INPUT_JOIN');
  stage='PRODUCER_VERIFY';assert.equal(await timed('producerVerify',()=>new kit.UltraHonkVerifierBackend(api).verifyProof({...proof,verificationKey:vk},{verifierTarget:'evm'})),true,'PAEG_PAGED_ACTUAL_PROOF_REJECTED');assertPagedNativeProverCurrentV3(api);
  witness.fill(0);witness=null;
  stage='PRODUCER_CLOSE';nativeClosure=await timed('producerClose',closeNative);assert.ok(!aborting,'PAEG_PAGED_CLIENT_DRAIN');
  // Verification stays real and uses the original prepared VK. A separate
  // official Wasm verifier starts only after native PID/streams/socket close,
  // so verification cannot hide producer memory outside the unchanged budget.
  stage='VERIFY';verifierAcquisition=timed('verifierInitialization',()=>kit.Barretenberg.new({backend:kit.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:65536}}));verifier=await verifierAcquisition;assert.ok(!aborting,'PAEG_PAGED_CLIENT_DRAIN');
  await timed('verifierCRS',()=>initializePrivateVerifierCRS(verifier,kit.BN254_G1_GENERATOR,readFileSync(resources.CRS+'bn254_g2.dat')));
  assert.equal(await timed('verify',()=>new kit.UltraHonkVerifierBackend(verifier).verifyProof({...proof,verificationKey:vk},{verifierTarget:'evm'})),true,'PAEG_PAGED_ACTUAL_PROOF_REJECTED');assert.deepEqual(loadFundedPagedGraphArtifactsV3(manifestSHA256),manifest);
  await timed('verifierClose',closeVerifier);assert.ok(!aborting,'PAEG_PAGED_CLIENT_DRAIN');retainPerformance();
  stage='PUBLIC_RESULT';const result={type:'funded-graph-paged-public-result-v3',mode,jobId,manifestSHA256,bindingSHA256:privateProofBindingSHA256V1(opened.authorization),proof:Buffer.from(proof.proof).toString('hex'),publicInputs:expected};
  await new Promise((resolve,reject)=>process.send(result,e=>e?reject(e):resolve()));terminal=true;process.disconnect();
 }catch(error){retainFailure(error);await abort();}finally{wipePrivateProofInputsV1(inputs);witness?.fill(0);rawWitness?.fill(0);const closed=await Promise.allSettled([closeNative(),closeVerifier()]);for(const result of closed)if(result.status==='rejected')retainFailure(result.reason);closePrivateProofRecipientV1(recipient);}
});
process.send(readPrivateProofRecipientV1(recipient),error=>{if(error)abort();});
}
