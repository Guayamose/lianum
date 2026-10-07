import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { canonical } from '../crypto/privacy.mjs';

export const commitment = record => '0x' + createHash('sha256').update('PAEG/local-funded-order/1\n').update(canonical(record)).digest('hex');
// expected is retained before delivery and independently identifies the intended
// funded owner's reservation. Neither package nor proof may replace it.
export function requireFundedOrder(order, expected, observed) {
  assert.equal(observed.state, 'OPEN', 'FUNDED_OPEN_RESERVATION');
  return requireBoundOrder(order, expected, observed);
}
// Read-only reconciliation may inspect a terminal reservation. Identity and
// immutable terms are checked exactly as for admission; ABSENT is not binding.
export function requireBoundOrder(order, expected, observed) {
  assert.equal(observed.authority, expected.authority, 'INTENDED_AUTHORITY');
  assert.equal(observed.id, expected.id, 'INTENDED_RESERVATION');
  assert.equal(observed.owner, expected.owner, 'INTENDED_OWNER');
  assert.ok(['OPEN', 'PAID', 'REFUNDED'].includes(observed.state), 'BOUND_RESERVATION_STATE');
  assert.equal(observed.orderHash, expected.orderHash, 'FROZEN_RESERVATION_HASH');
  assert.equal(commitment(order), observed.orderHash, 'ORDER_REPLACEMENT');
  for (const key of ['owner', 'solver', 'amountWei', 'scriptHash', 'sats', 'executeBy', 'claimBy', 'profile']) assert.equal(order[key], observed[key], 'ORDER_TERM_' + key);
  assert.ok(BigInt(observed.amountWei) > 0n, 'FUNDED_AMOUNT');
  return { reservationId: expected.id, frozenOrderHash: expected.orderHash, source: 'independent intended local contract read', authorizedByNativeOwner: true, hiddenAuthorizationProved: false };
}
export function requireExactMenuPackage(pkg, frozenManifest) {
  assert.equal(frozenManifest.kind, 'PC5_QB_PREPARATION_ONLY');
  assert.deepEqual(Object.keys(pkg).sort(), ['branches', 'menuBinding', 'scope', 'session', 'verificationKeySHA256']);
  for (const key of ['scope', 'session', 'menuBinding', 'verificationKeySHA256']) assert.equal(pkg[key], frozenManifest[key], 'FROZEN_MENU_' + key);
  assert.equal(pkg.branches.length, 2); assert.equal(frozenManifest.branches.length, 2);
  for (let j = 0; j < 2; j++) {
    assert.deepEqual(Object.keys(pkg.branches[j]).sort(), ['C_B', 'C_S', 'branch']);
    assert.equal(pkg.branches[j].branch, j); assert.equal(frozenManifest.branches[j].branch, j);
    for (const key of ['C_S', 'C_B']) assert.equal(pkg.branches[j][key], frozenManifest.branches[j][key], 'FROZEN_EXACT_PAIR_' + key);
  }
  return commitment(frozenManifest);
}
export function requireUnanimousCopies(acks, reservationId, frozenHash) {
  assert.equal(acks.length, 4); assert.deepEqual(acks.map(a => a.role).sort(), ['E_B', 'E_S', 'P_B', 'P_S']);
  for (const a of acks) { assert.equal(a.reservationId, reservationId); assert.equal(a.frozenHash, frozenHash, 'HOLDER_EQUIVOCATION'); }
  return true; // Interface equality only; caller must authenticate each holder and durable receipt.
}
export const ackBytes = ack => Buffer.from('PAEG/local-retained-copy-ack/1\n' + canonical({ role: ack.role, reservationId: ack.reservationId, frozenHash: ack.frozenHash }));
export function requireAuthenticatedCopies(acks, reference, frozenManifest) {
  requireUnanimousCopies(acks, reference.id, reference.orderHash);
  assert.equal(commitment(frozenManifest), reference.orderHash);
  for (const ack of acks) {
    assert.deepEqual(Object.keys(ack).sort(), ['frozenHash', 'reservationId', 'role', 'signature']);
    assert.match(ack.signature, /^[0-9a-f]{128}$/);
    const key = createPublicKey({ key: Buffer.from(frozenManifest.holders[ack.role], 'base64'), format: 'der', type: 'spki' });
    assert.equal(verify(null, ackBytes(ack), key, Buffer.from(ack.signature, 'hex')), true, 'HOLDER_ACK_SIGNATURE');
  }
  return { allRequiredCopiesAcknowledgeSameFrozenValue: true, provesFutureAvailability: false, authorizesNativeTripleExposure: false };
}
