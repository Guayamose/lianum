/** Fixed CAPTURED financial review. Only original supervisor tokens open the
 * retained Native/deployment. This grants a server spending period explicitly;
 * existing wallet descriptors, notes and START permissions remain historical. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {assertSourceFinancialSignedReviewDataV5} from '../../chains/public-testnet/sepolia-source-financial-epoch-store-v5.mjs';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {readOriginalPagedPublicRecoveryModeV4,openOriginalPagedCapturedFinancialEpochReviewV5,openOriginalPagedSourceReadRecoverySupervisorV4,consumeOriginalPagedSourceReadRecoveryV4,closeOriginalPagedSourceReadRecoveryV4,readOriginalPagedSourceReadRecoveryBindingV4} from './paged-runtime-recovery-authority-v3.mjs';
import {readOriginalPagedPublicCapturedFinancialStateV5} from './paged-public-source-financial-window-v5.mjs';
import {reopenOriginalPagedPublicTestnetRuntimesV4,reopenOriginalPagedPublicFinancialReviewReceiverV5,readOriginalPagedPublicSepoliaFinancialStateV5,authorizeOriginalPagedPublicSepoliaFinancialEpochV5,captureOriginalPagedPublicFinancialReviewV5,closeOriginalPagedPublicFinancialReviewWithoutEpochV5} from '../../providers/paged-public-testnet-runtimes-v1.mjs';
const abortRead=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get,abortAdd=EventTarget.prototype.addEventListener,abortRemove=EventTarget.prototype.removeEventListener;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function sameSignedReview(state,review){
 const epoch=assertSourceFinancialSignedReviewDataV5(state,review);assert.deepEqual(epoch.policy,review.policy,'PAGED_CAPTURED_FINANCIAL_REVIEW_TERMS');assert.deepEqual(epoch.limits,review.limits,'PAGED_CAPTURED_FINANCIAL_REVIEW_TERMS');assert.equal(epoch.predecessorEpochId,review.expectedEpochId,'PAGED_CAPTURED_FINANCIAL_REVIEW_PREDECESSOR');for(const key of ['identity','revision','dataSHA256','policySHA256'])assert.equal(epoch.checkpoint[key],review.expectedCheckpoint[key],'PAGED_CAPTURED_FINANCIAL_REVIEW_CHECKPOINT');return epoch;
}
async function capturedState(input,nativeDirectory){
 const owner=await openOriginalPagedSourceReadRecoverySupervisorV4(input);let reader;try{const descriptor=owner.descriptor();reader=await consumeOriginalPagedSourceReadRecoveryV4(await owner.issueSource(descriptor.pairingId));assert.equal((await readOriginalPagedSourceReadRecoveryBindingV4(reader)).native.directory,nativeDirectory,'PAGED_CAPTURED_FINANCIAL_REVIEW_NATIVE_LOCATION');const state=await readOriginalPagedPublicCapturedFinancialStateV5(reader);return{state,checkpoint:owner.checkpoint()};}finally{if(reader)closeOriginalPagedSourceReadRecoveryV4(reader);await owner.close();}
}
function result(outcome,review,state,checkpoint){return freeze({profile:'ORIGINAL_PAGED_CAPTURED_NATIVE_FINANCIAL_EPOCH_RESULT_V5',outcome,intentId:review.intentId,financialState:state,supervisorCheckpoint:checkpoint,financialSourcePermissionIssued:false,transactionsBroadcast:0});}
export async function authorizeOriginalPagedCapturedNativeFinancialEpochV5(raw,rawReview,signal){
 assert.ok(arguments.length===2||arguments.length===3);P.pagedOwnerExactV3(raw,['supervisorDirectory','journalPassword','nativeDirectory']);for(const key of ['supervisorDirectory','nativeDirectory'])assert.equal(raw[key],resolve(raw[key]),'PAGED_CAPTURED_FINANCIAL_REVIEW_LOCATION');assert.ok(typeof raw.journalPassword==='string'&&raw.journalPassword.length>=32&&raw.journalPassword.length<=4096);P.pagedOwnerExactV3(rawReview,['intentId','expectedCheckpoint','expectedEpochId','policy','limits']);const review=freeze(structuredClone(rawReview)),input={directory:raw.supervisorDirectory,password:raw.journalPassword};
 if(signal!==undefined)try{abortRead.call(signal);}catch{assert.fail('PAGED_CAPTURED_FINANCIAL_REVIEW_ABORT_SIGNAL');}
 const current=()=>{if(signal!==undefined&&abortRead.call(signal))throw Error('PAGED_CAPTURED_FINANCIAL_REVIEW_ABORTED');};current();
 const mode=await readOriginalPagedPublicRecoveryModeV4(input);current();assert.ok(['CAPTURED','CAPTURED_FINANCIAL_REVIEW_V5'].includes(mode.mode),'PAGED_CAPTURED_FINANCIAL_REVIEW_CAPTURE_REQUIRED');
 if(mode.mode==='CAPTURED'){
  const before=await capturedState(input,raw.nativeDirectory);current();const retained=before.state.history.find(row=>row.epoch.nonce===review.intentId);if(retained){sameSignedReview(before.state,review);return result('AUTHORIZED',review,before.state,before.checkpoint);}
 }
 let supervisor,native,receiver,completion,abortReceiver,abortNative;
 const cancel=()=>{if(receiver&&!abortReceiver){abortReceiver=Promise.resolve(receiver.close());abortReceiver.catch(()=>{});}else if(native&&!abortNative){abortNative=Promise.resolve(native.close());abortNative.catch(()=>{});}};
 if(signal!==undefined)abortAdd.call(signal,'abort',cancel,{once:true});
 try{
  current();supervisor=await openOriginalPagedCapturedFinancialEpochReviewV5(input,review);current();if(supervisor.completed){completion=await supervisor.completion();await supervisor.close();supervisor=null;const actual=await capturedState(input,raw.nativeDirectory);current();if(completion.receipt.outcome==='NO_EPOCH_ISSUED'){assert.ok(!actual.state.history.some(row=>row.epoch.nonce===review.intentId),'PAGED_CAPTURED_FINANCIAL_REVIEW_UNEXPECTED_EPOCH');assert.deepEqual(actual.state.checkpoint,completion.receipt.sourceCheckpoint);return result('NO_EPOCH_ISSUED',review,actual.state,actual.checkpoint);}sameSignedReview(actual.state,review);return result('AUTHORIZED',review,actual.state,actual.checkpoint);}
  const nativeToken=await supervisor.issueComponent('native');native=await reopenOriginalPagedPublicTestnetRuntimesV4({directory:raw.nativeDirectory},nativeToken);current();const deploymentToken=await supervisor.issueComponent('deployment'),reviewToken=await supervisor.issueReview(),opened=await reopenOriginalPagedPublicFinancialReviewReceiverV5(native,deploymentToken,reviewToken);receiver=opened.runtime;current();const state=await readOriginalPagedPublicSepoliaFinancialStateV5(receiver);current();let outcome;
  if(state.history.some(row=>row.epoch.nonce===review.intentId)||review.policy.expiresAt>Date.now()){
   await authorizeOriginalPagedPublicSepoliaFinancialEpochV5(receiver,review);current();const saved=await captureOriginalPagedPublicFinancialReviewV5(receiver);receiver=null;native=null;current();await supervisor.complete(saved);outcome='AUTHORIZED';
  }else{
   const saved=await closeOriginalPagedPublicFinancialReviewWithoutEpochV5(receiver);receiver=null;native=null;current();await supervisor.completeWithoutEpoch(saved);outcome='NO_EPOCH_ISSUED';
  }
  await supervisor.close();supervisor=null;const actual=await capturedState(input,raw.nativeDirectory);current();if(outcome==='AUTHORIZED')sameSignedReview(actual.state,review);else assert.ok(!actual.state.history.some(row=>row.epoch.nonce===review.intentId),'PAGED_CAPTURED_FINANCIAL_REVIEW_UNEXPECTED_EPOCH');return result(outcome,review,actual.state,actual.checkpoint);
 }finally{if(signal!==undefined)abortRemove.call(signal,'abort',cancel);if(receiver)await receiver.close();if(native)await native.close();await supervisor?.close();}
}
