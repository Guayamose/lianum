/** Execution operations. Dependencies are explicit and scoped by role.
 * Journal access is restricted to this domain; account ownership stays in the root. */
import assert from "node:assert/strict";
import { flatAccountGraphBinding, flatAccountCalldataHash } from "../flat-account-validation.mjs";
import { sha, copy } from "@lianum/engine/accounts/journal";
import { decodeNativeValueTerminalCalldata } from "../../../execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs";
import { refreshOriginalNativeSourceObservedClockV1, assertOriginalNativeSourceObservedClockV1 } from "../../../operations/recovery/native-original-source-observed-clock-v1.mjs";
import { refreshOriginalNativeDeviceLocalObservedClockV1, assertOriginalNativeDeviceLiveArmedObservedClockV1 } from "../../../operations/recovery/native-device-local-observed-clock-v1.mjs";
import { validateDeviceRecoveryArmConsentFreshV1, deviceRecoveryArmConsentMessageV1 } from "@lianum/mobile-protocol/device-recovery-arm-consent-v1";
import { nativeValueOriginalRecoverySourceV1 } from "../../../operations/deployments/native-value/native-value-system-v2.mjs";
import { privateFailureDiagnostic } from "../../../execution/account/reconciliation/failure-diagnostics.mjs";
import { reconcileOriginalDeviceNativeRecoveryV1 } from "../../../execution/native-value/execution/native-value-execution-v2.mjs";
import { deviceExecutionConsentMessageV1 } from "@lianum/mobile-protocol/device-execution-consent-v1";
export function createNativeValueExecutionOperations({
  approvals,
  chain,
  reservations,
  profile,
  lifecycle,
  format,
  continuity,
  operations,
  account
}) {
  let reorgAdmission = null;
  function deviceExecutionOriginal(bridge, row) {
    const installation = approvals.deviceExecutionInstallations.get(bridge);
    assert.ok(installation, 'DEVICE_EXECUTION_ORIGINAL_INSTALLATION_REQUIRED');
    chain.assertOwnedNativeValueExecution(chain.nativeExecution, {
      runtime: chain.runtime,
      system: chain.system,
      poolIndex: chain.poolIndex
    });
    reservations.reservationSubject(row.consent.depositJobId, row.consent.custody.rootId, installation.descriptor);
    assert.ok(row.nativeBinding && row.submission?.dispatchLatched === true, 'DEVICE_EXECUTION_BINDING_BEFORE_S_REQUIRED');
    assert.deepEqual(row.nativeBinding, flatAccountGraphBinding({
      authorization: row.authorization,
      rolePackets: row.rolePackets
    }, profile.identity), 'DEVICE_EXECUTION_ORIGINAL_BINDING_CHANGED');
    return installation;
  }
  async function deviceExecutionPublic(bridge, row) {
    deviceExecutionOriginal(bridge, row);
    const reservation = await reservations.reservationObservation(row);
    assert.equal(reservation.stage, 'RESERVED', 'DEVICE_EXECUTION_ORIGINAL_S_REQUIRED');
    const retained = reservations.reservationRow(row.jobId),
      snapshot = chain.nativeExecution.snapshot(row.jobId);
    return {
      jobId: row.jobId,
      reservation,
      nativeBindingSHA256: sha(retained.nativeBinding),
      executionSnapshot: copy(snapshot),
      executionSnapshotSHA256: sha(snapshot),
      stage: retained.nativeStage,
      outcome: retained.nativeOutcome,
      terminal: copy(retained.nativeTerminal),
      errorCode: retained.nativeErrorCode,
      lossClause: 'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'
    };
  }
  function reorgState(executor, ref) {
    lifecycle.continueWork();
    assert.ok(lifecycle.isBusy() && reorgAdmission?.ref === ref && reorgAdmission.executor === executor, 'F_REORG_ORIGINAL_RECONCILE_REQUIRED');
    assert.equal(executor, chain.nativeExecution);
    const row = reservations.reservationRow(ref);
    deviceExecutionOriginal(reorgAdmission.bridge, row);
    // EXECUTE_NATIVE is not an admission prerequisite for original F: the
    // original retained ARM may fire after the cutoff without any EXECUTE.
    assert.ok(row.nativeRecoveryLatched && row.submission?.dispatchLatched === true, 'F_REORG_ORIGINAL_F_LATCHES_REQUIRED');
    assert.ok(row.observation && row.submission.observation, 'F_REORG_ORIGINAL_S_OBSERVATION_REQUIRED');
    assert.equal(row.observation.profile, 'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1');
    assert.equal(row.observation.transactionHash, row.submission.observation.transaction.hash, 'F_REORG_ORIGINAL_S_CHANGED');
    if (row.liveRecoveryArm) {
      assert.equal(row.liveRecoveryArm.nativeBindingSHA256, sha(row.nativeBinding), 'F_REORG_ORIGINAL_ARM_BINDING');
      assert.equal(row.liveRecoveryArm.reservationTransactionHash, row.observation.transactionHash, 'F_REORG_ORIGINAL_ARM_S');
      assert.equal(row.liveRecoveryArm.settleBefore, row.nativeBinding.settleBefore, 'F_REORG_ORIGINAL_ARM_CUTOFF');
      assert.equal(row.liveRecoveryArm.lossClause, 'FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
    }
    if (!row.nativeFReorg) assert.equal(row.nativeOutcome, 'RECOVERED');
    return {
      terminal: copy(row.nativeFReorg?.originalTerminal ?? row.nativeTerminal),
      binding: copy(row.nativeBinding),
      phase: row.nativeFReorg?.phase ?? null
    };
  }
  async function retainReorg(executor, ref, id, phase) {
    const original = reorgState(executor, ref);
    format.reference(id);
    assert.ok(['REORG_INVALIDATED', 'OBSERVATION_PENDING', 'RECONFIRMED'].includes(phase));
    const row = reservations.reservationRow(ref),
      old = row.nativeFReorg;
    if (old) {
      assert.equal(old.id, id);
      assert.ok(old.phase === phase || old.phase === 'REORG_INVALIDATED' && phase === 'OBSERVATION_PENDING' || old.phase === 'OBSERVATION_PENDING' && phase === 'RECONFIRMED', 'F_REORG_PHASE_REGRESSION');
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
        originalTerminal: original.terminal
      }
    });
  }
  function assertReorgPending(executor, ref, id) {
    reorgState(executor, ref);
    const row = reservations.reservationRow(ref);
    assert.equal(row.nativeFReorg.id, id);
    assert.equal(row.nativeFReorg.phase, 'OBSERVATION_PENDING');
    assert.equal(row.nativeOutcome, null);
    assert.equal(row.nativeTerminal, null);
  }
  async function retainDeviceTerminal(row, result) {
    assert.ok(['FULFILLED', 'RECOVERED'].includes(result.outcome), 'DEVICE_EXECUTION_ORIGINAL_TERMINAL_REQUIRED');
    const receipt = result.receipt;
    assert.ok(receipt, 'DEVICE_EXECUTION_ORIGINAL_RECEIPT_REQUIRED');
    await chain.runtime.checkReceipt(receipt);
    const transaction = await chain.runtime.transaction(receipt.transactionHash),
      originals = chain.runtime.transactions.filter(value => value.transactionHash === receipt.transactionHash);
    assert.ok(transaction && originals.length === 1, 'DEVICE_EXECUTION_ORIGINAL_TRANSACTION_REQUIRED');
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
    if (result.outcome === 'RECOVERED') assert.equal(decoded.statement.recoveryCommitment, row.nativeBinding.recoveryCommitment);
    // The original executor's terminal observer already validates the entire
    // historical pool/hub/backing delta. Rejoin its same signed original wire.
    await chain.runtime.assertCanonical(receipt);
    const terminal = {
      transactionHash: format.bare(receipt.transactionHash),
      blockHash: format.bare(receipt.blockHash),
      blockNumber: BigInt(receipt.blockNumber).toString(),
      calldataSHA256,
      outcome: result.outcome
    };
    const retained = reservations.reservationRow(row.jobId);
    if (retained.nativeTerminal !== null) assert.deepEqual(terminal, retained.nativeTerminal, 'DEVICE_EXECUTION_TERMINAL_CHANGED');else {
      let fields = {};
      if (retained.nativeFReorg) {
        reorgState(chain.nativeExecution, row.jobId);
        const previous = retained.nativeFReorg.originalTerminal;
        assert.equal(result.outcome, 'RECOVERED');
        for (const key of ['transactionHash', 'calldataSHA256', 'outcome']) assert.equal(terminal[key], previous[key], 'F_REORG_ORIGINAL_TERMINAL_CHANGED');
        assert.ok(['REORG_INVALIDATED', 'OBSERVATION_PENDING'].includes(retained.nativeFReorg.phase));
        fields = {
          nativeFReorg: {
            ...retained.nativeFReorg,
            phase: 'RECONFIRMED',
            receipt: terminal
          }
        };
      }
      await reservations.reservationUpdate(row.jobId, {
        ...fields,
        nativeTerminal: terminal,
        nativeOutcome: result.outcome,
        nativeStage: result.outcome,
        nativeErrorCode: null
      });
    }
  }
  function requireLiveRecovery(bridge) {
    assert.ok(profile.nativeNote && (!continuity.recovery || continuity.recovery.liveArmed === true || continuity.recovery.source === true) && !profile.wrapped && continuity.lease() && !continuity.lease().closed && continuity.lease().bridge === bridge, 'DEVICE_LIVE_RECOVERY_ORIGINAL_INSTALLATION');
    return continuity.lease();
  }
  async function refreshLiveOperationClock() {
    if (continuity.lease() === null) return;
    const lease = continuity.lease();
    requireLiveRecovery(lease.bridge);
    await (continuity.nativeSourceOriginal ? refreshOriginalNativeSourceObservedClockV1 : refreshOriginalNativeDeviceLocalObservedClockV1)(lease.clock);
    assert.equal(continuity.lease(), lease, 'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');
    requireLiveRecovery(lease.bridge);
    lifecycle.continueWork();
  }
  function armPublic(row) {
    const arm = row.liveRecoveryArm;
    return {
      jobId: row.jobId,
      state: arm?.state ?? 'ABSENT',
      settleBefore: row.nativeBinding.settleBefore,
      armSHA256: arm?.armSHA256 ?? null,
      terminalOutcome: row.nativeOutcome ?? null
    };
  }
  function sameArm(row, consent, current) {
    const e = consent.execution;
    reservations.originalReservationConsent(row, e.reservation);
    assert.equal(consent.settleBefore, row.nativeBinding.settleBefore, 'DEVICE_LIVE_RECOVERY_CUTOFF_CHANGED');
    assert.equal(e.nativeBindingSHA256, current.nativeBindingSHA256);
    assert.equal(e.reservationTransactionHash, current.reservation.observation.transactionHash);
    assert.equal(e.executionSnapshotSHA256, current.executionSnapshotSHA256);
    assert.equal(e.lossClause, current.lossClause);
  }
  async function armLiveRecovery(original) {
    return lifecycle.exclusive(async () => {
      await lifecycle.healthy();
      lifecycle.continueWork();
      const {
        bridge,
        consent,
        action
      } = original;
      assert.notEqual(continuity.recovery?.sourceObservationRequired, true, 'NATIVE_SOURCE_OBSERVE_BEFORE_CONTINUATION');
      if (action === 'ARM_RECOVERY' && continuity.recovery !== null) {
        assert.ok(continuity.recovery.source && continuity.nativeSourceOriginal, 'DEVICE_LIVE_ARMED_NO_REARM_AFTER_RESTART');
        continuity.originalSourceContinuationInstallation(bridge);
      }
      requireLiveRecovery(bridge);
      validateDeviceRecoveryArmConsentFreshV1(consent);
      assert.equal(action, consent.action);
      const row = reservations.reservationRow(consent.execution.reservation.jobId);
      const current = await deviceExecutionPublic(bridge, row);
      sameArm(row, consent, current);
      const digest = format.byteSHA(deviceRecoveryArmConsentMessageV1(consent));
      if (action === 'ARM_RECOVERY') {
        const previous = row.liveRecoveryArm ?? null;
        if (continuity.recovery?.source) assert.equal(previous, null, 'DEVICE_LIVE_ARMED_NO_REARM_AFTER_RESTART');
        assert.ok(previous === null || previous.state === 'DISARMED', 'DEVICE_LIVE_RECOVERY_ALREADY_ARMED');
        if (previous) {
          assert.equal(previous.nativeBindingSHA256, current.nativeBindingSHA256, 'DEVICE_LIVE_RECOVERY_BINDING_CHANGED');
          assert.equal(previous.reservationTransactionHash, current.reservation.observation.transactionHash, 'DEVICE_LIVE_RECOVERY_S_CHANGED');
          assert.equal(previous.settleBefore, row.nativeBinding.settleBefore);
          assert.equal(previous.lossClause, current.lossClause);
        }
        assert.equal(row.nativeOutcome, null, 'DEVICE_LIVE_RECOVERY_TERMINAL');
        assert.equal(row.nativeRecoveryLatched, false, 'DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
        await refreshLiveOperationClock();
        assert.ok(BigInt((await chain.reader.read()).head.timestamp) < BigInt(row.nativeBinding.settleBefore), 'DEVICE_LIVE_RECOVERY_ARM_BEFORE_CUTOFF');
        requireLiveRecovery(bridge);
        lifecycle.continueWork();
        validateDeviceRecoveryArmConsentFreshV1(consent);
        await reservations.reservationUpdate(row.jobId, {
          liveRecoveryArm: {
            state: 'ARMED',
            armSHA256: digest,
            nativeBindingSHA256: current.nativeBindingSHA256,
            reservationTransactionHash: current.reservation.observation.transactionHash,
            settleBefore: row.nativeBinding.settleBefore,
            lossClause: current.lossClause,
            errorCode: null
          }
        });
      } else {
        assert.equal(action, 'DISARM_RECOVERY');
        assert.equal(row.liveRecoveryArm?.state, 'ARMED', 'DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
        assert.equal(row.nativeRecoveryLatched, false, 'DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
        if (continuity.recovery?.liveArmed || continuity.recovery?.source) {
          await refreshLiveOperationClock();
          assert.ok(BigInt((await chain.reader.read()).head.timestamp) < BigInt(row.nativeBinding.settleBefore), 'DEVICE_LIVE_RECOVERY_DISARM_BEFORE_CUTOFF');
        }
        requireLiveRecovery(bridge);
        lifecycle.continueWork();
        validateDeviceRecoveryArmConsentFreshV1(consent);
        await reservations.reservationUpdate(row.jobId, {
          liveRecoveryArm: {
            ...row.liveRecoveryArm,
            state: 'DISARMED'
          }
        });
      }
      return {
        ...armPublic(reservations.reservationRow(row.jobId)),
        authorizationSHA256: digest
      };
    });
  }
  async function liveArmedOwnerSnapshot(bridge, id) {
    // Drain only work already admitted by this exact account. No new admission,
    // timer cancellation, clock freeze, observer retry or permission is issued.
    if (lifecycle.isBusy()) {
      const admitted = lifecycle.whenIdle();
      await admitted;
    }
    return lifecycle.exclusive(async () => {
      const lease = requireLiveRecovery(bridge);
      (continuity.nativeSourceOriginal ? assertOriginalNativeSourceObservedClockV1 : assertOriginalNativeDeviceLiveArmedObservedClockV1)(lease.clock, {
        runtime: chain.runtime,
        nativeRuntime: lease.nativeRuntime
      });
      await lifecycle.healthy();
      lifecycle.continueWork();
      deviceExecutionOriginal(bridge, reservations.reservationRow(id));
      // The original status read refreshes this clock. Do that before retaining
      // the logical head, then share the same exclusion with the original tick.
      await refreshLiveOperationClock();
      assert.equal(requireLiveRecovery(bridge), lease);
      const view = await chain.reader.read();
      await chain.reader.assertCurrent(view);
      const status = await deviceExecutionPublic(bridge, reservations.reservationRow(id));
      requireLiveRecovery(bridge);
      await lifecycle.healthy();
      const row = reservations.reservationRow(id);
      deviceExecutionOriginal(bridge, row);
      await deviceExecutionPublic(bridge, row);
      const arm = armPublic(row),
        ownerView = await operations.privateOwnerView(),
        linuxSummary = await chain.owner.ownerView.summary();
      await chain.reader.assertCurrent(view);
      lifecycle.continueWork();
      assert.equal(requireLiveRecovery(bridge), lease);
      (continuity.nativeSourceOriginal ? assertOriginalNativeSourceObservedClockV1 : assertOriginalNativeDeviceLiveArmedObservedClockV1)(lease.clock, {
        runtime: chain.runtime,
        nativeRuntime: lease.nativeRuntime
      });
      return Object.freeze({
        sourceSHA256: nativeValueOriginalRecoverySourceV1(chain.runtime, chain.system),
        head: {
          blockNumber: view.head.number,
          blockHash: view.head.hash,
          timestamp: view.head.timestamp
        },
        counts: {
          receiver: chain.runtime.transactions.length,
          native: lease.nativeRuntime.transactions.length
        },
        ledger: {
          publicState: view.ledger.publicState,
          commitments: view.ledger.commitments,
          nullifiers: view.ledger.nullifiers
        },
        status,
        arm,
        ownerView,
        linuxSummary
      });
    });
  }
  async function tickLiveRecovery(lease) {
    assert.equal(lease, continuity.lease(), 'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');
    if (lease.closed) return {
      state: 'CLOSED'
    };
    if (lifecycle.isBusy() || lifecycle.isClosed() || lifecycle.isCancelled() || lifecycle.isUnavailable() || lifecycle.isCapturing() || continuity.recovery?.sourceObservationRequired === true) return {
      state: 'BUSY'
    };
    if (!reservations.reservationRows().some(row => ['ARMED', 'FIRING', 'UNKNOWN'].includes(row.liveRecoveryArm?.state))) return {
      state: 'IDLE'
    };
    return lifecycle.exclusive(async () => {
      if (lease.closed) return {
        state: 'CLOSED'
      };
      await (continuity.nativeSourceOriginal ? refreshOriginalNativeSourceObservedClockV1 : refreshOriginalNativeDeviceLocalObservedClockV1)(lease.clock);
      if (lease.closed) return {
        state: 'CLOSED'
      };
      await lifecycle.healthy();
      if (lease.closed) return {
        state: 'CLOSED'
      };
      for (const row of reservations.reservationRows()) {
        const arm = row.liveRecoveryArm;
        if (!arm || !['ARMED', 'FIRING', 'UNKNOWN'].includes(arm.state)) continue;
        deviceExecutionOriginal(lease.bridge, row);
        const current = await deviceExecutionPublic(lease.bridge, row);
        assert.equal(arm.nativeBindingSHA256, current.nativeBindingSHA256, 'DEVICE_LIVE_RECOVERY_BINDING_CHANGED');
        assert.equal(arm.reservationTransactionHash, current.reservation.observation.transactionHash, 'DEVICE_LIVE_RECOVERY_S_CHANGED');
        assert.equal(arm.settleBefore, row.nativeBinding.settleBefore);
        assert.equal(arm.lossClause, current.lossClause);
        const updateArm = fields => reservations.reservationUpdate(row.jobId, {
          liveRecoveryArm: {
            ...reservations.reservationRow(row.jobId).liveRecoveryArm,
            ...fields
          }
        });
        if (row.nativeOutcome !== null) {
          await updateArm({
            state: row.nativeOutcome
          });
          continue;
        }
        if (lease.closed) return {
          state: 'CLOSED'
        };
        if (arm.state === 'ARMED' && !row.nativeRecoveryLatched) {
          const view = await chain.reader.read();
          await chain.reader.assertCurrent(view);
          if (BigInt(view.head.timestamp) < BigInt(arm.settleBefore)) continue;
          if (lease.closed) return {
            state: 'CLOSED'
          };
          // Admission is latched durably BEFORE the original proof/send work.
          // Once admitted, close drains this same work; it never starts a replacement.
          await reservations.reservationUpdate(row.jobId, {
            liveRecoveryArm: {
              ...arm,
              state: 'FIRING'
            },
            nativeRecoveryLatched: true,
            nativeStage: 'RECOVERING'
          });
          try {
            const result = await chain.nativeExecution.recover(row.jobId);
            await retainDeviceTerminal(reservations.reservationRow(row.jobId), result);
            await updateArm({
              state: result.outcome,
              errorCode: null
            });
          } catch (error) {
            const diagnostic = privateFailureDiagnostic(error, 'DEVICE_LIVE_RECOVERY_OUTCOME_UNRESOLVED');
            await reservations.reservationUpdate(row.jobId, {
              nativeStage: 'UNKNOWN',
              nativeErrorCode: diagnostic.code
            });
            await updateArm({
              state: 'UNKNOWN',
              errorCode: diagnostic.code
            });
            throw error;
          }
        } else {
          // Lost reply, previous manual F or interrupted admitted work: ONLY
          // reconcile the original latches/wire. No proof/send retry on this path.
          try {
            const result = await chain.nativeExecution.reconcile(row.jobId);
            await retainDeviceTerminal(reservations.reservationRow(row.jobId), result);
            await updateArm({
              state: result.outcome,
              errorCode: null
            });
          } catch (error) {
            await updateArm({
              state: 'UNKNOWN',
              errorCode: privateFailureDiagnostic(error, 'DEVICE_LIVE_RECOVERY_OUTCOME_UNRESOLVED').code
            });
            throw error;
          }
        }
      }
      return {
        state: 'IDLE'
      };
    });
  }
  async function deviceExecution(original) {
    return lifecycle.exclusive(async () => {
      await lifecycle.healthy();
      lifecycle.continueWork();
      assert.ok(!profile.wrapped, 'DEVICE_EXECUTION_NATIVE_ONLY');
      const {
          bridge,
          consent,
          action
        } = original,
        row = reservations.reservationRow(consent.reservation.jobId);
      if (action !== 'RECONCILE_NATIVE') assert.notEqual(continuity.recovery?.sourceObservationRequired, true, 'NATIVE_SOURCE_OBSERVE_BEFORE_CONTINUATION');
      if (continuity.recovery?.native && action !== 'RECONCILE_NATIVE') {
        assert.ok(continuity.recovery.source && continuity.nativeSourceOriginal, 'NATIVE_DEVICE_RECOVERY_RECONCILE_ORIGINAL_ONLY');
        assert.ok(['EXECUTE_NATIVE', 'RECOVER_NATIVE'].includes(action), 'NATIVE_SOURCE_ORIGINAL_NEXT_ACTION_REQUIRED');
        continuity.originalSourceContinuationInstallation(bridge);
        // Recovery after an unknown F remains observation-only. New work must
        // have no prior corresponding durable admission or terminal outcome.
        assert.equal(row.nativeOutcome, null, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        assert.equal(row.nativeRecoveryLatched, false, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        if (action === 'EXECUTE_NATIVE') assert.equal(row.nativeLatched, false, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
      }
      deviceExecutionOriginal(bridge, row);
      reservations.originalReservationConsent(row, consent.reservation);
      const current = await deviceExecutionPublic(bridge, row);
      assert.equal(consent.nativeBindingSHA256, current.nativeBindingSHA256, 'DEVICE_EXECUTION_BINDING_CHANGED');
      assert.equal(consent.reservationTransactionHash, current.reservation.observation.transactionHash, 'DEVICE_EXECUTION_RESERVATION_CHANGED');
      assert.equal(consent.executionSnapshotSHA256, current.executionSnapshotSHA256, 'DEVICE_EXECUTION_STATE_CHANGED');
      assert.equal(consent.lossClause, current.lossClause, 'DEVICE_EXECUTION_LOSS_CLAUSE_CHANGED');
      // Fresh heads precede new preparation/admission, never a prepared wire,
      // current-key guard or send. Reconcile drains the same pending continuation.
      const reconcileRecovery = action === 'RECONCILE_NATIVE' && (row.nativeOutcome === 'RECOVERED' || row.nativeFReorg);
      if (!reconcileRecovery) await refreshLiveOperationClock();
      let result;
      try {
        if (action === 'EXECUTE_NATIVE') {
          assert.equal(row.nativeLatched, false, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
          assert.equal(row.nativeOutcome, null, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
          await reservations.reservationUpdate(row.jobId, {
            nativeLatched: true,
            nativeStage: 'EXECUTING',
            nativeExecutionConsent: copy(consent)
          });
          lifecycle.continueWork();
          result = await chain.nativeExecution.execute(row.jobId);
        } else if (action === 'RECOVER_NATIVE') {
          assert.equal(row.nativeRecoveryLatched, false, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
          assert.equal(row.nativeOutcome, null, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
          assert.ok(BigInt((await chain.reader.read()).head.timestamp) >= BigInt(row.nativeBinding.settleBefore), 'DEVICE_EXECUTION_RECOVERY_BEFORE_CUTOFF');
          await reservations.reservationUpdate(row.jobId, {
            nativeRecoveryLatched: true,
            nativeStage: 'RECOVERING',
            nativeRecoveryConsent: copy(consent)
          });
          lifecycle.continueWork();
          result = await chain.nativeExecution.recover(row.jobId);
        } else {
          assert.equal(action, 'RECONCILE_NATIVE');
          if (reconcileRecovery) {
            reorgAdmission = {
              executor: chain.nativeExecution,
              ref: row.jobId,
              bridge
            };
            result = await reconcileOriginalDeviceNativeRecoveryV1(chain.nativeExecution, account.capability(), row.jobId);
          } else result = await chain.nativeExecution.reconcile(row.jobId);
        }
        if (result.outcome !== null) await retainDeviceTerminal(reservations.reservationRow(row.jobId), result);
        return {
          ...(await deviceExecutionPublic(bridge, reservations.reservationRow(row.jobId))),
          authorizationSHA256: format.byteSHA(deviceExecutionConsentMessageV1(consent))
        };
      } catch (error) {
        if (!lifecycle.isUnavailable() && reservations.reservationRow(row.jobId).nativeOutcome === null) {
          const diagnostic = privateFailureDiagnostic(error, 'DEVICE_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED');
          try {
            await reservations.reservationUpdate(row.jobId, {
              nativeStage: 'UNKNOWN',
              nativeErrorCode: diagnostic.code
            });
          } catch {}
        }
        throw error;
      } finally {
        reorgAdmission = null;
      }
    });
  }
  return Object.freeze({
    deviceExecutionOriginal,
    deviceExecutionPublic,
    reorgState,
    retainReorg,
    assertReorgPending,
    retainDeviceTerminal,
    requireLiveRecovery,
    refreshLiveOperationClock,
    armPublic,
    sameArm,
    armLiveRecovery,
    liveArmedOwnerSnapshot,
    tickLiveRecovery,
    deviceExecution
  });
}
