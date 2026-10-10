/** Host contract only: Expo storage/auth/RNG/AES handles are explicit doubles.
 * Node's real AES-GCM/SHA and original Node PC23/D27 encoders cross-check data.
 * No Android/iOS, Hermes, biometric hardware, funded note or proof is accepted. */
import test, { mock, after } from 'node:test';
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
const control = { supported: true, consent: true, randomOrdinal: 10, writeFailure: null, pausedEncrypt: null, pausedAuth: null, pausedWrite: null, afterWrite: null, fetch: null };
const sha = bytes => createHash('sha256').update(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).digest();
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
    assert.ok(width===32||width===12);const bytes = new Uint8Array(width).fill(++control.randomOrdinal);
    entropyBuffers.push(bytes); return bytes;
  },
  async digest(algorithm, bytes) {
    assert.equal(algorithm, 'SHA-256'); return Uint8Array.from(sha(bytes)).buffer;
  },
  async aesEncryptAsync(clear, key, options) {
    if(options.nonce.bytes)assert.equal(options.nonce.bytes.length,12);else assert.deepEqual(options.nonce,{length:12});assert.equal(options.tagLength,16);
    if (control.pausedEncrypt) await control.pausedEncrypt();
    // Fixed synthetic IVs only within this host fixture; production Expo uses RNG.
    const nonce = options.nonce.bytes?Buffer.from(options.nonce.bytes):Buffer.alloc(12,++control.randomOrdinal), cipher = createCipheriv('aes-256-gcm', heldKey.get(key), nonce);
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
const expoFetchURL = new URL('../node_modules/expo/fetch.js', import.meta.url).href;
const expoFetchResolution = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'expo/fetch' && context.parentURL?.startsWith(new URL('../src/api/', import.meta.url).href))
    return nextResolve(expoFetchURL, context);
  return nextResolve(specifier, context);
} });
after(() => expoFetchResolution.deregister());
mock.module(expoFetchURL, { exports: { fetch: (...args) => {
  assert.equal(typeof control.fetch, 'function', 'HOST_EXPO_FETCH_NOT_INSTALLED'); return control.fetch(...args);
} } });
// Metro/TypeScript resolve this extensionless production import. Node's
// host test resolves only this exact edge to the same original TS bytes.
const vaultModuleURL = new URL('../src/custody/local-root-note-vault-v1.ts', import.meta.url).href;
const tsResolution = registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL === vaultModuleURL && ['../api/device-owner-deposit-api-v1', '../api/device-owner-reservation-api-v1', '../api/device-owner-exit-api-v1', '../api/device-owner-execution-api-v1', '../api/device-owner-output-balance-api-v1'].includes(specifier))
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
const BACKUP_PASSWORD = 'original native root recovery phrase';
async function clearLegacyExport(vault) {
  const sealed = await vault.exportBackup(BACKUP_PASSWORD);
  const { unsealDeviceCustodyBackupV1 } = await import('../src/custody/sealed-custody-backup-v1.mjs');
  const header = JSON.parse(sealed), clear = await unsealDeviceCustodyBackupV1(sealed, BACKUP_PASSWORD, header.binding);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(clear); } finally { clear.fill(0); }
}

