/** Client-only host tests. node:http.request is replaced before client import;
 * no server/socket, chain, signer, compiler, proof or storage is started. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment } from '../../../src/claims/protocol/framing.mjs';
let active;
mock.module('node:http', { exports: { request(options, callback) {
  const c = active; assert.ok(c, 'HOST_ONLY_HTTP_REQUIRED'); c.calls.push(structuredClone(options));
  const request = new EventEmitter(); c.request = request;
  request.destroy = () => { c.requestDestroyed++; };
  request.end = (...args) => { assert.deepEqual(args, []); c.ends++;
    queueMicrotask(() => {
      if (c.networkError) { request.emit('error', new Error(c.networkError)); return; }
      if (c.stallBeforeHeaders) return;
      const response = new EventEmitter(); c.response = response;
      Object.assign(response, { statusCode: c.status, headers: c.headers, complete: c.complete });
      response.destroy = () => { c.responseDestroyed++; };
      callback(response);
      if (c.stallBody || c.responseDestroyed) return;
      for (const chunk of c.chunks) { response.emit('data', chunk); if (c.responseDestroyed) break; }
      if (c.responseDestroyed) return;
      if (c.bodyError) response.emit('error', new Error(c.bodyError));
      else if (c.aborted) response.emit('aborted');
      else if (c.closedEarly) response.emit('close');
      else { response.emit('end'); response.emit('close'); }
    });
  };
  return request;
} } });
const { readNativeClaimSnapshot, readNativeClaimOwnerStatus, NATIVE_CLAIM_STATUS_RESPONSE_LIMIT,
  NATIVE_CLAIM_STATUS_TIMEOUT_MS } = await import('../../../src/api/claims/native-claim-status-client.mjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const claimConfig = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key,
  type === 'address' ? hash(key).slice(0, 40) : type === 'u256' ? '31337' : type === 'u64' ? '5000'
    : type === 'u8' ? '2' : type === 'field32' ? '01' + hash(key).slice(2) : hash(key)]));
claimConfig.ledgerNamespace = claimConfig.hubDomain;
const origin = 'http://127.0.0.1:12345', token = 'ab'.repeat(32), domain = claimDomainCommitment(claimConfig);
const clone = value => structuredClone(value);
const journalSnapshot = () => ({ version: 1, profile: 'OWNED_LOCAL_DURABLE_NATIVE_CLAIM_ACCOUNT_V1', phase: 'READY',
  storageAvailable: true, busy: false, queued: 0, revision: 3, observation: 'DURABLE_JOURNAL_ONLY', errorCode: null,
  requests: [{ requestId: 'deposit_0001', action: 'deposit', state: 'CONFIRMED', errorCode: null }],
  requiresExternalEffectReconciliation: false, capabilities: { keeperRestart: true, nativeNodeRestart: false,
    operatorKeyRestart: false, nativeSelfCustody: false, fullWalletAcceptance: false } });
const ownerStatus = () => ({ profile: 'OWNED_LOCAL_DURABLE_NATIVE_CLAIM_ACCOUNT_V1', observation: 'DURABLE_JOURNAL_ONLY',
  assetKind: 'CUSTODIAL_NATIVE_CLAIM', nativeSelfCustody: false, underlyingSpendable: false, independentOperators: false,
  deposits: [{ intentId: '22'.repeat(32), claimDomain: domain, amount: '9007199254740993', status: 'ISSUED',
    assetKind: 'CUSTODIAL_NATIVE_CLAIM', nativeSelfCustody: false, spendablePrivateBalance: null,
    submission: { transactionHash: '33'.repeat(32), calldataSHA256: '44'.repeat(32) } }],
  tickets: [{ ticketId: '55'.repeat(32), claimDomain: domain, amount: '1000000', kind: 'REDEEM', status: 'UNKNOWN', nativeSelfCustody: false }],
  requests: [{ requestId: 'deposit_0001', action: 'deposit', state: 'CONFIRMED', errorCode: null,
    result: { rawUnforwarded: 'heterogeneous-result-not-client-status' } }] });
function transport(body = journalSnapshot(), options = {}) {
  const bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  active = { calls: [], ends: 0, requestDestroyed: 0, responseDestroyed: 0, status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': String(bytes.length) },
    chunks: [bytes], complete: true, ...options }; return active;
}
const noNativeAcceptance = result => {
  assert.equal(result.limitations.observation, 'DURABLE_JOURNAL_ONLY'); assert.equal(result.limitations.balancesProvided, false);
  assert.equal(result.limitations.custodyObservation, 'NOT_PROVIDED_BY_THIS_API');
  assert.equal(result.limitations.nativeSettlementEstablished, false);
};

test('owner journal GET uses one exact route and owner token without mutation, fallback or credential persistence', async () => {
  const c = transport(), access = { origin, token }, pending = readNativeClaimSnapshot(access);
  access.origin = 'http://external.invalid:12345'; access.token = 'cd'.repeat(32);
  const result = await pending;
  assert.equal(c.calls.length, 1); assert.equal(c.ends, 1);
  assert.deepEqual(c.calls[0], { hostname: '127.0.0.1', port: 12345, method: 'GET', path: '/api/native-claims/snapshot',
    agent: false, maxHeaderSize: 8192, headers: { Host: '127.0.0.1:12345', Origin: origin, Accept: 'application/json',
      'Accept-Encoding': 'identity', 'x-native-owner-token': token } });
  assert.equal(c.calls[0].headers['x-native-claim-token'], undefined);
  assert.equal(c.calls[0].headers['x-flat-owner-token'], undefined);
  assert.equal(result.readStatus, 'RECEIVED'); assert.equal(result.scope, 'OWNER_PRIVATE_SNAPSHOT');
  assert.deepEqual(result.data, journalSnapshot()); noNativeAcceptance(result);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.data.requests[0]));
  assert.ok(!JSON.stringify(result).includes(token));
});

test('owner GET uses only its dedicated token header and preserves unknown/private/null status', async () => {
  const c = transport(ownerStatus()), access = { origin, token }, pending = readNativeClaimOwnerStatus(access);
  access.origin = 'http://example.com'; access.token = 'cd'.repeat(32);
  const result = await pending;
  assert.equal(c.calls.length, 1); assert.equal(c.calls[0].path, '/api/native-claims/owner');
  assert.equal(c.calls[0].headers.Origin, origin); assert.equal(c.calls[0].headers['x-native-owner-token'], token);
  assert.equal(c.calls[0].headers['x-native-claim-token'], undefined);
  assert.equal(result.scope, 'OWNER_PRIVATE_STATUS'); assert.equal(result.data.deposits[0].amount, '9007199254740993');
  assert.equal(result.data.deposits[0].spendablePrivateBalance, null); assert.equal(result.data.tickets[0].status, 'UNKNOWN');
  assert.equal(result.data.requests[0].state, 'CONFIRMED'); assert.equal(Object.hasOwn(result.data.requests[0], 'result'), false);
  assert.ok(!JSON.stringify(result).includes('heterogeneous-result-not-client-status')); assert.ok(!JSON.stringify(result).includes(token));
  noNativeAcceptance(result);
});

test('unavailable, reconciliation-required and closed snapshots never become zero or settlement success', async () => {
  for (const phase of ['READY', 'UNAVAILABLE', 'CLOSED']) {
    const body = journalSnapshot(); body.phase = phase; body.storageAvailable = phase === 'READY';
    body.requiresExternalEffectReconciliation = true; body.requests[0].state = 'RECONCILIATION_REQUIRED';
    body.errorCode = 'CLAIM_KEEPER_RECONCILIATION_REQUIRED'; transport(body);
    const result = await readNativeClaimSnapshot({ origin, token });
    assert.equal(result.readStatus, 'RECEIVED'); assert.equal(result.data.phase, phase);
    assert.equal(result.data.storageAvailable, phase === 'READY'); assert.equal(result.data.requiresExternalEffectReconciliation, true);
    assert.equal(result.data.requests[0].state, 'RECONCILIATION_REQUIRED'); noNativeAcceptance(result);
    assert.equal(Object.hasOwn(result.data, 'balance'), false); assert.equal(Object.hasOwn(result, 'success'), false);
  }
});

test('invalid origins, auth fields, getters, proxies and option injection reject before any request', async () => {
  const c = transport(); let traps = 0;
  const accessor = Object.defineProperty({}, 'origin', { get() { traps++; throw Error('PRIVATE'); } });
  const proxy = new Proxy({}, { get() { traps++; throw Error('PRIVATE'); } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const origins = ['http://localhost:12345', 'https://127.0.0.1:12345', 'http://127.1:12345', 'http://2130706433:12345',
    'http://[::1]:12345', 'http://user:pass@127.0.0.1:12345', origin + '/', origin + '?x=1', origin + '#x', origin + '\n',
    'http://127.0.0.1:012345', 'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://example.com:12345'];
  // Both histories require exact owner access. Invalid origin/token shapes
  // are rejected locally; a well-formed wrong secret is denied by the server.
  for (const read of [readNativeClaimSnapshot, readNativeClaimOwnerStatus]) {
    for (const input of [...origins.map(origin => ({ origin, token })), { origin }, { origin, token: '' },
      { origin, token: token + '\n' }, { origin, token: 'AB'.repeat(32) }, { origin, token: 'ab'.repeat(31) },
      { origin, token, path: '/api/native-claims/deposit' }, { origin, token, method: 'POST' },
      { origin, token, headers: {} }, { origin, token, timeout: 0 }, { origin, token, mutationToken: token },
      { origin, token, fetch() {} }, accessor, proxy, revoked.proxy])
      await assert.rejects(read(input), /NATIVE_CLAIM_STATUS_ACCESS_INVALID/);
    await assert.rejects(read({ origin, token }, {}), /NATIVE_CLAIM_STATUS_ACCESS_INVALID/);
  }
  assert.equal(c.calls.length, 0); assert.equal(traps, 0);
  const allowed = transport(); await readNativeClaimSnapshot({ origin: 'http://127.0.0.1:80', token });
  assert.equal(allowed.calls[0].headers.Host, '127.0.0.1:80');
});

test('redirects cannot forward the owner token or trigger a second request', async () => {
  for (const read of [readNativeClaimSnapshot, readNativeClaimOwnerStatus]) for (const status of [301, 302, 303, 307, 308]) {
    const c = transport({}, { status, headers: { location: 'https://external.invalid/steal' } });
    const result = await read({ origin, token });
    assert.equal(c.calls[0].headers['x-native-owner-token'], token);
    assert.equal(result.scope, read === readNativeClaimSnapshot ? 'OWNER_PRIVATE_SNAPSHOT' : 'OWNER_PRIVATE_STATUS');
    assert.equal(result.errorCode, 'NATIVE_CLAIM_STATUS_REDIRECT_FORBIDDEN'); assert.equal(result.data, null);
    assert.equal(c.calls.length, 1); assert.ok(c.requestDestroyed && c.responseDestroyed); noNativeAcceptance(result);
    assert.ok(!JSON.stringify(result).includes('external.invalid')); assert.ok(!JSON.stringify(result).includes(token));
  }
});

test('busy/access/unavailable failures preserve only bounded API codes; malformed and raw errors stay opaque', async () => {
  for (const [status, body, expected] of [[403, { error: 'NATIVE_CLAIM_OWNER_ACCESS_REQUIRED' }, 'NATIVE_CLAIM_OWNER_ACCESS_REQUIRED'],
    [409, { error: 'NATIVE_CLAIM_OWNER_VIEW_BUSY' }, 'NATIVE_CLAIM_OWNER_VIEW_BUSY'],
    [503, { error: 'CLAIM_KEEPER_UNAVAILABLE' }, 'CLAIM_KEEPER_UNAVAILABLE'],
    [500, { error: 'raw RPC secret ' + token }, 'NATIVE_CLAIM_STATUS_HTTP_ERROR'],
    [500, { error: 'CLAIM_UNAVAILABLE\nprivate' }, 'NATIVE_CLAIM_STATUS_HTTP_ERROR'],
    [500, { error: 'CLAIM_UNAVAILABLE', nativeWire: token }, 'NATIVE_CLAIM_STATUS_HTTP_ERROR'],
    [202, { admitted: true, state: 'CONFIRMED' }, 'NATIVE_CLAIM_STATUS_HTTP_ERROR']]) {
    for (const read of [readNativeClaimSnapshot, readNativeClaimOwnerStatus]) {
      const c = transport(body, { status }), result = await read({ origin, token });
      assert.equal(c.calls[0].headers['x-native-owner-token'], token);
      assert.equal(result.readStatus, 'UNAVAILABLE'); assert.equal(result.errorCode, expected); assert.equal(result.httpStatus, status);
      assert.equal(result.data, null); assert.equal(c.calls.length, 1); noNativeAcceptance(result);
      assert.ok(!JSON.stringify(result).includes(token));
    }
  }
  const c = transport({}, { networkError: 'private transport failure ' + token });
  const result = await readNativeClaimSnapshot({ origin, token });
  assert.equal(result.errorCode, 'NATIVE_CLAIM_STATUS_NETWORK_UNAVAILABLE'); assert.equal(c.calls.length, 1);
  assert.ok(!JSON.stringify(result).includes(token));
});

test('invalid response/schema, balance claims, future states and extra private fields fail closed', async () => {
  const mutations = [b => { b.profile = 'OTHER'; }, b => { b.observation = 'CURRENT_QUORUM'; }, b => { b.version = 2; },
    b => { b.phase = 'UNAVAILABLE'; }, b => { b.capabilities.nativeSelfCustody = true; },
    b => { b.requests[0].state = 'SETTLED'; }, b => { b.requests[0].rawWire = token; },
    b => { b.balance = '0'; }, b => { b.requests[0].errorCode = 'CLAIM_BAD\n'; }, b => { b.requests = Array(129).fill(b.requests[0]); }];
  for (const mutate of mutations) {
    const b = journalSnapshot(); mutate(b); transport(b); const result = await readNativeClaimSnapshot({ origin, token });
    assert.equal(result.errorCode, 'NATIVE_CLAIM_STATUS_RESPONSE_INVALID'); assert.equal(result.data, null);
  }
  for (const mutate of [b => { b.deposits[0].spendablePrivateBalance = '0'; }, b => { b.underlyingSpendable = true; },
    b => { b.deposits[0].amount = 9007199254740993; }, b => { b.deposits[0].amount = '18446744073709551616'; },
    b => { b.deposits[0].amount = '01'; }, b => { b.deposits[0].amount = '1\n'; }, b => { b.tickets[0].status = 'NATIVE_SETTLED'; }]) {
    const b = ownerStatus(); mutate(b); transport(b); const result = await readNativeClaimOwnerStatus({ origin, token });
    assert.equal(result.errorCode, 'NATIVE_CLAIM_STATUS_RESPONSE_INVALID'); assert.equal(result.data, null);
  }
});

test('byte limits, incomplete streams, invalid JSON and encoding are bounded without retries', async () => {
  for (const [body, options, expected] of [
    ['{}', { headers: { 'content-type': 'application/json', 'content-length': String(NATIVE_CLAIM_STATUS_RESPONSE_LIMIT + 1) } }, 'RESPONSE_TOO_LARGE'],
    ['x'.repeat(NATIVE_CLAIM_STATUS_RESPONSE_LIMIT + 1), { headers: { 'content-type': 'application/json' } }, 'RESPONSE_TOO_LARGE'],
    ['{}', { complete: false }, 'RESPONSE_INCOMPLETE'], ['{}', { aborted: true }, 'RESPONSE_INCOMPLETE'],
    ['{}', { closedEarly: true }, 'RESPONSE_INCOMPLETE'], ['{}', { bodyError: 'PRIVATE' }, 'NETWORK_UNAVAILABLE'],
    ['{}', { headers: { 'content-type': 'application/json', 'content-length': '99' } }, 'RESPONSE_INCOMPLETE'],
    ['{', {}, 'RESPONSE_INVALID'], ['{}', { headers: { 'content-type': 'text/html' } }, 'RESPONSE_INVALID'],
    ['{}', { headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } }, 'RESPONSE_INVALID']]) {
    const c = transport(body, options), result = await readNativeClaimSnapshot({ origin, token });
    assert.equal(result.errorCode, 'NATIVE_CLAIM_STATUS_' + expected); assert.equal(result.data, null);
    assert.equal(c.calls.length, 1); assert.ok(c.requestDestroyed && c.responseDestroyed);
  }
});

test('fixed total timeout closes stalled request or response without another read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const options of [{ stallBeforeHeaders: true }, { stallBody: true }]) {
    const c = transport({}, options), pending = readNativeClaimOwnerStatus({ origin, token });
    await Promise.resolve(); t.mock.timers.tick(NATIVE_CLAIM_STATUS_TIMEOUT_MS);
    const result = await pending; assert.equal(result.errorCode, 'NATIVE_CLAIM_STATUS_TIMEOUT');
    assert.equal(result.data, null); assert.equal(c.calls.length, 1); assert.equal(c.requestDestroyed, 1);
    if (options.stallBody) assert.equal(c.responseDestroyed, 1);
  }
});

test('client imports only read transport/util and exposes no generic route or action API', () => {
  const source = readFileSync(new URL('./native-claim-status-client.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map(match => match[1]), ['./fixed-owner-read-transport.mjs', 'node:util']);
  const transport = readFileSync(new URL('./fixed-owner-read-transport.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...transport.matchAll(/from '([^']+)'/g)].map(match => match[1]), ['node:http', 'node:util']);
  assert.deepEqual([...transport.matchAll(/export async function (\w+)/g)].map(match => match[1]),
    ['readNativeClaimSnapshotWire', 'readNativeClaimOwnerWire', 'readFlatAccountOwnerWire']);
  assert.doesNotMatch(transport, /setInterval|writeFile|localStorage|sessionStorage|console\.|process\.stdout|method: 'POST'/);
  assert.doesNotMatch(source, /setInterval|writeFile|localStorage|sessionStorage|console\.|process\.stdout|\.submit\(|method: 'POST'/);
  assert.deepEqual([...source.matchAll(/export async function (\w+)/g)].map(match => match[1]), ['readNativeClaimSnapshot', 'readNativeClaimOwnerStatus']);
});

test('current session-generated authenticated journal and owner contracts are accepted with synthetic in-memory bootstrap only', async () => {
  const owner = '66'.repeat(32), projected = ownerStatus().deposits[0];
  const data = { deposits: [{ id: projected.intentId, claimDomain: domain, packet: { ownerIdentitySHA256: owner } }],
    tickets: [], apiAccounts: [], apiAdmissions: [] };
  const journal = { async read() { return clone(data); }, async update(change) { const next = change(clone(data));
    Object.assign(data, next); return clone(data); } };
  const keeper = { status: () => ({ keeperRestart: true, uncertain: false, requiresExternalEffectReconciliation: false }) };
  const runtime = { accounts: ['0x' + '77'.repeat(20)] }, claims = { configs: [claimConfig] },
    controller = { async status() { return { deposits: [projected], tickets: [] }; } };
  mock.module(new URL('../native-claims/controller.mjs', import.meta.url).href, { exports: {
    ownedNativeClaimControllerBindings(value) { assert.equal(value, controller); return { runtime, keeper, claims }; },
    restartNativeClaimController() { assert.fail('NO_RESTART_IN_READ_ONLY_CONTRACT_TEST'); },
  } });
  mock.module(new URL('../native-claims/controller-journal.mjs', import.meta.url).href, { exports: {
    ownedClaimControllerJournal(value) { assert.equal(value, keeper); return journal; },
  } });
  // Fixed cSOL/9 data for this inert controller, not a native-system brand.
  mock.module(new URL('../native-claims/native-claim-asset-units-v1.mjs', import.meta.url).href, { exports: {
    originalNativeClaimAssetUnitsV1(actualRuntime, actualClaims, config) {
      assert.equal(arguments.length, 3); assert.equal(actualRuntime, runtime); assert.equal(actualClaims, claims);
      assert.equal(config, claimConfig); assert.equal(config.nativeFamily, '2');
      assert.notEqual(claims.nativeSplCustodyProfile, true);
      return Object.freeze({ claimSymbol: 'cSOL', nativeSymbol: 'SOL', decimals: 9, atomicUnit: 'lamport' });
    },
  } });
  const { createNativeClaimSession, nativeClaimSessionIdentity } = await import('../../../src/api/claims/native-claim-session.mjs');
  const session = await createNativeClaimSession({ controller, accountId: 'host_contract_account',
    ownerIdentitySHA256: owner, claimDomain: domain, caller: runtime.accounts[0] });
  try {
    const identity = nativeClaimSessionIdentity(session);
    assert.equal(identity.claimDomain, domain); assert.equal(identity.claimSymbol, 'cSOL'); assert.ok(Object.isFrozen(identity));
    const snapshotWire = await session.snapshot(); assert.equal(Object.hasOwn(snapshotWire, 'identity'), false); transport(snapshotWire);
    const snapshotRead = await readNativeClaimSnapshot({ origin, token }); assert.deepEqual(snapshotRead.data, snapshotWire);
    const privateWire = await session.ownerView(); assert.equal(Object.hasOwn(privateWire, 'identity'), false); transport(privateWire);
    const privateRead = await readNativeClaimOwnerStatus({ origin, token }); assert.deepEqual(privateRead.data, privateWire);
    assert.equal(privateRead.data.deposits[0].spendablePrivateBalance, null); noNativeAcceptance(privateRead);
  } finally { await session.close(); }
});
