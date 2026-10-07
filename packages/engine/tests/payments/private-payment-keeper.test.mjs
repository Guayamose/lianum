import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPrivatePaymentKeeperForTest } from '../../src/payments/private-payment-keeper.mjs';
import { createPrivatePaymentWorkerHost } from '../../src/payments/private-payment-worker.mjs';
import { PRIVATE_PAYMENT_PROFILE, PRIVATE_PAYMENT_AMOUNTS } from '../../src/payments/private-payment-engine.mjs';
import { PRIVATE_PAYMENT_PROGRAMS } from '../../src/payments/private-payment-coordinator.mjs';

const operationId='keeper_test_12345';
const options=onCheckpoint=>({operationId,profile:PRIVATE_PAYMENT_PROFILE,onCheckpoint:onCheckpoint??(async()=>{})});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({claimResponseLost=false,withdrawResponseLost,blockClaim,cleanupFail=false}={}) {
  const events=[],confirmed=new Set();let ownerExited=false,issued=false,cleaned=0,context;
  const factory=async c=>{
    context=c;
    const send=async purpose=>{await c.beforeEvm(purpose);events.push(purpose);c.evmConfirmed(purpose);};
    const withdraw=async role=>{
      if(confirmed.has(role)){events.push('reconcile-'+role);return {amount:PRIVATE_PAYMENT_AMOUNTS.payoutWei};}
      await send('withdraw');confirmed.add(role);events.push('withdraw-'+role);
      c.withdrawalConfirmed(role,PRIVATE_PAYMENT_AMOUNTS.payoutWei);
      if(withdrawResponseLost===role)throw Error('PRIVATE_PAYMENT_LOST_WITHDRAWAL_RESPONSE');
      return {amount:PRIVATE_PAYMENT_AMOUNTS.payoutWei};
    };
    return {
      async prepare(){events.push('prepare');},async prepareReserve(){events.push('prepare-reserve');},async reserve(){await send('reserve');},async authorize(){events.push('authorize');},
      async releaseOwner(){events.push('owner-exit');ownerExited=true;},async assertOwnerExited(){assert.equal(ownerExited,true);},
      async readiness(role){events.push('ready-'+role);return role;},
      async execute(role){await c.beforeNative(role);events.push('native-'+role);await c.observed(role);},
      async join(){events.push('join');},async terminal(){events.push('terminal');return {};},async permit(role){events.push('permit-'+role);},
      async claim(){await c.beforeEvm('claim');if(blockClaim)await blockClaim();events.push('claim');issued=true;if(claimResponseLost)throw Error('PRIVATE_PAYMENT_LOST_CLAIM_RESPONSE');c.evmConfirmed('claim');},
      withdraw,recoverWithdraw:withdraw,
      async reconcilePayouts(){events.push('discover');return Object.fromEntries(['sol','btc'].map(role=>[role,{state:confirmed.has(role)?'WITHDRAWN':issued?'READY':'PENDING',amount:PRIVATE_PAYMENT_AMOUNTS.payoutWei}]));},
      async validateRecovery(){events.push('validate');assert.ok(issued);},
      async verifyCompletion(){events.push('verify');assert.equal(confirmed.size,2);},
      async cleanup(){events.push('cleanup');cleaned++;if(cleanupFail)throw Error('PRIVATE_PAYMENT_CLEANUP_FAILED');},
    };
  };
  return {events,factory,confirmed,get cleaned(){return cleaned;},get context(){return context;}};
}
const crashClaim=({operation,mode,child})=>{if(operation==='claim'&&mode==='payment')child.kill('SIGKILL');};

test('actual coordinator crash retains exact authority; fresh fork runs payout-only program',async()=>{
  const f=fixture(),checkpoints=[],workers=[];
  const keeper=createPrivatePaymentKeeperForTest(options(async value=>checkpoints.push(value)),{createHost:f.factory,afterOperation:async event=>{workers.push({mode:event.mode,generation:event.generation,pid:event.child.pid,operation:event.operation});crashClaim(event);}});
  const first=await keeper.start();assert.equal(first.phase,'RECOVERABLE');assert.equal(first.cleanupState,'RETAINED');assert.equal(f.cleaned,0);assert.equal(f.confirmed.size,0);
  assert.equal(first.ownerState,'EXIT_CONFIRMED');assert.equal(first.recoveryState,'AVAILABLE');assert.equal(first.settlementState,'PAYOUT_NOTES_ISSUED');
  const result=await keeper.recover();assert.equal(result.phase,'COMPLETED');assert.equal(result.recoveryState,'COMPLETED');assert.equal(f.cleaned,1);
  assert.deepEqual(await keeper.done,result);
  const p=workers.filter(w=>w.mode==='payment'),r=workers.filter(w=>w.mode==='recovery');
  assert.notEqual(p[0].pid,r[0].pid);assert.notEqual(p[0].generation,r[0].generation);
  assert.deepEqual(r.map(w=>w.operation),PRIVATE_PAYMENT_PROGRAMS.recovery);
  for(const action of ['prepare','reserve','authorize','owner-exit','native-sol','native-btc','claim','withdraw-sol','withdraw-btc'])assert.equal(f.events.filter(e=>e===action).length,1,action);
  assert.ok(checkpoints.some(v=>v.phase==='RECOVERING'));assert.throws(()=>keeper.recover(),/RECOVERY_UNAVAILABLE/);
});

