/** PC23 owner-authenticated client bridge. Only coarse, non-secret state is
 * journaled here. Private intents and balances remain in the live worker's
 * encrypted custody. History never reconstructs a lost authority or sends. */
import {randomBytes,createHash} from 'node:crypto';
import {fork} from 'node:child_process';
import {open,readFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical} from '../../crypto/privacy.mjs';
import {PrivateOperationStore,MAX_OPERATIONS,MAX_REQUESTS} from '../../payments/private-operation-store.mjs';
export const SHARED_WALLET_PROFILE='PC23_SHARED_LOCAL_V1';
export const WALLET_PHASES=Object.freeze(['OPENING','READY','PREPARING','FUNDING','OWNER_RELEASED','SOL_PENDING','SOL_FINALIZED','BTC_PENDING','BTC_CONFIRMED','SETTLING','SETTLED_IN_POOL','WITHDRAWING','REFUND_NOTE_RETAINED','QUARANTINED','CLOSING','CLOSED','FAILED']);
const noteId=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const CHECKPOINT=['profile','walletId','phase','progressCode','engineState','authorityState','activeOperationId','operationCount','notesState','errorCode'];
const id=x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x),requestId=x=>typeof x==='string'&&/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(x);
const code=(x,fallback='PRIVATE_WALLET_FAILED')=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{1,100}$/.test(x)?x:fallback;
const fail=c=>{throw Object.assign(new Error(c),{code:c});};const need=(v,c)=>{if(!v)fail(c);};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const stamp=()=>new Date().toISOString(),clone=x=>structuredClone(x),newId=()=>randomBytes(16).toString('hex');
export function validateWalletCheckpoint(value){
 need(exact(value,CHECKPOINT),'PRIVATE_WALLET_CHECKPOINT_FIELDS');
 need(value.profile===SHARED_WALLET_PROFILE&&id(value.walletId),'PRIVATE_WALLET_CHECKPOINT_ID');
 need(WALLET_PHASES.includes(value.phase)&&code(value.progressCode,null),'PRIVATE_WALLET_CHECKPOINT_PHASE');
 need(['RUNNING','IDLE','STOPPED'].includes(value.engineState)&&['LIVE','UNAVAILABLE','CLOSED'].includes(value.authorityState),'PRIVATE_WALLET_CHECKPOINT_STATE');
 need(value.activeOperationId===null||id(value.activeOperationId),'PRIVATE_WALLET_CHECKPOINT_OPERATION');
 need(Number.isSafeInteger(value.operationCount)&&value.operationCount>=0&&value.operationCount<=64,'PRIVATE_WALLET_CHECKPOINT_COUNT');
 need(['EMPTY','RETAINED','PENDING','UNKNOWN'].includes(value.notesState),'PRIVATE_WALLET_CHECKPOINT_NOTES');
 need(value.errorCode===null||code(value.errorCode,null),'PRIVATE_WALLET_CHECKPOINT_ERROR');
 if(value.phase==='CLOSED')need(value.authorityState==='CLOSED'&&value.engineState==='STOPPED'&&value.notesState==='EMPTY','PRIVATE_WALLET_FALSE_CLOSE');
 return clone(value);
}
/** Exact owner-only view. Never forward arbitrary engine data to HTTP. */
export function validateWalletPrivateStatus(value){
 need(exact(value,['walletId','availableWei','pendingWei','unavailableWei','notes','intents','observation'])&&id(value.walletId)&&value.observation==='LIVE','PRIVATE_WALLET_PRIVATE_FIELDS');
 const amount=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(x)&&BigInt(x)<2n**128n;
 need(['availableWei','pendingWei','unavailableWei'].every(k=>amount(value[k]))&&Array.isArray(value.notes)&&value.notes.length<=64&&Array.isArray(value.intents)&&value.intents.length<=64,'PRIVATE_WALLET_PRIVATE_BALANCE');
 for(const n of value.notes)need(exact(n,['id','type','state','amountWei','operationId'])&&noteId(n.id)&&['OWNER_BALANCE','SOL_PAYOUT','BTC_PAYOUT','OWNER_REFUND'].includes(n.type)&&['AVAILABLE','ISSUED','LOCKED','PENDING','SPENT','WITHDRAWN','UNKNOWN','UNAVAILABLE'].includes(n.state)&&amount(n.amountWei)&&(n.operationId===null||id(n.operationId)),'PRIVATE_WALLET_PRIVATE_NOTE');
 for(const intent of value.intents){need(exact(intent,['intentId','kind','terms','state'])&&id(intent.intentId)&&code(intent.state,null)&&['topup','payment','exit','refund'].includes(intent.kind),'PRIVATE_WALLET_PRIVATE_INTENT');const t=intent.terms;if(intent.kind==='topup')need(exact(t,['amount'])&&amount(t.amount),'PRIVATE_WALLET_PRIVATE_TERMS');else if(intent.kind==='payment')need(exact(t,['budget','solCompensation','amountSol','numerator','denominator'])&&Object.values(t).every(amount),'PRIVATE_WALLET_PRIVATE_TERMS');else if(intent.kind==='refund')need(exact(t,['operationId'])&&id(t.operationId),'PRIVATE_WALLET_PRIVATE_TERMS');else need(exact(t,['noteId'])&&noteId(t.noteId)||exact(t,['operationId','role'])&&id(t.operationId)&&['sol','btc','refund'].includes(t.role),'PRIVATE_WALLET_PRIVATE_TERMS');}
 return clone(value);
}
function validateRecord(record){
 need(record.version===1&&Array.isArray(record.operations)&&Array.isArray(record.requests),'PRIVATE_WALLET_JOURNAL');
 const ids=new Set();for(const r of record.operations){need(id(r.id)&&!ids.has(r.id),'PRIVATE_WALLET_JOURNAL_ID');ids.add(r.id);
  if(r.kind==='wallet'){need(exact(r,['kind','id','checkpoint','sequence','createdAt','updatedAt']),'PRIVATE_WALLET_JOURNAL_FIELDS');validateWalletCheckpoint(r.checkpoint);need(r.checkpoint.walletId===r.id&&Number.isSafeInteger(r.sequence)&&r.sequence>=0,'PRIVATE_WALLET_JOURNAL_SEQUENCE');}
  else{need(exact(r,['kind','id','walletId','intentId','intentKind','state','checkpoint','createdAt','updatedAt']),'PRIVATE_WALLET_JOURNAL_FIELDS');need(r.kind==='operation'&&id(r.walletId)&&id(r.intentId)&&['topup','payment','exit','refund'].includes(r.intentKind)&&['PREPARING','PREPARED','QUEUED','RUNNING','FINISHED','FAILED','INTERRUPTED'].includes(r.state),'PRIVATE_WALLET_JOURNAL_OPERATION');if(r.checkpoint!==null){validateWalletCheckpoint(r.checkpoint);need(r.checkpoint.walletId===r.walletId,'PRIVATE_WALLET_JOURNAL_ID');}}
 }
 const requestIds=new Set();for(const r of record.requests){need(!requestIds.has(r.id),'PRIVATE_WALLET_JOURNAL_REQUEST_DUPLICATE');requestIds.add(r.id);need(exact(r,['id','action','walletId','operationId','intentId','kind','fingerprint','createdAt'])&&requestId(r.id)&&['open','prepareIntent','execute','reconcile','close'].includes(r.action)&&id(r.walletId)&&(r.operationId===null||id(r.operationId))&&(r.intentId===null||id(r.intentId))&&(r.kind===null||['topup','payment','exit','refund'].includes(r.kind))&&(r.fingerprint===null||/^[0-9a-f]{64}$/.test(r.fingerprint)),'PRIVATE_WALLET_JOURNAL_REQUEST');}
 return record;
}
const initial=walletId=>({profile:SHARED_WALLET_PROFILE,walletId,phase:'OPENING',progressCode:'WALLET_OPEN_ACCEPTED',engineState:'RUNNING',authorityState:'LIVE',activeOperationId:null,operationCount:0,notesState:'EMPTY',errorCode:null});
export function validateWalletIntentTerms(kind,terms){
 const positive=x=>typeof x==='string'&&/^[1-9][0-9]{0,19}$/.test(x)&&BigInt(x)<2n**64n;
 if(kind==='topup')need(exact(terms,['amount'])&&positive(terms.amount),'PRIVATE_WALLET_INTENT_TERMS');
 else if(kind==='payment'){need(exact(terms,['budget','solCompensation','amountSol','numerator','denominator'])&&Object.values(terms).every(positive),'PRIVATE_WALLET_INTENT_TERMS');const btc=BigInt(terms.amountSol)*BigInt(terms.numerator)/BigInt(terms.denominator);need(BigInt(terms.solCompensation)<BigInt(terms.budget)&&btc>0n&&btc<2n**64n,'PRIVATE_WALLET_INTENT_AMOUNTS');}
 else if(kind==='refund')need(exact(terms,['operationId'])&&id(terms.operationId),'PRIVATE_WALLET_INTENT_TERMS');
 else if(kind==='exit')need(exact(terms,['noteId'])&&noteId(terms.noteId)||exact(terms,['operationId','role'])&&id(terms.operationId)&&['sol','btc','refund'].includes(terms.role),'PRIVATE_WALLET_INTENT_TERMS');
 else fail('PRIVATE_WALLET_INTENT_KIND');return clone(terms);
}
function validateCommand(body){
 need(body&&typeof body==='object'&&!Array.isArray(body)&&requestId(body.requestId),'PRIVATE_WALLET_COMMAND');
 if(body.action==='open')need(exact(body,['action','requestId','profile'])&&body.profile===SHARED_WALLET_PROFILE,'PRIVATE_WALLET_COMMAND_FIELDS');
 else if(body.action==='prepareIntent'){need(exact(body,['action','requestId','kind','terms'])&&['topup','payment','exit','refund'].includes(body.kind),'PRIVATE_WALLET_COMMAND_FIELDS');need(body.terms&&Object.getPrototypeOf(body.terms)===Object.prototype&&Buffer.byteLength(canonical(body.terms))<=4096,'PRIVATE_WALLET_INTENT');validateWalletIntentTerms(body.kind,body.terms);}
 else if(['execute','reconcile'].includes(body.action))need(exact(body,['action','requestId','operationId'])&&id(body.operationId),'PRIVATE_WALLET_COMMAND_FIELDS');
 else if(body.action==='close')need(exact(body,['action','requestId']),'PRIVATE_WALLET_COMMAND_FIELDS');else fail('PRIVATE_WALLET_COMMAND_UNKNOWN');
 return clone(body);
}
/** Bound historical admission without spending the capacity needed to exit.
 * Counts use authenticated owner-only note facts, never cached public amounts.
 * Failed/unresolved payments conservatively reserve their two terminal notes. */
