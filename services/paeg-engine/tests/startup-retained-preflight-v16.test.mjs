/** HOST private-state DATA and Vault seam. Verifies early rejection and scope;
 * this does not attest an Original owner, key, signature or financial state. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const base=await mkdtemp(join(tmpdir(),'startup-preflight-host-')),native=join(base,'native'),authority=join(base,'authority'),records=new Map();let reads=0;
await mkdir(join(native,'source-operations'),{recursive:true});await mkdir(join(authority,'renewals'),{recursive:true});
await writeFile(join(native,'source-operations/native-wallet.json'),'HOST_SOURCE_UNCHANGED');
mock.module('@lianum/engine/crypto/vault',{exports:{Vault:class{constructor(path){this.path=path;}async read(){reads++;if(records.has(this.path))return structuredClone(records.get(this.path));throw Object.assign(Error('HOST_MISSING'),{code:'ENOENT'});}}}});
const {assertPublicRetainedStartupV16:check}=await import('../../../packages/backend/src/operations/recovery/paged-public-startup-preflight-v16.mjs');
test.after(()=>rm(base,{recursive:true,force:true}));
async function setup(quota='2',generation=0,expired=true){
 reads=0;records.clear();await rm(join(authority,'renewals'),{recursive:true,force:true});await mkdir(join(authority,'renewals'));
 const expiresAt=Date.now()+3600000,epochId='a'.repeat(64),intentId='b'.repeat(64);
 const financial={profile:'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5',epoch:{epochId,nonce:intentId},effectivePolicy:{expiresAt},limits:{maximumSourcesPerWallet:quota}},intent={intentId,expiresAt,maximumSourcesPerWallet:quota};
 await writeFile(join(base,'financial-epoch-state-v5.json'),JSON.stringify(financial),{mode:0o600});await writeFile(join(base,'empty-source-renewal-intent-v9.json'),JSON.stringify(intent),{mode:0o600});
 const source={journalPath:generation?join(authority,'renewals',String(generation),'journal.vault'):join(authority,'journal.vault'),authority:{descriptor:{deadlineMs:expired?Date.now()-1:expiresAt-1800000}},...(generation?{emptyReplacementV9:{generation,rootJournalPath:join(authority,'journal.vault')}}:{})};
 return{configuration:{nativeDirectory:native},mode:{state:{sourceLocations:[source]},input:{mixed:{journal:{password:'HOST_NOT_A_PASSWORD'}}}},financial,intent};
}
test('an expired original rejects insufficient quota before opening an owner or requesting the network',async()=>{
 const f=await setup('1');await assert.rejects(check(base,native,f.mode,null),/QUOTA_TOO_SMALL/);assert.equal(reads,0);
});
test('an unpublished first renewal detects the required third source before loading any Original capability',async()=>{
 const f=await setup('2');const directory=join(authority,'renewals','1');await mkdir(directory);const path=join(directory,'intent.vault');await writeFile(path,'HOST_CIPHERTEXT');
 records.set(path,{data:{lineage:{generation:1,financial:{epochId:'c'.repeat(64)}},descriptor:{deadlineMs:Date.now()-1}}});
 await assert.rejects(check(base,native,f.mode,null),/QUOTA_TOO_SMALL/);assert.equal(reads,1);
});
test('published generations do not reopen or retire historic renewal owners',async()=>{
 const f=await setup('3',2,false);await mkdir(join(authority,'renewals','1'));await mkdir(join(authority,'renewals','2'));
 const before=await readFile(join(native,'source-operations/native-wallet.json'));
 const r=await check(base,native,f.mode,null);assert.equal(r.pendingRenewalsChecked,0);assert.equal(r.rpcCalls,0);assert.equal(r.financialTransactions,0);assert.equal(reads,0);assert.deepEqual(await readFile(join(native,'source-operations/native-wallet.json')),before);
});
test('the next expiry after generation two needs quota four, rather than silently assuming two',async()=>{
 const f=await setup('3',2,true);await assert.rejects(check(base,native,f.mode,null),/QUOTA_TOO_SMALL/);assert.equal(reads,0);
});
test('mismatched signed-intent metadata and unsafe directories stop before long reconciliation',async()=>{
 let f=await setup('3');await writeFile(join(base,'empty-source-renewal-intent-v9.json'),JSON.stringify({...f.intent,maximumSourcesPerWallet:'2'}));await assert.rejects(check(base,native,f.mode,null),/RENEWAL_QUOTA/);
 f=await setup('3');await symlink(base,join(authority,'renewals','1'));await assert.rejects(check(base,native,f.mode,null),/RENEWAL_DIRECTORY/);
});
test('a nonmixed installation has no renewal preflight or filesystem side effects',async()=>{
 const result=await check('/HOST_NO_FILES',null,null,null);assert.equal(result.sourcesChecked,0);assert.equal(result.pendingRenewalsChecked,0);assert.equal(result.rpcCalls,0);
});

test('a separately authenticated quota-only descendant preserves the completed renewal; spending or other limits reject',async()=>{
 const {assertRetainedRenewalQuotaDescendantV35:validate}=await import('../../../packages/backend/src/operations/recovery/paged-public-startup-preflight-v16.mjs');
 const intent={intentId:'a'.repeat(64),expiresAt:Date.now()+7200000,maximumSourcesPerWallet:'4'},policy={expiresAt:intent.expiresAt,maximumTotalFeeAtomic:'500',maximumTotalValueAtomic:'200'},limits={maximumSourcesPerWallet:'4',maximumTotalSuccessorPools:'1',maximumTotalMixedSources:'2'},original={nonce:intent.intentId,epochId:'b'.repeat(64),policy,limits},next={...original,nonce:'c'.repeat(64),epochId:'d'.repeat(64),limits:{...limits,maximumSourcesPerWallet:'5'}},history={effectivePolicy:policy,limits:next.limits,history:[{epoch:original},{epoch:next}]},financial={effectivePolicy:policy,limits:next.limits,epoch:next};
 assert.equal(validate(financial,intent,history),true);
 for(const mutate of [h=>h.history[1].epoch.policy={...policy,maximumTotalFeeAtomic:'600'},h=>h.history[1].epoch.limits.maximumTotalSuccessorPools='2',h=>h.history[0].epoch.nonce='e'.repeat(64),h=>h.history[0].epoch.limits.maximumSourcesPerWallet='3',h=>h.history[1].epoch.limits.maximumSourcesPerWallet='3']){const changed=structuredClone(history);mutate(changed);assert.throws(()=>validate(financial,intent,changed));}
 assert.equal(intent.maximumSourcesPerWallet,'4','the old renewal is never rewritten');
});
