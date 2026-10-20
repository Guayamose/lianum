/** Explicit succession metadata at capture boundaries. Pure DATA validation;
 * Original authorities separately reconstruct and authenticate predecessor files. */
import assert from 'node:assert/strict';
import {normalizePagedMixedSourceSuccessorDataV35,pagedMixedSourceSuccessorPathV35} from './paged-mixed-source-successor-data-v35.mjs';
export function assertPagedMixedSourceRetentionV35(row){
 if(!Object.hasOwn(row,'mixedSuccessorV35'))return row;
 assert.ok(!Object.hasOwn(row,'emptyReplacementV9'),'MIXED_SUCCESSOR_RETENTION_ONE_LINEAGE');const lineage=normalizePagedMixedSourceSuccessorDataV35(row.mixedSuccessorV35),descriptor=row.authority.descriptor,previous=lineage.predecessor.descriptor;
 assert.equal(row.journalPath,pagedMixedSourceSuccessorPathV35(lineage.rootJournalPath,lineage.birthOrdinal),'MIXED_SUCCESSOR_RETENTION_PATH');assert.notEqual(descriptor.pairingId,previous.pairingId,'MIXED_SUCCESSOR_RETENTION_NEW_PAIRING');
 for(const key of Object.keys(previous).filter(key=>!['pairingId','deadlineMs','chainDeadlineSeconds'].includes(key)))assert.deepEqual(descriptor[key],previous[key],'MIXED_SUCCESSOR_RETENTION_NAMESPACE');assert.ok(descriptor.deadlineMs<=previous.deadlineMs&&descriptor.deadlineMs<=lineage.financial.expiresAt-30*60*1000,'MIXED_SUCCESSOR_RETENTION_DEADLINE');return row;
}
