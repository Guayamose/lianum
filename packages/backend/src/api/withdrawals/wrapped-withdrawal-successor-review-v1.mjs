/** Explicit successor review of an unchanged signed job; a digest is not a grant. */
import {createHash} from 'node:crypto';
import {types,isDeepStrictEqual} from 'node:util';
import {describeWrappedWithdrawalResumeReviewV1} from './wrapped-withdrawal-resume-review-v1.mjs';
const need=ok=>{if(!ok)throw Object.assign(Error('WRAPPED_RESUME_SUCCESSOR_REVIEW_INVALID'),{code:'WRAPPED_RESUME_SUCCESSOR_REVIEW_INVALID'});};
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const record=(v,keys)=>{need(v&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);need(Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)));for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);need(d.enumerable&&Object.hasOwn(d,'value'));}};
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
export function describeWrappedResumeSuccessorV1(input){
 record(input,['predecessorAdmissionSHA256','ordinal','originalReview']);
 need(typeof input.predecessorAdmissionSHA256==='string'&&/^[0-9a-f]{64}$/.test(input.predecessorAdmissionSHA256));need(Number.isSafeInteger(input.ordinal)&&input.ordinal>0&&input.ordinal<=32);
 const r=input.originalReview;need(r&&!types.isProxy(r)&&Object.getPrototypeOf(r)===Object.prototype);for(const k of Reflect.ownKeys(r)){const d=Object.getOwnPropertyDescriptor(r,k);need(typeof k==='string'&&d.enumerable&&Object.hasOwn(d,'value'));}
 const {version,profile,action,work,effectPermission,...facts}=r;const checked=describeWrappedWithdrawalResumeReviewV1(facts);need(isDeepStrictEqual(r,checked.review));
 const review=freeze({version:1,profile:'WRAPPED_ORIGINAL_RESUME_SUCCESSOR_REVIEW_V1',predecessorAdmissionSHA256:input.predecessorAdmissionSHA256,ordinal:input.ordinal,originalReview:structuredClone(r),effectPermission:false});
 return Object.freeze({review,resumeSHA256:createHash('sha256').update(canonical(review)).digest('hex'),effectPermission:false});
}