function reset() {
  for (const key of nativeKeys) key.fill(0); nativeKeys.length = 0;
  store.clear(); calls.length = 0; entropyBuffers.length = 0;
  Object.assign(control, { supported: true, consent: true, randomOrdinal: 10, writeFailure: null, pausedEncrypt: null, pausedAuth: null, pausedWrite: null, afterWrite: null, fetch: null });
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
  assert.deepEqual(Object.keys(vault).sort(), ['prepareDeviceRootClaimExitV3','sealDeviceRootClaimExitV3','latchDeviceRootClaimExitV3','createDeviceRootClaimRequestV2', 'sealDeviceRootClaimRequestV2', 'deviceRootClaimIngressWitnessHashV2', 'sealDeviceRootClaimIngressV2', 'latchDeviceRootClaimEffectV2', 'applyDeviceRootClaimObservationV2', 'readDeviceRootClaimCustodyV2', 'readDeviceOutputBalanceSubject', 'applyDeviceOutputBalances', 'forgetDeviceOutputBalanceObservation', 'retainDeviceExecutionIntent', 'readDeviceExecutionIntent', 'applyDeviceExecutionObservation', 'applyDeviceExecutionTerminal', 'readDeviceExitSubject', 'createDeviceExitProofRequest', 'bindDeviceExitProofRequest', 'readDeviceExitIntent', 'applyDeviceExitConfirmation', 'applyDeviceReservationInclusion', 'applyDeviceDepositInclusion', 'bindDeviceAuthorizationRequest', 'bindDeviceProofRequest', 'createDeviceAuthorizationRequest', 'prepareDeviceReservationFromQuote', 'readDeviceReservationIntent', 'close', 'createDeviceProofRequest', 'exportBackup', 'prepareDeviceReservation', 'prepareUnissuedBalanceNote', 'readDeviceNote', 'readPreparedNote', 'reviewPreparedDeposit', 'signDeviceReservation', 'signPreparedDeposit'].sort());
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
  await assert.rejects(vault.exportBackup(BACKUP_PASSWORD), /AUTHENTICATION_CANCELLED/); assert.deepEqual(store, before);
  control.consent = true;
  const backup = await clearLegacyExport(vault), exported = JSON.parse(backup); vault.close();
  assert.equal(exported.rootHex, originalRoot); assert.equal(exported.encryptedRecord, originalRecord);
  await assert.rejects(vault.exportBackup(BACKUP_PASSWORD), /CLOSED/);
  store.clear(); const restored = await restoreLocalRootNoteVaultBackupV1(backup);
  assert.deepEqual(restored.note, prepared); assert.equal(store.get(ROOT), originalRoot); assert.equal(store.get(RECORD), originalRecord);
  assert.deepEqual(await openLocalRootNoteVaultV1(created.rootId).readPreparedNote(), prepared);
  assert.equal((await inspectLocalRootNoteVaultV1()).availableBalance, null);
});
test('backup authentication rejects ciphertext tampering and foreign storage; interrupted import retains and resumes exact bytes', async () => {
  reset(); const created = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(created.rootId);
  const backup = await clearLegacyExport(vault); vault.close(); const original = JSON.parse(backup);
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
  const backup = await clearLegacyExport(vault), original = JSON.parse(backup); vault.close();
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
  assert.throws(() => vault.applyDeviceReservationInclusion({ jobId: 'b'.repeat(64), stage: 'RESERVED', observation: {} }), /RESPONSE_INVALID/);
  assert.throws(() => vault.createDeviceExitProofRequest({ statement: { amount: '400' }, noteRole: 'change' }), /RESPONSE_INVALID/);
  assert.throws(() => vault.bindDeviceExitProofRequest({}, {}), /ORIGINAL_EXIT_REQUEST_REQUIRED/);
  assert.throws(() => vault.applyDeviceExitConfirmation({ stage: 'CONFIRMED', observation: { amount: '400' } }), /RESPONSE_INVALID/);
  assert.throws(() => vault.retainDeviceExecutionIntent({ action: 'EXECUTE_NATIVE', reservation: {} }), /RESPONSE_INVALID/);
  assert.throws(() => vault.applyDeviceExecutionTerminal({ stage: 'FULFILLED', terminal: {} }), /RESPONSE_INVALID/);
  assert.throws(() => vault.applyDeviceOutputBalances({ change: { amount: '400', state: 'UNSPENT' } }), /RESPONSE_INVALID/);
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
  assert.equal(await clearLegacyExport(opened), fixture.backup); opened.close();
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

// HOST HTTP framing is deliberately synthetic. The actual mobile API issues
// its own inclusion/quote handles; neither this fixture nor AES claims a chain
// confirmation, original backend authority, hardware or economic acceptance.
async function originalOutputCustodyCase(t, emptyChange = false) {
  const {createPrivateWalletStateV1}=await import('../src/state/private-wallet-state-v1.mjs'),global=createPrivateWalletStateV1();
  const realNow = Date.now; t.after(() => { Date.now = realNow; });
  const fixture = await completePrivateCustodyBackup(), rootHex = '09'.repeat(32), value = fixture.value;
  delete value.spend;
  async function writeClear(clear, corruptTag = false) {
    const key = await Key.import(Buffer.from(rootHex, 'hex'));
    const sealed = await (await import('expo-crypto')).aesEncryptAsync(Buffer.from(JSON.stringify(clear)), key,
      { nonce: { length: 12 }, tagLength: 16, additionalData: Buffer.from(JSON.stringify(['LIANUM/DEVICE/NOTE-VAULT/1', clear.rootId, clear.revision])) });
    if (corruptTag) sealed.bytes[sealed.bytes.length - 1] ^= 1;
    const e = { version: 1, rootId: clear.rootId, revision: clear.revision, sealed: await sealed.combined('base64') }, raw = JSON.stringify(e);
    return { raw, backup: JSON.stringify({ version: 1, profile: 'LIANUM_DEVICE_LOCAL_NOTE_BACKUP_V1', rootHex,
      rootId: clear.rootId, revision: clear.revision, recordSHA256: sha(Buffer.from(raw)).toString('hex'), encryptedRecord: raw }) };
  }
  await restoreLocalRootNoteVaultBackupV1((await writeClear(value)).backup);
  const { deviceReservationFixtureV1 } = await import('./helpers/device-reservation-fixture-v1.mjs');
  const { originalAccountFramesV2 } = await import('./helpers/original-account-frames-v2.mjs');
  const { devicePublicKey, signDeviceMessage } = await import('../src/custody/signing.mjs');
  const { compileFundedGraph, payoutInvoiceMessage } = await import('../../../packages/engine/src/execution/graph/funded-graph.mjs');
  const { localFundedSpendNullifierV1 } = await import('../src/custody/funded-balance-owner-codec-v1.mjs');
  const { PrivateNoteTree } = await import('../../../packages/engine/src/notes/private-note-tree.mjs');
  const { normalizeDeviceDepositConsentV1, deviceDepositConsentMessageV1 } = await import('../../../packages/mobile-protocol/src/device-deposit-consent-v1.mjs');
  const { originalAccountAccessMessageV2 } = await import('@lianum/mobile-protocol/original-account-v2');
  const { createDeviceOwnerDepositApiV1 } = await import('../src/api/device-owner-deposit-api-v1.ts');
  const { createDeviceOwnerReservationApiV1 } = await import('../src/api/device-owner-reservation-api-v1.ts');
  const { createDeviceOwnerOutputBalanceApiV1 } = await import('../src/api/device-owner-output-balance-api-v1.ts');
  const { normalizeDeviceReservationConsentV1, deviceReservationConsentMessageV1 } = await import('../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs');
  const deviceKey = new Uint8Array(32).fill(11), note = value.note, publicKey = devicePublicKey(deviceKey), framing = deviceReservationFixtureV1(deviceKey);
  const descriptor = { origin: note.deviceJob.origin, pairingId: note.deviceJob.pairingId, devicePublicKey: publicKey };
  const frames = originalAccountFramesV2({ devicePublicKey: publicKey });
  Object.assign(frames.access, descriptor); Object.assign(frames.review.binding.asset, { pool: note.pool });
  frames.review.binding.assetId = note.funding.assetId;
  const proposal = { ...framing.proposal, scope: note.scope, policy: note.policy, asset: note.deviceJob.assetIdentity };
  if (emptyChange) {
    proposal.budget = note.opening.value;
    proposal.nodes = structuredClone(proposal.nodes);
    proposal.nodes[0].payout.value = proposal.budget;
  }
  const changeAmount = String(BigInt(note.opening.value) - BigInt(proposal.budget));
  const compiled = compileFundedGraph({ ...framing.witness.input, ...proposal, inputNote: note.opening,
    changeNote: emptyChange ? { type: 4, rho: '0'.repeat(64), x: '0'.repeat(64), y: '0'.repeat(64), value: '0', secret: '0'.repeat(64) } : framing.witness.input.changeNote,
    recoveryNote: { ...framing.witness.input.recoveryNote, value: proposal.budget } });
  const invoice = signDeviceMessage(Buffer.from('4'.padStart(64, '0'), 'hex'), payoutInvoiceMessage(compiled.authorizationStatement, compiled.ownerWitness.graph.nodes[0], 0));
  const poolTerms = { scope: note.scope, policy: note.policy, codeHash: '15'.repeat(32), assetIdentity: proposal.asset, domainCommitment: note.deviceJob.domainCommitment };
  const tree = new PrivateNoteTree([Buffer.from(note.commitment, 'hex')]), path = tree.path(0), now = Date.now();
  const statement = { scope: note.scope, policy: note.policy, epoch: note.depositIntent.epoch, amount: note.opening.value, output: note.commitment };
  let consent = normalizeDeviceDepositConsentV1({ version: 1, profile: 'LIANUM_DEVICE_ORIGINAL_D26_V1', action: 'OBSERVE_D26', ...descriptor,
    challengeId: '16'.repeat(32), nonce: '17'.repeat(32), expiresAt: now + 15000, binding: frames.review.binding, poolTerms,
    jobId: note.deviceJob.jobId, rootId: value.rootId, noteRevision: note.deviceJob.noteRevision, statement,
    witnessSHA256: '18'.repeat(32), proofSHA256: '19'.repeat(32), publicInputsSHA256: '20'.repeat(32),
    observed: { blockNumber: '1', blockHash: '21'.repeat(32), timestamp: '1' }, openingDisclosure: null });
  const observation = { version: 1, profile: 'ORIGINAL_DEVICE_D26_INCLUSION_V1', jobId: consent.jobId, rootId: value.rootId,
    commitment: note.commitment, amount: note.opening.value, assetId: note.funding.assetId, pool: note.pool, scope: note.scope, policy: note.policy,
    genesis: consent.binding.asset.genesis, domainCommitment: poolTerms.domainCommitment, proofSHA256: consent.proofSHA256,
    publicInputsSHA256: consent.publicInputsSHA256, transactionHash: note.funding.transactionHash, calldataSHA256: '22'.repeat(32),
    receiptBlockHash: '21'.repeat(32), head: { number: '1', hash: '21'.repeat(32), timestamp: '1' },
    path: { root: path.root.slice(2), index: path.index, leaf: path.leaf.slice(2), siblings: path.siblings.map(x => x.slice(2)) },
    nullifier: localFundedSpendNullifierV1(note.scope, note.commitment, note.opening.secret), observedAt: now, expiresAt: now + 15000,
    nativeEffectsEstablished: true, mobileKeyCustody: true, backendOpeningDisclosure: 'ONE_D26_OPENING', mobileCanonicalRpcVerification: false };
  const quote = { version: 1, profile: 'LIANUM_DEVICE_ORIGINAL_US_QUOTE_V1', ...descriptor, quoteId: '23'.repeat(32),
    depositJobId: consent.jobId, rootId: value.rootId, sourceCommitment: note.commitment, sourceNullifier: observation.nullifier,
    poolTerms, proposal, capsuleOptions: framing.capsuleOptions, invoiceSignatures: [invoice], observed: consent.observed, expiresAt: now + 15000 };
  const httpPaths = [];
  control.fetch = async (target, options) => {
    httpPaths.push(new URL(target).pathname);
    assert.equal(new URL(target).origin, descriptor.origin); const input = JSON.parse(options.body); let body;
    if (target.endsWith('/challenges')) body = { challenge: frames.access };
    else if (target.endsWith('/device-deposit/observation-reviews')) body = consent;
    else if (target.endsWith('/device-deposit/observations')) body = { jobId: consent.jobId, stage: 'CONFIRMED',
      consentFields: {}, statement, observation, errorCode: null, authorizationSHA256: sha(deviceDepositConsentMessageV1(consent)).toString('hex') };
    else { assert.ok(target.endsWith('/device-reservation/preparation-reviews')); body = { quote,
      authorizationSHA256: sha(originalAccountAccessMessageV2(input.access)).toString('hex') }; }
    const response = new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: target }); return response;
  };
  const deposit = await createDeviceOwnerDepositApiV1(descriptor), reservation = await createDeviceOwnerReservationApiV1(descriptor);
  const access = await deposit.access(), selected = await deposit.challenge('OBSERVE_D26', { access,
    signature: signDeviceMessage(deviceKey, originalAccountAccessMessageV2(access)), jobId: consent.jobId });
  const included = await deposit.submit({ consent: selected, signature: signDeviceMessage(deviceKey, deviceDepositConsentMessageV1(selected)) });
  const vault = openLocalRootNoteVaultV1(value.rootId);
  const restoredSource=await vault.readDeviceNote();await global.acceptNative(restoredSource);
  assert.equal(global.snapshot().rows[0].route.component,'DEVICE_NATIVE_SOURCE');
  assert.equal(global.snapshot().rows[0].state,'UNKNOWN');
  assert.equal(global.snapshot().rows[0].available,null,'restored FUNDED is not a current unspent NF observation');
  await assert.rejects(global.acceptNative({...restoredSource}),/OUTPUT_DISPLAY_REQUIRED/);
  await vault.applyDeviceDepositInclusion(included.observation);
  await global.acceptNative(await vault.readDeviceNote());
  assert.equal(global.snapshot().rows[0].available,'500');
  assert.equal(global.snapshot().rows[0].route.genesis,observation.genesis);
  // Simulate provider/quote setup crossing the monetary read's fixed 15s.
  // The quote is fresh; only the earlier D26 observation has expired.
  const freshAt = now + 15000; Date.now = () => freshAt;
  assert.equal(global.snapshot().rows[0].state,'STALE');assert.equal(global.snapshot().rows[0].available,null);
  Object.assign(frames.access, { challengeId: '32'.repeat(32), nonce: '33'.repeat(32), expiresAt: freshAt + 60000 });
  quote.expiresAt = freshAt + 15000;
  const quoteAccess = await reservation.access(), handle = await reservation.preparation({ access: quoteAccess,
    signature: signDeviceMessage(deviceKey, originalAccountAccessMessageV2(quoteAccess)), rootId: value.rootId, depositJobId: consent.jobId });
  const originalStore = new Map(store), writes = calls.filter(row => row.method === 'write').length;
  await assert.rejects(vault.prepareDeviceReservationFromQuote(handle), /MOBILE_DEVICE_DEPOSIT_RESPONSE_INVALID/);
  assert.deepEqual(store, originalStore); assert.equal(calls.filter(row => row.method === 'write').length, writes);
  consent = normalizeDeviceDepositConsentV1({ ...consent, challengeId: '34'.repeat(32), nonce: '35'.repeat(32), expiresAt: freshAt + 15000 });
  Object.assign(observation, { observedAt: freshAt, expiresAt: freshAt + 15000 });
  Object.assign(frames.access, { challengeId: '36'.repeat(32), nonce: '37'.repeat(32) });
  const postsBefore = httpPaths.length, freshAccess = await deposit.access(), freshConsent = await deposit.challenge('OBSERVE_D26', { access: freshAccess,
    signature: signDeviceMessage(deviceKey, originalAccountAccessMessageV2(freshAccess)), jobId: consent.jobId });
  const freshInclusion = await deposit.submit({ consent: freshConsent, signature: signDeviceMessage(deviceKey, deviceDepositConsentMessageV1(freshConsent)) });
  const refreshed = await vault.applyDeviceDepositInclusion(freshInclusion.observation);
  await global.acceptNative(await vault.readDeviceNote());
  assert.equal(global.snapshot().rows[0].available,'500');
  assert.equal(refreshed.availableBalance, '500'); assert.deepEqual(store, originalStore);
  assert.equal(calls.filter(row => row.method === 'write').length, writes, 'fresh same funding only refreshes the ephemeral handle');
  assert.deepEqual(httpPaths.slice(postsBefore), ['/v2/mobile/original-account/challenges',
    '/v1/mobile/device-deposit/observation-reviews', '/v1/mobile/device-deposit/observations']);
  assert.equal(rawClearRecord(rootHex).note.funding.transactionHash, observation.transactionHash);
  // A client-branded response for a different funding cannot exploit the
  // no-write refresh branch, even with otherwise coherent public framing.
  const originalTransactionHash = observation.transactionHash; observation.transactionHash = '38'.repeat(32);
  consent = normalizeDeviceDepositConsentV1({ ...consent, challengeId: '39'.repeat(32), nonce: '40'.repeat(32) });
  Object.assign(frames.access, { challengeId: '41'.repeat(32), nonce: '42'.repeat(32) });
  const changedAccess = await deposit.access(), changedConsent = await deposit.challenge('OBSERVE_D26', { access: changedAccess,
    signature: signDeviceMessage(deviceKey, originalAccountAccessMessageV2(changedAccess)), jobId: consent.jobId });
  const changedInclusion = await deposit.submit({ consent: changedConsent, signature: signDeviceMessage(deviceKey, deviceDepositConsentMessageV1(changedConsent)) });
  await assert.rejects(vault.applyDeviceDepositInclusion(changedInclusion.observation), /MOBILE_LOCAL_ORIGINAL_INCLUSION_CHANGED/);
  assert.deepEqual(store, originalStore); assert.equal(calls.filter(row => row.method === 'write').length, writes);
  observation.transactionHash = originalTransactionHash;
  const before = rawClearRecord(rootHex), prepared = await vault.prepareDeviceReservationFromQuote(handle), stored = rawClearRecord(rootHex);
  assert.equal(stored.revision, before.revision + 1); assert.deepEqual(stored.note, before.note);
  assert.equal(stored.spend.phase, 'PREPARED'); assert.equal(stored.spend.signature, null);
  assert.equal(stored.spend.change.opening.value, changeAmount); assert.equal(stored.spend.recovery.opening.value, proposal.budget);
  assert.deepEqual(stored.spend.preparation.capsuleOptions, framing.capsuleOptions); assert.deepEqual(stored.spend.preparation.invoiceSignatures, [invoice]);
  assert.equal(prepared.sourceCommitment, note.commitment); assert.equal(prepared.sourceNullifier, observation.nullifier);
  assert.ok(calls.filter(row => row.method === 'write').every(row => store.get(row.name).length <= 2048));
  const signed = await vault.signDeviceReservation(prepared), request = await vault.createDeviceAuthorizationRequest(signed, handle);
  const fields = { depositJobId: request.depositJobId, quoteId: request.quoteId, jobId: request.jobId, custody: request.custody,
    statement: request.statement, witnessSHA256: request.witnessSHA256, proofSHA256: '25'.repeat(32), publicInputsSHA256: '26'.repeat(32) };
  const sConsent = normalizeDeviceReservationConsentV1({ ...framing.consent, ...descriptor, ...fields, action: 'OBSERVE_S',
    poolTerms, binding: frames.review.binding, challengeId: '27'.repeat(32), nonce: '28'.repeat(32), observed: consent.observed,
    expiresAt: Date.now() + 15000, openingDisclosure: null });
  const outputTree = new PrivateNoteTree([Buffer.from(request.statement.changeCommitment, 'hex'), Buffer.from(request.statement.reserveCommitment, 'hex')]);
  const asPath = (tree, index) => { const p = tree.path(index); return { root: p.root.slice(2), index: p.index,
    leaf: p.leaf.slice(2), siblings: p.siblings.map(x => x.slice(2)) }; };
  const sStatus = { jobId: request.jobId, stage: 'RESERVED', consentFields: fields, statement: request.statement,
    observation: { profile: 'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1', transactionHash: '29'.repeat(32), blockHash: '21'.repeat(32), blockNumber: '1', timestamp: '1',
      sourceCommitment: request.statement.inputCommitment, sourceNullifier: request.statement.inputNullifier, changeCommitment: request.statement.changeCommitment,
      reserveCommitment: request.statement.reserveCommitment, domainCommitment: poolTerms.domainCommitment, envelope: '30'.repeat(32), admissionTag: '31'.repeat(32),
      currentHead: consent.observed, changePath: asPath(outputTree, 0), reservePath: asPath(outputTree, 1) }, errorCode: null,
    authorizationSHA256: sha(deviceReservationConsentMessageV1(sConsent)).toString('hex') };
  const preparationFetch = control.fetch; let balanceBody = null;
  control.fetch = async (target, options) => {
    if (!target.endsWith('/device-reservation/observations') && !target.endsWith('/device-execution/output-balances')) return preparationFetch(target, options);
    const input = JSON.parse(options.body);
    if (target.endsWith('/device-execution/output-balances')) assert.deepEqual(Object.keys(input).sort(),
      ['access', 'signature', 'parentJobId', 'rootId', 'noteRevision', 'changeNullifier', 'recoveryNullifier'].sort());
    const body = target.endsWith('/device-reservation/observations') ? sStatus
      : { ...balanceBody, authorizationSHA256: sha(originalAccountAccessMessageV2(input.access)).toString('hex') };
    const response = new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: target }); return response;
  };
  const retainedS = await reservation.submit({ consent: sConsent, signature: signDeviceMessage(deviceKey, deviceReservationConsentMessageV1(sConsent)) });
  await vault.applyDeviceReservationInclusion(retainedS); request.close();
  await global.acceptNative(await vault.readDeviceNote());
  assert.equal(global.snapshot().rows.length,1);assert.equal(global.snapshot().rows[0].available,null);
  assert.equal(global.snapshot().rows[0].noteAmount,null,'the retained source is not counted again after S');
  const balances = await createDeviceOwnerOutputBalanceApiV1(descriptor), subject = await vault.readDeviceOutputBalanceSubject();
  const local = rawClearRecord(rootHex), spend = local.spend;
  balanceBody = { version: 1, profile: 'LIANUM_DEVICE_ORIGINAL_OUTPUT_BALANCE_V1', ...descriptor, ...subject,
    nativeBindingSHA256: '32'.repeat(32), reservationTransactionHash: sStatus.observation.transactionHash,
    assetId: note.funding.assetId, pool: note.pool, poolTerms, sourceNullifier: request.statement.inputNullifier,
    sourceNullifierSpent: true, nativeOutcome: 'FULFILLED',
    change: { noteRole: 'change', commitment: spend.statement.changeCommitment, nullifier: subject.changeNullifier,
      amount: spend.change.opening.value, state: 'UNSPENT', path: asPath(outputTree, 0) },
    recovery: { noteRole: 'recovery', commitment: spend.statement.recoveryCommitment, nullifier: subject.recoveryNullifier,
      amount: spend.recovery.opening.value, state: 'LOCKED', path: null }, observed: consent.observed, expiresAt: Date.now() + 10000 };
  delete balanceBody.changeNullifier; delete balanceBody.recoveryNullifier;
  async function readBalance() { const access = await balances.access(); return balances.observe({ ...subject, access,
    signature: signDeviceMessage(deviceKey, originalAccountAccessMessageV2(access)) }); }
  const beforeRead = new Map(store), balance = await readBalance();
  assert.throws(() => vault.applyDeviceOutputBalances({ ...balance }), /RESPONSE_INVALID/);
  await vault.applyDeviceOutputBalances(balance); assert.deepEqual(store, beforeRead, 'READ creates no encrypted/economic job or write');
  const fresh = await vault.readDeviceNote(); assert.equal(fresh.availableBalance, null);
  assert.equal(fresh.localReservation.changeAvailableBalance, changeAmount); assert.equal(fresh.localReservation.recoveryAvailableBalance, null);
  assert.equal(fresh.localReservation.recovery.state, 'LOCKED'); assert.equal(fresh.localReservation.assetIdentity, proposal.asset);
  await assert.rejects(global.acceptNative({...fresh}),/OUTPUT_DISPLAY_REQUIRED/);
  await assert.rejects(global.acceptNative(balance),/OUTPUT_DISPLAY_REQUIRED/);
  await global.acceptNative(fresh);
  assert.equal(global.snapshot().rows.length,2);
  assert.equal(global.snapshot().rows.find(row=>row.route.noteRole==='change').available,changeAmount);
  assert.equal(global.snapshot().rows.find(row=>row.route.noteRole==='recovery').available,null);
  assert.equal(global.snapshot().rows.find(row=>row.route.noteRole==='recovery').locked,proposal.budget);
  assert.equal(global.snapshot().aggregateBalance,null);
  assert.equal(global.snapshot().rows[0].route.nativeBindingSHA256,balanceBody.nativeBindingSHA256);
  assert.equal(new Set(global.snapshot().rows.map(row=>row.key)).size,2);
  if (emptyChange) {
    assert.equal(spend.change.privateKey, null);
    assert.equal(spend.change.opening.secret, '0'.repeat(64));
    assert.throws(() => localBalanceCommitmentMessageV1(note.scope, note.policy, spend.change.opening), /NOTE_ENCODING_INVALID/,
      'empty change has no PC23 note opening');
    await assert.rejects(vault.readDeviceExitSubject('change', '01'.repeat(20)), /ORIGINAL_RESERVATION_REQUIRED/);
    balanceBody.change.amount = '1';
    await assert.rejects(vault.applyDeviceOutputBalances(await readBalance()), /OUTPUT_BALANCE_CHANGED/);
    balanceBody.change.amount = '0'; balanceBody.change.state = 'SPENT';
    await assert.rejects(readBalance(), /OUTPUT_BALANCE_INVALID/);
    balanceBody.change.state = 'UNSPENT';
    balanceBody.recovery.amount = '0'; await assert.rejects(readBalance(), /OUTPUT_BALANCE_INVALID/);
    balanceBody.recovery.amount = proposal.budget;
    const recoveryTree = new PrivateNoteTree([Buffer.from(spend.statement.changeCommitment, 'hex'), Buffer.from(spend.statement.recoveryCommitment, 'hex')]);
    balanceBody.nativeOutcome = 'RECOVERED'; balanceBody.change.path = asPath(recoveryTree, 0);
    balanceBody.recovery.path = asPath(recoveryTree, 1); balanceBody.recovery.state = 'UNSPENT';
    await vault.applyDeviceOutputBalances(await readBalance());
    const recovered = await vault.readDeviceNote();
    assert.equal(recovered.localReservation.changeAvailableBalance, '0');
    assert.equal(recovered.localReservation.recoveryAvailableBalance, '500');
    await global.acceptNative(recovered);
    assert.equal(global.snapshot().rows.find(row => row.route.noteRole === 'change').available, '0');
    assert.equal(global.snapshot().rows.find(row => row.route.noteRole === 'recovery').available, '500');
    assert.deepEqual(store, beforeRead, 'empty-change READ creates no job, credit or storage write');
    balances.close(); vault.close(); const reopened = openLocalRootNoteVaultV1(value.rootId);
    assert.equal((await reopened.readDeviceNote()).localReservation.changeAvailableBalance, null);
    assert.equal((await reopened.readDeviceNote()).localReservation.recoveryAvailableBalance, null);
    reopened.close(); global.clear(); deposit.close(); reservation.close(); deviceKey.fill(0); control.fetch = null;
    return;
  }
  // Even a TLS-provenance handle must match BOTH locally retained PC23 openings/NF.
  const originalAmount = balanceBody.change.amount; balanceBody.change.amount = '379';
  const wrongAmount = await readBalance(); await assert.rejects(vault.applyDeviceOutputBalances(wrongAmount), /OUTPUT_BALANCE_CHANGED/); balanceBody.change.amount = originalAmount;
  assert.ok(global.snapshot().rows.every(row=>row.state==='STALE'&&row.available===null));
  assert.equal((await vault.readDeviceNote()).localReservation.changeAvailableBalance, null, 'a newer READ revokes the previous observation');
  const originalNF = balanceBody.change.nullifier; balanceBody.change.nullifier = '33'.repeat(32);
  await assert.rejects(readBalance(), /RESPONSE_INVALID/); balanceBody.change.nullifier = originalNF;
  const originalPath = balanceBody.change.path; balanceBody.change.path = { ...originalPath, root: '34'.repeat(32) };
  await assert.rejects(readBalance(), /RESPONSE_INVALID/); balanceBody.change.path = originalPath;
  // F requires a real included recovery path in the response; a LOCKED field
  // cannot turn into money merely by toggling the terminal label.
  balanceBody.nativeOutcome = 'RECOVERED'; await assert.rejects(readBalance(), /OUTPUT_BALANCE_INVALID/);
  const recoveryTree = new PrivateNoteTree([Buffer.from(spend.statement.changeCommitment, 'hex'), Buffer.from(spend.statement.recoveryCommitment, 'hex')]);
  balanceBody.change.path = asPath(recoveryTree, 0); balanceBody.recovery.path = asPath(recoveryTree, 1); balanceBody.recovery.state = 'UNSPENT';
  await vault.applyDeviceOutputBalances(await readBalance());
  const recoveredNote=await vault.readDeviceNote();
  assert.equal(recoveredNote.localReservation.recoveryAvailableBalance, '120');
  await global.acceptNative(recoveredNote);
  assert.equal(global.snapshot().rows.find(row=>row.route.noteRole==='recovery').available,'120');
  global.invalidateNative();
  assert.ok(global.snapshot().rows.every(row=>row.state==='UNKNOWN'&&row.available===null));
  const pendingDisplay=global.acceptNative(recoveredNote);global.clear();
  await assert.rejects(pendingDisplay,/MOBILE_PRIVATE_WALLET_STATE_REJECTED/);
  assert.equal(global.snapshot().rows.length,0);
  balanceBody.change.state = 'SPENT'; await vault.applyDeviceOutputBalances(await readBalance());
  assert.equal((await vault.readDeviceNote()).localReservation.changeAvailableBalance, '0', 'zero requires the fresh spent NF response');
  balanceBody.change.state = 'UNSPENT'; await vault.applyDeviceOutputBalances(await readBalance());
  const originalDisplay=await vault.readDeviceNote();await global.acceptNative(originalDisplay);
  const observedAt = Date.now(), clock = mock.method(Date, 'now', () => observedAt + 16000);
  try { const expired = await vault.readDeviceNote(); assert.equal(expired.localReservation.changeAvailableBalance, null);
    assert.ok(global.snapshot().rows.every(row=>row.state==='STALE'&&row.available===null));
    assert.equal(expired.localReservation.change.freshness, 'UNKNOWN'); assert.equal(expired.localReservation.change.amount, '380'); }
  finally { clock.mock.restore(); }
  vault.forgetDeviceOutputBalanceObservation();
  assert.ok(global.snapshot().rows.every(row=>row.state==='STALE'&&row.available===null));
  await vault.applyDeviceOutputBalances(await readBalance());await global.acceptNative(await vault.readDeviceNote());
  balances.close(); vault.close(); const reopened = openLocalRootNoteVaultV1(value.rootId);
  assert.equal(global.snapshot().rows.find(row=>row.route.noteRole==='change').available,'380','closing transport preserves only this original unexpired display');
  assert.equal((await reopened.readDeviceNote()).availableBalance, null);
  assert.equal((await reopened.readDeviceNote()).localReservation.changeAvailableBalance, null);
  const readback = JSON.parse(await clearLegacyExport(reopened)); assert.equal(readback.revision, local.revision);
  assert.equal(JSON.parse(store.get(POINTER)).revision, local.revision); reopened.close();
  // HOST F reorg: the actual SDK emits provenance over explicit synthetic
  // status frames. No chain, signed financial wire or proof is manufactured.
  const { createDeviceOwnerExecutionApiV1 } = await import('../src/api/device-owner-execution-api-v1.ts');
  const { deviceExecutionConsentMessageV1, deviceExecutionSnapshotBytesV1 } = await import('../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs');
  const executionFetch = control.fetch, executionApi = await createDeviceOwnerExecutionApiV1(descriptor);
  let executionReview, executionReceipt, executionUnknown = false, reviewOrdinal = 80;
  control.fetch = async (target, options) => {
    if (!new URL(target).pathname.startsWith('/v1/mobile/device-execution/')) return executionFetch(target, options);
    const input = JSON.parse(options.body);
    const body = target.endsWith('-reviews') ? executionReview : {
      jobId: request.jobId, reservation: Object.fromEntries(Object.entries(sStatus).filter(([name]) => name !== 'authorizationSHA256')),
      nativeBindingSHA256: '32'.repeat(32),
      executionSnapshot: { reference: request.jobId, stage: executionUnknown ? 'UNKNOWN' : executionReceipt.outcome, outcome: executionUnknown ? null : executionReceipt.outcome,
        executionStarted: true, nativeExposure: [], admittedReceipts: 0, errorCode: null, errorCauseCodes: [],
        keeperRestart: false, nodeRestart: false, fullWalletAcceptance: false, claimsEnabled: false },
      executionSnapshotSHA256: null, stage: executionUnknown ? 'UNKNOWN' : executionReceipt.outcome, outcome: executionUnknown ? null : executionReceipt.outcome,
      terminal: executionUnknown ? null : executionReceipt, errorCode: executionUnknown ? 'ORIGINAL_F_BLOCK_UNKNOWN' : null, lossClause: 'FULL_OWNER_REFUND_PROVIDER_LOSS_V1',
      authorizationSHA256: sha(deviceExecutionConsentMessageV1(input.consent)).toString('hex')
    };
    if (!target.endsWith('-reviews')) body.executionSnapshotSHA256 = sha(deviceExecutionSnapshotBytesV1(body.executionSnapshot)).toString('hex');
    const response = new Response(JSON.stringify(body), {status:200,headers:{'content-type':'application/json'}});
    Object.defineProperty(response,'url',{value:target}); return response;
  };
  async function originalFResponse(receipt, action = 'RECONCILE_NATIVE', unknown = false) {
    executionReceipt = receipt; executionUnknown = unknown;
    const access = await executionApi.access();
    executionReview = {version:1,profile:'LIANUM_DEVICE_ORIGINAL_EXECUTION_V1',action,
      reservation:{...sConsent,challengeId:(++reviewOrdinal).toString(16).padStart(64,'0'),nonce:(++reviewOrdinal).toString(16).padStart(64,'0'),
        expiresAt:Date.now()+15000},nativeBindingSHA256:'32'.repeat(32),reservationTransactionHash:sStatus.observation.transactionHash,
      executionSnapshotSHA256:'79'.repeat(32),lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'};
    const review = await executionApi.challenge(action,{access,signature:signDeviceMessage(deviceKey,originalAccountAccessMessageV2(access)),jobId:request.jobId});
    return executionApi.submit({consent:review,signature:signDeviceMessage(deviceKey,deviceExecutionConsentMessageV1(review))});
  }
  const sameF = {transactionHash:'76'.repeat(32),blockHash:'77'.repeat(32),blockNumber:'2',calldataSHA256:'78'.repeat(32),outcome:'RECOVERED'};
  let reorgVault = openLocalRootNoteVaultV1(value.rootId);
  const firstF = await originalFResponse(sameF);
  assert.throws(()=>reorgVault.applyDeviceExecutionTerminal({...firstF}),/RESPONSE_INVALID/);
  await reorgVault.applyDeviceExecutionTerminal(firstF);
  const firstRetained = rawClearRecord(rootHex);
  await reorgVault.applyDeviceExecutionTerminal(await originalFResponse(sameF));
  assert.equal(rawClearRecord(rootHex).revision,firstRetained.revision,'same original terminal cannot add a credit or journal write');
  const reconfirmedF = {...sameF,blockHash:'80'.repeat(32),blockNumber:'3'};
  await assert.rejects(reorgVault.applyDeviceExecutionTerminal(await originalFResponse(reconfirmedF)),/MOBILE_LOCAL_ORIGINAL_EXECUTION_CHANGED/);
  assert.equal(rawClearRecord(rootHex).revision,firstRetained.revision);
  const unknownF = await originalFResponse(sameF,'RECONCILE_NATIVE',true);
  assert.throws(()=>reorgVault.applyDeviceExecutionObservation({...unknownF}),/RESPONSE_INVALID/);
  await reorgVault.applyDeviceExecutionObservation(unknownF);
  const pendingF = rawClearRecord(rootHex);
  assert.deepEqual(pendingF.spend.execution.terminal,sameF);
  assert.equal(pendingF.spend.execution.reorganizationPending.state,'OBSERVATION_PENDING');
  assert.equal((await reorgVault.readDeviceExecutionIntent()).outcome,null);
  reorgVault.close(); reorgVault = openLocalRootNoteVaultV1(value.rootId);
  assert.equal((await reorgVault.readDeviceExecutionIntent()).outcome,null,'pending survives authenticated reopening');
  assert.equal((await reorgVault.readDeviceNote()).localReservation.recoveryAvailableBalance,null);
  await reorgVault.applyDeviceExecutionTerminal(await originalFResponse(reconfirmedF));
  const confirmed = rawClearRecord(rootHex);
  assert.equal(confirmed.revision,firstRetained.revision+2);
  assert.equal(Object.hasOwn(confirmed.spend.execution,'reorganizationPending'),false);
  assert.deepEqual(confirmed.spend.execution.terminal,reconfirmedF);
  assert.deepEqual(confirmed.spend.execution.reorganizations,[sameF]);
  assert.deepEqual(confirmed.note,firstRetained.note);
  assert.deepEqual(confirmed.spend.change,firstRetained.spend.change);
  assert.deepEqual(confirmed.spend.recovery,firstRetained.spend.recovery);
  assert.equal((await reorgVault.readDeviceExecutionIntent()).availableBalance,null);
  await reorgVault.applyDeviceExecutionObservation(await originalFResponse(reconfirmedF,'RECONCILE_NATIVE',true));
  for (const [receipt,action] of [
    [sameF,'RECONCILE_NATIVE'],
    [reconfirmedF,'RECOVER_NATIVE'],
    [{...reconfirmedF,transactionHash:'81'.repeat(32),blockHash:'82'.repeat(32)},'RECONCILE_NATIVE'],
    [{...reconfirmedF,calldataSHA256:'83'.repeat(32),blockHash:'82'.repeat(32)},'RECONCILE_NATIVE'],
    [{...reconfirmedF,outcome:'FULFILLED',blockHash:'82'.repeat(32)},'RECONCILE_NATIVE'],
    [{...reconfirmedF,blockHash:'82'.repeat(32)},'RECOVER_NATIVE'],
  ]) {
    const before = new Map(store), response = await originalFResponse(receipt,action);
    await assert.rejects(reorgVault.applyDeviceExecutionTerminal(response),/MOBILE_LOCAL_ORIGINAL_EXECUTION_CHANGED/);
    assert.deepEqual(store,before);
  }
  await reorgVault.applyDeviceExecutionTerminal(await originalFResponse(reconfirmedF));
  assert.deepEqual(rawClearRecord(rootHex).spend.execution.reorganizations,[sameF]);
  reorgVault.close();
  const reopenedF = openLocalRootNoteVaultV1(value.rootId);
  assert.equal((await reopenedF.readDeviceExecutionIntent()).transactionHash,sameF.transactionHash);
  assert.deepEqual(rawClearRecord(rootHex).spend.execution.reorganizations,[sameF]);
  assert.equal((await reopenedF.readDeviceNote()).localReservation.recoveryAvailableBalance,null);
  const closedResponse = await originalFResponse({...reconfirmedF,blockHash:'84'.repeat(32)});
  executionApi.close(); assert.throws(()=>reopenedF.applyDeviceExecutionTerminal(closedResponse),/CLIENT_CLOSED/);
  reopenedF.close(); control.fetch = executionFetch;
  store.clear(); await restoreLocalRootNoteVaultBackupV1((await writeClear(local)).backup);
  // Authenticated synthetic HOST W39 custody uses the ORIGINAL frame, key,
  // signature and witness decoder. No chain withdrawal is credited by this test.
  const withdrawal = await import('../src/custody/device-balance-withdrawal-codec-v1.mjs');
  const { deviceExitWitnessBytesV1, wipeDeviceExitWitnessV1 } = await import('../../../packages/mobile-protocol/src/device-exit-consent-v1.mjs');
  const exitStatement = withdrawal.localDeviceWithdrawalStatementV1({ scope: note.scope, policy: note.policy, epoch: '1',
    opening: spend.change.opening, path: balanceBody.change.path, recipient: '35'.repeat(20) });
  const exitFrame = withdrawal.localDeviceWithdrawalFrameV1(exitStatement);
  let exitSignature; const heldNoteKey = Buffer.from(spend.change.privateKey, 'hex');
  try { exitSignature = signDeviceMessage(heldNoteKey, exitFrame); } finally { exitFrame.fill(0); heldNoteKey.fill(0); }
  const exitWitness = withdrawal.localDeviceWithdrawalWitnessV1({ statement: exitStatement, opening: spend.change.opening,
    path: balanceBody.change.path, signature: exitSignature }), exitBytes = deviceExitWitnessBytesV1(exitWitness);
  let exitWitnessHash;
  try { exitWitnessHash = sha(exitBytes).toString('hex'); } finally { exitBytes.fill(0); wipeDeviceExitWitnessV1(exitWitness); }
  const exitIntent = { version: 1, phase: 'SIGNED', parentJobId: request.jobId, nativeBindingSHA256: balanceBody.nativeBindingSHA256,
    quoteId: '36'.repeat(32), jobId: '37'.repeat(32), ...descriptor, rootId: value.rootId, noteRevision: local.revision,
    noteRole: 'change', statement: exitStatement, path: balanceBody.change.path, signature: exitSignature, witnessSHA256: exitWitnessHash };
  const freshBalances = await createDeviceOwnerOutputBalanceApiV1(descriptor);
  balanceBody.nativeOutcome = 'RECOVERED'; balanceBody.change.state = 'SPENT'; balanceBody.expiresAt = Date.now() + 10000;
  for (const confirmed of [false, true]) {
    const candidate = structuredClone(local); candidate.revision += confirmed ? 2 : 1;
    candidate.spend.exits = { change: { ...exitIntent, ...(confirmed ? { receipt: { transactionHash: '38'.repeat(32), blockHash: '21'.repeat(32),
      blockNumber: '1', calldataSHA256: '39'.repeat(32), timestamp: '1', domainCommitment: poolTerms.domainCommitment } } : {}) } };
    store.clear(); await restoreLocalRootNoteVaultBackupV1((await writeClear(candidate)).backup);
    const cap = openLocalRootNoteVaultV1(value.rootId), selectors = await cap.readDeviceOutputBalanceSubject();
    balanceBody.noteRevision = selectors.noteRevision;
    const signedRead = await freshBalances.access(), original = await freshBalances.observe({ ...selectors, access: signedRead,
      signature: signDeviceMessage(deviceKey, originalAccountAccessMessageV2(signedRead)) });
    await cap.applyDeviceOutputBalances(original); const observed = (await cap.readDeviceNote()).localReservation.change;
    assert.equal(observed.state, confirmed ? 'WITHDRAWN' : 'WITHDRAWAL_PENDING');
    assert.equal(observed.availableBalance, confirmed ? '0' : null, 'SPENT without a confirmed W39 receipt never clears an uncertain intent');
    assert.equal(observed.withdrawnAmount, confirmed ? '380' : null);
    cap.close(); const again = openLocalRootNoteVaultV1(value.rootId);
    assert.equal((await again.readDeviceNote()).localReservation.changeAvailableBalance, null, 'reopen never retains monetary freshness');
    again.close();
  }
  freshBalances.close();
  // An attacker may recompute ALL public hashes/manifest/pointer. A forged
  // AES tag still fails; an authenticated record with an unknown field also
  // fails the original strict state decoder instead of being normalized away.
  for (const extra of [false, true]) {
    const changed = structuredClone(stored); if (extra) changed.spend.preparation.unrecognized = '24'.repeat(32);
    const forged = await writeClear(changed, !extra), e = JSON.parse(forged.raw), checksum = sha(Buffer.from(forged.raw)).toString('hex');
    const chunks = Math.ceil(forged.raw.length / 1800);
    for (let i = 0; i < chunks; i++) store.set('lianum.note.record.chunk.v1.' + checksum + '.' + i, forged.raw.slice(i * 1800, (i + 1) * 1800));
    store.set(RECORD, JSON.stringify({ version: 2, profile: 'LIANUM_DEVICE_ENCRYPTED_CHUNKS_V1', rootId: e.rootId,
      revision: e.revision, sha256: checksum, bytes: forged.raw.length, chunks }));
    store.set(POINTER, JSON.stringify({ version: 1, rootId: e.rootId, revision: e.revision, recordSHA256: checksum, state: 'ACTIVE' }));
    const beforeRejected = new Map(store), badVault = openLocalRootNoteVaultV1(value.rootId);
    await assert.rejects(badVault.readDeviceNote()); assert.deepEqual(store, beforeRejected); badVault.close();
  }
  deposit.close(); reservation.close(); deviceKey.fill(0); control.fetch = null;
}
test('original vault persists output custody and binds fresh READ balance to local PC23/NF; expiry/reopen or coherent public hashes confer no availability',
  t => originalOutputCustodyCase(t));
