import {createHash,randomUUID} from 'node:crypto';
import {normalizeAgentContextV1} from '@lianum/mobile-protocol/agent/chat-v1';
import {exact,need,uuid} from './validation.mjs';

const LIMIT_MS=600000,RESERVE_MICROS=550000;
const instructions=`Eres la voz del agente personal Lianum. Habla con naturalidad, brevedad y calidez en el idioma del usuario, en español de España si habla español. Tu nombre es Lianum, nunca el nombre supuesto del usuario. Escucha interrupciones y correcciones; puedes reconocerlas mientras el agente trabaja. Usa el historial para continuar la misma conversación. Para consultar datos, recordar preferencias, programar tareas, preparar propuestas o realizar cualquier gestión de Lianum, delega al agente de la aplicación. Nunca inventes saldos, destinatarios, importes, comisiones, permisos ni resultados. Los movimientos necesitan revisión y huella en el móvil; una afirmación por voz no los autoriza. Habla sólo de resultados que devuelva el agente y reconoce la incertidumbre que indique. Cuando el usuario cambie una petición pendiente, delega la corrección. Puedes resolver saludos y conversación sencilla directamente. No leas nombres internos, JSON ni enlaces. Mantén las respuestas conversacionales y evita repetir catálogos de funciones.`;

export function createAgentVoice({store,provider=null,enqueue,now=Date.now,budgetMicros=5000000}){
 need(provider===null||typeof provider.create==='function'&&typeof provider.attach==='function','VOICE_CONFIGURATION');need(Number.isSafeInteger(budgetMicros)&&budgetMicros>=RESERVE_MICROS&&budgetMicros<=10000000,'VOICE_CONFIGURATION');
 const active=new Map();let closed=false;
 const key=(owner,id)=>owner+':'+id;
 const view=(owner,id)=>{const row=store.voiceCall(owner,id);need(row,'VOICE_NOT_FOUND');return {profile:'LIANUM_AGENT_VOICE_CALL_V1',id:row.id,status:row.status,answer:row.answer??null,sessionId:row.sessionId??null,expiresAt:row.expiresAt,error:row.error??null,finalized:row.finalized===true,model:'gpt-live-1',maximumSeconds:LIMIT_MS/1000};};
 function open(state,body){
  need(provider,'VOICE_UNAVAILABLE');exact(body,['id','sdp','context','client']);uuid(body.id);need(typeof body.sdp==='string'&&body.sdp.length<=65536&&body.sdp.startsWith('v=0')&&/m=audio /.test(body.sdp)&&!/m=video /.test(body.sdp),'VOICE_SDP');
  const context=normalizeAgentContextV1(body.context);need([context.observedAt,context.marketObservedAt].every(at=>at===null||at<=now()+5000));exact(body.client,['language','timeZone']);need(typeof body.client.language==='string'&&body.client.language.length<=40&&typeof body.client.timeZone==='string'&&body.client.timeZone.length<=80);try{new Intl.DateTimeFormat(body.client.language,{timeZone:body.client.timeZone});}catch{need(false);}
  const offerSHA256=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  store.reserveVoice(state.owner,body.id,{offerSHA256,sdp:body.sdp,context,client:body.client,reservedMicros:RESERVE_MICROS,expiresAt:now()+LIMIT_MS,lastHeartbeatAt:now(),lastInputAt:0,lastInputEndMs:0,lastDelegatedEndMs:0,revision:0,finalized:false},budgetMicros);
  return view(state.owner,body.id);
 }
 function status(state,body){exact(body,['id']);uuid(body.id);return view(state.owner,body.id);}
 function heartbeat(state,body){exact(body,['id']);uuid(body.id);store.updateVoice(state.owner,body.id,row=>{row.lastHeartbeatAt=now();});return view(state.owner,body.id);}
 function end(state,body){exact(body,['id']);uuid(body.id);const row=store.voiceCall(state.owner,body.id);need(row,'VOICE_NOT_FOUND');if(row.status==='QUEUED')store.updateVoice(state.owner,body.id,r=>{r.status='CLOSED';r.chargeMicros=0;r.finalized=true;delete r.sdp;});else if(['ACTIVE','CREATING','CONNECTING','CLOSING'].includes(row.status)){store.updateVoice(state.owner,body.id,r=>r.status='CLOSING');requestClose(state.owner,body.id);}return view(state.owner,body.id);}
 function requestClose(owner,id){const entry=active.get(key(owner,id));if(!entry?.channel||entry.closing)return;entry.closing=true;try{entry.channel.send({type:'session.close',event_id:randomUUID()});}catch{}entry.closeAt=now();}
 function fail(owner,id,error){const row=store.voiceCall(owner,id);if(!row||row.status==='CLOSED')return;store.updateVoice(owner,id,r=>{r.status='NEEDS_REVIEW';r.error=error;r.chargeMicros=r.reservedMicros;delete r.sdp;});}
 function event(owner,id,value){
  const row=store.voiceCall(owner,id);if(!row)return false;
  if(['session.input_transcript.delta','session.output_transcript.delta'].includes(value.type)){
   const inserted=store.voiceFragment(owner,id,value);if(!inserted)return false;
   if(value.type==='session.input_transcript.delta')store.updateVoice(owner,id,current=>{current.revision++;current.lastInputAt=now();current.lastInputEndMs=Math.max(current.lastInputEndMs,value.end_ms);});
  }else if(value.type==='session.delegation.created'&&value.delegation?.target==='client'){
   need(typeof value.delegation.id==='string'&&value.delegation.id.length<=200,'VOICE_EVENT');if(!store.voiceDelegation(owner,id,value.delegation.id))store.saveVoiceDelegation(owner,id,value.delegation.id,'WAITING',{createdAt:now(),messageId:randomUUID()});
   store.updateVoice(owner,id,current=>{current.pendingDelegation=value.delegation.id;});
  }else if(value.type==='session.closed'){
   need(Number.isFinite(value.usage?.seconds)&&value.usage.seconds>=0&&value.usage.seconds<=86400,'VOICE_USAGE');
   store.updateVoice(owner,id,current=>{current.status='CLOSED';current.finalized=true;current.seconds=value.usage.seconds;current.chargeMicros=Math.ceil(Math.max(15,value.usage.seconds)*50000/60);delete current.sdp;});
   const entry=active.get(key(owner,id));if(entry)entry.finalized=true;
  }else if(value.type==='session.usage.updated'&&Number.isFinite(value.usage?.seconds))store.updateVoice(owner,id,current=>{current.seconds=value.usage.seconds;});
  return true;
 }
 async function connect(row,entry){
  const owner=row.owner,id=row.id;let sessionId=row.sessionId;
  try{
   if(row.status==='QUEUED'){
    store.updateVoice(owner,id,value=>value.status='CREATING');
    const history=store.recentMessages(owner).map(message=>({type:'message',role:message.role==='you'?'user':'assistant',content:[{type:message.role==='you'?'input_text':'output_text',text:message.text.slice(-600)}]}));
    const result=await provider.create({sdp:row.sdp,instructions,input:history,owner},entry.controller.signal);
    need(typeof result.session?.id==='string'&&result.session.id.length<=200&&result.transport?.type==='webrtc'&&typeof result.transport.sdp==='string'&&result.transport.sdp.length<=65536,'VOICE_RESPONSE');sessionId=result.session.id;
    store.updateVoice(owner,id,value=>{value.sessionId=sessionId;value.answer=result.transport.sdp;if(value.status!=='CLOSING')value.status='CONNECTING';delete value.sdp;});
   }else if(row.status==='CREATING'&&!sessionId){fail(owner,id,'NATIVE_AGENT_VOICE_CREATION_UNCONFIRMED');return;}
   if(!sessionId)return;
   const attachment=randomUUID();
   entry.channel=await provider.attach(sessionId,{onEvent:value=>event(owner,id,value),onSegment:segment=>store.appendVoice(owner,id,segment,attachment),onDisconnect:()=>{if(!entry.finalized&&!closed)fail(owner,id,'NATIVE_AGENT_VOICE_CONNECTION_UNCONFIRMED');}});
   store.updateVoice(owner,id,value=>{if(value.status==='CONNECTING')value.status='ACTIVE';});
   if(closed||store.voiceCall(owner,id).status==='CLOSING')requestClose(owner,id);
  }catch(error){if(!closed)fail(owner,id,[400,401,403,404,422].includes(error?.status)?'NATIVE_AGENT_VOICE_CONFIGURATION_REJECTED':'NATIVE_AGENT_VOICE_CREATION_UNCONFIRMED');}
  finally{entry.connecting=false;}
 }
 function delegate(row,entry){
  if(!row.pendingDelegation||row.status!=='ACTIVE'||!entry.channel||now()-row.lastInputAt<500)return;
  const saved=store.voiceDelegation(row.owner,row.id,row.pendingDelegation);if(saved?.status!=='WAITING')return;
  const fragments=store.voiceInput(row.owner,row.id,row.lastDelegatedEndMs),text=fragments.map(f=>f.text).join('').trim();
  if(!text){if(now()-saved.createdAt>5000){entry.channel.send({type:'session.commentary.append',delegation_id:saved.id,event_id:randomUUID(),content:'No se ha podido confirmar la petición. Pide al usuario que la repita.'});store.saveVoiceDelegation(row.owner,row.id,saved.id,'NEEDS_CLARIFICATION',saved);}return;}
  if(text.length>2000){entry.channel.send({type:'session.commentary.append',delegation_id:saved.id,event_id:randomUUID(),content:'Pide al usuario que divida la petición en una parte más breve para poder tramitarla.'});store.saveVoiceDelegation(row.owner,row.id,saved.id,'NEEDS_CLARIFICATION',saved);return;}
  store.transaction(()=>{
   const state=store.load(row.owner);enqueue(state,{id:saved.messageId,text,context:row.context,client:row.client,internalVoiceInput:true,voice:true});
   store.saveVoiceDelegation(row.owner,row.id,saved.id,'AWAITING_BACKEND',{...saved,revision:row.revision,submittedAt:now()});
   store.updateVoice(row.owner,row.id,value=>{value.lastDelegatedEndMs=row.lastInputEndMs;});
  });
  entry.channel.send({type:'session.thinking.append',delegation_id:saved.id,event_id:randomUUID(),content:'La petición está aceptada por el mismo agente persistente de Lianum. Espera su resultado; no supongas que ya se ha completado.'});
 }
 function backendAnswer(owner,text,itemId,turnId){
  for(const row of store.voiceCalls().filter(r=>r.owner===owner&&r.status==='ACTIVE')){
   const entry=active.get(key(owner,row.id)),pending=row.pendingDelegation&&store.voiceDelegation(owner,row.id,row.pendingDelegation);if(!entry?.channel||pending?.status!=='AWAITING_BACKEND')continue;
   const submitted=store.message(owner,pending.messageId);
   if(!submitted||submitted.status!=='SENT'||turnId&&turnId===store.load(owner).lastSettledTurn)return false;
   if(pending.revision!==row.revision||store.latestSubmission(owner)!==pending.messageId){store.saveVoiceDelegation(owner,row.id,pending.id,'SUPERSEDED',{...pending,itemId});return false;}
   try{
    // Bounded plain data goes to the voice model; full tool results stay here.
    const bytes=Buffer.from(text),content=bytes.subarray(0,1000).toString('utf8').replace(/\uFFFD$/,'');
    store.saveVoiceDelegation(owner,row.id,pending.id,'RESULT_SENT',{...pending,itemId});
    entry.channel.send({type:'session.commentary.append',delegation_id:pending.id,event_id:randomUUID(),content});return bytes.length<=1000;
   }catch{return false;}
  }
  return false;
 }
 return Object.freeze({configured:Boolean(provider),open,status,heartbeat,end,backendAnswer,
  async tick(){if(closed||!provider)return;const work=[];
   for(const row of store.voiceCalls()){
    const id=key(row.owner,row.id);let entry=active.get(id);
    if(!entry){entry={controller:new AbortController(),channel:null,connecting:true,closing:false,finalized:false,promise:null};active.set(id,entry);entry.promise=connect(row,entry);work.push(entry.promise);continue;}
    if(entry.connecting)continue;
    if(row.status==='CLOSING'||now()>=row.expiresAt||now()-row.lastHeartbeatAt>30000){if(row.status!=='CLOSING')store.updateVoice(row.owner,row.id,value=>value.status='CLOSING');requestClose(row.owner,row.id);if(entry.closing&&now()-entry.closeAt>7000){fail(row.owner,row.id,'NATIVE_AGENT_VOICE_FINALIZATION_UNCONFIRMED');await entry.channel?.close();active.delete(id);}continue;}
    delegate(row,entry);
   }
   for(const [id,entry] of active){const split=id.indexOf(':'),row=store.voiceCall(id.slice(0,split),id.slice(split+1));if(!['ACTIVE','CREATING','CONNECTING','CLOSING','QUEUED'].includes(row.status)&&!entry.connecting){await entry.channel?.close();active.delete(id);}}
   await Promise.allSettled(work);
  },
  async close(){closed=true;if(!active.size)return;for(const row of store.voiceCalls()){const entry=active.get(key(row.owner,row.id));if(entry?.channel){store.updateVoice(row.owner,row.id,value=>value.status='CLOSING');requestClose(row.owner,row.id);}else entry?.controller.abort();}await Promise.allSettled([...active.values()].map(entry=>entry.promise));await new Promise(resolve=>setTimeout(resolve,250));await Promise.allSettled([...active.values()].map(entry=>entry.channel?.close()));active.clear();}
 });
}
