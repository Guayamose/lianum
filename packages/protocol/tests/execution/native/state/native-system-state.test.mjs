import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeNativeHubState, decodeNativeCheckpoint, decodeNativeCheckpointTree, readNativeSystemState } from '../../../../../backend/src/execution/native/state/native-system-state.mjs';
import { PrivateNoteTree, ZERO_NOTE_HASH } from '../../../../../engine/src/notes/private-note-tree.mjs';
import { boundedListDigest, evidenceStateDigest, nodeHash, membership } from '../../../../../engine/src/execution/native/state/native-state.mjs';
import { assertOwnedNativeSystem } from '../../../../../backend/src/execution/native/dispatch/native-deployment.mjs';

const hubDomain = '0x' + '11'.repeat(32), registryCommitment = '0x' + '22'.repeat(32);
const domains = { hubDomain, registryCommitment }, tree = new PrivateNoteTree();
const word = value => BigInt(value).toString(16).padStart(64, '0');
function fixture() {
  const evidence = { ...domains, receiptRoot: tree.root, receiptCount: '0',
    revokedDigest: boundedListDigest(0x32, hubDomain, [], '0'), revokedCount: '0', revocationSequence: '0' };
  const header = [tree.root, 0, boundedListDigest(0x31, hubDomain, [], '0'), 0, 0,
    evidence.revokedDigest, 0, 0, 0, evidenceStateDigest(evidence), 0];
  const encoded = [...header, ...Array(192).fill(ZERO_NOTE_HASH)].map(word);
  return { evidence, encoded, raw: '0x' + encoded.join('') };
}
test('empty hub reconstruction checks actual hash preimages and preserves canonical fields', () => {
  const f = fixture(), decoded = decodeNativeHubState(f.raw, domains);
  assert.deepEqual(decoded.evidence, f.evidence);
  assert.equal(decoded.receiptTree.root, tree.root);
  assert.equal(decoded.tags.length, 64);
});
test('a corrupted digest, hidden suffix entry or out-of-range counter cannot become state', () => {
  for (const [index, value] of [[2, 123], [11, 123], [139, 123], [1, 65], [10, 2]]) {
    const f = fixture(); f.encoded[index] = word(value);
    assert.throws(() => decodeNativeHubState('0x' + f.encoded.join(''), domains));
  }
  assert.throws(() => decodeNativeHubState(fixture().raw + word(0), domains), /STATE_ABI/);
  assert.throws(() => decodeNativeCheckpoint('0x' + word(0).repeat(19), domains), /STATE_ABI/);
});
test('a fabricated deployment is rejected before any caller-provided transport is used', async () => {
  let calls = 0;
  const runtime = { block: async () => { calls++; throw Error('must not run'); } };
  assert.throws(() => assertOwnedNativeSystem(undefined, {}), /OWNED_SYSTEM_CAPABILITY/);
  await assert.rejects(readNativeSystemState(runtime, {}, 0), /OWNED_SYSTEM_CAPABILITY/);
  assert.equal(calls, 0);
});

test('two separately authorized equal checkpoint leaves retain distinct valid positions', () => {
  const nodes = Array(128).fill(ZERO_NOTE_HASH);
  nodes[64] = hubDomain; nodes[65] = hubDomain;
  for (let i = 63; i > 0; i--) nodes[i] = nodeHash(nodes[i * 2], nodes[i * 2 + 1]);
  const decoded = decodeNativeCheckpointTree('0x' + nodes.map(word).join(''), '2', nodes[1]);
  for (const i of [0, 1]) {
    const path = decoded.path(i);
    membership(path.leaf, path.siblings, String(i), path.root);
  }
  assert.throws(() => decoded.path(2), /CHECKPOINT_INDEX/);
});
