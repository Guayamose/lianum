// Canonical PC15 bytes. These are encoders and standard runtime crypto calls,
// not a custom signature scheme or a host substitute for circuit verification.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify, createPublicKey } from 'node:crypto';

export const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export const HALF_ORDER = ORDER / 2n;
export const TAGS = Object.freeze({ graph: 'PC15/micro-graph/1', key: 'PC15/owner-key/1', authorization: 'PC15/owner-authorization/1' });
export const sha256 = bytes => createHash('sha256').update(bytes).digest();
export const shaHex = bytes => sha256(bytes).toString('hex');
export const u32be = value => { assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff); const b = Buffer.alloc(4); b.writeUInt32BE(value); return b; };
export function bytes(value, length, label = 'bytes') {
  assert.ok(Buffer.isBuffer(value) || value instanceof Uint8Array, `${label}: binary bytes required`);
  const result = Buffer.from(value); assert.equal(result.length, length, `${label}: wrong length`); return result;
}
export function frame(tag, fields) {
  assert.ok(typeof tag === 'string' && /^[\x20-\x7e]+$/.test(tag), 'Nonempty ASCII tag required');
  const t = Buffer.from(tag, 'ascii'); assert.ok(t.length <= 65535);
  const prefix = Buffer.alloc(2); prefix.writeUInt16BE(t.length);
  return Buffer.concat([prefix, t, ...fields.flatMap(field => { assert.ok(Buffer.isBuffer(field) || field instanceof Uint8Array); return [u32be(field.length), Buffer.from(field)]; })]);
}
// Independent strict decoder checks the complete frame, including trailing bytes.
export function decodeFrame(encoded, expectedTag, widths) {
  const b = Buffer.from(encoded); let offset = 0;
  const take = n => { assert.ok(offset + n <= b.length, 'Truncated frame'); const v = b.subarray(offset, offset + n); offset += n; return v; };
  const n = take(2).readUInt16BE(); const tag = take(n);
  assert.ok(typeof expectedTag === 'string' && /^[\x20-\x7e]+$/.test(expectedTag));
  assert.deepEqual(tag, Buffer.from(expectedTag, 'ascii'), 'Noncanonical tag bytes');
  const fields = widths.map(width => { assert.equal(take(4).readUInt32BE(), width, 'Noncanonical field length'); return Buffer.from(take(width)); });
  assert.equal(offset, b.length, 'Trailing frame bytes'); return fields;
}
export const SCOPE = sha256(Buffer.from('PC15/15-A/unfunded-local-signature-gate/1', 'ascii'));
export const wordsBE = b => { bytes(b, 32); return Array.from({ length: 8 }, (_, i) => b.readUInt32BE(i * 4)); };
export const fromWordsBE = words => { assert.equal(words.length, 8); return Buffer.concat(words.map(u32be)); };
export const graphCommitment = (graph, salt) => sha256(frame(TAGS.graph, [bytes(graph, 32), bytes(salt, 32)]));
export const keyCommitment = (x, y) => sha256(frame(TAGS.key, [bytes(x, 32), bytes(y, 32)]));
export const authorizationFrame = ({ scope = SCOPE, graphCommitment: commitment, economicPolicy, tag = TAGS.authorization }) => frame(tag, [bytes(scope, 32), u32be(1), bytes(commitment, 32), bytes(economicPolicy, 32)]);
export function normalizeLowS(signature) {
  const sig = bytes(signature, 64, 'P1363 signature');
  const r = BigInt('0x' + sig.subarray(0, 32).toString('hex'));
  let s = BigInt('0x' + sig.subarray(32).toString('hex'));
  assert.ok(r > 0n && r < ORDER && s > 0n && s < ORDER, 'Noncanonical ECDSA scalar');
  if (s > HALF_ORDER) s = ORDER - s;
  return Buffer.concat([sig.subarray(0, 32), Buffer.from(s.toString(16).padStart(64, '0'), 'hex')]);
}
export function signAuthorization(privateKey, message) {
  // Node hashes the canonical preimage once. Passing sha256(message) here
  // would hash twice and is covered by a negative witness case.
  return normalizeLowS(sign('sha256', message, { key: privateKey, dsaEncoding: 'ieee-p1363' }));
}
export function publicKeyFromCoordinates(x, y) {
  return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1', x: bytes(x, 32).toString('base64url'), y: bytes(y, 32).toString('base64url') } });
}
export function makeFixture() {
  // Fresh throwaway synthetic key. The private key never leaves this process.
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x, 'base64url'), y = Buffer.from(jwk.y, 'base64url');
  const graph = sha256(Buffer.from('public synthetic micro-graph fixture'));
  const salt = sha256(Buffer.from('public synthetic micro-graph salt; never use in production'));
  const economicPolicy = sha256(Buffer.from('UNFUNDED_SIGNATURE_CAPABILITY_ONLY'));
  const commitment = graphCommitment(graph, salt), owner = keyCommitment(x, y);
  const message = authorizationFrame({ graphCommitment: commitment, economicPolicy });
  const signature = signAuthorization(privateKey, message);
  assert.equal(verify('sha256', message, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature), true);
  return { privateKey, publicKey, message, input: { scope: wordsBE(SCOPE), owner_commitment: wordsBE(owner), graph_commitment: wordsBE(commitment), graph: [...graph], salt: [...salt], economic_policy: [...economicPolicy], public_key_x: [...x], public_key_y: [...y], signature: [...signature] } };
}
