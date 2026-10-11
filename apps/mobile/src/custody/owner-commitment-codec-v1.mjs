// SPDX-License-Identifier: Apache-2.0
/** Exact original owner PAEG field schemas/header/tree encodings using the
 * fixed portable Poseidon2. No callback, Node import, JSON witness or authority.
 * Public byte digests remain two 16-byte limbs; field digests stay canonical.
 * Plain data validation is not a backend realm/WeakMap authentication check. */
import { PORTABLE_POSEIDON2_MODULUS_V1 as FIELD_MODULUS,
  portablePoseidon2HexV1 } from '@lianum/crypto/portable-poseidon2';
const failed = code => { throw new Error(code); };
const assert = Object.freeze({
  ok(value, code) { if (!value) failed(code); },
  equal(left, right, code) { if (left !== right) failed(code); },
  notEqual(left, right, code) { if (left === right) failed(code); },
  match(value, pattern, code) { if (typeof value !== 'string' || !pattern.test(value)) failed(code); },
  deepEqual(left, right, code) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length
      || left.some((value, i) => value !== right[i])) failed(code);
  },
});
export const PROFILE_FIELD = 0x4c49414e554d5f504145475f50325f5631n;
const ZERO = '0'.repeat(64);
const b32s = names => names.map(name => [name, 'bytes32']);
const arrayOf = (type, length) => ['array', type, length];
const recordOf = name => ['record', name];
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const SCHEMAS = freeze({
  domain: b32s(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace']),
  core: [...b32s(['context', 'reserveCommitment', 'reserveNullifier']), ['settleBefore', 'u64']],
  local: [['slot', 'slot'], ['active', 'bool'], ...b32s(['targetContext', 'nodeCommitment', 'localCommitment',
    'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment',
    'receiptKeyCommitment', 'receiptRho', 'dummyTerminalTag', 'capsuleSalt', 'targetJoinBlind'])],
  completion: [...b32s(['hubDomain', 'registryCommitment']), ['evidenceState', 'field32'],
    ...b32s(['context', 'payoutCommitment', 'terminalReceiptTag']), ['slot', 'slot'], ['validFrom', 'u64'], ['validUntil', 'u64']],
  evidenceState: [...b32s(['hubDomain', 'registryCommitment']), ['receiptRoot', 'field32'], ['receiptCount', 'count64'],
    ['revokedDigest', 'field32'], ['revokedCount', 'count64'], ['revocationSequence', 'u64']],
  funding: [...b32s(['inputCommitment', 'inputNullifier', 'reserveCommitment', 'changeCommitment', 'operationId']),
    ['fundingNotBefore', 'u64'], ['fundingValidUntil', 'u64']],
  recovery: [...b32s(['reserveCommitment', 'reserveNullifier', 'recoveryCommitment']), ['settleBefore', 'u64']],
  settlement: [...b32s(['context', 'reserveCommitment', 'reserveNullifier']),
    ['outputs', arrayOf('bytes32', 4)], ['settleBefore', 'u64']],
  predecessor: [['sourceSlot', 'slot'], ...b32s(['sourceNodeCommitment', 'sourceLocalCommitment', 'sourceDispatchId',
    'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'])],
  dependency: [['targetSlot', 'slot'], ['targetContext', 'bytes32'], ['dependencyCount', 'count3'],
    ['predecessors', arrayOf(recordOf('predecessor'), 3)], ...b32s(['capsuleSalt', 'targetJoinBlind'])],
  payout: [['slot', 'slot'], ['commitment', 'bytes32']],
  join: [['envelope', 'field32'], ['targetContext', 'bytes32'], ['authorizationRoot', 'field32'],
    ['checkpoint', 'bytes32'], ['readinessEvidenceState', 'field32'], ['readyFrom', 'u64'], ['readyUntil', 'u64'],
    ['targetJoinBlind', 'bytes32']],
  ready: [...b32s(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'snapshotDigest',
    'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment']),
    ['readyFrom', 'u64'], ['readyUntil', 'u64']],
  admissionRevocation: [['currentRevokedDigest', 'field32'], ['currentRevokedCount', 'count64'],
    ['currentRevocationSequence', 'u64']],
});
export const PURPOSES = freeze({
  domain: [1, 14], core: [2, 12], local: [3, 33], completion: [4, 18], evidenceState: [5, 10],
  revoked: [6, 133], authorization: [7, 2], receipt: [8, 4], empty: [9, 2], node: [10, 5],
  funding: [11, 17], recovery: [12, 12], settlement: [13, 20], dependency: [14, 70], payout: [15, 8],
  join: [16, 12], ready: [17, 30], admissionRevocation: [18, 4],
});

