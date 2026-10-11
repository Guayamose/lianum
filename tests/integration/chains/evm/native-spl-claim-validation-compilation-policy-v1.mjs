/** Compilation evidence only, never an NativeSplClaimValidation source/deployment/private release. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {GENERIC_COMPILER_PIN} from '@lianum/engine/execution/local/local-deployment';
export {assertNativeSplClaimValidationCompilationArtifactsV1};
export const SPL_VALIDATION_COMPILATION_RESULT_V1='LIANUM_SPL_VALIDATION_COMPILATION_ONLY_RESULT_V1';
export const SPL_VALIDATION_COMPILATION_PROFILE_V1='NATIVE_SPL_CLAIM_VALIDATION_NEW_COMPILATION_ONLY_V1';
import {assertNativeSplClaimValidationCompilationArtifactsV1} from '../../../../packages/backend/src/operations/deployments/claims/native-spl-claim-validation-compilation-v1.mjs';
export function nativeSplClaimValidationCompilationProcessFailureV1(rows){return rows.some(row=>row.role!=='main-worker'||row.proofWorker===true)?'SPL_VALIDATION_COMPILATION_UNEXPECTED_CHILD':null;}
export function assertNativeSplClaimValidationCompilationResultV1(value){
 assert.equal(value.format,SPL_VALIDATION_COMPILATION_RESULT_V1);assert.equal(value.profile,SPL_VALIDATION_COMPILATION_PROFILE_V1);
 assert.equal(value.phase,'completed');assert.equal(value.success,true);assert.equal(value.sourceUnchanged,true);
 assert.deepEqual(value.proofs,[]);assert.deepEqual(value.cleanup,{compilerReset:true,errors:[]});assert.equal(value.compilationCount,1);
 for(const key of ['proofAcceptanceEstablished','nativeNodesStarted','deploymentAcceptanceEstablished','privateGraphAcceptance','fullWalletAcceptance'])assert.equal(value[key],false);
 assert.match(value.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const directory=join(ROOT,'.local/native-spl-claim-validation-compilation-only-v1','attempt-'+value.runId);
 for(const name of ['compiled.json','source-pins.json','receipt.json']){const raw=regular(join(directory,name));assert.equal(value.files[name].sha256,hash(raw));assert.equal(value.files[name].bytes,raw.length);}
 const compiled=JSON.parse(regular(join(directory,'compiled.json')));assertNativeSplClaimValidationCompilationArtifactsV1(compiled);
 assert.deepEqual(JSON.parse(regular(join(directory,'source-pins.json'))),value.sourcePins);
 const receipt=JSON.parse(regular(join(directory,'receipt.json')));
 assert.deepEqual(receipt,{format:'LIANUM_NEW_OFFICIAL_SPL_VALIDATION_COMPILATION_RECEIPT_V1',runId:value.runId,phase:'completed',compilationCount:1,
  compiler:GENERIC_COMPILER_PIN,inputSHA256:compiled.inputSHA256,compiledSHA256:value.files['compiled.json'].sha256,sourcePinsSHA256:value.files['source-pins.json'].sha256,
  sourceUnchanged:true,compilerReset:true,historicalArtifactRecovered:false,proofAcceptanceEstablished:false,nativeNodesStarted:false,privateGraphAcceptance:false});
 return {newNativeSplClaimValidationCompilationEstablished:true,proofAcceptanceEstablished:false,nativeNodesStarted:false,privateGraphAcceptance:false,fullWalletAcceptance:false};
}
