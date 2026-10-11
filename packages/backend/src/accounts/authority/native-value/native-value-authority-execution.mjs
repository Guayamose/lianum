/** Private execution operations.
 * The owning authority supplies live state and its original guards through context.
 * This factory does not register, copy or grant an account capability.
 */
/** Separately versioned native-value graph-only wallet binding. Historical flat modules remain unchanged. */
/** Private account authority for the fixed local flat owner. One source, one
 * authorization, and its original exits; no balance rollover is implemented.
 * The generic account keeper/journal/coordinator are reused without changes. */
import assert from "node:assert/strict";
import { flatAccountGraphBinding, flatAccountCalldataHash } from "../flat-account-validation.mjs";
import { sha, copy } from "../../../../../engine/src/execution/accounts/generic-account-journal.mjs";
import { decodeNativeValueTerminalCalldata } from "../../../execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs";
import { refreshOriginalNativeSourceObservedClockV1, assertOriginalNativeSourceObservedClockV1 } from "../../../operations/recovery/native-original-source-observed-clock-v1.mjs";
import { refreshOriginalNativeDeviceLocalObservedClockV1, assertOriginalNativeDeviceLiveArmedObservedClockV1 } from "../../../operations/recovery/native-device-local-observed-clock-v1.mjs";
import { validateDeviceRecoveryArmConsentFreshV1, deviceRecoveryArmConsentMessageV1 } from "../../../../../mobile-protocol/src/device-recovery-arm-consent-v1.mjs";
import { nativeValueOriginalRecoverySourceV1 } from "../../../operations/deployments/native-value/native-value-system-v2.mjs";
import { privateFailureDiagnostic } from "../../../execution/account/reconciliation/failure-diagnostics.mjs";
import { reconcileOriginalDeviceNativeRecoveryV1 } from "../../../execution/native-value/execution/native-value-execution-v2.mjs";
import { deviceExecutionConsentMessageV1 } from "../../../../../mobile-protocol/src/device-execution-consent-v1.mjs";

