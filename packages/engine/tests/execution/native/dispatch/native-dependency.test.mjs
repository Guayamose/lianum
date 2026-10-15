import assert from 'node:assert/strict';
import test from 'node:test';
import { NATIVE_DEPENDENCY_PUBLIC_INPUT_COUNT, prepareNativeDependency } from '../../../../src/execution/native/dispatch/native-dependency.mjs';
import { dependencyCapsuleCommitment } from '../../../../src/execution/native/dispatch/native-capsules.mjs';
import { boundedListDigest, snapshotDigest } from '../../../../src/execution/native/state/native-state.mjs';
import { positiveFixtures, negativeFixtures, syntheticDependencyRequest } from
  '../../../../../proofs/programs/generic-native/dependency-fixtures.mjs';

// These are light host schema/privacy checks. They do not execute Noir and are
// never evidence of native admission, current chain truth, or proof acceptance.
const ZERO = '0'.repeat(64);
const other = 'ab'.repeat(32);
const copy = value => structuredClone(value);
const bindSnapshot = input => { input.snapshotDigest = snapshotDigest(input.snapshot); };
const bindCapsule = input => {
  input.packet.dependencyCapsuleCommitment = dependencyCapsuleCommitment(input.packet, input.packet.dependencyCapsule);
};
const publicKeys = ['hub_domain', 'registry_commitment', 'context', 'target_context',
  'dependency_capsule_commitment', 'snapshot_digest', 'valid_from', 'valid_until'];
const privateKeys = ['dependency', 'snapshot', 'predecessor_receipts', 'receipt_siblings', 'receipt_indexes', 'revoked_entries'];

test('P50 composition preserves ABI order, typed widths, detached inputs and scoped receipt paths', () => {
  for (const count of [0, 3]) {
    const request = syntheticDependencyRequest(count), before = copy(request);
    const { inputs, expectedPublicInputs } = prepareNativeDependency(request);
    assert.deepEqual(request, before);
    assert.equal(NATIVE_DEPENDENCY_PUBLIC_INPUT_COUNT, 50);
    assert.equal(expectedPublicInputs.length, 50);
    assert.deepEqual(Object.keys(inputs), [...publicKeys, ...privateKeys]);
    assert.deepEqual(expectedPublicInputs, publicKeys.flatMap(key => inputs[key]));
    assert.ok(expectedPublicInputs.every(value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)));
    for (const field of publicKeys.slice(0, 6)) {
      assert.equal(inputs[field].length, 8);
      assert.ok(inputs[field].every(value => BigInt(value) <= 0xffff_ffffn));
    }
    assert.equal(inputs.snapshot.pool.length, 20);
    assert.equal(inputs.predecessor_receipts.length, 3);
    assert.equal(inputs.receipt_siblings.length, 3);
    assert.equal(inputs.revoked_entries.length, 64);
    if (count) {
      assert.deepEqual(inputs.dependency.predecessors.map(source => source.source_slot), [0, 1, 2]);
      assert.deepEqual(inputs.receipt_indexes, ['3', '4', '5']);
    }
    inputs.dependency.capsule_salt[0] ^= 1;
    inputs.snapshot.hub_domain[0] ^= 1;
    inputs.receipt_siblings[0][0][0] ^= 1;
    assert.deepEqual(request, before);
    assert.deepEqual(prepareNativeDependency(request).inputs, positiveFixtures()[count ? 1 : 0].inputs);
  }
});

test('unused predecessor, receipt, index and path slots are canonical zero', () => {
  const { inputs } = prepareNativeDependency(syntheticDependencyRequest(0));
  for (let i = 0; i < 3; i++) {
    assert.equal(inputs.dependency.predecessors[i].source_slot, 0);
    for (const [key, value] of Object.entries(inputs.dependency.predecessors[i])) {
      if (key !== 'source_slot') assert.deepEqual(value, Array(32).fill(0));
    }
    for (const [key, value] of Object.entries(inputs.predecessor_receipts[i])) {
      assert.deepEqual(value, key === 'valid_from' || key === 'valid_until' ? '0' : Array(32).fill(0));
    }
    assert.equal(inputs.receipt_indexes[i], '0');
    assert.deepEqual(inputs.receipt_siblings[i], Array.from({ length: 6 }, () => Array(32).fill(0)));
  }
});

