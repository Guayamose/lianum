/** Fixed read-only new PC15 build. No artifact brand, compiler, prover,
 * runtime or caller path; historical W39 reader remains independently fenced. */
import assert from 'node:assert/strict';
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { ROOT, GOLDEN } from '@lianum/proofs/catalog';
import { verifyAPI } from '@lianum/proofs/tooling/tooling';
import { verifyToolchain, verifyCRS } from '@lianum/proofs/toolchain/wallet-resources';
import { deriveGenericVerifierImmutables, GENERIC_COMPILER_PIN } from '@lianum/engine/execution/local/local-deployment';
import { frozenInput, cloneInput } from '@lianum/components/plain-input';
import { W39_DEV_DIRECTORY_V5, W39_DEV_FILES_V5, W39_DEV_SOURCE_V5, W39_DEV_HISTORICAL_MISSING_V5,
  W39_DEV_KIND_V5, W39_DEV_NOIR_VERSION_V5, w39DevDigestV5, w39DevOriginalBasisV5,
  validateW39DevDescriptorV5, validateW39DevGenerationV5, validateW39DevReceiptV5,
  validateW39DevCompilationReceiptV5 } from '../../releases/native-value/native-value-dev-w39-contract-v5.mjs';
import { nativeValueDevHostSourcePinsV5 } from '../../releases/native-value/native-value-dev-source-pins-v5.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceName='withdraw_output.sol';
function raw(name) {
  assert.ok(typeof name==='string'&&!name.startsWith('/')&&!name.split('/').some(p=>!p||p==='.'||p==='..'),'W39_DEV_FIXED_PATH');
  const golden=name.startsWith('golden/'),base=golden?GOLDEN:ROOT;
  assert.equal(realpathSync(base),base,'W39_DEV_ROOT_ALIAS');
  let path=base;for(const part of (golden?name.slice(7):name).split('/')){path=join(path,part);assert.ok(!lstatSync(path).isSymbolicLink(),'W39_DEV_SYMLINK');}
  const stat=lstatSync(path);assert.ok(stat.isFile()&&stat.size<=128*1024*1024,'W39_DEV_REGULAR_FILE');
  const b=readFileSync(path);assert.equal(b.length,stat.size,'W39_DEV_FILE_CHANGED');return b;
}
function original(name) {const bytes=raw(W39_DEV_SOURCE_V5[name]);assert.equal(sha(bytes),W39_DEV_SOURCE_V5[name+'SHA256'],'W39_DEV_PUBLIC_ORIGINAL_RAW_PIN');return bytes;}
/** Pure semantic join. Shape-correct receipts do not authenticate the files and
 * cannot satisfy any genuine deployment/account/owner WeakMap. */
