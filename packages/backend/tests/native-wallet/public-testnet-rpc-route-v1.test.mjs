import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRpcV1} from '../../src/native-wallet/http-v1.mjs';
import {resolvePublicTestnetRpcRouteV1 as route,PUBLIC_SEPOLIA_RPC_ROUTE_V1 as policy,PUBLIC_SEPOLIA_WRITE_ROUTE_V43 as writer,resolvePublicTestnetWriteRpcRouteV43 as writeRoute,normalizeNonBlobReceiptResultV1 as receipt} from '../../src/native-wallet/public-testnet-rpc-route-v1.mjs';
test('zero provider blob extension on a non-blob receipt cannot invalidate the original capture',()=>{
 const original={type:'0x2',status:'0x1',transactionHash:'HOST transaction',blockHash:'HOST block',logs:[{data:'HOST event'}]},extended={...original,blobGasUsed:'0x0'};
 assert.deepEqual(receipt('eth_getTransactionReceipt',extended),original);assert.equal(extended.blobGasUsed,'0x0');
 for(const value of [{...extended,type:'0x3'},{...extended,blobGasUsed:'0x1'}])assert.strictEqual(receipt('eth_getTransactionReceipt',value),value);
 const changed=receipt('eth_getTransactionReceipt',{...extended,status:'0x0'});assert.notDeepEqual(changed,original);assert.equal(changed.status,'0x0');assert.strictEqual(receipt('eth_call',extended),extended);
});
test('retained public Sepolia route has one explicit destination without changing other endpoints',()=>{
 assert.equal(route(policy.retainedEndpoint),policy.effectiveEndpoint);assert.equal(route(policy.retainedEndpoint+'/'),policy.effectiveEndpoint);
 for(const endpoint of ['https://private.drpc.org','https://sepolia.drpc.org/private','https://sepolia.drpc.org?key=anything','https://rpc.invalid',policy.effectiveEndpoint])assert.equal(route(endpoint),endpoint);
});
test('reads keep their cached route; the fixed writer is independently authenticated and attempted once',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(endpoint,options)=>{const body=JSON.parse(options.body);calls.push({endpoint,method:body.method});if(body.method==='eth_sendRawTransaction')throw new TypeError('HOST lost response');return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0xaa36a7':{hash:policy.genesis}});});
 const rpc=nativeRpcV1(policy.retainedEndpoint);assert.equal(await rpc('eth_chainId'),'0xaa36a7');assert.deepEqual(await rpc('eth_getBlockByNumber',['0x0',false]),{hash:policy.genesis});
 await assert.rejects(rpc('eth_sendRawTransaction',['HOST signed wire']),{code:'NATIVE_WALLET_HTTP_FAILED'});assert.deepEqual(calls.map(row=>row.endpoint),[policy.effectiveEndpoint,policy.effectiveEndpoint,writer.endpoint,writer.endpoint,writer.endpoint]);assert.equal(calls.filter(row=>row.method==='eth_sendRawTransaction').length,1);
});

test('a wrong writer chain or genesis prevents every signed POST; no fallback after 429',async t=>{
 const calls=[];let mismatch='chain';
 t.mock.method(globalThis,'fetch',async(endpoint,options)=>{
  const body=JSON.parse(options.body);calls.push({endpoint,method:body.method,params:body.params});
  if(body.method==='eth_sendRawTransaction')return new Response('PRIVATE_429_BODY',{status:429});
  const result=body.method==='eth_chainId'?(mismatch==='chain'?'0x1':'0xaa36a7'):{hash:mismatch==='genesis'?'0x'+'0'.repeat(64):policy.genesis};
  return Response.json({jsonrpc:'2.0',id:body.id,result});
 });
 for(const value of ['chain','genesis']){mismatch=value;await assert.rejects(nativeRpcV1(policy.retainedEndpoint)('eth_sendRawTransaction',['EXACT_HOST_WIRE']),{code:'NATIVE_WALLET_WRITE_ROUTE_NETWORK'});}
 assert.equal(calls.filter(row=>row.method==='eth_sendRawTransaction').length,0);
 mismatch=null;await assert.rejects(nativeRpcV1(policy.retainedEndpoint)('eth_sendRawTransaction',['EXACT_HOST_WIRE']),{httpStatus:429});
 const sends=calls.filter(row=>row.method==='eth_sendRawTransaction');assert.deepEqual(sends,[{endpoint:writer.endpoint,method:'eth_sendRawTransaction',params:['EXACT_HOST_WIRE']}]);
 assert.equal(writeRoute(policy.effectiveEndpoint,'eth_getBalance'),policy.effectiveEndpoint);
 assert.equal(writeRoute('https://rpc.invalid','eth_sendRawTransaction'),'https://rpc.invalid');
});
