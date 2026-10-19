import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createECDH,createHash,randomUUID} from 'node:crypto';
import {openAgentStore} from '../../../packages/agent/src/store.mjs';
import {createAgentRuntime} from '../../../packages/agent/src/runtime.mjs';
import {runAgentTool} from '../../../packages/agent/src/tools.mjs';
import * as P from '../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {parseDevicePagedAgentProposalLinkV4} from '@lianum/sdk/agent/operation';

function identity(){const key=createECDH('secp256k1');key.generateKeys();const devicePublicKey=key.getPublicKey('hex');return {devicePublicKey,ownerId:createHash('sha256').update(devicePublicKey).digest('hex'),connections:[]};}
function fixture(t,provider=null){const directory=mkdtempSync(join(tmpdir(),'lianum-agent-'));let now=1800000000000;const store=openAgentStore({directory,now:()=>now}),runtime=createAgentRuntime({store,provider,now:()=>now});t.after(async()=>{await runtime.close();store.close();rmSync(directory,{recursive:true,force:true});});return {directory,store,runtime,advance:ms=>now+=ms,now:()=>now};}
const call=(name,args,id='call1')=>({type:'function_call',name,arguments:args,turn_id:'turn1',call_id:id});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('durable chat isolates owners, rejects changed idempotent input and survives close/reopen',async t=>{
 const f=fixture(t),a=identity(),b=identity();f.store.ensure(a.devicePublicKey);f.store.ensure(b.devicePublicKey);
 const input={id:randomUUID(),text:'Recuerda que prefiero EUR'};assert.equal(f.store.enqueue(a.ownerId,input).duplicate,false);assert.equal(f.store.enqueue(a.ownerId,input).duplicate,true);
 assert.throws(()=>f.store.enqueue(a.ownerId,{...input,text:'otro encargo'}),/MESSAGE_CONFLICT/);
 assert.equal(f.store.messages(b.ownerId).length,0);const before=f.store.load(a.ownerId),key=f.store.identity(a.ownerId);f.store.remember(a.ownerId,'currency','EUR');f.store.close();
 const restored=openAgentStore({directory:f.directory});t.after(()=>restored.close());
 assert.equal(restored.load(a.ownerId).conversationId,before.conversationId);assert.deepEqual(restored.identity(a.ownerId),key);assert.equal(restored.messages(a.ownerId)[0].id,input.id);assert.equal(restored.notes(a.ownerId)[0].value,'EUR');
});
test('only one worker process owns a store and reply/outbox deduplicate recovered items',t=>{
 const f=fixture(t),own=identity();f.store.ensure(own.devicePublicKey);assert.throws(()=>openAgentStore({directory:f.directory}),/ALREADY_RUNNING/);
 const id=f.store.append(own.ownerId,{remoteId:'item1',text:'Resultado comprobado'});assert.equal(f.store.append(own.ownerId,{remoteId:'item1',text:'Resultado comprobado'}),id);assert.equal(f.store.notifications(own.ownerId).length,1);
 f.store.acknowledge(own.ownerId,f.store.notifications(own.ownerId)[0].seq);assert.equal(f.store.notifications(own.ownerId).length,0);
});
test('scheduled followup and cached tool effects are atomic and cannot grant financial powers',t=>{
 const f=fixture(t),own=identity(),state=f.store.ensure(own.devicePublicKey);state.sessionId='sess1';f.store.save(own.ownerId,state);
 const request=call('schedule_followup',{text:'Revisar el estado',at:new Date(f.now()+60000).toISOString()});const result=runAgentTool(f.store,state,request,f.now());assert.equal(result.success,true);
 assert.deepEqual(runAgentTool(f.store,state,request,f.now()),result);assert.equal(f.store.tasks(own.ownerId).length,1);assert.throws(()=>runAgentTool(f.store,state,{...request,arguments:{text:'Cambiar',at:new Date(f.now()+60000).toISOString()}},f.now()),/CALL_CONFLICT/);
 f.advance(60001);assert.equal(f.store.wakeDue(),1);assert.equal(f.store.wakeDue(),0);assert.equal(f.store.messages(own.ownerId).length,1);
 const denied=runAgentTool(f.store,state,call('send_money',{},'call2'));assert.equal(denied.success,false);
 const permission=runAgentTool(f.store,state,call('read_permissions',{},'call3'));assert.equal(permission.output.canSend,false);
 assert.equal(runAgentTool(f.store,state,call('remember_preference',{key:'password',value:'do not store this'},'call4')).success,false);
});
test('HTTP submission returns before generation and later messages steer the same session',async t=>{
 let finish;const gate=new Promise(resolve=>finish=resolve),sent=[];let remoteStatus='in_progress';
 const provider={model:'test-provider',create:async()=>{await gate;return{id:'sess_one'};},retrieve:async()=>({id:'sess_one',status:remoteStatus,required_actions:[]}),items:async()=>[],turns:async()=>[{status:'completed'}],send:async(_id,m)=>sent.push(m.id),cancel:async()=>{}};
 const f=fixture(t,provider),own=identity(),one={id:randomUUID(),text:'Investiga esta operación'},two={id:randomUUID(),text:'Mientras tanto, dime sus permisos'};
 await f.runtime.dispatch(own,'/v1/agent/messages',one);await f.runtime.dispatch(own,'/v1/agent/messages',two);assert.equal(f.store.messages(own.ownerId).length,2);assert.equal(f.store.load(own.ownerId).sessionStatus,'CREATING');
 finish();await flush();await flush();assert.deepEqual(sent,[two.id]);assert.equal(f.store.load(own.ownerId).sessionId,'sess_one');
 remoteStatus='idle';f.advance(6000);await f.runtime.tick();assert.ok(f.store.messages(own.ownerId).every(row=>row.status==='COMPLETED'));
});
test('an uncertain session creation stops instead of creating another session',async t=>{
 let creates=0;const f=fixture(t,{model:'test',create:async()=>{creates++;throw Error('network response lost');}}),own=identity();
 await f.runtime.dispatch(own,'/v1/agent/messages',{id:randomUUID(),text:'Consulta mi cartera'});await flush();f.advance(120000);await f.runtime.tick();assert.equal(creates,1);assert.equal(f.store.load(own.ownerId).sessionStatus,'CREATE_UNKNOWN');assert.equal(f.store.messages(own.ownerId)[0].status,'UNKNOWN');
});
test('a definitive configuration rejection stops once and exposes the cost error',async t=>{
 let creates=0;const f=fixture(t,{model:'test',create:async()=>{creates++;throw Object.assign(Error('Unknown parameter'),{status:400,lianumCode:'NATIVE_AGENT_COST_LIMIT_UNSUPPORTED'});}}),own=identity();
 await f.runtime.dispatch(own,'/v1/agent/messages',{id:randomUUID(),text:'Hola'});await flush();f.advance(120000);await f.runtime.tick();
 const state=await f.runtime.dispatch(own,'/v1/agent/state',{});assert.equal(creates,1);assert.equal(state.status,'CREATE_REJECTED');assert.equal(state.error,'NATIVE_AGENT_COST_LIMIT_UNSUPPORTED');assert.equal(state.messages[0].status,'FAILED');assert.equal(f.store.load(own.ownerId).sessionId,null);
 await assert.rejects(f.runtime.dispatch(own,'/v1/agent/messages',{id:randomUUID(),text:'Otro intento'}),/SESSION_CONFIGURATION_REJECTED/);assert.equal(creates,1);
});
test('recovery retrieves the existing session, persists only completed answers and never resends sent input',async t=>{
 const sent=[];const item={type:'message',role:'assistant',status:'completed',id:'answer_1',phase:'final_answer',content:[{type:'output_text',text:'Resultado disponible',annotations:[]}]};
 const provider={model:'test',retrieve:async()=>({id:'existing',status:'idle',required_actions:[]}),items:async()=>[item],turns:async()=>[{status:'completed'}],send:async(_id,message)=>sent.push(message)};
 const f=fixture(t,provider),own=identity(),state=f.store.ensure(own.devicePublicKey);state.sessionId='existing';state.sessionStatus='ACTIVE';f.store.save(own.ownerId,state);const input={id:randomUUID(),text:'Consulta'};f.store.enqueue(own.ownerId,input);f.store.mark(own.ownerId,input.id,'SENT');
 await f.runtime.tick();assert.equal(sent.length,0);assert.equal(f.store.messages(own.ownerId).filter(m=>m.role==='agent').length,1);assert.equal(f.store.notifications(own.ownerId).length,1);
 state.sessionStatus='ACTIVE';f.store.save(own.ownerId,state);await f.runtime.tick();assert.equal(f.store.messages(own.ownerId).filter(m=>m.role==='agent').length,1);
});
test('gateway identity and model-selected owner fields cannot cross wallet boundaries',async t=>{
 const f=fixture(t),a=identity(),b=identity();await assert.rejects(f.runtime.dispatch({...a,ownerId:b.ownerId},'/v1/agent/state',{}),/IDENTITY/);
 const state=f.store.ensure(a.devicePublicKey);state.sessionId='sess1';assert.equal(runAgentTool(f.store,state,call('read_wallet',{owner:b.ownerId})).success,false);
 assert.equal(f.runtime.capabilities().configured,false);await assert.rejects(f.runtime.dispatch(a,'/v1/agent/messages',{id:randomUUID(),text:'Hola'}),/NOT_CONFIGURED/);
});
test('a deployment device allowlist rejects self-created identities before storage or inference',async t=>{
 const f=fixture(t),a=identity(),b=identity();const restricted=createAgentRuntime({store:f.store,provider:null,allowedDevicePublicKeys:[a.devicePublicKey]});t.after(()=>restricted.close());
 await assert.rejects(restricted.dispatch(b,'/v1/agent/state',{}),/AUTH_DEVICE_DENIED/);await assert.rejects(restricted.stream(b,{},new AbortController().signal).next(),/AUTH_DEVICE_DENIED/);assert.equal(f.store.load(b.ownerId),null);
 const state=await restricted.dispatch(a,'/v1/agent/state',{});assert.equal(state.profile,'LIANUM_AGENT_STATE_V1');
 assert.throws(()=>createAgentRuntime({store:f.store,allowedDevicePublicKeys:[]}),/CONFIGURATION/);
});
test('payment proposal is really signed for this device and still grants no execution',t=>{
 const f=fixture(t),own=identity(),state=f.store.ensure(own.devicePublicKey),h=s=>createHash('sha256').update(s).digest('hex'),now=Math.floor(P.devicePagedNowV3()/1000);
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://localhost:9444',pairingId:'host-proposal-data',devicePublicKey:own.devicePublicKey,deadlineMs:Math.floor(P.devicePagedNowV3()+9*3600000),chainId:'11155111',chainDeadlineSeconds:String(now+9*3600),...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,h(k)])),...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)]))});
 // Public connection DATA only; no TLS connection or financial backend is used.
 state.sessionId='sess-proposal';state.context={network:'testnet'};state.connections=[{format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n',certificateSHA256:h('fixture')}}];f.store.save(own.ownerId,state);
 const args={terms:{budget:'1',fundingNotBefore:String(now),fundingValidUntil:String(now+600),settleBefore:String(now+3600)},nodes:[{id:'payment-1',networkId:'ethereum-sepolia',recipient:'0x'+'a'.repeat(40),amountAtomic:'1000000000000000',providerPayoutAtomic:'1',dependsOn:[]}]};
 const result=runAgentTool(f.store,state,call('propose_payments',args));assert.equal(result.success,true);const signed=parseDevicePagedAgentProposalLinkV4(result.output.proposalLink,descriptor);assert.notEqual(signed.proposal.agentPublicKey,own.devicePublicKey);assert.equal(result.output.financialExecution,false);assert.equal(result.output.requiresMobileReview,true);
 const changed=structuredClone(args);changed.nodes[0].recipient='invalid';assert.equal(runAgentTool(f.store,state,call('propose_payments',changed,'invalid-recipient')).success,false);
 for(const network of ['mainnet',undefined]){state.context={network};const denied=runAgentTool(f.store,state,call('propose_payments',args,'environment-'+String(network)));assert.equal(denied.success,false);assert.equal(denied.error,'NATIVE_AGENT_TESTNET_ENVIRONMENT_REQUIRED');}
});

test('live text is owner-scoped, deduplicated and replaced by durable completed output',async t=>{
 let emit,finish;const queue=[],waiters=[];const push=e=>{const next=waiters.shift();if(next)next(e);else queue.push(e);};let status='in_progress';
 const final={type:'message',role:'assistant',status:'completed',id:'answer_stream',phase:'final_answer',content:[{type:'output_text',text:'Hola, ¿qué necesitas?',annotations:[]}]};
 const provider={model:'test',create:async()=>({id:'session_stream'}),watch:async(_id,signal)=>({controller:{abort(){}},async *[Symbol.asyncIterator](){while(!signal.aborted){const event=queue.shift()??await new Promise(resolve=>{waiters.push(resolve);signal.addEventListener('abort',()=>resolve(null),{once:true});});if(!event)return;yield event;}}}),retrieve:async()=>({id:'session_stream',status,required_actions:[]}),items:async()=>status==='idle'?[final]:[],turns:async()=>[{status:'completed'}],send:async()=>{}};
 const f=fixture(t,provider),a=identity(),b=identity();await f.runtime.dispatch(a,'/v1/agent/messages',{id:randomUUID(),text:'Hola',client:{language:'es-ES',timeZone:'Europe/Madrid'}});await flush();await flush();
 const event={type:'agent.session.turn.output_text.delta',session_id:'session_stream',item_id:'answer_stream',event_id:'event_one',delta:'Hola'};push(event);push(event);await flush();
 const partial=await f.runtime.dispatch(a,'/v1/agent/state',{});assert.equal(partial.streaming[0].text,'Hola');assert.equal(partial.messages[0].modelInput,undefined);assert.equal(partial.messages[0].requestContext,undefined);assert.equal((await f.runtime.dispatch(b,'/v1/agent/state',{})).streaming.length,0);
 push({type:'agent.session.turn.output_text.done',item_id:'answer_stream',text:'Hola, ¿qué necesitas?'});push({type:'agent.session.turn.item.done',item:final});status='idle';push({type:'agent.session.turn.completed',turn:{subagent_id:null}});await flush();f.advance(6000);await f.runtime.tick();
 const saved=await f.runtime.dispatch(a,'/v1/agent/state',{});assert.equal(saved.streaming.length,0);assert.equal(saved.messages.filter(m=>m.role==='agent').length,1);assert.equal(saved.messages.at(-1).text,final.content[0].text);assert.equal(saved.deliveries[0].status,'COMPLETED');
});
test('queued context and input are frozen, retries cannot change metadata, preferences can be forgotten',async t=>{
 const f=fixture(t,{model:'test',create:async()=>{throw Error('offline');}}),a=identity(),id=randomUUID();
 await f.runtime.dispatch(a,'/v1/agent/messages',{id,text:'Recuérdalo',client:{language:'es-ES',timeZone:'Europe/Madrid'}});await flush();
 const stored=f.store.messages(a.ownerId)[0];assert.equal(stored.modelInput,undefined);assert.equal(stored.client,undefined);
 assert.throws(()=>f.store.enqueue(a.ownerId,{id,text:'Recuérdalo',client:{language:'en-US',timeZone:'UTC'}}),/MESSAGE_CONFLICT/);
 f.store.remember(a.ownerId,'currency','EUR');await f.runtime.dispatch(a,'/v1/agent/memory/forget',{key:'currency'});assert.equal(f.store.notes(a.ownerId).length,0);
 await assert.rejects(f.runtime.dispatch(a,'/v1/agent/messages',{id:randomUUID(),text:'Hola',client:{language:'es',timeZone:'invalid/not-a-zone'}}),/NATIVE_AGENT_DATA/);
});

test('a prior completed turn cannot settle new input and delayed saved answers are reconciled',async t=>{
 let turn='old_turn',status='idle',items=[];const sent=[];
 const provider={model:'test',retrieve:async()=>({id:'existing',status,required_actions:[]}),items:async()=>items,turns:async()=>[{id:turn,status:'completed'}],send:async(_id,m)=>sent.push(m.id)};
 const f=fixture(t,provider),own=identity(),state=f.store.ensure(own.devicePublicKey);state.sessionId='existing';state.sessionStatus='IDLE';state.lastSettledTurn='old_turn';f.store.save(own.ownerId,state);
 const input={id:randomUUID(),text:'Una nueva pregunta'};await f.runtime.dispatch(own,'/v1/agent/messages',input);await flush();assert.deepEqual(sent,[input.id]);
 f.advance(2000);await f.runtime.tick();assert.equal(f.store.deliveries(own.ownerId)[0].status,'SENT');assert.equal(f.store.load(own.ownerId).sessionStatus,'ACTIVE');
 turn='new_turn';f.advance(2000);await f.runtime.tick();assert.equal(f.store.deliveries(own.ownerId)[0].status,'COMPLETED');
 items=[{id:'late_answer',type:'message',role:'assistant',status:'completed',phase:'final_answer',content:[{type:'output_text',text:'La respuesta guardada llegó después.'}]}];f.advance(2000);await f.runtime.tick();assert.equal(f.store.messages(own.ownerId).at(-1).text,'La respuesta guardada llegó después.');assert.equal(sent.length,1);
});

test('an idle event stream waiting for its first event cannot delay message submission',async t=>{
 let open;const streamReady=new Promise(resolve=>open=resolve),sent=[];
 const provider={model:'test',watch:async()=>{await streamReady;return{async *[Symbol.asyncIterator](){}};},retrieve:async()=>({id:'idle_session',status:'idle',required_actions:[]}),items:async()=>[],turns:async()=>[{id:'previous',status:'completed'}],send:async(_id,m)=>{sent.push(m.id);open();}};
 const f=fixture(t,provider),own=identity(),state=f.store.ensure(own.devicePublicKey);state.sessionId='idle_session';state.sessionStatus='IDLE';state.lastSettledTurn='previous';f.store.save(own.ownerId,state);
 const input={id:randomUUID(),text:'Continúa el chat'};await f.runtime.dispatch(own,'/v1/agent/messages',input);await new Promise(resolve=>setTimeout(resolve,650));assert.deepEqual(sent,[input.id]);assert.equal(f.store.load(own.ownerId).sessionStatus,'ACTIVE');
});
