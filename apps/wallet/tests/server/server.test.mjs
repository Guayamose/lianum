/** HTTP/application integration only. Native/DeFi capabilities below are explicitly
 * SYNTHETIC boundary mocks: no native node, proof, funded wallet, transfer, or
 * native acceptance is created or established by this suite. The flat-account
 * session, network registry, and loopback network HTTP transport are real code.
 * Run: node --experimental-test-module-mocks --test wallet-app/server.test.mjs */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createConnection } from 'node:net';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createFlatAccountSession } from '../../../../packages/backend/src/api/accounts/flat-account-session.mjs';
import { createHttpEvmNativeTransferObserver } from '../../../../packages/backend/src/chains/evm/transfers/evm-native-transfer-http.mjs';
import { createEvmNativeTransferObserver } from '../../../../packages/backend/src/chains/evm/observations/evm-native-transfer-observer.mjs';
import { originalFixture as transferOriginalFixture, quantity as transferQuantity } from '../../../../packages/backend/tests/fixtures/chains/evm/transfers/evm-native-transfer-fixture.mjs';
import { same as sameAccountRequest } from '../../../../packages/engine/src/execution/accounts/generic-account-journal.mjs';
import { assertNativeClaimSession as actualNativeAssertion, nativeClaimApiErrorCode }
  from '../../../../packages/backend/src/api/claims/native-claim-session.mjs';
import { assertOwnedPrivateVaultExit as actualDefiAssertion }
  from '../../../../packages/backend/src/defi/withdrawals/private-vault-exit.mjs';
import { WALLET_PROFILE, ACTIONS, DEFI_ACTIONS, validateWalletState, projectWalletState }
  from '../../src/client/state/view-model.mjs';
const clientSourceURLs = {
  'app.mjs': new URL('../../src/client/app.mjs', import.meta.url),
  'view-model.mjs': new URL('../../src/client/state/view-model.mjs', import.meta.url),
  'style.css': new URL('../../src/client/style.css', import.meta.url),
};

assert.equal(typeof mock.module, 'function', 'Run with --experimental-test-module-mocks');
const syntheticNative = new WeakSet(), syntheticIdentities = new WeakMap(), syntheticDefi = new WeakMap();
const error = code => Object.assign(new Error(code), { code });
mock.module('../../../../packages/backend/src/api/claims/native-claim-session.mjs', { exports: {
  nativeClaimApiErrorCode,
  walletClaimSessionIdentity(value) {
    if (!syntheticNative.has(value)) throw error('NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED');
    return syntheticIdentities.get(value);
  },
  assertWalletClaimSession(value) {
    if (!syntheticNative.has(value)) throw error('NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED');
  },
} });
mock.module('../../../../packages/backend/src/defi/withdrawals/private-vault-exit.mjs', { exports: {
  assertOwnedPrivateVaultExit(runtime, service) {
    if (!syntheticDefi.has(service) || syntheticDefi.get(service) !== runtime)
      throw error('PRIVATE_VAULT_EXIT_OWNED_CAPABILITY_REQUIRED');
  },
} });
const { startWalletApplication } = await import('../../src/server/server.mjs');

const requestId = 'synthetic_request_01', intentId = 'c'.repeat(64);
const genesisHash = '0x' + '1'.repeat(64), blockHash = '0x' + '2'.repeat(64);
const privateAddress = '0x' + '3'.repeat(40);
const asset = () => ({ version: 1, status: 'LIVE',
  asset: { assetId: 'd'.repeat(64), symbol: 'TEST', decimals: 8 },
  observed: { blockNumber: '2', blockHash: 'e'.repeat(64), timestamp: '1000', observedAt: 1000 },
  balances: { available: '9007199254740993', reserved: '2', recovery: '3', locked: '4' }, requests: [] });
const nativeIdentity = (family = '2') => Object.freeze({ version: 1, profile: 'ORIGINAL_NATIVE_CLAIM_SESSION_IDENTITY_V1',
  accountId: 'synthetic_account_01', claimDomain: '6'.repeat(64), nativeFamily: family, nativeGenesis: '7'.repeat(64),
  nativeAsset: '8'.repeat(64), wrapperAssetIdentity: '9'.repeat(64), claimSymbol: family === '1' ? 'cBTC' : 'cSOL',
  nativeSymbol: family === '1' ? 'BTC' : 'SOL', decimals: family === '1' ? 8 : 9,
  atomicUnit: family === '1' ? 'satoshi' : 'lamport', observation: 'ORIGINAL_BOUND_CONFIGURATION_ONLY' });
const nativeSnapshot = overrides => ({ version: 1, phase: 'READY', storageAvailable: true,
  busy: false, queued: 0, observation: 'DURABLE_JOURNAL_ONLY', requests: [],
  requiresExternalEffectReconciliation: false, ...overrides });
const defiSnapshot = () => ({ version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1', operations: [] });
const deferred = () => {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

async function flatFixture(t, overrides = {}) {
  const counts = { snapshot: 0, ownerView: 0, close: 0, mutation: 0 };
  const keeper = Object.fromEntries(['prepare', 'execute', 'reconcile', 'recover', 'restartCoordinator']
    .map(name => [name, async () => { counts.mutation++; throw error('FLAT_ACCOUNT_UNEXPECTED_MUTATION'); }]));
  keeper.snapshot = async () => { counts.snapshot++; return { version: 1, revision: 0, storageAvailable: true, requests: [] }; };
  keeper.close = async () => { counts.close++; };
  const session = await createFlatAccountSession({ keeper,
    ownerHandoff: { async ownerView() { counts.ownerView++; return overrides.ownerView ? overrides.ownerView() : asset(); } } });
  t.after(() => session.close());
  return { session, counts };
}
const accountRoutes = Object.freeze({ prepare: '/api/wallet/account/prepare', execute: '/api/wallet/account/execute', reconcile: '/api/wallet/account/reconcile' });
const accountPrepare = (kind = 'TOP_UP', id = 'manual_account_01') => ({ requestId: id, kind,
  ownerOperationRef: (kind === 'TOP_UP' ? 'a' : 'b').repeat(64), assetId: (kind === 'TOP_UP' ? 'd' : 'e').repeat(64) });
async function manualAccountFixture(t, initialRows = []) {
  const counts = { snapshot: 0, ownerView: 0, close: 0, mutations: [] };
  const control = { rows: structuredClone(initialRows), snapshotError: null, gates: new Map(), lostExecute: false };
  const originalRequests = new Map(initialRows.filter(row => ['TOP_UP', 'EXIT'].includes(row.kind))
    .map(row => [row.requestId, { ...accountPrepare(row.kind, row.requestId), assetId: row.assetId }]));
  const keeper = {
    async snapshot() { counts.snapshot++; if (control.snapshotError) throw control.snapshotError;
      return { version: 1, revision: counts.mutations.length, storageAvailable: true,
        requests: control.rows.map(row => ({ ...row, errorCode: null })) }; },
    async close() { counts.close++; },
    async recover() { assert.fail('NO_GRAPH_RECOVERY'); }, async restartCoordinator() { assert.fail('NO_COORDINATOR_RESTART'); },
  };
  for (const action of ['prepare', 'execute', 'reconcile']) keeper[action] = async input => {
    counts.mutations.push({ action, input: structuredClone(input) });
    const gate = control.gates.get(action);
    if (gate) { control.gates.delete(action); gate.entered.resolve(); await gate.release.promise; }
    const id = action === 'prepare' ? input.requestId : input;
    let row = control.rows.find(row => row.requestId === id);
    if (action === 'prepare') {
      // Same canonical-equality predicate as GenericAccountJournal.bind: an
      // existing original ID cannot rebind its hidden asset/reference fields.
      if (row) sameAccountRequest(originalRequests.get(id), input, 'JOURNAL_REQUEST_CONFLICT');
      const original = accountPrepare(input.kind, id);
      if (!['TOP_UP', 'EXIT'].includes(input.kind) || input.ownerOperationRef !== original.ownerOperationRef || input.assetId !== original.assetId)
        throw error('JOURNAL_OWNER_PREPARATION_UNAVAILABLE');
      if (row) assert.equal(row.kind, input.kind);
      else { row = { requestId: id, kind: input.kind, assetId: input.assetId, state: 'PREPARING' }; control.rows.push(row); originalRequests.set(id, structuredClone(input)); }
      row.state = 'PREPARED';
    } else {
      assert.ok(row, 'SYNTHETIC_ORIGINAL_REQUEST_REQUIRED'); assert.ok(['TOP_UP', 'EXIT'].includes(row.kind), 'NO_GRAPH_EFFECT');
      if (action === 'execute' && control.lostExecute) { row.state = 'UNKNOWN'; throw error('JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'); }
      row.state = 'CONFIRMED';
    }
  };
  const session = await createFlatAccountSession({ keeper, ownerHandoff: { async ownerView() {
    counts.ownerView++;
    return { version: 1, profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true,
      assets: ['TOP_UP', 'EXIT'].map(kind => { const base = asset(), id = accountPrepare(kind).assetId;
        return { ...base, asset: { ...base.asset, assetId: id, symbol: kind === 'TOP_UP' ? 'TESTA' : 'TESTB', decimals: kind === 'TOP_UP' ? 8 : 9 },
          requests: control.rows.filter(row => row.assetId === id).map(row => ({ requestId: row.requestId, kind: row.kind,
            state: row.state === 'CONFIRMED' ? 'CONFIRMED' : 'UNRESOLVED', disposition: row.state === 'CONFIRMED' ? 'APPLIED' : null })) }; }) };
  } } });
  const gates = [];
  t.after(async () => { for (const gate of gates) gate.release.resolve(); await session.close(); });
  return { session, counts, control, block(action) { const gate = { entered: deferred(), release: deferred() };
    control.gates.set(action, gate); gates.push(gate); return gate; } };
}
function nativeFixture(overrides = {}) {
  const counts = { snapshot: 0, ownerView: 0, submit: [], close: 0, restartKeeper: 0 };
  const control = { snapshot: nativeSnapshot(), owner: { deposits: [], tickets: [], requests: [] }, ...overrides };
  const session = Object.freeze({
    async snapshot() { counts.snapshot++; if (control.snapshotError) throw control.snapshotError;
      return structuredClone(control.snapshot); },
    async ownerView() { counts.ownerView++; if (control.ownerError) throw control.ownerError;
      return structuredClone(control.owner); },
    async submit(action, input) { counts.submit.push({ action, input: structuredClone(input) });
      if (control.submit) return control.submit(action, input);
      return { version: 1, admitted: true, action, requestId: input.requestId, state: 'ADMITTED' }; },
    async close() { counts.close++; }, async restartKeeper() { counts.restartKeeper++; },
  });
  syntheticNative.add(session); syntheticIdentities.set(session, Object.hasOwn(overrides, 'identity') ? overrides.identity : nativeIdentity());
  return { session, counts, control };
}
function defiFixture(overrides = {}) {
  const runtime = Object.freeze({ fixture: 'SYNTHETIC_NO_CHAIN_RUNTIME' });
  const counts = { snapshot: 0, close: 0, originalReceipt: 0, mutations: [] };
  const control = { snapshot: defiSnapshot(), ...overrides };
  const service = {
    async snapshot() { counts.snapshot++; if (control.snapshotError) throw control.snapshotError;
      return structuredClone(control.snapshot); },
    async originalReceipt() { counts.originalReceipt++; return { secret: 'PRIVATE_RECEIPT_CANARY' }; },
    async close() { counts.close++; },
  };
  for (const action of ['prepare', 'requote', 'execute', 'reconcile', 'reopen']) service[action] = async function (...args) {
    counts.mutations.push({ action, args: structuredClone(args) });
    if (control.actionError) throw control.actionError;
    return { version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1', action, requestId: args[0]?.requestId ?? args[0] ?? null,
      phase: 'SYNTHETIC_HOST_STATE_ONLY', underlyingPrivateSpendable: false };
  };
  Object.freeze(service); syntheticDefi.set(service, runtime);
  return { binding: { runtime, service }, counts, control };
}
async function application(t, options = {}) {
  const app = await startWalletApplication(options); t.after(() => app.close()); return app;
}
function readHeaders(app) { return { Origin: app.origin, 'x-wallet-owner-token': app.ownerAccess.token }; }
function actionHeaders(app) { return { Origin: app.origin, 'x-wallet-action-token': app.actionAccess.token, 'Content-Type': 'application/json' }; }
function request(app, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(app.origin), options = { hostname: '127.0.0.1', port: parsed.port, path,
      method, agent: false, headers: { ...headers } };
    if (body !== undefined && !Object.keys(headers).some(key => key.toLowerCase() === 'content-length'))
      options.headers['Content-Length'] = Buffer.byteLength(body);
    const outgoing = httpRequest(options, incoming => {
      const chunks = []; incoming.on('data', chunk => chunks.push(chunk)); incoming.on('error', reject);
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8'); let json = null;
        try { if (text && incoming.headers['content-type']?.startsWith('application/json')) json = JSON.parse(text); }
        catch (error) { reject(error); return; }
        resolve({ status: incoming.statusCode, headers: incoming.headers, text, json });
      });
    });
    outgoing.setTimeout(3000, () => outgoing.destroy(new Error('TEST_HTTP_TIMEOUT')));
    outgoing.on('error', reject); outgoing.end(body);
  });
}
const readState = app => request(app, '/api/wallet/state', { headers: readHeaders(app) });
const post = (app, path, input, headers = {}) => request(app, path,
  { method: 'POST', headers: { ...actionHeaders(app), ...headers }, body: JSON.stringify(input) });
