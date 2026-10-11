/** Two-journal F invalidation/reconciliation mechanism. The execution owner
 * authenticates account access and retains the sole private wire-token issuer. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonical} from '@lianum/engine/crypto/privacy';
const bare=value=>value.slice(2),digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const detached=value=>Object.freeze(structuredClone(value));
export async function reconcileRecoveryReorgV1(account,ref,{wrapped,binding,keeper,operation,runtime,terminalObserver,update,healthy,readRevision,assertActive,observedSubmission,emit}){
    assert.ok(!wrapped, 'F_REORG_NATIVE_ONLY');
    const accountState = binding.originalDeviceNativeFReorgStateV1(account, keeper, ref);
    const entry = operation(ref);
    assert.ok(entry.recoverySubmission, 'F_REORG_ORIGINAL_CONFIRMED_F_REQUIRED');
    // Legacy authenticated records may acquire a checkpoint only by a complete
    // successful original historical observation while that F still exists.
    if (!entry.originalFCheckpoint) return observedSubmission(ref, 'recovery');
    assert.deepEqual(entry.originalFCheckpoint.query.binding, entry.binding);
    assert.deepEqual(entry.originalFCheckpoint.query.statement, entry.recoveryStatement);
    assert.deepEqual(entry.originalFCheckpoint.query.submission, entry.recoverySubmission);
    const old = entry.originalFCheckpoint.receipt, hash = '0x' + entry.recoverySubmission.transactionHash;
    assert.equal(old.transactionHash, hash);
    assert.deepEqual(accountState.binding, entry.binding, 'F_REORG_ORIGINAL_ACCOUNT_BINDING');
    assert.deepEqual(accountState.terminal, { transactionHash: entry.recoverySubmission.transactionHash, blockHash: bare(old.blockHash),
      blockNumber: BigInt(old.blockNumber).toString(), calldataSHA256: entry.recoverySubmission.calldataSHA256, outcome: 'RECOVERED' },
      'F_REORG_ORIGINAL_ACCOUNT_TERMINAL');
    if (!entry.nativeFReorg) {
      assert.equal(entry.outcome, 'RECOVERED');
      const receipt = await runtime.receipt(hash);
      if (receipt !== null) { await runtime.assertCanonical(receipt); return observedSubmission(ref, 'recovery'); }
      // Missing RPC data alone never establishes a chain reorganization.
      // Confirm the exact original parent and full before-F state first.
      await terminalObserver.checkRecoveryReorg(entry.originalFCheckpoint);
      const id = digest({ reference: ref, checkpoint: entry.originalFCheckpoint, binding: entry.binding });
      await update(ref, { outcome: null, stage: 'UNKNOWN', nativeFReorg: { schema: 'ORIGINAL_NATIVE_F_REORG_V1', id,
        phase: 'REORG_INVALIDATED', oldReceipt: old, oldOutcome: 'RECOVERED' } });
      await binding.retainOriginalDeviceNativeFReorgV1(account, keeper, ref, id, 'REORG_INVALIDATED');
      // A separate fresh RECONCILE must first observe this durable UNKNOWN.
      // No reemission can hide the invalidation from the original mobile vault.
      return detached({ outcome: null, originalFReorgInvalidated: true });
    }
    const pending = operation(ref).nativeFReorg;
    if (pending.phase !== 'RECONFIRMED')
      await binding.retainOriginalDeviceNativeFReorgV1(account, keeper, ref, pending.id, pending.phase);
    if (pending.phase === 'REORG_INVALIDATED') {
      const id = pending.id;
      const checked = await terminalObserver.checkRecoveryReorg(entry.originalFCheckpoint);
      await update(ref, { nativeFReorg: { ...operation(ref).nativeFReorg, phase: 'OBSERVATION_PENDING' } });
      await binding.retainOriginalDeviceNativeFReorgV1(account, keeper, ref, id, 'OBSERVATION_PENDING');
      await healthy(); const revision = readRevision();
      const assertCurrent = () => { assertActive();
        assert.equal(readRevision(), revision, 'F_REORG_EXECUTOR_CHANGED');
        assert.equal(operation(ref).nativeFReorg.phase, 'OBSERVATION_PENDING');
        assert.equal(operation(ref).nativeFReorg.id, id);
        binding.assertOriginalDeviceNativeFReorgPendingV1(account, keeper, ref, id); };
      const revalidate = async () => { await healthy();
        await binding.checkOriginalDeviceNativeFReorgPendingV1(account, keeper, ref, id); assertCurrent(); };
      await emit({ runtime, account, ref, id, used: false, assertCurrent, revalidate,
        parent: checked.parent, transactionHash: hash, calldata: entry.recoverySubmission.calldata,
        calldataSHA256: entry.recoverySubmission.calldataSHA256, oldReceipt: old, includedHeader: entry.originalFCheckpoint.includedHeader, settleBefore: entry.binding.settleBefore });
    }
    const observed = await observedSubmission(ref, 'recovery'), retained = operation(ref).nativeFReorg;
    await update(ref, { outcome: 'RECOVERED', stage: 'RECOVERED', errorCode: null, nativeFReorg: { ...retained,
      phase: 'RECONFIRMED', receipt: observed.receipt } });
    return observed;
}
