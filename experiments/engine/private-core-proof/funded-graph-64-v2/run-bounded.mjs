/** Fixed isolated compiler/key supervisor; no financial action or proof job. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {openSync,closeSync,readFileSync,writeFileSync,unlinkSync,statfsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {PAEG64_ROOT_V2,PAEG64_WORDS_V2} from './artifacts.mjs';
import {PRIVATE_RESOURCE_POLICY as limits} from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
assert.equal(process.argv.length,4,'PAEG64_FIXED_ARGUMENTS');assert.ok((['compile','prepare-key'].includes(process.argv[2])&&Object.hasOwn(PAEG64_WORDS_V2,process.argv[3]))||(process.argv[2]==='compile-consumer'&&/^[0-9a-f]{64}$/.test(process.argv[3])),'PAEG64_FIXED_OPERATION');
assert.equal(process.execArgv.length,0,'PAEG64_NO_FLAGS');assert.ok(!process.env.NODE_OPTIONS,'PAEG64_NO_NODE_OPTIONS');
const dir=join(PAEG64_ROOT_V2,'.local');mkdirSync(dir,{recursive:true,mode:0o700});const lock=join(dir,'active.lock');const fd=openSync(lock,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid,stage:process.argv[2],mode:process.argv[3]}));closeSync(fd);
let child,closed=false,output=0,reason=null,interval,timer;const codes=[];const check=()=>{const available=Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;const disk=statfsSync(dir);assert.ok(available>=limits.floors.availableRAM&&disk.bavail*disk.bsize>=limits.floors.freeDisk,'PAEG64_RESOURCE_FLOOR');if(child&&!closed){let text;try{text=readFileSync('/proc/'+child.pid+'/status','utf8');}catch(e){if(e.code==='ENOENT')return;throw e;}const rss=Number(/VmRSS:\s+(\d+)/.exec(text)?.[1]??0)*1024;assert.ok(rss<=limits.proofWorkerRSSLimit,'PAEG64_WORKER_RSS');}};
try{
 check();child=spawn(process.execPath,['--max-old-space-size=384',join(PAEG64_ROOT_V2,'artifacts.mjs'),...process.argv.slice(2)],{stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_OPTIONS:undefined}});
 const stop=code=>{if(reason)return;reason=code;child.kill('SIGTERM');setTimeout(()=>{if(!closed)child.kill('SIGKILL');},5000).unref();};
 const consume=b=>{output+=b.length;if(output>4096)stop('PAEG64_OUTPUT_BOUND');else codes.push(b);};child.stdout.on('data',consume);child.stderr.on('data',consume);
 interval=setInterval(()=>{try{check();}catch(e){stop(/^PAEG64_[A-Z0-9_]+/.exec(e.message)?.[0]??'PAEG64_RESOURCE');}},250);timer=setTimeout(()=>stop('PAEG64_PHASE_DEADLINE'),600000);
 const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(exitCode,signal)=>{closed=true;resolve({exitCode,signal});});});clearInterval(interval);clearTimeout(timer);
 writeFileSync(join(dir,'attempt-'+Date.now()+'.json'),JSON.stringify({stage:process.argv[2],mode:process.argv[3],...result,reason,proofGenerated:false})+'\n',{flag:'wx',mode:0o600});
 if(reason||result.exitCode!==0){console.log(JSON.stringify({stage:'failed',code:reason??'PAEG64_CHILD_FAILED'}));process.exitCode=1;}else console.log(Buffer.concat(codes).toString('utf8').trim());
}finally{clearInterval(interval);clearTimeout(timer);if(child&&!closed){child.kill('SIGTERM');await new Promise(resolve=>child.once('close',resolve));}unlinkSync(lock);}
