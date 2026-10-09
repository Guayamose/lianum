/** HOST control-boundary cases only. Original function bodies run with
 * explicitly inert ledger/executor fixtures; no proof/send/economy is credited. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
async function actualSource(){
 for(const url of [new URL('../../../src/accounts/authority/native-value-account-authority-v2.mjs',import.meta.url),
   new URL('./native-value-account-authority-v2.mjs',import.meta.url)])
   try{return await readFile(url,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 throw Error('HOST_ORIGINAL_ACCOUNT_SOURCE_REQUIRED');
}
const source=await actualSource();
function body(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const tickSource=body('  async function tickLiveRecovery(lease){','  async function deviceExecution(original)');
function fixture(){
 const row={jobId:'original-ref',nativeOutcome:null,nativeRecoveryLatched:false,nativeBinding:{settleBefore:'800'},
   liveRecoveryArm:{state:'ARMED',armSHA256:'armed-original-consent',nativeBindingSHA256:'original-U',reservationTransactionHash:'same-S',settleBefore:'800',lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'}};
 const lease={closed:false,bridge:Object.freeze({})},calls={recover:0,reconcile:0,writes:0,refresh:0};let head='799',wait=null,readStarted=null,lose=false,wire=null;
 const context={assert,liveRecovery:lease,busy:false,closed:false,cancelled:false,unavailable:false,capturing:false,
   reservationRows:()=>[row],reservationRow:()=>row,exclusive:async f=>f(),healthy:async()=>{},
   refreshOriginalNativeDeviceLocalObservedClockV1:async()=>{calls.refresh++;},
   deviceExecutionOriginal:()=>{},deviceExecutionPublic:async()=>({nativeBindingSHA256:'original-U',reservation:{observation:{transactionHash:'same-S'}},lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'}),
   reader:{read:async()=>{readStarted?.resolve();if(wait)await wait;return{head:{timestamp:head}};},assertCurrent:async()=>{}},
   reservationUpdate:async(id,fields)=>{assert.equal(id,row.jobId);calls.writes++;Object.assign(row,structuredClone(fields));},
   nativeExecution:{recover:async id=>{assert.equal(id,row.jobId);calls.recover++;wire??='original-F-hash';if(lose)throw Error('HOST_LOST_REPLY');return{outcome:'RECOVERED'};},
     reconcile:async id=>{assert.equal(id,row.jobId);calls.reconcile++;assert.equal(wire,'original-F-hash');return{outcome:'RECOVERED'};}},
   retainDeviceTerminal:async(current,result)=>{assert.equal(current,row);row.nativeOutcome=result.outcome;},
   privateFailureDiagnostic:()=>({code:'HOST_UNKNOWN'}),};
 const tick=Function('ctx','"use strict";const {'+Object.keys(context).join(',')+'}=ctx;'+tickSource+';return tickLiveRecovery;')(context);
 return{row,lease,calls,tick,setHead:value=>{head=value;},loseReply:()=>{lose=true;},setWait:value=>{wait=value;},setReadStarted:value=>{readStarted=value;}};
}
test('original live F remains armed before cutoff and does not recover a settled T',async()=>{
 const a=fixture();await a.tick(a.lease);assert.equal(a.calls.recover,0);assert.equal(a.calls.writes,0);assert.equal(a.row.liveRecoveryArm.state,'ARMED');
 a.row.nativeOutcome='FULFILLED';a.setHead('800');await a.tick(a.lease);assert.equal(a.calls.recover,0);assert.equal(a.row.liveRecoveryArm.state,'FULFILLED');
});
test('original durable F latch preserves lost reply; later ticks reconcile the same wire without another recovery',async()=>{
 const a=fixture();a.setHead('800');a.loseReply();await assert.rejects(a.tick(a.lease));
 assert.equal(a.row.nativeRecoveryLatched,true);assert.equal(a.row.liveRecoveryArm.state,'UNKNOWN');assert.equal(a.calls.recover,1);
 await a.tick(a.lease);assert.equal(a.calls.recover,1);assert.equal(a.calls.reconcile,1);assert.equal(a.row.liveRecoveryArm.state,'RECOVERED');
 await a.tick(a.lease);assert.equal(a.calls.recover,1);assert.equal(a.calls.reconcile,1);
});
test('original close fence during fresh read stops admission before F; copied lease has no authority',async()=>{
 const a=fixture(),gate=Promise.withResolvers(),started=Promise.withResolvers();a.setHead('800');a.setWait(gate.promise);a.setReadStarted(started);
 const work=a.tick(a.lease);await started.promise;a.lease.closed=true;gate.resolve();await work;
 assert.equal(a.calls.recover,0);assert.equal(a.calls.writes,0);await assert.rejects(a.tick({...a.lease}));
});
test('original lease close retains and drains admitted completion; copied token is rejected',async()=>{
 const leases=new WeakMap(),accounts=new WeakMap(),cap=Object.freeze({}),account=Object.freeze({}),gate=Promise.withResolvers();
 const row={account,closed:false,completion:null};leases.set(cap,row);accounts.set(account,{tickLiveRecovery:()=>gate.promise});
 const part=body('export function closeDeviceOwnerLiveRecoveryLeaseV1(cap){','export function readDeviceOwnerRecoveryArmTermsV1');
 const factory=Function('assert','liveRecoveryLeases','owned',part.replaceAll('export function','function')+';return{close:closeDeviceOwnerLiveRecoveryLeaseV1,tick:tickDeviceOwnerLiveRecoveryLeaseV1};');
 const actual=factory(assert,leases,accounts);assert.throws(()=>actual.tick({...cap}));
 const admitted=actual.tick(cap),closed=actual.close(cap);assert.equal(row.closed,true);assert.equal(admitted,closed);assert.throws(()=>actual.tick(cap));
 gate.resolve({state:'RECOVERED'});assert.deepEqual(await closed,{state:'RECOVERED'});
});

function armFixture(){
 const bridge=Object.freeze({}),lease={bridge,clock:Object.freeze({}),closed:false};
 const row={jobId:'same-original-job',nativeOutcome:null,nativeRecoveryLatched:false,nativeBinding:{settleBefore:'800'},liveRecoveryArm:null};
 const current={nativeBindingSHA256:'same-original-U',executionSnapshotSHA256:'same-original-snapshot',reservation:{observation:{transactionHash:'same-original-S'}},lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'};
 const calls={writes:0,refresh:0},state={head:'799',fresh:true,refreshHook:null};
 const context={assert,nativeNote:true,recovery:null,wrapped:false,liveRecovery:lease,exclusive:async f=>f(),healthy:async()=>{},continueWork(){},
  refreshOriginalNativeDeviceLocalObservedClockV1:async clock=>{assert.equal(clock,lease.clock);calls.refresh++;state.refreshHook?.();},
  validateDeviceRecoveryArmConsentFreshV1:()=>{assert.ok(state.fresh,'HOST_FRESH_CONSENT_REQUIRED');},
  reservationRow:id=>{assert.equal(id,row.jobId);return row;},deviceExecutionPublic:async(original,r)=>{assert.equal(original,bridge);assert.equal(r,row);return current;},
  originalReservationConsent:(r,c)=>{assert.equal(r,row);assert.equal(c.jobId,row.jobId);},
  deviceRecoveryArmConsentMessageV1:value=>JSON.stringify(value),byteSHA:value=>'HOST_DIGEST:'+value,
  reader:{read:async()=>({head:{timestamp:state.head}})},
  reservationUpdate:async(id,fields)=>{assert.equal(id,row.jobId);calls.writes++;Object.assign(row,structuredClone(fields));},
 };
 const actual=Function('ctx','"use strict";const {'+Object.keys(context).join(',')+'}=ctx;'+body('  function requireLiveRecovery(bridge){','  async function tickLiveRecovery(lease){')+';return{arm:armLiveRecovery,refresh:refreshLiveOperationClock};')(context);
 function consent(action,nonce){return{action,nonce,settleBefore:'800',execution:{reservation:{jobId:row.jobId},nativeBindingSHA256:current.nativeBindingSHA256,
   executionSnapshotSHA256:current.executionSnapshotSHA256,reservationTransactionHash:current.reservation.observation.transactionHash,lossClause:current.lossClause}};}
 return{row,lease,state,calls,actual,run:(action,nonce)=>actual.arm({bridge,action,consent:consent(action,nonce)})};
}
test('original recovery toggle rearms only a disarmed same reservation with a new fresh permission before cutoff',async()=>{
 const f=armFixture(),first=await f.run('ARM_RECOVERY',1);assert.equal(first.state,'ARMED');
 await f.run('DISARM_RECOVERY',2);assert.equal(f.row.liveRecoveryArm.state,'DISARMED');
 const second=await f.run('ARM_RECOVERY',3);assert.equal(second.state,'ARMED');assert.notEqual(second.armSHA256,first.armSHA256);
 assert.equal(f.calls.writes,3);await assert.rejects(f.run('ARM_RECOVERY',4),/ALREADY_ARMED/);assert.equal(f.calls.writes,3);
 for(const altered of ['latch','terminal','binding','cutoff','expired','closed']){
  const rejected=armFixture();await rejected.run('ARM_RECOVERY',1);await rejected.run('DISARM_RECOVERY',2);
  if(altered==='latch')rejected.row.nativeRecoveryLatched=true;
  if(altered==='terminal')rejected.row.nativeOutcome='FULFILLED';
  if(altered==='binding')rejected.row.liveRecoveryArm.reservationTransactionHash='other-S';
  if(altered==='cutoff')rejected.state.refreshHook=()=>{rejected.state.head='800';};
  if(altered==='expired')rejected.state.refreshHook=()=>{rejected.state.fresh=false;};
  if(altered==='closed')rejected.state.refreshHook=()=>{rejected.lease.closed=true;};
  await assert.rejects(rejected.run('ARM_RECOVERY',3));assert.equal(rejected.calls.writes,2);assert.equal(rejected.row.liveRecoveryArm.state,'DISARMED');
 }
});
test('original live operation refresh uses its pair even without ARM and rejects close before admission',async()=>{
 const f=armFixture();assert.equal(f.row.liveRecoveryArm,null);await f.actual.refresh();assert.equal(f.calls.refresh,1);assert.equal(f.calls.writes,0);
 f.state.refreshHook=()=>{f.lease.closed=true;};await assert.rejects(f.actual.refresh(),/ORIGINAL_INSTALLATION/);assert.equal(f.calls.writes,0);
});
