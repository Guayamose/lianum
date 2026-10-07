/** Fixed historical stages plus pure future receipt conformance; no authority issuer. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exactRecord,bytes32} from '../paeg/commitments.mjs';
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const hash=b=>createHash('sha256').update(b).digest('hex');
export const WRAPPED_CLAIM_STAGE_HISTORY_V2=freeze({
  "originalCompilationDriverSHA256": "2a4dd114e69911209490a02dbc83557ea65571bc8291939c9e24bcb493839b09",
  "frozenNoirSourceManifestSHA256": "a9bd06cb5af33ba36acb008e8cbe016b3ed19ba1496bde435d5fd2925cc560c1",
  "programOrigins": {
    "claim_ingress": {
      "relation": "native_claim_ingress_nonce_registry_v3",
      "kind": "FLAT_WALLET_RETAINED_PROGRAM_REVALIDATION_V1",
      "originalCompileDriverSHA256": "2a4dd114e69911209490a02dbc83557ea65571bc8291939c9e24bcb493839b09",
      "originalRunId": "417d22b8-c244-4864-8c23-13c6aa4756ca",
      "originalArtifactId": "173c0e56-0a97-4dd5-abeb-aa906b11c976",
      "originalPhase": "failed",
      "originalErrorCode": "PW_COMPLETE_SOURCE_DECLARED_ABI",
      "originalSourceVersion": "ed9d423616b710bb981044783b48c26ca45bc104a503a42a68885412878a6738",
      "revalidationDriverSHA256": "4850b78af509b2c286a97828372544eafb78ce885788cf19f137220fca32fe85",
      "recoveryId": "4ff2157b-b2a0-47ff-a63a-48008288f952",
      "artifactId": "46d81f20-19dd-4c0b-baeb-fce32d14efff",
      "sourceVersion": "853d8f738c93416a74ae11304a0247242ad13eeb8858042b9f7def5e845f78bc",
      "manifestSHA256": "0d6aaa24cfcb81c1c36b40e62cee7ad51d06b194e662a578a5c5fa88c50498db",
      "revalidationReceiptSHA256": "5651fe2b12735258b6f8238c97056bec5656760085e197b7bc16b75a96346afc",
      "programSHA256": "40cc8a902604ae1890ba37ea78a5a575062b02e259d8c93d9b2f557c477685f0",
      "abiSHA256": "f44a3702b0131d2faaf8e78a7b65fe755755f5f852c568ae71189df43d35daac",
      "bytecodeSHA256": "b69fcddc9028dbdbdbbcf5ea0a8f02783b37150857921f04122202b11d6bd2c6"
    },
    "claim_discharge": {
      "relation": "native_claim_discharge_registry_v2",
      "kind": "FLAT_WALLET_RETAINED_PROGRAM_REVALIDATION_V1",
      "originalCompileDriverSHA256": "2a4dd114e69911209490a02dbc83557ea65571bc8291939c9e24bcb493839b09",
      "originalRunId": "634ead61-1ec6-437e-b701-8b1f1abf6c8c",
      "originalArtifactId": "e9594ac8-3987-42fd-9cd2-3cf823771c90",
      "originalPhase": "failed",
      "originalErrorCode": "PW_COMPLETE_SOURCE_DECLARED_ABI",
      "originalSourceVersion": "714b06baff15043f00c31fdddc3179bb7c48dab0162694c12ce1a72a31e6ed5a",
      "revalidationDriverSHA256": "b3c2fe7ebea990a8ecc386347494c3f46e6fd6c6c768c578b068396cdf1dbba3",
      "recoveryId": "a0baadbc-e7b0-477d-a083-5f27ac190ca4",
      "artifactId": "7cbd4144-8198-4c8a-947e-a92c851c3db9",
      "sourceVersion": "570f9fe5f711901b618cb959234a3133d48d012e503f778d2c7e18e69bff1cad",
      "manifestSHA256": "afbe326e47d5765d412fffb48809e3baa9786be11003eddcfde2a1fbfbe8936d",
      "revalidationReceiptSHA256": "cff7c604177f7c3aaa13e75835b88576c21d72527710892e8b7f39c9f6060fa0",
      "programSHA256": "00b9f1b752a8fcd817c3a5dc940d175b815f0a066c9d3ddb7055d52d6703d5a9",
      "abiSHA256": "da32d46883fe14f424729b7fff9e63c24f80f32ab3796aae4090bac041b117fb",
      "bytecodeSHA256": "648998b2db4d94414a5b4803d036657887d2d876185702a92c98dd4c819943ba"
    }
  },
  "constraintDriverSourceManifest": {
    "bytes": 32929,
    "sha256": "a114dcb03f83daf2748a516bfd8120c3bc08fec504d8c2b5b363e841a8b16549"
  },
  "statisticsCandidateSourceManifest": {
    "bytes": 35387,
    "sha256": "d32278aebb9f4f4f6f600d8b2fa9302d7303dd5d7969c5d074286ed8ba67bd1f"
  },
  "statisticsCandidateClassification": "SOURCE_IDENTITY_ONLY_NOT_EXECUTION_OR_ACCEPTANCE"
});
export const WRAPPED_CLAIM_PROVENANCE_SCHEMA_V2='LIANUM_WRAPPED_CLAIM_STAGE_PROVENANCE_V2';
const ROLES=['claim_ingress','claim_discharge'],BATCHES=['nonce-core','wrapped-registration','discharge-compatibility'];
const prefix={wallet:'layout/omnichain-flat-profile/flat-wallet/',flat:'layout/omnichain-flat-profile/',golden:'layout/omnichain-product/','isolated-draft':''};
function uuid(v){assert.ok(typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v),'WRAPPED_STAGE_RUN_ID');}
function pin(v){exactRecord(v,['bytes','sha256']);assert.ok(Number.isSafeInteger(v.bytes)&&v.bytes>0);bytes32(v.sha256,true);}
export function validateWrappedStageProvenanceV2(value){
 exactRecord(value,['schema','originalCompilationDriverSHA256','retainedProgramOrigins','constraints','statistics','preparation','proof']);
 assert.equal(value.schema,WRAPPED_CLAIM_PROVENANCE_SCHEMA_V2);assert.equal(value.originalCompilationDriverSHA256,WRAPPED_CLAIM_STAGE_HISTORY_V2.originalCompilationDriverSHA256,'WRAPPED_ORIGINAL_COMPILE_DRIVER_NOT_CONSTRAINT_DRIVER');
 assert.deepEqual(value.retainedProgramOrigins,WRAPPED_CLAIM_STAGE_HISTORY_V2.programOrigins,'WRAPPED_COMPLETE_RETAINED_ORIGIN_IDENTITIES');
 exactRecord(value.constraints,['driverSourceManifest']);assert.deepEqual(value.constraints.driverSourceManifest,WRAPPED_CLAIM_STAGE_HISTORY_V2.constraintDriverSourceManifest,'WRAPPED_EXACT_GENUINE_CONSTRAINT_DRIVER');
 const runs=new Set();for(const stage of ['statistics','preparation','proof']){exactRecord(value[stage],ROLES);for(const role of ROLES){const s=value[stage][role];assert.ok(s,'WRAPPED_STAGE_ACTUAL_EVIDENCE_NOT_REVIEWED');exactRecord(s,['driverSourceManifest','runId','mode']);pin(s.driverSourceManifest);uuid(s.runId);assert.ok(!runs.has(s.runId),'WRAPPED_STAGE_RUN_REUSED');runs.add(s.runId);
  if(stage==='statistics'){assert.equal(s.mode,'stats');assert.deepEqual(s.driverSourceManifest,WRAPPED_CLAIM_STAGE_HISTORY_V2.statisticsCandidateSourceManifest,'WRAPPED_EXACT_STATS_SOURCE_IDENTITY');}
  else {assert.ok((stage==='preparation'?['prepare-key','prepare-key-dyadic21']:['prove-synthetic-wrapped-v1']).includes(s.mode),'WRAPPED_EXACT_STAGE_MODE');const forbidden=[WRAPPED_CLAIM_STAGE_HISTORY_V2.originalCompilationDriverSHA256,WRAPPED_CLAIM_STAGE_HISTORY_V2.constraintDriverSourceManifest.sha256,WRAPPED_CLAIM_STAGE_HISTORY_V2.statisticsCandidateSourceManifest.sha256,...Object.values(WRAPPED_CLAIM_STAGE_HISTORY_V2.programOrigins).map(x=>x.revalidationDriverSHA256)];assert.ok(!forbidden.includes(s.driverSourceManifest.sha256),'WRAPPED_UNEXECUTED_OR_OTHER_STAGE_NOT_PREPARATION_OR_PROOF');}
 }}return true;
}
/** Existing fixed readers authenticate complete original/revalidation receipts.
 * This extra check preserves their distinct identities across bundle assembly. */
