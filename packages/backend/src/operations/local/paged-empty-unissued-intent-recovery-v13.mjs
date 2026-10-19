/** Retire only an authenticated, never-owned empty birth after a signed period
 * extension. This storage helper issues no Source, permission or transaction.
 * The Original producer supplies its verified lane history and current checks. */
import assert from 'node:assert/strict';
import {open,readFile,lstat,realpath,mkdir,rename,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {sourceFinancialPolicySHA256DataV5} from '../../chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs';
import {assertPagedEmptySourceRecordDataV9} from '../recovery/paged-empty-source-replacement-data-v9.mjs';

async function absent(path){try{await lstat(path);}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error('EMPTY_REPLACEMENT_UNISSUED_FILE_PRESENT');}
async function physical(path){const s=await lstat(path);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600&&s.size<=2097152&&await realpath(path)===path,'EMPTY_REPLACEMENT_UNISSUED_PRIVATE_FILE');}
async function directory(path){await mkdir(path,{recursive:true,mode:0o700});const s=await lstat(path);assert.ok(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700&&await realpath(path)===path,'EMPTY_REPLACEMENT_UNISSUED_PRIVATE_DIRECTORY');}
async function syncDirectory(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function preserve(path,bytes){
 try{await physical(path);assert.deepEqual(await readFile(path),bytes,'EMPTY_REPLACEMENT_UNISSUED_ARCHIVE_CHANGED');return;}catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=path+'.tmp-'+randomUUID();let h;
 try{h=await open(temporary,'wx',0o600);await h.writeFile(bytes);await h.sync();await h.close();h=null;await absent(path);await rename(temporary,path);await syncDirectory(dirname(path));}
 finally{await h?.close();try{await unlink(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
}

/** Authenticated financial history DATA, shared with owned-child recovery.
 * Unowned retirement requires unchanged quotas. Owned readback may accept a
 * separately signed source quota increase; monetary scope cannot change. */
export function assertPagedEmptyIntentPeriodExtensionV13({intent,nextIntent,financialHistory},allowSourceQuotaIncrease=false){
 assert.equal(typeof allowSourceQuotaIncrease,'boolean');
 const old=intent.data,lineage=old.lineage,next=nextIntent.lineage;
 for(const key of ['profile','generation','rootJournalPath','predecessor'])assert.deepEqual(lineage[key],next[key],'EMPTY_REPLACEMENT_UNISSUED_BINDING');
 assert.notEqual(lineage.financial.epochId,next.financial.epochId,'EMPTY_REPLACEMENT_UNISSUED_NEW_EPOCH');
 const history=financialHistory.history,priorIndex=history.findIndex(row=>row.epoch.epochId===lineage.financial.epochId),last=history.at(-1)?.epoch;
 assert.ok(priorIndex>=0&&priorIndex<history.length-1&&last?.epochId===financialHistory.epochId&&last.epochId===next.financial.epochId,'EMPTY_REPLACEMENT_UNISSUED_SIGNED_HISTORY');
 const prior=history[priorIndex].epoch;
 for(const [saved,epoch] of [[lineage.financial,prior],[next.financial,last]])assert.deepEqual(saved,{epochId:epoch.epochId,policySHA256:sourceFinancialPolicySHA256DataV5(epoch.policy),expiresAt:epoch.policy.expiresAt,maximumSourcesPerWallet:epoch.limits.maximumSourcesPerWallet},'EMPTY_REPLACEMENT_UNISSUED_SIGNED_TERMS');
 const {expiresAt:oldExpiry,...oldPolicy}=prior.policy,{expiresAt:newExpiry,...newPolicy}=last.policy;
 assert.ok(newExpiry>oldExpiry,'EMPTY_REPLACEMENT_UNISSUED_PERIOD_EXTENSION');assert.deepEqual(newPolicy,oldPolicy,'EMPTY_REPLACEMENT_UNISSUED_SCOPE_CHANGED');
 if(allowSourceQuotaIncrease){const {maximumSourcesPerWallet:oldQuota,...oldLimits}=prior.limits,{maximumSourcesPerWallet:newQuota,...newLimits}=last.limits;assert.deepEqual(newLimits,oldLimits,'EMPTY_REPLACEMENT_UNISSUED_QUOTA_CHANGED');assert.ok(BigInt(newQuota)>=BigInt(oldQuota)&&BigInt(newQuota)<=16n,'EMPTY_REPLACEMENT_UNISSUED_QUOTA_CHANGED');}
 else assert.deepEqual(last.limits,prior.limits,'EMPTY_REPLACEMENT_UNISSUED_QUOTA_CHANGED');
 assert.ok(old.descriptor.deadlineMs>lineage.predecessor.descriptor.deadlineMs&&old.descriptor.deadlineMs<=oldExpiry-30*60000,'EMPTY_REPLACEMENT_UNISSUED_OLD_DEADLINE');
 assert.notEqual(nextIntent.identity,old.identity);assert.notEqual(nextIntent.descriptor.pairingId,old.descriptor.pairingId);
}

export async function recoverUnissuedPagedEmptyIntentV13({intentVault,intent,password,journalPath,nextIntent,financialHistory,assertCurrent}){
 assertPagedEmptyIntentPeriodExtensionV13({intent,nextIntent,financialHistory});
 const old=intent.data,lineage=old.lineage;
 const owner=join(dirname(journalPath),'private-owner.vault');
 async function unowned(){await absent(owner);await absent(owner+'.lock');await absent(journalPath+'.lock');await absent(intentVault.path+'.lock');}
 async function child(path){try{await physical(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}const r=assertPagedEmptySourceRecordDataV9(await new Vault(path).read(password));assert.equal(r.revision,0,'EMPTY_REPLACEMENT_UNISSUED_CHILD_ADVANCED');assert.equal(r.data.identity,old.identity);assert.deepEqual(r.data.descriptor,old.descriptor);assert.deepEqual(r.data.emptyReplacementV9,lineage);return r;}
 await unowned();await assertCurrent();await physical(intentVault.path);assert.deepEqual(await intentVault.read(password),intent,'EMPTY_REPLACEMENT_UNISSUED_INTENT_ADVANCED');
 const bytes=await readFile(intentVault.path),retained=await child(journalPath),archive=join(dirname(journalPath),'superseded',lineage.financial.epochId);
 await directory(archive);await preserve(join(archive,'intent.vault'),bytes);
 const archived=await child(join(archive,'journal.vault'));
 assert.ok(!(retained&&archived),'EMPTY_REPLACEMENT_UNISSUED_DUPLICATE_CHILD');
 await unowned();await assertCurrent();assert.deepEqual(await child(journalPath),retained,'EMPTY_REPLACEMENT_UNISSUED_CHILD_ADVANCED');assert.deepEqual(await intentVault.read(password),intent,'EMPTY_REPLACEMENT_UNISSUED_INTENT_ADVANCED');
 if(retained){await absent(join(archive,'journal.vault'));await rename(journalPath,join(archive,'journal.vault'));await syncDirectory(archive);await syncDirectory(dirname(journalPath));}
 // If interrupted here, the old intent still authenticates the archived child.
 // Retrying resumes this same retirement; after update only the new birth fits.
 await unowned();await assertCurrent();
 return intentVault.update(password,intent.revision,data=>{assert.deepEqual(data,old,'EMPTY_REPLACEMENT_UNISSUED_INTENT_ADVANCED');return nextIntent;});
}
