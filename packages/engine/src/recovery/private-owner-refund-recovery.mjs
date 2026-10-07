/**
 * Trusted surviving-keeper withdrawal of the ORIGINAL type3 owner refund note.
 *
 * This is a private in-process capability. The binding and encrypted opening
 * come from original graph bootstrap and its separately constrained custody;
 * neither may come from a user API or be replaced after an uncertain send.
 * This module does not issue F, recreate an owner graph, produce an invoice,
 * export a key, or reconstruct lost active-keeper authority. A successful F
 * transition must first issue the exact recovery commitment. The unchanged
 * withdraw circuit/signature then consumes that note for the complete budget.
 */
import assert from 'node:assert/strict';
import { canonical } from '../crypto/privacy.mjs';
import { importOwnerRefundOpening, ownerRefundWithdrawalInput, validateOwnerRefundBinding } from './private-owner-refund-custody.mjs';
import { createExactNoteWithdrawalRecovery } from '../notes/private-exact-note-withdrawal.mjs';
import { ZERO_NOTE_HASH } from '../notes/private-note-tree.mjs';

export { ownerRefundWithdrawalInput } from './private-owner-refund-custody.mjs';
const copy = value => JSON.parse(canonical(value));
const TRUE = `0x${'0'.repeat(63)}1`, FALSE = ZERO_NOTE_HASH;

/**
 * Same lifetime and callback contract as createRecipientPayoutRecovery.
 * The SAME instance survives coordinator restarts; UNKNOWN cannot be retried
 * by constructing another instance. Only trusted host code has this factory.
 * onConfirmed must synchronously and idempotently account for chain truth.
 */
export function createOwnerRefundWithdrawalRecovery({ pool, runtime, binding: suppliedBinding, opening: suppliedOpening,
  fromBlock = '0x0', authorize, prove, submit, persist, onConfirmed = () => {} }) {
  const binding = validateOwnerRefundBinding(suppliedBinding), opening = copy(suppliedOpening);
  const { note } = importOwnerRefundOpening(binding, opening);
  const reservedCommitment = `0x${binding.reservedCommitment}`;
  const reserveNullifier = `0x${binding.reserveNullifier}`;
  assert.equal(note.type, 3, 'OWNER_REFUND_RECOVERY_NOTE_TYPE');
  assert.equal(note.value.toString(), binding.budget, 'OWNER_REFUND_RECOVERY_FULL_BUDGET');
  assert.equal(note.commitment.toString('hex'), binding.paymentCommitment, 'OWNER_REFUND_RECOVERY_COMMITMENT');
  assert.notEqual(binding.reservedCommitment, binding.paymentCommitment, 'OWNER_REFUND_RECOVERY_DISTINCT_NOTES');
  return createExactNoteWithdrawalRecovery({ pool, runtime, scope: binding.scope, policy: binding.policy,
    note, recipient: binding.withdrawalRecipient, role: 'owner', fromBlock, authorize, prove, submit, persist, onConfirmed,
    withdrawalInput: (authorization, path) => ownerRefundWithdrawalInput(binding, opening, authorization, path),
    async validateDiscovery({ snapshot, issued }) {
      // Authenticate the ORIGINAL reservation's state as well as this exact
      // recovery note. Spent reserve status alone never implies F or payment.
      const reserveIssued = snapshot.leaves.slice(0, snapshot.leafCount).includes(reservedCommitment);
      const reserveSpent = snapshot.nullifiers.slice(0, snapshot.spentCount).includes(reserveNullifier);
      assert.equal(await pool.call('insertedCommitments(bytes32)', [reservedCommitment], snapshot.blockNumber),
        reserveIssued ? TRUE : FALSE, 'OWNER_REFUND_RECOVERY_RESERVE_ISSUANCE');
      assert.equal(await pool.call('spentNullifiers(bytes32)', [reserveNullifier], snapshot.blockNumber),
        reserveSpent ? TRUE : FALSE, 'OWNER_REFUND_RECOVERY_RESERVE_SPENT');
      assert.ok(reserveIssued || !reserveSpent, 'OWNER_REFUND_RECOVERY_UNISSUED_RESERVE_SPENT');
      if (issued) {
        assert.ok(reserveIssued && reserveSpent, 'OWNER_REFUND_RECOVERY_FUNDING_REQUIRED');
        assert.ok(BigInt(snapshot.epoch) >= BigInt(binding.cutoff), 'OWNER_REFUND_RECOVERY_CUTOFF');
      }
    },
    validateWithdrawal(statement) {
      assert.ok(BigInt(statement.epoch) >= BigInt(binding.cutoff), 'OWNER_REFUND_RECOVERY_RECEIPT_CUTOFF');
    } });
}
