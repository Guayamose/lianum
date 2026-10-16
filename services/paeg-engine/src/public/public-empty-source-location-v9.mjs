/** Fixed-path DATA validation. Actual supervisor AEAD and Original Authority
 * reopening remain mandatory; this parser grants no financial permission. */
import assert from 'node:assert/strict';
import {normalizeDevicePagedDescriptorV3} from '@lianum/mobile-protocol/device/paged-owner-v3';
import {normalizePagedEmptySourceReplacementDataV9,pagedEmptySourceReplacementPathV9} from '../../../../packages/backend/src/operations/recovery/paged-empty-source-replacement-data-v9.mjs';
export function assertPublicEmptySourceLocationDataV9(raw,rootJournalPath,devicePublicKey){
 const descriptor=normalizeDevicePagedDescriptorV3(raw.descriptor??raw.authority?.descriptor);assert.equal(descriptor.devicePublicKey,devicePublicKey,'PAEG_EMPTY_REPLACEMENT_SAME_PRINCIPAL');
 if(!Object.hasOwn(raw,'emptyReplacementV9')){assert.equal(raw.journalPath,rootJournalPath,'PAEG_EMPTY_REPLACEMENT_FIXED_BIRTH');return raw;}
 const lineage=normalizePagedEmptySourceReplacementDataV9(raw.emptyReplacementV9);assert.equal(lineage.rootJournalPath,rootJournalPath,'PAEG_EMPTY_REPLACEMENT_FIXED_ROOT');assert.equal(raw.journalPath,pagedEmptySourceReplacementPathV9(rootJournalPath,lineage.generation),'PAEG_EMPTY_REPLACEMENT_FIXED_PATH');const predecessor=lineage.predecessor.descriptor;for(const key of Object.keys(descriptor).filter(key=>!['pairingId','deadlineMs','chainDeadlineSeconds'].includes(key)))assert.equal(descriptor[key],predecessor[key],'PAEG_EMPTY_REPLACEMENT_SAME_NAMESPACE');assert.notEqual(descriptor.pairingId,predecessor.pairingId);assert.ok(descriptor.deadlineMs>predecessor.deadlineMs&&descriptor.deadlineMs<=lineage.financial.expiresAt-30*60000,'PAEG_EMPTY_REPLACEMENT_SIGNED_WINDOW');return raw;
}
