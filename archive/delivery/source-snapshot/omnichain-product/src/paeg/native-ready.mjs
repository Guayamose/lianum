/** R98 preparation for one Ready actor. This is a strict, private ABI codec,
 * not proof verification, snapshot authentication, or a native signing gate.
 * The actor receives its own readyRole packet and opaque C129/P50 field
 * packages. No predecessor receipt, full graph, or receipt secret is accepted.
 * Recursive verification uses the circuit's pinned keys, never a host flag.
 */
import assert from 'node:assert/strict';
import { NATIVE_CAPSULE_PROFILE, localCapsuleCommitment, localCapsuleToNoir,
  nativeTransferActionCommitment, nativeActionToNoir } from './native-capsules.mjs';
import { SNAPSHOT_FIELDS, NATIVE_STATE_PREFIX, snapshotDigest, snapshotToNoir,
  nativeDigestWords, boundedListToNoir, membership, assertAbsent } from './native-state.mjs';

export const NATIVE_READY_PUBLIC_INPUT_COUNT = 98;
const ZERO = '0'.repeat(64);
const U64_MAX = (1n << 64n) - 1n;
const FIELD_MAX = 21888242871839275222246405745257275088548364400416034343698204186575808495616n;
const CONTEXT_FIELDS = ['profile', 'scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'context', 'settleBefore'];
const LOCAL_FIELDS = ['slot', 'active', 'targetContext', 'nodeCommitment', 'localCommitment', 'dispatchId',
  'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment',
  'receiptRho', 'dummyTerminalTag', 'capsuleSalt'];
const ACTION_FIELDS = ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment', 'amount',
  'custodyKind', 'custodyCommitment', 'executionFrom', 'executionUntil', 'settleBefore',
  'receiptKeyCommitment', 'receiptRho', 'deliveryRiskCommitment', 'actionSalt'];

function exact(value, fields, label) {
  const code = `PAEG_READY_${label}_FIELDS`;
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.every(key => typeof key === 'string'), code);
  assert.deepEqual(keys.sort(), [...fields].sort(), code);
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(Object.hasOwn(descriptor, 'value'), code);
    // Also protect calls into existing codecs: JS `$` alone permits a final
    // line terminator, while every role/state string here must be whitespace-free.
    if (typeof descriptor.value === 'string') assert.ok(!/\s/.test(descriptor.value), code);
  }
}
function array(value, maximum, label, length) {
  const code = `PAEG_READY_${label}_ARRAY`;
  assert.ok(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, code);
  assert.ok(value.length <= maximum && (length === undefined || value.length === length), code);
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.every(key => typeof key === 'string'), code);
  assert.deepEqual(keys.sort(), ['length', ...Array.from({ length: value.length }, (_, i) => String(i))].sort(), code);
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, i);
    assert.ok(Object.hasOwn(descriptor, 'value'), code);
    if (typeof descriptor.value === 'string') assert.ok(!/\s/.test(descriptor.value), code);
  }
}
function uint(value, maximum, label) {
  assert.ok(typeof value === 'string' && value.length <= 77 && /^(0|[1-9][0-9]*)$/.test(value),
    `PAEG_READY_${label}_INTEGER`);
  const number = BigInt(value);
  assert.equal(number.toString(), value, `PAEG_READY_${label}_INTEGER`);
  assert.ok(number <= maximum, `PAEG_READY_${label}_RANGE`);
  return number;
}
function digest(value, label) {
  assert.ok(typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value) && value !== ZERO,
    `PAEG_READY_${label}_DIGEST`);
}
function recursivePackage(value, publicCount, digestWords, label) {
  exact(value, ['publicInputs', 'proofFields', 'vkFields'], label);
  for (const [field, length] of [['publicInputs', publicCount], ['proofFields', 458], ['vkFields', 115]]) {
    array(value[field], length, `${label}_${field}`, length);
    value[field].forEach((word, i) => uint(word, field === 'publicInputs'
      ? i < digestWords ? 0xffff_ffffn : U64_MAX : FIELD_MAX, `${label}_${field}`));
  }
  // VK fields are shape-checked only; the circuit embeds its approved VK.
  return { publicInputs: [...value.publicInputs], proofFields: [...value.proofFields] };
}
const words = value => nativeDigestWords(`0x${value}`);
const digestAt = (inputs, offset) => inputs.slice(offset, offset + 8)
  .map(value => BigInt(value).toString(16).padStart(8, '0')).join('');
