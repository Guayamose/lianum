/** PRIVATE bootstrap-only fresh-admission preference for original immutable pool routes.
 * No deployment, registration, note/key generation, journal rewrite or resend.
 * The original surviving owned keeper is required; serialized state is rejected. */
import assert from 'node:assert/strict';
import { assertOwnedFlatSystem, describeOwnedFlatPoolRegistry } from '../../operations/deployments/system/deploy-system.mjs';
import { assertOwnedFlatAccountAuthority } from './flat-account-authority.mjs';
import { createFlatSystemStateReader } from '../../execution/account/reconciliation/flat-system-state.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { genericAccountIdentity, immutable } from '@lianum/engine/accounts/journal';
import { poolRouteDigest, poolEconomicIdentity, projectPoolCapacity, projectPoolContinuity, assertPoolHistoryAdvance,
  assertFreshPoolSuccessor } from '../storage/flat-pool-route-state.mjs';
import {FLAT_MINIMUM_PROFILE} from '../../operations/deployments/system/append-only-build-v3.mjs';
import {normalizeMinimumDepositAtomic} from '../../chains/shared/contracts/minimum-deposit-v3.mjs';
const owned = new WeakMap();
const bare = value => value.slice(2);
export function assertOwnedFlatPoolAdmissionPolicy(policy, expected) {
  const record = owned.get(policy);
  assert.ok(record, 'FLAT_POOL_ROUTES_OWNED_POLICY_REQUIRED');
  assert.equal(record.runtime, expected.runtime, 'FLAT_POOL_ROUTES_RUNTIME');
  assert.equal(record.system, expected.system, 'FLAT_POOL_ROUTES_SYSTEM');
  assert.equal(record.accounts.length, expected.accounts.length, 'FLAT_POOL_ROUTES_ACCOUNTS');
  for (const entry of expected.accounts)
    assert.ok(record.accounts.some(original => original.account === entry.account && original.poolIndex === entry.poolIndex),
      'FLAT_POOL_ROUTES_ORIGINAL_ACCOUNT');
}
export async function createFlatPoolAdmissionPolicy(input) {
  exactRecord(input, ['runtime', 'system', 'accounts', 'routeOrder']);
  const { runtime, system, accounts } = input;
  const routeOrder = immutable(input.routeOrder);
  assertOwnedFlatSystem(runtime, system);
  assert.ok(Array.isArray(accounts) && accounts.length >= 1 && accounts.length <= 2, 'FLAT_POOL_ROUTES_COUNT');
  assert.ok(Array.isArray(routeOrder) && routeOrder.length === accounts.length
    && new Set(routeOrder).size === accounts.length, 'FLAT_POOL_ROUTES_ORDER');
  const routes = new Map(), indexes = new Set();
  for (const entry of accounts) {
    exactRecord(entry, ['poolIndex', 'account']);
    const { poolIndex, account } = entry;
    assert.ok((poolIndex === 0 || poolIndex === 1) && !indexes.has(poolIndex), 'FLAT_POOL_ROUTES_POOL_INDEX');
    indexes.add(poolIndex); assertOwnedFlatAccountAuthority(account, { runtime, system, poolIndex });
    assert.equal(account.config.registry.length, 1, 'FLAT_POOL_ROUTES_CHILD_ASSET');
    const asset = account.config.registry[0], pool = system.pools[poolIndex];
    assert.equal(asset.pool, bare(pool.address), 'FLAT_POOL_ROUTES_POOL');
    assert.equal(asset.assetIdentity, bare(pool.assetIdentity), 'FLAT_POOL_ROUTES_ASSET');
    assert.ok(routeOrder.includes(asset.assetId) && !routes.has(asset.assetId), 'FLAT_POOL_ROUTES_ORDER');
    const identity = immutable({ version: 1, profile: system.deploymentProfile===FLAT_MINIMUM_PROFILE ? 'ORIGINAL_FLAT_POOL_ROUTE_V3' : system.deploymentProfile === 'LIANUM_FLAT_APPEND_ONLY_POOLS_V2' ? 'ORIGINAL_FLAT_POOL_ROUTE_V2' : 'ORIGINAL_FLAT_POOL_ROUTE_V1',
      ...(system.deploymentProfile===FLAT_MINIMUM_PROFILE ? {minimumDepositAtomic:normalizeMinimumDepositAtomic(pool.minimumDepositAtomic)} : {}),
      ...([FLAT_MINIMUM_PROFILE,'LIANUM_FLAT_APPEND_ONLY_POOLS_V2'].includes(system.deploymentProfile) ? {
        registryProfile: system.deploymentProfile,
        predecessorPool: pool.registrationPin?.predecessor.slice(2) ?? null,
        sourceManifestSHA256: system.provenance.sourceManifestSHA256,
        keyManifestSHA256: system.provenance.keyManifestSHA256,
      } : {}),
      assetId: asset.assetId, economicIdentitySHA256: poolEconomicIdentity(asset),
      accountIdentitySHA256: poolRouteDigest(genericAccountIdentity(account.config)),
      chainId: asset.chainId, genesis: asset.genesis, poolIndex, pool: asset.pool,
      poolCodeHash: bare(pool.codeHash), domain: pool.domain, domainCommitment: bare(pool.domainCommitment),
      hub: bare(system.hub.address), hubCodeHash: bare(system.hub.codeHash), hubDomain: bare(system.hubDomain),
      ledgerNamespace: bare(system.ledgerNamespace), registryCommitment: bare(system.registryCommitment),
      verifierSetCommitment: bare(system.verifierSetCommitment),
      sourceProvenanceSHA256: poolRouteDigest(system.provenance),
      keyLineageSHA256: poolRouteDigest(Object.entries(system.verifiers).map(([role, verifier]) =>
        ({ role, address: verifier.address, codeHash: verifier.codeHash, lineage: verifier.lineage }))) });
    routes.set(asset.assetId, { identity, account, poolIndex,
      reader: await createFlatSystemStateReader({ runtime, system, poolIndex }), previous: null });
  }
  const current = new Map();
  for (const id of routeOrder) { const route = routes.get(id);
    if (!current.has(route.identity.economicIdentitySHA256)) current.set(route.identity.economicIdentitySHA256, id); }
  const operations = new Map(), rotations = [];
  let fenced = false, busy = false;
  const routeFor = id => { const route = routes.get(id); assert.ok(route, 'FLAT_POOL_ROUTES_UNKNOWN_ASSET'); return route; };
  function healthy() {
    assertOwnedFlatSystem(runtime, system);
    assert.equal(describeOwnedFlatPoolRegistry(runtime, system).appendFenced, false, 'FLAT_POOL_ROUTES_APPEND_UNCERTAIN');
    for (const route of routes.values()) assertOwnedFlatAccountAuthority(route.account, { runtime, system, poolIndex: route.poolIndex });
  }
  async function guarded(work) {
    assert.equal(fenced, false, 'FLAT_POOL_ROUTES_ADMISSIONS_FENCED');
    assert.equal(busy, false, 'FLAT_POOL_ROUTES_BUSY'); busy = true;
    try {
      try {
        healthy();
        for (const route of routes.values()) {
          const status = await route.account.privateStatus();
          assert.ok(status.operations.every(entry => !['UNKNOWN', 'EXECUTING', 'RECOVERING'].includes(entry.stage)),
            'FLAT_POOL_ROUTES_ORIGINAL_OUTCOME_UNRESOLVED');
        }
      } catch (error) { fenced = true; throw error; }
      return await work();
    } finally { busy = false; }
  }
  async function read(route) {
    try {
    const view = await route.reader.read(), state = view.ledger.publicState, hub = view.state;
    const capacity = projectPoolCapacity({ leaves: state.leaves, spent: state.spent,
      reservations: state.liveReservations, outputs: state.outputCapacity,
      authorizationLeaves: view.authorizationTree.count, receipts: Number(hub.receiptCount),
      globalSpentTags: Number(hub.spentTagCount), globalReservedTags: Number(hub.totalReservedTagCapacity),
      checkpoints: Number(view.checkpointCount), revoked: Number(hub.revokedCount), halted: hub.halted,
      held: state.actualAssetBalance, liabilities: state.backedAmount, unrelatedNative: state.unrelatedNative });
    const observation = immutable({ routeIdentitySHA256: poolRouteDigest(route.identity),
      sequence: String(state.sequence), hubSequence: hub.stateSequence, blockNumber: view.head.number,
      blockHash: view.head.hash, capacity, commitments: view.ledger.commitments.slice(0, state.leaves),
      nullifiers: view.ledger.nullifiers.slice(0, state.spent), tags: view.spentTags.slice(0, Number(hub.spentTagCount)),
      revokedGIDs: view.revokedEntries.slice(0, Number(hub.revokedCount)) });
    assertPoolHistoryAdvance(route.previous, observation);
    await route.reader.assertCurrent(view); route.previous = observation;
    return { view, observation, capacity };
    } catch (error) { fenced = true; throw error; }
  }
  function operation(request) {
    const original = operations.get(request.ownerOperationRef);
    if (original) assert.deepEqual(original.request, request, 'FLAT_POOL_ROUTES_REQUEST_REBOUND');
    return original;
  }
  async function rotateOriginal(from, to, before, next) {
    assert.equal(current.get(from.identity.economicIdentitySHA256), from.identity.assetId, 'FLAT_POOL_ROUTES_CURRENT_CHANGED');
    assert.ok(routeOrder.indexOf(to.identity.assetId) > routeOrder.indexOf(from.identity.assetId), 'FLAT_POOL_ROUTES_FORWARD_ONLY');
    assert.ok(![...operations.values()].some(value => value.request.assetId === to.identity.assetId), 'FLAT_POOL_ROUTES_SUCCESSOR_ALREADY_BOUND');
    const status = await to.account.privateStatus();
    assert.equal(status.operations.length, 0, 'FLAT_POOL_ROUTES_SUCCESSOR_OWNER_USED');
    assert.deepEqual(before.view.head, next.view.head, 'FLAT_POOL_ROUTES_INCOHERENT_HEAD');
    await from.reader.assertCurrent(before.view); await to.reader.assertCurrent(next.view);
    assertFreshPoolSuccessor(from.identity, to.identity, next.capacity);
    const record = immutable({ version: 1, previous: rotations.length ? poolRouteDigest(rotations.at(-1)) : null,
      from: from.identity, to: to.identity, observed: next.observation,
      retainedOriginal: before.observation, sequence: rotations.length + 1 });
    rotations.push(record); current.set(from.identity.economicIdentitySHA256, to.identity.assetId); return record;
  }
  const policy = Object.freeze({
    identityForAsset: assetId => routeFor(assetId).identity,
    async capacityDecision({ assetId }) { return guarded(async () => {
      const route = routeFor(assetId), checked = await read(route);
      return immutable({ route: route.identity, observed: checked.observation,
        ...projectPoolContinuity(checked.capacity) });
    }); },
    async verifyFreshGeneration() { return guarded(async () => {
      const checked = [];
      for (const route of routes.values()) {
        const status = await route.account.privateStatus();
        assert.equal(status.operations.length, 0, 'FLAT_POOL_ROUTES_GENERATION_OWNER_USED');
        const value = await read(route);
        assert.equal(value.capacity.fresh, true, 'FLAT_POOL_ROUTES_GENERATION_POOL_USED');
        checked.push({ route: route.identity, observed: value.observation, view: value.view, reader: route.reader });
      }
      for (const item of checked) {
        assert.deepEqual(item.view.head, checked[0].view.head, 'FLAT_POOL_ROUTES_INCOHERENT_HEAD');
        await item.reader.assertCurrent(item.view);
      }
      return immutable(checked.map(({ route, observed }) => ({ route, observed })));
    }); },
    async selectTopUp({ assetId, allowRotation = true }) { return guarded(async () => {
      assert.equal(typeof allowRotation, 'boolean', 'FLAT_POOL_ROUTES_SELECTION_ARGUMENTS');
      const anchor = routeFor(assetId); let selected = routeFor(current.get(anchor.identity.economicIdentitySHA256));
      let observed = await read(selected);
      const decision = projectPoolContinuity(observed.capacity).decision;
      assert.ok(decision !== 'FULL_HUB_ROTATION_REQUIRED', 'FLAT_POOL_ROUTES_FULL_HUB_ROTATION_REQUIRED');
      if (decision === 'POOL_SUCCESSOR_REQUIRED' && allowRotation) {
        const candidates = routeOrder.slice(routeOrder.indexOf(selected.identity.assetId) + 1)
          .map(routeFor).filter(route => route.identity.economicIdentitySHA256 === anchor.identity.economicIdentitySHA256);
        for (const candidate of candidates) {
          const next = await read(candidate);
          if (!next.capacity.fresh || !next.capacity.topUp) continue;
          await rotateOriginal(selected, candidate, observed, next); selected = candidate; observed = next; break;
        }
      }
      assert.equal(projectPoolContinuity(observed.capacity).decision,'AVAILABLE','FLAT_POOL_ROUTES_POOL_SUCCESSOR_REQUIRED');
      assert.equal(observed.capacity.topUp, true, 'FLAT_POOL_ROUTES_POOL_SUCCESSOR_REQUIRED');
      return immutable({ assetId: selected.identity.assetId, route: selected.identity,
        observed: observed.observation, keeperRestart: false });
    }); },
    async rotateFreshAdmissions({ fromAssetId, toAssetId }) { return guarded(async () => {
      const from = routeFor(fromAssetId), to = routeFor(toAssetId);
      const before = await read(from), next = await read(to);
      assert.ok(projectPoolContinuity(next.capacity).decision !== 'FULL_HUB_ROTATION_REQUIRED', 'FLAT_POOL_ROUTES_FULL_HUB_ROTATION_REQUIRED');
      return rotateOriginal(from, to, before, next);
    }); },
    // Portfolio calls these at its original boundary. EXIT/reconcile/recover and
    // repeated already-started requests never consult a preferred fresh route.
    async beforePrepare(request) {
      if (request.kind !== 'TOP_UP') return;
      return guarded(async () => {
        const prior = operation(request); if (prior) return;
        const route = routeFor(request.assetId);
        assert.equal(current.get(route.identity.economicIdentitySHA256), request.assetId, 'FLAT_POOL_ROUTES_FRESH_ROUTE_CHANGED');
        const { capacity } = await read(route);
        assert.ok(projectPoolContinuity(capacity).decision !== 'FULL_HUB_ROTATION_REQUIRED', 'FLAT_POOL_ROUTES_FULL_HUB_ROTATION_REQUIRED');
        assert.equal(projectPoolContinuity(capacity).decision,'AVAILABLE','FLAT_POOL_ROUTES_POOL_SUCCESSOR_REQUIRED');
        assert.equal(capacity.topUp, true, 'FLAT_POOL_ROUTES_TOP_UP_CAPACITY');
        operations.set(request.ownerOperationRef, { request: immutable(request), started: false });
      });
    },
    async beforeExecute(request) {
      if (request.kind !== 'TOP_UP') return;
      const original = operation(request);
      assert.ok(original, 'FLAT_POOL_ROUTES_ORIGINAL_PREPARATION_REQUIRED');
      if (original.started) return;
      return guarded(async () => {
        const { capacity } = await read(routeFor(request.assetId));
        assert.equal(projectPoolContinuity(capacity).decision,'AVAILABLE','FLAT_POOL_ROUTES_POOL_SUCCESSOR_REQUIRED');
        assert.equal(capacity.topUp, true, 'FLAT_POOL_ROUTES_TOP_UP_CAPACITY');
        original.started = true;
      });
    },
    status: () => immutable({ profile: 'BOUNDED_ORIGINAL_HUB_ADMISSION_ROUTES_V1', admissionsFenced: fenced,
      appendUncertain: describeOwnedFlatPoolRegistry(runtime, system).appendFenced,
      current: [...current.values()], rotations, originalRoutes: [...routes.values()].map(route => route.identity),
      keeperRestart: false, journalIdentityUnchanged: true, existingLiabilitiesMoved: false,
      globalGraphCapacityExtended: false }),
  });
  owned.set(policy, { runtime, system, accounts: accounts.map(({ poolIndex, account }) => Object.freeze({ poolIndex, account })) }); return policy;
}
