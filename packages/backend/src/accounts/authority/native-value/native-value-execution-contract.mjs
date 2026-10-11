/** Data and ports used by account execution and retained F-reorg transitions.
 * These types do not authenticate accounts, executors, bridges or observations.
 * Their original owners retain all identity checks and one-use admissions. */

/** @typedef {import('@lianum/mobile-protocol/device-execution-consent-v1').DeviceExecutionConsentV1} ExecutionConsent */
/** @typedef {import('@lianum/mobile-protocol/device-reservation-consent-v1').DeviceReservationConsentV1} ReservationConsent */
/** @typedef {import('@lianum/mobile-protocol/device-execution-consent-v1').DeviceExecutionStatusV1} ExecutionStatus */
/** @typedef {import('./native-value-live-recovery.mjs').Arm} Arm */
/** @typedef {import('./live-recovery-leases.mjs').Lease} Lease */
/** @typedef {{settleBefore:string,reserveNullifier:string,recoveryCommitment:string}} NativeBinding */
/** @typedef {{transactionHash:string,blockHash:string,blockNumber:string,to:string,status:string}} Receipt */
/** @typedef {{transactionHash:string,blockHash:string,blockNumber:string,calldataSHA256:string,outcome:'FULFILLED'|'RECOVERED'}} RetainedTerminal */
/** @typedef {{outcome:'FULFILLED'|'RECOVERED'|null,receipt?:Receipt,calldataSHA256?:string}} ExecutionResult */
/** @typedef {'REORG_INVALIDATED'|'OBSERVATION_PENDING'|'RECONFIRMED'} ReorgPhase */
/** @typedef {{schema:'ORIGINAL_DEVICE_NATIVE_F_REORG_V1',id:string,phase:ReorgPhase,originalTerminal:RetainedTerminal,receipt?:RetainedTerminal}} Reorg */
/** @typedef {{
 * jobId:string,consent:ReservationConsent,authorization:unknown,rolePackets:unknown,
 * nativeBinding:NativeBinding,submission:{dispatchLatched:boolean,observation:{transaction:{hash:string}}}|null,
 * observation:{profile:string,transactionHash:string}|null,
 * nativeStage:ExecutionStatus['stage'],nativeOutcome:ExecutionStatus['outcome'],
 * nativeTerminal:RetainedTerminal|null,nativeErrorCode:string|null,nativeFReorg:Reorg|null,
 * nativeLatched:boolean,nativeRecoveryLatched:boolean,liveRecoveryArm:Arm|null,
 * nativeExecutionConsent?:ExecutionConsent,nativeRecoveryConsent?:ExecutionConsent
 * }} ReservationRow */
/** @typedef {{
 * snapshot(reference:string):ExecutionStatus['executionSnapshot'],
 * execute(reference:string):Promise<ExecutionResult>,recover(reference:string):Promise<ExecutionResult>,
 * reconcile(reference:string):Promise<ExecutionResult>
 * }} NativeExecutor */
/** @typedef {{
 * transactions:Array<{transactionHash:string,senderNonce:string,request:{data:string,value?:string}}>,
 * checkReceipt(receipt:Receipt):Promise<unknown>,assertCanonical(receipt:Receipt):Promise<unknown>,
 * transaction(hash:string):Promise<{from:string,to:string,input:string,value:string,nonce:string,blockHash:string,blockNumber:string}|null>
 * }} Runtime */
/** @typedef {{
 * head:{number:string,hash:string,timestamp:string},
 * ledger:{publicState:unknown,commitments:readonly string[],nullifiers:readonly string[]}
 * }} PublicView */
/** @typedef {{
 * runtime:Runtime,system:{sender:string},pool:{address:string},poolIndex:number,nativeExecution:NativeExecutor,
 * owner:{ownerView:{summary():Promise<unknown>}},
 * reader:{read():Promise<PublicView>,assertCurrent(view:PublicView):Promise<unknown>},
 * assertOwnedNativeValueExecution(executor:NativeExecutor,context:{runtime:Runtime,system:{sender:string},poolIndex:number}):unknown
 * }} ExecutionChain */
/** @typedef {{
 * reservationRow(id:string):ReservationRow,reservationRows():ReservationRow[],
 * reservationUpdate(id:string,fields:Partial<ReservationRow>):Promise<unknown>,
 * reservationSubject(depositId:string,rootId:string,descriptor:object):unknown,
 * reservationObservation(row:ReservationRow):Promise<Omit<ExecutionStatus['reservation'],'observation'>&{observation:NonNullable<ExecutionStatus['reservation']['observation']>}>,
 * originalReservationConsent(row:ReservationRow,consent:ReservationConsent):void
 * }} Reservations */
/** @typedef {{
 * bare(value:string):string,reference(value:string):unknown,byteSHA(value:Uint8Array):string,
 * sha(value:unknown):string,copy<T>(value:T):T,
 * graphBinding(input:{authorization:unknown,rolePackets:unknown},identity:object):NativeBinding,
 * calldataHash(value:string):string,
 * decodeTerminal(value:string):{kind:string,statement:{reserveNullifier:string,recoveryCommitment?:string}}
 * }} ExecutionFormat */
/** @typedef {{
 * continueWork():void,healthy():Promise<unknown>,exclusive<T>(work:()=>Promise<T>):Promise<T>,
 * isBusy():boolean,isClosed():boolean,isCancelled():boolean,isUnavailable():boolean,isCapturing():boolean,whenIdle():Promise<unknown>
 * }} ExecutionLifetime */
/** @typedef {{
 * refreshOriginalNativeSourceObservedClockV1(clock:object):Promise<unknown>,
 * assertOriginalNativeSourceObservedClockV1(clock:object,pair:{runtime:object,nativeRuntime:object}):unknown,
 * refreshOriginalNativeDeviceLocalObservedClockV1(clock:object):Promise<unknown>,
 * assertOriginalNativeDeviceLiveArmedObservedClockV1(clock:object,pair:{runtime:object,nativeRuntime:object}):unknown,
 * nativeValueOriginalRecoverySourceV1(runtime:Runtime,system:object):string,
 * reconcileOriginalDeviceNativeRecoveryV1(executor:NativeExecutor,account:object,reference:string):Promise<ExecutionResult>
 * }} OriginalRecovery */
/** @typedef {{
 * originalRecovery:OriginalRecovery,approvals:{deviceExecutionInstallations:WeakMap<object,{descriptor:object}>},
 * chain:ExecutionChain,reservations:Reservations,profile:{nativeNote:boolean,wrapped:boolean,identity:object},
 * lifecycle:ExecutionLifetime,format:ExecutionFormat,
 * continuity:{lease():(Lease&{nativeRuntime:{transactions:readonly unknown[]}})|null,recovery:{native?:boolean,source?:boolean,liveArmed?:boolean,sourceObservationRequired?:boolean}|null,nativeSourceOriginal:object|null,originalSourceContinuationInstallation(bridge:object):unknown},
 * operations:{privateOwnerView():Promise<unknown>},account:{capability():object}
 * }} ExecutionPorts */
export {};
