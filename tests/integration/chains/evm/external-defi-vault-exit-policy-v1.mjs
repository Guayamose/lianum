/** Fixed source-review release plus original financial and reopen evidence.
 * These metadata joins grant no new proof, key, execution or consent authority. */
import assert from 'node:assert/strict';
import {assertAavePrivateGraphResultV1,AAVE_PRIVATE_GRAPH_RELATIONS_V1} from './aave-private-graph-policy-v1.mjs';
// SOURCE REVIEW ONLY: enables the two fixed local genuine callers below.
// It is neither an economic receipt nor GRAPH/abrupt-crash recovery acceptance.
export const EXTERNAL_VAULT_EXIT_RECOVERY_RELEASE_V1=Object.freeze({profile:'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_BACKEND_V1',protocols:Object.freeze(['OFFICIAL_METAMORPHO_V1','OFFICIAL_AAVE_STATIC_V1']),localOnly:true,fakeFundsOnly:true,sourceReviewOnly:true,privateGraphRecoveryEstablished:false,abruptCrashRecoveryEstablished:false,publicNetwork:false});
export function assertExternalVaultExitRecoveryReleaseV1(){assert.equal(arguments.length,0);const r=EXTERNAL_VAULT_EXIT_RECOVERY_RELEASE_V1;assert.ok(r,'EXTERNAL_VAULT_EXIT_SOURCE_REVIEW_REQUIRED');assert.deepEqual(r,{profile:'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_BACKEND_V1',protocols:['OFFICIAL_METAMORPHO_V1','OFFICIAL_AAVE_STATIC_V1'],localOnly:true,fakeFundsOnly:true,sourceReviewOnly:true,privateGraphRecoveryEstablished:false,abruptCrashRecoveryEstablished:false,publicNetwork:false});return r;}
const digest=value=>assert.match(value,/^[0-9a-f]{64}$/);
export function assertExternalVaultExitRecoveryAuditV1(row){
 assert.equal(arguments.length,1);assert.equal(row.profile,'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_BACKEND_V1');
 for(const name of ['bornBeforeFunding','originalSectionsStoppedBeforeReopen','newBackendPID','newOriginalCatalogue','newOriginalVault','newOriginalExitService','sameOriginalReceipt','originalExitRequestIdsRetained','originalCatalogueRequestIdsRetained'])assert.equal(row[name],true,'EXTERNAL_VAULT_REOPEN_JOIN');
 for(const name of ['originalGraphRecoveryEstablished','abruptCrashRecoveryEstablished','parentProcessExitEstablished'])assert.equal(row[name],false,'EXTERNAL_VAULT_REOPEN_SCOPE');
 assert.ok(['METAMORPHO','AAVE_STATIC'].includes(row.variant));assert.ok(Number.isSafeInteger(row.actualWireCountBefore)&&row.actualWireCountBefore>0);assert.equal(row.actualWireCountAfter,row.actualWireCountBefore,'EXTERNAL_VAULT_DUPLICATE_WIRE');
 assert.deepEqual(row.catalogueRequestIds,['vault_exit_0','vault_exit_1']);assert.deepEqual(row.exitRequestIds,['vault_exit_1']);assert.deepEqual(row.catalogueStates,['CONFIRMED','CONFIRMED']);assert.equal(row.exitPhase,'REDEEMED');
 for(const name of ['catalogueIdentitySHA256','receiptSHA256','redemptionReferenceSHA256','exitIdentitySHA256'])digest(row[name]);
 return{retainedOriginalVaultExitRecovery:true,privateGraphRecoveryEstablished:false,abruptCrashRecoveryEstablished:false};
}
export function assertExternalDefiVaultExitRecoveryResultV1(result){
 assert.equal(arguments.length,1);assert.equal(result.format,'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1');assert.equal(result.phase,'completed');assert.equal(result.success,true);
 assert.ok(['OFFICIAL_AAVE_STATIC_V1','OFFICIAL_METAMORPHO_V1'].includes(result.protocolProfile));if(result.protocolProfile==='OFFICIAL_AAVE_STATIC_V1')assertAavePrivateGraphResultV1(result);
 for(const key of ['localOnly','fakeFundsOnly','sourceUnchanged','sourceFundingConfirmed','sourcePrivateReservationEstablished','privatePAEGConversionEstablished','originalNotesRecoveredOnce','ownerPrivateExitsAccepted','solverPayoutRecoveredAndExitedOnce','privateOutputExitEstablished','privateExitsAndUnderlyingRedemption','duplicateNoEffect'])assert.equal(result[key],true);
 for(const key of ['publicNetwork','systemicPrivacyAcceptance','independentOperators','realClockFinalityAcceptance','performanceTargetAchieved','fullWalletAcceptance'])assert.equal(result[key],false);
 assert.deepEqual(result.proofs.map(row=>row.relation),AAVE_PRIVATE_GRAPH_RELATIONS_V1);assert.equal(new Set(result.proofs.map(row=>row.proofSHA256)).size,15);assert.equal(result.nativeEffects.evmVault,1);
 const r=result.externalVaultBackendRecovery;assert.equal(r.profile,'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_BACKEND_V1');assert.equal(r.variant,result.protocolProfile==='OFFICIAL_AAVE_STATIC_V1'?'AAVE_STATIC':'METAMORPHO');
 for(const key of ['bornBeforeFunding','originalSectionsStoppedBeforeReopen','newBackendPID'])assert.equal(r[key],true);
 for(const key of ['originalGraphRecoveryEstablished','abruptCrashRecoveryEstablished','parentProcessExitEstablished'])assert.equal(r[key],false);
 assert.ok(Number.isSafeInteger(r.originalProcess.pid)&&r.originalProcess.pid>0);assert.ok(Number.isSafeInteger(r.successorProcess.pid)&&r.successorProcess.pid>0);assert.notEqual(r.originalProcess.pid,r.successorProcess.pid);assert.equal(r.successorProcess.ppid,r.originalProcess.pid);assert.equal(r.successorProcess.pgrp,r.originalProcess.pgrp);assert.equal(r.successorProcess.session,r.originalProcess.session);assert.deepEqual(r.successorProcess.uid,r.originalProcess.uid);
 digest(r.sourceSHA256);digest(r.originalRedemptionReceiptSHA256);assert.equal(r.audit.receiptSHA256,r.originalRedemptionReceiptSHA256);assertExternalVaultExitRecoveryAuditV1(r.audit);
 const c=r.successorClosure;for(const key of ['closed','originalBackendStopped','originalChildProcessClosed'])assert.equal(c[key],true);assert.equal(c.processId,r.successorProcess.pid);assert.deepEqual(c.exit,{code:0,signal:null});assert.deepEqual(c.close,c.exit);assert.equal(result.cleanup.closedSuccessor,true);assert.equal(result.cleanup.closedEvm,true);
 return{retainedOriginalVaultExitRecovery:true,originalGraphRecoveryEstablished:false,abruptCrashRecoveryEstablished:false,parentProcessExitEstablished:false,publicNetwork:false,fullWalletAcceptance:false};
}
