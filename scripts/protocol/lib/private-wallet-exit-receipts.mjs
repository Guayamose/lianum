/** Host evidence classification only. A verifier deployment is not a pool exit.
 * Labels are fixed by the production submission routes, not supplied by users. */
const labels = new Set(['exact wallet withdraw_balance', 'sol exact recipient withdrawal', 'btc exact recipient withdrawal']);
export function isPrivateWalletExitReceipt(row) {
  return row?.kind === 'PRIVATE_EVM_TRANSACTION_RECEIPT_HEADER' && labels.has(row.label);
}
