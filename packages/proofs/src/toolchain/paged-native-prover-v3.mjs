/** Fixed BB5.2 native transport for one Paged proof worker. The original
 * circuit, prepared VK, statement and EVM/ZK settings remain in its caller.
 * No caller path, backend, thread count, PID or serialized authority is used. */
import assert from 'node:assert/strict';
import {ChildProcess} from 'node:child_process';
import {Socket} from 'node:net';
import {accessSync,constants,closeSync,fstatSync,lstatSync,openSync,readFileSync,readlinkSync,realpathSync,statSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {resourcePath} from '@lianum/environment';
import {nativeProcStatV1} from '../host/process-files.mjs';
import {nativeOwnedRSSV1} from '../host/process-rss.mjs';
import {loadOfficialProofLibrariesV1} from './official-proof-libraries.mjs';

export const PAGED_NATIVE_PROVER_PROFILE_V3='LIANUM_PAGED_NATIVE_UNIX_SOCKET_PROVER_V3';
export const PAGED_NATIVE_PROVER_THREADS_V3=12;
const modules=resourcePath('engine','experiments/private-core-proof/node_modules');
export const PAGED_NATIVE_PROVER_BINARY_V3=join(modules,'@aztec/bb.js/build/amd64-linux/bb');
export const PAGED_NATIVE_PROVER_BINARY_SHA256_V3='5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b';
const workerPath=fileURLToPath(new URL('./paged-proof-process-v3.mjs',import.meta.url));
const modes=Object.freeze(['reserve','fold','terminal','admission','withdraw']);
const outputLimit=1048576,owned=new WeakMap();
const pins=Object.freeze([
 ['@aztec/bb.js/package.json','709a3a3cbcccb58096d177d3922e3b5e8441cc9d0440dee4f207c293d57e01c2'],
 ['@aztec/bb.js/build/amd64-linux/bb',PAGED_NATIVE_PROVER_BINARY_SHA256_V3],
 ['@aztec/bb.js/src/bb_backends/node/native_socket.ts','fa5a96777643988c1cd4aafb9bd99033275f7caa9e8313cac58d39df04daae54'],
 ['@aztec/bb.js/dest/node/bb_backends/node/native_socket.js','72d56ee153101f9d3ef18d9bf63285ca86f95206e0673233cd5e601b50e4bd9b'],
 ['@aztec/bb.js/dest/node/bb_backends/node/platform.js','84383ac16d7502549e274a287c2cf9427e65f08abbc6e690a52cd9f4d198812d'],
 ['@aztec/bb.js/dest/node/index.js','b37fd2a24a149ff9696f08e16f9593b831c6be007cdfe85d2bf3f1bd54647528'],
].map(row=>Object.freeze(row)));
const same=(a,b)=>a&&b&&a.pid===b.pid&&a.ppid===b.ppid&&a.pgrp===b.pgrp&&a.session===b.session&&a.startTimeTicks===b.startTimeTicks;
const identity=stat=>Object.fromEntries(['pid','ppid','pgrp','session','startTimeTicks'].map(key=>[key,stat[key]]));
const fileIdentity=stat=>['dev','ino','uid','size','mode','nlink','mtimeNs','ctimeNs'].map(key=>[key,stat[key].toString()]);
const argvFor=pid=>readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0').filter(Boolean);
const outputBytes=row=>row.outputBytes+row.loggerBytes();
function originalWorker(argv){return Array.isArray(argv)&&argv.length===5&&argv[0]===process.execPath&&argv[1]===workerPath&&modes.includes(argv[2])&&/^[a-f0-9-]{36}$/.test(argv[3])&&/^[a-f0-9]{64}$/.test(argv[4]);}
// Node process.argv omits execArgv; the kernel cmdline retains the one fixed
// memory flag used by the original client. No additional flags are accepted.
function originalWorkerCommand(argv){return Array.isArray(argv)&&argv.length===6&&argv[1]==='--max-old-space-size=384'&&originalWorker([argv[0],...argv.slice(2)]);}
/** Classification is DATA only; process ownership still uses original procfs
 * identity, executable, parent and the privately retained SDK ChildProcess. */
export function classifyPagedNativeProverProcessV3(argv,executable,parent=null){
 assert.equal(arguments.length,3);
 if(executable===process.execPath&&originalWorkerCommand(argv))return{role:'paged-native-coordinator',proofWorker:false};
 if(executable!==PAGED_NATIVE_PROVER_BINARY_V3||!parent||!originalWorkerCommand(parent.argv))return null;
 assert.deepEqual(argv,[PAGED_NATIVE_PROVER_BINARY_V3,'msgpack','run','--input','/tmp/bb-'+parent.pid+'-0-0.sock'],'PAEG_PAGED_NATIVE_FIXED_CHILD_ARGUMENTS');
 return{role:'paged-native-backend',proofWorker:true};
}
function checkPins(){for(const [path,digest]of pins){const file=join(modules,path);assert.equal(realpathSync(file),file,'PAEG_PAGED_NATIVE_PIN_ALIAS');assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),digest,'PAEG_PAGED_NATIVE_OFFICIAL_PIN');}}
function childCurrent(expected,parent){
 const actual=nativeProcStatV1(expected.pid);assert.ok(same(actual,expected),'PAEG_PAGED_NATIVE_CHILD_IDENTITY');
 assert.equal(actual.ppid,parent.pid,'PAEG_PAGED_NATIVE_PARENT');assert.equal(actual.pgrp,parent.pgrp,'PAEG_PAGED_NATIVE_GROUP');assert.equal(actual.session,parent.session,'PAEG_PAGED_NATIVE_SESSION');
 assert.equal(readlinkSync('/proc/'+actual.pid+'/exe'),PAGED_NATIVE_PROVER_BINARY_V3,'PAEG_PAGED_NATIVE_EXECUTABLE');
 assert.deepEqual(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(readFileSync('/proc/'+actual.pid+'/status','utf8'))?.slice(1),Array(4).fill(String(process.getuid())),'PAEG_PAGED_NATIVE_UID');
 assert.equal(classifyPagedNativeProverProcessV3(argvFor(actual.pid),PAGED_NATIVE_PROVER_BINARY_V3,{pid:parent.pid,argv:argvFor(parent.pid)})?.proofWorker,true);
 assert.ok(same(actual,nativeProcStatV1(actual.pid)),'PAEG_PAGED_NATIVE_CHILD_IDENTITY');return actual;
}
function socketStat(path){const stat=lstatSync(path,{bigint:true});assert.ok(stat.isSocket()&&stat.uid===BigInt(process.getuid())&&(stat.mode&0o077n)===0n,'PAEG_PAGED_NATIVE_PRIVATE_SOCKET');assert.equal(realpathSync(path),path,'PAEG_PAGED_NATIVE_SOCKET_ALIAS');return stat;}
function retainSdkLifetime(api,parent,binaryFD,binaryIdentity,socketPath,loggerBytes){
 const child=api.backend?.process,socket=api.backend?.socket;
 const row={api,sdkDestroy:api.destroy.bind(api),child,socket,parent,binaryFD,binaryIdentity,socketPath,identity:null,socketIdentity:null,initializing:true,closing:false,close:null,streams:[],socketClosed:false,outputBytes:0,loggerBytes};
 // Retain the actual SDK handle before validation. Cleanup uses this handle,
 // never a PID reconstructed from a failed procfs or executable check.
 owned.set(api,row);
 if(child instanceof ChildProcess){
  child.ref();row.closed=new Promise(resolve=>{row.onClose=(code,signal)=>{row.close={code,signal};resolve(row.close);};child.once('close',row.onClose);});
  for(const stream of [child.stdout,child.stderr])if(stream){stream.on('data',bytes=>{row.outputBytes+=bytes.length;});row.streams.push(stream.closed?Promise.resolve():new Promise(resolve=>stream.once('close',resolve)));}
 }
 if(socket instanceof Socket){row.socketClosed=socket.closed;row.socketClosure=socket.closed?Promise.resolve():new Promise(resolve=>socket.once('close',()=>{row.socketClosed=true;resolve();}));}
 return row;
}
export async function initializePagedNativeProverV3(){
 assert.equal(arguments.length,0);assert.ok(originalWorker(process.argv),'PAEG_PAGED_NATIVE_ORIGINAL_WORKER');assert.deepEqual(process.execArgv,['--max-old-space-size=384']);
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.connected&&process.send,'PAEG_PAGED_NATIVE_IPC_PARENT');
 checkPins();accessSync(PAGED_NATIVE_PROVER_BINARY_V3,constants.X_OK);
 const parent=nativeProcStatV1(process.pid);assert.ok(parent);const socketPath='/tmp/bb-'+process.pid+'-0-0.sock';
 try{lstatSync(socketPath);assert.fail('PAEG_PAGED_NATIVE_SOCKET_MUST_BE_ABSENT');}catch(error){if(error.code!=='ENOENT')throw error;}
 const binaryFD=openSync(PAGED_NATIVE_PROVER_BINARY_V3,constants.O_RDONLY|constants.O_NOFOLLOW),binaryIdentity=fileIdentity(fstatSync(binaryFD,{bigint:true}));
 let api,loggerBytes=0;
 try{
  const kit=await loadOfficialProofLibrariesV1(),mask=process.umask(0o077);
  try{api=await kit.Barretenberg.new({backend:kit.BackendType.NativeUnixSocket,threads:PAGED_NATIVE_PROVER_THREADS_V3,bbPath:PAGED_NATIVE_PROVER_BINARY_V3,skipSrsInit:true,logger:line=>{loggerBytes+=Buffer.byteLength(line,'utf8')+2;}});}finally{process.umask(mask);}
  const row=retainSdkLifetime(api,parent,binaryFD,binaryIdentity,socketPath,()=>loggerBytes);
  const {BarretenbergNativeSocketAsyncBackend}=await import(pathToFileURL(join(modules,'@aztec/bb.js/dest/node/bb_backends/node/native_socket.js')).href);
  assert.ok(api.backend instanceof BarretenbergNativeSocketAsyncBackend,'PAEG_PAGED_NATIVE_OFFICIAL_BACKEND');
  const child=row.child;assert.ok(child instanceof ChildProcess,'PAEG_PAGED_NATIVE_ORIGINAL_CHILD');
  const stat=nativeProcStatV1(child.pid);assert.ok(stat);row.identity=identity(stat);row.socketIdentity=fileIdentity(socketStat(socketPath));childCurrent(stat,parent);
  assert.deepEqual(fileIdentity(statSync('/proc/'+child.pid+'/exe',{bigint:true})),binaryIdentity,'PAEG_PAGED_NATIVE_LOADED_BINARY');
  assert.equal(readFileSync('/proc/'+child.pid+'/environ','utf8').split('\0').find(value=>value.startsWith('HARDWARE_CONCURRENCY=')),'HARDWARE_CONCURRENCY='+PAGED_NATIVE_PROVER_THREADS_V3,'PAEG_PAGED_NATIVE_FIXED_THREADS');
  const socket=row.socket;assert.ok(socket instanceof Socket&&!socket.closed&&!socket.destroyed&&!socket.connecting&&socket.readable&&socket.writable,'PAEG_PAGED_NATIVE_ORIGINAL_SOCKET');
  for(const stream of [child.stdout,child.stderr])assert.ok(stream&&!stream.closed,'PAEG_PAGED_NATIVE_OUTPUT_STREAM');
  row.initializing=false;assertPagedNativeProverCurrentV3(api);return api;
 }catch(error){const retained=api&&owned.has(api);if(retained)try{await destroyPagedNativeProverV3(api);}catch{Object.defineProperty(error,'nativeCleanupFailed',{value:true});}else closeSync(binaryFD);throw error;}
}
export function assertPagedNativeProverCurrentV3(api){
 assert.equal(arguments.length,1);const row=owned.get(api);assert.ok(row&&!row.closing&&!row.initializing,'PAEG_PAGED_NATIVE_ORIGINAL_API');
 assert.ok(outputBytes(row)<=outputLimit,'PAEG_PAGED_NATIVE_OUTPUT_LIMIT');childCurrent(row.identity,row.parent);assert.equal(row.child.exitCode,null);assert.equal(row.child.signalCode,null);
 assert.deepEqual(fileIdentity(fstatSync(row.binaryFD,{bigint:true})),row.binaryIdentity,'PAEG_PAGED_NATIVE_BINARY_FD');assert.deepEqual(fileIdentity(lstatSync(PAGED_NATIVE_PROVER_BINARY_V3,{bigint:true})),row.binaryIdentity,'PAEG_PAGED_NATIVE_BINARY_PATH');
 assert.deepEqual(fileIdentity(socketStat(row.socketPath)),row.socketIdentity,'PAEG_PAGED_NATIVE_SOCKET_CHANGED');checkPins();
}
export async function destroyPagedNativeProverV3(api){
 assert.equal(arguments.length,1);const row=owned.get(api);assert.ok(row&&!row.closing,'PAEG_PAGED_NATIVE_ORIGINAL_API');let refusal;
 if(!row.initializing)try{assertPagedNativeProverCurrentV3(api);}catch(error){refusal=error;}
 row.closing=true;
 try{
  // Validation refusal must still drain the privately retained SDK lifetime.
  // The pinned SDK removes Child listeners synchronously; restore our exact
  // close observer before awaiting, including partial acquisition failures.
  let destruction,destructionError;
  try{destruction=row.sdkDestroy();}catch(error){destructionError=error;}
  finally{if(row.child instanceof ChildProcess&&!row.close&&!row.child.listeners('close').includes(row.onClose))row.child.once('close',row.onClose);}
  try{await destruction;}catch(error){destructionError??=error;}
  await Promise.all([row.closed,row.socketClosure,...row.streams]);if(destructionError)throw destructionError;
  assert.ok(row.child instanceof ChildProcess&&row.socket instanceof Socket,'PAEG_PAGED_NATIVE_ORIGINAL_CHILD');
  assert.ok(row.close&&(row.close.code===0&&row.close.signal===null||row.close.code===null&&row.close.signal==='SIGTERM'),'PAEG_PAGED_NATIVE_CLOSE_REJECTED');assert.equal(nativeProcStatV1(row.child.pid),null,'PAEG_PAGED_NATIVE_CHILD_REMAINED');
  try{assert.ok(row.socketIdentity,'PAEG_PAGED_NATIVE_SOCKET_NOT_AUTHENTICATED');assert.deepEqual(fileIdentity(socketStat(row.socketPath)),row.socketIdentity,'PAEG_PAGED_NATIVE_SOCKET_CHANGED');unlinkSync(row.socketPath);}catch(error){if(error.code!=='ENOENT')throw error;}
  try{lstatSync(row.socketPath);assert.fail('PAEG_PAGED_NATIVE_SOCKET_REMAINED');}catch(error){if(error.code!=='ENOENT')throw error;}
  assert.deepEqual(fileIdentity(fstatSync(row.binaryFD,{bigint:true})),row.binaryIdentity,'PAEG_PAGED_NATIVE_BINARY_FD');checkPins();assert.ok(outputBytes(row)<=outputLimit,'PAEG_PAGED_NATIVE_OUTPUT_LIMIT');if(refusal)throw refusal;
  return Object.freeze({profile:PAGED_NATIVE_PROVER_PROFILE_V3,backend:'NativeUnixSocket',threads:PAGED_NATIVE_PROVER_THREADS_V3,binarySHA256:PAGED_NATIVE_PROVER_BINARY_SHA256_V3,childIdentity:row.identity?Object.freeze({...row.identity}):null,childClose:Object.freeze({...row.close}),outputBytes:outputBytes(row),socketRemoved:true,outputStreamsClosed:true});
 }finally{closeSync(row.binaryFD);owned.delete(api);}
}
/** Sample the original coordinator plus its single fixed backend. Threads
 * share memory and never become additional proof jobs. Missing VmRSS follows
 * the existing original thread/identity guard rather than supplying zero. */
