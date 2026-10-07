/** Bounded memoization of a pure byte-string hash, never of an RPC observation.
 * Callers still fetch code at the required block and compare every byte with
 * their independently pinned runtime. Identical bytes have identical Keccak
 * regardless of address, block, chain or freshness; none of those is cached.
 */
import assert from 'node:assert/strict';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';

const MAX_RUNTIME_BYTES = 24_576;
// The 14-verifier claim deployment's distinct public code set costs about
// 2.25 MiB under this conservative string-accounting rule. A 2 MiB cache evicts
// part of it on every audit pass. This process-local bound covers that fixed
// set while preserving all fresh RPC/code comparisons and global RAM guards.
export const EVM_CODE_HASH_RETAINED_BYTES = 4 * 1024 * 1024;
const MAX_RETAINED_BYTES = EVM_CODE_HASH_RETAINED_BYTES;
const digests = new Map();
let retainedBytes = 0;

export function evmRuntimeCodeHash(code) {
  assert.ok(typeof code === 'string' && code.length <= 2 + MAX_RUNTIME_BYTES * 2
    && /^0x(?:[0-9a-f]{2})*$/.exec(code)?.[0] === code, 'EVM_CODE_HASH_CANONICAL_BYTES');
  const retained = digests.get(code);
  if (retained !== undefined) return retained;
  const digest = '0x' + publicKeccak256(Buffer.from(code.slice(2), 'hex')).toString('hex');
  // Bound the retained JavaScript string size, including fixed per-entry slack.
  const cost = code.length * 2 + 256;
  while (retainedBytes + cost > MAX_RETAINED_BYTES) {
    const oldest = digests.keys().next().value;
    retainedBytes -= oldest.length * 2 + 256;
    digests.delete(oldest);
  }
  digests.set(code, digest); retainedBytes += cost;
  return digest;
}

/** A selector is the prefix of the same pure Keccak over immutable ABI text.
 * Share the existing bounded byte-hash cache; never retain method resolution,
 * artifact identity, call arguments, RPC results, heads or observations.
 * Every caller still resolves and validates its current compiler identifier.
 */
export function evmFunctionSelector(signature) {
  assert.equal(typeof signature, 'string', 'EVM_FUNCTION_SIGNATURE');
  const bytes = Buffer.from(signature);
  // Preserve the uncached resolver's behavior even for unusually large ABI text.
  if (bytes.length > MAX_RUNTIME_BYTES) return publicKeccak256(bytes).subarray(0, 4).toString('hex');
  return evmRuntimeCodeHash('0x' + bytes.toString('hex')).slice(2, 10);
}
