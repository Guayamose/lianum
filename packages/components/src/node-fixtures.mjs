/** Synthetic authenticated-root fixtures for N′ only.
 * No U/S′/I′ proof, funding, native observation, operator independence or actual
 * chain state is asserted. Fixed fabricated receipt data is public test data.
 * Independent receipt/state framing below is checked by actual Noir execution.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SCHEMAS, domainCommitment, envelopeLeafCommitment, buildEnvelope,
  completionOpeningCommitment, receiptKeyCommitment, terminalReceiptTag } from './framing.mjs';

const ZERO = '0'.repeat(64);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = label => sha(Buffer.from('SYNTHETIC-FLAT-NODE/' + label));
const bytes = value => Buffer.from(value, 'hex');
const array = value => [...bytes(value)];
const uint = (value, width) => Buffer.from(BigInt(value).toString(16).padStart(width * 2, '0'), 'hex');
const words = value => Array.from({ length: 8 }, (_, index) => bytes(value).readUInt32BE(index * 4).toString());
const snake = value => value.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
const copy = value => structuredClone(value);
function frame(tag, parts) {
  return Buffer.concat([Buffer.from(tag, 'ascii'), ...parts].flatMap(part => [uint(part.length, 4), part]));
}
function merkle(leaves, depth = 6) {
  const capacity = 2 ** depth, nodes = Array(2 * capacity).fill(ZERO);
  assert.ok(leaves.length <= capacity);
  leaves.forEach((leaf, index) => { nodes[capacity + index] = leaf; });
  for (let index = capacity - 1; index > 0; index--) {
    nodes[index] = sha(Buffer.concat([Buffer.from([1]), bytes(nodes[index * 2]), bytes(nodes[index * 2 + 1])]));
  }
  return { root: nodes[1], path(index) {
    assert.ok(index >= 0 && index < leaves.length);
    const siblings = [];
    for (let node = capacity + index; node > 1; node >>= 1) siblings.push(nodes[node ^ 1]);
    return { index, leaf: leaves[index], siblings };
  } };
}
const RECEIPT_DIGESTS = ['hubDomain', 'registryCommitment', 'globalEffectId', 'scope', 'policy',
  'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'];
function receiptCommitment(read) {
  return sha(frame('LIANUM/PAEG/native-receipt/2', [Buffer.from('LIANUM_PAEG_NATIVE_4_V2', 'ascii'),
    ...RECEIPT_DIGESTS.map(name => bytes(read[name])), uint(read.validFrom, 8), uint(read.validUntil, 8),
    bytes(read.receiptKeyCommitment), bytes(read.receiptRho)]));
}
function revocationDigest(hub, entries, count) {
  assert.equal(entries.length, 64);
  return sha(Buffer.concat([Buffer.from([0x32]), bytes(hub), uint(count, 4), ...entries.map(bytes)]));
}
function evidenceDigest(state) {
  return sha(frame('LIANUM/PAEG/evidence-state/2', [bytes(state.hubDomain), bytes(state.registryCommitment),
    bytes(state.receiptRoot), uint(state.receiptCount, 4), bytes(state.revokedDigest),
    uint(state.revokedCount, 4), uint(state.revocationSequence, 8)]));
}
function scalar(type, value) {
  if (Array.isArray(type)) {
    if (type[0] === 'record') return noir(type[1], value);
    return value.map(item => scalar(type[1], item));
  }
  if (type === 'digest' || type === 'bytes64') return array(value);
  return value;
}
function noir(schema, value) {
  return Object.fromEntries(schema.map(([name, type]) => [snake(name), scalar(type, value[name])]));
}
function otherPayload(schema, label) {
  return Object.fromEntries(schema.map(([name, type]) => {
    let value;
    if (Array.isArray(type)) {
      value = type[0] === 'record' ? otherPayload(type[1], label + '/' + name)
        : Array.from({ length: type[2] }, (_, i) => type[1] === 'digest' ? hash(label + '/' + name + '/' + i)
          : otherPayload(type[1][1], label + '/' + name + '/' + i));
    } else if (type === 'digest') value = hash(label + '/' + name);
    else if (type === 'bool') value = true;
    else value = name.endsWith('Until') || name === 'settleBefore' ? '2000' : '0';
    return [name, value];
  }));
}

function fixture({ padding = false, alternateNamespace = false, completionUntil = '1500', receiptUntil = '1600' } = {}) {
  const domain = Object.fromEntries(SCHEMAS.domain.map(([name]) => [name, hash('domain/' + name)]));
  domain.ledgerNamespace = alternateNamespace ? hash('stable-other-namespace') : domain.hubDomain;
  const domainHash = domainCommitment(domain);
  const core = { context: hash('context'), reserveCommitment: hash('reserve'),
    reserveNullifier: hash('reserve-nullifier'), settleBefore: '2000' };
  const slot = padding ? '3' : '1', secret = hash('receipt-secret-' + slot);
  const local = otherPayload(SCHEMAS.local, 'local-' + slot);
  Object.assign(local, { slot, active: !padding, dummyTerminalTag: ZERO,
    receiptKeyCommitment: receiptKeyCommitment({ ledgerNamespace: domain.ledgerNamespace, secret }) });
  if (padding) {
    for (const name of ['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment',
      'receiptKeyCommitment', 'receiptRho']) local[name] = ZERO;
    local.dummyTerminalTag = sha(frame('LIANUM/PAEG/unused-receipt-spend/2',
      [Buffer.from('LIANUM_PAEG_NATIVE_4_V2', 'ascii'), bytes(domain.hubDomain), bytes(core.reserveNullifier),
        bytes(hash('graph-nonce')), uint(slot, 1)]));
  }
  const coreBlind = hash('core-blind'), localBlind = hash('local-blind-' + slot);
  const leaves = Array.from({ length: 16 }, (_, index) => {
    const kind = index < 4 ? ['core', 'funding', 'recovery', 'settlement'][index]
      : index < 8 ? 'local' : index < 12 ? 'dependency' : 'payout';
    const payload = index === 0 ? core : index === 4 + Number(slot) ? local
      : otherPayload(SCHEMAS[kind], 'unopened-leaf-' + index);
    if (index >= 4) payload[kind === 'dependency' ? 'targetSlot' : 'slot'] = String((index - 4) % 4);
    const blind = index === 0 ? coreBlind : index === 4 + Number(slot) ? localBlind : hash('leaf-blind-' + index);
    return envelopeLeafCommitment({ domain: domainHash, index, kind, payload, blind });
  });
  const envelope = buildEnvelope(leaves), authorization = merkle([
    hash('other-envelope-0'), hash('other-envelope-1'), hash('other-envelope-2'), envelope.root]);
  const authPath = authorization.path(3);
  const read = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    globalEffectId: hash('native-gid'), scope: domain.scope, policy: domain.policy,
    ...Object.fromEntries(['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy',
      'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'].map(name => [name, local[name]])),
    validFrom: '900', validUntil: receiptUntil };
  const receiptLeaf = padding ? hash('unrelated-receipt') : receiptCommitment(read);
  const receipts = merkle([hash('other-receipt-0'), hash('other-receipt-1'), receiptLeaf]);
  const receiptPath = receipts.path(2);
  const revoked = [hash('revoked-unrelated-0'), hash('revoked-unrelated-1'), ...Array(62).fill(ZERO)];
  const state = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    receiptRoot: receipts.root, receiptCount: '3', revokedDigest: revocationDigest(domain.hubDomain, revoked, '2'),
    revokedCount: '2', revocationSequence: '2' };
  const completion = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    evidenceState: evidenceDigest(state), context: core.context, payoutCommitment: local.payoutCommitment,
    terminalReceiptTag: padding ? local.dummyTerminalTag
      : terminalReceiptTag({ ledgerNamespace: domain.ledgerNamespace, secret, receiptCommitment: receiptLeaf }),
    slot, validFrom: '1000', validUntil: completionUntil };
  const completionBlind = hash('completion-blind');
  const commitment = completionOpeningCommitment({ domain: domainHash, envelope: envelope.root,
    statement: completion, blind: completionBlind });
  const receiptNoir = Object.fromEntries([...RECEIPT_DIGESTS, 'validFrom', 'validUntil',
    'receiptKeyCommitment', 'receiptRho'].map(name => [snake(name), name.startsWith('valid')
      ? (padding ? '0' : read[name]) : array(padding ? ZERO : read[name])]));
  const inputs = {
    domain_commitment: words(domainHash), authorization_root: words(authorization.root),
    evidence_state: words(completion.evidenceState), completion_commitment: words(commitment),
    domain: noir(SCHEMAS.domain, domain), envelope: array(envelope.root),
    authorization_siblings: authPath.siblings.map(array), authorization_index: String(authPath.index),
    core: noir(SCHEMAS.core, core), core_blind: array(coreBlind), core_siblings: envelope.path(0).siblings.map(array),
    local: noir(SCHEMAS.local, local), local_blind: array(localBlind),
    local_siblings: envelope.path(4 + Number(slot)).siblings.map(array),
    completion: noir(SCHEMAS.completion, completion), completion_blind: array(completionBlind),
    state_opening: Object.fromEntries(Object.entries(state).map(([name, value]) => [snake(name),
      ['receiptCount', 'revokedCount', 'revocationSequence'].includes(name) ? value : array(value)])),
    own_receipt: receiptNoir, receipt_spend_secret: array(padding ? ZERO : secret),
    receipt_siblings: padding ? Array.from({ length: 6 }, () => array(ZERO)) : receiptPath.siblings.map(array),
    receipt_index: padding ? '0' : String(receiptPath.index), revoked_entries: revoked.map(array),
  };
  return { inputs, meta: { domain, domainHash, envelope: envelope.root, completion, completionBlind, state, read, revoked } };
}
const publicInputs = inputs => ['domain_commitment', 'authorization_root', 'evidence_state', 'completion_commitment']
  .flatMap(name => inputs[name]);
function result(name, value, expectedFailureLayer = undefined) {
  return { name, inputs: value.inputs, expectedPublicInputs: publicInputs(value.inputs),
    ...(expectedFailureLayer ? { expectedFailureLayer } : {}) };
}
function refreshState(value, entries, count) {
  value.meta.revoked = entries;
  value.meta.state.revokedCount = String(count);
  value.meta.state.revokedDigest = revocationDigest(value.meta.domain.hubDomain, entries, String(count));
  value.inputs.revoked_entries = entries.map(array);
  value.inputs.state_opening.revoked_count = String(count);
  value.inputs.state_opening.revoked_digest = array(value.meta.state.revokedDigest);
  value.meta.completion.evidenceState = evidenceDigest(value.meta.state);
  value.inputs.evidence_state = words(value.meta.completion.evidenceState);
  value.inputs.completion.evidence_state = array(value.meta.completion.evidenceState);
  refreshCompletion(value);
}
function refreshCompletion(value, envelope = value.meta.envelope) {
  value.inputs.completion = noir(SCHEMAS.completion, value.meta.completion);
  value.inputs.completion_commitment = words(completionOpeningCommitment({ domain: value.meta.domainHash,
    envelope, statement: value.meta.completion, blind: value.meta.completionBlind }));
}
export function positiveFixtures() {
  return [result('synthetic_authenticated_root_active', fixture()),
    result('synthetic_authenticated_root_padding', fixture({ padding: true })),
    result('synthetic_distinct_stable_namespace_not_a_migration', fixture({ alternateNamespace: true }))];
}
export function negativeFixtures() {
  const cases = [];
  const add = (name, mutate, options) => {
    const value = fixture(options); mutate(value); cases.push(result(name, value, 'constraint'));
  };
  add('changed_domain_opening', value => { value.inputs.domain.asset = array(hash('other-asset')); });
  add('wrong_authorization_root', value => { value.inputs.authorization_root[0] = '1'; });
  add('wrong_envelope', value => { value.inputs.envelope = array(hash('other-envelope')); });
  add('authorization_index_outside_tree', value => { value.inputs.authorization_index = '64'; });
  add('wrong_core_path', value => { value.inputs.core_siblings[0] = array(hash('wrong-sibling')); });
  add('wrong_local_slot', value => { value.inputs.local.slot = '0'; });
  add('wrong_receipt_secret', value => { value.inputs.receipt_spend_secret = array(hash('wrong-secret')); });
  add('wrong_local_receipt_payout', value => { value.inputs.own_receipt.payout_commitment = array(hash('wrong-payout')); });
  add('wrong_receipt_path', value => { value.inputs.receipt_siblings[0] = array(hash('wrong-receipt-path')); });
  add('own_gid_in_coherent_current_revocation_state', value => {
    refreshState(value, [value.meta.read.globalEffectId, hash('revoked-other'), ...Array(62).fill(ZERO)], 2);
  });
  add('duplicate_gid_in_coherent_revocation_digest', value => {
    const duplicate = hash('duplicate-revoked'); refreshState(value, [duplicate, duplicate, ...Array(62).fill(ZERO)], 2);
  });
  add('completion_window_exceeds_original_cutoff', () => {}, { completionUntil: '2001', receiptUntil: '3000' });
  add('padding_carries_receipt_secret', value => { value.inputs.receipt_spend_secret = array(hash('padding-secret')); }, { padding: true });
  add('padding_carries_native_receipt', value => { value.inputs.own_receipt.global_effect_id = array(hash('padding-gid')); }, { padding: true });
  add('padding_uses_different_terminal_tag', value => {
    value.meta.completion.terminalReceiptTag = hash('wrong-padding-tag'); refreshCompletion(value);
  }, { padding: true });
  add('same_context_completion_commits_another_envelope', value => { refreshCompletion(value, hash('other-E-same-context')); });
  return cases;
}
