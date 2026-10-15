import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,symlink,rename,lstat,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireProofComputationSlotV4} from '../../src/host/proof-computation-slot-v4.mjs';

const moduleURL=new URL('../../src/host/proof-computation-slot-v4.mjs',import.meta.url).href;
const childSource=`import {acquireProofComputationSlotV4} from ${JSON.stringify(moduleURL)};const slot=await acquireProofComputationSlotV4(process.argv[1]);process.send({acquired:true});process.on('message',async()=>{await slot.close();process.disconnect();});`;

test('computation slot serializes actual processes and kernel releases the FD after SIGKILL',async()=>{
 const root=await mkdtemp(join(tmpdir(),'paged-computation-slot-')),directory=join(root,'jobs');let first,second,third;
 try{
  first=await acquireProofComputationSlotV4(directory);
  second=spawn(process.execPath,['--input-type=module','-e',childSource,directory],{stdio:['ignore','ignore','pipe','ipc']});
  let acquired=false;second.on('message',message=>{assert.deepEqual(message,{acquired:true});acquired=true;});
  const ready=once(second,'message'),closed=once(second,'close');
  await new Promise(resolve=>setTimeout(resolve,150));assert.equal(acquired,false);await first.current();
  await first.close();first=null;await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('SLOT_CHILD_TIMEOUT')),5000).unref())]);
  assert.equal(acquired,true);second.kill('SIGKILL');const [code,signal]=await closed;assert.equal(code,null);assert.equal(signal,'SIGKILL');second=null;
  third=await acquireProofComputationSlotV4(directory);await third.current();await third.close();third=null;
 }finally{if(second){second.kill('SIGKILL');await once(second,'close');}await first?.close();await third?.close();await rm(root,{recursive:true,force:true});}
});

test('cancelling queued work preserves the current slot and does not create a pre-aborted directory',async()=>{
 const root=await mkdtemp(join(tmpdir(),'paged-computation-cancel-'));let first;
 try{
  const directory=join(root,'jobs');first=await acquireProofComputationSlotV4(directory);
  const control=new AbortController(),queued=acquireProofComputationSlotV4(directory,control.signal);
  const rejected=assert.rejects(queued,/PAEG_PROOF_SLOT_CANCELLED/);await new Promise(resolve=>setTimeout(resolve,120));control.abort();await rejected;await first.current();
  const pre=new AbortController();pre.abort();const absent=join(root,'not-created');await assert.rejects(acquireProofComputationSlotV4(absent,pre.signal),/PAEG_PROOF_SLOT_CANCELLED/);await assert.rejects(lstat(absent),{code:'ENOENT'});
 }finally{await first?.close();await rm(root,{recursive:true,force:true});}
});

test('computation slot rejects aliases and replaced directory identities and drains its retained FD',async()=>{
 const root=await mkdtemp(join(tmpdir(),'paged-computation-identity-'));let slot;
 try{
  const directory=join(root,'jobs'),alias=join(root,'alias');slot=await acquireProofComputationSlotV4(directory);await symlink(directory,alias);
  await assert.rejects(acquireProofComputationSlotV4(alias));await rename(directory,join(root,'old-jobs'));await assert.rejects(slot.current());await assert.rejects(slot.close());slot=null;
  const replacement=await acquireProofComputationSlotV4(directory);await replacement.close();
 }finally{await slot?.close().catch(()=>{});await rm(root,{recursive:true,force:true});}
});


test('a private shared child works beneath0755 historical telemetry without changing parent permissions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'paged-computation-historical-')),parent=join(root,'historical-telemetry'),directory=join(parent,'.computation-slot-v4');let slot;
 try{await mkdir(parent,{mode:0o755});const before=await lstat(parent);assert.equal(before.mode&0o777,0o755);await assert.rejects(acquireProofComputationSlotV4(parent),/PAEG_PROOF_SLOT_DIRECTORY/);slot=await acquireProofComputationSlotV4(directory);assert.equal((await lstat(directory)).mode&0o777,0o700);await slot.current();assert.equal((await lstat(parent)).ino,before.ino);assert.equal((await lstat(parent)).mode&0o777,0o755);}
 finally{await slot?.close();await rm(root,{recursive:true,force:true});}
});
