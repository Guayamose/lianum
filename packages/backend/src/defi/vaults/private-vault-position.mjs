/** Authenticated-owner presentation of actual private share-note ownership.
 * Redemption value is an estimate from the current pinned vault, never a
 * second spendable underlying balance or authorization to convert anything. */
import assert from 'node:assert/strict';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { assertOwnedFlatPortfolio } from '../../accounts/authority/flat-portfolio-authority.mjs';
import { assertOwnedBackedVault } from './owned-backed-vault.mjs';
import { isOwnedOfficialStaticVaultV1, assertOwnedMetaMorphoVault } from './owned-metamorpho-vault.mjs';
import { previewVaultRedeem } from './backed-vault.mjs';

export function projectPrivateVaultPosition({ portfolioView, vaultView, shareAssetId, underlyingAssetId }) {
  const share = portfolioView.assets.find(value => value.asset.assetId === shareAssetId);
  const underlying = portfolioView.assets.find(value => value.asset.assetId === underlyingAssetId);
  assert.ok(share && underlying && shareAssetId !== underlyingAssetId, 'PRIVATE_VAULT_REGISTERED_ASSETS');
  const ready = portfolioView.status === 'LIVE' && portfolioView.coherent === true
    && share.status === 'LIVE' && underlying.status === 'LIVE'
    && portfolioView.observed.blockHash === vaultView.snapshot.blockHash
    && portfolioView.observed.blockNumber === vaultView.snapshot.blockNumber
    && portfolioView.observed.timestamp === vaultView.snapshot.blockTimestamp;
  if (!ready) return Object.freeze({ kind: 'ERC4626_SHARE', status: 'STALE', shareAssetId, underlyingAssetId,
    availableShares: null, estimatedRedeemableUnderlying: null, underlyingSpendable: false });
  const shares = share.balances.available;
  assert.ok(typeof shares === 'string' && /^(0|[1-9][0-9]*)$/.exec(shares)?.[0] === shares
    && BigInt(shares).toString() === shares && BigInt(shares) <= BigInt(share.backing.held), 'PRIVATE_VAULT_NOTE_BACKING');
  assert.ok(BigInt(shares) <= BigInt(vaultView.snapshot.totalShares), 'PRIVATE_VAULT_SHARE_SUPPLY');
  // Official conversion is read by the original capability, including its
  // decimal offset. A synthetic ratio cannot replace MetaMorpho previewRedeem.
  if (vaultView.privateSharePreview) {
    assert.equal(vaultView.privateSharePreview.amount, shares, 'PRIVATE_VAULT_PREVIEW_SHARE_AMOUNT');
    assert.ok(BigInt(shares) <= BigInt(vaultView.privateSharePreview.heldShares), 'PRIVATE_VAULT_PREVIEW_BACKING');
    if (BigInt(shares) > BigInt(vaultView.privateSharePreview.maximumShares)) return Object.freeze({
      kind: 'ERC4626_SHARE', status: 'STALE', shareAssetId, underlyingAssetId,
      availableShares: null, estimatedRedeemableUnderlying: null, underlyingSpendable: false });
  }
  const estimate = vaultView.privateSharePreview
    ? vaultView.privateSharePreview.redeemableUnderlying
    : previewVaultRedeem(shares, { totalAssets: vaultView.snapshot.totalAssets,
      totalShares: vaultView.snapshot.totalShares });
  assert.ok(BigInt(estimate) <= BigInt(vaultView.snapshot.totalAssets), 'PRIVATE_VAULT_UNDERLYING_BACKING');
  return Object.freeze({ kind: 'ERC4626_SHARE', status: 'LIVE', shareAssetId, underlyingAssetId,
    availableShares: shares, estimatedRedeemableUnderlying: estimate, underlyingSpendable: false,
    observedBlockHash: vaultView.snapshot.blockHash, rounding: 'down',
    assurance: 'PRIVATE_SHARE_NOTES_AND_PINNED_LOCAL_VAULT_STATE', privateConversionAccepted: false });
}

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
