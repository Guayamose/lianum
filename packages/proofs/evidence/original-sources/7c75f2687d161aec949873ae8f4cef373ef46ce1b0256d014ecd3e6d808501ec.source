/** Synthetic authenticated-root fixtures for the isolated Poseidon2 N′ only.
 * No U/S′/I′ proof, funding, native observation, operator independence or actual
 * chain state is asserted. Fixed fabricated receipt data is public test data.
 * The independent original SHA ReceiptRead codec below is unchanged. New host
 * roots/encodings are candidates for later Noir checks, not verified results.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SCHEMAS, FIELD_MODULUS, createFraming, receiptKeyCommitment, terminalReceiptTag } from './framing.mjs';

const ZERO = '0'.repeat(64);
const PUBLIC_NAMES = ['domain_commitment', 'authorization_root', 'evidence_state', 'completion_commitment'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = label => sha(Buffer.from('SYNTHETIC-FLAT-NODE/' + label));
// Synthetic internal commitments are canonical field encodings, not SHA values
// silently reduced by the host. These do not assert valid unopened envelopes.
const field = label => '00' + hash(label).slice(2);
const fieldHex = value => {
  assert.ok(value >= 0n && value < (1n << 256n), 'FIXTURE_32_BYTE_INTEGER');
  return value.toString(16).padStart(64, '0');
};
const bytes = value => Buffer.from(value, 'hex');
const array = value => [...bytes(value)];
const uint = (value, width) => Buffer.from(BigInt(value).toString(16).padStart(width * 2, '0'), 'hex');
const words = value => Array.from({ length: 8 }, (_, index) => bytes(value).readUInt32BE(index * 4).toString());
const wordsHex = value => value.map(word => BigInt(word).toString(16).padStart(8, '0')).join('');
const snake = value => value.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
const copy = value => structuredClone(value);
function frame(tag, parts) {
  return Buffer.concat([Buffer.from(tag, 'ascii'), ...parts].flatMap(part => [uint(part.length, 4), part]));
}
const RECEIPT_DIGESTS = ['hubDomain', 'registryCommitment', 'globalEffectId', 'scope', 'policy',
  'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'];
function receiptCommitment(read) {
  return sha(frame('LIANUM/PAEG/native-receipt/2', [Buffer.from('LIANUM_PAEG_NATIVE_4_V2', 'ascii'),
    ...RECEIPT_DIGESTS.map(name => bytes(read[name])), uint(read.validFrom, 8), uint(read.validUntil, 8),
    bytes(read.receiptKeyCommitment), bytes(read.receiptRho)]));
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

async function fixture(framing, { padding = false, alternateNamespace = false,
  completionUntil = '1500', receiptUntil = '1600' } = {}) {
  const domain = Object.fromEntries(SCHEMAS.domain.map(([name]) => [name, hash('domain/' + name)]));
  domain.ledgerNamespace = alternateNamespace ? hash('stable-other-namespace') : domain.hubDomain;
  const domainHash = await framing.domainCommitment(domain);
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
  // Fixed typed empties for all unopened positions. Only Core and this Local
  // are opened by N′; validity of a complete U envelope remains out of scope.
  const envelopeLeaves = Array(16).fill(await framing.emptyLeaf({ domain: domainHash, treeKind: 1 }));
  envelopeLeaves[0] = await framing.coreLeaf({ domain: domainHash, payload: core, blind: coreBlind });
  envelopeLeaves[4 + Number(slot)] = await framing.localLeaf({ domain: domainHash, payload: local, blind: localBlind });
  const envelope = await framing.merkle({ domain: domainHash, treeKind: 1, leaves: envelopeLeaves });
  const authorizationLeaves = [];
  for (const value of [field('other-envelope-0'), field('other-envelope-1'), field('other-envelope-2'), envelope.root]) {
    authorizationLeaves.push(await framing.authorizationLeaf({ domain: domainHash, envelope: value }));
  }
  const authorization = await framing.merkle({ domain: domainHash, treeKind: 0, leaves: authorizationLeaves });
  const authPath = authorization.path(3);
  const read = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    globalEffectId: hash('native-gid'), scope: domain.scope, policy: domain.policy,
    ...Object.fromEntries(['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy',
      'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'].map(name => [name, local[name]])),
    validFrom: '900', validUntil: receiptUntil };
  const shaReceiptCommitment = padding ? hash('unrelated-receipt') : receiptCommitment(read);
  const receiptLeaves = [];
  for (const value of [hash('other-receipt-0'), hash('other-receipt-1'), shaReceiptCommitment]) {
    receiptLeaves.push(await framing.receiptLeaf({ domain: domainHash, receiptCommitment: value }));
  }
  const receipts = await framing.merkle({ domain: domainHash, treeKind: 2, leaves: receiptLeaves });
  const receiptPath = receipts.path(2);
  const revoked = [hash('revoked-unrelated-0'), hash('revoked-unrelated-1'), ...Array(62).fill(ZERO)];
  const state = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    receiptRoot: receipts.root, receiptCount: '3',
    revokedDigest: await framing.revocationDigest({ domain: domainHash, hub: domain.hubDomain, entries: revoked, count: '2' }),
    revokedCount: '2', revocationSequence: '2' };
  const completion = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    evidenceState: await framing.evidenceDigest({ domain: domainHash, state }),
    context: core.context, payoutCommitment: local.payoutCommitment,
    terminalReceiptTag: padding ? local.dummyTerminalTag : terminalReceiptTag({
      ledgerNamespace: domain.ledgerNamespace, secret, receiptCommitment: shaReceiptCommitment }),
    slot, validFrom: '1000', validUntil: completionUntil };
  const completionBlind = hash('completion-blind');
  const commitment = await framing.completionOpeningCommitment({ domain: domainHash, envelope: envelope.root,
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
    // Inactive witnesses are exactly zero, not typed empty tree commitments.
    receipt_siblings: padding ? Array.from({ length: 6 }, () => array(ZERO)) : receiptPath.siblings.map(array),
    receipt_index: padding ? '0' : String(receiptPath.index), revoked_entries: revoked.map(array),
  };
  return { inputs, meta: { domain, domainHash, envelope: envelope.root, completion, completionBlind,
    state, read, revoked, secret, shaReceiptCommitment, receiptLeaves, authorizationLeaves,
    authorizationPath: authPath } };
}
const publicInputs = inputs => PUBLIC_NAMES.flatMap(name => inputs[name]);
function result(name, value, expectedFailureLayer = undefined) {
  return { name, inputs: value.inputs, expectedPublicInputs: publicInputs(value.inputs),
    ...(expectedFailureLayer ? { expectedFailureLayer } : {}) };
}
async function refreshCompletion(framing, value, envelope = value.meta.envelope) {
  value.inputs.completion = noir(SCHEMAS.completion, value.meta.completion);
  value.inputs.completion_commitment = words(await framing.completionOpeningCommitment({
    domain: value.meta.domainHash, envelope, statement: value.meta.completion, blind: value.meta.completionBlind }));
}
async function refreshEvidence(framing, value) {
  value.meta.completion.evidenceState = await framing.evidenceDigest({ domain: value.meta.domainHash, state: value.meta.state });
  value.inputs.evidence_state = words(value.meta.completion.evidenceState);
  await refreshCompletion(framing, value);
}
async function refreshState(framing, value, entries, count) {
  value.meta.revoked = entries;
  value.meta.state.revokedCount = String(count);
  value.meta.state.revokedDigest = await framing.revocationDigest({ domain: value.meta.domainHash,
    hub: value.meta.domain.hubDomain, entries, count: String(count) });
  value.inputs.revoked_entries = entries.map(array);
  value.inputs.state_opening.revoked_count = String(count);
  value.inputs.state_opening.revoked_digest = array(value.meta.state.revokedDigest);
  await refreshEvidence(framing, value);
}
async function replaceReceiptLeaf(framing, value, leaf, treeKind = 2) {
  const leaves = [...value.meta.receiptLeaves]; leaves[2] = leaf;
  const tree = await framing.merkle({ domain: value.meta.domainHash, treeKind, leaves });
  value.meta.state.receiptRoot = tree.root;
  value.inputs.state_opening.receipt_root = array(tree.root);
  value.inputs.receipt_siblings = tree.path(2).siblings.map(array);
  await refreshEvidence(framing, value);
}
async function replaceAuthorization(framing, value, leaves, treeKind = 0) {
  const tree = await framing.merkle({ domain: value.meta.domainHash, treeKind, leaves });
  value.inputs.authorization_root = words(tree.root);
  value.inputs.authorization_siblings = tree.path(3).siblings.map(array);
}
function fieldAlias(value) {
  const original = BigInt('0x' + value);
  assert.ok(original < FIELD_MODULUS, 'FIXTURE_ALIAS_REQUIRES_CANONICAL_SOURCE');
  // Still exactly 32 bytes, and each public word is a valid u32. This must
  // reach the circuit's canonical-F constraints, not fail ABI parsing.
  return fieldHex(original + FIELD_MODULUS);
}

export async function positiveFixtures() {
  const framing = await createFraming();
  try {
    return [result('synthetic_authenticated_root_active', await fixture(framing)),
      result('synthetic_authenticated_root_padding', await fixture(framing, { padding: true })),
      result('synthetic_distinct_stable_namespace_not_a_migration', await fixture(framing, { alternateNamespace: true }))];
  } finally { await framing.destroy(); }
}
export async function negativeFixtures() {
  const framing = await createFraming();
  try {
    const cases = [], bases = new Map();
    const add = async (name, mutate, options = {}) => {
      const key = JSON.stringify(options);
      if (!bases.has(key)) bases.set(key, await fixture(framing, options));
      const value = copy(bases.get(key));
      await mutate(value);
      cases.push(result(name, value, 'constraint'));
    };
    // All sixteen original negative cases remain, with canonical internal F
    // substitutions wherever the SHA component used arbitrary digest bytes.
    await add('changed_domain_opening', value => { value.inputs.domain.asset = array(hash('other-asset')); });
    await add('wrong_authorization_root', value => { value.inputs.authorization_root[0] = '1'; });
    await add('wrong_envelope', value => { value.inputs.envelope = array(field('other-envelope')); });
    await add('authorization_index_outside_tree', value => { value.inputs.authorization_index = '64'; });
    await add('wrong_core_path', value => { value.inputs.core_siblings[0] = array(field('wrong-sibling')); });
    await add('wrong_local_slot', value => { value.inputs.local.slot = '0'; });
    await add('wrong_receipt_secret', value => { value.inputs.receipt_spend_secret = array(hash('wrong-secret')); });
    await add('wrong_local_receipt_payout', value => { value.inputs.own_receipt.payout_commitment = array(hash('wrong-payout')); });
    await add('wrong_receipt_path', value => { value.inputs.receipt_siblings[0] = array(field('wrong-receipt-path')); });
    await add('own_gid_in_coherent_current_revocation_state', async value => {
      await refreshState(framing, value, [value.meta.read.globalEffectId, hash('revoked-other'), ...Array(62).fill(ZERO)], 2);
    });
    await add('duplicate_gid_in_coherent_revocation_digest', async value => {
      const duplicate = hash('duplicate-revoked');
      await refreshState(framing, value, [duplicate, duplicate, ...Array(62).fill(ZERO)], 2);
    });
    await add('completion_window_exceeds_original_cutoff', () => {}, { completionUntil: '2001', receiptUntil: '3000' });
    await add('padding_carries_receipt_secret', value => { value.inputs.receipt_spend_secret = array(hash('padding-secret')); }, { padding: true });
    await add('padding_carries_native_receipt', value => { value.inputs.own_receipt.global_effect_id = array(hash('padding-gid')); }, { padding: true });
    await add('padding_uses_different_terminal_tag', async value => {
      value.meta.completion.terminalReceiptTag = hash('wrong-padding-tag'); await refreshCompletion(framing, value);
    }, { padding: true });
    await add('same_context_completion_commits_another_envelope', async value => {
      await refreshCompletion(framing, value, field('other-E-same-context'));
    });

    // The four public outputs are serialized F values, not reduced bytes32s.
    for (const name of PUBLIC_NAMES) {
      await add('public_' + name + '_field_alias_x_plus_r', value => {
        value.inputs[name] = words(fieldAlias(wordsHex(value.inputs[name])));
      });
    }
    await add('public_domain_field_modulus_boundary', value => {
      value.inputs.domain_commitment = words(fieldHex(FIELD_MODULUS));
    });
    await add('private_envelope_field_alias_x_plus_r', value => {
      value.inputs.envelope = array(fieldAlias(value.meta.envelope));
    });
    await add('private_authorization_sibling_field_alias_x_plus_r', value => {
      value.inputs.authorization_siblings[0] = array(fieldAlias(value.meta.authorizationPath.siblings[0]));
    });
    await add('receipt_count_exceeds_tree_capacity', value => { value.inputs.state_opening.receipt_count = '65'; });

    await add('terminal_tag_uses_hub_instead_of_stable_namespace', async value => {
      value.meta.completion.terminalReceiptTag = terminalReceiptTag({ ledgerNamespace: value.meta.domain.hubDomain,
        secret: value.meta.secret, receiptCommitment: value.meta.shaReceiptCommitment });
      await refreshCompletion(framing, value);
    }, { alternateNamespace: true });
    await add('receipt_adapter_uses_other_namespace_domain', async value => {
      const otherDomain = await framing.domainCommitment({ ...value.meta.domain, ledgerNamespace: hash('adapter-other-namespace') });
      const leaf = await framing.receiptLeaf({ domain: otherDomain, receiptCommitment: value.meta.shaReceiptCommitment });
      await replaceReceiptLeaf(framing, value, leaf);
    });
    await add('authorization_tree_uses_receipt_tree_kind', async value => {
      await replaceAuthorization(framing, value, value.meta.authorizationLeaves, 2);
    });
    await add('receipt_tree_uses_authorization_tree_kind', async value => {
      await replaceReceiptLeaf(framing, value, value.meta.receiptLeaves[2], 0);
    });
    await add('authorization_path_uses_wrong_parent_level', async value => {
      let root = value.meta.authorizationLeaves[3];
      const { siblings, index } = value.meta.authorizationPath;
      for (let depth = 0; depth < 6; depth++) {
        const right = ((index >> depth) & 1) === 1;
        root = await framing.nodeHash({ domain: value.meta.domainHash, treeKind: 0,
          level: depth === 0 ? 2 : depth + 1,
          left: right ? siblings[depth] : root, right: right ? root : siblings[depth] });
      }
      value.inputs.authorization_root = words(root);
    });
    await add('zero_leaf_cannot_replace_owned_receipt_adapter', async value => {
      await replaceReceiptLeaf(framing, value, ZERO);
    });
    await add('typed_empty_leaf_cannot_replace_owned_receipt_adapter', async value => {
      await replaceReceiptLeaf(framing, value, await framing.emptyLeaf({ domain: value.meta.domainHash, treeKind: 2 }));
    });
    await add('reduced_sha_receipt_cm_cannot_replace_receipt_adapter', async value => {
      // Deliberately model the forbidden conversion in this negative only.
      const reduced = fieldHex(BigInt('0x' + value.meta.shaReceiptCommitment) % FIELD_MODULUS);
      await replaceReceiptLeaf(framing, value, reduced);
    });
    await add('receipt_adapter_swaps_original_sha_digest_limbs', async value => {
      const cm = value.meta.shaReceiptCommitment;
      const leaf = await framing.receiptLeaf({ domain: value.meta.domainHash, receiptCommitment: cm.slice(32) + cm.slice(0, 32) });
      await replaceReceiptLeaf(framing, value, leaf);
    });
    await add('terminal_tag_uses_poseidon_leaf_instead_of_original_sha_cm', async value => {
      value.meta.completion.terminalReceiptTag = terminalReceiptTag({ ledgerNamespace: value.meta.domain.ledgerNamespace,
        secret: value.meta.secret, receiptCommitment: value.meta.receiptLeaves[2] });
      await refreshCompletion(framing, value);
    });
    await add('typed_empty_leaf_cannot_replace_occupied_authorization', async value => {
      const leaves = [...value.meta.authorizationLeaves];
      leaves[3] = await framing.emptyLeaf({ domain: value.meta.domainHash, treeKind: 0 });
      await replaceAuthorization(framing, value, leaves);
    });
    return cases;
  } finally { await framing.destroy(); }
}
