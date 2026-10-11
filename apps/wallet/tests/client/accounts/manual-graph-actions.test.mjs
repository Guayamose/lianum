/** HOST-ONLY: lower custody/provenance and keeper construction are explicit
 * synthetic mocks. The real private graph join, existing session, HTTP server,
 * exact tokens and SDK run. No native/proof acceptance or activation claim. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { flatAccountManualGraphDetails as actualDetails, assertOwnedFlatAccountAuthority } from '../../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { assertOwnedFlatPortfolioAccount as actualPortfolioAccount } from '../../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { ownedFlatManualEvmGraphReview as actualExecutorReview } from '../../../../../packages/backend/src/execution/account/execution/flat-native-execution.mjs';
import { ownedFlatEvmVaultProviderReview as actualProviderReview } from '../../../../../packages/backend/src/providers/evm-vault-provider.mjs';
import { createWalletApplicationClient } from '../../../../../packages/backend/src/api/wallet/wallet-application-client.mjs';
import { buildActionBody, accountReviewDetails } from '../../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs';

const accounts = new WeakMap(), portfolios = new WeakMap(), approvals = new WeakMap(), controls = new WeakMap();
const fail = code => { throw Object.assign(new Error(code), { code }); };
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
mock.module('../wallet-platform/modules/global-state/flat-account-authority.mjs', { exports: {
  assertOwnedFlatAccountAuthority,
  assertFlatAccountManualGraphExecution(value) {
    const data = approvals.get(value);
    if (!data || !accounts.get(data.account)?.live || accounts.get(data.account)?.routeUnavailable) fail('FLAT_ACCOUNT_MANUAL_GRAPH_ROUTE_UNAVAILABLE');
  },
  flatAccountManualGraphDetails(value) {
    const data = approvals.get(value);
    if (!data || !accounts.get(data.account)?.live) fail('FLAT_ACCOUNT_MANUAL_GRAPH_ORIGINAL_REQUIRED');
    if (data.review.family !== '3') fail('FLAT_ACCOUNT_MANUAL_GRAPH_ROUTE_UNSUPPORTED');
    return data;
  },
} });
mock.module('../wallet-platform/modules/global-state/flat-portfolio-authority.mjs', { exports: {
  assertOwnedFlatPortfolio(runtime, value) {
    if (!portfolios.has(value) || portfolios.get(value).runtime !== runtime) fail('FLAT_PORTFOLIO_OWNED_CAPABILITY_REQUIRED');
  },
  assertOwnedFlatPortfolioAccount(value, account) {
    if (portfolios.get(value)?.account !== account || !accounts.get(account)?.live) fail('FLAT_PORTFOLIO_ORIGINAL_ACCOUNT_REQUIRED');
  },
} });
const originalMixedKeepers = new WeakMap();
mock.module('../wallet-platform/modules/global-state/flat-manual-portfolio-keeper.mjs', { exports: {
  async createFlatManualPortfolioKeeper({ runtime, portfolio }) {
    const c = controls.get(portfolio.config); assert.equal(portfolio.authority, c.authority); c.creations++;
    originalMixedKeepers.set(c.keeper, { runtime, portfolio }); return c.keeper;
  },
  assertOwnedFlatManualPortfolioKeeper(keeper, expected) {
    const retained = originalMixedKeepers.get(keeper);
    assert.ok(retained && retained.runtime === expected.runtime && retained.portfolio === expected.portfolio,
      'SYNTHETIC_ORIGINAL_MIXED_KEEPER_REQUIRED');
  },
} });
const syntheticCatalogues = new WeakMap();
mock.module('../wallet-platform/modules/global-state/flat-journal-catalogue.mjs', { exports: {
  assertOwnedFlatJournalCatalogue(catalogue, expected) {
    assert.equal(syntheticCatalogues.get(catalogue)?.runtime, expected.runtime, 'SYNTHETIC_ORIGINAL_CATALOGUE_REQUIRED');
    assert.ok(syntheticCatalogues.has(catalogue), 'SYNTHETIC_ORIGINAL_CATALOGUE_REQUIRED');
  },
  assertOwnedFlatJournalCatalogueAccount(catalogue, account) {
    const original = syntheticCatalogues.get(catalogue);
    assert.ok(original && original.account === account, 'SYNTHETIC_ORIGINAL_CATALOGUE_ACCOUNT_REQUIRED');
    return { runtime: original.runtime, portfolio: original.portfolio, generationId: original.generationId };
  },
} });
const { createFlatManualGraphAccountSession, createFlatManualGraphCatalogueSession, flatManualGraphReviews, flatManualGraphActionTarget } =
  await import('../../../../../packages/backend/src/api/accounts/flat-manual-graph-session.mjs');
const { startWalletApplication } = await import('../../../src/server/server.mjs');
const h = n => n.repeat(64), a = n => n.repeat(40), id = 'manual_vault_graph_01';
const body = { requestId: id, kind: 'GRAPH', ownerOperationRef: h('1'), assetId: h('2') };
function review() {
  return { version: 1, profile: 'ORIGINAL_MANUAL_EVM_GRAPH_REVIEW_V1', ...body,
    asset: { assetId: h('2'), symbol: 'PALT', decimals: 6 },
    routeProfile: 'REGISTERED_LOCAL_EVM_VAULT_V1', family: '3', chainId: '31337', genesis: h('3'),
    router: a('1'), vault: a('2'), solver: a('3'), sourcePool: a('4'), targetPool: a('5'),
    sourceAssetIdentity: h('4'), targetAssetIdentity: h('5'), targetCommitment: h('6'), descriptorCommitment: h('7'),
    solverUnderlyingAmount: '100', deliveredShares: '100', executionFrom: '1000', executionUntil: '2000', settleBefore: '2100',
    payoutCommitment: h('8'), deliveryLossClause: 'SYNTHETIC_EXPLICIT_LOSS_CLAUSE', envelope: h('9'),
    fundingNotBefore: '1000', fundingValidUntil: '1800', identitySHA256: h('a'), sourceAmount: '500', reservedAmount: '120',
    changeAmount: '380', changeRecipient: a('6'), recoveryRecipient: a('7'), originalAccountLifetime: h('b'),
    observation: 'ORIGINAL_AUTHORIZED_TERMS_ONLY', solverOwnLiquidity: true, settlementEstablished: false,
    recovery: 'PRIVATE_ORIGINAL_CUTOFF_ONLY' };
}
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
async function fixture(t, { exact = false, initial = null, catalogueMode = false, bindApproval = true } = {}) {
  const runtime = {}, account = {}, authority = {}, config = {}, c = { creations: 0, authority, calls: [], rows: [], afterExecute: null, snapshotGate: null };
  accounts.set(account, { live: true });
  if (initial) c.rows.push({ ...body, state: initial, errorCode: null });
  const keeper = { snapshot: async () => {
    if (c.snapshotGate) { const gate = c.snapshotGate; c.snapshotGate = null; gate.entered.resolve(); await gate.release.promise; }
    return { version: 1, revision: c.calls.length, storageAvailable: true, requests: c.rows };
  }, close: async () => {}, restartCoordinator: async () => {} };
  for (const action of ['prepare', 'execute', 'reconcile', 'recover']) keeper[action] = async input => {
    c.calls.push({ action, input: structuredClone(input) });
    let row = c.rows.find(row => row.requestId === (action === 'prepare' ? input.requestId : input));
    if (action === 'prepare') {
      if (row) assert.deepEqual(Object.fromEntries(Object.keys(body).map(key => [key, row[key]])), input);
      else { row = { ...input, state: 'PREPARED', errorCode: null }; c.rows.push(row); }
    } else if (action === 'recover') { row.state = 'CONFIRMED'; }
    else if (action === 'execute') { row.state = 'CONFIRMED'; if (c.afterExecute) await c.afterExecute(); }
  };
  c.keeper = keeper; controls.set(config, c);
  const portfolio = { config, authority, async ownerView() {
    if (c.ownerOffline) fail('FLAT_ACCOUNT_OWNER_UNAVAILABLE');
    return { version: 1, status: 'LIVE', asset: review().asset, observed: { blockHash: h('d') },
      balances: { available: '500', reserved: '0', recovery: '0', locked: '0' },
      requests: c.rows.map(row => ({ requestId: row.requestId, kind: row.kind, state: row.state === 'CONFIRMED' ? 'CONFIRMED' : 'UNRESOLVED', disposition: row.state === 'CONFIRMED' ? 'FULFILLED' : null })) };
  } };
  portfolios.set(portfolio, { runtime, account });
  let catalogue;
  if (catalogueMode) {
    c.catalogueBinds = 0; c.durableBindings = new Map();
    catalogue = Object.freeze({ keeper, ownerView: () => portfolio.ownerView(), async bindManualGraphApproval(approval) {
      c.catalogueBinds++; const original = approvals.get(approval);
      assert.ok(original && original.account === account, 'SYNTHETIC_ORIGINAL_CATALOGUE_APPROVAL_REQUIRED');
      if (c.bindingGate) { const gate = c.bindingGate; c.bindingGate = null; gate.entered.resolve(); await gate.release.promise; }
      if (c.bindingError) throw c.bindingError;
      const old = c.durableBindings.get(original.body.requestId);
      if (old) assert.deepEqual(old, original.body);
      else c.durableBindings.set(original.body.requestId, structuredClone(original.body));
      return structuredClone(original.body);
    } });
    syntheticCatalogues.set(catalogue, { runtime, portfolio, account, generationId: h('c') });
  }
  const bootstrap = catalogueMode ? await createFlatManualGraphCatalogueSession({ runtime, catalogue })
    : await createFlatManualGraphAccountSession({ runtime, portfolio, journal: { path: '/synthetic/never-written', password: 'synthetic' } });
  const approval = Object.freeze(Object.create(null)); approvals.set(approval, frozen({ account, body: { ...body }, review: review() }));
  if (bindApproval) await bootstrap.bindManualGraph(approval);
  const app = await startWalletApplication({ accountSession: bootstrap.session, actionAccessMode: exact ? 'exact-only' : 'manual' });
  t.after(async () => { await app.close(); await bootstrap.session.idle(); await bootstrap.session.close(); });
  return { ...bootstrap, runtime, account, portfolio, catalogue, approval, c, app };
}
async function post(app, input, action = 'prepare', token = app.actionAccess?.token) {
  const response = await fetch(app.origin + '/api/wallet/account/' + action, { method: 'POST',
    headers: { Origin: app.origin, 'Content-Type': 'application/json', 'x-wallet-action-token': token }, body: JSON.stringify(input) });
  return { status: response.status, body: await response.json() };
}
function sdk(app, token = app.actionAccess?.token) {
  return createWalletApplicationClient({ origin: app.origin, ownerToken: app.ownerAccess.token, actionToken: token });
}

test('real provenance APIs reject copied/fake approvals, providers, executors and portfolios', () => {
  for (const bad of [{}, Object.freeze({}), Object.create(null), new Proxy({}, {})]) {
    assert.throws(() => actualDetails(bad), /ORIGINAL_REQUIRED/);
    assert.throws(() => actualPortfolioAccount(bad, {}), /OWNED_CAPABILITY/);
    assert.throws(() => actualExecutorReview(bad, h('1'), {}), /OWNED_CAPABILITY/);
    assert.throws(() => actualProviderReview(bad, {}), /OWNED_CAPABILITY/);
  }
});
test('one genuine portfolio composition and fixed opaque approval; copies, native route and other lifetime are refused', async t => {
  const f = await fixture(t);
  assert.equal(f.c.creations, 1); assert.deepEqual(f.bindManualGraph(f.approval), body);
  assert.throws(() => f.bindManualGraph({ ...f.approval }), /ORIGINAL_REQUIRED/);
  await assert.rejects(createFlatManualGraphAccountSession({ runtime: f.runtime, portfolio: { ...f.portfolio }, journal: { path: '/synthetic', password: 'synthetic' } }), /OWNED_CAPABILITY/);
  await assert.rejects(createFlatManualGraphAccountSession({ runtime: f.runtime, portfolio: f.portfolio, journal: { path: '/synthetic', password: 'synthetic' } }), /ALREADY_CREATED/);
  const native = {}; approvals.set(native, { account: f.account, body, review: { ...review(), family: '1' } });
  assert.throws(() => f.bindManualGraph(native), /ROUTE_UNSUPPORTED/);
  const wrongAccount = {}; accounts.set(wrongAccount, { live: true }); const wrong = {};
  approvals.set(wrong, { account: wrongAccount, body, review: review() });
  assert.throws(() => f.bindManualGraph(wrong), /ORIGINAL_ACCOUNT_REQUIRED/);
  accounts.get(f.account).live = false;
  assert.throws(() => flatManualGraphReviews(f.session), /ORIGINAL_REQUIRED/);
  assert.equal((await post(f.app, body)).status, 403); assert.equal(f.c.calls.length, 0);
});
test('SDK uses same manual immutable review and confirm with separate exact grants for original actions', async t => {
  const f = await fixture(t, { exact: true });
  let client = sdk(f.app, f.app.issueActionCapability({ action: 'accountPrepare', body }).token); await client.refresh();
  const state = client.getState(); assert.equal(state.data.capabilities.graphExecution, false);
  assert.equal(state.data.capabilities.manualEvmVaultGraph, true);
  assert.equal(client.review('accountPrepare', body).accountContext.graph.reservedAmount, '120');
  assert.equal(f.c.calls.length, 0);
  const copied = client.getState(); copied.review.body.ownerOperationRef = h('f'); copied.review.accountContext.graph.deliveredShares = '999';
  assert.equal(await client.confirm(), true); await f.session.idle();
  assert.deepEqual(f.c.calls[0], { action: 'prepare', input: body });
  client = sdk(f.app, f.app.issueActionCapability({ action: 'accountExecute', body: { requestId: id } }).token);
  await client.refresh(); const view = client.review('accountExecute', { requestId: id });
  assert.ok(accountReviewDetails(view.accountContext).some(([key, value]) => key.includes('solver') && value.includes('100')));
  assert.equal(await client.confirm(), true); await f.session.idle();
  const duplicate = f.app.issueActionCapability({ action: 'accountExecute', body: { requestId: id } });
  assert.equal((await post(f.app, { requestId: id }, 'execute', duplicate.token)).status, 409);
  client = sdk(f.app, f.app.issueActionCapability({ action: 'accountReconcile', body: { requestId: id } }).token);
  await client.refresh(); client.review('accountReconcile', { requestId: id }); assert.equal(await client.confirm(), true);
  await f.session.idle(); assert.deepEqual(f.c.calls.map(row => row.action), ['prepare', 'execute', 'reconcile']);
});
test('old manual broad bearer stays graph-read-only; it cannot mint graph exact grants or widen itself', async t => {
  const f = await fixture(t), client = sdk(f.app); await client.refresh();
  assert.equal(client.getState().data.account.manualGraphs.length, 1);
  assert.equal(client.getState().data.capabilities.manualEvmVaultGraph, false);
  assert.throws(() => client.review('accountPrepare', body));
  assert.equal((await post(f.app, body)).status, 403);
  assert.throws(() => f.app.issueActionCapability({ action: 'accountPrepare', body }), /EXACT_ACCESS_REQUIRED/);
  assert.equal(f.c.calls.length, 0);
});
test('HTTP and SDK reject changed IDs, amount, recipient, cutoff, proof or arbitrary route before admission', async t => {
  const f = await fixture(t, { exact: true });
  const token = f.app.issueActionCapability({ action: 'accountPrepare', body }).token;
  const client = sdk(f.app, token); await client.refresh();
  for (const changed of [{ ...body, ownerOperationRef: h('f') }, { ...body, assetId: h('f') }, { ...body, requestId: id + '_new' },
    { ...body, amount: '999' }, { ...body, recipient: a('9') }, { ...body, settleBefore: '99999' },
    { ...body, providers: [] }, { ...body, prepared: {} }, { ...body, family: '1' }]) {
    assert.throws(() => client.review('accountPrepare', changed));
    assert.notEqual((await post(f.app, changed, 'prepare', token)).status, 200);
  }
  assert.equal(f.c.calls.length, 0);
  assert.equal((await fetch(f.app.origin + '/api/wallet/graph/execute', { method: 'POST' })).status, 404);
});
test('exact-only binds GRAPH body and original capability target, TTL, replay and separate reconciliation', async t => {
  const f = await fixture(t, { exact: true }); assert.equal(f.app.actionAccess, undefined);
  const cap = f.app.issueActionCapability({ action: 'accountPrepare', body });
  for (const changed of [{ ...body, recipient: a('9') }, { ...body, amount: '121' }, { ...body, cutoff: '2200' }, { ...body, assetId: h('e') }])
    assert.notEqual((await post(f.app, changed, 'prepare', cap.token)).status, 200);
  assert.equal((await post(f.app, body, 'execute', cap.token)).status, 403);
  assert.equal((await post(f.app, body, 'prepare', cap.token)).status, 200); await f.session.idle();
  assert.equal((await post(f.app, body, 'prepare', cap.token)).status, 403);
  const expired = f.app.issueActionCapability({ action: 'accountExecute', body: { requestId: id }, ttlMs: 1 }); await delay(10);
  assert.equal((await post(f.app, { requestId: id }, 'execute', expired.token)).status, 403);
  const exec = f.app.issueActionCapability({ action: 'accountExecute', body: { requestId: id } });
  assert.equal((await post(f.app, { requestId: id }, 'execute', exec.token)).status, 200); await f.session.idle();
  assert.equal((await post(f.app, { requestId: id }, 'execute', exec.token)).status, 403);
  const rec = f.app.issueActionCapability({ action: 'accountReconcile', body: { requestId: id } });
  assert.equal((await post(f.app, { requestId: id }, 'reconcile', rec.token)).status, 200);
});
test('token is consumed before original journal await; concurrent duplicate cannot admit twice', async t => {
  const f = await fixture(t, { exact: true }), entered = deferred(), release = deferred();
  f.c.snapshotGate = { entered, release };
  const cap = f.app.issueActionCapability({ action: 'accountPrepare', body });
  const first = post(f.app, body, 'prepare', cap.token); await entered.promise;
  const second = await post(f.app, body, 'prepare', cap.token); assert.ok([403, 409].includes(second.status));
  release.resolve(); assert.equal((await first).status, 200); await f.session.idle(); assert.equal(f.c.calls.length, 1);
});
test('lost exact-action reply and new listener retain original graph; no automatic repeat or old-token authority', async t => {
  const f = await fixture(t, { exact: true }), entered = deferred(), release = deferred();
  f.c.snapshotGate = { entered, release };
  const cap = f.app.issueActionCapability({ action: 'accountPrepare', body });
  const request = httpRequest(f.app.origin + '/api/wallet/account/prepare', { method: 'POST', headers: {
    Origin: f.app.origin, 'Content-Type': 'application/json', 'x-wallet-action-token': cap.token,
  } }); request.on('error', () => {}); request.end(JSON.stringify(body));
  await entered.promise; request.destroy(); release.resolve();
  // Drain server admission without any replacement mutating request.
  while (!f.c.calls.length) await delay(1); await f.session.idle();
  assert.equal((await post(f.app, body, 'prepare', cap.token)).status, 403);
  await f.app.close();
  const reopened = await startWalletApplication({ accountSession: f.session, actionAccessMode: 'exact-only' }); t.after(() => reopened.close());
  assert.equal((await post(reopened, body, 'prepare', cap.token)).status, 403);
  assert.equal(flatManualGraphReviews(f.session)[0].requestId, id); assert.equal(f.c.calls.length, 1);
});

test('explicit exact recover uses the original cutoff and identity after owner offline; no new graph approval', async t => {
  const f = await fixture(t, { exact: true, initial: 'UNKNOWN' }); f.c.ownerOffline = true;
  accounts.get(f.account).routeUnavailable = true; // original delivery provider may be uncertain/closed
  assert.throws(() => f.app.issueActionCapability({ action: 'accountExecute', body: { requestId: id } }), /CAPABILITY_INVALID/);
  // Caller time is deliberately beyond execution/funding windows. Fresh grants
  // permit only the retained original command; authority decides F validity.
  const grant = f.app.issueActionCapability({ action: 'accountRecover', body: { requestId: id } });
  const client = sdk(f.app, grant.token); assert.equal(await client.refresh(), true);
  assert.equal(client.getState().portfolioStale, true); assert.equal(client.can('accountRecover'), true);
  const reviewed = client.review('accountRecover', { requestId: id });
  assert.equal(reviewed.accountContext.graph.settleBefore, '2100');
  assert.equal(await client.confirm(), true); await f.session.idle();
  assert.deepEqual(f.c.calls, [{ action: 'recover', input: id }]);
  assert.equal((await post(f.app, { requestId: id }, 'recover', grant.token)).status, 403);
  assert.throws(() => f.app.issueActionCapability({ action: 'accountRecover', body: { requestId: id, cutoff: '99999' } }));
  assert.throws(() => f.app.issueActionCapability({ action: 'accountRecover', body: { requestId: id + '_replacement' } }));
  const reconcile = f.app.issueActionCapability({ action: 'accountReconcile', body: { requestId: id } });
  assert.equal((await post(f.app, { requestId: id }, 'reconcile', reconcile.token)).status, 200);
});
test('recover never widens broad tokens and never acts on TOP_UP, EXIT, unknown or merely prepared graph', async t => {
  const broad = await fixture(t, { initial: 'UNKNOWN' });
  assert.equal((await post(broad.app, { requestId: id }, 'recover')).status, 403);
  assert.throws(() => broad.app.issueActionCapability({ action: 'accountRecover', body: { requestId: id } }), /EXACT_ACCESS_REQUIRED/);
  const f = await fixture(t, { exact: true, initial: 'PREPARED' });
  const cap = f.app.issueActionCapability({ action: 'accountRecover', body: { requestId: id } });
  assert.equal((await post(f.app, { requestId: id }, 'recover', cap.token)).status, 409);
  for (const kind of ['TOP_UP', 'EXIT']) {
    f.c.rows[0].kind = kind;
    const cap = f.app.issueActionCapability({ action: 'accountRecover', body: { requestId: id } });
    assert.equal((await post(f.app, { requestId: id }, 'recover', cap.token)).status, 409);
  }
  assert.equal(f.c.calls.length, 0);
});


test('catalogue session uses its original keeper facade with no generation construction and rejects copies', async t => {
  const f = await fixture(t, { exact: true, catalogueMode: true });
  assert.equal(f.c.creations, 0); assert.equal(f.c.catalogueBinds, 1); assert.equal(f.c.calls.length, 0);
  assert.deepEqual(await f.bindManualGraph(f.approval), body); assert.equal(f.c.catalogueBinds, 2);
  await assert.rejects(createFlatManualGraphCatalogueSession({ runtime: f.runtime, catalogue: { ...f.catalogue } }), /ORIGINAL_CATALOGUE/);
  await assert.rejects(createFlatManualGraphCatalogueSession({ runtime: {}, catalogue: f.catalogue }), /ORIGINAL_CATALOGUE/);
  await assert.rejects(createFlatManualGraphCatalogueSession({ runtime: f.runtime, catalogue: f.catalogue }), /ALREADY_CREATED/);
  await assert.rejects(createFlatManualGraphCatalogueSession({ runtime: f.runtime, catalogue: f.catalogue, keeper: f.c.keeper }), /EXACT_FIELDS/);
  await assert.rejects(f.bindManualGraph({ ...f.approval }), /ORIGINAL_REQUIRED/);
});
test('catalogue durable exact membership must finish before graph visibility, HTTP admission or exact grant', async t => {
  const f = await fixture(t, { exact: true, catalogueMode: true, bindApproval: false }), entered = deferred(), release = deferred();
  f.c.bindingGate = { entered, release };
  const pending = f.bindManualGraph(f.approval); await entered.promise;
  assert.deepEqual(flatManualGraphReviews(f.session), []);
  assert.throws(() => f.app.issueActionCapability({ action: 'accountPrepare', body }), /CAPABILITY_INVALID/);
  await assert.rejects(f.bindManualGraph(f.approval), /BINDING_BUSY/);
  release.resolve(); assert.deepEqual(await pending, body); assert.deepEqual(f.c.durableBindings.get(id), body);
  assert.equal(f.c.calls.length, 0);
  const grant = f.app.issueActionCapability({ action: 'accountPrepare', body });
  assert.equal((await post(f.app, body, 'prepare', grant.token)).status, 200); await f.session.idle();
  assert.deepEqual(f.c.calls, [{ action: 'prepare', input: body }]); assert.equal(f.c.creations, 0);
});
test('uncertain catalogue persistence never installs an HTTP approval or manufactures a replacement', async t => {
  const f = await fixture(t, { exact: true, catalogueMode: true, bindApproval: false });
  f.c.bindingError = Object.assign(new Error('SYNTHETIC_READBACK_UNCERTAIN'), { code: 'FLAT_CATALOGUE_STORAGE_FENCED' });
  await assert.rejects(f.bindManualGraph(f.approval), /READBACK_UNCERTAIN/);
  assert.equal(f.c.catalogueBinds, 1); assert.equal(f.c.calls.length, 0); assert.equal(f.c.creations, 0);
  assert.deepEqual(flatManualGraphReviews(f.session), []);
  assert.throws(() => f.app.issueActionCapability({ action: 'accountPrepare', body }), /CAPABILITY_INVALID/);
});
test('catalogue approval never migrates to a successor generation even with the same original account', async t => {
  const f = await fixture(t, { exact: true, catalogueMode: true });
  const old = syntheticCatalogues.get(f.catalogue); old.generationId = h('e');
  assert.throws(() => flatManualGraphReviews(f.session), /GENERATION_CHANGED/);
  assert.throws(() => f.app.issueActionCapability({ action: 'accountRecover', body: { requestId: id } }), /CAPABILITY_INVALID/);
  assert.equal(f.c.calls.length, 0); assert.equal(f.c.creations, 0);
});
test('catalogue original GRAPH recovery uses the retained generation with owner/provider unavailable', async t => {
  const f = await fixture(t, { exact: true, catalogueMode: true, initial: 'UNKNOWN' });
  f.c.ownerOffline = true; accounts.get(f.account).routeUnavailable = true;
  const grant = f.app.issueActionCapability({ action: 'accountRecover', body: { requestId: id } });
  assert.equal((await post(f.app, { requestId: id }, 'recover', grant.token)).status, 200); await f.session.idle();
  assert.deepEqual(f.c.calls, [{ action: 'recover', input: id }]);
  assert.equal(f.c.catalogueBinds, 1); assert.equal(f.c.creations, 0);
});
