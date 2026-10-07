/** Public VK/proof/verifier only; synthetic private witness lives only in memory. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DIR, ROOT, CATALOG, LIMITS, SETTINGS, hash, json, parse, writeNew, replace,
  fingerprint, acceptedProgram, loadPhase, memoryFor } from './common.mjs';
import { regular, loadPinned, assertStats, assertKeyBytes, canonicalKeyHash, publicWords,
  verifierWords, resourceModuleURL } from '../../../packages/proofs/src/tooling/tooling.mjs';
import { validateJobAgainstABI } from '../../../packages/proofs/src/jobs/trusted-jobs.mjs';
import { compileSoliditySources } from '../../../packages/proofs/src/tooling/solidity-compiler.mjs';
import { FIELD_MODULUS } from '../../../packages/backend/src/execution/encoding/statements.mjs';
import { buildSyntheticGenericIngressV3Fixture } from '../native-ingress-v3/fixtures/synthetic-ingress-v3.mjs';
import { verifyPinnedCO42 } from '../native-ingress-v3-validation/common.mjs';
import { deriveGenericVerifierImmutables } from '../../../packages/engine/src/execution/local/local-deployment.mjs';

for(const name of ['log','info','warn','error','debug','trace'])console[name]=()=>{};
globalThis.fetch=async()=>{throw Error('V3A_OFFLINE_REQUIRED');};
assert.equal(process.argv.length,4);assert.deepEqual(process.execArgv,[]);
assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');
assert.equal(realpathSync(process.argv[1]),join(DIR,'worker.mjs'));
const [mode,runId]=process.argv.slice(2);assert.ok(['stats','key','proof','solidity'].includes(mode));assert.match(runId,/^[a-f0-9-]{36}$/);
const attempt=join(DIR,'.local',runId),request=parse(join(attempt,'request.json')),lock=parse(join(DIR,'.local/active.lock'));
assert.equal(request.mode,mode);assert.equal(request.runId,runId);assert.equal(request.durableCheckpoint.approvedToStart,true);
assert.equal(lock.pid,process.ppid);assert.equal(lock.runId,runId);assert.equal(lock.mode,mode);
const parentArgs=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);
assert.equal(parentArgs.length,2);assert.equal(realpathSync(parentArgs[1]),join(DIR,'run.mjs'));
assert.equal(realpathSync(`/proc/${process.ppid}/exe`),realpathSync(process.execPath));assert.equal(realpathSync(process.cwd()),ROOT);
assert.equal(typeof process.send,'function');
const pins=parse(join(attempt,'pins.json'));
const report={format:'LIANUM_GENERIC_INGRESS_V3_PUBLIC_ARTIFACT_RESULT_V1',profile:'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',
  relation:'native_claim_ingress_v3',mode,runId,lineage:request.lineage,phase:'starting',limits:LIMITS,settings:SETTINGS,
  sourceClosureSHA256:pins.validated.source.sourceClosureSHA256,compiled:pins.compiled,
  pinsSHA256:hash(regular(join(attempt,'pins.json'))),publicWords:51,publicArtifacts:[],
  keyGenerated:false,proofGenerated:false,nativeNodesStarted:false,deployed:false,activated:false,witnessPersisted:false};
const save=()=>replace(join(attempt,'result.json'),report);
const phase=value=>{report.phase=value;save();};
const parentDisconnected=()=>{if(report.phase!=='completed'){report.phase='failed';report.failure='V3A_PARENT_DISCONNECTED';try{save();}finally{process.exit(1);}}};
process.once('disconnect',parentDisconnected);
let backend,fixture,compressedWitness,rawWitness,bb,helpers;
function publish(name,value){const bytes=typeof value==='string'||value instanceof Uint8Array?value:json(value);writeNew(join(attempt,name),bytes);
 const data=typeof bytes==='string'?Buffer.from(bytes):bytes;report.publicArtifacts.push({name,bytes:data.length,sha256:hash(data)});save();}
async function initialize(pages){bb=await loadPinned('@aztec/bb.js');backend=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:pages}});
 report.backend={version:'5.2.0',type:'Wasm',threads:1,maximumPages:pages,skipSrsInit:true};save();}
async function fullCRS(){assert.deepEqual(helpers.verifyCRS(),pins.crs);await backend.srsInitSrs({pointsBuf:regular(helpers.CRS+'bn254_g1_compressed.dat'),numPoints:LIMITS.provingCRSPoints,g2Point:regular(helpers.CRS+'bn254_g2.dat')});}
function immutableNames(ast){const names={};function visit(v){if(!v||typeof v!=='object')return;if(v.nodeType==='VariableDeclaration'&&v.mutability==='immutable')names[v.id]=v.name;for(const child of Object.values(v)){if(Array.isArray(child))child.forEach(visit);else visit(child);}}visit(ast);return names;}
try{
 save();assert.deepEqual(await fingerprint(),pins,'V3A_INITIAL_PINS_CHANGED');
 const {program,checkpoint}=acceptedProgram();helpers=await import(resourceModuleURL);
 const circuit=key=>({name:'native_claim_ingress_v3',bytecode:gunzipSync(Buffer.from(program.bytecode,'base64')),verificationKey:key??new Uint8Array()});
 if(mode==='stats'){
  assert.deepEqual(request.lineage,{});phase('computing-aggregate-gates');await initialize(32768);
  const actual=await backend.circuitStats({circuit:circuit(),includeGatesPerOpcode:false,settings:SETTINGS});
  report.stats={numGates:actual.numGates,numGatesDyadic:actual.numGatesDyadic,numAcirOpcodes:actual.numAcirOpcodes};
  publish('actual-aggregate-stats.json',report.stats);assertStats(report.stats);report.maximumPagesForKey=memoryFor(report.stats,'prepare-key');
 }else if(mode==='key'){
  assert.deepEqual(Object.keys(request.lineage),['stats']);const prior=loadPhase(request.lineage.stats,'stats');report.stats=prior.result.stats;
  phase('initializing-full-crs');await initialize(memoryFor(report.stats,'prepare-key'));await fullCRS();phase('generating-new-vk');
  const generated=await backend.circuitComputeVk({circuit:circuit(),settings:SETTINGS});const key=Buffer.from(generated.bytes);
  assertKeyBytes(CATALOG.native_claim_ingress,key,assertStats(report.stats));assert.equal(generated.hash.length,32);
  const keyHashField=canonicalKeyHash(BigInt('0x'+Buffer.from(generated.hash).toString('hex')).toString());
  assert.notEqual(hash(key),checkpoint.baselineVerificationKeysPreserved.find(k=>k.relation==='native_claim_ingress').keySHA256,'V3A_NEW_KEY_MUST_DIFFER');
  publish('key.vk',key);report.keyGenerated=true;report.keySHA256=hash(key);report.keyHashField=keyHashField;
  phase('generating-key-bound-solidity');const solidity=(await backend.circuitWriteSolidityVerifier({verificationKey:key,settings:SETTINGS})).solidityCode;
  assert.equal(typeof solidity,'string');assert.ok(solidity.includes('contract HonkVerifier'));
  assert.match(solidity,/NUMBER_OF_PUBLIC_INPUTS\s*=\s*59;/);publish('verifier.sol',solidity);
  report.soliditySHA256=hash(solidity);
  publish('key-manifest.json',{format:'LIANUM_GENERIC_INGRESS_V3_PUBLIC_KEY_V1',relation:report.relation,profile:report.profile,runId,
    compiled:pins.compiled,sourceClosureSHA256:report.sourceClosureSHA256,acceptedCheckpointSHA256:pins.acceptedCheckpointSHA256,
    crs:pins.crs,settings:SETTINGS,stats:report.stats,publicWords:51,actualKeyPublicCount:59,keyBytes:key.length,
    keySHA256:report.keySHA256,keyHashField,soliditySHA256:report.soliditySHA256,activated:false});
 }else if(mode==='proof'){
  assert.deepEqual(Object.keys(request.lineage),['stats','key']);report.stats=loadPhase(request.lineage.stats,'stats').result.stats;
  const keyPhase=loadPhase(request.lineage.key,'key'),key=regular(join(keyPhase.dir,'key.vk'));
  assert.equal(hash(key),keyPhase.result.keySHA256);assertKeyBytes(CATALOG.native_claim_ingress,key,assertStats(report.stats));
  report.keySHA256=hash(key);report.keyRunId=request.lineage.key;
  phase('initializing-full-crs');await initialize(memoryFor(report.stats,'prove'));await fullCRS();
  const {Noir}=await loadPinned('@noir-lang/noir_js');
  const hashFields=async fields=>{const inputs=fields.map(value=>{assert.ok(typeof value==='bigint'&&value>=0n&&value<FIELD_MODULUS);return Buffer.from(value.toString(16).padStart(64,'0'),'hex');});return Buffer.from((await backend.poseidon2Hash({inputs})).hash).toString('hex');};
  phase('preparing-one-synthetic-sol-v2-ingress');fixture=await buildSyntheticGenericIngressV3Fixture({hashFields,abis:{native_claim_ingress_v3:program.abi,native_claim_discharge:verifyPinnedCO42().program.abi}});
  let entry=fixture.cases.find(c=>c.name==='ci51-v3-sol-v2-signed-ingress');assert.equal(entry?.expected,true);
  assert.equal(entry.inputs.evidence.effect.family,'2');assert.equal(entry.inputs.evidence.wire.wire_binding_version,'2');assert.equal(entry.inputs.evidence.effect.effect_index,'1');
  let job=validateJobAgainstABI(program.abi,entry.inputs,entry.publicInputs,'native_claim_ingress');
  const expected=[...entry.publicInputs];report.fixture={case:entry.name,syntheticNativeObservations:true,syntheticDeploymentIdentities:true,syntheticClaimDomainNotRegistered:true,officialPoseidon2:true};
  phase('executing-one-witness');({witness:compressedWitness}=await new Noir(program).execute(job.inputs));
  fixture.destroy();fixture=undefined;entry=undefined;job.inputs=undefined;job=undefined;
  phase('proving');rawWitness=gunzipSync(compressedWitness);
  const generated=await backend.circuitProve({circuit:circuit(key),witness:rawWitness,settings:SETTINGS});
  rawWitness.fill(0);rawWitness=undefined;compressedWitness.fill(0);compressedWitness=undefined;
  const proof=Buffer.concat(generated.proof.map(field=>Buffer.from(field)));
  assert.ok(proof.length>0&&proof.length%32===0&&proof.length<=LIMITS.outputBytes);
  const rawInputs=generated.publicInputs.map(field=>'0x'+Buffer.from(field).toString('hex'));
  const inputs=publicWords(CATALOG.native_claim_ingress,rawInputs);assert.deepEqual(inputs,expected,'V3A_PROVED_PUBLIC_INPUTS');
  publish('proof.bin',proof);publish('public-inputs.json',inputs);report.proofGenerated=true;report.proofSHA256=hash(proof);report.proofBytes=proof.length;
  phase('verifying-genuine-proof');const verifier=new bb.UltraHonkVerifierBackend(backend);
  const verified=await verifier.verifyProof({proof,publicInputs:verifierWords(CATALOG.native_claim_ingress,inputs),verificationKey:key},{verifierTarget:'evm'});
  assert.equal(verified,true,'V3A_GENUINE_PROOF_VERIFY');report.selfVerified=true;
  const changed=[...inputs];changed[48]=(BigInt(changed[48])+1n).toString();
  phase('rejecting-tampered-public-amount');
  const tamperedAccepted=await verifier.verifyProof({proof,publicInputs:verifierWords(CATALOG.native_claim_ingress,changed),verificationKey:key},{verifierTarget:'evm'});
  assert.equal(tamperedAccepted,false,'V3A_TAMPER_MUST_BE_BACKEND_FALSE');
  report.tamper={publicIndex:48,field:'amount_q',original:inputs[48],changed:changed[48],rejectedByBackend:true};
  publish('proof-manifest.json',{format:'LIANUM_GENERIC_INGRESS_V3_PUBLIC_PROOF_V1',relation:report.relation,profile:report.profile,runId,
    compiled:pins.compiled,sourceClosureSHA256:report.sourceClosureSHA256,keyRunId:request.lineage.key,keySHA256:report.keySHA256,
    settings:SETTINGS,publicWords:51,proofSHA256:report.proofSHA256,proofBytes:proof.length,publicInputsSHA256:hash(json(inputs)),
    selfVerified:true,publicInputTamperRejected:true,fixture:report.fixture,activated:false});
 }else{
  assert.deepEqual(Object.keys(request.lineage),['stats','key','proof']);
  const keyPhase=loadPhase(request.lineage.key,'key'),proofPhase=loadPhase(request.lineage.proof,'proof');
  assert.equal(proofPhase.result.selfVerified,true);assert.equal(proofPhase.result.tamper.rejectedByBackend,true);
  const solidity=regular(join(keyPhase.dir,'verifier.sol')).toString('utf8');assert.equal(hash(solidity),keyPhase.result.soliditySHA256);
  phase('compiling-generated-solidity');const filename='native_claim_ingress_v3.sol';
  const compiled=compileSoliditySources({[filename]:{content:solidity,sha256:hash(solidity)}},{profile:'verifier'});
  delete compiled.milliseconds;
  const contracts=compiled.contracts[filename],artifact=contracts.HonkVerifier;assert.ok(artifact);
  const methods=artifact.abi.filter(item=>item.type==='function');assert.equal(methods.length,1);assert.equal(methods[0].name,'verify');
  assert.equal(methods[0].stateMutability,'view');assert.deepEqual(methods[0].inputs.map(i=>i.type),['bytes','bytes32[]']);assert.deepEqual(methods[0].outputs.map(i=>i.type),['bool']);
  const values=deriveGenericVerifierImmutables(compiled.sourceASTs[filename],51);assert.equal(BigInt(values.$VK_HASH),BigInt(keyPhase.result.keyHashField));
  const artifacts=Object.entries(contracts).map(([name,item])=>({name,runtimeBytes:item.evm.deployedBytecode.object.length/2,creationBytes:item.evm.bytecode.object.length/2,runtimeHexTemplateSHA256:hash(item.evm.deployedBytecode.object),links:item.evm.bytecode.linkReferences}));
  assert.ok(artifacts.every(a=>a.runtimeBytes<=24576&&a.creationBytes<=49152),'V3A_EVM_SIZE_LIMIT');
  publish('compiled-solidity.json',compiled);
  report.solidity={sourceSHA256:hash(solidity),keySHA256:keyPhase.result.keySHA256,keyHashField:keyPhase.result.keyHashField,
    compiler:compiled.compiler,settings:compiled.settings,immutableNames:immutableNames(compiled.sourceASTs[filename]),immutableValues:values,artifacts};
  report.actualSolidityCompile=true;report.noDeployment=true;
 }
 assert.deepEqual(await fingerprint(),pins,'V3A_FINAL_PINS_CHANGED');report.baselinePreserved=true;phase('completed');
}catch(error){report.phase='failed';report.failure=String(error.message).match(/\b(?:V3A|V3|PW|PC\d+|GENERIC|SOLIDITY|PROOF_JOB)_[A-Z0-9_]+\b/)?.[0]??'V3A_OPERATION_FAILED';report.errorName=String(error.name);
 if(error.compilerErrors)report.compilerErrors=error.compilerErrors.map(e=>({type:e.type,severity:e.severity,code:e.errorCode,message:e.formattedMessage}));process.exitCode=1;
}finally{
 rawWitness?.fill(0);compressedWitness?.fill(0);fixture?.destroy?.();fixture=undefined;
 if(backend){try{await backend.destroy();report.backendDestroyed=true;}catch{report.phase='failed';report.cleanupFailure='V3A_BACKEND_DESTROY_FAILED';process.exitCode=1;}}
 save();process.removeListener('disconnect',parentDisconnected);if(process.connected)process.disconnect();
}
