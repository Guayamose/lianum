/** Read the owned deployment at one canonical EVM block and reconstruct its
 * public commitments. These are authenticated local-RPC observations, not a
 * public-chain light client or a substitute for the native evidence quorum.
 */
import assert from 'node:assert/strict';
import { assertLocalEvm } from './local-evm.mjs';
import { assertOwnedNativeSystem } from './native-deployment.mjs';
import { inspectGenericSnapshot } from './local-ledger.mjs';
import { PrivateNoteTree, ZERO_NOTE_HASH } from '../private-note-tree.mjs';
import { boundedListDigest, evidenceStateDigest, snapshotDigest, nodeHash } from './native-state.mjs';

function words(raw, expected) {
  assert.equal(typeof raw, 'string', 'NATIVE_CHAIN_STATE_ENCODING');
  assert.match(raw, /^0x[0-9a-f]*$/, 'NATIVE_CHAIN_STATE_ENCODING');
  assert.equal(raw.length, 2 + expected * 64, 'NATIVE_CHAIN_STATE_ABI');
  return Array.from({ length: expected }, (_, i) => '0x' + raw.slice(2 + i * 64, 66 + i * 64));
}
function uint(word, maximum) {
  const n = BigInt(word);
  assert.ok(n >= 0n && n <= maximum, 'NATIVE_CHAIN_STATE_INTEGER');
  return n.toString();
}
const U64 = (1n << 64n) - 1n;
const snapshotFields = [
  'pool', 'scope', 'policy', 'assetIdentity', 'poolRoot', 'poolSpentDigest',
  'poolSpentCount', 'poolStateSequence', 'receiptRoot', 'receiptCount',
  'spentTagDigest', 'spentTagCount', 'spentTagSequence', 'revokedDigest',
  'revokedCount', 'revocationSequence', 'hubStateSequence', 'registryEpoch',
  'halt', 'timestamp',
];
const counts = new Set(['poolSpentCount', 'receiptCount', 'spentTagCount', 'revokedCount']);
const sequences = new Set(['poolStateSequence', 'spentTagSequence', 'revocationSequence',
  'hubStateSequence', 'registryEpoch', 'timestamp']);

export function decodeNativeCheckpoint(raw, { hubDomain, registryCommitment }) {
  const encoded = words(raw, 20), result = { hubDomain, registryCommitment };
  snapshotFields.forEach((field, i) => {
    if (field === 'pool') {
      assert.ok(BigInt(encoded[i]) < (1n << 160n), 'NATIVE_CHAIN_POOL_ADDRESS');
      result[field] = '0x' + encoded[i].slice(-40);
    } else if (counts.has(field)) result[field] = uint(encoded[i], 64n);
    else if (sequences.has(field)) result[field] = uint(encoded[i], U64);
    else if (field === 'halt') result[field] = uint(encoded[i], 1n);
    else result[field] = encoded[i];
  });
  snapshotDigest(result); // Exact canonical types/bytes, including all domains.
  return result;
}

export function decodeNativeHubState(raw, { hubDomain, registryCommitment }) {
  const encoded = words(raw, 203);
  const state = {
    receiptRoot: encoded[0], receiptCount: uint(encoded[1], 64n),
    spentTagDigest: encoded[2], spentTagCount: uint(encoded[3], 64n),
    spentTagSequence: uint(encoded[4], U64), revokedDigest: encoded[5],
    revokedCount: uint(encoded[6], 64n), revocationSequence: uint(encoded[7], U64),
    stateSequence: uint(encoded[8], U64), evidenceState: encoded[9],
    halt: uint(encoded[10], 1n),
  };
  const commitments = encoded.slice(11, 75), tags = encoded.slice(75, 139);
  const revokedEntries = encoded.slice(139);
  assert.ok(commitments.slice(Number(state.receiptCount)).every(value => value === ZERO_NOTE_HASH),
    'NATIVE_CHAIN_RECEIPT_PADDING');
  const receiptTree = new PrivateNoteTree(commitments.slice(0, Number(state.receiptCount)));
  assert.equal(receiptTree.root, state.receiptRoot, 'NATIVE_CHAIN_RECEIPT_ROOT');
  assert.equal(boundedListDigest(0x31, hubDomain, tags, state.spentTagCount), state.spentTagDigest,
    'NATIVE_CHAIN_SPENT_TAG_DIGEST');
  assert.equal(boundedListDigest(0x32, hubDomain, revokedEntries, state.revokedCount), state.revokedDigest,
    'NATIVE_CHAIN_REVOCATION_DIGEST');
  const evidence = { hubDomain, registryCommitment, receiptRoot: state.receiptRoot,
    receiptCount: state.receiptCount, revokedDigest: state.revokedDigest,
    revokedCount: state.revokedCount, revocationSequence: state.revocationSequence };
  assert.equal(evidenceStateDigest(evidence), state.evidenceState, 'NATIVE_CHAIN_EVIDENCE_STATE');
  return { state, evidence, commitments, tags, revokedEntries, receiptTree };
}

/** Checkpoints can legitimately repeat an identical snapshot in one block
 * under different quorum-approved request IDs. Receipt notes cannot repeat,
 * so their unique-leaf tree class is deliberately not reused here. */
