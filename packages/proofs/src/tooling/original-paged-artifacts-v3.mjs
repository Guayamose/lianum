/** Both source and compatibility callers use one canonical Graph/client.
 * The three literal imports are preserved explicitly by layout.canonicalImports;
 * retained experiment files are read as artifact evidence, never loaded as code. */
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as OriginalGraph from '@lianum/engine/execution/graph/funded-graph-paged-v3';
export {PAEG_PAGED_ARTIFACT_DIRECTORY_V3,PAEG_PAGED_SPARSE_ENCODING_V3,PAEG_PAGED_WORDS_V3,loadFundedPagedGraphArtifactsV3,fundedPagedGraphSourcePinsV3} from '@lianum/proofs/toolchain/paged-artifacts-v3';
export {createFundedPagedGraphProofClientV3,readOriginalFundedPagedGraphProofResultV3,readFundedPagedGraphProofClientStatusV4} from '@lianum/proofs/toolchain/paged-proof-client-v3';
const file=fileURLToPath(import.meta.url),canonical=file.endsWith('/packages/proofs/src/tooling/original-paged-artifacts-v3.mjs');
assert.ok(canonical||file.endsWith('/.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/original-paged-artifacts-v3.mjs'),'PAEG_PAGED_FIXED_ARTIFACT_GATEWAY');
const project=resolve(dirname(file),canonical?'../../../..':'../../../../..');
assert.equal(realpathSync(project),project,'PAEG_PAGED_PHYSICAL_ARTIFACT_ROOT');
export const Graph=OriginalGraph;
