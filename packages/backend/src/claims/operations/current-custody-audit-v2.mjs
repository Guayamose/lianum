/** Pure full-current-view/accounting join. Native inventories MUST come from
 * independently repeated owned reads before a signer may rely on this result.
 * Supplying a head or passing this function establishes neither provenance nor
 * currentness. The owned combined reader/key factory remains a separate gate. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray, bytes32, ZERO } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from '../../execution/account/preparation/readiness-inputs.mjs';
import { assertClaimAccounting } from './owned-state.mjs';
import { auditClaimGateway, auditClaimNativeInventory, assertClaimHealthState } from './backing-audit.mjs';
import { nativeClaimEndpointCommitment } from '@lianum/engine/claims/framing';
import { validateWrappedClaimOperationalRegistration } from '../ingress/operational-registration-v2.mjs';
import { FLAT_HEALTH_FIELDS } from '../../chains/shared/health/native-health.mjs';

export function auditWrappedClaimCurrentState(raw) {
  const data = cloneInput(raw); exactRecord(data, ['registration', 'head', 'hubStateSequence', 'gateways', 'inventories']);
  const registration = validateWrappedClaimOperationalRegistration(data.registration);
  exactRecord(data.head, ['number', 'hash', 'timestamp']); inputUint(data.head.number); inputUint(data.head.timestamp); bytes32(data.head.hash, true);
  inputUint(data.hubStateSequence); fixedArray(data.gateways, 2); fixedArray(data.inventories, 2);
  const financials = registration.claims.map((claim, i) => {
    const { config, claimDomain } = claim, gateway = data.gateways[i], native = data.inventories[i];
    exactRecord(native, ['claimDomain', 'roles', 'syntheticPrefunding', 'nonceBootstrapPins', 'inventory']);
    assert.equal(native.claimDomain, claimDomain, 'WRAPPED_CLAIM_CURRENT_INVENTORY_DOMAIN');
    assert.equal(gateway.claimDomain, claimDomain, 'WRAPPED_CLAIM_CURRENT_GATEWAY_ORDER');
    exactRecord(native.roles, ['depositor', 'escrow', 'recipient']);
    assert.equal(new Set(Object.values(native.roles).map(role => role.endpoint)).size, 3, 'WRAPPED_CLAIM_CURRENT_DISTINCT_NATIVE_ROLES');
    assert.equal(nativeClaimEndpointCommitment({ family: config.nativeFamily, genesis: config.nativeGenesis,
      asset: config.nativeAsset, endpoint: native.roles.escrow.endpoint }), config.escrowEndpointCommitment, 'WRAPPED_CLAIM_CURRENT_ORIGINAL_ESCROW');
    assert.deepEqual(native.inventory.syntheticPrefunding, native.syntheticPrefunding, 'WRAPPED_CLAIM_CURRENT_FUNDING_PIN');
    assertClaimAccounting(gateway, config); assertClaimHealthState(gateway);
    const liabilities = auditClaimGateway(gateway, config);
    if (config.nativeFamily === '2') {
      // This prospective operational profile inherits accepted nonce-ingress-V3.
      // Both original depositor and escrow nonce bootstrap records are mandatory;
      // no recent-blockhash or escrow-only legacy inventory fallback is allowed.
      assert.ok(native.nonceBootstrapPins !== null, 'WRAPPED_CLAIM_CURRENT_NONCE_V3_BOOTSTRAP_REQUIRED');
      exactRecord(native.nonceBootstrapPins, ['depositor', 'escrow']);
      assert.ok(Object.hasOwn(native.inventory, 'nonceInfrastructureByAuthority'), 'WRAPPED_CLAIM_CURRENT_NONCE_V3_INVENTORY_REQUIRED');
      assert.ok(!Object.hasOwn(native.inventory, 'nonceInfrastructure'), 'WRAPPED_CLAIM_CURRENT_NO_LEGACY_NONCE_FALLBACK');
    } else assert.equal(native.nonceBootstrapPins, null, 'WRAPPED_CLAIM_CURRENT_BTC_NO_NONCE_PROFILE');
    const backing = auditClaimNativeInventory(native.inventory, config, native.roles, native.nonceBootstrapPins);
    // No graph/native-value result or success certificate can appear in either
    // currency's inventory or be added to these original escrow principal sums.
    assert.ok(BigInt(backing.nativePrincipalAvailable) >= BigInt(liabilities.liabilities), 'WRAPPED_CLAIM_CURRENT_PRINCIPAL_DEFICIT');
    assert.ok(BigInt(backing.feeReserveAvailable) >= BigInt(liabilities.reservedFees), 'WRAPPED_CLAIM_CURRENT_FEE_RESERVE_DEFICIT');
    assert.equal(gateway.activePayout, ZERO, 'WRAPPED_CLAIM_CURRENT_OUTGOING_FENCE');
    const health = gateway.healthState;
    exactRecord(health, FLAT_HEALTH_FIELDS.slice(0, -2).map(([key]) => key));
    assert.equal(health.pool, config.pool, 'WRAPPED_CLAIM_CURRENT_HEALTH_POOL');
    assert.equal(health.domain, config.poolDomain, 'WRAPPED_CLAIM_CURRENT_HEALTH_DOMAIN');
    assert.equal(health.hubDomain, config.hubDomain, 'WRAPPED_CLAIM_CURRENT_HEALTH_HUB');
    assert.equal(health.registryCommitment, config.registryCommitment, 'WRAPPED_CLAIM_CURRENT_HEALTH_REGISTRY');
    assert.equal(health.stateSequence, data.hubStateSequence, 'WRAPPED_CLAIM_CURRENT_HEALTH_SEQUENCE');
    return { claimDomain, ...liabilities, ...backing };
  });
  return frozenInput({ profile: registration.profile, head: data.head, hubStateSequence: data.hubStateSequence,
    financials, authorityGranted: false });
}
