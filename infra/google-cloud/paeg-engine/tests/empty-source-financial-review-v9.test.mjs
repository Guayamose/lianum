import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareEmptySourceFinancialReviewDataV9 as prepare} from '../../../../services/paeg-engine/src/public/empty-source-financial-review-v9.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),h=n=>String(n).repeat(64),now=100000000;
function fixture(){
 const policy={profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',keysetId:h(1),account:'0x'+'11'.repeat(20),maximumFeePerTransactionAtomic:'500',maximumTotalFeeAtomic:'5000',maximumValuePerTransactionAtomic:'100',maximumTotalValueAtomic:'200',expiresAt:now+1000};
 const state={profile:'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5',basePolicy:policy,effectivePolicy:policy,reviewEligible:true,epoch:{epochId:h(2)},history:[{epoch:{epochId:h(2),policy,limits:{maximumSourcesPerWallet:'1',maximumTotalSuccessorPools:'1',maximumTotalMixedSources:'2'}}}],limits:{maximumSourcesPerWallet:'1',maximumTotalSuccessorPools:'1',maximumTotalMixedSources:'2'},reserved:{feeAtomic:'300',valueAtomic:'10'},checkpoint:{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_CHECKPOINT_V4',identity:h(3),revision:97,dataSHA256:h(4),policySHA256:sha(policy)}};
 const intent={profile:'PUBLIC_EMPTY_SOURCE_RENEWAL_INTENT_V9',intentId:h(5),expiresAt:now+3600000,previousEpochId:h(2),previousPolicySHA256:sha(policy),limitsSHA256:sha(state.limits),sourceRowsSHA256:h(4),maximumSourcesPerWallet:'2'};
 return{state,intent};
}
test('finite renewal changes only the operator period and retains actual Source checkpoint, caps and quotas',()=>{
 const {state,intent}=fixture(),before=structuredClone(state),review=prepare(state,intent,null,now);
 assert.deepEqual({...review.policy,expiresAt:state.effectivePolicy.expiresAt},state.effectivePolicy);assert.deepEqual(review.limits,{...state.limits,maximumSourcesPerWallet:'2'});assert.deepEqual(review.expectedCheckpoint,state.checkpoint);assert.equal(review.policy.expiresAt,intent.expiresAt);assert.deepEqual(state,before);
});
test('renewal rejects changed history, financial terms, Source rows, quotas and invalid periods',()=>{
 const changes=[(s,i)=>{s.reviewEligible=false;},(s,i)=>{s.epoch.epochId=h(8);},(s,i)=>{s.effectivePolicy.maximumTotalFeeAtomic='5001';},(s,i)=>{s.limits.maximumSourcesPerWallet='2';},(s,i)=>{s.checkpoint.dataSHA256=h(8);},(s,i)=>{i.expiresAt=now-1;},(s,i)=>{i.expiresAt=now+9*3600000+1;},(s,i)=>{i.expiresAt=now+500;},(s,i)=>{i.extra=true;}];
 for(const change of changes){const {state,intent}=fixture();change(state,intent);assert.throws(()=>prepare(state,intent,null,now));}
});
test('lost response reuses the signed epoch and the exact retained review without renewing its expiry',()=>{
 const {state,intent}=fixture(),review=prepare(state,intent,null,now),checkpoint=Object.fromEntries(['identity','revision','dataSHA256','policySHA256'].map(k=>[k,review.expectedCheckpoint[k]]));
 const epoch={nonce:intent.intentId,epochId:h(6),predecessorEpochId:intent.previousEpochId,policy:review.policy,limits:review.limits,checkpoint};state.history.push({epoch});state.epoch=epoch;state.effectivePolicy=review.policy;state.limits=review.limits;state.checkpoint={...state.checkpoint,revision:98};
 assert.deepEqual(prepare(state,intent,review,now+4000000),review);
 assert.throws(()=>prepare(state,{...intent,expiresAt:intent.expiresAt+1},review,now),/PERIOD_CHANGED/);
 assert.throws(()=>prepare(state,intent,{...review,expectedCheckpoint:{...review.expectedCheckpoint,revision:1}},now),/REVIEW_CHANGED/);
 assert.throws(()=>prepare(state,intent,null,now));
});
test('a source quota review preserves the existing deadline and every other financial term',()=>{
 const {state,intent}=fixture(),before=structuredClone(state);intent.expiresAt=state.effectivePolicy.expiresAt;
 const review=prepare(state,intent,null,now);
 assert.deepEqual(review.policy,state.effectivePolicy);
 assert.deepEqual(review.limits,{...state.limits,maximumSourcesPerWallet:'2'});
 assert.deepEqual(review.expectedCheckpoint,state.checkpoint);assert.deepEqual(state,before);
 assert.throws(()=>prepare(state,{...intent,maximumSourcesPerWallet:'1'},null,now),/PERIOD/);
 assert.throws(()=>prepare(state,{...intent,expiresAt:intent.expiresAt-1},null,now),/PERIOD/);
 assert.throws(()=>prepare(state,intent,null,intent.expiresAt),/PERIOD/);
});

import {OPERATION_WINDOW_V17,operationSpendingPolicySHA256V17} from '../../../../packages/backend/src/chains/public-testnet/sepolia-operation-window-data-v17.mjs';
test('explicit finite operation window extends time while binding every monetary ceiling and retry',()=>{
 const {state,intent}=fixture(),before=structuredClone(state);
 intent.expiresAt=now+38*24*3600000;
 intent.operationWindowV17={profile:OPERATION_WINDOW_V17,authorizedAt:now,expiresAt:intent.expiresAt,spendingPolicySHA256:operationSpendingPolicySHA256V17(state.effectivePolicy)};
 const review=prepare(state,intent,null,now);
 assert.deepEqual(review.limits.operationWindowV17,intent.operationWindowV17);assert.deepEqual({...review.policy,expiresAt:state.effectivePolicy.expiresAt},state.effectivePolicy);assert.deepEqual(state,before);
 assert.throws(()=>prepare(state,{...intent,operationWindowV17:{...intent.operationWindowV17,spendingPolicySHA256:h(9)}},null,now),/SPENDING_CHANGED/);
 assert.throws(()=>prepare(state,{...intent,operationWindowV17:{...intent.operationWindowV17,authorizedAt:now+1}},null,now),/AUTHORIZATION_TIME/);
 assert.throws(()=>prepare(state,{...intent,operationWindowV17:{...intent.operationWindowV17,expiresAt:intent.expiresAt-1}},null,now),/POLICY_DEADLINE/);
 const epoch={nonce:intent.intentId,epochId:h(6),predecessorEpochId:intent.previousEpochId,policy:review.policy,limits:review.limits,checkpoint:structuredClone(review.expectedCheckpoint)};
 state.history.push({epoch});state.epoch=epoch;state.effectivePolicy=review.policy;state.limits=review.limits;
 assert.deepEqual(prepare(state,intent,review,now+1),review);
 assert.throws(()=>prepare(state,{...intent,operationWindowV17:{...intent.operationWindowV17,authorizedAt:now-1}},review,now+1),/QUOTAS_CHANGED/);
});
