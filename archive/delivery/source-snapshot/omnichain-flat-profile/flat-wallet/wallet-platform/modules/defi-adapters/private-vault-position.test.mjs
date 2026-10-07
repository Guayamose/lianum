import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateVaultPosition, createPrivateVaultPortfolioView } from './private-vault-position.mjs';

function fixture() {
  const observed = { blockHash: 'ab'.repeat(32), blockNumber: '10', timestamp: '7000' };
  return { shareAssetId: '12'.repeat(32), underlyingAssetId: '34'.repeat(32),
    portfolioView: { status: 'LIVE', coherent: true, observed, assets: [
      { asset: { assetId: '12'.repeat(32) }, status: 'LIVE', balances: { available: '100' }, backing: { held: '300' } },
      { asset: { assetId: '34'.repeat(32) }, status: 'LIVE', balances: { available: '200' }, backing: { held: '200' } },
    ] },
    vaultView: { snapshot: { blockHash: observed.blockHash, blockNumber: '10', blockTimestamp: '7000',
      totalAssets: '301', totalShares: '300' } } };
}
test('private shares produce a rounded estimate without a second spendable underlying balance', () => {
  const input = fixture(), view = projectPrivateVaultPosition(input);
  assert.equal(view.availableShares, '100'); assert.equal(view.estimatedRedeemableUnderlying, '100');
  assert.equal(view.underlyingSpendable, false); assert.equal(view.privateConversionAccepted, false);
  assert.equal(input.portfolioView.assets[1].balances.available, '200');
});
test('different blocks or unavailable private balances do not produce a redemption amount', () => {
  const input = fixture(); input.vaultView.snapshot.blockHash = 'ac'.repeat(32);
  let view = projectPrivateVaultPosition(input); assert.equal(view.status, 'STALE');
  assert.equal(view.estimatedRedeemableUnderlying, null);
  input.portfolioView.status = 'PARTIAL'; view = projectPrivateVaultPosition(input);
  assert.equal(view.availableShares, null);
});
test('mismatched asset route, phantom shares and terminators reject', () => {
  const input = fixture();
  assert.throws(() => projectPrivateVaultPosition({ ...input, shareAssetId: input.underlyingAssetId }), /REGISTERED_ASSETS/);
  input.portfolioView.assets[0].balances.available = '301';
  assert.throws(() => projectPrivateVaultPosition(input), /NOTE_BACKING/);
  input.portfolioView.assets[0].balances.available = '100\n';
  assert.throws(() => projectPrivateVaultPosition(input), /NOTE_BACKING/);
});
test('plain caller views cannot instantiate the private producer', () => {
  assert.throws(() => createPrivateVaultPortfolioView({ runtime: {}, portfolio: {}, vault: {},
    shareAssetId: '12'.repeat(32), underlyingAssetId: '34'.repeat(32) }), /OWNED_CAPABILITY_REQUIRED/);
});