const snake = field => field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

/** packet is prepareNativeCapsules(...).readyRole(slot).
 * capsuleProof/dependencyProof are exact { publicInputs, proofFields, vkFields }
 * selections from the pinned proof worker's result, with decimal field strings.
 * snapshot/snapshotDigest, reservePath.siblings and poolSpentEntries use the
 * native-state lower-case 0x format; reservePath.index and times use decimal
 * strings. The caller must authenticate the checkpoint and current time before
 * signing. Shape-valid synthetic fields are not cryptographically accepted.
 */
export function prepareNativeReady(input) {
  exact(input, ['packet', 'capsuleProof', 'dependencyProof', 'snapshot', 'snapshotDigest',
    'reservePath', 'poolSpentEntries', 'readyFrom', 'readyUntil'], 'INPUT');
  const { packet, snapshot } = input;
  exact(packet, [...CONTEXT_FIELDS, 'localCapsule', 'action', 'localCapsuleCommitment',
    'dependencyCapsuleCommitment'], 'PACKET');
  assert.equal(packet.profile, NATIVE_CAPSULE_PROFILE.id, 'PAEG_READY_PROFILE');
  for (const field of [...CONTEXT_FIELDS.slice(1, -1), 'localCapsuleCommitment', 'dependencyCapsuleCommitment']) {
    digest(packet[field], field);
  }
  const cutoff = uint(packet.settleBefore, U64_MAX, 'SETTLE_BEFORE');
  const local = packet.localCapsule;
  exact(local, LOCAL_FIELDS, 'LOCAL');
  assert.ok(!Object.is(local.slot, -0), 'PAEG_READY_SLOT');
  const localWitness = localCapsuleToNoir(local);
  assert.equal(local.active, true, 'PAEG_READY_ACTIVE_REQUIRED');
  assert.equal(localCapsuleCommitment(packet, local), packet.localCapsuleCommitment,
    'PAEG_READY_LOCAL_COMMITMENT');
  exact(packet.action, ACTION_FIELDS, 'ACTION');
  const actionWitness = nativeActionToNoir(packet.action), action = packet.action;
  assert.equal(nativeTransferActionCommitment(action), local.actionCommitment, 'PAEG_READY_ACTION_COMMITMENT');
  for (const field of ['chainDomain', 'receiptKeyCommitment', 'receiptRho']) {
    assert.equal(action[field], local[field], 'PAEG_READY_ACTION_BINDING');
  }
  assert.equal(action.settleBefore, packet.settleBefore, 'PAEG_READY_ACTION_CUTOFF');

  const capsule = recursivePackage(input.capsuleProof, 129, 128, 'CAPSULE_PROOF');
  for (const [index, field] of CONTEXT_FIELDS.slice(1, -1).entries()) {
    assert.equal(digestAt(capsule.publicInputs, index * 8), packet[field], 'PAEG_READY_CAPSULE_CONTEXT');
  }
  assert.equal(digestAt(capsule.publicInputs, 64 + local.slot * 8), packet.localCapsuleCommitment,
    'PAEG_READY_CAPSULE_LOCAL');
  assert.equal(digestAt(capsule.publicInputs, 96 + local.slot * 8), packet.dependencyCapsuleCommitment,
    'PAEG_READY_CAPSULE_DEPENDENCY');
  assert.equal(capsule.publicInputs[128], packet.settleBefore, 'PAEG_READY_CAPSULE_CUTOFF');
  const dependency = recursivePackage(input.dependencyProof, 50, 48, 'DEPENDENCY_PROOF');
  nativeDigestWords(input.snapshotDigest);
  const expectedDependency = [packet.hubDomain, packet.registryCommitment, packet.context,
    local.targetContext, packet.dependencyCapsuleCommitment].flatMap(words)
    .concat(nativeDigestWords(input.snapshotDigest), input.readyFrom, input.readyUntil);
  assert.deepEqual(dependency.publicInputs, expectedDependency, 'PAEG_READY_DEPENDENCY_BINDING');

  const from = uint(input.readyFrom, U64_MAX, 'READY_FROM'), until = uint(input.readyUntil, U64_MAX, 'READY_UNTIL');
  assert.ok(BigInt(action.executionFrom) <= from && from < until && until <= BigInt(action.executionUntil)
    && until <= cutoff, 'PAEG_READY_INTERVAL');
  exact(snapshot, SNAPSHOT_FIELDS, 'SNAPSHOT');
  const snapshotWitness = snapshotToNoir(snapshot);
  assert.equal(snapshotDigest(snapshot), input.snapshotDigest, 'PAEG_READY_SNAPSHOT_DIGEST');
  for (const [packetField, snapshotField] of [['hubDomain', 'hubDomain'], ['registryCommitment', 'registryCommitment'],
    ['scope', 'scope'], ['policy', 'policy'], ['asset', 'assetIdentity']]) {
    assert.equal(snapshot[snapshotField], `0x${packet[packetField]}`, 'PAEG_READY_SNAPSHOT_CONTEXT');
  }
  assert.equal(snapshot.halt, '0', 'PAEG_READY_HALTED');
  assert.ok(from <= BigInt(snapshot.timestamp) && BigInt(snapshot.timestamp) < until, 'PAEG_READY_SNAPSHOT_TIME');

  exact(input.reservePath, ['index', 'siblings'], 'RESERVE_PATH');
  array(input.reservePath.siblings, 6, 'RESERVE_SIBLINGS', 6);
  uint(input.reservePath.index, 63n, 'RESERVE_INDEX');
  membership(`0x${digestAt(capsule.publicInputs, 48)}`, input.reservePath.siblings,
    input.reservePath.index, snapshot.poolRoot);
  array(input.poolSpentEntries, 64, 'POOL_SPENT');
  assertAbsent(NATIVE_STATE_PREFIX.poolSpent, snapshot.scope, input.poolSpentEntries, snapshot.poolSpentCount,
    snapshot.poolSpentDigest, `0x${digestAt(capsule.publicInputs, 56)}`);
  const spent = boundedListToNoir(NATIVE_STATE_PREFIX.poolSpent, snapshot.scope, input.poolSpentEntries, snapshot.poolSpentCount);
  const publicInputs = {
    ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(field => [snake(field), words(packet[field])])),
    snapshot_digest: nativeDigestWords(input.snapshotDigest),
    ...Object.fromEntries(['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment']
      .map(field => [snake(field), words(local[field])])),
    ready_from: input.readyFrom, ready_until: input.readyUntil,
  };
  const expectedPublicInputs = Object.values(publicInputs).flat();
  assert.equal(expectedPublicInputs.length, NATIVE_READY_PUBLIC_INPUT_COUNT, 'PAEG_READY_ABI');
  return { inputs: { ...publicInputs, capsule_proof: capsule.proofFields, capsule_inputs: capsule.publicInputs,
    dependency_proof: dependency.proofFields, dependency_inputs: dependency.publicInputs,
    local: localWitness, action: actionWitness, snapshot: snapshotWitness,
    reserve_siblings: input.reservePath.siblings.map(value => [...Buffer.from(value.slice(2), 'hex')]),
    reserve_index: input.reservePath.index, pool_spent_entries: spent.entries }, expectedPublicInputs };
}
