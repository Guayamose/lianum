/** Fixed original EVM economic capture. References come from the same private
 * bootstrap, never HTTP IDs/DTOs or caller callbacks. All fences run before the
 * first await; the encrypted issuer subsequently owns stop and publication. */
import assert from 'node:assert/strict';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {profileCommitment} from '../../chains/shared/transfers/generic-native-value-v2.mjs';
import {assertNativeEconomicRecoveryCaptureV1,assertNativeLiveArmedRecoveryCaptureV1,retainNativeEconomicRecoveryV1,retainNativeLiveArmedRecoveryV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {assertOwnedNativeValueAccountAuthority,assertNativeLiveArmedAccountCaptureV1,fenceOriginalNativeAccountEconomicRecoveryV1} from '../../accounts/authority/native-value-account-authority-v2.mjs';
import {assertOwnedNativeValueExecution,fenceOriginalNativeExecutionEconomicRecoveryV1} from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import {assertOwnedNativeValueOwnerProcess,fenceOriginalNativeOwnerEconomicRecoveryV1} from '../../custody/processes/native-value-owner-process-v2.mjs';
import {assertOwnedNativeValueProviderCustody,fenceOriginalNativeProviderEconomicRecoveryV1} from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import {assertNativeValueOperatorBootstrapForSystem,assertNativeValueBootstrapNativeRuntime,fenceOriginalNativeBootstrapEconomicRecoveryV1} from '../operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import {nativeValueOriginalRecoverySourceV1,fenceOriginalNativeSystemEconomicRecoveryV1} from '../deployments/native-value/native-value-system-v2.mjs';
import {assertNativeSessionEconomicMembershipV1,fenceOriginalNativeSessionEconomicRecoveryV1} from '../../api/accounts/flat-manual-graph-session.mjs';
import {assertNativeActorEconomicMembershipV1,fenceOriginalNativeActorEconomicRecoveryV1} from './native-original-source-lifecycle-v1.mjs';
import {assertNativeDeviceTransportEconomicMembershipV1,fenceOriginalNativeDeviceTransportRecoveryV1} from '../../api/mobile/paired-original-account-http-v2.mjs';
import {assertOwnedNativeEconomicRuntimeRecoverableV1,fenceOwnedNativeEconomicRuntimeV1,fenceOwnedNativeLiveArmedRuntimeV1 as liveRuntimeFence} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {assertOriginalNativeDeviceLiveRecoveryProducerV1} from './native-device-local-live-recovery-v1.mjs';
import {assertOriginalNativeDeviceLiveArmedObservedClockV1,quiesceOriginalNativeDeviceLiveArmedObservedClockV1} from './native-device-local-observed-clock-v1.mjs';
const requests=new WeakMap();
export function captureNativeValueEconomicRecoveryV1(authority,raw){
 assert.equal(arguments.length,2);exactRecord(raw,['runtime','nativeRuntime','bootstrap','system','providerCustody','owner','nativeExecution','account','session','actor','transport']);
 const input={...raw},identity=assertNativeEconomicRecoveryCaptureV1(authority);assert.equal(identity.profile,'NATIVE_VALUE_ECONOMIC_RECOVERY_V1');const {runtime,system,owner,account,nativeExecution,bootstrap,nativeRuntime,providerCustody,session,actor,transport}=input;
 assert.equal(nativeValueOriginalRecoverySourceV1(runtime,system),identity.sourceSHA256,'NATIVE_ECONOMIC_ORIGINAL_SOURCE');
 assertOwnedNativeValueAccountAuthority(account,{runtime,system,poolIndex:0,owner});
 assertOwnedNativeValueExecution(nativeExecution,{runtime,system,poolIndex:0});assertOwnedNativeValueOwnerProcess(owner,{runtime,system,poolIndex:0});
 assertOwnedNativeValueProviderCustody(providerCustody,{runtime,system,poolIndex:0});
 assertNativeValueOperatorBootstrapForSystem(bootstrap,{runtime,system});assert.equal(system.adapterProfiles.length,1,'NATIVE_ECONOMIC_FIXED_EVM_PROFILE');
 assertNativeValueBootstrapNativeRuntime(bootstrap,{runtime,system,nativeRuntime,profileCommitment:profileCommitment(system.adapterProfiles[0].profile)});
 assertNativeSessionEconomicMembershipV1(session,{runtime,system,account,owner});assertNativeActorEconomicMembershipV1(actor,{session,account,owner});
 assertNativeDeviceTransportEconomicMembershipV1(transport,{actor,session,account});
 // Existing legacy-funded runtimes cannot be relabelled as a different binary.
 // Reject before retiring HTTP or fencing any economic owner.
 assertOwnedNativeEconomicRuntimeRecoverableV1(runtime);assertOwnedNativeEconomicRuntimeRecoverableV1(nativeRuntime);
 const request=Object.freeze(Object.create(null)),entry={authority,input,fenced:[],fenceError:null,transportFenced:false};requests.set(request,entry);
 try{
   fenceOriginalNativeDeviceTransportRecoveryV1(transport,authority);entry.transportFenced=true;
   for(const [section,work]of[
     ['actor',()=>fenceOriginalNativeActorEconomicRecoveryV1(actor,authority)],
     ['session',()=>fenceOriginalNativeSessionEconomicRecoveryV1(session,authority)],
     ['account',()=>fenceOriginalNativeAccountEconomicRecoveryV1(account,authority)],
     ['executor',()=>fenceOriginalNativeExecutionEconomicRecoveryV1(nativeExecution,authority)],
     ['provider',()=>fenceOriginalNativeProviderEconomicRecoveryV1(providerCustody,authority)],
     ['owner',()=>fenceOriginalNativeOwnerEconomicRecoveryV1(owner,authority)],
     ['bootstrap',()=>fenceOriginalNativeBootstrapEconomicRecoveryV1(bootstrap,authority)],
     ['system',()=>fenceOriginalNativeSystemEconomicRecoveryV1(runtime,system,authority)],
     ['graphNative',()=>fenceOwnedNativeEconomicRuntimeV1(nativeRuntime,authority)],
     ['receiver',()=>fenceOwnedNativeEconomicRuntimeV1(runtime,authority)]]){work();entry.fenced.push(section);}
 }catch(error){entry.fenceError=error;}
 // The issuer owns subsequent cleanup even after a partial synchronous fence.
 return retainNativeEconomicRecoveryV1(authority,request);
}
export function captureNativeValueLiveArmedRecoveryV1(authority,raw){
 assert.equal(arguments.length,2);exactRecord(raw,['runtime','nativeRuntime','bootstrap','system','providerCustody','owner','nativeExecution','account','session','actor','transport','executionBridge','clock','liveProducer']);
 const {executionBridge,clock,liveProducer,...input}=raw,identity=assertNativeLiveArmedRecoveryCaptureV1(authority);
 const {runtime,system,owner,account,nativeExecution,bootstrap,nativeRuntime,providerCustody,session,actor,transport}=input;
 assert.equal(nativeValueOriginalRecoverySourceV1(runtime,system),identity.sourceSHA256,'NATIVE_ECONOMIC_ORIGINAL_SOURCE');
 assertOwnedNativeValueAccountAuthority(account,{runtime,system,poolIndex:0,owner});assertNativeLiveArmedAccountCaptureV1(account,authority);
 assertOwnedNativeValueExecution(nativeExecution,{runtime,system,poolIndex:0});assertOwnedNativeValueOwnerProcess(owner,{runtime,system,poolIndex:0});
 assertOwnedNativeValueProviderCustody(providerCustody,{runtime,system,poolIndex:0});assertNativeValueOperatorBootstrapForSystem(bootstrap,{runtime,system});
 assert.equal(system.adapterProfiles.length,1,'NATIVE_ECONOMIC_FIXED_EVM_PROFILE');
 assertNativeValueBootstrapNativeRuntime(bootstrap,{runtime,system,nativeRuntime,profileCommitment:profileCommitment(system.adapterProfiles[0].profile)});
 assertNativeSessionEconomicMembershipV1(session,{runtime,system,account,owner});assertNativeActorEconomicMembershipV1(actor,{session,account,owner});
 assertNativeDeviceTransportEconomicMembershipV1(transport,{actor,session,account});assertOriginalNativeDeviceLiveArmedObservedClockV1(clock,{runtime,nativeRuntime});
 assertOriginalNativeDeviceLiveRecoveryProducerV1(liveProducer,{account,executionBridge,runtime,system,nativeRuntime,clock});
 const request=Object.freeze(Object.create(null)),entry={authority,input,fenced:[],fenceError:null,transportFenced:false};requests.set(request,entry);
 const liveStop=liveProducer.close();liveStop.catch(()=>{});
 try{fenceOriginalNativeDeviceTransportRecoveryV1(transport,authority);entry.transportFenced=true;}catch(error){entry.fenceError=error;}
 return (async()=>{
  try{await liveStop;quiesceOriginalNativeDeviceLiveArmedObservedClockV1(clock);if(entry.fenceError)throw entry.fenceError;
   // No timer or HTTP admission survives the above synchronous fences. The
   // already admitted original lease has drained before any section is sealed.
   for(const [section,work]of[
    ['actor',()=>fenceOriginalNativeActorEconomicRecoveryV1(actor,authority)],
    ['session',()=>fenceOriginalNativeSessionEconomicRecoveryV1(session,authority)],
    ['account',()=>fenceOriginalNativeAccountEconomicRecoveryV1(account,authority)],
    ['executor',()=>fenceOriginalNativeExecutionEconomicRecoveryV1(nativeExecution,authority)],
    ['provider',()=>fenceOriginalNativeProviderEconomicRecoveryV1(providerCustody,authority)],
    ['owner',()=>fenceOriginalNativeOwnerEconomicRecoveryV1(owner,authority)],
    ['bootstrap',()=>fenceOriginalNativeBootstrapEconomicRecoveryV1(bootstrap,authority)],
    ['system',()=>fenceOriginalNativeSystemEconomicRecoveryV1(runtime,system,authority)],
    ['graphNative',()=>fenceLiveRuntime(nativeRuntime,authority)],['receiver',()=>fenceLiveRuntime(runtime,authority)]]){work();entry.fenced.push(section);}
  }catch(error){entry.fenceError??=error;}
  return retainNativeLiveArmedRecoveryV1(authority,request);
 })();
}
function fenceLiveRuntime(runtime,authority){return liveRuntimeFence(runtime,authority);}
export function consumeNativeEconomicCaptureRequestV1(request,authority){
 assert.equal(arguments.length,2);const entry=requests.get(request);assert.ok(entry&&entry.authority===authority,'NATIVE_ECONOMIC_ORIGINAL_CAPTURE_REQUEST');
 requests.delete(request);return entry;
}
