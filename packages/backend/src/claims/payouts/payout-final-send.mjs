/** Fixed one-use payout return gate, installed only by the owned controller
 * after its original broadcast collection. No signing, collection, retry,
 * preparation, replacement certificate or transport is exposed here. */
import assert from 'node:assert/strict';
import { cloneInput as copy, frozenInput as freeze } from '../../execution/account/preparation/readiness-inputs.mjs';
import { claimPayoutBroadcastFrame } from '../authorization/permits.mjs';
import { assertCanonicalClaimReservation } from '../authorization/reservation-facts-gate.mjs';
export const CLAIM_PAYOUT_FINAL_SEND_PROFILE = 'CLAIM_PAYOUT_ORIGINAL_AUTHORITY_LIFETIME_V2';
export function createPayoutFinalSendGate({ ctx, prepared, binding, scope }) {
  const originalPrepared = prepared, originalBinding = binding, originalStarted = scope.started;
  const capturedPrepared = freeze(copy(prepared)), capturedBinding = freeze(copy(binding));
  const originalView = scope.view, capturedView = freeze(copy(scope.view));
  const originalAuthorization = scope.authorization, capturedAuthorization = freeze(copy(scope.authorization));
  const frame = claimPayoutBroadcastFrame(capturedAuthorization.message);
  assert.equal(capturedBinding.ingress, false, 'CLAIM_PAYOUT_FINAL_PAYOUT_ONLY');
  assert.deepEqual(capturedAuthorization.head, capturedView.head, 'CLAIM_PAYOUT_FINAL_AUTHORIZATION_HEAD');
  for (const name of ['admissionN', 'nativeGid', 'wireBindingCommitment'])
    assert.equal(capturedAuthorization.message[name], capturedBinding[name], 'CLAIM_PAYOUT_FINAL_SIGNED_BINDING');
  let latched = false, entered = false, ready = false, consumed = false;
  const check = (value, phase) => {
    assert.equal(value, originalPrepared, 'CLAIM_PAYOUT_FINAL_ORIGINAL_PREPARATION_IDENTITY');
    assert.deepEqual(value, capturedPrepared, 'CLAIM_PAYOUT_FINAL_PREPARATION_CHANGED');
    assert.deepEqual(originalBinding, capturedBinding, 'CLAIM_PAYOUT_FINAL_BINDING_CHANGED');
    assert.deepEqual(originalView, capturedView, 'CLAIM_PAYOUT_FINAL_ORIGINAL_HEAD_CHANGED');
    assert.deepEqual(originalAuthorization, capturedAuthorization, 'CLAIM_PAYOUT_FINAL_AUTHORIZATION_CHANGED');
    assert.deepEqual(claimPayoutBroadcastFrame(originalAuthorization.message), frame, 'CLAIM_PAYOUT_FINAL_FRAME_CHANGED');
    ctx.assertOriginalRetained(capturedBinding, capturedPrepared, capturedAuthorization, phase);
    ctx.assertLive(); ctx.assertKeeperLive(); ctx.assertEvmUnchanged();
    const elapsed = ctx.now() - originalStarted;
    assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'CLAIM_PAYOUT_FINAL_AUDIT_TOO_OLD');
    const { validFrom, validUntil } = originalAuthorization.message, now = BigInt(originalView.head.timestamp);
    assert.ok(BigInt(validFrom) <= now && now + 1n < BigInt(validUntil), 'CLAIM_PAYOUT_FINAL_CERTIFICATE_EXPIRED');
  };
  // Authority may be minted only after this complete signed-zero check.
  // Opening repeats it without creating or extending a clock/certificate.
  check(prepared, 'SIGNED_NOT_BROADCAST');
  return Object.freeze({ profile: CLAIM_PAYOUT_FINAL_SEND_PROFILE, originalAuditStarted: originalStarted,
    assertBeforeLatch(value) {
      assert.equal(latched, false, 'CLAIM_PAYOUT_FINAL_LATCH_ALREADY_ENTERED');
      latched = true; check(value, 'SIGNED_NOT_BROADCAST');
      if (scope.originalLeaseV4) { scope.originalLeaseV4.assertBeforeKey(); ctx.captureOtherNativeState(); }
    },
    async beforeSend(value) {
      assert.ok(latched && !entered, 'CLAIM_PAYOUT_FINAL_GUARD_ALREADY_ENTERED'); entered = true;
      check(value, 'BROADCAST_UNKNOWN');
      await ctx.assertCurrent(originalView);
      const reservation = assertCanonicalClaimReservation(capturedBinding, await ctx.readReservation(capturedBinding, originalView));
      assert.equal(reservation.consumed, false, 'CLAIM_PAYOUT_FINAL_RESERVATION_CONSUMED');
      await ctx.assertUnrevoked(capturedBinding, originalView);
      // Last asynchronous boundary revalidates the original owned EVM view.
      await ctx.assertCurrent(originalView);
      check(value, 'BROADCAST_UNKNOWN'); ready = true;
    },
    assertBeforeSend(value) {
      assert.ok(entered && ready && !consumed, 'CLAIM_PAYOUT_FINAL_ONE_USE_PERMISSION_REQUIRED');
      consumed = true; check(value, 'BROADCAST_UNKNOWN');
      if (scope.originalLeaseV4) { ctx.assertOtherNativeState(); scope.originalLeaseV4.assertContinuationSourceCurrent(); }
    },
  });
}