test('full-budget reservation reads the original empty-change marker and recovery without enabling a zero withdrawal',
  t => originalOutputCustodyCase(t, true));

// These fixed TLS responses are explicit HOST framing, never original monetary
// acceptance. They exercise the client's signed READ/path/lifetime boundaries.
test('output READ accepts only the original both-LOCKED reorg pair and rejects copied, superseded or closed handles', async () => {
  reset();
  const { createDeviceOwnerOutputBalanceApiV1, readDeviceOutputBalanceV1 } = await import('../src/api/device-owner-output-balance-api-v1.ts');
  const { originalAccountFramesV2 } = await import('./helpers/original-account-frames-v2.mjs');
  const { devicePublicKey, signDeviceMessage } = await import('../src/custody/signing.mjs');
  const { originalAccountAccessMessageV2 } = await import('@lianum/mobile-protocol/original-account-v2');
  const { PrivateNoteTree } = await import('../../../packages/engine/src/notes/private-note-tree.mjs');
  const key = new Uint8Array(32).fill(11), frames = originalAccountFramesV2({ devicePublicKey: devicePublicKey(key) });
  const descriptor = { origin: frames.access.origin, pairingId: frames.access.pairingId, devicePublicKey: frames.access.devicePublicKey };
  const hash = n => n.toString(16).padStart(64, '0'), cm = hash(20), tree = new PrivateNoteTree([Buffer.from(cm, 'hex')]), p = tree.path(0);
  const input = { access: frames.access, signature: signDeviceMessage(key, originalAccountAccessMessageV2(frames.access)),
    parentJobId: hash(21), rootId: hash(22), noteRevision: 7, changeNullifier: hash(23), recoveryNullifier: hash(24) };
  const base = { version: 1, profile: 'LIANUM_DEVICE_ORIGINAL_OUTPUT_BALANCE_V1', ...descriptor, parentJobId: input.parentJobId,
    rootId: input.rootId, noteRevision: input.noteRevision, nativeBindingSHA256: hash(25), reservationTransactionHash: hash(26),
    assetId: hash(27), pool: '28'.repeat(20), poolTerms: { scope: hash(29), policy: hash(30), codeHash: hash(31), assetIdentity: hash(32), domainCommitment: hash(33) },
    sourceNullifier: hash(34), sourceNullifierSpent: true, nativeOutcome: null,
    change: { noteRole: 'change', commitment: cm, nullifier: input.changeNullifier, amount: '400', state: 'UNSPENT',
      path: { root: p.root.slice(2), index: p.index, leaf: p.leaf.slice(2), siblings: p.siblings.map(x => x.slice(2)) } },
    recovery: { noteRole: 'recovery', commitment: hash(35), nullifier: input.recoveryNullifier, amount: '100', state: 'LOCKED', path: null },
    observed: { blockNumber: '1', blockHash: hash(36), timestamp: '1' }, expiresAt: Date.now() + 10000,
    authorizationSHA256: sha(originalAccountAccessMessageV2(frames.access)).toString('hex') };
  const { normalizeDeviceOutputBalanceV1 } = await import('../../../packages/mobile-protocol/src/device-output-balance-v1.mjs');
  let responseBody = base;
  let count = 0, digestTampered = false; const entered = Promise.withResolvers(), released = Promise.withResolvers();
  control.fetch = async (target, options) => {
    assert.ok(target.endsWith('/device-execution/output-balances'));
    const body = structuredClone(responseBody); if (digestTampered) body.authorizationSHA256 = hash(37);
    if (++count === 1) { entered.resolve(); await released.promise; }
    const response = new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: target }); return response;
  };
  const api = await createDeviceOwnerOutputBalanceApiV1(descriptor), first = api.observe(input);
  // Retain rejection immediately, then let the later authenticated response win.
  const firstRejected = assert.rejects(first, /RESPONSE_INVALID/); await entered.promise;
  const second = await api.observe(input); released.resolve(); await firstRejected;
  assert.equal(readDeviceOutputBalanceV1(second).change.amount, '400');
  assert.throws(() => readDeviceOutputBalanceV1({ ...second }), /RESPONSE_INVALID/);
  // These public HOST frames carry no financial authority. Exercise the real
  // response decoder and SDK handle, including its original null-path branch.
  const locked = structuredClone(base); locked.change.state = 'LOCKED'; locked.change.path = null;
  const normalized = normalizeDeviceOutputBalanceV1(locked);
  assert.equal(normalized.nativeOutcome, null);
  for (const role of ['change', 'recovery']) {
    assert.equal(normalized[role].state, 'LOCKED'); assert.equal(normalized[role].path, null);
  }
  responseBody = locked; const pending = await api.observe(input), pendingValue = readDeviceOutputBalanceV1(pending);
  for (const role of ['change', 'recovery']) {
    assert.equal(pendingValue[role].state, 'LOCKED'); assert.equal(pendingValue[role].path, null);
  }
  assert.equal(Object.isFrozen(pendingValue.change), true);
  assert.throws(() => readDeviceOutputBalanceV1({ ...pending }), /RESPONSE_INVALID/);
  const contradictions = [
    value => { value.nativeOutcome = 'FULFILLED'; },
    value => { value.nativeOutcome = 'RECOVERED'; },
    value => { value.recovery.state = 'UNSPENT'; value.recovery.path = { ...base.change.path, leaf: value.recovery.commitment }; },
    value => { value.change.path = structuredClone(base.change.path); },
    value => { value.change.state = 'UNSPENT'; },
    value => { value.sourceNullifierSpent = false; },
    value => { value.recovery.nullifier = value.change.nullifier; },
  ];
  for (const mutate of contradictions) {
    const contradictory = structuredClone(locked); mutate(contradictory);
    assert.throws(() => normalizeDeviceOutputBalanceV1(contradictory), /MOBILE_DEVICE_OUTPUT_BALANCE_INVALID/);
    responseBody = contradictory; await assert.rejects(api.observe(input), /MOBILE_DEVICE_OUTPUT_BALANCE_INVALID/);
  }
  // Every remaining path still uses the original cryptographic verification.
  responseBody = structuredClone(base); responseBody.change.path.root = hash(37);
  await assert.rejects(api.observe(input), /RESPONSE_INVALID/);
  responseBody = base;
  digestTampered = true; await assert.rejects(api.observe(input), /RESPONSE_INVALID/);
  assert.throws(() => readDeviceOutputBalanceV1(second), /RESPONSE_INVALID/);
  digestTampered = false; const third = await api.observe(input); api.close();
  assert.throws(() => readDeviceOutputBalanceV1(third), /CLIENT_CLOSED/); key.fill(0); control.fetch = null;
});


