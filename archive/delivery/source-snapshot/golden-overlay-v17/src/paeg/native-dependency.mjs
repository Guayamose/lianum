/** Scoped P50 witness preparation for one Dependency actor.
 *
 * This codec accepts only a dependencyRole packet, a snapshot, and predecessor
 * receipt read witnesses. It never needs the graph, a local capsule, an action
 * opening, nk, or a signing key. It checks byte consistency, not authorization:
 * Ready MUST bind this dependency capsule commitment to a verified C129, and
 * the hub/current native signer MUST authenticate the snapshot and freshness.
 * A caller-selected internally consistent snapshot is not admitted native fact.
 */
import assert from 'node:assert/strict';
import { NATIVE_CAPSULE_PROFILE, dependencyCapsuleCommitment, dependencyCapsuleToNoir } from './native-capsules.mjs';
import { RECEIPT_HASH_FIELDS, nativeReceiptReadOpening, nativeReceiptCommitment, nativeReceiptToNoir } from './native-receipt.mjs';
import { SNAPSHOT_FIELDS, NATIVE_STATE_PREFIX, boundedListDigest, boundedListToNoir,
  snapshotDigest, snapshotToNoir, nativeDigestWords, membership } from './native-state.mjs';

export const NATIVE_DEPENDENCY_PUBLIC_INPUT_COUNT = 50;
const ZERO = '0'.repeat(64);
const U64_MAX = (1n << 64n) - 1n;
const PACKET_FIELDS = ['profile', 'scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'context',
  'settleBefore', 'dependencyCapsule', 'dependencyCapsuleCommitment'];
const CAPSULE_FIELDS = ['targetSlot', 'targetContext', 'dependencyCount', 'predecessors', 'capsuleSalt'];
const SOURCE_FIELDS = ['sourceSlot', 'sourceNodeCommitment', 'sourceLocalCommitment', 'sourceDispatchId',
  'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'];
const READ_FIELDS = [...RECEIPT_HASH_FIELDS, 'validFrom', 'validUntil', 'receiptKeyCommitment', 'receiptRho'];
const SOURCE_RECEIPT_FIELDS = [
  ['sourceLocalCommitment', 'localCommitment'], ['sourceDispatchId', 'dispatchId'],
  ...['chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho']
    .map(field => [field, field]),
];

// Reject hidden properties, symbols, accessors and custom prototypes before any
// codec reads values. No extra private material can ride along in a role packet.
function exact(value, fields, label) {
  const code = `PAEG_DEPENDENCY_${label}_FIELDS`;
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.every(key => typeof key === 'string'), code);
  assert.deepEqual(keys.sort(), [...fields].sort(), code);
  for (const key of fields) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'), code);
}
function array(value, maximum, label, length) {
  const code = `PAEG_DEPENDENCY_${label}_ARRAY`;
  assert.ok(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, code);
  assert.ok(value.length <= maximum && (length === undefined || value.length === length), code);
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.every(key => typeof key === 'string'), code);
  assert.deepEqual(keys.sort(), ['length', ...Array.from({ length: value.length }, (_, i) => String(i))].sort(), code);
  for (let i = 0; i < value.length; i++) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, i), 'value'), code);
}
function digest(value, label) {
  assert.ok(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) && value !== ZERO,
    `PAEG_DEPENDENCY_${label}_DIGEST`);
}
function uint(value, maximum, label) {
  assert.ok(typeof value === 'string' && value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value),
    `PAEG_DEPENDENCY_${label}_INTEGER`);
  const number = BigInt(value);
  assert.ok(number <= maximum, `PAEG_DEPENDENCY_${label}_RANGE`);
  return number;
}
function slot(value, label) {
  assert.ok(Number.isInteger(value) && !Object.is(value, -0) && value >= 0 && value < 4,
    `PAEG_DEPENDENCY_${label}_SLOT`);
}
const snake = field => field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const emptyReceipt = () => Object.fromEntries(READ_FIELDS.map(field => [snake(field),
  field === 'validFrom' || field === 'validUntil' ? '0' : Array(32).fill(0)]));

