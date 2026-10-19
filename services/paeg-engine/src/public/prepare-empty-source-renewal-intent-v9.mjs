/** Prepare private renewal DATA from an authenticated CAPTURED reader.
 * An explicit UTC period is required; this command never opens a signer. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {unlink} from 'node:fs/promises';
import {normalizeOperationWindowDataV17,assertOperationWindowPolicyDataV17} from '@lianum/backend/chains/public-testnet/sepolia-operation-window-data-v17';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PUBLIC_OPERATOR_STATE_V4,readPrivateOperatorFileV4,writePrivateOperatorFileV4} from './public-operator-state-v4.mjs';
import {normalizeEmptySourceRenewalIntentDataV9,prepareEmptySourceFinancialReviewDataV9} from './empty-source-financial-review-v9.mjs';
const continuity=process.argv.length===5&&process.argv[4]==='--continuity-v17';assert.ok(process.argv.length===4||continuity);assert.match(process.argv[2],/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);const maximumSourcesPerWallet=process.argv[3];assert.match(maximumSourcesPerWallet,/^[1-9][0-9]*$/);assert.ok(BigInt(maximumSourcesPerWallet)<=16n);assert.ok(process.getuid()>0);assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const expiresAt=Date.parse(process.argv[2]);assert.ok(Number.isSafeInteger(expiresAt));
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url))),load=p=>import(pathToFileURL(join(root,p)).href),sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const name='empty-source-renewal-intent-v9.json';let configuration,supervisor,reader;
async function json(file){const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,file);try{return JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}}
try{
 configuration=await json('operator.json');assert.equal(configuration.supervisorDirectory,join(PUBLIC_OPERATOR_STATE_V4,'supervisor'));
 const R=await load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs'),W=await load('packages/backend/src/operations/recovery/paged-public-source-financial-window-v5.mjs');
 supervisor=await R.openOriginalPagedSourceReadRecoverySupervisorV4({directory:configuration.supervisorDirectory,password:configuration.journal.password});
 const descriptors=await supervisor.sourceDescriptors(),pairings=await supervisor.currentWalletPairings(),matches=pairings.filter(p=>p.devicePublicKey===configuration.devicePublicKey);assert.equal(matches.length,1,'PAEG_EMPTY_RENEWAL_ROOT_PRINCIPAL');const descriptor=descriptors.find(d=>d.pairingId===matches[0].currentPairingId);assert.ok(descriptor,'PAEG_EMPTY_RENEWAL_ROOT_PRINCIPAL');
 reader=await R.consumeOriginalPagedSourceReadRecoveryV4(await supervisor.issueSource(descriptor.pairingId));const state=await W.readOriginalPagedPublicCapturedFinancialStateV5(reader);let intent,retainedReview=null,reused=false;
 const operationWindowV17=continuity?normalizeOperationWindowDataV17(await json('operation-window-approval-v17.json')):null;
 if(operationWindowV17){
  assertOperationWindowPolicyDataV17(operationWindowV17,{...state.effectivePolicy,expiresAt},Date.now());
  // Only an acknowledged old request may be archived. Interrupted/unissued
  // financial intents stay fenced, never silently superseded by a new date.
  let old;try{old=normalizeEmptySourceRenewalIntentDataV9(await json(name));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(old&&old.expiresAt!==expiresAt){
   assert.equal(old.intentId,state.epoch?.nonce,'CONTINUITY_PRIOR_EPOCH');
   const ack=await json('empty-source-live-renewal-ack-'+old.intentId+'.json');
   assert.equal(ack.profile,'ORIGINAL_PUBLIC_EMPTY_SOURCE_LIVE_RENEWAL_RECEIPT_V10');assert.equal(ack.intentId,old.intentId);assert.equal(ack.retainedInLiveProduct,true);assert.equal(ack.financialTransactions,0);assert.equal(ack.sourceRowsSHA256,old.sourceRowsSHA256);
   const archive='empty-source-renewal-intent-before-'+old.intentId+'.json',bytes=Buffer.from(JSON.stringify(old)+'\n');
   try{await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,archive,bytes);}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(await json(archive),old);}finally{bytes.fill(0);}
   assert.deepEqual(await json(name),old);await unlink(join(PUBLIC_OPERATOR_STATE_V4,name));
  }
 }

 try{intent=normalizeEmptySourceRenewalIntentDataV9(await json(name));reused=true;assert.equal(intent.expiresAt,expiresAt,'PAEG_EMPTY_RENEWAL_INTENT_CHANGED');assert.equal(intent.maximumSourcesPerWallet,maximumSourcesPerWallet,'PAEG_EMPTY_RENEWAL_INTENT_CHANGED');if(operationWindowV17)assert.deepEqual(intent.operationWindowV17,operationWindowV17,'CONTINUITY_INTENT_WINDOW_CHANGED');try{retainedReview=await json('empty-source-financial-review-'+intent.intentId+'.json');}catch(error){if(error.code!=='ENOENT')throw error;}}
 catch(error){if(error.code!=='ENOENT')throw error;intent=normalizeEmptySourceRenewalIntentDataV9({profile:'PUBLIC_EMPTY_SOURCE_RENEWAL_INTENT_V9',intentId:randomBytes(32).toString('hex'),expiresAt,previousEpochId:state.epoch?.epochId??null,previousPolicySHA256:sha(state.effectivePolicy),limitsSHA256:sha(state.limits),sourceRowsSHA256:state.checkpoint.dataSHA256,maximumSourcesPerWallet,...(operationWindowV17?{operationWindowV17}:{})});}
 prepareEmptySourceFinancialReviewDataV9(state,intent,retainedReview);if(!reused){const bytes=Buffer.from(JSON.stringify(intent)+'\n');try{await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name,bytes);}finally{bytes.fill(0);}}
 process.stdout.write(JSON.stringify({stage:'EMPTY_SOURCE_RENEWAL_INTENT_PREPARED',intentId:intent.intentId,expiresAt,reused,signaturesIssued:0,financialTransactions:0})+'\n');
}catch(error){process.exitCode=1;const message=typeof error?.message==='string'?error.message.split('\n',1)[0]:'';process.stdout.write(JSON.stringify({stage:'EMPTY_SOURCE_RENEWAL_INTENT_REJECTED',reason:/^[A-Z][A-Z0-9_]{1,120}$/.test(message)?message:'ORIGINAL_CAPTURED_READER_REJECTED',signaturesIssued:0,financialTransactions:0})+'\n');}
finally{if(reader)(await load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs')).closeOriginalPagedSourceReadRecoveryV4(reader);await supervisor?.close();if(configuration)configuration.journal.password=null;}
