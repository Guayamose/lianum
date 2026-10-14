/** Synthetic serialized Anvil DATA/files only. No runtime, recovery token,
 * ledger, proof, deployment or economic acceptance is created by this HOST. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {projectRoot} from '@lianum/engine/chains/shared/runtime-harness';
import {assertOwnedEvmRecoveryStateDumpV1,ownedEvmRecoveryStateBoundFailureV1} from '../../../../src/chains/evm/runtime/owned-evm-recovery-state-bound-v1.mjs';
import {assertOwnedEvmStateFileV1} from '../../../../src/chains/evm/runtime/owned-evm-state-file-v1.mjs';
import {PAGED_HUB_EVM_STATE_LIMITS_V3,assertOwnedPagedHubEvmStateDumpV3,decodeOwnedPagedHubEvmStateV3,assertOwnedPagedHubEvmPrivateRecordV3,writeOwnedPagedHubEvmStateFileV3,ownedPagedHubEvmStateBoundFailureV3} from '../../../../src/chains/evm/runtime/owned-paged-hub-evm-state-v3.mjs';

const hash=word=>'0x'+word.repeat(64),accounts=Array.from({length:5},(_,i)=>'0x'+String(i+1).padStart(40,'0'));
function fixture(){
 const genesis={number:'0x0',timestamp:'0x0'},head={number:'0x1',timestamp:'0xa'};
 const state={accounts:Object.fromEntries(accounts.map(address=>[address,{balance:'0x64',nonce:0,code:'0x',storage:{}}])),best_block_number:1,block:{number:'0x1',timestamp:'0xa'},blocks:[{header:genesis},{header:head}],historical_states:[],transactions:[]};
 const record={schema:'OWNED_FIXED_EVM_PRIVATE_RECOVERY_V2',family:'receiver',cwd:'/HOST/unused',profile:'PAEG_LOCAL_FAKE_CLOCK_V1',runtimePin:['HOST/inert-anvil', 'a'.repeat(64)],processGeneration:0,originalProcessId:1,genesisHash:hash('1'),genesisHeader:{...genesis,hash:hash('1')},accounts:[...accounts],head:{...head,hash:hash('2')},accountState:accounts.map(address=>({address,balance:'0x64',nonce:'0x0',code:'0x'})),stateDump:'',localCustodyCommitment:'b'.repeat(64),lastTimestamp:'10',ingressMutationEpoch:'0',uncertainMutation:false,uncertainSignedHash:null,transactions:[],receipts:[],lifecycle:[],sourceLineageCommitment:null};
 const bytes=Buffer.from(JSON.stringify(state));record.stateDump='0x'+gzipSync(bytes).toString('hex');return{state,record,bytes};
}
function capturedError(run){try{run();}catch(error){return error;}assert.fail('HOST expected rejection');}

test('Paged HUB codec binds exact record accounting, original state/head/genesis and owned accounts',()=>{
 const {record,bytes}=fixture(),value=assertOwnedPagedHubEvmPrivateRecordV3(record),decoded=decodeOwnedPagedHubEvmStateV3(record.stateDump);
 assert.deepEqual(decoded.bytes,bytes);assert.equal(value.recordBytes,Buffer.byteLength(JSON.stringify(record)));assert.equal(value.recordBytes,value.encodedBytes+value.metadataBytes);assert.equal(value.decodedBytes,bytes.length);
 for(const mutate of [r=>r.family='graphNative',r=>r.profile='LOCAL_SYNTHETIC_EVM_CHAIN_ID_1',r=>r.head.number='0x2',r=>r.head.timestamp='0xb',r=>r.genesisHash=hash('3'),r=>r.accountState[0].balance='0x65',r=>r.accountState[0].nonce='0x1',r=>r.accountState[0].code='0x01']){const copy=structuredClone(record);mutate(copy);assert.throws(()=>assertOwnedPagedHubEvmPrivateRecordV3(copy));}
 let invoked=0;const accessor={...record};Object.defineProperty(accessor,'stateDump',{enumerable:true,get(){invoked++;return record.stateDump;}});assert.throws(()=>assertOwnedPagedHubEvmPrivateRecordV3(accessor),/PAGED_HUB_STATE_DATA_ACCESSOR/);assert.equal(invoked,0);
});

test('a real gzip Anvil DATA object above legacy32MiB uses the bounded Paged codec and exact file transport',async()=>{
 const {state,record}=fixture();state.accounts['0x'+'f'.repeat(40)]={balance:'0x0',nonce:0,code:'0x'+randomBytes(16*1024*1024).toString('hex'),storage:{}};
 let bytes=Buffer.from(JSON.stringify(state));record.stateDump='0x'+gzipSync(bytes,{level:1}).toString('hex');assert.ok(record.stateDump.length>32*1024*1024&&record.stateDump.length+15<PAGED_HUB_EVM_STATE_LIMITS_V3.encodedBytes);
 const legacy=capturedError(()=>assertOwnedEvmRecoveryStateDumpV1(record.stateDump));assert.equal(ownedEvmRecoveryStateBoundFailureV1(legacy).withinCharacterBound,false);
 const current=assertOwnedPagedHubEvmPrivateRecordV3(record);assert.equal(current.decodedBytes,bytes.length);assertOwnedPagedHubEvmStateDumpV3(record.stateDump);
 const scratch=join(projectRoot,'.local/integrations');await mkdir(scratch,{recursive:true,mode:0o700});const cwd=await mkdtemp(join(scratch,'flat-economic-receiver-v2-paged-state-host-'));
 try{
  const pin=await writeOwnedPagedHubEvmStateFileV3({cwd,suffix:'1',stateDump:record.stateDump});await assertOwnedEvmStateFileV1(pin);assert.deepEqual(await readFile(pin.path),bytes);assert.equal(pin.sha256,current.decodedSHA256);assert.equal(pin.originalSHA256,current.originalSHA256);
  await assert.rejects(writeOwnedPagedHubEvmStateFileV3({cwd,suffix:'1',stateDump:record.stateDump}),/EEXIST/);
  bytes=null;await writeFile(pin.path,'HOST_CHANGED',{mode:0o600});await assert.rejects(assertOwnedEvmStateFileV1(pin));
 }finally{await rm(cwd,{recursive:true,force:true});}
});

test('encoding/metadata/decoded bounds remain real and diagnostics reveal only fixed numeric DATA',()=>{
 const {record}=fixture();const over='0x1f8b08'+'00'.repeat(PAGED_HUB_EVM_STATE_LIMITS_V3.encodedBytes/2),error=capturedError(()=>assertOwnedPagedHubEvmStateDumpV3(over)),view=ownedPagedHubEvmStateBoundFailureV3(error);
 assert.equal(view.schema,'OWNED_PAGED_HUB_EVM_STATE_BOUND_DIAGNOSTIC_V3');assert.equal(view.withinEncodedBound,false);assert.equal(view.lowerHexEncoding,null);assert.equal(view.maximumEncodedBytes,48*1024*1024);assert.ok(Object.isFrozen(view));assert.equal(ownedPagedHubEvmStateBoundFailureV3(Error('forged')),null);assert.equal(ownedPagedHubEvmStateBoundFailureV3({...error}),null);
 const metadata={...record,lifecycle:[{hostBytes:'x'.repeat(PAGED_HUB_EVM_STATE_LIMITS_V3.metadataBytes)}]},failed=capturedError(()=>assertOwnedPagedHubEvmPrivateRecordV3(metadata)),measure=ownedPagedHubEvmStateBoundFailureV3(failed);assert.ok(measure.metadataBytes>measure.maximumMetadataBytes);assert.equal(measure.decodedBytes,null);
 for(const dump of ['0x','0xzz','0X1f8b08','0x1f8b0','0x00'])assert.throws(()=>decodeOwnedPagedHubEvmStateV3(dump));
 const bomb='0x'+gzipSync(Buffer.alloc(PAGED_HUB_EVM_STATE_LIMITS_V3.decodedBytes+1,32),{level:1}).toString('hex');assert.throws(()=>decodeOwnedPagedHubEvmStateV3(bomb));
 assert.throws(()=>decodeOwnedPagedHubEvmStateV3('0x'+gzipSync(Buffer.from('{"extra":true}')).toString('hex')));
});

test('retention crosses512 original DATA rows and4096 blocks without truncation, then file tamper and finite limits reject',async()=>{
 const {state,record}=fixture(),count=1025,blockCount=16642;
 state.transactions=Array.from({length:count},(_,i)=>({id:'HOST-inert-wire-'+i,number:i}));
 state.blocks=Array.from({length:blockCount},(_,i)=>({header:{number:'0x'+i.toString(16),timestamp:'0x'+i.toString(16),hash:'0x'+i.toString(16).padStart(64,'0'),parentHash:'0x'+Math.max(0,i-1).toString(16).padStart(64,'0')}}));
 state.historical_states=Array.from({length:blockCount},(_,i)=>({height:i}));state.best_block_number=blockCount-1;state.block={number:state.blocks.at(-1).header.number,timestamp:state.blocks.at(-1).header.timestamp};record.genesisHeader=state.blocks[0].header;record.genesisHash=record.genesisHeader.hash;record.head=state.blocks.at(-1).header;
 record.transactions=state.transactions.map(row=>({...row,phase:'mined'}));record.receipts=record.transactions.map(row=>({...row}));record.lastTimestamp=String(blockCount-1);record.stateDump='0x'+gzipSync(Buffer.from(JSON.stringify(state))).toString('hex');
 assert.ok(record.transactions.length>512&&state.blocks.length>4096);assertOwnedPagedHubEvmPrivateRecordV3(record);
 const scratch=join(projectRoot,'.local/integrations');await mkdir(scratch,{recursive:true,mode:0o700});const cwd=await mkdtemp(join(scratch,'flat-economic-receiver-v2-paged-history-host-'));
 try{
  const pin=await writeOwnedPagedHubEvmStateFileV3({cwd,suffix:'1',stateDump:record.stateDump});await assertOwnedEvmStateFileV1(pin);const loaded=JSON.parse(await readFile(pin.path,'utf8'));
  assert.deepEqual(loaded,state);assert.equal(loaded.transactions.at(-1).number,count-1);assert.equal(loaded.blocks.length,blockCount);
  for(let i=1;i<loaded.blocks.length;i++)assert.equal(loaded.blocks[i].header.parentHash,loaded.blocks[i-1].header.hash);
  const altered={...record,transactions:Array.from({length:PAGED_HUB_EVM_STATE_LIMITS_V3.transactions+1},()=>({}))};assert.throws(()=>assertOwnedPagedHubEvmPrivateRecordV3(altered),/PAGED_RUNTIME_HISTORY_COLLECTION_BOUND|PAGED_HUB_STATE_RETAINED_HISTORY_BOUND/);
  const over={...state,blocks:Array.from({length:PAGED_HUB_EVM_STATE_LIMITS_V3.blocks+1},()=>({}))};assert.throws(()=>decodeOwnedPagedHubEvmStateV3('0x'+gzipSync(Buffer.from(JSON.stringify(over))).toString('hex')),/PAGED_HUB_STATE_COLLECTION_BOUND/);
  await writeFile(pin.path,JSON.stringify({...loaded,transactions:loaded.transactions.slice(0,512)}),{mode:0o600});await assert.rejects(assertOwnedEvmStateFileV1(pin));
 }finally{await rm(cwd,{recursive:true,force:true});}
});
