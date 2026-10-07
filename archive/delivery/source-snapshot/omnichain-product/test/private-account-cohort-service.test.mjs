import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateAccountCohortService} from '../src/private-account-cohort-service.mjs';
const asset='a'.repeat(64),terms={budget:'100',solCompensation:'40',amountSol:'30',numerator:'1',denominator:'30'};
const hex=n=>n.toString(16).padStart(32,'0');
async function fixture(t,{failExecute=false,checkpoint=async()=>{}}={}){
 const local=await mkdtemp(join(tmpdir(),'shared-account-service-'));let controller,created=0,stopped=0,closes=0,executions=0,serial=100,lease=false;
 const views=[{assets:[],requests:[]},{assets:[],requests:[]}],events=[];
 const shared={local,lifetime:'b'.repeat(64),registry:[],async createOwnerRuntime(i){created++;return{index:i};},bindCohort(c){assert.equal(created,2,'must establish both owners first');controller=c;},
  async mutate(label,f){assert.equal(lease,false);lease=true;try{return await f();}finally{lease=false;}},async validateAdmission(){},async validateRound({roundNumber,assetId,requests}){assert.equal(lease,true);return{roundNumber,assetId,requestIds:requests.map(r=>r.requestId),samePool:true,distinctOwnerNotes:true,capacityAvailable:true};},async assertRoundResolved(){throw Error('PC26_UNRESOLVED_ORIGINAL_OBLIGATIONS');},async inspect(){return{created,closes,executions};},async close(){closes++;},async abort(){stopped++;}};
 const service=createPrivateAccountCohortService({onCheckpoint:async s=>{events.push(s);await checkpoint(s);}},{createRuntime:async()=>shared,createKeeper:(cfg,seams)=>{let index,worker=true;const summary=()=>({phase:'READY',workerAvailable:worker,authorityAvailable:true,busy:false,generationCount:1});return{
  summary,async open(){index=(await seams.createRuntime(cfg)).index;await cfg.onCheckpoint(summary());},async prepare(r){const old=views[index].requests.find(x=>x.requestId===r.requestId);if(old)assert.deepEqual(old.terms,r.terms);else views[index].requests.push({...r,intentId:hex(serial++),operationId:hex(serial++),state:'PREPARED'});},async privateStatus(){return structuredClone(views[index]);},
  async execute(id){const r=views[index].requests.find(r=>r.requestId===id);executions++;r.state='SUBMITTING';if(failExecute){worker=false;r.state='UNKNOWN';throw Error('ACCOUNT_COORDINATOR_LOST');}const raw={};for(const method of ['prepare','prepareReserve','authorize','releaseOwner','assertOwnerExited','reserve','readiness','execute','join','terminal','permit','claim','verifyCompletion','retireSettledProcesses'])raw[method]=async()=>({});const h=controller.wrapOperationHost(index,r.operationId,raw);await h.prepare();await h.prepareReserve();await h.authorize();await h.releaseOwner();await h.assertOwnerExited();await h.reserve();await h.execute('sol',await h.readiness('sol'));await h.assertOwnerExited();await h.join();await h.execute('btc',await h.readiness('btc'));const proof=await h.terminal();await h.permit('sol',proof);await h.permit('btc',proof);await h.claim(proof);await h.verifyCompletion();await h.retireSettledProcesses();r.state='CONFIRMED';},
  async reconcile(){assert.equal(lease,true);events.push('original-reconcile');throw Error('ACCOUNT_OUTCOME_UNKNOWN');},async refresh(){},async restartCoordinator(){worker=true;events.push('restart');},async close(){events.push('owner-closed-'+index);},async stop(){},
 };}});
 t.after(async()=>{await service.abort();await rm(local,{recursive:true,force:true});});
 const prepare=async i=>{const requestId='payment-request-'+i+'-'+serial;await service.ownerAction(i,'prepare',{requestId,assetId:asset,kind:'payment',terms});return requestId;};
 const enroll=async(i,id)=>service.enroll(i,{preparedRequestId:id,consentToWait:true,expiresAt:Date.now()+60_000});
 return{service,prepare,enroll,events,views,inspect:()=>({created,executions,stopped,closes})};
}
test('service keeps pair binding, owner journals and two rounds over one lifetime',async t=>{
 const f=await fixture(t);await f.service.open();assert.equal(f.inspect().created,2);const first=await f.prepare(0);await f.enroll(0,first);await assert.rejects(f.service.start(),/ROUND_NOT_READY/);assert.equal(f.inspect().executions,0);
 await assert.rejects(f.service.ownerAction(0,'execute',{requestId:first}),/PAYMENT_REQUIRES_COHORT/);
 await f.enroll(1,await f.prepare(1));await f.service.start();await f.service.idle();assert.equal(f.service.status().cohort.state,'SETTLED_IN_POOL');assert.equal(f.service.status().cohort.counts.settled,2);assert.equal(JSON.stringify(f.service.status()).includes(asset),false);
 assert.equal(f.views[0].requests[0].state,'CONFIRMED');assert.equal(f.views[1].requests[0].state,'CONFIRMED');await f.service.nextRound();await f.enroll(0,await f.prepare(0));await f.service.cancel(0);assert.equal(f.service.status().cohort.state,'CANCELLED_NO_DISPATCH');assert.equal(f.inspect().executions,2);assert.equal((await f.service.privateStatus(0)).cohortEnrollments.at(-1).state,'CANCELLED_NO_DISPATCH');await f.service.nextRound();assert.equal(f.service.status().cohort.roundNumber,3);assert.equal(f.inspect().created,2);f.views[1].assets=[{observation:'LIVE',available:'1',pending:'0',unavailable:'0',positions:[]}];await assert.rejects(f.service.close(),/RETAINED_BACKING/);assert.equal(f.events.some(e=>typeof e==='string'&&e.startsWith('owner-closed-')),false);f.views[1].assets=[];await f.service.close();assert.equal(f.inspect().closes,1);
});
test('lost coordinator never becomes a fabricated successful host result',async t=>{
 const f=await fixture(t,{failExecute:true});await f.service.open();for(const i of [0,1])await f.enroll(i,await f.prepare(i));await f.service.start();await f.service.idle();assert.equal(f.service.status().cohort.state,'QUARANTINED');assert.ok(f.views.some(v=>v.requests[0].state==='UNKNOWN'));assert.equal(f.events.includes('original-reconcile'),false);await f.service.ownerAction(0,'restart');await assert.rejects(f.service.ownerAction(0,'reconcile',{requestId:f.views[0].requests[0].requestId}),/OUTCOME_UNKNOWN/);await assert.rejects(f.service.resetFailedRound(),/UNRESOLVED/);assert.equal(f.inspect().stopped,0);
});
