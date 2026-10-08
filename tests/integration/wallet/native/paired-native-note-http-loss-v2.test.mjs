/** Host-only execution of the exact original worker transport adapter.
 * Synthetic HTTP responses here issue no account/runtime/proof authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, lstatSync, rmSync, existsSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
const source = readFileSync(new URL('./paired-native-note-flow-v2.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('      const translate = async (target, options) =>');
const end = source.indexOf('      const api = createOriginalAccountApiV2', begin);
assert.ok(begin >= 0 && end > begin);
const adapterSource = source.slice(begin, end);
function transport(status, discard = true) {
  let received = 0, cancelCalls = 0, bodyReadCalls = 0;
  const response = { status, bodyUsed: false, headers: {},
    body: { cancel: async () => { cancelCalls++; }, getReader: () => { bodyReadCalls++; throw Error('UNEXPECTED_READ'); } } };
  const api = runInNewContext(`(function(){ let calls=0, diagnosticsPosts=0, dropNext=${discard}, loss=null;
    ${adapterSource}
    return { translate, current:()=>({calls,diagnosticsPosts,dropNext,loss}) };
  })()`, { assert, URL, Response, descriptor: { origin: 'https://paired-native-note-v2.example' },
    server: { url: 'http://127.0.0.1:1234' }, active() {},
    fetch: async (target, options) => { received++; assert.equal(target, 'http://127.0.0.1:1234/v2/mobile/original-account/diagnostics');
      assert.equal(options.method, 'POST'); return response; } });
  return { api, observed: () => ({ received, cancelCalls, bodyReadCalls }) };
}
test('real adapter discards the owned HTTP200 body before delivering it to the mobile API, with one fixed POST', async () => {
  const value = transport(200);
  await assert.rejects(value.api.translate('https://paired-native-note-v2.example/v2/mobile/original-account/diagnostics',
    { method: 'POST' }), /HTTP_REPLY_LOST_BEFORE_API/);
  assert.deepEqual(value.observed(), { received: 1, cancelCalls: 1, bodyReadCalls: 0 });
  const { diagnosticsPosts, dropNext, loss } = value.api.current();
  assert.equal(diagnosticsPosts, 1); assert.equal(dropNext, false);
  assert.equal(loss.actualHttpStatus, 200); assert.equal(loss.responseBodyDeliveredToApi, false);
  assert.equal(loss.diagnosticsPostsBefore, 0); assert.equal(loss.diagnosticsPostsAfter, 1);
});
test('adapter cannot label a rejected original response as completed loss or target another origin', async () => {
  const rejected = transport(403);
  await assert.rejects(rejected.api.translate('https://paired-native-note-v2.example/v2/mobile/original-account/diagnostics',
    { method: 'POST' }), /REAL_COMPLETED_HTTP_REPLY_REQUIRED/);
  assert.equal(rejected.api.current().loss, null); assert.deepEqual(rejected.observed(), { received: 1, cancelCalls: 0, bodyReadCalls: 0 });
  const other = transport(200);
  await assert.rejects(other.api.translate('https://elsewhere.example/v2/mobile/original-account/diagnostics',
    { method: 'POST' }));
  assert.deepEqual(other.observed(), { received: 0, cancelCalls: 0, bodyReadCalls: 0 });
});

const removeBegin = source.indexOf('      async function removeOwnSyntheticState(target)');
const removeEnd = source.indexOf('      if (result.cleanup.closedOwner === true)', removeBegin);
assert.ok(removeBegin >= 0 && removeEnd > removeBegin);
const removeSource = source.slice(removeBegin, removeEnd);
test('fixed cleanup removes only its own isolated synthetic vault/journal directories and retains evidence', async t => {
  const privateDirectory = mkdtempSync(join(tmpdir(), 'paired-note-cleanup-host-'));
  t.after(() => rmSync(privateDirectory, { recursive: true, force: true }));
  const ownerDirectory = join(privateDirectory, 'owner'), journalDirectory = join(privateDirectory, 'session-journal');
  for (const target of [ownerDirectory, journalDirectory]) { mkdirSync(target, { mode: 0o700 });
    writeFileSync(join(target, 'synthetic-marker.vault'), 'NO_KEYS_NO_FINANCIAL_STATE', { mode: 0o600 }); }
  const evidence = join(privateDirectory, 'public-receipt.json'); writeFileSync(evidence, '{}', { mode: 0o600 });
  const remove = runInNewContext(`(function(){ ${removeSource}; return removeOwnSyntheticState; })()`,
    { assert, privateDirectory, ownerDirectory, journalDirectory, lstatSync, rmSync, existsSync, realpathSync, process });
  await assert.rejects(remove(privateDirectory)); assert.equal(existsSync(evidence), true);
  await remove(ownerDirectory); await remove(journalDirectory);
  assert.equal(existsSync(ownerDirectory), false); assert.equal(existsSync(journalDirectory), false);
  assert.equal(readFileSync(evidence, 'utf8'), '{}');
  mkdirSync(journalDirectory, { mode: 0o700 }); symlinkSync(journalDirectory, ownerDirectory);
  await assert.rejects(remove(ownerDirectory)); assert.equal(existsSync(journalDirectory), true);
});

// Same original HTTPS event callbacks, synthetic sockets only. These tests
// establish Promise error routing, not TLS, signatures, native value or proofs.
const deviceSource = readFileSync(new URL('./device-owner-deposit-original-step-v1.mjs', import.meta.url), 'utf8');
const tlsBegin = deviceSource.indexOf('function exactTlsFetch(');
const tlsEnd = deviceSource.indexOf('export async function runDeviceOwnerDepositOriginalStepV1', tlsBegin);
assert.ok(tlsBegin >= 0 && tlsEnd > tlsBegin);
function deviceTransport(status, body = '{}', protocol = 'TLSv1.3') {
  const evidence = { posts: {}, responses: [], dropFund: true, fundReplyDiscarded: false };
  let requests = 0;
  const selected = runInNewContext(`(function(){ ${deviceSource.slice(tlsBegin, tlsEnd)}; return exactTlsFetch; })()`,
    { assert, URL, Response, Buffer, httpsRequest(_target, _options, callback) {
      requests++; const request = new EventEmitter(); request.destroy = error => request.emit('error', error);
      request.end = () => queueMicrotask(() => {
        const response = new EventEmitter(); response.statusCode = status;
        response.headers = { 'content-type': 'application/json' };
        response.socket = { getProtocol: () => protocol }; response.destroy = () => {};
        callback(response); response.emit('data', Buffer.from(body)); response.emit('end');
      }); return request;
    } });
  return { fetch: selected({ origin: 'https://localhost:1234' }, 'HOST_SYNTHETIC_CERT', evidence), evidence, requests: () => requests };
}
const deviceFund = 'https://localhost:1234/v1/mobile/device-deposit/fund';
test('original TLS adapter delivers genuine non200 status without inventing a discarded successful funding reply', async () => {
  for (const status of [403, 504]) {
    const value = deviceTransport(status), response = await value.fetch(deviceFund, { method: 'POST', body: '{}' });
    assert.equal(response.status, status); assert.equal(value.evidence.fundHttpStatus, status);
    assert.equal(value.evidence.fundReplyDiscarded, false); assert.equal(value.requests(), 1);
    assert.equal(value.evidence.dropFund, false); assert.equal(value.evidence.posts['/v1/mobile/device-deposit/fund'], 1);
  }
});
test('original TLS callback failures reject the original Promise instead of throwing outside worker catch', async () => {
  const malformed = deviceTransport(200, '{');
  await assert.rejects(malformed.fetch(deviceFund, { method: 'POST', body: '{}' }), error => error.name === 'SyntaxError');
  assert.equal(malformed.requests(), 1);
  const protocol = deviceTransport(200, '{}', 'TLSv1.2');
  await assert.rejects(protocol.fetch(deviceFund, { method: 'POST', body: '{}' })); assert.equal(protocol.requests(), 1);
});
test('original TLS adapter discards a real200 once, preserving its public authorization digest without resubmission', async () => {
  const value = deviceTransport(200, JSON.stringify({ authorizationSHA256: 'a'.repeat(64) }));
  await assert.rejects(value.fetch(deviceFund, { method: 'POST', body: '{}' }), /FUND_REPLY_LOST_BEFORE_API/);
  assert.equal(value.evidence.fundHttpStatus, 200); assert.equal(value.evidence.fundReplyDiscarded, true);
  assert.equal(value.evidence.fundAuthorizationSHA256, 'a'.repeat(64)); assert.equal(value.requests(), 1);
});
