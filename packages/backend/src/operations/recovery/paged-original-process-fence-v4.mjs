/** Exclusive Linux process ownership for original recovery producers.
 * A dead-writer fence never grants financial/runtime authority. The consumer
 * must separately authenticate its original AEAD journals and chain evidence. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {open,lstat,readFile,realpath,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const PROFILE='ORIGINAL_PAGED_PROCESS_FENCE_V4',owned=new WeakMap();
const digest=b=>createHash('sha256').update(b).digest('hex');
const ids=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);
const same=(a,b)=>assert.deepEqual(a,b,'PAGED_PROCESS_FENCE_CHANGED');
const directoryIds=s=>[s.dev,s.ino,s.uid,s.mode].map(String);
/** Linux flock locks this open file description. The fixed utility inherits
 * the descriptor; after it exits the parent retains the kernel lock until
 * the same descriptor closes, including on SIGKILL. No lockfile is deleted
 * to acquire this exclusion. Missing flock fails closed. */
async function lockDirectory(directory,expected){
 const before=await lstat(directory,{bigint:true}),file=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{
  same(directoryIds(before),directoryIds(expected));
  same(directoryIds(await file.stat({bigint:true})),directoryIds(before));
  await new Promise((resolve,reject)=>{
   const child=spawn('/usr/bin/flock',['--exclusive','--nonblock','3'],{stdio:['ignore','ignore','ignore',file.fd]});let finished=false;
   const timer=setTimeout(()=>{if(!finished){child.kill('SIGKILL');reject(Error('PAGED_PROCESS_FENCE_OS_LOCK_UNAVAILABLE'));}},5000);timer.unref();
   child.once('error',()=>{finished=true;clearTimeout(timer);reject(Error('PAGED_PROCESS_FENCE_OS_LOCK_UNAVAILABLE'));});
   child.once('close',(code,signal)=>{if(finished)return;finished=true;clearTimeout(timer);if(code===0&&signal===null)resolve();else reject(Error(code===1&&signal===null?'PAGED_PROCESS_FENCE_BUSY':'PAGED_PROCESS_FENCE_OS_LOCK_UNAVAILABLE'));});
  });
  const original=directoryIds(before);
  async function current(){same(directoryIds(await file.stat({bigint:true})),original);same(directoryIds(await lstat(directory,{bigint:true})),original);assert.equal(await realpath(directory),directory,'PAGED_PROCESS_FENCE_CHANGED');}
  await current();return{file,current};
 }catch(error){await file.close().catch(()=>{});throw error;}
}
function exact(v,keys){assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype);assert.deepEqual(Reflect.ownKeys(v).sort(),[...keys].sort());for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(v,key),'value'));}
async function processStart(pid){try{const raw=await readFile('/proc/'+pid+'/stat','utf8');const value=raw.slice(raw.lastIndexOf(')')+2).split(' ')[19];assert.match(value,/^[0-9]+$/);return value;}catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')return null;throw error;}}
async function boot(){assert.equal(process.platform,'linux','PAGED_PROCESS_FENCE_PLATFORM');const id=(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim();assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);return id;}
async function readClaim(path){const before=await lstat(path,{bigint:true});assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.uid===BigInt(process.getuid())&&before.nlink===1n&&(before.mode&0o777n)===0o600n&&before.size>0n&&before.size<=4096n,'PAGED_PROCESS_FENCE_FILE');const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{same(ids(await file.stat({bigint:true})),ids(before));const bytes=await file.readFile();same(ids(await file.stat({bigint:true})),ids(await lstat(path,{bigint:true})));assert.ok(bytes.length<=4096);const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));exact(data,['profile','directory','purpose','identity','pid','bootId','startTicks']);assert.equal(data.profile,PROFILE);assert.equal(data.directory,resolve(data.directory));assert.match(data.purpose,/^[A-Z][A-Z0-9_]{0,63}$/);assert.match(data.identity,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(data.pid)&&data.pid>0);assert.match(data.bootId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);assert.match(data.startTicks,/^[0-9]+$/);return{data,id:ids(before),sha256:digest(bytes)};}finally{await file.close();}}
async function dead(data,currentBoot){assert.ok(data.bootId!==currentBoot||await processStart(data.pid)!==data.startTicks,'PAGED_PROCESS_FENCE_BUSY');}
/** The path and purpose are nonfinancial operator data. Only this module's
 * live descriptor plus physical inode/readback can represent its own fence. */
