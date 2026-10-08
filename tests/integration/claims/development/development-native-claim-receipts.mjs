/** Reads through the original controller's serial API. This helper issues no
 * native, claim or controller authority and never retries a rejected read. */
import assert from 'node:assert/strict';

export async function readDevelopmentNativeClaimReceipts(controller, operationIds) {
  assert.equal(arguments.length, 2, 'DEVELOPMENT_CLAIM_RECEIPT_READ_NO_OPTIONS');
  assert.equal(typeof controller?.privateNativeReceipt, 'function');
  assert.ok(Array.isArray(operationIds) && operationIds.length === 2);
  assert.equal(new Set(operationIds).size, 2);
  for (const operationId of operationIds) assert.match(operationId, /^[0-9a-f]{64}$/);
  const receipts = [];
  for (const operationId of operationIds)
    receipts.push(await controller.privateNativeReceipt({ operationId }));
  return receipts;
}
