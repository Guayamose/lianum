import {originalNativeClaimAssetUnitsV1} from '../../claims/operations/native-claim-asset-units-v1.mjs';
/** One owner-scoped native-claim account over an original controller. Durable
 * admission precedes acknowledgment. Reopening a UI never replays a job.
 * Native custody and RPC authority remain in the trusted local bootstrap. */
import assert from 'node:assert/strict';
import { AssertionError } from 'node:assert';
import { createHash, randomBytes, createPublicKey, verify } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import { exactRecord, bytes32 } from '../../execution/encoding/commitments.mjs';
import { privateFailureDiagnostic } from '../../execution/account/reconciliation/failure-diagnostics.mjs';
import { claimUint, claimDomainCommitment, nativeClaimEndpointCommitment } from '../../claims/protocol/framing.mjs';
import { ownedClaimControllerJournal as nativeJournal } from '../../claims/controller/controller-journal.mjs';
import { ownedNativeClaimControllerBindings as nativeBindings, restartNativeClaimController as nativeRestart } from '../../claims/controller/controller.mjs';

const wrappedSessions = new WeakSet();
const privateFailures = new WeakMap();
const sessions = new WeakMap(), identities = new WeakMap(), leasedControllers = new WeakSet();
const deviceContexts = new WeakMap(), deviceReaders = new WeakMap(), deviceSpendingReaders = new WeakSet();
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

/** Bounded private failure observations over this original in-process session.
 * Not persisted, exposed through HTTP, or used as signing/retry authority. */
export function nativeClaimSessionPrivateFailures(value) {
  need(arguments.length === 1, 'NATIVE_CLAIM_PRIVATE_FAILURE_ARGUMENTS');
  assertNativeClaimSession(value); return copy(privateFailures.get(value));
}

