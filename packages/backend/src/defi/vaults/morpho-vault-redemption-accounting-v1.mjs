/** Pure consistency of original historical Morpho market/position observations.
 * This confers no receipt, custody, runtime or private-credit authority. The
 * adapter obtains all fields from its fixed original fixture at canonical heads. */
import assert from 'node:assert/strict';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
const integer = value => {
  assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 78, 'MORPHO_REDEMPTION_INTEGER');
  const result = BigInt(value); assert.ok(result < 1n << 256n, 'MORPHO_REDEMPTION_INTEGER'); return result;
};
function observation(value) {
  exactRecord(value, ['protocol', 'marketId', 'positionOwner', 'market', 'position', 'underlyingBalance', 'vaultUnderlyingBalance', 'assetTotalSupply']);
  for (const name of ['protocol', 'positionOwner']) assert.ok(/^0x[0-9a-f]{40}$/.test(value[name]), 'MORPHO_REDEMPTION_IDENTITY');
  assert.ok(/^0x[0-9a-f]{64}$/.test(value.marketId), 'MORPHO_REDEMPTION_MARKET');
  exactRecord(value.market, ['totalSupplyAssets', 'totalSupplyShares', 'totalBorrowAssets', 'totalBorrowShares', 'lastUpdate', 'fee']);
  exactRecord(value.position, ['supplyShares', 'borrowShares', 'collateral']);
  for (const field of [value.market, value.position]) for (const amount of Object.values(field)) integer(amount);
  for (const key of ['underlyingBalance', 'vaultUnderlyingBalance', 'assetTotalSupply']) integer(value[key]);
  for (const key of ['totalBorrowAssets', 'totalBorrowShares', 'fee']) assert.equal(value.market[key], '0', 'MORPHO_REDEMPTION_FIXED_NO_DEBT');
  for (const key of ['borrowShares', 'collateral']) assert.equal(value.position[key], '0', 'MORPHO_REDEMPTION_FIXED_NO_DEBT');
  assert.ok(integer(value.position.supplyShares) <= integer(value.market.totalSupplyShares), 'MORPHO_REDEMPTION_POSITION_BACKING');
  assert.ok(integer(value.market.totalSupplyAssets) <= integer(value.underlyingBalance), 'MORPHO_REDEMPTION_TOKEN_BACKING');
}
export function assertMorphoVaultRedemptionAccountingV1(input) {
  exactRecord(input, ['before', 'after', 'assets']);
  const { before, after } = input; observation(before); observation(after);
  const assets = integer(input.assets); assert.ok(assets > 0n, 'MORPHO_REDEMPTION_POSITIVE_OUTPUT');
  for (const key of ['protocol', 'marketId', 'positionOwner', 'assetTotalSupply'])
    assert.equal(after[key], before[key], 'MORPHO_REDEMPTION_ORIGINAL_BINDING');
  assert.ok(integer(after.market.lastUpdate) >= integer(before.market.lastUpdate), 'MORPHO_REDEMPTION_TIME');
  const marketAssets = integer(before.market.totalSupplyAssets) - integer(after.market.totalSupplyAssets);
  const marketShares = integer(before.market.totalSupplyShares) - integer(after.market.totalSupplyShares);
  const positionShares = integer(before.position.supplyShares) - integer(after.position.supplyShares);
  const vaultAssets = integer(before.vaultUnderlyingBalance) - integer(after.vaultUnderlyingBalance);
  assert.ok(marketAssets >= 0n && marketShares >= 0n && positionShares >= 0n && vaultAssets >= 0n, 'MORPHO_REDEMPTION_NO_NEW_SUPPLY');
  assert.equal(integer(before.underlyingBalance) - integer(after.underlyingBalance), marketAssets, 'MORPHO_REDEMPTION_UNDERLYING_DELTA');
  assert.equal(marketShares, positionShares, 'MORPHO_REDEMPTION_POSITION_DELTA');
  assert.equal(marketAssets + vaultAssets, assets, 'MORPHO_REDEMPTION_EXACT_RELEASE');
  assert.equal(marketAssets === 0n, marketShares === 0n, 'MORPHO_REDEMPTION_SHARE_DELTA');
  return Object.freeze({ protocol: 'MORPHO_BLUE_VIA_METAMORPHO', assets: input.assets,
    marketAssetsReleased: marketAssets.toString(), supplySharesConsumed: positionShares.toString(),
    vaultAssetsReleased: vaultAssets.toString(), privateBalanceCredited: false, directMorphoPrivateSupplyEstablished: false });
}
