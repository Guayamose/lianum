import {fileURLToPath} from 'node:url';
import {projectRoot} from '@lianum/environment';
import {assertAdoptedSourceGeneration} from '@lianum/proofs/toolchain/current-source-generation';
/** Fixed original I84 V5 official BB5.2 transport. No caller backend, role, path, PID, limits or authority. */
import assert from 'node:assert/strict';
import {ChildProcess} from 'node:child_process';
import {createRequire} from 'node:module';
import {Socket} from 'node:net';
import {accessSync,constants,closeSync,fstatSync,lstatSync,openSync,readFileSync,readlinkSync,readdirSync,realpathSync,statSync,unlinkSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {ROOT,GOLDEN,EXPERIMENT,LIMITS} from '@lianum/proofs/catalog';
import {regular,hash,resources} from '@lianum/proofs/tooling/tooling';
import {nativeProcStatV1} from '@lianum/proofs/host/process-files';
import {observeStandardProofRSSV1} from '@lianum/proofs/jobs/standard-proof-resources-v1';
import {NATIVE_VALUE_LIVE_V2_SPEC,NATIVE_VALUE_LIVE_V2_SOURCE_VERSION,NATIVE_VALUE_LIVE_V2_KEY_SHA256,NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256} from '@lianum/proofs/native-value/metadata/native-value-live-v2-profile';

export const I84_NATIVE_PROFILE_V1='LIANUM_ORIGINAL_I84_V5_NATIVE_UNIX_SOCKET_V1';
export const I84_NATIVE_THREADS_V1=12;
export const I84_NATIVE_BINARY_V1=join(EXPERIMENT,'node_modules/@aztec/bb.js/build/amd64-linux/bb');
export const I84_NATIVE_BINARY_SHA256_V1='5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b';
export const I84_NATIVE_PINS_V1=Object.freeze([
  ['@aztec/bb.js/package.json','709a3a3cbcccb58096d177d3922e3b5e8441cc9d0440dee4f207c293d57e01c2'],
  ['@aztec/bb.js/build/amd64-linux/bb',I84_NATIVE_BINARY_SHA256_V1],
  ['@aztec/bb.js/src/bb_backends/node/native_socket.ts','fa5a96777643988c1cd4aafb9bd99033275f7caa9e8313cac58d39df04daae54'],
  ['@aztec/bb.js/dest/node-cjs/bb_backends/node/native_socket.js','4717f954418316b4fe768e38b4e515fe86d208ee981546ef91bbb2728bd29d73'],
  ['@aztec/bb.js/dest/node-cjs/bb_backends/node/platform.js','e78e62ceda7a577fbdeb7a82c0efa6729920aa8460d2667266210efa5d5e8e2f'],
]);
const owned=new WeakMap();
const chargedOutputBytes=row=>row.outputBytes+row.loggerUpperBoundBytes();
export const I84_NATIVE_LIMITS_V1=Object.freeze({...LIMITS,threads:I84_NATIVE_THREADS_V1});
const same=(a,b)=>a&&b&&a.pid===b.pid&&a.startTimeTicks===b.startTimeTicks&&a.ppid===b.ppid&&a.pgrp===b.pgrp&&a.session===b.session;
const identity=stat=>({...Object.fromEntries(['pid','ppid','pgrp','session','startTimeTicks'].map(name=>[name,stat[name]])),uid:process.getuid()});
const fileIdentity=stat=>['dev','ino','uid','size','mode','nlink','mtimeNs','ctimeNs'].map(name=>[name,stat[name].toString()]);
const argvFor=pid=>readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean);
const WORKER=fileURLToPath(new URL('./native-value-dev-live-v5-worker.mjs',import.meta.url));
const ROLE=fileURLToPath(new URL('./native-value-dev-live-v5-role-process.mjs',import.meta.url));
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function originalI84Worker(argv){return argv.length===4&&argv[0]===process.execPath&&argv[1]===WORKER&&uuid(argv[2])&&uuid(argv[3]);}
function authenticateI84Worker(){
 assert.ok(originalI84Worker(process.argv),'NV2_NATIVE_FIXED_WORKER');assert.deepEqual(process.execArgv,[]);
 assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');
 assert.equal(realpathSync(process.cwd()),ROOT);assert.equal(realpathSync(process.argv[1]),WORKER);
 const lock=JSON.parse(regular(join(ROOT,'.local/proof-workers/active.lock')));
 assert.equal(lock.pid,process.ppid);assert.equal(lock.runId,process.argv[2]);assert.equal(lock.jobId,process.argv[3]);assert.equal(lock.relation,NATIVE_VALUE_LIVE_V2_SPEC.name);
 assert.deepEqual(argvFor(process.ppid),[process.execPath,ROLE,NATIVE_VALUE_LIVE_V2_SPEC.name],'NV2_NATIVE_FIXED_PARENT');
 assert.equal(readlinkSync(`/proc/${process.ppid}/exe`),process.execPath,'NV2_NATIVE_FIXED_PARENT');
 const parent=nativeProcStatV1(process.ppid),worker=nativeProcStatV1(process.pid);assert.ok(parent&&worker);
 assert.equal(worker.ppid,parent.pid);assert.equal(worker.pgrp,parent.pgrp);assert.equal(worker.session,parent.session);
 for(const pid of[parent.pid,worker.pid])assert.deepEqual(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(readFileSync(`/proc/${pid}/status`,'utf8'))?.slice(1),Array(4).fill(String(process.getuid())));
}
export function classifyI84NativeProcessV1(argv,executable,parent=null){
  assert.equal(arguments.length,3);
  // The fixed BB backend owns threads, not another producer process. Any
  // descendant receives the stricter proof classification; it grants nothing.
  if(executable===process.execPath&&originalI84Worker(argv))return{role:'native-value-dev-live-v5-native-coordinator',proofWorker:false};
  if(executable!==I84_NATIVE_BINARY_V1||!parent||!originalI84Worker(parent.argv))return null;
  assert.deepEqual(argv,[I84_NATIVE_BINARY_V1,'msgpack','run','--input',`/tmp/bb-${parent.pid}-0-0.sock`],
    'PW_NATIVE_FIXED_CHILD_ARGUMENTS');
  return{role:'native-value-dev-live-v5-native-backend',proofWorker:true};
}
function assertChild(identityValue,expectedParent){
  const now=nativeProcStatV1(identityValue.pid);assert.ok(same(now,identityValue),'PW_NATIVE_CHILD_IDENTITY_CHANGED');
  assert.equal(now.ppid,expectedParent.pid,'PW_NATIVE_ORIGINAL_PARENT');
  assert.equal(now.pgrp,expectedParent.pgrp,'PW_NATIVE_CHILD_GROUP_CHANGED');
  assert.equal(now.session,expectedParent.session,'PW_NATIVE_CHILD_SESSION_CHANGED');
  assert.equal(readlinkSync(`/proc/${now.pid}/exe`),I84_NATIVE_BINARY_V1,'PW_NATIVE_EXECUTABLE_CHANGED');
  const status=readFileSync(`/proc/${now.pid}/status`,'utf8');
  assert.deepEqual(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status)?.slice(1),Array(4).fill(String(process.getuid())),
    'PW_NATIVE_CHILD_UID_CHANGED');
  assert.equal(classifyI84NativeProcessV1(argvFor(now.pid),I84_NATIVE_BINARY_V1,
    {pid:expectedParent.pid,argv:argvFor(expectedParent.pid)}).proofWorker,true);
  assert.ok(same(now,nativeProcStatV1(now.pid)),'PW_NATIVE_CHILD_IDENTITY_CHANGED');return now;
}
function socketStat(path){const stat=lstatSync(path,{bigint:true});assert.ok(stat.isSocket(),'PW_NATIVE_SOCKET_TYPE');
  assert.equal(stat.uid,BigInt(process.getuid()),'PW_NATIVE_SOCKET_OWNER');
  assert.equal(stat.mode&0o077n,0n,'PW_NATIVE_SOCKET_PRIVATE');assert.equal(realpathSync(path),path,'PW_NATIVE_SOCKET_ALIAS');return stat;}
