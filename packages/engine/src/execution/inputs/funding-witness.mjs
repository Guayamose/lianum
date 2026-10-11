/** Exact A0 ABI adapter. This is not a verifier or an executor request.
 * The complete object contains spend secrets, values, recipients and topology;
 * generate its witness/proof owner-side. It never contains signing keys.
 */
import assert from 'node:assert/strict';
import { FUNDED_GRAPH_PROFILE, fundedAuthorizationWords } from '../graph/funded-graph.mjs';
import { GRAPH_PROFILE } from '../graph/graph.mjs';
import { openingInputs } from './graph-witness.mjs';

export const A0_HASH_FIELDS = Object.freeze([
  ['scope', 'scope'], ['policy', 'policy'], ['asset', 'asset'], ['operationId', 'operation_id'],
  ['inputCommitment', 'input_commitment'], ['inputNullifier', 'input_nullifier'],
  ['reservationIntent', 'reservation_intent'], ['graphCommitment', 'graph_commitment'],
  ['treeRoot', 'tree_root'], ['reserveCommitment', 'reserve_commitment'],
  ['reserveNullifier', 'reserve_nullifier'], ['changeCommitment', 'change_commitment'],
]);
export const A0_TIME_FIELDS = Object.freeze([
  ['fundingNotBefore', 'funding_not_before'], ['fundingValidUntil', 'funding_valid_until'], ['settleBefore', 'settle_before'],
]);
const bytes = hex => [...Buffer.from(hex, 'hex')];
const words = hex => {
  const value = Buffer.from(hex, 'hex');
  assert.equal(value.length, 32, 'PAEG_A0_HASH');
  return Array.from({ length: 8 }, (_, i) => value.readUInt32BE(i * 4));
};
const balanceNote = note => ({ rho: bytes(note.rho), key_x: bytes(note.x), key_y: bytes(note.y), value: note.value, secret: bytes(note.secret) });

export function authorizationInputs(signed) {
  const s = signed.authorizationStatement, w = signed.ownerWitness;
  assert.equal(s.profile, FUNDED_GRAPH_PROFILE.id, 'PAEG_A0_PROFILE');
  assert.ok(signed.signatures?.ownerSignature && signed.signatures.invoiceSignatures.length === 4, 'PAEG_A0_SIGNATURES');
  fundedAuthorizationWords(s);
  const graph = openingInputs({
    authorizationStatement: {
      profile: GRAPH_PROFILE.id, scope: s.scope, policy: s.policy, operationId: s.operationId,
      graphCommitment: s.graphCommitment, treeRoot: s.treeRoot, expiresAt: s.settleBefore,
      reservedCommitment: s.reservationIntent, recoveryCommitment: s.recoveryCommitment,
    },
    ownerWitness: w.graph,
  }).witness;
  const inputs = Object.fromEntries(A0_HASH_FIELDS.map(([key, abi]) => [abi, words(s[key])]));
  inputs.outputs = s.outputs.map(words);
  inputs.recovery_commitment = words(s.recoveryCommitment);
  for (const [key, abi] of A0_TIME_FIELDS) inputs[abi] = s[key];
  const inputNote = w.inputNote;
  inputs.witness = {
    input_note: { kind: inputNote.type, origin: bytes(inputNote.type === 4 ? inputNote.rho : inputNote.origin),
      key_x: bytes(inputNote.x), key_y: bytes(inputNote.y), value: inputNote.value, secret: bytes(inputNote.secret) },
    change_note: balanceNote(w.changeNote), recovery_note: balanceNote(w.recoveryNote),
    budget: w.budget, reservation_nonce: bytes(w.reservationNonce), reserve_secret: bytes(w.reserveSecret), graph,
    payouts: Array.from({ length: 4 }, (_, slot) => {
      const note = w.payouts[slot];
      return note ? { randomness: bytes(note.randomness), key_x: bytes(note.x), key_y: bytes(note.y), value: note.value,
        secret: bytes(note.secret), invoice_signature: bytes(signed.signatures.invoiceSignatures[slot]) }
        : { randomness: Array(32).fill(0), key_x: Array(32).fill(0), key_y: Array(32).fill(0), value: '0',
          secret: Array(32).fill(0), invoice_signature: Array(64).fill(0) };
    }),
    padding_salts: w.paddingSalts.map(bytes), owner_signature: bytes(signed.signatures.ownerSignature),
  };
  assert.deepEqual(authorizationPublicWords(inputs), fundedAuthorizationWords(s), 'PAEG_A0_ABI_ORDER');
  return inputs;
}
export function authorizationPublicWords(inputs) {
  const words = [...A0_HASH_FIELDS.flatMap(([, abi]) => inputs[abi]), ...inputs.outputs.flat(), ...inputs.recovery_commitment,
    ...A0_TIME_FIELDS.map(([, abi]) => inputs[abi])].map(String);
  assert.equal(words.length, 139, 'PAEG_A0_ABI_LENGTH');
  return words;
}
