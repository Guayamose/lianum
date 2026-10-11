/** Pure typed native-claim issue joins. Synthetic records can exercise this
 * validator but cannot establish owned observation, CI51/D27/quorum acceptance,
 * byte pins or canonicality. Those belong to the branded gateway observer. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, bytes32, canonicalField, ZERO } from '@lianum/components/encoding/commitments';
import { decodeDepositIntentInputs } from '@lianum/engine/execution/inputs/deposit-intent';
import { validateClaimConfig, claimDomainCommitment, claimIntentId, decodeClaimIngressInputs, claimUint }
  from '@lianum/engine/claims/framing';
import { CLAIM_ACTIONS, CLAIM_BACKING_FIELDS, claimActionDigest, claimBackingFrame }
  from '@lianum/engine/claims/permits';
import { decodeNativeClaimIssueCall } from '@lianum/engine/claims/issue-call';
import { ownerCopy, ownerDigest, flatOwnerIdentity, flatOwnerSnapshot, FLAT_OWNER_OBSERVATION_TRUST }
  from '../signing/owner-observation-contract.mjs';

export const FLAT_OWNER_NATIVE_CLAIM_ISSUE = 'NATIVE_CLAIM_ISSUE';
const same = (actual, expected) => assert.equal(ownerDigest(actual), ownerDigest(expected), 'FLAT_OWNER_CLAIM_BINDING');
const sha = raw => createHash('sha256').update(Buffer.from(raw, 'hex')).digest('hex');
function address(value) {
  assert.ok(typeof value === 'string' && value.length === 40 && /^[0-9a-f]{40}$/.test(value) && value !== '0'.repeat(40), 'FLAT_OWNER_CLAIM_ADDRESS');
}
function proof(value) {
  assert.ok(typeof value === 'string' && value.length <= 2 * 1024 * 1024
    && /^(?:[0-9a-f]{2})+$/.exec(value)?.[0] === value, 'FLAT_OWNER_CLAIM_PROOF');
}
function window(from, until, now) {
  const start = claimUint(from), end = claimUint(until);
  assert.ok(start < end && start <= now && now < end, 'FLAT_OWNER_CLAIM_WINDOW');
}
const INTENT_FIELDS = ['id', 'state', 'output', 'amount', 'validFrom', 'validUntil', 'revision', 'proofHash', 'nullifier', 'refundDestination'];
const HUB_FIELDS = ['domain', 'receiptRoot', 'receiptCount', 'spentTagDigest', 'spentTagCount', 'spentTagSequence',
  'revokedDigest', 'revokedCount', 'revocationSequence', 'stateSequence', 'evidenceState', 'halted', 'reservedTagCapacity', 'totalReservedTagCapacity'];
const PHASE_FIELDS = ['blockHash', 'intent', 'reservation', 'receiptReservation', 'reservedReceiptCapacity', 'reservationOwner',
  'operationNullifier', 'admissionNullifier', 'claimSequence', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued',
  'reservedFees', 'reservedRefundTickets', 'activePayout', 'hubState', 'receiptLeaves', 'admissionRevocationState', 'revocationOverflowCount'];
function checkClaimPhase(phase, config, blockHash) {
  exactRecord(phase, PHASE_FIELDS); assert.equal(phase.blockHash, blockHash, 'FLAT_OWNER_CLAIM_STATE_BLOCK');
  for (const name of ['receiptReservation', 'reservedReceiptCapacity', 'claimSequence', 'reservedRefundTickets', 'revocationOverflowCount']) claimUint(phase[name]);
  for (const name of ['pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees']) claimUint(phase[name], 256);
  assert.equal(phase.reservedReceiptCapacity, phase.reservedRefundTickets, 'FLAT_OWNER_CLAIM_RESERVED_CAPACITY');
  assert.ok(claimUint(phase.reservedRefundTickets) <= 32n, 'FLAT_OWNER_CLAIM_RESERVED_CAPACITY');
  assert.equal(phase.activePayout, ZERO, 'FLAT_OWNER_CLAIM_ACTIVE_PAYOUT');
  assert.equal(phase.revocationOverflowCount, '0', 'FLAT_OWNER_CLAIM_REVOCATION_OVERFLOW');
  assert.equal(typeof phase.admissionNullifier, 'boolean');
  bytes32(phase.operationNullifier, true); address(phase.reservationOwner);
  canonicalField(phase.admissionRevocationState, true);
  const intent = phase.intent; exactRecord(intent, INTENT_FIELDS);
  for (const name of ['id', 'output', 'proofHash', 'nullifier', 'refundDestination']) bytes32(intent[name], true);
  for (const name of ['state', 'amount', 'validFrom', 'validUntil', 'revision']) claimUint(intent[name]);
  assert.ok(claimUint(intent.amount) > 0n && claimUint(intent.revision) > 0n);
  assert.ok(claimUint(intent.validFrom) < claimUint(intent.validUntil));
  const reservation = phase.reservation;
  exactRecord(reservation, ['gateway', 'operationId', 'revision', 'wireBindingCommitment', 'ingress', 'consumed']);
  address(reservation.gateway); bytes32(reservation.operationId, true); bytes32(reservation.wireBindingCommitment, true);
  assert.ok(claimUint(reservation.revision) > 0n && claimUint(reservation.revision) <= claimUint(intent.revision));
  assert.equal(reservation.ingress, true, 'FLAT_OWNER_CLAIM_INGRESS_RESERVATION');
  assert.equal(typeof reservation.consumed, 'boolean');
  assert.equal(reservation.gateway, config.gateway); assert.equal(reservation.operationId, intent.id);
  assert.equal(phase.reservationOwner, config.gateway); assert.equal(phase.operationNullifier, intent.nullifier);
  assert.equal(phase.admissionNullifier, reservation.consumed, 'FLAT_OWNER_CLAIM_N_CONSUMPTION');
  const hub = phase.hubState; exactRecord(hub, HUB_FIELDS); assert.equal(hub.domain, config.poolDomain);
  for (const name of ['receiptRoot', 'revokedDigest', 'evidenceState']) canonicalField(hub[name]);
  bytes32(hub.spentTagDigest); assert.equal(hub.halted, false, 'FLAT_OWNER_CLAIM_HALTED');
  for (const name of ['receiptCount', 'spentTagCount', 'spentTagSequence', 'revokedCount', 'revocationSequence',
    'stateSequence', 'reservedTagCapacity', 'totalReservedTagCapacity']) claimUint(hub[name]);
  assert.ok(claimUint(hub.receiptCount) + claimUint(phase.reservedReceiptCapacity) <= 64n);
  assert.ok(claimUint(hub.revokedCount) < 64n && claimUint(hub.revocationSequence) === claimUint(hub.revokedCount));
  assert.ok(claimUint(hub.spentTagCount) + claimUint(hub.totalReservedTagCapacity) <= 64n);
  assert.equal(claimUint(hub.spentTagCount), 4n * claimUint(hub.spentTagSequence));
  assert.ok(Array.isArray(phase.receiptLeaves) && phase.receiptLeaves.length <= 64);
  assert.equal(String(phase.receiptLeaves.length), hub.receiptCount);
  phase.receiptLeaves.forEach(leaf => canonicalField(leaf, true));
  assert.equal(new Set(phase.receiptLeaves).size, phase.receiptLeaves.length, 'FLAT_OWNER_CLAIM_DUPLICATE_RECEIPT');
}

export function validateFlatOwnerNativeClaimTransition(input, op, state, inclusion = op.submission) {
  assert.equal(op.kind, 'deposit_intent'); assert.ok(op.proof && inclusion, 'FLAT_OWNER_CLAIM_PREPARED_INTENT_REQUIRED');
  assert.ok(op.nativeClaim?.handoff, 'FLAT_OWNER_CLAIM_HANDOFF_REQUIRED');
  assert.equal(op.nativeClaim.handoff.claimDomain, op.nativeClaim.claimDomain);
  same(op.nativeClaim.handoff.statement, op.statement); same(op.nativeClaim.handoff.proofResult, op.proof);
  assert.equal(op.statement.output, state.notes.source.commitment, 'FLAT_OWNER_INTENT_NOTE');
  assert.equal(op.statement.amount, state.notes.source.opening.value, 'FLAT_OWNER_INTENT_NOTE');
  return validateNativeClaimIssueObservation(input, { identity: state.identity, statement: op.statement,
    ownerProof: op.proof.proof, publicInputs: op.publicInputs, claimDomain: op.nativeClaim.claimDomain }, inclusion);
}

/** Shared pure joins for the branded observer and custody. Expected public
 * values do not confer owner-note custody or proof-verification authority. */