test('lost claim response discovers actual issued notes before offering recovery, never claims again',async()=>{
  const f=fixture({claimResponseLost:true}),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory});
  const result=await keeper.start();assert.equal(result.phase,'RECOVERABLE');assert.equal(result.settlementState,'PAYOUT_NOTES_ISSUED');
  assert.equal((await keeper.recover()).phase,'COMPLETED');assert.equal(f.events.filter(e=>e==='claim').length,1);
});

test('partial verified payout is preserved on worker crash and new coordinator never pays it twice',async()=>{
  const f=fixture(),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:async e=>{if(e.operation==='withdrawSol'&&e.mode==='payment')e.child.kill('SIGKILL');}});
  const first=await keeper.start();assert.equal(first.phase,'RECOVERABLE');assert.equal(first.payouts.sol.state,'WITHDRAWN');assert.equal(first.payouts.btc.state,'ISSUED');
  const result=await keeper.recover();assert.equal(result.phase,'COMPLETED');assert.equal(f.events.filter(e=>e==='withdraw-sol').length,1);assert.equal(f.events.filter(e=>e==='withdraw-btc').length,1);
});

test('lost last withdrawal result remains financially complete without recovery or retry',async()=>{
  const f=fixture({withdrawResponseLost:'btc'}),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory});
  const result=await keeper.start();assert.equal(result.phase,'COMPLETED');assert.equal(result.payouts.btc.state,'WITHDRAWN');assert.equal(result.cleanupState,'COMPLETED');assert.equal(f.cleaned,1);
});

test('preclaim crash never gains recovery permission or retries native output',async()=>{
  const f=fixture(),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:async e=>{if(e.operation==='sol')e.child.kill('SIGKILL');}});
  const result=await keeper.start();assert.equal(result.phase,'FAILED');assert.equal(result.settlementState,'FUNDED');assert.equal(f.cleaned,1);assert.equal(f.events.includes('native-btc'),false);assert.throws(()=>keeper.recover(),/RECOVERY_UNAVAILABLE/);
});

test('retained authority expires once and cannot recover after cleanup',async()=>{
  const f=fixture(),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:crashClaim,retentionMs:20});
  assert.equal((await keeper.start()).phase,'RECOVERABLE');
  const result=await keeper.done;assert.equal(result.phase,'FAILED');assert.equal(result.recoveryState,'UNAVAILABLE');assert.equal(result.cleanupState,'COMPLETED');assert.equal(f.cleaned,1);
  assert.throws(()=>keeper.recover(),/RECOVERY_UNAVAILABLE/);await keeper.stop();assert.equal(f.cleaned,1);
});

test('explicit stop/disconnect while retained cleans authority without making a payout',async()=>{
  const f=fixture(),controller=new AbortController(),keeper=createPrivatePaymentKeeperForTest({...options(),signal:controller.signal},{createHost:f.factory,afterOperation:crashClaim});
  await keeper.start();controller.abort();const result=await keeper.done;
  assert.equal(result.recoveryState,'UNAVAILABLE');assert.equal(result.observation,'RETAINED_HISTORY');assert.equal(result.payouts.sol.state,'ISSUED');assert.equal(f.confirmed.size,0);assert.equal(f.cleaned,1);
});

test('coordinator crash cannot offer recovery or replace worker until in-flight claim is quiescent',async()=>{
  let release,entered,child;const began=new Promise(resolve=>{entered=resolve;});
  const f=fixture({blockClaim:()=>{entered();return new Promise(resolve=>{release=resolve;});}});
  const keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:async e=>{child=e.child;}});
  const attempt=keeper.start();await began;child.kill('SIGKILL');await tick();await tick();
  assert.throws(()=>keeper.recover(),/RECOVERY_UNAVAILABLE/);assert.equal(f.cleaned,0);assert.notEqual(keeper.summary().phase,'RECOVERABLE');
  release();assert.equal((await attempt).phase,'RECOVERABLE');await keeper.stop();assert.equal(f.cleaned,1);
});

