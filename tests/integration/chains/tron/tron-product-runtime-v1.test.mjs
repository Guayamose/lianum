/** Host metadata regressions only. No runtime, binary, gate or proof is started. */
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVATE_RESOURCE_POLICY } from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
import { ROOT, GOLDEN } from '../../../../packages/proofs/src/catalog.mjs';
import { OWNED_TRON_RUNTIME_RELEASE, startFixedOwnedTronDriver } from '../../../../packages/backend/src/chains/tron/transfers/owned-tron-node-driver.mjs';
import { OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1, OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1, assertOwnedTronProductReleaseV1 }
 from '../../../../packages/backend/src/chains/tron/runtime/guarded/tron-product-release-v1.mjs';
import { startFixedOwnedTronProductDriverV1, inspectOwnedTronProductDriverPrerequisitesV1 } from '../../../../packages/backend/src/chains/tron/runtime/guarded/tron-product-node-driver-v1.mjs';
import { startOwnedTronAlignedCandidateChildV1, startOwnedTronAlignedProductChildV1, readOriginalTronProductChildBirthV1 }
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
});

test('fixed opener and actual terminal cleanup reject caller profiles and preserve scratch/lock on rejected closure',async()=>{
 const text=await readFile(join(ROOT,'wallet-platform/modules/chain-adapters/guarded/tron-aligned-child-opener-v1.mjs'),'utf8');
 assert.match(text,/const CANDIDATE = Object\.freeze\(\{ helper: HELPER, milliseconds: 300_000 \}\)/);
 assert.match(text,/const PRODUCT = Object\.freeze\(\{ helper: HELPER, milliseconds: 90 \* 60 \* 1000 \}\)/);
 const from=text.indexOf('async function startAlignedChild('),to=text.indexOf('export async function startOwnedTronAlignedCandidateChildV1(');
 const body=text.slice(from,to);let spawned=false;
 const actual=vm.runInNewContext('('+body.trim()+')',{assert,AbortSignal,process,CANDIDATE:{},PRODUCT:{},spawn(){spawned=true;throw Error('CALLER_MUST_NOT_SPAWN');}});
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
