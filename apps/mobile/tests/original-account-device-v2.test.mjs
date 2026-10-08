/** Expo hardware/storage remain explicit doubles. Real protected-key
 * orchestration, portable lowS signatures and Node verification run here. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2, ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
  originalAccountAccessMessageV2, originalAccountReviewMessageV2 }
  from '@lianum/mobile-protocol/original-account-v2';
import * as signing from '../src/custody/signing.mjs';
const PRIVATE = 'lianum.owner.secp256k1.v1', PUBLIC = 'lianum.owner.public.v1';
const secret = '0b'.repeat(32), device = signing.devicePublicKey(new Uint8Array(32).fill(11));
const store = new Map(), privateBuffers = [], calls = [];
const control = { slowRead: null, invalidate: false, supported: true };
mock.module('expo-secure-store', { exports: {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6, isAvailableAsync: async () => control.supported,
  canUseBiometricAuthentication: () => control.supported,
  async getItemAsync(name, options) {
    calls.push({ name, options });
    if (name === PRIVATE) {
      assert.equal(options.requireAuthentication, true); assert.equal(options.keychainAccessible, 6);
      if (control.slowRead) await control.slowRead();
      if (control.invalidate) return null;
    }
    return store.get(name) ?? null;
  },
  async setItemAsync() { assert.fail('V2 diagnostic signing must not replace a stored key or persist an operation'); },
} });
mock.module('expo-local-authentication', { exports: {
  hasHardwareAsync: async () => control.supported, isEnrolledAsync: async () => control.supported,
  authenticateAsync: async () => { assert.fail('Protected read supplies authentication; no key is generated here'); },
} });
mock.module('expo-crypto', { exports: { getRandomBytesAsync: async () => { assert.fail('No new entropy/identity'); } } });
mock.module('react-native', { exports: { Platform: { OS: 'android' } } });
mock.module(new URL('../src/custody/signing.mjs', import.meta.url).href, { exports: { ...signing,
  privateKeyFromHex(value) { const bytes = signing.privateKeyFromHex(value); privateBuffers.push(bytes); return bytes; },
} });
const { signOriginalAccountAccessV2, signOriginalAccountReviewV2 } = await import('../src/custody/key-store.ts');
const pub = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
  x: Buffer.from(device.slice(2, 66), 'hex').toString('base64url'),
  y: Buffer.from(device.slice(66), 'hex').toString('base64url') } });
function fixture() {
  store.clear(); store.set(PRIVATE, secret); store.set(PUBLIC, device);
  calls.length = 0; privateBuffers.length = 0;
  Object.assign(control, { slowRead: null, invalidate: false, supported: true });
  const access = { version: 2, profile: ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2, origin: 'https://original.example',
    pairingId: '1'.repeat(64), challengeId: '2'.repeat(64), nonce: '3'.repeat(64),
    expiresAt: Date.now() + 60_000, devicePublicKey: device, action: 'read' };
  const binding = { accountIdentitySHA256: '4'.repeat(64), originalAccountLifetime: '5'.repeat(64),
    generationId: '6'.repeat(64), requestId: 'original_request_0041', kind: 'TOP_UP', ownerOperationRef: '7'.repeat(64),
    assetId: '8'.repeat(64), ownerIdentitySHA256: '9'.repeat(64), keyScopeSHA256: 'a'.repeat(64),
    processIdentitySHA256: 'b'.repeat(64), originalProcessGeneration: 1, observedProcessGeneration: 1,
    originalReviewSHA256: 'c'.repeat(64), termsSHA256: 'd'.repeat(64), requestBindingSHA256: 'e'.repeat(64),
    assetBindingSHA256: 'f'.repeat(64), journalRevision: 1, requestState: 'PREPARED', authorityStage: 'READY',
    submission: null, asset: { chainId: '31337', genesis: 'a1'.repeat(32), pool: 'b1'.repeat(20),
      kind: 'NATIVE', token: '0'.repeat(40), symbol: 'ETH', decimals: 18 }, amountAtomic: '100',
    recipient: 'c1'.repeat(20), role: null, custody: 'LINUX_ORIGINAL_OWNER_CUSTODY', publicNetwork: false,
    mobileNoteCustody: false, economicObservation: false };
  const review = { ...access, profile: ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
    challengeId: 'd1'.repeat(32), nonce: 'e1'.repeat(32), bootstrapChallengeId: access.challengeId, binding };
  return { access, review };
}
test('both original-account domains use the retained protected key, distinct consent prompts and clear their buffers', async () => {
  const f = fixture();
  const first = await signOriginalAccountAccessV2(f.access, f.access.origin, f.access.pairingId);
  const second = await signOriginalAccountReviewV2(f.review, f.review.origin, f.review.pairingId);
  const valid = (message, signature) => verify('sha256', message, { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex'));
  assert.equal(valid(originalAccountAccessMessageV2(f.access), first), true);
  assert.equal(valid(originalAccountReviewMessageV2(f.review), second), true);
  assert.equal(valid(originalAccountAccessMessageV2(f.access), second), false);
  assert.equal(valid(originalAccountReviewMessageV2(f.review), first), false);
  const reads = calls.filter(row => row.name === PRIVATE);
  assert.equal(reads.length, 2); assert.notEqual(reads[0].options.authenticationPrompt, reads[1].options.authenticationPrompt);
  assert.ok(privateBuffers.length === 2 && privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
  assert.equal(store.get(PRIVATE), secret);
});
test('wrong origin/pair/device or domain and inaccessible custody reject without replacing any identity', async () => {
  for (const [normalizer, field] of [[signOriginalAccountAccessV2, 'access'], [signOriginalAccountReviewV2, 'review']]) {
    const f = fixture(), value = f[field];
    for (const args of [[value, 'https://foreign.example', value.pairingId],
      [value, value.origin, '99'.repeat(32)],
      [{ ...value, devicePublicKey: signing.devicePublicKey(new Uint8Array(32).fill(12)) }, value.origin, value.pairingId]]) {
      await assert.rejects(normalizer(...args), /REVIEW_CHANGED/);
    }
    assert.equal(calls.some(row => row.name === PRIVATE), false);
    await assert.rejects(normalizer(f[field === 'access' ? 'review' : 'access'], value.origin, value.pairingId), /EXACT_FIELDS|PROFILE/);
    control.invalidate = true;
    await assert.rejects(normalizer(value, value.origin, value.pairingId), /KEY_RECOVERY_REQUIRED/);
    assert.equal(store.get(PRIVATE), secret);
  }
});
test('expiry or public/private identity substitution during protected read rejects before signing and wipes mutable buffers', async () => {
  for (const kind of ['expiry', 'public', 'private']) {
    const time = mock.method(Date, 'now', () => 1_000_000);
    const f = fixture();
    control.slowRead = async () => {
      if (kind === 'expiry') time.mock.mockImplementation(() => 1_060_001);
      if (kind === 'public') store.set(PUBLIC, signing.devicePublicKey(new Uint8Array(32).fill(12)));
      if (kind === 'private') store.set(PRIVATE, '0c'.repeat(32));
    };
    try { await assert.rejects(signOriginalAccountReviewV2(f.review, f.review.origin, f.review.pairingId),
      kind === 'expiry' ? /ORIGINAL_EXPIRED/ : /KEY_BINDING_CHANGED/); }
    finally { time.mock.restore(); }
    assert.ok(privateBuffers.length === 1 && privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
  }
});
