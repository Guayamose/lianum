/** HOST only: execute the actual private clock/finality bodies over explicit
 * inert ports. No Anvil, keys, proof, funding, original F or finality acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {observedNativeValueReceiverSecond} from '../../../../src/chains/shared/health/native-value-observed-clock-v1.mjs';
async function actual(urls){for(const url of urls)try{return await readFile(url,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}throw new Error('HOST_ACTUAL_SOURCE_REQUIRED');}
const clockSource=await actual([new URL('../../../../src/operations/recovery/native-device-local-observed-clock-v1.mjs',import.meta.url),new URL('../ops/native-device-local-observed-clock-v1.mjs',import.meta.url)]);
const runtimeSource=await actual([new URL('../../../../src/chains/evm/runtime/owned-evm-runtime-backend-v1.mjs',import.meta.url),new URL('./owned-evm-runtime-backend-v1.mjs',import.meta.url)]);
const hostAssert={...assert,deepEqual:(a,b,message)=>assert.deepEqual(structuredClone(a),structuredClone(b),message)};
function region(start,end){const a=runtimeSource.indexOf(start),b=runtimeSource.indexOf(end,a);assert.ok(a>=0&&b>a,'HOST_ACTUAL_SOURCE_BOUNDARIES');return runtimeSource.slice(a,b);}
function pairFixture(){
 const events=[],brands=new WeakMap(),state={wall:100000,gate:null};
 function resource(family){const item={metadata:{family},mutationStatus:{busy:false,uncertain:false},lifecycle:[],head:{number:'0x0',hash:family,timestamp:'0x64'},
  async block(){return structuredClone(this.head);},async assertCanonical(head){assert.deepEqual(head,this.head);},async close(options){assert.deepEqual(structuredClone(options),{removeScratch:false});brands.get(item).closed=true;item.lifecycle.push({event:'stopped-owned-process',forced:false});return{stopped:true};}};
  brands.set(item,{family,closed:false});return item;}
 const runtime=resource('receiver'),nativeRuntime=resource('graphNative');
 function owned(item,family){const brand=brands.get(item);assert.ok(brand&&!brand.closed&&brand.family===family,'HOST_ORIGINAL_CLOCK_RESOURCE');}
 const context={assert:hostAssert,Date:{now:()=>state.wall},Object,AggregateError,observedNativeValueReceiverSecond,
  createOwnedNativeEconomicObservedClockPairV2:async()=>({runtime,nativeRuntime}),
  assertOwnedNativeEconomicObservedReceiverV2:item=>owned(item,'receiver'),assertOwnedNativeEconomicObservedGraphRuntimeV2:item=>owned(item,'graphNative'),
  async refreshOwnedNativeEconomicObservedGraphClockV2(item){owned(item,'graphNative');events.push('native');if(state.gate)await state.gate;item.head.timestamp='0x'+BigInt(Math.floor(state.wall/1000)).toString(16);},
  async refreshNativeValueReceiverClock(item){owned(item,'receiver');events.push('receiver');item.head.timestamp='0x'+BigInt(Math.floor(state.wall/1000)).toString(16);},
 };
 const source=clockSource.replace(/^import .*;$/gm,'').replaceAll('export ','');
 const ports=vm.runInNewContext(source+'\n({createOriginalNativeDeviceLocalObservedClocksV1,assertOriginalNativeDeviceLocalObservedClockV1,refreshOriginalNativeDeviceLocalObservedClockV1});',context);
 return {ports,state,events,runtime,nativeRuntime};
}
test('HOST original clock pair binds exact resources, observes native before receiver and revokes before close awaits',async()=>{
 const f=pairFixture(),pair=await f.ports.createOriginalNativeDeviceLocalObservedClocksV1();
 assert.equal(pair.runtime,f.runtime);assert.equal(pair.nativeRuntime,f.nativeRuntime);
 assert.equal(f.ports.assertOriginalNativeDeviceLocalObservedClockV1(pair.clock,{runtime:pair.runtime,nativeRuntime:pair.nativeRuntime}),true);
 for(const clock of [{},{...pair.clock}])assert.throws(()=>f.ports.assertOriginalNativeDeviceLocalObservedClockV1(clock,{runtime:pair.runtime,nativeRuntime:pair.nativeRuntime}),/ORIGINAL_OBSERVED_CLOCK/);
 assert.throws(()=>f.ports.assertOriginalNativeDeviceLocalObservedClockV1(pair.clock,{runtime:pair.nativeRuntime,nativeRuntime:pair.runtime}),/ORIGINAL_REFERENCES/);
 assert.throws(()=>f.ports.refreshOriginalNativeDeviceLocalObservedClockV1(pair.clock,{cutoff:'100'}),/ARITY/);
 assert.throws(()=>f.ports.createOriginalNativeDeviceLocalObservedClocksV1({}),/NO_OPTIONS/);
 f.state.wall=125000;const heads=await f.ports.refreshOriginalNativeDeviceLocalObservedClockV1(pair.clock);
 assert.deepEqual(f.events,['native','receiver']);assert.equal(BigInt(heads.native.timestamp),125n);assert.equal(BigInt(heads.receiver.timestamp),125n);
 f.state.wall=124000;await assert.rejects(f.ports.refreshOriginalNativeDeviceLocalObservedClockV1(pair.clock),/ROLLBACK/);
 const closing=pair.close();assert.throws(()=>f.ports.assertOriginalNativeDeviceLocalObservedClockV1(pair.clock,{runtime:pair.runtime,nativeRuntime:pair.nativeRuntime}),/ORIGINAL_OBSERVED_CLOCK/);
 assert.equal((await closing).originalResourcesStopped,true);assert.equal(pair.close(),closing);
 assert.equal(pair.runtime.lifecycle.length,1);assert.equal(pair.nativeRuntime.lifecycle.length,1);
});
function finalityFixture(observed,{alterPrepared=false,failAudit=false,closeWaiting=false,stalledWall=false,auditMilliseconds=0}={}){
 const events=[],state={now:0,wall:100000,alive:true,broadcasts:1,keys:1,health:0,started:null};
 const hash=n=>'0x'+String(n).padStart(64,'0');
 const genesis={number:'0x0',timestamp:'0x63',hash:hash(0),transactions:[]};
 const included={number:'0x1',timestamp:'0x64',hash:hash(1),parentHash:hash(0),transactions:[hash(999)]};
 const headers=[genesis,included],receipt={status:'0x1',blockNumber:'0x1',blockHash:hash(1),transactionIndex:'0x0'};
 const entry={prepared:{profile:'HOST_NATIVE_PROFILE',head:{number:'0x0',timestamp:'0x63'},binding:{leaseId:'fixed-lease'},transaction:{}},signed:{nativeWire:'0x01',nativeId:hash(999),transactionSHA256:'c'.repeat(64)},transactionHash:hash(999),receipt,gasUsed:'22120',phase:'mined'};
 const files=new Map([['/host/signed-'+hash(999).slice(2)+'.json',Buffer.from(JSON.stringify({schema:'OWNED_EVM_SIGNED_WIRE_V2',prepared:entry.prepared,signed:entry.signed}))],['/host/native-value-prepared-fixed-lease.json',Buffer.from(JSON.stringify({schema:'OWNED_EVM_NATIVE_VALUE_PREPARED_V1',prepared:entry.prepared}))]]);
 const originalRuntime={},family=new WeakMap([[originalRuntime,{}]]);
 const context={assert:hostAssert,Buffer,Object,runtime:originalRuntime,ownedNativeValueFamily:family,nativeValueProfile:{schema:'HOST_NATIVE_PROFILE'},observedEconomicV2:observed,nativeValueOnly:true,busy:true,uncertainMutation:false,observedFinalityV2:null,observedNativeAttemptV2:observed?Object.freeze({started:0,entry}):null,ingressMutationEpoch:0n,lastTimestamp:100n,
  transactions:[entry],entry,cloned:structuredClone,performance:{now:()=>state.now},Date:{now:()=>state.wall},observedNativeValueReceiverSecond,
  assertAlive(){assert.ok(state.alive,'HOST_CLOSED');},async health(){state.health++;events.push('health');state.now+=auditMilliseconds;if(failAudit)state.now+=30000;},
  async signedTransaction(){return structuredClone(entry.signed);},async transaction(){return{type:'0x0',blockHash:receipt.blockHash,blockNumber:receipt.blockNumber,transactionIndex:'0x0'};},async receipt(){return{...receipt,transactionIndex:'0x0'};},
  async checkReceipt(r){assert.deepEqual(r,receipt);if(state.legacyExpire)state.now+=30000;},async assertCanonical(r){assert.deepEqual(r,receipt);return structuredClone(included);},
  async block(){return structuredClone(headers.at(-1));},hex:n=>'0x'+BigInt(n).toString(16),
  async rpc(method,args){assert.equal(method,'eth_getBlockByNumber');const height=args[0]==='finalized'?Math.max(0,headers.length-1-64):Number(BigInt(args[0]));return structuredClone(headers[height]);},
  async mineAt(timestamp){assert.equal(timestamp,context.lastTimestamp+1n);assert.ok(timestamp<=BigInt(Math.floor(state.wall/1000)),'HOST_FUTURE_BLOCK');const previous=headers.at(-1),height=headers.length,next={number:'0x'+height.toString(16),hash:hash(height),parentHash:previous.hash,timestamp:'0x'+timestamp.toString(16),transactions:[]};headers.push(next);context.lastTimestamp=timestamp;events.push('mine-empty');return structuredClone(next);},
  async readFile(path){assert.ok(files.has(path));return files.get(path);},async open(path){return{async writeFile(bytes){files.set(path,Buffer.from(bytes));},async sync(){},async close(){}};},
  join:(...parts)=>parts.join('/'),cwd:'/host',sha:bytes=>String(bytes.length),
  setImmediate(resolve){state.started=resolve;},setTimeout(resolve,ms){assert.equal(ms,25);events.push('observed-wait');state.now+=1000;if(!stalledWall)state.wall+=1000;if(alterPrepared)entry.prepared.head.timestamp='98';if(closeWaiting)state.alive=false;resolve();},
 };
 const body=region('    async function confirmOriginalNativeValueFinality(entry)','    const dispatchNativeValueV1 =');
 const observe=region('    const observeNativeValueOriginal =','    /** Read-only exact-original reconciliation;');
 const ports=vm.runInNewContext(body+observe+'\n({observeNativeValueOriginal,beginOriginalObservedNativeFinalityV2,confirmOriginalNativeValueFinality,waitOriginalObservedNativeSecondV2,read:()=>({busy,uncertainMutation,observedFinalityV2,observedNativeAttemptV2})});',context);
 return {ports,context,state,events,entry,headers,query:{nativeId:hash(999).slice(2),nativeWire:'0x01',transactionSHA256:'c'.repeat(64)}};
}
test('HOST original submitted wire waits64 observed seconds without new key/send; audits, changed bytes and close fail closed',async()=>{
 const f=finalityFixture(true);f.ports.beginOriginalObservedNativeFinalityV2(f.entry);
 assert.equal(f.entry.phase,'mined-finality-pending');assert.equal(f.ports.read().observedFinalityV2.completed,false);
 assert.equal((await f.ports.observeNativeValueOriginal(f.query)).status,'pending');
 f.context.busy=false;f.state.started();await f.ports.read().observedFinalityV2.work;
 assert.equal(f.ports.read().observedFinalityV2.completed,true);assert.equal(f.entry.finalityConfirmation.confirmedEmptyBlocks,64);
 assert.equal(f.events.filter(x=>x==='mine-empty').length,64);assert.ok(f.state.now>=64000);assert.ok(f.state.health>=64);
 assert.equal((await f.ports.observeNativeValueOriginal(f.query)).status,'observed');
 assert.deepEqual([f.state.keys,f.state.broadcasts],[1,1]);assert.equal(f.entry.phase,'mined');
 for(const options of [{alterPrepared:true},{failAudit:true},{closeWaiting:true}]){
  const rejected=finalityFixture(true,options);rejected.ports.beginOriginalObservedNativeFinalityV2(rejected.entry);rejected.context.busy=false;rejected.state.started();await rejected.ports.read().observedFinalityV2.work;
  assert.equal(rejected.ports.read().observedFinalityV2.completed,false);assert.equal(rejected.ports.read().uncertainMutation,true);
  assert.equal(rejected.entry.phase,'mined-finality-unconfirmed');assert.deepEqual([rejected.state.keys,rejected.state.broadcasts],[1,1]);
 }
 const legacy=finalityFixture(false);legacy.state.legacyExpire=true;
 await assert.rejects(legacy.ports.confirmOriginalNativeValueFinality(legacy.entry),/ORIGINAL_FINALITY_UNAVAILABLE/);
 assert.equal(legacy.headers.length,2);assert.equal(legacy.ports.read().uncertainMutation,true);
});

function nextSecondFixture(observed,{advanceAt=1,closeAt=null}={}){
 const state={now:0,wall:100000,alive:true,waits:0};
 const context={assert:hostAssert,observedClock:true,observedEconomicV2:observed,lastTimestamp:100n,
  performance:{now:()=>state.now},Date:{now:()=>state.wall},observedNativeValueReceiverSecond,
  assertAlive(){assert.ok(state.alive,'HOST_CLOSED');},
  setTimeout(resolve,ms){assert.equal(ms,25);state.waits++;state.now+=1000;
   if(state.waits===advanceAt)state.wall+=1000;if(state.waits===closeAt)state.alive=false;resolve();},
 };
 const next=vm.runInNewContext(region('    const nextObservedSecond=async()=>{','    const refreshObservedClock=async()=>{')+'\nnextObservedSecond;',context);
 return {state,next};
}
test('HOST live observed waits share one fixed120s attempt budget; wall stall, late readiness and close never grant finality',async()=>{
 for(const options of [{stalledWall:true},{auditMilliseconds:2000}]){
  const f=finalityFixture(true,options),budget=f.ports.read().observedNativeAttemptV2;
  f.ports.beginOriginalObservedNativeFinalityV2(f.entry);assert.equal(f.ports.read().observedFinalityV2.waitBudget,budget);
  f.context.busy=false;f.state.started();await f.ports.read().observedFinalityV2.work;
  assert.equal(f.ports.read().observedNativeAttemptV2,budget);assert.equal(budget.started,0);
  assert.equal(f.ports.read().observedFinalityV2.completed,false);assert.equal(f.ports.read().uncertainMutation,true);
  assert.equal(f.entry.phase,'mined-finality-unconfirmed');assert.ok(f.entry.finalityConfirmation.confirmedEmptyBlocks<64);
  assert.equal((await f.ports.observeNativeValueOriginal(f.query)).status,'unknown');
  assert.deepEqual([f.state.keys,f.state.broadcasts],[1,1]);assert.ok(f.state.now>=120000&&f.state.now<=122000);
  assert.throws(()=>f.ports.beginOriginalObservedNativeFinalityV2(f.entry),/ORIGINAL_FINALITY_ISSUER/);
  if(options.stalledWall)assert.equal(f.events.filter(x=>x==='mine-empty').length,0);
 }
 const next=nextSecondFixture(true,{advanceAt:null});await assert.rejects(next.next(),/ORIGINAL_WAIT_TIMEOUT/);assert.equal(next.state.waits,120);
 const late=nextSecondFixture(true,{advanceAt:120});await assert.rejects(late.next(),/ORIGINAL_WAIT_TIMEOUT/);
 const inTime=nextSecondFixture(true,{advanceAt:119});assert.equal(await inTime.next(),101n);
 const closed=nextSecondFixture(true,{advanceAt:null,closeAt:1});await assert.rejects(closed.next(),/HOST_CLOSED/);assert.equal(closed.state.waits,1);
 const legacy=nextSecondFixture(false,{advanceAt:122});assert.equal(await legacy.next(),101n);assert.equal(legacy.state.waits,122);
});
