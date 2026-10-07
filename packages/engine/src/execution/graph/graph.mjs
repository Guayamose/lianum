/**
 * Owner-side encoding for the bounded generic PAEG profile.
 *
 * This module builds commitments and scoped packets. It does not verify a ZK
 * proof or establish native truth. A profile needs separately pinned circuit
 * artifacts and settlement enforcement before it can authorize a native run.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const GRAPH_PROFILE = Object.freeze({
  id: 'LIANUM_PAEG_GRAPH_4_V1',
  version: 1,
  capacity: 4,
  treeDepth: 2,
  cryptographicAcceptance: false,
});

const ZERO_HASH = '0'.repeat(64);
const MAX_U64 = (1n << 64n) - 1n;
const NODE_FIELDS = [
  'id', 'chainDomain', 'evidencePolicy', 'actionCommitment',
  'payoutCommitment', 'dependsOn',
];
const GRAPH_FIELDS = [
  'version', 'scope', 'policy', 'operationId', 'expiresAt',
  'reservedCommitment', 'recoveryCommitment', 'nonce', 'nodes',
];

function exactObject(value, fields, code) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), code);
}

function hashBytes(value, code, allowZero = false) {
  assert.equal(typeof value, 'string', code);
  assert.match(value, /^[0-9a-f]{64}$/, code);
  assert.ok(allowZero || value !== ZERO_HASH, code);
  return Buffer.from(value, 'hex');
}

function unsigned64(value, code) {
  assert.equal(typeof value, 'string', code);
  assert.ok(value.length <= 20, code);
  assert.match(value, /^(0|[1-9][0-9]*)$/, code);
  const number = BigInt(value);
  assert.ok(number <= MAX_U64, code);
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64BE(number);
  return encoded;
}

/** Every field has an explicit byte length; JSON is never a hash encoding. */
function digest(tag, values) {
  const hasher = createHash('sha256');
  for (const value of [Buffer.from(tag, 'utf8'), ...values]) {
    assert.ok(Buffer.isBuffer(value), 'PAEG_ENCODING_BYTES');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length);
    hasher.update(length);
    hasher.update(value);
  }
  return hasher.digest();
}

function pair(left, right) {
  return digest('LIANUM/PAEG/tree/1', [left, right]);
}

function topologicalNodes(nodes) {
  assert.ok(Array.isArray(nodes), 'PAEG_NODES');
  assert.ok(nodes.length >= 1 && nodes.length <= GRAPH_PROFILE.capacity, 'PAEG_CAPACITY');
  const byId = new Map();
  for (const node of nodes) {
    exactObject(node, NODE_FIELDS, 'PAEG_NODE_FIELDS');
    assert.equal(typeof node.id, 'string', 'PAEG_NODE_ID');
    assert.match(node.id, /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'PAEG_NODE_ID');
    assert.ok(!byId.has(node.id), 'PAEG_DUPLICATE_NODE');
    assert.ok(Array.isArray(node.dependsOn), 'PAEG_DEPENDENCIES');
    assert.ok(node.dependsOn.every(id => typeof id === 'string'), 'PAEG_DEPENDENCY_ID');
    assert.equal(new Set(node.dependsOn).size, node.dependsOn.length, 'PAEG_DUPLICATE_EDGE');
    for (const field of ['chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment']) {
      hashBytes(node[field], 'PAEG_NODE_' + field);
    }
    byId.set(node.id, node);
  }
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      assert.ok(dependency !== node.id && byId.has(dependency), 'PAEG_UNKNOWN_OR_SELF_EDGE');
    }
  }

  // Canonical topological order is independent of caller array order. Changing
  // causal edges changes commitments; merely reordering the input list does not.
  const remaining = new Set(byId.keys());
  const complete = new Set();
  const ordered = [];
  while (remaining.size) {
    const ready = [...remaining].filter(id => byId.get(id).dependsOn.every(p => complete.has(p))).sort();
    assert.ok(ready.length, 'PAEG_CYCLE');
    for (const id of ready) {
      ordered.push(byId.get(id));
      remaining.delete(id);
      complete.add(id);
    }
  }
  return ordered;
}

function merklePath(leaves, index) {
  const first = leaves[index ^ 1];
  const otherPair = index < 2 ? pair(leaves[2], leaves[3]) : pair(leaves[0], leaves[1]);
  return [first.toString('hex'), otherPair.toString('hex')];
}

