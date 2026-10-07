/** Deterministic transport failures, not native/effect acceptance. Run with
 * --experimental-test-module-mocks. Only this test process mocks node:http. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WALLET_PROFILE, NATIVE_IDENTITY_PROFILE } from '../../../../../apps/wallet/src/client/state/view-model.mjs';

const ownerToken = 'a'.repeat(64), actionToken = 'b'.repeat(64), requestId = 'original_transport_01';
const state = () => ({ version: 1, profile: WALLET_PROFILE, connection: 'CONNECTED', portfolio: null,
  nativeClaims: { snapshot: { phase: 'READY', storageAvailable: true, busy: false, queued: 0, requests: [] },
    owner: { deposits: [], tickets: [], requests: [] }, identity: { version: 1, profile: NATIVE_IDENTITY_PROFILE,
      accountId: 'transport_account_01', claimDomain: '1'.repeat(64), nativeFamily: '1', nativeGenesis: '2'.repeat(64),
      nativeAsset: '3'.repeat(64), wrapperAssetIdentity: '4'.repeat(64), claimSymbol: 'cBTC', nativeSymbol: 'BTC',
      decimals: 8, atomicUnit: 'satoshi', observation: 'ORIGINAL_BOUND_CONFIGURATION_ONLY' } },
  capabilities: { nativeDeposit: true, nativeRedeem: true, nativeRefund: true, nativeReconcile: true, nativeResume: true, graphExecution: false },
  errors: { portfolio: null, nativeClaims: null } });
let calls = [], respond, beforeHeaders = () => {};
mock.module('node:http', { exports: { request(options, callback) {
  const request = new EventEmitter(); request.destroyed = false;
  request.destroy = () => { request.destroyed = true; };
  request.end = body => {
    const response = new EventEmitter(); response.statusCode = options.method === 'GET' ? 200 : 202;
    response.headers = { 'content-type': 'application/json' }; response.rawHeaders = ['Content-Type', 'application/json'];
    response.complete = false; response.destroyed = false;
    response.destroy = () => { response.destroyed = true; };
    const call = { options, body, request, response }; calls.push(call);
    queueMicrotask(() => { beforeHeaders(call); callback(response); respond(call); });
  };
  return request;
} } });
const { createWalletApplicationClient } = await import('../../../src/api/wallet/wallet-application-client.mjs');
const client = () => createWalletApplicationClient({ origin: 'http://127.0.0.1:12345', ownerToken, actionToken });
function end(response, value) {
  response.emit('data', Buffer.from(JSON.stringify(value))); response.complete = true; response.emit('end');
}
function reset(handler, headers = () => {}) { calls = []; respond = handler; beforeHeaders = headers; }
async function microtasks() { await Promise.resolve(); await Promise.resolve(); }

test('read deadline covers a stalled body and late JSON cannot install state', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reset(({ response }) => response.emit('data', Buffer.from('{')));
  const c = client(), pending = c.refresh(); await microtasks();
  assert.equal(c.getState().reading, true); assert.equal(calls.length, 1);
  t.mock.timers.tick(89999); await microtasks(); assert.equal(c.getState().reading, true);
  t.mock.timers.tick(1); assert.equal(await pending, false);
  assert.equal(calls[0].request.destroyed, true); assert.equal(calls[0].response.destroyed, true);
  const final = c.getState(); end(calls[0].response, state()); await microtasks();
  assert.deepEqual(c.getState(), final); assert.equal(final.data, null); assert.equal(final.stale, true);
  assert.equal(calls.length, 1);
});

test('action deadline remains UNKNOWN with original ID; abort is neither cancellation nor resend', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reset(({ options, response }) => options.method === 'GET' ? end(response, state()) : response.emit('data', Buffer.from('{')));
  const c = client(); assert.equal(await c.refresh(), true);
  c.review('redeem', { requestId, amount: '1', maxFee: '1' });
  const pending = c.confirm(); await microtasks();
  t.mock.timers.tick(29999); await microtasks(); assert.equal(c.getState().sending, true);
  t.mock.timers.tick(1); assert.equal(await pending, false);
  assert.equal(calls[1].request.destroyed, true); assert.equal(calls[1].response.destroyed, true);
  assert.deepEqual(c.getState().outcome, { state: 'UNKNOWN', action: 'redeem', requestId });
  assert.equal(c.getState().originalRequestIds.native, requestId);
  const final = c.getState(); end(calls[1].response, { admitted: true, action: 'redeem', requestId }); await microtasks();
  assert.deepEqual(c.getState(), final);
  assert.equal(await c.confirm(), false); assert.equal(calls.length, 2);
  t.mock.timers.tick(180000); await microtasks(); assert.equal(calls.length, 2);
  assert.deepEqual(c.getState(), final);
});

test('request errors before headers and incomplete responses fail closed without leaking transport errors', async () => {
  for (const fail of [call => call.request.emit('error', Error(ownerToken + actionToken)),
    call => call.response.emit('aborted'), call => call.response.emit('close'),
    call => { call.response.emit('data', Buffer.from(JSON.stringify(state()))); call.response.emit('end'); }]) {
    reset(fail); const c = client(); assert.equal(await c.refresh(), false);
    assert.equal(c.getState().stale, true); assert.equal(c.getState().data, null);
    const exposed = JSON.stringify(c.getState()); assert.equal(exposed.includes(ownerToken), false); assert.equal(exposed.includes(actionToken), false);
    assert.equal(calls.length, 1); assert.equal(calls[0].request.destroyed, true);
  }
});

test('length mismatch and duplicate response framing headers never produce current state', async () => {
  for (const mode of ['length', 'duplicate']) {
    reset(call => end(call.response, state()), call => {
      if (mode === 'length') {
        call.response.headers['content-length'] = '1';
        call.response.rawHeaders.push('Content-Length', '1');
      } else call.response.rawHeaders.push('content-type', 'application/json');
    });
    const c = client(); assert.equal(await c.refresh(), false); assert.equal(c.getState().data, null);
    assert.equal(calls[0].request.destroyed, true); assert.equal(calls.length, 1);
  }
});

test('fixed request descriptor has no DNS, redirects, cookies, proxy agent or generic transport', async () => {
  reset(({ options, response }) => options.method === 'GET' ? end(response, state())
    : end(response, { admitted: true, action: 'reconcile', requestId }));
  const c = client(); await c.refresh(); c.review('reconcile', { requestId }); await c.confirm();
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.hostname, '127.0.0.1'); assert.equal(call.options.port, 12345);
    assert.equal(call.options.agent, false); assert.equal(call.options.maxHeaderSize, 8192);
    assert.equal(call.options.headers.Origin, 'http://127.0.0.1:12345');
    assert.equal(call.options.headers.Cookie, undefined);
  }
  assert.equal(calls[0].body, undefined); assert.equal(calls[1].body, JSON.stringify({ requestId }));
});
