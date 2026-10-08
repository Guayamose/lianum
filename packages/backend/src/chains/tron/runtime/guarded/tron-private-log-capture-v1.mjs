/** Private diagnostic prefix only. Fixed memory bound, no runtime capability. */
import assert from 'node:assert/strict';
export const TRON_PRIVATE_LOG_PREFIX_BYTES = 1_048_576;
export function createTronPrivateLogCapture() {
  assert.equal(arguments.length, 0);
  const prefix = Buffer.alloc(TRON_PRIVATE_LOG_PREFIX_BYTES); let used = 0, observedBytes = 0;
  return Object.freeze({
    append(bytes) {
      assert.ok(Buffer.isBuffer(bytes));
      observedBytes = Math.min(Number.MAX_SAFE_INTEGER, observedBytes + bytes.length);
      const length = Math.min(prefix.length - used, bytes.length);
      if (length) { bytes.copy(prefix, used, 0, length); used += length; }
      return observedBytes > prefix.length;
    },
    snapshot() { return { bytes: Buffer.from(prefix.subarray(0, used)), metadata: {
      retainedBytes: used, observedBytes, truncated: observedBytes > prefix.length } }; },
  });
}
