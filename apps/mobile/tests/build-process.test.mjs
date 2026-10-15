import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {types} from 'node:util';
import {runInNewContext} from 'node:vm';
import { ownSpawnedBuildGroup } from '../scripts/owned-build-process.mjs';
const linux={skip:process.platform!=='linux',timeout:10000};
async function child(script='process.on("message",()=>process.send("alive"));setInterval(()=>{},1000);',options={}) {
  const processChild=spawn(process.execPath,['-e',script],{detached:true,stdio:['ignore','ignore','ignore','ipc']});
  await once(processChild,'spawn');
  return {child:processChild,guard:ownSpawnedBuildGroup(processChild,options),closed:once(processChild,'close')};
}
test('build cancellation authenticates the owned group and leaves another child alive',linux,async()=>{
  const owned=await child(),other=await child();
  try {
    const sample=owned.guard.snapshot();assert.equal(sample.liveCount,1);
    assert.equal(sample.processes[0].uid,process.getuid());assert.match(sample.processes[0].startTimeTicks,/^\d+$/);
    // Later mutation of the ChildProcess object cannot redirect its stored group.
    Object.defineProperty(owned.child,'pid',{value:other.child.pid});
    assert.equal(owned.guard.signal('SIGTERM').sent,true);await owned.closed;
    const response=once(other.child,'message');other.child.send('ping');assert.equal((await response)[0],'alive');
    assert.equal(other.guard.snapshot().liveCount,1);
    assert.equal(owned.guard.signal('SIGKILL').sent,false);
  }finally{owned.guard.signal('SIGKILL');other.guard.signal('SIGKILL');await Promise.all([owned.closed,other.closed]);}
});
test('detached build daemon and its child retain authenticated ownership after launcher exit',linux,async()=>{
  const daemonCode='const{spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});c.once("spawn",()=>process.send({grandchild:c.pid}));setInterval(()=>{},1000);';
  const launcherCode='const{spawn}=require("node:child_process");process.on("message",action=>{if(action==="make-daemon"){const c=spawn(process.execPath,["-e",'+JSON.stringify(daemonCode)+'],{detached:true,stdio:["ignore","ignore","ignore","ipc"]});c.once("message",m=>process.send({daemon:c.pid,...m}));}else process.exit(0);});';
  const owned=await child(launcherCode,{allowDetachedDescendants:true}),other=await child();
  try{
    const ready=once(owned.child,'message');owned.child.send('make-daemon');const [{daemon,grandchild}]=await ready;
    const before=owned.guard.snapshot();assert.equal(before.liveCount,3);
    assert.equal(before.processes.find(stat=>stat.pid===daemon).session,daemon);
    assert.equal(before.processes.find(stat=>stat.pid===grandchild).session,daemon);
    owned.child.send('exit');await owned.closed;
    const after=owned.guard.snapshot();assert.equal(after.liveCount,2);
    Object.defineProperty(owned.child,'pid',{value:other.child.pid});
    const stopped=owned.guard.signal('SIGTERM');assert.equal(stopped.sent,true);
    assert.deepEqual(stopped.individualPIDs.sort((a,b)=>a-b),[daemon,grandchild].sort((a,b)=>a-b));
    const names=['pid','ppid','pgrp','session','uid','startTimeTicks'];
    const expected=after.processes.filter(row=>[daemon,grandchild].includes(row.pid))
      .map(row=>Object.fromEntries(names.map(key=>[key,row[key]]))).sort((a,b)=>a.pid-b.pid);
    assert.deepEqual([...stopped.signalTargetIdentities].sort((a,b)=>a.pid-b.pid),expected);
    assert.equal(Object.isFrozen(stopped.signalTargetIdentities),true);
    assert.equal(stopped.signalTargetIdentities.every(Object.isFrozen),true);
    const retained=JSON.stringify(stopped.signalTargetIdentities);
    for(let i=0;i<40&&owned.guard.snapshot().liveCount;i++)await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(owned.guard.snapshot().liveCount,0);
    assert.equal(JSON.stringify(stopped.signalTargetIdentities),retained);
    const response=once(other.child,'message');other.child.send('ping');assert.equal((await response)[0],'alive');
  }finally{owned.guard.signal('SIGKILL');other.guard.signal('SIGKILL');await Promise.all([owned.closed,other.closed]);}
});
test('cleanup retains process identity continuity when the original leader exits',linux,async()=>{
  const owned=await child('const{spawn}=require("node:child_process");process.on("message",action=>{if(action==="make-child"){const c=spawn(process.execPath,["-e","setInterval(()=>{},1000);"],{stdio:"ignore"});c.once("spawn",()=>process.send({pid:c.pid}));}else process.exit(0);});');
  try {
    const ready=once(owned.child,'message');owned.child.send('make-child');const [{pid}]=await ready;
    const before=owned.guard.snapshot();assert.ok(before.processes.some(stat=>stat.pid===pid));
    owned.child.send('exit');await owned.closed;
    const after=owned.guard.snapshot();assert.ok(after.processes.some(stat=>stat.pid===pid));assert.equal(after.liveCount,1);
    assert.equal(owned.guard.signal('SIGTERM').sent,true);
    for(let i=0;i<20&&owned.guard.snapshot().liveCount;i++)await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(owned.guard.snapshot().liveCount,0);
  }finally{owned.guard.signal('SIGKILL');await owned.closed;}
});

