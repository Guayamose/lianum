/**
 * Owner-only C129 preparation for LIANUM_PAEG_NATIVE_4_V2.
 *
 * Keep this capability in the owner's process until prepositioning finishes,
 * then drop it and exit. Hand each actor only its selected role packet. A
 * Dependency actor must never also receive its target Ready/Node packet, action,
 * receipt, or any receipt spend secret. The assembler receives proof packages,
 * never this capability or capsule preimages. This is an explicit non-collusion
 * profile, not independent OS isolation or protection from a common operator.
 *
 * These encoders do not verify recursive proofs, native finality, registry
 * semantics or acceptance of a loss-allocation quote. C verifies the actual
 * pinned A0; deployment/I enforce registry/native policy. No C key is invented
 * here, and no API accepts a signing key or generates a proof.
 */
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { compileGraph } from '../../graph/graph.mjs';
import { FUNDED_GRAPH_PROFILE, fundedAuthorizationWords, fundedHash,
  ownerAuthorizationMessage, payoutInvoiceMessage } from '../../graph/funded-graph.mjs';
import { uintBE, wordsBE } from '../../../notes/private-note-encoding.mjs';

export const NATIVE_CAPSULE_PROFILE = Object.freeze({
  id: 'LIANUM_PAEG_NATIVE_4_V2', capacity: 4, authorizationWords: 129,
  cryptographicAcceptance: false, privacy: 'SCOPED_ROLES_WITH_NON_COLLUSION',
});
export const NATIVE_CAPSULE_DOMAINS = Object.freeze({
  context: 'LIANUM/PAEG/a0-context/2',
  target: 'LIANUM/PAEG/readiness-target/2',
  local: 'LIANUM/PAEG/local-capsule/2',
  dependency: 'LIANUM/PAEG/dependency-capsule/2',
  receiptKey: 'LIANUM/PAEG/receipt-key/2',
  unused: 'LIANUM/PAEG/unused-receipt-spend/2',
  action: 'LIANUM/PAEG/native-transfer-action/2',
});
const ZERO = '0'.repeat(64);
const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const PROFILE = Buffer.from(NATIVE_CAPSULE_PROFILE.id, 'ascii');
const COMMON_FIELDS = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'context',
  'reserveCommitment', 'reserveNullifier'];
const ACTION_FIELDS = ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment',
  'amount', 'custodyKind', 'custodyCommitment', 'executionFrom', 'executionUntil', 'settleBefore',
  'receiptKeyCommitment', 'receiptRho', 'deliveryRiskCommitment', 'actionSalt'];
const LOCAL_FIELDS = ['slot', 'active', 'targetContext', 'nodeCommitment', 'localCommitment', 'dispatchId',
  'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment',
  'receiptRho', 'dummyTerminalTag', 'capsuleSalt'];
const SOURCE_FIELDS = ['sourceSlot', 'sourceNodeCommitment', 'sourceLocalCommitment', 'sourceDispatchId',
  'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'];
const DEPENDENCY_FIELDS = ['targetSlot', 'targetContext', 'dependencyCount', 'predecessors', 'capsuleSalt'];
const A0_DIGEST_FIELDS = ['scope', 'policy', 'asset', 'operationId', 'inputCommitment', 'inputNullifier',
  'reservationIntent', 'graphCommitment', 'treeRoot', 'reserveCommitment', 'reserveNullifier', 'changeCommitment'];
const A0_TIME_FIELDS = ['fundingNotBefore', 'fundingValidUntil', 'settleBefore'];

