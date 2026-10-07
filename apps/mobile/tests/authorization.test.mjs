import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { signature as originalSignature, ownerFrame } from '../../../packages/engine/src/notes/private-note-encoding.mjs';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { mobileAuthorizationMessage, normalizeMobileAuthorization, normalizeMobileIntent,
  normalizeMobileOrigin, validateMobileChallenge, MOBILE_AUTHORIZATION_PROFILE, MOBILE_CHALLENGE_TTL_MS } from '@lianum/mobile-protocol';
import { devicePublicKey, privateKeyFromHex, signDeviceMessage } from '../src/custody/signing.mjs';

const secretHex = '07'.repeat(32); // Explicit test-only key; never a wallet backup.
const key = privateKeyFromHex(secretHex), publicKey = devicePublicKey(key);
const publicJwk = { kty: 'EC', crv: 'secp256k1',
  x: Buffer.from(publicKey.slice(2, 66), 'hex').toString('base64url'),
  y: Buffer.from(publicKey.slice(66), 'hex').toString('base64url') };
const publicObject = createPublicKey({ key: publicJwk, format: 'jwk' });
const intent = () => ({ requestId: 'original_request_0001', action: 'execute', kind: 'EXIT', chain: 'ethereum',
  assetId: 'a'.repeat(64), amountAtomic: '9007199254740993', recipient: '0x' + 'b'.repeat(40), maxFeeAtomic: '2' });
const challenge = (now = 1_000_000) => ({ version: 1, profile: MOBILE_AUTHORIZATION_PROFILE,
  origin: 'https://wallet.example', challengeId: 'c'.repeat(64), nonce: 'd'.repeat(64),
  expiresAt: now + MOBILE_CHALLENGE_TTL_MS, ownerPublicKey: publicKey, intent: intent() });

test('device secp256k1 signatures verify with original Node SHA256/P1363 and owner framing', () => {
  const frame = ownerFrame(Buffer.alloc(32, 1), Buffer.alloc(32, 2), Buffer.alloc(32, 3));
  const signed = signDeviceMessage(key, frame);
  assert.equal(signed.length, 128);
  assert.equal(verify('sha256', frame, { key: publicObject, dsaEncoding: 'ieee-p1363' }, Buffer.from(signed, 'hex')), true);
  const privateObject = createPrivateKey({ format: 'jwk', key: { ...publicJwk,
    d: Buffer.from(secretHex, 'hex').toString('base64url') } });
  const original = originalSignature({ privateKey: privateObject, publicKey: publicObject }, frame);
  assert.equal(secp256k1.verify(original, frame, Buffer.from(publicKey, 'hex'), { prehash: true, lowS: true }), true);
  assert.equal(secp256k1.verify(Buffer.from(signed, 'hex'), Buffer.concat([frame, Buffer.from([0])]),
    Buffer.from(publicKey, 'hex'), { prehash: true, lowS: true }), false);
});

test('every permission field is bound to the canonical message and lowS signature', () => {
  const original = challenge(), message = mobileAuthorizationMessage(original);
  const signed = signDeviceMessage(key, message);
  assert.deepEqual(normalizeMobileAuthorization({ challenge: original, signature: signed }), { challenge: original, signature: signed });
  for (const mutate of [
    value => { value.origin = 'https://other.example'; }, value => { value.challengeId = 'e'.repeat(64); },
    value => { value.nonce = 'e'.repeat(64); }, value => { value.expiresAt++; },
    value => { value.ownerPublicKey = devicePublicKey(privateKeyFromHex('08'.repeat(32))); },
    value => { value.intent.requestId = 'replacement_request_0001'; }, value => { value.intent.action = 'recover'; },
    value => { value.intent.kind = 'TOP_UP'; }, value => { value.intent.chain = 'base'; },
    value => { value.intent.assetId = 'e'.repeat(64); }, value => { value.intent.amountAtomic = '1'; },
    value => { value.intent.recipient = '0x' + 'e'.repeat(40); }, value => { value.intent.maxFeeAtomic = '3'; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    assert.equal(verify('sha256', mobileAuthorizationMessage(changed), { key: publicObject, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signed, 'hex')), false);
  }
  const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const highS = signed.slice(0, 64) + (order - BigInt('0x' + signed.slice(64))).toString(16).padStart(64, '0');
  assert.throws(() => normalizeMobileAuthorization({ challenge: original, signature: highS }), /NONCANONICAL/);
  assert.throws(() => normalizeMobileAuthorization({ challenge: original, signature: '0'.repeat(128) }), /NONCANONICAL/);
  const reverse = Object.fromEntries(Object.entries(original).reverse());
  reverse.intent = Object.fromEntries(Object.entries(original.intent).reverse());
  assert.deepEqual(mobileAuthorizationMessage(reverse), message);
});

test('permissions reject stale, substituted, oversized, unbounded and accessor inputs', () => {
  const now = 1_000_000, original = challenge(now);
  assert.deepEqual(validateMobileChallenge(original, { origin: original.origin, ownerPublicKey: publicKey, now }), original);
  assert.throws(() => validateMobileChallenge(original, { origin: 'https://other.example', ownerPublicKey: publicKey, now }), /ORIGIN_BINDING/);
  assert.throws(() => validateMobileChallenge(original, { origin: original.origin, ownerPublicKey: '04' + '0'.repeat(128), now }), /OWNER_BINDING/);
  for (const expiresAt of [now, now - 1, now + MOBILE_CHALLENGE_TTL_MS + 1])
    assert.throws(() => validateMobileChallenge({ ...original, expiresAt }, { origin: original.origin, ownerPublicKey: publicKey, now }), /EXPIRED/);
  for (const changed of [{ ...intent(), action: 'signAnything' }, { ...intent(), rootKey: secretHex },
    { ...intent(), amountAtomic: '00' }, { ...intent(), amountAtomic: '0' }, { ...intent(), amountAtomic: (1n << 64n).toString() },
    { ...intent(), maxFeeAtomic: '-1' }, { ...intent(), recipient: 'a'.repeat(129) }, { ...intent(), requestId: 'short' },
    { ...intent(), chain: 'arbitrary-rpc' }]) assert.throws(() => normalizeMobileIntent(changed));
  let invoked = false;
  assert.throws(() => normalizeMobileIntent({ ...intent(), get recipient() { invoked = true; throw new Error(secretHex); } }), /DATA_FIELDS/);
  assert.equal(invoked, false);
  for (const value of ['http://evil.example', 'https://wallet.example/', 'https://wallet.example/path',
    'https://secret@wallet.example', 'https://wallet.example?query=1', 'https://wallet.example#fragment', 'https://wallet.example\n'])
    assert.throws(() => normalizeMobileOrigin(value), /ORIGIN_INVALID/);
  assert.throws(() => normalizeMobileOrigin('http://127.0.0.1:8080'), /ORIGIN_INVALID/);
  assert.equal(normalizeMobileOrigin('http://127.0.0.1:8080', { allowInsecureLocalhost: true }), 'http://127.0.0.1:8080');
  assert.throws(() => normalizeMobileOrigin('http://192.168.1.20:8080', { allowInsecureLocalhost: true }), /ORIGIN_INVALID/);
  for (const value of ['0'.repeat(64), 'f'.repeat(64), 'AB'.repeat(32), secretHex + '\n'])
    assert.throws(() => privateKeyFromHex(value), /KEY_INVALID/);
});
