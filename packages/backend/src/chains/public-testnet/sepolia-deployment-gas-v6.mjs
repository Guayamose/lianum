/** Read-only CREATE estimation. The protected signer still owns preparation,
 * fork selection, aggregate fee approval and the actual transaction. */
import assert from 'node:assert/strict';
import {nativeRpcV1} from '../../native-wallet/http-v1.mjs';
import {readOriginalPagedSepoliaRpcContextV4} from './sepolia-receiver-rpc-v4.mjs';

const FALLBACK='https://gateway.tenderly.co/public/sepolia';
const GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
export async function estimateOriginalPagedSepoliaCreateGasV6(runtime,creation,head){
 assert.equal(arguments.length,3);
 const context=readOriginalPagedSepoliaRpcContextV4(runtime);
 assert.match(creation,/^0x(?:[0-9a-f]{2})+$/);assert.ok(creation.length<=262146);
 const tx={from:context.account.address,data:creation,value:'0x0',gasPrice:'0x0',gas:head.gasLimit};
 const primary=nativeRpcV1(context.endpoint);
 try{return await primary('eth_estimateGas',[tx]);}
 catch(error){if(error?.code!=='NATIVE_WALLET_RPC_FAILED'||error.rpcGasCap===undefined)throw error;}
 // Both endpoints must serve the SAME canonical block. This fallback cannot
 // accept caller-supplied gas, choose another chain, sign or broadcast.
 readOriginalPagedSepoliaRpcContextV4(runtime);
 const rpc=nativeRpcV1(FALLBACK);
 const [chain,genesis,block]=await Promise.all([
  rpc('eth_chainId',[]),rpc('eth_getBlockByNumber',['0x0',false]),
  rpc('eth_getBlockByNumber',[head.number,false]),
 ]);
 assert.equal(chain,'0xaa36a7','SEPOLIA_GAS_FALLBACK_CHAIN');
 assert.equal(genesis?.hash,GENESIS,'SEPOLIA_GAS_FALLBACK_GENESIS');
 assert.equal(block?.hash,head.hash,'SEPOLIA_GAS_FALLBACK_CANONICAL');
 const estimate=await rpc('eth_estimateGas',[tx,head.number]);
 assert.match(estimate,/^0x(?:0|[1-9a-f][0-9a-f]*)$/);
 assert.ok(BigInt(estimate)>0n&&BigInt(estimate)<=BigInt(head.gasLimit),'SEPOLIA_GAS_FALLBACK_BOUND');
 assert.equal((await rpc('eth_getBlockByNumber',[head.number,false]))?.hash,head.hash,'SEPOLIA_GAS_FALLBACK_CANONICAL');
 await runtime.assertCanonical(head);readOriginalPagedSepoliaRpcContextV4(runtime);
 return estimate;
}
