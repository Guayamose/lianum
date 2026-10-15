/** Real child SIGKILL and physical claim/inode checks. This fence grants no
 * Source permission, signed transaction, recovery token or financial status. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,readFile,writeFile,rename,mkdir,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {claimOriginalPagedProcessFenceV4,readOriginalPagedDeadProcessFenceV4} from '../../src/operations/recovery/paged-original-process-fence-v4.mjs';
const moduleURL=new URL('../../src/operations/recovery/paged-original-process-fence-v4.mjs',import.meta.url).href;
function contender(directory){
 const source=`import {claimOriginalPagedProcessFenceV4,readOriginalPagedProcessFenceIdentityV4} from ${JSON.stringify(moduleURL)};
let fence;process.on('message',async message=>{try{if(message==='GO'){fence=await claimOriginalPagedProcessFenceV4(JSON.parse(process.argv[1]));process.send({state:'ACQUIRED',row:await readOriginalPagedProcessFenceIdentityV4(fence)});}else if(message==='CHECK'){await fence.current();process.send({state:'CHECKED'});}}catch(error){process.send({state:'REJECTED',error:error.message});}});process.send({state:'WAIT'});`;
 const child=spawn(process.execPath,['--input-type=module','-e',source,JSON.stringify({directory,purpose:'PUBLIC_SUPERVISOR'})],{stdio:['ignore','ignore','pipe','ipc']});return child;
}
async function stop(child){if(child.exitCode!==null||child.signalCode!==null)return;const done=once(child,'exit');child.kill('SIGKILL');const [code,signal]=await done;assert.equal(code,null);assert.equal(signal,'SIGKILL');}
test('two actual recoverers race after SIGKILL: exactly one owns the same directory and the loser cannot remove its claim',{timeout:20000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-two-original-recoverers-')),children=[];let fence;
 try{
  // Repeat at the real syscall boundary; no mocked filesystem, child signal,
  // flock utility, process identity or fence producer participates here.
  for(let round=0;round<8;round++){
   const original=contender(directory);children.push(original);assert.equal((await once(original,'message'))[0].state,'WAIT');const birth=once(original,'message');original.send('GO');assert.equal((await birth)[0].state,'ACQUIRED');await stop(original);
   const left=contender(directory),right=contender(directory);children.push(left,right);const ready=await Promise.all([once(left,'message'),once(right,'message')]);assert.deepEqual(ready.map(item=>item[0].state),['WAIT','WAIT']);
   const results=[once(left,'message'),once(right,'message')];left.send('GO');right.send('GO');const outcomes=(await Promise.all(results)).map(item=>item[0]);assert.equal(outcomes.filter(item=>item.state==='ACQUIRED').length,1,JSON.stringify(outcomes));assert.equal(outcomes.filter(item=>item.state==='REJECTED'&&item.error==='PAGED_PROCESS_FENCE_BUSY').length,1,JSON.stringify(outcomes));
   const index=outcomes.findIndex(item=>item.state==='ACQUIRED'),winner=[left,right][index],loser=[left,right][1-index];const claimed=JSON.parse(await readFile(join(directory,'original-process-public_supervisor.lock'),'utf8'));assert.deepEqual(claimed,outcomes[index].row);
   const checked=once(winner,'message');winner.send('CHECK');assert.equal((await checked)[0].state,'CHECKED');await stop(loser);await stop(winner);
   // SIGKILL released the kernel lock; recovery now authenticates the exact
   // winning predecessor and never the stale process from the initial birth.
   fence=await claimOriginalPagedProcessFenceV4({directory,purpose:'PUBLIC_SUPERVISOR'});const dead=await readOriginalPagedDeadProcessFenceV4(fence);assert.deepEqual(dead,outcomes[index].row);await fence.current();await fence.close();fence=null;
  }
 }finally{for(const child of children)await stop(child);await fence?.close();await rm(directory,{recursive:true,force:true});}
});
test('the held kernel exclusion and claim remain bound to the original directory inode',{timeout:10000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-original-directory-')),moved=directory+'-moved',alias=directory+'-alias';let fence;
 try{fence=await claimOriginalPagedProcessFenceV4({directory,purpose:'PUBLIC_SUPERVISOR'});await symlink(directory,alias);await assert.rejects(claimOriginalPagedProcessFenceV4({directory:alias,purpose:'PUBLIC_SUPERVISOR'}),/PAGED_PROCESS_FENCE_DIRECTORY/);await rename(directory,moved);await mkdir(directory,{mode:0o700});await assert.rejects(fence.current(),/PAGED_PROCESS_FENCE_CHANGED/);await assert.rejects(fence.close(),/PAGED_PROCESS_FENCE_CHANGED/);fence=null;const bytes=await readFile(join(moved,'original-process-public_supervisor.lock'),'utf8');assert.ok(bytes.includes('PUBLIC_SUPERVISOR'));}
 finally{await fence?.close().catch(()=>{});await rm(alias,{force:true});await rm(directory,{recursive:true,force:true});await rm(moved,{recursive:true,force:true});}
});
test('original process fence rejects live owner, then authenticates same physical dead child after actual SIGKILL',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-dead-process-original-'));let child,fence;
 try{child=spawn(process.execPath,['--input-type=module','-e',`import {claimOriginalPagedProcessFenceV4} from ${JSON.stringify(moduleURL)};await claimOriginalPagedProcessFenceV4(JSON.parse(process.argv[1]));process.stdout.write('READY\\n');setInterval(()=>{},1000);`,JSON.stringify({directory,purpose:'PUBLIC_SUPERVISOR'})],{stdio:['ignore','pipe','pipe']});const ready=await once(child.stdout,'data');assert.equal(ready[0].toString(),'READY\n');await assert.rejects(claimOriginalPagedProcessFenceV4({directory,purpose:'PUBLIC_SUPERVISOR'}),/PAGED_PROCESS_FENCE_BUSY/);const pid=child.pid,exit=once(child,'exit');child.kill('SIGKILL');const [code,signal]=await exit;assert.equal(code,null);assert.equal(signal,'SIGKILL');child=null;fence=await claimOriginalPagedProcessFenceV4({directory,purpose:'PUBLIC_SUPERVISOR'});const dead=await readOriginalPagedDeadProcessFenceV4(fence);assert.equal(dead.pid,pid);assert.equal(dead.directory,directory);assert.equal(dead.purpose,'PUBLIC_SUPERVISOR');await assert.rejects(readOriginalPagedDeadProcessFenceV4({...fence}),/PAGED_PROCESS_FENCE_ORIGINAL/);await assert.rejects(claimOriginalPagedProcessFenceV4({directory,purpose:'PUBLIC_SUPERVISOR'}),/PAGED_PROCESS_FENCE_BUSY/);await fence.current();await fence.close();fence=null;
 }finally{if(child){const exit=once(child,'exit');child.kill('SIGKILL');await exit;}await fence?.close();await rm(directory,{recursive:true,force:true});}
});
test('a fresh claim cannot pretend to have a dead predecessor; changed claim bytes cannot be adopted or removed',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-original-process-changed-'));let fence;
 try{fence=await claimOriginalPagedProcessFenceV4({directory,purpose:'PUBLIC_SUPERVISOR'});await assert.rejects(readOriginalPagedDeadProcessFenceV4(fence),/NO_DEAD_PREDECESSOR/);const path=join(directory,'original-process-public_supervisor.lock'),data=JSON.parse(await readFile(path,'utf8'));await writeFile(path,JSON.stringify({...data,identity:'a'.repeat(64)}),{mode:0o600});await assert.rejects(fence.current(),/PAGED_PROCESS_FENCE_CHANGED/);await assert.rejects(fence.close(),/PAGED_PROCESS_FENCE_CHANGED/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
