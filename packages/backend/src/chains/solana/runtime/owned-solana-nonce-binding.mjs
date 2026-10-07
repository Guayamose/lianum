/** Bounded claim-only durable nonce wire codecs. These checks establish exact
 * legacy message bytes and Ed25519 signatures, never RPC provenance, current
 * nonce state, rent exemption, successful execution or native finality.
 */
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { types } from 'node:util';
import { BINDING_LIMITS, MEMO_PROGRAM, validateSolanaBindingTransaction }
  from '../../shared/dispatch/native-receipt-binding.mjs';

const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const FIELDS = ['sourcePublicKey', 'recipientPublicKey', 'nonceAccountPublicKey',
  'durableNonce', 'lamports', 'wireKeyCommitment'];
const BOOTSTRAP_FIELDS = ['payerPublicKey', 'nonceAccountPublicKey', 'authorityPublicKey',
  'recentBlockhash', 'rentLamports'];
function exact(value, fields) {
  assert.ok(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, 'NONCE_BINDING_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...fields].sort(), 'NONCE_BINDING_FIELDS');
  for (const name of fields) {
    const property = Object.getOwnPropertyDescriptor(value, name);
    assert.ok(property && Object.hasOwn(property, 'value') && property.enumerable, 'NONCE_BINDING_DATA_FIELD');
  }
}
function hex(value, length = 32, nonzero = true) {
  assert.ok(typeof value === 'string' && value.length === length * 2
    && new RegExp(`^[0-9a-f]{${length * 2}}$`).test(value) && (!nonzero || /[1-9a-f]/.test(value)), 'NONCE_BINDING_HEX');
  return Buffer.from(value, 'hex');
}
function amount(value, positive = true, maximum = BigInt(BINDING_LIMITS.solanaLamports)) {
  assert.ok(typeof value === 'string' && value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value), 'NONCE_BINDING_AMOUNT');
  const result = BigInt(value);
  assert.ok(result.toString() === value && result <= maximum && (!positive || result > 0n), 'NONCE_BINDING_AMOUNT');
  return result;
}
function little(value, width) {
  return Buffer.from(value.toString(16).padStart(width * 2, '0'), 'hex').reverse();
}
function base58(value) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = 0n;
  for (const letter of value) { const digit = alphabet.indexOf(letter); assert.ok(digit >= 0); number = number * 58n + BigInt(digit); }
  const body = number === 0n ? Buffer.alloc(0) : Buffer.from(number.toString(16).padStart(Math.ceil(number.toString(16).length / 2) * 2, '0'), 'hex');
  const bytes = Buffer.concat([Buffer.alloc(value.match(/^1*/)[0].length), body]);
  assert.equal(bytes.length, 32); return bytes;
}
const SYSTEM = Buffer.alloc(32), MEMO = base58(MEMO_PROGRAM.address);
const RECENT_BLOCKHASHES = base58('SysvarRecentB1ockHashes11111111111111111111');
const RENT = base58('SysvarRent111111111111111111111111111111111');
function distinct(keys) {
  assert.equal(new Set(keys.map(key => key.toString('hex'))).size, keys.length, 'NONCE_BINDING_DISTINCT_KEYS');
}
function intent(input) {
  exact(input, FIELDS);
  const source = hex(input.sourcePublicKey), recipient = hex(input.recipientPublicKey), nonce = hex(input.nonceAccountPublicKey);
  hex(input.durableNonce); hex(input.wireKeyCommitment); amount(input.lamports);
  distinct([source, recipient, nonce, SYSTEM, RECENT_BLOCKHASHES, MEMO]);
  return { source, recipient, nonce };
}
function base64(value, length) {
  assert.ok(typeof value === 'string' && value.length === Math.ceil(length / 3) * 4
    && /^[A-Za-z0-9+/]+={0,2}$/.test(value), 'NONCE_BINDING_BASE64');
  const bytes = Buffer.from(value, 'base64');
  assert.equal(bytes.length, length, 'NONCE_BINDING_TRANSACTION_LENGTH');
  assert.equal(bytes.toString('base64'), value, 'NONCE_BINDING_BASE64'); return bytes;
}
function signature(message, publicKey, raw) {
  const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, hex(publicKey)]), type: 'spki', format: 'der' });
  assert.ok(verify(null, message, key, raw), 'NONCE_BINDING_SIGNATURE');
}

/** One signer is simultaneously fee payer, transfer source and nonce authority.
 * AdvanceNonceAccount is first, the sole payment second, signer Memo last.
 */
