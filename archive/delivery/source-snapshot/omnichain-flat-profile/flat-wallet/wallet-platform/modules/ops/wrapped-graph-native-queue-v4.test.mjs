/** Exact private bootstrap queue source over explicit inert physical entries.
 * No native node, caller-authorized key, source brand or deployment is made. */
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./wrapped-claim-operator-bootstrap-v1.mjs',import.meta.url),'utf8');
const a=source.indexOf('const graphNativeQueuesV4'),b=source.indexOf('async function runtimeEntry(',a);assert.ok(a>0&&b>a);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const api=vm.runInThisContext('(function(assert,freeze,profileCommitment){'+source.slice(a,b)+';return {graphReadV4,graphNativeStateV4,quiesceGraphNativeV4,assertGraphQuiescenceV4,releaseGraphQuiescenceV4};})')(assert,freeze,p=>p.id);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){let live=true;const state={readGeneration:'0',activeReads:0,readsIdle:true};const entry={nativeRuntime:{},profile:{id:'original-profile'},readNativeStateV4:()=>freeze(structuredClone(state))};
 const owner={entries:[entry],live(){assert.equal(live,true,'TEST_ORIGINAL_RUNTIME_DEAD');}};
 return {owner,entry,state,kill(){live=false;},async read(gate){return api.graphReadV4(entry,async()=>{state.readGeneration=String(BigInt(state.readGeneration)+1n);state.activeReads++;state.readsIdle=false;
  try{await gate?.promise;return 'original-result';}finally{state.activeReads--;state.readsIdle=true;state.readGeneration=String(BigInt(state.readGeneration)+1n);}});}};}
test('original graph FIFO drains physical reads and holds later work without sharing results',async()=>{
 const f=fixture(),first=deferred(),later=deferred(),events=[];const active=f.read(first).then(v=>{events.push('first');return v;});await tick();
 const acquiring=api.quiesceGraphNativeV4(f.owner);await tick();assert.deepEqual(events,[]);assert.equal(f.state.activeReads,1);
 const second=f.read(later).then(v=>{events.push('second');return v;});first.resolve();assert.equal(await active,'original-result');const lease=await acquiring;
 api.assertGraphQuiescenceV4(f.owner,lease);const snapshot=api.graphNativeStateV4(f.owner);assert.equal(snapshot[0].state.readsIdle,true);assert.equal(f.state.readGeneration,'2');await tick();assert.deepEqual(events,['first']);
 api.releaseGraphQuiescenceV4(f.owner,lease);await tick();assert.equal(f.state.readGeneration,'3');assert.throws(()=>api.assertGraphQuiescenceV4(f.owner,lease),/NATIVE_NOT_IDLE/);
 later.resolve();assert.equal(await second,'original-result');assert.equal(f.state.readGeneration,'4');assert.throws(()=>api.assertGraphQuiescenceV4(f.owner,lease),/GENERATION_CHANGED/);
 assert.deepEqual(events,['first','second']);assert.deepEqual(snapshot[0].state,{readGeneration:'2',activeReads:0,readsIdle:true});
});
test('graph quiescence tokens are original-owner-bound and cannot be copied or retained after foreign activity',async()=>{
 const f=fixture(),other=fixture(),lease=await api.quiesceGraphNativeV4(f.owner);
 assert.throws(()=>api.assertGraphQuiescenceV4(f.owner,{...lease}),/PRIVATE_QUIESCENCE_REQUIRED/);
 assert.throws(()=>api.releaseGraphQuiescenceV4(other.owner,lease),/PRIVATE_QUIESCENCE_REQUIRED/);
 api.assertGraphQuiescenceV4(f.owner,lease);api.releaseGraphQuiescenceV4(f.owner,lease);api.assertGraphQuiescenceV4(f.owner,lease);
 const next=await api.quiesceGraphNativeV4(f.owner);assert.throws(()=>api.assertGraphQuiescenceV4(f.owner,lease),/GENERATION_CHANGED/);api.releaseGraphQuiescenceV4(f.owner,next);
});
test('failed graph observation drains once without retry and cannot poison later queue release',async()=>{
 const f=fixture();let attempts=0;const failure=api.graphReadV4(f.entry,async()=>{attempts++;throw Error('ORIGINAL_READ_FAILURE');});
 const acquiring=api.quiesceGraphNativeV4(f.owner);await assert.rejects(failure,/ORIGINAL_READ_FAILURE/);const lease=await acquiring;
 api.assertGraphQuiescenceV4(f.owner,lease);api.releaseGraphQuiescenceV4(f.owner,lease);assert.equal(attempts,1);assert.equal(await f.read(),'original-result');
});
test('graph queue acquisition failure releases every already-acquired original queue',async()=>{
 const f=fixture(),gate=deferred(),read=f.read(gate);await tick();const acquiring=api.quiesceGraphNativeV4(f.owner);f.kill();gate.resolve();await read;
 await assert.rejects(acquiring,/RUNTIME_DEAD/);assert.equal(await f.read(),'original-result');
});
