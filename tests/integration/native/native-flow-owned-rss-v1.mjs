/** Procfs observation only. No PID is enrolled, signalled or declared gone by
 * a missing VmRSS field. A task may lose mm before its state becomes Z/X.
 * Linux status/statm semantics: fs/proc/array.c (proc_pid_status/proc_pid_statm).
 * Threads share VM (kernel/fork.c); taking their maximum avoids double counting.
 */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseNativeProcStat} from './native-flow-owned-files-v1.mjs';
const missing=error=>['ENOENT','ESRCH'].includes(error.code);
const live=stat=>!/[ZX]/.test(stat.state);
const integer=value=>{assert.ok(Number.isSafeInteger(value)&&value>=0,'NATIVE_RESOURCE_INTEGER');return value;};
const same=(a,b)=>a&&b&&a.pid===b.pid&&a.startTimeTicks===b.startTimeTicks
  &&a.pgrp===b.pgrp&&a.session===b.session;
const checked=(a,b)=>{assert.ok(same(a,b),'NATIVE_MEASURED_PROCESS_CHANGED');return b;};
function vmRSS(status){
  if(status===null)return null;
  const matches=[...status.matchAll(/^VmRSS:\s+(\d+)\s+kB$/gm)];
  assert.ok(matches.length<=1,'NATIVE_OWNED_RSS_UNAVAILABLE');
  if(!matches.length){assert.ok(!/^VmRSS:/m.test(status),'NATIVE_OWNED_RSS_UNAVAILABLE');return null;}
  return integer(Number(matches[0][1])*1024);
}
/** Pure filesystem seam for HOST regressions. The supervisor calls only the
 * fixed wrapper below, never a caller-selected filesystem, PID or threshold. */
export function observeNativeOwnedRSSV1(expected,fs){
  const pid=integer(expected.pid);assert.ok(pid>1,'NATIVE_OWNED_GROUP_ID');
  const base=`/proc/${pid}`;
  const read=path=>{try{return fs.readFileSync(path,'utf8');}catch(error){if(missing(error))return null;throw error;}};
  const stat=(id,path)=>{const text=read(path);return text===null?null:parseNativeProcStat(id,text);};
  const leader=()=>{const current=stat(pid,base+'/stat');return current===null?null:checked(expected,current);};
  let maximum=0;
  // Fixed immediate rereads; no timer, sleep, cached result or deadline renewal.
  for(let attempt=0;attempt<3;attempt++){
    const before=leader();if(before===null)return null;
    const status=read(base+'/status'),after=leader();if(after===null)return null;
    const rss=vmRSS(status);if(rss!==null){maximum=Math.max(maximum,rss);
      if(live(after))return{stat:after,rssBytes:maximum,rssSource:'VmRSS'};}
  }
  const taskIds=()=>{
    let entries;try{entries=fs.readdirSync(base+'/task');}catch(error){if(missing(error))return null;throw error;}
    assert.ok(entries.length>0&&entries.length<=4096,'NATIVE_OWNED_RSS_UNAVAILABLE');
    assert.ok(entries.every(id=>/^[1-9]\d*$/.test(id)),'NATIVE_OWNED_RSS_UNAVAILABLE');
    const ids=entries.map(id=>integer(Number(id))).sort((a,b)=>a-b);
    assert.equal(new Set(ids).size,ids.length,'NATIVE_OWNED_RSS_UNAVAILABLE');return ids;
  };
  // Only absence of the whole original PID, real task VmRSS, a kernel statm
  // literal zero, or measured Z/X can close the missing-memory observation.
  // A dead/mmless leader never suppresses a live sibling's shared memory.
  for(let attempt=0;attempt<3;attempt++){
    if(leader()===null)return null;
    const ids=taskIds();if(ids===null){if(leader()===null)return null;continue;}
    const tasks=[];let raced=false,measured=maximum;
    for(const tid of ids){
      const path=base+`/task/${tid}`,before=stat(tid,path+'/stat');
      if(before===null){raced=true;break;}
      assert.ok(before.pgrp===expected.pgrp&&before.session===expected.session,'NATIVE_MEASURED_PROCESS_CHANGED');
      const status=read(path+'/status');
      if(status===null){raced=true;break;}
      assert.equal(Number(/^Tgid:\s+(\d+)$/m.exec(status)?.[1]),pid,'NATIVE_MEASURED_PROCESS_CHANGED');
      let rss=vmRSS(status),statm=null;if(rss===null)statm=read(path+'/statm');
      const after=stat(tid,path+'/stat');if(after===null){raced=true;break;}checked(before,after);
      if(rss===null){
        // No pagesize assumption: only the exact kernel no-mm/zero result is
        // usable here. A live task with unreadable/nonzero RSS stays rejected.
        if(statm!==null&&/^0 0 0 0 0 0 0\n?$/.test(statm))rss=0;
        else if(!live(after))rss=0;
        else {raced=true;break;}
      }
      measured=Math.max(measured,rss);tasks.push(after);
    }
    if(raced)continue;
    const afterIds=taskIds();if(afterIds===null){if(leader()===null)return null;continue;}
    if(ids.length!==afterIds.length||ids.some((id,index)=>id!==afterIds[index]))continue;
    let liveThreadCount=0;
    for(const previous of tasks){const current=stat(previous.pid,base+`/task/${previous.pid}/stat`);
      if(current===null){raced=true;break;}checked(previous,current);if(live(current))liveThreadCount++;}
    if(raced)continue;
    const after=leader();if(after===null)return null;
    return{stat:after,rssBytes:integer(measured),rssSource:'task-VmRSS-or-statm-zero',liveThreadCount};
  }
  throw Error('NATIVE_OWNED_RSS_UNAVAILABLE');
}
export function nativeOwnedRSSV1(expected){assert.equal(arguments.length,1);
  return observeNativeOwnedRSSV1(expected,{readFileSync,readdirSync});}
