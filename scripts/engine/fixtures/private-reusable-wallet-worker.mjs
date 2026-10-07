/** Integration-only exact old-S replay after two genuine payments. The actual
 * production action/keeper engine is unchanged; no replay/arbitrary-call
 * command is added to HTTP or the production worker allowlist. */
import {createPrivateWalletWorkerHost} from '../../../packages/engine/src/wallet/runtime/private-wallet-worker.mjs';
import {createPrivateWalletAuthority} from '../../../packages/engine/src/wallet/runtime/private-wallet-engine.mjs';
if(typeof process.send!=='function')throw Error('PRIVATE_WALLET_IPC_REQUIRED');
const host=createPrivateWalletWorkerHost({transport:process,createAuthority:options=>{
 const authority=createPrivateWalletAuthority(options),intents=new Map(),payments=[];
 return Object.freeze({status:()=>authority.status(),abort:()=>authority.abort(),async action(action,input){
  const result=await authority.action(action,input);
  if(action==='prepareIntent')intents.set(input.intentId,input.kind);
  if(action==='execute'&&intents.get(input.intentId)==='payment'){
   payments.push(input.operationId);
   if(payments.length===2)await authority.replaySpendForTest(payments[0]);
  }
  return result;
 }});
}});
const stop=()=>void host.stop();process.once('SIGTERM',stop);process.once('SIGINT',stop);
host.done.then(()=>{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);if(process.connected)process.disconnect();});
