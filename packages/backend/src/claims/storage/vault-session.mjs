/** Role-local unlocked encryption for the owned synthetic claim journals.
 * The legacy v1 envelope remains readable by the unchanged password Vault.
 * One independently salted scrypt key lives only in this private session; each
 * write uses a new random GCM IV. No plaintext/observation/file reads are cached.
 * The containing directory/OS remain trusted, as for the legacy Vault. Buffer
 * wiping is best effort, not a promise to erase VM/OpenSSL/GC copies. */
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { open, lstat, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { types } from 'node:util';
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { canonical } from '../../../../engine/src/crypto/privacy.mjs';
const MAX_JSON_BYTES = 1024 * 1024, MAX_FILE_BYTES = 2 * MAX_JSON_BYTES;
const KDF = Object.freeze({ name: 'scrypt', N: 32768, r: 8, p: 1 });
const problem = (code, message) => Object.assign(new Error(message), { code });
function exact(object, expected, label) {
  assert.ok(object && typeof object === 'object' && !types.isProxy(object) && !Array.isArray(object)
    && [Object.prototype, null].includes(Object.getPrototypeOf(object)), 'CLAIM_VAULT_' + label);
  const descriptors = Object.getOwnPropertyDescriptors(object), keys = Reflect.ownKeys(descriptors);
  assert.ok(keys.length === expected.length && keys.every(key => typeof key === 'string' && expected.includes(key)
    && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value')), 'CLAIM_VAULT_' + label + '_FIELDS');
}
function aad(envelope) {
  return Buffer.from(canonical({ context: 'private-omnichain-wallet/encrypted-json', version: envelope.version,
    kdf: envelope.kdf, cipher: { name: envelope.cipher.name, iv: envelope.cipher.iv } }), 'utf8');
}
function ciphertext(envelope, salt) {
  exact(envelope, ['version', 'kdf', 'cipher', 'ciphertext'], 'ENVELOPE');
  exact(envelope.kdf, ['name', 'N', 'r', 'p', 'salt'], 'KDF'); exact(envelope.cipher, ['name', 'iv', 'tag'], 'CIPHER');
  assert.ok(envelope.version === 1 && envelope.kdf.name === KDF.name && envelope.kdf.N === KDF.N
    && envelope.kdf.r === KDF.r && envelope.kdf.p === KDF.p && envelope.cipher.name === 'aes-256-gcm', 'CLAIM_VAULT_PARAMETERS');
  assert.ok(typeof envelope.kdf.salt === 'string' && envelope.kdf.salt.length === 64 && /^[0-9a-f]{64}$/.test(envelope.kdf.salt), 'CLAIM_VAULT_SALT');
  assert.equal(envelope.kdf.salt, salt, 'CLAIM_VAULT_SESSION_SALT_CHANGED');
  assert.ok(typeof envelope.cipher.iv === 'string' && envelope.cipher.iv.length === 24 && /^[0-9a-f]{24}$/.test(envelope.cipher.iv)
    && typeof envelope.cipher.tag === 'string' && envelope.cipher.tag.length === 32 && /^[0-9a-f]{32}$/.test(envelope.cipher.tag), 'CLAIM_VAULT_CIPHER_HEADER');
  const value = envelope.ciphertext;
  assert.ok(typeof value === 'string' && value.length >= 2 && value.length <= Math.ceil(MAX_JSON_BYTES * 4 / 3)
    && /^[A-Za-z0-9_-]+$/.test(value), 'CLAIM_VAULT_CIPHERTEXT');
  const bytes = Buffer.from(value, 'base64url');
  assert.ok(bytes.length <= MAX_JSON_BYTES && bytes.toString('base64url') === value, 'CLAIM_VAULT_CANONICAL_CIPHERTEXT');
  return bytes;
}
async function boundedRead(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw problem('VAULT_UNSAFE_PATH', 'Expected a regular local file');
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw problem('VAULT_SIZE', 'Vault file exceeds size limit');
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1); let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break; offset += bytesRead;
    }
    if (offset > MAX_FILE_BYTES) throw problem('VAULT_SIZE', 'Vault file exceeds size limit');
    return buffer.subarray(0, offset).toString('utf8');
  } finally { await handle.close(); }
}
async function syncDirectory(path) {
  if (process.platform === 'win32') return; // Same explicit platform limit as Vault.
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

/** Fresh-vault factory only. Existing journal adoption/keeper restart is not
 * supported. No caller can select a salt/key/IV or retrieve retained key bytes. */
export function createClaimVaultSession(input) {
  exact(input, ['path', 'password'], 'SESSION_INPUT');
  assert.ok(typeof input.password === 'string' && input.password.isWellFormed()
    && Buffer.byteLength(input.password, 'utf8') >= 1 && Buffer.byteLength(input.password, 'utf8') <= 1024, 'CLAIM_VAULT_PASSWORD');
  const salt = randomBytes(32).toString('hex');
  let key = scryptSync(input.password, Buffer.from(salt, 'hex'), 32, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 });
  const token = Object.freeze(Object.create(null)); let busy = false, closed = false, poisoned = false, writing = false;
  const live = () => assert.ok(!closed && !poisoned && key, 'CLAIM_VAULT_SESSION_CLOSED_OR_UNCERTAIN');
  const wipe = () => { key?.fill(0); key = undefined; };
  function encrypt(value) {
    live(); const plaintext = Buffer.from(canonical(value), 'utf8');
    try {
      const envelope = { version: 1, kdf: { ...KDF, salt },
        cipher: { name: 'aes-256-gcm', iv: randomBytes(12).toString('hex'), tag: '' }, ciphertext: '' };
      const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(envelope.cipher.iv, 'hex'), { authTagLength: 16 });
      cipher.setAAD(aad(envelope)); envelope.ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64url');
      envelope.cipher.tag = cipher.getAuthTag().toString('hex'); return envelope;
    } finally { plaintext.fill(0); }
  }
  function decrypt(envelope) {
    live(); const bytes = ciphertext(envelope, salt); let partial, plaintext;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.cipher.iv, 'hex'), { authTagLength: 16 });
      decipher.setAAD(aad(envelope)); decipher.setAuthTag(Buffer.from(envelope.cipher.tag, 'hex'));
      try { partial = decipher.update(bytes); plaintext = Buffer.concat([partial, decipher.final()]); }
      catch { throw new Error('Encrypted data authentication failed'); }
      const text = plaintext.toString('utf8'), record = JSON.parse(text);
      assert.equal(canonical(record), text, 'CLAIM_VAULT_NONCANONICAL_PLAINTEXT');
      exact(record, ['revision', 'data'], 'RECORD');
      assert.ok(Number.isSafeInteger(record.revision) && record.revision >= 0, 'CLAIM_VAULT_REVISION'); return record;
    } finally { partial?.fill(0); plaintext?.fill(0); }
  }
  // Vault freezes its instance. Session state lives only in this factory's
  // closure; the subclass does not mutate it or create a global key cache.
  class SessionVault extends Vault {
    async read(supplied) {
      live(); assert.equal(supplied, token, 'CLAIM_VAULT_PRIVATE_OPERATION');
      try { return decrypt(JSON.parse(await boundedRead(this.path))); }
      catch (error) { poisoned = true; wipe(); throw error; }
    }
    async _write(record, supplied) {
      live(); assert.equal(supplied, token, 'CLAIM_VAULT_PRIVATE_OPERATION'); writing = true;
      const serialized = JSON.stringify(encrypt(record));
      const temporary = `${this.path}.tmp-${randomBytes(16).toString('hex')}`; let handle, created = false;
      try {
        handle = await open(temporary, 'wx', 0o600); created = true;
        await handle.writeFile(serialized, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
        await rename(temporary, this.path); created = false; await syncDirectory(this.path);
        const readback = await this.read(token); assert.equal(canonical(readback), canonical(record), 'CLAIM_VAULT_WRITE_READBACK');
      } finally { try { await handle?.close(); } finally { if (created) await unlink(temporary); } }
    }
  }
  let vault;
  try { vault = new SessionVault(input.path); } catch (error) { wipe(); throw error; }
  async function run(work) {
    live(); assert.ok(!busy, 'CLAIM_VAULT_SESSION_BUSY'); busy = true; writing = false;
    try { return await work(); }
    catch (error) { if (writing) { poisoned = true; wipe(); } throw error; }
    finally { busy = false; writing = false; }
  }
  const session = Object.create(null);
  Object.defineProperties(session, {
    create: { value: initial => run(() => vault.create(initial, token)) },
    read: { value: () => run(() => vault.read(token)) },
    update: { value: (revision, transform) => run(() => vault.update(token, revision, transform)) },
    close: { value: () => { assert.ok(!busy, 'CLAIM_VAULT_SESSION_BUSY'); closed = true; wipe(); } },
    toJSON: { value: () => { throw new Error('CLAIM_VAULT_SESSION_NOT_SERIALIZABLE'); } },
  });
  return Object.freeze(session);
}
