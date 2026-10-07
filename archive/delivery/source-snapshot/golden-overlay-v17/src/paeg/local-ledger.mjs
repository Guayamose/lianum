/** Independent host reconstruction of the new pool's public state. This never
 * authorizes a transition: genuine deployed verifiers remain the authority.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PrivateNoteTree, ZERO_NOTE_HASH, privateSpentDigest } from '../private-note-tree.mjs';

function words(raw, expected) {
  assert.match(raw, /^0x[0-9a-f]*$/, 'GENERIC_STATE_ENCODING');
  assert.equal(raw.length, 2 + expected * 64, 'GENERIC_STATE_ABI');
  return Array.from({ length: expected }, (_, i) => '0x' + raw.slice(2 + i * 64, 66 + i * 64));
}
function count(value, maximum) {
  const n = BigInt(value);
  assert.ok(n >= 0n && n <= BigInt(maximum), 'GENERIC_STATE_COUNT');
  return Number(n);
}
function historyDigest(scope, roots) {
  const size = Buffer.alloc(4); size.writeUInt32BE(roots.length);
  const padded = [...roots, ...Array(65 - roots.length).fill(ZERO_NOTE_HASH)];
  return '0x' + createHash('sha256').update(Buffer.concat([Buffer.from([0x18]),
    Buffer.from(scope.slice(2), 'hex'), size, ...padded.map(root => Buffer.from(root.slice(2), 'hex'))])).digest('hex');
}

export function inspectGenericSnapshot(snapshot) {
  const state = words(snapshot.rawState, 135), history = words(snapshot.rawHistory, 68);
  const backing = words(snapshot.rawBacking, 6);
  const leaves = count(state[3], 64), spent = count(state[4], 64), rootCount = count(history[2], 65);
  const sequence = BigInt(state[2]).toString();
  const commitments = state.slice(7, 71), nullifiers = state.slice(71);
  const roots = history.slice(3), liveRoots = roots.slice(0, rootCount);
  assert.ok(commitments.slice(leaves).every(x => x === ZERO_NOTE_HASH), 'GENERIC_LEAF_PADDING');
  assert.ok(nullifiers.slice(spent).every(x => x === ZERO_NOTE_HASH), 'GENERIC_SPENT_PADDING');
  assert.ok(roots.slice(rootCount).every(x => x === ZERO_NOTE_HASH), 'GENERIC_ROOT_PADDING');
  assert.equal(new Set(liveRoots).size, liveRoots.length, 'GENERIC_ROOT_DUPLICATE');
  const tree = new PrivateNoteTree(commitments.slice(0, leaves));
  assert.equal(tree.root, state[0], 'GENERIC_RECONSTRUCTED_ROOT');
  assert.equal(privateSpentDigest(snapshot.scope, nullifiers, spent), state[1], 'GENERIC_RECONSTRUCTED_SPENT');
  assert.equal(historyDigest(snapshot.scope, liveRoots), history[1], 'GENERIC_RECONSTRUCTED_HISTORY');
  assert.ok(liveRoots.includes(tree.root), 'GENERIC_CURRENT_ROOT_NOT_ACCEPTED');
  assert.equal(BigInt(history[0]).toString(), sequence, 'GENERIC_HISTORY_SEQUENCE');
  assert.equal(BigInt(backing[0]).toString(), sequence, 'GENERIC_BACKING_SEQUENCE');
  const admitted = BigInt(backing[1]), actual = BigInt(backing[2]);
  assert.equal(BigInt(backing[3]), actual > admitted ? actual - admitted : 0n, 'GENERIC_BACKING_SURPLUS');
  assert.equal(BigInt(backing[4]), admitted > actual ? admitted - actual : 0n, 'GENERIC_BACKING_DEFICIT');
  assert.equal(BigInt(backing[4]), 0n, 'GENERIC_BACKING_DEFICIT');
  return { tree, commitments: commitments.slice(0, leaves), nullifiers: nullifiers.slice(0, spent), roots: liveRoots,
    publicState: { root: tree.root, spentDigest: state[1], sequence, leaves, spent,
      liveReservations: count(state[5], 64), outputCapacity: count(state[6], 64),
      backedAmount: admitted.toString(), actualAssetBalance: actual.toString(),
      surplus: BigInt(backing[3]).toString(), unrelatedNative: BigInt(backing[5]).toString(), rootCount,
      rootHistoryDigest: history[1] } };
}

export function reserveProjection(inspected, reserveCommitment, changeCommitment) {
  const tree = new PrivateNoteTree(inspected.commitments);
  const reserveIndex = tree.append(reserveCommitment), changeIndex = tree.append(changeCommitment);
  return { expectedSequence: inspected.publicState.sequence, expectedPostRoot: tree.root, reserveIndex, changeIndex };
}
