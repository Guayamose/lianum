/** Host contract only: Expo storage/auth/RNG/AES handles are explicit doubles.
 * Node's real AES-GCM/SHA and original Node PC23/D27 encoders cross-check data.
 * No Android/iOS, Hermes, biometric hardware, funded note or proof is accepted. */
import test, { mock } from 'node:test';
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { createHash, createCipheriv, createDecipheriv, createPublicKey, verify } from 'node:crypto';
import { balanceCommitment, balanceDepositFrame, balanceWithdrawFrame }
  from '../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { depositIntentFrame } from '../../../packages/backend/src/execution/account/preparation/deposit-intent.mjs';
import { localBalanceCommitmentMessageV1, localBalanceDepositMessageV1,
  localBalanceWithdrawalMessageV1, localDepositIntentMessageV1 } from '../src/custody/balance-note-codec-v1.mjs';

const ROOT = 'lianum.note.root.encryption.v1', POINTER = 'lianum.note.root.pointer.v1', RECORD = 'lianum.note.root.record.v1';
const store = new Map(), calls = [], entropyBuffers = [], nativeKeys = [];
const control = { supported: true, consent: true, randomOrdinal: 10, writeFailure: null, pausedEncrypt: null, pausedAuth: null, pausedWrite: null, afterWrite: null };
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
    assert.ok([ROOT, POINTER, RECORD].includes(name) || /^lianum\.note\.record\.chunk\.v1\.[0-9a-f]{64}\.[0-9]{1,2}$/.test(name)); return store.get(name) ?? null;
  },
  async setItemAsync(name, raw, options) {
    calls.push({ method: 'write', name });
    assert.ok([ROOT, POINTER, RECORD].includes(name) || /^lianum\.note\.record\.chunk\.v1\.[0-9a-f]{64}\.[0-9]{1,2}$/.test(name)); assert.ok(raw.length <= 2048);
    if (name === ROOT) assert.equal(options.requireAuthentication, true);
    if (control.writeFailure?.(name, raw)) throw new Error('SYNTHETIC_STORAGE_FAILURE');
    store.set(name, raw); control.afterWrite?.(name, raw);
    if (control.pausedWrite) await control.pausedWrite(name, raw);
  },
} });
mock.module('expo-local-authentication', { exports: {
  hasHardwareAsync: async () => control.supported, isEnrolledAsync: async () => control.supported,
  async authenticateAsync(options) {
    assert.equal(options.disableDeviceFallback, true); assert.equal(options.biometricsSecurityLevel, 'strong');
    if (control.pausedAuth) await control.pausedAuth();
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
// Metro/TypeScript resolve this extensionless production import. Node's
// host test resolves only this exact edge to the same original TS bytes.
const vaultModuleURL = new URL('../src/custody/local-root-note-vault-v1.ts', import.meta.url).href;
const tsResolution = registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL === vaultModuleURL && ['../api/device-owner-deposit-api-v1', '../api/device-owner-reservation-api-v1'].includes(specifier))
    return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
} });
let originalVault;
try { originalVault = await import(vaultModuleURL); }
finally { tsResolution.deregister(); }
const { createLocalRootNoteOperationV1, createLocalRootNoteVaultV1, importLocalRootNoteVaultV1, recoverLocalRootNoteVaultV1,
  openLocalRootNoteVaultV1, inspectLocalRootNoteVaultV1,
  restoreLocalRootNoteVaultBackupV1 } = originalVault;
