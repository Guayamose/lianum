/** Authenticated-owner presentation of actual private share-note ownership.
 * Redemption value is an estimate from the current pinned vault, never a
 * second spendable underlying balance or authorization to convert anything. */
import assert from 'node:assert/strict';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { assertOwnedFlatPortfolio } from '../../accounts/authority/flat-portfolio-authority.mjs';
import { assertOwnedBackedVault } from './owned-backed-vault.mjs';
import { isOwnedOfficialStaticVaultV1, assertOwnedMetaMorphoVault } from './owned-metamorpho-vault.mjs';
import { projectPrivateVaultPosition } from '../positions/private-vault-position-projection.mjs';
export { projectPrivateVaultPosition } from '../positions/private-vault-position-projection.mjs';

/** Private bootstrap accepts only the original branded portfolio/vault. */
export function createPrivateVaultPortfolioView(input) {
  exactRecord(input, ['runtime', 'portfolio', 'vault', 'shareAssetId', 'underlyingAssetId']);
  const { runtime, portfolio, vault, shareAssetId, underlyingAssetId } = input;
  const official = isOwnedOfficialStaticVaultV1(vault);
  const assertVault = () => official ? assertOwnedMetaMorphoVault(runtime, vault) : assertOwnedBackedVault(runtime, vault);
  assertOwnedFlatPortfolio(runtime, portfolio); assertVault();
  const share = portfolio.registry.find(value => value.assetId === shareAssetId);
  const underlying = portfolio.registry.find(value => value.assetId === underlyingAssetId);
  assert.ok(share && underlying && shareAssetId !== underlyingAssetId, 'PRIVATE_VAULT_REGISTERED_ASSETS');
  assert.equal(share.kind, 'ERC20'); assert.equal(underlying.kind, 'ERC20');
  assert.equal(share.genesis, underlying.genesis);
  return async function ownerView() {
    assertOwnedFlatPortfolio(runtime, portfolio); assertVault();
    const portfolioView = await portfolio.ownerView();
    if (portfolioView.status !== 'LIVE') return { ...portfolioView,
      positions: [{ kind: 'ERC4626_SHARE', status: 'UNAVAILABLE', shareAssetId, underlyingAssetId,
        availableShares: null, estimatedRedeemableUnderlying: null, underlyingSpendable: false }] };
    const ownedShares = portfolioView.assets.find(value => value.asset.assetId === shareAssetId);
    const vaultView = official && ownedShares?.status === 'LIVE'
      ? await vault.observePrivateShares({ amount: ownedShares.balances.available, holder: '0x' + share.pool })
      : await vault.observe();
    assert.equal(vaultView.identity.vault, share.token, 'PRIVATE_VAULT_SHARE_TOKEN');
    assert.equal(vaultView.identity.asset, underlying.token, 'PRIVATE_VAULT_UNDERLYING_TOKEN');
    assert.equal(vaultView.identity.genesisHash, share.genesis, 'PRIVATE_VAULT_GENESIS');
    const position = projectPrivateVaultPosition({ portfolioView, vaultView, shareAssetId, underlyingAssetId });
    return { ...portfolioView, positions: [position] };
  };
}
