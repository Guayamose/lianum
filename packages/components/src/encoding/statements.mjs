/** Public statements and exact bundle joins for the flat wallet profile.
 * Decoding and joining never verifies a proof or grants signing authority. */
import assert from 'node:assert/strict';
import { types } from 'node:util';

export const PROFILE = 'LIANUM_PAEG_P2_V1';
export const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const F = 'field32', B = 'bytes32', TIME = 'u64';
const field = (name, type) => Object.freeze({ name, type });
const commonReadiness = [field('domainCommitment', F), field('authorizationRoot', F),
  field('checkpoint', B), field('readinessEvidenceState', F), field('joinCommitment', F)];

function relation(role, fields) {
  return Object.freeze({ role, fields: Object.freeze(fields), wordCount:
    fields.reduce((sum, item) => sum + (item.type === TIME ? 1 : item.type.endsWith('[4]') ? 32 : 8), 0) });
}
export const RELATIONS = Object.freeze({
  // Separate evidence roles. These do not satisfy any PAEG P/R/I/N/T join and
  // are accepted only by the independently pinned native-claim gateway.
  native_claim_ingress: relation('claim_ingress', [field('claimDomain', B), field('outputQ', B),
    field('admissionN', B), field('refundDestination', B), field('admissionRevocationState', F),
    field('ingressReceiptLeaf', F), field('amountQ', TIME),
    field('evidenceFrom', TIME), field('evidenceUntil', TIME)]),
  native_claim_discharge: relation('claim_discharge', [field('claimDomain', B), field('ticketId', B),
    field('ticketCommitment', B), field('dischargeN', B), field('admissionRevocationState', F),
    field('evidenceFrom', TIME), field('evidenceUntil', TIME)]),
  deposit_intent: relation('owner', [field('scope', B), field('policy', B),
    field('validFrom', TIME), field('validUntil', TIME), field('amount', TIME), field('output', B)]),
  authorization: relation('owner', [field('domainCommitment', F), field('envelope', F)]),
  reservation: relation('reservation', [field('domainCommitment', F), field('envelope', F),
    field('inputRoot', B), field('inputNullifier', B), field('reserveCommitment', B),
    field('changeCommitment', B), field('admissionTag', B),
    field('fundingNotBefore', TIME), field('fundingValidUntil', TIME)]),
  dependency: relation('dependency', [...commonReadiness,
    field('readyFrom', TIME), field('readyUntil', TIME)]),
  ready: relation('local', [...commonReadiness, field('readinessCommitment', F),
    field('readyFrom', TIME), field('readyUntil', TIME)]),
  admission: relation('local', [...commonReadiness, field('readinessCommitment', F),
    field('acceptedCheckpointRoot', B), field('admissionRevocationState', F),
    field('receiptLeaf', F), field('admissionNullifier', B),
    field('readyFrom', TIME), field('readyUntil', TIME),
    field('admissionFrom', TIME), field('admissionUntil', TIME)]),
  node: relation('local', [field('domainCommitment', F), field('authorizationRoot', F),
    field('evidenceState', F), field('completionCommitment', F)]),
  settlement: relation('assembler', [field('domainCommitment', F), field('authorizationRoot', F),
    field('evidenceState', F), field('poolRoot', B), field('reserveNullifier', B),
    field('outputs', B + '[4]'), field('terminalTags', B + '[4]'),
    field('completionCommitments', F + '[4]'), field('validFrom', TIME), field('validUntil', TIME)]),
  recovery: relation('recovery', [field('domainCommitment', F), field('authorizationRoot', F),
    field('poolRoot', B), field('reserveNullifier', B), field('recoveryCommitment', B),
    field('settleBefore', TIME)]),
});

