/** Reviewed local runtime-only acceptance. The source-selected binary, owned
 * process and resource/socket guards remain mandatory; argv cannot substitute
 * paths, pins, keys, transports or clocks. No claim/graph release is enabled.
 * Review scope: packages/backend/docs/LOCAL-ACCEPTANCE.md (2026-10-08). */
import assert from 'node:assert/strict';
export const SOLANA_CANDIDATE_ACCEPTANCE_ENABLED = true;
export const SOLANA_CANDIDATE_ACCEPTANCE_OPT_IN = '--run-reviewed-local-candidate';
export function assertSolanaCandidateAcceptanceGate(argv) {
  assert.deepEqual(argv, [SOLANA_CANDIDATE_ACCEPTANCE_OPT_IN], 'SOLANA_CANDIDATE_EXACT_OPT_IN_REQUIRED');
  assert.equal(SOLANA_CANDIDATE_ACCEPTANCE_ENABLED, true, 'SOLANA_CANDIDATE_SOURCE_REVIEW_REQUIRED');
}
