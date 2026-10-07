/** Fixed two-owner synthetic cohort under one trusted controller. The two
 * original wallet authorities retain independent encrypted balance custody and
 * intent journals. This module stores only opaque participant handles, consent
 * and public stage-completion facts; it never merges their witnesses. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createPrivateWalletAuthority,createOwnedWalletOperationHost,validatePrivateWalletIntent,sanitizePrivateWalletSummary,PRIVATE_WALLET_PROFILE} from './private-wallet-engine.mjs';
import {createPrivateCohortStageGate,wrapPrivateCohortOperationHost} from './private-cohort-gate.mjs';

export const PRIVATE_COHORT_PROFILE='PC24_TWO_OWNER_COHORT_V1';
export const PRIVATE_COHORT_STATES=Object.freeze(['WAITING_FOR_COHORT','READY_FOR_REVIEW','PREPARING_RESERVATIONS','SOL_BATCH','BTC_BATCH','SETTLING','SETTLED_IN_POOL','CANCELLATION_PENDING','EXPIRED_NO_DISPATCH','QUARANTINED','CLOSED']);
export const PRIVATE_COHORT_TERMS=Object.freeze({depositWei:'1500000000000000',budget:'1000000000000000',solCompensation:'500000000000000',amountSol:'3000000',numerator:'1',denominator:'30'});
export const PRIVATE_COHORT_MAX_CONSENT_MS=15*60_000;
export const PRIVATE_COHORT_DEFAULT_CONSENT_MS=5*60_000;
const PAYMENT_TERMS=Object.freeze(Object.fromEntries(Object.entries(PRIVATE_COHORT_TERMS).filter(([key])=>key!=='depositWei')));
const PHASE={reservation:'PREPARING_RESERVATIONS',sol:'SOL_BATCH',btc:'BTC_BATCH',settlement:'SETTLING'};
const TRANSITIONS=Object.freeze({
 WAITING_FOR_COHORT:['WAITING_FOR_COHORT','READY_FOR_REVIEW','CANCELLATION_PENDING','EXPIRED_NO_DISPATCH','QUARANTINED','CLOSED'],
 READY_FOR_REVIEW:['PREPARING_RESERVATIONS','CANCELLATION_PENDING','EXPIRED_NO_DISPATCH','QUARANTINED','CLOSED'],
 PREPARING_RESERVATIONS:['SOL_BATCH','CANCELLATION_PENDING','QUARANTINED'],SOL_BATCH:['BTC_BATCH','CANCELLATION_PENDING','QUARANTINED'],
 BTC_BATCH:['SETTLING','CANCELLATION_PENDING','QUARANTINED'],SETTLING:['SETTLED_IN_POOL','CANCELLATION_PENDING','QUARANTINED'],
 SETTLED_IN_POOL:['QUARANTINED','CLOSED'],CANCELLATION_PENDING:['EXPIRED_NO_DISPATCH','QUARANTINED'],
 EXPIRED_NO_DISPATCH:['QUARANTINED','CLOSED'],QUARANTINED:['QUARANTINED','CLOSED'],CLOSED:[],
});
const newId=()=>randomBytes(16).toString('hex');
const id=value=>typeof value==='string'&&/^[0-9a-f]{32}$/.test(value);
const exact=(value,keys,code='PC24_COMMAND_FIELDS')=>{assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype,code);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),code);};
const coded=code=>Object.assign(new Error(code),{code});
const safeCode=e=>/^[A-Z][A-Z0-9_]{1,100}$/.test(e?.code??e?.message??'')?e.code??e.message:'PC24_COHORT_OPERATION_FAILED';
const clone=value=>structuredClone(value);
export function validatePrivateCohortTerms(terms){exact(terms,Object.keys(PRIVATE_COHORT_TERMS),'PC24_FIXED_TERMS_REQUIRED');assert.deepEqual(terms,PRIVATE_COHORT_TERMS,'PC24_INCOMPATIBLE_TERMS');return clone(PRIVATE_COHORT_TERMS);}

/** Only this trusted wrapper bypasses the original whole-payment lease. Every
 * payment stage still owns base.mutate, and all other operations keep the exact
 * original mutation behavior. Neither the generic runtime nor locks change. */
