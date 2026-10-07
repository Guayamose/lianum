/** Structural cache-capacity regression. The digest is explicitly mocked;
 * real Keccak correctness stays in evm-code-hash.test.mjs. No timing measured. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
let calls = 0;
mock.module(new URL('../../../../../omnichain-product/src/private-cohort-public-native.mjs', import.meta.url).href,
  { exports: { publicKeccak256: bytes => { calls++; return createHash('sha256').update(bytes).digest(); } } });
const { evmRuntimeCodeHash, EVM_CODE_HASH_RETAINED_BYTES } = await import('./evm-code-hash.mjs');
const workingSet = JSON.parse(readFileSync(new URL('../../../evidence/native-claim-code-cache-working-set.json', import.meta.url)));
function code(bytes, id) {
  const value = Buffer.alloc(bytes); value.writeUInt32BE(id); return '0x' + value.toString('hex');
}
test('the complete native-claim code set remains cached across repeated full audits', () => {
  const cost = workingSet.entries.reduce((sum, row) => sum + (2 + row.runtimeBytes * 2) * 2 + 256, 0);
  assert.equal(cost, workingSet.retainedCostBytes);
  assert.ok(cost > workingSet.oldLimitBytes && cost < EVM_CODE_HASH_RETAINED_BYTES);
  const codes = workingSet.entries.map((row, i) => code(row.runtimeBytes, i + 1));
  const hashes = codes.map(evmRuntimeCodeHash), coldCalls = calls;
  assert.equal(coldCalls, codes.length);
  assert.deepEqual(codes.map(evmRuntimeCodeHash), hashes);
  assert.deepEqual([...codes].reverse().map(evmRuntimeCodeHash), [...hashes].reverse());
  assert.equal(calls, coldCalls, 'No repeated digest calculation for the fixed full working set');
});
test('the enlarged cache still evicts old code when its fixed budget is exceeded', () => {
  const codes = Array.from({ length: 64 }, (_, i) => code(24576, i + 1000));
  codes.forEach(evmRuntimeCodeHash);
  const before = calls;
  evmRuntimeCodeHash(codes.at(-1)); assert.equal(calls, before);
  evmRuntimeCodeHash(codes[0]); assert.equal(calls, before + 1);
});
