/** Host metadata regressions only. No runtime, binary, gate or proof is started. */
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createTronPrivateLogCapture, TRON_PRIVATE_LOG_PREFIX_BYTES } from '../../../../packages/backend/src/chains/tron/runtime/guarded/tron-private-log-capture-v1.mjs';
import { PRIVATE_RESOURCE_POLICY } from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
import { ROOT, GOLDEN } from '../../../../packages/proofs/src/catalog.mjs';
import { OWNED_TRON_RUNTIME_RELEASE, startFixedOwnedTronDriver } from '../../../../packages/backend/src/chains/tron/transfers/owned-tron-node-driver.mjs';
import { OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1, OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1, assertOwnedTronProductReleaseV1 }
 from '../../../../packages/backend/src/chains/tron/runtime/guarded/tron-product-release-v1.mjs';
import { startFixedOwnedTronProductDriverV1, inspectOwnedTronProductDriverPrerequisitesV1, startFixedOwnedTronFirstErrorPrivateProductDriverV3, inspectOwnedTronFirstErrorPrivateDriverPrerequisitesV3 } from '../../../../packages/backend/src/chains/tron/runtime/guarded/tron-product-node-driver-v1.mjs';
import { startOwnedTronAlignedCandidateChildV1, startOwnedTronAlignedProductChildV1, startOwnedTronFirstErrorPrivateProductChildV3, readOriginalTronProductChildBirthV1 }
 from '../../../../packages/backend/src/chains/tron/runtime/guarded/tron-aligned-child-opener-v1.mjs';
import { assertTronProductSupervisorEvidenceV1 }
 from '../../../../packages/backend/src/chains/tron/runtime/guarded/tron-product-host-scope-v1.mjs';

const originalMain=()=>({pid:process.pid,parent:process.ppid,start:'100',group:process.pid,session:process.pid,state:'S',
 uid:process.getuid(),uids:Array(4).fill(process.getuid()),executable:realpathSync(process.execPath),cwd:ROOT,
 argv:[realpathSync(process.execPath),join(ROOT,'integration/native-wallet-real-acceptance-v1.mjs')]});
function metadata() {
 const main=originalMain(),supervisor={...main,pid:process.ppid,parent:1,start:'90',group:process.ppid,session:process.ppid,
  argv:[main.executable,join(ROOT,'integration/run-native-wallet-real-acceptance-v1.mjs')]};
 const runId='10000000-0000-4000-8000-000000000000';
 return {profileIndex:0,main,supervisor,lock:{format:'NATIVE_WALLET_REAL_ACCEPTANCE_LOCK_V1',pid:supervisor.pid,
  supervisorStartTimeTicks:supervisor.start,runId,attempt:'.local/native-wallet-real-acceptance-v1/attempt-'+runId},
  resources:{format:'NATIVE_WALLET_REAL_ACCEPTANCE_RESOURCES_V1',runId,phase:'running',failure:null,supervisorPID:supervisor.pid,
   workerPID:main.pid,supervisorIdentity:{pid:supervisor.pid,startTimeTicks:supervisor.start,ppid:supervisor.parent,pgrp:supervisor.group,session:supervisor.session},workerIdentity:{pid:main.pid,startTimeTicks:main.start,ppid:main.parent,pgrp:main.group,session:main.session},ownedProcessGroup:main.pid,
   detachedWorker:true,limits:{totalMilliseconds:5400000},publicNetwork:false,hostLimitsChanged:false,resultAccepted:false,resourcePolicy:PRIVATE_RESOURCE_POLICY,proofPhaseTimeoutMilliseconds:600000,
   startedAt:new Date().toISOString()}};
}

test('fixed product gate and arities reject caller profiles before filesystem or process work',async()=>{
 assert.equal(OWNED_TRON_RUNTIME_RELEASE,null);
 assert.equal(OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1,5400000);
 assert.throws(()=>assertOwnedTronProductReleaseV1({deadline:Infinity}),/NO_OPTIONS/);
 if(OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1===null)assert.throws(()=>assertOwnedTronProductReleaseV1(),/SOURCE_REVIEW_REQUIRED/);
 else {assert.equal(assertOwnedTronProductReleaseV1(),OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1);
  const prerequisites=inspectOwnedTronProductDriverPrerequisitesV1();assert.equal(prerequisites.canLaunch,true);
  assert.equal(prerequisites.classification,'REVIEWED_LOCAL_PRODUCT_DRIVER_MATERIAL');assert.equal(prerequisites.productNativeAcceptanceEstablished,false);
  assert.equal(prerequisites.canonicalRuntimeRelease,null);assert.equal(prerequisites.graphAdmissionEstablished,false);assert.equal(prerequisites.creditEstablished,false);}
 for(const factory of [startFixedOwnedTronDriver,startFixedOwnedTronProductDriverV1])
  await assert.rejects(factory({binary:'/caller',deadline:Infinity}),/ZERO_ARGUMENT_FACTORY/);
 for(const opener of [startOwnedTronAlignedCandidateChildV1,startOwnedTronAlignedProductChildV1])
  await assert.rejects(opener('/caller','/caller',new AbortController().signal,{milliseconds:Infinity}),/ARITY/);
 if(OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1===null)await assert.rejects(startOwnedTronAlignedProductChildV1('/caller','/caller',new AbortController().signal),/SOURCE_REVIEW_REQUIRED/);
 assert.throws(()=>readOriginalTronProductChildBirthV1({pid:process.pid}),/ORIGINAL_OPENER_REQUIRED/);
 const original=await readFile(new URL('./tron-candidate-lifetime.mjs',import.meta.url),'utf8');
 assert.match(original,/TRON_CANDIDATE_TOTAL_MILLISECONDS = 300_000/);
});

