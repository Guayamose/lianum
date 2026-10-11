/** PC18 owner process. fd3 trusted bootstrap; fd4 SOL; fd5 BTC; fd6
 * assembler. stdin/stdout are public control only. No key/graph export route.
 * Optional ownerRefundCustody:{path,password,withdrawalRecipient} is accepted
 * only in trusted fd3 bootstrap. Original type-3 material is authenticated on
 * disk before reserve proof release, completePackages and orderly owner exit.
 * Actual proving is explicit and lazy; importing this file runs nothing.
 */
import { fileURLToPath } from 'node:url';
import { runAssemblyProcess } from '@lianum/engine/assembly/private-assembly-actors';
import { proveAssemblyInWorker } from './assembly-workers.mjs';
export async function runAssemblyOwnerProcess(callbacks) {
  return runAssemblyProcess('owner', callbacks ?? {
    async proveReserve(mode, input, label) {
      if (mode !== 'reserve') throw new Error('PC18_RESERVE_ONLY');
      return proveAssemblyInWorker(mode, input, label);
    },
    async proveWallet(mode,input,label) {
      if(mode!=='reserve_from_note')throw new Error('PC18_WALLET_RESERVE_ONLY');
      return proveAssemblyInWorker(mode,input,label);
    },
    async proveAssembly(mode, input, label) {
      if (mode !== 'authorization') throw new Error('PC18_AUTHORIZATION_ONLY');
      return proveAssemblyInWorker(mode, input, label);
    },
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) runAssemblyOwnerProcess().catch(() => { process.stderr.write('PC18_OWNER_STARTUP_REJECTED\n'); process.exitCode = 1; });
