import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRpcV1,nativeEsploraV1} from '../../src/native-wallet/http-v1.mjs';

test('a signed RPC rejection keeps only a bounded category and numeric code without retrying',async t=>{
 let sends=0;const privateText='replacement transaction underpriced; private endpoint/key/signed payload';
 t.mock.method(globalThis,'fetch',async(_url,options)=>{sends++;return Response.json({jsonrpc:'2.0',id:JSON.parse(options.body).id,error:{code:-32000,message:privateText,data:'private signed payload'}});});
 await assert.rejects(nativeRpcV1('https://rpc.invalid')('eth_sendRawTransaction',['host-signed-wire']),error=>{
  assert.equal(error.rpcMethod,'eth_sendRawTransaction');assert.equal(error.rpcErrorCode,-32000);assert.equal(error.rpcWriteRejection,'REPLACEMENT_UNDERPRICED');assert.equal(error.message,'NATIVE_WALLET_RPC_FAILED');
  assert.equal(JSON.stringify(error).includes('private'),false);assert.equal(error.cause,undefined);return true;
 });assert.equal(sends,1);
});

test('RPC reads recover from a temporary HTTP response and release its body',async t=>{
 let calls=0,cancelled=false;const bodies=[];
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  bodies.push(options.body);
  if(++calls===1)return new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:503});
  assert.equal(cancelled,true);
  return Response.json({jsonrpc:'2.0',id:JSON.parse(options.body).id,result:'0x1'});
 });
 assert.equal(await nativeRpcV1('https://rpc.invalid')('eth_getBalance',['0x1','latest']),'0x1');
 assert.equal(calls,2);assert.equal(bodies[0],bodies[1]);
});

test('a disconnected RPC read repeats the same request, within three attempts',async t=>{
 const bodies=[];
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  bodies.push(options.body);if(bodies.length<3)throw new TypeError('private upstream connection details');
  return Response.json({jsonrpc:'2.0',id:JSON.parse(options.body).id,result:null});
 });
 assert.equal(await nativeRpcV1('https://rpc.invalid')('eth_getTransactionReceipt',['0x123']),null);
 assert.equal(bodies.length,3);assert.equal(new Set(bodies).size,1);
});

test('an interrupted response body retries a read and releases its reader',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  if(++calls===1)return new Response(new ReadableStream({start(controller){controller.error(new TypeError('private transport detail'));}}));
  return Response.json({jsonrpc:'2.0',id:JSON.parse(options.body).id,result:'0x1'});
 });
 assert.equal(await nativeRpcV1('https://rpc.invalid')('eth_chainId'),'0x1');assert.equal(calls,2);
});

test('persistent transport failures are bounded; signed and unknown sends stay single attempt',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new TypeError('private endpoint and wire');});
 const rpc=nativeRpcV1('https://rpc.invalid');
 await assert.rejects(rpc('eth_getCode'),error=>{assert.equal(error.message,'NATIVE_WALLET_HTTP_FAILED');assert.equal(error.cause,undefined);return true;});assert.equal(calls,3);
 for(const method of ['eth_sendRawTransaction','sendTransaction','customMethod']){const before=calls;await assert.rejects(rpc(method,['signed-wire']),{code:'NATIVE_WALLET_HTTP_FAILED'});assert.equal(calls,before+1);}
});

test('transport diagnostics expose only known error classes and system codes',async t=>{
 const cause=new Error('private URL or payload');cause.code='ECONNRESET';
 const mocked=t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('private upstream detail',{cause});});
 const rpc=nativeRpcV1('https://rpc.invalid');
 await assert.rejects(rpc('eth_chainId'),{code:'NATIVE_WALLET_HTTP_FAILED',message:'NATIVE_WALLET_HTTP_FAILED',transportClass:'TypeError',transportCode:'ECONNRESET'});
 cause.code='PRIVATE_ENDPOINT_TOKEN';mocked.mock.mockImplementation(async()=>{throw new Error('private payload',{cause});});
 await assert.rejects(rpc('eth_chainId'),error=>{assert.equal(error.transportClass,'Error');assert.equal(error.transportCode,undefined);assert.equal(error.cause,undefined);return true;});
});

