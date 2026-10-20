/** Actual transport functions under virtual time; no keys or network requests. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
async function extract(path,name){const text=await readFile(new URL(path,import.meta.url),'utf8'),tree=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit);}visit(tree);assert.ok(found);return ts.transpileModule(found.getText(tree).replace(/^export /,'')+';'+name,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;}
const source={native:await extract('../src/api/public-wallet-session-api-v1.ts','readPublicWalletJsonV1'),shares:await extract('../src/api/device-sepolia-defi-shares-api-v4.mjs','post'),financial:await extract('../src/api/device-sepolia-defi-financial-api-v7.mjs','post'),note:await extract('../src/api/device-external-flat-note-api-v1.mjs','post')};
function transport(code){const requests=[],owner='host-owner',d={origin:'https://host.invalid',pairingId:'host-pairing'};const fetch=async(url,init)=>{requests.push({url,...init});return new Promise((_,reject)=>{if(init.signal.aborted)reject(Error('HOST_ABORTED'));else init.signal.addEventListener('abort',()=>reject(Error('HOST_ABORTED')),{once:true});});};const context={AbortController,TextEncoder,TextDecoder,Uint8Array,Error,Promise,Date,JSON,Set,live:signal=>{if(signal?.aborted)throw Error('HOST_CLOSED');return owner;},need:value=>{if(!value)throw Error('HOST_BINDING');},fail:code=>{throw Error(code);},controllers:new Set(),d,original:d,sepoliaDefi:true,sepoliaReviewReference:null,publicWalletSessionOriginV1:()=>d.origin,fetch,fetchImpl:fetch,setTimeout,clearTimeout};return{call:vm.runInNewContext(code,context),requests};}
test('native submit waits sixty seconds for one original POST; all other generic requests retain twenty seconds',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const [path,timeout]of [['/v1/native/submit',60000],['/v1/native/prepare',20000],['/v1/auth/challenge',20000]]){
  const f=transport(source.native),body='{"original":"signed-envelope"}',result=assert.rejects(f.call(path,body,new AbortController().signal),/HOST_ABORTED/);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].body,body);assert.equal(f.requests[0].method,'POST');
  t.mock.timers.tick(timeout-1);assert.equal(f.requests[0].signal.aborted,false);t.mock.timers.tick(1);await result;assert.equal(f.requests.length,1);
 }
 const f=transport(source.native),abort=new AbortController(),result=assert.rejects(f.call('/v1/native/submit','{}',abort.signal),/HOST_ABORTED/);abort.abort();await result;assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.requests.length,1);
});
test('DeFi preparation and reads can finish warming, while financial-effect waits keep their existing bounds',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const [api,path,timeout]of [['financial','defi-proposals',120000],['financial','withdrawal-review',120000],['financial','financial-observe',60000],['financial','withdrawal-arm',30000],['financial','redeem-submit',30000],['financial','financial-submit',30000],['shares','defi-reviews',120000],['shares','defi-read-review',60000],['shares','defi-authorizations',15000],['note','reviews',120000],['note','status',60000]]){
  const f=transport(source[api]),result=assert.rejects(f.call(path,{reference:'original-review'}),/HOST_ABORTED|REQUEST_CLOSED|REQUEST_TIMEOUT/);
  assert.equal(f.requests.length,1);t.mock.timers.tick(timeout-1);assert.equal(f.requests[0].signal.aborted,false,api+':'+path);t.mock.timers.tick(1);await result;assert.equal(f.requests.length,1,'a longer wait never replays the operation');
 }
});

const graphSource=await extract('../src/api/device-paged-graph-api-v3.mjs','createDevicePagedGraphApiV3');
function graphTransport(blockedPath){
 const descriptor={origin:'https://host.invalid',pairingId:'host',deadlineMs:Date.now()+3600000},requests=[];
 const fetchImpl=async(url,init)=>{
  requests.push({url,...init});
  if(url.endsWith('/'+blockedPath))return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('HOST_ABORTED')),{once:true}));
  assert.ok(url.endsWith('/challenges'));return{status:200,text:async()=>JSON.stringify({...JSON.parse(init.body),descriptor,expiresAt:Date.now()+15000})};
 };
 const identity=value=>value,need=value=>{if(!value)throw Error('HOST_BINDING');};
 // Cryptographic ports are explicit HOST stubs. Exercise the actual API's
 // request, timer, one-shot consent ownership and close path, not crypto here.
 const P={pagedOwnerExactV3:identity,normalizeDevicePagedDescriptorV3:identity,devicePagedNowV3:Date.now,awaitDevicePagedIssuedTimeV3:async()=>{},pagedOwnerWipeV3:()=>{}},C={snapshotDevicePagedGraphCommandV3:identity,normalizeDevicePagedGraphDraftV3:identity,normalizeDevicePagedGraphConsentV3:identity,validateDevicePagedGraphConsentFreshV3:identity,devicePagedGraphProvesV3:action=>action==='PROVE_R'};
 const context={P,C,need,digest:()=> 'host-digest',clients:new WeakMap(),consents:new WeakMap(),observations:new WeakMap(),privateReplies:new WeakMap(),unconfirmedReplies:new WeakMap(),pairings:new WeakMap(),createDevicePagedGraphReplyRecipientV3:async()=>({publicKey:'host'}),closeDevicePagedGraphReplyRecipientV3:()=>{},sealDevicePagedGraphCommandV3:async()=> 'host-ciphertext',AbortController,Error,Promise,WeakMap,Map,Set,JSON,Object,setTimeout,clearTimeout};
 const create=vm.runInNewContext(graphSource,context);return{api:create({descriptor,fetchImpl}),requests};
}
test('graph preparation can warm before consent, while accepted effects are never automatically replayed',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const flush=()=>new Promise(resolve=>setImmediate(resolve));
 for(const [path,action,timeout]of [['challenges','PROVE_R',120000],['operations','OBSERVE_GRAPH',60000],['operations','PREPARE_NATIVE_PAGE',60000],['operations','PROVE_R',900000],['operations','RESERVE_R',15000],['operations','STOP_AUTOMATION',15000]]){
  const f=graphTransport(path),challenge=f.api.challenge(action,'graph','job','root',0,{}),promise=path==='challenges'?challenge: f.api.submit(await challenge,'host-signature',{}),result=assert.rejects(promise,/MOBILE_PAGED_GRAPH_SERVICE_UNAVAILABLE/);await flush();
  const request=f.requests.at(-1);assert.ok(request.url.endsWith('/'+path));assert.equal(request.method,'POST');t.mock.timers.tick(timeout-1);assert.equal(request.signal.aborted,false,action);t.mock.timers.tick(1);await result;assert.equal(f.requests.filter(row=>row.url.endsWith('/'+path)).length,1);await f.api.close();
 }
});
