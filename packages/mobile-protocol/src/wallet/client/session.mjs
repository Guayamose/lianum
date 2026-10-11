/** Wallet session state machine. Owns reviews, grants and uncertain outcomes; never retries automatically. */
import { handoffDescriptor, handoffData, HANDOFF_PROFILE, sameHandoff, manualReviewRequest } from '../contracts/manual-action-handoff.mjs';
import { defiAction, DEFI_PROFILE, accountAction, actionGroup, ALL_ACTIONS } from './actions/catalog.mjs';
import { copy, accountDigest, record } from './validation/values.mjs';
import { actionAvailability, buildActionBody } from './actions/rules.mjs';
import { isWrappedWithdrawalAction, wrappedWithdrawalContext } from '../contracts/wrapped-withdrawal-review.mjs';
import { EXACT_BROWSER_ACTIONS, exactBrowserReview, exactBrowserAccess } from '../contracts/exact-action-browser-review.mjs';
import { accountActionContext } from './actions/account-context.mjs';
import { validateWalletState } from './validation/wallet-state.mjs';
import { validAccountSnapshot } from './validation/account.mjs';
import { originalNativeIdentity, sameNativeIdentity } from './validation/native-identity.mjs';
import { actionReview } from './presentation/action-review.mjs';
import { createWalletRequest } from './transport/http.mjs';
import { actionResponseOutcome } from './validation/action-response.mjs';