test('sealed native root backup hides the root and restores its original note after total storage loss', async () => {
  reset(); const created = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(created.rootId);
  const note = await vault.prepareUnissuedBalanceNote(terms), original = new Map(store), rootHex = store.get(ROOT);
  assert.throws(() => vault.exportBackup(), /BACKUP_PASSWORD/);
  const sealed = await vault.exportBackup(BACKUP_PASSWORD), header = JSON.parse(sealed);
  assert.equal(header.profile, 'LIANUM_SEALED_DEVICE_CUSTODY_BACKUP_V1');
  assert.deepEqual(header.binding, { profile: 'DEVICE_NATIVE_ROOT_NOTE_CUSTODY_V1', rootId: created.rootId });
  assert.equal(Object.hasOwn(header, 'rootHex'), false); assert.equal(sealed.includes(rootHex), false);
  vault.close(); store.clear();
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(sealed, 'another wrong recovery password', created.rootId), /BACKUP_AUTHENTICATION/);
  assert.equal(store.size, 0);
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(sealed, BACKUP_PASSWORD, 'ff'.repeat(32)), /BACKUP_BINDING/);
  assert.equal(store.size, 0);
  const corrupted = JSON.parse(sealed); const bytes = Buffer.from(corrupted.sealed, 'base64'); bytes[13] ^= 1; corrupted.sealed = bytes.toString('base64');
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(JSON.stringify(corrupted), BACKUP_PASSWORD, created.rootId), /BACKUP_AUTHENTICATION/);
  assert.equal(store.size, 0);
  // A valid ciphertext header for A must not authorize a complete, authenticated
  // original backup of B inside it. Bind the decrypted body before any write.
  const foreignCreated = await importLocalRootNoteVaultV1('0c'.repeat(32));
  const foreignVault = openLocalRootNoteVaultV1(foreignCreated.rootId);
  await foreignVault.prepareUnissuedBalanceNote(terms);
  const foreignClear = new TextEncoder().encode(await clearLegacyExport(foreignVault));
  foreignVault.close(); store.clear();
  const { sealDeviceCustodyBackupV1 } = await import('../src/custody/sealed-custody-backup-v1.mjs');
  let foreignSealed;
  try { foreignSealed = await sealDeviceCustodyBackupV1(foreignClear, BACKUP_PASSWORD, header.binding); }
  finally { foreignClear.fill(0); }
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(foreignSealed, BACKUP_PASSWORD, created.rootId), /BACKUP_BINDING/);
  assert.equal(store.size, 0);
  const result = await restoreLocalRootNoteVaultBackupV1(sealed, BACKUP_PASSWORD, created.rootId);
  assert.deepEqual(result.note, note); assert.deepEqual(store, original);
  assert.equal((await inspectLocalRootNoteVaultV1()).availableBalance, null);
  const reopened = openLocalRootNoteVaultV1(created.rootId);
  assert.deepEqual(await reopened.readPreparedNote(), note); reopened.close();
});

