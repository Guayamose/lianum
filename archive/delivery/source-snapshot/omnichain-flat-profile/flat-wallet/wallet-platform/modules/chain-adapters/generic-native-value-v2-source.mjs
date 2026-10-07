/** Closed, named source-brand union. A copied result or unrelated observer
 * cannot become a trusted native reader by changing a schema/status property. */
import assert from 'node:assert/strict';
import { PROFILE_SCHEMA as EVM_PROFILE } from './evm-native-value-v2.mjs';
import { PROFILE_SCHEMA as TRON_PROFILE } from './tron-native-graph-profile.mjs';
import { assertNativeValueObservation } from './evm-native-value-v2-source.mjs';
import { assertTronGraphSourceObservation } from './tron-native-graph-source.mjs';
export function assertTypedSourceObservation(value, source, policy) {
  if (policy.profile.schema === EVM_PROFILE) assertNativeValueObservation(value, source);
  else { assert.equal(policy.profile.schema, TRON_PROFILE, 'GENERIC_NATIVE_VALUE_SOURCE_PROFILE'); assertTronGraphSourceObservation(value, source); }
}
