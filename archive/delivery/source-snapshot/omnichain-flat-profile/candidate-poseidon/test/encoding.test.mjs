import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalField, digestLimbs, uint, FIELD_MODULUS, PROFILE } from '../src/framing.mjs';

const hex = value => value.toString(16).padStart(64, '0');

test('external digest encoding preserves all 256 bits without reduction', () => {
  const original = (1n << 255n) + (19n << 128n) + 7n;
  const [high, low] = digestLimbs(hex(original));
  assert.ok(high < 1n << 128n && low < 1n << 128n);
  assert.equal((high << 128n) + low, original);
  assert.notDeepEqual(digestLimbs(hex(original)), digestLimbs(hex(original - FIELD_MODULUS)));
});

test('internal scalar boundary rejects modular aliases', () => {
  assert.equal(canonicalField(hex(0n)), 0n);
  assert.equal(canonicalField(hex(FIELD_MODULUS - 1n)), FIELD_MODULUS - 1n);
  for (const value of [FIELD_MODULUS, FIELD_MODULUS + 1n, (1n << 256n) - 1n])
    assert.throws(() => canonicalField(hex(value)), /P2_FIELD_RANGE/);
});

test('host scalar encodings reject normalized alternate spellings', () => {
  for (const value of [hex(1n) + '\n', hex(1n) + '\r', '0x' + hex(1n), 'A'.repeat(64)])
    assert.throws(() => canonicalField(value));
  for (const value of ['1\n', '01', '+1', '-1', ' 1', '1 ', '1e0'])
    assert.throws(() => uint(value, 64));
  assert.equal(uint('18446744073709551615', 64), (1n << 64n) - 1n);
  assert.throws(() => uint('18446744073709551616', 64), /P2_UINT_RANGE/);
});

test('profile constant preserves the complete ASCII identifier', () => {
  assert.equal(Buffer.from(PROFILE.toString(16), 'hex').toString('ascii'), 'LIANUM_PAEG_P2_V1');
  assert.ok(PROFILE < FIELD_MODULUS);
});
