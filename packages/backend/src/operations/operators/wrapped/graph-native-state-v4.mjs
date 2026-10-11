/** Physical native-state validation only. Dispatch token recognition stays
 * in the original gate before the operator calls this pure mechanism. */
import assert from 'node:assert/strict';
import {exactRecord, bytes32} from '@lianum/components/encoding/commitments';
import {cloneInput as copy} from '@lianum/components/plain-input';
/** @typedef {{profileCommitment: string, state: Record<string, unknown>}} NativeRow */
/** @param {unknown} a @param {unknown} b */
const equal = (a,b) => assert.deepEqual(a,b,'NATIVE_VALUE_OPERATOR_CHANGED');
/** @param {NativeRow[]} before @param {NativeRow[]} after
 * @param {(value: unknown) => bigint} inputUint */
export function graphNativeProjectionV4(before, after, inputUint) {
  /** @param {NativeRow[]} rows */
  const identity = rows => rows.map(row => { const value = copy(row); delete value.state.readGeneration; return value; });
  equal(identity(before), identity(after));
  for (let i = 0; i < before.length; i++) assert.ok(inputUint(after[i].state.readGeneration) >= inputUint(before[i].state.readGeneration), 'WRAPPED_GRAPH_READ_GENERATION_ROLLBACK');
}
/** @param {NativeRow[]} rows @param {Record<string, unknown> | null} original
 * @param {(value: unknown) => bigint} inputUint */
export function assertGraphNativeStateV4(rows, original, inputUint) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 5, 'WRAPPED_GRAPH_NATIVE_REGISTRY_REQUIRED');
  const seen = new Set(); let matched = 0;
  if (original) {
    assert.equal(original.profile, 'WRAPPED_GRAPH_DISPATCH_OPERATION_V4', 'WRAPPED_GRAPH_OPERATION_PROFILE');
    assert.ok(original.phase === 'native-key' || original.phase === 'provider-key' || original.phase === 'send', 'WRAPPED_GRAPH_OPERATION_PHASE');
  }
  for (const row of rows) {
    exactRecord(row, ['profileCommitment', 'state']); bytes32(row.profileCommitment, true);
    assert.ok(!seen.has(row.profileCommitment), 'WRAPPED_GRAPH_NATIVE_DUPLICATE_PROFILE'); seen.add(row.profileCommitment);
    const state = row.state;
    assert.equal(state.profile, 'OWNED_WRAPPED_GRAPH_NATIVE_AUDIT_STATE_V4', 'WRAPPED_GRAPH_NATIVE_STATE_PROFILE');
    assert.ok(state.family === 'EVM' || state.family === 'TRON', 'WRAPPED_GRAPH_NATIVE_STATE_FAMILY');
    exactRecord(state, ['profile', 'family', 'lifetimeId', 'genesis', 'readGeneration', 'activeReads', 'readsIdle',
      'mutationGeneration', 'activeMutations', 'busy', 'closed', 'uncertain', 'pending', 'adverseHistory',
      ...(state.family === 'EVM' ? ['transactions', 'receipts', 'lifecycle', 'lastTimestamp'] : ['entry', 'journal'])]);
    assert.ok(typeof state.lifetimeId === 'string' && state.lifetimeId.length > 0, 'WRAPPED_GRAPH_NATIVE_LIFETIME');
    inputUint(state.readGeneration); inputUint(state.mutationGeneration);
    assert.equal(state.activeReads, 0, 'WRAPPED_GRAPH_NATIVE_READ_IN_FLIGHT'); assert.equal(state.readsIdle, true, 'WRAPPED_GRAPH_NATIVE_READ_IN_FLIGHT');
    for (const flag of ['closed', 'uncertain', 'adverseHistory']) assert.equal(state[flag], false, 'WRAPPED_GRAPH_NATIVE_STATE_' + flag);
    if (original && row.profileCommitment === original.profileCommitment) {
      matched++; assert.equal(state.family, original.family, 'WRAPPED_GRAPH_OPERATION_FAMILY');
      assert.equal(state.lifetimeId, original.lifetimeId, 'WRAPPED_GRAPH_OPERATION_LIFETIME');
      equal(state, original.physicalState); assert.equal(state.busy, true, 'WRAPPED_GRAPH_ORIGINAL_OPERATION_BUSY');
      assert.equal(state.pending, true, 'WRAPPED_GRAPH_ORIGINAL_OPERATION_PENDING'); assert.equal(state.activeMutations, 1, 'WRAPPED_GRAPH_ORIGINAL_OPERATION_MUTATION');
    } else {
      assert.equal(state.activeMutations, 0, 'WRAPPED_GRAPH_NATIVE_MUTATION_IN_FLIGHT');
      assert.equal(state.busy, false, 'WRAPPED_GRAPH_NATIVE_STATE_busy'); assert.equal(state.pending, false, 'WRAPPED_GRAPH_NATIVE_STATE_pending');
    }
  }
  assert.equal(matched, original ? 1 : 0, 'WRAPPED_GRAPH_EXACT_REGISTERED_OPERATION_REQUIRED'); return rows;
}
