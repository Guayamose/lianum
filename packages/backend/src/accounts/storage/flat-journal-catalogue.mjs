/** PRIVATE V2 catalogue of immutable original portfolio journals.
 * Fresh routing only. Original requests/outcomes are returned byte-for-byte;
 * no registry replacement, balance migration, resend or keeper adoption. */
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { lstat } from 'node:fs/promises';
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { validateJournalCredentials } from '../../../../engine/src/execution/accounts/generic-account-process.mjs';
import { immutable, sha, genericAccountIdentity, validateInput, validateBoundRequest, bindGenericAccountRequest }
  from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { assertOwnedFlatPortfolio, describeFlatPortfolioJournalAuthority } from '../authority/flat-portfolio-authority.mjs';
import { assertOwnedFlatPoolAdmissionPolicy } from '../authority/flat-pool-admission-policy.mjs';
import { createFlatManualPortfolioKeeper, assertOwnedFlatManualPortfolioKeeper } from '../portfolio/flat-manual-portfolio-keeper.mjs';

const PROFILE = 'FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2';
const generations = new WeakMap(), catalogues = new WeakMap(), catalogueClaims = new WeakSet();
const fail = text => Object.assign(new Error('FLAT_CATALOGUE_' + text), { code: 'FLAT_CATALOGUE_' + text });
const requireTrue = (condition, text) => { if (!condition) throw fail(text); };
function originalGeneration(value, runtime) {
  const generation = generations.get(value);
  requireTrue(generation && generation.runtime === runtime, 'ORIGINAL_GENERATION_REQUIRED');
  assertOwnedFlatPortfolio(runtime, generation.portfolio);
  assertOwnedFlatManualPortfolioKeeper(generation.keeper, { runtime, portfolio: generation.portfolio });
  return generation;
}
export function assertOwnedFlatJournalCatalogue(catalogue, expected) {
  const state = catalogues.get(catalogue);
  requireTrue(state && state.runtime === expected.runtime, 'ORIGINAL_CATALOGUE_REQUIRED');
}
export function assertOwnedFlatJournalCatalogueAccount(catalogue, account) {
  const state = catalogues.get(catalogue); requireTrue(state, 'ORIGINAL_CATALOGUE_REQUIRED');
  const matches = [...state.byId.values()].filter(generation =>
    generation.accounts.some(entry => entry.account === account));
  requireTrue(matches.length === 1, 'ORIGINAL_GENERATION_ACCOUNT_REQUIRED');
  const generation = matches[0];
  assertOwnedFlatPortfolio(state.runtime, generation.portfolio);
  return Object.freeze({ runtime: state.runtime, portfolio: generation.portfolio, generationId: generation.id });
}
function descriptor(generation) {
  return immutable({ generationId: generation.id, identity: generation.identity,
    registry: generation.config.registry, routes: generation.routes, admissionAssets: generation.admissionAssets });
}

/** Owns construction once. No serialized keeper, imported journal, callback
 * authority or "reopen with a fresh keeper" option exists. The dependent manual
 * portfolio factory holds the one-time lease over every underlying authority. */
export async function createFlatJournalGeneration(input) {
  exactRecord(input, ['runtime', 'portfolio', 'poolAdmissions', 'journal']);
  const { runtime, portfolio, poolAdmissions } = input;
  assertOwnedFlatPortfolio(runtime, portfolio);
  const owned = describeFlatPortfolioJournalAuthority(runtime, portfolio);
  assertOwnedFlatPoolAdmissionPolicy(poolAdmissions, owned);
  const journal = validateJournalCredentials(input.journal);
  const fresh = await poolAdmissions.verifyFreshGeneration();
  assert.deepEqual(fresh.map(entry => entry.route.assetId).sort(), portfolio.config.registry.map(asset => asset.assetId).sort(),
    'FLAT_CATALOGUE_ORIGINAL_REGISTRY_REQUIRED');
  const identity = genericAccountIdentity(portfolio.config), id = sha({ profile: PROFILE, identity });
  const keeper = await createFlatManualPortfolioKeeper({ runtime, portfolio, journal });
  assertOwnedFlatManualPortfolioKeeper(keeper, { runtime, portfolio });
  const state = { id, identity, runtime, portfolio, poolAdmissions, keeper,
    accounts: Object.freeze(owned.accounts.map(entry => Object.freeze({ poolIndex: entry.poolIndex, account: entry.account }))),
    journalPath: resolve(journal.path), config: portfolio.config, routes: fresh.map(entry => entry.route),
    freshAtCreation: fresh, admissionAssets: immutable(poolAdmissions.status().current), attached: false };
  const capability = Object.freeze({ generationId: id, identity: immutable(identity) });
  generations.set(capability, state); return capability;
}

