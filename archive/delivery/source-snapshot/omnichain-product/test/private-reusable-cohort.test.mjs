/** HOST CALLBACK TESTS ONLY: no native nodes, proofs or privacy acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createReusableAssetCohortController, MAX_COHORT_CONSENT_MS} from '../src/private-reusable-cohort.mjs';

const hex = (n, width=32) => n.toString(16).padStart(width,'0');
const ASSET = hex(90,64), OTHER_ASSET = hex(91,64);
const TERMS = {budget:'1000', solCompensation:'400', amountSol:'30', numerator:'1', denominator:'30'};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return {promise,resolve}; };
const ORDERS = {reservation:[0,1], sol:[1,0], btc:[0,1], settlement:[1,0]};
async function originalProgram(host) {
  await host.prepare(); await host.prepareReserve(); await host.authorize(); await host.releaseOwner(); await host.assertOwnerExited(); await host.reserve();
  await host.execute('sol', await host.readiness('sol')); await host.assertOwnerExited(); await host.join();
  await host.execute('btc', await host.readiness('btc'));
  const terminal = await host.terminal(); await host.permit('sol',terminal); await host.permit('btc',terminal); await host.claim(terminal); await host.verifyCompletion(); await host.retireSettledProcesses();
}
function fixture({failAt, holdAt, checkpoint=async()=>{}, pairAdmission=async()=>true, maxRounds=4, chooseOrder=stage=>ORDERS[stage], shutdownReleases=true, fatalShutdownTimeoutMs=1000}={}) {
  let time=10_000, lease=false, leaseQueue=Promise.resolve(), shutdowns=0, executions=0, resolved=false, usableAuthorizations=true;
  const events=[], validations=[], checkpoints=[], held=deferred(), entered=deferred(), pool={existing:true};
  const authorities=[0,1].map(ownerIndex=>({ownerIndex,pool,originalCustody:{},notes:[`original-${ownerIndex}`],payoutNotes:[],journal:new Map()}));
  const mutate=(label,work)=>{
    const result=leaseQueue.then(async()=>{assert.equal(lease,false); lease=true; events.push(['lease',label]);try{return await work();}finally{events.push(['release',label]);lease=false;}});
    leaseQueue=result.catch(()=>{});return result;
  };
  let controller;
  const deps={cohortId:'existing_cohort', authorities, mutate, now:()=>time, maxRounds, chooseOrder, fatalShutdownTimeoutMs,
    onCheckpoint:async value=>{checkpoints.push(value);await checkpoint(value);},
    validateAdmission:async ctx=>{assert.equal(ctx.authority,authorities[ctx.ownerIndex]);validations.push([ctx.phase,ctx.request.requestId]);return ctx.authority.journal.get(ctx.request.requestId);},
    validateRound:async ctx=>{
      assert.equal(lease,true,'pair admission must hold original shared lease'); assert.equal(ctx.authorities[0],authorities[0]); assert.equal(ctx.authorities[1],authorities[1]);
      events.push(['pair',ctx.roundNumber]);
      return {roundNumber:ctx.roundNumber,assetId:ctx.assetId,requestIds:ctx.requests.map(r=>r.requestId),samePool:true,distinctOwnerNotes:true,capacityAvailable:await pairAdmission(ctx)};
    },
    executeRequest:async ctx=>{
      executions++; assert.equal(ctx.authority,authorities[ctx.ownerIndex]);
      const {ownerIndex:index,request}=ctx, opaque=Object.freeze({privateOnlyTo:index,operationId:request.operationId});
      assert.equal(controller.isOperationActive(index,request.operationId),true);
      const call=async(name,...args)=>{
        if(name!=='assertOwnerExited')assert.equal(lease,true,`original ${name} outside stage lease`);
        const role=['readiness','execute','permit'].includes(name)?args[0]:null, key=`${index}:${name}${role?':'+role:''}`;
        if(name==='permit')assert.equal(args[1],opaque,'per-operation terminal witness changed');
        if(name==='claim')assert.equal(args[0],opaque,'per-operation terminal witness changed');
        events.push([index,name,role,ctx.roundNumber]);
        if(key===holdAt){entered.resolve();await held.promise;}
        if(key===failAt)throw Object.assign(Error('PC26_TEST_ORIGINAL_FAILURE'),{code:'PC26_TEST_ORIGINAL_FAILURE'});
        if(name==='reserve')ctx.authority.notes=[`change-${request.operationId}`];
        if(name==='claim')ctx.authority.payoutNotes.push(`sol-${request.operationId}`,`btc-${request.operationId}`);
        return opaque;
      };
      const host=Object.fromEntries(['prepare','prepareReserve','authorize','releaseOwner','assertOwnerExited','reserve','readiness','execute','join','terminal','permit','claim','verifyCompletion','retireSettledProcesses'].map(name=>[name,(...args)=>call(name,...args)]));
      await originalProgram(controller.wrapOperationHost(index,request.operationId,host));
    },
    recoverRequest:async(ctx,input)=>{assert.equal(lease,true);assert.equal(ctx.authority,authorities[ctx.ownerIndex]);events.push(['recover',ctx.ownerIndex,ctx.request.requestId,input.action]);return{originalOperationId:ctx.request.operationId};},
    assertRoundResolved:async({round})=>({roundNumber:round.roundNumber,noUnresolvedObligations:resolved,noUsableAuthorizations:!usableAuthorizations}),
    fatalShutdown:async()=>{shutdowns++;if(shutdownReleases)held.resolve();},
  };
  controller=createReusableAssetCohortController(deps);
  function consent(index, number=1, changes={}) {
    const offset=100*number+10*index;
    const value={requestId:`request_${offset}`,assetId:ASSET,intentId:hex(offset+1),operationId:hex(offset+2),terms:{...TERMS},consentToWait:true,expiresAt:time+60_000,...changes};
    authorities[index].journal.set(value.requestId,{...Object.fromEntries(['requestId','assetId','intentId','operationId','terms'].map(k=>[k,structuredClone(value[k])])),kind:'payment',state:'PREPARED'});
    return value;
  }
  async function enrollPair(number=1,changes={}){const inputs=[consent(0,number,changes),consent(1,number,changes)];for(const index of [0,1])await controller.enroll(index,inputs[index]);return inputs;}
  return {controller,authorities,events,validations,checkpoints,held,entered,consent,enrollPair,mutate,now:()=>time,setTime:value=>{time=value;},setResolution:(obligations,authorizations)=>{resolved=obligations;usableAuthorizations=authorizations;},executions:()=>executions,shutdowns:()=>shutdowns};
}

test('HOST: two rounds reuse the same authorities/custody, retain backed-note stand-ins and use independent stage orders',async()=>{
  const draws=[], f=fixture({chooseOrder:stage=>{draws.push(stage);return ORDERS[stage];}}), identities=[...f.authorities], custody=f.authorities.map(a=>a.originalCustody);
  const first=await f.enrollPair();await f.controller.start();assert.equal((await f.controller.idle()).state,'SETTLED_IN_POOL');
  const firstStatus=f.controller.requestStatus(0,first[0].requestId), count=f.executions();
  assert.equal((await f.controller.enroll(0,first[0])).replayed,true);assert.equal(f.executions(),count);
  await f.controller.beginNextRound();await f.enrollPair(2,{assetId:OTHER_ASSET});await f.controller.start();assert.equal((await f.controller.idle()).state,'SETTLED_IN_POOL');
  assert.deepEqual(f.controller.requestStatus(0,first[0].requestId),firstStatus,'old completed status is harmless and stable');
  for(const index of [0,1]){assert.equal(f.authorities[index],identities[index]);assert.equal(f.authorities[index].originalCustody,custody[index]);assert.equal(f.authorities[index].payoutNotes.length,4);assert.equal(f.authorities[index].notes.length,1);}
  assert.equal(f.executions(),4);assert.equal(f.shutdowns(),0);assert.deepEqual(draws,[...Object.keys(ORDERS),...Object.keys(ORDERS)]);
  for(const round of [1,2])for(const [stage,method,role]of [['reservation','reserve',null],['sol','execute','sol'],['btc','execute','btc'],['settlement','claim',null]])assert.deepEqual(f.events.filter(e=>e[1]===method&&e[2]===role&&e[3]===round).map(e=>e[0]),ORDERS[stage]);
  assert.equal(f.controller.status().privacyEvaluation,'NOT_EVALUATED');assert.equal(f.controller.status().transparentFallback,false);
});

test('HOST: single owner, incompatible asset/terms, missing wait consent and expired consent never dispatch',async()=>{
  const f=fixture();await f.controller.enroll(0,f.consent(0));await assert.rejects(f.controller.start(),/ROUND_NOT_READY/);
  await assert.rejects(f.controller.enroll(1,f.consent(1,1,{assetId:OTHER_ASSET})),/ASSET_MISMATCH/);
  await assert.rejects(f.controller.enroll(1,f.consent(1,1,{terms:{...TERMS,budget:'1001'}})),/TERMS_MISMATCH/);
  await assert.rejects(f.controller.enroll(1,f.consent(1,1,{consentToWait:false})),/EXPLICIT_WAIT_CONSENT/);
  await assert.rejects(f.controller.enroll(1,f.consent(1,1,{expiresAt:f.now()+MAX_COHORT_CONSENT_MS+1})),/BOUNDED_CONSENT/);
  await f.controller.enroll(1,f.consent(1));f.setTime(f.now()+60_000);await f.controller.expire();await assert.rejects(f.controller.start(),/ROUND_NOT_READY/);
  assert.equal(f.executions(),0);assert.equal(f.events.length,0);assert.equal(f.controller.status().state,'EXPIRED_NO_DISPATCH');
});

test('HOST: cancel before start needs new consent and identities, never silently reenrolls old request',async()=>{
  const f=fixture(), old=await f.enrollPair();await f.controller.cancel(0);await assert.rejects(f.controller.start(),/ROUND_NOT_READY/);assert.equal(f.executions(),0);
  await f.controller.beginNextRound();assert.equal((await f.controller.enroll(0,old[0])).replayed,true);assert.equal(f.controller.status().joined,0);
  await assert.rejects(f.controller.start(),/ROUND_NOT_READY/);await f.enrollPair(2);await f.controller.start();await f.controller.idle();assert.equal(f.executions(),2);
});

test('HOST: changed replays, cross-owner/asset swaps and global identity reuse are rejected',async()=>{
  const f=fixture(), first=await f.enrollPair();await f.controller.start();await f.controller.idle();await f.controller.beginNextRound();
  await assert.rejects(f.controller.enroll(1,first[0]),/REQUEST_OWNER_CHANGED/);
  for(const change of [{assetId:OTHER_ASSET},{operationId:hex(999)},{intentId:hex(998)},{expiresAt:first[0].expiresAt+1},{terms:{...TERMS,budget:'2000'}}])await assert.rejects(f.controller.enroll(0,{...first[0],...change}),/REQUEST_REPLAY_CHANGED/);
  await assert.rejects(f.controller.enroll(0,f.consent(0,2,{operationId:first[0].operationId})),/GLOBAL_IDENTITY_REUSE/);
  await assert.rejects(f.controller.enroll(0,f.consent(0,2,{requestId:first[0].intentId})),/GLOBAL_IDENTITY_REUSE/);
  assert.equal(f.executions(),2);assert.equal(f.controller.status().joined,0);
});

test('HOST: original admission is rechecked at explicit start; shared capacity failure prevents first preparation/reservation',async()=>{
  const f=fixture(), inputs=await f.enrollPair();f.authorities[1].journal.get(inputs[1].requestId).state='UNKNOWN';
  await assert.rejects(f.controller.start(),/ORIGINAL_ADMISSION/);assert.equal(f.executions(),0);
  const g=fixture({pairAdmission:async()=>false});await g.enrollPair();await g.controller.start();assert.equal((await g.controller.idle()).state,'QUARANTINED');
  assert.equal(g.events.filter(e=>typeof e[0]==='number').length,0);assert.equal(g.events.filter(e=>e[0]==='pair').length,1);
});

test('HOST: ordinary mutations cannot interleave while pair validation holds the shared reservation lease',async()=>{
  const admitted=deferred(), release=deferred(), f=fixture({pairAdmission:async()=>{admitted.resolve();await release.promise;return true;}});
  await f.enrollPair();await f.controller.start();await admitted.promise;let ordinary=false;
  const pending=f.mutate('ordinary-account-change',async()=>{ordinary=true;});await new Promise(r=>setImmediate(r));assert.equal(ordinary,false);
  release.resolve();await pending;await f.controller.idle();assert.equal(ordinary,true);assert.equal(f.controller.status().state,'SETTLED_IN_POOL');
});

test('HOST: active stage cancellation stops native sends and quarantines without fatal shutdown or lost recovery',async()=>{
  const f=fixture({holdAt:'1:readiness:sol'}), inputs=await f.enrollPair();await f.controller.start();await f.entered.promise;
  await f.controller.cancel(0);f.held.resolve();assert.equal((await f.controller.idle()).state,'QUARANTINED');
  assert.equal(f.events.filter(e=>e[1]==='reserve').length,2);assert.equal(f.events.filter(e=>e[1]==='execute').length,0);assert.equal(f.shutdowns(),0);
  await assert.rejects(f.controller.beginNextRound(),/ROUND_UNRESOLVED/);
  await assert.rejects(f.controller.resetFailedRound(),/UNRESOLVED_ORIGINAL/);
  f.setResolution(true,true);await assert.rejects(f.controller.resetFailedRound(),/UNRESOLVED_ORIGINAL/,'zero current obligations cannot discard usable authorization');
  await assert.rejects(f.controller.recover(0,inputs[0].requestId,{action:'refund'}),/RECOVERY_ACTION/);
  await assert.rejects(f.controller.recover(0,inputs[0].requestId,{action:'exit'}),/RECOVERY_ACTION/);
  const recovery=await f.controller.recover(0,inputs[0].requestId,{action:'reconcile'});assert.equal(recovery.result.originalOperationId,inputs[0].operationId);
  f.setResolution(true,false);assert.equal((await f.controller.resetFailedRound()).state,'RESOLVED');
  await f.controller.beginNextRound();await f.enrollPair(2);await f.controller.start();assert.equal((await f.controller.idle()).state,'SETTLED_IN_POOL');
});

test('HOST: matching expiry after valid explicit start does not replace original protocol cutoffs',async()=>{
  const f=fixture({holdAt:'1:readiness:sol'});await f.enrollPair();await f.controller.start();await f.entered.promise;f.setTime(f.now()+MAX_COHORT_CONSENT_MS+1);assert.equal(await f.controller.expire(),false);f.held.resolve();
  assert.equal((await f.controller.idle()).state,'SETTLED_IN_POOL');assert.equal(f.events.filter(e=>e[1]==='execute').length,4);assert.equal(f.events.filter(e=>e[1]==='permit').length,4);
});

test('HOST: matching deadline is rechecked after the final start checkpoint ACK',async()=>{
  let advance=false;const f=fixture({checkpoint:async()=>{if(advance)f.setTime(80_000);}});await f.enrollPair();advance=true;
  await assert.rejects(f.controller.start(),/TWO_FRESH_CONSENTS/);assert.equal(f.executions(),0);await f.controller.expire();assert.equal(f.controller.status().state,'EXPIRED_NO_DISPATCH');
});

test('HOST: cancellation at reservation, BTC and settlement boundaries prevents subsequent stage exposure',async()=>{
  for(const [holdAt,reservations,native,claims]of [['0:prepare',0,0,0],['0:readiness:btc',2,2,0],['1:terminal',2,4,0]]){
    const f=fixture({holdAt});await f.enrollPair();await f.controller.start();await f.entered.promise;await f.controller.cancel(1);f.held.resolve();await f.controller.idle();
    assert.equal(f.controller.status().state,'QUARANTINED');assert.equal(f.events.filter(e=>e[1]==='reserve').length,reservations,holdAt);assert.equal(f.events.filter(e=>e[1]==='execute').length,native,holdAt);assert.equal(f.events.filter(e=>e[1]==='claim').length,claims,holdAt);assert.equal(f.shutdowns(),0);
  }
});

test('HOST: checkpoint write failure before exposure prevents reservation; recovery stays reachable while the sink is broken',async()=>{
  let broken=true;const f=fixture({checkpoint:async value=>{if(broken&&value.rounds.some(r=>r.participants.some(p=>p.progress.exposureAttempted.reservation)))throw Error('storage unavailable');}});
  const inputs=await f.enrollPair();await f.controller.start();assert.equal((await f.controller.idle()).state,'QUARANTINED');assert.equal(f.controller.status().checkpointAvailable,false);
  assert.equal(f.events.filter(e=>e[1]==='reserve'||e[1]==='execute').length,0);
  const result=await f.controller.recover(0,inputs[0].requestId,{action:'reconcile'});assert.equal(result.checkpointAvailable,false);assert.equal(result.result.originalOperationId,inputs[0].operationId);
  f.setResolution(true,false);await assert.rejects(f.controller.resetFailedRound());assert.equal(f.controller.status().state,'QUARANTINED');
  broken=false;assert.equal((await f.controller.resetFailedRound()).state,'RESOLVED');assert.equal(f.controller.status().checkpointAvailable,true);assert.equal(f.shutdowns(),0);
});

test('HOST: original failure after SOL preserves quarantine and never automatically resends',async()=>{
  const f=fixture({failAt:'0:readiness:btc'}), inputs=await f.enrollPair();await f.controller.start();await f.controller.idle();
  assert.equal(f.controller.status().state,'QUARANTINED');assert.equal(f.events.filter(e=>e[1]==='execute'&&e[2]==='sol').length,2);assert.equal(f.events.filter(e=>e[1]==='execute'&&e[2]==='btc').length,0);
  const before=f.executions();assert.equal((await f.controller.enroll(0,inputs[0])).replayed,true);await assert.rejects(f.controller.start(),/ROUND_NOT_READY/);assert.equal(f.executions(),before);
  await f.controller.recover(1,inputs[1].requestId,{action:'reconcile'});await assert.rejects(f.controller.recover(0,inputs[1].requestId,{action:'refund'}),/ORIGINAL_RECOVERY/);
});

test('HOST: checkpoint failure after a reservation retains its exposure and stops the peer reservation/native sends',async()=>{
  const f=fixture({checkpoint:async value=>{if(value.rounds.some(r=>r.participants.some(p=>p.progress.stages.reservation)))throw Error('completion write failed');}});
  const inputs=await f.enrollPair();await f.controller.start();await f.controller.idle();
  assert.equal(f.controller.status().state,'QUARANTINED');assert.equal(f.events.filter(e=>e[1]==='reserve').length,1);assert.equal(f.events.filter(e=>e[1]==='execute').length,0);
  assert.equal(f.controller.requestStatus(0,inputs[0].requestId).progress.exposureAttempted.reservation,true);await assert.rejects(f.controller.resetFailedRound(),/UNRESOLVED_ORIGINAL/);
  assert.equal((await f.controller.recover(0,inputs[0].requestId,{action:'reconcile'})).result.originalOperationId,inputs[0].operationId);
});

test('HOST: history/new-round limit preserves old status and original-note recovery access',async()=>{
  const f=fixture({maxRounds:1}), inputs=await f.enrollPair();await f.controller.start();await f.controller.idle();
  await assert.rejects(f.controller.beginNextRound(),/ROUND_LIMIT/);assert.equal((await f.controller.recover(0,inputs[0].requestId,{action:'reconcile'})).result.originalOperationId,inputs[0].operationId);
  assert.equal(f.controller.requestStatus(1,inputs[1].requestId).state,'SETTLED_IN_POOL');assert.equal(f.executions(),2);
});

test('HOST: host wrapping is restricted to one enrolled active operation',async()=>{
  const f=fixture();assert.throws(()=>f.controller.wrapOperationHost(0,hex(1),{}),/ENROLLED_ACTIVE/);await f.enrollPair();await f.controller.start();await f.controller.idle();
  assert.throws(()=>f.controller.wrapOperationHost(0,hex(102),{}),/ENROLLED_ACTIVE/);assert.equal(f.controller.isOperationActive(0,hex(102)),false);
});

test('HOST: explicit fatal shutdown differs from cancel, is bounded and cannot restore unavailable authorities',async()=>{
  const f=fixture({holdAt:'0:prepare',shutdownReleases:false,fatalShutdownTimeoutMs:20});await f.enrollPair();await f.controller.start();await f.entered.promise;
  const stopped=await f.controller.shutdown();assert.equal(stopped.state,'FATAL_UNAVAILABLE');assert.equal(stopped.errorCode,'PC26_FATAL_SHUTDOWN_TIMEOUT');assert.equal(f.shutdowns(),1);
  assert.deepEqual(await f.controller.shutdown(),stopped);await assert.rejects(f.controller.resetFailedRound(),/AUTHORITY_UNAVAILABLE/);
  f.held.resolve();await f.controller.idle();assert.equal(f.controller.status().state,'FATAL_UNAVAILABLE');assert.equal(f.events.filter(e=>e[1]==='reserve').length,0);
});
