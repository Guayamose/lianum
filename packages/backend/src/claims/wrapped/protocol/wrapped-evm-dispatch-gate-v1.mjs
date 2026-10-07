/** Runtime-only opener for fixed claim-controller calls. A caller cannot mint
 * this brand with arbitrary calldata or callbacks: its one-use token must have
 * been registered by the genuine controller's private operation closure. */
import assert from 'node:assert/strict';
const requests = new WeakMap();
export async function createClaimEvmDispatchRequest(token) {
  const { openNativeClaimControllerDispatch } = await import('../controller/wrapped-controller-v1.mjs');
  const scope = openNativeClaimControllerDispatch(token);
  const request = Object.freeze(Object.create(null)); requests.set(request, { scope, opened: false }); return request;
}
export function isOwnedClaimEvmDispatchRequest(request) { return requests.has(request); }
export function assertOwnedClaimEvmDispatchRequest(request, runtime) {
  const row = requests.get(request); assert.ok(row && row.scope.runtime === runtime, 'CLAIM_ORIGINAL_EVM_REQUEST_REQUIRED');
  assert.ok(!row.opened, 'CLAIM_EVM_REQUEST_ALREADY_OPENED'); row.scope.assertLive(); row.opened = true;
  const { transaction, beforeSign, consumeBeforeKey, onSigned } = row.scope;
  return Object.freeze({ transaction, beforeSign, consumeBeforeKey, onSigned });
}
