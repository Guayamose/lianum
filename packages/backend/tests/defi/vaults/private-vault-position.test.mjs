import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateVaultPosition, createPrivateVaultPortfolioView } from '../../../src/defi/vaults/private-vault-position.mjs';

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

// Supplied read-only presentation values; these tests grant no protocol,
// observer, private note or financial acceptance authority.
function officialPreview() {
  const input = fixture(), share = input.portfolioView.assets[0];
  share.balances.available = '99500000000000'; share.backing.held = '100000000000000';
  input.vaultView.snapshot.totalAssets = '100'; input.vaultView.snapshot.totalShares = '100000000000000';
  input.vaultView.privateSharePreview = { amount: share.balances.available, holder: '0x' + '56'.repeat(20),
    heldShares: share.backing.held, redeemableUnderlying: '99', maximumShares: share.backing.held };
  return input;
}
test('official decimal-offset preview is retained instead of the synthetic ratio', () => {
  const input = officialPreview(), view = projectPrivateVaultPosition(input);
  assert.equal(view.availableShares, '99500000000000');
  assert.equal(view.estimatedRedeemableUnderlying, '99');
  assert.equal(view.underlyingSpendable, false);
  assert.equal(input.portfolioView.assets[1].balances.available, '200');
  const synthetic = structuredClone(input); delete synthetic.vaultView.privateSharePreview;
  assert.equal(projectPrivateVaultPosition(synthetic).estimatedRedeemableUnderlying, '100');
  input.vaultView.privateSharePreview.amount = '1';
  assert.throws(() => projectPrivateVaultPosition(input), /PREVIEW_SHARE_AMOUNT/);
});
test('insufficient real maxRedeem removes valuation while original note ownership remains', () => {
  const input = officialPreview(); input.vaultView.privateSharePreview.maximumShares = '1000000000000';
  const view = projectPrivateVaultPosition(input);
  assert.equal(view.status, 'STALE'); assert.equal(view.estimatedRedeemableUnderlying, null);
  assert.equal(input.portfolioView.assets[0].status, 'LIVE');
  assert.equal(input.portfolioView.assets[0].balances.available, '99500000000000');
  assert.equal(view.underlyingSpendable, false);
});
