/** Ephemeral, synthetic fixtures only. Keys exist only in this module's stack;
 * returned ABI fixtures contain no private keys. Host checks are not ZK proof.
 */
import { createHash } from 'node:crypto';
import { compileFundedGraph, fundedSigningRequests, attachFundedSignatures, fundedHash,
  fundedFrame, FUNDED_DOMAINS, FUNDED_GRAPH_PROFILE } from '../../../../packages/protocol/src/execution/graph/funded-graph.mjs';
import { freshKey, signature, nullifier, uintBE } from '../../../../packages/protocol/src/notes/private-note-encoding.mjs';
import { walletNoteCommitment } from '../../../../packages/protocol/src/wallet/notes/private-wallet-note-encoding.mjs';
import { openingHashes } from '../generic-graph/fixtures.mjs';
import { authorizationInputs, A0_HASH_FIELDS, A0_TIME_FIELDS } from './witness.mjs';

const hash = label => createHash('sha256').update(`PAEG funded fixture: ${label}`).digest('hex');
const b = hex => Buffer.from(hex, 'hex');
const hex = value => Buffer.from(value).toString('hex');
const fromWords = words => {
  const result = Buffer.alloc(32);
  words.forEach((word, i) => result.writeUInt32BE(Number(word), i * 4));
  return result;
};
const words = value => Array.from({ length: 8 }, (_, i) => value.readUInt32BE(i * 4));
const asWords = hex => words(b(hex));
const zero = size => Array(size).fill(0);
const profile = () => Buffer.from(FUNDED_GRAPH_PROFILE.id);
const nodeNote = (key, value, label, type = 4) => ({
  type, [type === 4 ? 'rho' : 'origin']: hash(`${label}:origin`),
  x: hex(key.x), y: hex(key.y), value: String(value), secret: hash(`${label}:secret`),
});

function fixtureContext({ name = 'two-independent-type4', count = 2, inputType = 4, maximum = false, sendMax = false } = {}) {
  const inputKey = freshKey(), changeKey = freshKey(), recoveryKey = freshKey();
  const payoutKeys = Array.from({ length: count }, () => freshKey());
  const budget = maximum ? (1n << 64n) - 2n : BigInt(count * 25);
  const change = sendMax ? 0n : maximum ? 1n : 7n;
  const input = {
    scope: hash('scope'), policy: hash('policy'), asset: hash('asset'), operationId: hash(`operation:${name}`),
    budget: String(budget), fundingNotBefore: '1791000000', fundingValidUntil: '1791000300', settleBefore: '1791000900',
    reservationNonce: hash(`${name}:reservation`), reserveSecret: hash(`${name}:reserve-secret`), graphNonce: hash(`${name}:graph`),
    inputNote: nodeNote(inputKey, budget + change, `${name}:input`, inputType),
    changeNote: sendMax ? { type: 4, rho: '0'.repeat(64), x: '0'.repeat(64), y: '0'.repeat(64), value: '0', secret: '0'.repeat(64) }
      : nodeNote(changeKey, change, `${name}:change`), recoveryNote: nodeNote(recoveryKey, budget, `${name}:recovery`),
    nodes: payoutKeys.map((key, slot) => ({
      id: `node-${slot}`, chainDomain: hash(`chain-${slot % 2}`), evidencePolicy: hash(`evidence-${slot % 2}`),
      actionCommitment: hash(`action-${slot}`), dependsOn: count === 4 && slot === 3 ? ['node-0', 'node-1', 'node-2'] : [],
      payout: { x: hex(key.x), y: hex(key.y), value: String(slot === count - 1 ? budget - budget / BigInt(count) * BigInt(count - 1) : budget / BigInt(count)),
        secret: hash(`${name}:payout-secret-${slot}`), randomness: hash(`${name}:payout-randomness-${slot}`) },
    })).reverse(), // Canonical slots cannot depend on caller array order.
    paddingSalts: Array.from({ length: 4 }, (_, slot) => hash(`${name}:padding-${slot}`)),
  };
  const compiled = compileFundedGraph(input);
  const requests = fundedSigningRequests(compiled);
  const signatures = { ownerSignature: hex(signature(inputKey, requests.owner.message)),
    invoiceSignatures: requests.invoices.map(request => hex(signature(payoutKeys[request.slot], request.message))) };
  const signed = attachFundedSignatures(compiled, signatures);
  return { name, input, compiled, signed, inputs: authorizationInputs(signed), inputKey, payoutKeys };
}
export function positiveFixtures() {
  return [
    { name: 'single-type2', count: 1, inputType: 2 },
    { name: 'two-independent-type3', count: 2, inputType: 3 },
    { name: 'two-independent-type4', count: 2, inputType: 4 },
    { name: 'four-fan-in', count: 4, inputType: 4 },
    { name: 'send-max-zero-change', count: 2, inputType: 4, sendMax: true },
    { name: 'maximum-u64-value', count: 1, inputType: 4, maximum: true },
  ].map(options => {
    const fixture = fixtureContext(options);
    return { name: fixture.name, input: fixture.input, signed: fixture.signed, inputs: fixture.inputs };
  });
}

