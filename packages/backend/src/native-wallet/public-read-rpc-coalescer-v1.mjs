/** Share an in-flight public metadata read only. Completed answers are never
 * cached: the next canonicality check must make a new network observation. */
import {fail,need} from './common-v1.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1} from './public-testnet-rpc-route-v1.mjs';
import {readPublicBlockCacheMetricsV12} from './public-block-read-cache-v12.mjs';
import {readPublicFinalizedCacheMetricsV16} from './public-finalized-read-cache-v16.mjs';
import {readPublicSepoliaSchedulerMetricsV25} from './public-read-rpc-scheduler-v1.mjs';

const active=new Map();
const metadata=new Set(['eth_chainId','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getTransactionReceipt','eth_getTransactionByHash']);
const metrics={rpcScopedHeaderHitsV27:0,rpcCalls:0,sharedMetadataReads:0,uniqueMetadataReads:0,httpReadAttempts:0,httpSendAttempts:0,httpReadRpcUnits:0,httpBatchReadAttempts:0,httpReadHeadersMsV25:0,httpReadHeadersMaxMsV25:0,httpReadResponsesV25:0};
const callsByMethod=new Map();
export function readPublicRpcMetricsV1(){return Object.freeze({...metrics,inFlightMetadataReads:active.size,rpcCallsByMethod:Object.freeze(Object.fromEntries(callsByMethod)),...readPublicBlockCacheMetricsV12(),...readPublicFinalizedCacheMetricsV16(),...readPublicSepoliaSchedulerMetricsV25()});}
export function recordPublicScopedHeaderHitV27(){metrics.rpcScopedHeaderHitsV27++;}
export function recordPublicRpcHeadersV25(endpoint,readOnly,milliseconds){if(endpoint!==PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint||!readOnly||!Number.isFinite(milliseconds)||milliseconds<0)return;const ms=Math.round(milliseconds);metrics.httpReadResponsesV25++;metrics.httpReadHeadersMsV25+=ms;metrics.httpReadHeadersMaxMsV25=Math.max(metrics.httpReadHeadersMaxMsV25,ms);}
export function recordPublicRpcWireAttemptV1(endpoint,readOnly,units=1){if(endpoint===PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint){metrics[readOnly?'httpReadAttempts':'httpSendAttempts']++;if(readOnly){metrics.httpReadRpcUnits+=units;if(units>1)metrics.httpBatchReadAttempts++;}}}
const cancelled=()=>{try{fail('CANCELLED');}catch(error){return error;}};
export function sharePublicMetadataReadV1(endpoint,method,params,signal,perform){
 if(endpoint===PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint){metrics.rpcCalls++;const bucket=typeof method==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(method)&&(callsByMethod.has(method)||callsByMethod.size<64)?method:'OTHER';callsByMethod.set(bucket,(callsByMethod.get(bucket)??0)+1);}
 const pinned=params.at(-1),fixedCall=['eth_call','eth_getStorageAt'].includes(method)&&pinned?.requireCanonical===true&&/^0x[0-9a-f]{64}$/.test(pinned.blockHash??'');
 if(endpoint!==PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint||!metadata.has(method)&&!fixedCall)return perform(params,signal);
 if(signal?.aborted)return Promise.reject(cancelled());
 // Snapshot once; accessors cannot give the key and the wire different inputs.
 const serialized=JSON.stringify(params),snapshot=JSON.parse(serialized),key=JSON.stringify([endpoint,method,serialized]);
 let entry=active.get(key);
 if(entry?.control.signal.aborted){if(active.get(key)===entry)active.delete(key);entry=null;}
 if(!entry){
  need(active.size<512,'RPC_METADATA_READ_BOUND');
  entry={control:new AbortController(),waiters:0,settled:false,promise:null};const own=entry;
  active.set(key,own);
  metrics.uniqueMetadataReads++;
  own.promise=Promise.resolve().then(()=>perform(snapshot,own.control.signal)).finally(()=>{own.settled=true;if(active.get(key)===own)active.delete(key);});
 }else metrics.sharedMetadataReads++;
 entry.waiters++;
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=(ok,value)=>{
   if(done)return;done=true;signal?.removeEventListener('abort',onAbort);entry.waiters--;
   if(!entry.waiters&&!entry.settled)entry.control.abort();
   if(ok){try{resolve(value&&typeof value==='object'?structuredClone(value):value);}catch(error){reject(error);}}else{const error=value instanceof Error?Object.defineProperties(new Error(value.message),Object.getOwnPropertyDescriptors(value)):value;reject(error);}
  };
  const onAbort=()=>finish(false,cancelled());
  signal?.addEventListener('abort',onAbort,{once:true});
  entry.promise.then(value=>finish(true,value),error=>finish(false,error));
  if(signal?.aborted)onAbort();
 });
}
