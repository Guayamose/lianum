/** Node timers overflow above 2^31-1 ms. Recheck an absolute stored deadline
 * daily; neither a restart nor an intermediate wake grants additional time. */
import assert from 'node:assert/strict';
export function armFiniteDeadlineV17(deadlineMs,onDeadline,ports={}){
 assert.ok(Number.isSafeInteger(deadlineMs)&&deadlineMs>0);assert.equal(typeof onDeadline,'function');
 const now=ports.now??Date.now,schedule=ports.schedule??setTimeout,clear=ports.clear??clearTimeout;
 let handle,closed=false;
 function check(){
  if(closed)return;
  const remaining=deadlineMs-now();
  if(remaining<=0){closed=true;onDeadline();return;}
  handle=schedule(check,Math.min(remaining,86400000));handle.unref?.();
 }
 // Preserve asynchronous delivery even when the caller is already overdue.
 handle=schedule(check,Math.min(Math.max(0,deadlineMs-now()),86400000));handle.unref?.();
 return Object.freeze({deadlineMs,cancel(){if(closed)return;closed=true;clear(handle);}});
}
