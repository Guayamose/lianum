/** A Linux computation slot. It schedules work and grants no financial authority. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {mkdir,lstat,open,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';

const WAIT_LIMIT_MS=240000,CONFLICT_EXIT=75;
const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
function cancelled(signal){return signal!==undefined&&aborted.call(signal);}
function live(signal){assert.ok(!cancelled(signal),'PAEG_PROOF_SLOT_CANCELLED');}
async function current(directory,file,identity){
 const path=await lstat(directory),fd=await file.stat();
 assert.ok(path.isDirectory()&&!path.isSymbolicLink()&&path.uid===process.getuid()&&(path.mode&0o777)===0o700,'PAEG_PROOF_SLOT_DIRECTORY');
 assert.equal(await realpath(directory),directory,'PAEG_PROOF_SLOT_ALIAS');
 for(const key of ['dev','ino','uid','mode']){assert.equal(path[key],identity[key],'PAEG_PROOF_SLOT_CHANGED');assert.equal(fd[key],identity[key],'PAEG_PROOF_SLOT_CHANGED');}
}
function attempt(file,signal){return new Promise((resolveAttempt,reject)=>{
 const child=spawn('/usr/bin/flock',['--exclusive','--nonblock','--conflict-exit-code',String(CONFLICT_EXIT),'3'],{stdio:['ignore','ignore','ignore',file.fd],env:{PATH:'/usr/bin:/bin',LANG:'C'}});
 const cancel=()=>child.kill('SIGTERM');
 if(signal!==undefined){add.call(signal,'abort',cancel,{once:true});if(cancelled(signal))cancel();}
 let failure=null;child.once('error',()=>{failure=Error('PAEG_PROOF_SLOT_FLOCK_UNAVAILABLE');});
 child.once('close',(code,killed)=>{if(signal!==undefined)remove.call(signal,'abort',cancel);if(cancelled(signal))reject(Error('PAEG_PROOF_SLOT_CANCELLED'));else if(failure)reject(failure);else if(killed!==null||![0,CONFLICT_EXIT].includes(code))reject(Error('PAEG_PROOF_SLOT_FLOCK_FAILED'));else resolveAttempt(code===0);});
});}
function delay(signal){return new Promise((resolveWait,reject)=>{
 const finish=()=>{if(signal!==undefined)remove.call(signal,'abort',cancel);resolveWait();};
 const timer=setTimeout(finish,100),cancel=()=>{clearTimeout(timer);if(signal!==undefined)remove.call(signal,'abort',cancel);reject(Error('PAEG_PROOF_SLOT_CANCELLED'));};
 if(signal!==undefined){add.call(signal,'abort',cancel,{once:true});if(cancelled(signal))cancel();}
});}
/** The caller chooses a physical resource directory. This handle only holds
 * its actual directory FD; it never substitutes a prover, witness or permission.
 * flock operates on the shared open file description inherited by its child.
 * The parent's FD keeps the lock after that child exits and releases on death. */
export async function acquireProofComputationSlotV4(directory,signal){
 assert.ok(arguments.length===1||arguments.length===2);assert.equal(process.platform,'linux','PAEG_PROOF_SLOT_LINUX');
 assert.ok(typeof directory==='string'&&directory===resolve(directory)&&directory.length<4096&&!directory.includes('\0'),'PAEG_PROOF_SLOT_PATH');
 if(signal!==undefined)aborted.call(signal);live(signal);
 await mkdir(directory,{recursive:true,mode:0o700});live(signal);
 const identity=await lstat(directory),file=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);let returned=false;
 try{
  await current(directory,file,identity);const start=performance.now();
  for(;;){live(signal);assert.ok(performance.now()-start<WAIT_LIMIT_MS,'PAEG_PROOF_SLOT_WAIT_EXPIRED');await current(directory,file,identity);
   if(await attempt(file,signal)){live(signal);await current(directory,file,identity);let closed=false,closing=null;
    const slot=Object.freeze({profile:'PAGED_PROOF_COMPUTATION_SLOT_V4',waitMilliseconds:Math.ceil(performance.now()-start),async current(){assert.ok(!closed,'PAEG_PROOF_SLOT_CLOSED');await current(directory,file,identity);return true;},close(){return closing??=(async()=>{try{await slot.current();}finally{closed=true;await file.close();}})();}});
    returned=true;return slot;
   }
   await delay(signal);
  }
 }finally{if(!returned)await file.close();}
}
