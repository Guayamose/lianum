/** PUBLIC read data only. Each reuse observes the canonical block again;
 * misses use EIP-1898 so a reorg cannot bind a number's old result to a new hash.
 * No moving tags, balances, nonces, receipts, permissions or writes are cached. */
import {createHash} from 'node:crypto';
import {need,signalCurrent} from './common-v1.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1 as route} from './public-testnet-rpc-route-v1.mjs';
const entries=new Map(),seen=new Set(),targets=new Set(),byMethod=new Map();
const MAX_ENTRIES=4096,MAX_BYTES=32*1024*1024,MAX_SEEN=65536;
let bytes=0,complete=true;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quantity=v=>typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(v);
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v);
function record(method,params){
 const name=typeof method==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(method)?method:'OTHER';
 let row=byMethod.get(name);if(!row){if(byMethod.size>=64)return null;row={requests:0,uniqueRequests:0,repeatedRequests:0,hits:0,misses:0};byMethod.set(name,row);}row.requests++;
 const key=hash([method,params]);if(seen.has(key))row.repeatedRequests++;else if(seen.size<MAX_SEEN){seen.add(key);row.uniqueRequests++;}else complete=false;
 const target=method==='eth_call'?params[0]?.to:params[0];if(address(target)&&targets.size<MAX_SEEN)targets.add(hash(target));
 return row;
}
export function readPublicBlockCacheMetricsV12(){return Object.freeze({
 blockReadCacheEntries:entries.size,blockReadCacheBytes:bytes,
 uniqueReadTargets:targets.size,requestUniquenessComplete:complete,
 publicReadRequestsByMethod:Object.freeze(Object.fromEntries([...byMethod].map(([k,v])=>[k,Object.freeze({...v})]))),
});}
export async function readPublicBlockCachedV12(endpoint,method,rawParams,signal,invoke,observedHead){
 if(endpoint!==route.effectiveEndpoint)return invoke(method,rawParams,signal);
 signalCurrent(signal);const params=JSON.parse(JSON.stringify(rawParams)),metrics=record(method,params),block=params.at(-1);
 const eligible=quantity(block)&&(
  method==='eth_getCode'&&params.length===2&&address(params[0])||
  method==='eth_getStorageAt'&&params.length===3&&address(params[0])&&quantity(params[1])||
  method==='eth_call'&&params.length===2&&params[0]&&Object.getPrototypeOf(params[0])===Object.prototype&&address(params[0].to)
 );
 if(!eligible)return invoke(method,params,signal);
 const head=observedHead?.number===block?observedHead:await invoke('eth_getBlockByNumber',[block,false],signal);
 need(head?.number===block&&typeof head.hash==='string'&&/^0x[0-9a-f]{64}$/.test(head.hash),'RPC_FAILED');
 signalCurrent(signal);
 const pinned=[...params.slice(0,-1),{blockHash:head.hash,requireCanonical:true}],key=hash([endpoint,method,pinned]);
 const prior=entries.get(key);
 if(prior){entries.delete(key);entries.set(key,prior);if(metrics)metrics.hits++;return prior.value;}
 if(metrics)metrics.misses++;
 const value=await invoke(method,pinned,signal);signalCurrent(signal);
 need(typeof value==='string'&&/^0x(?:[0-9a-f]{2})*$/.test(value),'RPC_FAILED');
 if(method==='eth_getStorageAt')need(value.length===66,'RPC_FAILED');
 const size=key.length+value.length;
 if(size<=1024*1024){
  const concurrent=entries.get(key);if(concurrent)bytes-=concurrent.size;
  entries.delete(key);entries.set(key,{value,size});bytes+=size;
  while(entries.size>MAX_ENTRIES||bytes>MAX_BYTES){const oldest=entries.keys().next().value;bytes-=entries.get(oldest).size;entries.delete(oldest);}
 }
 return value;
}