test('sealed native root profile admits its full original record without widening identity or external caps', async () => {
  reset();
  const { sealDeviceCustodyBackupV1, unsealDeviceCustodyBackupV1, DEVICE_CUSTODY_BACKUP_MAX_CLEAR_BYTES_V1,
    DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1, DEVICE_NATIVE_ROOT_NOTE_BACKUP_MAX_CLEAR_BYTES_V1 } = await import('../src/custody/sealed-custody-backup-v1.mjs');
  assert.equal(DEVICE_CUSTODY_BACKUP_MAX_CLEAR_BYTES_V1, 65536); assert.equal(DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1, 98304);
  const clear = new Uint8Array(DEVICE_NATIVE_ROOT_NOTE_BACKUP_MAX_CLEAR_BYTES_V1).fill(91);
  const native = { profile: 'DEVICE_NATIVE_ROOT_NOTE_CUSTODY_V1', rootId: '22'.repeat(32) };
  const sealed = await sealDeviceCustodyBackupV1(clear, BACKUP_PASSWORD, native);
  const readback = await unsealDeviceCustodyBackupV1(sealed, BACKUP_PASSWORD, native);
  assert.deepEqual(readback, clear); readback.fill(0); clear.fill(0);
  await assert.rejects(sealDeviceCustodyBackupV1(new Uint8Array(99329), BACKUP_PASSWORD, native), /BACKUP_INVALID/);
  const publicKey = '04' + '11'.repeat(64);
  for (const binding of [{ profile: 'DEVICE_IDENTITY_CUSTODY_V1', devicePublicKey: publicKey, routeSHA256: null },
    { profile: 'DEVICE_EXTERNAL_FLAT_CUSTODY_V1', devicePublicKey: publicKey, routeSHA256: '33'.repeat(32) }]) {
    await assert.rejects(sealDeviceCustodyBackupV1(new Uint8Array(65537), BACKUP_PASSWORD, binding), /BACKUP_INVALID/);
    await assert.rejects(unsealDeviceCustodyBackupV1(sealed, BACKUP_PASSWORD, binding), /BACKUP_INVALID/);
  }
  await assert.rejects(sealDeviceCustodyBackupV1(new Uint8Array(1), BACKUP_PASSWORD, { ...native, devicePublicKey: publicKey }), /BACKUP_INVALID/);
});

