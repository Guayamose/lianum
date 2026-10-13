/** Original log mechanics only; no chain, proof or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readPagedSourceLedgerV3} from '../../src/operations/local/paged-source-ledger-v3.mjs';
import {noteNodeHash} from '@lianum/engine/notes/private-note-tree';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
const hex=n=>'0x'+n.repeat(64),pool='0x'+'a'.repeat(40),ZERO=hex('0');
const topic='0x'+publicKeccak256(Buffer.from('NoteInserted(bytes32,uint32)')).toString('hex');
function fixture(){
 const head={number:'0x8',hash:hex('8')},commitments=[hex('1'),hex('2')];
 let level=[...commitments,...Array(254).fill(ZERO)];
 while(level.length>1)level=Array.from({length:level.length/2},(_,i)=>noteNodeHash(level[2*i],level[2*i+1]));
 const receipts=commitments.map((cm,i)=>{
  const transactionHash=hex(String(i+3)),blockHash=hex(String(i+5)),blockNumber='0x'+(i+5),transactionIndex='0x0';
  const receipt={transactionHash,blockHash,blockNumber,transactionIndex,status:'0x1',logs:[{address:pool,transactionHash,blockHash,blockNumber,transactionIndex,logIndex:'0x0',removed:false,topics:[topic,cm],data:'0x'+BigInt(i).toString(16).padStart(64,'0')}]};
  return{transactionHash,receipt};
 });
 const originals=structuredClone(receipts);let root=level[0],count=2;
 const runtime={receipts,checkReceipt:async receipt=>assert.deepEqual(receipt,originals.find(r=>r.transactionHash===receipt.transactionHash)?.receipt,'HOST_ORIGINAL_RECEIPT'),assertCanonical:async()=>{}};
 const call=async(kind,method,args,block)=>{assert.equal(kind,'pool');assert.deepEqual(args,[]);assert.equal(block,head.number);if(method==='leafCount()')return String(count);if(method==='currentRoot()')return root;throw Error('HOST_UNKNOWN_READ');};
 return{runtime,head,call,originals,commitments,setRoot:v=>root=v,setCount:v=>count=v};
}
test('Paged ledger reconstructs the same two issued leaves and root without a nodes getter',async()=>{
 const f=fixture(),read=await readPagedSourceLedgerV3(f.runtime,pool,f.call,f.head);
 assert.deepEqual(read.leaves,f.commitments);assert.ok(Object.isFrozen(read)&&Object.isFrozen(read.leaves));
});
test('Paged ledger rejects missing history and an unrelated pool',async()=>{
 const f=fixture();f.runtime.receipts.pop();await assert.rejects(readPagedSourceLedgerV3(f.runtime,pool,f.call,f.head),/PAGED_LEDGER_INCOMPLETE_HISTORY/);
 const g=fixture();await assert.rejects(readPagedSourceLedgerV3(g.runtime,'0x'+'b'.repeat(40),g.call,g.head),/PAGED_LEDGER_INCOMPLETE_HISTORY/);
});
test('Paged ledger rejects changed original receipts and a changed contract root',async()=>{
 const f=fixture();f.runtime.receipts[0].receipt.logs[0].topics[1]=hex('9');await assert.rejects(readPagedSourceLedgerV3(f.runtime,pool,f.call,f.head),/HOST_ORIGINAL_RECEIPT/);
 const g=fixture();g.setRoot(hex('9'));await assert.rejects(readPagedSourceLedgerV3(g.runtime,pool,g.call,g.head),/PAGED_LEDGER_ROOT_CHANGED/);
});
test('Paged ledger rejects duplicate indexes, removed events and oversized ledgers',async()=>{
 const f=fixture();for(const rows of [f.runtime.receipts,f.originals])rows[1].receipt.logs[0].data='0x'+'0'.repeat(64);
 await assert.rejects(readPagedSourceLedgerV3(f.runtime,pool,f.call,f.head),/PAGED_LEDGER_DUPLICATE_OR_FOREIGN_LEAF/);
 const g=fixture();for(const rows of [g.runtime.receipts,g.originals])rows[0].receipt.logs[0].removed=true;
 await assert.rejects(readPagedSourceLedgerV3(g.runtime,pool,g.call,g.head),/PAGED_LEDGER_REMOVED_LOG/);
 const h=fixture();h.setCount(257);await assert.rejects(readPagedSourceLedgerV3(h.runtime,pool,h.call,h.head),/PAGED_LEDGER_CAPACITY/);
});
