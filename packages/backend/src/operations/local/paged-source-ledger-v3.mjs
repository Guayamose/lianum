/** Read-only mechanics beneath the original deployed Paged owner. The pool
 * has no public nodes getter: reconstruct its fixed ledger from actual logs,
 * then join every leaf to the count/root read at the same canonical head. */
import assert from 'node:assert/strict';
import {noteNodeHash} from '@lianum/engine/notes/private-note-tree';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
const ZERO='0x'+'00'.repeat(32);
const TOPIC='0x'+publicKeccak256(Buffer.from('NoteInserted(bytes32,uint32)')).toString('hex');
export async function readPagedSourceLedgerV3(runtime,pool,call,head){
 const count=Number(BigInt(await call('pool','leafCount()',[],head.number)));
 assert.ok(Number.isSafeInteger(count)&&count>=0&&count<=256,'PAGED_LEDGER_CAPACITY');
 const leaves=Array(count).fill(null),seen=new Set(),records=runtime.receipts;
 assert.ok(Array.isArray(records)&&records.length<=100000,'PAGED_LEDGER_RECEIPT_BOUND');
 for(const row of records){
  const receipt=row.receipt;
  assert.ok(receipt&&row.transactionHash===receipt.transactionHash,'PAGED_LEDGER_ORIGINAL_RECEIPT_ROW');
  if(BigInt(receipt.blockNumber)>BigInt(head.number))continue;
  const logs=receipt.logs.filter(log=>log.address===pool&&log.topics[0]===TOPIC);
  if(!logs.length)continue;
  assert.equal(receipt.status,'0x1','PAGED_LEDGER_REVERTED_RECEIPT');
  await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);
  for(const log of logs){
   assert.equal(log.removed===true,false,'PAGED_LEDGER_REMOVED_LOG');
   assert.equal(log.transactionHash,receipt.transactionHash,'PAGED_LEDGER_TRANSACTION');
   assert.equal(log.blockHash,receipt.blockHash,'PAGED_LEDGER_BLOCK');
   assert.equal(BigInt(log.blockNumber),BigInt(receipt.blockNumber),'PAGED_LEDGER_BLOCK_NUMBER');
   assert.equal(BigInt(log.transactionIndex),BigInt(receipt.transactionIndex),'PAGED_LEDGER_TRANSACTION_INDEX');
   assert.equal(log.topics.length,2,'PAGED_LEDGER_TOPICS');
   const commitment=log.topics[1];assert.match(commitment,/^0x[0-9a-f]{64}$/,'PAGED_LEDGER_COMMITMENT');
   assert.notEqual(commitment,ZERO,'PAGED_LEDGER_ZERO_COMMITMENT');
   assert.match(log.data,/^0x0{56}[0-9a-f]{8}$/,'PAGED_LEDGER_INDEX_ENCODING');
   const index=Number(BigInt(log.data));
   assert.ok(index<count&&leaves[index]===null&&!seen.has(commitment),'PAGED_LEDGER_DUPLICATE_OR_FOREIGN_LEAF');
   leaves[index]=commitment;seen.add(commitment);
  }
 }
 assert.ok(leaves.every(leaf=>leaf!==null),'PAGED_LEDGER_INCOMPLETE_HISTORY');
 let level=[...leaves,...Array(256-count).fill(ZERO)];
 while(level.length>1)level=Array.from({length:level.length/2},(_,i)=>noteNodeHash(level[2*i],level[2*i+1]));
 const root=await call('pool','currentRoot()',[],head.number);
 assert.equal(root,level[0],'PAGED_LEDGER_ROOT_CHANGED');await runtime.assertCanonical(head);
 return Object.freeze({leaves:Object.freeze(leaves),root});
}
