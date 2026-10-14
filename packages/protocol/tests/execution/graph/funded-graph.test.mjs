import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import test from 'node:test';
import { compileFundedGraph, attachFundedSignatures, fundedSigningRequests, fundedAuthorizationWords,
  fundedHash, fundedFrame, fundedAdmission, FUNDED_DOMAINS, FUNDED_GRAPH_PROFILE } from '../../../../engine/src/execution/graph/funded-graph.mjs';
import { walletNoteCommitment } from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { nullifier, frame as legacyFrame, uintBE } from '../../../../engine/src/notes/private-note-encoding.mjs';
import { positiveFixtures, negativeFixtures } from '../../../../../experiments/engine/private-core-proof/generic-funding/fixtures.mjs';
import { authorizationInputs, authorizationPublicWords } from '../../../../../experiments/engine/private-core-proof/generic-funding/witness.mjs';

const fixtures = positiveFixtures();
const base = fixtures.find(f => f.name === 'two-independent-type4');
const b = hex => Buffer.from(hex, 'hex');
const hexWords = words => words.map(word => Number(word).toString(16).padStart(8, '0')).join('');
const hash = label => createHash('sha256').update(label).digest('hex');
const mutate = fn => { const input = structuredClone(base.input); fn(input); return input; };
const detached = signed => ({ ownerSignature: signed.signatures.ownerSignature,
  invoiceSignatures: signed.signatures.invoiceSignatures.slice(0, signed.ownerWitness.graph.activeCount) });
const signatureValid = (request, signature) => verify('sha256', request.message, { key: createPublicKey({
  format: 'jwk', key: { kty: 'EC', crv: 'secp256k1', x: b(request.x).toString('base64url'), y: b(request.y).toString('base64url') },
}), dsaEncoding: 'ieee-p1363' }, b(signature));

test('all source types, fixed capacity and send-max share the exact 139-word A0 ABI', () => {
  assert.deepEqual([...new Set(fixtures.map(f => f.input.inputNote.type))].sort(), [2, 3, 4]);
  for (const fixture of fixtures) {
    const compiled = compileFundedGraph(fixture.input);
    assert.deepEqual(compiled.authorizationStatement, fixture.signed.authorizationStatement);
    const signed = attachFundedSignatures(compiled, detached(fixture.signed));
    const inputs = authorizationInputs(signed);
    assert.deepEqual(authorizationPublicWords(inputs), fundedAuthorizationWords(signed.authorizationStatement));
    assert.equal(authorizationPublicWords(inputs).length, FUNDED_GRAPH_PROFILE.intermediateWords);
    assert.equal(inputs.outputs.length, 4);
    assert.equal(inputs.witness.payouts.length, 4);
    for (let slot = inputs.witness.graph.active_count; slot < 4; slot++) {
      assert.equal(inputs.witness.payouts[slot].value, '0');
      assert.ok(inputs.witness.payouts[slot].invoice_signature.every(byte => byte === 0));
      assert.notEqual(hexWords(inputs.outputs[slot]), '0'.repeat(64));
    }
  }
});

test('legacy input commitment and spend nullifier bytes remain exact for types 2, 3 and 4', () => {
  for (const fixture of fixtures) {
    const { input, signed } = fixture, s = signed.authorizationStatement;
    const cm = walletNoteCommitment(input.scope, input.policy, input.inputNote);
    assert.equal(s.inputCommitment, cm.toString('hex'));
    assert.equal(s.inputNullifier, nullifier(input.scope, cm, input.inputNote.secret).toString('hex'));
    assert.equal(s.reserveNullifier, nullifier(input.scope, s.reserveCommitment, input.reserveSecret).toString('hex'));
    const parts = [b(input.scope), cm, b(input.inputNote.secret)];
    assert.notEqual(fundedHash('PC15/note-spend/1', parts), s.inputNullifier);
    assert.equal(legacyFrame('PC15/note-spend/1', parts).readUInt16BE(0), 17);
    assert.equal(fundedFrame('PC15/note-spend/1', parts).readUInt32BE(0), 17);
  }
});

