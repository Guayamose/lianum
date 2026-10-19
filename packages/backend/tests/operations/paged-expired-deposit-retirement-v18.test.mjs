/** Actual private Source-journal factory and encrypted Vault. Deployment ports
 * are HOST fixtures; a foreign factory never becomes the canonical consumer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical} from '@lianum/engine/crypto/privacy';
import {encodeWalletPoolInputs} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {buildPagedSepoliaSourceJournalDataV4} from '../../src/operations/local/funded-graph-paged-source-journal-data-v4.mjs';
const h=n=>n.toString(16).padStart(64,'0'),a=n=>'0x'+n.toString(16).padStart(40,'0'),sha=v=>createHash('sha256').update(v).digest('hex');
test('retirement request belongs to the private journal, exact checkpoint, original runtime and one UNKNOWN deposit',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'paged-retirement-owner-v18-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const system={receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4',securityGeneration:'EXACT_PAYOUT_SET_V4',minimumDepositAtomic:'1',pool:a(1),state:a(2),native:a(3),scope:h(1),policy:h(2),assetIdentity:h(4),domain:h(5),hubDomain:h(6),registryCommitment:h(7),manifestSHA256:h(8),consumerSHA256:h(9),deployments:[{name:'PagedSparsePoseidon2V3',address:a(4),codeHash:'0x'+h(9)}]};
 const runtime={metadata:{chainId:'11155111',evmGenesis:'0x'+h(1)},accounts:[a(9)],async block(){return{number:'0x1',hash:'0x'+h(10),timestamp:'0x4b0'};},async assertCanonical(){}};
 const d={...Object.fromEntries(['pool','state','native'].map(k=>[k,{codeHash:'0x'+h(9)}])),async call(){return'0x'+'0'.repeat(64);}};
 const ports=Object.freeze({assertOriginalSystem(r,s){assert.equal(r,runtime);assert.equal(s,system);},readOriginalSystem(){return d;},async assertOriginalReceiverReady(){}});
 const owner=buildPagedSepoliaSourceJournalDataV4(ports),foreign=buildPagedSepoliaSourceJournalDataV4(ports),password='host-only-test-password-32-characters';
 const bundle=await owner.create(runtime,system,{origin:'https://host.invalid',devicePublicKey:'04'+'11'.repeat(64),journal:{path:join(dir,'journal.vault'),password}});
 const inputs=encodeWalletPoolInputs('deposit_balance',{scope:'0x'+system.scope,policy:'0x'+system.policy,epoch:'1',amount:'10',output:'0x'+h(11)}),job={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',descriptor:bundle.descriptor,jobId:'host-deposit',mode:'deposit',stage:'UNKNOWN',publicInputs:inputs,proof:'01',proofSHA256:sha(Buffer.from('01','hex')),transactionHash:null};
 const initial=await bundle.vault.read(password);await bundle.vault.update(password,initial.revision,data=>({...data,jobs:[job],pending:{jobId:job.jobId,from:runtime.accounts[0],to:system.pool,value:'10',calldataSHA256:h(12)}}));
 const current=()=>bundle.vault.read(password),checkpoint=r=>({revision:r.revision,dataSHA256:sha(canonical(r.data))});
 const before=await current();await assert.rejects(owner.armExpiredDepositRetirementV18({},checkpoint(before),job.jobId),/ORIGINAL_JOURNAL/);
 await assert.rejects(owner.armExpiredDepositRetirementV18(bundle.journalToken,{...checkpoint(before),revision:0},job.jobId),/HIGHWATER/);
 const token=await owner.armExpiredDepositRetirementV18(bundle.journalToken,checkpoint(before),job.jobId);
 await assert.rejects(foreign.consumeExpiredDepositRetirementV18(runtime,token),/ORIGINAL_RETIREMENT/);
 await assert.rejects(owner.consumeExpiredDepositRetirementV18({},token),/RUNTIME/);
 await assert.rejects(owner.consumeExpiredDepositRetirementV18(runtime,{...token}),/ORIGINAL_RETIREMENT/);
 const grant=await owner.consumeExpiredDepositRetirementV18(runtime,token);assert.equal(grant.identity,bundle.identity);assert.equal(grant.to,system.pool);assert.equal(grant.value,'10');assert.deepEqual(grant.publicInputs,inputs);assert.deepEqual(await current(),before);
 await assert.rejects(owner.consumeExpiredDepositRetirementV18(runtime,token),/ORIGINAL_RETIREMENT/);
 const stale=await owner.armExpiredDepositRetirementV18(bundle.journalToken,checkpoint(before),job.jobId);await bundle.vault.update(password,before.revision,data=>data);
 await assert.rejects(owner.consumeExpiredDepositRetirementV18(runtime,stale),/HIGHWATER/);
 const changed=await current();await bundle.vault.update(password,changed.revision,data=>({...data,jobs:[{...job,stage:'PROVED'}]}));const proved=await current();
 await assert.rejects(owner.armExpiredDepositRetirementV18(bundle.journalToken,checkpoint(proved),job.jobId),/PENDING/);
 owner.close(bundle.journalToken);await assert.rejects(owner.armExpiredDepositRetirementV18(bundle.journalToken,checkpoint(proved),job.jobId),/ORIGINAL_JOURNAL/);
});
