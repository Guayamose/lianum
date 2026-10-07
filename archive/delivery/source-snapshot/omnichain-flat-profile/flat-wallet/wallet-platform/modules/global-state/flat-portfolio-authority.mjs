/** One account journal over independently backed pools in the same owned EVM.
 * Routing changes request bindings, never amounts, proofs, destinations or
 * original outcomes. Each child remains the authority for its own asset. */
import assert from 'node:assert/strict';
import { bindGenericAccountRequest, validateBoundRequest, validateGenericAccountConfig,
  genericAccountIdentity, validateOutcome, immutable, sha }
  from '../../../../../omnichain-product/src/paeg/generic-account-journal.mjs';
import { assertOwnedFlatSystem } from '../ops/deploy-system.mjs';
import { exactRecord, fixedArray } from '../paeg/commitments.mjs';
import { assertOwnedFlatAccountAuthority } from './flat-account-authority.mjs';
import { assertOwnedFlatManualPortfolioKeeper } from './flat-manual-portfolio-keeper.mjs';
import { validateFlatManualReauthorization } from '../../../mobile-core/flat-owner-manual-binding.mjs';
import { assertOwnedFlatPoolAdmissionPolicy } from './flat-pool-admission-policy.mjs';

const profile = 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1';
const inputFields = ['requestId', 'kind', 'assetId', 'ownerOperationRef'];
const owned = new WeakMap(), journalClaims = new WeakSet();
export function assertOwnedFlatPortfolio(runtime, portfolio) {
  assert.ok(owned.get(portfolio)?.runtime === runtime && owned.has(portfolio), 'FLAT_PORTFOLIO_OWNED_CAPABILITY_REQUIRED');
}

/** Exact original live child capability; never a descriptor or asset alias. */
export function assertOwnedFlatPortfolioAccount(portfolio, account) {
  const retained = owned.get(portfolio); assert.ok(retained, 'FLAT_PORTFOLIO_OWNED_CAPABILITY_REQUIRED');
  retained.healthy(); assert.ok(retained.accounts.some(child => child.account === account), 'FLAT_PORTFOLIO_ORIGINAL_ACCOUNT_REQUIRED');
}

/** Pure routing check. This does not confer an owned account capability. */
export function bindFlatPortfolioChildRequest(request, portfolioConfig, childConfig) {
  const outer = validateBoundRequest(request, portfolioConfig);
  const registryEntry = portfolioConfig.registry.find(asset => asset.assetId === outer.assetId);
  assert.equal(childConfig.registry.length, 1, 'FLAT_PORTFOLIO_SINGLE_CHILD_ASSET');
  assert.deepEqual(childConfig.registry[0], registryEntry, 'FLAT_PORTFOLIO_ASSET_ROUTE');
  return bindGenericAccountRequest(Object.fromEntries(inputFields.map(key => [key, outer[key]])), childConfig);
}

/** Original included outcome, rebound to the outer journal's exact request.
 * No source amount, status or alleged receipt supplied by HTTP is accepted. */
export function projectFlatPortfolioOutcome(outer, inner, childOutcome) {
  const accepted = validateOutcome(childOutcome, inner);
  assert.equal(outer.assetId, inner.assetId, 'FLAT_PORTFOLIO_ASSET_ROUTE');
  assert.equal(outer.assetBindingSHA256, inner.assetBindingSHA256, 'FLAT_PORTFOLIO_ASSET_ROUTE');
  for (const name of inputFields) assert.equal(outer[name], inner[name], 'FLAT_PORTFOLIO_REQUEST_CHANGED');
  return immutable({ ...accepted, bindingSHA256: outer.bindingSHA256,
    outcomeId: sha({ profile, bindingSHA256: outer.bindingSHA256, childOutcome: accepted }) });
}

/** PRIVATE bootstrap. Every entry is an existing branded authority, not a
 * callback/factory/serialized state. The original EVM and children survive. */
