/** Supplied historical-state consistency only. No fixture, runtime, proof,
 * signer, compiler or private credit; the original adapter supplies real reads. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMorphoVaultRedemptionAccountingV1 } from '../../../src/defi/vaults/morpho-vault-redemption-accounting-v1.mjs';
function trace() {
  const before = { protocol: '0x' + '11'.repeat(20), marketId: '0x' + '22'.repeat(32), positionOwner: '0x' + '33'.repeat(20),
    market: { totalSupplyAssets: '1000000', totalSupplyShares: '1000000000000', totalBorrowAssets: '0', totalBorrowShares: '0', lastUpdate: '1000', fee: '0' },
    position: { supplyShares: '1000000000000', borrowShares: '0', collateral: '0' },
    underlyingBalance: '1000000', vaultUnderlyingBalance: '500', assetTotalSupply: '10000000' };
  const after = structuredClone(before);
  Object.assign(after.market, { totalSupplyAssets: '400000', totalSupplyShares: '400000000000', lastUpdate: '1001' });
  after.position.supplyShares = '400000000000'; after.underlyingBalance = '400000'; after.vaultUnderlyingBalance = '0';
  return { before, after, assets: '600500' };
}
test('Morpho position and actual loan-token release join the existing MetaMorpho redemption without creating a direct-market claim', () => {
  const input = trace(), value = assertMorphoVaultRedemptionAccountingV1(input);
  assert.equal(value.marketAssetsReleased, '600000'); assert.equal(value.vaultAssetsReleased, '500');
  assert.equal(value.supplySharesConsumed, '600000000000');
  assert.equal(value.privateBalanceCredited, false); assert.equal(value.directMorphoPrivateSupplyEstablished, false);
  assert.ok(Object.isFrozen(value));
  const liquid = trace(); liquid.after = structuredClone(liquid.before); liquid.after.vaultUnderlyingBalance = '0'; liquid.assets = '500';
  assert.equal(assertMorphoVaultRedemptionAccountingV1(liquid).marketAssetsReleased, '0');
});
test('matching vault/redemption amounts cannot replace the original Morpho position, market shares, zero debt or token conservation', () => {
  for (const mutate of [
    x => { x.after.protocol = '0x' + '44'.repeat(20); }, x => { x.after.marketId = '0x' + '55'.repeat(32); },
    x => { x.after.positionOwner = '0x' + '66'.repeat(20); }, x => { x.after.position.supplyShares = '400000000001'; },
    x => { x.after.market.totalSupplyShares = '400000000001'; }, x => { x.after.underlyingBalance = '400001'; },
    x => { x.after.position.borrowShares = '1'; }, x => { x.after.position.collateral = '1'; },
    x => { x.after.market.totalBorrowAssets = '1'; }, x => { x.after.market.totalBorrowShares = '1'; },
    x => { x.after.market.fee = '1'; }, x => { x.after.assetTotalSupply = '10000001'; },
    x => { x.after.vaultUnderlyingBalance = '1'; }, x => { x.assets = '0600500'; },
  ]) { const input = trace(); mutate(input); assert.throws(() => assertMorphoVaultRedemptionAccountingV1(input)); }
});
