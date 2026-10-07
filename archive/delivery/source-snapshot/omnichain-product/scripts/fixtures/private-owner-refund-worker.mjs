/** Test-only process failures and explicitly accelerated local EVM cutoff.
 * No production request can select this fixture or modify time/worker policy. */
import {createPrivatePaymentWorkerHost} from '../../src/private-payment-worker.mjs';
import {createPrivatePaymentKeeperForTest} from '../../src/private-payment-keeper.mjs';
if(typeof process.send!=='function')throw Error('PRIVATE_PAYMENT_IPC_REQUIRED');
const done=new Set();
const host=createPrivatePaymentWorkerHost({transport:process,createKeeper:(options,{onResult})=>createPrivatePaymentKeeperForTest(options,{onResult,afterOperation:async({operation,mode,child,advanceToRefundCutoff})=>{
  if(mode==='payment'&&operation==='sol'&&!done.has('payment-crash')){done.add('payment-crash');child.kill('SIGKILL');}
  if(mode==='refund'&&operation==='validateRefund'&&!done.has('clock')){done.add('clock');await advanceToRefundCutoff();}
  if(mode==='refund'&&operation==='issueRefund'&&!done.has('refund-crash')){done.add('refund-crash');child.kill('SIGKILL');}
}})});
const stop=()=>host.stop();process.once('SIGTERM',stop);process.once('SIGINT',stop);
host.done.then(summary=>{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);if(process.connected)process.disconnect();if(!summary||!['COMPLETED','REFUNDED'].includes(summary.phase))process.exitCode=1;});
