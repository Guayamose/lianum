/** Explicit fake read fixtures for parser boundaries. The test hash is not
 * Poseidon2. No owned EVM, RPC, backend, proof, key or native process starts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFlatSystemStateReader, decodeFlatWords, decodeFlatPoolObservation,
  decodeFlatFieldTree, decodeFlatHubState, decodeFlatOverflow, decodeFlatEvidenceHistory } from '../../../../src/execution/account/reconciliation/flat-system-state.mjs';
import { createCommitmentCodec, FIELD_MODULUS, ZERO } from '../../../../src/execution/encoding/commitments.mjs';
import { PrivateNoteTree, privateSpentDigest } from '../../../../../engine/src/notes/private-note-tree.mjs';
import { boundedListDigest } from '../../../../../engine/src/execution/native/state/native-state.mjs';

const h = value => createHash('sha256').update('fake flat-state parser: ' + value).digest('hex');
const f = value => BigInt(value).toString(16).padStart(64, '0');
const prefixed = value => '0x' + value;
const word = value => typeof value === 'boolean' ? f(value ? 1 : 0)
  : typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value
    : BigInt(value).toString(16).padStart(64, '0');
const abi = values => '0x' + values.map(word).join('');
const codec = createCommitmentCodec({ hashFields: async fields => '00' + h(fields.map(String).join(':')).slice(2) });
const math = { emptyLeaf: codec.emptyLeaf, nodeHash: codec.nodeHash, revokedDigest: codec.revokedDigest,
  evidenceState: codec.evidenceStateDigest };
const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment',
  'verifierSetCommitment', 'ledgerNamespace'].map(name => [name, h(name)]));
const domainCommitment = f(1);
async function tree(kind, live) {
  const empty = await codec.emptyLeaf(domainCommitment, kind), nodes = Array(128).fill(ZERO);
  nodes.fill(empty, 64); live.forEach((value, i) => { nodes[64 + i] = value; });
  for (let level = 1; level <= 6; level++) {
    const start = 64 >> level;
    for (let i = start; i < 2 * start; i++) nodes[i] = await codec.nodeHash(domainCommitment, kind, level, nodes[i * 2], nodes[i * 2 + 1]);
  }
  return nodes;
}
async function hubFixture() {
  const nodes = await tree(2, [f(5), f(6)]), tags = [0, 1, 2, 3].map(i => h('tag-' + i)).concat(Array(60).fill(ZERO));
  const revoked = [h('gid')].concat(Array(63).fill(ZERO));
  const revokedDigest = await codec.revokedDigest(domainCommitment, domain.hubDomain, revoked, '1');
  const stateOpening = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    receiptRoot: nodes[1], receiptCount: '2', revokedDigest, revokedCount: '1', revocationSequence: '1' };
  const state = { domain: domainCommitment, receiptRoot: nodes[1], receiptCount: '2',
    spentTagDigest: boundedListDigest(0x31, prefixed(domain.hubDomain), tags.map(prefixed), '4').slice(2),
    spentTagCount: '4', spentTagSequence: '1', revokedDigest, revokedCount: '1', revocationSequence: '1', stateSequence: '9',
    evidenceState: await codec.evidenceStateDigest(domainCommitment, stateOpening), halted: false,
    reservedTagCapacity: '4', totalReservedTagCapacity: '8' };
  return { nodes, tags, revoked, state, raw: abi([...Object.values(state), ...nodes.slice(64), ...tags, ...revoked]) };
}
function poolFixture() {
  const scope = prefixed(domain.scope), input = prefixed(h('input')), tree = new PrivateNoteTree([input]);
  const roots = [new PrivateNoteTree().root, tree.root], paddedRoots = roots.concat(Array(63).fill(prefixed(ZERO)));
  const count = Buffer.alloc(4); count.writeUInt32BE(roots.length);
  const history = '0x' + createHash('sha256').update(Buffer.concat([Buffer.from([0x18]), Buffer.from(domain.scope, 'hex'),
    count, ...paddedRoots.map(value => Buffer.from(value.slice(2), 'hex'))])).digest('hex');
  return { scope, policy: prefixed(domain.policy), asset: '0x' + '0'.repeat(40), assetIdentity: prefixed(domain.asset),
    rawState: abi([tree.root, privateSpentDigest(scope, [], 0), '1', '1', '0', '0', '1',
      input, ...Array(63).fill(ZERO), ...Array(64).fill(ZERO)]),
    rawHistory: abi(['1', history, '2', ...paddedRoots]), rawBacking: abi(['1', '5', '7', '2', '0', '0']) };
}

test('static ABI decoding rejects wrong widths, whitespace and noncanonical words', () => {
  assert.equal(decodeFlatWords(abi(Array(206).fill('0')), 206).length, 206);
  for (const raw of [abi(Array(205).fill('0')), abi(Array(206).fill('0')) + '\n',
    abi(Array(206).fill('0')).slice(0, -1) + '\n', '0X' + ZERO, '0x' + 'A'.repeat(64)])
    assert.throws(() => decodeFlatWords(raw, 206), /ABI/);
});

test('legacy pool reconstruction retains SHA roots/history/spent/backing and four-output headroom', () => {
  const raw = poolFixture(), decoded = decodeFlatPoolObservation(raw);
  assert.equal(decoded.publicState.backedAmount, '5'); assert.equal(decoded.publicState.surplus, '2');
  assert.equal(decoded.tree.path(0).leaf, prefixed(h('input')));
  assert.equal(decoded.tree.append, undefined);
  assert.ok(Object.isFrozen(decoded.tree.nodes));
  const corrupt = decodeFlatWords(raw.rawState, 135); corrupt[64] = prefixed(h('nonzero padding'));
  assert.throws(() => decodeFlatPoolObservation({ ...raw, rawState: abi(corrupt) }), /PADDING/);
  const overbooked = decodeFlatWords(raw.rawState, 135); overbooked[5] = prefixed(f(16));
  assert.throws(() => decodeFlatPoolObservation({ ...raw, rawState: abi(overbooked) }), /HEADROOM/);
  assert.throws(() => decodeFlatPoolObservation({ ...raw, rawBacking: abi(['1', '5', '4', '0', '1', '0']) }), /DEFICIT/);
  const max = 64n * ((1n << 64n) - 1n);
  assert.equal(decodeFlatPoolObservation({ ...raw, rawBacking: abi(['1', max, max, '0', '0', '0']) }).publicState.backedAmount, String(max));
});

test('independent historical balances must match native and ERC20 canonical backing', () => {
  const native = poolFixture();
  assert.equal(decodeFlatPoolObservation(native, { assetBalance: 7n, nativeBalance: 7n }).publicState.actualAssetBalance, '7');
  assert.throws(() => decodeFlatPoolObservation(native, { assetBalance: 6n, nativeBalance: 7n }), /ACTUAL_ASSET_BACKING/);
  assert.throws(() => decodeFlatPoolObservation(native, { assetBalance: 7n, nativeBalance: 6n }), /NATIVE_BACKING/);
  const token = { ...native, asset: '0x' + '12'.repeat(20), rawBacking: abi(['1', '5', '7', '2', '0', '3']) };
  assert.equal(decodeFlatPoolObservation(token, { assetBalance: 7n, nativeBalance: 3n }).publicState.unrelatedNative, '3');
  // A self-consistent backing tuple still fails if the token's own historical
  // balanceOf differs; unrelated ETH cannot stand in for contract backing.
  assert.throws(() => decodeFlatPoolObservation(token, { assetBalance: 8n, nativeBalance: 3n }), /ACTUAL_ASSET_BACKING/);
  assert.throws(() => decodeFlatPoolObservation(token, { assetBalance: 7n, nativeBalance: 0n }), /UNRELATED_NATIVE/);
  for (const assetBalance of ['7', -1n, 1n << 256n])
    assert.throws(() => decodeFlatPoolObservation(token, { assetBalance, nativeBalance: 3n }), /ASSET_BALANCE/);
  assert.throws(() => decodeFlatPoolObservation(token, { assetBalance: 7n, nativeBalance: 3n, valid: true }), /EXACT_FIELDS/);
});

test('P2 heap reconstruction enforces typed empties, levels, canonical fields and ordered history', async () => {
  const nodes = await tree(0, [f(9), f(10)]);
  const decoded = await decodeFlatFieldTree(abi(nodes), '2', nodes[1], domainCommitment, 0, math, true);
  assert.equal(decoded.prefixRoots.length, 3); assert.equal(decoded.prefixRoots[2], nodes[1]);
  assert.equal(decoded.path(1).siblings.length, 6); assert.equal(decoded.path(1).leaf, f(10));
  assert.throws(() => decoded.path(2), /INDEX/);
  const padding = [...nodes]; padding[66] = ZERO;
  await assert.rejects(decodeFlatFieldTree(abi(padding), '2', nodes[1], domainCommitment, 0, math), /TYPED_PADDING/);
  const wrongNode = [...nodes]; wrongNode[2] = f(3);
  await assert.rejects(decodeFlatFieldTree(abi(wrongNode), '2', nodes[1], domainCommitment, 0, math), /FIELD_TREE/);
  const noncanonical = [...nodes]; noncanonical[3] = f(FIELD_MODULUS);
  await assert.rejects(decodeFlatFieldTree(abi(noncanonical), '2', nodes[1], domainCommitment, 0, math), /FIELD_RANGE/);
  const duplicate = await tree(2, [f(7), f(7)]);
  await assert.rejects(decodeFlatFieldTree(abi(duplicate), '2', duplicate[1], domainCommitment, 2, math), /DUPLICATE_LEAF/);
});

test('206-word hub parser checks global tags, per-domain revocation/evidence and capacity', async () => {
  const fixture = await hubFixture(), decoded = await decodeFlatHubState(fixture.raw, { domain, domainCommitment }, math);
  assert.equal(decoded.commitments.length, 64); assert.equal(decoded.tags.length, 64); assert.equal(decoded.revokedEntries.length, 64);
  assert.equal(decoded.state.spentTagCount, '4'); assert.equal(decoded.state.totalReservedTagCapacity, '8');
  assert.equal(decoded.evidence.receiptRoot, fixture.nodes[1]);
  for (const [offset, value, pattern] of [[0, f(2), /SAME_DOMAIN/], [5, f(2), /TAG_SEQUENCE/],
    [13, f(64), /HEADROOM/], [11, f(1), /PERMANENT_HALT/], [8, f(2), /EVIDENCE_DIGEST/],
    [142 + 1, h('nonzero unused gid'), /VECTOR_PADDING/]]) {
    const bad = decodeFlatWords(fixture.raw, 206); bad[offset] = prefixed(value);
    await assert.rejects(decodeFlatHubState(abi(bad), { domain, domainCommitment }, math), pattern);
  }
});

test('overflow is observed separately and never extends the enumerable revoked vector', () => {
  const state = { revokedCount: '64', revocationSequence: '65', halted: true };
  const parsed = decodeFlatOverflow(abi(['1']), abi([h('rolling overflow')]), state);
  assert.equal(parsed.count, '1'); assert.match(parsed.digestAssurance, /NOT_REPLAYED/);
  assert.throws(() => decodeFlatOverflow(abi(['1']), abi([h('rolling overflow')]), { ...state, halted: false }), /OVERFLOW_HALT/);
  assert.throws(() => decodeFlatOverflow(abi(['0']), abi([h('not empty')]), { ...state, revocationSequence: '64' }), /EMPTY_OVERFLOW/);
  assert.throws(() => decodeFlatOverflow(abi(['2']), abi([h('rolling overflow')]), state), /REVOCATION_SEQUENCE/);
});

test('evidence history truncation preserves current mapping semantics after 129 stored states', () => {
  const entries = Array.from({ length: 129 }, (_, i) => f(i + 1));
  const full = decodeFlatEvidenceHistory(abi(entries), '129', entries[128]);
  assert.equal(full.truncated, false);
  const overflow = decodeFlatEvidenceHistory(abi(entries), '130', f(1000));
  assert.equal(overflow.storedCount, 129); assert.equal(overflow.truncated, true);
  assert.ok(!overflow.values.includes(f(1000)));
  assert.throws(() => decodeFlatEvidenceHistory(abi(entries), '128', entries[127]), /PADDING/);
  assert.throws(() => decodeFlatEvidenceHistory(abi(entries), '129', f(1000)), /HISTORY_CURRENT/);
  assert.throws(() => decodeFlatEvidenceHistory(abi(entries), '130\n', f(1000)), /DECIMAL/);
});

test('lookalike runtime/system cannot mint a live reader; parser fixtures grant no ownership', async () => {
  let calls = 0;
  const runtime = { health() { calls++; }, block() { calls++; } };
  await assert.rejects(createFlatSystemStateReader({ runtime, system: { pools: [{}, {}] }, poolIndex: 0 }), /OWNED_SYSTEM_CAPABILITY/);
  await assert.rejects(createFlatSystemStateReader({ runtime, system: {}, poolIndex: 0, rpcUrl: 'forbidden' }), /EXACT_FIELDS/);
  assert.equal(calls, 0);
});