export function validateNativeClaimIssueObservation(input, expected, inclusion) {
  exactRecord(expected, ['identity', 'statement', 'ownerProof', 'publicInputs', 'claimDomain']);
  const o = ownerCopy(input), id = flatOwnerIdentity(expected.identity);
  const op = { statement: expected.statement, publicInputs: expected.publicInputs, proof: { proof: expected.ownerProof } };
  assert.ok(id.assetBinding && inclusion, 'FLAT_OWNER_CLAIM_PREPARED_INTENT_REQUIRED');
  exactRecord(inclusion, ['transactionHash', 'calldataSHA256']); bytes32(inclusion.transactionHash, true); bytes32(inclusion.calldataSHA256, true);
  exactRecord(o, ['kind', 'identitySHA256', 'transaction', 'receipt', 'before', 'after', 'stateAdvanced',
    'delivery', 'deliveryEvent', 'assetObservation', 'claimObservation']);
  assert.equal(o.kind, FLAT_OWNER_NATIVE_CLAIM_ISSUE); assert.equal(o.identitySHA256, ownerDigest(id));
  exactRecord(o.transaction, ['hash', 'from', 'to', 'value', 'calldata']);
  exactRecord(o.receipt, ['transactionHash', 'blockHash', 'status']);
  const tx = o.transaction; bytes32(tx.hash, true); address(tx.from); address(tx.to); assert.equal(tx.value, '0');
  assert.equal(tx.hash, inclusion.transactionHash, 'FLAT_OWNER_CLAIM_TRANSACTION');
  const call = decodeNativeClaimIssueCall(tx.calldata);
  assert.equal(sha(tx.calldata.slice(2)), inclusion.calldataSHA256, 'FLAT_OWNER_CLAIM_CALLDATA');
  same(o.receipt, { transactionHash: tx.hash, blockHash: o.after.blockHash, status: 1 });
  const d = o.delivery;
  exactRecord(d, ['config', 'claimDomain', 'intentId', 'revision', 'publicInputs', 'ownerProof', 'ingressPublicInputs', 'ingressProof']);
  const config = validateClaimConfig(d.config), domain = claimDomainCommitment(config);
  assert.equal(d.claimDomain, domain); assert.equal(domain, expected.claimDomain, 'FLAT_OWNER_CLAIM_DOMAIN');
  for (const [key, expected] of Object.entries({ gateway: tx.to, pool: id.pool, poolDomain: id.domainCommitment,
    scope: id.domain.scope, policy: id.domain.policy, wrapperAssetIdentity: id.domain.asset,
    hubDomain: id.domain.hubDomain, ledgerNamespace: id.domain.ledgerNamespace, registryCommitment: id.domain.registryCommitment,
    wrapper: id.assetBinding.token, wrapperCodeHash: id.assetBinding.codeHash })) assert.equal(config[key], expected, 'FLAT_OWNER_CLAIM_CONFIG_' + key);
  proof(d.ownerProof); proof(d.ingressProof);
  same(call.ownerProof, { proof: '0x' + d.ownerProof, inputs: d.publicInputs.map(value => '0x' + claimUint(value, 256).toString(16).padStart(64, '0')) });
  same(call.ingressProof, { proof: '0x' + d.ingressProof, inputs: d.ingressPublicInputs.map(value => '0x' + claimUint(value, 256).toString(16).padStart(64, '0')) });
  assert.equal(d.ownerProof, op.proof.proof, 'FLAT_OWNER_CLAIM_OWNER_PROOF');
  same(d.publicInputs, op.publicInputs); same(decodeDepositIntentInputs(d.publicInputs), op.statement);
  const ingress = decodeClaimIngressInputs(d.ingressPublicInputs), q = claimUint(op.statement.amount);
  assert.equal(ingress.claimDomain, domain); assert.equal(ingress.outputQ, op.statement.output);
  assert.equal(ingress.amountQ, op.statement.amount); assert.ok(q > 0n);
  assert.ok(config.nativeFamily === '1' ? q >= 1000n && q <= 1000000000n : q <= 9007199254740991n, 'FLAT_OWNER_CLAIM_AMOUNT');
  assert.equal(d.intentId, claimIntentId({ claimDomain: domain, outputQ: op.statement.output, amount: op.statement.amount }));
  assert.ok(claimUint(d.revision) > 0n);
  const before = flatOwnerSnapshot(o.before, id), after = flatOwnerSnapshot(o.after, id), b = before.publicState, a = after.publicState;
  const now = claimUint(after.raw.timestamp);
  assert.ok(now >= claimUint(before.raw.timestamp));
  window(op.statement.validFrom, op.statement.validUntil, now); window(ingress.evidenceFrom, ingress.evidenceUntil, now);
  assert.equal(BigInt(a.sequence), BigInt(b.sequence) + 1n);
  assert.ok(!before.commitments.includes('0x' + op.statement.output), 'FLAT_OWNER_INTENT_ALREADY_INSERTED');
  same(after.commitments, [...before.commitments, '0x' + op.statement.output]); same(after.nullifiers, before.nullifiers);
  same(after.roots, [...before.roots, a.root]);
  assert.equal(a.leaves, b.leaves + 1); assert.equal(a.spent, b.spent); assert.equal(a.spentDigest, b.spentDigest);
  assert.equal(a.liveReservations, b.liveReservations); assert.equal(a.outputCapacity, b.outputCapacity + 1);
  for (const name of ['backedAmount', 'actualAssetBalance']) assert.equal(BigInt(a[name]), BigInt(b[name]) + q);
  for (const name of ['surplus', 'unrelatedNative']) assert.equal(a[name], b[name]);
  same(o.stateAdvanced, { address: id.pool, transactionHash: tx.hash, blockHash: after.raw.blockHash,
    sequence: a.sequence, root: a.root, spent: a.spentDigest, leaves: a.leaves, consumed: a.spent });
  assert.ok(Number.isSafeInteger(o.deliveryEvent.position) && o.deliveryEvent.position >= 0 && !Object.is(o.deliveryEvent.position, -0));
  same(o.deliveryEvent, { address: config.gateway, transactionHash: tx.hash, blockHash: after.raw.blockHash,
    position: o.deliveryEvent.position, intentId: d.intentId, nullifier: ingress.admissionN, output: ingress.outputQ, amount: ingress.amountQ });

  exactRecord(o.claimObservation, ['before', 'after']);
  const cb = o.claimObservation.before, ca = o.claimObservation.after;
  checkClaimPhase(cb, config, before.raw.blockHash); checkClaimPhase(ca, config, after.raw.blockHash);
  const intent = { id: d.intentId, state: '1', output: op.statement.output, amount: op.statement.amount,
    validFrom: op.statement.validFrom, validUntil: op.statement.validUntil, revision: d.revision,
    proofHash: sha(d.ownerProof), nullifier: ingress.admissionN, refundDestination: ingress.refundDestination };
  same(cb.intent, intent); same(ca.intent, { ...intent, state: '2' });
  assert.equal(cb.reservation.consumed, false); same(ca.reservation, { ...cb.reservation, consumed: true });
  assert.equal(cb.receiptReservation, '1'); assert.equal(ca.receiptReservation, '2');
  assert.equal(cb.admissionNullifier, false); assert.equal(ca.admissionNullifier, true);
  for (const field of ['pendingRedemptions', 'pendingRefunds', 'reservationOwner', 'operationNullifier',
    'activePayout', 'admissionRevocationState', 'revocationOverflowCount']) assert.equal(ca[field], cb[field]);
  assert.equal(cb.admissionRevocationState, ingress.admissionRevocationState);
  for (const [field, delta] of Object.entries({ claimSequence: 1n, heldUnissued: -q,
    reservedFees: -claimUint(config.refundMaxFee), reservedRefundTickets: -1n, reservedReceiptCapacity: -1n }))
    assert.equal(BigInt(ca[field]), BigInt(cb[field]) + delta, 'FLAT_OWNER_CLAIM_STATE_DELTA_' + field);
  for (const field of HUB_FIELDS.filter(field => !['receiptRoot', 'receiptCount', 'stateSequence', 'evidenceState'].includes(field)))
    assert.equal(ca.hubState[field], cb.hubState[field], 'FLAT_OWNER_CLAIM_HUB_UNCHANGED_' + field);
  assert.equal(claimUint(ca.hubState.stateSequence), claimUint(cb.hubState.stateSequence) + 1n);
  assert.equal(claimUint(ca.hubState.receiptCount), claimUint(cb.hubState.receiptCount) + 1n);
  assert.notEqual(ca.hubState.receiptRoot, cb.hubState.receiptRoot); assert.notEqual(ca.hubState.evidenceState, cb.hubState.evidenceState);
  same(ca.receiptLeaves, [...cb.receiptLeaves, ingress.ingressReceiptLeaf]);

  const movement = o.assetObservation; exactRecord(movement, ['kind', 'token', 'codeHash', 'pool', 'gateway', 'before', 'after']);
  for (const [key, expected] of Object.entries({ kind: 'NATIVE_CLAIM_MINT', token: config.wrapper, codeHash: config.wrapperCodeHash,
    pool: config.pool, gateway: config.gateway })) assert.equal(movement[key], expected, 'FLAT_OWNER_CLAIM_ASSET');
  const balances = ['poolBalance', 'wrapperSupply', 'gatewayBalance', 'gatewayAllowance'];
  for (const [phase, snapshot] of [['before', before], ['after', after]]) {
    exactRecord(movement[phase], ['blockHash', ...balances]); assert.equal(movement[phase].blockHash, snapshot.raw.blockHash);
    balances.forEach(name => claimUint(movement[phase][name], 256));
    assert.equal(movement[phase].poolBalance, snapshot.publicState.actualAssetBalance);
    assert.equal(movement[phase].gatewayAllowance, '0', 'FLAT_OWNER_CLAIM_GATEWAY_ALLOWANCE');
  }
  for (const [field, delta] of Object.entries({ poolBalance: q, wrapperSupply: q, gatewayBalance: 0n }))
    assert.equal(BigInt(movement.after[field]), BigInt(movement.before[field]) + delta, 'FLAT_OWNER_CLAIM_MINT_DELTA');
  const permit = Object.fromEntries(CLAIM_BACKING_FIELDS.map(([key, type]) => [key,
    type === 'b32' ? call.authorization.permit[key].slice(2) : call.authorization.permit[key]]));
  claimBackingFrame(permit); window(permit.validFrom, permit.validUntil, now);
  window(call.authorization.healthFrom, call.authorization.healthUntil, now);
  for (const [field, expected] of Object.entries({ claimDomain: domain, custodyInventoryDomain: config.custodyInventoryDomain,
    expectedClaimSequence: cb.claimSequence, hubStateSequence: cb.hubState.stateSequence, revocationState: ingress.admissionRevocationState,
    wrapperSupply: movement.before.wrapperSupply, pendingRedemptions: cb.pendingRedemptions, pendingRefunds: cb.pendingRefunds,
    heldUnissued: cb.heldUnissued, unknownExposure: '0', reservedFeesAfter: ca.reservedFees }))
    assert.equal(permit[field], expected, 'FLAT_OWNER_CLAIM_PERMIT_' + field);
  assert.equal(permit.actionDigest, claimActionDigest(domain, { action: CLAIM_ACTIONS.ISSUE, operationId: d.intentId,
    revision: d.revision, amount: ingress.amountQ, destinationCommitment: ingress.refundDestination, maxFee: config.refundMaxFee,
    nullifier: ingress.admissionN, wireBindingCommitment: cb.reservation.wireBindingCommitment, routeCommitment: ingress.ingressReceiptLeaf,
    claimSequence: cb.claimSequence, hubSequence: cb.hubState.stateSequence }), 'FLAT_OWNER_CLAIM_ACTION');
  assert.ok(claimUint(permit.nativePrincipalAvailable, 256) >= BigInt(movement.before.wrapperSupply)
    + BigInt(cb.pendingRedemptions) + BigInt(cb.pendingRefunds) + BigInt(cb.heldUnissued), 'FLAT_OWNER_CLAIM_PRINCIPAL');
  assert.ok(claimUint(permit.feeReserveAvailable, 256) >= BigInt(ca.reservedFees), 'FLAT_OWNER_CLAIM_FEES');
  return { transactionHash: tx.hash, blockHash: after.raw.blockHash, postRoot: a.root, postSequence: a.sequence,
    calldataSHA256: inclusion.calldataSHA256, trust: FLAT_OWNER_OBSERVATION_TRUST, assetObservationSHA256: ownerDigest(movement),
    observationSHA256: ownerDigest(o), kind: FLAT_OWNER_NATIVE_CLAIM_ISSUE, claimDomain: domain, intentId: d.intentId,
    admissionNullifier: ingress.admissionN, ingressReceiptLeaf: ingress.ingressReceiptLeaf };
}
