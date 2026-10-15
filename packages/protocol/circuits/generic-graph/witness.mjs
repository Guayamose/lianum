// ABI adapter for graph_opening, not a verifier. All returned witness fields are
// private owner/proof-worker material and must never enter executor packets.
import assert from 'node:assert/strict';
import { GRAPH_PROFILE } from '../../src/execution/graph/graph.mjs';

const bytes = hex => [...Buffer.from(hex, 'hex')];
const words = hex => {
  const buffer = Buffer.from(hex, 'hex');
  assert.equal(buffer.length, 32, 'PAEG_WITNESS_HASH');
  return Array.from({ length: 8 }, (_, i) => buffer.readUInt32BE(i * 4));
};

/** Accept only compileGraph's owner-side result; the circuit checks its opening. */
export function openingInputs(compiled) {
  const statement = compiled.authorizationStatement;
  const owner = compiled.ownerWitness;
  assert.equal(statement.profile, GRAPH_PROFILE.id, 'PAEG_WITNESS_PROFILE');
  assert.equal(GRAPH_PROFILE.capacity, 4, 'PAEG_WITNESS_CAPACITY');
  assert.equal(owner.nodes.length, owner.activeCount, 'PAEG_WITNESS_COUNT');
  const nodes = Array.from({ length: 4 }, (_, i) => owner.nodes[i]);
  const nodeHashes = field => nodes.map(node => node ? bytes(node[field]) : Array(32).fill(0));
  return {
    scope: words(statement.scope),
    policy: words(statement.policy),
    operation_id: words(statement.operationId),
    graph_commitment: words(statement.graphCommitment),
    expires_at: statement.expiresAt,
    reserved_commitment: words(statement.reservedCommitment),
    recovery_commitment: words(statement.recoveryCommitment),
    tree_root: words(statement.treeRoot),
    witness: {
      nonce: bytes(owner.nonce),
      active_count: owner.activeCount,
      node_ids: nodes.map(node => {
        const id = node ? [...Buffer.from(node.id, 'ascii')] : [];
        assert.ok(id.length <= 64, 'PAEG_WITNESS_ID');
        return [...id, ...Array(64 - id.length).fill(0)];
      }),
      node_id_lengths: nodes.map(node => node ? Buffer.byteLength(node.id, 'ascii') : 0),
      dependency_counts: nodes.map(node => node?.dependencyIndexes.length ?? 0),
      dependency_indexes: nodes.map(node => {
        const indexes = node?.dependencyIndexes ?? [];
        assert.ok(indexes.length <= 3, 'PAEG_WITNESS_DEPENDENCIES');
        return [...indexes, ...Array(3 - indexes.length).fill(0)];
      }),
      chain_domains: nodeHashes('chainDomain'),
      evidence_policies: nodeHashes('evidencePolicy'),
      action_commitments: nodeHashes('actionCommitment'),
      payout_commitments: nodeHashes('payoutCommitment'),
    },
  };
}
