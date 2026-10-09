/** Real original controlled-node reorg probe; no financial authority from DTOs. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {rewindOriginalNativeFReorgProbeV1} from '../../../../packages/backend/src/execution/native-value/execution/native-value-execution-v2.mjs';
import {isOwnedOriginalNativeFReorgReceiverV1} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
export async function runOriginalDeviceFReorgStepV1(context){
 assert.equal(arguments.length,1);const {runtime,nativeRuntime,nativeExecution,nativeApi,outputApi,host,access,signed,jobId,result,stage,save,active}=context;
 assert.equal(isOwnedOriginalNativeFReorgReceiverV1(runtime),true);let vault=context.vault;
 const before=context.observed,old=before.terminal,oldReceipt=context.receipt;
 assert.equal(before.outcome,'RECOVERED');assert.equal(old.outcome,'RECOVERED');
 const entries=runtime.transactions.filter(row=>row.transactionHash===oldReceipt.transactionHash);assert.equal(entries.length,1);
 const entry=entries[0],wireSHA=createHash('sha256').update(entry.localSigned.nativeWire).digest('hex');
 const counts=()=>({proofs:result.proofs.length,receiver:runtime.transactions.length,native:nativeRuntime.transactions.length});
 const originalCounts=counts();assert.equal(originalCounts.proofs,7);
 await stage('device-original-F-exact-parent-reorg-with-retained-original-wire');
 const rewound=await rewindOriginalNativeFReorgProbeV1(nativeExecution,jobId);active();
 assert.equal(rewound.reverted,true);assert.equal(rewound.exactOriginalParent,true);assert.equal(rewound.originalTransactionAbsent,true);
 assert.equal(await runtime.receipt(oldReceipt.transactionHash),null);assert.equal(await runtime.transaction(oldReceipt.transactionHash),null);
 const pendingConsent=await nativeApi.challenge('RECONCILE_NATIVE',{...await access(nativeApi),jobId});
 const pending=await nativeApi.submit(signed(pendingConsent));assert.equal(pending.stage,'UNKNOWN');assert.equal(pending.outcome,null);assert.equal(pending.terminal,null);
 await vault.applyDeviceExecutionObservation(pending);
 assert.deepEqual(counts(),originalCounts);assert.equal(await runtime.receipt(oldReceipt.transactionHash),null);
 const localPending=await vault.readDeviceExecutionIntent();assert.equal(localPending.outcome,null);assert.equal(localPending.availableBalance,null);
 const subject=await vault.readDeviceOutputBalanceSubject(),permission=await access(outputApi),handle=await outputApi.observe({...permission,...subject});
 const outputs=host.outputBalance.readDeviceOutputBalanceV1(handle);assert.equal(outputs.nativeOutcome,null);
 for(const role of ['change','recovery']){assert.equal(outputs[role].state,'LOCKED');assert.equal(outputs[role].path,null);}
 // Device uncertainty is durably retained before the second fresh reconciliation.
 vault.close();vault=host.original.openLocalRootNoteVaultV1(result.deviceCustody.sameRoot);
 assert.equal((await vault.readDeviceExecutionIntent()).outcome,null);assert.equal((await vault.readDeviceNote()).availableBalance,null);
 await stage('device-original-F-reconciliation-after-durable-UNKNOWN');
 const consent=await nativeApi.challenge('RECONCILE_NATIVE',{...await access(nativeApi),jobId});
 const observed=await nativeApi.submit(signed(consent)),terminal=observed.terminal;active();
 assert.equal(observed.stage,'RECOVERED');assert.equal(observed.outcome,'RECOVERED');
 for(const name of ['transactionHash','calldataSHA256','outcome'])assert.equal(terminal[name],old[name]);
 assert.notEqual(terminal.blockHash,old.blockHash);assert.equal(terminal.blockNumber,old.blockNumber);
 const receipt=await runtime.receipt('0x'+terminal.transactionHash);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);
 assert.equal(receipt.status,'0x1');assert.equal(receipt.blockHash,'0x'+terminal.blockHash);assert.equal(receipt.to,oldReceipt.to);
 await vault.applyDeviceExecutionTerminal(observed);assert.deepEqual(counts(),originalCounts);
 const actual=runtime.transactions.filter(row=>row.transactionHash===receipt.transactionHash);assert.equal(actual.length,1);
 assert.equal(createHash('sha256').update(actual[0].localSigned.nativeWire).digest('hex'),wireSHA);
 assert.equal(actual[0].nativeFReorg.phase,'RECONFIRMED');assert.deepEqual(actual[0].nativeFReorg.originalReceipt,oldReceipt);
 assert.deepEqual(actual[0].nativeFReorg.receipt,receipt);
 // The native snapshot is original and consumed; no second chain rollback exists.
 await assert.rejects(rewindOriginalNativeFReorgProbeV1(nativeExecution,jobId));assert.deepEqual(counts(),originalCounts);
 result.originalFReorg={format:'ORIGINAL_DEVICE_F_REORG_RECONFIRMATION_V1',scope:'EXACT_ORIGINAL_BEFORE_F_PARENT_ONLY',
  originalJobId:jobId,nativeBindingSHA256:observed.nativeBindingSHA256,originalSHash:result.deviceReservation.observation.transactionHash,
  oldTerminal:old,newTerminal:terminal,oldReceipt,newReceipt:receipt,probe:rewound,
  originalWireSHA256:wireSHA,sameWire:true,uniqueOriginalTransactionCount:1,originalEmissionCount:1,reemissionCount:1,
  invalidatedBeforeReemission:true,deviceUnknownDurable:true,bothOutputsUnavailableWhileUnknown:true,
  freshReconcilePermissions:2,newEconomicPermissions:0,newNativeTransactionSignatures:0,newProofs:0,
  countsBefore:originalCounts,countsAfter:counts(),snapshotConsumed:true,deeperReorgSupported:false,publicNetwork:false};save();
 return{vault,observed,terminal,receipt};
}
