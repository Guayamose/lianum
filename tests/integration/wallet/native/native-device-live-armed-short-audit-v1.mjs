/** Original read-only evidence; never an economic grant or restored facade. */
import assert from 'node:assert/strict';
import {readDeviceOwnerLiveArmedOriginalOwnerSnapshotV1,assertOwnedNativeValueAccountAuthority}
 from '../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs';
export async function auditNativeDeviceLiveArmedShortV1(originals,service){
 assert.equal(arguments.length,2);const {runtime,nativeRuntime,system,account,owner}=originals;
 assertOwnedNativeValueAccountAuthority(account,{runtime,system,owner,poolIndex:0});
 const snapshot=await readDeviceOwnerLiveArmedOriginalOwnerSnapshotV1(account,service.executionBridge,service.parentJobId);
 const {status,arm,ownerView,linuxSummary:linux}=snapshot;
 assert.equal(arm.state,'ARMED');assert.equal(status.outcome,null);assert.equal(status.terminal,null);
 assert.ok(BigInt(snapshot.head.timestamp)<BigInt(arm.settleBefore));
 assert.equal(ownerView.balances.available,'0');assert.equal(linux.notes.source.status,'UNISSUED');
 assert.equal(snapshot.counts.native,0);assert.equal(nativeRuntime.transactions.length,0);
 return{profile:'ORIGINAL_NATIVE_LIVE_ARMED_SHORT_AUDIT_V1',processId:process.pid,sourceSHA256:snapshot.sourceSHA256,
  head:snapshot.head,counts:snapshot.counts,ledger:snapshot.ledger,status,arm,
  linuxSourceStatus:linux.notes.source.status,linuxAvailable:ownerView.balances.available};
}
