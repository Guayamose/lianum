import { exactRecord } from '@lianum/components/encoding/commitments';
import { createNativeRecoveryReorgReservationV1 } from './native-recovery-reorg-reservation-v1.mjs';
import { createNativeValueLiveRecovery } from './native-value-live-recovery.mjs';
/** Execution operations. Dependencies are explicit and scoped by role.
 * Journal access is restricted to this domain; account ownership stays in the root. */
import assert from 'node:assert/strict';

import {
  validateDeviceRecoveryArmConsentFreshV1,
  deviceRecoveryArmConsentMessageV1,
} from '@lianum/mobile-protocol/device-recovery-arm-consent-v1';

import { privateFailureDiagnostic } from '../../../execution/account/reconciliation/failure-diagnostics.mjs';

import { deviceExecutionConsentMessageV1 } from '@lianum/mobile-protocol/device-execution-consent-v1';
/** @typedef {import('./native-value-execution-contract.mjs').ReservationRow} ReservationRow */
/** @typedef {import('./native-value-execution-contract.mjs').NativeExecutor} NativeExecutor */
/** @typedef {import('./native-value-execution-contract.mjs').ExecutionConsent} ExecutionConsent */
/** @param {import('./native-value-execution-contract.mjs').ExecutionPorts} ports */
export function createNativeValueExecutionOperations({
  originalRecovery,
  approvals,
  chain,
  reservations,
  profile,
  lifecycle,
  format,
  continuity,
  operations,
  account,
}) {
  exactRecord(originalRecovery, [
    'refreshOriginalNativeSourceObservedClockV1',
    'assertOriginalNativeSourceObservedClockV1',
    'refreshOriginalNativeDeviceLocalObservedClockV1',
    'assertOriginalNativeDeviceLiveArmedObservedClockV1',
    'nativeValueOriginalRecoverySourceV1',
    'reconcileOriginalDeviceNativeRecoveryV1',
  ]);
  for (const method of Object.values(originalRecovery)) assert.equal(typeof method, 'function');
  const {
    refreshOriginalNativeSourceObservedClockV1,
    assertOriginalNativeSourceObservedClockV1,
    refreshOriginalNativeDeviceLocalObservedClockV1,
    assertOriginalNativeDeviceLiveArmedObservedClockV1,
    nativeValueOriginalRecoverySourceV1,
    reconcileOriginalDeviceNativeRecoveryV1,
  } = originalRecovery;

  const { sha, copy, graphBinding: flatAccountGraphBinding } = format;
  /** @type {{executor:NativeExecutor,ref:string,bridge:object}|null} */
  let reorgAdmission = null;
  /** @param {object} bridge @param {ReservationRow} row */
  function deviceExecutionOriginal(bridge, row) {
    const installation = approvals.deviceExecutionInstallations.get(bridge);
    assert.ok(installation, 'DEVICE_EXECUTION_ORIGINAL_INSTALLATION_REQUIRED');
    chain.assertOwnedNativeValueExecution(chain.nativeExecution, {
      runtime: chain.runtime,
      system: chain.system,
      poolIndex: chain.poolIndex,
    });
    reservations.reservationSubject(
      row.consent.depositJobId,
      row.consent.custody.rootId,
      installation.descriptor,
    );
    assert.ok(
      row.nativeBinding && row.submission?.dispatchLatched === true,
      'DEVICE_EXECUTION_BINDING_BEFORE_S_REQUIRED',
    );
    assert.deepEqual(
      row.nativeBinding,
      flatAccountGraphBinding(
        {
          authorization: row.authorization,
          rolePackets: row.rolePackets,
        },
        profile.identity,
      ),
      'DEVICE_EXECUTION_ORIGINAL_BINDING_CHANGED',
    );
    return installation;
  }
  /** @param {object} bridge @param {ReservationRow} row */
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
      lossClause: 'FULL_OWNER_REFUND_PROVIDER_LOSS_V1',
    };
  }
  const { reorgState, retainReorg, assertReorgPending, retainDeviceTerminal } =
    createNativeRecoveryReorgReservationV1({
      originalRow(executor, ref) {
        lifecycle.continueWork();
        assert.ok(
          lifecycle.isBusy() && reorgAdmission?.ref === ref && reorgAdmission.executor === executor,
          'F_REORG_ORIGINAL_RECONCILE_REQUIRED',
        );
        assert.equal(executor, chain.nativeExecution);
        const row = reservations.reservationRow(ref);
        deviceExecutionOriginal(reorgAdmission.bridge, row);
        return row;
      },
      reservations: {
        reservationRow: reservations.reservationRow,
        reservationUpdate: reservations.reservationUpdate,
      },
      chain: {
        runtime: chain.runtime,
        system: chain.system,
        pool: chain.pool,
        nativeExecution: chain.nativeExecution,
      },
      format: {
        copy: format.copy,
        sha: format.sha,
        calldataHash: format.calldataHash,
        decodeTerminal: format.decodeTerminal,
        reference: format.reference,
        bare: format.bare,
      },
    });
  const {
    requireLiveRecovery,
    refreshLiveOperationClock,
    armPublic,
    sameArm,
    armLiveRecovery,
    tickLiveRecovery,
  } = createNativeValueLiveRecovery({
    profile: { nativeNote: profile.nativeNote, wrapped: profile.wrapped },
    chain: { reader: chain.reader, nativeExecution: chain.nativeExecution },
    lifecycle: {
      exclusive: lifecycle.exclusive,
      healthy: lifecycle.healthy,
      continueWork: lifecycle.continueWork,
      isBusy: lifecycle.isBusy,
      isClosed: lifecycle.isClosed,
      isCancelled: lifecycle.isCancelled,
      isUnavailable: lifecycle.isUnavailable,
      isCapturing: lifecycle.isCapturing,
    },
    reservations: {
      reservationRow: reservations.reservationRow,
      reservationRows: reservations.reservationRows,
      originalReservationConsent: reservations.originalReservationConsent,
      reservationUpdate: reservations.reservationUpdate,
    },
    continuity: {
      lease: continuity.lease,
      recovery: continuity.recovery,
      nativeSourceOriginal: continuity.nativeSourceOriginal,
      originalSourceContinuationInstallation: continuity.originalSourceContinuationInstallation,
    },
    format: { byteSHA: format.byteSHA },
    execution: { deviceExecutionOriginal, deviceExecutionPublic, retainDeviceTerminal },
    permission: {
      validateFresh: validateDeviceRecoveryArmConsentFreshV1,
      message: deviceRecoveryArmConsentMessageV1,
    },
    refreshClock: (clock) =>
      (continuity.nativeSourceOriginal
        ? refreshOriginalNativeSourceObservedClockV1
        : refreshOriginalNativeDeviceLocalObservedClockV1)(clock),
    failureDiagnostic: privateFailureDiagnostic,
  });
  /** @param {object} bridge @param {string} id */
  async function liveArmedOwnerSnapshot(bridge, id) {
    // Drain only work already admitted by this exact account. No new admission,
    // timer cancellation, clock freeze, observer retry or permission is issued.
    if (lifecycle.isBusy()) {
      const admitted = lifecycle.whenIdle();
      await admitted;
    }
    return lifecycle.exclusive(async () => {
      const lease = requireLiveRecovery(bridge);
      (continuity.nativeSourceOriginal
        ? assertOriginalNativeSourceObservedClockV1
        : assertOriginalNativeDeviceLiveArmedObservedClockV1)(lease.clock, {
        runtime: chain.runtime,
        nativeRuntime: lease.nativeRuntime,
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
      (continuity.nativeSourceOriginal
        ? assertOriginalNativeSourceObservedClockV1
        : assertOriginalNativeDeviceLiveArmedObservedClockV1)(lease.clock, {
        runtime: chain.runtime,
        nativeRuntime: lease.nativeRuntime,
      });
      return Object.freeze({
        sourceSHA256: nativeValueOriginalRecoverySourceV1(chain.runtime, chain.system),
        head: {
          blockNumber: view.head.number,
          blockHash: view.head.hash,
          timestamp: view.head.timestamp,
        },
        counts: {
          receiver: chain.runtime.transactions.length,
          native: lease.nativeRuntime.transactions.length,
        },
        ledger: {
          publicState: view.ledger.publicState,
          commitments: view.ledger.commitments,
          nullifiers: view.ledger.nullifiers,
        },
        status,
        arm,
        ownerView,
        linuxSummary,
      });
    });
  }
  /** @param {{bridge:object,consent:ExecutionConsent,action:ExecutionConsent['action']}} original */
  async function deviceExecution(original) {
    return lifecycle.exclusive(async () => {
      await lifecycle.healthy();
      lifecycle.continueWork();
      assert.ok(!profile.wrapped, 'DEVICE_EXECUTION_NATIVE_ONLY');
      const { bridge, consent, action } = original,
        row = reservations.reservationRow(consent.reservation.jobId);
      if (action !== 'RECONCILE_NATIVE')
        assert.notEqual(
          continuity.recovery?.sourceObservationRequired,
          true,
          'NATIVE_SOURCE_OBSERVE_BEFORE_CONTINUATION',
        );
      if (continuity.recovery?.native && action !== 'RECONCILE_NATIVE') {
        assert.ok(
          continuity.recovery.source && continuity.nativeSourceOriginal,
          'NATIVE_DEVICE_RECOVERY_RECONCILE_ORIGINAL_ONLY',
        );
        assert.ok(
          ['EXECUTE_NATIVE', 'RECOVER_NATIVE'].includes(action),
          'NATIVE_SOURCE_ORIGINAL_NEXT_ACTION_REQUIRED',
        );
        continuity.originalSourceContinuationInstallation(bridge);
        // Recovery after an unknown F remains observation-only. New work must
        // have no prior corresponding durable admission or terminal outcome.
        assert.equal(row.nativeOutcome, null, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        assert.equal(row.nativeRecoveryLatched, false, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        if (action === 'EXECUTE_NATIVE')
          assert.equal(row.nativeLatched, false, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
      }
      deviceExecutionOriginal(bridge, row);
      reservations.originalReservationConsent(row, consent.reservation);
      const current = await deviceExecutionPublic(bridge, row);
      assert.equal(
        consent.nativeBindingSHA256,
        current.nativeBindingSHA256,
        'DEVICE_EXECUTION_BINDING_CHANGED',
      );
      assert.equal(
        consent.reservationTransactionHash,
        current.reservation.observation.transactionHash,
        'DEVICE_EXECUTION_RESERVATION_CHANGED',
      );
      assert.equal(
        consent.executionSnapshotSHA256,
        current.executionSnapshotSHA256,
        'DEVICE_EXECUTION_STATE_CHANGED',
      );
      assert.equal(consent.lossClause, current.lossClause, 'DEVICE_EXECUTION_LOSS_CLAUSE_CHANGED');
      // Fresh heads precede new preparation/admission, never a prepared wire,
      // current-key guard or send. Reconcile drains the same pending continuation.
      const reconcileRecovery =
        action === 'RECONCILE_NATIVE' && (row.nativeOutcome === 'RECOVERED' || row.nativeFReorg);
      if (!reconcileRecovery) await refreshLiveOperationClock();
      let result;
      try {
        if (action === 'EXECUTE_NATIVE') {
          assert.equal(row.nativeLatched, false, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
          assert.equal(row.nativeOutcome, null, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
          await reservations.reservationUpdate(row.jobId, {
            nativeLatched: true,
            nativeStage: 'EXECUTING',
            nativeExecutionConsent: copy(consent),
          });
          lifecycle.continueWork();
          result = await chain.nativeExecution.execute(row.jobId);
        } else if (action === 'RECOVER_NATIVE') {
          assert.equal(
            row.nativeRecoveryLatched,
            false,
            'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY',
          );
          assert.equal(row.nativeOutcome, null, 'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
          assert.ok(
            BigInt((await chain.reader.read()).head.timestamp) >=
              BigInt(row.nativeBinding.settleBefore),
            'DEVICE_EXECUTION_RECOVERY_BEFORE_CUTOFF',
          );
          await reservations.reservationUpdate(row.jobId, {
            nativeRecoveryLatched: true,
            nativeStage: 'RECOVERING',
            nativeRecoveryConsent: copy(consent),
          });
          lifecycle.continueWork();
          result = await chain.nativeExecution.recover(row.jobId);
        } else {
          assert.equal(action, 'RECONCILE_NATIVE');
          if (reconcileRecovery) {
            reorgAdmission = {
              executor: chain.nativeExecution,
              ref: row.jobId,
              bridge,
            };
            result = await reconcileOriginalDeviceNativeRecoveryV1(
              chain.nativeExecution,
              account.capability(),
              row.jobId,
            );
          } else result = await chain.nativeExecution.reconcile(row.jobId);
        }
        if (result.outcome !== null)
          await retainDeviceTerminal(reservations.reservationRow(row.jobId), result);
        return {
          ...(await deviceExecutionPublic(bridge, reservations.reservationRow(row.jobId))),
          authorizationSHA256: format.byteSHA(deviceExecutionConsentMessageV1(consent)),
        };
      } catch (error) {
        if (
          !lifecycle.isUnavailable() &&
          reservations.reservationRow(row.jobId).nativeOutcome === null
        ) {
          const diagnostic = privateFailureDiagnostic(
            error,
            'DEVICE_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED',
          );
          try {
            await reservations.reservationUpdate(row.jobId, {
              nativeStage: 'UNKNOWN',
              nativeErrorCode: diagnostic.code,
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
    deviceExecution,
  });
}
