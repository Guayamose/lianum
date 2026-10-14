/** Amount policy only. Neither metadata nor this predicate grants account authority. */
import assert from 'node:assert/strict';
export function normalizeMinimumDepositAtomic(value) {
 assert.ok(typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value),'FLAT_MINIMUM_DEPOSIT_REQUIRED');
 assert.ok(BigInt(value)<1n<<64n,'FLAT_MINIMUM_DEPOSIT_UINT64');return value;
}
export function assertFlatMinimumDepositAmount(minimum,amount) {
 normalizeMinimumDepositAtomic(minimum);
 assert.ok(typeof amount==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(amount)&&BigInt(amount)<1n<<64n,'FLAT_DEPOSIT_AMOUNT_UINT64');
 assert.ok(BigInt(amount)>=BigInt(minimum),'FLAT_DEPOSIT_BELOW_MINIMUM');return amount;
}
