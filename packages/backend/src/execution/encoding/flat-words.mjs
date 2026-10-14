/** Pure ABI word decoding. No runtime, deployment, proof or ownership port. */
import assert from 'node:assert/strict';
export function decodeFlatWords(raw, expected) {
  assert.equal(typeof raw, 'string', 'FLAT_STATE_ABI_ENCODING');
  assert.equal(raw.length, 2 + expected * 64, 'FLAT_STATE_ABI_LENGTH');
  assert.match(raw, /^0x(?:[0-9a-f]{64})*$/, 'FLAT_STATE_ABI_ENCODING');
  return Array.from({ length: expected }, (_, i) => '0x' + raw.slice(2 + 64 * i, 66 + 64 * i));
}