function abiNote(note, type = 4) {
  return { type, [type === 4 ? 'rho' : 'origin']: hex(note.origin ?? note.rho), x: hex(note.key_x), y: hex(note.key_y), value: String(note.value), secret: hex(note.secret) };
}
function ownerMessage(inputs) {
  return fundedFrame(FUNDED_DOMAINS.owner, [profile(), ...A0_HASH_FIELDS.map(([, key]) => fromWords(inputs[key])),
    ...inputs.outputs.map(fromWords), fromWords(inputs.recovery_commitment), ...A0_TIME_FIELDS.map(([, key]) => uintBE(inputs[key], 8))]);
}
function invoiceMessage(inputs, slot) {
  const g = inputs.witness.graph;
  return fundedFrame(FUNDED_DOMAINS.invoice, [profile(), fromWords(inputs.scope), fromWords(inputs.policy), fromWords(inputs.asset),
    fromWords(inputs.operation_id), uintBE(slot, 1), Buffer.from(g.chain_domains[slot]), Buffer.from(g.evidence_policies[slot]),
    Buffer.from(g.action_commitments[slot]), Buffer.from(g.payout_commitments[slot]), uintBE(inputs.settle_before, 8)]);
}
/** TEST ORACLE ONLY: deliberately permits invalid economics/deadlines and
 * rebinds their hashes/signatures. Failures must arise in the actual relation.
 */