function exact(value, fields, code = 'PAEG_CAPSULE_FIELDS') {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), code);
}
function hash(value, allowZero = false) {
  assert.equal(typeof value, 'string', 'PAEG_CAPSULE_HASH');
  assert.match(value, /^[0-9a-f]{64}$/, 'PAEG_CAPSULE_HASH');
  assert.ok(allowZero || value !== ZERO, 'PAEG_CAPSULE_ZERO_HASH');
  return Buffer.from(value, 'hex');
}
function integer(value, bits, positive = false) {
  assert.equal(typeof value, 'string', 'PAEG_CAPSULE_INTEGER');
  assert.match(value, /^(0|[1-9][0-9]*)$/, 'PAEG_CAPSULE_INTEGER');
  assert.ok(value.length <= Math.ceil(bits / 3) && BigInt(value) < (1n << BigInt(bits)), 'PAEG_CAPSULE_INTEGER');
  assert.ok(!positive || BigInt(value) > 0n, 'PAEG_CAPSULE_POSITIVE');
  return uintBE(value, bits / 8);
}
function slot(value) {
  assert.ok(Number.isInteger(value) && value >= 0 && value < 4, 'PAEG_CAPSULE_SLOT');
  return uintBE(value, 1);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const bytes = value => [...hash(value, true)];
const words = value => wordsBE(hash(value)).map(Number);
const snake = key => key.replace(/[A-Z]/g, char => '_' + char.toLowerCase());
const capsulePrefix = terms => [PROFILE, hash(terms.hubDomain), hash(terms.registryCommitment), hash(terms.context)];

/** Hash every exact A0 term, retaining 17 digests + three u64BE parts. */
export function a0Context(statement) {
  fundedAuthorizationWords(statement);
  return fundedHash(NATIVE_CAPSULE_DOMAINS.context, [Buffer.from(FUNDED_GRAPH_PROFILE.id, 'ascii'),
    ...A0_DIGEST_FIELDS.map(key => hash(statement[key])), ...statement.outputs.map(value => hash(value)),
    hash(statement.recoveryCommitment), ...A0_TIME_FIELDS.map(key => integer(statement[key], 64))]);
}

export function nativeReceiptKeyCommitment(hubDomain, receiptSpendSecret) {
  return fundedHash(NATIVE_CAPSULE_DOMAINS.receiptKey, [hash(hubDomain), hash(receiptSpendSecret)]);
}

/** Exact v2 typed native transfer; a risk commitment does not prove acceptance. */
export function nativeTransferActionCommitment(action) {
  exact(action, ACTION_FIELDS, 'PAEG_CAPSULE_ACTION_FIELDS');
  const numbers = new Set(['amount', 'custodyKind', 'executionFrom', 'executionUntil', 'settleBefore']);
  for (const key of ACTION_FIELDS) if (!numbers.has(key)) hash(action[key]);
  integer(action.amount, 128, true);
  assert.equal(action.custodyKind, 1, 'PAEG_CAPSULE_CUSTODY_KIND');
  for (const key of ['executionFrom', 'executionUntil', 'settleBefore']) integer(action[key], 64);
  assert.ok(BigInt(action.executionFrom) < BigInt(action.executionUntil)
    && BigInt(action.executionUntil) <= BigInt(action.settleBefore), 'PAEG_CAPSULE_ACTION_INTERVAL');
  return fundedHash(NATIVE_CAPSULE_DOMAINS.action, [PROFILE, ...ACTION_FIELDS.map(key =>
    key === 'amount' ? integer(action[key], 128, true)
      : key === 'custodyKind' ? uintBE(action[key], 1)
        : ['executionFrom', 'executionUntil', 'settleBefore'].includes(key) ? integer(action[key], 64) : hash(action[key]))]);
}

export function localCapsuleCommitment(terms, capsule) {
  exact(capsule, LOCAL_FIELDS, 'PAEG_CAPSULE_LOCAL_FIELDS');
  assert.equal(typeof capsule.active, 'boolean', 'PAEG_CAPSULE_ACTIVE');
  return fundedHash(NATIVE_CAPSULE_DOMAINS.local, [...capsulePrefix(terms), ...LOCAL_FIELDS.map(key =>
    key === 'slot' ? slot(capsule[key]) : key === 'active' ? uintBE(capsule[key] ? 1 : 0, 1) : hash(capsule[key], true))]);
}

export function dependencyCapsuleCommitment(terms, capsule) {
  exact(capsule, DEPENDENCY_FIELDS, 'PAEG_CAPSULE_DEPENDENCY_FIELDS');
  slot(capsule.targetSlot);
  assert.ok(Number.isInteger(capsule.dependencyCount) && capsule.dependencyCount >= 0
    && capsule.dependencyCount <= 3, 'PAEG_CAPSULE_DEPENDENCY_COUNT');
  assert.ok(Array.isArray(capsule.predecessors) && capsule.predecessors.length === 3, 'PAEG_CAPSULE_PREDECESSORS');
  const predecessors = capsule.predecessors.flatMap(source => {
    exact(source, SOURCE_FIELDS, 'PAEG_CAPSULE_PREDECESSOR_FIELDS');
    return SOURCE_FIELDS.map(key => key === 'sourceSlot' ? slot(source[key]) : hash(source[key], true));
  });
  return fundedHash(NATIVE_CAPSULE_DOMAINS.dependency, [...capsulePrefix(terms), slot(capsule.targetSlot),
    hash(capsule.targetContext), uintBE(capsule.dependencyCount, 1), ...predecessors, hash(capsule.capsuleSalt)]);
}

export function capsuleAuthorizationWords(statement) {
  exact(statement, ['profile', ...COMMON_FIELDS, 'localCapsuleCommitments', 'dependencyCapsuleCommitments', 'settleBefore'],
    'PAEG_CAPSULE_STATEMENT_FIELDS');
  assert.equal(statement.profile, NATIVE_CAPSULE_PROFILE.id, 'PAEG_CAPSULE_PROFILE');
  for (const key of ['localCapsuleCommitments', 'dependencyCapsuleCommitments']) {
    assert.ok(Array.isArray(statement[key]) && statement[key].length === 4, 'PAEG_CAPSULE_COMMITMENT_COUNT');
  }
  integer(statement.settleBefore, 64, true);
  const result = [...COMMON_FIELDS.flatMap(key => words(statement[key])),
    ...statement.localCapsuleCommitments.flatMap(words), ...statement.dependencyCapsuleCommitments.flatMap(words),
    statement.settleBefore].map(String);
  assert.equal(result.length, 129, 'PAEG_CAPSULE_ABI');
  return result;
}

function checkSignedGraph(signed) {
  exact(signed, ['authorizationStatement', 'admissionTag', 'ownerWitness', 'signatures'], 'PAEG_CAPSULE_SIGNED_FIELDS');
  const s = signed.authorizationStatement, w = signed.ownerWitness;
  fundedAuthorizationWords(s);
  hash(signed.admissionTag);
  exact(w, ['budget', 'reservationNonce', 'reserveSecret', 'inputNote', 'changeNote', 'recoveryNote', 'payouts', 'paddingSalts', 'graph'],
    'PAEG_CAPSULE_OWNER_FIELDS');
  integer(w.budget, 64, true); hash(w.reservationNonce); hash(w.reserveSecret);
  for (const [index, note] of [w.inputNote, w.changeNote, w.recoveryNote].entries()) {
    exact(note, ['type', note.type === 4 ? 'rho' : 'origin', 'x', 'y', 'value', 'secret'], 'PAEG_CAPSULE_NOTE_FIELDS');
    assert.ok(index === 0 ? [2, 3, 4].includes(note.type) : note.type === 4, 'PAEG_CAPSULE_NOTE_TYPE');
    for (const key of [note.type === 4 ? 'rho' : 'origin', 'x', 'y', 'secret']) hash(note[key], true);
    integer(note.value, 64, index !== 1);
  }
  assert.ok(Array.isArray(w.payouts), 'PAEG_CAPSULE_PAYOUTS');
  w.payouts.forEach(note => {
    exact(note, ['type', 'rho', 'x', 'y', 'value', 'secret', 'randomness'], 'PAEG_CAPSULE_PAYOUT_FIELDS');
    assert.equal(note.type, 4, 'PAEG_CAPSULE_NOTE_TYPE'); integer(note.value, 64, true);
    for (const key of ['rho', 'x', 'y', 'secret', 'randomness']) hash(note[key], true);
  });
  assert.ok(Array.isArray(w.paddingSalts) && w.paddingSalts.length === 4, 'PAEG_CAPSULE_PADDING');
  w.paddingSalts.forEach(value => hash(value, true));
  exact(w.graph, ['nonce', 'activeCount', 'treeRoot', 'nodes', 'leaves'], 'PAEG_CAPSULE_GRAPH_FIELDS');
  assert.ok(Array.isArray(w.graph.nodes), 'PAEG_CAPSULE_GRAPH_NODES');
  w.graph.nodes.forEach(node => exact(node, ['id', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment',
    'dependsOn', 'index', 'dependencyIndexes', 'dependencyMask', 'salt', 'commitment'], 'PAEG_CAPSULE_GRAPH_NODE_FIELDS'));
  const graph = compileGraph({ version: 1, scope: s.scope, policy: s.policy, operationId: s.operationId,
    expiresAt: s.settleBefore, reservedCommitment: s.reservationIntent, recoveryCommitment: s.recoveryCommitment,
    nonce: w.graph.nonce, nodes: w.graph.nodes.map(node => Object.fromEntries(
      ['id', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'dependsOn'].map(key => [key, node[key]]))) });
  assert.deepEqual(w.graph, graph.ownerWitness, 'PAEG_CAPSULE_GRAPH_OPENING');
  assert.equal(graph.authorizationStatement.graphCommitment, s.graphCommitment, 'PAEG_CAPSULE_GRAPH_COMMITMENT');
  assert.equal(graph.authorizationStatement.treeRoot, s.treeRoot, 'PAEG_CAPSULE_GRAPH_ROOT');
  assert.equal(w.payouts.length, w.graph.activeCount, 'PAEG_CAPSULE_PAYOUTS');
  w.graph.nodes.forEach((node, i) => assert.equal(node.payoutCommitment, s.outputs[i], 'PAEG_CAPSULE_GRAPH_PAYOUT'));
  exact(signed.signatures, ['ownerSignature', 'invoiceSignatures'], 'PAEG_CAPSULE_SIGNATURE_FIELDS');
  const checkSignature = (note, message, signature) => {
    assert.equal(typeof signature, 'string', 'PAEG_CAPSULE_SIGNATURE');
    assert.match(signature, /^[0-9a-f]{128}$/, 'PAEG_CAPSULE_SIGNATURE');
    const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
      x: hash(note.x, true).toString('base64url'), y: hash(note.y, true).toString('base64url') } });
    assert.ok(verify('sha256', message, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex')),
      'PAEG_CAPSULE_SIGNATURE');
  };
  checkSignature(w.inputNote, ownerAuthorizationMessage(s), signed.signatures.ownerSignature);
  assert.ok(Array.isArray(signed.signatures.invoiceSignatures) && signed.signatures.invoiceSignatures.length === 4,
    'PAEG_CAPSULE_INVOICE_COUNT');
  for (let i = 0; i < 4; i++) {
    if (i < w.graph.activeCount) checkSignature(w.payouts[i], payoutInvoiceMessage(s, w.graph.nodes[i], i),
      signed.signatures.invoiceSignatures[i]);
    else assert.equal(signed.signatures.invoiceSignatures[i], '0'.repeat(128), 'PAEG_CAPSULE_UNUSED_INVOICE');
  }
  return graph;
}

