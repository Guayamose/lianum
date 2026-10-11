/** Current manual-wallet execution evidence. Historical source tables remain
 * evidence of their original builds; the adopted generation owns current bytes. */
import assert from 'node:assert/strict';
import {relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectRoot} from '@lianum/environment';
import {captureAdoptedSourceEvidence} from '@lianum/proofs/verification/sources/adopted-source-evidence';
import {manualWalletEntrypoints} from './manual-wallet-entrypoints.mjs';
import {walletBrowserRuntimePins} from './wallet-browser-runtime-pins.mjs';

function capture(browser,recovery){
 const adopted=captureAdoptedSourceEvidence();
 const expected=new Map(adopted.sourceFiles.map(row=>[row.source,row.sourceSHA256]));
 const required=[...Object.values(manualWalletEntrypoints).flatMap(row=>[row.entry,row.worker]),
  new URL('./current-manual-wallet-source-pins.mjs',import.meta.url),
  new URL('./manual-wallet-entrypoints.mjs',import.meta.url)];
 for(const value of required){
  const path=typeof value==='string'?value:fileURLToPath(value);
  assert.ok(expected.has(relative(projectRoot,path).split(sep).join('/')),'MANUAL_WALLET_ADOPTED_ENTRY_REQUIRED');
 }
 if(browser)for(const name of ['index.html','app.mjs','style.css'])
  assert.ok(expected.has('apps/wallet/src/client/'+name),'MANUAL_BROWSER_ADOPTED_ASSET_REQUIRED');
 return {...adopted,format:recovery?'CURRENT_MANUAL_BROWSER_RECOVERY_SOURCE_CLOSURE_V1':browser?'CURRENT_MANUAL_BROWSER_SOURCE_CLOSURE_V1':'CURRENT_MANUAL_WALLET_SOURCE_CLOSURE_V1',

  ...(browser?{walletBrowserRuntime:walletBrowserRuntimePins()}: {})};
}
export function currentManualWalletSourcePins(){assert.equal(arguments.length,0,'MANUAL_WALLET_SOURCE_PINS_NO_OPTIONS');return capture(false,false);}
export function currentManualWalletBrowserSourcePins(){assert.equal(arguments.length,0,'MANUAL_BROWSER_SOURCE_PINS_NO_OPTIONS');return capture(true,false);}
export function currentManualWalletBrowserRecoverySourcePins(){assert.equal(arguments.length,0,'MANUAL_BROWSER_RECOVERY_SOURCE_PINS_NO_OPTIONS');return capture(true,true);}
