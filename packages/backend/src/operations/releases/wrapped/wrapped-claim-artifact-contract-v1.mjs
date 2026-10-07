/** Fixed future-artifact contract, not an operational loader or owner factory.
 * All validators are data conformance only. Real future loader must authenticate
 * raw files and compiler/source/key/runtime lineage before issuing any brand. */
import assert from 'node:assert/strict';
import { WRAPPED_CLAIM_STAGE_HISTORY_V2 } from './wrapped-claim-stage-provenance-v2.mjs';
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { exactRecord, fixedArray, bytes32 } from '../../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { wrappedClaimRelationV1, validateWrappedClaimABIV1 } from '../../../../../proofs/src/wrapped-claims/metadata/wrapped-claim-profile-v1.mjs';
import { WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1, WRAPPED_CLAIM_PROOF_RELEASE_V1,
  WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1, WRAPPED_CLAIM_FIXED_DRIVER_V1, WRAPPED_CLAIM_REQUIRED_ARTIFACTS_V1 } from './wrapped-claim-release-v1.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const batchBytes = readFileSync(new URL('../../../proof-workers/wrapped-claim-constraint-batches-v1.json', import.meta.url));
const batches = frozenInput(JSON.parse(batchBytes).batches);
assert.deepEqual(batches.map(b => [b.id,b.cases.length]), [['nonce-core',30],['wrapped-registration',37],['discharge-compatibility',15]]);
for (const b of batches) assert.equal(sha(JSON.stringify(b.cases.map(({name,relation,expected,publicWords}) => ({expected,name,publicWords,relation})))),b.caseInventorySHA256);
const pinFields = ['sourceVersion','programSHA256','abiSHA256','compiledManifestSHA256','bytecodeSHA256'];
function compiledPins(raw, role) {
  const row = cloneInput(raw), spec = wrappedClaimRelationV1(role);
  exactRecord(row, ['relation','publicWords','sourceClosureSHA256','actualABI', ...pinFields]);
  assert.equal(row.relation,spec.name,'WRAPPED_PROGRAM_EXACT_RELATION');assert.equal(row.publicWords,spec.publicWords);
  assert.equal(row.sourceClosureSHA256,spec.sourceClosureSHA256,'WRAPPED_CURRENT_SOURCE_CLOSURE');
  for (const field of pinFields) bytes32(row[field],true);
  assert.equal(validateWrappedClaimABIV1(role,row.actualABI).abiSHA256,row.abiSHA256,'WRAPPED_ACTUAL_ABI_PIN');
  return row;
}
/** Complete future actual-program/ABI identities; source-declared shapes alone
 * still grant no provenance. Legacy CI and raw-registry nonce-V3 are rejected. */
export function validateWrappedClaimCompiledPinsV1(raw) {
  const input=cloneInput(raw);exactRecord(input,['claim_ingress','claim_discharge']);
  const result=Object.fromEntries(Object.entries(input).map(([role,value])=>[role,compiledPins(value,role)]));
  for(const field of pinFields)assert.notEqual(result.claim_ingress[field],result.claim_discharge[field],'WRAPPED_DISTINCT_PROGRAM_IDENTITIES');
  return frozenInput(result);
}
/** All 82 outcomes are required in original partition order. A timeout, loader
 * or host rejection cannot impersonate a negative main constraint execution. */
/** Runtime timing diagnostics are finite milliseconds, not witness integers.
 * Permit fractions only at the observed fixed report timing fields. All other
 * numbers retain the original safe-integer rule; no field is dropped/coerced. */
