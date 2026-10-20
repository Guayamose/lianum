/** Retained DATA checks only. These helpers cannot create an account, reset a
 * provider, grant financial permission or authenticate a caller-owned handle. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {canonicalPagedProviderDataV3} from './paged-native-provider-state-v3.mjs';
import {normalizeDevicePagedDescriptorV3} from '@lianum/mobile-protocol/device/paged-owner-v3';
import {normalizePagedEmptySourceReplacementDataV9,pagedEmptySourceReplacementPathV9} from '../operations/recovery/paged-empty-source-replacement-data-v9.mjs';
import {normalizePagedMixedSourceSuccessorDataV35,pagedMixedSourceSuccessorPathV35} from '../operations/recovery/paged-mixed-source-successor-data-v35.mjs';
const digest=value=>createHash('sha256').update(canonicalPagedProviderDataV3(value)).digest('hex');
function exact(value,keys){assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype,'MIXED_SUCCESSOR_PROVIDER_OBJECT');assert.deepEqual(Reflect.ownKeys(value).sort(),keys.toSorted(),'MIXED_SUCCESSOR_PROVIDER_FIELDS');for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'),'MIXED_SUCCESSOR_PROVIDER_ACCESSOR');}
function hex(value){assert.match(value,/^[0-9a-f]{64}$/);assert.notEqual(value,'0'.repeat(64));}
function rowPath(row,root){if(row.mixedSuccessorV35)return pagedMixedSourceSuccessorPathV35(root,row.mixedSuccessorV35.birthOrdinal);if(row.emptyReplacementV9)return pagedEmptySourceReplacementPathV9(root,row.emptyReplacementV9.generation);return root;}
export function assertPagedMixedProviderContextsV35(data){
 const rows=data.sourceContexts;assert.ok(Array.isArray(rows)&&rows.length>=2&&rows.length<=32,'MIXED_SUCCESSOR_PROVIDER_HISTORY_BOUND');const seen=new Set(),pairings=new Set();let root=null;
 for(const [index,row]of rows.entries()){
  const successor=Object.hasOwn(row,'mixedSuccessorV35'),empty=Object.hasOwn(row,'emptyReplacementV9');assert.equal(Number(successor)+Number(empty),index?1:0,'MIXED_SUCCESSOR_PROVIDER_ONE_LINEAGE');
  exact(row,['id','binding','sourceLineage',...(successor?['mixedSuccessorV35']:[]),...(empty?['emptyReplacementV9']:[])]);exact(row.binding,['descriptor','manifestSHA256','consumerSHA256']);hex(row.binding.manifestSHA256);hex(row.binding.consumerSHA256);hex(row.id);const {id,...fingerprint}=row;assert.equal(id,digest(fingerprint),'MIXED_SUCCESSOR_PROVIDER_FINGERPRINT');assert.ok(!seen.has(id),'MIXED_SUCCESSOR_PROVIDER_DUPLICATE');seen.add(id);const descriptor=normalizeDevicePagedDescriptorV3(row.binding.descriptor);assert.ok(!pairings.has(descriptor.pairingId),'MIXED_SUCCESSOR_PROVIDER_PAIRING_REUSE');pairings.add(descriptor.pairingId);
  if(index===0){assert.deepEqual(row.binding,data.binding,'MIXED_SUCCESSOR_PROVIDER_BIRTH');assert.equal(row.sourceLineage,null);continue;}
  const lineage=successor?normalizePagedMixedSourceSuccessorDataV35(row.mixedSuccessorV35):normalizePagedEmptySourceReplacementDataV9(row.emptyReplacementV9),prior=rows[index-1],old=prior.binding.descriptor;
  root??=lineage.rootJournalPath;assert.equal(lineage.rootJournalPath,root,'MIXED_SUCCESSOR_PROVIDER_ROOT_CHANGED');assert.equal(successor?lineage.birthOrdinal:lineage.generation+1,index+1,'MIXED_SUCCESSOR_PROVIDER_BIRTH_ORDINAL');assert.deepEqual(lineage.predecessor.descriptor,old,'MIXED_SUCCESSOR_PROVIDER_PREDECESSOR');assert.equal(lineage.predecessor.journalPath,rowPath(prior,root),'MIXED_SUCCESSOR_PROVIDER_PREDECESSOR_PATH');
  for(const key of Object.keys(old).filter(key=>!['pairingId','deadlineMs','chainDeadlineSeconds'].includes(key)))assert.deepEqual(descriptor[key],old[key],'MIXED_SUCCESSOR_PROVIDER_SAME_NAMESPACE');for(const key of ['manifestSHA256','consumerSHA256'])assert.equal(row.binding[key],prior.binding[key]);
  if(successor){assert.deepEqual(row.sourceLineage,lineage.lineage,'MIXED_SUCCESSOR_PROVIDER_CUSTODY_LINEAGE');if(prior.sourceLineage){assert.equal(row.sourceLineage.walletRootId,prior.sourceLineage.walletRootId,'MIXED_SUCCESSOR_PROVIDER_WALLET_ROOT');assert.equal(row.sourceLineage.sourceRevision,prior.sourceLineage.sourceRevision+1,'MIXED_SUCCESSOR_PROVIDER_SOURCE_REVISION');assert.equal(row.sourceLineage.principalSHA256,prior.sourceLineage.principalSHA256,'MIXED_SUCCESSOR_PROVIDER_PRINCIPAL');}assert.ok(descriptor.deadlineMs<=old.deadlineMs,'MIXED_SUCCESSOR_PROVIDER_DEADLINE_INCREASE');}
  else{assert.equal(row.sourceLineage,null);assert.ok(!prior.mixedSuccessorV35,'MIXED_SUCCESSOR_PROVIDER_EMPTY_AFTER_SUCCESSOR');assert.ok(descriptor.deadlineMs>old.deadlineMs,'MIXED_SUCCESSOR_PROVIDER_EMPTY_DEADLINE');}
  assert.ok(descriptor.deadlineMs<=lineage.financial.expiresAt-30*60*1000,'MIXED_SUCCESSOR_PROVIDER_FINANCIAL_WINDOW');
 }
 return data;
}
/** Old quotes remain retained. Any actual send or target financial intent must
 * be final before a new source can use the same provider/target namespace. */
