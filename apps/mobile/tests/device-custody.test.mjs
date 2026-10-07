/** Expo/native boundaries are explicit test doubles. These tests exercise the
 * real key-store orchestration and signatures; they do not prove device
 * biometrics, hardware isolation, mobile fund recovery or native acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { MOBILE_AUTHORIZATION_PROFILE } from '@lianum/mobile-protocol';
import * as signing from '../src/custody/signing.mjs';

const store = new Map(), calls = [], privateBuffers = [];
const control = { supported: true, approval: true, randomness: 0, invalidatePrivate: false, slowRead: null };
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
const { createDeviceIdentity, readDevicePublicKey, signReviewedChallenge } = await import('../src/custody/key-store.ts');
const { retainPendingOperation, readPendingOperation } = await import('../src/custody/pending-operations.ts');
function reset() {
  store.clear(); calls.length = 0; privateBuffers.length = 0;
  Object.assign(control, { supported: true, approval: true, randomness: 0, invalidatePrivate: false, slowRead: null });
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
  await retainPendingOperation(operation);
  const reads = calls.length;
  assert.deepEqual(await readPendingOperation(), operation);
  assert.equal(control.randomness, 1); assert.equal(calls.length, reads + 1);
  assert.ok(calls.filter(call => call.key.includes('pending')).every(call => call.options.requireAuthentication === true));
  const changed = { ...original, intent: { ...original.intent, requestId: 'replacement_request_0003' } };
  await assert.rejects(retainPendingOperation({ authorization: { challenge: changed,
    signature: await signReviewedChallenge(changed, changed.origin) }, status: 'SUBMITTING' }), /ORIGINAL_OPERATION_REQUIRED/);
  assert.deepEqual(await readPendingOperation(), operation);
});
