/** A single storage-only append under an Original supervisor token. This
 * proves no child account: the provider remains unbound until its actual
 * Authority replacement reader reconstructs and binds that same lineage. */
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {canonicalPagedProviderDataV3} from './paged-native-provider-state-v3.mjs';
import {normalizePagedEmptySourceReplacementDataV9} from '../operations/recovery/paged-empty-source-replacement-data-v9.mjs';
export function assertPagedEmptyProviderAdvanceDataV9(saved,current){
 assert.equal(saved.emptyReplacementRecoveryV9,true,'PAGED_EMPTY_PROVIDER_ORIGINAL_RECOVERY_REQUIRED');assert.ok(Number.isSafeInteger(current.revision)&&current.revision===saved.checkpoint.revision+1,'PAGED_EMPTY_PROVIDER_SINGLE_APPEND');
 const data=current.data,rows=data.sourceContexts;assert.ok(Array.isArray(rows)&&rows.length>=2&&rows.length<=32,'PAGED_EMPTY_PROVIDER_CONTEXT_HISTORY');assert.ok(data.preparations.length===0&&data.deliveries.length===0&&(data.defiDeliveries??[]).length===0&&(data.executorPayoutsV5??[]).length===0&&!data.uniswapDelivery&&!data.sourceAnchors,'PAGED_EMPTY_PROVIDER_HAS_WORK');normalizePagedEmptySourceReplacementDataV9(rows.at(-1).emptyReplacementV9);
 assert.deepEqual(rows[0].binding,data.binding,'PAGED_EMPTY_PROVIDER_SAME_BIRTH');const prior=structuredClone(data);if(rows.length===2)delete prior.sourceContexts;else prior.sourceContexts=prior.sourceContexts.slice(0,-1);
 assert.equal(createHash('sha256').update(canonicalPagedProviderDataV3(prior)).digest('hex'),saved.checkpoint.dataSHA256,'PAGED_EMPTY_PROVIDER_EXACT_PREDECESSOR');return current;
}

/** A stopped supervisor may retain its original checkpoint after the empty
 * provider append succeeded but child publication failed. Authenticate that
 * single append against the SAME retained predecessor and its validated OWNER.
 * Keep the old checkpoint: only the normal Authority reopen can bind the child. */
export function assertPagedEmptyProviderDeadStorageDataV14(saved,current,entry,ownerCheckpoint){
 assertPagedEmptyProviderAdvanceDataV9({...saved,emptyReplacementRecoveryV9:true},current);
 const lineage=current.data.sourceContexts.at(-1).emptyReplacementV9,p=lineage.predecessor,a=entry.authority;
 assert.equal(p.journalPath,entry.journalPath,'PAGED_EMPTY_PROVIDER_STORAGE_PREDECESSOR');
 assert.equal(p.identity,a.identity,'PAGED_EMPTY_PROVIDER_STORAGE_PREDECESSOR');
 assert.deepEqual(p.descriptor,a.descriptor,'PAGED_EMPTY_PROVIDER_STORAGE_PREDECESSOR');
 assert.equal(p.journalRevision,a.journalRevision,'PAGED_EMPTY_PROVIDER_STORAGE_PREDECESSOR');
 assert.equal(p.journalDataSHA256,a.journalDataSHA256,'PAGED_EMPTY_PROVIDER_STORAGE_PREDECESSOR');
 assert.deepEqual(p.ownerCheckpoint,ownerCheckpoint,'PAGED_EMPTY_PROVIDER_STORAGE_OWNER');
 return current;
}