test('checkpoint loss after claim preserves truth but disposes authority and never withdraws',async()=>{
  const f=fixture(),keeper=createPrivatePaymentKeeperForTest(options(async summary=>{if(summary.progressCode==='PAYOUT_NOTES_ISSUED')throw Error('disk');}),{createHost:f.factory});
  const result=await keeper.start();assert.equal(result.phase,'FAILED');assert.equal(result.settlementState,'PAYOUT_NOTES_ISSUED');assert.equal(result.recoveryState,'UNAVAILABLE');assert.equal(f.confirmed.size,0);assert.equal(f.cleaned,1);
});

class Transport extends EventEmitter {
  connected=true;messages=[];
  send(message,callback){this.messages.push(structuredClone(message));callback?.();if(message.type==='checkpoint')queueMicrotask(()=>this.emit('message',{type:'ack',sequence:message.sequence}));}
}
test('external IPC maintains monotonic durable checkpoints across explicit new coordinator',async()=>{
  const transport=new Transport(),f=fixture();
  const host=createPrivatePaymentWorkerHost({transport,createKeeper:(o,{onResult})=>createPrivatePaymentKeeperForTest(o,{onResult,createHost:f.factory,afterOperation:crashClaim})});
  const resultAt=count=>new Promise(resolve=>{const poll=()=>{const r=transport.messages.filter(m=>m.type==='result');if(r.length>=count)resolve(r[count-1]);else setImmediate(poll);};poll();});
  transport.emit('message',{type:'start',operationId,profile:PRIVATE_PAYMENT_PROFILE});
  assert.equal((await resultAt(1)).summary.phase,'RECOVERABLE');
  transport.emit('message',{type:'recover',operationId,profile:PRIVATE_PAYMENT_PROFILE});
  assert.equal((await host.done).phase,'COMPLETED');assert.equal(transport.messages.filter(m=>m.type==='result').length,2);
  const checkpoints=transport.messages.filter(m=>m.type==='checkpoint');assert.deepEqual(checkpoints.map(m=>m.sequence),checkpoints.map((_,i)=>i+1));
  const publicText=JSON.stringify(transport.messages);for(const field of ['generation','coordinatorPid','privateKey','invoice','proof','pool'])assert.equal(publicText.includes('"'+field+'"'),false,field);
});

function scriptedWorkerFactory(attack) {
  const workers=[];
  const spawn=()=>{
    const child=new EventEmitter();child.pid=8000+workers.length;child.killed=false;child.connected=true;workers.push(child);
    let boot,index=0,done=false;
    child.kill=signal=>{if(done)return;child.killed=true;done=true;child.connected=false;queueMicrotask(()=>child.emit('exit',null,signal));};
    function next() {
      if(done)return;
      const program=PRIVATE_PAYMENT_PROGRAMS[boot.mode];
      if(index===program.length){child.emit('message',{type:'complete',generation:boot.generation,sequence:index});done=true;queueMicrotask(()=>child.emit('exit',0,null));return;}
      const message={type:'operation',generation:boot.generation,sequence:index+1,operation:program[index++]};
      if(boot.mode==='recovery'&&index===1&&attack)attack(message,child,workers);
      child.emit('message',message);
    }
    child.send=(message,callback)=>{
      if(done){callback?.(Error('closed'));return;}
      if(message.type==='start'){boot=message;child.boot=message;}
      callback?.();setImmediate(next);
    };
    return child;
  };
  return {spawn,workers};
}

test('exit without close still quiesces generation and cleans exactly once',async()=>{
  const f=fixture(),script=scriptedWorkerFactory();
  const keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,spawnWorker:script.spawn});
  const result=await keeper.start();assert.equal(result.phase,'COMPLETED');assert.equal(f.cleaned,1);
});

test('recovery child cannot invoke reserve, native dispatch, owner or proof operations',async()=>{
  for(const operation of ['reserve','sol','btc','authorize','releaseOwner','terminal','permitSol','claim']){
    const f=fixture(),script=scriptedWorkerFactory(message=>{message.operation=operation;});
    const keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,spawnWorker:script.spawn,afterOperation:crashClaim});
    await keeper.start();const previous=f.events.slice();
    const result=await keeper.recover();assert.equal(result.phase,'RECOVERABLE');
    assert.deepEqual(f.events.filter(e=>e!=='discover'),previous.filter(e=>e!=='discover'));
    await keeper.stop();assert.equal(f.cleaned,1);
  }
});

test('old generation messages cannot authorize operations or fail a new worker',async()=>{
  const f=fixture(),script=scriptedWorkerFactory((message,child,workers)=>{
    const old=workers[0];old.emit('message',{type:'operation',generation:old.boot.generation,sequence:12,operation:'withdrawSol'});
  });
  const keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,spawnWorker:script.spawn,afterOperation:crashClaim});
  await keeper.start();assert.equal((await keeper.recover()).phase,'COMPLETED');assert.equal(f.events.filter(e=>e==='withdraw-sol').length,1);
});

