/** Authenticated local API journal. Private terms stay in the original encrypted
 * owner journals; this file retains only coarse actions and lifecycle outcomes. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {PrivateOperationStore,MAX_REQUESTS,MAX_OPERATIONS} from '../payments/private-operation-store.mjs';
import {createPrivateAccountCohortService,PRIVATE_ACCOUNT_COHORT_PROFILE} from './private-account-cohort-service.mjs';
const clone=x=>structuredClone(x),stamp=()=>new Date().toISOString();
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(x);
const safe=e=>/^([A-Z][A-Z0-9_]{1,100})(?:\n|$)/.exec(e?.message??'')?.[1]??(/^[A-Z][A-Z0-9_]{1,100}$/.test(e?.code??'')?e.code:'ACCOUNT_COHORT_OPERATION_FAILED');
function command(v,index){
 assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype&&validId(v.requestId),'ACCOUNT_COHORT_COMMAND');assert.ok(index===null||index===0||index===1,'ACCOUNT_COHORT_OWNER');
 const fields=(index===null?{open:['profile'],start:[],next:[],reset:[],close:[]}:{prepare:['assetId','kind','terms'],execute:['preparedRequestId'],reconcile:['preparedRequestId'],refresh:[],restart:[],enroll:['preparedRequestId','consentToWait','expiresAt'],cancel:[]})[v.action];
 assert.ok(fields,'ACCOUNT_COHORT_COMMAND_ACTION');assert.deepEqual(Object.keys(v).sort(),['requestId','action',...fields].sort(),'ACCOUNT_COHORT_COMMAND_FIELDS');
 if(v.action==='open')assert.equal(v.profile,PRIVATE_ACCOUNT_COHORT_PROFILE);
 if(['execute','reconcile','enroll'].includes(v.action))assert.ok(validId(v.preparedRequestId),'ACCOUNT_COHORT_ORIGINAL_REQUEST');
 if(v.action==='prepare'){assert.match(v.assetId,/^[0-9a-f]{64}$/);assert.ok(['topup','payment','exit','refund'].includes(v.kind));assert.ok(v.terms&&Buffer.byteLength(JSON.stringify(v.terms))<8192,'ACCOUNT_TERMS_LIMIT');}
 if(v.action==='enroll'){assert.equal(v.consentToWait,true,'ACCOUNT_COHORT_WAIT_CONSENT');assert.ok(Number.isSafeInteger(v.expiresAt),'ACCOUNT_COHORT_EXPIRY');}
 return clone(v);
}
function publicSummary(s){
 // Project explicitly: adding private runtime fields cannot silently extend
 // the public disk journal or API response.
 assert.equal(s.profile,PRIVATE_ACCOUNT_COHORT_PROFILE);assert.match(s.groupId,/^[0-9a-f]{32}$/);
 const c=s.cohort;
 return {profile:s.profile,groupId:s.groupId,phase:s.phase,opened:!!s.opened,closed:!!s.closed,busy:!!s.busy,authorityAvailable:!!s.authorityAvailable,
  cohort:c?{state:c.state,active:!!c.active,joined:c.joined,roundNumber:c.roundNumber,roundsUsed:c.roundsUsed,maxRounds:c.maxRounds,errorCode:c.errorCode,checkpointAvailable:!!c.checkpointAvailable,counts:clone(c.counts)}:null,
  owners:s.owners.map(o=>({ownerIndex:o.ownerIndex,accountId:o.accountId,status:o.status?{phase:o.status.phase,busy:!!o.status.busy,workerAvailable:!!o.status.workerAvailable,authorityAvailable:!!o.status.authorityAvailable,generationCount:o.status.generationCount,requestCount:o.status.requestCount,errorCode:o.status.errorCode}:null})),
  privacyEvaluation:'NOT_EVALUATED',transparentFallback:false,capabilities:{sharedBackedAssets:true,syntheticOwnerCount:2,coordinatorRestart:true,keeperRestart:false,nodeRestart:false,nativeHoldingsPrivateSpendable:false,fullAcceptance:false}};
}
export class PrivateAccountCohortSession{
 #store;#create;#deps;#preflight;#record;#ready;#service;#writes=Promise.resolve();#admissions=Promise.resolve();#active;#controls=new Set();#closed=false;#storageError=null;
 constructor(directory,{store,createService=createPrivateAccountCohortService,serviceDependencies={},preflight=async()=>{}}={}){this.#store=store??new PrivateOperationStore(directory);this.#create=createService;this.#deps=serviceDependencies;this.#preflight=preflight;}
 initialize(){return this.#ready??=(async()=>{this.#record=await this.#store.initialize();for(const o of this.#record.operations)assert.equal(o.kind,'private-accounts','ACCOUNT_COHORT_HISTORY_TYPE');const last=this.#record.operations.at(-1);if(last&&last.summary.phase!=='CLOSED')await this.#write(r=>({...r,operations:r.operations.map(o=>o.id===last.id?{...o,summary:{...o.summary,phase:'UNAVAILABLE',busy:false,authorityAvailable:false,owners:o.summary.owners.map(p=>({...p,status:p.status?{...p.status,busy:false,workerAvailable:false,authorityAvailable:false}:null}))},updatedAt:stamp()}:o),requests:r.requests.map(q=>q.state==='ADMITTED'?{...q,state:'INTERRUPTED',errorCode:'ACCOUNT_COHORT_KEEPER_UNAVAILABLE'}:q)}));return this.snapshot();})();}
 #write(fn){const p=this.#writes.then(async()=>{try{this.#record=await this.#store.update(this.#record.revision,fn);if(this.#store.read)assert.deepEqual(await this.#store.read(),this.#record,'ACCOUNT_COHORT_PUBLIC_READBACK');}catch(e){this.#storageError=safe(e);void this.#service?.abort().catch(()=>{});throw e;}});this.#writes=p.catch(()=>{});return p;}
 snapshot(){assert.ok(this.#record,'ACCOUNT_COHORT_NOT_READY');const last=this.#record.operations.at(-1),available=!!(this.#service&&last?.summary.authorityAvailable&&!this.#storageError&&!this.#closed);return {version:1,profile:PRIVATE_ACCOUNT_COHORT_PROFILE,group:last?clone(last.summary):null,busy:!!this.#active||this.#controls.size>0||!!(available&&last?.summary.busy),available,occupied:!!(this.#service||last&&last.summary.phase!=='CLOSED'),storageError:this.#storageError,requests:clone(this.#record.requests),lastControl:last?.control?clone(last.control):null,capabilities:{coordinatorRestart:true,keeperRestart:false,nodeRestart:false,fullAcceptance:false}};}
 async refresh(){await this.initialize();await this.#writes;return this.snapshot();}
 async privateStatus(index){assert.ok(index===0||index===1);await this.initialize();assert.ok(this.snapshot().available,'ACCOUNT_COHORT_KEEPER_UNAVAILABLE');return this.#service.privateStatus(index);}
 async submit(input,index=null){const body=command(input,index);await this.initialize();const p=this.#admissions.then(()=>this.#submit(body,index));this.#admissions=p.catch(()=>{});return p;}
 async #submit(body,index){
  assert.ok(!this.#closed&&!this.#storageError,'ACCOUNT_COHORT_SESSION_UNAVAILABLE');const cancelling=body.action==='cancel',control=['reconcile','refresh','restart'].includes(body.action),last=this.#record.operations.at(-1);
  const old=this.#record.requests.find(q=>q.id===body.requestId)??(last?.control?.id===body.requestId?last.control:null);
  if(old){assert.equal(old.action,body.action,'ACCOUNT_COHORT_REQUEST_CONFLICT');assert.equal(old.ownerIndex,index,'ACCOUNT_COHORT_REQUEST_CONFLICT');assert.equal(old.preparedRequestId,body.preparedRequestId??null,'ACCOUNT_COHORT_REQUEST_CONFLICT');if(body.action==='prepare'){assert.ok(!this.#active,'ACCOUNT_COHORT_ACTION_BUSY');await this.#service.ownerAction(index,'prepare',{requestId:body.requestId,assetId:body.assetId,kind:body.kind,terms:body.terms});}if(body.action==='enroll')await this.#service.enroll(index,body);return{snapshot:this.snapshot(),replayed:true};}
  assert.ok(cancelling||(!this.#active&&this.#controls.size===0),'ACCOUNT_COHORT_ACTION_BUSY');let group=last;
  if(body.action==='open'){assert.ok(!this.#service&&(!last||last.summary.phase==='CLOSED'),'ACCOUNT_COHORT_ALREADY_OPEN_OR_UNAVAILABLE');assert.ok(this.#record.operations.length<MAX_OPERATIONS,'ACCOUNT_COHORT_HISTORY_LIMIT');await this.#preflight();const groupId=randomBytes(16).toString('hex');group={kind:'private-accounts',id:groupId,createdAt:stamp(),updatedAt:stamp(),summary:{profile:PRIVATE_ACCOUNT_COHORT_PROFILE,groupId,phase:'OPENING',opened:false,closed:false,busy:false,authorityAvailable:false,cohort:null,owners:[],privacyEvaluation:'NOT_EVALUATED',transparentFallback:false}};}
  else assert.ok(this.#service,'ACCOUNT_COHORT_KEEPER_UNAVAILABLE');
  let cleanup=['cancel','reset','close'].includes(body.action)||body.action==='prepare'&&['exit','refund'].includes(body.kind);
  if(['execute','reconcile'].includes(body.action)){const p=await this.#service.privateStatus(index),r=p.requests.find(r=>r.requestId===body.preparedRequestId);assert.ok(r,'ACCOUNT_ORIGINAL_REQUEST_REQUIRED');cleanup=['exit','refund'].includes(r.kind);if(body.action==='execute'){assert.notEqual(r.kind,'payment','ACCOUNT_PAYMENT_REQUIRES_COHORT');assert.ok(['PREPARED','CONFIRMED'].includes(r.state),'ACCOUNT_RECONCILE_ORIGINAL_REQUEST');}}
  if(!control){assert.ok(this.#record.requests.length<MAX_REQUESTS,'ACCOUNT_COHORT_REQUEST_LIMIT');if(!cleanup)assert.ok(this.#record.requests.length<48,'ACCOUNT_COHORT_RECOVERY_HEADROOM');}
  if(body.action==='prepare')await this.#service.ownerAction(index,'prepare',{requestId:body.requestId,assetId:body.assetId,kind:body.kind,terms:body.terms});
  const q={id:body.requestId,action:body.action,ownerIndex:index,preparedRequestId:body.preparedRequestId??null,state:'ADMITTED',errorCode:null,createdAt:stamp()};
  await this.#write(r=>({...r,operations:body.action==='open'?[...r.operations,group]:control?r.operations.map(o=>o.id===group.id?{...o,control:q}:o):r.operations,requests:control?r.requests:[...r.requests,q]}));
  if(body.action==='open')this.#service=this.#create({groupId:group.id,onCheckpoint:s=>this.#write(r=>({...r,operations:r.operations.map(o=>o.id===group.id?{...o,summary:publicSummary(s),updatedAt:stamp()}:o)}))},this.#deps);
  const task={};if(!cancelling)this.#active=task;else this.#controls.add(task);
  const finish=(state,errorCode=null)=>this.#write(r=>({...r,operations:control?r.operations.map(o=>o.id===group.id&&o.control?.id===q.id?{...o,control:{...o.control,state,errorCode}}:o):r.operations,requests:control?r.requests:r.requests.map(x=>x.id===q.id?{...x,state,errorCode}:x)}));
  task.done=(async()=>{try{
   if(body.action==='open')await this.#service.open();
   else if(body.action==='start'){await this.#service.start();const outcome=await this.#service.idle();assert.equal(outcome.cohort.state,'SETTLED_IN_POOL',outcome.cohort.errorCode??'ACCOUNT_COHORT_NOT_SETTLED');}
   else if(body.action==='next')await this.#service.nextRound();
   else if(body.action==='reset')await this.#service.resetFailedRound();
   else if(body.action==='close')await this.#service.close();
   else if(body.action==='cancel')await this.#service.cancel(index);
   else if(body.action==='enroll')await this.#service.enroll(index,body);
   else if(body.action!=='prepare')await this.#service.ownerAction(index,body.action,{requestId:body.preparedRequestId});
   await finish('FINISHED');if(body.action==='close')this.#service=null;
  }catch(e){await finish('FAILED',safe(e)).catch(()=>{});}finally{if(this.#active===task)this.#active=null;this.#controls.delete(task);}})();
  return {snapshot:this.snapshot(),replayed:false};
 }
 async idle(){await this.initialize();await this.#admissions;await this.#active?.done;await Promise.all([...this.#controls].map(t=>t.done));await this.#writes;return this.snapshot();}
 async close(){if(this.#closed)return;this.#closed=true;await this.#ready?.catch(()=>{});await this.#service?.abort();await this.#active?.done;await Promise.all([...this.#controls].map(t=>t.done));await this.#writes;}
}