test('sealed native root cancellation and foreign custody preserve the original storage without replacement', async () => {
  reset(); const created = await createLocalRootNoteVaultV1(), vault = openLocalRootNoteVaultV1(created.rootId), original = new Map(store);
  const controller = new AbortController(); control.pausedEncrypt = async () => controller.abort();
  await assert.rejects(vault.exportBackup(BACKUP_PASSWORD, controller.signal), /BACKUP_CANCELLED/);
  assert.deepEqual(store, original); control.pausedEncrypt = null;
  const sealed = await vault.exportBackup(BACKUP_PASSWORD); vault.close(); store.clear();
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(sealed, BACKUP_PASSWORD, created.rootId, cancelled.signal), /BACKUP_CANCELLED/);
  assert.equal(store.size, 0);
  await importLocalRootNoteVaultV1('0c'.repeat(32)); const foreign = new Map(store);
  await assert.rejects(restoreLocalRootNoteVaultBackupV1(sealed, BACKUP_PASSWORD, created.rootId), /BACKUP_CONFLICT/);
  assert.deepEqual(store, foreign);
});


/** No proof or native funding ports. The real SDK permission membership,
 * protected original RootNote, X25519/AES wire and original D27 derivation
 * establish custody retention, binding and rejection after restart. */
test('device-root claim retains original D27 before encrypted intake, denies copies/reproof and restores SAME custody', async()=>{
 reset();const {createDeviceRootNativeClaimApiV2}=await import('../src/api/native-claim-device-api-v1.mjs');
 const C=await import('../../../packages/mobile-protocol/src/native-claim-device-v1.mjs');
 const {devicePublicKey,signDeviceRootNativeClaimPermissionV2}=await import('../src/custody/signing.mjs');
 const {createPrivateProofRecipientV1,readPrivateProofRecipientV1,openPrivateProofJobV1,closePrivateProofRecipientV1,wipePrivateProofInputsV1}=await import('../../../packages/proofs/src/jobs/private-proof-transit-v1.mjs');
 const {deriveOriginalDeviceRootClaimJobV2}=await import('../../../packages/proofs/src/jobs/private-device-proof-input-v2.mjs');
 const pop=Buffer.from('09'.repeat(32),'hex'),jobId='11111111-1111-4111-8111-111111111111';
 const originalRecipient=createPrivateProofRecipientV1({relation:'deposit_intent',role:'owner',jobId});
 let ordinal=30,permission;
 const descriptor=C.normalizeDeviceRootClaimDescriptorV2({profile:C.DEVICE_ROOT_NATIVE_CLAIM_NOTE_V2,
  claim:{version:1,profile:C.NATIVE_CLAIM_DEVICE_PAIRING_V1,origin:'https://127.0.0.1:2443',pairingId:'11'.repeat(32),devicePublicKey:devicePublicKey(pop),
   accountScopeSHA256:'12'.repeat(32),lifetimeSHA256:'13'.repeat(32),claimDomain:'14'.repeat(32),nativeFamily:'1',nativeGenesis:'15'.repeat(32),nativeAsset:'16'.repeat(32),wrapperAssetIdentity:'17'.repeat(32),
   nativeSymbol:'BTC',claimSymbol:'cBTC',decimals:8,atomicUnit:'satoshi',nativeAssetKind:null,mint:null},...Object.fromEntries(['pool','scope','policy','recipient'].map(k=>[k,terms[k]])),noteCustody:'DEVICE_ROOT_NOTE',nativeCustody:'BACKEND_LOCAL_QUORUM'});
 const fetchImpl=async(url,options)=>{
  const request=JSON.parse(options.body);let response;
  if(url.endsWith('/challenges'))response={version:2,profile:C.DEVICE_ROOT_NATIVE_CLAIM_PERMISSION_V2,action:request.action,descriptor,
   rootId:null,noteRevision:null,jobId:null,statement:null,witnessSHA256:null,commonSHA256:null,recipient:null,
   challengeId:(++ordinal).toString(16).padStart(64,'0'),nonce:'21'.repeat(32),expiresAt:Date.now()+15000};
  else{assert.ok(url.endsWith('/reviews'));response={...request.access,action:'PROVE_D27',...request.draft,jobId,recipient:readPrivateProofRecipientV1(originalRecipient)};permission=response;}
  return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
 };
 const api=createDeviceRootNativeClaimApiV2({descriptor,fetchImpl}),created=await createLocalRootNoteVaultV1(),vault=openLocalRootNoteVaultV1(created.rootId);
 let opened;
 try{
  await vault.prepareUnissuedBalanceNote(terms);const signed=await vault.signPreparedDeposit(await vault.reviewPreparedDeposit({relation:'D27',validFrom:'100',validUntil:'86500'}));
  const request=await vault.createDeviceRootClaimRequestV2(signed,descriptor),access=await api.challenge('ACCESS');
  const consent=await api.reviewD27(access,signDeviceRootNativeClaimPermissionV2(pop,access),{rootId:request.rootId,noteRevision:request.noteRevision,statement:request.statement,witnessSHA256:request.witnessSHA256});
  const signature=signDeviceRootNativeClaimPermissionV2(pop,consent),before=new Map(store);
  await assert.rejects(async()=>vault.sealDeviceRootClaimRequestV2({...request},consent,signature),/ORIGINAL_CLAIM_PERMISSION_REQUIRED/);assert.deepEqual(store,before);
  await assert.rejects(async()=>vault.sealDeviceRootClaimRequestV2(request,{...consent},signature),/MOBILE_NATIVE_CLAIM/);assert.deepEqual(store,before);
  const packet=await vault.sealDeviceRootClaimRequestV2(request,consent,signature),retained=await vault.readDeviceRootClaimCustodyV2();
  assert.equal(retained.d27JobId,jobId);assert.equal(retained.status,'UNKNOWN');assert.equal(retained.availableBalance,null);
  assert.equal(JSON.stringify(packet).includes(store.get(ROOT)),false);assert.equal(packet.ciphertext.includes(signed.signature),false);
  assert.notDeepEqual(store,before);opened=openPrivateProofJobV1(originalRecipient,packet);
  const derived=await deriveOriginalDeviceRootClaimJobV2(opened,{name:'deposit_intent'});
  assert.equal(derived.commitment,request.statement.output);assert.equal(derived.claimDomain,descriptor.claim.claimDomain);assert.equal(derived.action,'PROVE_D27');
  assert.equal(Object.hasOwn(derived,'opening'),false);assert.equal(Object.hasOwn(derived,'noteSecret'),false);
  await assert.rejects(async()=>vault.sealDeviceRootClaimRequestV2(request,consent,signature),/ORIGINAL_CLAIM_PERMISSION_REQUIRED/);
  await assert.rejects(async()=>vault.reviewPreparedDeposit({relation:'D27',validFrom:'100',validUntil:'86500'}),/ORIGINAL_REQUIRED/);
  vault.close();const restored=openLocalRootNoteVaultV1(created.rootId),same=await restored.readDeviceRootClaimCustodyV2();
  assert.deepEqual(same,retained);assert.equal(await restored.readPreparedNote(),null);
  await assert.rejects(async()=>restored.createDeviceRootClaimRequestV2(signed,descriptor),/SIGNATURE_REQUIRED/);restored.close();
 }finally{vault.close();api.close();pop.fill(0);if(opened)wipePrivateProofInputsV1(opened.inputs);closePrivateProofRecipientV1(originalRecipient);}
});


