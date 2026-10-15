/** Fixed read-only adapter for authentic original W39 files. No regeneration,
 * caller pins, fabricated generation schema, chain access or authority grant. */
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ORIGINAL_W39_PINS} from './original-file-pins.mjs';
import {GENERIC_COMPILER_PIN} from './compiler-pin.mjs';
import {deriveGenericVerifierImmutables} from './verifier-ast.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const SHA=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=v=>SHA(canonical(v)),issued=new WeakSet();
const freeze=v=>{if(v&&typeof v==='object'&&!Buffer.isBuffer(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function read(key){const pin=ORIGINAL_W39_PINS[key],p=join(ROOT,pin.path);assert.equal(realpathSync(p),p,'W39_NO_SYMLINK');const stat=lstatSync(p);assert.ok(stat.isFile()&&stat.size===pin.bytes&&stat.size<128*1024*1024);const b=readFileSync(p);assert.equal(b.length,pin.bytes);assert.equal(SHA(b),pin.sha256,'W39_ORIGINAL_RAW_PIN');return b;}
function json(key){return JSON.parse(read(key));}
function one(rows,predicate,label){const selected=rows.filter(predicate);assert.equal(selected.length,1,label);return selected[0];}
const source='withdraw_output.sol';
const outputSelection={'*':{'':['ast'],'*':['abi','evm.bytecode.object','evm.bytecode.linkReferences','evm.deployedBytecode.object','evm.deployedBytecode.linkReferences','evm.deployedBytecode.immutableReferences','evm.methodIdentifiers']}};
const expectedSettings={optimizer:{enabled:true,runs:1},viaIR:false,evmVersion:'cancun',metadata:{bytecodeHash:'none'},outputSelection};
function filePin(name){const p=ORIGINAL_W39_PINS[name];let path;if(p.path.startsWith('omnichain-product/'))path='golden/'+p.path.slice('omnichain-product/'.length);else{assert.ok(p.path.startsWith('omnichain-flat-profile/flat-wallet/'));path=p.path.slice('omnichain-flat-profile/flat-wallet/'.length);}return {path,sha256:p.sha256};}
function contract(ast,name,kind){const c=one(ast.nodes,n=>n.nodeType==='ContractDefinition'&&n.name===name,'W39_NAMED_CONTRACT');assert.equal(c.contractKind,kind);return c;}
export function assertOriginalW39Artifacts(value){assert.ok(issued.has(value),'W39_ORIGINAL_ARTIFACTS_REQUIRED');}
export function loadOriginalW39Artifacts(){
 assert.equal(arguments.length,0,'W39_FIXED_NO_OPTIONS');
 // Keep originals raw and separately identified. Nothing below overwrites or
 // pretends that the records-array report is a new flat mode=withdraw_output job.
 const generation=json('generation'),inventory=json('inventory'),circuitCompilation=json('circuitCompilation'),packages=json('packages');
 const key=read('key'),sourceBytes=read('source'),programBytes=read('program'),program=JSON.parse(programBytes),noirSource=read('noirSource');
 assert.equal(generation.classification,'REAL_KEYS_AND_GENERATED_EVM_VERIFIERS_NO_FUNDED_ACCEPTANCE');assert.equal(generation.failure,undefined);assert.equal(generation.verifierTarget,'evm');assert.equal(generation.zeroKnowledgeEnabled,true);assert.equal(generation.backend,'Wasm');assert.equal(generation.threads,1);assert.equal(generation.wasmMaximumMiB,2048);assert.equal(generation.node,'v24.19.0');
 const row=one(generation.records,r=>r.mode==='withdraw','W39_ORIGINAL_GENERATION_RECORD');
 assert.equal(row.vkSHA256,SHA(key));assert.equal(row.vkBytes,key.length);assert.equal(row.soliditySHA256,SHA(sourceBytes));assert.equal(row.solidityBytes,sourceBytes.length);assert.equal(row.circuitSHA256,SHA(Buffer.from(program.bytecode,'base64')));
 for(const k of ['key','source','program','noirSource']){const pin=ORIGINAL_W39_PINS[k],original=one(inventory.files,r=>'omnichain-product/'+r.file===pin.path,'W39_ORIGINAL_INVENTORY_RECORD');assert.equal(original.bytes,pin.bytes);assert.equal(original.sha256,pin.sha256);}
 for(const [k,name]of [['originalProver','prover.mjs'],['originalPrepare','prepare.mjs'],['originalCompile','compile.mjs']]){const b=read(k),original=one(inventory.sourceRecords,r=>r.file==='experiments/private-core-proof/native-notes/'+name,'W39_ORIGINAL_GENERATOR_SOURCE');assert.equal(original.bytes,b.length);assert.equal(original.sha256,SHA(b));}
 const oldCompile=one(circuitCompilation.records,r=>r.name==='withdraw','W39_ORIGINAL_COMPILE_RECORD');assert.equal(oldCompile.sourceSHA256,SHA(noirSource));assert.equal(oldCompile.noirVersion,program.noir_version);assert.deepEqual(oldCompile.abi,program.abi);assert.equal(program.noir_version,'1.0.0-beta.25+75061fab15986eedee4e7d9104ff87dd9fa4ca10');
 assert.equal(SHA(JSON.stringify(program.abi)),'b68ae43f29bfb180086eab42bd102a0cda4ed14f25bd7fd430a40a629157201a','W39_EXACT_TYPED_ABI');assert.equal(program.abi.return_type,null);
 const u=width=>({kind:'integer',sign:'unsigned',width}),a=(length,width)=>({kind:'array',length,type:u(width)});
 assert.deepEqual(program.abi.parameters.filter(p=>p.visibility==='public'),[['scope',a(8,32)],['policy',a(8,32)],['epoch',u(64)],['root',a(8,32)],['spent',a(8,32)],['amount',u(64)],['recipient',a(5,32)]].map(([name,type])=>({name,type,visibility:'public'})));
 assert.ok(Object.values(program.file_map).some(f=>SHA(f.source)===SHA(noirSource)),'W39_PROGRAM_ORIGINAL_SOURCE_JOIN');
 assert.equal(packages.node,generation.node);const required={'@aztec/bb.js':'5.2.0','@noir-lang/noir_js':'1.0.0-beta.25','@noir-lang/noir_wasm':'1.0.0-beta.25'};
 for(const [name,version]of Object.entries(required)){const p=one(packages.packages,p=>p.name===name,'W39_OFFICIAL_PACKAGE');assert.equal(p.version,version);assert.equal(p.installed,true);assert.ok(p.resolved.startsWith('https://registry.npmjs.org/'));assert.match(p.integrity,/^sha512-/);}
 const toolchain={node:generation.node,noir:'1.0.0-beta.25',barretenberg:'5.2.0',auditSHA256:ORIGINAL_W39_PINS.packages.sha256};
 assert.equal(toolchain.auditSHA256,'81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6');
 const prover=read('originalProver').toString(),prepare=read('originalPrepare').toString(),backend=read('backendSource').toString();
 assert.ok(prover.includes("const settings={verifierTarget:'evm'}"));assert.ok(prover.includes('vk=await backend.getVerificationKey(settings),solidity=await backend.getSolidityVerifier(vk,settings)'), 'W39_SAME_BINARY_VK_PASSED_TO_SOLIDITY_GENERATOR');
 assert.ok(prepare.includes('zeroKnowledgeEnabled:true')&&prepare.includes('prover.prepare(mode)'));
 assert.match(backend,/case 'evm':\s*return \{ ipaAccumulation: false, oracleHashType: 'keccak', disableZk: false, optimizedSolidityVerifier: false \}/,'W39_OFFICIAL_EVM_ZK_SETTINGS');
 const compilation=json('compiled'),manifest=json('manifest'),report=json('report'),resources=json('resources');
 assert.equal(report.phase,'completed');assert.equal(resources.phase,'completed');assert.equal(resources.exitCode,0);assert.deepEqual(resources.failures,[]);assert.equal(report.runId,'0db5cb64-67cf-47fb-9608-4036813c4bc6');assert.equal(resources.runId,report.runId);assert.equal(report.keyGenerated,false);assert.equal(report.proofGenerated,false);assert.equal(report.nativeNodesStarted,false);assert.deepEqual(one(report.contracts,r=>r.relation==='withdraw_output','W39_RETAINED_COMPILER_RECORD'),manifest);
 assert.equal(manifest.compiledSHA256,ORIGINAL_W39_PINS.compiled.sha256);assert.equal(manifest.source,source);assert.equal(manifest.sourceSHA256,SHA(sourceBytes));assert.equal(manifest.publicWords,39);
 assert.equal(compilation.classification,'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');assert.equal(compilation.profile,'verifier');assert.deepEqual(compilation.compiler,GENERIC_COMPILER_PIN);assert.deepEqual(compilation.settings,expectedSettings);assert.deepEqual(compilation.sources,[{name:source,sha256:SHA(sourceBytes),bytes:sourceBytes.length}]);assert.deepEqual(Object.keys(compilation.sourceASTs),[source]);assert.deepEqual(Object.keys(compilation.contracts),[source]);
 const ast=compilation.sourceASTs[source];assert.equal(ast.absolutePath,source);assert.equal(ast.nodeType,'SourceUnit');contract(ast,'HonkVerifier','contract');const base=contract(ast,'BaseZKHonkVerifier','contract');
 const immutableNames=Object.fromEntries(base.nodes.filter(n=>n.nodeType==='VariableDeclaration'&&n.mutability==='immutable').map(n=>[n.id,n.name]));const immutableValues=deriveGenericVerifierImmutables(ast,39);assert.deepEqual(immutableNames,manifest.immutableNames);assert.deepEqual(immutableValues,manifest.immutableValues);
 assert.equal(key.length,1888);const word=i=>BigInt('0x'+key.subarray(i*32,(i+1)*32).toString('hex'));assert.equal(word(0),BigInt(immutableValues.$LOG_N));assert.equal(1n<<word(0),BigInt(immutableValues.$N));assert.equal(word(1),47n);assert.equal(word(1),BigInt(immutableValues.$NUM_PUBLIC_INPUTS));assert.equal(word(2),5n);
 const contracts=compilation.contracts[source],artifact=contracts.HonkVerifier,methods=artifact.abi.filter(a=>a.type==='function');assert.equal(methods.length,1);assert.equal(methods[0].name,'verify');assert.equal(methods[0].stateMutability,'view');assert.deepEqual(methods[0].inputs.map(x=>x.type),['bytes','bytes32[]']);assert.deepEqual(methods[0].outputs.map(x=>x.type),['bool']);assert.deepEqual(artifact.evm.methodIdentifiers,{'verify(bytes,bytes32[])':'ea50d0e4'});assert.ok(artifact.abi.filter(a=>a.type==='constructor').every(a=>a.stateMutability==='nonpayable'&&a.inputs.length===0));
 for(const kind of ['bytecode','deployedBytecode']){assert.deepEqual(Object.keys(artifact.evm[kind].linkReferences),[source]);assert.deepEqual(Object.keys(artifact.evm[kind].linkReferences[source]).sort(),['RelationsLib','ZKTranscriptLib']);}
 const sizes=[];for(const [name,a]of Object.entries(contracts)){
  for(const kind of ['bytecode','deployedBytecode']){const c=a.evm[kind];assert.equal(c.object.length%2,0);assert.ok(c.object.length/2<=(kind==='bytecode'?49152:24576));const ranges=[],mapped=c.object.split('');for(const [s,libs]of Object.entries(c.linkReferences))for(const [lib,refs]of Object.entries(libs)){assert.equal(s,source);assert.ok(['RelationsLib','ZKTranscriptLib'].includes(lib));for(const r of refs){assert.equal(r.length,20);assert.ok(r.start>=0&&r.start+r.length<=c.object.length/2);assert.ok(!ranges.some(([a,b])=>r.start<b&&r.start+r.length>a));ranges.push([r.start,r.start+r.length]);assert.match(c.object.slice(2*r.start,2*(r.start+r.length)),/^__\$[0-9a-f]{34}\$__$/);mapped.splice(2*r.start,2*r.length,...'00'.repeat(r.length));}}assert.match(mapped.join(''),/^(?:[0-9a-f]{2})*$/);}
  sizes.push({name,runtimeBytes:a.evm.deployedBytecode.object.length/2,creationBytes:a.evm.bytecode.object.length/2,runtimeHexTemplateSHA256:SHA(a.evm.deployedBytecode.object),links:a.evm.bytecode.linkReferences});
 }
 assert.deepEqual(sizes,manifest.artifacts);for(const name of ['RelationsLib','ZKTranscriptLib']){contract(ast,name,'library');const a=contracts[name];assert.deepEqual(a.evm.bytecode.linkReferences,{});assert.deepEqual(a.evm.deployedBytecode.linkReferences,{});assert.deepEqual(a.evm.deployedBytecode.immutableReferences,{});assert.match(a.evm.deployedBytecode.object,/^73(?:00){20}3014/);}
 for(const [id,refs]of Object.entries(artifact.evm.deployedBytecode.immutableReferences)){assert.ok(Object.hasOwn(immutableNames,id));for(const r of refs){assert.equal(r.length,32);assert.ok(r.start>=0&&r.start+32<=artifact.evm.deployedBytecode.object.length/2);assert.equal(artifact.evm.deployedBytecode.object.slice(2*r.start,2*(r.start+32)),'00'.repeat(32));}}
 const lineage={kind:'GENUINE_ORIGINAL_W39_RECORDS_ARRAY_AND_RETAINED_COMPILER',originalMode:'withdraw',retainedCompilerRole:'withdraw_output',artifactSource:source,publicWords:39,backendPublicWords:47,publicOffset:5,keySHA256:SHA(key),sourceSHA256:SHA(sourceBytes),programSHA256:SHA(programBytes),abiSHA256:SHA(JSON.stringify(program.abi)),circuitSHA256:row.circuitSHA256,noirSourceSHA256:SHA(noirSource),originalGenerationReportSHA256:ORIGINAL_W39_PINS.generation.sha256,originalInventorySHA256:ORIGINAL_W39_PINS.inventory.sha256,keyHashField:BigInt(immutableValues.$VK_HASH).toString(),keyHashFieldBasis:'Exact original generated source AST and retained compiler receipt; original binary/source/circuit hashes joined to original key-generation record',independentVKHashRecomputed:false,newProofAcceptanceEstablished:false,oldReceiptRewritten:false};
 const releasePin={source:filePin('source'),compiled:filePin('compiled'),settingsSHA256:digest(compilation.settings),artifactSHA256:digest(artifact),program:filePin('program'),key:filePin('key'),generation:filePin('generation'),constraints:null,lineage};
 for(const k of Object.keys(ORIGINAL_W39_PINS))read(k);
 const value=freeze({classification:'READ_ONLY_AUTHENTIC_W39_ARTIFACTS_NOT_RELEASE_OR_RUNTIME_AUTHORITY',toolchain,releasePin,verifier:{source,artifact,contracts,immutableNames,immutableValues,lineage},originalGeneration:{report:generation,record:row},sourcePins:ORIGINAL_W39_PINS});issued.add(value);return value;
}
