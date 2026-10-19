/** Actual private reconciliation functions with explicit HOST source/RPC ports.
 * No genuine financial authority, chain access, signing or funds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {selectPagedPendingSourceTransactionV18 as select} from '../../../src/accounts/authority/paged-pending-source-receipts-v18.mjs';

const hash=n=>n.toString(16).padStart(64,'0'),address=n=>'0x'+n.toString(16).padStart(40,'0');
const identity=hash(1),transactionHash='0x'+hash(2),data='0xdeadbeef',sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const intent={jobId:'same-pending-job',from:address(1),to:address(2),value:'10',calldataSHA256:sha(Buffer.from(data.slice(2),'hex'))};
 const row={command:{identity,jobId:intent.jobId,action:'FUND_D26',from:intent.from,to:intent.to,value:intent.value,data},signed:{nativeId:transactionHash}};
 return{intent,row,record:{revision:1,data:{pending:intent,jobs:[{jobId:intent.jobId,mode:'deposit',stage:'UNKNOWN',transactionHash:null}]}}};
}
const source=await readFile(new URL('../../../src/accounts/authority/device-paged-note-authority-v3.mjs',import.meta.url),'utf8');
const start=source.indexOf(' async function pendingReceiptEntries('),end=source.indexOf('\n const account=',start);
assert.ok(start>0&&end>start);
const originalFunctions=source.slice(start,end);
const originalImport="await import('../../providers/paged-public-testnet-runtimes-v1.mjs')";
assert.equal(originalFunctions.split(originalImport).length,2);
function authority(f,{publicReceiver=true,receipt=null,operations=[f.row],cached=[]}={}){
 const calls={source:0,receipt:[],transaction:[],canonical:0,checked:0,saves:0};
 const runtime={get receipts(){assert.equal(publicReceiver,false,'PUBLIC history must not be scanned');return cached;},
  async receipt(h){calls.receipt.push(h);return receipt;},
  async transaction(h){calls.transaction.push(h);assert.equal(h,transactionHash);return{from:f.intent.from,to:f.intent.to,value:f.intent.value,input:data};},
  async checkReceipt(r){calls.checked++;assert.equal(r.status,'0x1');},async assertCanonical(){calls.canonical++;}};
 const sandbox={assert,Buffer,publicReceiver,runtime,identity,selectPagedPendingSourceTransactionV18:select,
  originalSource:{async readOriginalPagedPublicSepoliaSourceRecoveryRowsV8(r){assert.equal(r,runtime);calls.source++;return{operations};}},
  live(){},noteJobs:r=>r.jobs,copy:structuredClone,sha,
  async save(before,next){calls.saves++;assert.equal(before,f.record);return{revision:before.revision+1,data:next};}};
 const functions=vm.runInNewContext(originalFunctions.replace(originalImport,'originalSource')+'\n({pendingReceiptEntries,reconcile})',sandbox);
 return{...functions,calls};
}
test('PUBLIC reconciliation observes one exact pending transaction regardless of historical receipt count',async()=>{
 const f=fixture(),receipt={transactionHash,status:'0x1'},unrelated=Array.from({length:300},(_,i)=>({command:{identity:hash(100+i),jobId:f.intent.jobId,action:'FUND_D26'},signed:{nativeId:'0x'+hash(100+i)}}));
 const a=authority(f,{receipt,operations:[...unrelated,f.row]});
 const result=await a.reconcile(f.record);
 assert.equal(result.data.pending,null);assert.equal(result.data.jobs[0].stage,'CONFIRMED');assert.equal(result.data.jobs[0].transactionHash,transactionHash);
 assert.deepEqual(a.calls,{source:1,receipt:[transactionHash],transaction:[transactionHash],canonical:1,checked:1,saves:1});
 assert.equal(f.record.data.jobs[0].stage,'UNKNOWN','the retained input record is not mutated');
});
test('a missing receipt retains the pending intent and never scans cached history or resubmits',async()=>{
 const f=fixture(),a=authority(f),result=await a.reconcile(f.record);
 assert.equal(result,f.record);assert.deepEqual(a.calls.receipt,[transactionHash]);assert.deepEqual(a.calls.transaction,[]);assert.equal(a.calls.saves,0);
});
test('reverted receipts and substituted intents cannot be accepted as successful funding',async()=>{
 const f=fixture(),a=authority(f,{receipt:{transactionHash,status:'0x0'}});
 await assert.rejects(a.reconcile(f.record),/PAGED_ORIGINAL_RECEIPT_SUCCESS/);assert.equal(a.calls.saves,0);
 for(const key of ['from','to','value','data']){
  const g=fixture();g.row.command[key]=key==='data'?'0xabcdef':key==='value'?'11':address(99);
  const rejected=authority(g);await assert.rejects(rejected.reconcile(g.record),/PAGED_PENDING_SOURCE_INTENT/);assert.equal(rejected.calls.receipt.length,0);
 }
 const g=fixture(),ambiguous=authority(g,{operations:[g.row,structuredClone(g.row)]});
 await assert.rejects(ambiguous.reconcile(g.record),/PAGED_PENDING_SOURCE_AMBIGUOUS/);assert.equal(ambiguous.calls.receipt.length,0);
});
test('foreign, absent and unsigned source attempts never issue a transaction query',async()=>{
 for(const mutate of [f=>[],f=>{f.row.command.identity=hash(99);return[f.row];},f=>{f.row.signed=null;return[f.row];}]){
  const f=fixture(),a=authority(f,{operations:mutate(f)});assert.equal(await a.reconcile(f.record),f.record);assert.equal(a.calls.receipt.length,0);assert.equal(a.calls.saves,0);
 }
});
test('graph receipt selection binds the effect and the LOCAL path keeps its original receipt source',async()=>{
 const f=fixture();f.intent.effect='RESERVE_R';f.row.command.action='RESERVE_R';f.record.data.jobs=[];
 const a=authority(f);await a.pendingReceiptEntries(f.record,f.intent);assert.deepEqual(a.calls.receipt,[transactionHash]);
 const cached=[{transactionHash,receipt:{transactionHash,status:'0x1'}}],local=authority(f,{publicReceiver:false,cached});
 assert.equal(await local.pendingReceiptEntries(f.record,f.intent),cached);assert.equal(local.calls.source,0);
});
