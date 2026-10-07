/** Synthetic framing and state fixtures only. Fake proof bytes, metadata and
 * gateway rows establish no authenticated handoff, proof or onchain authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateRetainedClaimPacket, canonicalClaimDepositProjection } from '../../../src/claims/controller/controller-retained-state.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, claimTicketId } from '../../../src/claims/protocol/framing.mjs';
import { encodeDepositIntentInputs } from '../../../src/execution/account/preparation/deposit-intent.mjs';
import { balanceCommitment } from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { ownerDigest, FLAT_OWNER_CLAIM_HANDOFF_PROFILE, FLAT_OWNER_CLAIM_HANDOFF_TRUST } from '../../../../custody/src/signing/flat-owner-custody.mjs';
import { assertOwnedNativeClaimIngressHandoff } from '../../../../custody/src/processes/flat-owner-process.mjs';

const sha = raw => createHash('sha256').update(raw).digest('hex');
const h = value => sha('synthetic retained claim/' + value), ZERO = '0'.repeat(64);
const copy = value => structuredClone(value);
function seal(packet) {
  delete packet.handoffIdentitySHA256;
  packet.handoffIdentitySHA256 = ownerDigest(packet); return packet;
}
function fixture() {
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key,
    type === 'address' ? h(key).slice(0, 40) : type === 'u256' ? '31337' : type === 'u8' ? '2'
      : type === 'u64' ? '7' : type === 'field32' ? '01' + h(key).slice(2) : h(key)]));
  config.ledgerNamespace = config.hubDomain;
  const opening = { rho: h('rho'), x: h('x'), y: h('y'), value: '100', noteSecret: h('secret') };
  const statement = { scope: config.scope, policy: config.policy, validFrom: '5', validUntil: '40', amount: opening.value,
    output: balanceCommitment(config.scope, config.policy, { type: 4, rho: opening.rho, x: opening.x, y: opening.y,
      value: opening.value, secret: opening.noteSecret }).toString('hex') };
  const proof = 'c0ffee', evidence = { relation: 'deposit_intent', role: 'owner',
    runId: '11111111-1111-4111-8111-111111111111', jobId: '22222222-2222-4222-8222-222222222222',
    proofSHA256: sha(Buffer.from(proof, 'hex')), keySHA256: h('fake key'), manifestSHA256: h('fake manifest'), metricUnits: 'milliseconds',
    metrics: Object.fromEntries(['initializationMilliseconds', 'jobPreparationMilliseconds', 'witnessMilliseconds', 'proofMilliseconds',
      'verificationMilliseconds', 'totalMilliseconds', 'otherMilliseconds'].map(key => [key, '1.25'])) };
  const packet = { version: 1, profile: FLAT_OWNER_CLAIM_HANDOFF_PROFILE, trust: FLAT_OWNER_CLAIM_HANDOFF_TRUST,
    ownerIdentitySHA256: h('owner identity'), claimDomain: claimDomainCommitment(config), ingressProverIdentity: h('prover'),
    revision: 0, statement, proofResult: { proof, publicInputs: [...encodeDepositIntentInputs(statement)], evidence }, opening };
  packet.intentIdentitySHA256 = ownerDigest({ profile: packet.profile, identitySHA256: packet.ownerIdentitySHA256, claimDomain: packet.claimDomain,
    scope: statement.scope, policy: statement.policy, amount: statement.amount, output: statement.output });
  seal(packet);
  const row = { id: claimIntentId({ claimDomain: packet.claimDomain, outputQ: statement.output, amount: statement.amount }),
    claimDomain: packet.claimDomain, packet, refundDestination: h('original refund destination'), refundMaxFee: config.refundMaxFee,
    status: 'PREPARED', native: null, history: [] };
  const intent = { id: row.id, state: '1', output: statement.output, amount: statement.amount, validFrom: statement.validFrom,
    validUntil: statement.validUntil, revision: '1', proofHash: evidence.proofSHA256, nullifier: ZERO, refundDestination: ZERO };
  return { config, packet, row, intent, gateway: { claimDomain: row.claimDomain, intents: [intent], tickets: [] },
    options: { config, ingressProverIdentity: packet.ingressProverIdentity } };
}
function voidedFixture() {
  const f = fixture();
  Object.assign(f.intent, { state: '3', nullifier: h('original N'), refundDestination: f.row.refundDestination });
  f.row.native = { status: 'OBSERVED', binding: { claimDomain: f.row.claimDomain, operationId: f.row.id, ingress: true, admissionN: f.intent.nullifier } };
  const ticket = { kind: '2', id: claimTicketId({ claimDomain: f.row.claimDomain, kind: '2', nonce: '0' }), claimDomain: f.row.claimDomain,
    amount: f.intent.amount, destinationCommitment: f.row.refundDestination, maxFee: f.config.refundMaxFee,
    referenceIngressN: f.intent.nullifier, referenceQ: f.intent.output };
  f.gateway.tickets = [{ ticket, state: '1', payoutRouteCommitment: ZERO }]; return f;
}

test('exact retained packet is detached and checksums survive canonical property reordering without minting a handoff', () => {
  const { packet, options } = fixture(), checked = validateRetainedClaimPacket(packet, options);
  assert.deepEqual(checked, packet); assert.notEqual(checked, packet); assert.notEqual(checked.opening, packet.opening);
  assert.ok(Object.isFrozen(checked.opening));
  const reordered = Object.fromEntries(Object.entries(packet).reverse());
  assert.deepEqual(validateRetainedClaimPacket(reordered, options), packet);
  assert.throws(() => assertOwnedNativeClaimIngressHandoff(checked), /HANDOFF|CAPABILITY/);
  packet.opening.value = '999'; assert.equal(checked.opening.value, '100');
});

test('retained packet rejects identity, opening, D27 and proof-evidence substitutions even with a recomputed checksum', () => {
  const { packet, options } = fixture();
  const mutations = [
    p => { p.version = 2; }, p => { p.profile = 'other'; }, p => { p.trust = 'TRUST_ME'; }, p => { p.revision = '0'; },
    p => { p.revision = -0; }, p => { p.revision = 33; }, p => { p.claimDomain = h('other domain'); },
    p => { p.ingressProverIdentity = h('other prover'); }, p => { p.ownerIdentitySHA256 = h('other owner'); },
    p => { p.intentIdentitySHA256 = h('other local intent'); }, p => { p.statement.amount = '101'; },
    p => { p.statement.output = h('other Q'); }, p => { p.statement.validFrom = '05'; }, p => { p.statement.validUntil = '5'; },
    p => { p.statement.scope = h('other scope'); }, p => { p.statement.policy = h('other policy'); },
    p => { p.proofResult.publicInputs[18] = '101'; }, p => { p.proofResult.publicInputs.push('0'); },
    p => { p.proofResult.proof = 'c0ffee\n'; }, p => { p.proofResult.proof = ''; }, p => { p.proofResult.proof = 'CAFE'; },
    p => { p.proofResult.proof = 'aa'.repeat(1024 * 1024 + 1); }, p => { p.proofResult.evidence.proofSHA256 = h('other proof'); },
    p => { p.proofResult.evidence.role = 'claim_ingress'; }, p => { p.proofResult.evidence.relation = 'native_claim_ingress'; },
    p => { p.proofResult.evidence.runId += '\n'; }, p => { p.proofResult.evidence.metricUnits = 'seconds'; },
    p => { p.proofResult.evidence.metrics.proofMilliseconds = '1.0'; }, p => { p.proofResult.evidence.metrics.proofMilliseconds = 'Infinity'; },
    p => { p.proofResult.evidence.metrics.proofMilliseconds = 1.25; }, p => { p.opening.noteSecret = ZERO; },
    p => { p.opening.noteSecret = h('replacement secret'); }, p => { p.opening.value = '101'; },
    p => { p.opening.rho = h('replacement rho'); }, p => { p.opening.x = h('replacement x'); }, p => { p.opening.y = h('replacement y'); },
    p => { p.privateKey = 'forbidden'; }, p => { p.opening.recipient = h('extra recipient'); },
  ];
  for (const mutate of mutations) {
    const changed = copy(packet); mutate(changed);
    // Noncanonical numbers cannot even be checksummed; the validator must
    // independently reject those data shapes before it trusts any digest.
    try { seal(changed); } catch { changed.handoffIdentitySHA256 = packet.handoffIdentitySHA256; }
    assert.throws(() => validateRetainedClaimPacket(changed, options));
  }
  assert.throws(() => validateRetainedClaimPacket({ ...packet, handoffIdentitySHA256: h('checksum mismatch') }, options), /CHECKSUM/);
  let read = false;
  const getter = { ...packet, get statement() { read = true; return packet.statement; } };
  assert.throws(() => validateRetainedClaimPacket(getter, options)); assert.equal(read, false);
});

test('well-framed fake proof bytes remain data validation, not proof verification', () => {
  const { packet, options } = fixture(); packet.proofResult.proof = '00';
  packet.proofResult.evidence.proofSHA256 = sha(Buffer.from('00', 'hex')); seal(packet);
  assert.equal(validateRetainedClaimPacket(packet, options).proofResult.proof, '00');
});

test('canonical projection requires original D27 and preserves prepared or unsettled states without mutating records', () => {
  const f = fixture(), prior = copy(f);
  assert.equal(canonicalClaimDepositProjection(f.row, f.gateway).status, 'PREPOSITIONED');
  f.row.native = { status: 'SIGNING_UNKNOWN' };
  assert.equal(canonicalClaimDepositProjection(f.row, f.gateway).status, 'UNKNOWN');
  f.row.native.status = 'OBSERVED';
  assert.equal(canonicalClaimDepositProjection(f.row, f.gateway).status, 'HELD_UNISSUED');
  const prepared = canonicalClaimDepositProjection(prior.row, { ...prior.gateway, intents: [] });
  assert.deepEqual(prepared, { status: 'PREPARED', intent: null, refund: null, refundTicketId: null });
  assert.throws(() => canonicalClaimDepositProjection(f.row, { ...f.gateway, intents: [] }), /MISSING_INTENT/);
  for (const change of [{ amount: '101' }, { output: h('replacement Q') }, { validFrom: '6' }, { validUntil: '41' },
    { proofHash: h('different D27') }, { state: '0' }, { id: h('different original intent') }])
    assert.throws(() => canonicalClaimDepositProjection(prior.row, { ...prior.gateway, intents: [{ ...prior.intent, ...change }] }));
  assert.throws(() => canonicalClaimDepositProjection(prior.row, { ...prior.gateway, intents: [prior.intent, prior.intent] }), /UNIQUE_INTENT/);
  const terminal = voidedFixture(); terminal.intent.state = '2'; terminal.gateway.tickets = [];
  assert.equal(canonicalClaimDepositProjection(terminal.row, terminal.gateway).status, 'ISSUED');
  assert.deepEqual(prior.row, fixture().row);
});

test('refund is complete only for the unique original canonical discharged ticket', () => {
  const f = voidedFixture();
  for (const state of ['1', '2', '3', '4']) {
    f.gateway.tickets[0].state = state; f.gateway.tickets[0].payoutRouteCommitment = state === '1' ? ZERO : h('route');
    f.row.status = 'REFUNDED'; // A stale cached label cannot override the canonical state.
    const projected = canonicalClaimDepositProjection(f.row, f.gateway);
    assert.equal(projected.status, state === '4' ? 'REFUNDED' : 'REFUND_PENDING');
    assert.equal(projected.refundTicketId, f.gateway.tickets[0].ticket.id);
    assert.deepEqual(projected.refund, f.gateway.tickets[0]); assert.notEqual(projected.refund, f.gateway.tickets[0]);
    assert.ok(!JSON.stringify(projected).includes(f.packet.opening.noteSecret));
  }
  const earlier = { ticket: { kind: '1', id: claimTicketId({ claimDomain: f.row.claimDomain, kind: '1', nonce: '0' }),
    claimDomain: f.row.claimDomain, amount: '1', destinationCommitment: h('other destination'), maxFee: '1',
    referenceIngressN: ZERO, referenceQ: ZERO }, state: '1', payoutRouteCommitment: ZERO };
  f.gateway.tickets[0].ticket.id = claimTicketId({ claimDomain: f.row.claimDomain, kind: '2', nonce: '1' });
  f.gateway.tickets.unshift(earlier);
  assert.equal(canonicalClaimDepositProjection(f.row, f.gateway).status, 'REFUNDED');
});

test('refund joins reject wrong N/Q/domain/amount/fee/destination/ID, duplicates and local-only completion', () => {
  const { row, gateway } = voidedFixture();
  for (const change of [{ referenceIngressN: h('other N') }, { referenceQ: h('other Q') }, { claimDomain: h('other domain') },
    { amount: '101' }, { maxFee: '8' }, { destinationCommitment: h('other destination') }, { id: h('other ticket') }, { kind: '1' }]) {
    const changed = copy(gateway); Object.assign(changed.tickets[0].ticket, change);
    assert.throws(() => canonicalClaimDepositProjection(row, changed));
  }
  assert.throws(() => canonicalClaimDepositProjection(row, { ...gateway, tickets: [] }), /UNIQUE_REFUND/);
  assert.throws(() => canonicalClaimDepositProjection(row, { ...gateway, tickets: [...gateway.tickets, ...gateway.tickets] }), /UNIQUE_REFUND/);
  assert.throws(() => canonicalClaimDepositProjection({ ...row, refundTicketId: h('other ticket') }, gateway), /ORIGINAL_REFUND_ID/);
  assert.throws(() => canonicalClaimDepositProjection({ ...row, refundMaxFee: '8' }, gateway), /REFUND_FEE/);
  const changedN = copy(row); changedN.native.binding.admissionN = h('other original N');
  assert.throws(() => canonicalClaimDepositProjection(changedN, gateway), /ORIGINAL_N/);
  const invalidState = copy(gateway); invalidState.tickets[0].state = '0';
  assert.throws(() => canonicalClaimDepositProjection(row, invalidState), /REFUND_STATE/);
  assert.equal(canonicalClaimDepositProjection({ ...row, status: 'REFUNDED' }, gateway).status, 'REFUND_PENDING');
});
