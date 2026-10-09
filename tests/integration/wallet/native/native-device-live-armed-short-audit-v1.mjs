/** Original read-only evidence; never an economic grant or restored facade. */
import assert from 'node:assert/strict';
import {readDeviceOwnerExecutionStatusV1,readDeviceOwnerRecoveryArmTermsV1} from '../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs';
import {createNativeValueSystemStateReader} from '../../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import {nativeValueOriginalRecoverySourceV1} from '../../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs';
export async function auditNativeDeviceLiveArmedShortV1(originals,service){
 assert.equal(arguments.length,2);const {runtime,nativeRuntime,system,account,owner}=originals;
 const reader=await createNativeValueSystemStateReader({runtime,system,poolIndex:0}),view=await reader.read();await reader.assertCurrent(view);
 const status=await readDeviceOwnerExecutionStatusV1(account,service.executionBridge,service.parentJobId),arm=await readDeviceOwnerRecoveryArmTermsV1(account,service.executionBridge,service.parentJobId);
 assert.equal(arm.state,'ARMED');assert.equal(status.outcome,null);assert.equal(status.terminal,null);assert.ok(BigInt(view.head.timestamp)<BigInt(arm.settleBefore));
 const ownerView=await account.ownerView(),linux=await owner.ownerView.summary();assert.equal(ownerView.balances.available,'0');assert.equal(linux.notes.source.status,'UNISSUED');assert.equal(nativeRuntime.transactions.length,0);
 await reader.assertCurrent(view);return{profile:'ORIGINAL_NATIVE_LIVE_ARMED_SHORT_AUDIT_V1',processId:process.pid,sourceSHA256:nativeValueOriginalRecoverySourceV1(runtime,system),
  head:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},counts:{receiver:runtime.transactions.length,native:nativeRuntime.transactions.length},
  ledger:{publicState:view.ledger.publicState,commitments:view.ledger.commitments,nullifiers:view.ledger.nullifiers},status,arm,linuxSourceStatus:linux.notes.source.status,linuxAvailable:ownerView.balances.available};
}
