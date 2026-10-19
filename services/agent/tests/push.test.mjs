import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createECDH} from 'node:crypto';
import {openAgentStore} from '../../../packages/agent/src/store.mjs';
import {createAgentPushWorker} from '../../../packages/agent/src/push.mjs';
import {createFcmPushSender} from '../src/fcm-push.mjs';
function fixture(t,sender){const directory=mkdtempSync(join(tmpdir(),'lianum-push-'));let now=Date.now();const store=openAgentStore({directory,now:()=>now}),key=createECDH('secp256k1');key.generateKeys();const state=store.ensure(key.getPublicKey('hex')),worker=createAgentPushWorker({store,sender});t.after(async()=>{await worker.close();store.close();rmSync(directory,{recursive:true,force:true});});return {store,state,worker,advance:ms=>now+=ms,now:()=>now};}
test('push opt-in starts after registration and deduplicates replies while presence and acknowledgement suppress delivery',async t=>{
 const sent=[],f=fixture(t,{send:async row=>{sent.push(row);return {success:true,id:'projects/lianum/messages/fixture'};}}),owner=f.state.owner;
 f.store.append(owner,{remoteId:'old',text:'Histórico'});f.store.registerPush(owner,'fixture-device-token-123456789');f.store.append(owner,{remoteId:'new',text:'Tu saldo privado no va en el aviso'});f.advance(2000);f.store.update(owner,s=>s.chatVisibleUntil=f.now()+25000);await f.worker.tick();assert.equal(sent.length,0);f.advance(26000);await f.worker.tick();await f.worker.tick();assert.equal(sent.length,1);assert.equal(sent[0].conversationId,f.state.conversationId);
 f.store.append(owner,{remoteId:'acknowledged',text:'Leído'});f.store.acknowledge(owner,f.store.notifications(owner).at(-1).seq);f.advance(2000);await f.worker.tick();assert.equal(sent.length,1);
 f.store.disablePush(owner);f.store.append(owner,{remoteId:'disabled',text:'Desactivado'});f.advance(2000);await f.worker.tick();assert.equal(sent.length,1);
});
test('expired FCM registrations stop delivery and transient failures use the durable retry schedule',async t=>{
 let attempts=0;const f=fixture(t,{send:async()=>++attempts===1?{success:false,error:'TEMPORARY'}:{success:false,permanent:true,unregister:true,error:'UNREGISTERED'}}),owner=f.state.owner;f.store.registerPush(owner,'fixture-device-token-123456789');f.store.append(owner,{remoteId:'retry',text:'Resultado'});f.advance(2000);await f.worker.tick();await f.worker.tick();assert.equal(attempts,1);f.advance(11000);await f.worker.tick();assert.equal(attempts,2);assert.equal(f.store.pushSettings(owner).enabled,false);f.advance(100000);await f.worker.tick();assert.equal(attempts,2);
});
test('keyless FCM uses only the fixed VM identity and generic notification contents',async()=>{
 const requests=[],identity='lianum-agent-push@lianum.iam.gserviceaccount.com';let mode='ok';
 const sender=await createFcmPushSender({projectId:'lianum',serviceAccount:identity,fetchImpl:async(url,opts)=>{requests.push({url,opts});if(url.startsWith('http://metadata.google.internal/'))return new Response(JSON.stringify({access_token:'fixture-short-lived',expires_in:3600}),{headers:{'Metadata-Flavor':'Google'}});return mode==='ok'?new Response(JSON.stringify({name:'projects/lianum/messages/test'})):new Response(JSON.stringify({error:{details:[{errorCode:'UNREGISTERED'}]}}),{status:404});}});
 const row={token:'fixture-fcm-token',conversationId:'fixture-chat',seq:7,text:'Saldo privado 1000 EUR'};assert.equal((await sender.send(row)).success,true);assert.equal((await sender.send(row)).success,true);assert.equal(requests.filter(r=>r.url.startsWith('http:')).length,1);assert.equal(requests[0].url,'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/'+encodeURIComponent(identity)+'/token');
 const body=JSON.parse(requests[1].opts.body);assert.equal(body.message.android.priority,'HIGH');assert.equal(JSON.stringify(body).includes('1000'),false);assert.equal(body.message.data.route,'agent');mode='expired';assert.equal((await sender.send(row)).unregister,true);await assert.rejects(createFcmPushSender({projectId:'lianum',serviceAccount:'other@elsewhere.iam.gserviceaccount.com'}),/CONFIGURATION/);
});
