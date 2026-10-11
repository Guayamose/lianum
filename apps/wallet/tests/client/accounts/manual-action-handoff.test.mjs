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
import { derivePrivateAssetIdentity } from '../../../../../packages/engine/src/notes/private-asset-runtime.mjs';
import { sha, genericAccountIdentity } from '../../../../../packages/engine/src/execution/accounts/generic-account-journal.mjs';
import * as actualSystemState from '../../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { encodeStatement } from '@lianum/components/encoding/statements';
import { flatAccountGraphBinding } from '../../../../../packages/backend/src/accounts/authority/flat-account-validation.mjs';
import { createWalletClient, accountReviewDetails } from '../../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs';
import { bindManualActionConsent } from '../../../src/client/features/accounts/manual-action-dom.mjs';
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
mock.module(url('../proof-workers/scoped-proof-tools.mjs'), { exports: {
  loadFlatABI: forbidden, createFlatProofRunner() { return { async close() {}, async abort() {}, async prove() { throw Error('PROOF_WORK_FORBIDDEN'); } }; },
  withFlatHash() { throw Error('HASH_BACKEND_FORBIDDEN'); }
} });
const { createFlatAccountAuthority, flatAccountManualGraphDetails } = await import('../../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs');
const { createFlatPortfolioAuthority } = await import('../../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs');
const { createFlatJournalGeneration, createFlatJournalCatalogue } = await import('../../../../../packages/backend/src/accounts/storage/flat-journal-catalogue.mjs');
const { createFlatManualGraphCatalogueSession } = await import('../../../../../packages/backend/src/api/accounts/flat-manual-graph-session.mjs');
const { startWalletApplication } = await import('../../../src/server/server.mjs');
async function fixture(t, { manual = false } = {}) {
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
  const host = manual ? null : app.createManualActionHandoff();
  let posts = 0, loseNextReply = false;
  const fetchImpl = async (path, options) => {
    if (options.method === 'POST') posts++;
    const response = await fetch(app.origin + path, { ...options, headers: { ...options.headers, Origin: app.origin } });
    if (options.method === 'POST' && loseNextReply) { loseNextReply = false; await response.arrayBuffer(); throw Error('SYNTHETIC_LOST_REPLY'); }
    return response;
  };
  const client = createWalletClient({ fetchImpl, ownerToken: app.ownerAccess.token, ...(host ? { manualActionHandoff: host.descriptor } : { actionToken: app.actionAccess.token }) });
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

test('genuine original authority/catalogue approval reaches existing prepare via explicit browser handoff and fresh confirmation', async t => {
  const f = await fixture(t); assert.equal(f.app.actionAccess, undefined);
  const review = f.client.review('accountPrepare', f.body), request = f.client.getManualActionReview();
  assert.equal(review.accountContext.graph.reservedAmount, '120'); assert.equal(request.binding.generationId, f.generation.generationId);
  assert.equal(request.binding.accountIdentitySHA256, sha(genericAccountIdentity(f.account.config)));
  assert.equal(request.graph.recoveryRecipient, a(7)); assert.equal(request.graph.settleBefore, '7000');
  assert.ok(accountReviewDetails(review.accountContext).some(([name, value]) => name.includes('Cutoff') && value === '7000'));
  assert.equal(f.client.can('accountPrepare'), true); assert.equal(f.client.canConfirm(), false); assert.equal(await f.client.confirm(), false); assert.equal(f.posts, 0);
  const g = await f.host.authorizeReview(request); assert.equal(await f.client.acceptManualActionGrant(g), true);
  assert.equal(JSON.stringify(f.client.getState()).includes(g.access.token), false);
  assert.equal(f.posts, 0); assert.equal(f.client.canConfirm(), true); assert.equal(await f.client.confirm(), true);
  await f.session.idle(); assert.equal((await f.session.snapshot()).requests[0].state, 'PREPARED');
  assert.equal(f.posts, 1); assert.equal(await f.client.confirm(), false); assert.equal((await post(f, g)).status, 403);
  await assert.rejects(f.host.authorizeReview(request), /REVIEW_USED/);
  assert.throws(() => flatAccountManualGraphDetails({ ...f.approval }), /ORIGINAL_REQUIRED/);
});

test('fake or edited grant, origin, listener, account, generation, request, body and original terms never become consent', async t => {
  const f = await fixture(t); f.client.review('accountPrepare', f.body); const request = f.client.getManualActionReview();
  for (const alter of [r => r.origin = 'http://127.0.0.1:1', r => r.listenerId = h('other listener'),
    r => r.binding.accountIdentitySHA256 = h('other account'), r => r.binding.generationId = h('other generation'),
    r => r.body.requestId = 'different_graph_01', r => r.body.ownerOperationRef = h('other ref'),
    r => r.graph.reservedAmount = '121', r => r.graph.recoveryRecipient = a(8), r => r.graph.settleBefore = '8000', r => r.extra = true]) {
    const changed = structuredClone(request); alter(changed); await assert.rejects(f.host.authorizeReview(changed));
  }
  const g = await f.host.authorizeReview(request);
  assert.equal(await f.client.acceptManualActionGrant({ ...g, access: { ...g.access, token: h('forged') } }), false);
  assert.equal(f.client.canConfirm(), false); assert.equal(f.posts, 0);
  f.client.review('accountPrepare', f.body); assert.equal(await f.client.acceptManualActionGrant(g), false);
  assert.equal(f.client.canConfirm(), false); assert.equal(f.posts, 0);
});

test('head changes before handoff, after import and at final server admission fail closed without original prepare', async t => {
  const f = await fixture(t); f.client.review('accountPrepare', f.body); const request = f.client.getManualActionReview();
  f.changeHead(); await assert.rejects(f.host.authorizeReview(request), /CHANGED/);
  f.client.cancelReview(); await f.client.refresh(); const g = await grant(f, 'accountPrepare', f.body);
  f.changeHead(); // Already at head 43; change once more through the synthetic port.
  worlds.get(f.runtime).head.hash = h('head-44'); worlds.get(f.runtime).head.number = '44';
  assert.equal(await f.client.confirm(), false); assert.equal(f.client.getState().outcome.state, 'UNKNOWN');
  assert.equal((await post(f, g)).status, 403); await f.session.idle();
  assert.equal((await f.session.snapshot()).requests[0].state, 'PREPARING');
});

test('lost response retains original ID; only fresh explicit original reconcile and recovery are available', async t => {
  const f = await fixture(t); await prepare(f); await grant(f, 'accountExecute'); f.loseReply();
  assert.equal(await f.client.confirm(), false); await f.session.idle();
  assert.equal(f.client.getState().outcome.state, 'UNKNOWN'); assert.equal(f.client.getState().outcome.requestId, f.body.requestId);
  assert.equal((await f.session.snapshot()).requests[0].state, 'UNKNOWN');
  // Synthetic source has no spendable leaf. Real authority stops before proof,
  // preserves UNKNOWN and never invents settlement or a replacement operation.
  await f.client.refresh(); assert.throws(() => f.client.review('accountExecute', { requestId: f.body.requestId }));
  f.setOwnerOffline(); await f.client.refresh();
  const originalCutoff = flatAccountManualGraphDetails(f.approval).review.settleBefore;
  for (const action of ['accountReconcile', 'accountRecover']) {
    const g = await grant(f, action); assert.equal(g.request.head, null); assert.equal(g.request.graph.settleBefore, originalCutoff);
    assert.equal(await f.client.confirm(), true); await f.session.idle(); await f.client.refresh();
    assert.equal((await f.session.snapshot()).requests.length, 1);
    assert.ok(['UNKNOWN', 'RECOVERING'].includes((await f.session.snapshot()).requests[0].state));
  }
  assert.equal(f.posts, 4); assert.equal(f.catalogue.status().bindings[0].generationId, f.generation.generationId);
});

class Element extends EventTarget { checked = false; disabled = true; textContent = ''; fire(type) { this.dispatchEvent(new Event(type)); } }
test('actual DOM adapter requires new checkbox consent after grant, cancels on refresh/back, rejects double click and old nonce', async t => {
  const f = await fixture(t), consent = new Element(), confirm = new Element(), status = new Element(), page = new Element();
  const release = bindManualActionConsent({ client: f.client, consent, confirm, status, page });
  f.client.review('accountPrepare', f.body); consent.checked = true; consent.fire('change');
  assert.equal(consent.checked, false); confirm.fire('click'); assert.equal(f.posts, 0);
  const g = await f.host.authorizeReview(f.client.getManualActionReview());
  assert.equal(await f.client.acceptManualActionGrant(g), true); assert.equal(confirm.disabled, true);
  assert.match(status.textContent, /una vez/); consent.checked = true; consent.fire('change'); assert.equal(confirm.disabled, false);
  confirm.fire('click'); confirm.fire('click'); await f.session.idle();
  // Await the one HTTP outcome through the client's subscription.
  if (f.client.getState().sending) await new Promise(resolve => { const off = f.client.subscribe(s => { if (!s.sending) { off(); resolve(); } }); });
  assert.equal(f.posts, 1); assert.equal(confirm.disabled, true);
  await f.session.idle(); await f.client.refresh(); await grant(f, 'accountExecute'); consent.checked = true; consent.fire('change');
  page.fire('pagehide'); assert.equal(f.client.getState().review, null); assert.equal(confirm.disabled, true);
  assert.equal(await f.client.acceptManualActionGrant(g), false); confirm.fire('click'); assert.equal(f.posts, 1); release();
});

test('explicit cancel and refresh destroy pending client authority; host cancellation revokes the existing server grant', async t => {
  const f = await fixture(t); const g = await grant(f, 'accountPrepare', f.body);
  f.client.cancelReview(); assert.equal(f.client.canConfirm(), false); f.client.review('accountPrepare', f.body);
  assert.equal(await f.client.acceptManualActionGrant(g), false); f.host.cancelReview(); assert.equal((await post(f, g)).status, 403);
  const next = await grant(f, 'accountPrepare', f.body); await f.client.refresh();
  assert.equal(f.client.getState().review, null); assert.equal(await f.client.acceptManualActionGrant(next), false);
  f.host.disconnect(); assert.equal((await post(f, next)).status, 403);
});

test('terms and listener changes reject old authority, broad GRAPH stays blocked, HTTP has no mint/host route', async t => {
  const f = await fixture(t); const g = await grant(f, 'accountPrepare', f.body); f.changeTerms();
  assert.equal(await f.client.confirm(), false); assert.equal(f.client.getState().outcome.state, 'UNKNOWN');
  await f.app.close(); const next = await startWalletApplication({ accountSession: f.session, actionAccessMode: 'exact-only' }); t.after(() => next.close());
  const response = await fetch(next.origin + '/api/wallet/account/prepare', { method: 'POST', headers: { Origin: next.origin,
    'x-wallet-action-token': g.access.token, 'Content-Type': 'application/json' }, body: JSON.stringify(f.body) }); assert.equal(response.status, 403);
  for (const route of ['/api/wallet/capability', '/api/wallet/authorize', '/api/wallet/handoff'])
    assert.equal((await fetch(next.origin + route, { method: 'POST' })).status, 404);
  const broad = await fixture(t, { manual: true }); assert.throws(() => broad.app.createManualActionHandoff(), /UNAVAILABLE/);
  assert.throws(() => broad.client.review('accountPrepare', broad.body));
  assert.equal((await fetch(broad.app.origin + '/api/wallet/account/prepare', { method: 'POST', headers: { Origin: broad.app.origin,
    'x-wallet-action-token': broad.app.actionAccess.token, 'Content-Type': 'application/json' }, body: JSON.stringify(broad.body) })).status, 403);
});

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('host cancellation during final head recheck consumes but never admits, and cancellation during grant minting returns no grant', async t => {
  const f = await fixture(t), g = await grant(f, 'accountPrepare', f.body);
  let gate = { entered: deferred(), release: deferred() }; worlds.get(f.runtime).ownerGate = gate;
  const sending = f.client.confirm(); await gate.entered.promise; f.host.cancelReview(); gate.release.resolve();
  assert.equal(await sending, false); await f.session.idle();
  assert.equal((await post(f, g)).status, 403); assert.equal((await f.session.snapshot()).requests[0].state, 'PREPARING');
  await f.client.refresh(); f.client.review('accountPrepare', f.body);
  gate = { entered: deferred(), release: deferred() }; worlds.get(f.runtime).ownerGate = gate;
  const authorizing = f.host.authorizeReview(f.client.getManualActionReview()); await gate.entered.promise;
  f.host.cancelReview(); gate.release.resolve(); await assert.rejects(authorizing, /UNAVAILABLE/);
  assert.equal(f.client.canConfirm(), false);
});

test('pending grant is deeply immutable and optional versioned metadata remains compatible with legacy clients', async t => {
  const f = await fixture(t); const g = await grant(f, 'accountPrepare', f.body);
  assert.throws(() => { g.request.head.blockHash = h('changed-head'); }, TypeError);
  assert.throws(() => { g.request.graph.reservedAmount = '999'; }, TypeError);
  const response = await fetch(f.app.origin + '/api/wallet/state', { headers: { Origin: f.app.origin, 'x-wallet-owner-token': f.app.ownerAccess.token } });
  const data = await response.json(); assert.equal(JSON.stringify(data).includes(g.access.token), false);
  assert.equal(data.manualActionHandoff.grant.reviewId, g.request.reviewId);
  const { validateWalletState } = await import('../../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs');
  assert.ok(validateWalletState(data));
  const legacy = structuredClone(data); delete legacy.manualActionHandoff; assert.ok(validateWalletState(legacy));
  const bad = structuredClone(data); bad.manualActionHandoff.grant.token = g.access.token; assert.throws(() => validateWalletState(bad));
});

test('unavailable optional handoff metadata cannot fail the existing owner-authenticated state route', async t => {
  const f = await fixture(t); await f.account.close();
  const response = await fetch(f.app.origin + '/api/wallet/state', { headers: { Origin: f.app.origin, 'x-wallet-owner-token': f.app.ownerAccess.token } });
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.manualActionHandoff, undefined); assert.equal(data.errors.account, 'WALLET_ACCOUNT_GRAPH_UNAVAILABLE');
  await f.client.refresh(); assert.equal(f.client.can('accountPrepare'), false);
});
