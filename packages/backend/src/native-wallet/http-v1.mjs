import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {setTimeout as pause} from 'node:timers/promises';
import {need,fail,signalCurrent} from './common-v1.mjs';
import {classifyNativeRpcContractRejectionDataV1} from './rpc-contract-rejection-data-v1.mjs';
import {classifyNativeRpcWriteRejectionV18} from './rpc-write-rejection-data-v18.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1,resolvePublicTestnetRpcRouteV1,resolvePublicTestnetWriteRpcRouteV43,normalizeNonBlobReceiptResultV1} from './public-testnet-rpc-route-v1.mjs';
import {waitPublicSepoliaReadTurnV1,recordPublicSepoliaReadResponseV1} from './public-read-rpc-scheduler-v1.mjs';
import {sharePublicMetadataReadV1,recordPublicRpcWireAttemptV1,recordPublicRpcHeadersV25,recordPublicScopedHeaderHitV27} from './public-read-rpc-coalescer-v1.mjs';
import {batchPublicBlockReadV10} from './public-read-rpc-batch-v10.mjs';
import {readPublicBlockCachedV12} from './public-block-read-cache-v12.mjs';
import {readPublicFinalizedCachedV16} from './public-finalized-read-cache-v16.mjs';
const LIMIT=8388608;
const READ_RPC_METHODS=new Set([
 'eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash',
 'eth_getBalance','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getTransactionReceipt',
 'eth_getTransactionByHash','eth_getLogs','eth_call','eth_estimateGas','eth_gasPrice',
 'eth_maxPriorityFeePerGas','eth_feeHistory','getGenesisHash','getSlot','getBlock',
 'getBlockHeight','getLatestBlockhash','getBalance','getAccountInfo','getTransaction',
 'getSignatureStatuses','getFeeForMessage','getMinimumBalanceForRentExemption',
 'getTokenAccountBalance','getTokenAccountsByOwner','isBlockhashValid',
]);
const TRANSIENT_HTTP_STATUS=new Set([408,429,500,502,503,504]);
const TRANSPORT_CODES=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','ENETUNREACH','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_GET_ISSUER_CERT_LOCALLY']);
async function request(endpoint,{method='GET',body,signal,text=false,missing=false,readOnly=false,readUnits=1}={}){
 signalCurrent(signal);const abort=new AbortController(),onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});const timer=setTimeout(()=>abort.abort(),15000);let reply;
 try{
  for(let attempt=0;;attempt++){
   signalCurrent(signal);
   try{
    if(readOnly)await waitPublicSepoliaReadTurnV1(endpoint,abort.signal,readUnits);
    recordPublicRpcWireAttemptV1(endpoint,readOnly,readUnits);
    const wireAt=performance.now();reply=await fetch(endpoint,{method,body,signal:abort.signal,redirect:'error',headers:{Accept:text?'text/plain':'application/json',...(body!==undefined?{'Content-Type':text?'text/plain':'application/json'}:{})}});
    recordPublicRpcHeadersV25(endpoint,readOnly,performance.now()-wireAt);
    if(readOnly)recordPublicSepoliaReadResponseV1(endpoint,reply.status,reply.headers.get('retry-after'));
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
 }catch(error){if(/^NATIVE_WALLET_[A-Z_]+$/.test(error?.code??''))throw error;try{fail(signal?.aborted?'CANCELLED':abort.signal.aborted?'HTTP_TIMEOUT':'HTTP_FAILED');}catch(failure){if(['TypeError','SyntaxError','AbortError','RangeError','Error'].includes(error?.name))failure.transportClass=error.name;const code=error?.cause?.code??error?.code;if(TRANSPORT_CODES.has(code))failure.transportCode=code;throw failure;}}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
const canonicalReadScopeV25=new AsyncLocalStorage();
function rpcTransport(endpoint){endpoint=resolvePublicTestnetRpcRouteV1(endpoint);const perform=async(method,params,signal)=>{
 const sendEndpoint=resolvePublicTestnetWriteRpcRouteV43(endpoint,method);
 if(sendEndpoint!==endpoint){
  const writer=rpcTransport(sendEndpoint);
  const [chain,genesis]=await Promise.all([writer.rpc('eth_chainId',[],signal),writer.rpc('eth_getBlockByNumber',['0x0',false],signal)]);
  need(chain==='0xaa36a7'&&genesis?.hash===PUBLIC_SEPOLIA_RPC_ROUTE_V1.genesis,'WRITE_ROUTE_NETWORK');
  // Only this preselected endpoint receives the exact original signed wire.
  // The inner transport preserves one attempt and uncertain-result recovery.
  return writer.rpc(method,params,signal);
 }
 const id=randomUUID();try{const result=await batchPublicBlockReadV10(endpoint,{jsonrpc:'2.0',id,method,params},signal,(payload,current,readUnits)=>request(endpoint,{method:'POST',body:JSON.stringify(payload),signal:current,readOnly:READ_RPC_METHODS.has(method),readUnits}));need(result?.jsonrpc==='2.0'&&result.id===id,'RPC_FAILED');if(Object.hasOwn(result,'error')){try{fail('RPC_FAILED');}catch(error){if((READ_RPC_METHODS.has(method)||method==='eth_sendRawTransaction')&&Number.isInteger(result.error?.code)){error.rpcErrorCode=result.error.code;if(method==='eth_sendRawTransaction'){const category=classifyNativeRpcWriteRejectionV18(result.error);if(category)error.rpcWriteRejection=category;}if(method==='eth_call'||method==='eth_estimateGas'){const rejection=classifyNativeRpcContractRejectionDataV1(result.error.data);if(rejection){error.rpcContractRejection=rejection;try{console.error('LIANUM_NATIVE_RPC_CONTRACT_REJECTION_V1',JSON.stringify({rpcMethod:method,...rejection}));}catch{}}}const cap=/^out of gas: gas required exceeds: ([1-9][0-9]{0,19})$/.exec(result.error.message??'');if(method==='eth_estimateGas'&&result.error.code===-32003&&cap)error.rpcGasCap=cap[1];}throw error;}}need(Object.hasOwn(result,'result'),'RPC_FAILED');return normalizeNonBlobReceiptResultV1(method,result.result);}catch(error){if((READ_RPC_METHODS.has(method)||method==='eth_sendRawTransaction')&&['NATIVE_WALLET_HTTP_STATUS','NATIVE_WALLET_RPC_FAILED','NATIVE_WALLET_HTTP_FAILED','NATIVE_WALLET_HTTP_TIMEOUT'].includes(error?.code))error.rpcMethod=method;throw error;}};const observe=(method,params,signal)=>sharePublicMetadataReadV1(endpoint,method,params,signal,(snapshot,current)=>perform(method,snapshot,current));const invoke=(method,params,signal)=>readPublicFinalizedCachedV16(endpoint,method,params,signal,observe);return {observe,rpc:async(method,params=[],signal)=>{
 const scope=canonicalReadScopeV25.getStore();
 if(scope){need(scope.active,'READ_SCOPE_CLOSED');need(READ_RPC_METHODS.has(method),'READ_SCOPE_WRITE');signalCurrent(signal);
  if(scope.endpoint===endpoint){
   // The enclosing observation already authenticated this exact endpoint's
   // chain and genesis. Reuse only that identity inside its live scope;
   // mutable heads/balances/nonces still reach their original readers.
   if(method==='eth_chainId'&&params.length===0)return scope.chain;
   if(method==='eth_getBlockByNumber'&&params.length===2&&params[0]==='0x0'&&params[1]===false)return structuredClone(scope.genesis);
   if(method==='eth_getBlockByNumber'&&params.length===2&&params[0]===scope.head.number&&params[1]===false){recordPublicScopedHeaderHitV27();return structuredClone(scope.header);}
  }
 }
 return readPublicBlockCachedV12(endpoint,method,params,signal,invoke,scope?.endpoint===endpoint?scope.head:undefined);
}};}
export function nativeRpcV1(endpoint){return rpcTransport(endpoint).rpc;}
/** Short-lived PUBLIC observation only. Validate the network and canonical
 * block through transport (not a stored header), then pin every eligible read
 * to its hash. Nothing observed is accepted until a fresh exit check succeeds.
 * Moving state is never frozen, and financial sends are forbidden in scope. */
export async function withPublicCanonicalBlockReadsV25(endpoint,rawHead,work){
 need(typeof work==='function','READ_SCOPE');endpoint=resolvePublicTestnetRpcRouteV1(endpoint);
 if(endpoint!==PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint)return work();
 need(rawHead&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(rawHead.number)&&/^0x[0-9a-f]{64}$/.test(rawHead.hash),'READ_SCOPE');
 const head=Object.freeze({number:rawHead.number,hash:rawHead.hash}),parent=canonicalReadScopeV25.getStore();
 if(parent?.endpoint===endpoint&&parent.head.number===head.number&&parent.head.hash===head.hash){need(parent.active,'READ_SCOPE_CLOSED');return work();}
 const {observe}=rpcTransport(endpoint),scope={endpoint,head,active:false,header:null};
 const check=async()=>{
  const actual=await observe('eth_getBlockByNumber',[head.number,false]);need(actual?.number===head.number&&actual.hash===head.hash,'READ_SCOPE_CANONICAL');scope.header=structuredClone(actual);
  // Preserve the persistent cache's canonical header association even though
  // grouped state reads no longer fetch that header individually.
  await readPublicFinalizedCachedV16(endpoint,'eth_getBlockByNumber',[head.number,false],undefined,(method,params,signal)=>method==='eth_getBlockByNumber'&&params[0]===head.number?Promise.resolve(actual):observe(method,params,signal));
 };
 const [chain,genesis]=await Promise.all([observe('eth_chainId',[]),observe('eth_getBlockByNumber',['0x0',false])]);
 need(chain==='0xaa36a7'&&genesis?.hash===PUBLIC_SEPOLIA_RPC_ROUTE_V1.genesis,'READ_SCOPE_NETWORK');scope.chain=chain;scope.genesis=structuredClone(genesis);await check();scope.active=true;
 try{return await canonicalReadScopeV25.run(scope,async()=>{const result=await work();await check();return result;});}
 finally{scope.active=false;}
}
export function nativeEsploraV1(endpoint){const base=endpoint.replace(/\/$/,'');return(path,options)=>{need(typeof path==='string'&&/^\/[a-zA-Z0-9/_:.-]+$/.test(path)&&path.length<=300,'HTTP_PATH');return request(base+path,{...options,readOnly:(options?.method??'GET')==='GET'});};}
