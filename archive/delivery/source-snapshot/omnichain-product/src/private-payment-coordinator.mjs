/** Disposable execution coordinator. Holds no runtime, key, proof or note state.
 * The keeper admits one ordered operation at a time and retains the authority.
 * Its exact fixed recovery program has no funding or native-dispatch operation. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const PRIVATE_PAYMENT_PROGRAMS = Object.freeze({
  payment:Object.freeze(['prepare','prepareReserve','authorize','releaseOwner','reserve','sol','join','btc','terminal','permitSol','permitBtc','claim','withdrawSol','withdrawBtc','verify']),
  recovery:Object.freeze(['validateRecovery','recoverSol','recoverBtc','verify']),
  refund:Object.freeze(['validateRefund','awaitRefundCutoff','issueRefund','withdrawRefund','verifyRefund']),
  recoverRefund:Object.freeze(['validateRefundRecovery','withdrawRefund','verifyRefund']),
});
const exact = (message, fields) => {
  assert.ok(message && Object.getPrototypeOf(message) === Object.prototype && Object.keys(message).length === fields.length && fields.every(k=>Object.hasOwn(message,k)),'PRIVATE_PAYMENT_COORDINATOR_FIELDS');
  assert.ok(Buffer.byteLength(JSON.stringify(message)) <= 1024,'PRIVATE_PAYMENT_COORDINATOR_SIZE');
};
export function runPrivatePaymentCoordinator(transport = process) {
  let ended = false, started = false, generation, program, sequence = 0, pending, timer;
  const finish = code => {
    if (ended) return; ended = true;
    clearTimeout(timer); transport.removeListener('message',onMessage);
    if (transport.connected) transport.disconnect();
    if (transport === process) process.exitCode = code;
  };
  const next = () => {
    if (sequence === program.length) {
      transport.send({type:'complete',generation,sequence}, error=>finish(error ? 1 : 0)); return;
    }
    pending = ++sequence;
    timer = setTimeout(()=>finish(1), program[sequence-1] === 'awaitRefundCutoff' ? 3 * 60 * 60_000 : 17 * 60_000);
    transport.send({type:'operation',generation,sequence,operation:program[sequence-1]},error=>{if(error)finish(1);});
  };
  function onMessage(message) {
    try {
      if (!started) {
        exact(message,['type','generation','mode']); assert.equal(message.type,'start');
        assert.match(message.generation,/^[0-9a-f]{32}$/); assert.ok(Object.hasOwn(PRIVATE_PAYMENT_PROGRAMS,message.mode));
        started=true; generation=message.generation; program=PRIVATE_PAYMENT_PROGRAMS[message.mode]; clearTimeout(timer); next(); return;
      }
      exact(message,['type','generation','sequence','ok']); assert.equal(message.type,'reply'); assert.equal(message.generation,generation); assert.equal(message.sequence,pending); assert.equal(message.ok,true);
      clearTimeout(timer); pending=undefined; next();
    } catch { finish(1); }
  }
  transport.on('message',onMessage); transport.once('disconnect',()=>finish(1)); transport.once('error',()=>finish(1));
  timer=setTimeout(()=>finish(1),10_000);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (typeof process.send !== 'function') process.exitCode=1;
  else runPrivatePaymentCoordinator();
}
