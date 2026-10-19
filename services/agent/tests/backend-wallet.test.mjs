import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createECDH,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {openAgentStore} from '../../../packages/agent/src/store.mjs';
import {createAgentRuntime} from '../../../packages/agent/src/runtime.mjs';
import {createAgentBackendClient} from '../src/backend-client.mjs';

const context=(at,network='testnet',total='12000')=>({network,currency:'EUR',observedAt:at,marketObservedAt:at,reading:false,totals:{total,available:total,reserved:'0',occupied:'0'},assets:[{symbol:'ETH',total,available:total,reserved:'0',occupied:'0'}],operations:{pendingTransfers:2,plan:null}});
function setup(t,snapshot){
 const directory=mkdtempSync(join(tmpdir(),'agent-backend-')),now=1800000000000,store=openAgentStore({directory,now:()=>now}),key=createECDH('secp256k1');key.generateKeys();const devicePublicKey=key.getPublicKey('hex'),identity={devicePublicKey,ownerId:createHash('sha256').update(devicePublicKey).digest('hex'),connections:[]};
 let required=[{type:'function_call',name:'read_wallet',arguments:'{}',turn_id:'turn_wallet',call_id:'call_wallet'}];const outputs=[];
 const provider={model:'fixture',retrieve:async()=>({id:'session_wallet',status:'in_progress',required_actions:required}),result:async(_session,_call,result)=>outputs.push(result),items:async()=>[]};
 const runtime=createAgentRuntime({store,provider,backend:{snapshot},now:()=>now}),state=store.ensure(devicePublicKey);state.sessionId='session_wallet';state.sessionStatus='ACTIVE';state.context=context(now-600000);store.save(state.owner,state);
 t.after(async()=>{await runtime.close();store.close();rmSync(directory,{recursive:true,force:true});});
 return {runtime,store,identity,now,outputs,async link(enabled=true,network='testnet'){return runtime.dispatch(identity,'/v1/agent/wallet',{enabled,network,currency:'EUR',expiresAt:enabled?now+86400000:null,financialPermission:false});},async tick(){store.update(identity.ownerId,s=>s.nextCheckAt=0);await runtime.tick();},required(value){required=value;}};
}
test('a backend read requires enrollment and remains owner scoped without the mobile connected',async t=>{
 const reads=[];let f;f=setup(t,async(owner,network)=>{reads.push({owner,network});return {source:'BACKEND_RPC',financialPermission:false,context:context(f.now,network),operations:[]};});
 await f.tick();assert.equal(reads.length,0);assert.equal(f.outputs[0].output.source,'MOBILE_OBSERVATION');
 await f.link();f.required([{type:'function_call',name:'read_wallet',arguments:'{}',turn_id:'turn_new',call_id:'call_new'}]);await f.tick();
 assert.deepEqual(reads,[{owner:f.identity.ownerId,network:'testnet'}]);assert.equal(f.outputs.at(-1).output.source,'BACKEND_RPC');assert.equal(f.outputs.at(-1).output.stale,false);assert.equal(f.outputs.at(-1).output.totals.total,'12000');
 await f.tick();assert.equal(reads.length,1,'recovering a saved function result never repeats its RPC reads');
 const state=await f.runtime.dispatch(f.identity,'/v1/agent/state',{});assert.equal(state.walletAccess.links.testnet.enabled,true);assert.equal(state.walletAccess.links.mainnet,undefined);
});
test('a backend failure is explicit and cannot relabel the mobile observation as fresh',async t=>{
 const f=setup(t,async()=>{throw Error('fixture unavailable');});await f.link();await f.tick();
 const result=f.outputs.at(-1).output;assert.equal(result.source,'MOBILE_OBSERVATION');assert.equal(result.stale,true);assert.equal(result.refreshError,'NATIVE_AGENT_BACKEND_UNAVAILABLE');assert.equal(result.observedAt,f.now-600000);
});
test('a response for another environment or with an impossible timestamp is rejected',async t=>{
 for(const wrong of ['mainnet','future']){
  let f;f=setup(t,async()=>({source:'BACKEND_RPC',financialPermission:false,context:context(f.now+(wrong==='future'?60000:0),wrong==='mainnet'?'mainnet':'testnet')}));await f.link();await f.tick();
  assert.equal(f.outputs.at(-1).output.source,'MOBILE_OBSERVATION');assert.equal(f.store.load(f.identity.ownerId).backendSnapshot,undefined);
 }
});
test('revocation while a read is in flight discards the result and clears both environments',async t=>{
 let resolve,opened;const started=new Promise(r=>opened=r);let f;f=setup(t,async()=>{opened();return new Promise(r=>resolve=r);});await f.link();await f.link(true,'mainnet');
 const work=f.tick();await started;await f.link(false);resolve({source:'BACKEND_RPC',financialPermission:false,context:context(f.now)});await work;
 assert.equal(f.outputs.at(-1).output.source,'MOBILE_OBSERVATION');assert.deepEqual(f.store.load(f.identity.ownerId).walletLinks,{});assert.equal(f.store.load(f.identity.ownerId).backendSnapshot,undefined);
});
test('backend registration rejects financial authority and expired enrollment',async t=>{
 const f=setup(t,async()=>{throw Error('never');});
 const valid={enabled:true,network:'testnet',currency:'EUR',expiresAt:f.now+1000,financialPermission:false};
 for(const body of [{...valid,financialPermission:true},{...valid,expiresAt:f.now},{...valid,ownerId:f.identity.ownerId}])await assert.rejects(f.runtime.dispatch(f.identity,'/v1/agent/wallet',body),/NATIVE_AGENT_/);
});
test('the loopback adapter uses the service identity and rejects network confusion',async t=>{
 const received=[],token='fixture-backend-token-with-at-least-thirty-two-bytes',now=1800000000000;let wrong=false;
 const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);received.push({url:req.url,token:req.headers.authorization,...JSON.parse(Buffer.concat(chunks).toString())});res.setHeader('content-type','application/json');res.end(JSON.stringify({profile:'LIANUM_AGENT_BACKEND_SNAPSHOT_V1',source:'BACKEND_RPC',financialPermission:false,context:context(now,wrong?'mainnet':'testnet'),operations:[]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const client=createAgentBackendClient({url:'http://127.0.0.1:'+server.address().port,token}),ownerId='a'.repeat(64);assert.equal((await client.snapshot(ownerId,'testnet')).context.network,'testnet');assert.deepEqual(received[0],{url:'/snapshot',token:'Bearer '+token,ownerId,network:'testnet'});
 wrong=true;await assert.rejects(client.snapshot(ownerId,'testnet'),/BACKEND_NETWORK/);assert.throws(()=>createAgentBackendClient({url:'https://example.com',token}),/CONFIGURATION/);
});
