/** Consistency of fresh canonical Aave reads; no object or proof authority. */
import assert from 'node:assert/strict';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
const keys=['pool','aToken','wrapper','rate','scaledWrapper','scaledTotal','wrapperAssets','poolUnderlying','wrapperUnderlying','inputSupply','stableDebt','variableDebt'];
const uint=value=>{assert.ok(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value));const n=BigInt(value);assert.ok(n<1n<<256n);return n;};
export function assertAaveStaticRedemptionAccountingV1(input) {
  exactRecord(input,['before','after','assets']); const {before,after}=input; exactRecord(before,keys); exactRecord(after,keys);
  for(const name of ['pool','aToken','wrapper']) {assert.match(before[name],/^0x[0-9a-f]{40}$/);assert.notEqual(before[name],'0x'+'0'.repeat(40));assert.equal(before[name],after[name],'AAVE_ORIGINAL_POSITION');}
  for(const name of keys.slice(3)){uint(before[name]);uint(after[name]);}
  const assets=uint(input.assets),rate=uint(after.rate),ray=10n**27n;
  assert.ok(assets>0n&&rate>=uint(before.rate)&&uint(before.rate)>=ray,'AAVE_ORIGINAL_INCOME_INDEX');
  for(const name of ['inputSupply','stableDebt','variableDebt','wrapperUnderlying'])assert.equal(before[name],after[name],'AAVE_UNRELATED_REDEMPTION_EFFECT');
  assert.equal(uint(before.wrapperAssets),(uint(before.scaledWrapper)*uint(before.rate)+ray/2n)/ray,'AAVE_ORIGINAL_INDEXED_BACKING');
  const scaled=(assets*ray+rate/2n)/rate;
  assert.equal(uint(before.scaledWrapper)-uint(after.scaledWrapper),scaled,'AAVE_ORIGINAL_SCALED_BURN');
  assert.equal(uint(before.scaledTotal)-uint(after.scaledTotal),scaled,'AAVE_ORIGINAL_TOTAL_BURN');
  assert.equal(uint(before.poolUnderlying)-uint(after.poolUnderlying),assets,'AAVE_POOL_REAL_WITHDRAWAL');
  assert.equal(uint(after.wrapperAssets),(uint(after.scaledWrapper)*rate+ray/2n)/ray,'AAVE_WRAPPER_INDEXED_BACKING');
  assert.ok(uint(after.wrapperAssets)<=uint(after.poolUnderlying),'AAVE_WITHDRAWABLE_LIQUIDITY');
  return Object.freeze({protocol:'AAVE_V3_STATIC_TOKEN',underlyingReleased:input.assets,scaledBurned:scaled.toString(),
    incomeIndex:after.rate,privateBalanceCredited:false});
}
