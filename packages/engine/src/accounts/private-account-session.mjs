/** Public lifecycle journal contains no asset addresses, amounts or private
 * terms. The encrypted account journal lives with the surviving keeper. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {PrivateOperationStore,MAX_REQUESTS} from '../payments/private-operation-store.mjs';
import {createPrivateAccountKeeper} from './private-account-keeper.mjs';
import {PRIVATE_ACCOUNT_PROFILE} from './private-account-state.mjs';
const safe=e=>{const m=/^([A-Z][A-Z0-9_]{1,100})(?:\n|$)/.exec(e?.message??'');return m?.[1]??(/^[A-Z][A-Z0-9_]{1,100}$/.test(e?.code??'')?e.code:'ACCOUNT_OPERATION_FAILED');};
const now=()=>new Date().toISOString();
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(x);
function command(v){assert.ok(v&&typeof v==='object'&&!Array.isArray(v)&&id(v.requestId),'ACCOUNT_COMMAND');const fields={open:['profile'],prepare:['assetId','kind','terms'],execute:['preparedRequestId'],reconcile:['preparedRequestId'],refresh:[],restart:[],close:[]}[v.action];assert.ok(fields,'ACCOUNT_COMMAND_ACTION');assert.deepEqual(Object.keys(v).sort(),['action','requestId',...fields].sort(),'ACCOUNT_COMMAND_FIELDS');if(v.action==='open')assert.equal(v.profile,PRIVATE_ACCOUNT_PROFILE);if(['execute','reconcile'].includes(v.action))assert.ok(id(v.preparedRequestId));if(v.action==='prepare'){assert.match(v.assetId,/^[0-9a-f]{64}$/);assert.ok(['topup','payment','exit','refund'].includes(v.kind));assert.ok(Buffer.byteLength(JSON.stringify(v.terms))<8192,'ACCOUNT_TERMS_LIMIT');}return structuredClone(v);}
export class PrivateAccountSession{
 #store;#record;#ready;#keeper;#create;#preflight;#queue=Promise.resolve();#admission=Promise.resolve();#active;#closed=false;#storageError=null;
 constructor(directory,{store,createKeeper=createPrivateAccountKeeper,preflight=async()=>{}}={}){this.#store=store??new PrivateOperationStore(directory);this.#create=createKeeper;this.#preflight=preflight;}
 initialize(){return this.#ready??=(async()=>{this.#record=await this.#store.initialize();if(this.#record.operations.length){const last=this.#record.operations.at(-1);assert.equal(last.kind,'private-account');if(last.summary.phase!=='CLOSED')await this.#write(r=>({...r,operations:r.operations.map(o=>o.id===last.id?{...o,summary:{...o.summary,phase:'UNAVAILABLE',workerAvailable:false,authorityAvailable:false,busy:false,errorCode:'ACCOUNT_KEEPER_UNAVAILABLE'},updatedAt:now()}:o)}));}return this.snapshot();})();}
 #write(fn){const work=this.#queue.then(async()=>{try{this.#record=await this.#store.update(this.#record.revision,fn);}catch(e){this.#storageError=safe(e);throw e;}});this.#queue=work.catch(()=>{});return work;}
 snapshot(){assert.ok(this.#record,'ACCOUNT_SESSION_NOT_READY');const a=this.#record.operations.at(-1);return{version:1,profile:PRIVATE_ACCOUNT_PROFILE,account:a?structuredClone(a.summary):null,busy:Boolean(this.#active),available:Boolean(this.#keeper&&a?.summary.workerAvailable&&!this.#storageError),occupied:Boolean(this.#keeper||a&&a.summary.phase!=='CLOSED'),storageError:this.#storageError,requests:this.#record.requests.map(r=>({...r})),lastControl:a?.control?{...a.control}:null,capabilities:{coordinatorRestart:true,keeperRestart:false,nodeRestart:false,fullAcceptance:false}};}
 async refresh(){await this.initialize();await this.#queue;return this.snapshot();}
 async privateStatus(){await this.initialize();assert.ok(this.#keeper&&!this.#storageError,'ACCOUNT_KEEPER_UNAVAILABLE');const value=await this.#keeper.privateStatus();if(this.#active)for(const a of value.assets)a.observation='STALE';return value;}
 async submit(input){const body=command(input);await this.initialize();const work=this.#admission.then(()=>this.#submit(body));this.#admission=work.catch(()=>{});return work;}
 async #submit(body){assert.ok(!this.#closed&&!this.#storageError,'ACCOUNT_SESSION_UNAVAILABLE');const controlAction=['restart','refresh','close','reconcile'].includes(body.action),latest=this.#record.operations.at(-1);const old=this.#record.requests.find(r=>r.id===body.requestId)??(latest?.control?.id===body.requestId?latest.control:null);if(old){assert.equal(old.action,body.action,'ACCOUNT_REQUEST_CONFLICT');assert.equal(old.preparedRequestId,body.preparedRequestId??null,'ACCOUNT_REQUEST_CONFLICT');if(body.action==='prepare'){assert.ok(this.#keeper&&!this.#active,'ACCOUNT_ACTION_BUSY');await this.#keeper.prepare({requestId:body.requestId,assetId:body.assetId,kind:body.kind,terms:body.terms});}return{snapshot:this.snapshot(),replayed:true};}
  assert.equal(Boolean(this.#active),false,'ACCOUNT_ACTION_BUSY');let account=this.#record.operations.at(-1);
  if(body.action==='open'){assert.ok(!this.#keeper&&(!account||account.summary.phase==='CLOSED'),'ACCOUNT_ALREADY_OPEN_OR_UNAVAILABLE');await this.#preflight();const accountId=randomBytes(16).toString('hex');account={kind:'private-account',id:accountId,createdAt:now(),updatedAt:now(),summary:{profile:PRIVATE_ACCOUNT_PROFILE,accountId,phase:'OPENING',busy:false,workerAvailable:false,authorityAvailable:false,generationCount:0,assetCount:0,requestCount:0,errorCode:null,capabilities:{coordinatorRestart:true,keeperRestart:false,nodeRestart:false,fullAcceptance:false}}};}
  else assert.ok(this.#keeper,'ACCOUNT_KEEPER_UNAVAILABLE');
  let cleanup=body.action==='prepare'&&['exit','refund'].includes(body.kind);
  if(['execute','reconcile'].includes(body.action)){const privateView=await this.#keeper.privateStatus(),original=privateView.requests.find(r=>r.requestId===body.preparedRequestId);assert.ok(original,'ACCOUNT_REQUEST_UNKNOWN');cleanup=['exit','refund'].includes(original.kind);if(body.action==='execute'){if(original.state==='CONFIRMED')return{snapshot:this.snapshot(),replayed:true};assert.equal(original.state,'PREPARED','ACCOUNT_RECONCILE_ORIGINAL_REQUEST');}}
  // Eight new exposures can create at most 24 live note exits. Preserve 64
  // public request rows for explicit exits/refunds/reconciliation; routine
  // controls cannot consume that recovery allocation. No records are dropped.
  if(!controlAction)assert.ok(this.#record.requests.length<MAX_REQUESTS,'ACCOUNT_REQUEST_LIMIT');
  if(!cleanup&&!controlAction)assert.ok(this.#record.requests.length<64,'ACCOUNT_RECOVERY_HEADROOM_RESERVED');
  // Read/recovery controls occupy one bounded last-control slot. They use the
  // original encrypted request and cannot allocate a new payment identity.
  if(body.action==='prepare')await this.#keeper.prepare({requestId:body.requestId,assetId:body.assetId,kind:body.kind,terms:body.terms});
  const request={id:body.requestId,action:body.action,preparedRequestId:body.preparedRequestId??null,state:'ADMITTED',errorCode:null,createdAt:now()};
  await this.#write(r=>({...r,operations:body.action==='open'?[...r.operations,account]:controlAction?r.operations.map(o=>o.id===account.id?{...o,control:request}:o):r.operations,requests:controlAction?r.requests:[...r.requests,request]}));
  const finish=(state,errorCode=null)=>this.#write(r=>({...r,operations:controlAction?r.operations.map(o=>o.id===account.id?{...o,control:{...o.control,state,errorCode}}:o):r.operations,requests:controlAction?r.requests:r.requests.map(x=>x.id===body.requestId?{...x,state,errorCode}:x)}));
  if(body.action==='open')this.#keeper=this.#create({accountId:account.id,onCheckpoint:summary=>this.#write(r=>({...r,operations:r.operations.map(o=>o.id===account.id?{...o,summary,updatedAt:now()}:o)}))});
  const task={requestId:body.requestId};this.#active=task;
  task.done=(async()=>{try{if(body.action==='open')await this.#keeper.open();else if(body.action==='prepare'){ /* private preparation already authenticated */ }else if(body.action==='restart')await this.#keeper.restartCoordinator();else if(['execute','reconcile'].includes(body.action))await this.#keeper[body.action](body.preparedRequestId);else await this.#keeper[body.action]();await finish('FINISHED');if(body.action==='close')this.#keeper=null;}
   catch(e){await finish('FAILED',safe(e)).catch(()=>{});if(this.#storageError)void this.#keeper?.stop('ACCOUNT_STORAGE_UNAVAILABLE').catch(()=>{});}
   finally{if(this.#active===task)this.#active=null;}})();
  return{snapshot:this.snapshot(),replayed:false};
 }
 async idle(){await this.initialize();await this.#admission;if(this.#active)await this.#active.done;await this.#queue;return this.snapshot();}
 async close(){if(this.#closed)return;this.#closed=true;await this.#ready?.catch(()=>{});await this.#keeper?.stop('ACCOUNT_SERVER_CLOSED');await this.#active?.done;await this.#queue;}
}
