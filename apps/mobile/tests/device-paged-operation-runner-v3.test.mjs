/** HOST orchestration checks only. These command ports establish neither
 * SDK authenticity, chain acceptance, proofs nor hardware custody. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runDevicePagedOperationV3} from '../src/api/device-paged-operation-runner-v3.mjs';

const stale=code=>Object.assign(Error('MOBILE_PAGED_GRAPH_MESSAGE'),{code});
const expired='MOBILE_PAGED_GRAPH_STATUS_EXPIRED',future='MOBILE_PAGED_GRAPH_STATUS_FUTURE';
const plan=action=>({type:'next-command',action,command:{},stage:'reserve',completed:'0',total:'1',currentNodeId:'payment'});
const complete=()=>({type:'execution-complete',phase:'FULFILLED',completed:'1',total:'1',currentNodeId:null});
const observation=()=>({type:'private-owner-status',retained:{type:'ack'}});

test('lost effect and proof responses are observed and replanned without replay',async()=>{
 for(const action of ['RESERVE_R','PROVE_R','EXECUTE_NATIVE','PROVE_ADMISSION']){
  const calls=[],progress=[],copies=[];let failed=false,observed=false;
  const result=await runDevicePagedOperationV3({onProgress:value=>progress.push(value.stage),command:async(next,body)=>{
   calls.push(next);
   if(next==='NEXT_COMMAND'){
    assert.ok(!failed||observed,'original custody must accept observation before a new plan');
    const reply=failed?complete():plan(action==='PROVE_ADMISSION'?'EXECUTE_NATIVE':action);copies.push(reply);return reply;
   }
   if(next==='OBSERVE_GRAPH'){assert.ok(failed);observed=true;const reply=observation();copies.push(reply);return reply;}
   if(action==='PROVE_ADMISSION'&&next==='EXECUTE_NATIVE'){
    const reply={type:'native-delivery',delivery:{status:'OBSERVED'},admission:{id:'payment',input:{opening:{value:'100'},amount:'1000000'}}};copies.push(reply);return reply;
   }
   assert.equal(next,action);
   if(next==='PROVE_ADMISSION')assert.deepEqual(body.input,{opening:{value:'100'},amount:'1000000'});
   assert.equal(failed,false);failed=true;throw stale(expired);
  }});
  assert.equal(result.type,'complete');assert.equal(calls.filter(value=>value===action).length,1);
  assert.deepEqual(calls,action==='PROVE_ADMISSION'?['NEXT_COMMAND','EXECUTE_NATIVE','PROVE_ADMISSION','OBSERVE_GRAPH','NEXT_COMMAND']:['NEXT_COMMAND',action,'OBSERVE_GRAPH','NEXT_COMMAND']);
  assert.ok(progress.includes('observe-recovery'));
  for(const copy of copies)assert.equal(copy.type,null,'private reply/plan copies must be wiped');
 }
});

test('lost NEXT_COMMAND reply is observed, and repeated stale observations stop at two',async()=>{
 const calls=[];let first=true;
 const result=await runDevicePagedOperationV3({command:async action=>{
  calls.push(action);
  if(action==='OBSERVE_GRAPH')return observation();
  assert.equal(action,'NEXT_COMMAND');if(first){first=false;throw stale(future);}return complete();
 }});
 assert.equal(result.type,'complete');assert.deepEqual(calls,['NEXT_COMMAND','OBSERVE_GRAPH','NEXT_COMMAND']);
 const bounded=[];
 await assert.rejects(runDevicePagedOperationV3({command:async action=>{bounded.push(action);throw stale(expired);}}),error=>error.code===expired);
 assert.deepEqual(bounded,['NEXT_COMMAND','OBSERVE_GRAPH','OBSERVE_GRAPH']);
});

test('recovery budget spans the whole run and unresolved custody or deadline cannot bypass it',async()=>{
 const calls=[];
 await assert.rejects(runDevicePagedOperationV3({command:async action=>{
  calls.push(action);if(action==='OBSERVE_GRAPH')return observation();throw stale(expired);
 }}),error=>error.code===expired);
 assert.deepEqual(calls,['NEXT_COMMAND','OBSERVE_GRAPH','NEXT_COMMAND','OBSERVE_GRAPH','NEXT_COMMAND']);
 for(const code of ['MOBILE_PAGED_GRAPH_STATUS_DEADLINE','OTHER_ERROR',undefined]){
  const denied=[];const error=stale(code);
  await assert.rejects(runDevicePagedOperationV3({command:async action=>{denied.push(action);throw error;}}),value=>value===error);
  assert.deepEqual(denied,['NEXT_COMMAND']);
 }
 const unresolved=[];let observed=false;
 await assert.rejects(runDevicePagedOperationV3({command:async action=>{
  unresolved.push(action);if(action==='OBSERVE_GRAPH'){observed=true;return observation();}
  if(observed)throw Error('ORIGINAL_CUSTODY_PENDING');throw stale(expired);
 }}),/ORIGINAL_CUSTODY_PENDING/);
 assert.deepEqual(unresolved,['NEXT_COMMAND','OBSERVE_GRAPH','NEXT_COMMAND']);
});


test('activity distinguishes local command wait, recovery and a stopped runner',async()=>{
 const activity=[],calls=[];let release,entered;
 const blocked=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const work=runDevicePagedOperationV3({onActivity:value=>activity.push({...value}),command:async action=>{calls.push(action);entered();await blocked;return complete();}});
 await started;assert.deepEqual(calls,['NEXT_COMMAND']);assert.equal(activity.at(-1).state,'running');assert.equal(activity.at(-1).action,'NEXT_COMMAND');assert.equal(activity.at(-1).completed,'0');release();await work;assert.equal(activity.at(-1).state,'complete');assert.equal(activity.at(-1).completed,'1');
 const stopped=[],failure=Error('ORIGINAL_COMMAND_FAILED');await assert.rejects(runDevicePagedOperationV3({onActivity:value=>stopped.push({...value}),command:async()=>{throw failure;}}),error=>error===failure);assert.equal(stopped.at(-1).state,'stopped');assert.equal(stopped.at(-1).completed,'0');assert.equal(stopped.at(-1).action,null);
});

test('SDK-classified missing replies are observed once without repeating the effect; cancellation stops recovery',async()=>{
 const failure=Error('MOBILE_PAGED_GRAPH_SERVICE_UNAVAILABLE'),originalFailures=new WeakSet([failure]),calls=[];let done=false;
 const result=await runDevicePagedOperationV3({isUnconfirmedReply:error=>originalFailures.has(error),command:async action=>{
  calls.push(action);if(action==='NEXT_COMMAND')return done?complete():plan('EXECUTE_NATIVE');
  if(action==='EXECUTE_NATIVE'){done=true;throw failure;}
  assert.equal(action,'OBSERVE_GRAPH');return observation();
 }});
 assert.equal(result.type,'complete');assert.deepEqual(calls,['NEXT_COMMAND','EXECUTE_NATIVE','OBSERVE_GRAPH','NEXT_COMMAND']);
 const copied=Error(failure.message),denied=[];
 await assert.rejects(runDevicePagedOperationV3({isUnconfirmedReply:error=>originalFailures.has(error),command:async action=>{denied.push(action);throw copied;}}),error=>error===copied);
 assert.deepEqual(denied,['NEXT_COMMAND']);
 const controller=new AbortController(),cancelled=[];
 await assert.rejects(runDevicePagedOperationV3({signal:controller.signal,isUnconfirmedReply:error=>originalFailures.has(error),command:async action=>{cancelled.push(action);controller.abort();throw failure;}}),/MOBILE_PAGED_CANCELLED/);
 assert.deepEqual(cancelled,['NEXT_COMMAND']);
 const exhausted=[];
 await assert.rejects(runDevicePagedOperationV3({isUnconfirmedReply:error=>originalFailures.has(error),command:async action=>{exhausted.push(action);throw failure;}}),error=>error===failure);
 assert.deepEqual(exhausted,['NEXT_COMMAND','OBSERVE_GRAPH','OBSERVE_GRAPH']);
});
