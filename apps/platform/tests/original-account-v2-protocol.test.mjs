/** Pure framing and actual disconnected public HTTP only. A normalized review
 * has no account membership, signer, native execution or observation authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { startPlatformServer } from '../src/server.mjs';
import { MOBILE_AUTHORIZATION_PROFILE, normalizeMobileChallenge } from '../../../packages/mobile-protocol/src/authorization.mjs';
import { ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2, ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
  normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2, normalizeOriginalAccountSignatureV2,
  validateOriginalAccountFreshV2, originalAccountAccessMessageV2, originalAccountReviewMessageV2 }
  from '../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
const h = value => createHash('sha256').update('PUBLIC PROTOCOL CASE ' + value).digest('hex');
const keys = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }), jwk = keys.publicKey.export({ format: 'jwk' });
const devicePublicKey = '04' + Buffer.from(jwk.x, 'base64url').toString('hex') + Buffer.from(jwk.y, 'base64url').toString('hex');
const generic = () => ({ version: 2, profile: ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2, origin: 'https://private-actor.example',
  pairingId: h('pair'), challengeId: h('challenge'), nonce: h('nonce'), expiresAt: 61000, devicePublicKey, action: 'read' });
const binding = () => ({ accountIdentitySHA256: h('account'), originalAccountLifetime: h('lifetime'), generationId: h('generation'),
  requestId: 'original_request_identifier', kind: 'TOP_UP', ownerOperationRef: h('reference'), assetId: h('asset'),
  ownerIdentitySHA256: h('owner'), keyScopeSHA256: h('key scope'), processIdentitySHA256: h('process'),
  originalProcessGeneration: 1, observedProcessGeneration: 2, originalReviewSHA256: h('original'), termsSHA256: h('terms'),
  requestBindingSHA256: h('request binding'), assetBindingSHA256: h('asset binding'), journalRevision: 1,
  requestState: 'PREPARED', authorityStage: 'READY', submission: null,
  asset: { chainId: '31337', genesis: h('genesis'), pool: '12'.repeat(20), kind: 'NATIVE', token: '0'.repeat(40), symbol: 'ETH', decimals: 18 },
  amountAtomic: '100', recipient: '34'.repeat(20), role: null, custody: 'LINUX_ORIGINAL_OWNER_CUSTODY',
  publicNetwork: false, mobileNoteCustody: false, economicObservation: false });
const review = () => ({ ...generic(), profile: ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
  challengeId: h('review challenge'), nonce: h('review nonce'), bootstrapChallengeId: h('challenge'), binding: binding() });
test('V2 separates generic access from private review and from every V1 operation domain', () => {
  const access = normalizeOriginalAccountAccessV2(generic()), selected = normalizeOriginalAccountReviewV2(review());
  assert.equal('binding' in access, false); assert.equal(Object.isFrozen(selected.binding.asset), true);
  assert.notDeepEqual(originalAccountAccessMessageV2(access), originalAccountReviewMessageV2(selected));
  assert.throws(() => normalizeOriginalAccountAccessV2(selected), /EXACT_FIELDS/);
  assert.throws(() => normalizeMobileChallenge(access), /EXACT_FIELDS|PROFILE/);
  assert.throws(() => normalizeOriginalAccountAccessV2({ ...generic(), version: 1, profile: MOBILE_AUTHORIZATION_PROFILE }), /PROFILE/);
  const reversed = Object.fromEntries(Object.entries(review()).reverse());
  assert.deepEqual(originalAccountReviewMessageV2(reversed), originalAccountReviewMessageV2(selected));
  assert.ok(originalAccountReviewMessageV2(selected).length < 4096);
});
test('every original request/lifetime/generation/digest/nonce term changes the signed V2 bytes', () => {
  const selected = review(), original = originalAccountReviewMessageV2(selected);
  for (const name of ['accountIdentitySHA256', 'originalAccountLifetime', 'generationId', 'ownerOperationRef', 'assetId',
    'ownerIdentitySHA256', 'keyScopeSHA256', 'processIdentitySHA256', 'originalReviewSHA256', 'termsSHA256', 'requestBindingSHA256']) {
    const changed = structuredClone(selected); changed.binding[name] = h('changed ' + name);
    assert.notDeepEqual(originalAccountReviewMessageV2(changed), original);
  }
  assert.notDeepEqual(originalAccountReviewMessageV2({ ...selected, nonce: h('new nonce') }), original);
  const sig = sign('sha256', original, { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  assert.equal(verify('sha256', original, { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, sig), true);
  assert.equal(verify('sha256', originalAccountReviewMessageV2({ ...selected, nonce: h('new nonce') }),
    { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, sig), false);
});
test('unknown actions, malformed binding, generation regression, flags, accessors and oversized permissions reject', () => {
  for (const changed of [{ action: 'execute' }, { action: 'recover' }, { nonce: generic().challengeId }, { origin: 'http://127.0.0.1:8000' }])
    assert.throws(() => normalizeOriginalAccountAccessV2({ ...generic(), ...changed }));
  for (const changed of [{ kind: 'GRAPH' }, { observedProcessGeneration: 0 }, { amountAtomic: '00100' },
    { publicNetwork: true }, { economicObservation: true }, { requestState: 'SUBMITTING' }, { callback() {} }])
    assert.throws(() => normalizeOriginalAccountReviewV2({ ...review(), binding: { ...binding(), ...changed } }));
  const getters = review(); Object.defineProperty(getters, 'binding', { enumerable: true, get() { throw Error('SHOULD_NOT_READ'); } });
  assert.throws(() => normalizeOriginalAccountReviewV2(getters), /DATA_FIELDS/);
});
test('freshness and lowS P1363 normalization are bounded; reconciliation requires an original retained submission', () => {
  assert.equal(validateOriginalAccountFreshV2(normalizeOriginalAccountAccessV2(generic()), 1000).expiresAt, 61000);
  assert.throws(() => validateOriginalAccountFreshV2(normalizeOriginalAccountAccessV2(generic()), 61000), /EXPIRED/);
  assert.throws(() => validateOriginalAccountFreshV2(normalizeOriginalAccountAccessV2(generic()), 999), /EXPIRED/);
  assert.throws(() => normalizeOriginalAccountReviewV2({ ...review(), action: 'reconcile' }), /RECONCILE_NOT_STARTED/);
  for (const signature of ['0'.repeat(128), 'a'.repeat(128), '1'.repeat(127), '1'.repeat(128) + '\n'])
    assert.throws(() => normalizeOriginalAccountSignatureV2(signature));
  assert.equal(normalizeOriginalAccountSignatureV2('1'.padStart(64, '0') + '1'.padStart(64, '0')).length, 128);
});
test('public platform remains disconnected and exposes neither a portfolio nor a V2 actor route', async () => {
  const app = await startPlatformServer({ origin: generic().origin });
  const url = 'http://127.0.0.1:' + app.port;
  try {
    const state = await (await fetch(url + '/v1/mobile/state')).json();
    assert.equal(state.connection, 'DISCONNECTED'); assert.equal(state.privatePortfolio, null);
    assert.ok(Object.values(state.capabilities).every(value => value === false));
    const response = await fetch(url + '/v2/mobile/original-account-reviews', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(generic()) });
    assert.equal(response.status, 404);
  } finally { await app.close(); }
});
