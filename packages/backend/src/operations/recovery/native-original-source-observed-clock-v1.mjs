/** Original SOURCE clock, coupled to the same two authentic restored runtimes.
 * Host time is observed; original cutoffs and leases are never reset. */
import assert from 'node:assert/strict';
import {exactRecord} from '../../execution/encoding/commitments.mjs';
import {observedNativeValueReceiverSecond} from '../../chains/shared/health/native-value-observed-clock-v1.mjs';
import {assertOwnedNativeDurableSourceReceiverV1,assertOwnedNativeDurableSourceGraphRuntimeV1,readOwnedNativeDurableSourceClockPairV1,refreshNativeValueReceiverClock,refreshOwnedNativeEconomicObservedGraphClockV2} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {assertOriginalNativeSourceCapsuleV1,createOriginalNativeSourceClockPairV1,readOriginalNativeSourceClockCheckpointV1,retainOriginalNativeSourceClockCheckpointV1} from './native-original-source-capsule-v1.mjs';
const clocks=new WeakMap();
function original(clock){const state=clocks.get(clock);assert.ok(state&&!state.closed,'NATIVE_SOURCE_ORIGINAL_CLOCK');assertOriginalNativeSourceCapsuleV1(state.authority);assertOwnedNativeDurableSourceReceiverV1(state.runtime);assertOwnedNativeDurableSourceGraphRuntimeV1(state.nativeRuntime);readOwnedNativeDurableSourceClockPairV1(state.runtime,state.nativeRuntime);return state;}
export function assertOriginalNativeSourceObservedClockV1(clock,input){assert.equal(arguments.length,2);exactRecord(input,['runtime','nativeRuntime']);const state=original(clock);assert.equal(input.runtime,state.runtime);assert.equal(input.nativeRuntime,state.nativeRuntime);return true;}
export function readOriginalNativeSourceClockReferencesV1(clock){assert.equal(arguments.length,1);const state=original(clock);return Object.freeze({runtime:state.runtime,nativeRuntime:state.nativeRuntime});}
export function snapshotOriginalNativeSourceObservedClockV1(clock){assert.equal(arguments.length,1);return original(clock).lastObservedSecond;}
export function refreshOriginalNativeSourceObservedClockV1(clock){assert.equal(arguments.length,1);const state=original(clock);assert.equal(state.closing,null,'NATIVE_SOURCE_CLOCK_CLOSING');assert.equal(state.pending,null,'NATIVE_SOURCE_CLOCK_BUSY');
 const work=(async()=>{await refreshOwnedNativeEconomicObservedGraphClockV2(state.nativeRuntime);original(clock);await refreshNativeValueReceiverClock(state.runtime);original(clock);
  const native=await state.nativeRuntime.block(),receiver=await state.runtime.block(),now=observedNativeValueReceiverSecond(state.lastObservedSecond,String(Date.now()));original(clock);
  assert.ok(BigInt(native.timestamp)<=now&&BigInt(receiver.timestamp)<=now,'NATIVE_SOURCE_CLOCK_FUTURE');assert.ok(BigInt(receiver.timestamp)>=BigInt(native.timestamp),'NATIVE_SOURCE_CLOCK_PAIR_ORDER');
  await state.nativeRuntime.assertCanonical(native);await state.runtime.assertCanonical(receiver);assert.deepEqual(await state.nativeRuntime.block(),native);assert.deepEqual(await state.runtime.block(),receiver);original(clock);
  state.lastObservedSecond=now.toString();await retainOriginalNativeSourceClockCheckpointV1(state.authority,clock);original(clock);return Object.freeze({native:Object.freeze({...native}),receiver:Object.freeze({...receiver})});
 })();state.pending=work;return work.finally(()=>{if(state.pending===work)state.pending=null;});
}
function build(authority,runtime,nativeRuntime,second){assertOriginalNativeSourceCapsuleV1(authority);const clock=Object.freeze(Object.create(null)),state={authority,runtime,nativeRuntime,lastObservedSecond:second,closed:false,pending:null,closing:null};clocks.set(clock,state);original(clock);
 function close(){assert.equal(arguments.length,0);if(state.closing)return state.closing;const pending=state.pending;
  return state.closing=(async()=>{const errors=[];if(pending)try{await pending;}catch(error){errors.push(error);}state.closed=true;for(const resource of [nativeRuntime,runtime])try{const stopped=await resource.close({removeScratch:false});assert.equal(stopped.stopped,true);assert.equal(resource.lifecycle.findLast(row=>row.event==='stopped-owned-process')?.forced,false);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'NATIVE_SOURCE_CLOCK_CLOSE_UNCONFIRMED');return Object.freeze({closed:true,originalResourcesStopped:true});})();};
 return Object.freeze({runtime,nativeRuntime,clock,close});
}
export async function createOriginalNativeSourceObservedClocksV1(authority){assert.equal(arguments.length,1);assertOriginalNativeSourceCapsuleV1(authority);const pair=await createOriginalNativeSourceClockPairV1(authority),joined=build(authority,pair.runtime,pair.nativeRuntime,'0');try{await refreshOriginalNativeSourceObservedClockV1(joined.clock);return joined;}catch(error){try{await joined.close();}catch{}throw error;}}
export function reopenOriginalNativeSourceObservedClocksV1(authority,input){assert.equal(arguments.length,2);exactRecord(input,['runtime','nativeRuntime']);const second=readOriginalNativeSourceClockCheckpointV1(authority);assert.ok(/^[1-9][0-9]{0,19}$/.exec(second)?.[0]===second,'NATIVE_SOURCE_ORIGINAL_CLOCK_CHECKPOINT');return build(authority,input.runtime,input.nativeRuntime,second);}