export async function claimOriginalPagedProcessFenceV4(raw){
 assert.equal(arguments.length,1);exact(raw,['directory','purpose']);assert.equal(raw.directory,resolve(raw.directory));assert.ok(raw.directory.length<4096&&!raw.directory.includes('\0'));assert.match(raw.purpose,/^[A-Z][A-Z0-9_]{0,63}$/);
 const directory=raw.directory,stat=await lstat(directory);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o700&&await realpath(directory)===directory,'PAGED_PROCESS_FENCE_DIRECTORY');
 const exclusion=await lockDirectory(directory,stat);
 try{
 const currentBoot=await boot(),startTicks=await processStart(process.pid);assert.ok(startTicks);const path=join(directory,'original-process-'+raw.purpose.toLowerCase()+'.lock');let prior=null,file;
 try{file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(error){if(error.code!=='EEXIST')throw error;prior=await readClaim(path);assert.equal(prior.data.directory,directory);assert.equal(prior.data.purpose,raw.purpose);await dead(prior.data,currentBoot);const check=await readClaim(path);same(check.id,prior.id);assert.equal(check.sha256,prior.sha256,'PAGED_PROCESS_FENCE_CHANGED');await dead(prior.data,await boot());await unlink(path);file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
 const row={profile:PROFILE,directory,purpose:raw.purpose,identity:randomBytes(32).toString('hex'),pid:process.pid,bootId:currentBoot,startTicks};let closed=false;
 try{await file.writeFile(JSON.stringify(row));await file.sync();await exclusion.file.sync();const current=await readClaim(path);assert.deepEqual(current.data,row);const handle=Object.freeze({profile:PROFILE,async current(){assert.ok(!closed,'PAGED_PROCESS_FENCE_CLOSED');await exclusion.current();const actual=await readClaim(path);same(actual.id,current.id);assert.equal(actual.sha256,current.sha256,'PAGED_PROCESS_FENCE_CHANGED');assert.equal(await boot(),row.bootId);assert.equal(await processStart(process.pid),row.startTicks);return true;},async close(){if(closed)return;try{await handle.current();await unlink(path);await exclusion.file.sync();}finally{closed=true;owned.delete(handle);try{await file.close();}finally{await exclusion.file.close();}}}});owned.set(handle,{row,prior:prior===null?null:prior.data});return handle;}catch(error){await file.close().catch(()=>{});throw error;}
 }catch(error){await exclusion.file.close().catch(()=>{});throw error;}
}
export async function readOriginalPagedDeadProcessFenceV4(handle){assert.equal(arguments.length,1);const s=owned.get(handle);assert.ok(s,'PAGED_PROCESS_FENCE_ORIGINAL');await handle.current();assert.ok(s.prior,'PAGED_PROCESS_FENCE_NO_DEAD_PREDECESSOR');await dead(s.prior,await boot());return Object.freeze({...s.prior});}

export async function readOriginalPagedProcessFenceIdentityV4(handle){assert.equal(arguments.length,1);const s=owned.get(handle);assert.ok(s,'PAGED_PROCESS_FENCE_ORIGINAL');await handle.current();return Object.freeze({...s.row});}

/** Death corroboration only. An issuer must authenticate this identity from
 * its own durable record; this check itself grants no recovery capability. */
export async function assertOriginalPagedDeadProcessIdentityV4(handle,row){assert.equal(arguments.length,2);const s=owned.get(handle);assert.ok(s,'PAGED_PROCESS_FENCE_ORIGINAL');await handle.current();exact(row,['profile','directory','purpose','identity','pid','bootId','startTicks']);assert.equal(row.profile,PROFILE);assert.equal(row.directory,s.row.directory);assert.equal(row.purpose,s.row.purpose);assert.match(row.identity,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(row.pid)&&row.pid>0);assert.match(row.startTicks,/^[0-9]+$/);assert.match(row.bootId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);await dead(row,await boot());return true;}
