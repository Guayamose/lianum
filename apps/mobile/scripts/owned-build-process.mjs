/** Linux guards for the one process group created by this build's spawn. */
import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { types } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import { nativeProcStatV1 } from '@lianum/proofs/host/process-files';


// Diagnostic-only: no message, stack, argv, syscall path or unknown PID escapes.
// The original guard still throws the SAME failure and preserves lost/lock.
const failurePhases=new Set(["PROCESS_TABLE_ENUMERATE","PROCESS_TABLE_STAT","PROCESS_ANCESTRY","PROCESS_STATUS","PROCESS_UID","PROCESS_RSS","GROUP_PROBE","SIGNAL_IDENTITY","GROUP_SNAPSHOT","JVM_ARGUMENTS","ENVIRONMENT_MEMORY","REPORT_WRITE","RESOURCE_LIMITS"]);
const failureCodes=new Set(["MOBILE_BUILD_ACTUAL_CHILD_REQUIRED","MOBILE_BUILD_DESCENDANT_ANCESTRY_CHANGED","MOBILE_BUILD_DESCENDANT_SESSION_UNCONFIRMED","MOBILE_BUILD_GROUP_ANCESTRY_UNCONFIRMED","MOBILE_BUILD_GROUP_CONTINUITY_UNCONFIRMED","MOBILE_BUILD_GROUP_LEADER_REUSED","MOBILE_BUILD_GROUP_OWNERSHIP_LOST","MOBILE_BUILD_GROUP_SCAN_INCOMPLETE","MOBILE_BUILD_GROUP_SESSION_CHANGED","MOBILE_BUILD_PROCESS_ESCAPED","MOBILE_BUILD_PROCESS_IDENTITY_CHANGED","MOBILE_BUILD_PROCESS_RSS_UNAVAILABLE","MOBILE_BUILD_PROCESS_UID_CHANGED","MOBILE_BUILD_PROCESS_UID_UNAVAILABLE","MOBILE_BUILD_SIGNAL_ANCHOR_UNCONFIRMED","MOBILE_BUILD_SIGNAL_IDENTITY_CHANGED","MOBILE_BUILD_SIGNAL_KIND","MOBILE_BUILD_SIGNAL_UNCONFIRMED","MOBILE_BUILD_SPAWN_GROUP_UNCONFIRMED","MOBILE_BUILD_SPAWN_IDENTITY_CHANGED","NATIVE_PROC_STAT","NATIVE_PROC_STAT_FIELDS","NATIVE_PROC_START_IDENTITY","NATIVE_RESOURCE_INTEGER"]);
const errnoCodes=new Set(['ENOENT','ESRCH','EIO','EINVAL','EACCES','EPERM','ENOMEM','EMFILE','ENFILE','ENOSPC','EROFS']);
export function buildProcessFailureDiagnosticV1(error,phase) {
 let code='OPAQUE';
 try {
  if(error&&!types.isProxy(error)&&types.isNativeError(error)) {
   const message=Object.getOwnPropertyDescriptor(error,'message');
   const errno=Object.getOwnPropertyDescriptor(error,'code');
   const firstLine=message&&Object.hasOwn(message,'value')&&typeof message.value==='string'?message.value.slice(0,128).split('\n',1)[0]:null;
   if(failureCodes.has(firstLine))code=firstLine;
   else if(errno&&Object.hasOwn(errno,'value')&&typeof errno.value==='string'&&errnoCodes.has(errno.value))code=errno.value;
  }
 }catch{}
 return Object.freeze({format:'LIANUM_MOBILE_BUILD_FIRST_FAILURE_V1',phase:failurePhases.has(phase)?phase:'UNKNOWN',code,ownedPID:null});
}

