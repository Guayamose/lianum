/** Actual portable device signatures and controlled UI/biometric/network waits.
 * No native funds, physical biometrics, original-account authority or balances. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2, ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
  originalAccountAccessMessageV2, originalAccountReviewMessageV2 }
  from '@lianum/mobile-protocol/original-account-v2';
import { createOriginalAccountLeaseV2 } from '../src/custody/original-account-lease-v2.mjs';
import { devicePublicKey, signDeviceMessage } from '../src/custody/signing.mjs';
const key = new Uint8Array(32).fill(11), device = devicePublicKey(key);
const pub = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
  x: Buffer.from(device.slice(2, 66), 'hex').toString('base64url'),
  y: Buffer.from(device.slice(66), 'hex').toString('base64url') } });
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve }; };
function fixture(action = 'read') {
  let clock = 1_000_000;
  const context = { origin: 'https://original.example', pairingId: '1'.repeat(64),
    devicePublicKey: device, action, foreground: true };
  const access = { version: 2, profile: ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2,
    origin: context.origin, pairingId: context.pairingId, devicePublicKey: device,
    action, challengeId: '2'.repeat(64), nonce: '3'.repeat(64), expiresAt: clock + 60_000 };
  const binding = { accountIdentitySHA256: '4'.repeat(64), originalAccountLifetime: '5'.repeat(64),
    generationId: '6'.repeat(64), requestId: 'original_request_0031', kind: 'TOP_UP',
    ownerOperationRef: '7'.repeat(64), assetId: '8'.repeat(64), ownerIdentitySHA256: '9'.repeat(64),
    keyScopeSHA256: 'a'.repeat(64), processIdentitySHA256: 'b'.repeat(64), originalProcessGeneration: 1,
    observedProcessGeneration: 2, originalReviewSHA256: 'c'.repeat(64), termsSHA256: 'd'.repeat(64),
    requestBindingSHA256: 'e'.repeat(64), assetBindingSHA256: 'f'.repeat(64), journalRevision: 10,
    requestState: 'UNKNOWN', authorityStage: 'UNKNOWN', submission: { transactionHash: 'a1'.repeat(32),
      calldataSHA256: 'b1'.repeat(32), dispatchLatched: true },
    asset: { chainId: '31337', genesis: 'c1'.repeat(32), pool: 'd1'.repeat(20), kind: 'NATIVE',
      token: '0'.repeat(40), symbol: 'ETH', decimals: 18 }, amountAtomic: '100',
    recipient: 'e1'.repeat(20), role: null, custody: 'LINUX_ORIGINAL_OWNER_CUSTODY',
    publicNetwork: false, mobileNoteCustody: false, economicObservation: false };
  const review = { ...access, profile: ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
    challengeId: '12'.repeat(32), nonce: '13'.repeat(32), bootstrapChallengeId: access.challengeId, binding };
  const controller = createOriginalAccountLeaseV2({ readContext: () => context, now: () => clock });
  const events = [];
  const open = { sign: async value => { events.push('access-sign');
    return signDeviceMessage(key, originalAccountAccessMessageV2(value)); },
  post: async request => { events.push('access-post');
    assert.equal(verify('sha256', originalAccountAccessMessageV2(request.challenge),
      { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(request.signature, 'hex')), true);
    assert.equal(verify('sha256', originalAccountReviewMessageV2(review),
      { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(request.signature, 'hex')), false);
    return review;
  } };
  const submit = { sign: async value => { events.push('review-sign');
    return signDeviceMessage(key, originalAccountReviewMessageV2(value)); },
  post: async request => { events.push('review-post');
    assert.equal(verify('sha256', originalAccountReviewMessageV2(request.review),
      { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(request.signature, 'hex')), true);
    return { privatePortfolio: null, economicObservation: null, nativeEffectsEstablished: false };
  } };
  return { controller, context, access, review, events, open, submit,
    lease: () => controller.finishAccess(controller.begin(), access).lease,
    advance: ms => { clock += ms; } };
}
test('two separate portable signature domains grant disclosure then the original request diagnostic once', async () => {
  for (const action of ['read', 'reconcile']) {
    const f = fixture(action), access = f.lease();
    assert.throws(() => JSON.stringify(access), /NOT_SERIALIZABLE/);
    const selected = await f.controller.openReview(access, f.open);
    assert.deepEqual(selected.value.binding, f.review.binding);
    assert.throws(() => JSON.stringify(selected.lease), /NOT_SERIALIZABLE/);
    assert.deepEqual(await f.controller.submit(selected.lease, f.submit),
      { privatePortfolio: null, economicObservation: null, nativeEffectsEstablished: false });
    await assert.rejects(f.controller.openReview(access, f.open), /REVIEW_INACTIVE/);
    await assert.rejects(f.controller.submit(selected.lease, f.submit), /REVIEW_INACTIVE/);
    assert.deepEqual(f.events, ['access-sign', 'access-post', 'review-sign', 'review-post']);
  }
});
test('a cancelled ticket or changed bootstrap cannot create or disclose a review', () => {
  const f = fixture(), ticket = f.controller.begin(); f.controller.invalidate();
  assert.throws(() => f.controller.finishAccess(ticket, f.access), /REVIEW_INACTIVE/);
  for (const field of ['origin', 'pairingId', 'devicePublicKey', 'action']) {
    const g = fixture(), t = g.controller.begin();
    g.context[field] = field === 'origin' ? 'https://foreign.example' : field === 'action' ? 'reconcile'
      : field === 'devicePublicKey' ? devicePublicKey(new Uint8Array(32).fill(12)) : 'a2'.repeat(32);
    assert.throws(() => g.controller.finishAccess(t, g.access), /REVIEW_CHANGED/);
    assert.deepEqual(g.events, []);
  }
});
test('cancel/background during either biometric wait prevents POST and a concurrent callback cannot sign twice', async () => {
  for (const stage of ['access', 'review']) {
    for (const reason of ['cancel', 'background']) {
      const f = fixture(), first = f.lease(), selected = stage === 'review'
        ? (await f.controller.openReview(first, f.open)).lease : first;
      const waiting = deferred(), entered = deferred(), callbacks = stage === 'review' ? f.submit : f.open;
      const before = f.events.length;
      const run = f.controller[stage === 'review' ? 'submit' : 'openReview'].bind(f.controller);
      const pending = run(selected, { ...callbacks, sign: async value => {
        entered.resolve(); await waiting.promise; return callbacks.sign(value);
      } });
      await entered.promise;
      await assert.rejects(run(selected, callbacks), /REVIEW_INACTIVE/);
      if (reason === 'cancel') f.controller.invalidate(); else f.context.foreground = false;
      waiting.resolve(); await assert.rejects(pending, /REVIEW_INACTIVE|REVIEW_STALE/);
      assert.equal(f.events.length, before + 1);
    }
  }
});
test('expiry and device/pair/origin/action substitutions after signing reject before any disclosure POST', async () => {
  for (const mutate of [f => f.advance(60_001), f => { f.context.origin = 'https://foreign.example'; },
    f => { f.context.devicePublicKey = devicePublicKey(new Uint8Array(32).fill(12)); },
    f => { f.context.pairingId = 'a2'.repeat(32); }, f => { f.context.action = 'reconcile'; }]) {
    const f = fixture(), lease = f.lease();
    await assert.rejects(f.controller.openReview(lease, { ...f.open, sign: async value => {
      const signature = await f.open.sign(value); mutate(f); return signature;
    } }), /REVIEW_CHANGED|ORIGINAL_EXPIRED/);
    assert.deepEqual(f.events, ['access-sign']);
  }
});
test('a review with a different bootstrap, action, device or pairing is never presented for second consent', async () => {
  for (const changes of [{ bootstrapChallengeId: '99'.repeat(32) }, { action: 'reconcile' },
    { devicePublicKey: devicePublicKey(new Uint8Array(32).fill(12)) }, { pairingId: '99'.repeat(32) }]) {
    const f = fixture();
    await assert.rejects(f.controller.openReview(f.lease(), { ...f.open,
      post: async () => ({ ...f.review, ...changes }) }), /REVIEW_CHANGED/);
    assert.deepEqual(f.events, ['access-sign']);
  }
});
test('a late or lost review reply consumes the first consent without allowing callback replay', async () => {
  for (const loss of [true, false]) {
    const f = fixture(), lease = f.lease();
    await assert.rejects(f.controller.openReview(lease, { ...f.open, post: async () => {
      f.events.push('access-post'); if (loss) throw Error('LOST_REPLY');
      f.controller.invalidate(); return f.review;
    } }), /LOST_REPLY|REVIEW_CHANGED/);
    await assert.rejects(f.controller.openReview(lease, f.open), /REVIEW_INACTIVE/);
    assert.deepEqual(f.events, ['access-sign', 'access-post']);
  }
});
test('lost reconcile diagnostic cannot repeat a consumed permission or resolve a retained economic outbox', async () => {
  const f = fixture('reconcile'), selected = await f.controller.openReview(f.lease(), f.open);
  const economicOutbox = { requestId: f.review.binding.requestId, economicState: 'UNRESOLVED' };
  const before = structuredClone(economicOutbox);
  await assert.rejects(f.controller.submit(selected.lease, { ...f.submit, post: async () => {
    f.events.push('review-post'); throw Error('LOST_AFTER_ORIGINAL_ADMISSION');
  } }), /LOST_AFTER_ORIGINAL_ADMISSION/);
  await assert.rejects(f.controller.submit(selected.lease, f.submit), /REVIEW_INACTIVE/);
  assert.deepEqual(economicOutbox, before);
  assert.deepEqual(f.events, ['access-sign', 'access-post', 'review-sign', 'review-post']);
});
test('leaving foreground while the second POST waits discards its stale response without a second signature or POST', async () => {
  const f = fixture(), selected = await f.controller.openReview(f.lease(), f.open), waiting = deferred(), entered = deferred();
  const pending = f.controller.submit(selected.lease, { ...f.submit, post: async () => {
    f.events.push('review-post'); entered.resolve(); await waiting.promise; return { privatePortfolio: null };
  } });
  await entered.promise; f.context.foreground = false; f.controller.invalidate(); waiting.resolve();
  await assert.rejects(pending, /REVIEW_CHANGED/);
  await assert.rejects(f.controller.submit(selected.lease, f.submit), /REVIEW_INACTIVE/);
  assert.deepEqual(f.events, ['access-sign', 'access-post', 'review-sign', 'review-post']);
});