export function assertWrappedRetainedStageV2(role,manifest,retained){
 assert.ok(ROLES.includes(role));const p=WRAPPED_CLAIM_STAGE_HISTORY_V2.programOrigins[role];
 assert.equal(manifest.format,p.kind);assert.equal(retained.manifestSHA256,p.manifestSHA256);assert.equal(retained.revalidationReceiptSHA256,p.revalidationReceiptSHA256);assert.equal(manifest.revalidationReceipt.sha256,p.revalidationReceiptSHA256);
 assert.equal(manifest.relation,p.relation);assert.equal(manifest.role,role);assert.equal(manifest.recoveryId,p.recoveryId);assert.equal(manifest.artifactId,p.artifactId);assert.equal(manifest.sourceVersion,p.sourceVersion);assert.equal(retained.originalCompilerSourceVersion,p.originalSourceVersion);
 const original=manifest.originalCompileProvenance;assert.equal(original.runId,p.originalRunId);assert.equal(original.artifactId,p.originalArtifactId);assert.equal(original.phase,p.originalPhase);assert.equal(original.errorCode,p.originalErrorCode);assert.equal(original.sourceVersion,p.originalSourceVersion);assert.equal(hash(JSON.stringify(original.identity)),p.originalSourceVersion);assert.equal(hash(JSON.stringify(manifest.identity)),p.sourceVersion);
 for(const key of ['programSHA256','abiSHA256','bytecodeSHA256'])assert.equal(manifest[key],p[key]);assert.equal(manifest.originalAttemptRewritten,false);assert.equal(manifest.compilerExecuted,false);return true;
}
export function assertWrappedStageRuntimeV2(descriptor,manifest,runtime){
 pin(descriptor.driverSourceManifest);assert.ok(Array.isArray(manifest.files)&&manifest.files.length>0);assert.ok(Array.isArray(runtime.executionSources)&&runtime.executionSources.length>0);
 const drivers=runtime.executionSources.filter(x=>x.root==='isolated-draft'&&x.path==='driver-source-manifest.json');assert.equal(drivers.length,1,'WRAPPED_STAGE_ONE_DRIVER');assert.equal(drivers[0].sha256,descriptor.driverSourceManifest.sha256,'WRAPPED_STAGE_EXECUTED_DRIVER');assert.equal(drivers[0].bytes,descriptor.driverSourceManifest.bytes);
 const ran=new Map();for(const row of runtime.executionSources){if(!Object.hasOwn(prefix,row.root))continue;const key=prefix[row.root]+row.path;assert.ok(!ran.has(key),'WRAPPED_STAGE_DUPLICATE_EXECUTED_SOURCE');ran.set(key,row);}
 const seen=new Set();for(const row of manifest.files){assert.ok(!seen.has(row.path),'WRAPPED_STAGE_DUPLICATE_ARCHIVED_SOURCE');seen.add(row.path);const actual=ran.get(row.path);assert.ok(actual,'WRAPPED_STAGE_ARCHIVED_SOURCE_NOT_EXECUTED');assert.equal(actual.bytes,row.bytes);assert.equal(actual.sha256,row.sha256);}return true;
}
export function assertWrappedOriginalStageReportsV2(stage,role,descriptor,result,resource,runtimeHash,compiled,limits){
 assert.ok(['statistics','preparation','proof'].includes(stage));assert.ok(ROLES.includes(role));uuid(descriptor.runId);
 for(const r of [result,resource]){assert.equal(r.phase,'completed','WRAPPED_STAGE_MUST_HAVE_ACTUALLY_COMPLETED');assert.equal(r.profile,'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1');assert.equal(r.relation,compiled.relation);assert.equal(r.role,role);assert.equal(r.mode,descriptor.mode,'WRAPPED_ORIGINAL_STAGE_MODE');assert.equal(r.runId,descriptor.runId,'WRAPPED_ORIGINAL_STAGE_RUN');assert.equal(r.hostLimitsChanged,false);assert.deepEqual(r.limits,limits);assert.equal(r.runtimePinsSHA256,runtimeHash);}
 assert.equal(resource.exitCode,0);assert.equal(resource.signal,null);assert.equal(resource.failure,null);assert.deepEqual(resource.failures,[]);assert.equal(resource.lockPreserved,false);assert.equal(resource.finalResources.workerRSS,0);
 assert.ok(resource.minimumAvailableRAM>=limits.availableRAM&&resource.minimumFreeDisk>=limits.freeDisk&&resource.peakWorkerRSS<=limits.workerRSS);assert.ok(Number.isFinite(resource.elapsedMilliseconds)&&resource.elapsedMilliseconds>=0&&resource.elapsedMilliseconds<limits.phaseTimeoutMilliseconds);assert.ok(Number.isSafeInteger(resource.outputBytes)&&resource.outputBytes>=0&&resource.outputBytes<=limits.outputBytes);
 for(const k of ['finalPinErrorCode','cleanupErrorCode','reportWriteFailure'])assert.equal(Object.hasOwn(result,k),false,'WRAPPED_STAGE_ORIGINAL_FAILURE');
 assert.deepEqual(result.compiled,compiled);assert.equal(result.sourceVersion,compiled.sourceVersion);assert.equal(result.witnessPersisted,false);assert.equal(result.backendDestroyed,true);assert.equal(result.activated,false);
 if(stage==='statistics'){assert.equal(result.keyGenerated,false);assert.equal(result.proofGenerated,false);}
 if(stage==='preparation'){assert.equal(result.keyGenerated,true);assert.equal(result.proofGenerated,false);assert.equal(result.generatedVerifier,true);assert.equal(result.statisticsRecomputed,false);}
 if(stage==='proof'){assert.equal(result.keyGenerated,false);assert.equal(result.keyRecomputed,false);assert.equal(result.proofGenerated,true);assert.equal(result.selfVerified,true);assert.equal(result.publicInputTamperRejected,true);}return true;
}
export function assertWrappedConstraintInputJoinV2(prerequisites,runtime,constraintFiles,reports){
 assert.equal(prerequisites.constraintDriverRoot,'drafts/wrapped-retained-constraints-20261006');assert.equal(prerequisites.constraintDriverManifestSHA256,WRAPPED_CLAIM_STAGE_HISTORY_V2.constraintDriverSourceManifest.sha256);exactRecord(prerequisites.constraintReports,BATCHES);
 const expected=[];BATCHES.forEach((batch,i)=>{const row=prerequisites.constraintReports[batch];assert.ok(row);assert.equal(row.runId,reports[i].result.runId);for(const name of ['result','resources','runtime']){const p=row[name],declared=constraintFiles[batch][name];assert.equal(p.sha256,declared.sha256);assert.equal(p.bytes,declared.bytes);const basename=name==='runtime'?'runtime-pins.json':name+'.json';assert.equal(p.path,'drafts/wrapped-retained-constraints-20261006/layout/omnichain-flat-profile/flat-wallet/.local/proof-workers/attempts/'+row.runId+'/'+basename);}expected.push({batch,...row});});
 assert.deepEqual(runtime.prerequisiteConstraintReportPins,expected,'WRAPPED_STAGE_GENUINE_CONSTRAINT_INPUTS');return true;
}
export function wrappedStatisticsOriginPinsV2(descriptor,files){
 return {runId:descriptor.runId,driverManifestSHA256:descriptor.driverSourceManifest.sha256,...Object.fromEntries([['statistics','stats-result.json','stats-result.json'],['result','stats-worker-result.json','result.json'],['resources','stats-resources.json','resources.json'],['runtime','stats-runtime-pins.json','runtime-pins.json']].map(([k,file,original])=>[k,{path:'attempts/'+descriptor.runId+'/'+original,...files[file]}]))};
}
export function assertWrappedPreparationInputsV2(role,prerequisites,statsDescriptor,files,hostSources){
 assert.ok(ROLES.includes(role));assert.deepEqual(prerequisites.statisticsByRole[role],wrappedStatisticsOriginPinsV2(statsDescriptor,files),'WRAPPED_PREPARATION_ORIGINAL_STATS_RECEIPTS');assert.deepEqual(prerequisites.wrappedProductionHostSources,hostSources,'WRAPPED_PREPARATION_EXACT_CONSUMER_HOST_SOURCE');assert.equal(prerequisites.wrappedProductionHostSourceClosureSHA256,hash(JSON.stringify(hostSources)));return true;
}

