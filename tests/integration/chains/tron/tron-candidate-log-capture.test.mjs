import assert from 'node:assert/strict';
import test from 'node:test';
import { createTronPrivateLogCapture, TRON_PRIVATE_LOG_PREFIX_BYTES } from './tron-candidate-log-capture.mjs';
test('private logs retain only the first MiB while counting and marking later fatal output', () => {
  const capture = createTronPrivateLogCapture(), prefix = Buffer.alloc(TRON_PRIVATE_LOG_PREFIX_BYTES, 0x61);
  assert.equal(capture.append(prefix.subarray(0, prefix.length - 1)), false);
  assert.equal(capture.snapshot().metadata.truncated, false);
  assert.equal(capture.append(Buffer.from('bc')), true);
  for (let count = 0; count < 2000; count++) capture.append(prefix);
  const retained = capture.snapshot(); assert.equal(retained.bytes.length, prefix.length);
  assert.equal(retained.bytes.at(-1), 0x62); assert.ok(retained.bytes.subarray(0, -1).equals(prefix.subarray(0, -1)));
  assert.equal(retained.metadata.truncated, true); assert.equal(retained.metadata.retainedBytes, prefix.length);
  assert.equal(retained.metadata.observedBytes, 2001 * prefix.length + 1);
  retained.bytes.fill(0); assert.equal(capture.snapshot().bytes.at(-1), 0x62);
  assert.throws(() => createTronPrivateLogCapture({ limit: 2 }));
});