export function assertWalletHistoryAdmission({record,walletId,body,view}){
 const ops=record.operations.filter(o=>o.kind==='operation'&&o.walletId===walletId),prepared=ops.filter(o=>['PREPARING','PREPARED'].includes(o.state));
 const cleanup=body.action==='prepareIntent'&&['exit','refund'].includes(body.kind);
 const creates=body.action==='open'||body.action==='prepareIntent';
 need(record.requests.length<MAX_REQUESTS,'PRIVATE_WALLET_HISTORY_REQUEST_LIMIT');
 if(creates)need(record.operations.length<MAX_OPERATIONS,'PRIVATE_WALLET_HISTORY_OPERATION_LIMIT');
 if(body.action==='open'){need(record.requests.length+2<=MAX_REQUESTS,'PRIVATE_WALLET_HISTORY_RECOVERY_HEADROOM');return;}
 if(body.action==='close'){const w=record.operations.find(o=>o.kind==='wallet'&&o.id===walletId);need(w?.checkpoint.notesState==='EMPTY','PRIVATE_WALLET_LIVE_HOLDINGS');return;}
 if(body.action==='reconcile')return; // One reserved request per operation; repeats reuse it without growing history.
 if(cleanup){
  need(!prepared.some(o=>['exit','refund'].includes(o.intentKind)),'PRIVATE_WALLET_RECOVERY_PREPARATION_PENDING');
  need(record.requests.length+4<=MAX_REQUESTS,'PRIVATE_WALLET_HISTORY_RECOVERY_HEADROOM');
  need(view,'PRIVATE_WALLET_LIVE_OWNER_VIEW_REQUIRED');
  const sameTerms=i=>i.kind===body.kind&&canonical(i.terms)===canonical(body.terms);
  need(!view.intents.some(sameTerms),'PRIVATE_WALLET_ORIGINAL_RECOVERY_INTENT_REQUIRED');
  if(body.kind==='exit'){
   const t=body.terms,n=view.notes.find(n=>t.noteId?n.id===t.noteId&&n.type==='OWNER_BALANCE':n.operationId===t.operationId&&n.type===({sol:'SOL_PAYOUT',btc:'BTC_PAYOUT',refund:'OWNER_REFUND'}[t.role]));
   need(n&&['AVAILABLE','ISSUED'].includes(n.state),'PRIVATE_WALLET_NOTE_UNAVAILABLE');
  }else need(ops.some(o=>o.id===body.terms.operationId&&o.intentKind==='payment'&&['FAILED','INTERRUPTED'].includes(o.state)),'PRIVATE_WALLET_REFUND_OPERATION_UNAVAILABLE');
  return;
 }
 const executing=body.action==='execute'?ops.find(o=>o.id===body.operationId):null;
 if(executing&&['exit','refund'].includes(executing.intentKind)){need(record.requests.length+3<=MAX_REQUESTS,'PRIVATE_WALLET_HISTORY_RECOVERY_HEADROOM');return;}
 need(view,'PRIVATE_WALLET_LIVE_OWNER_VIEW_REQUIRED');
 const live=view.notes.filter(n=>!['SPENT','WITHDRAWN'].includes(n.state)).length;
 const future=prepared.reduce((n,o)=>n+(o.intentKind==='topup'?1:o.intentKind==='payment'?2:0),0)+ops.filter(o=>o.intentKind==='payment'&&['FAILED','INTERRUPTED'].includes(o.state)).length*2;
 const added=body.action==='prepareIntent'?(body.kind==='topup'?1:body.kind==='payment'?2:0):0;
 const extraPrepared=body.action==='prepareIntent'?1:body.action==='execute'?-1:0;
 need(record.operations.length+(creates?1:0)+live+future+added+1<=MAX_OPERATIONS,'PRIVATE_WALLET_HISTORY_EXIT_HEADROOM');
 need(record.requests.length+1+Math.max(0,prepared.length+extraPrepared)+3*(live+future+added)+4+Math.max(0,prepared.length+extraPrepared)<=MAX_REQUESTS,'PRIVATE_WALLET_HISTORY_RECOVERY_HEADROOM');
}
export class PrivateWalletSession{
 #directory;#store;#record;#ready;#closed=false;#readOnly=false;#storageError=null;#queue=Promise.resolve();#admissions=Promise.resolve();#job;#spawn;#lease;#leasePath;#leaseToken;#preflight;
 constructor(directory,{store,spawnWorker,preflight}={}){this.#directory=resolve(directory);this.#store=store??new PrivateOperationStore(this.#directory);this.#leasePath=join(this.#directory,'shared-wallet-session.lock');this.#spawn=spawnWorker??(()=>fork(fileURLToPath(new URL('../../../../backend/src/custody/wallet/private-wallet-worker.mjs',import.meta.url)),[],{cwd:fileURLToPath(new URL('..',import.meta.url)),execArgv:[],stdio:['ignore','pipe','pipe','ipc'],serialization:'json',env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}}));this.#preflight=preflight??(async()=>{});}
 initialize(){return this.#ready??=this.#initialize();}
 async #initialize(){this.#record=validateRecord(await this.#store.initialize());this.#leaseToken=newId();
  try{this.#lease=await open(this.#leasePath,'wx',0o600);await this.#lease.writeFile(JSON.stringify({version:1,pid:process.pid,token:this.#leaseToken}));await this.#lease.sync();const d=await open(this.#directory,'r');try{await d.sync();}finally{await d.close();}}
  catch(e){if(e.code!=='EEXIST'){if(this.#lease){await this.#lease.close().catch(()=>{});this.#lease=null;await unlink(this.#leasePath).catch(()=>{});}throw e;}this.#readOnly=true;this.#storageError='PRIVATE_WALLET_SESSION_ALREADY_OPEN';}
  if(!this.#readOnly){try{const w=this.#wallet();if(w&&w.checkpoint.authorityState==='LIVE')await this.#unavailable('PRIVATE_WALLET_AUTHORITY_UNAVAILABLE');}catch(e){await this.#release();throw e;}}
  return this.snapshot();
 }
 #serial(work){const p=this.#queue.then(work);this.#queue=p.catch(()=>{});return p;}
 #admit(work){const p=this.#admissions.then(work);this.#admissions=p.catch(()=>{});return p;}
 #wallet(){return this.#record?.operations.findLast(r=>r.kind==='wallet');}
 async #write(transform){try{this.#record=validateRecord(await this.#store.update(this.#record.revision,transform));}catch(e){if(['PRIVATE_STORE_OPERATIONS_LIMIT','PRIVATE_STORE_REQUESTS_LIMIT'].includes(e.code))throw e;this.#storageError=code(e.code??e.message,'PRIVATE_WALLET_STORAGE_UNAVAILABLE');this.#job?.abort(this.#storageError);throw e;}}
 async #unavailable(errorCode){const w=this.#wallet();if(!w||w.checkpoint.authorityState==='CLOSED')return;const checkpoint={...w.checkpoint,authorityState:'UNAVAILABLE',engineState:'STOPPED',errorCode,progressCode:'WALLET_AUTHORITY_UNAVAILABLE',notesState:w.checkpoint.notesState==='EMPTY'?'EMPTY':'UNKNOWN'};await this.#write(r=>({...r,operations:r.operations.map(x=>x.id===w.id?{...x,checkpoint,updatedAt:stamp()}:x.kind==='operation'&&x.walletId===w.id&&!['FINISHED','FAILED'].includes(x.state)?{...x,state:'INTERRUPTED',updatedAt:stamp()}:x)}));}
 snapshot(){need(this.#record,'PRIVATE_WALLET_SESSION_NOT_READY');const w=this.#wallet(),live=Boolean(this.#job&&!this.#closed&&!this.#readOnly&&!this.#storageError&&w?.checkpoint.authorityState==='LIVE'&&!['OPENING','CLOSING'].includes(w?.checkpoint.phase));return{version:2,profile:SHARED_WALLET_PROFILE,wallet:w?{...clone(w.checkpoint),observation:live?'LIVE':'RETAINED_HISTORY'}:null,operations:this.#record.operations.filter(r=>r.kind==='operation').map(clone).reverse(),requests:this.#record.requests.map(r=>({id:r.id,action:r.action,operationId:r.operationId,intentId:r.intentId})),busy:Boolean(this.#job?.active),occupied:Boolean(this.#readOnly||this.#job||w?.checkpoint.authorityState==='UNAVAILABLE'&&w.checkpoint.notesState!=='EMPTY'),available:live,storageError:this.#storageError,capabilities:{browserReconnect:true,keeperRestart:false,nodeRestart:false,explicitExit:true,fullAcceptance:false}};}
 async refresh(){await this.initialize();await this.#serial(async()=>{try{this.#record=validateRecord(await this.#store.read());}catch(e){this.#storageError=code(e.code??e.message,'PRIVATE_WALLET_STORAGE_UNAVAILABLE');this.#job?.abort(this.#storageError);}});return this.snapshot();}
 async privateStatus(){await this.refresh();need(this.snapshot().available,'PRIVATE_WALLET_AUTHORITY_UNAVAILABLE');const view=validateWalletPrivateStatus(await this.#rpc('privateStatus',{},false));need(view.walletId===this.#wallet().id,'PRIVATE_WALLET_PRIVATE_ID');return view;}
 async submit(input){await this.initialize();const body=validateCommand(input);return this.#admit(async()=>{
  need(!this.#closed&&!this.#readOnly,'PRIVATE_WALLET_SESSION_UNAVAILABLE');need(!this.#storageError,'PRIVATE_WALLET_STORAGE_UNAVAILABLE');await this.#serial(async()=>{this.#record=validateRecord(await this.#store.read());});
  const fingerprint=body.action==='prepareIntent'?null:createHash('sha256').update(canonical(body)).digest('hex'),old=this.#record.requests.find(r=>r.id===body.requestId);
  if(old){need(old.action===body.action&&old.fingerprint===fingerprint,'PRIVATE_WALLET_REQUEST_CONFLICT');if(body.action==='prepareIntent'){need(!this.#job?.active,'PRIVATE_WALLET_ACTION_IN_PROGRESS');need(old.kind===body.kind&&this.#job&&this.#wallet().id===old.walletId,'PRIVATE_WALLET_PRIVATE_REPLAY_UNAVAILABLE');const result=await this.#rpc('prepareIntent',{intentId:old.intentId,kind:body.kind,terms:body.terms},false);need(result?.intentId===old.intentId&&result?.kind===body.kind,'PRIVATE_WALLET_PREPARATION_RESULT');const prior=this.#record.operations.find(o=>o.id===old.operationId);if(prior&&['PREPARING','FAILED'].includes(prior.state)&&!this.#record.requests.some(r=>r.action==='execute'&&r.operationId===prior.id))await this.#serial(()=>this.#write(r=>({...r,operations:r.operations.map(o=>o.id===prior.id?{...o,state:'PREPARED',updatedAt:stamp()}:o)})));}if(body.action==='reconcile'){const prior=this.#record.operations.find(o=>o.id===old.operationId);if(prior&&this.#wallet()?.id===old.walletId&&this.#job&&(['FAILED','INTERRUPTED'].includes(prior.state)||prior.checkpoint?.phase==='QUARANTINED')){need(this.snapshot().available&&!this.#job.active,'PRIVATE_WALLET_ACTION_IN_PROGRESS');this.#run('reconcile',{operationId:prior.id,intentId:prior.intentId},prior.id);}}return{snapshot:this.snapshot(),operationId:old.operationId,intentId:old.intentId,replayed:true};}
  need(!this.#job?.active,'PRIVATE_WALLET_ACTION_IN_PROGRESS');let w=this.#wallet(),op=null;const at=stamp();
  if(body.action==='open'){need(!this.#job&&(!w||w.checkpoint.authorityState==='CLOSED'),'PRIVATE_WALLET_ALREADY_OPEN_OR_UNAVAILABLE');await this.#preflight();w={kind:'wallet',id:newId(),checkpoint:null,sequence:0,createdAt:at,updatedAt:at};w.checkpoint=initial(w.id);}
  else need(this.snapshot().available,'PRIVATE_WALLET_AUTHORITY_UNAVAILABLE');
  if(body.action==='prepareIntent')op={kind:'operation',id:newId(),walletId:w.id,intentId:newId(),intentKind:body.kind,state:'PREPARING',checkpoint:null,createdAt:at,updatedAt:at};
  if(['execute','reconcile'].includes(body.action)){op=this.#record.operations.find(r=>r.kind==='operation'&&r.id===body.operationId&&r.walletId===w.id);need(op,'PRIVATE_WALLET_OPERATION_NOT_FOUND');if(body.action==='execute')need(op.state==='PREPARED','PRIVATE_WALLET_OPERATION_ALREADY_STARTED');else{need(['FAILED','INTERRUPTED'].includes(op.state)||op.checkpoint?.phase==='QUARANTINED','PRIVATE_WALLET_RECONCILIATION_UNAVAILABLE');need(!this.#record.requests.some(r=>r.action==='reconcile'&&r.operationId===op.id),'PRIVATE_WALLET_ORIGINAL_RECONCILIATION_REQUEST_REQUIRED');}op={...op,state:body.action==='execute'?'QUEUED':op.state,updatedAt:at};}
  let view=null;
  if(!['open','close'].includes(body.action)){
   view=validateWalletPrivateStatus(await this.#rpc('privateStatus',{},false));need(view.walletId===w.id,'PRIVATE_WALLET_PRIVATE_ID');
   if(body.action==='prepareIntent'&&['topup','payment'].includes(body.kind))need(!['UNKNOWN','PENDING'].includes(w.checkpoint.notesState),'PRIVATE_WALLET_UNRESOLVED_STATE');
  }
  assertWalletHistoryAdmission({record:this.#record,walletId:w.id,body,view});
  // Preparation has no chain/signing side effects. Admit its private encrypted
  // intent first, then publish acceptance. A rejected private preflight never
  // burns the recovery rows reserved for already funded notes.
  if(body.action==='prepareIntent'){
   const result=await this.#rpc('prepareIntent',{intentId:op.intentId,kind:body.kind,terms:body.terms},false);
   need(exact(result,['intentId','kind'])&&result.intentId===op.intentId&&result.kind===body.kind,'PRIVATE_WALLET_PREPARATION_RESULT');
   op={...op,state:'PREPARED'};
  }
  const request={id:body.requestId,action:body.action,walletId:w.id,operationId:op?.id??null,intentId:op?.intentId??null,kind:op?.intentKind??null,fingerprint,createdAt:at};
  await this.#serial(()=>this.#write(r=>({...r,operations:body.action==='open'?[...r.operations,w]:body.action==='prepareIntent'?[...r.operations,op]:op?r.operations.map(x=>x.id===op.id?op:x):r.operations,requests:[...r.requests,request]})));
  if(body.action==='open'){try{this.#launch(w.id);this.#run('open',{},null);}catch(e){await this.#serial(()=>this.#unavailable(code(e.code??e.message,'PRIVATE_WALLET_WORKER_START_FAILED')));throw e;}}
  else if(body.action!=='prepareIntent')this.#run(body.action,op?{intentId:op.intentId,operationId:op.id}:{},op?.id??null);
  return{snapshot:this.snapshot(),operationId:op?.id??null,intentId:op?.intentId??null,replayed:false};
 });}
 #launch(walletId){const child=this.#spawn();need(child&&typeof child.send==='function'&&typeof child.on==='function','PRIVATE_WALLET_WORKER_INVALID');let closed=false,finalized=false,forceTimer,logBytes=0,chain=Promise.resolve(),done;const completion=new Promise(r=>{done=r;});const job={walletId,child,active:null,pending:new Map(),completion,sequence:0,fault:null};this.#job=job;
  const abort=c=>{job.fault??=code(c,'PRIVATE_WALLET_WORKER_PROTOCOL');for(const p of job.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(Error(job.fault),{code:job.fault}));}job.pending.clear();try{if(child.connected)child.disconnect();}catch{}forceTimer??=setTimeout(()=>{if(!closed)child.kill?.('SIGKILL');},60000);forceTimer.unref?.();};job.abort=abort;
  for(const s of [child.stdout,child.stderr])s?.on('data',b=>{logBytes+=b.length;if(logBytes>1024*1024)abort('PRIVATE_WALLET_WORKER_LOG_LIMIT');});
  child.on('message',m=>{chain=chain.then(async()=>{need(!job.fault,'PRIVATE_WALLET_WORKER_FAILED');need(Buffer.byteLength(JSON.stringify(m))<=32768,'PRIVATE_WALLET_MESSAGE_LIMIT');
   if(m?.type==='checkpoint'){need(exact(m,['type','walletId','sequence','payload'])&&m.walletId===walletId&&Number.isSafeInteger(m.sequence)&&m.sequence===job.sequence+1,'PRIVATE_WALLET_CHECKPOINT_SEQUENCE');const c=validateWalletCheckpoint(m.payload);need(c.walletId===walletId,'PRIVATE_WALLET_CHECKPOINT_ID');need(c.activeOperationId===null||c.activeOperationId===job.active?.operationId,'PRIVATE_WALLET_CHECKPOINT_OPERATION');await this.#serial(async()=>{const w=this.#wallet();need(w.id===walletId,'PRIVATE_WALLET_STALE_LIFETIME');await this.#write(r=>({...r,operations:r.operations.map(x=>x.id===walletId?{...x,checkpoint:c,sequence:m.sequence,updatedAt:stamp()}:x.kind==='operation'&&x.id===c.activeOperationId?{...x,state:'RUNNING',checkpoint:c,updatedAt:stamp()}:x)}));});job.sequence=m.sequence;await new Promise((resolve,reject)=>child.send({type:'ack',walletId,sequence:m.sequence},e=>e?reject(e):resolve()));}
   else if(m?.type==='result'){need(m&&typeof m.ok==='boolean'&&exact(m,m.ok?['type','commandId','ok','result']:['type','commandId','ok','errorCode']),'PRIVATE_WALLET_RESULT_FIELDS');const p=job.pending.get(m.commandId);need(p,'PRIVATE_WALLET_RESULT_COMMAND');job.pending.delete(m.commandId);clearTimeout(p.timer);if(m.ok)p.resolve(m.result);else p.reject(Object.assign(Error(code(m.errorCode)),{code:code(m.errorCode)}));}
   else fail('PRIVATE_WALLET_WORKER_PROTOCOL');
  }).catch(e=>abort(e.code??e.message));});
  child.once('error',e=>abort(e.code));child.once('disconnect',()=>{void new Promise(r=>setImmediate(r)).then(()=>chain).then(()=>{if(!closed&&this.#wallet()?.checkpoint.authorityState!=='CLOSED'){abort('PRIVATE_WALLET_WORKER_DISCONNECTED');void this.#serial(()=>this.#unavailable(job.fault));}});});
  const finalize=()=>{if(finalized)return;finalized=true;void new Promise(r=>setImmediate(r)).then(()=>chain).then(async()=>{closed=true;clearTimeout(forceTimer);for(const s of [child.stdout,child.stderr])s?.destroy?.();for(const p of job.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(Error('PRIVATE_WALLET_WORKER_EXITED'),{code:'PRIVATE_WALLET_WORKER_EXITED'}));}job.pending.clear();if(this.#wallet()?.checkpoint.authorityState!=='CLOSED')await this.#serial(()=>this.#unavailable(job.fault??'PRIVATE_WALLET_WORKER_EXITED'));if(this.#job===job)this.#job=null;done();}).catch(()=>{this.#storageError='PRIVATE_WALLET_FINALIZATION_FAILED';if(this.#job===job)this.#job=null;done();});};child.once('exit',finalize);child.once('close',finalize);
 }
 #rpc(action,input,heavy){const job=this.#job;need(job&&!job.fault&&job.child.connected!==false,'PRIVATE_WALLET_AUTHORITY_UNAVAILABLE');const commandId=newId();need(job.pending.size<8,'PRIVATE_WALLET_COMMAND_LIMIT');const message={type:'command',walletId:job.walletId,commandId,action,input};need(Buffer.byteLength(JSON.stringify(message))<=32768,'PRIVATE_WALLET_COMMAND_SIZE');return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{job.abort('PRIVATE_WALLET_COMMAND_TIMEOUT');},heavy?3*60*60_000:30_000);job.pending.set(commandId,{resolve,reject,timer});try{job.child.send(message,e=>{if(e)job.abort('PRIVATE_WALLET_SEND_FAILED');});}catch{job.abort('PRIVATE_WALLET_SEND_FAILED');}});}
 #run(action,input,operationId){const job=this.#job;need(job&&!job.active,'PRIVATE_WALLET_ACTION_IN_PROGRESS');const task={action,operationId};job.active=task;const work=this.#rpc(action,input,true);task.done=work.then(()=>this.#serial(async()=>{if(operationId)await this.#write(r=>({...r,operations:r.operations.map(x=>x.id===operationId?{...x,state:x.checkpoint?.phase==='QUARANTINED'?'FAILED':'FINISHED',updatedAt:stamp()}:x)}));})).catch(e=>this.#serial(async()=>{if(operationId)await this.#write(r=>({...r,operations:r.operations.map(x=>x.id===operationId?{...x,state:'FAILED',updatedAt:stamp()}:x)}));else if(action==='open')await this.#unavailable(code(e.code??e.message));})).finally(()=>{if(job.active===task)job.active=null;}).catch(e=>{this.#storageError=code(e.code??e.message,'PRIVATE_WALLET_STORAGE_UNAVAILABLE');job.abort(this.#storageError);});}
 async idle(){await this.initialize();if(this.#job?.active)await this.#job.active.done;await this.#queue;return this.snapshot();}
 async #release(){if(!this.#lease)return;await this.#lease.close();this.#lease=null;const lock=JSON.parse(await readFile(this.#leasePath,'utf8'));need(lock.token===this.#leaseToken,'PRIVATE_WALLET_LEASE_CHANGED');await unlink(this.#leasePath);}
 async close(){if(this.#closed)return;this.#closed=true;await this.#ready?.catch(()=>{});await this.#admissions;await this.#queue;if(this.#job?.active)await this.#job.active.done;const job=this.#job;if(job){try{job.child.send({type:'stop'},()=>{});}catch{}job.abort('PRIVATE_WALLET_SESSION_CLOSED');await job.completion;}await this.#queue;await this.#release();}
}
