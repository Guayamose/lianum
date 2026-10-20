/** Check known retained-renewal blockers BEFORE the long Original reopen.
 * Readonly DATA: no signer, Source token, RPC, journal mutation or retirement.
 * Original owners still independently validate and open their own state. */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {dirname,join} from 'node:path';
import {readdir,readFile,lstat} from 'node:fs/promises';
import {Vault} from '@lianum/engine/crypto/vault';
import {readPagedSourcePrivateJSONV4} from './paged-source-read-files-v4.mjs';
import * as keys from '../../chains/public-testnet/key-store-v1.mjs';
import {readPagedPublicFinancialHistoryDataV5} from './paged-public-financial-history-data-v5.mjs';
import {sourceFinancialPolicySHA256DataV5,readSourceFinancialEpochEffectiveLimitsDataV5} from '../../chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs';
import {readOwnedPagedEmptyIntentV15} from '../local/paged-empty-owned-intent-recovery-v15.mjs';
import {assertPagedEmptyIntentPeriodExtensionV13} from '../local/paged-empty-unissued-intent-recovery-v13.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function json(directory,name){return(await readPagedSourcePrivateJSONV4(join(directory,name),65536)).data;}
/** DATA check only; caller must supply the cryptographically authenticated
 * epoch store. A quota extension is not a new EMPTY renewal or spending limit. */