test('wrong generation on current child fails closed without executing recovery',async()=>{
  const f=fixture(),script=scriptedWorkerFactory(message=>{message.generation='0'.repeat(32);});
  const keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,spawnWorker:script.spawn,afterOperation:crashClaim});
  await keeper.start();assert.equal((await keeper.recover()).phase,'RECOVERABLE');assert.equal(f.events.includes('validate'),false);assert.equal(f.confirmed.size,0);await keeper.stop();
});

test('stop during retained checkpoint finishes cleanup before terminal notification',async()=>{
  let release,enter;const entered=new Promise(resolve=>{enter=resolve;});
  const f=fixture(),results=[];
  const keeper=createPrivatePaymentKeeperForTest(options(async summary=>{if(summary.phase==='RECOVERABLE'){enter();await new Promise(resolve=>{release=resolve;});}}),{createHost:f.factory,afterOperation:crashClaim,onResult:async summary=>results.push(summary)});
  const work=keeper.start();await entered;const stopped=keeper.stop();release();await stopped;await work;
  assert.equal(f.cleaned,1);assert.equal(results.length,1);assert.equal(results[0].phase,'FAILED');assert.equal(results[0].cleanupState,'COMPLETED');assert.equal(results[0].recoveryState,'UNAVAILABLE');
});

test('fault-latched generation ignores a queued otherwise-valid host operation before exit',async()=>{
  const f=fixture(),script=scriptedWorkerFactory((message,child)=>{
    const valid={...message};message.generation='0'.repeat(32);
    queueMicrotask(()=>child.emit('message',valid));
  });
  const keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,spawnWorker:script.spawn,afterOperation:crashClaim});
  await keeper.start();assert.equal((await keeper.recover()).phase,'RECOVERABLE');assert.equal(f.events.includes('validate'),false);assert.equal(f.confirmed.size,0);await keeper.stop();
});

test('exit-scheduled generation cannot admit a queued next host operation',async()=>{
  const f=fixture(),script=scriptedWorkerFactory((message,child)=>{child.emit('exit',1,null);});
  const keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,spawnWorker:script.spawn,afterOperation:crashClaim});
  await keeper.start();assert.equal((await keeper.recover()).phase,'RECOVERABLE');assert.equal(f.events.includes('validate'),false);assert.equal(f.confirmed.size,0);await keeper.stop();
});

function refundFixture({lifetimeMs=60_000,lostRefund=false,lostWithdrawal=false,proofFailure=false,lostReserve=false,reserveVisible=true}={}) {
  const f=fixture(),control={eligible:false,issued:false,withdrawn:false,attempted:false,claimConflict:false,readFailure:false,reserveAttempted:false,reserveVisible},deadline=performance.now()+lifetimeMs;
  const factory=async context=>{
    const host=await f.factory(context);let authorized=false;
    const authorize=host.authorize;host.authorize=async()=>{await authorize();authorized=true;};
    return {...host,
      async reserve(){
        await host.assertOwnerExited();await context.beforeEvm('reserve');control.reserveAttempted=true;f.events.push('reserve');
        context.update({ownerRefund:{state:'UNKNOWN',amountWei:PRIVATE_PAYMENT_AMOUNTS.reserveWei,claimEpoch:'3166680',eligibleAt:'2026-10-03T07:00:00.000Z'}});
        if(lostReserve)throw Error('PRIVATE_PAYMENT_LOST_RESERVE_RESPONSE');context.evmConfirmed('reserve');
      },
      async assertRetainedHealthy(){if(control.healthFatal)throw Error('PC18_DISK_FLOOR');},
      async refundStatus(){
        if(!authorized||!control.reserveAttempted)return null;
        if(control.readBlock)await control.readBlock();
        if(control.readFailure)throw Error('PRIVATE_PAYMENT_REFUND_READ_UNAVAILABLE');
        f.events.push('refund-discovery');
        const state=!control.reserveVisible?'UNKNOWN':control.claimConflict?'CLAIMED':control.withdrawn?'WITHDRAWN':control.issued?'NOTE_ISSUED':control.attempted?'UNKNOWN':control.eligible?'ELIGIBLE':'WAITING';
        return {state,claimEpoch:'3166680',eligibleAt:'2026-10-03T07:00:00.000Z',...(control.withdrawn?{amount:PRIVATE_PAYMENT_AMOUNTS.reserveWei}:{})};
      },
      async refundWindow(){return {remainingMs:Math.max(0,Math.ceil(deadline-performance.now()))};},
      async advanceToRefundCutoffForTest(){control.eligible=true;f.events.push('test-cutoff');},
      async issueRefund(){
        assert.ok(control.eligible&&!control.attempted&&!control.claimConflict);f.events.push('refund-proof');
        if(proofFailure)throw Error('PRIVATE_PAYMENT_REFUND_PROOF_FAILED');
        await context.beforeEvm('refund');control.attempted=true;f.events.push('refund-send');
        if(lostRefund)throw Error('PRIVATE_PAYMENT_REFUND_RESPONSE_LOST');
        control.issued=true;context.evmConfirmed('refund');
      },
      async withdrawRefund(){
        assert.ok(control.issued);if(control.withdrawn)return {amount:PRIVATE_PAYMENT_AMOUNTS.reserveWei};
        f.events.push('owner-signer-recovered');await context.beforeEvm('withdraw');f.events.push('owner-withdraw-send');
        control.withdrawn=true;context.ownerRefundConfirmed(PRIVATE_PAYMENT_AMOUNTS.reserveWei);
        if(lostWithdrawal)throw Error('PRIVATE_PAYMENT_OWNER_RESPONSE_LOST');
        return {amount:PRIVATE_PAYMENT_AMOUNTS.reserveWei};
      },
      async verifyRefund(){assert.ok(control.withdrawn);f.events.push('refund-verified');},
    };
  };
  return {...f,factory,control,get cleaned(){return f.cleaned;}};
}
const crashSol=({operation,mode,child})=>{if(mode==='payment'&&operation==='sol')child.kill('SIGKILL');};
async function waitFor(predicate){const deadline=Date.now()+2000;while(!predicate()){assert.ok(Date.now()<deadline,'test condition bound');await new Promise(resolve=>setTimeout(resolve,5));}}