const terms = { scope: '11'.repeat(32), policy: '22'.repeat(32), pool: '33'.repeat(20), recipient: '44'.repeat(20), amount: '500' };
function reset() {
  for (const key of nativeKeys) key.fill(0); nativeKeys.length = 0;
  store.clear(); calls.length = 0; entropyBuffers.length = 0;
  Object.assign(control, { supported: true, consent: true, randomOrdinal: 10, writeFailure: null, pausedEncrypt: null, pausedAuth: null, pausedWrite: null, afterWrite: null });
}
function rawClearRecord(rootHex = '0b'.repeat(32)) {
  const stored = JSON.parse(store.get(RECORD)), e = stored.version === 2 ? JSON.parse(Array.from({ length: stored.chunks }, (_, index) => store.get('lianum.note.record.chunk.v1.' + stored.sha256 + '.' + index)).join('')) : stored, bytes = Buffer.from(e.sealed, 'base64');
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
  assert.deepEqual(Object.keys(vault).sort(), ['applyDeviceDepositInclusion', 'bindDeviceAuthorizationRequest', 'bindDeviceProofRequest', 'createDeviceAuthorizationRequest', 'prepareDeviceReservationFromQuote', 'readDeviceReservationIntent', 'close', 'createDeviceProofRequest', 'exportBackup', 'prepareDeviceReservation', 'prepareUnissuedBalanceNote', 'readDeviceNote', 'readPreparedNote', 'reviewPreparedDeposit', 'signDeviceReservation', 'signPreparedDeposit'].sort());
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
test('public inspection reads no root; explicit protected backup restores the same encrypted note on empty local storage', async () => {
  reset(); const created = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(created.rootId);
  const prepared = await vault.prepareUnissuedBalanceNote(terms), originalRecord = store.get(RECORD), originalRoot = store.get(ROOT);
  const start = calls.length, observed = await inspectLocalRootNoteVaultV1();
  assert.equal(observed.status, 'ACTIVE'); assert.equal(observed.revision, 1); assert.equal(observed.availableBalance, null);
  assert.equal(calls.slice(start).some(call => call.name === ROOT), false);
  control.consent = false; const before = new Map(store);
  await assert.rejects(vault.exportBackup(), /AUTHENTICATION_CANCELLED/); assert.deepEqual(store, before);
  control.consent = true;
  const backup = await vault.exportBackup(), exported = JSON.parse(backup); vault.close();
  assert.equal(exported.rootHex, originalRoot); assert.equal(exported.encryptedRecord, originalRecord);
  await assert.rejects(vault.exportBackup(), /CLOSED/);
  store.clear(); const restored = await restoreLocalRootNoteVaultBackupV1(backup);
  assert.deepEqual(restored.note, prepared); assert.equal(store.get(ROOT), originalRoot); assert.equal(store.get(RECORD), originalRecord);
  assert.deepEqual(await openLocalRootNoteVaultV1(created.rootId).readPreparedNote(), prepared);
  assert.equal((await inspectLocalRootNoteVaultV1()).availableBalance, null);
});
test('backup authentication rejects ciphertext tampering and foreign storage; interrupted import retains and resumes exact bytes', async () => {
  reset(); const created = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(created.rootId);
  const backup = await vault.exportBackup(); vault.close(); const original = JSON.parse(backup);
  store.clear();
  const corrupted = structuredClone(original), e = JSON.parse(corrupted.encryptedRecord), bytes = Buffer.from(e.sealed, 'base64');
  bytes[13] ^= 1; e.sealed = bytes.toString('base64'); corrupted.encryptedRecord = JSON.stringify(e);
  corrupted.recordSHA256 = sha(Buffer.from(corrupted.encryptedRecord)).toString('hex');
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(JSON.stringify(corrupted))); assert.equal(store.size, 0);
  await importLocalRootNoteVaultV1('0c'.repeat(32)); const foreign = new Map(store);
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(backup), /BACKUP_CONFLICT/); assert.deepEqual(store, foreign);
  store.clear(); control.writeFailure = name => name === RECORD;
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(backup), /WRITE_UNCERTAIN/);
  assert.equal(JSON.parse(store.get(POINTER)).state, 'CREATING'); assert.equal(store.get(ROOT), original.rootHex);
  control.writeFailure = null;
  const restored = await restoreLocalRootNoteVaultBackupV1(backup);
  assert.equal(restored.rootId, original.rootId); assert.equal(restored.note, null);
  assert.equal(store.get(RECORD), original.encryptedRecord); assert.equal(store.get(ROOT), original.rootHex);
});
test('revoking local create during authentication rejects before entropy or any storage write', async () => {
  reset(); const operation = createLocalRootNoteOperationV1(); let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), resume = new Promise(resolve => { release = resolve; });
  control.pausedAuth = async () => { enter(); await resume; };
  const settled = operation.create().then(value => ({ value }), error => ({ error }));
  try {
    assert.equal(await Promise.race([entered.then(() => true), settled.then(() => false)]), true);
    operation.close();
  } finally { release(); }
  const result = await settled;
  assert.match(result.error?.message ?? '', /MOBILE_LOCAL_NOTE_OPERATION_REVOKED/);
  assert.equal(store.size, 0); assert.equal(entropyBuffers.length, 0);
  assert.equal(calls.some(call => call.method === 'write'), false);
  await assert.rejects(operation.recover('0b'.repeat(32), 0), /OPERATION_REVOKED/);
  control.pausedAuth = null;
});
test('revocation during an original restore write retains its uncertain pointer and resumes only the same backup explicitly', async () => {
  reset(); const first = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(first.rootId);
  const backup = await vault.exportBackup(), original = JSON.parse(backup); vault.close();
  store.clear(); calls.length = 0;
  const operation = createLocalRootNoteOperationV1(); let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), resume = new Promise(resolve => { release = resolve; });
  control.pausedWrite = async name => { if (name === POINTER) { enter(); await resume; } };
  const settled = operation.restore(backup).then(value => ({ value }), error => ({ error }));
  try {
    assert.equal(await Promise.race([entered.then(() => true), settled.then(() => false)]), true);
    assert.equal(JSON.parse(store.get(POINTER)).state, 'CREATING'); operation.close();
  } finally { release(); }
  const result = await settled;
  assert.match(result.error?.message ?? '', /MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN/);
  const retained = new Map(store);
  assert.deepEqual([...store.keys()], [POINTER]);
  assert.deepEqual(calls.filter(call => call.method === 'write').map(call => call.name), [POINTER]);
  const pointer = JSON.parse(store.get(POINTER));
  assert.equal(pointer.rootId, original.rootId); assert.equal(pointer.recordSHA256, original.recordSHA256);
  await assert.rejects(operation.restore(backup), /OPERATION_REVOKED/); assert.deepEqual(store, retained);
  control.pausedWrite = null;
  const fresh = createLocalRootNoteOperationV1();
  try {
    const restored = await fresh.restore(backup);
    assert.equal(restored.rootId, original.rootId); assert.equal(restored.note, null);
    assert.equal(store.get(ROOT), original.rootHex); assert.equal(store.get(RECORD), original.encryptedRecord);
    assert.equal(JSON.parse(store.get(POINTER)).state, 'ACTIVE');
  } finally { fresh.close(); }
});
test.after(() => { for (const key of nativeKeys) key.fill(0); store.clear(); });

