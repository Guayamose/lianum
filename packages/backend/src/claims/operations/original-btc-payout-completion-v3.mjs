/** Complete the already admitted BTC payout by observing the same once-sent
 * wire. The caller owns the original controller and its pool runtime; this
 * helper issues no controller, runtime, permission or transfer authority. */
import assert from "node:assert/strict";

/** @typedef {{status: string}} PayoutResult */
/** @typedef {{family: string, nativeId: string, transactionSHA256: string,
 * broadcastAttempts: number}} NativePayoutReceipt */

/**
 * @template {PayoutResult} Result
 * @param {{descriptor: {claim: {nativeFamily: string}}, poolIndex: number,
 *   claims: {nativeRuntimes: {confirm(nativeId: string): Promise<unknown>}[]},
 *   controller: {
 *     privateNativeReceipt(request: {operationId: string}): Promise<NativePayoutReceipt>,
 *     payout(request: {ticketId: string}): Promise<Result>
 *   }}} original
 * @param {string} ticketId
 * @param {Result} result
 * @returns {Promise<Result>}
 */
export async function finishOriginalDeviceRootBtcPayoutV3(
  original,
  ticketId,
  result,
) {
  assert.equal(arguments.length, 3);
  if (
    original.descriptor.claim.nativeFamily !== "1" ||
    result.status === "DISCHARGED"
  )
    return result;
  const receipt = await original.controller.privateNativeReceipt({
    operationId: ticketId,
  });
  assert.equal(receipt.family, "1", "CLAIM_DEVICE_ROOT_BTC_PAYOUT_FAMILY");
  assert.equal(
    receipt.broadcastAttempts,
    1,
    "CLAIM_DEVICE_ROOT_ORIGINAL_SEND_REQUIRED",
  );
  await original.claims.nativeRuntimes[original.poolIndex].confirm(
    receipt.nativeId,
  );
  const after = await original.controller.privateNativeReceipt({
    operationId: ticketId,
  });
  assert.equal(
    after.nativeId,
    receipt.nativeId,
    "CLAIM_DEVICE_ROOT_PAYOUT_WIRE_CHANGED",
  );
  assert.equal(
    after.transactionSHA256,
    receipt.transactionSHA256,
    "CLAIM_DEVICE_ROOT_PAYOUT_WIRE_CHANGED",
  );
  assert.equal(
    after.broadcastAttempts,
    1,
    "CLAIM_DEVICE_ROOT_ORIGINAL_SEND_REQUIRED",
  );
  return original.controller.payout({ ticketId });
}
