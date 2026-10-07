/** Source-authored lightweight capability tests. No deployment, native node,
 * backend, proof, caller-supplied signer, or signing-message fixture is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalFlatOperator, createFlatOperatorQuorum, assertOwnedFlatOperatorQuorum,
  ownedFlatOperatorQuorumBindings, LOCAL_FLAT_OPERATOR_PROFILE } from './native-operators.mjs';

test('each bootstrap capability owns one distinct public identity and exposes only specialized operations', () => {
  const operators = [0, 1, 2, 3].map(signerIndex => createLocalFlatOperator({ signerIndex }));
  try {
    assert.equal(new Set(operators.map(operator => operator.publicKey.x)).size, 4);
    for (const [index, operator] of operators.entries()) {
      assert.equal(operator.profile, LOCAL_FLAT_OPERATOR_PROFILE); assert.equal(operator.signerIndex, index);
      assert.deepEqual(Object.keys(operator).sort(), ['profile', 'publicKey', 'signerIndex']);
      assert.match(operator.publicKey.x, /^[0-9a-f]{64}$/); assert.match(operator.publicKey.y, /^[0-9a-f]{64}$/);
      for (const name of ['privateKey', 'password', 'peers', 'sign', 'signFrame', 'signFacts', 'signDigest', 'exportKey'])
        assert.equal(operator[name], undefined);
      assert.throws(() => JSON.stringify(operator), /NOT_SERIALIZABLE/);
      assert.equal(operator.status().bound, false);
    }
    assert.throws(() => createFlatOperatorQuorum({ operators: operators.slice(0, 3) }), /NOT_BOUND/);
  } finally { operators.forEach(operator => operator.close()); }
});

test('a forged capability is rejected before a signer-index accessor is invoked', () => {
  let accessed = false;
  const forged = { get signerIndex() { accessed = true; throw new Error('unexpected getter'); } };
  assert.throws(() => createFlatOperatorQuorum({ operators: [forged, forged, forged] }), /OWNED_CAPABILITY/);
  assert.equal(accessed, false);
});

test('quorum identity rejects fabricated capabilities before caller bindings are read', () => {
  let accessed = false;
  const binding = { get runtime() { accessed = true; throw new Error('unexpected getter'); } };
  for (const capability of [undefined, null, {}, Object.freeze({ profile: LOCAL_FLAT_OPERATOR_PROFILE })]) {
    assert.throws(() => assertOwnedFlatOperatorQuorum(capability, binding), /OWNED_QUORUM/);
    assert.throws(() => ownedFlatOperatorQuorumBindings(capability, binding), /OWNED_QUORUM/);
  }
  assert.equal(accessed, false);
});

test('binding requires a genuine owned system and a failed attempt cannot be reset', async () => {
  const operator = createLocalFlatOperator({ signerIndex: 0 });
  const input = { runtime: {}, system: {}, bitcoin: {}, solana: {}, rules: [{}, {}], rulePaths: [{}, {}] };
  await assert.rejects(operator.bind(input), /BIND_FAILED/);
  assert.equal(operator.status().poisoned, true);
  await assert.rejects(operator.bind(input), /CLOSED_OR_POISONED/);
  operator.close();
});

test('bootstrap rejects extra key imports and invalid registry indexes', () => {
  assert.throws(() => createLocalFlatOperator({ signerIndex: 0, privateKey: 'caller material' }), /EXACT_FIELDS/);
  for (const signerIndex of [-1, 4, 0.5, '0', -0])
    assert.throws(() => createLocalFlatOperator({ signerIndex }), /INDEX/);
});
