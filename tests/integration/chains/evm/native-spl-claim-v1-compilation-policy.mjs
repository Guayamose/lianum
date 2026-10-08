/** Source/key/compiler preparation only; no proof or financial authority. */
import assert from 'node:assert/strict';
import {join,relative} from 'node:path';
import {ROOT,LOCAL} from '../../../../packages/proofs/src/catalog.mjs';
import {regular,hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
import {inspectNativeSplClaimV1PreparedBytes,assertNativeSplClaimV1Verifier,NATIVE_SPL_CLAIM_V1_ORIGINAL_PINS} from '../../../../packages/backend/src/operations/deployments/claims/native-spl-claim-v1-compilation.mjs';
export const SPL_CLAIM_V1_COMPILATION_RESULT='LIANUM_SPL_CLAIM_V1_COMPILATION_ONLY_RESULT_V1';
export const SPL_CLAIM_V1_COMPILATION_PROFILE='NEW_ORIGINAL_CI51_V1_CO42_COMPILATION_ONLY';
export const SPL_CLAIM_V1_COMPILATION_DEADLINE=1860000;
export function classifyNativeSplClaimV1Preparation(argv){
 const s=argv[1];if(s!==join(ROOT,'proof-workers/run-bounded.mjs')&&s!==join(ROOT,'proof-workers/worker.mjs'))return null;
 const worker=s.endsWith('/worker.mjs');assert.equal(argv.length,worker?5:4,'SPL_CLAIM_V1_FIXED_PUBLIC_PREPARATION_ARGV');assert.equal(argv[2],'native_claim_ingress');assert.ok(['compile','stats','prepare-key'].includes(argv[3]));
 if(worker)assert.match(argv[4],/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 return{role:worker?'flat-proof-worker':'spl-claim-v1-public-preparation',proofWorker:worker};
}
export function parseNativeSplClaimV1PreparationStatus(bytes,mode){
 assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=1048576,'SPL_CLAIM_V1_PUBLIC_STATUS_BYTES');assert.ok(['compile','stats','prepare-key'].includes(mode));
 const status=JSON.parse(bytes.toString('utf8'));assert.ok(status&&Object.getPrototypeOf(status)===Object.prototype);assert.deepEqual(Object.keys(status).sort(),['errorCode','mode','phase','relation','report','runId']);
 assert.equal(status.relation,'native_claim_ingress');assert.equal(status.mode,mode);assert.equal(status.phase,'completed');assert.equal(status.errorCode,null);assert.match(status.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(status.report,relative(ROOT,join(LOCAL,'attempts',status.runId,'resources.json')),'SPL_CLAIM_V1_PUBLIC_STATUS_REPORT');return status;
}
export function nativeSplClaimV1CompilationProcessFailure(rows){return rows.some(v=>!['main-worker','spl-claim-v1-public-preparation','flat-proof-worker'].includes(v.role)||v.proofWorker!== (v.role==='flat-proof-worker'))?'SPL_CLAIM_V1_UNEXPECTED_PROCESS':null;}
export function assertNativeSplClaimV1PreparationReceipt(row){
 assert.deepEqual(Object.keys(row).sort(),['files','mode','runId','status']);assert.ok(['compile','stats','prepare-key'].includes(row.mode));assert.match(row.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const status=parseNativeSplClaimV1PreparationStatus(Buffer.from(JSON.stringify(row.status)),row.mode);assert.equal(status.runId,row.runId,'SPL_CLAIM_V1_PUBLIC_STATUS_RUN');
 const directory=join(LOCAL,'attempts',row.runId),values={};for(const name of ['resources.json','result.json','runtime-pins.json']){const bytes=regular(join(directory,name));assert.deepEqual(row.files[name],{bytes:bytes.length,sha256:hash(bytes)});values[name]=JSON.parse(bytes);}
 const r=values['resources.json'],v=values['result.json'];assert.equal(r.runId,row.runId);assert.equal(v.runId,row.runId);for(const x of [r,v]){assert.equal(x.relation,'native_claim_ingress');assert.equal(x.mode,row.mode);assert.equal(x.phase,'completed');}
 assert.equal(r.exitCode,0);assert.equal(r.signal,null);assert.equal(r.failure,null);assert.deepEqual(r.failures,[]);assert.equal(r.lockPreserved,false);assert.equal(r.runtimePinsSHA256,row.files['runtime-pins.json'].sha256);assert.equal(v.proofGenerated??false,false);assert.equal(v.failure??null,null);
 return values;
}
export function assertNativeSplClaimV1CompilationResult(value){
 assert.equal(value.format,SPL_CLAIM_V1_COMPILATION_RESULT);assert.equal(value.profile,SPL_CLAIM_V1_COMPILATION_PROFILE);assert.equal(value.phase,'completed');assert.equal(value.success,true);assert.equal(value.sourceUnchanged,true);assert.equal(value.compilationCount,2);assert.deepEqual(value.proofs,[]);assert.deepEqual(value.cleanup,{preparationChildrenClosed:true,compilerReset:true,errors:[]});
 for(const field of ['historicalReportsRecreated','historicalCI51VkEqualityEstablished','proofAcceptanceEstablished','nativeNodesStarted','privateGraphAcceptance','fullWalletAcceptance'])assert.equal(value[field],false);
 assert.deepEqual(value.preparation.map(v=>v.mode),['compile','stats','prepare-key']);assert.equal(new Set(value.preparation.map(v=>v.runId)).size,3);for(const row of value.preparation)assertNativeSplClaimV1PreparationReceipt(row);
 const directory=join(ROOT,'.local/native-spl-claim-v1-compilation-only-v1','attempt-'+value.runId);for(const name of ['compiled.json','source-pins.json','receipt.json']){const raw=regular(join(directory,name));assert.deepEqual(value.files[name],{bytes:raw.length,sha256:hash(raw)});}
 const build=JSON.parse(regular(join(directory,'compiled.json'))),original=inspectNativeSplClaimV1PreparedBytes();assert.equal(build.format,'LIANUM_NEW_SPL_CLAIM_V1_VERIFIER_COMPILATION_V1');assert.deepEqual(build.toolchain,original.toolchain);assert.deepEqual(build.crs,original.crs);
 for(const role of ['CI51','CO42']){const p=original.roles[role],{row,compiled}=build.verifiers[role];assert.equal(row.relation,p.spec.name);assert.equal(row.publicWords,p.spec.publicWords);assert.equal(row.sourceVersion,p.context.sourceVersion);assert.equal(row.keySHA256,hash(p.prepared.key));assert.equal(row.keyHashField,p.prepared.manifest.keyHashField);assert.equal(row.soliditySHA256,hash(p.prepared.solidity));assert.deepEqual(row.lineage,{compiledManifestSHA256:p.compiled.manifestSHA256,keyManifestSHA256:p.prepared.manifestSHA256,statsManifestSHA256:p.stats.manifestSHA256,programSHA256:p.compiled.manifest.programSHA256,bytecodeSHA256:p.compiled.manifest.bytecodeSHA256,abiSHA256:p.compiled.manifest.abiSHA256});assertNativeSplClaimV1Verifier(row,compiled,p.prepared);}
 assert.deepEqual(JSON.parse(regular(join(directory,'source-pins.json'))),value.sourcePins);assert.deepEqual(JSON.parse(regular(join(directory,'receipt.json'))),{format:'LIANUM_NEW_ORIGINAL_SPL_CLAIM_V1_COMPILATION_RECEIPT_V1',runId:value.runId,phase:'completed',compilationCount:2,compiledSHA256:value.files['compiled.json'].sha256,sourcePinsSHA256:value.files['source-pins.json'].sha256,originalPins:NATIVE_SPL_CLAIM_V1_ORIGINAL_PINS,preparation:value.preparation,compilerReset:true,sourceUnchanged:true,historicalReportsRecreated:false,historicalCI51VkEqualityEstablished:false,proofAcceptanceEstablished:false,nativeNodesStarted:false,privateGraphAcceptance:false});
 return{newOriginalCi51V1VerifierCompilationEstablished:true,historicalCI51VkEqualityEstablished:false,proofAcceptanceEstablished:false,nativeNodesStarted:false,privateGraphAcceptance:false,fullWalletAcceptance:false};
}