/** Compile private owner input; never pass the resulting owner witness to an executor. */
export function compileGraph(input) {
  exactObject(input, GRAPH_FIELDS, 'PAEG_GRAPH_FIELDS');
  assert.equal(input.version, GRAPH_PROFILE.version, 'PAEG_VERSION');
  const scope = hashBytes(input.scope, 'PAEG_SCOPE');
  const policy = hashBytes(input.policy, 'PAEG_POLICY');
  const operationId = hashBytes(input.operationId, 'PAEG_OPERATION_ID');
  const expiresAt = unsigned64(input.expiresAt, 'PAEG_EXPIRY');
  assert.ok(BigInt(input.expiresAt) > 0n, 'PAEG_EXPIRY');
  const reserved = hashBytes(input.reservedCommitment, 'PAEG_RESERVED');
  const recovery = hashBytes(input.recoveryCommitment, 'PAEG_RECOVERY');
  const nonce = hashBytes(input.nonce, 'PAEG_OWNER_NONCE');
  const ordered = topologicalNodes(input.nodes);
  const indexes = new Map(ordered.map((node, index) => [node.id, index]));
  const nodes = ordered.map((node, index) => {
    const dependencyIndexes = node.dependsOn.map(id => indexes.get(id)).sort((a, b) => a - b);
    assert.ok(dependencyIndexes.every(i => i < index), 'PAEG_TOPOLOGICAL_ORDER');
    const dependencyMask = dependencyIndexes.reduce((mask, i) => mask | (1 << i), 0);
    const salt = digest('LIANUM/PAEG/node-salt/1', [nonce, Buffer.from(node.id)]);
    const commitment = digest('LIANUM/PAEG/node/1', [
      scope, policy, operationId, Buffer.from([index, dependencyMask]),
      hashBytes(node.chainDomain, 'PAEG_CHAIN_DOMAIN'),
      hashBytes(node.evidencePolicy, 'PAEG_EVIDENCE_POLICY'),
      hashBytes(node.actionCommitment, 'PAEG_ACTION_COMMITMENT'),
      hashBytes(node.payoutCommitment, 'PAEG_PAYOUT_COMMITMENT'), salt,
    ]);
    return { ...node, dependsOn: [...node.dependsOn].sort(), index, dependencyIndexes,
      dependencyMask, salt: salt.toString('hex'), commitment: commitment.toString('hex') };
  });
  const leaves = nodes.map(node => Buffer.from(node.commitment, 'hex'));
  while (leaves.length < GRAPH_PROFILE.capacity) {
    leaves.push(digest('LIANUM/PAEG/empty-node/1', [scope, policy, operationId, Buffer.from([leaves.length]), nonce]));
  }
  const treeRoot = pair(pair(leaves[0], leaves[1]), pair(leaves[2], leaves[3]));
  const graphCommitment = digest('LIANUM/PAEG/graph/1', [
    Buffer.from(GRAPH_PROFILE.id), scope, policy, operationId, expiresAt,
    reserved, recovery, treeRoot, Buffer.from([nodes.length]), nonce,
  ]).toString('hex');

  const authorizationStatement = Object.freeze({
    profile: GRAPH_PROFILE.id,
    scope: input.scope,
    policy: input.policy,
    operationId: input.operationId,
    graphCommitment,
    treeRoot: treeRoot.toString('hex'),
    expiresAt: input.expiresAt,
    reservedCommitment: input.reservedCommitment,
    recoveryCommitment: input.recoveryCommitment,
  });
  const ownerWitness = {
    nonce: input.nonce,
    activeCount: nodes.length,
    treeRoot: treeRoot.toString('hex'),
    nodes,
    leaves: leaves.map(value => value.toString('hex')),
  };

  return Object.freeze({
    authorizationStatement,
    ownerWitness: structuredClone(ownerWitness),
    proofRequest(id) {
      const node = nodes.find(value => value.id === id);
      assert.ok(node, 'PAEG_EXECUTOR_NODE');
      // This request is private input for a scoped proof worker. It is not an
      // execution capsule or a public settlement statement.
      return structuredClone({
        statement: authorizationStatement,
        node,
        membership: { treeRoot: treeRoot.toString('hex'), siblings: merklePath(leaves, node.index) },
        prerequisites: node.dependencyIndexes.map(index => ({ index, commitment: nodes[index].commitment })),
      });
    },
    executorPacket(id) {
      const node = nodes.find(value => value.id === id);
      assert.ok(node, 'PAEG_EXECUTOR_NODE');
      const localCommitment = digest('LIANUM/PAEG/local-capability/1', [
        Buffer.from(graphCommitment, 'hex'), Buffer.from(node.commitment, 'hex'),
        Buffer.from(node.salt, 'hex'),
      ]);
      const dispatchId = digest('LIANUM/PAEG/dispatch/1', [
        scope, policy, localCommitment, Buffer.from(node.salt, 'hex'),
      ]).toString('hex');
      // A native signer receives neither graph identity nor topology. Its
      // verified readiness proof must bind these exact local terms and current
      // state. This unverified packet by itself never authorizes dispatch.
      return Object.freeze({
        profile: GRAPH_PROFILE.id,
        scope: authorizationStatement.scope,
        policy: authorizationStatement.policy,
        expiresAt: authorizationStatement.expiresAt,
        localCommitment: localCommitment.toString('hex'),
        dispatchId,
        chainDomain: node.chainDomain,
        evidencePolicy: node.evidencePolicy,
        actionCommitment: node.actionCommitment,
        payoutCommitment: node.payoutCommitment,
      });
    },
  });
}
