/**
 * Local cryptographic building blocks using Node's maintained OpenSSL bindings.
 * These are not ZK proofs, a shielded pool, anonymous transport, or a consensus
 * verifier. Callers must generate independent random 32-byte commitment blindings;
 * their entropy cannot be established by validating their representation.
 * JS strings/GC prevent reliable zeroization; passwords here are synthetic only.
 */
import {
  createHash, createHmac, randomBytes, generateKeyPairSync, createPrivateKey,
  createPublicKey, sign as cryptoSign, verify as cryptoVerify, scryptSync, scrypt,
  createCipheriv, createDecipheriv,
} from 'node:crypto';
import { types } from 'node:util';

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_NODES = 100_000;
const MAX_DEPTH = 64;
const KDF = Object.freeze({ name: 'scrypt', N: 32768, r: 8, p: 1 });
const HEX_32 = /^[0-9a-f]{64}$/;

function validString(value, label, maximum = MAX_JSON_BYTES, minimum = 0) {
  if (typeof value !== 'string' || !value.isWellFormed() ||
      Buffer.byteLength(value, 'utf8') < minimum || Buffer.byteLength(value, 'utf8') > maximum) {
    throw new TypeError(`Invalid ${label}`);
  }
  return value;
}

function hex32(value, label) {
  if (typeof value !== 'string' || !HEX_32.test(value)) throw new TypeError(`Invalid ${label}: expected 32-byte lowercase hex`);
  return value;
}