export function pagedNativeProofResourcesV3(pid,history){
 assert.equal(arguments.length,2);assert.ok(history instanceof Map);const coordinator=nativeProcStatV1(pid);let coordinatorRSS=0,nativeBackendRSS=0,liveNativeBackends=0;
 if(coordinator){const prior=history.get('coordinator');if(prior)assert.ok(same(prior,coordinator),'PAEG_PAGED_NATIVE_COORDINATOR_CHANGED');else{assert.ok(originalWorkerCommand(argvFor(pid)),'PAEG_PAGED_NATIVE_ORIGINAL_WORKER');history.set('coordinator',identity(coordinator));}
  const measured=nativeOwnedRSSV1(coordinator);if(measured)coordinatorRSS=measured.rssBytes;
  let children;try{children=readFileSync('/proc/'+pid+'/task/'+pid+'/children','utf8').trim().split(/\s+/).filter(Boolean);}catch(error){if(error.code!=='ENOENT')throw error;children=[];}
  assert.ok(children.length<=1&&children.every(value=>/^[1-9][0-9]*$/.test(value)),'PAEG_PAGED_NATIVE_ONE_BACKEND');
  for(const value of children){const child=nativeProcStatV1(Number(value));if(!child)continue;const previous=history.get(child.pid);if(previous)assert.ok(same(previous,child),'PAEG_PAGED_NATIVE_CHILD_IDENTITY');else{childCurrent(child,coordinator);history.set(child.pid,identity(child));}}
 }
 for(const [key,expected]of history){if(key==='coordinator')continue;const actual=nativeProcStatV1(key);if(!actual)continue;assert.ok(same(actual,expected),'PAEG_PAGED_NATIVE_CHILD_IDENTITY');
  const measured=nativeOwnedRSSV1(expected);if(!measured)continue;nativeBackendRSS+=measured.rssBytes;if(!/[ZX]/.test(measured.stat.state)||(measured.liveThreadCount??0)>0)liveNativeBackends++;
  let descendants;try{descendants=readFileSync('/proc/'+key+'/task/'+key+'/children','utf8').trim();}catch(error){if(error.code!=='ENOENT')throw error;descendants='';}assert.equal(descendants,'','PAEG_PAGED_NATIVE_EXTRA_PRODUCER');
 }
 assert.ok(liveNativeBackends<=1,'PAEG_PAGED_NATIVE_ONE_BACKEND');assert.ok(Number.isSafeInteger(coordinatorRSS+nativeBackendRSS),'PAEG_PAGED_NATIVE_RESOURCE_INTEGER');return{workerRSS:coordinatorRSS+nativeBackendRSS,coordinatorRSS,nativeBackendRSS,liveNativeBackends};
}
