import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  NATIVE_STATE_ZERO as ZERO, NATIVE_STATE_PREFIX, NATIVE_STATE_PUBLIC_WORDS,
  EVIDENCE_STATE_FIELDS, SNAPSHOT_FIELDS, evidenceStateFrame, evidenceStateDigest,
  evidenceStateWords, evidenceStateToNoir, snapshotFrame, snapshotDigest, snapshotWords,
  snapshotToNoir, boundedListFrame, boundedListDigest, boundedListToNoir, assertAbsent,
  membership, nodeHash, nativeDigestWords, nativeStateVectors,
} from '../../src/paeg/native-state.mjs';
import { PrivateNoteTree, privateSpentDigest, noteNodeHash, noteWordsToHash } from '../../src/private-note-tree.mjs';

// Host codec/invariant checks, not Noir execution or verifier acceptance tests.
const h = n => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const b = value => Buffer.from(value.slice(2), 'hex');
const sha = frame => `0x${createHash('sha256').update(frame).digest('hex')}`;
const fixed = (value, size) => Buffer.from(BigInt(value).toString(16).padStart(size * 2, '0'), 'hex');
const independentH4 = (tag, values) => Buffer.concat([Buffer.from(tag), ...values].flatMap(value => [fixed(value.length, 4), value]));
const evidence = {
  hubDomain: h(1), registryCommitment: h(2), receiptRoot: h(3), receiptCount: '4',
  revokedDigest: h(5), revokedCount: '6', revocationSequence: '18446744073709551615',
};
const snapshot = {
  hubDomain: h(1), registryCommitment: h(2), pool: `0x${'12'.repeat(20)}`,
  scope: h(3), policy: h(4), assetIdentity: h(5), poolRoot: h(6), poolSpentDigest: h(7),
  poolSpentCount: '8', poolStateSequence: '18446744073709551615', receiptRoot: h(9), receiptCount: '10',
  spentTagDigest: h(11), spentTagCount: '12', spentTagSequence: '13', revokedDigest: h(14), revokedCount: '15',
  revocationSequence: '16', hubStateSequence: '17', registryEpoch: '18', halt: '1', timestamp: '19',
};

test('H4 evidence/checkpoint have exact independent flat framing, no implicit profile', () => {
  const expectedE = independentH4('LIANUM/PAEG/evidence-state/2', [b(evidence.hubDomain), b(evidence.registryCommitment),
    b(evidence.receiptRoot), fixed(4, 4), b(evidence.revokedDigest), fixed(6, 4), fixed(evidence.revocationSequence, 8)]);
  const s = snapshot;
  const expectedS = independentH4('LIANUM/PAEG/checkpoint/2', [b(s.hubDomain), b(s.registryCommitment), b(s.pool),
    b(s.scope), b(s.policy), b(s.assetIdentity), b(s.poolRoot), b(s.poolSpentDigest), fixed(8, 4),
    fixed(s.poolStateSequence, 8), b(s.receiptRoot), fixed(10, 4), b(s.spentTagDigest), fixed(12, 4), fixed(13, 8),
    b(s.revokedDigest), fixed(15, 4), fixed(16, 8), fixed(17, 8), fixed(18, 8), fixed(1, 1), fixed(19, 8)]);
  assert.equal(expectedE.length, 204); assert.equal(expectedS.length, 521);
  assert.deepEqual(evidenceStateFrame(evidence), expectedE);
  assert.deepEqual(snapshotFrame(snapshot), expectedS);
  assert.equal(evidenceStateDigest(evidence), sha(expectedE));
  assert.equal(snapshotDigest(snapshot), sha(expectedS));
  assert.equal(evidenceStateDigest(evidence), '0x9ae6aa46f532b655d48976ffdcbb6657826b983d80d732c06b657b7be941f53d');
  assert.equal(snapshotDigest(snapshot), '0x1defb262054cce5e5fef3e861cda79e7e0eb6e97542887838ef3e4e42f992ee3');
  const wrongProfile = independentH4('LIANUM/PAEG/checkpoint/2', [Buffer.from('LIANUM_PAEG_GRAPH_4_V1'), expectedS]);
  assert.notEqual(snapshotDigest(snapshot), sha(wrongProfile));
  assert.equal(snapshotFrame(snapshot).readUInt32BE(0), 24);
  assert.equal(snapshotFrame(snapshot).readUInt32BE(100), 20);
  assert.equal(snapshotFrame(snapshot).readUInt32BE(504), 1);
});

