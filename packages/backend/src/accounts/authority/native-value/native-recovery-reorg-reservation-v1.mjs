/** Reservation-side F reorg transitions. The account owns original-row admission
 * and authenticated CAS; this mechanism cannot register or authenticate accounts. */
import assert from 'node:assert/strict';
/** @typedef {import('./native-value-execution-contract.mjs').ReservationRow} ReservationRow */
/** @typedef {import('./native-value-execution-contract.mjs').NativeExecutor} NativeExecutor */
/** @typedef {import('./native-value-execution-contract.mjs').ReorgPhase} ReorgPhase */
/** @typedef {import('./native-value-execution-contract.mjs').ExecutionResult} ExecutionResult */
/** @typedef {import('./native-value-execution-contract.mjs').RetainedTerminal} RetainedTerminal */
/** @param {{originalRow(executor:NativeExecutor,reference:string):ReservationRow,
 * reservations:Pick<import('./native-value-execution-contract.mjs').Reservations,'reservationRow'|'reservationUpdate'>,
 * chain:Pick<import('./native-value-execution-contract.mjs').ExecutionChain,'runtime'|'system'|'pool'|'nativeExecution'>,
 * format:import('./native-value-execution-contract.mjs').ExecutionFormat}} ports */
export function createNativeRecoveryReorgReservationV1({
  originalRow,
  reservations,
  chain,
  format,
}) {
  const {
    copy,
    sha,
    calldataHash: flatAccountCalldataHash,
    decodeTerminal: decodeNativeValueTerminalCalldata,
  } = format;
  /** @param {NativeExecutor} executor @param {string} ref */
  function reorgState(executor, ref) {
    const row = originalRow(executor, ref);
    // EXECUTE_NATIVE is not an admission prerequisite for original F: the
    // original retained ARM may fire after the cutoff without any EXECUTE.
    assert.ok(
      row.nativeRecoveryLatched && row.submission?.dispatchLatched === true,
      'F_REORG_ORIGINAL_F_LATCHES_REQUIRED',
    );
    assert.ok(
      row.observation && row.submission.observation,
      'F_REORG_ORIGINAL_S_OBSERVATION_REQUIRED',
    );
    assert.equal(row.observation.profile, 'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1');
    assert.equal(
      row.observation.transactionHash,
      row.submission.observation.transaction.hash,
      'F_REORG_ORIGINAL_S_CHANGED',
    );
    if (row.liveRecoveryArm) {
      assert.equal(
        row.liveRecoveryArm.nativeBindingSHA256,
        sha(row.nativeBinding),
        'F_REORG_ORIGINAL_ARM_BINDING',
      );
      assert.equal(
        row.liveRecoveryArm.reservationTransactionHash,
        row.observation.transactionHash,
        'F_REORG_ORIGINAL_ARM_S',
      );
      assert.equal(
        row.liveRecoveryArm.settleBefore,
        row.nativeBinding.settleBefore,
        'F_REORG_ORIGINAL_ARM_CUTOFF',
      );
      assert.equal(row.liveRecoveryArm.lossClause, 'FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
    }
    if (!row.nativeFReorg) assert.equal(row.nativeOutcome, 'RECOVERED');
    const terminal = row.nativeFReorg?.originalTerminal ?? row.nativeTerminal;
    assert.ok(terminal, 'F_REORG_ORIGINAL_TERMINAL_REQUIRED');
    return {
      terminal: copy(terminal),
      binding: copy(row.nativeBinding),
      phase: row.nativeFReorg?.phase ?? null,
    };
  }
  /** @param {NativeExecutor} executor @param {string} ref @param {string} id @param {ReorgPhase} phase */
  async function retainReorg(executor, ref, id, phase) {
    const original = reorgState(executor, ref);
    format.reference(id);
    assert.ok(['REORG_INVALIDATED', 'OBSERVATION_PENDING', 'RECONFIRMED'].includes(phase));
    const row = reservations.reservationRow(ref),
      old = row.nativeFReorg;
    if (old) {
      assert.equal(old.id, id);
      assert.ok(
        old.phase === phase ||
          (old.phase === 'REORG_INVALIDATED' && phase === 'OBSERVATION_PENDING') ||
          (old.phase === 'OBSERVATION_PENDING' && phase === 'RECONFIRMED'),
        'F_REORG_PHASE_REGRESSION',
      );
    } else assert.equal(phase, 'REORG_INVALIDATED');
    if (old?.phase === 'RECONFIRMED') return;
    await reservations.reservationUpdate(ref, {
      nativeTerminal: null,
      nativeOutcome: null,
      nativeStage: 'UNKNOWN',
      nativeErrorCode: null,
      nativeFReorg: {
        schema: 'ORIGINAL_DEVICE_NATIVE_F_REORG_V1',
        id,
        phase,
        originalTerminal: original.terminal,
      },
    });
  }
  /** @param {NativeExecutor} executor @param {string} ref @param {string} id */
  function assertReorgPending(executor, ref, id) {
    reorgState(executor, ref);
    const row = reservations.reservationRow(ref);
    assert.ok(row.nativeFReorg, 'F_REORG_ORIGINAL_PENDING_REQUIRED');
    assert.equal(row.nativeFReorg.id, id);
    assert.equal(row.nativeFReorg.phase, 'OBSERVATION_PENDING');
    assert.equal(row.nativeOutcome, null);
    assert.equal(row.nativeTerminal, null);
  }
  /** @param {ReservationRow} row @param {ExecutionResult} result */
  async function retainDeviceTerminal(row, result) {
    assert.ok(
      result.outcome === 'FULFILLED' || result.outcome === 'RECOVERED',
      'DEVICE_EXECUTION_ORIGINAL_TERMINAL_REQUIRED',
    );
    const receipt = result.receipt;
    assert.ok(receipt, 'DEVICE_EXECUTION_ORIGINAL_RECEIPT_REQUIRED');
    await chain.runtime.checkReceipt(receipt);
    const transaction = await chain.runtime.transaction(receipt.transactionHash),
      originals = chain.runtime.transactions.filter(
        (value) => value.transactionHash === receipt.transactionHash,
      );
    assert.ok(
      transaction && originals.length === 1,
      'DEVICE_EXECUTION_ORIGINAL_TRANSACTION_REQUIRED',
    );
    const original = originals[0];
    assert.equal(receipt.status, '0x1');
    assert.equal(receipt.to, chain.pool.address);
    assert.equal(transaction.from, chain.system.sender);
    assert.equal(transaction.to, chain.pool.address);
    assert.equal(transaction.input, original.request.data);
    assert.equal(transaction.value, original.request.value ?? '0x0');
    assert.equal(BigInt(transaction.nonce), BigInt(original.senderNonce));
    assert.equal(transaction.blockHash, receipt.blockHash);
    assert.equal(transaction.blockNumber, receipt.blockNumber);
    const calldataSHA256 = flatAccountCalldataHash(transaction.input);
    assert.equal(result.calldataSHA256, calldataSHA256);
    const decoded = decodeNativeValueTerminalCalldata(transaction.input);
    assert.equal(decoded.kind, result.outcome === 'RECOVERED' ? 'recovery' : 'settlement');
    assert.equal(decoded.statement.reserveNullifier, row.nativeBinding.reserveNullifier);
    if (result.outcome === 'RECOVERED')
      assert.equal(decoded.statement.recoveryCommitment, row.nativeBinding.recoveryCommitment);
    // The original executor's terminal observer already validates the entire
    // historical pool/hub/backing delta. Rejoin its same signed original wire.
    await chain.runtime.assertCanonical(receipt);
    /** @type {RetainedTerminal} */
    const terminal = {
      transactionHash: format.bare(receipt.transactionHash),
      blockHash: format.bare(receipt.blockHash),
      blockNumber: BigInt(receipt.blockNumber).toString(),
      calldataSHA256,
      outcome: result.outcome,
    };
    const retained = reservations.reservationRow(row.jobId);
    if (retained.nativeTerminal !== null)
      assert.deepEqual(terminal, retained.nativeTerminal, 'DEVICE_EXECUTION_TERMINAL_CHANGED');
    else {
      /** @type {Partial<ReservationRow>} */
      let fields = {};
      if (retained.nativeFReorg) {
        reorgState(chain.nativeExecution, row.jobId);
        const previous = retained.nativeFReorg.originalTerminal;
        assert.equal(result.outcome, 'RECOVERED');
        for (const key of /** @type {const} */ (['transactionHash', 'calldataSHA256', 'outcome']))
          assert.equal(terminal[key], previous[key], 'F_REORG_ORIGINAL_TERMINAL_CHANGED');
        assert.ok(
          ['REORG_INVALIDATED', 'OBSERVATION_PENDING'].includes(retained.nativeFReorg.phase),
        );
        fields = {
          nativeFReorg: {
            ...retained.nativeFReorg,
            phase: 'RECONFIRMED',
            receipt: terminal,
          },
        };
      }
      await reservations.reservationUpdate(row.jobId, {
        ...fields,
        nativeTerminal: terminal,
        nativeOutcome: result.outcome,
        nativeStage: result.outcome,
        nativeErrorCode: null,
      });
    }
  }
  return Object.freeze({ reorgState, retainReorg, assertReorgPending, retainDeviceTerminal });
}
