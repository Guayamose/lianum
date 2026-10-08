/** Expo/native boundaries are explicit test doubles. These tests exercise the
 * real key-store orchestration and signatures; they do not prove device
 * biometrics, hardware isolation, mobile fund recovery or native acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { MOBILE_AUTHORIZATION_PROFILE, mobileReceiptMessage } from '@lianum/mobile-protocol';
import * as signing from '../src/custody/signing.mjs';

const store = new Map(), calls = [], privateBuffers = [];
const control = { supported: true, approval: true, randomness: 0, invalidatePrivate: false, slowRead: null, discardPendingWrite: false };
const PRIVATE = 'lianum.owner.secp256k1.v1', PUBLIC = 'lianum.owner.public.v1';
mock.module('expo-secure-store', { exports: {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  isAvailableAsync: async () => control.supported,
  canUseBiometricAuthentication: () => control.supported,
  async getItemAsync(key, options) {
    calls.push({ method: 'read', key, options });
    if (key === PRIVATE) {
      assert.equal(options.requireAuthentication, true);
      if (control.slowRead) await control.slowRead();
      if (control.invalidatePrivate) return null;
    }
    return store.get(key) ?? null;
  },
  async setItemAsync(key, value, options) {
    calls.push({ method: 'write', key, options });
    if (key === PRIVATE) { assert.equal(options.requireAuthentication, true); assert.equal(options.keychainAccessible, 6); }
    if (key.includes('pending') && control.discardPendingWrite) return;
    store.set(key, value);
  },
} });
mock.module('expo-local-authentication', { exports: {
  hasHardwareAsync: async () => control.supported,
  isEnrolledAsync: async () => control.supported,
  async authenticateAsync(options) {
    assert.equal(options.disableDeviceFallback, true); assert.equal(options.biometricsSecurityLevel, 'strong');
    return { success: control.approval };
  },
} });
mock.module('expo-crypto', { exports: {
  async getRandomBytesAsync(length) { control.randomness++; assert.equal(length, 32); return new Uint8Array(32).fill(11); },
} });
mock.module('react-native', { exports: { Platform: { OS: 'ios' } } });
mock.module(new URL('../src/custody/signing.mjs', import.meta.url).href, { exports: {
  ...signing,
  privateKeyFromHex(value) { const bytes = signing.privateKeyFromHex(value); privateBuffers.push(bytes); return bytes; },
} });
const { createDeviceIdentity, readDevicePublicKey, signReviewedChallenge, signReviewedReceipt } = await import('../src/custody/key-store.ts');
const { retainPendingOperation, readPendingOperation, assertPendingOperationIdentity } = await import('../src/custody/pending-operations.ts');
function reset() {
  store.clear(); calls.length = 0; privateBuffers.length = 0;
  Object.assign(control, { supported: true, approval: true, randomness: 0, invalidatePrivate: false, slowRead: null, discardPendingWrite: false });
}
const challenge = ownerPublicKey => ({ version: 1, profile: MOBILE_AUTHORIZATION_PROFILE, origin: 'https://wallet.example',
  challengeId: 'a'.repeat(64), nonce: 'b'.repeat(64), expiresAt: Date.now() + 60_000, ownerPublicKey,
  intent: { requestId: 'original_request_0003', action: 'execute', kind: 'EXIT', chain: 'ethereum',
    assetId: 'c'.repeat(64), amountAtomic: '25', recipient: '0x' + 'd'.repeat(40), maxFeeAtomic: '1' } });

test('identity creation requires enrolled protection, native entropy and never rotates an original key', async () => {
  reset();
  const publicKey = await createDeviceIdentity(), originalPrivate = store.get(PRIVATE);
  assert.equal(publicKey.length, 130); assert.equal(await readDevicePublicKey(), publicKey);
  assert.equal(await createDeviceIdentity(), publicKey);
  assert.equal(control.randomness, 1); assert.equal(store.get(PRIVATE), originalPrivate);
  assert.ok(privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
  const privateWrites = calls.filter(call => call.method === 'write' && call.key === PRIVATE);
  assert.equal(privateWrites.length, 1); assert.equal(privateWrites[0].options.requireAuthentication, true);
  store.delete(PUBLIC);
  assert.equal(await createDeviceIdentity(), publicKey);
  assert.equal(control.randomness, 1); assert.equal(store.get(PRIVATE), originalPrivate);
});

test('unsupported/cancelled/inaccessible custody fails before generating or replacing a key', async () => {
  reset(); control.supported = false;
  await assert.rejects(createDeviceIdentity(), /PROTECTED_STORAGE_UNAVAILABLE/);
  assert.equal(control.randomness, 0); assert.equal(store.size, 0);
  reset(); control.approval = false;
  await assert.rejects(createDeviceIdentity(), /AUTHENTICATION_CANCELLED/);
  assert.equal(control.randomness, 0); assert.equal(store.size, 0);
  reset(); const publicKey = await createDeviceIdentity(), originalPrivate = store.get(PRIVATE);
  control.invalidatePrivate = true;
  await assert.rejects(createDeviceIdentity(), /KEY_RECOVERY_REQUIRED/);
  await assert.rejects(signReviewedChallenge(challenge(publicKey), 'https://wallet.example'), /KEY_RECOVERY_REQUIRED/);
  assert.equal(control.randomness, 1); assert.equal(store.get(PRIVATE), originalPrivate);
});

test('signing binds origin, owner and expiry after authentication and clears mutable key buffers', async () => {
  reset(); const publicKey = await createDeviceIdentity(), original = challenge(publicKey);
  const signature = await signReviewedChallenge(original, original.origin);
  assert.equal(signature.length, 128);
  assert.ok(privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
  await assert.rejects(signReviewedChallenge(original, 'https://other.example'), /ORIGIN_BINDING/);
  await assert.rejects(signReviewedChallenge({ ...original, ownerPublicKey: '04' + 'f'.repeat(128) }, original.origin), /OWNER_BINDING/);
  let clock = 1_000_000;
  const time = mock.method(Date, 'now', () => clock);
  const expiresSoon = { ...original, expiresAt: clock + 60_000 };
  control.slowRead = async () => { clock += 60_001; };
  try { await assert.rejects(signReviewedChallenge(expiresSoon, original.origin), /CHALLENGE_EXPIRED/); }
  finally { time.mock.restore(); }
  assert.ok(privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
});

test('pending original authorization survives a reopened store without automatic key or network work', async () => {
  reset(); const publicKey = await createDeviceIdentity(), original = challenge(publicKey);
  const signature = await signReviewedChallenge(original, original.origin);
  const operation = { authorization: { challenge: original, signature }, status: 'SUBMITTING' };
  const retained = await retainPendingOperation(operation);
  assert.equal(retained.economicState, 'UNRESOLVED');
  assert.deepEqual(retained.originalAuthorization, operation.authorization);
  assert.deepEqual(retained.authorizations, [operation]);
  const reads = calls.length;
  assert.deepEqual(await readPendingOperation(), retained);
  assert.equal(control.randomness, 1); assert.equal(calls.length, reads + 1);
  assert.ok(calls.filter(call => call.key.includes('pending')).every(call => call.options.requireAuthentication === true));
  const changed = { ...original, intent: { ...original.intent, requestId: 'replacement_request_0003' } };
  await assert.rejects(retainPendingOperation({ authorization: { challenge: changed,
    signature: await signReviewedChallenge(changed, changed.origin) }, status: 'SUBMITTING' }), /ORIGINAL_OPERATION_REQUIRED/);
  assert.deepEqual(await readPendingOperation(), retained);
});

async function authorization(publicKey, action, overrides = {}) {
  const original = challenge(publicKey), originalAction = { execute: 'a', reconcile: 'e', recover: 'f', prepare: 'd' }[action];
  const reviewed = { ...original, challengeId: originalAction.repeat(64), ...overrides,
    intent: { ...original.intent, action, ...(overrides.intent ?? {}) } };
  return { challenge: reviewed, signature: await signReviewedChallenge(reviewed, reviewed.origin) };
}

test('rejected reconcile/recover permissions preserve original UNKNOWN execution and cannot replace its terms', async () => {
  reset(); const publicKey = await createDeviceIdentity();
  const execute = await authorization(publicKey, 'execute');
  await retainPendingOperation({ authorization: execute, status: 'SUBMITTING' });
  await retainPendingOperation({ authorization: execute, status: 'UNKNOWN' });
  for (const action of ['reconcile', 'recover']) {
    const next = await authorization(publicKey, action);
    await retainPendingOperation({ authorization: next, status: 'SUBMITTING' });
    await retainPendingOperation({ authorization: next, status: 'REJECTED' });
  }
  const saved = await readPendingOperation();
  assert.equal(saved.economicState, 'UNRESOLVED');
  assert.equal(saved.status, 'REJECTED'); // latest permission only
  assert.deepEqual(saved.originalAuthorization, execute);
  assert.deepEqual(saved.authorizations.map(row => [row.authorization.challenge.intent.action, row.status]),
    [['execute', 'UNKNOWN'], ['reconcile', 'REJECTED'], ['recover', 'REJECTED']]);
  const before = store.get('lianum.pending.authorizations.v1');
  for (const intent of [{ requestId: 'replacement_request_0003' }, { amountAtomic: '26' },
    { recipient: '0x' + 'e'.repeat(40) }, { maxFeeAtomic: '2' }, { assetId: 'e'.repeat(64) },
    { kind: 'TOP_UP' }, { chain: 'base' }]) {
    const changed = await authorization(publicKey, 'prepare', { intent });
    assert.throws(() => assertPendingOperationIdentity(saved, changed.challenge), /ORIGINAL_OPERATION_REQUIRED/);
    await assert.rejects(retainPendingOperation({ authorization: changed, status: 'SUBMITTING' }), /ORIGINAL_OPERATION_REQUIRED/);
    assert.equal(store.get('lianum.pending.authorizations.v1'), before);
  }
  const movedOrigin = await authorization(publicKey, 'prepare', { origin: 'https://foreign.example' });
  await assert.rejects(retainPendingOperation({ authorization: movedOrigin, status: 'SUBMITTING' }), /ORIGINAL_OPERATION_REQUIRED/);
  const otherKey = signing.devicePublicKey(new Uint8Array(32).fill(12));
  assert.throws(() => assertPendingOperationIdentity(saved, { ...execute.challenge, ownerPublicKey: otherKey }), /ORIGINAL_OPERATION_REQUIRED/);
  assert.deepEqual(await readPendingOperation(), saved);
});

test('original per-action evidence survives concurrent updates and fresh challenges cannot resend that action', async () => {
  reset(); const publicKey = await createDeviceIdentity();
  const execute = await authorization(publicKey, 'execute'), reconcile = await authorization(publicKey, 'reconcile'),
    recover = await authorization(publicKey, 'recover');
  await retainPendingOperation({ authorization: execute, status: 'SUBMITTING' });
  await retainPendingOperation({ authorization: execute, status: 'UNKNOWN' });
  await Promise.all([retainPendingOperation({ authorization: reconcile, status: 'SUBMITTING' }),
    retainPendingOperation({ authorization: recover, status: 'SUBMITTING' })]);
  await Promise.all([retainPendingOperation({ authorization: reconcile, status: 'REJECTED' }),
    retainPendingOperation({ authorization: recover, status: 'REJECTED' })]);
  const saved = await readPendingOperation(), bytes = store.get('lianum.pending.authorizations.v1');
  assert.equal(saved.authorizations.length, 3); assert.deepEqual(saved.originalAuthorization, execute);
  assert.equal(saved.authorizations[0].status, 'UNKNOWN');
  const replacement = await authorization(publicKey, 'execute', { challengeId: '9'.repeat(64), nonce: '8'.repeat(64) });
  await assert.rejects(retainPendingOperation({ authorization: replacement, status: 'SUBMITTING' }), /ORIGINAL_AUTHORIZATION_REQUIRED/);
  await assert.rejects(retainPendingOperation({ authorization: execute, status: 'SUBMITTING' }), /AUTHORIZATION_STATE_CONFLICT/);
  await assert.rejects(retainPendingOperation({ authorization: reconcile, status: 'ACCEPTED' }), /AUTHORIZATION_STATE_CONFLICT/);
  assert.equal(store.get('lianum.pending.authorizations.v1'), bytes);
});

test('legacy REJECTED permissions remain economically unresolved without inventing earlier evidence', async () => {
  reset(); const publicKey = await createDeviceIdentity(), reconcile = await authorization(publicKey, 'reconcile');
  const legacy = JSON.stringify({ authorization: reconcile, status: 'REJECTED' });
  store.set('lianum.pending.authorizations.v1', legacy);
  const before = calls.length, saved = await readPendingOperation();
  assert.equal(saved.economicState, 'UNRESOLVED'); assert.equal(saved.legacyEvidenceIncomplete, true);
  assert.deepEqual(saved.originalAuthorization, reconcile); assert.equal(saved.authorizations.length, 1);
  assert.equal(calls.length, before + 1); assert.equal(store.get('lianum.pending.authorizations.v1'), legacy);
  const changed = await authorization(publicKey, 'prepare', { intent: { requestId: 'replacement_request_0003' } });
  await assert.rejects(retainPendingOperation({ authorization: changed, status: 'SUBMITTING' }), /ORIGINAL_OPERATION_REQUIRED/);
  const recover = await authorization(publicKey, 'recover');
  const next = await retainPendingOperation({ authorization: recover, status: 'SUBMITTING' });
  assert.equal(next.legacyEvidenceIncomplete, true); assert.deepEqual(next.originalAuthorization, reconcile);
  assert.deepEqual(next.authorizations[0], { authorization: reconcile, status: 'REJECTED' });
});

test('pending write readback and invalid economic markers fail before returning a dispatchable authorization', async () => {
  reset(); const publicKey = await createDeviceIdentity(), execute = await authorization(publicKey, 'execute');
  control.discardPendingWrite = true;
  await assert.rejects(retainPendingOperation({ authorization: execute, status: 'SUBMITTING' }), /PENDING_READBACK_FAILED/);
  assert.equal(await readPendingOperation(), null);
  control.discardPendingWrite = false;
  await retainPendingOperation({ authorization: execute, status: 'SUBMITTING' });
  const key = 'lianum.pending.authorizations.v1', original = store.get(key), altered = JSON.parse(original);
  altered.economicState = 'REJECTED'; store.set(key, JSON.stringify(altered));
  await assert.rejects(readPendingOperation(), /PENDING_STATE_INVALID/);
  store.set(key, original);
  assert.equal((await readPendingOperation()).economicState, 'UNRESOLVED');
});

test('fresh protected receipt signing preserves an expired original and updates only its permission admission', async () => {
  reset();
  const publicKey = await createDeviceIdentity(), execute = await authorization(publicKey, 'execute');
  await retainPendingOperation({ authorization: execute, status: 'SUBMITTING' });
  await retainPendingOperation({ authorization: execute, status: 'UNKNOWN' });
  const recover = await authorization(publicKey, 'recover');
  await retainPendingOperation({ authorization: recover, status: 'SUBMITTING' });
  await retainPendingOperation({ authorization: recover, status: 'REJECTED' });
  let clock = execute.challenge.expiresAt + 1;
  const time = mock.method(Date, 'now', () => clock);
  const review = { authorization: execute, nonce: '8'.repeat(64), expiresAt: clock + 60_000 };
  try {
    const signature = await signReviewedReceipt(review, execute.challenge.origin);
    const expectedKey = signing.privateKeyFromHex(store.get(PRIVATE));
    try { assert.equal(signature, signing.signDeviceMessage(expectedKey, mobileReceiptMessage(review))); }
    finally { expectedKey.fill(0); }
    const observed = await retainPendingOperation({ authorization: execute, status: 'ACCEPTED' });
    assert.equal(observed.economicState, 'UNRESOLVED'); assert.deepEqual(observed.originalAuthorization, execute);
    assert.deepEqual(observed.authorizations.map(row => row.status), ['ACCEPTED', 'REJECTED']);
    await assert.rejects(retainPendingOperation({ authorization: execute, status: 'UNKNOWN' }), /STATE_CONFLICT/);
    assert.deepEqual((await readPendingOperation()).authorizations.map(row => row.status), ['ACCEPTED', 'REJECTED']);
    control.slowRead = async () => { clock += 60_001; };
    await assert.rejects(signReviewedReceipt(review, execute.challenge.origin), /RECEIPT_EXPIRED/);
    assert.ok(privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
  } finally { time.mock.restore(); }
});
