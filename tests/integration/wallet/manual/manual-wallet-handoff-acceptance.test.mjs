/** Real account authority, encrypted account/portfolio/catalogue journals,
 * genuine manual approvals/session, loopback server and one-use capability.
 * Explicit synthetic lower owner/chain/pool admission/proof ports only.
 * No real native runtime, key generation, signing, funding or proof work. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { derivePrivateAssetIdentity } from '@lianum/engine/notes/private-asset-runtime';
import { sha, genericAccountIdentity } from '@lianum/engine/accounts/journal';
import * as actualSystemState from '../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { encodeStatement } from '@lianum/components/encoding/statements';
import { flatAccountGraphBinding } from '../../../../packages/backend/src/accounts/authority/flat-account-validation.mjs';
import { createWalletClient, accountReviewDetails } from '../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs';
import { createWalletApplicationClient } from '../../../../packages/backend/src/api/wallet/wallet-application-client.mjs';
const h = text => createHash('sha256').update(text).digest('hex'), a = n => String(n).repeat(40);
const worlds = new WeakMap(), owners = new WeakMap(), executors = new WeakMap(), policies = new WeakMap();
const forbidden = () => { throw Error('SYNTHETIC_LOWER_FACTORY_FORBIDDEN'); };
const url = p => new URL(p, import.meta.url).href;
mock.module(url('../wallet-platform/modules/ops/deploy-system.mjs'), { exports: {
  deployFlatSystem: forbidden, assertOwnedFlatSystem(runtime, system) { assert.equal(worlds.get(runtime)?.system, system); }
} });
mock.module(url('../wallet-platform/modules/chain-adapters/local-evm-ownership.mjs'), { exports: {
  async assertLocalEvm(runtime) { assert.ok(worlds.has(runtime)); }
} });
mock.module(url('../wallet-platform/modules/chain-adapters/owned-pool-asset.mjs'), { exports: {
  createOwnedPoolAsset: forbidden, createNativePoolAsset: forbidden, assertOwnedPoolAsset(runtime, value) { assert.equal(worlds.get(runtime)?.poolCapability, value); }
} });
mock.module(url('../mobile-core/flat-owner-process.mjs'), { exports: {
  createFlatOwnerProcess: forbidden, assertOwnedNativeClaimIngressHandoff: forbidden, assertOwnedFlatOwnerProcess(owner, expected) { assert.equal(owners.get(owner)?.runtime, expected.runtime); }
} });
mock.module(url('../mobile-core/flat-owner-observer.mjs'), { exports: {
  async createFlatOwnerObserver({ runtime }) { return worlds.get(runtime).observer; },
  assertOwnedFlatOwnerObserver(observer, { runtime }) { assert.equal(observer, worlds.get(runtime).observer); }
} });
mock.module(url('../wallet-platform/modules/paeg/flat-system-state.mjs'), { exports: {
  ...actualSystemState, async createFlatSystemStateReader({ runtime }) { return worlds.get(runtime).reader; }
} });
mock.module(url('../wallet-platform/modules/paeg/flat-native-execution.mjs'), { exports: {
  FLAT_EXECUTION_PROFILE: 'OWNED_FLAT_EXECUTION_KEEPER_V1', createFlatNativeExecution: forbidden, validateFlatExecutionPreparation: forbidden, assertOwnedFlatNativeExecution(executor, expected) { assert.equal(executors.get(executor)?.runtime, expected.runtime); },
  ownedFlatManualEvmGraphReview(executor, ref, expected) {
    const w = executors.get(executor); assert.equal(w?.runtime, expected.runtime); assert.equal(ref, w.ref);
    assert.ok(!w.routeChanged, 'SYNTHETIC_ORIGINAL_ROUTE_CHANGED'); return structuredClone(w.route);
  }
} });
mock.module(url('../wallet-platform/modules/global-state/flat-pool-admission-policy.mjs'), { exports: {
  createFlatPoolAdmissionPolicy: forbidden, assertOwnedFlatPoolAdmissionPolicy(policy, expected) {
    const w = policies.get(policy); assert.equal(w?.runtime, expected.runtime); assert.equal(w.system, expected.system);
    assert.equal(expected.accounts[0].account, w.account);
  }
} });
const hostScopedProofTools = {
  loadFlatABI: forbidden, createFlatProofRunner() { return { async close() {}, async abort() {}, async prove() { throw Error('PROOF_WORK_FORBIDDEN'); } }; },
  withFlatHash() { throw Error('HASH_BACKEND_FORBIDDEN'); }
};
mock.module(url('../proof-workers/scoped-proof-tools.mjs'), { exports: hostScopedProofTools });
mock.module(import.meta.resolve('@lianum/backend/proving/roles/scoped-proof-runner'), {exports: {
  createFlatProofRunner: hostScopedProofTools.createFlatProofRunner,
}});
const { createFlatAccountAuthority, flatAccountManualGraphDetails } = await import('../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs');
const { createFlatPortfolioAuthority } = await import('../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs');
const { createFlatJournalGeneration, createFlatJournalCatalogue } = await import('../../../../packages/backend/src/accounts/storage/flat-journal-catalogue.mjs');
const { createFlatManualGraphCatalogueSession } = await import('@lianum/backend/accounts/manual-graph');
const { startWalletApplication } = await import('../../../../apps/wallet/src/server/server.mjs');
const { createManualWalletAppDriver } = await import('./manual-wallet-app-driver.mjs');
async function fixture(t, { manual = false, driver = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'genuine-manual-handoff-'));
  const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(k => [k, h(k)]));
  domain.ledgerNamespace = domain.hubDomain; domain.asset = derivePrivateAssetIdentity(31337, '0x' + '0'.repeat(40), '0x' + '0'.repeat(64)).slice(2);
  const identity = { pool: a(1), domain, domainCommitment: '01'.repeat(32) };
  const runtime = { metadata: { chainId: '31337', evmGenesis: '0x' + h('genesis'), scratchDirectory: directory }, time: async () => 6000n };
  const poolCapability = {}, system = { bootstrap: 'synthetic-lower-host', pools: [{ address: '0x' + identity.pool,
    asset: '0x' + '0'.repeat(40), codeHash: '0x' + h('pool-code'), assetCapability: poolCapability, assetMetadata: null, artifact: {} }] };
  const authorization = { domainCommitment: identity.domainCommitment, envelope: '02'.repeat(32) };
  const core = { value: { context: h('context'), reserveCommitment: h('reserve'), reserveNullifier: h('reserve-nf'), settleBefore: '7000' } };
  const common = { ...authorization, domain, core };
  const prepared = { authorization: { proof: 'c0ffee'.padEnd(64, '0'), publicInputs: encodeStatement('authorization', authorization) }, rolePackets: {
    reservation: { ...common, funding: { value: { inputCommitment: h('input'), inputNullifier: h('input-nf'), reserveCommitment: core.value.reserveCommitment,
      changeCommitment: h('change'), operationId: h('operation'), fundingNotBefore: '5900', fundingValidUntil: '6200' } } },
    recovery: { ...common, recovery: { value: { ...core.value, recoveryCommitment: h('recovery') } } },
    assembler: common, local: Array.from({ length: 4 }, () => common), dependency: Array.from({ length: 4 }, () => common),
  } };
  const route = { routeProfile: 'REGISTERED_LOCAL_EVM_VAULT_V1', family: '3', chainId: '31337', genesis: h('genesis'),
    router: a(2), vault: a(3), solver: a(4), sourcePool: identity.pool, targetPool: a(5), sourceAssetIdentity: domain.asset,
    targetAssetIdentity: h('target-asset'), targetCommitment: h('target-note'), descriptorCommitment: h('descriptor'),
    solverUnderlyingAmount: '100', deliveredShares: '90', executionFrom: '5900', executionUntil: '6500', settleBefore: '7000',
    payoutCommitment: h('payout'), deliveryLossClause: 'SYNTHETIC_SOLVER_ACCEPTS_DELIVERY_LOSS', envelope: authorization.envelope,
    fundingNotBefore: '5900', fundingValidUntil: '6200' };
  const terms = { identitySHA256: sha(identity), envelope: authorization.envelope, fundingNotBefore: '5900', fundingValidUntil: '6200',
    settleBefore: '7000', sourceAmount: '500', reservedAmount: '120', changeAmount: '380', changeRecipient: a(6), recoveryRecipient: a(7) };
  const w = { runtime, system, poolCapability, ref: h('owner-ref'), route, head: { number: '42', hash: h('head-42'), timestamp: '6000' }, ownerOffline: false,
    observer: { identity, async readTransaction() { return null; } } };
  w.reader = { async read() { return { head: { ...w.head }, ledger: { commitments: [], nullifiers: [],
    publicState: { actualAssetBalance: '500', backedAmount: '500', surplus: '0' } } }; }, async assertCurrent() {} };
  const owner = { publicView: { async summary() { return { identitySHA256: sha(identity), operations: {} }; } },
    ownerView: { async graphPreparationTerms() { return terms; }, async summary() {
      if (w.ownerGate) { const gate = w.ownerGate; w.ownerGate = null; gate.entered.resolve(); await gate.release.promise; }
      if (w.ownerOffline) throw Error('SYNTHETIC_OWNER_OFFLINE');
      return { identitySHA256: sha(identity), observed: { blockHash: w.head.hash, timestamp: w.head.timestamp },
        balances: { available: '500', reserved: '0', recovery: '0', locked: '0' } };
    } }, roles: {} };
  for (const kind of ['reservation', 'recovery', 'assembler']) owner.roles[kind] = async () => ({ select: () => structuredClone(prepared.rolePackets[kind]) });
  for (const kind of ['local', 'dependency']) owner.roles[kind] = async index => ({ select: () => structuredClone(prepared.rolePackets[kind][index]) });
  const nativeExecution = { async prepare() { return flatAccountGraphBinding(prepared, identity); } };
  worlds.set(runtime, w); owners.set(owner, w); executors.set(nativeExecution, w);
  const account = await createFlatAccountAuthority({ runtime, system, poolIndex: 0, owner, nativeExecution,
    accountId: 'genuine_account_01', journalId: 'genuine_account_journal_01' }); w.account = account;
  await account.ownerActions.registerGraph({ ownerOperationRef: w.ref, prepared, providers: [] });
  const approval = await account.ownerActions.approveManualEvmGraph({ requestId: 'genuine_graph_01', ownerOperationRef: w.ref });
  const portfolio = createFlatPortfolioAuthority({ runtime, system, accounts: [{ poolIndex: 0, account }],
    accountId: 'genuine_portfolio_01', journalId: 'genuine_portfolio_journal_01' });
  const policy = { async verifyFreshGeneration() { return [{ route: { assetId: account.assetId, pool: identity.pool,
    domainCommitment: identity.domainCommitment, economicIdentitySHA256: h('economic') } }]; }, status: () => ({ current: [account.assetId] }) };
  policies.set(policy, w);
  const generation = await createFlatJournalGeneration({ runtime, portfolio, poolAdmissions: policy,
    journal: { path: join(directory, 'generation.vault'), password: 'synthetic-fixture-password' } });
  const catalogue = await createFlatJournalCatalogue({ runtime, initialGeneration: generation,
    journal: { path: join(directory, 'catalogue.vault'), password: 'synthetic-fixture-password' } });
  const graphSession = await createFlatManualGraphCatalogueSession({ runtime, catalogue });
  const body = await graphSession.bindManualGraph(approval);
  const app = await startWalletApplication({ accountSession: graphSession.session, actionAccessMode: manual ? 'manual' : 'exact-only' });
  const host = manual || driver ? null : app.createManualActionHandoff();
  let posts = 0, loseNextReply = false;
  const fetchImpl = async (path, options) => {
    if (options.method === 'POST') posts++;
    const response = await fetch(app.origin + path, { ...options, headers: { ...options.headers, Origin: app.origin } });
    if (options.method === 'POST' && loseNextReply) { loseNextReply = false; await response.arrayBuffer(); throw Error('SYNTHETIC_LOST_REPLY'); }
    return response;
  };
  const client = createWalletClient({ fetchImpl, ownerToken: app.ownerAccess.token, ...(host ? { manualActionHandoff: host.descriptor } : { actionToken: app.actionAccess?.token }) });
  await client.refresh();
  t.after(async () => { await app.close(); await graphSession.session.idle(); await graphSession.session.close(); await account.close(); await rm(directory, { recursive: true, force: true }); });
  return { ...w, account, approval, portfolio, generation, catalogue, session: graphSession.session, app, host, body, client,
    get posts() { return posts; }, loseReply() { loseNextReply = true; }, changeHead() { w.head.hash = h('head-43'); w.head.number = '43'; },
    setOwnerOffline() { w.ownerOffline = true; }, changeTerms() { w.routeChanged = true; } };
}
async function grant(f, action, body = { requestId: f.body.requestId }) {
  f.client.review(action, body); const request = f.client.getManualActionReview();
  const value = await f.host.authorizeReview(request); assert.equal(await f.client.acceptManualActionGrant(value), true); return value;
}
async function prepare(f) { await grant(f, 'accountPrepare', f.body); assert.equal(await f.client.confirm(), true); await f.session.idle(); await f.client.refresh(); }
async function post(f, grant, action = grant.request.action, body = grant.request.body) {
  const routes = { accountPrepare: 'prepare', accountExecute: 'execute', accountRecover: 'recover', accountReconcile: 'reconcile' };
  return fetch(f.app.origin + '/api/wallet/account/' + routes[action], { method: 'POST',
    headers: { Origin: f.app.origin, 'Content-Type': 'application/json', 'x-wallet-action-token': grant.access.token }, body: JSON.stringify(body) });
}


const nodeClient = f => createWalletApplicationClient({ origin: f.app.origin, ownerToken: f.app.ownerAccess.token, manualActionHandoff: f.host.descriptor });
const driverFor = app => createManualWalletAppDriver(app, { deadlineMs: Date.now() + 120_000 });
async function nodeGrant(f, sdk, action, body = { requestId: f.body.requestId }) {
  sdk.review(action, body); assert.equal(sdk.canConfirm(), false);
  const request = sdk.getManualActionReview(), g = await f.host.authorizeReview(request);
  assert.equal(await sdk.acceptManualActionGrant(g), true); return g;
}

test('production Node SDK optional descriptor retains legacy access and sends only after tokenless review, original grant and explicit confirm', async t => {
  const f = await fixture(t), sdk = nodeClient(f), legacy = createWalletApplicationClient({ origin: f.app.origin, ownerToken: f.app.ownerAccess.token });
  assert.equal(sdk.getState().data, null); assert.equal(await legacy.refresh(), true);
  assert.equal(legacy.can('accountPrepare'), false); assert.equal(legacy.getManualActionReview, undefined);
  assert.deepEqual(Object.keys(legacy).sort(), ['can','cancelReview','confirm','getState','refresh','review','subscribe']);
  const legacyExact = createWalletApplicationClient({ origin: f.app.origin, ownerToken: f.app.ownerAccess.token,
    actionToken: f.app.issueActionCapability({ action: 'accountPrepare', body: f.body }).token });
  assert.equal(await legacyExact.refresh(), true); assert.equal(legacyExact.can('accountPrepare'), true);
  assert.equal(await sdk.refresh(), true); const review = sdk.review('accountPrepare', f.body);
  assert.equal(review.manualHandoff.binding.generationId, f.generation.generationId);
  assert.equal(sdk.canConfirm(), false); assert.equal(await sdk.confirm(), false);
  assert.equal((await f.session.snapshot()).admissions.length, 0);
  const g = await f.host.authorizeReview(sdk.getManualActionReview());
  const frames = []; const off = sdk.subscribe(s => frames.push(s));
  assert.equal(await sdk.acceptManualActionGrant(g), true);
  assert.equal((await f.session.snapshot()).admissions.length, 0);
  assert.equal(JSON.stringify(frames).includes(g.access.token), false); assert.equal(JSON.stringify(sdk.getState()).includes(g.access.token), false);
  assert.equal(await sdk.confirm(), true); await f.session.idle(); off();
  assert.equal(sdk.getState().outcome.state, 'VOLATILE_QUEUE_ACCEPTANCE');
  assert.equal((await f.session.snapshot()).requests[0].state, 'PREPARED');
  assert.equal(await sdk.confirm(), false); assert.equal((await post(f, g)).status, 403);
  await assert.rejects(f.host.authorizeReview(g.request), /REVIEW_USED/);
});

test('optional SDK descriptor rejects scope expansion, getters, proxy, mismatched origins and fake commitment imports', async t => {
  const f = await fixture(t), input = { origin: f.app.origin, ownerToken: f.app.ownerAccess.token };
  let touched = false;
  const getter = { get listenerId() { touched = true; return h('fake'); }, origin: f.app.origin };
  for (const extra of [ { actionToken: h('broad'), manualActionHandoff: f.host.descriptor },
    { manualActionHandoff: { ...f.host.descriptor, origin: 'http://127.0.0.1:1' } },
    { manualActionHandoff: { ...f.host.descriptor, authorizeReview() {} } },
    { manualActionHandoff: getter }, { manualActionHandoff: new Proxy(f.host.descriptor, {}) },
    { manualActionHandoff: null }, { manualActionHandoff: { ...f.host.descriptor, [Symbol('extra')]: true } }, { fetchImpl() {} } ]) assert.throws(() => createWalletApplicationClient({ ...input, ...extra }), /ACCESS_INVALID/);
  assert.equal(touched, false);
  const descriptor = { ...f.host.descriptor }, sdk = createWalletApplicationClient({ ...input, manualActionHandoff: descriptor });
  descriptor.origin = 'http://127.0.0.1:1'; descriptor.listenerId = h('replacement');
  assert.equal(await sdk.refresh(), true); sdk.review('accountPrepare', f.body);
  const g = await f.host.authorizeReview(sdk.getManualActionReview());
  assert.equal(await sdk.acceptManualActionGrant({ ...g, access: { ...g.access, token: h('fake') } }), false);
  assert.equal(sdk.canConfirm(), false); assert.equal(await sdk.confirm(), false);
  assert.equal((await f.session.snapshot()).admissions.length, 0);
});

test('production Node SDK cancellation, changed head, terms and listener cannot reuse imported original authority', async t => {
  const f = await fixture(t), sdk = nodeClient(f); await sdk.refresh();
  const g = await nodeGrant(f, sdk, 'accountPrepare', f.body);
  sdk.cancelReview(); f.host.cancelReview(); assert.equal(await sdk.confirm(), false); assert.equal((await post(f, g)).status, 403);
  await sdk.refresh(); const g2 = await nodeGrant(f, sdk, 'accountPrepare', f.body);
  f.changeHead(); assert.equal(await sdk.confirm(), false); assert.equal(sdk.getState().outcome.state, 'UNKNOWN');
  assert.equal((await post(f, g2)).status, 403); await f.session.idle();
  assert.ok((await f.session.snapshot()).requests.every(r => r.state !== 'PREPARED'));
  const f2 = await fixture(t), sdk2 = nodeClient(f2); await sdk2.refresh();
  const g3 = await nodeGrant(f2, sdk2, 'accountPrepare', f2.body); f2.changeTerms();
  assert.equal(await sdk2.confirm(), false); assert.equal(sdk2.getState().outcome.state, 'UNKNOWN');
  assert.equal((await post(f2, g3)).status, 403);
  const f3 = await fixture(t), sdk3 = nodeClient(f3); await sdk3.refresh();
  const g4 = await nodeGrant(f3, sdk3, 'accountPrepare', f3.body); await f3.app.close();
  assert.equal(await sdk3.confirm(), false); assert.equal(sdk3.getState().outcome.state, 'UNKNOWN');
  assert.equal((await f3.session.snapshot()).admissions.length, 0);
});

test('fixed actual driver uses genuine original host and production SDK, retains UNKNOWN without native/proof work or retry', async t => {
  const f = await fixture(t, { driver: true }), driver = driverFor(f.app);
  assert.equal((await driver.account('prepare', f.body)).originalJournalState, 'PREPARED');
  const reviewed = await driver.reviewAccount('execute', { requestId: f.body.requestId });
  assert.equal(reviewed.review.manualHandoff.binding.generationId, f.generation.generationId);
  assert.equal(reviewed.review.accountContext.graph.reservedAmount, '120');
  assert.equal((await f.session.snapshot()).admissions.length, 1);
  await assert.rejects(reviewed.confirm()); await f.session.idle();
  const snapshot = await f.session.snapshot(); assert.equal(snapshot.requests.length, 1);
  assert.equal(snapshot.requests[0].state, 'UNKNOWN'); assert.equal(snapshot.requests[0].requestId, f.body.requestId);
  assert.deepEqual(snapshot.admissions.map(row => row.action), ['prepare', 'execute']);
  await assert.rejects(reviewed.confirm(), /REVIEW_ALREADY_USED/);
  f.setOwnerOffline();
  for (const method of ['reconcile', 'recover']) {
    const original = await driver.reviewAccount(method, { requestId: f.body.requestId });
    assert.equal(original.review.manualHandoff.head, null);
    assert.equal(original.review.manualHandoff.graph.settleBefore, '7000');
    await assert.rejects(original.confirm(), /RECONCILIATION|FAILED|UNKNOWN|FUNDING|NOTE|RECOVER/); await f.session.idle();
  }
  const final = await f.session.snapshot(); assert.equal(final.requests.length, 1);
  assert.ok(['UNKNOWN','RECOVERING'].includes(final.requests[0].state));
  assert.deepEqual(final.admissions.map(row => row.action), ['prepare', 'execute', 'reconcile', 'recover']);
  for (const action of ['accountPrepare','accountExecute','accountReconcile','accountRecover']) {
    assert.ok(driver.evidence().some(row => row.action === action && row.check === 'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED'));
    assert.ok(driver.evidence().some(row => row.action === action && row.check === 'EXPLICIT_HANDOFF_CONFIRMATION'));
  }
  assert.equal(f.catalogue.status().generations.length, 1); assert.equal(f.catalogue.status().bindings.length, 1);
});

test('fixed driver retains listener-bound original grant, cancels fresh review and rejects expired deadline without sending', async t => {
  const f = await fixture(t, { driver: true }), first = driverFor(f.app);
  await first.account('prepare', f.body);
  const cancelled = await first.reviewAccount('execute', { requestId: f.body.requestId }); cancelled.cancel();
  await assert.rejects(cancelled.confirm(), /REVIEW_ALREADY_USED/);
  assert.equal((await f.session.snapshot()).admissions.length, 1);
  await assert.rejects(first.account('execute', { requestId: f.body.requestId }), /RECONCILIATION|FAILED|UNKNOWN|FUNDING|NOTE|PREPARATION/); await f.session.idle();
  assert.equal((await f.session.snapshot()).requests[0].state, 'UNKNOWN');
  const bindings = structuredClone(f.catalogue.status().bindings);
  const old = await first.unspentGraphGrantForListenerReplacement(f.body.requestId);
  await f.app.close();
  const next = await startWalletApplication({ accountSession: f.session, actionAccessMode: 'exact-only' }); t.after(() => next.close());
  const second = driverFor(next); await second.rejectForeignListenerGrant('accountReconcile', { requestId: f.body.requestId }, old);
  assert.deepEqual(f.catalogue.status().bindings, bindings); assert.equal((await f.session.snapshot()).admissions.length, 2);
  const fresh = await second.reviewAccount('reconcile', { requestId: f.body.requestId });
  assert.notEqual(fresh.review.manualHandoff.listenerId, cancelled.review.manualHandoff.listenerId); fresh.cancel();
  const f2 = await fixture(t, { driver: true });
  const expired = createManualWalletAppDriver(f2.app, { deadlineMs: Date.now() - 1 });
  await assert.rejects(expired.account('prepare', f2.body), /DEADLINE_EXHAUSTED/);
  assert.equal((await f2.session.snapshot()).admissions.length, 0);
});
