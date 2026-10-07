/** Fixed original Java-Tron process ownership. Source-only unreleased candidate.
 * All network/account choices are private; no imported or exported wallet keys.
 * Chain block production is native java-tron consensus, never simulated EVM.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { open,readFile,lstat,realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { startFixedOwnedTronDriver,inspectOwnedTronRuntimePrerequisites } from '../transfers/owned-tron-node-driver.mjs';
import { assertOwnedNativeValueTronDispatchRequest } from '../dispatch/native-value-tron-dispatch-gate.mjs';
import * as WrappedGraphV4 from '../../shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs';
import { OWNED_TRON_NATIVE_VALUE_PROFILE,PROFILE,exact,hex,clone,normalizeBinding,normalizeIntent,prepareOwnedTronNative,assertPreparationCurrent,bindOwnedTronSigned } from '../transfers/owned-tron-native-value-profile.mjs';
import { emptyTronJournal,appendTronEvent,readTronJournal } from '../transfers/owned-tron-native-value-journal.mjs';
const brands=new WeakSet(),sourceOwners=new WeakMap(),wrappedGraphOperationsV4=new WeakMap();
export function readOwnedTronWrappedGraphOperationV4(token,runtime,request){
 assert.equal(arguments.length,3,'WRAPPED_GRAPH_OPERATION_ARITY');const state=wrappedGraphOperationsV4.get(token);
 assert.ok(state&&state.runtime===runtime&&state.request===request,'WRAPPED_GRAPH_ORIGINAL_NATIVE_OPERATION_REQUIRED');return state.read();
}
export function readOwnedLocalTronNativeValueAuditStateV4(runtime) {
 assert.equal(arguments.length,1,'WRAPPED_GRAPH_NATIVE_STATE_ARITY');
 assert.ok(brands.has(runtime),'OWNED_TRON_ORIGINAL_RUNTIME_REQUIRED');
 const owner=sourceOwners.get(runtime);owner.live();return owner.auditStateV4();
}
export const isOwnedLocalTronNativeValueV1=value=>brands.has(value);
export function assertOwnedLocalTronNativeValueRuntimeLive(value){assert.ok(brands.has(value),'OWNED_TRON_ORIGINAL_RUNTIME_REQUIRED');sourceOwners.get(value).live();return undefined;}
export async function assertOwnedLocalTronNativeValueV1(value){assert.ok(brands.has(value),'OWNED_TRON_ORIGINAL_RUNTIME_REQUIRED');return value.health();}
export {inspectOwnedTronRuntimePrerequisites};
export async function createOwnedLocalTronNativeValueV1(){assert.equal(arguments.length,0,'OWNED_TRON_ZERO_ARGUMENT_FACTORY');
 const driver=await startFixedOwnedTronDriver();let runtime,busy=false,closed=false,latched=false,entry=null,journal=null;
 const wrappedGraphObservationsV4=new WeakMap();
 const lifetimeIdV4=randomUUID();let readGenerationV4=0n,activeReadsV4=0,mutationGenerationV4=0n;
 async function auditReadV4(work){readGenerationV4++;activeReadsV4++;try{return await work();}finally{activeReadsV4--;readGenerationV4++;}}
 function auditStateV4(){live();const state=journal?readTronJournal(journal):null;
  return clone({profile:'OWNED_WRAPPED_GRAPH_NATIVE_AUDIT_STATE_V4',family:'TRON',lifetimeId:lifetimeIdV4,genesis:driver.metadata.genesis,
   readGeneration:readGenerationV4.toString(),activeReads:activeReadsV4,readsIdle:activeReadsV4===0,
   mutationGeneration:mutationGenerationV4.toString(),activeMutations:busy?1:0,busy,closed,
   uncertain:latched||Boolean(state?.uncertainty),pending:Boolean(state&&state.phase!=='OBSERVED'),
   adverseHistory:Boolean(state?.adverse),entry,journal});}

 function live(){assert.ok(!closed,'OWNED_TRON_CLOSED');driver.assertAlive();}
 async function readExact(name,expected){live();const path=join(driver.directory,name);assert.equal(await realpath(path),path);
  const stat=await lstat(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o777)===0o600,'OWNED_TRON_JOURNAL_FILE');
  const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{assert.deepEqual(JSON.parse(await f.readFile('utf8')),expected,'OWNED_TRON_JOURNAL_CHANGED');}finally{await f.close();}}
 async function retain(name,value){live();const path=join(driver.directory,name);let f;try{f=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await f.writeFile(JSON.stringify(value));await f.sync();await f.close();f=null;const d=await open(driver.directory,constants.O_RDONLY|constants.O_DIRECTORY);try{await d.sync();}finally{await d.close();}await readExact(name,value);
 }catch(error){latched=true;throw new Error('OWNED_TRON_RETENTION_UNKNOWN_NO_REPLACEMENT',{cause:error});}finally{await f?.close();}}
 async function unchanged(){live();if(journal)await readExact('original-binding.json',journal.binding);if(journal)for(let i=0;i<journal.events.length;i++)await readExact('event-'+String(i).padStart(3,'0')+'.json',journal.events[i]);
  if(entry?.prepared)await readExact('original-prepared.json',entry.prepared);if(entry?.signed)await readExact('original-signed.json',entry.signed);}
 async function append(kind,data){const next=appendTronEvent(journal,kind,data);await unchanged();const e=next.events.at(-1);await retain('event-'+e.sequence.padStart(3,'0')+'.json',e);journal=next;}
 async function current(raw){const originalAuditStartedV4=performance.now();live();assert.ok(entry&&entry.prepared===raw&&entry.active,'OWNED_TRON_ORIGINAL_PREPARATION_REQUIRED');
  await unchanged();const began=performance.now(),snapshot=await driver.current(entry.preparationId);driver.assertAlive();
  assertPreparationCurrent(raw,snapshot,String(Date.now()));assert.ok(performance.now()-began<30000,'OWNED_TRON_NATIVE_CHECK_EXPIRED');wrappedGraphObservationsV4.set(raw,{prepared:raw,started:originalAuditStartedV4});return undefined;}
 async function observe(query){live();exact(query,['nativeId','nativeWire','transactionSHA256']);assert.ok(entry?.signed,'OWNED_TRON_UNKNOWN_ORIGINAL_NO_REPLACEMENT');assert.deepEqual(query,entry.signed,'OWNED_TRON_ORIGINAL_ONLY');
  await unchanged();const state=readTronJournal(journal);assert.ok(!state.adverse,'OWNED_TRON_ADVERSE_LATCHED');
  let observation;try{observation=await driver.observe(query.nativeId);exact(observation,['status','nativeId','nativeWire']);assert.equal(observation.nativeId,query.nativeId);
   assert.ok(['observed','pending','unknown','adverse'].includes(observation.status));assert.equal(observation.nativeWire,observation.status==='observed'?query.nativeWire:null);
  }catch{observation={status:'unknown',nativeId:query.nativeId,nativeWire:null};}
  if(observation.status==='adverse')latched=true;
  // Still perform an actual fresh original read on EVERY pass. Repeating the
  // same non-final observation must not consume the bounded durable history.
  const prior=journal.events.at(-1);if(prior?.kind==='OBSERVATION'&&JSON.stringify(prior.data)===JSON.stringify(observation)){
    await unchanged();return clone(observation);}
  await append('OBSERVATION',observation);return clone(observation);
 }
 runtime=Object.freeze({metadata:clone({...driver.metadata,profile:OWNED_TRON_NATIVE_VALUE_PROFILE,scratchDirectory:driver.directory,publicNetwork:false,graphAdmissionEligible:false,creditEligible:false}),
  accounts:Object.freeze([driver.metadata.solverEndpoint,driver.metadata.recipientEndpoint]),
  async health(){return auditReadV4(async()=>{live();await unchanged();const h=await driver.health();assert.equal(h.genesis,driver.metadata.genesis);return clone(h);});},
  assertNativeValuePreparedCurrent:raw=>auditReadV4(()=>current(raw)),
  async dispatchNativeValueV1(request){live();assert.equal(busy,false,'OWNED_TRON_BUSY');assert.equal(latched,false,'OWNED_TRON_MUTATION_LATCHED');assert.equal(entry,null,'OWNED_TRON_ORIGINAL_REQUEST_ALREADY_CONSUMED');
   // Only the genuine original provider's private one-use scope reaches this
   // opener. No caller callback bundle or copied public metadata is accepted.
   const wrappedV4=WrappedGraphV4.isWrappedClaimGraphDispatchRequestV1(request);
   const scope=assertOwnedNativeValueTronDispatchRequest(request,runtime);exact(scope,['binding','transaction','beforeSign','onSigned','beforeSend']);
   const binding=normalizeBinding(scope.binding),intent=normalizeIntent(scope.transaction);
   assert.equal(binding.genesis,driver.metadata.genesis,'OWNED_TRON_ACTUAL_GENESIS');assert.equal(intent.ownerAddress,driver.metadata.solverEndpoint);assert.equal(intent.recipientAddress,driver.metadata.recipientEndpoint);
   for(const name of ['beforeSign','onSigned','beforeSend'])assert.equal(typeof scope[name],'function');
   busy=true;mutationGenerationV4++;entry={active:true,prepared:null,signed:null,preparationId:null};journal=emptyTronJournal(binding);let cause='persistence';
   let operationV4=null,phaseV4=null;const originalEntry=entry,originalMutationV4=mutationGenerationV4;
   const terminalV4=authority=>{const now=performance.now();for(const [name,started] of [['AUTHORITY',authority.auditStarted],['NATIVE',authority.nativeAuditStarted]]){
    const elapsed=now-started;assert.ok(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<30000,'WRAPPED_GRAPH_'+name+'_TOO_OLD');}};
   const issueOperationV4=()=>{assert.ok(wrappedV4&&operationV4===null&&entry?.prepared,'WRAPPED_GRAPH_FIXED_OPERATION_ISSUER');const prepared=entry.prepared;
    operationV4=Object.freeze({profile:'OWNED_WRAPPED_GRAPH_NATIVE_OPERATION_V4'});wrappedGraphOperationsV4.set(operationV4,{runtime,request,read(){
     live();assert.ok(busy&&!latched&&entry===originalEntry&&entry.active&&entry.prepared===prepared&&mutationGenerationV4===originalMutationV4,'WRAPPED_GRAPH_ORIGINAL_ACTIVE_MUTATION_REQUIRED');
     const current=readTronJournal(journal),expected={'native-key':'KEY_PENDING','provider-key':'SIGNED',send:'SEND_PENDING'}[phaseV4];
     assert.ok(expected&&current.phase===expected&&!current.adverse&&!current.uncertainty,'WRAPPED_GRAPH_ORIGINAL_NATIVE_PHASE_REQUIRED');
     const observed=wrappedGraphObservationsV4.get(prepared);assert.ok(observed?.prepared===prepared,'WRAPPED_GRAPH_ORIGINAL_NATIVE_OBSERVATION_REQUIRED');
     return clone({family:'TRON',profileCommitment:binding.profileCommitment,lifetimeId:lifetimeIdV4,phase:phaseV4,prepared,signed:entry.signed??null,
      nativeAuditStarted:observed.started,physicalState:auditStateV4()});
    }});};
   try{await retain('original-binding.json',binding);const raw=await driver.prepare(intent.amountSun,intent.wireKeyCommitment);exact(raw,['preparationId','snapshot','timestampMs','unsignedWire']);hex(raw.preparationId,32,true);
    entry.preparationId=raw.preparationId;const prepared=prepareOwnedTronNative({binding,intent,snapshot:raw.snapshot,nowMs:raw.timestampMs});assert.equal(raw.unsignedWire,prepared.unsignedWire,'OWNED_TRON_DRIVER_ORIGINAL_ENCODING');
    entry.prepared=prepared;await retain('original-prepared.json',prepared);await append('PREPARED',prepared);await append('KEY_PENDING',null);
    await driver.armKey(entry.preparationId);await current(prepared);cause='native-key';
    // This must run fresh FULL native/source/controller health via the genuine
    // gate. Next async effect is the sole owned child key command. No fs/RPC gap.
    if(wrappedV4){phaseV4='native-key';issueOperationV4();const authority=await scope.beforeSign(prepared,operationV4);
     terminalV4(WrappedGraphV4.consumeWrappedGraphDispatchAuthorityV4(authority,'native-key',operationV4,runtime,prepared,null));
    }else assert.equal(await scope.beforeSign(prepared),undefined,'OWNED_TRON_ASSERT_ONLY');
    const signed=await driver.sign(entry.preparationId,prepared.unsignedWire);
    exact(signed,['nativeWire','nativeId','transactionSHA256']);assert.deepEqual(bindOwnedTronSigned(prepared.transaction,signed.nativeWire),signed);
    cause='persistence';entry.signed=clone(signed);await retain('original-signed.json',signed);await append('SIGNED',signed);
    cause='provider-retention';if(wrappedV4)phaseV4='provider-key';assert.equal(await (wrappedV4?scope.onSigned(clone(signed),operationV4):scope.onSigned(clone(signed))),undefined,'OWNED_TRON_ASSERT_ONLY');
    // Genuine original gate durably retains its exact provider signature; no
    // caller-provided digest or promise can create this acknowledgement.
    await append('PROVIDER_RETAINED',null);await append('SEND_PENDING',null);
    await driver.armSend(entry.preparationId);await current(prepared);cause='original-broadcast';
    // Independent fresh full health is required again, never cached from key.
    if(wrappedV4){phaseV4='send';const authority=await scope.beforeSend(operationV4);
     assert.deepEqual(bindOwnedTronSigned(prepared.transaction,signed.nativeWire),signed);
     terminalV4(WrappedGraphV4.consumeWrappedGraphDispatchAuthorityV4(authority,'send',operationV4,runtime,prepared,entry.signed));
    }else assert.equal(await scope.beforeSend(),undefined,'OWNED_TRON_ASSERT_ONLY');
    const result=await driver.broadcast(entry.preparationId,signed.nativeId,signed.transactionSHA256);
    exact(result,['nativeId','accepted']);assert.equal(result.nativeId,signed.nativeId);assert.equal(result.accepted,true,'OWNED_TRON_NATIVE_REJECTED');
    await append('BROADCAST',{nativeId:signed.nativeId});return clone({nativeId:signed.nativeId,transactionSHA256:signed.transactionSHA256});
   }catch(error){latched=true;if(journal.events.length){try{await append('UNKNOWN',{cause});}catch{}}throw error;}finally{if(operationV4)wrappedGraphOperationsV4.delete(operationV4);entry.active=false;busy=false;}
  },
  async observeNativeValueOriginal(query){assert.equal(busy,false,'OWNED_TRON_BUSY');busy=true;mutationGenerationV4++;try{return await auditReadV4(()=>observe(query));}finally{busy=false;}},
  report(){return clone({profile:OWNED_TRON_NATIVE_VALUE_PROFILE,closed,latched,phase:journal?readTronJournal(journal).phase:'EMPTY',originalOnly:true,publicNetwork:false,creditEligible:false});},
  async close(){assert.equal(busy,false);closed=true;await driver.close();},
  toJSON(){throw new Error('OWNED_TRON_CAPABILITY_NOT_SERIALIZABLE');},
 });brands.add(runtime);sourceOwners.set(runtime,{driver,live,unchanged,auditReadV4,auditStateV4,assertOriginal(original){assert.ok(entry?.signed,'OWNED_TRON_ORIGINAL_SIGNED_REQUIRED');assert.deepEqual(original,entry.signed,'OWNED_TRON_SOURCE_ORIGINAL_REBOUND');}});return runtime;
}

/** Fixed read-only original process port. Public data cannot manufacture this
 * owner. No transport, signer, clock, URL or successful observation is injected. */
export function openOwnedTronOriginalReadPort(nativeRuntime,original){
 assert.ok(brands.has(nativeRuntime),'OWNED_TRON_ORIGINAL_RUNTIME_REQUIRED');const owner=sourceOwners.get(nativeRuntime);owner.live();owner.assertOriginal(original);const driver=owner.driver;
 const read=async(method,args)=>owner.auditReadV4(async()=>{owner.live();owner.assertOriginal(original);await owner.unchanged();const value=await method(...args);owner.live();return clone(value);});
 return Object.freeze({metadata:nativeRuntime.metadata,assertLive:owner.live,
   readBlock:height=>read(driver.readBlock,[height]),readSolidBlock:()=>read(driver.readSolidBlock,[]),
   readTransaction:()=>read(driver.readTransaction,[original.nativeId]),readTransactionInfo:()=>read(driver.readTransactionInfo,[original.nativeId]),
   readReplay:query=>{exact(query,['nativeId','blockId']);assert.equal(query.nativeId,original.nativeId);hex(query.blockId,32,true);return read(driver.readReplay,[query.nativeId,query.blockId]);},
 });
}
