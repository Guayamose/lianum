/** Fixed server locators, never a runtime, Source or spending capability. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lstat} from 'node:fs/promises';
import {PUBLIC_OPERATOR_STATE_V4,readPrivateOperatorFileV4} from './public-operator-state-v4.mjs';

export const PUBLIC_UNISWAP_MODE_FILE_V6='uniswap-active-v6.json';
export function publicUniswapConfigurationV6(configuration,devicePublicKey){
 assert.match(devicePublicKey,/^04[0-9a-f]{128}$/);assert.notEqual(devicePublicKey,configuration.devicePublicKey,'PAEG_UNISWAP_PHONE_PRINCIPAL');
 return {parent:{...Object.fromEntries(['nativeDirectory','providerDirectory','supervisorDirectory','journal','devicePublicKey'].map(key=>[key,configuration[key]])),supervisorDirectory:join(PUBLIC_OPERATOR_STATE_V4,'supervisor-uniswap-v6')},mixed:{venue:'AAVE_USDC',devicePublicKey,journal:{path:join(PUBLIC_OPERATOR_STATE_V4,'authority-uniswap-phone-v6','journal.vault'),password:configuration.journal.password},flatJournal:{path:join(PUBLIC_OPERATOR_STATE_V4,'authority-uniswap-flat-v6','journal.vault'),password:configuration.journal.password}}};
}
export async function readPublicUniswapModeV6(root,configuration){
 let bytes;try{bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,PUBLIC_UNISWAP_MODE_FILE_V6);}catch(error){if(error.code!=='ENOENT')throw error;try{await lstat(join(PUBLIC_OPERATOR_STATE_V4,'supervisor-uniswap-v6','mixed-supervisor.vault'));}catch(missing){if(missing.code==='ENOENT')return null;throw missing;}throw Error('PAEG_UNISWAP_ACTIVATION_PUBLICATION_PENDING');}
 try{
  const mode=JSON.parse(bytes.toString('utf8'));assert.deepEqual(Object.keys(mode).sort(),['devicePublicKey','profile','supervisorDirectory']);assert.equal(mode.profile,'ORIGINAL_PUBLIC_UNISWAP_ACTIVE_CONFIGURATION_V6');const input=publicUniswapConfigurationV6(configuration,mode.devicePublicKey);assert.equal(mode.supervisorDirectory,input.parent.supervisorDirectory);
  const M=await import(pathToFileURL(join(root,'packages/backend/src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs')).href),state=await M.readOriginalPagedPublicUniswapMixedRecoveryModeV6({directory:mode.supervisorDirectory,password:configuration.journal.password});assert.equal(state.financialPermissionIssued,false);assert.equal(state.parentDirectory,configuration.supervisorDirectory,'PAEG_UNISWAP_ORIGINAL_PARENT_DIRECTORY');assert.deepEqual(state.descriptor.devicePublicKey,configuration.devicePublicKey,'PAEG_UNISWAP_ORIGINAL_PARENT_PRINCIPAL');return {input,state};
 }finally{bytes.fill(0);}
}
