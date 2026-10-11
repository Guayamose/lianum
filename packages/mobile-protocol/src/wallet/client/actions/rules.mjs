/** Pure action body and availability rules. No transport, tokens or persistence. */
import { journalReady, accountKinds } from '../validation/account.mjs';
import { ALL_ACTIONS, accountAction, defiAction } from './catalog.mjs';
import { record, validId, accountDigest, atomic } from '../validation/values.mjs';
import { isWrappedResumeAction } from '../../contracts/wrapped-withdrawal-resume-actions.mjs';
import { isWrappedWithdrawalAction } from '../../contracts/wrapped-withdrawal-review.mjs';
import { accountAssetChoices } from './account-context.mjs';
import { originalNativeIdentity } from '../validation/native-identity.mjs';

const fields = Object.freeze({
  wrappedWithdrawSuccessorReview: ['requestId'],
  wrappedWithdrawSuccessorAdmit: ['requestId', 'resumeSHA256'],
  wrappedWithdrawResumeReview: ['requestId'],
  wrappedWithdrawResumeAdmit: ['requestId', 'resumeSHA256'],
  wrappedWithdrawResumeContinue: ['requestId', 'resumeSHA256'],
  wrappedWithdrawReapprove: ['requestId', 'termsSHA256'],
  wrappedWithdrawCancel: ['requestId', 'termsSHA256'],
  wrappedWithdrawPrepare: ['requestId', 'role', 'termsSHA256'],
  wrappedWithdrawExecute: ['requestId', 'termsSHA256'],
  wrappedWithdrawReconcile: ['requestId', 'termsSHA256'],
  deposit: ['requestId', 'intentId'],
  refund: ['requestId', 'intentId'],
  redeem: ['requestId', 'amount', 'maxFee'],
  reconcile: ['requestId'],
  resume: ['requestId'],
  defiPrepare: ['requestId', 'minimumOutput', 'deadline'],
  defiRequote: ['requestId', 'minimumOutput', 'deadline'],
  defiExecute: ['requestId'],
  defiReconcile: ['requestId'],
  defiReopen: [],
  accountPrepare: ['requestId', 'kind', 'ownerOperationRef', 'assetId'],
  accountExecute: ['requestId'],
  accountReconcile: ['requestId'],
  accountRecover: ['requestId'],
});

function journalsIdle(state) {
  const account = state.data?.account, native = state.data?.nativeClaims, wrapped = state.data?.wrappedWithdrawals;
  return !state.accountStale && (!account || state.accountSnapshotFresh === true && journalReady(account.snapshot)
      && account.snapshot.available === true && account.snapshot.observation === 'CURRENT' && Number.isSafeInteger(account.snapshot.revision))
    && (!native ? !state.data?.errors.nativeClaims : state.nativeSnapshotFresh === true && journalReady(native.snapshot))
    && (!wrapped || !state.data?.errors.wrappedWithdrawals && journalReady(wrapped.snapshot));
}

export function buildActionBody(action, input) {
  if (!Object.hasOwn(ALL_ACTIONS, action) || !record(input)
    || Object.keys(input).sort().join(',') !== [...fields[action]].sort().join(',')) throw new Error('Revisa los campos de la acción');
  if (action !== 'defiReopen' && !validId(input.requestId)) throw new Error('La solicitud requiere 8–100 letras ASCII, números, guiones o guiones bajos');
  if ('intentId' in input && !(typeof input.intentId === 'string' && /^[a-f0-9]{64}$/.exec(input.intentId)?.[0] === input.intentId && /[1-9a-f]/.test(input.intentId)))
    throw new Error('El intent original debe contener 64 caracteres hexadecimales minúsculos, sin 0x y distinto de cero');
  if (action === 'accountPrepare' && (!accountKinds.includes(input.kind) || !accountDigest(input.ownerOperationRef) || !accountDigest(input.assetId)))
    throw new Error('Solo TOP_UP, EXIT o GRAPH EVM registrado, con referencia original del titular e identidad del activo en 64 caracteres hexadecimales minúsculos');
  if (isWrappedResumeAction(action) && !['wrappedWithdrawResumeReview', 'wrappedWithdrawSuccessorReview'].includes(action)
    && !accountDigest(input.resumeSHA256)) throw new Error('WALLET_WRAPPED_RESUME_EXACT_BODY');
  if (isWrappedWithdrawalAction(action) && (!accountDigest(input.termsSHA256)
    || action === 'wrappedWithdrawPrepare' && !['recipient', 'change'].includes(input.role)))
    throw new Error('WALLET_WRAPPED_WITHDRAWAL_EXACT_BODY');
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
