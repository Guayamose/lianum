import test from 'node:test';
import assert from 'node:assert/strict';
import { enc, u64be, economics } from '../../../../scripts/engine/proofs/proof-encoding-fixtures.mjs';

test('M6 ENC uses exact tag/field framing and preserves empty fields', () => {
  assert.equal(enc('', []).toString('hex'), '0000');
  assert.equal(enc('t', [Buffer.from([1, 2]), Buffer.alloc(0)]).toString('hex'), '00017400000002010200000000');
  assert.notDeepEqual(enc('t', [Buffer.from([1]), Buffer.from([2])]), enc('t', [Buffer.from([1, 2])]));
  assert.notDeepEqual(enc('t', []), enc('t', [Buffer.alloc(0)]));
  assert.throws(() => enc('é', []), /ASCII/);
  assert.throws(() => enc('t'.repeat(65536), []), /u16/);
  assert.throws(() => enc('t', ['01']), /bytes/);
});

test('M6 byte encoding rejects integer overflow or implicit field reduction', () => {
  assert.equal(u64be(1n).toString('hex'), '0000000000000001');
  assert.equal(u64be((1n << 64n) - 1n).toString('hex'), 'ffffffffffffffff');
  for (const value of [-1n, 1n << 64n, 1, '1']) assert.throws(() => u64be(value), /64-bit/);
});

test('M6 exact two-outcome values, rounding and funding failures', () => {
  const terms = { B: 1000000n, FS: 10000n, FB: 15000n, pS: 1n, qS: 10n, pB: 4n, qB: 1n };
  assert.deepEqual(economics({ ...terms, S: 3000000n }), { S: 3000000n, cost: 300000n, K: 168750n, PS: 310000n, PB: 690000n });
  assert.deepEqual(economics({ ...terms, S: 3500000n }), { S: 3500000n, cost: 350000n, K: 156250n, PS: 360000n, PB: 640000n });
  const rounded = economics({ ...terms, S: 3000001n });
  assert.equal(rounded.cost, 300001n); assert.equal(rounded.K, 168749n);
  // The generic calculator does not admit this non-menu S into PC5-F.
  assert.throws(() => economics({ ...terms, S: 3000000n, B: 1n }), /residual/);
  assert.throws(() => economics({ ...terms, S: 1n, qS: 0n }), /denominator/);
  assert.throws(() => economics({ ...terms, S: 1n, pB: 0n }), /denominator/);
  assert.throws(() => economics({ ...terms, S: (1n << 64n) - 1n, pS: (1n << 64n) - 1n, qS: 1n }), /64-bit/);
});