function pins(){for(const[path,expected]of I84_NATIVE_PINS_V1)
  assert.equal(hash(regular(join(EXPERIMENT,'node_modules',path))),expected,'PW_NATIVE_OFFICIAL_PIN');}
export async function initializeI84NativeV1(bb){
  assert.equal(arguments.length,1);authenticateI84Worker();
  assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');pins();
  try{accessSync(I84_NATIVE_BINARY_V1,constants.X_OK);}catch{throw Error('PW_NATIVE_EXECUTABLE_PERMISSION');}
  const parent=nativeProcStatV1(process.pid);assert.ok(parent);const socketPath=`/tmp/bb-${process.pid}-0-0.sock`;
  try{lstatSync(socketPath);throw Error('PW_NATIVE_SOCKET_MUST_BE_ABSENT');}catch(error){if(error.code!=='ENOENT')throw error;}
  const binaryFD=openSync(I84_NATIVE_BINARY_V1,constants.O_RDONLY|constants.O_NOFOLLOW),binaryIdentity=fileIdentity(fstatSync(binaryFD,{bigint:true}));
  let api,loggerUpperBoundBytes=0;
  try{
    // The fixed worker has one job. Restrict the original child's inherited
    // umask before it binds its socket, and restore this coordinator's mask.
    const originalMask=process.umask(0o077);
    try{api=await bb.Barretenberg.new({backend:bb.BackendType.NativeUnixSocket,threads:I84_NATIVE_THREADS_V1,
      bbPath:I84_NATIVE_BINARY_V1,skipSrsInit:true,logger:line=>{
        // Includes pre-return output too. Readline hides delimiters: charge
        // two bytes per line (LF/CRLF) plus raw capture, never undercount.
        loggerUpperBoundBytes+=Buffer.byteLength(line,'utf8')+2;}});}finally{process.umask(originalMask);}
    const require=createRequire(join(EXPERIMENT,'package.json')),
      {BarretenbergNativeSocketAsyncBackend}=require(join(EXPERIMENT,'node_modules/@aztec/bb.js/dest/node-cjs/bb_backends/node/native_socket.js'));
    assert.ok(api.backend instanceof BarretenbergNativeSocketAsyncBackend,'PW_NATIVE_OFFICIAL_BACKEND');
    const child=api.backend.process;assert.ok(child instanceof ChildProcess,'PW_NATIVE_ORIGINAL_CHILD');child.ref();
    const stat=nativeProcStatV1(child.pid);assert.ok(stat);assertChild(stat,parent);
    assert.deepEqual(fileIdentity(statSync(`/proc/${child.pid}/exe`,{bigint:true})),binaryIdentity,'PW_NATIVE_LOADED_BINARY_CHANGED');
    const env=readFileSync(`/proc/${child.pid}/environ`,'utf8').split('\0').filter(Boolean);
    assert.equal(env.find(value=>value.startsWith('HARDWARE_CONCURRENCY=')),`HARDWARE_CONCURRENCY=${I84_NATIVE_THREADS_V1}`,
      'PW_NATIVE_FIXED_THREADS');
    const socketIdentity=fileIdentity(socketStat(socketPath)),row={api,child,parent,identity:identity(stat),binaryFD,binaryIdentity,socketPath,socketIdentity,
      close:null,closing:false,streams:[],socketClosed:false,outputBytes:0,loggerUpperBoundBytes:()=>loggerUpperBoundBytes};
    row.closed=new Promise(resolve=>{row.onClose=(code,signal)=>{row.close={code,signal};resolve(row.close);};child.once('close',row.onClose);});
    for(const stream of[child.stdout,child.stderr]){assert.ok(stream&&!stream.closed,'PW_NATIVE_ORIGINAL_OUTPUT_STREAM');
      // The fixed sink keeps raw C++ text private; bytes still belong to the
      // same original output limit and are checked before publication.
      stream.on('data',bytes=>{row.outputBytes+=bytes.length;});
      row.streams.push(new Promise(resolve=>stream.once('close',resolve)));}
    const socket=api.backend.socket;
    assert.ok(socket instanceof Socket&&!socket.closed&&!socket.destroyed&&!socket.connecting&&socket.readable&&socket.writable,
      'PW_NATIVE_ORIGINAL_SOCKET_ALREADY_CLOSED');
    row.socketClosure=new Promise(resolve=>socket.once('close',()=>{row.socketClosed=true;resolve();}));
    owned.set(api,row);assertI84NativeCurrentV1(api);return api;
  }catch(error){
    // A retained original API closes through the same owned Child, including
    // refusal. Before capture, a wrong/reused PID never acquires SDK.kill: the
    // original group supervisor retains failed startup closure; no retry.
    if(api&&owned.has(api)){try{await destroyI84NativeV1(api);}catch{}}
    try{closeSync(binaryFD);}catch(closeError){if(closeError.code!=='EBADF')throw closeError;}
    throw error;
  }
}
export function assertI84NativeCurrentV1(api){
  assert.equal(arguments.length,1);const row=owned.get(api);assert.ok(row&&!row.closing,'PW_NATIVE_ORIGINAL_API');
  assert.ok(chargedOutputBytes(row)<=LIMITS.outputBytes,'PW_NATIVE_OUTPUT_LIMIT');
  assertChild(row.identity,row.parent);assert.equal(row.child.exitCode,null);assert.equal(row.child.signalCode,null);
  assert.deepEqual(fileIdentity(fstatSync(row.binaryFD,{bigint:true})),row.binaryIdentity,'PW_NATIVE_BINARY_FD_CHANGED');
  assert.deepEqual(fileIdentity(lstatSync(I84_NATIVE_BINARY_V1,{bigint:true})),row.binaryIdentity,'PW_NATIVE_BINARY_PATH_CHANGED');
  assert.deepEqual(fileIdentity(socketStat(row.socketPath)),row.socketIdentity,'PW_NATIVE_SOCKET_CHANGED');pins();
}
export async function destroyI84NativeV1(api){
  assert.equal(arguments.length,1);const row=owned.get(api);assert.ok(row&&!row.closing,'PW_NATIVE_ORIGINAL_API');
  let refusal=null;try{assertI84NativeCurrentV1(api);}catch(error){refusal=error;}
  // Failed pins/output never become acceptance, but do not skip closure of the
  // still-original child. PID reuse/identity loss cannot acquire a signal.
  const before=nativeProcStatV1(row.identity.pid);
  if(before)assertChild(row.identity,row.parent);
  else assert.ok(row.close,'PW_NATIVE_CLOSE_NOT_OBSERVED');
  row.closing=true;
  // Pinned installed call chain: Barretenberg.destroy -> AsyncApi.destroy ->
  // native_socket.destroy. The last body has NO await, then kill(SIGTERM) and
  // removeAllListeners. Restore close on the retained Child IN THIS STACK,
  // before awaiting either Promise. Stream/socket listeners are separate.
  const destruction=api.destroy();
  assert.equal(row.child.listenerCount('close'),0,'PW_NATIVE_SDK_DESTROY_ORDER_CHANGED');
  if(!row.close)row.child.once('close',row.onClose);
  await destruction;await Promise.all([row.closed,row.socketClosure,...row.streams]);
  try{
    assert.ok(row.close&&(row.close.code===0&&row.close.signal===null||row.close.code===null&&row.close.signal==='SIGTERM'),
      'PW_NATIVE_ORIGINAL_CLOSE_REJECTED');
    assert.equal(nativeProcStatV1(row.identity.pid),null,'PW_NATIVE_CHILD_STILL_PRESENT');
    // Only the same socket actually used by this original child may be removed,
    // and only after its Child.close and output/socket closure were observed.
    try{assert.deepEqual(fileIdentity(socketStat(row.socketPath)),row.socketIdentity,'PW_NATIVE_SOCKET_CHANGED');unlinkSync(row.socketPath);}
    catch(error){if(error.code!=='ENOENT')throw error;}
    try{lstatSync(row.socketPath);throw Error('PW_NATIVE_SOCKET_STILL_PRESENT');}catch(error){if(error.code!=='ENOENT')throw error;}
    assert.deepEqual(fileIdentity(fstatSync(row.binaryFD,{bigint:true})),row.binaryIdentity,'PW_NATIVE_BINARY_FD_CHANGED');pins();
    assert.ok(chargedOutputBytes(row)<=LIMITS.outputBytes,'PW_NATIVE_OUTPUT_LIMIT');
    if(refusal)throw refusal;
    return{profile:I84_NATIVE_PROFILE_V1,backend:'NativeUnixSocket',threads:I84_NATIVE_THREADS_V1,
      bbVersion:'5.2.0',binarySHA256:I84_NATIVE_BINARY_SHA256_V1,originalPreparedKeyRequired:true,
      oneEphemeralJob:true,memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',rssLimitBytes:LIMITS.workerRSS,
      childIdentity:row.identity,childClose:row.close,outputBytes:chargedOutputBytes(row),
      outputByteAccounting:'RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND',outputStreamsClosed:true,socketClosed:true,socketRemoved:true};
  }finally{closeSync(row.binaryFD);owned.delete(api);}
}
/** Original monitor inputs only. Native I84 memory remains inside the SAME3GiB;
 * a missing leader VmRSS cannot hide live thread memory (shared original RSS).
 * history is retained privately by run-bounded, never caller request data. */
