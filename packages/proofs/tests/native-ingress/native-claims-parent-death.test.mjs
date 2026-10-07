import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {nativeProcStatV1} from '../../../../tests/integration/native/native-flow-owned-files-v1.mjs';
// Python references are not rewritten by the JS materializer. Resolve only the
// two public layouts explicitly: source package and materialized proof-workers.
const relativeGuardian=import.meta.url.endsWith('/proof-workers/native-ingress/native-claims-parent-death.test.mjs')
  ? '../native-claims-parent-death.py' : '../../src/native-ingress/tooling/native-claims-parent-death.py';
const guardian=fileURLToPath(new URL(relativeGuardian,import.meta.url));
const live=stat=>stat&&!/^[ZX]$/.test(stat.state);
const same=(a,b)=>a&&b&&a.pid===b.pid&&a.startTimeTicks===b.startTimeTicks;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function proc(pid){
  // A disappearing Linux task can expose a transient partially torn-down stat.
  // Retry the original strict parser briefly; never infer identity or death
  // from malformed bytes, and preserve its failure if they stay malformed.
  for(let attempt=0;;attempt++){
    try{return nativeProcStatV1(pid);}catch(error){
      if(error.message!=='NATIVE_RESOURCE_INTEGER'||attempt>=10)throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1);
    }
  }
}
function owned(stat){
  const uid=/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(readFileSync(`/proc/${stat.pid}/status`,'utf8'));
  assert.ok(uid&&uid.slice(1).every(value=>Number(value)===process.getuid()),'NATIVE_REBUILD_TEST_UID');
}
async function bounded(promise,code,milliseconds=2000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error(code)),milliseconds);
  })]);}finally{clearTimeout(timer);}
}
const code='import os,runpy,sys\nm=runpy.run_path(sys.argv[1]);m["bind_parent_lifetime"](os.getppid())\njs="process.on(\\\"SIGTERM\\\",()=>{require(\\\"node:fs\\\").writeFileSync(process.argv[1],\\\"SIGTERM\\\");process.exit(0);});console.log(process.pid);setInterval(()=>{},1000);"\nos.execve(sys.argv[3],[sys.argv[3],"-e",js,sys.argv[2]],{"PATH":"/usr/bin:/bin","LANG":"C.UTF-8"})\n';
const parentScript='const{spawn}=require("node:child_process");const child=spawn(process.argv[4],["-c",process.argv[1],process.argv[2],process.argv[3],process.execPath],{stdio:["ignore","pipe","ignore"]});child.once("spawn",()=>process.send({type:"spawned",childPID:child.pid}));child.stdout.once("data",bytes=>process.send({type:"ready",childPID:Number(bytes.toString().trim())}));let failing=false;const fail=()=>{if(failing)return;failing=true;if(process.connected)process.send({type:"failed"},()=>process.exit(1));else process.exit(1);};child.once("error",fail);child.once("close",fail);setInterval(()=>{},1000);';

function harness(helperPath,marker,{helperCommand='python3',parentCommand=process.execPath}={}){
  const parent=spawn(parentCommand,['-e',parentScript,code,helperPath,marker,helperCommand],{stdio:['ignore','ignore','ignore','ipc']});
  const closed=once(parent,'close');closed.catch(()=>{});
  let parentIdentity,identity,helperPID,resolveReady,rejectReady;
  const readiness=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  readiness.catch(()=>{});
  parent.once('spawn',()=>{
    try{parentIdentity=proc(parent.pid);assert.ok(parentIdentity&&parentIdentity.ppid===process.pid,
      'NATIVE_REBUILD_TEST_PARENT_IDENTITY');owned(parentIdentity);}
    catch(error){rejectReady(error);}
  });
  const message=raw=>{
    try{
      if(raw.type==='failed'){rejectReady(Error('NATIVE_REBUILD_TEST_HELPER_EXIT'));return;}
      assert.ok(['spawned','ready'].includes(raw.type)&&Number.isSafeInteger(raw.childPID)&&raw.childPID>1);
      assert.ok(helperPID===undefined||helperPID===raw.childPID,'NATIVE_REBUILD_TEST_HELPER_REPLACED');helperPID=raw.childPID;
      const current=proc(helperPID);
      if(current){assert.equal(current.ppid,parent.pid,'NATIVE_REBUILD_TEST_HELPER_PARENT');owned(current);
        if(identity)assert.ok(same(identity,current),'NATIVE_REBUILD_TEST_HELPER_IDENTITY');identity=current;}
      if(raw.type==='ready'){assert.ok(identity&&live(current),'NATIVE_REBUILD_TEST_HELPER_READY');resolveReady(identity);}
    }catch(error){rejectReady(error);}
  };
  const failed=()=>rejectReady(Error('NATIVE_REBUILD_TEST_PARENT_EXIT'));
  parent.on('message',message);parent.once('error',failed);parent.once('close',failed);
  return {parent,get parentIdentity(){return parentIdentity;},closed,get helperPID(){return helperPID;},get identity(){return identity;},
    ready:()=>bounded(readiness,'NATIVE_REBUILD_TEST_HELPER_READY_TIMEOUT'),
    async close(){
      // A readiness failure still reaches this cleanup; no test timeout is
      // relied upon to abort an unbounded events.once() or run a finally block.
      const current=Number.isSafeInteger(parent.pid)?proc(parent.pid):null;
      if(live(current)){
        if(!parentIdentity){
          // Even failure during startup is cleaned: this is the actual
          // ChildProcess, still our child, with its complete original argv.
          assert.equal(current.ppid,process.pid,'NATIVE_REBUILD_TEST_PARENT_CHANGED');owned(current);
          const argv=readFileSync(`/proc/${current.pid}/cmdline`).toString().split('\0').filter(Boolean);
          assert.deepEqual(argv,parent.spawnargs,'NATIVE_REBUILD_TEST_PARENT_ARGUMENTS');parentIdentity=current;
        }
        assert.ok(same(current,parentIdentity)&&current.ppid===process.pid,'NATIVE_REBUILD_TEST_PARENT_CHANGED');
        owned(current);parent.kill('SIGKILL');}
      try{await bounded(closed,'NATIVE_REBUILD_TEST_PARENT_CLOSE_TIMEOUT');}
      catch(error){if(Number.isSafeInteger(parent.pid))throw error;}
      if(identity){
        const current=proc(identity.pid);
        if(live(current)){assert.ok(same(current,identity),'NATIVE_REBUILD_TEST_HELPER_CHANGED');owned(current);
          process.kill(identity.pid,'SIGKILL');}
        for(let i=0;i<80&&live(proc(identity.pid));i++)await delay(25);
        const after=proc(identity.pid);assert.ok(!live(after),'NATIVE_REBUILD_TEST_HELPER_CLEANUP');
      }
      parent.off('message',message);parent.off('error',failed);parent.off('close',failed);
    }};
}