// Explicit FS fault ports around original source bodies; the ChildProcess,
// /proc parser, enrolment, failure/lost latch and cleanup events are real.
test('original build monitor retains its first finite FS or parser cause before losing ownership',linux,async()=>{
  const guardian=readFileSync(new URL('../scripts/owned-build-process.mjs',import.meta.url),'utf8');
  const proc=readFileSync(new URL('../../../packages/proofs/src/host/process-files.mjs',import.meta.url),'utf8');
  const plain=source=>source.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
  for(const kind of ['FS','PARSER']){
    const owned=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
    const closed=once(owned,'close');await once(owned,'spawn');
    let injecting=false,reads=0;
    const originalError=Object.assign(new Error('PRIVATE-MESSAGE-MUST-NOT-ESCAPE'),{code:'EIO'});
    // This fault case selects the actual owned child. An unrelated process
    // disappearing from /proc must not become this fixture's first cause.
    // The other monitor cases retain the full real process table.
    const environment={assert,ChildProcess:owned.constructor,types,process,
      readdirSync(path){assert.equal(path,'/proc');return [String(owned.pid)];},
      readFileSync(path,...options){
        if(injecting&&path===`/proc/${owned.pid}/stat`){reads++;if(kind==='FS')throw originalError;return '';}
        return readFileSync(path,...options);
      }};
    try{
      const api=runInNewContext(plain(proc)+'\n'+plain(guardian)+'\n({ownSpawnedBuildGroup,buildProcessFailureDiagnosticV1})',environment);
      const guard=api.ownSpawnedBuildGroup(owned,{allowDetachedDescendants:true});
      assert.equal(guard.firstFailure(),null);injecting=true;
      let primary;try{guard.snapshot();}catch(error){primary=error;}
      assert.ok(primary);if(kind==='FS')assert.equal(primary,originalError);
      const first=guard.firstFailure();assert.equal(first.format,'LIANUM_MOBILE_BUILD_FIRST_FAILURE_V1');
      assert.equal(first.phase,'PROCESS_TABLE_STAT');assert.equal(first.ownedPID,owned.pid);
      assert.equal(first.code,kind==='FS'?'EIO':'NATIVE_PROC_STAT');assert.equal(reads,1);
      assert.deepEqual(Object.keys(first).sort(),['code','format','ownedPID','phase']);assert.equal(Object.isFrozen(first),true);
      assert.throws(()=>guard.snapshot(),error=>{
        assert.equal(api.buildProcessFailureDiagnosticV1(error,'GROUP_SNAPSHOT').code,'MOBILE_BUILD_GROUP_OWNERSHIP_LOST');return true;
      });
      assert.equal(guard.firstFailure(),first);
      const stopped=guard.signal('SIGTERM');assert.equal(stopped.sent,false);assert.equal(stopped.unconfirmed,true);
      assert.equal(guard.firstFailure(),first);assert.equal(JSON.stringify(first).includes('PRIVATE'),false);
      let traps=0;const opaque=new Proxy(new Error('PRIVATE'),{get(){traps++;throw Error('PRIVATE');},getOwnPropertyDescriptor(){traps++;throw Error('PRIVATE');}});
      assert.equal(api.buildProcessFailureDiagnosticV1(opaque,'REPORT_WRITE').code,'OPAQUE');assert.equal(traps,0);
      const getterError=new Error();Object.defineProperty(getterError,'message',{get(){traps++;throw Error('PRIVATE');}});
      Object.defineProperty(getterError,'code',{get(){traps++;throw Error('PRIVATE');}});
      assert.equal(api.buildProcessFailureDiagnosticV1(getterError,'REPORT_WRITE').code,'OPAQUE');assert.equal(traps,0);
      assert.equal(api.buildProcessFailureDiagnosticV1(originalError,'PRIVATE-UNRECOGNIZED-PHASE').phase,'UNKNOWN');
    }finally{
      // The guard correctly denies signals after lost. This inert fixture uses
      // its actual unmutated ChildProcess and mandatory close event to clean up.
      injecting=false;owned.kill('SIGTERM');await closed;
    }
  }
});