test('every state component is bound, including hub, registry, counts, halt and full u64', () => {
  for (const [source, fields, digest] of [[snapshot, SNAPSHOT_FIELDS, snapshotDigest], [evidence, EVIDENCE_STATE_FIELDS, evidenceStateDigest]]) {
    for (const field of fields) {
      const changed = structuredClone(source);
      if (field === 'halt') changed[field] = '0';
      else if (source[field].startsWith('0x')) changed[field] = '0x' + 'ab'.repeat((source[field].length - 2) / 2);
      else changed[field] = String(BigInt(source[field]) - 1n);
      assert.notEqual(digest(changed), digest(source), field);
    }
  }
});

test('exact field sets and canonical typed encodings reject ambiguity and hosted flags', () => {
  for (const [source, digest] of [[snapshot, snapshotDigest], [evidence, evidenceStateDigest]]) {
    for (const extra of ['profile', 'verified', 'stateVerified', 'root', 'ownerKey']) {
      assert.throws(() => digest({ ...source, [extra]: true }), /PAEG_STATE_.*_FIELDS/);
    }
    for (const field of Object.keys(source)) {
      const missing = { ...source }; delete missing[field];
      assert.throws(() => digest(missing), /PAEG_STATE_.*_FIELDS/);
    }
    assert.throws(() => digest(Object.assign(Object.create(null), source)), /FIELDS/);
  }
  for (const value of [h(1).slice(2), '0x' + 'AB'.repeat(32), '0x0', Buffer.alloc(32), h(1) + '00', null]) {
    assert.throws(() => snapshotDigest({ ...snapshot, hubDomain: value }), /PAEG_STATE_HEX/);
  }
  for (const value of [0, 1n, -0, '01', '+1', '-1', '1.0', '1e1', ' 1', '1 ', '', true, '18446744073709551616']) {
    assert.throws(() => snapshotDigest({ ...snapshot, timestamp: value }), /PAEG_STATE_INTEGER/);
  }
  for (const field of ['poolSpentCount', 'receiptCount', 'spentTagCount', 'revokedCount']) {
    for (const value of ['65', '4294967296']) assert.throws(() => snapshotDigest({ ...snapshot, [field]: value }), /RANGE/);
  }
  assert.throws(() => snapshotDigest({ ...snapshot, halt: '2' }), /RANGE/);
  assert.throws(() => snapshotDigest({ ...snapshot, halt: true }), /INTEGER/);
  assert.throws(() => snapshotDigest({ ...snapshot, pool: h(1) }), /HEX/);
});

test('bounded sets zero/small/full vectors preserve 2085 bytes and legacy spent digest', () => {
  for (const count of [0, 1, 2, 63, 64]) {
    const entries = Array.from({ length: count }, (_, i) => h(i + 1));
    const padded = [...entries, ...Array(64 - count).fill(ZERO)];
    for (const prefix of Object.values(NATIVE_STATE_PREFIX)) {
      const reference = Buffer.concat([Buffer.from([prefix]), b(h(99)), fixed(count, 4), ...padded.map(b)]);
      const frame = boundedListFrame(prefix, h(99), entries, String(count));
      assert.equal(frame.length, 2085);
      assert.deepEqual(frame, reference);
      assert.equal(boundedListDigest(prefix, h(99), entries), sha(reference));
      assert.equal(boundedListDigest(prefix, h(99), entries), boundedListDigest(prefix, h(99), padded, String(count)));
      const witness = boundedListToNoir(prefix, h(99), entries);
      assert.equal(witness.count, String(count)); assert.equal(witness.entries.length, 64);
      assert.deepEqual(witness.entries, padded.map(value => [...b(value)]));
      if (prefix === 2) assert.equal(sha(reference), privateSpentDigest(h(99), padded, count));
    }
  }
  const digests = Object.values(NATIVE_STATE_PREFIX).map(prefix => boundedListDigest(prefix, h(99), [h(1)]));
  assert.equal(new Set(digests).size, 3);
  assert.equal(boundedListDigest(2, h(99), []), '0x7a9ff0236300e587f84da14cb95338a1ad2df25f4ef0d826800aebfb25b2e2c9');
  assert.equal(boundedListDigest(0x31, h(99), []), '0xabc7ce904893c55231cd9ae74473ecdf180e359c8b2e837f00d7efe0ac674f69');
  assert.equal(boundedListDigest(0x32, h(99), []), '0xde5b2774e0bf321ef12109bcf589c186ac02116f1d3defa40a933702a075feb6');
  assert.notEqual(boundedListDigest(0x31, h(99), [h(1)]), boundedListDigest(0x31, h(100), [h(1)]));
});

