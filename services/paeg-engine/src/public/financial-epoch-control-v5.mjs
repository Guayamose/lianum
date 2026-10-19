/** Private operator control. The live Original Product remains the sole owner
 * of its receiver and signer. A review file is DATA, never a runtime or grant. */
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {rename,open,lstat} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {PUBLIC_OPERATOR_STATE_V4,assertPrivateOperatorDirectoryV4,readPrivateOperatorFileV4,writePrivateOperatorFileV4} from './public-operator-state-v4.mjs';
export const FINANCIAL_EPOCH_REVIEW_FILE_V5='financial-epoch-review-v5.json';
export const FINANCIAL_EPOCH_STATE_FILE_V5='financial-epoch-state-v5.json';
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const original=path=>import(pathToFileURL(join(root,path)).href);
const handles=new WeakMap(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const exact=(x,fields)=>{assert.ok(x&&typeof x==='object'&&!Array.isArray(x),'PAEG_FINANCIAL_REVIEW_OBJECT');assert.deepEqual(Object.keys(x).sort(),[...fields].sort(),'PAEG_FINANCIAL_REVIEW_FIELDS');return x;};
function reviewData(raw,normalizePolicy,normalizeLimits){
 exact(raw,['intentId','expectedCheckpoint','expectedEpochId','policy','limits']);assert.ok(hex(raw.intentId)&& (raw.expectedEpochId===null||hex(raw.expectedEpochId)),'PAEG_FINANCIAL_REVIEW_ID');
 assert.ok(raw.expectedCheckpoint&&typeof raw.expectedCheckpoint==='object'&&!Array.isArray(raw.expectedCheckpoint),'PAEG_FINANCIAL_REVIEW_CHECKPOINT');
 normalizePolicy(raw.policy);normalizeLimits(raw.limits);return raw;
}
async function replacePrivateState(name,bytes){
 assert.ok(name===FINANCIAL_EPOCH_STATE_FILE_V5&&Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=65536,'PAEG_FINANCIAL_STATE_BYTES');await assertPrivateOperatorDirectoryV4(PUBLIC_OPERATOR_STATE_V4);
 try{const s=await lstat(join(PUBLIC_OPERATOR_STATE_V4,name));assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600,'PAEG_FINANCIAL_STATE_FILE');}catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary='financial-epoch-state-'+randomBytes(16).toString('hex')+'.tmp';await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,temporary,bytes);await rename(join(PUBLIC_OPERATOR_STATE_V4,temporary),join(PUBLIC_OPERATOR_STATE_V4,name));const directory=await open(PUBLIC_OPERATOR_STATE_V4,'r');try{await directory.sync();}finally{await directory.close();}
}
export async function publishPrivateFinancialStateDataV5(state){
 assert.equal(state?.profile,'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5');assert.ok(Array.isArray(state.history),'PAEG_FINANCIAL_STATE_HISTORY');const snapshot={...state,historyCount:state.history.length};delete snapshot.history;const bytes=Buffer.from(JSON.stringify(snapshot)+'\n');try{await replacePrivateState(FINANCIAL_EPOCH_STATE_FILE_V5,bytes);}finally{bytes.fill(0);}
}
export async function openOriginalPublicFinancialEpochControlV5(product,onAuthorized){
 assert.equal(arguments.length,2);assert.ok(typeof onAuthorized==='function','PAEG_FINANCIAL_CALLBACK');
 const backend=await original('packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs');
 const data=await original('packages/backend/src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs');
 let closing=false,tail=Promise.resolve();
 async function publish(){const state=await backend.readOriginalPagedPublicNativeFinancialStateV5(product);await publishPrivateFinancialStateDataV5(state);return state;}
 await publish();
 async function applyReview(){
  assert.ok(!closing,'PAEG_FINANCIAL_CONTROL_CLOSING');let bytes,review;
  try{bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,FINANCIAL_EPOCH_REVIEW_FILE_V5);review=reviewData(JSON.parse(bytes.toString('utf8')),data.normalizeSourceFinancialPolicyDataV5,data.normalizeSourceFinancialEpochLimitsDataV5);
   // The Original issuer checks CAS and idempotent replay. Do not reject its
   // previously signed SAME review merely because the checkpoint advanced.
   const state=await backend.authorizeOriginalPagedPublicNativeFinancialEpochV5(product,review);
   assert.ok(state?.epoch&&state.epoch.nonce===review.intentId&&hex(state.epoch.epochId),'PAEG_FINANCIAL_ORIGINAL_ACK');assert.equal(state.effectivePolicy.expiresAt,review.policy.expiresAt);
   const ack={profile:'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5',intentId:review.intentId,epochId:state.epoch.epochId,epoch:state.epoch.epoch,expiresAt:state.effectivePolicy.expiresAt,financialStepsStarted:false};
   await onAuthorized(ack.expiresAt);
   const ackBytes=Buffer.from(JSON.stringify(ack)+'\n'),name='financial-epoch-ack-'+review.intentId+'.json';try{await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name,ackBytes);}catch(error){if(error.code!=='EEXIST')throw error;const existing=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name);try{assert.deepEqual(JSON.parse(existing.toString('utf8')),ack,'PAEG_FINANCIAL_ACK_CHANGED');}finally{existing.fill(0);}}finally{ackBytes.fill(0);}
   await publish();process.stdout.write(JSON.stringify({stage:'FINANCIAL_EPOCH_AUTHORIZED',...ack})+'\n');return ack;
  }finally{bytes?.fill(0);review=null;}
 }
 function request(){if(closing)return;tail=tail.then(applyReview).catch(error=>{const first=typeof error?.message==='string'?error.message.split('\n')[0]:'';const reason=/^[A-Z][A-Z0-9_]{1,120}$/.test(first)?first:'ORIGINAL_REVIEW_REJECTED';process.stderr.write(JSON.stringify({stage:'FINANCIAL_EPOCH_REVIEW_FAILED',reason,automaticFinancialRetry:false})+'\n');});}
 process.on('SIGUSR1',request);
 const handle=Object.freeze({async refresh(){assert.ok(!closing,'PAEG_FINANCIAL_CONTROL_CLOSING');await tail;return publish();},async close(){if(closing)return;closing=true;process.removeListener('SIGUSR1',request);await tail;}});handles.set(handle,{product});return handle;
}
