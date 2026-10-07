/** Original combined deployment only. It never imports or relabels graph-only
 * or historical flat-system authority, old notes, handoffs or pending state. */
import assert from 'node:assert/strict';
import { assertOwnedWrappedClaimGraphSystem, assertOwnedWrappedClaimSystem, WRAPPED_CLAIM_SYSTEM_PROFILE_V1 } from './wrapped-claim-system-v1.mjs';
import { validateWrappedClaimOperationalRegistration } from '../native-claims/operational-registration-v2.mjs';
export function assertOwnedWrappedClaimWalletSystemV1(runtime, system) {
  assertOwnedWrappedClaimGraphSystem(runtime,system);assertOwnedWrappedClaimSystem(runtime,system.claims);
  assert.equal(system.profile,WRAPPED_CLAIM_SYSTEM_PROFILE_V1);assert.equal(system.claimsEnabled,true);
  assert.ok(Object.isFrozen(system));validateWrappedClaimOperationalRegistration(system.custodyRegistration);
}