export function nativeI84ResourcesV1(child,history){
  assert.equal(arguments.length,2);assert.ok(child instanceof ChildProcess,'NV2_NATIVE_ORIGINAL_COORDINATOR');assert.ok(history instanceof Map);
  const pid=child.pid,sample=resources(),worker=nativeProcStatV1(pid);
  let coordinatorRSS=0,nativeBackendRSS=0;
  if(worker){const prior=history.get('coordinator');if(prior)assert.ok(same(prior,worker),'PW_NATIVE_COORDINATOR_CHANGED');
    else{assert.equal(worker.ppid,process.pid,'NV2_NATIVE_ORIGINAL_COORDINATOR');
      assert.deepEqual(child.spawnargs,argvFor(pid),'NV2_NATIVE_COORDINATOR_ARGUMENTS');
      const parent=nativeProcStatV1(process.pid);assert.ok(parent);
      assert.equal(worker.pgrp,parent.pgrp,'NV2_NATIVE_COORDINATOR_GROUP');assert.equal(worker.session,parent.session,'NV2_NATIVE_COORDINATOR_SESSION');
      assert.ok(originalI84Worker(argvFor(pid)),'PW_NATIVE_ORIGINAL_PARENT');history.set('coordinator',identity(worker));}
    const measured=observeStandardProofRSSV1(history.get('coordinator'),{readFileSync,readdirSync});if(measured)coordinatorRSS=measured.rssBytes;
    const processes=readdirSync('/proc').filter(name=>/^[1-9]\d*$/.test(name)).map(name=>nativeProcStatV1(Number(name))).filter(Boolean);
    for(const stat of processes){if(stat.ppid!==pid)continue;const previous=history.get(stat.pid);
      if(previous)assert.ok(same(previous,stat),'PW_NATIVE_CHILD_IDENTITY_CHANGED');
      else{assertChild(stat,worker);history.set(stat.pid,identity(stat));}}
    assert.ok(!processes.some(stat=>history.has(stat.ppid)),'PW_NATIVE_EXTRA_PRODUCER_PROCESS');
  }
  let liveNativeBackends=0;const childIdentities=[];
  for(const[key,expected]of history){if(key==='coordinator')continue;childIdentities.push(expected);
    const stat=nativeProcStatV1(key);if(!stat)continue;assert.ok(same(stat,expected),'PW_NATIVE_CHILD_IDENTITY_CHANGED');
    const measured=observeStandardProofRSSV1(expected,{readFileSync,readdirSync});if(!measured)continue;
    if(!/[ZX]/.test(measured.stat.state)||(measured.liveThreadCount??0)>0)liveNativeBackends++;
    nativeBackendRSS+=measured.rssBytes;}
  assert.ok(liveNativeBackends<=1,'PW_NATIVE_ONE_HEAVY_JOB');
  assert.ok(Number.isSafeInteger(coordinatorRSS+nativeBackendRSS),'PW_NATIVE_RESOURCE_INTEGER');
  return{...sample,workerRSS:coordinatorRSS+nativeBackendRSS,coordinatorRSS,nativeBackendRSS,liveNativeBackends,
    nativeChildIdentities:childIdentities,memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD'};
}
/** Framing of original public receipts only; it cannot brand a process/proof. */
export function assertI84NativeReceiptV1(spec,result,resource){
  assert.equal(arguments.length,3);assert.equal(spec,NATIVE_VALUE_LIVE_V2_SPEC,'NV2_NATIVE_ORIGINAL_I84_SPEC');
  assert.equal(result.sourceVersion,NATIVE_VALUE_LIVE_V2_SOURCE_VERSION,'NV2_NATIVE_ORIGINAL_SOURCE');
  assert.equal(result.keySHA256,NATIVE_VALUE_LIVE_V2_KEY_SHA256,'NV2_NATIVE_ORIGINAL_KEY');assert.equal(result.keyManifestSHA256,NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256,'NV2_NATIVE_ORIGINAL_KEY_MANIFEST');
  assert.match(result.runtimePinsSHA256,/^[0-9a-f]{64}$/);assert.equal(resource.runtimePinsSHA256,result.runtimePinsSHA256,'NV2_NATIVE_RUNTIME_PIN_JOIN');
  assert.deepEqual(result.limits,I84_NATIVE_LIMITS_V1);assert.deepEqual(resource.limits,I84_NATIVE_LIMITS_V1);
  assert.equal(result.maximumPages,null,'NV2_NATIVE_NO_WASM_MEMORY_CLAIM');
  assert.equal(result.preparedMaximumPages,65536,'NV2_NATIVE_ORIGINAL_PREPARATION_PAGES');
  assert.deepEqual(result.independentVerification,{backend:'Wasm',threads:1,maximumPages:65536,originalPreparedKeyRequired:true,verifierCRSOnly:true,backendDestroyed:true},'NV2_NATIVE_INDEPENDENT_VERIFY');
  assert.equal(result.threads,I84_NATIVE_THREADS_V1);assert.equal(result.wasmThreadExecution,undefined,'PW_NATIVE_NO_WASM_CLAIM');
  const row=result.nativeBackendExecution;assert.ok(row,'PW_NATIVE_ORIGINAL_CLOSE_REQUIRED');
  const fields=['profile','backend','threads','bbVersion','binarySHA256','originalPreparedKeyRequired','oneEphemeralJob','memoryScope','rssLimitBytes',
    'childIdentity','childClose','outputBytes','outputByteAccounting','outputStreamsClosed','socketClosed','socketRemoved'];
  assert.deepEqual(Object.keys(row).sort(),fields.sort());
  assert.deepEqual(Object.fromEntries(fields.filter(key=>!['childIdentity','childClose','outputBytes'].includes(key)).map(key=>[key,row[key]])),{
    profile:I84_NATIVE_PROFILE_V1,backend:'NativeUnixSocket',threads:I84_NATIVE_THREADS_V1,bbVersion:'5.2.0',
    binarySHA256:I84_NATIVE_BINARY_SHA256_V1,originalPreparedKeyRequired:true,oneEphemeralJob:true,
    memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',rssLimitBytes:LIMITS.workerRSS,
    outputByteAccounting:'RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND',outputStreamsClosed:true,socketClosed:true,socketRemoved:true});
  assert.deepEqual(Object.keys(row.childIdentity).sort(),['pid','ppid','pgrp','session','startTimeTicks','uid'].sort());
  assert.equal(row.childIdentity.uid,process.getuid());
  for(const key of['pid','ppid','pgrp','session'])assert.ok(Number.isSafeInteger(row.childIdentity[key])&&row.childIdentity[key]>1);
  assert.match(row.childIdentity.startTimeTicks,/^\d+$/);
  assert.ok(Number.isSafeInteger(row.outputBytes)&&row.outputBytes>=0&&row.outputBytes<=LIMITS.outputBytes,'PW_NATIVE_OUTPUT_LIMIT');
  assert.deepEqual(Object.keys(row.childClose).sort(),['code','signal']);
  assert.ok(row.childClose.code===0&&row.childClose.signal===null||row.childClose.code===null&&row.childClose.signal==='SIGTERM');
  assert.deepEqual(resource.nativeBackendExecution,row,'PW_NATIVE_GUARD_CLOSE_JOIN');
  assert.equal(resource.nativeMemoryScope,'COORDINATOR_PLUS_NATIVE_CHILD');
  assert.ok(resource.nativeChildIdentities?.some(child=>same(child,row.childIdentity)&&child.uid===row.childIdentity.uid),'PW_NATIVE_GUARD_ORIGINAL_CHILD');
  assert.equal(resource.nativeChildrenGone,true,'PW_NATIVE_GUARD_CHILDREN_NOT_CLOSED');
  assert.ok(Number.isSafeInteger(resource.peakWorkerRSS)&&resource.peakWorkerRSS>=0&&resource.peakWorkerRSS<=LIMITS.workerRSS,'PW_NATIVE_AGGREGATE_RSS_LIMIT');
  return true;
}

/** Actual executable/monitor bytes, additional to the fixed V5 publication,
 * original API/vendor/toolchain/CRS and retained I84 program/key provenance. */
export function nativeI84ExecutionSourcesV1(){
 assert.equal(arguments.length,0);pins();
 const adopted=assertAdoptedSourceGeneration(),expected=new Map(adopted.sourceFiles.map(row=>[row.source,row.sourceSHA256]));
 const sources=["packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-native-execution.mjs", "packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-public-crs.mjs", "packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-worker.mjs", "packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-role-process.mjs", "packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-client.mjs", "packages/backend/src/proving/native-value/tooling/native-value-dev-live-v5-run-bounded.mjs", "packages/backend/src/proving/native-value/tooling/native-value-dev-live-v5-tooling.mjs", "packages/proofs/src/jobs/standard-proof-resources-v1.mjs", "packages/proofs/src/host/process-files.mjs", "tests/integration/native/native-flow-owned-rss-v1.mjs", "tests/integration/native/native-flow-supervisor.mjs", "packages/components/src/resources/private-verifier-crs.mjs"].map(source=>{
  assert.ok(expected.has(source),'NV2_NATIVE_ADOPTED_SOURCE_REQUIRED');
  const bytes=regular(join(projectRoot,source)),sha256=hash(bytes);
  assert.equal(sha256,expected.get(source),'NV2_NATIVE_ADOPTED_SOURCE_CHANGED');
  return{root:'active-source',path:source,bytes:bytes.length,sha256};
 });
 const retainedExecutionResources=I84_NATIVE_PINS_V1.map(([path,expected])=>{
  const physical=join(EXPERIMENT,'node_modules',path);assert.ok(physical.startsWith(GOLDEN+sep),'NV2_NATIVE_SOURCE_LOCATION');
  const bytes=regular(physical);assert.equal(hash(bytes),expected,'NV2_NATIVE_FIXED_PIN');
  return{root:'golden',path:relative(GOLDEN,physical).split(sep).join('/'),bytes:bytes.length,sha256:expected};
 });
 return{format:'LIANUM_I84_ADOPTED_EXECUTION_SOURCES_V2',generation:adopted.generation,sourceSHA256:adopted.sourceSHA256,sources,retainedExecutionResources};
}
