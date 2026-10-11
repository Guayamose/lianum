/** Exact public claim permit byte contracts. These pure codecs grant no
 * observer, signing, custody or deployment authority. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, bytes32 } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';
import { claimUint } from './framing.mjs';
import { createNativeQuorumHostVerifier } from '../evidence/native-quorum.mjs';

export const CLAIM_ACTIONS = Object.freeze({ PREPOSITION: '0', RENEW: '1', RESERVE_INGRESS: '2',
  ISSUE: '3', VOID: '4', REDEEM: '5', BEGIN_PAYOUT: '6', RESERVE_PAYOUT: '7' });
export const CLAIM_ACTION_FIELDS = frozenInput([
  ['action', 1], ['operationId', 32], ['revision', 8], ['amount', 8], ['destinationCommitment', 32],
  ['maxFee', 8], ['nullifier', 32], ['wireBindingCommitment', 32], ['routeCommitment', 32],
  ['claimSequence', 8], ['hubSequence', 8],
]);
export const CLAIM_BACKING_FIELDS = frozenInput([
  ['claimDomain', 'b32'], ['custodyInventoryDomain', 'b32'], ['actionDigest', 'b32'],
  ['expectedClaimSequence', 'u64'], ['hubStateSequence', 'u64'], ['revocationState', 'b32'],
  ['wrapperSupply', 'u256'], ['pendingRedemptions', 'u256'], ['pendingRefunds', 'u256'],
  ['heldUnissued', 'u256'], ['unknownExposure', 'u256'], ['nativePrincipalAvailable', 'u256'],
  ['feeReserveAvailable', 'u256'], ['reservedFeesAfter', 'u256'], ['inventoryCommitment', 'b32'],
  ['obligationsCommitment', 'b32'], ['validFrom', 'u64'], ['validUntil', 'u64'],
]);
export const CLAIM_INGRESS_AUTHORIZATION_FIELDS = frozenInput([
  ['claimDomain', 'b32'], ['intentId', 'b32'], ['revision', 'u64'], ['claimSequence', 'u64'],
  ['hubStateSequence', 'u64'], ['amount', 'u64'], ['wireKeyCommitment', 'b32'],
  ['unsignedWireCommitment', 'b32'], ['maxFee', 'u64'], ['revocationState', 'b32'],
  ['inventoryCommitment', 'b32'], ['obligationsCommitment', 'b32'], ['validFrom', 'u64'], ['validUntil', 'u64'],
]);
const hex = value => Buffer.from(bytes32(value), 'hex');
const uint = (value, width) => Buffer.from(claimUint(value, width * 8).toString(16).padStart(width * 2, '0'), 'hex');
export function claimFrame(tag, parts) {
  return Buffer.concat([Buffer.from(tag, 'ascii'), ...parts].flatMap(part => {
    const length = Buffer.alloc(4); length.writeUInt32BE(part.length); return [length, part];
  }));
}
export const claimHash = bytes => createHash('sha256').update(bytes).digest('hex');
export function claimActionFrame(domain, raw) {
  const value = cloneInput(raw); exactRecord(value, CLAIM_ACTION_FIELDS.map(([name]) => name));
  assert.ok(Object.values(CLAIM_ACTIONS).includes(value.action), 'CLAIM_ACTION'); bytes32(domain, true);
  return claimFrame('LIANUM/PAEG/native-claim-action/1', [hex(domain), ...CLAIM_ACTION_FIELDS.map(([name, width]) =>
    width === 32 ? hex(value[name]) : uint(value[name], width))]);
}
export const claimActionDigest = (domain, value) => claimHash(claimActionFrame(domain, value));
export function claimBackingFrame(raw) {
  const value = cloneInput(raw); exactRecord(value, CLAIM_BACKING_FIELDS.map(([name]) => name));
  for (const name of ['claimDomain', 'custodyInventoryDomain', 'actionDigest', 'inventoryCommitment', 'obligationsCommitment'])
    bytes32(value[name], true);
  const from = claimUint(value.validFrom), until = claimUint(value.validUntil);
  assert.ok(from < until && until - from <= 30n, 'CLAIM_PERMIT_WINDOW');
  return claimFrame('LIANUM/PAEG/native-claim-backing-permit/1', CLAIM_BACKING_FIELDS.map(([name, type]) =>
    type === 'b32' ? hex(value[name]) : uint(value[name], Number(type.slice(1)) / 8)));
}
export const claimBackingDigest = value => claimHash(claimBackingFrame(value));
/** Native before-sign only. No gateway accepts this as health, backing or an
 * admission-N reservation; the distinct tag prevents cross-role replay. */
