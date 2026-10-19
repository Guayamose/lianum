import OpenAI from 'openai';
import {SidebandWS} from 'openai/resources/live/sideband/ws';
import {TranscriptGrouper} from 'openai/helpers/live';

/** The server owns configuration, delegation and credentials. The phone only
 * negotiates audio and may mute or close its own session. No tool runs here. */
export function createOpenAILiveProvider({apiKey,enabled=false,client,Sideband=SidebandWS,Grouper=TranscriptGrouper}={}){
 if(!enabled)return null;if(!apiKey&&!client)throw Error('NATIVE_AGENT_VOICE_CONFIGURATION');
 const sdk=client??new OpenAI({apiKey,maxRetries:0,timeout:15000});
 return Object.freeze({model:'gpt-live-1',
  create({sdp,instructions,input,owner},signal){return sdk.live.create({session:{model:'gpt-live-1',audio:{output:{voice:'marin'}},delegation:{type:'client'},instructions,input,store:false,client:{data_channel:{allowed_client_events:['session.close','session.input_audio.mute','session.input_audio.unmute'],allowed_server_events:['session.started','session.closed','session.input_transcript.delta','session.output_transcript.delta','session.usage.updated','session.input_audio.muted','session.input_audio.unmuted','error'].map(type=>({type}))}}},transport:{type:'webrtc',sdp}},{signal,headers:{'OpenAI-Safety-Identifier':owner}});},
  async attach(sessionId,{onEvent,onSegment,onDisconnect}){
   const side=new Sideband(sdk,{session_id:sessionId},{reconnect:null,maxQueueSize:65536,maxPayload:262144});let opened,failed,finished=false;
   const ready=new Promise((resolve,reject)=>{opened=resolve;failed=reject;}),grouper=new Grouper({assistantSilenceMs:1000,backchannelMaxDurationMs:0});
   grouper.on('segment.closed',event=>{try{onSegment(event.segment);}catch{void close();}});
   const pump=(async()=>{try{for await(const record of side.stream({maxBufferedEvents:256})){
    if(record.type==='open'){opened();continue;}
    if(record.type==='message'){
     const event=record.message;
     if(['session.input_transcript.delta','session.output_transcript.delta'].includes(event.type)){if(onEvent(event)!==false)grouper.push(event);}
     else if(event.type==='session.closed'){grouper.push(event);onEvent(event);finished=true;break;}
     else if(!['session.input_audio.append','session.output_audio.delta'].includes(event.type))onEvent(event);
    }
    if(record.type==='error'||record.type==='close'){failed(Error('NATIVE_AGENT_VOICE_CONNECTION'));break;}
   }}catch{failed(Error('NATIVE_AGENT_VOICE_CONNECTION'));}finally{grouper.close();if(!finished)onDisconnect();}})();
   function close(){side.close();grouper.close();return pump;}
   let timeout;try{await Promise.race([ready,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('NATIVE_AGENT_VOICE_CONNECTION')),8000);})]);}catch(error){side.close();await pump;throw error;}finally{clearTimeout(timeout);}
   return Object.freeze({send:event=>side.send(event),close});
  }
 });
}