/**
 * packet: exact prepareNativeCapsules(...).dependencyRole(slot) output.
 * snapshot/snapshotDigest/revokedEntries/path siblings: native-state 0x hex.
 * receipts: exactly dependencyCount ordered entries, each
 *   { sourceSlot: number, opening: ReceiptRead, path: { index: decimal, siblings } }.
 * validFrom/validUntil: canonical full-width u64 decimal strings.
 *
 * snapshotDigest must come from the consuming authenticated current-state flow.
 * This function cannot authenticate its provenance or establish wall-clock age.
 * Returned ABI witnesses are private; do not publish or log them.
 */
export function prepareNativeDependency(input) {
  exact(input, ['packet', 'snapshot', 'snapshotDigest', 'receipts', 'revokedEntries', 'validFrom', 'validUntil'], 'INPUT');
  const { packet, snapshot } = input;
  exact(packet, PACKET_FIELDS, 'PACKET');
  assert.equal(packet.profile, NATIVE_CAPSULE_PROFILE.id, 'PAEG_DEPENDENCY_PROFILE');
  for (const field of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'context', 'dependencyCapsuleCommitment']) {
    digest(packet[field], field);
  }
  const settleBefore = uint(packet.settleBefore, U64_MAX, 'SETTLE_BEFORE');
  const dependency = packet.dependencyCapsule;
  exact(dependency, CAPSULE_FIELDS, 'CAPSULE');
  slot(dependency.targetSlot, 'TARGET');
  assert.ok(Number.isInteger(dependency.dependencyCount) && !Object.is(dependency.dependencyCount, -0)
    && dependency.dependencyCount >= 0 && dependency.dependencyCount <= 3, 'PAEG_DEPENDENCY_COUNT');
  array(dependency.predecessors, 3, 'PREDECESSORS', 3);
  dependency.predecessors.forEach(source => { exact(source, SOURCE_FIELDS, 'SOURCE'); slot(source.sourceSlot, 'SOURCE'); });
  const dependencyWitness = dependencyCapsuleToNoir(dependency);
  assert.equal(dependencyCapsuleCommitment(packet, dependency), packet.dependencyCapsuleCommitment,
    'PAEG_DEPENDENCY_CAPSULE_COMMITMENT');

  exact(snapshot, SNAPSHOT_FIELDS, 'SNAPSHOT');
  // Serialize first: canonical encoding and every bounded count are validated.
  const snapshotWitness = snapshotToNoir(snapshot);
  nativeDigestWords(input.snapshotDigest);
  assert.equal(snapshotDigest(snapshot), input.snapshotDigest, 'PAEG_DEPENDENCY_SNAPSHOT_DIGEST');
  for (const [packetField, snapshotField] of [['hubDomain', 'hubDomain'], ['registryCommitment', 'registryCommitment'],
    ['scope', 'scope'], ['policy', 'policy'], ['asset', 'assetIdentity']]) {
    assert.equal(snapshot[snapshotField], `0x${packet[packetField]}`, 'PAEG_DEPENDENCY_SNAPSHOT_CONTEXT');
  }
  assert.equal(snapshot.halt, '0', 'PAEG_DEPENDENCY_HALTED');
  const validFrom = uint(input.validFrom, U64_MAX, 'VALID_FROM');
  const validUntil = uint(input.validUntil, U64_MAX, 'VALID_UNTIL');
  assert.ok(validFrom < validUntil && validUntil <= settleBefore, 'PAEG_DEPENDENCY_INTERVAL');
  assert.ok(validFrom <= BigInt(snapshot.timestamp) && BigInt(snapshot.timestamp) < validUntil,
    'PAEG_DEPENDENCY_SNAPSHOT_TIME');

  array(input.revokedEntries, 64, 'REVOKED');
  const revoked = boundedListToNoir(NATIVE_STATE_PREFIX.revoked, snapshot.hubDomain, input.revokedEntries, snapshot.revokedCount);
  assert.equal(boundedListDigest(NATIVE_STATE_PREFIX.revoked, snapshot.hubDomain, input.revokedEntries, snapshot.revokedCount),
    snapshot.revokedDigest, 'PAEG_DEPENDENCY_REVOKED_DIGEST');
  array(input.receipts, 3, 'RECEIPTS', dependency.dependencyCount);
  const receiptWitnesses = [], receiptSiblings = [], receiptIndexes = [];
  input.receipts.forEach((entry, i) => {
    exact(entry, ['sourceSlot', 'opening', 'path'], 'RECEIPT');
    slot(entry.sourceSlot, 'RECEIPT_SOURCE');
    assert.equal(entry.sourceSlot, dependency.predecessors[i].sourceSlot, 'PAEG_DEPENDENCY_SOURCE_INDEX');
    exact(entry.opening, READ_FIELDS, 'READ');
    const opening = nativeReceiptReadOpening(entry.opening), source = dependency.predecessors[i];
    for (const field of ['hubDomain', 'registryCommitment', 'scope', 'policy']) {
      assert.equal(opening[field], packet[field], 'PAEG_DEPENDENCY_RECEIPT_CONTEXT');
    }
    for (const [sourceField, receiptField] of SOURCE_RECEIPT_FIELDS) {
      assert.equal(opening[receiptField], source[sourceField], 'PAEG_DEPENDENCY_RECEIPT_SOURCE');
    }
    assert.ok(BigInt(opening.validFrom) <= validFrom && validUntil <= BigInt(opening.validUntil),
      'PAEG_DEPENDENCY_RECEIPT_INTERVAL');
    exact(entry.path, ['index', 'siblings'], 'PATH');
    array(entry.path.siblings, 6, 'SIBLINGS', 6);
    const index = uint(entry.path.index, 63n, 'RECEIPT_INDEX');
    assert.ok(index < BigInt(snapshot.receiptCount), 'PAEG_DEPENDENCY_RECEIPT_COUNT');
    membership(`0x${nativeReceiptCommitment(opening)}`, entry.path.siblings, entry.path.index, snapshot.receiptRoot);
    assert.ok(!input.revokedEntries.slice(0, Number(snapshot.revokedCount)).includes(`0x${opening.globalEffectId}`),
      'PAEG_DEPENDENCY_REVOKED_RECEIPT');
    receiptWitnesses.push(nativeReceiptToNoir(opening));
    receiptSiblings.push(entry.path.siblings.map(value => [...Buffer.from(value.slice(2), 'hex')]));
    receiptIndexes.push(entry.path.index);
  });
  while (receiptWitnesses.length < 3) {
    receiptWitnesses.push(emptyReceipt());
    receiptSiblings.push(Array.from({ length: 6 }, () => Array(32).fill(0)));
    receiptIndexes.push('0');
  }
  const publicInputs = {
    hub_domain: nativeDigestWords(`0x${packet.hubDomain}`),
    registry_commitment: nativeDigestWords(`0x${packet.registryCommitment}`),
    context: nativeDigestWords(`0x${packet.context}`),
    target_context: nativeDigestWords(`0x${dependency.targetContext}`),
    dependency_capsule_commitment: nativeDigestWords(`0x${packet.dependencyCapsuleCommitment}`),
    snapshot_digest: nativeDigestWords(input.snapshotDigest),
    valid_from: input.validFrom, valid_until: input.validUntil,
  };
  const expectedPublicInputs = Object.values(publicInputs).flat();
  assert.equal(expectedPublicInputs.length, NATIVE_DEPENDENCY_PUBLIC_INPUT_COUNT, 'PAEG_DEPENDENCY_ABI');
  return { inputs: { ...publicInputs, dependency: dependencyWitness, snapshot: snapshotWitness,
    predecessor_receipts: receiptWitnesses, receipt_siblings: receiptSiblings,
    receipt_indexes: receiptIndexes, revoked_entries: revoked.entries }, expectedPublicInputs };
}
