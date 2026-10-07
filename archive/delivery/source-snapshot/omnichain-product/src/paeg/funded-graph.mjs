/**
 * Owner-side, rootless A0 preparation for LIANUM_PAEG_FUNDED_4_V1.
 * This codec is not a proof verifier. Its statement is intermediate proof data,
 * kept private by later funding/readiness/settlement wrappers. All note openings
 * and graph material are private owner-side witness. No API accepts signing keys.
 */
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { compileGraph } from './graph.mjs';
import { walletNoteCommitment } from '../private-wallet-note-encoding.mjs';
import { nullifier as legacyNullifier, uintBE, wordsBE } from '../private-note-encoding.mjs';

export const FUNDED_GRAPH_PROFILE = Object.freeze({
  id: 'LIANUM_PAEG_FUNDED_4_V1', capacity: 4, intermediateWords: 139,
  cryptographicAcceptance: false,
});
export const FUNDED_DOMAINS = Object.freeze({
  intent: 'LIANUM/PAEG/reservation-intent/1',
  reserve: 'LIANUM/PAEG/reserved-note/1',
  admission: 'LIANUM/PAEG/reservation-admission/1',
  emptyChange: 'LIANUM/PAEG/empty-change/1',
  payoutOrigin: 'LIANUM/PAEG/payout-origin/1',
  emptyPayout: 'LIANUM/PAEG/empty-payout/1',
  owner: 'LIANUM/PAEG/funded-authorize/1',
  invoice: 'LIANUM/PAEG/transfer-quote/1',
});
const HASH_FIELDS = [
  'scope', 'policy', 'asset', 'operationId', 'inputCommitment', 'inputNullifier',
  'reservationIntent', 'graphCommitment', 'treeRoot', 'reserveCommitment',
  'reserveNullifier', 'changeCommitment',
];
const TIME_FIELDS = ['fundingNotBefore', 'fundingValidUntil', 'settleBefore'];
const ZERO = '0'.repeat(64);
const prepared = new WeakMap();

