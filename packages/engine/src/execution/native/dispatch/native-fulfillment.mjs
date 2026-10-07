/** Fixed A67/A98/T131 private ABI composition, never proof verification.
 * The assembler receives only opaque recursive packages and a pool path. It
 * receives no graph, capsule opening, receipt spend secret or owner signing key.
 * Every recursive package is shape/range checked; only the pinned circuit and
 * proof worker can establish its cryptographic validity. Root recognition,
 * current hub state/time and atomic nullifier/tag consumption remain pool work.
 */
import assert from 'node:assert/strict';
import { a0Context } from './native-capsules.mjs';
import { FUNDED_GRAPH_PROFILE } from '../../graph/funded-graph.mjs';
import { A0, FIELD_MODULUS, digestHex, digestWords, membershipRoot }
  from '../../../../../../experiments/engine/private-core-proof/generic-wrappers/abi.mjs';

export const NATIVE_AGGREGATE_PAIR_PUBLIC_INPUT_COUNT = 67;
export const NATIVE_AGGREGATE_ALL_PUBLIC_INPUT_COUNT = 98;
export const NATIVE_FULFILLMENT_PUBLIC_INPUT_COUNT = 131;
const ZERO = '0'.repeat(64), U32_MAX = (1n << 32n) - 1n, U64_MAX = (1n << 64n) - 1n;
const COMMON = ['hub_domain', 'registry_commitment', 'evidence_state', 'context'];
const OWNER_DIGESTS = ['scope', 'policy', 'asset', 'operationId', 'inputCommitment', 'inputNullifier',
  'reservationIntent', 'graphCommitment', 'treeRoot', 'reserveCommitment', 'reserveNullifier', 'changeCommitment'];
const EXPECTED_DIGESTS = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'evidenceState', 'reserveNullifier'];
const EXPECTED_TIMES = ['settleBefore', 'validFrom', 'validUntil'];

function exact(value, fields, label) {
  const code = `PAEG_FULFILLMENT_${label}_FIELDS`;
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.every(key => typeof key === 'string'), code);
  assert.deepEqual(keys.sort(), [...fields].sort(), code);
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(Object.hasOwn(descriptor, 'value'), code);
    if (typeof descriptor.value === 'string') assert.ok(!/\s/.test(descriptor.value), code);
  }
}
function array(value, length, label) {
  const code = `PAEG_FULFILLMENT_${label}_ARRAY`;
  assert.ok(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, code);
  assert.equal(value.length, length, code);
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.every(key => typeof key === 'string'), code);
  assert.deepEqual(keys.sort(), ['length', ...Array.from({ length }, (_, i) => String(i))].sort(), code);
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, i);
    assert.ok(Object.hasOwn(descriptor, 'value'), code);
    if (typeof descriptor.value === 'string') assert.ok(!/\s/.test(descriptor.value), code);
  }
}
function uint(value, maximum, label) {
  assert.ok(typeof value === 'string' && value.length <= 77 && /^(0|[1-9][0-9]*)$/.test(value)
    && !/\s/.test(value), `PAEG_FULFILLMENT_${label}_INTEGER`);
  const number = BigInt(value);
  assert.ok(number <= maximum, `PAEG_FULFILLMENT_${label}_RANGE`);
  return number;
}
function hash(value, label, { prefixed = false, zero = false } = {}) {
  assert.ok(typeof value === 'string' && value.length === (prefixed ? 66 : 64)
    && (prefixed ? /^0x[0-9a-f]{64}$/ : /^[0-9a-f]{64}$/).test(value)
    && (zero || value !== (prefixed ? `0x${ZERO}` : ZERO)), `PAEG_FULFILLMENT_${label}_DIGEST`);
  return prefixed ? value.slice(2) : value;
}
function recursivePackage(value, wordCount, digestCount, byteCount, label) {
  exact(value, ['publicInputs', 'proofFields', 'vkFields'], label);
  for (const [field, count] of [['publicInputs', wordCount], ['proofFields', 458], ['vkFields', 115]]) {
    array(value[field], count, `${label}_${field}`);
    value[field].forEach((word, i) => uint(word, field !== 'publicInputs' ? FIELD_MODULUS - 1n
      : i < digestCount ? U32_MAX : i < digestCount + byteCount ? 255n : U64_MAX, `${label}_${field}`));
  }
  return { publicInputs: [...value.publicInputs], proofFields: [...value.proofFields], vkFields: [...value.vkFields] };
}
const digestAt = (inputs, offset) => inputs.slice(offset, offset + 8);
const hexAt = (inputs, offset) => digestHex(digestAt(inputs, offset));
const common = inputs => Object.fromEntries(COMMON.map((field, i) => [field, digestAt(inputs, i * 8)]));
const snake = field => field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
function interval(from, until) {
  assert.ok(BigInt(from) < BigInt(until), 'PAEG_FULFILLMENT_INTERVAL');
}
function distinct(payouts, tags) {
  for (const [label, values] of [['OUTPUT', payouts], ['TAG', tags]]) {
    const hashes = values.map(digestHex);
    assert.ok(hashes.every(value => value !== ZERO), `PAEG_FULFILLMENT_ZERO_${label}`);
    assert.equal(new Set(hashes).size, hashes.length, `PAEG_FULFILLMENT_DUPLICATE_${label}`);
  }
}
function composed(publicInputs, privateInputs, count) {
  const expectedPublicInputs = Object.values(publicInputs).flat(Infinity);
  assert.equal(expectedPublicInputs.length, count, 'PAEG_FULFILLMENT_ABI');
  return { inputs: { ...publicInputs, ...privateInputs }, expectedPublicInputs };
}

