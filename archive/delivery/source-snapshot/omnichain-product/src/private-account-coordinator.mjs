/** Disposable portfolio coordinator. It cannot select nodes, keys or contracts.
 * Its only external effects are fixed keeper capabilities for an authenticated
 * asset registry. Requests are durable before execution and never auto-resent. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PrivateAccountState} from './private-account-state.mjs';
const safe=e=>{const m=/^([A-Z][A-Z0-9_]{1,100})(?:\n|$)/.exec(e?.message??'');return m?.[1]??(/^[A-Z][A-Z0-9_]{1,100}$/.test(e?.code??'')?e.code:'ACCOUNT_OPERATION_FAILED');};
const identifier=()=>randomBytes(16).toString('hex');
export function createPrivateAccountCoordinator({state,host}){
 let busy=false,closed=false;
 const exclusive=async work=>{assert.ok(!closed&&!busy,'ACCOUNT_COORDINATOR_BUSY');busy=true;try{return await work();}finally{busy=false;}};
 async function refresh(){const previous=state.snapshot();try{const observations=await host('snapshot',{previous:{assets:previous.assets,nativeHoldings:previous.nativeHoldings}});await state.observe(observations);}catch(e){await state.unavailable(safe(e));throw e;}return state.snapshot();}
 return Object.freeze({
  snapshot:()=>state.snapshot(),
  refresh:()=>exclusive(refresh),
  prepare:input=>exclusive(async()=>{assert.ok(input&&Object.keys(input).sort().join(',')==='assetId,kind,requestId,terms','ACCOUNT_PREPARE_FIELDS');const old=state.request(input.requestId);const r=await state.prepare({...input,intentId:old?.intentId??identifier(),operationId:old?.operationId??identifier()});if(r.state!=='PREPARED')return{request:r,replayed:true};await host('prepare',{request:r});return{request:r,replayed:Boolean(old)};}),
  execute:requestId=>exclusive(async()=>{let r=state.request(requestId);assert.ok(r,'ACCOUNT_REQUEST_UNKNOWN');if(r.state==='CONFIRMED')return{request:r,replayed:true};assert.equal(r.state,'PREPARED','ACCOUNT_RECONCILE_ORIGINAL_REQUEST');r=await state.mark(requestId,'SUBMITTING');try{await host('execute',{request:r});await refresh();assert.equal(state.hasFreshObservation(r.assetId),true,'ACCOUNT_ASSET_OBSERVATION_REQUIRED');await state.mark(requestId,'CONFIRMED');return{request:state.request(requestId),replayed:false};}catch(e){await state.mark(requestId,'UNKNOWN',safe(e));throw e;}}),
  reconcile:requestId=>exclusive(async()=>{const r=state.request(requestId);assert.ok(r,'ACCOUNT_REQUEST_UNKNOWN');if(r.state==='CONFIRMED'){await refresh();return{request:r,replayed:true};}assert.ok(['SUBMITTING','UNKNOWN'].includes(r.state),'ACCOUNT_NOT_SUBMITTED');try{const result=await host('reconcile',{request:r});assert.equal(result.state,'CONFIRMED','ACCOUNT_OUTCOME_UNKNOWN');await refresh();assert.equal(state.hasFreshObservation(r.assetId),true,'ACCOUNT_ASSET_OBSERVATION_REQUIRED');await state.mark(requestId,'CONFIRMED');return{request:state.request(requestId),replayed:false};}catch(e){await state.mark(requestId,'UNKNOWN',safe(e));throw e;}}),
  close(){assert.equal(busy,false,'ACCOUNT_COORDINATOR_BUSY');closed=true;state.close();},
 });
}
export function runPrivateAccountCoordinatorProcess(transport=process){
 let state,coordinator,generation,sequence=0,pending,busy=false,booted=false,stopped=false;
 const send=m=>new Promise((resolve,reject)=>transport.send(m,e=>e?reject(e):resolve()));
 const host=(method,input)=>{assert.ok(!pending,'ACCOUNT_ONE_HOST_CALL');const number=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending=null;reject(Error('ACCOUNT_HOST_TIMEOUT'));},2*60*60_000);pending={number,resolve,reject,timer};void send({type:'host',generation,sequence:number,method,input}).catch(e=>{clearTimeout(timer);pending=null;reject(e);});});};
 async function receive(m){
  assert.ok(m&&Buffer.byteLength(JSON.stringify(m))<=512*1024,'ACCOUNT_IPC_LIMIT');
  if(m.type==='reply'){assert.ok(pending&&m.generation===generation&&m.sequence===pending.number&&typeof m.ok==='boolean','ACCOUNT_REPLY_ID');const p=pending;pending=null;clearTimeout(p.timer);if(m.ok)p.resolve(m.result);else p.reject(Error(safe({message:m.errorCode})));return;}
  assert.equal(busy,false,'ACCOUNT_ONE_COMMAND');busy=true;
  try{
   if(m.type==='boot'){assert.equal(booted,false,'ACCOUNT_ALREADY_BOOTED');booted=true;generation=m.generation;assert.match(generation,/^[0-9a-f]{32}$/);state=new PrivateAccountState(m.config,{onCheckpoint:checkpoint=>host('checkpoint',{checkpoint})});await state.open({create:m.create,checkpoint:m.checkpoint});coordinator=createPrivateAccountCoordinator({state,host});await send({type:'ready',generation,snapshot:coordinator.snapshot()});return;}
   assert.ok(coordinator&&m.generation===generation&&m.type==='command','ACCOUNT_COMMAND');let result;
   if(m.action==='refresh')result=await coordinator.refresh();
   else if(m.action==='prepare')result=await coordinator.prepare(m.input);
   else if(m.action==='execute'||m.action==='reconcile')result=await coordinator[m.action](m.input.requestId);
   else if(m.action==='snapshot')result=coordinator.snapshot();
   else throw Error('ACCOUNT_UNKNOWN_COMMAND');
   await send({type:'result',generation,commandId:m.commandId,ok:true,result,snapshot:coordinator.snapshot()});
  }catch(e){await send({type:m.type==='boot'?'boot-failed':'result',generation,commandId:m.commandId??null,ok:false,errorCode:safe(e)});}
  finally{busy=false;}
 }
 transport.on('message',m=>{void receive(m).catch(()=>{stopped=true;transport.exitCode=1;transport.disconnect?.();});});
 transport.on('disconnect',()=>{if(stopped)return;stopped=true;pending?.reject(Error('ACCOUNT_KEEPER_UNAVAILABLE'));if(pending)clearTimeout(pending.timer);state?.close();});
}
if(process.argv[1]===fileURLToPath(import.meta.url))runPrivateAccountCoordinatorProcess();
