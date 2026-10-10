/** Isolated V2 compilation/key pipeline. No proof, deployment or economic
 * acceptance follows from compilation. Existing artifacts are never replaced.
 * The fixed original toolchain/CRS/resource guards still bound this profile. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync,lstatSync,realpathSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,relative,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
export const PAEG64_PROFILE_V2='LIANUM_PAEG_FUNDED_64_V2';
export const PAEG64_WORDS_V2=Object.freeze({reserve:75,fulfill:1066,ready:58,admission:83,withdraw:39});
export const PAEG64_SETTINGS_V2=Object.freeze({ipaAccumulation:false,oracleHashType:'keccak',disableZk:false,optimizedSolidityVerifier:false});
export const PAEG64_ROOT_V2=fileURLToPath(new URL('.',import.meta.url));
const project=resolve(PAEG64_ROOT_V2,'../../../..');
const original=join(project,'.internal/runtime/omnichain-product');
const sha=v=>createHash('sha256').update(v).digest('hex');
const regular=p=>{assert.equal(realpathSync(p),resolve(p),'PAEG64_FILE_SYMLINK');assert.ok(lstatSync(p).isFile(),'PAEG64_REGULAR_FILE');return readFileSync(p);};
function files(dir,out=[]){for(const e of readdirSync(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink(),'PAEG64_SOURCE_SYMLINK');if(e.name==='.local')continue;const p=join(dir,e.name);if(e.isDirectory())files(p,out);else if(/\.(nr|toml|mjs|sol)$/.test(e.name))out.push(p);}return out;}
function sourceClosure(seeds){
 const seen=new Set();function visit(p){p=resolve(p);assert.ok(p.startsWith(project+'/'),'PAEG64_SOURCE_OUTSIDE_PROJECT');if(seen.has(p))return;assert.ok(seen.size<1024,'PAEG64_SOURCE_CLOSURE_BOUND');const text=regular(p).toString('utf8');seen.add(p);const re=/\b(?:from|import)\s*(?:\(\s*)?["'](\.[^"']+)["']/g;const sol=/\bimport\s+(?:[^;]*?\sfrom\s+)?["'](\.[^"']+)["']/g;for(const pattern of [re,sol])for(const m of text.matchAll(pattern)){const next=resolve(dirname(p),m[1]);if(/\.(mjs|ts|sol)$/.test(next))visit(next);}}seeds.forEach(visit);return [...seen];
}
export function fundedGraph64SourcePinsV2(){
 const paths=sourceClosure([...files(PAEG64_ROOT_V2),...files(join(project,'experiments/engine/private-core-proof/generic-graph/lib')),
  ...files(join(project,'experiments/engine/private-core-proof/generic-funding/lib')),...files(join(project,'experiments/engine/private-core-proof/generic-native/lib')),
  join(project,'packages/engine/src/execution/graph/funded-graph-64-v2.mjs'),join(project,'packages/proofs/src/tooling/solidity-compiler.mjs'),
  join(project,'contracts/wallet/PrivateFundedGraph64PoolV2.sol'),join(project,'contracts/wallet/PrivateFundedGraph64ReceiptHubV2.sol'),
  join(project,'.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/solidity-compiler.mjs'),join(original,'experiments/private-core-proof/wallet-notes/resources.mjs')]);
 return paths.sort().map(p=>{const b=regular(p);return{path:relative(project,p),bytes:b.length,sha256:sha(b)};});
}
function fixedSupervisor(stage,m){
 const parent=readFileSync('/proc/'+process.ppid+'/cmdline','utf8').split('\0').filter(Boolean);
 assert.equal(realpathSync('/proc/'+process.ppid+'/exe'),realpathSync(process.execPath),'PAEG64_OWNED_NODE_PARENT');assert.equal(resolve(parent[1]??''),join(PAEG64_ROOT_V2,'run-bounded.mjs'),'PAEG64_FIXED_SUPERVISOR');assert.deepEqual(parent.slice(2),[stage,m],'PAEG64_STAGE_BINDING');
}
function solidityMap(names){const map={};function visit(name){assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'),'PAEG64_SOLIDITY_NAME');if(Object.hasOwn(map,name))return;const content=regular(join(project,name)).toString('utf8');map[name]={content,sha256:sha(content)};for(const m of content.matchAll(/\bimport\s+(?:[^;]*?\sfrom\s+)?["'](\.[^"']+)["']/g)){const next=relative(project,resolve(project,dirname(name),m[1]));visit(next);}}names.forEach(visit);return map;}
async function compileConsumer(manifestSHA256,sourcePins){
 const manifest=loadFundedGraph64ArtifactsV2(manifestSHA256);const out=join(PAEG64_ROOT_V2,'.local/consumer.json');assert.equal(existsSync(out),false,'PAEG64_EXISTING_CONSUMER_RETAINED');
 const {compileSoliditySources}=await import(pathToFileURL(join(project,'.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/solidity-compiler.mjs')));
 const names=['contracts/wallet/PrivateFundedGraph64PoolV2.sol','contracts/wallet/PrivateFundedGraph64ReceiptHubV2.sol'];const consumer=compileSoliditySources(solidityMap(names),{profile:'ledger-size'});
 const verifiers=compileSoliditySources(Object.fromEntries(Object.keys(PAEG64_WORDS_V2).map(m=>{const content=regular(join(PAEG64_ROOT_V2,'.local/prepared',m+'.sol')).toString('utf8');return ['verifiers/'+m+'.sol',{content,sha256:sha(content)}];})),{profile:'verifier'});
 const requireRuntime=(artifact)=>{const runtime=artifact.evm.deployedBytecode.object;assert.ok(runtime.length>0&&runtime.length/2<=24576,'PAEG64_EIP170_LIMIT');return artifact;};
 for(const [name,contract] of [[names[0],'PrivateFundedGraph64PoolV2'],[names[1],'PrivateFundedGraph64ReceiptHubV2']])requireRuntime(consumer.contracts[name][contract]);
 for(const name of Object.keys(verifiers.contracts)){const actual=Object.values(verifiers.contracts[name]).filter(a=>a.evm.deployedBytecode.object.length>0);assert.ok(actual.length>0,'PAEG64_COMPILED_VERIFIER_REQUIRED');actual.forEach(requireRuntime);}
 assert.deepEqual(fundedGraph64SourcePinsV2(),sourcePins,'PAEG64_SOURCE_CHANGED_DURING_CONSUMER');assert.deepEqual(loadFundedGraph64ArtifactsV2(manifestSHA256),manifest,'PAEG64_MANIFEST_CHANGED');
 newFile(out,JSON.stringify({profile:PAEG64_PROFILE_V2,classification:'COMPILED_CONSUMER_NOT_DEPLOYMENT_OR_ACCEPTANCE',manifestSHA256,sources:sourcePins,consumer,verifiers})+'\n');return{stage:'consumer-compiled',proofGenerated:false,deployed:false};
}
export function fundedGraph64SourceCommitmentV2(){return sha(JSON.stringify(fundedGraph64SourcePinsV2()));}
function mode(m){assert.ok(Object.hasOwn(PAEG64_WORDS_V2,m),'PAEG64_FIXED_MODE');return m;}
function newFile(path,bytes){mkdirSync(resolve(path,'..'),{recursive:true,mode:0o700});writeFileSync(path,bytes,{flag:'wx',mode:0o600});}
function publicWords(type){if(type.kind==='array')return type.length*publicWords(type.type);if(type.kind==='struct')return type.fields.reduce((n,f)=>n+publicWords(f.type),0);return 1;}
export function loadFundedGraph64ArtifactsV2(expectedManifestSHA256){
 assert.match(expectedManifestSHA256,/^[0-9a-f]{64}$/,'PAEG64_REVIEWED_MANIFEST_REQUIRED');
 const bytes=regular(join(PAEG64_ROOT_V2,'.local/manifest.json'));assert.equal(sha(bytes),expectedManifestSHA256,'PAEG64_MANIFEST_PIN');const manifest=JSON.parse(bytes);
 assert.equal(manifest.profile,PAEG64_PROFILE_V2);assert.equal(manifest.phase,'completed');assert.deepEqual(manifest.settings,PAEG64_SETTINGS_V2);assert.deepEqual(manifest.sources,fundedGraph64SourcePinsV2(),'PAEG64_SOURCE_CHANGED');
 for(const m of Object.keys(PAEG64_WORDS_V2)){const r=manifest.roles[m];assert.equal(r.words,PAEG64_WORDS_V2[m]);assert.equal(r.target,'evm');assert.ok(r.dyadic>0&&r.dyadic<=2097152,'PAEG64_EXISTING_CRS_TOO_SMALL');for(const [ext,key] of [['json','programSHA256'],['vk','keySHA256'],['sol','soliditySHA256']])assert.equal(sha(regular(join(PAEG64_ROOT_V2,'.local/prepared',m+'.'+ext))),r[key],'PAEG64_ARTIFACT_PIN');}
 return Object.freeze(manifest);
}
export async function prepareFundedGraph64ArtifactV2(stage,m){
 fixedSupervisor(stage,m);assert.ok(['compile','prepare-key','compile-consumer'].includes(stage),'PAEG64_FIXED_STAGE');if(stage==='compile-consumer')assert.match(m,/^[0-9a-f]{64}$/,'PAEG64_MANIFEST_PIN');else mode(m);
 const sourcePins=fundedGraph64SourcePinsV2();const approved=JSON.parse(regular(join(PAEG64_ROOT_V2,'reviewed-sources.json')));
 assert.deepEqual(approved,{profile:PAEG64_PROFILE_V2,sources:sourcePins},'PAEG64_REVIEWED_SOURCE_CHANGED');
 if(stage==='compile-consumer')return compileConsumer(m,sourcePins);
 const rootRequire=createRequire(join(original,'experiments/private-core-proof/package.json'));
 const resources=await import(pathToFileURL(join(original,'experiments/private-core-proof/wallet-notes/resources.mjs')));
 resources.verifyToolchain();resources.verifyCRS();resources.guard();
 const toolkit=await import(pathToFileURL(rootRequire.resolve('@aztec/bb.js')));const compiled=join(PAEG64_ROOT_V2,'.local/compiled',m+'.json');
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('PAEG64_OFFLINE_REQUIRED');};let api;
 try {
  const dir=join(PAEG64_ROOT_V2,'.local/prepared');assert.equal(existsSync(join(dir,m+'.key.json')),false,'PAEG64_EXISTING_KEY_RETAINED');
  if(stage==='compile'){
   assert.equal(existsSync(compiled),false,'PAEG64_EXISTING_COMPILE_RETAINED');
   const compiler=await import(pathToFileURL(rootRequire.resolve('@noir-lang/noir_wasm')));
   const {program}=await compiler.compile(compiler.createFileManager(join(PAEG64_ROOT_V2,'circuits',m)),undefined,()=>{});
   assert.equal(program.abi.parameters.filter(p=>p.visibility==='public').reduce((n,p)=>n+publicWords(p.type),0),PAEG64_WORDS_V2[m],'PAEG64_ABI_WORDS');
   assert.match(program.noir_version,/^1\.0\.0-beta\.25\b/,'PAEG64_NOIR_VERSION');
   newFile(compiled,JSON.stringify(program));newFile(compiled+'.manifest.json',JSON.stringify({profile:PAEG64_PROFILE_V2,mode:m,programSHA256:sha(regular(compiled)),sourceCommitment:sha(JSON.stringify(sourcePins)),sources:sourcePins})+'\n');
   return{stage:'compiled',mode:m,words:PAEG64_WORDS_V2[m],proofGenerated:false};
  }
  const r=JSON.parse(regular(compiled+'.manifest.json'));assert.deepEqual(r.sources,sourcePins);assert.equal(r.programSHA256,sha(regular(compiled)),'PAEG64_PROGRAM_CHANGED');const program=JSON.parse(regular(compiled));
  api=await toolkit.Barretenberg.new({backend:toolkit.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:65536}});
  const circuit={name:m,bytecode:gunzipSync(Buffer.from(program.bytecode,'base64')),verificationKey:new Uint8Array()};
  const stats=await api.circuitStats({circuit,includeGatesPerOpcode:false,settings:PAEG64_SETTINGS_V2});
  assert.ok(Number.isSafeInteger(stats.numGatesDyadic)&&stats.numGatesDyadic>0&&stats.numGatesDyadic<=2097152,'PAEG64_EXISTING_CRS_TOO_SMALL');
  resources.guard();await api.srsInitSrs({pointsBuf:regular(resources.CRS+'bn254_g1_compressed.dat'),numPoints:2097152,g2Point:regular(resources.CRS+'bn254_g2.dat')});
  const key=await api.circuitComputeVk({circuit,settings:PAEG64_SETTINGS_V2});const vk=Buffer.from(key.bytes);
  const sol=(await api.circuitWriteSolidityVerifier({verificationKey:vk,settings:PAEG64_SETTINGS_V2})).solidityCode;
  assert.match(sol,new RegExp('NUMBER_OF_PUBLIC_INPUTS = '+(PAEG64_WORDS_V2[m]+8)+';'),'PAEG64_VERIFIER_PUBLIC_COUNT');
  assert.deepEqual(fundedGraph64SourcePinsV2(),sourcePins,'PAEG64_SOURCE_CHANGED_DURING_KEY');resources.verifyToolchain();resources.verifyCRS();
  const pin={target:'evm',words:PAEG64_WORDS_V2[m],dyadic:stats.numGatesDyadic,programSHA256:sha(regular(compiled)),keySHA256:sha(vk),soliditySHA256:sha(sol)};
  newFile(join(dir,m+'.json'),regular(compiled));newFile(join(dir,m+'.vk'),vk);newFile(join(dir,m+'.sol'),sol);newFile(join(dir,m+'.key.json'),JSON.stringify(pin)+'\n');
  if(Object.keys(PAEG64_WORDS_V2).every(k=>existsSync(join(dir,k+'.key.json'))))newFile(join(PAEG64_ROOT_V2,'.local/manifest.json'),JSON.stringify({profile:PAEG64_PROFILE_V2,phase:'completed',settings:PAEG64_SETTINGS_V2,sources:sourcePins,roles:Object.fromEntries(Object.keys(PAEG64_WORDS_V2).map(k=>[k,JSON.parse(regular(join(dir,k+'.key.json')))]))})+'\n');
  return{stage:'key-prepared',mode:m,words:pin.words,dyadic:pin.dyadic,proofGenerated:false};
 }finally{if(api)await api.destroy();globalThis.fetch=oldFetch;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'PAEG64_FIXED_ARGUMENTS');const parent=readFileSync('/proc/'+process.ppid+'/cmdline','utf8').split('\0').filter(Boolean);
 assert.equal(realpathSync('/proc/'+process.ppid+'/exe'),realpathSync(process.execPath),'PAEG64_OWNED_NODE_PARENT');assert.equal(resolve(parent[1]??''),join(PAEG64_ROOT_V2,'run-bounded.mjs'),'PAEG64_FIXED_SUPERVISOR');assert.deepEqual(parent.slice(2),process.argv.slice(2),'PAEG64_STAGE_BINDING');
 try{console.log(JSON.stringify(await prepareFundedGraph64ArtifactV2(process.argv[2],process.argv[3])));}catch(error){console.log(JSON.stringify({stage:'failed',code:/^PAEG64_[A-Z0-9_]+/.exec(error.message??'')?.[0]??'PAEG64_COMPILER_OR_KEY_FAILED'}));process.exitCode=1;}
}
