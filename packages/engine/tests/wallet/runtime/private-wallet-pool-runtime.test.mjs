import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PRIVATE_WALLET_VERIFIER_MODES, PRIVATE_WALLET_INPUT_WORDS, PRIVATE_WALLET_POOL_METHODS, PRIVATE_WALLET_POOL_SOURCE_SHA256, privateWalletSourceInput, privateWalletVerifierCalldata, deployPrivateWalletNativePool } from '../../../src/wallet/runtime/private-wallet-runtime.mjs';
import { assertPrivateWalletHeadroom, applyPrivateWalletCapacityTransition } from '../../../src/wallet/resources/private-wallet-capacity.mjs';
const sha = data => createHash('sha256').update(data).digest('hex');
const mock = '// SYNTHETIC SOURCE INTEGRITY CONTROLS ONLY\npragma solidity 0.8.37; contract HonkVerifier {}';
const sources = () => Object.fromEntries(PRIVATE_WALLET_VERIFIER_MODES.map(mode => [mode, { content: mock, sha256: sha(mock) }]));

test('wallet verifier names, exact word counts and methods are independently fixed', () => {
  assert.deepEqual(PRIVATE_WALLET_VERIFIER_MODES, ['reserve','fulfill','refund','withdraw','sol_ready','btc_ready','deposit_balance','reserve_from_note','withdraw_balance']);
  assert.deepEqual(Object.values(PRIVATE_WALLET_INPUT_WORDS), [34,65,41,39,61,79,26,74,39]);
  assert.equal(PRIVATE_WALLET_POOL_METHODS.reserve_from_note, 'reserveFromNoteGuarded');
  assert.equal(PRIVATE_WALLET_POOL_METHODS.sol_ready, undefined);
  for (const [mode, count] of Object.entries(PRIVATE_WALLET_INPUT_WORDS)) {
    const words = Array(count).fill('0');
    assert.match(privateWalletVerifierCalldata(mode, '12345678', Buffer.from([1]), words), /^0x12345678/);
    for (const malformed of [words.slice(1), [...words, '0'], null]) assert.throws(() => privateWalletVerifierCalldata(mode, '12345678', Buffer.from([1]), malformed), /PUBLIC_INPUT_LENGTH/);
  }
  assert.throws(() => privateWalletVerifierCalldata('reserveFromNote', '12345678', Buffer.alloc(0), []), /VERIFIER_MODE/);
});

test('nine-source integrity pins are mandatory, exact and checked before any compiler', async () => {
  const map = sources(), parsed = await privateWalletSourceInput(map);
  assert.equal(Object.keys(parsed.sources).length, 10);
  assert.equal(sha(parsed.sources[parsed.sourceNames.pool].content), PRIVATE_WALLET_POOL_SOURCE_SHA256);
  await assert.rejects(() => privateWalletSourceInput({ ...map, pool: 'override' }), /EXACT_NINE/);
  const missing = sources(); delete missing.withdraw_balance;
  await assert.rejects(() => privateWalletSourceInput(missing), /EXACT_NINE/);
  for (const entry of [mock, { content: mock, sha256: '0'.repeat(64) }, { content: mock, sha256: sha(mock), unchecked: true }]) await assert.rejects(() => privateWalletSourceInput({ ...map, deposit_balance: entry }));
  const imported = 'import "uncontrolled.sol";\n' + mock;
  await assert.rejects(() => privateWalletSourceInput({ ...map, reserve_from_note: { content: imported, sha256: sha(imported) } }), /IMPORTED_SOURCE/);
  await assert.rejects(() => deployPrivateWalletNativePool({}, {}), /RUNTIME_OWNERSHIP/);
});

test('all frozen assembly function bodies remain byte-identical in the wallet authority', async () => {
  const old = await readFile(new URL('../../../../../contracts/engine/PrivateAssemblyNativeNotePool.sol', import.meta.url), 'utf8');
  const wallet = await readFile(new URL('../../../../../contracts/engine/PrivateWalletNativeNotePool.sol', import.meta.url), 'utf8');
  assert.equal(sha(old), '8a41d0e76bd1f1d53b6690e1e052a180d23498125bb8d9964be060ecc5a186da');
  const functions = text => {
    const result = new Map();
    for (const match of text.matchAll(/^    function (\w+)\(/gm)) {
      const start = match.index, body = text.indexOf('{', start);
      if (text.indexOf(';', start) < body) continue;
      let i = body + 1, depth = 1;
      while (depth && i < text.length) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; }
      result.set(match[1], text.slice(start, i));
    }
    return result;
  };
  const original = functions(old), updated = functions(wallet);
  assert.ok(original.size > 30);
  for (const [name, body] of original) assert.equal(updated.get(name), body, `frozen assembly function ${name}`);
  assert.deepEqual([...updated.keys()].filter(name => !original.has(name)).sort(), ['depositBalance', 'reserveFromNoteGuarded', 'withdrawBalance']);
  assert.equal((wallet.match(/mapping\(bytes32 => bool\) public spentNullifiers/g) ?? []).length, 1);
  assert.equal((wallet.match(/mapping\(bytes32 => bool\) public admissions/g) ?? []).length, 1);
  assert.equal((wallet.match(/mapping\(bytes32 => bool\) public insertedCommitments/g) ?? []).length, 1);
});

test('two internal operations and separate withdrawal have the designed counters', () => {
  let state = { leafCount:0, spentCount:0, liveReservations:0, liveOutputNotes:0 };
  for (const mode of ['deposit_balance','reserve_from_note','fulfill','reserve_from_note','fulfill']) state = applyPrivateWalletCapacityTransition(state, mode);
  assert.deepEqual(state, { leafCount:9, spentCount:4, liveReservations:0, liveOutputNotes:5 });
  const withdrawn = applyPrivateWalletCapacityTransition(state, 'withdraw_balance');
  assert.deepEqual(withdrawn, { leafCount:9, spentCount:5, liveReservations:0, liveOutputNotes:4 });
  assert.deepEqual(assertPrivateWalletHeadroom(state), assertPrivateWalletHeadroom(withdrawn));
});

test('wallet transitions preserve legacy reserved terminal headroom at all bounded counter states', () => {
  let checked = 0;
  for (let leaves=0; leaves<=64; leaves++) for (let reservations=0; leaves+2*reservations<=64; reservations++) for (let spent=0; spent+3*reservations<=64; spent++) for (let outputs=0; spent+3*reservations+outputs<=64; outputs++) {
    const state={leafCount:leaves,spentCount:spent,liveReservations:reservations,liveOutputNotes:outputs};
    const room=assertPrivateWalletHeadroom(state);
    for (const mode of ['deposit_balance','reserve_from_note','withdraw_balance']) {
      const allowed=mode==='deposit_balance' ? room.treeRemaining>=1&&room.spentRemaining>=1 : mode==='reserve_from_note' ? outputs>0&&room.treeRemaining>=4&&room.spentRemaining>=4 : outputs>0;
      if (!allowed) { assert.throws(()=>applyPrivateWalletCapacityTransition(state,mode)); continue; }
      const next=applyPrivateWalletCapacityTransition(state,mode), after=assertPrivateWalletHeadroom(next);
      const delta=mode==='deposit_balance'?1:mode==='reserve_from_note'?4:0;
      assert.equal(after.treeRemaining,room.treeRemaining-delta);
      assert.equal(after.spentRemaining,room.spentRemaining-delta);
      if (reservations>0) for (const terminal of ['fulfill','refund']) assert.doesNotThrow(()=>applyPrivateWalletCapacityTransition(next,terminal));
      checked++;
    }
  }
  assert.ok(checked>100000);
});