test('funded partial-native crash retains cutoff wait, exact F, fresh owner signer, and distinct refund completion',async()=>{
  const f=refundFixture(),operations=[],keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:async e=>{
    operations.push({mode:e.mode,operation:e.operation,pid:e.child.pid});crashSol(e);
    if(e.mode==='refund'&&e.operation==='validateRefund')await e.advanceToRefundCutoff();
    if(e.mode==='refund'&&e.operation==='issueRefund')e.child.kill('SIGKILL');
  }});
  const first=await keeper.start();assert.equal(first.phase,'REFUNDABLE');assert.equal(first.ownerRefund.state,'WAITING');assert.equal(first.settlementState,'FUNDED');assert.equal(f.cleaned,0);
  assert.throws(()=>keeper.recover(),/RECOVERY_UNAVAILABLE/);
  const issued=await keeper.refund();assert.equal(issued.phase,'REFUNDABLE');assert.equal(issued.ownerRefund.state,'NOTE_ISSUED');assert.equal(issued.settlementState,'RECOVERY_NOTE_ISSUED');assert.equal(f.cleaned,0);
  assert.throws(()=>keeper.refund(),/OWNER_REFUND_UNAVAILABLE/);
  const final=await keeper.recoverRefund();assert.equal(final.phase,'REFUNDED');assert.equal(final.ownerRefund.state,'WITHDRAWN');assert.equal(final.ownerRefund.amountWei,PRIVATE_PAYMENT_AMOUNTS.reserveWei);assert.equal(final.cleanupState,'COMPLETED');assert.equal(f.cleaned,1);
  for(const role of ['sol','btc'])assert.equal(final.payouts[role].state,'PENDING');
  assert.equal(final.exposure.sol,'OBSERVED');assert.equal(final.exposure.btc,'NONE');
  for(const action of ['reserve','native-sol','refund-send','owner-withdraw-send'])assert.equal(f.events.filter(e=>e===action).length,1,action);
  for(const action of ['native-btc','claim','withdraw-sol','withdraw-btc'])assert.equal(f.events.includes(action),false,action);
  assert.deepEqual(operations.filter(e=>e.mode==='recoverRefund').map(e=>e.operation),PRIVATE_PAYMENT_PROGRAMS.recoverRefund);
  assert.equal(new Set(operations.map(e=>e.pid)).size,3);assert.deepEqual(await keeper.done,final);
});

test('explicit refund waits without submission and absolute expiry also stops an active waiting worker',async()=>{
  const f=refundFixture({lifetimeMs:200}),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:crashSol,refundPollMs:5});
  assert.equal((await keeper.start()).ownerRefund.state,'WAITING');
  const pending=keeper.refund();await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(keeper.summary().phase,'REFUNDING');assert.equal(f.events.includes('refund-send'),false);assert.throws(()=>keeper.refund(),/OWNER_REFUND_UNAVAILABLE/);
  const final=await pending;assert.equal(final.phase,'FAILED');assert.equal(final.ownerRefund.state,'UNAVAILABLE');assert.equal(final.cleanupState,'COMPLETED');assert.equal(f.cleaned,1);assert.equal(f.events.includes('refund-send'),false);
});

