/** HOST DATA and real encrypted retention. No Source, signature or financial capability is manufactured. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalPagedProviderDataV3} from '../../src/providers/paged-native-provider-state-v3.mjs';
import {assertPagedMixedProviderContextsV35 as contexts,assertPagedMixedProviderSettledV35 as settled,assertPagedMixedProviderSuccessorAdvanceV35 as advance,assertPagedMixedProviderSuccessorDeadStorageV35 as dead} from '../../src/providers/paged-mixed-provider-successor-data-v35.mjs';
import {assertPagedMixedSourceRetentionV35 as retention} from '../../src/operations/recovery/paged-mixed-source-retention-data-v35.mjs';
import {snapshot as defiSnapshot} from '../../src/operations/recovery/sepolia-defi-retention-data-v8.mjs';
import * as Sup from '../../src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs';
import {fixture,descriptor as rootDescriptor} from './fixtures/paged-mixed-host-v7.mjs';
const h=value=>createHash('sha256').update(String(value)).digest('hex'),digest=value=>createHash('sha256').update(canonicalPagedProviderDataV3(value)).digest('hex');
function lineageFixture(emptyCount=3){
 const saved=fixture(),birth=saved.authority.entries[0].authority.descriptor,root='/HOST/mixed/journal.vault',rows=[],binding=descriptor=>({descriptor,manifestSHA256:descriptor.manifestSHA256,consumerSHA256:descriptor.consumerSHA256}),push=data=>rows.push({id:digest(data),...data});
 push({binding:binding(birth),sourceLineage:null});
 const predecessor=(descriptor,path,index)=>({descriptor,journalPath:path,identity:h('identity'+index),journalRevision:7,journalDataSHA256:h('journal'+index),ownerCheckpoint:{profile:'DEVICE_PAGED_OWNER_DURABLE_CHECKPOINT_V3',descriptorSHA256:h('descriptor'+index),revision:3,dataSHA256:h('owner'+index),public:{}}});
 for(let generation=1;generation<=emptyCount;generation++){
  const prior=rows.at(-1).binding.descriptor,next={...prior,pairingId:'empty-renewal-'+generation,deadlineMs:prior.deadlineMs+1000},emptyReplacementV9={profile:'ORIGINAL_PAGED_EMPTY_SOURCE_REPLACEMENT_V9',generation,rootJournalPath:root,predecessor:predecessor(prior,generation===1?root:'/HOST/mixed/renewals/'+(generation-1)+'/journal.vault',generation),financial:{epochId:h('epoch'),policySHA256:h('policy'),expiresAt:next.deadlineMs+3600000,maximumSourcesPerWallet:'4'},emptyLedger:{blockHash:'0x'+h('block'),blockNumber:'1',leafCount:'0',backedAmount:'0',liveReservations:'0',balanceAtomic:'0'}};
  push({binding:binding(next),sourceLineage:null,emptyReplacementV9});
 }
 const prior=rows.at(-1).binding.descriptor,birthOrdinal=rows.length+1,sourceLineage={profile:'DEVICE_PAGED_ORIGINAL_SOURCE_REFILL_V4',walletRootId:h('wallet'),sourceRevision:2,predecessorPairingId:prior.pairingId,predecessorSourceId:h('source'),principalSHA256:h('principal')},mixedSuccessorV35={profile:'ORIGINAL_PAGED_MIXED_SOURCE_SUCCESSOR_V35',birthOrdinal,rootJournalPath:root,predecessor:predecessor(prior,emptyCount?'/HOST/mixed/renewals/'+emptyCount+'/journal.vault':root,birthOrdinal),financial:{epochId:h('epoch'),policySHA256:h('policy'),expiresAt:prior.deadlineMs+3600000,maximumSourcesPerWallet:String(birthOrdinal)},terminal:{kind:'WITHDRAWN_UNRESERVED',blockHash:'0x'+h('terminalblock'),blockNumber:'2',sourceCommitment:h('commitment'),sourceNullifier:h('nullifier'),graphId:'stopped-graph',authorizationRoot:h('authorization'),sourceRevision:'1',sourceId:h('source'),walletRootId:h('wallet'),leafCount:'1',backedAmount:'0',liveReservations:'0',balanceAtomic:'0'},lineage:sourceLineage};
 const descriptor={...prior,pairingId:'successor-'+birthOrdinal},child={binding:binding(descriptor),sourceLineage,mixedSuccessorV35};
 const before={schema:'ORIGINAL_PAGED_PUBLIC_MIXED_PROVIDER_V4',providerIdentity:h('provider'),providerKey:{pkcs8:'HOST-INERT-KEY'},binding:binding(birth),preparations:[{preparationId:'stopped-plan',rows:[{id:'old-native-quote',family:'EVM'}]}],deliveries:[],...(emptyCount?{sourceContexts:structuredClone(rows)}:{})};push(child);
 const after={...structuredClone(before),sourceContexts:rows},entry={authority:{...mixedSuccessorV35.predecessor},journalPath:mixedSuccessorV35.predecessor.journalPath},childEntry={authority:{profile:'DEVICE_PAGED_AUTHORITY_RETAINED_V3',...entry.authority,descriptor},journalPath:'/HOST/mixed/successors-v35/'+birthOrdinal+'/journal.vault',mixedSuccessorV35};
 return{before,after,saved,childEntry,entry,owner:mixedSuccessorV35.predecessor.ownerCheckpoint,lineage:mixedSuccessorV35};
}
test('terminal context retains all EMPTY births and unsigned native preparations; quota is cumulative',()=>{
 const x=lineageFixture();assert.strictEqual(contexts(x.after),x.after);assert.strictEqual(settled(x.after),x.after);assert.strictEqual(retention(x.childEntry),x.childEntry);assert.equal(x.after.sourceContexts.length,5);assert.deepEqual(x.after.preparations,x.before.preparations);
 const quota=structuredClone(x.after);quota.sourceContexts.at(-1).mixedSuccessorV35.financial.maximumSourcesPerWallet='4';const last=quota.sourceContexts.at(-1),{id,...data}=last;last.id=digest(data);assert.throws(()=>contexts(quota),/SIGNED_WALLET_QUOTA/);
 const source7=lineageFixture(2);assert.equal(source7.lineage.birthOrdinal,4);assert.strictEqual(contexts(source7.after),source7.after);
 for(const mutate of [v=>v.sourceContexts.splice(1,1),v=>v.sourceContexts.at(-1).mixedSuccessorV35.birthOrdinal--,v=>v.sourceContexts.at(-1).sourceLineage.sourceRevision++,v=>v.sourceContexts.at(-1).binding.descriptor.pool='0x'+'9'.repeat(40),v=>v.sourceContexts.at(-1).binding.descriptor.pairingId=v.sourceContexts[0].binding.descriptor.pairingId,v=>v.sourceContexts.at(-1).mixedSuccessorV35.predecessor.journalPath='/HOST/other/journal.vault',v=>v.sourceContexts.at(-1).mixedSuccessorV35.terminal.balanceAtomic='1']){const changed=structuredClone(x.after);mutate(changed);for(const row of changed.sourceContexts){const {id,...data}=row;row.id=digest(data);}assert.throws(()=>contexts(changed));}
});
test('interrupted provider append authenticates exact predecessor without resetting attempts, keys, or counters',()=>{
 for(const emptyCount of [0,2,3]){const x=lineageFixture(emptyCount),saved={checkpoint:{revision:30,dataSHA256:digest(x.before)},mixedSuccessorRecoveryV35:true},current={revision:31,data:x.after};assert.strictEqual(advance(saved,current),current);assert.strictEqual(dead(saved,current,x.entry,x.owner),current);assert.throws(()=>advance({...saved,mixedSuccessorRecoveryV35:false},current),/RECOVERY_TOKEN/);
  for(const mutate of [v=>v.revision++,v=>v.data.providerKey.pkcs8='changed',v=>v.data.preparations=[],v=>v.data.deliveries.push({id:'old',stage:'MINED'}),v=>v.data.sourceContexts.at(-1).mixedSuccessorV35.predecessor.journalDataSHA256=h('other')]){const changed=structuredClone(current);mutate(changed);if(changed.data.sourceContexts){for(const row of changed.data.sourceContexts){const {id,...data}=row;row.id=digest(data);}}assert.throws(()=>dead(saved,changed,x.entry,x.owner));}
  assert.throws(()=>dead(saved,current,{...x.entry,journalPath:'/HOST/foreign/journal.vault'},x.owner));assert.throws(()=>dead(saved,current,x.entry,{...x.owner,dataSHA256:h('changed')}));
 }
});
test('pending native attempts and uncompleted target intents block; completed rows stay in their old context',()=>{
 const x=lineageFixture();for(const stage of ['KEY_PENDING','SIGNED','UNKNOWN'])assert.throws(()=>settled({...x.after,deliveries:[{id:'old',stage}]}),/PENDING_DELIVERY/);
 const target={id:'target-action',protocol:'AAVE_STATIC',sourceContextSHA256:x.after.sourceContexts[3].id};assert.throws(()=>settled({...x.after,defiDeliveries:[target]}),/TARGET_INTENT/);assert.throws(()=>settled({...x.after,defiDeliveries:[target],deliveries:[{id:target.id,stage:'MINED',sourceContextSHA256:x.after.sourceContexts[4].id}]}),/TARGET_INTENT/);settled({...x.after,defiDeliveries:[target],deliveries:[{id:target.id,stage:'MINED',sourceContextSHA256:target.sourceContextSHA256}]});
 const uni={id:'swap',stage:'PREPARED',intent:{depositJobId:'swap-deposit'}};assert.throws(()=>settled({...x.after,uniswapDelivery:uni}),/TARGET_INTENT/);
});
test('mixed successor metadata is explicit and survives real encrypted Sup7 capture and component tokens',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mixed-successor-retention-')),input={directory,password:'HOST-V35-retention-password-12345678901234567890'};let sup;
 try{const x=lineageFixture(),snapshot=x.saved;snapshot.authority.entries[0]={...x.childEntry,sourceIndex:0};sup=await Sup.createOriginalPagedPublicUniswapMixedSupervisorV4(input,rootDescriptor);await sup.capture(snapshot);await sup.close();sup=await Sup.openOriginalPagedPublicUniswapMixedSupervisorV4(input);const split=await sup.splitParentAndMixed(await sup.issueComponent('authority'),'authority'),child=Sup.consumeOriginalPagedPublicUniswapMixedComponentV4(split.entries[0].token,'mixedAuthority');assert.deepEqual(child.mixedSuccessorV35,x.lineage);assert.equal(Object.hasOwn(child,'emptyReplacementV9'),false);assert.equal(child.journalPath,x.childEntry.journalPath);assert.throws(()=>Sup.consumeOriginalPagedPublicUniswapMixedComponentV4(split.entries[0].token,'mixedAuthority'),/ORIGINAL_TOKEN/);
 }finally{await sup?.close();await rm(directory,{recursive:true,force:true});}
});
test('retention rejects mixed EMPTY claims, changed namespace, child path, and exhausted quota',()=>{
 const x=lineageFixture();for(const mutate of [r=>r.emptyReplacementV9=x.after.sourceContexts[1].emptyReplacementV9,r=>r.journalPath=x.entry.journalPath,r=>r.authority.descriptor.devicePublicKey='04'+'b'.repeat(128),r=>r.mixedSuccessorV35.financial.maximumSourcesPerWallet='4']){const changed=structuredClone(x.childEntry);mutate(changed);assert.throws(()=>retention(changed));}
 const d=x.childEntry.authority.descriptor,system={pool:d.pool,registry:{rulesRoot:h('rules')}},snapshot={targets:{},authorities:[],mixedSource:{profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_RETENTION_V8',plan:{keysetId:h('keyset'),uniswapTargetPlanSHA256:h('target'),rulesRoot:h('rules')},system,receipts:[]},mixedAuthority:{profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_AUTHORITY_RETENTION_V8',...x.childEntry}};assert.throws(()=>defiSnapshot(snapshot,{}),'a successor cannot bypass the complete DeFi target/principal snapshot');
});
