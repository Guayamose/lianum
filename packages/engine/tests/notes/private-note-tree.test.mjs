import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  PRIVATE_NOTE_DEPTH, PRIVATE_NOTE_CAPACITY, PRIVATE_NOTE_EPOCH_SECONDS, ZERO_NOTE_HASH,
  PRIVATE_POOL_INPUT_WORDS, PrivateNoteTree, noteNodeHash, derivePrivatePoolScope,
  noteHashToWords, noteWordsToHash, encodePrivatePoolInputs, privatePoolAbiWords,
  verifyPrivateNotePath, privateBoundedListFrame, privateBoundedListDigest,
  privateSpentDigest, privateEffectDigest, assertPrivateNoteHeadroom, applyPrivateNoteCapacityTransition,
} from '../../src/notes/private-note-tree.mjs';

// Host-only encoding, tree and capacity tests. No mock verifier, native-chain
// execution, funded proof, membership authorization or circuit validity claim.
const h = n => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const sha = bytes => `0x${createHash('sha256').update(bytes).digest('hex')}`;
function oracleTree(leaves) {
  let row = Array.from({ length: 64 }, (_, i) => Buffer.from((leaves[i] ?? ZERO_NOTE_HASH).slice(2), 'hex'));
  while (row.length > 1) {
    const next = [];
    for (let i = 0; i < row.length; i += 2) next.push(createHash('sha256').update(Buffer.from([1])).update(row[i]).update(row[i + 1]).digest());
    row = next;
  }
  return `0x${row[0].toString('hex')}`;
}

function zeroCapacity() { return { leafCount: 0, spentCount: 0, liveReservations: 0, liveOutputNotes: 0 }; }

test('private note constants and independent empty/append tree vectors', () => {
  assert.equal(PRIVATE_NOTE_DEPTH, 6); assert.equal(PRIVATE_NOTE_CAPACITY, 64); assert.equal(PRIVATE_NOTE_EPOCH_SECONDS, 600);
  const tree = new PrivateNoteTree();
  assert.equal(tree.root, '0xc6984907d2e534964351393bc85f04374065b63870cc859c68192def090c1017');
  assert.equal(tree.root, oracleTree([]));
  assert.equal(tree.nodes[0], ZERO_NOTE_HASH);
  assert.equal(tree.append(h(1)), 0);
  assert.equal(tree.root, '0x41187a58bc985d9f787f49a2550933fb1e8bf0001723314dbc1bda8f81ffb4df');
  assert.equal(tree.append(h(2)), 1);
  assert.equal(tree.root, '0xc6d828d3ccdf16bd850957096021ad3d213a5c26da27c11b0bed295432efe3c9');
  assert.equal(tree.root, oracleTree([h(1), h(2)]));
  assert.notEqual(noteNodeHash(h(1), h(2)), noteNodeHash(h(2), h(1)));
  assert.notEqual(noteNodeHash(h(1), h(2)), sha(Buffer.concat([Buffer.from(h(1).slice(2), 'hex'), Buffer.from(h(2).slice(2), 'hex')])));
});

test('all 64 append roots and membership paths match independent construction', () => {
  const tree = new PrivateNoteTree(), leaves = [];
  for (let i = 0; i < 64; i++) {
    leaves.push(h(i + 1)); assert.equal(tree.append(leaves[i]), i);
    assert.equal(tree.root, oracleTree(leaves));
    for (let j = 0; j <= i; j++) assert.equal(verifyPrivateNotePath(tree.path(j)), true);
  }
  assert.equal(tree.leafCount, 64);
  assert.throws(() => tree.append(h(65)), /TREE_FULL/);
  assert.equal(new PrivateNoteTree(leaves).root, tree.root);
});

test('tree rejects duplicate/zero leaves and returns isolated read-only snapshots', () => {
  const tree = new PrivateNoteTree([h(1), h(2)]), before = tree.root;
  for (const bad of [h(1), ZERO_NOTE_HASH, Buffer.alloc(32)]) assert.throws(() => tree.append(bad), /DUPLICATE_OR_ZERO/);
  assert.throws(() => tree.append('ff'), /WIDTH/);
  assert.throws(() => tree.append(`0x${'AB'.repeat(32)}`), /ENCODING/);
  assert.throws(() => new PrivateNoteTree(Array(65).fill(h(1))), /TREE_CAPACITY/);
  tree.nodes[1] = h(9); tree.leaves[0] = h(9);
  assert.equal(tree.root, before); assert.equal(tree.leaves[0], h(1));
  assert.equal(tree.leafCount, 2);
});

