/** Private bootstrap diagnostics only. Native causes and owned source frames;
 * no RPC text, revert, request/response, receipt, key or economic authority. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {originalOwnedRuntimeRpcFailureV1} from '@lianum/engine/chains/shared/runtime-harness';
import {privateNativeEconomicSuccessorFirstErrorV1} from '../../wallet/native/native-device-economic-private-error-v1.mjs';
const RPC_METHODS=new Set(['eth_chainId','eth_getBalance','eth_getTransactionCount','eth_getCode','eth_call',
 'web3_sha3','eth_sendTransaction','evm_setNextBlockTimestamp','evm_mine','eth_getBlockByNumber','eth_getTransactionReceipt']);
const RPC_LABELS=new Set(['OWNED_RPC_REQUIRES_LOOPBACK','OWNED_RPC_HTTP_ERROR','OWNED_RPC_REMOTE_ERROR']);
function own(value,key){
 if(!value||typeof value!=='object'||types.isProxy(value))return undefined;
 return Object.getOwnPropertyDescriptor(value,key)?.value;
}
export function privateNativeClaimBootstrapFirstErrorV1(error){
 assert.equal(arguments.length,1,'NATIVE_CLAIM_BOOTSTRAP_FIRST_ERROR_ARITY');
 const causes=[],seen=new Set();let current=error;
 for(let depth=0;current!==undefined&&current!==null&&depth<4&&!seen.has(current);depth++){
  seen.add(current);const original=privateNativeEconomicSuccessorFirstErrorV1(current);
  const native=typeof current==='object'&&!types.isProxy(current)&&types.isNativeError(current);
  const message=native?own(current,'message'):undefined;
  const rpc=native?originalOwnedRuntimeRpcFailureV1(current):null;
  const ownedRpc=rpc?.schema==='ORIGINAL_OWNED_LOOPBACK_RPC_FAILURE_V1'?Object.freeze({
   method:RPC_METHODS.has(rpc.method)?rpc.method:null,
   rpcCode:Number.isInteger(rpc.rpcCode)&&rpc.rpcCode>=-32768&&rpc.rpcCode<=32768?rpc.rpcCode:null,
  }):null;
  causes.push(Object.freeze({depth,errorType:original.errorType,errorCode:original.errorCode,
   errorLabel:RPC_LABELS.has(message)?message:null,frames:original.frames,rpc:ownedRpc}));
  current=native?own(current,'cause'):undefined;
 }
 return Object.freeze({format:'LIANUM_NATIVE_CLAIM_BOOTSTRAP_FIRST_ERROR_PRIVATE_V1',
  causes:Object.freeze(causes),causeChainTruncated:current!==undefined&&current!==null});
}