function notePublicKey(opening) {
  return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(opening.x, 'hex').toString('base64url'), y: Buffer.from(opening.y, 'hex').toString('base64url') } });
}
test('D26 signs only its original review after durable encrypted intent; reopen reauthorizes exactly the same term', async () => {
  reset(); const f = await createLocalRootNoteVaultV1(), cap = openLocalRootNoteVaultV1(f.rootId);
  const prepared = await cap.prepareUnissuedBalanceNote(terms), review = await cap.reviewPreparedDeposit({ relation: 'D26', epoch: '7' });
  assert.equal(review.rootId, f.rootId); assert.equal(review.revision, 1); assert.deepEqual(review.note, prepared);
  assert.throws(() => cap.signPreparedDeposit({ ...review }), /REVIEW_INVALID/);
  const signed = await cap.signPreparedDeposit(review), clear = rawClearRecord();
  const frame = balanceDepositFrame(terms.scope, terms.policy, '7', '500', prepared.commitment);
  assert.deepEqual(clear.note.depositIntent, { relation: 'D26', epoch: '7', frameSHA256: sha(frame).toString('hex') });
  assert.equal(clear.revision, 2); assert.equal(signed.revision, 2); assert.equal(signed.status, 'UNISSUED');
  assert.equal(signed.availableBalance, null); assert.equal(signed.nativeEffectsEstablished, false);
  assert.equal(verify('sha256', frame, { key: notePublicKey(clear.note.opening), dsaEncoding: 'ieee-p1363' }, Buffer.from(signed.signature, 'hex')), true);
  assert.ok(BigInt('0x' + signed.signature.slice(64)) <= 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n / 2n);
  assert.equal(Object.hasOwn(signed, 'opening') || Object.hasOwn(signed, 'privateKey') || Object.hasOwn(signed, 'publicKey'), false);
  assert.throws(() => cap.signPreparedDeposit(review), /REVIEW_INVALID/);
  cap.close(); const reopened = openLocalRootNoteVaultV1(f.rootId), writes = calls.filter(x => x.method === 'write').length;
  const repeated = await reopened.signPreparedDeposit(await reopened.reviewPreparedDeposit({ relation: 'D26', epoch: '7' }));
  assert.equal(repeated.signature, signed.signature); assert.equal(repeated.revision, 2);
  assert.equal(calls.filter(x => x.method === 'write').length, writes);
  await assert.rejects(reopened.reviewPreparedDeposit({ relation: 'D26', epoch: '8' }), /INTENT_CONFLICT/);
  await assert.rejects(reopened.reviewPreparedDeposit({ relation: 'D27', validFrom: '0', validUntil: '99' }), /INTENT_CONFLICT/);
  assert.equal(rawClearRecord().note.commitment, prepared.commitment);
});
test('D27 uses original absolute-window bytes and lowS key without exposing opening; cancel/cross-capability/expiry refuse signing', async () => {
  reset(); const f = await createLocalRootNoteVaultV1(), cap = openLocalRootNoteVaultV1(f.rootId);
  const prepared = await cap.prepareUnissuedBalanceNote(terms);
  const choice = { relation: 'D27', validFrom: '0', validUntil: '18446744073709551615' };
  let review = await cap.reviewPreparedDeposit(choice);
  const other = openLocalRootNoteVaultV1(f.rootId);
  assert.throws(() => other.signPreparedDeposit(review), /REVIEW_INVALID/); other.close();
  const now = Date.now; Date.now = () => review.expiresAt;
  try { assert.throws(() => cap.signPreparedDeposit(review), /REVIEW_INVALID/); } finally { Date.now = now; }
  review = await cap.reviewPreparedDeposit(choice); control.consent = false;
  await assert.rejects(cap.signPreparedDeposit(review), /AUTHENTICATION_CANCELLED/);
  assert.equal(rawClearRecord().note.depositIntent, undefined);
  assert.throws(() => cap.signPreparedDeposit(review), /REVIEW_INVALID/);
  control.consent = true; review = await cap.reviewPreparedDeposit(choice);
  const signed = await cap.signPreparedDeposit(review), clear = rawClearRecord();
  const statement = { scope: terms.scope, policy: terms.policy, validFrom: choice.validFrom,
    validUntil: choice.validUntil, amount: terms.amount, output: prepared.commitment };
  assert.deepEqual(signed.statement, statement);
  const frame = depositIntentFrame(statement); assert.equal(frame.length, 176);
  assert.equal(verify('sha256', frame, { key: notePublicKey(clear.note.opening), dsaEncoding: 'ieee-p1363' }, Buffer.from(signed.signature, 'hex')), true);
  assert.deepEqual(clear.note.depositIntent, { ...choice, frameSHA256: sha(frame).toString('hex') });
  assert.equal(await cap.readPreparedNote().then(x => x.status), 'UNISSUED');
});
test('closing before intent set prevents writes; closing after original set preserves uncertain intent without any signature', async () => {
  reset(); let f = await createLocalRootNoteVaultV1(), cap = openLocalRootNoteVaultV1(f.rootId);
  await cap.prepareUnissuedBalanceNote(terms); let review = await cap.reviewPreparedDeposit({ relation: 'D26', epoch: '7' });
  const original = new Map(store); let resume, entered;
  const held = new Promise(resolve => { resume = resolve; }), barrier = new Promise(resolve => { entered = resolve; });
  control.pausedEncrypt = async () => { entered(); await held; };
  const pending = cap.signPreparedDeposit(review), settled = pending.then(() => { throw new Error('PREMATURE_SIGNING_SUCCESS'); }, error => { throw error; });
  // Attach the rejection handler now, before the barrier can finish prematurely.
  const observed = settled.then(value => ({ value }), error => ({ error }));
  try {
    await Promise.race([barrier, observed.then(() => { throw new Error('PREMATURE_SIGNING_TERMINATION'); })]);
    cap.close();
  } finally { resume(); control.pausedEncrypt = null; }
  await assert.rejects(pending, /CLOSED/); await observed; assert.deepEqual(store, original);
  reset(); f = await createLocalRootNoteVaultV1(); cap = openLocalRootNoteVaultV1(f.rootId);
  const prepared = await cap.prepareUnissuedBalanceNote(terms), root = store.get(ROOT);
  review = await cap.reviewPreparedDeposit({ relation: 'D26', epoch: '7' });
  control.afterWrite = name => { if (name === RECORD) cap.close(); };
  await assert.rejects(cap.signPreparedDeposit(review), /WRITE_UNCERTAIN/); control.afterWrite = null;
  assert.equal(JSON.parse(store.get(POINTER)).revision, 1); assert.equal(JSON.parse(store.get(RECORD)).revision, 2);
  assert.equal(rawClearRecord().note.depositIntent.relation, 'D26');
  const recovered = await recoverLocalRootNoteVaultV1(root, 2); assert.equal(recovered.note.commitment, prepared.commitment);
  const reopened = openLocalRootNoteVaultV1(f.rootId);
  await assert.rejects(reopened.reviewPreparedDeposit({ relation: 'D26', epoch: '8' }), /INTENT_CONFLICT/);
  assert.equal((await reopened.readPreparedNote()).status, 'UNISSUED');
});


