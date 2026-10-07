/**
 * PRIVATE-ENVELOPE-SPEC-004: bounded JWE Compact RSA-OAEP-256 / A256GCM.
 * Local synthetic prototype. Expected context/authentication key arrive through
 * a trusted local binding, not through an implemented remote bootstrap protocol.
 * No graph proof, payment assurance, forward secrecy, anonymous transport, or
 * durable replay protection. JS strings and key objects cannot be zeroized here.
 */
import {
  constants, createCipheriv, createDecipheriv, createHash, createPrivateKey,
  createPublicKey, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes,
} from 'node:crypto';
import { types } from 'node:util';
import { canonical, newIdentity, sign, verify } from './privacy.mjs';

export const ENVELOPE_DOMAIN = 'paeg:private-envelope:simulation:v1';
export const PLAINTEXT_SLOT_BYTES = 4096;
const HEX32 = /^[0-9a-f]{64}$/;
const ASSETS = Object.freeze({
  ethereum: 'ethereum:local:wei', solana: 'solana:local:lamport', bitcoin: 'bitcoin:regtest:satoshi',
});
const INSTRUCTION_FIELDS = ['chain', 'asset', 'amount', 'maxFee', 'recipient', 'expiresAt'];
const BINDING_FIELDS = ['context', 'dispatchToken', 'returnCapability', 'authPublicKey', 'authPrivateKey'];
const MESSAGE_FIELDS = ['version', 'domain', 'context', 'recipientKid', 'dispatchToken',
  'expiresAt', 'chain', 'asset', 'amount', 'maxFee', 'recipient', 'returnCapability'];
const HEADER_FIELDS = ['alg', 'enc', 'kid', 'typ', 'cty'];
const UINT128_MAX = (1n << 128n) - 1n;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function error(code, message = code) { return Object.assign(new Error(message), { code }); }
function exact(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw error('ENVELOPE_INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key) ||
      !descriptors[key].enumerable || !('value' in descriptors[key]))) throw error('ENVELOPE_INPUT');
}
function hex(value) {
  if (typeof value !== 'string' || !HEX32.test(value)) throw error('ENVELOPE_INPUT');
}
function boundedText(value, maximum) {
  if (typeof value !== 'string' || value.length > maximum || !value.isWellFormed() ||
      Buffer.byteLength(value) > maximum || value.length === 0) throw error('ENVELOPE_INPUT');
}
function uint128(value, positive = false) {
  if (typeof value !== 'string' || value.length > 39 || !/^(0|[1-9][0-9]*)$/.test(value) ||
      BigInt(value) > UINT128_MAX || (positive && value === '0')) throw error('ENVELOPE_INPUT');
}
function instruction(value) {
  exact(value, INSTRUCTION_FIELDS);
  if (typeof value.chain !== 'string' || !Object.hasOwn(ASSETS, value.chain) || value.asset !== ASSETS[value.chain]) {
    throw error('ENVELOPE_INPUT');
  }
  uint128(value.amount, true); uint128(value.maxFee);
  boundedText(value.recipient, 4096);
  if (!/^[A-Za-z0-9:._-]+$/.test(value.recipient) || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0) {
    throw error('ENVELOPE_INPUT');
  }
}
function message(value) {
  exact(value, MESSAGE_FIELDS);
  if (value.version !== 1 || value.domain !== ENVELOPE_DOMAIN) throw error('ENVELOPE_INPUT');
  for (const name of ['context', 'recipientKid', 'dispatchToken', 'returnCapability']) hex(value[name]);
  instruction(Object.fromEntries(INSTRUCTION_FIELDS.map((key) => [key, value[key]])));
}
function header(kid) {
  return { alg: 'RSA-OAEP-256', enc: 'A256GCM', kid, typ: 'paeg-leg+jwe', cty: 'application/paeg-leg+json' };
}
function rsaKey(pem, isPrivate = false) {
  // Bound before OpenSSL parsing or asymmetric operations. Only canonical PEMs.
  boundedText(pem, isPrivate ? 8192 : 4096);
  const prefix = isPrivate ? '-----BEGIN PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
  if (!pem.startsWith(prefix)) throw error('ENVELOPE_KEY');
  const key = isPrivate ? createPrivateKey(pem) : createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength !== 2048 ||
      key.asymmetricKeyDetails.publicExponent !== 65537n ||
      key.export({ type: isPrivate ? 'pkcs8' : 'spki', format: 'pem' }) !== pem) throw error('ENVELOPE_KEY');
  return key;
}
function recipientKid(publicKeyObject) {
  return createHash('sha256').update(publicKeyObject.export({ type: 'spki', format: 'der' })).digest('hex');
}
function encodedLength(bytes) { return Math.ceil(bytes * 4 / 3); }
const HEADER_BYTES = Buffer.byteLength(canonical(header('0'.repeat(64))));
export const COMPACT_ENVELOPE_BYTES = encodedLength(HEADER_BYTES) + encodedLength(256) +
  encodedLength(12) + encodedLength(PLAINTEXT_SLOT_BYTES) + encodedLength(16) + 4;

