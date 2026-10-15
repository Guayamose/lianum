/** Actual Original RPC owner and canonical checks; block/balance observations
 * are HOST. No Source lane, financial command, signer or POST is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {publicPagedAccountFromKeyV1} from '../../../src/chains/public-testnet/wire-v1.mjs';
import {createOriginalPagedSepoliaRpcV4,readOriginalPagedSepoliaHistoricalBalanceV4} from '../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
const genesis='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
test('Original historical wallet balance accepts its canonical witness, keeps balanceV4 strict and rejects reorg/foreign runtime',{timeout:30000},async t=>{
 const account=publicPagedAccountFromKeyV1('ethereum-sepolia',Buffer.alloc(32,1)),head={number:'0x10',hash:'0x'+'11'.repeat(32),parentHash:'0x'+'22'.repeat(32),timestamp:'0x1000',gasLimit:'0x100000',baseFeePerGas:'0x1'},pool='0x'+'33'.repeat(20),calls=[];let reorg=false;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{const request=JSON.parse(options.body);calls.push(request);let result;if(request.method==='eth_chainId')result='0xaa36a7';else if(request.method==='eth_getBlockByNumber')result=request.params[0]==='0x0'?{hash:genesis}:{...head,hash:reorg?'0x'+'44'.repeat(32):head.hash};else if(request.method==='eth_getBalance'){assert.deepEqual(request.params,[pool,head.number]);result='0x123';}else throw Error('HOST_UNEXPECTED_RPC:'+request.method);return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result}),{status:200});});
 const created=await createOriginalPagedSepoliaRpcV4({endpoint:'https://historical-balance-host.invalid',account,keysetId:'55'.repeat(32)});try{
  await assert.rejects(created.runtime.balance(pool,head.number));assert.equal(await readOriginalPagedSepoliaHistoricalBalanceV4(created.runtime,pool,head),0x123n);assert.throws(()=>readOriginalPagedSepoliaHistoricalBalanceV4({...created.runtime},pool,head),/SEPOLIA_RECEIVER_CLOSED/);
  const before=calls.length;reorg=true;await assert.rejects(readOriginalPagedSepoliaHistoricalBalanceV4(created.runtime,pool,head),/CANONICAL/);assert.ok(!calls.slice(before).some(row=>row.method==='eth_getBalance'),'adverse witness rejected before balance');assert.ok(!calls.some(row=>row.method==='eth_sendRawTransaction'));
 }finally{created.lifecycle.acknowledge();await created.runtime.close();}
});
