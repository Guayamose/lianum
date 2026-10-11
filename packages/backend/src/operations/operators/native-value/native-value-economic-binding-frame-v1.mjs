/** Exact original inventory identity bytes retained inside the native AEAD
 * bootstrap section. This DATA codec cannot issue a token or operator brand. */
import assert from 'node:assert/strict';
import { exactRecord, bytes32 } from '@lianum/components/encoding/commitments';
import { frozenInput } from '@lianum/components/plain-input';
import { sha256 } from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { nativeValueInventoryBinding } from './native-value-inventory-v4.mjs';
const PROFILE = 'ORIGINAL_NATIVE_OPERATOR_BINDING_FRAME_V1';
function frameBytes(frame) {
  exactRecord(frame, ['profile', 'json', 'bindingDigest']); assert.equal(frame.profile, PROFILE);
  assert.equal(typeof frame.json, 'string');
  assert.ok(Buffer.byteLength(frame.json, 'utf8') <= 32768, 'NATIVE_VALUE_RECOVERY_BINDING_FRAME_SIZE');
  bytes32(frame.bindingDigest, true);
  assert.equal(sha256(frame.json), frame.bindingDigest, 'NATIVE_VALUE_RECOVERY_BINDING_FRAME_DIGEST');
  const binding = nativeValueInventoryBinding(JSON.parse(frame.json));
  assert.equal(JSON.stringify(binding), frame.json, 'NATIVE_VALUE_RECOVERY_BINDING_FRAME_EXACT');
  return binding;
}
export function captureNativeValueEconomicBindingFrameV1(binding, bindingDigest) {
  assert.equal(arguments.length, 2); const original = nativeValueInventoryBinding(binding);
  const frame = { profile: PROFILE, json: JSON.stringify(original), bindingDigest };
  frameBytes(frame); return frozenInput(frame);
}
export function restoreNativeValueEconomicBindingFrameV1(frame, observedBinding, bindingDigest) {
  assert.equal(arguments.length, 3); const original = frameBytes(frame);
  bytes32(bindingDigest, true); assert.equal(frame.bindingDigest, bindingDigest, 'NATIVE_VALUE_RECOVERY_ORIGINAL_BINDING_DIGEST');
  assert.deepEqual(original, nativeValueInventoryBinding(observedBinding), 'NATIVE_VALUE_RECOVERY_OBSERVED_BINDING_CHANGED');
  return original;
}