export function assertRetainedRenewalQuotaDescendantV35(financial,intent,history){
 assert.deepEqual(history.effectivePolicy,financial.effectivePolicy,'STARTUP_RENEWAL_SIGNED_POLICY');assert.deepEqual(history.limits,financial.limits,'STARTUP_RENEWAL_SIGNED_QUOTA');
 assert.equal(history.history.at(-1)?.epoch.epochId,financial.epoch.epochId,'STARTUP_RENEWAL_SIGNED_EPOCH');
 const epochs=history.history.map(row=>row.epoch),matches=epochs.filter(epoch=>epoch.nonce===intent.intentId);assert.equal(matches.length,1,'STARTUP_RENEWAL_ORIGINAL_SIGNED_INTENT');const original=matches[0],index=epochs.indexOf(original);
 assert.equal(original.policy.expiresAt,intent.expiresAt,'STARTUP_RENEWAL_DEADLINE');assert.equal(original.limits.maximumSourcesPerWallet,intent.maximumSourcesPerWallet,'STARTUP_RENEWAL_ORIGINAL_QUOTA');
 const {maximumSourcesPerWallet:initial,...fixed}=readSourceFinancialEpochEffectiveLimitsDataV5(original.limits);let quota=BigInt(initial);
 for(const epoch of epochs.slice(index+1)){
  assert.deepEqual(epoch.policy,original.policy,'STARTUP_RENEWAL_QUOTA_ONLY_POLICY');const {maximumSourcesPerWallet,...limits}=readSourceFinancialEpochEffectiveLimitsDataV5(epoch.limits);assert.deepEqual(limits,fixed,'STARTUP_RENEWAL_QUOTA_ONLY_LIMITS');assert.ok(BigInt(maximumSourcesPerWallet)>=quota,'STARTUP_RENEWAL_QUOTA_ROLLBACK');quota=BigInt(maximumSourcesPerWallet);
 }
 assert.equal(String(quota),financial.limits.maximumSourcesPerWallet,'STARTUP_RENEWAL_SIGNED_QUOTA');return true;
}
export async function assertPublicRetainedStartupV16(operatorDirectory,nativeDirectory,uniswapMode,defiMode){
 if(!uniswapMode)return Object.freeze({stage:'RETAINED_STARTUP_PREFLIGHT_PASSED',sourcesChecked:0,pendingRenewalsChecked:0,rpcCalls:0,financialTransactions:0});
 const financial=await json(operatorDirectory,'financial-epoch-state-v5.json'),intent=await json(operatorDirectory,'empty-source-renewal-intent-v9.json');
 assert.equal(financial.profile,'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5');
 let authenticatedHistory=null;
 async function authenticateHistory(){if(authenticatedHistory)return authenticatedHistory;const handle=await keys.openPublicPagedServerKeysV1(join(nativeDirectory,'keys'));let accounts;try{accounts=keys.readPublicPagedServerAccountsV1(handle);}finally{keys.closePublicPagedServerKeysV1(handle);}
  const history=await readPagedPublicFinancialHistoryDataV5({directory:nativeDirectory,keysetId:accounts.keysetId,account:accounts.accounts[0],basePolicy:financial.basePolicy});assert.deepEqual(history.effectivePolicy,financial.effectivePolicy,'STARTUP_RENEWAL_SIGNED_POLICY');assert.deepEqual(history.limits,financial.limits,'STARTUP_RENEWAL_SIGNED_QUOTA');assert.equal(history.history.at(-1)?.epoch.epochId,financial.epoch.epochId,'STARTUP_RENEWAL_SIGNED_EPOCH');return authenticatedHistory={...history,epochId:financial.epoch.epochId};}
 if(financial.epoch.nonce===intent.intentId)assert.equal(financial.limits.maximumSourcesPerWallet,intent.maximumSourcesPerWallet,'STARTUP_RENEWAL_QUOTA');
 else assertRetainedRenewalQuotaDescendantV35(financial,intent,await authenticateHistory());
 assert.equal(financial.effectivePolicy.expiresAt,intent.expiresAt,'STARTUP_RENEWAL_DEADLINE');
 assert.ok(Date.now()<intent.expiresAt-1800000,'STARTUP_RENEWAL_WINDOW_CLOSED');
 const quota=BigInt(financial.limits.maximumSourcesPerWallet),sources=uniswapMode.state.sourceLocations.map(source=>({source,password:uniswapMode.input.mixed.journal.password}));
 if(defiMode)sources.push({source:defiMode.state.mixedAuthority,password:sha('LIANUM/PUBLIC/SEPOLIA/DEFI/SOURCE7/AUTHORITY/V8\0'+defiMode.input.password+'\0'+defiMode.input.devicePublicKey)});
 const pending=[],watched=new Map(),watch=async path=>watched.set(path,sha(await readFile(path)));
 for(const name of ['financial-epoch-state-v5.json','empty-source-renewal-intent-v9.json'])await watch(join(operatorDirectory,name));
 await watch(join(nativeDirectory,'source-operations/native-wallet.json'));
 for(const {source,password}of sources){
  const descriptor=(source.authority??source).descriptor;
  let generation=source.emptyReplacementV9?.generation??0;const birthOrdinal=source.mixedSuccessorV35?.birthOrdinal??generation+1;
  if(source.mixedSuccessorV35){const {readPagedMixedSourceSuccessorStorageDataV35}=await import('./paged-mixed-source-successor-current-data-v35.mjs'),history=await readPagedMixedSourceSuccessorStorageDataV35({lineage:source.mixedSuccessorV35,journalPath:source.journalPath,password});for(const file of history.files)watched.set(file.path,file.sha256);
   let lineage=source.mixedSuccessorV35;while(lineage){const previous=await new Vault(lineage.predecessor.journalPath).read(password);generation=previous.data.emptyReplacementV9?.generation??generation;lineage=previous.data.mixedSuccessorV35??null;}
  }
  if(descriptor.deadlineMs<=Date.now())assert.ok(quota>=BigInt(birthOrdinal)+1n,'STARTUP_SOURCE_RENEWAL_QUOTA_TOO_SMALL');
  const directory=join(dirname(source.mixedSuccessorV35?.rootJournalPath??source.emptyReplacementV9?.rootJournalPath??source.journalPath),'renewals');let entries;
  try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}
  assert.ok(entries.length<=16,'STARTUP_SOURCE_RENEWAL_HISTORY_BOUND');
  for(const entry of entries){
   assert.ok(entry.isDirectory()&&!entry.isSymbolicLink()&&/^[1-9][0-9]*$/.test(entry.name)&&BigInt(entry.name)<=16n,'STARTUP_SOURCE_RENEWAL_DIRECTORY');
   if(Number(entry.name)<=generation)continue;
   const journalPath=join(directory,entry.name,'journal.vault'),intentVault=new Vault(join(directory,entry.name,'intent.vault'));let saved;
   try{saved=await intentVault.read(password);}catch(error){if(error.code==='ENOENT')continue;throw error;}
   assert.equal(saved.data.lineage.generation,Number(entry.name),'STARTUP_SOURCE_RENEWAL_GENERATION');
   const needsNext=saved.data.descriptor.deadlineMs<=Date.now()||saved.data.lineage.financial.epochId!==financial.epoch.epochId;
   if(needsNext)assert.ok(quota>=BigInt(saved.data.lineage.generation)+2n,'STARTUP_SOURCE_RENEWAL_QUOTA_TOO_SMALL');
   if(saved.data.lineage.financial.epochId!==financial.epoch.epochId)pending.push({intentVault,intent:saved,password,journalPath});
  }
 }
 if(pending.length)await authenticateHistory();
 const assertCurrent=async()=>{for(const[path,digest]of watched)assert.equal(sha(await readFile(path)),digest,'STARTUP_RENEWAL_PRIVATE_STATE_CHANGED');};
 for(const row of pending){
  const nextIntent=structuredClone(row.intent.data);nextIntent.identity=randomBytes(32).toString('hex');nextIntent.descriptor={...nextIntent.descriptor,pairingId:randomUUID(),deadlineMs:financial.effectivePolicy.expiresAt-1800000};
  nextIntent.lineage.financial={epochId:financial.epoch.epochId,policySHA256:sourceFinancialPolicySHA256DataV5(financial.effectivePolicy),expiresAt:financial.effectivePolicy.expiresAt,maximumSourcesPerWallet:financial.limits.maximumSourcesPerWallet};
  const owned=await readOwnedPagedEmptyIntentV15({...row,nextIntent,financialHistory:authenticatedHistory,assertCurrent});
  if(!owned){
   // Validate a possible retirement without performing it. The Original
   // producer alone may later mutate or retire an authenticated unowned birth.
   assertPagedEmptyIntentPeriodExtensionV13({...row,nextIntent,financialHistory:authenticatedHistory});
   for(const path of [row.intentVault.path,row.journalPath])try{await lstat(path+'.lock');assert.fail('STARTUP_RENEWAL_LOCK_PRESENT');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
 }
 await assertCurrent();return Object.freeze({stage:'RETAINED_STARTUP_PREFLIGHT_PASSED',sourcesChecked:sources.length,pendingRenewalsChecked:pending.length,minimumSourceQuotaChecked:true,authenticatedPendingHistory:pending.length>0,rpcCalls:0,financialTransactions:0});
}