test('private role boundaries reject graph, local/action material, nk, keys and arbitrary fields at every object boundary', () => {
  const request = syntheticDependencyRequest();
  const selectors = [x => x, x => x.packet, x => x.packet.dependencyCapsule,
    x => x.packet.dependencyCapsule.predecessors[0], x => x.snapshot, x => x.receipts[0],
    x => x.receipts[0].opening, x => x.receipts[0].path];
  for (const extra of ['graph', 'ownerWitness', 'localCapsule', 'action', 'nk', 'receiptSpendSecret',
    'signingKey', 'ownerKey', 'verified', 'unknown']) {
    for (const select of selectors) {
      const changed = copy(request); select(changed)[extra] = other;
      assert.throws(() => prepareNativeDependency(changed), /FIELDS/, extra);
    }
  }
  const output = JSON.stringify(prepareNativeDependency(request));
  for (const forbidden of ['"graph"', '"ownerWitness"', '"localCapsule"', '"action"', '"nk"',
    '"receiptSpendSecret"', '"signingKey"', '"ownerKey"', '"receipt_spend_secrets"']) {
    assert.ok(!output.includes(forbidden));
  }
});

test('hidden fields, symbols, accessors, sparse arrays and nonstandard prototypes cannot bypass the schema', () => {
  for (const select of [x => x, x => x.packet, x => x.packet.dependencyCapsule, x => x.snapshot,
    x => x.receipts[0].opening, x => x.receipts[0].path]) {
    for (const kind of ['hidden', 'symbol', 'accessor', 'prototype']) {
      const input = syntheticDependencyRequest(), object = select(input);
      if (kind === 'hidden') Object.defineProperty(object, 'nk', { value: other });
      if (kind === 'symbol') object[Symbol('secret')] = other;
      if (kind === 'accessor') Object.defineProperty(object, Object.keys(object)[0], {
        get() { throw new Error('accessor executed'); }, enumerable: true,
      });
      if (kind === 'prototype') Object.setPrototypeOf(object, { nk: other });
      assert.throws(() => prepareNativeDependency(input), /FIELDS/, kind);
    }
  }
  for (const select of [x => x.receipts, x => x.revokedEntries, x => x.packet.dependencyCapsule.predecessors,
    x => x.receipts[0].path.siblings]) {
    for (const kind of ['hidden', 'symbol', 'accessor', 'sparse']) {
      const input = syntheticDependencyRequest(), value = select(input);
      if (kind === 'hidden') Object.defineProperty(value, 'nk', { value: other });
      if (kind === 'symbol') value[Symbol('secret')] = other;
      if (kind === 'accessor') Object.defineProperty(value, '0', { get() { throw new Error('array accessor executed'); } });
      if (kind === 'sparse') delete value[0];
      assert.throws(() => prepareNativeDependency(input), /ARRAY/, kind);
    }
  }
});

test('the exact capsule commitment, target/source ordering and packet context are required', () => {
  for (const mutate of [
    x => { x.packet.dependencyCapsule.targetContext = other; },
    x => { x.packet.dependencyCapsule.targetSlot = 2; },
    x => { x.packet.dependencyCapsule.predecessors[0].sourceNodeCommitment = other; },
    x => { x.packet.dependencyCapsule.dependencyCount = 4; },
    x => { x.packet.dependencyCapsule.predecessors[1].sourceSlot = 0; bindCapsule(x); },
    x => { x.packet.dependencyCapsule.predecessors[2].sourceSlot = 3; bindCapsule(x); },
    x => { x.receipts[0].sourceSlot = 1; },
    x => { x.receipts.reverse(); },
    x => { x.packet.profile = 'LIANUM_PAEG_GRAPH_4_V1'; },
    x => { x.packet.context = ZERO; },
    x => { x.packet.context = other; },
    x => { x.snapshot.scope = `0x${other}`; bindSnapshot(x); },
    x => { x.snapshot.registryCommitment = `0x${other}`; bindSnapshot(x); },
  ]) {
    const input = syntheticDependencyRequest(); mutate(input);
    assert.throws(() => prepareNativeDependency(input), /PAEG_/);
  }
  const empty = syntheticDependencyRequest(0);
  empty.packet.dependencyCapsule.predecessors[0].receiptRho = other;
  bindCapsule(empty);
  assert.throws(() => prepareNativeDependency(empty), /UNUSED_PREDECESSOR/);
});

test('receipt reads bind every source field plus hNk/rho and exact required count', () => {
  for (const field of ['hubDomain', 'registryCommitment', 'scope', 'policy', 'localCommitment', 'dispatchId',
    'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho']) {
    const input = syntheticDependencyRequest(); input.receipts[0].opening[field] = other;
    assert.throws(() => prepareNativeDependency(input), /PAEG_DEPENDENCY_RECEIPT_(CONTEXT|SOURCE)/, field);
  }
  for (const mutate of [x => x.receipts.pop(), x => x.receipts.push(copy(x.receipts[0]))]) {
    const input = syntheticDependencyRequest(); mutate(input);
    assert.throws(() => prepareNativeDependency(input), /RECEIPTS_ARRAY/);
  }
  const input = syntheticDependencyRequest(0);
  input.receipts.push(syntheticDependencyRequest().receipts[0]);
  assert.throws(() => prepareNativeDependency(input), /RECEIPTS_ARRAY/);
});