function exact(value, fields, code) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), code);
}
function hash(value, code = 'PAEG_FUNDED_HASH', allowZero = false) {
  assert.equal(typeof value, 'string', code);
  assert.match(value, /^[0-9a-f]{64}$/, code);
  assert.ok(allowZero || value !== ZERO, code);
  return Buffer.from(value, 'hex');
}
function amount(value, code = 'PAEG_FUNDED_VALUE', positive = true) {
  assert.equal(typeof value, 'string', code);
  assert.match(value, /^(0|[1-9][0-9]*)$/, code);
  assert.ok(value.length <= 20 && BigInt(value) < (1n << 64n), code);
  assert.ok(!positive || BigInt(value) > 0n, code);
  return BigInt(value);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** H4: four-byte length on every field INCLUDING the domain tag. */
export function fundedFrame(tag, values) {
  return Buffer.concat([Buffer.from(tag), ...values].flatMap(value => {
    assert.ok(Buffer.isBuffer(value), 'PAEG_FUNDED_FRAME_BYTES');
    return [uintBE(value.length, 4), value];
  }));
}
export function fundedHash(tag, values) {
  return createHash('sha256').update(fundedFrame(tag, values)).digest('hex');
}
const profile = () => Buffer.from(FUNDED_GRAPH_PROFILE.id);
const scopeFields = input => ['scope', 'policy', 'asset'].map(key => hash(input[key]));
const commitment = (input, note) => walletNoteCommitment(input.scope, input.policy, note).toString('hex');

function checkNote(note, balanceOnly = false, allowEmpty = false) {
  const originField = note?.type === 4 ? 'rho' : 'origin';
  exact(note, ['type', originField, 'x', 'y', 'value', 'secret'], 'PAEG_FUNDED_NOTE_FIELDS');
  assert.ok(balanceOnly ? note.type === 4 : [2, 3, 4].includes(note.type), 'PAEG_FUNDED_NOTE_TYPE');
  // Legacy notes allow all 32-byte origins/secrets, including zero. Preserve
  // their byte contract; a signature proves possession of the source key.
  for (const key of [originField, 'x', 'y', 'secret']) hash(note[key], 'PAEG_FUNDED_NOTE_BYTES', true);
  amount(note.value, 'PAEG_FUNDED_VALUE', !allowEmpty);
  if (allowEmpty && note.value === '0') {
    for (const field of ['rho', 'x', 'y', 'secret']) assert.equal(note[field], ZERO, 'PAEG_FUNDED_EMPTY_CHANGE_OPENING');
  }
}
function statementFields(statement) {
  exact(statement, ['profile', ...HASH_FIELDS, 'outputs', 'recoveryCommitment', ...TIME_FIELDS], 'PAEG_FUNDED_STATEMENT_FIELDS');
  assert.equal(statement.profile, FUNDED_GRAPH_PROFILE.id, 'PAEG_FUNDED_PROFILE');
  assert.ok(Array.isArray(statement.outputs) && statement.outputs.length === 4, 'PAEG_FUNDED_OUTPUT_COUNT');
  for (const field of TIME_FIELDS) amount(statement[field], 'PAEG_FUNDED_DEADLINE', false);
  assert.ok(BigInt(statement.fundingNotBefore) < BigInt(statement.fundingValidUntil)
    && BigInt(statement.fundingValidUntil) <= BigInt(statement.settleBefore), 'PAEG_FUNDED_DEADLINE');
  return [...HASH_FIELDS.map(key => hash(statement[key])), ...statement.outputs.map(value => hash(value)),
    hash(statement.recoveryCommitment), ...TIME_FIELDS.map(key => uintBE(statement[key], 8))];
}
export function fundedAuthorizationWords(statement) {
  const fields = statementFields(statement);
  const words = fields.flatMap((value, i) => i < 17 ? wordsBE(value).map(String) : [BigInt('0x' + value.toString('hex')).toString()]);
  assert.equal(words.length, 139, 'PAEG_FUNDED_ABI');
  return words;
}
/** Sign these exact bytes with the SOURCE NOTE owner key using SHA256/ECDSA. */
export function ownerAuthorizationMessage(statement) {
  return fundedFrame(FUNDED_DOMAINS.owner, [profile(), ...statementFields(statement)]);
}
/** Required recipient acceptance of this transfer quote, with no exemption. */
export function payoutInvoiceMessage(statement, node, slot) {
  statementFields(statement);
  assert.ok(Number.isInteger(slot) && slot >= 0 && slot < 4, 'PAEG_FUNDED_SLOT');
  return fundedFrame(FUNDED_DOMAINS.invoice, [profile(), ...scopeFields(statement), hash(statement.operationId),
    uintBE(slot, 1), hash(node.chainDomain), hash(node.evidencePolicy), hash(node.actionCommitment),
    hash(node.payoutCommitment), uintBE(statement.settleBefore, 8)]);
}
export function fundedAdmission(input) {
  return fundedHash(FUNDED_DOMAINS.admission, [profile(), ...scopeFields(input), hash(input.operationId)]);
}

/** Prepare immutable economics before funding. No membership or state root is accepted. */
export function compileFundedGraph(input) {
  exact(input, ['scope', 'policy', 'asset', 'operationId', 'budget', ...TIME_FIELDS,
    'reservationNonce', 'reserveSecret', 'graphNonce', 'inputNote', 'changeNote', 'recoveryNote', 'nodes', 'paddingSalts'],
  'PAEG_FUNDED_INPUT_FIELDS');
  scopeFields(input); hash(input.operationId);
  for (const key of ['reservationNonce', 'reserveSecret', 'graphNonce']) hash(input[key]);
  amount(input.budget);
  for (const field of TIME_FIELDS) amount(input[field], 'PAEG_FUNDED_DEADLINE', false);
  assert.ok(BigInt(input.fundingNotBefore) < BigInt(input.fundingValidUntil)
    && BigInt(input.fundingValidUntil) <= BigInt(input.settleBefore), 'PAEG_FUNDED_DEADLINE');
  checkNote(input.inputNote); checkNote(input.changeNote, true, true); checkNote(input.recoveryNote, true);
  assert.equal(BigInt(input.inputNote.value), BigInt(input.budget) + BigInt(input.changeNote.value), 'PAEG_FUNDED_CONSERVATION');
  assert.equal(input.recoveryNote.value, input.budget, 'PAEG_FUNDED_RECOVERY_VALUE');
  assert.ok(Array.isArray(input.paddingSalts) && input.paddingSalts.length === 4, 'PAEG_FUNDED_PADDING');
  input.paddingSalts.forEach(salt => hash(salt));
  assert.ok(Array.isArray(input.nodes), 'PAEG_FUNDED_NODES');
  const inputCommitment = commitment(input, input.inputNote);
  const inputNullifier = legacyNullifier(input.scope, inputCommitment, input.inputNote.secret).toString('hex');
  const recoveryCommitment = commitment(input, input.recoveryNote);
  const reservationIntent = fundedHash(FUNDED_DOMAINS.intent, [profile(), ...scopeFields(input), hash(input.operationId),
    hash(input.reservationNonce), uintBE(input.budget, 8), uintBE(input.settleBefore, 8),
    hash(recoveryCommitment), hash(input.reserveSecret)]);
  const graphInput = {
    version: 1, scope: input.scope, policy: input.policy, operationId: input.operationId,
    expiresAt: input.settleBefore, reservedCommitment: reservationIntent,
    recoveryCommitment, nonce: input.graphNonce,
    nodes: input.nodes.map(node => {
      exact(node, ['id', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'dependsOn', 'payout'], 'PAEG_FUNDED_NODE_FIELDS');
      const { payout, ...graphNode } = node;
      exact(payout, ['x', 'y', 'value', 'secret', 'randomness'], 'PAEG_FUNDED_PAYOUT_FIELDS');
      for (const key of ['x', 'y', 'secret', 'randomness']) hash(payout[key], 'PAEG_FUNDED_PAYOUT_BYTES', true);
      amount(payout.value);
      return { ...graphNode, payoutCommitment: recoveryCommitment };
    }),
  };
  // Reuse the graph codec's canonical topology before slot-bound payout rho is
  // available. This temporary graph is never signed, returned or submitted.
  const ordered = compileGraph(graphInput).ownerWitness.nodes;
  const byId = new Map(input.nodes.map(node => [node.id, node]));
  const payoutNotes = ordered.map((node, slot) => {
    const payout = byId.get(node.id).payout;
    const rho = fundedHash(FUNDED_DOMAINS.payoutOrigin, [...scopeFields(input), hash(input.operationId),
      uintBE(slot, 1), hash(payout.randomness, 'PAEG_FUNDED_PAYOUT_BYTES', true)]);
    return { type: 4, rho, x: payout.x, y: payout.y, value: payout.value, secret: payout.secret };
  });
  assert.equal(payoutNotes.reduce((total, note) => total + BigInt(note.value), 0n), BigInt(input.budget), 'PAEG_FUNDED_PAYOUT_SUM');
  graphInput.nodes = ordered.map((node, slot) => {
    const { payout, ...terms } = byId.get(node.id);
    return { ...terms, payoutCommitment: commitment(input, payoutNotes[slot]) };
  });
  const graph = compileGraph(graphInput);
  const graphCommitment = graph.authorizationStatement.graphCommitment;
  const reserveCommitment = fundedHash(FUNDED_DOMAINS.reserve, [profile(), ...scopeFields(input), hash(reservationIntent), hash(graphCommitment)]);
  const changeCommitment = input.changeNote.value === '0'
    ? fundedHash(FUNDED_DOMAINS.emptyChange, [profile(), ...scopeFields(input), hash(inputNullifier), hash(input.operationId), hash(input.reservationNonce)])
    : commitment(input, input.changeNote);
  const outputs = Array.from({ length: 4 }, (_, slot) => slot < ordered.length
    ? commitment(input, payoutNotes[slot])
    : fundedHash(FUNDED_DOMAINS.emptyPayout, [...scopeFields(input), hash(graphCommitment), uintBE(slot, 1), hash(input.paddingSalts[slot])]));
  const actualCommitments = [inputCommitment, reserveCommitment, changeCommitment, recoveryCommitment, ...outputs];
  assert.equal(new Set(actualCommitments).size, actualCommitments.length, 'PAEG_FUNDED_DISTINCT_NOTES');
  const authorizationStatement = {
    profile: FUNDED_GRAPH_PROFILE.id, scope: input.scope, policy: input.policy, asset: input.asset, operationId: input.operationId,
    inputCommitment, inputNullifier,
    reservationIntent, graphCommitment, treeRoot: graph.authorizationStatement.treeRoot, reserveCommitment,
    reserveNullifier: legacyNullifier(input.scope, reserveCommitment, input.reserveSecret).toString('hex'),
    changeCommitment, outputs, recoveryCommitment,
    fundingNotBefore: input.fundingNotBefore, fundingValidUntil: input.fundingValidUntil, settleBefore: input.settleBefore,
  };
  statementFields(authorizationStatement);
  const ownerWitness = {
    budget: input.budget, reservationNonce: input.reservationNonce, reserveSecret: input.reserveSecret,
    inputNote: structuredClone(input.inputNote), changeNote: structuredClone(input.changeNote), recoveryNote: structuredClone(input.recoveryNote),
    payouts: payoutNotes.map((note, slot) => ({ ...note, randomness: byId.get(ordered[slot].id).payout.randomness })),
    // Active salts are canonical zero witnesses; only inactive padding uses salt.
    paddingSalts: input.paddingSalts.map((salt, slot) => slot < ordered.length ? ZERO : salt),
    graph: structuredClone(graph.ownerWitness),
  };
  const result = freeze({ authorizationStatement, admissionTag: fundedAdmission(input), ownerWitness });
  prepared.set(result, graph);
  return result;
}

/** Returns detached bytes and recipient public keys, never any private key. */
export function fundedSigningRequests(compiled) {
  assert.ok(prepared.has(compiled), 'PAEG_FUNDED_PREPARED');
  const statement = compiled.authorizationStatement;
  return {
    owner: { message: ownerAuthorizationMessage(statement), x: compiled.ownerWitness.inputNote.x, y: compiled.ownerWitness.inputNote.y },
    invoices: compiled.ownerWitness.graph.nodes.map((node, slot) => ({
      id: node.id, slot, x: compiled.ownerWitness.payouts[slot].x, y: compiled.ownerWitness.payouts[slot].y,
      message: payoutInvoiceMessage(statement, node, slot),
    })),
  };
}
function assertSignature(request, signature, code) {
  assert.equal(typeof signature, 'string', code);
  assert.match(signature, /^[0-9a-f]{128}$/, code);
  const publicKey = createPublicKey({ format: 'jwk', key: {
    kty: 'EC', crv: 'secp256k1', x: Buffer.from(request.x, 'hex').toString('base64url'), y: Buffer.from(request.y, 'hex').toString('base64url'),
  } });
  assert.ok(verify('sha256', request.message, { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex')), code);
}
/** Attach caller-produced detached signatures, after checking the fixed terms. */
export function attachFundedSignatures(compiled, signatures) {
  exact(signatures, ['ownerSignature', 'invoiceSignatures'], 'PAEG_FUNDED_SIGNATURE_FIELDS');
  const requests = fundedSigningRequests(compiled);
  assertSignature(requests.owner, signatures.ownerSignature, 'PAEG_FUNDED_OWNER_SIGNATURE');
  assert.ok(Array.isArray(signatures.invoiceSignatures) && signatures.invoiceSignatures.length === requests.invoices.length,
    'PAEG_FUNDED_REQUIRED_INVOICES');
  requests.invoices.forEach((request, slot) => assertSignature(request, signatures.invoiceSignatures[slot], 'PAEG_FUNDED_INVOICE_SIGNATURE'));
  return freeze({ ...structuredClone(compiled), signatures: {
    ownerSignature: signatures.ownerSignature,
    invoiceSignatures: Array.from({ length: 4 }, (_, slot) => signatures.invoiceSignatures[slot] ?? '0'.repeat(128)),
  } });
}
