import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createECDH} from 'node:crypto';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {hex} from '@scure/base';
import {nativeWalletAuthMessageV1,nativeWalletBodyHashV1} from '../../../packages/crypto/src/native-wallet-auth-v1.mjs';
import {createPublicWalletHttpServiceV1} from '../../../packages/backend/src/public-wallet/http-service-v1.mjs';
import {createAgentGatewayV1} from '../../../packages/backend/src/public-wallet/agent-gateway-v1.mjs';
import {createAgentHttpServer} from '../src/http.mjs';
import {openAgentStore} from '../../../packages/agent/src/store.mjs';
import {createAgentRuntime} from '../../../packages/agent/src/runtime.mjs';

test('signed public HTTP reaches the independent durable agent and cannot create wallet journals',async t=>{
 const root=mkdtempSync(join(tmpdir(),'lianum-agent-http-')),origin='https://wallet.example',token='integration-only-gateway-secret-of-at-least-32-bytes';let nativeCalls=0;
 const store=openAgentStore({directory:join(root,'agent')}),runtime=createAgentRuntime({store,provider:null}),internal=createAgentHttpServer({runtime,token});const address=await internal.listen({port:0});
 const api=await createPublicWalletHttpServiceV1({origin,directory:join(root,'wallet'),nativeConfiguration:{networks:[]},agent:createAgentGatewayV1({url:'http://127.0.0.1:'+address.port,token}),nativeFactory:async()=>{nativeCalls++;throw Error('must not create custody');}});const publicAddress=await api.listen(),url='http://127.0.0.1:'+publicAddress.port;
 t.after(async()=>{await api.close();await internal.close();await runtime.close();store.close();rmSync(root,{recursive:true,force:true});});
 async function signed(path,value,key){const devicePublicKey=hex.encode(secp256k1.getPublicKey(key,false)),body=JSON.stringify(value),expected={origin,path,bodySHA256:nativeWalletBodyHashV1(body),devicePublicKey};const challenge=await(await fetch(url+'/v1/auth/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(expected)})).json();const signature=hex.encode(secp256k1.sign(nativeWalletAuthMessageV1(challenge,expected),key,{prehash:true,lowS:true}));return {challenge,signature,body};}
 const post=(path,envelope)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)});
 const key=createECDH('secp256k1');key.generateKeys();const other=createECDH('secp256k1');other.generateKeys();const path='/v1/agent/state',envelope=await signed(path,{},key.getPrivateKey());
 const first=await post(path,envelope);assert.equal(first.status,200);const state=await first.json();assert.equal(state.profile,'LIANUM_AGENT_STATE_V1');assert.deepEqual(state.messages,[]);assert.equal(state.sessionId,undefined);assert.equal(state.agent_key,undefined);
 assert.equal((await post(path,envelope)).status,403);assert.equal((await post(path,{})).status,403);
 const second=await(await post(path,await signed(path,{},other.getPrivateKey()))).json();assert.notEqual(second.conversationId,state.conversationId);assert.equal(nativeCalls,0);
});
