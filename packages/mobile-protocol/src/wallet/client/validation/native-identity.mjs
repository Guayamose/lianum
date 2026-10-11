/** Validate and compare the immutable native identity pinned to a wallet session. */
import { record, validId, digest } from './values.mjs';
import { ORIGINAL_SPL_USDC_UNITS_V1 } from '../../contracts/owner-portfolio-contract.mjs';

export const NATIVE_IDENTITY_PROFILE = 'ORIGINAL_NATIVE_CLAIM_SESSION_IDENTITY_V1';

export const WRAPPED_CLAIM_IDENTITY_PROFILE = 'ORIGINAL_WRAPPED_CLAIM_SESSION_IDENTITY_V1';

const nativeIdentityKeys = ['version', 'profile', 'accountId', 'claimDomain', 'nativeFamily', 'nativeGenesis', 'nativeAsset',
  'wrapperAssetIdentity', 'claimSymbol', 'nativeSymbol', 'decimals', 'atomicUnit', 'observation'];

/** Configuration from the authenticated session, never a portfolio asset lookup or a custody observation. */
export function originalNativeIdentity(nativeClaims) {
  const value = nativeClaims?.identity;
  const spl = record(value) && (Object.hasOwn(value, 'nativeAssetKind') || Object.hasOwn(value, 'mint'));
  const identityKeys = spl ? [...nativeIdentityKeys, 'nativeAssetKind', 'mint'] : nativeIdentityKeys;
  if (!record(value) || Object.keys(value).sort().join(',') !== [...identityKeys].sort().join(',')
    || value.version !== 1 || ![NATIVE_IDENTITY_PROFILE, WRAPPED_CLAIM_IDENTITY_PROFILE].includes(value.profile) || !validId(value.accountId)
    || value.observation !== 'ORIGINAL_BOUND_CONFIGURATION_ONLY'
    || !['claimDomain', 'nativeGenesis', 'nativeAsset', 'wrapperAssetIdentity'].every(key => digest(value[key]))
    || value.nativeAsset === value.wrapperAssetIdentity) return null;
  if (spl && (value.profile !== NATIVE_IDENTITY_PROFILE || value.nativeFamily !== '2'
    || value.nativeAssetKind !== ORIGINAL_SPL_USDC_UNITS_V1.nativeAssetKind
    || value.mint !== ORIGINAL_SPL_USDC_UNITS_V1.mint)) return null;
  const family = spl ? ['cUSDC', 'USDC', 6, 'micro-USDC']
    : value.nativeFamily === '1' ? ['cBTC', 'BTC', 8, 'satoshi']
    : value.nativeFamily === '2' ? ['cSOL', 'SOL', 9, 'lamport'] : null;
  if (!family || ['claimSymbol', 'nativeSymbol', 'decimals', 'atomicUnit'].some((key, index) => value[key] !== family[index])) return null;
  for (const key of ['deposits', 'tickets']) if (Array.isArray(nativeClaims.owner?.[key])
    && nativeClaims.owner[key].some(row => !record(row) || row.claimDomain !== value.claimDomain)) return null;
  return Object.fromEntries(identityKeys.map(key => [key, value[key]]));
}

export const sameNativeIdentity = (a, b) => a !== null && b !== null
  && [...nativeIdentityKeys, 'nativeAssetKind', 'mint'].every(key => a[key] === b[key]);
