/** Versioned private TOP_UP/EXIT keeper for one original flat authority.
 * No generic/legacy journal adoption, signer, network route, proof callback,
 * background retry or stored-consent execution. Golden generic code unchanged. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Vault } from '@lianum/engine/crypto/vault';
import { PROFILE as GENERIC_PROFILE, genericAccountIdentity, bindGenericAccountRequest, validateBoundRequest,
  validateOutcome, validateObservation, immutable, copy, sha } from '@lianum/engine/accounts/journal';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { assertOwnedFlatPortfolio, claimFlatPortfolioJournalAuthority } from '../authority/flat-portfolio-authority.mjs';
import { validateFlatManualReauthorization } from '@lianum/custody/preparation/flat-owner-manual-binding';
const owned = new WeakMap();
const NDRA = 'NO_DISPATCH_REAUTHORIZATION_REQUIRED';
const PROFILE = 'FLAT_MANUAL_PORTFOLIO_KEEPER_V3';
const RECOVERY_PROFILE = 'EXTERNAL_FLAT_MANUAL_KEEPER_RECOVERY_V1';
const PHASES = ['PREPARING', 'PREPARED', 'SUBMITTING', 'RECOVERING', NDRA, 'REAUTHORIZING', 'UNKNOWN', 'CONFIRMED'];
const fail = code => { throw Object.assign(Error(code), { code }); };
const hex = v => typeof v === 'string' && /^[0-9a-f]{64}$/.exec(v)?.[0] === v;
export function assertOwnedFlatManualPortfolioKeeper(value, expected) {
  const state = owned.get(value); assert.ok(state && !state.closed(), 'FLAT_ACCOUNT_OWNED_MANUAL_KEEPER_REQUIRED');
  for (const key of Object.keys(expected ?? {})) {
    assert.ok(['runtime', 'portfolio'].includes(key));
    assert.equal(state[key], expected[key], 'FLAT_ACCOUNT_ORIGINAL_MANUAL_KEEPER_REQUIRED');
  }
}
export async function createFlatManualPortfolioKeeper(input) {
  return manualPortfolioKeeper(input, null);
}
export async function createRetainedFlatManualPortfolioKeeperV1(input) {
  assert.equal(arguments.length, 1);
  return manualPortfolioKeeper(input, { saved: null });
}
export async function reopenRetainedFlatManualPortfolioKeeperV1(token) {
  assert.equal(arguments.length, 1);
  const { consumeExternalDefiCatalogueKeeperReopenV1 } = await import('../recovery/external-defi-catalogue-recovery-v1.mjs');
  const { input, saved } = consumeExternalDefiCatalogueKeeperReopenV1(token);
  return manualPortfolioKeeper(input, { saved });
}
export function assertRetainedFlatManualPortfolioKeeperIdentityV1(keeper, expectedSaved) {
  assert.equal(arguments.length, 2);
  assertOwnedFlatManualPortfolioKeeper(keeper);
  const state = owned.get(keeper);
  assert.ok(state.retained, 'FLAT_MANUAL_ORIGINAL_RETAINED_KEEPER_REQUIRED');
  state.retained.identity(expectedSaved);
}
export function captureRetainedFlatManualPortfolioKeeperV1(keeper) {
  assert.equal(arguments.length, 1);
  const state = owned.get(keeper);
  assert.ok(state?.retained, 'FLAT_MANUAL_ORIGINAL_RETAINED_KEEPER_REQUIRED');
  return state.retained.capture();
}
async function manualPortfolioKeeper(input, retained) {
  exactRecord(input, ['runtime', 'portfolio', 'journal']);
  const { runtime, portfolio } = input; assertOwnedFlatPortfolio(runtime, portfolio);
  exactRecord(input.journal, ['path', 'password']);
  assert.ok(typeof input.journal.password === 'string' && input.journal.password.length >= 16);
  const path = resolve(input.journal.path), passwordInput = input.journal.password;
  // Atomic one-time child lease belongs to this constructor. Creation failure
  // retains it; no second keeper/parallel journal can adopt these authorities.
  claimFlatPortfolioJournalAuthority(runtime, portfolio);
  const directory = await lstat(dirname(path));
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && (directory.mode & 0o077) === 0);
  async function retainedPath(fileRequired) {
    const parent = await lstat(dirname(path));
    assert.ok(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o777) === 0o700, 'FLAT_MANUAL_RETAINED_PRIVATE_DIRECTORY');
    assert.equal(await realpath(dirname(path)), dirname(path), 'FLAT_MANUAL_RETAINED_PRIVATE_DIRECTORY');
    if (typeof process.getuid === 'function') assert.equal(parent.uid, process.getuid(), 'FLAT_MANUAL_RETAINED_PRIVATE_OWNER');
    if (!fileRequired) return;
    const file = await lstat(path);
    assert.ok(file.isFile() && !file.isSymbolicLink() && file.nlink === 1 && (file.mode & 0o777) === 0o600, 'FLAT_MANUAL_RETAINED_PRIVATE_JOURNAL');
    assert.equal(await realpath(path), path, 'FLAT_MANUAL_RETAINED_PRIVATE_JOURNAL');
    if (typeof process.getuid === 'function') assert.equal(file.uid, process.getuid(), 'FLAT_MANUAL_RETAINED_PRIVATE_OWNER');
  }
  if (retained) await retainedPath(false);
  const vault = new Vault(path), config = portfolio.config, identity = genericAccountIdentity(config), identitySHA256 = sha(identity);
  const journal = immutable({ path, password: passwordInput });
  const account = portfolio;
  const registry = retained ? await import('../../claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs') : null;
  const lifetimeIdentity = { profile: 'EXTERNAL_FLAT_MANUAL_KEEPER_LIFETIME_V1', identity };
  let lifetimeHandle = null, password = passwordInput; input = null;
  let record, checkpoint = null, closed = false, busy = false, fault = false, review = null, capturing = false;
  const requiresReconciliation = new Set();
  const lifetimeState = () => ({ config, journal, checkpoint });
  const onCheckpoint = retained ? async () => {
    await registry.updateWrappedPrivateLifetimePartV1(lifetimeHandle, lifetimeState());
  } : async () => {};
  function validate(data) {
    exactRecord(data, ['version', 'profile', 'identity', 'requests']);
    assert.equal(data.version, 3); assert.equal(data.profile, PROFILE); assert.deepEqual(data.identity, identity);
    assert.ok(Array.isArray(data.requests) && data.requests.length <= 16);
    const ids = new Set(), refs = new Set();
    for (const row of data.requests) {
      exactRecord(row, ['request', 'phase', 'generation', 'history', 'noDispatch', 'pendingReauthorization', 'outcome']);
      validateBoundRequest(row.request, config); assert.ok(['TOP_UP', 'EXIT', 'GRAPH'].includes(row.request.kind));
      if (row.request.kind === 'GRAPH') { assert.equal(row.generation, 0); assert.equal(row.noDispatch, null); assert.equal(row.pendingReauthorization, null); assert.ok(![NDRA, 'REAUTHORIZING'].includes(row.phase)); }
      if (row.phase === 'RECOVERING') assert.equal(row.request.kind, 'GRAPH');
      assert.ok(!ids.has(row.request.requestId) && !refs.has(row.request.ownerOperationRef));
      ids.add(row.request.requestId); refs.add(row.request.ownerOperationRef);
      assert.ok(PHASES.includes(row.phase) && Number.isInteger(row.generation) && row.generation >= 0 && row.generation <= 8);
      assert.ok(Array.isArray(row.history) && row.history.length >= 1 && row.history.length <= 96);
      row.history.forEach((event, index) => {
        exactRecord(event, ['sequence', 'phase', 'generation', 'details']);
        assert.equal(event.sequence, index); assert.ok(PHASES.includes(event.phase));
        assert.ok(Number.isInteger(event.generation) && event.generation >= 0 && event.generation <= row.generation + 1);
      });
      assert.equal(row.history.at(-1).phase, row.phase); assert.equal(row.history.at(-1).generation, row.generation);
      if (row.noDispatch !== null) {
        validateReceiptData(row.noDispatch, row.request); assert.equal(row.noDispatch.type, NDRA);
        assert.equal(row.noDispatch.generation, row.generation);
      }
      if (row.pendingReauthorization !== null) {
        validateFlatManualReauthorization(row.pendingReauthorization);
        assert.equal(row.pendingReauthorization.revision, row.generation + 1);
        assert.ok(row.noDispatch); assert.equal(row.pendingReauthorization.previousAuthorizationSHA256, row.noDispatch.authorizationSHA256);
      }
      if ([NDRA, 'REAUTHORIZING'].includes(row.phase)) assert.ok(row.noDispatch);
      if (row.outcome !== null) validateOutcome(row.outcome, row.request);
      if (row.phase === 'CONFIRMED') assert.ok(row.outcome);
    }
    return data;
  }
  function validateReceiptData(data, request) {
    assert.ok(['TOP_UP', 'EXIT'].includes(request.kind), 'FLAT_MANUAL_GRAPH_REAUTHORIZATION_FORBIDDEN');
    account.manualLifecycle.validateStoredReceiptData(data, request);
  }
  const mark = value => ({ revision: value.revision, stateSHA256: sha(value.data) });
  const makeCheckpoint = (ack, pending = null) => ({ version: 1, identitySHA256, acknowledged: mark(ack), pending: pending ? mark(pending) : null });
  function validateCheckpoint(value) {
    exactRecord(value, ['version', 'identitySHA256', 'acknowledged', 'pending']);
    assert.equal(value.version, 1); assert.equal(value.identitySHA256, identitySHA256);
    exactRecord(value.acknowledged, ['revision', 'stateSHA256']);
    assert.ok(Number.isSafeInteger(value.acknowledged.revision) && value.acknowledged.revision >= 0);
    assert.ok(hex(value.acknowledged.stateSHA256));
    assert.equal(value.pending, null, 'FLAT_MANUAL_DURABLE_WRITE_PENDING');
  }
  function validateSaved(value) {
    exactRecord(value, ['schema', 'config', 'journal', 'checkpoint']);
    assert.equal(value.schema, RECOVERY_PROFILE); assert.deepEqual(value.config, config);
    assert.deepEqual(value.journal, journal); validateCheckpoint(value.checkpoint);
  }
  async function retain(cp) { checkpoint = immutable(cp); await onCheckpoint(checkpoint); }
  async function healthy() {
    assert.ok(!closed && !fault && !capturing, 'FLAT_MANUAL_KEEPER_UNAVAILABLE');
    // Authority loss must not prevent persisting this journal's UNKNOWN. The
    // exact frozen authority was branded at construction; its own ports check
    // availability before every effect or receipt verification.
    assert.deepEqual(await vault.read(password), record, 'FLAT_MANUAL_JOURNAL_CHANGED'); validate(record.data);
  }
  async function save(transform) {
    try {
      await healthy(); const next = { revision: record.revision + 1, data: validate(transform(copy(record.data))) };
      await retain(makeCheckpoint(record, next));
      await vault.update(password, record.revision, previous => { assert.deepEqual(previous, record.data); return next.data; });
      assert.deepEqual(await vault.read(password), next); await retain(makeCheckpoint(next)); record = next;
    } catch (error) { fault = true; throw error; }
  }
  const row = id => { const value = record.data.requests.find(r => r.request.requestId === id); assert.ok(value, 'FLAT_MANUAL_ORIGINAL_REQUIRED'); return value; };
  const transition = (id, phase, fields = {}, details = null) => save(data => {
    const value = data.requests.find(r => r.request.requestId === id); assert.ok(value);
    Object.assign(value, copy(fields)); value.phase = phase;
    value.history.push({ sequence: value.history.length, phase, generation: value.generation, details: copy(details) }); return data;
  });
  async function unknown(id) {
    if (!fault && !closed && row(id).phase !== 'UNKNOWN' && row(id).phase !== 'RECOVERING') await transition(id, 'UNKNOWN', {}, { reason: 'ORIGINAL_LIFECYCLE_UNRESOLVED' });
  }
  const exclusive = async work => {
    assert.ok(!busy && !closed && !capturing, 'FLAT_MANUAL_KEEPER_BUSY'); busy = true;
    try { await healthy(); return await work(); } finally { busy = false; }
  };
  async function acceptReceipt(id, result) {
    exactRecord(result, ['type', 'receipt']); assert.ok([NDRA, 'PREPARED'].includes(result.type));
    const original = row(id);
    // Plain serialized data is never evidence. The exact original authority
    // verifies its opaque object against fresh durable state and owner custody.
    const data = await account.manualLifecycle.verifyReceipt({ keeper, receipt: result.receipt });
    validateReceiptData(data, original.request); assert.equal(data.type, result.type);
    if (result.type === NDRA) {
      assert.equal(data.generation, original.generation);
      if (original.pendingReauthorization) assert.deepEqual(data, original.noDispatch);
      if (original.phase === NDRA && original.pendingReauthorization === null) { assert.deepEqual(data, original.noDispatch); return immutable({ state: NDRA, generation: original.generation }); }
      assert.ok(['SUBMITTING', 'UNKNOWN', 'REAUTHORIZING', NDRA].includes(original.phase));
      await transition(id, NDRA, { noDispatch: data, pendingReauthorization: null }, { receipt: data });
    } else {
      const accepted = original.pendingReauthorization;
      assert.ok(accepted && ['REAUTHORIZING', 'UNKNOWN'].includes(original.phase), 'FLAT_MANUAL_REAUTHORIZATION_ORIGINAL_REQUIRED');
      assert.equal(data.generation, accepted.revision); assert.equal(data.authorizationSHA256, sha(accepted));
      assert.equal(data.epoch, accepted.epoch);
      assert.deepEqual(data.evidence.authorization, accepted); assert.deepEqual(data.evidence.previousNoDispatch, original.noDispatch.evidence);
      await transition(id, 'PREPARED', { generation: data.generation, pendingReauthorization: null, noDispatch: null }, { receipt: data });
    }
    return immutable({ state: row(id).phase, generation: row(id).generation });
  }
  async function acceptOutcome(id, result) {
    exactRecord(result, ['type', 'outcome']); assert.equal(result.type, 'CONFIRMED');
    const original = row(id), outcome = validateOutcome(result.outcome, original.request);
    const challenge = randomBytes(16).toString('hex'), startedAt = Date.now();
    validateObservation(await account.manualLifecycle.observe({ keeper, request: original.request, outcome, challenge }), original.request, outcome,
      { challenge, startedAt, now: Date.now() });
    if (requiresReconciliation.has(id) && original.phase === 'CONFIRMED') {
      assert.deepEqual(outcome, original.outcome, 'FLAT_MANUAL_ORIGINAL_OUTCOME_CHANGED');
      return immutable(original);
    }
    await transition(id, 'CONFIRMED', { outcome }, { outcome }); return immutable(row(id));
  }
  if (retained?.saved) {
    validateSaved(retained.saved);
    const part = await registry.readWrappedPrivateLifetimeIndexedPartV1(runtime, 'wallet-catalogue-keeper', lifetimeIdentity);
    assert.deepEqual(part.privateState, { config, journal, checkpoint: retained.saved.checkpoint }, 'FLAT_MANUAL_RETAINED_CHECKPOINT_CHANGED');
    lifetimeHandle = part.handle; registry.assertWrappedPrivateLifetimePartSealedV1(lifetimeHandle);
    checkpoint = immutable(retained.saved.checkpoint);
    await retainedPath(true);
    record = await vault.read(password); validate(record.data);
    await retainedPath(true);
    assert.deepEqual(mark(record), checkpoint.acknowledged, 'FLAT_MANUAL_ORIGINAL_CHECKPOINT_REQUIRED');
    for (const value of record.data.requests) requiresReconciliation.add(value.request.requestId);
  } else {
    if (retained) lifetimeHandle = await registry.retainWrappedPrivateLifetimeIndexedPartV1(runtime, 'wallet-catalogue-keeper', lifetimeIdentity, lifetimeState());
    // The legacy constructor remains new-file-only. Only the sealed private
    // catalogue token above can open an acknowledged V3 journal anew.
    record = await vault.create({ version: 3, profile: PROFILE, identity, requests: [] }, password); validate(record.data);
    if (retained) await retainedPath(true);
    await retain(makeCheckpoint(record));
  }
  const reconciled = id => assert.ok(!requiresReconciliation.has(id), 'FLAT_MANUAL_ORIGINAL_RECONCILIATION_REQUIRED');
  const keeper = {
    prepare: input => {
      const bound = bindGenericAccountRequest(input, config); assert.ok(['TOP_UP', 'EXIT', 'GRAPH'].includes(bound.kind));
      return exclusive(async () => {
      const existing = record.data.requests.find(r => r.request.requestId === bound.requestId);
      if (existing) {
        assert.deepEqual(existing.request, bound);
        if (existing.phase !== 'PREPARING') return immutable(existing);
        reconciled(bound.requestId);
        // Explicit same-request preparation continuation, never a new ref or
        // execute retry. The original child preparation remains idempotent.
        const prepared = await account.manualLifecycle.prepare({ keeper, request: bound });
        exactRecord(prepared, ['version', 'state', 'bindingSHA256', 'assetBindingSHA256']);
        assert.equal(prepared.version, 1); assert.equal(prepared.state, 'PREPARED');
        assert.equal(prepared.bindingSHA256, bound.bindingSHA256); assert.equal(prepared.assetBindingSHA256, bound.assetBindingSHA256);
        await transition(bound.requestId, 'PREPARED'); return immutable(row(bound.requestId));
      }
      assert.ok(!record.data.requests.some(r => r.request.ownerOperationRef === bound.ownerOperationRef), 'FLAT_MANUAL_ORIGINAL_REFERENCE_ONLY');
      await save(data => ({ ...data, requests: [...data.requests, { request: bound, phase: 'PREPARING', generation: 0,
        noDispatch: null, pendingReauthorization: null, outcome: null,
        history: [{ sequence: 0, phase: 'PREPARING', generation: 0, details: null }] }] }));
      try {
        const prepared = await account.manualLifecycle.prepare({ keeper, request: bound });
        exactRecord(prepared, ['version', 'state', 'bindingSHA256', 'assetBindingSHA256']);
        assert.equal(prepared.version, 1); assert.equal(prepared.state, 'PREPARED');
        assert.equal(prepared.bindingSHA256, bound.bindingSHA256); assert.equal(prepared.assetBindingSHA256, bound.assetBindingSHA256);
        await transition(bound.requestId, 'PREPARED'); return immutable(row(bound.requestId));
      } catch (error) { if (bound.kind !== 'GRAPH') await unknown(bound.requestId); throw error; }
      });
    },
    execute: id => exclusive(async () => {
      reconciled(id);
      const original = row(id); if (original.phase === 'CONFIRMED') return immutable(original);
      assert.equal(original.phase, 'PREPARED', 'FLAT_MANUAL_ORIGINAL_NOT_EXECUTABLE'); review = null;
      await transition(id, 'SUBMITTING');
      try {
        const result = await account.manualLifecycle.execute({ keeper, request: original.request, generation: original.generation });
        if (result.type === NDRA) return await acceptReceipt(id, result);
        return await acceptOutcome(id, result);
      } catch (error) { await unknown(id); throw error; }
    }),
    reconcileOriginal: id => exclusive(async () => {
      const original = row(id); review = null;
      const restored = requiresReconciliation.has(id);
      if (original.phase === 'CONFIRMED' && !restored) return immutable(original);
      assert.ok(['SUBMITTING', 'RECOVERING', NDRA, 'REAUTHORIZING', 'UNKNOWN'].includes(original.phase)
        || (restored && ['PREPARING', 'PREPARED', 'CONFIRMED'].includes(original.phase)));
      try {
        const result = await account.manualLifecycle.observeOriginal({ keeper, request: original.request });
        if (original.phase === 'CONFIRMED') assert.equal(result.type, 'CONFIRMED', 'FLAT_MANUAL_ORIGINAL_OUTCOME_UNRESOLVED');
        if (result.type === 'UNKNOWN') return immutable({ state: original.phase, generation: original.generation });
        let observation;
        if (result.type === 'CONFIRMED') observation = await acceptOutcome(id, result);
        else if (restored && ['PREPARING', 'PREPARED'].includes(original.phase) && result.type === 'PREPARED') {
          exactRecord(result, ['type', 'receipt']);
          const data = await account.manualLifecycle.verifyReceipt({ keeper, receipt: result.receipt });
          validateReceiptData(data, original.request); assert.equal(data.type, 'PREPARED');
          assert.equal(data.generation, original.generation);
          if (original.phase === 'PREPARING') await transition(id, 'PREPARED');
          observation = immutable({ state: 'PREPARED', generation: original.generation });
        } else observation = await acceptReceipt(id, result);
        requiresReconciliation.delete(id); return observation;
      } catch (error) { await unknown(id); throw error; }
    }),
    reconcile: id => keeper.reconcileOriginal(id),
    recover: id => exclusive(async () => {
      reconciled(id);
      const original = row(id); review = null;
      assert.equal(original.request.kind, 'GRAPH', 'FLAT_MANUAL_GRAPH_RECOVERY_ONLY');
      if (original.phase === 'CONFIRMED') return immutable(original);
      assert.ok(['SUBMITTING', 'UNKNOWN', 'RECOVERING'].includes(original.phase));
      if (original.phase !== 'RECOVERING') await transition(id, 'RECOVERING');
      try { return await acceptOutcome(id, await account.manualLifecycle.recover({ keeper, request: original.request })); }
      catch (error) { await unknown(id); throw error; }
    }),
    restartCoordinator: () => keeper.restartJournal(), // same in-process coordinator; never creates a replacement keeper
    reviewReauthorization: id => exclusive(async () => {
      reconciled(id);
      review = null; const original = row(id); assert.ok(['TOP_UP', 'EXIT'].includes(original.request.kind), 'FLAT_MANUAL_GRAPH_REAUTHORIZATION_FORBIDDEN'); assert.equal(original.phase, NDRA);
      const accepted = await account.manualLifecycle.reviewReauthorization({ keeper, request: original.request });
      validateFlatManualReauthorization(accepted);
      assert.equal(accepted.revision, original.generation + 1);
      assert.equal(accepted.previousAuthorizationSHA256, original.noDispatch.authorizationSHA256);
      review = immutable(accepted); return review;
    }),
    cancelReview() { if (busy) return false; review = null; return true; },
    async confirmReauthorization() {
      if (busy || !review || closed) return false;
      const accepted = review; review = null; // consume before first await; never resumed from disk
      return exclusive(async () => {
        const id = accepted.request.requestId; reconciled(id); const original = row(id); assert.equal(original.phase, NDRA);
        await transition(id, 'REAUTHORIZING', { pendingReauthorization: accepted }, { authorization: accepted });
        try {
          const result = await account.manualLifecycle.reauthorize({ keeper, request: original.request, authorization: accepted });
          return await acceptReceipt(id, result);
        } catch (error) { await unknown(id); throw error; }
      });
    },
    snapshot: () => exclusive(async () => immutable({ version: 1, profile: GENERIC_PROFILE, accountId: config.accountId,
      revision: record.revision, storageAvailable: !fault, requests: record.data.requests.map(value => ({
        requestId: value.request.requestId, assetId: value.request.assetId, kind: value.request.kind,
        state: requiresReconciliation.has(value.request.requestId) || [NDRA, 'REAUTHORIZING'].includes(value.phase) ? 'UNKNOWN' : value.phase,
        errorCode: requiresReconciliation.has(value.request.requestId) ? 'FLAT_MANUAL_ORIGINAL_RECONCILIATION_REQUIRED'
          : value.phase === NDRA ? 'FLAT_ACCOUNT_OWNER_REAUTHORIZATION_REQUIRED'
          : value.phase === 'REAUTHORIZING' ? 'FLAT_ACCOUNT_OWNER_REAUTHORIZATION_UNRESOLVED'
          : ['UNKNOWN', 'RECOVERING'].includes(value.phase) ? 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED' : null })) })),
    privateStatus: () => exclusive(async () => immutable({ ...record.data, revision: record.revision, pendingReview: review })),
    restartJournal: async () => {
      assert.ok(!busy && !closed && !capturing); busy = true; review = null;
      try {
        const actual = await vault.read(password); validate(actual.data);
        assert.deepEqual(mark(actual), checkpoint.pending ?? checkpoint.acknowledged, 'FLAT_MANUAL_ORIGINAL_CHECKPOINT_REQUIRED');
        await retain(makeCheckpoint(actual)); record = actual; fault = false; return { available: true, consentRestored: false };
      } catch (error) { fault = true; throw error; } finally { busy = false; }
    },
    close() { if (closed) return { closed: true }; assert.ok(!busy && !capturing); closed = true; review = null; password = null; return { closed: true }; },
    toJSON() { fail('FLAT_MANUAL_KEEPER_NOT_SERIALIZABLE'); },
  };
  const retainedState = retained ? {
    identity(expectedSaved) {
      validateSaved(expectedSaved);
      assert.deepEqual(expectedSaved.checkpoint, checkpoint, 'FLAT_MANUAL_RETAINED_CHECKPOINT_CHANGED');
      registry.assertWrappedPrivateLifetimePartSealedV1(lifetimeHandle);
    },
    async capture() {
      assert.ok(!closed && !busy && !fault && !capturing, 'FLAT_MANUAL_RETAINED_CAPTURE_UNAVAILABLE');
      registry.assertWrappedPrivateLifetimePartSealedV1(lifetimeHandle); validateCheckpoint(checkpoint);
      capturing = true; review = null; // fence the original before the first await
      try {
        await retainedPath(true);
        assert.deepEqual(await vault.read(password), record, 'FLAT_MANUAL_JOURNAL_CHANGED'); validate(record.data);
        await retainedPath(true);
        assert.deepEqual(mark(record), checkpoint.acknowledged, 'FLAT_MANUAL_ORIGINAL_CHECKPOINT_REQUIRED');
        const part = await registry.readWrappedPrivateLifetimeIndexedPartV1(runtime, 'wallet-catalogue-keeper', lifetimeIdentity);
        assert.equal(part.handle, lifetimeHandle); assert.deepEqual(part.privateState, lifetimeState(), 'FLAT_MANUAL_RETAINED_CHECKPOINT_CHANGED');
        const saved = immutable({ schema: RECOVERY_PROFILE, config, journal, checkpoint });
        closed = true; password = null; return saved;
      } catch (error) { fault = true; closed = true; password = null; throw error; }
    },
  } : null;
  Object.freeze(keeper); owned.set(keeper, { runtime, portfolio, closed: () => closed || capturing, retained: retainedState });
  try { account.manualLifecycle.bindKeeper(keeper); } catch (error) { keeper.close(); throw error; }
  return keeper;
}
