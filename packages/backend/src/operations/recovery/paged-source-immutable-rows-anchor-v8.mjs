/** Mechanical Source checkpoint DATA only. The actual Source producer owns the
 * capture; this digest can neither grant signing nor replace private proofs. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pagedOwnerExactV3} from '@lianum/mobile-protocol/device/paged-owner-v3';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function normalizeSourceImmutableRowsAnchorDataV8(raw){
 pagedOwnerExactV3(raw,['count','sha256']);assert.ok(Number.isSafeInteger(raw.count)&&raw.count>=0&&raw.count<=512&&!Object.is(raw.count,-0),'PAGED_SOURCE_IMMUTABLE_ANCHOR_COUNT');assert.match(raw.sha256,/^[0-9a-f]{64}$/,'PAGED_SOURCE_IMMUTABLE_ANCHOR_HASH');return Object.freeze({count:raw.count,sha256:raw.sha256});
}
export function sourceImmutableRowsProjectionDataV8(rows){
 assert.ok(Array.isArray(rows)&&rows.length<=512,'PAGED_SOURCE_IMMUTABLE_ROWS_BOUND');return rows.map(row=>{pagedOwnerExactV3(row,['profile','id','command','policySHA256','transaction','phase','signed','receipt']);return structuredClone(Object.fromEntries(['profile','id','command','policySHA256','transaction','signed'].map(key=>[key,row[key]])));});
}
/** Stop before an uncompleted reserved slot. Its unsigned/signed bytes have
 * not been fixed yet, so it cannot be part of an immutable prefix. */
export function sourceImmutableRowsAnchorDataV8(rows){
 assert.ok(Array.isArray(rows)&&rows.length<=512,'PAGED_SOURCE_IMMUTABLE_ROWS_BOUND');const first=rows.findIndex(row=>row.transaction===null||row.signed===null),count=first<0?rows.length:first;return normalizeSourceImmutableRowsAnchorDataV8({count,sha256:sha(sourceImmutableRowsProjectionDataV8(rows.slice(0,count)))});
}
export function assertSourceImmutableRowsAnchorDataV8(rows,raw){
 const anchor=normalizeSourceImmutableRowsAnchorDataV8(raw);assert.ok(Array.isArray(rows)&&rows.length>=anchor.count&&rows.length<=512,'PAGED_SOURCE_IMMUTABLE_PREFIX_REMOVED');const prefix=rows.slice(0,anchor.count);assert.ok(prefix.every(row=>row.transaction!==null&&row.signed!==null),'PAGED_SOURCE_IMMUTABLE_PREFIX_UNSIGNED');assert.equal(sha(sourceImmutableRowsProjectionDataV8(prefix)),anchor.sha256,'PAGED_SOURCE_IMMUTABLE_PREFIX_CHANGED');return anchor.count;
}
/** Legacy captures have no row count or immutable digest. Require an EXACT
 * original JSON prefix hash; no reconstructed phase or guessed receipt works. */
export function assertLegacySourceRowsPrefixDataV8(rows,checkpoint){
 assert.ok(Array.isArray(rows)&&rows.length<=512,'PAGED_SOURCE_IMMUTABLE_ROWS_BOUND');assert.match(checkpoint.dataSHA256,/^[0-9a-f]{64}$/);const matches=[],prefix=createHash('sha256').update('[');for(let count=0;count<=rows.length;count++){if(prefix.copy().update(']').digest('hex')===checkpoint.dataSHA256)matches.push(count);if(count<rows.length)prefix.update((count?',':'')+JSON.stringify(rows[count]));}assert.equal(matches.length,1,'PAGED_ACTIVE_LEGACY_SOURCE_PREFIX_CHANGED');return matches[0];
}
/** A new reader may additionally report a producer-computed anchor for the
 * SAME retained bytes. Legacy captures cannot accept a different row hash. */
export function assertSourceCheckpointAnchorCompatibilityDataV8(actual,retained,label='PAGED_SOURCE_CHECKPOINT'){
 const {immutableRowsAnchor:currentAnchor,...current}=actual,{immutableRowsAnchor:oldAnchor,...old}=retained;if(currentAnchor)normalizeSourceImmutableRowsAnchorDataV8(currentAnchor);if(oldAnchor){normalizeSourceImmutableRowsAnchorDataV8(oldAnchor);assert.deepEqual(currentAnchor,oldAnchor,label+'_IMMUTABLE_ANCHOR');}assert.deepEqual(current,old,label);return actual;
}
