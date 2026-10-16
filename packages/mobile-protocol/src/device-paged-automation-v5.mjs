/** Explicit V5 initial consent; V4 continues to grant no payout withdrawal. */
import * as P from './device-paged-owner-v3.mjs';
import * as V4 from './device-paged-automation-v4.mjs';
import {normalizeDevicePagedExecutorPayoutPlanV5} from './device-paged-executor-payout-v5.mjs';
import {devicePagedExecutorPayoutHashV5} from './device-paged-executor-payout-v5.mjs';
import {normalizeDevicePagedProviderQuoteV5,DEVICE_PAGED_PROVIDER_QUOTE_V5} from './device-paged-provider-quote-v5.mjs';
export const DEVICE_PAGED_AUTOMATION_V5='DEVICE_PAGED_APPROVED_CONTINUATION_V5';
export const DEVICE_PAGED_AUTOMATION_REQUEST_V5='DEVICE_PAGED_APPROVED_CONTINUATION_REQUEST_V5';
const need=v=>{if(!v)throw Error('MOBILE_PAGED_AUTOMATION_TERMS');};
const data=(v,key)=>v&&typeof v==='object'?Object.getOwnPropertyDescriptor(v,key)?.value:undefined;
export function normalizeDevicePagedAutomationRequestV5(raw){const r=P.pagedOwnerExactV3(raw,['profile','quoteRoot','maxCommands','expiresAt','executorPayouts']);need(r.profile===DEVICE_PAGED_AUTOMATION_REQUEST_V5);V4.normalizeDevicePagedAutomationRequestV4(Object.fromEntries(['quoteRoot','maxCommands','expiresAt'].map(k=>[k,r[k]])));r.executorPayouts=normalizeDevicePagedExecutorPayoutPlanV5(r.executorPayouts);need(r.quoteRoot===r.executorPayouts.quoteRoot&&r.executorPayouts.collectBy<=r.expiresAt);return Object.freeze(r);}
export function normalizeDevicePagedAutomationTermsV5(raw){const t=P.pagedOwnerExactV3(raw,['profile','descriptorSHA256','graphId','rootId','revision','authorizationRoot','reserveNullifier','budget','nodes','settleBefore','quoteRoot','maxCommands','expiresAt','executorPayouts']);need(t.profile===DEVICE_PAGED_AUTOMATION_V5);const base={...t,profile:V4.DEVICE_PAGED_AUTOMATION_V4};delete base.executorPayouts;V4.normalizeDevicePagedAutomationTermsV4(base);t.executorPayouts=normalizeDevicePagedExecutorPayoutPlanV5(t.executorPayouts);for(const k of ['descriptorSHA256','graphId','rootId','revision','authorizationRoot','quoteRoot'])need(t[k]===t.executorPayouts[k]);need(t.executorPayouts.payouts.length===Number(t.nodes)&&t.executorPayouts.collectBy<=t.expiresAt&&BigInt(t.executorPayouts.collectBy)>=BigInt(t.settleBefore)*1000n);need(t.executorPayouts.payouts.reduce((n,p)=>n+BigInt(p.amountAtomic),0n)<=BigInt(t.budget));return Object.freeze(t);}
export function normalizeDevicePagedAutomationRequestAnyV5(raw){return data(raw,'profile')===DEVICE_PAGED_AUTOMATION_REQUEST_V5?normalizeDevicePagedAutomationRequestV5(raw):V4.normalizeDevicePagedAutomationRequestV4(raw);}
export function normalizeDevicePagedAutomationTermsAnyV5(raw){return data(raw,'profile')===DEVICE_PAGED_AUTOMATION_V5?normalizeDevicePagedAutomationTermsV5(raw):V4.normalizeDevicePagedAutomationTermsV4(raw);}
export function devicePagedAutomationRequestFromTermsV5(raw){const t=normalizeDevicePagedAutomationTermsAnyV5(raw),r=Object.fromEntries(['quoteRoot','maxCommands','expiresAt'].map(k=>[k,t[k]]));return t.profile===DEVICE_PAGED_AUTOMATION_V5?normalizeDevicePagedAutomationRequestV5({profile:DEVICE_PAGED_AUTOMATION_REQUEST_V5,...r,executorPayouts:t.executorPayouts}):r;}
export function devicePagedAutomationQuoteRootV5(raw){need(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length>0&&raw.length<=256&&Reflect.ownKeys(raw).length===raw.length+1);let root='0'.repeat(64);const seen=new Set();for(let index=0;index<raw.length;index++){const slot=Object.getOwnPropertyDescriptor(raw,String(index));need(slot?.enumerable&&Object.hasOwn(slot,'value'));const q=normalizeDevicePagedProviderQuoteV5(slot.value);need(q.terms.ordinal===String(index)&&!seen.has(q.terms.id));seen.add(q.terms.id);root=devicePagedExecutorPayoutHashV5(['LIANUM/APPROVED-QUOTES/5',root,index,q.terms.id,q.termsSHA256,q.actionCommitment]);}return root;}
export function devicePagedAutomationQuoteRootAnyV5(raw){let v5=false;if(Array.isArray(raw)&&raw.length<=256)for(let i=0;i<raw.length;i++)if(data(data(data(raw,String(i)),'terms'),'profile')===DEVICE_PAGED_PROVIDER_QUOTE_V5)v5=true;return v5?devicePagedAutomationQuoteRootV5(raw):V4.devicePagedAutomationQuoteRootV4(raw);}

// Version-aware ports for fixed Original owners; V4 module stays strict.
export const normalizeDevicePagedAutomationRequestV4=normalizeDevicePagedAutomationRequestAnyV5;
export const normalizeDevicePagedAutomationTermsV4=normalizeDevicePagedAutomationTermsAnyV5;
export const devicePagedAutomationQuoteRootV4=devicePagedAutomationQuoteRootAnyV5;
export {DEVICE_PAGED_AUTOMATION_V4} from './device-paged-automation-v4.mjs';
