/** Fixed private cold review control. Only the original Native facade can
 * authorize/observe; file DATA and result DATA never issue financial handles. */
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4,readPrivateOperatorFileV4,writePrivateOperatorFileV4} from './public-operator-state-v4.mjs';
import {FINANCIAL_EPOCH_REVIEW_FILE_V5,publishPrivateFinancialStateDataV5} from './financial-epoch-control-v5.mjs';
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const original=path=>import(pathToFileURL(join(root,path)).href);
export async function continueCapturedOriginalPublicFinancialReviewV5(configuration,signal){
 assert.equal(arguments.length,2);assert.ok(signal instanceof AbortSignal&&!signal.aborted,'PAEG_CAPTURED_FINANCIAL_SIGNAL');
 assert.equal(configuration.nativeDirectory,PUBLIC_NATIVE_DIRECTORY_V4);assert.equal(configuration.supervisorDirectory,join(PUBLIC_OPERATOR_STATE_V4,'supervisor'));
 let bytes,review;
 try{
  try{bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,FINANCIAL_EPOCH_REVIEW_FILE_V5);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  review=JSON.parse(bytes.toString('utf8'));assert.deepEqual(Object.keys(review).sort(),['intentId','expectedCheckpoint','expectedEpochId','policy','limits'].sort(),'PAEG_CAPTURED_FINANCIAL_REVIEW_FIELDS');assert.match(review.intentId,/^[0-9a-f]{64}$/);
  const backend=await original('packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs');
  const result=await backend.authorizeOriginalPagedCapturedNativeFinancialEpochV5({supervisorDirectory:configuration.supervisorDirectory,journalPassword:configuration.journal.password,nativeDirectory:configuration.nativeDirectory},review,signal);
  assert.equal(result.profile,'ORIGINAL_PAGED_CAPTURED_NATIVE_FINANCIAL_EPOCH_RESULT_V5');assert.ok(['AUTHORIZED','NO_EPOCH_ISSUED'].includes(result.outcome),'PAEG_CAPTURED_FINANCIAL_OUTCOME');assert.equal(result.intentId,review.intentId);assert.equal(result.financialSourcePermissionIssued,false);assert.equal(result.transactionsBroadcast,0);assert.equal(result.supervisorCheckpoint.phase,'CAPTURED');
  const state=result.financialState;assert.equal(state.profile,'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5');assert.equal(state.financialSigningEnabled,false);
  let ack;
  if(result.outcome==='AUTHORIZED'){
   assert.equal(state.epoch.nonce,review.intentId);assert.deepEqual(state.epoch.policy,review.policy);assert.deepEqual(state.epoch.limits,review.limits);assert.equal(state.epoch.predecessorEpochId,review.expectedEpochId);assert.equal(state.effectivePolicy.expiresAt,review.policy.expiresAt);
   ack={profile:'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5',intentId:review.intentId,epochId:state.epoch.epochId,epoch:state.epoch.epoch,expiresAt:state.effectivePolicy.expiresAt,financialStepsStarted:false};
  }else{
   assert.ok(state.history.every(row=>row.epoch.nonce!==review.intentId),'PAEG_CAPTURED_FINANCIAL_NO_EPOCH_BINDING');assert.deepEqual(state.checkpoint,review.expectedCheckpoint,'PAEG_CAPTURED_FINANCIAL_UNCHANGED_CHECKPOINT');
   ack={profile:'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5',outcome:'NO_EPOCH_ISSUED',intentId:review.intentId,epochId:null,epoch:null,expiresAt:review.policy.expiresAt,financialStepsStarted:false};
  }
  const raw=Buffer.from(JSON.stringify(ack)+'\n'),name='financial-epoch-ack-'+review.intentId+'.json';
  try{await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name,raw);}catch(error){if(error.code!=='EEXIST')throw error;const old=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name);try{assert.deepEqual(JSON.parse(old.toString('utf8')),ack,'PAEG_CAPTURED_FINANCIAL_ACK_CHANGED');}finally{old.fill(0);}}finally{raw.fill(0);}
  await publishPrivateFinancialStateDataV5(state);
  process.stdout.write(JSON.stringify({stage:'CAPTURED_FINANCIAL_REVIEW_COMPLETED',outcome:result.outcome,...ack,transactionsBroadcast:0})+'\n');return Object.freeze({outcome:result.outcome,intentId:review.intentId,expiresAt:ack.expiresAt,financialSourcePermissionIssued:false});
 }finally{bytes?.fill(0);review=null;}
}
