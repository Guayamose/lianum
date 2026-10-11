/** Fixed standard proof monitor. Missing leader VmRSS never establishes
 * closure: original shared-thread RSS/statm observations remain required.
 * The original ChildProcess close event still owns completion and signalling.
 */
import assert from 'node:assert/strict';
import {ChildProcess} from 'node:child_process';
import {readFileSync,readdirSync,readlinkSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT} from '../catalog.mjs';
import {resources} from '../tooling/tooling.mjs';
import {parseNativeProcStat,nativeProcStatV1} from '../host/process-files.mjs';
import {observeNativeOwnedRSSV1} from '../host/process-rss.mjs';

const retained=new WeakMap();
const absent=error=>['ENOENT','ESRCH'].includes(error.code);
const same=(a,b)=>a&&b&&['pid','ppid','pgrp','session','startTimeTicks'].every(key=>a[key]===b[key]);
const checked=(a,b)=>{assert.ok(same(a,b),'PW_STANDARD_WORKER_IDENTITY_CHANGED');return b;};
function uid(status,expected){
  assert.deepEqual(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status)?.slice(1),
    Array(4).fill(String(expected.uid)),'PW_STANDARD_WORKER_UID_CHANGED');
}
/** Procfs-only HOST seam, following the existing original RSS observer. The
 * production wrapper below fixes filesystem, child, parent, UID and limits.
 * It does not adopt, signal, reap, or declare any process successfully closed.
 */
export function observeStandardProofRSSV1(expected,fs){
  const base=`/proc/${expected.pid}`;
  const read=path=>{try{return fs.readFileSync(path,'utf8');}catch(error){if(absent(error))return null;throw error;}};
  const leader=()=>{const raw=read(base+'/stat');return raw===null?null:checked(expected,parseNativeProcStat(expected.pid,raw));};
  const guarded={
    readFileSync(path,encoding){
      const text=fs.readFileSync(path,encoding);
      if(path.endsWith('/status'))uid(text,expected);
      if(path.endsWith('/stat')){
        const tid=Number(/\/(\d+)\/stat$/.exec(path)?.[1]);
        const current=parseNativeProcStat(tid,text);
        assert.equal(current.ppid,expected.ppid,'PW_STANDARD_WORKER_PARENT_CHANGED');
        assert.equal(current.pgrp,expected.pgrp,'PW_STANDARD_WORKER_GROUP_CHANGED');
        assert.equal(current.session,expected.session,'PW_STANDARD_WORKER_SESSION_CHANGED');
      }
      return text;
    },
    readdirSync:path=>fs.readdirSync(path),
  };
  const before=leader();
  if(before===null){assert.equal(leader(),null,'PW_STANDARD_WORKER_IDENTITY_CHANGED');return null;}
  const measured=observeNativeOwnedRSSV1(expected,guarded);
  const after=leader();
  if(after===null){assert.equal(leader(),null,'PW_STANDARD_WORKER_IDENTITY_CHANGED');return measured;}
  // Authenticate UID after the complete task-group observation too. A missing
  // status while the original stat still exists is a refusal, never RSS zero.
  const status=read(base+'/status');
  if(status===null){assert.equal(leader(),null,'PW_STANDARD_WORKER_STATUS_UNAVAILABLE');return measured;}
  uid(status,expected);
  const final=leader();
  if(final!==null)checked(after,final);
  else assert.equal(leader(),null,'PW_STANDARD_WORKER_IDENTITY_CHANGED');
  assert.ok(measured,'PW_STANDARD_WORKER_RSS_UNAVAILABLE');
  return measured;
}

export function standardProofResourcesV1(child){
  assert.equal(arguments.length,1);assert.ok(child instanceof ChildProcess,'PW_STANDARD_ORIGINAL_CHILD');
  assert.ok(Number.isSafeInteger(child.pid)&&child.pid>1,'PW_STANDARD_ORIGINAL_CHILD');
  let expected=retained.get(child);
  if(!expected){
    const before=nativeProcStatV1(child.pid),parent=nativeProcStatV1(process.pid);
    assert.ok(before&&parent,'PW_STANDARD_WORKER_INITIAL_IDENTITY_REQUIRED');
    assert.equal(before.ppid,process.pid,'PW_STANDARD_WORKER_PARENT_CHANGED');
    assert.equal(before.pgrp,parent.pgrp,'PW_STANDARD_WORKER_GROUP_CHANGED');
    assert.equal(before.session,parent.session,'PW_STANDARD_WORKER_SESSION_CHANGED');
    assert.equal(child.spawnargs[0],process.execPath,'PW_STANDARD_WORKER_EXECUTABLE_CHANGED');
    assert.equal(child.spawnargs[1],join(ROOT,'proof-workers/worker.mjs'),'PW_STANDARD_WORKER_ENTRY_CHANGED');
    assert.equal(readlinkSync(`/proc/${child.pid}/exe`),process.execPath,'PW_STANDARD_WORKER_EXECUTABLE_CHANGED');
    assert.deepEqual(readFileSync(`/proc/${child.pid}/cmdline`,'utf8').split('\0').filter(Boolean),child.spawnargs,
      'PW_STANDARD_WORKER_ARGUMENTS_CHANGED');
    expected=Object.freeze({...before,uid:process.getuid()});
    uid(readFileSync(`/proc/${child.pid}/status`,'utf8'),expected);
    checked(before,nativeProcStatV1(child.pid));retained.set(child,expected);
  }
  const sample=resources(); // Original environmental floors; historical tooling untouched.
  const measured=observeStandardProofRSSV1(expected,{readFileSync,readdirSync});
  return{...sample,workerRSS:measured?.rssBytes??0,workerRSSSource:measured?.rssSource??'original-proc-entry-absent',
    workerLiveThreadCount:measured?.liveThreadCount??null,
    workerIdentity:Object.fromEntries(['pid','ppid','pgrp','session','startTimeTicks','uid'].map(key=>[key,expected[key]]))};
}

/** Codes only. No procfs text, filesystem paths, stack, stderr or message. */
export function proofResourceMonitorErrorCodeV1(error){
  const code=/^((?:PW_|NATIVE_)[A-Z0-9_]{1,100})(?:\n|$)/.exec(typeof error?.message==='string'?error.message:'')?.[1];
  if(code)return code;
  return ['EACCES','EPERM','ENOENT','ESRCH','EIO','EINVAL'].includes(error?.code)?error.code:'PW_RESOURCE_MEASUREMENT_FAILED';
}