test('membership path fixes position, ordering, root and exact depth', () => {
  const tree = new PrivateNoteTree([h(1), h(2), h(3)]), path = tree.path(1);
  assert.equal(verifyPrivateNotePath({ ...path, index: 0 }), false);
  assert.equal(verifyPrivateNotePath({ ...path, leaf: h(9) }), false);
  assert.equal(verifyPrivateNotePath({ ...path, root: h(9) }), false);
  assert.equal(verifyPrivateNotePath({ ...path, siblings: [...path.siblings].reverse() }), false);
  assert.throws(() => verifyPrivateNotePath({ ...path, siblings: path.siblings.slice(1) }), /PATH_DEPTH/);
  assert.throws(() => verifyPrivateNotePath({ ...path, index: 64 }), /LEAF_INDEX_RANGE/);
  assert.throws(() => verifyPrivateNotePath({ ...path, leaf: ZERO_NOTE_HASH }), /EMPTY_LEAF/);
  for (const index of [3, 64, -1, -0, 1.5, '01']) assert.throws(() => tree.path(index));
});

test('scope framing binds all 256 chain-ID bits, actual address and deployment domain', () => {
  const address = `0x${'11'.repeat(20)}`;
  const scope = derivePrivatePoolScope(31337, address, h(9));
  const frame = Buffer.alloc(85); frame[0] = 5; frame.writeUInt32BE(31337, 29);
  Buffer.from('11'.repeat(20), 'hex').copy(frame, 33); Buffer.from(h(9).slice(2), 'hex').copy(frame, 53);
  assert.equal(scope, sha(frame));
  assert.equal(scope, '0x3cff119eb9c35ae9c25904a4093cf765239ae70d3033d3ced39af7eab989dca7');
  assert.notEqual(scope, derivePrivatePoolScope((1n << 200n) + 31337n, address, h(9)));
  assert.notEqual(scope, derivePrivatePoolScope(31337, `0x${'22'.repeat(20)}`, h(9)));
  assert.notEqual(scope, derivePrivatePoolScope(31337, address, h(10)));
  for (const chain of [-1, -0, 1n << 256n, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => derivePrivatePoolScope(chain, address, h(9)));
});

test('digest limbs preserve maximum and high bits without field reduction or truncation', () => {
  for (const value of [ZERO_NOTE_HASH, h(1), h(1n << 255n), `0x${'ff'.repeat(32)}`, `0x${'01234567'.repeat(8)}`]) {
    const words = noteHashToWords(value);
    assert.equal(words.length, 8); assert.equal(noteWordsToHash(words), value);
    assert.equal(noteWordsToHash(privatePoolAbiWords(words)), value);
  }
  assert.deepEqual(noteHashToWords(`0x${'ffffffff'.repeat(8)}`), Array(8).fill('4294967295'));
  for (const bad of ['4294967296', '-1', -0, '01', `0x${'00'.repeat(27)}0100000000`]) assert.throws(() => noteWordsToHash([bad, ...Array(7).fill('0')]));
  assert.throws(() => noteWordsToHash(Array(7).fill('0')), /WORD_COUNT/);
});

test('every public ABI is complete, ordered and field-exact', () => {
  const common = { scope: h(1), policy: h(2), epoch: '3' };
  const statements = {
    reserve: { ...common, amount: '4', output: h(5), admissionTag: h(6) },
    fulfill: { ...common, root: h(4), nullifier: h(5), effectSol: h(6), effectBtc: h(7), outputSol: h(8), outputBtc: h(9) },
    refund: { ...common, root: h(4), nullifier: h(5), outputRecovery: h(6) },
    withdraw: { ...common, root: h(4), nullifier: h(5), amount: '6', recipient: '0x0123456789abcdef00112233445566778899aabb' },
  };
  for (const [mode, statement] of Object.entries(statements)) {
    const words = encodePrivatePoolInputs(mode, statement);
    assert.equal(words.length, PRIVATE_POOL_INPUT_WORDS[mode]);
    assert.equal(noteWordsToHash(words.slice(0, 8)), h(1));
    assert.equal(noteWordsToHash(words.slice(8, 16)), h(2)); assert.equal(words[16], '3');
    assert.equal(privatePoolAbiWords(words).length, words.length);
    assert.throws(() => encodePrivatePoolInputs(mode, { ...statement, graph: h(9) }), /POOL_FIELDS/);
    const missing = { ...statement }; delete missing.policy;
    assert.throws(() => encodePrivatePoolInputs(mode, missing), /POOL_FIELDS/);
  }
  assert.equal(noteWordsToHash(encodePrivatePoolInputs('reserve', statements.reserve).slice(26, 34)), h(6));
  assert.equal(noteWordsToHash(encodePrivatePoolInputs('fulfill', statements.fulfill).slice(57, 65)), h(9));
  assert.equal(noteWordsToHash(encodePrivatePoolInputs('refund', statements.refund).slice(33, 41)), h(6));
  const withdraw = encodePrivatePoolInputs('withdraw', statements.withdraw);
  assert.equal(withdraw[33], '6');
  assert.deepEqual(withdraw.slice(34), [0x01234567, 0x89abcdef, 0x00112233, 0x44556677, 0x8899aabb].map(String));
  for (const field of ['epoch', 'amount']) assert.throws(() => encodePrivatePoolInputs('reserve', { ...statements.reserve, [field]: (1n << 64n).toString() }), /U64_RANGE/);
  assert.throws(() => encodePrivatePoolInputs('other', common), /POOL_MODE/);
});

test('spent digest has exact independent 2085-byte fixed frame and count order', () => {
  const scope = h(9), entries = [h(1), h(2)];
  const expected = Buffer.alloc(2085); expected[0] = 2;
  Buffer.from(scope.slice(2), 'hex').copy(expected, 1); expected.writeUInt32BE(2, 33);
  Buffer.from(entries[0].slice(2), 'hex').copy(expected, 37); Buffer.from(entries[1].slice(2), 'hex').copy(expected, 69);
  assert.deepEqual(privateBoundedListFrame(2, scope, entries), expected);
  assert.equal(privateSpentDigest(scope, entries), sha(expected));
  assert.equal(privateSpentDigest(scope, []), '0xc0ea3c29f60611994bfd86865311802a44f3785132d5e5035e7aa48967e71733');
  assert.equal(privateSpentDigest(scope, entries), '0xa4821dbe85883b3e7a4041e15f4e66d9a095b5a40bedc36ac80f7d44fa977dcf');
  assert.equal(privateSpentDigest(scope, [...entries, ...Array(62).fill(ZERO_NOTE_HASH)], 2), sha(expected));
  assert.notEqual(privateSpentDigest(scope, entries), privateSpentDigest(scope, [...entries].reverse()));
  assert.notEqual(privateSpentDigest(scope, entries), privateSpentDigest(h(10), entries));
});

test('spent and effect canonical lists reject sparse/duplicate/noncanonical padding', () => {
  const scope = h(9);
  assert.throws(() => privateSpentDigest(scope, [h(1), h(1)]), /LIST_DUPLICATE/);
  assert.throws(() => privateSpentDigest(scope, [ZERO_NOTE_HASH]), /LIST_ZERO_ENTRY/);
  assert.throws(() => privateSpentDigest(scope, [h(1), h(2)], 1), /LIST_PADDING/);
  assert.throws(() => privateSpentDigest(scope, [h(1)], 2), /LIST_COUNT/);
  assert.throws(() => privateSpentDigest(scope, Array(65).fill(h(1))), /LIST_CAPACITY/);
  for (const n of [-1, -0, 65, 1.1, '01']) assert.throws(() => privateSpentDigest(scope, [], n));
  assert.throws(() => privateBoundedListDigest(0, scope, []), /LIST_TYPE/);
  const entries = Array.from({ length: 64 }, (_, i) => h(i + 1));
  assert.equal(privateBoundedListFrame(2, scope, entries).length, 2085);
});

test('SOL and BTC effect digests have distinct explicit types and share no spent domain', () => {
  const scope = h(9), entries = [h(1)];
  const spent = privateSpentDigest(scope, entries), sol = privateEffectDigest('SOL', scope, entries), btc = privateEffectDigest('BTC', scope, entries);
  assert.equal(new Set([spent, sol, btc]).size, 3);
  for (const [type, actual] of [[3, sol], [4, btc]]) {
    const frame = privateBoundedListFrame(2, scope, entries); frame[0] = type;
    assert.equal(actual, sha(frame));
  }
  assert.throws(() => privateEffectDigest('ETH', scope, entries), /EFFECT_CHAIN/);
});

test('reservation admission preserves full future terminal and withdrawal capacity', () => {
  let state = zeroCapacity();
  for (let i = 0; i < 21; i++) state = applyPrivateNoteCapacityTransition(state, 'reserve');
  assert.deepEqual(state, { leafCount: 21, spentCount: 0, liveReservations: 21, liveOutputNotes: 0 });
  assert.deepEqual(assertPrivateNoteHeadroom(state), { treeRemaining: 1, spentRemaining: 1 });
  assert.throws(() => applyPrivateNoteCapacityTransition(state, 'reserve'), /HEADROOM/);
  for (let i = 0; i < 21; i++) state = applyPrivateNoteCapacityTransition(state, 'fulfill');
  assert.deepEqual(state, { leafCount: 63, spentCount: 21, liveReservations: 0, liveOutputNotes: 42 });
  for (let i = 0; i < 42; i++) state = applyPrivateNoteCapacityTransition(state, 'withdraw');
  assert.deepEqual(state, { leafCount: 63, spentCount: 63, liveReservations: 0, liveOutputNotes: 0 });
  assert.throws(() => applyPrivateNoteCapacityTransition(state, 'reserve'), /HEADROOM/);
  assert.throws(() => applyPrivateNoteCapacityTransition(state, 'withdraw'), /NO_LIVE_OUTPUT/);
  assert.throws(() => applyPrivateNoteCapacityTransition(state, 'refund'), /NO_LIVE_RESERVATION/);
});

test('exhaustive reachable capacity states never strand admitted completion or withdrawal', () => {
  const queue = [zeroCapacity()], seen = new Set([JSON.stringify(queue[0])]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const state = queue[cursor];
    for (const mode of ['reserve', 'fulfill', 'refund', 'withdraw']) {
      const obligatory = (mode === 'fulfill' || mode === 'refund') ? state.liveReservations > 0 : mode === 'withdraw' && state.liveOutputNotes > 0;
      let next;
      try { next = applyPrivateNoteCapacityTransition(state, mode); }
      catch (error) { assert.equal(obligatory, false, `${mode} stranded ${JSON.stringify(state)}: ${error.message}`); continue; }
      const key = JSON.stringify(next);
      if (!seen.has(key)) { seen.add(key); queue.push(next); }
    }
  }
  assert.ok(queue.length > 1000);
});

test('capacity validation detects either independently exhausted resource', () => {
  assert.throws(() => assertPrivateNoteHeadroom({ leafCount: 63, spentCount: 0, liveReservations: 1, liveOutputNotes: 0 }), /TREE_HEADROOM/);
  assert.throws(() => assertPrivateNoteHeadroom({ leafCount: 0, spentCount: 62, liveReservations: 1, liveOutputNotes: 0 }), /SPENT_HEADROOM/);
  assert.throws(() => assertPrivateNoteHeadroom({ leafCount: 0, spentCount: 64, liveReservations: 0, liveOutputNotes: 1 }), /SPENT_HEADROOM/);
  assert.throws(() => assertPrivateNoteHeadroom({ ...zeroCapacity(), liveReservations: -1 }), /RANGE/);
  assert.throws(() => applyPrivateNoteCapacityTransition(zeroCapacity(), 'unknown'), /POOL_MODE/);
});

// Pure runtime-helper tests: no RPC, process startup, deployment or fake proofs.
test('private verifier calldata independent decoder covers unaligned proof bytes and complete words', async () => {
  const { privateVerifierCalldata } = await import('../../src/notes/private-note-runtime.mjs');
  for (const length of [0, 1, 31, 32, 33, 9152]) {
    const proof = Buffer.alloc(length, 0xab), inputs = ['0', '4294967295', (1n << 255n).toString()];
    const encoded = privateVerifierCalldata('12345678', proof, inputs);
    const body = Buffer.from(encoded.slice(10), 'hex');
    const read = offset => BigInt(`0x${body.subarray(offset, offset + 32).toString('hex')}`);
    assert.equal(read(0), 64n);
    const wordsAt = Number(read(32)); assert.equal(wordsAt, 96 + Math.ceil(length / 32) * 32);
    assert.equal(read(64), BigInt(length)); assert.deepEqual(body.subarray(96, 96 + length), proof);
    assert.ok(body.subarray(96 + length, wordsAt).every(value => value === 0));
    assert.equal(read(wordsAt), 3n);
    for (let i = 0; i < 3; i++) assert.equal(read(wordsAt + 32 * (i + 1)), BigInt(inputs[i]));
    assert.equal(body.length, wordsAt + 128);
  }
  assert.throws(() => privateVerifierCalldata('1234567', Buffer.alloc(0), []));
  assert.throws(() => privateVerifierCalldata('12345678', 'not bytes', []));
  for (const bad of [-1, -0, 1n << 256n, '01', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => privateVerifierCalldata('12345678', Buffer.alloc(0), [bad]));
});

test('private runtime revert parser preserves custom errors and distinguishes empty/invalid payloads', async () => {
  const { decodePrivateRevert } = await import('../../src/notes/private-note-runtime.mjs');
  assert.deepEqual(decodePrivateRevert('0x12345678'), { data: '0x12345678', selector: '0x12345678', kind: 'CUSTOM_ERROR' });
  assert.equal(decodePrivateRevert('0x').kind, 'EMPTY_REVERT');
  assert.equal(decodePrivateRevert('1234').kind, 'MALFORMED_REVERT');
  const reason = Buffer.from('NOTE_ALREADY_SPENT'), w = n => BigInt(n).toString(16).padStart(64, '0');
  const encoded = `08c379a0${w(32)}${w(reason.length)}${reason.toString('hex').padEnd(64, '0')}`;
  assert.equal(decodePrivateRevert(encoded).reason, 'NOTE_ALREADY_SPENT');
  assert.equal(decodePrivateRevert(encoded).kind, 'ERROR_STRING');
  assert.equal(decodePrivateRevert('08c379a0').kind, 'MALFORMED_ERROR_STRING');
  assert.equal(decodePrivateRevert(`4e487b71${w(0x11)}`).panicCode, '0x11');
  assert.throws(() => decodePrivateRevert('0xz1'));
  assert.throws(() => decodePrivateRevert('0x1'));
});

test('private bytecode linking replaces exact compiler offsets, rejects unlinked and overlapping slots', async () => {
  const { linkPrivateBytecode } = await import('../../src/notes/private-note-runtime.mjs');
  const placeholder = '_'.repeat(40), code = `6000${placeholder}6001${placeholder}6002`;
  const refs = { 'A.sol': { Lib: [{ start: 2, length: 20 }, { start: 24, length: 20 }] } };
  const libraries = { 'A.sol:Lib': `0x${'12'.repeat(20)}` };
  assert.equal(linkPrivateBytecode(code, refs, libraries), `6000${'12'.repeat(20)}6001${'12'.repeat(20)}6002`);
  assert.throws(() => linkPrivateBytecode(code, {}, {}), /UNRESOLVED/);
  assert.throws(() => linkPrivateBytecode(code, refs, {}));
  assert.throws(() => linkPrivateBytecode(code, { 'A.sol': { Lib: [{ start: 2, length: 19 }] } }, libraries), /LINK_WIDTH/);
  assert.throws(() => linkPrivateBytecode(code, { 'A.sol': { Lib: [{ start: 2, length: 20 }, { start: 3, length: 20 }] } }, libraries), /LINK_OVERLAP/);
  assert.throws(() => linkPrivateBytecode(code, { 'A.sol': { Lib: [{ start: 40, length: 20 }] } }, libraries), /LINK_BOUNDS/);
});