function rawRequest(app, lines, body = '') {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(new URL(app.origin).port) });
    let text = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('TEST_RAW_HTTP_TIMEOUT')));
    socket.once('connect', () => socket.write(lines.join('\r\n') + '\r\n\r\n' + body));
    socket.on('data', chunk => { text += chunk.toString('utf8'); });
    socket.on('error', reject); socket.on('end', () => resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(text)?.[1]), text }));
  });
}
async function networkFixture(t) {
  const calls = [], control = { mode: 'fresh' };
  const timestamp = '0x' + Math.floor(Date.now() / 1000).toString(16);
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    calls.push({ path: req.url, method: req.method, body });
    let result;
    if (body.method === 'eth_chainId') result = control.mode === 'wrong-network' ? '0x2' : '0x1';
    else if (body.method === 'eth_getBalance') result = '0x20000000000001';
    else if (body.method === 'eth_getBlockByNumber') result = body.params[0] === '0x0'
      ? { number: '0x0', hash: genesisHash, parentHash: '0x' + '0'.repeat(64), timestamp: '0x0' }
      : { number: '0x2', hash: blockHash, parentHash: genesisHash, timestamp };
    else throw new Error('TEST_UNEXPECTED_RPC_METHOD');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const endpoint = `http://127.0.0.1:${server.address().port}/`;
  return { calls, control, endpoint,
    config: { networks: [{ chain: 'ethereum', genesisHash, endpoint, timeoutMs: 1000 }],
      accounts: [{ chain: 'ethereum', address: privateAddress }] } };
}

/** Genuine observer + fixed HTTP reader, synthetic public mathematical wire
 * and local RPC data only. The fixture creates no private key or signed send. */
async function transferHttpFixture(t, chain = 'ethereum', owner = 'from') {
  const fixture = transferOriginalFixture(chain), calls = [], clock = { now: Date.now(), broken: false };
  const seconds = BigInt(Math.floor(clock.now / 1000));
  fixture.state.included.timestamp = transferQuantity(seconds - 10n);
  fixture.state.finalized.timestamp = transferQuantity(seconds);
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const packet = JSON.parse(Buffer.concat(chunks).toString('utf8')); calls.push(structuredClone(packet));
    try {
      const result = packet.method === 'eth_getBalance' ? '0x20000000000001'
        : await fixture.transport(packet.method, packet.params, { signal: new AbortController().signal });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: packet.id, result }));
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'SYNTHETIC_PRIVATE_RPC_FAILURE_CANARY' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const endpoint = `http://127.0.0.1:${server.address().port}/`;
  const observer = createHttpEvmNativeTransferObserver({ chain, genesisHash: fixture.genesisHash, endpoint,
    original: fixture.original, timeoutMs: 1000, now: () => { if (clock.broken) throw new Error('PRIVATE_TRANSFER_CLOCK_CANARY'); return clock.now; } });
  const config = { networks: [{ chain, genesisHash: fixture.genesisHash, endpoint, timeoutMs: 1000 }],
    accounts: [{ chain, address: fixture.original.expected[owner] }] };
  return { ...fixture, calls, clock, endpoint, observer, config };
}
const transferAuthorityFields = ['currentFinalityVerified', 'creditEligible', 'graphAdmissionEligible', 'deliveryVerified', 'recipientRetainedValueVerified'];
function assertTransferMetadata(row, original) {
  const value = row.status;
  assert.equal(value.schema, 'flat-evm-original-transfer-status/1'); assert.equal(value.source, 'retained-observation-metadata');
  assert.equal(value.freshness, 'not-revalidated'); assert.equal(value.metadataOnly, true);
  for (const field of transferAuthorityFields) assert.equal(value[field], false, field);
  assert.equal(value.privateSpendableAtomic, null); assert.equal(value.nativeId, original.expected.nativeId);
  assert.equal(value.value, original.expected.value); assert.equal(value.nonce, original.expected.nonce);
  for (const name of ['nativeWire', 'receipt', 'logs', 'evidence', 'transport', 'endpoint', 'signature', 'wireKeyCommitment'])
    assert.equal(Object.hasOwn(value, name), false, name);
  assert.equal(JSON.stringify(row).includes(original.nativeWire.slice(2)), false);
}

