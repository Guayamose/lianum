/** Integration-only crash injection. The production entrypoint has no crash
 * option and the HTTP/worker request shapes cannot select this fixture. Real
 * owned nodes, original proofs/custody, and production transport remain in use. */
import { createPrivatePaymentWorkerHost } from '../../src/private-payment-worker.mjs';
import { createPrivatePaymentKeeperForTest } from '../../src/private-payment-keeper.mjs';
if(typeof process.send!=='function')throw Error('PRIVATE_PAYMENT_IPC_REQUIRED');
let injected=false;
const host=createPrivatePaymentWorkerHost({transport:process,createKeeper:(options,{onResult})=>createPrivatePaymentKeeperForTest(options,{onResult,afterOperation:async({operation,mode,child})=>{
  if(!injected&&mode==='payment'&&operation==='claim'){injected=true;child.kill('SIGKILL');}
}})});
const stop=()=>host.stop();process.once('SIGTERM',stop);process.once('SIGINT',stop);
host.done.then(summary=>{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);if(process.connected)process.disconnect();if(!summary||summary.phase!=='COMPLETED')process.exitCode=1;});
