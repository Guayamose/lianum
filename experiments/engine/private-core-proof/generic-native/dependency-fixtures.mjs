/** Bounded synthetic P50 constraint fixtures, NOT admitted native facts,
 * current-chain proofs, C129 authorizations, or authenticated hub snapshots.
 * Generated only in memory. Do not persist/publish witness JSON or read terms.
 * No receipt spend secrets (nk), owner keys, or signing keys are generated.
 * Negatives mutate serialized Noir inputs unconditionally, bypassing host
 * checks; only actual Noir execution can establish their rejection.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PrivateNoteTree } from '../../../../packages/engine/src/notes/private-note-tree.mjs';
import { prepareNativeDependency } from '../../../../packages/engine/src/execution/native/dispatch/native-dependency.mjs';

const PROFILE = 'LIANUM_PAEG_NATIVE_4_V2';
const ZERO = '0'.repeat(64);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const h = label => sha(Buffer.from(`P50 synthetic only: ${label}`, 'utf8'));
const b = value => Buffer.from(value.startsWith('0x') ? value.slice(2) : value, 'hex');
const fixed = (value, width) => Buffer.from(BigInt(value).toString(16).padStart(width * 2, '0'), 'hex');
const bytes = value => [...b(value)];
const words = value => Array.from({ length: 8 }, (_, i) => b(value).readUInt32BE(i * 4).toString());
const fromBytes = value => Buffer.from(value).toString('hex');
const snake = key => key.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`);

// Independent H4/state/tree framing comes from the source contracts, without
// calling native-capsules, native-state or native-receipt hashing functions.
const frame = (tag, fields) => Buffer.concat([Buffer.from(tag, 'ascii'), ...fields]
  .flatMap(value => [fixed(value.length, 4), value]));
const framedHash = (tag, fields, length) => {
  const result = frame(tag, fields);
  assert.equal(result.length, length);
  return sha(result);
};
const SOURCE_HASH_FIELDS = ['sourceNodeCommitment', 'sourceLocalCommitment', 'sourceDispatchId',
  'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'];
const READ_HASH_FIELDS = ['hubDomain', 'registryCommitment', 'globalEffectId', 'scope', 'policy',
  'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'];
const SNAPSHOT_SPEC = [
  ['hubDomain', 32], ['registryCommitment', 32], ['pool', 20], ['scope', 32], ['policy', 32],
  ['assetIdentity', 32], ['poolRoot', 32], ['poolSpentDigest', 32], ['poolSpentCount', 4, true],
  ['poolStateSequence', 8, true], ['receiptRoot', 32], ['receiptCount', 4, true], ['spentTagDigest', 32],
  ['spentTagCount', 4, true], ['spentTagSequence', 8, true], ['revokedDigest', 32], ['revokedCount', 4, true],
  ['revocationSequence', 8, true], ['hubStateSequence', 8, true], ['registryEpoch', 8, true],
  ['halt', 1, true], ['timestamp', 8, true],
];
function capsuleHash(packet) {
  const d = packet.dependencyCapsule;
  return framedHash('LIANUM/PAEG/dependency-capsule/2', [Buffer.from(PROFILE), b(packet.hubDomain),
    b(packet.registryCommitment), b(packet.context), fixed(d.targetSlot, 1), b(d.targetContext), fixed(d.dependencyCount, 1),
    ...d.predecessors.flatMap(source => [fixed(source.sourceSlot, 1), ...SOURCE_HASH_FIELDS.map(key => b(source[key]))]),
    b(d.capsuleSalt)], 1240);
}
function receiptHash(read) {
  return framedHash('LIANUM/PAEG/native-receipt/2', [Buffer.from(PROFILE), ...READ_HASH_FIELDS.map(key => b(read[key])),
    fixed(read.validFrom, 8), fixed(read.validUntil, 8), b(read.receiptKeyCommitment), b(read.receiptRho)], 551);
}
function stateHash(snapshot) {
  return framedHash('LIANUM/PAEG/checkpoint/2', SNAPSHOT_SPEC.map(([key, width, integer]) =>
    integer ? fixed(snapshot[key], width) : b(snapshot[key])), 521);
}
function listHash(prefix, domain, entries, count = entries.length) {
  const padded = Array.from({ length: 64 }, (_, i) => b(entries[i] ?? ZERO));
  const message = Buffer.concat([Buffer.from([prefix]), b(domain), fixed(count, 4), ...padded]);
  assert.equal(message.length, 2085);
  return sha(message);
}
function tree(leaves) {
  const layers = [Array.from({ length: 64 }, (_, i) => leaves[i] ?? ZERO)];
  for (let depth = 0; depth < 6; depth++) {
    const previous = layers[depth];
    layers.push(Array.from({ length: previous.length / 2 }, (_, i) =>
      sha(Buffer.concat([Buffer.from([1]), b(previous[i * 2]), b(previous[i * 2 + 1])]))));
  }
  const root = `0x${layers[6][0]}`;
  const paths = leaves.map((_, index) => Array.from({ length: 6 }, (_, depth) => `0x${layers[depth][(index >> depth) ^ 1]}`));
  // Explicitly agree with the production append-only PrivateNoteTree contract.
  const authoritativeTreeCodec = new PrivateNoteTree(leaves);
  assert.equal(root, authoritativeTreeCodec.root);
  paths.forEach((siblings, index) => assert.deepEqual(siblings, authoritativeTreeCodec.path(index).siblings));
  return { root, paths };
}
function source(slot) {
  return { sourceSlot: slot, ...Object.fromEntries(SOURCE_HASH_FIELDS.map(field => [field, h(`source:${slot}:${field}`)])),
    actionCommitment: transferHash(slot, '25') };
}
function transferHash(slot, amount) {
  // The change-amount negative hashes an actual differently valued action.
  // Action openings are local to this builder and never enter a role packet.
  const term = field => b(h(`source:${slot}:${field}`));
  return framedHash('LIANUM/PAEG/native-transfer-action/2', [Buffer.from(PROFILE), term('chainDomain'),
    term('signerIdentity'), term('sourceCommitment'), term('destinationCommitment'), fixed(amount, 16), fixed(1, 1),
    term('custodyCommitment'), fixed(100, 8), fixed(400, 8), fixed(500, 8), term('receiptKeyCommitment'),
    term('receiptRho'), term('deliveryRiskCommitment'), term('actionSalt')], 452);
}
const emptySource = () => ({ sourceSlot: 0, ...Object.fromEntries(SOURCE_HASH_FIELDS.map(key => [key, ZERO])) });

/** In-memory host request for schema tests. Every state value is synthetic. */
export function syntheticDependencyRequest(dependencies = 3) {
  assert.ok(dependencies === 0 || dependencies === 3);
  const packet = {
    profile: PROFILE, scope: h('scope'), policy: h('policy'), asset: h('asset'), hubDomain: h('hub'),
    registryCommitment: h('registry'), context: h('context'), settleBefore: '500',
    dependencyCapsule: { targetSlot: dependencies, targetContext: h(`target:${dependencies}`), dependencyCount: dependencies,
      predecessors: Array.from({ length: 3 }, (_, i) => i < dependencies ? source(i) : emptySource()),
      capsuleSalt: h(`capsule-salt:${dependencies}`) },
    dependencyCapsuleCommitment: '',
  };
  packet.dependencyCapsuleCommitment = capsuleHash(packet);
  const openings = packet.dependencyCapsule.predecessors.slice(0, dependencies).map(parent => ({
    hubDomain: packet.hubDomain, registryCommitment: packet.registryCommitment,
    globalEffectId: h(`synthetic-global-effect:${parent.sourceSlot}`), scope: packet.scope, policy: packet.policy,
    localCommitment: parent.sourceLocalCommitment, dispatchId: parent.sourceDispatchId,
    ...Object.fromEntries(['chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment',
      'receiptKeyCommitment', 'receiptRho'].map(field => [field, parent[field]])), validFrom: '100', validUntil: '400',
  }));
  // Three unrelated leading leaves ensure a source slot is never a leaf index.
  const leaves = [...Array.from({ length: 3 }, (_, i) => h(`unrelated-synthetic-leaf:${i}`)), ...openings.map(receiptHash)];
  const receiptTree = tree(leaves), emptyTree = tree([]);
  const revokedEntries = [`0x${h('unrelated-revoked-gid')}`];
  const snapshot = {
    hubDomain: `0x${packet.hubDomain}`, registryCommitment: `0x${packet.registryCommitment}`, pool: `0x${'12'.repeat(20)}`,
    scope: `0x${packet.scope}`, policy: `0x${packet.policy}`, assetIdentity: `0x${packet.asset}`, poolRoot: emptyTree.root,
    poolSpentDigest: `0x${listHash(0x02, packet.scope, [])}`, poolSpentCount: '0', poolStateSequence: '7',
    receiptRoot: receiptTree.root, receiptCount: String(leaves.length), spentTagDigest: `0x${listHash(0x31, packet.hubDomain, [])}`,
    spentTagCount: '0', spentTagSequence: '9', revokedDigest: `0x${listHash(0x32, packet.hubDomain, revokedEntries)}`,
    revokedCount: String(revokedEntries.length), revocationSequence: '11', hubStateSequence: '13', registryEpoch: '17',
    halt: '0', timestamp: '250',
  };
  return { packet, snapshot, snapshotDigest: `0x${stateHash(snapshot)}`,
    receipts: openings.map((opening, i) => ({ sourceSlot: i, opening,
      path: { index: String(i + 3), siblings: receiptTree.paths[i + 3] } })), revokedEntries, validFrom: '200', validUntil: '300' };
}
function publicWords(input) {
  return ['hub_domain', 'registry_commitment', 'context', 'target_context', 'dependency_capsule_commitment', 'snapshot_digest']
    .flatMap(key => input[key].map(String)).concat(String(input.valid_from), String(input.valid_until));
}
function positive(dependencies) {
  const request = syntheticDependencyRequest(dependencies), result = prepareNativeDependency(request), p = request.packet;
  const expectedPublicInputs = [p.hubDomain, p.registryCommitment, p.context, p.dependencyCapsule.targetContext,
    p.dependencyCapsuleCommitment, stateHash(request.snapshot)].flatMap(words).concat(request.validFrom, request.validUntil);
  assert.deepEqual(result.expectedPublicInputs, expectedPublicInputs);
  return { name: dependencies ? 'three-valid-dependencies' : 'zero-dependencies', inputs: result.inputs, expectedPublicInputs };
}
export function positiveFixtures() { return [positive(0), positive(3)]; }

