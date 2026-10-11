/** Host-only manual lifecycle tests. Native/account/vault capabilities and RPC
 * evidence are explicitly mocked before import; the workflow uses its actual
 * encrypted journal and real W39 codec. No node, proof, compiler or send runs. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bindGenericAccountRequest, genericAccountIdentity } from '@lianum/engine/accounts/journal';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault as RealVault } from '@lianum/engine/crypto/vault';
import { encodeWalletPoolInputs } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from '../../../src/execution/encoding/transaction-codec.mjs';
import { LOCAL_EVM_PROFILE } from '../../../src/chains/evm/runtime/local-evm-profiles.mjs';
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
mock.module('../chain-adapters/local-evm-ownership.mjs', { exports: {
  assertLocalEvm: async runtime => assert.ok(worlds.has(runtime), 'MOCK_OWNED_RUNTIME'),
  async assertLocalEvmDeploymentProfile(runtime) {
    assert.equal(arguments.length, 1);
    assert.ok(worlds.has(runtime), 'MOCK_OWNED_RUNTIME');
    assert.deepEqual(runtime.metadata.profile, LOCAL_EVM_PROFILE, 'HOST_FIXED_CANCUN_PROFILE');
    return LOCAL_EVM_PROFILE;
  },
} });
mock.module('../ops/deploy-system.mjs', { exports: {
  assertOwnedFlatSystem: (runtime, system) => assert.equal(bySystem.get(system)?.runtime, runtime, 'MOCK_OWNED_SYSTEM'),
  describeOwnedFlatPoolRegistry() { throw Error('HOST_UNEXPECTED_REAL_REGISTRY_READ'); },
  deployFlatSystem() { throw Error('HOST_UNEXPECTED_REAL_SYSTEM_DEPLOYMENT'); },
  deployFlatAppendOnlySystem() { throw Error('HOST_UNEXPECTED_REAL_SYSTEM_DEPLOYMENT'); },
  appendFlatPoolSuccessor() { throw Error('HOST_UNEXPECTED_REAL_SYSTEM_DEPLOYMENT'); },
  flatRecoveryViewDataV1() { throw Error('HOST_UNEXPECTED_REAL_SYSTEM_RECOVERY'); },
  captureOwnedFlatSystemRecoveryV1() { throw Error('HOST_UNEXPECTED_REAL_SYSTEM_RECOVERY'); },
  reopenOwnedFlatSystemRecoveryV1() { throw Error('HOST_UNEXPECTED_REAL_SYSTEM_RECOVERY'); },
} });
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
  bindFlatPortfolioChildRequest() { throw Error('HOST_UNEXPECTED_WRAPPED_PORTFOLIO_ROUTE'); },
  projectFlatPortfolioOutcome() { throw Error('HOST_UNEXPECTED_WRAPPED_PORTFOLIO_ROUTE'); },
  createFlatPortfolioAuthority() { throw Error('HOST_UNEXPECTED_REAL_PORTFOLIO_CREATION'); },
  claimFlatPortfolioJournalAuthority() { throw Error('HOST_UNEXPECTED_REAL_PORTFOLIO_CREATION'); },
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
  world.runtime = { metadata: { scratchDirectory, profile: LOCAL_EVM_PROFILE }, async transaction(hash) { assert.equal(hash, world.transaction.hash); return clone(world.transaction); },
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
mock.module('../api/native-claim-session.mjs', { exports: { assertWalletClaimSession() { throw Error('UNUSED_NATIVE_SESSION'); }, walletClaimSessionIdentity() { throw Error('UNUSED_NATIVE_SESSION'); }, assertNativeClaimSession() { throw Error('UNUSED_NATIVE_SESSION'); }, nativeClaimSessionIdentity() { throw Error('UNUSED_NATIVE_SESSION'); } } });
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


const { createManualWalletAppDriver } = await import('../../../../../tests/integration/wallet/manual/manual-wallet-app-driver.mjs');
test('new fixed acceptance driver uses SDK and exact grants for original generation DeFi lifecycle', async t => {
 const f = await joined(1), w = f.worlds[0];
 const app = await startWalletApplication({ accountSession: f.session, defiExit: { runtime: f.runtime, service: f.service }, actionAccessMode: 'exact-only' });
 t.after(async () => { await app.close(); await f.session.close(); });
 const driver = createManualWalletAppDriver(app, { deadlineMs: Date.now() + 20_000 });
 assert.equal((await driver.defi('prepare', w.prepare)).phase, 'READY_TO_REDEEM');
 assert.equal((await driver.defi('execute', { requestId: w.requestId })).phase, 'REDEEMED');
 assert.equal((await driver.defi('reopen', {})).reopened, true);
 assert.equal((await driver.defi('prepare', w.prepare)).phase, 'REDEEMED');
 assert.equal((await driver.defi('reconcile', { requestId: w.requestId })).phase, 'REDEEMED');
 await driver.duplicateDefiExecute(w.requestId);
 assert.equal(w.sends, 1); assert.equal(w.preparations, 1);
 for (const action of ['defiPrepare','defiExecute','defiReconcile','defiReopen'])
   assert.ok(driver.evidence().some(row => row.action === action && row.check === 'USED_EXACT_GRANT_REJECTED'));
});
test('a single original DeFi service reopens without inventing a generation projection or repeating redemption', async t => {
 const f = await joined(1), w = f.worlds[0];
 const app = await startWalletApplication({ accountSession: f.session,
   defiExit: { runtime: f.runtime, service: w.service }, actionAccessMode: 'exact-only' });
 t.after(async () => { await app.close(); await f.session.close(); });
 const driver = createManualWalletAppDriver(app, { deadlineMs: Date.now() + 20_000 });
 assert.equal((await driver.defi('prepare', w.prepare)).phase, 'READY_TO_REDEEM');
 assert.equal((await driver.defi('execute', { requestId: w.requestId })).phase, 'REDEEMED');
 const reopened = await driver.defi('reopen', {});
 assert.equal(reopened.reopened, true);
 assert.deepEqual(reopened.requestIds, [w.requestId]);
 assert.equal(Object.hasOwn(reopened, 'generationProjection'), false);
 assert.equal((await driver.defi('reconcile', { requestId: w.requestId })).phase, 'REDEEMED');
 await driver.duplicateDefiExecute(w.requestId);
 assert.equal(w.sends, 1); assert.equal(w.preparations, 1);
 assert.ok(driver.evidence().some(row => row.action === 'defiReopen' && row.check === 'USED_EXACT_GRANT_REJECTED'));
});
test('lost original DeFi send remains one original UNKNOWN send, never an SDK automatic resend', async t => {
 const f = await joined(1), w = f.worlds[0];
 const app = await startWalletApplication({ accountSession: f.session, defiExit: { runtime: f.runtime, service: f.service }, actionAccessMode: 'exact-only' });
 t.after(async () => { await app.close(); await f.session.close(); });
 const driver = createManualWalletAppDriver(app, { deadlineMs: Date.now() + 20_000 });
 await driver.defi('prepare', w.prepare); w.loseSendReply = true;
 await assert.rejects(driver.defi('execute', { requestId: w.requestId }), /ORIGINAL_OUTCOME_UNKNOWN/);
 const unresolved = (await driver.state()).defi.snapshot.operations.find(row => row.requestId === w.requestId);
 assert.equal(unresolved.phase, 'REDEMPTION_UNRESOLVED'); assert.equal(w.sends, 1);
 await assert.rejects(driver.defi('execute', { requestId: w.requestId }), /READY_TO_REDEEM/);
 assert.equal(w.sends, 1);
 assert.equal((await driver.defi('reconcile', { requestId: w.requestId })).phase, 'REDEEMED'); assert.equal(w.sends, 1);
});
