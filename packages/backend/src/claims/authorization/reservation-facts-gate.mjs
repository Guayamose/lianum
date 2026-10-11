import {NATIVE_SPL_CLAIM_INTENT_PROFILE_V1,validateNativeSplClaimBindingTransactionV1} from '../../chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
/** Private reservation/facts join. No signing or authority is created here.
 * Owned operators retain these bindings in their separate encrypted journals;
 * the only ordinary facts request remains family/recipientIndex/nativeId/K. */
import assert from 'node:assert/strict';
import { exactRecord, bytes32, ZERO } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';
import { receiptKeyCommitment, nativeAdmissionNullifier, nativeFactIdentity,
  validateBitcoinBinding } from '@lianum/engine/native/native-receipt-binding';
import { validateClaimSolanaBindingTransaction } from '../../chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { claimUint, claimTicketSecret } from '@lianum/engine/claims/framing';
import { claimSignedWireCommitment } from '@lianum/engine/claims/permits';

export const CLAIM_FACT_REQUEST_FIELDS = Object.freeze(['family', 'recipientIndex', 'nativeId', 'wireKeyCommitment']);
const PRIVATE_FIELDS = ['claimDomain', 'gateway', 'ledgerNamespace', 'genesis', 'asset', 'operationId',
  'revision', 'ingress', 'request', 'receiptSecret', 'wireSalt', 'nativeWire', 'intent'];
const DERIVED_FIELDS = ['nativeGid', 'admissionN', 'transactionSHA256', 'wireBindingCommitment'];
export function claimFactsRequest(raw) {
  const value = cloneInput(raw); exactRecord(value, CLAIM_FACT_REQUEST_FIELDS);
  assert.ok(['1', '2'].includes(value.family), 'CLAIM_FACT_FAMILY');
  assert.ok(['0', '1'].includes(value.recipientIndex), 'CLAIM_FACT_RECIPIENT');
  assert.ok(typeof value.nativeId === 'string' && new RegExp(`^[0-9a-f]{${value.family === '1' ? 64 : 128}}$`).test(value.nativeId)
    && /[1-9a-f]/.test(value.nativeId), 'CLAIM_FACT_NATIVE_ID');
  bytes32(value.wireKeyCommitment, true); return frozenInput(value);
}
export function createClaimReservationBinding(raw) {
  const value = cloneInput(raw); exactRecord(value, PRIVATE_FIELDS);
  for (const name of ['claimDomain', 'ledgerNamespace', 'genesis', 'asset', 'operationId', 'receiptSecret', 'wireSalt']) bytes32(value[name], true);
  assert.match(value.gateway, /^[0-9a-f]{40}$/, 'CLAIM_RESERVATION_GATEWAY');
  assert.notEqual(value.gateway, '0'.repeat(40), 'CLAIM_RESERVATION_GATEWAY');
  assert.ok(claimUint(value.revision) > 0n, 'CLAIM_RESERVATION_REVISION');
  assert.equal(typeof value.ingress, 'boolean', 'CLAIM_RESERVATION_KIND');
  const request = claimFactsRequest(value.request);
  const wire = request.family === '1' ? validateBitcoinBinding(value.nativeWire, value.intent)
    : value.intent.profile===NATIVE_SPL_CLAIM_INTENT_PROFILE_V1?validateNativeSplClaimBindingTransactionV1(value.nativeWire,value.intent):validateClaimSolanaBindingTransaction(value.nativeWire, value.intent);
  // Candidate-only exact v2 SOL ingress joins. The owned deployment gate
  // separately requires the actual new CI51-compatible verifier lineage.
  if (value.ingress) assert.ok(wire.wireBindingVersion === '1'
    || (request.family === '2' && wire.wireBindingVersion === '2'), 'CLAIM_INGRESS_FIXED_PROFILE');
  if (request.family === '1') assert.equal(wire.containsWitness, true, 'CLAIM_RESERVATION_UNSIGNED');
  assert.equal(request.nativeId, request.family === '1' ? wire.txid : wire.signatureHex, 'CLAIM_RESERVATION_NATIVE_ID');
  assert.equal(wire.wireKeyCommitment, request.wireKeyCommitment, 'CLAIM_RESERVATION_WIRE_K');
  assert.equal(receiptKeyCommitment({ ledgerNamespace: value.ledgerNamespace, secret: value.receiptSecret }),
    request.wireKeyCommitment, 'CLAIM_RESERVATION_SECRET_K');
  if (!value.ingress) assert.equal(value.receiptSecret,
    claimTicketSecret({ claimDomain: value.claimDomain, ticketId: value.operationId }), 'CLAIM_RESERVATION_TICKET_SECRET');
  const nativeGid = nativeFactIdentity({ family: request.family, genesis: value.genesis, asset: value.asset,
    transactionId: request.nativeId + (request.family === '1' ? ZERO : ''), effectIndex: wire.effectIndex });
  const admissionN = nativeAdmissionNullifier({ ledgerNamespace: value.ledgerNamespace, secret: value.receiptSecret, nativeGid });
  const transactionSHA256 = wire.transactionSHA256;
  const wireBindingCommitment = claimSignedWireCommitment({ claimDomain: value.claimDomain, operationId: value.operationId,
    revision: value.revision, admissionN, wireKeyCommitment: request.wireKeyCommitment, nativeGid, transactionSHA256, wireSalt: value.wireSalt });
  return frozenInput({ ...value, nativeGid, admissionN, transactionSHA256, wireBindingCommitment });
}
export function validateClaimReservationBinding(raw) {
  const value = cloneInput(raw); exactRecord(value, [...PRIVATE_FIELDS, ...DERIVED_FIELDS]);
  const rebuilt = createClaimReservationBinding(Object.fromEntries(PRIVATE_FIELDS.map(name => [name, value[name]])));
  assert.deepEqual(value, rebuilt, 'CLAIM_RESERVATION_PRIVATE_BINDING_CHANGED'); return rebuilt;
}
/** The permanent authority row remains authoritative after consumption. A
 * renewal changes current owner revision, never this signed-effect revision. */
