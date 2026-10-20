import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createECDH,createHash,randomUUID} from 'node:crypto';
import {openAgentStore} from '../../../packages/agent/src/store.mjs';
import {createAgentRuntime} from '../../../packages/agent/src/runtime.mjs';
import {conversationInput,conversationVoice,toolPresentation} from '../../../packages/agent/src/conversation.mjs';
import {conversationReference} from '../../../packages/agent/src/context.mjs';
import {runAgentTool} from '../../../packages/agent/src/tools.mjs';

function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'lianum-agent-context-'));let now=1800000000000;
 const key=createECDH('secp256k1');key.generateKeys();const devicePublicKey=key.getPublicKey('hex'),identity={devicePublicKey,ownerId:createHash('sha256').update(devicePublicKey).digest('hex'),connections:[]};
 const store=openAgentStore({directory,now:()=>now}),state=store.ensure(devicePublicKey);state.sessionId='existing_chat';state.sessionStatus='NEEDS_REVIEW';store.save(state.owner,state);
 const runtime=createAgentRuntime({store,provider:{model:'fixture'},now:()=>now});t.after(async()=>{await runtime.close();store.close();rmSync(directory,{recursive:true,force:true});});
 return {directory,identity,store,runtime,now:()=>now,advance:ms=>now+=ms};
}
const context=(now,network='testnet')=>({network,currency:'EUR',observedAt:now,marketObservedAt:now,reading:false,totals:{total:'10000',available:'10000',reserved:'0',occupied:'0'},assets:[{symbol:'ETH',total:'10000',available:'10000',reserved:'0',occupied:'0'}],operations:{pendingTransfers:0,plan:null}});
const reference=input=>JSON.parse(input.split('\n')[1]);
const tool=(name,id)=>({type:'function_call',name,arguments:{},turn_id:'context_turn',call_id:id});

test('accepted context automatically includes preferences and old relevant chat, stays frozen and survives restart',async t=>{
 const f=fixture(t),id=f.identity.ownerId;
 f.store.remember(id,'currency','EUR');f.store.append(id,{remoteId:'old-decision',text:'Para Orquídea acordamos revisar primero los permisos.'});
 for(let n=0;n<110;n++)f.store.append(id,{remoteId:'unrelated-'+n,text:'Otro mensaje sobre el tema '+n});
 const input={id:randomUUID(),text:'¿Qué acordamos sobre Orquídea?',context:context(f.now()),client:{language:'es-ES',timeZone:'Europe/Madrid'}};
 await f.runtime.dispatch(f.identity,'/v1/agent/messages',input);const frozen=f.store.pending(id)[0].modelInput,r=reference(frozen);
 assert.equal(r.network,'testnet');assert.equal(r.environment,'Pruebas');assert.equal(r.memory.notes[0].value,'EUR');assert.ok(r.history.some(row=>row.text.includes('revisar primero los permisos')));assert.equal(r.timeZone,'Europe/Madrid');assert.equal(r.walletStale,false);
 assert.equal(frozen.includes(conversationVoice),false);f.store.remember(id,'currency','USD');f.advance(300000);
 assert.equal((await f.runtime.dispatch(f.identity,'/v1/agent/messages',input)).duplicate,true);assert.equal(f.store.pending(id)[0].modelInput,frozen);
 const publicState=await f.runtime.dispatch(f.identity,'/v1/agent/state',{});assert.equal(publicState.messages.some(row=>row.modelInput||row.requestContext),false);
 await f.runtime.close();f.store.close();const restored=openAgentStore({directory:f.directory,now:f.now});t.after(()=>restored.close());
 assert.equal(restored.load(id).sessionId,'existing_chat');assert.equal(restored.pending(id)[0].modelInput,frozen);assert.equal(restored.load(id).client.timeZone,'Europe/Madrid');
});

test('history retrieval is owner-scoped, literal, bounded and finds matching text beyond an old long answer prefix',t=>{
 const f=fixture(t),id=f.identity.ownerId,other=createECDH('secp256k1');other.generateKeys();const foreign=f.store.ensure(other.getPublicKey('hex'));
 f.store.append(id,{remoteId:'old-long-answer',text:'Introducción. '.repeat(200)+'Orquídea requiere revisar permisos.'});
 f.store.append(foreign.owner,{remoteId:'foreign',text:'Orquídea, datos de otra persona'});
 f.store.append(id,{remoteId:'internal-card',text:'Orquídea, tarjeta técnica',phase:'tool_result'});
 const hits=f.store.searchHistory(id,'Orquídea');assert.equal(hits.length,1);assert.ok(hits[0].text.includes('Orquídea'));assert.ok(hits[0].text.length<=700);assert.equal(hits[0].historical,true);
 assert.deepEqual(f.store.searchHistory(id,'hola gracias'),[]);assert.deepEqual(f.store.searchHistory(id,"%' OR 1=1 --"),[]);
});