test('specific D26 opening lease keeps root/privateKey local, rejects copies and erases on close', async () => {
  reset(); const created = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(created.rootId);
  await vault.prepareUnissuedBalanceNote(terms);
  const review = await vault.reviewPreparedDeposit({ relation: 'D26', epoch: '10' });
  const signed = await vault.signPreparedDeposit(review);
  assert.throws(() => vault.createDeviceProofRequest({ ...signed }), /SIGNATURE_REQUIRED/);
  const request = await vault.createDeviceProofRequest(signed);
  const clear = rawClearRecord();
  assert.equal(request.rootId, created.rootId); assert.equal(request.commitment, clear.note.commitment);
  assert.equal('witness' in request, false); assert.equal('privateKey' in request, false); assert.equal('rootHex' in request, false);
  const witness = { scope: Array.from({ length: 8 }, (_, i) => parseInt(terms.scope.slice(i * 8, i * 8 + 8), 16)),
    policy: Array.from({ length: 8 }, (_, i) => parseInt(terms.policy.slice(i * 8, i * 8 + 8), 16)),
    epoch: '10', amount: '500', output: Array.from({ length: 8 }, (_, i) => parseInt(clear.note.commitment.slice(i * 8, i * 8 + 8), 16)),
    rho: [...Buffer.from(clear.note.opening.rho, 'hex')], key_x: [...Buffer.from(clear.note.opening.x, 'hex')],
    key_y: [...Buffer.from(clear.note.opening.y, 'hex')], secret: [...Buffer.from(clear.note.opening.secret, 'hex')],
    signature: [...Buffer.from(signed.signature, 'hex')] };
  assert.equal(request.witnessSHA256, sha(Buffer.from(JSON.stringify(witness))).toString('hex'));
  request.close(); vault.close();
  assert.throws(() => vault.createDeviceProofRequest(signed), /CLOSED/);
  assert.equal((await openLocalRootNoteVaultV1(created.rootId).readDeviceNote()).availableBalance, null);
});
test('copied HTTP inclusion cannot credit an encrypted local note or replace its opening', async () => {
  reset(); const created = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(created.rootId);
  await vault.prepareUnissuedBalanceNote(terms); const before = new Map(store);
  assert.throws(() => vault.applyDeviceDepositInclusion({ commitment: 'a'.repeat(64), amount: '500', status: 'CONFIRMED' }), /RESPONSE_INVALID/);
  assert.deepEqual(store, before);
  assert.equal((await vault.readDeviceNote()).availableBalance, null);
  assert.equal((await vault.readPreparedNote()).status, 'UNISSUED');
});

