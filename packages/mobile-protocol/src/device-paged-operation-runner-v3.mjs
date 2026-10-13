/** Shared mobile/SDK orchestration. The supplied command port owns fresh PoP,
 * original encrypted SDK replies and durable custody. This runner has no key,
 * RPC, proof construction or permission cache. */
import * as P from './device-paged-owner-v3.mjs';
import * as C from './device-paged-graph-v3.mjs';
const fail=()=>{throw Error('MOBILE_PAGED_EXECUTION_PLAN');};
const live=signal=>{if(signal?.aborted)throw Error('MOBILE_PAGED_CANCELLED');};
const progress=plan=>({stage:plan.stage??plan.action??'terminal',completed:String(plan.completed),total:String(plan.total),currentNodeId:plan.currentNodeId??null});
const actions=new Set(['PROVE_R','RESERVE_R','PROVE_EDGE','FOLD','EXECUTE_NATIVE','PROVE_ADMISSION','ADMIT','PROVE_NODE','PROVE_T','FULFILL','RECOVER_CUTOFF']);
const staleResponse=error=>['MOBILE_PAGED_GRAPH_STATUS_FUTURE','MOBILE_PAGED_GRAPH_STATUS_EXPIRED'].includes(error?.code);
const replan=Symbol('original-observation-required');
export async function runDevicePagedOperationV3({command,onProgress,onActivity,isUnconfirmedReply,signal,maxCommands=4096,nativePendingPolling}){
 if(typeof command!=='function'||onProgress!==undefined&&typeof onProgress!=='function'||onActivity!==undefined&&typeof onActivity!=='function'||isUnconfirmedReply!==undefined&&typeof isUnconfirmedReply!=='function'||!Number.isSafeInteger(maxCommands)||maxCommands<1||maxCommands>65536)fail();
 const polling=nativePendingPolling;
 if(polling!==undefined&&(!polling||typeof polling!=='object'||!Number.isSafeInteger(polling.maximumWaitMs)||polling.maximumWaitMs<1||polling.maximumWaitMs>60000||!Number.isSafeInteger(polling.intervalMs)||polling.intervalMs<250||polling.intervalMs>10000||polling.intervalMs>polling.maximumWaitMs||typeof polling.assertCurrent!=='function'||!(signal instanceof AbortSignal)))fail();
 const needsObservation=error=>staleResponse(error)||isUnconfirmedReply?.(error)===true;
 let pendingDelivery=null,pollStarted=null,polls=0,lastTick=-1;
 const current=()=>{live(signal);polling?.assertCurrent();};
 const tick=()=>{const now=performance.now();if(!Number.isFinite(now)||now<0||now<lastTick)fail();lastTick=now;return now;};
 const knownDelivery=(delivery,id)=>delivery?.id===id&&typeof delivery.nativeId==='string'&&/^(?:0x)?(?:[0-9a-f]{64}|[0-9a-f]{128})$/.test(delivery.nativeId)&&typeof delivery.transactionSHA256==='string'&&/^[0-9a-f]{64}$/.test(delivery.transactionSHA256)&&['SUBMITTED','UNKNOWN','OBSERVED'].includes(delivery.status);
 function wait(ms){return new Promise((resolve,reject)=>{let timer;const finish=error=>{clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve();},abort=()=>finish(Error('MOBILE_PAGED_CANCELLED'));timer=setTimeout(()=>finish(),ms);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});}
 async function pollKnownDelivery(){
  current();if(pollStarted===null)pollStarted=tick();
  const remaining=polling.maximumWaitMs-(tick()-pollStarted);
  if(remaining<=0||polls>=Math.ceil(polling.maximumWaitMs/polling.intervalMs))return false;
  await activity('pending','EXECUTE_NATIVE');current();await wait(Math.min(polling.intervalMs,remaining));current();
  if(tick()-pollStarted>=polling.maximumWaitMs)return false;
  polls++;let observed;
  try{await activity('observing','OBSERVE_GRAPH');current();observed=await invoke('OBSERVE_GRAPH',{});current();if(observed!==replan&&observed?.type!=='private-owner-status')fail();return true;}
  finally{P.pagedOwnerWipeV3(observed);}
 }
 let latest={stage:'reserve',completed:'0',total:'0',currentNodeId:null},observations=0;
 const activity=async(state,action=null)=>{if(onActivity)await onActivity({state,action,...latest});};
 async function invoke(action,body){
  try{await activity('running',action);current();return await command(action,body);}catch(error){
   if(!needsObservation(error)||observations===2)throw error;
   // The failed reply cannot authorize another action. Observe the same
   // graph through the original fresh-permission port, then discard the old
   // plan. The port accepts authentic status in custody before returning.
   for(;;){
    current();observations++;
    if(onProgress)await onProgress({...latest,stage:'observe-recovery'});live(signal);
    let observed;
    try{
     await activity('observing','OBSERVE_GRAPH');current();observed=await command('OBSERVE_GRAPH',{});current();
     if(observed?.type!=='private-owner-status')fail();
     return replan;
    }catch(observationError){
     if(!needsObservation(observationError)||observations===2)throw observationError;
    }finally{P.pagedOwnerWipeV3(observed);}
   }
  }
 }
 try{for(let index=0;index<maxCommands;index++){
  live(signal);const plan=await invoke('NEXT_COMMAND',{});
  try{live(signal);
   if(plan===replan)continue;
   if(!plan||typeof plan!=='object')fail();
   latest=progress(plan);P.pagedOwnerUintV3(latest.completed,true);P.pagedOwnerUintV3(latest.total,true);
   if(BigInt(latest.completed)>BigInt(latest.total)||latest.currentNodeId!==null&&!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(latest.currentNodeId))fail();
   if(onProgress)await onProgress({...latest});live(signal);
   if(plan.type==='execution-complete'){
    if(!['FULFILLED','RECOVERED'].includes(plan.phase))fail();
    await activity('complete');return{type:'complete',phase:plan.phase,...latest};
   }
   if(plan.type==='execution-pending'){await activity('pending');return{type:'pending',...latest};}
   if(pendingDelivery&&latest.currentNodeId!==pendingDelivery.id)fail();
   if(plan.type!=='next-command'||!actions.has(plan.action)||!Object.hasOwn(C.DEVICE_PAGED_GRAPH_COMMANDS_V3,plan.action)||!plan.command)fail();
   current();const reply=await invoke(plan.action,plan.command);
   try{live(signal);
    if(reply===replan)continue;
    if(plan.action==='EXECUTE_NATIVE'){
     if(reply?.type!=='native-delivery')fail();
     if(reply.delivery?.status==='ADVERSE'){await activity('adverse',plan.action);return{type:'adverse',...latest};}
     if(pendingDelivery&&(!knownDelivery(reply.delivery,pendingDelivery.id)||reply.delivery.nativeId!==pendingDelivery.nativeId||reply.delivery.transactionSHA256!==pendingDelivery.transactionSHA256))fail();
     if(!reply.admission){
      if(polling&&knownDelivery(reply.delivery,plan.command.id)&&plan.command.id===latest.currentNodeId){
       pendingDelivery??={id:reply.delivery.id,nativeId:reply.delivery.nativeId,transactionSHA256:reply.delivery.transactionSHA256};
       // The old command/reply are not held or invoked while waiting. Only a
       // fresh observation followed by a new original NEXT_COMMAND can resume.
       P.pagedOwnerWipeV3(reply);P.pagedOwnerWipeV3(plan);
       if(await pollKnownDelivery())continue;
      }
      await activity('pending','EXECUTE_NATIVE');return{type:'pending',...latest};
     }
     if(pendingDelivery){if(reply.admission.id!==pendingDelivery.id)fail();P.pagedOwnerWipeV3(pendingDelivery);pendingDelivery=null;}
     const admission=await invoke('PROVE_ADMISSION',{id:reply.admission.id,input:reply.admission.input});
     try{live(signal);if(admission===replan)continue;}finally{P.pagedOwnerWipeV3(admission);}
    }
   }finally{P.pagedOwnerWipeV3(reply);}
  }finally{P.pagedOwnerWipeV3(plan);}
 }
 await activity('pending');return{type:'pending',...latest,stage:'command-limit'};
 }catch(error){try{await activity('stopped');}catch{}throw error;}finally{P.pagedOwnerWipeV3(pendingDelivery);}
}
