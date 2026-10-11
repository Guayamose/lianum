/** Same device D26/U/S; original fresh ARM and ordered new-process reopen. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {originalAccountAccessMessageV2} from '@lianum/mobile-protocol/original-account-v2';
import {deviceRecoveryArmConsentMessageV1} from '@lianum/mobile-protocol/device-recovery-arm-consent-v1';
import {createOriginalNativeDeviceLiveRecoveryProducerV1} from '../../../../packages/backend/src/operations/recovery/native-device-local-live-recovery-v1.mjs';
import {auditNativeDeviceLiveArmedShortV1} from './native-device-live-armed-short-audit-v1.mjs';
import {captureAndLaunchNativeDeviceLiveArmedShortSuccessorV1} from './native-device-economic-launcher-v1.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function runNativeDeviceLiveArmedShortContinuationV1(context){
 assert.equal(arguments.length,1);assert.equal(context.deviceLiveArmed,true);const {result,host,descriptor,deviceKey,active,stage,save,account,runtime,nativeRuntime,system,executionBridge}=context;
 const {signDeviceMessage}=await context.fromApp('custody/signing.mjs');let api,producer,successor,closed=false;const vault=context.vault;
 const access=async()=>{active();const value=await api.access();return{access:value,signature:signDeviceMessage(deviceKey,originalAccountAccessMessageV2(value))};};
 const close=()=>{if(closed)return;closed=true;api?.close();vault.close();};
 try{
  await stage('fresh-device-ARM-original-eight-hour-S');assert.equal(result.proofs.length,3);assert.equal(nativeRuntime.transactions.length,0);
  producer=createOriginalNativeDeviceLiveRecoveryProducerV1({account,executionBridge,runtime,system,nativeRuntime,clock:context.liveClocks.clock});context.economicLifetime.liveProducer=producer;
  api=await host.execution.createDeviceOwnerExecutionApiV1(descriptor);const jobId=result.deviceReservation.jobId,consent=await api.challengeRecoveryArm('ARM_RECOVERY',{...await access(),jobId});
  assert.equal(consent.settleBefore,result.deviceReservation.statement.settleBefore);assert.equal(consent.execution.reservationTransactionHash,result.deviceReservation.observation.transactionHash);
  const armBefore=await api.submitRecoveryArm({consent,signature:signDeviceMessage(deviceKey,deviceRecoveryArmConsentMessageV1(consent))});assert.equal(armBefore.state,'ARMED');assert.equal(armBefore.armSHA256,sha(deviceRecoveryArmConsentMessageV1(consent)));
  await assert.rejects(api.submitRecoveryArm({consent,signature:signDeviceMessage(deviceKey,deviceRecoveryArmConsentMessageV1(consent))}));
  const original={runtime,nativeRuntime,system,account,owner:context.owner},installed={executionBridge,parentJobId:jobId};const before=await auditNativeDeviceLiveArmedShortV1(original,installed);
  const mobileBefore=await vault.readDeviceNote(),intentBefore=await vault.readDeviceReservationIntent(),writesBefore=host.evidence().writes;api.close();
  await stage('same-original-arm-capture-ten-sections-before-cutoff');successor=await captureAndLaunchNativeDeviceLiveArmedShortSuccessorV1({...context,liveProducer:producer});
  api=await host.execution.createDeviceOwnerExecutionApiV1(descriptor);const armAfter=await api.observeRecoveryArm({...await access(),jobId});assert.equal(armAfter.state,'ARMED');
  for(const k of ['jobId','settleBefore','armSHA256','terminalOutcome'])assert.equal(armBefore[k],armAfter[k]);
  const after=await successor.audit();active();context.economicLifetime.publicAudit=after;
  assert.deepEqual(await vault.readDeviceNote(),mobileBefore);assert.deepEqual(await vault.readDeviceReservationIntent(),intentBefore);assert.equal(host.evidence().writes,writesBefore);
  assert.equal(after.arm.state,'ARMED');assert.equal(after.arm.armSHA256,armBefore.armSHA256);assert.equal(after.status.reservation.observation.transactionHash,result.deviceReservation.observation.transactionHash);
  assert.deepEqual(after.counts,before.counts);assert.equal(after.counts.native,0);assert.equal(result.proofs.length,3);assert.ok(BigInt(after.head.timestamp)<BigInt(armBefore.settleBefore));
  result.liveArmedRestart={armBefore,armAfter,before,after,capture:successor.report,preparationStartedSecond:context.originalPrepared.nativePreparation.config.fundingNotBefore,
   sameArm:true,sameS:true,sameDeviceVault:true,freshSignedArmRead:true,noEarlyF:true,sameOriginalJournal:true,sameProviderCustody:true,originalSectionsStoppedBeforeReopen:true};
  result.nativeLiveArmedShortRestartNodeAcceptance=true;result.nativeProcessRestartEstablished=true;result.postCutoffRecoveryEstablished=false;save();
  const stopped=await successor.close();context.economicLifetime.successorClosed=true;result.cleanup.successor=stopped;save();return{vault,close};
 }catch(error){throw error;}finally{if(!context.economicLifetime.captured&&producer)await producer.close();}
}
