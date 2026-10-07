/** Fixed repository fork entrypoint; no caller-selected executor or config.
 * The parent is the sole public journal writer. Every checkpoint must receive
 * its matching durable ACK before the engine may expose another transaction.
 * This module is inert when imported and the injection seam is never in IPC.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PRIVATE_PAYMENT_PROFILE, sanitizePrivatePaymentSummary } from './private-payment-engine.mjs';
import { createPrivatePaymentKeeper } from './private-payment-keeper.mjs';

export const PRIVATE_PAYMENT_IPC_MAX_BYTES = 16 * 1024;
export const PRIVATE_PAYMENT_ACK_TIMEOUT_MS = 30_000;
const error = code => Object.assign(new Error(code), { code });
function exact(value, keys) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(k=>Object.hasOwn(value,k)), 'PRIVATE_PAYMENT_IPC_FIELDS');
  assert.ok(Buffer.byteLength(JSON.stringify(value)) <= PRIVATE_PAYMENT_IPC_MAX_BYTES, 'PRIVATE_PAYMENT_IPC_SIZE');
}

/** transport/runPayment/timeouts are trusted host-test arguments only. The
 * actual entrypoint below selects process and the real engine unconditionally.
 */
export function createPrivatePaymentWorkerHost({ transport, runPayment, createKeeper = createPrivatePaymentKeeper, ackTimeoutMs = PRIVATE_PAYMENT_ACK_TIMEOUT_MS, bootTimeoutMs = 10_000 } = {}) {
  assert.ok(transport && typeof transport.on === 'function' && typeof transport.send === 'function', 'PRIVATE_PAYMENT_IPC_REQUIRED');
  assert.ok(runPayment === undefined || typeof runPayment === 'function');
  assert.equal(typeof createKeeper,'function');
  assert.ok(Number.isSafeInteger(ackTimeoutMs)&&ackTimeoutMs>0&&ackTimeoutMs<=PRIVATE_PAYMENT_ACK_TIMEOUT_MS,'PRIVATE_PAYMENT_ACK_BOUND');
  assert.ok(Number.isSafeInteger(bootTimeoutMs)&&bootTimeoutMs>0&&bootTimeoutMs<=10_000,'PRIVATE_PAYMENT_BOOT_BOUND');
  const controller=new AbortController();let started=false,finished=false,sequence=0,pending,fault,resolveDone,keeper,operationId;
  const done=new Promise(resolve=>{resolveDone=resolve;});
  const connected=()=>transport.connected!==false;
  function abort(code) {
    fault??=error(code);if(!controller.signal.aborted)controller.abort(fault);
    if(pending){const p=pending;pending=undefined;clearTimeout(p.timer);p.reject(fault);}
    if(!started)finish(null);
  }
  function finish(summary) {
    if(finished)return;finished=true;clearTimeout(bootTimer);
    if(pending){clearTimeout(pending.timer);pending.reject(fault??error('PRIVATE_PAYMENT_WORKER_STOPPED'));pending=undefined;}
    transport.removeListener('message',onMessage);transport.removeListener('disconnect',onDisconnect);transport.removeListener('error',onError);
    resolveDone(summary);
  }
  async function send(message) {
    assert.ok(Buffer.byteLength(JSON.stringify(message))<=PRIVATE_PAYMENT_IPC_MAX_BYTES,'PRIVATE_PAYMENT_IPC_SIZE');
    if(!connected())throw error('PRIVATE_PAYMENT_PARENT_DISCONNECTED');
    await new Promise((resolve,reject)=>{try{transport.send(message,e=>e?reject(e):resolve());}catch(e){reject(e);}});
  }
  async function checkpoint(payload) {
    if(fault)throw fault;if(controller.signal.aborted)throw error('PRIVATE_PAYMENT_ABORTED');
    assert.equal(pending,undefined,'PRIVATE_PAYMENT_ONE_CHECKPOINT');
    const safe=sanitizePrivatePaymentSummary(payload),current=++sequence;
    const acknowledged=new Promise((resolve,reject)=>{const timer=setTimeout(()=>abort('PRIVATE_PAYMENT_ACK_TIMEOUT'),ackTimeoutMs);pending={sequence:current,resolve,reject,timer};});
    // Attach rejection handling before awaiting send; disconnect can happen
    // synchronously inside transport.send without an unhandled rejection.
    const delivery=send({type:'checkpoint',sequence:current,payload:safe}).catch(()=>abort('PRIVATE_PAYMENT_IPC_SEND_FAILED'));
    await Promise.all([delivery,acknowledged]);if(fault)throw fault;
  }
  async function start(message) {
    try {
      const options={operationId:message.operationId,profile:message.profile,onCheckpoint:checkpoint,signal:controller.signal};
      if(runPayment) {
        // Legacy trusted one-shot host seam; production always uses a keeper.
        const summary=sanitizePrivatePaymentSummary(await runPayment(options));
        assert.ok(['COMPLETED','FAILED'].includes(summary.phase) && summary.engineState === 'STOPPED' && ['COMPLETED','FAILED'].includes(summary.cleanupState) && summary.observation === 'RETAINED_HISTORY', 'PRIVATE_PAYMENT_TERMINAL_REQUIRED');
        if(connected())try{await send({type:'result',summary});}catch{abort('PRIVATE_PAYMENT_IPC_SEND_FAILED');}
        finish(summary); return;
      }
      keeper=createKeeper(options,{onResult:async value=>{
        const summary=sanitizePrivatePaymentSummary(value);
        assert.ok(['RECOVERABLE','REFUNDABLE','REFUNDED','COMPLETED','FAILED'].includes(summary.phase) && summary.engineState==='STOPPED','PRIVATE_PAYMENT_TERMINAL_REQUIRED');
        if(connected())await send({type:'result',summary});
      }});
      keeper.done.then(finish).catch(()=>{abort('PRIVATE_PAYMENT_ENGINE_FAILED');finish(null);});
      void keeper.start().catch(()=>abort('PRIVATE_PAYMENT_ENGINE_FAILED'));
    } catch { abort('PRIVATE_PAYMENT_ENGINE_FAILED');finish(null); }
  }
  function onMessage(message) {
    try {
      if(!started) {
        exact(message,['type','operationId','profile']);assert.equal(message.type,'start','PRIVATE_PAYMENT_START_REQUIRED');
        assert.match(message.operationId,/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/,'PRIVATE_PAYMENT_OPERATION_ID');assert.equal(message.profile,PRIVATE_PAYMENT_PROFILE,'PRIVATE_PAYMENT_PROFILE');
        started=true;operationId=message.operationId;clearTimeout(bootTimer);void start(message);return;
      }
      if(message?.type==='stop') { exact(message,['type']);abort('PRIVATE_PAYMENT_WORKER_STOPPED');return; }
      if(['recover','refund','recoverRefund'].includes(message?.type)) {
        exact(message,['type','operationId','profile']);assert.equal(message.operationId,operationId,'PRIVATE_PAYMENT_OPERATION_ID');assert.equal(message.profile,PRIVATE_PAYMENT_PROFILE,'PRIVATE_PAYMENT_PROFILE');
        assert.ok(keeper&&!pending&&!fault,'PRIVATE_PAYMENT_RECOVERY_UNAVAILABLE');
        void keeper[message.type]().catch(()=>abort('PRIVATE_PAYMENT_RECOVERY_FAILED'));return;
      }
      exact(message,['type','sequence']);assert.equal(message.type,'ack','PRIVATE_PAYMENT_ACK_REQUIRED');
      assert.ok(Number.isSafeInteger(message.sequence)&&pending&&message.sequence===pending.sequence,'PRIVATE_PAYMENT_ACK_SEQUENCE');
      const p=pending;pending=undefined;clearTimeout(p.timer);p.resolve();
    } catch { abort('PRIVATE_PAYMENT_IPC_REJECTED'); }
  }
  const onDisconnect=()=>abort('PRIVATE_PAYMENT_PARENT_DISCONNECTED');
  const onError=()=>abort('PRIVATE_PAYMENT_IPC_ERROR');
  const bootTimer=setTimeout(()=>abort('PRIVATE_PAYMENT_BOOT_TIMEOUT'),bootTimeoutMs);
  transport.on('message',onMessage);transport.on('disconnect',onDisconnect);transport.on('error',onError);
  return Object.freeze({done,stop:()=>abort('PRIVATE_PAYMENT_WORKER_STOPPED')});
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(typeof process.send!=='function') { process.stderr.write('PRIVATE_PAYMENT_IPC_REQUIRED\n');process.exitCode=1; }
  else {
    const host=createPrivatePaymentWorkerHost({transport:process});
    const stop=()=>host.stop();process.once('SIGTERM',stop);process.once('SIGINT',stop);
    host.done.then(summary=>{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);if(process.connected)process.disconnect();if(!summary||!['COMPLETED','REFUNDED'].includes(summary.phase))process.exitCode=1;});
  }
}
