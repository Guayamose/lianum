// Public deterministic examples for later real Noir/ACVM validation.
// Hashing these examples on the host does not validate the Noir relation.
import { createHash } from 'node:crypto';
import { compileGraph, GRAPH_PROFILE } from '../../src/execution/graph/graph.mjs';
import { openingInputs } from './witness.mjs';

const hash = label => createHash('sha256').update(`PAEG source fixture: ${label}`).digest('hex');
const b = hex => Buffer.from(hex, 'hex');
const node = (id, dependsOn = [], domain = 'chain-A') => ({
  id, dependsOn,
  chainDomain: hash(domain),
  evidencePolicy: hash(`legacy-trusted:${domain}`),
  actionCommitment: hash(`action:${id}`),
  payoutCommitment: hash(`payout:${id}`),
});
const graph = nodes => ({
  version: 1,
  scope: hash('scope'), policy: hash('policy'), operationId: hash('operation'),
  expiresAt: '1800000000', reservedCommitment: hash('reserved'),
  recoveryCommitment: hash('recovery'), nonce: hash('nonce'), nodes,
});

export function positiveFixtures() {
  const repeatedA = node('a');
  const repeatedB = { ...node('b'), actionCommitment: repeatedA.actionCommitment };
  const cases = [
    ['single', [node('a')]],
    ['two-independent', [node('z', [], 'chain-B'), node('a')]],
    ['three-reversed-chain', [node('c', ['b'], 'chain-C'), node('b', ['a'], 'chain-A'), node('a')]],
    ['four-fan-in', [node('d', ['c', 'a', 'b'], 'chain-B'), node('c', ['a']), node('b', ['a'], 'chain-C'), node('a')]],
    // Salt frame is 67 + ID length bytes. 52/53 cross SHA's padding boundary.
    ['id-length-boundaries', [node('d'.repeat(64)), node('c'.repeat(53)), node('b'.repeat(52)), node('a')]],
    ['repeated-action-obligations', [repeatedA, repeatedB]],
  ];
  return cases.map(([name, nodes]) => {
    const input = graph(nodes);
    const compiled = compileGraph(input);
    return {
      name, input,
      inputs: openingInputs(compiled),
      expected: {
        graphCommitment: compiled.authorizationStatement.graphCommitment,
        treeRoot: compiled.ownerWitness.treeRoot,
        leaves: compiled.ownerWitness.leaves,
        salts: compiled.ownerWitness.nodes.map(value => value.salt),
        localCapabilities: compiled.ownerWitness.nodes.map(value => compiled.executorPacket(value.id).localCommitment),
        dispatchIds: compiled.ownerWitness.nodes.map(value => compiled.executorPacket(value.id).dispatchId),
      },
    };
  });
}

export function frameHash(tag, values) {
  const hash = createHash('sha256');
  for (const part of [Buffer.from(tag, 'utf8'), ...values]) {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(part.length);
    hash.update(size).update(part);
  }
  return hash.digest();
}

const fromWords = words => {
  const out = Buffer.alloc(32);
  words.forEach((word, i) => out.writeUInt32BE(Number(word), i * 4));
  return out;
};
const toWords = bytes => Array.from({ length: 8 }, (_, i) => bytes.readUInt32BE(i * 4));

/** Independent ABI-shaped framing oracle, deliberately without validity checks.
 * It lets negative fixtures have a correct digest yet violate a DAG invariant.
 * It is test support only and must not become an acceptance implementation.
 */
