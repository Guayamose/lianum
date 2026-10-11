/** Stateless canonical EVM wire codecs. No RPC, owned runtime, private key or
 * recovery capability is imported or created by public signature verification. */
import assert from 'node:assert/strict';
import { createHash, ECDH } from 'node:crypto';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';

function uint(value, bits = 256) {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0), 'LOCAL_EVM_SAFE_INTEGER');
  assert.ok(['number', 'bigint', 'string'].includes(typeof value), 'LOCAL_EVM_INTEGER');
  if (typeof value === 'string') assert.match(value, /^(?:0|[1-9][0-9]*|0x[0-9a-f]+)$/i, 'LOCAL_EVM_INTEGER');
  const n = BigInt(value); assert.ok(n >= 0n && n < (1n << BigInt(bits)), 'LOCAL_EVM_INTEGER_RANGE'); return n;
}

// Canonical legacy EIP-155 transactions. Public verification only: SEC 1
// ECDSA public-key recovery on secp256k1, with OpenSSL point decompression.
// No private scalar, key import, ECDSA signing or alternate signature scheme.
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const FIELD = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const GENERATOR = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const sha = raw => createHash('sha256').update(raw).digest('hex');
const keccak = raw => publicKeccak256(raw);
const freeze = value => {
  if (value && typeof value === 'object') { for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); }
  return value;
};
const mod = (value, modulus) => (value % modulus + modulus) % modulus;
function inverse(value, modulus) {
  let [a, b, x, y] = [mod(value, modulus), modulus, 1n, 0n];
  assert.notEqual(a, 0n, 'EVM_SIGNATURE_ZERO_INVERSE');
  while (b) { const q = a / b; [a, b] = [b, a - q * b]; [x, y] = [y, x - q * y]; }
  assert.equal(a, 1n, 'EVM_SIGNATURE_INVERSE'); return mod(x, modulus);
}
function addPoint(p, q) {
  if (p === null) return q; if (q === null) return p;
  if (p[0] === q[0] && mod(p[1] + q[1], FIELD) === 0n) return null;
  const slope = p[0] === q[0] ? mod(3n * p[0] * p[0] * inverse(2n * p[1], FIELD), FIELD)
    : mod((q[1] - p[1]) * inverse(q[0] - p[0], FIELD), FIELD);
  const x = mod(slope * slope - p[0] - q[0], FIELD);
  return [x, mod(slope * (p[0] - x) - p[1], FIELD)];
}
function multiplyPoint(p, scalar) {
  let result = null, factor = p;
  for (let n = scalar; n > 0n; n >>= 1n) { if (n & 1n) result = addPoint(result, factor); factor = addPoint(factor, factor); }
  return result;
}
function recoverSender(hash, r, s, parity) {
  assert.ok(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'EVM_SIGNATURE_LOW_S');
  // Ethereum's v encodes only parity (recovery x = r), not x-overflow.
  const compressed = Buffer.from((parity ? '03' : '02') + r.toString(16).padStart(64, '0'), 'hex');
  const point = ECDH.convertKey(compressed, 'secp256k1', undefined, undefined, 'uncompressed');
  const R = [BigInt('0x' + point.subarray(1, 33).toString('hex')), BigInt('0x' + point.subarray(33).toString('hex'))];
  assert.equal(multiplyPoint(R, ORDER), null, 'EVM_SIGNATURE_POINT_ORDER');
  const z = BigInt('0x' + hash.toString('hex'));
  const Q = multiplyPoint(addPoint(multiplyPoint(R, s), multiplyPoint(GENERATOR, mod(-z, ORDER))), inverse(r, ORDER));
  assert.ok(Q, 'EVM_SIGNATURE_INFINITY');
  const check = addPoint(multiplyPoint(GENERATOR, mod(z * inverse(s, ORDER), ORDER)),
    multiplyPoint(Q, mod(r * inverse(s, ORDER), ORDER)));
  assert.ok(check && mod(check[0], ORDER) === r, 'EVM_SIGNATURE_INVALID');
  const uncompressed = Buffer.from('04' + Q.map(n => n.toString(16).padStart(64, '0')).join(''), 'hex');
  assert.deepEqual(ECDH.convertKey(uncompressed, 'secp256k1', undefined, undefined, 'uncompressed'), uncompressed,
    'EVM_SIGNATURE_PUBLIC_KEY');
  return '0x' + keccak(uncompressed.subarray(1)).subarray(12).toString('hex');
}
/** Public-only recovery primitive for independent standard ECDSA test vectors.
 * Digest/r/s are exact bare 32-byte hex; parity is 0 or 1. Never signs. */