/** nodeProofs is exactly two { publicInputs, proofFields, vkFields } packages
 * containing N51 fields in slot order [0,1] or [2,3]. All field words use
 * canonical decimal strings. Both positions are mandatory, including padding.
 * Caller VK fields are checked for shape only and are not passed to A67: its
 * source embeds the approved N51 key.
 */
export function prepareNativeAggregatePair(input) {
  exact(input, ['nodeProofs'], 'PAIR_INPUT');
  array(input.nodeProofs, 2, 'NODES');
  const nodes = input.nodeProofs.map(value => recursivePackage(value, 51, 48, 1, 'NODE_PROOF'));
  const [left, right] = nodes.map(value => value.publicInputs);
  assert.ok(left[48] === '0' || left[48] === '2', 'PAEG_FULFILLMENT_PAIR_COVERAGE');
  assert.equal(BigInt(right[48]), BigInt(left[48]) + 1n, 'PAEG_FULFILLMENT_PAIR_COVERAGE');
  assert.deepEqual(left.slice(0, 32), right.slice(0, 32), 'PAEG_FULFILLMENT_COMMON_CONTEXT');
  assert.deepEqual(left.slice(49), right.slice(49), 'PAEG_FULFILLMENT_WINDOW_BINDING');
  interval(left[49], left[50]);
  const payouts = nodes.map(value => digestAt(value.publicInputs, 32));
  const tags = nodes.map(value => digestAt(value.publicInputs, 40));
  distinct(payouts, tags);
  return composed({ ...common(left), payouts, tags, pair_index: (BigInt(left[48]) / 2n).toString(),
    valid_from: left[49], valid_until: left[50] }, {
    node_proofs: nodes.map(value => value.proofFields), node_inputs: nodes.map(value => value.publicInputs),
  }, NATIVE_AGGREGATE_PAIR_PUBLIC_INPUT_COUNT);
}

/** pairProofs is exactly two A67 recursive packages, ordered pair 0 then pair
 * 1. No slot mask or active count is accepted; the four positions are fixed.
 * A98 uses its literal approved A67 key, not caller-supplied VK authority.
 */
export function prepareNativeAggregateAll(input) {
  exact(input, ['pairProofs'], 'ALL_INPUT');
  array(input.pairProofs, 2, 'PAIRS');
  const pairs = input.pairProofs.map(value => recursivePackage(value, 67, 64, 1, 'PAIR_PROOF'));
  const [left, right] = pairs.map(value => value.publicInputs);
  assert.ok(left[64] === '0' && right[64] === '1', 'PAEG_FULFILLMENT_ALL_COVERAGE');
  assert.deepEqual(left.slice(0, 32), right.slice(0, 32), 'PAEG_FULFILLMENT_COMMON_CONTEXT');
  assert.deepEqual(left.slice(65), right.slice(65), 'PAEG_FULFILLMENT_WINDOW_BINDING');
  interval(left[65], left[66]);
  const payouts = pairs.flatMap(value => [32, 40].map(offset => digestAt(value.publicInputs, offset)));
  const tags = pairs.flatMap(value => [48, 56].map(offset => digestAt(value.publicInputs, offset)));
  distinct(payouts, tags);
  return composed({ ...common(left), payouts, tags, valid_from: left[65], valid_until: left[66] }, {
    pair_proofs: pairs.map(value => value.proofFields), pair_inputs: pairs.map(value => value.publicInputs),
  }, NATIVE_AGGREGATE_ALL_PUBLIC_INPUT_COUNT);
}

