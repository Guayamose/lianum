/** Locations for the four fixed manual-wallet workflows; no authority or hooks. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export const manualWalletEntrypoints=Object.freeze({
  manualWallet:Object.freeze({name:'manual-wallet-acceptance',entry:fileURLToPath(new URL('./run-manual-wallet-acceptance.mjs',import.meta.url)),worker:fileURLToPath(new URL('./manual-wallet-acceptance.mjs',import.meta.url))}),
  manualWalletRecovery:Object.freeze({name:'manual-wallet-timeout-recovery',entry:fileURLToPath(new URL('./run-manual-wallet-timeout-recovery.mjs',import.meta.url)),worker:fileURLToPath(new URL('./manual-wallet-timeout-recovery.mjs',import.meta.url))}),
  manualWalletBrowser:Object.freeze({name:'manual-wallet-browser-acceptance',entry:fileURLToPath(new URL('./run-manual-wallet-browser-acceptance.mjs',import.meta.url)),worker:fileURLToPath(new URL('./manual-wallet-browser-acceptance.mjs',import.meta.url))}),
  manualWalletBrowserRecovery:Object.freeze({name:'manual-wallet-browser-timeout-recovery',entry:fileURLToPath(new URL('./run-manual-wallet-browser-timeout-recovery.mjs',import.meta.url)),worker:fileURLToPath(new URL('./manual-wallet-browser-timeout-recovery.mjs',import.meta.url))})
});
export function manualWalletInvocation(worker,parent){
 assert.equal(arguments.length,2,'MANUAL_WALLET_FIXED_INVOCATION');
 const selected=Object.values(manualWalletEntrypoints).find(row=>row.worker===worker);
 assert.ok(selected,'MANUAL_WALLET_FIXED_WORKER_REQUIRED');
 assert.equal(parent,selected.entry,'MANUAL_WALLET_FIXED_PARENT_REQUIRED');return selected;
}
