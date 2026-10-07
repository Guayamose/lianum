/** A separate source review must enable this fixed functional test. An argv
 * opt-in alone cannot start a node. No path, pin, key, transport or clock input. */
import assert from 'node:assert/strict';
export const SOLANA_CANDIDATE_ACCEPTANCE_ENABLED = false;
export const SOLANA_CANDIDATE_ACCEPTANCE_OPT_IN = '--run-reviewed-local-candidate';
export function assertSolanaCandidateAcceptanceGate(argv) {
  assert.deepEqual(argv, [SOLANA_CANDIDATE_ACCEPTANCE_OPT_IN], 'SOLANA_CANDIDATE_EXACT_OPT_IN_REQUIRED');
  assert.equal(SOLANA_CANDIDATE_ACCEPTANCE_ENABLED, true, 'SOLANA_CANDIDATE_SOURCE_REVIEW_REQUIRED');
}
