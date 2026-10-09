/** HOST METADATA ONLY. Fixture hashes/stats/receipts are deliberately synthetic.
 * No file is read as a generation, no backend/chain runs, no authority is issued. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { W39_DEV_DIRECTORY_V5, W39_DEV_FILES_V5, W39_DEV_SOURCE_V5, W39_DEV_KIND_V5,
  W39_DEV_HISTORICAL_MISSING_V5, W39_DEV_SETTINGS_V5, W39_DEV_COUNTERS_V5,
  w39DevOriginalBasisV5, validateW39DevDescriptorV5, validateW39DevGenerationV5,
  validateW39DevCompilationReceiptV5, validateW39DevReceiptV5 } from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-w39-contract-v5.mjs';
import { assertNativeValueArtifactBundle, loadNativeValueDevDeploymentArtifactsV5 } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { GENERIC_COMPILER_PIN } from '../../../../packages/engine/src/execution/local/local-deployment.mjs';
const hash='01'.repeat(32);
function descriptor(){return {kind:W39_DEV_KIND_V5,role:'withdraw',files:Object.fromEntries(W39_DEV_FILES_V5.map(name=>[name,{path:W39_DEV_DIRECTORY_V5+'/'+name,sha256:hash}])),historicalPin:w39DevOriginalBasisV5().pin,historicalMissing:W39_DEV_HISTORICAL_MISSING_V5,historicalArtifactRecovered:false,proofAcceptanceEstablished:false};}
function generation(){const basis=w39DevOriginalBasisV5();return {schema:'LIANUM_NEW_PC15_W39_GENERATION_V7',kind:W39_DEV_KIND_V5,phase:'completed',role:'withdraw',programSHA256:hash,originalProgramSHA256:W39_DEV_SOURCE_V5.programSHA256,sourceSHA256:W39_DEV_SOURCE_V5.noirSHA256,nargoSHA256:W39_DEV_SOURCE_V5.nargoSHA256,abiSHA256:W39_DEV_SOURCE_V5.abiSHA256,compressedACIRSHA256:W39_DEV_SOURCE_V5.compressedACIRSHA256,keySHA256:W39_DEV_SOURCE_V5.keySHA256,keyBytes:1888,keyHashField:'1',soliditySHA256:W39_DEV_SOURCE_V5.soliditySHA256,solidityBytes:103923,backendPublicWords:47,publicOffset:5,publicWords:39,stats:{numGates:1,numGatesDyadic:262144,numAcirOpcodes:1},settings:W39_DEV_SETTINGS_V5,toolchain:basis.toolchain,crs:basis.crs,maximumPages:32768,threads:1,keyRecomputedNow:true,sameComputedKeyPassedToGenerator:true,proofGenerated:false};}
function receipt(){return {schema:'LIANUM_NEW_PC15_W39_BUILD_V7',kind:W39_DEV_KIND_V5,phase:'completed',role:'withdraw',files:Object.fromEntries(W39_DEV_FILES_V5.filter(n=>n!=='receipt.json').map(name=>[name,{path:W39_DEV_DIRECTORY_V5+'/'+name,sha256:hash}])),historicalMissing:W39_DEV_HISTORICAL_MISSING_V5,historicalArtifactRecovered:false,componentIdentitiesUnchanged:true,counters:W39_DEV_COUNTERS_V5,sourceClosureSHA256:hash,sourceClosureUnchanged:true,backendDestroyed:true,proofGenerated:false,nativeNodesStarted:false,proofAcceptanceEstablished:false};}
function compilation(){return {schema:'LIANUM_NEW_PC15_W39_SOLC_V7',phase:'completed',compiler:GENERIC_COMPILER_PIN,sourceSHA256:W39_DEV_SOURCE_V5.soliditySHA256,compiledSHA256:hash,settingsSHA256:hash,sourceASTSHA256:hash,artifactsSHA256:hash,originalCompiledSHA256:W39_DEV_SOURCE_V5.compiledSHA256,sameSourceAST:true,sameArtifacts:true};}
test('pure produced-PC15 descriptor and receipts are metadata, never an original artifact brand',()=>{
  for(const row of [validateW39DevDescriptorV5(descriptor()),validateW39DevGenerationV5(generation()),validateW39DevReceiptV5(receipt(),descriptor()),validateW39DevCompilationReceiptV5(compilation())]){
    assert.ok(Object.isFrozen(row));assert.throws(()=>assertNativeValueArtifactBundle(row),/FIXED_ARTIFACT_BUNDLE_REQUIRED/);assert.throws(()=>assertNativeValueArtifactBundle(structuredClone(row)),/FIXED_ARTIFACT_BUNDLE_REQUIRED/);
  }
});
for(const [name,mutate]of [
 ['different W39 type',row=>row.role='withdraw_balance'],['caller directory',row=>row.files['key.vk'].path='/caller/key.vk'],
 ['raw traversal',row=>row.files['key.vk'].path=W39_DEV_DIRECTORY_V5+'/../key.vk'],['omit source capsule',row=>delete row.files['source-pins.json']],
 ['alter original key pin',row=>row.historicalPin.key.sha256=hash],['remove missing historical receipt',row=>row.historicalMissing.pop()],
 ['pretend original recovered',row=>row.historicalArtifactRecovered=true],['premature proof acceptance',row=>row.proofAcceptanceEstablished=true],
])test('produced-PC15 descriptor rejects '+name,()=>{const row=structuredClone(descriptor());mutate(row);assert.throws(()=>validateW39DevDescriptorV5(row));});
for(const [name,mutate]of [
 ['Noir source substitution',row=>row.sourceSHA256=hash],['arbitrary source package',row=>row.nargoSHA256=hash],['ACIR substitution',row=>row.compressedACIRSHA256=hash],
 ['ABI substitution',row=>row.abiSHA256=hash],['verification key substitution',row=>row.keySHA256=hash],['Solidity substitution',row=>row.soliditySHA256=hash],
 ['lost same-key join',row=>row.sameComputedKeyPassedToGenerator=false],['no current key computation',row=>row.keyRecomputedNow=false],
 ['disable ZK',row=>row.settings.disableZk=true],['different transcript oracle',row=>row.settings.oracleHashType='poseidon2'],
 ['different backend memory',row=>row.maximumPages=65536],['multiple Wasm threads',row=>row.threads=2],['wrong public offset',row=>row.publicOffset=0],
 ['wrong backend words',row=>row.backendPublicWords=39],['wrong statement words',row=>row.publicWords=47],['different actual dyadic',row=>row.stats.numGatesDyadic=524288],
 ['actual gates exceed cap',row=>row.stats.numGates=262145],['different CRS',row=>row.crs.points=1048576],['different backend version',row=>row.toolchain.barretenberg='other'],
 ['premature proof',row=>row.proofGenerated=true],['failed generation',row=>row.phase='failed'],['invalid key hash field',row=>row.keyHashField='-1'],
])test('produced-PC15 generation rejects '+name,()=>{const row=structuredClone(generation());mutate(row);assert.throws(()=>validateW39DevGenerationV5(row));});
for(const [name,mutate]of [
 ['changed raw program',row=>row.files['program.json'].sha256='02'.repeat(32)],['unchanged source omitted',row=>row.sourceClosureUnchanged=false],
 ['backend not destroyed',row=>row.backendDestroyed=false],['extra key generation',row=>row.counters.computeVK=2],['extra Noir compilation',row=>row.counters.noirCompile=2],
 ['missing Solc compilation',row=>row.counters.solcCompile=0],['proof generated',row=>row.proofGenerated=true],['node started',row=>row.nativeNodesStarted=true],
 ['historical evidence fabricated',row=>row.historicalArtifactRecovered=true],['failed build',row=>row.phase='failed'],
])test('produced-PC15 receipt rejects '+name,()=>{const row=structuredClone(receipt());mutate(row);assert.throws(()=>validateW39DevReceiptV5(row,descriptor()));});
for(const [name,mutate]of [
 ['Solc version substituted',row=>row.compiler.packageVersion='other'],['raw original compiled substituted',row=>row.originalCompiledSHA256=hash],
 ['source substituted',row=>row.sourceSHA256=hash],['changed source AST',row=>row.sameSourceAST=false],['changed artifacts',row=>row.sameArtifacts=false],
 ['incomplete compilation',row=>row.phase='failed'],
])test('produced-PC15 compilation receipt rejects '+name,()=>{const row=structuredClone(compilation());mutate(row);assert.throws(()=>validateW39DevCompilationReceiptV5(row));});
test('metadata validators reject added caller context and accessors/proxies',()=>{
 for(const [fn,args]of [[validateW39DevDescriptorV5,[descriptor()]],[validateW39DevGenerationV5,[generation()]],[validateW39DevCompilationReceiptV5,[compilation()]],[validateW39DevReceiptV5,[receipt(),descriptor()]]])assert.throws(()=>fn(...args,{caller:true}),/NO_OPTIONS/);
 const row=descriptor();let invoked=0;Object.defineProperty(row,'role',{enumerable:true,get(){invoked++;throw Error('caller callback');}});assert.throws(()=>validateW39DevDescriptorV5(row));assert.equal(invoked,0);
 assert.throws(()=>validateW39DevDescriptorV5(new Proxy(descriptor(),{})));
});
test('the fixed V5 loader cannot accept a caller-produced descriptor before filesystem inspection',async()=>{
 // The companion release suite uses an explicit test-only null publication
 // fixture, so this remains valid after a legitimate fixed V5 publication.
 await assert.rejects(loadNativeValueDevDeploymentArtifactsV5(descriptor()),/NO_CALLER_OVERRIDE/);
});

test('fixed current W39 V7 generation preserves historical namespaces and rejects V5/V6 receipts',()=>{
  assert.equal(W39_DEV_DIRECTORY_V5,'.local/development-native-value-w39/v7');
  for(const version of [5,6]){
    const oldDescriptor=structuredClone(descriptor());
    for(const file of Object.values(oldDescriptor.files))file.path=file.path.replace('/v7/','/v'+version+'/');
    assert.throws(()=>validateW39DevDescriptorV5(oldDescriptor),/FIXED_RAW_PATH/);
    for(const [make,validate,schema]of [[generation,validateW39DevGenerationV5,'LIANUM_NEW_PC15_W39_GENERATION_V'+version],
      [compilation,validateW39DevCompilationReceiptV5,'LIANUM_NEW_PC15_W39_SOLC_V'+version]]){
      const old=make();old.schema=schema;assert.throws(()=>validate(old));
    }
    const old=receipt();old.schema='LIANUM_NEW_PC15_W39_BUILD_V'+version;assert.throws(()=>validateW39DevReceiptV5(old,descriptor()));
  }
});
