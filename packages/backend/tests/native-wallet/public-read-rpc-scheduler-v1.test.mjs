/** HOST HTTP responses, real scheduler/abort handling. No public RPC, signing
 * key, private witness or transaction is used by these checks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {nativeRpcV1} from '../../src/native-wallet/http-v1.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1 as policy,PUBLIC_SEPOLIA_WRITE_ROUTE_V43 as writer} from '../../src/native-wallet/public-testnet-rpc-route-v1.mjs';
import {readPublicRpcMetricsV1} from '../../src/native-wallet/public-read-rpc-coalescer-v1.mjs';

test('independent retained RPC clients share paced reads without caching or changing request identities',async t=>{
 const before=readPublicRpcMetricsV1();
 const starts=[],ids=new Set();
 t.mock.method(globalThis,'fetch',async(endpoint,options)=>{assert.equal(endpoint,policy.effectiveEndpoint);const body=JSON.parse(options.body);starts.push(performance.now());assert.ok(!ids.has(body.id));ids.add(body.id);return Response.json({jsonrpc:'2.0',id:body.id,result:body.params[0]});});
 const clients=[nativeRpcV1(policy.retainedEndpoint),nativeRpcV1(policy.retainedEndpoint+'/')],inputs=Array.from({length:16},(_,i)=>'0x'+i.toString(16));
 const actual=await Promise.all(inputs.map((value,i)=>clients[i%2]('eth_getCode',[value,'latest'])));
 assert.deepEqual(actual,inputs);assert.equal(starts.length,16);assert.equal(ids.size,16);
 for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=80,'parallel callers must not burst past the shared route budget');
 const after=readPublicRpcMetricsV1();assert.equal(after.rpcQueuedAttemptsV25-before.rpcQueuedAttemptsV25,16);assert.equal(after.httpReadResponsesV25-before.httpReadResponsesV25,16);assert.ok(after.rpcQueueMaxWaitMsV25>=1000);assert.ok(after.rpcQueueWaitMsV25>after.httpReadHeadersMsV25);assert.equal(after.rpcQueuePendingUnitsV25,0);
});

test('cancelled queued reads never reach HTTP and do not release another predecessor or stall later reads',async t=>{
 const seen=[];t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{const body=JSON.parse(options.body);seen.push(body.params[0]);return Response.json({jsonrpc:'2.0',id:body.id,result:'0xaa36a7'});});
 const rpc=nativeRpcV1(policy.retainedEndpoint),abort=new AbortController(),first=rpc('eth_chainId',['first']),cancelled=rpc('eth_chainId',['cancelled'],abort.signal),last=rpc('eth_chainId',['last']);abort.abort();
 await assert.rejects(cancelled,{code:'NATIVE_WALLET_CANCELLED'});assert.equal(await first,'0xaa36a7');assert.equal(await last,'0xaa36a7');assert.deepEqual(seen,['first','last']);
});

test('a throttled read retains its same request; a throttled signed send has only one attempt',async t=>{
 const before=readPublicRpcMetricsV1();
 const reads=[],sends=[];t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{const body=JSON.parse(options.body);if(_endpoint===writer.endpoint&&body.method!=='eth_sendRawTransaction')return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0xaa36a7':{hash:policy.genesis}});if(body.method==='eth_sendRawTransaction'){sends.push(options.body);return new Response('',{status:429});}reads.push(options.body);return reads.length===1?new Response('',{status:429,headers:{'retry-after':'0'}}):Response.json({jsonrpc:'2.0',id:body.id,result:'0xaa36a7'});});
 const rpc=nativeRpcV1(policy.retainedEndpoint);assert.equal(await rpc('eth_chainId'),'0xaa36a7');assert.equal(reads.length,2);assert.equal(reads[0],reads[1]);await assert.rejects(rpc('eth_sendRawTransaction',['HOST wire']),{code:'NATIVE_WALLET_HTTP_STATUS',httpStatus:429});assert.equal(sends.length,1);
 assert.equal(readPublicRpcMetricsV1().rpcThrottleResponsesV25-before.rpcThrottleResponsesV25,1,'send responses do not alter read pacing or its metrics');
});

test('429 pauses independent readers together while signed sends keep one immediate attempt',async t=>{
 const reads=[],sends=[];let notify;const firstSeen=new Promise(resolve=>{notify=resolve;});
 t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{
  const body=JSON.parse(options.body),at=performance.now();
  if(_endpoint===writer.endpoint&&body.method!=='eth_sendRawTransaction')return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0xaa36a7':{hash:policy.genesis}});
  if(body.method==='eth_sendRawTransaction'){sends.push({at,body:options.body});return new Response('',{status:429});}
  reads.push({at,body:options.body});
  if(reads.length===1){notify();return new Response('',{status:429,headers:{'retry-after':'0'}});}
  return Response.json({jsonrpc:'2.0',id:body.id,result:body.params[0]});
 });
 const a=nativeRpcV1(policy.retainedEndpoint),b=nativeRpcV1(policy.retainedEndpoint+'/'),first=a('eth_getCode',['first']);await firstSeen;
 const second=b('eth_getCode',['second']),send=a('eth_sendRawTransaction',['HOST wire']);
 await assert.rejects(send,{code:'NATIVE_WALLET_HTTP_STATUS',httpStatus:429});
 assert.deepEqual(await Promise.all([first,second]),['first','second']);
 assert.equal(reads.length,3);assert.ok(reads[1].at-reads[0].at>=1800,'all clients honor the shared provider cooldown');
 assert.ok(reads[2].at-reads[1].at>=150,'retries share the reduced route budget');
 assert.equal(reads.filter(r=>JSON.parse(r.body).params[0]==='first')[0].body,reads.filter(r=>JSON.parse(r.body).params[0]==='first')[1].body);
 assert.equal(sends.length,1);assert.ok(sends[0].at-reads[0].at<500,'a read cooldown cannot replay or queue a signed send');
});

test('storage reads use the bounded read retry path and retain their exact request',async t=>{
 const bodies=[];
 t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{bodies.push(options.body);const body=JSON.parse(options.body);return bodies.length===1?new Response('',{status:429,headers:{'retry-after':'0'}}):Response.json({jsonrpc:'2.0',id:body.id,result:'0x'+'0'.repeat(64)});});
 assert.equal(await nativeRpcV1('https://host-storage.example')('eth_getStorageAt',['0x'+'1'.repeat(40),'0x0','latest']),'0x'+'0'.repeat(64));
 assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
});
