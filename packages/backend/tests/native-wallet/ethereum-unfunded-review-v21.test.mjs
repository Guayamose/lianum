/** Real adapter with bounded HOST RPC responses; no key, broadcast or public acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {ethereumWalletAdapterV1} from '../../src/native-wallet/ethereum-v1.mjs';
import {deriveNativeAccountV1} from '@lianum/crypto/native-wallet-v1';

test('an unfunded ETH review reports insufficient funds before a provider can reject gas estimation',async t=>{
 const own=deriveNativeAccountV1(new Uint8Array(32),'ethereum-sepolia'),recipient='0xe9a5aeff7da21a48f66a4e37feb12359fd3b73fb';
 let balance=0n,estimates=0,sends=0,estimate=21000n;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const request=JSON.parse(options.body),method=request.method;let result;
  if(method==='eth_getBlockByNumber')result={hash:'0x'+'a'.repeat(64),number:'0x20',baseFeePerGas:'0x1'};
  else if(method==='eth_getBalance')result='0x'+balance.toString(16);
  else if(method==='eth_getTransactionCount')result='0x0';
  else if(method==='eth_maxPriorityFeePerGas')result='0x1';
  else if(method==='eth_getCode')result='0x';
  else if(method==='eth_estimateGas'){estimates++;result='0x'+estimate.toString(16);}
  else if(method==='eth_sendRawTransaction'){sends++;assert.fail('HOST review must never broadcast');}
  else assert.fail('Unexpected RPC '+method);
  return Response.json({jsonrpc:'2.0',id:request.id,result});
 });
 const adapter=ethereumWalletAdapterV1({endpoint:'https://host-review.invalid',chainId:'11155111'}),amount='1000000000000';
 await assert.rejects(adapter.prepare(own,recipient,amount),/NATIVE_WALLET_INSUFFICIENT_FUNDS/);
 balance=BigInt(amount)+75599n;
 await assert.rejects(adapter.prepare(own,recipient,amount),/NATIVE_WALLET_INSUFFICIENT_FUNDS/);
 assert.equal(estimates,0,'accounts below the minimum padded fee need no gas estimation');
 balance=BigInt(amount)+75600n;
 const quote=await adapter.prepare(own,recipient,amount);
 assert.equal(quote.feeAtomic,'75600');assert.equal(quote.transaction.gasLimit,'25200');
 assert.equal(estimates,1);assert.equal(sends,0);
 // Reproduce the real provider's 12,000 estimate without lowering the
 // user's authorized gas ceiling below a plain ETH transfer's allowance.
 estimate=12000n;const lower=await adapter.prepare(own,recipient,amount);
 assert.equal(lower.transaction.gasLimit,'25200');assert.equal(lower.feeAtomic,'75600');
 estimate=0n;await assert.rejects(adapter.prepare(own,recipient,amount),/NATIVE_WALLET_EVM_FEE/);
 estimate=1000001n;await assert.rejects(adapter.prepare(own,recipient,amount),/NATIVE_WALLET_EVM_FEE/);
 estimate=30000n;await assert.rejects(adapter.prepare(own,recipient,amount),/NATIVE_WALLET_INSUFFICIENT_FUNDS/);
 balance=BigInt(amount)+108000n;const higher=await adapter.prepare(own,recipient,amount);
 assert.equal(higher.transaction.gasLimit,'36000');assert.equal(higher.feeAtomic,'108000');assert.equal(sends,0);
});