test('idle authenticated cutoff refresh exposes eligibility without sending F or repeating result',async()=>{
  const f=refundFixture(),results=[],keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:crashSol,refundPollMs:5,onResult:async s=>results.push(s)});
  await keeper.start();f.control.eligible=true;await waitFor(()=>keeper.summary().ownerRefund.state==='ELIGIBLE');
  assert.equal(keeper.summary().phase,'REFUNDABLE');assert.equal(results.length,1);assert.equal(f.events.includes('refund-send'),false);await keeper.stop();assert.equal(f.cleaned,1);
});

test('ambiguous F response is never resent and later exact inclusion permits withdrawal-only recovery',async()=>{
  const f=refundFixture({lostRefund:true}),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,refundPollMs:5,afterOperation:async e=>{crashSol(e);if(e.operation==='validateRefund')await e.advanceToRefundCutoff();}});
  await keeper.start();const unknown=await keeper.refund();assert.equal(unknown.phase,'REFUNDABLE');assert.equal(unknown.ownerRefund.state,'UNKNOWN');assert.equal(unknown.settlementState,'UNKNOWN');
  assert.throws(()=>keeper.refund(),/OWNER_REFUND_UNAVAILABLE/);assert.throws(()=>keeper.recoverRefund(),/OWNER_REFUND_UNAVAILABLE/);
  f.control.issued=true;await waitFor(()=>keeper.summary().ownerRefund.state==='NOTE_ISSUED');
  assert.equal((await keeper.recoverRefund()).phase,'REFUNDED');assert.equal(f.events.filter(e=>e==='refund-send').length,1);assert.equal(f.events.filter(e=>e==='owner-withdraw-send').length,1);
});

test('owner withdrawal lost reply or final ACK preserves exact financial refund truth',async()=>{
  for(const fault of ['reply','ack']) {
    const f=refundFixture({lostWithdrawal:fault==='reply'}),keeper=createPrivatePaymentKeeperForTest(options(async s=>{if(fault==='ack'&&s.progressCode==='OWNER_REFUND_WITHDRAWN')throw Error('disk');}),{createHost:f.factory,afterOperation:async e=>{crashSol(e);if(e.operation==='validateRefund')await e.advanceToRefundCutoff();}});
    await keeper.start();const result=await keeper.refund();assert.equal(result.phase,'REFUNDED');assert.equal(result.ownerRefund.state,'WITHDRAWN');assert.equal(f.cleaned,1);assert.equal(f.events.filter(e=>e==='owner-withdraw-send').length,1);
  }
});

test('failed F proof preserves eligible original reserve and never triggers send or native replay',async()=>{
  const f=refundFixture({proofFailure:true}),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:async e=>{crashSol(e);if(e.operation==='validateRefund')await e.advanceToRefundCutoff();}});
  await keeper.start();const result=await keeper.refund();assert.equal(result.phase,'REFUNDABLE');assert.equal(result.ownerRefund.state,'ELIGIBLE');assert.equal(result.settlementState,'FUNDED');assert.equal(f.events.includes('refund-send'),false);assert.equal(f.events.filter(e=>e==='native-sol').length,1);await keeper.stop();
});

test('checkpoint loss before F submission disposes retained authority with no F/native retry',async()=>{
  const f=refundFixture(),keeper=createPrivatePaymentKeeperForTest(options(async s=>{if(s.progressCode==='REFUND_SUBMISSION_PENDING')throw Error('disk');}),{createHost:f.factory,afterOperation:async e=>{crashSol(e);if(e.operation==='validateRefund')await e.advanceToRefundCutoff();}});
  await keeper.start();const result=await keeper.refund();assert.equal(result.phase,'FAILED');assert.equal(result.ownerRefund.state,'UNAVAILABLE');assert.equal(f.cleaned,1);assert.equal(f.events.includes('refund-send'),false);
});

test('paid claim discovery excludes refund and retains only payout recovery',async()=>{
  const f=refundFixture(),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:e=>{if(e.mode==='payment'&&e.operation==='permitBtc')e.child.kill('SIGKILL');},refundPollMs:5});
  await keeper.start();f.control.claimConflict=true;await waitFor(()=>keeper.summary().phase==='RECOVERABLE');
  assert.equal(keeper.summary().settlementState,'PAYOUT_NOTES_ISSUED');assert.throws(()=>keeper.refund(),/OWNER_REFUND_UNAVAILABLE/);assert.equal(f.events.includes('refund-send'),false);await keeper.stop();
});

