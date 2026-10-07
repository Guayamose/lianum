/** Closed fixed diagnostic. No caller can supply a release or a stop policy. */
import assert from 'node:assert/strict';
import { exactRecord } from '../paeg/commitments.mjs';
export const CLAIM_BEGIN_PAYOUT_AUDIT_RELEASE_V1 = null;
export const CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1 = 'SOLANA_LOADED_BEGIN_PAYOUT_BACKING_AUDIT_STOP_V1';
export const CLAIM_BEGIN_PAYOUT_AUDIT_STOP_CODE_V1 = 'CLAIM_BEGIN_PAYOUT_BACKING_AUDIT_STOP_V1';
export function assertBeginPayoutAuditReleaseV1() {
  assert.equal(arguments.length, 0, 'CLAIM_BEGIN_AUDIT_NO_RELEASE_OPTIONS');
  assert.equal(CLAIM_BEGIN_PAYOUT_AUDIT_RELEASE_V1, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1,
    'CLAIM_BEGIN_AUDIT_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_RELEASE');
}
/** Strict public projection only; these bytes never establish a private stop. */
export function assertBeginPayoutAuditReceiptV1(value) {
  exactRecord(value, ['profile', 'method', 'phase', 'limitMilliseconds', 'originalAuditGuardsPassed',
    'selectedSignerCount', 'originalAuthorizationSHA256', 'preparedSHA256', 'requestSHA256', 'originalHeadSHA256']);
  assert.equal(value.profile, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1);
  assert.equal(value.method, 'BEGIN_PAYOUT');
  assert.equal(value.phase, 'BACKING_RETURNED_BEFORE_DISPATCH');
  assert.equal(value.limitMilliseconds, 30000); assert.equal(value.originalAuditGuardsPassed, true);
  assert.equal(value.selectedSignerCount, 3);
  for (const name of ['originalAuthorizationSHA256', 'preparedSHA256', 'requestSHA256', 'originalHeadSHA256'])
    assert.match(value[name], /^[0-9a-f]{64}$/);
  return value;
}