export function assertCanonicalClaimReservation(rawBinding, rawReservation) {
  const binding = validateClaimReservationBinding(rawBinding);
  assert.ok(rawReservation !== null && rawReservation !== undefined, 'CLAIM_RESERVATION_NOT_INCLUDED');
  const reservation = cloneInput(rawReservation);
  exactRecord(reservation, ['gateway', 'operationId', 'revision', 'wireBindingCommitment', 'ingress', 'consumed']);
  assert.equal(typeof reservation.consumed, 'boolean', 'CLAIM_RESERVATION_STATUS');
  for (const name of ['gateway', 'operationId', 'revision', 'wireBindingCommitment', 'ingress'])
    assert.equal(reservation[name], binding[name], 'CLAIM_RESERVATION_CANONICAL_' + name);
  return frozenInput(reservation);
}
/** Both reads must use the owned canonical observer at one anchor. This pure
 * plumbing intentionally does not brand supplied callbacks as trusted. */
export async function observeReservedClaimFact({ binding: rawBinding, request: rawRequest, readReservation, observe, assertCurrent }) {
  const binding = validateClaimReservationBinding(rawBinding), request = claimFactsRequest(rawRequest);
  assert.deepEqual(request, binding.request, 'CLAIM_RESERVATION_REQUEST_CHANGED');
  const lookup = frozenInput({ claimDomain: binding.claimDomain, admissionN: binding.admissionN });
  const before = assertCanonicalClaimReservation(binding, await readReservation(lookup));
  await assertCurrent();
  const observed = cloneInput(await observe(frozenInput({ family: request.family, recipientIndex: request.recipientIndex, nativeId: request.nativeId })));
  // Recheck even when native history is unavailable. Never certify a leaked,
  // early-broadcast native effect before its canonical reservation exists.
  const after = assertCanonicalClaimReservation(binding, await readReservation(lookup));
  assert.deepEqual(after, before, 'CLAIM_RESERVATION_CHANGED_DURING_OBSERVATION');
  await assertCurrent();
  if (observed.status === 'observed') {
    assert.equal(observed.nativeWire, binding.nativeWire, 'CLAIM_RESERVATION_ORIGINAL_WIRE_CHANGED');
    assert.deepEqual(observed.intent, binding.intent, 'CLAIM_RESERVATION_ORIGINAL_INTENT_CHANGED');
    assert.equal(observed.genesis, binding.genesis, 'CLAIM_RESERVATION_GENESIS');
    assert.equal(observed.asset, binding.asset, 'CLAIM_RESERVATION_ASSET');
  }
  return frozenInput(observed);
}
