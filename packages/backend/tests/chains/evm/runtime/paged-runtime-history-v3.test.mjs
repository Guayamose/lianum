/** Actual bounded private-file/fsync/hash + lossless codec on inert HOST DATA.
 * No daemon, authority token, proof, deployment or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {projectRoot} from '@lianum/engine/chains/shared/runtime-harness';
import {writePrivateRuntimeRecoveryV1,readPrivateRuntimeRecoveryV1} from '../../../../src/chains/shared/runtime/owned-runtime-recovery-files-v1.mjs';
import {encodePagedRuntimeHistoryV3,decodePagedRuntimeHistoryV3,PAGED_RUNTIME_HISTORY_LIMITS_V3} from '../../../../src/chains/shared/runtime/paged-runtime-history-v3.mjs';
import {assertOwnedPagedHubEvmPrivateRecordV3} from '../../../../src/chains/evm/runtime/owned-paged-hub-evm-state-v3.mjs';
const accounts=Array.from({length:5},(_,i)=>'0x'+String(i+1).padStart(40,'0'));

test('Original private-file retention preserves768 large wires above metadata16MiB, reopens exact history and rejects tamper',async()=>{
 const head={number:'0x1',timestamp:'0x1',hash:'0x'+'b'.repeat(64)},genesis={number:'0x0',timestamp:'0x0',hash:'0x'+'a'.repeat(64)},state={accounts:Object.fromEntries(accounts.map(a=>[a,{balance:'0x1',nonce:0,code:'0x',storage:{}}])),best_block_number:1,block:{number:'0x1',timestamp:'0x1'},blocks:[{header:genesis},{header:head}],historical_states:[],transactions:[]};
 const transactions=Array.from({length:768},(_,i)=>({transactionHash:'0x'+i.toString(16).padStart(64,'0'),request:{from:accounts[0],to:accounts[1],data:'0x'+'ab'.repeat(16000),value:'0'},phase:'mined',receipt:{transactionHash:'0x'+i.toString(16).padStart(64,'0'),blockNumber:'0x1',blockHash:head.hash,status:'0x1'}}));
 const record={schema:'OWNED_FIXED_EVM_PRIVATE_RECOVERY_V2',family:'receiver',cwd:'/HOST/inert',profile:'PAEG_LOCAL_FAKE_CLOCK_V1',runtimePin:['HOST/inert','c'.repeat(64)],processGeneration:0,originalProcessId:1,genesisHash:genesis.hash,genesisHeader:genesis,accounts,head,accountState:accounts.map(address=>({address,balance:'0x1',nonce:'0x0',code:'0x'})),stateDump:'0x'+gzipSync(Buffer.from(JSON.stringify(state))).toString('hex'),localCustodyCommitment:'d'.repeat(64),lastTimestamp:'1',ingressMutationEpoch:'768',uncertainMutation:false,uncertainSignedHash:null,transactions,receipts:transactions.map(row=>structuredClone(row)),lifecycle:[],sourceLineageCommitment:null};
 assert.ok(Buffer.byteLength(JSON.stringify(record))>16*1024*1024);assert.throws(()=>assertOwnedPagedHubEvmPrivateRecordV3(record),/PAGED_HUB_STATE_METADATA_BOUND/);
 const packed=encodePagedRuntimeHistoryV3(record);assert.equal(packed.transactions.profile,'OWNED_PAGED_EVM_RETAINED_HISTORY_V3');assert.ok(assertOwnedPagedHubEvmPrivateRecordV3(packed).metadataBytes<16*1024*1024);assert.deepEqual(decodePagedRuntimeHistoryV3(packed),record);
 const scratch=join(projectRoot,'.local/integrations');await mkdir(scratch,{recursive:true,mode:0o700});const cwd=await mkdtemp(join(scratch,'flat-economic-receiver-v2-paged-history-compact-host-'));
 try{
  const pin=await writePrivateRuntimeRecoveryV1(cwd,'wrapped-runtime-capture.json',packed),retained=await readPrivateRuntimeRecoveryV1(cwd,pin);assertOwnedPagedHubEvmPrivateRecordV3(retained);const restored=decodePagedRuntimeHistoryV3(retained);assert.equal(restored.transactions.length,768);assert.equal(restored.receipts.length,768);assert.equal(restored.receipts[767],restored.transactions[767]);assert.deepEqual(restored,record);
  const bad={...retained,transactions:{...retained.transactions,sha256:'0'.repeat(64)}};assert.throws(()=>decodePagedRuntimeHistoryV3(bad),/PAGED_RUNTIME_HISTORY_DIGEST/);
  const path=join(cwd,pin.path),original=await readFile(path);await writeFile(path,Buffer.concat([original,Buffer.from(' ')]),{mode:0o600});await assert.rejects(readPrivateRuntimeRecoveryV1(cwd,pin));
 }finally{await rm(cwd,{recursive:true,force:true});}
});

test('finite history bounds and exact receipt join reject missing/mixed/trailing DATA',()=>{
 const sparse=[];sparse.length=2;sparse[0]='retained';sparse.foo='lost';assert.throws(()=>encodePagedRuntimeHistoryV3({transactions:sparse,receipts:[]}),/PAGED_RUNTIME_HISTORY_DENSE_ARRAY/);
 const old={transactions:[{id:'small'}],receipts:[{id:'small'}]};assert.equal(encodePagedRuntimeHistoryV3(old),old);assert.equal(decodePagedRuntimeHistoryV3(old),old);
 assert.throws(()=>encodePagedRuntimeHistoryV3({transactions:[{id:'same'}],receipts:[{id:'foreign'}]}),/PAGED_RUNTIME_HISTORY_RECEIPT_JOIN/);
 assert.throws(()=>decodePagedRuntimeHistoryV3({transactions:Array.from({length:2049},()=>({})),receipts:[]}),/PAGED_RUNTIME_HISTORY_COLLECTION_BOUND/);
 assert.throws(()=>encodePagedRuntimeHistoryV3({transactions:[{data:'x'.repeat(PAGED_RUNTIME_HISTORY_LIMITS_V3.decodedBytes)}],receipts:[]}),/PAGED_RUNTIME_HISTORY_DECODED_BOUND/);
 const packed=encodePagedRuntimeHistoryV3({transactions:[{data:'z'.repeat(600000)}],receipts:[]});assert.throws(()=>decodePagedRuntimeHistoryV3({...packed,receipts:[{}]}),/PAGED_RUNTIME_HISTORY_RECEIPT_JOIN/);assert.throws(()=>decodePagedRuntimeHistoryV3({...packed,transactions:{...packed.transactions,data:Buffer.concat([Buffer.from(packed.transactions.data,'base64'),Buffer.from('trailing')]).toString('base64')}}),/PAGED_RUNTIME_HISTORY_TRAILING_BYTES/);
});