function presignFrame(raw, ingress) {
  const fields = CLAIM_INGRESS_AUTHORIZATION_FIELDS.map(([name, type]) => [!ingress && name === 'intentId' ? 'ticketId' : name, type]);
  const value = cloneInput(raw); exactRecord(value, fields.map(([name]) => name));
  for (const [name, type] of fields) if (type === 'b32') bytes32(value[name], true);
  const from = claimUint(value.validFrom), until = claimUint(value.validUntil);
  assert.ok(from < until && until - from <= 30n, 'CLAIM_INGRESS_AUTHORIZATION_WINDOW');
  assert.ok(claimUint(value.amount) > 0n && claimUint(value.maxFee) > 0n && claimUint(value.revision) > 0n, 'CLAIM_INGRESS_AUTHORIZATION_TERMS');
  return claimFrame('LIANUM/PAEG/native-claim-presign-' + (ingress ? 'ingress' : 'payout') + '/1', fields.map(([name, type]) =>
    type === 'b32' ? hex(value[name]) : uint(value[name], Number(type.slice(1)) / 8)));
}
export const claimIngressAuthorizationFrame = raw => presignFrame(raw, true);
export const claimPayoutAuthorizationFrame = raw => presignFrame(raw, false);
/** A separate post-reservation authorization for the sole broadcast of an
 * already signed nonce transaction. It cannot serve as a before-sign permit. */
export function claimPayoutBroadcastFrame(raw) {
  const signedNames = ['admissionN', 'nativeGid', 'wireBindingCommitment'];
  const fields = CLAIM_INGRESS_AUTHORIZATION_FIELDS.map(([name, type]) => [name === 'intentId' ? 'ticketId' : name, type]);
  const value = cloneInput(raw);
  exactRecord(value, [...fields.map(([name]) => name), ...signedNames]);
  const prepared = Object.fromEntries(fields.map(([name]) => [name, value[name]]));
  // Validate the same amount, unsigned-wire binding, scope and <=30s window,
  // but put all values under an independent signed purpose and signed-wire join.
  presignFrame(prepared, false);
  signedNames.forEach(name => bytes32(value[name], true));
  return claimFrame('LIANUM/PAEG/native-claim-broadcast-payout/2', [
    ...fields.map(([name, type]) => type === 'b32' ? hex(value[name]) : uint(value[name], Number(type.slice(1)) / 8)),
    ...signedNames.map(name => hex(value[name])),
  ]);
}
export function claimUnsignedWireCommitment(raw) {
  const value = cloneInput(raw);
  exactRecord(value, ['claimDomain', 'intentId', 'revision', 'wireKeyCommitment', 'unsignedWire', 'wireSalt']);
  for (const name of ['claimDomain', 'intentId', 'wireKeyCommitment', 'wireSalt']) bytes32(value[name], true);
  assert.ok(typeof value.unsignedWire === 'string' && /^(?:[0-9a-f]{2})+$/.test(value.unsignedWire), 'CLAIM_UNSIGNED_WIRE_BYTES');
  return claimHash(claimFrame('LIANUM/PAEG/native-claim-unsigned-wire/1', [hex(value.claimDomain), hex(value.intentId),
    uint(value.revision, 8), hex(value.wireKeyCommitment), hex(claimHash(Buffer.from(value.unsignedWire, 'hex'))), hex(value.wireSalt)]));
}
export function claimRouteFrame(raw) {
  const value = cloneInput(raw);
  exactRecord(value, ['endpoint', 'salt', 'quotedFee', 'selectedInputValue', 'changeFloor', 'destinationFunded']);
  assert.ok(typeof value.endpoint === 'string' && /^(?:0014[0-9a-f]{40}|[0-9a-f]{64})$/.test(value.endpoint), 'CLAIM_ROUTE_ENDPOINT');
  assert.equal(typeof value.destinationFunded, 'boolean', 'CLAIM_ROUTE_FUNDED');
  return claimFrame('LIANUM/PAEG/native-claim-route/1', [Buffer.from(value.endpoint, 'hex'), hex(value.salt),
    uint(value.quotedFee, 8), uint(value.selectedInputValue, 8), uint(value.changeFloor, 8),
    Buffer.from([Number(value.destinationFunded)])]);
}
export const claimRouteCommitment = value => claimHash(claimRouteFrame(value));
export function claimSignedWireCommitment(raw) {
  const value = cloneInput(raw);
  exactRecord(value, ['claimDomain', 'operationId', 'revision', 'admissionN', 'wireKeyCommitment', 'nativeGid', 'transactionSHA256', 'wireSalt']);
  for (const name of Object.keys(value).filter(name => name !== 'revision')) bytes32(value[name], true);
  return claimHash(claimFrame('LIANUM/PAEG/native-claim-signed-wire/1', [hex(value.claimDomain), hex(value.operationId),
    uint(value.revision, 8), ...['admissionN', 'wireKeyCommitment', 'nativeGid', 'transactionSHA256', 'wireSalt'].map(name => hex(value[name]))]));
}

/** Low-S, ordered three-of-four verification; registry identity must be pinned
 * by its caller. Never treats an issuer assertion as backing provenance. */
export function assertClaimBackingQuorum(raw, { registry, registryCommitment, timestamp }) {
  const permit = cloneInput(raw); exactRecord(permit, ['message', 'indexes', 'signatures']);
  const frame = claimBackingFrame(permit.message), now = claimUint(timestamp);
  assert.ok(claimUint(permit.message.validFrom) <= now && now < claimUint(permit.message.validUntil), 'CLAIM_PERMIT_EXPIRED');
  createNativeQuorumHostVerifier({ registry, expectedRegistryCommitment: registryCommitment })
    .assertQuorumForMessage({ messageBytes: frame, indexes: permit.indexes, signatures: permit.signatures });
}
