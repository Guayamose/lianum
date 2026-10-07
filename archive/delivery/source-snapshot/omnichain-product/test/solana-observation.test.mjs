import test from 'node:test';
import assert from 'node:assert/strict';
import { base58Encode, base58Decode, signSolanaTransfer, decodeSolanaTransfer, validateSolanaObservation, validateOwnedSocketRows } from '../src/chains/solana-runtime.mjs';

function fixture() {
  const expected = { ...signSolanaTransfer({ seed: Buffer.alloc(32, 3), recipient: base58Encode(Buffer.alloc(32, 4)), recentBlockhash: base58Encode(Buffer.alloc(32, 5)), lamports: '3000000' }), genesis: base58Encode(Buffer.alloc(32, 6)) };
  return { expected, genesis: expected.genesis, status: { err: null, slot: 100, confirmations: null, confirmationStatus: 'finalized' }, transaction: { slot: 100, transaction: [expected.transactionBase64, 'base64'], meta: { err: null, fee: 5000, preBalances: [10000000, 0, 1], postBalances: [6995000, 3000000, 1], innerInstructions: [] } }, currentSlot: 105, block: { blockhash: base58Encode(Buffer.alloc(32, 7)), previousBlockhash: base58Encode(Buffer.alloc(32, 8)), signatures: [expected.signature], parentSlot: 99, blockHeight: 98 } };
}

test('base58 conversion keeps leading zeroes and exact byte lengths', () => {
  for (const data of [Buffer.alloc(32), Buffer.alloc(32, 255), Buffer.from([0, 0, 2, 8])]) assert.deepEqual(base58Decode(base58Encode(data), data.length), data);
  for (const bad of ['', '0', 'I', 'O', 'l', '1'.repeat(129)]) assert.throws(() => base58Decode(bad), /SOLANA_INVALID_BASE58/);
  assert.throws(() => base58Decode('111', 32), /SOLANA_INVALID_BASE58_LENGTH/);
});

test('local Ed25519 wire encoding decodes exact single System transfer', () => {
  const f = fixture(), decoded = decodeSolanaTransfer(f.expected.transactionBase64);
  for (const k of ['signature', 'signatureHex', 'solver', 'solverHex', 'recipient', 'recipientHex', 'lamports', 'recentBlockhash', 'instructionIndex', 'transactionSHA256']) assert.equal(decoded[k], f.expected[k]);
  assert.equal(decoded.signatureHex.length, 130); assert.equal(decoded.solverHex.length, 66);
  const altered = Buffer.from(f.expected.transactionBase64, 'base64'); altered[214] ^= 1;
  assert.throws(() => decodeSolanaTransfer(altered.toString('base64')), /SOLANA_SIGNATURE_INVALID/);
});

test('read-only evidence validates signature, native successful exact transfer, finality and balances', () => {
  const observed = validateSolanaObservation(fixture());
  assert.equal(observed.lamports, '3000000'); assert.equal(observed.recipientDeltaLamports, '3000000');
  assert.equal(observed.finalized, true); assert.equal(observed.instructionIndex, 0); assert.equal(observed.slot, 100);
  assert.match(observed.assurance, /trusted-owned-local-rpc/);
});