export function recoverSecp256k1Sender({ digest, r, s, parity }) {
  for (const value of [digest, r, s]) assert.match(value, /^[0-9a-f]{64}$/, 'EVM_SIGNATURE_HEX');
  assert.ok(parity === 0 || parity === 1, 'EVM_SIGNATURE_PARITY');
  return recoverSender(Buffer.from(digest, 'hex'), BigInt('0x' + r), BigInt('0x' + s), parity);
}
function integerBytes(number) {
  const n = uint(number); if (n === 0n) return Buffer.alloc(0);
  let raw = n.toString(16); if (raw.length % 2) raw = '0' + raw; return Buffer.from(raw, 'hex');
}
function rlpLength(length, offset) {
  if (length < 56) return Buffer.from([offset + length]);
  const raw = integerBytes(length); return Buffer.concat([Buffer.from([offset + 55 + raw.length]), raw]);
}
function encodeRlp(value) {
  if (Array.isArray(value)) { const body = Buffer.concat(value.map(encodeRlp)); return Buffer.concat([rlpLength(body.length, 0xc0), body]); }
  if (value.length === 1 && value[0] < 0x80) return value;
  return Buffer.concat([rlpLength(value.length, 0x80), value]);
}
function decodeRlp(raw) {
  let position = 0;
  const read = (end, depth) => {
    assert.ok(position < end && depth <= 1, 'EVM_RLP_STRUCTURE');
    const first = raw[position++]; if (first < 0x80) return Buffer.from([first]);
    const list = first >= 0xc0, offset = list ? 0xc0 : 0x80;
    let length = first - offset;
    if (length > 55) {
      const lengthBytes = length - 55;
      assert.ok(lengthBytes <= 4 && position + lengthBytes <= end && raw[position] !== 0, 'EVM_RLP_LENGTH');
      length = Number(BigInt('0x' + raw.subarray(position, position + lengthBytes).toString('hex')));
      position += lengthBytes; assert.ok(length >= 56, 'EVM_RLP_NONCANONICAL_LENGTH');
    }
    assert.ok(position + length <= end, 'EVM_RLP_TRUNCATED'); const boundary = position + length;
    if (!list) { const body = raw.subarray(position, boundary); position = boundary;
      assert.ok(length !== 1 || body[0] >= 0x80, 'EVM_RLP_NONCANONICAL_STRING'); return body; }
    const values = []; while (position < boundary) values.push(read(boundary, depth + 1)); return values;
  };
  const decoded = read(raw.length, 0); assert.equal(position, raw.length, 'EVM_RLP_TRAILING');
  assert.deepEqual(encodeRlp(decoded), raw, 'EVM_RLP_CANONICAL'); return decoded;
}
function decodeInteger(raw) {
  assert.ok(Buffer.isBuffer(raw) && raw.length <= 32 && (raw.length === 0 || raw[0] !== 0), 'EVM_RLP_INTEGER');
  return raw.length ? BigInt('0x' + raw.toString('hex')) : 0n;
}
const unsignedFields = tx => [integerBytes(tx.nonce), integerBytes(tx.gasPrice), integerBytes(tx.gas),
  Buffer.from(tx.to?.slice(2) ?? '', 'hex'), integerBytes(tx.value), Buffer.from(tx.data.slice(2), 'hex'),
  integerBytes(tx.chainId), Buffer.alloc(0), Buffer.alloc(0)];