test('original supervisor joins reject stale birth, UID, group, script, UUID, failure, terminal phase and renewed lifetime',()=>{
 assertTronProductSupervisorEvidenceV1(metadata()); // Synthetic metadata; never a process/capability.
 const mutations=[v=>v.main.uids[2]++,v=>v.main.parent++,v=>v.main.group++,v=>v.supervisor.argv.push('--caller'),
  v=>v.main.argv[1]=join(ROOT,'integration/caller.mjs'),v=>v.lock.supervisorStartTimeTicks='999',
  v=>v.lock.runId='foreign',v=>v.lock.attempt='/caller',v=>v.resources.workerIdentity.startTimeTicks='999',
  v=>v.resources.failure='NATIVE_FOREIGN_LOCK',v=>v.resources.phase='completed',v=>v.resources.resultAccepted=true,
  v=>v.resources.limits.totalMilliseconds++,v=>v.resources.startedAt=new Date(Date.now()-5400001).toISOString(),
  v=>v.resources.hostLimitsChanged=true];
 for(const mutate of mutations){const value=metadata();mutate(value);assert.throws(()=>assertTronProductSupervisorEvidenceV1(value));}
});

test('the real host-guard body rejects foreign or stale proof locks and heavy children; only the same original group can coexist',async()=>{
 const text=await readFile(join(ROOT,'wallet-platform/modules/chain-adapters/guarded/tron-product-host-scope-v1.mjs'),'utf8');
 const start=text.indexOf('export function createTronProductHostGuardV1()');assert.ok(start>=0);
 const body=text.slice(start+'export '.length),main=originalMain(),proof=join(ROOT,'proof-workers/worker.mjs');
 const lockPath='/tmp/synthetic-proof.lock',owner={...main,pid:main.pid+101,parent:main.pid,argv:[main.executable,proof]};
 const scope={main,supervisor:{pid:main.parent,start:'90'},lock:{runId:'10000000-0000-4000-8000-000000000000'},
  profile:{entry:join(ROOT,'integration/run-native-wallet-real-acceptance-v1.mjs'),worker:main.argv[1],local:join(ROOT,'.local/native-wallet-real-acceptance-v1')},files:new Map()};
 function run({currentScope=scope,lock=true,identity=owner,heavy=null}={}) {
  const environment={assert,process,ROOT,GOLDEN,join,basename:path=>path.split('/').at(-1),BUDGET:5400000,
   LOCKS:[[lockPath,'pid']],PROOF_SCRIPTS:new Set([proof]),captureScope:()=>currentScope,
   same:(a,b)=>a&&b&&a.pid===b.pid&&a.start===b.start,assertCapturedScript:()=>{},
   own:row=>{assert.ok(row,'SYNTHETIC_MISSING_IDENTITY');assert.equal(row.uid,process.getuid());assert.deepEqual(row.uids,Array(4).fill(process.getuid()));},
   existsSync:path=>path===lockPath&&lock,regular:()=>Buffer.from(JSON.stringify({pid:owner.pid})),
   lstatSync:()=>({uid:process.getuid()}),readdirSync:path=>path==='/proc'&&heavy?[String(heavy.pid)]:[],
   discover:pid=>heavy&&pid===heavy.pid?{...heavy,heavy:true}:null,
   proc:pid=>pid===owner.pid?identity:pid===main.pid?main:heavy&&pid===heavy.pid?heavy:null,
   script:row=>row?.argv[1]??null,readOriginalTronProductChildBirthV1:()=>{throw Error('SYNTHETIC_NO_ORIGINAL_CHILD');}};
  return vm.runInNewContext('('+body.trim()+')',environment)();
 }
 assert.equal(run().evidence.scope,'ORIGINAL_NATIVE_WALLET_SUPERVISOR'); // No real process admitted.
 assert.throws(()=>run({currentScope:null}),/FOREIGN_OR_STALE_PROOF_LOCK/);
 assert.throws(()=>run({identity:null}));
 assert.throws(()=>run({identity:{...owner,group:owner.pid,session:owner.pid}}),/FOREIGN_OR_STALE_PROOF_LOCK/);
 assert.throws(()=>run({identity:{...owner,uids:[process.getuid(),process.getuid()+1,process.getuid(),process.getuid()]}}));
 const anvil={...owner,pid:owner.pid+1,executable:'/synthetic/anvil',argv:['/synthetic/anvil']};
 assert.equal(run({lock:false,heavy:anvil}).evidence.scope,'ORIGINAL_NATIVE_WALLET_SUPERVISOR');
 const javac={...anvil,executable:'/synthetic/javac',argv:['/synthetic/javac']};
 assert.throws(()=>run({lock:false,heavy:javac}),/PARALLEL_COMPILATION/);
 assert.throws(()=>run({currentScope:null,lock:false,heavy:javac}),/PARALLEL_HEAVY_WORK/);
 assert.throws(()=>run({lock:false,heavy:{...anvil,group:anvil.pid,session:anvil.pid}}),/FOREIGN_HEAVY_WORK/);
 assert.throws(()=>run({currentScope:null,lock:false,heavy:anvil}),/PARALLEL_HEAVY_WORK/);
 // Actual discovery + full proc + guard body against synthetic /proc IO:
 // the real systemd --user case has visible UID4/comm/cmdline but denies exe.
 const from=text.indexOf('function proc(pid)'),to=text.indexOf('function own(row)');
 const helpers=text.slice(from,to);assert.ok(helpers.includes('function discover(pid)'));
 function discoveredGuard({comm='systemd',argv=['/usr/lib/systemd/systemd','--user'],uids=Array(4).fill(process.getuid()),statError=null,targetPID=main.pid+500}={}) {
  const target=targetPID,links=[];
  function stat(pid,name){const f=Array(50).fill('0');Object.assign(f,{0:'S',1:'1',2:String(pid),3:String(pid),19:'100'});return pid+' ('+name+') '+f.join(' ');}
  const environment={assert,process,ROOT,GOLDEN,join,resolve:(...v)=>v.join('/'),basename:path=>path.split('/').at(-1),BUDGET:5400000,
   LOCKS:[],PROOF_SCRIPTS:new Set([proof]),captureScope:()=>null,same:(a,b)=>a&&b&&a.pid===b.pid&&a.start===b.start,
   own:row=>{assert.equal(row.uid,process.getuid());assert.deepEqual(row.uids,Array(4).fill(process.getuid()));},
   absent:error=>['ENOENT','ESRCH'].includes(error.code),existsSync:()=>false,readdirSync:path=>path==='/proc'?[String(target)]:[],
   lstatSync:()=>({uid:process.getuid()}),readOriginalTronProductChildBirthV1:()=>{throw Error('NO_ORIGINAL_CHILD');},
   readFileSync(path){const pid=Number(path.split('/')[2]);if(pid===target&&statError)throw Object.assign(Error(statError),{code:statError});
    if(path.endsWith('/stat'))return stat(pid,pid===target?comm:'node');
    if(path.endsWith('/status'))return 'Uid:\t'+(pid===target?uids:Array(4).fill(process.getuid())).join('\t')+'\n';
    if(path.endsWith('/cmdline'))return (pid===target?argv:[main.executable,'/synthetic/ordinary.mjs']).join('\0')+'\0';throw Error('UNEXPECTED_READ');},
   readlinkSync(path){links.push(path);if(Number(path.split('/')[2])===target)throw Object.assign(Error('EACCES'),{code:'EACCES'});
    if(path.endsWith('/exe'))return main.executable;if(path.endsWith('/cwd'))return ROOT;throw Error('UNEXPECTED_LINK');}};
  const actual=vm.runInNewContext('(()=>{'+helpers+';return ('+body.trim()+')();})()',environment);
  return {actual,links,target};
 }
 const systemd=discoveredGuard();assert.equal(systemd.actual.evidence.scope,'EXCLUSIVE_LOCAL_DRIVER_NO_WALLET_AUTHORITY');
 assert.equal(systemd.links.some(path=>path.startsWith('/proc/'+systemd.target+'/')),false);
 assert.equal(discoveredGuard({targetPID:1,uids:[0,0,0,0]}).actual.evidence.scope,'EXCLUSIVE_LOCAL_DRIVER_NO_WALLET_AUTHORITY');
 for(const comm of ['java','javac','anvil','bitcoind','bb','solana-test-val'])
  assert.throws(()=>discoveredGuard({comm,argv:['/synthetic/'+comm]}),error=>error.code==='EACCES');
 assert.throws(()=>discoveredGuard({comm:'java',argv:['/synthetic/java'],uids:[0,0,0,0]}),error=>error.code==='EACCES');
 assert.throws(()=>discoveredGuard({comm:'opaque',argv:['/synthetic/opaque'],statError:'EACCES'}),error=>error.code==='EACCES');
 assert.equal(discoveredGuard({statError:'ENOENT'}).actual.evidence.scope,'EXCLUSIVE_LOCAL_DRIVER_NO_WALLET_AUTHORITY');

});

