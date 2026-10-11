import { inspectWrappedInstallationSourcesV2, assertWrappedProofHostRowsV2 } from '@lianum/components/verification/wrapped-installation';
/** Fixed read-only future wrapped proof owner. No graph-only release/import,
 * caller paths, registry, backend, compiler, transport, keys or fallback.
 * The genuine literal review and pins remain null. Nothing heavy happens on
 * import or on the real null-gate path. A conformance object cannot mint a brand. */
import assert from 'node:assert/strict';
import { validateWrappedClaimVerifierLinkTemplatesV1 } from './wrapped-claim-verifier-link-contract-v1.mjs';
import { loadWrappedRetainedCI51PreparationV1 } from './wrapped-claim-retained-preparation-v1.mjs';
import { loadWrappedRetainedCI51OriginV1 } from './wrapped-claim-retained-origin-v1.mjs';
import { loadWrappedRetainedCO42OriginV1 } from './wrapped-claim-retained-co-origin-v1.mjs';
import { WRAPPED_CLAIM_STAGE_HISTORY_V2, validateWrappedStageProvenanceV3, assertWrappedRetainedStageV2, assertWrappedStageRuntimeV2, assertWrappedOriginalStageReportsV2, assertWrappedConstraintInputJoinV2, wrappedStatisticsOriginPinsV2, assertWrappedPreparationInputsV2 } from './wrapped-claim-stage-provenance-v2.mjs';
import { join, resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, FLAT, GOLDEN, SETTINGS, NOIR_VERSION, LIMITS, PROFILE } from '@lianum/proofs/catalog';
import { regular, hash, verifyAPI, verifyVendor, assertStats, assertKeyBytes, resourceModuleURL }
  from '@lianum/proofs/tooling/tooling';
import { wrappedClaimRelationV1, validateWrappedClaimABIV1, wrappedClaimPublicWordsV1,
  WRAPPED_CLAIM_PROFILE_V1 } from '@lianum/proofs/wrapped-claims/metadata/wrapped-claim-profile-v1';
import { WRAPPED_CLAIM_PROOF_PIN_SET_V1, WRAPPED_CLAIM_PROOF_PIN_SCHEMA_V3,
  WRAPPED_CLAIM_PROOF_RELEASE_SCHEMA_V3, WRAPPED_CLAIM_PROOF_ACTUAL_REFS_V1 }
  from '@lianum/proofs/wrapped-claims/metadata/wrapped-claim-proof-pins-v1';
import { WRAPPED_CLAIM_PROOF_RELEASE_V1 } from './wrapped-claim-release-v1.mjs';
import { validateWrappedClaimCompiledPinsV1, validateWrappedClaimConstraintReportsV1 } from './wrapped-claim-artifact-contract-v1.mjs';
import { exactRecord, bytes32 } from '@lianum/components/encoding/commitments';
import { frozenInput } from '@lianum/components/plain-input';
import { GENERIC_COMPILER_PIN, deriveGenericVerifierImmutables }
  from '@lianum/engine/execution/local/local-deployment';
const ROOTS = Object.freeze({ wallet: ROOT, flat: FLAT, golden: GOLDEN });
const DIR = join(ROOT, 'experiments/wrapped-claim-proof-artifacts-v1');
const ROLES = Object.freeze(['claim_ingress', 'claim_discharge']);
// Original successful CO preparation and both initial proofs executed this exact
// archived source45 closure. Current reader edits cannot relabel that history.
const ORIGINAL_SOURCE45_SHA256='668fefba257abee552294b6ba98222e9311b450f1f1a822fca67bd2bd68a8156';
const FILES = Object.freeze(['source-manifest.json','compiled-manifest.json','program.json',
  'stats-result.json','stats-worker-result.json','stats-resources.json','stats-runtime-pins.json','key-manifest.json','key.vk','verifier.sol','compiled-solidity.json',
  'preparation-result.json','preparation-resources.json','preparation-runtime-pins.json',
  'proof-result.json','proof-resources.json','proof-runtime-pins.json','proof.bin','public-inputs.json']);
