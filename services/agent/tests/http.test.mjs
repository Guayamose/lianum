import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentHttpServer} from '../src/http.mjs';
import {createAgentGatewayV1} from '../../../packages/backend/src/public-wallet/agent-gateway-v1.mjs';
test('private agent hop authenticates before reading and binds the gateway identity',async t=>{
 const received=[],token='host-fixture-gateway-secret-32-bytes-minimum';
 const runtime={capabilities:()=>({configured:false}),dispatch:async(identity,path,body)=>{received.push({identity,path,body});return {accepted:true};}};
 const service=createAgentHttpServer({runtime,token}),address=await service.listen({port:0});t.after(()=>service.close());const url='http://127.0.0.1:'+address.port;
 assert.equal((await fetch(url+'/dispatch',{method:'POST',body:'not JSON'})).status,403);assert.equal(received.length,0);
 const gateway=createAgentGatewayV1({url,token}),identity={ownerId:'a'.repeat(64),devicePublicKey:'public-fixture',connections:[]};assert.deepEqual(await gateway.capabilities(),{configured:false});assert.deepEqual(await gateway.dispatch(identity,'/v1/agent/state',{}),{accepted:true});assert.deepEqual(received[0],{identity,path:'/v1/agent/state',body:{}});
 assert.throws(()=>createAgentGatewayV1({url:'http://example.com',token}),/CONFIGURATION/);
 assert.throws(()=>createAgentGatewayV1({url:'http://127.0.0.1:8790/path',token}),/CONFIGURATION/);
});


test('signed public SSE delivers partial text before EOF and disconnect aborts only the subscription',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {createECDH}=await import('node:crypto'),{secp256k1}=await import('@noble/curves/secp256k1.js'),{hex}=await import('@scure/base');
 const {nativeWalletAuthMessageV1,nativeWalletBodyHashV1}=await import('../../../packages/crypto/src/native-wallet-auth-v1.mjs');
 const {createPublicWalletHttpServiceV1}=await import('../../../packages/backend/src/public-wallet/http-service-v1.mjs');
 const key=createECDH('secp256k1');key.generateKeys();const publicKey=key.getPublicKey('hex'),origin='https://wallet.example',token='stream-test-internal-secret-at-least-32-bytes';let resume,ended=false,seen=0;
 const wait=signal=>new Promise(resolve=>{const done=()=>{signal.removeEventListener('abort',done);resolve();};resume=done;signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});
 const runtime={capabilities:()=>({configured:true}),async *stream(identity,body,signal){assert.equal(identity.devicePublicKey,publicKey);assert.deepEqual(body,{after:0});seen++;try{yield{profile:'LIANUM_AGENT_STATE_V1',status:'ACTIVE',messages:[],streaming:[]};await wait(signal);if(signal.aborted)return;yield{profile:'LIANUM_AGENT_STATE_V1',status:'ACTIVE',messages:[],streaming:[{id:'message_live',text:'Primera parte'}]};await wait(signal);}finally{ended=true;}}};
 const privateService=createAgentHttpServer({runtime,token}),address=await privateService.listen({port:0}),directory=await mkdtemp(join(tmpdir(),'lianum-sse-'));
 const gateway=createAgentGatewayV1({url:'http://127.0.0.1:'+address.port,token});const service=await createPublicWalletHttpServiceV1({origin,directory,nativeConfiguration:{networks:[]},agent:gateway});const publicAddress=await service.listen(),url='http://127.0.0.1:'+publicAddress.port;
 t.after(async()=>{resume?.();await service.close();await privateService.close();await rm(directory,{recursive:true,force:true});});
 const path='/v1/agent/stream',body=JSON.stringify({after:0}),expected={origin,path,bodySHA256:nativeWalletBodyHashV1(body),devicePublicKey:publicKey};
 const challenge=await(await fetch(url+'/v1/auth/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(expected)})).json();const signature=hex.encode(secp256k1.sign(nativeWalletAuthMessageV1(challenge,expected),key.getPrivateKey(),{prehash:true,lowS:true})),envelope=JSON.stringify({challenge,signature,body});
 const controller=new AbortController();const response=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:envelope,signal:controller.signal});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader(),first=await reader.read();assert.match(new TextDecoder().decode(first.value),/ACTIVE/);assert.equal(ended,false);resume();const second=await reader.read();assert.match(new TextDecoder().decode(second.value),/Primera parte/);assert.equal(ended,false);assert.equal(seen,1);
 const replay=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:envelope});assert.equal(replay.status,403);assert.equal(seen,1);
 controller.abort();await reader.cancel().catch(()=>{});await new Promise(resolve=>setTimeout(resolve,150));assert.equal(ended,true);
});