// Explicit /proc race ports: the launcher is an actual owned ChildProcess;
// the synthetic candidate is never a real target and receives no signal.
test('new build descendants can complete setsid or exit between samples without relaxing live identity checks',linux,async()=>{
 const guardian=readFileSync(new URL('../scripts/owned-build-process.mjs',import.meta.url),'utf8'),proc=readFileSync(new URL('../../../packages/proofs/src/host/process-files.mjs',import.meta.url),'utf8');
 const plain=source=>source.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
 for(const kind of ['SETSID','EXITED','ABSENT','REPARENTED','REUSED','PARENT_EXITED']){
  const owned=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}),closed=once(owned,'close');await once(owned,'spawn');
  const candidate=2147483000;let reads=0,enabled=false;
  const fakeStat=()=>{const after=reads++>0,fields=Array(43).fill('0');fields[0]=after&&kind==='EXITED'?'Z':'R';fields[1]=String(after&&['EXITED','REPARENTED'].includes(kind)?1:owned.pid);fields[2]=fields[3]=String(after&&kind==='SETSID'?candidate:owned.pid);fields[19]=after&&kind==='REUSED'?'22':'21';return candidate+' (inert-candidate) '+fields.join(' ');};
  const environment={assert,Error,ChildProcess:owned.constructor,types,process,readdirSync(path){const values=readdirSync(path);return enabled&&path==='/proc'?[...values,String(candidate)]:values;},
   readFileSync(path,...options){
    if(path===`/proc/${candidate}/stat`){if(reads>0&&kind==='ABSENT')throw Object.assign(new Error('inert exited'),{code:'ENOENT'});return fakeStat();}
    if(path===`/proc/${candidate}/status`)return`Uid:\t${process.getuid()}\t${process.getuid()}\t${process.getuid()}\t${process.getuid()}\nVmRSS:\t1 kB\n`;
    if(enabled&&kind==='PARENT_EXITED'&&reads>1&&path===`/proc/${owned.pid}/stat`){const text=readFileSync(path,...options),end=text.lastIndexOf(') ');return text.slice(0,end+2)+'Z'+text.slice(end+3);}
    return readFileSync(path,...options);
   }};
  try{
   const api=runInNewContext(plain(proc)+'\n'+plain(guardian)+'\n({ownSpawnedBuildGroup})',environment),guard=api.ownSpawnedBuildGroup(owned,{allowDetachedDescendants:true});enabled=true;
   if(['SETSID','EXITED','ABSENT'].includes(kind)){const sample=guard.snapshot();assert.equal(sample.liveCount,kind==='SETSID'?2:1);assert.equal(guard.firstFailure(),null);if(kind==='SETSID'){const enrolled=sample.processes.find(row=>row.pid===candidate);assert.equal(enrolled.pgrp,candidate);assert.equal(enrolled.session,candidate);}else assert.equal(sample.processes.some(row=>row.pid===candidate),false);}
   else{assert.throws(()=>guard.snapshot(),/MOBILE_BUILD_DESCENDANT_ANCESTRY_CHANGED/);assert.equal(guard.firstFailure().ownedPID,null);assert.equal(guard.signal('SIGTERM').unconfirmed,true);}
  }finally{owned.kill('SIGTERM');await closed;}
 }
});