test('fixed opener and actual terminal cleanup reject caller profiles and preserve scratch/lock on rejected closure',async()=>{
 const text=await readFile(join(ROOT,'wallet-platform/modules/chain-adapters/guarded/tron-aligned-child-opener-v1.mjs'),'utf8');
 assert.match(text,/const CANDIDATE = Object\.freeze\(\{ helper: HELPER, milliseconds: 300_000 \}\)/);
 assert.match(text,/const PRODUCT = Object\.freeze\(\{ helper: HELPER, milliseconds: 90 \* 60 \* 1000 \}\)/);
 const from=text.indexOf('async function startAlignedChild('),to=text.indexOf('export async function startOwnedTronAlignedCandidateChildV1(');
 const body=text.slice(from,to);let spawned=false;
 const actual=vm.runInNewContext('('+body.trim()+')',{assert,AbortSignal,process,CANDIDATE:{},PRODUCT:{},FIRST_ERROR_PRODUCT:{},spawn(){spawned=true;throw Error('CALLER_MUST_NOT_SPAWN');}});
 await assert.rejects(actual('/caller','/caller',new AbortController().signal,{helper:'/caller',milliseconds:Infinity}),/FIXED_OPENER_PROFILE/);
 assert.equal(spawned,false);
 // Execute the actual finish body with metadata-only IO. No child is created.
 const driver=await readFile(join(ROOT,'wallet-platform/modules/chain-adapters/guarded/tron-product-node-driver-v1.mjs'),'utf8');
 const finish=driver.slice(driver.indexOf(' async function finish()'),driver.indexOf(' const close=()=>')).trim();
 assert.ok(finish.startsWith('async function finish()'));
 async function runFinish(code,receipt,{attempted=true,hasOriginal=true,startup=false}={}) {
  const calls=[],base='/synthetic/base',directory=base+'/scratch-owned',audit='/synthetic/audit';
  const environment={assert,join,BASE:base,directory,audit,runId:'synthetic',openerAttempted:attempted,
   original:hasOriginal?{close:async()=>receipt}:undefined,startupCleanup:startup?receipt:undefined,
   sourceBefore:{unchanged:true},scratchRemoved:false,lock:{synthetic:true},closed:false,
   privateDirectory:async()=>calls.push('validate-directory'),rm:async()=>calls.push('remove-scratch'),
   captureTronProductSourcePinsV1:()=>({unchanged:true}),publish:async(path)=>calls.push(path.split('/').at(-1)),
   releaseLock:async()=>{calls.push('release-lock');environment.lock=null;},lifetime:{finish:()=>calls.push('lifetime-finish')}};
  let result,error;try{result=await vm.runInNewContext('('+code+')',environment)();}catch(value){error=value;}
  return {calls,result,error,lockRetained:Boolean(environment.lock)};
 }
 const accepted={stopped:true,forced:false,exitCode:0,signal:null};
 const checks="if(original||openerAttempted||startupCleanup){assert.equal(cleanup.forced,false,'TRON_PRODUCT_FORCED_NATIVE_STOP');assert.equal(cleanup.exitCode,0,'TRON_PRODUCT_NATIVE_EXIT_FAILED');assert.equal(cleanup.signal,null,'TRON_PRODUCT_NATIVE_SIGNAL');}";
 assert.ok(finish.includes(checks));
 // Reconstruct the old misplaced check: this reproduces publication/release
 // before a forced stop rejects. The fixed body must retain both resources.
 const misplaced=finish.replace(checks,'').replace('if(lock)await releaseLock();','if(lock)await releaseLock();'+checks);
 const old=await runFinish(misplaced,{...accepted,forced:true});
 assert.match(old.error.message,/FORCED_NATIVE_STOP/);assert.ok(old.calls.includes('cleanup.json'));assert.ok(old.calls.includes('release-lock'));
 for(const receipt of [{...accepted,forced:true},{...accepted,exitCode:1},{...accepted,signal:'SIGTERM'},{stopped:false}]) {
  for(const hasOriginal of [true,false]) {
   const checked=await runFinish(finish,receipt,{hasOriginal,startup:!hasOriginal});
   assert.ok(checked.error);assert.equal(checked.lockRetained,true);
   assert.equal(checked.calls.includes('remove-scratch'),false);assert.equal(checked.calls.includes('cleanup.json'),false);
   assert.equal(checked.calls.includes('release-lock'),false);assert.ok(checked.calls.includes('cleanup-rejected.json'));
  }
 }
 const unknown=await runFinish(finish,undefined,{hasOriginal:false});
 assert.match(unknown.error.message,/CLEANUP_UNCONFIRMED/);assert.equal(unknown.error.productCleanup.originalChildSpawned,null);
 assert.equal(unknown.lockRetained,true);assert.equal(unknown.calls.includes('remove-scratch'),false);
 const good=await runFinish(finish,accepted);assert.equal(good.error,undefined);assert.equal(good.result.stopped,true);
 assert.equal(good.lockRetained,false);assert.ok(good.calls.indexOf('cleanup.json')<good.calls.indexOf('release-lock'));
 const neverAttempted=await runFinish(finish,undefined,{attempted:false,hasOriginal:false});
 assert.equal(neverAttempted.error,undefined);assert.equal(neverAttempted.result.originalChildSpawned,false);
});