test('intent, final graph, actual reserve and admission use their distinct exact domains', () => {
  const { input, signed } = base, s = signed.authorizationStatement;
  const p = Buffer.from(FUNDED_GRAPH_PROFILE.id), common = [b(input.scope), b(input.policy), b(input.asset)];
  assert.equal(s.reservationIntent, fundedHash(FUNDED_DOMAINS.intent, [p, ...common, b(input.operationId), b(input.reservationNonce),
    uintBE(input.budget, 8), uintBE(input.settleBefore, 8), b(s.recoveryCommitment), b(input.reserveSecret)]));
  assert.equal(s.reserveCommitment, fundedHash(FUNDED_DOMAINS.reserve, [p, ...common, b(s.reservationIntent), b(s.graphCommitment)]));
  assert.notEqual(s.reservationIntent, s.reserveCommitment);
  assert.equal(fundedAdmission(input), fundedHash('LIANUM/PAEG/reservation-admission/1', [p, ...common, b(input.operationId)]));
});

test('canonical zero change is capacity padding; positive change keeps PC23 commitment bytes', () => {
  const fixture = fixtures.find(f => f.name === 'send-max-zero-change'), s = fixture.signed.authorizationStatement;
  assert.equal(fixture.input.inputNote.value, fixture.input.budget);
  assert.equal(s.changeCommitment, fundedHash(FUNDED_DOMAINS.emptyChange, [Buffer.from(FUNDED_GRAPH_PROFILE.id),
    b(s.scope), b(s.policy), b(s.asset), b(s.inputNullifier), b(s.operationId), b(fixture.input.reservationNonce)]));
  assert.notEqual(s.changeCommitment, walletNoteCommitment(s.scope, s.policy, fixture.input.changeNote).toString('hex'));
  assert.equal(base.signed.authorizationStatement.changeCommitment, walletNoteCommitment(base.input.scope, base.input.policy, base.input.changeNote).toString('hex'));
  for (const field of ['rho', 'x', 'y', 'secret']) {
    const bad = structuredClone(fixture.input); bad.changeNote[field] = hash(field);
    assert.throws(() => compileFundedGraph(bad), /PAEG_FUNDED_EMPTY_CHANGE_OPENING/);
  }
});

test('owner signature and every recipient invoice verify over the exact detached bytes', () => {
  const compiled = compileFundedGraph(base.input), requests = fundedSigningRequests(compiled);
  assert.equal(signatureValid(requests.owner, base.signed.signatures.ownerSignature), true);
  for (const request of requests.invoices) assert.equal(signatureValid(request, base.signed.signatures.invoiceSignatures[request.slot]), true);
  const bad = detached(base.signed); bad.invoiceSignatures[0] = '0'.repeat(128);
  assert.throws(() => attachFundedSignatures(compiled, bad), /PAEG_FUNDED_INVOICE_SIGNATURE/);
  assert.throws(() => attachFundedSignatures(compiled, { ...detached(base.signed), invoiceSignatures: [] }), /PAEG_FUNDED_REQUIRED_INVOICES/);
});

test('scope, policy, asset, action, nonce, recipient and all funding deadlines are owner-bound', () => {
  const changes = [
    input => { input.scope = hash('another scope'); }, input => { input.policy = hash('another policy'); },
    input => { input.asset = hash('another asset'); }, input => { input.operationId = hash('another operation'); },
    input => { input.reservationNonce = hash('another reservation'); }, input => { input.reserveSecret = hash('another secret'); },
    input => { input.graphNonce = hash('another graph'); }, input => { input.nodes[0].actionCommitment = hash('another action'); },
    input => { input.nodes[0].payout.x = input.inputNote.x; input.nodes[0].payout.y = input.inputNote.y; },
    input => { input.fundingNotBefore = String(BigInt(input.fundingNotBefore) + 1n); },
    input => { input.fundingValidUntil = String(BigInt(input.fundingValidUntil) - 1n); },
    input => { input.settleBefore = String(BigInt(input.settleBefore) + 1n); },
  ];
  for (const change of changes) assert.throws(() => attachFundedSignatures(compileFundedGraph(mutate(change)), detached(base.signed)), /PAEG_FUNDED_OWNER_SIGNATURE/);
});

