/** Durable recovery permission and ticker for one account's original lease.
 * No account, bridge or lease is minted here. The account owner supplies fixed
 * readers, journal mutations and its original clock/executor consumers. */
import assert from 'node:assert/strict';
/** @typedef {import('@lianum/mobile-protocol/device-recovery-arm-consent-v1').DeviceRecoveryArmConsentV1} ArmConsent */
/** @typedef {import('./live-recovery-leases.mjs').Lease} Lease */
/** @typedef {{state:string,armSHA256:string,nativeBindingSHA256:string,reservationTransactionHash:string,settleBefore:string,lossClause:string,errorCode?:string|null}} Arm */
/** @typedef {{jobId:string,nativeBinding:{settleBefore:string},nativeOutcome:string|null,nativeRecoveryLatched:boolean,liveRecoveryArm:Arm|null}} Row */
/** @typedef {{nativeBindingSHA256:string,executionSnapshotSHA256:string,reservation:{observation:{transactionHash:string}},lossClause:string}} ExecutionView */
/** @typedef {{outcome:string|null}} Terminal */
/** @template {Row} StoredRow
 * @template {{head:{timestamp:string}}} View
 * @template {Terminal} Result
 * @template {Lease} BoundLease
 * @param {{profile:{nativeNote:boolean,wrapped:boolean},
 * chain:{reader:{read():Promise<View>,assertCurrent(view:View):Promise<unknown>},nativeExecution:{recover(id:string):Promise<Result>,reconcile(id:string):Promise<Result>}},
 * lifecycle:{exclusive<T>(work:()=>Promise<T>):Promise<T>,healthy():Promise<unknown>,continueWork():void,isBusy():boolean,isClosed():boolean,isCancelled():boolean,isUnavailable():boolean,isCapturing():boolean},
 * reservations:{reservationRow(id:string):StoredRow,reservationRows():StoredRow[],originalReservationConsent(row:StoredRow,consent:ArmConsent['execution']['reservation']):void,reservationUpdate(id:string,fields:Partial<Pick<Row,'liveRecoveryArm'|'nativeRecoveryLatched'>>&{nativeStage?:'RECOVERING'|'UNKNOWN',nativeErrorCode?:string}):Promise<unknown>},
 * continuity:{lease():BoundLease|null,recovery:{liveArmed?:boolean,source?:boolean,sourceObservationRequired?:boolean}|null,nativeSourceOriginal:unknown,originalSourceContinuationInstallation(bridge:object):unknown},
 * format:{byteSHA(value:Uint8Array):string},execution:{deviceExecutionOriginal(bridge:object,row:StoredRow):unknown,deviceExecutionPublic(bridge:object,row:StoredRow):Promise<ExecutionView>,retainDeviceTerminal(row:StoredRow,result:Result):Promise<unknown>},
 * permission:{validateFresh(consent:ArmConsent):unknown,message(consent:ArmConsent):Uint8Array},refreshClock(clock:object):Promise<unknown>,failureDiagnostic(error:unknown,fallback:string):{code:string}}} ports */