// Compile/material joins only: this test reads the authentic fixed compiler
// outputs and rejects caller options; no Java runtime is started.
test('safe first-error derivative uses only genuine v4 build material and retains v2 provenance',async()=>{
 const {inspectOwnedTronFirstErrorPrivateMaterialV3}=await import('../../../../packages/backend/src/chains/tron/runtime/guarded/tron-first-error-private-material-v3.mjs');
 await assert.rejects(inspectOwnedTronFirstErrorPrivateMaterialV3({buildReportSHA256:'f'.repeat(64)}),/NO_OPTIONS/);
 await assert.rejects(startFixedOwnedTronFirstErrorPrivateProductDriverV3({helper:'/caller'}),/ZERO_ARGUMENT_FACTORY/);
 await assert.rejects(startOwnedTronFirstErrorPrivateProductChildV3('/caller','/caller',new AbortController().signal,{helper:'/caller'}),/NO_OPTIONS/);
 const material=await inspectOwnedTronFirstErrorPrivateMaterialV3(),prerequisites=inspectOwnedTronFirstErrorPrivateDriverPrerequisitesV3();
 assert.equal(material.namespace,'reviewed-first-error-private-v4');assert.equal(material.acceptedCandidateReportSHA256,null);
 assert.equal(material.originalCandidateReportSHA256,OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1.acceptedCandidateReportSHA256);
 assert.equal(material.originalAlignedSourceSHA256,'d2f53f3def9995e159587a8c5227a0f8149bf46c0dd673801975f0a9037dffa0');
 assert.equal(material.sourceSHA256,'472a1e6ebef937f966cb4d5b3455bf39c7f007b47bb759e3cac3bd62cc22ee3e');
 assert.equal(material.buildReportSHA256,'50b5e002006824b7dbdfe2732d834bcfc8a37a0982d73c4dc294167dbbbc7d15');
 assert.equal(material.driverSHA256,'2ecbffc99a3703b94328cde0c775d1ea0dfeb70df8a3f6c32df3780478de1c6f');
 assert.equal(material.privateFirstErrorFormat,'LIANUM_TRON_FIRST_ERROR_PRIVATE_V3');
 for(const key of ['derivativeNativeAcceptanceEstablished','graphAdmissionEstablished','privateCreditEstablished'])assert.equal(material[key],false);
 assert.equal(prerequisites.canLaunch,true);assert.equal(prerequisites.canonicalRuntimeRelease,null);
 assert.equal(prerequisites.totalMilliseconds,OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1);
 assert.equal(OWNED_TRON_RUNTIME_RELEASE,null);
});

