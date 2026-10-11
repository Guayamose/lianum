import {assertOriginalNativeSourceObservedClockV1} from './native-original-source-observed-clock-v1.mjs';
/** Fixed live-process cutoff producer. Clock observation is data, never
 * permission. Only a fresh device-armed original S can cause original F work.
 * This producer never executes native delivery or Native10 capture/reopen. Existing explicit execution permissions remain separate. */
import assert from 'node:assert/strict';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {assertOwnedNativeValueAccountAuthority,createDeviceOwnerLiveRecoveryLeaseV1,createOriginalNativeSourceLiveRecoveryLeaseV1,
 tickDeviceOwnerLiveRecoveryLeaseV1,closeDeviceOwnerLiveRecoveryLeaseV1} from '../../accounts/authority/native-value-account-authority-v2.mjs';
import {assertDeviceOwnerExecutionBridgeV1} from '../../accounts/authority/device-owner-execution-bridge-v1.mjs';
import {assertOriginalNativeDeviceLocalObservedClockV1} from './native-device-local-observed-clock-v1.mjs';
const producers=new WeakMap();
export function assertOriginalNativeDeviceLiveRecoveryProducerV1(producer,input){
 assert.equal(arguments.length,2);exactRecord(input,['account','executionBridge','runtime','system','nativeRuntime','clock']);const state=producers.get(producer);
 assert.ok(state&&!state.closed(),'DEVICE_LIVE_RECOVERY_ORIGINAL_PRODUCER');for(const key of Object.keys(input))assert.equal(input[key],state.input[key],'DEVICE_LIVE_RECOVERY_ORIGINAL_REFERENCES');
}
export function createOriginalNativeDeviceLiveRecoveryProducerV1(input){
 assert.equal(arguments.length,1);return originalLiveRecoveryProducer(input,false);
}
export function createOriginalNativeSourceLiveRecoveryProducerV1(input){
 assert.equal(arguments.length,1);return originalLiveRecoveryProducer(input,true);
}
function originalLiveRecoveryProducer(input,source){
 exactRecord(input,['account','executionBridge','runtime','system','nativeRuntime','clock']);
 const {account,executionBridge,runtime,system,nativeRuntime,clock}=input;
 assertOwnedNativeValueAccountAuthority(account,{runtime,system,poolIndex:0});assertDeviceOwnerExecutionBridgeV1(executionBridge,account);
 (source?assertOriginalNativeSourceObservedClockV1:assertOriginalNativeDeviceLocalObservedClockV1)(clock,{runtime,nativeRuntime});
 const lease=(source?createOriginalNativeSourceLiveRecoveryLeaseV1:createDeviceOwnerLiveRecoveryLeaseV1)(account,executionBridge,clock,nativeRuntime);
 let closed=false,active=null,timer=null,lastCode=null;
 const poll=async()=>{
   if(closed)return;
   active=tickDeviceOwnerLiveRecoveryLeaseV1(lease);
   try{await active;lastCode=null;}catch(error){lastCode=/^[A-Z0-9_]{1,100}$/.exec(error.code??'')?.[0]===error.code?error.code:'DEVICE_LIVE_RECOVERY_OBSERVATION_UNRESOLVED';}
   finally{active=null;if(!closed)timer=setTimeout(poll,1000);}
 };
 timer=setTimeout(poll,1000); // owned referenced timer; no detached/unref work
 let closing;
 const producer=Object.freeze({profile:source?'ORIGINAL_NATIVE_SOURCE_LIVE_CUTOFF_RECOVERY_V1':'ORIGINAL_DEVICE_LIVE_CUTOFF_RECOVERY_V1',automaticFunding:false,automaticNativeDelivery:false,
   postCutoffRestartEstablished:false,
   status(){assert.equal(arguments.length,0);return Object.freeze({closed,lastCode});},
   close(){assert.equal(arguments.length,0);closed=true;if(timer)clearTimeout(timer);timer=null;
     const original=closeDeviceOwnerLiveRecoveryLeaseV1(lease); // synchronous admission fence before any await
     return closing??=(async()=>{const results=await Promise.allSettled([original,active].filter(Boolean));
       const failures=results.filter(row=>row.status==='rejected').map(row=>row.reason);if(failures.length)throw new AggregateError(failures,'DEVICE_LIVE_RECOVERY_CLOSE_UNCONFIRMED');
       return{closed:true,originalWorkSettled:true};})();},
 });producers.set(producer,{input:Object.freeze({...input}),closed:()=>closed});return producer;
}
