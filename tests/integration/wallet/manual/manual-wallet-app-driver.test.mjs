/** HOST-ONLY: lower custody/provenance and keeper construction are explicit
 * synthetic mocks. The real private graph join, existing session, HTTP server,
 * exact tokens and SDK run. No native/proof acceptance or activation claim. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { flatAccountManualGraphDetails as actualDetails, assertOwnedFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { assertOwnedFlatPortfolioAccount as actualPortfolioAccount, bindFlatPortfolioChildRequest } from '../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { ownedFlatManualEvmGraphReview as actualExecutorReview } from '../../../../packages/backend/src/execution/account/execution/flat-native-execution.mjs';
import { ownedFlatEvmVaultProviderReview as actualProviderReview } from '../../../../packages/backend/src/providers/evm-vault-provider.mjs';
import { createWalletApplicationClient } from '../../../../packages/backend/src/api/wallet/wallet-application-client.mjs';
import { buildActionBody, accountReviewDetails } from '../../../../apps/wallet/src/client/state/view-model.mjs';

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
  bindFlatPortfolioChildRequest, // Preserve the actual shared export needed by the wrapped portfolio import.
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
  await import('@lianum/backend/accounts/manual-graph');
const { startWalletApplication } = await import('../../../../apps/wallet/src/server/server.mjs');
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
async function fixture(t, { exact = true, initial = null, catalogueMode = true, bindApproval = true } = {}) {
  const runtime = {}, account = { config: { accountId: 'synthetic_original_account', journalId: 'synthetic_original_journal',
    lifetime: h('b'), registry: [] } }, authority = {}, config = {}, c = { creations: 0, authority, calls: [], rows: [], afterExecute: null, snapshotGate: null };
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
    return { version: 1, status: 'LIVE', asset: review().asset, observed: { blockHash: h('d'), blockNumber: '42', timestamp: '1000' },
      balances: { available: '500', reserved: '0', recovery: '0', locked: '0' },
      requests: c.rows.map(row => ({ requestId: row.requestId, kind: row.kind, state: row.state === 'CONFIRMED' ? 'CONFIRMED' : 'UNRESOLVED', disposition: row.state === 'CONFIRMED' ? row.kind === 'GRAPH' ? 'FULFILLED' : 'APPLIED' : null })) };
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


const { createManualWalletAppDriver } = await import('./manual-wallet-app-driver.mjs');
const driverFor = app => createManualWalletAppDriver(app, { deadlineMs: Date.now() + 20_000 });

test('new driver sends GRAPH through real SDK review/confirm and exact-only HTTP, rejecting every consumed token', async t => {
  const f = await fixture(t), driver = driverFor(f.app);
  assert.equal(f.c.creations, 0);
  assert.equal((await driver.account('prepare', body)).originalJournalState, 'PREPARED');
  const reviewed = await driver.reviewAccount('execute', { requestId: id });
  assert.equal(reviewed.review.accountContext.graph.reservedAmount, '120');
  // This fixture has only a synthetic source view; it must remain available
  // through admission. The fixed actual route suspends only the target then.
  const settled = await reviewed.confirm(); assert.equal(settled.originalJournalState, 'CONFIRMED');
  await assert.rejects(reviewed.confirm(), /REVIEW_ALREADY_USED/);
  f.c.ownerOffline = true;
  await driver.account('reconcile', { requestId: id });
  await driver.account('recover', { requestId: id });
  await driver.duplicateAccountExecute(id);
  assert.deepEqual(f.c.calls.map(row => row.action), ['prepare','execute','reconcile','recover']);
  for (const action of ['accountPrepare','accountExecute','accountReconcile','accountRecover'])
    assert.ok(driver.evidence().some(item => item.action === action && item.check === 'USED_EXACT_GRANT_REJECTED'));
});
test('listener restart retains exact original session/approval and invalidates even unspent old grant', async t => {
  const f = await fixture(t), first = driverFor(f.app);
  await first.account('prepare', body); await first.account('execute', { requestId: id });
  const old = f.app.issueActionCapability({ action: 'accountReconcile', body: { requestId: id } });
  await f.app.close(); const admission = f.session.restartCoordinator(); await f.session.idle();
  assert.equal((await f.session.snapshot()).admissions.find(row => row.sequence === admission.sequence).state, 'SUCCEEDED');
  const next = await startWalletApplication({ accountSession: f.session, actionAccessMode: 'exact-only' });
  t.after(() => next.close()); const second = driverFor(next);
  await second.rejectForeignListenerGrant('accountReconcile', { requestId: id }, old);
  await second.account('reconcile', { requestId: id });
  assert.equal(f.c.creations, 0); assert.equal(f.c.catalogueBinds, 1);
  assert.deepEqual(f.c.durableBindings.get(id), body);
});
test('SUCCEEDED before final observation is pending until exact idle CURRENT journal', async t => {
  const f = await fixture(t), driver = driverFor(f.app); await driver.account('prepare', body);
  const gate = { entered: deferred(), release: deferred() };
  f.c.afterExecute = async () => { f.c.snapshotGate = gate; };
  let done = false; const pending = driver.account('execute', { requestId: id }).then(value => { done = true; return value; });
  await gate.entered.promise; await delay(30); assert.equal(done, false);
  const mid = await f.session.snapshot(); assert.equal(mid.admissions.at(-1).state, 'SUCCEEDED'); assert.equal(mid.busy, true);
  gate.release.resolve(); assert.equal((await pending).originalJournalState, 'CONFIRMED');
});
test('failed execute preserves original UNKNOWN and never retries the action', async t => {
  const f = await fixture(t), driver = driverFor(f.app); await driver.account('prepare', body);
  f.c.afterExecute = async () => { f.c.rows[0].state = 'UNKNOWN'; throw Object.assign(Error('fixture'), { code: 'FLAT_ACCOUNT_SYNTHETIC_UNKNOWN' }); };
  await assert.rejects(driver.account('execute', { requestId: id }), /FLAT_ACCOUNT_SYNTHETIC_UNKNOWN|ORIGINAL_RECONCILIATION/);
  assert.deepEqual(f.c.calls.map(row => row.action), ['prepare','execute']);
  assert.equal(f.c.rows[0].requestId, id); assert.equal(f.c.rows[0].state, 'UNKNOWN');
});
test('expired harness deadline stops before any grant/action; broad app cannot create driver', async t => {
  const f = await fixture(t), expired = createManualWalletAppDriver(f.app, { deadlineMs: Date.now() - 1 });
  await assert.rejects(expired.account('prepare', body), /ORIGINAL_DEADLINE_EXHAUSTED/); assert.equal(f.c.calls.length, 0);
  const broad = await startWalletApplication({ accountSession: f.session }); t.after(() => broad.close());
  assert.throws(() => driverFor(broad), /BROAD_ACCESS_FORBIDDEN/);
});
test('lost original listener never invokes an alternate private GRAPH route or a new execution', async t => {
  const f = await fixture(t), driver = driverFor(f.app); await driver.account('prepare', body);
  const pending = await driver.reviewAccount('execute', { requestId: id }); await f.app.close();
  await assert.rejects(pending.confirm(), /ORIGINAL_OUTCOME_UNKNOWN/);
  assert.deepEqual(f.c.calls.map(row => row.action), ['prepare']);
  assert.equal(f.c.rows[0].requestId, id);
});
test('discarding the actual TOP_UP admission reply reads the original journal without resubmitting', async t => {
  const f = await fixture(t, { bindApproval: false, initial: 'PREPARED' });
  f.c.rows[0].kind = 'TOP_UP';
  const driver = driverFor(f.app), originalRequest = http.request;
  const completed = await driver.executeAccountWithLostReply({ requestId: id });
  assert.equal(http.request, originalRequest);
  assert.equal(completed.originalJournalState, 'CONFIRMED');
  assert.deepEqual(completed.loss, { requestId: id, discardedActualAdmissionReply: true,
    sdkReportedUnknown: true, executeHttpRequests: 1, originalJournalReconciled: true,
    noAutomaticResubmit: true, actualNetworkOutage: false });
  assert.deepEqual(f.c.calls.map(row => row.action), ['execute']);
});
test('owner can stop after exact GRAPH HTTP admission while the original journal remains observable', async t => {
  const f = await fixture(t), driver = driverFor(f.app);
  await driver.account('prepare', body);
  const original = await driver.reviewAccount('execute', { requestId: id });
  let stopped = false;
  const result = await original.confirmAfterAdmission(async () => {
    assert.ok(driver.evidence().some(row => row.action === 'accountExecute' && row.check === 'EXPLICIT_HANDOFF_CONFIRMATION'));
    assert.ok(driver.evidence().some(row => row.action === 'accountExecute' && row.check === 'USED_EXACT_GRANT_REJECTED'));
    assert.deepEqual(f.c.calls.map(row => row.action), ['prepare', 'execute']);
    f.c.ownerOffline = true; stopped = true;
  });
  assert.equal(stopped, true); assert.equal(result.originalJournalState, 'CONFIRMED');
  await assert.rejects(original.confirmAfterAdmission(async () => {}), /REVIEW_ALREADY_USED/);
});