test('external IPC admits explicit refund and recovery without disclosing original note custody',async()=>{
  const transport=new Transport(),f=refundFixture();
  const worker=createPrivatePaymentWorkerHost({transport,createKeeper:(o,{onResult})=>createPrivatePaymentKeeperForTest(o,{onResult,createHost:f.factory,afterOperation:async e=>{crashSol(e);if(e.operation==='validateRefund')await e.advanceToRefundCutoff();if(e.operation==='issueRefund')e.child.kill('SIGKILL');}})});
  transport.emit('message',{type:'start',operationId,profile:PRIVATE_PAYMENT_PROFILE});await waitFor(()=>transport.messages.some(m=>m.type==='result'&&m.summary.phase==='REFUNDABLE'));
  transport.emit('message',{type:'refund',operationId,profile:PRIVATE_PAYMENT_PROFILE});await waitFor(()=>transport.messages.filter(m=>m.type==='result').length===2);
  transport.emit('message',{type:'recoverRefund',operationId,profile:PRIVATE_PAYMENT_PROFILE});assert.equal((await worker.done).phase,'REFUNDED');
  const serialized=JSON.stringify(transport.messages);for(const field of ['generation','pid','proof','pool','binding','password','secret','reserveNullifier','paymentCommitment'])assert.equal(serialized.includes('"'+field+'"'),false,field);
});

test('transient original-pool read failure preserves ambiguous authority and later verified withdrawal completes without resend',async()=>{
  const f=refundFixture(),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,refundPollMs:5,afterOperation:async e=>{crashSol(e);if(e.operation==='validateRefund')await e.advanceToRefundCutoff();if(e.operation==='issueRefund')e.child.kill('SIGKILL');}});
  await keeper.start();f.control.readFailure=true;await waitFor(()=>keeper.summary().ownerRefund.state==='UNKNOWN');
  assert.equal(f.cleaned,0);assert.equal(keeper.summary().observation,'LIVE');assert.throws(()=>keeper.refund(),/OWNER_REFUND_UNAVAILABLE/);
  f.control.readFailure=false;f.control.eligible=true;await waitFor(()=>keeper.summary().ownerRefund.state==='ELIGIBLE');
  await keeper.refund();assert.equal(keeper.summary().ownerRefund.state,'NOTE_ISSUED');
  // Authenticated delayed observation of the original withdrawal is economic
  // completion, even without a new coordinator. No second withdrawal send.
  f.control.withdrawn=true;const final=await keeper.done;
  assert.equal(final.phase,'REFUNDED');assert.equal(final.ownerRefund.state,'WITHDRAWN');assert.equal(f.cleaned,1);assert.equal(f.events.includes('owner-withdraw-send'),false);
});

test('parent ACK loss during idle refund reconciliation disposes authority once without submission',async()=>{
  const f=refundFixture(),keeper=createPrivatePaymentKeeperForTest(options(async s=>{if(s.progressCode==='OWNER_REFUND_ELIGIBLE')throw Error('disk');}),{createHost:f.factory,refundPollMs:5,afterOperation:crashSol});
  await keeper.start();f.control.eligible=true;
  const final=await keeper.done;assert.equal(final.phase,'FAILED');assert.equal(final.ownerRefund.state,'UNAVAILABLE');assert.equal(final.cleanupState,'COMPLETED');assert.equal(f.cleaned,1);assert.equal(f.events.includes('refund-send'),false);
});

test('refund generations reject reordered native operations and stale predecessor messages',async()=>{
  for(const operation of ['reserve','sol','btc','claim','withdrawSol']) {
    const f=refundFixture(),script=scriptedWorkerFactory(),originalSpawn=script.spawn;
    const spawn=()=>{
      const child=originalSpawn(),originalSend=child.send;
      child.send=(message,callback)=>{
        if(message.type==='start'&&message.mode==='refund') {
          const emit=child.emit.bind(child);let first=true;
          child.emit=(event,...args)=>{
            if(event==='message'&&first&&args[0]?.type==='operation') { first=false;args[0]={...args[0],operation}; }
            return emit(event,...args);
          };
        }
        return originalSend(message,callback);
      };
      return child;
    };
    const keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,spawnWorker:spawn,afterOperation:crashSol});
    await keeper.start();const before=f.events.filter(e=>!e.includes('discovery'));
    assert.equal((await keeper.refund()).phase,'REFUNDABLE');assert.deepEqual(f.events.filter(e=>!e.includes('discovery')),before);await keeper.stop();
  }
});

test('admission waits for in-flight discovery and never spawns a coordinator after verified terminal cleanup',async()=>{
  const f=refundFixture(),script=scriptedWorkerFactory(),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,spawnWorker:script.spawn,refundPollMs:5,afterOperation:crashSol});
  await keeper.start();let entered,release;const began=new Promise(resolve=>{entered=resolve;});
  f.control.readBlock=()=>{entered();return new Promise(resolve=>{release=resolve;});};await began;
  const requested=keeper.refund();const rejected=assert.rejects(requested,/COORDINATOR_ACTIVE/);
  assert.equal(script.workers.length,1);assert.throws(()=>keeper.refund(),/OWNER_REFUND_UNAVAILABLE/);
  f.control.issued=true;f.control.withdrawn=true;f.control.readBlock=null;release();
  await rejected;assert.equal((await keeper.done).phase,'REFUNDED');assert.equal(script.workers.length,1);assert.equal(f.cleaned,1);
});

