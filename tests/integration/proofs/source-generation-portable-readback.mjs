/** Public readback from a relocated source bundle. Original programs, keys,
 * toolchain, CRS and historical compiler inputs remain byte authenticated.
 * I84 uses its sealed original publication and declared resources. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {resourceMode} from '@lianum/environment';
import {loadOriginalSolidityCompilerV1,GENERIC_COMPILER_PIN} from '@lianum/engine/execution/local/solidity-compiler-v1';
import {loadOriginalProtocolAbiToolsV1} from '@lianum/backend/defi/resources/official-protocol-v1';
import {assertAdoptedSourceGeneration} from '@lianum/components/verification/current-sources';
import {inspectWrappedInstallationSourcesV2} from '@lianum/components/verification/wrapped-installation';
import {loadFundedPagedGraphArtifactsV3} from '@lianum/proofs/toolchain/paged-artifacts-v3';
import {loadRetainedI84ArtifactsV1} from '@lianum/proofs/tooling/retained-i84-artifacts-v1';
import {selectFixedDeviceRootClaimFinancialProfileV3} from '../../../scripts/validation/device-root-native-claim-v3/flow.mjs';

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
  const compiler=loadOriginalSolidityCompilerV1();
  assert.equal(compiler.version,GENERIC_COMPILER_PIN.version);
  const sdk=loadOriginalProtocolAbiToolsV1();
  const abi=new sdk.Interface(['function transfer(address,uint256)']);
  const encoded=abi.encodeFunctionData('transfer',['0x'+'11'.repeat(20),7n]);
  assert.equal(encoded,'0xa9059cbb'+'11'.repeat(20).padStart(64,'0')+'7'.padStart(64,'0'));
  const claimProfile=selectFixedDeviceRootClaimFinancialProfileV3(['node','fixed','--spl-source']);
  assert.equal(claimProfile.entry,'run-spl-source.mjs');
  assert.equal(claimProfile.source,true);
  assert.equal(typeof claimProfile.create,'function');
  assert.deepEqual(assertAdoptedSourceGeneration(),before,'PORTABLE_READBACK_GENERATION_CHANGED');
  return Object.freeze({generation:before.generation,currentSources:before.sources,
    pagedRoles:Object.keys(paged.roles),wrappedOriginalSourceRows:wrapped.originalSourceCount,
    resourceMode,compiled:false,proofGenerated:false,financialExecution:false,
    nativeFixedPathReaderIncluded:false,retainedI84ReaderIncluded:true,
    i84PublicWords:84,i84FixtureProfiles:Object.keys(i84.proofs),
    originalSolidityCompilerLoaded:true,solcVersion:compiler.version,
    originalAbiToolsLoaded:true,ethersVersion:sdk.version,solidityCompiled:false,
    originalClaimDriverLoaded:true,claimProfileConstructorCalled:false});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(readPortableEconomicSources(),null,2)+'\n');
}