/** Restricted canonical JSON. Rejects coercion, getters, sparse arrays and cycles. */
export function canonical(value) {
  const ancestors = new Set();
  let nodes = 0;
  let bytes = 0;
  const account = (text) => {
    bytes += Buffer.byteLength(text, 'utf8');
    if (bytes > MAX_JSON_BYTES) throw new RangeError('Canonical JSON exceeds byte limit');
    return text;
  };
  const visit = (item, depth) => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new RangeError('Canonical JSON exceeds complexity limit');
    if (item === null) return account('null');
    if (typeof item === 'boolean') return account(String(item));
    if (typeof item === 'string') return account(JSON.stringify(validString(item, 'JSON string')));
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item) || Object.is(item, -0)) throw new TypeError('Only safe integer numbers are supported');
      return account(String(item));
    }
    if (typeof item !== 'object' || types.isProxy(item)) throw new TypeError('Unsupported JSON value');
    if (ancestors.has(item)) throw new TypeError('Cyclic JSON value');
    ancestors.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key !== 'string')) throw new TypeError('Symbol keys are unsupported');
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype || item.length > MAX_NODES || keys.length !== item.length + 1) {
          throw new TypeError('Only dense ordinary arrays are supported');
        }
        account('[]');
        const parts = [];
        for (let i = 0; i < item.length; i++) {
          const descriptor = descriptors[String(i)];
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new TypeError('Invalid array element');
          if (i) account(',');
          parts.push(visit(descriptor.value, depth + 1));
        }
        return `[${parts.join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Only plain objects are supported');
      account('{}');
      const parts = [];
      for (const key of keys.sort()) {
        validString(key, 'JSON key');
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || !('value' in descriptor)) throw new TypeError('Only enumerable data properties are supported');
        if (parts.length) account(',');
        account(`${JSON.stringify(key)}:`);
        parts.push(`${JSON.stringify(key)}:${visit(descriptor.value, depth + 1)}`);
      }
      return `{${parts.join(',')}}`;
    } finally {
      ancestors.delete(item);
    }
  };
  return visit(value, 0);
}

export function digest(domain, value) {
  validString(domain, 'digest domain', 256, 1);
  return createHash('sha256').update(canonical(['private-omnichain-wallet/digest', 1, domain, value]), 'utf8').digest('hex');
}

export function commit(value, blindingHex) {
  hex32(blindingHex, 'commitment blinding');
  return digest('commitment/v1', { blinding: blindingHex, value });
}

/** Scope to a stable state namespace; changing graph IDs must not reset spending. */
export function nullifier(secretHex, domain, noteId) {
  hex32(secretHex, 'nullifier secret');
  validString(domain, 'state namespace', 256, 1);
  validString(noteId, 'note ID', 256, 1);
  return createHmac('sha256', Buffer.from(secretHex, 'hex'))
    .update(canonical(['private-omnichain-wallet/nullifier', 1, domain, noteId]), 'utf8').digest('hex');
}

export function newIdentity() {
  return generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function signatureMessage(value) {
  return Buffer.from(canonical(['private-omnichain-wallet/signature', 1, value]), 'utf8');
}

export function sign(value, privateKey) {
  validString(privateKey, 'private key', 4096, 1);
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new TypeError('Ed25519 private key required');
  return cryptoSign(null, signatureMessage(value), key).toString('hex');
}

export function verify(value, signature, publicKey) {
  try {
    if (typeof signature !== 'string' || !/^[0-9a-f]{128}$/.test(signature)) return false;
    validString(publicKey, 'public key', 4096, 1);
    // createPublicKey also accepts private PEMs; explicitly disallow that API shortcut.
    if (!publicKey.startsWith('-----BEGIN PUBLIC KEY-----')) return false;
    const key = createPublicKey(publicKey);
    return key.asymmetricKeyType === 'ed25519' && cryptoVerify(null, signatureMessage(value), key, Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

function passwordKey(password, salt) {
  validString(password, 'password', 1024, 1);
  return scryptSync(password, Buffer.from(salt, 'hex'), 32, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 });
}

// Leave capacity in Node's shared worker pool for filesystem work. Existing
// envelopes and KDF strength stay identical; only scheduling changes.
let deriving = 0;
const derivationWaiters = [];
async function passwordKeyAsync(password, salt) {
  validString(password, 'password', 1024, 1);
  if (deriving >= 2) await new Promise(resolve => derivationWaiters.push(resolve));
  else deriving++;
  try {
    return await new Promise((resolve, reject) => scrypt(password, Buffer.from(salt, 'hex'), 32,
      { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key)));
  } finally {
    const next = derivationWaiters.shift();
    if (next) next(); else deriving--;
  }
}

function exactKeys(object, expected, label) {
  if (!object || typeof object !== 'object' || types.isProxy(object) || Array.isArray(object) ||
      (Object.getPrototypeOf(object) !== Object.prototype && Object.getPrototypeOf(object) !== null)) throw new TypeError(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(object);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key) ||
      !descriptors[key].enumerable || !('value' in descriptors[key]))) throw new TypeError(`Invalid ${label} fields`);
}

function associatedData(envelope) {
  return Buffer.from(canonical({
    context: 'private-omnichain-wallet/encrypted-json',
    version: envelope.version,
    kdf: envelope.kdf,
    cipher: { name: envelope.cipher.name, iv: envelope.cipher.iv },
  }), 'utf8');
}

function validateEnvelope(envelope) {
  exactKeys(envelope, ['version', 'kdf', 'cipher', 'ciphertext'], 'envelope');
  exactKeys(envelope.kdf, ['name', 'N', 'r', 'p', 'salt'], 'KDF');
  exactKeys(envelope.cipher, ['name', 'iv', 'tag'], 'cipher');
  if (envelope.version !== 1 || envelope.kdf.name !== KDF.name || envelope.kdf.N !== KDF.N ||
      envelope.kdf.r !== KDF.r || envelope.kdf.p !== KDF.p || envelope.cipher.name !== 'aes-256-gcm') {
    throw new TypeError('Unsupported encryption envelope parameters');
  }
  hex32(envelope.kdf.salt, 'KDF salt');
  if (typeof envelope.cipher.iv !== 'string' || !/^[0-9a-f]{24}$/.test(envelope.cipher.iv) ||
      typeof envelope.cipher.tag !== 'string' || !/^[0-9a-f]{32}$/.test(envelope.cipher.tag)) throw new TypeError('Invalid GCM IV or tag');
  const ciphertext = envelope.ciphertext;
  if (typeof ciphertext !== 'string' || ciphertext.length < 2 || ciphertext.length > Math.ceil(MAX_JSON_BYTES * 4 / 3) ||
      !/^[A-Za-z0-9_-]+$/.test(ciphertext)) throw new TypeError('Invalid ciphertext');
  const bytes = Buffer.from(ciphertext, 'base64url');
  if (bytes.length > MAX_JSON_BYTES || bytes.toString('base64url') !== ciphertext) throw new TypeError('Noncanonical ciphertext');
  return bytes;
}

function newEnvelope() {
  return {
    version: 1,
    kdf: { ...KDF, salt: randomBytes(32).toString('hex') },
    cipher: { name: 'aes-256-gcm', iv: randomBytes(12).toString('hex'), tag: '' },
    ciphertext: '',
  };
}
function encryptWithKey(plaintext, envelope, key) {
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(envelope.cipher.iv, 'hex'), { authTagLength: 16 });
  cipher.setAAD(associatedData(envelope));
  envelope.ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64url');
  envelope.cipher.tag = cipher.getAuthTag().toString('hex');
  return envelope;
}
export function encryptJson(value, password) {
  const plaintext = Buffer.from(canonical(value), 'utf8');
  const envelope = newEnvelope();
  let key;
  try {
    key = passwordKey(password, envelope.kdf.salt);
    return encryptWithKey(plaintext, envelope, key);
  } finally {
    key?.fill(0);
    plaintext.fill(0);
  }
}

export async function encryptJsonAsync(value, password) {
  // Snapshot caller-owned data before yielding to the worker pool.
  const plaintext = Buffer.from(canonical(value), 'utf8');
  const envelope = newEnvelope();
  let key;
  try {
    key = await passwordKeyAsync(password, envelope.kdf.salt);
    return encryptWithKey(plaintext, envelope, key);
  } finally {
    key?.fill(0);
    plaintext.fill(0);
  }
}

function decryptWithKey(envelope, ciphertext, key) {
  let partial;
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.cipher.iv, 'hex'), { authTagLength: 16 });
    decipher.setAAD(associatedData(envelope));
    decipher.setAuthTag(Buffer.from(envelope.cipher.tag, 'hex'));
    try {
      partial = decipher.update(ciphertext);
      plaintext = Buffer.concat([partial, decipher.final()]);
    } catch {
      throw new Error('Encrypted data authentication failed');
    }
    const text = plaintext.toString('utf8');
    const value = JSON.parse(text);
    if (canonical(value) !== text) throw new TypeError('Decrypted payload is not canonical JSON');
    return value;
  } finally {
    partial?.fill(0);
    plaintext?.fill(0);
  }
}

export function decryptJson(envelope, password) {
  const ciphertext = validateEnvelope(envelope);
  let key;
  try {
    key = passwordKey(password, envelope.kdf.salt);
    return decryptWithKey(envelope, ciphertext, key);
  } finally { key?.fill(0); }
}

export async function decryptJsonAsync(envelope, password) {
  validateEnvelope(envelope);
  // A caller cannot change the authenticated header during derivation.
  const snapshot = { version: envelope.version, kdf: { ...envelope.kdf }, cipher: { ...envelope.cipher }, ciphertext: envelope.ciphertext };
  const ciphertext = validateEnvelope(snapshot);
  let key;
  try {
    key = await passwordKeyAsync(password, snapshot.kdf.salt);
    return decryptWithKey(snapshot, ciphertext, key);
  } finally { key?.fill(0); }
}