function ownerContext(inputs) {
  // Reconstruct only the public A0 statement needed by the existing, exact C129
  // context codec. This object is never returned to the assembler's caller.
  return a0Context({ profile: FUNDED_GRAPH_PROFILE.id,
    ...Object.fromEntries(OWNER_DIGESTS.map(field => [field, hexAt(inputs, A0[field])])),
    outputs: Array.from({ length: 4 }, (_, i) => hexAt(inputs, A0.outputs + i * 8)),
    recoveryCommitment: hexAt(inputs, A0.recoveryCommitment), fundingNotBefore: inputs[A0.fundingNotBefore],
    fundingValidUntil: inputs[A0.fundingValidUntil], settleBefore: inputs[A0.settleBefore] });
}
function expectedStatement(expected) {
  exact(expected, [...EXPECTED_DIGESTS, 'acceptedPoolRoot', 'outputs', 'terminalReceiptTags', ...EXPECTED_TIMES], 'EXPECTED');
  EXPECTED_DIGESTS.forEach(field => hash(expected[field], field));
  hash(expected.acceptedPoolRoot, 'POOL_ROOT', { prefixed: true });
  EXPECTED_TIMES.forEach(field => uint(expected[field], U64_MAX, field));
  for (const field of ['outputs', 'terminalReceiptTags']) {
    array(expected[field], 4, field);
    expected[field].forEach(value => hash(value, field));
  }
  return {
    ...Object.fromEntries(['scope', 'policy', 'asset'].map(field => [field, digestWords(expected[field])])),
    accepted_pool_root: digestWords(expected.acceptedPoolRoot.slice(2)),
    ...Object.fromEntries(EXPECTED_DIGESTS.slice(3).map(field => [snake(field), digestWords(expected[field])])),
    outputs: expected.outputs.map(digestWords), terminal_receipt_tags: expected.terminalReceiptTags.map(digestWords),
    ...Object.fromEntries(EXPECTED_TIMES.map(field => [snake(field), expected[field]])),
  };
}

/** T131 accepts exact ownerProof (A0) and aggregateProof (A98) packages plus
 * reservePath { index, siblings }. index is a decimal string in [0,63]; its
 * six siblings and expectedBindings.acceptedPoolRoot are lower-case 0x hashes.
 * Other expectedBindings hashes are unprefixed lower-case hex. It contains the
 * complete expected public statement: scope/policy/asset, hubDomain,
 * registryCommitment, evidenceState, reserveNullifier, four outputs, four
 * terminalReceiptTags, settleBefore/validFrom/validUntil and acceptedPoolRoot.
 * A0's supplied VK is necessary private ABI data and is checked against the
 * frozen key in T131; its presence or shape does not authenticate the proof.
 */
export function prepareNativeFulfillment(input) {
  exact(input, ['ownerProof', 'aggregateProof', 'reservePath', 'expectedBindings'], 'INPUT');
  const owner = recursivePackage(input.ownerProof, A0.length, 136, 0, 'OWNER_PROOF');
  const aggregate = recursivePackage(input.aggregateProof, 98, 96, 0, 'AGGREGATE_PROOF');
  const a = owner.publicInputs, all = aggregate.publicInputs;
  const expected = expectedStatement(input.expectedBindings);
  assert.equal(hexAt(all, 24), ownerContext(a), 'PAEG_FULFILLMENT_A0_CONTEXT');
  const outputs = Array.from({ length: 4 }, (_, i) => digestAt(a, A0.outputs + i * 8));
  const tags = Array.from({ length: 4 }, (_, i) => digestAt(all, 64 + i * 8));
  outputs.forEach((output, i) => assert.deepEqual(output, digestAt(all, 32 + i * 8), 'PAEG_FULFILLMENT_OUTPUT_BINDING'));
  distinct(outputs, tags);
  interval(all[96], all[97]);
  assert.ok(BigInt(all[97]) <= BigInt(a[A0.settleBefore]), 'PAEG_FULFILLMENT_CUTOFF');
  const publicInputs = { scope: digestAt(a, A0.scope), policy: digestAt(a, A0.policy), asset: digestAt(a, A0.asset),
    accepted_pool_root: [...expected.accepted_pool_root], hub_domain: digestAt(all, 0),
    registry_commitment: digestAt(all, 8), evidence_state: digestAt(all, 16), reserve_nullifier: digestAt(a, A0.reserveNullifier),
    outputs, terminal_receipt_tags: tags, settle_before: a[A0.settleBefore], valid_from: all[96], valid_until: all[97] };
  assert.deepEqual(publicInputs, expected, 'PAEG_FULFILLMENT_EXPECTED_BINDINGS');
  exact(input.reservePath, ['index', 'siblings'], 'RESERVE_PATH');
  const index = uint(input.reservePath.index, 63n, 'RESERVE_INDEX');
  array(input.reservePath.siblings, 6, 'RESERVE_SIBLINGS');
  const siblings = input.reservePath.siblings.map(value => hash(value, 'RESERVE_SIBLING', { prefixed: true, zero: true }));
  assert.equal(membershipRoot(hexAt(a, A0.reserveCommitment), siblings, Number(index)),
    input.expectedBindings.acceptedPoolRoot.slice(2), 'PAEG_FULFILLMENT_RESERVE_MEMBERSHIP');
  return composed(publicInputs, { owner_vk: owner.vkFields, owner_proof: owner.proofFields, owner_inputs: owner.publicInputs,
    aggregate_proof: aggregate.proofFields, aggregate_inputs: aggregate.publicInputs,
    reserve_siblings: siblings.map(value => [...Buffer.from(value, 'hex')]), reserve_leaf_index: input.reservePath.index,
  }, NATIVE_FULFILLMENT_PUBLIC_INPUT_COUNT);
}
