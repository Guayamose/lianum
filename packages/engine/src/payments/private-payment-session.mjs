/** One local wallet coordinator. Public history is durable; volatile native
 * custody is never reconstructed or resent from this journal. Trusted local OS. */
import { randomBytes, createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { open, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from '../crypto/privacy.mjs';
import { PrivateOperationStore } from './private-operation-store.mjs';

export const PRIVATE_PAYMENT_PROFILE = Object.freeze({ id: 'PC18_EXACT_LOCAL_V1', fundingWei: '1000000000000000', lamports: '3000000', sats: '100000', solCompensationWei: '500000000000000', btcCompensationWei: '500000000000000', realFunds: false });
const CAPABILITIES = Object.freeze({ browserReconnect: true, executionRestart: false, payoutWorkerRestart: true, recoveryWithdrawal: true, fullAcceptance: false });
const PHASES = ['PREPARED','QUEUED','PREPARING','FUNDING','AUTHORIZING','OWNER_RELEASED','SOL_PENDING','SOL_FINALIZED','BTC_PENDING','BTC_CONFIRMED','SETTLING','WITHDRAWING','RECOVERABLE','RECOVERING','REFUNDABLE','REFUNDING','REFUNDED','COMPLETED','FAILED','INTERRUPTED'];
const OWNERS = ['PREPARING','PACKAGES_ACKNOWLEDGED','EXIT_CONFIRMED'];
const EXPOSURES = ['NONE','MAY_HAVE_SUBMITTED','SIGNED_RETAINED','OBSERVED'];
const PAYOUTS = ['PENDING','ISSUED','WITHDRAWN'];
const TERMINAL = new Set(['COMPLETED','REFUNDED','FAILED','INTERRUPTED']);
const KEYS = ['phase','progressCode','engineState','ownerState','settlementState','exposure','payouts','cleanupState','errorCode','observation','recoveryState','ownerRefund'];
const code = (value, fallback='PRIVATE_OPERATION_FAILED') => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,100}$/.test(value) ? value : fallback;
const fail = value => { throw Object.assign(new Error(value), { code: value }); };
const need = (value, error) => { if (!value) fail(error); };
const clone = value => structuredClone(value);
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const id = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
const requestId = value => typeof value === 'string' && /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(value);
const stamp = () => new Date().toISOString();
const emptyOwnerRefund=()=>({state:'NONE',amountWei:null,claimEpoch:null,eligibleAt:null});
const refundStates=['NONE','WAITING','ELIGIBLE','NOTE_ISSUED','WITHDRAWN','UNKNOWN','UNAVAILABLE'];
function ownerRefundUnavailable(refund){return refund.state==='NONE'||refund.state==='WITHDRAWN'?clone(refund):{...refund,state:'UNAVAILABLE'};}

export function validatePrivateCheckpoint(input, previous) {
  need(input && typeof input === 'object' && !Array.isArray(input), 'PRIVATE_CHECKPOINT_FIELDS');
  const value = { ...input, errorCode: input.errorCode ?? null, recoveryState: input.recoveryState ?? 'NONE', ownerRefund: input.ownerRefund ?? emptyOwnerRefund() };
  need(exact(value,KEYS), 'PRIVATE_CHECKPOINT_FIELDS');
  need(PHASES.includes(value.phase) && !['PREPARED','QUEUED','INTERRUPTED'].includes(value.phase), 'PRIVATE_CHECKPOINT_PHASE');
  need(typeof value.progressCode === 'string' && /^[A-Z][A-Z0-9_]{1,100}$/.test(value.progressCode), 'PRIVATE_CHECKPOINT_PROGRESS');
  need(['RUNNING','STOPPED'].includes(value.engineState), 'PRIVATE_CHECKPOINT_ENGINE');
  need(OWNERS.includes(value.ownerState), 'PRIVATE_CHECKPOINT_OWNER');
  need(['NOT_FUNDED','FUNDED','PAYOUT_NOTES_ISSUED','RECOVERY_NOTE_ISSUED','UNKNOWN'].includes(value.settlementState), 'PRIVATE_CHECKPOINT_SETTLEMENT');
  need(exact(value.exposure,['evm','sol','btc']) && Object.values(value.exposure).every(x=>EXPOSURES.includes(x)), 'PRIVATE_CHECKPOINT_EXPOSURE');
  need(exact(value.payouts,['sol','btc']), 'PRIVATE_CHECKPOINT_PAYOUT');
  for(const role of ['sol','btc']) {
    const p=value.payouts[role];need(exact(p,['state','amountWei'])&&PAYOUTS.includes(p.state), 'PRIVATE_CHECKPOINT_PAYOUT');
    need(p.amountWei===null||p.amountWei==='500000000000000','PRIVATE_CHECKPOINT_AMOUNT');
    need((p.state==='PENDING')===(p.amountWei===null),'PRIVATE_CHECKPOINT_AMOUNT');
    if(previous)need(PAYOUTS.indexOf(p.state)>=PAYOUTS.indexOf(previous.payouts[role].state),'PRIVATE_CHECKPOINT_PAYOUT_REGRESSION');
  }
  need(['NOT_STARTED','RUNNING','COMPLETED','FAILED','RETAINED'].includes(value.cleanupState),'PRIVATE_CHECKPOINT_CLEANUP');
  need(['NONE','AVAILABLE','RUNNING','COMPLETED','UNAVAILABLE'].includes(value.recoveryState),'PRIVATE_CHECKPOINT_RECOVERY');
  const refund=value.ownerRefund;
  need(exact(refund,['state','amountWei','claimEpoch','eligibleAt'])&&refundStates.includes(refund.state),'PRIVATE_CHECKPOINT_OWNER_REFUND');
  need(refund.amountWei===null||refund.amountWei==='1000000000000000','PRIVATE_CHECKPOINT_OWNER_REFUND_AMOUNT');
  need(refund.claimEpoch===null||typeof refund.claimEpoch==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(refund.claimEpoch)&&BigInt(refund.claimEpoch)<2n**64n,'PRIVATE_CHECKPOINT_OWNER_REFUND_EPOCH');
  need(refund.eligibleAt===null||typeof refund.eligibleAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(refund.eligibleAt)&&Number.isFinite(Date.parse(refund.eligibleAt)),'PRIVATE_CHECKPOINT_OWNER_REFUND_TIME');
  if(refund.state==='NONE')need(refund.amountWei===null&&refund.claimEpoch===null&&refund.eligibleAt===null,'PRIVATE_CHECKPOINT_OWNER_REFUND_EMPTY');
  if(!['NONE','UNAVAILABLE'].includes(refund.state))need(refund.amountWei==='1000000000000000'&&refund.claimEpoch!==null,'PRIVATE_CHECKPOINT_OWNER_REFUND_BINDING');
  if(['NOTE_ISSUED','WITHDRAWN'].includes(refund.state))need(value.settlementState==='RECOVERY_NOTE_ISSUED','PRIVATE_CHECKPOINT_OWNER_REFUND_ISSUANCE');
  if(value.phase==='REFUNDABLE')need(value.engineState==='STOPPED'&&value.ownerState==='EXIT_CONFIRMED'&&value.cleanupState==='RETAINED'&&value.observation==='LIVE'&&['WAITING','ELIGIBLE','NOTE_ISSUED','UNKNOWN'].includes(refund.state)&&value.payouts.sol.state==='PENDING'&&value.payouts.btc.state==='PENDING','PRIVATE_CHECKPOINT_FALSE_REFUND');
  if(['WAITING','ELIGIBLE'].includes(refund.state))need(value.settlementState==='FUNDED','PRIVATE_CHECKPOINT_FALSE_REFUND');
  if(value.phase==='REFUNDED')need(refund.state==='WITHDRAWN'&&value.ownerState==='EXIT_CONFIRMED'&&value.settlementState==='RECOVERY_NOTE_ISSUED'&&value.payouts.sol.state==='PENDING'&&value.payouts.btc.state==='PENDING','PRIVATE_CHECKPOINT_FALSE_REFUND');
  if(previous?.ownerRefund?.state==='NOTE_ISSUED')need(['NOTE_ISSUED','WITHDRAWN','UNAVAILABLE'].includes(refund.state),'PRIVATE_CHECKPOINT_OWNER_REFUND_REGRESSION');
  if(previous?.ownerRefund?.state==='WITHDRAWN')need(refund.state==='WITHDRAWN','PRIVATE_CHECKPOINT_OWNER_REFUND_REGRESSION');
  if(previous?.ownerRefund?.claimEpoch!==null&&previous?.ownerRefund?.claimEpoch!==undefined)need(refund.claimEpoch===previous.ownerRefund.claimEpoch,'PRIVATE_CHECKPOINT_OWNER_REFUND_BINDING');

  if(value.phase==='RECOVERABLE')need(value.engineState==='STOPPED'&&value.ownerState==='EXIT_CONFIRMED'&&value.settlementState==='PAYOUT_NOTES_ISSUED'&&value.recoveryState==='AVAILABLE'&&value.cleanupState==='RETAINED'&&value.observation==='LIVE'&&['sol','btc'].every(r=>value.payouts[r].state!=='PENDING'&&value.exposure[r]==='OBSERVED'),'PRIVATE_CHECKPOINT_FALSE_RECOVERY');
  if(value.phase==='RECOVERING')need(value.engineState==='RUNNING'&&value.recoveryState==='RUNNING'&&value.settlementState==='PAYOUT_NOTES_ISSUED','PRIVATE_CHECKPOINT_FALSE_RECOVERY');
  if(value.recoveryState==='AVAILABLE')need(value.phase==='RECOVERABLE','PRIVATE_CHECKPOINT_FALSE_RECOVERY');
  need(value.errorCode===null||code(value.errorCode,null)!==null,'PRIVATE_CHECKPOINT_ERROR');
  need(['LIVE','RETAINED_HISTORY'].includes(value.observation),'PRIVATE_CHECKPOINT_OBSERVATION');
  if(previous){
    need(OWNERS.indexOf(value.ownerState)>=OWNERS.indexOf(previous.ownerState),'PRIVATE_CHECKPOINT_OWNER_REGRESSION');
    if(['COMPLETED','REFUNDED'].includes(previous.phase))need(value.phase===previous.phase,'PRIVATE_CHECKPOINT_SUCCESS_REGRESSION');
    if(previous.settlementState==='PAYOUT_NOTES_ISSUED')need(['PAYOUT_NOTES_ISSUED','UNKNOWN'].includes(value.settlementState),'PRIVATE_CHECKPOINT_SETTLEMENT_REGRESSION');
  }
  if(value.phase==='COMPLETED') {
    need(value.ownerState==='EXIT_CONFIRMED'&&value.settlementState==='PAYOUT_NOTES_ISSUED'&&['sol','btc'].every(r=>value.payouts[r].state==='WITHDRAWN'&&value.exposure[r]==='OBSERVED'),'PRIVATE_CHECKPOINT_FALSE_COMPLETION');
  }
  return clone(value);
}

function initialOperation(request) {
  const at=stamp();return {id:randomBytes(16).toString('hex'),requestId:request.requestId,profile:PRIVATE_PAYMENT_PROFILE.id,revision:0,createdAt:at,updatedAt:at,phase:'PREPARED',progressCode:'PAYMENT_PREPARED',engineState:'IDLE',ownerState:'PREPARING',settlementState:'NOT_FUNDED',exposure:{evm:'NONE',sol:'NONE',btc:'NONE'},payouts:{sol:{state:'PENDING',amountWei:null},btc:{state:'PENDING',amountWei:null}},cleanupState:'NOT_STARTED',errorCode:null,observation:'RETAINED_HISTORY',recoveryState:'NONE',lastRecoveryRequestId:null,ownerRefund:emptyOwnerRefund(),lastOwnerRefundRequestId:null,started:false,lastCheckpointSequence:0};
}
function exposed(operation){return operation.settlementState!=='NOT_FUNDED'||['sol','btc'].some(r=>operation.exposure[r]!=='NONE')||['MAY_HAVE_SUBMITTED','SIGNED_RETAINED'].includes(operation.exposure.evm);}
function unresolved(operation){
  if(operation.started&&!TERMINAL.has(operation.phase))return true;
  if(operation.started&&TERMINAL.has(operation.phase)&&operation.cleanupState!=='COMPLETED')return true;
  if(['INTERRUPTED','FAILED'].includes(operation.phase))return exposed(operation)&&!Object.values(operation.payouts).every(p=>p.state==='WITHDRAWN')&&operation.ownerRefund?.state!=='WITHDRAWN';
  return false;
}
function projectOperation(operation, { unavailable=false, canStart=false, canRecover=false, ownerRefundAction=null }={}) {
  const result=Object.fromEntries(['id','requestId','profile','revision','createdAt','updatedAt','lastRecoveryRequestId','lastOwnerRefundRequestId',...KEYS].map(k=>[k,clone(operation[k])]));
  if(unavailable&&operation.started&&!TERMINAL.has(operation.phase)){result.observation='RETAINED_HISTORY';result.errorCode??='PRIVATE_ENGINE_UNAVAILABLE';}
  result.recoveryState??='NONE';result.lastRecoveryRequestId??=null;result.lastOwnerRefundRequestId??=null;result.ownerRefund??=emptyOwnerRefund();
  if(unavailable)result.ownerRefund=ownerRefundUnavailable(result.ownerRefund);
  if(unavailable&&['AVAILABLE','RUNNING'].includes(result.recoveryState))result.recoveryState='UNAVAILABLE';
  result.allowedActions=operation.phase==='PREPARED'&&!unavailable&&canStart?['start']:operation.phase==='RECOVERABLE'&&!unavailable&&canRecover?['recover']:!unavailable&&ownerRefundAction?[ownerRefundAction]:[];return result;
}
function validateRecord(record) {
  need(record?.version===1&&Number.isSafeInteger(record.revision)&&Array.isArray(record.operations)&&Array.isArray(record.requests),'PRIVATE_JOURNAL_INVALID');
  const ids=new Set();for(const o of record.operations){need(id(o.id)&&!ids.has(o.id)&&requestId(o.requestId)&&o.profile===PRIVATE_PAYMENT_PROFILE.id&&PHASES.includes(o.phase)&&typeof o.started==='boolean'&&Number.isSafeInteger(o.revision)&&Number.isSafeInteger(o.lastCheckpointSequence),'PRIVATE_JOURNAL_OPERATION');ids.add(o.id);need(o.exposure&&o.payouts&&OWNERS.includes(o.ownerState),'PRIVATE_JOURNAL_OPERATION');}
  const requests=new Set();for(const r of record.requests){need(exact(r,['id','fingerprint','operationId','createdAt'])&&requestId(r.id)&&!requests.has(r.id)&&ids.has(r.operationId)&&/^[0-9a-f]{64}$/.test(r.fingerprint),'PRIVATE_JOURNAL_REQUEST');requests.add(r.id);}
  for(const o of record.operations){o.recoveryState??='NONE';o.lastRecoveryRequestId??=null;o.ownerRefund??=emptyOwnerRefund();o.lastOwnerRefundRequestId??=null;need(o.lastOwnerRefundRequestId===null||requestId(o.lastOwnerRefundRequestId),'PRIVATE_JOURNAL_REFUND_REQUEST');need(['NONE','AVAILABLE','RUNNING','COMPLETED','UNAVAILABLE'].includes(o.recoveryState)&&(o.lastRecoveryRequestId===null||requestId(o.lastRecoveryRequestId)),'PRIVATE_JOURNAL_RECOVERY');
    need(['IDLE','RUNNING','STOPPED','INTERRUPTED'].includes(o.engineState),'PRIVATE_JOURNAL_ENGINE');
    const financial=Object.fromEntries(KEYS.map(k=>[k,o[k]]));
    if(['PREPARED','QUEUED','INTERRUPTED'].includes(financial.phase))financial.phase='PREPARING';
    if(['IDLE','INTERRUPTED'].includes(financial.engineState))financial.engineState='RUNNING';
    validatePrivateCheckpoint(financial);
  }
  return record;
}

export class PrivatePaymentSession {
  #directory;#store;#record;#lease;#leasePath;#leaseToken;#readOnly=false;#storageError=null;#closed=false;#ready;#queue=Promise.resolve();#job=null;#spawn;#preflight;
  constructor(directory,{store,spawnWorker,preflight}={}) {
    this.#directory=resolve(directory);this.#store=store??new PrivateOperationStore(this.#directory);this.#leasePath=join(this.#directory,'private-session.lock');
    this.#spawn=spawnWorker??(()=>fork(fileURLToPath(new URL('./private-payment-worker.mjs',import.meta.url)),[],{cwd:fileURLToPath(new URL('..',import.meta.url)),execArgv:[],stdio:['ignore','pipe','pipe','ipc'],serialization:'json',env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}}));
    this.#preflight=preflight??(async()=>{const engine=await import('./private-payment-engine.mjs');return engine.checkPrivatePaymentPrerequisites();});
  }
  initialize(){return this.#ready??=this.#initialize();}
  async #initialize(){
    this.#record=validateRecord(await this.#store.initialize());
    this.#leaseToken=randomBytes(32).toString('hex');
    try{this.#lease=await open(this.#leasePath,'wx',0o600);await this.#lease.writeFile(JSON.stringify({version:1,pid:process.pid,token:this.#leaseToken}));await this.#lease.sync();const directory=await open(this.#directory,'r');try{await directory.sync();}finally{await directory.close();}}
    catch(error){if(error.code!=='EEXIST'){if(this.#lease){await this.#lease.close().catch(()=>{});this.#lease=null;await unlink(this.#leasePath).catch(()=>{});}throw error;}this.#readOnly=true;this.#storageError='PRIVATE_SESSION_ALREADY_OPEN';}
    try{
      this.#record=validateRecord(await this.#store.read());
      if(!this.#readOnly&&this.#record.operations.some(o=>o.started&&!TERMINAL.has(o.phase))){
        this.#record=await this.#store.update(this.#record.revision,r=>({...r,operations:r.operations.map(o=>o.started&&!TERMINAL.has(o.phase)?{...o,revision:o.revision+1,updatedAt:stamp(),phase:'INTERRUPTED',progressCode:'ENGINE_CONNECTION_UNAVAILABLE',engineState:'INTERRUPTED',observation:'RETAINED_HISTORY',errorCode:'PRIVATE_ENGINE_UNAVAILABLE',recoveryState:o.recoveryState==='NONE'&&o.settlementState!=='PAYOUT_NOTES_ISSUED'?'NONE':'UNAVAILABLE',ownerRefund:ownerRefundUnavailable(o.ownerRefund)}:o)}));
      }
      return this.snapshot();
    }catch(error){await this.#releaseLease();throw error;}
  }
  async #releaseLease(){
    if(!this.#lease)return;
    await this.#lease.close();this.#lease=null;
    const current=JSON.parse(await readFile(this.#leasePath,'utf8'));
    need(current.token===this.#leaseToken,'PRIVATE_SESSION_LEASE_CHANGED');await unlink(this.#leasePath);
  }
  #serial(work){const p=this.#queue.then(work);this.#queue=p.catch(()=>{});return p;}
  #blocked(){return Boolean(this.#job)||this.#record.operations.some(unresolved);}
  #canRecover(operation){return !this.#closed&&!this.#readOnly&&!this.#storageError&&this.#job?.operationId===operation.id&&this.#job.recoverable===true&&this.#job.child.connected!==false&&operation.phase==='RECOVERABLE'&&operation.recoveryState==='AVAILABLE';}
  #ownerRefundAction(operation){if(this.#closed||this.#readOnly||this.#storageError||this.#job?.operationId!==operation.id||!this.#job.refundable||this.#job.child.connected===false||operation.phase!=='REFUNDABLE')return null;return ['WAITING','ELIGIBLE'].includes(operation.ownerRefund.state)?'refund':operation.ownerRefund.state==='NOTE_ISSUED'?'recoverRefund':null;}
  #project(operation){return projectOperation(operation,{unavailable:this.#readOnly||this.#closed,canStart:!this.#blocked()&&!this.#storageError,canRecover:this.#canRecover(operation),ownerRefundAction:this.#ownerRefundAction(operation)});}
  snapshot(){
    need(this.#record,'PRIVATE_SESSION_NOT_READY');const busy=this.#blocked();const unavailable=this.#readOnly||this.#closed;
    const active=this.#job?.operationId??this.#record.operations.findLast(o=>unresolved(o)||o.phase==='PREPARED')?.id??null;
    return {version:1,profile:clone(PRIVATE_PAYMENT_PROFILE),capabilities:clone(CAPABILITIES),operations:[...this.#record.operations].reverse().map(o=>this.#project(o)),activeOperationId:active,busy,storageError:this.#storageError};
  }
  async refresh(){await this.initialize();await this.#queue;try{this.#record=validateRecord(await this.#store.read());}catch(error){this.#storageError=code(error.code??error.message,'PRIVATE_STORAGE_UNAVAILABLE');}return this.snapshot();}
  async operation(operationId){need(id(operationId),'PRIVATE_OPERATION_ID');await this.refresh();const o=this.snapshot().operations.find(o=>o.id===operationId);need(o,'PRIVATE_OPERATION_NOT_FOUND');return o;}
  async submit(body){
    await this.initialize();need(!this.#closed,'PRIVATE_SESSION_CLOSED');need(!this.#readOnly,'PRIVATE_SESSION_ALREADY_OPEN');need(!this.#storageError,'PRIVATE_STORAGE_UNAVAILABLE');
    need(body&&typeof body==='object'&&!Array.isArray(body),'PRIVATE_COMMAND_FIELDS');
    if(body.action==='prepare')need(exact(body,['action','requestId','profile'])&&body.profile===PRIVATE_PAYMENT_PROFILE.id,'PRIVATE_COMMAND_FIELDS');
    else if(['start','recover','refund','recoverRefund'].includes(body.action))need(exact(body,['action','requestId','operationId'])&&id(body.operationId),'PRIVATE_COMMAND_FIELDS');
    else fail('PRIVATE_COMMAND_UNKNOWN');need(requestId(body.requestId),'PRIVATE_REQUEST_ID');
    const request=clone(body),fingerprint=createHash('sha256').update(canonical(request)).digest('hex');
    return this.#serial(async()=>{
      need(!this.#closed,'PRIVATE_SESSION_CLOSED');need(!this.#storageError,'PRIVATE_STORAGE_UNAVAILABLE');
      this.#record=validateRecord(await this.#store.read());const old=this.#record.requests.find(r=>r.id===request.requestId);
      if(old){need(old.fingerprint===fingerprint,'PRIVATE_REQUEST_CONFLICT');return {operation:this.#project(this.#record.operations.find(o=>o.id===old.operationId)),replayed:true};}
      let operation,replayed=false;
      if(request.action==='prepare'){
        need(!this.#blocked(),'PRIVATE_OPERATION_IN_PROGRESS');await this.#preflight();operation=initialOperation(request);
      }else if(['refund','recoverRefund'].includes(request.action)){
        operation=this.#record.operations.find(o=>o.id===request.operationId);need(operation,'PRIVATE_OPERATION_NOT_FOUND');
        need(this.#ownerRefundAction(operation)===request.action,'PRIVATE_OWNER_REFUND_UNAVAILABLE');
        operation={...operation,phase:'REFUNDING',progressCode:'OWNER_REFUND_ACCEPTED',engineState:'RUNNING',lastOwnerRefundRequestId:request.requestId,updatedAt:stamp(),revision:operation.revision+1};
      }else if(request.action==='recover'){
        operation=this.#record.operations.find(o=>o.id===request.operationId);need(operation,'PRIVATE_OPERATION_NOT_FOUND');
        need(this.#canRecover(operation),'PRIVATE_PAYOUT_RECOVERY_UNAVAILABLE');
        operation={...operation,phase:'RECOVERING',progressCode:'PAYOUT_RECOVERY_ACCEPTED',engineState:'RUNNING',recoveryState:'RUNNING',lastRecoveryRequestId:request.requestId,updatedAt:stamp(),revision:operation.revision+1};
      }else{
        operation=this.#record.operations.find(o=>o.id===request.operationId);need(operation,'PRIVATE_OPERATION_NOT_FOUND');
        if(operation.started)replayed=true;
        else{need(operation.phase==='PREPARED'&&!this.#blocked(),'PRIVATE_OPERATION_IN_PROGRESS');operation={...operation,started:true,phase:'QUEUED',progressCode:'START_ACCEPTED',engineState:'RUNNING',updatedAt:stamp(),revision:operation.revision+1};}
      }
      const op=clone(operation),req={id:request.requestId,fingerprint,operationId:op.id,createdAt:stamp()};
      try{this.#record=await this.#store.update(this.#record.revision,r=>({...r,operations:request.action==='prepare'?[...r.operations,op]:r.operations.map(o=>o.id===op.id?op:o),requests:[...r.requests,req]}));}
      catch(error){this.#storageError=code(error.code??error.message,'PRIVATE_STORAGE_UNAVAILABLE');if(['recover','refund','recoverRefund'].includes(request.action))this.#job?.abort(error);try{this.#record=validateRecord(await this.#store.read());if(request.action==='start'&&this.#record.operations.find(o=>o.id===op.id)?.started)await this.#markInterrupted(op.id,'PRIVATE_START_PERSISTENCE_UNCERTAIN');}catch{}throw error;}
      if(request.action==='start'&&!replayed){try{this.#launch(op.id);}catch(error){await this.#markInterrupted(op.id,code(error.code??error.message,'PRIVATE_WORKER_START_FAILED'));throw error;}}
      if(request.action==='recover')this.#job.recover();
      if(['refund','recoverRefund'].includes(request.action))this.#job.refund(request.action);
      return {operation:this.#project(this.#record.operations.find(o=>o.id===op.id)),replayed};
    });
  }
  async #persistSnapshot(operationId,payload,sequence){
    try{this.#record=validateRecord(await this.#store.read());}catch(error){this.#storageError=code(error.code??error.message,'PRIVATE_STORAGE_UNAVAILABLE');throw error;}
    const old=this.#record.operations.find(o=>o.id===operationId);need(old?.started,'PRIVATE_OPERATION_NOT_STARTED');
    if(sequence!==undefined)need(sequence===old.lastCheckpointSequence+1,'PRIVATE_CHECKPOINT_SEQUENCE');
    const clean=validatePrivateCheckpoint(payload,old);const next={...old,...clean,revision:old.revision+1,updatedAt:stamp(),lastCheckpointSequence:sequence??old.lastCheckpointSequence};
    try{this.#record=await this.#store.update(this.#record.revision,r=>({...r,operations:r.operations.map(o=>o.id===operationId?next:o)}));}
    catch(error){this.#storageError=code(error.code??error.message,'PRIVATE_STORAGE_UNAVAILABLE');throw error;}
  }
  async #markInterrupted(operationId,errorCode){
    try{
      this.#record=validateRecord(await this.#store.read());const old=this.#record.operations.find(o=>o.id===operationId);if(!old)return;
      const financialComplete=['COMPLETED','REFUNDED'].includes(old.phase);const next={...old,revision:old.revision+1,updatedAt:stamp(),phase:financialComplete?old.phase:'INTERRUPTED',engineState:'INTERRUPTED',progressCode:financialComplete?(old.phase==='REFUNDED'?'OWNER_REFUND_COMPLETE_CLEANUP_UNCONFIRMED':'PAYMENT_COMPLETE_CLEANUP_UNCONFIRMED'):'ENGINE_CONNECTION_UNAVAILABLE',errorCode,observation:'RETAINED_HISTORY',ownerRefund:ownerRefundUnavailable(old.ownerRefund),recoveryState:financialComplete?old.recoveryState:old.recoveryState==='NONE'&&old.settlementState!=='PAYOUT_NOTES_ISSUED'?'NONE':'UNAVAILABLE',cleanupState:old.cleanupState==='COMPLETED'?'COMPLETED':'FAILED'};
      this.#record=await this.#store.update(this.#record.revision,r=>({...r,operations:r.operations.map(o=>o.id===operationId?next:o)}));
    }catch(error){this.#storageError=code(error.code??error.message,'PRIVATE_STORAGE_UNAVAILABLE');}
  }
  #launch(operationId){
    need(!this.#job,'PRIVATE_OPERATION_IN_PROGRESS');const child=this.#spawn();need(child&&typeof child.send==='function'&&typeof child.on==='function','PRIVATE_WORKER_INVALID');
    let resolveJob;const completion=new Promise(resolve=>{resolveJob=resolve;});const job={operationId,child,completion,recoverable:false,refundable:false};this.#job=job;
    let chain=Promise.resolve(),lastSequence=0,result=false,terminalPhase=null,failure=null,closed=false,finalizing=false,logBytes=0,forceTimer;
    const abort=error=>{failure??=code(error?.code??error?.message,'PRIVATE_WORKER_PROTOCOL');try{if(child.connected)child.disconnect();}catch{}forceTimer??=setTimeout(()=>{if(!closed)child.kill?.('SIGKILL');},60000);forceTimer.unref?.();};
    job.abort=abort;
    job.stop=()=>{job.recoverable=false;job.refundable=false;try{child.send({type:'stop'},error=>{if(error)abort(error);});}catch(error){abort(error);}forceTimer??=setTimeout(()=>{if(!closed)child.kill?.('SIGKILL');},60000);forceTimer.unref?.();};
    job.recover=()=>{need(job.recoverable&&!failure&&!result&&child.connected!==false,'PRIVATE_PAYOUT_RECOVERY_UNAVAILABLE');job.recoverable=false;try{child.send({type:'recover',operationId,profile:PRIVATE_PAYMENT_PROFILE.id},error=>{if(error)abort(error);});}catch(error){abort(error);}};
    job.refund=action=>{need(job.refundable&&!failure&&!result&&child.connected!==false,'PRIVATE_OWNER_REFUND_UNAVAILABLE');job.refundable=false;try{child.send({type:action,operationId,profile:PRIVATE_PAYMENT_PROFILE.id},error=>{if(error)abort(error);});}catch(error){abort(error);}};
    for(const stream of [child.stdout,child.stderr])stream?.on('data',chunk=>{logBytes+=chunk.length;if(logBytes>1024*1024)abort(new Error('PRIVATE_WORKER_LOG_LIMIT'));});
    child.on('message',message=>{
      chain=chain.then(async()=>{
        need(!failure&&!result,'PRIVATE_WORKER_PROTOCOL');need(Buffer.byteLength(JSON.stringify(message))<=16384,'PRIVATE_WORKER_MESSAGE_LIMIT');
        if(message?.type==='checkpoint'){
          need(exact(message,['type','sequence','payload'])&&Number.isSafeInteger(message.sequence)&&message.sequence===lastSequence+1,'PRIVATE_CHECKPOINT_SEQUENCE');
          await this.#serial(()=>this.#persistSnapshot(operationId,message.payload,message.sequence));lastSequence=message.sequence;
          // Only an already retained authority may switch its admissible recovery branch
          // through a canonical-state refresh; the first retained checkpoint grants nothing.
          if(job.recoverable||job.refundable){job.recoverable=message.payload.phase==='RECOVERABLE';job.refundable=message.payload.phase==='REFUNDABLE';}
          need(child.connected!==false,'PRIVATE_WORKER_DISCONNECTED');await new Promise((resolve,reject)=>child.send({type:'ack',sequence:lastSequence},error=>error?reject(error):resolve()));
        }else if(message?.type==='result'){
          need(exact(message,['type','summary']),'PRIVATE_WORKER_RESULT');const summary=validatePrivateCheckpoint(message.summary);need((TERMINAL.has(summary.phase)||['RECOVERABLE','REFUNDABLE'].includes(summary.phase))&&summary.engineState==='STOPPED','PRIVATE_WORKER_RESULT');
          await this.#serial(()=>this.#persistSnapshot(operationId,summary));terminalPhase=summary.phase;
          if(['RECOVERABLE','REFUNDABLE'].includes(summary.phase)){need(!job.recoverable&&!job.refundable,'PRIVATE_WORKER_DUPLICATE_RESULT');job.recoverable=summary.phase==='RECOVERABLE';job.refundable=summary.phase==='REFUNDABLE';if(this.#closed)job.stop();}else{result=true;job.recoverable=false;job.refundable=false;}
        }else fail('PRIVATE_WORKER_PROTOCOL');
      }).catch(abort);
    });
    child.once('error',abort);
    child.once('disconnect',()=>{
      // A normal worker disconnect follows its result; let all already queued
      // messages durably finish before distinguishing that from a lost channel.
      void new Promise(resolve=>setImmediate(resolve)).then(()=>chain).then(async()=>{
        if(result||closed)return;const reason=failure??'PRIVATE_WORKER_DISCONNECTED';abort(new Error(reason));
        await this.#serial(()=>this.#markInterrupted(operationId,reason));
      }).catch(error=>abort(error));
    });
    const finalize=(exitCode,signal)=>{
      if(finalizing)return;finalizing=true;
      void new Promise(resolve=>setImmediate(resolve)).then(()=>chain).then(async()=>{
        closed=true;clearTimeout(forceTimer);for(const stream of [child.stdout,child.stderr])stream?.destroy?.();
        if(!result||failure||signal||exitCode!==0&&!(exitCode===1&&terminalPhase==='FAILED'))await this.#serial(()=>this.#markInterrupted(operationId,failure??'PRIVATE_WORKER_EXITED'));
        if(this.#job===job)this.#job=null;resolveJob();
      }).catch(async()=>{closed=true;clearTimeout(forceTimer);if(this.#job===job)this.#job=null;this.#storageError='PRIVATE_WORKER_FINALIZATION_FAILED';resolveJob();});
    };
    child.once('exit',finalize);child.once('close',finalize);
    child.send({type:'start',operationId,profile:PRIVATE_PAYMENT_PROFILE.id},error=>{if(error)abort(error);});
  }
  async idle(){await this.initialize();if(this.#job)await this.#job.completion;await this.#queue;return this.snapshot();}
  async close(){if(this.#closed)return;this.#closed=true;await this.#ready?.catch(()=>{});await this.#queue;if(this.#job){if(this.#job.recoverable||this.#job.refundable)this.#job.stop();await this.#job.completion;}await this.#queue;await this.#releaseLease();}
}
