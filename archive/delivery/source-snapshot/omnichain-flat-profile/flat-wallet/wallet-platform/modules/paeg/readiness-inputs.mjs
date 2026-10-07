/** Scoped P42/R50 witness preparation. Pure host checks/encoding only: no
 * backend, proof verifier, state oracle, signing capability or authority flag.
 * Actual pinned proofs and authenticated state provenance remain mandatory.
 */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { createCommitmentCodec, exactRecord, fixedArray, bytes32, canonicalField,
  validateStruct, structToNoir, digestBytes, digestWords, SCHEMAS, ZERO } from './commitments.mjs';
import { encodeStatement, validateStatement } from './statements.mjs';
import { CATALOG } from '../../../proof-workers/catalog.mjs';
import { validateJobAgainstABI } from '../../../proof-workers/trusted-jobs.mjs';
import { snapshotDigest, snapshotToNoir, membership }
  from '../../../../../omnichain-product/src/paeg/native-state.mjs';
import { nativeReceiptReadOpening, nativeReceiptCommitment, nativeReceiptToNoir, RECEIPT_HASH_FIELDS }
  from '../../../../../omnichain-product/src/paeg/native-receipt.mjs';
import { nativeTransferActionCommitment, nativeActionToNoir }
  from '../../../../../omnichain-product/src/paeg/native-capsules.mjs';

export function frozenInput(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozenInput); Object.freeze(value); }
  return value;
}
/** Snapshot untrusted plain data before any await or legacy codec call. */
export function cloneInput(value) {
  const seen = new Set();
  const visit = v => {
    if (v === null || ['string', 'boolean'].includes(typeof v)) return;
    if (typeof v === 'number') { assert.ok(Number.isSafeInteger(v) && !Object.is(v, -0), 'INPUT_INTEGER'); return; }
    assert.ok(v && typeof v === 'object' && !types.isProxy(v) && !seen.has(v), 'INPUT_PLAIN_DATA');
    seen.add(v);
    if (Array.isArray(v)) fixedArray(v, v.length);
    else { const keys = Reflect.ownKeys(v); assert.ok(keys.every(key => typeof key === 'string')); exactRecord(v, keys); }
    Object.values(v).forEach(visit); seen.delete(v);
  };
  visit(value); return structuredClone(value);
}
export function inputUint(value, bits = 64, maximum = (1n << BigInt(bits)) - 1n) {
  assert.equal(typeof value, 'string', 'INPUT_UINT_STRING');
  assert.ok(value.length <= 39 && /^(0|[1-9][0-9]*)$/.test(value), 'INPUT_UINT_ENCODING');
  const number = BigInt(value); assert.equal(number.toString(), value, 'INPUT_UINT_CANONICAL');
  assert.ok(number <= maximum && number < (1n << BigInt(bits)), 'INPUT_UINT_RANGE'); return number;
}
export function inputPath(value, depth, field = false) {
  exactRecord(value, ['root', 'index', 'siblings']);
  assert.ok(Number.isSafeInteger(value.index) && !Object.is(value.index, -0)
    && value.index >= 0 && value.index < 2 ** depth, 'INPUT_PATH_INDEX');
  fixedArray(value.siblings, depth);
  (field ? canonicalField : bytes32)(value.root);
  value.siblings.forEach(item => (field ? canonicalField : bytes32)(item)); return value;
}
/** ABI is supplied by independently pinned artifact loading. The worker repeats
 * artifact/source checks; an arbitrary caller ABI cannot establish acceptance.
 */
