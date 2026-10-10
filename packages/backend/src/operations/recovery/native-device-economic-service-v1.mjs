/** Fixed original service installation after a completed native capture.
 * The recovered account emits the one-use preparation from its AEAD journal.
 * Caller DTOs, IDs and restored signatures never become capabilities. D26/U/S
 * and execute/recover are fenced in the recovered account; fresh signed reads,
 * terminal reconciliation and separate W39 admissions remain original. */
import assert from 'node:assert/strict';
import {exactRecord} from '../../execution/encoding/commitments.mjs';
import {assertOwnedNativeValueAccountAuthority,retainOriginalNativeDeviceRecoveredInstallationV1,
 isOriginalNativePrivateDepositAccountV2,isOriginalNativePrivateExitAccountV2,isOriginalNativePrivateReservationAccountV2,isOriginalNativePrivateWorkerAccountV3,consumeOriginalNativeDeviceRecoveredInstallationV1} from '../../accounts/authority/native-value-account-authority-v2.mjs';
import {assertPairedOriginalAccountActorAccountV2} from '../../api/mobile/paired-original-account-actor-v2.mjs';
import {createDeviceOwnerDepositBridgeV1,createOriginalNativePrivateDepositBridgeV2,createOriginalNativePrivateWorkerDepositBridgeV3} from '../../accounts/authority/device-owner-deposit-bridge-v1.mjs';
import {createDeviceOwnerReservationBridgeV1,createOriginalNativePrivateReservationBridgeV2} from '../../accounts/authority/device-owner-reservation-bridge-v1.mjs';
import {createDeviceOwnerExecutionBridgeV1,createOriginalNativePrivateExecutionBridgeV2,createOriginalNativePrivateWorkerExecutionBridgeV3} from '../../accounts/authority/device-owner-execution-bridge-v1.mjs';
import {createPairedDeviceAccountTlsServerV1,createPairedDurableDeviceAccountTlsServerV1} from '../../api/mobile/paired-original-account-http-v2.mjs';
import {createOriginalDeviceDurableDispatchV1} from '../../api/mobile/original-device-durable-dispatch-v1.mjs';
export function reinstallOriginalNativeDeviceEconomicServiceV1(input){
 assert.equal(arguments.length,1);return reinstall(input,false);
}
export function reinstallOriginalNativeDeviceDurableEconomicServiceV1(input){
 assert.equal(arguments.length,1);return reinstall(input,true);
}
async function reinstall(input,durable){
 exactRecord(input,['runtime','system','owner','account','nativeExecution','providerCustody','actor','tls',...(durable?['pool','privacyKey']:[])]);
 const {runtime,system,owner,account,nativeExecution,providerCustody,actor,tls}=input;
 assertOwnedNativeValueAccountAuthority(account,{runtime,system,poolIndex:0,owner});assertPairedOriginalAccountActorAccountV2(actor,account);
 const cap=await retainOriginalNativeDeviceRecoveredInstallationV1(account,actor,providerCustody),retained=consumeOriginalNativeDeviceRecoveredInstallationV1(cap,account,actor);
 let depositBridge,reservationBridge,executionBridge,transport,dispatch;
 try{
   depositBridge=await(isOriginalNativePrivateWorkerAccountV3(account)?createOriginalNativePrivateWorkerDepositBridgeV3:isOriginalNativePrivateDepositAccountV2(account)?createOriginalNativePrivateDepositBridgeV2:createDeviceOwnerDepositBridgeV1)({actor,account,owner,runtime,system,poolIndex:0});
   reservationBridge=await(isOriginalNativePrivateReservationAccountV2(account)?createOriginalNativePrivateReservationBridgeV2:createDeviceOwnerReservationBridgeV1)({actor,account,owner,runtime,system,poolIndex:0,
     nativePreparation:retained.nativePreparation,invoiceSignatures:retained.invoiceSignatures});
   executionBridge=await(isOriginalNativePrivateWorkerAccountV3(account)?createOriginalNativePrivateWorkerExecutionBridgeV3:isOriginalNativePrivateExitAccountV2(account)?createOriginalNativePrivateExecutionBridgeV2:createDeviceOwnerExecutionBridgeV1)({account,reservationBridge,nativeExecution,providers:retained.providers,runtime,system,poolIndex:0});
   if(durable)dispatch=await createOriginalDeviceDurableDispatchV1({depositBridge,reservationBridge,executionBridge,pool:input.pool,privacyKey:input.privacyKey});
   transport=await(durable?createPairedDurableDeviceAccountTlsServerV1:createPairedDeviceAccountTlsServerV1)({depositBridge,reservationBridge,executionBridge,tls,...(durable?{dispatch}:{})});
   return Object.freeze({transport,depositBridge,reservationBridge,executionBridge,descriptor:retained.descriptor,
     parentJobId:retained.parentJobId,depositJobId:retained.depositJobId,rootId:retained.rootId,...(durable?{dispatch}:{})});
 }catch(error){const failures=[];if(transport)try{await transport.close();}catch(failure){failures.push(failure);}
   try{dispatch?.close();}catch(failure){failures.push(failure);}
   for(const bridge of [executionBridge,reservationBridge,depositBridge])try{await bridge?.close();}catch(failure){failures.push(failure);}
   if(failures.length)throw new AggregateError([error,...failures],'NATIVE_DEVICE_RECOVERY_SERVICE_CLEANUP_FAILED',{cause:error});throw error;}
}