const hostRead = read => Object.fromEntries(Object.entries(read).map(([key, value]) => [
  key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), Array.isArray(value) ? fromBytes(value) : value,
]));
function rebindSnapshot(input) {
  const snapshot = Object.fromEntries(SNAPSHOT_SPEC.map(([key, , integer]) => [key,
    integer ? input.snapshot[snake(key)] : `0x${fromBytes(input.snapshot[snake(key)])}`]));
  input.snapshot_digest = words(stateHash(snapshot));
}
function rebindReceipts(input) {
  const live = Number(input.dependency.dependency_count);
  const leaves = [...Array.from({ length: 3 }, (_, i) => h(`unrelated-synthetic-leaf:${i}`)),
    ...input.predecessor_receipts.slice(0, live).map(read => receiptHash(hostRead(read)))];
  const result = tree(leaves);
  input.snapshot.receipt_root = bytes(result.root);
  input.snapshot.receipt_count = String(leaves.length);
  for (let i = 0; i < live; i++) {
    input.receipt_siblings[i] = result.paths[i + 3].map(bytes);
    input.receipt_indexes[i] = String(i + 3);
  }
  rebindSnapshot(input);
}
function rebindCapsule(input) {
  const d = input.dependency;
  const packet = { hubDomain: fromBytes(input.snapshot.hub_domain), registryCommitment: fromBytes(input.snapshot.registry_commitment),
    context: Buffer.concat(input.context.map(value => fixed(value, 4))).toString('hex'), dependencyCapsule: {
      targetSlot: d.target_slot, targetContext: fromBytes(d.target_context), dependencyCount: d.dependency_count,
      predecessors: d.predecessors.map(p => ({ sourceSlot: p.source_slot,
        ...Object.fromEntries(SOURCE_HASH_FIELDS.map(key => [key, fromBytes(p[snake(key)])])) })), capsuleSalt: fromBytes(d.capsule_salt),
    } };
  input.dependency_capsule_commitment = words(capsuleHash(packet));
}
function rebindRevoked(input) {
  input.snapshot.revoked_digest = bytes(listHash(0x32, fromBytes(input.snapshot.hub_domain),
    input.revoked_entries.map(fromBytes), input.snapshot.revoked_count));
  rebindSnapshot(input);
}

