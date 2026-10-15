import test from 'node:test';
import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { frame, decodeFrame, u32be, wordsBE, fromWordsBE, SCOPE, TAGS, sha256, makeFixture, normalizeLowS, ORDER, HALF_ORDER, authorizationFrame } from '../../../proofs/programs/encoding.mjs';
import { verifierCalldata } from '../../../../scripts/engine/integration/crypto/integration-private-signature.mjs';

test('PC15 frame uses exact big-endian length prefixes and preserves boundaries', () => {
  assert.equal(frame('X', [Buffer.from([1, 2]), Buffer.from([3])]).toString('hex'), '0001580000000201020000000103');
  assert.notDeepEqual(frame('X', [Buffer.from('ab'), Buffer.from('c')]), frame('X', [Buffer.from('a'), Buffer.from('bc')]));
  assert.deepEqual(decodeFrame(frame('X', [Buffer.from([1, 2]), Buffer.from([3])]), 'X', [2, 1]), [Buffer.from([1, 2]), Buffer.from([3])]);
});
test('strict decoder rejects wrong domain, lengths, truncation and trailing bytes', () => {
  const f = frame('X', [Buffer.alloc(32)]);
  assert.throws(() => decodeFrame(f, 'Y', [32]));
  assert.throws(() => decodeFrame(f, 'X', [31]));
  assert.throws(() => decodeFrame(f.subarray(0, -1), 'X', [32]));
  assert.throws(() => decodeFrame(Buffer.concat([f, Buffer.from([0])]), 'X', [32]));
  const highBitTag = Buffer.from(f); highBitTag[2] |= 128;
  assert.throws(() => decodeFrame(highBitTag, 'X', [32]));
  assert.throws(() => frame('é', []));
  assert.throws(() => u32be(-1)); assert.throws(() => u32be(2 ** 32));
});
test('all 256 digest bits survive big-endian u32 ABI encoding', () => {
  const digest = Buffer.from('ffffffff000000018000000012345678ffeeddcc000000007fffffff80000001', 'hex');
  assert.deepEqual(fromWordsBE(wordsBE(digest)), digest);
  assert.notDeepEqual(fromWordsBE([...wordsBE(digest)].reverse()), digest);
});
test('standard Node signature hashes canonical preimage once and low-S normalization preserves validity', () => {
  const f = makeFixture(), sig = Buffer.from(f.input.signature);
  const s = BigInt('0x' + sig.subarray(32).toString('hex'));
  assert.ok(s > 0n && s <= HALF_ORDER);
  assert.equal(verify('sha256', f.message, { key: f.publicKey, dsaEncoding: 'ieee-p1363' }, sig), true);
  assert.equal(verify('sha256', sha256(f.message), { key: f.publicKey, dsaEncoding: 'ieee-p1363' }, sig), false);
  const high = Buffer.concat([sig.subarray(0, 32), Buffer.from((ORDER - s).toString(16).padStart(64, '0'), 'hex')]);
  assert.deepEqual(normalizeLowS(high), sig);
  assert.throws(() => normalizeLowS(Buffer.alloc(64)));
  assert.throws(() => normalizeLowS(Buffer.alloc(65)));
});
test('authorization binds scope, version, commitment, policy and domain', () => {
  const f = makeFixture();
  const fields = decodeFrame(f.message, TAGS.authorization, [32, 4, 32, 32]);
  assert.deepEqual(fields[0], SCOPE); assert.equal(fields[1].readUInt32BE(), 1);
  const cross = authorizationFrame({ graphCommitment: fields[2], economicPolicy: fields[3], tag: 'PC15/owner-authorization/2' });
  assert.equal(verify('sha256', cross, { key: f.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(f.input.signature)), false);
  for (let i = 0; i < fields.length; i++) {
    const mutated = fields.map(Buffer.from); mutated[i][0] ^= 1;
    assert.equal(verify('sha256', frame(TAGS.authorization, mutated), { key: f.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(f.input.signature)), false);
  }
});
test('Solidity verifier ABI separates dynamic proof bytes and ordered public words', () => {
  const data = verifierCalldata('ea50d0e4', Buffer.from([0xaa, 0xbb, 0xcc]), [1n, 2n]);
  const payload = Buffer.from(data.slice(10), 'hex');
  const at = offset => BigInt('0x' + payload.subarray(offset, offset + 32).toString('hex'));
  assert.equal(at(0), 64n); assert.equal(at(32), 128n);
  assert.equal(at(64), 3n); assert.equal(payload.subarray(96, 99).toString('hex'), 'aabbcc');
  assert.equal(at(128), 2n); assert.equal(at(160), 1n); assert.equal(at(192), 2n);
  assert.equal(payload.length, 224);
  assert.throws(() => verifierCalldata('bad', Buffer.alloc(32), [0n]));
  assert.throws(() => verifierCalldata('ea50d0e4', Buffer.alloc(32), [2n ** 256n]));
});
