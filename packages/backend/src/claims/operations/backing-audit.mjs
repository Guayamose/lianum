/** Fixed dispatch between ordinary, SPL and dual-nonce claim audits.
 * Arithmetic lives below this composition boundary and imports no dispatcher.
 * These checks consume records; they grant no custody, signer or runtime brand. */
import assert from 'node:assert/strict';
import {OWNED_NATIVE_SPL_INVENTORY_PROFILE_V1, auditNativeSplClaimInventoryV1}
  from './native-spl-backing-audit-v1.mjs';
import {auditDualNonceInventory, auditNonceIngressPreparation} from '../ingress/ingress-v3-host.mjs';
import {auditClaimIngressPreparationBase, auditClaimStandardNativeInventory} from './claim-backing-arithmetic.mjs';
export {CLAIM_LIFETIME_LIMITS, claimEconomicInventory, auditClaimPayoutPreparation,
  auditClaimGateway, assertClaimHealthState, assertClaimRoute} from './claim-backing-arithmetic.mjs';

export function auditClaimIngressPreparation({gateway, config, intentId, prepared: raw, wireSalt, roles, timestamp, infrastructure = null}) {
  if (config.nativeFamily === '2' && Object.hasOwn(raw.intent, 'nonceAccountPublicKey'))
    return auditNonceIngressPreparation({gateway, config, intentId, prepared: raw, wireSalt, roles, timestamp, infrastructure});
  return auditClaimIngressPreparationBase({gateway, config, intentId, prepared: raw, wireSalt, roles, timestamp, infrastructure});
}

export function auditClaimNativeInventory(raw, config, roles, bootstrapPins = null) {
  if (raw.profile === OWNED_NATIVE_SPL_INVENTORY_PROFILE_V1) return auditNativeSplClaimInventoryV1(raw, config, roles);
  if (config.nativeFamily === '2' && Object.hasOwn(raw, 'nonceInfrastructureByAuthority')) {
    assert.ok(bootstrapPins, 'CLAIM_V3_ORIGINAL_BOOTSTRAP_PINS_REQUIRED');
    return auditDualNonceInventory(raw, config, roles, bootstrapPins);
  }
  return auditClaimStandardNativeInventory(raw, config, roles);
}