function scheduledParticipantView(view,base,canRunPayment){
 return Object.freeze(Object.create(view,{mutate:{enumerable:true,value:async(label,work)=>{
  if(label==='wallet-payment'){assert.equal(canRunPayment(),true,'PC24_EXPLICIT_COHORT_START_REQUIRED');return work();}
  return base.mutate(label,work);
 }},close:{enumerable:true,value:async()=>{}}}));
}

/** Constructor dependencies are trusted module code, never HTTP parameters.
 * The controller is deliberately one-shot: a failed cohort cannot silently
 * enroll again or re-send its original payment. Recovery uses original owner
 * authority actions and the same surviving host, issuer, runtimes and pool. */
export function createPrivateCohortCoordinator(options={},dependencies={}){
 const {cohortId=newId(),onCheckpoint=async()=>{},onOwnerCheckpoint=null,signal}=options;
 exact(options,Object.keys(options).filter(key=>['cohortId','onCheckpoint','onOwnerCheckpoint','signal'].includes(key)),'PC24_OPTIONS');
 assert.ok(id(cohortId),'PC24_COHORT_ID');assert.equal(typeof onCheckpoint,'function','PC24_CHECKPOINT_CALLBACK');
 assert.ok(onOwnerCheckpoint===null||typeof onOwnerCheckpoint==='function','PC24_OWNER_CHECKPOINT_CALLBACK');
 const {
  createRuntime=async args=>(await import('./private-wallet-authority.mjs')).createOwnedCohortWalletRuntime(args),
  createParticipantView=async(base,args)=>(await import('./private-wallet-authority.mjs')).createPrivateCohortParticipantView(base,args),
  createAuthority=createPrivateWalletAuthority,createOperationHost=createOwnedWalletOperationHost,runSigner,
  now=Date.now,chooseOrder,fatalShutdownTimeoutMs=60_000,
 }=dependencies;
 assert.ok(Number.isSafeInteger(fatalShutdownTimeoutMs)&&fatalShutdownTimeoutMs>0&&fatalShutdownTimeoutMs<=60_000,'PC24_FATAL_SHUTDOWN_BOUND');
 const lifetimeController=new AbortController(),lifetimeSignal=signal?AbortSignal.any([signal,lifetimeController.signal]):lifetimeController.signal;
 let base,opened=false,opening=false,closed=false,closeStarted=false,state='WAITING_FOR_COHORT',errorCode=null,started=false,active=false,gate,runPromise,expiryTimer,abortRequested=false,abortPromise;
 let publicSequence=0,checkpointQueue=Promise.resolve(),actionQueue=Promise.resolve(),actionPending=0,checkpointFailed=false;
 const participants=[0,1].map(index=>({index,walletId:newId(),authority:null,view:null,consent:null,intentId:null,operationId:null,started:false,reservationAttempted:false,reservationConfirmed:false,solConfirmed:false,btcConfirmed:false,settled:false,allowedIntents:new Map()}));
 const counts=()=>({joined:participants.filter(p=>p.consent).length,reservationsConfirmed:participants.filter(p=>p.reservationConfirmed).length,solCompleted:participants.filter(p=>p.solConfirmed).length,btcCompleted:participants.filter(p=>p.btcConfirmed).length,settled:participants.filter(p=>p.settled).length});
 const snapshot=()=>clone({profile:PRIVATE_COHORT_PROFILE,cohortId,state,opened,active,counts:counts(),expiresAt:participants.filter(p=>p.consent).reduce((value,p)=>value===null?p.consent.expiresAt:Math.min(value,p.consent.expiresAt),null),errorCode,privacyEvaluation:'NOT_EVALUATED',transparentFallback:false,observerModel:'COMMON_TRUSTED_CONTROLLER_LOCAL_SYNTHETIC_ONLY'});
 const checkpoint=()=>{
  const value=snapshot(),sequence=++publicSequence;
  const work=checkpointQueue.then(()=>{if(checkpointFailed)throw coded('PC24_CHECKPOINT_FAILED');return onCheckpoint({...value,sequence});});
  checkpointQueue=work.catch(()=>{checkpointFailed=true;state='QUARANTINED';errorCode='PC24_CHECKPOINT_FAILED';gate?.abort('PC24_CHECKPOINT_FAILED');});return work;
 };
 const transition=async(next,code=null)=>{assert.ok(TRANSITIONS[state].includes(next),'PC24_STATE_TRANSITION');state=next;errorCode=code;await checkpoint();};
 const guard=()=>{assert.equal(closed,false,'PC24_COHORT_CLOSED');assert.equal(opened,true,'PC24_COHORT_NOT_OPEN');};
 const participant=index=>{assert.ok(index===0||index===1,'PC24_OWNER_INDEX');return participants[index];};
 const serial=work=>{actionPending++;const task=actionQueue.then(work);actionQueue=task.catch(()=>{});return task.finally(()=>{actionPending--;});};
 const clearExpiry=()=>{clearTimeout(expiryTimer);expiryTimer=undefined;};
 function scheduleExpiry(){
  clearExpiry();if(started||closed)return;const expiry=snapshot().expiresAt;if(expiry===null)return;
  expiryTimer=setTimeout(()=>{void expire().catch(()=>{state='QUARANTINED';errorCode='PC24_CHECKPOINT_FAILED';});},Math.max(0,expiry-now()));expiryTimer.unref?.();
 }
 async function expire(){
  if(started||closed||!['WAITING_FOR_COHORT','READY_FOR_REVIEW'].includes(state))return false;
  if(!participants.some(p=>p.consent&&p.consent.expiresAt<=now()))return false;
  clearExpiry();await transition('EXPIRED_NO_DISPATCH','PC24_CONSENT_EXPIRED');return true;
 }
 const assertFreshConsent=()=>{
  assert.equal(participants.every(p=>p.consent&&p.consent.expiresAt>now()),true,'PC24_TWO_FRESH_CONSENTS_REQUIRED');
  for(const p of participants)validatePrivateCohortTerms(p.consent.terms);
 };
 function stageGuard(){assert.equal(active,true,'PC24_COHORT_NOT_EXECUTING');gate.guard();}
 async function open(){
  assert.equal(opened||opening||closed,false,'PC24_COHORT_ALREADY_OPEN');opening=true;
  try{
   assert.equal(signal?.aborted===true,false,'PC24_AUTHORITY_ABORTED');
   base=await createRuntime({walletId:cohortId,signal:lifetimeSignal,publish:async()=>{},guard:()=>{if(closed||lifetimeSignal.aborted)throw coded('PC24_COHORT_CLOSED');}});
   assert.equal(lifetimeSignal.aborted,false,'PC24_AUTHORITY_ABORTED');
   assert.ok(base&&typeof base.mutate==='function'&&typeof base.close==='function','PC24_SHARED_AUTHORITY_REQUIRED');
   for(const p of participants){
    const raw=await createParticipantView(base,{ownerIndex:p.index,walletId:p.walletId});
    assert.equal(raw.identity.walletId,p.walletId,'PC24_PARTICIPANT_IDENTITY');
    assert.equal(raw.pool,base.pool,'PC24_SAME_POOL_REQUIRED');
    assert.equal(raw.identity.pool,base.identity.pool,'PC24_SAME_POOL_REQUIRED');
    assert.equal(raw.identity.issuerLifetime,base.identity.issuerLifetime,'PC24_SAME_ISSUER_REQUIRED');
    assert.notEqual(raw.local,base.local,'PC24_INDEPENDENT_OWNER_CUSTODY');
    if(p.index===1)assert.notEqual(raw.local,participants[0].view.local,'PC24_INDEPENDENT_OWNER_CUSTODY');
    p.view=scheduledParticipantView(raw,base,()=>active&&p.started);
    const deps={createRuntime:async()=>p.view,createOperationHost:async(context,shared,custody,terms)=>{
     stageGuard();assert.equal(context.operationId,p.operationId,'PC24_ORIGINAL_OPERATION_ONLY');assert.deepEqual(terms,PAYMENT_TERMS,'PC24_FIXED_PAYMENT_ONLY');
     const wrapped={...context,
      async beforeNative(...args){stageGuard();return context.beforeNative(...args);},
      async beforeEvm(purpose,...args){if(['claim','authority'].includes(purpose))stageGuard();return context.beforeEvm(purpose,...args);},
      async submitSpend(...args){stageGuard();return context.submitSpend(...args);},
     };
     const host=await createOperationHost(wrapped,shared,custody,terms);
     return wrapPrivateCohortOperationHost(host,{gate,ownerIndex:p.index,onExposure:async(index,kind)=>{if(kind==='reserve')participants[index].reservationAttempted=true;}});
    }};
    if(runSigner)deps.runSigner=runSigner;
    p.authority=createAuthority({walletId:p.walletId,profile:PRIVATE_WALLET_PROFILE,signal:lifetimeSignal,onCheckpoint:async summary=>{
     // Preserve the original authority's durable-before-send publication ACK.
     // This owner-only sink is separate from common coarse stage checkpoints.
     try{
      const value=sanitizePrivateWalletSummary(summary);
      if(onOwnerCheckpoint)await onOwnerCheckpoint(p.index,value);
      else{assert.equal(typeof base.audit,'function','PC24_DURABLE_OWNER_CHECKPOINT_REQUIRED');await base.audit('cohort-owner-checkpoint',{kind:'PC24_OWNER_AUTHORITY_CHECKPOINT',ownerIndex:p.index,summary:value});}
     }
     catch(e){gate?.abort('PC24_OWNER_CHECKPOINT_FAILED');state='QUARANTINED';errorCode='PC24_OWNER_CHECKPOINT_FAILED';await checkpoint().catch(()=>{});throw e;}
    }},deps);
    await p.authority.action('open',{});
   }
   opened=true;await checkpoint();return snapshot();
  }catch(e){state='QUARANTINED';errorCode=safeCode(e);for(const p of participants)await p.authority?.abort?.().catch(()=>{});await base?.close?.().catch(()=>{});closed=true;throw e;}
  finally{opening=false;}
 }
 async function join(index,input){
  guard();await expire();assert.equal(started,false,'PC24_COHORT_ALREADY_STARTED');assert.ok(['WAITING_FOR_COHORT','READY_FOR_REVIEW'].includes(state),'PC24_COHORT_NOT_JOINABLE');
  exact(input,['terms','consentToWait','expiresAt'],'PC24_CONSENT_FIELDS');validatePrivateCohortTerms(input.terms);
  assert.equal(input.consentToWait,true,'PC24_EXPLICIT_WAIT_CONSENT_REQUIRED');
  assert.ok(Number.isSafeInteger(input.expiresAt)&&input.expiresAt>now()&&input.expiresAt-now()<=PRIVATE_COHORT_MAX_CONSENT_MS,'PC24_BOUNDED_CONSENT_REQUIRED');
  const p=participant(index);if(p.consent){assert.deepEqual(p.consent,input,'PC24_CONSENT_ALREADY_RECORDED');return ownerStatus(index);}
  p.consent=clone(input);await transition(participants.every(p=>p.consent)?'READY_FOR_REVIEW':'WAITING_FOR_COHORT');scheduleExpiry();return ownerStatus(index);
 }
 async function cancel(index){
  guard();participant(index);if(['CLOSED','EXPIRED_NO_DISPATCH','QUARANTINED','CANCELLATION_PENDING'].includes(state))return ownerStatus(index);
  assert.notEqual(state,'SETTLED_IN_POOL','PC24_SETTLED_NOT_CANCELLABLE');clearExpiry();abortRequested=true;
  // Abort first, before an asynchronous checkpoint callback can allow a queued
  // participant to acquire another stage or enter native dispatch.
  gate?.abort('PC24_OWNER_CANCELLED');await transition('CANCELLATION_PENDING','PC24_OWNER_CANCELLED');
  if(!started)await transition('EXPIRED_NO_DISPATCH','PC24_OWNER_CANCELLED');
  return ownerStatus(index);
 }
 async function start(){
  guard();await expire();assert.equal(started,false,'PC24_COHORT_ALREADY_STARTED');assert.equal(actionPending,0,'PC24_OWNER_ACTION_IN_PROGRESS');
  assert.equal(state,'READY_FOR_REVIEW','PC24_COHORT_NOT_READY');assertFreshConsent();
  started=true;active=true;clearExpiry();
  gate=createPrivateCohortStageGate({mutate:(label,work)=>base.mutate(label,work),chooseOrder,onPhase:stage=>transition(PHASE[stage]),onCompletion:async(index,stage)=>{
   const p=participant(index);p[{reservation:'reservationConfirmed',sol:'solConfirmed',btc:'btcConfirmed',settlement:'settled'}[stage]]=true;await checkpoint();
  }});
  runPromise=(async()=>{
   try{
    // This is private operational metadata, never a privacy evaluation or a
    // client transcript. It contains no proof, note opening or native package.
    if(typeof base.audit==='function')await base.audit('cohort-stage-order',{kind:'PC24_PRIVATE_STAGE_ORDER',cohortId,orders:gate.auditOrder()});
    for(const p of participants){
     assertFreshConsent();gate.guard();p.intentId=newId();p.operationId=newId();
     await p.authority.action('prepareIntent',{intentId:p.intentId,kind:'payment',terms:clone(PAYMENT_TERMS)});
    }
    assertFreshConsent();gate.guard();
    const results=await Promise.allSettled(participants.map(async p=>{
     p.started=true;
     try{return await p.authority.action('execute',{intentId:p.intentId,operationId:p.operationId});}
     catch(e){await gate.fail(p.index,e).catch(()=>{});throw e;}
    }));
    const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    assert.equal(participants.every(p=>p.settled),true,'PC24_ALL_SETTLEMENTS_REQUIRED');
    gate.guard();assert.equal(abortRequested,false,'PC24_COHORT_CANCELLED');await transition('SETTLED_IN_POOL');
   }catch(e){gate.abort(e);await gate.idle();await transition('QUARANTINED',safeCode(e));}
   finally{active=false;await checkpoint();}
   return snapshot();
  })();
  // HTTP callers get acceptance immediately; idle() is the explicit completion
  // join. Keep a rejection observed if the checkpoint sink itself fails.
  runPromise.catch(()=>{});return snapshot();
 }
 function ownerStatus(index){
  const p=participant(index);return clone({...snapshot(),ownerIndex:index,walletId:p.walletId,consent:p.consent?{consentToWait:true,expiresAt:p.consent.expiresAt,terms:p.consent.terms}:null,operationId:p.operationId,intentId:p.intentId,ownerProgress:{reservationAttempted:p.reservationAttempted,reservationConfirmed:p.reservationConfirmed,solCompleted:p.solConfirmed,btcCompleted:p.btcConfirmed,settled:p.settled},wallet:p.authority?.status()??null});
 }
 async function ownerAction(index,action,input={}){
  guard();const p=participant(index);assert.equal(active,false,'PC24_COHORT_ACTION_IN_PROGRESS');assert.equal(closeStarted,false,'PC24_COHORT_CLOSING');
  assert.ok(['prepareIntent','execute','reconcile'].includes(action),'PC24_OWNER_ACTION');
  assert.ok(input&&Object.getPrototypeOf(input)===Object.prototype&&Buffer.byteLength(JSON.stringify(input))<=4096,'PC24_OWNER_COMMAND');
  input=clone(input);
  if(action==='prepareIntent'){assert.ok(['topup','exit','refund'].includes(input.kind),'PC24_PAYMENT_REQUIRES_COHORT');validatePrivateWalletIntent(input);}
  else{exact(input,['intentId','operationId']);assert.ok(id(input.intentId)&&id(input.operationId),'PC24_OWNER_COMMAND_ID');}
  return serial(async()=>{
   assert.equal(active,false,'PC24_COHORT_ACTION_IN_PROGRESS');
   if(action==='prepareIntent'){
    assert.ok(['topup','exit','refund'].includes(input.kind),'PC24_PAYMENT_REQUIRES_COHORT');
    if(input.kind==='topup'){assert.equal(started,false,'PC24_COHORT_TOPUP_CLOSED');exact(input.terms,['amount']);assert.equal(input.terms.amount,PRIVATE_COHORT_TERMS.depositWei,'PC24_FIXED_DEPOSIT_ONLY');}
    const result=await p.authority.action(action,input);p.allowedIntents.set(input.intentId,input.kind);return result;
   }
   if(action==='execute'){assert.ok(p.allowedIntents.has(input.intentId),'PC24_OWNER_ORIGINAL_INTENT_REQUIRED');if(p.allowedIntents.get(input.intentId)==='topup')assert.equal(started,false,'PC24_COHORT_TOPUP_CLOSED');}
   // Original reconciliation can reissue an already-authorized payout exit.
   // It has no outer engine mutation lease, so retain cohort exclusivity here.
   return action==='reconcile'?base.mutate('cohort-owner-reconcile',()=>p.authority.action(action,input)):p.authority.action(action,input);
  });
 }
 async function close(){
  guard();assert.equal(active,false,'PC24_COHORT_ACTION_IN_PROGRESS');assert.equal(closeStarted,false,'PC24_COHORT_CLOSING');closeStarted=true;clearExpiry();
  try{return await serial(async()=>{
   // The original authority independently verifies global live reservations,
   // output notes and backing are empty before any authority can be closed.
   for(const p of participants)await p.authority.action('close',{});
   await base.close();closed=true;signal?.removeEventListener('abort',onSignalAbort);await transition('CLOSED');return snapshot();
  });}finally{closeStarted=false;}
 }
 /** Explicit fatal shutdown, separate from cancellation. It reports retained
  * or unknown obligations and never labels them refunded or recovered. */
 function abort(){
  if(abortPromise)return abortPromise;if(closed)return Promise.resolve(snapshot());
  abortRequested=true;clearExpiry();gate?.abort('PC24_AUTHORITY_ABORTED');
  // Fatal shutdown signals the original actors immediately. Waiting for a proof
  // before sending this signal would turn an explicit stop into a long hang.
  // Ordinary cancel() deliberately never enters this path.
  lifetimeController.abort(coded('PC24_AUTHORITY_ABORTED'));
  const teardown=Promise.allSettled([...participants.map(p=>Promise.resolve().then(()=>p.authority?.abort?.())),Promise.resolve().then(()=>base?.close?.())]);
  abortPromise=(async()=>{
   let timer,timedOut=false;const deadline=performance.now()+fatalShutdownTimeoutMs;
   const joined=Promise.allSettled([teardown,runPromise,actionQueue]);
   try{await Promise.race([joined,new Promise(resolve=>{timer=setTimeout(()=>{timedOut=true;resolve();},fatalShutdownTimeoutMs);})]);}finally{clearTimeout(timer);}
   if(!timedOut)active=false;closed=true;signal?.removeEventListener('abort',onSignalAbort);
   state='QUARANTINED';errorCode=timedOut?'PC24_FATAL_CLEANUP_TIMEOUT':(await teardown).some(result=>result.status==='rejected')?'PC24_FATAL_CLEANUP_FAILED':'PC24_AUTHORITY_UNAVAILABLE';
   const persisted=checkpoint().catch(()=>{});
   if(!timedOut){try{await Promise.race([persisted,new Promise(resolve=>{timer=setTimeout(()=>{timedOut=true;errorCode='PC24_FATAL_CLEANUP_TIMEOUT';resolve();},Math.max(0,deadline-performance.now()));})]);}finally{clearTimeout(timer);}}
   return snapshot();
  })();abortPromise.catch(()=>{});return abortPromise;
 }
 const onSignalAbort=()=>{abortRequested=true;gate?.abort('PC24_AUTHORITY_ABORTED');};
 signal?.addEventListener('abort',onSignalAbort,{once:true});
 return Object.freeze({profile:PRIVATE_COHORT_PROFILE,cohortId,open,start,close,abort,expire,snapshot,
  async idle(){await runPromise;await actionQueue;await checkpointQueue;return snapshot();},
  owner(index){const p=participant(index);return Object.freeze({ownerIndex:index,walletId:p.walletId,status:()=>ownerStatus(index),privateStatus:async()=>{guard();return p.authority.privateStatus();},join:input=>join(index,input),cancel:()=>cancel(index),action:(action,input)=>ownerAction(index,action,input)});},
 });
}
