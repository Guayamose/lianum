/** Versioned private TOP_UP/EXIT keeper for one original flat authority.
 * No generic/legacy journal adoption, signer, network route, proof callback,
 * background retry or stored-consent execution. Golden generic code unchanged. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { PROFILE as GENERIC_PROFILE, genericAccountIdentity, bindGenericAccountRequest, validateBoundRequest,
  validateOutcome, validateObservation, immutable, copy, sha } from '@lianum/engine/accounts/journal';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { assertOwnedFlatAccountAuthority } from '../authority/flat-account-authority.mjs';
import { assertOwnedFlatOwnerProcess } from '../../../../custody/src/processes/flat-owner-process.mjs';
import { validateFlatManualReauthorization } from '../../../../custody/src/preparation/flat-owner-manual-binding.mjs';
const owned = new WeakMap();
const NDRA = 'NO_DISPATCH_REAUTHORIZATION_REQUIRED';
const PROFILE = 'FLAT_MANUAL_ACCOUNT_KEEPER_V2';
const PHASES = ['PREPARING', 'PREPARED', 'SUBMITTING', NDRA, 'REAUTHORIZING', 'UNKNOWN', 'CONFIRMED'];
const fail = code => { throw Object.assign(Error(code), { code }); };
const hex = v => typeof v === 'string' && /^[0-9a-f]{64}$/.exec(v)?.[0] === v;
export function assertOwnedFlatManualAccountKeeper(value, expected) {
  const state = owned.get(value); assert.ok(state && !state.closed(), 'FLAT_ACCOUNT_OWNED_MANUAL_KEEPER_REQUIRED');
  for (const key of Object.keys(expected ?? {})) {
    assert.ok(['runtime', 'system', 'poolIndex', 'owner', 'account'].includes(key));
    assert.equal(state[key], expected[key], 'FLAT_ACCOUNT_ORIGINAL_MANUAL_KEEPER_REQUIRED');
  }
}
export async function createFlatManualAccountKeeper(input) {
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'owner', 'account', 'path', 'password', 'onCheckpoint']);
  const { runtime, system, poolIndex, owner, account } = input;
  assertOwnedFlatAccountAuthority(account, { runtime, system, poolIndex, owner });
  assertOwnedFlatOwnerProcess(owner, { runtime, system, poolIndex });
  assert.equal(typeof input.onCheckpoint, 'function'); assert.ok(typeof input.password === 'string' && input.password.length >= 16);
  const path = resolve(input.path), directory = await lstat(dirname(path));
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && (directory.mode & 0o077) === 0);
  const vault = new Vault(path), config = account.config, identity = genericAccountIdentity(config), identitySHA256 = sha(identity);
  const onCheckpoint = input.onCheckpoint; let password = input.password; input = null;
  let record, checkpoint = null, closed = false, busy = false, fault = false, review = null;
  function validate(data) {
    exactRecord(data, ['version', 'profile', 'identity', 'requests']);
    assert.equal(data.version, 2); assert.equal(data.profile, PROFILE); assert.deepEqual(data.identity, identity);
    assert.ok(Array.isArray(data.requests) && data.requests.length <= 4);
    const ids = new Set(), refs = new Set();
    for (const row of data.requests) {
      exactRecord(row, ['request', 'phase', 'generation', 'history', 'noDispatch', 'pendingReauthorization', 'outcome']);
      validateBoundRequest(row.request, config); assert.ok(['TOP_UP', 'EXIT'].includes(row.request.kind));
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
    exactRecord(data, ['version', 'type', 'ownerIdentitySHA256', 'accountIdentitySHA256', 'request', 'generation', 'epoch', 'authorizationSHA256', 'evidence']);
    assert.equal(data.version, 1); assert.ok([NDRA, 'PREPARED'].includes(data.type));
    assert.deepEqual(data.request, request); assert.equal(data.accountIdentitySHA256, identitySHA256);
    assert.ok(hex(data.ownerIdentitySHA256) && hex(data.authorizationSHA256));
    assert.ok(Number.isInteger(data.generation) && data.generation >= 0 && data.generation <= 8);
    assert.ok(typeof data.epoch === 'string' && /^(0|[1-9][0-9]{0,19})$/.exec(data.epoch)?.[0] === data.epoch);
    if (data.type === NDRA) {
      const e = data.evidence;
      exactRecord(e, ['version', 'profile', 'bindingSHA256', 'ownerIdentitySHA256', 'accountIdentitySHA256', 'generation',
        'authorizationSHA256', 'epoch', 'observedEpoch', 'reason']);
      assert.equal(e.version, 1); assert.equal(e.profile, 'FLAT_MANUAL_NO_DISPATCH_V1');
      assert.equal(e.bindingSHA256, request.bindingSHA256); assert.equal(e.reason, 'EPOCH_EXPIRED_BEFORE_ORIGINAL_SUBMISSION');
      for (const key of ['ownerIdentitySHA256', 'accountIdentitySHA256', 'generation', 'authorizationSHA256', 'epoch']) assert.equal(e[key], data[key]);
      assert.ok(BigInt(e.observedEpoch) > BigInt(e.epoch));
    }
  }
  const mark = value => ({ revision: value.revision, stateSHA256: sha(value.data) });
  const makeCheckpoint = (ack, pending = null) => ({ version: 1, identitySHA256, acknowledged: mark(ack), pending: pending ? mark(pending) : null });
  async function retain(cp) { checkpoint = immutable(cp); await onCheckpoint(checkpoint); }
  async function healthy() {
    assert.ok(!closed && !fault, 'FLAT_MANUAL_KEEPER_UNAVAILABLE');
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
    if (!fault && !closed && row(id).phase !== 'UNKNOWN') await transition(id, 'UNKNOWN', {}, { reason: 'ORIGINAL_LIFECYCLE_UNRESOLVED' });
  }
  const exclusive = async work => {
    assert.ok(!busy && !closed, 'FLAT_MANUAL_KEEPER_BUSY'); busy = true;
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
    validateObservation(await account.authority.observe({ request: original.request, outcome, challenge }), original.request, outcome,
      { challenge, startedAt, now: Date.now() });
    await transition(id, 'CONFIRMED', { outcome }, { outcome }); return immutable(row(id));
  }
  // New file only. Vault.create refuses an existing generic, unsupported or
  // arbitrary file without rewriting any bytes. Journal restart stays on this
  // original keeper object and its retained checkpoint, never a second keeper.
  record = await vault.create({ version: 2, profile: PROFILE, identity, requests: [] }, password); validate(record.data);
  await retain(makeCheckpoint(record));
  const keeper = {
    prepare: input => {
      const bound = bindGenericAccountRequest(input, config); assert.ok(['TOP_UP', 'EXIT'].includes(bound.kind));
      return exclusive(async () => {
      const existing = record.data.requests.find(r => r.request.requestId === bound.requestId);
      if (existing) { assert.deepEqual(existing.request, bound); return immutable(existing); }
      assert.ok(!record.data.requests.some(r => r.request.ownerOperationRef === bound.ownerOperationRef), 'FLAT_MANUAL_ORIGINAL_REFERENCE_ONLY');
      await save(data => ({ ...data, requests: [...data.requests, { request: bound, phase: 'PREPARING', generation: 0,
        noDispatch: null, pendingReauthorization: null, outcome: null,
        history: [{ sequence: 0, phase: 'PREPARING', generation: 0, details: null }] }] }));
      try {
        await account.manualLifecycle.prepare({ keeper, request: bound });
        await transition(bound.requestId, 'PREPARED'); return immutable(row(bound.requestId));
      } catch (error) { await unknown(bound.requestId); throw error; }
      });
    },
    execute: id => exclusive(async () => {
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
      if (original.phase === 'CONFIRMED') return immutable(original);
      assert.ok(['SUBMITTING', NDRA, 'REAUTHORIZING', 'UNKNOWN'].includes(original.phase));
      try {
        const result = await account.manualLifecycle.observeOriginal({ keeper, request: original.request });
        if (result.type === 'CONFIRMED') return await acceptOutcome(id, result);
        if (result.type === 'UNKNOWN') return immutable({ state: original.phase, generation: original.generation });
        return await acceptReceipt(id, result);
      } catch (error) { await unknown(id); throw error; }
    }),
    reconcile: id => keeper.reconcileOriginal(id),
    recover: async () => { fail('FLAT_MANUAL_GRAPH_RECOVERY_UNSUPPORTED'); },
    restartCoordinator: () => keeper.restartJournal(), // same in-process coordinator; never creates a replacement keeper
    reviewReauthorization: id => exclusive(async () => {
      review = null; const original = row(id); assert.equal(original.phase, NDRA);
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
        const id = accepted.request.requestId, original = row(id); assert.equal(original.phase, NDRA);
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
        state: [NDRA, 'REAUTHORIZING'].includes(value.phase) ? 'UNKNOWN' : value.phase,
        errorCode: value.phase === NDRA ? 'FLAT_ACCOUNT_OWNER_REAUTHORIZATION_REQUIRED'
          : value.phase === 'REAUTHORIZING' ? 'FLAT_ACCOUNT_OWNER_REAUTHORIZATION_UNRESOLVED'
          : value.phase === 'UNKNOWN' ? 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED' : null })) })),
    privateStatus: () => exclusive(async () => immutable({ ...record.data, revision: record.revision, pendingReview: review })),
    restartJournal: async () => {
      assert.ok(!busy && !closed); busy = true; review = null;
      try {
        const actual = await vault.read(password); validate(actual.data);
        assert.deepEqual(mark(actual), checkpoint.pending ?? checkpoint.acknowledged, 'FLAT_MANUAL_ORIGINAL_CHECKPOINT_REQUIRED');
        await retain(makeCheckpoint(actual)); record = actual; fault = false; return { available: true, consentRestored: false };
      } catch (error) { fault = true; throw error; } finally { busy = false; }
    },
    close() { assert.ok(!busy); closed = true; review = null; password = null; return { closed: true }; },
    toJSON() { fail('FLAT_MANUAL_KEEPER_NOT_SERIALIZABLE'); },
  };
  Object.freeze(keeper); owned.set(keeper, { runtime, system, poolIndex, owner, account, closed: () => closed });
  try { account.manualLifecycle.bindKeeper(keeper); } catch (error) { keeper.close(); throw error; }
  return keeper;
}
