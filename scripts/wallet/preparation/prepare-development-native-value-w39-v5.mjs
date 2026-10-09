/** Fixed fresh PC15 V6 generation/compilation (historical v5 files remain retained). No arguments, caller source/pins,
 * witnesses, proof, node, old receipt rewrite or automatic publication. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ROOT, GOLDEN } from '../../../packages/proofs/src/catalog.mjs';
import { regular, hash, jsonBytes, verifyAPI, loadPinned } from '../../../packages/proofs/src/tooling/tooling.mjs';
import { compileSoliditySources } from '../../../packages/proofs/src/tooling/solidity-compiler.mjs';
import { verifyToolchain, verifyCRS, CRS } from '../../../experiments/engine/private-core-proof/wallet-notes/resources.mjs';
import { nativeValueDevHostSourcePinsV5 } from '../../../packages/backend/src/operations/releases/native-value/native-value-dev-source-pins-v5.mjs';
import { W39_DEV_DIRECTORY_V5, W39_DEV_FILES_V5, W39_DEV_SOURCE_V5, W39_DEV_HISTORICAL_MISSING_V5, W39_DEV_KIND_V5,
  W39_DEV_NOIR_VERSION_V5, W39_DEV_SETTINGS_V5, W39_DEV_COUNTERS_V5, w39DevDigestV5,
  w39DevOriginalBasisV5, validateW39DevGenerationV5, validateW39DevDescriptorV5, validateW39DevReceiptV5 }
  from '../../../packages/backend/src/operations/releases/native-value/native-value-dev-w39-contract-v5.mjs';
import { validateW39DevActualComponentsV5, inspectProducedW39ArtifactsV5 }
  from '../../../packages/backend/src/operations/deployments/native-value/native-value-dev-w39-artifacts-v5.mjs';
assert.equal(process.argv.length,2,'W39_DEV_FIXED_INVOCATION');
assert.equal(realpathSync(process.argv[1]),join(ROOT,'scripts/prepare-development-native-value-w39-v5.mjs'),'W39_DEV_FIXED_ENTRY');
assert.deepEqual(process.execArgv,['--max-old-space-size=384'],'W39_DEV_FIXED_NODE_HEAP');
assert.equal(realpathSync(process.cwd()),ROOT,'W39_DEV_FIXED_CWD');
const directory=join(ROOT,W39_DEV_DIRECTORY_V5);assert.ok(!existsSync(directory),'W39_DEV_EXISTING_ATTEMPT_RETAINED');
let ancestor=dirname(directory);while(!existsSync(ancestor))ancestor=dirname(ancestor);assert.equal(realpathSync(ancestor),ancestor,'W39_DEV_OUTPUT_ALIAS');
const basis=w39DevOriginalBasisV5(),apiBefore=verifyAPI(),toolchain=verifyToolchain(),crs=verifyCRS();
assert.deepEqual(toolchain,basis.toolchain);assert.deepEqual(crs,basis.crs);
const sources=nativeValueDevHostSourcePinsV5(),sourceClosureSHA256=w39DevDigestV5(sources),original={};
for(const name of ['noir','nargo','program','key','solidity','compiled']){
  const label=W39_DEV_SOURCE_V5[name],path=label.startsWith('golden/')?join(GOLDEN,label.slice(7)):join(ROOT,label);
  original[name]=regular(path);assert.equal(hash(original[name]),W39_DEV_SOURCE_V5[name+'SHA256'],'W39_DEV_ORIGINAL_COMPONENT_PIN');
}
const check=()=>{
  for(const name of Object.keys(original)){const label=W39_DEV_SOURCE_V5[name],path=label.startsWith('golden/')?join(GOLDEN,label.slice(7)):join(ROOT,label);assert.ok(regular(path).equals(original[name]),'W39_DEV_ORIGINAL_COMPONENT_CHANGED');}
  assert.deepEqual(verifyAPI(),apiBefore);assert.deepEqual(verifyToolchain(),toolchain);assert.deepEqual(verifyCRS(),crs);
  assert.deepEqual(nativeValueDevHostSourcePinsV5(),sources,'W39_DEV_BUILD_SOURCE_CHANGED');
};
const counters={noirCompile:0,aggregateStats:0,computeVK:0,writeSolidityVerifier:0,solcCompile:0,prove:0};
let api,backendDestroyed=false;
// No dependency logger or compiler diagnostic can place operational data in
// public stdout. Wrapper stderr is retained privately and bounded on failure.
for(const name of ['log','info','debug','warn','trace'])console[name]=()=>{};
globalThis.fetch=async()=>{throw Error('W39_DEV_OFFLINE_REQUIRED');};
mkdirSync(join(directory,'circuit/src'),{recursive:true,mode:0o700});
writeFileSync(join(directory,'circuit/src/main.nr'),original.noir,{flag:'wx',mode:0o600});
writeFileSync(join(directory,'circuit/Nargo.toml'),original.nargo,{flag:'wx',mode:0o600});
const generated={};
try {
  const compiler=await loadPinned('@noir-lang/noir_wasm');check();
  const {program}=await compiler.compile(compiler.createFileManager(join(directory,'circuit')),undefined,()=>{});counters.noirCompile++;
  const programBytes=Buffer.from(jsonBytes(program));generated['program.json']=programBytes;
  assert.equal(program.noir_version,W39_DEV_NOIR_VERSION_V5);
  const oldProgram=JSON.parse(original.program);assert.deepEqual(program.abi,oldProgram.abi,'W39_DEV_COMPLETE_ABI_CHANGED');
  assert.equal(hash(JSON.stringify(program.abi)),W39_DEV_SOURCE_V5.abiSHA256);
  const compressed=Buffer.from(program.bytecode,'base64');assert.equal(compressed.toString('base64'),program.bytecode);assert.equal(hash(compressed),W39_DEV_SOURCE_V5.compressedACIRSHA256,'W39_DEV_ACIR_CHANGED');
  const bytecode=gunzipSync(compressed);assert.ok(bytecode.equals(gunzipSync(Buffer.from(oldProgram.bytecode,'base64'))),'W39_DEV_RAW_ACIR_CHANGED');
  assert.deepEqual(Object.values(program.file_map).map(f=>hash(f.source)).sort(),[W39_DEV_SOURCE_V5.noirSHA256,W39_DEV_SOURCE_V5.stdECDSASHA256].sort(),'W39_DEV_SOURCE_PROGRAM_JOIN');check();
  const bb=await loadPinned('@aztec/bb.js');check();
  api=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});
  await api.srsInitSrs({pointsBuf:regular(CRS+'bn254_g1_compressed.dat'),numPoints:2097152,g2Point:regular(CRS+'bn254_g2.dat')});check();
  const actual=await api.circuitStats({circuit:{name:'withdraw',bytecode,verificationKey:new Uint8Array()},includeGatesPerOpcode:false,settings:W39_DEV_SETTINGS_V5});counters.aggregateStats++;
  const stats={numGates:actual.numGates,numGatesDyadic:actual.numGatesDyadic,numAcirOpcodes:actual.numAcirOpcodes};assert.equal(stats.numGatesDyadic,262144);check();
  const computed=await api.circuitComputeVk({circuit:{name:'withdraw',bytecode},settings:W39_DEV_SETTINGS_V5});counters.computeVK++;
  const key=Buffer.from(computed.bytes);assert.ok(key.equals(original.key),'W39_DEV_RECOMPUTED_VK_CHANGED');assert.equal(computed.hash.length,32);
  const keyHashField=BigInt('0x'+Buffer.from(computed.hash).toString('hex')).toString();
  const source=(await api.circuitWriteSolidityVerifier({verificationKey:key,settings:W39_DEV_SETTINGS_V5})).solidityCode;counters.writeSolidityVerifier++;
  const sourceBytes=Buffer.from(source);assert.ok(sourceBytes.equals(original.solidity),'W39_DEV_GENERATED_SOLIDITY_CHANGED');check();
  const owned=api;api=undefined;await owned.destroy();backendDestroyed=true;check();
  const {milliseconds,...compiled}=compileSoliditySources({'withdraw_output.sol':{content:source,sha256:hash(sourceBytes)}},{profile:'verifier'});counters.solcCompile++;
  const compiledBytes=Buffer.from(jsonBytes(compiled));
  const generation=validateW39DevGenerationV5({schema:'LIANUM_NEW_PC15_W39_GENERATION_V6',kind:W39_DEV_KIND_V5,phase:'completed',role:'withdraw',programSHA256:hash(programBytes),originalProgramSHA256:W39_DEV_SOURCE_V5.programSHA256,sourceSHA256:W39_DEV_SOURCE_V5.noirSHA256,nargoSHA256:W39_DEV_SOURCE_V5.nargoSHA256,abiSHA256:hash(JSON.stringify(program.abi)),compressedACIRSHA256:hash(compressed),keySHA256:hash(key),keyBytes:key.length,keyHashField,soliditySHA256:hash(sourceBytes),solidityBytes:sourceBytes.length,backendPublicWords:47,publicOffset:5,publicWords:39,stats,settings:W39_DEV_SETTINGS_V5,toolchain,crs,maximumPages:32768,threads:1,keyRecomputedNow:true,sameComputedKeyPassedToGenerator:true,proofGenerated:false});
  validateW39DevActualComponentsV5({programBytes,keyBytes:key,sourceBytes,compiled,originalProgramBytes:original.program,originalCompiled:JSON.parse(original.compiled),generation});
  Object.assign(generated,{'key.vk':key,'withdraw_output.sol':sourceBytes,'compiled.json':compiledBytes,'generation.json':Buffer.from(jsonBytes(generation)),
    'compilation.json':Buffer.from(jsonBytes({schema:'LIANUM_NEW_PC15_W39_SOLC_V6',phase:'completed',compiler:compiled.compiler,sourceSHA256:hash(sourceBytes),compiledSHA256:hash(compiledBytes),settingsSHA256:w39DevDigestV5(compiled.settings),sourceASTSHA256:w39DevDigestV5(compiled.sourceASTs),artifactsSHA256:w39DevDigestV5(compiled.contracts),originalCompiledSHA256:W39_DEV_SOURCE_V5.compiledSHA256,sameSourceAST:true,sameArtifacts:true})),
    'source-pins.json':Buffer.from(jsonBytes(sources))});
  check();assert.deepEqual(counters,W39_DEV_COUNTERS_V5);
  const filePins=Object.fromEntries(Object.entries(generated).map(([name,b])=>[name,{path:W39_DEV_DIRECTORY_V5+'/'+name,sha256:hash(b)}]));
  const receipt={schema:'LIANUM_NEW_PC15_W39_BUILD_V6',kind:W39_DEV_KIND_V5,phase:'completed',role:'withdraw',files:filePins,historicalMissing:W39_DEV_HISTORICAL_MISSING_V5,historicalArtifactRecovered:false,componentIdentitiesUnchanged:true,counters,sourceClosureSHA256,sourceClosureUnchanged:true,backendDestroyed,proofGenerated:false,nativeNodesStarted:false,proofAcceptanceEstablished:false};
  generated['receipt.json']=Buffer.from(jsonBytes(receipt));
  const descriptor=validateW39DevDescriptorV5({kind:W39_DEV_KIND_V5,role:'withdraw',files:Object.fromEntries(Object.entries(generated).map(([name,b])=>[name,{path:W39_DEV_DIRECTORY_V5+'/'+name,sha256:hash(b)}])),historicalPin:basis.pin,historicalMissing:W39_DEV_HISTORICAL_MISSING_V5,historicalArtifactRecovered:false,proofAcceptanceEstablished:false});
  validateW39DevReceiptV5(receipt,descriptor);
  for(const name of W39_DEV_FILES_V5)writeFileSync(join(directory,name),generated[name],{flag:'wx',mode:0o600});
  check();const inspected=inspectProducedW39ArtifactsV5();assert.deepEqual(inspected.descriptor,descriptor,'W39_DEV_RAW_WRITTEN_DESCRIPTOR');
  process.stdout.write(JSON.stringify({phase:'completed',kind:W39_DEV_KIND_V5,keyRecomputedNow:true,proofGenerated:false,proofAcceptanceEstablished:false,historicalArtifactRecovered:false})+'\n');
} finally {
  if(api){const owned=api;api=undefined;await owned.destroy();}
}
