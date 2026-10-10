/** Isolated V3 compilation/key pipeline. No proof, deployment or economic
 * acceptance follows from compilation. Existing artifacts are never replaced.
 * The fixed original toolchain/CRS/resource guards still bound this profile. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync,lstatSync,realpathSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,relative,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
export const PAEG_PAGED_PROFILE_V3='LIANUM_PAEG_FUNDED_PAGED_V3';
export const PAEG_PAGED_WORDS_V3=Object.freeze({reserve:119,fold:66,terminal:46,admission:85,withdraw:39});
export const PAEG_PAGED_SETTINGS_V3=Object.freeze({ipaAccumulation:false,oracleHashType:'keccak',disableZk:false,optimizedSolidityVerifier:false});
export const PAEG_PAGED_ROOT_V3=fileURLToPath(new URL('.',import.meta.url));
const project=resolve(PAEG_PAGED_ROOT_V3,'../../../..');
const original=join(project,'.internal/runtime/omnichain-product');
const sha=v=>createHash('sha256').update(v).digest('hex');
const regular=p=>{assert.equal(realpathSync(p),resolve(p),'PAEG_PAGED_FILE_SYMLINK');assert.ok(lstatSync(p).isFile(),'PAEG_PAGED_REGULAR_FILE');return readFileSync(p);};
function files(dir,out=[]){for(const e of readdirSync(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink(),'PAEG_PAGED_SOURCE_SYMLINK');if(e.name==='.local')continue;const p=join(dir,e.name);if(e.isDirectory())files(p,out);else if(/\.(nr|toml|mjs|sol)$/.test(e.name))out.push(p);}return out;}
function sourceClosure(seeds){
 const seen=new Set();function visit(p){p=resolve(p);assert.ok(p.startsWith(project+'/'),'PAEG_PAGED_SOURCE_OUTSIDE_PROJECT');if(seen.has(p))return;assert.ok(seen.size<1024,'PAEG_PAGED_SOURCE_CLOSURE_BOUND');const text=regular(p).toString('utf8');seen.add(p);const re=/\b(?:from|import)\s*(?:\(\s*)?["'](\.[^"']+)["']/g;const sol=/\bimport\s+(?:[^;]*?\sfrom\s+)?["'](\.[^"']+)["']/g;for(const pattern of [re,sol])for(const m of text.matchAll(pattern)){const next=resolve(dirname(p),m[1]);if(/\.(mjs|ts|sol)$/.test(next))visit(next);}}seeds.forEach(visit);return [...seen];
}
export function fundedPagedGraphSourcePinsV3(){
 const paths=sourceClosure([...files(PAEG_PAGED_ROOT_V3),join(PAEG_PAGED_ROOT_V3,'transcript.json'),...files(join(project,'experiments/engine/private-core-proof/generic-graph/lib')),
  ...files(join(project,'experiments/engine/private-core-proof/generic-funding/lib')),...files(join(project,'experiments/engine/private-core-proof/generic-native/lib')),
  join(project,'packages/engine/src/execution/graph/funded-graph-paged-v3.mjs'),join(project,'packages/proofs/src/tooling/solidity-compiler.mjs'),
  ...files(join(project,'experiments/engine/private-core-proof/funded-graph-64-v2/lib')),
  join(project,'contracts/wallet/PrivatePagedFundedGraphPoolV3.sol'),join(project,'contracts/wallet/PrivatePagedFundedGraphStateV3.sol'),join(project,'contracts/wallet/PrivatePagedFundedGraphNativeStateV3.sol'),
  join(project,'.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/solidity-compiler.mjs'),join(original,'experiments/private-core-proof/wallet-notes/resources.mjs')]);
 return paths.sort().map(p=>{const b=regular(p);return{path:relative(project,p),bytes:b.length,sha256:sha(b)};});
}
function fixedSupervisor(stage,m){
 const parent=readFileSync('/proc/'+process.ppid+'/cmdline','utf8').split('\0').filter(Boolean);
 assert.equal(realpathSync('/proc/'+process.ppid+'/exe'),realpathSync(process.execPath),'PAEG_PAGED_OWNED_NODE_PARENT');assert.equal(resolve(parent[1]??''),join(PAEG_PAGED_ROOT_V3,'run-bounded.mjs'),'PAEG_PAGED_FIXED_SUPERVISOR');assert.deepEqual(parent.slice(2),[stage,m],'PAEG_PAGED_STAGE_BINDING');
}
function solidityMap(names){const map={};function visit(name){assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'),'PAEG_PAGED_SOLIDITY_NAME');if(Object.hasOwn(map,name))return;const content=regular(join(project,name)).toString('utf8');map[name]={content,sha256:sha(content)};for(const m of content.matchAll(/\bimport\s+(?:[^;]*?\sfrom\s+)?["'](\.[^"']+)["']/g)){const next=relative(project,resolve(project,dirname(name),m[1]));visit(next);}}names.forEach(visit);return map;}
async function compileConsumer(manifestSHA256,sourcePins){
 const manifest=loadFundedPagedGraphArtifactsV3(manifestSHA256);const out=join(PAEG_PAGED_ROOT_V3,'.local/consumer.json');assert.equal(existsSync(out),false,'PAEG_PAGED_EXISTING_CONSUMER_RETAINED');
 const {compileSoliditySources}=await import(pathToFileURL(join(project,'.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/solidity-compiler.mjs')));
 const names=['contracts/wallet/PrivatePagedFundedGraphPoolV3.sol','contracts/wallet/PrivatePagedFundedGraphStateV3.sol','contracts/wallet/PrivatePagedFundedGraphNativeStateV3.sol'];const consumer=compileSoliditySources(solidityMap(names),{profile:'ledger-size'});
 const verifiers=compileSoliditySources(Object.fromEntries(Object.keys(PAEG_PAGED_WORDS_V3).map(m=>{const content=regular(join(PAEG_PAGED_ROOT_V3,'.local/prepared',m+'.sol')).toString('utf8');return ['verifiers/'+m+'.sol',{content,sha256:sha(content)}];})),{profile:'verifier'});
 const requireRuntime=(artifact)=>{const runtime=artifact.evm.deployedBytecode.object;assert.ok(runtime.length>0&&runtime.length/2<=24576,'PAEG_PAGED_EIP170_LIMIT');return artifact;};
 for(const [name,contract] of [[names[0],'PrivatePagedFundedGraphPoolV3'],[names[1],'PrivatePagedFundedGraphStateV3'],[names[2],'PrivatePagedFundedGraphNativeStateV3']])requireRuntime(consumer.contracts[name][contract]);
 for(const name of Object.keys(verifiers.contracts)){const actual=Object.values(verifiers.contracts[name]).filter(a=>a.evm.deployedBytecode.object.length>0);assert.ok(actual.length>0,'PAEG_PAGED_COMPILED_VERIFIER_REQUIRED');actual.forEach(requireRuntime);}
 assert.deepEqual(fundedPagedGraphSourcePinsV3(),sourcePins,'PAEG_PAGED_SOURCE_CHANGED_DURING_CONSUMER');assert.deepEqual(loadFundedPagedGraphArtifactsV3(manifestSHA256),manifest,'PAEG_PAGED_MANIFEST_CHANGED');
 newFile(out,JSON.stringify({profile:PAEG_PAGED_PROFILE_V3,classification:'COMPILED_CONSUMER_NOT_DEPLOYMENT_OR_ACCEPTANCE',manifestSHA256,sources:sourcePins,consumer,verifiers})+'\n');return{stage:'consumer-compiled',proofGenerated:false,deployed:false};
}
export function fundedPagedGraphSourceCommitmentV3(){return sha(JSON.stringify(fundedPagedGraphSourcePinsV3()));}
function mode(m){assert.ok(Object.hasOwn(PAEG_PAGED_WORDS_V3,m),'PAEG_PAGED_FIXED_MODE');return m;}
function newFile(path,bytes){mkdirSync(resolve(path,'..'),{recursive:true,mode:0o700});writeFileSync(path,bytes,{flag:'wx',mode:0o600});}
function publicWords(type){if(type.kind==='array')return type.length*publicWords(type.type);if(type.kind==='struct')return type.fields.reduce((n,f)=>n+publicWords(f.type),0);return 1;}
// Compiler diagnostics contain source excerpts; retain them only in a bounded
// private file. Public summaries contain codes and file/line frames, never text.
const diagnosticByteLimit=32768;
let firstCompilerDiagnostic=null;
const compilerFrames=[];
const boundedText=(value,max)=>{if(typeof value!=='string')return null;return Buffer.from(value.slice(0,max),'utf8').subarray(0,max).toString('utf8');};
function diagnosticFrames(text){
 const frames=[];if(typeof text!=='string')return frames;
 const pattern=/((?:file:\/\/)?(?:\/[A-Za-z0-9._@%+-]+|[A-Za-z0-9._@%+-]+)(?:\/[A-Za-z0-9._@%+-]+)*\.(?:nr|mjs|cjs|js|toml)):(\d+)(?::(\d+))?/g;
 for(const match of boundedText(text,16384).matchAll(pattern)){
  let file=match[1];if(file.startsWith('file://')){try{file=fileURLToPath(file);}catch{continue;}}
  if(file.startsWith('/')){if(!file.startsWith(project+'/'))continue;file=relative(project,file);}
  if(file.length>240||file.split('/').includes('..'))continue;
  const line=Number(match[2]),column=match[3]===undefined?null:Number(match[3]);
  if(!Number.isSafeInteger(line)||line<1||line>10000000||(column!==null&&(!Number.isSafeInteger(column)||column<1||column>10000000)))continue;
  if(!frames.some(f=>f.file===file&&f.line===line&&f.column===column))frames.push({file,line,column});
  if(frames.length===6)break;
 }
 return frames;
}
function captureCompilerDiagnostic(message){
 if(firstCompilerDiagnostic===null)firstCompilerDiagnostic=boundedText(message,4096);
 for(const frame of diagnosticFrames(message)){if(!compilerFrames.some(f=>JSON.stringify(f)===JSON.stringify(frame))&&compilerFrames.length<6)compilerFrames.push(frame);}
}
export function retainFundedPagedGraphFailureV3(error,stage,m,childOutput=''){
 const errorTypes=new Set(['Error','AssertionError','TypeError','SyntaxError','RangeError','CompileError']);
 const type=e=>errorTypes.has(e?.name)?e.name:'Error';
 const cause=error?.cause;
 const code=/^PAEG_PAGED_[A-Z0-9_]{1,80}\b/.exec(error?.message??'')?.[0]??(type(cause)==='CompileError'?'PAEG_PAGED_NOIR_COMPILE_FAILED':'PAEG_PAGED_COMPILER_OR_KEY_FAILED');
 const frames=[...compilerFrames];
 for(const frame of [...diagnosticFrames(childOutput),...diagnosticFrames(error?.message),...diagnosticFrames(error?.stack)]){if(!frames.some(f=>JSON.stringify(f)===JSON.stringify(frame))&&frames.length<6)frames.push(frame);}
 const diagnosticFile='error-'+process.pid+'-'+randomBytes(8).toString('hex')+'.json';
 const record={profile:PAEG_PAGED_PROFILE_V3,stage,mode:m,code,errorType:type(error),causeType:cause?type(cause):null,frames,
  firstCompilerDiagnostic,message:boundedText(error?.message,4096),stack:boundedText(error?.stack,8192),causeMessage:boundedText(cause?.message,4096),childOutput:boundedText(childOutput,4096),truncated:false};
 let bytes=Buffer.from(JSON.stringify(record)+'\n');
 if(bytes.length>diagnosticByteLimit){record.truncated=true;for(const key of ['firstCompilerDiagnostic','message','stack','causeMessage','childOutput'])record[key]=boundedText(record[key],512);bytes=Buffer.from(JSON.stringify(record)+'\n');}
 assert.ok(bytes.length<=diagnosticByteLimit,'PAEG_PAGED_DIAGNOSTIC_BOUND');
 newFile(join(PAEG_PAGED_ROOT_V3,'.local',diagnosticFile),bytes);
 return Object.freeze({stage:'failed',code,errorType:record.errorType,frames,diagnosticFile,diagnosticSHA256:sha(bytes)});
}

export function loadFundedPagedGraphArtifactsV3(expectedManifestSHA256){
 assert.match(expectedManifestSHA256,/^[0-9a-f]{64}$/,'PAEG_PAGED_REVIEWED_MANIFEST_REQUIRED');
 const bytes=regular(join(PAEG_PAGED_ROOT_V3,'.local/manifest.json'));assert.equal(sha(bytes),expectedManifestSHA256,'PAEG_PAGED_MANIFEST_PIN');const manifest=JSON.parse(bytes);
 assert.equal(manifest.profile,PAEG_PAGED_PROFILE_V3);assert.equal(manifest.phase,'completed');assert.deepEqual(manifest.settings,PAEG_PAGED_SETTINGS_V3);assert.deepEqual(manifest.sources,fundedPagedGraphSourcePinsV3(),'PAEG_PAGED_SOURCE_CHANGED');
 for(const m of Object.keys(PAEG_PAGED_WORDS_V3)){const r=manifest.roles[m];assert.equal(r.words,PAEG_PAGED_WORDS_V3[m]);assert.equal(r.target,'evm');assert.ok(r.dyadic>0&&r.dyadic<=2097152,'PAEG_PAGED_EXISTING_CRS_TOO_SMALL');for(const [ext,key] of [['json','programSHA256'],['vk','keySHA256'],['sol','soliditySHA256']])assert.equal(sha(regular(join(PAEG_PAGED_ROOT_V3,'.local/prepared',m+'.'+ext))),r[key],'PAEG_PAGED_ARTIFACT_PIN');}
 return Object.freeze(manifest);
}
export async function prepareFundedPagedGraphArtifactV3(stage,m){
 fixedSupervisor(stage,m);assert.ok(['compile','prepare-key','compile-consumer'].includes(stage),'PAEG_PAGED_FIXED_STAGE');if(stage==='compile-consumer')assert.match(m,/^[0-9a-f]{64}$/,'PAEG_PAGED_MANIFEST_PIN');else mode(m);
 const sourcePins=fundedPagedGraphSourcePinsV3();const approved=JSON.parse(regular(join(PAEG_PAGED_ROOT_V3,'reviewed-sources.json')));
 assert.deepEqual(approved,{profile:PAEG_PAGED_PROFILE_V3,sources:sourcePins},'PAEG_PAGED_REVIEWED_SOURCE_CHANGED');
 if(stage==='compile-consumer')return compileConsumer(m,sourcePins);
 const rootRequire=createRequire(join(original,'experiments/private-core-proof/package.json'));
 const resources=await import(pathToFileURL(join(original,'experiments/private-core-proof/wallet-notes/resources.mjs')));
 resources.verifyToolchain();resources.verifyCRS();resources.guard();
 const toolkit=await import(pathToFileURL(rootRequire.resolve('@aztec/bb.js')));const compiled=join(PAEG_PAGED_ROOT_V3,'.local/compiled',m+'.json');
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('PAEG_PAGED_OFFLINE_REQUIRED');};let api;
 try {
  const dir=join(PAEG_PAGED_ROOT_V3,'.local/prepared');assert.equal(existsSync(join(dir,m+'.key.json')),false,'PAEG_PAGED_EXISTING_KEY_RETAINED');
  if(stage==='compile'){
   assert.equal(existsSync(compiled),false,'PAEG_PAGED_EXISTING_COMPILE_RETAINED');
   const compiler=await import(pathToFileURL(rootRequire.resolve('@noir-lang/noir_wasm')));
   firstCompilerDiagnostic=null;compilerFrames.length=0;
   const {program}=await compiler.compile(compiler.createFileManager(join(PAEG_PAGED_ROOT_V3,'circuits',m)),undefined,captureCompilerDiagnostic,()=>{});
   assert.equal(program.abi.parameters.filter(p=>p.visibility==='public').reduce((n,p)=>n+publicWords(p.type),0),PAEG_PAGED_WORDS_V3[m],'PAEG_PAGED_ABI_WORDS');
   assert.match(program.noir_version,/^1\.0\.0-beta\.25\b/,'PAEG_PAGED_NOIR_VERSION');
   newFile(compiled,JSON.stringify(program));newFile(compiled+'.manifest.json',JSON.stringify({profile:PAEG_PAGED_PROFILE_V3,mode:m,programSHA256:sha(regular(compiled)),sourceCommitment:sha(JSON.stringify(sourcePins)),sources:sourcePins})+'\n');
   return{stage:'compiled',mode:m,words:PAEG_PAGED_WORDS_V3[m],proofGenerated:false};
  }
  const r=JSON.parse(regular(compiled+'.manifest.json'));assert.deepEqual(r.sources,sourcePins);assert.equal(r.programSHA256,sha(regular(compiled)),'PAEG_PAGED_PROGRAM_CHANGED');const program=JSON.parse(regular(compiled));
  api=await toolkit.Barretenberg.new({backend:toolkit.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:65536}});
  const circuit={name:m,bytecode:gunzipSync(Buffer.from(program.bytecode,'base64')),verificationKey:new Uint8Array()};
  const stats=await api.circuitStats({circuit,includeGatesPerOpcode:false,settings:PAEG_PAGED_SETTINGS_V3});
  assert.ok(Number.isSafeInteger(stats.numGatesDyadic)&&stats.numGatesDyadic>0&&stats.numGatesDyadic<=2097152,'PAEG_PAGED_EXISTING_CRS_TOO_SMALL');
  resources.guard();await api.srsInitSrs({pointsBuf:regular(resources.CRS+'bn254_g1_compressed.dat'),numPoints:2097152,g2Point:regular(resources.CRS+'bn254_g2.dat')});
  const key=await api.circuitComputeVk({circuit,settings:PAEG_PAGED_SETTINGS_V3});const vk=Buffer.from(key.bytes);
  const sol=(await api.circuitWriteSolidityVerifier({verificationKey:vk,settings:PAEG_PAGED_SETTINGS_V3})).solidityCode;
  assert.match(sol,new RegExp('NUMBER_OF_PUBLIC_INPUTS = '+(PAEG_PAGED_WORDS_V3[m]+8)+';'),'PAEG_PAGED_VERIFIER_PUBLIC_COUNT');
  assert.deepEqual(fundedPagedGraphSourcePinsV3(),sourcePins,'PAEG_PAGED_SOURCE_CHANGED_DURING_KEY');resources.verifyToolchain();resources.verifyCRS();
  const pin={target:'evm',words:PAEG_PAGED_WORDS_V3[m],dyadic:stats.numGatesDyadic,programSHA256:sha(regular(compiled)),keySHA256:sha(vk),soliditySHA256:sha(sol)};
  newFile(join(dir,m+'.json'),regular(compiled));newFile(join(dir,m+'.vk'),vk);newFile(join(dir,m+'.sol'),sol);newFile(join(dir,m+'.key.json'),JSON.stringify(pin)+'\n');
  if(Object.keys(PAEG_PAGED_WORDS_V3).every(k=>existsSync(join(dir,k+'.key.json'))))newFile(join(PAEG_PAGED_ROOT_V3,'.local/manifest.json'),JSON.stringify({profile:PAEG_PAGED_PROFILE_V3,phase:'completed',settings:PAEG_PAGED_SETTINGS_V3,sources:sourcePins,roles:Object.fromEntries(Object.keys(PAEG_PAGED_WORDS_V3).map(k=>[k,JSON.parse(regular(join(dir,k+'.key.json')))]))})+'\n');
  return{stage:'key-prepared',mode:m,words:pin.words,dyadic:pin.dyadic,proofGenerated:false};
 }finally{if(api)await api.destroy();globalThis.fetch=oldFetch;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'PAEG_PAGED_FIXED_ARGUMENTS');const parent=readFileSync('/proc/'+process.ppid+'/cmdline','utf8').split('\0').filter(Boolean);
 assert.equal(realpathSync('/proc/'+process.ppid+'/exe'),realpathSync(process.execPath),'PAEG_PAGED_OWNED_NODE_PARENT');assert.equal(resolve(parent[1]??''),join(PAEG_PAGED_ROOT_V3,'run-bounded.mjs'),'PAEG_PAGED_FIXED_SUPERVISOR');assert.deepEqual(parent.slice(2),process.argv.slice(2),'PAEG_PAGED_STAGE_BINDING');
 try{console.log(JSON.stringify(await prepareFundedPagedGraphArtifactV3(process.argv[2],process.argv[3])));}catch(error){console.log(JSON.stringify(retainFundedPagedGraphFailureV3(error,process.argv[2],process.argv[3])));process.exitCode=1;}
}
