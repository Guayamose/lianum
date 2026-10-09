/** New LIVE original economic clock pair, born before D26. Public headers
 * describe DATA; only the private token below grants access to these originals.
 * No caller time, cutoff, endpoint, signer, profile or restart is accepted. */
import assert from 'node:assert/strict';
import {createOwnedNativeEconomicObservedClockPairV2,assertOwnedNativeEconomicObservedReceiverV2,assertOwnedNativeEconomicObservedGraphRuntimeV2,refreshNativeValueReceiverClock,refreshOwnedNativeEconomicObservedGraphClockV2,createOwnedNativeLiveArmedObservedClockPairV1,assertOwnedNativeLiveArmedReceiverV1,assertOwnedNativeLiveArmedGraphRuntimeV1,bindOwnedNativeLiveArmedObservedClockPairV1,readOwnedNativeLiveArmedObservedClockPairV1} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {observedNativeValueReceiverSecond} from '../../chains/shared/health/native-value-observed-clock-v1.mjs';
import {readOriginalNativeLiveArmedClockCheckpointV1} from '../../accounts/authority/native-value-account-authority-v2.mjs';
const clocks=new WeakMap();
function original(clock){
 const state=clocks.get(clock);assert.ok(state&&!state.closed,'NATIVE_DEVICE_ORIGINAL_OBSERVED_CLOCK');
 if(state.liveArmed){assertOwnedNativeLiveArmedReceiverV1(state.runtime);assertOwnedNativeLiveArmedGraphRuntimeV1(state.nativeRuntime);readOwnedNativeLiveArmedObservedClockPairV1(state.runtime,state.nativeRuntime);}
 else{assertOwnedNativeEconomicObservedReceiverV2(state.runtime);assertOwnedNativeEconomicObservedGraphRuntimeV2(state.nativeRuntime);}return state;
}
export function assertOriginalNativeDeviceLocalObservedClockV1(clock,input){
 assert.equal(arguments.length,2,'NATIVE_DEVICE_OBSERVED_CLOCK_ARITY');const state=original(clock);
 assert.ok(input&&Object.getPrototypeOf(input)===Object.prototype);
 assert.deepEqual(Reflect.ownKeys(input).sort(),['nativeRuntime','runtime']);
 for(const key of ['runtime','nativeRuntime']){
  assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(input,key)??{},'value'));
  assert.equal(input[key],state[key],'NATIVE_DEVICE_OBSERVED_CLOCK_ORIGINAL_REFERENCES');
 }return true;
}
export function refreshOriginalNativeDeviceLocalObservedClockV1(clock){
 assert.equal(arguments.length,1,'NATIVE_DEVICE_OBSERVED_CLOCK_ARITY');const state=original(clock);
 assert.equal(state.pending,null,'NATIVE_DEVICE_OBSERVED_CLOCK_BUSY');
 const work=(async()=>{
  // Native finality continuation drains first. The receiver head sampled last
  // cannot precede that same original native clock; no certificate is reused.
  await refreshOwnedNativeEconomicObservedGraphClockV2(state.nativeRuntime);original(clock);
  await refreshNativeValueReceiverClock(state.runtime);original(clock);
  const native=await state.nativeRuntime.block(),receiver=await state.runtime.block();original(clock);
  const now=observedNativeValueReceiverSecond(state.lastObservedSecond,String(Date.now()));
  assert.ok(BigInt(native.timestamp)<=now&&BigInt(receiver.timestamp)<=now,'NATIVE_DEVICE_OBSERVED_CLOCK_FUTURE');
  assert.ok(BigInt(receiver.timestamp)>=BigInt(native.timestamp),'NATIVE_DEVICE_OBSERVED_CLOCK_PAIR_ORDER');
  await state.nativeRuntime.assertCanonical(native);await state.runtime.assertCanonical(receiver);original(clock);
  assert.deepEqual(await state.nativeRuntime.block(),native,'NATIVE_DEVICE_OBSERVED_NATIVE_HEAD_CHANGED');
  assert.deepEqual(await state.runtime.block(),receiver,'NATIVE_DEVICE_OBSERVED_RECEIVER_HEAD_CHANGED');original(clock);
  state.lastObservedSecond=now.toString();return Object.freeze({native:Object.freeze({...native}),receiver:Object.freeze({...receiver})});
 })();state.pending=work;
 return work.finally(()=>{if(state.pending===work)state.pending=null;});
}
async function stopOriginal(resource){
 const stopped=await resource.close({removeScratch:false});
 assert.equal(stopped.stopped,true,'NATIVE_DEVICE_OBSERVED_CLOCK_STOP_UNCONFIRMED');
 const events=resource.lifecycle.filter(row=>row.event==='stopped-owned-process');
 assert.equal(events.length,1,'NATIVE_DEVICE_OBSERVED_CLOCK_STOP_UNCONFIRMED');
 assert.equal(events[0].forced,false,'NATIVE_DEVICE_OBSERVED_CLOCK_STOP_UNCONFIRMED');return true;
}
export function createOriginalNativeDeviceLocalObservedClocksV1(){
 assert.equal(arguments.length,0,'NATIVE_DEVICE_OBSERVED_CLOCK_NO_OPTIONS');return createObservedClocks(false);
}
export function createOriginalNativeDeviceLiveArmedObservedClocksV1(){
 assert.equal(arguments.length,0,'NATIVE_DEVICE_OBSERVED_CLOCK_NO_OPTIONS');return createObservedClocks(true);
}
export function assertOriginalNativeDeviceLiveArmedObservedClockV1(clock,input){
 assert.equal(arguments.length,2);assertOriginalNativeDeviceLocalObservedClockV1(clock,input);assert.equal(original(clock).liveArmed,true,'NATIVE_LIVE_ARMED_ORIGINAL_CLOCK');
}
export function quiesceOriginalNativeDeviceLiveArmedObservedClockV1(clock){
 assert.equal(arguments.length,1);const state=original(clock);assert.equal(state.liveArmed,true);assert.equal(state.pending,null,'NATIVE_DEVICE_OBSERVED_CLOCK_BUSY');state.closed=true;
 return Object.freeze({closed:true,originalRuntimesRetainedForCapture:true});
}
export function captureOriginalNativeDeviceLiveArmedClockCheckpointV1(clock){
 assert.equal(arguments.length,1);const state=clocks.get(clock);assert.ok(state&&state.liveArmed&&state.closed&&state.pending===null,'NATIVE_LIVE_ARMED_ORIGINAL_QUIESCED_CLOCK');
 assert.ok(/^[1-9][0-9]{0,19}$/.test(state.lastObservedSecond),'NATIVE_LIVE_ARMED_ORIGINAL_OBSERVATION_REQUIRED');return state.lastObservedSecond;
}
export function reopenOriginalNativeDeviceLiveArmedObservedClocksV1(account,input){
 assert.equal(arguments.length,2);assert.ok(input&&Object.getPrototypeOf(input)===Object.prototype);assert.deepEqual(Reflect.ownKeys(input).sort(),['nativeRuntime','runtime']);
 for(const key of ['runtime','nativeRuntime'])assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(input,key)??{},'value'));
 const second=readOriginalNativeLiveArmedClockCheckpointV1(account,input.runtime);
 bindOwnedNativeLiveArmedObservedClockPairV1(input.runtime,input.nativeRuntime);return buildObservedClockPair(input.runtime,input.nativeRuntime,true,second);
}
function buildObservedClockPair(runtime,nativeRuntime,liveArmed,originalSecond='0'){
 const clock=Object.freeze(Object.create(null)),state={runtime,nativeRuntime,liveArmed,closed:false,pending:null,closing:null,lastObservedSecond:originalSecond};clocks.set(clock,state);original(clock);
 function close(){
  assert.equal(arguments.length,0,'NATIVE_DEVICE_OBSERVED_CLOCK_NO_OPTIONS');
  if(state.closing)return state.closing;state.closed=true;const pending=state.pending;
  state.closing=(async()=>{const failures=[];for(const resource of [nativeRuntime,runtime])try{await stopOriginal(resource);}catch(error){failures.push(error);}
   if(pending)try{await pending;}catch(error){failures.push(error);}
   if(failures.length)throw new AggregateError(failures,'NATIVE_DEVICE_OBSERVED_CLOCK_CLOSE_UNCONFIRMED');return Object.freeze({closed:true,originalResourcesStopped:true});})();return state.closing;
 }
 return Object.freeze({runtime,nativeRuntime,clock,close});
}
async function createObservedClocks(liveArmed){
 let runtime,nativeRuntime,state;
 try{
  if(liveArmed){const pair=await createOwnedNativeLiveArmedObservedClockPairV1();runtime=pair.receiver;nativeRuntime=pair.native;}
  else ({runtime,nativeRuntime}=await createOwnedNativeEconomicObservedClockPairV2());
  const pair=buildObservedClockPair(runtime,nativeRuntime,liveArmed);state=clocks.get(pair.clock);return pair;
 }catch(error){
  if(state)state.closed=true;const failures=[];
  for(const resource of [nativeRuntime,runtime])if(resource)try{await stopOriginal(resource);}catch(cleanup){failures.push(cleanup);}
  if(failures.length)throw new AggregateError([error,...failures],'NATIVE_DEVICE_OBSERVED_CLOCK_STARTUP_CLEANUP_FAILED',{cause:error});throw error;
 }
}
