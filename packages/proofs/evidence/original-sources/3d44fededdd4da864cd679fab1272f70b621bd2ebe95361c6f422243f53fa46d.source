/** Strict byte framing for the separate flat-composition draft.
 *
 * These functions authenticate no owner, fact, chain, verifier or deployment.
 * Their outputs are commitments/encodings only. The reviewed proof relations
 * and atomic contract composition must enforce every claimed predicate.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';

export const PROFILE = 'LIANUM_PAEG_FLAT_4_V1';
export const FACTS_SCHEMA = 'LIANUM_FLAT_NATIVE_FACTS_V1';
export const TAGS = Object.freeze({
  domain: 'LIANUM/PAEG/flat/domain/1',
  leaf: 'LIANUM/PAEG/flat/envelope-leaf/1',
  join: 'LIANUM/PAEG/flat/readiness-join/1',
  ready: 'LIANUM/PAEG/flat/ready-opening/1',
  completion: 'LIANUM/PAEG/flat/completion-opening/1',
  // These two primitive tags must not rotate with software/registry releases.
  receiptKey: 'LIANUM/PAEG/receipt-key/2',
  admissionNullifier: 'LIANUM/PAEG/native-admission-nullifier/1',
  terminalReceipt: 'LIANUM/PAEG/receipt-spend/2',
  facts: 'LIANUM/native-facts/1',
});
const ZERO = '0'.repeat(64);
const ascii = value => Buffer.from(value, 'ascii');
const sha = value => createHash('sha256').update(value).digest('hex');
const fields = (names, type = 'digest') => names.map(name => [name, type]);

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const DOMAIN = fields(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment',
  'verifierSetCommitment', 'ledgerNamespace']);
const CORE = [...fields(['context', 'reserveCommitment', 'reserveNullifier']), ['settleBefore', 'u64']];
const FUNDING = [...fields(['inputCommitment', 'inputNullifier', 'reserveCommitment', 'changeCommitment']),
  ['fundingNotBefore', 'u64'], ['fundingValidUntil', 'u64']];
const RECOVERY = [...fields(['reserveCommitment', 'reserveNullifier', 'recoveryCommitment']), ['settleBefore', 'u64']];
const SETTLEMENT = [...fields(['context', 'reserveCommitment', 'reserveNullifier']),
  ['outputs', ['array', 'digest', 4]], ['settleBefore', 'u64']];
const LOCAL = [['slot', 'slot'], ['active', 'bool'], ...fields(['targetContext', 'nodeCommitment',
  'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment',
  'payoutCommitment', 'receiptKeyCommitment', 'receiptRho', 'dummyTerminalTag', 'capsuleSalt', 'targetJoinBlind'])];
const PREDECESSOR = [['sourceSlot', 'slot'], ...fields(['sourceNodeCommitment', 'sourceLocalCommitment',
  'sourceDispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment',
  'receiptKeyCommitment', 'receiptRho'])];
const DEPENDENCY = [['targetSlot', 'slot'], ['targetContext', 'digest'], ['dependencyCount', 'count3'],
  ['predecessors', ['array', ['record', PREDECESSOR], 3]],
  ['capsuleSalt', 'digest'], ['targetJoinBlind', 'digest']];
const PAYOUT = [['slot', 'slot'], ['commitment', 'digest']];
const JOIN = [...fields(['envelope', 'targetContext', 'authorizationRoot', 'checkpoint',
  'readinessEvidenceState']), ['readinessFrom', 'u64'], ['readinessUntil', 'u64'], ['blind', 'digest']];
const READY = [...fields(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment',
  'snapshotDigest', 'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy',
  'actionCommitment', 'payoutCommitment']), ['readyFrom', 'u64'], ['readyUntil', 'u64']];
const COMPLETION = [...fields(['hubDomain', 'registryCommitment', 'evidenceState', 'context',
  'payoutCommitment', 'terminalReceiptTag']), ['slot', 'slot'], ['validFrom', 'u64'], ['validUntil', 'u64']];
const OBSERVATION = [...fields(['blockId', 'stateCommitment']), ['blockHeight', 'u64'], ['observedAt', 'u64'],
  ['finalityKind', 'u8'], ['confirmations', 'u32'], ...fields(['sourceCommitment', 'destinationCommitment']),
  ['amount', 'u128'], ['custodyKind', 'u8'], ['custodyCommitment', 'digest'],
  ['evidenceFrom', 'u64'], ['evidenceUntil', 'u64']];
const NATIVE_CONTEXT = [['observedTipId', 'digest'], ['observedTipHeight', 'u64'],
  ['transactionSlot', 'u64'], ['parentSlot', 'u64'], ['observedSlot', 'u64']];
const FACTS = [...fields(['ledgerNamespace', 'hubDomain', 'registryCommitment', 'ruleCommitment']),
  ['family', 'u8'], ['genesis', 'digest'], ['asset', 'digest'], ['transactionId', 'bytes64'],
  ['effectIndex', 'u32'], ...fields(['nativeGid', 'transactionSHA256']),
  ['wireBindingVersion', 'u8'], ['wireBindingKind', 'u8'], ['wireBindingPosition', 'u32'],
  ['wireKeyCommitment', 'digest'], ['observation', ['record', OBSERVATION]],
  ['nativeContext', ['record', NATIVE_CONTEXT]]];

export const SCHEMAS = freeze({ domain: DOMAIN, core: CORE, funding: FUNDING,
  recovery: RECOVERY, settlement: SETTLEMENT, local: LOCAL, dependency: DEPENDENCY,
  payout: PAYOUT, join: JOIN, ready: READY, completion: COMPLETION,
  observation: OBSERVATION, nativeContext: NATIVE_CONTEXT, facts: FACTS });
const LEAF_KINDS = Object.freeze({ core: 0, funding: 1, recovery: 2, settlement: 3,
  local: 4, dependency: 5, payout: 6 });

function exact(value, names) {
  assert.ok(value && typeof value === 'object' && !types.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype, 'FLAT_PLAIN_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort(), 'FLAT_EXACT_FIELDS');
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
      'FLAT_DATA_FIELDS_ONLY');
  }
}
function array(value, length) {
  assert.ok(Array.isArray(value) && !types.isProxy(value)
    && Object.getPrototypeOf(value) === Array.prototype && value.length === length,
  'FLAT_FIXED_ARRAY');
  assert.equal(Reflect.ownKeys(value).length, length + 1, 'FLAT_ARRAY_PROPERTIES');
  for (let index = 0; index < length; index++) {
    assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(index)) ?? {}, 'value'),
      'FLAT_DENSE_ARRAY');
  }
}
function digest(value, nonzero = false, bytes = 32) {
  assert.equal(typeof value, 'string', 'FLAT_HEX_TYPE');
  assert.equal(value.length, bytes * 2, 'FLAT_HEX_LENGTH');
  assert.match(value, new RegExp(`^[0-9a-f]{${bytes * 2}}$`), 'FLAT_HEX_BYTES');
  assert.ok(!nonzero || /[1-9a-f]/.test(value), 'FLAT_NONZERO_DIGEST');
  return Buffer.from(value, 'hex');
}
function integer(value, width) {
  assert.equal(typeof value, 'string', 'FLAT_DECIMAL_STRING');
  assert.ok(value.length <= 39 && /^(0|[1-9][0-9]*)$/.test(value), 'FLAT_CANONICAL_UINT');
  const number = BigInt(value);
  assert.equal(number.toString(), value, 'FLAT_CANONICAL_UINT');
  assert.ok(number < (1n << BigInt(width * 8)), 'FLAT_UINT_RANGE');
  return Buffer.from(number.toString(16).padStart(width * 2, '0'), 'hex');
}
function parts(type, value) {
  if (Array.isArray(type)) {
    if (type[0] === 'record') return recordParts(type[1], value);
    assert.equal(type[0], 'array'); array(value, type[2]);
    return value.flatMap(item => parts(type[1], item));
  }
  if (type === 'digest') return [digest(value)];
  if (type === 'bytes64') return [digest(value, false, 64)];
  if (type === 'bool') {
    assert.equal(typeof value, 'boolean', 'FLAT_BOOL');
    return [Buffer.from([value ? 1 : 0])];
  }
  if (type === 'slot' || type === 'count3') {
    const result = integer(value, 1);
    assert.ok(result[0] <= 3, 'FLAT_FOUR_SLOT_BOUND');
    return [result];
  }
  assert.ok(['u8', 'u32', 'u64', 'u128'].includes(type), 'FLAT_INTERNAL_SCHEMA');
  return [integer(value, Number(type.slice(1)) / 8)];
}
function recordParts(schema, value) {
  exact(value, schema.map(([name]) => name));
  return schema.flatMap(([name, type]) => parts(type, value[name]));
}
function h4(tag, values) {
  const components = [ascii(tag), ...values];
  return Buffer.concat(components.flatMap(value => {
    assert.ok(Buffer.isBuffer(value) && value.length <= 0xffff_ffff, 'FLAT_FRAME_COMPONENT');
    const length = Buffer.alloc(4); length.writeUInt32BE(value.length);
    return [length, value];
  }));
}
function window(from, until) {
  integer(from, 8); integer(until, 8);
  assert.ok(BigInt(from) < BigInt(until), 'FLAT_POSITIVE_WINDOW');
}
function flatFrame(tag, domain, values) {
  return h4(tag, [ascii(PROFILE), digest(domain, true), ...values]);
}

export function encodeDomain(domain) {
  const encoded = recordParts(DOMAIN, domain);
  for (const value of Object.values(domain)) digest(value, true);
  return h4(TAGS.domain, [ascii(PROFILE), ...encoded]);
}
export function domainCommitment(domain) { return sha(encodeDomain(domain)); }

export function encodeEnvelopeLeaf(input) {
  exact(input, ['domain', 'index', 'kind', 'payload', 'blind']);
  const { domain, index, kind, payload, blind } = input;
  assert.ok(Number.isSafeInteger(index) && !Object.is(index, -0) && index >= 0 && index < 16,
    'FLAT_LEAF_INDEX');
  assert.ok(Object.hasOwn(LEAF_KINDS, kind), 'FLAT_LEAF_KIND');
  const expectedKind = index < 4 ? ['core', 'funding', 'recovery', 'settlement'][index]
    : index < 8 ? 'local' : index < 12 ? 'dependency' : 'payout';
  assert.equal(kind, expectedKind, 'FLAT_LEAF_POSITION');
  const encoded = recordParts(SCHEMAS[kind], payload);
  if (index >= 4) {
    const field = kind === 'dependency' ? 'targetSlot' : 'slot';
    assert.equal(payload[field], String((index - 4) % 4), 'FLAT_SLOT_POSITION');
  }
  if (kind === 'funding') window(payload.fundingNotBefore, payload.fundingValidUntil);
  if (['core', 'recovery', 'settlement'].includes(kind)) {
    assert.ok(BigInt(payload.settleBefore) > 0n, 'FLAT_POSITIVE_CUTOFF');
  }
  return flatFrame(TAGS.leaf, domain,
    [Buffer.from([index]), Buffer.from([LEAF_KINDS[kind]]), digest(blind, true), ...encoded]);
}
export function envelopeLeafCommitment(input) { return sha(encodeEnvelopeLeaf(input)); }

export function encodeReadinessJoin(input) {
  exact(input, ['domain', ...JOIN.map(([name]) => name)]);
  const { domain, ...body } = input;
  const encoded = recordParts(JOIN, body);
  digest(body.blind, true); digest(body.envelope, true); digest(body.targetContext, true);
  window(body.readinessFrom, body.readinessUntil);
  return flatFrame(TAGS.join, domain, encoded);
}
export function readinessJoinCommitment(input) { return sha(encodeReadinessJoin(input)); }

export function encodeReadyOpening(input) {
  exact(input, ['domain', 'joinCommitment', 'descriptor', 'blind']);
  const encoded = recordParts(READY, input.descriptor);
  window(input.descriptor.readyFrom, input.descriptor.readyUntil);
  return flatFrame(TAGS.ready, input.domain,
    [digest(input.joinCommitment, true), digest(input.blind, true), ...encoded]);
}
export function readyOpeningCommitment(input) { return sha(encodeReadyOpening(input)); }

export function encodeCompletionOpening(input) {
  exact(input, ['domain', 'envelope', 'statement', 'blind']);
  const encoded = recordParts(COMPLETION, input.statement);
  window(input.statement.validFrom, input.statement.validUntil);
  // E is inside the commitment: a shared context alone cannot splice two
  // distinct authorization envelopes into the same terminal bundle.
  return flatFrame(TAGS.completion, input.domain,
    [digest(input.envelope, true), digest(input.blind, true), ...encoded]);
}
export function completionOpeningCommitment(input) { return sha(encodeCompletionOpening(input)); }

export function receiptKeyCommitment(input) {
  exact(input, ['ledgerNamespace', 'secret']);
  return sha(h4(TAGS.receiptKey, [digest(input.ledgerNamespace, true), digest(input.secret, true)]));
}
export function nativeAdmissionNullifier(input) {
  exact(input, ['ledgerNamespace', 'secret', 'nativeGid']);
  return sha(h4(TAGS.admissionNullifier,
    [digest(input.ledgerNamespace, true), digest(input.secret, true), digest(input.nativeGid, true)]));
}
export function terminalReceiptTag(input) {
  exact(input, ['ledgerNamespace', 'secret', 'receiptCommitment']);
  return sha(h4(TAGS.terminalReceipt,
    [digest(input.ledgerNamespace, true), digest(input.secret, true), digest(input.receiptCommitment, true)]));
}
export function encodeWireCommitment(key) {
  digest(key, true);
  return ascii('LNRB1:' + key);
}
export function decodeWireCommitment(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length === 70, 'FLAT_WIRE_LENGTH');
  const text = bytes.toString('ascii');
  assert.ok(Buffer.from(text, 'ascii').equals(bytes) && /^LNRB1:[0-9a-f]{64}$/.test(text),
    'FLAT_WIRE_CANONICAL');
  const key = text.slice(6); digest(key, true);
  return key;
}

/** Exact old canonical GID bytes, limited to BTC/SOL for this experiment. */
export function nativeFactIdentity(input) {
  exact(input, ['family', 'genesis', 'asset', 'transactionId', 'effectIndex']);
  assert.ok(input.family === '1' || input.family === '2', 'FLAT_NATIVE_FAMILY');
  const transaction = digest(input.transactionId, true, 64);
  integer(input.effectIndex, 4);
  const bitcoin = input.family === '1';
  if (bitcoin) assert.ok(transaction.subarray(32).equals(Buffer.alloc(32)), 'FLAT_BTC_TXID_PADDING');
  const chain = h4('LIANUM/evidence-chain/1', [ascii(bitcoin ? 'BTC' : 'SOL'),
    digest(input.genesis, true), digest(input.asset, true)]);
  return sha(h4('LIANUM/native-global-effect/1',
    [chain, bitcoin ? transaction.subarray(0, 32) : transaction, ascii(input.effectIndex)]));
}