for(const signal of ['SIGTERM','SIGKILL'])test('public preparation stops after real parent '+signal,{timeout:10000},async()=>{
  assert.ok(existsSync(guardian),'NATIVE_REBUILD_TEST_GUARDIAN_MISSING');
  const scratch=mkdtempSync(join(tmpdir(),'lianum-parent-death-')),marker=join(scratch,'terminated.txt');
  let run;
  try{
    run=await harness(guardian,marker);const identity=await run.ready();
    const parentCurrent=proc(run.parentIdentity.pid);
    assert.ok(same(parentCurrent,run.parentIdentity));owned(parentCurrent);run.parent.kill(signal);
    await bounded(run.closed,'NATIVE_REBUILD_TEST_PARENT_CLOSE_TIMEOUT');
    for(let i=0;i<80;i++){if(!live(proc(identity.pid))&&existsSync(marker))break;await delay(25);}
    assert.equal(readFileSync(marker,'utf8'),'SIGTERM');
    const after=proc(identity.pid);assert.ok(!after||after.startTimeTicks!==identity.startTimeTicks||!live(after));
  }finally{if(run)await run.close();rmSync(scratch,{recursive:true,force:true});}
});

test('a failing guardian rejects readiness and closes the actual parent without orphans',{timeout:10000},async()=>{
  const scratch=mkdtempSync(join(tmpdir(),'lianum-parent-death-fail-'));let run;
  try{
    run=await harness(join(scratch,'absent-guardian.py'),join(scratch,'must-not-exist.txt'));
    await assert.rejects(run.ready(),/NATIVE_REBUILD_TEST_(HELPER_EXIT|PARENT_EXIT)/);
    await run.close();
    assert.ok(!live(proc(run.parentIdentity.pid)));
    assert.ok(Number.isSafeInteger(run.helperPID));
    assert.ok(!live(proc(run.helperPID)));
    assert.equal(existsSync(join(scratch,'must-not-exist.txt')),false);
  }finally{if(run)await run.close();rmSync(scratch,{recursive:true,force:true});}
});

test('helper and parent spawn failures reject readiness and finish cleanup',{timeout:10000},async()=>{
  const scratch=mkdtempSync(join(tmpdir(),'lianum-parent-death-spawn-fail-'));
  try{
    for(const options of [{helperCommand:join(scratch,'absent-python')},{parentCommand:join(scratch,'absent-node')}]){
      const run=harness(guardian,join(scratch,'must-not-exist.txt'),options);
      try{
        await assert.rejects(run.ready(),/NATIVE_REBUILD_TEST_(HELPER_EXIT|PARENT_EXIT)/);
        await run.close();
        if(run.parentIdentity)assert.ok(!live(proc(run.parentIdentity.pid)));
        assert.equal(run.helperPID,undefined);
      }finally{await run.close();}
    }
    assert.equal(existsSync(join(scratch,'must-not-exist.txt')),false);
  }finally{rmSync(scratch,{recursive:true,force:true});}
});
