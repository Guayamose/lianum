/** Only deterministic public Poseidon2Domains hashes, never RPC observations.
 * Callers must authenticate the exact facade/code at their captured block before
 * invoking this helper and must retain their final canonical/current checks.
 * Completed keys are SHA-256 of the complete canonical method/ABI inputs; no
 * roots, vectors, snapshots, certificates or witnesses are retained as values. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, fixedArray, canonicalField } from './commitments.mjs';
import { canonical } from '../../../../../omnichain-product/src/privacy.mjs';
const scopes = new WeakMap();
export const FLAT_PURE_MATH_LIMITS = Object.freeze({ entries: 2048, pending: 256, inFlight: 32, argumentBytes: 8192 });
const EVIDENCE = Object.freeze(['hubDomain', 'registryCommitment', 'receiptRoot', 'receiptCount', 'revokedDigest', 'revokedCount', 'revocationSequence']);
const SCHEMAS = Object.freeze({
  'domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)': ['b32','b32','b32','b32','b32','b32','b32'],
  'emptyLeaf(uint256,uint256)': ['uint','uint'],
  'nodeHash(uint256,uint256,uint256,uint256,uint256)': ['uint','uint','uint','uint','uint'],
  'authorizationLeaf(uint256,uint256)': ['uint','uint'],
  'revokedDigest(uint256,bytes32,bytes32[64],uint256)': ['uint','b32','vector','uint'],
  'evidenceState(uint256,(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256))': ['uint','evidence'],
  'admissionRevocationState(uint256,uint256,uint256,uint256)': ['uint','uint','uint','uint'],
});
const PINS = Object.freeze(['source', 'contractName', 'address', 'codeHash', 'expectedCode']);
function publicValue(type, value) {
  if (type === 'b32') {
    assert.ok(typeof value === 'string' && value.length === 66 && /^0x[0-9a-f]{64}$/.test(value), 'FLAT_PURE_HASH_B32'); return value;
  }
  if (type === 'uint') {
    assert.ok((typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0))
      || (typeof value === 'string' && value.length <= 78
        && /^(?:0|[1-9][0-9]*|0x[0-9a-f]{1,64})$/.exec(value)?.[0] === value), 'FLAT_PURE_HASH_UINT');
    const number = BigInt(value); assert.ok(number >= 0n && number < 1n << 256n, 'FLAT_PURE_HASH_UINT_RANGE'); return number.toString();
  }
  if (type === 'vector') { fixedArray(value, 64); return Object.freeze(value.map(v => publicValue('b32', v))); }
  assert.equal(type, 'evidence'); exactRecord(value, EVIDENCE);
  return Object.freeze(Object.fromEntries(EVIDENCE.map((name, i) => [name, publicValue(i < 2 ? 'b32' : 'uint', value[name])])));
}
function scope(facade) {
  assert.ok(facade && typeof facade === 'object' && Object.isFrozen(facade), 'FLAT_PURE_HASH_IMMUTABLE_FACADE');
  const call = Object.getOwnPropertyDescriptor(facade, 'call');
  assert.ok(call && Object.hasOwn(call, 'value') && typeof call.value === 'function', 'FLAT_PURE_HASH_FIXED_CALL');
  const pins = PINS.map(name => {
    const descriptor = Object.getOwnPropertyDescriptor(facade, name);
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string', 'FLAT_PURE_HASH_FIXED_PIN');
    return descriptor.value;
  });
  assert.equal(pins[0], 'crypto/Poseidon2Domains.sol', 'FLAT_PURE_HASH_SOURCE');
  assert.equal(pins[1], 'Poseidon2Domains', 'FLAT_PURE_HASH_CONTRACT');
  let state = scopes.get(facade);
  if (!state) { state = { call: call.value, pins, values: new Map(), pending: new Map(), queue: [], active: 0, generation: 0 };
    scopes.set(facade, state); }
  assert.equal(state.call, call.value, 'FLAT_PURE_HASH_CALL_CHANGED'); assert.deepEqual(state.pins, pins, 'FLAT_PURE_HASH_PINS_CHANGED');
  return state;
}
function pump(facade, state) {
  while (state.active < FLAT_PURE_MATH_LIMITS.inFlight && state.queue.length) {
    const entry = state.queue.shift(); state.active++;
    Promise.resolve().then(async () => {
      try {
        const raw = await Reflect.apply(state.call, facade, [entry.signature, entry.args, entry.at]);
        assert.ok(typeof raw === 'string' && raw.length === 66 && /^0x[0-9a-f]{64}$/.test(raw), 'FLAT_PURE_HASH_ABI_RESULT');
        const result = raw.slice(2); canonicalField(result);
        if (state.pending.get(entry.pendingKey) === entry) state.pending.delete(entry.pendingKey);
        if (entry.generation === state.generation) {
          state.values.delete(entry.key); state.values.set(entry.key, result);
          while (state.values.size + state.pending.size > FLAT_PURE_MATH_LIMITS.entries)
            state.values.delete(state.values.keys().next().value);
        }
        return result;
      } finally {
        // Evict failed/in-flight state before callers observe completion, and
        // never let an older operation remove a later attempt's entry.
        if (state.pending.get(entry.pendingKey) === entry) state.pending.delete(entry.pendingKey);
        entry.args = null; state.active--; pump(facade, state);
      }
    }).then(entry.resolve, entry.reject);
  }
}
async function memoized(facade, at, signature, args, generation) {
  const state = scope(facade);
  assert.equal(state.generation, generation, 'FLAT_PURE_HASH_READ_INVALIDATED');
  assert.ok(typeof at === 'string' && at.length <= 18 && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.exec(at)?.[0] === at, 'FLAT_PURE_HASH_BLOCK');
  assert.ok(Object.hasOwn(SCHEMAS, signature), 'FLAT_PURE_HASH_METHOD');
  const schema = SCHEMAS[signature]; fixedArray(args, schema.length);
  const copied = Object.freeze(schema.map((type, i) => publicValue(type, args[i])));
  const encoded = canonical([signature, copied]); assert.ok(Buffer.byteLength(encoded) <= FLAT_PURE_MATH_LIMITS.argumentBytes, 'FLAT_PURE_HASH_ARGUMENT_BOUND');
  const key = createHash('sha256').update('FLAT_PINNED_PUBLIC_PURE_HASH_V1\0').update(encoded).digest('hex');
  if (state.values.has(key)) { const result = state.values.get(key); state.values.delete(key); state.values.set(key, result); return result; }
  const pendingKey = state.generation + ':' + key, existing = state.pending.get(pendingKey);
  if (existing) return existing.promise;
  assert.ok(state.pending.size < FLAT_PURE_MATH_LIMITS.pending, 'FLAT_PURE_HASH_PENDING_BOUND');
  while (state.values.size + state.pending.size >= FLAT_PURE_MATH_LIMITS.entries)
    state.values.delete(state.values.keys().next().value);
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const entry = { key, pendingKey, signature, args: copied, at, generation: state.generation, promise, resolve, reject };
  state.pending.set(pendingKey, entry); state.queue.push(entry); pump(facade, state); return promise;
}
/** Capture once per surrounding fixed-head reconstruction. Later branches
 * from an invalidated read cannot silently acquire a fresh cache generation. */
export function createFlatPureMathLease(facade, at) {
  const generation = scope(facade).generation;
  return Object.freeze((signature, args) => memoized(facade, at, signature, args, generation));
}
/** Pure helper seam. Production creates one shared lease per complete read. */
export async function memoizedFlatPureHash(facade, at, signature, args) {
  return createFlatPureMathLease(facade, at)(signature, args);
}
/** A surrounding read which fails code/head/reconstruction validation cannot
 * seed a later read. Already queued calls may finish for their current callers,
 * but this generation fence prevents their results repopulating the cache. */
export function discardFlatPureMathCache(facade) {
  const state = scopes.get(facade); if (!state) return;
  state.values.clear(); state.generation++;
}