/** A fake fetch can test all interruption flows without running any chain. */
export function createWalletClient({ fetchImpl, ownerToken, actionToken, manualActionHandoff = null, wrappedWithdrawalAccess = null, exactActionAccess = null, now = () => Date.now(), readTimeoutMs = 90000, actionTimeoutMs = 30000 }) {
  const request = createWalletRequest(fetchImpl);
  const hasToken = value => typeof value === 'string' && value.length > 0 && !value.startsWith('__WALLET_');
  const tokenFlags = { ownerToken: hasToken(ownerToken), actionToken: hasToken(actionToken) };
  const pinnedHandoff = manualActionHandoff === null ? null : handoffDescriptor(handoffData(manualActionHandoff));
  const exactDescriptor = exactActionAccess === null ? null : handoffDescriptor(handoffData(exactActionAccess));
  let browserExactAccess = null, exactDisconnected = false;
  const usedExactTokens = new Set();
  const invalidateExactAccess = () => {
    if (browserExactAccess) usedExactTokens.add(browserExactAccess);
    browserExactAccess = null;
  };
  const exactReady = () => exactDescriptor !== null && !exactDisconnected;
  const exactContext = (action, body, accountContext) => accountContext ?? (defiAction(action)
    ? { profile: DEFI_PROFILE, operation: state.data.defi?.snapshot?.operations?.find(row => row.requestId === body.requestId) ?? null }
    : null);
  // This is a distinct browser import of an existing issueActionCapability
  // result, never the account-only manualActionHandoff authority workflow.
  const wrappedDescriptor = wrappedWithdrawalAccess === null ? null : handoffDescriptor(handoffData(wrappedWithdrawalAccess));
  let wrappedExactAccess = null, wrappedDisconnected = false;
  const usedWrappedTokens = new Set();
  const invalidateWrappedAccess = () => {
    if (wrappedExactAccess) usedWrappedTokens.add(wrappedExactAccess);
    wrappedExactAccess = null;
  };
  const wrappedReady = () => wrappedDescriptor !== null && !wrappedDisconnected;
  let exactGrant = null, handoffDisconnected = false, importingGrant = false;
  const invalidateGrant = () => { exactGrant = null; invalidateWrappedAccess(); invalidateExactAccess(); };
  const handoffReady = () => pinnedHandoff !== null && !handoffDisconnected
    && state.data?.manualActionHandoff?.profile === HANDOFF_PROFILE
    && state.data.manualActionHandoff.origin === pinnedHandoff.origin
    && state.data.manualActionHandoff.listenerId === pinnedHandoff.listenerId;
  let boundNativeIdentity = null;
  let state = { data: null, stale: false, portfolioStale: false, nativeStale: false, nativeIdentityMismatch: false, nativeSnapshotFresh: false,
    accountStale: false, accountSnapshotFresh: false, networksStale: false, defiStale: false, transfersStale: false, reading: false, sending: false,
    wrappedWithdrawalAttempts: [], wrappedWithdrawalMutationUncertain: false, lastUpdated: null, revision: 0, review: null, exactGrantReady: false, outcome: null, originalRequestId: null, originalRequestIds: { native: null, defi: null, account: null }, error: '' };
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(copy(state)); };
  const update = next => { state = { ...state, ...next }; emit(); };
  const client = {
    getState: () => copy(state),
    subscribe(listener) { listeners.add(listener); listener(copy(state)); return () => listeners.delete(listener); },
    can: action => actionAvailability(state, action, { ...tokenFlags,
      actionToken: isWrappedWithdrawalAction(action) && wrappedDescriptor !== null ? wrappedReady()
        : tokenFlags.actionToken || handoffReady() && accountAction(action)
          || exactReady() && EXACT_BROWSER_ACTIONS.includes(action) }),
    canConfirm() { return Boolean(state.review && state.review.revision === state.revision && client.can(state.review.action)
      && (!state.review.manualHandoff || exactGrant !== null)
      && (!state.review.wrappedWithdrawalReview || wrappedExactAccess !== null)
      && (!state.review.exactActionReview || browserExactAccess !== null)); },
    getExactActionReview() { return state.review?.exactActionReview ? copy(state.review.exactActionReview) : null; },
    acceptExactActionAccess(input) {
      if (!exactReady() || state.sending || browserExactAccess || !state.review?.exactActionReview
        || !client.can(state.review.action) || state.review.revision !== state.revision) return false;
      try {
        const review = state.review;
        const current = exactBrowserReview({ descriptor: exactDescriptor, revision: state.revision,
          reviewId: review.exactActionReview.reviewId, action: review.action, body: review.body,
          context: exactContext(review.action, review.body, accountActionContext(state, review.action, review.body)) });
        if (!sameHandoff(current, review.exactActionReview)) return false;
        browserExactAccess = exactBrowserAccess(input, current, usedExactTokens);
        update({ exactGrantReady: true }); return true;
      } catch { return false; }
    },
    disconnectExactActionHost() {
      exactDisconnected = true; invalidateExactAccess();
      if (!state.sending && state.review?.exactActionReview) update({ review: null, exactGrantReady: false });
    },
    getWrappedWithdrawalReview() { return state.review?.wrappedWithdrawalReview ? copy(state.review.wrappedWithdrawalReview) : null; },
    acceptWrappedWithdrawalActionAccess(input) {
      if (!wrappedReady() || state.sending || wrappedExactAccess || !state.review?.wrappedWithdrawalReview || !client.can(state.review.action)) return false;
      try {
        const grant = handoffData(input), expected = state.review.wrappedWithdrawalReview;
        if (Object.keys(grant).sort().join(',') !== 'access,review'
          || Object.keys(grant.access).sort().join(',') !== 'origin,token'
          || grant.access.origin !== wrappedDescriptor.origin || !accountDigest(grant.access.token)
          || usedWrappedTokens.has(grant.access.token) || !sameHandoff(grant.review, expected)
          || state.review.revision !== state.revision
          || !sameHandoff(wrappedWithdrawalContext(state, state.review.action, state.review.body), state.review.wrappedWithdrawalContext)) return false;
        // A matching envelope is display binding, not proof of token authority.
        // The existing server registry checks this one-use token, exact body,
        // original session and listener before any service effect.
        wrappedExactAccess = grant.access.token; update({ exactGrantReady: true }); return true;
      } catch { return false; }
    },
    disconnectWrappedWithdrawalHost() {
      wrappedDisconnected = true; invalidateWrappedAccess();
      if (!state.sending) update(state.review?.wrappedWithdrawalReview ? { review: null, exactGrantReady: false } : {});
    },
    getManualActionReview() { return state.review?.manualHandoff ? copy(state.review.manualHandoff) : null; },
    async acceptManualActionGrant(input) {
      // This imports only an existing unforgeable grant. A forged token may
      // reach POST but cannot pass the server's original capability registry.
      if (!handoffReady() || state.sending || importingGrant || exactGrant || !state.review?.manualHandoff) return false;
      const pendingReview = state.review;
      try {
        const grant = handoffData(input);
        if (Object.keys(grant).sort().join(',') !== 'access,profile,request,version'
          || grant.version !== 1 || grant.profile !== state.review.manualHandoff.profile
          || Object.keys(grant.access).sort().join(',') !== 'origin,token'
          || grant.access.origin !== pinnedHandoff.origin || typeof grant.access.token !== 'string'
          || /^[0-9a-f]{64}$/.exec(grant.access.token)?.[0] !== grant.access.token
          || !sameHandoff(grant.request, state.review.manualHandoff)) return false;
        importingGrant = true;
        const response = await request('/api/wallet/state', { method: 'GET', headers: { 'x-wallet-owner-token': ownerToken } }, readTimeoutMs);
        if (!response.ok) throw new Error('WALLET_MANUAL_HANDOFF_UNVERIFIED');
        const current = validateWalletState(response.value);
        const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(grant.access.token));
        const tokenSHA256 = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
        if (state.review !== pendingReview || !handoffReady() || current.manualActionHandoff?.grant?.reviewId !== pendingReview.manualHandoff.reviewId
          || current.manualActionHandoff.grant.tokenSHA256 !== tokenSHA256
          || !sameHandoff(pendingReview.manualHandoff, manualReviewRequest(current, pendingReview.action,
            pendingReview.body, pendingReview.manualHandoff.reviewId, pinnedHandoff))) throw new Error('WALLET_MANUAL_HANDOFF_UNVERIFIED');
        exactGrant = grant.access.token; update({ exactGrantReady: true }); return true;
      } catch { if (state.review === pendingReview) client.cancelReview(); return false; }
      finally { importingGrant = false; }
    },
    disconnectManualActionHost() {
      handoffDisconnected = true; exactDisconnected = true; invalidateGrant();
      if (!state.sending) update({ review: null, exactGrantReady: false });
    },
    async refresh() {
      if (state.reading || state.sending) return false;
      if (!tokenFlags.ownerToken) { update({ error: 'Acceso del titular no disponible. Abre esta interfaz desde el proceso local autorizado.', stale: Boolean(state.data) }); return false; }
      invalidateGrant(); update({ reading: true, review: null, exactGrantReady: false, error: '' });
      try {
        const response = await request('/api/wallet/state', { method: 'GET', headers: { 'x-wallet-owner-token': ownerToken } }, readTimeoutMs);
        if (!response.ok) throw new Error('WALLET_READ_FAILED');
        const next = validateWalletState(response.value);
        if (pinnedHandoff && next.manualActionHandoff && (next.manualActionHandoff.origin !== pinnedHandoff.origin
          || next.manualActionHandoff.listenerId !== pinnedHandoff.listenerId)) throw new Error('WALLET_MANUAL_HANDOFF_LISTENER_CHANGED');
        if (exactDescriptor && next.manualActionHandoff && (next.manualActionHandoff.origin !== exactDescriptor.origin
          || next.manualActionHandoff.listenerId !== exactDescriptor.listenerId)) throw new Error('WALLET_EXACT_BROWSER_LISTENER_CHANGED');
        const portfolioStale = next.errors.portfolio !== null;
        const nativeStale = next.errors.nativeClaims !== null;
        const nativeSnapshotFresh = record(next.nativeClaims?.snapshot);
        const accountStale = Boolean(next.errors.account), accountSnapshotFresh = validAccountSnapshot(next.account?.snapshot);
        const nextIdentity = originalNativeIdentity(next.nativeClaims);
        const nativeIdentityMismatch = nextIdentity !== null && boundNativeIdentity !== null && !sameNativeIdentity(nextIdentity, boundNativeIdentity);
        if (nextIdentity !== null && boundNativeIdentity === null) boundNativeIdentity = copy(nextIdentity);
        if (portfolioStale && next.portfolio === null && state.data?.portfolio) next.portfolio = copy(state.data.portfolio);
        if (nativeStale && state.data?.nativeClaims) {
          next.nativeClaims ??= { snapshot: null, owner: null };
          next.nativeClaims.snapshot ??= copy(state.data.nativeClaims.snapshot);
          next.nativeClaims.owner ??= copy(state.data.nativeClaims.owner);
        }
        if (accountStale && state.data?.account) {
          next.account ??= { snapshot: null };
          next.account.snapshot ??= copy(state.data.account.snapshot);
        }
        const networksStale = Boolean(next.errors.networks), defiStale = Boolean(next.errors.defi), transfersStale = Boolean(next.errors.transfers);
        // New failed/blocked metadata replaces old rows. Only an absent section
        // can retain the previous list, explicitly historical and unrevalidated.
        if (transfersStale && next.transfers == null && state.data?.transfers) next.transfers = copy(state.data.transfers);
        for (const key of ['networks', 'defi']) if (next.errors[key] && state.data?.[key]) {
          if (next[key] === null || next[key] === undefined) next[key] = copy(state.data[key]);
          else if (key === 'defi' && next.defi.snapshot === null) next.defi.snapshot = copy(state.data.defi.snapshot);
        }
        update({ data: next, stale: false, portfolioStale, nativeStale, nativeIdentityMismatch, nativeSnapshotFresh,
          // The public journal cannot establish that a receiver uncertainty
          // latch was cleared. Retain this conservative page-local fence even
          // when later reconciliation confirms the original receipt.
          wrappedWithdrawalMutationUncertain: state.wrappedWithdrawalMutationUncertain
            || wrappedDescriptor !== null && next.wrappedWithdrawals?.snapshot?.operations?.some(row => ['SIGNING_UNKNOWN', 'SEND_UNKNOWN', 'UNKNOWN'].includes(row.state)) === true,
          accountStale, accountSnapshotFresh, networksStale, defiStale, transfersStale,
          reading: false, lastUpdated: now(), revision: state.revision + 1 });
        return true;
      } catch {
        update({ reading: false, stale: true, nativeSnapshotFresh: false, accountSnapshotFresh: false, review: null,
          error: state.data ? 'No se pudo verificar el estado. Se conserva la última vista como desactualizada. Actualiza manualmente antes de actuar.' : 'No se pudo verificar el estado. No hay datos previos ni saldo conocido. Puedes volver a consultar manualmente.' });
        return false;
      }
    },
    review(action, input) {
      if (!client.can(action)) throw new Error('Acción no disponible: actualiza el estado y revisa la capacidad del servicio');
      const body = buildActionBody(action, input);
      if (['defiExecute', 'defiRequote'].includes(action)) {
        const row = state.data.defi?.snapshot?.operations?.find(item => item.requestId === body.requestId);
        if (!row || row.phase !== 'READY_TO_REDEEM' || row.sendBlocked !== false)
          throw new Error('Primero actualiza y concilia el original: ejecutar o recotizar requiere READY_TO_REDEEM y envío no bloqueado');
      }
      const context = accountActionContext(state, action, body);
      const wrappedContext = wrappedWithdrawalContext(state, action, body);
      if (wrappedContext && wrappedDescriptor !== null && !['wrappedWithdrawReconcile','wrappedWithdrawCancel'].includes(action)) {
        const previous = state.wrappedWithdrawalAttempts.find(item => item.role === wrappedContext.terms.role);
        if (state.wrappedWithdrawalMutationUncertain || state.wrappedWithdrawalAttempts.some(item => item.uncertain && item.executeAttempted)
          || previous && (previous.uncertain || previous.action === action || previous.executeAttempted))
          throw new Error('Solo se permite consultar y conciliar la solicitud original retenida; no repetir su preparación o envío');
      }
      invalidateGrant();
      let manualHandoff, wrappedWithdrawalReview, exactActionReview;
      if (wrappedContext && wrappedDescriptor !== null) {
        if (!wrappedReady() || typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('WALLET_WRAPPED_WITHDRAWAL_UNAVAILABLE');
        wrappedWithdrawalReview = { version: 1, profile: 'ORIGINAL_WRAPPED_WITHDRAWAL_BROWSER_REVIEW_V1',
          ...wrappedDescriptor, revision: state.revision,
          reviewId: Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''),
          action, body: copy(body), context: copy(wrappedContext) };
      }
      if (!wrappedContext && !tokenFlags.actionToken && !context?.graph && !context?.nativeNote
        && exactReady() && EXACT_BROWSER_ACTIONS.includes(action)) {
        if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('WALLET_EXACT_BROWSER_REVIEW_UNAVAILABLE');
        const reviewId = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
        exactActionReview = exactBrowserReview({ descriptor: exactDescriptor, revision: state.revision,
          reviewId, action, body, context: exactContext(action, body, context) });
      } else if (!wrappedContext && !tokenFlags.actionToken && pinnedHandoff) {
        if (!(context?.graph || context?.nativeNote) || !handoffReady() || typeof globalThis.crypto?.getRandomValues !== 'function')
          throw new Error('WALLET_MANUAL_HANDOFF_UNAVAILABLE');
        const reviewId = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
        manualHandoff = manualReviewRequest(state.data, action, body, reviewId, pinnedHandoff);
      }
      const review = { action, ...actionReview(action, body, state.nativeIdentityMismatch ? null : state.data.nativeClaims, context, wrappedContext),
        revision: state.revision, ...(manualHandoff ? { manualHandoff } : {}), ...(wrappedWithdrawalReview ? { wrappedWithdrawalReview } : {}),
        ...(exactActionReview ? { exactActionReview } : {}) };
      update({ review, exactGrantReady: false, error: '' }); return copy(review);
    },
    cancelReview() { invalidateGrant(); if (!state.sending) update({ review: null, exactGrantReady: false }); },
    async confirm() {
      const review = state.review;
      if (!client.canConfirm()) return false;
      if (actionGroup(review.action) === 'native' && review.action !== 'reconcile'
        && !sameNativeIdentity(review.nativeIdentity, originalNativeIdentity(state.data.nativeClaims))) return false;
      if (isWrappedWithdrawalAction(review.action)) { try { if (JSON.stringify(wrappedWithdrawalContext(state, review.action, review.body)) !== JSON.stringify(review.wrappedWithdrawalContext)) return false; } catch { return false; } }
      if (accountAction(review.action)) {
        try { if (JSON.stringify(accountActionContext(state, review.action, review.body)) !== JSON.stringify(review.accountContext)) return false; }
        catch { return false; }
      }
      if (review.manualHandoff) {
        try { if (!sameHandoff(review.manualHandoff, manualReviewRequest(state.data, review.action, review.body,
          review.manualHandoff.reviewId, pinnedHandoff))) { client.cancelReview(); return false; } }
        catch { client.cancelReview(); return false; }
      }
      if (review.exactActionReview) {
        try {
          const current = exactBrowserReview({ descriptor: exactDescriptor, revision: state.revision,
            reviewId: review.exactActionReview.reviewId, action: review.action, body: review.body,
            context: exactContext(review.action, review.body, accountActionContext(state, review.action, review.body)) });
          if (!sameHandoff(current, review.exactActionReview)) { client.cancelReview(); return false; }
        } catch { client.cancelReview(); return false; }
      }
      const sendToken = review.wrappedWithdrawalReview ? wrappedExactAccess : review.manualHandoff ? exactGrant
        : review.exactActionReview ? browserExactAccess : actionToken;
      invalidateGrant();
      const group = actionGroup(review.action);
      const id = review.body.requestId ?? state.originalRequestIds[group];
      let wrappedWithdrawalAttempts = state.wrappedWithdrawalAttempts;
      if (review.wrappedWithdrawalReview) {
        const role = review.wrappedWithdrawalContext.terms.role;
        const previous = wrappedWithdrawalAttempts.find(item => item.role === role);
        wrappedWithdrawalAttempts = [...wrappedWithdrawalAttempts.filter(item => item.role !== role),
          { role, requestId: id, termsSHA256: review.body.termsSHA256, action: review.action,
            uncertain: previous?.uncertain === true, executeAttempted: previous?.executeAttempted === true || review.action === 'wrappedWithdrawExecute' }];
      }
      update({ review: null, exactGrantReady: false, sending: true, originalRequestId: id, wrappedWithdrawalAttempts,
        originalRequestIds: { ...state.originalRequestIds, [group]: id }, error: '', outcome: null });
      try {
        const response = await request(ALL_ACTIONS[review.action].route, { method: 'POST',
          headers: { 'x-wallet-action-token': sendToken, 'Content-Type': 'application/json' }, body: JSON.stringify(review.body) }, actionTimeoutMs);
        const outcome = actionResponseOutcome(review.action, review.body, response, id);
        update({ sending: false, stale: true, outcome, error: '' });
        return true;
      } catch {
        update({ sending: false, stale: true,
          wrappedWithdrawalAttempts: review.wrappedWithdrawalReview
            ? state.wrappedWithdrawalAttempts.map(item => item.role === review.wrappedWithdrawalContext.terms.role ? { ...item, uncertain: true } : item)
            : state.wrappedWithdrawalAttempts,
          outcome: { state: 'UNKNOWN', action: review.action, requestId: id },
          error: review.action === 'defiReopen' ? 'Resultado de la reapertura desconocido. Actualiza manualmente para revisar el servicio original; no se repitió la acción ni se reenviaron operaciones.'
            : 'Resultado de la acción desconocido. No se reenvió nada. Conserva el ID original, actualiza manualmente y concilia esa solicitud.' });
        return false;
      }
    },
  };
  return Object.freeze(client);
}
