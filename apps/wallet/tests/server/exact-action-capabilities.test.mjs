/** Synthetic session/service boundaries, real server + shared SDK + loopback
 * HTTP only. No keys, native nodes, proofs, funds, or persistent admission. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { performance } from 'node:perf_hooks';
import { ALL_ACTIONS, ACCOUNT_ACTIONS, DEFI_ACTIONS, NATIVE_IDENTITY_PROFILE } from '../../src/client/state/view-model.mjs';
import { validateFlatAccountPrepare } from '../../../../packages/backend/src/api/accounts/flat-account-session.mjs';
import { createWalletApplicationClient } from '../../../../packages/backend/src/api/wallet/wallet-application-client.mjs';

const nativeSet = new WeakSet(), accountSet = new WeakSet(), defiMap = new WeakMap();
const error = code => Object.assign(new Error(code), { code });
const identity = Object.freeze({ version: 1, profile: NATIVE_IDENTITY_PROFILE, accountId: 'original_account_01',
  claimDomain: '1'.repeat(64), nativeFamily: '2', nativeGenesis: '2'.repeat(64), nativeAsset: '3'.repeat(64),
  wrapperAssetIdentity: '4'.repeat(64), claimSymbol: 'cSOL', nativeSymbol: 'SOL', decimals: 9,
  atomicUnit: 'lamport', observation: 'ORIGINAL_BOUND_CONFIGURATION_ONLY' });
mock.module('../wallet-platform/modules/api/native-claim-session.mjs', { exports: {
  assertWalletClaimSession(value) { if (!nativeSet.has(value)) throw error('NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED'); },
  walletClaimSessionIdentity(value) { if (!nativeSet.has(value)) throw error('NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED'); return identity; },
  assertNativeClaimSession(value) { if (!nativeSet.has(value)) throw error('NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED'); },
  nativeClaimSessionIdentity(value) { if (!nativeSet.has(value)) throw error('NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED'); return identity; },
} });
mock.module('../wallet-platform/modules/api/flat-account-session.mjs', { exports: {
  validateFlatAccountPrepare,
  assertFlatAccountSession(value) { if (!accountSet.has(value)) throw error('FLAT_ACCOUNT_ORIGINAL_SESSION_REQUIRED'); },
} });
mock.module('../wallet-platform/modules/defi-adapters/private-vault-exit.mjs', { exports: {
  assertOwnedPrivateVaultExit(runtime, service) { if (defiMap.get(service) !== runtime) throw error('PRIVATE_VAULT_EXIT_OWNED_CAPABILITY_REQUIRED'); },
} });
const { startWalletApplication } = await import('../../src/server/server.mjs');
const requestId = 'original_capability_01', intentId = '5'.repeat(64), assetId = '6'.repeat(64);
const bodies = { deposit: { requestId, intentId }, refund: { requestId, intentId },
  redeem: { requestId, amount: '123', maxFee: '2' }, reconcile: { requestId }, resume: { requestId },
  defiPrepare: { requestId, minimumOutput: '12', deadline: '9999' },
  defiRequote: { requestId, minimumOutput: '12', deadline: '9999' },
  defiExecute: { requestId }, defiReconcile: { requestId }, defiReopen: {},
  accountPrepare: { requestId, kind: 'TOP_UP', ownerOperationRef: '7'.repeat(64), assetId },
  accountExecute: { requestId }, accountReconcile: { requestId }, accountRecover: { requestId } };
const deferred = () => { let resolve; const promise = new Promise(yes => resolve = yes); return { promise, resolve }; };
function fixture(action = 'deposit') {
  const calls = { snapshot: 0, submit: [], defi: [], owner: 0 }, control = {};
  const rows = action === 'accountPrepare' ? [] : [{ requestId, kind: 'TOP_UP', state: action === 'accountReconcile' ? 'UNKNOWN' : 'PREPARED', errorCode: null }];
  async function journal() { calls.snapshot++; if (control.snapshot) await control.snapshot(); if (control.snapshotError) throw error(control.snapshotError); }
  const native = Object.freeze({ async snapshot() { await journal(); return { version: 1, phase: 'READY', storageAvailable: true,
    busy: false, queued: 0, requests: [], requiresExternalEffectReconciliation: false }; },
    async ownerView() { calls.owner++; return { deposits: [], tickets: [], requests: [] }; },
    async submit(action, input) { calls.submit.push({ group: 'native', action, input: structuredClone(input) });
      if (control.submit) return control.submit(action, input);
      return { version: 1, admitted: true, action, requestId: input.requestId, state: 'ADMITTED' }; } });
  const account = Object.freeze({ async snapshot() { await journal(); return { version: 1, profile: 'LOCAL_FLAT_ACCOUNT_API_V1',
    phase: 'READY', available: true, busy: false, queued: 0, storageAvailable: true, observation: 'CURRENT', revision: 0, requests: rows, admissions: [] }; },
    async ownerView() { calls.owner++; return { version: 1, status: 'LIVE', asset: { assetId, symbol: 'TEST', decimals: 6 },
      observed: { blockNumber: '1' }, balances: { available: '100', reserved: '0', recovery: '0', locked: '0' },
      requests: rows.map(row => ({ ...row })) }; },
    submit(action, input) { calls.submit.push({ group: 'account', action, input: structuredClone(input) });
      return { version: 1, sequence: 1, admitted: true, action, requestId: input.requestId }; } });
  const runtime = Object.freeze({ synthetic: true });
  const service = { async snapshot() { return { version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1',
    operations: [{ requestId, phase: 'READY_TO_REDEEM', sendBlocked: false }] }; } };
  for (const action of ['prepare', 'requote', 'execute', 'reconcile', 'reopen']) service[action] = async (...args) => {
    calls.defi.push({ action, args: structuredClone(args) });
    return action === 'reopen' ? { reopened: true, originalIdentitiesRetained: true, keeperRestart: false, requestIds: [] }
      : { version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1', requestId: args[0]?.requestId ?? args[0], phase: 'READY_TO_REDEEM',
        underlyingPrivateSpendable: false, underlyingLocation: 'EXTERNAL_OWNER_ADDRESS', redemptionPublic: true };
  };
  Object.freeze(service); nativeSet.add(native); accountSet.add(account); defiMap.set(service, runtime);
  return { calls, control, options: { nativeClaimSession: native, accountSession: account, defiExit: { runtime, service } } };
}
async function app(t, options = {}) { const value = await startWalletApplication({ actionAccessMode: 'exact-only', ...options }); t.after(() => value.close()); return value; }
function http(app, path, { method = 'GET', token, body, raw, origin = app.origin, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const bytes = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const req = httpRequest({ hostname: '127.0.0.1', port: Number(new URL(app.origin).port), path, method, agent: false,
      headers: { Origin: origin, ...(token ? { 'x-wallet-action-token': token } : {}),
        ...(bytes !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) } : {}), ...headers } }, res => {
      const chunks = []; res.on('error', reject); res.on('data', chunk => chunks.push(chunk)); res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject); req.end(bytes);
  });
}
const issue = (app, action = 'deposit', extra = {}) => app.issueActionCapability({ action, body: bodies[action], ...extra });
const post = (app, cap, action = 'deposit', body = bodies[action], extra = {}) => http(app, ALL_ACTIONS[action].route,
  { method: 'POST', token: cap.token, body, ...extra });
const read = app => http(app, '/api/wallet/state', { headers: { 'x-wallet-owner-token': app.ownerAccess.token } });
const client = (app, cap) => createWalletApplicationClient({ origin: cap.origin, ownerToken: app.ownerAccess.token, actionToken: cap.token });

test('all existing shared actions use one exact capability through the unchanged manual SDK', async t => {
  for (const action of Object.keys(ALL_ACTIONS).filter(action => !action.startsWith('wrappedWithdraw')).filter(action => action !== 'accountRecover')) await t.test(action, async t => {
    const f = fixture(action), server = await app(t, f.options), cap = issue(server, action);
    assert.deepEqual(Object.keys(cap).sort(), ['origin', 'token']); assert.ok(Object.isFrozen(cap));
    assert.match(cap.token, /^[a-f0-9]{64}$/); assert.equal(f.calls.snapshot, 0, 'issuance does no I/O');
    const sdk = client(server, cap); assert.equal(await sdk.refresh(), true); sdk.review(action, bodies[action]);
    assert.equal(await sdk.confirm(), true); assert.equal(await sdk.confirm(), false);
    const group = Object.hasOwn(ACCOUNT_ACTIONS, action) ? 'account' : Object.hasOwn(DEFI_ACTIONS, action) ? 'defi' : 'native';
    assert.equal(sdk.getState().outcome.state, group === 'account' ? 'VOLATILE_QUEUE_ACCEPTANCE' : group === 'defi' ? 'SERVICE_RESULT' : 'ADMITTED');
    const before = f.calls.submit.length + f.calls.defi.length;
    assert.equal((await post(server, cap, action)).status, 403);
    assert.equal(f.calls.submit.length + f.calls.defi.length, before);
    assert.ok(!JSON.stringify(sdk.getState()).includes(cap.token));
  });
});

test('manual default preserves broad multi-action access; exact-only exposes no broad bearer or mint route', async t => {
  const f = fixture(), manual = await startWalletApplication(f.options); t.after(() => manual.close());
  assert.match(manual.actionAccess.token, /^[a-f0-9]{64}$/);
  assert.equal((await post(manual, manual.actionAccess)).status, 202);
  assert.equal((await post(manual, manual.actionAccess, 'redeem')).status, 202);
  assert.ok((await http(manual, '/')).text.includes(manual.actionAccess.token));
  assert.equal((await post(manual, issue(manual))).status, 202);
  const exact = await app(t, f.options), cap = issue(exact);
  assert.equal(Object.hasOwn(exact, 'actionAccess'), false);
  assert.equal((await post(exact, manual.actionAccess)).status, 403);
  const page = await http(exact, '/'); assert.match(page.text, /name="wallet-action-token" content=""/);
  for (const path of ['/', '/app.mjs', '/view-model.mjs', '/style.css']) {
    const asset = await http(exact, path); assert.equal(asset.status, 200);
    assert.ok(!asset.text.includes(cap.token)); assert.ok(!asset.text.includes(manual.actionAccess.token));
  }
  assert.equal((await post(exact, exact.ownerAccess)).status, 403);
  const reader = createWalletApplicationClient({ origin: exact.origin, ownerToken: exact.ownerAccess.token });
  assert.equal(await reader.refresh(), true);
  for (const action of Object.keys(ALL_ACTIONS).filter(action => !action.startsWith('wrappedWithdraw'))) assert.equal(reader.can(action), false);
  assert.ok(!(await read(exact)).text.includes(cap.token));
  for (const path of ['/api/wallet/capabilities', '/api/wallet/capabilities/mint', '/api/wallet/sign', '/api/wallet/rpc'])
    assert.equal((await http(exact, path, { method: 'POST', token: cap.token, body: {} })).status, 404);
  assert.equal((await post(exact, cap)).status, 202);
});

test('canonical exact body binds every field, preserves field ordering freedom, rejects route/server substitution', async t => {
  const f = fixture(), a = await app(t, f.options), b = await app(t, f.options);
  const original = { ...bodies.redeem }, cap = issue(a, 'redeem', { body: original }); original.amount = '999';
  for (const body of [{ ...bodies.redeem, amount: '124' }, { ...bodies.redeem, maxFee: '3' },
    { ...bodies.redeem, requestId: 'another_original' }, { ...bodies.redeem, amount: 123 },
    { ...bodies.redeem, amount: '0123' }, { ...bodies.redeem, recipient: 'replacement' }])
    assert.equal((await post(a, cap, 'redeem', body)).status, 403);
  assert.equal((await post(a, cap, 'deposit')).status, 403);
  assert.equal((await post(b, cap, 'redeem')).status, 403);
  assert.equal(f.calls.snapshot, 0); assert.equal(f.calls.submit.length, 0);
  const reordered = { maxFee: '2', amount: '123', requestId };
  assert.equal((await post(a, cap, 'redeem', reordered, { raw: JSON.stringify(reordered, null, 2) })).status, 202);
  assert.equal((await post(a, cap, 'redeem')).status, 403);
  assert.deepEqual(f.calls.submit[0].input, reordered);
});

test('consumption precedes first journal await, survives failures, and concurrent replay cannot admit', async t => {
  const f = fixture(), server = await app(t, f.options), cap = issue(server), entered = deferred(), release = deferred();
  t.after(() => release.resolve()); f.control.snapshot = async () => { entered.resolve(); await release.promise; };
  const first = post(server, cap); await entered.promise;
  assert.equal(f.calls.submit.length, 0);
  assert.equal((await post(server, cap)).status, 403, 'consumed before current-journal await');
  f.control.snapshotError = 'NATIVE_CLAIM_JOURNAL_UNAVAILABLE'; release.resolve();
  assert.equal((await first).status, 503); delete f.control.snapshot; delete f.control.snapshotError;
  assert.equal((await post(server, cap)).status, 403); assert.equal(f.calls.submit.length, 0);
  const failed = issue(server); f.control.submit = async () => { throw error('NATIVE_CLAIM_ORIGINAL_OUTCOME_UNRESOLVED'); };
  const rejected = await post(server, failed);
  assert.equal(rejected.json.error, 'NATIVE_CLAIM_ORIGINAL_OUTCOME_UNRESOLVED'); assert.ok(rejected.status >= 400);
  assert.equal((await post(server, failed)).status, 403); assert.equal(f.calls.submit.length, 1);
});

test('monotonic deadline gates admission, including expiry during body read; expiry never cancels consumed work', async t => {
  let now = 1000; t.mock.method(performance, 'now', () => now);
  const f = fixture(), server = await app(t, f.options), expired = issue(server, 'deposit', { ttlMs: 1 });
  now++; assert.equal((await post(server, expired)).status, 403); assert.equal(f.calls.snapshot, 0);
  const cap = issue(server, 'deposit', { ttlMs: 1 }), entered = deferred(), release = deferred();
  t.after(() => release.resolve()); f.control.snapshot = async () => { entered.resolve(); await release.promise; };
  const first = post(server, cap); await entered.promise; now += 1000; release.resolve();
  assert.equal((await first).status, 202, 'expiry does not cancel already-consumed admission');
  assert.equal((await post(server, cap)).status, 403); delete f.control.snapshot;
  const slow = issue(server, 'deposit', { ttlMs: 1 }), bytes = JSON.stringify(bodies.deposit);
  let slowRequest;
  const done = new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: Number(new URL(server.origin).port), path: ALL_ACTIONS.deposit.route,
      method: 'POST', agent: false, headers: { Origin: server.origin, 'x-wallet-action-token': slow.token,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); slowRequest = req; req.flushHeaders(); req.write(bytes.slice(0, 1));
  });
  assert.equal((await read(server)).json.error, 'WALLET_READ_BUSY', 'server reached the incomplete-body await');
  now++; slowRequest.end(bytes.slice(1));
  assert.equal(await done, 403); assert.equal(f.calls.submit.length, 1);
});

test('disconnected and unrelated bindings cannot mint capabilities for sessions supplied later', async t => {
  const f = fixture(), disconnected = await app(t);
  for (const action of Object.keys(ALL_ACTIONS).filter(action => !action.startsWith('wrappedWithdraw'))) assert.throws(() => issue(disconnected, action), /CAPABILITY_UNAVAILABLE/);
  disconnected.bindSessions({ nativeClaimSession: f.options.nativeClaimSession });
  const cap = issue(disconnected); assert.equal((await post(disconnected, cap)).status, 202);
  assert.throws(() => issue(disconnected, 'accountPrepare'), /CAPABILITY_UNAVAILABLE/);
  assert.throws(() => issue(disconnected, 'defiPrepare'), /CAPABILITY_UNAVAILABLE/);
  assert.throws(() => disconnected.bindSessions(f.options), /BINDING_ALREADY_FIXED/);
  await disconnected.close(); assert.throws(() => issue(disconnected), /CAPABILITY_UNAVAILABLE/);
});

test('issuance rejects malformed shared bodies and hostile bootstrap records without invoking them', async t => {
  const f = fixture(), server = await app(t, f.options); let touched = 0;
  const getter = {}; Object.defineProperty(getter, 'requestId', { enumerable: true, get() { touched++; throw Error('SECRET'); } });
  const trap = new Proxy(bodies.deposit, { ownKeys() { touched++; throw Error('SECRET'); }, get() { touched++; throw Error('SECRET'); } });
  const hidden = { ...bodies.deposit }; Object.defineProperty(hidden, 'extra', { value: 'secret' });
  const invalid = [null, [], Object.create(null), trap, getter, hidden, { ...bodies.deposit, [Symbol('secret')]: 'secret' },
    { ...bodies.deposit, intentId: '0'.repeat(64) }, { ...bodies.deposit, intentId: 'a'.repeat(64) + '\n' },
    { ...bodies.deposit, requestId: requestId + '\n' }, { ...bodies.deposit, toJSON() { touched++; return {}; } }];
  for (const body of invalid) assert.throws(() => issue(server, 'deposit', { body }), /CAPABILITY_INVALID/);
  for (const action of ['graph', 'sign', '__proto__', 'toString', '/api/wallet/native/deposit', { toString() { touched++; return 'deposit'; } }])
    assert.throws(() => server.issueActionCapability({ action, body: {} }), /CAPABILITY_INVALID/);
  const params = { action: 'deposit', body: bodies.deposit };
  const withGetter = { ...params, get ttlMs() { touched++; return 100; } };
  for (const input of [withGetter, new Proxy(params, {}), { ...params, extra: true }, { ...params, [Symbol('secret')]: true }])
    assert.throws(() => server.issueActionCapability(input), /BOOTSTRAP_FIELDS/);
  for (const ttlMs of [0, -1, 300001, NaN, Infinity, 1.5, '100', undefined, null])
    assert.throws(() => issue(server, 'deposit', { ttlMs }), /CAPABILITY_TTL/);
  assert.throws(() => issue(server, 'accountPrepare', { body: { ...bodies.accountPrepare, kind: 'GRAPH' } }), /CAPABILITY_INVALID/);
  assert.throws(() => server.issueActionCapability(params, 'extra'), /CAPABILITY_UNAVAILABLE/);
  assert.equal(touched, 0); assert.equal(f.calls.snapshot, 0); assert.equal(f.calls.submit.length, 0);
  for (const actionAccessMode of ['', null, undefined, 'EXACT_ONLY', 'broad', 1])
    await assert.rejects(startWalletApplication({ actionAccessMode }), /ACTION_ACCESS_MODE/);
});

test('issuance cap counts successful minting for listener lifetime; expiry and consumption do not refill', async t => {
  let now = 1000; t.mock.method(performance, 'now', () => now);
  const f = fixture(), server = await app(t, f.options);
  for (let i = 0; i < 64; i++) {
    assert.throws(() => issue(server, 'deposit', { ttlMs: 0 }), /CAPABILITY_TTL/);
    const cap = issue(server, 'deposit', { ttlMs: 1 });
    if (i === 0) assert.equal((await post(server, cap)).status, 202);
    else { now++; assert.equal((await post(server, cap)).status, 403); }
  }
  assert.throws(() => issue(server), /CAPABILITY_LIMIT/); assert.equal(f.calls.submit.length, 1);
});

test('lost real server reply stays UNKNOWN in the original SDK; no token restoration, resend or replacement', async t => {
  const f = fixture(), server = await app(t, f.options), cap = issue(server), sdk = client(server, cap);
  assert.equal(await sdk.refresh(), true); sdk.review('deposit', bodies.deposit);
  const entered = deferred(), release = deferred(); t.after(() => release.resolve());
  f.control.submit = async (action, input) => { entered.resolve(); await release.promise;
    return { version: 1, admitted: true, action, requestId: input.requestId, state: 'ADMITTED' }; };
  const confirmation = sdk.confirm(); await entered.promise;
  await server.close(); release.resolve(); assert.equal(await confirmation, false);
  assert.equal(sdk.getState().outcome.state, 'UNKNOWN'); assert.equal(sdk.getState().originalRequestIds.native, requestId);
  assert.equal(await sdk.confirm(), false); assert.equal(f.calls.submit.length, 1);
  const reopened = await app(t, { ...f.options, port: Number(new URL(server.origin).port) });
  assert.equal(reopened.origin, server.origin, 'even the same origin cannot substitute a new listener identity');
  assert.equal((await post(reopened, cap)).status, 403);
  assert.equal(f.calls.submit.length, 1); assert.throws(() => issue(server), /CAPABILITY_UNAVAILABLE/);
});

test('existing origin, repeated header, bounded body and fixed route fences remain before consumption', async t => {
  const f = fixture(), server = await app(t, f.options), cap = issue(server);
  assert.equal((await post(server, cap, 'deposit', bodies.deposit, { origin: 'http://127.0.0.1:1' })).status, 403);
  assert.equal((await post(server, cap, 'deposit', bodies.deposit, { headers: { 'x-wallet-action-token': [cap.token, cap.token] } })).status, 403);
  assert.equal((await post(server, cap, 'deposit', bodies.deposit, { raw: 'x'.repeat(4097) })).status, 413);
  assert.equal((await http(server, ALL_ACTIONS.deposit.route + '?action=redeem', { method: 'POST', token: cap.token, body: bodies.deposit })).status, 404);
  assert.equal((await post(server, cap, 'deposit', bodies.deposit, { raw: '{' })).status, 400);
  assert.equal(f.calls.snapshot, 0); assert.equal((await post(server, cap)).status, 202);
});

test('default and maximum TTL are fixed admission windows, not spending budgets', async t => {
  let now = 1000; t.mock.method(performance, 'now', () => now);
  const f = fixture(), server = await app(t, f.options), defaultCap = issue(server);
  now += 59999; assert.equal((await post(server, defaultCap)).status, 202);
  const atDefault = issue(server); now += 60000; assert.equal((await post(server, atDefault)).status, 403);
  const maxCap = issue(server, 'deposit', { ttlMs: 300000 }); now += 299999;
  assert.equal((await post(server, maxCap)).status, 202);
  assert.equal(f.calls.submit.length, 2);
});
