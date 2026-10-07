/** One owner-scoped native-claim account over an original controller. Durable
 * admission precedes acknowledgment. Reopening a UI never replays a job.
 * Native custody and RPC authority remain in the trusted local bootstrap. */
import assert from 'node:assert/strict';
import { AssertionError } from 'node:assert';
import { createHash } from 'node:crypto';
import { exactRecord, bytes32 } from '../../execution/encoding/commitments.mjs';
import { claimUint, claimDomainCommitment } from '../../claims/protocol/framing.mjs';
import { ownedClaimControllerJournal as nativeJournal } from '../../claims/controller/controller-journal.mjs';
import { ownedNativeClaimControllerBindings as nativeBindings, restartNativeClaimController as nativeRestart } from '../../claims/controller/controller.mjs';

const wrappedSessions = new WeakSet();
const sessions = new WeakMap(), identities = new WeakMap(), leasedControllers = new WeakSet();
const requestId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(value)?.[0] === value;
const copy = value => structuredClone(value);
const fail = code => Object.assign(new Error(code), { code });
const need = (value, code) => { if (!value) throw fail(code); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const LEGACY_PROFILE = 'OWNED_LOCAL_DURABLE_NATIVE_CLAIM_ACCOUNT_V1';

export function nativeClaimApiErrorCode(error) {
  // Node assertions carry ERR_ASSERTION even with an explicit protocol code.
  // Return only that custom code, never the appended actual/expected values.
  // Ordinary multiline errors remain opaque; this is not an RPC-text parser.
  const value = error instanceof AssertionError && error.generatedMessage === false
    ? error.message.split('\n', 1)[0] : error?.code ?? error?.message;
  return typeof value === 'string' && /^(?:NATIVE_CLAIM|CLAIM|VAULT|SOLANA|BITCOIN|LOCAL_EVM|ROLE_CLIENT|FLAT_OPERATOR|COMBINED_OPERATOR)_[A-Z0-9_]{1,100}$/.exec(value)?.[0] === value
    ? value : 'NATIVE_CLAIM_OPERATION_FAILED';
}
export function assertNativeClaimSession(value) { need(sessions.has(value) && !wrappedSessions.has(value), 'NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED'); }
/** Private lifecycle accessor, intentionally absent from HTTP. */
export function nativeClaimSessionController(value) { assertNativeClaimSession(value); return sessions.get(value)(); }
/** Original configuration metadata only: no live custody/balance observation,
 * serialized authority, controller access, RPC or lifecycle work. */
export function nativeClaimSessionIdentity(value) {
  need(arguments.length === 1, 'NATIVE_CLAIM_IDENTITY_ARGUMENTS');
  assertNativeClaimSession(value); return identities.get(value);
}

function originalIdentity(claims, account, wrapped = false) {
  need(Array.isArray(claims.configs), 'NATIVE_CLAIM_REGISTERED_DOMAIN_REQUIRED');
  const matches = claims.configs.filter(config => claimDomainCommitment(config) === account.claimDomain);
  need(matches.length === 1, 'NATIVE_CLAIM_REGISTERED_DOMAIN_REQUIRED');
  const config = matches[0], bitcoin = config.nativeFamily === '1';
  // These are the fixed deployed NativeClaimToken family semantics, not caller
  // labels, a portfolio ordering guess, or independently spendable native funds.
  return Object.freeze({ version: 1, profile: wrapped ? 'ORIGINAL_WRAPPED_CLAIM_SESSION_IDENTITY_V1' : 'ORIGINAL_NATIVE_CLAIM_SESSION_IDENTITY_V1',
    accountId: account.accountId, claimDomain: account.claimDomain,
    nativeFamily: config.nativeFamily, nativeGenesis: config.nativeGenesis, nativeAsset: config.nativeAsset,
    wrapperAssetIdentity: config.wrapperAssetIdentity, claimSymbol: bitcoin ? 'cBTC' : 'cSOL',
    nativeSymbol: bitcoin ? 'BTC' : 'SOL', decimals: bitcoin ? 8 : 9, atomicUnit: bitcoin ? 'satoshi' : 'lamport',
    observation: 'ORIGINAL_BOUND_CONFIGURATION_ONLY' });
}

function command(action, raw) {
  const fields = action === 'deposit' || action === 'refund' ? ['requestId', 'intentId']
    : action === 'redeem' ? ['requestId', 'amount', 'maxFee']
      : ['reconcile', 'resume', 'restartKeeper'].includes(action) ? ['requestId']
        : action === 'close' ? [] : null;
  need(fields, 'NATIVE_CLAIM_ACTION');
  exactRecord(raw, fields);
  if (action !== 'close') need(requestId(raw.requestId), 'NATIVE_CLAIM_REQUEST_ID');
  if (Object.hasOwn(raw, 'intentId')) bytes32(raw.intentId, true);
  if (action === 'redeem') {
    need(claimUint(raw.amount) > 0n && claimUint(raw.maxFee) > 0n, 'NATIVE_CLAIM_AMOUNT');
  }
  return copy(raw);
}

/** This binding is supplied by the private application bootstrap after a real
 * mobile-owner handoff has been prepared in this keeper. No HTTP caller can
 * choose another owner, caller account, claim domain or native destination. */
export function assertWrappedClaimSessionV1(value) { need(wrappedSessions.has(value), 'WRAPPED_CLAIM_ORIGINAL_SESSION_REQUIRED'); }
export function assertWalletClaimSession(value) { need(sessions.has(value), 'NATIVE_CLAIM_ORIGINAL_SESSION_REQUIRED'); }
export function walletClaimSessionIdentity(value) { assertWalletClaimSession(value); return identities.get(value); }
export function wrappedClaimSessionControllerV1(value) { assertWrappedClaimSessionV1(value); return sessions.get(value)(); }
export async function createNativeClaimSession(input) { return createClaimSession(input, false); }
export async function createWrappedClaimSessionV1(input) {
  need(arguments.length === 1, 'WRAPPED_WALLET_NO_OVERRIDES');
  const { assertWrappedWalletAccountReleasedV1 } = await import('../../operations/releases/wrapped/wrapped-wallet-release-v1.mjs');
  assertWrappedWalletAccountReleasedV1(); return createClaimSession(input, true);
}
async function createClaimSession(input, wrapped) {
  // Fixed original module selection. There is no public adapter/journal/callback slot.
  const original = wrapped ? await import('../../claims/wrapped/controller/wrapped-controller-v1.mjs') : null;
  const journalModule = wrapped ? await import('../../claims/wrapped/controller/wrapped-controller-journal-v1.mjs') : null;
  const ownedNativeClaimControllerBindings = wrapped ? original.ownedWrappedNativeClaimControllerBindingsV1 : nativeBindings;
  const restartNativeClaimController = wrapped ? original.restartWrappedNativeClaimControllerV1 : nativeRestart;
  const ownedClaimControllerJournal = wrapped ? journalModule.ownedClaimControllerJournal : nativeJournal;
  const PROFILE = wrapped ? 'OWNED_LOCAL_DURABLE_WRAPPED_CLAIM_ACCOUNT_V1' : LEGACY_PROFILE;
  exactRecord(input, ['controller', 'accountId', 'ownerIdentitySHA256', 'claimDomain', 'caller']);
  need(requestId(input.accountId), 'NATIVE_CLAIM_ACCOUNT_ID');
  bytes32(input.ownerIdentitySHA256, true); bytes32(input.claimDomain, true);
  let controller = input.controller;
  const { runtime, claims, keeper } = ownedNativeClaimControllerBindings(controller);
  need(keeper.status().keeperRestart, 'NATIVE_CLAIM_DURABLE_KEEPER_REQUIRED');
  need(runtime.accounts.includes(input.caller), 'NATIVE_CLAIM_OWNED_CALLER');
  const account = { accountId: input.accountId, ownerIdentitySHA256: input.ownerIdentitySHA256,
    claimDomain: input.claimDomain, caller: input.caller };
  const identity = originalIdentity(claims, account, wrapped);
  const journal = ownedClaimControllerJournal(keeper, runtime, claims);
  need(!leasedControllers.has(controller), 'NATIVE_CLAIM_CONTROLLER_SESSION_BUSY');
  leasedControllers.add(controller);
  let closed = false, closing = false, active = false, available = true, lastError = null;
  let tail = Promise.resolve(), pending = 0, admitting = 0, revision = 0;
  let visible = [], ownerStatus = null, refreshPending = null, ownerReadPending = false;
  const jobs = new Set();

  function ownedDeposit(data, id) {
    const row = data.deposits.find(item => item.id === id);
    need(row && row.claimDomain === account.claimDomain
      && row.packet.ownerIdentitySHA256 === account.ownerIdentitySHA256, 'NATIVE_CLAIM_OWNER_INTENT_REQUIRED');
    return row;
  }
  function rows(data) { return data.apiAdmissions.filter(row => row.accountId === account.accountId); }
  function locate(data, id) {
    const row = rows(data).find(item => item.requestId === id);
    need(row, 'NATIVE_CLAIM_UNKNOWN_REQUEST'); return row;
  }
  function project(row) {
    return { requestId: row.requestId, action: row.action, state: row.state, errorCode: row.errorCode };
  }
  async function refresh() {
    try {
      const data = await journal.read(); visible = rows(data).map(project); revision++;
      available = !keeper.status().uncertain; lastError = null;
    } catch (error) { available = false; lastError = nativeClaimApiErrorCode(error); }
  }
  function view() {
    return copy({ version: 1, profile: PROFILE, phase: closed ? 'CLOSED' : available ? 'READY' : 'UNAVAILABLE',
      storageAvailable: available && !closed, busy: active, queued: Math.max(0, pending + admitting - Number(active)), revision,
      observation: 'DURABLE_JOURNAL_ONLY', errorCode: lastError, requests: visible,
      requiresExternalEffectReconciliation: keeper.status().requiresExternalEffectReconciliation,
      capabilities: { keeperRestart: !closed, nativeNodeRestart: false, operatorKeyRestart: false,
        nativeSelfCustody: false, fullWalletAcceptance: false } });
  }
  function enqueue(work) {
    const result = tail.then(work); tail = result.catch(() => {}); return result;
  }
  async function drain() {
    // Accepted admissions may append their execution after their write returns.
    // Follow the changing tail until both admissions and jobs are drained.
    for (;;) { const observed = tail; await observed;
      if (observed === tail && pending === 0 && admitting === 0) return; }
  }
  async function replaceKeeper() {
    const previous = controller;
    controller = await restartNativeClaimController(controller);
    leasedControllers.delete(previous); leasedControllers.add(controller);
  }
  async function change(id, update) {
    await journal.update(data => { Object.assign(locate(data, id), copy(update)); return data; });
    await refresh();
  }
  async function reconcile(row) {
    await controller.reconcileAll({});
    const data = await journal.read();
    if (row.action === 'deposit' || row.action === 'refund') {
      ownedDeposit(data, row.request.intentId);
      return controller.reconcile({ operationId: row.request.intentId });
    }
    if (row.action === 'redeem') {
      const ticket = data.tickets.find(item => item.redemptionRequestId === row.controllerRequestId);
      return ticket ? controller.reconcile({ operationId: ticket.id }) : null;
    }
    return null;
  }
  function complete(row, result) {
    return row.action === 'deposit' ? result?.status === 'ISSUED'
      : row.action === 'refund' ? result?.status === 'REFUNDED'
        : row.action === 'redeem' ? result?.status === 'DISCHARGED' : false;
  }
  async function execute(row) {
    if (row.action === 'restartKeeper') {
      if (!row.reopenedBeforeAdmission) await replaceKeeper();
      need(!keeper.status().requiresExternalEffectReconciliation, 'CLAIM_KEEPER_RECONCILIATION_REQUIRED');
      return { completed: true, result: { keeperRestarted: true, nativeNodeRestart: false } };
    }
    let result = await reconcile(row);
    if (complete(row, result)) return { completed: true, result };
    if (row.action === 'deposit') {
      result = await controller.preposition({ intentId: row.request.intentId });
      if (result.status !== 'ISSUED') {
        await controller.ingress({ intentId: row.request.intentId });
        result = await controller.issue({ intentId: row.request.intentId });
      }
    } else if (row.action === 'refund') {
      result = await controller.voidDeposit({ intentId: row.request.intentId });
      if (result.status !== 'REFUNDED') {
        need(result.ticketId, 'NATIVE_CLAIM_ORIGINAL_REFUND_TICKET');
        await controller.payout({ ticketId: result.ticketId });
        result = await controller.reconcile({ operationId: row.request.intentId });
      }
    } else {
      result = await controller.requestRedemption({ claimDomain: account.claimDomain, caller: account.caller,
        amount: row.request.amount, maxFee: row.request.maxFee, requestId: row.controllerRequestId });
      if (result.status !== 'DISCHARGED') result = await controller.payout({ ticketId: result.ticketId });
    }
    return { completed: complete(row, result), result };
  }
  function schedule(id, reconciliationOnly = false) {
    if (jobs.has(id)) return;
    jobs.add(id); pending++;
    void enqueue(async () => {
      active = true;
      try {
        const row = locate(await journal.read(), id);
        if (row.state === 'CONFIRMED' && !reconciliationOnly) return;
        await change(id, { state: 'RUNNING', errorCode: null });
        const outcome = reconciliationOnly ? await reconcile(row) : await execute(row);
        const done = reconciliationOnly ? complete(row, outcome) : outcome.completed;
        await change(id, { state: done ? 'CONFIRMED' : 'RECONCILIATION_REQUIRED', errorCode: null,
          result: copy(reconciliationOnly ? outcome : outcome.result) });
      } catch (error) {
        lastError = nativeClaimApiErrorCode(error);
        // An unavailable journal must not turn an uncertain write into a
        // different durable claim. The original request remains reconcilable.
        if (!keeper.status().uncertain) {
          try { await change(id, { state: 'RECONCILIATION_REQUIRED', errorCode: lastError }); }
          catch { available = false; }
        } else available = false;
      } finally { active = false; pending--; jobs.delete(id); await refresh(); }
    });
  }

  // Persist account scope once. Restarts cannot silently rebind it to another
  // identity/domain/caller, even when the old account has no outstanding jobs.
  try {
    const data = await journal.read();
    need(data.deposits.some(row => row.claimDomain === account.claimDomain
      && row.packet.ownerIdentitySHA256 === account.ownerIdentitySHA256), 'NATIVE_CLAIM_OWNER_HANDOFF_REQUIRED');
    const existing = data.apiAccounts.find(row => row.accountId === account.accountId);
    if (existing) assert.deepEqual(existing, account, 'NATIVE_CLAIM_ACCOUNT_REBOUND');
    else await journal.update(value => { need(value.apiAccounts.length < 32, 'NATIVE_CLAIM_ACCOUNT_LIMIT'); value.apiAccounts.push(account); return value; });
    // No automatic effects after reconnect. A caller explicitly chooses resume
    // or reconcile for an admitted/interrupted operation using the same request.
    await journal.update(value => {
      for (const row of rows(value)) if (['ADMITTED', 'RUNNING'].includes(row.state)) row.state = 'RECONCILIATION_REQUIRED';
      return value;
    });
    await refresh();
  } catch (error) { leasedControllers.delete(controller); throw error; }

  const session = Object.freeze({
    async submit(action, raw) {
      const request = command(action, raw);
      need(!closed && !closing, 'NATIVE_CLAIM_UNAVAILABLE');
      if (action === 'close') { await session.close(); return { admitted: true, action, closed: true }; }
      // Admission and execution share one writer queue. During a native action
      // a duplicate can still read its retained status through snapshot().
      need(pending + admitting < 32, 'NATIVE_CLAIM_BUSY');
      admitting++;
      try {
        const acknowledgement = await enqueue(async () => {
          need(!closed && !closing, 'NATIVE_CLAIM_UNAVAILABLE');
          // Repairing an unavailable storage child has no signing or native-send
          // capability. The original context may reopen it before a new durable
          // admission can be written; 202 still waits for that write.
          let reopenedBeforeAdmission = false;
          if (action === 'restartKeeper' && keeper.status().uncertain) {
            await replaceKeeper(); reopenedBeforeAdmission = true;
          }
          const current = await journal.read();
          if (['resume', 'reconcile'].includes(action)) {
            const row = locate(current, request.requestId);
            await change(row.requestId, { lastRequestedAction: action });
            return { admitted: true, action, requestId: request.requestId, state: row.state };
          }
          if (action === 'deposit' || action === 'refund') ownedDeposit(current, request.intentId);
          const previous = rows(current).find(row => row.requestId === request.requestId);
          if (previous) {
            assert.equal(previous.action, action, 'NATIVE_CLAIM_REQUEST_REBOUND');
            assert.deepEqual(previous.request, request, 'NATIVE_CLAIM_REQUEST_REBOUND');
            return { admitted: true, action, requestId: request.requestId, state: previous.state, duplicate: true };
          }
          const entry = { accountId: account.accountId, requestId: request.requestId, action, request,
            controllerRequestId: hash([PROFILE, account, request.requestId]), state: 'ADMITTED', errorCode: null, result: null,
            ...(reopenedBeforeAdmission ? { reopenedBeforeAdmission: true } : {}) };
          await journal.update(value => { need(value.apiAdmissions.length < 128, 'NATIVE_CLAIM_ADMISSION_LIMIT'); value.apiAdmissions.push(entry); return value; });
          await refresh();
          need(available, 'NATIVE_CLAIM_STORAGE_UNAVAILABLE');
          return { admitted: true, action, requestId: request.requestId, state: 'ADMITTED' };
        });
        if (['resume', 'reconcile'].includes(action)) schedule(request.requestId, action === 'reconcile');
        else if (!acknowledgement.duplicate) schedule(request.requestId);
        return copy(acknowledgement);
      } finally { admitting--; }
    },
    async snapshot() {
      if (!pending && !admitting && !closed) {
        refreshPending ??= enqueue(refresh).finally(() => { refreshPending = null; });
        await refreshPending;
      }
      return view();
    },
    async ownerView() {
      need(!closed && !closing && !pending && !admitting && !ownerReadPending, 'NATIVE_CLAIM_OWNER_VIEW_BUSY');
      ownerReadPending = true;
      try { return await enqueue(async () => {
        const status = await controller.status(), data = await journal.read();
        const deposits = data.deposits.filter(row => row.claimDomain === account.claimDomain
          && row.packet.ownerIdentitySHA256 === account.ownerIdentitySHA256);
        const ids = new Set(deposits.map(row => row.id));
        const ownTickets = new Set(rows(data).map(row => row.controllerRequestId));
        const tickets = data.tickets.filter(row => row.claimDomain === account.claimDomain
          && (ownTickets.has(row.redemptionRequestId) || deposits.some(dep => dep.refundTicketId === row.id)));
        ownerStatus = { profile: PROFILE, observation: 'DURABLE_JOURNAL_ONLY', assetKind: 'CUSTODIAL_NATIVE_CLAIM',
          nativeSelfCustody: false, underlyingSpendable: false, independentOperators: false,
          deposits: status.deposits.filter(row => ids.has(row.intentId)),
          tickets: status.tickets.filter(row => tickets.some(ticket => ticket.id === row.ticketId)),
          requests: rows(data).map(row => ({ ...project(row), result: copy(row.result) })) };
        return copy(ownerStatus);
      }); } finally { ownerReadPending = false; }
    },
    async idle() { await drain(); return view(); },
    async close() {
      if (closed) return view();
      closing = true; await drain(); closed = true; ownerStatus = null; leasedControllers.delete(controller);
      // The application owns keeper/runtime lifecycle. Closing an HTTP session
      // does not destroy custody or cancel a durable operation.
      return view();
    },
  });
  sessions.set(session, () => controller); if (wrapped) wrappedSessions.add(session); identities.set(session, identity); return session;
}