export function validateW39DevActualComponentsV5(input) {
  assert.equal(arguments.length,1,'W39_DEV_COMPONENTS_NO_OPTIONS');
  const {programBytes,keyBytes,sourceBytes,compiled,originalProgramBytes,originalCompiled,generation}=input;
  for(const b of [programBytes,keyBytes,sourceBytes,originalProgramBytes])assert.ok(Buffer.isBuffer(b),'W39_DEV_COMPONENT_RAW_BYTES');
  const report=validateW39DevGenerationV5(generation);
  assert.equal(sha(originalProgramBytes),W39_DEV_SOURCE_V5.programSHA256,'W39_DEV_ORIGINAL_PROGRAM');
  const program=JSON.parse(programBytes),oldProgram=JSON.parse(originalProgramBytes);
  assert.equal(sha(programBytes),report.programSHA256);assert.equal(program.noir_version,W39_DEV_NOIR_VERSION_V5);
  assert.deepEqual(program.abi,oldProgram.abi,'W39_DEV_EXACT_COMPLETE_ABI');assert.equal(sha(JSON.stringify(program.abi)),W39_DEV_SOURCE_V5.abiSHA256);
  const compressed=Buffer.from(program.bytecode,'base64'),oldCompressed=Buffer.from(oldProgram.bytecode,'base64');
  assert.equal(compressed.toString('base64'),program.bytecode,'W39_DEV_CANONICAL_ACIR');
  assert.equal(sha(compressed),W39_DEV_SOURCE_V5.compressedACIRSHA256,'W39_DEV_EXACT_ACIR');
  assert.ok(gunzipSync(compressed).equals(gunzipSync(oldCompressed)),'W39_DEV_EXACT_RAW_ACIR');
  const fileDigests=Object.values(program.file_map).map(row=>sha(row.source)).sort();
  assert.deepEqual(fileDigests,[W39_DEV_SOURCE_V5.noirSHA256,W39_DEV_SOURCE_V5.stdECDSASHA256].sort(),'W39_DEV_SOURCE_PROGRAM_JOIN');
  assert.equal(sha(keyBytes),W39_DEV_SOURCE_V5.keySHA256);assert.equal(keyBytes.length,1888);assert.equal(sha(sourceBytes),W39_DEV_SOURCE_V5.soliditySHA256);
  const compilation=cloneInput(compiled);
  // The original wrapper recorded a floating wall timer. Component identity is
  // AST/artifacts/settings, with the original raw compiled file pinned outside.
  const {milliseconds:_historicalWallTimer,...originalComponents}=originalCompiled;
  const old=cloneInput(originalComponents);
  assert.equal(compilation.classification,'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');assert.equal(compilation.profile,'verifier');assert.deepEqual(compilation.compiler,GENERIC_COMPILER_PIN);
  const outputSelection={'*':{'':['ast'],'*':['abi','evm.bytecode.object','evm.bytecode.linkReferences','evm.deployedBytecode.object','evm.deployedBytecode.linkReferences','evm.deployedBytecode.immutableReferences','evm.methodIdentifiers']}};
  assert.deepEqual(compilation.settings,{optimizer:{enabled:true,runs:1},viaIR:false,evmVersion:'cancun',metadata:{bytecodeHash:'none'},outputSelection},'W39_DEV_EXACT_SOLC_SETTINGS');
  assert.deepEqual(compilation.sources,[{name:sourceName,sha256:W39_DEV_SOURCE_V5.soliditySHA256,bytes:sourceBytes.length}]);
  assert.deepEqual(Object.keys(compilation.sourceASTs),[sourceName]);assert.deepEqual(Object.keys(compilation.contracts),[sourceName]);
  assert.deepEqual(compilation.sourceASTs,old.sourceASTs,'W39_DEV_EXACT_SOURCE_AST');assert.deepEqual(compilation.contracts,old.contracts,'W39_DEV_EXACT_ARTIFACTS');
  const ast=compilation.sourceASTs[sourceName],values=deriveGenericVerifierImmutables(ast,39);
  assert.equal(ast.nodeType,'SourceUnit');assert.equal(ast.absolutePath,sourceName);
  const contract=(name,kind)=>{const rows=ast.nodes.filter(n=>n.nodeType==='ContractDefinition'&&n.name===name);assert.equal(rows.length,1);assert.equal(rows[0].contractKind,kind);return rows[0];};
  contract('HonkVerifier','contract');const base=contract('BaseZKHonkVerifier','contract');
  const immutableNames=Object.fromEntries(base.nodes.filter(n=>n.nodeType==='VariableDeclaration'&&n.mutability==='immutable').map(n=>[n.id,n.name]));
  const word=i=>BigInt('0x'+keyBytes.subarray(i*32,(i+1)*32).toString('hex'));
  assert.equal(word(0),18n);assert.equal(word(1),47n);assert.equal(word(2),5n);
  assert.equal(BigInt(values.$LOG_N),18n);assert.equal(BigInt(values.$N),262144n);assert.equal(BigInt(values.$NUM_PUBLIC_INPUTS),47n);
  assert.equal(BigInt(values.$VK_HASH),BigInt(report.keyHashField),'W39_DEV_RECOMPUTED_KEY_HASH_AST_JOIN');
  const contracts=compilation.contracts[sourceName],artifact=contracts.HonkVerifier;
  const methods=artifact.abi.filter(a=>a.type==='function');assert.equal(methods.length,1);assert.equal(methods[0].name,'verify');assert.equal(methods[0].stateMutability,'view');assert.deepEqual(methods[0].inputs.map(x=>x.type),['bytes','bytes32[]']);assert.deepEqual(methods[0].outputs.map(x=>x.type),['bool']);assert.deepEqual(artifact.evm.methodIdentifiers,{'verify(bytes,bytes32[])':'ea50d0e4'});
  assert.ok(artifact.abi.filter(a=>a.type==='constructor').every(a=>a.stateMutability==='nonpayable'&&a.inputs.length===0));
  for(const name of ['RelationsLib','ZKTranscriptLib']){contract(name,'library');assert.deepEqual(contracts[name].evm.bytecode.linkReferences,{});assert.deepEqual(contracts[name].evm.deployedBytecode.linkReferences,{});assert.deepEqual(contracts[name].evm.deployedBytecode.immutableReferences,{});}
  for(const kind of ['bytecode','deployedBytecode']){assert.deepEqual(Object.keys(artifact.evm[kind].linkReferences),[sourceName]);assert.deepEqual(Object.keys(artifact.evm[kind].linkReferences[sourceName]).sort(),['RelationsLib','ZKTranscriptLib']);}
  for(const item of Object.values(contracts))for(const kind of ['bytecode','deployedBytecode']){
    const body=item.evm[kind],ranges=[],mapped=body.object.split('');assert.equal(body.object.length%2,0);assert.ok(body.object.length/2<=(kind==='bytecode'?49152:24576),'W39_DEV_EVM_SIZE_LIMIT');
    for(const [name,links]of Object.entries(body.linkReferences))for(const [library,refs]of Object.entries(links)){assert.equal(name,sourceName);assert.ok(['RelationsLib','ZKTranscriptLib'].includes(library));for(const ref of refs){assert.equal(ref.length,20);assert.ok(ref.start>=0&&ref.start+20<=body.object.length/2);assert.ok(!ranges.some(([a,b])=>ref.start<b&&ref.start+20>a));ranges.push([ref.start,ref.start+20]);assert.match(body.object.slice(ref.start*2,(ref.start+20)*2),/^__\$[0-9a-f]{34}\$__$/);mapped.splice(ref.start*2,40,...'00'.repeat(20));}}
    assert.match(mapped.join(''),/^(?:[0-9a-f]{2})*$/);
  }
  for(const [id,refs]of Object.entries(artifact.evm.deployedBytecode.immutableReferences)){
    assert.ok(Object.hasOwn(immutableNames,id));for(const ref of refs){assert.equal(ref.length,32);assert.ok(ref.start>=0&&ref.start+32<=artifact.evm.deployedBytecode.object.length/2);assert.equal(artifact.evm.deployedBytecode.object.slice(ref.start*2,(ref.start+32)*2),'00'.repeat(32));}
  }
  return frozenInput({source:sourceName,artifact,contracts,immutableNames,immutableValues:values,lineage:{kind:W39_DEV_KIND_V5,publicWords:39,backendPublicWords:47,publicOffset:5,keySHA256:sha(keyBytes),sourceSHA256:sha(sourceBytes),programSHA256:sha(programBytes),abiSHA256:W39_DEV_SOURCE_V5.abiSHA256,compressedACIRSHA256:W39_DEV_SOURCE_V5.compressedACIRSHA256,keyHashField:report.keyHashField,keyRecomputedNow:true,independentVKHashRecomputed:false,proofAcceptanceEstablished:false,historicalArtifactRecovered:false}});
}
export function inspectProducedW39ArtifactsV5() {
  assert.equal(arguments.length,0,'W39_DEV_INSPECTION_NO_OPTIONS');
  const basis=w39DevOriginalBasisV5(),apiBefore=verifyAPI();assert.deepEqual(verifyToolchain(),basis.toolchain);assert.deepEqual(verifyCRS(),basis.crs);
  // Missing historical raws remain separately visible. New files cannot be
  // deposited at their paths or be presented as recovered historical evidence.
  for(const row of W39_DEV_HISTORICAL_MISSING_V5){const p=row.path.startsWith('golden/')?join(GOLDEN,row.path.slice(7)):join(ROOT,row.path);try{lstatSync(p);assert.fail('W39_DEV_HISTORICAL_MISSING_STATUS_CHANGED');}catch(e){if(e.code!=='ENOENT')throw e;}}
  const inputs=Object.fromEntries(['noir','nargo','program','key','solidity','compiled'].map(name=>[name,original(name)]));
  const files=Object.fromEntries(W39_DEV_FILES_V5.map(name=>[name,raw(W39_DEV_DIRECTORY_V5+'/'+name)]));
  const descriptor=validateW39DevDescriptorV5({kind:W39_DEV_KIND_V5,role:'withdraw',files:Object.fromEntries(W39_DEV_FILES_V5.map(name=>[name,{path:W39_DEV_DIRECTORY_V5+'/'+name,sha256:sha(files[name])}])),historicalPin:basis.pin,historicalMissing:W39_DEV_HISTORICAL_MISSING_V5,historicalArtifactRecovered:false,proofAcceptanceEstablished:false});
  const generation=validateW39DevGenerationV5(JSON.parse(files['generation.json']));
  const receipt=validateW39DevReceiptV5(JSON.parse(files['receipt.json']),descriptor);
  const sourcePins=JSON.parse(files['source-pins.json']);
  assert.equal(w39DevDigestV5(sourcePins),receipt.sourceClosureSHA256,'W39_DEV_BUILD_SOURCE_CAPSULE_HASH');
  assert.deepEqual(nativeValueDevHostSourcePinsV5(),sourcePins,'W39_DEV_BUILD_SOURCE_CAPSULE_CHANGED');
  const compilation=validateW39DevCompilationReceiptV5(JSON.parse(files['compilation.json']));
  const compiled=JSON.parse(files['compiled.json']);assert.equal(compilation.compiledSHA256,sha(files['compiled.json']));
  assert.equal(compilation.settingsSHA256,w39DevDigestV5(compiled.settings));assert.equal(compilation.sourceASTSHA256,w39DevDigestV5(compiled.sourceASTs));assert.equal(compilation.artifactsSHA256,w39DevDigestV5(compiled.contracts));
  assert.ok(files['key.vk'].equals(inputs.key));assert.ok(files['withdraw_output.sol'].equals(inputs.solidity));
  const verifier=validateW39DevActualComponentsV5({programBytes:files['program.json'],keyBytes:files['key.vk'],sourceBytes:files['withdraw_output.sol'],compiled,originalProgramBytes:inputs.program,originalCompiled:JSON.parse(inputs.compiled),generation});
  for(const name of Object.keys(inputs))assert.ok(original(name).equals(inputs[name]),'W39_DEV_ORIGINAL_CHANGED');
  for(const name of W39_DEV_FILES_V5)assert.ok(raw(W39_DEV_DIRECTORY_V5+'/'+name).equals(files[name]),'W39_DEV_NEW_RAW_CHANGED');
  assert.deepEqual(nativeValueDevHostSourcePinsV5(),sourcePins,'W39_DEV_BUILD_SOURCE_CAPSULE_CHANGED_AFTER_READ');
  assert.deepEqual(verifyAPI(),apiBefore);assert.deepEqual(verifyToolchain(),basis.toolchain);assert.deepEqual(verifyCRS(),basis.crs);
  return frozenInput({descriptor,verifier,receipt,artifactBundleIssued:false});
}
