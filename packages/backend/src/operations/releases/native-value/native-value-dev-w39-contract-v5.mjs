/** New PC15 generation metadata only. No path/receipt supplied here grants a
 * capability. The V5 fixed filesystem inspector joins the actual bytes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord } from '../../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { NATIVE_VALUE_RELEASE } from './native-value-wallet-release-v4.mjs';
import { GENERIC_COMPILER_PIN } from '../../../../../engine/src/execution/local/local-deployment.mjs';
// V5 export names remain the fixed deployment API; this is a new physical generation.
// Historical v5/v6/v7/v8 raw files/receipts are retained and cannot satisfy this V9 descriptor.
export const W39_DEV_DIRECTORY_V5 = '.local/development-native-value-w39/v9';
export const W39_DEV_KIND_V5 = 'NEW_PC15_W39_GENERATION_WITH_EXACT_PUBLIC_COMPONENT_IDENTITIES';
export const W39_DEV_FILES_V5 = Object.freeze(['program.json','key.vk','withdraw_output.sol',
  'compiled.json','generation.json','compilation.json','source-pins.json','receipt.json']);
export const W39_DEV_SOURCE_V5 = Object.freeze({
  noir:'golden/experiments/private-core-proof/native-notes/circuits/withdraw/src/main.nr',
  noirSHA256:'f8284b1392cc75e7cd14f0aeaf11d94823d22f5a9c112937bf95d46cd93e6a38',
  nargo:'golden/experiments/private-core-proof/native-notes/circuits/withdraw/Nargo.toml',
  nargoSHA256:'f86772596bceb506ee1ecf7a73ad697fe920f792c56a9188aabb0ec4a9300da6',
  program:'golden/evidence/m15-notes-proof/withdraw.circuit.json',
  programSHA256:'4b2ab79c9bd9bbef7a577d5f76d56ed2ad7f67641cc4e3e3b2eccf0ab24ec617',
  compressedACIRSHA256:'750c9cda832efa2f6e1c0b74bc018f3c0bcfd8d0f75ee18401a2dce23dc15cf1',
  abiSHA256:'b68ae43f29bfb180086eab42bd102a0cda4ed14f25bd7fd430a40a629157201a',
  stdECDSASHA256:'f4de3974308bd4d4a5f0171e05e487215165fee0bea27ebcd9f007fc4bbaf231',
  key:'golden/evidence/m15-notes-proof/withdraw.vk',
  keySHA256:'92251b6321b418421cff35d5db33afb98d66e1a69918c581fdde67958555aa95',
  solidity:'golden/evidence/m15-notes-proof/withdraw.sol',
  soliditySHA256:'1691a2958f1c0dfacfdc4ec721ad59635808389902750402d7ecfae94684b4b1',
  compiled:'.local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/withdraw_output/compiled.json',
  compiledSHA256:'663daedd3262ef7db4d386eac8f4a751ea41c484a8a1a89fc4f89679431b0c41',
});
export const W39_DEV_HISTORICAL_MISSING_V5 = frozenInput([
  {path:'golden/evidence/m15-notes-compile.json',bytes:2201718,sha256:'415aa77e2bb3d165178f2bf113882ff74902bdcad16b2bbbc14630cf9df68d31'},
  {path:'golden/evidence/m15-notes-source-at-run/experiments/private-core-proof/native-notes/prover.mjs',bytes:3538,sha256:'78cf94990aa8b5d50d3b478ea7bf5cbd805bfe70901060003aa83728bb57c9e2'},
  {path:'.local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/withdraw_output/manifest.json',bytes:5162,sha256:'174e6cfb68478f51926b90ac896e57804f2f5663802a3b2317bd9124134840c1'},
  {path:'.local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/result.json',bytes:86330,sha256:'012e1ebd4fc9e4e5ba92abe520df85936c37182ca4a56f6d34cd0f8661c6e2d9'},
  {path:'.local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/resources.json',bytes:13907,sha256:'e8ac563bfa686d30eb8da4c561ce1a47f789180155a8589fd737defe75ca6969'},
]);
export const W39_DEV_SETTINGS_V5 = Object.freeze({ipaAccumulation:false,oracleHashType:'keccak',disableZk:false,optimizedSolidityVerifier:false});
export const W39_DEV_COUNTERS_V5 = Object.freeze({noirCompile:1,aggregateStats:1,computeVK:1,writeSolidityVerifier:1,solcCompile:1,prove:0});
export const W39_DEV_NOIR_VERSION_V5 = '1.0.0-beta.25+75061fab15986eedee4e7d9104ff87dd9fa4ca10';
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = v => v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export const w39DevDigestV5 = v => sha(canonical(v));
export function w39DevOriginalBasisV5() {
  assert.equal(arguments.length,0,'W39_DEV_BASIS_NO_OPTIONS');
  assert.equal(w39DevDigestV5(NATIVE_VALUE_RELEASE),'c1f9b420205bd8c67c77d5802c25be80461f1f58ecefcdec4278373a4fb3fad1','W39_DEV_HISTORICAL_RELEASE_CHANGED');
  const pin=cloneInput(NATIVE_VALUE_RELEASE.verifiers.withdraw);
  for(const [name,pathName,hashName] of [['source','solidity','soliditySHA256'],['program','program','programSHA256'],['key','key','keySHA256'],['compiled','compiled','compiledSHA256']])
    assert.deepEqual(pin[name],{path:W39_DEV_SOURCE_V5[pathName],sha256:W39_DEV_SOURCE_V5[hashName]},'W39_DEV_EXACT_PUBLIC_BASIS');
  return frozenInput({pin,toolchain:NATIVE_VALUE_RELEASE.toolchain,crs:NATIVE_VALUE_RELEASE.crs});
}
export function validateW39DevDescriptorV5(input) {
  assert.equal(arguments.length,1,'W39_DEV_DESCRIPTOR_NO_OPTIONS');const value=cloneInput(input);
  exactRecord(value,['kind','role','files','historicalPin','historicalMissing','historicalArtifactRecovered','proofAcceptanceEstablished']);
  assert.equal(value.kind,W39_DEV_KIND_V5);assert.equal(value.role,'withdraw');
  exactRecord(value.files,W39_DEV_FILES_V5);
  for(const name of W39_DEV_FILES_V5){exactRecord(value.files[name],['path','sha256']);assert.equal(value.files[name].path,W39_DEV_DIRECTORY_V5+'/'+name,'W39_DEV_FIXED_RAW_PATH');assert.match(value.files[name].sha256,/^[0-9a-f]{64}$/);}
  assert.deepEqual(value.historicalPin,w39DevOriginalBasisV5().pin,'W39_DEV_HISTORICAL_PIN_UNCHANGED');
  assert.deepEqual(value.historicalMissing,W39_DEV_HISTORICAL_MISSING_V5,'W39_DEV_HISTORICAL_MISSING_UNCHANGED');
  assert.equal(value.historicalArtifactRecovered,false);assert.equal(value.proofAcceptanceEstablished,false);
  return frozenInput(value);
}
export function validateW39DevGenerationV5(input) {
  assert.equal(arguments.length,1,'W39_DEV_GENERATION_NO_OPTIONS');const value=cloneInput(input);
  exactRecord(value,['schema','kind','phase','role','programSHA256','originalProgramSHA256','sourceSHA256','nargoSHA256','abiSHA256','compressedACIRSHA256','keySHA256','keyBytes','keyHashField','soliditySHA256','solidityBytes','backendPublicWords','publicOffset','publicWords','stats','settings','toolchain','crs','maximumPages','threads','keyRecomputedNow','sameComputedKeyPassedToGenerator','proofGenerated']);
  assert.equal(value.schema,'LIANUM_NEW_PC15_W39_GENERATION_V9');assert.equal(value.kind,W39_DEV_KIND_V5);assert.equal(value.phase,'completed');assert.equal(value.role,'withdraw');
  assert.match(value.programSHA256,/^[0-9a-f]{64}$/);
  for(const [field,expected] of Object.entries({originalProgramSHA256:W39_DEV_SOURCE_V5.programSHA256,sourceSHA256:W39_DEV_SOURCE_V5.noirSHA256,nargoSHA256:W39_DEV_SOURCE_V5.nargoSHA256,abiSHA256:W39_DEV_SOURCE_V5.abiSHA256,compressedACIRSHA256:W39_DEV_SOURCE_V5.compressedACIRSHA256,keySHA256:W39_DEV_SOURCE_V5.keySHA256,soliditySHA256:W39_DEV_SOURCE_V5.soliditySHA256}))assert.equal(value[field],expected,'W39_DEV_COMPONENT_CHANGED');
  assert.equal(value.keyBytes,1888);assert.equal(value.solidityBytes,103923);
  assert.match(value.keyHashField,/^(?:0|[1-9][0-9]*)$/);assert.ok(BigInt(value.keyHashField)>0n&&BigInt(value.keyHashField)<21888242871839275222246405745257275088548364400416034343698204186575808495617n,'W39_DEV_KEY_HASH_FIELD');
  assert.equal(value.backendPublicWords,47);assert.equal(value.publicOffset,5);assert.equal(value.publicWords,39);
  exactRecord(value.stats,['numGates','numGatesDyadic','numAcirOpcodes']);assert.equal(value.stats.numGatesDyadic,262144);
  assert.ok(Number.isSafeInteger(value.stats.numGates)&&value.stats.numGates>0&&value.stats.numGates<=262144);
  assert.ok(Number.isSafeInteger(value.stats.numAcirOpcodes)&&value.stats.numAcirOpcodes>0);
  assert.deepEqual(value.settings,W39_DEV_SETTINGS_V5);
  const basis=w39DevOriginalBasisV5();assert.deepEqual(value.toolchain,basis.toolchain);assert.deepEqual(value.crs,basis.crs);
  assert.equal(value.maximumPages,32768);assert.equal(value.threads,1);assert.equal(value.keyRecomputedNow,true);assert.equal(value.sameComputedKeyPassedToGenerator,true);assert.equal(value.proofGenerated,false);
  return frozenInput(value);
}
export function validateW39DevReceiptV5(input,descriptor) {
  assert.equal(arguments.length,2,'W39_DEV_RECEIPT_NO_OPTIONS');const value=cloneInput(input),pins=validateW39DevDescriptorV5(descriptor);
  exactRecord(value,['schema','kind','phase','role','files','historicalMissing','historicalArtifactRecovered','componentIdentitiesUnchanged','counters','sourceClosureSHA256','sourceClosureUnchanged','backendDestroyed','proofGenerated','nativeNodesStarted','proofAcceptanceEstablished']);
  assert.equal(value.schema,'LIANUM_NEW_PC15_W39_BUILD_V9');assert.equal(value.kind,W39_DEV_KIND_V5);assert.equal(value.phase,'completed');assert.equal(value.role,'withdraw');
  assert.deepEqual(value.files,Object.fromEntries(W39_DEV_FILES_V5.filter(name=>name!=='receipt.json').map(name=>[name,pins.files[name]])),'W39_DEV_BUILD_RAW_JOIN');
  assert.deepEqual(value.historicalMissing,W39_DEV_HISTORICAL_MISSING_V5);assert.equal(value.historicalArtifactRecovered,false);assert.equal(value.componentIdentitiesUnchanged,true);
  assert.deepEqual(value.counters,W39_DEV_COUNTERS_V5);assert.match(value.sourceClosureSHA256,/^[0-9a-f]{64}$/);
  for(const field of ['sourceClosureUnchanged','backendDestroyed'])assert.equal(value[field],true);
  for(const field of ['proofGenerated','nativeNodesStarted','proofAcceptanceEstablished'])assert.equal(value[field],false);
  return frozenInput(value);
}
export function validateW39DevCompilationReceiptV5(input) {
  assert.equal(arguments.length,1,'W39_DEV_SOLC_RECEIPT_NO_OPTIONS');const value=cloneInput(input);
  exactRecord(value,['schema','phase','compiler','sourceSHA256','compiledSHA256','settingsSHA256','sourceASTSHA256','artifactsSHA256','originalCompiledSHA256','sameSourceAST','sameArtifacts']);
  assert.equal(value.schema,'LIANUM_NEW_PC15_W39_SOLC_V9');assert.equal(value.phase,'completed');assert.deepEqual(value.compiler,GENERIC_COMPILER_PIN);
  assert.equal(value.sourceSHA256,W39_DEV_SOURCE_V5.soliditySHA256);assert.equal(value.originalCompiledSHA256,W39_DEV_SOURCE_V5.compiledSHA256);
  for(const name of ['compiledSHA256','settingsSHA256','sourceASTSHA256','artifactsSHA256'])assert.match(value[name],/^[0-9a-f]{64}$/);
  assert.equal(value.sameSourceAST,true);assert.equal(value.sameArtifacts,true);return frozenInput(value);
}
