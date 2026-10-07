/** Reusable host cohort controller. No runtime, keys, deposits or authority are
 * created here. Callbacks are trusted keeper code, never client capabilities.
 * This is scheduling/replay control, not native or privacy acceptance. */
import assert from 'node:assert/strict';
import {createPrivateCohortStageGate, wrapPrivateCohortOperationHost, PRIVATE_COHORT_STAGES} from './private-cohort-gate.mjs';

export const REUSABLE_ASSET_COHORT_PROFILE = 'PC26_REUSABLE_ASSET_COHORT_HOST_V1';
export const MAX_COHORT_CONSENT_MS = 15 * 60_000;
const TERM_KEYS = ['budget', 'solCompensation', 'amountSol', 'numerator', 'denominator'];
const ENROLL_KEYS = ['requestId', 'assetId', 'intentId', 'operationId', 'terms', 'consentToWait', 'expiresAt'];
const PHASE = {reservation:'PREPARING_RESERVATIONS', sol:'SOL_BATCH', btc:'BTC_BATCH', settlement:'SETTLING'};
const clone = value => structuredClone(value);
const fail = code => Object.assign(new Error(code), {code});
const check = (value, code) => { if (!value) throw fail(code); };
const exact = (value, keys, code) => check(value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), code);
const owner = value => check(value === 0 || value === 1, 'PC26_OWNER_INDEX');
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
const codeOf = e => /^[A-Z][A-Z0-9_]{1,100}$/.test(e?.code ?? '') ? e.code : /^[A-Z][A-Z0-9_]{1,100}$/.test(e?.message ?? '') ? e.message : 'PC26_ORIGINAL_OPERATION_FAILED';
const freeze = value => { for (const part of Object.values(value)) if (part && typeof part === 'object') freeze(part); return Object.freeze(value); };

function enrollment(input) {
  exact(input, ENROLL_KEYS, 'PC26_ENROLLMENT_FIELDS');
  check(identity(input.requestId) && /^[0-9a-f]{32}$/.test(input.intentId) && /^[0-9a-f]{32}$/.test(input.operationId), 'PC26_REQUEST_IDENTITY');
  check(typeof input.assetId === 'string' && /^[0-9a-f]{64}$/.test(input.assetId), 'PC26_ASSET_IDENTITY');
  exact(input.terms, TERM_KEYS, 'PC26_PAYMENT_TERMS');
  for (const key of TERM_KEYS) check(typeof input.terms[key] === 'string' && /^[1-9][0-9]{0,19}$/.test(input.terms[key]) && BigInt(input.terms[key]) < 1n << 64n, 'PC26_PAYMENT_TERMS');
  check(BigInt(input.terms.budget) > BigInt(input.terms.solCompensation), 'PC26_PAYMENT_TERMS');
  check(input.consentToWait === true, 'PC26_EXPLICIT_WAIT_CONSENT_REQUIRED');
  check(Number.isSafeInteger(input.expiresAt), 'PC26_BOUNDED_CONSENT_REQUIRED');
  return freeze(clone(input));
}

/** validateAdmission(context) must return the ORIGINAL journal record with
 * matching requestId/assetId/intentId/operationId/kind/terms and state PREPARED.
 * It must also check original authorization, pinned pool/asset and note backing.
 * expiresAt bounds waiting/matching only. A valid explicit start commits that
 * consent; original signed protocol cutoffs/permits govern later execution.
 * validateRound({roundNumber, assetId, requests, authorities}) runs under the
 * original reservation mutation lease, before the first prepare call. It must
 * revalidate both exact original admissions together: same pool, distinct owner
 * notes and combined backing/capacity. It returns the exact attestation below.
 * executeRequest(context) executes that exact original account request using
 * the original durable journal, finality, proof and revocation checks.
 * recoverRequest(context, input) may only recover/exit original custody; it
 * must never resend the payment or replace its source note/operation.
 * assertRoundResolved({round, authorities}) must independently inspect original
 * authorities and return {roundNumber, noUnresolvedObligations:true,
 * noUsableAuthorizations:true}. This includes signed/submitted authorizations
 * and uncertain dispatch, not just a zero on-chain reservation count. Valid
 * backed change/payout notes are allowed, unresolved obligations are not.
 * onCheckpoint is a required trusted private durable-ACK sink. This controller has
 * no cold restore or authority-recreation API. Keep this controller alive with
 * its original authorities; do not replace it to evade its identity ledger. */
