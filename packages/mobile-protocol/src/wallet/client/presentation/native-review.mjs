/** Format exact atomic units and native review details without changing balances. */
import { ORIGINAL_SPL_USDC_UNITS_V1 } from '../../contracts/owner-portfolio-contract.mjs';
import { originalNativeIdentity } from '../validation/native-identity.mjs';
import { atomic } from '../validation/values.mjs';

export function nativeIdentityDetails(identity) {
  if (!identity) return [['Identidad de la sesión', 'No disponible; no se infiere del portafolio']];
  return [['Activo vinculado', `${identity.claimSymbol} / ${identity.nativeSymbol}`],
    ['Unidad atómica', `${identity.atomicUnit} · ${identity.decimals} decimales`],
    ...(identity.nativeAssetKind === ORIGINAL_SPL_USDC_UNITS_V1.nativeAssetKind ? [
      ['Mint SPL vinculado', identity.mint], ['Comisión separada', 'SOL · lamport · 9 decimales; no forma parte del principal USDC'],
    ] : []), ['Cuenta original', identity.accountId],
    ['Dominio completo', identity.claimDomain], ['Génesis nativo', identity.nativeGenesis],
    ['Identidad nativa', identity.nativeAsset], ['Identidad wrapper (no assetId)', identity.wrapperAssetIdentity],
    ['Observación', 'Solo configuración original; no acredita custodia actual ni saldo gastable']];
}

export function nativeAmountDetails(action, body, nativeClaims) {
  const identity = originalNativeIdentity(nativeClaims);
  if (!identity) return [];
  const value = (amount, symbol) => atomic(amount) === null ? 'No disponible; no equivale a cero'
    : `${amount} ${identity.atomicUnit} · ${displayUnits(amount, identity.decimals)} ${symbol} (exacto)`;
  if (action === 'redeem') return [['Importe del claim', value(body.amount, identity.claimSymbol)],
    ['Comisión máxima nativa', identity.nativeAssetKind === ORIGINAL_SPL_USDC_UNITS_V1.nativeAssetKind
      ? atomic(body.maxFee) === null ? 'No disponible; no equivale a cero'
        : `${body.maxFee} lamport · ${displayUnits(body.maxFee, 9)} SOL (exacto)`
      : value(body.maxFee, identity.nativeSymbol)]];
  if (action === 'deposit' || action === 'refund') {
    const intent = Array.isArray(nativeClaims.owner?.deposits) ? nativeClaims.owner.deposits.find(row => row.intentId === body.intentId) : null;
    return [['Importe del intent original', value(intent?.amount, identity.nativeSymbol)]];
  }
  return [];
}

export function displayUnits(value, decimals) {
  if (atomic(value) === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const padded = value.padStart(decimals + 1, '0');
  if (decimals === 0) return padded;
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return padded.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}
