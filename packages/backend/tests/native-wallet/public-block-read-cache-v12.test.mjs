import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRpcV1,withPublicCanonicalBlockReadsV25 as scoped} from '../../src/native-wallet/http-v1.mjs';
import {readPublicBlockCachedV12 as read,readPublicBlockCacheMetricsV12} from '../../src/native-wallet/public-block-read-cache-v12.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1 as route} from '../../src/native-wallet/public-testnet-rpc-route-v1.mjs';
const endpoint=route.effectiveEndpoint,address=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
test('a canonical observation group shares headers but pins each state read and rechecks on exit',async t=>{
 const calls=[],head={number:'0x211',hash:hash(211)};
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const raw=JSON.parse(options.body),rows=Array.isArray(raw)?raw:[raw];calls.push(...rows);
  const replies=rows.map(q=>({jsonrpc:'2.0',id:q.id,result:q.method==='eth_chainId'?'0xaa36a7':q.method==='eth_getBlockByNumber'?(q.params[0]==='0x0'?{hash:route.genesis}:head):'0x6000'}));
  return Response.json(Array.isArray(raw)?replies:replies[0]);
 });
 const rpc=nativeRpcV1(endpoint);
 for(let pass=0;pass<2;pass++)await scoped(endpoint,head,async()=>{
  for(let i=0;i<12;i++){assert.equal(await rpc('eth_chainId',[]),'0xaa36a7');const genesis=await rpc('eth_getBlockByNumber',['0x0',false]);assert.equal(genesis.hash,route.genesis);genesis.hash=hash(999);const observed=await rpc('eth_getBlockByNumber',[head.number,false]);assert.deepEqual(observed,head);observed.hash=hash(999);assert.equal(await rpc('eth_getCode',[address(100+i),head.number]),'0x6000');}
  await scoped(endpoint,head,()=>rpc('eth_getCode',[address(100),head.number]));
  await assert.rejects(rpc('eth_sendRawTransaction',['0x00']),/READ_SCOPE_WRITE/);
 });
 assert.equal(calls.filter(q=>q.method==='eth_getCode').length,12);
 assert.equal(calls.filter(q=>q.method==='eth_chainId').length,2,'network identity is verified once per live scope, including nested readers');
 assert.equal(calls.filter(q=>q.method==='eth_getBlockByNumber'&&q.params[0]==='0x0').length,2,'genesis is verified afresh for each scope, without repeating it inside');
 assert.equal(calls.filter(q=>q.method==='eth_getBlockByNumber'&&q.params[0]===head.number).length,4,'two fresh headers per group, including all warm cache hits');
 for(const q of calls.filter(q=>q.method==='eth_getCode'))assert.deepEqual(q.params[1],{blockHash:head.hash,requireCanonical:true});
 assert.equal(calls.some(q=>q.method==='eth_sendRawTransaction'),false);
 t.diagnostic(JSON.stringify({profile:'HOST_GROUPED_CANONICAL_READS_V25',contracts:12,checks:26,codeRPC:12,canonicalHeaderRPC:4,financialTransactions:0}));
});
test('a scope rejects a changed exit head, a false network and escaped asynchronous reads',async t=>{
 const head={number:'0x212',hash:hash(212)};let reorg=false,wrongNetwork=false,escaped;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const raw=JSON.parse(options.body),rows=Array.isArray(raw)?raw:[raw];
  const replies=rows.map(q=>({jsonrpc:'2.0',id:q.id,result:q.method==='eth_chainId'?(wrongNetwork?'0x1':'0xaa36a7'):q.method==='eth_getBlockByNumber'?(q.params[0]==='0x0'?{hash:route.genesis}:{...head,hash:reorg?hash(999):head.hash}):'0x6001'}));
  return Response.json(Array.isArray(raw)?replies:replies[0]);
 });
 const rpc=nativeRpcV1(endpoint);
 await assert.rejects(scoped(endpoint,head,async()=>{await rpc('eth_getCode',[address(200),head.number]);reorg=true;}),/READ_SCOPE_CANONICAL/);
 await assert.rejects(scoped(endpoint,head,()=>assert.fail('a stale block cannot enter')),/READ_SCOPE_CANONICAL/);
 reorg=false;wrongNetwork=true;await assert.rejects(scoped(endpoint,head,()=>assert.fail('a foreign chain cannot enter')),/READ_SCOPE_NETWORK/);wrongNetwork=false;
 let release;const gate=new Promise(resolve=>release=resolve);
 await scoped(endpoint,head,async()=>{escaped=gate.then(()=>rpc('eth_getCode',[address(200),head.number]));});
 release();await assert.rejects(escaped,/READ_SCOPE_CLOSED/);
 assert.equal(await rpc('eth_getCode',[address(200),head.number]),'0x6001','normal callers retain their own fresh-header validation');
});
test('real HTTP clients share fixed-block data but freshly observe the block on every reuse',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const q=JSON.parse(options.body);calls.push(q);
  return Response.json({jsonrpc:'2.0',id:q.id,result:q.method==='eth_getBlockByNumber'?{number:'0x100',hash:hash(1)}:'0x6000'});
 });
 const a=nativeRpcV1(route.retainedEndpoint),b=nativeRpcV1(endpoint);
 assert.equal(await a('eth_getCode',[address(1),'0x100']),'0x6000');
 assert.equal(await b('eth_getCode',[address(1),'0x100']),'0x6000');
 assert.equal(calls.filter(r=>r.method==='eth_getCode').length,1);
 assert.equal(calls.filter(r=>r.method==='eth_getBlockByNumber').length,2);
 assert.deepEqual(calls.find(r=>r.method==='eth_getCode').params[1],{blockHash:hash(1),requireCanonical:true});
 const before=calls.length;await Promise.all(Array.from({length:16},()=>b('eth_getCode',[address(1),'0x100'])));
 assert.equal(calls.length-before,1,'sixteen warm readers need one fresh header observation and no repeated code query');
});
test('same height with another canonical hash revalidates and canonicality failure cannot return cached data',async()=>{
 let block=hash(2),stateReads=0,fail=false;
 const invoke=async(method,params)=>{if(method==='eth_getBlockByNumber'){if(fail)throw Error('HOST_CANONICAL_UNAVAILABLE');return{number:'0x101',hash:block};}stateReads++;assert.equal(params[1].blockHash,block);assert.equal(params[1].requireCanonical,true);return block===hash(2)?'0x11':'0x22';};
 const q=()=>read(endpoint,'eth_getCode',[address(2),'0x101'],undefined,invoke);
 assert.equal(await q(),'0x11');assert.equal(await q(),'0x11');assert.equal(stateReads,1);
 block=hash(3);assert.equal(await q(),'0x22');assert.equal(stateReads,2);
 fail=true;await assert.rejects(q(),/CANONICAL_UNAVAILABLE/);assert.equal(stateReads,2);
});
test('moving state, nonces, balances, receipts, sends and other routes always reach the original transport',async()=>{
 let calls=0;const invoke=async()=>{calls++;return '0x11';};
 for(const [method,params]of [['eth_getCode',[address(3),'latest']],['eth_call',[{to:address(3)},'pending']],['eth_getBalance',[address(3),'0x102']],['eth_getTransactionCount',[address(3),'pending']],['eth_getTransactionReceipt',[hash(3)]],['eth_sendRawTransaction',['0x11']]]){
  const before=calls;await read(endpoint,method,params,undefined,invoke);await read(endpoint,method,params,undefined,invoke);assert.equal(calls-before,2,method);
 }
 await read('https://HOST.invalid','eth_getCode',[address(3),'0x102'],undefined,invoke);assert.equal(calls,13);
});
test('failed hash-pinned observations are never cached or retried by the cache',async()=>{
 let fail=true,stateReads=0;
 const invoke=async(method,params)=>{if(method==='eth_getBlockByNumber')return{number:'0x103',hash:hash(4)};stateReads++;assert.equal(params[1].requireCanonical,true);if(fail)throw Error('HOST_BLOCK_NOT_CANONICAL');return '0x33';};
 const q=()=>read(endpoint,'eth_getCode',[address(4),'0x103'],undefined,invoke);
 await assert.rejects(q(),/BLOCK_NOT_CANONICAL/);assert.equal(stateReads,1);fail=false;assert.equal(await q(),'0x33');assert.equal(stateReads,2);assert.equal(await q(),'0x33');assert.equal(stateReads,2);
});
test('call sender and calldata remain in the cache identity; cancelled callers never use a cached answer',async()=>{
 let reads=0;const invoke=async(method)=>method==='eth_getBlockByNumber'?{number:'0x104',hash:hash(5)}:(reads++,'0x44');
 const call=from=>read(endpoint,'eth_call',[{to:address(5),from,data:'0x1234'},'0x104'],undefined,invoke);
 await call(address(6));await call(address(7));await call(address(6));assert.equal(reads,2);
 const abort=new AbortController();abort.abort();await assert.rejects(read(endpoint,'eth_call',[{to:address(5),from:address(6),data:'0x1234'},'0x104'],abort.signal,invoke),{code:'NATIVE_WALLET_CANCELLED'});
 const metrics=readPublicBlockCacheMetricsV12();assert.ok(metrics.publicReadRequestsByMethod.eth_call.hits>=1);assert.ok(!JSON.stringify(metrics).includes(address(5)));assert.ok(metrics.blockReadCacheBytes<=32*1024*1024);
});
test('large entries do not escape the memory bound and malformed answers are not cached',async()=>{
 let reads=0,large=true;const invoke=async method=>method==='eth_getBlockByNumber'?{number:'0x105',hash:hash(6)}:(reads++,large?'0x'+'00'.repeat(600000):'BAD_HOST_REPLY');
 const q=()=>read(endpoint,'eth_getCode',[address(8),'0x105'],undefined,invoke);
 await q();await q();assert.equal(reads,2);large=false;await assert.rejects(q(),{code:'NATIVE_WALLET_RPC_FAILED'});await assert.rejects(q(),{code:'NATIVE_WALLET_RPC_FAILED'});assert.equal(reads,4);
});