function exactRecord(value, keys) {
  assert.ok(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'COMMITMENT_PLAIN_RECORD');
  const actual = Reflect.ownKeys(value);
  assert.ok(actual.every(key => typeof key === 'string'), 'COMMITMENT_EXACT_FIELDS');
  assert.deepEqual(actual.sort(), [...keys].sort(), 'COMMITMENT_EXACT_FIELDS');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'COMMITMENT_DATA_FIELDS');
  }
}
function fixedArray(value, length) {
  assert.ok(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length === length, 'COMMITMENT_ARRAY_LENGTH');
  assert.equal(Reflect.ownKeys(value).length, length + 1, 'COMMITMENT_ARRAY_PROPERTIES');
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    assert.ok(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'COMMITMENT_DENSE_ARRAY');
  }
  return value;
}
function bytes32(value, nonzero = false) {
  assert.equal(typeof value, 'string', 'COMMITMENT_HEX_TYPE');
  assert.equal(value.length, 64, 'COMMITMENT_HEX_LENGTH');
  assert.match(value, /^[0-9a-f]{64}$/, 'COMMITMENT_HEX32');
  assert.ok(!nonzero || value !== ZERO, 'COMMITMENT_NONZERO');
  return value;
}
function canonicalField(value, nonzero = false) {
  bytes32(value, nonzero);
  const integer = BigInt('0x' + value);
  assert.ok(integer < FIELD_MODULUS, 'COMMITMENT_FIELD_RANGE');
  return integer;
}
export function portableRawDigestLimbsV1(value) {
  bytes32(value);
  // Two independent 16-byte big-endian integers, each strictly below 2^128.
  // Never reconstruct a raw B32 as one field or reduce it modulo r.
  return Object.freeze([BigInt('0x' + value.slice(0, 32)), BigInt('0x' + value.slice(32))]);
}
function uint(value, bits, bound = undefined) {
  assert.equal(typeof value, 'string', 'COMMITMENT_DECIMAL_STRING');
  assert.ok(value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value), 'COMMITMENT_CANONICAL_UINT');
  const result = BigInt(value);
  assert.equal(result.toString(), value, 'COMMITMENT_CANONICAL_UINT');
  assert.ok(result < (1n << BigInt(bits)) && (bound === undefined || result <= bound), 'COMMITMENT_UINT_RANGE');
  return result;
}
function control(value, max) {
  assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= max, 'COMMITMENT_CONTROL_RANGE');
  return value;
}
function scalar(value, type) {
  if (type === 'bytes32') return portableRawDigestLimbsV1(value);
  if (type === 'field32') return [canonicalField(value)];
  if (type === 'bool') {
    assert.equal(typeof value, 'boolean', 'COMMITMENT_BOOL');
    return [value ? 1n : 0n];
  }
  if (type === 'slot' || type === 'count3') return [uint(value, 8, 3n)];
  if (type === 'count64') return [uint(value, 32, 64n)];
  assert.ok(type === 'u64' || type === 'u32' || type === 'u8', 'COMMITMENT_SCHEMA_TYPE');
  return [uint(value, Number(type.slice(1)))];
}
function fieldsForType(value, type) {
  if (!Array.isArray(type)) return scalar(value, type);
  if (type[0] === 'record') return fieldsForRecord(value, type[1]);
  fixedArray(value, type[2]);
  return value.flatMap(item => fieldsForType(item, type[1]));
}
function fieldsForRecord(value, name) {
  assert.ok(Object.hasOwn(SCHEMAS, name), 'COMMITMENT_SCHEMA');
  const schema = SCHEMAS[name];
  exactRecord(value, schema.map(([key]) => key));
  return schema.flatMap(([key, type]) => fieldsForType(value[key], type));
}
function window(from, until) { assert.ok(uint(from, 64) < uint(until, 64), 'COMMITMENT_WINDOW'); }
function depthOf(kind) { control(kind, 2); return kind === 1 ? 4 : 6; }

