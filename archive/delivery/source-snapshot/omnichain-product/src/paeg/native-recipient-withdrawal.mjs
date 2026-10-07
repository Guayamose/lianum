/** Reconcile the actual pool before asking its recipient to sign or renew W39.
 * A consumed nullifier is not reported as a successful external withdrawal:
 * the specific transaction/recipient outcome must still be reconciled.
 */
import assert from 'node:assert/strict';
import { assertOwnedNativeSystem } from './native-deployment.mjs';
import { assertOwnedNativeRecipientProcess } from './native-recipient-process.mjs';
import { readNativeSystemState } from './native-system-state.mjs';
import { walletInputPublicWords } from '../private-wallet-note-encoding.mjs';
import { noteWordsToHash } from '../private-note-tree.mjs';

const prefix = value => '0x' + value;
export async function authorizeCurrentNativeRecipientWithdrawal({ runtime, system, poolIndex, recipient }) {
  assertOwnedNativeSystem(runtime, system);
  assertOwnedNativeRecipientProcess(recipient);
  assert.ok(poolIndex === 0 || poolIndex === 1, 'NATIVE_RECIPIENT_POOL_INDEX');
  const status = await recipient.withdrawalStatus();
  const pool = system.pools[poolIndex];
  assert.equal(prefix(status.scope), pool.scope, 'NATIVE_RECIPIENT_WITHDRAW_SCOPE');
  assert.equal(prefix(status.policy), pool.policy, 'NATIVE_RECIPIENT_WITHDRAW_POLICY');
  const view = await readNativeSystemState(runtime, system, poolIndex);
  const observed = { blockNumber: view.header.number, blockHash: view.header.hash,
    poolStateSequence: view.ledger.publicState.sequence, root: view.ledger.tree.root,
    canonicalNullifier: status.canonicalNullifier };
  if (view.ledger.nullifiers.includes(prefix(status.canonicalNullifier))) {
    return { status: 'NOTE_CONSUMED_REQUIRES_TRANSACTION_RECONCILIATION', observed };
  }
  const index = view.ledger.commitments.indexOf(prefix(status.payoutCommitment));
  if (index < 0) return { status: 'PAYOUT_NOT_ISSUED_AT_OBSERVATION', observed };
  const epoch = String(BigInt(view.header.timestamp) / 600n);
  const witness = await recipient.authorizeWithdrawal({ scope: status.scope, policy: status.policy,
    payoutCommitment: status.payoutCommitment, recipient: status.recipient, amount: status.amount,
    epoch, path: view.ledger.tree.path(index) });
  const inputs = walletInputPublicWords('withdraw_balance', witness);
  assert.equal(noteWordsToHash(inputs.slice(25, 33)), prefix(status.canonicalNullifier),
    'NATIVE_RECIPIENT_RENEWAL_CHANGED_NULLIFIER');
  await runtime.assertCanonical(view.header);
  return { status: 'AUTHORIZED_UNSPENT_AT_OBSERVATION', witness, expectedPublicInputs: inputs,
    observed: { ...observed, epoch }, authorization: (await recipient.withdrawalStatus()).authorization };
}
