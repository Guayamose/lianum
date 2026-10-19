import {createHash,randomUUID} from 'node:crypto';
import {normalizeAgentContextV1} from '@lianum/mobile-protocol/agent/chat-v1';
import {normalizeDevicePagedAgentPublicConnectionV4} from '@lianum/sdk/agent/operation';
import {runAgentTool} from './tools.mjs';
import {conversationInput,toolLabels,toolPresentation} from './conversation.mjs';
import {conversationReference} from './context.mjs';
import {exact,need,remoteId} from './validation.mjs';
import {createAgentOperations} from './operations.mjs';
import {createAgentPushWorker} from './push.mjs';
import {createAgentVoice} from './voice.mjs';

/** The HTTP request only queues work. The service-owned worker survives a
 * mobile disconnect and reconciles saved remote state after a service restart. */
export function createAgentRuntime({store,provider,backend=null,operationObserver=null,operationOrigin=null,pushSender=null,liveProvider=null,voiceBudgetMicros=5000000,allowedDevicePublicKeys=null,now=Date.now,tickMs=1000}){
 need(backend===null||typeof backend.snapshot==='function','CONFIGURATION');
 need(allowedDevicePublicKeys===null||Array.isArray(allowedDevicePublicKeys)&&allowedDevicePublicKeys.length>0&&allowedDevicePublicKeys.length<=64&&allowedDevicePublicKeys.every(key=>typeof key==='string'&&/^04[0-9a-f]{128}$/.test(key)),'CONFIGURATION');
 const allowed=allowedDevicePublicKeys===null?null:new Set(allowedDevicePublicKeys);
 const operations=createAgentOperations({store,observe:operationObserver,origin:operationOrigin,now}),push=createAgentPushWorker({store,sender:pushSender});
 const sleep=(ms,signal)=>new Promise(resolve=>{const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();},timer=setTimeout(finish,ms);signal?.addEventListener('abort',finish,{once:true});if(signal?.aborted)finish();});
 const running=new Map(),watchers=new Map(),views=new Map();let timer=null,closed=false;
 const prepareInput=(state,input)=>({...input,modelInput:conversationInput({...input,client:input.client??state.client,context:input.context??state.context},now(),conversationReference(store,state,input.text,now()))});
 const voice=createAgentVoice({store,provider:liveProvider,enqueue:(state,input)=>store.enqueue(state.owner,prepareInput(state,input)),now,budgetMicros:voiceBudgetMicros});
 const view=id=>{if(!views.has(id))views.set(id,{partials:new Map(),activity:null,checks:[]});return views.get(id);};
 function saveItem(id,sessionId,item){
  if(item?.type!=='message'||item.role!=='assistant'||item.status!=='completed'||!Array.isArray(item.content)||item.subagent_id)return;
  const text=item.content.filter(p=>p.type==='output_text'&&typeof p.text==='string').map(p=>p.text).join('\n').trim();if(!text)return;
  const remote=remoteId(item.id);if(store.remoteMessageExists(id,sessionId+':'+remote)){view(id).partials.delete(remote);return;}const voiced=(item.phase??'final_answer')==='final_answer'&&voice.backendAnswer(id,text,remote,item.turn_id);store.append(id,{remoteId:sessionId+':'+remote,text:text.slice(0,12000),phase:voiced?'voice_backend':item.phase??'final_answer',data:{itemId:item.id,annotations:item.content.flatMap(p=>p.annotations??[]).filter(a=>a.type==='url_citation'&&typeof a.url==='string').slice(0,12).map(a=>({url:a.url,title:a.title??a.url}))}});view(id).partials.delete(remote);
 }
 async function watch(id,sessionId){
  if(!provider.watch||watchers.has(id)||closed)return;
  const controller=new AbortController();let ready;const opened=new Promise(resolve=>ready=resolve),entry={controller,promise:null};watchers.set(id,entry);
  entry.promise=(async()=>{let stream;const timeout=setTimeout(()=>controller.abort(),90000);timeout.unref();const seen=new Set();
   try{stream=await provider.watch(sessionId,controller.signal);ready();for await(const event of stream){
    if(closed||controller.signal.aborted)break;if(event.session_id&&event.session_id!==sessionId)continue;
    if(event.event_id){if(seen.has(event.event_id))continue;seen.add(event.event_id);if(seen.size>4096)seen.delete(seen.values().next().value);}
    const v=view(id);
    if(event.type==='agent.session.turn.output_text.delta'||event.type==='agent.session.turn.output_text.done'){
     const key=remoteId(event.item_id),old=v.partials.get(key);if(v.partials.size>=8&&!old)continue;
     const text=event.type.endsWith('.done')?event.text:(old?.text??'')+(typeof event.delta==='string'?event.delta:'');
     if(typeof text==='string')v.partials.set(key,{id:key,text:text.slice(0,12000),role:'agent',phase:old?.phase??'final_answer'});v.activity={kind:'writing',label:'Escribiendo'};
    }
    if(event.type==='agent.session.turn.item.added'&&event.item?.type==='message'&&event.item.role==='assistant')v.partials.set(remoteId(event.item.id),{id:event.item.id,text:v.partials.get(event.item.id)?.text??'',role:'agent',phase:event.item.phase??'final_answer'});
    if(event.type==='agent.session.turn.item.done')saveItem(id,sessionId,event.item);
    if(event.type?.includes('required_action')||event.type==='agent.session.requires_action')store.update(id,state=>{state.nextCheckAt=0;});
    if(['agent.session.turn.completed','agent.session.turn.failed','agent.session.turn.cancelled'].includes(event.type)&&!event.turn?.subagent_id){store.update(id,state=>{state.nextCheckAt=0;});break;}
   }}catch{ /* Saved items recover a disconnected stream; never resubmit work. */ }
   finally{ready();clearTimeout(timeout);stream?.controller?.abort();if(watchers.get(id)===entry)watchers.delete(id);}
  })();let openingTimeout;try{await Promise.race([opened,new Promise(resolve=>{openingTimeout=setTimeout(resolve,250);})]);}finally{clearTimeout(openingTimeout);}
 }

 function bind(identity){
  exact(identity,['ownerId','devicePublicKey','connections']);need(identity.ownerId===createHash('sha256').update(identity.devicePublicKey).digest('hex'),'IDENTITY');need(Array.isArray(identity.connections)&&identity.connections.length<=4,'CONNECTIONS');
  need(allowed===null||allowed.has(identity.devicePublicKey),'AUTH_DEVICE_DENIED');
  const state=store.ensure(identity.devicePublicKey),connections=identity.connections.filter(c=>c?.format==='DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3').map(normalizeDevicePagedAgentPublicConnectionV4);
  need(connections.length<=1&&connections.every(c=>c.descriptor.devicePublicKey===state.publicKey),'IDENTITY');state.connections=connections;state.webSearchEnabled=provider?.webSearch===true;store.save(state.owner,state);return state;
 }
 async function refreshWallet(id,call,signal){
  const state=store.load(id),network=state.context?.network,link=state.walletLinks?.[network];
  if(!backend||!['read_wallet','read_operations'].includes(call.name)||link?.enabled!==true||link.expiresAt<=now()||store.callRecorded(id,state.sessionId,call.turn_id,call.call_id))return;
  // A malformed or model-selected owner/network never reaches the backend.
  try{exact(typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,[]);}catch{return;}
  let result=null,error=null;
  try{result=await backend.snapshot(id,network,signal);need(result.source==='BACKEND_RPC'&&result.financialPermission===false,'BACKEND_RESPONSE');result.context=normalizeAgentContextV1(result.context);need(result.context.network===network&&[result.context.observedAt,result.context.marketObservedAt].every(at=>at===null||at<=now()+5000),'BACKEND_RESPONSE');}catch{error='NATIVE_AGENT_BACKEND_UNAVAILABLE';}
  if(signal.aborted)return;
  store.update(id,current=>{
   const active=current.walletLinks?.[network];
   if(current.context?.network!==network||active?.enabled!==true||active.expiresAt!==link.expiresAt||active.expiresAt<=now())return;
   current.backendRead={network,checkedAt:now(),error};
   if(!error)current.backendSnapshot={source:'BACKEND_RPC',context:result.context,checkedAt:now()};
  });
 }
 async function sync(id,signal){
  let state=store.load(id);if(!state)return;
  try{
   if(!state.sessionId){
    if(state.sessionStatus==='CREATE_UNKNOWN')return;
    if(state.sessionStatus==='CREATING'){state.sessionStatus='CREATE_UNKNOWN';state.lastError='NATIVE_AGENT_SESSION_CREATION_UNCONFIRMED';store.save(id,state);return;}
    const first=store.pending(id)[0];if(!first){if(state.cancelRequested)store.update(id,s=>{s.cancelRequested=false;});return;}store.mark(id,first.id,'SENDING');
    state.sessionStatus='CREATING';store.save(id,state);
    let session;try{session=await provider.create(state,first,signal);}catch(error){
     if(!signal.aborted){
      const rejected=[400,401,403,404,422].includes(error.status);
      store.update(id,current=>{current.sessionStatus=rejected?'CREATE_REJECTED':'CREATE_UNKNOWN';current.lastError=error.lianumCode==='NATIVE_AGENT_COST_LIMIT_UNSUPPORTED'?error.lianumCode:rejected?'NATIVE_AGENT_SESSION_CONFIGURATION_REJECTED':'NATIVE_AGENT_SESSION_CREATION_UNCONFIRMED';current.nextCheckAt=Number.MAX_SAFE_INTEGER;});
      store.mark(id,first.id,rejected?'FAILED':'UNKNOWN');
     }
     throw error;
    }
    state=store.load(id);state.sessionId=remoteId(session.id);state.sessionStatus='ACTIVE';state.lastError=null;store.save(id,state);store.mark(id,first.id,'SENT');
   }
   await watch(id,state.sessionId);
   const session=await provider.retrieve(state.sessionId,signal);need(session.id===state.sessionId,'PROVIDER_RESPONSE');
   state=store.load(id);
   if(state.cancelRequested){const requestId=state.cancelRequestId;await provider.cancel(state.sessionId,requestId,signal);state=store.update(id,current=>{if(current.cancelRequestId===requestId)current.cancelRequested=false;});}
   if(session.status==='failed'){store.settle(id,'FAILED');state.sessionStatus='FAILED';state.lastError='NATIVE_AGENT_SESSION_FAILED';state.nextCheckAt=Number.MAX_SAFE_INTEGER;store.save(id,state);return;}
   // Pending actions, never historical tool items, determine which calls run.
   for(const call of session.required_actions??[]){
    need(call.type==='function_call','UNSUPPORTED_REQUIRED_ACTION');view(id).activity={kind:'tool',label:toolLabels[call.name]??'Comprobando información'};await refreshWallet(id,call,signal);const result=runAgentTool(store,{...store.load(id),backendAvailable:Boolean(backend),voiceAvailable:voice.configured,pushAvailable:push.configured,pushEnabled:store.pushSettings(id).enabled},call,now());
    const check={id:call.turn_id+':'+call.call_id,label:toolLabels[call.name]??'Comprobando información',complete:result.success};const v=view(id);v.checks=[...v.checks.filter(c=>c.id!==check.id),check].slice(-8);
    const card=toolPresentation(call.name,result);if(card)store.append(id,{remoteId:'card:'+state.sessionId+':'+call.call_id,text:card.text,data:card,phase:'tool_result'});
    if(result.success&&result.output?.proposalLink)store.append(id,{remoteId:'proposal:'+state.sessionId+':'+call.call_id,text:'Propuesta de pagos lista para revisar en tu móvil.',data:{proposalLink:result.output.proposalLink,operationId:result.output.operationId},phase:'proposal'});
    await provider.result(state.sessionId,call,card?{...result,output:{...result.output,uiShown:true}}:result,signal);
   }
   const items=await provider.items(state.sessionId,signal);need(Array.isArray(items)&&items.length<=100,'PROVIDER_RESPONSE');
   for(const item of [...items].reverse())saveItem(id,state.sessionId,item);
   state=store.load(id);
   if(session.status==='idle'){
    const turns=await provider.turns(state.sessionId,signal),last=turns[0];
    if(last&&['completed','failed','cancelled'].includes(last.status)&&!(state.sessionStatus==='ACTIVE'&&last.id&&last.id===state.lastSettledTurn)){if(state.sessionStatus!=='IDLE')state.idleReconcileUntil=now()+10000;if(last.id)state.lastSettledTurn=last.id;store.settle(id,last.status==='completed'?'COMPLETED':last.status==='cancelled'?'CANCELLED':'FAILED');state.sessionStatus='IDLE';view(id).activity=null;if(last.status!=='completed')view(id).partials.clear();state.lastError=last.status==='failed'?'NATIVE_AGENT_TURN_FAILED':null;}
   }
   // Messages arriving during a turn steer the same session. Stable IDs survive
   // lost replies, so restarting never generates a second logical submission.
   for(const message of store.pending(id)){
    store.mark(id,message.id,'SENDING');store.update(id,current=>{if(message.context)current.context=message.context;current.memoryQuery=message.text;current.memoryMessageId=message.id;});await watch(id,state.sessionId);await provider.send(state.sessionId,message,signal);store.mark(id,message.id,'SENT');state.sessionStatus='ACTIVE';
   }
   const latest=store.load(id);latest.sessionStatus=state.sessionStatus;latest.lastSettledTurn=state.lastSettledTurn;latest.idleReconcileUntil=state.idleReconcileUntil;latest.lastError=state.lastError;latest.failures=0;latest.nextCheckAt=now()+(watchers.has(id)?4000:1200);store.save(id,latest);
  }catch(error){
   if(signal.aborted)return;
   state=store.load(id);state.failures=(state.failures??0)+1;
   if(['CREATE_UNKNOWN','CREATE_REJECTED'].includes(state.sessionStatus)){store.save(id,state);return;}
   state.lastError='NATIVE_AGENT_CONNECTION_UNCONFIRMED';
   state.nextCheckAt=now()+Math.min(60000,5000*2**Math.min(state.failures,4));
   if(state.failures>=3&&state.sessionStatus!=='CREATE_UNKNOWN'){state.sessionStatus='NEEDS_REVIEW';state.nextCheckAt=Number.MAX_SAFE_INTEGER;}
   store.save(id,state);
  }
 }
 function snapshot(state,after){const id=state.owner;return {profile:'LIANUM_AGENT_STATE_V1',conversationId:state.conversationId,status:state.sessionStatus,error:state.lastError,messages:store.messages(id,after),deliveries:store.deliveries(id),streaming:[...view(id).partials.values()],activity:view(id).activity,checks:view(id).checks,features:{webSearch:provider?.webSearch===true,voice:voice.configured,push:push.configured,execution:false},pushSettings:store.pushSettings(id),operationTracking:operations.configured,operations:store.operations(id),walletAccess:{configured:Boolean(backend),links:state.walletLinks??{}},tasks:store.tasks(id),notes:store.notes(id),notifications:store.notifications(id)};}
 const api={
  capabilities:()=>({profile:'LIANUM_AGENT_CAPABILITIES_V1',configured:Boolean(provider),persistent:true,proposals:true,backgroundWallet:Boolean(backend),operationTracking:operations.configured,execution:false,voice:voice.configured,push:push.configured,model:provider?.model??null}),
  async *stream(identity,body,signal){
   const state=bind(identity);exact(body,[],['after']);let after=body.after??0;need(Number.isSafeInteger(after)&&after>=0);let previous='',heartbeat=now();const until=now()+15000;
   while(!closed&&!signal.aborted&&now()<until){
    const current=snapshot(store.load(state.owner),after),encoded=JSON.stringify(current);
    if(encoded!==previous){yield current;after=current.messages.at(-1)?.seq??after;previous=JSON.stringify({...current,messages:[]});heartbeat=now();}
    else if(now()-heartbeat>=2500){yield {profile:'LIANUM_AGENT_HEARTBEAT_V1'};heartbeat=now();}
    await sleep(60,signal);
   }
  },
  async dispatch(identity,path,body){
   const state=bind(identity),id=state.owner;
   if(path==='/v1/agent/state'){
    exact(body,[],['after']);const after=body.after??0;
    return snapshot(state,after);
   }
   if(['/v1/agent/operations/register','/v1/agent/operations/update'].includes(path)){const result=operations.register(state,body);void api.tick().catch(()=>{});return result;}
   if(['/v1/agent/operations/retry','/v1/agent/operations/stop'].includes(path))return operations.control(state,path,body);
   if(path==='/v1/agent/voice/open'){need(provider,'NOT_CONFIGURED');need(!['CREATE_REJECTED','CREATE_UNKNOWN','FAILED'].includes(state.sessionStatus),'VOICE_UNAVAILABLE');const result=voice.open(state,body);void api.tick().catch(()=>{});return result;}
   if(path==='/v1/agent/voice/state')return voice.status(state,body);
   if(path==='/v1/agent/voice/heartbeat')return voice.heartbeat(state,body);
   if(path==='/v1/agent/voice/close')return voice.end(state,body);
   if(path==='/v1/agent/push'){exact(body,['enabled'],['token']);need(push.configured,'PUSH_UNAVAILABLE');need(typeof body.enabled==='boolean');return body.enabled?store.registerPush(id,body.token):store.disablePush(id);}
   if(path==='/v1/agent/presence'){exact(body,['visible']);need(typeof body.visible==='boolean');store.update(id,current=>{current.chatVisibleUntil=body.visible?now()+25000:0;});return {visible:body.visible};}
   if(path==='/v1/agent/wallet'){
    exact(body,['enabled','network','currency','expiresAt','financialPermission']);
    need(backend,'BACKEND_NOT_CONFIGURED');need(typeof body.enabled==='boolean'&&['mainnet','testnet'].includes(body.network)&&['EUR','USD'].includes(body.currency)&&body.financialPermission===false);
    need(body.enabled?Number.isSafeInteger(body.expiresAt)&&body.expiresAt>now()&&body.expiresAt<=now()+31*86400000:body.expiresAt===null);
    store.update(id,current=>{current.walletLinks??={};if(body.enabled)current.walletLinks[body.network]={enabled:true,currency:body.currency,expiresAt:body.expiresAt};else{current.walletLinks={};delete current.backendSnapshot;}current.backendRead=null;});
    return {profile:'LIANUM_AGENT_WALLET_ACCESS_V1',...body};
   }
   if(path==='/v1/agent/messages'){
    need(provider,'NOT_CONFIGURED');need(state.sessionStatus!=='CREATE_REJECTED','SESSION_CONFIGURATION_REJECTED');exact(body,['id','text'],['context','client']);const input={...body};
    if(body.context!==undefined){input.context=normalizeAgentContextV1(body.context);need([input.context.observedAt,input.context.marketObservedAt].every(at=>at===null||at<=now()+5000));}
    if(input.client!==undefined){exact(input.client,['language','timeZone']);need(typeof input.client.language==='string'&&input.client.language.length<=40&&typeof input.client.timeZone==='string'&&input.client.timeZone.length<=80);try{new Intl.DateTimeFormat(input.client.language,{timeZone:input.client.timeZone});}catch{need(false);}}
    const prepared=prepareInput(state,input);if(state.sessionStatus!=='ACTIVE'){view(id).checks=[];view(id).activity={kind:'thinking',label:'Preparando la respuesta'};}
    const accepted=store.enqueue(id,prepared);void api.tick().catch(()=>{});return {profile:'LIANUM_AGENT_MESSAGE_ACCEPTED_V1',conversationId:state.conversationId,...accepted};
   }
   if(path==='/v1/agent/retry'){exact(body,[]);need(state.sessionStatus==='NEEDS_REVIEW'&&state.sessionId,'RECOVERY_UNAVAILABLE');store.update(id,s=>{s.failures=0;s.lastError=null;s.sessionStatus='ACTIVE';s.nextCheckAt=0;});void api.tick().catch(()=>{});return {requested:true};}
   if(path==='/v1/agent/memory/forget'){exact(body,['key']);need(typeof body.key==='string'&&/^[a-z][a-z0-9_]{0,39}$/.test(body.key));return store.forget(id,body.key);}
   if(path==='/v1/agent/ack'){exact(body,['through']);store.acknowledge(id,body.through);return {acknowledged:true};}
   if(path==='/v1/agent/cancel'){
    exact(body,[]);view(id).activity={kind:'stopping',label:'Deteniendo'};state.cancelRequested=true;state.cancelRequestId=randomUUID();state.nextCheckAt=0;store.save(id,state);for(const row of store.pending(id))if(row.status==='QUEUED')store.mark(id,row.id,'CANCELLED');void api.tick().catch(()=>{});return {requested:true,confirmed:false};
   }
   if(path==='/v1/agent/tasks/cancel'){exact(body,['id']);return store.cancelTask(id,body.id);}
   need(false,'ROUTE_NOT_FOUND');
  },
  async tick(){
   if(closed)return;
   const background=Promise.allSettled([operations.tick(),push.tick(),voice.tick()]);
   if(!provider){await background;return;}
   store.wakeDue((state,input)=>prepareInput(state,{...input,followup:true}));const work=[];
   for(const state of store.ownersDue()){
    if(running.has(state.owner)||running.size>=4||['CREATE_UNKNOWN','CREATE_REJECTED','NEEDS_REVIEW','FAILED'].includes(state.sessionStatus))continue;
    const controller=new AbortController(),promise=sync(state.owner,controller.signal).finally(()=>running.delete(state.owner));running.set(state.owner,{promise,controller});work.push(promise);
   }
   await Promise.all([...work,background]);
  },
  start(){need(!closed,'CLOSED');if(!timer){timer=setInterval(()=>{void api.tick().catch(()=>{});},tickMs);timer.unref();void api.tick();}},
  async close(){if(closed)return;closed=true;clearInterval(timer);for(const row of running.values())row.controller.abort();for(const row of watchers.values())row.controller.abort();await Promise.allSettled([operations.close(),push.close(),voice.close(),...[...running.values(),...watchers.values()].map(row=>row.promise)]);},
 };
 return Object.freeze(api);
}
