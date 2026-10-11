/** Versioned owner position projection from already authenticated original
 * account/vault reads. Retains ownership when independent valuation is absent. */
import assert from 'node:assert/strict';
import {validateVaultIdentity} from '../vaults/backed-vault.mjs';
import {projectPrivateVaultPosition} from '../vaults/private-vault-position.mjs';
import {validateFlatOwnerReadPayload} from '@lianum/mobile-protocol/wallet/owner-portfolio-contract';
import {validatePositionStateRow} from '@lianum/mobile-protocol/wallet/generation-position-state-v2';
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
export function projectPrivatePositionStateV2({generationId,shareAssetId,underlyingAssetId,identity,portfolioView,vaultView}) {
  const original=validateVaultIdentity(identity);
  const row={generationId,shareAssetId,underlyingAssetId,vault:original.vault,underlyingToken:original.asset,vaultIdentity:original,
    kind:'ERC4626_SHARE',ownership:{status:'UNAVAILABLE',observed:null,balances:null,pendingRequests:null,bucketsAdditive:false},
    valuation:{status:'UNAVAILABLE',availableShares:null,estimatedRedeemableUnderlying:null,observed:null,rounding:'down',
      method:'PINNED_LOCAL_VAULT_PREVIEW_V1',redeemableLiquidityVerified:false,errorCode:'PRIVATE_POSITION_OWNER_UNAVAILABLE'},
    underlyingSpendable:false,privateConversionAccepted:false};
  let share;
  if(portfolioView!==null) {
    validateFlatOwnerReadPayload(portfolioView);
    share=portfolioView.assets.find(asset=>asset.asset.assetId===shareAssetId);
    assert.ok(share,'PRIVATE_POSITION_ORIGINAL_SHARE_REQUIRED');
    if(share.status==='LIVE') {
      for(const amount of Object.values(share.balances))assert.ok(BigInt(amount)<=BigInt(share.backing.held),'PRIVATE_POSITION_NOTE_BACKING');
      row.ownership={status:'LIVE',observed:structuredClone(share.observed),balances:structuredClone(share.balances),
        pendingRequests:structuredClone(share.requests.filter(request=>request.state!=='CONFIRMED')),bucketsAdditive:false};
    } else row.ownership.status=share.status;
  }
  if(row.ownership.status==='LIVE') {
    row.valuation.errorCode=underlyingAssetId===null?'PRIVATE_POSITION_UNDERLYING_UNREGISTERED':'PRIVATE_POSITION_VALUATION_UNAVAILABLE';
    if(underlyingAssetId!==null&&vaultView!==null) {
      try {
        assert.deepEqual(vaultView.identity,original,'PRIVATE_POSITION_VAULT_IDENTITY');
        const value=projectPrivateVaultPosition({portfolioView,vaultView,shareAssetId,underlyingAssetId});
        if(value.status==='LIVE') Object.assign(row.valuation,{status:'LIVE',availableShares:value.availableShares,
          estimatedRedeemableUnderlying:value.estimatedRedeemableUnderlying,observed:structuredClone(share.observed),errorCode:null});
        else Object.assign(row.valuation,{status:'STALE',errorCode:'PRIVATE_POSITION_HEAD_MISMATCH'});
      } catch { /* Ownership remains tied to original notes; valuation stays unknown. */ }
    }
  }
  validatePositionStateRow(row);return frozen(row);
}
