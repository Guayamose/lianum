/** Reviewed public artifacts for a NEW laboratory. Fixed namespace and pins;
 * never a substitute receipt for the missing historical V3 acceptance. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CATALOG, SETTINGS, MEMORY, relation } from '@lianum/proofs/catalog';
import { regular, hash, assertABI, assertStats, assertKeyBytes, circuitIdentity,
  versionDirectory, resourceModuleURL, loadCompiled, loadPrepared } from '@lianum/proofs/tooling/tooling';
import { identities, publicProgramSHA256 } from '../../../proving/native-ingress/tooling/native-claims-build-common.mjs';
import { NATIVE_INGRESS_V3_SPEC, NATIVE_INGRESS_V3_SOURCE_VERSION, NATIVE_INGRESS_V3_KEY_SHA256 }
  from '@lianum/proofs/native-ingress/metadata/native-ingress-v3-profile';
import { GENERIC_COMPILER_PIN, deriveGenericVerifierImmutables }
  from '@lianum/engine/execution/local/local-deployment';
const DIRECTORY=join(ROOT,'.local/development-native-claims/v2');
export const DEVELOPMENT_NATIVE_CLAIMS_PIN=Object.freeze({
  // Remains closed until the actual bounded build and outputs are reviewed.
  manifestSHA256:'0df110957d9bde54085d6ae47b67811dfe626dece77b33dfa14db935b3bef043',
  contractsSHA256:'263757f0d143276829e9bf21548a67ac7b3931f28fcdd42825a31093c486bda9',
  co42SourceVersion:'7ddd3be0eaddf7bc08840d6fa0660ee6e6596108e35c9c1ac83ca4f76f468ea5',
  co42KeySHA256:'0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83',
});
const contractsByRole=Object.freeze({gateway:['native-claims/NativeClaimGateway.sol','NativeClaimGateway'],
  authority:['native-claims/NativeClaimAuthority.sol','NativeClaimAuthority'],token:['native-claims/NativeClaimToken.sol','NativeClaimToken'],
  nativeClaimCodec:['native-claims/NativeClaimCodec.sol','NativeClaimCodec'],nativeClaimValidation:['native-claims/NativeClaimValidation.sol','NativeClaimValidation']});
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value)
  :Array.isArray(value)?'['+value.map(canonical).join(',')+']'
    :'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
const read=(path,pin)=>{assert.match(pin,/^[0-9a-f]{64}$/,'DEVELOPMENT_CLAIMS_REVIEWED_PIN_REQUIRED');const bytes=regular(path);assert.equal(hash(bytes),pin,'DEVELOPMENT_CLAIMS_ARTIFACT_PIN');return bytes;};
const parsed=(path,pin)=>JSON.parse(read(path,pin));
const plain=path=>JSON.parse(regular(path));
function compiler(compilation,profile) {
  assert.equal(compilation.classification,'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');
  assert.equal(compilation.profile,profile);assert.deepEqual(compilation.compiler,GENERIC_COMPILER_PIN);
  assert.deepEqual(compilation.settings.optimizer,{enabled:true,runs:profile==='standard'?200:1});
  assert.equal(compilation.settings.viaIR,profile==='standard');assert.equal(compilation.settings.evmVersion,'cancun');
  assert.deepEqual(compilation.settings.metadata,{bytecodeHash:'none'});
}
function size(artifact,immutable=false) {
  assert.ok(artifact?.evm?.bytecode?.object&&artifact.evm.deployedBytecode.object,'DEVELOPMENT_CLAIMS_CONTRACT_REQUIRED');
  assert.ok(artifact.evm.bytecode.object.length/2<=49152&&artifact.evm.deployedBytecode.object.length/2<=24576,'DEVELOPMENT_CLAIMS_EVM_SIZE');
  if(!immutable)assert.deepEqual(artifact.evm.deployedBytecode.immutableReferences,{});
}
export function hasDevelopmentNativeClaimsBuild() {
  assert.equal(arguments.length,0,'DEVELOPMENT_CLAIMS_NO_OPTIONS');return existsSync(join(DIRECTORY,'manifest.json'));
}
async function checked() {
  const pin=DEVELOPMENT_NATIVE_CLAIMS_PIN,manifest=parsed(join(DIRECTORY,'manifest.json'),pin.manifestSHA256);
  assert.equal(manifest.format,'LIANUM_DEVELOPMENT_NATIVE_CLAIMS_BUILD_V2');
  assert.equal(manifest.classification,'REBUILT_PUBLIC_ARTIFACTS_FOR_NEW_LOCAL_LAB_NOT_HISTORICAL_ACCEPTANCE');
  for(const field of ['historicalReportsRecreated','nativeNodesStarted','proofGenerated','proofAcceptanceEstablished'])assert.equal(manifest[field],false);
  const helpers=await import(resourceModuleURL),toolchain=helpers.verifyToolchain(),crs=helpers.verifyCRS();
  assert.deepEqual(manifest.toolchain,toolchain);assert.deepEqual(manifest.crs,crs);
  assert.deepEqual(manifest.identities,identities(toolchain),'DEVELOPMENT_CLAIMS_ORIGINAL_SOURCE_IDENTITIES');
  const constraints=parsed(join(DIRECTORY,'constraint-validation.json'),manifest.constraintsSHA256);
  assert.equal(constraints.actualConstraintExecution,true);assert.equal(constraints.cases.length,40);
  assert.equal(constraints.cases.filter(item=>item.accepted).length,7);
  for(const item of constraints.cases)assert.equal(item.accepted,item.expected);
  for(const field of ['proofGenerated','witnessPersisted','historicalReportsRecreated'])assert.equal(constraints[field],false);
  assert.equal(manifest.contractsSHA256,pin.contractsSHA256);
  const compilation=parsed(join(DIRECTORY,'contracts/compiled.json'),pin.contractsSHA256);compiler(compilation,'standard');
  const sourceMap={};
  for(const record of compilation.sources) {
    assert.match(record.name,/^[A-Za-z0-9_/-]+\.sol$/);assert.ok(!record.name.startsWith('/')&&!record.name.split('/').includes('..'));
    const bytes=read(join(ROOT,'contracts',record.name),record.sha256);assert.equal(bytes.length,record.bytes);
    sourceMap[record.name]={content:bytes.toString('utf8'),sha256:record.sha256};
  }
  assert.deepEqual(Object.keys(compilation.sourceASTs).sort(),Object.keys(sourceMap).sort());
  const artifacts=Object.fromEntries(Object.entries(contractsByRole).map(([role,[source,name]])=>{
    const artifact=compilation.contracts[source]?.[name];size(artifact);return [role,artifact];
  }));
  assert.deepEqual(manifest.verifiers.map(row=>[row.relation,row.publicWords]),[['native_claim_ingress_v3',51],['native_claim_discharge',42]]);
  const result={contracts:{compilation,artifacts,sourceMap,provenance:{...pin,classification:manifest.classification}},verifiers:{}};
  let proofArtifacts;
  for(const row of manifest.verifiers) {
    const isV3=row.relation==='native_claim_ingress_v3',directory=join(DIRECTORY,'verifiers',row.relation);
    assert.equal(row.source,row.relation+'.sol');assert.deepEqual(plain(join(directory,'verifier-manifest.json')),row);
    const sourceVersion=isV3?NATIVE_INGRESS_V3_SOURCE_VERSION:pin.co42SourceVersion,keySHA256=isV3?NATIVE_INGRESS_V3_KEY_SHA256:pin.co42KeySHA256;
    assert.equal(row.sourceVersion,sourceVersion);assert.equal(row.keySHA256,keySHA256);
    let compiled,prepared;
    if(isV3) {
      const compiledManifestBytes=regular(join(directory,'compiled-manifest.json')),compiledManifest=JSON.parse(compiledManifestBytes);
      const compiledManifestSHA256=hash(compiledManifestBytes);
      assert.deepEqual(compiledManifest.identity,manifest.identities.CI51);assert.equal(compiledManifest.sourceVersion,sourceVersion);
      assert.equal(compiledManifest.bytecodeSHA256,row.lineage.bytecodeSHA256);assert.equal(compiledManifest.abiSHA256,row.lineage.abiSHA256);
      assert.equal(hash(JSON.stringify({...compiledManifest,programSHA256:row.lineage.programSHA256})),row.lineage.compiledMetadataSHA256);
      const programBytes=read(join(directory,'program.json'),compiledManifest.programSHA256),program=JSON.parse(programBytes);
      assert.equal(publicProgramSHA256(row.relation,program),row.lineage.programSHA256);
      assertABI(CATALOG.native_claim_ingress,program);assert.equal(hash(JSON.stringify(program.abi)),compiledManifest.abiSHA256);
      const compressed=Buffer.from(program.bytecode,'base64');assert.equal(compressed.toString('base64'),program.bytecode);
      assert.ok(compressed[0]===31&&compressed[1]===139);assert.equal(hash(compressed),compiledManifest.bytecodeSHA256);
      const keyManifestBytes=regular(join(directory,'key-manifest.json')),keyManifest=JSON.parse(keyManifestBytes),key=read(join(directory,'key.vk'),keySHA256);
      const keyManifestSHA256=hash(keyManifestBytes);
      assert.equal(hash(JSON.stringify({...keyManifest,compiledManifestSHA256:row.lineage.programSHA256})),row.lineage.keyMetadataSHA256);
      assert.deepEqual(keyManifest.identity,manifest.identities.CI51);assert.deepEqual(keyManifest.crs,crs);assert.deepEqual(keyManifest.settings,SETTINGS);
      assert.equal(keyManifest.compiledManifestSHA256,compiledManifestSHA256);assert.equal(keyManifest.keySHA256,keySHA256);
      assert.equal(keyManifest.keyHashField,row.keyHashField);assert.equal(keyManifest.maximumPages,MEMORY.standard);assert.equal(keyManifest.threads,1);
      assert.equal(keyManifest.proofGenerated,false);assert.equal(keyManifest.publicWords,51);assert.equal(keyManifest.actualKeyPublicCount,59);
      assert.equal(assertStats(keyManifest.stats),1048576);assertKeyBytes(CATALOG.native_claim_ingress,key,1048576);
      assert.equal(key.length,keyManifest.keyBytes);assert.equal(keyManifest.soliditySHA256,row.soliditySHA256);
      proofArtifacts={spec:NATIVE_INGRESS_V3_SPEC,program,compressed,key,sourceVersion,keySHA256,
        keyManifestSHA256,compiledManifestSHA256,
        artifactSHA256:compiledManifest.programSHA256,bytecodeSHA256:row.lineage.bytecodeSHA256,crs,settings:SETTINGS,stats:keyManifest.stats};
    } else {
      const spec=relation(row.relation),identity=circuitIdentity(spec,toolchain);assert.equal(hash(JSON.stringify(identity)),sourceVersion);
      const context={spec,identity,sourceVersion,toolchain,directory:versionDirectory(spec,sourceVersion)};
      compiled=await loadCompiled(context);prepared=await loadPrepared(context,compiled,crs);
      assert.equal(hash(prepared.key),keySHA256);assert.equal(prepared.manifest.keyHashField,row.keyHashField);
      assert.equal(publicProgramSHA256(row.relation,compiled.program),row.lineage.programSHA256);
      assert.equal(compiled.manifest.abiSHA256,row.lineage.abiSHA256);assert.equal(compiled.manifest.bytecodeSHA256,row.lineage.bytecodeSHA256);
    }
    const sourceBytes=read(join(directory,'verifier.sol'),row.soliditySHA256);
    if(prepared)assert.ok(prepared.solidity.equals(sourceBytes),'DEVELOPMENT_CLAIMS_GENERATED_CO42_SOURCE');
    const verifier=parsed(join(directory,'compiled-solidity.json'),row.compiledSHA256);compiler(verifier,'verifier');
    assert.deepEqual(verifier.sources,[{name:row.source,sha256:row.soliditySHA256,bytes:sourceBytes.length}]);
    const ast=verifier.sourceASTs[row.source],contracts=verifier.contracts[row.source];
    assert.deepEqual(deriveGenericVerifierImmutables(ast,row.publicWords),row.immutableValues);
    const names={};const visit=value=>{if(!value||typeof value!=='object')return;
      if(value.nodeType==='VariableDeclaration'&&value.mutability==='immutable')names[value.id]=value.name;
      for(const child of Object.values(value))if(Array.isArray(child))child.forEach(visit);else visit(child);};visit(ast);
    assert.deepEqual(names,row.immutableNames);assert.equal(BigInt(row.immutableValues.$VK_HASH),BigInt(row.keyHashField));
    assert.deepEqual(Object.keys(contracts).sort(),Object.keys(row.artifacts).sort());
    for(const [name,artifact] of Object.entries(contracts)) {
      assert.equal(hash(canonical(artifact)),row.artifacts[name]);if(artifact.evm.deployedBytecode.object)size(artifact,true);
    }
    const artifact=contracts.HonkVerifier;assert.deepEqual(artifact.evm.methodIdentifiers,{'verify(bytes,bytes32[])':'ea50d0e4'});
    const methods=artifact.abi.filter(item=>item.type==='function');assert.equal(methods.length,1);assert.equal(methods[0].stateMutability,'view');
    assert.deepEqual(methods[0].inputs.map(item=>item.type),['bytes','bytes32[]']);assert.deepEqual(methods[0].outputs.map(item=>item.type),['bool']);
    result.verifiers[isV3?'CI51':'CO42']={source:row.source,sourceBytes,artifact,contracts,immutableNames:names,immutableValues:row.immutableValues,
      manifest:row,sourceCommitment:sourceVersion,keyCommitment:keySHA256,
      lineage:{...row.lineage,compiledManifestSHA256:isV3?proofArtifacts.compiledManifestSHA256:compiled.manifestSHA256,
        keyManifestSHA256:isV3?proofArtifacts.keyManifestSHA256:prepared.manifestSHA256,
        sourceVersion,keySHA256,keyBytes:1888,keyHashField:row.keyHashField,soliditySHA256:row.soliditySHA256,
        actualGeneratedKeyAndSource:true,offchainSyntheticProofVerified:false,proofAcceptanceEstablished:false,classification:manifest.classification}};
  }
  return {result,proofArtifacts};
}
export async function loadDevelopmentNativeClaimsArtifacts() {
  assert.equal(arguments.length,0,'DEVELOPMENT_CLAIMS_NO_OPTIONS');return (await checked()).result;
}
export async function loadDevelopmentNativeIngressV3ProofArtifacts() {
  assert.equal(arguments.length,0,'DEVELOPMENT_CLAIMS_NO_OPTIONS');return (await checked()).proofArtifacts;
}
