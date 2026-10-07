/** PC23 public capacity arithmetic only. This cannot establish note ownership,
 * cryptographic conservation, proof validity or authorize a pool transaction. */
import assert from 'node:assert/strict';
import { assertPrivateNoteHeadroom, applyPrivateNoteCapacityTransition } from './private-note-tree.mjs';

export const PRIVATE_WALLET_CAPACITY_VERSION = 'PC23_SHARED_SPENDABLE_NOTES_V1';
export const assertPrivateWalletHeadroom = assertPrivateNoteHeadroom;

/** liveOutputNotes counts every live type-2/3/4 spendable note. Both inequalities
 * reserve all existing terminal leaves and all future consumptions unchanged. */
export function applyPrivateWalletCapacityTransition(state, mode) {
  assertPrivateWalletHeadroom(state);
  if (['reserve', 'fulfill', 'refund', 'withdraw'].includes(mode)) return applyPrivateNoteCapacityTransition(state, mode);
  const next = Object.fromEntries(['leafCount', 'spentCount', 'liveReservations', 'liveOutputNotes'].map(key => [key, state[key]]));
  if (mode === 'deposit_balance') { next.leafCount++; next.liveOutputNotes++; }
  else if (mode === 'reserve_from_note') {
    assert.ok(next.liveOutputNotes > 0, 'PC23_NO_LIVE_OUTPUT');
    next.leafCount += 2; next.spentCount++; next.liveReservations++;
  } else if (mode === 'withdraw_balance') {
    assert.ok(next.liveOutputNotes > 0, 'PC23_NO_LIVE_OUTPUT');
    next.spentCount++; next.liveOutputNotes--;
  } else throw new Error('PC23_POOL_MODE');
  assertPrivateWalletHeadroom(next);
  return next;
}
