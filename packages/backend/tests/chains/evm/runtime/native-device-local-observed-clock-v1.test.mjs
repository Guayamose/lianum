/** Canonical clock-pair ownership uses real local child processes. Finality
 * mechanics use an explicit virtual clock; no payment, proof or original F. */
import test from 'node:test';
import {rm} from 'node:fs/promises';
import * as originalClocks from '../../../../src/operations/recovery/native-device-local-observed-clock-v1.mjs';
import assert from 'node:assert/strict';
import {observedNativeValueReceiverSecond,assertObservedNativeValueWaitBudgetV2,waitObservedNativeValueNextSecondV1,waitObservedNativeValueTargetV2} from '../../../../src/chains/shared/health/native-value-observed-clock-v1.mjs';
import {confirmNativeValueOriginalFinalityV1} from '../../../../src/chains/evm/runtime/native-original-finality-v1.mjs';
import {observeNativeValueOriginalRecordV1} from '../../../../src/chains/evm/runtime/native-original-observation-v1.mjs';
test('canonical clock pair binds exact processes, rejects copied clocks and revokes before close awaits', {timeout:20000}, async t=>{
 const pair=await originalClocks.createOriginalNativeDeviceLocalObservedClocksV1();
 t.after(async()=>{
  await pair.close();
  for(const runtime of [pair.runtime,pair.nativeRuntime]){
   assert.ok(Number.isSafeInteger(runtime.metadata.processId));
   assert.throws(()=>process.kill(runtime.metadata.processId,0),{code:'ESRCH'});
   await rm(runtime.metadata.scratchDirectory,{recursive:true,force:true});
  }
 });
 const {runtime,nativeRuntime,clock}=pair;
 assert.equal(originalClocks.assertOriginalNativeDeviceLocalObservedClockV1(clock,{runtime,nativeRuntime}),true);
 for(const fake of [{},{...clock}])assert.throws(()=>originalClocks.assertOriginalNativeDeviceLocalObservedClockV1(fake,{runtime,nativeRuntime}),/ORIGINAL_OBSERVED_CLOCK/);
 assert.throws(()=>originalClocks.assertOriginalNativeDeviceLocalObservedClockV1(clock,{runtime:nativeRuntime,nativeRuntime:runtime}),/ORIGINAL_REFERENCES/);
 assert.throws(()=>originalClocks.refreshOriginalNativeDeviceLocalObservedClockV1(clock,{cutoff:'100'}),/ARITY/);
 assert.throws(()=>originalClocks.createOriginalNativeDeviceLocalObservedClocksV1({}),/NO_OPTIONS/);
 const heads=await originalClocks.refreshOriginalNativeDeviceLocalObservedClockV1(clock);
 assert.deepEqual(await nativeRuntime.block(),heads.native);assert.deepEqual(await runtime.block(),heads.receiver);
 assert.ok(BigInt(heads.receiver.timestamp)>=BigInt(heads.native.timestamp));
 assert.ok(BigInt(heads.receiver.timestamp)<=BigInt(Math.floor(Date.now()/1000)));
 const rollback=t.mock.method(Date,'now',()=>Number(BigInt(heads.native.timestamp)-1n)*1000);
 try{await assert.rejects(originalClocks.refreshOriginalNativeDeviceLocalObservedClockV1(clock),/ROLLBACK/);}
 finally{rollback.mock.restore();}
 const closing=pair.close();
 assert.throws(()=>originalClocks.assertOriginalNativeDeviceLocalObservedClockV1(clock,{runtime,nativeRuntime}),/ORIGINAL_OBSERVED_CLOCK/);
 assert.equal((await closing).originalResourcesStopped,true);assert.equal(pair.close(),closing);
 for(const original of [runtime,nativeRuntime])assert.deepEqual(original.lifecycle.filter(row=>row.event==='stopped-owned-process').map(row=>row.forced),[false]);
});
function finalityFixture(observed,{alterPrepared=false,failAudit=false,closeWaiting=false,stalledWall=false,auditMilliseconds=0}={}){
 const events=[],state={now:0,wall:100000,alive:true,health:0,started:null};
 const hash=n=>'0x'+String(n).padStart(64,'0');
 const genesis={number:'0x0',timestamp:'0x63',hash:hash(0),transactions:[]};
 const included={number:'0x1',timestamp:'0x64',hash:hash(1),parentHash:hash(0),transactions:[hash(999)]};
 const headers=[genesis,included],receipt={status:'0x1',blockNumber:'0x1',blockHash:hash(1),transactionIndex:'0x0'};
 const entry={prepared:{profile:'HOST_NATIVE_PROFILE',head:{number:'0x0',timestamp:'0x63'},binding:{leaseId:'fixed-lease'},transaction:{}},signed:{nativeWire:'0x01',nativeId:hash(999),transactionSHA256:'c'.repeat(64)},transactionHash:hash(999),receipt,gasUsed:'22120',phase:'mined'};
 const files=new Map([['/host/signed-'+hash(999).slice(2)+'.json',Buffer.from(JSON.stringify({schema:'OWNED_EVM_SIGNED_WIRE_V2',prepared:entry.prepared,signed:entry.signed}))],['/host/native-value-prepared-fixed-lease.json',Buffer.from(JSON.stringify({schema:'OWNED_EVM_NATIVE_VALUE_PREPARED_V1',prepared:entry.prepared}))]]);
 const context={assert,Buffer,Object,nativeValueProfile:{schema:'HOST_NATIVE_PROFILE'},observedEconomicV2:observed,nativeValueOnly:true,busy:true,uncertainMutation:false,observedFinalityV2:null,observedNativeAttemptV2:observed?Object.freeze({started:0,entry}):null,ingressMutationEpoch:0n,lastTimestamp:100n,
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
 const release=Promise.withResolvers();state.started=()=>release.resolve();
 const records={cwd:'/host',readFile:context.readFile,open:context.open};
 const assertBudget=()=>assertObservedNativeValueWaitBudgetV2(context.observedNativeAttemptV2,state.now);
 const options={observed,records,
  mutation:{
   assertOriginalRecord(value){assert.ok(context.busy&&!context.uncertainMutation);assert.equal(value,entry);},
   assertCurrent(){context.assertAlive();assert.ok(context.busy&&!context.uncertainMutation);},
   assertObservedWaitEntry(value){const budget=assertBudget();assert.equal(budget.entry,value);assert.equal(context.observedFinalityV2.waitBudget,budget);},
   markUncertain(){context.uncertainMutation=true;},
  },
  clock:{monotonicNow:()=>state.now,lastSecond:()=>context.lastTimestamp,
   waitSecond:target=>waitObservedNativeValueTargetV2(target,{lastSecond:()=>context.lastTimestamp,
    assertAlive:context.assertAlive,assertBudget,wallMilliseconds:()=>state.wall,
    delay:ms=>new Promise(resolve=>context.setTimeout(resolve,ms))})},
  chain:{...context,async checkReceipt(value){await context.checkReceipt(value);if(observed)await release.promise;}},
 };
 const ports={
  confirmOriginalNativeValueFinality:value=>confirmNativeValueOriginalFinalityV1(value,options),
  start(){
   const current={entry,waitBudget:assertBudget(),completed:false,failure:null,work:null};context.observedFinalityV2=current;
   current.work=confirmNativeValueOriginalFinalityV1(entry,options).then(()=>{current.completed=true;},error=>{current.failure=error;});
  },
  observeNativeValueOriginal:query=>observeNativeValueOriginalRecordV1(query,{entries:[entry],profile:'HOST_NATIVE_PROFILE',observed,
   finality:()=>context.observedFinalityV2,chain:context,records}),
  read:()=>({busy:context.busy,uncertainMutation:context.uncertainMutation,observedFinalityV2:context.observedFinalityV2,observedNativeAttemptV2:context.observedNativeAttemptV2}),
 };

 return {ports,context,state,events,entry,headers,query:{nativeId:hash(999).slice(2),nativeWire:'0x01',transactionSHA256:'c'.repeat(64)}};
}
test('original-wire finality waits64 observed seconds without new key/send; audits, changed bytes and close fail closed',async()=>{
 const f=finalityFixture(true);f.ports.start();
 assert.equal(f.entry.phase,'mined-finality-pending');assert.equal(f.ports.read().observedFinalityV2.completed,false);
 assert.equal((await f.ports.observeNativeValueOriginal(f.query)).status,'pending');
 f.state.started();await f.ports.read().observedFinalityV2.work;
 assert.equal(f.ports.read().observedFinalityV2.completed,true);assert.equal(f.entry.finalityConfirmation.confirmedEmptyBlocks,64);
 assert.equal(f.events.filter(x=>x==='mine-empty').length,64);assert.ok(f.state.now>=64000);assert.ok(f.state.health>=64);
 assert.equal((await f.ports.observeNativeValueOriginal(f.query)).status,'observed');
 assert.deepEqual(f.headers.flatMap(header=>header.transactions),[f.entry.transactionHash]);assert.equal(f.entry.phase,'mined');
 for(const options of [{alterPrepared:true},{failAudit:true},{closeWaiting:true}]){
  const rejected=finalityFixture(true,options);rejected.ports.start();rejected.state.started();await rejected.ports.read().observedFinalityV2.work;
  assert.equal(rejected.ports.read().observedFinalityV2.completed,false);assert.equal(rejected.ports.read().uncertainMutation,true);
  assert.equal(rejected.entry.phase,'mined-finality-unconfirmed');assert.deepEqual(rejected.headers.flatMap(header=>header.transactions),[rejected.entry.transactionHash]);
 }
 const legacy=finalityFixture(false);legacy.state.legacyExpire=true;
 await assert.rejects(legacy.ports.confirmOriginalNativeValueFinality(legacy.entry),/ORIGINAL_FINALITY_UNAVAILABLE/);
 assert.equal(legacy.headers.length,2);assert.equal(legacy.ports.read().uncertainMutation,true);
});

function nextSecondFixture(observed,{advanceAt=1,closeAt=null}={}){
 const state={now:0,wall:100000,alive:true,waits:0};
 const context={assert,observedClock:true,observedEconomicV2:observed,lastTimestamp:100n,
  performance:{now:()=>state.now},Date:{now:()=>state.wall},observedNativeValueReceiverSecond,
  assertAlive(){assert.ok(state.alive,'HOST_CLOSED');},
  setTimeout(resolve,ms){assert.equal(ms,25);state.waits++;state.now+=1000;
   if(state.waits===advanceAt)state.wall+=1000;if(state.waits===closeAt)state.alive=false;resolve();},
 };
 const next=()=>waitObservedNativeValueNextSecondV1(observed,{lastSecond:()=>context.lastTimestamp,
  assertAlive:context.assertAlive,monotonicNow:()=>state.now,wallMilliseconds:()=>state.wall,
  delay:ms=>new Promise(resolve=>context.setTimeout(resolve,ms))});
 return {state,next};
}
test('observed waits share one fixed120s attempt budget; wall stall, late readiness and close never grant finality',async()=>{
 for(const options of [{stalledWall:true},{auditMilliseconds:2000}]){
  const f=finalityFixture(true,options),budget=f.ports.read().observedNativeAttemptV2;
  f.ports.start();assert.equal(f.ports.read().observedFinalityV2.waitBudget,budget);
  f.state.started();await f.ports.read().observedFinalityV2.work;
  assert.equal(f.ports.read().observedNativeAttemptV2,budget);assert.equal(budget.started,0);
  assert.equal(f.ports.read().observedFinalityV2.completed,false);assert.equal(f.ports.read().uncertainMutation,true);
  assert.equal(f.entry.phase,'mined-finality-unconfirmed');assert.ok(f.entry.finalityConfirmation.confirmedEmptyBlocks<64);
  assert.equal((await f.ports.observeNativeValueOriginal(f.query)).status,'unknown');
  assert.deepEqual(f.headers.flatMap(header=>header.transactions),[f.entry.transactionHash]);assert.ok(f.state.now>=120000&&f.state.now<=122000);
  await assert.rejects(f.ports.confirmOriginalNativeValueFinality(f.entry));
  if(options.stalledWall)assert.equal(f.events.filter(x=>x==='mine-empty').length,0);
 }
 const next=nextSecondFixture(true,{advanceAt:null});await assert.rejects(next.next(),/ORIGINAL_WAIT_TIMEOUT/);assert.equal(next.state.waits,120);
 const late=nextSecondFixture(true,{advanceAt:120});await assert.rejects(late.next(),/ORIGINAL_WAIT_TIMEOUT/);
 const inTime=nextSecondFixture(true,{advanceAt:119});assert.equal(await inTime.next(),101n);
 const closed=nextSecondFixture(true,{advanceAt:null,closeAt:1});await assert.rejects(closed.next(),/HOST_CLOSED/);assert.equal(closed.state.waits,1);
 const legacy=nextSecondFixture(false,{advanceAt:122});assert.equal(await legacy.next(),101n);assert.equal(legacy.state.waits,122);
});
