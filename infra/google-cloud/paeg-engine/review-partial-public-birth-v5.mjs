/** Exclusive new review for the physically inspected legacy two-library birth.
 * The original configuration and Source policy are preserved byte for byte.
 * No server key signature or transaction is issued by this command. */
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4,writePrivateOperatorFileV4} from '../../../services/paeg-engine/src/public/public-operator-state-v4.mjs';
import {PARTIAL_BOOTSTRAP_REVIEW_FILE_V5,PARTIAL_BOOTSTRAP_MAXIMUM_TOTAL_FEE_V5,normalizePartialBootstrapReviewDataV5} from '../../../services/paeg-engine/src/public/partial-bootstrap-review-data-v5.mjs';
assert.equal(process.argv.length,3);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);
for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_TLS_REJECT_UNAUTHORIZED','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','PYTHONHOME'])assert.equal(process.env[name],undefined);
const checkpointSHA256=process.argv[2];assert.match(checkpointSHA256,/^[a-f0-9]{64}$/);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
try{
 const {inspectOriginalPagedPublicPartialBootstrapV5}=await import(pathToFileURL(join(root,'packages/backend/src/chains/public-testnet/sepolia-partial-bootstrap-inspector-v5.mjs')).href);
 const result=await inspectOriginalPagedPublicPartialBootstrapV5({operatorDirectory:PUBLIC_OPERATOR_STATE_V4,nativeDirectory:PUBLIC_NATIVE_DIRECTORY_V4});
 assert.equal(result.checkpointSHA256,checkpointSHA256,'PAEG_PARTIAL_REVIEW_ORIGINAL_CHECKPOINT_CHANGED');
 assert.ok(BigInt(result.checkpoint.maximumFeeAlreadyReservedAtomic)<BigInt(PARTIAL_BOOTSTRAP_MAXIMUM_TOTAL_FEE_V5),'PAEG_PARTIAL_REVIEW_FEE_ALREADY_EXHAUSTED');
 const review=normalizePartialBootstrapReviewDataV5({operatorDirectory:PUBLIC_OPERATOR_STATE_V4,nativeDirectory:PUBLIC_NATIVE_DIRECTORY_V4,checkpointSHA256,operatorConfigurationSHA256:result.checkpoint.operatorConfigurationSHA256,approval:{maximumTotalFeeAtomic:PARTIAL_BOOTSTRAP_MAXIMUM_TOTAL_FEE_V5,expiresAt:Date.now()+3600000}},true);
 const bytes=Buffer.from(JSON.stringify(review)+'\n');try{await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,PARTIAL_BOOTSTRAP_REVIEW_FILE_V5,bytes);}finally{bytes.fill(0);}
 process.stdout.write(JSON.stringify({profile:'NEW_FIXED_PARTIAL_BOOTSTRAP_REVIEW_DATA_V5',checkpointSHA256,operatorConfigurationSHA256:review.operatorConfigurationSHA256,maximumTotalFeeAtomic:review.approval.maximumTotalFeeAtomic,maximumFeeAlreadyReservedAtomic:result.checkpoint.maximumFeeAlreadyReservedAtomic,paidFeeAlreadyAtomic:result.checkpoint.paidFeeAlreadyAtomic,expiresAt:review.approval.expiresAt,originalConfigurationUnchanged:true,sourcePolicyRenewed:false,signatures:0,transactionsBroadcast:0})+'\n');
}catch{process.stderr.write('{"code":"PAEG_PARTIAL_BIRTH_REVIEW_REJECTED","sourcePolicyRenewed":false,"signatures":0,"transactionsBroadcast":0}\n');process.exitCode=1;}
