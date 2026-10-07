/** Fixed genuine V3 artifact loader. Read-only; no options, fallback, backend,
 * arbitrary pins, compilation, deployment or profile activation on import. */
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { ROOT, FLAT, GOLDEN, CATALOG, PROFILE, SETTINGS, NOIR_VERSION, LIMITS } from '../../../../../proofs/src/catalog.mjs';
import { regular, hash, resourceModuleURL, verifyAPI, verifyVendor, assertABI, assertKeyBytes, assertStats }
  from '../../../../../proofs/src/tooling/tooling.mjs';
import { NATIVE_INGRESS_V3_PROFILE, NATIVE_INGRESS_V3_SPEC, NATIVE_INGRESS_V3_SOURCE_VERSION,
  NATIVE_INGRESS_V3_KEY_SHA256 } from '../../../../../proofs/src/native-ingress/metadata/native-ingress-v3-profile.mjs';
import { loadNativeClaimArtifacts } from './native-claim-artifacts.mjs';
import { GENERIC_COMPILER_PIN, deriveGenericVerifierImmutables }
  from '../../../../../engine/src/execution/local/local-deployment.mjs';
import { hasDevelopmentNativeClaimsBuild, loadDevelopmentNativeClaimsArtifacts,
  loadDevelopmentNativeIngressV3ProofArtifacts } from './development-native-claims-build.mjs';
const DIR = join(ROOT, 'experiments/native-ingress-v3-artifacts');
const VALIDATION = join(ROOT, 'experiments/native-ingress-v3-validation');
const ACCEPTANCE = 'a533bbdf7f6f3b52acc86f6350fdcf6d33aafb7206abc3a5fbb2a95b7fb6bc10';
const COMPILE_ACCEPTANCE = '4becaf943b9694066754749da3b35c863d8e8cd0fe977b7749619a299a9a12ec';
const SOURCE_MANIFEST = 'b0c8317888e6a4afff98a90b57be4f8fa839ffaf7c4d9726aa3017828553eb68';
const COMPILE_RUN = 'f574cd35-4ba6-4bf7-911f-8711df163bb2';
const PHASES = Object.freeze({ stats: 'ab926291-69ce-4c26-9193-3c2253c11195',
  key: '09feff05-9d1e-4036-98b2-4e50783cbbc3', proof: 'bcf79517-1ccb-41ef-8aef-3de833aa4c82',
  solidity: '46d5696e-76b0-45ba-b947-5e8bd5c13e7d' });
const pinned = (path, expected) => { const bytes=regular(path); assert.equal(hash(bytes),expected,'V3_ARTIFACT_EXACT_PIN'); return bytes; };
const parsed = (path, expected) => JSON.parse(pinned(path,expected));
function names(ast) {
  const result={};function visit(value){if(!value||typeof value!=='object')return;
    if(value.nodeType==='VariableDeclaration'&&value.mutability==='immutable')result[value.id]=value.name;
    for(const child of Object.values(value)){if(Array.isArray(child))child.forEach(visit);else visit(child);}}
  visit(ast);return result;
}
function snapshot(value) { return structuredClone(value); }

