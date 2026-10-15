/** Fixed field encodings for one isolated component. Hashing is not authority.
 * Native SHA ReceiptCM/K/tag remain separate and byte-identical. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { SCHEMAS, receiptKeyCommitment, terminalReceiptTag } from '../../src/framing.mjs';
import { loadPinned, LIMITS } from './component-tooling.mjs';

export { SCHEMAS, receiptKeyCommitment, terminalReceiptTag };
export const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const PROFILE = BigInt('0x' + Buffer.from('LIANUM_PAEG_P2_V1', 'ascii').toString('hex'));
export const PURPOSES = Object.freeze({ domain: 1, core: 2, local: 3, completion: 4,
  evidence: 5, revoked: 6, authorizationLeaf: 7, receiptLeaf: 8, empty: 9, node: 10 });
const COUNTS = Object.freeze({ 1: 14, 2: 12, 3: 33, 4: 18, 5: 10, 6: 133, 7: 2, 8: 4, 9: 2, 10: 5 });
const ZERO = '0'.repeat(64);
const STATE_NAMES = ['hubDomain', 'registryCommitment', 'receiptRoot', 'receiptCount',
  'revokedDigest', 'revokedCount', 'revocationSequence'];

function exact(record, names) {
  assert.ok(record && typeof record === 'object' && !types.isProxy(record)
    && Object.getPrototypeOf(record) === Object.prototype, 'P2_PLAIN_RECORD');
  assert.deepEqual(Reflect.ownKeys(record).sort(), [...names].sort(), 'P2_EXACT_FIELDS');
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(record, name);
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
      'P2_DATA_PROPERTIES');
  }
}
function fixedArray(value, length) {
  assert.ok(Array.isArray(value) && !types.isProxy(value)
    && Object.getPrototypeOf(value) === Array.prototype && value.length === length,
  'P2_FIXED_ARRAY');
  assert.equal(Reflect.ownKeys(value).length, length + 1, 'P2_ARRAY_PROPERTIES');
  for (let i = 0; i < length; i++)
    assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value'), 'P2_DENSE_ARRAY');
}
export function digestBytes(value, nonzero = false) {
  assert.equal(typeof value, 'string', 'P2_HEX_STRING');
  assert.equal(value.length, 64, 'P2_HEX_LENGTH');
  assert.match(value, /^[0-9a-f]{64}$/, 'P2_CANONICAL_HEX');
  assert.ok(!nonzero || value !== ZERO, 'P2_NONZERO_DIGEST');
  return Buffer.from(value, 'hex');
}
export function digestLimbs(value, nonzero = false) {
  const bytes = digestBytes(value, nonzero);
  return [BigInt('0x' + bytes.subarray(0, 16).toString('hex')),
    BigInt('0x' + bytes.subarray(16).toString('hex'))];
}
export function canonicalField(value, nonzero = false) {
  const bytes = digestBytes(value, nonzero);
  const number = BigInt('0x' + bytes.toString('hex'));
  assert.ok(number < FIELD_MODULUS, 'P2_FIELD_RANGE');
  return number;
}
export function uint(value, width) {
  assert.equal(typeof value, 'string', 'P2_UINT_STRING');
  assert.ok(value.length <= 39 && /^(0|[1-9][0-9]*)$/.test(value), 'P2_CANONICAL_UINT');
  const number = BigInt(value);
  assert.equal(number.toString(), value, 'P2_UINT_ROUNDTRIP');
  assert.ok(number < (1n << BigInt(width)), 'P2_UINT_RANGE');
  return number;
}
function bool(value) { assert.equal(typeof value, 'boolean', 'P2_BOOLEAN'); return value ? 1n : 0n; }
function schema(schema, record) {
  exact(record, schema.map(([name]) => name));
  return schema.flatMap(([name, type]) => {
    if (type === 'digest') return digestLimbs(record[name]);
    if (type === 'bool') return [bool(record[name])];
    if (type === 'slot') { const slot = uint(record[name], 8); assert.ok(slot < 4n); return [slot]; }
    assert.equal(type, 'u64', 'P2_FIXED_SCHEMA_TYPE');
    return [uint(record[name], 64)];
  });
}
function treeKind(value) {
  assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 2,
    'P2_TREE_KIND');
  return value;
}
const depthFor = kind => treeKind(kind) === 1 ? 4 : 6;
const fieldBuffer = value => Buffer.from(value.toString(16).padStart(64, '0'), 'hex');

export async function createFraming() {
  const bb = await loadPinned('@aztec/bb.js');
  const api = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
    skipSrsInit: true, memory: { initial: 37, maximum: LIMITS.maximumPages } });
  let destroyed = false;
  async function hash(purpose, payload) {
    assert.ok(!destroyed, 'P2_HELPER_CLOSED');
    assert.equal(payload.length, COUNTS[purpose], 'P2_COMPLETE_SCHEMA_LENGTH');
    const fields = [PROFILE, 1n, BigInt(purpose), BigInt(payload.length), ...payload];
    for (const field of fields)
      assert.ok(typeof field === 'bigint' && field >= 0n && field < FIELD_MODULUS, 'P2_INPUT_FIELD_RANGE');
    const response = await api.poseidon2Hash({ inputs: fields.map(fieldBuffer) });
    const bytes = Buffer.from(response.hash);
    assert.equal(bytes.length, 32, 'P2_HASH_BYTES');
    const encoded = bytes.toString('hex'); canonicalField(encoded);
    return encoded;
  }
  const domainCommitment = domain => {
    const payload = schema(SCHEMAS.domain, domain);
    for (const value of Object.values(domain)) digestBytes(value, true);
    return hash(PURPOSES.domain, payload);
  };
  const coreLeaf = input => {
    exact(input, ['domain', 'payload', 'blind']);
    const fields = schema(SCHEMAS.core, input.payload);
    assert.ok(uint(input.payload.settleBefore, 64) > 0n, 'P2_CUTOFF');
    return hash(PURPOSES.core, [canonicalField(input.domain, true), 0n, 0n,
      ...digestLimbs(input.blind, true), ...fields]);
  };
  const localLeaf = input => {
    exact(input, ['domain', 'payload', 'blind']);
    const fields = schema(SCHEMAS.local, input.payload);
    return hash(PURPOSES.local, [canonicalField(input.domain, true), 4n + uint(input.payload.slot, 8),
      4n, ...digestLimbs(input.blind, true), ...fields]);
  };
  const completionOpeningCommitment = input => {
    exact(input, ['domain', 'envelope', 'statement', 'blind']);
    const statement = input.statement; schema(SCHEMAS.completion, statement);
    assert.ok(uint(statement.validFrom, 64) < uint(statement.validUntil, 64), 'P2_WINDOW');
    return hash(PURPOSES.completion, [canonicalField(input.domain, true), canonicalField(input.envelope, true),
      ...digestLimbs(input.blind, true), ...digestLimbs(statement.hubDomain),
      ...digestLimbs(statement.registryCommitment), canonicalField(statement.evidenceState),
      ...digestLimbs(statement.context), ...digestLimbs(statement.payoutCommitment),
      ...digestLimbs(statement.terminalReceiptTag), uint(statement.slot, 8),
      uint(statement.validFrom, 64), uint(statement.validUntil, 64)]);
  };
  const revocationDigest = input => {
    exact(input, ['domain', 'hub', 'entries', 'count']); fixedArray(input.entries, 64);
    const count = uint(input.count, 32); assert.ok(count <= 64n, 'P2_VECTOR_BOUND');
    // Encoding only: duplicate/padding truth is constrained in Noir. Keeping
    // this raw codec permits coherent adversarial fixtures to reach that layer.
    return hash(PURPOSES.revoked, [canonicalField(input.domain, true), 0x32n,
      ...digestLimbs(input.hub), count, ...input.entries.flatMap(value => digestLimbs(value))]);
  };
  const evidenceDigest = input => {
    exact(input, ['domain', 'state']); exact(input.state, STATE_NAMES);
    const state = input.state, count = uint(state.receiptCount, 32), revoked = uint(state.revokedCount, 32);
    assert.ok(count <= 64n && revoked <= 64n, 'P2_STATE_BOUNDS');
    return hash(PURPOSES.evidence, [canonicalField(input.domain, true), ...digestLimbs(state.hubDomain),
      ...digestLimbs(state.registryCommitment), canonicalField(state.receiptRoot), count,
      canonicalField(state.revokedDigest), revoked, uint(state.revocationSequence, 64)]);
  };
  const authorizationLeaf = input => {
    exact(input, ['domain', 'envelope']);
    return hash(PURPOSES.authorizationLeaf, [canonicalField(input.domain, true), canonicalField(input.envelope, true)]);
  };
  const receiptLeaf = input => {
    exact(input, ['domain', 'receiptCommitment']);
    return hash(PURPOSES.receiptLeaf, [canonicalField(input.domain, true), 2n,
      ...digestLimbs(input.receiptCommitment, true)]);
  };
  const emptyLeaf = input => {
    exact(input, ['domain', 'treeKind']);
    return hash(PURPOSES.empty, [canonicalField(input.domain, true), BigInt(treeKind(input.treeKind))]);
  };
  const nodeHash = input => {
    exact(input, ['domain', 'treeKind', 'level', 'left', 'right']);
    const kind = treeKind(input.treeKind), depth = depthFor(kind);
    assert.ok(Number.isSafeInteger(input.level) && input.level >= 1 && input.level <= depth, 'P2_TREE_LEVEL');
    return hash(PURPOSES.node, [canonicalField(input.domain, true), BigInt(kind), BigInt(input.level),
      canonicalField(input.left), canonicalField(input.right)]);
  };
  const merkle = async input => {
    exact(input, ['domain', 'treeKind', 'leaves']);
    canonicalField(input.domain, true);
    const kind = treeKind(input.treeKind), depth = depthFor(kind), capacity = 2 ** depth;
    fixedArray(input.leaves, input.leaves.length); assert.ok(input.leaves.length <= capacity, 'P2_TREE_CAPACITY');
    for (const leaf of input.leaves) canonicalField(leaf);
    const leaves = [...input.leaves], empty = await emptyLeaf({ domain: input.domain, treeKind: kind });
    const nodes = Array(capacity * 2).fill(empty);
    leaves.forEach((leaf, index) => { nodes[capacity + index] = leaf; });
    for (let index = capacity - 1; index >= 1; index--) {
      nodes[index] = await nodeHash({ domain: input.domain, treeKind: kind,
        level: depth - Math.floor(Math.log2(index)), left: nodes[index * 2], right: nodes[index * 2 + 1] });
    }
    return Object.freeze({ root: nodes[1], path(index) {
      assert.ok(Number.isSafeInteger(index) && !Object.is(index, -0) && index >= 0 && index < leaves.length,
        'P2_PATH_INDEX');
      const siblings = [];
      for (let node = capacity + index; node > 1; node >>= 1) siblings.push(nodes[node ^ 1]);
      return Object.freeze({ index, leaf: leaves[index], siblings: Object.freeze(siblings) });
    } });
  };
  return Object.freeze({ domainCommitment, coreLeaf, localLeaf, completionOpeningCommitment,
    revocationDigest, evidenceDigest, authorizationLeaf, receiptLeaf, emptyLeaf, nodeHash, merkle,
    async destroy() { if (!destroyed) { destroyed = true; await api.destroy(); } } });
}
