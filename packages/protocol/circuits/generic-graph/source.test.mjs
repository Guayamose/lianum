// Fast source/encoding checks only. Actual Noir validation is a separate stage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderFraming } from './generate.mjs';
import { negativeFixtures, openingHashes, positiveFixtures } from './fixtures.mjs';

const golden = JSON.parse(readFileSync(new URL('./fixture-digests.json', import.meta.url), 'utf8'));
const hexWords = words => words.map(word => Number(word).toString(16).padStart(8, '0')).join('');

test('all profile shapes match saved wire vectors and independent ABI framing', () => {
  for (const fixture of positiveFixtures()) {
    assert.deepEqual(openingHashes(fixture.inputs), fixture.expected, fixture.name);
    assert.deepEqual({
      graphCommitment: fixture.expected.graphCommitment,
      treeRoot: fixture.expected.treeRoot,
    }, golden[fixture.name], fixture.name);
  }
});

test('one 57-field public ABI covers counts, dependencies and SHA ID boundaries', () => {
  const cases = positiveFixtures();
  assert.deepEqual([...new Set(cases.map(fixture => fixture.inputs.witness.active_count))].sort(), [1, 2, 3, 4]);
  for (const { inputs } of cases) {
    const { witness, ...statement } = inputs;
    assert.deepEqual(Object.keys(statement), [
      'scope', 'policy', 'operation_id', 'graph_commitment', 'expires_at',
      'reserved_commitment', 'recovery_commitment', 'tree_root',
    ]);
    assert.equal(Object.values(statement).flat().length, 57);
    assert.equal(witness.node_ids.length, 4);
    assert.equal(witness.dependency_indexes.length, 4);
  }
  const boundary = cases.find(fixture => fixture.name === 'id-length-boundaries');
  assert.deepEqual(boundary.inputs.witness.node_id_lengths, [1, 52, 53, 64]);
});

test('invalid structure vectors retain matching public commitments when intended', () => {
  const negatives = negativeFixtures();
  assert.equal(new Set(negatives.map(fixture => fixture.name)).size, negatives.length);
  assert.ok(negatives.some(fixture => fixture.name === 'forward-dependency'));
  assert.ok(negatives.some(fixture => fixture.name === 'duplicate-node-id'));
  for (const fixture of negatives.filter(fixture => fixture.digestRebound)) {
    const hashes = openingHashes(fixture.inputs);
    assert.equal(hexWords(fixture.inputs.graph_commitment), hashes.graphCommitment, fixture.name);
    assert.equal(hexWords(fixture.inputs.tree_root), hashes.treeRoot, fixture.name);
  }
});

test('negative inputs stay inside ABI integer ranges to exercise circuit constraints', () => {
  const uint = (value, bits) => {
    assert.ok(Number.isInteger(value) && value >= 0 && value < 2 ** bits, `invalid u${bits}: ${value}`);
  };
  for (const { inputs } of negativeFixtures()) {
    const { witness, expires_at, ...hashes } = inputs;
    for (const words of Object.values(hashes)) words.forEach(word => uint(word, 32));
    assert.ok(BigInt(expires_at) >= 0n && BigInt(expires_at) < 1n << 64n);
    for (const values of Object.values(witness)) {
      for (const value of [values].flat(3)) uint(value, 8);
    }
  }
});

test('checked-in Noir framing is deterministic and current', () => {
  assert.equal(readFileSync(new URL('./lib/src/framing.nr', import.meta.url), 'utf8'), renderFraming());
});