async function checkedArtifacts() {
  const accepted=parsed(join(DIR,'acceptance.json'),ACCEPTANCE);
  const compiledAccepted=parsed(join(VALIDATION,'acceptance.json'),COMPILE_ACCEPTANCE);
  assert.equal(accepted.profile,NATIVE_INGRESS_V3_PROFILE);assert.deepEqual(accepted.phases,PHASES);
  assert.deepEqual(accepted.compiled,compiledAccepted.compiled);assert.equal(accepted.activated,false);
  assert.equal(accepted.genuineNewVK,true);assert.equal(accepted.genuineNewProof,true);
  assert.equal(accepted.offchainVerification,true);assert.equal(accepted.publicInputTamperRejected,true);
  assert.equal(accepted.pinnedSolidityCompilation,true);assert.equal(accepted.noWitnessOrFixtureSerialized,true);
  const allow=new Map();
  for(const record of accepted.publicBackupFiles){
    assert.ok(/^(?:\.local\/[a-f0-9-]{36}\/[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+)$/.test(record.path),'V3_ARTIFACT_LOCAL_PATH');
    assert.ok(!allow.has(record.path));const bytes=pinned(join(DIR,record.path),record.sha256);
    assert.equal(bytes.length,record.bytes);allow.set(record.path,record);
  }
  const read=(phase,name)=>{const path='.local/'+PHASES[phase]+'/'+name;assert.ok(allow.has(path),'V3_ARTIFACT_ALLOWLIST');return pinned(join(DIR,path),allow.get(path).sha256);};
  const reports={};
  for(const phase of Object.keys(PHASES)){
    const result=JSON.parse(read(phase,'result.json')),monitor=JSON.parse(read(phase,'resources.json'));
    assert.equal(result.mode,phase);assert.equal(result.runId,PHASES[phase]);
    for(const item of [result,monitor]){assert.equal(item.phase,'completed');assert.equal(item.runId,PHASES[phase]);assert.deepEqual(item.limits,LIMITS);}
    assert.equal(monitor.exitCode,0);assert.equal(monitor.signal,null);assert.deepEqual(monitor.failures,[]);
    assert.equal(monitor.lockPreserved,false);assert.equal(monitor.hostLimitsChanged,false);
    assert.deepEqual(result.compiled,accepted.compiled);assert.equal(result.sourceClosureSHA256,accepted.sourceClosureSHA256);
    assert.equal(result.baselinePreserved,true);assert.equal(result.witnessPersisted,false);assert.equal(result.activated,false);
    if(phase!=='solidity')assert.equal(result.backendDestroyed,true);
    assert.equal(hash(read(phase,'pins.json')),result.pinsSHA256);reports[phase]=result;
  }
  const keyPins=JSON.parse(read('key','pins.json')),api=verifyAPI(),vendor=verifyVendor();
  // Authenticate the exact host/fixture/toolchain source used by the completed
  // public-artifact run, in addition to the official package byte pins.
  for(const record of keyPins.validated.runtime){
    // This is the unchanged historical key-generation record, not the current
    // tooling identity. Only the separately reviewed source11 host delta has a
    // fixed current successor; all circuit/program/key/ABI checks below remain.
    if(record.path==='proof-workers/tooling.mjs'){
      assert.equal(record.sha256,'200240e992228e270a528d3c389f6a65b046ccf405544017cdc054a2b2b63ff5','V3_HISTORICAL_TOOLING_SOURCE');
      assert.equal(record.bytes,34287,'V3_HISTORICAL_TOOLING_BYTES');
      const bytes=pinned(resolve(ROOT,record.path),'18ac833e360d6450f62f9d6f53744eadaed9c202ddfc0f096c720bf0152b5ddc');
      assert.equal(bytes.length,34805,'V3_CURRENT_TOOLING_BYTES');
    }else{const bytes=pinned(resolve(ROOT,record.path),record.sha256);assert.equal(bytes.length,record.bytes);}
  }
  const helpers=await import(resourceModuleURL),toolchain=helpers.verifyToolchain(),crs=helpers.verifyCRS();
  assert.deepEqual(keyPins.validated.api,api);assert.deepEqual(keyPins.validated.vendor,vendor);
  assert.deepEqual(keyPins.validated.toolchain,toolchain);assert.deepEqual(keyPins.crs,crs);
  const source=parsed(join(ROOT,'experiments/native-ingress-v3/source-manifest.json'),SOURCE_MANIFEST);
  assert.equal(hash(JSON.stringify(source.files)),accepted.sourceClosureSHA256);
  const roots={wallet:ROOT,flat:FLAT,golden:GOLDEN};
  for(const file of source.files){assert.ok(Object.hasOwn(roots,file.root));const bytes=pinned(resolve(roots[file.root],file.path),file.sha256);assert.equal(bytes.length,file.bytes);}
  const manifest=parsed(join(VALIDATION,'.local',COMPILE_RUN,'compiled-manifest.json'),accepted.compiled.manifestSHA256);
  assert.deepEqual(manifest.source.files,source.files);assert.deepEqual(manifest.api,api);assert.deepEqual(manifest.vendor,vendor);assert.deepEqual(manifest.toolchain,toolchain);
  const programBytes=pinned(join(VALIDATION,'.local',COMPILE_RUN,'program.json'),accepted.compiled.programSHA256),program=JSON.parse(programBytes);
  assertABI(CATALOG.native_claim_ingress,program);assert.equal(hash(JSON.stringify(program.abi)),accepted.compiled.abiSHA256);
  const compressed=Buffer.from(program.bytecode,'base64');assert.equal(hash(compressed),accepted.compiled.bytecodeSHA256);
  const identity={format:'FLAT_WALLET_CIRCUIT_IDENTITY_V1',profile:PROFILE,relation:NATIVE_INGRESS_V3_SPEC.name,
    sources:source.files,vendor,api,toolchain,noirVersion:NOIR_VERSION,bbVersion:'5.2.0',target:'evm',settings:SETTINGS,
    publicABI:CATALOG.native_claim_ingress.publicABI,privateNames:CATALOG.native_claim_ingress.privateNames,publicWords:51};
  const sourceVersion=hash(JSON.stringify(identity));assert.equal(sourceVersion,NATIVE_INGRESS_V3_SOURCE_VERSION,'V3_SOURCE_IDENTITY');
  const key=read('key','key.vk'),keyManifestBytes=read('key','key-manifest.json'),keyManifest=JSON.parse(keyManifestBytes);
  assert.equal(hash(key),NATIVE_INGRESS_V3_KEY_SHA256);assert.equal(keyManifest.keySHA256,hash(key));
  assert.equal(keyManifest.sourceClosureSHA256,accepted.sourceClosureSHA256);assert.deepEqual(keyManifest.compiled,accepted.compiled);assert.deepEqual(keyManifest.crs,crs);assert.deepEqual(keyManifest.settings,SETTINGS);
  assertKeyBytes(CATALOG.native_claim_ingress,key,assertStats(reports.stats.stats));
  const sourceBytes=read('key','verifier.sol');assert.equal(hash(sourceBytes),keyManifest.soliditySHA256);
  assert.equal(keyManifest.keyHashField,reports.key.keyHashField);assert.deepEqual(keyManifest.stats,reports.stats.stats);
  const compilation=JSON.parse(read('solidity','compiled-solidity.json')),sourceName='native_claim_ingress_v3.sol';
  assert.equal(compilation.classification,'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');assert.equal(compilation.profile,'verifier');assert.deepEqual(compilation.compiler,GENERIC_COMPILER_PIN);
  assert.deepEqual(compilation.settings.optimizer,{enabled:true,runs:1});assert.equal(compilation.settings.viaIR,false);assert.equal(compilation.settings.evmVersion,'cancun');assert.deepEqual(compilation.settings.metadata,{bytecodeHash:'none'});
  assert.deepEqual(compilation.sources,[{name:sourceName,sha256:hash(sourceBytes),bytes:sourceBytes.length}]);
  const contracts=compilation.contracts[sourceName],artifact=contracts.HonkVerifier,ast=compilation.sourceASTs[sourceName];
  const immutableValues=deriveGenericVerifierImmutables(ast,51),immutableNames=names(ast);
  assert.deepEqual(immutableValues,reports.solidity.solidity.immutableValues);assert.deepEqual(immutableNames,reports.solidity.solidity.immutableNames);
  assert.equal(BigInt(immutableValues.$VK_HASH),BigInt(keyManifest.keyHashField));assert.equal(BigInt(immutableValues.$N),BigInt(reports.stats.stats.numGatesDyadic));
  for(const item of Object.values(contracts))assert.ok(item.evm.bytecode.object.length/2<=49152&&item.evm.deployedBytecode.object.length/2<=24576);
  assert.deepEqual(artifact.evm.methodIdentifiers,{'verify(bytes,bytes32[])':'ea50d0e4'});
  const methods=artifact.abi.filter(item=>item.type==='function');assert.equal(methods.length,1);assert.equal(methods[0].stateMutability,'view');assert.deepEqual(methods[0].inputs.map(item=>item.type),['bytes','bytes32[]']);assert.deepEqual(methods[0].outputs.map(item=>item.type),['bool']);
  const proof=read('proof','proof.bin'),publicInputs=JSON.parse(read('proof','public-inputs.json'));
  assert.equal(hash(proof),accepted.proof.sha256);assert.equal(publicInputs.length,51);assert.equal(reports.proof.selfVerified,true);assert.equal(reports.proof.tamper.rejectedByBackend,true);
  const entry={source:sourceName,sourceBytes,artifact,contracts,immutableNames,immutableValues,manifest:reports.solidity.solidity,
    sourceCommitment:sourceVersion,keyCommitment:hash(key),lineage:{sourceVersion,
      compiledManifestSHA256:accepted.compiled.manifestSHA256,keyManifestSHA256:hash(keyManifestBytes),keySHA256:hash(key),
      soliditySHA256:hash(sourceBytes),keyBytes:key.length,keyHashField:keyManifest.keyHashField,
      actualGeneratedKeyAndSource:true,offchainSyntheticProofVerified:true,proofAcceptanceEstablished:false}};
  return {entry,proof,publicInputs,program,compressed,key,identity,sourceVersion,crs,stats:reports.stats.stats,
    keyManifestSHA256:hash(keyManifestBytes),compiledManifestSHA256:accepted.compiled.manifestSHA256,
    artifactSHA256:accepted.compiled.programSHA256,bytecodeSHA256:accepted.compiled.bytecodeSHA256};
}
export async function loadNativeClaimIngressV3Artifacts(){
  assert.equal(arguments.length,0,'V3_ARTIFACT_NO_OPTIONS');
  if(hasDevelopmentNativeClaimsBuild())return loadDevelopmentNativeClaimsArtifacts();
  const candidate=await checkedArtifacts(),legacy=await loadNativeClaimArtifacts();
  assert.equal(legacy.verifiers.CO42.lineage.sourceVersion,'7ddd3be0eaddf7bc08840d6fa0660ee6e6596108e35c9c1ac83ca4f76f468ea5');
  assert.equal(legacy.verifiers.CO42.keyCommitment,'0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83');
  return {contracts:legacy.contracts,verifiers:{CI51:candidate.entry,CO42:legacy.verifiers.CO42}};
}
export async function loadNativeClaimIngressV3ProofArtifacts(){
  assert.equal(arguments.length,0,'V3_ARTIFACT_NO_OPTIONS');
  if(hasDevelopmentNativeClaimsBuild())return loadDevelopmentNativeIngressV3ProofArtifacts();
  const value=await checkedArtifacts();
  return {spec:NATIVE_INGRESS_V3_SPEC,program:value.program,compressed:value.compressed,key:value.key,
    sourceVersion:value.sourceVersion,keySHA256:hash(value.key),keyManifestSHA256:value.keyManifestSHA256,
    compiledManifestSHA256:value.compiledManifestSHA256,artifactSHA256:value.artifactSHA256,
    bytecodeSHA256:value.bytecodeSHA256,crs:value.crs,settings:SETTINGS,stats:value.stats};
}
export async function loadNativeClaimIngressV3PublicProof(){
  assert.equal(arguments.length,0,'V3_ARTIFACT_NO_OPTIONS');const value=await checkedArtifacts();
  return Object.freeze({proof:value.proof.toString('hex'),publicInputs:Object.freeze([...value.publicInputs]),
    sourceVersion:value.sourceVersion,keySHA256:hash(value.key),syntheticUnregisteredDomain:true});
}
