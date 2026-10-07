import test from 'node:test';
import assert from 'node:assert/strict';
import { flatCompletionWindow } from '../../../../src/execution/account/reconciliation/flat-completion-window.mjs';

test('completion uses the intersection of admitted receipts and the owner cutoff', () => {
  assert.deepEqual(flatCompletionWindow({ timestamp: '110', settleBefore: '7300', receipts: [
    { validFrom: '100', validUntil: '400' }, { validFrom: '105', validUntil: '405' },
  ] }), { validFrom: '110', validUntil: '400' });
  assert.deepEqual(flatCompletionWindow({ timestamp: '110', settleBefore: '200', receipts: [
    { validFrom: '100', validUntil: '400' },
  ] }), { validFrom: '110', validUntil: '200' });
});

test('expired or not-yet-valid evidence never gets a later replacement window', () => {
  for (const [now, from, until] of [['400', '100', '400'], ['401', '100', '400'],
    ['99', '100', '400'], ['110', '100', '100']]) {
    assert.throws(() => flatCompletionWindow({ timestamp: now, settleBefore: '7300',
      receipts: [{ validFrom: from, validUntil: until }] }), /RECEIPT_WINDOW/);
  }
  assert.throws(() => flatCompletionWindow({ timestamp: '7300', settleBefore: '7300', receipts: [] }),
    /RECEIPT_WINDOW_EXPIRED/);
});

test('timestamps remain canonical u64 values and receipt count is bounded', () => {
  for (const value of [110, '0110', '110\n', '-1', '18446744073709551616']) {
    assert.throws(() => flatCompletionWindow({ timestamp: value, settleBefore: '7300', receipts: [] }));
  }
  assert.throws(() => flatCompletionWindow({ timestamp: '110', settleBefore: '7300',
    receipts: Array.from({ length: 5 }, () => ({ validFrom: '100', validUntil: '400' })) }));
});