export function createNativeValueLiveRecovery(ports) {
  const {profile,chain,lifecycle,reservations,continuity,format,execution,permission,refreshClock,failureDiagnostic}=ports;
  /** @param {object} bridge */
  function requireLiveRecovery(bridge) {
    const lease=continuity.lease();
    assert.ok(profile.nativeNote && (!continuity.recovery || continuity.recovery.liveArmed === true || continuity.recovery.source === true) && !profile.wrapped && lease && !lease.closed && lease.bridge === bridge, 'DEVICE_LIVE_RECOVERY_ORIGINAL_INSTALLATION');
    return lease;
  }
  async function refreshLiveOperationClock() {
    const lease = continuity.lease();
    if (lease === null) return;
    requireLiveRecovery(lease.bridge);
    await refreshClock(lease.clock);
    assert.equal(continuity.lease(), lease, 'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');
    requireLiveRecovery(lease.bridge);
    lifecycle.continueWork();
  }
  /** @param {StoredRow} row */
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
  /** @param {StoredRow} row @param {ArmConsent} consent @param {ExecutionView} current */
  function sameArm(row, consent, current) {
    const e = consent.execution;
    reservations.originalReservationConsent(row, e.reservation);
    assert.equal(consent.settleBefore, row.nativeBinding.settleBefore, 'DEVICE_LIVE_RECOVERY_CUTOFF_CHANGED');
    assert.equal(e.nativeBindingSHA256, current.nativeBindingSHA256);
    assert.equal(e.reservationTransactionHash, current.reservation.observation.transactionHash);
    assert.equal(e.executionSnapshotSHA256, current.executionSnapshotSHA256);
    assert.equal(e.lossClause, current.lossClause);
  }
  /** @param {{bridge:object,consent:ArmConsent,action:ArmConsent['action']}} original */
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
      permission.validateFresh(consent);
      assert.equal(action, consent.action);
      const row = reservations.reservationRow(consent.execution.reservation.jobId);
      const current = await execution.deviceExecutionPublic(bridge, row);
      sameArm(row, consent, current);
      const digest = format.byteSHA(permission.message(consent));
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
        permission.validateFresh(consent);
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
        permission.validateFresh(consent);
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
  /** @param {BoundLease} lease */
  async function tickLiveRecovery(lease) {
    assert.equal(lease, continuity.lease(), 'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');
    if (lease.closed) return {
      state: 'CLOSED'
    };
    if (lifecycle.isBusy() || lifecycle.isClosed() || lifecycle.isCancelled() || lifecycle.isUnavailable() || lifecycle.isCapturing() || continuity.recovery?.sourceObservationRequired === true) return {
      state: 'BUSY'
    };
    if (!reservations.reservationRows().some(row => ['ARMED', 'FIRING', 'UNKNOWN'].includes(row.liveRecoveryArm?.state??''))) return {
      state: 'IDLE'
    };
    return lifecycle.exclusive(async () => {
      if (lease.closed) return {
        state: 'CLOSED'
      };
      await refreshClock(lease.clock);
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
        execution.deviceExecutionOriginal(lease.bridge, row);
        const current = await execution.deviceExecutionPublic(lease.bridge, row);
        assert.equal(arm.nativeBindingSHA256, current.nativeBindingSHA256, 'DEVICE_LIVE_RECOVERY_BINDING_CHANGED');
        assert.equal(arm.reservationTransactionHash, current.reservation.observation.transactionHash, 'DEVICE_LIVE_RECOVERY_S_CHANGED');
        assert.equal(arm.settleBefore, row.nativeBinding.settleBefore);
        assert.equal(arm.lossClause, current.lossClause);
        /** @param {Partial<Arm>} fields */
        const updateArm = fields => {
          const retained=reservations.reservationRow(row.jobId).liveRecoveryArm;
          assert.ok(retained,'DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
          return reservations.reservationUpdate(row.jobId,{liveRecoveryArm:{...retained,...fields}});
        };
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
            await execution.retainDeviceTerminal(reservations.reservationRow(row.jobId), result);
            await updateArm({
              // Retention rejects a null/unresolved terminal before this update.
              state: /** @type {string} */ (result.outcome),
              errorCode: null
            });
          } catch (error) {
            const diagnostic = failureDiagnostic(error, 'DEVICE_LIVE_RECOVERY_OUTCOME_UNRESOLVED');
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
            await execution.retainDeviceTerminal(reservations.reservationRow(row.jobId), result);
            await updateArm({
              // Retention rejects a null/unresolved terminal before this update.
              state: /** @type {string} */ (result.outcome),
              errorCode: null
            });
          } catch (error) {
            await updateArm({
              state: 'UNKNOWN',
              errorCode: failureDiagnostic(error, 'DEVICE_LIVE_RECOVERY_OUTCOME_UNRESOLVED').code
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
  return Object.freeze({requireLiveRecovery,refreshLiveOperationClock,armPublic,sameArm,armLiveRecovery,tickLiveRecovery});
}
