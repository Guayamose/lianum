/** Public readback from a relocated source bundle. Original programs, keys,
 * toolchain, CRS and historical compiler inputs remain byte authenticated.
 * I84 uses its sealed original publication and declared resources. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {resourceMode} from '@lianum/environment';
import {assertAdoptedSourceGeneration} from '@lianum/components/verification/current-sources';
import {inspectWrappedInstallationSourcesV2} from '@lianum/components/verification/wrapped-installation';
import {loadFundedPagedGraphArtifactsV3} from '@lianum/proofs/toolchain/paged-artifacts-v3';
import {loadRetainedI84ArtifactsV1} from '@lianum/proofs/tooling/retained-i84-artifacts-v1';

export function readPortableEconomicSources() {
  assert.equal(arguments.length,0,'PORTABLE_READBACK_NO_OPTIONS');
  assert.equal(resourceMode,'candidate','PORTABLE_READBACK_EXPLICIT_RESOURCES');
  const before=assertAdoptedSourceGeneration();
  const paged=loadFundedPagedGraphArtifactsV3(before.pagedManifestSHA256);
  assert.deepEqual(Object.keys(paged.roles),['reserve','fold','terminal','admission','withdraw']);
  const wrapped=inspectWrappedInstallationSourcesV2();
  assert.equal(wrapped.adoptedSourceGeneration,before.generation);
  const i84=loadRetainedI84ArtifactsV1();
  assert.equal(i84.context.spec.publicWords,84);
  assert.deepEqual(Object.keys(i84.proofs),['ethereum','base','arbitrum','bnb','tron']);
  assert.ok(Buffer.isBuffer(i84.prepared.key)&&Buffer.isBuffer(i84.compiled.programBytes));
  assert.deepEqual(assertAdoptedSourceGeneration(),before,'PORTABLE_READBACK_GENERATION_CHANGED');
  return Object.freeze({generation:before.generation,currentSources:before.sources,
    pagedRoles:Object.keys(paged.roles),wrappedOriginalSourceRows:wrapped.originalSourceCount,
    resourceMode,compiled:false,proofGenerated:false,financialExecution:false,
    nativeFixedPathReaderIncluded:false,retainedI84ReaderIncluded:true,
    i84PublicWords:84,i84FixtureProfiles:Object.keys(i84.proofs)});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(readPortableEconomicSources(),null,2)+'\n');
}
