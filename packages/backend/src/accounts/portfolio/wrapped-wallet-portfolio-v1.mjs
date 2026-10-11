import { assertWrappedWalletAccountReleasedV1 } from '../../operations/releases/wrapped/wrapped-wallet-release-v1.mjs';
/** One genuine wrapped two-pool authority over the existing generic account
 * keeper protocol. Immutable routing binds exact existing accounts and assets;
 * it does not create new notes, migrate journals or grant a legacy brand. */
import assert from 'node:assert/strict';
import { validateBoundRequest, validateGenericAccountConfig,
  genericAccountIdentity, validateOutcome, immutable, sha } from '@lianum/engine/accounts/journal';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';
import { bindFlatPortfolioChildRequest } from '../authority/flat-portfolio-authority.mjs';
import { assertOwnedWrappedClaimWalletSystemV1 } from '../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs';
import { assertOwnedWrappedWalletAccountAuthorityV1 } from '../authority/wrapped-wallet-account-authority-v1.mjs';
export const WRAPPED_WALLET_PORTFOLIO_PROFILE_V1 = 'OWNED_WRAPPED_WALLET_PORTFOLIO_V1';
const owned = new WeakMap(), claimed = new WeakSet();
export function assertOwnedWrappedWalletPortfolioV1(runtime, portfolio) {
  const state = owned.get(portfolio); assert.ok(state && state.runtime === runtime, 'WRAPPED_WALLET_ORIGINAL_PORTFOLIO_REQUIRED'); state.healthy();
}
export function assertOwnedWrappedWalletPortfolioAccountV1(portfolio, account) {
  const state = owned.get(portfolio); assert.ok(state, 'WRAPPED_WALLET_ORIGINAL_PORTFOLIO_REQUIRED'); state.healthy();
  assert.ok(state.accounts.some(row => row.account === account), 'WRAPPED_WALLET_ORIGINAL_MEMBER_REQUIRED');
}
export function claimWrappedWalletPortfolioJournalV1(runtime, portfolio) {
  assertOwnedWrappedWalletPortfolioV1(runtime, portfolio); const state = owned.get(portfolio);
  assert.ok(state.accounts.every(row => !claimed.has(row.account)), 'WRAPPED_WALLET_JOURNAL_ALREADY_CLAIMED');
  state.accounts.forEach(row => claimed.add(row.account));
}
export function createWrappedWalletPortfolioAuthorityV1(options) {
  assertWrappedWalletAccountReleasedV1();
  assert.equal(arguments.length, 1, 'WRAPPED_WALLET_NO_OVERRIDES');
  exactRecord(options, ['runtime', 'system', 'accounts', 'accountId', 'journalId']);
  const { runtime, system, accountId, journalId } = options; assertOwnedWrappedClaimWalletSystemV1(runtime, system);
  fixedArray(options.accounts, 2);
  const accounts = options.accounts.map((row, poolIndex) => {
    exactRecord(row, ['poolIndex', 'account']); assert.equal(row.poolIndex, poolIndex, 'WRAPPED_WALLET_ORDERED_BTC_SOL_POOLS');
    assertOwnedWrappedWalletAccountAuthorityV1(row.account, { runtime, system, poolIndex });
    const config = validateGenericAccountConfig(row.account.config); assert.equal(config.registry.length, 1);
    return Object.freeze({ account: row.account, config, poolIndex, asset: config.registry[0] });
  });
  assert.notEqual(accounts[0].account, accounts[1].account); assert.notEqual(accounts[0].asset.assetId, accounts[1].asset.assetId);
  const config = validateGenericAccountConfig({ accountId, journalId,
    lifetime: sha({ profile: WRAPPED_WALLET_PORTFOLIO_PROFILE_V1, bootstrap: system.bootstrap,
      registryCommitment: system.registryCommitment, claimAuthority: system.claims.authority.address,
      children: accounts.map(row => genericAccountIdentity(row.config)) }), registry: accounts.map(row => row.asset) });
  const identity = genericAccountIdentity(config); let closed = false, busy = false;
  function healthy() {
    assert.ok(!closed, 'WRAPPED_WALLET_PORTFOLIO_CLOSED'); assertOwnedWrappedClaimWalletSystemV1(runtime, system);
    accounts.forEach(row => assertOwnedWrappedWalletAccountAuthorityV1(row.account, { runtime, system, poolIndex: row.poolIndex }));
  }
  async function exclusive(work) { healthy(); assert.equal(busy, false, 'WRAPPED_WALLET_PORTFOLIO_BUSY'); busy = true;
    try { return await work(); } finally { busy = false; } }
  function route(raw) {
    const outer = validateBoundRequest(raw, config); assert.equal(outer.kind, 'GRAPH', 'WRAPPED_WALLET_ORIGINAL_CLAIM_CONTROLLER_REQUIRED');
    const child = accounts.find(row => row.asset.assetId === outer.assetId); assert.ok(child, 'WRAPPED_WALLET_ORIGINAL_ASSET_REQUIRED');
    return { outer, inner: bindFlatPortfolioChildRequest(outer, config, child.config), child };
  }
  function outcome(outer, inner, value) {
    const accepted = validateOutcome(value, inner); assert.equal(outer.assetBindingSHA256, inner.assetBindingSHA256);
    return immutable({ ...accepted, bindingSHA256: outer.bindingSHA256,
      outcomeId: sha({ profile: WRAPPED_WALLET_PORTFOLIO_PROFILE_V1, bindingSHA256: outer.bindingSHA256, childOutcome: accepted }) });
  }
  async function original(method, raw) { const { outer, inner, child } = route(raw);
    return outcome(outer, inner, await child.account.authority[method](inner)); }
  const authority = Object.freeze({
    assertAuthority: expected => exclusive(async () => {
      assert.deepEqual(expected, identity);
      for (const child of accounts) { const value = await child.account.authority.assertAuthority(genericAccountIdentity(child.config));
        assert.equal(value.available, true); assert.deepEqual(value.identity, genericAccountIdentity(child.config)); }
      return { version: 1, available: true, identity };
    }),
    prepare: raw => exclusive(async () => {
      const { outer, inner, child } = route(raw), result = await child.account.authority.prepare(inner);
      assert.equal(result.state, 'PREPARED'); assert.equal(result.bindingSHA256, inner.bindingSHA256);
      assert.equal(result.assetBindingSHA256, inner.assetBindingSHA256);
      return { version: 1, state: 'PREPARED', bindingSHA256: outer.bindingSHA256, assetBindingSHA256: outer.assetBindingSHA256 };
    }),
    execute: raw => exclusive(() => original('execute', raw)), reconcile: raw => exclusive(() => original('reconcile', raw)),
    recover: raw => exclusive(() => original('recover', raw)),
    observe: raw => exclusive(async () => {
      exactRecord(raw, ['request', 'outcome', 'challenge']); const { outer, inner, child } = route(raw.request);
      const originalOutcome = await child.account.authority.reconcile(inner);
      assert.deepEqual(raw.outcome, outcome(outer, inner, originalOutcome), 'WRAPPED_WALLET_ORIGINAL_OUTCOME_REQUIRED');
      const observed = await child.account.authority.observe({ request: inner, outcome: originalOutcome, challenge: raw.challenge });
      assert.equal(observed.bindingSHA256, inner.bindingSHA256); assert.equal(observed.assetBindingSHA256, inner.assetBindingSHA256);
      assert.equal(observed.outcomeId, originalOutcome.outcomeId); assert.equal(observed.canonicalOutcomeBlockHash, originalOutcome.blockHash);
      return { ...observed, bindingSHA256: outer.bindingSHA256, outcomeId: raw.outcome.outcomeId };
    }),
  });
  const portfolio = Object.freeze({ config, registry: config.registry, authority,
    ownerView: () => exclusive(async () => {
      const assets = []; // Serial: each complete reciprocal audit reserves the same original joint signer capability.
      for (const child of accounts) { const view = await child.account.ownerView(); assert.equal(view.asset.assetId, child.asset.assetId); assets.push(view); }
      const observed = assets.filter(view => view.observed !== null), coherent = observed.length === 2 && observed.every(view =>
        view.observed.blockHash === observed[0].observed.blockHash && view.observed.blockNumber === observed[0].observed.blockNumber
        && view.observed.timestamp === observed[0].observed.timestamp);
      return immutable({ version: 1, profile: WRAPPED_WALLET_PORTFOLIO_PROFILE_V1,
        status: observed.length === 0 ? 'UNAVAILABLE' : observed.length < 2 ? 'PARTIAL' : coherent && assets.every(v => v.status === 'LIVE') ? 'LIVE' : 'STALE',
        coherent, observed: coherent ? observed[0].observed : null, assets,
        capabilities: { coordinatorRestart: true, keeperRestart: false, crossAssetAtomicConversion: false,
          privateDeFiComposability: false, fullWalletAcceptance: false } });
    }),
    async abort() { await Promise.allSettled(accounts.map(row => row.account.abort())); },
    close() { assert.equal(busy, false); closed = true; return { closed: true, originalChildrenRetained: true }; },
  });
  owned.set(portfolio, { runtime, system, accounts, healthy }); return portfolio;
}
