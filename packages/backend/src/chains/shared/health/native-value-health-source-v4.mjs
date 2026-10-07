/** V4 owned-local source: receiver time only from genuine operator history, independent monotonic I/O deadline. */
/** Closed health-owned source brands; same native-only facts/circuit frames.
 * V2 source constructors cannot promote public retained inclusion to history. */
import assert from 'node:assert/strict';
import { PROFILE_SCHEMA as EVM_SCHEMA } from '../../evm/transfers/evm-native-value-v2.mjs';
import { PROFILE_SCHEMA as TRON_SCHEMA } from '../../tron/transfers/tron-native-graph-profile.mjs';
import { assertOwnedEvmNativeValueHealthObservation } from '../../evm/health/evm-native-value-health-source-v4.mjs';
import { assertOwnedTronNativeValueHealthObservation } from '../../tron/health/tron-native-value-health-source-v4.mjs';
export function assertOwnedNativeValueHealthObservation(value, source, policy) {
  if(policy.profile.schema === EVM_SCHEMA) assertOwnedEvmNativeValueHealthObservation(value, source);
  else { assert.equal(policy.profile.schema, TRON_SCHEMA); assertOwnedTronNativeValueHealthObservation(value, source); }
}