test('read retries are bounded and retain only the numeric HTTP status',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('private provider body',{status:429,headers:{'retry-after':'0'}});});
 await assert.rejects(nativeRpcV1('https://rpc.invalid')('eth_chainId'),error=>{
  assert.equal(error.code,'NATIVE_WALLET_HTTP_STATUS');assert.equal(error.httpStatus,429);
  assert.equal(error.rpcMethod,'eth_chainId');
  assert.equal(error.message,'NATIVE_WALLET_HTTP_STATUS');return true;
 });
 assert.equal(calls,3);
});

test('HTTP 400 from an RPC read is retried but a signed send is not',async t=>{
 let calls=0;const mocked=t.mock.method(globalThis,'fetch',async(_url,options)=>{
  calls++;return calls===1?new Response('',{status:400,headers:{'retry-after':'0'}}):Response.json({jsonrpc:'2.0',id:JSON.parse(options.body).id,result:null});
 });
 assert.equal(await nativeRpcV1('https://rpc.invalid')('eth_getTransactionReceipt',['0x123']),null);assert.equal(calls,2);
 mocked.mock.mockImplementation(async()=>{calls++;return new Response('',{status:400,headers:{'retry-after':'0'}});});
 await assert.rejects(nativeRpcV1('https://rpc.invalid')('eth_getCode',['bad-params']),{code:'NATIVE_WALLET_HTTP_STATUS',httpStatus:400,rpcMethod:'eth_getCode'});assert.equal(calls,5);
 await assert.rejects(nativeRpcV1('https://rpc.invalid')('eth_sendRawTransaction',['signed-wire']),error=>{assert.equal(error.httpStatus,400);assert.equal(error.rpcMethod,'eth_sendRawTransaction');return true;});assert.equal(calls,6);
});

test('nontransient HTTP failures and RPC errors do not repeat reads',async t=>{
 let calls=0;const mocked=t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('',{status:403});});
 await assert.rejects(nativeRpcV1('https://rpc.invalid')('eth_chainId'),{httpStatus:403});assert.equal(calls,1);
 mocked.mock.mockImplementation(async(_url,options)=>{calls++;return Response.json({jsonrpc:'2.0',id:JSON.parse(options.body).id,error:{code:-32000,message:'provider error'}});});
 await assert.rejects(nativeRpcV1('https://rpc.invalid')('eth_call'),{code:'NATIVE_WALLET_RPC_FAILED'});assert.equal(calls,2);
});

test('Ethereum, Solana and unknown RPC sends are each attempted once',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('',{status:503});});
 for(const method of ['eth_sendRawTransaction','sendTransaction','requestAirdrop','customMethod']){
  const before=calls;await assert.rejects(nativeRpcV1('https://rpc.invalid')(method,['signed-wire']),{httpStatus:503});assert.equal(calls,before+1);
 }
});

test('Esplora retries GET, preserves missing transactions and never retries POST',async t=>{
 let calls=0;const mocked=t.mock.method(globalThis,'fetch',async()=>new Response(++calls===1?'':'ok',{status:calls===1?503:200}));
 const esplora=nativeEsploraV1('https://btc.invalid');assert.equal(await esplora('/blocks/tip/hash',{text:true}),'ok');assert.equal(calls,2);
 mocked.mock.mockImplementation(async()=>{calls++;return new Response('',{status:503});});
 await assert.rejects(esplora('/tx',{method:'POST',body:'signed-wire',text:true,readOnly:true}),{httpStatus:503});assert.equal(calls,3);
 mocked.mock.mockImplementation(async()=>{calls++;return new Response('',{status:404});});
 assert.equal(await esplora('/tx/abc',{missing:true}),null);assert.equal(calls,4);
});

test('cancellation during backoff prevents another request',async t=>{
 let calls=0;const controller=new AbortController();
 t.mock.method(globalThis,'fetch',async()=>{calls++;setImmediate(()=>controller.abort());return new Response('',{status:429});});
 await assert.rejects(nativeRpcV1('https://rpc.invalid')('eth_chainId',[],controller.signal),{code:'NATIVE_WALLET_CANCELLED'});
 assert.equal(calls,1);
});