const same = (a,b) => a && b && a.pid===b.pid && a.startTimeTicks===b.startTimeTicks;
const live = stat => !/^[ZX]$/.test(stat.state);
const status = pid => readFileSync(`/proc/${pid}/status`,'utf8');
function uidOf(text) {
  const match=/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(text);
  assert.ok(match,'MOBILE_BUILD_PROCESS_UID_UNAVAILABLE');
  const values=match.slice(1).map(Number);
  assert.ok(values.every(value=>value===process.getuid()),'MOBILE_BUILD_PROCESS_UID_CHANGED');
  return values[0];
}
export function ownSpawnedBuildGroup(child,{allowDetachedDescendants=false}={}) {
  assert.ok(child instanceof ChildProcess,'MOBILE_BUILD_ACTUAL_CHILD_REQUIRED');
  const pgid=child.pid;assert.ok(Number.isSafeInteger(pgid)&&pgid>1&&pgid!==process.pid);
  const initial=nativeProcStatV1(pgid);
  assert.ok(initial&&initial.ppid===process.pid&&initial.pgrp===pgid&&initial.session===pgid,
    'MOBILE_BUILD_SPAWN_GROUP_UNCONFIRMED');
  uidOf(status(pgid));assert.ok(same(initial,nativeProcStatV1(pgid)),'MOBILE_BUILD_SPAWN_IDENTITY_CHANGED');
  const identities=new Map([[pgid,initial]]),missingRSS=new Map();
  let gone=false,lost=false,firstFailure=null,phase='GROUP_SNAPSHOT',observedPID=null;
  const at=(next,pid=null)=>{phase=next;observedPID=pid;};
  function retainFailure(error) {
    if(firstFailure)return;
    const row=buildProcessFailureDiagnosticV1(error,phase);
    // A process table candidate is not owned merely because its PID is numeric.
    firstFailure=Object.freeze({...row,ownedPID:identities.has(observedPID)?observedPID:null});
  }
  function snapshot() {
    if(gone)return {rssBytes:0,liveCount:0,processes:[],gone:true};
    assert.equal(lost,false,'MOBILE_BUILD_GROUP_OWNERSHIP_LOST');
    try {
      const all=new Map(),group=[];
      at('PROCESS_TABLE_ENUMERATE');
      for(const entry of readdirSync('/proc')) {
        if(!/^[1-9]\d*$/.test(entry))continue;
        at('PROCESS_TABLE_STAT',Number(entry));
        const stat=nativeProcStatV1(Number(entry));if(!stat)continue;
        all.set(stat.pid,stat);
        if(!allowDetachedDescendants&&same(stat,identities.get(stat.pid))&&live(stat))
          assert.ok(stat.pgrp===pgid&&stat.session===pgid,'MOBILE_BUILD_PROCESS_ESCAPED');
        if(stat.pgrp===pgid){assert.equal(stat.session,pgid,'MOBILE_BUILD_GROUP_SESSION_CHANGED');group.push(stat);}
      }
      at('PROCESS_ANCESTRY');
      const leader=group.find(stat=>stat.pid===pgid);
      if(leader)assert.ok(same(leader,initial),'MOBILE_BUILD_GROUP_LEADER_REUSED');
      else if(group.length)assert.ok(group.some(stat=>same(stat,identities.get(stat.pid))),
        'MOBILE_BUILD_GROUP_CONTINUITY_UNCONFIRMED');
      if(allowDetachedDescendants){
        const owned=new Map();
        for(const [pid,identity]of identities){
          const current=all.get(pid);if(!current)continue;
          assert.ok(same(identity,current),'MOBILE_BUILD_PROCESS_IDENTITY_CHANGED');
          // A child can call setsid() (Gradle's single-use daemon does this).
          // Enrol its new session only while its original parent remains an
          // authenticated, live ancestor; later reparenting retains this identity.
          if(current.pgrp!==identity.pgrp||current.session!==identity.session){
            const parent=all.get(current.ppid);
            assert.ok(current.pgrp===pid&&current.session===pid&&live(parent??{state:'X'})
              &&same(parent,identities.get(current.ppid)),'MOBILE_BUILD_PROCESS_ESCAPED');
          }
          owned.set(pid,current);
        }
        let changed=true;
        while(changed){
          changed=false;
          for(const stat of all.values()){
            if(owned.has(stat.pid))continue;
            const parent=owned.get(stat.ppid);if(!parent||!live(parent))continue;
            assert.ok(stat.session===parent.session||(stat.session===stat.pid&&stat.pgrp===stat.pid),
              'MOBILE_BUILD_DESCENDANT_SESSION_UNCONFIRMED');
            // Capture ancestry, start time and UID together before admitting a
            // detached child to resource accounting or individual signals.
            let text;at('PROCESS_STATUS',stat.pid);try{text=status(stat.pid);}catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
            at('PROCESS_UID',stat.pid);uidOf(text);at('PROCESS_ANCESTRY',stat.pid);const after=nativeProcStatV1(stat.pid);
            if(!after)continue;
            assert.ok(same(stat,after)&&after.ppid===parent.pid&&after.pgrp===stat.pgrp
              &&after.session===stat.session&&same(parent,nativeProcStatV1(parent.pid)),
              'MOBILE_BUILD_DESCENDANT_ANCESTRY_CHANGED');
            owned.set(after.pid,after);changed=true;
          }
        }
        // An unknown member of our original group must have demonstrable
        // ancestry; no process is admitted merely because it has a numeric PGID.
        for(const stat of group)assert.ok(owned.has(stat.pid),'MOBILE_BUILD_GROUP_ANCESTRY_UNCONFIRMED');
        group.splice(0,group.length,...owned.values());
      }
      const processes=[];
      for(const stat of group) {
        let text;
        at('PROCESS_STATUS',stat.pid);
        try{text=status(stat.pid);}catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
        at('PROCESS_UID',stat.pid);const uid=uidOf(text);at('PROCESS_ANCESTRY',stat.pid);const after=nativeProcStatV1(stat.pid);if(!after)continue;
        assert.ok(same(stat,after)&&after.pgrp===stat.pgrp&&after.session===stat.session,'MOBILE_BUILD_PROCESS_IDENTITY_CHANGED');
        at('PROCESS_RSS',stat.pid);
        const rss=/^VmRSS:\s+(\d+)\s+kB$/m.exec(text);
        // Linux may briefly omit memory fields during fork/exec or exit. A live
        // process with a persistent missing sample still closes the supervisor.
        if(!rss&&live(after)){
          const since=missingRSS.get(after.pid)??Date.now();missingRSS.set(after.pid,since);
          assert.ok(Date.now()-since<1000,'MOBILE_BUILD_PROCESS_RSS_UNAVAILABLE');
        }else missingRSS.delete(after.pid);
        identities.set(after.pid,after);processes.push({...after,uid,rssBytes:Number(rss?.[1]??0)*1024});
      }
      if(!processes.length) {
        at('GROUP_PROBE');
        let absent=false;
        try{process.kill(-pgid,0);}catch(error){if(error.code==='ESRCH')absent=true;else throw error;}
        assert.ok(absent,'MOBILE_BUILD_GROUP_SCAN_INCOMPLETE');gone=true;
      }
      return {rssBytes:processes.reduce((sum,stat)=>sum+stat.rssBytes,0),liveCount:processes.filter(live).length,processes,gone};
    }catch(error){retainFailure(error);lost=true;throw error;}
  }
  function signal(signal) {
    assert.ok(['SIGTERM','SIGKILL'].includes(signal),'MOBILE_BUILD_SIGNAL_KIND');
    if(gone)return {sent:false,gone:true};
    if(lost)return {sent:false,unconfirmed:true};
    try {
      const group=snapshot();at('SIGNAL_IDENTITY');
      if(group.gone||!group.liveCount)return {sent:false,gone:group.gone};
      if(allowDetachedDescendants){
        let sent=false;
        // Individual PID signals avoid extending custody to a foreign group.
        // Descendants precede the original launcher, with identity/UID checks
        // immediately before every signal (including reparented descendants).
        const targets=group.processes.filter(live).sort((a,b)=>Number(a.pid===pgid)-Number(b.pid===pgid));
        // Retain the exact fresh owned snapshots already authenticated by
        // snapshot()/the original per-target guards. No later PID lookup can
        // reconstruct this birth identity once the process has disappeared.
        const signalTargetIdentities=Object.freeze(targets.map(target=>Object.freeze(Object.fromEntries(
          ['pid','ppid','pgrp','session','uid','startTimeTicks'].map(key=>[key,target[key]])))));
        for(const target of targets){
          at('SIGNAL_IDENTITY',target.pid);
          const current=nativeProcStatV1(target.pid);if(!current)continue;
          uidOf(status(target.pid));
          assert.ok(same(target,current)&&current.pgrp===target.pgrp&&current.session===target.session,
            'MOBILE_BUILD_SIGNAL_IDENTITY_CHANGED');
          assert.ok(same(current,nativeProcStatV1(target.pid)),'MOBILE_BUILD_SIGNAL_IDENTITY_CHANGED');
          try{process.kill(target.pid,signal);sent=true;}catch(error){if(error.code!=='ESRCH')throw error;}
        }
        return {sent,gone:false,individualPIDs:targets.map(target=>target.pid),signalTargetIdentities};
      }
      const anchor=group.processes.find(stat=>live(stat)&&same(stat,identities.get(stat.pid)));
      assert.ok(anchor,'MOBILE_BUILD_SIGNAL_ANCHOR_UNCONFIRMED');
      at('SIGNAL_IDENTITY',anchor.pid);const current=nativeProcStatV1(anchor.pid);uidOf(status(anchor.pid));
      assert.ok(same(anchor,current)&&current.pgrp===pgid&&current.session===pgid,
        'MOBILE_BUILD_SIGNAL_IDENTITY_CHANGED');
      assert.ok(same(current,nativeProcStatV1(anchor.pid)),'MOBILE_BUILD_SIGNAL_IDENTITY_CHANGED');
      const signalTargetIdentities=Object.freeze(group.processes.filter(live).map(target=>Object.freeze(Object.fromEntries(
        ['pid','ppid','pgrp','session','uid','startTimeTicks'].map(key=>[key,target[key]])))));
      process.kill(-pgid,signal);return {sent:true,gone:false,signalTargetIdentities};
    }catch(error){if(error.code==='ESRCH'){gone=true;return {sent:false,gone:true};}
      retainFailure(error);lost=true;return {sent:false,unconfirmed:true,code:String(error.message).match(/MOBILE_BUILD_[A-Z0-9_]+/)?.[0]??'MOBILE_BUILD_SIGNAL_UNCONFIRMED'};}
  }
  return Object.freeze({snapshot,signal,firstFailure(){assert.equal(arguments.length,0);return firstFailure;},identity:Object.freeze({...initial,uid:process.getuid()})});
}