test('the original runtime fresh journal scan overlaps eight independent reads and drains before original-order failure',async()=>{
 const text=await readFile(join(ROOT,'wallet-platform/modules/chain-adapters/owned-tron-native-value-runtime.mjs'),'utf8');
 const begin=text.indexOf(' async function unchanged()'),end=text.indexOf(' async function append(',begin);
 assert.ok(begin>=0&&end>begin);const code=text.slice(begin,end);
 const journal={binding:{id:'HOST_BINDING'},events:Array.from({length:12},(_,i)=>({sequence:i}))};
 const entry={prepared:{id:'HOST_PREPARED'},signed:{id:'HOST_SIGNED'}};
 const names=['original-binding.json',...journal.events.map((_,i)=>'event-'+String(i).padStart(3,'0')+'.json'),'original-prepared.json','original-signed.json'];
 const first=Error('HOST_ORIGINAL_CHANGED'),later=Error('HOST_LATER_READ_FAILURE');
 async function run({fail=false}={}){
  const calls=[];let active=0,maximum=0,closed=false;
  const actual=vm.runInNewContext('('+code.trim()+')',{live(){assert.equal(closed,false);},journal,entry,
   async readExact(name,expected){assert.ok(expected);calls.push(name);active++;maximum=Math.max(maximum,active);
    await new Promise(resolve=>setImmediate(resolve));active--;
    if(fail&&name===names[0])throw first;if(fail&&name===names[10])throw later;}});
  let error;try{await actual();}catch(value){error=value;}
  assert.equal(active,0);assert.deepEqual(calls,names);assert.equal(maximum,8);
  if(fail){assert.equal(error,first);closed=true;await assert.rejects(actual());assert.equal(calls.length,names.length);}
  else {assert.equal(error,undefined);await actual();assert.deepEqual(calls,[...names,...names]);}
 }
 await run();await run({fail:true});
});

