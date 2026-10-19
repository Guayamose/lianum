import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createECDH,randomUUID} from 'node:crypto';
import {openAgentStore} from '../../../packages/agent/src/store.mjs';
import {createAgentVoice} from '../../../packages/agent/src/voice.mjs';
import {createOpenAILiveProvider} from '../src/live-provider.mjs';

function fixture(t,{budgetMicros=5000000}={}){
 const directory=mkdtempSync(join(tmpdir(),'lianum-live-'));let at=Date.now(),store=openAgentStore({directory,now:()=>at});
 const key=createECDH('secp256k1');key.generateKeys();const state=store.ensure(key.getPublicKey('hex')),sent=[],created=[],enqueued=[];let hooks;
 const provider={async create(input){created.push(input);return {session:{id:'live_fixture'},transport:{type:'webrtc',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'}};},async attach(_id,callbacks){hooks=callbacks;return {send:event=>sent.push(event),close:async()=>{}};}};
 const make=()=>createAgentVoice({store,provider,now:()=>at,budgetMicros,enqueue:(state,input)=>{enqueued.push(input);return store.enqueue(state.owner,input);}});let voice=make();
 const body=()=>({id:randomUUID(),sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',context:{network:'testnet',currency:'EUR',observedAt:null,marketObservedAt:null,reading:false,totals:{total:null,available:null,reserved:null,occupied:null},assets:[],operations:{pendingTransfers:0,plan:null}},client:{language:'es-ES',timeZone:'Europe/Madrid'}});
 t.after(async()=>{await voice.close();store.close();rmSync(directory,{recursive:true,force:true});});
 return {state,body,sent,created,enqueued,advance:ms=>at+=ms,get hooks(){return hooks;},get store(){return store;},get voice(){return voice;},async restart(){await voice.close();store.close();store=openAgentStore({directory,now:()=>at});voice=make();},input(text,start=0,end=100){return hooks.onEvent({type:'session.input_transcript.delta',event_id:randomUUID(),delta:text,start_ms:start,end_ms:end});},delegate(id='delegate_one'){hooks.onEvent({type:'session.delegation.created',event_id:randomUUID(),delegation:{id,target:'client'},offset_ms:100});}};
}
test('voice uses the same owner and durable chat, delegates once and rejects premature or old answers',async t=>{
 const f=fixture(t),body=f.body();f.store.append(f.state.owner,{remoteId:'earlier',text:'Tu preferencia es EUR'});
 assert.equal(f.voice.open(f.state,body).status,'QUEUED');assert.equal(f.voice.open(f.state,body).id,body.id);await f.voice.tick();assert.equal(f.created.length,1);assert.equal(f.created[0].input[0].content[0].text,'Tu preferencia es EUR');
 const event={type:'session.input_transcript.delta',event_id:'fragment_one',delta:'¿Cuánto tengo?',start_ms:0,end_ms:100};assert.equal(f.hooks.onEvent(event),true);assert.equal(f.hooks.onEvent(event),false);
 f.hooks.onSegment({id:'segment_user',speaker:'user',text:'¿Cuánto tengo?',startMs:0,endMs:100});f.delegate();f.advance(600);await f.voice.tick();await f.voice.tick();assert.equal(f.enqueued.length,1);assert.equal(f.enqueued[0].text,'¿Cuánto tengo?');assert.equal(f.store.messages(f.state.owner).filter(m=>m.role==='you').length,1,'internal delegation is not a duplicate user bubble');
 assert.equal(f.voice.backendAnswer(f.state.owner,'Respuesta antigua','old'),false);assert.equal(f.sent.filter(e=>e.type==='session.commentary.append').length,0);
 const pending=f.store.voiceDelegation(f.state.owner,body.id,'delegate_one');f.store.mark(f.state.owner,pending.messageId,'SENT');f.store.update(f.state.owner,s=>s.lastSettledTurn='turn_old');
 assert.equal(f.voice.backendAnswer(f.state.owner,'Respuesta antigua','old','turn_old'),false);
 assert.equal(f.voice.backendAnswer(f.state.owner,'El saldo confirmado es desconocido.','new','turn_new'),true);assert.equal(f.sent.at(-1).delegation_id,'delegate_one');assert.equal(f.store.voiceDelegation(f.state.owner,body.id,'delegate_one').status,'RESULT_SENT');
 f.hooks.onSegment({id:'segment_agent',speaker:'assistant',text:'No puedo confirmar tu saldo ahora.',startMs:110,endMs:300});assert.equal(f.store.messages(f.state.owner).at(-1).channel,'voice');
 f.hooks.onEvent({type:'session.closed',usage:{seconds:60}});assert.equal(f.voice.status(f.state,{id:body.id}).finalized,true);assert.equal(f.store.voiceCall(f.state.owner,body.id).chargeMicros,50000);
});
test('a spoken correction supersedes an in-flight result and cannot authorize spending',async t=>{
 const f=fixture(t),body=f.body();f.voice.open(f.state,body);await f.voice.tick();f.input('Prepara un pago');f.delegate();f.advance(600);await f.voice.tick();const first=f.enqueued[0];f.store.mark(f.state.owner,first.id,'SENT');
 f.input('Mejor no, consulta el saldo',101,220);assert.equal(f.voice.backendAnswer(f.state.owner,'Pago preparado','answer_first'),false);assert.equal(f.store.voiceDelegation(f.state.owner,body.id,'delegate_one').status,'SUPERSEDED');
 f.delegate('delegate_two');f.advance(600);await f.voice.tick();assert.equal(f.enqueued.length,2);assert.equal(f.enqueued[1].text,'Mejor no, consulta el saldo');assert.match(f.created[0].instructions,/una afirmación por voz no los autoriza/);assert.equal(f.created[0].owner,f.state.owner);
 f.hooks.onEvent({type:'session.closed',usage:{seconds:1}});
});
test('voice reservations enforce the shared budget, isolation, cancellation and uncertain-create recovery',async t=>{
 const f=fixture(t,{budgetMicros:550000}),first=f.body();f.voice.open(f.state,first);assert.throws(()=>f.voice.open(f.state,f.body()),/VOICE_ALREADY_ACTIVE/);
 assert.throws(()=>f.voice.open(f.state,{...first,sdp:first.sdp+'a=changed\r\n'}),/VOICE_CONFLICT/);
 assert.throws(()=>f.voice.status({owner:'a'.repeat(64)},{id:first.id}),/VOICE_NOT_FOUND/);f.voice.end(f.state,{id:first.id});assert.equal(f.store.voiceCall(f.state.owner,first.id).chargeMicros,0);
 const second=f.body();f.voice.open(f.state,second);f.store.updateVoice(f.state.owner,second.id,r=>r.status='CREATING');await f.restart();await f.voice.tick();assert.equal(f.created.length,0,'uncertain creation never retries the paid API');assert.equal(f.voice.status(f.state,{id:second.id}).status,'NEEDS_REVIEW');assert.throws(()=>f.voice.open(f.state,f.body()),/VOICE_BUDGET_REACHED/);
});
test('a lost heartbeat closes once and retains the reservation if final usage is missing',async t=>{
 const f=fixture(t),body=f.body();f.voice.open(f.state,body);await f.voice.tick();f.advance(31000);await f.voice.tick();await f.voice.tick();assert.equal(f.sent.filter(e=>e.type==='session.close').length,1);f.advance(8000);await f.voice.tick();assert.equal(f.voice.status(f.state,{id:body.id}).status,'NEEDS_REVIEW');assert.equal(f.store.voiceCall(f.state.owner,body.id).chargeMicros,550000);
});
test('Live provider keeps credentials, delegation and write commands on the server',async()=>{
 let request,options;const client={live:{create:async(body,opts)=>{request=body;options=opts;return {};}}},provider=createOpenAILiveProvider({enabled:true,client});
 await provider.create({owner:'a'.repeat(64),sdp:'offer',instructions:'safe',input:[]});assert.equal(request.session.model,'gpt-live-1');assert.equal(request.session.delegation.type,'client');assert.equal(request.session.store,false);assert.equal(request.session.client.data_channel.allowed_client_events.includes('session.commentary.append'),false);assert.equal(options.headers['OpenAI-Safety-Identifier'],'a'.repeat(64));assert.equal(createOpenAILiveProvider(),null);
});
