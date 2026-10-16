/** Private prebirth review DATA. Original Native remains the financial issuer. */
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {rename,open,lstat} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {PUBLIC_OPERATOR_STATE_V4,assertPrivateOperatorDirectoryV4,readPrivateOperatorFileV4,writePrivateOperatorFileV4} from './public-operator-state-v4.mjs';

export const PREBIRTH_FINANCIAL_STATE_FILE_V5='initial-source-financial-state-v5.json';
export const PREBIRTH_FINANCIAL_REVIEW_FILE_V5='initial-source-financial-review-v5.json';
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const original=path=>import(pathToFileURL(join(root,path)).href);
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function exact(value,fields){assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),fields.slice().sort());}

async function publishState(state,extra){
 assert.equal(state?.profile,'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5');assert.ok(Array.isArray(state.history));
 const snapshot={...state,historyCount:state.history.length,...extra};delete snapshot.history;
 const bytes=Buffer.from(JSON.stringify(snapshot)+'\n');
 try{
  assert.ok(bytes.length>0&&bytes.length<=65536,'PAEG_PREBIRTH_STATE_BOUND');await assertPrivateOperatorDirectoryV4(PUBLIC_OPERATOR_STATE_V4);
  try{const s=await lstat(join(PUBLIC_OPERATOR_STATE_V4,PREBIRTH_FINANCIAL_STATE_FILE_V5));assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600,'PAEG_PREBIRTH_STATE_FILE');}catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary='initial-source-financial-state-'+randomBytes(16).toString('hex')+'.tmp';await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,temporary,bytes);await rename(join(PUBLIC_OPERATOR_STATE_V4,temporary),join(PUBLIC_OPERATOR_STATE_V4,PREBIRTH_FINANCIAL_STATE_FILE_V5));const directory=await open(PUBLIC_OPERATOR_STATE_V4,'r');try{await directory.sync();}finally{await directory.close();}
 }finally{bytes.fill(0);}
}

export async function publishOriginalPrebirthFinancialStateV5(locators){
 const backend=await original('packages/backend/src/operations/recovery/paged-public-prebirth-financial-state-v5.mjs');
 const result=await backend.readOriginalPagedPublicPrebirthFinancialStateV5(locators);
 assert.equal(result?.profile,'ORIGINAL_PAGED_PUBLIC_PREBIRTH_FINANCIAL_STATE_V5');assert.ok(hex(result.operatorConfigurationSHA256));
 assert.equal(result.descriptorIssued,false);assert.equal(result.financialSourcePermissionIssued,false);assert.equal(result.transactionsBroadcast,0);
 await publishState(result.financialState,{operatorConfigurationSHA256:result.operatorConfigurationSHA256,descriptorIssued:false});
 return {profile:result.profile,operatorConfigurationSHA256:result.operatorConfigurationSHA256,descriptorIssued:false,financialSourcePermissionIssued:false,transactionsBroadcast:0};
}

export async function readPendingPrebirthFinancialReviewV5(){
 let bytes;
 try{
  try{bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,PREBIRTH_FINANCIAL_REVIEW_FILE_V5);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  const review=JSON.parse(bytes.toString('utf8'));exact(review,['intentId','expectedCheckpoint','expectedEpochId','policy','limits']);
  assert.ok(hex(review.intentId)&&(review.expectedEpochId===null||hex(review.expectedEpochId)),'PAEG_PREBIRTH_REVIEW_ID');assert.ok(review.expectedCheckpoint&&typeof review.expectedCheckpoint==='object'&&!Array.isArray(review.expectedCheckpoint));
  const data=await original('packages/backend/src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs');data.normalizeSourceFinancialPolicyDataV5(review.policy);
  exact(review.limits,['maximumTotalSuccessorPools','maximumSourcesPerWallet',...(Object.hasOwn(review.limits??{},'maximumTotalMixedSources')?['maximumTotalMixedSources']:[])]);for(const value of Object.values(review.limits))assert.ok(typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&BigInt(value)<=16n,'PAEG_PREBIRTH_REVIEW_QUOTA');
  return review;
 }finally{bytes?.fill(0);}
}

export async function acknowledgeOriginalPrebirthFinancialReviewV5(product,review){
 const backend=await original('packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs');
 const state=await backend.readOriginalPagedPublicNativeFinancialStateV5(product);
 assert.equal(state?.profile,'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5');assert.ok(state.epoch&&state.epoch.nonce===review.intentId&&hex(state.epoch.epochId),'PAEG_PREBIRTH_ORIGINAL_ACK');assert.deepEqual(state.epoch.policy,review.policy);assert.deepEqual(state.epoch.limits,review.limits);
 const ack={profile:'ORIGINAL_PUBLIC_PREBIRTH_FINANCIAL_EPOCH_ACK_V5',intentId:review.intentId,epochId:state.epoch.epochId,epoch:state.epoch.epoch,expiresAt:state.effectivePolicy.expiresAt,descriptorIssued:true};assert.equal(ack.expiresAt,review.policy.expiresAt);
 const name='initial-source-financial-ack-'+review.intentId+'.json',bytes=Buffer.from(JSON.stringify(ack)+'\n');
 try{await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name,bytes);}catch(error){if(error.code!=='EEXIST')throw error;const existing=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name);try{assert.deepEqual(JSON.parse(existing.toString('utf8')),ack,'PAEG_PREBIRTH_ACK_CHANGED');}finally{existing.fill(0);}}finally{bytes.fill(0);}
 await publishState(state,{descriptorIssued:true});return ack;
}
