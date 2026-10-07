import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPrivateCohortCapture} from '../../src/cohorts/private-cohort-capture.mjs';
import {PRIVATE_COHORT_PROFILE} from '../../src/cohorts/private-cohort-runtime.mjs';
import {NATIVE_PRIVATE_COHORT_PROFILE} from '../../src/chains/shared/native-runtime.mjs';
import {SOLANA_PRIVATE_COHORT_PROFILE,SOLANA_BOUNDED_LEDGER_PROFILE,base58Encode} from '../../src/chains/solana/solana-runtime.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0'),s=n=>base58Encode(Buffer.alloc(32,n));
function fixture(){
 let height=0,reorg=false,writeFail=false,release=null,blockWrite=false;
 const writes=[],accounts=Array.from({length:9},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));
 const views=[2,3].map(n=>({genesis:s(1),solver:s(4),recipient:s(n)}));
 const runtime={accounts,metadata:{classification:'OWNED_LOCAL_RUNTIMES_ONLY',freshSyntheticWallets:true,cohortProfile:{name:NATIVE_PRIVATE_COHORT_PROFILE,accountCount:9},chainId:'31337',bitcoinNetwork:'regtest',bitcoinNetworkActive:false,bitcoinPeers:0,evmGenesis:h(100),bitcoinGenesis:h(200)},evm:async m=>m==='eth_getBalance'?'0x8ac7230489e80000':'0x'+height.toString(16),btc:async()=>height};
 const solana={genesis:s(1),solver:s(4),recipientView:i=>views[i],metadata:{cohortProfile:{name:SOLANA_PRIVATE_COHORT_PROFILE,recipientCount:2,registeredRecipients:views.map(v=>v.recipient)},binding:'127.0.0.1',resourceProfile:{name:SOLANA_BOUNDED_LEDGER_PROFILE},ledgerRetention:{effectiveShreds:1000000},slotTiming:{effectiveTicksPerSlot:64},faucetUsed:false,faucetGenesisLamports:'0'},readPublic:async(m,args)=>m==='getBalance'?{context:{slot:height},value:args[0]===s(4)?10000000000:0}:m==='getSlot'?height:0};
 const cursor=async r=>({evm:Number(BigInt(await r.runtime.evm('eth_blockNumber'))),bitcoin:await r.runtime.btc('getblockcount'),solana:await r.solana.readPublic('getSlot')});
 const capture=async({from,to})=>{const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i),raw={kind:'PRIVATE_COHORT_FULL_PUBLIC_CHAIN_CAPTURE',profile:PRIVATE_COHORT_PROFILE,from,to,coverage:{complete:true,recipientFiltering:false,transactionFiltering:false,transactions:0},evm:{genesis:runtime.metadata.evmGenesis,blocks:range(from.evm,to.evm).map(n=>({block:{number:'0x'+n.toString(16),hash:h(1000+n+(reorg?100:0)),transactions:[]},receipts:[]}))},bitcoin:{genesis:runtime.metadata.bitcoinGenesis,blocks:range(from.bitcoin,to.bitcoin).map(n=>({height:n,block:{hash:h(2000+n),tx:[]}}))},solana:{genesis:solana.genesis,firstAvailableBlock:0,minimumLedgerSlot:0,slots:range(from.solana,to.solana),blocks:range(from.solana,to.solana).map(n=>({slot:n,block:{blockhash:s(10+n),transactions:[]},decodedBlock:{transactions:[]}}))}};raw.contentSHA256=createHash('sha256').update(JSON.stringify({evm:raw.evm,bitcoin:raw.bitcoin,solana:raw.solana})).digest('hex');return raw;};
 const writer=async(label,value)=>{if(writeFail)throw Error('WRITE_FAILED');if(blockWrite&&label.includes('chunk'))await new Promise(r=>{release=r;});writes.push({label,value});return label+'.json';};
 const create=(seams={})=>createPrivateCohortCapture({runtime,solana,write:writer,guard:()=>{}},{capture,cursor,source:async()=>({runtime:{},agave:{}}),...seams});
 return{create,writes,setHeight:n=>{height=n;},reorg:()=>{reorg=true;},failWrites:()=>{writeFail=true;},blockWrites:()=>{blockWrite=true;},release:()=>{blockWrite=false;release?.();}};
}
test('complete capture repeats canonical anchors, persists exact bytes and never retains raw chunks',async()=>{
 const f=fixture(),c=f.create();assert.equal((await c.start()).classification,'CAPTURING');f.setHeight(1);await c.captureNow();const r=await c.finish();assert.equal(r.complete,true);assert.equal(r.classification,'COMPLETE');assert.equal(r.retainedRawChunksInMemory,0);assert.equal(r.chunks.length,3);
 for(const row of r.chunks){const saved=f.writes.find(w=>w.label+'.json'===row.reference),bytes=JSON.stringify(saved.value)+'\n';assert.equal(Buffer.byteLength(bytes),row.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);}
 assert.equal(f.writes.at(-1).value.complete,true);assert.throws(()=>{r.chunks.push({});});
});
test('changed anchor and failed durability produce INCOMPLETE, not an inflated empty transcript',async()=>{
 const f=fixture(),c=f.create();await c.start();f.setHeight(1);f.reorg();await c.captureNow();assert.equal((await c.finish()).classification,'INCOMPLETE');assert.equal(c.summary().chunks.length,1);
 const g=fixture(),d=g.create();g.failWrites();const r=await d.start();assert.equal(r.classification,'INCOMPLETE');assert.equal((await d.finish()).complete,false);
});
test('fatal finish drains an in-flight writer and never publishes late COMPLETE',async()=>{
 const f=fixture(),c=f.create();await c.start();f.setHeight(1);f.blockWrites();const active=c.captureNow();await new Promise(r=>setTimeout(r,10));let finished=false;const done=c.abort('FATAL_SHUTDOWN').then(r=>{finished=true;return r;});await new Promise(r=>setTimeout(r,10));assert.equal(finished,false);f.release();await active;assert.equal((await done).classification,'INCOMPLETE');assert.equal(f.writes.at(-1).value.complete,false);const count=f.writes.length;await c.captureNow();assert.equal(f.writes.length,count);
});
test('capture count exhaustion retains previous chunks and marks incomplete',async()=>{const f=fixture(),c=f.create({limits:{maxChunks:1}});await c.start();f.setHeight(1);await c.captureNow();const r=await c.finish();assert.equal(r.complete,false);assert.equal(r.chunks.length,1);});