test('fresh original process metadata drains four independent reads between unchanged birth observations',async()=>{
 const text=await readFile(join(ROOT,'wallet-platform/modules/chain-adapters/guarded/tron-aligned-child-opener-v1.mjs'),'utf8');
 const helper=text.slice(text.indexOf('async function freshTronOriginalProcessReadsV1('),text.indexOf('async function hostResources('));
 const body=text.slice(text.indexOf('async function proc(pid)'),text.indexOf('function assertTronAlignedRocksDbStartupIdentity('));
 assert.ok(helper.includes('function originalTronProcessReadV1(')&&body.includes('async function alignedProc('));
 async function run({badUID=false,lateError=false,changedBirth=false}={}){
  const pid=2147483000,base='/proc/'+pid,calls=[];let active=0,maximum=0,statReads=0;
  const later=Object.assign(Error('HOST_LATE_LINK_FAILURE'),{code:'EACCES'});
  function stat(){const fields=Array(26).fill('0');Object.assign(fields,{0:'S',1:String(process.pid),2:String(process.pid),3:String(process.pid),19:changedBirth&&statReads===3?'101':'100',21:'20'});return pid+' (java) '+fields.join(' ');}
  async function delayed(path,value){calls.push(path);active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setImmediate(resolve));active--;return value;}
  const context={assert,process,absent:error=>['ENOENT','ESRCH'].includes(error.code),
   async readFile(path){if(path===base+'/stat'){statReads++;return delayed(path,stat());}
    assert.equal(path,base+'/status');return delayed(path,badUID?'Name:\tjava\n':'Uid:\t'+Array(4).fill(process.getuid()).join('\t')+'\n');},
   lstat:path=>delayed(path,{uid:process.getuid()}),async readlink(path){const value=await delayed(path,'/fixed/jdk8/bin/java');if(lateError)throw later;return value;}};
  const actual=vm.runInNewContext('(()=>{'+helper+body+';return alignedProc;})()',context);
  let row,error;try{row=await actual(pid);}catch(value){error=value;}
  assert.equal(active,0);assert.equal(maximum,4);assert.equal(calls.filter(path=>path===base+'/exe').length,1);
  return {row,error,later,statReads};
 }
 const valid=await run();assert.equal(valid.row.start,'100');assert.deepEqual(Array.from(valid.row.uids),Array(4).fill(process.getuid()));assert.equal(valid.statReads,3);
 const first=await run({badUID:true,lateError:true});assert.match(first.error.message,/STARTUP_UID4_REQUIRED/);assert.notEqual(first.error,first.later);assert.equal(first.statReads,2);
 const changed=await run({changedBirth:true});assert.match(changed.error.message,/STARTUP_BIRTH_CHANGED/);
});

