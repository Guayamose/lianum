/** DATA review for a finite operator renewal. The caller must obtain state
 * from its live Original product; this module grants no signing capability. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const exact=(value,fields)=>{assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype,'PAEG_EMPTY_RENEWAL_DATA');assert.deepEqual(Reflect.ownKeys(value).sort(),[...fields].sort(),'PAEG_EMPTY_RENEWAL_FIELDS');for(const key of fields)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'),'PAEG_EMPTY_RENEWAL_FIELDS');};
export function normalizeEmptySourceRenewalIntentDataV9(raw){
 exact(raw,['profile','intentId','expiresAt','previousEpochId','previousPolicySHA256','limitsSHA256','sourceRowsSHA256','maximumSourcesPerWallet']);
 assert.equal(raw.profile,'PUBLIC_EMPTY_SOURCE_RENEWAL_INTENT_V9');
 for(const key of ['intentId','previousPolicySHA256','limitsSHA256','sourceRowsSHA256'])assert.ok(hex(raw[key]),'PAEG_EMPTY_RENEWAL_BINDING');
 assert.ok(raw.previousEpochId===null||hex(raw.previousEpochId),'PAEG_EMPTY_RENEWAL_EPOCH');
 assert.ok(Number.isSafeInteger(raw.expiresAt)&&raw.expiresAt>0,'PAEG_EMPTY_RENEWAL_PERIOD');
 assert.ok(typeof raw.maximumSourcesPerWallet==='string'&&/^[1-9][0-9]*$/.test(raw.maximumSourcesPerWallet)&&BigInt(raw.maximumSourcesPerWallet)<=16n,'PAEG_EMPTY_RENEWAL_WALLET_QUOTA');
 return Object.freeze(structuredClone(raw));
}
export function prepareEmptySourceFinancialReviewDataV9(state,rawIntent,retainedReview=null,now=Date.now()){
 const intent=normalizeEmptySourceRenewalIntentDataV9(rawIntent);
 assert.equal(state?.profile,'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5');
 assert.ok(state.reviewEligible===true&&Array.isArray(state.history),'PAEG_EMPTY_RENEWAL_SOURCE_NOT_READY');
 assert.ok(Number.isSafeInteger(now)&&now>0,'PAEG_EMPTY_RENEWAL_CLOCK');
 assert.equal(state.checkpoint.dataSHA256,intent.sourceRowsSHA256,'PAEG_EMPTY_RENEWAL_SOURCE_CHANGED');
 const prior=state.history.find(row=>row.epoch.nonce===intent.intentId);
 if(prior){
  // A lost administrative response observes the exact previously signed epoch.
  // It cannot turn a new caller-supplied deadline into a repeat authorization.
  exact(retainedReview,['intentId','expectedCheckpoint','expectedEpochId','policy','limits']);
  assert.equal(retainedReview.intentId,intent.intentId,'PAEG_EMPTY_RENEWAL_REVIEW_CHANGED');
  assert.equal(retainedReview.expectedEpochId,intent.previousEpochId,'PAEG_EMPTY_RENEWAL_REVIEW_CHANGED');
  assert.equal(prior.epoch.predecessorEpochId,intent.previousEpochId,'PAEG_EMPTY_RENEWAL_REVIEW_CHANGED');
  assert.deepEqual(retainedReview.policy,prior.epoch.policy,'PAEG_EMPTY_RENEWAL_REVIEW_CHANGED');
  assert.deepEqual(retainedReview.limits,prior.epoch.limits,'PAEG_EMPTY_RENEWAL_REVIEW_CHANGED');
  for(const key of ['identity','revision','dataSHA256','policySHA256'])assert.equal(retainedReview.expectedCheckpoint[key],prior.epoch.checkpoint[key],'PAEG_EMPTY_RENEWAL_REVIEW_CHANGED');
  const previousPolicy=intent.previousEpochId===null?state.basePolicy:state.history.find(row=>row.epoch.epochId===intent.previousEpochId)?.epoch.policy;
  assert.ok(previousPolicy,'PAEG_EMPTY_RENEWAL_PREDECESSOR_MISSING');
  assert.equal(hash(previousPolicy),intent.previousPolicySHA256,'PAEG_EMPTY_RENEWAL_POLICY_CHANGED');
  assert.deepEqual({...prior.epoch.policy,expiresAt:previousPolicy.expiresAt},previousPolicy,'PAEG_EMPTY_RENEWAL_CAPS_CHANGED');
  const previousLimits=intent.previousEpochId===null?{maximumTotalSuccessorPools:'1',maximumSourcesPerWallet:'1'}:state.history.find(row=>row.epoch.epochId===intent.previousEpochId)?.epoch.limits;
  assert.ok(previousLimits,'PAEG_EMPTY_RENEWAL_PREDECESSOR_MISSING');assert.equal(hash(previousLimits),intent.limitsSHA256,'PAEG_EMPTY_RENEWAL_QUOTAS_CHANGED');
  assert.deepEqual(prior.epoch.limits,{...previousLimits,maximumSourcesPerWallet:intent.maximumSourcesPerWallet},'PAEG_EMPTY_RENEWAL_QUOTAS_CHANGED');
  assert.deepEqual(state.limits,prior.epoch.limits,'PAEG_EMPTY_RENEWAL_SUCCESSOR_EXISTS');assert.equal(state.epoch?.epochId,prior.epoch.epochId,'PAEG_EMPTY_RENEWAL_SUCCESSOR_EXISTS');
  assert.equal(prior.epoch.policy.expiresAt,intent.expiresAt,'PAEG_EMPTY_RENEWAL_PERIOD_CHANGED');
  assert.equal(hash(prior.epoch.policy),hash(state.effectivePolicy),'PAEG_EMPTY_RENEWAL_SUCCESSOR_EXISTS');
  return Object.freeze(structuredClone(retainedReview));
 }
 assert.equal(state.epoch?.epochId??null,intent.previousEpochId,'PAEG_EMPTY_RENEWAL_EPOCH_CHANGED');
 assert.equal(hash(state.effectivePolicy),intent.previousPolicySHA256,'PAEG_EMPTY_RENEWAL_POLICY_CHANGED');
 assert.equal(hash(state.limits),intent.limitsSHA256,'PAEG_EMPTY_RENEWAL_QUOTAS_CHANGED');
 assert.ok(BigInt(intent.maximumSourcesPerWallet)>=BigInt(state.limits.maximumSourcesPerWallet),'PAEG_EMPTY_RENEWAL_QUOTA_ROLLBACK');
 assert.ok(now<intent.expiresAt&&intent.expiresAt<=now+9*3600000&&intent.expiresAt>state.effectivePolicy.expiresAt,'PAEG_EMPTY_RENEWAL_PERIOD');
 const review={intentId:intent.intentId,expectedCheckpoint:structuredClone(state.checkpoint),expectedEpochId:intent.previousEpochId,policy:{...state.effectivePolicy,expiresAt:intent.expiresAt},limits:{...state.limits,maximumSourcesPerWallet:intent.maximumSourcesPerWallet}};
 if(retainedReview!==null)assert.deepEqual(retainedReview,review,'PAEG_EMPTY_RENEWAL_REVIEW_CHANGED');
 return Object.freeze(review);
}
