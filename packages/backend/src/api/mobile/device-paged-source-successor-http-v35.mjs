/** Bounded transport to the Original product. A successor request provisions
 * storage only; this route cannot submit a financial operation or select keys. */
import assert from 'node:assert/strict';
import {readOriginalPagedRemoteIngressBindingV4} from './paged-remote-ingress-binding-v4.mjs';

const bindings=new WeakMap();
const routes=Object.freeze({
 '/v1/mobile/paged-owner/source-successor/challenges':'challenge',
 '/v1/mobile/paged-owner/source-successor/requests':'submit',
});
const MAX_BODY=8192,MAX_REPLY=65536;
const visibleErrors=new Set(['PAGED_MIXED_SUCCESSOR_WALLET_QUOTA','MIXED_SUCCESSOR_SIGNED_WALLET_QUOTA','PAGED_MIXED_SUCCESSOR_NOT_SETTLED','PAGED_MIXED_SUCCESSOR_BUSY']);

export function createDevicePagedSourceSuccessorHttpV35(port,ingress){
 assert.equal(arguments.length,2);
 assert.deepEqual(Object.keys(port).sort(),['dispatch','origin']);assert.equal(typeof port.dispatch,'function');
 const {origin,dispatch}=port,transport=readOriginalPagedRemoteIngressBindingV4(ingress),host=new URL(origin).host;
 assert.equal(transport.origin,origin,'PAGED_MIXED_SUCCESSOR_HTTP_ORIGIN');
 let closed=false;const active=new Set();
 function send(response,status,value){
  if(response.destroyed||response.writableEnded)return;
  const bytes=Buffer.from(JSON.stringify(value));
  assert.ok(bytes.length<=MAX_REPLY,'PAGED_MIXED_SUCCESSOR_HTTP_REPLY_BOUND');response.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff'});response.end(bytes);
 }
 async function handle(request,response){
  const chunks=[];let bytes,timer;
  try{
   assert.ok(!closed,'PAGED_MIXED_SUCCESSOR_HTTP_CLOSED');
   readOriginalPagedRemoteIngressBindingV4(ingress);
   assert.equal(request.headers.host,host);assert.ok(request.headers.origin===undefined||request.headers.origin===origin);
   if(request.method!=='POST'||!Object.hasOwn(routes,request.url))return send(response,404,{error:'PAGED_MIXED_SUCCESSOR_ROUTE_NOT_FOUND'});
   const pairingId=request.headers['x-lianum-paged-pairing-id'];assert.ok(typeof pairingId==='string'&&/^[a-zA-Z0-9_.-]{1,128}$/.test(pairingId));
   assert.ok(/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers['content-type']??''));assert.equal(request.headers['content-encoding'],undefined);assert.equal(request.headers['transfer-encoding'],undefined);
   const length=request.headers['content-length'];assert.ok(typeof length==='string'&&/^[1-9][0-9]{0,4}$/.test(length)&&Number(length)<=MAX_BODY);
   timer=setTimeout(()=>request.destroy(),15000);timer.unref?.();let size=0;
   for await(const chunk of request){size+=chunk.length;assert.ok(size<=MAX_BODY&&size<=Number(length));chunks.push(chunk);}
   clearTimeout(timer);timer=null;assert.equal(size,Number(length));assert.ok(!closed&&!request.aborted);
   bytes=Buffer.concat(chunks);const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));bytes.fill(0);bytes=null;
   const result=await dispatch(pairingId,routes[request.url],body);
   assert.ok(!closed&&!response.destroyed);return send(response,200,result);
  }catch(error){if(!response.headersSent&&!response.destroyed)send(response,403,{error:visibleErrors.has(error?.message)?error.message:'PAGED_MIXED_SUCCESSOR_REJECTED'});}
  finally{clearTimeout(timer);bytes?.fill(0);for(const chunk of chunks)chunk.fill(0);}
 }
 const http=Object.freeze({profile:'DEVICE_PAGED_SOURCE_SUCCESSOR_HTTP_V35',handler(request,response){const work=handle(request,response);active.add(work);work.finally(()=>active.delete(work)).catch(()=>{});return work;},async close(){closed=true;await Promise.allSettled([...active]);}});
 bindings.set(http,{origin,ingress});return http;
}
export function readDevicePagedSourceSuccessorHttpV35(http){assert.equal(arguments.length,1);const value=bindings.get(http);assert.ok(value,'PAGED_MIXED_SUCCESSOR_ORIGINAL_HTTP');return Object.freeze({...value});}
