/** One shared start queue for the retained anonymous Sepolia route. This
 * changes read scheduling only: no result cache, endpoint switch, send retry,
 * signing permission or refresh of a caller's deadline is issued here. */
import {performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';
import {need} from './common-v1.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1} from './public-testnet-rpc-route-v1.mjs';

const queue={tail:Promise.resolve(),pending:0,nextStart:0};
const abortError=()=>new DOMException('Read queue cancelled','AbortError');
export async function waitPublicSepoliaReadTurnV1(endpoint,signal){
 if(endpoint!==PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint)return;
 need(signal instanceof AbortSignal,'RPC_READ_SIGNAL');
 if(signal.aborted)throw abortError();
 need(queue.pending<512,'RPC_READ_QUEUE_BOUND');queue.pending++;
 const task=queue.tail.then(async()=>{
  if(signal.aborted)throw abortError();
  const delay=Math.max(0,queue.nextStart-performance.now());
  if(delay>0)await pause(Math.ceil(delay),undefined,{signal});
  if(signal.aborted)throw abortError();
  queue.nextStart=performance.now()+100;
 });
 // An aborted waiter cannot release another waiter's predecessor early.
 queue.tail=task.catch(()=>{}).finally(()=>{queue.pending--;});
 await new Promise((resolve,reject)=>{
  const onAbort=()=>{signal.removeEventListener('abort',onAbort);reject(abortError());};
  signal.addEventListener('abort',onAbort,{once:true});
  task.then(()=>{signal.removeEventListener('abort',onAbort);resolve();},error=>{signal.removeEventListener('abort',onAbort);reject(error);});
  if(signal.aborted)onAbort();
 });
}