function profile(mode) {
  assert.ok(Object.hasOwn(RELATIONS, mode), 'UNKNOWN_PROOF_RELATION');
  return RELATIONS[mode];
}
function exact(record, keys) {
  assert.ok(record && typeof record === 'object' && !types.isProxy(record)
    && Object.getPrototypeOf(record) === Object.prototype, 'STATEMENT_PLAIN_RECORD');
  assert.deepEqual(Reflect.ownKeys(record).sort(), [...keys].sort(), 'STATEMENT_EXACT_FIELDS');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
      'STATEMENT_DATA_FIELDS');
  }
}
function array(values, length) {
  assert.ok(Array.isArray(values) && !types.isProxy(values)
    && Object.getPrototypeOf(values) === Array.prototype && values.length === length,
  'STATEMENT_ARRAY_LENGTH');
  assert.equal(Reflect.ownKeys(values).length, length + 1, 'STATEMENT_ARRAY_PROPERTIES');
  for (let i = 0; i < length; i++)
    assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(values, String(i)) ?? {}, 'value'), 'STATEMENT_DENSE_ARRAY');
}
function integer(value, width) {
  assert.equal(typeof value, 'string', 'STATEMENT_INTEGER_STRING');
  assert.ok(value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value), 'STATEMENT_INTEGER_ENCODING');
  const result = BigInt(value);
  assert.equal(result.toString(), value, 'STATEMENT_INTEGER_ROUNDTRIP');
  assert.ok(result < (1n << BigInt(width)), 'STATEMENT_INTEGER_RANGE');
  return result;
}
function digest(value, type) {
  assert.equal(typeof value, 'string', 'STATEMENT_DIGEST_STRING');
  assert.equal(value.length, 64, 'STATEMENT_DIGEST_LENGTH');
  assert.match(value, /^[0-9a-f]{64}$/, 'STATEMENT_DIGEST_ENCODING');
  if (type === F) assert.ok(BigInt('0x' + value) < FIELD_MODULUS, 'STATEMENT_FIELD_RANGE');
  return value;
}
function encodeValue(value, type) {
  if (type === TIME) return [integer(value, 64).toString()];
  if (type.endsWith('[4]')) {
    array(value, 4);
    return value.flatMap(item => encodeValue(item, type.slice(0, -3)));
  }
  const bytes = Buffer.from(digest(value, type), 'hex');
  return Array.from({ length: 8 }, (_, index) => bytes.readUInt32BE(index * 4).toString());
}
export function encodeStatement(mode, statement) {
  const spec = profile(mode);
  exact(statement, spec.fields.map(item => item.name));
  const words = spec.fields.flatMap(item => encodeValue(statement[item.name], item.type));
  assert.equal(words.length, spec.wordCount);
  return Object.freeze(words);
}
export function decodeStatement(mode, words) {
  const spec = profile(mode); array(words, spec.wordCount);
  let offset = 0;
  const read = type => {
    if (type === TIME) return integer(words[offset++], 64).toString();
    if (type.endsWith('[4]')) return Object.freeze(Array.from({ length: 4 }, () => read(type.slice(0, -3))));
    const result = Array.from({ length: 8 }, () => integer(words[offset++], 32).toString(16).padStart(8, '0')).join('');
    return digest(result, type);
  };
  const statement = Object.fromEntries(spec.fields.map(item => [item.name, read(item.type)]));
  assert.equal(offset, spec.wordCount);
  return Object.freeze(statement);
}
export function validateStatement(mode, value) {
  return decodeStatement(mode, [...encodeStatement(mode, value)]);
}
function equalFields(left, right, names) {
  for (const name of names) assert.equal(left[name], right[name], `BUNDLE_${name}_MISMATCH`);
}

export function joinReservation(authorization, reservation) {
  const u = validateStatement('authorization', authorization);
  const s = validateStatement('reservation', reservation);
  equalFields(u, s, ['domainCommitment', 'envelope']);
  return s;
}
export function joinReadiness(dependency, ready) {
  const p = validateStatement('dependency', dependency);
  const r = validateStatement('ready', ready);
  equalFields(p, r, [...commonReadiness.map(item => item.name), 'readyFrom', 'readyUntil']);
  return r;
}
export function joinAdmission(dependency, ready, admission) {
  const r = joinReadiness(dependency, ready);
  const i = validateStatement('admission', admission);
  equalFields(r, i, [...commonReadiness.map(item => item.name), 'readinessCommitment', 'readyFrom', 'readyUntil']);
  // admissionRevocationState deliberately has no equality to the historical
  // readinessEvidenceState. The transaction must match it to current hub state.
  return i;
}
export function joinSettlement(nodes, settlement) {
  array(nodes, 4);
  const t = validateStatement('settlement', settlement);
  for (let slot = 0; slot < 4; slot++) {
    const n = validateStatement('node', nodes[slot]);
    equalFields(n, t, ['domainCommitment', 'authorizationRoot', 'evidenceState']);
    assert.equal(n.completionCommitment, t.completionCommitments[slot], 'BUNDLE_COMPLETION_SLOT_MISMATCH');
  }
  return t;
}
