/** Host-only clients over mocked node:http.request. Genuine pure producer
 * projections and the complete portfolio reader use synthetic data.
 * No server, socket, native node, compiler, proof, signing or durable storage. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { projectFlatAccountOwnerView } from '../../../src/accounts/authority/flat-account-authority.mjs';
import { projectNativeClaimPosition } from '../../../src/claims/operations/portfolio-view.mjs';
import { createFlatAccountSession } from '../../../src/api/accounts/flat-account-session.mjs';
import {createFlatPortfolioOwnerReaderV1} from '../../../src/accounts/authority/portfolio-owner-view-v1.mjs';
import {immutable} from '@lianum/engine/accounts/journal';
const readFlatPortfolioOwnerViewV1 = createFlatPortfolioOwnerReaderV1({immutable});
let active;
mock.module('node:http', { exports: { request(options, callback) {
  const c = active; assert.ok(c, 'HOST_ONLY_TRANSPORT'); c.calls.push(structuredClone(options));
  const request = new EventEmitter(); request.destroy = () => { c.destroyed++; };
  request.end = (...args) => { assert.deepEqual(args, []);
    queueMicrotask(() => {
      if (c.networkError) { request.emit('error', new Error('PRIVATE NETWORK ERROR')); return; }
      const response = new EventEmitter(); c.response = response; Object.assign(response, { statusCode: c.status, headers: c.headers, complete: true });
      response.destroy = () => { c.destroyed++; }; callback(response);
      if (c.stall || c.destroyed) return;
      response.emit('data', c.bytes); if (!c.destroyed) { response.emit('end'); response.emit('close'); }
    });
  }; return request;
} } });
const { readFlatAccountOwnerPortfolio } = await import('../../../src/api/accounts/flat-account-owner-client.mjs');
const { readNativeClaimOwnerStatus, readNativeClaimSnapshot } = await import('../../../src/api/claims/native-claim-status-client.mjs');
const { OWNER_READ_RESPONSE_LIMIT, OWNER_READ_TIMEOUT_MS, FLAT_OWNER_READ_TIMEOUT_MS } = await import('../../../src/api/transport/fixed-owner-read-transport.mjs');
const origin = 'http://127.0.0.1:18765', token = 'ab'.repeat(32), id = index => String(index + 1).repeat(64);
const clone = value => structuredClone(value);
function input(index = 0) {
  return { asset: { assetId: id(index), symbol: index ? 'CSOL' : 'CBTC', decimals: index ? 9 : 8,
    ownerKey: 'PRIVATE_PRODUCER_FIELD_MUST_NOT_LEAVE' },
  current: { observed: { observedAt: 123456789 + index, blockNumber: '12', blockHash: 'ef'.repeat(32), timestamp: '7200' },
    balances: { available: '9007199254740993', reserved: '100', recovery: '800', locked: '500' },
    backing: { held: '10000000000000000', liabilities: '9999999999999000', surplus: '1000', deficit: '0' } },
  requests: [{ requestId: 'graph_request_0001', kind: 'GRAPH', state: 'CONFIRMED', disposition: 'RECOVERED' },
    { requestId: 'unresolved_request', kind: 'EXIT', state: 'UNRESOLVED', disposition: null }] };
}
const account = (index = 0, mutate = () => {}) => { const value = input(index); mutate(value); return projectFlatAccountOwnerView(value); };
async function portfolio(assets) {
  // Mutable wire fixture for adverse input cases; the real reader stays frozen.
  return clone(await readFlatPortfolioOwnerViewV1(assets.map(view => ({
    asset: view.asset, account: {ownerView: async () => view},
  }))));
}
function transport(body, options = {}) {
  const bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  active = { calls: [], destroyed: 0, status: 200, bytes,
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': String(bytes.length) }, ...options }; return active;
}
async function read(body, options) { const c = transport(body, options); return { c, result: await readFlatAccountOwnerPortfolio({ origin, token }) }; }
function hostOnly(result) {
  assert.equal(result.limitations.source, 'HOST_REPORTED'); assert.equal(result.limitations.chainVerifiedByClient, false);
  assert.equal(result.limitations.proofsVerifiedByClient, false); assert.equal(result.limitations.nativeSelfCustodyEstablished, false);
  assert.equal(result.limitations.crossAssetTotalsProvided, false); assert.equal(Object.hasOwn(result, 'success'), false);
}
const nativePosition = (view, ready = false) => projectNativeClaimPosition(view,
  { nativeFamily: view.asset.symbol === 'CBTC' ? '1' : '2', nativeGenesis: 'cd'.repeat(32) }, ready);

test('single-asset producer keeps exact amount strings, null meanings, dispositions and no private metadata', async () => {
  const body = account(), { c, result } = await read(body);
  assert.equal(result.readStatus, 'RECEIVED'); assert.equal(result.payloadKind, 'SINGLE_ASSET_ACCOUNT');
  assert.deepEqual(result.data, body); assert.equal(result.data.balances.available, '9007199254740993');
  assert.deepEqual(Object.keys(result.data.balances).sort(), ['available', 'locked', 'recovery', 'reserved']);
  assert.equal(result.data.requests[0].disposition, 'RECOVERED'); assert.equal(result.data.requests[1].disposition, null);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_PRODUCER_FIELD')); assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(Object.isFrozen(result.data.balances)); assert.equal(c.calls.length, 1); hostOnly(result);
});

test('actual portfolio projection preserves LIVE/PARTIAL/STALE/UNAVAILABLE and per-asset nulls without totals', async () => {
  const cases = [
    ['LIVE', [account(0), account(1)], true],
    ['PARTIAL', [account(0), account(1, value => { value.current = null; })], false],
    ['STALE', [account(0), account(1, value => { value.current.observed.blockHash = 'aa'.repeat(32); })], false],
    ['STALE', [account(0), account(1, value => { value.requests[0].state = 'STALE'; value.requests[0].disposition = null; })], true],
    ['UNAVAILABLE', [account(0, value => { value.current = null; }), account(1, value => { value.current = null; })], false],
  ];
  for (const [status, assets, coherent] of cases) {
    const body = await portfolio(assets), { result } = await read(body);
    assert.equal(result.payloadKind, 'REGISTERED_PORTFOLIO'); assert.deepEqual(result.data, body);
    assert.equal(result.data.status, status); assert.equal(result.data.coherent, coherent);
    if (!coherent) assert.equal(result.data.observed, null);
    for (const row of result.data.assets) if (row.status === 'UNAVAILABLE') {
      assert.equal(row.balances, null); assert.equal(row.backing, null); assert.equal(row.observed, null);
      assert.ok(row.requests.every(request => request.disposition === null));
    }
    assert.equal(Object.hasOwn(result.data, 'total'), false); hostOnly(result);
  }
});

test('unavailable single account and stale request remain unavailable/stale rather than fabricated zero or success', async () => {
  for (const body of [account(0, value => { value.current = null; }),
    account(0, value => { value.requests[0].state = 'STALE'; value.requests[0].disposition = null; })]) {
    const { result } = await read(body); assert.deepEqual(result.data, body);
    assert.equal(result.data.requests[0].state, 'STALE'); assert.equal(result.data.requests[0].disposition, null);
    if (body.status === 'UNAVAILABLE') assert.equal(result.data.balances, null);
    else assert.equal(result.data.balances.available, input().current.balances.available);
    hostOnly(result);
  }
  const zero = account(0, value => { value.current.balances = { available: '0', reserved: '0', recovery: '0', locked: '0' }; });
  assert.deepEqual((await read(zero)).result.data.balances, zero.balances, 'reported zero remains distinguishable from null');
});

test('native claim producer keeps private claims while custody is unavailable and never promotes self-custody', async () => {
  const body = await portfolio([account(0), account(1)]);
  body.nativeClaims = body.assets.map((asset, index) => ({ ...nativePosition(asset, index === 1),
    ...(index === 0 ? { custodyDiagnostic: { code: 'FLAT_OPERATOR_SIGNING_UNCERTAIN',
      causeCode: 'CLAIM_CURRENT_PRINCIPAL_DEFICIT', causeCodes: ['CLAIM_CURRENT_PRINCIPAL_DEFICIT'] } } : {}) }));
  const { result } = await read(body); assert.deepEqual(result.data, body);
  assert.equal(result.data.nativeClaims[0].availablePrivateClaims, '9007199254740993');
  assert.equal(result.data.nativeClaims[0].custodyObservation, 'UNAVAILABLE');
  assert.equal(result.data.nativeClaims[1].custodyObservation, 'CURRENT_QUORUM');
  for (const row of result.data.nativeClaims) { assert.equal(row.nativeSelfCustody, false); assert.equal(row.underlyingSpendable, false); }
  hostOnly(result);
  const partial = await portfolio([account(0), account(1, value => { value.current = null; })]);
  partial.nativeClaims = partial.assets.map(asset => nativePosition(asset, false));
  const parsed = (await read(partial)).result; assert.equal(parsed.data.nativeClaims[1].availablePrivateClaims, null);
  assert.equal(parsed.data.nativeClaims[0].availablePrivateClaims, partial.assets[0].balances.available);
});

test('owner route uses only flat owner header, with no public fallback, mutation header or alternate origin', async () => {
  const c = transport(account()), access = { origin, token }, pending = readFlatAccountOwnerPortfolio(access);
  access.origin = 'http://external.invalid:123'; access.token = 'ff'.repeat(32);
  await pending;
  assert.deepEqual(c.calls[0], { hostname: '127.0.0.1', port: 18765, method: 'GET', path: '/api/flat-account/owner',
    agent: false, maxHeaderSize: 8192, headers: { Host: '127.0.0.1:18765', Origin: origin, Accept: 'application/json',
      'Accept-Encoding': 'identity', 'x-flat-owner-token': token } });
  const privateNative = transport({ error: 'NATIVE_CLAIM_OWNER_ACCESS_REQUIRED' }, { status: 403 });
  await readNativeClaimOwnerStatus({ origin, token }); assert.equal(privateNative.calls[0].headers['x-flat-owner-token'], undefined);
  assert.equal(privateNative.calls[0].headers['x-native-owner-token'], token);
  const snapshotNative = transport({}); await readNativeClaimSnapshot({ origin, token });
  assert.equal(snapshotNative.calls[0].path, '/api/native-claims/snapshot');
  assert.equal(snapshotNative.calls[0].headers.Origin, origin);
  assert.equal(snapshotNative.calls[0].headers['x-native-owner-token'], token);
  assert.equal(snapshotNative.calls[0].headers['x-flat-owner-token'], undefined);
  assert.equal(snapshotNative.calls[0].headers['x-native-claim-token'], undefined);
  const denied = await read({ error: 'FLAT_ACCOUNT_OWNER_ACCESS_REQUIRED' }, { status: 403 });
  assert.equal(denied.result.data, null); assert.equal(denied.c.calls.length, 1);
});

test('input injection, missing token, aliases, proxies and accessors fail before any HTTP call', async () => {
  const c = transport(account()); let traps = 0;
  const accessor = Object.defineProperty({ token }, 'origin', { get() { traps++; throw Error('PRIVATE'); } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const input of [{ origin }, { origin, token, path: '/api/flat-account/execute' }, { origin, token, headers: {} },
    { origin, token, method: 'POST' }, { origin, token, rpc: 'eth_sendTransaction' }, { origin, token, timeout: 999 },
    { origin: origin + '\n', token }, { origin: 'http://localhost:18765', token }, { origin, token: token + '\n' }, accessor, revoked.proxy])
    await assert.rejects(readFlatAccountOwnerPortfolio(input), /FLAT_ACCOUNT_OWNER_CLIENT_ACCESS_INVALID/);
  await assert.rejects(readFlatAccountOwnerPortfolio({ origin, token }, {}), /ACCESS_INVALID/);
  assert.equal(c.calls.length, 0); assert.equal(traps, 0);
});

test('bad amounts, impossible accounting, stale dispositions and hidden fields fail closed', async () => {
  const changes = [body => { body.balances.available = 9007199254740993; }, body => { body.balances.available = '1\n'; },
    body => { body.balances.available = '01'; }, body => { body.balances.available = String(1n << 256n); },
    body => { body.balances.available = '-1'; }, body => { body.balances.locked = null; },
    body => { body.balances.recovery = '99999999999999999'; }, body => { body.backing.surplus = '0'; },
    body => { body.backing.deficit = '1'; }, body => { body.status = 'UNAVAILABLE'; }, body => { body.status = 'UNKNOWN'; },
    body => { body.requests[1].disposition = 'APPLIED'; }, body => { body.requests[0].kind = 'EXIT'; },
    body => { body.requests.push(clone(body.requests[0])); }, body => { body.requests = Array(129).fill(body.requests[0]); },
    body => { body.asset.privateKey = token; }, body => { body.requests[0].ownerOperationRef = token; },
    body => { body.positions = [{ privateWitness: token }]; }, body => { body.asset.decimals = 19; }];
  for (const change of changes) {
    const body = clone(account()); change(body); const { result } = await read(body);
    assert.equal(result.readStatus, 'UNAVAILABLE'); assert.equal(result.errorCode, 'FLAT_ACCOUNT_OWNER_CLIENT_RESPONSE_INVALID');
    assert.equal(result.data, null); assert.ok(!JSON.stringify(result).includes(token));
  }
});

test('portfolio coherence, distinct registered assets and native-claim relationships cannot be overstated', async () => {
  const original = await portfolio([account(0), account(1)]); original.nativeClaims = original.assets.map(asset => nativePosition(asset, false));
  for (const change of [body => { body.coherent = false; }, body => { body.observed.blockHash = '00'.repeat(32); },
    body => { body.status = 'PARTIAL'; }, body => { body.assets[1].asset.assetId = body.assets[0].asset.assetId; },
    body => { body.assets.push(clone(body.assets[0])); }, body => { body.nativeClaims[0].assetId = '99'.repeat(32); },
    body => { body.nativeClaims[0].availablePrivateClaims = '0'; }, body => { body.nativeClaims[0].nativeSelfCustody = true; },
    body => { body.nativeClaims[0].underlyingSpendable = true; }, body => { body.nativeClaims[0].custodyObservation = 'VERIFIED'; },
    body => { body.capabilities.fullWalletAcceptance = true; }, body => { body.nativeClaims.push(clone(body.nativeClaims[0])); }]) {
    const body = clone(original); change(body); const { result } = await read(body);
    assert.equal(result.errorCode, 'FLAT_ACCOUNT_OWNER_CLIENT_RESPONSE_INVALID'); assert.equal(result.data, null);
  }
  const partial = await portfolio([account(0), account(1, value => { value.current = null; })]);
  partial.nativeClaims = [nativePosition(partial.assets[0], true)];
  assert.equal((await read(partial)).result.data, null, 'partial portfolio cannot carry a current-quorum claim');
});

test('only bounded label diagnostics are exposed; raw causes, timing, native IDs and extra fields are refused', async () => {
  const original = await portfolio([account(0)]); original.nativeClaims = [{ ...nativePosition(original.assets[0], false),
    custodyDiagnostic: { code: 'CLAIM_PORTFOLIO_CUSTODY_UNAVAILABLE', causeCode: null, causeCodes: [] } }];
  assert.deepEqual((await read(original)).result.data.nativeClaims[0].custodyDiagnostic, original.nativeClaims[0].custodyDiagnostic);
  for (const diagnostic of [
    { code: 'raw private ' + token, causeCode: null, causeCodes: [] },
    { code: 'CLAIM_BAD\n', causeCode: null, causeCodes: [] },
    { code: 'CLAIM_BAD', causeCode: null, causeCodes: [], stack: token },
    { code: 'CLAIM_BAD', causeCode: null, causeCodes: [], nativeId: token },
    { code: 'CLAIM_BAD', causeCode: null, causeCodes: [], auditBudget: { elapsedMilliseconds: 1 } },
    { code: 'CLAIM_BAD', causeCode: 'CLAIM_B', causeCodes: ['CLAIM_A'] },
    { code: 'CLAIM_BAD', causeCode: 'CLAIM_A', causeCodes: Array(5).fill('CLAIM_A') },
  ]) {
    const body = clone(original); body.nativeClaims[0].custodyDiagnostic = diagnostic;
    const { result } = await read(body); assert.equal(result.data, null); assert.ok(!JSON.stringify(result).includes(token));
  }
});

test('HTTP failures, redirects, oversized responses and deadline stay bounded and never retry', async t => {
  for (const [body, options, expected] of [[{ error: 'FLAT_ACCOUNT_OWNER_VIEW_BUSY' }, { status: 409 }, 'FLAT_ACCOUNT_OWNER_VIEW_BUSY'],
    [{ error: 'JOURNAL_STORAGE_UNAVAILABLE' }, { status: 503 }, 'JOURNAL_STORAGE_UNAVAILABLE'],
    [{ error: 'CLAIM_PRIVATE_VALUE' }, { status: 500 }, 'FLAT_ACCOUNT_OWNER_CLIENT_HTTP_ERROR'],
    [{ error: 'PRIVATE ' + token }, { status: 500 }, 'FLAT_ACCOUNT_OWNER_CLIENT_HTTP_ERROR'],
    [{}, { status: 302, headers: { location: 'https://external.invalid/' } }, 'FLAT_ACCOUNT_OWNER_CLIENT_REDIRECT_FORBIDDEN'],
    ['x'.repeat(OWNER_READ_RESPONSE_LIMIT + 1), { headers: { 'content-type': 'application/json' } }, 'FLAT_ACCOUNT_OWNER_CLIENT_RESPONSE_TOO_LARGE']]) {
    const { c, result } = await read(body, options); assert.equal(result.errorCode, expected); assert.equal(result.data, null);
    assert.equal(c.calls.length, 1); assert.ok(!JSON.stringify(result).includes(token)); hostOnly(result);
  }
  t.mock.timers.enable({ apis: ['setTimeout'] }); const c = transport(account(), { stall: true });
  const pending = readFlatAccountOwnerPortfolio({ origin, token }); await Promise.resolve(); t.mock.timers.tick(FLAT_OWNER_READ_TIMEOUT_MS);
  assert.equal((await pending).errorCode, 'FLAT_ACCOUNT_OWNER_CLIENT_TIMEOUT'); assert.equal(c.calls.length, 1); assert.ok(c.destroyed);
});

test('fixed flat-owner response budget survives five seconds and expires at ninety; native journal budgets remain five', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(OWNER_READ_TIMEOUT_MS, 5000); assert.equal(FLAT_OWNER_READ_TIMEOUT_MS, 90000);
  const c = transport(account(), { stall: true }); let settled = false;
  const pending = readFlatAccountOwnerPortfolio({ origin, token });
  pending.then(() => { settled = true; }); await Promise.resolve();
  t.mock.timers.tick(5000); await Promise.resolve(); assert.equal(settled, false); assert.equal(c.destroyed, 0);
  t.mock.timers.tick(84999); await Promise.resolve(); assert.equal(settled, false); assert.equal(c.destroyed, 0);
  t.mock.timers.tick(1); const result = await pending;
  assert.equal(result.errorCode, 'FLAT_ACCOUNT_OWNER_CLIENT_TIMEOUT'); assert.equal(c.calls.length, 1); assert.ok(c.destroyed);

  const completed = transport(account(), { stall: true });
  const laterRead = readFlatAccountOwnerPortfolio({ origin, token }); await Promise.resolve();
  t.mock.timers.tick(5001); assert.equal(completed.destroyed, 0);
  completed.response.emit('data', completed.bytes); completed.response.emit('end'); completed.response.emit('close');
  assert.equal((await laterRead).readStatus, 'RECEIVED'); assert.equal(completed.calls.length, 1);
  t.mock.timers.tick(90000); assert.equal(completed.destroyed, 0, 'completion clears its original timer');

  for (const [read, access] of [[readNativeClaimSnapshot, { origin, token }], [readNativeClaimOwnerStatus, { origin, token }]]) {
    const native = transport({}, { stall: true }); let done = false;
    const operation = read(access); operation.then(() => { done = true; }); await Promise.resolve();
    t.mock.timers.tick(4999); await Promise.resolve(); assert.equal(done, false); assert.equal(native.destroyed, 0);
    t.mock.timers.tick(1); assert.equal((await operation).errorCode, 'NATIVE_CLAIM_STATUS_TIMEOUT');
    assert.equal(native.calls.length, 1); assert.ok(native.destroyed);
  }
});

test('actual session forwards original owner shape without a new server contract or client authority claim', async () => {
  const body = await portfolio([account(0), account(1)]);
  const forbidden = () => assert.fail('NO_EFFECT_OR_SIGNING_ALLOWED');
  const keeper = { prepare: forbidden, execute: forbidden, reconcile: forbidden, recover: forbidden, restartCoordinator: forbidden,
    async snapshot() { return { version: 1, revision: 1, storageAvailable: true, requests: [] }; }, async close() {} };
  const session = await createFlatAccountSession({ keeper, ownerHandoff: { ownerView: async () => body } });
  try { const wire = await session.ownerView(), { result } = await read(wire); assert.deepEqual(result.data, body); hostOnly(result); }
  finally { await session.close(); }
});

test('public owner clients expose fixed read interfaces and issue one GET on each original route', async () => {
  const client = await import('../../../src/api/accounts/flat-account-owner-client.mjs');
  assert.deepEqual(Object.keys(client), ['readFlatAccountOwnerPortfolio']);
  for (const [read, path] of [
    [readNativeClaimSnapshot, '/api/native-claims/snapshot'],
    [readNativeClaimOwnerStatus, '/api/native-claims/owner'],
    [readFlatAccountOwnerPortfolio, '/api/flat-account/owner'],
  ]) {
    const c = transport({}); await read({origin, token});
    assert.equal(c.calls.length, 1); assert.equal(c.calls[0].path, path);
    assert.equal(c.calls[0].method, 'GET');
  }
});

test('versioned generation read uses the same fixed private endpoint without aggregation or a fallback', async () => {
  const assets = [clone(account(0)), clone(account(1))];
  assets.forEach((asset, index) => asset.requests.forEach(row => { row.requestId += '_' + index; }));
  const generations = await Promise.all(assets.map(async (asset, index) => ({ generationId: String(index + 5).repeat(64),
    routes: [{ assetId: asset.asset.assetId, pool: String(index + 1).repeat(40), domainCommitment: '0'.repeat(63) + String(index + 1) }],
    portfolio: await portfolio([asset]), errorCode: null })));
  const body = { version: 2, profile: 'FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2', status: 'LIVE', coherent: true,
    observed: clone(assets[0].observed), generations, capabilities: { coordinatorRestart: true, keeperRestart: false,
      nodeRestart: false, privateBalancesAggregated: false, implicitNoteMigration: false, fullWalletAcceptance: false } };
  const { c, result } = await read(body); assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0].path, '/api/flat-account/owner'); assert.equal(result.payloadKind, 'IMMUTABLE_JOURNAL_GENERATIONS');
  assert.deepEqual(result.data, body); assert.equal(result.data.generations[0].portfolio.assets[0].balances.available, '9007199254740993');
  assert.ok(Object.isFrozen(result.data.generations[0].routes));hostOnly(result);
  const bad = clone(body); bad.generations[1].routes[0].assetId=bad.generations[0].routes[0].assetId;
  const rejected=await read(bad);assert.equal(rejected.result.readStatus,'UNAVAILABLE');assert.equal(rejected.c.calls.length,1);
});
