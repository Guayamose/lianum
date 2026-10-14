/** Signed, bounded continuation of one already signed graph. This frame is
 * DATA; only the original OWNER and account can issue execution capabilities. */
import * as P from './device-paged-owner-v3.mjs';
import {normalizeDevicePagedProviderQuoteV4} from './device-paged-provider-quote-v4.mjs';
import {boundedPermissionSha256V1} from './bounded-permission-sha256-v1.mjs';
export const DEVICE_PAGED_AUTOMATION_V4='DEVICE_PAGED_APPROVED_CONTINUATION_V4';
const need=v=>{if(!v)throw Error('MOBILE_PAGED_AUTOMATION_TERMS');};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function normalizeDevicePagedAutomationRequestV4(raw){
 const r=P.pagedOwnerExactV3(raw,['quoteRoot','maxCommands','expiresAt']);
 P.pagedOwnerHexV3(r.quoteRoot);need(r.quoteRoot!=='0'.repeat(64));
 need(Number.isSafeInteger(r.maxCommands)&&r.maxCommands>0&&r.maxCommands<=4096);
 need(Number.isSafeInteger(r.expiresAt)&&r.expiresAt>0);return freeze(r);
}
export function normalizeDevicePagedAutomationTermsV4(raw){
 const t=P.pagedOwnerExactV3(raw,['profile','descriptorSHA256','graphId','rootId','revision','authorizationRoot','reserveNullifier','budget','nodes','settleBefore','quoteRoot','maxCommands','expiresAt']);
 need(t.profile===DEVICE_PAGED_AUTOMATION_V4);for(const k of ['descriptorSHA256','rootId','authorizationRoot','reserveNullifier']){P.pagedOwnerHexV3(t[k]);need(t[k]!=='0'.repeat(64));}
 need(typeof t.graphId==='string'&&/^[a-z0-9-]{8,100}$/.test(t.graphId)&&Number.isSafeInteger(t.revision)&&t.revision>0);
 for(const k of ['budget','nodes','settleBefore'])P.pagedOwnerUintV3(t[k]);need(BigInt(t.nodes)<=256n);
 normalizeDevicePagedAutomationRequestV4(Object.fromEntries(['quoteRoot','maxCommands','expiresAt'].map(k=>[k,t[k]])));return freeze(t);
}
export function devicePagedAutomationTermsMessageV4(raw){return new TextEncoder().encode('LIANUM/APPROVED-CONTINUATION/4\n'+JSON.stringify(normalizeDevicePagedAutomationTermsV4(raw)));}
/** Ordered signed offers commit native destinations, delivery amounts and
 * every fee ceiling through their terms hashes. Hashing DATA grants nothing. */
export function devicePagedAutomationQuoteRootV4(raw){
 need(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length>0&&raw.length<=256&&Reflect.ownKeys(raw).length===raw.length+1);
 let root='0'.repeat(64);const seen=new Set();
 for(let index=0;index<raw.length;index++){
  const slot=Object.getOwnPropertyDescriptor(raw,String(index));need(slot?.enumerable&&Object.hasOwn(slot,'value'));
  const q=normalizeDevicePagedProviderQuoteV4(slot.value);need(!seen.has(q.terms.id)&&q.terms.ordinal===String(index));seen.add(q.terms.id);
  const bytes=new TextEncoder().encode('LIANUM/APPROVED-QUOTES/4\n'+JSON.stringify([root,index,q.terms.id,q.termsSHA256,q.actionCommitment]));
  try{root=Array.from(boundedPermissionSha256V1(bytes),v=>v.toString(16).padStart(2,'0')).join('');}finally{bytes.fill(0);}
 }
 return root;
}