function cloneWrappedConstraintReports(raw) {
  const seen=new Set();
  const timing=path=>/^[0-2]$/.test(path[0]??'')&&(
    path.length===3&&path[1]==='resources'&&path[2]==='elapsedMilliseconds'||
    path.length===4&&path[1]==='result'&&path[2]==='metrics'&&['totalMilliseconds','otherMilliseconds'].includes(path[3])||
    path.length===5&&path[1]==='result'&&path[2]==='constraints'&&/^(?:[0-9]|[1-3][0-9])$/.test(path[3])&&path[4]==='milliseconds');
  const visit=(v,path)=>{
    if(timing(path)){assert.ok(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=600000&&!Object.is(v,-0),'WRAPPED_REPORT_TIMING');return;}
    if(v===null||['string','boolean'].includes(typeof v))return;
    if(typeof v==='number'){assert.ok(Number.isSafeInteger(v)&&!Object.is(v,-0),'INPUT_INTEGER');return;}
    assert.ok(v&&typeof v==='object'&&!types.isProxy(v)&&!seen.has(v),'INPUT_PLAIN_DATA');seen.add(v);
    if(Array.isArray(v))fixedArray(v,v.length);
    else{const keys=Reflect.ownKeys(v);assert.ok(keys.every(key=>typeof key==='string'));exactRecord(v,keys);}
    for(const [key,value]of Object.entries(v))visit(value,[...path,key]);seen.delete(v);
  };
  visit(raw,[]);return structuredClone(raw);
}
export function validateWrappedClaimConstraintReportsV1(raw, rawCompiled) {
  const reports=cloneWrappedConstraintReports(raw), compiled=validateWrappedClaimCompiledPinsV1(rawCompiled);fixedArray(reports,3);
  const runIds=new Set(), all=[];
  const expectedCompiled=Object.fromEntries(Object.values(compiled).map(p=>[p.relation,{
    compiledManifestSHA256:p.compiledManifestSHA256,artifactSHA256:p.programSHA256,bytecodeSHA256:p.bytecodeSHA256,
    abiSHA256:p.abiSHA256,relation:p.relation,sourceVersion:p.sourceVersion,
  }]));
  reports.forEach((pair,index)=>{
    exactRecord(pair,['result','resources']);const {result:r,resources:s}=pair,b=batches[index];
    const c=Object.values(compiled).find(p=>p.relation===b.relation);
    for(const item of [r,s]){
      assert.equal(item.phase,'completed','WRAPPED_CONSTRAINT_INCOMPLETE');assert.equal(item.mode,'constraints');
      assert.equal(item.relation,b.relation);assert.equal(item.batch,b.id);assert.equal(item.caseInventorySHA256,b.caseInventorySHA256);
      assert.equal(item.hostLimitsChanged,false);
    }
    assert.equal(r.runId,s.runId);assert.match(r.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(!runIds.has(r.runId),'WRAPPED_CONSTRAINT_RUN_REUSED');runIds.add(r.runId);
    assert.equal(s.exitCode,0);assert.equal(s.failure,null);assert.deepEqual(s.failures,[]);
    assert.equal(r.sourceVersion,c.sourceVersion);assert.equal(r.artifactSHA256,c.programSHA256);
    assert.equal(r.compiledManifestSHA256,c.compiledManifestSHA256);assert.equal(r.bytecodeSHA256,c.bytecodeSHA256);
    assert.deepEqual(r.actualCompiled,expectedCompiled[b.relation]);assert.deepEqual(r.actualCompiledByRelation,expectedCompiled);
    assert.deepEqual(r.constraintPartition,{name:b.id,caseInventorySHA256:b.caseInventorySHA256,selectedCases:b.cases.length,distinctPrepared:81,maximumCases:40});
    assert.equal(r.completeJobsValidatedAgainstActualABI,81);assert.equal(r.constraintCasesCompleted,b.cases.length);
    assert.equal(r.constraintBackendDestroyed,true);assert.equal(r.witnessPersisted,false);assert.equal(r.keyGenerated,false);assert.equal(r.proofGenerated,false);
    assert.deepEqual(r.constraintBackend,{version:'5.2.0',type:'Wasm',threads:1,skipSrsInit:true,maximumPages:32768});
    assert.equal(r.runtimePinsSHA256,s.runtimePinsSHA256);bytes32(r.runtimePinsSHA256,true);
    fixedArray(r.constraints,b.cases.length);
    r.constraints.forEach((row,j)=>{
      const expected=b.cases[j];assert.equal(row.name,expected.name);assert.equal(row.expected,expected.expected);
      const accepted=expected.expected==='accept';assert.equal(row.accepted,accepted,'WRAPPED_CONSTRAINT_WRONG_OUTCOME');
      if(accepted){assert.equal(row.failureLayer,null);assert.equal(row.constraintOrigin,null);}
      else {assert.equal(row.failureLayer,'constraint','WRAPPED_NEGATIVE_REQUIRES_MAIN_CONSTRAINT');
        assert.equal(row.constraintOrigin?.origin,'structured-acvm-execution-error');
        assert.ok(['unsatisfied-constraint','acvm-assertion','assertion-payload'].includes(row.constraintOrigin?.category),'WRAPPED_PINNED_ACVM_CATEGORY');
        assert.ok(Number.isSafeInteger(row.constraintOrigin.acirFunctionId)&&row.constraintOrigin.acirFunctionId>=0);
        assert.ok(Array.isArray(row.constraintOrigin.callStack)&&row.constraintOrigin.callStack.length>0&&row.constraintOrigin.callStack.length<=4096
          &&row.constraintOrigin.callStack.every(frame=>typeof frame==='string'&&/^[0-9]+(?:\.[0-9]+)?$/.test(frame)));
        assert.ok(Number.isSafeInteger(row.constraintOrigin.causeDepth)&&row.constraintOrigin.causeDepth>=0&&row.constraintOrigin.causeDepth<3);}
      all.push({relation:b.relation,name:row.name,expected:row.expected});
    });
  });
  assert.equal(all.length,82);const unique=new Map(all.map(r=>[r.name,r]));assert.equal(unique.size,81);
  assert.equal([...unique.values()].filter(r=>r.expected==='accept').length,12);
  return frozenInput({classification:'PUBLIC_REPORT_CONFORMANCE_NOT_ARTIFACT_OWNERSHIP',distinctCases:81,executions:82,authorityGranted:false});
}
export function inspectWrappedClaimOperationalReadinessV1() {
  assert.equal(arguments.length,0,'WRAPPED_READINESS_NO_OPTIONS');
  return frozenInput({profile:'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1',
    driverSourceManifestSHA256:WRAPPED_CLAIM_FIXED_DRIVER_V1,
    legacyDriverMeaning:'ORIGINAL_COMPILATION_DRIVER_NOT_CONSTRAINT_OR_FUTURE_PRODUCER',
    originalCompilationDriverSourceManifestSHA256:WRAPPED_CLAIM_STAGE_HISTORY_V2.originalCompilationDriverSHA256,
    constraintDriverSourceManifestSHA256:WRAPPED_CLAIM_STAGE_HISTORY_V2.constraintDriverSourceManifest.sha256,
    statisticsCandidateSourceManifestSHA256:WRAPPED_CLAIM_STAGE_HISTORY_V2.statisticsCandidateSourceManifest.sha256,
    stageAcceptance:'REQUIRES_ROOT_AUTHENTICATED_GENUINE_STAGE_RECEIPTS',
    operationalRelease:WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1,proofRelease:WRAPPED_CLAIM_PROOF_RELEASE_V1,
    deploymentRelease:WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1,
    operationalFactoryImplemented:true,activationEstablished:false,actualRuntimeAccepted:false,authorityGranted:false,requirements:[...WRAPPED_CLAIM_REQUIRED_ARTIFACTS_V1]});
}