test('retained owned-host resource failure is fatal despite read-only retry handling',async()=>{
  const f=refundFixture(),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,refundPollMs:5,afterOperation:crashSol});
  await keeper.start();f.control.healthFatal=true;f.control.readFailure=true;
  const final=await keeper.done;assert.equal(final.phase,'FAILED');assert.equal(final.ownerRefund.state,'UNAVAILABLE');assert.equal(f.cleaned,1);assert.equal(f.events.includes('refund-send'),false);
});


test('actual coordinator crash after guarded funding retains original A before any native dispatch',async()=>{
  const f=refundFixture(),operations=[],keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:async e=>{
    operations.push({mode:e.mode,operation:e.operation,pid:e.child.pid});
    if(e.mode==='payment'&&e.operation==='reserve')e.child.kill('SIGKILL');
    if(e.mode==='refund'&&e.operation==='validateRefund')await e.advanceToRefundCutoff();
  }});
  const first=await keeper.start();assert.equal(first.phase,'REFUNDABLE');assert.equal(first.ownerState,'EXIT_CONFIRMED');assert.equal(first.ownerRefund.state,'WAITING');assert.equal(first.settlementState,'FUNDED');assert.equal(f.cleaned,0);
  assert.deepEqual(operations.filter(x=>x.mode==='payment').map(x=>x.operation),['prepare','prepareReserve','authorize','releaseOwner','reserve']);
  assert.ok(f.events.indexOf('authorize')<f.events.indexOf('owner-exit'));assert.ok(f.events.indexOf('owner-exit')<f.events.indexOf('reserve'));
  assert.equal(f.events.some(x=>x.startsWith('native-')),false);
  const result=await keeper.refund();assert.equal(result.phase,'REFUNDED');assert.equal(result.ownerRefund.amountWei,PRIVATE_PAYMENT_AMOUNTS.reserveWei);
  for(const op of ['prepare','prepare-reserve','authorize','owner-exit','reserve','refund-send','owner-withdraw-send'])assert.equal(f.events.filter(x=>x===op).length,1,op);
  assert.equal(new Set(operations.map(x=>x.pid)).size,2);assert.equal(f.cleaned,1);
});
test('pre-funding coordinator loss after proof, retained A, or owner exit stays unfunded and never offers projected refund',async()=>{
  for(const operation of ['prepareReserve','authorize','releaseOwner']) {
    const f=refundFixture(),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:e=>{if(e.mode==='payment'&&e.operation===operation)e.child.kill('SIGKILL');}});
    const result=await keeper.start();assert.equal(result.phase,'FAILED');assert.equal(result.settlementState,'NOT_FUNDED');assert.equal(result.ownerRefund.state,'NONE');
    assert.equal(f.events.includes('reserve'),false);assert.equal(f.events.some(x=>x.startsWith('native-')),false);assert.equal(f.cleaned,1);assert.throws(()=>keeper.refund(),/OWNER_REFUND_UNAVAILABLE/);
  }
});
test('lost reserve response discovers the exact funded authorization with no reserve or owner replay',async()=>{
  const f=refundFixture({lostReserve:true}),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,afterOperation:async e=>{if(e.mode==='refund'&&e.operation==='validateRefund')await e.advanceToRefundCutoff();}});
  const first=await keeper.start();assert.equal(first.phase,'REFUNDABLE');assert.equal(first.settlementState,'FUNDED');assert.equal(first.ownerRefund.state,'WAITING');assert.equal(first.ownerState,'EXIT_CONFIRMED');assert.equal(f.events.some(x=>x.startsWith('native-')),false);
  assert.equal((await keeper.refund()).phase,'REFUNDED');for(const op of ['prepare-reserve','authorize','owner-exit','reserve'])assert.equal(f.events.filter(x=>x===op).length,1);
});
test('ambiguous reserve inclusion stays retained without replay until canonical funding becomes observable',async()=>{
  const f=refundFixture({lostReserve:true,reserveVisible:false}),keeper=createPrivatePaymentKeeperForTest(options(),{createHost:f.factory,refundPollMs:5});
  const first=await keeper.start();assert.equal(first.phase,'REFUNDABLE');assert.equal(first.settlementState,'UNKNOWN');assert.equal(first.ownerRefund.state,'UNKNOWN');assert.equal(f.cleaned,0);
  assert.throws(()=>keeper.refund(),/OWNER_REFUND_UNAVAILABLE/);assert.equal(f.events.filter(x=>x==='reserve').length,1);
  f.control.reserveVisible=true;await waitFor(()=>keeper.summary().ownerRefund.state==='WAITING');assert.equal(keeper.summary().settlementState,'FUNDED');assert.equal(f.events.filter(x=>x==='reserve').length,1);await keeper.stop();
});
