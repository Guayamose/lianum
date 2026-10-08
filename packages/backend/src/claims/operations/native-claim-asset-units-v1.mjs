/** Presentation from the original sealed system, not family-only asset relabel. */
import assert from 'node:assert/strict';
import {assertOwnedNativeClaimSystem} from '../../operations/deployments/claims/deploy-native-claims.mjs';
import {assertOwnedSolanaSplCustodyV1} from '../../chains/solana/runtime/owned-solana-runtime.mjs';
export function originalNativeClaimAssetUnitsV1(runtime,claims,config){
 assert.equal(arguments.length,3);assertOwnedNativeClaimSystem(runtime,claims);const index=claims.configs.indexOf(config);assert.ok(index===0||index===1,'CLAIM_ASSET_ORIGINAL_CONFIGURATION_REQUIRED');
 if(claims.nativeSplCustodyProfile===true&&index===1){const native=claims.nativeRuntimes[index];assertOwnedSolanaSplCustodyV1(native);assert.equal(config.nativeFamily,'2');assert.equal(config.nativeAsset,native.metadata.asset);return Object.freeze({claimSymbol:'cUSDC',nativeSymbol:'USDC',decimals:6,atomicUnit:'micro-USDC',nativeAssetKind:'SOLANA_SPL_USDC',mint:native.metadata.mint});}
 return Object.freeze(config.nativeFamily==='1'?{claimSymbol:'cBTC',nativeSymbol:'BTC',decimals:8,atomicUnit:'satoshi'}:{claimSymbol:'cSOL',nativeSymbol:'SOL',decimals:9,atomicUnit:'lamport'});
}
