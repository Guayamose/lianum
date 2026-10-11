/** Exact flat-profile field framing. This module does not start a backend,
 * verify authority, or replace the native SHA receipt/key/tag encodings.
 * hashFields must be bound by the caller to the pinned official Poseidon2. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { FIELD_MODULUS, PROFILE } from './statements.mjs';

export { FIELD_MODULUS, PROFILE };
export const PROFILE_FIELD = 0x4c49414e554d5f504145475f50325f5631n;
export const ZERO = '0'.repeat(64);
/** @typedef {'domain'|'core'|'local'|'completion'|'evidenceState'|'funding'|'recovery'|'settlement'|'predecessor'|'dependency'|'payout'|'join'|'ready'|'admissionRevocation'} SchemaName */
/** @typedef {'bytes32'|'field32'|'bool'|'slot'|'count3'|'count64'|'u64'|'u32'|'u8'} ScalarType */
/** @typedef {['record',SchemaName]} RecordFieldType */
/** @typedef {ScalarType | RecordFieldType | ['array',ScalarType|RecordFieldType,number]} FieldType */
/** @typedef {[string,FieldType]} SchemaField */
/** @typedef {'core'|'funding'|'recovery'|'settlement'|'local'|'dependency'|'payout'} LeafName */
/** @typedef {string | number | boolean | ReadonlyArray<unknown> | Readonly<Record<string,unknown>>} NoirValue */
/** @typedef {Readonly<{root:string,count:number,depth:number,opening(index:number):{leaf:string,index:number,siblings:string[]}}>} CommitmentTree */
/** @param {string[]} names @returns {SchemaField[]} */
const b32s = names => names.map(name => [name, 'bytes32']);
/** @param {ScalarType|RecordFieldType} type @param {number} length @returns {['array',ScalarType|RecordFieldType,number]} */
const arrayOf = (type, length) => ['array', type, length];
/** @param {SchemaName} name @returns {['record',SchemaName]} */
const recordOf = name => ['record', name];
/** @template T @param {T} value @returns {T} */
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** @type {Readonly<Record<SchemaName,readonly SchemaField[]>>} */
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

