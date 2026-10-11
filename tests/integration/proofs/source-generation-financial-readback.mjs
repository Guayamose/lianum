/** Read current economic consumers and retained originals. No node, compiler,
 * proof, key generation, signing, deployment or financial execution is started. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assertAdoptedSourceGeneration} from '@lianum/components/verification/current-sources';
import {inspectWrappedInstallationSourcesV2} from '@lianum/components/verification/wrapped-installation';
import {loadFundedPagedGraphArtifactsV3} from '@lianum/proofs/toolchain/paged-artifacts-v3';
import {loadNativeValueDevDeploymentArtifactsV5,assertNativeValueArtifactBundle}
  from '../../../packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import {assertNativeValueDevLiveSourcePinsV5}
  from '../../../packages/backend/src/proving/native-value/metadata/native-value-dev-live-v5-artifacts.mjs';

export async function readAdoptedEconomicSources() {
  assert.equal(arguments.length,0,'ECONOMIC_READBACK_NO_OPTIONS');
  const before=assertAdoptedSourceGeneration();
  const paged=loadFundedPagedGraphArtifactsV3(before.pagedManifestSHA256);
  const bundle=await loadNativeValueDevDeploymentArtifactsV5();
  assertNativeValueArtifactBundle(bundle);
  assert.throws(()=>assertNativeValueArtifactBundle({...bundle}),/NATIVE_VALUE_FIXED_ARTIFACT_BUNDLE_REQUIRED/);
  const admission=assertNativeValueDevLiveSourcePinsV5();
  assert.equal(admission.adoptedSourceGeneration,before.generation);
  assert.equal(bundle.provenance.adoptedSourceGeneration,before.generation);
  const wrapped=inspectWrappedInstallationSourcesV2();
  assert.equal(wrapped.adoptedSourceGeneration,before.generation);
  assert.deepEqual(assertAdoptedSourceGeneration(),before,'ECONOMIC_READBACK_GENERATION_CHANGED');
  return Object.freeze({generation:before.generation,currentSources:before.sources,
    pagedRoles:Object.keys(paged.roles),nativeRoles:Object.keys(bundle.verifiers),
    wrappedOriginalSourceRows:wrapped.originalSourceCount,cloneRejected:true,
    compiled:false,proofGenerated:false,financialExecution:false});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await readAdoptedEconomicSources();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