test('absence recomputes canonical digest and rejects mutated/present/duplicate/zero/tail witnesses', () => {
  for (const prefix of Object.values(NATIVE_STATE_PREFIX)) {
    const entries = [h(1), h(2)], digest = boundedListDigest(prefix, h(99), entries);
    assert.doesNotThrow(() => assertAbsent(prefix, h(99), entries, '2', digest, h(3)));
    assert.throws(() => assertAbsent(prefix, h(99), entries, '2', digest, h(2)), /PRESENT/);
    assert.throws(() => assertAbsent(prefix, h(99), [h(1), h(3)], '2', digest, h(2)), /LIST_DIGEST/);
    assert.throws(() => assertAbsent(prefix, h(100), entries, '2', digest, h(3)), /LIST_DIGEST/);
    assert.throws(() => assertAbsent(prefix, h(99), entries, '2', h(9), h(3)), /LIST_DIGEST/);
    assert.throws(() => assertAbsent(prefix, h(99), entries, '2', digest, ZERO), /ABSENT_ZERO/);
    assert.throws(() => boundedListDigest(prefix, h(99), [h(1), h(1)]), /DUPLICATE/);
    assert.throws(() => boundedListDigest(prefix, h(99), [ZERO]), /ZERO_ENTRY/);
    assert.throws(() => boundedListDigest(prefix, h(99), [h(1), h(2)], '1'), /PADDING/);
    assert.throws(() => boundedListDigest(prefix, h(99), [h(1)], '2'), /LIST_COUNT/);
    assert.throws(() => boundedListDigest(prefix, h(99), [], '65'), /COUNT_RANGE/);
    assert.throws(() => boundedListDigest(prefix, h(99), Array(65).fill(ZERO), '0'), /CAPACITY/);
    assert.throws(() => boundedListDigest(prefix, h(99), Array(64), '0'), /HEX/);
    assert.throws(() => boundedListDigest(prefix, h(99), [h(1)], 1), /COUNT/);
    const zeroDigest = boundedListDigest(prefix, h(99), []);
    assert.doesNotThrow(() => assertAbsent(prefix, h(99), [], '0', zeroDigest, h(1)));
    const all = Array.from({ length: 64 }, (_, i) => h(i + 1));
    assert.doesNotThrow(() => assertAbsent(prefix, h(99), all, '64', boundedListDigest(prefix, h(99), all), h(65)));
  }
  for (const prefix of [0, 1, 3, 4, 0x30, 0x33, 256, '49', null]) {
    assert.throws(() => boundedListDigest(prefix, h(99), []), /PREFIX/);
  }
});

test('membership matches existing zero-leaf depth-six PrivateNoteTree at every index', () => {
  assert.equal(nodeHash(h(1), h(2)), noteNodeHash(h(1), h(2)));
  const tree = new PrivateNoteTree(Array.from({ length: 64 }, (_, i) => h(i + 1)));
  for (let i = 0; i < 64; i++) {
    const p = tree.path(i);
    assert.doesNotThrow(() => membership(p.leaf, p.siblings, String(i), p.root));
    assert.throws(() => membership(p.leaf, p.siblings, String(i ^ 1), p.root), /MEMBERSHIP/);
  }
  const p = new PrivateNoteTree([h(1)]).path(0);
  const wrongSibling = [...p.siblings]; wrongSibling[2] = h(99);
  assert.throws(() => membership(p.leaf, wrongSibling, '0', p.root), /MEMBERSHIP/);
  assert.throws(() => membership(h(2), p.siblings, '0', p.root), /MEMBERSHIP/);
  assert.throws(() => membership(p.leaf, p.siblings, '0', h(99)), /MEMBERSHIP/);
  for (const index of ['64', '4294967295', '-1', '00', '1.1', 0]) {
    assert.throws(() => membership(p.leaf, p.siblings, index, p.root), /INDEX/);
  }
  assert.throws(() => membership(p.leaf, p.siblings.slice(1), '0', p.root), /PATH_DEPTH/);
  assert.throws(() => membership(ZERO, p.siblings, '0', new PrivateNoteTree().root), /EMPTY_LEAF/);
});