/** V3 keeps failed preparation provenance distinct from read-only recovery.
 * The current consumer host digest is a root-authenticated P field, never a
 * historical runtime identity or a future producer digest embedded in code. */
export const WRAPPED_CLAIM_PROVENANCE_SCHEMA_V3='LIANUM_WRAPPED_CLAIM_STAGE_PROVENANCE_V3_RETAINED_PREPARATION';
export function validateWrappedStageProvenanceV3(value,currentHostSourceClosureSHA256){
 exactRecord(value,['schema','originalCompilationDriverSHA256','retainedProgramOrigins','constraints','statistics','preparation','proof','retainedPreparation']);assert.equal(value.schema,WRAPPED_CLAIM_PROVENANCE_SCHEMA_V3);bytes32(currentHostSourceClosureSHA256,true);
 const {retainedPreparation,...legacy}=value;validateWrappedStageProvenanceV2({...legacy,schema:WRAPPED_CLAIM_PROVENANCE_SCHEMA_V2});exactRecord(retainedPreparation,ROLES);
 for(const role of ROLES){const r=retainedPreparation[role];if(r===null)continue;
  assert.equal(role,'claim_ingress','WRAPPED_FIXED_CI51_PREPARATION_RECOVERY_ONLY');exactRecord(r,['format','readerSourceManifest','manifest','validationReceipt','originalHostSourceClosureSHA256','currentHostSourceClosureSHA256']);assert.equal(r.format,'WRAPPED_RETAINED_PREPARATION_REVALIDATION_V1');for(const k of ['readerSourceManifest','manifest','validationReceipt'])pin(r[k]);
  bytes32(r.originalHostSourceClosureSHA256,true);assert.equal(r.currentHostSourceClosureSHA256,currentHostSourceClosureSHA256,'WRAPPED_RETAINED_CURRENT_CONSUMER_HOST');assert.notEqual(r.originalHostSourceClosureSHA256,r.currentHostSourceClosureSHA256,'WRAPPED_RETAINED_EXPLICIT_SOURCE_TRANSITION');
 }return true;
}