test('only a precise CREATE estimation cap exposes safe fallback metadata',async t=>{
 let reply={code:-32003,message:'out of gas: gas required exceeds: 50000000'};
 t.mock.method(globalThis,'fetch',async(_url,options)=>Response.json({jsonrpc:'2.0',id:JSON.parse(options.body).id,error:reply}));
 const rpc=nativeRpcV1('https://rpc.invalid');
 await assert.rejects(rpc('eth_estimateGas'),{code:'NATIVE_WALLET_RPC_FAILED',rpcErrorCode:-32003,rpcGasCap:'50000000',rpcMethod:'eth_estimateGas'});
 for(const method of ['eth_call','eth_sendRawTransaction'])await assert.rejects(rpc(method),error=>{assert.equal(error.rpcGasCap,undefined);return true;});
 reply={code:-32000,message:'private upstream revert details'};
 await assert.rejects(rpc('eth_estimateGas'),error=>{assert.equal(error.rpcGasCap,undefined);assert.equal(error.message,'NATIVE_WALLET_RPC_FAILED');return true;});
});


// PROPOSED: no public RPC, keys or real payloads. Sentinel demonstrates that
// neither provider messages nor ABI payloads outside the finite list escape.
test('canonical allowlisted contract rejection survives as finite metadata and one safe origin event',async t=>{
 const word=n=>BigInt(n).toString(16).padStart(64,'0'),abi=text=>{const b=Buffer.from(text);return '0x08c379a0'+word(32)+word(b.length)+b.toString('hex').padEnd(Math.ceil(b.length/32)*64,'0');},events=[];let calls=0,data=abi('STALE_EPOCH'),providerMessage='PRIVATE_RPC_MESSAGE_SENTINEL';
 t.mock.method(console,'error',(...args)=>events.push(args));
 t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;return Response.json({jsonrpc:'2.0',id:JSON.parse(options.body).id,error:{code:3,message:providerMessage,data}});});
 const rpc=nativeRpcV1('https://rpc.invalid');
 const rejection={reportedBy:'RPC_PROVIDER',kind:'ERROR_STRING',reason:'STALE_EPOCH'};
 await assert.rejects(rpc('eth_call',[{data:'PRIVATE_CALLDATA_SENTINEL'}]),error=>{assert.equal(error.message,'NATIVE_WALLET_RPC_FAILED');assert.deepEqual(error.rpcContractRejection,rejection);assert.equal(error.cause,undefined);const text=JSON.stringify(error);assert.ok(!text.includes('PRIVATE_'));assert.ok(!text.includes(data));return true;});
 assert.equal(calls,1,'JSON-RPC contract rejections do not retry');assert.deepEqual(events,[['LIANUM_NATIVE_RPC_CONTRACT_REJECTION_V1',JSON.stringify({rpcMethod:'eth_call',...rejection})]]);
 for(const method of ['eth_getCode','eth_sendRawTransaction'])await assert.rejects(rpc(method,['PRIVATE_WIRE_SENTINEL']),error=>{assert.equal(error.rpcContractRejection,undefined);return true;});assert.equal(events.length,1,'sends and unrelated reads cannot add a contract-revert diagnostic');
 for(const bad of [abi('PRIVATE_ABI_SENTINEL'),abi('STALE_EPOCH')+'00','0x12345678',{data:abi('STALE_EPOCH')},'0x'+'ff'.repeat(1000)]){data=bad;await assert.rejects(rpc('eth_call'),error=>{assert.equal(error.rpcContractRejection,undefined);return true;});}assert.equal(events.length,1);
 data=undefined;providerMessage='execution reverted: STALE_EPOCH';await assert.rejects(rpc('eth_call'),error=>{assert.equal(error.rpcContractRejection,undefined);return true;});assert.equal(events.length,1,'provider messages never become contract reasons');
 data='0x4e487b71'+word(17);await assert.rejects(rpc('eth_estimateGas'),error=>{assert.deepEqual(error.rpcContractRejection,{reportedBy:'RPC_PROVIDER',kind:'PANIC',panicCode:'0x11'});return true;});assert.equal(events.length,2);
 data='0x4e487b71'+word(99);await assert.rejects(rpc('eth_estimateGas'),error=>{assert.equal(error.rpcContractRejection,undefined);return true;});assert.equal(events.length,2);
});