export function createReusableAssetCohortController({
  cohortId, authorities, mutate, validateAdmission, validateRound, executeRequest, recoverRequest,
  assertRoundResolved, fatalShutdown, onCheckpoint, now = Date.now, chooseOrder,
  maxRounds = 4, fatalShutdownTimeoutMs = 60_000,
}) {
  check(identity(cohortId), 'PC26_COHORT_ID');
  check(Array.isArray(authorities) && authorities.length === 2 && authorities.every(a => a && typeof a === 'object') && authorities[0] !== authorities[1], 'PC26_EXISTING_OWNER_AUTHORITIES_REQUIRED');
  for (const callback of [mutate, validateAdmission, validateRound, executeRequest, recoverRequest, assertRoundResolved, fatalShutdown, onCheckpoint, now]) check(typeof callback === 'function', 'PC26_TRUSTED_CALLBACK_REQUIRED');
  check(Number.isSafeInteger(maxRounds) && maxRounds >= 1 && maxRounds <= 8, 'PC26_ROUND_LIMIT');
  check(Number.isSafeInteger(fatalShutdownTimeoutMs) && fatalShutdownTimeoutMs > 0 && fatalShutdownTimeoutMs <= 60_000, 'PC26_SHUTDOWN_BOUND');
  const pinned = Object.freeze([...authorities]);
  const makeRound = number => ({number, state:'WAITING_FOR_COHORT', errorCode:null, participants:[null,null], started:false, active:false, cancelled:false, gate:null, run:null});
  let round = makeRound(1), commandQueue = Promise.resolve(), checkpointQueue = Promise.resolve();
  let sequence = 0, checkpointFault = false, fatal = false, shutdownPromise, expiryTimer;
  const rounds = [round], identities = new Map(), requests = new Map();
  const serial = work => { const task = commandQueue.then(work); commandQueue = task.catch(() => {}); return task; };
  const live = () => check(!fatal, 'PC26_AUTHORITY_UNAVAILABLE');
  const progress = p => ({dispatched:p.dispatched, exposureAttempted:{...p.exposure}, stages:p.round.gate?.completion(p.ownerIndex) ?? Object.fromEntries(PRIVATE_COHORT_STAGES.map(s => [s,false]))});
  const roundStatus = r => ({roundNumber:r.number, state:r.state, active:r.active, joined:r.participants.filter(Boolean).length, assetId:r.participants.find(Boolean)?.request.assetId ?? null, errorCode:r.errorCode});
  const status = () => ({profile:REUSABLE_ASSET_COHORT_PROFILE, cohortId, ...roundStatus(round), authorityAvailable:!fatal, checkpointAvailable:!checkpointFault, roundsUsed:rounds.length, maxRounds, privacyEvaluation:'NOT_EVALUATED', transparentFallback:false});
  const recordStatus = p => clone({...roundStatus(p.round), ownerIndex:p.ownerIndex, request:p.request, consent:p.consent, progress:progress(p)});
  const context = (p, phase) => Object.freeze({authority:pinned[p.ownerIndex], ownerIndex:p.ownerIndex, roundNumber:p.round.number, request:p.request, phase});
  const clearExpiry = () => { clearTimeout(expiryTimer); expiryTimer = undefined; };
  function quarantine(r, errorCode) {
    r.cancelled = true; r.gate?.abort(errorCode); r.errorCode = errorCode;
    r.state = fatal ? 'FATAL_UNAVAILABLE' : 'QUARANTINED'; clearExpiry();
  }
  function checkpoint(r = round, repair = false) {
    // Private journal metadata only. Original proof objects/host arguments never
    // enter this checkpoint or the other owner's callback.
    const value = freeze(clone({profile:REUSABLE_ASSET_COHORT_PROFILE, cohortId, sequence:++sequence, rounds:rounds.map(r => ({...roundStatus(r), participants:r.participants.filter(Boolean).map(p => ({ownerIndex:p.ownerIndex, request:p.request, consent:p.consent, progress:progress(p)}))}))}));
    const work = checkpointQueue.then(async () => {
      check(!checkpointFault || repair, 'PC26_CHECKPOINT_FAILED');
      await onCheckpoint(value);
      if (repair) checkpointFault = false;
    });
    checkpointQueue = work.catch(() => { checkpointFault = true; quarantine(round, 'PC26_CHECKPOINT_FAILED'); });
    return work;
  }
  function fresh(r) {
    check(!r.cancelled && !fatal, 'PC26_COHORT_CANCELLED');
    check(r.participants.every(p => p && (r.started || p.consent.expiresAt > now())), 'PC26_TWO_FRESH_CONSENTS_REQUIRED');
    assert.deepEqual(r.participants[0].request.terms, r.participants[1].request.terms, 'PC26_TERMS_MISMATCH');
    check(r.participants[0].request.assetId === r.participants[1].request.assetId, 'PC26_ASSET_MISMATCH');
  }
  function scheduleExpiry(r) {
    clearExpiry();
    const dates = r.participants.filter(Boolean).map(p => p.consent.expiresAt);
    if (!dates.length || r.cancelled || !['WAITING_FOR_COHORT','READY_FOR_REVIEW'].includes(r.state) && !r.active) return;
    expiryTimer = setTimeout(() => { void expire().catch(() => {}); }, Math.max(0, Math.min(...dates) - now()));
    expiryTimer.unref?.();
  }
  async function admitted(p, phase) {
    const original = await validateAdmission(context(p, phase));
    check(original && original.state === 'PREPARED', 'PC26_ORIGINAL_ADMISSION_REQUIRED');
    assert.deepEqual(Object.fromEntries(['requestId','assetId','intentId','operationId','kind','terms'].map(k => [k,original[k]])), p.request, 'PC26_ORIGINAL_REQUEST_CHANGED');
  }
  async function enroll(ownerIndex, input) {
    owner(ownerIndex); const consent = enrollment(input);
    return serial(async () => {
      live();
      const old = requests.get(consent.requestId);
      if (old) {
        check(old.ownerIndex === ownerIndex, 'PC26_REQUEST_OWNER_CHANGED');
        assert.deepEqual(old.consent, consent, 'PC26_REQUEST_REPLAY_CHANGED');
        return {...recordStatus(old), replayed:true};
      }
      check(!checkpointFault && ['WAITING_FOR_COHORT','READY_FOR_REVIEW'].includes(round.state) && !round.cancelled, 'PC26_ROUND_NOT_JOINABLE');
      const r = round;
      check(!r.participants[ownerIndex], 'PC26_OWNER_ALREADY_ENROLLED');
      check(consent.expiresAt > now() && consent.expiresAt - now() <= MAX_COHORT_CONSENT_MS, 'PC26_BOUNDED_CONSENT_REQUIRED');
      const ids = [consent.requestId, consent.intentId, consent.operationId];
      check(new Set(ids).size === 3 && ids.every(id => !identities.has(id)), 'PC26_GLOBAL_IDENTITY_REUSE');
      const peer = r.participants[1-ownerIndex];
      if (peer) {
        check(peer.consent.expiresAt > now(), 'PC26_CONSENT_EXPIRED');
        check(peer.request.assetId === consent.assetId, 'PC26_ASSET_MISMATCH');
        assert.deepEqual(peer.request.terms, consent.terms, 'PC26_TERMS_MISMATCH');
      }
      const request = freeze({...Object.fromEntries(['requestId','assetId','intentId','operationId','terms'].map(k => [k,consent[k]])), kind:'payment'});
      const p = {ownerIndex, request, consent, round:r, dispatched:false, wrapped:false, exposure:{reservation:false,sol:false,btc:false,settlement:false}};
      await admitted(p, 'enroll');
      live(); check(!r.cancelled && consent.expiresAt > now(), 'PC26_CONSENT_EXPIRED_OR_CANCELLED');
      for (const id of ids) identities.set(id,p);
      requests.set(request.requestId,p); r.participants[ownerIndex] = p;
      r.state = r.participants.every(Boolean) ? 'READY_FOR_REVIEW' : 'WAITING_FOR_COHORT';
      await checkpoint(r); scheduleExpiry(r);
      return {...recordStatus(p), replayed:false};
    });
  }
  function isOperationActive(ownerIndex, operationId) {
    owner(ownerIndex); const p = round.participants[ownerIndex];
    try { round.gate?.guard(); } catch { return false; }
    return Boolean(!fatal && !checkpointFault && round.active && !round.cancelled && p?.dispatched && p.request.operationId === operationId);
  }
  function wrapOperationHost(ownerIndex, operationId, host) {
    owner(ownerIndex); check(isOperationActive(ownerIndex, operationId), 'PC26_ENROLLED_ACTIVE_OPERATION_REQUIRED');
    const p = round.participants[ownerIndex], r = round;
    check(!p.wrapped, 'PC26_ORIGINAL_HOST_ALREADY_WRAPPED'); p.wrapped = true;
    return wrapPrivateCohortOperationHost(host, {gate:r.gate, ownerIndex, onExposure:async (_index, kind, role) => {
      fresh(r); check(!checkpointFault, 'PC26_CHECKPOINT_FAILED');
      p.exposure[kind === 'reserve' ? 'reservation' : kind === 'claim' ? 'settlement' : role] = true;
      await checkpoint(r); fresh(r); r.gate.guard();
    }});
  }
  async function run(r) {
    try {
      const results = await Promise.allSettled(r.participants.map(async p => {
        try {
          fresh(r); r.gate.guard(); p.dispatched = true;
          await executeRequest(context(p, 'execute'));
          check(p.wrapped && PRIVATE_COHORT_STAGES.every(stage => r.gate.completion(p.ownerIndex)[stage]), 'PC26_ORIGINAL_STAGES_INCOMPLETE');
        } catch (e) { await r.gate.fail(p.ownerIndex, e).catch(() => {}); throw e; }
      }));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      r.gate.guard(); check(!r.cancelled && !fatal, 'PC26_COHORT_CANCELLED');
      r.state = 'SETTLED_IN_POOL'; r.errorCode = null;
      await checkpoint(r);
    } catch (e) {
      quarantine(r, checkpointFault ? 'PC26_CHECKPOINT_FAILED' : r.errorCode ?? codeOf(e));
      await r.gate.idle();
    } finally {
      r.active = false; clearExpiry();
      await checkpoint(r).catch(() => {});
    }
    return status();
  }
  function start() {
    return serial(async () => {
      live(); const r = round;
      check(!checkpointFault && r.state === 'READY_FOR_REVIEW' && !r.started, 'PC26_ROUND_NOT_READY');
      fresh(r);
      for (const p of r.participants) { await admitted(p, 'start'); fresh(r); }
      // Persist both bindings before either original account execution begins.
      await checkpoint(r); fresh(r);
      r.gate = createPrivateCohortStageGate({mutate, chooseOrder,
        onPhase:async stage => {
          fresh(r);
          if (stage === 'reservation') {
            const attestation = await validateRound(Object.freeze({roundNumber:r.number, assetId:r.participants[0].request.assetId, requests:Object.freeze(r.participants.map(p => p.request)), authorities:pinned}));
            assert.deepEqual(attestation, {roundNumber:r.number, assetId:r.participants[0].request.assetId, requestIds:r.participants.map(p => p.request.requestId), samePool:true, distinctOwnerNotes:true, capacityAvailable:true}, 'PC26_ROUND_ADMISSION_REQUIRED');
            fresh(r);
          }
          r.state = PHASE[stage]; await checkpoint(r); fresh(r);
        },
        onCompletion:async () => { await checkpoint(r); },
      });
      // Final consent check commits the explicit start. Matching timers never
      // replace the original protocol's native/claim expiration checks.
      fresh(r); r.started = true; r.active = true; clearExpiry();
      r.run = run(r); r.run.catch(() => {});
      return status();
    });
  }
  function cancel(ownerIndex) {
    owner(ownerIndex); live(); const r = round;
    check(r.participants[ownerIndex], 'PC26_ORIGINAL_ENROLLMENT_REQUIRED');
    if (['SETTLED_IN_POOL','CANCELLED_NO_DISPATCH','EXPIRED_NO_DISPATCH','QUARANTINED'].includes(r.state)) return Promise.resolve(recordStatus(r.participants[ownerIndex]));
    r.cancelled = true; r.errorCode = 'PC26_OWNER_CANCELLED'; r.gate?.abort(r.errorCode); clearExpiry();
    r.state = r.started ? 'CANCELLATION_PENDING' : 'CANCELLED_NO_DISPATCH';
    return serial(async () => { await checkpoint(r); return recordStatus(r.participants[ownerIndex]); });
  }
  function expire() {
    const r = round;
    if (fatal || r.started || r.cancelled || r.state === 'SETTLED_IN_POOL' || !r.participants.some(p => p && p.consent.expiresAt <= now())) return Promise.resolve(false);
    r.cancelled = true; r.errorCode = 'PC26_CONSENT_EXPIRED'; r.gate?.abort(r.errorCode); clearExpiry();
    r.state = r.started ? 'CANCELLATION_PENDING' : 'EXPIRED_NO_DISPATCH';
    return serial(async () => { await checkpoint(r); return true; });
  }
  function beginNextRound() {
    return serial(async () => {
      live(); check(!round.active, 'PC26_COHORT_STILL_EXECUTING'); await round.run; live();
      check(!checkpointFault && !round.active && ['SETTLED_IN_POOL','CANCELLED_NO_DISPATCH','EXPIRED_NO_DISPATCH','RESOLVED'].includes(round.state), 'PC26_ROUND_UNRESOLVED');
      check(rounds.length < maxRounds, 'PC26_ROUND_LIMIT');
      clearExpiry(); round = makeRound(rounds.length+1); rounds.push(round); await checkpoint(); return status();
    });
  }
  function resetFailedRound() {
    return serial(async () => {
      live(); const r = round; check(!r.active, 'PC26_COHORT_STILL_EXECUTING'); await r.run; live();
      check(!r.active && r.state === 'QUARANTINED', 'PC26_FAILED_ROUND_REQUIRED');
      const attestation = await mutate('cohort-verify-recovery', () => { live(); return assertRoundResolved(Object.freeze({round:freeze(clone({...roundStatus(r), requests:r.participants.filter(Boolean).map(p => p.request)})), authorities:pinned})); });
      exact(attestation, ['roundNumber','noUnresolvedObligations','noUsableAuthorizations'], 'PC26_RESOLUTION_ATTESTATION_REQUIRED');
      check(attestation.roundNumber === r.number && attestation.noUnresolvedObligations === true && attestation.noUsableAuthorizations === true, 'PC26_UNRESOLVED_ORIGINAL_OBLIGATIONS');
      live(); r.state = 'RESOLVED'; r.errorCode = null;
      // An explicit successful write is necessary to repair a failed sink.
      await checkpoint(r, true); return status();
    });
  }
  function recover(ownerIndex, requestId, input) {
    owner(ownerIndex);
    return serial(async () => {
      live(); check(!round.active, 'PC26_COHORT_STILL_EXECUTING');
      const p = requests.get(requestId); check(p?.ownerIndex === ownerIndex, 'PC26_ORIGINAL_RECOVERY_REQUIRED');
      check(['QUARANTINED','SETTLED_IN_POOL','RESOLVED'].includes(p.round.state), 'PC26_ORIGINAL_RECOVERY_REQUIRED');
      // Only reconciliation is lease-free in the original wallet engine.
      // Explicit refund/exit actions use the ordinary serialized account path.
      check(input && input.action === 'reconcile', 'PC26_RECOVERY_ACTION');
      // Quarantine, journal capacity and controller checkpoint failure do not
      // remove access to the surviving original authority's recovery path.
      const result = await mutate('cohort-original-recovery', () => { live(); return recoverRequest(context(p, 'recover'), input); });
      await checkpoint(p.round).catch(() => {});
      return {result, checkpointAvailable:!checkpointFault};
    });
  }
  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    fatal = true; clearExpiry(); const r = round;
    quarantine(r, 'PC26_AUTHORITY_UNAVAILABLE');
    const teardown = Promise.resolve().then(() => fatalShutdown(Object.freeze({authorities:pinned, roundNumber:r.number})));
    shutdownPromise = (async () => {
      let timer;
      const outcome = await Promise.race([
        Promise.allSettled([teardown, r.run, commandQueue]).then(results => results.some(x => x.status === 'rejected') ? 'PC26_FATAL_SHUTDOWN_FAILED' : 'PC26_AUTHORITY_UNAVAILABLE'),
        new Promise(resolve => { timer = setTimeout(() => resolve('PC26_FATAL_SHUTDOWN_TIMEOUT'), fatalShutdownTimeoutMs); }),
      ]);
      clearTimeout(timer); r.state = 'FATAL_UNAVAILABLE'; r.errorCode = outcome;
      // Shutdown must not wait indefinitely for a failed/stalled journal sink.
      void checkpoint(r).catch(() => {}); return status();
    })();
    return shutdownPromise;
  }
  return Object.freeze({enroll, start, wrapOperationHost, isOperationActive, cancel, expire, beginNextRound, resetFailedRound, recover, shutdown, status,
    requestStatus(ownerIndex, requestId) { owner(ownerIndex); const p = requests.get(requestId); check(p?.ownerIndex === ownerIndex, 'PC26_ORIGINAL_REQUEST_REQUIRED'); return recordStatus(p); },
    async idle() { await commandQueue; await round.run; await checkpointQueue; return status(); },
  });
}
