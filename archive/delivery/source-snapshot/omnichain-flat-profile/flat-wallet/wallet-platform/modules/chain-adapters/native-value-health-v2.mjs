/** The new hub retains the exact health/1 frame. Its wrapped registry/domain
 * changes the signed bytes; this verifier never treats a V1 raw root as V2. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray } from '../paeg/commitments.mjs';
import { cloneInput, inputUint } from '../paeg/readiness-inputs.mjs';
import { encodeFlatNativeHealth, FLAT_HEALTH_FIELDS } from './native-health.mjs';
import { registryCommitment } from './generic-native-value-v2.mjs';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier }
  from '../../../../../omnichain-product/src/evidence/native-quorum.mjs';
export { encodeFlatNativeHealth as encodeNativeValueHealth };
export function assertNativeValueHealthAllowed(current) {
  assert.equal(current.halted, '0', 'NATIVE_VALUE_HEALTH_HALTED');
  assert.equal(current.revocationOverflowCount, '0', 'NATIVE_VALUE_HEALTH_OVERFLOW');
  for (const name of ['receiptCount', 'spentTagCount', 'revokedCount'])
    assert.ok(inputUint(current[name], 32, 64n) < 64n, 'NATIVE_VALUE_HEALTH_SATURATED');
}
export function assertNativeValueHealth(raw, current, registry) {
  const permit = cloneInput(raw), expected = cloneInput(current);
  exactRecord(permit, ['message', 'indexes', 'signatures']);
  exactRecord(expected, [...FLAT_HEALTH_FIELDS.slice(0, -2).map(([key]) => key), 'timestamp']);
  assert.equal(expected.registryCommitment, registryCommitment(registry), 'NATIVE_VALUE_HEALTH_WRAPPED_REGISTRY');
  assert.equal(expected.hubDomain, registry.quorum.hubDomain, 'NATIVE_VALUE_HEALTH_HUB');
  const frame = encodeFlatNativeHealth(permit.message); assertNativeValueHealthAllowed(expected);
  for (const [key] of FLAT_HEALTH_FIELDS.slice(0, -2))
    assert.equal(permit.message[key], expected[key], 'NATIVE_VALUE_HEALTH_CURRENT_STATE_CHANGED');
  const from = inputUint(permit.message.validFrom), until = inputUint(permit.message.validUntil), now = inputUint(expected.timestamp);
  assert.ok(from < until && from <= now && now < until && until - from <= 30n, 'NATIVE_VALUE_HEALTH_WINDOW');
  fixedArray(permit.indexes, 3); fixedArray(permit.signatures, 3);
  createNativeQuorumHostVerifier({ registry: registry.quorum,
    expectedRegistryCommitment: nativeQuorumRegistryCommitment(registry.quorum) })
    .assertQuorumForMessage({ messageBytes: frame, indexes: permit.indexes, signatures: permit.signatures });
}
