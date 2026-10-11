/** Read a confirmed SHARE withdrawal without inspecting opaque runtime or
 * deployment objects. Issuer membership and exclusive execution stay in owner. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {externalFlatExactV1} from '@lianum/mobile-protocol/device/source-note-v1';
/** @typedef {{mode:string,stage:string,submission:{dispatchLatched?:boolean,transactionHash:string}|null,observation:unknown,nullifier:string}} Row */
/**
 * @template {Row} Retained
 * @template {{ledger:{nullifiers:string[]}}} View
 * @template PublicRow
 * @template {object} Observed
 * @param {unknown} raw
 * @param {{runtime:object,system:object,poolIndex:number,share:unknown}} subject
 * @param {{row:(job:unknown)=>Retained,observe:(row:Retained)=>Promise<unknown>,current:()=>Promise<View>,assertCurrent:(view:View)=>Promise<unknown>,admitted:()=>unknown,publicRow:(row:Retained)=>PublicRow,observed:(view:View)=>Observed,need:(ok:unknown,code:string)=>asserts ok}} ports
 */
export async function readConfirmedDeviceShareWithdrawalV1(raw,subject,ports){
 const {runtime,system,poolIndex,share}=subject;
 const {row,observe,current,assertCurrent,admitted,publicRow,observed}=ports;
 ports.need(!types.isProxy(raw),'DEVICE_EXTERNAL_FLAT_SHARE_CONTEXT');
 const q=externalFlatExactV1(raw,['runtime','system','poolIndex','jobId']);
 ports.need(share&&q.runtime===runtime&&q.system===system&&q.poolIndex===poolIndex,'DEVICE_EXTERNAL_FLAT_SHARE_CONTEXT');
 const r=row(q.jobId);ports.need(r.mode==='withdraw_balance'&&r.submission?.dispatchLatched,'DEVICE_EXTERNAL_FLAT_SHARE_W39_REQUIRED');
 await observe(r);const actual=row(q.jobId);
 ports.need(actual.stage==='CONFIRMED'&&actual.observation&&actual.submission?.transactionHash,'DEVICE_EXTERNAL_FLAT_SHARE_W39_UNCONFIRMED');
 const v=await current();ports.need(v.ledger.nullifiers.includes('0x'+actual.nullifier),'DEVICE_EXTERNAL_FLAT_SHARE_W39_NOT_SPENT');
 await assertCurrent(v);admitted();return Object.freeze({row:structuredClone(publicRow(actual)),observed:Object.freeze(observed(v))});
}
