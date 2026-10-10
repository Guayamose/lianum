/** The paged compiler's artifacts belong to its canonical fixed supervisor.
 * Runtime snapshots contain source copies, not another artifact generation or
 * another private graph/proof authority. Both layouts use the same originals. */
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const file=fileURLToPath(import.meta.url),canonical=file.endsWith('/packages/proofs/src/tooling/original-paged-artifacts-v3.mjs');
assert.ok(canonical||file.endsWith('/.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/original-paged-artifacts-v3.mjs'),'PAEG_PAGED_FIXED_ARTIFACT_GATEWAY');
const project=resolve(dirname(file),canonical?'../../../..':'../../../../..');
assert.equal(realpathSync(project),project,'PAEG_PAGED_PHYSICAL_ARTIFACT_ROOT');
const experiment=join(project,'experiments/engine/private-core-proof/funded-graph-paged-v3');
assert.equal(realpathSync(experiment),experiment,'PAEG_PAGED_PHYSICAL_ARTIFACT_ROOT');
const artifacts=await import(pathToFileURL(join(experiment,'artifacts.mjs')));
export const {PAEG_PAGED_ARTIFACT_DIRECTORY_V3,PAEG_PAGED_SPARSE_ENCODING_V3,PAEG_PAGED_WORDS_V3,loadFundedPagedGraphArtifactsV3,fundedPagedGraphSourcePinsV3}=artifacts;
export const Graph=await import(pathToFileURL(join(project,'packages/engine/src/execution/graph/funded-graph-paged-v3.mjs')));
const proofs=await import(pathToFileURL(join(experiment,'proof-client.mjs')));
export const {createFundedPagedGraphProofClientV3,readOriginalFundedPagedGraphProofResultV3}=proofs;
