/** SDK transport/workflow checks only. Effectful replies below are synthetic;
 * the one actual application listener is owned, disconnected and read-only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { startWalletApplication } from '../../../wallet-app/server.mjs';
import { ALL_ACTIONS, ACCOUNT_ACTIONS, DEFI_ACTIONS, WALLET_PROFILE, DEFI_PROFILE,
  NATIVE_IDENTITY_PROFILE } from '../../../wallet-app/public/view-model.mjs';
import { createWalletApplicationClient } from './wallet-application-client.mjs';

const ownerToken = 'a'.repeat(64), actionToken = 'b'.repeat(64);
const requestId = 'original_sdk_request_01', intentId = 'c'.repeat(64), assetId = 'd'.repeat(64);
const identity = () => ({ version: 1, profile: NATIVE_IDENTITY_PROFILE, accountId: 'sdk_original_account',
  claimDomain: '1'.repeat(64), nativeFamily: '2', nativeGenesis: '2'.repeat(64), nativeAsset: '3'.repeat(64),
  wrapperAssetIdentity: '4'.repeat(64), claimSymbol: 'cSOL', nativeSymbol: 'SOL', decimals: 9,
  atomicUnit: 'lamport', observation: 'ORIGINAL_BOUND_CONFIGURATION_ONLY' });
const fixture = (accountState = 'PREPARED') => ({ version: 1, profile: WALLET_PROFILE, connection: 'CONNECTED',
  portfolio: { version: 1, status: 'LIVE', asset: { assetId, symbol: 'CBTC', decimals: 8 },
    observed: { blockNumber: '42' }, balances: { available: '9007199254740993', reserved: '2', recovery: '3', locked: '4' },
    requests: [{ requestId, kind: 'EXIT', state: 'CONFIRMED', disposition: 'APPLIED' }] },
  nativeClaims: { identity: identity(), snapshot: { phase: 'READY', storageAvailable: true, busy: false, queued: 0,
    requests: [], observation: 'DURABLE_JOURNAL_ONLY' }, owner: { deposits: [], tickets: [], requests: [] } },
  account: { snapshot: { version: 1, profile: 'LOCAL_FLAT_ACCOUNT_API_V1', phase: 'READY', available: true,
    busy: false, queued: 0, storageAvailable: true, observation: 'CURRENT', revision: 1,
    requests: [{ requestId, kind: 'EXIT', state: accountState, errorCode: null }], admissions: [] } },
  defi: { snapshot: { version: 1, profile: DEFI_PROFILE,
    operations: [{ requestId, phase: 'READY_TO_REDEEM', sendBlocked: false }] } },
  capabilities: { ...Object.fromEntries(Object.values(ALL_ACTIONS).map(action => [action.capability, true])), graphExecution: false },
  errors: { portfolio: null, nativeClaims: null, account: null, defi: null } });
const bodies = { deposit: { requestId, intentId }, redeem: { requestId, amount: '9007199254740993', maxFee: '1001' },
  refund: { requestId, intentId }, reconcile: { requestId }, resume: { requestId },
  accountPrepare: { requestId: 'new_sdk_request_01', kind: 'EXIT', ownerOperationRef: 'e'.repeat(64), assetId },
  accountExecute: { requestId }, accountReconcile: { requestId },
  defiPrepare: { requestId, minimumOutput: '99', deadline: '1300' },
  defiExecute: { requestId }, defiReconcile: { requestId }, defiReopen: {},
  defiRequote: { requestId, minimumOutput: '99', deadline: '1300' } };
function actionReply(action, body) {
  if (Object.hasOwn(ACCOUNT_ACTIONS, action)) return [200, { version: 1, profile: 'FLAT_ACCOUNT_VOLATILE_ADMISSION_V1',
    acceptance: 'VOLATILE_UI_QUEUE_ONLY', durableAdmissionEstablished: false, settlementEstablished: false,
    admission: { version: 1, admitted: true, sequence: 1, action: ACCOUNT_ACTIONS[action].command, requestId: body.requestId } }];
  if (Object.hasOwn(DEFI_ACTIONS, action)) return [200, action === 'defiReopen'
    ? { reopened: true, originalIdentitiesRetained: true, keeperRestart: false, requestIds: [requestId] }
    : { version: 1, profile: DEFI_PROFILE, requestId: body.requestId, phase: 'READY_TO_REDEEM',
      underlyingPrivateSpendable: false, underlyingLocation: 'EXTERNAL_OWNER_ADDRESS', redemptionPublic: true }];
  return [202, { admitted: true, action, requestId: body.requestId }];
}
function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}
async function ownedFixture(t, handler) {
  const calls = [], sockets = new Set();
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const call = { method: request.method, path: request.url, headers: request.headers,
      body: Buffer.concat(chunks).toString('utf8') };
    calls.push(call);
    handler(call, response, request);
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); for (const socket of sockets) socket.destroy(); }));
  return { origin: 'http://127.0.0.1:' + server.address().port, calls };
}
const clientFor = (fixture, readOnly = false) => createWalletApplicationClient({ origin: fixture.origin,
  ownerToken, ...(readOnly ? {} : { actionToken }) });

test('actual owned disconnected app: explicit authenticated read, no synthetic balances or effects', async t => {
  const app = await startWalletApplication();
  t.after(() => app.close());
  const client = createWalletApplicationClient({ origin: app.origin, ownerToken: app.ownerAccess.token });
  assert.equal(client.getState().data, null);
  assert.equal(await client.refresh(), true);
  assert.equal(client.getState().data.connection, 'DISCONNECTED');
  assert.equal(client.getState().data.portfolio, null);
  assert.equal(client.getState().data.nativeClaims, null);
  for (const action of Object.keys(ALL_ACTIONS).filter(action => !action.startsWith('wrappedWithdraw'))) assert.equal(client.can(action), false);
  assert.equal(await client.confirm(), false);
  assert.equal(JSON.stringify(client.getState()).includes(app.ownerAccess.token), false);
  const wrong = createWalletApplicationClient({ origin: app.origin, ownerToken });
  assert.equal(await wrong.refresh(), false);
  assert.equal(wrong.getState().data, null);
  assert.deepEqual(await app.close(), { listenerClosed: true, originalSessionsRetained: true, durableJobsCancelled: false });
  assert.equal(await client.refresh(), false);
  assert.equal(client.getState().stale, true);
});

test('constructor accepts only exact immutable bootstrap scalars and leaks no invalid inputs', () => {
  const good = { origin: 'http://127.0.0.1:12345', ownerToken };
  const invalid = [undefined, null, [], Object.create(null), new Proxy(good, {}), { ...good, extra: true },
    { ...good, actionToken: undefined }, { ...good, actionToken: '' }, { ...good, ownerToken: 'root-key-invalid' },
    { ...good, ownerToken: ownerToken + '\n' }, { ...good, actionToken: actionToken.toUpperCase() },
    { ...good, fetchImpl() {} }, { ...good, timeoutMs: 1 }, { ...good, [Symbol('path')]: '/admin' }];
  for (const origin of ['http://localhost:12345', 'https://127.0.0.1:12345', 'http://[::1]:12345',
    'http://127.0.0.1', 'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://127.0.0.1:01234',
    'http://127.1:12345', 'http://2130706433:12345', 'http://127.0.0.1:12345/',
    'http://127.0.0.1:12345?token=secret', 'http://127.0.0.1:12345#secret',
    'http://secret@127.0.0.1:12345', 'http://127.0.0.1:12345\n']) invalid.push({ ...good, origin });
  let getterCalls = 0;
  invalid.push({ ...good, get actionToken() { getterCalls++; throw Error('secret'); } });
  for (const input of invalid) assert.throws(() => createWalletApplicationClient(input),
    { message: 'WALLET_APPLICATION_CLIENT_ACCESS_INVALID', code: 'WALLET_APPLICATION_CLIENT_ACCESS_INVALID' });
  assert.equal(getterCalls, 0);
  assert.throws(() => createWalletApplicationClient(good, 'extra'), /ACCESS_INVALID/);
  for (const port of [1, 65535]) assert.ok(createWalletApplicationClient({ ...good, origin: 'http://127.0.0.1:' + port }));
  Object.defineProperty(Object.prototype, 'actionToken', { get() { getterCalls++; throw Error('inherited-token'); }, configurable: true });
  try { assert.ok(createWalletApplicationClient(good)); assert.equal(getterCalls, 0); }
  finally { delete Object.prototype.actionToken; }
});

test('read-only mode, detached state, fixed headers and no construction/subscription I/O', async t => {
  const fixture = await ownedFixture(t, (_, response) => send(response, 200, globalFixture()));
  const input = { origin: fixture.origin, ownerToken };
  const client = createWalletApplicationClient(input);
  input.origin = 'http://127.0.0.1:1'; input.ownerToken = 'f'.repeat(64); input.actionToken = actionToken;
  assert.ok(Object.isFrozen(client));
  assert.deepEqual(Object.keys(client).sort(), ['can', 'cancelReview', 'confirm', 'getState', 'refresh', 'review', 'subscribe']);
  const seen = []; const unsubscribe = client.subscribe(state => { seen.push(state); state.stale = true; });
  assert.equal(fixture.calls.length, 0);
  assert.equal(await client.refresh(), true);
  assert.equal(fixture.calls.length, 1);
  assert.equal(client.getState().stale, false);
  const state = client.getState(); state.data.portfolio.balances.available = '0';
  assert.equal(client.getState().data.portfolio.balances.available, '9007199254740993');
  for (const action of Object.keys(ALL_ACTIONS).filter(action => !action.startsWith('wrappedWithdraw'))) { assert.equal(client.can(action), false); assert.throws(() => client.review(action, bodies[action])); }
  assert.equal(await client.confirm(), false);
  unsubscribe(); assert.ok(seen.length >= 3);
  assert.equal(fixture.calls[0].path, '/api/wallet/state');
  assert.equal(fixture.calls[0].body, '');
  assert.equal(fixture.calls[0].headers.origin, fixture.origin);
  assert.equal(fixture.calls[0].headers.host, fixture.origin.slice(7));
  assert.equal(fixture.calls[0].headers['x-wallet-owner-token'], ownerToken);
  assert.equal(fixture.calls[0].headers['x-wallet-action-token'], undefined);
  assert.equal(fixture.calls[0].headers.cookie, undefined);
});
// Avoid shadowing the fixture data factory inside listener tests.
const globalFixture = fixture;

test('all original legacy manual action routes reuse reviews and preserve distinct acceptance semantics', async t => {
  for (const [action, spec] of Object.entries(ALL_ACTIONS).filter(([action]) => Object.hasOwn(bodies, action))) await t.test(action, async t => {
    const value = fixture(action === 'accountReconcile' ? 'UNKNOWN' : 'PREPARED');
    const listener = await ownedFixture(t, (call, response) => {
      if (call.method === 'GET') return send(response, 200, value);
      const [status, result] = actionReply(action, JSON.parse(call.body)); send(response, status, result);
    });
    const client = clientFor(listener); assert.equal(await client.refresh(), true);
    const review = client.review(action, bodies[action]);
    assert.equal(listener.calls.length, 1);
    assert.deepEqual(review.body, bodies[action]);
    if (review.nativeIdentity) {
      assert.equal(review.nativeIdentity.nativeSymbol, 'SOL');
      assert.equal(review.nativeIdentity.wrapperAssetIdentity, identity().wrapperAssetIdentity);
      assert.notEqual(review.nativeIdentity.wrapperAssetIdentity, assetId);
    }
    client.cancelReview(); assert.equal(await client.confirm(), false);
    const second = client.review(action, bodies[action]);
    second.body.requestId = 'replacement_request';
    assert.equal(await client.confirm(), true);
    assert.equal(await client.confirm(), false);
    assert.equal(listener.calls.length, 2);
    assert.equal(listener.calls[1].method, 'POST');
    assert.equal(listener.calls[1].path, spec.route);
    assert.deepEqual(JSON.parse(listener.calls[1].body), bodies[action]);
    assert.equal(listener.calls[1].headers['x-wallet-action-token'], actionToken);
    assert.equal(listener.calls[1].headers['x-wallet-owner-token'], undefined);
    assert.equal(listener.calls[1].headers.origin, listener.origin);
    assert.equal(listener.calls[1].headers['content-length'], String(Buffer.byteLength(listener.calls[1].body)));
    const group = Object.hasOwn(ACCOUNT_ACTIONS, action) ? 'account' : Object.hasOwn(DEFI_ACTIONS, action) ? 'defi' : 'native';
    assert.equal(client.getState().outcome.state, group === 'account' ? 'VOLATILE_QUEUE_ACCEPTANCE' : group === 'defi' ? 'SERVICE_RESULT' : 'ADMITTED');
    assert.equal(client.getState().originalRequestIds[group], bodies[action].requestId ?? null);
    assert.equal(client.getState().stale, true);
    assert.equal(client.can(action), false);
  });
});

test('shared validation rejects GRAPH, replacement fields and arbitrary actions without wire calls', async t => {
  const listener = await ownedFixture(t, (_, response) => send(response, 200, fixture()));
  const client = clientFor(listener); await client.refresh();
  for (const action of ['graph', 'sign', '/api/wallet/native/redeem', '__proto__', 'toString']) {
    assert.equal(client.can(action), false); assert.throws(() => client.review(action, {}));
  }
  for (const body of [{ ...bodies.redeem, destination: 'other' }, { ...bodies.redeem, amount: 5 },
    { ...bodies.redeem, requestId: requestId + '\n' }, { ...bodies.redeem, amount: '0' }]) assert.throws(() => client.review('redeem', body));
  assert.throws(() => client.review('accountPrepare', { ...bodies.accountPrepare, kind: 'GRAPH' }));
  assert.throws(() => client.review('accountExecute', { requestId: 'replacement_unknown_id' }));
  assert.equal(listener.calls.length, 1);
});

test('busy journals, stale fallback and changed native identity keep the shared fences', async t => {
  let value = fixture(), failed = false;
  const listener = await ownedFixture(t, (_, response) => send(response, failed ? 500 : 200, failed ? { error: ownerToken } : value));
  const client = clientFor(listener); await client.refresh();
  client.review('redeem', bodies.redeem);
  value.account.snapshot.busy = true;
  await client.refresh(); assert.equal(client.getState().review, null);
  for (const action of Object.keys(ALL_ACTIONS).filter(action => !action.startsWith('wrappedWithdraw'))) assert.equal(client.can(action), false);
  value = fixture(); value.nativeClaims.identity.claimDomain = '5'.repeat(64);
  await client.refresh(); assert.equal(client.getState().nativeIdentityMismatch, true);
  assert.equal(client.can('redeem'), false); assert.equal(client.can('reconcile'), true);
  failed = true; assert.equal(await client.refresh(), false);
  assert.equal(client.getState().stale, true); assert.equal(client.can('reconcile'), false);
  assert.equal(client.getState().data.portfolio.balances.available, '9007199254740993');
  assert.equal(JSON.stringify(client.getState()).includes(ownerToken), false);
  assert.equal(await client.confirm(), false);
  assert.equal(listener.calls.every(call => call.method === 'GET'), true);
});

test('double confirm and refresh during a pending action never start concurrent requests', async t => {
  let finish, started; const observed = new Promise(resolve => { started = resolve; });
  const listener = await ownedFixture(t, (call, response) => {
    if (call.method === 'GET') return send(response, 200, fixture());
    finish = () => send(response, ...actionReply('redeem', bodies.redeem)); started();
  });
  const client = clientFor(listener); await client.refresh(); client.review('redeem', bodies.redeem);
  const pending = client.confirm(); await observed;
  assert.equal(client.getState().sending, true);
  client.cancelReview(); assert.equal(client.getState().sending, true);
  assert.equal(await client.confirm(), false); assert.equal(await client.refresh(), false);
  assert.equal(listener.calls.length, 2); finish(); assert.equal(await pending, true);
  assert.equal(listener.calls.length, 2);
});

test('lost and misleading action replies remain UNKNOWN with the original ID, never resend', async t => {
  const failures = [(_, response) => response.destroy(),
    (_, response) => send(response, 500, { error: 'synthetic ' + actionToken }),
    (_, response) => send(response, 202, { admitted: true, action: 'redeem', requestId: 'replacement_unknown_id' }),
    (_, response) => send(response, 200, { settled: true })];
  for (const fail of failures) await t.test('unknown original', async t => {
    const listener = await ownedFixture(t, (call, response) => call.method === 'GET' ? send(response, 200, fixture()) : fail(call, response));
    const client = clientFor(listener); await client.refresh(); client.review('redeem', bodies.redeem);
    assert.equal(await client.confirm(), false);
    assert.deepEqual(client.getState().outcome, { state: 'UNKNOWN', action: 'redeem', requestId });
    assert.equal(client.getState().originalRequestIds.native, requestId);
    assert.equal(await client.confirm(), false); assert.equal(client.can('redeem'), false);
    assert.equal(listener.calls.length, 2);
    assert.equal(JSON.stringify(client.getState()).includes(actionToken), false);
  });
});

test('read failures reject redirects, excessive/encoded/broken/ambiguous data and schema drift', async t => {
  let redirectHits = 0;
  const target = await ownedFixture(t, (_, response) => { redirectHits++; send(response, 200, fixture()); });
  const failures = [
    response => send(response, 302, {}, { Location: target.origin + '/api/wallet/state' }),
    response => send(response, 200, fixture(), { 'Content-Encoding': 'gzip' }),
    response => send(response, 200, fixture(), { 'Transfer-Encoding': 'gzip' }),
    response => send(response, 200, fixture(), { 'Content-Type': 'text/plain' }),
    response => send(response, 200, fixture(), { 'Content-Length': String(256 * 1024 + 1) }),
    response => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('x'.repeat(256 * 1024 + 1)); },
    response => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{'); },
    response => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(Buffer.from([0xff])); },
    response => send(response, 200, fixture(), { 'X-Oversized': 'x'.repeat(9000) }),
    response => { response.writeHead(200, { 'Content-Type': ['application/json', 'application/json'] }); response.end('{}'); },
    response => send(response, 200, { ...fixture(), capabilities: { ...fixture().capabilities, graphExecution: true } }),
    response => send(response, 200, { ...fixture(), profile: 'UNEXPECTED_SCHEMA' }),
  ];
  for (let index = 0; index < failures.length; index++) await t.test('bounded failure ' + index, async t => {
    const listener = await ownedFixture(t, (_, response) => failures[index](response));
    const client = clientFor(listener); assert.equal(await client.refresh(), false);
    assert.equal(client.getState().data, null); assert.equal(client.getState().stale, true);
    assert.equal(listener.calls.length, 1);
  });
  assert.equal(redirectHits, 0);
});

test('production bridge has one shared workflow and no alternate public transport surface', async () => {
  const source = await readFile(new URL('./wallet-application-client.mjs', import.meta.url), 'utf8');
  const module = await import('./wallet-application-client.mjs');
  assert.deepEqual(Object.keys(module), ['createWalletApplicationClient']);
  assert.match(source, /import \{ ALL_ACTIONS, createWalletClient \} from '\.\.\/\.\.\/\.\.\/wallet-app\/public\/view-model\.mjs'/);
  assert.doesNotMatch(source, /setInterval|localStorage|sessionStorage|console\.|process\.env|node:fs|fetch\(/);
  assert.equal((source.match(/httpRequest\(/g) ?? []).length, 1);
});

// New wrapped routes are exercised with the actual original service/journal in
// the dedicated wrapped withdrawal campaign. This legacy DTO cannot authorize them.
test('wrapped withdrawal actions reject a legacy-only SDK fixture without any POST', async t => {
  for (const action of Object.keys(ALL_ACTIONS).filter(name => name.startsWith('wrappedWithdraw'))) {
    const listener = await ownedFixture(t, (_call, response) => send(response, 200, fixture()));
    const client = clientFor(listener); assert.equal(await client.refresh(), true); assert.equal(client.can(action), false);
    assert.throws(() => client.review(action, { requestId, termsSHA256: '1'.repeat(64), ...(action === 'wrappedWithdrawPrepare' ? { role: 'recipient' } : {}) }));
    assert.equal(listener.calls.length, 1);
  }
});
