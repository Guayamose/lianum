/** Bounded transport batching of independent, explicit-block observations.
 * No latest/pending reads, sends, result cache or extra retry path. */
import {need,fail} from './common-v1.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1} from './public-testnet-rpc-route-v1.mjs';
const waiting=new Map(),methods=new Set(['eth_call','eth_getCode','eth_getStorageAt']);
const cancellation=()=>{try{fail('CANCELLED');}catch(error){return error;}};
export function batchPublicBlockReadV10(endpoint,payload,signal,send){
 payload=JSON.parse(JSON.stringify(payload));
 const block=payload.params.at(-1);
 const fixed=typeof block==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(block)||block&&Object.keys(block).length===2&&block.requireCanonical===true&&/^0x[0-9a-f]{64}$/.test(block.blockHash??'');
 if(endpoint!==PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint||!methods.has(payload.method)||!fixed)return send(payload,signal,1);
 if(signal?.aborted)return Promise.reject(cancellation());
 return new Promise((resolve,reject)=>{
  let group=waiting.get(endpoint);
  if(!group){group={rows:[],timer:null};waiting.set(endpoint,group);group.timer=setTimeout(()=>flush(endpoint,group),2);}
  const row={payload,signal,send,done:false,control:null};
  const finish=(ok,value)=>{if(row.done)return;row.done=true;clearTimeout(row.timer);signal?.removeEventListener('abort',row.abort);if(row.control&&group.rows.every(item=>item.done))row.control.abort();(ok?resolve:reject)(value);};
  row.finish=finish;row.abort=()=>finish(false,cancellation());
  row.timer=setTimeout(()=>{try{fail('HTTP_TIMEOUT');}catch(error){finish(false,error);}},15000);
  group.rows.push(row);signal?.addEventListener('abort',row.abort,{once:true});
  if(signal?.aborted)row.abort();
  if(group.rows.length===4)flush(endpoint,group);
 });
}
async function flush(endpoint,group){
 if(waiting.get(endpoint)!==group)return;
 waiting.delete(endpoint);clearTimeout(group.timer);
 const rows=group.rows.filter(row=>!row.done);if(!rows.length)return;
 const control=new AbortController();for(const row of rows)row.control=control;
 try{
  const payload=rows.length===1?rows[0].payload:rows.map(row=>row.payload);
  const result=await rows[0].send(payload,control.signal,rows.length);
  const replies=rows.length===1?[result]:result;
  need(Array.isArray(replies)&&replies.length===rows.length,'RPC_FAILED');
  const byId=new Map(replies.map(reply=>[reply?.id,reply]));
  need(byId.size===rows.length&&rows.every(row=>byId.get(row.payload.id)?.jsonrpc==='2.0'),'RPC_FAILED');
  for(const row of rows)row.finish(true,byId.get(row.payload.id));
 }catch(error){for(const row of rows)row.finish(false,error);}
}
