/** Original Native receiver queue and protected keyset. RPC lifecycle and Kernel
 * command issuance are explicit HOST boundaries; this routing regression signs
 * nothing. Genuine command branding and FUND receipt are exercised by graph4. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const keyURL=new URL('../../../src/chains/public-testnet/key-store-v1.mjs',import.meta.url).href;
const actualKeys=await import(keyURL),mixedTokens=new WeakSet(),rootTokens=new WeakSet(),requests=new WeakMap(),queue=[];
let waiter,closeRPC,acknowledge,runtime;
const closed=new Promise(resolve=>closeRPC=resolve),ack=new Promise(resolve=>acknowledge=resolve);
const lifecycle={closed,acknowledge,async readSourceRequest(){if(queue.length)return queue.shift();return new Promise(resolve=>waiter=resolve);},readSourceRequestData(token){return requests.get(token).data;},async finishSourceRequest(token,result,error){const r=requests.get(token);if(error)r.reject(error);else r.resolve(result);}};
const routes=[];
mock.module(keyURL,{exports:{...actualKeys,
 openOriginalPublicCompiledReceiverSignerV4:async()=>Object.freeze({}),closeOriginalPublicCompiledReceiverSignerV4:async()=>{},finalizeOriginalPublicCompiledReceiverV4:async()=>Object.freeze({}),
 openOriginalPublicPagedSourceSignerV4:async()=>Object.freeze({}),closeOriginalPublicPagedSourceSignerV4:async()=>{},observeOriginalPublicPagedSourceV4:async()=>({policySHA256:'HOST',sponsorship:{}}),
 executeOriginalPublicPagedSourceV4:async(_signer,token)=>{assert.ok(rootTokens.has(token),'HOST_UNRECOGNIZED_ROOT_COMMAND');routes.push('ROOT');return Object.freeze({namespace:'ROOT'});},
 executeOriginalPublicUniswapMixedSourceCallV4:async(_signer,token)=>{assert.ok(mixedTokens.has(token),'HOST_UNRECOGNIZED_MIXED_COMMAND');routes.push('MIXED');return Object.freeze({namespace:'MIXED'});},
}});
mock.module(new URL('../../../src/operations/local/sepolia-uniswap-mixed-source-kernel-v4.mjs',import.meta.url).href,{exports:{isOriginalSepoliaUniswapMixedSourceCommandV4:token=>mixedTokens.has(token)}});
mock.module(new URL('../../../src/chains/public-testnet/adapters-v1.mjs',import.meta.url).href,{exports:{publicPagedNativeAdapterV1:()=>({identify:async()=>{}})}});
mock.module(new URL('../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs',import.meta.url).href,{exports:{createOriginalPagedSepoliaRpcV4:async()=>{runtime=Object.freeze({async close(){closeRPC();await ack;}});return{runtime,lifecycle};}}});

function request(command,composition){const token=Object.freeze(Object.create(null));return new Promise((resolve,reject)=>{requests.set(token,{data:Object.freeze({label:'HOST route',transaction:Object.freeze({}),command,...(composition?{composition}:{})}),resolve,reject});if(waiter){const deliver=waiter;waiter=null;deliver(token);}else queue.push(token);});}
test('Original Native queue routes by canonical owner classification, preserving Root and rejecting copied tokens despite caller composition',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lianum-source-routing-'));let native,receiver;
 try{
  await actualKeys.initializePublicPagedServerKeysV1(join(directory,'keys'));
  const Native=await import('../../../src/providers/paged-public-testnet-runtimes-v1.mjs');native=await Native.createOriginalPagedPublicTestnetRuntimesV1({directory});receiver=await Native.createOriginalPagedPublicSepoliaReceiverV4(native);
  await Native.dispatchOriginalPagedPublicSepoliaBootstrapV4(receiver,'FINALIZE',[Object.freeze({})]);await Native.configureOriginalPagedPublicSepoliaSourceV4(receiver,Object.freeze({}));
  const root=Object.freeze(Object.create(null)),mixed=Object.freeze(Object.create(null));rootTokens.add(root);mixedTokens.add(mixed);
  assert.deepEqual(await request(root,'UNISWAP_MIXED_V4'),{namespace:'ROOT'});
  assert.deepEqual(await request(mixed),{namespace:'MIXED'});
  await assert.rejects(request({...mixed},'UNISWAP_MIXED_V4'),/HOST_UNRECOGNIZED_ROOT_COMMAND/);
  await assert.rejects(request({composition:'UNISWAP_MIXED_V4'}),/HOST_UNRECOGNIZED_ROOT_COMMAND/);
  assert.deepEqual(routes,['ROOT','MIXED']);
 }finally{if(waiter){const done=waiter;waiter=null;done(null);}await receiver?.close();await native?.close();await rm(directory,{recursive:true,force:true});}
});