for (const [label, mutate, error] of [
  ['wrong genesis', f => { f.genesis = base58Encode(Buffer.alloc(32, 9)); }, /WRONG_GENESIS/],
  ['missing signature', f => { f.status = null; }, /STATUS_MISSING/],
  ['failed status', f => { f.status.err = { InstructionError: [0, 'x'] }; }, /STATUS_MISSING_OR_FAILED/],
  ['unfinalized status', f => { f.status.confirmationStatus = 'confirmed'; f.status.confirmations = 1; }, /NOT_COMMITTED/],
  ['inconsistent finality', f => { f.status.confirmations = 1; }, /INCONSISTENT_FINALITY/],
  ['transaction execution failure', f => { f.transaction.meta.err = {}; }, /TRANSACTION_MISSING_OR_FAILED/],
  ['wrong amount', f => { f.expected.lamports = '3000001'; }, /MISMATCH_LAMPORTS/],
  ['wrong source', f => { f.expected.solver = f.expected.recipient; }, /MISMATCH_SOLVER/],
  ['wrong recipient', f => { f.expected.recipient = f.expected.solver; }, /MISMATCH_RECIPIENT/],
  ['wrong signed identity', f => { f.expected.signature = base58Encode(Buffer.alloc(64, 8)); }, /MISMATCH_SIGNATURE/],
  ['wrong recent blockhash', f => { f.expected.recentBlockhash = base58Encode(Buffer.alloc(32, 8)); }, /MISMATCH_RECENTBLOCKHASH/],
  ['wrong wire digest', f => { f.expected.transactionSHA256 = '0'.repeat(64); }, /MISMATCH_TRANSACTIONSHA256/],
  ['status slot disagreement', f => { f.status.slot = 99; }, /SLOT_MISMATCH/],
  ['slot ahead of root', f => { f.currentSlot = 99; }, /SLOT_MISMATCH/],
  ['canonical block exclusion', f => { f.block.signatures = []; }, /BLOCK_MEMBERSHIP_MISSING/],
  ['duplicate membership', f => { f.block.signatures.push(f.expected.signature); }, /BLOCK_MEMBERSHIP_MISSING/],
  ['bad parent', f => { f.block.parentSlot = 100; }, /PARENT_SLOT_MISMATCH/],
  ['unsafe integer balances', f => { f.transaction.meta.preBalances[0] = Number.MAX_SAFE_INTEGER + 1; }, /UNSAFE_BALANCE/],
  ['wrong recipient delta', f => { f.transaction.meta.postBalances[1]++; }, /BALANCE_DELTA_MISMATCH/],
  ['wrong solver delta', f => { f.transaction.meta.postBalances[0]++; }, /BALANCE_DELTA_MISMATCH/],
  ['unexpected CPI', f => { f.transaction.meta.innerInstructions = [{ index: 0, instructions: [] }]; }, /UNEXPECTED_INNER_INSTRUCTIONS/],
]) test('rejects synthetic observation fixture: ' + label, () => { const f = fixture(); mutate(f); assert.throws(() => validateSolanaObservation(f), error); });

test('confirmed observation is explicitly weaker and opt-in', () => {
  const f = fixture(); f.status.confirmationStatus = 'confirmed'; f.status.confirmations = 1; f.commitment = 'confirmed';
  const o = validateSolanaObservation(f); assert.equal(o.finalized, false); assert.equal(o.confirmationStatus, 'confirmed');
});

test('signer rejects zero, negative, unsafe and noncanonical amounts', () => {
  for (const lamports of [0, -1, '01', '1.2', Number.MAX_SAFE_INTEGER + 1, 2n ** 64n]) assert.throws(() => signSolanaTransfer({ seed: Buffer.alloc(32, 3), recipient: base58Encode(Buffer.alloc(32, 4)), recentBlockhash: base58Encode(Buffer.alloc(32, 5)), lamports }), /INVALID_LAMPORTS/);
});

for (const [label, offset, error] of [
  ['extra signer', 0, /INVALID_MESSAGE_HEADER/],
  ['noncanonical header', 65, /INVALID_MESSAGE_HEADER/],
  ['non-System program', 133, /WRONG_PROGRAM/],
  ['extra instruction', 197, /NOT_EXACT_SYSTEM_TRANSFER/],
  ['different transfer opcode', 203, /NOT_EXACT_SYSTEM_TRANSFER/],
]) test('rejects altered wire structure: ' + label, () => {
  const f = fixture(), wire = Buffer.from(f.expected.transactionBase64, 'base64'); wire[offset]++;
  assert.throws(() => decodeSolanaTransfer(wire.toString('base64')), error);
});

test('rejects trailing unsigned bytes and noncanonical base64', () => {
  const f = fixture(), wire = Buffer.from(f.expected.transactionBase64, 'base64');
  assert.throws(() => decodeSolanaTransfer(Buffer.concat([wire, Buffer.from([0])]).toString('base64')), /INVALID_TRANSACTION/);
  assert.throws(() => decodeSolanaTransfer(f.expected.transactionBase64 + '\n'), /INVALID_TRANSACTION/);
});

test('owned socket evidence rejects wildcard/public bindings and requires each exact TCP listener', () => {
  const row = { family: 'ipv4', protocol: 'tcp', localAddress: '0100007F', localPort: 12345, remoteAddress: '00000000', remotePort: 0, state: '0A' };
  assert.equal(validateOwnedSocketRows([row], [12345]).length, 1);
  assert.throws(() => validateOwnedSocketRows([{ ...row, localAddress: '00000000' }]), /NON_LOOPBACK_OWNED_SOCKET/);
  assert.throws(() => validateOwnedSocketRows([{ ...row, remoteAddress: '01010101' }]), /NON_LOOPBACK_OWNED_SOCKET/);
  assert.throws(() => validateOwnedSocketRows([row], [12346]), /MISSING_OWNED_LOOPBACK_LISTENER/);
  assert.throws(() => validateOwnedSocketRows([]), /NO_OWNED_SOCKET_EVIDENCE/);
});
