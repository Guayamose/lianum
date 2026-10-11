/** Synthetic S74 only. Input/witness remain in IPC/process memory; no private files. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const began=performance.now();
process.send({type:'entered',at:new Date().toISOString()});
console.log=()=>{};
const inputMessage=await new Promise(resolve=>process.once('message',resolve));
const {backend,input,expectedPublicInputs,crossProof}=inputMessage;
let witness,api,result;
const metrics={backend,mode:'reserve_from_note',threads:1,verifierTarget:'evm',zeroKnowledgeEnabled:true,phase:'module-import',startedAt:new Date().toISOString(),timingsMilliseconds:{}};
const times=metrics.timingsMilliseconds;
const phase=p=>{metrics.phase=p;process.send({type:'phase',phase:p});};
let hash,resources;
try {
 let t=performance.now();
 const [noir,bb,rs,pv,encoding]=await Promise.all([import('@noir-lang/noir_js'),import('@aztec/bb.js'),import('../wallet-notes/resources.mjs'),import('../wallet-notes/prover.mjs'),import('@lianum/engine/wallet/notes/private-wallet-note-encoding')]);
 times.moduleImport=performance.now()-t;
 const {Noir}=noir,{Barretenberg,BackendType,UltraHonkBackend,UltraHonkVerifierBackend}=bb;
 ({hash,resources}=rs);const {root,guard,filePin,verifyToolchain,verifyCRS,CRS}=rs;
 phase('checking-pins');t=performance.now();guard();metrics.toolchain=verifyToolchain();
 const pins=pv.walletVerificationPins(['reserve_from_note']).reserve_from_note;
 const program=JSON.parse(readFileSync(root+'.local/compiled/reserve_from_note.json'));
 const key=readFileSync(root+'.local/prepared/reserve_from_note.vk');
 assert.equal(hash(Buffer.from(program.bytecode,'base64')),pins.circuitSHA256);
 metrics.pins=pins;metrics.crs=verifyCRS();
 const provenance=JSON.parse(readFileSync(new URL('./native-provenance.json',import.meta.url)));
 const bbPath=new URL('../../pc5-proof-probe/node_modules/@aztec/bb.js/build/amd64-linux/bb',import.meta.url).pathname;
 filePin(bbPath,{sha256:provenance.binarySHA256,bytes:provenance.binaryBytes});
 metrics.nativeProvenanceSHA256=hash(readFileSync(new URL('./native-provenance.json',import.meta.url)));
 times.pinChecks=performance.now()-t;
 // Refuse a mutated key or CRS at the hash boundary, without changing real files.
 const alteredKey=Buffer.from(key);alteredKey[alteredKey.length-1]^=1;
 assert.throws(()=>assert.equal(hash(alteredKey),pins.keySHA256));alteredKey.fill(0);
 const crsRecord=metrics.crs.records[0];
 assert.throws(()=>filePin(CRS+crsRecord.file,{...crsRecord,sha256:'0'.repeat(64)}));
 metrics.negativePins={alteredKeyBytesRejected:true,alteredCRSExpectedHashRejected:true,realFilesModified:false};
 globalThis.fetch=async()=>{throw Error('AB_OFFLINE_REQUIRED');};
 phase('api-construction');guard();t=performance.now();
 const options={backend:backend==='native'?BackendType.NativeUnixSocket:BackendType.Wasm,threads:1,skipSrsInit:true};
 if(backend==='native')options.bbPath=bbPath;
 else options.memory={initial:37,maximum:32768};
 api=await Barretenberg.new(options);times.apiConstruction=performance.now()-t;
 metrics.options=options;
 phase('crs-initialization');guard();t=performance.now();
 const pointsBuf=readFileSync(CRS+'bn254_g1_compressed.dat'),g2Point=readFileSync(CRS+'bn254_g2.dat');
 times.crsRead=performance.now()-t;t=performance.now();
 await api.srsInitSrs({pointsBuf,numPoints:2097152,g2Point});times.crsInitialization=performance.now()-t;
 pointsBuf.fill(0);g2Point.fill(0);
 phase('witness-execution');guard();t=performance.now();
 ({witness}=await new Noir(program).execute(input));times.witnessExecution=performance.now()-t;
 const ephemeralWitnessHash=hash(witness);
 phase('generate-proof');guard();t=performance.now();const prover=new UltraHonkBackend(program.bytecode,api);
 times.proofBackendConstruction=performance.now()-t;t=performance.now();
 const proof=await prover.generateProof(witness,{verifierTarget:'evm'});times.generateProof=performance.now()-t;
 encoding.assertWalletStatement('reserve_from_note',proof.publicInputs);
 assert.deepEqual(proof.publicInputs.map(x=>BigInt(x).toString()),expectedPublicInputs.map(x=>BigInt(x).toString()),'AB_PUBLIC_INPUTS');
 phase('verify-original-key');guard();t=performance.now();
 const verifier=new UltraHonkVerifierBackend(api);
 const verified=await verifier.verifyProof({...proof,verificationKey:key},{verifierTarget:'evm'});
 times.verification=performance.now()-t;assert.equal(verified,true,'AB_PINNED_VK_REJECTED');
 times.throughPrimaryVerification=performance.now()-began;
 metrics.verified=true;metrics.publicInputCount=proof.publicInputs.length;metrics.proofBytes=proof.proof.length;
 metrics.proofSHA256=hash(proof.proof);metrics.publicInputsSHA256=hash(JSON.stringify(proof.publicInputs));
 process.send({type:'primary',metrics});
 phase('reject-mutations');t=performance.now();
 const corrupted=Uint8Array.from(proof.proof);corrupted[corrupted.length-1]^=1;
 async function rejects(candidate){try{return {rejected:!(await verifier.verifyProof({...candidate,verificationKey:key},{verifierTarget:'evm'})),via:'boolean'};}catch{return {rejected:true,via:'exception'};}}
 const badProof=await rejects({...proof,proof:corrupted});assert.equal(badProof.rejected,true,'AB_MUTATED_PROOF_ACCEPTED');
 const alteredInputs=[...proof.publicInputs];alteredInputs[0]='0x'+(BigInt(alteredInputs[0])^1n).toString(16).padStart(64,'0');
 const badPublicInput=await rejects({...proof,publicInputs:alteredInputs});assert.equal(badPublicInput.rejected,true,'AB_MUTATED_INPUT_ACCEPTED');
 metrics.negativeProofChecks={mutatedProof:badProof,mutatedPublicInput:badPublicInput,originalVK:true};
 times.mutationChecks=performance.now()-t;
 if(crossProof){phase('cross-backend-verification');guard();t=performance.now();
  assert.deepEqual(proof.publicInputs,crossProof.publicInputs,'AB_CROSS_PUBLIC_INPUTS');
  metrics.nativeProofVerifiedByWasm=await verifier.verifyProof({...crossProof,verificationKey:key},{verifierTarget:'evm'});
  times.crossBackendVerification=performance.now()-t;assert.equal(metrics.nativeProofVerifiedByWasm,true,'AB_CROSS_BACKEND_REJECTED');
 }
 result={metrics,proof:{proof:proof.proof,publicInputs:proof.publicInputs},ephemeralWitnessHash};
 metrics.phase='completed';
} catch(error) {
 metrics.failure={name:error.name,message:/^(AB_|PC23_)/.test(error.message)?error.message:'BACKEND_OR_TOOLCHAIN_FAILURE'};
 metrics.failedPhase=metrics.phase;metrics.phase='failed';
 result={metrics};process.exitCode=1;
} finally {
 witness?.fill(0);let t=performance.now();
 if(api){try{await api.destroy();}catch{metrics.cleanupError=true;process.exitCode=1;}}
 times.backendDestroy=performance.now()-t;times.workerTotal=performance.now()-began;
 if(resources)metrics.resourcesAfter=resources();metrics.resourceUsage=process.resourceUsage();
 metrics.completedAt=new Date().toISOString();
 process.send({type:'result',...result},()=>process.disconnect());
}
