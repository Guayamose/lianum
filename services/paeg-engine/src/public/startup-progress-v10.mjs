/** Counts completed milestones, never presents their count as elapsed-time %.
 * RPC work is discovered by Original owners; an unobserved total stays null. */
export const PUBLIC_STARTUP_STEPS_V10=Object.freeze([
 'ROOT_RETENTION','NATIVE_RUNTIMES','RECEIVER','ROOT_PROVIDER','ROOT_AUTHORITY',
 'UNISWAP_MIXED','ROOT_ACTIVATION','AAVE_STATIC_VENUE','MORPHO_V2_VENUE',
 'AAVE_STATIC_TARGET','MORPHO_V2_TARGET','AAVE_STATIC_AUTHORITY','MORPHO_V2_AUTHORITY',
 'DEFI_SOURCE7','DEFI_SOURCE7_PROVIDER','DEFI_RETENTION','DEFI_MOUNTED',
 'COMPOSITION_LISTENING','EMPTY_RENEWAL','CONNECTIONS_PUBLISHED','READY',
]);
export function createPublicStartupProgressV10(now=Date.now){
 const completed=new Map(),started=now();let previous={at:started,calls:0},lastProgress=started;
 return Object.freeze({
  complete(step){if(PUBLIC_STARTUP_STEPS_V10.includes(step)&&!completed.has(step)){lastProgress=now();completed.set(step,Math.floor((lastProgress-started)/1000));}},
  snapshot(metrics){const at=now(),seconds=(at-previous.at)/1000,calls=metrics.rpcCalls??0,rate=seconds>0?Math.max(0,calls-previous.calls)/seconds:null;previous={at,calls};return {
   completedMilestones:completed.size,totalMilestones:PUBLIC_STARTUP_STEPS_V10.length,
   remainingMilestones:PUBLIC_STARTUP_STEPS_V10.filter(step=>!completed.has(step)),
   lastCompletedMilestone:[...completed.keys()].at(-1)??null,
   secondsSinceMilestone:Math.floor((at-lastProgress)/1000),
   rpcCallsPerSecond:rate===null?null:Math.round(rate*100)/100,
   totalRpcCalls:null,remainingRpcCalls:null,
   remainingSeconds:completed.has('READY')?0:null,
   estimateStatus:completed.has('READY')?'COMPLETE':'FIRST_RUN_WITH_REDUCED_VALIDATION_WORK',
   milestoneElapsedSeconds:Object.fromEntries(completed),
  };},
 });
}
