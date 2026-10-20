/** Actual loopback HTTP framing. Product admission is an explicit HOST seam;
 * this suite creates no source, financial authorization or transaction. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';

test('successor HTTP bounds framing and routes only through the same Original product',{timeout:10000},async t=>{
 const origin='https://wallet.example',product=Object.freeze({}),ingress=Object.freeze({}),calls=[];
 const port={origin,async dispatch(pairingId,action,body){calls.push({pairingId,action,body});if(body.reject)throw Error('PRIVATE_DETAIL_NOT_PUBLIC');return{profile:'HOST_STORAGE_RESPONSE',action,pairingId};}};
 t.mock.module(new URL('../../../src/api/mobile/paged-remote-ingress-binding-v4.mjs',import.meta.url).href,{exports:{readOriginalPagedRemoteIngressBindingV4(value){assert.strictEqual(value,ingress);return{origin};}}});
 const {createDevicePagedSourceSuccessorHttpV35:create,readDevicePagedSourceSuccessorHttpV35:binding}=await import('../../../src/api/mobile/device-paged-source-successor-http-v35.mjs');
 assert.throws(()=>create({},ingress));const http=create(port,ingress);assert.equal(binding(http).origin,origin);assert.throws(()=>binding({...http}));
 let received;const server=createServer((request,response)=>{received={headers:request.headers,url:request.url};return http.handler(request,response);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await http.close();await new Promise(resolve=>server.close(resolve));});
 const endpoint='http://127.0.0.1:'+server.address().port,headers={host:'wallet.example',origin,'content-type':'application/json','x-lianum-paged-pairing-id':'old-pairing-host-01'},path='/v1/mobile/paged-owner/source-successor/';
 const post=(tail,body={},extra={})=>new Promise((resolve,reject)=>{const data=JSON.stringify(body),req=request(endpoint+path+tail,{method:'POST',headers:{...headers,'content-length':Buffer.byteLength(data),...extra}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});req.on('error',reject);req.end(data);});
 let response=await post('challenges',{request:{action:'PREPARE_SUCCESSOR',intentId:'host-intent-01'}});
 assert.equal(response.status,200,JSON.stringify(received));assert.deepEqual(await response.json(),{profile:'HOST_STORAGE_RESPONSE',action:'challenge',pairingId:'old-pairing-host-01'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls.length,1);
 for(const[tail,body,extra,status]of [['payments',{}, {},404],['requests',{}, {origin:'https://other.example'},403],['requests',{}, {'content-type':'text/plain'},403],['requests',{padding:'x'.repeat(8192)}, {},403],['requests',{}, {'x-lianum-paged-pairing-id':''},403]]){response=await post(tail,body,extra);assert.equal(response.status,status);await response.text();}
 assert.equal(calls.length,1,'bad framing never reaches the product');
 response=await post('requests',{reject:true});assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'PAGED_MIXED_SUCCESSOR_REJECTED'});
 await http.close();response=await post('challenges',{});assert.equal(response.status,403);assert.equal(calls.length,2);
});
