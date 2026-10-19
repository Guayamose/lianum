import test from 'node:test';
import assert from 'node:assert/strict';
import {batchPublicBlockReadV10 as batch} from '../../src/native-wallet/public-read-rpc-batch-v10.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1} from '../../src/native-wallet/public-testnet-rpc-route-v1.mjs';
const endpoint=PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint;
const payload=(id,method='eth_call',block='0x100')=>({jsonrpc:'2.0',id,method,params:method==='eth_call'?[{to:'0x'+'1'.repeat(40),data:'0x'},block]:['0x'+'1'.repeat(40),block]});
test('four explicit-block reads use one request and correlate reversed per-item results/errors',async()=>{
 let requests=0;const send=async(rows,signal,units)=>{requests++;assert.equal(units,4);assert.equal(rows.length,4);return rows.map(row=>({jsonrpc:'2.0',id:row.id,...(row.id===2?{error:{code:-32000,message:'reverted'}}:{result:row.id})})).reverse();};
 const rows=await Promise.all([1,2,3,4].map(id=>batch(endpoint,payload(id),undefined,send)));
 assert.equal(requests,1);assert.deepEqual(rows.map(row=>row.id),[1,2,3,4]);assert.equal(rows[1].error.code,-32000);
});
test('writes, latest/pending and other endpoints never batch',async()=>{
 let requests=0;const send=async(row,_signal,units)=>{requests++;assert.ok(!Array.isArray(row));assert.equal(units,1);return {jsonrpc:'2.0',id:row.id,result:true};};
 await Promise.all([
  batch(endpoint,payload(1,'eth_sendRawTransaction'),undefined,send),
  batch(endpoint,payload(2,'eth_call','latest'),undefined,send),
  batch(endpoint,payload(3,'eth_call','pending'),undefined,send),
  batch('https://other.invalid',payload(4),undefined,send),
 ]);assert.equal(requests,4);
});
test('canonical hash-pinned observations batch, while optional/noncanonical hash selectors do not',async()=>{
 const block={blockHash:'0x'+'1'.repeat(64),requireCanonical:true};let requests=0;
 const send=async(rows,_signal,units)=>{requests++;assert.equal(units,4);return rows.map(row=>({jsonrpc:'2.0',id:row.id,result:'0x'}));};
 await Promise.all([1,2,3,4].map(id=>batch(endpoint,payload(id,'eth_call',block),undefined,send)));assert.equal(requests,1);
 for(const selector of [{blockHash:block.blockHash},{...block,requireCanonical:false}])await batch(endpoint,payload(5,'eth_call',selector),undefined,async(row,_signal,units)=>{assert.equal(units,1);assert.ok(!Array.isArray(row));return{jsonrpc:'2.0',id:row.id,result:'0x'};});
});
test('missing or duplicated batch ids fail every observer without an extra retry',async()=>{
 for(const duplicate of [false,true]){let attempts=0;const send=async rows=>{attempts++;return duplicate?rows.map(()=>({jsonrpc:'2.0',id:rows[0].id,result:1})):[];};
 const results=await Promise.allSettled([1,2,3,4].map(id=>batch(endpoint,payload(id),undefined,send)));
 assert.ok(results.every(row=>row.status==='rejected'&&row.reason.code==='NATIVE_WALLET_RPC_FAILED'));assert.equal(attempts,1);
 }
});
test('one cancelled caller cannot cancel other members; all cancelled callers abort the shared wire',async()=>{
 let respond,wireSignal;const send=(rows,signal)=>{wireSignal=signal;return new Promise(resolve=>{respond=()=>resolve(rows.map(row=>({jsonrpc:'2.0',id:row.id,result:row.id})));});};
 const controls=Array.from({length:4},()=>new AbortController());
 const results=controls.map((control,id)=>batch(endpoint,payload(id),control.signal,send));
 const rejected=assert.rejects(results[0],{code:'NATIVE_WALLET_CANCELLED'});controls[0].abort();assert.equal(wireSignal.aborted,false);respond();await rejected;await Promise.all(results.slice(1));
 let aborted;const held=(_,signal)=>new Promise((_resolve,reject)=>{aborted=signal;signal.addEventListener('abort',()=>reject(Error('cancelled')));});
 const controls2=Array.from({length:4},()=>new AbortController()),pending=controls2.map((control,id)=>batch(endpoint,payload(id),control.signal,held));
 const settled=Promise.allSettled(pending);controls2.forEach(control=>control.abort());assert.equal(aborted.aborted,true);assert.ok((await settled).every(row=>row.status==='rejected'));
});
