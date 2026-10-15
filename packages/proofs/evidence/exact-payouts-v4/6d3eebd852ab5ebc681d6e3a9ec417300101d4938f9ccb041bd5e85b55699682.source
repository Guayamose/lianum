/** Fixed isolated compiler/key supervisor; no financial action or proof job. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openSync,closeSync,readFileSync,writeFileSync,unlinkSync,statfsSync,mkdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {PAEG_PAGED_ROOT_V4,PAEG_PAGED_WORDS_V3,retainFundedPagedGraphFailureV4} from './exact-payout-artifacts-v4.mjs';
import {PRIVATE_RESOURCE_POLICY as limits} from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
assert.equal(process.argv.length,4,'PAEG_PAGED_FIXED_ARGUMENTS');assert.ok((['compile','prepare-key'].includes(process.argv[2])&&Object.hasOwn(PAEG_PAGED_WORDS_V3,process.argv[3]))||(['compile-consumer'].includes(process.argv[2])&&/^[0-9a-f]{64}$/.test(process.argv[3])),'PAEG_PAGED_FIXED_OPERATION');
assert.equal(process.execArgv.length,0,'PAEG_PAGED_NO_FLAGS');assert.ok(!process.env.NODE_OPTIONS,'PAEG_PAGED_NO_NODE_OPTIONS');
const dir=join(PAEG_PAGED_ROOT_V4,'.local');mkdirSync(dir,{recursive:true,mode:0o700});const lock=join(dir,'exact-active.lock');const fd=openSync(lock,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid,stage:process.argv[2],mode:process.argv[3]}));closeSync(fd);
let child,closed=false,output=0,reason=null,interval,timer,reported=false;const stdout=[],stderr=[];
const check=()=>{const available=Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;const disk=statfsSync(dir);assert.ok(available>=limits.floors.availableRAM&&disk.bavail*disk.bsize>=limits.floors.freeDisk,'PAEG_PAGED_RESOURCE_FLOOR');if(child&&!closed){let text;try{text=readFileSync('/proc/'+child.pid+'/status','utf8');}catch(e){if(e.code==='ENOENT')return;throw e;}const rss=Number(/VmRSS:\s+(\d+)/.exec(text)?.[1]??0)*1024;assert.ok(rss<=limits.proofWorkerRSSLimit,'PAEG_PAGED_WORKER_RSS');}};
const report=record=>{writeFileSync(join(dir,'attempt-'+Date.now()+'.json'),JSON.stringify({stage:process.argv[2],mode:process.argv[3],...record,proofGenerated:false})+'\n',{flag:'wx',mode:0o600});reported=true;};
function childFailure(){
 const packets=[];for(const line of Buffer.concat(stdout).toString('utf8').split('\n')){try{const packet=JSON.parse(line);if(packet?.stage==='failed')packets.push(packet);}catch{}}
 if(packets.length===0)return null;
 assert.equal(packets.length,1,'PAEG_PAGED_DIAGNOSTIC_PACKET');const packet=packets[0];
 assert.deepEqual(Object.keys(packet).sort(),['stage','code','errorType','frames','diagnosticFile','diagnosticSHA256'].sort(),'PAEG_PAGED_DIAGNOSTIC_PACKET');
 assert.match(packet.code,/^PAEG_PAGED_[A-Z0-9_]{1,80}$/,'PAEG_PAGED_DIAGNOSTIC_CODE');
 assert.ok(['Error','AssertionError','TypeError','SyntaxError','RangeError','CompileError'].includes(packet.errorType),'PAEG_PAGED_DIAGNOSTIC_TYPE');
 assert.ok(Array.isArray(packet.frames)&&packet.frames.length<=6,'PAEG_PAGED_DIAGNOSTIC_FRAMES');
 for(const frame of packet.frames){assert.deepEqual(Object.keys(frame).sort(),['file','line','column'].sort(),'PAEG_PAGED_DIAGNOSTIC_FRAME');assert.ok(typeof frame.file==='string'&&frame.file.length<=240&&/^[A-Za-z0-9._@%+/-]+\.(nr|mjs|cjs|js|toml)$/.test(frame.file)&&!frame.file.startsWith('/')&&!frame.file.split('/').includes('..'),'PAEG_PAGED_DIAGNOSTIC_FILE');assert.ok(Number.isSafeInteger(frame.line)&&frame.line>=1&&frame.line<=10000000&&(frame.column===null||(Number.isSafeInteger(frame.column)&&frame.column>=1&&frame.column<=10000000)),'PAEG_PAGED_DIAGNOSTIC_LINE');}
 assert.match(packet.diagnosticFile,new RegExp('^error-'+child.pid+'-[0-9a-f]{16}\\.json$'),'PAEG_PAGED_DIAGNOSTIC_OWNER');assert.match(packet.diagnosticSHA256,/^[0-9a-f]{64}$/,'PAEG_PAGED_DIAGNOSTIC_HASH');
 const path=join(dir,packet.diagnosticFile),stat=lstatSync(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o777)===0o600&&stat.size<=32768,'PAEG_PAGED_PRIVATE_DIAGNOSTIC');assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),packet.diagnosticSHA256,'PAEG_PAGED_DIAGNOSTIC_READBACK');
 return packet;
}
try{
 check();child=spawn(process.execPath,['--max-old-space-size=384',join(PAEG_PAGED_ROOT_V4,'exact-payout-artifacts-v4.mjs'),...process.argv.slice(2)],{stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_OPTIONS:undefined}});
 const stop=code=>{if(reason)return;reason=code;child.kill('SIGTERM');setTimeout(()=>{if(!closed)child.kill('SIGKILL');},5000).unref();};
 const consume=(list,b)=>{output+=b.length;if(output>4096)stop('PAEG_PAGED_OUTPUT_BOUND');else list.push(b);};child.stdout.on('data',b=>consume(stdout,b));child.stderr.on('data',b=>consume(stderr,b));
 interval=setInterval(()=>{try{check();}catch(e){stop(/^PAEG_PAGED_[A-Z0-9_]+/.exec(e.message)?.[0]??'PAEG_PAGED_RESOURCE');}},250);timer=setTimeout(()=>stop('PAEG_PAGED_PHASE_DEADLINE'),600000);
 const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(exitCode,signal)=>{closed=true;resolve({exitCode,signal});});});clearInterval(interval);clearTimeout(timer);
 let failure=null;
 if(reason||result.exitCode!==0)failure=childFailure()??retainFundedPagedGraphFailureV4(new Error(reason??'PAEG_PAGED_CHILD_FAILED'),process.argv[2],process.argv[3],Buffer.concat([...stderr,...stdout]).toString('utf8'));
 report({...result,reason,failure});
 if(failure){console.log(JSON.stringify({stage:'failed',code:reason??failure.code,errorType:failure.errorType,frames:failure.frames}));process.exitCode=1;}else console.log(Buffer.concat(stdout).toString('utf8').trim());
}catch(error){
 const failure=retainFundedPagedGraphFailureV4(error,process.argv[2],process.argv[3],Buffer.concat([...stderr,...stdout]).toString('utf8'));
 if(!reported)report({exitCode:null,signal:null,reason,failure});console.log(JSON.stringify({stage:'failed',code:failure.code,errorType:failure.errorType,frames:failure.frames}));process.exitCode=1;
}finally{clearInterval(interval);clearTimeout(timer);if(child&&!closed){child.kill('SIGTERM');await new Promise(resolve=>child.once('close',resolve));}unlinkSync(lock);}