function decodeSegment(value, length) {
  if (typeof value !== 'string' || value.length !== encodedLength(length) || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw error('ENVELOPE_INPUT');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== length || decoded.toString('base64url') !== value) throw error('ENVELOPE_INPUT');
  return decoded;
}
function parseCompact(compact) {
  if (typeof compact !== 'string' || compact.length !== COMPACT_ENVELOPE_BYTES) throw error('ENVELOPE_INPUT');
  const segments = compact.split('.');
  if (segments.length !== 5) throw error('ENVELOPE_INPUT');
  const [protectedSegment, encryptedKey, iv, ciphertext, tag] = segments;
  const headerText = textDecoder.decode(decodeSegment(protectedSegment, HEADER_BYTES));
  const protectedHeader = JSON.parse(headerText);
  exact(protectedHeader, HEADER_FIELDS); hex(protectedHeader.kid);
  if (canonical(header(protectedHeader.kid)) !== headerText) throw error('ENVELOPE_INPUT');
  return {
    protectedHeader, protectedSegment,
    encryptedKey: decodeSegment(encryptedKey, 256), iv: decodeSegment(iv, 12),
    ciphertext: decodeSegment(ciphertext, PLAINTEXT_SLOT_BYTES), tag: decodeSegment(tag, 16),
  };
}

export function newExecutorIdentity() {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048, publicExponent: 65537,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { ...keys, kid: recipientKid(rsaKey(keys.publicKey)) };
}

export function newLegBinding() {
  const identity = newIdentity();
  return {
    context: randomBytes(32).toString('hex'), dispatchToken: randomBytes(32).toString('hex'),
    returnCapability: randomBytes(32).toString('hex'),
    authPublicKey: identity.publicKey, authPrivateKey: identity.privateKey,
  };
}

