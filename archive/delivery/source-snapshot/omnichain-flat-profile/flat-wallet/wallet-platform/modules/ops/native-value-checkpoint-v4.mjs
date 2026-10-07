/** Exact native-value graph-only checkpoint action codec and pure guards.
 * No raw signing interface. The V4 operator owns current views and keys. */
import assert from 'node:assert/strict';
import { checkpointAuthorizationFrame, checkpointAuthorizationDigest, assertCheckpointAuthorizationValid }
  from '../../../../../omnichain-product/src/evidence/native-hub-messages.mjs';
import { exactRecord, bytes32 } from '../paeg/commitments.mjs';
import { cloneInput, frozenInput, inputUint } from '../paeg/readiness-inputs.mjs';
export const NATIVE_VALUE_CHECKPOINT_PROFILE = 'FIXED_NATIVE_VALUE_CHECKPOINT_ACTION_V4';
export const MAX_NATIVE_VALUE_CHECKPOINTS = 64;
export { checkpointAuthorizationFrame, checkpointAuthorizationDigest };
/** DATA parser only. The signer MUST bind this to its own current reader. */
export function nativeValueCheckpointMessage(raw) {
  const v = cloneInput(raw);
  exactRecord(v, ['hubDomain', 'registryCommitment', 'pool', 'poolStateSequence', 'hubStateSequence', 'checkpointCount', 'head', 'requestId']);
  bytes32(v.requestId, true); exactRecord(v.head, ['number', 'hash', 'timestamp']);
  inputUint(v.head.number); inputUint(v.head.timestamp); bytes32(v.head.hash, true);
  const message = { hubDomain: v.hubDomain, registryCommitment: v.registryCommitment, pool: v.pool,
    expectedPoolSequence: v.poolStateSequence, expectedHubStateSequence: v.hubStateSequence,
    requestId: '0x' + v.requestId, validUntil: (inputUint(v.head.timestamp) + 30n).toString() };
  assertNativeValueCheckpointCurrent({ message, head: v.head }, v);
  return frozenInput(message);
}
export function assertNativeValueCheckpointCurrent(retained, raw) {
  const v = cloneInput(raw), row = cloneInput(retained);
  exactRecord(v, ['hubDomain', 'registryCommitment', 'pool', 'poolStateSequence', 'hubStateSequence', 'checkpointCount', 'head', 'requestId']);
  exactRecord(row, ['message', 'head']); bytes32(v.requestId, true);
  assert.deepEqual(row.head, v.head, 'NATIVE_VALUE_CHECKPOINT_ORIGINAL_HEAD_CHANGED');
  assert.equal(row.message.requestId, '0x' + v.requestId, 'NATIVE_VALUE_CHECKPOINT_REQUEST_REBOUND');
  assert.equal(inputUint(row.message.validUntil), inputUint(row.head.timestamp) + 30n, 'NATIVE_VALUE_CHECKPOINT_ORIGINAL_WINDOW_CHANGED');
  assertCheckpointAuthorizationValid(row.message, {
    hubDomain: v.hubDomain, registryCommitment: v.registryCommitment, pool: v.pool,
    poolStateSequence: v.poolStateSequence, hubStateSequence: v.hubStateSequence,
    checkpointCount: v.checkpointCount, timestamp: v.head.timestamp });
  return true;
}
