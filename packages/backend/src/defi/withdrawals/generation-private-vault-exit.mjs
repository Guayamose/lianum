import {projectPrivatePositionStateV2} from '../positions/private-position-state-v2.mjs';
import {POSITION_STATE_PROFILE} from '../../../../../apps/wallet/src/client/features/portfolio/generation-position-state-v2.mjs';
/** Fixed private composition of original branded private-share EXIT services.
 * Uses the catalogue's already durable request bindings, never a second keeper,
 * mutable registry, public service registration, new request ID or resend. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray } from '../../execution/encoding/commitments.mjs';
import * as originalExits from './private-vault-exit.mjs';
import { assertOwnedFlatJournalCatalogue, assertOwnedFlatJournalCatalogueAccount }
  from '../../accounts/storage/flat-journal-catalogue.mjs';
import { assertFlatManualGraphCatalogueSession } from '../../api/accounts/flat-manual-graph-session.mjs';
import { isOwnedOfficialStaticVaultV1 } from '../vaults/owned-metamorpho-vault.mjs';
import { projectPrivateVaultPosition } from '../vaults/private-vault-position.mjs';

export const GENERATION_VAULT_POSITION_PROFILE = 'OWNED_GENERATION_PRIVATE_VAULT_POSITIONS_V1';
const owned = new WeakMap();
const fail = code => { throw Object.assign(new Error('PRIVATE_VAULT_GENERATION_' + code), { code: 'PRIVATE_VAULT_GENERATION_' + code }); };
const need = (value, code) => { if (!value) fail(code); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(value)?.[0] === value;
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const detached = value => freeze(structuredClone(value));

/** Nullable brand lookup supports the legacy single-service app unchanged. */
export function generationPrivateVaultExitBinding(runtime, service) {
  const binding = owned.get(service);
  if (!binding) return null;
  need(binding.runtime === runtime, 'ORIGINAL_RUNTIME_REQUIRED');
  assertOwnedFlatJournalCatalogue(binding.catalogue, { runtime });
  return Object.freeze({ runtime, catalogue: binding.catalogue });
}
export function assertGenerationPrivateVaultExitSession(runtime, service, session) {
  const binding = generationPrivateVaultExitBinding(runtime, service);
  need(binding, 'ORIGINAL_SERVICE_REQUIRED');
  assertFlatManualGraphCatalogueSession(session, binding);
}
export function generationPrivateVaultExitActionTarget(runtime, service, method, input) {
  const binding = owned.get(service);
  if (!binding) return null;
  generationPrivateVaultExitBinding(runtime, service);
  need(['prepare', 'requote', 'execute', 'reconcile', 'reopen'].includes(method), 'ACTION');
  exactRecord(input, method === 'reopen' ? [] : ['prepare', 'requote'].includes(method)
    ? ['requestId', 'minimumOutput', 'deadline'] : ['requestId']);
  // Empty-body reopen is scoped to this immutable facade, never a later append.
  return method === 'reopen' ? service : binding.route(input.requestId).service;
}

/** Exactly 1–8 already-created services, frozen for this facade's lifetime.
 * Appending a catalogue generation does not register any new service here. */
