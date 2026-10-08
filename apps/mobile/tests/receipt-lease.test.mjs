/** Real off-chain signatures; controlled biometric/HTTP waits. This does not
 * establish device hardware protection, chain effects or financial recovery. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicKey, verify } from 'node:crypto';
import { MOBILE_AUTHORIZATION_PROFILE, mobileAuthorizationMessage, mobileReceiptMessage } from '@lianum/mobile-protocol';
import { createMobileReceiptLease } from '../src/custody/receipt-lease.mjs';
import { devicePublicKey, signDeviceMessage } from '../src/custody/signing.mjs';

const key = new Uint8Array(32).fill(11), owner = devicePublicKey(key);
const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
  x: Buffer.from(owner.slice(2, 66), 'hex').toString('base64url'), y: Buffer.from(owner.slice(66), 'hex').toString('base64url') } });
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) }; };
function fixture() {
  let clock = 1_000_000;
  const challenge = { version: 1, profile: MOBILE_AUTHORIZATION_PROFILE, origin: 'https://wallet.example',
    challengeId: 'a'.repeat(64), nonce: 'b'.repeat(64), expiresAt: clock - 10_000, ownerPublicKey: owner,
    intent: { requestId: 'original_request_0010', action: 'execute', kind: 'EXIT', chain: 'ethereum',
      assetId: 'c'.repeat(64), amountAtomic: '25', recipient: '0x' + 'd'.repeat(40), maxFeeAtomic: '1' } };
  const authorization = { challenge, signature: signDeviceMessage(key, mobileAuthorizationMessage(challenge)) };
  const context = { origin: challenge.origin, ownerPublicKey: owner, authorization, foreground: true };
  const review = { authorization, nonce: 'e'.repeat(64), expiresAt: clock + 60_000 };
  const controller = createMobileReceiptLease({ readContext: () => context, now: () => clock });
  const events = [];
  const callbacks = {
    sign: async value => { events.push('sign'); return signDeviceMessage(key, mobileReceiptMessage(value)); },
    post: async request => {
      events.push('post'); assert.deepEqual(request.authorization, authorization);
      assert.equal(verify('sha256', mobileReceiptMessage(review), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(request.signature, 'hex')), true);
      assert.equal(verify('sha256', mobileAuthorizationMessage(challenge), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(request.signature, 'hex')), false);
      return { status: 'UNKNOWN', requestId: challenge.intent.requestId, operationState: 'UNKNOWN', retryAllowed: false };
    },
    retain: async (original, result) => { events.push('retain'); assert.deepEqual(original, authorization); assert.equal(result.operationState, 'UNKNOWN'); },
  };
  return { controller, context, review, events, callbacks,
    lease: () => controller.finish(controller.begin(), review).lease, advance: milliseconds => { clock += milliseconds; } };
}
test('a fresh receipt lease reads an expired original once with a distinct signature domain', async () => {
  const f = fixture(), lease = f.lease();
  assert.throws(() => JSON.stringify(lease), /NOT_SERIALIZABLE/);
  await f.controller.query(lease, f.callbacks);
  assert.deepEqual(f.events, ['sign', 'post', 'retain']);
  await assert.rejects(f.controller.query(lease, f.callbacks), /REVIEW_INACTIVE/);
  assert.deepEqual(f.events, ['sign', 'post', 'retain']);
});
test('cancel, refresh, background and another review revoke captured receipt callbacks and tickets', async () => {
  for (const reason of ['cancel', 'refresh', 'background', 'new-review']) {
    const f = fixture(), lease = f.lease();
    if (reason === 'background') f.context.foreground = false;
    if (reason === 'new-review') f.controller.begin(); else f.controller.invalidate();
    await assert.rejects(f.controller.query(lease, f.callbacks), /REVIEW_INACTIVE/);
    assert.deepEqual(f.events, []);
  }
  const f = fixture(), ticket = f.controller.begin(); f.controller.invalidate();
  assert.throws(() => f.controller.finish(ticket, f.review), /REVIEW_INACTIVE/);
});
test('revocation during biometrics prevents the read POST; concurrent Alert cannot sign twice', async () => {
  const f = fixture(), lease = f.lease(), signing = deferred();
  const first = f.controller.query(lease, { ...f.callbacks,
    sign: async review => { f.events.push('sign'); await signing.promise; return signDeviceMessage(key, mobileReceiptMessage(review)); } });
  await assert.rejects(f.controller.query(lease, f.callbacks), /REVIEW_INACTIVE/);
  f.controller.invalidate(); signing.resolve();
  await assert.rejects(first, /REVIEW_INACTIVE/);
  assert.deepEqual(f.events, ['sign']);
});
test('receipt identity, origin, original nonce/terms and foreground are checked after biometrics', async () => {
  for (const mutate of [f => { f.context.origin = 'https://foreign.example'; },
    f => { f.context.ownerPublicKey = devicePublicKey(new Uint8Array(32).fill(12)); }, f => { f.context.foreground = false; },
    f => { f.context.authorization = { ...f.context.authorization, challenge: { ...f.context.authorization.challenge, nonce: 'f'.repeat(64) } }; },
    f => { f.context.authorization = { ...f.context.authorization, challenge: { ...f.context.authorization.challenge,
      intent: { ...f.context.authorization.challenge.intent, amountAtomic: '26' } } }; }, f => { f.advance(60_001); }]) {
    const f = fixture(), lease = f.lease(), signing = deferred();
    const first = f.controller.query(lease, { ...f.callbacks,
      sign: async review => { f.events.push('sign'); await signing.promise; return signDeviceMessage(key, mobileReceiptMessage(review)); } });
    mutate(f); signing.resolve(); await assert.rejects(first);
    assert.deepEqual(f.events, ['sign']);
  }
});
test('background or cancelled network reads preserve the outbox and cannot reuse their consent', async () => {
  for (const lost of [false, true]) {
    const f = fixture(), lease = f.lease(), posting = deferred(), entered = deferred();
    const first = f.controller.query(lease, { ...f.callbacks, post: async () => {
      f.events.push('post'); entered.resolve(); await posting.promise;
      if (lost) throw Error('CONTROLLED_MISSING_ORIGINAL');
      return { status: 'UNKNOWN', operationState: 'UNKNOWN' };
    } });
    await entered.promise;
    if (!lost) { f.context.foreground = false; f.controller.invalidate(); }
    posting.resolve(); await assert.rejects(first);
    assert.deepEqual(f.events, ['sign', 'post']);
    await assert.rejects(f.controller.query(lease, f.callbacks), /REVIEW_INACTIVE/);
  }
});

test('revocation during protected receipt retention preserves evidence and never enables another query', async () => {
  const f = fixture(), lease = f.lease(), retention = deferred(), entered = deferred();
  let retained;
  const first = f.controller.query(lease, { ...f.callbacks, retain: async (authorization, receipt) => {
    f.events.push('retain'); retained = { authorization, receipt }; entered.resolve(); await retention.promise;
  } });
  await entered.promise; f.controller.invalidate(); retention.resolve();
  await assert.rejects(first, /REVIEW_CHANGED/);
  assert.deepEqual(f.events, ['sign', 'post', 'retain']);
  assert.deepEqual(retained.authorization, f.review.authorization);
  assert.equal(retained.receipt.operationState, 'UNKNOWN');
  await assert.rejects(f.controller.query(lease, f.callbacks), /REVIEW_INACTIVE/);
});
