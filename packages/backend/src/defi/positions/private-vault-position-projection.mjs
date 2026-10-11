/** Pure projection of already-observed note/vault values. This function grants
 * neither ownership nor conversion authority and never performs I/O. */
import assert from 'node:assert/strict';
import { previewVaultRedeem } from '../vaults/backed-vault.mjs';

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