// These backup fixtures authenticate synthetic encrypted custody only. A local
// FUNDED string cannot issue the original HTTP inclusion brand or spend permit.
async function completePrivateCustodyBackup() {
  reset(); const rootHex = '09'.repeat(32), created = await importLocalRootNoteVaultV1(rootHex);
  const vault = openLocalRootNoteVaultV1(created.rootId); await vault.prepareUnissuedBalanceNote(terms);
  const value = rawClearRecord(rootHex), note = value.note;
  const { compileFundedGraph, ownerAuthorizationMessage } = await import('../../../packages/engine/src/execution/graph/funded-graph.mjs');
  const { devicePublicKey, privateKeyFromHex } = await import('../src/custody/signing.mjs');
  const noteKey = index => {
    const privateKey = index.toString(16).padStart(64, '0'), key = privateKeyFromHex(privateKey), pub = devicePublicKey(key); key.fill(0);
    return { privateKey, opening: { type: 4, rho: (index + 10).toString(16).padStart(64, '0'),
      x: pub.slice(2, 66), y: pub.slice(66), value: index === 2 ? '380' : '120', secret: (index + 20).toString(16).padStart(64, '0') } };
  };
  const change = noteKey(2), recovery = noteKey(3);
  const proposal = { scope: note.scope, policy: note.policy, asset: '55'.repeat(32), operationId: '66'.repeat(32),
    budget: '120', fundingNotBefore: '0', fundingValidUntil: '600', settleBefore: '900',
    nodes: [{ id: 'one', dependsOn: [], chainDomain: '77'.repeat(32), evidencePolicy: '88'.repeat(32), actionCommitment: '99'.repeat(32),
      payout: { x: recovery.opening.x, y: recovery.opening.y, value: '120', secret: 'aa'.repeat(32), randomness: 'bb'.repeat(32) } }] };
  const random = { reservationNonce: 'cc'.repeat(32), reserveSecret: 'dd'.repeat(32), graphNonce: 'ee'.repeat(32),
    paddingSalts: ['01', '02', '03', '04'].map(byte => byte.repeat(32)) };
  const compiled = compileFundedGraph({ ...proposal, ...random, inputNote: note.opening, changeNote: change.opening, recoveryNote: recovery.opening });
  note.status = 'FUNDED';
  note.depositIntent = { relation: 'D26', epoch: '7', frameSHA256: sha(balanceDepositFrame(note.scope, note.policy, '7', note.opening.value, note.commitment)).toString('hex') };
  note.deviceJob = { jobId: '33'.repeat(32), origin: 'https://localhost:1234', pairingId: '44'.repeat(32), noteRevision: 2,
    assetIdentity: proposal.asset, domainCommitment: '12'.repeat(32) };
  note.funding = { transactionHash: '13'.repeat(32), assetId: '14'.repeat(32) };
  value.revision = 4;
  value.spend = { version: 1, phase: 'PREPARED', proposal, ...random, change, recovery, statement: compiled.authorizationStatement,
    frameSHA256: sha(ownerAuthorizationMessage(compiled.authorizationStatement)).toString('hex'), signature: null };
  const key = await Key.import(Buffer.from(rootHex, 'hex'));
  const sealed = await (await import('expo-crypto')).aesEncryptAsync(Buffer.from(JSON.stringify(value)), key,
    { nonce: { length: 12 }, tagLength: 16, additionalData: Buffer.from(JSON.stringify(['LIANUM/DEVICE/NOTE-VAULT/1', created.rootId, 4])) });
  const envelope = { version: 1, rootId: created.rootId, revision: 4, sealed: await sealed.combined('base64') };
  const raw = JSON.stringify(envelope), backup = JSON.stringify({ version: 1, profile: 'LIANUM_DEVICE_LOCAL_NOTE_BACKUP_V1', rootHex,
    rootId: created.rootId, revision: 4, recordSHA256: sha(Buffer.from(raw)).toString('hex'), encryptedRecord: raw });
  vault.close(); store.clear(); calls.length = 0;
  return { created, backup, raw, value, proposal };
}
test('complete change/recovery custody is AEAD authenticated over bounded immutable chunks; no syntheticFUNDED or copy enables signing', async () => {
  const fixture = await completePrivateCustodyBackup();
  assert.ok(fixture.raw.length > 2048);
  await restoreLocalRootNoteVaultBackupV1(fixture.backup);
  const manifest = JSON.parse(store.get(RECORD)); assert.equal(manifest.version, 2); assert.ok(manifest.chunks > 1);
  for (const [name, raw] of store) { assert.ok(raw.length <= 2048); if (name.startsWith('lianum.note.record.chunk.')) {
    assert.equal(raw.includes(fixture.value.spend.change.privateKey), false);
    assert.equal(raw.includes(fixture.value.spend.recovery.opening.secret), false);
  } }
  assert.deepEqual(rawClearRecord('09'.repeat(32)), fixture.value);
  const opened = openLocalRootNoteVaultV1(fixture.created.rootId);
  assert.equal((await opened.readDeviceNote()).availableBalance, null);
  await assert.rejects(opened.prepareDeviceReservation(fixture.proposal), /FRESH_FUNDED_SOURCE_REQUIRED/);
  assert.throws(() => opened.signDeviceReservation({ rootId: fixture.created.rootId, expiresAt: Date.now() + 15000 }), /REVIEW_REQUIRED/);
  assert.equal(await opened.exportBackup(), fixture.backup); opened.close();
  const pointerIndex = calls.findLastIndex(row => row.method === 'write' && row.name === POINTER);
  const chunkLast = calls.findLastIndex(row => row.method === 'write' && row.name.startsWith('lianum.note.record.chunk.'));
  assert.ok(chunkLast >= 0 && pointerIndex > chunkLast);
});
test('missing ciphertext chunk restores only from the exact authenticated backup; changed existing chunk is never replaced', async () => {
  const fixture = await completePrivateCustodyBackup(); await restoreLocalRootNoteVaultBackupV1(fixture.backup);
  const manifest = JSON.parse(store.get(RECORD)), key = 'lianum.note.record.chunk.v1.' + manifest.sha256 + '.1';
  const originalChunk = store.get(key), root = store.get(ROOT), pointer = store.get(POINTER);
  store.delete(key);
  await assert.rejects(openLocalRootNoteVaultV1(fixture.created.rootId).readDeviceNote(), /RECOVERY_REQUIRED/);
  await restoreLocalRootNoteVaultBackupV1(fixture.backup);
  assert.equal(store.get(key), originalChunk); assert.equal(store.get(ROOT), root); assert.equal(store.get(POINTER), pointer);
  store.set(key, originalChunk.replace(/./, byte => byte === 'A' ? 'B' : 'A'));
  const corrupt = new Map(store);
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(fixture.backup), /STORAGE_CHANGED|BACKUP_CONFLICT/);
  assert.deepEqual(store, corrupt);
});

test('copied U request, quote or signature never releases openings or rewrites an original encrypted intent', async () => {
  reset(); const created = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(created.rootId);
  await vault.prepareUnissuedBalanceNote(terms); const before = new Map(store);
  assert.throws(() => vault.prepareDeviceReservationFromQuote({ quoteId: '1'.repeat(64) }), /RESPONSE_INVALID/);
  assert.throws(() => vault.createDeviceAuthorizationRequest({ rootId: created.rootId, signature: '1'.repeat(128) }, {}), /SIGNATURE_REQUIRED/);
  assert.throws(() => vault.bindDeviceAuthorizationRequest({ rootId: created.rootId, expiresAt: Date.now() + 15000 }, {}), /AUTHORIZATION_REQUEST_REQUIRED/);
  assert.equal(await vault.readDeviceReservationIntent(), null); assert.deepEqual(store, before);
  vault.close(); assert.throws(() => vault.bindDeviceAuthorizationRequest({}, {}), /CLOSED/);
});