export function encodeSolanaNonceBindingMessage(input) {
  const { source, recipient, nonce } = intent(input);
  return Buffer.concat([Buffer.from([1, 0, 3, 6]), source, recipient, nonce, SYSTEM, RECENT_BLOCKHASHES, MEMO,
    hex(input.durableNonce), Buffer.from([3, 3, 3, 2, 4, 0, 4]), little(4n, 4),
    Buffer.from([3, 2, 0, 1, 12]), little(2n, 4), little(amount(input.lamports), 8),
    Buffer.from([5, 1, 0, 70]), Buffer.from('LNRB2:' + input.wireKeyCommitment, 'ascii')]).toString('hex');
}
export function validateSolanaNonceBindingMessage(messageHex, expected) {
  intent(expected); const message = hex(messageHex, 330, false);
  assert.equal(messageHex, encodeSolanaNonceBindingMessage(expected), 'NONCE_BINDING_CANONICAL_MESSAGE');
  return Object.freeze({ ...expected, messageSHA256: sha(message), effectIndex: '1',
    wireBindingVersion: '2', wireBindingKind: '2', wireBindingPosition: '2' });
}
export function validateSolanaNonceBindingTransaction(transactionBase64, expected) {
  const wire = base64(transactionBase64, 395);
  assert.equal(wire[0], 1, 'NONCE_BINDING_SIGNATURE_COUNT');
  const message = wire.subarray(65), decoded = validateSolanaNonceBindingMessage(message.toString('hex'), expected);
  signature(message, decoded.sourcePublicKey, wire.subarray(1, 65));
  return Object.freeze({ ...decoded, signatureHex: wire.subarray(1, 65).toString('hex'), transactionSHA256: sha(wire),
    assurance: 'exact-wire-and-ed25519-only-no-nonce-state-finality-or-authorization' });
}
/** Fixed claim boundary: exactly existing v1 or the bounded durable nonce v2.
 * A field selects a strict parser, never an extensible profile or callback.
 */
export function validateClaimSolanaBindingTransaction(transactionBase64, expected) {
  assert.ok(expected && !types.isProxy(expected) && Object.getPrototypeOf(expected) === Object.prototype, 'NONCE_BINDING_RECORD');
  return Object.hasOwn(expected, 'nonceAccountPublicKey')
    ? validateSolanaNonceBindingTransaction(transactionBase64, expected)
    : validateSolanaBindingTransaction(transactionBase64, expected);
}

/** Decode only the exact Current/Initialized 80-byte System nonce state.
 * Account owner, executable flag, rent and observation provenance are separate
 * mandatory runtime checks and cannot be established by these bytes.
 */
export function decodeSolanaNonceAccountData(dataHex) {
  const bytes = hex(dataHex, 80, false);
  assert.equal(bytes.readUInt32LE(0), 1, 'NONCE_ACCOUNT_CURRENT_VERSION');
  assert.equal(bytes.readUInt32LE(4), 1, 'NONCE_ACCOUNT_INITIALIZED');
  const authorityPublicKey = bytes.subarray(8, 40).toString('hex'), durableNonce = bytes.subarray(40, 72).toString('hex');
  hex(authorityPublicKey); hex(durableNonce);
  return Object.freeze({ authorityPublicKey, durableNonce, lamportsPerSignature: bytes.readBigUInt64LE(72).toString() });
}

function bootstrapIntent(input) {
  exact(input, BOOTSTRAP_FIELDS);
  const payer = hex(input.payerPublicKey), nonce = hex(input.nonceAccountPublicKey), authority = hex(input.authorityPublicKey);
  hex(input.recentBlockhash); amount(input.rentLamports);
  distinct([payer, nonce, SYSTEM, RECENT_BLOCKHASHES, RENT]);
  return { payer, nonce, authority };
}
/** Fixed two-signature create+initialize message. Its independent payer and
 * backing exclusion are authenticated by the runtime, not by this codec.
 */
export function encodeSolanaNonceBootstrapMessage(input) {
  const { payer, nonce, authority } = bootstrapIntent(input);
  return Buffer.concat([Buffer.from([2, 0, 3, 5]), payer, nonce, SYSTEM, RECENT_BLOCKHASHES, RENT,
    hex(input.recentBlockhash), Buffer.from([2, 2, 2, 0, 1, 52]), little(0n, 4),
    little(amount(input.rentLamports), 8), little(80n, 8), SYSTEM,
    Buffer.from([2, 3, 1, 3, 4, 36]), little(6n, 4), authority]).toString('hex');
}
export function validateSolanaNonceBootstrapMessage(messageHex, expected) {
  bootstrapIntent(expected); const message = hex(messageHex, 296, false);
  assert.equal(messageHex, encodeSolanaNonceBootstrapMessage(expected), 'NONCE_BOOTSTRAP_CANONICAL_MESSAGE');
  return Object.freeze({ ...expected, messageSHA256: sha(message) });
}
export function validateSolanaNonceBootstrapTransaction(transactionBase64, expected) {
  const wire = base64(transactionBase64, 425);
  assert.equal(wire[0], 2, 'NONCE_BOOTSTRAP_SIGNATURE_COUNT');
  const message = wire.subarray(129), decoded = validateSolanaNonceBootstrapMessage(message.toString('hex'), expected);
  signature(message, decoded.payerPublicKey, wire.subarray(1, 65));
  signature(message, decoded.nonceAccountPublicKey, wire.subarray(65, 129));
  return Object.freeze({ ...decoded, signatureHex: wire.subarray(1, 65).toString('hex'), transactionSHA256: sha(wire) });
}
