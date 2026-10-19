/** Select DATA from an Original signer's authenticated snapshot. This module
 * issues no authority and performs no network calls, signing or journal writes. */
import assert from 'node:assert/strict';
import {isExpiredSourceNoteV32} from '../../chains/public-testnet/sepolia-note-retry-data-v32.mjs';
import {createHash} from 'node:crypto';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function selectPagedPendingSourceTransactionV18(operations,identity,intent,action){
 assert.ok(Array.isArray(operations),'PAGED_PENDING_SOURCE_ROWS');
 assert.match(identity,/^[0-9a-f]{64}$/,'PAGED_PENDING_SOURCE_IDENTITY');
 assert.ok(typeof action==='string'&&action.length>0,'PAGED_PENDING_SOURCE_ACTION');
 const family=operations.filter(row=>row.command?.identity===identity&&row.command?.jobId===intent.jobId&&row.command?.action===action);
 const rows=family.filter(row=>typeof row.command.data==='string'&&/^0x(?:[0-9a-f]{2})*$/.test(row.command.data)&&sha(Buffer.from(row.command.data.slice(2),'hex'))===intent.calldataSHA256);
 if(rows.length===0)assert.ok(family.every(isExpiredSourceNoteV32),'PAGED_PENDING_SOURCE_INTENT');
 assert.ok(rows.length<=1,'PAGED_PENDING_SOURCE_AMBIGUOUS');
 if(rows.length===0)return null;
 const row=rows[0],c=row.command;
 for(const key of ['from','to','value'])assert.equal(c[key],intent[key],'PAGED_PENDING_SOURCE_INTENT');
 assert.match(c.data,/^0x(?:[0-9a-f]{2})*$/,'PAGED_PENDING_SOURCE_CALLDATA');
 assert.equal(sha(Buffer.from(c.data.slice(2),'hex')),intent.calldataSHA256,'PAGED_PENDING_SOURCE_INTENT');
 if(row.signed===null)return null;
 assert.match(row.signed.nativeId,/^0x[0-9a-f]{64}$/,'PAGED_PENDING_SOURCE_TRANSACTION');
 return row.signed.nativeId;
}