function graphWitness(graph) {
  const nodes = Array.from({ length: 4 }, (_, i) => graph.nodes[i]);
  const digests = field => nodes.map(node => bytes(node?.[field] ?? ZERO));
  return { nonce: bytes(graph.nonce), active_count: graph.activeCount,
    node_ids: nodes.map(node => [...Buffer.from(node?.id ?? '', 'ascii'), ...Array(64 - (node?.id.length ?? 0)).fill(0)]),
    node_id_lengths: nodes.map(node => node?.id.length ?? 0),
    dependency_counts: nodes.map(node => node?.dependencyIndexes.length ?? 0),
    dependency_indexes: nodes.map(node => [...(node?.dependencyIndexes ?? []), ...Array(3 - (node?.dependencyIndexes.length ?? 0)).fill(0)]),
    chain_domains: digests('chainDomain'), evidence_policies: digests('evidencePolicy'),
    action_commitments: digests('actionCommitment'), payout_commitments: digests('payoutCommitment') };
}
const localWitness = local => Object.fromEntries(LOCAL_FIELDS.map(key => [snake(key),
  ['slot', 'active'].includes(key) ? local[key] : bytes(local[key])]));
const actionWitness = action => Object.fromEntries(ACTION_FIELDS.map(key => [snake(key),
  ['amount', 'custodyKind', 'executionFrom', 'executionUntil', 'settleBefore'].includes(key) ? action[key] : bytes(action[key])]));
