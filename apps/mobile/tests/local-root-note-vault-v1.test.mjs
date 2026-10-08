/** Host contract only: Expo storage/auth/RNG/AES handles are explicit doubles.
 * Node's real AES-GCM/SHA and original Node PC23/D27 encoders cross-check data.
 * No Android/iOS, Hermes, biometric hardware, funded note or proof is accepted. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { balanceCommitment, balanceDepositFrame, balanceWithdrawFrame }
  from '../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { depositIntentFrame } from '../../../packages/backend/src/execution/account/preparation/deposit-intent.mjs';
import { localBalanceCommitmentMessageV1, localBalanceDepositMessageV1,
  localBalanceWithdrawalMessageV1, localDepositIntentMessageV1 } from '../src/custody/balance-note-codec-v1.mjs';

const ROOT = 'lianum.note.root.encryption.v1', POINTER = 'lianum.note.root.pointer.v1', RECORD = 'lianum.note.root.record.v1';
const store = new Map(), calls = [], entropyBuffers = [], nativeKeys = [];
const control = { supported: true, consent: true, randomOrdinal: 10, writeFailure: null, pausedEncrypt: null, afterWrite: null };
const sha = bytes => createHash('sha256').update(bytes).digest();
const heldKey = new WeakMap();
class Key {
  static async import(bytes) {
    assert.equal(bytes.length, 32); const key = new Key(); const raw = Buffer.from(bytes);
    heldKey.set(key, raw); nativeKeys.push(raw); return key;
  }
}
class Sealed {
  constructor(bytes) { this.bytes = Buffer.from(bytes); }
  static fromCombined(raw, options) {
    assert.deepEqual(options, { ivLength: 12, tagLength: 16 });
    return new Sealed(Buffer.from(raw, 'base64'));
  }
  async combined(encoding) { assert.equal(encoding, 'base64'); return this.bytes.toString('base64'); }
}
mock.module('expo-secure-store', { exports: {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  isAvailableAsync: async () => control.supported,
  canUseBiometricAuthentication: () => control.supported,
  async getItemAsync(name, options) {
    calls.push({ method: 'read', name });
    if (name === ROOT) { assert.equal(options.requireAuthentication, true); assert.equal(options.keychainAccessible, 6); }
    assert.ok([ROOT, POINTER, RECORD].includes(name)); return store.get(name) ?? null;
  },
  async setItemAsync(name, raw, options) {
    calls.push({ method: 'write', name });
    assert.ok([ROOT, POINTER, RECORD].includes(name)); assert.ok(raw.length <= 2048);
    if (name === ROOT) assert.equal(options.requireAuthentication, true);
    if (control.writeFailure?.(name, raw)) throw new Error('SYNTHETIC_STORAGE_FAILURE');
    store.set(name, raw); control.afterWrite?.(name, raw);
  },
} });
mock.module('expo-local-authentication', { exports: {
  hasHardwareAsync: async () => control.supported, isEnrolledAsync: async () => control.supported,
  async authenticateAsync(options) {
    assert.equal(options.disableDeviceFallback, true); assert.equal(options.biometricsSecurityLevel, 'strong');
    return { success: control.consent };
  },
} });
mock.module('expo-crypto', { exports: {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, AESEncryptionKey: Key, AESSealedData: Sealed,
  async getRandomBytesAsync(width) {
    assert.equal(width, 32); const bytes = new Uint8Array(32).fill(++control.randomOrdinal);
    entropyBuffers.push(bytes); return bytes;
  },
  async digest(algorithm, bytes) {
    assert.equal(algorithm, 'SHA-256'); return Uint8Array.from(sha(bytes)).buffer;
  },
  async aesEncryptAsync(clear, key, options) {
    assert.deepEqual(options.nonce, { length: 12 }); assert.equal(options.tagLength, 16);
    if (control.pausedEncrypt) await control.pausedEncrypt();
    // Fixed synthetic IVs only within this host fixture; production Expo uses RNG.
    const nonce = Buffer.alloc(12, ++control.randomOrdinal), cipher = createCipheriv('aes-256-gcm', heldKey.get(key), nonce);
    cipher.setAAD(Buffer.from(options.additionalData));
    const ciphertext = Buffer.concat([cipher.update(clear), cipher.final()]);
    return new Sealed(Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]));
  },
  async aesDecryptAsync(sealed, key, options) {
    assert.equal(options.output, 'bytes');
    const bytes = sealed.bytes, decipher = createDecipheriv('aes-256-gcm', heldKey.get(key), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(options.additionalData)); decipher.setAuthTag(bytes.subarray(-16));
    return new Uint8Array(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]));
  },
} });
mock.module('react-native', { exports: { Platform: { OS: 'android' } } });
const { createLocalRootNoteVaultV1, importLocalRootNoteVaultV1, recoverLocalRootNoteVaultV1,
  openLocalRootNoteVaultV1 } = await import('../src/custody/local-root-note-vault-v1.ts');
const terms = { scope: '11'.repeat(32), policy: '22'.repeat(32), pool: '33'.repeat(20), recipient: '44'.repeat(20), amount: '500' };
function reset() {
  for (const key of nativeKeys) key.fill(0); nativeKeys.length = 0;
  store.clear(); calls.length = 0; entropyBuffers.length = 0;
  Object.assign(control, { supported: true, consent: true, randomOrdinal: 10, writeFailure: null, pausedEncrypt: null, afterWrite: null });
}
function rawClearRecord(rootHex = '0b'.repeat(32)) {
  const e = JSON.parse(store.get(RECORD)), bytes = Buffer.from(e.sealed, 'base64');
  const d = createDecipheriv('aes-256-gcm', Buffer.from(rootHex, 'hex'), bytes.subarray(0, 12));
  d.setAAD(Buffer.from(JSON.stringify(['LIANUM/DEVICE/NOTE-VAULT/1', e.rootId, e.revision])));
  d.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([d.update(bytes.subarray(12, -16)), d.final()]).toString());
}

test('portable balance/D26/D27/W39 bytes equal original encoders across u64 boundary and raw hash limbs', () => {
  const scope = '00'.repeat(32), policy = 'ff'.repeat(32), amount = ((1n << 64n) - 1n).toString();
  const note = { type: 4, rho: '12'.repeat(32), x: '23'.repeat(32), y: '34'.repeat(32), value: amount, secret: '45'.repeat(32) };
  const cm = balanceCommitment(scope, policy, note).toString('hex');
  assert.equal(sha(localBalanceCommitmentMessageV1(scope, policy, note)).toString('hex'), cm);
  assert.deepEqual(Buffer.from(localBalanceDepositMessageV1({ scope, policy, epoch: '0', amount, output: cm })),
    balanceDepositFrame(scope, policy, '0', amount, cm));
  assert.deepEqual(Buffer.from(localBalanceWithdrawalMessageV1({ scope, policy, commitment: cm, recipient: terms.recipient, amount, epoch: '0' })),
    balanceWithdrawFrame(scope, policy, cm, terms.recipient, amount, '0'));
  const d27 = { scope, policy, validFrom: '0', validUntil: amount, amount, output: cm };
  assert.deepEqual(Buffer.from(localDepositIntentMessageV1(d27)), depositIntentFrame(d27));
  for (const bad of ['01', '-1', (1n << 64n).toString(), '500\n'])
    assert.throws(() => localBalanceDepositMessageV1({ scope, policy, epoch: '0', amount: bad, output: cm }));
});
test('root remains protected and separate from HTTP identity; real encrypted note reopens UNISSUED without private exports', async () => {
  reset(); const first = await createLocalRootNoteVaultV1(); const root = store.get(ROOT);
  assert.deepEqual(first, { rootId: first.rootId, note: null });
  const vault = openLocalRootNoteVaultV1(first.rootId);
  assert.equal(await vault.readPreparedNote(), null);
  const prepared = await vault.prepareUnissuedBalanceNote(terms);
  assert.equal(prepared.availableBalance, null); assert.equal(prepared.status, 'UNISSUED'); assert.equal(prepared.nativeEffectsEstablished, false);
  const decrypted = rawClearRecord();
  assert.equal(decrypted.note.commitment, balanceCommitment(terms.scope, terms.policy, decrypted.note.opening).toString('hex'));
  assert.equal(decrypted.note.privateKey.length, 64);
  assert.equal(store.get(RECORD).includes(decrypted.note.privateKey), false);
  assert.equal(store.get(RECORD).includes(decrypted.note.opening.secret), false);
  assert.equal(JSON.stringify(prepared).includes(decrypted.note.privateKey), false);
  assert.deepEqual(Object.keys(vault).sort(), ['close', 'prepareUnissuedBalanceNote', 'readPreparedNote']);
  vault.close(); assert.deepEqual(await openLocalRootNoteVaultV1(first.rootId).readPreparedNote(), prepared);
  await assert.rejects(createLocalRootNoteVaultV1(), /ALREADY_EXISTS/); assert.equal(store.get(ROOT), root);
  assert.ok(entropyBuffers.every(bytes => bytes.every(byte => byte === 0)));
});
test('unavailable/cancelled native protection and missing metadata fail before entropy, rotation or replacing a root', async () => {
  reset(); control.supported = false; await assert.rejects(createLocalRootNoteVaultV1(), /PROTECTED_STORAGE_UNAVAILABLE/);
  assert.equal(entropyBuffers.length, 0); assert.equal(store.size, 0);
  control.supported = true; control.consent = false;
  await assert.rejects(importLocalRootNoteVaultV1('09'.repeat(32)), /AUTHENTICATION_CANCELLED/); assert.equal(store.size, 0);
  control.consent = true; await importLocalRootNoteVaultV1('09'.repeat(32));
  const original = store.get(ROOT); store.delete(POINTER);
  await assert.rejects(createLocalRootNoteVaultV1(), /ALREADY_EXISTS/);
  assert.equal(store.get(ROOT), original);
});
test('AAD/root/revision/ciphertext substitution reject; no object shape or ciphertext grants financial authority', async () => {
  reset(); const f = await createLocalRootNoteVaultV1();
  const p = store.get(POINTER), r = store.get(RECORD);
  for (const field of ['rootId', 'revision']) {
    const e = JSON.parse(r); e[field] = field === 'rootId' ? 'ff'.repeat(32) : 1;
    store.set(RECORD, JSON.stringify(e)); await assert.rejects(openLocalRootNoteVaultV1(f.rootId).readPreparedNote(), /RECOVERY_REQUIRED/);
  }
  const e = JSON.parse(r), cipher = Buffer.from(e.sealed, 'base64'); cipher[13] ^= 1; e.sealed = cipher.toString('base64');
  const raw = JSON.stringify(e); store.set(RECORD, raw);
  store.set(POINTER, JSON.stringify({ ...JSON.parse(p), recordSHA256: sha(Buffer.from(raw)).toString('hex') }));
  await assert.rejects(openLocalRootNoteVaultV1(f.rootId).readPreparedNote());
  store.set(POINTER, p); store.set(RECORD, r); const before = new Map(store);
  await assert.rejects(recoverLocalRootNoteVaultV1('ff'.repeat(32), 0), /RECOVERY_BINDING/);
  assert.deepEqual(store, before);
});
test('explicit same-root recovery completes interrupted empty creation and preserves an uncertain original note', async () => {
  reset(); control.writeFailure = name => name === RECORD;
  await assert.rejects(createLocalRootNoteVaultV1(), /SYNTHETIC_STORAGE_FAILURE/);
  const creating = JSON.parse(store.get(POINTER)), retainedRoot = store.get(ROOT), interrupted = new Map(store);
  assert.equal(creating.state, 'CREATING'); assert.equal(creating.revision, 0);
  assert.equal(creating.recordSHA256, '0'.repeat(64)); assert.equal(store.has(RECORD), false);
  control.writeFailure = null;
  await assert.rejects(recoverLocalRootNoteVaultV1('ff'.repeat(32), 0), /RECOVERY_BINDING/);
  assert.deepEqual(store, interrupted);
  const empty = await recoverLocalRootNoteVaultV1(retainedRoot, 0);
  assert.deepEqual(empty, { rootId: creating.rootId, revision: 0, note: null });
  assert.equal(store.get(ROOT), retainedRoot);
  assert.equal(await openLocalRootNoteVaultV1(empty.rootId).readPreparedNote(), null);
  // A missing ACTIVE record never becomes permission to recreate an empty one.
  store.delete(RECORD); const missingActive = new Map(store);
  await assert.rejects(recoverLocalRootNoteVaultV1(retainedRoot, 0), /RECOVERY_REQUIRED/);
  assert.deepEqual(store, missingActive);
  reset(); const f = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(f.rootId);
  control.writeFailure = (name, raw) => name === POINTER && JSON.parse(raw).revision === 1;
  await assert.rejects(vault.prepareUnissuedBalanceNote(terms), /WRITE_UNCERTAIN/);
  const ciphertext = store.get(RECORD), original = rawClearRecord();
  await assert.rejects(vault.readPreparedNote(), /CLOSED/);
  await assert.rejects(openLocalRootNoteVaultV1(f.rootId).readPreparedNote(), /RECOVERY_REQUIRED/);
  control.writeFailure = null;
  const recovered = await recoverLocalRootNoteVaultV1('0b'.repeat(32), 1);
  assert.equal(recovered.note.commitment, original.note.commitment); assert.equal(store.get(RECORD), ciphertext);
  await assert.rejects(openLocalRootNoteVaultV1(f.rootId).prepareUnissuedBalanceNote(terms), /ORIGINAL_REQUIRED/);
  assert.equal(store.get(RECORD), ciphertext); assert.equal(recovered.note.availableBalance, null);
});
test('close while native encryption awaits prevents persistence and another capability cannot overlap the original operation', async () => {
  reset(); const f = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(f.rootId);
  const before = new Map(store); let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), resume = new Promise(resolve => { release = resolve; });
  control.pausedEncrypt = async () => { enter(); await resume; };
  const pending = vault.prepareUnissuedBalanceNote(terms), settled = pending.then(value => ({ value }), error => ({ error }));
  try {
    const gate = await Promise.race([entered.then(() => true), settled.then(() => false)]); assert.equal(gate, true);
    await assert.rejects(openLocalRootNoteVaultV1(f.rootId).readPreparedNote(), /BUSY/); vault.close();
  } finally { release(); }
  const result = await settled; assert.match(result.error?.message ?? '', /CLOSED/);
  assert.deepEqual(store, before); control.pausedEncrypt = null;
  assert.equal(await openLocalRootNoteVaultV1(f.rootId).readPreparedNote(), null);
});
test.after(() => { for (const key of nativeKeys) key.fill(0); store.clear(); });
