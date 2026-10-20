/** One shared start queue for the retained anonymous Sepolia route. Readers
 * use it through HTTP; the Original Source reserves one broadcast slot before
 * rechecking its command. No result cache, endpoint switch, send retry, signing
 * permission or refresh of a caller's deadline is issued here. */
import {performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';
import {need} from './common-v1.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1} from './public-testnet-rpc-route-v1.mjs';

const queue={tail:Promise.resolve(),pending:0,nextStart:0,interval:100,cooldownUntil:0,lastThrottle:-Infinity,lastEase:-Infinity};
const metrics={rpcQueuedAttemptsV25:0,rpcQueueCancelledV25:0,rpcQueueWaitMsV25:0,rpcQueueMaxWaitMsV25:0,rpcThrottleResponsesV25:0};
/** Durations sum per request and may overlap; they are not elapsed startup time. */
export function readPublicSepoliaSchedulerMetricsV25(){return Object.freeze({...metrics,rpcQueuePendingUnitsV25:queue.pending,rpcPacingIntervalMsV25:queue.interval,rpcCooldownRemainingMsV25:Math.max(0,Math.ceil(queue.cooldownUntil-performance.now()))});}
const abortError=()=>new DOMException('Read queue cancelled','AbortError');
/** A provider throttle pauses every reader of this route. The request's
 * original AbortSignal still bounds queueing and all of its attempts. */
export function recordPublicSepoliaReadResponseV1(endpoint,status,retryAfter){
 if(endpoint!==PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint)return;
 const now=performance.now();
 if(status===429){
  metrics.rpcThrottleResponsesV25++;
  if(now-queue.lastThrottle>=1000)queue.interval=Math.min(500,queue.interval*2);
  queue.lastThrottle=now;queue.lastEase=now;
  const delay=typeof retryAfter==='string'&&/^[0-9]{1,6}$/.test(retryAfter)?Number(retryAfter)*1000:0;
  queue.cooldownUntil=Math.max(queue.cooldownUntil,now+Math.max(2000,delay));
 }else if(status===200&&queue.interval>100&&now-queue.lastThrottle>=60000&&now-queue.lastEase>=30000){
  queue.interval=Math.max(100,Math.floor(queue.interval*.9));queue.lastEase=now;
 }
}
export async function waitPublicSepoliaReadTurnV1(endpoint,signal,readUnits=1){
 if(endpoint!==PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint)return;
 need(signal instanceof AbortSignal,'RPC_READ_SIGNAL');
 need(Number.isInteger(readUnits)&&readUnits>=1&&readUnits<=4,'RPC_READ_UNITS');
 if(signal.aborted)throw abortError();
 need(queue.pending+readUnits<=512,'RPC_READ_QUEUE_BOUND');queue.pending+=readUnits;metrics.rpcQueuedAttemptsV25++;const queuedAt=performance.now();
 const task=queue.tail.then(async()=>{
  if(signal.aborted)throw abortError();
  for(;;){
   const delay=Math.max(queue.nextStart,queue.cooldownUntil)-performance.now();
   if(delay<=0)break;
   // Recheck after sleeping: a response may have extended the shared cooldown.
   await pause(Math.min(1000,Math.ceil(delay)),undefined,{signal});
  }
  if(signal.aborted)throw abortError();
  queue.nextStart=performance.now()+queue.interval*readUnits;
 });
 // An aborted waiter cannot release another waiter's predecessor early.
 queue.tail=task.catch(()=>{}).finally(()=>{queue.pending-=readUnits;});
 try{await new Promise((resolve,reject)=>{
  const onAbort=()=>{signal.removeEventListener('abort',onAbort);reject(abortError());};
  signal.addEventListener('abort',onAbort,{once:true});
  task.then(()=>{signal.removeEventListener('abort',onAbort);resolve();},error=>{signal.removeEventListener('abort',onAbort);reject(error);});
  if(signal.aborted)onAbort();
 });}catch(error){if(signal.aborted)metrics.rpcQueueCancelledV25++;throw error;}finally{const ms=Math.max(0,Math.round(performance.now()-queuedAt));metrics.rpcQueueWaitMsV25+=ms;metrics.rpcQueueMaxWaitMsV25=Math.max(metrics.rpcQueueMaxWaitMsV25,ms);}
}