/** Structural/fact-internal checks only; no RPC, signature or truth check. */
export function encodeNativeFacts(input) {
  const encoded = recordParts(FACTS, input);
  assert.ok(input.family === '1' || input.family === '2', 'FLAT_NATIVE_FAMILY');
  assert.equal(input.effectIndex, '0', 'FLAT_NATIVE_EFFECT_POSITION');
  assert.equal(input.wireBindingVersion, '1', 'FLAT_WIRE_VERSION');
  assert.equal(input.wireBindingKind, input.family, 'FLAT_WIRE_FAMILY');
  assert.equal(input.wireBindingPosition, input.family === '1' ? '2' : '1', 'FLAT_WIRE_POSITION');
  const identity = Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex']
    .map(name => [name, input[name]]));
  assert.equal(input.nativeGid, nativeFactIdentity(identity), 'FLAT_NATIVE_GID');
  const observation = input.observation, context = input.nativeContext;
  window(observation.evidenceFrom, observation.evidenceUntil);
  assert.equal(observation.evidenceFrom, observation.observedAt, 'FLAT_OBSERVATION_WINDOW');
  assert.equal(observation.custodyKind, '1', 'FLAT_NATIVE_CUSTODY_KIND');
  assert.ok(BigInt(observation.amount) > 0n, 'FLAT_NATIVE_POSITIVE_AMOUNT');
  assert.equal(observation.finalityKind, input.family, 'FLAT_NATIVE_FINALITY_KIND');
  for (const key of ['ledgerNamespace', 'hubDomain', 'registryCommitment', 'ruleCommitment',
    'genesis', 'asset', 'nativeGid', 'transactionSHA256', 'wireKeyCommitment']) digest(input[key], true);
  for (const key of ['blockId', 'stateCommitment', 'sourceCommitment', 'destinationCommitment',
    'custodyCommitment']) digest(observation[key], true);
  if (input.family === '1') {
    digest(context.observedTipId, true);
    assert.ok(BigInt(observation.confirmations) >= 6n, 'FLAT_BTC_CONFIRMATIONS');
    assert.equal(BigInt(observation.confirmations),
      BigInt(context.observedTipHeight) - BigInt(observation.blockHeight) + 1n, 'FLAT_BTC_TIP_COUNT');
    for (const key of ['transactionSlot', 'parentSlot', 'observedSlot']) {
      assert.equal(context[key], '0', 'FLAT_BTC_CONTEXT_PADDING');
    }
  } else {
    assert.equal(observation.confirmations, '0', 'FLAT_SOL_CONFIRMATIONS');
    assert.equal(context.observedTipId, ZERO, 'FLAT_SOL_CONTEXT_PADDING');
    assert.equal(context.observedTipHeight, '0', 'FLAT_SOL_CONTEXT_PADDING');
    assert.ok(BigInt(context.parentSlot) < BigInt(context.transactionSlot)
      && BigInt(context.transactionSlot) <= BigInt(context.observedSlot), 'FLAT_SOL_SLOT_ORDER');
  }
  return h4(TAGS.facts, [ascii(FACTS_SCHEMA), ...encoded]);
}
export function nativeFactsDigest(input) { return sha(encodeNativeFacts(input)); }