function rebind(inputs, context, { owner = true, invoices = true } = {}) {
  const w = inputs.witness, scope = fromWords(inputs.scope), policy = fromWords(inputs.policy), asset = fromWords(inputs.asset);
  const common = [scope, policy, asset], operation = fromWords(inputs.operation_id);
  const cm = note => walletNoteCommitment(scope, policy, note);
  inputs.input_commitment = words(cm(abiNote(w.input_note, Number(w.input_note.kind))));
  inputs.input_nullifier = words(nullifier(scope, fromWords(inputs.input_commitment), Buffer.from(w.input_note.secret)));
  inputs.change_commitment = w.change_note.value === '0'
    ? asWords(fundedHash(FUNDED_DOMAINS.emptyChange, [profile(), ...common, fromWords(inputs.input_nullifier), operation, Buffer.from(w.reservation_nonce)]))
    : words(cm(abiNote(w.change_note)));
  inputs.recovery_commitment = words(cm(abiNote(w.recovery_note)));
  inputs.reservation_intent = asWords(fundedHash(FUNDED_DOMAINS.intent, [profile(), ...common, operation,
    Buffer.from(w.reservation_nonce), uintBE(w.budget, 8), uintBE(inputs.settle_before, 8), fromWords(inputs.recovery_commitment), Buffer.from(w.reserve_secret)]));
  for (let slot = 0; slot < w.graph.active_count; slot++) {
    const note = w.payouts[slot];
    const rho = fundedHash(FUNDED_DOMAINS.payoutOrigin, [...common, operation, uintBE(slot, 1), Buffer.from(note.randomness)]);
    w.graph.payout_commitments[slot] = [...cm({ ...abiNote({ ...note, rho: b(rho) }), rho })];
  }
  const graph = openingHashes({ scope: inputs.scope, policy: inputs.policy, operation_id: inputs.operation_id,
    expires_at: inputs.settle_before, reserved_commitment: inputs.reservation_intent, recovery_commitment: inputs.recovery_commitment, witness: w.graph });
  inputs.graph_commitment = asWords(graph.graphCommitment); inputs.tree_root = asWords(graph.treeRoot);
  inputs.reserve_commitment = asWords(fundedHash(FUNDED_DOMAINS.reserve, [profile(), ...common, fromWords(inputs.reservation_intent), fromWords(inputs.graph_commitment)]));
  inputs.reserve_nullifier = words(nullifier(scope, fromWords(inputs.reserve_commitment), Buffer.from(w.reserve_secret)));
  inputs.outputs = Array.from({ length: 4 }, (_, slot) => slot < w.graph.active_count ? words(Buffer.from(w.graph.payout_commitments[slot]))
    : asWords(fundedHash(FUNDED_DOMAINS.emptyPayout, [...common, fromWords(inputs.graph_commitment), uintBE(slot, 1), Buffer.from(w.padding_salts[slot])])));
  if (invoices) for (let slot = 0; slot < w.graph.active_count; slot++) w.payouts[slot].invoice_signature = [...signature(context.payoutKeys[slot], invoiceMessage(inputs, slot))];
  if (owner) w.owner_signature = [...signature(context.inputKey, ownerMessage(inputs))];
}
export function negativeFixtures() {
  const context = fixtureContext();
  const cases = [
    ['input-value-conservation', true, x => { x.witness.input_note.value = String(BigInt(x.witness.input_note.value) + 1n); }],
    ['payout-value-conservation', true, x => { x.witness.payouts[0].value = '26'; }],
    ['recovery-value-conservation', true, x => { x.witness.recovery_note.value = '49'; }],
    ['nonzero-zero-change-opening', true, x => { x.witness.change_note.value = '0'; x.witness.input_note.value = '50'; }],
    ['u64-input-overflow', false, x => { x.witness.input_note.value = String(1n << 64n); }],
    ['input-type-not-spendable', false, x => { x.witness.input_note.kind = 1; }],
    ['recipient-key-substitution', true, x => { const key = freshKey(); x.witness.payouts[0].key_x = [...key.x]; x.witness.payouts[0].key_y = [...key.y]; }],
    ['missing-required-invoice', false, x => { x.witness.payouts[0].invoice_signature = zero(64); }],
    ['wrong-owner-signature', false, x => { x.witness.owner_signature[0] ^= 1; }],
    ['empty-funding-interval', true, x => { x.funding_valid_until = x.funding_not_before; }],
    ['funding-after-settlement', true, x => { x.funding_valid_until = String(BigInt(x.settle_before) + 1n); }],
    ['deadline-with-stale-owner-signature', false, x => { x.funding_not_before = String(BigInt(x.funding_not_before) + 1n); }],
    ['cross-scope-with-stale-signatures', 'unsigned', x => { x.scope = asWords(hash('other-scope')); }],
    ['cross-policy-with-stale-signatures', 'unsigned', x => { x.policy = asWords(hash('other-policy')); }],
    ['cross-asset-with-stale-signatures', 'unsigned', x => { x.asset = asWords(hash('other-asset')); }],
    ['legacy-nullifier-reframed-as-h4', false, x => { x.input_nullifier = asWords(fundedHash('PC15/note-spend/1', [fromWords(x.scope), fromWords(x.input_commitment), Buffer.from(x.witness.input_note.secret)])); x.witness.owner_signature = [...signature(context.inputKey, ownerMessage(x))]; }],
    ['reserve-nullifier-reframed-as-h4', false, x => { x.reserve_nullifier = asWords(fundedHash('PC15/note-spend/1', [fromWords(x.scope), fromWords(x.reserve_commitment), Buffer.from(x.witness.reserve_secret)])); x.witness.owner_signature = [...signature(context.inputKey, ownerMessage(x))]; }],
    ['nonzero-inactive-payout-opening', false, x => { x.witness.payouts[3].value = '1'; }],
    ['zero-padding-output', false, x => { x.outputs[3] = zero(8); x.witness.owner_signature = [...signature(context.inputKey, ownerMessage(x))]; }],
    ['duplicate-output', false, x => { x.outputs[1] = [...x.outputs[0]]; x.witness.owner_signature = [...signature(context.inputKey, ownerMessage(x))]; }],
  ];
  const negatives = cases.map(([name, rebound, mutate]) => {
    const inputs = structuredClone(context.inputs); mutate(inputs);
    if (rebound) rebind(inputs, context, rebound === 'unsigned' ? { owner: false, invoices: false } : {});
    return { name, source: context.name, digestRebound: !!rebound,
      expectedFailureLayer: name === 'u64-input-overflow' ? 'abi' : 'constraint', inputs };
  });
  const sendMax = fixtureContext({ name: 'send-max-zero-change', sendMax: true });
  const wrongPadding = structuredClone(sendMax.inputs);
  wrongPadding.change_commitment = words(walletNoteCommitment(fromWords(wrongPadding.scope), fromWords(wrongPadding.policy), abiNote(wrongPadding.witness.change_note)));
  wrongPadding.witness.owner_signature = [...signature(sendMax.inputKey, ownerMessage(wrongPadding))];
  negatives.push({ name: 'zero-change-as-legacy-note', source: sendMax.name, digestRebound: true, inputs: wrongPadding });
  return negatives;
}
