/** Read-only check of the same fixed local native inclusion schedule. This
 * cannot advance a native clock, renew windows, dispatch or create authority. */
import assert from 'node:assert/strict';
import {decodeStatement,joinReadiness} from '../../../../packages/backend/src/execution/encoding/statements.mjs';
import {assertOwnedLocalEvmNativeValueV1} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
export async function assertDeviceOwnerNativeInclusionV1({runtime,nativeRuntime,reader,result,retainedProofs,detail,save}){
 if(detail.stage!=='dispatch-native-leg-0')return;
 assert.equal(detail.reference,result.deviceReservation.jobId);assert.equal(result.deviceNativeClock,undefined);
 const sync=result.deviceNativeClock={phase:'checking',nativeClockChanged:false,originalWindowsChanged:false};save();
 await assertOwnedLocalEvmNativeValueV1(nativeRuntime);assert.equal(nativeRuntime.transactions.length,0);
 assert.deepEqual(nativeRuntime.mutationStatus,{busy:false,uncertain:false});
 const dependency=retainedProofs.get('leg-0-dependency'),readiness=retainedProofs.get('leg-0-readiness');assert.ok(dependency&&readiness);
 const p=decodeStatement('dependency',dependency.publicInputs),r=decodeStatement('ready',readiness.publicInputs);joinReadiness(p,r);
 const view=await reader.read({domainCommitment:r.domainCommitment,authorizationRoot:r.authorizationRoot,checkpoint:r.checkpoint}),checkpoint=view.dispatch.checkpointSnapshot;
 assert.equal(view.head.timestamp,r.readyFrom);assert.equal(checkpoint.timestamp,r.readyFrom);
 assert.deepEqual({...view.snapshot,timestamp:checkpoint.timestamp},checkpoint);
 const head=await nativeRuntime.block(),before=BigInt(head.timestamp),next=before+1n;
 assert.equal(BigInt(head.number),0n);assert.equal(before.toString(),result.deviceClockAlignment.nativeSecond);
 assert.equal(r.readyFrom,next.toString(),'DEVICE_NATIVE_ORIGINAL_THREE_SOURCE_BLOCKS');
 assert.ok(BigInt(r.readyFrom)<=next&&next<BigInt(r.readyUntil));
 assert.ok(next<BigInt(result.deviceReservation.statement.settleBefore));
 await reader.assertCurrent(view);assert.deepEqual(await nativeRuntime.block(),head);assert.equal(nativeRuntime.transactions.length,0);
 Object.assign(sync,{phase:'completed',nativeHeadBefore:before.toString(),nativeHeadAfter:before.toString(),receiverCheckpointSecond:view.head.timestamp,
  originalReadyFrom:r.readyFrom,originalReadyUntil:r.readyUntil,plannedNativeInclusion:next.toString(),originalProofsUnchanged:true});save();
}