test('forgetting survives restart, is not revived by history and a new explicit preference clears its tombstone',async t=>{
 const f=fixture(t),id=f.identity.ownerId;f.store.remember(id,'currency','EUR');f.store.append(id,{remoteId:'old-memory',text:'Antes la moneda preferida era EUR.'});
 await f.runtime.dispatch(f.identity,'/v1/agent/memory/forget',{key:'currency'});
 const r=conversationReference(f.store,f.store.load(id),'moneda preferida',f.now());assert.deepEqual(r.memory.notes,[]);assert.deepEqual(r.memory.forgottenKeys,['currency']);
 await f.runtime.close();f.store.close();const restored=openAgentStore({directory:f.directory,now:f.now});t.after(()=>restored.close());assert.equal(restored.forgottenNotes(id)[0].key,'currency');
 restored.remember(id,'currency','USD');assert.deepEqual(restored.forgottenNotes(id),[]);assert.equal(restored.notes(id)[0].value,'USD');
});

test('scheduled inputs recover locale after restart, use trigger time and mark old wallet data stale',async t=>{
 const f=fixture(t),id=f.identity.ownerId;
 await f.runtime.dispatch(f.identity,'/v1/agent/messages',{id:randomUUID(),text:'Revisaremos luego Orquídea',context:context(f.now()),client:{language:'es-ES',timeZone:'Europe/Madrid'}});
 const task=randomUUID();f.store.schedule(id,task,'Revisa el estado de Orquídea',f.now()+180000);f.advance(180001);
 await f.runtime.close();f.store.close();const restored=openAgentStore({directory:f.directory,now:f.now}),runtime=createAgentRuntime({store:restored,provider:{model:'fixture'},now:f.now});t.after(async()=>{await runtime.close();restored.close();});
 restored.remember(id,'language','Español');await runtime.tick();const pending=restored.pending(id).find(row=>row.id===task),r=reference(pending.modelInput);
 assert.equal(r.now,new Date(f.now()).toISOString());assert.equal(r.timeZone,'Europe/Madrid');assert.equal(r.walletStale,true);assert.equal(r.network,'testnet');assert.equal(r.memory.notes[0].value,'Español');assert.ok(pending.modelInput.includes('[Seguimiento solicitado previamente'));
 assert.equal(restored.wakeDue(),0);assert.equal(restored.load(id).sessionId,'existing_chat');
});

test('wallet and operation tools expose environment and freshness, including legacy unknown environments',t=>{
 const f=fixture(t),state=f.store.load(f.identity.ownerId);
 for(const network of ['mainnet','testnet',undefined]){state.context=context(f.now(),network);if(network===undefined)delete state.context.network;
  const wallet=runAgentTool(f.store,state,tool('read_wallet','wallet-'+network),f.now());assert.equal(wallet.success,true);assert.equal(wallet.output.network,network??null);assert.equal(wallet.output.networkKnown,network!==undefined);assert.equal(wallet.output.stale,false);
  const operations=runAgentTool(f.store,state,tool('read_operations','ops-'+network),f.now()+120001);assert.equal(operations.output.stale,true);assert.equal(operations.output.network,network??null);
 }
});

test('reference size and memory tool results remain bounded with many Unicode preferences and completed tasks',async t=>{
 const f=fixture(t),id=f.identity.ownerId;for(let n=0;n<32;n++){f.store.remember(id,'preference_'+n,'界'.repeat(500));f.advance(1);}
 const state=f.store.load(id),r=conversationReference(f.store,state,'hola',f.now());assert.ok(r.memory.notes.length<=8);assert.ok(r.memory.omittedNotes>0);assert.ok(Buffer.byteLength(JSON.stringify(r.memory.notes))<3600);
 const full=runAgentTool(f.store,state,tool('read_memory','unicode-memory'),f.now());assert.equal(full.success,true);assert.ok(full.output.omittedNotes>0);assert.ok(Buffer.byteLength(JSON.stringify(full))<40000);
 for(let n=0;n<105;n++){const task=randomUUID();f.store.schedule(id,task,'Antiguo',f.now()+10000);f.store.cancelTask(id,task);}
 const pending=randomUUID();f.store.schedule(id,pending,'El seguimiento vigente',f.now()+10000);assert.equal(conversationReference(f.store,state,'hola',f.now()).followups.next[0].id,pending);
 const input=conversationInput({text:'Hola'},f.now());assert.ok(input.length<conversationVoice.length/2);assert.equal(reference(input).timeZone,null);
});

test('wallet cards show the actual transfer cost separately from temporarily paused funds',()=>{
 const output={currency:'EUR',stale:false,totals:{total:'10000',available:'0',reserved:'0',occupied:'10',paused:'9990'}};
 const card=toolPresentation('read_wallet',{success:true,output});assert.deepEqual(card.facts.map(row=>row.label),['Total','Available','Reserved','In progress','Temporarily unavailable']);assert.deepEqual(card.facts.map(row=>row.value),['€100.00','€0.00','€0.00','€0.10','€99.90']);
 const legacy={...output,totals:{total:'10000',available:'9990',reserved:'0',occupied:'10'}};assert.equal(toolPresentation('read_wallet',{success:true,output:legacy}).facts.length,4);
});
