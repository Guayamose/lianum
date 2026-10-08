import { validateOwnerGraphReview, OWNER_GRAPH_PROFILES } from '../features/accounts/owner-graph-review-v1.mjs';
import {validatePublicTokenObservations,projectPublicTokenObservations} from '../features/portfolio/public-token-observations.mjs';
import {WRAPPED_RESUME_ACTIONS,isWrappedResumeAction} from '../features/withdrawals/wrapped-withdrawal-resume-actions.mjs';
import { WRAPPED_WITHDRAWAL_ACTIONS, isWrappedWithdrawalAction, validateWrappedWithdrawalRead, wrappedWithdrawalContext } from '../features/withdrawals/wrapped-withdrawal-review.mjs';
import { validNativeNoteReview } from '../features/claims/native-note-review.mjs';
import { EXACT_BROWSER_ACTIONS, exactBrowserReview, exactBrowserAccess } from '../features/accounts/exact-action-browser-review.mjs';
import { HANDOFF_PROFILE, handoffDescriptor, manualReviewRequest, sameHandoff, handoffData, validateManualHandoffMetadata } from '../features/accounts/manual-action-handoff.mjs';
import { validateGenerationDefiRead, projectGenerationDefiRead } from '../features/defi/generation-defi-contract.mjs';
import { GENERATION_PORTFOLIO_PROFILE, validateFlatOwnerReadPayload, ownerPortfolioAssetRows, ownerPortfolioGenerations } from '../features/portfolio/owner-portfolio-contract.mjs';
/** Browser-only presentation and fixed-route transport. No authority, keys or persistence. */
export const WALLET_PROFILE = 'ACTIVE_FLAT_WALLET_APP_V1';
export const ACTIONS = Object.freeze({
  deposit: Object.freeze({ title: 'Depositar claim', capability: 'nativeDeposit', route: '/api/wallet/native/deposit' }),
  redeem: Object.freeze({ title: 'Solicitar redención', capability: 'nativeRedeem', route: '/api/wallet/native/redeem' }),
  refund: Object.freeze({ title: 'Solicitar devolución', capability: 'nativeRefund', route: '/api/wallet/native/refund' }),
  reconcile: Object.freeze({ title: 'Conciliar original', capability: 'nativeReconcile', route: '/api/wallet/native/reconcile' }),
  resume: Object.freeze({ title: 'Reanudar original', capability: 'nativeResume', route: '/api/wallet/native/resume' }),
});
export const DEFI_PROFILE = 'OWNED_PRIVATE_VAULT_EXIT_V1';
export const DEFI_ACTIONS = Object.freeze({
  defiPrepare: Object.freeze({ title: 'Preparar redención', capability: 'defiPrepare', route: '/api/wallet/defi/prepare' }),
  defiExecute: Object.freeze({ title: 'Ejecutar original', capability: 'defiExecute', route: '/api/wallet/defi/execute' }),
  defiReconcile: Object.freeze({ title: 'Conciliar redención', capability: 'defiReconcile', route: '/api/wallet/defi/reconcile' }),
  defiReopen: Object.freeze({ title: 'Reabrir servicio', capability: 'defiReopen', route: '/api/wallet/defi/reopen' }),
  defiRequote: Object.freeze({ title: 'Revisar cotización', capability: 'defiRequote', route: '/api/wallet/defi/requote' }),
});
export const ACCOUNT_ACTIONS = Object.freeze({
  accountRecover: Object.freeze({ title: 'Recuperar GRAPH original', capability: 'accountRecover', route: '/api/wallet/account/recover', command: 'recover' }),
  accountPrepare: Object.freeze({ title: 'Vincular preparación', capability: 'accountPrepare', route: '/api/wallet/account/prepare', command: 'prepare' }),
  accountExecute: Object.freeze({ title: 'Ejecutar original', capability: 'accountExecute', route: '/api/wallet/account/execute', command: 'execute' }),
  accountReconcile: Object.freeze({ title: 'Conciliar cuenta', capability: 'accountReconcile', route: '/api/wallet/account/reconcile', command: 'reconcile' }),
});
export const ALL_ACTIONS = Object.freeze({ ...ACTIONS, ...DEFI_ACTIONS, ...ACCOUNT_ACTIONS, ...WRAPPED_WITHDRAWAL_ACTIONS, ...WRAPPED_RESUME_ACTIONS });
const defiAction = action => Object.hasOwn(DEFI_ACTIONS, action);
const accountAction = action => Object.hasOwn(ACCOUNT_ACTIONS, action);
const actionGroup = action => isWrappedWithdrawalAction(action) ? 'wrappedWithdrawal' : accountAction(action) ? 'account' : defiAction(action) ? 'defi' : 'native';
const fields = Object.freeze({ wrappedWithdrawSuccessorReview:['requestId'],wrappedWithdrawSuccessorAdmit:['requestId','resumeSHA256'], wrappedWithdrawResumeReview:['requestId'],wrappedWithdrawResumeAdmit:['requestId','resumeSHA256'],wrappedWithdrawResumeContinue:['requestId','resumeSHA256'], wrappedWithdrawReapprove:['requestId','termsSHA256'],wrappedWithdrawCancel:['requestId','termsSHA256'],wrappedWithdrawPrepare: ['requestId','role','termsSHA256'], wrappedWithdrawExecute: ['requestId','termsSHA256'], wrappedWithdrawReconcile: ['requestId','termsSHA256'], deposit: ['requestId', 'intentId'], refund: ['requestId', 'intentId'],
  redeem: ['requestId', 'amount', 'maxFee'], reconcile: ['requestId'], resume: ['requestId'],
  defiPrepare: ['requestId', 'minimumOutput', 'deadline'], defiRequote: ['requestId', 'minimumOutput', 'deadline'],
  defiExecute: ['requestId'], defiReconcile: ['requestId'], defiReopen: [],
  accountPrepare: ['requestId', 'kind', 'ownerOperationRef', 'assetId'], accountExecute: ['requestId'], accountReconcile: ['requestId'], accountRecover: ['requestId'] });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const defiPhases = ['BINDING_REDEMPTION', 'READY_TO_REDEEM', 'REDEMPTION_UNRESOLVED', 'REQUOTING_REDEMPTION', 'REDEEMED', 'REVERTED'];
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(value)?.[0] === value;
export const NATIVE_IDENTITY_PROFILE = 'ORIGINAL_NATIVE_CLAIM_SESSION_IDENTITY_V1';
export const WRAPPED_CLAIM_IDENTITY_PROFILE = 'ORIGINAL_WRAPPED_CLAIM_SESSION_IDENTITY_V1';
const nativeIdentityKeys = ['version', 'profile', 'accountId', 'claimDomain', 'nativeFamily', 'nativeGenesis', 'nativeAsset',
  'wrapperAssetIdentity', 'claimSymbol', 'nativeSymbol', 'decimals', 'atomicUnit', 'observation'];
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.exec(value)?.[0] === value && /[1-9a-f]/.test(value);
const accountDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.exec(value)?.[0] === value;
const accountKinds = ['TOP_UP', 'EXIT', 'GRAPH'];
const accountStates = ['PREPARING', 'PREPARED', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED'];
const reconcileStates = ['SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED'];
function validAccountSnapshot(value) {
  if (!record(value) || value.version !== 1 || value.profile !== 'LOCAL_FLAT_ACCOUNT_API_V1'
    || !['READY', 'UNAVAILABLE', 'CLOSED'].includes(value.phase) || typeof value.available !== 'boolean'
    || typeof value.busy !== 'boolean' || !Number.isSafeInteger(value.queued) || value.queued < 0
    || typeof value.storageAvailable !== 'boolean' || !['CURRENT', 'STALE'].includes(value.observation)
    || !(value.revision === null || Number.isSafeInteger(value.revision) && value.revision >= 0)
    || !Array.isArray(value.requests) || value.requests.length > 128
    || !Array.isArray(value.admissions) || value.admissions.length > 32) return false;
  const ids = new Set();
  for (const row of value.requests) {
    if (!record(row) || !validId(row.requestId) || ids.has(row.requestId) || ![...accountKinds, 'GRAPH'].includes(row.kind)
      || !accountStates.includes(row.state) || !(row.errorCode === null || typeof row.errorCode === 'string')) return false;
    ids.add(row.requestId);
  }
  return true;
}
function journalReady(snapshot) {
  return snapshot?.phase === 'READY' && snapshot.storageAvailable === true && snapshot.busy === false && snapshot.queued === 0;
}
function journalsIdle(state) {
  const account = state.data?.account, native = state.data?.nativeClaims, wrapped = state.data?.wrappedWithdrawals;
  return !state.accountStale && (!account || state.accountSnapshotFresh === true && journalReady(account.snapshot)
      && account.snapshot.available === true && account.snapshot.observation === 'CURRENT' && Number.isSafeInteger(account.snapshot.revision))
    && (!native ? !state.data?.errors.nativeClaims : state.nativeSnapshotFresh === true && journalReady(native.snapshot))
    && (!wrapped || !state.data?.errors.wrappedWithdrawals && journalReady(wrapped.snapshot));
}
function currentAccountAssetChoices(state, kind) {
  const portfolio = state.data?.portfolio;
  if (state.stale || state.portfolioStale || !portfolio) return [];
  const partialOriginalExit = kind === 'EXIT' && portfolio.profile === GENERATION_PORTFOLIO_PROFILE
    && portfolio.status === 'PARTIAL';
  if (!partialOriginalExit && (portfolio.status !== 'LIVE'
    || (Array.isArray(portfolio.assets) || portfolio.profile === GENERATION_PORTFOLIO_PROFILE
      ? portfolio.coherent !== true : !portfolio.observed))) return [];
  const values = ownerPortfolioAssetRows(portfolio), identities = values.map(row => row.asset?.assetId);
  if (new Set(identities).size !== identities.length) return [];
  // Only a healthy original component, never a missing/stale generation or a
  // combined inferred balance. No current-route switch or consent is created.
  const live = values.filter(row => row.status === 'LIVE' && accountDigest(row.asset?.assetId)
    && typeof row.asset.symbol === 'string' && /^[A-Z0-9]{2,12}$/.exec(row.asset.symbol)?.[0] === row.asset.symbol
    && (!partialOriginalExit || portfolio.generations.some(generation => generation.generationId === row.generationId
      && generation.errorCode === null && generation.portfolio?.status === 'LIVE'
      && generation.portfolio.coherent === true && generation.portfolio.observed !== null && row.observed
      && ['blockHash', 'blockNumber', 'timestamp'].every(key => row.observed[key] === generation.portfolio.observed[key]))));
  if (partialOriginalExit) {
    const observed = values.filter(row => row.observed !== null && row.observed !== undefined).map(row => row.observed);
    // PARTIAL can also contain inconsistent surviving heads. Do not weaken the
    // coherent-read fence for those cases merely because a third route is down.
    if (!observed.length || observed.some(head => ['blockHash', 'blockNumber', 'timestamp'].some(key => head[key] !== observed[0][key]))) return [];
  }
  return live.map(row => copy(row.asset));
}
/** New TOP_UP choices follow only the authenticated catalogue preference.
 * Legacy generation payloads remain readable but cannot guess a fresh route.
 * Original bound work uses its own exact row below, never this preference. */
export function accountAssetChoices(state, kind = 'TOP_UP') {
  const choices = currentAccountAssetChoices(state, kind), portfolio = state.data?.portfolio;
  if (!['TOP_UP', 'GRAPH'].includes(kind) || portfolio?.profile !== GENERATION_PORTFOLIO_PROFILE) return choices;
  const admission = portfolio.freshAdmissions;
  if (!admission || admission.version !== 1 || admission.fenced !== false || !Array.isArray(admission.routes)) return [];
  return kind === 'GRAPH' ? choices : choices.filter(asset => admission.routes.some(route => route.assetId === asset.assetId
    && portfolio.generations.some(generation => generation.generationId === route.generationId
      && generation.routes.some(original => original.assetId === route.assetId))));
}
const graphFields = ['version', 'profile', 'requestId', 'kind', 'ownerOperationRef', 'assetId', 'asset',
  'routeProfile', 'family', 'chainId', 'genesis', 'router', 'vault', 'solver', 'sourcePool', 'targetPool',
  'sourceAssetIdentity', 'targetAssetIdentity', 'targetCommitment', 'descriptorCommitment', 'solverUnderlyingAmount',
  'deliveredShares', 'executionFrom', 'executionUntil', 'settleBefore', 'payoutCommitment', 'deliveryLossClause',
  'envelope', 'fundingNotBefore', 'fundingValidUntil', 'identitySHA256', 'sourceAmount', 'reservedAmount',
  'changeAmount', 'changeRecipient', 'recoveryRecipient', 'originalAccountLifetime', 'observation',
  'solverOwnLiquidity', 'settlementEstablished', 'recovery'];
const nativeGraphFields = ['version', 'profile', 'requestId', 'kind', 'ownerOperationRef', 'assetId', 'asset',
  'routeProfile', 'family', 'chainId', 'genesis', 'sourcePool', 'sourceAssetIdentity', 'nativeAsset', 'solver', 'recipient',
  'nativeAmount', 'executionFrom', 'executionUntil', 'settleBefore', 'payoutCommitment', 'deliveryRiskCommitment',
  'deliveryLossClause', 'creditEligible', 'privateSpendableAtomic', 'publicNetwork', 'envelope', 'fundingNotBefore',
  'fundingValidUntil', 'identitySHA256', 'sourceAmount', 'reservedAmount', 'changeAmount', 'changeRecipient',
  'recoveryRecipient', 'originalAccountLifetime', 'observation', 'solverOwnLiquidity', 'settlementEstablished', 'recovery'];
// Presentation validation only. Authority comes from the original server-side
// native WeakMaps and its exact one-use handoff, never these parsed labels.
function validNativeValueGraphReview(value) {
  const wrapped = value?.profile === 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1';
  if (wrapped) {
    const b = value.wrappedBinding;
    if (!record(b) || Object.keys(b).sort().join(',') !== ['profile', 'accountIdentitySHA256', 'runtimeIdentitySHA256', 'systemProfile',
      'hub', 'claimAuthority', 'registryCommitment', 'claimDomain', 'processIdentitySHA256', 'processGeneration', 'head', 'economicIntentSHA256'].sort().join(',')
      || b.profile !== 'WRAPPED_WALLET_ORIGINAL_CONSENT_BINDING_V1' || b.systemProfile !== 'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1'
      || !['accountIdentitySHA256', 'runtimeIdentitySHA256', 'registryCommitment', 'claimDomain', 'processIdentitySHA256', 'economicIntentSHA256'].every(k => accountDigest(b[k]))
      || !['hub', 'claimAuthority'].every(k => typeof b[k] === 'string' && /^0x[0-9a-f]{40}$/.exec(b[k])?.[0] === b[k] && b[k] !== '0x' + '0'.repeat(40))
      || !Number.isSafeInteger(b.processGeneration) || b.processGeneration < 1 || !record(b.head)
      || Object.keys(b.head).sort().join(',') !== 'hash,number,timestamp' || !accountDigest(b.head.hash)
      || !['number', 'timestamp'].every(k => atomic(b.head[k]) !== null)) return false;
  }
  if (!record(value) || Object.keys(value).sort().join(',') !== [...nativeGraphFields, ...(wrapped ? ['wrappedBinding'] : [])].sort().join(',')
    || value.version !== 1 || (!wrapped && value.profile !== 'ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V2')
    || value.routeProfile !== (wrapped ? 'OWNED_LOCAL_WRAPPED_CLAIM_NATIVE_GRAPH_V1' : 'OWNED_LOCAL_NATIVE_VALUE_GRAPH_V2') || value.kind !== 'GRAPH' || !validId(value.requestId)
    || !record(value.asset) || Object.keys(value.asset).sort().join(',') !== 'assetId,decimals,symbol'
    || value.asset.assetId !== value.assetId || typeof value.asset.symbol !== 'string'
    || /^[A-Z0-9]{2,12}$/.exec(value.asset.symbol)?.[0] !== value.asset.symbol || !Number.isInteger(value.asset.decimals)
    || value.asset.decimals < 0 || value.asset.decimals > 18 || value.creditEligible !== false
    || value.privateSpendableAtomic !== null || value.publicNetwork !== false
    || value.observation !== 'ORIGINAL_AUTHORIZED_TERMS_ONLY' || value.solverOwnLiquidity !== true
    || value.settlementEstablished !== false || value.recovery !== 'PRIVATE_ORIGINAL_CUTOFF_ONLY'
    || typeof value.deliveryLossClause !== 'string' || value.deliveryLossClause.length === 0 || value.deliveryLossClause.length > 300) return false;
  const evm = value.family === '3';
  if (!(evm ? ['1', '8453', '42161', '56'].includes(value.chainId) : value.family === '4' && value.chainId === null)) return false;
  for (const key of ['ownerOperationRef', 'assetId', 'genesis', 'sourceAssetIdentity', 'nativeAsset', 'payoutCommitment',
    'deliveryRiskCommitment', 'envelope', 'identitySHA256', 'originalAccountLifetime']) if (!accountDigest(value[key])) return false;
  if (typeof value.sourcePool !== 'string' || /^0x[0-9a-f]{40}$/.exec(value.sourcePool)?.[0] !== value.sourcePool) return false;
  for (const key of ['changeRecipient', 'recoveryRecipient'])
    if (typeof value[key] !== 'string' || /^[0-9a-f]{40}$/.exec(value[key])?.[0] !== value[key]) return false;
  const endpoint = evm ? /^0x[0-9a-f]{40}$/ : /^41[0-9a-f]{40}$/;
  if (['solver', 'recipient'].some(key => typeof value[key] !== 'string' || endpoint.exec(value[key])?.[0] !== value[key])
    || value.solver === value.recipient) return false;
  for (const key of ['nativeAmount', 'executionFrom', 'executionUntil', 'settleBefore', 'fundingNotBefore',
    'fundingValidUntil', 'sourceAmount', 'reservedAmount', 'changeAmount'])
    if (atomic(value[key]) === null || BigInt(value[key]) >= (1n << 128n)) return false;
  return BigInt(value.nativeAmount) > 0n && (evm || BigInt(value.nativeAmount) < (1n << 63n))
    && BigInt(value.sourceAmount) === BigInt(value.reservedAmount) + BigInt(value.changeAmount)
    && BigInt(value.reservedAmount) > 0n && BigInt(value.executionFrom) < BigInt(value.executionUntil)
    && BigInt(value.executionUntil) <= BigInt(value.settleBefore) && BigInt(value.fundingNotBefore) < BigInt(value.fundingValidUntil);
}
const ownerGraphProfiles = new Set(OWNER_GRAPH_PROFILES);
function validGraphReview(value) {
  if (ownerGraphProfiles.has(value?.profile)) {
    try { validateOwnerGraphReview(value); return true; } catch { return false; }
  }
  if (['ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V2', 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1'].includes(value?.profile)) return validNativeValueGraphReview(value);
  if (!record(value) || Object.keys(value).sort().join(',') !== [...graphFields].sort().join(',')
    || value.version !== 1 || value.profile !== 'ORIGINAL_MANUAL_EVM_GRAPH_REVIEW_V1'
    || value.routeProfile !== 'REGISTERED_LOCAL_EVM_VAULT_V1' || value.family !== '3' || value.chainId !== '31337'
    || value.kind !== 'GRAPH' || !validId(value.requestId) || !record(value.asset)
    || value.asset.assetId !== value.assetId || typeof value.asset.symbol !== 'string'
    || !/^[A-Z0-9]{2,12}$/.test(value.asset.symbol) || !Number.isInteger(value.asset.decimals)
    || value.asset.decimals < 0 || value.asset.decimals > 18
    || value.observation !== 'ORIGINAL_AUTHORIZED_TERMS_ONLY' || value.solverOwnLiquidity !== true
    || value.settlementEstablished !== false || value.recovery !== 'PRIVATE_ORIGINAL_CUTOFF_ONLY'
    || typeof value.deliveryLossClause !== 'string' || value.deliveryLossClause.length > 300) return false;
  for (const key of ['ownerOperationRef', 'assetId', 'genesis', 'sourceAssetIdentity', 'targetAssetIdentity', 'targetCommitment',
    'descriptorCommitment', 'payoutCommitment', 'envelope', 'identitySHA256', 'originalAccountLifetime']) if (!accountDigest(value[key])) return false;
  for (const key of ['router', 'vault', 'solver', 'sourcePool', 'targetPool', 'changeRecipient', 'recoveryRecipient'])
    if (typeof value[key] !== 'string' || /^[0-9a-f]{40}$/.exec(value[key])?.[0] !== value[key]) return false;
  for (const key of ['solverUnderlyingAmount', 'deliveredShares', 'executionFrom', 'executionUntil', 'settleBefore',
    'fundingNotBefore', 'fundingValidUntil', 'sourceAmount', 'reservedAmount', 'changeAmount'])
    if (atomic(value[key]) === null || BigInt(value[key]) >= (1n << 128n)) return false;
  return BigInt(value.sourceAmount) === BigInt(value.reservedAmount) + BigInt(value.changeAmount)
    && BigInt(value.solverUnderlyingAmount) > 0n && BigInt(value.deliveredShares) > 0n && BigInt(value.reservedAmount) > 0n
    && BigInt(value.executionFrom) < BigInt(value.executionUntil) && BigInt(value.executionUntil) <= BigInt(value.settleBefore)
    && BigInt(value.fundingNotBefore) < BigInt(value.fundingValidUntil);
}
function originalExitGeneration(state, asset) {
  if (!asset || state.data?.portfolio?.profile !== GENERATION_PORTFOLIO_PROFILE) return null;
  const rows = ownerPortfolioAssetRows(state.data.portfolio).filter(row => row.asset.assetId === asset.assetId);
  if (rows.length !== 1 || rows[0].status !== 'LIVE' || !rows[0].observed) return null;
  const row = rows[0];
  // Review binds this exact current host-observed route/head. It does not
  // grant authority; the original owner/keeper rechecks the same domain.
  return copy({ generationId: row.generationId, pool: row.pool, domainCommitment: row.domainCommitment,
    observed: { blockNumber: row.observed.blockNumber, blockHash: row.observed.blockHash, timestamp: row.observed.timestamp } });
}
export function accountActionContext(state, action, body) {
  if (!accountAction(action)) return null;
  const originalRow = state.data.account.snapshot.requests.find(row => row.requestId === body.requestId);
  const kind = action === 'accountPrepare' ? body.kind : originalRow?.kind;
  // A prepared old TOP_UP may finish on its original route after rollover.
  // It may not select a successor, bypass a catalogue fence or create a new ID.
  const boundOriginalTopUp = originalRow?.kind === 'TOP_UP' && kind === 'TOP_UP'
    && state.data.portfolio?.profile === GENERATION_PORTFOLIO_PROFILE
    && state.data.portfolio.freshAdmissions?.version === 1 && state.data.portfolio.freshAdmissions.fenced === false;
  const choices = boundOriginalTopUp ? currentAccountAssetChoices(state, kind) : accountAssetChoices(state, kind);
  const graph = state.data.account.manualGraphs?.find(row => row.requestId === body.requestId);
  const nativeNote = state.data.account.manualNativeNotes?.find(row => row.requestId === body.requestId);
  if (nativeNote) {
    if (graph || !validNativeNoteReview(nativeNote) || state.data.capabilities.manualNativeNotes !== true
      || action === 'accountRecover' || action === 'accountPrepare' && ['kind', 'assetId', 'ownerOperationRef'].some(key => body[key] !== nativeNote[key])
      || originalRow && originalRow.kind !== nativeNote.kind
      || (action === 'accountPrepare' ? originalRow && originalRow.state !== 'PREPARING'
        : !originalRow || !(action === 'accountExecute' ? originalRow.state === 'PREPARED' : reconcileStates.includes(originalRow.state)))
      || action !== 'accountReconcile' && !choices.some(asset => asset.assetId === nativeNote.assetId))
      throw new Error('La nota nativa requiere su preparación, titular y términos originales');
    return { kind: nativeNote.kind, asset: copy(nativeNote.asset), journalState: originalRow?.state ?? null,
      preparingContinuation: action === 'accountPrepare' && Boolean(originalRow), nativeNote: copy(nativeNote) };
  }

  if (body.kind === 'GRAPH' || originalRow?.kind === 'GRAPH' || graph) {
    if (!graph || !validGraphReview(graph) || state.data.capabilities.manualEvmVaultGraph !== true
      || action === 'accountPrepare' && ['kind', 'assetId', 'ownerOperationRef'].some(key => body[key] !== graph[key])
      || originalRow && originalRow.kind !== 'GRAPH'
      || (action === 'accountPrepare' ? originalRow && originalRow.state !== 'PREPARING'
        : !originalRow || !(action === 'accountExecute' ? originalRow.state === 'PREPARED' : reconcileStates.includes(originalRow.state)))
      || !['accountReconcile', 'accountRecover'].includes(action) && !choices.some(asset => asset.assetId === graph.assetId))
      throw new Error('GRAPH requiere la preparación original fijada por el titular, su ID y términos exactos');
    return { kind: 'GRAPH', asset: copy(graph.asset), journalState: originalRow?.state ?? null,
      preparingContinuation: action === 'accountPrepare' && Boolean(originalRow), graph: copy(graph) };
  }
  if (action === 'accountRecover') throw new Error('Solo GRAPH original registrado admite recuperación');
  if (action === 'accountPrepare') {
    const asset = choices.find(value => value.assetId === body.assetId);
    const existing = state.data.account.snapshot.requests.find(row => row.requestId === body.requestId);
    const originalAssets = existing ? ownerPortfolioAssetRows(state.data.portfolio).filter(value =>
      (value.requests ?? []).some(request => request.requestId === body.requestId && request.kind === body.kind)) : [];
    if (!asset || existing && (existing.state !== 'PREPARING' || !accountKinds.includes(existing.kind) || existing.kind !== body.kind
      || state.data.portfolio?.profile === GENERATION_PORTFOLIO_PROFILE
        && (originalAssets.length !== 1 || originalAssets[0].asset.assetId !== body.assetId)))
      throw new Error('Usa un activo observado y un ID nuevo, o conserva el ID y tipo original PREPARING; no se permite cambiar su vinculación');
    return { kind: body.kind, asset: copy(asset), journalState: existing?.state ?? null, preparingContinuation: Boolean(existing),
      ...(body.kind === 'EXIT' && state.data.portfolio?.profile === GENERATION_PORTFOLIO_PROFILE ? { originalGeneration: originalExitGeneration(state, asset) } : {}) };
  }
  const row = state.data.account.snapshot.requests.find(value => value.requestId === body.requestId);
  if (!row || !accountKinds.includes(row.kind)
    || !(action === 'accountExecute' ? row.state === 'PREPARED' : reconcileStates.includes(row.state)))
    throw new Error('La solicitud original requiere TOP_UP o EXIT y un estado compatible; GRAPH y los IDs desconocidos están bloqueados');
  const portfolio = state.data.portfolio;
  const values = ownerPortfolioAssetRows(portfolio);
  const matches = values.flatMap(value => (value.requests ?? []).filter(request => request.requestId === body.requestId)
    .map(request => ({ request, asset: choices.find(asset => asset.assetId === value.asset.assetId) })));
  const asset = matches.length === 1 && matches[0].request.kind === row.kind ? matches[0].asset ?? null : null;
  if (action === 'accountExecute' && !asset) throw new Error('No se pudo identificar de forma única el activo original; actualiza su vista privada antes de ejecutar');
  return { kind: row.kind, asset: asset ? copy(asset) : null, journalState: row.state,
    ...(row.kind === 'EXIT' && state.data.portfolio?.profile === GENERATION_PORTFOLIO_PROFILE ? { originalGeneration: originalExitGeneration(state, asset) } : {}) };
}
export function accountReviewDetails(context) {
  if (context.nativeNote) {
    const n = context.nativeNote, t = n.terms;
    return [['Operación original', n.kind + ' · nota privada de origen nativo'], ['ID original', n.requestId],
      ['Activo', `${n.asset.symbol} · ${n.assetId}`], ['Importe exacto', t.amount + ' unidades atómicas'],
      ['Destinatario de salida original', t.recipient], ['Rol', t.role ?? 'source'], ['Época fija', t.epoch],
      ['Pool original', t.asset.pool], ['Dominio original', `${t.asset.scope} · ${t.asset.policy} · ${t.asset.assetIdentity}`],
      ['Cuenta y generación', `${n.accountIdentitySHA256} · ${n.generationId}`],
      ['Proceso y ámbito originales', `${t.processIdentitySHA256} · ${t.processGeneration} · ${t.keyScopeSHA256}`],
      ['Términos inmutables SHA-256', n.termsSHA256]];
  }
  if (context.graph) {
    const g = context.graph;
    if (ownerGraphProfiles.has(g.profile)) {
      validateOwnerGraphReview(g);
      const rows = [
        ['Operación original', `GRAPH · ${g.graph.legs.length} pasos`],
        ['ID original', g.requestId],
        ['Activo privado de origen', `${g.asset.symbol} · ${g.assetId} · ${g.asset.decimals} decimales`],
        ['Presupuesto privado reservado', `${g.reservedAmount} unidades atómicas del origen`],
        ['Cambio privado', `${g.changeAmount} · salida futura a ${g.changeRecipient}`],
        ['Recuperación original', `${g.reservedAmount} · salida futura a ${g.recoveryRecipient}`],
        ['Ventana de financiación', `${g.fundingNotBefore} ≤ tiempo de cadena < ${g.fundingValidUntil}`],
        ['Cutoff de liquidación original', g.settleBefore],
        ['Identidad del grafo revisado', g.graph.graphTermsSHA256],
        ['Envelope original', g.envelope],
        ['Referencia original del titular', g.ownerOperationRef],
        ['Visibilidad de esta revisión', 'Grafo completo solo para el titular; cada ejecutor conserva su ámbito original'],
      ];
      for (const leg of g.graph.legs) {
        const route = leg.route, label = `Paso ${leg.slot + 1}`;
        const predecessors = g.graph.edges.filter(edge => edge.targetSlot === leg.slot)
          .map(edge => `paso ${edge.sourceSlot + 1}`);
        const network = route.family === '1' ? 'Bitcoin local'
          : route.family === '2' ? 'Solana local'
          : route.family === '4' ? 'Tron local' : 'EVM local ' + route.chainId;
        rows.push(
          [label, predecessors.length ? `Depende de ${predecessors.join(', ')}` : 'Sin dependencias anteriores'],
          [`${label} · red y génesis`, `${network} · ${route.genesis}`],
          [`${label} · origen de respaldo`, `${route.sourcePool} · ${route.sourceAssetIdentity}`],
        );
        if (route.routeProfile === 'REGISTERED_LOCAL_EVM_UNISWAP_V3_V1') {
          rows.push(
            [`${label} · intercambio`, `Uniswap V3 exact output · fee ${route.fee}`],
            [`${label} · protocolo y router`, `${route.protocol} / ${route.router}`],
            [`${label} · token de entrada`, route.inputToken],
            [`${label} · límite del solver`, `${route.solverMaximumInputAmount} unidades atómicas de entrada`],
            [`${label} · token de salida privado`, `${route.deliveredOutputAmount} unidades atómicas · ${route.outputToken} · ${route.targetAssetIdentity}`],
            [`${label} · pool de destino`, route.targetPool],
            [`${label} · destinatario privado`, `Compromiso de salida ${route.targetCommitment}`],
            [`${label} · descriptor original`, route.descriptorCommitment],
            [`${label} · compromiso de riesgo`, route.deliveryRiskCommitment],
            [`${label} · exposición`, 'Protocolo, importes, ejecución y depósito observables en la red local'],
          );
        } else if (['REGISTERED_LOCAL_EVM_VAULT_V1', 'REGISTERED_LOCAL_EVM_METAMORPHO_V1', 'REGISTERED_LOCAL_EVM_AAVE_STATIC_V1'].includes(route.routeProfile)) {
          rows.push(
            [`${label} · depósito en vault`, route.vault],
            [`${label} · router`, route.router],
            [`${label} · liquidez del solver`, ['REGISTERED_LOCAL_EVM_METAMORPHO_V1','REGISTERED_LOCAL_EVM_AAVE_STATIC_V1'].includes(route.routeProfile)
              ? `Límite ${route.solverMaximumUnderlyingAmount} unidades atómicas del subyacente`
              : `${route.solverUnderlyingAmount} unidades atómicas del subyacente`],
            [`${label} · shares entregadas`, `${route.deliveredShares} unidades atómicas · ${route.targetAssetIdentity}`],
            [`${label} · pool de destino`, route.targetPool],
            [`${label} · destinatario privado`, `Compromiso de salida ${route.targetCommitment}`],
            [`${label} · descriptor original`, route.descriptorCommitment],
          );
          if (['REGISTERED_LOCAL_EVM_METAMORPHO_V1','REGISTERED_LOCAL_EVM_AAVE_STATIC_V1'].includes(route.routeProfile)) rows.push(
            [`${label} · protocolo`, route.routeProfile==='REGISTERED_LOCAL_EVM_AAVE_STATIC_V1' ? 'Aave V3 oficial; cuotas estáticas cuyo valor incorpora el rendimiento del Pool. Importes, ejecución y depósito observables en la red local' : 'MetaMorpho oficial; importes, ejecución y depósito observables en la red local'],
            [`${label} · compromiso de riesgo`, route.deliveryRiskCommitment],
          );
        } else {
          const endpointEncoding = route.family === '1' ? 'script Bitcoin en hexadecimal'
            : route.family === '2' ? 'clave pública Solana en hexadecimal'
            : route.family === '4' ? 'dirección Tron en hexadecimal' : 'dirección EVM';
          rows.push(
            [`${label} · activo e importe`, `${route.nativeAmount} unidades atómicas · ${route.nativeAsset}`],
            [`${label} · destinatario (${endpointEncoding})`, route.recipient],
            [`${label} · compromiso de riesgo`, route.deliveryRiskCommitment],
          );
        }
        rows.push(
          [`${label} · solver`, route.solver],
          [`${label} · entrega`, `${route.executionFrom} ≤ tiempo de cadena < ${route.executionUntil}`],
          [`${label} · cutoff`, route.settleBefore],
          [`${label} · compromiso de pago`, route.payoutCommitment],
          [`${label} · pérdida de entrega`, route.deliveryLossClause],
          [`${label} · compromiso local`, leg.localCommitment],
          [`${label} · compromiso de dependencias`, leg.dependencyCommitment],
        );
      }
      return rows.concat([
        ['Liquidez de los solvers', 'Separada del respaldo en custodia'],
        ['Saldo privado', 'Esta revisión no acredita saldo ni liquidación; las entregas nativas no crean crédito privado'],
        ['Liquidación', 'Todavía no establecida; depende del resultado completo y los términos originales'],
        ['Vida original de cuenta', g.originalAccountLifetime],
        ['Estado del diario', context.journalState ?? 'Aún no vinculado'],
      ]);
    }
    if (['ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V2', 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1'].includes(g.profile)) return [
      ['Operación original', 'GRAPH · entrega nativa local'], ['ID original', g.requestId],
      ['Activo privado de origen', `${g.asset.symbol} · ${g.assetId} · ${g.asset.decimals} decimales`],
      ['Presupuesto privado reservado', `${g.reservedAmount} unidades atómicas del origen`],
      ['Entrega nativa', `${g.nativeAmount} unidades atómicas · ${g.nativeAsset}`],
      ['Red y génesis originales', `${g.family === '4' ? 'Tron local' : 'EVM local ' + g.chainId} · ${g.genesis}`],
      ['Solver original', g.solver], ['Destinatario original', g.recipient],
      ['Liquidez propia del solver', 'Separada del respaldo en custodia'],
      ['Crédito privado por esta entrega', 'Ninguno; no crea saldo nativo privado gastable'],
      ['Cambio privado', `${g.changeAmount} · salida futura a ${g.changeRecipient}`],
      ['Recuperación original', `${g.reservedAmount} · salida futura a ${g.recoveryRecipient}`],
      ['Ventana de financiación', `${g.fundingNotBefore} ≤ tiempo de cadena < ${g.fundingValidUntil}`],
      ['Ventana de entrega', `${g.executionFrom} ≤ tiempo de cadena < ${g.executionUntil}`],
      ['Cutoff original', g.settleBefore], ['Cláusula de pérdida de entrega', g.deliveryLossClause],
      ['Compromiso de pago', g.payoutCommitment], ['Compromiso de riesgo', g.deliveryRiskCommitment],
      ['Vida original de cuenta', g.originalAccountLifetime], ['Estado del diario', context.journalState ?? 'Aún no vinculado']];
    return [['Operación original', 'GRAPH · vault EVM fijo'], ['ID original', g.requestId],
      ['Activo de origen', `${g.asset.symbol} · ${g.assetId} · ${g.asset.decimals} decimales`],
      ['Presupuesto privado reservado', `${g.reservedAmount} unidades atómicas del origen`],
      ['Liquidez propia del solver', `${g.solverUnderlyingAmount} unidades atómicas del subyacente; separada del presupuesto`],
      ['Shares privadas de destino', `${g.deliveredShares} unidades atómicas · ${g.targetAssetIdentity}`],
      ['Nota privada de destino autorizada', g.targetCommitment], ['Pool de destino', g.targetPool],
      ['Router y vault originales', `${g.router} / ${g.vault}`], ['Solver original', g.solver],
      ['Cambio privado', `${g.changeAmount} · salida futura a ${g.changeRecipient}`],
      ['Recuperación original', `${g.reservedAmount} · salida futura a ${g.recoveryRecipient}`],
      ['Ventana de financiación', `${g.fundingNotBefore} ≤ tiempo de cadena < ${g.fundingValidUntil}`],
      ['Ventana de entrega', `${g.executionFrom} ≤ tiempo de cadena < ${g.executionUntil}`],
      ['Cutoff original', g.settleBefore], ['Cláusula de pérdida de entrega', g.deliveryLossClause],
      ['Identidad de ruta', g.descriptorCommitment], ['Vida original de cuenta', g.originalAccountLifetime],
      ['Estado del diario', context.journalState ?? 'Aún no vinculado']];
  }
  return [['Operación original', context.kind], ['Estado del diario', context.journalState ?? 'Preparación aún no vinculada'],
    ['Activo original', context.asset?.symbol ?? (context.journalState ? 'No disponible; conciliación solo por ID original' : 'Selecciona un activo original observado')],
    ['Identidad completa del activo', context.asset?.assetId ?? 'No disponible; no se infiere del ticker o del orden'],
    ['Decimales del activo', context.asset ? String(context.asset.decimals) : 'No disponibles'],
    ...(context.originalGeneration ? [
      ['Generación original', context.originalGeneration.generationId], ['Pool original', context.originalGeneration.pool],
      ['Dominio original', context.originalGeneration.domainCommitment],
      ['Bloque observado original', context.originalGeneration.observed.blockNumber + ' · ' + context.originalGeneration.observed.blockHash],
    ] : []),
    ['Importe y destino originales', 'No expuestos por esta referencia opaca; los conserva y valida el titular original'],
    ...(context.preparingContinuation ? [['Continuación PREPARING', 'Mismo ID y tipo original. El navegador no puede comparar ref/asset con los campos ocultos; el keeper debe rechazar cualquier diferencia, sin revincular.']] : [])];
}
/** Configuration from the authenticated session, never a portfolio asset lookup or a custody observation. */
export function originalNativeIdentity(nativeClaims) {
  const value = nativeClaims?.identity;
  if (!record(value) || Object.keys(value).sort().join(',') !== [...nativeIdentityKeys].sort().join(',')
    || value.version !== 1 || ![NATIVE_IDENTITY_PROFILE, WRAPPED_CLAIM_IDENTITY_PROFILE].includes(value.profile) || !validId(value.accountId)
    || value.observation !== 'ORIGINAL_BOUND_CONFIGURATION_ONLY'
    || !['claimDomain', 'nativeGenesis', 'nativeAsset', 'wrapperAssetIdentity'].every(key => digest(value[key]))
    || value.nativeAsset === value.wrapperAssetIdentity) return null;
  const family = value.nativeFamily === '1' ? ['cBTC', 'BTC', 8, 'satoshi']
    : value.nativeFamily === '2' ? ['cSOL', 'SOL', 9, 'lamport'] : null;
  if (!family || ['claimSymbol', 'nativeSymbol', 'decimals', 'atomicUnit'].some((key, index) => value[key] !== family[index])) return null;
  for (const key of ['deposits', 'tickets']) if (Array.isArray(nativeClaims.owner?.[key])
    && nativeClaims.owner[key].some(row => !record(row) || row.claimDomain !== value.claimDomain)) return null;
  return Object.fromEntries(nativeIdentityKeys.map(key => [key, value[key]]));
}
const sameNativeIdentity = (a, b) => a !== null && b !== null && nativeIdentityKeys.every(key => a[key] === b[key]);
export function nativeIdentityDetails(identity) {
  if (!identity) return [['Identidad de la sesión', 'No disponible; no se infiere del portafolio']];
  return [['Activo vinculado', `${identity.claimSymbol} / ${identity.nativeSymbol}`],
    ['Unidad atómica', `${identity.atomicUnit} · ${identity.decimals} decimales`], ['Cuenta original', identity.accountId],
    ['Dominio completo', identity.claimDomain], ['Génesis nativo', identity.nativeGenesis],
    ['Identidad nativa', identity.nativeAsset], ['Identidad wrapper (no assetId)', identity.wrapperAssetIdentity],
    ['Observación', 'Solo configuración original; no acredita custodia actual ni saldo gastable']];
}
export function nativeAmountDetails(action, body, nativeClaims) {
  const identity = originalNativeIdentity(nativeClaims);
  if (!identity) return [];
  const value = (amount, symbol) => atomic(amount) === null ? 'No disponible; no equivale a cero'
    : `${amount} ${identity.atomicUnit} · ${displayUnits(amount, identity.decimals)} ${symbol} (exacto)`;
  if (action === 'redeem') return [['Importe del claim', value(body.amount, identity.claimSymbol)],
    ['Comisión máxima nativa', value(body.maxFee, identity.nativeSymbol)]];
  if (action === 'deposit' || action === 'refund') {
    const intent = Array.isArray(nativeClaims.owner?.deposits) ? nativeClaims.owner.deposits.find(row => row.intentId === body.intentId) : null;
    return [['Importe del intent original', value(intent?.amount, identity.nativeSymbol)]];
  }
  return [];
}
export const atomic = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.exec(value)?.[0] === value
  && BigInt(value) < (1n << 256n) ? value : null;
export function displayUnits(value, decimals) {
  if (atomic(value) === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const padded = value.padStart(decimals + 1, '0');
  if (decimals === 0) return padded;
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return padded.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}
const transferNetworks = Object.freeze({ ethereum: ['1', 'ETH'], base: ['8453', 'ETH'], arbitrum: ['42161', 'ETH'], bnb: ['56', 'BNB'], tron: [null, 'TRX'] });
const transferStatusKeys = ['schema', 'nativeId', 'chain', 'family', 'chainId', 'genesisHash', 'networkId', 'asset', 'from', 'to',
  'value', 'nonce', 'transactionType', 'metadataOnly', 'currentFinalityVerified', 'creditEligible', 'privateSpendableAtomic',
  'graphAdmissionEligible', 'deliveryVerified', 'recipientRetainedValueVerified', 'source', 'freshness', 'status', 'reason', 'observedAtMs', 'validUntilMs'];
const exactKeys = (value, keys) => record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const transferCode = value => value === null || typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,120}$/.exec(value)?.[0] === value;
const evmAddress = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/.exec(value)?.[0] === value;
const tronAddress = value => typeof value === 'string' && /^41[0-9a-f]{40}$/.exec(value)?.[0] === value;
const tronStatusKeys = [...transferStatusKeys, 'finalitySource', 'independentConsensusVerified',
  'accountPermissionVerified', 'taposVerified', 'expirationVerified'];
function validTransferSection(value) {
  if (!exactKeys(value, ['profile', 'observation', 'rows']) || !['FIXED_ORIGINAL_EVM_TRANSFERS_V1', 'FIXED_ORIGINAL_NATIVE_TRANSFERS_V2'].includes(value.profile)
    || value.observation !== 'TRUSTED_RPC_RETAINED_TRANSFER_METADATA_ONLY' || !Array.isArray(value.rows) || value.rows.length > 8) return false;
  const identities = new Set();
  for (const row of value.rows) {
    if (!exactKeys(row, ['ownerAddress', 'direction', 'refreshStatus', 'errorCode', 'status'])
      || !['REFRESHED', 'BLOCKED', 'FAILED'].includes(row.refreshStatus) || !transferCode(row.errorCode)) return false;
    const item = row.status, spec = Object.hasOwn(transferNetworks, item?.chain) ? transferNetworks[item.chain] : null;
    const tron = item?.chain === 'tron', address = tron ? tronAddress : evmAddress;
    if (!exactKeys(item, tron ? tronStatusKeys : transferStatusKeys) || !spec
      || item.schema !== `flat-${tron ? 'tron' : 'evm'}-original-transfer-status/1`
      || !digest(item.nativeId) || item.family !== (tron ? 'tron' : 'evm') || item.chainId !== spec[0]
      || (tron ? !digest(item.genesisHash) : typeof item.genesisHash !== 'string' || !item.genesisHash.startsWith('0x') || !digest(item.genesisHash.slice(2)))
      || item.networkId !== `${tron ? 'tron' : `eip155:${item.chainId}`}/genesis:${item.genesisHash}`
      || !address(row.ownerAddress) || !address(item.from) || !address(item.to) || atomic(item.value) === null
      || (tron ? item.nonce !== null || item.transactionType !== 'TransferContract'
        || BigInt(item.value) <= 0n || BigInt(item.value) >= (1n << 63n) || item.from === item.to
        || value.profile !== 'FIXED_ORIGINAL_NATIVE_TRANSFERS_V2' || item.finalitySource !== 'rpc-solidified'
        || item.independentConsensusVerified !== false || item.accountPermissionVerified !== false
        || item.taposVerified !== false || item.expirationVerified !== false
        : atomic(item.nonce) === null || !['0', '1', '2'].includes(item.transactionType))
      || !exactKeys(item.asset, ['id', 'kind', 'symbol', 'decimals', 'commitment'])
      || item.asset.id !== `${item.networkId}/native` || item.asset.kind !== 'native' || item.asset.symbol !== spec[1]
      || item.asset.decimals !== (tron ? 6 : 18) || !digest(item.asset.commitment)
      || item.metadataOnly !== true || item.currentFinalityVerified !== false || item.creditEligible !== false
      || item.privateSpendableAtomic !== null || item.graphAdmissionEligible !== false || item.deliveryVerified !== false
      || item.recipientRetainedValueVerified !== false || item.source !== 'retained-observation-metadata' || item.freshness !== 'not-revalidated'
      || !['unobserved', 'observed', 'pending', 'reverted', 'unknown', 'reorged', 'stale'].includes(item.status) || !transferCode(item.reason)
      || [item.observedAtMs, item.validUntilMs].some(value => value !== null && (atomic(value) === null || BigInt(value) >= (1n << 64n)))) return false;
    const direction = item.from === row.ownerAddress ? item.to === row.ownerAddress ? 'self' : 'outgoing'
      : item.to === row.ownerAddress ? 'incoming' : null;
    if (!direction || row.direction !== direction) return false;
    if (row.refreshStatus !== 'REFRESHED' && (item.status !== (row.refreshStatus === 'BLOCKED' ? 'stale' : 'unknown')
      || row.errorCode === null || item.reason !== row.errorCode || item.validUntilMs !== null)) return false;
    const identity = `${item.networkId}/${item.nativeId}`;
    if (identities.has(identity)) return false;
    identities.add(identity);
  }
  return true;
}
export function validateWalletState(value) {
  if (!record(value) || value.version !== 1 || value.profile !== WALLET_PROFILE
    || !['CONNECTED', 'DISCONNECTED', 'UNAVAILABLE'].includes(value.connection)
    || !(value.portfolio === null || record(value.portfolio))
    || !(value.nativeClaims === null || record(value.nativeClaims)
      && (value.nativeClaims.snapshot === null || record(value.nativeClaims.snapshot))
      && (value.nativeClaims.owner === null || record(value.nativeClaims.owner)))
    || !record(value.capabilities) || value.capabilities.graphExecution !== false
    || Object.values(ACTIONS).some(action => typeof value.capabilities[action.capability] !== 'boolean')
    || !record(value.errors) || ['portfolio', 'nativeClaims'].some(key => value.errors[key] !== null && typeof value.errors[key] !== 'string'))
    throw new Error('WALLET_STATE_CONTRACT');
  for (const action of [...Object.values(DEFI_ACTIONS), ...Object.values(ACCOUNT_ACTIONS)]) if (value.capabilities[action.capability] !== undefined
    && typeof value.capabilities[action.capability] !== 'boolean') throw new Error('WALLET_DEFI_CONTRACT');
  for (const key of ['networks', 'defi', 'account', 'transfers']) if (value.errors[key] !== undefined && value.errors[key] !== null && typeof value.errors[key] !== 'string')
    throw new Error('WALLET_EXTENSION_CONTRACT');
  if (value.transfers !== undefined && value.transfers !== null && !validTransferSection(value.transfers)) throw new Error('WALLET_TRANSFERS_CONTRACT');
  if (value.account !== undefined && value.account !== null && (!record(value.account)
    || !(value.account.snapshot === null || validAccountSnapshot(value.account.snapshot)))) throw new Error('WALLET_ACCOUNT_CONTRACT');
  if (value.networks !== undefined && value.networks !== null && (!record(value.networks) || value.networks.privateSpendable !== false
    || !Array.isArray(value.networks.chains) || !Array.isArray(value.networks.observations)
    || !['TRUSTED_RPC_NATIVE_HOLDINGS_ONLY','TRUSTED_RPC_PUBLIC_HOLDINGS_ONLY'].includes(value.networks.observation))) throw new Error('WALLET_NETWORKS_CONTRACT');
  if (value.defi !== undefined && value.defi !== null && (!record(value.defi) || !(value.defi.snapshot === null
    || record(value.defi.snapshot) && value.defi.snapshot.version === 1 && value.defi.snapshot.profile === DEFI_PROFILE
      && Array.isArray(value.defi.snapshot.operations)))) throw new Error('WALLET_DEFI_CONTRACT');
  if (value.account?.manualGraphs !== undefined) {
    const graphs = value.account.manualGraphs;
    if (!Array.isArray(graphs) || graphs.length > 8 || !graphs.every(validGraphReview)
      || new Set(graphs.map(g => g.requestId)).size !== graphs.length
      || new Set(graphs.map(g => g.ownerOperationRef)).size !== graphs.length
      || value.capabilities.manualEvmVaultGraph && graphs.length === 0) throw new Error('WALLET_ACCOUNT_GRAPH_CONTRACT');
  } else if (value.capabilities.manualEvmVaultGraph) throw new Error('WALLET_ACCOUNT_GRAPH_CONTRACT');
  if (value.account?.manualNativeNotes !== undefined) {
    const notes = value.account.manualNativeNotes;
    if (!Array.isArray(notes) || notes.length > 4 || !notes.every(validNativeNoteReview)
      || new Set(notes.map(n => n.requestId)).size !== notes.length
      || new Set(notes.map(n => n.ownerOperationRef)).size !== notes.length
      || notes.some(n => value.account.manualGraphs?.some(g => g.requestId === n.requestId || g.ownerOperationRef === n.ownerOperationRef))
      || value.capabilities.manualNativeNotes && notes.length === 0) throw new Error('WALLET_NATIVE_NOTE_CONTRACT');
  } else if (value.capabilities.manualNativeNotes) throw new Error('WALLET_NATIVE_NOTE_CONTRACT');
  if (value.manualActionHandoff !== undefined) validateManualHandoffMetadata(value.manualActionHandoff);
  const p = value.portfolio;
  if (p?.profile === GENERATION_PORTFOLIO_PROFILE) validateFlatOwnerReadPayload(p);
  else if (p && (!['LIVE', 'STALE', 'PARTIAL', 'UNAVAILABLE'].includes(p.status)
    || !(Array.isArray(p.assets) ? ['OWNED_FLAT_PRIVATE_PORTFOLIO_V1', 'OWNED_WRAPPED_WALLET_PORTFOLIO_V1'].includes(p.profile) && typeof p.coherent === 'boolean' : record(p.asset))))
    throw new Error('WALLET_PORTFOLIO_CONTRACT');
  const assets = p?.profile === GENERATION_PORTFOLIO_PROFILE ? [] : ownerPortfolioAssetRows(p);
  if (assets.some(item => !record(item) || !record(item.asset)
    || !['LIVE', 'STALE', 'PARTIAL', 'UNAVAILABLE'].includes(item.status)
    || !Number.isInteger(item.asset.decimals) || item.asset.decimals < 0 || item.asset.decimals > 18
    || !(item.balances === null || record(item.balances)
      && ['available', 'reserved', 'recovery', 'locked'].every(key => atomic(item.balances[key]) !== null))
    || !Array.isArray(item.requests))) throw new Error('WALLET_ASSET_CONTRACT');
  validatePublicTokenObservations(value.networks);
  for (const row of value.networks?.observations ?? []) {
    if (row.chain !== 'bitcoin') continue;
    const descriptor=value.networks.chains.find(chain=>chain.chain==='bitcoin')?.network;
    if (row.schema!=='flat-portfolio-observation/1'||row.creditEligible!==false||row.privateSpendableAtomic!==null
      ||row.balanceScope!=='MATURE_WATCH_WALLET_UTXOS'||row.coverage!==(descriptor?'BOOTSTRAP_DECLARED':'UNAVAILABLE')
      ||!(row.minimumConfirmations===null&&!descriptor||Number.isInteger(row.minimumConfirmations)
        &&row.minimumConfirmations>=1&&row.minimumConfirmations<=100
        &&descriptor?.finality.minimumConfirmations===row.minimumConfirmations)
      ||(row.status==='fresh'?atomic(row.pendingBalanceAtomic)===null:row.pendingBalanceAtomic!==null))
      throw new Error('WALLET_BITCOIN_OBSERVATION_CONTRACT');
  }
  validateGenerationDefiRead(value.defi, p);
  validateWrappedWithdrawalRead(value.wrappedWithdrawals);
  return copy(value);
}
const status = (value, stale) => stale ? 'STALE' : ['LIVE', 'STALE', 'PARTIAL', 'UNAVAILABLE'].includes(value) ? value : 'UNAVAILABLE';
const text = (value, fallback = 'No disponible') => typeof value === 'string' && value.length ? value : fallback;
const rows = value => Array.isArray(value) ? value.filter(record) : [];
export function projectWalletState(value, { stale = false, reading = false, sending = false, portfolioStale = false, nativeStale = false,
  nativeIdentityMismatch = false, accountStale = false, accountSnapshotFresh, nativeSnapshotFresh,
  networksStale = false, defiStale = false, transfersStale = false } = {}) {
  const portfolio = value?.portfolio ?? null;
  const sourceAssets = ownerPortfolioAssetRows(portfolio);
  const generationRows = ownerPortfolioGenerations(portfolio);
  const componentPortfolios = generationRows.length ? generationRows.flatMap(row => row.portfolio ? [row.portfolio] : []) : [portfolio].filter(Boolean);
  const assets = sourceAssets.map(item => {
    const meta = item.asset ?? {}, itemStatus = status(item.status, stale || portfolioStale);
    const balances = Object.fromEntries(['available', 'reserved', 'recovery', 'locked'].map(key => [key,
      item.status === 'UNAVAILABLE' ? null : atomic(item.balances?.[key])]));
    return { generationId: item.generationId ?? null, pool: item.pool ?? null, domainCommitment: item.domainCommitment ?? null, id: text(meta.assetId, ''), symbol: text(meta.symbol, 'Activo'), decimals: meta.decimals,
      status: itemStatus, observed: item.observed ?? null, balances,
      amounts: Object.fromEntries(Object.entries(balances).map(([key, amount]) => [key, displayUnits(amount, meta.decimals)])),
      backing: item.backing ?? null };
  });
  const lookup = id => assets.find(asset => asset.id === id);
  const nativeClaims = componentPortfolios.flatMap(part => rows(part.nativeClaims)).filter(item => item.kind === 'CUSTODIAL_NATIVE_CLAIM').map(item => ({
    assetId: text(item.assetId, ''), nativeSymbol: text(item.nativeSymbol, 'Nativo'),
    symbol: lookup(item.assetId)?.symbol ?? 'Claim', amount: atomic(item.availablePrivateClaims),
    custody: stale || portfolioStale ? 'STALE' : text(item.custodyObservation),
    nativeSelfCustody: false, underlyingSpendable: false,
    diagnostic: text(item.custodyDiagnostic?.code, ''),
  }));
  const positions = componentPortfolios.flatMap(part => rows(part.positions)).filter(item => item.kind === 'ERC4626_SHARE').map(item => {
    const safe = item.underlyingSpendable === false;
    const current = safe && item.status === 'LIVE' && !stale && !portfolioStale && portfolio.status === 'LIVE' && portfolio.coherent === true;
    return { kind: item.kind, status: safe ? status(item.status, stale || portfolioStale || !current && item.status === 'LIVE') : 'UNAVAILABLE',
      shareSymbol: lookup(item.shareAssetId)?.symbol ?? 'Shares', underlyingSymbol: lookup(item.underlyingAssetId)?.symbol ?? 'Subyacente',
      shares: current ? atomic(item.availableShares) : null,
      estimate: current ? atomic(item.estimatedRedeemableUnderlying) : null,
      underlyingSpendable: false };
  });
  const generationDefi = projectGenerationDefiRead(value?.defi, portfolio, {
    stale: stale || reading || sending || value?.connection !== 'CONNECTED',
    portfolioStale: portfolioStale || Boolean(value?.errors.portfolio), defiStale: defiStale || Boolean(value?.errors.defi) });
  positions.push(...generationDefi.positions);
  const requests = [];
  for (const asset of sourceAssets) for (const row of rows(asset.requests)) requests.push({
    requestId: text(row.requestId, ''), source: text(asset.asset?.symbol, 'Portafolio'), native: false,
    action: text(row.kind), state: stale || portfolioStale || asset.status === 'UNAVAILABLE' ? 'STALE' : text(row.state),
    disposition: stale || portfolioStale || asset.status === 'UNAVAILABLE' ? '' : text(row.disposition, ''), errorCode: '' });
  const nativeRows = new Map();
  for (const row of [...rows(value?.nativeClaims?.snapshot?.requests), ...rows(value?.nativeClaims?.owner?.requests)])
    if (validId(row.requestId)) nativeRows.set(row.requestId, { requestId: row.requestId, source: 'Claim nativo', native: true,
      action: text(row.action), state: stale || nativeStale ? 'STALE' : text(row.state),
      disposition: stale || nativeStale ? '' : text(row.result?.status, ''), errorCode: text(row.errorCode, '') });
  requests.push(...nativeRows.values());
  const transferHistory = stale || reading || sending || transfersStale || Boolean(value?.errors.transfers || value?.errors.account || value?.errors.nativeClaims) || accountStale || nativeStale
    || value?.connection !== 'CONNECTED'
    || Boolean(value?.account && (accountSnapshotFresh === false || !validAccountSnapshot(value.account.snapshot)
      || !journalReady(value.account.snapshot) || value.account.snapshot.observation !== 'CURRENT' || !value.account.snapshot.available))
    || Boolean(value?.nativeClaims && (nativeSnapshotFresh === false || !journalReady(value.nativeClaims.snapshot)));
  const transfers = validTransferSection(value?.transfers) ? value.transfers.rows.map(row => {
    const item = row.status;
    return { ownerAddress: row.ownerAddress, direction: row.direction, refreshStatus: row.refreshStatus, errorCode: row.errorCode,
      historical: Boolean(transferHistory || row.refreshStatus !== 'REFRESHED'), status: item.status, reason: item.reason,
      nativeId: item.nativeId, family: item.family, chain: item.chain, chainId: item.chainId, genesisHash: item.genesisHash, networkId: item.networkId,
      assetId: item.asset.id, assetCommitment: item.asset.commitment, symbol: item.asset.symbol, decimals: item.asset.decimals,
      from: item.from, to: item.to, value: item.value, display: displayUnits(item.value, item.asset.decimals), nonce: item.nonce,
      transactionType: item.transactionType, observedAtMs: item.observedAtMs, validUntilMs: item.validUntilMs,
      source: 'retained-observation-metadata', freshness: 'not-revalidated', metadataOnly: true, currentFinalityVerified: false,
      creditEligible: false, privateSpendableAtomic: null, graphAdmissionEligible: false, deliveryVerified: false, recipientRetainedValueVerified: false };
  }) : [];
  const assetsCoherent=Boolean(!stale&&!portfolioStale&&portfolio?.status==='LIVE'
    &&(Array.isArray(portfolio.assets)||portfolio.profile===GENERATION_PORTFOLIO_PROFILE?portfolio.coherent===true:portfolio.observed!=null));
  const positionsExpected=positions.length>0||generationDefi.generationMode;
  const positionOwnershipCoherent=!positionsExpected||positions.length>0&&positions.every(position=>(position.ownershipStatus??position.status)==='LIVE');
  const positionValuationCoherent=!positionsExpected||positions.length>0&&positions.every(position=>(position.valuationStatus??position.status)==='LIVE');
  const journalsCoherent=!stale&&!reading&&!sending&&!accountStale&&!nativeStale&&!nativeIdentityMismatch
    &&!value?.errors.account&&!value?.errors.nativeClaims&&!value?.errors.wrappedWithdrawals
    &&(!value?.account||accountSnapshotFresh!==false&&journalReady(value.account.snapshot)&&value.account.snapshot.available===true&&value.account.snapshot.observation==='CURRENT')
    &&(!value?.nativeClaims||nativeSnapshotFresh!==false&&journalReady(value.nativeClaims.snapshot))
    &&(!value?.wrappedWithdrawals||journalReady(value.wrappedWithdrawals.snapshot))
    &&(!generationDefi.generationMode||!generationDefi.journalsUnknown);
  const ownerStateCoherence={assets:assetsCoherent,positionOwnership:positionOwnershipCoherent,
    positionValuation:positionValuationCoherent,journals:journalsCoherent};
  return { portfolioStatus: status(portfolio?.status, stale || portfolioStale),ownerStateCoherence,

    coherent: Object.values(ownerStateCoherence).every(Boolean),
    generations: generationRows.map((row, index) => ({ generationId: row.generationId, ordinal: index + 1, status: status(row.portfolio?.status, stale || portfolioStale), errorCode: row.errorCode, routes: copy(row.routes) })),
    assets, nativeClaims, positions, requests, transfers,
    nativeIdentity: nativeIdentityMismatch ? null : originalNativeIdentity(value?.nativeClaims),
    deposits: rows(value?.nativeClaims?.owner?.deposits), tickets: rows(value?.nativeClaims?.owner?.tickets),
    nativeStatus: stale || nativeStale ? 'STALE' : text(value?.nativeClaims?.snapshot?.phase, 'UNAVAILABLE'),
    nativeObservation: text(value?.nativeClaims?.snapshot?.observation, 'No disponible'),
    accountStatus: stale || accountStale ? 'STALE' : value?.account?.snapshot?.busy || value?.account?.snapshot?.queued > 0
      ? 'RUNNING' : text(value?.account?.snapshot?.phase, 'UNAVAILABLE'),
    accountRequests: rows(value?.account?.snapshot?.requests).map(row => ({ requestId: text(row.requestId), kind: text(row.kind),
      state: stale || accountStale ? 'STALE' : text(row.state), errorCode: text(row.errorCode, ''), supported: row.kind !== 'GRAPH' || Boolean(value?.capabilities.manualEvmVaultGraph && value?.account?.manualGraphs?.some(graph => graph.requestId === row.requestId)) })),
    accountAdmissions: rows(value?.account?.snapshot?.admissions).map(row => ({ requestId: text(row.requestId),
      action: text(row.action), state: stale || accountStale ? 'STALE' : text(row.state) })),
    networks: rows(value?.networks?.chains).map(chain => {
      const observations = rows(value?.networks?.observations).filter(row => row.chain === chain.chain);
      return { chain: text(chain.chain), configured: chain.configured === true,...(value?.networks?.tokens?{tokenObservations:projectPublicTokenObservations(value.networks,chain.chain,{stale:stale||networksStale}).map(row=>({...row,display:displayUnits(row.amount,row.decimals)}))}:{}),
        observations: observations.map(row => {
          const safe = row.schema === 'flat-portfolio-observation/1' && row.creditEligible === false && row.privateSpendableAtomic === null;
          const expired = atomic(row.validUntilMs)!==null && BigInt(row.validUntilMs)<=BigInt(Date.now());
          const fresh = safe && row.status === 'fresh' && !stale && !networksStale && !expired;
          const amount = fresh ? atomic(row.balanceAtomic) : null;
          return { status: !safe ? 'unknown' : stale || networksStale || expired ? 'stale' : text(row.status, 'unknown'),
            symbol: text(row.network?.nativeAsset?.symbol, 'Nativo'), amount,
            display: displayUnits(amount, row.network?.nativeAsset?.decimals),
            block: text(row.block?.height, ''), reason: expired?'OBSERVATION_EXPIRED':text(row.reason, ''), privateSpendable: false,
            ...(row.chain==='bitcoin'?{pendingAmount:fresh?atomic(row.pendingBalanceAtomic):null,
              pendingDisplay:displayUnits(fresh?atomic(row.pendingBalanceAtomic):null,8),minimumConfirmations:row.minimumConfirmations,
              coverage:'Cobertura declarada del watch wallet; coinbase inmaduro excluido'}:{}) };
        }) };
    }),
    defiGenerations: generationDefi.generations, defiGenerationMode: generationDefi.generationMode,
    defiJournalsUnknown: generationDefi.journalsUnknown,
    defiOperations: rows(value?.defi?.snapshot?.operations).map(row => ({ requestId: text(row.requestId, ''),
      ...(generationDefi.generationMode ? { generationId: generationDefi.generations.find(item => item.shareAssetId === row.shareAssetId)?.generationId ?? null,
        shareAssetId: row.shareAssetId } : {}),
      phase: stale || defiStale ? 'STALE' : text(row.phase), shares: atomic(row.shares),
      minimumUnderlying: atomic(row.minimumUnderlying), deadline: atomic(row.deadline),
      redeemedUnderlying: row.underlyingPrivateSpendable === false && row.underlyingLocation === 'EXTERNAL_OWNER_ADDRESS'
        ? atomic(row.redeemedUnderlying) : null, observation: text(row.observation),
      underlyingLocation: 'EXTERNAL_OWNER_ADDRESS', underlyingPrivateSpendable: false, redemptionPublic: true,
      sendBlocked: row.sendBlocked !== false, keeperRestart: false })) }; 
}
export function buildActionBody(action, input) {
  if (!Object.hasOwn(ALL_ACTIONS, action) || !record(input)
    || Object.keys(input).sort().join(',') !== [...fields[action]].sort().join(',')) throw new Error('Revisa los campos de la acción');
  if (action !== 'defiReopen' && !validId(input.requestId)) throw new Error('La solicitud requiere 8–100 letras ASCII, números, guiones o guiones bajos');
  if ('intentId' in input && !(typeof input.intentId === 'string' && /^[a-f0-9]{64}$/.exec(input.intentId)?.[0] === input.intentId && /[1-9a-f]/.test(input.intentId)))
    throw new Error('El intent original debe contener 64 caracteres hexadecimales minúsculos, sin 0x y distinto de cero');
  if (action === 'accountPrepare' && (!accountKinds.includes(input.kind) || !accountDigest(input.ownerOperationRef) || !accountDigest(input.assetId)))
    throw new Error('Solo TOP_UP, EXIT o GRAPH EVM registrado, con referencia original del titular e identidad del activo en 64 caracteres hexadecimales minúsculos');
  if (isWrappedResumeAction(action)&&!['wrappedWithdrawResumeReview','wrappedWithdrawSuccessorReview'].includes(action)&&!accountDigest(input.resumeSHA256))throw new Error('WALLET_WRAPPED_RESUME_EXACT_BODY');
  if (isWrappedWithdrawalAction(action) && (!accountDigest(input.termsSHA256) || action === 'wrappedWithdrawPrepare' && !['recipient','change'].includes(input.role))) throw new Error('WALLET_WRAPPED_WITHDRAWAL_EXACT_BODY');
  if (action === 'redeem') for (const key of ['amount', 'maxFee']) {
    const amount = atomic(input[key]);
    if (amount === null || BigInt(amount) <= 0n || BigInt(amount) >= (1n << 64n))
      throw new Error('Importe y comisión máxima requieren enteros positivos en unidades atómicas, menores que 2⁶⁴');
  }
  if (action === 'defiPrepare' || action === 'defiRequote') for (const [key, bits] of [['minimumOutput', 128], ['deadline', 64]]) {
    const amount = atomic(input[key]);
    if (amount === null || BigInt(amount) <= 0n || BigInt(amount) >= (1n << BigInt(bits)))
      throw new Error(key === 'deadline' ? 'Usa un timestamp positivo de la cadena original, menor que 2⁶⁴; no la hora del navegador'
        : 'El mínimo debe ser un entero positivo en unidades atómicas, menor que 2¹²⁸');
  }
  return Object.fromEntries(fields[action].map(key => [key, input[key]]));
}
export function actionReview(action, body, nativeClaims = null, accountContext = null, wrappedContext = null) {
  if (isWrappedWithdrawalAction(action)) return { title: WRAPPED_WITHDRAWAL_ACTIONS[action].title, body: copy(body), wrappedWithdrawalContext: copy(wrappedContext), notes: [
    'Solo la nota, titular original, pool, activo, importe y destino de esta revisión. Preparar no firma ni envía.',
    'Ejecutar autoriza la firma de nota y un único envío original; conciliar solo observa el mismo envío. Un resultado incierto no permite repetir ni renovar el epoch.',
    'HTTP 202 confirma admisión duradera, nunca liquidación. Conserva el ID y concilia el original.' ] };
  if (accountAction(action)) return { title: ACCOUNT_ACTIONS[action].title, body: copy(body), accountContext: copy(accountContext), notes: [
    ...(action === 'accountRecover' ? ['Solicita solo F para el GRAPH original bajo su cutoff y reserva originales, o concilia la liquidación original si ya existe. La autoridad original decide su validez; no modifica el cutoff ni reenvía la entrega. La entrega nativa previa no se revierte y la pérdida aceptada corresponde al solver.'] : []),
    action === 'accountPrepare' ? accountContext?.preparingContinuation
      ? 'Continúa manualmente el mismo ID y tipo PREPARING. Introduce solo su ownerOperationRef y activo originales. El navegador no verifica igualdad con los campos ocultos; el keeper conserva la vinculación y debe rechazar cualquier diferencia, nunca reemplazarla.'
      : 'Vincula una preparación ya creada en el proceso del titular. Este navegador no crea el ownerOperationRef, claves, testigos ni pruebas.'
      : action === 'accountExecute' ? 'Ejecuta únicamente la preparación original registrada identificada. Puede iniciar pruebas y efectos bajo sus comprobaciones originales; no cambia el importe o destino.'
        : action === 'accountRecover' ? 'Solicita F sobre la reserva original. Puede generar su prueba y una transacción de recuperación original, una sola vez, si la autoridad confirma el cutoff y el estado. No reenvía la entrega.'
        : 'Concilia exclusivamente el ID original registrado. No reenvía la operación ni crea una solicitud de reemplazo.',
    'HTTP 200 solo confirma entrada en una cola local volátil: puede no ser duradera. No demuestra ejecución completada, liquidación ni aplicación al saldo.',
    'Conserva el ID original. Actualiza manualmente el diario y la vista privada; un fallo de transporte no confirma rechazo y no autoriza repetir.',
    accountContext?.graph ? 'Solo esta ruta EVM previamente autorizada. El solver aporta su propia liquidez; si entrega y falla la liquidación global, la recuperación privada F mantiene el cutoff original y no revierte la entrega. No hay recuperación automática.' : 'Los grafos sin preparación EVM original registrada están bloqueados.',
    'Recuperación exige otra capacidad exacta explícita para el mismo GRAPH original; no es un reintento. El reinicio del coordinador permanece privado.',
  ] };
  if (defiAction(action)) return { title: DEFI_ACTIONS[action].title, body: copy(body), notes: [
    'Esta acción DeFi requiere una salida original de shares (EXIT) ya confirmada por el titular. Usa por separado su flujo de cuenta original; la acción DeFi no crea esa salida.',
    action === 'defiReopen' ? 'Reabre solo el servicio original. Conserva identidades; no reinicia el keeper ni reenvía transferencias.'
      : action === 'defiRequote' ? 'Cambia únicamente mínimo y deadline de la solicitud original nunca enviada. No permite reenviar una transferencia incierta.'
        : action === 'defiReconcile' ? 'Concilia exclusivamente la redención original y sus identidades retenidas. No crea una transferencia nueva.'
          : 'La redención es pública y el subyacente se entrega a la dirección externa original del titular. No se añade al saldo privado gastable.',
    'El deadline usa el timestamp de la cadena original. No se deriva del reloj del navegador.',
    'HTTP 200 devuelve un resultado del servicio; verifica su fase original. No es admisión nativa 202 ni una garantía de liquidación.',
  ] };
  return { title: ACTIONS[action].title, body: copy(body), nativeIdentity: originalNativeIdentity(nativeClaims),
    nativeAmounts: nativeAmountDetails(action, body, nativeClaims), notes: [
    action === 'deposit' ? 'Requiere un intent ya preparado por el titular original. Este navegador no prepara el intent ni pruebas.'
      : action === 'redeem' ? 'Requiere la salida original autorizada por el titular y un wrapper claim disponible para quemar. El saldo privado mostrado no sustituye esa salida.'
        : action === 'refund' ? 'Usa el intent original elegible y su origen de devolución fijado. No cambia el destinatario ni crea otro depósito.'
          : action === 'reconcile' ? 'Consulta y concilia únicamente las identidades retenidas de la solicitud original. No crea una transferencia nueva.'
            : 'Reanuda exclusivamente la solicitud original bajo las comprobaciones del servidor. Puede continuar efectos autorizados pendientes; no cambia sus términos ni destinos.',
    'Una respuesta HTTP 202 confirma admisión duradera en el diario, nunca liquidación nativa.',
    'La interfaz no recibe claves raíz o de gasto y no prepara pruebas. Destinos, dominio y custodia los fija el bootstrap local.',
  ] };
}
export function actionAvailability(state, action, { ownerToken = true, actionToken = true } = {}) {
  // Resume routes are explicit Node/local SDK calls until a dedicated UI review is joined.
  if(isWrappedResumeAction(action))return false;
  const snapshot = state.data?.nativeClaims?.snapshot;
  // A received journal snapshot can authorize original reconciliation even if
  // the separate private owner projection failed. A cached fallback cannot.
  const freshNativeRecovery = state.nativeSnapshotFresh === true && snapshot?.phase === 'READY'
    && snapshot.storageAvailable === true && snapshot.busy === false && snapshot.queued === 0;
  return Boolean(Object.hasOwn(ALL_ACTIONS, action) && ownerToken && actionToken && state.data
    && state.data.connection === 'CONNECTED' && !state.stale && !state.reading && !state.sending
    && journalsIdle(state)
    && (isWrappedWithdrawalAction(action) ? state.data.errors.wrappedWithdrawals === null && Boolean(state.data.wrappedWithdrawals)
      : accountAction(action) ? state.accountSnapshotFresh === true && !state.accountStale && !state.data.errors.account
        && (action !== 'accountPrepare' || accountAssetChoices(state).length > 0 || accountAssetChoices(state, 'EXIT').length > 0)
        && (action !== 'accountRecover' || state.data.capabilities.manualEvmVaultGraph === true)
      : defiAction(action) ? action === 'defiReopen' || !state.defiStale && !state.data.errors.defi
      : action === 'reconcile' ? freshNativeRecovery : !state.nativeStale && state.data.errors.nativeClaims === null
        && !state.nativeIdentityMismatch && originalNativeIdentity(state.data.nativeClaims) !== null)
    && state.data.capabilities[ALL_ACTIONS[action].capability] === true);
}
/** A fake fetch can test all interruption flows without running any chain. */
export function createWalletClient({ fetchImpl, ownerToken, actionToken, manualActionHandoff = null, wrappedWithdrawalAccess = null, exactActionAccess = null, now = () => Date.now(), readTimeoutMs = 90000, actionTimeoutMs = 30000 }) {
  if (typeof fetchImpl !== 'function') throw new Error('WALLET_FETCH_REQUIRED');
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
  async function request(path, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(path, { ...options, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
      const value = await response.json();
      return { ok: response.ok, status: response.status, value };
    }
    finally { clearTimeout(timer); }
  }
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
        if (isWrappedWithdrawalAction(review.action)) {
          const admission=response.value;
          if(response.status!==202||admission?.admitted!==true||admission.action!==WRAPPED_WITHDRAWAL_ACTIONS[review.action].command||admission.requestId!==review.body.requestId) throw new Error('WALLET_WRAPPED_WITHDRAWAL_ADMISSION_CONTRACT');
          update({sending:false,stale:true,outcome:{state:'DURABLE_WRAPPED_WITHDRAWAL_ADMISSION',action:review.action,requestId:id},error:''});return true;
        }
        if (accountAction(review.action)) {
          const result = response.value, admission = result?.admission;
          if (response.status !== 200 || result?.version !== 1 || result.profile !== 'FLAT_ACCOUNT_VOLATILE_ADMISSION_V1'
            || Object.keys(result).sort().join(',') !== 'acceptance,admission,durableAdmissionEstablished,profile,settlementEstablished,version'
            || result.acceptance !== 'VOLATILE_UI_QUEUE_ONLY' || result.durableAdmissionEstablished !== false || result.settlementEstablished !== false
            || admission?.version !== 1 || admission.admitted !== true || !Number.isSafeInteger(admission.sequence) || admission.sequence <= 0
            || Object.keys(admission).sort().join(',') !== 'action,admitted,requestId,sequence,version'
            || admission.action !== ACCOUNT_ACTIONS[review.action].command || admission.requestId !== review.body.requestId)
            throw new Error('WALLET_ACCOUNT_ADMISSION_CONTRACT');
          update({ sending: false, stale: true, outcome: { state: 'VOLATILE_QUEUE_ACCEPTANCE', action: review.action, requestId: id }, error: '' }); return true;
        }
        if (defiAction(review.action)) {
          const result = response.value;
          if (response.status !== 200 || (review.action === 'defiReopen'
            ? result?.reopened !== true || result.originalIdentitiesRetained !== true || result.keeperRestart !== false || !Array.isArray(result.requestIds)
            : result?.version !== 1 || result.profile !== DEFI_PROFILE || result.requestId !== review.body.requestId
              || !defiPhases.includes(result.phase) || result.underlyingPrivateSpendable !== false
              || result.underlyingLocation !== 'EXTERNAL_OWNER_ADDRESS' || result.redemptionPublic !== true))
            throw new Error('WALLET_DEFI_RESULT_CONTRACT');
          update({ sending: false, stale: true, outcome: { state: 'SERVICE_RESULT', action: review.action, requestId: id,
            phase: review.action === 'defiReopen' ? 'REOPENED' : result.phase }, error: '' }); return true;
        }
        if (response.status !== 202) throw new Error('WALLET_ACTION_UNKNOWN');
        const admission = response.value;
        if (admission?.admitted !== true || admission.action !== review.action || admission.requestId !== review.body.requestId)
          throw new Error('WALLET_ADMISSION_CONTRACT');
        update({ sending: false, stale: true, outcome: { state: 'ADMITTED', action: review.action, requestId: review.body.requestId },
          error: '' }); return true;
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
