/** Compilation evidence only, never an Aave source/deployment/private release. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {regular,hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
import {GENERIC_COMPILER_PIN} from '../../../../packages/engine/src/execution/local/local-deployment.mjs';
export const AAVE_COMPILATION_RESULT_V1='LIANUM_AAVE_COMPILATION_ONLY_RESULT_V1';
export const AAVE_COMPILATION_PROFILE_V1='OFFICIAL_AAVE_STATIC_NEW_COMPILATION_ONLY_V1';
const names=['BoundedAaveStaticExit','LocalAaveFlashYield','PrivateAaveStaticDelivery','StaticATokenLM'];
export function aaveCompilationProcessFailureV1(rows){return rows.some(row=>row.role!=='main-worker'||row.proofWorker===true)?'AAVE_COMPILATION_UNEXPECTED_CHILD':null;}
export function assertAaveCompilationArtifactsV1(build){
 assert.equal(build.compiler,GENERIC_COMPILER_PIN.version);assert.deepEqual(build.compilerPin,GENERIC_COMPILER_PIN);
 assert.deepEqual(build.settings,{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode'],'':['ast']}}});
 assert.deepEqual(Object.keys(build.artifacts).sort(),names);assert.equal(build.sourceRecords.length,35);
 assert.match(build.inputSHA256,/^[0-9a-f]{64}$/);assert.equal(new Set(build.sourceRecords.map(row=>row.path)).size,35);
 for(const row of build.sourceRecords){assert.match(row.sha256,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>0);}
 for(const artifact of Object.values(build.artifacts)){
  assert.ok(Array.isArray(artifact.abi));for(const [code,limit] of [[artifact.evm.bytecode.object,49152],[artifact.evm.deployedBytecode.object,24576]]){
   assert.match(code,/^[0-9a-f]+$/);assert.equal(code.length%2,0);assert.ok(code.length>0&&code.length/2<=limit,'AAVE_COMPILATION_EVM_CODE_LIMIT');
  }
  assert.ok(build.sourceASTs[artifact.sourceName]?.ast,'AAVE_COMPILATION_AST_REQUIRED');
 }
 return true;
}
export function assertAaveCompilationResultV1(value){
 assert.equal(value.format,AAVE_COMPILATION_RESULT_V1);assert.equal(value.profile,AAVE_COMPILATION_PROFILE_V1);
 assert.equal(value.phase,'completed');assert.equal(value.success,true);assert.equal(value.sourceUnchanged,true);
 assert.deepEqual(value.proofs,[]);assert.deepEqual(value.cleanup,{compilerReset:true,errors:[]});assert.equal(value.compilationCount,1);
 for(const key of ['proofAcceptanceEstablished','nativeNodesStarted','deploymentAcceptanceEstablished','privateGraphAcceptance','fullWalletAcceptance'])assert.equal(value[key],false);
 assert.match(value.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const directory=join(ROOT,'.local/evm-aave-compilation-only-v1','attempt-'+value.runId);
 for(const name of ['compiled.json','source-pins.json','receipt.json']){const raw=regular(join(directory,name));assert.equal(value.files[name].sha256,hash(raw));assert.equal(value.files[name].bytes,raw.length);}
 const compiled=JSON.parse(regular(join(directory,'compiled.json')));assertAaveCompilationArtifactsV1(compiled);
 assert.deepEqual(JSON.parse(regular(join(directory,'source-pins.json'))),value.sourcePins);
 const receipt=JSON.parse(regular(join(directory,'receipt.json')));
 assert.deepEqual(receipt,{format:'LIANUM_NEW_OFFICIAL_AAVE_COMPILATION_RECEIPT_V1',runId:value.runId,phase:'completed',compilationCount:1,
  compiler:GENERIC_COMPILER_PIN,inputSHA256:compiled.inputSHA256,compiledSHA256:value.files['compiled.json'].sha256,sourcePinsSHA256:value.files['source-pins.json'].sha256,
  sourceUnchanged:true,compilerReset:true,historicalArtifactRecovered:false,proofAcceptanceEstablished:false,nativeNodesStarted:false,privateGraphAcceptance:false});
 return {newOfficialAaveCompilationEstablished:true,proofAcceptanceEstablished:false,nativeNodesStarted:false,privateGraphAcceptance:false,fullWalletAcceptance:false};
}
