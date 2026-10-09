import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateAuthorizationRecordCodecV1 } from '../src/private-authorization-record-v1.mjs';
import { authorizationKey, operationTerms } from '../src/authorization-store.mjs';
import { TEST_PLATFORM_PRIVACY_KEY } from './helpers/privacy-key-v1.mjs';
const challenge = {
  version: 1, profile: 'LIANUM_MOBILE_AUTHORIZATION_V1', origin: 'https://wallet.example.test',
  challengeId: 'a1'.repeat(32), nonce: 'b2'.repeat(32), expiresAt: 1_060_000,
  ownerPublicKey: '04' + 'ab'.repeat(64), intent: {
    requestId: 'original_request_0001', action: 'prepare', kind: 'EXIT', chain: 'ethereum',
    assetId: 'cd'.repeat(32), amountAtomic: '731927', recipient: '0x' + 'ef'.repeat(20), maxFeeAtomic: '17',
  },
};
const unknown = { status: 'UNKNOWN', requestId: challenge.intent.requestId, operationState: 'UNKNOWN', retryAllowed: false };
const codec = () => createPrivateAuthorizationRecordCodecV1(TEST_PLATFORM_PRIVACY_KEY);

test('SQL commitments omit identity and economic terms and bind every original field across reload', () => {
  const first = codec(), reopened = codec();
  const record = first.challenge(challenge), identity = first.operation(challenge), response = first.response(unknown);
  const encoded = JSON.stringify({ record, identity, response, terms: first.terms(challenge) });
  for (const disclosed of [challenge.ownerPublicKey, challenge.intent.requestId, challenge.intent.assetId,
    challenge.intent.amountAtomic, challenge.intent.recipient, challenge.intent.chain]) assert.equal(encoded.includes(disclosed), false);
  assert.equal(reopened.matchesChallenge(record, challenge), true);
  assert.deepEqual(reopened.readResponse(response, challenge), unknown);
  for (const mutate of [value => { value.nonce = '00'.repeat(32); }, value => { value.expiresAt++; },
    value => { value.ownerPublicKey = '04' + '01'.repeat(64); }, value => { value.intent.amountAtomic = '731928'; },
    value => { value.intent.recipient = 'other'; }, value => { value.intent.action = 'execute'; }]) {
    const altered = structuredClone(challenge); mutate(altered);
    assert.equal(reopened.matchesChallenge(record, altered), false);
  }
  assert.equal(reopened.matchesChallenge({ ...record, privateKey: 'forbidden' }, challenge), false);
});

test('one operation keeps its terms across actions without stable SQL identity across requests or keys', () => {
  const first = codec();
  const execute = { ...challenge, intent: { ...challenge.intent, action: 'execute' } };
  assert.deepEqual(first.operation(execute), first.operation(challenge));
  assert.equal(first.terms(execute), first.terms(challenge));
  assert.equal(first.matchesTerms(first.terms(challenge), execute), true);
  assert.notEqual(authorizationKey(execute), authorizationKey(challenge));
  const changed = { ...execute, intent: { ...execute.intent, amountAtomic: '731928' } };
  assert.equal(first.matchesTerms(first.terms(challenge), changed), false);
  const other = { ...challenge, intent: { ...challenge.intent, requestId: 'original_request_0002' } };
  assert.notEqual(first.operation(other).owner, first.operation(challenge).owner);
  const replacedKey = createPrivateAuthorizationRecordCodecV1('7c'.repeat(32));
  assert.notEqual(replacedKey.keyPin, first.keyPin);
  assert.equal(replacedKey.matchesChallenge(first.challenge(challenge), challenge), false);
  assert.equal(replacedKey.matchesTerms(first.terms(challenge), challenge), false);
  assert.throws(() => createPrivateAuthorizationRecordCodecV1(), { code: 'MOBILE_PRIVACY_KEY_REQUIRED' });
  first.close(); assert.throws(() => first.terms(challenge), { code: 'MOBILE_PRIVATE_RECORD_INVALID' });
});

test('historical UNKNOWN is readable with its exact lineage and cannot become payment or retry authority', () => {
  const current = codec();
  assert.equal(current.matchesChallenge(challenge, structuredClone(challenge)), true);
  assert.equal(current.matchesTerms(operationTerms(challenge), challenge), true);
  assert.deepEqual(current.readResponse(unknown, challenge), unknown);
  assert.throws(() => current.readResponse({ ...unknown, requestId: 'original_request_0002' }, challenge));
  assert.throws(() => current.response({ ...unknown, retryAllowed: true }));
  assert.throws(() => current.response({ ...unknown, operationState: 'PAID' }));
  assert.throws(() => current.response({ ...unknown, availableBalance: '731927' }));
});
