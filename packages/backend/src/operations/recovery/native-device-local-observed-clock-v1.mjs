/** New LIVE original economic clock pair, born before D26. Public headers
 * describe DATA; only the private token below grants access to these originals.
 * No caller time, cutoff, endpoint, signer, profile or restart is accepted. */
import assert from 'node:assert/strict';
import {createOwnedNativeEconomicObservedClockPairV2,assertOwnedNativeEconomicObservedReceiverV2,assertOwnedNativeEconomicObservedGraphRuntimeV2,refreshNativeValueReceiverClock,refreshOwnedNativeEconomicObservedGraphClockV2} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {observedNativeValueReceiverSecond} from '../../chains/shared/health/native-value-observed-clock-v1.mjs';
const clocks=new WeakMap();
function original(clock){
 const state=clocks.get(clock);assert.ok(state&&!state.closed,'NATIVE_DEVICE_ORIGINAL_OBSERVED_CLOCK');
 assertOwnedNativeEconomicObservedReceiverV2(state.runtime);assertOwnedNativeEconomicObservedGraphRuntimeV2(state.nativeRuntime);return state;
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
export async function createOriginalNativeDeviceLocalObservedClocksV1(){
 assert.equal(arguments.length,0,'NATIVE_DEVICE_OBSERVED_CLOCK_NO_OPTIONS');
 let runtime,nativeRuntime,state;
 try{
  ({runtime,nativeRuntime}=await createOwnedNativeEconomicObservedClockPairV2());
  assertOwnedNativeEconomicObservedReceiverV2(runtime);assertOwnedNativeEconomicObservedGraphRuntimeV2(nativeRuntime);
  const clock=Object.freeze(Object.create(null));state={runtime,nativeRuntime,closed:false,pending:null,closing:null,lastObservedSecond:'0'};clocks.set(clock,state);
  function close(){
   assert.equal(arguments.length,0,'NATIVE_DEVICE_OBSERVED_CLOCK_NO_OPTIONS');
   if(state.closing)return state.closing;state.closed=true;
   const pending=state.pending;
   state.closing=(async()=>{
    const failures=[];
    // Original runtime close fences/cancels its private finality work before
    // draining it. Closing never waits for a fresh timestamp or new effect.
    for(const resource of [nativeRuntime,runtime])try{await stopOriginal(resource);}catch(error){failures.push(error);}
    if(pending)try{await pending;}catch(error){failures.push(error);}
    if(failures.length)throw new AggregateError(failures,'NATIVE_DEVICE_OBSERVED_CLOCK_CLOSE_UNCONFIRMED');
    return Object.freeze({closed:true,originalResourcesStopped:true});
   })();return state.closing;
  }
  return Object.freeze({runtime,nativeRuntime,clock,close});
 }catch(error){
  if(state)state.closed=true;const failures=[];
  for(const resource of [nativeRuntime,runtime])if(resource)try{await stopOriginal(resource);}catch(cleanup){failures.push(cleanup);}
  if(failures.length)throw new AggregateError([error,...failures],'NATIVE_DEVICE_OBSERVED_CLOCK_STARTUP_CLEANUP_FAILED',{cause:error});throw error;
 }
}
