/** Fixed private issuer routing. Unknown/copied/foreign tokens are rejected
 * before a consumer is selected. No fallback, callback or issuer registration. */
import assert from 'node:assert/strict';
import * as Native from '../controller/controller.mjs';
import * as Wrapped from '../wrapped/controller/wrapped-controller-v1.mjs';
function bitcoin(token) {
  if (Wrapped.isWrappedClaimBitcoinSendTokenV1(token)) return Wrapped;
  assert.ok(Native.isNativeClaimBitcoinSendTokenV4(token), 'CLAIM_BITCOIN_PRIVATE_SEND_TOKEN_REQUIRED');
  return Native;
}
export function assertNativeClaimBitcoinPayoutSendToken(token, native, route) {
  return bitcoin(token).assertNativeClaimBitcoinPayoutSendToken(token, native, route);
}
export async function authorizeNativeClaimBitcoinPayoutSend(token, prepared, signed) {
  return bitcoin(token).authorizeNativeClaimBitcoinPayoutSend(token, prepared, signed);
}
export function authorizeNativeClaimBitcoinPayoutLatch(token, prepared, signed) {
  return bitcoin(token).authorizeNativeClaimBitcoinPayoutLatch(token, prepared, signed);
}
export function consumeNativeClaimBitcoinPayoutSend(token, prepared, signed) {
  return bitcoin(token).consumeNativeClaimBitcoinPayoutSend(token, prepared, signed);
}
export function openNativeClaimSolanaPayoutAuthority(token, runtimeClose, genesis, prepared, record) {
  const issuer = Wrapped.isWrappedClaimSolanaPayoutAuthorityV1(token) ? Wrapped : Native;
  if (issuer === Native) assert.ok(Native.isNativeClaimSolanaPayoutAuthorityV4(token), 'CLAIM_SOLANA_PRIVATE_PAYOUT_AUTHORITY_REQUIRED');
  return issuer.openNativeClaimSolanaPayoutAuthority(token, runtimeClose, genesis, prepared, record);
}
export function consumeNativeClaimOriginalKeyAuthorityV4(token, purpose, runtimeClose, genesis, route, prepared) {
  if (Wrapped.isWrappedClaimOriginalKeyAuthorityV4(token))
    return Wrapped.consumeWrappedClaimOriginalKeyAuthorityV4(token, purpose, runtimeClose, genesis, route, prepared);
  assert.ok(Native.isNativeClaimOriginalKeyAuthorityV4(token), 'CLAIM_ORIGINAL_KEY_AUTHORITY_V4_REQUIRED');
  return Native.consumeNativeClaimOriginalKeyAuthorityV4(token, purpose, runtimeClose, genesis, route, prepared);
}
