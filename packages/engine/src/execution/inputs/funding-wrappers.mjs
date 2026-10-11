// Pure owner/prover-side ABI composition. These checks are NOT a proof verifier.
// The returned object contains PRIVATE child proof inputs and membership paths.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fundedAdmission } from '../graph/funded-graph.mjs';

export const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const A0 = Object.freeze({
  scope: 0, policy: 8, asset: 16, operationId: 24, inputCommitment: 32,
  inputNullifier: 40, reservationIntent: 48, graphCommitment: 56, treeRoot: 64,
  reserveCommitment: 72, reserveNullifier: 80, changeCommitment: 88,
  outputs: 96, recoveryCommitment: 128, fundingNotBefore: 136,
  fundingValidUntil: 137, settleBefore: 138, length: 139,
});
export const PUBLIC_ABI = Object.freeze({
  reserve: Object.freeze([
    ['scope', 8], ['policy', 8], ['asset', 8], ['base_root', 8],
    ['input_nullifier', 8], ['reserve_commitment', 8], ['change_commitment', 8],
    ['admission_tag', 8], ['valid_from', 1], ['valid_until', 1],
  ].map(Object.freeze)),
  refund: Object.freeze([
    ['scope', 8], ['policy', 8], ['asset', 8], ['accepted_root', 8],
    ['reserve_nullifier', 8], ['recovery_commitment', 8],
    ['settle_before', 1], ['valid_from', 1], ['valid_until', 1],
  ].map(Object.freeze)),
});

export function canonicalField(value, maximum = FIELD_MODULUS) {
  assert.equal(typeof value, 'string', 'PAEG_WRAPPER_FIELD_STRING');
  assert.match(value, /^(0|[1-9][0-9]*)$/, 'PAEG_WRAPPER_FIELD_ENCODING');
  assert.ok(value.length <= 78 && BigInt(value) < maximum, 'PAEG_WRAPPER_FIELD_RANGE');
  return value;
}

const array = (values, length, maximum = FIELD_MODULUS) => {
  assert.ok(Array.isArray(values) && values.length === length, 'PAEG_WRAPPER_ARRAY_LENGTH');
  return values.map(value => canonicalField(value, maximum));
};

export function ownerStatement(values) {
  assert.ok(Array.isArray(values) && values.length === 139, 'PAEG_WRAPPER_A0_LENGTH');
  return values.map((value, i) => canonicalField(value, 1n << (i < 136 ? 32n : 64n)));
}

export function digestHex(values) {
  return array(values, 8, 1n << 32n).map(value => BigInt(value).toString(16).padStart(8, '0')).join('');
}

export function digestWords(hex) {
  assert.equal(typeof hex, 'string', 'PAEG_WRAPPER_DIGEST_TYPE');
  assert.match(hex, /^[0-9a-f]{64}$/, 'PAEG_WRAPPER_DIGEST_HEX');
  const bytes = Buffer.from(hex, 'hex');
  return Array.from({ length: 8 }, (_, i) => String(bytes.readUInt32BE(i * 4)));
}

const ownerDigest = (values, offset) => values.slice(offset, offset + 8);
const ownerHex = (values, offset) => digestHex(ownerDigest(values, offset));
const timestamp = value => canonicalField(value, 1n << 64n);
const sha256 = bytes => createHash('sha256').update(bytes).digest();

function pathWitness(siblings, leafIndex) {
  assert.ok(Array.isArray(siblings) && siblings.length === 6, 'PAEG_WRAPPER_TREE_DEPTH');
  assert.ok(Number.isInteger(leafIndex) && leafIndex >= 0 && leafIndex < 64, 'PAEG_WRAPPER_LEAF_INDEX');
  return siblings.map(hex => Buffer.from(digestHex(digestWords(hex)), 'hex'));
}