test('HOST device-root W39 uses original PC23 opening/path and private recipient, burns same SDK POST before lost reply',async()=>{
 // Cryptography, exact protocol and transport only; server responses are inert.
 // This case creates no proof, pool credit, native transfer or economic authority.
 reset();const C=await import('../../../packages/mobile-protocol/src/native-claim-device-v1.mjs'),P=await import('../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs');
 const {createDeviceRootNativeClaimApiV2,readOriginalDeviceRootClaimExitPermissionV3}=await import('../src/api/native-claim-device-api-v1.mjs');
 const {sealOriginalDeviceRootClaimExitWitnessV3}=await import('../src/api/device-private-proof-transit-v2.mjs');
 const {freshKey,signature,nullifier}=await import('../../../packages/engine/src/notes/private-note-encoding.mjs');
 const {walletWithdrawInput}=await import('../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs');
 const {PrivateNoteTree}=await import('../../../packages/engine/src/notes/private-note-tree.mjs');
 const {createPrivateProofRecipientV1,readPrivateProofRecipientV1,openPrivateProofJobV1,closePrivateProofRecipientV1,wipePrivateProofInputsV1}=await import('../../../packages/proofs/src/jobs/private-proof-transit-v1.mjs');
 const {deriveOriginalDeviceWalletNoteJobV3}=await import('../../../packages/proofs/src/jobs/private-device-wallet-note-input-v3.mjs');
 const owner=freshKey(),device=freshKey(),h=b=>createHash('sha256').update(b).digest('hex'),jobId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const note={type:4,rho:Buffer.from('31'.repeat(32),'hex'),...owner,value:'20',secret:Buffer.from('32'.repeat(32),'hex')},cm=balanceCommitment(terms.scope,terms.policy,note).toString('hex'),nf=nullifier(terms.scope,cm,note.secret).toString('hex');
 const originalPath=new PrivateNoteTree(['0x'+cm]).path(0),path={root:originalPath.root.slice(2),index:0,leaf:cm,siblings:originalPath.siblings.map(s=>s.slice(2))},statement={scope:terms.scope,policy:terms.policy,epoch:'1',root:path.root,nullifier:nf,amount:note.value,recipient:terms.recipient,commitment:cm};
 const witness=walletWithdrawInput({scope:terms.scope,policy:terms.policy,epoch:'1',note,path:originalPath,recipient:terms.recipient}),bytes=P.externalFlatWitnessBytesV1('withdraw_balance',witness),witnessSHA256=h(bytes);bytes.fill(0);
 const own=createPrivateProofRecipientV1({relation:'withdraw_balance',role:'owner',jobId});let ordinal=70,posts=0,packet;
 const descriptor=C.normalizeDeviceRootClaimDescriptorV2({profile:C.DEVICE_ROOT_NATIVE_CLAIM_NOTE_V2,claim:{version:1,profile:C.NATIVE_CLAIM_DEVICE_PAIRING_V1,origin:'https://127.0.0.1:2443',pairingId:'11'.repeat(32),devicePublicKey:'04'+device.x.toString('hex')+device.y.toString('hex'),accountScopeSHA256:'12'.repeat(32),lifetimeSHA256:'13'.repeat(32),claimDomain:'14'.repeat(32),nativeFamily:'1',nativeGenesis:'15'.repeat(32),nativeAsset:'16'.repeat(32),wrapperAssetIdentity:'17'.repeat(32),nativeSymbol:'BTC',claimSymbol:'cBTC',decimals:8,atomicUnit:'satoshi',nativeAssetKind:null,mint:null},...Object.fromEntries(['pool','scope','policy','recipient'].map(k=>[k,terms[k]])),noteCustody:'DEVICE_ROOT_NOTE',nativeCustody:'BACKEND_LOCAL_QUORUM'});
 const rootId='33'.repeat(32),quoteId='34'.repeat(32),base={version:3,profile:C.DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3,descriptor,rootId,noteRevision:1,jobId,quoteId,statement,path,witnessSHA256,proofSHA256:null,publicInputsSHA256:null,recipient:readPrivateProofRecipientV1(own),requestId:null,ticketId:null,amount:null,maxFee:null,challengeId:'35'.repeat(32),nonce:'36'.repeat(32),expiresAt:Date.now()+15000};
 const api=createDeviceRootNativeClaimApiV2({descriptor,fetchImpl:async(url,options)=>{const request=JSON.parse(options.body);let value;
  if(url.endsWith('/challenges'))value={version:2,profile:C.DEVICE_ROOT_NATIVE_CLAIM_PERMISSION_V2,action:request.action,descriptor,rootId:null,noteRevision:null,jobId:null,statement:null,witnessSHA256:null,commonSHA256:null,recipient:null,challengeId:(++ordinal).toString(16).padStart(64,'0'),nonce:'37'.repeat(32),expiresAt:base.expiresAt};
  else if(url.endsWith('/exit-quotes'))value={profile:base.profile,descriptor,quoteId,rootId,noteRevision:1,statement,path,observed:{blockNumber:'1',blockHash:'38'.repeat(32),timestamp:'600'},expiresAt:base.expiresAt};
  else if(url.endsWith('/exit-reviews'))value={...base,action:'PROVE_W39'};
  else if(url.endsWith('/exit-challenges'))value={...base,action:request.action,recipient:null,proofSHA256:'39'.repeat(32),publicInputsSHA256:'40'.repeat(32),challengeId:(++ordinal).toString(16).padStart(64,'0')};
  else{posts++;packet=request.packet;throw Error('HOST_ORIGINAL_REPLY_LOST');}
  return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 }});const sign=p=>signature(device,p.version===3?C.deviceRootClaimExitPermissionMessageV3(p):C.deviceRootClaimPermissionMessageV2(p)).toString('hex');let opened;
 try{
  const access=await api.challenge('ACCESS'),quote=await api.quoteW39(access,sign(access)),next=await api.challenge('ACCESS'),consent=await api.reviewW39(next,sign(next),quote,witnessSHA256);
  assert.throws(()=>readOriginalDeviceRootClaimExitPermissionV3({...consent}),/MOBILE_NATIVE_CLAIM/);
  const sealed=await sealOriginalDeviceRootClaimExitWitnessV3(consent,sign(consent),witness);assert.equal(JSON.stringify(sealed).includes(owner.privateKey.export({format:'der',type:'sec1'}).toString('hex')),false);assert.equal(JSON.stringify(sealed).includes(note.secret.toString('hex')),false);
  opened=openPrivateProofJobV1(own,sealed);const derived=deriveOriginalDeviceWalletNoteJobV3(opened,'withdraw_balance');assert.equal(derived.commitment,cm);assert.equal(derived.nullifier,nf);assert.deepEqual(opened.inputs,witness);assert.deepEqual(opened.expectedPublicInputs,C.deviceRootClaimExitPublicInputsV3(statement));
  assert.throws(()=>deriveOriginalDeviceWalletNoteJobV3({...opened},'withdraw_balance'),/ORIGINAL_RECIPIENT/);
  const sendAccess=await api.challenge('ACCESS'),send=await api.exitChallenge(sendAccess,sign(sendAccess),'WITHDRAW_W39');await assert.rejects(api.exitSubmit(send,sign(send)),/HOST_ORIGINAL_REPLY_LOST/);assert.equal(posts,1);assert.equal(packet,null);
  await assert.rejects(api.exitSubmit(send,sign(send)),/MOBILE_NATIVE_CLAIM/);assert.equal(posts,1);
  const observeAccess=await api.challenge('ACCESS'),observe=await api.exitChallenge(observeAccess,sign(observeAccess),'OBSERVE_W39');assert.equal(observe.jobId,send.jobId);assert.equal(observe.proofSHA256,send.proofSHA256);
  await assert.rejects(api.exitSubmit(observe,sign(observe),sealed),/MOBILE_NATIVE_CLAIM/);assert.equal(posts,1);
 }finally{api.close();P.externalFlatWipeV1(witness);if(opened)wipePrivateProofInputsV1(opened.inputs);closePrivateProofRecipientV1(own);wipePrivateProofInputsV1(note);wipePrivateProofInputsV1(device);}
});