export function assertPagedMixedProviderSettledV35(data){
 assert.ok(Array.isArray(data.preparations)&&Array.isArray(data.deliveries));assert.ok(data.deliveries.every(row=>row.stage==='MINED'),'MIXED_SUCCESSOR_PROVIDER_PENDING_DELIVERY');
 const birth=digest({binding:data.binding,sourceLineage:null}),context=row=>row.sourceContextSHA256??birth;
 if(data.uniswapDelivery){const target=data.uniswapDelivery;assert.equal(target.stage,'PREPARED','MIXED_SUCCESSOR_PROVIDER_TARGET_INTENT');const actions=data.preparations.flatMap(page=>page.rows).filter(row=>row.variant==='UNISWAP_PUBLIC_V4'&&row.id===target.id&&row.native?.delivery?.intent?.depositJobId===target.intent.depositJobId);assert.equal(actions.length,1,'MIXED_SUCCESSOR_PROVIDER_TARGET_INTENT');assert.ok(data.deliveries.some(row=>row.id===target.id&&context(row)===context(actions[0])&&row.stage==='MINED'),'MIXED_SUCCESSOR_PROVIDER_TARGET_INTENT');}
 for(const target of data.defiDeliveries??[]){let sourceContext=context(target);if(target.sourceContextSHA256===undefined){const matches=data.preparations.flatMap(page=>page.rows).filter(q=>isDeepStrictEqual(q.native?.defi,target));assert.ok(matches.length<=1,'MIXED_SUCCESSOR_PROVIDER_LEGACY_CONTEXT_AMBIGUOUS');if(matches.length)sourceContext=context(matches[0]);}assert.ok(data.deliveries.some(row=>row.id===target.id&&context(row)===sourceContext&&row.stage==='MINED'),'MIXED_SUCCESSOR_PROVIDER_TARGET_INTENT');}
 return data;
}
/** Recover exactly one durable append after interrupted child publication.
 * All keys, quotes, attempts and counters must reconstruct the old checkpoint. */
export function assertPagedMixedProviderSuccessorAdvanceV35(saved,current){
 assert.equal(saved.mixedSuccessorRecoveryV35,true,'MIXED_SUCCESSOR_PROVIDER_RECOVERY_TOKEN');assert.ok(Number.isSafeInteger(current.revision)&&current.revision===saved.checkpoint.revision+1,'MIXED_SUCCESSOR_PROVIDER_SINGLE_APPEND');assertPagedMixedProviderContextsV35(current.data);assertPagedMixedProviderSettledV35(current.data);assert.ok(current.data.sourceContexts.at(-1).mixedSuccessorV35,'MIXED_SUCCESSOR_PROVIDER_SUCCESSOR_REQUIRED');const prior=structuredClone(current.data);if(prior.sourceContexts.length===2)delete prior.sourceContexts;else prior.sourceContexts.pop();assert.equal(digest(prior),saved.checkpoint.dataSHA256,'MIXED_SUCCESSOR_PROVIDER_EXACT_PREDECESSOR');return current;
}
export function assertPagedMixedProviderSuccessorDeadStorageV35(saved,current,entry,ownerCheckpoint){
 assertPagedMixedProviderSuccessorAdvanceV35({...saved,mixedSuccessorRecoveryV35:true},current);const p=current.data.sourceContexts.at(-1).mixedSuccessorV35.predecessor,a=entry.authority;assert.equal(p.journalPath,entry.journalPath,'MIXED_SUCCESSOR_PROVIDER_STORAGE_PREDECESSOR');for(const key of ['identity','descriptor','journalRevision','journalDataSHA256'])assert.deepEqual(p[key],a[key],'MIXED_SUCCESSOR_PROVIDER_STORAGE_PREDECESSOR');assert.deepEqual(p.ownerCheckpoint,ownerCheckpoint,'MIXED_SUCCESSOR_PROVIDER_STORAGE_OWNER');return current;
}
