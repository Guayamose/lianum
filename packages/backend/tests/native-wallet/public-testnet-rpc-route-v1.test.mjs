import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRpcV1} from '../../src/native-wallet/http-v1.mjs';
import {resolvePublicTestnetRpcRouteV1 as route,PUBLIC_SEPOLIA_RPC_ROUTE_V1 as policy,normalizeNonBlobReceiptResultV1 as receipt} from '../../src/native-wallet/public-testnet-rpc-route-v1.mjs';
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
test('genesis checks and signed sends use the same effective route; an ambiguous send is attempted once',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(endpoint,options)=>{const body=JSON.parse(options.body);calls.push({endpoint,method:body.method});if(body.method==='eth_sendRawTransaction')throw new TypeError('HOST lost response');return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0xaa36a7':{hash:policy.genesis}});});
 const rpc=nativeRpcV1(policy.retainedEndpoint);assert.equal(await rpc('eth_chainId'),'0xaa36a7');assert.deepEqual(await rpc('eth_getBlockByNumber',['0x0',false]),{hash:policy.genesis});
 await assert.rejects(rpc('eth_sendRawTransaction',['HOST signed wire']),{code:'NATIVE_WALLET_HTTP_FAILED'});assert.deepEqual(calls.map(row=>row.endpoint),Array(3).fill(policy.effectiveEndpoint));assert.equal(calls.filter(row=>row.method==='eth_sendRawTransaction').length,1);
});