export function decodeNativeCheckpointTree(raw, count, expectedRoot) {
  const nodes = words(raw, 128), size = Number(uint(count, 64n));
  assert.equal(nodes[0], ZERO_NOTE_HASH, 'NATIVE_CHAIN_CHECKPOINT_UNUSED_NODE');
  assert.ok(nodes.slice(64, 64 + size).every(value => value !== ZERO_NOTE_HASH),
    'NATIVE_CHAIN_CHECKPOINT_EMPTY_LEAF');
  assert.ok(nodes.slice(64 + size).every(value => value === ZERO_NOTE_HASH),
    'NATIVE_CHAIN_CHECKPOINT_PADDING');
  for (let i = 63; i > 0; i--) {
    assert.equal(nodes[i], nodeHash(nodes[i * 2], nodes[i * 2 + 1]), 'NATIVE_CHAIN_CHECKPOINT_TREE');
  }
  assert.equal(nodes[1], expectedRoot, 'NATIVE_CHAIN_CHECKPOINT_ROOT');
  return Object.freeze({ root: nodes[1], leafCount: size,
    nodes: Object.freeze([...nodes]), leaves: Object.freeze(nodes.slice(64)),
    path(index) {
      assert.ok(Number.isSafeInteger(index) && index >= 0 && index < size, 'NATIVE_CHAIN_CHECKPOINT_INDEX');
      const siblings = [];
      for (let cursor = 64 + index; cursor > 1; cursor = Math.floor(cursor / 2)) siblings.push(nodes[cursor ^ 1]);
      return { index, leaf: nodes[64 + index], root: nodes[1], siblings };
    } });
}

export async function readNativeSystemState(runtime, system, poolIndex) {
  assertOwnedNativeSystem(runtime, system);
  await assertLocalEvm(runtime);
  assert.ok(poolIndex === 0 || poolIndex === 1, 'NATIVE_CHAIN_POOL_INDEX');
  const pool = system.pools[poolIndex], header = await runtime.block();
  const at = header.number, hub = system.hub;
  const [hubCode, poolCode, hubRaw, snapshotRaw, checkpointNodesRaw, checkpointCountRaw,
    checkpointRoot, receiptNodesRaw, rawState, rawHistory, rawBacking] = await Promise.all([
    runtime.code(hub.address, at), runtime.code(pool.address, at),
    hub.call('canonicalState()', [], at), hub.call('currentSnapshot(address)', [pool.address], at),
    hub.call('checkpointTreeNodes()', [], at), hub.call('checkpointCount()', [], at),
    hub.call('checkpointRoot()', [], at), hub.call('receiptTreeNodes()', [], at),
    pool.call('canonicalState()', [], at), pool.call('canonicalRootHistory()', [], at),
    pool.call('canonicalBacking()', [], at),
  ]);
  await runtime.assertCanonical(header);
  assert.equal(hubCode, system.plan.hub.runtimeCode, 'NATIVE_CHAIN_HUB_CODE_CHANGED');
  assert.equal(poolCode, system.plan.pools[poolIndex].runtimeCode, 'NATIVE_CHAIN_POOL_CODE_CHANGED');
  const domains = { hubDomain: system.hubDomain, registryCommitment: system.registryCommitment };
  const native = decodeNativeHubState(hubRaw, domains);
  assert.deepEqual(words(receiptNodesRaw, 128), native.receiptTree.nodes, 'NATIVE_CHAIN_RECEIPT_TREE');
  const checkpointCount = uint(words(checkpointCountRaw, 1)[0], 64n);
  const checkpointTree = decodeNativeCheckpointTree(checkpointNodesRaw, checkpointCount, checkpointRoot);
  const snapshot = decodeNativeCheckpoint(snapshotRaw, domains);
  const poolObservation = { header, blockNumber: header.number, blockHash: header.hash,
    scope: pool.scope, policy: pool.policy, asset: pool.asset, assetIdentity: pool.assetIdentity,
    rawState, rawHistory, rawBacking };
  const ledger = inspectGenericSnapshot(poolObservation);
  const expected = { pool: pool.address, scope: pool.scope, policy: pool.policy, assetIdentity: pool.assetIdentity,
    poolRoot: ledger.tree.root, poolSpentDigest: ledger.publicState.spentDigest,
    poolSpentCount: String(ledger.publicState.spent), poolStateSequence: ledger.publicState.sequence,
    ...Object.fromEntries(['receiptRoot', 'receiptCount', 'spentTagDigest', 'spentTagCount', 'spentTagSequence',
      'revokedDigest', 'revokedCount', 'revocationSequence', 'halt'].map(name => [name, native.state[name]])),
    hubStateSequence: native.state.stateSequence, registryEpoch: system.registry.registryEpoch,
    timestamp: BigInt(header.timestamp).toString() };
  for (const [field, value] of Object.entries(expected)) {
    assert.equal(snapshot[field], value, `NATIVE_CHAIN_SNAPSHOT_${field}`);
  }
  return { header, poolObservation, ledger, ...native, snapshot,
    snapshotDigest: snapshotDigest(snapshot), checkpointTree, checkpointCount,
    classification: 'RECONSTRUCTED_OWNED_LOCAL_RPC_STATE_NOT_NATIVE_CONSENSUS' };
}
