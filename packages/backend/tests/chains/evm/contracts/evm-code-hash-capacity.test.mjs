/** Structural cache-capacity regression. The digest is explicitly mocked;
 * real Keccak correctness stays in evm-code-hash.test.mjs. No timing measured. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
let calls = 0;
mock.module(new URL('../../../../../engine/src/cohorts/private-cohort-public-native.mjs', import.meta.url).href,
  { exports: { publicKeccak256: bytes => { calls++; return createHash('sha256').update(bytes).digest(); } } });
const { evmRuntimeCodeHash, EVM_CODE_HASH_RETAINED_BYTES } = await import('../../../../src/chains/evm/contracts/evm-code-hash.mjs');
function code(bytes, id) {
  const value = Buffer.alloc(bytes); value.writeUInt32BE(id); return '0x' + value.toString('hex');
}
test('synthetic bounded code workload above the previous UTF16 cache budget remains retained across repeated audits', () => {
  // Deterministic stress workload, not a recreated measurement of an old
  // verifier deployment. The cache guard estimates UTF16 strings+metadata;
  // this is not a measurement of peak V8 RAM or serialized UTF8 transport.
  const codes = Array.from({length:36},(_,i)=>code(24576,i+1));
  const encodedBytes=Buffer.byteLength(codes.join(''),'utf16le');
  const utf8Bytes=Buffer.byteLength(codes.join(''),'utf8'),cost=encodedBytes+codes.length*256;
  assert.equal(encodedBytes,utf8Bytes*2);
  assert.ok(cost>2*1024*1024&&cost<EVM_CODE_HASH_RETAINED_BYTES);
  const hashes = codes.map(evmRuntimeCodeHash), coldCalls = calls;
  assert.equal(coldCalls, codes.length);
  assert.deepEqual(codes.map(evmRuntimeCodeHash), hashes);
  assert.deepEqual([...codes].reverse().map(evmRuntimeCodeHash), [...hashes].reverse());
  assert.equal(calls, coldCalls, 'No repeated digest calculation for the entire synthetic working set');
});
test('the enlarged cache still evicts old code when its fixed budget is exceeded', () => {
  const codes = Array.from({ length: 64 }, (_, i) => code(24576, i + 1000));
  codes.forEach(evmRuntimeCodeHash);
  const before = calls;
  evmRuntimeCodeHash(codes.at(-1)); assert.equal(calls, before);
  evmRuntimeCodeHash(codes[0]); assert.equal(calls, before + 1);
});
