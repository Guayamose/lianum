/** Manual, private owner-local preparation over the original custody and
 * account authority. No server/HTTP route, signer, proof port or automatic work.
 * Custody retains exact manual bindings; reviews/consent remain volatile. */
import { randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { assertOwnedNativeValueOwnerProcess } from '../processes/native-value-owner-process-v2.mjs';
import { assertOwnedNativeValueAccountAuthority } from '../../accounts/authority/native-value-account-authority-v2.mjs';
import { assertOwnedNativeValueWalletSystem } from '../../operations/deployments/native-value/native-value-system-v2.mjs';
import { assertLocalEvm } from '../../chains/evm/runtime/local-evm-ownership.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { validateFlatAccountPrepare } from '../../api/accounts/flat-account-session.mjs';

import { genericAccountIdentity, sha } from '@lianum/engine/accounts/journal';
import { validateNativeValueManualReview, validateNativeValueManualRecords } from '@lianum/custody/preparation/native-value-owner-manual-binding-v1';

const boundOwners = new WeakSet(), boundAccounts = new WeakSet();
const PROFILE = 'LOCAL_NATIVE_VALUE_OWNER_MANUAL_NOTE_PREPARATION_V1';
const match = (value, re) => typeof value === 'string' && re.exec(value)?.[0] === value;
const digest = value => match(value, /^[0-9a-f]{64}$/);
const recipient = value => match(value, /^[0-9a-f]{40}$/) && value !== '0'.repeat(40);
const uint = (value, positive = false) => match(value, /^(0|[1-9][0-9]{0,19})$/)
  && BigInt(value) < 1n << 64n && (!positive || BigInt(value) > 0n);
const fail = suffix => { throw Object.assign(new Error('NATIVE_VALUE_OWNER_PREPARATION_' + suffix),
  { code: 'NATIVE_VALUE_OWNER_PREPARATION_' + suffix }); };
const need = (condition, suffix) => { if (!condition) fail(suffix); };
function detached(value) {
  const copy = structuredClone(value);
  const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } };
  freeze(copy); return copy;
}
function exact(value, fields) {
  try { exactRecord(value, fields); } catch { fail('FIELDS'); }
}
function terms(value, kind, identity) {
  exact(value, ['identitySHA256', 'kind', 'observed', 'eligible', 'note', 'prepared']);
  need(value.kind === kind && value.identitySHA256 === identity && typeof value.eligible === 'boolean', 'ORIGINAL_IDENTITY');
  exact(value.observed, ['blockHash', 'timestamp']);
  need(digest(value.observed.blockHash) && uint(value.observed.timestamp), 'OBSERVATION');
  if (value.note !== null) {
    exact(value.note, ['role', 'amount', 'recipient', 'status', 'observedUnspent']);
    need(value.note.role === (kind === 'deposit' ? 'source' : kind.slice(9)) && uint(value.note.amount, true)
      && recipient(value.note.recipient) && ['UNISSUED', 'AVAILABLE', 'LOCKED', 'SPENT', 'WITHDRAWN'].includes(value.note.status)
      && typeof value.note.observedUnspent === 'boolean', 'NOTE_TERMS');
  }
  if (value.prepared !== null) {
    exact(value.prepared, ['stage', 'epoch', 'amount', 'recipient', 'submissionBound']);
    need(['PREPARED', 'SIGNING', 'AUTHORIZED', 'SUBMITTING', 'UNKNOWN', 'CONFIRMED'].includes(value.prepared.stage)
      && uint(value.prepared.epoch) && uint(value.prepared.amount, true) && recipient(value.prepared.recipient)
      && typeof value.prepared.submissionBound === 'boolean', 'PREPARED_TERMS');
  }
  return detached(value);
}
const epochOf = value => String(BigInt(value.observed.timestamp) / 600n);
function originalTerms(view, review, prepared = false) {
  need(epochOf(view) === review.epoch, 'REVIEW_STALE');
  if (!prepared) need(sha(view.observed) === sha(review.observed), 'REVIEW_STALE');
  if (!prepared) {
    need(view.eligible && view.prepared === null, 'REVIEW_STALE');
    if (review.kind === 'TOP_UP') need(view.note === null, 'REVIEW_STALE');
    else need(view.note?.amount === review.amount && view.note.recipient === review.recipient
      && view.note.observedUnspent && view.note.status === review.noteStatus, 'REVIEW_STALE');
  } else {
    const operation = view.prepared;
    need(!view.eligible && (prepared === 'REGISTERED' ? ['PREPARED', 'SIGNING', 'AUTHORIZED'].includes(operation?.stage) : operation?.stage === 'PREPARED') && !operation.submissionBound
      && operation.amount === review.amount && operation.recipient === review.recipient && operation.epoch === review.epoch
      && view.note?.amount === review.amount && view.note.recipient === review.recipient
      && view.note.status === (review.kind === 'TOP_UP' ? 'UNISSUED' : 'LOCKED')
      && view.note.observedUnspent === (review.kind === 'EXIT'), 'PREPARED_CHANGED');
  }
}

