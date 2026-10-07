/** Source-only host test: real account/approval/portfolio/generic keeper,
 * encrypted journals, HTTP and Node SDK; explicitly synthetic lower ownership,
 * owner/ledger/registry/proof ports. No signer, compiler, backend, native runtime,
 * deployment, proof acceptance, or real wrapped custody is established. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { derivePrivateAssetIdentity } from '../../../../../packages/engine/src/notes/private-asset-runtime.mjs';
import { sha } from '../../../../../packages/engine/src/execution/accounts/generic-account-journal.mjs';
import { encodeStatement } from '../../../../../packages/backend/src/execution/encoding/statements.mjs';
import { flatAccountGraphBinding } from '../../../../../packages/backend/src/accounts/authority/flat-account-validation.mjs';
const h = s => createHash('sha256').update(s).digest('hex'), address = n => n.toString(16).padStart(40, '0');
const clone = structuredClone, worlds = new WeakMap(), owners = new WeakMap(), executors = new WeakMap();
const forbidden = () => { throw Error('SYNTHETIC_NO_HEAVY_OR_NATIVE_WORK'); };
const url = p => new URL(p, import.meta.url).href;
mock.module(url('../wallet-platform/modules/ops/wrapped-wallet-release-v1.mjs'), { exports: {
  assertWrappedWalletAccountReleasedV1() {}, WRAPPED_WALLET_ACCOUNT_RELEASE_V1: null, WRAPPED_WALLET_ACCOUNT_HOST_SOURCE_PINS_V1: null,
} });
mock.module(url('../wallet-platform/modules/ops/wrapped-claim-wallet-binding-v1.mjs'), { exports: {
  assertOwnedWrappedClaimWalletSystemV1(runtime, system) { assert.equal(worlds.get(runtime)?.system, system); assert.equal(system.claimsEnabled, true); }
} });
mock.module(url('../wallet-platform/modules/chain-adapters/local-evm-ownership.mjs'), { exports: { async assertLocalEvm(runtime) { assert.ok(worlds.has(runtime)); } } });
mock.module(url('../wallet-platform/modules/chain-adapters/owned-pool-asset.mjs'), { exports: {
  createOwnedPoolAsset: forbidden, createNativePoolAsset: forbidden,
  assertOwnedPoolAsset(runtime, capability) { assert.ok(worlds.get(runtime)?.rows.some(row => row.capability === capability)); }
} });
mock.module(url('../mobile-core/wrapped-claim-owner-process-v1.mjs'), { exports: {
  createWrappedClaimOwnerProcessV1: forbidden, assertOwnedWrappedClaimIngressHandoffV1: forbidden,
  assertOwnedWrappedClaimOwnerProcessV1(owner, expected) { const row = owners.get(owner); assert.ok(row && !row.closed);
    for (const key of ['runtime', 'system', 'poolIndex']) assert.equal(row[key], expected[key]); }
} });
mock.module(url('../mobile-core/wrapped-claim-owner-observer-v1.mjs'), { exports: {
  async createWrappedClaimOwnerObserverV1({ runtime, poolIndex }) { return worlds.get(runtime).rows[poolIndex].observer; },
  assertOwnedWrappedClaimOwnerObserverV1(observer, { runtime, poolIndex }) { assert.equal(observer, worlds.get(runtime).rows[poolIndex].observer); }
} });
mock.module(url('../wallet-platform/modules/paeg/wrapped-wallet-state-v1.mjs'), { exports: {
  async createWrappedWalletStateReaderV1({ runtime, poolIndex }) { return worlds.get(runtime).rows[poolIndex].reader; }
} });
mock.module(url('../wallet-platform/modules/paeg/wrapped-wallet-execution-v1.mjs'), { exports: {
  createWrappedWalletExecutionV1: forbidden, WRAPPED_WALLET_EXECUTION_PROFILE_V1: 'SYNTHETIC_LOWER_EXECUTOR',
  assertOwnedWrappedWalletExecutionV1(executor, expected) { const row = executors.get(executor); assert.ok(row);
    for (const key of ['runtime', 'system', 'poolIndex']) assert.equal(row[key], expected[key]); },
  ownedWrappedWalletManualGraphReviewV1(executor, ref, expected) { const row = executors.get(executor); assert.equal(row.ref, ref);
    assert.equal(row.runtime, expected.runtime); assert.ok(!row.routeChanged); return clone(row.route); }
} });
mock.module(url('../wallet-platform/modules/native-claims/operational-registration-v2.mjs'), { exports: {
  validateWrappedClaimOperationalRegistration(value) { return value; },
  WRAPPED_CLAIM_OPERATIONAL_PROFILE: 'SYNTHETIC_LOWER_REGISTRY',
} });
mock.module(url('../proof-workers/scoped-proof-tools.mjs'), { exports: {
  loadFlatABI: forbidden, withFlatHash: forbidden,
  createFlatProofRunner() { return { prove: forbidden, async close() {}, async abort() {} }; }
} });
const { createWrappedWalletAccountAuthorityV1, wrappedWalletAccountManualGraphDetailsV1 } = await import('../../../../../packages/backend/src/accounts/authority/wrapped-wallet-account-authority-v1.mjs');
const { assertOwnedNativeValueAccountAuthority, nativeValueAccountManualGraphDetails } = await import('../../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs');
const { createWrappedWalletPortfolioAuthorityV1 } = await import('../../../../../packages/backend/src/accounts/portfolio/wrapped-wallet-portfolio-v1.mjs');
const { createWrappedWalletManualGraphSessionV1 } = await import('../../../../../packages/backend/src/api/wallet/wrapped-wallet-session-v1.mjs');
const { startWalletApplication } = await import('../../../src/server/server.mjs');
const { createWalletApplicationClient } = await import('../../../../../packages/backend/src/api/wallet/wallet-application-client.mjs');
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'wrapped-wallet-host-only-'));
  const w = { head: { number: '42', hash: h('head'), timestamp: '6000' }, rows: [], sends: 0 };
  const runtime = { metadata: { chainId: '31337', evmGenesis: '0x' + h('genesis'), scratchDirectory: directory },
    time: async () => BigInt(w.head.timestamp), async send() { w.sends++; forbidden(); } };
  const system = { profile: 'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1', claimsEnabled: true, bootstrap: 'SYNTHETIC_LOWER_BOOTSTRAP',
    hub: { address: '0x' + address(1) }, claims: { authority: { address: '0x' + address(2) } }, pools: [], registryCommitment: '0x' + h('registry'),
    custodyRegistration: { claims: [] } };
  Object.assign(w, { runtime, system }); worlds.set(runtime, w);
  for (const poolIndex of [0, 1]) {
    const tag = 'pool-' + poolIndex, capability = {}, token = address(3 + poolIndex), tokenCode = h(tag + 'token-code');
    const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(k => [k, h(tag + k)]));
    domain.registryCommitment = system.registryCommitment.slice(2); domain.ledgerNamespace = domain.hubDomain;
    domain.asset = derivePrivateAssetIdentity(31337, '0x' + token, '0x' + tokenCode).slice(2);
    const identity = { pool: address(5 + poolIndex), domain, domainCommitment: '0' + String(poolIndex + 1).repeat(63), assetBinding: { token, codeHash: tokenCode } };
    const pool = { address: '0x' + identity.pool, domain, asset: '0x' + token, codeHash: '0x' + h(tag + 'pool-code'), assetCapability: capability,
      assetMetadata: { kind: 'ERC20', address: '0x' + token, codeHash: '0x' + tokenCode, symbol: poolIndex ? 'cSOL' : 'cBTC', decimals: poolIndex ? 9 : 8 }, artifact: {} };
    system.pools.push(pool); system.custodyRegistration.claims.push({ config: { pool: identity.pool, wrapperAssetIdentity: domain.asset, registryCommitment: domain.registryCommitment }, claimDomain: h(tag + 'claim') });
    const authorization = { domainCommitment: identity.domainCommitment, envelope: '0' + String(poolIndex + 3).repeat(63) };
    const core = { value: { context: h(tag + 'context'), reserveCommitment: h(tag + 'reserve'), reserveNullifier: h(tag + 'reserve-nf'), settleBefore: '7000' } };
    const common = { ...authorization, domain, core }, prepared = { authorization: { proof: 'c0ffee'.padEnd(64, '0'), publicInputs: encodeStatement('authorization', authorization) }, rolePackets: {
      reservation: { ...common, funding: { value: { inputCommitment: h(tag + 'input'), inputNullifier: h(tag + 'input-nf'), reserveCommitment: core.value.reserveCommitment,
        changeCommitment: h(tag + 'change'), operationId: h(tag + 'operation'), fundingNotBefore: '5900', fundingValidUntil: '6200' } } },
      recovery: { ...common, recovery: { value: { ...core.value, recoveryCommitment: h(tag + 'recovery') } } },
      assembler: common, local: Array.from({ length: 4 }, () => common), dependency: Array.from({ length: 4 }, () => common),
    } };
    const route = { routeProfile: 'OWNED_LOCAL_WRAPPED_CLAIM_NATIVE_GRAPH_V1', family: '3', chainId: '1', genesis: h('source-genesis'), sourcePool: pool.address,
      sourceAssetIdentity: domain.asset, nativeAsset: h('native-asset'), solver: '0x' + address(10), recipient: '0x' + address(11), nativeAmount: '100',
      executionFrom: '5900', executionUntil: '6500', settleBefore: '7000', payoutCommitment: h(tag + 'payout'), deliveryRiskCommitment: h(tag + 'risk'),
      deliveryLossClause: 'SYNTHETIC_LOWER_ORIGINAL_LOSS_CLAUSE', creditEligible: false, privateSpendableAtomic: null, publicNetwork: false,
      envelope: authorization.envelope, fundingNotBefore: '5900', fundingValidUntil: '6200' };
    const terms = { identitySHA256: sha(identity), envelope: authorization.envelope, fundingNotBefore: '5900', fundingValidUntil: '6200', settleBefore: '7000',
      sourceAmount: '500', reservedAmount: '120', changeAmount: '380', changeRecipient: address(12), recoveryRecipient: address(13) };
    const row = { runtime, system, poolIndex, capability, ref: h(tag + 'ref'), route, generation: 1, processIdentitySHA256: h(tag + 'process'), closed: false };
    row.observer = { identity, async readTransaction() { return null; } };
    row.reader = { async read() { return { head: clone(w.head), ledger: { commitments: ['0x' + prepared.rolePackets.reservation.funding.value.inputCommitment], nullifiers: [],
      publicState: { actualAssetBalance: '500', backedAmount: '500', surplus: '0' } } }; }, async assertCurrent(view) { assert.deepEqual(view.head, w.head); } };
    const owner = { publicView: { async summary() { return { identitySHA256: sha(identity), operations: {} }; } }, roles: {},
      report: () => ({ available: true, generation: row.generation, processIdentitySHA256: row.processIdentitySHA256 }),
      ownerView: { async graphPreparationTerms() { return clone(terms); }, async summary() { return { identitySHA256: sha(identity), observed: { blockHash: w.head.hash, timestamp: w.head.timestamp },
        balances: { available: '500', reserved: '0', recovery: '0', locked: '0' } }; } } };
    for (const kind of ['reservation', 'recovery', 'assembler']) owner.roles[kind] = async () => ({ select: () => clone(prepared.rolePackets[kind]) });
    for (const kind of ['local', 'dependency']) owner.roles[kind] = async slot => ({ select: () => clone(prepared.rolePackets[kind][slot]) });
    const executor = { async prepare() { return flatAccountGraphBinding(prepared, identity); } };
    w.rows.push(row); owners.set(owner, row); executors.set(executor, row);
    row.factoryInput = { runtime, system, poolIndex, owner, nativeExecution: executor, accountId: 'wrapped_account_' + poolIndex, journalId: 'wrapped_journal_' + poolIndex };
    row.account = await createWrappedWalletAccountAuthorityV1(row.factoryInput);
    await row.account.ownerActions.registerGraph({ ownerOperationRef: row.ref, prepared, providers: [] });
    row.approval = await row.account.ownerActions.approveManualWrappedGraph({ requestId: 'wrapped_graph_' + poolIndex, ownerOperationRef: row.ref });
  }
  const portfolio = createWrappedWalletPortfolioAuthorityV1({ runtime, system, accounts: w.rows.map((row, poolIndex) => ({ poolIndex, account: row.account })), accountId: 'wrapped_portfolio', journalId: 'wrapped_portfolio_journal' });
  const joined = await createWrappedWalletManualGraphSessionV1({ runtime, portfolio, journal: { path: join(directory, 'generic.vault'), password: 'synthetic-host-only' } });
  w.rows.forEach(row => { row.body = joined.bindManualGraph(row.approval); });
  const app = await startWalletApplication({ accountSession: joined.session, actionAccessMode: 'exact-only' }), host = app.createManualActionHandoff();
  const sdk = createWalletApplicationClient({ origin: app.origin, ownerToken: app.ownerAccess.token, manualActionHandoff: host.descriptor });
  t.after(async () => { await app.close(); await joined.session.idle(); await joined.session.close(); for (const row of w.rows) await row.account.close(); });
  return { w, runtime, system, portfolio, joined, app, host, sdk };
}
test('both original wrapped assets share one real generic journal, HTTP handoff and Node SDK; profiles and native consent stay distinct', async t => {
  const f = await fixture(t);
  await assert.rejects(createWrappedWalletManualGraphSessionV1({ runtime: f.runtime, portfolio: f.portfolio, journal: { path: '/never-created', password: 'synthetic' } }), /ALREADY_CLAIMED/);
  for (const row of f.w.rows) {
    await assert.rejects(createWrappedWalletAccountAuthorityV1(row.factoryInput), /ALREADY_CLAIMED/);
    assert.throws(() => assertOwnedNativeValueAccountAuthority(row.account));
    assert.throws(() => nativeValueAccountManualGraphDetails(row.approval));
    assert.throws(() => wrappedWalletAccountManualGraphDetailsV1({ ...row.approval }));
    assert.throws(() => f.joined.bindManualGraph({ ...row.approval }));
    assert.equal(row.account.ownerActions.createManualPreparation, undefined);
    assert.equal(row.account.features.nativeManualNoteConsent, false);
    const original = wrappedWalletAccountManualGraphDetailsV1(row.approval).review;
    assert.equal(original.wrappedBinding.registryCommitment, f.system.registryCommitment.slice(2));
    assert.equal(original.wrappedBinding.claimAuthority, f.system.claims.authority.address);
    assert.equal(original.sourceAmount, '500'); assert.equal(original.reservedAmount, '120');
    assert.equal(await f.sdk.refresh(), true); const state = f.sdk.getState();
    assert.equal(state.data.portfolio.assets.length, 2); assert.equal(state.data.portfolio.profile, 'OWNED_WRAPPED_WALLET_PORTFOLIO_V1');
    f.sdk.review('accountPrepare', row.body); assert.equal(f.sdk.canConfirm(), false);
    const request = f.sdk.getManualActionReview();
    const changed = clone(request); changed.graph.wrappedBinding.economicIntentSHA256 = h('changed');
    await assert.rejects(f.host.authorizeReview(changed), /HANDOFF_CHANGED/);
    assert.throws(() => f.app.issueActionCapability({ action: 'accountPrepare', body: row.body }), /HANDOFF_REQUIRED/);
    const grant = await f.host.authorizeReview(request); assert.equal(await f.sdk.acceptManualActionGrant(grant), true);
    assert.equal(await f.sdk.confirm(), true); await f.joined.session.idle();
    const replay = await fetch(f.app.origin + '/api/wallet/account/prepare', { method: 'POST', headers: { Origin: f.app.origin, 'Content-Type': 'application/json', 'x-wallet-action-token': grant.access.token }, body: JSON.stringify(row.body) });
    assert.equal(replay.status, 403);
  }
  const snapshot = await f.joined.session.snapshot(); assert.equal(snapshot.requests.length, 2);
  assert.ok(snapshot.requests.every(row => row.state === 'PREPARED')); assert.equal(f.w.sends, 0);
  assert.equal(await f.sdk.refresh(), true); f.sdk.review('accountExecute', { requestId: f.w.rows[0].body.requestId });
  const old = f.sdk.getManualActionReview(); f.w.rows[0].generation++;
  await assert.rejects(f.host.authorizeReview(old)); f.w.rows[0].generation--;
  f.w.head = { ...f.w.head, number: '43', hash: h('new-head') };
  await assert.rejects(f.host.authorizeReview(old));
  assert.equal(f.w.sends, 0);
  assert.doesNotMatch(JSON.stringify(f.sdk.getState()), /privateKey|rootKey|witness|opening|password/);
});