export function createGenerationPrivateVaultExit(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['runtime', 'catalogue', 'services']);
  const { runtime, catalogue, services } = input;
  assertOwnedFlatJournalCatalogue(catalogue, { runtime });
  need(Array.isArray(services) && services.length >= 1 && services.length <= 8, 'SERVICE_COUNT');
  fixedArray(services, services.length);
  const accounts = new Set(), originals = new Set(), assets = new Map();
  const entries = Object.freeze(services.map(service => {
    const original = originalExits.ownedPrivateVaultExitBinding(runtime, service);
    const membership = assertOwnedFlatJournalCatalogueAccount(catalogue, original.account);
    need(membership.runtime === runtime, 'ORIGINAL_RUNTIME_REQUIRED');
    need(!originals.has(service) && !accounts.has(original.account) && !assets.has(original.shareAssetId), 'AMBIGUOUS_SERVICE');
    originals.add(service); accounts.add(original.account);
    const share = membership.portfolio.registry.find(asset => asset.assetId === original.shareAssetId);
    need(share && share.token === original.binding.identity.vault, 'ORIGINAL_SHARE_REQUIRED');
    const underlying = membership.portfolio.registry.filter(asset => asset.kind === 'ERC20'
      && asset.assetId !== share.assetId && asset.token === original.binding.identity.asset
      && asset.genesis === share.genesis && asset.chainId === share.chainId);
    need(underlying.length <= 1, 'AMBIGUOUS_UNDERLYING');
    const entry = Object.freeze({ service, original, membership, shareAssetId: share.assetId,
      underlyingAssetId: underlying[0]?.assetId ?? null });
    assets.set(share.assetId, entry); return entry;
  }));
  let busy = false;
  function genuine(entry) {
    assertOwnedFlatJournalCatalogue(catalogue, { runtime });
    need(originalExits.ownedPrivateVaultExitBinding(runtime, entry.service) === entry.original, 'ORIGINAL_SERVICE_CHANGED');
    const current = assertOwnedFlatJournalCatalogueAccount(catalogue, entry.original.account);
    need(current.runtime === runtime && current.portfolio === entry.membership.portfolio
      && current.generationId === entry.membership.generationId, 'ORIGINAL_GENERATION_CHANGED');
  }
  function route(requestId) {
    need(id(requestId), 'REQUEST_ID');
    assertOwnedFlatJournalCatalogue(catalogue, { runtime });
    // status() returns only retained acknowledged bindings. Pending failed
    // writes never enter it. No child journal or newer generation is consulted.
    const rows = catalogue.status().bindings.filter(row => row.request.requestId === requestId);
    need(rows.length === 1, 'ORIGINAL_REQUEST_REQUIRED');
    const row = rows[0], entry = assets.get(row.request.assetId);
    need(row.request.kind === 'EXIT' && entry, 'ORIGINAL_SHARE_EXIT_REQUIRED');
    genuine(entry);
    need(row.generationId === entry.membership.generationId, 'ORIGINAL_GENERATION_CHANGED');
    return { ...entry, request: row.request };
  }
  async function originalRequest(entry) {
    const rows = (await entry.original.account.privateStatus()).operations
      .filter(row => row.request?.requestId === entry.request.requestId);
    need(rows.length === 1, 'AMBIGUOUS_ACCOUNT_REQUEST');
    const row = rows[0]; need(row.kind === 'EXIT', 'ORIGINAL_SHARE_EXIT_REQUIRED');
    for (const key of ['requestId', 'kind', 'assetId', 'ownerOperationRef'])
      need(row.request[key] === entry.request[key], 'ORIGINAL_REQUEST_CHANGED');
    need(row.ownerOperationRef === entry.request.ownerOperationRef, 'ORIGINAL_REQUEST_CHANGED');
  }
  async function exclusive(work) {
    need(!busy, 'BUSY'); busy = true;
    try { return await work(); } finally { busy = false; }
  }
  async function action(method, input) {
    const copied = typeof input === 'string' ? input : detached(input);
    const entry = route(typeof copied === 'string' ? copied : copied.requestId);
    await originalRequest(entry);
    return entry.service[method](copied); // Return original result unchanged.
  }
  function generationRow(entry, errorCode = null, requestIds = null) {
    return { generationId: entry.membership.generationId, shareAssetId: entry.shareAssetId,
      status: errorCode === null ? 'AVAILABLE' : 'UNAVAILABLE', requestIds, errorCode };
  }
  async function readOriginalPositionVault(entry, portfolioView) {
    genuine(entry);
    if (!isOwnedOfficialStaticVaultV1(entry.original.vault)) return entry.original.vault.observe();
    const share = portfolioView.assets.find(value => value.asset.assetId === entry.shareAssetId);
    const asset = entry.membership.portfolio.registry.find(value => value.assetId === entry.shareAssetId);
    need(share?.status === 'LIVE' && asset, 'ORIGINAL_SHARE_POSITION_UNAVAILABLE');
    return entry.original.vault.observePrivateShares({ amount: share.balances.available, holder: '0x' + asset.pool });
  }
  const facade = Object.freeze({
    async prepare(input) { assert.equal(arguments.length, 1); exactRecord(input, ['requestId', 'minimumOutput', 'deadline']);
      return exclusive(() => action('prepare', input)); },
    async requote(input) { assert.equal(arguments.length, 1); exactRecord(input, ['requestId', 'minimumOutput', 'deadline']);
      return exclusive(() => action('requote', input)); },
    async execute(requestId) { assert.equal(arguments.length, 1); return exclusive(() => action('execute', requestId)); },
    async reconcile(requestId) { assert.equal(arguments.length, 1); return exclusive(() => action('reconcile', requestId)); },
    async snapshot() { assert.equal(arguments.length, 0); return exclusive(async () => {
      const operations = [], generations = [], seen = new Set();
      for (const entry of entries) {
        try {
          genuine(entry); const snapshot = await entry.service.snapshot();
          need(snapshot.version === 1 && snapshot.profile === originalExits.PRIVATE_VAULT_EXIT_PROFILE, 'ORIGINAL_SNAPSHOT');
          for (const row of snapshot.operations) {
            need(!seen.has(row.requestId) && route(row.requestId).service === entry.service, 'AMBIGUOUS_REQUEST');
            need(row.shareAssetId === entry.shareAssetId, 'ORIGINAL_SHARE_REQUIRED');
          }
          for (const row of snapshot.operations) { seen.add(row.requestId); operations.push(row); }
          generations.push(generationRow(entry, null, snapshot.operations.map(row => row.requestId)));
        } catch { generations.push(generationRow(entry, 'PRIVATE_VAULT_GENERATION_UNAVAILABLE')); }
      }
      return detached({ version: 1, profile: originalExits.PRIVATE_VAULT_EXIT_PROFILE, operations,
        generationProjection: { version: 1, profile: 'OWNED_GENERATION_PRIVATE_VAULT_EXITS_V1', generations } });
    }); },
    async reopen() { assert.equal(arguments.length, 0); return exclusive(async () => {
      const generations = [], requestIds = [], seen = new Set();
      // Every original gets one attempt, even if another is unavailable. This
      // only reopens retained journals/keepers; no prepare/execute is called.
      for (const entry of entries) {
        try {
          genuine(entry); const result = await entry.service.reopen();
          need(result.reopened === true && result.originalIdentitiesRetained === true && result.keeperRestart === false, 'ORIGINAL_REOPEN');
          for (const requestId of result.requestIds) need(!seen.has(requestId)
            && route(requestId).service === entry.service, 'AMBIGUOUS_REQUEST');
          for (const requestId of result.requestIds) { seen.add(requestId); requestIds.push(requestId); }
          generations.push(generationRow(entry, null, result.requestIds));
        } catch { generations.push(generationRow(entry, 'PRIVATE_VAULT_GENERATION_REOPEN_UNAVAILABLE')); }
      }
      const reopened = generations.every(row => row.status === 'AVAILABLE');
      return detached({ reopened, originalIdentitiesRetained: true, keeperRestart: false, requestIds,
        generationProjection: { version: 1, profile: 'OWNED_GENERATION_PRIVATE_VAULT_EXITS_V1', generations } });
    }); },
    async ownerStateView() { assert.equal(arguments.length,0); return exclusive(async()=>{
      const positions=[];
      for(const entry of entries) {
        let portfolioView=null,vaultView=null;
        try {genuine(entry);portfolioView=await entry.membership.portfolio.ownerView();} catch {}
        if(portfolioView!==null) try {
          genuine(entry);vaultView=await readOriginalPositionVault(entry,portfolioView);
          assert.deepEqual(vaultView.identity,entry.original.binding.identity,'PRIVATE_VAULT_GENERATION_VAULT_CHANGED');
        } catch {vaultView=null;}
        const original={generationId:entry.membership.generationId,shareAssetId:entry.shareAssetId,
          underlyingAssetId:entry.underlyingAssetId,identity:entry.original.binding.identity};
        let row;
        try {row=projectPrivatePositionStateV2({...original,portfolioView,vaultView});}
        catch {row=projectPrivatePositionStateV2({...original,portfolioView:null,vaultView:null});}
        positions.push(row);
      }
      return detached({version:2,profile:POSITION_STATE_PROFILE,positions,
        privateBalancesAggregated:false,underlyingPrivateSpendable:false});
    }); },
    async ownerView() { assert.equal(arguments.length, 0); return exclusive(async () => {
      const positions = [];
      for (const entry of entries) {
        const row = { generationId: entry.membership.generationId, shareAssetId: entry.shareAssetId,
          underlyingAssetId: entry.underlyingAssetId, vault: entry.original.binding.identity.vault,
          underlyingToken: entry.original.binding.identity.asset, kind: 'ERC4626_SHARE', status: 'UNAVAILABLE',
          availableShares: null, estimatedRedeemableUnderlying: null, observed: null, rounding: 'down',
          underlyingSpendable: false, privateConversionAccepted: false, errorCode: null };
        try {
          genuine(entry); need(entry.underlyingAssetId !== null, 'UNDERLYING_NOT_REGISTERED');
          const portfolioView = await entry.membership.portfolio.ownerView();
          const vaultView = await readOriginalPositionVault(entry, portfolioView);
          assert.deepEqual(vaultView.identity, entry.original.binding.identity, 'PRIVATE_VAULT_GENERATION_VAULT_CHANGED');
          const position = projectPrivateVaultPosition({ portfolioView, vaultView, shareAssetId: entry.shareAssetId,
            underlyingAssetId: entry.underlyingAssetId });
          row.status = position.status; row.availableShares = position.availableShares;
          row.estimatedRedeemableUnderlying = position.estimatedRedeemableUnderlying;
          row.observed = position.status === 'LIVE' ? portfolioView.observed : null;
        } catch { row.errorCode = entry.underlyingAssetId === null
          ? 'PRIVATE_VAULT_GENERATION_UNDERLYING_NOT_REGISTERED' : 'PRIVATE_VAULT_GENERATION_POSITION_UNAVAILABLE'; }
        positions.push(row);
      }
      return detached({ version: 1, profile: GENERATION_VAULT_POSITION_PROFILE, positions,
        privateBalancesAggregated: false, underlyingPrivateSpendable: false });
    }); },
  });
  owned.set(facade, Object.freeze({ runtime, catalogue, route, entries })); return facade;
}
