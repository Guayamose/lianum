/** Authenticated replacement lineage DATA; parsing never issues an account,
 * Source permission or signing capability. Old files remain in their paths. */
import assert from 'node:assert/strict';
import {resolve,dirname,join} from 'node:path';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
export const PAGED_EMPTY_SOURCE_REPLACEMENT_V9='ORIGINAL_PAGED_EMPTY_SOURCE_REPLACEMENT_V9';
const exact=P.pagedOwnerExactV3;
const path=v=>{assert.ok(typeof v==='string'&&v.length<4096&&resolve(v)===v&&!v.includes('\0'),'EMPTY_REPLACEMENT_PATH');return v;};
export function pagedEmptySourceReplacementPathV9(rootJournalPath,generation){path(rootJournalPath);assert.ok(Number.isSafeInteger(generation)&&generation>0&&!Object.is(generation,-0),'EMPTY_REPLACEMENT_GENERATION');return join(dirname(rootJournalPath),'renewals',String(generation),'journal.vault');}
export function normalizePagedEmptySourceReplacementDataV9(raw){
 const l=exact(raw,['profile','generation','rootJournalPath','predecessor','financial','emptyLedger']);assert.equal(l.profile,PAGED_EMPTY_SOURCE_REPLACEMENT_V9);pagedEmptySourceReplacementPathV9(l.rootJournalPath,l.generation);
 const p=exact(l.predecessor,['journalPath','identity','descriptor','journalRevision','journalDataSHA256','ownerCheckpoint']);path(p.journalPath);for(const key of ['identity','journalDataSHA256'])P.pagedOwnerHexV3(p[key]);p.descriptor=P.normalizeDevicePagedDescriptorV3(p.descriptor);assert.ok(Number.isSafeInteger(p.journalRevision)&&p.journalRevision>=0&&!Object.is(p.journalRevision,-0));p.ownerCheckpoint=exact(p.ownerCheckpoint,['profile','descriptorSHA256','revision','dataSHA256','public']);for(const k of ['descriptorSHA256','dataSHA256'])P.pagedOwnerHexV3(p.ownerCheckpoint[k]);assert.ok(Number.isSafeInteger(p.ownerCheckpoint.revision)&&p.ownerCheckpoint.revision>=0);l.predecessor=p;
 assert.equal(p.journalPath,l.generation===1?l.rootJournalPath:pagedEmptySourceReplacementPathV9(l.rootJournalPath,l.generation-1),'EMPTY_REPLACEMENT_PREDECESSOR_PATH');
 l.emptyLedger=exact(l.emptyLedger,['blockHash','blockNumber','leafCount','backedAmount','liveReservations','balanceAtomic']);assert.match(l.emptyLedger.blockHash,/^0x[0-9a-f]{64}$/);P.pagedOwnerUintV3(l.emptyLedger.blockNumber,true);for(const k of ['leafCount','backedAmount','liveReservations','balanceAtomic'])assert.equal(l.emptyLedger[k],'0','EMPTY_REPLACEMENT_LEDGER');
 l.financial=exact(l.financial,['epochId','policySHA256','expiresAt','maximumSourcesPerWallet']);P.pagedOwnerHexV3(l.financial.epochId);P.pagedOwnerHexV3(l.financial.policySHA256);assert.ok(Number.isSafeInteger(l.financial.expiresAt)&&l.financial.expiresAt>0);P.pagedOwnerUintV3(l.financial.maximumSourcesPerWallet);assert.ok(BigInt(l.financial.maximumSourcesPerWallet)<=16n&&BigInt(l.generation)+1n<=BigInt(l.financial.maximumSourcesPerWallet),'EMPTY_REPLACEMENT_SIGNED_WALLET_QUOTA');return Object.freeze(l);
}
export function assertPagedEmptySourceRecordDataV9(record){
 exact(record,['revision','data']);const d=exact(record.data,['schema','identity','descriptor','jobs','pending','graph',...(Object.hasOwn(record.data,'emptyReplacementV9')?['emptyReplacementV9']:[])]);assert.equal(d.schema,P.DEVICE_PAGED_OWNER_V3);P.pagedOwnerHexV3(d.identity);P.normalizeDevicePagedDescriptorV3(d.descriptor);assert.ok(Array.isArray(d.jobs)&&d.jobs.length===0&&Reflect.ownKeys(d.jobs).length===1,'EMPTY_REPLACEMENT_JOBS');assert.equal(d.pending,null,'EMPTY_REPLACEMENT_PENDING');assert.equal(d.graph,null,'EMPTY_REPLACEMENT_GRAPH');assert.ok(Number.isSafeInteger(record.revision)&&record.revision>=0&&!Object.is(record.revision,-0));if(d.emptyReplacementV9)normalizePagedEmptySourceReplacementDataV9(d.emptyReplacementV9);return record;
}
