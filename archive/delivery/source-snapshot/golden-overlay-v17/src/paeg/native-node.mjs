/** N51 preparation for one Node actor, including C129-authenticated padding.
 * This private ABI codec checks openings, bytes and bindings. It does not verify
 * a recursive proof, authenticate an evidence-state read, or admit a receipt.
 * Only the pinned C verifier can authorize a local capsule's active/dummy bit.
 * No graph or predecessor receipt material belongs in this actor's request.
 */
import assert from 'node:assert/strict';
import { NATIVE_CAPSULE_PROFILE, localCapsuleCommitment, localCapsuleToNoir,
  nativeTransferActionCommitment, nativeActionToNoir } from './native-capsules.mjs';
import { RECEIPT_HASH_FIELDS, nativeReceiptReadOpening, nativeReceiptCommitment,
  nativeReceiptNullifier, nativeReceiptToNoir } from './native-receipt.mjs';
import { EVIDENCE_STATE_FIELDS, NATIVE_STATE_PREFIX, evidenceStateDigest, evidenceStateToNoir,
  nativeDigestWords, boundedListDigest, boundedListToNoir, membership } from './native-state.mjs';

export const NATIVE_NODE_PUBLIC_INPUT_COUNT = 51;
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
const READ_FIELDS = [...RECEIPT_HASH_FIELDS, 'validFrom', 'validUntil', 'receiptKeyCommitment', 'receiptRho'];
const LOCAL_RECEIPT_FIELDS = ['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy',
  'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'];

function exact(value, fields, label) {
  const code = `PAEG_NODE_${label}_FIELDS`;
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.every(key => typeof key === 'string'), code);
  assert.deepEqual(keys.sort(), [...fields].sort(), code);
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(Object.hasOwn(descriptor, 'value'), code);
    // Imported codecs must not accept JS `$`'s optional final line terminator.
    if (typeof descriptor.value === 'string') assert.ok(!/\s/.test(descriptor.value), code);
  }
}
function array(value, maximum, label, length) {
  const code = `PAEG_NODE_${label}_ARRAY`;
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
    `PAEG_NODE_${label}_INTEGER`);
  const number = BigInt(value);
  assert.equal(number.toString(), value, `PAEG_NODE_${label}_INTEGER`);
  assert.ok(number <= maximum, `PAEG_NODE_${label}_RANGE`);
  return number;
}
function digest(value, label) {
  assert.ok(typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value) && value !== ZERO,
    `PAEG_NODE_${label}_DIGEST`);
}
function capsulePackage(value) {
  exact(value, ['publicInputs', 'proofFields', 'vkFields'], 'CAPSULE_PROOF');
  for (const [field, length] of [['publicInputs', 129], ['proofFields', 458], ['vkFields', 115]]) {
    array(value[field], length, `CAPSULE_${field}`, length);
    value[field].forEach((word, i) => uint(word, field === 'publicInputs'
      ? i < 128 ? 0xffff_ffffn : U64_MAX : FIELD_MAX, `CAPSULE_${field}`));
  }
  // The actual key is pinned inside N51; caller VK fields confer no authority.
  return { publicInputs: [...value.publicInputs], proofFields: [...value.proofFields] };
}
const words = value => nativeDigestWords(`0x${value}`);
const digestAt = (inputs, offset) => inputs.slice(offset, offset + 8)
  .map(value => BigInt(value).toString(16).padStart(8, '0')).join('');
const snake = field => field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const emptyReceipt = () => Object.fromEntries(READ_FIELDS.map(field => [snake(field),
  field === 'validFrom' || field === 'validUntil' ? '0' : Array(32).fill(0)]));

/** packet is prepareNativeCapsules(...).nodeRole(slot). The recursive package
 * is exactly { publicInputs, proofFields, vkFields }, selected from worker
 * output, using canonical decimal field strings. Active receipt is
 * { opening: ReceiptRead, path: { index, siblings } }; padding requires null.
 * State, state digest and path siblings use native-state lower-case 0x hex.
 * Receipt/packet hashes use the existing unprefixed lower-case 32-byte format.
 * State provenance and actual C proof verification remain mandatory downstream.
 */
