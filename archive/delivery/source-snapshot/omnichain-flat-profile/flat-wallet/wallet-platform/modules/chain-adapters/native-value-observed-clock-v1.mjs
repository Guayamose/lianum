/** Pure clock DATA validation; no runtime, clock source, signer or authority.
 * The fixed original receiver samples Date.now privately and passes that exact
 * observation. Supplying public numbers cannot advance an owned process. */
import assert from 'node:assert/strict';
const uint=value=>{assert.ok(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&value.length<=16,'NATIVE_VALUE_OBSERVED_CLOCK_INTEGER');const n=BigInt(value);assert.ok(n<=BigInt(Number.MAX_SAFE_INTEGER),'NATIVE_VALUE_OBSERVED_CLOCK_RANGE');return n;};
export function observedNativeValueReceiverSecond(previousSecond,observedMilliseconds){
 const previous=uint(previousSecond),now=uint(observedMilliseconds)/1000n;
 assert.ok(now>=previous,'LOCAL_OBSERVED_CLOCK_ROLLBACK');return now;
}