const RETAINED_FILES = Object.freeze([...FILES,'generated-key-stage.json','preparation-validation-receipt.json']);
const BATCHES = Object.freeze(['nonce-core','wrapped-registration','discharge-compatibility']);
const bundleOwners = new WeakSet(), roleOwners = new WeakMap();
const jsonHash = value => hash(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const FROZEN_SOURCE_MANIFEST_SHA256='a9bd06cb5af33ba36acb008e8cbe016b3ed19ba1496bde435d5fd2925cc560c1';
const logicalSource = row => ({path:({wallet:'omnichain-flat-profile/flat-wallet/',flat:'omnichain-flat-profile/',golden:'omnichain-product/'})[row.root]+row.path,bytes:row.bytes,sha256:row.sha256});
function checkedBytes(path, pin) {
  exactRecord(pin,['bytes','sha256']);bytes32(pin.sha256,true);
  assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>0,'WRAPPED_ARTIFACT_BYTE_COUNT');
  const bytes=regular(path);assert.equal(bytes.length,pin.bytes,'WRAPPED_ARTIFACT_BYTES');
  assert.equal(hash(bytes),pin.sha256,'WRAPPED_ARTIFACT_EXACT_PIN');return bytes;
}
function sourcePath(row) {
  exactRecord(row,['root','path','bytes','sha256']);
  assert.ok(Object.hasOwn(ROOTS,row.root),'WRAPPED_ARTIFACT_SOURCE_ROOT');
  assert.equal(typeof row.path,'string');
  assert.ok(row.path&&!row.path.startsWith('/')&&!row.path.split('/').some(x=>!x||x==='.'||x==='..'),'WRAPPED_ARTIFACT_SOURCE_PATH');
  return resolve(ROOTS[row.root],row.path);
}
function checkSourceRows(rows) {
  assert.ok(Array.isArray(rows)&&rows.length>0,'WRAPPED_ARTIFACT_SOURCE_CLOSURE');const seen=new Set();
  for(const row of rows){const path=sourcePath(row);assert.ok(!seen.has(path),'WRAPPED_ARTIFACT_DUPLICATE_SOURCE');seen.add(path);checkedBytes(path,{bytes:row.bytes,sha256:row.sha256});}
  return seen;
}
function originalSource45HostRows(archive,runtime) {
  const prerequisites=archive.firstProofPrerequisites??archive.prerequisites;
  assert.ok(prerequisites,'WRAPPED_ORIGINAL_HOST_PREREQUISITES');
  const rows=prerequisites.wrappedProductionHostSources;
  assert.ok(Array.isArray(rows)&&rows.length===45,'WRAPPED_ORIGINAL_SOURCE45_ROWS');
  assert.equal(jsonHash(rows),ORIGINAL_SOURCE45_SHA256,'WRAPPED_ORIGINAL_SOURCE45_EXACT_HISTORY');
  assert.equal(prerequisites.wrappedProductionHostSourceClosureSHA256,ORIGINAL_SOURCE45_SHA256);
  assert.equal(runtime.hostSourceClosureSHA256,ORIGINAL_SOURCE45_SHA256);
  assert.equal(runtime.sourceAdmission.hostSourceClosureSHA256,ORIGINAL_SOURCE45_SHA256);
  return rows;
}
function reviewedPins() {
  inspectWrappedInstallationSourcesV2();
  assert.ok(WRAPPED_CLAIM_PROOF_RELEASE_V1,'WRAPPED_REVIEWED_PROOF_RELEASE_REQUIRED');
  assert.ok(WRAPPED_CLAIM_PROOF_PIN_SET_V1,'WRAPPED_REVIEWED_PROOF_PINS_REQUIRED');
  const release=WRAPPED_CLAIM_PROOF_RELEASE_V1,pins=WRAPPED_CLAIM_PROOF_PIN_SET_V1;
  exactRecord(release,['schema','profile','pinSetSHA256','hostSourceClosureSHA256','stageProvenanceSHA256']);
  assert.equal(release.schema,WRAPPED_CLAIM_PROOF_RELEASE_SCHEMA_V3);assert.equal(release.profile,WRAPPED_CLAIM_PROFILE_V1);
  bytes32(release.stageProvenanceSHA256,true);
  assert.equal(release.pinSetSHA256,jsonHash(pins),'WRAPPED_REVIEWED_LITERAL_PIN_SET');
  exactRecord(pins,['schema','hostSources','roles','constraintFiles','compiled','stageProvenance']);
  assert.equal(release.stageProvenanceSHA256,jsonHash(pins.stageProvenance),'WRAPPED_ROOT_AUTHENTICATED_STAGE_PROVENANCE');
  validateWrappedStageProvenanceV3(pins.stageProvenance,jsonHash(pins.hostSources));
  assert.equal(pins.schema,WRAPPED_CLAIM_PROOF_PIN_SCHEMA_V3);
  assert.equal(jsonHash(pins.hostSources),release.hostSourceClosureSHA256,'WRAPPED_REVIEWED_HOST_CLOSURE');
  exactRecord(pins.roles,ROLES);exactRecord(pins.constraintFiles,BATCHES);
  validateWrappedClaimCompiledPinsV1(pins.compiled);
  for(const role of ROLES){const r=pins.roles[role];exactRecord(r,['files','sourceVersion','keySHA256','keyManifestSHA256','generatedVerifierSHA256','compiledVerifierSHA256']);
    exactRecord(r.files,pins.stageProvenance.retainedPreparation[role]?RETAINED_FILES:FILES);for(const key of ['sourceVersion','keySHA256','keyManifestSHA256','generatedVerifierSHA256','compiledVerifierSHA256'])bytes32(r[key],true);
    assert.equal(r.sourceVersion,pins.compiled[role].sourceVersion);
    const origin=WRAPPED_CLAIM_STAGE_HISTORY_V2.programOrigins[role];assert.equal(r.sourceVersion,origin.sourceVersion);assert.equal(pins.compiled[role].compiledManifestSHA256,origin.manifestSHA256);for(const key of ['programSHA256','abiSHA256','bytecodeSHA256'])assert.equal(pins.compiled[role][key],origin[key],'WRAPPED_EXACT_RETAINED_PROGRAM_LINEAGE');
    assert.equal(r.keySHA256,r.files['key.vk'].sha256);assert.equal(r.keyManifestSHA256,r.files['key-manifest.json'].sha256);
    assert.equal(r.generatedVerifierSHA256,r.files['verifier.sol'].sha256);assert.equal(r.compiledVerifierSHA256,r.files['compiled-solidity.json'].sha256);
    assert.deepEqual(WRAPPED_CLAIM_PROOF_ACTUAL_REFS_V1[role],{program:pins.compiled[role].programSHA256,actualABI:pins.compiled[role].abiSHA256,key:r.keySHA256,generatedVerifier:r.generatedVerifierSHA256},'WRAPPED_ACTUAL_REFS_MUST_BE_REVIEWED');
  }
  for(const key of ['sourceVersion','keySHA256','keyManifestSHA256','generatedVerifierSHA256','compiledVerifierSHA256'])
    assert.notEqual(pins.roles.claim_ingress[key],pins.roles.claim_discharge[key],'WRAPPED_DISTINCT_ROLE_LINEAGE');
  return pins;
}
/** Read-only proof-authority source check; no caller-supplied source list. */
export function assertWrappedClaimProofSourcePinsV1() {
  assert.equal(arguments.length,0,'WRAPPED_SOURCE_NO_OPTIONS');const pins=reviewedPins();
  assertWrappedProofHostRowsV2(pins.hostSources);const covered=checkSourceRows(pins.hostSources);
  // Static import closure plus fixed dynamic resource module. Pin/release
  // anchors are reviewed literals and excluded to avoid self-hash cycles.
  const anchors=new Set([join(ROOT,'integration/wrapped-installation-source-inspector-v2.mjs'),join(ROOT,'proof-workers/wrapped-claim-proof-pins-v1.mjs'),join(ROOT,'wallet-platform/modules/ops/wrapped-claim-release-v1.mjs')]);
  const seen=new Set();
  function visit(path){path=resolve(path);if(seen.has(path)||anchors.has(path))return;seen.add(path);
    assert.ok(covered.has(path),'WRAPPED_HOST_IMPORT_CLOSURE_MISSING');const bytes=regular(path);
    for(const match of bytes.toString('utf8').matchAll(/(?:\bfrom\s+|^\s*import\s+|\bimport\s*\(\s*)(['"])([^'"]+)\1/gm)){
      if(match[2].startsWith('node:'))continue;assert.ok(match[2].startsWith('.'),'WRAPPED_HOST_FIXED_LOCAL_IMPORT');visit(resolve(dirname(path),match[2]));}}
  for(const name of ['client','role-process','run-bounded','worker','tooling','profile'])visit(join(ROOT,`proof-workers/wrapped-claim-${name}-v1.mjs`));
  visit(fileURLToPath(import.meta.url));visit(fileURLToPath(resourceModuleURL));
  for(const name of ['wrapped-claim-abi-source-v1.json','wrapped-claim-constraint-batches-v1.json'])assert.ok(covered.has(join(ROOT,'proof-workers',name)),'WRAPPED_HOST_DATA_PIN_REQUIRED');
  return jsonHash(pins.hostSources);
}
function immutableNames(ast) {const names={};function visit(v){if(!v||typeof v!=='object')return;if(v.nodeType==='VariableDeclaration'&&v.mutability==='immutable')names[v.id]=v.name;for(const child of Object.values(v))Array.isArray(child)?child.forEach(visit):visit(child);}visit(ast);return names;}
function validateReports(result,resource,role,compiled,runtimeHash) {
  const spec=wrappedClaimRelationV1(role);
  for(const row of [result,resource]){assert.equal(row.phase,'completed');assert.equal(row.relation,spec.name);assert.equal(row.role,role);assert.equal(row.profile,WRAPPED_CLAIM_PROFILE_V1);assert.equal(row.hostLimitsChanged,false);assert.equal(row.runtimePinsSHA256,runtimeHash);assert.deepEqual(row.limits,LIMITS);}
  assert.equal(result.runId,resource.runId);assert.match(result.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(resource.exitCode,0);assert.equal(resource.signal,null);assert.equal(resource.failure,null);assert.deepEqual(resource.failures,[]);assert.equal(resource.lockPreserved,false);
  assert.deepEqual(result.compiled,compiled);assert.equal(result.witnessPersisted,false);assert.equal(result.backendDestroyed,true);assert.equal(result.activated,false);
}
/** Data joins only. The separately pinned fixed reader establishes original
 * retained evidence; this function cannot turn a failed run into completion. */
function assertRetainedOriginalPreparationJoinV1(input){
 const {manifest:m,descriptor:d,keyGeneration:k,result,resources,runtime,runtimeHash,stage,compiled,files,currentHostSourceClosureSHA256}=input;
 assert.equal(m.format,'WRAPPED_RETAINED_PREPARATION_REVALIDATION_V1');assert.equal(m.relation,compiled.relation);assert.equal(m.role,'claim_ingress');assert.equal(m.sourceVersion,compiled.sourceVersion);assert.deepEqual(m.compiled,compiled);
 for(const key of ['keyRegenerated','compilerExecuted','originalAttemptRewritten','deployable','currentConsumerAuthorityGranted','proofGenerated','nativeExecuted','activated'])assert.equal(m[key],false,'WRAPPED_RETAINED_NO_REGENERATION_OR_AUTHORITY');
 assert.equal(m.unlinkedTemplatesRequireDeploymentLinking,true);assert.equal(m.originalNestedExceptionRetained,false);assert.equal(m.separatelyReproducedFailure,'DECLARED_LIBRARY_LINK_PLACEHOLDERS_REJECTED_BY_ORIGINAL_HEX_ONLY_GUARD');
 const o=m.originalPreparation;assert.deepEqual(o.driverSourceManifest,stage.driverSourceManifest);assert.equal(o.runId,stage.runId);assert.equal(o.mode,stage.mode);assert.equal(o.phase,'failed');assert.equal(o.workerErrorCode,'PW_OPERATION_FAILED');assert.equal(o.supervisorFailure,'PW_WORKER_EXIT_FAILURE');
 assert.match(o.artifactId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.match(o.releaseId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(o.hostSourceClosureSHA256,d.originalHostSourceClosureSHA256);assert.equal(jsonHash(o.hostSources),o.hostSourceClosureSHA256,'WRAPPED_RETAINED_ORIGINAL_HOST_ROWS');assert.equal(d.currentHostSourceClosureSHA256,currentHostSourceClosureSHA256);assert.notEqual(o.hostSourceClosureSHA256,currentHostSourceClosureSHA256,'WRAPPED_RETAINED_HISTORICAL_HOST_NOT_RELABELLED');
 assert.equal(runtime.hostSourceClosureSHA256,o.hostSourceClosureSHA256);assert.deepEqual(o.sourceAdmission,runtime.sourceAdmission);assert.deepEqual(result.sourceAdmission,o.sourceAdmission);assert.deepEqual(k.sourceAdmission,o.sourceAdmission);assert.equal(o.sourceAdmission.hostSourceClosureSHA256,o.hostSourceClosureSHA256);assert.equal(o.sourceAdmission.executionAuthorized,false);assert.equal(o.sourceAdmission.immutableLifetimeEstablished,false);assert.deepEqual(o.originalInstalledEvidence.bootstrap,o.sourceAdmission.installedBootstrap);assert.deepEqual(o.originalInstalledEvidence.manifest,o.sourceAdmission.installedManifest);
 for(const [original,file]of [['result','preparation-result.json'],['resources','preparation-resources.json'],['runtimePins','preparation-runtime-pins.json'],['checkedKeyStage','generated-key-stage.json']])assert.deepEqual(o[original],files[file],'WRAPPED_RETAINED_ORIGINAL_REPORT_PIN');
 const names={key:['key.vk','key.vk'],generatedKeyStage:['generated-key-stage.json','generated-key-stage.json'],generatedSource:['verifier.sol','verifier.sol'],compiledSolidity:['compiled-solidity.json','compiled-solidity.json'],originalResult:['original-result.json','preparation-result.json'],originalResources:['original-resources.json','preparation-resources.json'],originalRuntimePins:['original-runtime-pins.json','preparation-runtime-pins.json']};exactRecord(m.artifacts,Object.keys(names));
 for(const [key,[path,file]]of Object.entries(names))assert.deepEqual(m.artifacts[key],{path,...files[file]},'WRAPPED_RETAINED_ORIGINAL_ARTIFACT_PIN');
 for(const value of [result,resources]){assert.equal(value.phase,'failed','WRAPPED_RETAINED_ORIGINAL_FAILURE_PRESERVED');assert.equal(value.runId,stage.runId);assert.equal(value.mode,stage.mode);assert.equal(value.relation,compiled.relation);assert.equal(value.role,'claim_ingress');assert.equal(value.profile,WRAPPED_CLAIM_PROFILE_V1);assert.equal(value.hostLimitsChanged,false);assert.deepEqual(value.limits,LIMITS);assert.equal(value.runtimePinsSHA256,runtimeHash);}
 assert.equal(result.errorCode,'PW_OPERATION_FAILED');assert.equal(resources.failure,'PW_WORKER_EXIT_FAILURE');assert.equal(resources.exitCode,1);assert.equal(resources.signal,null);assert.equal(resources.lockPreserved,true);assert.equal(resources.finalResources.workerRSS,0);
 assert.deepEqual(resources.failures.map(({code,signal})=>({code,...(signal!==undefined?{signal}:{})})),[{code:1,signal:null},{code:'PW_WORKER_RESULT_FAILED'}],'WRAPPED_RETAINED_ONLY_ORIGINAL_VALIDATION_FAILURE');
 for(const key of ['cleanupErrorCode','finalPinErrorCode','reportWriteFailure'])assert.equal(Object.hasOwn(result,key),false);for(const key of ['failedResourceSample','escalatedToSIGKILLAt','termError','killError','reportWriteFailure'])assert.equal(Object.hasOwn(resources,key),false);
 assert.ok(resources.minimumAvailableRAM>=LIMITS.availableRAM&&resources.minimumFreeDisk>=LIMITS.freeDisk&&resources.peakWorkerRSS<=LIMITS.workerRSS);assert.ok(Number.isFinite(resources.elapsedMilliseconds)&&resources.elapsedMilliseconds>=0&&resources.elapsedMilliseconds<LIMITS.phaseTimeoutMilliseconds);assert.ok(Number.isSafeInteger(resources.outputBytes)&&resources.outputBytes>=0&&resources.outputBytes<=LIMITS.outputBytes);
 assert.deepEqual(result.compiled,compiled);assert.equal(result.sourceVersion,compiled.sourceVersion);assert.equal(result.backendDestroyed,true);for(const key of ['witnessPersisted','proofGenerated','activated','statisticsRecomputed'])assert.equal(result[key],false);assert.equal(result.keyGenerated,true);assert.equal(result.generatedVerifier,true);
 assert.equal(k.format,'WRAPPED_CHECKED_KEY_GENERATION_STAGE_V1');assert.equal(k.classification,'ACTUAL_CHECKED_VK_PENDING_COMPLETE_PREPARATION');assert.equal(k.runId,o.runId);assert.equal(k.artifactId,o.artifactId);assert.equal(k.producerRuntimePinsSHA256,runtimeHash);assert.equal(k.hostSourceClosureSHA256,o.hostSourceClosureSHA256);assert.deepEqual(k.originalCompileProvenance,result.originalCompileProvenance);
 assert.equal(k.keyGenerated,true);assert.equal(k.generatedFresh,true);assert.equal(k.preparationComplete,false);assert.equal(k.backendCleanupPending,true);assert.equal(k.compilerExecuted,false);assert.equal(k.proofGenerated,false);
 assert.equal(k.keySHA256,files['key.vk'].sha256);assert.equal(k.keyBytes,files['key.vk'].bytes);assert.equal(result.keySHA256,k.keySHA256);assert.equal(result.soliditySHA256,files['verifier.sol'].sha256);assert.equal(result.keyHashField,k.keyHashField);assert.equal(m.keyHashField,k.keyHashField);
 for(const key of ['stats','crs','settings','maximumPages','threads','publicWords','backendPublicWords','publicInputOffset'])assert.deepEqual(m[key],k[key]);assert.deepEqual(o.statisticsOriginPins,k.statisticsOriginPins);return true;
}
function assertRetainedPreparationJoinV1(input){
 assertRetainedOriginalPreparationJoinV1(input);const {manifest:m,descriptor:d,files,stage,validationReceipt:receipt}=input;
 assert.deepEqual(d.manifest,files['key-manifest.json']);assert.deepEqual(d.validationReceipt,files['preparation-validation-receipt.json']);
 exactRecord(m.recovery,['id','artifactId','driverSourceManifest','validationReceipt']);
 for(const id of [m.recovery.id,m.recovery.artifactId])assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,'WRAPPED_RETAINED_PUBLISHED_RECOVERY_REQUIRED');assert.notEqual(m.recovery.id,stage.runId);
 exactRecord(m.recovery.driverSourceManifest,['bytes','sha256']);bytes32(m.recovery.driverSourceManifest.sha256,true);assert.ok(Number.isSafeInteger(m.recovery.driverSourceManifest.bytes)&&m.recovery.driverSourceManifest.bytes>0);assert.notEqual(m.recovery.driverSourceManifest.sha256,stage.driverSourceManifest.sha256,'WRAPPED_RECOVERY_NOT_ORIGINAL_PREPARATION_DRIVER');
 assert.deepEqual(m.recovery.validationReceipt,{path:'validation-receipt.json',...d.validationReceipt});
 assert.equal(m.release,null);assert.equal(receipt.format,'WRAPPED_RETAINED_PREPARATION_REVALIDATION_RECEIPT_V1');assert.equal(receipt.phase,'completed');assert.equal(receipt.classification,'FIXED_ORIGINAL_PUBLIC_ARTIFACT_REVALIDATION_NOT_ORIGINAL_ATTEMPT_SUCCESS_OR_DEPLOYMENT');assert.equal(receipt.recoveryId,m.recovery.id);assert.equal(receipt.artifactId,m.recovery.artifactId);assert.deepEqual(receipt.driverSourceManifest,m.recovery.driverSourceManifest);assert.deepEqual(receipt.originalPreparation,m.originalPreparation);assert.equal(receipt.originalAttemptPhase,'failed');
 for(const key of ['keyRegenerated','compilerExecuted','originalAttemptRewritten','proofGenerated','nativeExecuted','deployed','activated','productionOwnershipGranted'])assert.equal(receipt[key],false,'WRAPPED_REVALIDATION_NOT_EXECUTION');return true;
}
async function checkedBundle() {
  const pins=reviewedPins(),closure=assertWrappedClaimProofSourcePinsV1();
  const api=verifyAPI(),vendor=verifyVendor(),helpers=await import(resourceModuleURL);
  const toolchain=helpers.verifyToolchain(),crs=helpers.verifyCRS();
  const stages=pins.stageProvenance;
  // Stage archives are independent. A compile manifest never stands for an
  // ACVM/statistics/preparation/proof producer merely because widths match.
  const archive=(stage,role,descriptor)=>{
    assert.ok(['constraints','statistics','preparation','proof'].includes(stage));assert.ok(stage==='constraints'?role===null:ROLES.includes(role));
    const root=join(DIR,'stages',stage,...(role?[role]:[]));
    const manifest=JSON.parse(checkedBytes(join(root,'driver-source-manifest.json'),descriptor.driverSourceManifest));
    assert.ok(Array.isArray(manifest.files)&&manifest.files.length>0,'WRAPPED_ARCHIVED_DRIVER_CLOSURE');const paths=new Set();let prerequisites=null,firstProofPrerequisites=null;
    for(const row of manifest.files){assert.equal(typeof row.path,'string');assert.ok(row.path&&!row.path.startsWith('/')&&!row.path.split('/').some(x=>!x||x==='.'||x==='..'),'WRAPPED_DRIVER_SOURCE_PATH');assert.ok(!paths.has(row.path),'WRAPPED_DRIVER_SOURCE_DUPLICATE');paths.add(row.path);
      const bytes=checkedBytes(join(root,'source',row.path),{bytes:row.bytes,sha256:row.sha256});if(row.path==='layout/omnichain-flat-profile/flat-wallet/proof-workers/preparation-prerequisites.json')prerequisites=JSON.parse(bytes);if(row.path==='layout/omnichain-flat-profile/flat-wallet/proof-workers/first-proof-prerequisites.json')firstProofPrerequisites=JSON.parse(bytes);}
    return {manifest,prerequisites,firstProofPrerequisites};
  };
  const constraintArchive=archive('constraints',null,stages.constraints);
  const reports=BATCHES.map(batch=>{
    exactRecord(pins.constraintFiles[batch],['result','resources','runtime']);
    const read=name=>checkedBytes(join(DIR,'constraints',batch,name==='runtime'?'runtime-pins.json':name+'.json'),pins.constraintFiles[batch][name]);
    const result=JSON.parse(read('result')),resources=JSON.parse(read('resources')),runtimeBytes=read('runtime'),runtime=JSON.parse(runtimeBytes);
    assert.equal(result.runtimePinsSHA256,hash(runtimeBytes),'WRAPPED_CONSTRAINT_ACTUAL_RUNTIME_PINS');
    assert.equal(resources.runtimePinsSHA256,hash(runtimeBytes));assert.deepEqual(runtime.api,api);assert.deepEqual(runtime.vendor,vendor);
    assertWrappedStageRuntimeV2(stages.constraints,constraintArchive.manifest,runtime);
    return {result,resources};
  });
  validateWrappedClaimConstraintReportsV1(reports,pins.compiled);
  const roles={},verifiers={};
  for(const role of ROLES){
    const spec=wrappedClaimRelationV1(role),r=pins.roles[role],compiled=pins.compiled[role];
    const roleFiles=stages.retainedPreparation[role]?RETAINED_FILES:FILES;
    const read=name=>{assert.ok(roleFiles.includes(name));return checkedBytes(join(DIR,role,name),r.files[name]);};
    const parsed=name=>JSON.parse(read(name));
    const sourceBytes=read('source-manifest.json');assert.equal(hash(sourceBytes),FROZEN_SOURCE_MANIFEST_SHA256,'WRAPPED_CURRENT_FROZEN_SOURCE_MANIFEST');
    const declared=JSON.parse(sourceBytes).relations[spec.name];assert.equal(declared.sourceClosureSHA256,spec.sourceClosureSHA256);
    assert.equal(jsonHash(canonical(declared.sourceClosure)),spec.sourceClosureSHA256,'WRAPPED_EXACT_CURRENT_SOURCE_CLOSURE');
    const manifest=parsed('compiled-manifest.json'),programBytes=read('program.json'),program=JSON.parse(programBytes);
    assert.equal(hash(programBytes),compiled.programSHA256);assert.equal(r.files['compiled-manifest.json'].sha256,compiled.compiledManifestSHA256);
    if(manifest.format==='FLAT_WALLET_RETAINED_PROGRAM_REVALIDATION_V1') {
      assert.ok(role==='claim_ingress'||role==='claim_discharge','WRAPPED_RETAINED_ORIGIN_EXACT_ROLE');
      const retained=role==='claim_ingress'?await loadWrappedRetainedCI51OriginV1():await loadWrappedRetainedCO42OriginV1();
      assert.equal(retained.manifestSHA256,compiled.compiledManifestSHA256,'WRAPPED_RETAINED_MANIFEST_REVIEW_JOIN');
      assert.deepEqual(manifest,retained.manifest,'WRAPPED_RETAINED_EXACT_PUBLISHED_MANIFEST');
      assertWrappedRetainedStageV2(role,manifest,retained);
      assert.ok(Buffer.isBuffer(retained.programBytes)&&programBytes.equals(retained.programBytes),'WRAPPED_RETAINED_ORIGINAL_PROGRAM_BYTES');
      assert.equal(manifest.relation,spec.name);assert.equal(manifest.identity.profile,PROFILE);assert.equal(manifest.sourceVersion,r.sourceVersion);
    } else {
      assert.equal(manifest.format,'FLAT_WALLET_COMPILED_V1');assert.equal(manifest.relation,spec.name);assert.equal(manifest.profile,PROFILE);assert.equal(manifest.sourceVersion,r.sourceVersion);
    }
    const sources=manifest.identity.sources;checkSourceRows(sources);
    assert.deepEqual(sources.map(logicalSource),declared.sourceClosure.map(({path,bytes,sha256})=>({path,bytes,sha256})),'WRAPPED_DECLARED_AND_ACTUAL_SOURCE_CLOSURE');
    assert.equal(program.noir_version,NOIR_VERSION);assert.deepEqual(program.abi,compiled.actualABI);
    const abiValidation=validateWrappedClaimABIV1(role,program.abi);assert.equal(abiValidation.abiSHA256,compiled.abiSHA256);
    assert.equal(typeof program.bytecode,'string');const compressed=Buffer.from(program.bytecode,'base64');
    assert.ok(compressed.length>0);assert.equal(compressed.toString('base64'),program.bytecode,'WRAPPED_CANONICAL_BYTECODE');
    assert.equal(hash(compressed),compiled.bytecodeSHA256);assert.equal(manifest.programSHA256,compiled.programSHA256);assert.equal(manifest.abiSHA256,compiled.abiSHA256);assert.equal(manifest.bytecodeSHA256,compiled.bytecodeSHA256);
    // Preserve the actual fixed current compiler driver's identity bytes;
    // wrapped versioning is in relation/sourceProfile and the complete ABI.
    const identity={format:'FLAT_WALLET_CIRCUIT_IDENTITY_V1',profile:PROFILE,relation:spec.name,sourceProfile:spec.sourceProfile,
      frozenSourceManifestSHA256:FROZEN_SOURCE_MANIFEST_SHA256,sources,vendor,api,toolchain,noirVersion:NOIR_VERSION,bbVersion:'5.2.0',target:'evm',settings:SETTINGS,
      publicABI:program.abi.parameters.filter(p=>p.visibility==='public'),privateNames:program.abi.parameters.filter(p=>p.visibility==='private').map(p=>p.name),
      publicWords:spec.publicWords,completeSourceABI:abiValidation.declaredABI};
    assert.equal(jsonHash(identity),r.sourceVersion,'WRAPPED_ACTUAL_SOURCE_IDENTITY');assert.deepEqual(manifest.identity,identity);
    const statistics=parsed('stats-result.json'),dyadic=assertStats(statistics.stats);
    assert.equal(statistics.relation,spec.name);assert.equal(statistics.sourceVersion,r.sourceVersion);assert.equal(statistics.phase,'completed');assert.deepEqual(statistics.compiled,compiled);
    const statsStage=stages.statistics[role],statsArchive=archive('statistics',role,statsStage),statsResult=parsed('stats-worker-result.json'),statsResources=parsed('stats-resources.json'),statsRuntimeBytes=read('stats-runtime-pins.json'),statsRuntime=JSON.parse(statsRuntimeBytes);
    assertWrappedStageRuntimeV2(statsStage,statsArchive.manifest,statsRuntime);assertWrappedOriginalStageReportsV2('statistics',role,statsStage,statsResult,statsResources,hash(statsRuntimeBytes),compiled,LIMITS);
    for(const value of [statistics,statsResult]){assert.equal(value.mode,'stats');assert.equal(value.runId,statsStage.runId);assert.equal(value.role,role);assert.equal(value.profile,WRAPPED_CLAIM_PROFILE_V1);}
    assert.deepEqual(statsResult.stats,statistics.stats);assert.deepEqual(statsResult.identity,identity);assert.deepEqual(statsResult.originalCompileProvenance,manifest.originalCompileProvenance);
    assert.deepEqual(statsRuntime.api,api);assert.deepEqual(statsRuntime.vendor,vendor);assert.deepEqual(statsRuntime.toolchain,toolchain);assert.equal(statsRuntime.crs,null);
    assert.ok(statsArchive.prerequisites,'WRAPPED_STATS_SOURCE_PREREQUISITES_REQUIRED');assertWrappedConstraintInputJoinV2(statsArchive.prerequisites,statsRuntime,pins.constraintFiles,reports);

    // No guessed resource profile: a reviewed actual gate count selects exactly
    // the existing bounded standard/dyadic21 memory profile.
    const maximumPages=dyadic<=1048576?32768:65536;
    const key=read('key.vk'),keyManifest=parsed('key-manifest.json');assertKeyBytes(spec,key,dyadic);
    const recoveryDescriptor=stages.retainedPreparation[role];let retained=null;
    if(recoveryDescriptor){
      assert.equal(role,'claim_ingress');retained=await loadWrappedRetainedCI51PreparationV1();
      assert.ok(retained.manifestBytes.equals(read('key-manifest.json')),'WRAPPED_RETAINED_MANIFEST_RAW_JOIN');
      assert.ok(retained.validationReceiptBytes.equals(read('preparation-validation-receipt.json')),'WRAPPED_RETAINED_VALIDATION_RAW_JOIN');
      for(const [name,file]of [['key','key.vk'],['generatedKeyStage','generated-key-stage.json'],['generatedSource','verifier.sol'],['compiledSolidity','compiled-solidity.json'],['originalResult','preparation-result.json'],['originalResources','preparation-resources.json'],['originalRuntimePins','preparation-runtime-pins.json']]){
        assert.ok(Buffer.isBuffer(retained.artifacts[name])&&retained.artifacts[name].equals(read(file)),'WRAPPED_RETAINED_ORIGINAL_EMISSION_RAW_JOIN');
      }
    }
    const keyGeneration=retained?parsed('generated-key-stage.json'):keyManifest;
    assert.equal(keyGeneration.relation,spec.name);assert.equal(keyGeneration.role,role);assert.equal(keyGeneration.profile,WRAPPED_CLAIM_PROFILE_V1);
    assert.equal(keyGeneration.sourceVersion,r.sourceVersion);assert.equal(keyGeneration.keySHA256,r.keySHA256);assert.deepEqual(keyGeneration.compiled,compiled);
    assert.deepEqual(keyGeneration.crs,crs);assert.deepEqual(keyGeneration.settings,SETTINGS);assert.deepEqual(keyGeneration.stats,statistics.stats);
    assert.equal(keyGeneration.maximumPages,maximumPages);assert.equal(keyGeneration.threads,1);assert.equal(keyGeneration.publicWords,spec.publicWords);
    assert.equal(keyGeneration.backendPublicWords,spec.publicWords+8);assert.equal(keyGeneration.publicInputOffset,5);assert.equal(keyGeneration.generatedFresh,true);
    const runtime=parsed('preparation-runtime-pins.json'),runtimeHash=r.files['preparation-runtime-pins.json'].sha256;
    assert.equal(runtime.hostSourceClosureSHA256,retained?recoveryDescriptor.originalHostSourceClosureSHA256:ORIGINAL_SOURCE45_SHA256);assert.deepEqual(runtime.api,api);assert.deepEqual(runtime.vendor,vendor);assert.deepEqual(runtime.toolchain,toolchain);assert.deepEqual(runtime.crs,crs);
    const prepared=parsed('preparation-result.json'),preparationResources=parsed('preparation-resources.json');
    const preparationStage=stages.preparation[role],preparationArchive=archive('preparation',role,preparationStage);
    assertWrappedStageRuntimeV2(preparationStage,preparationArchive.manifest,runtime);
    if(retained)assertRetainedPreparationJoinV1({manifest:keyManifest,descriptor:recoveryDescriptor,validationReceipt:retained.validationReceipt,keyGeneration,result:prepared,resources:preparationResources,runtime,runtimeHash,stage:preparationStage,compiled,files:r.files,currentHostSourceClosureSHA256:closure});
    else {validateReports(prepared,preparationResources,role,compiled,runtimeHash);assertWrappedOriginalStageReportsV2('preparation',role,preparationStage,prepared,preparationResources,runtimeHash,compiled,LIMITS);}
    assert.deepEqual(prepared.identity,identity);assert.deepEqual(prepared.originalCompileProvenance,manifest.originalCompileProvenance);assert.equal(preparationStage.mode,dyadic<=1048576?'prepare-key':'prepare-key-dyadic21');
    assert.ok(preparationArchive.prerequisites,'WRAPPED_PREPARATION_SOURCE_PREREQUISITES_REQUIRED');assertWrappedConstraintInputJoinV2(preparationArchive.prerequisites,runtime,pins.constraintFiles,reports);
    assertWrappedPreparationInputsV2(role,preparationArchive.prerequisites,statsStage,r.files,retained?keyManifest.originalPreparation.hostSources:originalSource45HostRows(preparationArchive,runtime));
    const statsOrigin=wrappedStatisticsOriginPinsV2(statsStage,r.files);assert.deepEqual(keyGeneration.statisticsOriginPins,statsOrigin);assert.deepEqual(retained?keyManifest.originalPreparation.statisticsOriginPins:prepared.statisticsOriginPins,statsOrigin);assert.equal(keyGeneration.runId,preparationStage.runId);
    assert.equal(prepared.keyGenerated,true);assert.equal(prepared.generatedVerifier,true);
    if(!retained){assert.equal(prepared.keySHA256,r.keySHA256);assert.equal(prepared.soliditySHA256,r.generatedVerifierSHA256);}
    const generatedSourceBytes=read('verifier.sol'),compilation=parsed('compiled-solidity.json'),sourceName=spec.name+'.sol';
    assert.equal(retained?keyManifest.artifacts.generatedSource.sha256:keyManifest.soliditySHA256,hash(generatedSourceBytes));assert.equal(compilation.classification,'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');assert.equal(compilation.profile,'verifier');
    assert.deepEqual(compilation.compiler,GENERIC_COMPILER_PIN);assert.deepEqual(compilation.settings.optimizer,{enabled:true,runs:1});assert.equal(compilation.settings.viaIR,false);assert.equal(compilation.settings.evmVersion,'cancun');assert.deepEqual(compilation.settings.metadata,{bytecodeHash:'none'});
    assert.deepEqual(compilation.sources,[{name:sourceName,sha256:hash(generatedSourceBytes),bytes:generatedSourceBytes.length}]);
    const contracts=compilation.contracts[sourceName],artifact=contracts.HonkVerifier,ast=compilation.sourceASTs[sourceName];
    const values=deriveGenericVerifierImmutables(ast,spec.publicWords),names=immutableNames(ast);
    assert.equal(BigInt(values.$VK_HASH),BigInt(keyGeneration.keyHashField));assert.equal(BigInt(values.$N),BigInt(dyadic));
    assert.deepEqual(retained?keyManifest.immutableValues:prepared.immutableValues,values);assert.deepEqual(retained?keyManifest.immutableNames:prepared.immutableNames,names);
    const linkTemplates=validateWrappedClaimVerifierLinkTemplatesV1(compilation,sourceName,names);if(retained)assert.deepEqual(keyManifest.linkValidation,linkTemplates,'WRAPPED_RETAINED_EXACT_LINK_VALIDATION');
    assert.ok(artifact.evm.bytecode.object.length&&artifact.evm.deployedBytecode.object.length,'WRAPPED_GENUINE_VERIFIER_BYTES');
    assert.deepEqual(artifact.evm.methodIdentifiers,{'verify(bytes,bytes32[])':'ea50d0e4'});
    const methods=artifact.abi.filter(x=>x.type==='function');assert.equal(methods.length,1);assert.equal(methods[0].name,'verify');assert.equal(methods[0].stateMutability,'view');assert.deepEqual(methods[0].inputs.map(x=>x.type),['bytes','bytes32[]']);assert.deepEqual(methods[0].outputs.map(x=>x.type),['bool']);
    const constructors=artifact.abi.filter(x=>x.type==='constructor');assert.ok(constructors.length<=1&&constructors.every(x=>x.inputs.length===0&&x.stateMutability==='nonpayable'),'WRAPPED_GENUINE_VERIFIER_CONSTRUCTOR');
    const proof=read('proof.bin'),publicInputs=wrappedClaimPublicWordsV1(spec,parsed('public-inputs.json')),proofResult=parsed('proof-result.json');
    const proofStage=stages.proof[role],proofArchive=archive('proof',role,proofStage),proofResources=parsed('proof-resources.json'),proofRuntimeBytes=read('proof-runtime-pins.json'),proofRuntime=JSON.parse(proofRuntimeBytes),proofRuntimeHash=hash(proofRuntimeBytes);
    validateReports(proofResult,proofResources,role,compiled,proofRuntimeHash);
    assertWrappedStageRuntimeV2(proofStage,proofArchive.manifest,proofRuntime);assertWrappedOriginalStageReportsV2('proof',role,proofStage,proofResult,proofResources,proofRuntimeHash,compiled,LIMITS);
    originalSource45HostRows(proofArchive,proofRuntime);assert.deepEqual(proofRuntime.api,api);assert.deepEqual(proofRuntime.vendor,vendor);assert.deepEqual(proofRuntime.toolchain,toolchain);assert.deepEqual(proofRuntime.crs,crs);

    assert.equal(proofResult.keyGenerated,false);assert.equal(proofResult.keyRecomputed,false);assert.equal(proofResult.proofGenerated,true);assert.equal(proofResult.selfVerified,true);assert.equal(proofResult.publicInputTamperRejected,true);
    assert.equal(proofResult.keySHA256,r.keySHA256);assert.equal(proofResult.proofSHA256,hash(proof));assert.equal(proofResult.publicInputsSHA256,r.files['public-inputs.json'].sha256);
    assert.ok(proof.length>0&&proof.length%32===0&&proof.length<=LIMITS.outputBytes);assert.deepEqual(proofResult.publicInputs,publicInputs);
    const lineage=frozenInput({relation:spec.name,role,publicWords:spec.publicWords,sourceVersion:r.sourceVersion,sourceClosureSHA256:spec.sourceClosureSHA256,
      compiledManifestSHA256:compiled.compiledManifestSHA256,artifactSHA256:compiled.programSHA256,abiSHA256:compiled.abiSHA256,bytecodeSHA256:compiled.bytecodeSHA256,
      keySHA256:r.keySHA256,keyManifestSHA256:r.keyManifestSHA256,soliditySHA256:r.generatedVerifierSHA256,compiledVerifierSHA256:r.compiledVerifierSHA256,
      keyBytes:key.length,keyHashField:keyGeneration.keyHashField,preparationBasis:retained?'RETAINED_FAILED_ORIGINAL_AND_INDEPENDENT_REVALIDATION':'ORIGINAL_COMPLETED_PREPARATION',originalPreparationHostSourceClosureSHA256:runtime.hostSourceClosureSHA256,currentConsumerHostSourceClosureSHA256:closure,originalPreparationPhase:prepared.phase,actualGeneratedKeyAndSource:true,offchainSyntheticProofVerified:true,proofAcceptanceEstablished:false});
    // Buffer copies are intentionally not brands. Deployment receives public
    // source text, immutable JSON and lineage; proof buffers stay role-local.
    verifiers[spec.symbol]=frozenInput({source:sourceName,sourceBytes:generatedSourceBytes.toString('utf8'),artifact,contracts,immutableNames:names,immutableValues:values,
      manifest:retained?keyManifest:prepared,linkTemplates,sourceCommitment:r.sourceVersion,keyCommitment:r.keySHA256,lineage});
    const value=Object.freeze({spec,program:frozenInput(program),compressed,key,identity:frozenInput(identity),lineage,sourceVersion:r.sourceVersion,
      keySHA256:r.keySHA256,keyManifestSHA256:r.keyManifestSHA256,compiledManifestSHA256:compiled.compiledManifestSHA256,artifactSHA256:compiled.programSHA256,
      abiSHA256:compiled.abiSHA256,bytecodeSHA256:compiled.bytecodeSHA256,crs:frozenInput(crs),settings:SETTINGS,stats:frozenInput(statistics.stats),maximumPages,
      hostSourceClosureSHA256:closure,proofReleaseSHA256:jsonHash(WRAPPED_CLAIM_PROOF_RELEASE_V1)});
    inspectWrappedInstallationSourcesV2();roleOwners.set(value,{role,keySHA256:r.keySHA256,bytecodeSHA256:compiled.bytecodeSHA256});roles[role]=value;
  }
  assert.equal(assertWrappedClaimProofSourcePinsV1(),closure,'WRAPPED_HOST_CHANGED_DURING_LOAD');
  const bundle=frozenInput({profile:WRAPPED_CLAIM_PROFILE_V1,verifiers,toolchain,crs,proofReleaseSHA256:jsonHash(WRAPPED_CLAIM_PROOF_RELEASE_V1),hostSourceClosureSHA256:closure});
  inspectWrappedInstallationSourcesV2();bundleOwners.add(bundle);return {bundle,roles};
}
export async function loadWrappedClaimProofArtifactsV1(){assert.equal(arguments.length,0,'WRAPPED_PROOF_ARTIFACT_NO_OPTIONS');return (await checkedBundle()).bundle;}
export function assertWrappedClaimProofArtifactsV1(bundle){assert.equal(arguments.length,1,'WRAPPED_PROOF_ARTIFACT_ASSERT_ARITY');assert.ok(bundleOwners.has(bundle),'WRAPPED_ORIGINAL_PROOF_ARTIFACTS_REQUIRED');inspectWrappedInstallationSourcesV2();return bundle;}
export async function loadWrappedClaimRoleProofArtifactsV1(role){assert.equal(arguments.length,1,'WRAPPED_ROLE_ARTIFACT_NO_OPTIONS');wrappedClaimRelationV1(role);return (await checkedBundle()).roles[role];}
export function assertWrappedClaimRoleProofArtifactsV1(value,role){assert.equal(arguments.length,2,'WRAPPED_ROLE_ARTIFACT_ASSERT_ARITY');wrappedClaimRelationV1(role);const owned=roleOwners.get(value);assert.ok(owned&&owned.role===role,'WRAPPED_ORIGINAL_ROLE_ARTIFACTS_REQUIRED');assert.equal(hash(value.key),owned.keySHA256,'WRAPPED_ROLE_KEY_CHANGED');assert.equal(hash(value.compressed),owned.bytecodeSHA256,'WRAPPED_ROLE_BYTECODE_CHANGED');inspectWrappedInstallationSourcesV2();return value;}
