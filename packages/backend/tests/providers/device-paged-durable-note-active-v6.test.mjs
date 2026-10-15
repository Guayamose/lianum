/** Genuine private proofs through Original Authority + Source + ACTIVE dead
 * recovery. Financial deployment/RPC/funding are HOST ports, not public funds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {projectRoot,resourceRoot} from '@lianum/environment';
import {Vault} from '@lianum/engine/crypto/vault';
import * as Sup from '../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs';
const childURL=new URL('./device-paged-durable-note-active-child-v6.mjs',import.meta.url),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function processes(group){const rows=[];for(const pid of await readdir('/proc'))if(/^[1-9][0-9]*$/.test(pid))try{const stat=await readFile('/proc/'+pid+'/stat','utf8'),tail=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);if(Number(tail[2])!==group||['Z','X'].includes(tail[0]))continue;const argv=(await readFile('/proc/'+pid+'/cmdline','utf8')).split('\0');rows.push({pid:Number(pid),group,startTicks:tail[19],cpuTicks:Number(tail[11])+Number(tail[12]),role:argv.some(arg=>arg.endsWith('/wallet-note-private-worker-v4.mjs'))?'D26_WASM':argv.some(arg=>arg.endsWith('/bb'))?'W39_NATIVE':argv.some(arg=>arg.endsWith('/paged-proof-process-v3.mjs'))?'W39_COORDINATOR':'FIXED_ACTOR'});}catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}return rows;}
async function calculation(mode,group){const began=performance.now(),ticks=new Map();for(;;){assert.ok(performance.now()-began<120000,'ACTIVE_ACTUAL_PROOF_CPU_TIMEOUT');const rows=await processes(group),worker=rows.find(row=>row.role===(mode==='deposit'?'D26_WASM':'W39_NATIVE'));if(worker){ticks.set(worker.pid,ticks.get(worker.pid)??worker.cpuTicks);let phase=true;if(mode==='deposit'){phase=false;const dir=join(resourceRoot('engine'),'evidence/m23-wallet-proof-attempts');for(const file of await readdir(dir).catch(()=>[]))if(file.endsWith('-device-paged-d26-durable.json')){const r=JSON.parse(await readFile(join(dir,file),'utf8'));if(r.phase==='actual-proof-generation'&&Date.parse(r.startedAt)>=Date.now()-120000)phase=true;}}if(phase&&worker.cpuTicks-ticks.get(worker.pid)>=(mode==='deposit'?25:800))return rows;}await delay(50);}}
test('Source D26 and standalone W39: actual proof CPU SIGKILL, expired Original intake, ACTIVE dead reopen, fresh effect and lost reply without duplicate',{timeout:1200000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-durable-active-'));let child;const evidence=[];
 async function start(phase){let stdout='',stderr='';child=spawn(process.execPath,['--experimental-test-module-mocks',childURL.pathname],{detached:true,env:{...process.env,LIANUM_DURABLE_ACTIVE_DIRECTORY:directory,LIANUM_DURABLE_ACTIVE_PHASE:phase},stdio:['ignore','pipe','pipe','ipc']});child.stdout.on('data',bytes=>{stdout+=bytes;if(stdout.length>2*1024*1024)child.kill('SIGKILL');});child.stderr.on('data',bytes=>{stderr+=bytes;if(stderr.length>2*1024*1024)child.kill('SIGKILL');});const original=child,close=once(original,'close');const message=await Promise.race([once(original,'message').then(([row])=>row),close.then(([code,signal])=>{throw Error('DURABLE_ACTIVE_CHILD_BEFORE_MESSAGE '+phase+' '+code+'/'+signal+' '+stdout.slice(-7000)+' '+stderr.slice(-7000));}),new Promise((_,reject)=>setTimeout(()=>reject(Error('DURABLE_ACTIVE_CHILD_TIMEOUT '+phase+' '+stdout.slice(-7000)+' '+stderr.slice(-7000))),700000).unref())]);return{original,close,message,phase,output:()=>({stdout,stderr})};}
 try{
  for(const phase of ['BIRTH_D26','RECOVER_D26_START_W39']){
   const running=await start(phase),packet=running.message;assert.equal(packet.type,'DURABLE_ACTIVE_PROVING');const current=await new Vault(join(directory,'HOST-durable-fixture.vault')).read('HOST_DURABLE_FIXTURE_TEST_PRIVATE_32');
   assert.equal((await Sup.readOriginalPagedPublicRecoveryModeV4(current.data.supervisorInput)).mode,'ACTIVE_IN_USE');await assert.rejects(Sup.openOriginalPagedPublicActiveRecoveryV4(current.data.supervisorInput),/PAGED_PROCESS_FENCE_BUSY/);
   const proofRows=await calculation(packet.mode,packet.checkpoint.public.ownerProcess.processGroup);
   process.kill(-packet.checkpoint.public.ownerProcess.processGroup,'SIGKILL');process.kill(-running.original.pid,'SIGKILL');await running.close;child=null;
   for(let i=0;i<100&&((await processes(running.original.pid)).length||(await processes(packet.checkpoint.public.ownerProcess.processGroup)).length);i++)await delay(20);
   assert.equal((await processes(running.original.pid)).length,0);assert.equal((await processes(packet.checkpoint.public.ownerProcess.processGroup)).length,0,'proof descendants do not escape');
   await delay(Math.max(0,packet.consentExpiresAt-Date.now()+30));const before=await new Vault(join(directory,'jobs.aead')).read('HOST_DURABLE_ACTIVE_TEST_PRIVATE_32');assert.equal(before.data.noteWork.jobId,packet.jobId);assert.equal(before.data.jobs.find(row=>row.jobId===packet.jobId).stage,'PROVING');assert.deepEqual(before.data.noteWork.checkpoint,packet.checkpoint);
   evidence.push({phase,mode:packet.mode,checkpoint:packet.checkpoint,proofRows,consentExpiredBeforeReopen:true,originalRootId:before.data.noteWork.rootId,originalRevision:before.data.noteWork.sourceRevision});
  }
  const final=await start('RECOVER_W39');assert.equal(final.message.type,'DURABLE_ACTIVE_COMPLETE');const [code,signal]=await final.close;child=null;assert.equal(code,0,JSON.stringify(final.output()));assert.equal(signal,null);assert.equal(final.message.hostEffectCalls,2);assert.equal(final.message.financialSignatures,0);assert.equal(final.message.proofWitnesses,2);assert.equal(final.message.proofDeviceSignatures,2);assert.equal(final.message.financialAcceptance,false);
  evidence.push(final.message);await writeFile(join(projectRoot,'.local/durable-note-authority-active-causal-evidence-v6.json'),JSON.stringify({profile:'ACTUAL_DURABLE_SOURCE_AUTHORITY_ACTIVE_CAUSAL_V6',evidence,publicFinancialAcceptance:false},null,2)+'\n');
 }finally{if(child){const closed=once(child,'close');try{process.kill(-child.pid,'SIGKILL');}catch{}await closed;}await rm(directory,{recursive:true,force:true});}
});
