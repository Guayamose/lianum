/** Two private owner journals over one surviving asset-pool lifetime. Matching
 * schedules original account requests; no proof, key or native package is
 * copied between owners. Common local host/issuer trust remains explicit. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {Vault} from '../crypto/vault.mjs';
import {createPrivateAccountKeeperForTest} from './private-account-keeper.mjs';
import {createReusableAssetCohortController} from './private-reusable-cohort.mjs';
export const PRIVATE_ACCOUNT_COHORT_PROFILE='PC26_SHARED_ASSET_ACCOUNTS_V1';
const fresh=()=>randomBytes(16).toString('hex'),clone=x=>structuredClone(x);
const owner=i=>assert.ok(i===0||i===1,'ACCOUNT_COHORT_OWNER');
export function createPrivateAccountCohortService(options={},deps={}){
 const{groupId=fresh(),onCheckpoint=async()=>{},signal}=options;
 const{createRuntime=async cfg=>(await import('./private-shared-account-runtime.mjs')).createOwnedSharedAccountRuntime(cfg),createKeeper=(cfg,seams)=>createPrivateAccountKeeperForTest(cfg,seams),createController=createReusableAssetCohortController}=deps;
 assert.match(groupId,/^[0-9a-f]{32}$/);const lifetime=new AbortController(),combined=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
 const owners=[0,1].map(ownerIndex=>({ownerIndex,accountId:fresh(),keeper:null}));let shared,cohort,journal,journalRecord,password,opened=false,closed=false,opening=false,activeOrdinary=0,queue=Promise.resolve(),journalQueue=Promise.resolve(),roundCheckpoint=null,closePromise;
 const joined=new Set();
 const status=()=>({profile:PRIVATE_ACCOUNT_COHORT_PROFILE,groupId,phase:closed?'CLOSED':opening?'OPENING':cohort?.status().active?'COHORT_RUNNING':cohort?.status().state==='QUARANTINED'?'COHORT_QUARANTINED':opened?'READY':'UNOPENED',opened,closed,busy:activeOrdinary>0||Boolean(cohort?.status().active),authorityAvailable:opened&&!closed,cohort:cohort?publicCohortStatus():null,owners:owners.map(o=>({ownerIndex:o.ownerIndex,accountId:o.accountId,status:o.keeper?.summary()??null})),privacyEvaluation:'NOT_EVALUATED',transparentFallback:false,capabilities:{sharedBackedAssets:true,syntheticOwnerCount:2,coordinatorRestart:true,keeperRestart:false,nodeRestart:false,nativeHoldingsPrivateSpendable:false,fullAcceptance:false}});
 function publicCohortStatus(){const{assetId,...value}=cohort.status();return{...value,...(closed?{authorityAvailable:false,archived:true}:{}),counts:counts()};}
 function counts(){const ps=roundCheckpoint?.rounds?.at(-1)?.participants??[];return{joined:ps.length,reservations:ps.filter(p=>p.progress.stages.reservation).length,solCompleted:ps.filter(p=>p.progress.stages.sol).length,btcCompleted:ps.filter(p=>p.progress.stages.btc).length,settled:ps.filter(p=>p.progress.stages.settlement).length};}
 const publish=()=>onCheckpoint(clone(status()));
 const guard=()=>assert.ok(opened&&!closed&&!combined.aborted,'ACCOUNT_COHORT_UNAVAILABLE');
 const serial=work=>{activeOrdinary++;const p=queue.then(work);queue=p.catch(()=>{});return p.finally(async()=>{activeOrdinary--;await publish();});};
 const ownerAt=i=>{owner(i);return owners[i];};
 const request=async(i,id)=>{const view=await ownerAt(i).keeper.privateStatus(),r=view.requests.find(r=>r.requestId===id);assert.ok(r,'ACCOUNT_ORIGINAL_REQUEST_REQUIRED');return r;};
 async function persistCohort(value){const work=journalQueue.then(async()=>{assert.equal(value.sequence,journalRecord.data.sequence+1,'ACCOUNT_COHORT_JOURNAL_SEQUENCE');assert.deepEqual(await journal.read(password),journalRecord,'ACCOUNT_COHORT_JOURNAL_CHANGED');const next=await journal.update(password,journalRecord.revision,()=>({version:1,groupId,lifetime:shared.lifetime,...value}));assert.deepEqual(await journal.read(password),next,'ACCOUNT_COHORT_JOURNAL_READBACK');journalRecord=next;roundCheckpoint=clone(value);await publish();});journalQueue=work.catch(()=>{});return work;}
 async function open(){assert.ok(!opened&&!opening&&!closed,'ACCOUNT_COHORT_ALREADY_OPEN');opening=true;await publish();try{
  shared=await createRuntime({groupId,signal:combined,onProgress:async()=>publish(),guard:()=>assert.equal(combined.aborted,false,'ACCOUNT_COHORT_ABORTED')});password='synthetic-'+randomBytes(32).toString('hex');journal=new Vault(join(shared.local,'cohorts.vault'));journalRecord=await journal.create({version:1,groupId,lifetime:shared.lifetime,sequence:0,rounds:[]},password);assert.deepEqual(await journal.read(password),journalRecord);
  cohort=createController({cohortId:groupId,authorities:owners,mutate:shared.mutate,validateAdmission:async({authority,ownerIndex,request:r})=>{assert.equal(authority,owners[ownerIndex]);const original=await request(ownerIndex,r.requestId);assert.equal(original.state,'PREPARED','ACCOUNT_COHORT_ORIGINAL_PREPARATION');for(const k of ['requestId','assetId','intentId','operationId','kind','terms'])assert.deepEqual(original[k],r[k],'ACCOUNT_COHORT_ORIGINAL_REQUEST');await shared.validateAdmission(ownerIndex,original);return original;},validateRound:ctx=>shared.validateRound(ctx),executeRequest:async({ownerIndex,request:r})=>owners[ownerIndex].keeper.execute(r.requestId),recoverRequest:async({ownerIndex,request:r},input)=>{assert.equal(input.action,'reconcile','ACCOUNT_COHORT_USE_OWNER_CLEANUP_API');return owners[ownerIndex].keeper.reconcile(r.requestId);},assertRoundResolved:ctx=>shared.assertRoundResolved(ctx),fatalShutdown:async()=>{await Promise.allSettled(owners.map(o=>o.keeper?.stop('ACCOUNT_COHORT_SHUTDOWN')));await shared.abort();},onCheckpoint:persistCohort,maxRounds:4});
  for(const o of owners){o.keeper=createKeeper({accountId:o.accountId,signal:combined,onCheckpoint:async()=>publish()},{createRuntime:async cfg=>{return shared.createOwnerRuntime(o.ownerIndex,cfg);}});await o.keeper.open();}
  shared.bindCohort(cohort);
  opened=true;opening=false;await publish();return status();
 }catch(e){opening=false;await abort().catch(()=>{});throw e;}}
 
 async function ownerAction(index,action,input={}){owner(index);guard();return serial(async()=>{guard();assert.equal(cohort.status().active,false,'ACCOUNT_COHORT_ACTION_IN_PROGRESS');const k=owners[index].keeper;
  if(action==='prepare')return k.prepare(input);
  if(action==='execute'){const r=await request(index,input.requestId);assert.notEqual(r.kind,'payment','ACCOUNT_PAYMENT_REQUIRES_COHORT');return k.execute(r.requestId);}
  if(action==='reconcile')return shared.mutate('shared-account-original-reconcile',()=>k.reconcile(input.requestId));
  if(action==='restart')return k.restartCoordinator();
  if(action==='refresh')return k.refresh();
  throw Error('ACCOUNT_COHORT_OWNER_ACTION');
 });}
 async function enroll(index,{preparedRequestId,consentToWait,expiresAt}){owner(index);guard();return serial(async()=>{guard();assert.equal(cohort.status().active,false,'ACCOUNT_COHORT_ACTION_IN_PROGRESS');const r=await request(index,preparedRequestId);assert.equal(r.kind,'payment','ACCOUNT_COHORT_PAYMENT_REQUIRED');const result=await cohort.enroll(index,{requestId:r.requestId,assetId:r.assetId,intentId:r.intentId,operationId:r.operationId,terms:r.terms,consentToWait,expiresAt});joined.add(index);await publish();return result;});}
 async function start(){guard();return serial(async()=>{guard();const r=await cohort.start();await publish();return r;});}
 async function cancel(index){owner(index);guard();const r=await cohort.cancel(index);await publish();return r;}
 async function nextRound(){guard();return serial(async()=>{guard();const r=await cohort.beginNextRound();joined.clear();await publish();return r;});}
 async function resetFailedRound(){guard();return serial(async()=>{guard();const r=await cohort.resetFailedRound();await publish();return r;});}
 async function privateStatus(index){guard();const v=await ownerAt(index).keeper.privateStatus();v.cohortEnrollments=[];for(const r of v.requests.filter(r=>r.kind==='payment')){let row;try{row=cohort.requestStatus(index,r.requestId);}catch(e){if(e.code!=='PC26_ORIGINAL_REQUEST_REQUIRED')throw e;}if(row)v.cohortEnrollments.push({requestId:r.requestId,roundNumber:row.roundNumber,state:row.state,active:row.active});}if(status().busy)for(const a of v.assets)a.observation='STALE';return v;}
 async function close(){guard();return serial(async()=>{assert.equal(cohort.status().active,false,'ACCOUNT_COHORT_ACTION_IN_PROGRESS');for(const i of joined)await cohort.cancel(i);for(const o of owners){await o.keeper.refresh();const view=await o.keeper.privateStatus();assert.ok(view.requests.every(r=>!['SUBMITTING','UNKNOWN'].includes(r.state)),'ACCOUNT_COHORT_UNRESOLVED_REQUEST');for(const a of view.assets){assert.equal(a.observation,'LIVE','ACCOUNT_ASSET_OBSERVATION_REQUIRED');for(const key of ['available','pending','unavailable'])assert.equal(a[key],'0','ACCOUNT_RETAINED_BACKING');assert.ok(a.positions.every(n=>['WITHDRAWN','SPENT','DISCARDED'].includes(n.state)),'ACCOUNT_RETAINED_BACKING');}}for(const o of owners)await o.keeper.close();await shared.close();closed=true;await publish();password=null;return status();});}
 function abort(){if(closePromise)return closePromise;closed=true;lifetime.abort(Error('ACCOUNT_COHORT_ABORTED'));closePromise=(async()=>{if(cohort)await cohort.shutdown();else{await Promise.allSettled(owners.map(o=>o.keeper?.stop('ACCOUNT_COHORT_ABORTED')));await shared?.abort();}await journalQueue.catch(()=>{});opening=false;await publish().catch(()=>{});password=null;})();return closePromise;}
 combined.addEventListener('abort',()=>{if(!closed)void abort().catch(()=>{});},{once:true});
 return Object.freeze({open,ownerAction,enroll,start,cancel,nextRound,resetFailedRound,privateStatus,status,close,abort,async idle(){await queue;await cohort?.idle();await journalQueue;return status();},async inspectForTest(){return shared.inspect();}});
}