function originalIdentity(runtime,claims, account, wrapped = false) {
  need(Array.isArray(claims.configs), 'NATIVE_CLAIM_REGISTERED_DOMAIN_REQUIRED');
  const matches = claims.configs.filter(config => claimDomainCommitment(config) === account.claimDomain);
  need(matches.length === 1, 'NATIVE_CLAIM_REGISTERED_DOMAIN_REQUIRED');
  const config = matches[0], bitcoin = config.nativeFamily === '1',units=wrapped?Object.freeze(bitcoin?{claimSymbol:'cBTC',nativeSymbol:'BTC',decimals:8,atomicUnit:'satoshi'}:{claimSymbol:'cSOL',nativeSymbol:'SOL',decimals:9,atomicUnit:'lamport'}):originalNativeClaimAssetUnitsV1(runtime,claims,config);
  // These are the fixed deployed NativeClaimToken family semantics, not caller
  // labels, a portfolio ordering guess, or independently spendable native funds.
  return Object.freeze({ version: 1, profile: wrapped ? 'ORIGINAL_WRAPPED_CLAIM_SESSION_IDENTITY_V1' : 'ORIGINAL_NATIVE_CLAIM_SESSION_IDENTITY_V1',
    accountId: account.accountId, claimDomain: account.claimDomain,
    nativeFamily: config.nativeFamily, nativeGenesis: config.nativeGenesis, nativeAsset: config.nativeAsset,
    wrapperAssetIdentity: config.wrapperAssetIdentity, claimSymbol:units.claimSymbol,nativeSymbol:units.nativeSymbol,decimals:units.decimals,atomicUnit:units.atomicUnit,
    ...(units.nativeAssetKind?{nativeAssetKind:units.nativeAssetKind,mint:units.mint}:{}),
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
/** Distinct original SPL mobile birth. Its BTC SOURCE may already have settled;
 * this capability still precedes every effect in the SAME private SPL domain.
 * Neither caller metadata nor an existing legacy session selects this branch. */
export async function createOriginalNativeSplClaimMobileSessionV1(input) {
  need(arguments.length === 1, 'NATIVE_CLAIM_DEVICE_ARGUMENTS');
  exactRecord(input, ['controller', 'accountId', 'ownerIdentitySHA256', 'claimDomain', 'caller']);
  need(!types.isProxy(input) && Reflect.ownKeys(input).every(key =>
    Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, 'value')), 'NATIVE_CLAIM_DEVICE_INPUT');
  const selected = Object.freeze({ ...input });
  const original = nativeBindings(selected.controller), { runtime, claims } = original;
  need(claims.nativeSplCustodyProfile === true && claims.configs.length === 2
    && claimDomainCommitment(claims.configs[1]) === selected.claimDomain, 'NATIVE_CLAIM_DEVICE_ORIGINAL_SPL_DOMAIN');
  // This original reader checks both the sealed deployment and the native SPL
  // custody WeakSet. A serialized mint/domain or copied runtime grants nothing.
  const units = originalNativeClaimAssetUnitsV1(runtime, claims, claims.configs[1]);
  need(units.nativeAssetKind === 'SOLANA_SPL_USDC', 'NATIVE_CLAIM_DEVICE_ORIGINAL_SPL_DOMAIN');
  const current = nativeBindings(selected.controller);
  need(current.runtime === runtime && current.claims === claims && current.keeper === original.keeper,
    'NATIVE_CLAIM_DEVICE_SOURCE_CHANGED');
  return createClaimSession(selected, false, true);
}
export async function createWrappedClaimSessionV1(input) {
  need(arguments.length === 1, 'WRAPPED_WALLET_NO_OVERRIDES');
  const { assertWrappedWalletAccountReleasedV1 } = await import('../../operations/releases/wrapped/wrapped-wallet-release-v1.mjs');
  assertWrappedWalletAccountReleasedV1(); return createClaimSession(input, true);
}
async function createClaimSession(input, wrapped, originalSplMobile = false) {
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
  const identity = originalIdentity(runtime,claims, account, wrapped);
  if (originalSplMobile) need(!wrapped && identity.nativeAssetKind === 'SOLANA_SPL_USDC'
    && claims.nativeSplCustodyProfile === true && claims.configs.indexOf(claims.configs.find(config =>
      claimDomainCommitment(config) === account.claimDomain)) === 1, 'NATIVE_CLAIM_DEVICE_ORIGINAL_SPL_DOMAIN');
  const journal = ownedClaimControllerJournal(keeper, runtime, claims);
  function beforeDeviceEffects(data) {
    // Legacy BTC/SOL and legacy SPL admission retain the full original guard.
    if (!originalSplMobile) return data.evm.length === 0;
    const native = claims.nativeRuntimes[1], foreignDomain = claimDomainCommitment(claims.configs[0]);
    const units = originalNativeClaimAssetUnitsV1(runtime, claims, claims.configs[1]);
    need(units.nativeAssetKind === 'SOLANA_SPL_USDC' && units.mint === identity.mint,
      'NATIVE_CLAIM_DEVICE_ORIGINAL_SPL_DOMAIN');
    const domainAccounts = new Set(data.apiAccounts.filter(row => row.claimDomain === account.claimDomain)
      .map(row => row.accountId));
    return native.transfers.length === 0 && data.apiAdmissions.every(row => !domainAccounts.has(row.accountId))
      && data.evm.every(row => row.domain === foreignDomain
      && ['SUCCEEDED', 'REVERTED', 'REJECTED_NO_KEY'].includes(row.status))
      && data.deposits.every(row => row.claimDomain === account.claimDomain
        || row.claimDomain === foreignDomain && ['ISSUED', 'REFUNDED'].includes(row.status))
      && data.tickets.every(row => row.claimDomain === account.claimDomain
        || row.claimDomain === foreignDomain && row.status === 'DISCHARGED');
  }
  need(!leasedControllers.has(controller), 'NATIVE_CLAIM_CONTROLLER_SESSION_BUSY');
  leasedControllers.add(controller);
  let closed = false, closing = false, active = false, available = true, lastError = null;
  let tail = Promise.resolve(), pending = 0, admitting = 0, revision = 0;
  let visible = [], ownerStatus = null, refreshPending = null, ownerReadPending = false;
  const jobs = new Set(), failures = [];

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
      if (row.mobileRedemption) await assertMobileRedemption(row);
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
        // Keep only fixed protocol labels and the original 30 s audit budget.
        // Native keys, comparison values, RPC text and stacks never enter this view.
        if (!wrapped) {
          failures.push(Object.freeze({ requestId: id, ...privateFailureDiagnostic(error, 'NATIVE_CLAIM_OPERATION_FAILED') }));
          if (failures.length > 8) failures.shift();
        }
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

  function originalMobileRedemptionBinding() {
    const matches = claims.configs.filter(config => claimDomainCommitment(config) === account.claimDomain);
    need(matches.length === 1, 'NATIVE_CLAIM_DEVICE_ORIGINAL_DOMAIN');
    const config = matches[0], index = claims.configs.indexOf(config), native = claims.nativeRuntimes[index];
    need(native && native.roles && typeof native.roles.recipient?.endpoint === 'string', 'NATIVE_CLAIM_DEVICE_ORIGINAL_DESTINATION');
    const recipientEndpoint = native.roles.recipient.endpoint;
    return { profile: 'ORIGINAL_NATIVE_CLAIM_DEVICE_REDEMPTION_BINDING_V1', accountScopeSHA256: hash([PROFILE, account, identity]),
      claimDomain: account.claimDomain, callerSHA256: hash(account.caller), nativeFamily: config.nativeFamily,
      nativeGenesis: config.nativeGenesis, nativeAsset: config.nativeAsset, recipientEndpoint,
      recipientEndpointCommitment: nativeClaimEndpointCommitment({ family: config.nativeFamily, genesis: config.nativeGenesis,
        asset: config.nativeAsset, endpoint: recipientEndpoint }), custody: 'BACKEND_LOCAL_QUORUM', nativeSelfCustody: false };
  }
  async function assertMobileRedemption(row) {
    const mobile = row.mobileRedemption;
    need(mobile && row.action === 'redeem', 'NATIVE_CLAIM_DEVICE_ORIGINAL_REDEMPTION');
    const permission = mobile.permission;
    const current = await journal.read(), pair = current.apiDevicePairings?.find(row => row.accountScopeSHA256 === hash([PROFILE, account, identity]));
    need(pair?.redemptionBinding, 'NATIVE_CLAIM_DEVICE_ORIGINAL_SPENDING');
    assert.deepEqual(pair.descriptor, permission.descriptor, 'NATIVE_CLAIM_DEVICE_PAIRING_REBOUND');
    assert.deepEqual(pair.redemptionBinding, permission.redemptionBinding, 'NATIVE_CLAIM_DEVICE_DESTINATION_CHANGED');
    assert.deepEqual(permission.redemptionBinding, originalMobileRedemptionBinding(), 'NATIVE_CLAIM_DEVICE_DESTINATION_CHANGED');
    need(permission.action === 'REDEEM_NATIVE_CLAIM' && permission.profile === 'LIANUM_NATIVE_CLAIM_DEVICE_REDEEM_PERMISSION_V1'
      && permission.requestId === row.request.requestId && permission.amount === row.request.amount && permission.maxFee === row.request.maxFee
      && mobile.admittedAt < permission.expiresAt && mobile.admittedAt >= permission.expiresAt - 15000,
      'NATIVE_CLAIM_DEVICE_ORIGINAL_REDEMPTION');
    deviceVerifyPermission(permission, mobile.signature);
  }
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
  async function readDeviceState() {
    this.live(); const before = await journal.read(), status = await controller.status(), data = await journal.read();
    this.live(); assert.deepEqual(data, before, 'NATIVE_CLAIM_DEVICE_JOURNAL_CHANGED');
    const deposits = data.deposits.filter(row => row.claimDomain === account.claimDomain
      && row.packet.ownerIdentitySHA256 === account.ownerIdentitySHA256), ids = new Set(deposits.map(row => row.id));
    const ownTickets = new Set(rows(data).map(row => row.controllerRequestId));
    const tickets = data.tickets.filter(row => row.claimDomain === account.claimDomain
      && (ownTickets.has(row.redemptionRequestId) || deposits.some(dep => dep.refundTicketId === row.id)));
    const state = { phase: 'READY', storageAvailable: true,
      requiresReconciliation: keeper.status().requiresExternalEffectReconciliation === true,
      requests: rows(data).map(row => ({ ...project(row), requestSHA256: hash([account, row.action, row.request, row.controllerRequestId]) })),
      deposits: status.deposits.filter(row => ids.has(row.intentId)).map(row => ({ intentId: row.intentId,
        claimDomain: row.claimDomain, amount: row.amount, status: row.status })),
      tickets: status.tickets.filter(row => tickets.some(ticket => ticket.id === row.ticketId)).map(row => ({
        ticketId: row.ticketId, claimDomain: account.claimDomain, status: row.status })),
      custody: 'BACKEND_LOCAL_QUORUM', nativeSelfCustody: false, underlyingSpendable: false,
      independentOperators: false, availablePrivateClaims: null };
    return copy(state);
  }
  if (!wrapped) deviceContexts.set(session, {
    live() {
      need(!closed && !closing && available && !keeper.status().uncertain, 'NATIVE_CLAIM_DEVICE_SESSION_UNAVAILABLE');
      const original = nativeBindings(controller);
      need(original.runtime === runtime && original.claims === claims && original.keeper === keeper, 'NATIVE_CLAIM_DEVICE_SOURCE_CHANGED');
    },
    async bind(infrastructure) {
      this.live(); need(!pending && !admitting && !ownerReadPending, 'NATIVE_CLAIM_DEVICE_SESSION_BUSY');
      return enqueue(async () => {
        this.live(); const current = await journal.read();
        const scope = hash([PROFILE, account, identity]);
        const previous = (current.apiDevicePairings ?? []).find(row => row.accountScopeSHA256 === scope);
        if (previous) {
          need(previous.origin === infrastructure.origin && previous.devicePublicKey === infrastructure.devicePublicKey,
            'NATIVE_CLAIM_DEVICE_PAIRING_REBOUND');
          assert.deepEqual(previous.claimIdentity, identity, 'NATIVE_CLAIM_DEVICE_PAIRING_REBOUND');
          const d = previous.descriptor;
          need(d && typeof d.pairingId === 'string' && /^[0-9a-f]{64}$/.exec(d.pairingId)?.[0] === d.pairingId,
            'NATIVE_CLAIM_DEVICE_PAIRING_REBOUND');
          const expected = { version: 1, profile: 'LIANUM_NATIVE_CLAIM_DEVICE_PAIRING_V1',
            origin: infrastructure.origin, pairingId: d.pairingId, devicePublicKey: infrastructure.devicePublicKey,
            accountScopeSHA256: scope, lifetimeSHA256: hash([scope, d.pairingId, identity]),
            claimDomain: identity.claimDomain, nativeFamily: identity.nativeFamily, nativeGenesis: identity.nativeGenesis,
            nativeAsset: identity.nativeAsset, wrapperAssetIdentity: identity.wrapperAssetIdentity,
            claimSymbol: identity.claimSymbol, nativeSymbol: identity.nativeSymbol, decimals: identity.decimals,
            atomicUnit: identity.atomicUnit, nativeAssetKind: identity.nativeAssetKind ?? null, mint: identity.mint ?? null };
          assert.deepEqual(d, expected, 'NATIVE_CLAIM_DEVICE_PAIRING_REBOUND');
          return copy(expected);
        }
        const owned = current.deposits.filter(row => row.claimDomain === account.claimDomain
          && row.packet.ownerIdentitySHA256 === account.ownerIdentitySHA256);
        need(owned.length > 0 && owned.every(row => row.status === 'PREPARED' && row.native == null && row.route == null)
          && rows(current).length === 0 && current.tickets.every(row => row.claimDomain !== account.claimDomain)
          && beforeDeviceEffects(current), 'NATIVE_CLAIM_DEVICE_PAIRING_BEFORE_EFFECTS_REQUIRED');
        const pairingId = randomBytes(32).toString('hex');
        const descriptor = { version: 1, profile: 'LIANUM_NATIVE_CLAIM_DEVICE_PAIRING_V1',
          origin: infrastructure.origin, pairingId, devicePublicKey: infrastructure.devicePublicKey,
          accountScopeSHA256: scope, lifetimeSHA256: hash([scope, pairingId, identity]),
          claimDomain: identity.claimDomain, nativeFamily: identity.nativeFamily, nativeGenesis: identity.nativeGenesis,
          nativeAsset: identity.nativeAsset, wrapperAssetIdentity: identity.wrapperAssetIdentity,
          claimSymbol: identity.claimSymbol, nativeSymbol: identity.nativeSymbol, decimals: identity.decimals,
          atomicUnit: identity.atomicUnit, nativeAssetKind: identity.nativeAssetKind ?? null, mint: identity.mint ?? null };
        await journal.update(data => {
          need(beforeDeviceEffects(data), 'NATIVE_CLAIM_DEVICE_PAIRING_BEFORE_EFFECTS_REQUIRED');
          data.apiDevicePairings ??= [];
          need(data.apiDevicePairings.length < 32 && !data.apiDevicePairings.some(row => row.accountScopeSHA256 === scope),
            'NATIVE_CLAIM_DEVICE_PAIRING_CONFLICT');
          data.apiDevicePairings.push({ accountScopeSHA256: scope, ...infrastructure, claimIdentity: copy(identity), descriptor: copy(descriptor) });
          return data;
        });
        this.live(); const actual = await journal.read();
        assert.deepEqual(actual.apiDevicePairings.find(row => row.accountScopeSHA256 === scope)?.descriptor, descriptor,
          'NATIVE_CLAIM_DEVICE_PAIRING_READBACK');
        return descriptor;
      });
    },
    async enableSpending(descriptor) {
      this.live(); need(!pending && !admitting && !ownerReadPending, 'NATIVE_CLAIM_DEVICE_SESSION_BUSY');
      return enqueue(async () => {
        this.live(); const current = await journal.read(), pair = current.apiDevicePairings?.find(row => row.accountScopeSHA256 === descriptor.accountScopeSHA256);
        need(pair, 'NATIVE_CLAIM_DEVICE_ORIGINAL_PAIRING'); assert.deepEqual(pair.descriptor, descriptor, 'NATIVE_CLAIM_DEVICE_PAIRING_REBOUND');
        const binding = originalMobileRedemptionBinding();
        if (pair.redemptionBinding) { assert.deepEqual(pair.redemptionBinding, binding, 'NATIVE_CLAIM_DEVICE_DESTINATION_CHANGED'); return copy(binding); }
        const deposits = current.deposits.filter(row => row.claimDomain === account.claimDomain && row.packet.ownerIdentitySHA256 === account.ownerIdentitySHA256);
        need(deposits.length > 0 && deposits.every(row => row.status === 'PREPARED' && row.native == null && row.route == null)
          && rows(current).length === 0 && current.tickets.every(row => row.claimDomain !== account.claimDomain)
          && beforeDeviceEffects(current), 'NATIVE_CLAIM_DEVICE_SPENDING_BEFORE_EFFECTS_REQUIRED');
        await journal.update(data => {
          need(beforeDeviceEffects(data), 'NATIVE_CLAIM_DEVICE_SPENDING_BEFORE_EFFECTS_REQUIRED');
          const actual = data.apiDevicePairings.find(row => row.accountScopeSHA256 === descriptor.accountScopeSHA256);
          assert.deepEqual(actual.descriptor, descriptor, 'NATIVE_CLAIM_DEVICE_PAIRING_REBOUND');
          need(!actual.redemptionBinding, 'NATIVE_CLAIM_DEVICE_SPENDING_ALREADY_BOUND'); actual.redemptionBinding = copy(binding); return data;
        });
        this.live(); assert.deepEqual((await journal.read()).apiDevicePairings.find(row => row.accountScopeSHA256 === descriptor.accountScopeSHA256)?.redemptionBinding,
          binding, 'NATIVE_CLAIM_DEVICE_SPENDING_READBACK'); return binding;
      });
    },
    async redeem(permission, signature, deadline) {
      this.live(); need(!pending && !admitting && !ownerReadPending, 'NATIVE_CLAIM_DEVICE_SESSION_BUSY');
      const request = command('redeem', { requestId: permission.requestId, amount: permission.amount, maxFee: permission.maxFee });
      admitting++;
      try {
        const acknowledgement = await enqueue(async () => {
          this.live(); const current = await journal.read(), pair = current.apiDevicePairings?.find(row => row.accountScopeSHA256 === permission.descriptor.accountScopeSHA256);
          need(pair?.redemptionBinding, 'NATIVE_CLAIM_DEVICE_ORIGINAL_SPENDING');
          assert.deepEqual(pair.descriptor, permission.descriptor, 'NATIVE_CLAIM_DEVICE_PAIRING_REBOUND');
          assert.deepEqual(pair.redemptionBinding, originalMobileRedemptionBinding(), 'NATIVE_CLAIM_DEVICE_DESTINATION_CHANGED');
          assert.deepEqual(pair.redemptionBinding, permission.redemptionBinding, 'NATIVE_CLAIM_DEVICE_DESTINATION_CHANGED');
          const now = Date.now(); need(Number.isSafeInteger(now) && now < permission.expiresAt && permission.expiresAt <= now + 15000
            && performance.now() < deadline, 'NATIVE_CLAIM_DEVICE_PERMISSION_EXPIRED'); deviceVerifyPermission(permission, signature);
          const previous = rows(current).find(row => row.requestId === request.requestId);
          if (previous) { need(previous.mobileRedemption && previous.action === 'redeem', 'NATIVE_CLAIM_DEVICE_REQUEST_REBOUND');
            assert.deepEqual(previous.request, request, 'NATIVE_CLAIM_DEVICE_REQUEST_REBOUND'); await assertMobileRedemption(previous);
            return { admitted: true, action: 'redeem', requestId: request.requestId, state: previous.state, duplicate: true }; }
          need(!keeper.status().requiresExternalEffectReconciliation && rows(current).every(row => row.state === 'CONFIRMED'),
            'NATIVE_CLAIM_DEVICE_OBSERVE_ORIGINAL_PENDING');
          need(current.deposits.some(row => row.claimDomain === account.claimDomain
            && row.packet.ownerIdentitySHA256 === account.ownerIdentitySHA256 && row.status === 'ISSUED'),
            'NATIVE_CLAIM_DEVICE_ORIGINAL_ISSUANCE_REQUIRED');
          const entry = { accountId: account.accountId, requestId: request.requestId, action: 'redeem', request,
            controllerRequestId: hash([PROFILE, account, request.requestId]), state: 'ADMITTED', errorCode: null, result: null,
            mobileRedemption: { permission: copy(permission), signature, admittedAt: now } };
          await assertMobileRedemption(entry);
          this.live(); const beforeCAS = Date.now(); need(beforeCAS < permission.expiresAt && permission.expiresAt <= beforeCAS + 15000
            && performance.now() < deadline, 'NATIVE_CLAIM_DEVICE_PERMISSION_EXPIRED');
          await journal.update(data => { need(data.apiAdmissions.length < 128 && !rows(data).some(row => row.requestId === request.requestId),
            'NATIVE_CLAIM_DEVICE_ADMISSION_CONFLICT'); data.apiAdmissions.push(entry); return data; });
          await refresh(); need(available, 'NATIVE_CLAIM_STORAGE_UNAVAILABLE');
          return { admitted: true, action: 'redeem', requestId: request.requestId, state: 'ADMITTED', duplicate: false };
        });
        if (!acknowledgement.duplicate) schedule(request.requestId); return acknowledgement;
      } finally { admitting--; }
    },
    async read() {
      this.live(); need(!pending && !admitting && !ownerReadPending, 'NATIVE_CLAIM_DEVICE_SESSION_BUSY');
      return enqueue(() => readDeviceState.call(this));
    },
    async observe() {
      this.live(); need(!pending && !admitting && !ownerReadPending, 'NATIVE_CLAIM_DEVICE_SESSION_BUSY');
      return enqueue(async () => {
        this.live();
        // This fixed SPL session was paired before ingress. Its fresh READ PoP
        // authorizes observation of the SAME retained native bindings only.
        // No apiAdmission, ingress, issuance, proof, KEY or SEND is created.
        if (originalSplMobile) {
          const data = await journal.read();
          const deposits = data.deposits.filter(row => row.claimDomain === account.claimDomain
            && row.packet.ownerIdentitySHA256 === account.ownerIdentitySHA256);
          const ownTickets = new Set(rows(data).map(row => row.controllerRequestId));
          const tickets = data.tickets.filter(row => row.claimDomain === account.claimDomain
            && (ownTickets.has(row.redemptionRequestId) || deposits.some(dep => dep.refundTicketId === row.id)));
          for (const row of [...deposits, ...tickets]) if (row.native?.binding) {
            await controller.reconcile({ operationId: row.id }); this.live();
          }
        }
        return readDeviceState.call(this);
      });
    },
    async reconcile(id, expectedSHA256) {
      this.live(); need(!pending && !admitting && !ownerReadPending, 'NATIVE_CLAIM_DEVICE_SESSION_BUSY');
      admitting++;
      try {
        const acknowledgement = await enqueue(async () => {
          this.live(); const current = await journal.read(), row = locate(current, id);
          need(hash([account, row.action, row.request, row.controllerRequestId]) === expectedSHA256,
            'NATIVE_CLAIM_DEVICE_REQUEST_CHANGED');
          await change(id, { lastRequestedAction: 'reconcile' });
          return { admitted: true, action: 'reconcile', requestId: id, state: row.state };
        });
        schedule(id, true); return acknowledgement;
      } finally { admitting--; }
    },
  });
  sessions.set(session, () => controller); if (!wrapped) privateFailures.set(session, failures); if (wrapped) wrappedSessions.add(session); identities.set(session, identity); return session;
}


// A separate mobile permission family over the retained ORIGINAL session. The
// descriptor is configuration; only this WeakMap reader can admit a reconcile.
const DEVICE_PROFILE = 'LIANUM_NATIVE_CLAIM_DEVICE_PERMISSION_V1', DEVICE_TTL = 15000;
function deviceData(raw) {
  let nodes = 0, characters = 0;
  function check(value, depth) {
    need(++nodes <= 6000 && depth <= 12, 'NATIVE_CLAIM_DEVICE_FRAME');
    if (typeof value === 'string') { characters += value.length; need(value.length <= 512 && characters <= 65536, 'NATIVE_CLAIM_DEVICE_FRAME'); return; }
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') { need(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), 'NATIVE_CLAIM_DEVICE_FRAME'); return; }
    need(value && typeof value === 'object' && !types.isProxy(value), 'NATIVE_CLAIM_DEVICE_FRAME');
    if (Array.isArray(value)) need(Object.getPrototypeOf(value) === Array.prototype && value.length <= 128
      && Reflect.ownKeys(value).length === value.length + 1, 'NATIVE_CLAIM_DEVICE_FRAME');
    else need(Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length <= 32, 'NATIVE_CLAIM_DEVICE_FRAME');
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      need(typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key), 'NATIVE_CLAIM_DEVICE_FRAME');
      const entry = Object.getOwnPropertyDescriptor(value, key);
      need(entry.enumerable && Object.hasOwn(entry, 'value'), 'NATIVE_CLAIM_DEVICE_FRAME'); check(entry.value, depth + 1);
    }
  }
  check(raw, 0);
}
function deviceExact(raw, keys) { deviceData(raw); exactRecord(raw, keys); }
function devicePermissionFrameValue(raw) {
  const redeem = raw.profile === 'LIANUM_NATIVE_CLAIM_DEVICE_REDEEM_PERMISSION_V1';
  const fields = redeem ? ['version','profile','action','descriptor','redemptionBinding','requestId','amount','maxFee','challengeId','nonce','expiresAt']
    : ['version','profile','action','descriptor','challengeId','nonce','expiresAt','requestId','requestSHA256'];
  deviceExact(raw, fields);
  const d = raw.descriptor, names = ['version','profile','origin','pairingId','devicePublicKey','accountScopeSHA256','lifetimeSHA256','claimDomain',
    'nativeFamily','nativeGenesis','nativeAsset','wrapperAssetIdentity','claimSymbol','nativeSymbol','decimals','atomicUnit','nativeAssetKind','mint'];
  deviceExact(d, names); const descriptor = Object.fromEntries(names.map(name => [name,d[name]]));
  const value = Object.fromEntries(fields.map(name => [name,name === 'descriptor' ? descriptor : raw[name]]));
  if (redeem) {
    const names = ['profile','accountScopeSHA256','claimDomain','callerSHA256','nativeFamily','nativeGenesis','nativeAsset','recipientEndpoint',
      'recipientEndpointCommitment','custody','nativeSelfCustody'];
    deviceExact(raw.redemptionBinding, names);
    value.redemptionBinding = Object.fromEntries(names.map(name => [name,raw.redemptionBinding[name]]));
  }
  return value;
}
function deviceVerifyPermission(raw, signature) {
  const permission = devicePermissionFrameValue(raw);
  deviceData(permission);
  need(typeof signature === 'string' && /^[0-9a-f]{128}$/.exec(signature)?.[0] === signature, 'NATIVE_CLAIM_DEVICE_SIGNATURE');
  const r = BigInt('0x' + signature.slice(0, 64)), s = BigInt('0x' + signature.slice(64));
  const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  need(r > 0n && r < order && s > 0n && s <= order / 2n, 'NATIVE_CLAIM_DEVICE_SIGNATURE');
  const pub = permission.descriptor.devicePublicKey;
  const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(pub.slice(2, 66), 'hex').toString('base64url'), y: Buffer.from(pub.slice(66), 'hex').toString('base64url') } });
  const frame = Buffer.from(permission.profile + '\n' + JSON.stringify(permission));
  try { need(frame.length <= 4096 && verify('sha256', frame, { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'hex')), 'NATIVE_CLAIM_DEVICE_SIGNATURE'); } finally { frame.fill(0); }
}
function deviceOrigin(value) {
  need(typeof value === 'string' && value.length <= 256, 'NATIVE_CLAIM_DEVICE_ORIGIN');
  const url = new URL(value);
  need(url.protocol === 'https:' && url.origin === value && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
    'NATIVE_CLAIM_DEVICE_ORIGIN'); return value;
}
export function assertPairedOriginalNativeClaimReaderV1(reader) {
  need(arguments.length === 1 && deviceReaders.has(reader), 'NATIVE_CLAIM_DEVICE_ORIGINAL_READER');
  const state = deviceReaders.get(reader); state.live(); return copy(state.descriptor);
}
export async function createPairedOriginalNativeClaimReaderV1(input) {
  need(arguments.length === 1, 'NATIVE_CLAIM_DEVICE_ARGUMENTS'); return createNativeClaimDeviceReader(input, false);
}
export async function createPairedOriginalNativeClaimSpendingReaderV1(input) {
  need(arguments.length === 1, 'NATIVE_CLAIM_DEVICE_ARGUMENTS'); return createNativeClaimDeviceReader(input, true);
}
async function createNativeClaimDeviceReader(input, spending) {
  need(arguments.length === 2, 'NATIVE_CLAIM_DEVICE_ARGUMENTS');
  need(input && !types.isProxy(input) && Object.getPrototypeOf(input) === Object.prototype, 'NATIVE_CLAIM_DEVICE_INPUT');
  exactRecord(input, ['session', 'origin', 'devicePublicKey']);
  need(Reflect.ownKeys(input).every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, 'value')), 'NATIVE_CLAIM_DEVICE_INPUT');
  assertNativeClaimSession(input.session);
  const context = deviceContexts.get(input.session); need(context, 'NATIVE_CLAIM_DEVICE_ORIGINAL_SESSION'); context.live();
  deviceOrigin(input.origin); need(typeof input.devicePublicKey === 'string'
    && /^04[0-9a-f]{128}$/.exec(input.devicePublicKey)?.[0] === input.devicePublicKey, 'NATIVE_CLAIM_DEVICE_PUBLIC_KEY');
  const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(input.devicePublicKey.slice(2, 66), 'hex').toString('base64url'),
    y: Buffer.from(input.devicePublicKey.slice(66), 'hex').toString('base64url') } });
  const descriptor = await context.bind({ origin: input.origin, devicePublicKey: input.devicePublicKey });
  const redemptionBinding = spending ? await context.enableSpending(descriptor) : null;
  const permissions = new Map(); let closed = false, active = null;
  const live = () => { need(!closed, 'NATIVE_CLAIM_DEVICE_READER_CLOSED'); context.live(); };
  const fresh = row => { live(); const now = Date.now(); need(Number.isSafeInteger(now) && row.value.expiresAt > now
    && row.value.expiresAt <= now + DEVICE_TTL && performance.now() < row.deadline, 'NATIVE_CLAIM_DEVICE_PERMISSION_EXPIRED'); };
  function run(work) { live(); need(active === null, 'NATIVE_CLAIM_DEVICE_READER_BUSY');
    const pending = Promise.resolve().then(work); active = pending;
    pending.finally(() => { if (active === pending) active = null; }).catch(() => {}); return pending; }
  const reader = Object.freeze({
    challenge(raw) {
      need(arguments.length === 1); deviceData(raw);
      const redeem = spending && raw.action === 'REDEEM_NATIVE_CLAIM';
      deviceExact(raw, redeem ? ['action', 'requestId', 'amount', 'maxFee'] : ['action', 'requestId']);
      need(redeem || ['READ_CLAIM_JOURNAL', 'RECONCILE_CLAIM_REQUEST'].includes(raw.action), 'NATIVE_CLAIM_DEVICE_ACTION');
      need(raw.action === 'READ_CLAIM_JOURNAL' ? raw.requestId === null : requestId(raw.requestId), 'NATIVE_CLAIM_DEVICE_REQUEST');
      if (redeem) need(claimUint(raw.amount) > 0n && claimUint(raw.maxFee) > 0n, 'NATIVE_CLAIM_DEVICE_AMOUNT');
      return run(async () => {
        const state = await context.read(); live(); const request = raw.action === 'READ_CLAIM_JOURNAL' || redeem ? null
          : state.requests.find(row => row.requestId === raw.requestId);
        need(raw.action === 'READ_CLAIM_JOURNAL' || redeem || request, 'NATIVE_CLAIM_DEVICE_OWN_ADMITTED_REQUEST');
        if (redeem && !state.requests.some(row => row.requestId === raw.requestId)) {
          need(!state.requiresReconciliation && state.requests.every(row => row.state === 'CONFIRMED'),
            'NATIVE_CLAIM_DEVICE_OBSERVE_ORIGINAL_PENDING');
          need(state.deposits.some(row => row.status === 'ISSUED'), 'NATIVE_CLAIM_DEVICE_ORIGINAL_ISSUANCE_REQUIRED');
        }
        for (const [id, row] of permissions) if (row.consumed || performance.now() >= row.deadline) permissions.delete(id);
        need(permissions.size < 16, 'NATIVE_CLAIM_DEVICE_CAPACITY');
        const value = redeem ? { version: 1, profile: 'LIANUM_NATIVE_CLAIM_DEVICE_REDEEM_PERMISSION_V1', action: 'REDEEM_NATIVE_CLAIM',
          descriptor: copy(descriptor), redemptionBinding: copy(redemptionBinding), requestId: raw.requestId, amount: raw.amount, maxFee: raw.maxFee,
          challengeId: randomBytes(32).toString('hex'), nonce: randomBytes(32).toString('hex'), expiresAt: Date.now() + DEVICE_TTL }
          : { version: 1, profile: DEVICE_PROFILE, action: raw.action, descriptor: copy(descriptor),
          challengeId: randomBytes(32).toString('hex'), nonce: randomBytes(32).toString('hex'),
          expiresAt: Date.now() + DEVICE_TTL, requestId: raw.requestId, requestSHA256: request?.requestSHA256 ?? null };
        permissions.set(value.challengeId, { value, deadline: performance.now() + DEVICE_TTL, consumed: false }); return copy(value);
      });
    },
    operate(raw) {
      need(arguments.length === 1); deviceExact(raw, ['permission', 'signature']);
      deviceExact(raw.permission, spending && raw.permission.profile === 'LIANUM_NATIVE_CLAIM_DEVICE_REDEEM_PERMISSION_V1'
        ? ['version','profile','action','descriptor','redemptionBinding','requestId','amount','maxFee','challengeId','nonce','expiresAt']
        : ['version', 'profile', 'action', 'descriptor', 'challengeId', 'nonce', 'expiresAt', 'requestId', 'requestSHA256']);
      return run(async () => {
        const row = permissions.get(raw.permission.challengeId);
        need(row && !row.consumed, 'NATIVE_CLAIM_DEVICE_PERMISSION');
        assert.deepEqual(raw.permission, row.value, 'NATIVE_CLAIM_DEVICE_PERMISSION'); fresh(row);
        deviceVerifyPermission(row.value, raw.signature);
        row.consumed = true;
        if (row.value.action === 'REDEEM_NATIVE_CLAIM') {
          need(deviceSpendingReaders.has(reader), 'NATIVE_CLAIM_DEVICE_ORIGINAL_SPENDING');
          const acknowledgement = await context.redeem(row.value, raw.signature, row.deadline);
          return { version: 1, profile: 'LIANUM_NATIVE_CLAIM_DEVICE_REDEEM_ADMISSION_V1', descriptor: copy(descriptor),
            permissionId: row.value.challengeId, ...acknowledgement };
        }
        if (row.value.action === 'RECONCILE_CLAIM_REQUEST') {
          const acknowledgement = await context.reconcile(row.value.requestId, row.value.requestSHA256);
          return { version: 1, profile: 'LIANUM_NATIVE_CLAIM_DEVICE_RECONCILE_V1', descriptor: copy(descriptor),
            permissionId: row.value.challengeId, ...acknowledgement };
        }
        const state = await context.observe(); fresh(row);
        return { version: 1, profile: 'LIANUM_NATIVE_CLAIM_DEVICE_OBSERVATION_V1', descriptor: copy(descriptor),
          permissionId: row.value.challengeId, observedAt: Date.now(), expiresAt: row.value.expiresAt, state };
      });
    },
    close() { need(arguments.length === 0); closed = true; for (const row of permissions.values()) row.consumed = true;
      return { closed: true, retainedOriginalCustody: true }; },
    async idle() { need(arguments.length === 0); if (active) await active.catch(() => {}); await input.session.idle(); return { closed, originalWorkDrained: true }; },
  });
  deviceReaders.set(reader, { live, descriptor }); if (spending) deviceSpendingReaders.add(reader); return reader;
}
