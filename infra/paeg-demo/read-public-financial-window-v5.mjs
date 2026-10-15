/** CAPTURED route selection DATA through an actual original read token.
 * Closes the temporary reader before the financial Product may reopen. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function readCapturedOriginalPublicFinancialWindowV5(root,configuration){
 assert.equal(arguments.length,2);const load=path=>import(pathToFileURL(join(root,path)).href);
 const R=await load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs');
 const W=await load('packages/backend/src/operations/recovery/paged-public-source-financial-window-v5.mjs');
 let supervisor,reader;
 try{
  supervisor=await R.openOriginalPagedSourceReadRecoverySupervisorV4({directory:configuration.supervisorDirectory,password:configuration.journal.password});
  const descriptors=await supervisor.sourceDescriptors();assert.ok(Array.isArray(descriptors)&&descriptors.length>0,'PAEG_FINANCIAL_WINDOW_SOURCE_COUNT');
  const pairings=await supervisor.currentWalletPairings(),current=pairings.filter(value=>value.devicePublicKey===configuration.devicePublicKey);assert.equal(current.length,1,'PAEG_FINANCIAL_WINDOW_HOST_IDENTITY');
  const matches=descriptors.filter(value=>value.pairingId===current[0].currentPairingId&&value.devicePublicKey===configuration.devicePublicKey);assert.equal(matches.length,1,'PAEG_FINANCIAL_WINDOW_CURRENT_BINDING');const descriptor=matches[0];
  reader=await R.consumeOriginalPagedSourceReadRecoveryV4(await supervisor.issueSource(descriptor.pairingId));
  const result=await W.readOriginalPagedPublicSourceFinancialWindowV5(reader);assert.equal(result.profile,'ORIGINAL_PAGED_PUBLIC_FINANCIAL_WINDOW_V5');assert.equal(result.financialSourcePermissionIssued,false);assert.ok(Number.isSafeInteger(result.effectiveExpiresAt),'PAEG_FINANCIAL_WINDOW_CLOCK');return result;
 }finally{if(reader)R.closeOriginalPagedSourceReadRecoveryV4(reader);await supervisor?.close();}
}
