import {createHttpErc20Portfolio} from '@lianum/backend/portfolio/erc20';
import {WRAPPED_RESUME_ACTIONS} from '../client/features/withdrawals/wrapped-withdrawal-resume-actions.mjs';
import { assertOwnedWrappedWithdrawalSessionV1 } from '@lianum/backend/withdrawals/session';
/** Private composition of existing wallet sessions. This server owns only its
 * listener, never wallet custody, root keys, native nodes or durable jobs. */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { types } from 'node:util';
import { publicCode } from './errors/public-errors.mjs';
import { HANDOFF_PROFILE, handoffData, sameHandoff, manualReviewRequest } from '../client/features/accounts/manual-action-handoff.mjs';
import { ALL_ACTIONS, accountActionContext } from '../client/state/view-model.mjs';
import { createExactActionCapabilities, exactActionCapabilityBody, EXACT_ACTION_DEFAULT_TTL_MS } from './security/exact-action-capabilities.mjs';
import { flatManualGraphReviews, flatManualGraphActionTarget, flatManualGraphHandoffBindings, flatManualNativeNoteReviews, flatManualNativeNoteActionTarget, flatManualWrappedGraphActionTarget } from '@lianum/backend/accounts/manual-graph';
import { assertFlatAccountSession, validateFlatAccountPrepare } from '@lianum/backend/accounts/session';
import { assertWalletClaimSession as assertNativeClaimSession, walletClaimSessionIdentity as nativeClaimSessionIdentity } from '@lianum/backend/claims/session';
import { createHttpPortfolioRegistry } from '@lianum/backend/portfolio/http';
import { normalizePortfolioRequest } from '@lianum/backend/portfolio/requests';
import { assertTronNativeTransferObserver } from '@lianum/backend/transfers/tron';
import { assertEvmNativeTransferObserver } from '@lianum/backend/transfers/evm';
import { assertOwnedPrivateVaultExit } from '@lianum/backend/defi/withdrawal';
import { generationPrivateVaultExitBinding, assertGenerationPrivateVaultExitSession, generationPrivateVaultExitActionTarget }
  from '@lianum/backend/defi/generation-withdrawal';

const wrappedWithdrawalActions=Object.freeze({...Object.fromEntries(Object.values(WRAPPED_RESUME_ACTIONS).map(value=>[value.route,value.method])),'/api/wallet/wrapped-withdrawal/reapprove':'reapprove','/api/wallet/wrapped-withdrawal/cancel':'cancel','/api/wallet/wrapped-withdrawal/prepare':'prepare','/api/wallet/wrapped-withdrawal/execute':'execute','/api/wallet/wrapped-withdrawal/reconcile':'reconcile'});
const BODY_LIMIT = 4096;
const actions = Object.freeze({
  '/api/wallet/native/deposit': 'deposit', '/api/wallet/native/redeem': 'redeem',
  '/api/wallet/native/refund': 'refund', '/api/wallet/native/reconcile': 'reconcile',
  '/api/wallet/native/resume': 'resume',
});
const accountActions = Object.freeze({ '/api/wallet/account/prepare': 'prepare',
  '/api/wallet/account/execute': 'execute', '/api/wallet/account/reconcile': 'reconcile', '/api/wallet/account/recover': 'recover' });
const accountKinds = new Set(['TOP_UP', 'EXIT']);
const accountReconcileStates = new Set(['SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED']);
const defiActions = Object.freeze({ '/api/wallet/defi/prepare': 'prepare', '/api/wallet/defi/requote': 'requote',
  '/api/wallet/defi/execute': 'execute', '/api/wallet/defi/reconcile': 'reconcile', '/api/wallet/defi/reopen': 'reopen' });
