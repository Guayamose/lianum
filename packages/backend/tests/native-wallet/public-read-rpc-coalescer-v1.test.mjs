/** Real HTTP reader/coalescer/scheduler, HOST HTTP only. No signing keys,
 * valid signed wires, proofs or public requests are used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRpcV1} from '../../src/native-wallet/http-v1.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1 as route} from '../../src/native-wallet/public-testnet-rpc-route-v1.mjs';
import {readPublicRpcMetricsV1} from '../../src/native-wallet/public-read-rpc-coalescer-v1.mjs';

test('concurrent metadata readers share one wire but independent results; subsequent reads observe the network again',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{const r=JSON.parse(options.body);calls++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({jsonrpc:'2.0',id:r.id,result:{number:'0x'+calls,hash:'HOST header'}});});
 const a=nativeRpcV1(route.retainedEndpoint),b=nativeRpcV1(route.effectiveEndpoint),results=await Promise.all(Array.from({length:16},(_,i)=>(i%2?a:b)('eth_getBlockByNumber',['0x10',false])));
 assert.equal(calls,1);assert.equal(results.length,16);assert.notStrictEqual(results[0],results[1]);results[0].hash='HOST changed copy';assert.equal(results[1].hash,'HOST header');
 const fresh=await a('eth_getBlockByNumber',['0x10',false]);assert.equal(calls,2);assert.equal(fresh.number,'0x2');
});

test('different parameters and endpoints stay separate; simulations, balances, nonces and sends are never shared',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(endpoint,options)=>{const r=JSON.parse(options.body);calls.push({endpoint,...r});return Response.json({jsonrpc:'2.0',id:r.id,result:'0x1'});});
 const rpc=nativeRpcV1(route.retainedEndpoint);await Promise.all([rpc('eth_getCode',['0xaa','latest']),rpc('eth_getCode',['0xbb','latest']),nativeRpcV1('https://HOST.invalid')('eth_getCode',['0xaa','latest'])]);assert.equal(calls.length,3);
 for(const method of ['eth_call','eth_estimateGas','eth_getBalance','eth_getTransactionCount','eth_sendRawTransaction']){const before=calls.length;await Promise.all([rpc(method,['HOST input']),rpc(method,['HOST input'])]);assert.equal(calls.length-before,2,method);}
});

test('one cancelled reader cannot cancel another caller of the same request',async t=>{
 let calls=0,wireSignal,release,entered;const seen=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{calls++;wireSignal=options.signal;const r=JSON.parse(options.body);entered();await gate;return Response.json({jsonrpc:'2.0',id:r.id,result:'0xaa36a7'});});
 const rpc=nativeRpcV1(route.retainedEndpoint),abort=new AbortController(),cancelled=rpc('eth_chainId',[],abort.signal),remaining=rpc('eth_chainId');await seen;abort.abort();await assert.rejects(cancelled,{code:'NATIVE_WALLET_CANCELLED'});assert.equal(wireSignal.aborted,false);release();assert.equal(await remaining,'0xaa36a7');assert.equal(calls,1);
});

test('a fully cancelled in-flight group cannot poison a new reader or reach HTTP',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{calls++;const r=JSON.parse(options.body);return Response.json({jsonrpc:'2.0',id:r.id,result:'0xaa36a7'});});
 const rpc=nativeRpcV1(route.retainedEndpoint),abort=new AbortController(),old=rpc('eth_chainId',[],abort.signal);abort.abort();const fresh=rpc('eth_chainId');await assert.rejects(old,{code:'NATIVE_WALLET_CANCELLED'});assert.equal(await fresh,'0xaa36a7');assert.equal(calls,1);
});

test('failed shared reads preserve the bounded retries, isolate errors and leave no cached answer',async t=>{
 let calls=0;const ids=new Set();t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{calls++;ids.add(JSON.parse(options.body).id);return new Response('',{status:429,headers:{'retry-after':'0'}});});
 const rpc=nativeRpcV1(route.retainedEndpoint),results=await Promise.allSettled([rpc('eth_getCode',['0xaa','latest']),rpc('eth_getCode',['0xaa','latest'])]);assert.equal(calls,3);assert.equal(ids.size,1);assert.ok(results.every(r=>r.status==='rejected'&&r.reason.code==='NATIVE_WALLET_HTTP_STATUS'&&r.reason.httpStatus===429));assert.notStrictEqual(results[0].reason,results[1].reason);results[0].reason.httpStatus=400;assert.equal(results[1].reason.httpStatus,429);
 await assert.rejects(rpc('eth_getCode',['0xaa','latest']),{httpStatus:429});assert.equal(calls,6);assert.equal(ids.size,2);
});

test('metadata input is snapshotted once and a saturated group is bounded and cancellable',async t=>{
 let reads=0,seen;t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{const r=JSON.parse(options.body);seen=r.params;return Response.json({jsonrpc:'2.0',id:r.id,result:'0x6000'});});
 const rpc=nativeRpcV1(route.retainedEndpoint),params=['ignored','latest'];Object.defineProperty(params,0,{get(){reads++;return'0xaa';}});assert.equal(await rpc('eth_getCode',params),'0x6000');assert.equal(reads,1);assert.deepEqual(seen,['0xaa','latest']);
 const controls=Array.from({length:512},()=>new AbortController()),pending=controls.map((a,i)=>rpc('eth_getCode',['HOST '+i,'latest'],a.signal));const overflow=rpc('eth_getCode',['HOST overflow','latest']);for(const a of controls)a.abort();await assert.rejects(overflow,{code:'NATIVE_WALLET_RPC_METADATA_READ_BOUND'});const results=await Promise.allSettled(pending);assert.ok(results.every(r=>r.status==='rejected'&&r.reason.code==='NATIVE_WALLET_CANCELLED'));
});

test('method counters count logical invocations independently of sharing and exclude other endpoints and parameters',async t=>{
 const before=readPublicRpcMetricsV1();t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{const request=JSON.parse(options.body);return Response.json({jsonrpc:'2.0',id:request.id,result:'0xaa36a7'});});
 const rpc=nativeRpcV1(route.effectiveEndpoint);await Promise.all([rpc('eth_chainId'),rpc('eth_chainId')]);await rpc('eth_call',[{to:'HOST_PUBLIC_ADDRESS',data:'HOST_PARAMETER'}]);await nativeRpcV1('https://HOST.invalid')('eth_getBalance',['HOST_OTHER']);
 const after=readPublicRpcMetricsV1();assert.equal(after.rpcCalls-before.rpcCalls,3);assert.equal(after.rpcCallsByMethod.eth_chainId-(before.rpcCallsByMethod.eth_chainId??0),2);assert.equal(after.rpcCallsByMethod.eth_call-(before.rpcCallsByMethod.eth_call??0),1);assert.equal(after.rpcCallsByMethod.eth_getBalance??0,before.rpcCallsByMethod.eth_getBalance??0);assert.ok(!JSON.stringify(after).includes('HOST_PARAMETER'));assert.ok(Object.isFrozen(after.rpcCallsByMethod));
});
