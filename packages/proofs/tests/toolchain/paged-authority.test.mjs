/** No compiler/prover/network: authority identity and retained artifact rejection. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Graph from '@lianum/engine/execution/graph/funded-graph-paged-v3';
import * as gateway from '../../src/tooling/original-paged-artifacts-v3.mjs';
import * as client from '../../src/toolchain/paged-proof-client-v3.mjs';
import * as artifacts from '../../src/toolchain/paged-artifacts-v3.mjs';

test('the paged gateway exposes the canonical graph and proof authority', () => {
  assert.equal(gateway.Graph, Graph);
  assert.equal(gateway.createFundedPagedGraphProofClientV3, client.createFundedPagedGraphProofClientV3);
  assert.equal(gateway.readOriginalFundedPagedGraphProofResultV3, client.readOriginalFundedPagedGraphProofResultV3);
  assert.equal(gateway.loadFundedPagedGraphArtifactsV3, artifacts.loadFundedPagedGraphArtifactsV3);
  assert.throws(() => client.assertFundedPagedGraphProofClientV3({}, '0'.repeat(64)), /PAEG_PAGED_ORIGINAL_PROOF_CLIENT/);
  assert.throws(() => gateway.readOriginalFundedPagedGraphProofResultV3({}, {}, 'withdraw'), /PAEG_PAGED_ORIGINAL_PROOF_RESULT/);
});

test('the extracted reader rejects a caller-selected manifest before creating a prover', () => {
  assert.throws(() => artifacts.loadFundedPagedGraphArtifactsV3('not-a-reviewed-hash'), /PAEG_PAGED_REVIEWED_MANIFEST_REQUIRED/);
});
