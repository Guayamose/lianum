/** Finish the protected, already signed SAME epoch on the live Original product.
 * A successful live receipt never claims a capture or creates a new period.
 * The normal service keeps owning this product after renewal and publishes READY. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4,readPrivateOperatorFileV4,writePrivateOperatorFileV4} from './public-operator-state-v4.mjs';
import {normalizeEmptySourceRenewalIntentDataV9,prepareEmptySourceFinancialReviewDataV9} from './empty-source-financial-review-v9.mjs';
import {publishPrivateFinancialStateDataV5} from './financial-epoch-control-v5.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function privateJSON(name){let bytes;try{bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name);return JSON.parse(bytes.toString('utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}finally{bytes?.fill(0);}}
function checkReceipt(receipt,intent,profile){assert.equal(receipt.profile,profile);assert.equal(receipt.intentId,intent.intentId);assert.equal(receipt.expiresAt,intent.expiresAt);assert.equal(receipt.sourceRowsSHA256,intent.sourceRowsSHA256);assert.equal(receipt.sourceRows,31);assert.deepEqual(receipt.roles,['DEFI_SOURCE7','UNISWAP_SOURCE4']);assert.equal(receipt.financialTransactions,0);assert.equal(receipt.rootAndPhonePreserved,true);}

export async function completeLivePublicEmptySourceRenewalV10(root,product){
 assert.equal(arguments.length,2);
 const rawIntent=await privateJSON('empty-source-renewal-intent-v9.json');if(rawIntent===null)return null;
 const intent=normalizeEmptySourceRenewalIntentDataV9(rawIntent),captured=await privateJSON('empty-source-renewal-ack-'+intent.intentId+'.json');
 if(captured!==null){checkReceipt(captured,intent,'ORIGINAL_PUBLIC_EMPTY_SOURCE_RENEWAL_RECEIPT_V9');return null;}
 const name='empty-source-live-renewal-ack-'+intent.intentId+'.json',retained=await privateJSON(name);
 if(retained!==null)checkReceipt(retained,intent,'ORIGINAL_PUBLIC_EMPTY_SOURCE_LIVE_RENEWAL_RECEIPT_V10');
 const B=await import(pathToFileURL(join(root,'packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs')).href);
 const before=await B.readOriginalPagedPublicNativeFinancialStateV5(product);
 if(retained!==null&&before.epoch?.nonce!==intent.intentId)return null;
 // This startup path can only reaffirm a previously signed, still-current epoch.
 assert.equal(before.epoch?.nonce,intent.intentId,'PAEG_LIVE_RENEWAL_EXISTING_EPOCH_REQUIRED');
 assert.equal(before.effectivePolicy.expiresAt,intent.expiresAt,'PAEG_LIVE_RENEWAL_PERIOD_CHANGED');
 assert.ok(Date.now()<intent.expiresAt,'PAEG_LIVE_RENEWAL_PERIOD_EXPIRED');
 if(retained!==null){
  // The receipt describes the original 31-row renewal, not today's wallet.
  // Corroborate the live Original connections instead of attempting another
  // empty renewal after deposits/payments have legitimately advanced the journal.
  const expectedDeadline=intent.expiresAt-1800000;
  assert.equal(B.readOriginalPagedPublicUniswapMixedConnectionV5(product).descriptor.deadlineMs,expectedDeadline,'PAEG_LIVE_RENEWAL_UNISWAP_WINDOW');
  const connections=await B.readOriginalPagedPublicSepoliaDefiConnectionsV8(product);
  assert.equal(connections.length,2,'PAEG_LIVE_RENEWAL_DEFI_CONNECTIONS');
  for(const connection of connections)assert.equal(connection.paegSource.descriptor.deadlineMs,expectedDeadline,'PAEG_LIVE_RENEWAL_DEFI_WINDOW');
  return null;
 }
 const sourcePath=join(PUBLIC_NATIVE_DIRECTORY_V4,'source-operations','native-wallet.json'),dispatchPath=join(PUBLIC_NATIVE_DIRECTORY_V4,'dispatch-journal','native-wallet.json');
 const sourceBefore=await readFile(sourcePath),rows=JSON.parse(sourceBefore);
 assert.equal(rows.operations.length,31);assert.ok(rows.operations.every(row=>row.phase==='FINALIZED'));assert.equal(hash(rows.operations),intent.sourceRowsSHA256,'PAEG_LIVE_RENEWAL_SOURCE_CHANGED');
 const dispatchBefore=await readFile(dispatchPath);assert.deepEqual(JSON.parse(dispatchBefore).operations,[]);
 const rootConnection=B.readOriginalPagedPublicNativeConnectionV4(product),phoneConnection=B.readOriginalPagedPublicNativePhoneConnectionV4(product);
 const review=prepareEmptySourceFinancialReviewDataV9(before,intent,await privateJSON('empty-source-financial-review-'+intent.intentId+'.json'));
 const after=await B.authorizeOriginalPagedPublicNativeFinancialEpochV5(product,review);
 for(const key of ['epoch','effectivePolicy','limits','reserved'])assert.deepEqual(after[key],before[key],'PAEG_LIVE_RENEWAL_FINANCIAL_SCOPE_CHANGED');
 await publishPrivateFinancialStateDataV5(after);
 const renewal=await B.renewOriginalPagedPublicEmptyMixedSourcesV9(product);
 assert.equal(renewal.profile,'ORIGINAL_PAGED_PUBLIC_EMPTY_MIXED_RENEWAL_V9');assert.equal(renewal.financialTransactions,0);
 assert.deepEqual(renewal.renewedSources.map(row=>row.role).sort(),['DEFI_SOURCE7','UNISWAP_SOURCE4']);
 assert.deepEqual(B.readOriginalPagedPublicNativeConnectionV4(product),rootConnection,'PAEG_LIVE_RENEWAL_ROOT_CHANGED');
 assert.deepEqual(B.readOriginalPagedPublicNativePhoneConnectionV4(product),phoneConnection,'PAEG_LIVE_RENEWAL_PHONE_CHANGED');
 assert.deepEqual(await readFile(sourcePath),sourceBefore,'PAEG_LIVE_RENEWAL_SOURCE_CHANGED');
 assert.deepEqual(await readFile(dispatchPath),dispatchBefore,'PAEG_LIVE_RENEWAL_DISPATCH_CHANGED');
 const receipt={profile:'ORIGINAL_PUBLIC_EMPTY_SOURCE_LIVE_RENEWAL_RECEIPT_V10',intentId:intent.intentId,expiresAt:intent.expiresAt,roles:renewal.renewedSources.map(row=>row.role).sort(),sourceRows:31,sourceRowsSHA256:intent.sourceRowsSHA256,financialTransactions:0,rootAndPhonePreserved:true,retainedInLiveProduct:true};
 if(retained!==null)assert.deepEqual(retained,receipt,'PAEG_LIVE_RENEWAL_RECEIPT_CHANGED');
 else{const bytes=Buffer.from(JSON.stringify(receipt)+'\n');try{await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name,bytes);}finally{bytes.fill(0);}}
 return Object.freeze(receipt);
}