export function validateFlatInputs(relation, abi, inputs, statement) {
  const spec = CATALOG[relation]; assert.ok(spec, 'INPUT_RELATION');
  assert.ok(abi && Array.isArray(abi.parameters) && abi.return_type == null, 'INPUT_VOID_ABI');
  assert.deepEqual(abi.parameters.filter(item => item.visibility === 'public'), spec.publicABI, 'INPUT_PUBLIC_ABI');
  assert.deepEqual(abi.parameters.map(item => item.name), [...spec.publicABI.map(item => item.name), ...spec.privateNames], 'INPUT_PARAMETER_ORDER');
  const checkedStatement = validateStatement(relation, statement);
  const checked = validateJobAgainstABI(abi, inputs, [...encodeStatement(relation, checkedStatement)], relation);
  return frozenInput({ statement: checkedStatement, ...checked });
}
const prefixed = value => '0x' + bytes32(value);
const bare = value => { assert.match(value, /^0x[0-9a-f]{64}$/); return value.slice(2); };
function publicInputs(statement) {
  return Object.fromEntries(Object.entries(statement).map(([name, value]) => [name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase()),
    name.endsWith('From') || name.endsWith('Until') ? value : digestWords(value)]));
}
function zeroReceipt() {
  return Object.fromEntries([...RECEIPT_HASH_FIELDS, 'validFrom', 'validUntil', 'receiptKeyCommitment', 'receiptRho']
    .map(name => [name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase()),
      name === 'validFrom' || name === 'validUntil' ? '0' : Array(32).fill(0)]));
}
async function envelopeOpening(codec, d, envelope, name, opening, index) {
  exactRecord(opening, ['value', 'blind', 'leaf', 'index', 'siblings']);
  assert.equal(opening.index, index, 'INPUT_ENVELOPE_INDEX'); fixedArray(opening.siblings, 4);
  opening.siblings.forEach(value => canonicalField(value)); bytes32(opening.blind, true); canonicalField(opening.leaf, true);
  const value = validateStruct(name, opening.value), leaf = await codec[name + 'Leaf'](d, value, opening.blind);
  assert.equal(leaf, opening.leaf, 'INPUT_TYPED_LEAF');
  assert.equal(await codec.membershipRoot(d, 1, leaf, opening.siblings, index), envelope, 'INPUT_ENVELOPE_MEMBERSHIP');
  return value;
}
async function context(input, codec, kind) {
  const packet = input.packet;
  exactRecord(packet, ['domainCommitment', 'envelope', 'domain', 'core', kind,
    ...(kind === 'local' ? ['action', 'receiptSpendSecret'] : [])]);
  const domain = validateStruct('domain', packet.domain), d = bytes32(packet.domainCommitment, true);
  canonicalField(d, true); canonicalField(packet.envelope, true);
  assert.equal(await codec.domainCommitment(domain), d, 'INPUT_DOMAIN_OPENING');
  const auth = inputPath(input.authorization, 6, true);
  assert.equal(await codec.membershipRoot(d, 0, await codec.authorizationLeaf(d, packet.envelope),
    auth.siblings, auth.index), auth.root, 'INPUT_AUTHORIZATION_MEMBERSHIP');
  const core = await envelopeOpening(codec, d, packet.envelope, 'core', packet.core, 0);
  for (const key of ['context', 'reserveCommitment', 'reserveNullifier']) bytes32(core[key], true);
  const own = validateStruct(kind, packet[kind].value), slot = kind === 'local' ? own.slot : own.targetSlot;
  await envelopeOpening(codec, d, packet.envelope, kind, packet[kind], (kind === 'local' ? 4 : 8) + Number(slot));
  bytes32(own.targetContext, true); bytes32(own.capsuleSalt, true); bytes32(own.targetJoinBlind, true);
  const snapshot = input.snapshot, snapshotNoir = snapshotToNoir(snapshot);
  for (const [source, target] of [['hubDomain', 'hubDomain'], ['registryCommitment', 'registryCommitment'],
    ['scope', 'scope'], ['policy', 'policy'], ['assetIdentity', 'asset']])
    assert.equal(snapshot[source], prefixed(domain[target]), 'INPUT_SNAPSHOT_DOMAIN');
  assert.equal(snapshot.halt, '0', 'INPUT_HALTED_SNAPSHOT');
  const from = inputUint(input.readyFrom), until = inputUint(input.readyUntil);
  assert.ok(from < until && from <= inputUint(snapshot.timestamp) && inputUint(snapshot.timestamp) < until, 'INPUT_READY_WINDOW');
  assert.ok(until <= inputUint(core.settleBefore), 'INPUT_READY_CUTOFF');
  const evidence = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    receiptRoot: bare(snapshot.receiptRoot), receiptCount: snapshot.receiptCount,
    revokedDigest: bare(snapshot.revokedDigest), revokedCount: snapshot.revokedCount,
    revocationSequence: snapshot.revocationSequence };
  const checkpoint = bare(snapshotDigest(snapshot)), evidenceState = await codec.evidenceStateDigest(d, evidence);
  const join = await codec.joinCommitment(d, { envelope: packet.envelope, targetContext: own.targetContext,
    authorizationRoot: auth.root, checkpoint, readinessEvidenceState: evidenceState,
    readyFrom: input.readyFrom, readyUntil: input.readyUntil, targetJoinBlind: own.targetJoinBlind });
  const statement = { domainCommitment: d, authorizationRoot: auth.root, checkpoint,
    readinessEvidenceState: evidenceState, joinCommitment: join, readyFrom: input.readyFrom, readyUntil: input.readyUntil };
  const common = { domain: structToNoir('domain', domain), envelope: digestBytes(packet.envelope),
    authorization_siblings: auth.siblings.map(digestBytes), authorization_index: auth.index,
    core: structToNoir('core', core), core_blind: digestBytes(packet.core.blind), core_siblings: packet.core.siblings.map(digestBytes),
    snapshot: snapshotNoir };
  return { packet, domain, d, auth, core, own, evidence, statement, common };
}
/** Only the dependency actor packet plus incoming receipt read openings. */
export async function buildDependencyInputs(raw, options) {
  exactRecord(options, ['hashFields', 'abi']); const input = cloneInput(raw);
  exactRecord(input, ['packet', 'authorization', 'snapshot', 'readyFrom', 'readyUntil', 'predecessorReceipts', 'revokedEntries']);
  const codec = createCommitmentCodec({ hashFields: options.hashFields }), c = await context(input, codec, 'dependency');
  const { own: dependency, evidence, domain, d } = c;
  fixedArray(input.revokedEntries, 64);
  assert.equal(await codec.revokedDigest(d, domain.hubDomain, input.revokedEntries, evidence.revokedCount), evidence.revokedDigest, 'INPUT_REVOKED_DIGEST');
  const count = Number(dependency.dependencyCount); fixedArray(input.predecessorReceipts, count);
  const receipts = [], paths = [], indexes = [];
  for (let i = 0; i < 3; i++) {
    const predecessor = dependency.predecessors[i];
    if (i < count) {
      assert.ok(Number(predecessor.sourceSlot) < Number(dependency.targetSlot)
        && (i === 0 || Number(dependency.predecessors[i - 1].sourceSlot) < Number(predecessor.sourceSlot)), 'INPUT_PREDECESSOR_ORDER');
      const supplied = input.predecessorReceipts[i]; exactRecord(supplied, ['opening', 'path']);
      const opening = nativeReceiptReadOpening(supplied.opening), path = inputPath(supplied.path, 6, true);
      for (const name of ['hubDomain', 'registryCommitment', 'scope', 'policy']) assert.equal(opening[name], domain[name], 'INPUT_RECEIPT_DOMAIN');
      for (const [name, source] of [['localCommitment', 'sourceLocalCommitment'], ['dispatchId', 'sourceDispatchId'],
        ...['chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'].map(name => [name, name])])
        assert.equal(opening[name], predecessor[source], 'INPUT_PREDECESSOR_TERMS');
      assert.ok(inputUint(opening.validFrom) <= inputUint(input.readyFrom)
        && inputUint(input.readyUntil) <= inputUint(opening.validUntil), 'INPUT_RECEIPT_WINDOW');
      assert.ok(BigInt(path.index) < inputUint(evidence.receiptCount, 32, 64n), 'INPUT_RECEIPT_INDEX');
      assert.equal(path.root, evidence.receiptRoot, 'INPUT_RECEIPT_ROOT');
      const leaf = await codec.receiptLeaf(d, nativeReceiptCommitment(opening));
      assert.equal(await codec.membershipRoot(d, 2, leaf, path.siblings, path.index), evidence.receiptRoot, 'INPUT_RECEIPT_MEMBERSHIP');
      assert.ok(!input.revokedEntries.slice(0, Number(evidence.revokedCount)).includes(opening.globalEffectId), 'INPUT_RECEIPT_REVOKED');
      receipts.push(nativeReceiptToNoir(opening)); paths.push(path.siblings.map(digestBytes)); indexes.push(path.index);
    } else {
      for (const [name, value] of Object.entries(predecessor)) assert.equal(value, name === 'sourceSlot' ? '0' : ZERO, 'INPUT_PREDECESSOR_PADDING');
      receipts.push(zeroReceipt()); paths.push(Array.from({ length: 6 }, () => Array(32).fill(0))); indexes.push(0);
    }
  }
  const inputs = { ...publicInputs(c.statement), ...c.common,
    dependency: structToNoir('dependency', dependency), dependency_blind: digestBytes(c.packet.dependency.blind),
    dependency_siblings: c.packet.dependency.siblings.map(digestBytes), predecessor_receipts: receipts,
    receipt_siblings: paths, receipt_indexes: indexes, revoked_entries: input.revokedEntries.map(digestBytes) };
  return validateFlatInputs('dependency', options.abi, inputs, c.statement);
}
/** Reconstruct the legacy R98 message from exactly the shared descriptor. */
export function readyDescriptorWords(descriptor) {
  validateStruct('ready', descriptor);
  return Object.freeze(SCHEMAS.ready.flatMap(([name, type]) => type === 'bytes32'
    ? digestWords(descriptor[name]).map(String) : [descriptor[name]]));
}
/** Only this local actor packet plus SHA reserve membership/unspent state. */
export async function buildReadyInputs(raw, options) {
  exactRecord(options, ['hashFields', 'abi']); const input = cloneInput(raw);
  exactRecord(input, ['packet', 'authorization', 'snapshot', 'readyFrom', 'readyUntil', 'reservePath', 'poolSpentEntries', 'readinessBlind']);
  const codec = createCommitmentCodec({ hashFields: options.hashFields }), c = await context(input, codec, 'local');
  const { own: local, core, domain, d } = c, action = c.packet.action;
  assert.equal(local.active, true, 'INPUT_READY_ACTIVE'); bytes32(c.packet.receiptSpendSecret, true);
  assert.equal(nativeTransferActionCommitment(action), local.actionCommitment, 'INPUT_ACTION_COMMITMENT');
  for (const name of ['chainDomain', 'receiptKeyCommitment', 'receiptRho']) assert.equal(action[name], local[name], 'INPUT_ACTION_TERMS');
  assert.equal(action.settleBefore, core.settleBefore, 'INPUT_ACTION_CUTOFF');
  assert.ok(inputUint(action.executionFrom) <= inputUint(input.readyFrom)
    && inputUint(input.readyUntil) <= inputUint(action.executionUntil), 'INPUT_EXECUTION_WINDOW');
  const reserve = inputPath(input.reservePath, 6); assert.equal(prefixed(reserve.root), input.snapshot.poolRoot, 'INPUT_RESERVE_ROOT');
  membership(prefixed(core.reserveCommitment), reserve.siblings.map(prefixed), String(reserve.index), input.snapshot.poolRoot);
  fixedArray(input.poolSpentEntries, 64); const count = Number(inputUint(input.snapshot.poolSpentCount, 32, 64n));
  const bytes = [];
  input.poolSpentEntries.forEach((value, index) => {
    bytes32(value, index < count); if (index >= count) assert.equal(value, ZERO, 'INPUT_SPENT_PADDING');
    if (index < count) assert.notEqual(value, core.reserveNullifier, 'INPUT_RESERVE_SPENT'); bytes.push(Buffer.from(value, 'hex'));
  });
  // Preserve R's original SHA prefix/vector predicate (no new uniqueness rule).
  const countBytes = Buffer.alloc(4); countBytes.writeUInt32BE(count);
  const spent = createHash('sha256').update(Buffer.concat([Buffer.from([2]), Buffer.from(domain.scope, 'hex'), countBytes, ...bytes])).digest('hex');
  assert.equal(prefixed(spent), input.snapshot.poolSpentDigest, 'INPUT_POOL_SPENT_DIGEST');
  bytes32(input.readinessBlind, true);
  const descriptor = { scope: domain.scope, policy: domain.policy, asset: domain.asset,
    hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment, snapshotDigest: c.statement.checkpoint,
    localCommitment: local.localCommitment, dispatchId: local.dispatchId, chainDomain: local.chainDomain,
    evidencePolicy: local.evidencePolicy, actionCommitment: local.actionCommitment, payoutCommitment: local.payoutCommitment,
    readyFrom: input.readyFrom, readyUntil: input.readyUntil };
  const readinessCommitment = await codec.readinessCommitment(d, c.statement.joinCommitment, input.readinessBlind, descriptor);
  const statement = { ...c.statement, readinessCommitment };
  const inputs = { ...publicInputs(statement), ...c.common, local: structToNoir('local', local),
    local_blind: digestBytes(c.packet.local.blind), local_siblings: c.packet.local.siblings.map(digestBytes), action: nativeActionToNoir(action),
    reserve_siblings: reserve.siblings.map(digestBytes), reserve_index: reserve.index,
    pool_spent_entries: input.poolSpentEntries.map(digestBytes), readiness_blind: digestBytes(input.readinessBlind) };
  const job = validateFlatInputs('ready', options.abi, inputs, statement);
  // This seal is the only R-specific private opening I requires. It deliberately
  // omits E, Core, authorization paths, local packet, action and spend secret.
  return frozenInput({ ...job, admissionOpening: { domain: cloneInput(domain), descriptor, readinessBlind: input.readinessBlind } });
}
