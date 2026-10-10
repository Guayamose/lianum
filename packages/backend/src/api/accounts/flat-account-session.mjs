/** Local presentation boundary over one already-created, surviving keeper.
 * Admissions below are volatile UI state, never a second account journal. */
import { types } from 'node:util';
import {assertOriginalGenericAccountKeeperV1} from '@lianum/engine/accounts/keeper';
import {readOriginalNativeClaimPortfolioViewV1} from '../../claims/operations/portfolio-view.mjs';

export const FLAT_ACCOUNT_API_PROFILE = 'LOCAL_FLAT_ACCOUNT_API_V1';
export const FLAT_ACCOUNT_ADMISSION_LIMIT = 32;
const sessions = new WeakSet();
const originalClaimSessions = new WeakMap();
export function assertOriginalNativeClaimEconomicSessionV1(session, expected) {
  need(arguments.length === 2, 'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED');
  record(expected, ['runtime', 'view'], 'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED');
  assertFlatAccountSession(session); const original = originalClaimSessions.get(session);
  need(original && original.ownerView() === expected.view, 'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED');
  const view=readOriginalNativeClaimPortfolioViewV1(expected.view, expected.runtime); original.live();
  assertOriginalGenericAccountKeeperV1(original.keeper(),{config:view.portfolio.config,authority:view.portfolio.authority});
}
export async function readOriginalNativeClaimEconomicSnapshotV1(session, expected) {
  need(arguments.length === 2, 'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED');
  assertOriginalNativeClaimEconomicSessionV1(session, expected);
  const result = await originalClaimSessions.get(session).snapshot();
  assertOriginalNativeClaimEconomicSessionV1(session, expected); return result;
}
const actions = new Set(['prepare', 'execute', 'reconcile', 'recover', 'restartCoordinator', 'close']);
const states = new Set(['PREPARING', 'PREPARED', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED']);
const kinds = new Set(['TOP_UP', 'GRAPH', 'EXIT']);
// JavaScript's $ can match before a final line terminator. Compare the complete
// match with the original input so canonical wire values cannot retain one.
const wholeMatch = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const requestId = value => wholeMatch(value, /^[A-Za-z0-9_-]{8,100}$/);
const hex = value => wholeMatch(value, /^[0-9a-f]{64}$/);
const copy = value => structuredClone(value);

function fail(code) { throw Object.assign(new Error(code), { code }); }
function need(condition, code) { if (!condition) fail(code); }
function record(value, fields, code) {
  need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  need(keys.length === fields.length && fields.every(key =>
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')), code);
}
function method(value, name, code) {
  need(value && !types.isProxy(value), code);
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  need(descriptor && typeof descriptor.value === 'function', code);
}

export function flatAccountErrorCode(error) {
  // Neither an exception message nor a keeper response is a public payload.
  const candidate = error?.code ?? error?.message;
  return wholeMatch(candidate, /^(?:FLAT_ACCOUNT|JOURNAL)_[A-Z0-9_]{1,90}$/)
    ? candidate : 'FLAT_ACCOUNT_OPERATION_FAILED';
}

export function validateFlatAccountPrepare(input) {
  record(input, ['requestId', 'kind', 'ownerOperationRef', 'assetId'], 'FLAT_ACCOUNT_REQUEST_FIELDS');
  need(requestId(input.requestId) && kinds.has(input.kind) && hex(input.ownerOperationRef) && hex(input.assetId),
    'FLAT_ACCOUNT_REQUEST');
  return Object.freeze({ requestId: input.requestId, kind: input.kind,
    ownerOperationRef: input.ownerOperationRef, assetId: input.assetId });
}

function command(action, input) {
  need(actions.has(action), 'FLAT_ACCOUNT_ACTION');
  if (action === 'prepare') return validateFlatAccountPrepare(input);
  if (action === 'restartCoordinator' || action === 'close') {
    record(input, [], 'FLAT_ACCOUNT_REQUEST_FIELDS');
    return Object.freeze({});
  }
  record(input, ['requestId'], 'FLAT_ACCOUNT_REQUEST_FIELDS');
  need(requestId(input.requestId), 'FLAT_ACCOUNT_REQUEST');
  return Object.freeze({ requestId: input.requestId });
}

function publicJournal(value) {
  need(value && value.version === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0
    && typeof value.storageAvailable === 'boolean' && Array.isArray(value.requests)
    && value.requests.length <= 128, 'FLAT_ACCOUNT_SNAPSHOT_INVALID');
  const seen = new Set();
  const requests = value.requests.map(row => {
    need(row && requestId(row.requestId) && !seen.has(row.requestId) && kinds.has(row.kind)
      && states.has(row.state), 'FLAT_ACCOUNT_SNAPSHOT_INVALID');
    seen.add(row.requestId);
    return { requestId: row.requestId, kind: row.kind, state: row.state,
      errorCode: row.errorCode === null ? null : flatAccountErrorCode({ code: row.errorCode }) };
  });
  // accountId, assetId, registry, holdings, refs, outcomes and all extension
  // fields are deliberately absent, including fields a future keeper adds.
  return { revision: value.revision, storageAvailable: value.storageAvailable, requests };
}

export function assertFlatAccountSession(session) {
  need(sessions.has(session), 'FLAT_ACCOUNT_ORIGINAL_SESSION_REQUIRED');
}

/** PRIVATE bootstrap only. No factories, serialized capabilities, replacement
 * authority, runtime URLs, journal paths or owner witnesses are accepted. */
export async function createFlatAccountSession(input) {
  record(input, ['keeper', 'ownerHandoff'], 'FLAT_ACCOUNT_BOOTSTRAP_FIELDS');
  for (const name of ['prepare', 'execute', 'reconcile', 'recover', 'snapshot', 'restartCoordinator', 'close'])
    method(input.keeper, name, 'FLAT_ACCOUNT_KEEPER_REQUIRED');
  method(input.ownerHandoff, 'ownerView', 'FLAT_ACCOUNT_OWNER_HANDOFF_REQUIRED');
  let keeper = input.keeper, ownerHandoff = input.ownerHandoff;
  let journal = { revision: null, storageAvailable: false, requests: [] };
  let available = false, errorCode = null, closed = false, closing = false;
  let tail = Promise.resolve(), refreshPending = null, shutdownPending = null, ownerReadPending = false;
  let pending = 0, running = false, sequence = 0;
  const admissions = [];
  input = null;

  function view() {
    return copy({ version: 1, profile: FLAT_ACCOUNT_API_PROFILE,
      phase: closed ? 'CLOSED' : available ? 'READY' : 'UNAVAILABLE',
      available: available && !closed, busy: running, queued: pending - Number(running),
      observation: available && !pending && !closed ? 'CURRENT' : 'STALE',
      revision: journal.revision, storageAvailable: available && journal.storageAvailable,
      errorCode, requests: journal.requests, admissions,
      capabilities: { coordinatorRestart: Boolean(keeper) && !closed, keeperRestart: false,
        nodeRestart: false, fullWalletAcceptance: false } });
  }

  function enqueue(work) {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  }

  async function observe() {
    if (!keeper || closed) return view();
    const original = keeper;
    try {
      const observed = await original.snapshot();
      if (keeper !== original || closed) return view();
      journal = publicJournal(observed);
      available = journal.storageAvailable;
      errorCode = available ? null : 'JOURNAL_STORAGE_UNAVAILABLE';
    } catch (error) {
      if (keeper !== original || closed) return view();
      available = false;
      errorCode = flatAccountErrorCode(error);
    }
    return view();
  }

  function submit(action, input) {
    // Snapshot caller-owned input before any asynchronous boundary.
    const body = command(action, input);
    need(keeper && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
    need(pending < FLAT_ACCOUNT_ADMISSION_LIMIT, 'FLAT_ACCOUNT_ADMISSION_BUSY');
    // Only the original coordinator's restart can repair an unavailable journal.
    need(available || action === 'restartCoordinator' || action === 'close', 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
    if (action === 'close') closing = true;
    const admission = { sequence: ++sequence, action, requestId: body.requestId ?? null,
      state: 'ADMITTED', errorCode: null };
    admissions.push(admission);
    if (admissions.length > FLAT_ACCOUNT_ADMISSION_LIMIT) admissions.shift();
    pending++;
    void enqueue(async () => {
      running = true;
      admission.state = 'RUNNING';
      try {
        need(keeper && !closed, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
        need(available || action === 'restartCoordinator' || action === 'close', 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
        if (action === 'prepare') await keeper.prepare(body);
        else if (action === 'restartCoordinator' || action === 'close') await keeper[action]();
        else await keeper[action](body.requestId);
        // Never derive a confirmed account outcome from an HTTP acknowledgement
        // or the mutation's return value. Only the keeper snapshot supplies it.
        admission.state = 'SUCCEEDED';
        if (action === 'close') {
          closed = true; available = false; keeper = null; ownerHandoff = null;
          errorCode = 'FLAT_ACCOUNT_CLOSED';
        }
      } catch (error) {
        admission.state = 'FAILED';
        admission.errorCode = flatAccountErrorCode(error);
        if (action === 'close') closing = false;
      } finally {
        await observe();
        running = false;
        pending--;
      }
    });
    return copy({ version: 1, admitted: true, sequence: admission.sequence,
      action, requestId: admission.requestId });
  }

  const session = Object.freeze({
    submit,
    prepare: request => submit('prepare', request),
    execute: id => submit('execute', { requestId: id }),
    reconcile: id => submit('reconcile', { requestId: id }),
    recover: id => submit('recover', { requestId: id }),
    restartCoordinator: () => submit('restartCoordinator', {}),
    async snapshot() {
      // Proof/native work may be long. Polling must not contend with the keeper
      // or stall the local UI until that work completes.
      if (pending || closed || !keeper) return view();
      if (!refreshPending) refreshPending = enqueue(observe).finally(() => { refreshPending = null; });
      await refreshPending;
      return view();
    },
    async ownerView() {
      need(keeper && ownerHandoff && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
      need(!pending && !ownerReadPending, 'FLAT_ACCOUNT_OWNER_VIEW_BUSY');
      ownerReadPending = true;
      try {
        return await enqueue(async () => {
          await observe();
          need(keeper && ownerHandoff && available && !closed, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
          const original = keeper, originalOwner = ownerHandoff;
          // The private handoff is solely a portfolio/status view; its producer
          // must never return keys, full graph openings or proof witnesses.
          const result = await originalOwner.ownerView();
          need(keeper === original && ownerHandoff === originalOwner && !closed,
            'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
          return copy(result);
        });
      } finally { ownerReadPending = false; }
    },
    async idle() { await tail; return view(); },
    close() {
      return shutdownPending ??= (async () => {
        if (!closed && !closing && keeper) {
          // Shutdown remains possible even when every admission slot is full.
          // Stop new admissions before waiting for the accepted queue to drain.
          closing = true;
          await tail;
          if (keeper && !closed) { closing = false; submit('close', {}); }
        }
        await tail;
        return view();
      })().finally(() => { shutdownPending = null; });
    },
    async quiesceForPrivateRecovery() {
      need(keeper&&!closed&&!closing,'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');closing=true;
      await tail;
      need(keeper&&!closed,'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
      // The original owner captures its durable keeper separately. The UI
      // session loses all admission and owner-view access before it returns.
      closed=true;available=false;keeper=null;ownerHandoff=null;
      return view();
    },
    // Private lifecycle notification, deliberately absent from the HTTP routes.
    // Losing the original capability cannot be repaired by supplying another.
    keeperUnavailable() {
      keeper = null; ownerHandoff = null; available = false;
      errorCode = 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE';
      return view();
    },
  });
  sessions.add(session);
  originalClaimSessions.set(session, {keeper:()=>keeper,ownerView: () => ownerHandoff?.ownerView,
    live() {need(keeper && ownerHandoff && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');},
    async snapshot() {
      const original = keeper; need(original && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
      const snapshot = await original.snapshot();
      need(keeper === original && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
      publicJournal(snapshot);
      return copy({revision: snapshot.revision, storageAvailable: snapshot.storageAvailable,
        requests: snapshot.requests.map(q => {need(hex(q.assetId), 'FLAT_ACCOUNT_SNAPSHOT_INVALID');
          return {requestId:q.requestId, assetId:q.assetId, kind:q.kind, state:q.state};}),
        busy:running, queued:pending - Number(running), observation:available && !pending ? 'CURRENT' : 'STALE'});
    }});
  await observe();
  return session;
}
