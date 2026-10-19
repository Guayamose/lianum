import {useEffect,useRef,useState} from 'react';
import {AppState,PermissionsAndroid,Platform} from 'react-native';
import {randomUUID} from 'expo-crypto';
import {setAudioModeAsync} from 'expo-audio';
import {RTCPeerConnection,RTCSessionDescription,mediaDevices,type MediaStream} from 'react-native-webrtc';
import type {AgentContextV1} from '@lianum/mobile-protocol/agent/chat-v1';
import {requestPublicWalletSessionV1} from '../api/public-wallet-session-api-v1';
const pause=(ms:number,signal:AbortSignal)=>new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();},timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});
export function useAgentVoice(active:boolean,refreshChat:()=>void){
 const [phase,setPhase]=useState<'idle'|'connecting'|'connected'|'ending'|'error'>('idle'),[error,setError]=useState<string|null>(null),[captions,setCaptions]=useState<{speaker:'you'|'agent';text:string}[]>([]),[muted,setMuted]=useState(false),[speaker,setSpeaker]=useState(true),[seconds,setSeconds]=useState(0);
 const current=useRef<{id:string;peer:RTCPeerConnection;stream:MediaStream|null;events:any;controller:AbortController;ready:boolean;muted:boolean;ending:boolean;startedAt:number;timer?:ReturnType<typeof setInterval>}|null>(null),refresh=useRef(refreshChat);refresh.current=refreshChat;
 async function cleanup(call=current.current){if(!call||current.current!==call)return;current.current=null;call.controller.abort();clearInterval(call.timer);for(const track of call.stream?.getTracks()??[])track.stop();call.events?.close();call.peer.close();await setAudioModeAsync({allowsRecording:false,shouldPlayInBackground:false}).catch(()=>{});setMuted(false);refresh.current();}
 async function end(){const call=current.current;if(!call||call.ending)return;call.ending=true;call.controller.abort();setPhase('ending');for(const track of call.stream?.getTracks()??[])track.stop();for(const receiver of call.peer.getReceivers())if(receiver.track)receiver.track.enabled=false;try{if(call.events?.readyState==='open')call.events.send(JSON.stringify({type:'session.close'}));await requestPublicWalletSessionV1('/v1/agent/voice/close',{id:call.id},AbortSignal.timeout(5000));}catch{}finally{await cleanup(call);if(!current.current)setPhase('idle');}}
 useEffect(()=>{if(!active)void end();return()=>{void end();};},[active]);
 useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state==='background'&&current.current)void end();});return()=>listener.remove();},[]);
 async function start(context:AgentContextV1){if(current.current||!active)return;setError(null);setCaptions([]);setSeconds(0);setSpeaker(true);setPhase('connecting');
  const controller=new AbortController(),peer=new RTCPeerConnection({iceServers:[]}),id=randomUUID(),call={id,peer,stream:null as MediaStream|null,events:null as any,controller,ready:false,muted:false,ending:false,startedAt:Date.now(),timer:undefined as ReturnType<typeof setInterval>|undefined};current.current=call;
  try{
   if(Platform.OS==='android'){const permission=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);if(permission!==PermissionsAndroid.RESULTS.GRANTED)throw Error('MICROPHONE_PERMISSION');}
   if(controller.signal.aborted)return;
   await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldRouteThroughEarpiece:false,interruptionMode:'doNotMix'});
   call.stream=await mediaDevices.getUserMedia({audio:true,video:false});if(controller.signal.aborted){for(const track of call.stream.getTracks())track.stop();return;}
   for(const track of call.stream.getAudioTracks()){track.enabled=false;peer.addTrack(track,call.stream);}
   const events=peer.createDataChannel('oai-events');call.events=events;
   events.addEventListener('message',(event:any)=>{if(current.current!==call)return;try{const value=JSON.parse(event.data);if(value.type==='session.started'){call.ready=true;call.startedAt=Date.now();for(const track of call.stream?.getAudioTracks()??[])track.enabled=!call.muted;setPhase('connected');}
    else if(value.type==='session.closed'){void cleanup(call).then(()=>{if(!current.current)setPhase('idle');});}
    else if(['session.input_transcript.delta','session.output_transcript.delta'].includes(value.type)&&typeof value.delta==='string'){const role=value.type==='session.input_transcript.delta'?'you' as const:'agent' as const;setCaptions(prior=>{const rows=[...prior],last=rows.at(-1);if(last?.speaker===role)rows[rows.length-1]={speaker:role,text:(last.text+value.delta).slice(-2000)};else rows.push({speaker:role,text:value.delta.slice(-2000)});return rows.slice(-6);});}
   }catch{}});
   events.addEventListener('close',()=>{if(current.current===call)void cleanup(call).then(()=>{if(current.current)return;setPhase('error');setError("The call has been disconnected. The conversation and the accepted work are still saved.");});});
   peer.addEventListener('connectionstatechange',()=>{if(['failed','closed'].includes(peer.connectionState)&&current.current===call)void end();});
   const offer=await peer.createOffer({offerToReceiveAudio:true});await peer.setLocalDescription(offer);
   for(let elapsed=0;peer.iceGatheringState!=='complete'&&elapsed<10000&&!controller.signal.aborted;elapsed+=100)await pause(100,controller.signal);
   if(controller.signal.aborted)return;const sdp=peer.localDescription?.sdp;if(!sdp)throw Error();const locale=Intl.DateTimeFormat().resolvedOptions();
   let result=await requestPublicWalletSessionV1('/v1/agent/voice/open',{id,sdp,context,client:{language:'en-US',timeZone:locale.timeZone||'UTC'}},controller.signal);
   for(let tries=0;['QUEUED','CREATING','CONNECTING'].includes(result.status)&&tries<35&&!controller.signal.aborted;tries++){await pause(700,controller.signal);result=await requestPublicWalletSessionV1('/v1/agent/voice/state',{id},controller.signal);}
   if(controller.signal.aborted)return;if(result.status!=='ACTIVE'||typeof result.answer!=='string')throw Error(result.error??'VOICE_UNAVAILABLE');
   await peer.setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:result.answer}));
   let lastHeartbeatAt=Date.now();
   call.timer=setInterval(()=>{if(current.current!==call)return;setSeconds(Math.floor((Date.now()-call.startedAt)/1000));if(Date.now()-call.startedAt>=600000||!call.ready&&Date.now()-call.startedAt>45000){void end();return;}if(Date.now()-lastHeartbeatAt<10000)return;lastHeartbeatAt=Date.now();void requestPublicWalletSessionV1('/v1/agent/voice/heartbeat',{id},AbortSignal.timeout(7000)).then(state=>{if(!['ACTIVE','CREATING'].includes(state.status)&&current.current===call)void end();}).catch(()=>{if(Date.now()-call.startedAt>=600000)void end();});},1000);
  }catch(error){if(controller.signal.aborted)return;const message=error instanceof Error?error.message:'';try{await requestPublicWalletSessionV1('/v1/agent/voice/close',{id},AbortSignal.timeout(3000));}catch{}await cleanup(call);if(current.current)return;setPhase('error');setError(message.includes('MICROPHONE_PERMISSION')?"Allow microphone access to talk to Lianum.":message.includes('BUDGET')?"The voice usage limit has been reached. You can continue in writing.":"Could not connect call. You can continue in this same chat.");}
 }
 function toggleMuted(){const call=current.current;if(!call)return;const value=!call.muted;call.muted=value;for(const track of call.stream?.getAudioTracks()??[])track.enabled=call.ready&&!value;setMuted(value);}
 async function toggleSpeaker(){const value=!speaker;await setAudioModeAsync({shouldRouteThroughEarpiece:!value}).then(()=>setSpeaker(value)).catch(()=>{});}
 return {phase,error,captions,muted,speaker,seconds,start,end,toggleMuted,toggleSpeaker};
}