test('Noir serialization and ordered public vectors preserve full digest/address/u64 widths', () => {
  const e = evidenceStateToNoir(evidence), s = snapshotToNoir(snapshot);
  assert.equal(e.revocation_sequence, '18446744073709551615');
  assert.equal(s.pool_state_sequence, '18446744073709551615');
  assert.equal(s.pool.length, 20); assert.equal(s.halt, '1');
  assert.deepEqual(s.hub_domain, [...b(snapshot.hubDomain)]);
  assert.equal(snapshotWords(snapshot).length, NATIVE_STATE_PUBLIC_WORDS.snapshot);
  assert.equal(evidenceStateWords(evidence).length, NATIVE_STATE_PUBLIC_WORDS.evidence);
  assert.equal(noteWordsToHash(evidenceStateWords(evidence).slice(0, 8)), evidence.hubDomain);
  assert.equal(noteWordsToHash(snapshotWords(snapshot).slice(0, 8)), snapshot.hubDomain);
  assert.deepEqual(snapshotWords(snapshot).slice(16, 21), Array(5).fill('303174162'));
  const maximumHash = `0x${'ff'.repeat(32)}`;
  assert.deepEqual(nativeDigestWords(maximumHash), Array(8).fill('4294967295'));
  assert.equal(noteWordsToHash(nativeDigestWords(maximumHash)), maximumHash);
  const vector = nativeStateVectors(snapshot, evidence);
  assert.equal(vector.snapshot.digest, snapshotDigest(snapshot));
  assert.equal(vector.evidenceState.frame, '0x' + evidenceStateFrame(evidence).toString('hex'));
  vector.snapshot.noir.hub_domain[0] = 255;
  assert.equal(snapshotToNoir(snapshot).hub_domain[0], 0);
  assert.doesNotMatch(JSON.stringify(vector), /verified|privateKey|scalar/);
});

test('state codecs accept all bounded count edges and zero/max u64 without rounding', () => {
  for (const count of ['0', '1', '64']) {
    for (const sequence of ['0', '9007199254740993', '18446744073709551615']) {
      const value = { ...snapshot, poolSpentCount: count, receiptCount: count, spentTagCount: count,
        revokedCount: count, poolStateSequence: sequence, spentTagSequence: sequence, revocationSequence: sequence,
        hubStateSequence: sequence, registryEpoch: sequence, timestamp: sequence };
      assert.equal(snapshotToNoir(value).timestamp, sequence);
      assert.equal(snapshotFrame(value).readBigUInt64BE(513), BigInt(sequence));
      assert.equal(evidenceStateFrame({ ...evidence, receiptCount: count, revokedCount: count,
        revocationSequence: sequence }).readBigUInt64BE(196), BigInt(sequence));
    }
  }
});

test('shared-hub independently generated Python byte vectors match the host codec', () => {
  // Frozen framing-only values from docs/NATIVE-RECEIPT-HUB.md. The synthetic
  // registry and spent digest deliberately do not establish valid chain state.
  const hubDomain = '0x736d1f907b2425c21d5c3516793a7bcb5f8dc0af1c562e06b39f9d71d4c68f7e';
  const registryCommitment = '0x' + '33'.repeat(32);
  const root = new PrivateNoteTree().root;
  assert.equal(root, '0xc6984907d2e534964351393bc85f04374065b63870cc859c68192def090c1017');
  const spentTagDigest = boundedListDigest(0x31, hubDomain, []);
  const revokedDigest = boundedListDigest(0x32, hubDomain, []);
  assert.equal(spentTagDigest, '0x6ca4495c78a314134fd98e7b16a5d0e5885980494f4503002102913ac8ec8c69');
  assert.equal(revokedDigest, '0x55b13bafe45456b39f5f921fcc42e3268a39ad035dd3054fcfd44f7962f94ad3');
  const state = { hubDomain, registryCommitment, receiptRoot: root, receiptCount: '0', revokedDigest,
    revokedCount: '0', revocationSequence: '0' };
  assert.equal(evidenceStateDigest(state), '0x74e784919e37d4dbb8a62d8c8cf1ef46254085fa5fe2d647f3933199b5c84e49');
  const checkpoint = { ...state, pool: '0x' + '44'.repeat(20), scope: '0x' + '55'.repeat(32),
    policy: '0x' + '66'.repeat(32), assetIdentity: '0x' + '77'.repeat(32), poolRoot: root,
    poolSpentDigest: '0x' + '88'.repeat(32), poolSpentCount: '0', poolStateSequence: '0',
    spentTagDigest, spentTagCount: '0', spentTagSequence: '0', hubStateSequence: '0',
    registryEpoch: '1', halt: '0', timestamp: '1700000000' };
  assert.equal(snapshotDigest(checkpoint), '0xadfb76a3099a309856a1f99aa493eb28992e1bac1871e22d1b594cdca86ad2c5');
});
