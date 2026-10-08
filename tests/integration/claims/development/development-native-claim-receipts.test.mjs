/** Synthetic controller read scheduling only. No node, proof or authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { readDevelopmentNativeClaimReceipts } from './development-native-claim-receipts.mjs';

const ids = ['1'.repeat(64), '2'.repeat(64)];
function singleFlight(failureAt = null) {
  let busy = false, maximum = 0;
  const calls = [], receipts = ids.map(operationId => Object.freeze({ synthetic: true, operationId }));
  const failure = Error('SYNTHETIC_ORIGINAL_READ_REJECTED');
  const controller = { async privateNativeReceipt({ operationId }) {
    assert.equal(busy, false, 'CLAIM_CONTROLLER_BUSY'); busy = true; maximum = Math.max(maximum, 1);
    calls.push(operationId);
    try { await setImmediate(); if (operationId === failureAt) throw failure;
      return receipts[ids.indexOf(operationId)]; } finally { busy = false; }
  } };
  return { controller, receipts, calls, failure, maximum: () => maximum };
}

test('two original private receipt reads respect the same controller serial guard', async () => {
  const concurrent = singleFlight();
  const rejected = await Promise.allSettled(ids.map(operationId => concurrent.controller.privateNativeReceipt({ operationId })));
  assert.equal(rejected[0].status, 'fulfilled');
  assert.equal(rejected[1].status, 'rejected'); assert.match(rejected[1].reason.message, /CLAIM_CONTROLLER_BUSY/);
  const original = singleFlight();
  const result = await readDevelopmentNativeClaimReceipts(original.controller, ids);
  assert.deepEqual(original.calls, ids); assert.equal(original.maximum(), 1);
  assert.strictEqual(result[0], original.receipts[0]); assert.strictEqual(result[1], original.receipts[1]);
});

test('an original receipt read error stops immediately without retry or authority fallback', async () => {
  for (const failedIndex of [0, 1]) {
    const original = singleFlight(ids[failedIndex]);
    await assert.rejects(readDevelopmentNativeClaimReceipts(original.controller, ids), error => error === original.failure);
    assert.deepEqual(original.calls, ids.slice(0, failedIndex + 1));
  }
});