/** Legacy SHA256(0x01 || left32 || right32), with least-significant index bit first. */
export function membershipRoot(commitment, siblings, leafIndex) {
  let node = Buffer.from(digestHex(digestWords(commitment)), 'hex');
  pathWitness(siblings, leafIndex).forEach((sibling, depth) => {
    node = sha256(Buffer.concat([Buffer.from([1]), ...((leafIndex >> depth) & 1 ? [sibling, node] : [node, sibling])]));
  });
  return node.toString('hex');
}

function child(owner) {
  assert.ok(owner && typeof owner === 'object', 'PAEG_WRAPPER_OWNER_PROOF');
  return {
    owner_vk: array(owner.vkFields, 115),
    owner_proof: array(owner.proofFields, 458),
    owner_inputs: ownerStatement(owner.publicInputs),
  };
}

/** All child proof and path arguments remain private; this is only serialization. */
export function reserveInputs(owner, { baseRoot, siblings, leafIndex, validFrom, validUntil }) {
  const privateChild = child(owner), a = privateChild.owner_inputs;
  timestamp(validFrom); timestamp(validUntil);
  assert.ok(BigInt(a[A0.fundingNotBefore]) <= BigInt(validFrom)
    && BigInt(validFrom) < BigInt(validUntil)
    && BigInt(validUntil) <= BigInt(a[A0.fundingValidUntil]), 'PAEG_WRAPPER_FUNDING_WINDOW');
  assert.equal(membershipRoot(ownerHex(a, A0.inputCommitment), siblings, leafIndex), baseRoot, 'PAEG_WRAPPER_INPUT_MEMBERSHIP');
  const shared = Object.fromEntries(['scope', 'policy', 'asset', 'operationId'].map(name => [name, ownerHex(a, A0[name])]));
  return {
    scope: ownerDigest(a, A0.scope), policy: ownerDigest(a, A0.policy), asset: ownerDigest(a, A0.asset),
    base_root: digestWords(baseRoot), input_nullifier: ownerDigest(a, A0.inputNullifier),
    reserve_commitment: ownerDigest(a, A0.reserveCommitment), change_commitment: ownerDigest(a, A0.changeCommitment),
    admission_tag: digestWords(fundedAdmission(shared)), valid_from: validFrom, valid_until: validUntil,
    ...privateChild, input_siblings: pathWitness(siblings, leafIndex).map(bytes => [...bytes]), input_leaf_index: leafIndex,
  };
}

/** All child proof and path arguments remain private; this is only serialization. */
export function refundInputs(owner, { acceptedRoot, siblings, leafIndex, validFrom, validUntil }) {
  const privateChild = child(owner), a = privateChild.owner_inputs;
  timestamp(validFrom); timestamp(validUntil);
  assert.ok(BigInt(a[A0.settleBefore]) <= BigInt(validFrom) && BigInt(validFrom) < BigInt(validUntil), 'PAEG_WRAPPER_REFUND_WINDOW');
  assert.equal(membershipRoot(ownerHex(a, A0.reserveCommitment), siblings, leafIndex), acceptedRoot, 'PAEG_WRAPPER_RESERVE_MEMBERSHIP');
  return {
    scope: ownerDigest(a, A0.scope), policy: ownerDigest(a, A0.policy), asset: ownerDigest(a, A0.asset),
    accepted_root: digestWords(acceptedRoot), reserve_nullifier: ownerDigest(a, A0.reserveNullifier),
    recovery_commitment: ownerDigest(a, A0.recoveryCommitment), settle_before: a[A0.settleBefore],
    valid_from: validFrom, valid_until: validUntil,
    ...privateChild, reserve_siblings: pathWitness(siblings, leafIndex).map(bytes => [...bytes]), reserve_leaf_index: leafIndex,
  };
}

/** Explicit allowlist; never serialize the witness object into calldata. */
export function publicWords(mode, inputs) {
  assert.ok(Object.hasOwn(PUBLIC_ABI, mode), 'PAEG_WRAPPER_MODE');
  return PUBLIC_ABI[mode].flatMap(([name, count]) => count === 8
    ? array(inputs[name], count, 1n << 32n) : [timestamp(inputs[name])]);
}