export function createFlatPortfolioAuthority(options) {
  exactRecord(options, ['runtime', 'system', 'accounts', 'accountId', 'journalId',
    ...(Object.hasOwn(options, 'poolAdmissions') ? ['poolAdmissions'] : [])]);
  const { runtime, system, accountId, journalId } = options;
  assertOwnedFlatSystem(runtime, system);
  const poolAdmissions = options.poolAdmissions ?? null;
  if (poolAdmissions) assertOwnedFlatPoolAdmissionPolicy(poolAdmissions, { runtime, system, accounts: options.accounts });
  assert.ok(Array.isArray(options.accounts) && options.accounts.length >= 1 && options.accounts.length <= 2,
    'FLAT_PORTFOLIO_POOL_COUNT');
  fixedArray(options.accounts, options.accounts.length);
  const indexes = new Set(), routes = new Map();
  const accounts = options.accounts.map(entry => {
    exactRecord(entry, ['poolIndex', 'account']);
    assert.ok((entry.poolIndex === 0 || entry.poolIndex === 1) && !indexes.has(entry.poolIndex),
      'FLAT_PORTFOLIO_DISTINCT_POOLS');
    indexes.add(entry.poolIndex);
    assertOwnedFlatAccountAuthority(entry.account, { runtime, system, poolIndex: entry.poolIndex });
    const childConfig = validateGenericAccountConfig(entry.account.config);
    assert.equal(childConfig.registry.length, 1, 'FLAT_PORTFOLIO_SINGLE_CHILD_ASSET');
    const asset = childConfig.registry[0];
    assert.ok(!routes.has(asset.assetId), 'FLAT_PORTFOLIO_DUPLICATE_ASSET');
    const child = { account: entry.account, poolIndex: entry.poolIndex, config: childConfig, asset };
    routes.set(asset.assetId, child); return child;
  });
  const config = validateGenericAccountConfig({ accountId, journalId,
    lifetime: sha({ profile, bootstrap: system.bootstrap,
      children: accounts.map(({ poolIndex, config }) => ({ poolIndex, identity: genericAccountIdentity(config) })) }),
    registry: accounts.map(child => child.asset) });
  const identity = genericAccountIdentity(config);
  let busy = false, closed = false;
  function healthy() {
    assert.ok(!closed, 'FLAT_PORTFOLIO_CLOSED'); assertOwnedFlatSystem(runtime, system);
    for (const child of accounts)
      assertOwnedFlatAccountAuthority(child.account, { runtime, system, poolIndex: child.poolIndex });
  }
  async function exclusive(work) {
    healthy(); assert.equal(busy, false, 'FLAT_PORTFOLIO_BUSY'); busy = true;
    try { return await work(); } finally { busy = false; }
  }
  function route(raw) {
    const outer = validateBoundRequest(raw, config), child = routes.get(outer.assetId);
    assert.ok(child, 'FLAT_PORTFOLIO_ASSET_ROUTE');
    const inner = bindFlatPortfolioChildRequest(outer, config, child.config);
    return { outer, inner, child };
  }
  async function original(method, raw) {
    const { outer, inner, child } = route(raw);
    const outcome = await child.account.authority[method](inner);
    return projectFlatPortfolioOutcome(outer, inner, outcome);
  }
  let mixedKeeper = null;
  const mixedReceipts = new WeakMap();
  function linkedKeeper(keeper) {
    assertOwnedFlatManualPortfolioKeeper(keeper, { runtime, portfolio });
    assert.equal(keeper, mixedKeeper, 'FLAT_PORTFOLIO_ORIGINAL_KEEPER_REQUIRED');
  }
  function validateStoredManualReceipt(data, raw) {
    const { outer, inner, child } = route(raw);
    exactRecord(data, ['version', 'type', 'ownerIdentitySHA256', 'accountIdentitySHA256', 'request', 'generation',
      'epoch', 'authorizationSHA256', 'evidence', 'childBinding']);
    assert.equal(data.version, 1); assert.ok(['NO_DISPATCH_REAUTHORIZATION_REQUIRED', 'PREPARED'].includes(data.type));
    assert.deepEqual(data.request, outer); assert.equal(data.accountIdentitySHA256, sha(identity));
    exactRecord(data.childBinding, ['accountIdentitySHA256', 'requestBindingSHA256', 'poolIndex', 'receiptSHA256']);
    assert.equal(data.childBinding.accountIdentitySHA256, sha(genericAccountIdentity(child.config)));
    assert.equal(data.childBinding.requestBindingSHA256, inner.bindingSHA256); assert.equal(data.childBinding.poolIndex, child.poolIndex);
    const { childBinding, ...base } = data;
    const childData = { ...base, request: inner, accountIdentitySHA256: childBinding.accountIdentitySHA256 };
    assert.equal(sha(childData), childBinding.receiptSHA256, 'FLAT_PORTFOLIO_MANUAL_RECEIPT_CHANGED');
    assert.ok(['TOP_UP', 'EXIT'].includes(inner.kind), 'FLAT_PORTFOLIO_GRAPH_REAUTHORIZATION_FORBIDDEN');
    assert.ok(Number.isInteger(data.generation) && data.generation >= 0 && data.generation <= 8);
    if (data.type === 'NO_DISPATCH_REAUTHORIZATION_REQUIRED') {
      const e = data.evidence;
      exactRecord(e, ['version', 'profile', 'bindingSHA256', 'ownerIdentitySHA256', 'accountIdentitySHA256', 'generation',
        'authorizationSHA256', 'epoch', 'observedEpoch', 'reason']);
      assert.equal(e.version, 1); assert.equal(e.profile, 'FLAT_MANUAL_NO_DISPATCH_V1');
      assert.equal(e.bindingSHA256, inner.bindingSHA256); assert.equal(e.accountIdentitySHA256, childBinding.accountIdentitySHA256);
      for (const key of ['ownerIdentitySHA256', 'generation', 'authorizationSHA256', 'epoch']) assert.equal(e[key], data[key]);
      assert.equal(e.reason, 'EPOCH_EXPIRED_BEFORE_ORIGINAL_SUBMISSION'); assert.ok(BigInt(e.observedEpoch) > BigInt(e.epoch));
    } else if (data.generation > 0) {
      const a = data.evidence.authorization;
      validateFlatManualReauthorization(a); assert.equal(a.accountIdentitySHA256, childBinding.accountIdentitySHA256);
      assert.equal(sha(a), data.authorizationSHA256); assert.equal(a.revision, data.generation); assert.equal(a.epoch, data.epoch);
      for (const key of inputFields) assert.equal(a.request[key], outer[key]);
      assert.equal(data.evidence.previousNoDispatch.bindingSHA256, inner.bindingSHA256);
    }
    return immutable(data);
  }
  function wrapManualReceipt(outer, inner, child, receipt) {
    const source = receipt.data;
    assert.deepEqual(source.request, inner);
    assert.equal(source.accountIdentitySHA256, sha(genericAccountIdentity(child.config)));
    const data = validateStoredManualReceipt({ ...source, request: outer, accountIdentitySHA256: sha(identity), childBinding: {
      accountIdentitySHA256: source.accountIdentitySHA256, requestBindingSHA256: inner.bindingSHA256,
      poolIndex: child.poolIndex, receiptSHA256: sha(source) } }, outer);
    const wrapped = Object.freeze({ data, toJSON() { throw Error('FLAT_PORTFOLIO_RECEIPT_NOT_SERIALIZABLE'); } });
    mixedReceipts.set(wrapped, { outer, inner, child, receipt }); return wrapped;
  }
  function projectMixedResult(binding, result) {
    const { outer, inner, child } = binding;
    if (result.type === 'CONFIRMED') return { type: 'CONFIRMED', outcome: projectFlatPortfolioOutcome(outer, inner, result.outcome) };
    if (result.type === 'UNKNOWN') { assert.equal(result.receipt, null); return { type: 'UNKNOWN', receipt: null }; }
    assert.ok(['NO_DISPATCH_REAUTHORIZATION_REQUIRED', 'PREPARED'].includes(result.type));
    assert.ok(['TOP_UP', 'EXIT'].includes(outer.kind)); assert.equal(result.receipt.data.type, result.type);
    return { type: result.type, receipt: wrapManualReceipt(outer, inner, child, result.receipt) };
  }
  const manualLifecycle = Object.freeze({
    bindKeeper: keeper => {
      assertOwnedFlatManualPortfolioKeeper(keeper, { runtime, portfolio });
      assert.ok(mixedKeeper === null || mixedKeeper === keeper, 'FLAT_PORTFOLIO_KEEPER_ALREADY_BOUND');
      for (const child of accounts) child.account.manualLifecycle.assertCanBindPortfolioKeeper({ keeper, portfolio });
      for (const child of accounts) child.account.manualLifecycle.bindPortfolioKeeper({ keeper, portfolio });
      mixedKeeper = keeper;
    },
    validateStoredReceiptData: (data, request) => validateStoredManualReceipt(data, request),
    prepare: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedKeeper(input.keeper); const binding = route(input.request);
      const { inner, child } = binding;
      if (poolAdmissions) await poolAdmissions.beforePrepare(binding.outer);
      let prepared;
      if (inner.kind === 'GRAPH') prepared = await child.account.manualLifecycle.graphPrepare({ keeper: input.keeper, request: inner });
      else { await child.account.manualLifecycle.prepare({ keeper: input.keeper, request: inner });
        prepared = { version: 1, state: 'PREPARED', bindingSHA256: inner.bindingSHA256, assetBindingSHA256: inner.assetBindingSHA256 }; }
      exactRecord(prepared, ['version', 'state', 'bindingSHA256', 'assetBindingSHA256']);
      assert.equal(prepared.version, 1); assert.equal(prepared.state, 'PREPARED');
      assert.equal(prepared.bindingSHA256, inner.bindingSHA256); assert.equal(prepared.assetBindingSHA256, inner.assetBindingSHA256);
      return { version: 1, state: 'PREPARED', bindingSHA256: binding.outer.bindingSHA256, assetBindingSHA256: binding.outer.assetBindingSHA256 };
    }),
    execute: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request', 'generation']); linkedKeeper(input.keeper); const binding = route(input.request);
      const { inner, child } = binding;
      if (poolAdmissions) await poolAdmissions.beforeExecute(binding.outer);
      if (inner.kind === 'GRAPH') {
        assert.equal(input.generation, 0);
        const outcome = await child.account.manualLifecycle.graphExecute({ keeper: input.keeper, request: inner });
        return { type: 'CONFIRMED', outcome: projectFlatPortfolioOutcome(binding.outer, inner, outcome) };
      }
      return projectMixedResult(binding, await child.account.manualLifecycle.execute({ ...input, request: inner }));
    }),
    observeOriginal: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedKeeper(input.keeper); const binding = route(input.request);
      const { inner, child } = binding;
      if (inner.kind === 'GRAPH') {
        const outcome = await child.account.manualLifecycle.graphReconcile({ keeper: input.keeper, request: inner });
        return { type: 'CONFIRMED', outcome: projectFlatPortfolioOutcome(binding.outer, inner, outcome) };
      }
      return projectMixedResult(binding, await child.account.manualLifecycle.observeOriginal({ keeper: input.keeper, request: inner }));
    }),
    recover: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedKeeper(input.keeper); const { outer, inner, child } = route(input.request);
      assert.equal(inner.kind, 'GRAPH');
      const outcome = await child.account.manualLifecycle.graphRecover({ keeper: input.keeper, request: inner });
      return { type: 'CONFIRMED', outcome: projectFlatPortfolioOutcome(outer, inner, outcome) };
    }),
    observe: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request', 'outcome', 'challenge']); linkedKeeper(input.keeper);
      const { outer, inner, child } = route(input.request);
      const childResult = inner.kind === 'GRAPH'
        ? { type: 'CONFIRMED', outcome: await child.account.manualLifecycle.graphReconcile({ keeper: input.keeper, request: inner }) }
        : await child.account.manualLifecycle.observeOriginal({ keeper: input.keeper, request: inner });
      assert.equal(childResult.type, 'CONFIRMED');
      assert.deepEqual(input.outcome, projectFlatPortfolioOutcome(outer, inner, childResult.outcome), 'FLAT_PORTFOLIO_OUTCOME_CHANGED');
      const observed = await child.account.authority.observe({ request: inner, outcome: childResult.outcome, challenge: input.challenge });
      assert.equal(observed.bindingSHA256, inner.bindingSHA256); assert.equal(observed.assetBindingSHA256, inner.assetBindingSHA256);
      assert.equal(observed.outcomeId, childResult.outcome.outcomeId); assert.equal(observed.canonicalOutcomeBlockHash, childResult.outcome.blockHash);
      return { ...observed, bindingSHA256: outer.bindingSHA256, outcomeId: input.outcome.outcomeId };
    }),
    verifyReceipt: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'receipt']); linkedKeeper(input.keeper);
      const b = mixedReceipts.get(input.receipt); assert.ok(b, 'FLAT_PORTFOLIO_ORIGINAL_RECEIPT_REQUIRED');
      const current = await b.child.account.manualLifecycle.verifyReceipt({ keeper: input.keeper, receipt: b.receipt });
      assert.deepEqual(current, b.receipt.data);
      const expected = wrapManualReceipt(b.outer, b.inner, b.child, b.receipt);
      assert.deepEqual(input.receipt.data, expected.data); return immutable(expected.data);
    }),
    reviewReauthorization: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedKeeper(input.keeper); const { inner, child } = route(input.request);
      assert.ok(['TOP_UP', 'EXIT'].includes(inner.kind), 'FLAT_PORTFOLIO_GRAPH_REAUTHORIZATION_FORBIDDEN');
      return child.account.manualLifecycle.reviewReauthorization({ keeper: input.keeper, request: inner });
    }),
    reauthorize: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request', 'authorization']); linkedKeeper(input.keeper); const binding = route(input.request);
      assert.ok(['TOP_UP', 'EXIT'].includes(binding.inner.kind), 'FLAT_PORTFOLIO_GRAPH_REAUTHORIZATION_FORBIDDEN');
      return projectMixedResult(binding, await binding.child.account.manualLifecycle.reauthorize({ ...input, request: binding.inner }));
    }),
  });

  const authority = Object.freeze({
    assertAuthority: expected => exclusive(async () => {
      assert.ok(mixedKeeper === null, 'FLAT_PORTFOLIO_ORIGINAL_MIXED_KEEPER_REQUIRED');
      assert.deepEqual(expected, identity, 'FLAT_PORTFOLIO_JOURNAL_IDENTITY');
      for (const child of accounts) {
        const observed = await child.account.authority.assertAuthority(genericAccountIdentity(child.config));
        assert.equal(observed.available, true, 'FLAT_PORTFOLIO_CHILD_UNAVAILABLE');
      }
      return { version: 1, available: true, identity };
    }),
    prepare: raw => exclusive(async () => {
      assert.ok(mixedKeeper === null, 'FLAT_PORTFOLIO_ORIGINAL_MIXED_KEEPER_REQUIRED');
      const { outer, inner, child } = route(raw);
      if (poolAdmissions) await poolAdmissions.beforePrepare(outer);
      const prepared = await child.account.authority.prepare(inner);
      assert.equal(prepared.state, 'PREPARED'); assert.equal(prepared.bindingSHA256, inner.bindingSHA256);
      assert.equal(prepared.assetBindingSHA256, inner.assetBindingSHA256);
      return { version: 1, state: 'PREPARED', bindingSHA256: outer.bindingSHA256,
        assetBindingSHA256: outer.assetBindingSHA256 };
    }),
    execute: raw => exclusive(async () => {
      assert.ok(mixedKeeper === null, 'FLAT_PORTFOLIO_ORIGINAL_MIXED_KEEPER_REQUIRED');
      const { outer } = route(raw);
      if (poolAdmissions) await poolAdmissions.beforeExecute(outer);
      return original('execute', raw);
    }),
    reconcile: raw => exclusive(() => { assert.ok(mixedKeeper === null, 'FLAT_PORTFOLIO_ORIGINAL_MIXED_KEEPER_REQUIRED'); return original('reconcile', raw); }),
    recover: raw => exclusive(() => { assert.ok(mixedKeeper === null, 'FLAT_PORTFOLIO_ORIGINAL_MIXED_KEEPER_REQUIRED'); return original('recover', raw); }),
    observe: input => exclusive(async () => {
      assert.ok(mixedKeeper === null, 'FLAT_PORTFOLIO_ORIGINAL_MIXED_KEEPER_REQUIRED');
      exactRecord(input, ['request', 'outcome', 'challenge']);
      const { outer, inner, child } = route(input.request);
      const childOutcome = await child.account.authority.reconcile(inner);
      assert.deepEqual(input.outcome, projectFlatPortfolioOutcome(outer, inner, childOutcome),
        'FLAT_PORTFOLIO_OUTCOME_CHANGED');
      const observation = await child.account.authority.observe({ request: inner,
        outcome: childOutcome, challenge: input.challenge });
      assert.equal(observation.bindingSHA256, inner.bindingSHA256);
      assert.equal(observation.assetBindingSHA256, inner.assetBindingSHA256);
      assert.equal(observation.outcomeId, childOutcome.outcomeId);
      assert.equal(observation.canonicalOutcomeBlockHash, childOutcome.blockHash);
      return { ...observation, bindingSHA256: outer.bindingSHA256, outcomeId: input.outcome.outcomeId };
    }),
  });
  const portfolio = Object.freeze({ config, registry: config.registry, authority, manualLifecycle,
    async ownerView() { return exclusive(async () => {
      const assets = [];
      for (const child of accounts) {
        const view = await child.account.ownerView();
        assert.equal(view.asset.assetId, child.asset.assetId, 'FLAT_PORTFOLIO_VIEW_ASSET');
        assert.equal(view.asset.symbol, child.asset.symbol); assert.equal(view.asset.decimals, child.asset.decimals);
        assets.push(view);
      }
      const observed = assets.filter(view => view.observed !== null);
      const coherent = observed.length === assets.length && observed.every(view =>
        view.observed.blockHash === observed[0].observed.blockHash
        && view.observed.blockNumber === observed[0].observed.blockNumber
        && view.observed.timestamp === observed[0].observed.timestamp);
      const status = observed.length === 0 ? 'UNAVAILABLE' : observed.length < assets.length ? 'PARTIAL'
        : coherent && assets.every(view => view.status === 'LIVE') ? 'LIVE' : 'STALE';
      return immutable({ version: 1, profile, status, coherent,
        observed: coherent ? observed[0].observed : null, assets,
        capabilities: { coordinatorRestart: true, keeperRestart: false, crossAssetAtomicConversion: false,
          privateDeFiComposability: false, fullWalletAcceptance: false } });
    }); },
    async abort() { await Promise.allSettled(accounts.map(child => child.account.abort())); },
    close() { assert.equal(busy, false, 'FLAT_PORTFOLIO_BUSY'); closed = true;
      return { closed: true, originalChildrenRetained: true }; },
  });
  owned.set(portfolio, { runtime, system, accounts, healthy }); return portfolio;
}