/** Fresh randomness on every seal; no production RNG injection or nonce API. */
export function sealLeg(input, binding, executorPublicKey) {
  instruction(input); exact(binding, BINDING_FIELDS);
  for (const name of ['context', 'dispatchToken', 'returnCapability']) hex(binding[name]);
  boundedText(binding.authPublicKey, 4096); boundedText(binding.authPrivateKey, 4096);
  const executor = rsaKey(executorPublicKey);
  const kid = recipientKid(executor);
  const payload = {
    version: 1, domain: ENVELOPE_DOMAIN, context: binding.context, recipientKid: kid,
    dispatchToken: binding.dispatchToken, ...input, returnCapability: binding.returnCapability,
  };
  const signature = sign(payload, binding.authPrivateKey);
  if (!verify(payload, signature, binding.authPublicKey)) throw error('ENVELOPE_KEY');
  const json = Buffer.from(canonical({ message: payload, signature }));
  if (json.length > PLAINTEXT_SLOT_BYTES - 4) throw error('ENVELOPE_SLOT_EXCEEDED');
  const plaintext = Buffer.alloc(PLAINTEXT_SLOT_BYTES);
  plaintext.writeUInt32BE(json.length); json.copy(plaintext, 4); json.fill(0);
  const cek = randomBytes(32);
  try {
    const protectedSegment = Buffer.from(canonical(header(kid))).toString('base64url');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', cek, iv, { authTagLength: 16 });
    cipher.setAAD(Buffer.from(protectedSegment, 'ascii'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const encryptedKey = publicEncrypt({ key: executor, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, cek);
    return [protectedSegment, encryptedKey.toString('base64url'), iv.toString('base64url'),
      ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
  } finally { cek.fill(0); plaintext.fill(0); }
}

/** Trusted receiver memory only; restart loses consumed bindings. No eviction. */
export class ReplayGuard {
  #consumed = new Set();
  #maximum;
  constructor({ maxEntries = 1024 } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096) throw error('ENVELOPE_INPUT');
    this.#maximum = maxEntries;
  }
  get size() { return this.#consumed.size; }
  consume(kid, context) {
    hex(kid); hex(context);
    const identity = `${kid}:${context}`;
    if (this.#consumed.has(identity)) throw error('REPLAY_DETECTED');
    if (this.#consumed.size >= this.#maximum) throw error('REPLAY_CAPACITY');
    this.#consumed.add(identity);
  }
}

export function openLeg(compact, options) {
  let cek; let plaintext; let partial; let payload;
  try {
    exact(options, ['executorPrivateKey', 'expectedContext', 'expectedAuthPublicKey', 'replayGuard', 'now']);
    hex(options.expectedContext); boundedText(options.expectedAuthPublicKey, 4096);
    if (!(options.replayGuard instanceof ReplayGuard) || !Number.isSafeInteger(options.now) || options.now < 0) {
      throw error('ENVELOPE_INPUT');
    }
    const parsed = parseCompact(compact);
    const executor = rsaKey(options.executorPrivateKey, true);
    const kid = recipientKid(createPublicKey(executor));
    if (parsed.protectedHeader.kid !== kid) throw error('ENVELOPE_KEY');
    cek = privateDecrypt({ key: executor, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, parsed.encryptedKey);
    if (cek.length !== 32) throw error('ENVELOPE_KEY');
    const decipher = createDecipheriv('aes-256-gcm', cek, parsed.iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(parsed.protectedSegment, 'ascii')); decipher.setAuthTag(parsed.tag);
    partial = decipher.update(parsed.ciphertext);
    plaintext = Buffer.concat([partial, decipher.final()]);
    const jsonLength = plaintext.readUInt32BE(0);
    if (jsonLength < 1 || jsonLength > PLAINTEXT_SLOT_BYTES - 4 ||
        plaintext.subarray(4 + jsonLength).some((byte) => byte !== 0)) throw error('ENVELOPE_INPUT');
    const json = textDecoder.decode(plaintext.subarray(4, 4 + jsonLength));
    const body = JSON.parse(json);
    if (canonical(body) !== json) throw error('ENVELOPE_INPUT');
    exact(body, ['message', 'signature']); message(body.message);
    payload = body.message;
    if (payload.recipientKid !== kid || payload.context !== options.expectedContext || options.now >= payload.expiresAt ||
        !verify(payload, body.signature, options.expectedAuthPublicKey)) throw error('ENVELOPE_INPUT');
  } catch {
    // Stable rejection surface, not a claim of constant-time execution.
    throw error('ENVELOPE_REJECTED', 'Private envelope rejected');
  } finally { cek?.fill(0); partial?.fill(0); plaintext?.fill(0); }
  options.replayGuard.consume(payload.recipientKid, payload.context);
  return payload;
}

export function inspectPublicEnvelope(compact) {
  try {
    const parsed = parseCompact(compact);
    return { header: { ...parsed.protectedHeader }, wireBytes: compact.length, plaintextSlotBytes: PLAINTEXT_SLOT_BYTES };
  } catch { throw error('ENVELOPE_REJECTED', 'Private envelope rejected'); }
}