export function openingHashes(inputs) {
  const w = inputs.witness;
  const common = [fromWords(inputs.scope), fromWords(inputs.policy), fromWords(inputs.operation_id)];
  const nonce = Buffer.from(w.nonce);
  const salts = [], leaves = [], localCapabilities = [], dispatchIds = [];
  for (let i = 0; i < 4; i++) {
    if (i < w.active_count) {
      const salt = frameHash('LIANUM/PAEG/node-salt/1', [nonce, Buffer.from(w.node_ids[i].slice(0, w.node_id_lengths[i]))]);
      salts.push(salt.toString('hex'));
      const mask = w.dependency_indexes[i].slice(0, w.dependency_counts[i]).reduce((value, index) => value | (1 << index), 0);
      leaves.push(frameHash('LIANUM/PAEG/node/1', [
        ...common, Buffer.from([i, mask]), Buffer.from(w.chain_domains[i]),
        Buffer.from(w.evidence_policies[i]), Buffer.from(w.action_commitments[i]),
        Buffer.from(w.payout_commitments[i]), salt,
      ]));
    } else {
      leaves.push(frameHash('LIANUM/PAEG/empty-node/1', [...common, Buffer.from([i]), nonce]));
    }
  }
  const pair = (a, b) => frameHash('LIANUM/PAEG/tree/1', [a, b]);
  const treeRoot = pair(pair(leaves[0], leaves[1]), pair(leaves[2], leaves[3]));
  const expires = Buffer.alloc(8);
  expires.writeBigUInt64BE(BigInt(inputs.expires_at));
  const graphCommitment = frameHash('LIANUM/PAEG/graph/1', [
    Buffer.from(GRAPH_PROFILE.id), ...common, expires,
    fromWords(inputs.reserved_commitment), fromWords(inputs.recovery_commitment),
    treeRoot, Buffer.from([w.active_count]), nonce,
  ]);
  for (let i = 0; i < Math.min(w.active_count, 4); i++) {
    const local = frameHash('LIANUM/PAEG/local-capability/1', [graphCommitment, leaves[i], b(salts[i])]);
    localCapabilities.push(local.toString('hex'));
    dispatchIds.push(frameHash('LIANUM/PAEG/dispatch/1', [common[0], common[1], local, b(salts[i])]).toString('hex'));
  }
  return {
    graphCommitment: graphCommitment.toString('hex'), treeRoot: treeRoot.toString('hex'),
    leaves: leaves.map(leaf => leaf.toString('hex')), salts, localCapabilities, dispatchIds,
  };
}

export function negativeFixtures() {
  const positives = positiveFixtures();
  const byName = new Map(positives.map(fixture => [fixture.name, fixture]));
  const cases = [
    ['wrong-public-graph', 'single', false, x => { x.graph_commitment[0] = (x.graph_commitment[0] ^ 1) >>> 0; }],
    ['wrong-public-tree-root', 'single', false, x => { x.tree_root[0] = (x.tree_root[0] ^ 1) >>> 0; }],
    ['wrong-expiry-binding', 'single', false, x => { x.expires_at = String(BigInt(x.expires_at) + 1n); }],
    ['wrong-payout-binding', 'single', false, x => { x.witness.payout_commitments[0][0] ^= 1; }],
    ['wrong-domain-binding', 'single', false, x => { x.witness.chain_domains[0][0] ^= 1; }],
    ['wrong-evidence-policy-binding', 'single', false, x => { x.witness.evidence_policies[0][0] ^= 1; }],
    ['forward-dependency', 'four-fan-in', true, x => { x.witness.dependency_counts[0] = 1; x.witness.dependency_indexes[0][0] = 1; }],
    ['self-dependency', 'four-fan-in', true, x => { x.witness.dependency_indexes[1][0] = 1; }],
    ['duplicate-dependency', 'four-fan-in', true, x => { x.witness.dependency_indexes[3] = [0, 0, 2]; }],
    ['unsorted-dependency', 'four-fan-in', true, x => { x.witness.dependency_indexes[3] = [1, 0, 2]; }],
    ['duplicate-node-id', 'four-fan-in', true, x => { x.witness.node_ids[1] = [...x.witness.node_ids[0]]; }],
    ['invalid-node-id', 'single', true, x => { x.witness.node_ids[0][0] = 47; }],
    ['nonzero-id-padding', 'single', true, x => { x.witness.node_ids[0][1] = 65; }],
    ['nonzero-inactive-node', 'single', true, x => { x.witness.action_commitments[3][0] = 1; }],
    ['nonzero-unused-dependency', 'single', true, x => { x.witness.dependency_indexes[0][2] = 1; }],
    ['zero-active-count', 'single', true, x => { x.witness.active_count = 0; }],
    ['over-capacity', 'four-fan-in', false, x => { x.witness.active_count = 5; }],
    ['zero-domain', 'single', true, x => { x.witness.chain_domains[0] = Array(32).fill(0); }],
    ['zero-nonce', 'single', true, x => { x.witness.nonce = Array(32).fill(0); }],
  ];
  return cases.map(([name, source, rebind, mutate]) => {
    const inputs = structuredClone(byName.get(source).inputs);
    mutate(inputs);
    if (rebind) {
      const hashes = openingHashes(inputs);
      inputs.graph_commitment = toWords(b(hashes.graphCommitment));
      inputs.tree_root = toWords(b(hashes.treeRoot));
    }
    return { name, source, digestRebound: rebind, inputs };
  });
}
