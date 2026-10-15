import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {need,fail,signalCurrent} from './common-v1.mjs';
const LIMIT=8388608;
const READ_RPC_METHODS=new Set([
 'eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash',
 'eth_getBalance','eth_getCode','eth_getTransactionCount','eth_getTransactionReceipt',
 'eth_getTransactionByHash','eth_getLogs','eth_call','eth_estimateGas','eth_gasPrice',
 'eth_maxPriorityFeePerGas','eth_feeHistory','getGenesisHash','getSlot','getBlock',
 'getBlockHeight','getLatestBlockhash','getBalance','getAccountInfo','getTransaction',
 'getSignatureStatuses','getFeeForMessage','getMinimumBalanceForRentExemption',
 'getTokenAccountBalance','getTokenAccountsByOwner','isBlockhashValid',
]);
const TRANSIENT_HTTP_STATUS=new Set([408,429,500,502,503,504]);
async function request(endpoint,{method='GET',body,signal,text=false,missing=false,readOnly=false}={}){
 signalCurrent(signal);const abort=new AbortController(),onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});const timer=setTimeout(()=>abort.abort(),15000);let reply;
 try{
  for(let attempt=0;;attempt++){
   signalCurrent(signal);
   try{
    reply=await fetch(endpoint,{method,body,signal:abort.signal,redirect:'error',headers:{Accept:text?'text/plain':'application/json',...(body!==undefined?{'Content-Type':text?'text/plain':'application/json'}:{})}});
    if(missing&&reply.status===404){await reply.body?.cancel();return null;}
    if(reply.status!==200){
     await reply.body?.cancel();
     // Both the attempt count and the original deadline cover status retries.
     const transient=TRANSIENT_HTTP_STATUS.has(reply.status)||method==='POST'&&readOnly&&reply.status===400;
     if(!readOnly||attempt>=2||!transient){try{fail('HTTP_STATUS');}catch(error){error.httpStatus=reply.status;throw error;}}
     const retryAfter=reply.headers.get('retry-after'),wait=retryAfter!==null&&/^[0-9]+$/.test(retryAfter)?Math.min(2000,Number(retryAfter)*1000):250*2**attempt;
     await pause(wait,undefined,{signal:abort.signal});continue;
    }
    const length=reply.headers.get('content-length');if(length!==null)need(/^[0-9]+$/.test(length)&&BigInt(length)<=BigInt(LIMIT),'RESPONSE_BOUND');
    const reader=reply.body?.getReader();need(reader,'RESPONSE');const chunks=[];let bytes=0;
    try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;need(bytes<=LIMIT,'RESPONSE_BOUND');chunks.push(r.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    signalCurrent(signal);const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes));if(text)return raw.trim();return JSON.parse(raw);
   }catch(error){
    // Socket failures and interrupted bodies are safe to repeat only for a
    // whitelisted read. Never repeat sends or reset the shared 15s deadline.
    if(!readOnly||attempt>=2||abort.signal.aborted||signal?.aborted||/^NATIVE_WALLET_[A-Z_]+$/.test(error?.code??''))throw error;
    await pause(250*2**attempt,undefined,{signal:abort.signal});
   }
  }
 }catch(error){if(/^NATIVE_WALLET_[A-Z_]+$/.test(error?.code??''))throw error;fail(signal?.aborted?'CANCELLED':abort.signal.aborted?'HTTP_TIMEOUT':'HTTP_FAILED');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
export function nativeRpcV1(endpoint){return async(method,params=[],signal)=>{const id=randomUUID();try{const result=await request(endpoint,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal,readOnly:READ_RPC_METHODS.has(method)});need(result?.jsonrpc==='2.0'&&result.id===id,'RPC_FAILED');if(Object.hasOwn(result,'error')){try{fail('RPC_FAILED');}catch(error){if(READ_RPC_METHODS.has(method)&&Number.isInteger(result.error?.code)){error.rpcErrorCode=result.error.code;const cap=/^out of gas: gas required exceeds: ([1-9][0-9]{0,19})$/.exec(result.error.message??'');if(method==='eth_estimateGas'&&result.error.code===-32003&&cap)error.rpcGasCap=cap[1];}throw error;}}need(Object.hasOwn(result,'result'),'RPC_FAILED');return result.result;}catch(error){if(READ_RPC_METHODS.has(method)&&['NATIVE_WALLET_HTTP_STATUS','NATIVE_WALLET_RPC_FAILED'].includes(error?.code))error.rpcMethod=method;throw error;}};}
export function nativeEsploraV1(endpoint){const base=endpoint.replace(/\/$/,'');return(path,options)=>{need(typeof path==='string'&&/^\/[a-zA-Z0-9/_:.-]+$/.test(path)&&path.length<=300,'HTTP_PATH');return request(base+path,{...options,readOnly:(options?.method??'GET')==='GET'});};}
