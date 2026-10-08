/** Read-only evidence inside the NEW genuine backend realm. Never an HTTP
 * capability, SQL projection, witness parser or replacement economic reader. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {nativeValueOriginalRecoverySourceV1} from '../../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs';
import {readDeviceOwnerExecutionStatusV1,readOriginalNativeDeviceEconomicProofsV1} from '../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs';
import {createNativeValueSystemStateReader} from '../../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import {decodeNativeValueTerminalCalldata} from '../../../../packages/backend/src/execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs';
import {assertDeviceFinalOriginalReceiptTreeV1} from './device-owner-execution-native-checks-v1.mjs';
const bare=s=>s.startsWith('0x')?s.slice(2):s,sha=b=>createHash('sha256').update(b).digest('hex');
export async function auditNativeDeviceEconomicSuccessorV1(originals,service){
 assert.equal(arguments.length,2);const{runtime,nativeRuntime,system,owner,account,nativeExecution}=originals;
 const sourceSHA256=nativeValueOriginalRecoverySourceV1(runtime,system),status=await readDeviceOwnerExecutionStatusV1(account,service.executionBridge,service.parentJobId);
 assert.equal(status.outcome,'RECOVERED');assert.equal(status.executionSnapshot.outcome,'RECOVERED');
 const reader=await createNativeValueSystemStateReader({runtime,system,poolIndex:0}),view=await reader.read();
 await reader.assertCurrent(view);assertDeviceFinalOriginalReceiptTreeV1(view,status.executionSnapshot);
 const terminal=status.terminal,receipt=await runtime.receipt('0x'+terminal.transactionHash);assert.ok(receipt);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);
 const rows=runtime.transactions.filter(row=>row.transactionHash===receipt.transactionHash);assert.equal(rows.length,1);const wire=rows[0];
 assert.equal(wire.request.to,system.pools[0].address);assert.equal(sha(Buffer.from(wire.request.data.slice(2),'hex')),terminal.calldataSHA256);
 const decoded=decodeNativeValueTerminalCalldata(wire.request.data);assert.equal(decoded.kind,'recovery');
 const nativeWires=nativeRuntime.transactions;assert.equal(nativeWires.length,1);const nativeWire=nativeWires[0];
 assert.equal(nativeWire.phase,'mined');assert.equal(BigInt(nativeWire.request.value),1000000n);await nativeRuntime.checkReceipt(nativeWire.receipt);await nativeRuntime.assertCanonical(nativeWire.receipt);
 const exits=await readOriginalNativeDeviceEconomicProofsV1(account),exitRows=[];
 for(const row of exits){let exitReceipt=null,exitWire=null;if(row.status.observation){exitReceipt=await runtime.receipt('0x'+row.status.observation.transactionHash);
   assert.ok(exitReceipt);await runtime.checkReceipt(exitReceipt);await runtime.assertCanonical(exitReceipt);
   const rows=runtime.transactions.filter(w=>w.transactionHash===exitReceipt.transactionHash);assert.equal(rows.length,1);exitWire=rows[0];
   assert.equal(sha(Buffer.from(exitWire.request.data.slice(2),'hex')),row.status.observation.calldataSHA256);}
   exitRows.push({...row,receipt:exitReceipt,wire:exitWire});}
 const summary=await owner.ownerView.summary(),accountView=await account.ownerView();assert.equal(summary.notes.source.status,'UNISSUED');assert.equal(accountView.balances.available,'0');
 const commitments=[status.reservation.statement.changeCommitment,status.reservation.statement.recoveryCommitment,status.reservation.statement.reserveCommitment],paths={};
 for(const cm of commitments){const index=view.ledger.commitments.indexOf('0x'+cm);if(index>=0){const p=view.ledger.tree.path(index);paths[cm]={root:bare(p.root),index:p.index,leaf:bare(p.leaf),siblings:p.siblings.map(bare)};}}
 await reader.assertCurrent(view);assert.equal(nativeValueOriginalRecoverySourceV1(runtime,system),sourceSHA256);
 return{profile:'ORIGINAL_NATIVE_ECONOMIC_SUCCESSOR_PUBLIC_AUDIT_V1',processId:process.pid,sourceSHA256,
   counts:{receiver:runtime.transactions.length,native:nativeRuntime.transactions.length},
   head:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},
   ledger:{publicState:view.ledger.publicState,commitments:view.ledger.commitments,nullifiers:view.ledger.nullifiers,paths},
   status,terminal:{receipt,wire,decoded},nativeWire,nativeBalances:{sender:String(await nativeRuntime.balance(nativeRuntime.accounts[0])),recipient:String(await nativeRuntime.balance(nativeRuntime.accounts[1]))},
   receiverRecipientBalance:String(await runtime.balance(runtime.accounts[3])),exits:exitRows,
   linuxSourceStatus:summary.notes.source.status,linuxAvailable:accountView.balances.available,originalReceiptTreeValid:true};
}
