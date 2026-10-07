import {describeWrappedResumeSuccessorV1} from './wrapped-withdrawal-successor-review-v1.mjs';
/** Read-only projection of an existing durable admission. It never creates,
 * renews or reconstructs missing consent, nor reports current effect authority. */
import {types,isDeepStrictEqual} from 'node:util';
import {describeWrappedWithdrawalResumeReviewV1} from './wrapped-withdrawal-resume-review-v1.mjs';
const need=(ok)=>{if(!ok)throw Object.assign(Error('WRAPPED_RESUME_RETAINED_ADMISSION_INVALID'),{code:'WRAPPED_RESUME_RETAINED_ADMISSION_INVALID'});};
const data=v=>{need(v&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);for(const key of Reflect.ownKeys(v))need(typeof key==='string'&&Object.getOwnPropertyDescriptor(v,key).enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,key),'value'));};
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
export function projectStoredWrappedResumeAdmissionV1(row,walletCheckpoint){
 data(row);if(!Object.hasOwn(row,'resumeAdmission'))return null;
 const stored=row.resumeAdmission;data(stored);data(stored.review);data(walletCheckpoint);
 need(stored.schema==='WRAPPED_WITHDRAWAL_ONE_USE_RESUME_ADMISSION_V1'&&stored.consumed===true);
 need(typeof stored.continuationStarted==='boolean'&&typeof stored.broadcastArmed==='boolean');
 need(Object.keys(walletCheckpoint).sort().join(',')==='commitment,revision'&&Number.isSafeInteger(walletCheckpoint.revision)&&walletCheckpoint.revision>=0&&typeof walletCheckpoint.commitment==='string'&&/^[0-9a-f]{64}$/.test(walletCheckpoint.commitment));
 // Revalidate the stored value, never derive absent fields from current actor,
 // head, terms, a witness or another admission. Validation mints no capability.
 const {version,profile,action,work,effectPermission,...facts}=stored.review;
 const checked=describeWrappedWithdrawalResumeReviewV1(facts);
 need(isDeepStrictEqual(stored.review,checked.review));let successorReview=null;
 if(Object.hasOwn(stored,'successorReview')){data(stored.successorReview);const expected=describeWrappedResumeSuccessorV1({predecessorAdmissionSHA256:stored.predecessorAdmissionSHA256,ordinal:stored.ordinal,originalReview:stored.review});need(isDeepStrictEqual(stored.successorReview,expected.review)&&stored.resumeSHA256===expected.resumeSHA256&&stored.reviewSHA256===checked.resumeSHA256);successorReview=structuredClone(stored.successorReview);}
 else need(stored.resumeSHA256===checked.resumeSHA256);
 need(row.requestId===stored.review.requestId&&row.role===stored.review.role&&row.termsSHA256===stored.review.signedTermsSHA256);
 const terms=row.terms;data(terms);need(typeof terms.recipient==='string');need(terms.noteCommitment===stored.review.noteCommitment&&terms.amount===stored.review.amount&&'0x'+terms.recipient===stored.review.recipient&&terms.pool===stored.review.pool&&terms.assetId===stored.review.assetId);
 need(['RESUME_ADMITTED','RESUME_PROVING','RESUME_PROOF_READY','RESUME_PROOF_INTERRUPTED','SEND_UNKNOWN','UNKNOWN','CONFIRMED'].includes(row.state));
 return freeze({profile:'WRAPPED_ORIGINAL_RESUME_ADMISSION_READ_V1',observation:'RETAINED_ADMISSION_ONLY',requestId:row.requestId,state:row.state,walletCheckpoint:{...walletCheckpoint},resumeSHA256:stored.resumeSHA256,review:structuredClone(stored.review),successorReview,consumed:true,continuationStarted:stored.continuationStarted,broadcastArmed:stored.broadcastArmed,effectPermission:false});
}
