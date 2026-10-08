import test from 'node:test';
import assert from 'node:assert/strict';
import { MOBILE_AUTHORIZATION_PROFILE, MOBILE_AUTHORIZATION_RECEIPT_PROFILE, mobileReceiptMessage } from '@lianum/mobile-protocol';
import { createMobileApi, normalizeMobileState } from '../src/api/wallet-api.mjs';
import { privateKeyFromHex, devicePublicKey, signDeviceMessage } from '../src/custody/signing.mjs';
import { mobileAuthorizationMessage } from '@lianum/mobile-protocol';
const origin = 'https://wallet.example', secretHex = '09'.repeat(32), key = privateKeyFromHex(secretHex), ownerPublicKey = devicePublicKey(key);
const intent = { requestId: 'original_request_0002', action: 'execute', kind: 'EXIT', chain: 'ethereum',
  assetId: 'a'.repeat(64), amountAtomic: '25', recipient: '0x' + 'b'.repeat(40), maxFeeAtomic: '1' };
const challenge = () => ({ version: 1, profile: MOBILE_AUTHORIZATION_PROFILE, origin,
  challengeId: 'c'.repeat(64), nonce: 'd'.repeat(64), expiresAt: Date.now() + 60_000, ownerPublicKey, intent });
const disconnected = () => ({ version: 1, connection: 'DISCONNECTED', privatePortfolio: null,
  capabilities: { prepare: false, execute: false, reconcile: false, recover: false }, notice: 'Sin ejecutor conectado.' });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('native client sends public bounded permissions only and treats admission independently of settlement', async () => {
  const calls = [], original = challenge();
  const api = createMobileApi({ origin, async fetchImpl(url, options) {
    calls.push({ url, options });
    if (url.endsWith('/state')) return reply(disconnected());
    if (url.endsWith('/challenges')) return reply({ challenge: original });
    return reply({ status: 'ACCEPTED', requestId: intent.requestId, operationState: 'ADMITTED', retryAllowed: false });
  } });
  assert.equal(calls.length, 0);
  const state = await api.state(); assert.equal(state.privatePortfolio, null); assert.equal(state.connection, 'DISCONNECTED');
  assert.deepEqual(await api.challenge(ownerPublicKey, intent), original);
  const signature = signDeviceMessage(key, mobileAuthorizationMessage(original));
  const result = await api.submit({ challenge: original, signature });
  assert.deepEqual(result, { status: 'ACCEPTED', requestId: intent.requestId, operationState: 'ADMITTED', retryAllowed: false });
  assert.deepEqual(calls.map(call => call.url), ['/state', '/challenges', '/authorizations'].map(path => origin + '/v1/mobile' + path));
  assert.deepEqual(JSON.parse(calls[1].options.body), { ownerPublicKey, intent });
  assert.deepEqual(JSON.parse(calls[2].options.body), { challenge: original, signature });
  assert.equal(JSON.stringify(calls).includes(secretHex), false);
  for (const { options } of calls) { assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); }
  assert.equal(calls.length, 3);
});

test('lost, misleading and rejected HTTP replies preserve UNKNOWN and never automatically resend', async () => {
  for (const respond of [
    () => { throw new Error('raw transport secret'); }, () => reply({ error: 'private internal failure' }, 503),
    () => reply({ status: 'ACCEPTED', requestId: 'replacement_request_0002', operationState: 'ADMITTED', retryAllowed: false }),
    () => reply({ status: 'ACCEPTED', requestId: intent.requestId, operationState: 'CONFIRMED', retryAllowed: false }),
    () => reply({ status: 'ACCEPTED', requestId: intent.requestId, operationState: 'ADMITTED', retryAllowed: true }),
  ]) {
    let calls = 0;
    const api = createMobileApi({ origin, async fetchImpl() { calls++; return respond(); } });
    const original = challenge(), signature = signDeviceMessage(key, mobileAuthorizationMessage(original));
    assert.deepEqual(await api.submit({ challenge: original, signature }), {
      status: 'UNKNOWN', requestId: intent.requestId, operationState: 'UNKNOWN', retryAllowed: false,
    });
    assert.equal(calls, 1);
  }
});

test('substituted challenges, foreign replies and synthetic private balances fail closed', async () => {
  for (const mutate of [value => { value.intent = { ...value.intent, amountAtomic: '26' }; },
    value => { value.origin = 'https://other.example'; }, value => { value.ownerPublicKey = '04' + '0'.repeat(128); },
    value => { value.expiresAt = Date.now() - 1; }]) {
    const original = challenge(); mutate(original);
    const api = createMobileApi({ origin, async fetchImpl() { return reply({ challenge: original }); } });
    await assert.rejects(api.challenge(ownerPublicKey, intent));
  }
  for (const value of [{ ...disconnected(), privatePortfolio: { balances: { available: '100' } } },
    { ...disconnected(), capabilities: { prepare: true, execute: false, reconcile: false, recover: false } },
    { ...disconnected(), capabilities: {} }, { ...disconnected(), notice: 'x'.repeat(1025) }])
    assert.throws(() => normalizeMobileState(value), /STATE_INVALID/);
  for (const response of [new Response('x'.repeat(16385), { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
    Object.defineProperty(reply(disconnected()), 'redirected', { value: true })]) {
    const api = createMobileApi({ origin, async fetchImpl() { return response; } });
    await assert.rejects(api.state());
  }
});

test('receipt client reads only the original permission after expiry and validates its fresh query binding', async () => {
  const expired = { ...challenge(), expiresAt: Date.now() - 1 };
  const authorization = { challenge: expired, signature: signDeviceMessage(key, mobileAuthorizationMessage(expired)) };
  const review = { authorization, nonce: 'e'.repeat(64), expiresAt: Date.now() + 60_000 };
  const request = { ...review, signature: signDeviceMessage(key, mobileReceiptMessage(review)) };
  const receipt = { version: 1, profile: MOBILE_AUTHORIZATION_RECEIPT_PROFILE, nonce: review.nonce,
    challengeId: expired.challengeId, action: intent.action,
    authorization: { status: 'ACCEPTED', requestId: intent.requestId, operationState: 'ADMITTED', retryAllowed: false } };
  const calls = [];
  const api = createMobileApi({ origin, async fetchImpl(url, options) { calls.push({ url, options }); return reply(receipt); } });
  assert.deepEqual(await api.receipt(request), receipt);
  assert.deepEqual(calls.map(call => call.url), [origin + '/v1/mobile/authorization-receipts']);
  assert.deepEqual(JSON.parse(calls[0].options.body), request);
  assert.equal(JSON.stringify(calls).includes(secretHex), false);
  for (const mutate of [value => { value.nonce = 'f'.repeat(64); }, value => { value.challengeId = 'f'.repeat(64); },
    value => { value.action = 'recover'; }, value => { value.authorization.operationState = 'CONFIRMED'; },
    value => { value.authorization.retryAllowed = true; }]) {
    const changed = structuredClone(receipt); mutate(changed);
    const wrong = createMobileApi({ origin, async fetchImpl() { return reply(changed); } });
    await assert.rejects(wrong.receipt(request));
  }
  for (const status of [404, 503]) {
    let count = 0;
    const missing = createMobileApi({ origin, async fetchImpl() { count++; return reply({ error: 'NO_ORIGINAL' }, status); } });
    await assert.rejects(missing.receipt(request), /SERVICE_UNAVAILABLE/); assert.equal(count, 1);
  }
});