export function createNativeValueExecutionOperations(context) {
  function deviceExecutionOriginal(bridge,row){
    const installation=context.deviceExecutionInstallations.get(bridge);assert.ok(installation,'DEVICE_EXECUTION_ORIGINAL_INSTALLATION_REQUIRED');
    context.assertOwnedNativeValueExecution(context.nativeExecution,{runtime: context.runtime,system: context.system,poolIndex: context.poolIndex});
    context.reservationSubject(row.consent.depositJobId,row.consent.custody.rootId,installation.descriptor);
    assert.ok(row.nativeBinding&&row.submission?.dispatchLatched===true,'DEVICE_EXECUTION_BINDING_BEFORE_S_REQUIRED');
    assert.deepEqual(row.nativeBinding,flatAccountGraphBinding({authorization:row.authorization,rolePackets:row.rolePackets},context.identity),
      'DEVICE_EXECUTION_ORIGINAL_BINDING_CHANGED');return installation;
  }
  async function deviceExecutionPublic(bridge,row){
    deviceExecutionOriginal(bridge,row);const reservation=await context.reservationObservation(row);
    assert.equal(reservation.stage,'RESERVED','DEVICE_EXECUTION_ORIGINAL_S_REQUIRED');
    const retained=context.reservationRow(row.jobId),snapshot=context.nativeExecution.snapshot(row.jobId);
    return {jobId:row.jobId,reservation,nativeBindingSHA256:sha(retained.nativeBinding),executionSnapshot:copy(snapshot),
      executionSnapshotSHA256:sha(snapshot),stage:retained.nativeStage,outcome:retained.nativeOutcome,
      terminal:copy(retained.nativeTerminal),errorCode:retained.nativeErrorCode,lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'};
  }
  function reorgState(executor, ref) {
    context.continueWork(); assert.ok(context.busy && context.reorgAdmission?.ref === ref && context.reorgAdmission.executor === executor, 'F_REORG_ORIGINAL_RECONCILE_REQUIRED');
    assert.equal(executor, context.nativeExecution); const row = context.reservationRow(ref);
    deviceExecutionOriginal(context.reorgAdmission.bridge, row);
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
    return { terminal: copy(row.nativeFReorg?.originalTerminal ?? row.nativeTerminal), binding: copy(row.nativeBinding), phase: row.nativeFReorg?.phase ?? null };
  }
  async function retainReorg(executor, ref, id, phase) {
    const original = reorgState(executor, ref); context.reference(id);
    assert.ok(['REORG_INVALIDATED', 'OBSERVATION_PENDING', 'RECONFIRMED'].includes(phase));
    const row = context.reservationRow(ref), old = row.nativeFReorg;
    if (old) { assert.equal(old.id, id);
      assert.ok(old.phase === phase || old.phase === 'REORG_INVALIDATED' && phase === 'OBSERVATION_PENDING'
        || old.phase === 'OBSERVATION_PENDING' && phase === 'RECONFIRMED', 'F_REORG_PHASE_REGRESSION'); }
    else assert.equal(phase, 'REORG_INVALIDATED');
    if (old?.phase === 'RECONFIRMED') return;
    await context.reservationUpdate(ref, { nativeTerminal: null, nativeOutcome: null, nativeStage: 'UNKNOWN', nativeErrorCode: null,
      nativeFReorg: { schema: 'ORIGINAL_DEVICE_NATIVE_F_REORG_V1', id, phase, originalTerminal: original.terminal } });
  }
  function assertReorgPending(executor, ref, id) {
    reorgState(executor, ref); const row = context.reservationRow(ref);
    assert.equal(row.nativeFReorg.id, id); assert.equal(row.nativeFReorg.phase, 'OBSERVATION_PENDING');
    assert.equal(row.nativeOutcome, null); assert.equal(row.nativeTerminal, null);
  }
  async function retainDeviceTerminal(row,result){
    assert.ok(['FULFILLED','RECOVERED'].includes(result.outcome),'DEVICE_EXECUTION_ORIGINAL_TERMINAL_REQUIRED');
    const receipt=result.receipt;assert.ok(receipt,'DEVICE_EXECUTION_ORIGINAL_RECEIPT_REQUIRED');await context.runtime.checkReceipt(receipt);
    const transaction=await context.runtime.transaction(receipt.transactionHash),originals=context.runtime.transactions.filter(value=>value.transactionHash===receipt.transactionHash);
    assert.ok(transaction&&originals.length===1,'DEVICE_EXECUTION_ORIGINAL_TRANSACTION_REQUIRED');const original=originals[0];
    assert.equal(receipt.status,'0x1');assert.equal(receipt.to,context.pool.address);assert.equal(transaction.from,context.system.sender);
    assert.equal(transaction.to,context.pool.address);assert.equal(transaction.input,original.request.data);
    assert.equal(transaction.value,original.request.value??'0x0');assert.equal(BigInt(transaction.nonce),BigInt(original.senderNonce));
    assert.equal(transaction.blockHash,receipt.blockHash);assert.equal(transaction.blockNumber,receipt.blockNumber);
    const calldataSHA256=flatAccountCalldataHash(transaction.input);assert.equal(result.calldataSHA256,calldataSHA256);
    const decoded=decodeNativeValueTerminalCalldata(transaction.input);
    assert.equal(decoded.kind,result.outcome==='RECOVERED'?'recovery':'settlement');
    assert.equal(decoded.statement.reserveNullifier,row.nativeBinding.reserveNullifier);
    if(result.outcome==='RECOVERED')assert.equal(decoded.statement.recoveryCommitment,row.nativeBinding.recoveryCommitment);
    // The original executor's terminal observer already validates the entire
    // historical pool/hub/backing delta. Rejoin its same signed original wire.
    await context.runtime.assertCanonical(receipt);
    const terminal={transactionHash:context.bare(receipt.transactionHash),blockHash:context.bare(receipt.blockHash),
      blockNumber:BigInt(receipt.blockNumber).toString(),calldataSHA256,outcome:result.outcome};
    const retained=context.reservationRow(row.jobId);
    if(retained.nativeTerminal!==null)assert.deepEqual(terminal,retained.nativeTerminal,'DEVICE_EXECUTION_TERMINAL_CHANGED');
    else {
      let fields = {};
      if (retained.nativeFReorg) {
        reorgState(context.nativeExecution, row.jobId); const previous = retained.nativeFReorg.originalTerminal;
        assert.equal(result.outcome, 'RECOVERED');
        for (const key of ['transactionHash', 'calldataSHA256', 'outcome']) assert.equal(terminal[key], previous[key], 'F_REORG_ORIGINAL_TERMINAL_CHANGED');
        assert.ok(['REORG_INVALIDATED','OBSERVATION_PENDING'].includes(retained.nativeFReorg.phase));
        fields = { nativeFReorg: { ...retained.nativeFReorg, phase: 'RECONFIRMED', receipt: terminal } };
      }
      await context.reservationUpdate(row.jobId,{...fields,nativeTerminal:terminal,nativeOutcome:result.outcome,nativeStage:result.outcome,nativeErrorCode:null});
    }
  }
  function requireLiveRecovery(bridge){assert.ok(context.nativeNote&&(!context.recovery||context.recovery.liveArmed===true||context.recovery.source===true)&&!context.wrapped&&context.liveRecovery&&!context.liveRecovery.closed&&context.liveRecovery.bridge===bridge,
    'DEVICE_LIVE_RECOVERY_ORIGINAL_INSTALLATION');return context.liveRecovery;}
  async function refreshLiveOperationClock(){
    if(context.liveRecovery===null)return;const lease=context.liveRecovery;requireLiveRecovery(lease.bridge);
    await (context.nativeSourceOriginal?refreshOriginalNativeSourceObservedClockV1:refreshOriginalNativeDeviceLocalObservedClockV1)(lease.clock);
    assert.equal(context.liveRecovery,lease,'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');requireLiveRecovery(lease.bridge);context.continueWork();
  }
  function armPublic(row){const arm=row.liveRecoveryArm;return{jobId:row.jobId,state:arm?.state??'ABSENT',settleBefore:row.nativeBinding.settleBefore,
    armSHA256:arm?.armSHA256??null,terminalOutcome:row.nativeOutcome??null};}
  function sameArm(row,consent,current){const e=consent.execution;context.originalReservationConsent(row,e.reservation);
    assert.equal(consent.settleBefore,row.nativeBinding.settleBefore,'DEVICE_LIVE_RECOVERY_CUTOFF_CHANGED');
    assert.equal(e.nativeBindingSHA256,current.nativeBindingSHA256);assert.equal(e.reservationTransactionHash,current.reservation.observation.transactionHash);
    assert.equal(e.executionSnapshotSHA256,current.executionSnapshotSHA256);assert.equal(e.lossClause,current.lossClause);}
  async function armLiveRecovery(original){return context.exclusive(async()=>{await context.healthy();context.continueWork();const {bridge,consent,action}=original;
    assert.notEqual(context.recovery?.sourceObservationRequired,true,'NATIVE_SOURCE_OBSERVE_BEFORE_CONTINUATION');
    if(action==='ARM_RECOVERY'&&context.recovery!==null) {
      assert.ok(context.recovery.source&&context.nativeSourceOriginal,'DEVICE_LIVE_ARMED_NO_REARM_AFTER_RESTART');
      context.originalSourceContinuationInstallation(bridge);
    }
    requireLiveRecovery(bridge);validateDeviceRecoveryArmConsentFreshV1(consent);assert.equal(action,consent.action);const row=context.reservationRow(consent.execution.reservation.jobId);
    const current=await deviceExecutionPublic(bridge,row);sameArm(row,consent,current);
    const digest=context.byteSHA(deviceRecoveryArmConsentMessageV1(consent));
    if(action==='ARM_RECOVERY'){
      const previous=row.liveRecoveryArm??null;
      if(context.recovery?.source)assert.equal(previous,null,'DEVICE_LIVE_ARMED_NO_REARM_AFTER_RESTART');
      assert.ok(previous===null||previous.state==='DISARMED','DEVICE_LIVE_RECOVERY_ALREADY_ARMED');
      if(previous){assert.equal(previous.nativeBindingSHA256,current.nativeBindingSHA256,'DEVICE_LIVE_RECOVERY_BINDING_CHANGED');
        assert.equal(previous.reservationTransactionHash,current.reservation.observation.transactionHash,'DEVICE_LIVE_RECOVERY_S_CHANGED');
        assert.equal(previous.settleBefore,row.nativeBinding.settleBefore);assert.equal(previous.lossClause,current.lossClause);}
      assert.equal(row.nativeOutcome,null,'DEVICE_LIVE_RECOVERY_TERMINAL');assert.equal(row.nativeRecoveryLatched,false,'DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
      await refreshLiveOperationClock();
      assert.ok(BigInt((await context.reader.read()).head.timestamp)<BigInt(row.nativeBinding.settleBefore),'DEVICE_LIVE_RECOVERY_ARM_BEFORE_CUTOFF');
      requireLiveRecovery(bridge);context.continueWork();validateDeviceRecoveryArmConsentFreshV1(consent);
      await context.reservationUpdate(row.jobId,{liveRecoveryArm:{state:'ARMED',armSHA256:digest,nativeBindingSHA256:current.nativeBindingSHA256,
        reservationTransactionHash:current.reservation.observation.transactionHash,settleBefore:row.nativeBinding.settleBefore,
        lossClause:current.lossClause,errorCode:null}});
    }else{assert.equal(action,'DISARM_RECOVERY');assert.equal(row.liveRecoveryArm?.state,'ARMED','DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
      assert.equal(row.nativeRecoveryLatched,false,'DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
      if(context.recovery?.liveArmed||context.recovery?.source){await refreshLiveOperationClock();assert.ok(BigInt((await context.reader.read()).head.timestamp)<BigInt(row.nativeBinding.settleBefore),'DEVICE_LIVE_RECOVERY_DISARM_BEFORE_CUTOFF');}
      requireLiveRecovery(bridge);context.continueWork();validateDeviceRecoveryArmConsentFreshV1(consent);
      await context.reservationUpdate(row.jobId,{liveRecoveryArm:{...row.liveRecoveryArm,state:'DISARMED'}});}
    return{...armPublic(context.reservationRow(row.jobId)),authorizationSHA256:digest};
  });}
  async function liveArmedOwnerSnapshot(bridge,id){
    // Drain only work already admitted by this exact account. No new admission,
    // timer cancellation, clock freeze, observer retry or permission is issued.
    if(context.busy){const admitted=context.idle;await admitted;}
    return context.exclusive(async()=>{
      const lease=requireLiveRecovery(bridge);
      (context.nativeSourceOriginal?assertOriginalNativeSourceObservedClockV1:assertOriginalNativeDeviceLiveArmedObservedClockV1)(lease.clock,{runtime: context.runtime,nativeRuntime:lease.nativeRuntime});
      await context.healthy();context.continueWork();deviceExecutionOriginal(bridge,context.reservationRow(id));
      // The original status read refreshes this clock. Do that before retaining
      // the logical head, then share the same exclusion with the original tick.
      await refreshLiveOperationClock();assert.equal(requireLiveRecovery(bridge),lease);
      const view=await context.reader.read();await context.reader.assertCurrent(view);
      const status=await deviceExecutionPublic(bridge,context.reservationRow(id));
      requireLiveRecovery(bridge);await context.healthy();const row=context.reservationRow(id);
      deviceExecutionOriginal(bridge,row);await deviceExecutionPublic(bridge,row);
      const arm=armPublic(row),ownerView=await context.privateOwnerView(),linuxSummary=await context.owner.ownerView.summary();
      await context.reader.assertCurrent(view);context.continueWork();assert.equal(requireLiveRecovery(bridge),lease);
      (context.nativeSourceOriginal?assertOriginalNativeSourceObservedClockV1:assertOriginalNativeDeviceLiveArmedObservedClockV1)(lease.clock,{runtime: context.runtime,nativeRuntime:lease.nativeRuntime});
      return Object.freeze({sourceSHA256:nativeValueOriginalRecoverySourceV1(context.runtime,context.system),
        head:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},
        counts:{receiver:context.runtime.transactions.length,native:lease.nativeRuntime.transactions.length},
        ledger:{publicState:view.ledger.publicState,commitments:view.ledger.commitments,nullifiers:view.ledger.nullifiers},
        status,arm,ownerView,linuxSummary});
    });
  }
  async function tickLiveRecovery(lease){
    assert.equal(lease,context.liveRecovery,'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');if(lease.closed)return{state:'CLOSED'};
    if(context.busy||context.closed||context.cancelled||context.unavailable||context.capturing||context.recovery?.sourceObservationRequired===true)return{state:'BUSY'};
    if(!context.reservationRows().some(row=>['ARMED','FIRING','UNKNOWN'].includes(row.liveRecoveryArm?.state)))return{state:'IDLE'};
    return context.exclusive(async()=>{if(lease.closed)return{state:'CLOSED'};
      await (context.nativeSourceOriginal?refreshOriginalNativeSourceObservedClockV1:refreshOriginalNativeDeviceLocalObservedClockV1)(lease.clock);if(lease.closed)return{state:'CLOSED'};
      await context.healthy();if(lease.closed)return{state:'CLOSED'};
      for(const row of context.reservationRows()){
        const arm=row.liveRecoveryArm;if(!arm||!['ARMED','FIRING','UNKNOWN'].includes(arm.state))continue;
        deviceExecutionOriginal(lease.bridge,row);const current=await deviceExecutionPublic(lease.bridge,row);
        assert.equal(arm.nativeBindingSHA256,current.nativeBindingSHA256,'DEVICE_LIVE_RECOVERY_BINDING_CHANGED');
        assert.equal(arm.reservationTransactionHash,current.reservation.observation.transactionHash,'DEVICE_LIVE_RECOVERY_S_CHANGED');
        assert.equal(arm.settleBefore,row.nativeBinding.settleBefore);assert.equal(arm.lossClause,current.lossClause);
        const updateArm=fields=>context.reservationUpdate(row.jobId,{liveRecoveryArm:{...context.reservationRow(row.jobId).liveRecoveryArm,...fields}});
        if(row.nativeOutcome!==null){await updateArm({state:row.nativeOutcome});continue;}
        if(lease.closed)return{state:'CLOSED'};
        if(arm.state==='ARMED'&&!row.nativeRecoveryLatched){
          const view=await context.reader.read();await context.reader.assertCurrent(view);
          if(BigInt(view.head.timestamp)<BigInt(arm.settleBefore))continue;
          if(lease.closed)return{state:'CLOSED'};
          // Admission is latched durably BEFORE the original proof/send work.
          // Once admitted, close drains this same work; it never starts a replacement.
          await context.reservationUpdate(row.jobId,{liveRecoveryArm:{...arm,state:'FIRING'},nativeRecoveryLatched:true,nativeStage:'RECOVERING'});
          try{const result=await context.nativeExecution.recover(row.jobId);await retainDeviceTerminal(context.reservationRow(row.jobId),result);
            await updateArm({state:result.outcome,errorCode:null});}
          catch(error){const diagnostic=privateFailureDiagnostic(error,'DEVICE_LIVE_RECOVERY_OUTCOME_UNRESOLVED');
            await context.reservationUpdate(row.jobId,{nativeStage:'UNKNOWN',nativeErrorCode:diagnostic.code});
            await updateArm({state:'UNKNOWN',errorCode:diagnostic.code});throw error;}
        }else{
          // Lost reply, previous manual F or interrupted admitted work: ONLY
          // reconcile the original latches/wire. No proof/send retry on this path.
          try{const result=await context.nativeExecution.reconcile(row.jobId);await retainDeviceTerminal(context.reservationRow(row.jobId),result);
            await updateArm({state:result.outcome,errorCode:null});}
          catch(error){await updateArm({state:'UNKNOWN',errorCode:privateFailureDiagnostic(error,'DEVICE_LIVE_RECOVERY_OUTCOME_UNRESOLVED').code});throw error;}
        }
      }
      return{state:'IDLE'};
    });
  }
  async function deviceExecution(original){return context.exclusive(async()=>{
    await context.healthy();context.continueWork();assert.ok(!context.wrapped,'DEVICE_EXECUTION_NATIVE_ONLY');
    const {bridge,consent,action}=original,row=context.reservationRow(consent.reservation.jobId);
    if(action!=='RECONCILE_NATIVE')assert.notEqual(context.recovery?.sourceObservationRequired,true,'NATIVE_SOURCE_OBSERVE_BEFORE_CONTINUATION');
    if(context.recovery?.native&&action!=='RECONCILE_NATIVE') {
      assert.ok(context.recovery.source&&context.nativeSourceOriginal,'NATIVE_DEVICE_RECOVERY_RECONCILE_ORIGINAL_ONLY');
      assert.ok(['EXECUTE_NATIVE','RECOVER_NATIVE'].includes(action),'NATIVE_SOURCE_ORIGINAL_NEXT_ACTION_REQUIRED');
      context.originalSourceContinuationInstallation(bridge);
      // Recovery after an unknown F remains observation-only. New work must
      // have no prior corresponding durable admission or terminal outcome.
      assert.equal(row.nativeOutcome,null,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
      assert.equal(row.nativeRecoveryLatched,false,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
      if(action==='EXECUTE_NATIVE')assert.equal(row.nativeLatched,false,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
    }
    deviceExecutionOriginal(bridge,row);context.originalReservationConsent(row,consent.reservation);
    const current=await deviceExecutionPublic(bridge,row);
    assert.equal(consent.nativeBindingSHA256,current.nativeBindingSHA256,'DEVICE_EXECUTION_BINDING_CHANGED');
    assert.equal(consent.reservationTransactionHash,current.reservation.observation.transactionHash,'DEVICE_EXECUTION_RESERVATION_CHANGED');
    assert.equal(consent.executionSnapshotSHA256,current.executionSnapshotSHA256,'DEVICE_EXECUTION_STATE_CHANGED');
    assert.equal(consent.lossClause,current.lossClause,'DEVICE_EXECUTION_LOSS_CLAUSE_CHANGED');
    // Fresh heads precede new preparation/admission, never a prepared wire,
    // current-key guard or send. Reconcile drains the same pending continuation.
    const reconcileRecovery = action === 'RECONCILE_NATIVE' && (row.nativeOutcome === 'RECOVERED' || row.nativeFReorg);
    if (!reconcileRecovery) await refreshLiveOperationClock();
    let result;
    try{
      if(action==='EXECUTE_NATIVE'){
        assert.equal(row.nativeLatched,false,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        assert.equal(row.nativeOutcome,null,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        await context.reservationUpdate(row.jobId,{nativeLatched:true,nativeStage:'EXECUTING',nativeExecutionConsent:copy(consent)});
        context.continueWork();result=await context.nativeExecution.execute(row.jobId);
      }else if(action==='RECOVER_NATIVE'){
        assert.equal(row.nativeRecoveryLatched,false,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        assert.equal(row.nativeOutcome,null,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        assert.ok(BigInt((await context.reader.read()).head.timestamp)>=BigInt(row.nativeBinding.settleBefore),'DEVICE_EXECUTION_RECOVERY_BEFORE_CUTOFF');
        await context.reservationUpdate(row.jobId,{nativeRecoveryLatched:true,nativeStage:'RECOVERING',nativeRecoveryConsent:copy(consent)});
        context.continueWork();result=await context.nativeExecution.recover(row.jobId);
      }else{assert.equal(action,'RECONCILE_NATIVE');
        if (reconcileRecovery) { context.reorgAdmission = { executor: context.nativeExecution, ref: row.jobId, bridge };
          result = await reconcileOriginalDeviceNativeRecoveryV1(context.nativeExecution, context.capability, row.jobId); }
        else result=await context.nativeExecution.reconcile(row.jobId);}
      if (result.outcome !== null) await retainDeviceTerminal(context.reservationRow(row.jobId),result);
      return {...await deviceExecutionPublic(bridge,context.reservationRow(row.jobId)),authorizationSHA256:context.byteSHA(deviceExecutionConsentMessageV1(consent))};
    }catch(error){if(!context.unavailable&&context.reservationRow(row.jobId).nativeOutcome===null){const diagnostic=privateFailureDiagnostic(error,'DEVICE_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED');
        try{await context.reservationUpdate(row.jobId,{nativeStage:'UNKNOWN',nativeErrorCode:diagnostic.code});}catch{}}
      throw error;}finally{context.reorgAdmission=null;}
  });}
  return Object.freeze({ deviceExecutionOriginal, deviceExecutionPublic, reorgState, retainReorg, assertReorgPending, retainDeviceTerminal, requireLiveRecovery, refreshLiveOperationClock, armPublic, sameArm, armLiveRecovery, liveArmedOwnerSnapshot, tickLiveRecovery, deviceExecution });
}