test('real HTML/static assets and disconnected state form the same authenticated UI contract', async t => {
  const app = await application(t), html = await request(app, '/');
  assert.equal(html.status, 200); assert.match(html.headers['content-type'], /^text\/html/);
  assert.match(html.text, /<title>Lianum/); assert.match(html.text, /HOST_REPORTED/);
  assert.ok(html.text.includes(`name="wallet-owner-token" content="${app.ownerAccess.token}"`));
  assert.ok(html.text.includes(`name="wallet-action-token" content="${app.actionAccess.token}"`));
  assert.doesNotMatch(html.text, /__WALLET_(?:OWNER|ACTION)_TOKEN__/);
  assert.notEqual(app.ownerAccess.token, app.actionAccess.token);
  assert.match(html.headers['content-security-policy'], /default-src 'none'/);
  assert.match(html.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(html.headers['cache-control'], 'no-store');
  assert.equal(html.headers['x-content-type-options'], 'nosniff');
  assert.equal(html.headers['referrer-policy'], 'no-referrer');
  assert.equal(html.headers['cross-origin-resource-policy'], 'same-origin');
  assert.equal(html.headers['cross-origin-opener-policy'], 'same-origin');
  assert.match(html.headers['permissions-policy'], /camera=\(\), microphone=\(\), geolocation=\(\)/);
  for (const [path, name, type] of [['/app.mjs', 'app.mjs', 'text/javascript'],
    ['/view-model.mjs', 'view-model.mjs', 'text/javascript'], ['/style.css', 'style.css', 'text/css']]) {
    const response = await request(app, path); assert.equal(response.status, 200);
    assert.ok(response.headers['content-type'].startsWith(type));
    assert.equal(response.text, await readFile(clientSourceURLs[name], 'utf8'));
    assert.ok(!response.text.includes(app.ownerAccess.token) && !response.text.includes(app.actionAccess.token));
  }
  const response = await readState(app), value = validateWalletState(response.json);
  assert.equal(response.status, 200); assert.equal(value.profile, WALLET_PROFILE);
  assert.equal(value.connection, 'DISCONNECTED');
  for (const key of ['account', 'portfolio', 'nativeClaims', 'networks', 'defi', 'transfers']) {
    assert.equal(value[key], null); assert.equal(value.errors[key], null);
  }
  assert.ok(Object.values(value.capabilities).every(value => value === false));
  assert.doesNotMatch(response.text, new RegExp(app.ownerAccess.token + '|' + app.actionAccess.token));
  assert.equal(projectWalletState(value).portfolioStatus, 'UNAVAILABLE');
});

test('owner/action access stays split; exact origin and browser same-origin GET are accepted', async t => {
  const native = nativeFixture(), app = await application(t, { nativeClaimSession: native.session });
  for (const headers of [{}, { Origin: app.origin }, { ...readHeaders(app), 'x-wallet-owner-token': app.actionAccess.token },
    { 'x-wallet-owner-token': app.ownerAccess.token }, { 'x-wallet-owner-token': app.ownerAccess.token, 'Sec-Fetch-Site': 'none' }])
    assert.equal((await request(app, '/api/wallet/state', { headers })).status, 403);
  assert.equal((await request(app, '/api/wallet/state', { headers: readHeaders(app) })).status, 200);
  assert.equal((await request(app, '/api/wallet/state', { headers:
    { 'x-wallet-owner-token': app.ownerAccess.token, 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
  for (const headers of [{ 'Content-Type': 'application/json' },
    { ...actionHeaders(app), 'x-wallet-action-token': app.ownerAccess.token },
    { 'x-wallet-action-token': app.actionAccess.token, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' }])
    assert.equal((await request(app, ACTIONS.deposit.route, { method: 'POST', headers, body: JSON.stringify({ requestId, intentId }) })).status, 403);
  assert.equal(native.counts.submit.length, 0);
});

test('foreign origins, hosts and browser cross-site headers cannot read HTML, state or mutate', async t => {
  const native = nativeFixture(), app = await application(t, { nativeClaimSession: native.session });
  for (const Origin of ['null', 'http://attacker.invalid', app.origin + '/', 'https://' + new URL(app.origin).host]) {
    for (const path of ['/', '/api/wallet/state'])
      assert.equal((await request(app, path, { headers: { ...readHeaders(app), Origin } })).status, 403);
    assert.equal((await post(app, ACTIONS.deposit.route, { requestId, intentId }, { Origin })).status, 403);
  }
  for (const Host of ['attacker.invalid', 'localhost:' + new URL(app.origin).port, '127.0.0.1', new URL(app.origin).host + '.'])
    assert.equal((await request(app, '/', { headers: { Host } })).status, 403);
  for (const value of ['cross-site', 'same-site']) {
    assert.equal((await request(app, '/api/wallet/state', { headers: { ...readHeaders(app), 'Sec-Fetch-Site': value } })).status, 403);
    assert.equal((await post(app, ACTIONS.deposit.route, { requestId, intentId }, { 'Sec-Fetch-Site': value })).status, 403);
  }
  assert.equal(native.counts.submit.length, 0);
});

test('duplicate sensitive headers fail closed before any original read or submission', async t => {
  const flat = await flatFixture(t), native = nativeFixture();
  const app = await application(t, { accountSession: flat.session, nativeClaimSession: native.session });
  const host = new URL(app.origin).host;
  for (const [name, value] of [['Host', host], ['Origin', app.origin], ['x-wallet-owner-token', app.ownerAccess.token],
    ['x-wallet-action-token', app.actionAccess.token], ['Sec-Fetch-Site', 'same-origin'],
    ['Content-Type', 'application/json'], ['Content-Length', '0']]) {
    const headers = new Map([['Host', host], ['Origin', app.origin], ['x-wallet-owner-token', app.ownerAccess.token]]);
    headers.set(name, value);
    const response = await rawRequest(app, ['GET /api/wallet/state HTTP/1.1',
      ...Array.from(headers, ([key, item]) => `${key}: ${item}`), `${name.toUpperCase()}: ${value}`, 'Connection: close']);
    assert.ok([400, 403].includes(response.status), `${name}: ${response.status}`);
  }
  const transfer = await rawRequest(app, ['POST /api/wallet/native/deposit HTTP/1.1', `Host: ${host}`,
    `Origin: ${app.origin}`, `x-wallet-action-token: ${app.actionAccess.token}`, 'Content-Type: application/json',
    'Transfer-Encoding: chunked', 'Transfer-Encoding: chunked', 'Connection: close'], '0\r\n\r\n');
  assert.ok([400, 403].includes(transfer.status));
  assert.equal(flat.counts.ownerView, 0); assert.equal(native.counts.snapshot, 0); assert.equal(native.counts.submit.length, 0);
});

test('exact route allowlist rejects aliases, binds, arbitrary RPC, graph and private audit methods', async t => {
  const native = nativeFixture(), defi = defiFixture();
  const app = await application(t, { nativeClaimSession: native.session, defiExit: defi.binding });
  for (const path of ['/api/wallet/state/', '/api/wallet/state?chain=ethereum', '/api//wallet/state',
    '/api/wallet/%73tate', '//api/wallet/state', app.origin + '/api/wallet/state', '/./api/wallet/state',
    '/index.html', '/?token=anything', '/app.mjs?version=1', '/server.mjs', '/public/index.html', '/../server.mjs'])
    assert.equal((await request(app, path, { headers: readHeaders(app) })).status, 404, path);
  for (const path of ['/bind', '/api/wallet/bind', '/api/wallet/rpc', '/api/wallet/networks', '/api/wallet/graph',
    '/api/wallet/native/restartKeeper', '/api/wallet/native/close', '/api/wallet/native/deposit/',
    '/api/wallet/native/deposit?chain=ethereum', '/api/wallet/defi/originalReceipt', '/api/wallet/defi/close',
    '/api/wallet/defi/execute/', '/api/wallet/defi/execute?recipient=changed'])
    assert.equal((await post(app, path, { requestId })).status, 404, path);
  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])
    assert.equal((await request(app, '/api/wallet/state', { method, headers: readHeaders(app) })).status, 404);
  assert.equal(native.counts.snapshot, 0); assert.equal(native.counts.submit.length, 0);
  assert.equal(defi.counts.originalReceipt, 0); assert.equal(defi.counts.mutations.length, 0);
});

test('private bootstrap rejects fabricated capabilities, extra fields and accessors before listening', async () => {
  assert.throws(() => actualNativeAssertion(nativeFixture().session), /NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED/);
  const fakeDefi = defiFixture();
  assert.throws(() => actualDefiAssertion(fakeDefi.binding.runtime, fakeDefi.binding.service), /PRIVATE_VAULT_EXIT_OWNED_CAPABILITY_REQUIRED/);
  for (const options of [{ accountSession: {} }, { nativeClaimSession: {} }, { defiExit: { runtime: {}, service: {} } },
    { defiExit: { ...fakeDefi.binding, receiver: privateAddress } }, { rpc: 'http://attacker.invalid/' },
    { port: -1 }, { port: 65536 }, { port: '0' }, { port: 1.5 }, Object.create(null)])
    await assert.rejects(startWalletApplication(options));
  let touched = false;
  await assert.rejects(startWalletApplication({ get accountSession() { touched = true; return {}; } }), /WALLET_BOOTSTRAP_FIELDS/);
  await assert.rejects(startWalletApplication(new Proxy({}, { ownKeys() { touched = true; return []; } })), /WALLET_BOOTSTRAP_FIELDS/);
  assert.equal(touched, false);
});

test('one private bind is allowed while disconnected and its original capabilities cannot be replaced', async t => {
  const app = await application(t), native = nativeFixture(), replacement = nativeFixture();
  assert.throws(() => app.bindSessions({}), /WALLET_ORIGINAL_SESSION_REQUIRED/);
  assert.throws(() => app.bindSessions({ nativeClaimSession: {} }), /NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED/);
  const input = { nativeClaimSession: native.session };
  assert.deepEqual(app.bindSessions(input), { bound: true }); input.nativeClaimSession = replacement.session;
  assert.throws(() => app.bindSessions({ nativeClaimSession: replacement.session }), /WALLET_BINDING_ALREADY_FIXED/);
  const result = await readState(app); assert.equal(result.json.connection, 'CONNECTED');
  assert.equal(native.counts.snapshot, 1); assert.equal(replacement.counts.snapshot, 0);
  assert.ok(Object.isFrozen(app)); assert.ok(Object.isFrozen(app.ownerAccess)); assert.ok(Object.isFrozen(app.actionAccess));
});

test('one state read composes all four existing subsystems and agrees with the real UI contract', async t => {
  const flat = await flatFixture(t), native = nativeFixture(), defi = defiFixture(), network = await networkFixture(t);
  const app = await application(t, { accountSession: flat.session, nativeClaimSession: native.session,
    defiExit: defi.binding, networkConfig: network.config });
  const response = await readState(app), value = validateWalletState(response.json);
  assert.equal(response.status, 200); assert.equal(value.connection, 'CONNECTED'); assert.equal(value.profile, 'ACTIVE_FLAT_WALLET_APP_V1');
  assert.equal(value.portfolio.balances.available, '9007199254740993');
  assert.deepEqual(value.nativeClaims.snapshot, nativeSnapshot()); assert.deepEqual(value.defi.snapshot, defiSnapshot());
  assert.equal(value.networks.observations[0].balanceAtomic, '9007199254740993');
  assert.equal(value.capabilities.graphExecution, false);
  for (const action of [...Object.values(ACTIONS), ...Object.values(DEFI_ACTIONS)]) assert.equal(value.capabilities[action.capability], true);
  assert.ok(Object.values(value.errors).every(value => value === null));
  assert.equal(flat.counts.ownerView, 1); assert.equal(flat.counts.mutation, 0);
  assert.equal(native.counts.ownerView, 1); assert.equal(native.counts.submit.length, 0);
  assert.equal(defi.counts.snapshot, 1); assert.equal(defi.counts.originalReceipt, 0); assert.equal(defi.counts.mutations.length, 0);
  assert.equal(projectWalletState(value).assets[0].amounts.available, '90071992.54740993');
});

test('native ready, reconciliation-only, unavailable and busy states preserve nulls and capability fences', async t => {
  const flat = await flatFixture(t), native = nativeFixture(), defi = defiFixture();
  const app = await application(t, { accountSession: flat.session, nativeClaimSession: native.session, defiExit: defi.binding });
  native.control.snapshot = nativeSnapshot({ requiresExternalEffectReconciliation: true });
  let value = (await readState(app)).json;
  for (const key of ['nativeDeposit', 'nativeRedeem', 'nativeRefund']) assert.equal(value.capabilities[key], false);
  assert.equal(value.capabilities.nativeReconcile, true); assert.equal(value.capabilities.nativeResume, true);
  native.control.snapshot = nativeSnapshot({ phase: 'UNAVAILABLE', storageAvailable: false });
  value = (await readState(app)).json;
  assert.equal(value.nativeClaims.owner, null); assert.equal(value.errors.nativeClaims, 'WALLET_NATIVE_SESSION_UNAVAILABLE');
  for (const action of Object.values(ACTIONS)) assert.equal(value.capabilities[action.capability], false);
  for (const busy of [{ busy: true }, { queued: 1 }]) {
    native.control.snapshot = nativeSnapshot(busy);
    const counts = { flat: flat.counts.ownerView, owner: native.counts.ownerView, defi: defi.counts.snapshot };
    value = validateWalletState((await readState(app)).json);
    assert.equal(value.portfolio, null); assert.equal(value.nativeClaims.owner, null); assert.equal(value.defi.snapshot, null);
    for (const section of ['portfolio', 'nativeClaims', 'defi']) assert.equal(value.errors[section], 'WALLET_OPERATION_IN_PROGRESS');
    assert.equal(flat.counts.ownerView, counts.flat); assert.equal(native.counts.ownerView, counts.owner); assert.equal(defi.counts.snapshot, counts.defi);
    assert.ok(Object.values(value.capabilities).every(value => value === false));
    assert.equal((await post(app, DEFI_ACTIONS.defiExecute.route, { requestId })).json.error, 'WALLET_OPERATION_IN_PROGRESS');
  }
  assert.equal(defi.counts.mutations.length, 0);
});

test('unavailable original sections expose sanitized codes and null data, with only explicit DeFi reopen', async t => {
  const flat = await flatFixture(t, { ownerView: () => { throw new Error('PRIVATE_ENDPOINT_AND_KEYS_CANARY'); } });
  const native = nativeFixture({ ownerError: new Error('PRIVATE_NATIVE_CANARY') });
  const defi = defiFixture({ snapshotError: error('PRIVATE_VAULT_EXIT_STORAGE_UNAVAILABLE') });
  const app = await application(t, { accountSession: flat.session, nativeClaimSession: native.session, defiExit: defi.binding });
  const response = await readState(app), value = validateWalletState(response.json);
  assert.equal(value.portfolio, null); assert.equal(value.errors.portfolio, 'WALLET_OPERATION_FAILED');
  assert.equal(value.nativeClaims.owner, null); assert.equal(value.errors.nativeClaims, 'NATIVE_CLAIM_OPERATION_FAILED');
  assert.equal(value.defi.snapshot, null); assert.equal(value.errors.defi, 'PRIVATE_VAULT_EXIT_STORAGE_UNAVAILABLE');
  for (const action of Object.values(DEFI_ACTIONS)) assert.equal(value.capabilities[action.capability], action.capability === 'defiReopen');
  assert.doesNotMatch(response.text, /CANARY|PRIVATE_ENDPOINT|PRIVATE_NATIVE/);
  native.control.snapshotError = error('NATIVE_CLAIM_STORAGE_UNAVAILABLE');
  const unavailable = (await readState(app)).json;
  assert.equal(unavailable.nativeClaims.snapshot, null); assert.equal(unavailable.nativeClaims.owner, null);
  for (const action of Object.values(ACTIONS)) assert.equal(unavailable.capabilities[action.capability], false);
});

test('every fixed native action calls original submit exactly once and preserves its body', async t => {
  const native = nativeFixture(), app = await application(t, { nativeClaimSession: native.session });
  for (const [action, { route }] of Object.entries(ACTIONS)) {
    const input = ['deposit', 'refund'].includes(action) ? { requestId, intentId }
      : action === 'redeem' ? { requestId, amount: '9007199254740993', maxFee: '1' } : { requestId };
    const response = await post(app, route, input);
    assert.equal(response.status, 202); assert.equal(response.json.action, action);
    assert.equal(response.json.requestId, requestId); assert.equal(response.json.state, 'ADMITTED');
    assert.deepEqual(native.counts.submit.at(-1), { action, input });
  }
  assert.equal(native.counts.submit.length, 5); assert.equal(native.counts.ownerView, 0); assert.equal(native.counts.snapshot, 5);
});

test('HTTP 202 waits for the existing durable-admission promise and suppresses conflicting reads/actions', async t => {
  const entered = deferred(), durable = deferred(), flat = await flatFixture(t);
  const native = nativeFixture({ submit: async (action, input) => {
    entered.resolve(); await durable.promise;
    native.control.snapshot = nativeSnapshot({ busy: true });
    return { admitted: true, action, requestId: input.requestId, state: 'ADMITTED' };
  } });
  const defi = defiFixture(), app = await application(t, { accountSession: flat.session, nativeClaimSession: native.session, defiExit: defi.binding });
  let replied = false;
  const pending = post(app, ACTIONS.deposit.route, { requestId, intentId }).then(value => { replied = true; return value; });
  t.after(() => durable.resolve()); await entered.promise;
  assert.equal((await readState(app)).status, 409);
  assert.equal((await post(app, ACTIONS.refund.route, { requestId, intentId })).status, 409);
  assert.equal((await post(app, DEFI_ACTIONS.defiExecute.route, { requestId })).status, 409);
  await delay(20); assert.equal(replied, false); assert.equal(flat.counts.ownerView, 0);
  assert.equal(defi.counts.snapshot, 0); assert.equal(native.counts.submit.length, 1);
  durable.resolve(); assert.equal((await pending).status, 202);
  const value = (await readState(app)).json;
  assert.equal(value.portfolio, null); assert.equal(value.errors.portfolio, 'WALLET_OPERATION_IN_PROGRESS');
  assert.equal(flat.counts.ownerView, 0); assert.equal(defi.counts.snapshot, 0);
  native.control.snapshot = nativeSnapshot();
  assert.equal((await readState(app)).json.portfolio.balances.available, '9007199254740993');
});

test('rejected durable admission produces no 202, no automatic retry, and releases the admission fence', async t => {
  const entered = deferred(), durable = deferred();
  const native = nativeFixture({ submit: async () => { entered.resolve(); return durable.promise; } });
  const app = await application(t, { nativeClaimSession: native.session });
  const pending = post(app, ACTIONS.deposit.route, { requestId, intentId });
  await entered.promise; durable.reject(error('NATIVE_CLAIM_STORAGE_UNAVAILABLE'));
  const response = await pending; assert.equal(response.status, 503);
  assert.deepEqual(response.json, { error: 'NATIVE_CLAIM_STORAGE_UNAVAILABLE' });
  assert.equal(native.counts.submit.length, 1); assert.equal((await readState(app)).status, 200);
});

test('an active owner health read fences native/DeFi admission until the original read completes', async t => {
  const entered = deferred(), finish = deferred();
  const flat = await flatFixture(t, { ownerView: async () => { entered.resolve(); await finish.promise; return asset(); } });
  const native = nativeFixture(), defi = defiFixture();
  const app = await application(t, { accountSession: flat.session, nativeClaimSession: native.session, defiExit: defi.binding });
  const pending = readState(app); t.after(() => finish.resolve()); await entered.promise;
  assert.equal((await readState(app)).status, 409);
  assert.equal((await post(app, ACTIONS.deposit.route, { requestId, intentId })).status, 409);
  assert.equal((await post(app, DEFI_ACTIONS.defiExecute.route, { requestId })).status, 409);
  assert.equal(native.counts.submit.length, 0); assert.equal(defi.counts.mutations.length, 0);
  finish.resolve(); assert.equal((await pending).status, 200);
});

test('all five DeFi routes await exactly their fixed original service method and never expose originalReceipt', async t => {
  const defi = defiFixture(), app = await application(t, { defiExit: defi.binding });
  for (const [key, { route }] of Object.entries(DEFI_ACTIONS)) {
    const action = route.split('/').at(-1), input = ['prepare', 'requote'].includes(action)
      ? { requestId, minimumOutput: '9007199254740993', deadline: '2000000000' } : action === 'reopen' ? {} : { requestId };
    const response = await post(app, route, input); assert.equal(response.status, 200, key);
    assert.equal(response.json.action, action); assert.equal(response.json.underlyingPrivateSpendable, false);
    assert.deepEqual(defi.counts.mutations.at(-1), { action,
      args: ['prepare', 'requote'].includes(action) ? [input] : action === 'reopen' ? [] : [requestId] });
  }
  assert.equal(defi.counts.mutations.length, 5); assert.equal(defi.counts.originalReceipt, 0);
  assert.doesNotMatch((await readState(app)).text, /PRIVATE_RECEIPT_CANARY|originalReceipt/);
});

test('DeFi HTTP fields cannot replace the original recipient, receipt, runtime, amount or owner', async t => {
  const defi = defiFixture(), app = await application(t, { defiExit: defi.binding });
  for (const { route } of Object.values(DEFI_ACTIONS)) {
    const action = route.split('/').at(-1), base = ['prepare', 'requote'].includes(action)
      ? { requestId, minimumOutput: '1', deadline: '2000000000' } : action === 'reopen' ? {} : { requestId };
    for (const field of ['recipient', 'receiver', 'owner', 'runtime', 'rpc', 'originalReceipt', 'amount', 'shares', 'privateSpendable']) {
      const response = await post(app, route, { ...base, [field]: 'SYNTHETIC_CHANGED_TARGET' });
      assert.equal(response.status, 400, `${action}:${field}`); assert.equal(response.json.error, 'WALLET_BOOTSTRAP_FIELDS');
    }
    for (const bad of [null, [], 'text']) assert.equal((await post(app, route, bad)).status, 400);
  }
  assert.equal(defi.counts.mutations.length, 0); assert.equal(defi.counts.originalReceipt, 0);
  defi.control.actionError = error('PRIVATE_VAULT_EXIT_STORAGE_UNAVAILABLE');
  assert.equal((await post(app, DEFI_ACTIONS.defiExecute.route, { requestId })).status, 503);
  assert.equal(defi.counts.mutations.length, 1);
});

test('absent services and invalid HTTP bodies do not invoke a capability or acknowledge an operation', async t => {
  const disconnected = await application(t);
  assert.equal((await post(disconnected, ACTIONS.deposit.route, { requestId, intentId })).status, 503);
  assert.equal((await post(disconnected, DEFI_ACTIONS.defiReopen.route, {})).status, 503);
  const native = nativeFixture(), app = await application(t, { nativeClaimSession: native.session });
  for (const [headers, body, expected] of [[{ 'Content-Type': 'text/plain' }, '{}', 400],
    [{ 'Content-Type': 'application/json; charset=utf-8' }, '{}', 400], [{}, '{invalid', 400],
    [{}, JSON.stringify({ text: 'a'.repeat(4096) }), 413]]) {
    const response = await request(app, ACTIONS.deposit.route,
      { method: 'POST', headers: { ...actionHeaders(app), ...headers }, body });
    assert.equal(response.status, expected);
  }
  const getBody = await request(app, '/api/wallet/state', { headers: readHeaders(app), body: '{}' });
  assert.equal(getBody.status, 400); assert.equal(getBody.json.error, 'WALLET_GET_BODY_FORBIDDEN');
  assert.equal(native.counts.submit.length, 0); assert.equal((await readState(app)).status, 200);
});

test('real configured network transport pins local reads and freezes private bootstrap selections', async t => {
  const network = await networkFixture(t), config = network.config;
  const originalEndpoint = network.endpoint;
  const app = await application(t, { networkConfig: config });
  config.accounts[0].address = '0x' + '4'.repeat(40); config.accounts[0].chain = 'base';
  config.networks[0].endpoint = 'http://127.0.0.1:1/'; config.networks[0].genesisHash = '0x' + '5'.repeat(64);
  config.networks.push({ chain: 'base', genesisHash, endpoint: originalEndpoint });
  const response = await readState(app), value = validateWalletState(response.json);
  assert.equal(response.status, 200); assert.equal(value.networks.privateSpendable, false);
  assert.equal(value.networks.observation, 'TRUSTED_RPC_NATIVE_HOLDINGS_ONLY');
  assert.deepEqual(value.networks.chains.map(row => row.chain),
    ['ethereum', 'base', 'arbitrum', 'bnb', 'bsc-local', 'solana', 'bitcoin', 'tron']);
  assert.deepEqual(value.networks.chains.filter(row => row.configured).map(row => row.chain), ['ethereum']);
  const observation = value.networks.observations[0];
  assert.equal(observation.status, 'fresh'); assert.equal(observation.balanceAtomic, '9007199254740993');
  assert.equal(observation.address, privateAddress); assert.equal(observation.network.genesisHash, genesisHash);
  assert.equal(observation.creditEligible, false); assert.equal(observation.privateSpendableAtomic, null);
  assert.equal(observation.assurance, 'trusted-rpc-observation');
  assert.equal(observation.network.finality.independentConsensusVerified, false);
  assert.equal(network.calls.length, 8);
  assert.deepEqual(network.calls.map(call => call.body.method), ['eth_chainId', 'eth_getBlockByNumber', 'eth_getBlockByNumber',
    'eth_getBalance', 'eth_getBlockByNumber', 'eth_getBlockByNumber', 'eth_chainId', 'eth_getBlockByNumber']);
  assert.deepEqual(network.calls.find(call => call.body.method === 'eth_getBalance').body.params,
    [privateAddress, { blockHash, requireCanonical: true }]);
  assert.ok(network.calls.every(call => call.path === '/' && call.method === 'POST'));
  assert.ok(!response.text.includes(originalEndpoint));
  assert.equal((await request(app, '/api/wallet/state?address=changed', { headers: readHeaders(app) })).status, 404);
  assert.equal((await post(app, '/api/wallet/rpc', { endpoint: originalEndpoint, method: 'eth_sendRawTransaction' })).status, 404);
  assert.equal(network.calls.length, 8);
});

test('unconfigured and wrong-network observations remain unknown/null, never invented zero or private funds', async t => {
  const network = await networkFixture(t); network.control.mode = 'wrong-network';
  network.config.accounts.push({ chain: 'base', address: privateAddress });
  const app = await application(t, { networkConfig: network.config });
  const value = validateWalletState((await readState(app)).json), observations = value.networks.observations;
  assert.equal(observations.length, 2);
  assert.deepEqual(observations.map(row => row.reason), ['CHAIN_ID_MISMATCH', 'ADAPTER_NOT_CONFIGURED']);
  for (const row of observations) {
    assert.equal(row.status, 'unknown'); assert.equal(row.balanceAtomic, null); assert.equal(row.block, null);
    assert.equal(row.validUntilMs, null); assert.equal(row.creditEligible, false); assert.equal(row.privateSpendableAtomic, null);
  }
  assert.equal(network.calls.length, 1);
  for (const chain of projectWalletState(value).networks)
    for (const row of chain.observations) { assert.equal(row.amount, null); assert.equal(row.display, null); }
});

test('private network selection rejects duplicate accounts, sparse/accessor arrays and browser-shaped overrides', async () => {
  const account = { chain: 'ethereum', address: privateAddress };
  for (const networkConfig of [{ networks: [], accounts: [account, account] }, { networks: [], accounts: Array(1) },
    { networks: [], accounts: [{ ...account, rpc: 'http://127.0.0.1:1/' }] },
    { networks: [], accounts: [account], endpoint: 'http://127.0.0.1:1/' },
    { networks: [], accounts: [{ chain: 'unsupported', address: privateAddress }] }])
    await assert.rejects(startWalletApplication({ networkConfig }));
  let touched = false; const accounts = [];
  Object.defineProperty(accounts, '0', { enumerable: true, get() { touched = true; return account; } });
  await assert.rejects(startWalletApplication({ networkConfig: { networks: [], accounts } }), /WALLET_NETWORK_ACCOUNTS/);
  assert.equal(touched, false);
});

test('closing the listener is idempotent and retains original services and admitted durable work', async t => {
  const flat = await flatFixture(t), native = nativeFixture(), defi = defiFixture();
  const app = await application(t, { accountSession: flat.session, nativeClaimSession: native.session, defiExit: defi.binding });
  assert.equal((await post(app, ACTIONS.deposit.route, { requestId, intentId })).status, 202);
  const first = app.close(), again = app.close(); assert.equal(first, again);
  assert.deepEqual(await first, { listenerClosed: true, originalSessionsRetained: true, durableJobsCancelled: false });
  assert.equal(await again, await first); assert.equal(flat.counts.close, 0); assert.equal(native.counts.close, 0);
  assert.equal(defi.counts.close, 0); assert.equal(native.counts.restartKeeper, 0);
  assert.equal(native.counts.submit.length, 1);
  assert.equal((await flat.session.ownerView()).balances.available, '9007199254740993');
  assert.equal((await native.session.snapshot()).phase, 'READY'); assert.deepEqual(await defi.binding.service.snapshot(), defiSnapshot());
  await assert.rejects(readState(app), error => ['ECONNREFUSED', 'ECONNRESET'].includes(error.code));
  assert.throws(() => app.bindSessions({ nativeClaimSession: native.session }), /WALLET_BINDING_ALREADY_FIXED/);
});

test('default CLI source only opens the disconnected application and does not create nodes, proofs or funds', async () => {
  const source = await readFile(new URL('../../src/server/run.mjs', import.meta.url), 'utf8');
  assert.match(source, /startWalletApplication\(\)/); assert.match(source, /DISCONNECTED/);
  assert.match(source, /WALLET_CLI_NO_RUNTIME_OPTIONS/);
  assert.doesNotMatch(source, /createNativeClaimSession|createFlatAccountSession|createOwnedPrivateVaultExit|spawn\(|exec\(|fork\(|child_process|anvil|bitcoind|solana-test-validator/);
});

test('hostile thrown getters, inherited secrets and revoked proxies stay opaque without escaping the HTTP handler', async t => {
  let touched = 0;
  const getterError = Object.defineProperties({}, {
    code: { get() { touched++; throw new Error('PRIVATE_GETTER_CANARY'); } },
    message: { get() { touched++; throw new Error('PRIVATE_GETTER_CANARY'); } },
    generatedMessage: { get() { touched++; throw new Error('PRIVATE_GETTER_CANARY'); } },
  });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const inherited = Object.create({ code: 'WALLET_PRIVATE_INHERITED_CANARY', message: 'PRIVATE_CANARY' });
  const native = nativeFixture(), defi = defiFixture();
  const app = await application(t, { nativeClaimSession: native.session, defiExit: defi.binding });
  for (const thrown of [getterError, revoked.proxy, inherited, new Error('PRIVATE_MESSAGE_CANARY'),
    error('WALLET_' + 'A'.repeat(101)), 'PRIVATE_STRING_CANARY', null, undefined]) {
    native.control.submit = async () => { throw thrown; };
    const response = await post(app, ACTIONS.deposit.route, { requestId, intentId });
    assert.equal(response.status, 400); assert.deepEqual(response.json, { error: 'NATIVE_CLAIM_OPERATION_FAILED' });
    assert.doesNotMatch(response.text, /CANARY/);
    defi.control.actionError = thrown || error('not-a-public-error');
    const defiResponse = await post(app, DEFI_ACTIONS.defiExecute.route, { requestId });
    assert.equal(defiResponse.status, 400); assert.deepEqual(defiResponse.json, { error: 'WALLET_OPERATION_FAILED' });
    assert.equal((await readState(app)).status, 200);
  }
  assert.equal(touched, 0);
});

test('public error labels reject trailing line terminators rather than accepting a partial regex match', async t => {
  const native = nativeFixture(), app = await application(t, { nativeClaimSession: native.session });
  for (const ending of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
    native.control.submit = async () => { throw error('NATIVE_CLAIM_BUSY' + ending); };
    const response = await post(app, ACTIONS.deposit.route, { requestId, intentId });
    assert.equal(response.status, 400); assert.deepEqual(response.json, { error: 'NATIVE_CLAIM_OPERATION_FAILED' });
  }
});

test('closing during pending admission drops only HTTP and does not cancel or replay the original promise', async t => {
  const entered = deferred(), durable = deferred(), completed = deferred();
  const native = nativeFixture({ submit: async (action, input) => {
    entered.resolve(); await durable.promise;
    native.control.snapshot = nativeSnapshot({ busy: true }); completed.resolve();
    return { admitted: true, action, requestId: input.requestId, state: 'ADMITTED' };
  } });
  const app = await application(t, { nativeClaimSession: native.session });
  const pending = post(app, ACTIONS.deposit.route, { requestId, intentId }).then(value => value, error => error);
  await entered.promise;
  assert.equal((await app.close()).durableJobsCancelled, false);
  assert.equal((await pending).code, 'ECONNRESET');
  assert.equal(native.counts.close, 0); assert.equal(native.counts.submit.length, 1);
  durable.resolve(); await completed.promise;
  assert.equal((await native.session.snapshot()).busy, true);
  assert.equal(native.counts.close, 0); assert.equal(native.counts.submit.length, 1);
});

test('authenticated app state carries only the original captured native identity, including during busy/unavailable status', async t => {
  const identity = nativeIdentity('2'), native = nativeFixture({ identity });
  const app = await application(t, { nativeClaimSession: native.session });
  let value = (await readState(app)).json;
  assert.deepEqual(value.nativeClaims.identity, identity);
  assert.equal(value.nativeClaims.identity.claimSymbol, 'cSOL'); assert.equal(value.nativeClaims.identity.decimals, 9);
  assert.equal(value.capabilities.nativeRedeem, true); assert.equal(value.capabilities.nativeResume, true);
  assert.doesNotMatch((await request(app, '/')).text, new RegExp(identity.accountId + '|' + identity.claimDomain));
  assert.equal((await request(app, '/api/wallet/state')).status, 403);
  assert.equal((await request(app, '/api/wallet/native/identity', { headers: readHeaders(app) })).status, 404);
  assert.equal((await post(app, '/api/wallet/native/identity', {})).status, 404);
  syntheticIdentities.set(native.session, nativeIdentity('1'));
  native.control.snapshot = nativeSnapshot({ busy: true });
  value = (await readState(app)).json;
  assert.deepEqual(value.nativeClaims.identity, identity); assert.equal(value.nativeClaims.owner, null);
  assert.equal(value.capabilities.nativeRedeem, false); assert.equal(value.capabilities.nativeResume, false);
  native.control.snapshotError = error('NATIVE_CLAIM_STORAGE_UNAVAILABLE');
  value = (await readState(app)).json;
  assert.deepEqual(value.nativeClaims.identity, identity); assert.equal(value.nativeClaims.snapshot, null);
  assert.ok(Object.values(value.capabilities).every(value => value === false));
});

test('missing native identity fences monetary actions and effectful resume while original reconciliation remains available', async t => {
  const native = nativeFixture({ identity: null }), app = await application(t, { nativeClaimSession: native.session });
  const value = (await readState(app)).json;
  assert.equal(value.nativeClaims.identity, null); assert.deepEqual(value.nativeClaims.snapshot, nativeSnapshot());
  assert.deepEqual(value.nativeClaims.owner, native.control.owner); assert.equal(value.errors.nativeClaims, null);
  for (const action of ['deposit', 'redeem', 'refund', 'resume']) {
    assert.equal(value.capabilities[ACTIONS[action].capability], false);
    const input = ['deposit', 'refund'].includes(action) ? { requestId, intentId }
      : action === 'redeem' ? { requestId, amount: '1', maxFee: '1' } : { requestId };
    const response = await post(app, ACTIONS[action].route, input);
    assert.equal(response.status, 503); assert.deepEqual(response.json, { error: 'WALLET_NATIVE_IDENTITY_UNAVAILABLE' });
  }
  assert.equal(native.counts.submit.length, 0); assert.equal(value.capabilities.nativeReconcile, true);
  assert.equal((await post(app, ACTIONS.reconcile.route, { requestId })).status, 202);
  assert.deepEqual(native.counts.submit, [{ action: 'reconcile', input: { requestId } }]);
  native.control.snapshot = nativeSnapshot({ busy: true });
  assert.equal((await readState(app)).json.capabilities.nativeReconcile, false);
});

test('identity cannot be supplied through bootstrap options or attached later to replace the fixed session metadata', async t => {
  const native = nativeFixture({ identity: null }), app = await application(t);
  for (const key of ['identity', 'nativeIdentity', 'claimSymbol', 'decimals', 'claimDomain'])
    assert.throws(() => app.bindSessions({ nativeClaimSession: native.session, [key]: nativeIdentity() }), /WALLET_BOOTSTRAP_FIELDS/);
  app.bindSessions({ nativeClaimSession: native.session });
  syntheticIdentities.set(native.session, nativeIdentity());
  const value = (await readState(app)).json;
  assert.equal(value.nativeClaims.identity, null); assert.equal(value.capabilities.nativeRedeem, false);
  const response = await post(app, ACTIONS.redeem.route, { requestId, amount: '1', maxFee: '1', identity: nativeIdentity() });
  assert.equal(response.status, 503); assert.equal(native.counts.submit.length, 0);
});

test('manual TOP_UP/EXIT routes preserve exact original calls and explicitly acknowledge only volatile queue acceptance', async t => {
  const account = await manualAccountFixture(t), app = await application(t, { accountSession: account.session });
  for (const kind of ['TOP_UP', 'EXIT']) {
    const input = accountPrepare(kind, 'manual_' + kind + '_01');
    let response = await post(app, accountRoutes.prepare, input);
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { version: 1, profile: 'FLAT_ACCOUNT_VOLATILE_ADMISSION_V1', acceptance: 'VOLATILE_UI_QUEUE_ONLY',
      durableAdmissionEstablished: false, settlementEstablished: false,
      admission: { version: 1, admitted: true, sequence: kind === 'TOP_UP' ? 1 : 4, action: 'prepare', requestId: input.requestId } });
    await account.session.idle(); assert.deepEqual(account.counts.mutations.at(-1), { action: 'prepare', input });
    const state = (await readState(app)).json;
    assert.equal(state.account.snapshot.profile, 'LOCAL_FLAT_ACCOUNT_API_V1');
    assert.equal(state.account.snapshot.requests.find(row => row.requestId === input.requestId).kind, kind);
    assert.equal(state.account.snapshot.requests.find(row => row.requestId === input.requestId).state, 'PREPARED');
    assert.equal(state.capabilities.accountExecute, true); assert.equal(state.capabilities.graphExecution, false);
    response = await post(app, accountRoutes.execute, { requestId: input.requestId });
    assert.equal(response.status, 200); assert.equal(response.json.acceptance, 'VOLATILE_UI_QUEUE_ONLY');
    assert.equal(response.json.durableAdmissionEstablished, false); assert.equal(response.json.settlementEstablished, false);
    await account.session.idle(); assert.deepEqual(account.counts.mutations.at(-1), { action: 'execute', input: input.requestId });
    response = await post(app, accountRoutes.reconcile, { requestId: input.requestId });
    assert.equal(response.status, 200); await account.session.idle();
    assert.deepEqual(account.counts.mutations.at(-1), { action: 'reconcile', input: input.requestId });
  }
  assert.equal(account.counts.mutations.length, 6);
});

test('account HTTP acknowledgment precedes blocked keeper work and cannot establish durable admission or completion', async t => {
  const account = await manualAccountFixture(t), gate = account.block('prepare'), native = nativeFixture(), defi = defiFixture();
  const network = await networkFixture(t);
  const app = await application(t, { accountSession: account.session, nativeClaimSession: native.session, defiExit: defi.binding, networkConfig: network.config });
  const pending = post(app, accountRoutes.prepare, accountPrepare()); await gate.entered.promise;
  const response = await pending; assert.equal(response.status, 200);
  assert.equal(response.json.acceptance, 'VOLATILE_UI_QUEUE_ONLY'); assert.equal(response.json.durableAdmissionEstablished, false);
  assert.equal(response.json.settlementEstablished, false); assert.equal(account.control.rows.length, 0);
  const value = (await readState(app)).json;
  assert.equal(value.account.snapshot.busy, true); assert.equal(value.account.snapshot.observation, 'STALE');
  assert.equal(value.account.snapshot.requests.length, 0); assert.equal(value.account.snapshot.admissions[0].state, 'RUNNING');
  assert.equal(value.portfolio, null); assert.equal(value.nativeClaims.owner, null); assert.equal(value.defi.snapshot, null);
  for (const section of ['account', 'portfolio', 'nativeClaims', 'defi']) assert.equal(value.errors[section], 'WALLET_OPERATION_IN_PROGRESS');
  assert.ok(Object.values(value.capabilities).every(value => value === false));
  assert.equal(account.counts.ownerView, 0); assert.equal(native.counts.ownerView, 0); assert.equal(defi.counts.snapshot, 0);
  assert.equal(value.networks.observations[0].status, 'fresh'); assert.equal(network.calls.length, 8);
  for (const [path, body] of [[ACTIONS.reconcile.route, { requestId }], [ACTIONS.deposit.route, { requestId, intentId }],
    [DEFI_ACTIONS.defiReopen.route, {}], [accountRoutes.reconcile, { requestId: 'manual_account_01' }]])
    assert.equal((await post(app, path, body)).status, 409);
  assert.equal(native.counts.submit.length, 0); assert.equal(defi.counts.mutations.length, 0);
  gate.release.resolve(); await account.session.idle();
  assert.equal((await readState(app)).json.account.snapshot.requests[0].state, 'PREPARED');
});

test('fresh native busy/unavailable and unreadable account journals fence every mutation and all custody reads', async t => {
  const account = await manualAccountFixture(t), native = nativeFixture(), defi = defiFixture();
  const app = await application(t, { accountSession: account.session, nativeClaimSession: native.session, defiExit: defi.binding });
  const cases = [
    () => { native.control.snapshot = nativeSnapshot({ busy: true }); },
    () => { native.control.snapshot = nativeSnapshot({ queued: 1 }); },
    () => { native.control.snapshot = nativeSnapshot({ phase: 'UNAVAILABLE', storageAvailable: false }); },
    () => { native.control.snapshotError = new Error('PRIVATE_ACTIVITY_CANARY'); },
    () => { native.control.snapshotError = null; native.control.snapshot = nativeSnapshot(); account.control.snapshotError = error('JOURNAL_STORAGE_UNAVAILABLE'); },
  ];
  for (const setup of cases) {
    setup(); const response = await readState(app), value = response.json;
    assert.equal(value.portfolio, null); assert.equal(value.nativeClaims.owner, null); assert.equal(value.defi.snapshot, null);
    assert.ok(Object.values(value.capabilities).every(value => value === false)); assert.doesNotMatch(response.text, /PRIVATE_ACTIVITY_CANARY/);
    for (const [path, input] of [[accountRoutes.prepare, accountPrepare()], [accountRoutes.execute, { requestId }],
      [accountRoutes.reconcile, { requestId }], [ACTIONS.reconcile.route, { requestId }],
      [ACTIONS.resume.route, { requestId }], [DEFI_ACTIONS.defiReopen.route, {}]])
      assert.ok([409, 503].includes((await post(app, path, input)).status), path);
  }
  assert.equal(account.counts.mutations.length, 0); assert.equal(native.counts.submit.length, 0); assert.equal(defi.counts.mutations.length, 0);
  assert.equal(account.counts.ownerView, 0); assert.equal(native.counts.ownerView, 0); assert.equal(defi.counts.snapshot, 0);
});

test('GRAPH is refused for prepare aliases and existing execute/reconcile IDs before any account admission', async t => {
  const graphId = 'original_graph_01', account = await manualAccountFixture(t,
    [{ requestId: graphId, kind: 'GRAPH', state: 'PREPARED', assetId: 'd'.repeat(64) }]);
  const app = await application(t, { accountSession: account.session });
  for (const [path, input] of [[accountRoutes.prepare, { ...accountPrepare(), kind: 'GRAPH' }],
    [accountRoutes.prepare, accountPrepare('TOP_UP', graphId)], [accountRoutes.prepare, accountPrepare('EXIT', graphId)],
    [accountRoutes.execute, { requestId: graphId }], [accountRoutes.reconcile, { requestId: graphId }]]) {
    const response = await post(app, path, input); assert.equal(response.status, 400);
    assert.equal(response.json.error, 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
  }
  for (const action of ['execute', 'reconcile']) {
    const response = await post(app, accountRoutes[action], { requestId: 'unknown_original_01' });
    assert.equal(response.status, 400); assert.equal(response.json.error, 'WALLET_ACCOUNT_REQUEST_UNKNOWN');
  }
  assert.equal(account.counts.mutations.length, 0); assert.equal((await account.session.snapshot()).admissions.length, 0);
});

test('account execute and reconciliation enforce original stored state, while changed kinds cannot rebind a request', async t => {
  const input = accountPrepare(), account = await manualAccountFixture(t,
    [{ requestId: input.requestId, kind: input.kind, state: 'PREPARING', assetId: input.assetId }]);
  const app = await application(t, { accountSession: account.session });
  for (const state of ['PREPARING', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED']) {
    account.control.rows[0].state = state;
    const response = await post(app, accountRoutes.execute, { requestId: input.requestId });
    assert.equal(response.status, 409); assert.equal(response.json.error, 'WALLET_ACCOUNT_STATE_CONFLICT');
  }
  for (const state of ['PREPARING', 'PREPARED']) {
    account.control.rows[0].state = state;
    assert.equal((await post(app, accountRoutes.reconcile, { requestId: input.requestId })).status, 409);
  }
  assert.equal((await post(app, accountRoutes.prepare, accountPrepare('EXIT', input.requestId))).status, 409);
  assert.equal(account.counts.mutations.length, 0);
  for (const state of ['SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED']) {
    account.control.rows[0].state = state;
    assert.equal((await post(app, accountRoutes.reconcile, { requestId: input.requestId })).status, 200); await account.session.idle();
  }
  assert.equal(account.counts.mutations.length, 4);
});

test('account route access and exact fields exclude unapproved graph recovery, lifecycle and arbitrary authority', async t => {
  const account = await manualAccountFixture(t), app = await application(t, { accountSession: account.session });
  const disconnected = await application(t);
  assert.equal((await post(disconnected, accountRoutes.prepare, accountPrepare())).status, 503);
  for (const headers of [{ ...actionHeaders(app), 'x-wallet-action-token': app.ownerAccess.token },
    { 'Content-Type': 'application/json', 'x-wallet-action-token': app.actionAccess.token }])
    assert.equal((await request(app, accountRoutes.prepare, { method: 'POST', headers, body: JSON.stringify(accountPrepare()) })).status, 403);
  assert.equal((await post(app, '/api/wallet/account/recover', { requestId })).status, 400);
  for (const path of ['/api/wallet/account/graph', '/api/wallet/account/restart',
    '/api/wallet/account/restartCoordinator', '/api/wallet/account/close', '/api/wallet/account/prepare/', '/api/wallet/account/execute?requestId=changed'])
    assert.equal((await post(app, path, { requestId })).status, 404);
  for (const field of ['recipient', 'amount', 'ownerKey', 'witness', 'endpoint', 'controller', 'nativeIdentity']) {
    const response = await post(app, accountRoutes.prepare, { ...accountPrepare(), [field]: 'FORBIDDEN_CANARY' });
    assert.equal(response.status, 400); assert.doesNotMatch(response.text, /FORBIDDEN_CANARY/);
    assert.equal((await post(app, accountRoutes.execute, { requestId, [field]: 'FORBIDDEN_CANARY' })).status, 400);
  }
  for (const requestId of ['bad', 'valid_original_01\n', 'éinvalid_01'])
    assert.equal((await post(app, accountRoutes.reconcile, { requestId })).status, 400);
  assert.equal(account.counts.mutations.length, 0);
});

test('an asynchronously rejected original owner reference remains a failed volatile admission without synthetic success', async t => {
  const account = await manualAccountFixture(t), app = await application(t, { accountSession: account.session });
  const response = await post(app, accountRoutes.prepare, { ...accountPrepare(), ownerOperationRef: 'f'.repeat(64) });
  assert.equal(response.status, 200); assert.equal(response.json.durableAdmissionEstablished, false); assert.equal(response.json.settlementEstablished, false);
  await account.session.idle();
  const value = (await readState(app)).json;
  assert.equal(value.account.snapshot.requests.length, 0); assert.equal(value.account.snapshot.admissions[0].state, 'FAILED');
  assert.equal(value.account.snapshot.admissions[0].errorCode, 'JOURNAL_OWNER_PREPARATION_UNAVAILABLE');
  assert.equal((await post(app, accountRoutes.execute, { requestId: 'manual_account_01' })).status, 400);
  assert.equal(account.counts.mutations.length, 1);
});

test('lost account HTTP reply preserves the original job/ID and only an explicit original reconciliation follows', async t => {
  const input = accountPrepare(), account = await manualAccountFixture(t,
    [{ requestId: input.requestId, kind: input.kind, state: 'PREPARED', assetId: input.assetId }]);
  const gate = account.block('execute'); account.control.lostExecute = true;
  const app = await application(t, { accountSession: account.session });
  const lost = new Promise(resolve => {
    const bytes = JSON.stringify({ requestId: input.requestId });
    const outgoing = httpRequest(app.origin + accountRoutes.execute, { method: 'POST', agent: false,
      headers: { ...actionHeaders(app), 'Content-Length': Buffer.byteLength(bytes) } }, () => assert.fail('REPLY_SHOULD_BE_INTERRUPTED'));
    outgoing.on('error', resolve); void gate.entered.promise.then(() => outgoing.destroy(error('TEST_LOST_ACCOUNT_REPLY')));
    outgoing.end(bytes);
  });
  assert.equal((await lost).code, 'TEST_LOST_ACCOUNT_REPLY');
  assert.equal(account.counts.mutations.length, 1); assert.equal((await readState(app)).json.account.snapshot.busy, true);
  gate.release.resolve(); await account.session.idle();
  const value = (await readState(app)).json;
  assert.equal(value.account.snapshot.requests[0].requestId, input.requestId); assert.equal(value.account.snapshot.requests[0].state, 'UNKNOWN');
  assert.equal(account.counts.mutations.length, 1);
  assert.equal((await post(app, accountRoutes.execute, { requestId: input.requestId })).status, 409);
  assert.equal((await post(app, accountRoutes.reconcile, { requestId: input.requestId })).status, 200); await account.session.idle();
  assert.deepEqual(account.counts.mutations.map(row => row.action), ['execute', 'reconcile']);
  assert.ok(account.counts.mutations.every(row => row.input === input.requestId));
});

test('a thrown original account snapshot blocks native/DeFi calls and every custody view without leaking its error', async t => {
  const account = await manualAccountFixture(t), native = nativeFixture(), defi = defiFixture();
  const app = await application(t, { accountSession: account.session, nativeClaimSession: native.session, defiExit: defi.binding });
  // The existing account error mapper throws on this hostile synthetic keeper
  // error. Exercise the app's thrown-snapshot fence without replacing the real
  // branded account session or changing its existing error/lifecycle semantics.
  account.control.snapshotError = Object.defineProperty({}, 'code', { get() { throw new Error('PRIVATE_ACCOUNT_SNAPSHOT_CANARY'); } });
  const response = await readState(app), value = response.json;
  assert.equal(value.account.snapshot, null); assert.equal(value.errors.account, 'WALLET_OPERATION_FAILED');
  assert.equal(value.portfolio, null); assert.equal(value.nativeClaims.owner, null); assert.equal(value.defi.snapshot, null);
  assert.equal(value.nativeClaims.snapshot.phase, 'READY'); assert.equal(value.errors.nativeClaims, 'WALLET_ACTIVITY_UNAVAILABLE');
  assert.ok(Object.values(value.capabilities).every(value => value === false)); assert.doesNotMatch(response.text, /CANARY/);
  for (const [path, input] of [[ACTIONS.reconcile.route, { requestId }], [ACTIONS.deposit.route, { requestId, intentId }],
    [DEFI_ACTIONS.defiReopen.route, {}], [accountRoutes.prepare, accountPrepare()]]) {
    const result = await post(app, path, input);
    assert.equal(result.status, 503); assert.equal(result.json.error, 'WALLET_ACTIVITY_UNAVAILABLE');
  }
  assert.equal(account.counts.mutations.length, 0); assert.equal(native.counts.submit.length, 0); assert.equal(defi.counts.mutations.length, 0);
  assert.equal(account.counts.ownerView, 0); assert.equal(native.counts.ownerView, 0); assert.equal(defi.counts.snapshot, 0);
});

test('manual PREPARING continuation preserves hidden original ref/asset; hostile changes fail inside original keeper equality', async t => {
  const input = accountPrepare(), row = { requestId: input.requestId, kind: input.kind, assetId: input.assetId, state: 'PREPARING' };
  const account = await manualAccountFixture(t, [row]), app = await application(t, { accountSession: account.session });
  for (const changed of [{ ...input, ownerOperationRef: 'f'.repeat(64) }, { ...input, assetId: 'e'.repeat(64) }]) {
    const response = await post(app, accountRoutes.prepare, changed);
    // The app cannot inspect the hidden ref/asset binding. Acceptance of its
    // volatile queue item is explicitly not evidence that the keeper accepted it.
    assert.equal(response.status, 200); assert.equal(response.json.durableAdmissionEstablished, false);
    assert.equal(response.json.settlementEstablished, false); await account.session.idle();
    const snapshot = (await readState(app)).json.account.snapshot;
    assert.equal(snapshot.admissions.at(-1).state, 'FAILED'); assert.equal(snapshot.admissions.at(-1).errorCode, 'JOURNAL_REQUEST_CONFLICT');
    assert.deepEqual(account.control.rows, [row]);
    assert.equal(Object.hasOwn(snapshot.requests[0], 'assetId'), false); assert.equal(Object.hasOwn(snapshot.requests[0], 'ownerOperationRef'), false);
  }
  assert.ok(account.counts.mutations.every(row => row.action === 'prepare'));
  const continued = await post(app, accountRoutes.prepare, input);
  assert.equal(continued.status, 200); assert.equal(continued.json.admission.requestId, input.requestId);
  await account.session.idle();
  assert.deepEqual(account.control.rows, [{ ...row, state: 'PREPARED' }]);
  assert.equal(account.counts.mutations.length, 3); assert.ok(account.counts.mutations.every(row => row.action === 'prepare'));
});

test('genuine fixed original EVM observers use real loopback reads and expose only non-authorizing status metadata', async t => {
  for (const chain of ['ethereum', 'base', 'arbitrum', 'bnb']) {
    const f = await transferHttpFixture(t, chain), app = await application(t, { networkConfig: f.config, transferObservers: [f.observer] });
    assert.equal(f.calls.length, 0, 'private binding performs no RPC');
    const response = await readState(app), value = validateWalletState(response.json);
    assert.equal(value.transfers.profile, 'FIXED_ORIGINAL_EVM_TRANSFERS_V1');
    assert.equal(value.transfers.observation, 'TRUSTED_RPC_RETAINED_TRANSFER_METADATA_ONLY');
    assert.equal(value.errors.transfers, null); assert.equal(value.transfers.rows.length, 1);
    const row = value.transfers.rows[0]; assertTransferMetadata(row, f.original);
    assert.equal(row.direction, 'outgoing'); assert.equal(row.ownerAddress, f.original.expected.from);
    assert.equal(row.refreshStatus, 'REFRESHED'); assert.equal(row.errorCode, null); assert.equal(row.status.status, 'observed');
    assert.equal(row.status.chain, chain); assert.equal(row.status.genesisHash, f.genesisHash); assert.equal(row.status.asset.decimals, 18);
    assert.equal(row.status.asset.symbol, chain === 'bnb' ? 'BNB' : 'ETH');
    assert.equal(row.status.value, '9007199254740993'); assert.match(row.status.observedAtMs, /^[0-9]+$/);
    assert.equal(response.text.includes(f.endpoint), false);
    const transactions = f.calls.filter(call => ['eth_getTransactionByHash', 'eth_getTransactionReceipt'].includes(call.method));
    assert.equal(transactions.length, 4); assert.ok(transactions.every(call => JSON.stringify(call.params) === JSON.stringify(['0x' + f.original.expected.nativeId])));
    assert.equal(f.calls.length, 22, '8 fixed holdings reads + 14 fixed original transfer reads');
    assert.ok(f.calls.every(call => ['eth_chainId', 'eth_getBlockByNumber', 'eth_getBalance', 'eth_getTransactionByHash', 'eth_getTransactionReceipt'].includes(call.method)));
  }
});

test('observer provenance is insufficient without fixed matching owner and chain/genesis association', async t => {
  const f = await transferHttpFixture(t);
  for (const options of [
    { transferObservers: [f.observer] },
    { networkConfig: { ...f.config, accounts: [] }, transferObservers: [f.observer] },
    { networkConfig: { ...f.config, networks: [] }, transferObservers: [f.observer] },
    { networkConfig: { ...f.config, accounts: [{ chain: 'ethereum', address: '0x' + '5'.repeat(40) }] }, transferObservers: [f.observer] },
    { networkConfig: { ...f.config, networks: [{ ...f.config.networks[0], genesisHash: '0x' + '5'.repeat(64) }] }, transferObservers: [f.observer] },
    { networkConfig: { networks: [{ ...f.config.networks[0], chain: 'base' }], accounts: [{ chain: 'base', address: f.original.expected.from }] }, transferObservers: [f.observer] },
  ]) await assert.rejects(startWalletApplication(options), /WALLET_TRANSFER_OWNER_ASSOCIATION/);
  assert.equal(f.calls.length, 0);
  const incoming = await application(t, { networkConfig: { ...f.config, accounts: [{ chain: 'ethereum', address: f.original.expected.to }] }, transferObservers: [f.observer] });
  const row = (await readState(incoming)).json.transfers.rows[0]; assert.equal(row.direction, 'incoming'); assert.equal(row.ownerAddress, f.original.expected.to);
  assertTransferMetadata(row, f.original);
});

test('private observer arrays are bounded/dense and copied capabilities, getters, proxies and duplicate originals reject before RPC', async t => {
  const f = await transferHttpFixture(t); let touched = 0;
  const getter = []; Object.defineProperty(getter, '0', { enumerable: true, get() { touched++; return f.observer; } });
  const forged = { originalIdentity() { touched++; return f.observer.originalIdentity(); }, status() { touched++; return f.observer.status(); }, observe() { touched++; } };
  for (const transferObservers of [Array(1), Array(9).fill(f.observer), getter,
    new Proxy([], { ownKeys() { touched++; return []; } }), [{ ...f.observer }], [forged],
    [new Proxy(f.observer, { get() { touched++; } })], [f.observer, f.observer]])
    await assert.rejects(startWalletApplication({ networkConfig: f.config, transferObservers }));
  const duplicate = createHttpEvmNativeTransferObserver({ chain: 'ethereum', genesisHash: f.genesisHash, endpoint: f.endpoint,
    original: f.original, now: () => f.clock.now });
  await assert.rejects(startWalletApplication({ networkConfig: f.config, transferObservers: [f.observer, duplicate] }), /WALLET_TRANSFER_DUPLICATE/);
  assert.equal(touched, 0); assert.equal(f.calls.length, 0);
  const originals = Array.from({ length: 8 }, (_, index) => transferOriginalFixture('ethereum', 2, { nonce: String(100 + index) }));
  const eight = originals.map(item => createEvmNativeTransferObserver(item.config));
  const app = await application(t, { networkConfig: { ...f.config, accounts: [{ chain: 'ethereum', address: f.original.expected.to }] }, transferObservers: eight });
  assert.equal(new URL(app.origin).hostname, '127.0.0.1'); assert.ok(originals.every(item => item.calls.length === 0));
});

test('private transfer selection and owner association cannot change after binding or through an HTTP request', async t => {
  const f = await transferHttpFixture(t), observers = [f.observer];
  const app = await application(t, { networkConfig: f.config, transferObservers: observers });
  observers.length = 0; f.config.accounts[0].address = f.original.expected.to; f.config.networks[0].genesisHash = '0x' + '6'.repeat(64);
  const row = (await readState(app)).json.transfers.rows[0]; assert.equal(row.direction, 'outgoing'); assert.equal(row.ownerAddress, f.original.expected.from);
  const count = f.calls.length;
  for (const path of ['/api/wallet/transfers', '/api/wallet/transfers/observe', '/api/wallet/transfers/broadcast',
    '/api/wallet/transfer', '/api/wallet/rpc', '/api/wallet/state?nativeId=' + f.original.expected.nativeId]) {
    assert.equal((await post(app, path, { nativeId: f.original.expected.nativeId, nativeWire: f.original.nativeWire, endpoint: f.endpoint })).status, 404);
    assert.equal((await request(app, path, { headers: readHeaders(app) })).status, 404);
  }
  assert.equal(f.calls.length, count); assert.throws(() => app.bindSessions({ transferObservers: [f.observer], networkConfig: f.config }), /WALLET_BINDING_ALREADY_FIXED/);
});

test('busy or unavailable original journals suppress transfer refresh and downgrade retained success to explicit stale metadata', async t => {
  const f = await transferHttpFixture(t), account = await manualAccountFixture(t), native = nativeFixture();
  const app = await application(t, { accountSession: account.session, nativeClaimSession: native.session, networkConfig: f.config, transferObservers: [f.observer] });
  assert.equal((await readState(app)).json.transfers.rows[0].status.status, 'observed');
  const keeperGate = account.block('prepare'); await post(app, accountRoutes.prepare, accountPrepare()); await keeperGate.entered.promise;
  const cases = [
    () => {},
    () => { account.control.snapshotError = error('JOURNAL_STORAGE_UNAVAILABLE'); },
    () => { native.control.snapshot = nativeSnapshot({ queued: 1 }); },
  ];
  for (const setup of cases) {
    setup(); const before = f.calls.filter(call => call.method.startsWith('eth_getTransaction')).length;
    const value = (await readState(app)).json, row = value.transfers.rows[0];
    assert.equal(row.refreshStatus, 'BLOCKED'); assert.equal(row.status.status, 'stale'); assert.equal(row.status.validUntilMs, null);
    assert.equal(row.errorCode, value.errors.transfers); assertTransferMetadata(row, f.original);
    assert.equal(f.calls.filter(call => call.method.startsWith('eth_getTransaction')).length, before);
  }
  keeperGate.release.resolve(); await account.session.idle(); native.control.snapshot = nativeSnapshot();
  const before = f.calls.filter(call => call.method.startsWith('eth_getTransaction')).length;
  const value = (await readState(app)).json, row = value.transfers.rows[0];
  assert.equal(row.refreshStatus, 'BLOCKED'); assert.equal(row.errorCode, 'WALLET_ACTIVITY_UNAVAILABLE');
  assert.equal(row.status.status, 'stale'); assert.equal(row.status.validUntilMs, null);
  assert.equal(f.calls.filter(call => call.method.startsWith('eth_getTransaction')).length, before);
  account.control.snapshotError = null;
  assert.equal((await readState(app)).json.transfers.rows[0].status.status, 'observed');
});

test('failed refresh after an observed original cannot publish its retained success as current or leak raw errors', async t => {
  const f = await transferHttpFixture(t), app = await application(t, { networkConfig: f.config, transferObservers: [f.observer] });
  const first = (await readState(app)).json.transfers.rows[0]; assert.equal(first.status.status, 'observed');
  f.clock.broken = true;
  let response = await readState(app), row = response.json.transfers.rows[0];
  assert.equal(row.refreshStatus, 'FAILED'); assert.equal(row.status.status, 'unknown'); assert.equal(row.status.validUntilMs, null);
  assert.equal(row.errorCode, 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE'); assert.equal(response.json.errors.transfers, row.errorCode);
  assertTransferMetadata(row, f.original); assert.doesNotMatch(response.text, /PRIVATE_TRANSFER_CLOCK_CANARY/);
  assert.equal(f.observer.status().status, 'observed', 'source retains its prior snapshot; app must explicitly downgrade failed refresh');
  f.clock.broken = false; f.state.receipt = null;
  response = await readState(app); row = response.json.transfers.rows[0];
  assert.equal(row.refreshStatus, 'REFRESHED'); assert.equal(row.status.status, 'unknown'); assert.equal(row.status.reason, 'EVM_TRANSFER_RECEIPT_MISSING');
  assert.equal(row.status.validUntilMs, null); assert.equal(response.json.errors.transfers, 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE'); assertTransferMetadata(row, f.original);
});

test('pending, reverted, reorged and stale original transfer observations remain metadata and never become private balances', async t => {
  for (const scenario of ['pending', 'reverted', 'reorged', 'stale']) {
    const f = await transferHttpFixture(t), app = await application(t, { networkConfig: f.config, transferObservers: [f.observer] });
    if (scenario === 'pending') { f.state.tx.blockHash = null; f.state.tx.blockNumber = null; f.state.tx.transactionIndex = null; f.state.receipt = null; }
    if (scenario === 'reverted') f.state.receipt.status = '0x0';
    if (scenario === 'reorged') {
      assert.equal((await readState(app)).json.transfers.rows[0].status.status, 'observed');
      f.state.receipt.gasUsed = '0x5209';
    }
    if (scenario === 'stale') f.clock.now += 2000000;
    const value = (await readState(app)).json, row = value.transfers.rows[0];
    assert.equal(row.status.status, scenario); assert.equal(row.refreshStatus, 'REFRESHED'); assertTransferMetadata(row, f.original);
    assert.equal(value.portfolio, null); assert.equal(value.nativeClaims, null); assert.equal(value.account, null);
    assert.ok(Object.values(value.capabilities).every(value => value === false));
    if (['reorged', 'stale'].includes(scenario)) assert.equal(value.errors.transfers, 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE');
    else assert.equal(value.errors.transfers, null);
  }
});
