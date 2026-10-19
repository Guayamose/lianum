import {agentDisplayLabelV1,agentDisplayValueV1} from './agent-presentation-v1';
import {useEffect,useRef,useState} from 'react';
import {randomUUID} from 'expo-crypto';
import {readPublicWalletJsonV1,requestPublicWalletSessionV1,streamPublicWalletSessionV1} from '../api/public-wallet-session-api-v1';
import type {AgentContextV1} from '@lianum/mobile-protocol/agent/chat-v1';
import type {AgentMessageV1,AgentActionV1} from './agent-conversation-v1';
import type {NativeWalletAccountV1} from '../native-wallet/native-wallet-ui-port';
export type ChatMessage=AgentMessageV1&{remoteId:string;status:string;phase?:string;itemId?:string;createdAt?:number;annotations?:{url:string;title:string}[];streaming?:boolean;optimistic?:boolean};
type Followup={id:string;text:string;dueAt:number;status:string};
type Note={key:string;value:string;updatedAt:number};
type Request={id:string;text:string;context:AgentContextV1;client:{language:string;timeZone:string}};
type WalletAccess={configured:boolean;links:Partial<Record<'mainnet'|'testnet',{enabled:boolean;currency:'EUR'|'USD';expiresAt:number}>>};
const safeURL=(value:unknown)=>{try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
function message(row:any):ChatMessage{
 if(!Number.isSafeInteger(row.seq)||typeof row.id!=='string'||!['you','agent'].includes(row.role)||typeof row.text!=='string'||row.text.length>12000)throw Error('MOBILE_AGENT_RESPONSE');
 const facts=Array.isArray(row.facts)?row.facts.filter((f:any)=>typeof f.label==='string'&&f.label.length<=100&&typeof f.value==='string'&&f.value.length<=160).slice(0,12).map((f:any)=>({...f,label:agentDisplayLabelV1(f.label),value:agentDisplayValueV1(f.value)})):undefined;
 const checks=Array.isArray(row.checks)?row.checks.filter((c:any)=>typeof c.label==='string'&&typeof c.complete==='boolean').slice(0,8).map((c:any)=>({...c,label:agentDisplayLabelV1(c.label)})):undefined;
 const action=row.action&&['wallet','operations','permissions','plan','approvals'].includes(row.action.target)&&typeof row.action.label==='string'?{label:agentDisplayLabelV1(row.action.label.slice(0,100)),target:row.action.target as AgentActionV1}:undefined;
 const annotations=Array.isArray(row.annotations)?row.annotations.filter((a:any)=>safeURL(a.url)&&typeof a.title==='string').slice(0,12).map((a:any)=>({url:safeURL(a.url)!,title:a.title.slice(0,150)})):undefined;
 return {id:row.seq,remoteId:row.id,role:row.role,text:row.role==='agent'&&['tool_result','proposal'].includes(row.phase)?agentDisplayLabelV1(row.text):row.text,status:row.status,createdAt:row.createdAt,phase:row.phase,itemId:row.itemId,facts,checks,action,annotations,...(typeof row.proposalLink==='string'&&row.proposalLink.startsWith('lianum://agent/proposal?data=')?{proposalLink:row.proposalLink}:{})};
}
export function useAgentService(active:boolean){
 const [operations,setOperations]=useState<any[]>([]),[pushSettings,setPushSettings]=useState({enabled:false,error:null as string|null});
 const [walletAccess,setWalletAccess]=useState<WalletAccess>({configured:false,links:{}}),[walletAccessBusy,setWalletAccessBusy]=useState(false),[walletAccessError,setWalletAccessError]=useState<string|null>(null);const walletAccessWork=useRef(false);
 const [mode,setMode]=useState<'checking'|'unavailable'|'remote'>('checking'),[connection,setConnection]=useState<'checking'|'ready'|'offline'>('checking'),[messages,setMessages]=useState<ChatMessage[]>([]),[streaming,setStreaming]=useState<ChatMessage[]>([]),[working,setWorking]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState<string|null>(null),[status,setStatus]=useState('NEW');
 const [tasks,setTasks]=useState<Followup[]>([]),[notes,setNotes]=useState<Note[]>([]),[checks,setChecks]=useState<{label:string;complete:boolean}[]>([]),[activity,setActivity]=useState<{kind:string;label:string}|null>(null),[features,setFeatures]=useState({webSearch:false,voice:false,push:false,execution:false}),[generation,setGeneration]=useState(0);
 const connectedOnce=useRef(false),current=useRef<AbortController|null>(null),cursor=useRef(0),rows=useRef(new Map<string,ChatMessage>()),outbox=useRef(new Map<string,Request>()),serial=useRef(0),workingRef=useRef(false),sendBusy=useRef(false),refreshRef=useRef<(()=>Promise<void>)|null>(null),kickRef=useRef<(()=>void)|null>(null);
 const publish=()=>setMessages([...rows.current.values()].sort((a,b)=>a.id-b.id));
 useEffect(()=>{
  if(!active)return;const controller=new AbortController();current.current=controller;let timer:ReturnType<typeof setTimeout>|undefined,inFlight:Promise<void>|null=null,failures=0,polling=false,wakeRequested=false,acknowledged=0;
  function apply(state:any){
   if(controller.signal.aborted)return;
    if(state?.profile!=='LIANUM_AGENT_STATE_V1'||!Array.isArray(state.messages)||state.messages.length>100)throw Error('MOBILE_AGENT_RESPONSE');
    for(const row of state.messages){const m=message(row);rows.current.set(row.id,m);cursor.current=Math.max(cursor.current,row.seq);outbox.current.delete(row.id);}
    for(const row of state.deliveries??[]){const old=rows.current.get(row.id);if(old&&typeof row.status==='string'){rows.current.set(row.id,{...old,status:row.status,optimistic:false});outbox.current.delete(row.id);}}
    publish();const blocked=['FAILED','NEEDS_REVIEW','CREATE_UNKNOWN','CREATE_REJECTED'].includes(state.status),busy=!blocked&&(['ACTIVE','CREATING'].includes(state.status)||(state.deliveries??[]).some((r:any)=>['QUEUED','SENDING','SENT'].includes(r.status)));
    setStatus(state.status);setWorking(busy);workingRef.current=busy;setActivity(state.activity&&typeof state.activity.label==='string'?{...state.activity,label:agentDisplayLabelV1(state.activity.label)}:null);
    setChecks(Array.isArray(state.checks)?state.checks.filter((r:any)=>typeof r.label==='string'&&typeof r.complete==='boolean').slice(-8).map((r:any)=>({...r,label:agentDisplayLabelV1(r.label)})):[]);
    setStreaming(Array.isArray(state.streaming)?state.streaming.filter((r:any)=>typeof r.id==='string'&&typeof r.text==='string'&&r.text.length<=12000&&r.text.length>0).slice(0,8).map((r:any,i:number)=>({id:Number.MAX_SAFE_INTEGER-8+i,remoteId:'stream:'+r.id,itemId:r.id,role:'agent',text:r.text,status:'STREAMING',streaming:true,phase:r.phase})):[]);
    setError(state.error?state.status==='NEEDS_REVIEW'?"The connection has been interrupted. Your conversation is saved.":state.status==='CREATE_UNKNOWN'?"I have not been able to confirm the start. Your message is saved; avoid sending it again.":"Your agent couldn't complete the task.":null);
    if(Array.isArray(state.tasks))setTasks(state.tasks.filter((r:any)=>typeof r.id==='string'&&typeof r.text==='string'&&Number.isSafeInteger(r.dueAt)&&typeof r.status==='string').slice(0,100));
    if(Array.isArray(state.notes))setNotes(state.notes.filter((r:any)=>typeof r.key==='string'&&typeof r.value==='string'&&r.value.length<=500).slice(0,32));
    if(state.features)setFeatures({webSearch:state.features.webSearch===true,voice:state.features.voice===true,push:state.features.push===true,execution:false});
    if(state.pushSettings)setPushSettings({enabled:state.pushSettings.enabled===true,error:typeof state.pushSettings.error==='string'?state.pushSettings.error:null});
    if(Array.isArray(state.operations))setOperations(state.operations.filter((r:any)=>typeof r.id==='string'&&typeof r.status==='string'&&typeof r.tracking==='string').slice(0,64));
    const through=Math.max(0,...(state.notifications??[]).filter((r:any)=>rows.current.has(r.messageId)&&Number.isSafeInteger(r.seq)).map((r:any)=>r.seq));if(through>acknowledged){acknowledged=through;void requestPublicWalletSessionV1('/v1/agent/ack',{through},controller.signal).catch(()=>{acknowledged=0;});}
    if(state.walletAccess){const links:WalletAccess['links']={};for(const network of ['mainnet','testnet'] as const){const link=state.walletAccess.links?.[network];if(link?.enabled===true&&['EUR','USD'].includes(link.currency)&&Number.isSafeInteger(link.expiresAt))links[network]={enabled:true,currency:link.currency,expiresAt:link.expiresAt};}setWalletAccess({configured:state.walletAccess.configured===true,links});}
    setConnection('ready');failures=0;
  }
  async function load(){for(let page=0;page<10;page++){
   const state=await requestPublicWalletSessionV1('/v1/agent/state',{after:cursor.current},controller.signal);apply(state);if(state.messages.length<100)break;
  }}
  function refresh(){if(!inFlight)inFlight=load().finally(()=>{inFlight=null;});return inFlight;}
  refreshRef.current=refresh;
  async function poll(){if(polling){wakeRequested=true;return;}polling=true;clearTimeout(timer);try{await refresh();if(workingRef.current&&!controller.signal.aborted)await streamPublicWalletSessionV1({after:cursor.current},apply,controller.signal);}catch{if(!controller.signal.aborted){failures++;setConnection('offline');setError("Offline. Your conversation is saved and the accepted work can continue.");}}finally{polling=false;if(!controller.signal.aborted){clearTimeout(timer);timer=setTimeout(()=>void poll(),wakeRequested?40:failures?Math.min(20000,3000*failures):workingRef.current?40:10000);wakeRequested=false;}}}
  kickRef.current=()=>{if(polling){wakeRequested=true;return;}clearTimeout(timer);timer=setTimeout(()=>void poll(),40);};
  void(async()=>{try{setConnection('checking');const caps=await readPublicWalletJsonV1('/v1/agent/capabilities',undefined,controller.signal);if(controller.signal.aborted)return;if(caps?.profile!=='LIANUM_AGENT_CAPABILITIES_V1'||typeof caps.configured!=='boolean')throw Error();setMode(caps.configured?'remote':'unavailable');if(!caps.configured){setConnection('offline');setError("Your agent's not available yet, you can still use the wallet.");return;}connectedOnce.current=true;await poll();}catch{if(!controller.signal.aborted){setMode(connectedOnce.current?'remote':'unavailable');setConnection('offline');setError("Couldn't connect with your agent.");if(connectedOnce.current)await poll();}}})();
  return()=>{controller.abort();clearTimeout(timer);for(const [id,row] of rows.current)if(row.optimistic&&row.status==='QUEUED')rows.current.set(id,{...row,status:'RETRY'});publish();if(current.current===controller)current.current=null;refreshRef.current=null;kickRef.current=null;};
 },[active,generation]);
 async function submit(request:Request){const controller=current.current;if(!controller||controller.signal.aborted||sendBusy.current)return false;sendBusy.current=true;setSending(true);setError(null);
  try{const response=await requestPublicWalletSessionV1('/v1/agent/messages',request,controller.signal);if(controller.signal.aborted)return false;if(response?.profile!=='LIANUM_AGENT_MESSAGE_ACCEPTED_V1'||response.id!==request.id)throw Error();const old=rows.current.get(request.id);if(old)rows.current.set(request.id,{...old,status:'SENT',optimistic:false});outbox.current.delete(request.id);publish();workingRef.current=true;setWorking(true);setActivity({kind:'thinking',label:"Preparing your response"});kickRef.current?.();return true;}
  catch{if(!controller.signal.aborted){const old=rows.current.get(request.id);if(old?.optimistic){rows.current.set(request.id,{...old,status:'RETRY'});publish();}setError("Could not confirm receipt. Retry saved message.");setConnection('offline');}return false;}
  finally{sendBusy.current=false;setSending(false);}
 }
 function send(text:string,context:AgentContextV1){if(mode!=='remote'||sendBusy.current||!current.current||outbox.current.size>=16)return false;const locale=Intl.DateTimeFormat().resolvedOptions(),request={id:randomUUID(),text,context,client:{language:'en-US',timeZone:locale.timeZone||'UTC'}};outbox.current.set(request.id,request);rows.current.set(request.id,{id:Date.now()*100+(serial.current++%100),remoteId:request.id,role:'you',text,status:'QUEUED',optimistic:true,createdAt:Date.now()});publish();void submit(request);return true;}
 async function control(path:string,body:unknown){const controller=current.current;if(!controller||controller.signal.aborted)return;try{await requestPublicWalletSessionV1(path,body,controller.signal);await refreshRef.current?.();}catch{if(!controller.signal.aborted)setError("Couldn't confirm the change.");}}
 async function setWalletReading(enabled:boolean,network:'mainnet'|'testnet',currency:'EUR'|'USD',accounts:readonly NativeWalletAccountV1[]){
  const controller=current.current;if(!controller||controller.signal.aborted||walletAccessWork.current)return;walletAccessWork.current=true;setWalletAccessBusy(true);setWalletAccessError(null);
  try{const result=await requestPublicWalletSessionV1('/v1/agent/wallet',{enabled,network,currency,accounts:enabled?accounts.filter(a=>a.network===network):[]},controller.signal);if(result?.profile!=='LIANUM_AGENT_WALLET_ACCESS_V1'||result.enabled!==enabled||result.financialPermission!==false)throw Error('MOBILE_AGENT_RESPONSE');if(!controller.signal.aborted){setWalletAccess(prior=>({configured:true,links:enabled?{...prior.links,[network]:{enabled:true,currency,expiresAt:result.expiresAt}}:{}}));await refreshRef.current?.();}}
  catch{if(!controller.signal.aborted)setWalletAccessError("Could not confirm change. Check again before trying again.");}
  finally{walletAccessWork.current=false;setWalletAccessBusy(false);}
 }
 return {mode,connection,operations,pushSettings,refresh:()=>kickRef.current?.(),retryOperation:(id:string)=>control('/v1/agent/operations/retry',{id}),stopTracking:(id:string)=>control('/v1/agent/operations/stop',{id}),messages,streaming,working,sending,error,status,tasks,notes,checks,activity,features,walletAccess,walletAccessBusy,walletAccessError,setWalletReading,send,retryMessage:(id:string)=>{const r=outbox.current.get(id);if(r)void submit(r);},reconnect:()=>{if(status==='NEEDS_REVIEW')void control('/v1/agent/retry',{});else setGeneration(n=>n+1);},cancel:(id?:string)=>control(id?'/v1/agent/tasks/cancel':'/v1/agent/cancel',id?{id}:{}),forget:(key:string)=>control('/v1/agent/memory/forget',{key})};
}
