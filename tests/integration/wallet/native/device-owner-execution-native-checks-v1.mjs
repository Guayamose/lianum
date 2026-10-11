/** Read-only check of the same fixed local native inclusion schedule. This
 * cannot advance a native clock, renew windows, dispatch or create authority. */
import assert from 'node:assert/strict';
import {normalizeDeviceOutputBalanceV1} from '@lianum/mobile-protocol/device-output-balance-v1';
import {decodeStatement,joinReadiness} from '@lianum/components/encoding/statements';
import {assertOwnedLocalEvmNativeValueV1} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
/** Both fixed DEVICE continuations include one I84 receipt before N0. Compare
 * canonical digest strings directly; these bare hashes are not decimal numbers. */
export function assertDeviceFinalOriginalReceiptTreeV1(view,executionSnapshot){
 assert.equal(arguments.length,2);assert.ok(Array.isArray(view.receiptLeaves));
 assert.equal(view.receiptLeaves.length,64,'DEVICE_FINAL_RECEIPT_TREE_CAPACITY');
 assert.equal(view.state.receiptCount,'1','DEVICE_FINAL_ORIGINAL_RECEIPT_COUNT');
 assert.equal(executionSnapshot.admittedReceipts,1,'DEVICE_FINAL_EXECUTOR_RECEIPT_COUNT');
 for(const leaf of view.receiptLeaves)assert.match(leaf,/^[0-9a-f]{64}$/,'DEVICE_FINAL_RECEIPT_DIGEST');
 const tree=view.receiptTree;assert.ok(tree,'DEVICE_FINAL_AUTHENTICATED_RECEIPT_TREE_REQUIRED');
 assert.equal(tree.count,1,'DEVICE_FINAL_RECEIPT_TREE_COUNT');
 assert.equal(tree.leafCount,1,'DEVICE_FINAL_RECEIPT_TREE_COUNT');
 assert.equal(tree.root,view.state.receiptRoot,'DEVICE_FINAL_RECEIPT_TREE_ROOT');
 assert.deepEqual(tree.leaves,view.receiptLeaves,'DEVICE_FINAL_RECEIPT_TREE_LEAVES');
 assert.match(tree.emptyLeaf,/^[0-9a-f]{64}$/,'DEVICE_FINAL_TYPED_RECEIPT_EMPTY_LEAF');
 const zero='0'.repeat(64);
 assert.notEqual(tree.emptyLeaf,zero,'DEVICE_FINAL_TYPED_RECEIPT_EMPTY_LEAF');
 assert.notEqual(view.receiptLeaves[0],zero,'DEVICE_FINAL_ORIGINAL_RECEIPT_REQUIRED');
 assert.notEqual(view.receiptLeaves[0],tree.emptyLeaf,'DEVICE_FINAL_ORIGINAL_RECEIPT_REQUIRED');
 assert.ok(view.receiptLeaves.slice(1).every(leaf=>leaf===tree.emptyLeaf),'DEVICE_FINAL_RECEIPT_TREE_PADDING');
}
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

/** Receipt checks for the fixed original READs in happy12/F9. Historical
 * response parsing cannot issue a capability or refresh its 15-second lifetime. */
export function assertDeviceOwnerOutputBalanceReadsV1(result,recovery){
 assert.equal(arguments.length,2);assert.equal(typeof recovery,'boolean');
 const evidence=result.deviceOutputBalances;assert.equal(evidence.profile,'LIANUM_DEVICE_ORIGINAL_OUTPUT_BALANCE_READS_V1');
 assert.equal(evidence.terminalReopenAvailableUnknown,true);assert.equal(evidence.finalReopenAvailableUnknown,true);
 const phases=recovery?['after-S','after-F','after-W39-change','after-W39-recovery','after-final-reopen']
  :['after-S','after-T','after-W39-change','after-final-reopen'];
 assert.deepEqual(evidence.reads.map(row=>row.phase),phases);
 const counts=recovery?[3,7,8,9,9]:[3,11,12,12],first=normalizeDeviceOutputBalanceV1(evidence.reads[0].response);
 for(const [index,row]of evidence.reads.entries()){
  const value=normalizeDeviceOutputBalanceV1(row.response),afterChange=index>=2,afterRecovery=recovery&&index>=3;
  assert.equal(value.parentJobId,result.deviceReservation.jobId);assert.equal(value.rootId,result.deviceCustody.sameRoot);
  assert.equal(value.sourceNullifier,result.deviceNote.observation.nullifier);assert.equal(value.sourceNullifierSpent,true);
  assert.equal(value.reservationTransactionHash,result.deviceReservation.observation.transactionHash);
  assert.equal(value.nativeBindingSHA256,result.deviceNative.nativeBindingSHA256);
  for(const name of ['origin','pairingId','devicePublicKey','assetId','pool'])assert.equal(value[name],first[name]);
  assert.deepEqual(value.poolTerms,first.poolTerms);assert.equal(value.nativeOutcome,index===0?null:recovery?'RECOVERED':'FULFILLED');
  assert.equal(value.change.state,afterChange?'SPENT':'UNSPENT');
  assert.equal(value.recovery.state,!recovery||index===0?'LOCKED':afterRecovery?'SPENT':'UNSPENT');
  assert.deepEqual(row.countsBefore,row.countsAfter);assert.equal(row.countsBefore.proofs,counts[index]);
  for(const n of Object.values(row.countsBefore))assert.ok(Number.isSafeInteger(n)&&n>=0);
  assert.ok(Number.isSafeInteger(row.encryptedWritesBefore)&&row.encryptedWritesBefore>=0);
  assert.equal(row.encryptedWritesAfter,row.encryptedWritesBefore);assert.equal(row.originalHeadAndLedgerMatched,true);
  assert.equal(row.repeatedApplyNoWrites,true);assert.equal(row.originalReadPosts,1);
  let available=0n,complete=true;
  for(const [role,amount]of[['change','400'],['recovery','100']]){const note=value[role],local=row.local[role];
   assert.equal(note.commitment,result.deviceCustody[role+'Commitment']);assert.equal(note.nullifier,first[role].nullifier);
   assert.equal(note.amount,amount);assert.equal(local.commitment,note.commitment);assert.equal(local.amount,amount);
   const expected=note.state==='UNSPENT'?amount:note.state==='SPENT'?'0':null;
   assert.equal(local.availableBalance,expected);assert.equal(local.state,note.state==='SPENT'?'WITHDRAWN':note.state);
   assert.equal(local.freshness,'OBSERVED_AT_RETAINED_HEAD');
   assert.deepEqual(local.observation,{headHash:value.observed.blockHash,expiresAt:value.expiresAt});
   if(expected===null)complete=false;else available+=BigInt(expected);
   if(note.state==='SPENT'){const exit=role==='change'?result.deviceExit:result.deviceRecoveryExits[1];
    assert.equal(note.nullifier,exit.statement.nullifier);assert.equal(local.withdrawnAmount,amount);
    assert.equal(local.withdrawalTransactionHash,exit.observation.transactionHash);
   }else{assert.equal(local.withdrawnAmount,null);assert.equal(local.withdrawalTransactionHash,null);}
  }
  assert.equal(row.sameAssetAvailableAtomic,complete?available.toString():null);
 }
}
