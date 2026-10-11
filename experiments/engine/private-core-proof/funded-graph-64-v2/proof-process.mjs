/** Fixed original V2 proof child; ciphertext input and public result only. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PAEG64_ROOT_V2,PAEG64_WORDS_V2,loadFundedGraph64ArtifactsV2} from './artifacts.mjs';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,openPrivateProofJobV1,closePrivateProofRecipientV1,wipePrivateProofInputsV1,privateProofBindingSHA256V1} from '@lianum/engine/crypto/private-proof-transit-v1';
const role=Object.freeze({reserve:'owner',fulfill:'owner',ready:'dependency',admission:'local',withdraw:'recipient'});
assert.equal(process.argv.length,5,'PAEG64_FIXED_WORKER_ARGUMENTS');const [mode,jobId,manifestSHA256]=process.argv.slice(2);assert.ok(Object.hasOwn(PAEG64_WORDS_V2,mode),'PAEG64_FIXED_MODE');assert.match(jobId,/^[a-f0-9-]{36}$/,'PAEG64_JOB_ID');assert.ok(process.send&&process.connected,'PAEG64_IPC_PARENT');
assert.equal(realpathSync('/proc/'+process.ppid+'/exe'),realpathSync(process.execPath),'PAEG64_OWNED_NODE_PARENT');
const manifest=loadFundedGraph64ArtifactsV2(manifestSHA256);const recipient=createPrivateProofRecipientV1({relation:'funded_graph_global_'+mode,role:role[mode],jobId});let used=false,terminal=false,inputs,api,witness;
const abort=()=>{process.exitCode=1;wipePrivateProofInputsV1(inputs);witness?.fill(0);closePrivateProofRecipientV1(recipient);if(process.connected)process.disconnect();};process.once('disconnect',()=>{if(!terminal){abort();process.exit(1);}});
process.on('message',async packet=>{
 if(used){abort();return;}used=true;
 try{
  const opened=openPrivateProofJobV1(recipient,packet);inputs=opened.inputs;assert.equal(opened.authorization.jobId,jobId,'PAEG64_JOB_BINDING');
  const expected=opened.expectedPublicInputs;assert.equal(expected.length,PAEG64_WORDS_V2[mode],'PAEG64_EXPECTED_WORDS');
  const project=resolve(PAEG64_ROOT_V2,'../../../..');const original=join(project,'.internal/runtime/omnichain-product');const require=createRequire(join(original,'experiments/private-core-proof/package.json'));
  const resources=await import(pathToFileURL(join(original,'experiments/private-core-proof/wallet-notes/resources.mjs')));resources.verifyToolchain();resources.verifyCRS();resources.guard();
  const {Noir}=await import(pathToFileURL(require.resolve('@noir-lang/noir_js')));const kit=await import(pathToFileURL(require.resolve('@aztec/bb.js')));
  const program=JSON.parse(readFileSync(join(PAEG64_ROOT_V2,'.local/prepared',mode+'.json')));const vk=readFileSync(join(PAEG64_ROOT_V2,'.local/prepared',mode+'.vk'));
  globalThis.fetch=async()=>{throw new Error('PAEG64_OFFLINE_REQUIRED');};api=await kit.Barretenberg.new({backend:kit.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:65536}});
  await api.srsInitSrs({pointsBuf:readFileSync(resources.CRS+'bn254_g1_compressed.dat'),numPoints:2097152,g2Point:readFileSync(resources.CRS+'bn254_g2.dat')});
  ({witness}=await new Noir(program).execute(inputs));wipePrivateProofInputsV1(inputs);inputs=null;
  const proof=await new kit.UltraHonkBackend(program.bytecode,api).generateProof(witness,{verifierTarget:'evm'});assert.deepEqual(proof.publicInputs.map(v=>BigInt(v).toString()),expected,'PAEG64_PUBLIC_INPUT_JOIN');
  assert.equal(await new kit.UltraHonkVerifierBackend(api).verifyProof({...proof,verificationKey:vk},{verifierTarget:'evm'}),true,'PAEG64_ACTUAL_PROOF_REJECTED');assert.deepEqual(loadFundedGraph64ArtifactsV2(manifestSHA256),manifest);
  witness.fill(0);witness=null;await api.destroy();api=null;
  const result={type:'funded-graph-64-public-result-v2',mode,jobId,manifestSHA256,bindingSHA256:privateProofBindingSHA256V1(opened.authorization),proof:Buffer.from(proof.proof).toString('hex'),publicInputs:expected};
  await new Promise((resolve,reject)=>process.send(result,e=>e?reject(e):resolve()));terminal=true;process.disconnect();
 }catch{abort();}finally{wipePrivateProofInputsV1(inputs);witness?.fill(0);if(api)await api.destroy();closePrivateProofRecipientV1(recipient);}
});
process.send(readPrivateProofRecipientV1(recipient),error=>{if(error)abort();});