/** Private bootstrap only. Construction does read-only ownership/identity
 * checks. Existing processes/resources are neither created nor restarted. */
export async function createNativeValueOwnerManualPreparation(input) {
  need(arguments.length === 1, 'ARGUMENTS'); return createBridge(input, false);
}
/** Explicit read-only reconstruction around the same surviving branded owner
 * and authority. Cannot review, confirm, register or restore prior consent. */
export async function restoreNativeValueOwnerManualPreparation(input) {
  need(arguments.length === 1, 'ARGUMENTS'); return createBridge(input, true);
}
async function createBridge(input, readOnly) {
  exact(input, ['runtime', 'system', 'poolIndex', 'owner', 'account']);
  const { runtime, system, poolIndex, owner, account } = input;
  need(poolIndex === 0 || poolIndex === 1, 'POOL');
  function original() {
    assertOwnedNativeValueWalletSystem(runtime, system);
    assertOwnedNativeValueOwnerProcess(owner, { runtime, system, poolIndex });
    // Exact original object identity matters: another genuine owner of the same
    // pool is insufficient. No caller assertion/boolean can supply this link.
    assertOwnedNativeValueAccountAuthority(account, { runtime, system, poolIndex, owner });
  }
  original(); await assertLocalEvm(runtime); original();
  need(system.claimsEnabled === false, 'GENERIC_NATIVE_PROFILE_REQUIRED');
  if (!readOnly) need(!boundOwners.has(owner) && !boundAccounts.has(account), 'ALREADY_BOUND');
  const summary = await owner.publicView.summary();
  original(); need(digest(summary?.identitySHA256) && summary.closed === false, 'ORIGINAL_IDENTITY');
  need(account.registry.length === 1 && account.registry[0].assetId === account.assetId, 'ASSET_IDENTITY');
  const asset = detached(account.registry[0]), identity = summary.identitySHA256;
  need(digest(asset.assetId), 'ASSET_IDENTITY');
  need(summary.profile === 'FIXED_LOCAL_FLAT_OWNER_CUSTODY_V1' && summary.manualNoteProfile === 'NATIVE_VALUE_OWNER_NOTE_CONSENT_V1' && digest(summary.keyScopeSHA256)
    && digest(summary.processIdentitySHA256) && Number.isSafeInteger(summary.processGeneration), 'ORIGINAL_KEY_SCOPE');
  const keyScopeSHA256 = summary.keyScopeSHA256, processIdentitySHA256 = summary.processIdentitySHA256;
  const approvals = new Map();
  // Recheck after the asynchronous read to exclude concurrent construction.
  if (!readOnly) need(!boundOwners.has(owner) && !boundAccounts.has(account), 'ALREADY_BOUND');
  const accountIdentitySHA256 = sha(genericAccountIdentity(account.config));
  const retained = await owner.ownerView.nativeNotePreparations();
  original(); validateNativeValueManualRecords(retained);
  for (const { review } of retained.records) {
    need(review.ownerIdentitySHA256 === identity && review.accountIdentitySHA256 === accountIdentitySHA256,
      'ORIGINAL_IDENTITY');
    need(sha(review.asset) === sha(asset), 'ASSET_IDENTITY');
  }
  if (!readOnly) {
    need(!boundOwners.has(owner) && !boundAccounts.has(account), 'ALREADY_BOUND');
    boundOwners.add(owner); boundAccounts.add(account);
  }
  let review = null, busy = false, confirming = false, generation = 0, phase = 'IDLE', errorCode = null;
  const attempts = retained.records.map(({ review }) => ({ request: review.request, review, state: 'UNKNOWN', handoff: null }));
  const kinds = new Set(attempts.map(a => a.review.ownerKind)), ids = new Set(attempts.map(a => a.request.requestId));
  if (attempts.length) phase = 'UNKNOWN';
  const state = () => detached({ version: 1, profile: PROFILE, phase, busy, review, errorCode, attempts,
    capabilities: { preparationOnly: true, readOnly, durableOriginalBinding: true, durableAdmission: false, keeperRestart: false, nativeMobileStorage: false } });
  async function read(kind) {
    original(); const scope = await owner.publicView.summary(); original();
    need(scope.keyScopeSHA256 === keyScopeSHA256 && scope.processIdentitySHA256 === processIdentitySHA256, 'ORIGINAL_KEY_SCOPE');
    const result = await owner.ownerView.preparationTerms({ kind }); original();
    return terms(result, kind, identity);
  }
  const adapter = {
    getState: () => state(),
    originalApproval(requestId) { need(arguments.length === 1 && approvals.has(requestId), 'ORIGINAL_APPROVAL_REQUIRED'); return approvals.get(requestId); },
    async reconcileOriginal(input) {
      need(arguments.length === 1, 'ARGUMENTS'); exact(input, ['requestId']);
      need(!busy, 'UNAVAILABLE'); busy = true;
      // This observes only. No owner restart, preparation, signing, registration,
      // request admission, execution, renewal or persistent state change.
      let attempt = attempts.find(a => a.request.requestId === input.requestId);
      try {
        original(); const current = await owner.ownerView.nativeNotePreparations(); original();
        validateNativeValueManualRecords(current);
        const entry = current.records.find(a => a.review.request.requestId === input.requestId);
        need(entry, 'ORIGINAL_BINDING_UNAVAILABLE');
        const saved = entry.review;
        need(saved.keyScopeSHA256 === keyScopeSHA256 && saved.processIdentitySHA256 === processIdentitySHA256, 'ORIGINAL_KEY_SCOPE');
        need(saved.ownerIdentitySHA256 === identity && saved.accountIdentitySHA256 === accountIdentitySHA256
          && sha(saved.asset) === sha(asset), 'ORIGINAL_IDENTITY');
        if (attempt) need(sha(attempt.review) === sha(saved), 'ORIGINAL_BINDING_CHANGED');
        else { attempt = { request: saved.request, review: saved, state: 'UNKNOWN', handoff: null }; attempts.push(attempt);
          kinds.add(saved.ownerKind); ids.add(saved.request.requestId); }
        attempt.handoff = null; attempt.state = 'UNKNOWN';
        const observed = await read(saved.ownerKind);
        need(entry.ownerState === 'PREPARED', 'ORIGINAL_PREPARATION_UNRESOLVED');
        const registration = await account.ownerActions.readManualRegistration(saved); original();
        exact(registration, ['status']);
        need(['ABSENT', 'REGISTERED', 'ALREADY_ADMITTED'].includes(registration.status), 'ORIGINAL_REGISTRATION_UNRESOLVED');
        if (registration.status === 'ABSENT') fail('ORIGINAL_REGISTRATION_UNRESOLVED');
        if (registration.status === 'ALREADY_ADMITTED') {
          // Already admitted remains in the original account workflow; this
          // read must not produce a replacement admission or spend consent.
          approvals.set(saved.request.requestId, await account.ownerActions.readNativeManualNoteApproval(saved));
          attempt.state = 'ALREADY_ADMITTED'; phase = attempts.some(a => a.state === 'UNKNOWN') ? 'UNKNOWN' : 'ALREADY_ADMITTED'; errorCode = null;
          return detached({ status: 'ALREADY_ADMITTED', handoff: null });
        }
        originalTerms(observed, saved, 'REGISTERED');
        originalTerms(await read(saved.ownerKind), saved, 'REGISTERED');
        approvals.set(saved.request.requestId, await account.ownerActions.readNativeManualNoteApproval(saved));
        attempt.handoff = validateFlatAccountPrepare(saved.request); attempt.state = 'HANDOFF_READY';
        phase = attempts.some(a => a.state === 'UNKNOWN') ? 'UNKNOWN' : 'HANDOFF_READY'; errorCode = null;
        return detached({ status: 'HANDOFF_READY', handoff: attempt.handoff });
      } catch (error) {
        if (attempt) { attempt.state = 'UNKNOWN'; attempt.handoff = null; }
        phase = 'UNKNOWN';
        errorCode = ['NATIVE_VALUE_OWNER_PREPARATION_ORIGINAL_BINDING_UNAVAILABLE',
          'NATIVE_VALUE_OWNER_PREPARATION_ORIGINAL_PREPARATION_UNRESOLVED',
          'NATIVE_VALUE_OWNER_PREPARATION_ORIGINAL_REGISTRATION_UNRESOLVED',
          'NATIVE_VALUE_OWNER_PREPARATION_REVIEW_STALE'].includes(error?.code) ? error.code : 'NATIVE_VALUE_OWNER_PREPARATION_UNKNOWN';
        return detached({ status: 'UNKNOWN', handoff: null });
      } finally { busy = false; }
    },
    async review(input) {
      need(arguments.length === 1, 'ARGUMENTS');
      need(!readOnly && !busy && phase !== 'UNKNOWN', 'UNAVAILABLE');
      generation++; review = null; phase = 'IDLE'; errorCode = null;
      need(input && !types.isProxy(input) && Object.getPrototypeOf(input) === Object.prototype, 'FIELDS');
      const kind = Object.getOwnPropertyDescriptor(input, 'kind')?.value;
      exact(input, kind === 'TOP_UP' ? ['requestId', 'kind', 'amount', 'exitRecipient'] : ['requestId', 'kind', 'role']);
      need(kind === 'TOP_UP' || kind === 'EXIT', 'KIND');
      const ownerKind = kind === 'TOP_UP' ? 'deposit' : 'withdraw_' + input.role;
      need(kind === 'TOP_UP' ? uint(input.amount, true) && recipient(input.exitRecipient) && input.exitRecipient !== asset.pool
        : ['source', 'change', 'recovery'].includes(input.role), 'TERMS');
      need(!kinds.has(ownerKind) && !ids.has(input.requestId), 'ORIGINAL_ONLY');
      const body = validateFlatAccountPrepare({ requestId: input.requestId, kind,
        ownerOperationRef: randomBytes(32).toString('hex'), assetId: asset.assetId });
      const proposal = detached(input); // Never retain caller-mutable values.
      const revision = ++generation; review = null; errorCode = null; phase = 'READING'; busy = true;
      try {
        const value = await read(ownerKind), currentScope = await owner.publicView.summary();
        need(currentScope.keyScopeSHA256 === keyScopeSHA256 && currentScope.processIdentitySHA256 === processIdentitySHA256, 'ORIGINAL_KEY_SCOPE');
        need(generation === revision, 'REVIEW_CANCELLED');
        need(value.eligible && value.prepared === null && (kind === 'TOP_UP' ? value.note === null : value.note?.observedUnspent), 'UNAVAILABLE');
        review = detached({ version: 1, profile: 'NATIVE_VALUE_OWNER_NOTE_REVIEW_V1', keyScopeSHA256, processIdentitySHA256,
          processGeneration: currentScope.processGeneration, originalAccountLifetime: account.config.lifetime,
          generationId: accountIdentitySHA256, request: body, kind, ownerKind, ownerIdentitySHA256: identity, accountIdentitySHA256, asset,
          epoch: epochOf(value), amount: kind === 'TOP_UP' ? proposal.amount : value.note.amount,
          recipient: kind === 'TOP_UP' ? proposal.exitRecipient : value.note.recipient,
          role: kind === 'EXIT' ? proposal.role : null, noteStatus: value.note?.status ?? null,
          observed: value.observed,
          effect: kind === 'TOP_UP' ? 'CREATE_ORIGINAL_PRIVATE_DEPOSIT_PREPARATION' : 'LOCK_ORIGINAL_NOTE_FOR_FULL_WITHDRAWAL_PREPARATION',
          fundingApproval: 'EXISTING_EXACT_TOKEN_ALLOWANCE_REQUIRED_WHEN_APPLICABLE',
          registration: 'ORIGINAL_NATIVE_VALUE_AUTHORITY_OWNER_LOCAL_NOTE_PREPARATION',
          spending: 'SEPARATE_ACCOUNT_PREPARE_AND_EXECUTE_REVIEW_REQUIRED' });
        validateNativeValueManualReview(review); phase = 'REVIEWED'; return detached(review);
      } catch (error) {
        if (generation === revision) { phase = 'IDLE'; errorCode = 'NATIVE_VALUE_OWNER_PREPARATION_REVIEW_UNAVAILABLE'; }
        throw Object.assign(new Error(generation === revision ? 'NATIVE_VALUE_OWNER_PREPARATION_REVIEW_UNAVAILABLE' : 'NATIVE_VALUE_OWNER_PREPARATION_REVIEW_CANCELLED'),
          { code: generation === revision ? 'NATIVE_VALUE_OWNER_PREPARATION_REVIEW_UNAVAILABLE' : 'NATIVE_VALUE_OWNER_PREPARATION_REVIEW_CANCELLED' });
      } finally { busy = false; }
    },
    cancelReview() {
      need(arguments.length === 0, 'ARGUMENTS');
      if (readOnly || confirming || phase === 'UNKNOWN') return false;
      generation++; review = null; phase = 'IDLE'; errorCode = null; return true;
    },
    async confirm() {
      need(arguments.length === 0, 'ARGUMENTS');
      if (readOnly || busy || !review || phase !== 'REVIEWED') return false;
      const accepted = review; review = null; generation++; busy = true; confirming = true; phase = 'CHECKING';
      let mutated = false, attempt = null;
      try {
        originalTerms(await read(accepted.ownerKind), accepted);
        const scope = await owner.publicView.summary();
        need(scope.processGeneration === accepted.processGeneration && scope.processIdentitySHA256 === accepted.processIdentitySHA256
          && scope.keyScopeSHA256 === accepted.keyScopeSHA256, 'REVIEW_STALE');
        original();
        // Latch BEFORE invoking a potentially mutating owner request. Failure
        // or lost replies cannot prove that custody remained unchanged.
        mutated = true; kinds.add(accepted.ownerKind); ids.add(accepted.request.requestId);
        attempt = { request: accepted.request, review: accepted, state: 'UNKNOWN', handoff: null };
        attempts.push(attempt); phase = 'PREPARING';
        const result = await owner.owner.prepareNativeNotePreparation({ review: accepted });
        exact(result, ['kind', 'stage', 'reconcileRequired', 'dispatchAllowed']);
        need(result.kind === accepted.ownerKind && result.stage === 'PREPARED'
          && result.reconcileRequired === false && result.dispatchAllowed === false, 'PREPARED_CHANGED');
        originalTerms(await read(accepted.ownerKind), accepted, true);
        original(); phase = 'REGISTERING';
        const registered = accepted.kind === 'TOP_UP'
          ? await account.ownerActions.registerTopUp(accepted.request.ownerOperationRef)
          : await account.ownerActions.registerExit(accepted.request.ownerOperationRef, accepted.role);
        exact(registered, ['ownerOperationRef', 'kind', 'assetId']);
        for (const key of ['ownerOperationRef', 'kind', 'assetId']) need(registered[key] === accepted.request[key], 'HANDOFF_CHANGED');
        originalTerms(await read(accepted.ownerKind), accepted, 'REGISTERED');
        original();
        approvals.set(accepted.request.requestId, await account.ownerActions.registerNativeManualNote(accepted));
        attempt.handoff = validateFlatAccountPrepare(accepted.request); attempt.state = 'HANDOFF_READY';
        phase = 'HANDOFF_READY'; errorCode = null;
        return detached(attempt.handoff);
      } catch {
        phase = mutated ? 'UNKNOWN' : 'IDLE';
        errorCode = mutated ? 'NATIVE_VALUE_OWNER_PREPARATION_UNKNOWN' : 'NATIVE_VALUE_OWNER_PREPARATION_REVIEW_STALE';
        return false;
      } finally { busy = false; confirming = false; }
    },
  };
  if (readOnly) { delete adapter.review; delete adapter.cancelReview; delete adapter.confirm; }
  Object.defineProperty(adapter, 'toJSON', { value() { fail('CAPABILITY_NOT_SERIALIZABLE'); } });
  return Object.freeze(adapter);
}
