/** Closed health-owned source brands; same native-only facts/circuit frames.
 * V2 source constructors cannot promote public retained inclusion to history. */
import assert from 'node:assert/strict';
import { PROFILE_SCHEMA as EVM_SCHEMA } from './evm-native-value-v2.mjs';
import { PROFILE_SCHEMA as TRON_SCHEMA } from './tron-native-graph-profile.mjs';
import { assertOwnedEvmNativeValueHealthObservation } from './evm-native-value-health-source-v3.mjs';
import { assertOwnedTronNativeValueHealthObservation } from './tron-native-value-health-source-v3.mjs';
export function assertOwnedNativeValueHealthObservation(value, source, policy) {
  if(policy.profile.schema === EVM_SCHEMA) assertOwnedEvmNativeValueHealthObservation(value, source);
  else { assert.equal(policy.profile.schema, TRON_SCHEMA); assertOwnedTronNativeValueHealthObservation(value, source); }
}
