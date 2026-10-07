import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
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
    for(let i=0;i<40&&owned.guard.snapshot().liveCount;i++)await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(owned.guard.snapshot().liveCount,0);
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