/** @param {unknown} value @param {readonly string[]} keys @returns {asserts value is Record<string,unknown>} */
export function exactRecord(value, keys) {
  assert.ok(value && typeof value === 'object' && !types.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype, 'COMMITMENT_PLAIN_RECORD');
  const actual = Reflect.ownKeys(value);
  assert.ok(actual.every(key => typeof key === 'string'), 'COMMITMENT_EXACT_FIELDS');
  assert.deepEqual(actual.sort(), [...keys].sort(), 'COMMITMENT_EXACT_FIELDS');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'COMMITMENT_DATA_FIELDS');
  }
}
/** @param {unknown} value @param {number} length @returns {unknown[]} */
export function fixedArray(value, length) {
  assert.ok(Array.isArray(value) && !types.isProxy(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length === length, 'COMMITMENT_ARRAY_LENGTH');
  assert.equal(Reflect.ownKeys(value).length, length + 1, 'COMMITMENT_ARRAY_PROPERTIES');
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    assert.ok(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'COMMITMENT_DENSE_ARRAY');
  }
  return value;
}
/** @param {unknown} value @param {boolean} [nonzero] */
export function bytes32(value, nonzero = false) {
  assert.ok(typeof value === 'string', 'COMMITMENT_HEX_TYPE');
  assert.equal(value.length, 64, 'COMMITMENT_HEX_LENGTH');
  assert.match(value, /^[0-9a-f]{64}$/, 'COMMITMENT_HEX32');
  assert.ok(!nonzero || value !== ZERO, 'COMMITMENT_NONZERO');
  return value;
}
/** @param {unknown} value @param {boolean} [nonzero] */
export function canonicalField(value, nonzero = false) {
  bytes32(value, nonzero);
  const integer = BigInt('0x' + value);
  assert.ok(integer < FIELD_MODULUS, 'COMMITMENT_FIELD_RANGE');
  return integer;
}
/** @param {unknown} value */
export function rawDigestLimbs(value) {
  const digest = bytes32(value);
  // Two independent 16-byte big-endian integers, each strictly below 2^128.
  // Never reconstruct a raw B32 as one field or reduce it modulo r.
  return Object.freeze([BigInt('0x' + digest.slice(0, 32)), BigInt('0x' + digest.slice(32))]);
}
/** @param {unknown} value @param {number} bits @param {bigint} [bound] */
function uint(value, bits, bound = undefined) {
  assert.ok(typeof value === 'string', 'COMMITMENT_DECIMAL_STRING');
  assert.ok(value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value), 'COMMITMENT_CANONICAL_UINT');
  const result = BigInt(value);
  assert.equal(result.toString(), value, 'COMMITMENT_CANONICAL_UINT');
  assert.ok(result < (1n << BigInt(bits)) && (bound === undefined || result <= bound), 'COMMITMENT_UINT_RANGE');
  return result;
}
/** @param {number} value @param {number} max */
function control(value, max) {
  assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= max, 'COMMITMENT_CONTROL_RANGE');
  return value;
}
/** @param {unknown} value @param {ScalarType} type @returns {readonly bigint[]} */
function scalar(value, type) {
  if (type === 'bytes32') return rawDigestLimbs(value);
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
/** @param {unknown} value @param {FieldType} type @returns {readonly bigint[]} */
function fieldsForType(value, type) {
  if (!Array.isArray(type)) return scalar(value, type);
  if (type[0] === 'record') return fieldsForRecord(value, type[1]);
  const items = fixedArray(value, type[2]);
  return items.flatMap(item => fieldsForType(item, type[1]));
}
/** @param {unknown} value @param {SchemaName} name @returns {bigint[]} */
function fieldsForRecord(value, name) {
  assert.ok(Object.hasOwn(SCHEMAS, name), 'COMMITMENT_SCHEMA');
  const schema = SCHEMAS[name];
  exactRecord(value, schema.map(([key]) => key));
  return schema.flatMap(([key, type]) => fieldsForType(value[key], type));
}
/** @template T @param {SchemaName} name @param {T} value @returns {T} */
export function validateStruct(name, value) {
  fieldsForRecord(value, name);
  return freeze(structuredClone(value));
}
/** @param {unknown} value */
export function digestBytes(value) { return [...Buffer.from(bytes32(value), 'hex')]; }
/** @param {unknown} value */
export function digestWords(value) {
  const buffer = Buffer.from(bytes32(value), 'hex');
  return Array.from({ length: 8 }, (_, i) => buffer.readUInt32BE(i * 4));
}
/** @param {string} key */
const snake = key => key.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
/** Convert an already typed host record into the exact Noir struct shape. */
/** @param {SchemaName} name @param {Record<string,unknown>} value @returns {Record<string,NoirValue>} */
export function structToNoir(name, value) {
  fieldsForRecord(value, name);
  /** @param {unknown} item @param {FieldType} type @returns {NoirValue} */
  const convert = (item, type) => {
    if (Array.isArray(type)) {
      if (type[0] === 'record') {
        exactRecord(item, SCHEMAS[type[1]].map(([key]) => key));
        return structToNoir(type[1], item);
      }
      return fixedArray(item, type[2]).map(child => convert(child, type[1]));
    }
    if (type === 'bytes32' || type === 'field32') return digestBytes(item);
    if (['slot', 'count3', 'count64', 'u8', 'u32'].includes(type)) return Number(item);
    assert.ok(typeof item === 'string' || typeof item === 'boolean', 'COMMITMENT_SCHEMA_TYPE');
    return item;
  };
  return Object.fromEntries(SCHEMAS[name].map(([key, type]) => [snake(key), convert(value[key], type)]));
}
/** @param {unknown} from @param {unknown} until */
function window(from, until) { assert.ok(uint(from, 64) < uint(until, 64), 'COMMITMENT_WINDOW'); }
/** @param {number} kind */
function depthOf(kind) { control(kind, 2); return kind === 1 ? 4 : 6; }

/** @param {{hashFields(fields:readonly bigint[]):string|Promise<string>}} options */
export function createCommitmentCodec(options) {
  exactRecord(options, ['hashFields']);
  const { hashFields } = options;
  assert.equal(typeof hashFields, 'function', 'COMMITMENT_HASH_FUNCTION');
  /** @param {keyof typeof PURPOSES} name @param {readonly bigint[]} payload @returns {Promise<string>} */
  const hash = async (name, payload) => {
    const [purpose, count] = PURPOSES[name];
    assert.equal(payload.length, count, 'COMMITMENT_PAYLOAD_LENGTH');
    const fields = Object.freeze([PROFILE_FIELD, 1n, BigInt(purpose), BigInt(count), ...payload]);
    for (const field of fields) assert.ok(typeof field === 'bigint' && field >= 0n && field < FIELD_MODULUS,
      'COMMITMENT_FIELD_OPERAND');
    // The whole tuple length, including the four-field header, is hash N.
    const result = await hashFields(fields);
    canonicalField(result);
    return result;
  };
  /** @param {LeafName} name @param {unknown} domain @param {Record<string,unknown>} value @param {unknown} blind */
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
      ...rawDigestLimbs(bytes32(blind, true)), ...body]);
  };
  const api = {
    /** @param {Record<string,unknown>} domain */
    domainCommitment(domain) {
      const body = fieldsForRecord(domain, 'domain');
      for (const value of Object.values(domain)) bytes32(value, true);
      return hash('domain', body);
    },
    /** @param {unknown} d @param {Record<string,unknown>} v @param {unknown} b */
    coreLeaf: (d, v, b) => leaf('core', d, v, b),
    /** @param {unknown} d @param {Record<string,unknown>} v @param {unknown} b */
    localLeaf: (d, v, b) => leaf('local', d, v, b),
    /** @param {unknown} d @param {Record<string,unknown>} v @param {unknown} b */
    fundingLeaf: (d, v, b) => leaf('funding', d, v, b),
    /** @param {unknown} d @param {Record<string,unknown>} v @param {unknown} b */
    recoveryLeaf: (d, v, b) => leaf('recovery', d, v, b),
    /** @param {unknown} d @param {Record<string,unknown>} v @param {unknown} b */
    settlementLeaf: (d, v, b) => leaf('settlement', d, v, b),
    /** @param {unknown} d @param {Record<string,unknown>} v @param {unknown} b */
    dependencyLeaf: (d, v, b) => leaf('dependency', d, v, b),
    /** @param {unknown} d @param {Record<string,unknown>} v @param {unknown} b */
    payoutLeaf: (d, v, b) => leaf('payout', d, v, b),
    /** @param {unknown} domain @param {unknown} envelope @param {Record<string,unknown>} value @param {unknown} blind */
    completionCommitment(domain, envelope, value, blind) {
      const body = fieldsForRecord(value, 'completion'); window(value.validFrom, value.validUntil);
      return hash('completion', [canonicalField(domain, true), canonicalField(envelope, true),
        ...rawDigestLimbs(bytes32(blind, true)), ...body]);
    },
    /** @param {unknown} domain @param {unknown} value */
    evidenceStateDigest: (domain, value) => hash('evidenceState',
      [canonicalField(domain, true), ...fieldsForRecord(value, 'evidenceState')]),
    /** @param {unknown} domain @param {unknown} hubDomain @param {unknown} entries @param {unknown} count */
    revokedDigest(domain, hubDomain, entries, count) {
      const d = canonicalField(domain, true), hub = rawDigestLimbs(hubDomain), n = uint(count, 32, 64n);
      const values = fixedArray(entries, 64);
      const body = values.flatMap(rawDigestLimbs);
      const seen = new Set();
      for (let i = 0; i < 64; i++) {
        if (BigInt(i) < n) {
          bytes32(values[i], true); assert.ok(!seen.has(values[i]), 'COMMITMENT_DUPLICATE_REVOCATION');
          seen.add(values[i]);
        } else assert.equal(values[i], ZERO, 'COMMITMENT_REVOCATION_PADDING');
      }
      return hash('revoked', [d, 0x32n, ...hub, n, ...body]);
    },
    /** @param {unknown} domain @param {unknown} envelope */
    authorizationLeaf: (domain, envelope) => hash('authorization',
      [canonicalField(domain, true), canonicalField(envelope, true)]),
    /** @param {unknown} domain @param {unknown} receiptCommitment */
    receiptLeaf: (domain, receiptCommitment) => hash('receipt',
      [canonicalField(domain, true), 2n, ...rawDigestLimbs(bytes32(receiptCommitment, true))]),
    /** @param {unknown} domain @param {number} kind */
    emptyLeaf(domain, kind) {
      depthOf(kind); return hash('empty', [canonicalField(domain, true), BigInt(kind)]);
    },
    /** @param {unknown} domain @param {number} kind @param {number} parentLevel @param {unknown} left @param {unknown} right */
    nodeHash(domain, kind, parentLevel, left, right) {
      const depth = depthOf(kind); control(parentLevel, depth);
      assert.ok(parentLevel >= 1, 'COMMITMENT_TREE_LEVEL');
      return hash('node', [canonicalField(domain, true), BigInt(kind), BigInt(parentLevel),
        canonicalField(left), canonicalField(right)]);
    },
    /** @param {unknown} domain @param {Record<string,unknown>} value */
    joinCommitment(domain, value) {
      const body = fieldsForRecord(value, 'join');
      canonicalField(value.envelope, true); bytes32(value.targetContext, true); bytes32(value.targetJoinBlind, true);
      window(value.readyFrom, value.readyUntil);
      return hash('join', [canonicalField(domain, true), ...body]);
    },
    /** @param {unknown} domain @param {unknown} join @param {unknown} blind @param {Record<string,unknown>} descriptor */
    readinessCommitment(domain, join, blind, descriptor) {
      const body = fieldsForRecord(descriptor, 'ready'); window(descriptor.readyFrom, descriptor.readyUntil);
      return hash('ready', [canonicalField(domain, true), canonicalField(join),
        ...rawDigestLimbs(bytes32(blind, true)), ...body]);
    },
    /** @param {unknown} domain @param {unknown} value */
    admissionRevocationState: (domain, value) => hash('admissionRevocation',
      [canonicalField(domain, true), ...fieldsForRecord(value, 'admissionRevocation')]),
    /** @param {unknown} domain @param {number} kind @param {number} [level] @returns {Promise<string>} */
    async emptySubtree(domain, kind, level = depthOf(kind)) {
      control(level, depthOf(kind));
      let current = await api.emptyLeaf(domain, kind);
      for (let parent = 1; parent <= level; parent++) current = await api.nodeHash(domain, kind, parent, current, current);
      return current;
    },
    /** Ordered occupied prefix, followed by typed empty leaves. Kind 1 needs all 16 leaves. */
    /** @param {unknown} domain @param {number} kind @param {unknown} occupiedLeaves @returns {Promise<CommitmentTree>} */
    async buildTree(domain, kind, occupiedLeaves) {
      const depth = depthOf(kind), capacity = 2 ** depth;
      assert.ok(Array.isArray(occupiedLeaves) && !types.isProxy(occupiedLeaves), 'COMMITMENT_ARRAY_LENGTH');
      fixedArray(occupiedLeaves, occupiedLeaves.length);
      assert.ok(occupiedLeaves.length <= capacity && (kind !== 1 || occupiedLeaves.length === capacity), 'COMMITMENT_TREE_CAPACITY');
      canonicalField(domain, true);
      const occupied = fixedArray(occupiedLeaves, occupiedLeaves.length).map(value => {
        canonicalField(value, true); return bytes32(value);
      });
      const empty = await api.emptyLeaf(domain, kind);
      occupied.forEach(value => assert.notEqual(value, empty, 'COMMITMENT_EMPTY_OCCUPIED_LEAF'));
      const levels = [[...occupied, ...Array.from({length: capacity - occupied.length}, () => empty)]];
      for (let level = 1; level <= depth; level++) {
        const previous = levels[level - 1], next = [];
        for (let i = 0; i < previous.length; i += 2)
          next.push(await api.nodeHash(domain, kind, level, previous[i], previous[i + 1]));
        levels.push(next);
      }
      return Object.freeze({ root: levels[depth][0], count: occupied.length, depth,
        /** @param {number} index */
        opening(index) {
          control(index, capacity - 1); assert.ok(index < occupied.length, 'COMMITMENT_UNOCCUPIED_INDEX');
          return freeze({ leaf: occupied[index], index,
            siblings: Array.from({ length: depth }, (_, level) => levels[level][(index >> level) ^ 1]) });
        } });
    },
    /** @param {unknown} domain @param {number} kind @param {unknown} leafValue @param {unknown} siblings @param {number} index @returns {Promise<string>} */
    async membershipRoot(domain, kind, leafValue, siblings, index) {
      const depth = depthOf(kind); control(index, 2 ** depth - 1);
      const path = fixedArray(siblings, depth); canonicalField(leafValue, true);
      path.forEach(value => canonicalField(value));
      assert.notEqual(leafValue, await api.emptyLeaf(domain, kind), 'COMMITMENT_EMPTY_OCCUPIED_LEAF');
      let current = bytes32(leafValue);
      for (let level = 0; level < depth; level++) current = await api.nodeHash(domain, kind, level + 1,
        ((index >> level) & 1) === 0 ? current : path[level],
        ((index >> level) & 1) === 0 ? path[level] : current);
      return current;
    },
  };
  return Object.freeze(api);
}
