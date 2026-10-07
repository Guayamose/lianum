/** Intersect already-admitted evidence with the original owner cutoff.
 * This never renews a receipt or changes the timeout recovery authorization. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray } from '../../encoding/commitments.mjs';

function timestamp(value) {
  assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value,
    'FLAT_EXECUTION_WINDOW_TIMESTAMP');
  const parsed = BigInt(value);
  assert.ok(parsed < 2n ** 64n, 'FLAT_EXECUTION_WINDOW_TIMESTAMP');
  return parsed;
}

export function flatCompletionWindow(input) {
  exactRecord(input, ['timestamp', 'settleBefore', 'receipts']);
  assert.ok(Array.isArray(input.receipts) && input.receipts.length <= 4,
    'FLAT_EXECUTION_RECEIPT_WINDOW_COUNT');
  fixedArray(input.receipts, input.receipts.length);
  const now = timestamp(input.timestamp);
  let until = timestamp(input.settleBefore);
  for (const receipt of input.receipts) {
    exactRecord(receipt, ['validFrom', 'validUntil']);
    const from = timestamp(receipt.validFrom), end = timestamp(receipt.validUntil);
    assert.ok(from < end && from <= now, 'FLAT_EXECUTION_RECEIPT_WINDOW_INVALID');
    if (end < until) until = end;
  }
  assert.ok(now < until, 'FLAT_EXECUTION_RECEIPT_WINDOW_EXPIRED');
  return Object.freeze({ validFrom: input.timestamp, validUntil: until.toString() });
}
