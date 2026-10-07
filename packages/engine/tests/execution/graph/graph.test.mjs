import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGraph, GRAPH_PROFILE } from '../../../src/execution/graph/graph.mjs';

const hash = value => value.toString(16).padStart(64, '0');
const node = (id, chain, dependencies = []) => ({
  id,
  chainDomain: hash(chain),
  evidencePolicy: hash(10 + chain),
  actionCommitment: hash(20 + chain),
  payoutCommitment: hash(30 + chain),
  dependsOn: dependencies,
});
const graph = nodes => ({
  version: 1,
  scope: hash(100),
  policy: hash(101),
  operationId: hash(102),
  expiresAt: '2000000000',
  reservedCommitment: hash(103),
  recoveryCommitment: hash(104),
  nonce: hash(105),
  nodes,
});
const commitment = input => compileGraph(input).authorizationStatement.graphCommitment;

test('one profile covers different active counts, causal order and fork/join', () => {
  const examples = [
    [node('sol', 1)],
    [node('sol', 1), node('btc', 2, ['sol'])],
    [node('btc', 2), node('sol', 1, ['btc'])],
    [node('sol-a', 1), node('btc', 2, ['sol-a']), node('sol-b', 1, ['btc'])],
    [node('fund', 1), node('left', 2, ['fund']), node('right', 1, ['fund']), node('join', 2, ['left', 'right'])],
  ];
  const compiled = examples.map(nodes => compileGraph(graph(nodes)));
  assert.ok(compiled.every(value => value.authorizationStatement.profile === GRAPH_PROFILE.id));
  assert.ok(compiled.every(value => value.ownerWitness.leaves.length === 4));
  assert.equal(new Set(compiled.map(value => value.authorizationStatement.graphCommitment)).size, examples.length);
  assert.equal(GRAPH_PROFILE.cryptographicAcceptance, false);
});

test('serialization is canonical but changing causal edges or value terms changes authorization', () => {
  const input = graph([node('sol', 1), node('btc', 2, ['sol'])]);
  const expected = commitment(input);
  assert.equal(commitment({ ...input, nodes: [...input.nodes].reverse() }), expected);
  for (const mutate of [
    value => { value.nodes[1].dependsOn = []; },
    value => { value.nodes[1].chainDomain = hash(9); },
    value => { value.nodes[1].evidencePolicy = hash(99); },
    value => { value.nodes[1].actionCommitment = hash(98); },
    value => { value.nodes[1].payoutCommitment = hash(97); },
    value => { value.expiresAt = '2000000001'; },
    value => { value.scope = hash(200); },
    value => { value.reservedCommitment = hash(201); },
    value => { value.recoveryCommitment = hash(202); },
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    assert.notEqual(commitment(changed), expected);
  }
});

test('invalid graphs cannot produce a capsule', () => {
  const cases = [
    [],
    [node('same', 1), node('same', 2)],
    [node('self', 1, ['self'])],
    [node('missing', 1, ['absent'])],
    [node('one', 1, ['two']), node('two', 2, ['one'])],
    [node('one', 1), node('two', 2, ['one', 'one'])],
    Array.from({ length: 5 }, (_, i) => node('node-' + i, i + 1)),
  ];
  for (const nodes of cases) assert.throws(() => compileGraph(graph(nodes)), /PAEG_/);
  assert.throws(() => compileGraph({ ...graph([node('one', 1)]), expiresAt: '0' }), /PAEG_EXPIRY/);
  assert.throws(() => compileGraph({ ...graph([node('one', 1)]), expiresAt: '18446744073709551616' }), /PAEG_EXPIRY/);
});

test('executor capsule excludes global identity, graph topology and sibling instructions', () => {
  const compiled = compileGraph(graph([node('sol', 1), node('btc', 2, ['sol'])]));
  const capsule = compiled.executorPacket('btc');
  assert.deepEqual(Object.keys(capsule).sort(), [
    'profile', 'scope', 'policy', 'expiresAt', 'localCommitment', 'dispatchId',
    'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment',
  ].sort());
  for (const key of ['graphCommitment', 'operationId', 'nodes', 'nonce', 'index', 'dependsOn', 'prerequisites']) {
    assert.equal(Object.hasOwn(capsule, key), false);
  }
  assert.notEqual(capsule.dispatchId, compiled.executorPacket('sol').dispatchId);
  assert.throws(() => compiled.executorPacket('absent'), /PAEG_EXECUTOR_NODE/);
});

test('another operation or salt cannot reuse local commitments and dispatch identifiers', () => {
  const original = graph([node('one', 1)]);
  const first = compileGraph(original);
  for (const field of ['operationId', 'nonce', 'scope', 'policy']) {
    const second = compileGraph({ ...original, [field]: hash(999) });
    assert.notEqual(second.executorPacket('one').localCommitment, first.executorPacket('one').localCommitment);
    assert.notEqual(second.executorPacket('one').dispatchId, first.executorPacket('one').dispatchId);
  }
});

test('mutation of input or exported witness cannot alter retained executor terms', () => {
  const input = graph([node('one', 1)]);
  const compiled = compileGraph(input);
  const expected = compiled.executorPacket('one');
  input.scope = hash(888);
  input.policy = hash(889);
  input.expiresAt = '9';
  input.nodes[0].actionCommitment = hash(890);
  compiled.ownerWitness.nodes[0].actionCommitment = hash(891);
  const request = compiled.proofRequest('one');
  request.node.actionCommitment = hash(892);
  assert.deepEqual(compiled.executorPacket('one'), expected);
  assert.equal(compiled.proofRequest('one').node.actionCommitment, hash(21));
});


test('same local instructions in a changed graph cannot reuse readiness or dispatch identity', () => {
  const original = graph([node('sol', 1), node('btc', 2, ['sol'])]);
  const first = compileGraph(original);
  for (const mutate of [
    value => { value.nodes[0].actionCommitment = hash(501); },
    value => { value.nodes[0].payoutCommitment = hash(502); },
    value => { value.reservedCommitment = hash(503); },
    value => { value.recoveryCommitment = hash(504); },
    value => { value.expiresAt = '2000000002'; },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    const second = compileGraph(changed);
    assert.equal(second.proofRequest('btc').node.commitment, first.proofRequest('btc').node.commitment);
    assert.notEqual(second.executorPacket('btc').localCommitment, first.executorPacket('btc').localCommitment);
    assert.notEqual(second.executorPacket('btc').dispatchId, first.executorPacket('btc').dispatchId);
  }
});