test('membership, snapshot digest/count bounds and revocation require byte-consistent state', () => {
  for (const mutate of [
    x => { x.snapshot.timestamp = '251'; },
    x => { x.receipts[0].path.siblings[0] = `0x${other}`; },
    x => { x.receipts[0].path.index = '2'; },
    x => { x.receipts[0].path.index = '64'; },
    x => { x.snapshot.receiptCount = '3'; bindSnapshot(x); },
    x => { x.snapshot.receiptCount = '65'; },
    x => { x.snapshot.revokedCount = '65'; },
    x => { x.revokedEntries[0] = `0x${other}`; },
    x => { x.revokedEntries[1] = `0x${other}`; },
    x => { x.revokedEntries[0] = `0x${x.receipts[0].opening.globalEffectId}`;
      x.snapshot.revokedDigest = boundedListDigest(0x32, x.snapshot.hubDomain, x.revokedEntries, x.snapshot.revokedCount); bindSnapshot(x); },
    x => { x.receipts[0].opening.globalEffectId = other; },
  ]) {
    const input = syntheticDependencyRequest(); mutate(input);
    assert.throws(() => prepareNativeDependency(input), /PAEG_/);
  }
});

test('half-open windows, halt and canonical full u64 times are enforced without Number truncation', () => {
  for (const mutate of [
    x => { x.validFrom = '300'; }, x => { x.validUntil = '200'; }, x => { x.validFrom = '99'; },
    x => { x.validUntil = '401'; }, x => { x.packet.settleBefore = '299'; },
    x => { x.snapshot.timestamp = '199'; bindSnapshot(x); },
    x => { x.snapshot.timestamp = '300'; bindSnapshot(x); },
    x => { x.snapshot.halt = '1'; bindSnapshot(x); },
    ...[200, 200n, '-1', '0200', '2e2', '18446744073709551616'].map(value => x => { x.validFrom = value; }),
  ]) {
    const input = syntheticDependencyRequest(); mutate(input);
    assert.throws(() => prepareNativeDependency(input), /PAEG_/);
  }
  const input = syntheticDependencyRequest(0);
  input.validFrom = '9007199254740993'; input.validUntil = '18446744073709551615';
  input.packet.settleBefore = input.validUntil; input.snapshot.timestamp = input.validFrom; bindSnapshot(input);
  const output = prepareNativeDependency(input);
  assert.equal(output.inputs.valid_from, input.validFrom);
  assert.equal(output.inputs.valid_until, input.validUntil);
  assert.deepEqual(output.expectedPublicInputs.slice(-2), [input.validFrom, input.validUntil]);
});

test('constraint fixtures are synthetic, unconditional post-serialization mutations with independent public statements', () => {
  const positives = positiveFixtures(), negatives = negativeFixtures();
  assert.deepEqual(positives.map(value => value.name), ['zero-dependencies', 'three-valid-dependencies']);
  assert.equal(new Set(negatives.map(value => value.name)).size, negatives.length);
  assert.ok(negatives.length >= 12);
  for (const fixture of [...positives, ...negatives]) {
    assert.deepEqual(Object.keys(fixture), ['name', 'inputs', 'expectedPublicInputs']);
    assert.equal(fixture.expectedPublicInputs.length, 50);
    assert.deepEqual(fixture.expectedPublicInputs, publicKeys.flatMap(key => fixture.inputs[key]).map(String));
  }
  for (const name of ['forged-capsule-field-unchanged-commitment', 'missing-dependency-unchanged-commitment']) {
    assert.deepEqual(negatives.find(value => value.name === name).inputs.dependency_capsule_commitment,
      positives[1].inputs.dependency_capsule_commitment);
  }
  assert.equal(negatives.find(value => value.name === 'overflow-dependency-count-rebound').inputs.dependency.dependency_count, 4);
  const changedAmount = negatives.find(value => value.name === 'changed-amount-action-commitment');
  assert.notDeepEqual(changedAmount.inputs.snapshot_digest, positives[1].inputs.snapshot_digest);
  assert.deepEqual(changedAmount.inputs.dependency_capsule_commitment, positives[1].inputs.dependency_capsule_commitment);
});