/** Every mutation runs AFTER host composition, including malformed counts.
 * Rebound hashes isolate semantic constraints when appropriate. A wholly new
 * capsule plus consistent arbitrary state is NOT a P rejection expectation:
 * Ready/C129 and the hub supply those authorization gates.
 */
export function negativeFixtures() {
  const fanIn = positive(3), empty = positive(0);
  const cases = [
    ['changed-receipt-effect-with-stale-root', fanIn, x => { x.predecessor_receipts[0].global_effect_id[0] ^= 1; }],
    ['changed-receipt-source-with-rebound-root', fanIn, x => { x.predecessor_receipts[0].local_commitment[0] ^= 1; rebindReceipts(x); }],
    ['changed-amount-action-commitment', fanIn, x => { x.predecessor_receipts[0].action_commitment = bytes(transferHash(0, '26')); rebindReceipts(x); }],
    ['changed-receipt-key-with-rebound-root', fanIn, x => { x.predecessor_receipts[0].receipt_key_commitment[0] ^= 1; rebindReceipts(x); }],
    ['changed-receipt-rho-with-rebound-root', fanIn, x => { x.predecessor_receipts[0].receipt_rho[0] ^= 1; rebindReceipts(x); }],
    ['wrong-membership-path', fanIn, x => { x.receipt_siblings[0][0][0] ^= 1; }],
    ['wrong-membership-index', fanIn, x => { x.receipt_indexes[0] = '2'; }],
    ['index-outside-receipt-count', fanIn, x => { x.snapshot.receipt_count = '3'; rebindSnapshot(x); }],
    ['index-outside-tree-capacity', fanIn, x => { x.receipt_indexes[0] = '64'; }],
    ['revoked-predecessor-gid', fanIn, x => { x.revoked_entries[0] = [...x.predecessor_receipts[0].global_effect_id]; rebindRevoked(x); }],
    ['requested-window-outside-receipt', fanIn, x => { x.valid_from = '99'; }],
    ['empty-requested-window', fanIn, x => { x.valid_until = x.valid_from; }],
    ['snapshot-before-valid-window', fanIn, x => { x.snapshot.timestamp = '199'; rebindSnapshot(x); }],
    ['snapshot-at-exclusive-window-end', fanIn, x => { x.snapshot.timestamp = x.valid_until; rebindSnapshot(x); }],
    ['current-snapshot-halted', fanIn, x => { x.snapshot.halt = '1'; rebindSnapshot(x); }],
    ['missing-required-receipt', fanIn, x => { x.predecessor_receipts[2] = structuredClone(empty.inputs.predecessor_receipts[0]); }],
    ['missing-dependency-unchanged-commitment', fanIn, x => {
      x.dependency.dependency_count = 2; x.dependency.predecessors[2] = structuredClone(empty.inputs.dependency.predecessors[0]);
      x.predecessor_receipts[2] = structuredClone(empty.inputs.predecessor_receipts[0]);
      x.receipt_siblings[2] = structuredClone(empty.inputs.receipt_siblings[0]); x.receipt_indexes[2] = '0';
    }],
    ['forged-capsule-field-unchanged-commitment', fanIn, x => { x.dependency.predecessors[0].source_node_commitment[0] ^= 1; }],
    ['overflow-dependency-count-rebound', fanIn, x => { x.dependency.dependency_count = 4; rebindCapsule(x); }],
    ['duplicate-source-slot-rebound', fanIn, x => { x.dependency.predecessors[1].source_slot = 0; rebindCapsule(x); }],
    ['source-not-earlier-than-target-rebound', fanIn, x => { x.dependency.predecessors[2].source_slot = 3; rebindCapsule(x); }],
    ['target-context-mismatch', fanIn, x => { x.target_context[0] = String(BigInt(x.target_context[0]) ^ 1n); }],
    ['snapshot-digest-mismatch', fanIn, x => { x.snapshot.hub_state_sequence = '14'; }],
    ['overflow-receipt-count-rebound', fanIn, x => { x.snapshot.receipt_count = '65'; rebindSnapshot(x); }],
    ['overflow-revoked-count-rebound', fanIn, x => { x.snapshot.revoked_count = '65'; rebindRevoked(x); }],
    ['nonzero-unused-receipt', empty, x => { x.predecessor_receipts[0].global_effect_id[0] = 1; }],
    ['nonzero-unused-path', empty, x => { x.receipt_siblings[0][0][0] = 1; }],
    ['nonzero-unused-index', empty, x => { x.receipt_indexes[0] = '1'; }],
    ['nonzero-unused-predecessor-rebound', empty, x => { x.dependency.predecessors[0].source_node_commitment[0] = 1; rebindCapsule(x); }],
    ['nonzero-revoked-padding-rebound', fanIn, x => { x.revoked_entries[1][0] = 1; rebindRevoked(x); }],
    ['duplicate-revoked-gid-rebound', fanIn, x => { x.revoked_entries[1] = [...x.revoked_entries[0]]; x.snapshot.revoked_count = '2'; rebindRevoked(x); }],
  ];
  return cases.map(([name, original, mutate]) => {
    const inputs = structuredClone(original.inputs);
    mutate(inputs);
    return { name, inputs, expectedPublicInputs: publicWords(inputs) };
  });
}
