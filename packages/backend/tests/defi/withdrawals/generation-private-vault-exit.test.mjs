/** Host-only manual lifecycle tests. Native/account/vault capabilities and RPC
 * evidence are explicitly mocked before import; the workflow uses its actual
 * encrypted journal and real W39 codec. No node, proof, compiler or send runs. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bindGenericAccountRequest, genericAccountIdentity } from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault as RealVault } from '../../../../engine/src/crypto/vault.mjs';
import { encodeWalletPoolInputs } from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from '../../../src/execution/encoding/transaction-codec.mjs';
const worlds = new WeakMap(), receipts = new WeakMap(), bySystem = new WeakMap(), byAccount = new WeakMap(), byVault = new WeakMap();
let failReadback = false;
const pendingReadFailures = new WeakSet();
mock.module('../../../../../omnichain-product/src/vault.mjs', { exports: { Vault: class extends RealVault {
  async read(password) {
    if (pendingReadFailures.delete(this)) throw Error('SYNTHETIC_LOST_DURABLE_READBACK');
    return super.read(password);
  }
  async update(...args) {
    const result = await super.update(...args);
    if (failReadback) { failReadback = false; pendingReadFailures.add(this); }
    return result;
  }
} } });
mock.module('../chain-adapters/local-evm-ownership.mjs', { exports: { assertLocalEvm: async runtime => assert.ok(worlds.has(runtime), 'MOCK_OWNED_RUNTIME') } });
mock.module('../ops/deploy-system.mjs', { exports: { assertOwnedFlatSystem: (runtime, system) => assert.equal(bySystem.get(system)?.runtime, runtime, 'MOCK_OWNED_SYSTEM') } });
mock.module('../global-state/flat-account-authority.mjs', { exports: { assertOwnedFlatAccountAuthority(account, expected) {
  const world = byAccount.get(account); assert.ok(world && world.runtime === expected.runtime && world.system === expected.system
    && expected.poolIndex === 1, 'MOCK_OWNED_ACCOUNT');
}, flatAccountManualGraphDetails() { throw Error('UNUSED_SYNTHETIC_GRAPH'); }, assertFlatAccountManualGraphExecution() { throw Error('UNUSED_SYNTHETIC_GRAPH'); } } });
mock.module('./owned-backed-vault.mjs', { exports: {
  assertOwnedBackedVault(runtime, vault) { assert.equal(byVault.get(vault)?.runtime, runtime, 'MOCK_OWNED_VAULT'); },
  ownedBackedVaultBinding(runtime, vault) { assert.equal(byVault.get(vault)?.runtime, runtime); return structuredClone(byVault.get(vault).binding); },
  assertOwnedBackedVaultReceipt(vault, receipt) { assert.equal(receipts.get(receipt), vault, 'MOCK_ORIGINAL_RECEIPT_REQUIRED'); },
} });
// Actual private-exit, catalogue, graph-catalogue session, app and SDK; only
// lower native/account/portfolio/vault observations and child keeper are synthetic.
const portfolios = new WeakMap(), policies = new WeakMap(), keeperBrands = new WeakMap();
let keeperCreations = 0;
mock.module('../global-state/flat-portfolio-authority.mjs', { exports: {
  assertOwnedFlatPortfolio(runtime, portfolio) { assert.equal(portfolios.get(portfolio)?.runtime, runtime, 'SYNTHETIC_PORTFOLIO_BRAND'); },
  describeFlatPortfolioJournalAuthority(runtime, portfolio) { assert.equal(portfolios.get(portfolio)?.runtime, runtime); return portfolios.get(portfolio); },
  assertOwnedFlatPortfolioAccount(portfolio, account) { assert.ok(portfolios.get(portfolio)?.accounts.some(row => row.account === account)); },
} });
mock.module('../global-state/flat-pool-admission-policy.mjs', { exports: {
  assertOwnedFlatPoolAdmissionPolicy(policy, info) { assert.equal(policies.get(policy), info); },
} });
mock.module('../global-state/flat-manual-portfolio-keeper.mjs', { exports: {
  assertOwnedFlatManualPortfolioKeeper(keeper, expected) { assert.deepEqual(keeperBrands.get(keeper), expected); },
  async createFlatManualPortfolioKeeper({ runtime, portfolio }) {
    keeperCreations++;
    const info = portfolios.get(portfolio), rows = new Map();
    const result = id => { const request = rows.get(id); assert.ok(request); return { request, state: 'CONFIRMED', errorCode: null, confirmation: null }; };
    const keeper = Object.freeze({
      async prepare(input) { rows.set(input.requestId, bindGenericAccountRequest(input, portfolio.config)); return result(input.requestId); },
      async execute(id) { return result(id); }, async reconcile(id) { return result(id); }, async recover(id) { return result(id); },
      async snapshot() { if (info.world.unavailable) throw Error('SYNTHETIC_CHILD_UNAVAILABLE');
        return { version: 1, profile: 'SYNTHETIC_KEEPER', accountId: portfolio.config.accountId, revision: rows.size, storageAvailable: true,
          requests: [...rows.values()].map(r => ({ requestId: r.requestId, kind: r.kind, assetId: r.assetId, state: 'CONFIRMED', errorCode: null })) }; },
      async restartCoordinator() {}, async close() {},
    });
    keeperBrands.set(keeper, { runtime, portfolio }); return keeper;
  },
} });
const { createOwnedPrivateVaultExit, assertOwnedPrivateVaultExit } = await import('../../../src/defi/withdrawals/private-vault-exit.mjs');
const h = value => createHash('sha256').update('SYNTHETIC PRIVATE EXIT ' + value).digest('hex');
const address = name => h(name).slice(0, 40), clone = value => structuredClone(value);
const requestId = 'original_share_exit';
async function fixture(options = {}) {
  const n = options.n ?? 1, requestId = options.requestId ?? 'original_share_exit_' + n;
  const scratchDirectory = await mkdtemp(join(tmpdir(), 'lianum-host-only-vault-exit-'));
  const world = { scratchDirectory, sends: 0, preparations: 0, reconciliations: 0, exitReconciliations: 0,
    losePrepareReply: false, loseSendReply: false, blockSend: false, fakeReceipt: false, observationLive: true,
    binding: { identity: { chainId: '31337', genesisHash: h('genesis'), asset: address('asset'), vault: address('vault'),
      assetCodeSHA256: h('asset-code'), vaultCodeSHA256: h('vault-code'), domain: h('domain'), runtimeId: h('runtime') },
    sender: address('owner'), receiver: address('owner') } };
  const asset = { assetId: h('share-asset-' + n), kind: 'ERC20', token: address('vault'), genesis: h('genesis'), chainId: '31337',
    pool: address('pool-' + n), scope: h('scope'), policy: h('policy'), symbol: 'BLTV', decimals: 6 };
  world.statement = { scope: '0x' + asset.scope, policy: '0x' + asset.policy, epoch: '2', root: '0x' + h('root'),
    nullifier: '0x' + h('nullifier'), amount: '100', recipient: '0x' + address('owner') };
  const input = encodeFlatTransaction('withdrawBalance', { proof: 'ab'.repeat(32),
    publicInputs: encodeWalletPoolInputs('withdraw_balance', world.statement) });
  const transactionHash = h('original-tx-' + n), blockHash = h('block'), calldataSHA256 = createHash('sha256').update(Buffer.from(input.slice(2), 'hex')).digest('hex');
  const outcome = { version: 1, state: 'CONFIRMED', disposition: 'APPLIED', outcomeId: h('outcome'), blockHash };
  world.entry = { kind: 'EXIT', ownerOperationRef: h('owner-operation-' + n), request: { requestId, kind: 'EXIT',
    assetId: asset.assetId, ownerOperationRef: h('owner-operation-' + n), bindingSHA256: h('request-binding'), assetBindingSHA256: h('asset-binding') },
    submission: { dispatchLatched: true, transactionHash, calldataSHA256 },
    terminal: { transactionHash, blockHash, blockNumber: '11', calldataSHA256 }, outcome };
  world.transaction = { hash: '0x' + transactionHash, to: '0x' + asset.pool, from: '0x' + address('system'),
    blockHash: '0x' + blockHash, blockNumber: '0xb', input };
  world.receipt = { transactionHash: '0x' + transactionHash, to: '0x' + asset.pool, status: '0x1',
    blockHash: '0x' + blockHash, blockNumber: '0xb' };
  world.runtime = { metadata: { scratchDirectory }, async transaction(hash) { assert.equal(hash, world.transaction.hash); return clone(world.transaction); },
    async receipt() { return world.receipt && clone(world.receipt); }, async checkReceipt() { world.receiptChecks = (world.receiptChecks ?? 0) + 1; } };
  if (options.runtime) world.runtime = options.runtime;
  world.system = { sender: '0x' + address('system'), pools: [null, { address: '0x' + asset.pool,
    artifact: { evm: { methodIdentifiers: { 'withdrawBalance(bytes,bytes32[])': FLAT_TRANSACTION_METHODS.withdrawBalance.selector } } } }] };
  world.account = { registry: [asset], config: { accountId: 'original_share_account_' + n, journalId: 'original_journal_' + n, registry: [asset] },
    async privateStatus() { if (world.unavailable) throw Error('SYNTHETIC_ORIGINAL_UNAVAILABLE'); return { operations: [clone(world.entry)] }; }, authority: {
      async reconcile(request) { assert.deepEqual(request, world.entry.request); world.exitReconciliations++; return clone(world.entry.outcome); },
      async observe({ challenge, request, outcome }) { assert.match(challenge, /^[0-9a-f]{32}$/); return { status: world.observationLive ? 'LIVE' : 'STALE',
        outcomeId: world.entry.outcome.outcomeId, challenge, bindingSHA256: request.bindingSHA256,
        assetBindingSHA256: request.assetBindingSHA256, canonicalOutcomeBlockHash: outcome.blockHash,
        backing: { held: '0', liabilities: '0', deficit: '0' } }; },
    } };
  world.actions = new Map();
  function output(row, fresh = false) {
    const result = { reference: row.reference, action: clone(row.action), phase: row.phase,
      execution: row.phase === 'OBSERVED' ? { confirmation: { shares: row.action.amount, assets: '100' } } : null,
      sendBlocked: world.blockSend };
    if (fresh && row.phase === 'OBSERVED' && !world.fakeReceipt) receipts.set(result, world.vault);
    return result;
  }
  world.vault = {
    async observe() { if (world.unavailable) throw Error('SYNTHETIC_ORIGINAL_UNAVAILABLE'); return { identity: clone(world.binding.identity), balances: { senderShares: '1000' },
      snapshot: { blockNumber: '12', blockHash: world.vaultHead ?? h('quote-block'), blockTimestamp: '1000', totalAssets: world.totalAssets ?? '1000', totalShares: '1000' } }; },
    async requoteUnsubmitted(intent) {
      const row = world.actions.get(intent.reference); assert.equal(row.phase, 'PREPARED');
      row.action.minimumOutput = intent.minimumOutput; row.action.deadline = intent.deadline;
      if (world.loseRequoteReply) { world.loseRequoteReply = false; throw Error('SYNTHETIC_LOST_REQUOTE_REPLY'); }
      return output(row);
    },
    async prepareOnce(intent) {
      let row = world.actions.get(intent.reference);
      if (row) for (const key of ['kind', 'amount', 'minimumOutput', 'deadline']) assert.equal(row.action[key], intent[key]);
      else { world.preparations++; row = { reference: intent.reference, phase: 'PREPARED', action: { ...clone(intent),
        identity: clone(world.binding.identity), sender: world.binding.sender, owner: world.binding.sender, receiver: world.binding.receiver,
        nonce: h('single-nonce') } }; world.actions.set(intent.reference, row); }
      if (world.losePrepareReply) { world.losePrepareReply = false; throw Error('SYNTHETIC_LOST_PREPARE_REPLY'); }
      return output(row);
    },
    async execute(reference) {
      const row = world.actions.get(reference); assert.ok(row);
      if (row.phase === 'PREPARED') { world.sends++; row.phase = 'OBSERVED'; }
      if (world.loseSendReply) { world.loseSendReply = false; throw Error('SYNTHETIC_LOST_SEND_REPLY'); }
      return output(row, true);
    },
    async reconcile(reference) { world.reconciliations++; const row = world.actions.get(reference); assert.ok(row, 'ORIGINAL_ACTION_MISSING'); return output(row, true); },
    async reopen() { world.reopens = (world.reopens ?? 0) + 1; if (world.unavailable) throw Error('SYNTHETIC_ORIGINAL_UNAVAILABLE'); return { reopened: true }; },
  };
  worlds.set(world.runtime, world); bySystem.set(world.system, world); byAccount.set(world.account, world); byVault.set(world.vault, world);
  options.beforeBootstrap?.(world);
  world.bootstrap = { runtime: world.runtime, system: world.system, poolIndex: 1, account: world.account, vault: world.vault };
  if (!options.skipBootstrap) world.service = await createOwnedPrivateVaultExit(world.bootstrap);
  world.requestId = requestId; world.asset = asset; world.prepare = { requestId, minimumOutput: '99', deadline: '1300' };
  return world;
}

const { createFlatJournalGeneration, createFlatJournalCatalogue } = await import('../../../src/accounts/storage/flat-journal-catalogue.mjs');
const { createFlatManualGraphCatalogueSession } = await import('../../../src/api/accounts/flat-manual-graph-session.mjs');
const { createGenerationPrivateVaultExit, generationPrivateVaultExitActionTarget } = await import('../../../src/defi/withdrawals/generation-private-vault-exit.mjs');
const { ownedPrivateVaultExitBinding } = await import('../../../src/defi/withdrawals/private-vault-exit.mjs');
mock.module('../api/native-claim-session.mjs', { exports: { assertNativeClaimSession() { throw Error('UNUSED_NATIVE_SESSION'); }, nativeClaimSessionIdentity() { throw Error('UNUSED_NATIVE_SESSION'); } } });
const { startWalletApplication } = await import('../../../../../apps/wallet/src/server/server.mjs');
const { createWalletApplicationClient } = await import('../../../src/api/wallet/wallet-application-client.mjs');
async function generation(w, n, includeUnderlying = true) {
  const reg = { ...w.asset, codeHash: h('code'), assetIdentity: h('asset-id'), custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER' };
  const underlying = { ...reg, assetId: h('underlying-'+n), token: w.binding.identity.asset, symbol: 'PALT', pool: address('underlying-pool-'+n) };
  const config = { accountId: 'portfolio_'+n, journalId: 'journal_'+n, lifetime: h('lifetime-'+n), registry: includeUnderlying ? [reg, underlying] : [reg] };
  const observation = { observedAt: 10, blockHash: h('quote-block'), blockNumber: '12', timestamp: '1000' };
  const view = () => ({ version: 1, profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true, observed: clone(observation),
    assets: config.registry.map(a => ({ version: 1, status: 'LIVE', asset: { assetId: a.assetId, symbol: a.symbol, decimals: a.decimals },
      observed: clone(observation), balances: { available: '100', reserved: '0', recovery: '0', locked: '0' },
      backing: { held: '100', liabilities: '100', surplus: '0', deficit: '0' }, requests: [] })),
    capabilities: { coordinatorRestart: true, keeperRestart: false, crossAssetAtomicConversion: false, privateDeFiComposability: false, fullWalletAcceptance: false } });
  const portfolio = Object.freeze({ config, registry: config.registry, async ownerView() {
    if (w.unavailable) throw Error('SYNTHETIC_PORTFOLIO_UNAVAILABLE'); return view(); } });
  w.account.assetId = w.asset.assetId;
  const info = { runtime: w.runtime, system: w.system, accounts: [{ account: w.account, poolIndex: 1 }], world: w };
  portfolios.set(portfolio, info);
  const routes = config.registry.map((a, i) => ({ assetId: a.assetId, economicIdentitySHA256: h('econ-'+i), pool: a.pool,
    domainCommitment: h('domain-'+n+'-'+i), chainId: a.chainId, genesis: a.genesis, hub: address('hub'), hubDomain: h('hub'),
    ledgerNamespace: h('ledger'), registryCommitment: h('reg'), verifierSetCommitment: h('verifier'), sourceProvenanceSHA256: h('source'), keyLineageSHA256: h('key') }));
  const policy = Object.freeze({ status: () => ({ current: config.registry.map(a => a.assetId) }),
    async verifyFreshGeneration() { return routes.map(route => ({ route, observed: clone(observation) })); } });
  policies.set(policy, info);
  const capability = await createFlatJournalGeneration({ runtime: w.runtime, portfolio, poolAdmissions: policy,
    journal: { path: join(w.scratchDirectory, 'generation.vault'), password: 'host-only synthetic password' } });
  return { capability, portfolio, observation };
}
async function joined(count = 2, includeUnderlying = true, sharedRuntime = null) {
  const worlds = [], gens = [], receiptsByHash = new Map(), txByHash = new Map();
  for (let n = 1; n <= count; n++) {
    const w = await fixture({ n, ...(worlds[0] || sharedRuntime ? { runtime: worlds[0]?.runtime ?? sharedRuntime } : {}) });
    worlds.push(w); txByHash.set(w.transaction.hash, w.transaction); receiptsByHash.set(w.transaction.hash, w.receipt);
    w.runtime.transaction = async hash => clone(txByHash.get(hash)); w.runtime.receipt = async hash => clone(receiptsByHash.get(hash));
    gens.push(await generation(w, n, includeUnderlying));
  }
  const runtime = worlds[0].runtime;
  const catalogue = await createFlatJournalCatalogue({ runtime, initialGeneration: gens[0].capability,
    journal: { path: join(worlds[0].scratchDirectory, 'catalogue.vault'), password: 'host-only synthetic password' } });
  for (let n = 1; n < count; n++) await catalogue.appendGeneration(gens[n].capability);
  for (const w of worlds) await catalogue.keeper.prepare(Object.fromEntries(['requestId','kind','assetId','ownerOperationRef'].map(k => [k,w.entry.request[k]])));
  const service = createGenerationPrivateVaultExit({ runtime, catalogue, services: worlds.map(w => w.service) });
  const { session } = await createFlatManualGraphCatalogueSession({ runtime, catalogue });
  return { runtime, catalogue, service, session, worlds, gens };
}

test('genuine catalogue and original service brands bind one unchanged EXIT to each original generation', async () => {
  const before = keeperCreations, f = await joined(), [old, next] = f.worlds;
  assert.equal(keeperCreations - before, 2);
  const binding = ownedPrivateVaultExitBinding(f.runtime, old.service);
  assert.equal(binding.account, old.account); assert.equal(binding.vault, old.vault);
  assert.throws(() => ownedPrivateVaultExitBinding(f.runtime, { ...old.service }), /CAPABILITY_REQUIRED/);
  assert.throws(() => createGenerationPrivateVaultExit({ runtime: f.runtime, catalogue: { ...f.catalogue }, services: [old.service] }), /ORIGINAL_CATALOGUE/);
  assert.throws(() => createGenerationPrivateVaultExit({ runtime: f.runtime, catalogue: f.catalogue, services: [{ ...old.service }] }), /CAPABILITY_REQUIRED/);
  assert.throws(() => createGenerationPrivateVaultExit({ runtime: f.runtime, catalogue: f.catalogue, services: [old.service, old.service] }), /AMBIGUOUS_SERVICE/);
  for (const w of f.worlds) {
    const ready = await f.service.prepare(w.prepare); assert.equal(ready.requestId, w.requestId);
    assert.equal(ready.shareAssetId, w.asset.assetId); assert.equal(ready.underlyingPrivateSpendable, false);
    assert.deepEqual(await f.service.prepare(w.prepare), await w.service.prepare(w.prepare));
    assert.equal(generationPrivateVaultExitActionTarget(f.runtime, f.service, 'execute', { requestId: w.requestId }), w.service);
  }
  await f.service.execute(old.requestId); await f.service.execute(next.requestId);
  assert.equal(old.sends, 1); assert.equal(next.sends, 1); assert.equal(keeperCreations - before, 2);
  assert.equal((await f.service.snapshot()).operations.length, 2);
});

test('unavailable successor leaves original prepare/requote/execute/reconcile and partial reopen callable', async () => {
  const f = await joined(), [old, next] = f.worlds; next.unavailable = true;
  const account = await f.session.snapshot(); assert.equal(account.storageAvailable, true);
  assert.ok(account.requests.some(r => r.requestId === next.requestId && r.state === 'UNKNOWN'));
  await f.service.prepare(old.prepare);
  await f.service.requote({ ...old.prepare, minimumOutput: '98', deadline: '1299' });
  await f.service.execute(old.requestId); await f.service.reconcile(old.requestId);
  assert.equal(old.sends, 1); assert.equal(next.sends, 0);
  const reopened = await f.service.reopen(); assert.equal(reopened.reopened, false);
  assert.equal(reopened.generationProjection.generations[0].status, 'AVAILABLE');
  assert.equal(reopened.generationProjection.generations[1].status, 'UNAVAILABLE');
  assert.equal(old.reopens, 1); assert.equal(next.reopens, 1);
  await f.service.execute(old.requestId); assert.equal(old.sends, 1);
  const view = await f.service.ownerView(); assert.equal(view.positions[0].status, 'LIVE');
  assert.equal(view.positions[1].status, 'UNAVAILABLE'); assert.equal(view.positions[1].availableShares, null);
});

test('lost original send retains durable UNKNOWN and one original nonce without a second send', async () => {
  const f = await joined(1), [old] = f.worlds; await f.service.prepare(old.prepare); old.loseSendReply = true;
  await assert.rejects(f.service.execute(old.requestId), /LOST_SEND_REPLY/);
  assert.equal((await f.service.snapshot()).operations[0].phase, 'REDEMPTION_UNRESOLVED');
  await assert.rejects(f.service.execute(old.requestId), /RECONCILE_REQUIRED/);
  await assert.rejects(f.service.requote({ ...old.prepare, minimumOutput: '98' }), /UNSUBMITTED_ONLY/);
  assert.equal((await f.service.reopen()).reopened, true);
  assert.equal((await f.service.reconcile(old.requestId)).phase, 'REDEEMED');
  await f.service.execute(old.requestId); assert.equal(old.sends, 1); assert.equal(old.actions.size, 1);
});

test('changed IDs, reused references, wrong original account body and foreign services fail closed', async () => {
  const f = await joined(), [old, next] = f.worlds;
  assert.throws(() => generationPrivateVaultExitActionTarget(f.runtime, f.service, 'execute', { requestId: 'unknown_request' }), /ORIGINAL_REQUEST/);
  await assert.rejects(f.catalogue.keeper.prepare({ ...Object.fromEntries(['requestId','kind','assetId','ownerOperationRef'].map(k=>[k,next.entry.request[k]])), requestId: old.requestId }), /REQUEST_ID_REUSE/);
  await assert.rejects(f.catalogue.keeper.prepare({ ...Object.fromEntries(['requestId','kind','assetId','ownerOperationRef'].map(k=>[k,next.entry.request[k]])), requestId: 'reused_reference', ownerOperationRef: old.entry.ownerOperationRef }), /OWNER_REFERENCE_REUSE/);
  const saved = old.entry.request.ownerOperationRef; old.entry.request.ownerOperationRef = h('changed-ref');
  await assert.rejects(f.service.prepare(old.prepare), /ORIGINAL_REQUEST_CHANGED/); old.entry.request.ownerOperationRef = saved;
  assert.equal(old.preparations, 0); assert.equal(old.sends, 0);
  const foreign = await fixture({ n: 9 });
  assert.throws(() => createGenerationPrivateVaultExit({ runtime: f.runtime, catalogue: f.catalogue, services: [foreign.service] }), /CAPABILITY_REQUIRED/);
  const sameRuntimeForeign = await fixture({ n: 8, runtime: f.runtime });
  assert.throws(() => createGenerationPrivateVaultExit({ runtime: f.runtime, catalogue: f.catalogue, services: [sameRuntimeForeign.service] }), /GENERATION_ACCOUNT/);
});

test('original position capabilities produce same-head floor estimates, never new underlying credit', async () => {
  const f = await joined(), [old, next] = f.worlds; old.totalAssets = '333';
  const view = await f.service.ownerView(), p = view.positions[0];
  assert.equal(p.estimatedRedeemableUnderlying, '33'); assert.equal(p.availableShares, '100');
  assert.equal(p.rounding, 'down'); assert.equal(p.underlyingSpendable, false); assert.equal(p.privateConversionAccepted, false);
  assert.equal(p.generationId, f.gens[0].capability.generationId);
  assert.equal(p.vault, old.binding.identity.vault); assert.equal(p.underlyingToken, old.binding.identity.asset);
  assert.deepEqual(p.observed, f.gens[0].observation);
  old.vaultHead = h('later-head'); const stale = (await f.service.ownerView()).positions[0];
  assert.equal(stale.status, 'STALE'); assert.equal(stale.availableShares, null); assert.equal(stale.estimatedRedeemableUnderlying, null);
  next.unavailable = true; assert.equal((await f.service.ownerView()).positions[1].status, 'UNAVAILABLE');
});

async function http(app, action, body, token) {
  const route = '/api/wallet/defi/' + action;
  const response = await fetch(app.origin + route, { method: 'POST', headers: { origin: app.origin,
    'content-type': 'application/json', 'x-wallet-action-token': token }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
test('actual exact-only HTTP and shared SDK keep original service target, body, recovery and no replay', async t => {
  const f = await joined(), [old, next] = f.worlds;
  const app = await startWalletApplication({ accountSession: f.session, defiExit: { runtime: f.runtime, service: f.service }, actionAccessMode: 'exact-only' });
  t.after(() => app.close());
  const first = app.issueActionCapability({ action: 'defiPrepare', body: old.prepare });
  const changed = await http(app, 'prepare', { ...old.prepare, minimumOutput: '98' }, first.token); assert.equal(changed.status, 403);
  const sdk = createWalletApplicationClient({ origin: app.origin, ownerToken: app.ownerAccess.token, actionToken: first.token });
  await sdk.refresh(); assert.ok(sdk.getState().data.defi.positions);
  assert.equal(sdk.review('defiPrepare', old.prepare).action, 'defiPrepare'); assert.equal(await sdk.confirm(), true);
  assert.equal(old.preparations, 1); assert.equal((await http(app, 'prepare', old.prepare, first.token)).status, 403);
  next.unavailable = true;
  const access = app.issueActionCapability({ action: 'defiExecute', body: { requestId: old.requestId } });
  assert.equal((await http(app, 'execute', { requestId: old.requestId }, access.token)).body.phase, 'REDEEMED');
  const recovery = app.issueActionCapability({ action: 'defiReconcile', body: { requestId: old.requestId } });
  const result = await http(app, 'reconcile', { requestId: old.requestId }, recovery.token);
  assert.equal(result.status, 200); assert.equal(result.body.underlyingPrivateSpendable, false); assert.equal(old.sends, 1);
});

test('app rejects a genuine but different catalogue session and structural service copy', async () => {
  const f = await joined(1), other = await joined(1, true, f.runtime);
  assert.equal(f.runtime, other.runtime); assert.notEqual(f.catalogue, other.catalogue);
  await assert.rejects(startWalletApplication({ accountSession: other.session,
    defiExit: { runtime: f.runtime, service: f.service } }), /ORIGINAL_CATALOGUE_SESSION_REQUIRED/);
  await assert.rejects(startWalletApplication({ accountSession: f.session,
    defiExit: { runtime: f.runtime, service: { ...f.service } } }), /CAPABILITY_REQUIRED/);
});

test('an issued empty-body reopen grant and caller array cannot expand after catalogue append', async t => {
  const f = await joined(1), [old] = f.worlds, inputServices = [old.service];
  const fixed = createGenerationPrivateVaultExit({ runtime: f.runtime, catalogue: f.catalogue, services: inputServices });
  const app = await startWalletApplication({ accountSession: f.session, defiExit: { runtime: f.runtime, service: fixed }, actionAccessMode: 'exact-only' });
  t.after(() => app.close());
  const token = app.issueActionCapability({ action: 'defiReopen', body: {} });
  const next = await fixture({ n: 2, runtime: f.runtime }), g = await generation(next, 2);
  await f.catalogue.appendGeneration(g.capability); inputServices.push(next.service);
  await f.catalogue.keeper.prepare(Object.fromEntries(['requestId','kind','assetId','ownerOperationRef'].map(k=>[k,next.entry.request[k]])));
  const response = await http(app, 'reopen', {}, token.token);
  assert.equal(response.status, 200); assert.equal(response.body.reopened, true);
  assert.equal(response.body.generationProjection.generations.length, 1);
  assert.equal(old.reopens, 1); assert.equal(next.reopens, undefined); assert.equal(next.sends, 0);
  assert.throws(() => app.issueActionCapability({ action: 'defiPrepare', body: next.prepare }), /CAPABILITY_INVALID/);
  assert.equal((await fixed.ownerView()).positions.length, 1);
});

test('uncertain durable original service write is unavailable, then only exact surviving reopen restores it', async () => {
  const f = await joined(1), [old] = f.worlds;
  failReadback = true; await assert.rejects(f.service.prepare(old.prepare), /LOST_DURABLE_READBACK/);
  const snapshot = await f.service.snapshot(); assert.equal(snapshot.operations.length, 0);
  assert.equal(snapshot.generationProjection.generations[0].status, 'UNAVAILABLE');
  assert.equal(snapshot.generationProjection.generations[0].requestIds, null);
  await assert.rejects(f.service.execute(old.requestId), /STORAGE_UNAVAILABLE/); assert.equal(old.sends, 0);
  assert.equal((await f.service.reopen()).reopened, true);
  await f.service.prepare(old.prepare); await f.service.execute(old.requestId);
  assert.equal(old.preparations, 1); assert.equal(old.sends, 1);
});

test('without an original same-generation underlying registry capability no metadata or estimate is invented', async () => {
  const f = await joined(1, false), position = (await f.service.ownerView()).positions[0];
  assert.equal(position.status, 'UNAVAILABLE'); assert.equal(position.underlyingAssetId, null);
  assert.equal(position.errorCode, 'PRIVATE_VAULT_GENERATION_UNDERLYING_NOT_REGISTERED');
  assert.equal(position.availableShares, null); assert.equal(position.estimatedRedeemableUnderlying, null);
  assert.equal(position.observed, null); assert.equal(Object.hasOwn(position, 'symbol'), false);
  assert.equal(Object.hasOwn(position, 'decimals'), false);
});
