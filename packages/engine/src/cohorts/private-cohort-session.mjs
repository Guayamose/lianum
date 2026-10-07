/** Bounded authenticated local bridge. Only coarse acceptance/history is durable.
 * Losing this in-process keeper never reopens nodes, decrypts custody or resends.
 * Constructor injection is trusted host code and is never accepted over HTTP. */
import {randomBytes} from 'node:crypto';
import {open,readFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {canonical} from '../crypto/privacy.mjs';
import {PrivateOperationStore,MAX_OPERATIONS,MAX_REQUESTS} from '../payments/private-operation-store.mjs';
import {validateWalletCheckpoint,validateWalletPrivateStatus,validateWalletIntentTerms} from '../wallet/runtime/private-wallet-session.mjs';
import {createPrivateCohortCoordinator,PRIVATE_COHORT_PROFILE,PRIVATE_COHORT_STATES,PRIVATE_COHORT_TERMS,PRIVATE_COHORT_MAX_CONSENT_MS} from './private-cohort-coordinator.mjs';
export {PRIVATE_COHORT_PROFILE,PRIVATE_COHORT_TERMS};
const id=x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x),rid=x=>typeof x==='string'&&/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(x);
const code=x=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{1,100}$/.test(x);
const safe=e=>code(e?.code)?e.code:code(e?.message)?e.message:'PC24_REQUEST_FAILED';
const need=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const clone=x=>structuredClone(x),newId=()=>randomBytes(16).toString('hex'),stamp=()=>new Date().toISOString(),owner=x=>x===0||x===1;
const CORE=['profile','cohortId','state','opened','active','counts','expiresAt','errorCode','privacyEvaluation','transparentFallback','observerModel'];
const STATES=['ACCEPTED','RUNNING','PREPARED','FINISHED','FAILED','INTERRUPTED'];
export function validateCohortCheckpoint(value,{sequence=false}={}){
 need(exact(value,[...CORE,...(sequence?['sequence']:[])]),'PC24_CHECKPOINT_FIELDS');
 need(value.profile===PRIVATE_COHORT_PROFILE&&id(value.cohortId)&&PRIVATE_COHORT_STATES.includes(value.state),'PC24_CHECKPOINT_ID');
 need(typeof value.opened==='boolean'&&typeof value.active==='boolean'&&exact(value.counts,['joined','reservationsConfirmed','solCompleted','btcCompleted','settled'])&&Object.values(value.counts).every(n=>Number.isInteger(n)&&n>=0&&n<=2),'PC24_CHECKPOINT_COUNTS');
 need(value.expiresAt===null||Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0,'PC24_CHECKPOINT_EXPIRY');
 need(value.errorCode===null||code(value.errorCode),'PC24_CHECKPOINT_ERROR');
 need(value.privacyEvaluation==='NOT_EVALUATED'&&value.transparentFallback===false&&value.observerModel==='COMMON_TRUSTED_CONTROLLER_LOCAL_SYNTHETIC_ONLY','PC24_CHECKPOINT_SCOPE');
 if(sequence)need(Number.isSafeInteger(value.sequence)&&value.sequence>0,'PC24_CHECKPOINT_SEQUENCE');
 need(value.state!=='CLOSED'||value.active===false,'PC24_FALSE_CLOSE');return clone(value);
}
function initial(cohortId){return{profile:PRIVATE_COHORT_PROFILE,cohortId,state:'WAITING_FOR_COHORT',opened:false,active:false,counts:{joined:0,reservationsConfirmed:0,solCompleted:0,btcCompleted:0,settled:0},expiresAt:null,errorCode:null,privacyEvaluation:'NOT_EVALUATED',transparentFallback:false,observerModel:'COMMON_TRUSTED_CONTROLLER_LOCAL_SYNTHETIC_ONLY'};}
function validateRecord(r){
 need(exact(r,['version','revision','operations','requests'])&&r.version===1&&Number.isSafeInteger(r.revision)&&Array.isArray(r.operations)&&r.operations.length<=MAX_OPERATIONS&&Array.isArray(r.requests)&&r.requests.length<=MAX_REQUESTS,'PC24_JOURNAL_FIELDS');
 const ids=new Set();let c;
 for(const o of r.operations){need(id(o.id)&&!ids.has(o.id),'PC24_JOURNAL_ID');ids.add(o.id);
  if(o.kind==='cohort'){need(!c&&exact(o,['kind','id','checkpoint','sequence','authorityState','createdAt','updatedAt']),'PC24_JOURNAL_COHORT');c=o;validateCohortCheckpoint(o.checkpoint);need(o.checkpoint.cohortId===o.id&&Number.isSafeInteger(o.sequence)&&o.sequence>=0&&['LIVE','UNAVAILABLE','CLOSED'].includes(o.authorityState),'PC24_JOURNAL_AUTHORITY');}
  else if(o.kind==='owner'){need(exact(o,['kind','id','cohortId','ownerIndex','checkpoint','sequence','createdAt','updatedAt'])&&id(o.cohortId)&&owner(o.ownerIndex)&&Number.isSafeInteger(o.sequence)&&o.sequence>0,'PC24_JOURNAL_OWNER');validateWalletCheckpoint(o.checkpoint);need(o.checkpoint.walletId===o.id,'PC24_JOURNAL_OWNER_ID');}
  else need(exact(o,['kind','id','cohortId','ownerIndex','intentId','intentKind','state','errorCode','createdAt','updatedAt'])&&o.kind==='operation'&&id(o.cohortId)&&owner(o.ownerIndex)&&id(o.intentId)&&['topup','exit','refund'].includes(o.intentKind)&&STATES.includes(o.state)&&(o.errorCode===null||code(o.errorCode)),'PC24_JOURNAL_OPERATION');
 }
 const requestIds=new Set();for(const q of r.requests){need(exact(q,['id','action','ownerIndex','operationId','intentId','intentKind','state','errorCode','createdAt','updatedAt'])&&rid(q.id)&&!requestIds.has(q.id)&&['open','start','close','prepareIntent','execute','reconcile','join','cancel'].includes(q.action)&&(q.ownerIndex===null||owner(q.ownerIndex))&&(q.operationId===null||id(q.operationId))&&(q.intentId===null||id(q.intentId))&&(q.intentKind===null||['topup','exit','refund','payment'].includes(q.intentKind))&&STATES.includes(q.state)&&(q.errorCode===null||code(q.errorCode)),'PC24_JOURNAL_REQUEST');requestIds.add(q.id);}
 need(!r.operations.length||c&&r.operations.every(o=>o.kind==='cohort'||o.cohortId===c.id)&&r.operations.filter(o=>o.kind==='owner').length<=2&&new Set(r.operations.filter(o=>o.kind==='owner').map(o=>o.ownerIndex)).size===r.operations.filter(o=>o.kind==='owner').length,'PC24_JOURNAL_BINDING');return clone(r);
}
export function validateCohortCommand(body,index=null){
 need(body&&rid(body.requestId)&&(index===null||owner(index)),'PC24_COMMAND');
 const common=['action','requestId'];
 if(index===null){need(['open','start','close'].includes(body.action),'PC24_COMMON_ACTION');need(exact(body,body.action==='open'?[...common,'profile']:common)&&(body.action!=='open'||body.profile===PRIVATE_COHORT_PROFILE),'PC24_COMMAND_FIELDS');}
 else if(body.action==='prepareIntent'){need(exact(body,[...common,'kind','terms'])&&['topup','exit','refund'].includes(body.kind),'PC24_COMMAND_FIELDS');validateWalletIntentTerms(body.kind,body.terms);if(body.kind==='topup')need(body.terms.amount===PRIVATE_COHORT_TERMS.depositWei,'PC24_FIXED_DEPOSIT_ONLY');}
 else if(['execute','reconcile'].includes(body.action))need(exact(body,[...common,'operationId'])&&id(body.operationId),'PC24_COMMAND_FIELDS');
 else if(body.action==='join')need(exact(body,[...common,'terms','consentToWait','expiresAt'])&&body.consentToWait===true&&canonical(body.terms)===canonical(PRIVATE_COHORT_TERMS)&&Number.isSafeInteger(body.expiresAt),'PC24_CONSENT_FIELDS');
 else need(body.action==='cancel'&&exact(body,common),'PC24_COMMAND_FIELDS');
 return clone(body);
}
function validateOwnerStatus(value,index,cohortId){
 need(exact(value,[...CORE,'ownerIndex','walletId','consent','operationId','intentId','ownerProgress','wallet']),'PC24_OWNER_VIEW_FIELDS');
 validateCohortCheckpoint(Object.fromEntries(CORE.map(k=>[k,value[k]])));
 need(value.cohortId===cohortId&&value.ownerIndex===index&&id(value.walletId)&&(value.operationId===null||id(value.operationId))&&(value.intentId===null||id(value.intentId)),'PC24_OWNER_VIEW_ID');
 need(value.consent===null||exact(value.consent,['consentToWait','expiresAt','terms'])&&value.consent.consentToWait===true&&Number.isSafeInteger(value.consent.expiresAt)&&canonical(value.consent.terms)===canonical(PRIVATE_COHORT_TERMS),'PC24_OWNER_VIEW_CONSENT');
 need(exact(value.ownerProgress,['reservationAttempted','reservationConfirmed','solCompleted','btcCompleted','settled'])&&Object.values(value.ownerProgress).every(x=>typeof x==='boolean'),'PC24_OWNER_VIEW_PROGRESS');
 if(value.wallet!==null){validateWalletCheckpoint(value.wallet);need(value.wallet.walletId===value.walletId,'PC24_OWNER_VIEW_WALLET');}return clone(value);
}
export class PrivateCohortSession{
 #directory;#store;#record;#ready;#factory;#dependencies;#preflight;#coordinator;#lease;#leaseToken;#leasePath;#readOnly=false;#closed=false;#storageError=null;#writes=Promise.resolve();#admissions=Promise.resolve();#active=null;#privateRequests=new Map();#abortController=new AbortController();
 constructor(directory,{store,createCoordinator=createPrivateCohortCoordinator,coordinatorDependencies={},preflight=async()=>{}}={}){this.#directory=resolve(directory);this.#store=store??new PrivateOperationStore(this.#directory);this.#factory=createCoordinator;this.#dependencies=coordinatorDependencies;this.#preflight=preflight;this.#leasePath=join(this.#directory,'cohort-session.lock');}
 initialize(){return this.#ready??=this.#initialize();}
 async #initialize(){this.#record=validateRecord(await this.#store.initialize());this.#leaseToken=newId();try{this.#lease=await open(this.#leasePath,'wx',0o600);await this.#lease.writeFile(JSON.stringify({version:1,pid:process.pid,token:this.#leaseToken}));await this.#lease.sync();const d=await open(this.#directory,'r');try{await d.sync();}finally{await d.close();}}
  catch(e){if(e.code!=='EEXIST'){await this.#release().catch(()=>{});throw e;}this.#readOnly=true;this.#storageError='PC24_SESSION_ALREADY_OPEN';}
  if(!this.#readOnly&&this.#cohort()?.authorityState==='LIVE')await this.#unavailable('PC24_AUTHORITY_UNAVAILABLE');return this.snapshot();
 }
 #cohort(){return this.#record?.operations.find(o=>o.kind==='cohort');}
 #serial(work){const p=this.#writes.then(work);this.#writes=p.catch(()=>{});return p;}
 #admit(work){const p=this.#admissions.then(work);this.#admissions=p.catch(()=>{});return p;}
 #fault(e){this.#storageError=safe(e);this.#abortController.abort();void this.#coordinator?.abort?.().catch(()=>{});}
 async #write(transform){try{const result=validateRecord(await this.#store.update(this.#record.revision,transform)),readback=validateRecord(await this.#store.read());need(canonical(result)===canonical(readback),'PC24_STORAGE_READBACK');this.#record=readback;}catch(e){this.#fault(e);throw e;}}
 async #read(){try{this.#record=validateRecord(await this.#store.read());}catch(e){this.#fault(e);throw e;}}
 async #unavailable(errorCode){const c=this.#cohort();if(!c||c.authorityState==='CLOSED')return;await this.#write(r=>({...r,operations:r.operations.map(o=>o.kind==='cohort'?{...o,authorityState:'UNAVAILABLE',checkpoint:{...o.checkpoint,active:false,errorCode},updatedAt:stamp()}:['ACCEPTED','RUNNING'].includes(o.state)?{...o,state:'INTERRUPTED',errorCode,updatedAt:stamp()}:o),requests:r.requests.map(q=>['ACCEPTED','RUNNING'].includes(q.state)?{...q,state:'INTERRUPTED',errorCode,updatedAt:stamp()}:q)}));}
 snapshot(){need(this.#record,'PC24_SESSION_NOT_READY');const c=this.#cohort(),available=Boolean(c?.authorityState==='LIVE'&&c.checkpoint.opened&&this.#coordinator&&!this.#closed&&!this.#storageError);return{version:1,profile:PRIVATE_COHORT_PROFILE,cohort:c?{...clone(c.checkpoint),authorityState:c.authorityState,observation:available?'LIVE':'RETAINED_HISTORY'}:null,busy:Boolean(this.#active||c?.checkpoint.active&&available),available,occupied:Boolean(this.#readOnly||this.#coordinator&&c?.authorityState!=='CLOSED'||c?.authorityState==='UNAVAILABLE'),storageError:this.#storageError,requests:this.#record.requests.filter(q=>q.ownerIndex===null).map(clone),capabilities:{browserReconnect:true,keeperRestart:false,nodeRestart:false,explicitExit:true,fullAcceptance:false},latency:{priorSinglePaymentApproxMinutes:30,cohortMeasured:false}};}
 async refresh(){await this.initialize();await this.#serial(()=>this.#read());return this.snapshot();}
 async privateStatus(index){need(owner(index),'PC24_OWNER_INDEX');await this.refresh();need(this.snapshot().available,'PC24_AUTHORITY_UNAVAILABLE');const p=this.#coordinator.owner(index),status=validateOwnerStatus(p.status(),index,this.#cohort().id),view=validateWalletPrivateStatus(await p.privateStatus());need(view.walletId===status.walletId,'PC24_OWNER_VIEW_WALLET');const operations=this.#record.operations.filter(o=>o.kind==='operation'&&o.ownerIndex===index).map(clone);if(status.operationId&&status.intentId)operations.push({kind:'operation',id:status.operationId,cohortId:this.#cohort().id,ownerIndex:index,intentId:status.intentId,intentKind:'payment',state:status.ownerProgress.settled?'FINISHED':status.active?'RUNNING':'FAILED',errorCode:status.wallet?.errorCode??status.errorCode,derivedFromLiveOwner:true});return{ownerIndex:index,cohortId:this.#cohort().id,status,private:view,operations,requests:this.#record.requests.filter(q=>q.ownerIndex===index).map(clone)};}
 async #checkpoint(value){const c=validateCohortCheckpoint(value,{sequence:true});await this.#serial(async()=>{const old=this.#cohort();need(old&&c.cohortId===old.id&&c.sequence===old.sequence+1,'PC24_CHECKPOINT_SEQUENCE');const {sequence,...checkpoint}=c;await this.#write(r=>({...r,operations:r.operations.map(o=>o.kind==='cohort'?{...o,checkpoint,sequence,authorityState:c.state==='CLOSED'?'CLOSED':o.authorityState,updatedAt:stamp()}:o)}));});}
 async #ownerCheckpoint(index,value){need(!this.#closed,'PC24_AUTHORITY_UNAVAILABLE');need(owner(index),'PC24_OWNER_INDEX');const checkpoint=validateWalletCheckpoint(value);await this.#serial(async()=>{const c=this.#cohort(),old=this.#record.operations.find(o=>o.kind==='owner'&&o.ownerIndex===index);need(c&&(!old||old.id===checkpoint.walletId),'PC24_OWNER_CHECKPOINT_ID');const at=stamp(),entry={kind:'owner',id:checkpoint.walletId,cohortId:c.id,ownerIndex:index,checkpoint,sequence:(old?.sequence??0)+1,createdAt:old?.createdAt??at,updatedAt:at};await this.#write(r=>({...r,operations:old?r.operations.map(o=>o.id===old.id?entry:o):[...r.operations,entry]}));});}
 async submit(input,index=null){await this.initialize();const body=validateCohortCommand(input,index);return this.#admit(async()=>{
  need(!this.#closed&&!this.#readOnly,'PC24_SESSION_UNAVAILABLE');need(!this.#storageError,'PC24_STORAGE_UNAVAILABLE');await this.#serial(()=>this.#read());
  const old=this.#record.requests.find(q=>q.id===body.requestId);
  if(old){need(old.action===body.action&&old.ownerIndex===index&&(body.kind===undefined||old.intentKind===body.kind)&&(body.operationId===undefined||old.operationId===body.operationId),'PC24_REQUEST_CONFLICT');const original=this.#privateRequests.get(old.id);if(original)need(canonical(original)===canonical(body),'PC24_REQUEST_CONFLICT');return{snapshot:this.snapshot(),request:clone(old),operationId:old.operationId,intentId:old.intentId,replayed:true};}
  const cancelling=body.action==='cancel';need(cancelling||!this.snapshot().busy,'PC24_ACTION_IN_PROGRESS');
  let c=this.#cohort(),op=null,originalOperation=null;const at=stamp();
  if(body.action==='open'){need(!c&&!this.#coordinator,'PC24_ALREADY_OPEN_OR_UNAVAILABLE');await this.#preflight();c={kind:'cohort',id:newId(),checkpoint:null,sequence:0,authorityState:'LIVE',createdAt:at,updatedAt:at};c.checkpoint=initial(c.id);}
  else need(this.snapshot().available,'PC24_AUTHORITY_UNAVAILABLE');
  let view;
  if(index!==null){view=await this.privateStatus(index);if(body.action==='prepareIntent'){
    need(!view.operations.some(o=>o.state==='PREPARED'||['ACCEPTED','RUNNING'].includes(o.state)),'PC24_ORIGINAL_PREPARATION_PENDING');
    if(body.kind==='topup')need(!view.operations.some(o=>o.intentKind==='topup'),'PC24_ORIGINAL_TOPUP_REQUIRED');
    need(!view.private.intents.some(i=>i.kind===body.kind&&canonical(i.terms)===canonical(body.terms)),'PC24_ORIGINAL_RECOVERY_INTENT_REQUIRED');
    if(body.kind==='exit'){const n=view.private.notes.find(n=>body.terms.noteId?n.id===body.terms.noteId&&n.type==='OWNER_BALANCE':n.operationId===body.terms.operationId&&n.type===({sol:'SOL_PAYOUT',btc:'BTC_PAYOUT',refund:'OWNER_REFUND'}[body.terms.role]));need(n&&['AVAILABLE','ISSUED'].includes(n.state),'PC24_ORIGINAL_NOTE_UNAVAILABLE');}
    if(body.kind==='refund')need(body.terms.operationId===view.status.operationId&&view.status.ownerProgress.reservationAttempted&&!view.status.ownerProgress.settled,'PC24_ORIGINAL_REFUND_REQUIRED');
    op={kind:'operation',id:newId(),cohortId:c.id,ownerIndex:index,intentId:newId(),intentKind:body.kind,state:'ACCEPTED',errorCode:null,createdAt:at,updatedAt:at};
   }
   if(['execute','reconcile'].includes(body.action)){op=view.operations.find(o=>o.id===body.operationId);if(body.action==='execute')need(op?.state==='PREPARED','PC24_ORIGINAL_PREPARED_OPERATION_REQUIRED');else{originalOperation=op??(view.status.operationId===body.operationId?{id:body.operationId,intentId:view.status.intentId,intentKind:'payment'}:null);need(originalOperation&&id(originalOperation.intentId),'PC24_ORIGINAL_OPERATION_REQUIRED');if(op)need(['FAILED','INTERRUPTED'].includes(op.state),'PC24_RECONCILIATION_UNAVAILABLE');need(!view.requests.some(q=>q.action==='reconcile'&&q.operationId===body.operationId&&!['FAILED'].includes(q.state)),'PC24_ORIGINAL_RECONCILIATION_REQUIRED');}}
   if(body.action==='join'){need(!view.status.consent,'PC24_ORIGINAL_CONSENT_REQUIRED');need(body.expiresAt>Date.now()&&body.expiresAt-Date.now()<=PRIVATE_COHORT_MAX_CONSENT_MS,'PC24_BOUNDED_CONSENT_REQUIRED');need(view.operations.some(o=>o.intentKind==='topup'&&o.state==='FINISHED')&&BigInt(view.private.availableWei)>=BigInt(PRIVATE_COHORT_TERMS.depositWei),'PC24_FIXED_FUNDING_REQUIRED');}
  }
  if(body.action==='start')need(c.checkpoint.state==='READY_FOR_REVIEW'&&c.checkpoint.counts.joined===2,'PC24_TWO_CONSENTS_REQUIRED');
  if(body.action==='close')for(const i of [0,1]){const v=await this.privateStatus(i);need(v.private.notes.every(n=>['SPENT','WITHDRAWN'].includes(n.state)),'PC24_RETAINED_NOTES');}
  need(this.#record.requests.length<MAX_REQUESTS,'PC24_HISTORY_REQUEST_LIMIT');
  // One cohort admits two deposits and reserves the remaining rows for six exits,
  // original refund/reconciliation and close; failed attempts are never evicted.
  need(this.#record.requests.length+(body.action==='prepareIntent'?8:body.action==='open'?80:2)<=MAX_REQUESTS,'PC24_HISTORY_RECOVERY_HEADROOM');
  if(op&&body.action==='prepareIntent')need(this.#record.operations.length+1<=MAX_OPERATIONS,'PC24_HISTORY_OPERATION_LIMIT');
  const target=op??originalOperation,q={id:body.requestId,action:body.action,ownerIndex:index,operationId:target?.id??null,intentId:target?.intentId??null,intentKind:target?.intentKind??null,state:'ACCEPTED',errorCode:null,createdAt:at,updatedAt:at};
  await this.#serial(()=>this.#write(r=>({...r,operations:body.action==='open'?[...r.operations,c]:body.action==='prepareIntent'?[...r.operations,op]:r.operations,requests:[...r.requests,q]})));
  this.#privateRequests.set(q.id,body);
  const work=async()=>{
   if(body.action==='open'){this.#coordinator=this.#factory({cohortId:c.id,onCheckpoint:v=>this.#checkpoint(v),onOwnerCheckpoint:(i,v)=>this.#ownerCheckpoint(i,v),signal:this.#abortController.signal},this.#dependencies);await this.#coordinator.open();}
   else if(body.action==='start'){await this.#coordinator.start();const outcome=await this.#coordinator.idle();need(outcome.state==='SETTLED_IN_POOL',code(outcome.errorCode)?outcome.errorCode:'PC24_COHORT_NOT_SETTLED');}
   else if(body.action==='close')await this.#coordinator.close();
   else {const p=this.#coordinator.owner(index);if(body.action==='join')await p.join({terms:body.terms,consentToWait:true,expiresAt:body.expiresAt});else if(cancelling)await p.cancel();else if(body.action==='prepareIntent'){const result=await p.action('prepareIntent',{intentId:op.intentId,kind:body.kind,terms:body.terms});need(exact(result,['intentId','kind'])&&result.intentId===op.intentId&&result.kind===body.kind,'PC24_PREPARATION_RESULT');}else await p.action(body.action,{intentId:target.intentId,operationId:target.id});}
  };
  const done=this.#run(q,work,{parallel:cancelling});if(['prepareIntent','join','cancel'].includes(body.action))await done;
  return{snapshot:this.snapshot(),request:clone(this.#record.requests.find(r=>r.id===q.id)),operationId:q.operationId,intentId:q.intentId,replayed:false};
 });}
 #run(q,work,{parallel=false}={}){const task={requestId:q.id,done:null};if(!parallel)this.#active=task;
  task.done=(async()=>{try{await this.#serial(()=>this.#write(r=>({...r,requests:r.requests.map(x=>x.id===q.id?{...x,state:'RUNNING',updatedAt:stamp()}:x),operations:r.operations.map(o=>o.id===q.operationId?{...o,state:'RUNNING',updatedAt:stamp()}:o)})));need(!this.#closed&&!this.#storageError,'PC24_AUTHORITY_UNAVAILABLE');await work();const state=q.action==='prepareIntent'?'PREPARED':'FINISHED';await this.#serial(()=>this.#write(r=>({...r,requests:r.requests.map(x=>x.id===q.id?{...x,state,updatedAt:stamp()}:x),operations:r.operations.map(o=>o.id===q.operationId?{...o,state,errorCode:null,updatedAt:stamp()}:o)})));}
   catch(e){if(!this.#storageError)await this.#serial(async()=>{await this.#write(r=>({...r,requests:r.requests.map(x=>x.id===q.id?{...x,state:'FAILED',errorCode:safe(e),updatedAt:stamp()}:x),operations:r.operations.map(o=>o.id===q.operationId?{...o,state:'FAILED',errorCode:safe(e),updatedAt:stamp()}:o)}));if(q.action==='open')await this.#unavailable(safe(e));});}
   finally{if(this.#active===task)this.#active=null;}})();task.done.catch(e=>this.#fault(e));return task.done;
 }
 async idle(){await this.initialize();await this.#admissions;if(this.#active)await this.#active.done;await this.#writes;return this.snapshot();}
 async #release(){if(!this.#lease)return;await this.#lease.close();this.#lease=null;const lock=JSON.parse(await readFile(this.#leasePath,'utf8'));need(lock.token===this.#leaseToken,'PC24_LEASE_CHANGED');await unlink(this.#leasePath);}
 async close(){if(this.#closed)return;this.#closed=true;await this.#ready?.catch(()=>{});this.#abortController.abort();
  // Begin the coordinator's bounded fatal cleanup before joining work: a stuck
  // proof/checkpoint must not prevent its abort from ever being invoked.
  const abort=Promise.resolve(this.#coordinator?.abort?.()).catch(()=>{});let drained=false;
  const drain=(async()=>{await this.#admissions;await this.#active?.done;await this.#writes;drained=true;})();drain.catch(()=>{});
  await abort;await Promise.race([drain,new Promise(r=>setImmediate(r))]);
  this.#privateRequests.clear();if(!drained){this.#storageError??='PC24_SHUTDOWN_UNCERTAIN';return;}
  if(!this.#readOnly&&!this.#storageError)await this.#serial(()=>this.#unavailable('PC24_AUTHORITY_UNAVAILABLE'));await this.#release();}
}