const dependencyWitness = dependency => Object.fromEntries(DEPENDENCY_FIELDS.map(key => [snake(key),
  key === 'predecessors' ? dependency.predecessors.map(source => Object.fromEntries(SOURCE_FIELDS.map(field =>
    [snake(field), field === 'sourceSlot' ? source[field] : bytes(source[field])])))
    : ['targetSlot', 'dependencyCount'].includes(key) ? dependency[key] : bytes(dependency[key])]));
const emptyAction = () => Object.fromEntries(ACTION_FIELDS.map(key => [key,
  key === 'custodyKind' ? 0 : ['amount', 'executionFrom', 'executionUntil', 'settleBefore'].includes(key) ? '0' : ZERO]));
const emptySource = () => Object.fromEntries(SOURCE_FIELDS.map(key => [key, key === 'sourceSlot' ? 0 : ZERO]));

/** Scoped, pure ABI conversion. Authentication still requires the C proof. */
export function localCapsuleToNoir(capsule) {
  exact(capsule, LOCAL_FIELDS, 'PAEG_CAPSULE_LOCAL_FIELDS');
  slot(capsule.slot);
  assert.equal(typeof capsule.active, 'boolean', 'PAEG_CAPSULE_ACTIVE');
  for (const key of ['targetContext', 'nodeCommitment', 'payoutCommitment', 'capsuleSalt']) hash(capsule[key]);
  const nativeFields = ['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy',
    'actionCommitment', 'receiptKeyCommitment', 'receiptRho'];
  if (capsule.active) {
    nativeFields.forEach(key => hash(capsule[key]));
    assert.equal(capsule.dummyTerminalTag, ZERO, 'PAEG_CAPSULE_ACTIVE_DUMMY');
  } else {
    nativeFields.forEach(key => assert.equal(capsule[key], ZERO, 'PAEG_CAPSULE_INACTIVE_NATIVE'));
    hash(capsule.dummyTerminalTag);
  }
  return localWitness(capsule);
}