test('value and absolute-deadline violations are rejected before requesting signatures', () => {
  const invalid = [
    [input => { input.inputNote.value = '49'; }, /PAEG_FUNDED_CONSERVATION/],
    [input => { input.nodes[0].payout.value = '26'; }, /PAEG_FUNDED_PAYOUT_SUM/],
    [input => { input.recoveryNote.value = '49'; }, /PAEG_FUNDED_RECOVERY_VALUE/],
    [input => { input.fundingValidUntil = input.fundingNotBefore; }, /PAEG_FUNDED_DEADLINE/],
    [input => { input.fundingValidUntil = String(BigInt(input.settleBefore) + 1n); }, /PAEG_FUNDED_DEADLINE/],
    [input => { input.inputNote.value = String(1n << 64n); }, /PAEG_FUNDED_VALUE/],
    [input => { input.nodes[0].payout.value = '0'; }, /PAEG_FUNDED_VALUE/],
  ];
  for (const [change, error] of invalid) assert.throws(() => compileFundedGraph(mutate(change)), error);
});

test('keys, state roots, caller invoice exemptions and redundant owner fields are never accepted', () => {
  for (const field of ['root', 'epoch', 'sequence', 'expectedPostRoot', 'ownerKey', 'invoiceExemption']) {
    assert.throws(() => compileFundedGraph(mutate(input => { input[field] = 'injected'; })), /PAEG_FUNDED_INPUT_FIELDS/);
  }
  assert.throws(() => compileFundedGraph(mutate(input => { input.inputNote.privateKey = 'secret'; })), /PAEG_FUNDED_NOTE_FIELDS/);
  assert.throws(() => compileFundedGraph(mutate(input => { input.nodes[0].payout.privateKey = 'secret'; })), /PAEG_FUNDED_PAYOUT_FIELDS/);
  const serialized = JSON.stringify(base.signed);
  assert.doesNotMatch(serialized, /privateKey|publicKey|keyObject|"epoch"|"sequence"|"root"/);
  assert.ok(Object.isFrozen(base.signed.authorizationStatement.outputs));
});

test('canonical topology and payout slots are stable under caller array reorder', () => {
  const reversed = mutate(input => input.nodes.reverse());
  assert.deepEqual(compileFundedGraph(reversed).authorizationStatement, base.signed.authorizationStatement);
});

test('negative circuit fixtures include rebound conservation, signature, legacy and padding failures', () => {
  const negative = negativeFixtures();
  assert.equal(new Set(negative.map(f => f.name)).size, negative.length);
  for (const name of ['input-value-conservation', 'payout-value-conservation', 'recovery-value-conservation',
    'recipient-key-substitution', 'cross-asset-with-stale-signatures', 'legacy-nullifier-reframed-as-h4', 'zero-change-as-legacy-note']) {
    assert.ok(negative.some(f => f.name === name), name);
  }
  for (const fixture of negative) {
    assert.equal(authorizationPublicWords(fixture.inputs).length, 139, fixture.name);
    assert.doesNotMatch(JSON.stringify(fixture.inputs), /privateKey|keyObject/);
  }
  const conservation = negative.find(f => f.name === 'input-value-conservation').inputs;
  const n = conservation.witness.input_note;
  const cm = walletNoteCommitment(hexWords(conservation.scope), hexWords(conservation.policy), {
    type: n.kind, rho: Buffer.from(n.origin), x: Buffer.from(n.key_x), y: Buffer.from(n.key_y), value: n.value, secret: Buffer.from(n.secret),
  });
  assert.equal(cm.toString('hex'), hexWords(conservation.input_commitment));
  assert.notEqual(BigInt(n.value), BigInt(conservation.witness.budget) + BigInt(conservation.witness.change_note.value));
});