export function createPortableOwnerCommitmentCodecV1() {
  assert.equal(arguments.length, 0, 'COMMITMENT_NO_CALLER_HASH');
  const hash = async (name, payload) => {
    const [purpose, count] = PURPOSES[name];
    assert.equal(payload.length, count, 'COMMITMENT_PAYLOAD_LENGTH');
    const fields = Object.freeze([PROFILE_FIELD, 1n, BigInt(purpose), BigInt(count), ...payload]);
    for (const field of fields) assert.ok(typeof field === 'bigint' && field >= 0n && field < FIELD_MODULUS,
      'COMMITMENT_FIELD_OPERAND');
    // The whole tuple length, including the four-field header, is hash N.
    const result = portablePoseidon2HexV1(fields);
    canonicalField(result);
    return result;
  };
  const leaf = (name, domain, value, blind) => {
    const body = fieldsForRecord(value, name);
    const indexes = { core: 0, funding: 1, recovery: 2, settlement: 3,
      local: 4, dependency: 8, payout: 12 };
    const kinds = { core: 0, funding: 1, recovery: 2, settlement: 3, local: 4, dependency: 5, payout: 6 };
    const slot = name === 'dependency' ? value.targetSlot : value.slot;
    const index = indexes[name] + (slot === undefined ? 0 : Number(slot));
    if (name === 'funding') window(value.fundingNotBefore, value.fundingValidUntil);
    if (['core', 'recovery', 'settlement'].includes(name))
      assert.ok(uint(value.settleBefore, 64) > 0n, 'COMMITMENT_CUTOFF');
    return hash(name, [canonicalField(domain, true), BigInt(index), BigInt(kinds[name]),
      ...portableRawDigestLimbsV1(bytes32(blind, true)), ...body]);
  };
  const api = {
    domainCommitment(domain) {
      const body = fieldsForRecord(domain, 'domain');
      for (const value of Object.values(domain)) bytes32(value, true);
      return hash('domain', body);
    },
    coreLeaf: (d, v, b) => leaf('core', d, v, b),
    localLeaf: (d, v, b) => leaf('local', d, v, b),
    fundingLeaf: (d, v, b) => leaf('funding', d, v, b),
    recoveryLeaf: (d, v, b) => leaf('recovery', d, v, b),
    settlementLeaf: (d, v, b) => leaf('settlement', d, v, b),
    dependencyLeaf: (d, v, b) => leaf('dependency', d, v, b),
    payoutLeaf: (d, v, b) => leaf('payout', d, v, b),
    completionCommitment(domain, envelope, value, blind) {
      const body = fieldsForRecord(value, 'completion'); window(value.validFrom, value.validUntil);
      return hash('completion', [canonicalField(domain, true), canonicalField(envelope, true),
        ...portableRawDigestLimbsV1(bytes32(blind, true)), ...body]);
    },
    evidenceStateDigest: (domain, value) => hash('evidenceState',
      [canonicalField(domain, true), ...fieldsForRecord(value, 'evidenceState')]),
    revokedDigest(domain, hubDomain, entries, count) {
      const d = canonicalField(domain, true), hub = portableRawDigestLimbsV1(hubDomain), n = uint(count, 32, 64n);
      fixedArray(entries, 64);
      const body = entries.flatMap(portableRawDigestLimbsV1);
      const seen = new Set();
      for (let i = 0; i < 64; i++) {
        if (BigInt(i) < n) {
          bytes32(entries[i], true); assert.ok(!seen.has(entries[i]), 'COMMITMENT_DUPLICATE_REVOCATION');
          seen.add(entries[i]);
        } else assert.equal(entries[i], ZERO, 'COMMITMENT_REVOCATION_PADDING');
      }
      return hash('revoked', [d, 0x32n, ...hub, n, ...body]);
    },
    authorizationLeaf: (domain, envelope) => hash('authorization',
      [canonicalField(domain, true), canonicalField(envelope, true)]),
    receiptLeaf: (domain, receiptCommitment) => hash('receipt',
      [canonicalField(domain, true), 2n, ...portableRawDigestLimbsV1(bytes32(receiptCommitment, true))]),
    emptyLeaf(domain, kind) {
      depthOf(kind); return hash('empty', [canonicalField(domain, true), BigInt(kind)]);
    },
    nodeHash(domain, kind, parentLevel, left, right) {
      const depth = depthOf(kind); control(parentLevel, depth);
      assert.ok(parentLevel >= 1, 'COMMITMENT_TREE_LEVEL');
      return hash('node', [canonicalField(domain, true), BigInt(kind), BigInt(parentLevel),
        canonicalField(left), canonicalField(right)]);
    },
    joinCommitment(domain, value) {
      const body = fieldsForRecord(value, 'join');
      canonicalField(value.envelope, true); bytes32(value.targetContext, true); bytes32(value.targetJoinBlind, true);
      window(value.readyFrom, value.readyUntil);
      return hash('join', [canonicalField(domain, true), ...body]);
    },
    readinessCommitment(domain, join, blind, descriptor) {
      const body = fieldsForRecord(descriptor, 'ready'); window(descriptor.readyFrom, descriptor.readyUntil);
      return hash('ready', [canonicalField(domain, true), canonicalField(join),
        ...portableRawDigestLimbsV1(bytes32(blind, true)), ...body]);
    },
    admissionRevocationState: (domain, value) => hash('admissionRevocation',
      [canonicalField(domain, true), ...fieldsForRecord(value, 'admissionRevocation')]),
    async emptySubtree(domain, kind, level = depthOf(kind)) {
      control(level, depthOf(kind));
      let current = await api.emptyLeaf(domain, kind);
      for (let parent = 1; parent <= level; parent++) current = await api.nodeHash(domain, kind, parent, current, current);
      return current;
    },
    /** Ordered occupied prefix, followed by typed empty leaves. Kind 1 needs all 16 leaves. */
    async buildTree(domain, kind, occupiedLeaves) {
      const depth = depthOf(kind), capacity = 2 ** depth;
      assert.ok(Array.isArray(occupiedLeaves), 'COMMITMENT_ARRAY_LENGTH');
      fixedArray(occupiedLeaves, occupiedLeaves.length);
      assert.ok(occupiedLeaves.length <= capacity && (kind !== 1 || occupiedLeaves.length === capacity), 'COMMITMENT_TREE_CAPACITY');
      canonicalField(domain, true);
      const occupied = [...occupiedLeaves];
      occupied.forEach(value => canonicalField(value, true));
      const empty = await api.emptyLeaf(domain, kind);
      occupied.forEach(value => assert.notEqual(value, empty, 'COMMITMENT_EMPTY_OCCUPIED_LEAF'));
      const levels = [[...occupied, ...Array(capacity - occupied.length).fill(empty)]];
      for (let level = 1; level <= depth; level++) {
        const previous = levels[level - 1], next = [];
        for (let i = 0; i < previous.length; i += 2)
          next.push(await api.nodeHash(domain, kind, level, previous[i], previous[i + 1]));
        levels.push(next);
      }
      return Object.freeze({ root: levels[depth][0], count: occupied.length, depth,
        opening(index) {
          control(index, capacity - 1); assert.ok(index < occupied.length, 'COMMITMENT_UNOCCUPIED_INDEX');
          return freeze({ leaf: occupied[index], index,
            siblings: Array.from({ length: depth }, (_, level) => levels[level][(index >> level) ^ 1]) });
        } });
    },
    async membershipRoot(domain, kind, leafValue, siblings, index) {
      const depth = depthOf(kind); control(index, 2 ** depth - 1);
      fixedArray(siblings, depth); canonicalField(leafValue, true);
      const path = [...siblings]; path.forEach(value => canonicalField(value));
      assert.notEqual(leafValue, await api.emptyLeaf(domain, kind), 'COMMITMENT_EMPTY_OCCUPIED_LEAF');
      let current = leafValue;
      for (let level = 0; level < depth; level++) current = await api.nodeHash(domain, kind, level + 1,
        ((index >> level) & 1) === 0 ? current : path[level],
        ((index >> level) & 1) === 0 ? path[level] : current);
      return current;
    },
  };
  return Object.freeze(api);
}