/** The Dependency actor can encode its fragment without obtaining any local capsule. */
export function dependencyCapsuleToNoir(capsule) {
  exact(capsule, DEPENDENCY_FIELDS, 'PAEG_CAPSULE_DEPENDENCY_FIELDS');
  slot(capsule.targetSlot); hash(capsule.targetContext); hash(capsule.capsuleSalt);
  assert.ok(Number.isInteger(capsule.dependencyCount) && capsule.dependencyCount >= 0
    && capsule.dependencyCount <= capsule.targetSlot, 'PAEG_CAPSULE_DEPENDENCY_COUNT');
  assert.ok(Array.isArray(capsule.predecessors) && capsule.predecessors.length === 3, 'PAEG_CAPSULE_PREDECESSORS');
  capsule.predecessors.forEach((source, i) => {
    exact(source, SOURCE_FIELDS, 'PAEG_CAPSULE_PREDECESSOR_FIELDS');
    if (i < capsule.dependencyCount) {
      slot(source.sourceSlot);
      assert.ok(source.sourceSlot < capsule.targetSlot, 'PAEG_CAPSULE_DEPENDENCY_ORDER');
      if (i) assert.ok(source.sourceSlot > capsule.predecessors[i - 1].sourceSlot, 'PAEG_CAPSULE_DEPENDENCY_ORDER');
      SOURCE_FIELDS.filter(key => key !== 'sourceSlot').forEach(key => hash(source[key]));
    } else assert.deepEqual(source, emptySource(), 'PAEG_CAPSULE_UNUSED_PREDECESSOR');
  });
  return dependencyWitness(capsule);
}

/** Active action only. Inactive Node capsules carry no action opening. */
export function nativeActionToNoir(action) {
  nativeTransferActionCommitment(action);
  return actionWitness(action);
}

function recursiveFields(values, length, code) {
  assert.ok(Array.isArray(values) && values.length === length, code);
  return values.map(value => {
    assert.ok(typeof value === 'string' && /^(?:0|[1-9][0-9]*|0x[0-9a-fA-F]+)$/.test(value)
      && value.length <= 80, code);
    const n = BigInt(value); assert.ok(n < FIELD_MODULUS, code); return n.toString();
  });
}

/**
 * Prepare after the owner signed the funded graph containing these actionCMs.
 * Each node is { id, action, receiptSpendSecret }; slotSalts has exactly four
 * { targetSalt, localCapsuleSalt, dependencyCapsuleSalt } entries. Secrets and
 * salts must be independently sampled by the owner. Returned selectors are
 * owner capabilities, not a serializable coordinator packet.
 */