test('each original command waits for the fresh eight-FD audit and preserves socket, missing-FD and first-error guards',async()=>{
 const text=await readFile(join(ROOT,'wallet-platform/modules/chain-adapters/guarded/tron-aligned-child-opener-v1.mjs'),'utf8');
 const helper=text.slice(text.indexOf('async function freshTronOriginalProcessReadsV1('),text.indexOf('async function hostResources('));
 const audit=text.slice(text.indexOf('  async function auditNative()'),text.indexOf('  let interval;',text.indexOf('  async function auditNative()')));
 const command=text.slice(text.indexOf('  async function command(kind,'),text.indexOf('  function close()',text.indexOf('  async function command(kind,')));
 assert.ok(audit.includes('const descriptors=')&&command.includes('await auditNative()'));
 async function run({namedSocket=false,lateError=false}={}){
  const pid=2147483000,names=Array.from({length:12},(_,i)=>String(i)),events=[];let active=0,maximum=0,reads=0,writes=0;
  const later=Object.assign(Error('HOST_LATE_FD_FAILURE'),{code:'EACCES'}),gone=Object.assign(Error('HOST_FD_CLOSED'),{code:'ENOENT'});
  const context={assert,process,Buffer,join,RUNTIME:'/fixed/runtime',directory:'/fixed/private',signal:{aborted:false},hostGuard:null,
   failure:null,exit:null,readySeen:true,pending:undefined,started:Date.now(),profile:{milliseconds:5400000},sampled:false,
   setTimeout,clearTimeout,absent:error=>['ENOENT','ESRCH'].includes(error.code),
   identity:async()=>({executable:'/fixed/runtime/jdk8/bin/java'}),
   async readFile(path){if(path.endsWith('/status'))return 'NoNewPrivs:\t1\nSeccomp:\t2\n';
    assert.ok(path.endsWith('/net/unix'));return 'Num RefCount Protocol Flags Type St Inode Path\n000: 2 0 0 0001 03 1234'+(namedSocket?' /HOST_NAMED_SOCKET':'')+'\n';},
   readdir:async path=>{assert.equal(path,'/proc/'+pid+'/fd');return names;},
   async readlink(path){const name=path.split('/').at(-1);reads++;active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setImmediate(resolve));active--;
    if(name==='3')throw gone;if(lateError&&name==='8')throw later;return name==='0'?'socket:[1234]':'/HOST_REGULAR_FD';},
   hostResources:async()=>{assert.equal(active,0);events.push('resources');},fail(error){context.failure??=error;},
   child:{pid,stdin:{write(line){assert.equal(active,0);assert.equal(reads,(++writes)*names.length);assert.equal(context.sampled,true);events.push('write');context.pending.resolve({ok:true});}}}};
  const actual=vm.runInNewContext('(()=>{'+helper+audit+command+';return {auditNative,command};})()',context);context.auditNative=actual.auditNative;
  let error;try{await actual.command('SOURCEBLOCK',['1']);}catch(value){error=value;}
  assert.equal(active,0);assert.equal(maximum,8);assert.equal(reads,names.length);
  if(namedSocket){assert.match(error.message,/NAMED_SOCKET_FOUND/);assert.notEqual(error,later);assert.deepEqual(events,[]);}
  else {assert.equal(error,undefined);assert.deepEqual(events,['resources','write']);await actual.command('SOURCEBLOCK',['1']);assert.equal(reads,2*names.length);}
 }
 await run();await run({namedSocket:true,lateError:true});
});


// Explicit inert HOST ports for the actual stdout/stderr and command bodies.
// No Java, process, runtime authority, native wire or financial receipt exists.
async function originalTronProtocolHostV1({which='product',ready=true,timedOut=false}={}) {
 const text=await readFile(join(ROOT,'wallet-platform/modules/chain-adapters/guarded/tron-aligned-child-opener-v1.mjs'),'utf8');
 const from=text.indexOf("  child.stderr.on('data', bytes =>"),to=text.indexOf('  const started = Date.now()',from);
 const commandFrom=text.indexOf('  async function command(kind,'),commandTo=text.indexOf('  function close()',commandFrom);
 assert.ok(from>=0&&to>from&&commandFrom>=0&&commandTo>commandFrom);
 const profiles={candidate:Object.freeze({}),product:Object.freeze({}),firstError:Object.freeze({})};
 const callbacks={},resolved=[],rejected=[],writes=[],audits=[],timers=[];
 const context={assert,Buffer,rawStdout:createTronPrivateLogCapture(),stderr:createTronPrivateLogCapture(),
  profile:profiles[which],PRODUCT:profiles.product,FIRST_ERROR_PRODUCT:profiles.firstError,
  readySeen:ready,buffer:'',pending:undefined,failure:undefined,resolveReady:undefined,
  async auditNative(){audits.push('fresh');},
  fail(error){context.failure??=error;context.pending?.reject(error);context.pending=null;},
  setTimeout(callback,milliseconds){assert.equal(milliseconds,10000);timers.push(milliseconds);
   if(timedOut){queueMicrotask(callback);return 'HOST_ORIGINAL_TIMEOUT';}return setTimeout(callback,milliseconds);},
  clearTimeout(timer){if(timer!=='HOST_ORIGINAL_TIMEOUT')clearTimeout(timer);},
  child:{once(){},stdout:{on(event,fn){assert.equal(event,'data');callbacks.stdout=fn;}},
   stderr:{on(event,fn){assert.equal(event,'data');callbacks.stderr=fn;}},
   stdin:{write(line){assert.equal(audits.length,writes.length+1);writes.push(line);
    if(!timedOut)callbacks.stdout(Buffer.from('{"error":"REJECTED_OR_UNKNOWN"}\n'));}}}};
 const actual=vm.runInNewContext('(()=>{'+text.slice(from,to)+text.slice(commandFrom,commandTo)+';return command;})()',context);
 return {context,callbacks,resolved,rejected,writes,audits,timers,command:actual,
  reply(bytes){context.pending={resolve:value=>resolved.push(value),reject:error=>rejected.push(error)};callbacks.stdout(bytes);
   if(context.failure===undefined)context.pending=undefined;},
  snapshot:()=>context.rawStdout.snapshot()};
}
function fillOriginalTronProtocolPrefixV1(host) {
 const frame=Buffer.from(JSON.stringify({kind:'HOST_CHECKED_REPLY',payload:'x'.repeat(2048)})+'\n');
 const count=Math.floor(TRON_PRIVATE_LOG_PREFIX_BYTES/frame.length)+2;
 for(let i=0;i<count;i++){host.reply(frame);if(i===0)assert.equal(host.snapshot().metadata.truncated,false);}
 return {frame,count,bytes:count*frame.length};
}