export async function closeUnattachedFlatJournalGeneration(capability, { runtime }) {
  const generation = originalGeneration(capability, runtime);
  requireTrue(!generation.attached && !catalogueClaims.has(capability), 'GENERATION_ALREADY_ATTACHED');
  generation.attached = true; catalogueClaims.add(capability);
  await generation.keeper.close();
  return { closed: true, originalAuthorityLeaseRetained: true };
}

/** Every new binding is authenticated/read back before the original child is
 * called. Keeper/coordinator restart keeps the original catalogue and children;
 * whole-keeper/node recreation is deliberately not offered. */
export async function createFlatJournalCatalogue(input) {
  exactRecord(input, ['runtime', 'initialGeneration', 'journal']);
  const { runtime, initialGeneration } = input, initial = originalGeneration(initialGeneration, runtime);
  requireTrue(!initial.attached && !catalogueClaims.has(initialGeneration), 'GENERATION_ALREADY_ATTACHED');
  const credentials = validateJournalCredentials(input.journal), path = resolve(credentials.path);
  requireTrue(path !== initial.journalPath, 'JOURNAL_PATH_REUSE');
  const directory = await lstat(dirname(path));
  requireTrue(directory.isDirectory() && !directory.isSymbolicLink() && (directory.mode & 0o077) === 0, 'PRIVATE_DIRECTORY_REQUIRED');
  await initial.poolAdmissions.verifyFreshGeneration();
  requireTrue(!initial.attached && !catalogueClaims.has(initialGeneration), 'GENERATION_ALREADY_ATTACHED');
  initial.attached = true; catalogueClaims.add(initialGeneration);
  const byId = new Map([[initial.id, initial]]), byAsset = new Map(initial.routes.map(route => [route.assetId, initial.id]));
  const current = Object.fromEntries(initial.admissionAssets.map(assetId => {
    const route = initial.routes.find(route => route.assetId === assetId);
    requireTrue(route, 'ADMISSION_ROUTE_REQUIRED'); return [route.economicIdentitySHA256, assetId];
  }));
  const vault = new Vault(path); let password = credentials.password;
  let record = await vault.create({ version: 2, profile: PROFILE,
    catalogueId: sha({ profile: PROFILE, initial: initial.identity }),
    generations: [descriptor(initial)], current, bindings: [], events: [] }, password);
  assert.deepEqual(await vault.read(password), record, 'FLAT_CATALOGUE_INITIAL_READBACK');
  let busy = false, closed = false, storageFault = false, admissionFault = false, pendingWrite = null;
  let presentationRevision = record.revision, pendingReview = null, pendingOwnerReview = null, pendingGeneration = null;
  const bindings = new Map(), references = new Map();
  async function exclusive(work) {
    requireTrue(!busy && !closed, 'UNAVAILABLE'); busy = true;
    try { return await work(); } finally { busy = false; }
  }
  async function stored() {
    requireTrue(!storageFault, 'STORAGE_FENCED');
    try { assert.deepEqual(await vault.read(password), record, 'FLAT_CATALOGUE_STORAGE_CHANGED'); }
    catch (error) { storageFault = true; throw error; }
  }
  async function write(transform) {
    await stored();
    const data = immutable(transform(structuredClone(record.data)));
    pendingWrite = { revision: record.revision + 1, data };
    try {
      const next = await vault.update(password, record.revision, current => {
        assert.deepEqual(current, record.data, 'FLAT_CATALOGUE_STORAGE_CHANGED'); return data;
      });
      assert.deepEqual(next, pendingWrite, 'FLAT_CATALOGUE_WRITE_CHANGED');
      assert.deepEqual(await vault.read(password), next, 'FLAT_CATALOGUE_WRITE_READBACK');
      record = next; pendingWrite = null;
    } catch (error) { storageFault = true; throw error; }
  }
  function bound(requestId) {
    const entry = bindings.get(requestId); requireTrue(entry, 'ORIGINAL_REQUEST_REQUIRED');
    const generation = byId.get(entry.generationId); requireTrue(generation, 'ORIGINAL_GENERATION_REQUIRED');
    validateBoundRequest(entry.boundRequest, generation.config);
    assertOwnedFlatManualPortfolioKeeper(generation.keeper, { runtime, portfolio: generation.portfolio });
    return { entry, generation };
  }
  async function original(method, requestId) {
    const { entry, generation } = bound(requestId);
    // Recovery uses retained authenticated bindings even after a NEW append is
    // uncertain. A candidate binding without readback never enters this map.
    try {
      const result = await generation.keeper[method](requestId);
      assert.deepEqual(result.request, entry.boundRequest, 'FLAT_CATALOGUE_CHILD_REQUEST_CHANGED');
      return result;
    } catch (error) { admissionFault = true; throw error; }
  }
  async function snapshots() {
    const result = [];
    for (const generation of byId.values()) {
      try {
        const snapshot = await generation.keeper.snapshot();
        requireTrue(snapshot.storageAvailable === true, 'GENERATION_STORAGE_UNAVAILABLE');
        for (const row of snapshot.requests) {
          const entry = bindings.get(row.requestId);
          requireTrue(entry && entry.generationId === generation.id, 'AMBIGUOUS_CHILD_REQUEST');
          requireTrue(row.assetId === entry.request.assetId && row.kind === entry.request.kind, 'CHILD_ROUTE_CHANGED');
        }
        result.push({ generationId: generation.id, snapshot });
      } catch (error) { admissionFault = true; result.push({ generationId: generation.id, snapshot: null }); }
    }
    return result;
  }
  async function newAdmissionsHealthy() {
    await stored(); requireTrue(!admissionFault, 'ADMISSIONS_FENCED');
    requireTrue([...byId.values()].every(generation => generation.poolAdmissions.status().appendUncertain !== true), 'APPEND_OUTCOME_UNRESOLVED');
    const frames = await snapshots();
    requireTrue(frames.every(frame => frame.snapshot !== null), 'GENERATION_UNAVAILABLE');
    requireTrue(frames.every(frame => frame.snapshot.requests.every(row =>
      !['SUBMITTING', 'UNKNOWN', 'RECOVERING'].includes(row.state))), 'ORIGINAL_OUTCOME_UNRESOLVED');
  }
  async function reserveBinding(raw, expectedGenerationId = null, ownerReviewSHA256 = null) {
      // Capture/validate complete opaque handoff before any async boundary.
      const input = immutable(raw); exactRecord(input, ['requestId', 'kind', 'assetId', 'ownerOperationRef']);
      const prior = bindings.get(input.requestId);
      if (prior) {
        assert.deepEqual(input, prior.request, 'FLAT_CATALOGUE_REQUEST_ID_REUSE');
        if (ownerReviewSHA256 !== null) assert.equal(prior.ownerReviewSHA256, ownerReviewSHA256, 'FLAT_CATALOGUE_OWNER_REVIEW_REBOUND');
        const generation = byId.get(prior.generationId);
        if (expectedGenerationId !== null) requireTrue(generation.id === expectedGenerationId, 'REQUEST_GENERATION_REUSE');
        return { entry: prior, generation, input };
      }
      requireTrue(!references.has(input.ownerOperationRef), 'OWNER_REFERENCE_REUSE');
      const generation = byId.get(byAsset.get(input.assetId)); requireTrue(generation, 'ASSET_NOT_REGISTERED');
      validateInput(input, generation.config.registry);
      if (expectedGenerationId !== null) requireTrue(generation.id === expectedGenerationId, 'REQUEST_GENERATION_REUSE');
      if (input.kind !== 'EXIT') await newAdmissionsHealthy(); else await stored();
      if (input.kind === 'TOP_UP') {
        const route = generation.routes.find(route => route.assetId === input.assetId);
        requireTrue(record.data.current[route.economicIdentitySHA256] === input.assetId, 'FRESH_ROUTE_CHANGED');
      }
      requireTrue(record.data.bindings.length < 128, 'BINDING_CAPACITY');
      const entry = immutable({ request: input, boundRequest: bindGenericAccountRequest(input, generation.config), generationId: generation.id,
        ...(ownerReviewSHA256 === null ? {} : { ownerReviewSHA256 }) });
      await write(data => ({ ...data, bindings: [...data.bindings, entry], events: [...data.events,
        { type: 'BIND', requestId: input.requestId, generationId: generation.id }] }));
      bindings.set(input.requestId, entry); references.set(input.ownerOperationRef, input.requestId);
      return { entry, generation, input };
  }
  const keeper = Object.freeze({
    prepare: raw => exclusive(async () => {
      const { entry, generation, input } = await reserveBinding(raw);
      const result = await generation.keeper.prepare(input);
      assert.deepEqual(result.request, entry.boundRequest, 'FLAT_CATALOGUE_CHILD_REQUEST_CHANGED'); return result;
    }),
    execute: requestId => exclusive(async () => {
      await stored();
      // A new-generation admission outage must not strand an old owned note.
      // Only the exact already-bound EXIT can pass this fence. Its original
      // account/observer still authenticates its own pool and shared hub.
      const { entry } = bound(requestId);
      if (entry.request.kind !== 'EXIT') requireTrue(!admissionFault, 'ADMISSIONS_FENCED');
      return original('execute', requestId);
    }),
    reconcile: requestId => exclusive(() => original('reconcile', requestId)),
    recover: requestId => exclusive(() => original('recover', requestId)),
    snapshot: () => exclusive(async () => {
      try { await stored(); } catch { /* old authenticated binding metadata remains available */ }
      const frames = await snapshots(), rows = [];
      for (const entry of bindings.values()) {
        const frame = frames.find(frame => frame.generationId === entry.generationId);
        const observed = frame?.snapshot?.requests.find(row => row.requestId === entry.request.requestId);
        rows.push(observed ?? { requestId: entry.request.requestId, assetId: entry.request.assetId,
          kind: entry.request.kind, state: frame?.snapshot ? 'PREPARING' : 'UNKNOWN',
          errorCode: frame?.snapshot ? null : 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED' });
      }
      presentationRevision = Math.max(presentationRevision, record.revision + frames.reduce((n, frame) => n + (frame.snapshot?.revision ?? 0), 0));
      return immutable({ version: 1, profile: PROFILE, accountId: initial.config.accountId,
        revision: presentationRevision,
        // This flag describes the catalogue's authenticated route index. A failed
        // child is represented by UNKNOWN rows and fences new admissions, while
        // exact healthy old-generation recovery remains callable.
        storageAvailable: !storageFault, requests: rows });
    }),
    restartCoordinator: () => exclusive(async () => {
      pendingReview = null; pendingOwnerReview = null;
      for (const generation of byId.values()) await generation.keeper.restartCoordinator();
      return { restarted: true, originalGenerationsRetained: true };
    }),
    close: () => exclusive(async () => {
      pendingReview = null; pendingOwnerReview = null;
      const retained = [...byId.values(), ...(pendingGeneration && !byId.has(pendingGeneration.id) ? [pendingGeneration] : [])];
      const outcomes = await Promise.allSettled(retained.map(generation => generation.keeper.close()));
      closed = true; password = null;
      requireTrue(outcomes.every(outcome => outcome.status === 'fulfilled'), 'CLOSE_UNRESOLVED'); return { closed: true };
    }),
  });
  const catalogue = Object.freeze({ keeper,
    async bindManualGraphApproval(approval) { return exclusive(async () => {
      const { flatAccountManualGraphDetails } = await import('../authority/flat-account-authority.mjs');
      const details = flatAccountManualGraphDetails(approval);
      const original = assertOwnedFlatJournalCatalogueAccount(catalogue, details.account);
      requireTrue(details.body.kind === 'GRAPH', 'GRAPH_APPROVAL_REQUIRED');
      const { input } = await reserveBinding(details.body, original.generationId);
      return immutable(input);
    }); },
    /** Owner-local route selection. This is identity metadata, not approval or
     * fresh spendability. Same-asset generations never alias by symbol/token.
     * Null is convenience only while there is exactly one matching generation.
     * An explicit old EXIT remains selectable during a successor outage. */
    async selectOwnerGeneration(input) { return exclusive(async () => {
      exactRecord(input, ['economicIdentitySHA256', 'generationId', 'kind']);
      input = immutable(input);
      requireTrue(typeof input.economicIdentitySHA256 === 'string'
        && /^[0-9a-f]{64}$/.test(input.economicIdentitySHA256), 'ECONOMIC_IDENTITY_REQUIRED');
      requireTrue(input.generationId === null || typeof input.generationId === 'string'
        && /^[0-9a-f]{64}$/.test(input.generationId), 'GENERATION_ID_REQUIRED');
      requireTrue(['TOP_UP', 'EXIT'].includes(input.kind), 'MANUAL_NOTE_ONLY');
      await stored();
      const matches = [...byId.values()].flatMap(generation => generation.routes
        .filter(route => route.economicIdentitySHA256 === input.economicIdentitySHA256
          && (input.generationId === null || generation.id === input.generationId))
        .map(route => ({ generation, route })));
      requireTrue(matches.length > 0, 'OWNER_ROUTE_NOT_REGISTERED');
      requireTrue(matches.length === 1, 'SAME_ASSET_GENERATION_AMBIGUOUS');
      const { generation, route } = matches[0];
      if (input.kind === 'TOP_UP') {
        await newAdmissionsHealthy();
        requireTrue(record.data.current[route.economicIdentitySHA256] === route.assetId, 'FRESH_ROUTE_CHANGED');
        const fresh = await generation.poolAdmissions.selectTopUp({ assetId: route.assetId });
        requireTrue(fresh.assetId === route.assetId, 'GENERATION_PREFERENCE_CHANGED');
      }
      return immutable({ generationId: generation.id, assetId: route.assetId, kind: input.kind,
        economicIdentitySHA256: route.economicIdentitySHA256,
        pool: route.pool, domainCommitment: route.domainCommitment,
        observation: 'IMMUTABLE_ORIGINAL_ROUTE_NOT_BALANCE_OR_CONSENT' });
    }); },
    async selectTopUp({ assetId }) { return exclusive(async () => {
      await newAdmissionsHealthy();
      const anchor = byId.get(byAsset.get(assetId)); requireTrue(anchor, 'ASSET_NOT_REGISTERED');
      const oldRoute = anchor.routes.find(route => route.assetId === assetId);
      const currentAssetId = record.data.current[oldRoute.economicIdentitySHA256];
      const generation = byId.get(byAsset.get(currentAssetId)); requireTrue(generation, 'ADMISSION_ROUTE_REQUIRED');
      const selection = await generation.poolAdmissions.selectTopUp({ assetId: currentAssetId });
      requireTrue(selection.assetId === currentAssetId, 'GENERATION_PREFERENCE_CHANGED');
      return immutable({ generationId: generation.id, ...selection });
    }); },
    async appendGeneration(capability) { return exclusive(async () => {
      await newAdmissionsHealthy();
      const generation = originalGeneration(capability, runtime);
      requireTrue(!generation.attached && !catalogueClaims.has(capability) && !byId.has(generation.id), 'GENERATION_ALREADY_ATTACHED');
      requireTrue(byId.size < 8, 'GENERATION_CAPACITY');
      requireTrue(byAsset.size + generation.routes.length <= 8, 'POOL_ROUTE_CAPACITY');
      requireTrue(generation.journalPath !== path && [...byId.values()].every(prior => prior.journalPath !== generation.journalPath), 'JOURNAL_PATH_REUSE');
      requireTrue(generation.routes.every(route => !byAsset.has(route.assetId)), 'ASSET_ROUTE_REUSE');
      const fresh = await generation.poolAdmissions.verifyFreshGeneration();
      assert.deepEqual(fresh.map(item => item.route), generation.routes, 'FLAT_CATALOGUE_ROUTE_CHANGED');
      for (const route of generation.routes) {
        const originalRoutes = [...byId.values()].flatMap(prior => prior.routes);
        const predecessor = originalRoutes.find(prior => prior.economicIdentitySHA256 === route.economicIdentitySHA256
          && (route.registryProfile !== 'LIANUM_FLAT_APPEND_ONLY_POOLS_V2' || prior.pool === route.predecessorPool));
        requireTrue(predecessor, 'SAME_ASSET_PREDECESSOR_REQUIRED');
        if (route.registryProfile === 'LIANUM_FLAT_APPEND_ONLY_POOLS_V2') {
          assert.equal(predecessor.registryProfile, route.registryProfile, 'FLAT_CATALOGUE_REGISTRY_PROFILE');
          for (const key of ['sourceManifestSHA256', 'keyManifestSHA256']) {
            assert.match(route[key], /^[0-9a-f]{64}$/, 'FLAT_CATALOGUE_EXACT_PROVENANCE_REQUIRED');
            assert.equal(route[key], predecessor[key], 'FLAT_CATALOGUE_SUCCESSOR_PROVENANCE');
          }
        }
        for (const key of ['genesis', 'chainId', 'hub', 'hubDomain', 'ledgerNamespace', 'registryCommitment',
          'verifierSetCommitment', 'sourceProvenanceSHA256', 'keyLineageSHA256'])
          assert.equal(route[key], predecessor[key], 'FLAT_CATALOGUE_SUCCESSOR_IDENTITY');
        requireTrue(route.pool !== predecessor.pool && route.domainCommitment !== predecessor.domainCommitment, 'POOL_IDENTITY_REUSE');
      }
      // Latch attachment before persistence. An uncertain write cannot make this
      // keeper eligible for another catalogue or replacement generation.
      requireTrue(!generation.attached && !catalogueClaims.has(capability), 'GENERATION_ALREADY_ATTACHED');
      generation.attached = true; catalogueClaims.add(capability); pendingGeneration = generation;
      await write(data => ({ ...data, generations: [...data.generations, descriptor(generation)],
        current: { ...data.current, ...Object.fromEntries(generation.admissionAssets.map(assetId => {
          const route = generation.routes.find(route => route.assetId === assetId);
          requireTrue(route, 'ADMISSION_ROUTE_REQUIRED'); return [route.economicIdentitySHA256, assetId];
        })) },
        events: [...data.events, { type: 'APPEND_GENERATION', generationId: generation.id }] }));
      byId.set(generation.id, generation); pendingGeneration = null; for (const route of generation.routes) byAsset.set(route.assetId, generation.id);
      return descriptor(generation);
    }); },
    async reviewOwnerPreparation(input) { return exclusive(async () => {
      exactRecord(input, ['assetId', 'request']); input = immutable(input);
      requireTrue(pendingReview === null && pendingOwnerReview === null, 'REVIEW_ALREADY_PENDING');
      const generation = byId.get(byAsset.get(input.assetId)); requireTrue(generation, 'ASSET_NOT_REGISTERED');
      const request = immutable(input.request); requireTrue(['TOP_UP', 'EXIT'].includes(request.kind), 'MANUAL_NOTE_ONLY');
      requireTrue(!bindings.has(request.requestId), 'OWNER_ORIGINAL_ALREADY_RESERVED');
      if (request.kind === 'TOP_UP') {
        await newAdmissionsHealthy();
        const route = generation.routes.find(route => route.assetId === input.assetId);
        requireTrue(record.data.current[route.economicIdentitySHA256] === input.assetId, 'FRESH_ROUTE_CHANGED');
      } else await stored();
      const matches = describeFlatPortfolioJournalAuthority(runtime, generation.portfolio).accounts
        .filter(entry => entry.account.assetId === input.assetId);
      requireTrue(matches.length === 1, 'ORIGINAL_GENERATION_ACCOUNT_REQUIRED');
      const account = matches[0].account;
      const bridge = await account.ownerActions.createManualPreparation();
      pendingOwnerReview = { generationId: generation.id, account, bridge, review: null, state: 'REVIEWING' };
      try {
        const review = await bridge.review(request);
        requireTrue(review.request.assetId === input.assetId && review.request.requestId === request.requestId
          && review.request.kind === request.kind, 'OWNER_REVIEW_CHANGED');
        pendingOwnerReview.review = immutable(review); pendingOwnerReview.state = 'READY'; return review;
      } catch (error) { pendingOwnerReview.state = 'UNKNOWN'; throw error; }
    }); },
    async confirmOwnerPreparation() { return exclusive(async () => {
      requireTrue(pendingOwnerReview?.state === 'READY', 'ORIGINAL_OWNER_REVIEW_REQUIRED');
      const pending = pendingOwnerReview; pending.state = 'RESERVING';
      const review = pending.review;
      try {
        await reserveBinding(review.request, pending.generationId, sha(review));
        assert.deepEqual(pending.bridge.getState().review, review, 'FLAT_CATALOGUE_OWNER_REVIEW_CHANGED');
        pending.state = 'CONSUMED';
        const handoff = await pending.bridge.confirm();
        assert.deepEqual(handoff, review.request, 'FLAT_CATALOGUE_OWNER_CONFIRMATION_UNRESOLVED');
        pendingOwnerReview = null; return handoff;
      } catch (error) { admissionFault = true; throw error; }
    }); },
    async cancelOwnerPreparationReview() { return exclusive(async () => {
      if (pendingOwnerReview === null) return false;
      requireTrue(['READY', 'REVIEWING', 'UNKNOWN'].includes(pendingOwnerReview.state), 'ORIGINAL_OWNER_PREPARATION_RETAINED');
      const cancelled = pendingOwnerReview.bridge.cancelReview();
      if (cancelled) pendingOwnerReview = null; return cancelled;
    }); },
    async readOriginalOwnerPreparation(requestId) { return exclusive(async () => {
      const { entry, generation } = bound(requestId);
      requireTrue(typeof entry.ownerReviewSHA256 === 'string', 'ORIGINAL_OWNER_REVIEW_REQUIRED');
      const matches = describeFlatPortfolioJournalAuthority(runtime, generation.portfolio).accounts
        .filter(record => record.account.assetId === entry.request.assetId);
      requireTrue(matches.length === 1, 'ORIGINAL_GENERATION_ACCOUNT_REQUIRED');
      const reader = await matches[0].account.ownerActions.restoreManualPreparation();
      const result = await reader.reconcileOriginal({ requestId });
      const retained = reader.getState().attempts.find(attempt => attempt.request.requestId === requestId);
      if (retained) assert.equal(sha(retained.review), entry.ownerReviewSHA256, 'FLAT_CATALOGUE_OWNER_REVIEW_CHANGED');
      if (result.status !== 'UNKNOWN') requireTrue(retained, 'ORIGINAL_OWNER_REVIEW_REQUIRED');
      if (result.handoff !== null) assert.deepEqual(result.handoff, entry.request, 'FLAT_CATALOGUE_OWNER_HANDOFF_CHANGED');
      return result;
    }); },
    async reviewReauthorization(requestId) { return exclusive(async () => {
      requireTrue(pendingReview === null && pendingOwnerReview === null, 'REVIEW_ALREADY_PENDING');
      const { generation } = bound(requestId);
      pendingReview = { generationId: generation.id, requestId, state: 'REVIEWING' };
      try {
        const result = await generation.keeper.reviewReauthorization(requestId);
        pendingReview.state = 'READY'; return result;
      } catch (error) { pendingReview.state = 'UNKNOWN'; throw error; }
    }); },
    async confirmReauthorization() { return exclusive(async () => {
      requireTrue(pendingReview?.state === 'READY', 'ORIGINAL_REVIEW_REQUIRED');
      const { generationId, requestId } = pendingReview;
      const { generation } = bound(requestId); requireTrue(generation.id === generationId, 'REVIEW_GENERATION_CHANGED');
      pendingReview.state = 'CONSUMED';
      // Exactly one call. A lost reply never reopens or recreates confirmation.
      return generation.keeper.confirmReauthorization();
    }); },
    async cancelReview() { return exclusive(async () => {
      if (pendingReview === null) return { cancelled: false };
      const review = pendingReview; pendingReview = null;
      return byId.get(review.generationId).keeper.cancelReview();
    }); },
    async originalGenerationSnapshot(generationId) { return exclusive(async () => {
      const generation = byId.get(generationId); requireTrue(generation, 'ORIGINAL_GENERATION_REQUIRED');
      return generation.keeper.snapshot();
    }); },
    async ownerView() { return exclusive(async () => {
      // Authenticate the current admission pointer without making missing
      // balances or this read-only metadata into preparation authority.
      try { await stored(); } catch { /* preserve original recovery visibility */ }
      let admissionsFenced = storageFault || admissionFault;
      const admissionAssetIds = Object.values(record.data.current);
      for (const generation of byId.values()) {
        try {
          const status = generation.poolAdmissions.status();
          if (status.appendUncertain === true || status.admissionsFenced === true) admissionsFenced = true;
          for (const assetId of admissionAssetIds.filter(id => byAsset.get(id) === generation.id))
            if (!status.current.includes(assetId)) admissionsFenced = true;
        } catch { admissionsFenced = true; }
      }
      const views = [], assets = [];
      for (const generation of byId.values()) {
        const routes = generation.routes.map(({ assetId, pool, domainCommitment }) => ({ assetId, pool, domainCommitment }));
        let portfolio = null, errorCode = null;
        try {
          portfolio = await generation.portfolio.ownerView();
          assert.deepEqual(portfolio.assets.map(item => item.asset.assetId).sort(), routes.map(route => route.assetId).sort(),
            'FLAT_CATALOGUE_OWNER_VIEW_ROUTES_CHANGED');
          assets.push(...portfolio.assets);
        } catch { portfolio = null; errorCode = 'FLAT_CATALOGUE_GENERATION_VIEW_UNAVAILABLE'; }
        views.push({ generationId: generation.id, routes, portfolio, errorCode });
      }
      const total = [...byId.values()].reduce((n, generation) => n + generation.routes.length, 0);
      const observed = assets.filter(asset => asset.observed !== null && asset.observed !== undefined);
      const coherent = observed.length === total && observed.every(asset => ['blockHash', 'blockNumber', 'timestamp'].every(key =>
        asset.observed[key] === observed[0].observed[key]));
      const status = observed.length === 0 ? 'UNAVAILABLE' : observed.length < total ? 'PARTIAL'
        : coherent && assets.every(asset => asset.status === 'LIVE') ? 'LIVE' : 'STALE';
      return immutable({ version: 2, profile: PROFILE, status, coherent,
        observed: coherent ? observed[0].observed : null, generations: views,
        freshAdmissions: { version: 1, fenced: admissionsFenced, routes: admissionAssetIds.map(assetId =>
          ({ generationId: byAsset.get(assetId), assetId })) },
        capabilities: { coordinatorRestart: true, keeperRestart: false, nodeRestart: false,
          privateBalancesAggregated: false, implicitNoteMigration: false, fullWalletAcceptance: false } });
    }); },
    status: () => immutable({ profile: PROFILE, generations: [...byId.values()].map(descriptor),
      current: record.data.current, bindings: [...bindings.values()], storageFault, admissionFault,
      uncertainWrite: pendingWrite !== null, pendingGenerationId: pendingGeneration?.id ?? null, pendingReview,
      pendingOwnerPreparation: pendingOwnerReview ? { generationId: pendingOwnerReview.generationId,
        requestId: pendingOwnerReview.review?.request.requestId ?? null, state: pendingOwnerReview.state } : null, keeperRestart: false, originalBindingsRewritten: false }),
  });
  catalogues.set(catalogue, { runtime, byId });
  return catalogue;
}