export function prepareNativeCapsules(input) {
  exact(input, ['signed', 'hubDomain', 'registryCommitment', 'nodes', 'slotSalts'], 'PAEG_CAPSULE_INPUT_FIELDS');
  hash(input.hubDomain); hash(input.registryCommitment);
  const signed = structuredClone(input.signed), graph = checkSignedGraph(signed), s = signed.authorizationStatement;
  assert.ok(Array.isArray(input.nodes) && input.nodes.length === graph.ownerWitness.activeCount, 'PAEG_CAPSULE_NODE_COUNT');
  const byId = new Map();
  for (const node of input.nodes) {
    exact(node, ['id', 'action', 'receiptSpendSecret'], 'PAEG_CAPSULE_NODE_FIELDS');
    assert.equal(typeof node.id, 'string', 'PAEG_CAPSULE_NODE_ID');
    assert.ok(!byId.has(node.id), 'PAEG_CAPSULE_DUPLICATE_NODE');
    hash(node.receiptSpendSecret);
    nativeTransferActionCommitment(node.action);
    byId.set(node.id, structuredClone(node));
  }
  assert.ok(Array.isArray(input.slotSalts) && input.slotSalts.length === 4, 'PAEG_CAPSULE_SALT_COUNT');
  const salts = structuredClone(input.slotSalts);
  salts.forEach(value => { exact(value, ['targetSalt', 'localCapsuleSalt', 'dependencyCapsuleSalt'], 'PAEG_CAPSULE_SALT_FIELDS');
    Object.values(value).forEach(v => hash(v)); });
  const terms = { profile: NATIVE_CAPSULE_PROFILE.id, scope: s.scope, policy: s.policy, asset: s.asset,
    hubDomain: input.hubDomain, registryCommitment: input.registryCommitment, context: a0Context(s),
    reserveCommitment: s.reserveCommitment, reserveNullifier: s.reserveNullifier, settleBefore: s.settleBefore };
  const actions = [], secrets = [];
  const locals = Array.from({ length: 4 }, (_, i) => {
    const node = graph.ownerWitness.nodes[i], active = i < graph.ownerWitness.activeCount;
    const targetContext = fundedHash(NATIVE_CAPSULE_DOMAINS.target, [PROFILE, hash(terms.hubDomain), hash(terms.context),
      slot(i), hash(salts[i].targetSalt)]);
    hash(targetContext);
    const local = { slot: i, active, targetContext, nodeCommitment: graph.ownerWitness.leaves[i],
      localCommitment: ZERO, dispatchId: ZERO, chainDomain: ZERO, evidencePolicy: ZERO, actionCommitment: ZERO,
      payoutCommitment: s.outputs[i], receiptKeyCommitment: ZERO, receiptRho: ZERO,
      dummyTerminalTag: ZERO, capsuleSalt: salts[i].localCapsuleSalt };
    if (active) {
      const privateNode = byId.get(node.id); assert.ok(privateNode, 'PAEG_CAPSULE_NODE_ID');
      const action = privateNode.action;
      assert.equal(action.settleBefore, s.settleBefore, 'PAEG_CAPSULE_ACTION_CUTOFF');
      assert.equal(action.chainDomain, node.chainDomain, 'PAEG_CAPSULE_ACTION_CHAIN');
      assert.equal(action.receiptKeyCommitment, nativeReceiptKeyCommitment(terms.hubDomain, privateNode.receiptSpendSecret),
        'PAEG_CAPSULE_RECEIPT_KEY');
      assert.equal(nativeTransferActionCommitment(action), node.actionCommitment, 'PAEG_CAPSULE_ACTION_COMMITMENT');
      const packet = graph.executorPacket(node.id);
      for (const key of ['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment']) local[key] = packet[key];
      local.receiptKeyCommitment = action.receiptKeyCommitment; local.receiptRho = action.receiptRho;
      actions.push(action); secrets.push(privateNode.receiptSpendSecret);
    } else {
      local.dummyTerminalTag = fundedHash(NATIVE_CAPSULE_DOMAINS.unused, [hash(terms.hubDomain), hash(s.reserveNullifier),
        hash(graph.ownerWitness.nonce), slot(i)]);
      actions.push(emptyAction()); secrets.push(ZERO);
    }
    return local;
  });
  assert.equal(new Set(locals.map(local => local.targetContext)).size, 4, 'PAEG_CAPSULE_TARGET_COLLISION');
  const dependencies = locals.map((local, i) => {
    const indexes = graph.ownerWitness.nodes[i]?.dependencyIndexes ?? [];
    return { targetSlot: i, targetContext: local.targetContext, dependencyCount: indexes.length,
      predecessors: Array.from({ length: 3 }, (_, d) => {
        if (d >= indexes.length) return emptySource();
        const source = locals[indexes[d]];
        return { sourceSlot: source.slot, sourceNodeCommitment: source.nodeCommitment, sourceLocalCommitment: source.localCommitment,
          sourceDispatchId: source.dispatchId, ...Object.fromEntries(['chainDomain', 'evidencePolicy', 'actionCommitment',
            'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'].map(key => [key, source[key]])) };
      }), capsuleSalt: salts[i].dependencyCapsuleSalt };
  });
  const statement = freeze({ ...terms, localCapsuleCommitments: locals.map(local => localCapsuleCommitment(terms, local)),
    dependencyCapsuleCommitments: dependencies.map(dependency => dependencyCapsuleCommitment(terms, dependency)) });
  capsuleAuthorizationWords(statement);
  const selected = i => { slot(i); return i; };
  const publicContext = () => ({ profile: terms.profile, scope: terms.scope, policy: terms.policy, asset: terms.asset,
    hubDomain: terms.hubDomain, registryCommitment: terms.registryCommitment, context: terms.context, settleBefore: terms.settleBefore });
  return Object.freeze({
    statement,
    readyRole(i) {
      selected(i); assert.ok(locals[i].active, 'PAEG_CAPSULE_INACTIVE_READY');
      return freeze({ ...publicContext(), localCapsule: structuredClone(locals[i]), action: structuredClone(actions[i]),
        localCapsuleCommitment: statement.localCapsuleCommitments[i], dependencyCapsuleCommitment: statement.dependencyCapsuleCommitments[i] });
    },
    nodeRole(i) {
      selected(i);
      return freeze({ ...publicContext(), localCapsule: structuredClone(locals[i]),
        action: locals[i].active ? structuredClone(actions[i]) : null,
        receiptSpendSecret: secrets[i], localCapsuleCommitment: statement.localCapsuleCommitments[i] });
    },
    dependencyRole(i) {
      selected(i);
      return freeze({ ...publicContext(), dependencyCapsule: structuredClone(dependencies[i]),
        dependencyCapsuleCommitment: statement.dependencyCapsuleCommitments[i] });
    },
    /** Pure conversion. Only the C circuit can authenticate the supplied proof/key. */
    ownerAuthorizationInputs(a0) {
      exact(a0, ['publicInputs', 'proofFields', 'vkFields'], 'PAEG_CAPSULE_A0_FIELDS');
      const ownerInputs = recursiveFields(a0.publicInputs, 139, 'PAEG_CAPSULE_A0_INPUTS');
      assert.deepEqual(ownerInputs, fundedAuthorizationWords(s), 'PAEG_CAPSULE_A0_STATEMENT');
      return { ...Object.fromEntries(COMMON_FIELDS.map(key => [snake(key), words(statement[key])])),
        local_capsule_commitments: statement.localCapsuleCommitments.map(words),
        dependency_capsule_commitments: statement.dependencyCapsuleCommitments.map(words), settle_before: statement.settleBefore,
        owner_vk: recursiveFields(a0.vkFields, 115, 'PAEG_CAPSULE_A0_VK'),
        owner_proof: recursiveFields(a0.proofFields, 458, 'PAEG_CAPSULE_A0_PROOF'), owner_inputs: ownerInputs,
        witness: { graph: graphWitness(graph.ownerWitness), local_capsules: locals.map(localCapsuleToNoir),
          dependency_capsules: dependencies.map(dependencyCapsuleToNoir), actions: actions.map(actionWitness),
          receipt_spend_secrets: secrets.map(bytes), target_salts: salts.map(value => bytes(value.targetSalt)) } };
    },
  });
}
