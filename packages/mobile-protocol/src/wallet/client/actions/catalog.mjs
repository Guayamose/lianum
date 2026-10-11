/** Fixed action routes and protocol labels. This module performs no I/O. */
import { WRAPPED_WITHDRAWAL_ACTIONS, isWrappedWithdrawalAction } from '../../contracts/wrapped-withdrawal-review.mjs';
import { WRAPPED_RESUME_ACTIONS } from '../../contracts/wrapped-withdrawal-resume-actions.mjs';

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

export const defiAction = action => Object.hasOwn(DEFI_ACTIONS, action);

export const accountAction = action => Object.hasOwn(ACCOUNT_ACTIONS, action);

export const actionGroup = action => isWrappedWithdrawalAction(action) ? 'wrappedWithdrawal' : accountAction(action) ? 'account' : defiAction(action) ? 'defi' : 'native';