function nodeHash(left, right) {
  return sha(Buffer.concat([Buffer.from([1]), digest(left), digest(right)]));
}
function pathRoot(input, depth) {
  exact(input, ['leaf', 'index', 'siblings']);
  assert.ok(Number.isSafeInteger(input.index) && !Object.is(input.index, -0)
    && input.index >= 0 && input.index < 2 ** depth, 'FLAT_MERKLE_INDEX');
  array(input.siblings, depth);
  let result = input.leaf; digest(result);
  for (let level = 0; level < depth; level++) {
    result = ((input.index >> level) & 1)
      ? nodeHash(input.siblings[level], result) : nodeHash(result, input.siblings[level]);
  }
  return result;
}
export const computeEnvelopeRoot = input => pathRoot(input, 4);
export const computeAuthorizationRoot = input => pathRoot(input, 6);

/** Owner-side helper. Receives leaf hashes, never claims they satisfy U. */
export function buildEnvelope(leaves) {
  array(leaves, 16); leaves.forEach(leaf => digest(leaf, true));
  const retainedLeaves = [...leaves];
  const nodes = Array(32).fill(ZERO);
  retainedLeaves.forEach((leaf, index) => { nodes[index + 16] = leaf; });
  for (let index = 15; index >= 1; index--) nodes[index] = nodeHash(nodes[index * 2], nodes[index * 2 + 1]);
  return Object.freeze({ root: nodes[1], path(index) {
    assert.ok(Number.isSafeInteger(index) && !Object.is(index, -0) && index >= 0 && index < 16,
      'FLAT_MERKLE_INDEX');
    const siblings = []; let node = index + 16;
    for (let level = 0; level < 4; level++) { siblings.push(nodes[node ^ 1]); node >>= 1; }
    return freeze({ leaf: retainedLeaves[index], index, siblings });
  } });
}