test('product stdout retains the original one-MiB diagnostic prefix while every later reply keeps the actual protocol guards',async()=>{
 for(const which of ['product','firstError']) {
  const host=await originalTronProtocolHostV1({which}),sent=fillOriginalTronProtocolPrefixV1(host),snapshot=host.snapshot();
  assert.equal(host.context.failure,undefined);assert.equal(host.resolved.length,sent.count);assert.equal(host.rejected.length,0);
  for(const value of host.resolved){assert.equal(value.kind,'HOST_CHECKED_REPLY');assert.equal(value.payload,'x'.repeat(2048));}
  assert.equal(snapshot.bytes.length,TRON_PRIVATE_LOG_PREFIX_BYTES);assert.equal(snapshot.metadata.retainedBytes,TRON_PRIVATE_LOG_PREFIX_BYTES);
  assert.equal(snapshot.metadata.observedBytes,sent.bytes);assert.equal(snapshot.metadata.truncated,true);
  const expected=Buffer.concat(Array(sent.count).fill(sent.frame)).subarray(0,TRON_PRIVATE_LOG_PREFIX_BYTES);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');assert.equal(hash(snapshot.bytes),hash(expected));
 }
 for(const [reply,code] of [[Buffer.from('{bad-json}\n'),'TRON_CANDIDATE_PROTOCOL_JSON'],
  [Buffer.alloc(65537,0x78),'TRON_CANDIDATE_PROTOCOL_BOUND']]) {
  const host=await originalTronProtocolHostV1();fillOriginalTronProtocolPrefixV1(host);host.reply(reply);
  assert.equal(host.context.failure.message,code);assert.equal(host.rejected.at(-1),host.context.failure);
  assert.equal(host.snapshot().bytes.length,TRON_PRIVATE_LOG_PREFIX_BYTES);
 }
 const unsolicited=await originalTronProtocolHostV1();fillOriginalTronProtocolPrefixV1(unsolicited);
 unsolicited.callbacks.stdout(Buffer.from('{}\n'));assert.equal(unsolicited.context.failure.message,'TRON_CANDIDATE_UNSOLICITED_RESPONSE');
 const unknown=await originalTronProtocolHostV1();fillOriginalTronProtocolPrefixV1(unknown);
 await assert.rejects(unknown.command('HEALTH'),/TRON_CANDIDATE_DRIVER_REJECTED_OR_UNKNOWN/);
 assert.equal(unknown.context.failure.message,'TRON_CANDIDATE_DRIVER_REJECTED_OR_UNKNOWN');assert.equal(unknown.writes.length,1);
 await assert.rejects(unknown.command('HEALTH'));assert.equal(unknown.writes.length,1);assert.deepEqual(unknown.timers,[10000]);
 const timed=await originalTronProtocolHostV1({timedOut:true});fillOriginalTronProtocolPrefixV1(timed);
 await assert.rejects(timed.command('HEALTH'),/TRON_CANDIDATE_COMMAND_OUTCOME_UNKNOWN/);
 assert.equal(timed.context.failure.message,'TRON_CANDIDATE_COMMAND_OUTCOME_UNKNOWN');assert.deepEqual(timed.timers,[10000]);
});

test('candidate, pre-ready product and stderr retain the original diagnostic-bound failure',async()=>{
 for(const setup of [{which:'candidate'},{which:'product',ready:false},{which:'firstError',ready:false}]) {
  const host=await originalTronProtocolHostV1(setup);fillOriginalTronProtocolPrefixV1(host);
  assert.equal(host.context.failure.message,'TRON_CANDIDATE_PRIVATE_LOG_BOUND');
  assert.equal(host.snapshot().bytes.length,TRON_PRIVATE_LOG_PREFIX_BYTES);assert.equal(host.snapshot().metadata.truncated,true);
  await assert.rejects(host.command('HEALTH'));assert.equal(host.writes.length,0);assert.equal(host.audits.length,0);
 }
 const stderr=await originalTronProtocolHostV1();stderr.callbacks.stderr(Buffer.alloc(TRON_PRIVATE_LOG_PREFIX_BYTES+1,0x79));
 assert.equal(stderr.context.failure.message,'TRON_CANDIDATE_PRIVATE_LOG_BOUND');
 const retained=stderr.context.stderr.snapshot();assert.equal(retained.bytes.length,TRON_PRIVATE_LOG_PREFIX_BYTES);assert.equal(retained.metadata.observedBytes,TRON_PRIVATE_LOG_PREFIX_BYTES+1);
 await assert.rejects(stderr.command('HEALTH'));assert.equal(stderr.writes.length,0);
});
