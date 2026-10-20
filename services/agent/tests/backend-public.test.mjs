/** Actual signatures, HTTP and durable account registry. Chain reads use HOST
 * ports; no OpenAI calls, financial preparation or broadcasts occur. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {hex} from '@scure/base';
import {deriveNativeAccountV1} from '@lianum/crypto/native-wallet-v1';
import {nativeWalletAuthMessageV1,nativeWalletBodyHashV1} from '../../../packages/crypto/src/native-wallet-auth-v1.mjs';
import {createPublicWalletHttpServiceV1} from '../../../packages/backend/src/public-wallet/http-service-v1.mjs';
import {createAgentGatewayV1} from '../../../packages/backend/src/public-wallet/agent-gateway-v1.mjs';
import {createAgentHttpServer} from '../src/http.mjs';
import {createAgentBackendClient} from '../src/backend-client.mjs';
import {openAgentStore} from '../../../packages/agent/src/store.mjs';
import {createAgentRuntime} from '../../../packages/agent/src/runtime.mjs';

test('signed enrollment survives restart, scopes public accounts by owner/environment and reads without the phone',async t=>{
 const root=await mkdtemp(join(tmpdir(),'agent-backend-public-')),origin='https://wallet.example',token='fixture-gateway-token-with-at-least-thirty-two-bytes',backendToken='fixture-independent-backend-token-with-at-least-thirty-two-bytes',key=new Uint8Array(32).fill(19),publicKey=hex.encode(secp256k1.getPublicKey(key,false)),ownerId=createHash('sha256').update(publicKey).digest('hex'),reads=[],observations=[];
 let now=Date.now(),fail=false,market=true,pending=false,client,api,url;const store=openAgentStore({directory:join(root,'agent'),now:()=>now}),runtime=createAgentRuntime({store,provider:null,backend:{snapshot:(...args)=>client.snapshot(...args)},allowedDevicePublicKeys:[publicKey],now:()=>now}),internal=createAgentHttpServer({runtime,token}),internalAddress=await internal.listen({port:0});
 const account=deriveNativeAccountV1(new Uint8Array(32).fill(3),'ethereum-sepolia');
 const config={origin,directory:join(root,'wallet'),nativeConfiguration:{networks:[{id:'ethereum-mainnet',endpoint:'https://fixture.example'},{id:'ethereum-sepolia',endpoint:'https://fixture.example'}]},agent:createAgentGatewayV1({url:'http://127.0.0.1:'+internalAddress.port,token}),agentBackendToken:backendToken,agentMarketReader:async()=>market?{rates:{ETH:'0.0005',BTC:'0.00001',SOL:'0.01',EUR:'0.9'},observedAt:now,source:'HOST'}:null,nativeFactory:async({directory})=>({readOperationSummaries:()=>[{operationId:'pending-operation',id:'0x'+'a'.repeat(64),terminal:false,networkId:'ethereum-sepolia'}],observeTransfer:async value=>{observations.push(value);},readAccount:async a=>{reads.push({directory,account:a});if(fail)throw Error('HOST_RPC_UNAVAILABLE');return {balanceAtomic:'1000000000000000000',spendableAtomic:pending?'0':'1000000000000000000',reservedAtomic:pending?'1000000000000000':'0',hasPendingTransfer:pending};},close:async()=>{}})};
 async function start(){api=await createPublicWalletHttpServiceV1(config);const address=await api.listen(),backendAddress=await api.listenAgentBackend({port:0});url='http://127.0.0.1:'+address.port;client=createAgentBackendClient({url:'http://127.0.0.1:'+backendAddress.port,token:backendToken});}
 t.after(async()=>{await api?.close();await internal.close();await runtime.close();store.close();key.fill(0);await rm(root,{recursive:true,force:true});});
 async function request(path,value,status=200,deviceKey=key){const devicePublicKey=hex.encode(secp256k1.getPublicKey(deviceKey,false)),body=JSON.stringify(value),expected={origin,path,bodySHA256:nativeWalletBodyHashV1(body),devicePublicKey};const challengeResponse=await fetch(url+'/v1/auth/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(expected)});assert.equal(challengeResponse.status,200);const challenge=await challengeResponse.json(),signature=hex.encode(secp256k1.sign(nativeWalletAuthMessageV1(challenge,expected),deviceKey,{prehash:true,lowS:true})),response=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({challenge,signature,body})}),data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
 await start();const linked=await request('/v1/agent/wallet',{enabled:true,network:'testnet',currency:'EUR',accounts:[account]});assert.equal(linked.financialPermission,false);assert.equal(reads.length,0,'enrollment never starts a background scan');
 const identityBefore=store.load(ownerId).conversationId;
 const snapshot=await client.snapshot(ownerId,'testnet');assert.equal(snapshot.context.totals.total,'180000');assert.equal(snapshot.source,'BACKEND_RPC');assert.equal(snapshot.financialPermission,false);assert.equal(observations.length,1);assert.ok(reads[0].directory.endsWith('/testnet-v2'));assert.deepEqual(reads[0].account,account);
 await assert.rejects(client.snapshot(ownerId,'mainnet'),/UNAVAILABLE/);await assert.rejects(client.snapshot('b'.repeat(64),'testnet'),/UNAVAILABLE/);
 const badKey=new Uint8Array(32).fill(20);await request('/v1/agent/wallet',{enabled:true,network:'testnet',currency:'EUR',accounts:[account]},403,badKey);assert.equal((await readdir(join(root,'wallet','agent-wallets'))).length,1,'deployment allowlist is checked before writing registry files');
 await api.close();api=null;await start();assert.equal((await client.snapshot(ownerId,'testnet')).context.totals.total,'180000');assert.equal(store.load(ownerId).conversationId,identityBefore);
 pending=true;const paused=await client.snapshot(ownerId,'testnet');assert.deepEqual(paused.context.totals,{total:'180000',available:'0',reserved:'0',occupied:'180',paused:'179820'});assert.equal(paused.context.assets[0].paused,'179820');pending=false;
 fail=true;const failed=await client.snapshot(ownerId,'testnet');assert.equal(failed.failedAccounts,1);assert.equal(failed.context.observedAt,null);assert.equal(failed.context.totals.total,null,'unavailable RPC never becomes zero balance');
 fail=false;market=false;const noMarket=await client.snapshot(ownerId,'testnet');assert.equal(noMarket.context.marketObservedAt,null);assert.equal(noMarket.context.totals.total,null);
 await request('/v1/agent/wallet',{enabled:false,network:'testnet',currency:'EUR',accounts:[]});await assert.rejects(client.snapshot(ownerId,'testnet'),/UNAVAILABLE/);const registry=JSON.parse(await readFile(join(root,'wallet','agent-wallets',ownerId+'.json'),'utf8'));assert.deepEqual(registry.networks,{});assert.deepEqual(store.load(ownerId).walletLinks,{});
});
