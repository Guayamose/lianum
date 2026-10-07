/** Native graph-only wallet ownership. No legacy-system admission, brand proxy,
 * raw system facade or caller-supplied assertion is accepted. */
import assert from 'node:assert/strict';
import { assertOwnedNativeValueSystem, NATIVE_VALUE_SYSTEM_PROFILE } from './native-value-system-v2.mjs';
import { assertNativeValueRegistrations } from './native-value-registry-v2.mjs';
export function assertOwnedNativeValueWalletSystem(runtime, system) {
  assertOwnedNativeValueSystem(runtime, system);
  assert.equal(system.profile, NATIVE_VALUE_SYSTEM_PROFILE, 'NATIVE_VALUE_WALLET_PROFILE');
  assert.equal(system.claimsEnabled, false, 'NATIVE_VALUE_WALLET_GRAPH_ONLY');
  assert.ok(Object.isFrozen(system), 'NATIVE_VALUE_WALLET_FROZEN_DEPLOYMENT');
  assertNativeValueRegistrations({ registry: system.registry, profiles: system.adapterProfiles });
}
