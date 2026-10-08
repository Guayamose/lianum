/** Fixed current V5 consumer of the exact retained I84 program/key. The V4
 * publication, role collector and proving entries remain byte-identical. */
import assert from 'node:assert/strict';
import { ROOT, SETTINGS } from '../../catalog.mjs';
import { hash, regular, assertABI } from '../../tooling/tooling.mjs';
import { join } from 'node:path';
import { NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256, assertNativeValueCompiledIdentity } from './native-value-v2-profile.mjs';
import { NATIVE_VALUE_LIVE_V2_SPEC, NATIVE_VALUE_LIVE_V2_SOURCE_VERSION, NATIVE_VALUE_LIVE_V2_KEY_SHA256,
 NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256 } from './native-value-live-v2-profile.mjs';
import { loadNativeValueDevDeploymentArtifactsV5, inspectRetainedNativeValueAdmissionForDevV5 }
 from '../../../../backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { nativeValueDevFinancialSourcePinsV5 } from '../../../../backend/src/operations/releases/native-value/native-value-dev-financial-source-pins-v5.mjs';
import { NATIVE_VALUE_DEV_RELEASE_V5 } from '../../../../backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs';
import { validateNativeValueDevReleaseV5, nativeValueDevDigestV5 } from '../../../../backend/src/operations/releases/native-value/native-value-dev-release-contract-v5.mjs';
export function assertNativeValueDevLiveSourcePinsV5(){
 assert.equal(arguments.length,0,'NATIVE_VALUE_DEV_I84_SOURCE_NO_OPTIONS');
 assert.ok(NATIVE_VALUE_DEV_RELEASE_V5,'NATIVE_VALUE_DEV_I84_RELEASE_UNPUBLISHED');
 const release=validateNativeValueDevReleaseV5(NATIVE_VALUE_DEV_RELEASE_V5),current=nativeValueDevFinancialSourcePinsV5();
 assert.deepEqual(current,release.sourceFiles,'NATIVE_VALUE_DEV_I84_CURRENT_SOURCE_PUBLICATION');
 assert.equal(nativeValueDevDigestV5(current),release.hostSourceClosureSHA256);
 return {releaseSHA256:nativeValueDevDigestV5(release),hostSourceClosureSHA256:release.hostSourceClosureSHA256,
  releaseRawSHA256:hash(regular(join(ROOT,'wallet-platform/modules/ops/native-value-dev-release-v5.mjs')))};
}
export async function loadNativeValueDevLiveArtifactsV5(){
 assert.equal(arguments.length,0,'NATIVE_VALUE_DEV_I84_NO_CALLER_OVERRIDE');
 const before=assertNativeValueDevLiveSourcePinsV5(),bundle=await loadNativeValueDevDeploymentArtifactsV5();
 const fixed=await inspectRetainedNativeValueAdmissionForDevV5();
 assert.equal(assertNativeValueCompiledIdentity(fixed.context),NATIVE_VALUE_LIVE_V2_SOURCE_VERSION);
 const {compiled,prepared,statistics}=fixed;
 assert.equal(hash(compiled.programBytes),NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256,'NV2_ACCEPTED_PROGRAM');
 assertABI(NATIVE_VALUE_LIVE_V2_SPEC,compiled.program);
 assert.equal(prepared.manifestSHA256,NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256,'NV2_ACCEPTED_KEY_MANIFEST');
 assert.equal(hash(prepared.key),NATIVE_VALUE_LIVE_V2_KEY_SHA256,'NV2_ACCEPTED_KEY');
 assert.deepEqual(prepared.manifest.settings,SETTINGS);assert.equal(prepared.manifest.maximumPages,65536);
 assert.equal(prepared.manifest.threads,1);assert.equal(statistics.manifest.stats.numGatesDyadic,2097152);
 assert.equal(prepared.manifest.actualKeyPublicCount,92);
 assert.deepEqual(Array.from({length:3},(_,i)=>'0x'+prepared.key.subarray(i*32,(i+1)*32).toString('hex')),
  [21,92,5].map(i=>'0x'+BigInt(i).toString(16).padStart(64,'0')),'NV2_KEY_HEADER');
 assert.deepEqual(fixed.context.toolchain,bundle.provenance.toolchain);assert.deepEqual(fixed.crs,bundle.provenance.crs);
 assert.equal(bundle.verifiers.admission.lineage.sourceVersion,fixed.context.sourceVersion);
 assert.equal(bundle.verifiers.admission.lineage.keySHA256,hash(prepared.key));
 assert.equal(bundle.verifiers.admission.lineage.programSHA256,hash(compiled.programBytes));
 assert.deepEqual(assertNativeValueDevLiveSourcePinsV5(),before,'NATIVE_VALUE_DEV_I84_SOURCE_CHANGED');
 return {classification:'REVIEWED_LOCAL_V5_ORIGINAL_I84_MATERIAL_NOT_NATIVE_CREDIT',
  sourceVersion:fixed.context.sourceVersion,program:compiled.program,compressed:compiled.compressed,key:prepared.key,crs:fixed.crs,
  keySHA256:NATIVE_VALUE_LIVE_V2_KEY_SHA256,keyManifestSHA256:prepared.manifestSHA256,
  compiledManifestSHA256:compiled.manifestSHA256,artifactSHA256:hash(compiled.programBytes),
  bytecodeSHA256:compiled.manifest.bytecodeSHA256,stats:statistics.manifest.stats,sourceClosure:before.hostSourceClosureSHA256};
}