/** Pure canonical signing preimage for the exact prepared dispatch fields. */
export function encodeCanonicalEvmUnsignedTransaction(expected) {
  assert.ok(expected && Object.getPrototypeOf(expected) === Object.prototype, 'EVM_EXPECTED_TRANSACTION_FIELDS');
  const names = ['chainId', 'data', 'from', 'gas', 'gasPrice', 'nonce', 'to', 'value'];
  assert.deepEqual(Reflect.ownKeys(expected).sort(), names);
  for (const name of names) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(expected, name) ?? {}, 'value'),
    'EVM_EXPECTED_TRANSACTION_FIELDS');
  for (const name of ['chainId', 'gas', 'gasPrice', 'nonce', 'value']) {
    const value = expected[name];
    assert.ok(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value
      && BigInt(value).toString() === value && BigInt(value) < 1n << 256n, 'EVM_EXPECTED_TRANSACTION_INTEGER');
  }
  assert.ok(BigInt(expected.chainId) > 0n && BigInt(expected.gas) > 0n, 'EVM_EXPECTED_TRANSACTION_INTEGER');
  for (const name of ['from', 'to']) assert.ok(typeof expected[name] === 'string' && expected[name].length === 42
    && /^0x[0-9a-f]{40}$/.exec(expected[name])?.[0] === expected[name], 'EVM_EXPECTED_TRANSACTION_ADDRESS');
  assert.ok(typeof expected.data === 'string' && expected.data.length <= 262146
    && /^0x(?:[0-9a-f]{2})*$/.exec(expected.data)?.[0] === expected.data, 'EVM_EXPECTED_TRANSACTION_DATA');
  return '0x' + encodeRlp(unsignedFields(expected)).toString('hex');
}
/** Pure read-only canonical wire verifier, also used by receipt observers.
 * Supports only replay-protected legacy transactions with low-S signatures.
 */
export function decodeCanonicalEvmTransaction(rawHex) {
  assert.equal(typeof rawHex, 'string', 'EVM_WIRE_BYTES');
  assert.ok(/^0x[0-9a-f]+$/.exec(rawHex)?.[0] === rawHex && rawHex.length % 2 === 0 && rawHex.length <= 262_146, 'EVM_WIRE_BYTES');
  const raw = Buffer.from(rawHex.slice(2), 'hex'), values = decodeRlp(raw);
  assert.ok(Array.isArray(values) && values.length === 9 && values.every(Buffer.isBuffer), 'EVM_LEGACY_TRANSACTION');
  const [nonce, gasPrice, gas] = values.slice(0, 3).map(decodeInteger);
  assert.ok(values[3].length === 0 || values[3].length === 20, 'EVM_WIRE_TARGET');
  const value = decodeInteger(values[4]), v = decodeInteger(values[6]), r = decodeInteger(values[7]), s = decodeInteger(values[8]);
  assert.ok(v >= 37n, 'EVM_REPLAY_PROTECTION_REQUIRED');
  const chainId = (v - 35n) / 2n, parity = Number((v - 35n) % 2n);
  const tx = { chainId: chainId.toString(), nonce: nonce.toString(), gasPrice: gasPrice.toString(), gas: gas.toString(),
    to: values[3].length ? '0x' + values[3].toString('hex') : null, value: value.toString(), data: '0x' + values[5].toString('hex') };
  const unsignedWire = '0x' + encodeRlp(unsignedFields(tx)).toString('hex');
  const from = recoverSender(keccak(Buffer.from(unsignedWire.slice(2), 'hex')), r, s, parity);
  return freeze({ ...tx, from, unsignedWire, nativeId: '0x' + keccak(raw).toString('hex'),
    transactionSHA256: sha(raw), nativeWire: rawHex });
}
export function assertSignedEvmTransaction(rawHex, expected) {
  const signed = decodeCanonicalEvmTransaction(rawHex);
  assert.deepEqual(Object.keys(expected).sort(), ['chainId', 'data', 'from', 'gas', 'gasPrice', 'nonce', 'to', 'value'].sort(),
    'EVM_EXPECTED_TRANSACTION_FIELDS');
  for (const [name, value] of Object.entries(expected)) assert.equal(signed[name], value, 'EVM_SIGNED_' + name.toUpperCase());
  return signed;
}