/** V2 generation factory owns the only keeper it creates over these children.
 * A failed/uncertain creation retains the lease; no replacement keeper is minted.
 * Existing raw V1 keepers cannot be adopted or serialized into this path. */
export function claimFlatPortfolioJournalAuthority(runtime, portfolio) {
  assertOwnedFlatPortfolio(runtime, portfolio);
  const state = owned.get(portfolio); state.healthy();
  assert.ok(state.accounts.every(child => !journalClaims.has(child.account)), 'FLAT_CATALOGUE_AUTHORITY_ALREADY_CLAIMED');
  for (const child of state.accounts) journalClaims.add(child.account);
  return Object.freeze({ runtime, system: state.system,
    accounts: Object.freeze(state.accounts.map(child => Object.freeze({ poolIndex: child.poolIndex, account: child.account }))) });
}

/** Private inspection for the versioned generation factory. This confers no
 * keeper lease and accepts only the genuine original portfolio capability. */
export function describeFlatPortfolioJournalAuthority(runtime, portfolio) {
  assertOwnedFlatPortfolio(runtime, portfolio);
  const state = owned.get(portfolio);
  return Object.freeze({ runtime, system: state.system,
    accounts: Object.freeze(state.accounts.map(child => Object.freeze({ poolIndex: child.poolIndex, account: child.account }))) });
}
