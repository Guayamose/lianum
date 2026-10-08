import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAaveStaticRedemptionAccountingV1} from '../../../src/defi/vaults/aave-static-redemption-accounting-v1.mjs';
const ray=10n**27n,rate=ray*11n/10n;
const before={pool:'0x'+'11'.repeat(20),aToken:'0x'+'22'.repeat(20),wrapper:'0x'+'33'.repeat(20),
  rate:String(rate),scaledWrapper:'1000',scaledTotal:'10000',wrapperAssets:'1100',poolUnderlying:'12000',
  wrapperUnderlying:'0',inputSupply:'1000000',stableDebt:'0',variableDebt:'0'};
const after={...before,scaledWrapper:'0',scaledTotal:'9000',wrapperAssets:'0',poolUnderlying:'10900'};
test('official RAY accounting retains yield and proves exact scaled burn/public withdrawal',()=>{
  const value=assertAaveStaticRedemptionAccountingV1({before,after,assets:'1100'});
  assert.equal(value.scaledBurned,'1000');assert.equal(value.underlyingReleased,'1100');assert.equal(value.privateBalanceCredited,false);
});
test('real underlying and scaled liabilities cannot diverge after redemption',()=>{
  assert.throws(()=>assertAaveStaticRedemptionAccountingV1({before,after:{...after,poolUnderlying:'11000'},assets:'1100'}),/AAVE_POOL_REAL_WITHDRAWAL/);
  assert.throws(()=>assertAaveStaticRedemptionAccountingV1({before,after:{...after,scaledTotal:'9001'},assets:'1100'}),/AAVE_ORIGINAL_TOTAL_BURN/);
});