export function prepareNativeNode(input) {
  exact(input, ['packet', 'capsuleProof', 'evidenceState', 'evidenceStateDigest', 'receipt',
    'revokedEntries', 'validFrom', 'validUntil'], 'INPUT');
  const { packet, evidenceState: state } = input;
  exact(packet, [...CONTEXT_FIELDS, 'localCapsule', 'action', 'receiptSpendSecret', 'localCapsuleCommitment'], 'PACKET');
  assert.equal(packet.profile, NATIVE_CAPSULE_PROFILE.id, 'PAEG_NODE_PROFILE');
  for (const field of [...CONTEXT_FIELDS.slice(1, -1), 'localCapsuleCommitment']) digest(packet[field], field);
  const cutoff = uint(packet.settleBefore, U64_MAX, 'SETTLE_BEFORE');
  const local = packet.localCapsule;
  exact(local, LOCAL_FIELDS, 'LOCAL');
  assert.ok(!Object.is(local.slot, -0), 'PAEG_NODE_SLOT');
  const localWitness = localCapsuleToNoir(local);
  assert.equal(localCapsuleCommitment(packet, local), packet.localCapsuleCommitment, 'PAEG_NODE_LOCAL_COMMITMENT');
  const capsule = capsulePackage(input.capsuleProof);
  for (const [index, field] of CONTEXT_FIELDS.slice(1, -1).entries()) {
    assert.equal(digestAt(capsule.publicInputs, index * 8), packet[field], 'PAEG_NODE_CAPSULE_CONTEXT');
  }
  assert.equal(digestAt(capsule.publicInputs, 64 + local.slot * 8), packet.localCapsuleCommitment, 'PAEG_NODE_CAPSULE_LOCAL');
  assert.equal(capsule.publicInputs[128], packet.settleBefore, 'PAEG_NODE_CAPSULE_CUTOFF');
  const from = uint(input.validFrom, U64_MAX, 'VALID_FROM'), until = uint(input.validUntil, U64_MAX, 'VALID_UNTIL');
  assert.ok(from < until && until <= cutoff, 'PAEG_NODE_INTERVAL');

  exact(state, EVIDENCE_STATE_FIELDS, 'STATE');
  const stateWitness = evidenceStateToNoir(state);
  nativeDigestWords(input.evidenceStateDigest);
  assert.equal(evidenceStateDigest(state), input.evidenceStateDigest, 'PAEG_NODE_STATE_DIGEST');
  assert.equal(state.hubDomain, `0x${packet.hubDomain}`, 'PAEG_NODE_STATE_CONTEXT');
  assert.equal(state.registryCommitment, `0x${packet.registryCommitment}`, 'PAEG_NODE_STATE_CONTEXT');
  array(input.revokedEntries, 64, 'REVOKED');
  const revoked = boundedListToNoir(NATIVE_STATE_PREFIX.revoked, state.hubDomain, input.revokedEntries, state.revokedCount);
  assert.equal(boundedListDigest(NATIVE_STATE_PREFIX.revoked, state.hubDomain, input.revokedEntries, state.revokedCount),
    state.revokedDigest, 'PAEG_NODE_REVOKED_DIGEST');

  let receiptWitness, siblings, index, secret, tag;
  if (local.active) {
    exact(packet.action, ACTION_FIELDS, 'ACTION');
    nativeActionToNoir(packet.action);
    assert.equal(nativeTransferActionCommitment(packet.action), local.actionCommitment, 'PAEG_NODE_ACTION_COMMITMENT');
    for (const field of ['chainDomain', 'receiptKeyCommitment', 'receiptRho']) {
      assert.equal(packet.action[field], local[field], 'PAEG_NODE_ACTION_BINDING');
    }
    assert.equal(packet.action.settleBefore, packet.settleBefore, 'PAEG_NODE_ACTION_CUTOFF');
    digest(packet.receiptSpendSecret, 'SPEND_SECRET');
    exact(input.receipt, ['opening', 'path'], 'RECEIPT');
    exact(input.receipt.opening, READ_FIELDS, 'READ');
    const opening = nativeReceiptReadOpening(input.receipt.opening);
    for (const field of ['hubDomain', 'registryCommitment', 'scope', 'policy']) {
      assert.equal(opening[field], packet[field], 'PAEG_NODE_RECEIPT_CONTEXT');
    }
    for (const field of LOCAL_RECEIPT_FIELDS) assert.equal(opening[field], local[field], 'PAEG_NODE_RECEIPT_LOCAL');
    assert.ok(BigInt(opening.validFrom) <= from && until <= BigInt(opening.validUntil), 'PAEG_NODE_RECEIPT_INTERVAL');
    exact(input.receipt.path, ['index', 'siblings'], 'PATH');
    array(input.receipt.path.siblings, 6, 'SIBLINGS', 6);
    const position = uint(input.receipt.path.index, 63n, 'RECEIPT_INDEX');
    assert.ok(position < BigInt(state.receiptCount), 'PAEG_NODE_RECEIPT_COUNT');
    membership(`0x${nativeReceiptCommitment(opening)}`, input.receipt.path.siblings, input.receipt.path.index, state.receiptRoot);
    assert.ok(!input.revokedEntries.slice(0, Number(state.revokedCount)).includes(`0x${opening.globalEffectId}`),
      'PAEG_NODE_REVOKED_RECEIPT');
    tag = nativeReceiptNullifier(opening, packet.receiptSpendSecret);
    receiptWitness = nativeReceiptToNoir(opening);
    siblings = input.receipt.path.siblings.map(value => [...Buffer.from(value.slice(2), 'hex')]);
    index = input.receipt.path.index;
    secret = [...Buffer.from(packet.receiptSpendSecret, 'hex')];
  } else {
    assert.equal(packet.action, null, 'PAEG_NODE_PADDING_ACTION');
    assert.equal(packet.receiptSpendSecret, ZERO, 'PAEG_NODE_PADDING_SECRET');
    assert.equal(input.receipt, null, 'PAEG_NODE_PADDING_RECEIPT');
    receiptWitness = emptyReceipt();
    siblings = Array.from({ length: 6 }, () => Array(32).fill(0));
    index = '0'; secret = Array(32).fill(0); tag = local.dummyTerminalTag;
  }
  const publicInputs = {
    hub_domain: words(packet.hubDomain), registry_commitment: words(packet.registryCommitment),
    evidence_state: nativeDigestWords(input.evidenceStateDigest), context: words(packet.context),
    payout_commitment: words(local.payoutCommitment), terminal_receipt_tag: words(tag),
    slot: String(local.slot), valid_from: input.validFrom, valid_until: input.validUntil,
  };
  const expectedPublicInputs = Object.values(publicInputs).flat();
  assert.equal(expectedPublicInputs.length, NATIVE_NODE_PUBLIC_INPUT_COUNT, 'PAEG_NODE_ABI');
  return { inputs: { ...publicInputs, capsule_proof: capsule.proofFields, capsule_inputs: capsule.publicInputs,
    local: localWitness, state_opening: stateWitness, own_receipt: receiptWitness, receipt_spend_secret: secret,
    receipt_siblings: siblings, receipt_index: index, revoked_entries: revoked.entries }, expectedPublicInputs };
}
