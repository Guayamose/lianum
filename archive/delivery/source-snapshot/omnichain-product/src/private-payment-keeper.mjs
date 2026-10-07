/** Bounded same-authority lifetime for disposable execution workers. This is
 * not node/server/issuer restart recovery. The original private authority stays
 * alive while an explicitly requested new worker completes issued payouts. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPrivatePaymentAuthority, PRIVATE_REFUND_LIFETIME_MAX_MS } from './private-payment-engine.mjs';
import { PRIVATE_PAYMENT_PROGRAMS } from './private-payment-coordinator.mjs';

export const PRIVATE_PAYMENT_RETENTION_MS = 30 * 60_000;
export const PRIVATE_PAYMENT_ATTEMPT_MS = 2 * 60 * 60_000;
const failure = code => Object.assign(new Error(code),{code});
const safeCode = error => /^[A-Z][A-Z0-9_]{1,100}$/.test(error?.code ?? '') ? error.code : /^[A-Z][A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : 'PRIVATE_PAYMENT_COORDINATOR_FAILED';
function exact(message,fields) {
  assert.ok(message && Object.getPrototypeOf(message) === Object.prototype && Object.keys(message).length === fields.length && fields.every(k=>Object.hasOwn(message,k)),'PRIVATE_PAYMENT_COORDINATOR_FIELDS');
  assert.ok(Buffer.byteLength(JSON.stringify(message)) <= 1024,'PRIVATE_PAYMENT_COORDINATOR_SIZE');
}
const spawnCoordinator = () => fork(fileURLToPath(new URL('./private-payment-coordinator.mjs',import.meta.url)),[],{
  cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:['ignore','ignore','ignore','ipc'],
  env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'},
});

/** All injection arguments are trusted module/integration seams. None is part
 * of external worker IPC. afterOperation permits test-only actual-process
 * crash injection after a host operation has genuinely finished. */