const assets = { '/': [new URL('../client/index.html', import.meta.url), 'text/html; charset=utf-8'],
  '/app.mjs': [new URL('../client/app.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/owner-graph-review-v1.mjs': [new URL('../client/features/accounts/owner-graph-review-v1.mjs', import.meta.url), 'text/javascript; charset=utf-8'], '/generation-position-state-v2.mjs': [new URL('../client/features/portfolio/generation-position-state-v2.mjs', import.meta.url), 'text/javascript; charset=utf-8'], '/public-token-observations.mjs': [new URL('../client/features/portfolio/public-token-observations.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/wrapped-resume-browser.mjs': [new URL('../client/features/withdrawals/wrapped-resume-browser.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/wrapped-withdrawal-resume-actions.mjs': [new URL('../client/features/withdrawals/wrapped-withdrawal-resume-actions.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/wrapped-withdrawal-review.mjs': [new URL('../client/features/withdrawals/wrapped-withdrawal-review.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/native-note-review.mjs': [new URL('../client/features/claims/native-note-review.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/manual-action-handoff.mjs': [new URL('../client/features/accounts/manual-action-handoff.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/manual-action-dom.mjs': [new URL('../client/features/accounts/manual-action-dom.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/exact-action-browser-review.mjs': [new URL('../client/features/accounts/exact-action-browser-review.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/view-model.mjs': [new URL('../client/state/view-model.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/generation-defi-contract.mjs': [new URL('../client/features/defi/generation-defi-contract.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/original-economic-state-v1.mjs': [new URL('../client/features/portfolio/original-economic-state-v1.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/owner-portfolio-contract.mjs': [new URL('../client/features/portfolio/owner-portfolio-contract.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/style.css': [new URL('../client/style.css', import.meta.url), 'text/css; charset=utf-8'] };
// Expose the same explicit asset set at its canonical client paths.
const clientRoot = new URL('../client/', import.meta.url);
for (const [url, type] of Object.values(assets)) {
  if (type.startsWith('text/html')) continue;
  const pathname = '/' + url.pathname.slice(clientRoot.pathname.length);
  if (!Object.hasOwn(assets, pathname)) assets[pathname] = [url, type];
}
// Explicit browser-safe shared modules; no directory listing or arbitrary paths.
const sharedBrowserAssets = {
  'original-wallet-economic-state-v1.mjs': new URL('../../../../packages/mobile-protocol/src/original-wallet-economic-state-v1.mjs', import.meta.url),
  'wallet/client/view-model.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs', import.meta.url),
  'wallet/contracts/exact-action-browser-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/exact-action-browser-review.mjs', import.meta.url),
  'wallet/contracts/generation-defi-contract.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/generation-defi-contract.mjs', import.meta.url),
  'wallet/contracts/generation-position-state-v2.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/generation-position-state-v2.mjs', import.meta.url),
  'wallet/contracts/manual-action-handoff.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/manual-action-handoff.mjs', import.meta.url),
  'wallet/contracts/native-note-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/native-note-review.mjs', import.meta.url),
  'wallet/contracts/owner-graph-review-v1.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/owner-graph-review-v1.mjs', import.meta.url),
  'wallet/contracts/owner-portfolio-contract.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/owner-portfolio-contract.mjs', import.meta.url),
  'wallet/contracts/public-token-observations.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/public-token-observations.mjs', import.meta.url),
  'wallet/contracts/wrapped-withdrawal-resume-actions.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/wrapped-withdrawal-resume-actions.mjs', import.meta.url),
  'wallet/contracts/wrapped-withdrawal-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/wrapped-withdrawal-review.mjs', import.meta.url),
};
for (const [relative, url] of Object.entries(sharedBrowserAssets)) {
  const entry = [url, 'text/javascript; charset=utf-8'];
  assets['/packages/mobile-protocol/src/' + relative] = entry;
  assets['/mobile-protocol/src/' + relative] = entry;
}
Object.freeze(assets);
const sensitiveHeaders = new Set(['host', 'origin', 'content-type', 'content-length', 'transfer-encoding',
  'x-wallet-owner-token', 'x-wallet-action-token', 'sec-fetch-site']);
const failure = code => Object.assign(new Error(code), { code });
function need(value, code) { if (!value) throw failure(code); }
function fields(value, names, required = []) {
  need(value && typeof value === 'object' && !types.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype, 'WALLET_BOOTSTRAP_FIELDS');
  const keys = Reflect.ownKeys(value);
  need(keys.every(key => names.includes(key)) && required.every(key => keys.includes(key)), 'WALLET_BOOTSTRAP_FIELDS');
  for (const key of keys) need(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'), 'WALLET_BOOTSTRAP_FIELDS');
}
function bindings(input, economicModule = null) {
  fields(input, ['accountSession', 'nativeClaimSession', 'wrappedWithdrawalSession', 'defiExit', 'networkConfig', 'transferObservers', 'economicState']);
  const economicState = input.economicState ?? null;
  if (economicState !== null) {need(economicModule !== null, 'WALLET_ECONOMIC_BOOTSTRAP_REQUIRED'); economicModule.assertOriginalWalletEconomicStateV1(economicState);}
  const accountSession = input.accountSession ?? null, nativeClaimSession = input.nativeClaimSession ?? null;
  const wrappedWithdrawalSession=input.wrappedWithdrawalSession??null;
  if(wrappedWithdrawalSession!==null)assertOwnedWrappedWithdrawalSessionV1(wrappedWithdrawalSession);
  if (accountSession !== null) assertFlatAccountSession(accountSession);
  if (nativeClaimSession !== null) assertNativeClaimSession(nativeClaimSession);
  const nativeIdentity = nativeClaimSession === null ? null : nativeClaimSessionIdentity(nativeClaimSession) ?? null;
  let defiExit = null, networkReads = null;
  if (input.defiExit !== undefined && input.defiExit !== null) {
    fields(input.defiExit, ['runtime', 'service'], ['runtime', 'service']);
    const generation = generationPrivateVaultExitBinding(input.defiExit.runtime, input.defiExit.service);
    if (generation) assertGenerationPrivateVaultExitSession(input.defiExit.runtime, input.defiExit.service, accountSession);
    else assertOwnedPrivateVaultExit(input.defiExit.runtime, input.defiExit.service);
    defiExit = Object.freeze({ runtime: input.defiExit.runtime, service: input.defiExit.service, generation: generation !== null });
  }
  if (input.networkConfig !== undefined && input.networkConfig !== null) {
    fields(input.networkConfig, ['networks', 'accounts', 'tokens'], ['networks', 'accounts']);
    const { networks, accounts } = input.networkConfig;
    need(Array.isArray(accounts) && !types.isProxy(accounts) && Object.getPrototypeOf(accounts) === Array.prototype
      && accounts.length <= 7 && Reflect.ownKeys(accounts).length === accounts.length + 1, 'WALLET_NETWORK_ACCOUNTS');
    const selected = new Set(), requests = [];
    for (let index = 0; index < accounts.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(accounts, String(index));
      need(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'WALLET_NETWORK_ACCOUNTS');
      const account = descriptor.value;
      fields(account, ['chain', 'address'], ['chain', 'address']);
      const request = normalizePortfolioRequest({ chain: account.chain, address: account.address, query: 'native-balance' });
      need(!selected.has(request.chain), 'WALLET_NETWORK_ACCOUNT_DUPLICATE'); selected.add(request.chain);
      requests.push(Object.freeze(request));
    }
    // Only this private bootstrap chooses endpoints/genesis/owner addresses.
    // Browser requests never carry RPC configuration or query targets.
    const nativeRegistry=createHttpPortfolioRegistry({networks});
    const tokenRegistry=input.networkConfig.tokens===undefined?null:createHttpErc20Portfolio({networks,assets:input.networkConfig.tokens});
    const tokenRequests=tokenRegistry?tokenRegistry.listAssets().map(asset=>{const owner=requests.find(r=>r.chain===asset.chain);need(owner,'WALLET_TOKEN_ACCOUNT_NOT_CONFIGURED');return Object.freeze({chain:asset.chain,address:owner.address,query:'erc20-balance',token:asset.token});}):[];
    networkReads = Object.freeze({ registry: nativeRegistry, requests: Object.freeze(requests),tokenRegistry,tokenRequests:Object.freeze(tokenRequests) });
  }
  let transferReads = null;
  if (input.transferObservers !== undefined && input.transferObservers !== null) {
    const observers = input.transferObservers;
    need(Array.isArray(observers) && !types.isProxy(observers) && Object.getPrototypeOf(observers) === Array.prototype
      && observers.length <= 8 && Reflect.ownKeys(observers).length === observers.length + 1, 'WALLET_TRANSFER_OBSERVERS');
    const seen = new Set(), entries = [];
    for (let index = 0; index < observers.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(observers, String(index));
      need(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'WALLET_TRANSFER_OBSERVERS');
      const observer = descriptor.value;
      // Brand checks never invoke user-supplied methods or property getters.
      try { assertEvmNativeTransferObserver(observer); }
      catch { assertTronNativeTransferObserver(observer); }
      const original = observer.originalIdentity();
      const configured = networkReads?.registry.listChains().find(row => row.configured && row.chain === original.chain)?.network;
      const account = networkReads?.requests.find(row => row.chain === original.chain);
      // Provenance alone is not owner authorization. Associate the immutable
      // original with the separately fixed owner/network bootstrap, never HTTP.
      need(configured && account && configured.family === original.family && configured.chainId === original.chainId
        && configured.genesisHash === original.genesisHash && configured.networkId === original.networkId
        && configured.nativeAsset.id === original.asset.id
        && (account.address === original.from || account.address === original.to), 'WALLET_TRANSFER_OWNER_ASSOCIATION');
      const key = original.networkId + ':' + original.nativeId;
      need(!seen.has(key), 'WALLET_TRANSFER_DUPLICATE'); seen.add(key);
      entries.push(Object.freeze({ observer, original, ownerAddress: account.address,
        direction: original.from === account.address ? original.to === account.address ? 'self' : 'outgoing' : 'incoming' }));
    }
    if (entries.length) transferReads = Object.freeze(entries);
  }
  if (economicState !== null) {
    const originals = economicModule.originalWalletEconomicStateBindingsV1(economicState);
    if (accountSession !== null) need(originals.some(r => r.session === accountSession), 'WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED');
    if (defiExit !== null) need(originals.some(r => r.positions === defiExit.service), 'WALLET_ECONOMIC_ORIGINAL_POSITIONS_REQUIRED');
  }
  return Object.freeze({ accountSession, nativeClaimSession, wrappedWithdrawalSession, nativeIdentity, defiExit, networkReads, transferReads, economicState });
}
function validToken(value, expected) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
    && timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(expected, 'hex'));
}
function repeatedHeader(request) {
  const seen = new Set();
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index].toLowerCase();
    if (sensitiveHeaders.has(name) && seen.has(name)) return true;
    seen.add(name);
  }
  return false;
}
async function body(request) {
  need(request.headers['content-type'] === 'application/json', 'WALLET_CONTENT_TYPE');
  const length = request.headers['content-length'];
  need(length === undefined || /^(0|[1-9][0-9]*)$/.test(length) && Number(length) <= BODY_LIMIT, 'WALLET_BODY_TOO_LARGE');
  let bytes = 0; const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length; need(bytes <= BODY_LIMIT, 'WALLET_BODY_TOO_LARGE'); chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw failure('WALLET_INVALID_JSON'); }
}
const transferStatuses = new Set(['unobserved', 'observed', 'pending', 'reverted', 'unknown', 'reorged', 'stale']);
const transferInteger = value => value === null || typeof value === 'string'
  && /^(0|[1-9][0-9]{0,19})$/.exec(value)?.[0] === value && BigInt(value) < 1n << 64n;
function transferMetadata(original) {
  // Explicit projection: future status extensions cannot expose wire, receipt,
  // proof/effect commitments, signatures, RPC configuration or capability data.
  const keys = ['nativeId', 'chain', 'family', 'chainId', 'genesisHash', 'networkId', 'from', 'to', 'value', 'nonce', 'transactionType'];
  return { schema: `flat-${original.family}-original-transfer-status/1`, ...Object.fromEntries(keys.map(key => [key, original[key]])),
    asset: Object.fromEntries(['id', 'kind', 'symbol', 'decimals', 'commitment'].map(key => [key, original.asset[key]])),
    metadataOnly: true, currentFinalityVerified: false, creditEligible: false, privateSpendableAtomic: null,
    graphAdmissionEligible: false, deliveryVerified: false, recipientRetainedValueVerified: false,
    source: 'retained-observation-metadata', freshness: 'not-revalidated',
    ...(original.family === 'tron' ? { finalitySource: 'rpc-solidified', independentConsensusVerified: false,
      accountPermissionVerified: false, taposVerified: false, expirationVerified: false } : {}) };
}
function retainedTransferStatus(binding) {
  const retained = binding.observer.status();
  need(retained?.schema === `flat-${binding.original.family}-original-transfer-status/1` && transferStatuses.has(retained.status)
    && (retained.reason === null || typeof retained.reason === 'string' && /^[A-Z][A-Z0-9_]{0,120}$/.exec(retained.reason)?.[0] === retained.reason)
    && transferInteger(retained.observedAtMs) && transferInteger(retained.validUntilMs), 'WALLET_TRANSFER_STATUS_UNAVAILABLE');
  return { ...transferMetadata(binding.original), status: retained.status, reason: retained.reason,
    observedAtMs: retained.observedAtMs, validUntilMs: retained.validUntilMs };
}
async function refreshTransfer(binding, blocked) {
  let refreshStatus = blocked ? 'BLOCKED' : 'REFRESHED', errorCode = blocked, status;
  if (!blocked) try {
    // Deliberately discard the richer return value, which can contain raw wire.
    await binding.observer.observe({ nativeId: binding.original.nativeId });
  } catch { refreshStatus = 'FAILED'; errorCode = 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE'; }
  try { status = retainedTransferStatus(binding); }
  catch {
    refreshStatus = 'FAILED'; errorCode = 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE';
    status = { ...transferMetadata(binding.original), observedAtMs: null, validUntilMs: null };
  }
  if (refreshStatus !== 'REFRESHED') {
    // A retained prior success must never survive as the apparent current result
    // of a blocked or failed refresh. Retain identity/last-attempt metadata only.
    status = { ...status, status: refreshStatus === 'BLOCKED' ? 'stale' : 'unknown', reason: errorCode, validUntilMs: null };
  } else if (!['observed', 'pending', 'reverted'].includes(status.status)) errorCode = status.reason ?? 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE';
  return { ownerAddress: binding.ownerAddress, direction: binding.direction, refreshStatus, errorCode, status };
}
function capabilityView(snapshot, identity = null) {
  const ready = snapshot?.phase === 'READY' && snapshot.storageAvailable === true
    && snapshot.busy === false && snapshot.queued === 0;
  const newAction = Boolean(identity) && ready && !snapshot.requiresExternalEffectReconciliation;
  return { nativeDeposit: Boolean(newAction), nativeRedeem: Boolean(newAction), nativeRefund: Boolean(newAction),
    nativeReconcile: Boolean(ready), nativeResume: Boolean(identity && ready), graphExecution: false };
}

/** Original branded sessions only. No HTTP route can create, bind or select
 * accounts, owners, native destinations, RPC endpoints, executables or files. */
export async function startWalletApplication(options = {}) {
  fields(options, ['accountSession', 'nativeClaimSession', 'wrappedWithdrawalSession', 'defiExit', 'networkConfig', 'transferObservers', 'port', 'actionAccessMode', 'economicState']);
  // Retain the exact original capability before loading its private producer.
  // Legacy sessions do not import or instantiate the optional economic realm.
  options = {...options};
  const economicModule = options.economicState == null ? null : await import('../../../../packages/backend/src/accounts/state/original-wallet-economic-state-v1.mjs');
  const actionAccessMode = Object.hasOwn(options, 'actionAccessMode') ? options.actionAccessMode : 'manual';
  need(['manual', 'exact-only'].includes(actionAccessMode), 'WALLET_ACTION_ACCESS_MODE');
  const { port = 0 } = options;
  need(Number.isInteger(port) && port >= 0 && port <= 65535, 'WALLET_PORT');
  let bound = bindings({ accountSession: options.accountSession, nativeClaimSession: options.nativeClaimSession, wrappedWithdrawalSession:options.wrappedWithdrawalSession,
    defiExit: options.defiExit, networkConfig: options.networkConfig, transferObservers: options.transferObservers, economicState: options.economicState }, economicModule);
  const connected = value => Boolean(value.accountSession || value.nativeClaimSession || value.wrappedWithdrawalSession || value.defiExit || value.networkReads || value.economicState);
  let boundOnce = connected(bound), origin, host, closed = false, closePromise;
  let reading = false, admitting = false;
  const ownerToken = randomBytes(32).toString('hex');
  // Exact-only mode never creates, embeds, returns or accepts a broad bearer.
  const actionToken = actionAccessMode === 'manual' ? randomBytes(32).toString('hex') : null;
  const exactActions = createExactActionCapabilities();
  const listenerId = randomBytes(32).toString('hex'), handoffGuards = new Map();
  let manualHandoffActive = false, handoffHostCreated = false, pendingHandoffGrant = null;
  function handoffMetadata() {
    return { profile: HANDOFF_PROFILE, origin, listenerId,
      bindings: flatManualGraphHandoffBindings(bound.accountSession),
      grant: pendingHandoffGrant && exactActions.isLive(pendingHandoffGrant.token)
        ? { reviewId: pendingHandoffGrant.reviewId, tokenSHA256: createHash('sha256').update(pendingHandoffGrant.token).digest('hex') } : null };
  }
  function localRequest(input) {
    // Never inspect proxies/accessors supplied to the private shell interface.
    let visited = 0;
    const check = (value, depth = 0) => {
      need(++visited < 4096 && depth < 16, 'WALLET_MANUAL_HANDOFF_INVALID');
      if (!value || typeof value !== 'object') return;
      need(!types.isProxy(value), 'WALLET_MANUAL_HANDOFF_INVALID');
      for (const key of Reflect.ownKeys(value)) {
        const d = Object.getOwnPropertyDescriptor(value, key);
        need(Object.hasOwn(d, 'value'), 'WALLET_MANUAL_HANDOFF_INVALID'); check(d.value, depth + 1);
      }
    };
    check(input); return handoffData(input);
  }
  function verifyManualReview(input, current) {
    need(manualHandoffActive && !closed, 'WALLET_MANUAL_HANDOFF_UNAVAILABLE');
    const expected = manualReviewRequest(current, input.action, input.body, input.reviewId, { origin, listenerId });
    need(sameHandoff(input, expected), 'WALLET_MANUAL_HANDOFF_CHANGED');
    const context = accountActionContext({ data: current, portfolioStale: Boolean(current.errors.portfolio) }, input.action, input.body);
    need(context?.graph || context?.nativeNote, 'WALLET_MANUAL_HANDOFF_INVALID');
    return expected;
  }
  async function currentManualReview(observed) {
    const current = { account: { snapshot: observed.account, manualGraphs: flatManualGraphReviews(bound.accountSession),
      manualNativeNotes: flatManualNativeNoteReviews(bound.accountSession) },
      manualActionHandoff: handoffMetadata(), capabilities: { manualEvmVaultGraph: true, manualNativeNotes: true },
      portfolio: null, errors: { portfolio: null } };
    try { current.portfolio = await bound.accountSession.ownerView(); }
    catch { current.errors.portfolio = 'WALLET_ACCOUNT_OWNER_UNAVAILABLE'; }
    return current;
  }
  const actionTarget = (route, input) => Object.hasOwn(wrappedWithdrawalActions, route) ? bound.wrappedWithdrawalSession : Object.hasOwn(actions, route) ? bound.nativeClaimSession
    : Object.hasOwn(accountActions, route) ? flatManualGraphActionTarget(bound.accountSession, accountActions[route], input)
      ?? flatManualNativeNoteActionTarget(bound.accountSession, accountActions[route], input) ?? bound.accountSession : Object.hasOwn(defiActions, route) && bound.defiExit
      ? generationPrivateVaultExitActionTarget(bound.defiExit.runtime, bound.defiExit.service, defiActions[route], input)
        ?? bound.defiExit.service : null;
  const sockets = new Set();
  async function activity() {
    const value = { account: null, nativeClaims: null, errors: { account: null, nativeClaims: null }, blocked: null };
    let busy = false, unavailable = false;
    // These are original journal-only snapshots. No custody, portfolio, native
    // observer or DeFi health read may precede the shared activity decision.
    for (const [section, session] of [['account', bound.accountSession], ['nativeClaims', bound.nativeClaimSession], ['wrappedWithdrawals',bound.wrappedWithdrawalSession]]) {
      if (!session) continue;
      try {
        const snapshot = await session.snapshot(); value[section] = snapshot;
        const active = snapshot?.busy === true || snapshot?.queued > 0;
        const ready = snapshot?.phase === 'READY' && snapshot.storageAvailable === true
          && snapshot.busy === false && snapshot.queued === 0
          && (section !== 'account' || snapshot.available === true && snapshot.observation === 'CURRENT');
        if (!ready) {
          busy ||= active; unavailable ||= !active;
          value.errors[section] = active ? 'WALLET_OPERATION_IN_PROGRESS'
            : section === 'account' ? 'WALLET_ACCOUNT_SESSION_UNAVAILABLE' : 'WALLET_NATIVE_SESSION_UNAVAILABLE';
        }
      } catch (error) { unavailable = true; value.errors[section] = publicCode(error, section === 'nativeClaims'); }
    }
    value.blocked = busy ? 'WALLET_OPERATION_IN_PROGRESS' : unavailable ? 'WALLET_ACTIVITY_UNAVAILABLE' : null;
    return value;
  }
  async function state() {
    need(!reading && !admitting, 'WALLET_READ_BUSY'); reading = true;
    try {
      const value = { version: 1, profile: 'ACTIVE_FLAT_WALLET_APP_V1', connection: boundOnce ? 'CONNECTED' : 'DISCONNECTED', portfolio: null,
        account: null, nativeClaims: null, networks: null, defi: null, transfers: null, capabilities: { ...capabilityView(null),
          accountPrepare: false, accountExecute: false, accountReconcile: false, accountRecover: false,
          defiPrepare: false, defiRequote: false, defiExecute: false, defiReconcile: false, defiReopen: false },
        errors: { account: null, portfolio: null, nativeClaims: null, networks: null, defi: null, transfers: null } };
      const observed = await activity();
      if (bound.accountSession) {
        value.account = { snapshot: observed.account, manualGraphs: [], manualNativeNotes: [] };
        if (!observed.blocked) try {
          value.account.manualGraphs = flatManualGraphReviews(bound.accountSession);
          value.account.manualNativeNotes = flatManualNativeNoteReviews(bound.accountSession);
          value.capabilities.manualNativeNotes = actionAccessMode === 'exact-only' && value.account.manualNativeNotes.length > 0;
          value.capabilities.manualEvmVaultGraph = actionAccessMode === 'exact-only' && value.account.manualGraphs.length > 0;
          value.capabilities.accountRecover = value.capabilities.manualEvmVaultGraph;
        } catch { value.errors.account = 'WALLET_ACCOUNT_GRAPH_UNAVAILABLE'; }
        value.errors.account ??= observed.errors.account ?? observed.blocked;
      }
      if(bound.wrappedWithdrawalSession){
        value.wrappedWithdrawals={snapshot:observed.wrappedWithdrawals??null,owner:null};value.errors.wrappedWithdrawals=observed.errors.wrappedWithdrawals??observed.blocked;
        if(!observed.blocked)try{value.wrappedWithdrawals.owner=await bound.wrappedWithdrawalSession.ownerView();
          Object.assign(value.capabilities,{wrappedWithdrawReapprove:actionAccessMode==='exact-only'&&(value.wrappedWithdrawals.owner.reviews?.length??0)>0,wrappedWithdrawCancel:actionAccessMode==='exact-only',wrappedWithdrawPrepare:actionAccessMode==='exact-only'&&value.wrappedWithdrawals.owner.offers.length>0,wrappedWithdrawExecute:actionAccessMode==='exact-only',wrappedWithdrawReconcile:actionAccessMode==='exact-only'});
        }catch{value.errors.wrappedWithdrawals='WALLET_WRAPPED_WITHDRAWAL_UNAVAILABLE';}
      }
      if (bound.nativeClaimSession) {
        value.nativeClaims = { identity: bound.nativeIdentity, snapshot: observed.nativeClaims, owner: null };
        value.errors.nativeClaims = observed.errors.nativeClaims ?? observed.blocked;
        if (!observed.blocked) {
          Object.assign(value.capabilities, capabilityView(observed.nativeClaims, bound.nativeIdentity));
          try { value.nativeClaims.owner = await bound.nativeClaimSession.ownerView(); }
          catch (error) { value.errors.nativeClaims = publicCode(error, true); }
        }
      }
      if (bound.accountSession) {
        if (observed.blocked) value.errors.portfolio = observed.blocked;
        else {
          Object.assign(value.capabilities, { accountPrepare: true, accountExecute: true, accountReconcile: true });
          try { value.portfolio = await bound.accountSession.ownerView(); }
          catch (error) { value.errors.portfolio = publicCode(error); }
        }
      }
      if (bound.networkReads) {
        const { registry, requests, tokenRegistry, tokenRequests } = bound.networkReads;
        value.networks = { chains: registry.listChains(), observations: [],
          observation: tokenRequests.length?'TRUSTED_RPC_PUBLIC_HOLDINGS_ONLY':'TRUSTED_RPC_NATIVE_HOLDINGS_ONLY', privateSpendable: false,...(tokenRequests.length?{tokens:[]}: {}) };
        try { value.networks.observations = await Promise.all(requests.map(request => registry.observe(request)));for(const request of tokenRequests)value.networks.tokens.push(await tokenRegistry.observe(request)); }
        catch { value.errors.networks = 'WALLET_NETWORK_OBSERVATION_UNAVAILABLE'; }
      }
      if (bound.transferReads) {
        const rows = await Promise.all(bound.transferReads.map(binding => refreshTransfer(binding, observed.blocked)));
        value.transfers = { profile: bound.transferReads.some(binding => binding.original.family === 'tron')
          ? 'FIXED_ORIGINAL_NATIVE_TRANSFERS_V2' : 'FIXED_ORIGINAL_EVM_TRANSFERS_V1', observation: 'TRUSTED_RPC_RETAINED_TRANSFER_METADATA_ONLY', rows };
        if (rows.some(row => row.errorCode !== null)) value.errors.transfers = observed.blocked ?? 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE';
      }
      if (bound.defiExit) {
        value.defi = { snapshot: null, ...(bound.defiExit.generation ? { positions: null } : {}) };
        if (observed.blocked) value.errors.defi = observed.blocked;
        else try {
          value.defi.snapshot = await bound.defiExit.service.snapshot();
          if (bound.defiExit.generation) value.defi.positions = await (typeof bound.defiExit.service.ownerStateView==='function' ? bound.defiExit.service.ownerStateView() : bound.defiExit.service.ownerView());
          Object.assign(value.capabilities, { defiPrepare: true, defiRequote: true, defiExecute: true, defiReconcile: true, defiReopen: true });
        } catch (error) {
          value.errors.defi = publicCode(error); value.capabilities.defiReopen = true;
        }
      }
      if (bound.economicState) {
        // The existing owner-token/Origin gate precedes this private original
        // capability. HTTP never chooses a source, journal or read callback.
        try { value.economicState = await bound.economicState.observe(); }
        catch {
          try { value.economicState = await bound.economicState.snapshot(); } catch { value.economicState = null; }
          value.errors.economicState = 'WALLET_ECONOMIC_OBSERVATION_UNAVAILABLE';
        }
      }
      // Optional handoff loss must not poison unrelated original read/recovery
      // sections. Omission disables the handoff client; no stale binding cache.
      if (manualHandoffActive) try { value.manualActionHandoff = handoffMetadata(); } catch { /* fail closed for this source interface only */ }
      return value;
    } finally { reading = false; }
  }
  const server = createServer({ maxHeaderSize: 8192 }, async (request, response) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
    const send = (status, value, contentType = 'application/json; charset=utf-8') => {
      if (response.destroyed) return;
      response.writeHead(status, { ...headers, 'Content-Type': contentType });
      response.end(contentType.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    let native = false;
    try {
      need(!closed && request.socket.remoteAddress === '127.0.0.1' && request.headers.host === host
        && !repeatedHeader(request), 'WALLET_INVALID_HOST');
      need(request.headers.origin === undefined || request.headers.origin === origin, 'WALLET_INVALID_ORIGIN');
      if (request.method === 'GET') {
        need(request.headers['transfer-encoding'] === undefined
          && (request.headers['content-length'] === undefined || request.headers['content-length'] === '0'), 'WALLET_GET_BODY_FORBIDDEN');
        if (Object.hasOwn(assets, request.url)) {
          const [file, contentType] = assets[request.url];
          let bytes = await readFile(file, 'utf8');
          if (file.pathname.endsWith('/index.html')) bytes = bytes.replaceAll('__WALLET_OWNER_TOKEN__', ownerToken).replaceAll('__WALLET_ACTION_TOKEN__', actionToken ?? '').replaceAll('__WALLET_LISTENER_ID__', listenerId);
          return send(200, bytes, contentType);
        }
        if (request.url === '/api/wallet/state') {
          // Browsers may omit Origin on same-origin GET. A browser-managed
          // same-origin fetch header plus the private owner token is required.
          need((request.headers.origin === origin || request.headers.origin === undefined
            && request.headers['sec-fetch-site'] === 'same-origin')
            && validToken(request.headers['x-wallet-owner-token'], ownerToken), 'WALLET_OWNER_ACCESS_REQUIRED');
          need(request.headers['sec-fetch-site'] === undefined || ['same-origin', 'none'].includes(request.headers['sec-fetch-site']), 'WALLET_INVALID_ORIGIN');
          return send(200, await state());
        }
      }
      const isNative = Object.hasOwn(actions, request.url), isDefi = Object.hasOwn(defiActions, request.url),
        isAccount = Object.hasOwn(accountActions, request.url), isWrappedWithdrawal=Object.hasOwn(wrappedWithdrawalActions,request.url);
      if (request.method !== 'POST' || !isNative && !isDefi && !isAccount && !isWrappedWithdrawal) return send(404, { error: 'WALLET_NOT_FOUND' });
      native = isNative;
      const token = request.headers['x-wallet-action-token'];
      const manual = actionToken !== null && validToken(token, actionToken);
      if(isWrappedWithdrawal)need(!manual,'WALLET_WRAPPED_WITHDRAWAL_EXACT_ACCESS_REQUIRED');
      need(request.headers.origin === origin && (manual || exactActions.recognizes(token)), 'WALLET_ACTION_ACCESS_REQUIRED');
      need(request.headers['sec-fetch-site'] === undefined || ['same-origin', 'none'].includes(request.headers['sec-fetch-site']), 'WALLET_INVALID_ORIGIN');
      need(isWrappedWithdrawal ? bound.wrappedWithdrawalSession : isNative ? bound.nativeClaimSession : isAccount ? bound.accountSession : bound.defiExit,
        isNative ? 'WALLET_NATIVE_SESSION_NOT_BOUND' : isAccount ? 'WALLET_ACCOUNT_SESSION_NOT_BOUND' : 'WALLET_DEFI_SERVICE_NOT_BOUND');
      need(!reading && !admitting, 'WALLET_ADMISSION_BUSY'); admitting = true;
      try {
        const input = await body(request);
        // Body I/O is not admission. Consume exactly once, synchronously, before
        // the first original-journal/activity await or any action-service call.
        let handoffReview = null;
        if (!manual) {
          let target;
          try { target = actionTarget(request.url, input); } catch { throw failure('WALLET_ACTION_ACCESS_REQUIRED'); }
          exactActions.consume(token, request.url, input, target);
          handoffReview = handoffGuards.get(token) ?? null;
          handoffGuards.delete(token);
        }
        const observed = await activity(); need(!observed.blocked, observed.blocked);
        if (handoffReview) {
          const current = await currentManualReview(observed);
          need(!handoffReview.revoked, 'WALLET_MANUAL_HANDOFF_CANCELLED');
          verifyManualReview(handoffReview.request, current);
        }
        if (isAccount) {
          const action = accountActions[request.url];
          if (action === 'prepare') validateFlatAccountPrepare(input);
          else {
            fields(input, ['requestId'], ['requestId']);
            need(typeof input.requestId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(input.requestId)?.[0] === input.requestId,
              'WALLET_ACCOUNT_REQUEST_ID');
          }
          const graphTarget = flatManualGraphActionTarget(bound.accountSession, action, input);
          const wrappedTarget = flatManualWrappedGraphActionTarget(bound.accountSession, action, input);
          if (wrappedTarget) need(handoffReview && !handoffReview.revoked, 'WALLET_WRAPPED_GRAPH_MANUAL_HANDOFF_REQUIRED');
          const noteTarget = flatManualNativeNoteActionTarget(bound.accountSession, action, input);
          if (noteTarget) {
            need(actionAccessMode === 'exact-only' && !manual, 'WALLET_NATIVE_NOTE_EXACT_ACCESS_REQUIRED');
            need(handoffReview && !handoffReview.revoked, 'WALLET_NATIVE_NOTE_MANUAL_HANDOFF_REQUIRED');
          }
          if (action === 'recover') need(graphTarget, 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
          if (graphTarget) need(actionAccessMode === 'exact-only' && !manual, 'WALLET_ACCOUNT_GRAPH_EXACT_ACCESS_REQUIRED');
          if (action === 'prepare') need(accountKinds.has(input.kind) || graphTarget, 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
          const rows = observed.account.requests.filter(row => row.requestId === input.requestId);
          need(rows.length <= 1, 'WALLET_ACCOUNT_JOURNAL_UNAVAILABLE');
          const original = rows[0];
          if (original) {
            need(accountKinds.has(original.kind) || graphTarget && original.kind === 'GRAPH', 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
            if (action === 'recover') need(graphTarget, 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
          if (graphTarget) need(original.kind === 'GRAPH', 'WALLET_ACCOUNT_REQUEST_CONFLICT');
          }
          if (action === 'prepare') {
            if (original) need(original.kind === input.kind, 'WALLET_ACCOUNT_REQUEST_CONFLICT');
          } else {
            need(original, 'WALLET_ACCOUNT_REQUEST_UNKNOWN');
            need(action === 'execute' ? original.state === 'PREPARED' : accountReconcileStates.has(original.state), 'WALLET_ACCOUNT_STATE_CONFLICT');
          }
          const admission = bound.accountSession.submit(action, input);
          return send(200, { version: 1, profile: 'FLAT_ACCOUNT_VOLATILE_ADMISSION_V1', acceptance: 'VOLATILE_UI_QUEUE_ONLY',
            durableAdmissionEstablished: false, settlementEstablished: false, admission });
        }
        if(isWrappedWithdrawal){const method=wrappedWithdrawalActions[request.url];if(Object.values(WRAPPED_RESUME_ACTIONS).some(value=>value.method===method))return send(200,await bound.wrappedWithdrawalSession[method](input));return send(202,await bound.wrappedWithdrawalSession.submit(method,input));}
        if (isNative) {
          need(actions[request.url] === 'reconcile' || bound.nativeIdentity, 'WALLET_NATIVE_IDENTITY_UNAVAILABLE');
          const admitted = await bound.nativeClaimSession.submit(actions[request.url], input);
          return send(202, admitted); // Existing session resolves only after durable admission.
        }
        const method = defiActions[request.url], service = bound.defiExit.service;
        if (method === 'prepare' || method === 'requote') {
          fields(input, ['requestId', 'minimumOutput', 'deadline'], ['requestId', 'minimumOutput', 'deadline']);
          return send(200, await service[method](input));
        }
        if (method === 'reopen') { fields(input, []); return send(200, await service.reopen()); }
        fields(input, ['requestId'], ['requestId']); return send(200, await service[method](input.requestId));
      } finally { admitting = false; }
    } catch (error) {
      const code = publicCode(error, native);
      const status = code.includes('TOO_LARGE') ? 413 : /ACCESS|ORIGIN|HOST/.test(code) ? 403
        : /BUSY|CONFLICT|REBOUND|OPERATION_IN_PROGRESS/.test(code) ? 409 : /UNAVAILABLE|NOT_BOUND/.test(code) ? 503 : 400;
      send(status, { error: code });
    }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000; server.maxRequestsPerSocket = 100;
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  host = '127.0.0.1:' + server.address().port; origin = 'http://' + host;
  function issueScopedActionCapability(input, nativeHandoff = null) {
      need(!closed, 'WALLET_ACTION_CAPABILITY_UNAVAILABLE');
      fields(input, ['action', 'body', 'ttlMs'], ['action', 'body']);
      need(typeof input.action === 'string' && Object.hasOwn(ALL_ACTIONS, input.action), 'WALLET_ACTION_CAPABILITY_INVALID');
      const route = ALL_ACTIONS[input.action].route, exactBody = exactActionCapabilityBody(input.action, input.body);
      if(Object.hasOwn(wrappedWithdrawalActions,route))need(actionAccessMode==='exact-only','WALLET_WRAPPED_WITHDRAWAL_EXACT_ACCESS_REQUIRED');
      let target;
      try { target = actionTarget(route, exactBody); } catch { throw failure('WALLET_ACTION_CAPABILITY_INVALID'); }
      // A disconnected application cannot issue authority for a future binding.
      need(target, 'WALLET_ACTION_CAPABILITY_UNAVAILABLE');
      const noteTarget = Object.hasOwn(accountActions, route)
        ? flatManualNativeNoteActionTarget(bound.accountSession, accountActions[route], exactBody) : null;
      const wrappedTarget = Object.hasOwn(accountActions, route)
        ? flatManualWrappedGraphActionTarget(bound.accountSession, accountActions[route], exactBody) : null;
      if (wrappedTarget) need(['ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1', 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V2'].includes(nativeHandoff?.graph?.profile)
        && nativeHandoff.action === input.action && sameHandoff(nativeHandoff.body, exactBody), 'WALLET_WRAPPED_GRAPH_MANUAL_HANDOFF_REQUIRED');
      if (noteTarget) need(nativeHandoff && nativeHandoff.note
        && nativeHandoff.action === input.action && sameHandoff(nativeHandoff.body, exactBody),
        'WALLET_NATIVE_NOTE_MANUAL_HANDOFF_REQUIRED');
      if (input.action === 'accountRecover') need(target !== bound.accountSession, 'WALLET_ACTION_CAPABILITY_INVALID');
      if (Object.hasOwn(accountActions, route) && target !== bound.accountSession)
        need(actionAccessMode === 'exact-only', 'WALLET_ACCOUNT_GRAPH_EXACT_ACCESS_REQUIRED');
      if (Object.hasOwn(actions, route)) need(input.action === 'reconcile' || bound.nativeIdentity, 'WALLET_NATIVE_IDENTITY_UNAVAILABLE');
      const ttlMs = Object.hasOwn(input, 'ttlMs') ? input.ttlMs : EXACT_ACTION_DEFAULT_TTL_MS;
      return Object.freeze({ origin, token: exactActions.issue(input.action, exactBody, ttlMs, target) });
  }
  const application = Object.freeze({ origin, ownerAccess: Object.freeze({ origin, token: ownerToken }),
    ...(actionToken === null ? {} : { actionAccess: Object.freeze({ origin, token: actionToken }) }),
    createManualActionHandoff() {
      need(arguments.length === 0 && !closed && !handoffHostCreated && bound.accountSession
        && actionAccessMode === 'exact-only', 'WALLET_MANUAL_HANDOFF_UNAVAILABLE');
      handoffHostCreated = true; manualHandoffActive = true;
      let stopped = false, authorizing = false, pendingToken = null, cancellation = 0;
      const usedReviews = new Set();
      const cancel = () => {
        cancellation++; if (pendingHandoffGrant) pendingHandoffGrant.guard.revoked = true; pendingHandoffGrant = null;
        if (pendingToken) { exactActions.revoke(pendingToken); handoffGuards.delete(pendingToken); pendingToken = null; }
      };
      return Object.freeze({ descriptor: Object.freeze({ origin, listenerId }),
        async authorizeReview(input) {
          need(arguments.length === 1 && !stopped && !closed && !authorizing, 'WALLET_MANUAL_HANDOFF_UNAVAILABLE');
          const request = localRequest(input);
          need(!usedReviews.has(request.reviewId), 'WALLET_MANUAL_HANDOFF_REVIEW_USED');
          authorizing = true; const started = cancellation;
          try {
            const current = await state();
            need(!stopped && !closed && cancellation === started, 'WALLET_MANUAL_HANDOFF_UNAVAILABLE');
            const expected = verifyManualReview(request, current);
            // Original local shell calls this only after explicit review. No
            // browser callback is ever allowed to invoke it automatically.
            cancel();
            const access = issueScopedActionCapability({ action: expected.action, body: expected.body }, expected);
            pendingToken = access.token; usedReviews.add(expected.reviewId);
            const guard = { request: expected, revoked: false };
            pendingHandoffGrant = { token: access.token, reviewId: expected.reviewId, guard };
            handoffGuards.set(access.token, guard);
            return Object.freeze({ version: 1, profile: expected.profile, request: expected, access });
          } finally { authorizing = false; }
        },
        cancelReview() { cancel(); },
        disconnect() { stopped = true; manualHandoffActive = false; cancel(); },
      });
    },
    revokeActionCapability(access) {
      fields(access,['origin','token'],['origin','token']);need(access.origin===origin&&typeof access.token==='string'&&/^[0-9a-f]{64}$/.test(access.token),'WALLET_ACTION_CAPABILITY_INVALID');
      exactActions.revoke(access.token);return {revoked:true};
    },
    issueActionCapability(input) {
      need(arguments.length === 1, 'WALLET_ACTION_CAPABILITY_UNAVAILABLE');
      return issueScopedActionCapability(input);
    },
    bindSessions(input) {
      need(!closed && !boundOnce && !reading && !admitting, 'WALLET_BINDING_ALREADY_FIXED');
      const next = bindings(input, economicModule); need(connected(next), 'WALLET_ORIGINAL_SESSION_REQUIRED');
      bound = next; boundOnce = true; return { bound: true };
    },
    close() {
      closePromise ??= new Promise(resolve => {
        closed = true; manualHandoffActive = false; pendingHandoffGrant = null; handoffGuards.clear(); exactActions.close(); server.close(resolve); for (const socket of sockets) socket.destroy();
      }).then(() => ({ listenerClosed: true, originalSessionsRetained: true, durableJobsCancelled: false }));
      return closePromise;
    },
  });
  return application;
}