export function createPrivatePaymentKeeperForTest(options, {
  createHost, spawnWorker = spawnCoordinator, afterOperation = async()=>{},
  onResult = async()=>{}, retentionMs = PRIVATE_PAYMENT_RETENTION_MS,
  attemptTimeoutMs = PRIVATE_PAYMENT_ATTEMPT_MS, refundPollMs = 15_000,
} = {}) {
  assert.ok(Number.isSafeInteger(retentionMs)&&retentionMs>0&&retentionMs<=PRIVATE_PAYMENT_RETENTION_MS,'PRIVATE_PAYMENT_RETENTION_BOUND');
  assert.ok(Number.isSafeInteger(attemptTimeoutMs)&&attemptTimeoutMs>0&&attemptTimeoutMs<=PRIVATE_PAYMENT_ATTEMPT_MS,'PRIVATE_PAYMENT_ATTEMPT_BOUND');
  assert.ok(Number.isSafeInteger(refundPollMs)&&refundPollMs>0&&refundPollMs<=30_000,'PRIVATE_PAYMENT_REFUND_POLL_BOUND');
  const controller = new AbortController();
  const authority = createPrivatePaymentAuthority({...options,signal:controller.signal},createHost);
  let current, admitting=false, started=false, finished=false, stopping=false, retained=false, idleTimer, stopPromise, resolveDone, expiryTimer, refundDeadline, refreshTimer, refreshing;
  const done = new Promise(resolve=>{resolveDone=resolve;});
  function notify(summary) { return Promise.resolve().then(()=>onResult(summary)); }
  async function finish(summary) {
    if(finished)return summary; finished=true; retained=false; clearTimeout(idleTimer);clearTimeout(expiryTimer);clearInterval(refreshTimer);
    options.signal?.removeEventListener('abort',externalStop);
    try { await notify(summary); } catch {}
    resolveDone(summary); return summary;
  }
  async function stop(code='PRIVATE_PAYMENT_KEEPER_STOPPED') {
    if(stopPromise)return stopPromise;
    stopping=true; retained=false; clearTimeout(idleTimer);clearTimeout(expiryTimer);clearInterval(refreshTimer); controller.abort(failure(code));
    stopPromise=(async()=>{
      const attempt=current;
      if(attempt) { attempt.fail(failure(code)); await attempt.done; }
      if(refreshing)await refreshing.catch(()=>{});
      if(finished)return authority.summary();
      const summary=await authority.cleanup(failure(code)); return finish(summary);
    })();
    return stopPromise;
  }
  const externalStop=()=>{void stop('PRIVATE_PAYMENT_ABORTED');};
  options.signal?.addEventListener('abort',externalStop,{once:true});
  async function attempt(mode) {
    assert.ok(!current&&!admitting&&!finished&&!stopping,'PRIVATE_PAYMENT_COORDINATOR_ACTIVE');
    admitting=true;let child;
    try {
      // No disposable child or startup deadline exists until retained reads
      // have quiesced and the requested economic branch is revalidated.
      if(refreshing)await refreshing;
      assert.ok(!finished&&!stopping,'PRIVATE_PAYMENT_COORDINATOR_ACTIVE');
      const summary=authority.summary();
      if(mode==='recovery')assert.equal(summary.phase,'RECOVERABLE','PRIVATE_PAYMENT_RECOVERY_UNAVAILABLE');
      if(mode==='refund')assert.ok(summary.phase==='REFUNDABLE'&&['WAITING','ELIGIBLE'].includes(summary.ownerRefund.state),'PRIVATE_PAYMENT_OWNER_REFUND_UNAVAILABLE');
      if(mode==='recoverRefund')assert.ok(summary.phase==='REFUNDABLE'&&summary.ownerRefund.state==='NOTE_ISSUED','PRIVATE_PAYMENT_OWNER_REFUND_UNAVAILABLE');
      child=spawnWorker();
    } catch(error) { admitting=false;throw error; }
    clearTimeout(idleTimer);clearInterval(refreshTimer);retained=false;
    const generation=randomBytes(16).toString('hex'),program=PRIVATE_PAYMENT_PROGRAMS[mode];
    let expected=0,inFlight,closed=false,complete=false,fault,closeResolve,attemptResolve,killTimer,exit;
    const childClosed=new Promise(resolve=>{closeResolve=resolve;});
    const attemptDone=new Promise(resolve=>{attemptResolve=resolve;});
    const fail=error=>{
      fault??=failure(safeCode(error));
      if(!closed) { child.kill('SIGTERM'); killTimer??=setTimeout(()=>child.kill('SIGKILL'),5000); }
    };
    const state={child,generation,done:attemptDone,fail}; current=state;admitting=false;
    const timer=setTimeout(()=>{controller.abort(failure('PRIVATE_PAYMENT_ATTEMPT_TIMEOUT'));fail(failure('PRIVATE_PAYMENT_ATTEMPT_TIMEOUT'));},['refund','recoverRefund'].includes(mode)?PRIVATE_REFUND_LIFETIME_MAX_MS:attemptTimeoutMs);
    function onMessage(message) {
      if(current!==state||closed||fault||stopping||complete||child.killed)return;
      // Once exit has been observed, only a queued terminal marker may drain.
      // No old generation can admit another host action during the exit gap.
      if(exitScheduled&&message?.type!=='complete')return;
      try {
        if(message?.type==='complete') {
          exact(message,['type','generation','sequence']);
          assert.equal(message.generation,generation);assert.equal(message.sequence,program.length);assert.equal(expected,program.length);assert.equal(inFlight,undefined);complete=true;return;
        }
        exact(message,['type','generation','sequence','operation']);
        assert.equal(message.type,'operation');assert.equal(message.generation,generation,'PRIVATE_PAYMENT_STALE_COORDINATOR');
        assert.equal(inFlight,undefined,'PRIVATE_PAYMENT_ONE_HOST_OPERATION');assert.equal(message.sequence,expected+1);
        assert.equal(message.operation,program[expected],'PRIVATE_PAYMENT_COORDINATOR_PROGRAM');expected++;
        inFlight=(async()=>{
          await authority.execute(message.operation);
          await afterOperation({operation:message.operation,mode,generation,child,advanceToRefundCutoff:()=>authority.advanceToRefundCutoffForTest()});
          if(current!==state||closed||fault||stopping||child.killed)return;
          await new Promise((resolve,reject)=>{child.send({type:'reply',generation,sequence:message.sequence,ok:true},error=>error?reject(error):resolve());});
        })().catch(fail).finally(()=>{inFlight=undefined;});
      } catch(error) { fail(error); }
    }
    child.on('message',onMessage);child.once('error',fail);
    let exitScheduled=false;
    const onExit=(code,signal)=>{
      if(exitScheduled)return;exitScheduled=true;exit={code,signal};clearTimeout(killTimer);
      // Drain IPC messages queued before process exit; some real fork lifetimes
      // emit exit without close after disconnecting their IPC descriptor.
      setImmediate(()=>{closed=true;if(!complete||code!==0||signal!==null)fault??=failure('PRIVATE_PAYMENT_COORDINATOR_LOST');closeResolve();});
    };
    child.once('exit',onExit);child.once('close',onExit);
    void(async()=>{try {
      await authority.recordCoordinator({event:'STARTED',generation,mode,coordinatorPid:child.pid,keeperPid:process.pid,atNs:process.hrtime.bigint().toString()});
      if(!closed&&!fault&&!stopping)child.send({type:'start',generation,mode},error=>{if(error)fail(error);});
    } catch(error) { fail(error); }})();
    void(async()=>{
      await childClosed;
      // No retained-state notification or replacement can race the old
      // generation's host action, transaction response or durable checkpoint.
      if(inFlight)await inFlight;
      clearTimeout(timer);clearTimeout(killTimer);child.removeListener('message',onMessage);
      try { await authority.recordCoordinator({event:'EXITED',generation,mode,coordinatorPid:child.pid,keeperPid:process.pid,atNs:process.hrtime.bigint().toString(),...exit,complete}); } catch(error) { fault??=error; }
      let summary;
      try { summary=await authority.finishAttempt(fault,{retain:!stopping&&!controller.signal.aborted}); }
      catch(error) { summary=await authority.cleanup(error); }
      if(stopping&&['RECOVERABLE','REFUNDABLE'].includes(summary.phase))summary=await authority.cleanup(failure('PRIVATE_PAYMENT_KEEPER_STOPPED'));
      if(current===state)current=undefined;
      let notifyFailed=false;
      if(['RECOVERABLE','REFUNDABLE'].includes(summary.phase)&&!stopping) {
        retained=true;
        if(summary.phase==='REFUNDABLE') {
          try {
            const window=await authority.refundWindow();assert.ok(window,'PRIVATE_PAYMENT_REFUND_RETENTION_REQUIRED');
            const candidate=performance.now()+window.remainingMs;
            refundDeadline=refundDeadline===undefined?candidate:Math.min(refundDeadline,candidate);
            clearTimeout(expiryTimer);
            expiryTimer=setTimeout(()=>{void stop('PRIVATE_PAYMENT_REFUND_RECOVERY_EXPIRED');},Math.max(0,Math.ceil(refundDeadline-performance.now())));
            refreshTimer=setInterval(()=>{
              if(current||admitting||stopping||finished||refreshing)return;
              refreshing=authority.refreshRefund().then(async updated=>{
                if(updated.ownerRefund.state==='WITHDRAWN'&&!stopping)await finish(await authority.finishAttempt(null,{retain:false}));
              }).catch(()=>{void stop('PRIVATE_PAYMENT_REFUND_RECONCILIATION_FAILED');}).finally(()=>{refreshing=undefined;});
            },refundPollMs);
          } catch(error) { summary=await authority.cleanup(error);await finish(summary); }
        } else idleTimer=setTimeout(()=>{void stop('PRIVATE_PAYMENT_RECOVERY_EXPIRED');},retentionMs);
        if(!finished)try { await notify(summary); } catch { notifyFailed=true; }
      } else await finish(summary);
      attemptResolve(summary);
      if(notifyFailed)void stop('PRIVATE_PAYMENT_RESULT_FAILED');
    })();
    return attemptDone;
  }
  return Object.freeze({
    done,
    start() { assert.ok(!started&&!finished&&!stopping,'PRIVATE_PAYMENT_ALREADY_STARTED');started=true;return attempt('payment'); },
    recover() { assert.ok(started&&retained&&!current&&!admitting&&!finished&&!stopping&&authority.summary().phase==='RECOVERABLE','PRIVATE_PAYMENT_RECOVERY_UNAVAILABLE');return attempt('recovery'); },
    refund() { assert.ok(started&&retained&&!current&&!admitting&&!finished&&!stopping&&authority.summary().phase==='REFUNDABLE'&&['WAITING','ELIGIBLE'].includes(authority.summary().ownerRefund.state),'PRIVATE_PAYMENT_OWNER_REFUND_UNAVAILABLE');return attempt('refund'); },
    recoverRefund() { assert.ok(started&&retained&&!current&&!admitting&&!finished&&!stopping&&authority.summary().phase==='REFUNDABLE'&&authority.summary().ownerRefund.state==='NOTE_ISSUED','PRIVATE_PAYMENT_OWNER_REFUND_UNAVAILABLE');return attempt('recoverRefund'); },
    stop,
    summary:()=>authority.summary(),
  });
}
export function createPrivatePaymentKeeper(options, {onResult} = {}) {
  return createPrivatePaymentKeeperForTest(options,{onResult});
}
