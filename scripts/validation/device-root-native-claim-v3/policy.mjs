/** Scoped receipt policy. Data checks grant no runtime, note or proof authority. */
import assert from 'node:assert/strict';
export const PROFILE='device-root-btc-original-note-exit-v3';
export const RESULT='LIANUM_DEVICE_ROOT_BTC_ORIGINAL_NOTE_EXIT_RESULT_V3';
export const REVIEWED_RELEASE=null;
const hex=v=>assert.match(v,/^[0-9a-f]{64}$/),id=v=>assert.match(v,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export function assertRelease(){assert.equal(arguments.length,0);assert.deepEqual(REVIEWED_RELEASE,{schema:'REVIEWED_DEVICE_ROOT_BTC_ORIGINAL_NOTE_EXIT_V3',profile:PROFILE,relations:['deposit_intent','native_claim_ingress','withdraw_balance','native_claim_discharge'],sameRuntimeObservationOnlyRestart:true,localOnly:true,nativeCustody:'BACKEND_LOCAL_QUORUM',noteCustody:'DEVICE_ROOT_NOTE'},'DEVICE_ROOT_BTC_RELEASE_REQUIRED');}
export function assertResult(v){
 assert.equal(arguments.length,1);assert.equal(v.format,RESULT);assert.equal(v.profile,PROFILE);assert.equal(v.phase,'completed');assert.equal(v.success,true);assert.equal(v.interrupted,false);assert.equal(v.sourceUnchanged,true);
 for(const k of ['localOnly','fakeFundsOnly','originalDeviceRootBtcNoteExitEstablished','originalDeviceRootObservationRestartEstablished','originalDeviceRootCommonStateEstablished'])assert.equal(v[k],true,k);
 for(const k of ['publicNetwork','physicalPhoneEstablished','reactRendererEstablished','nativeSelfCustody','independentOperators','fullWalletAcceptance','nativeProcessRestartEstablished','wholeBackendCrashRecoveryEstablished','crossNetworkGraphAcceptance'])assert.equal(v[k],false,k);
 assert.equal(v.noteCustody,'DEVICE_ROOT_NOTE');assert.equal(v.nativeCustody,'BACKEND_LOCAL_QUORUM');assert.deepEqual(v.proofs.map(p=>p.relation),['deposit_intent','native_claim_ingress','withdraw_balance','native_claim_discharge']);
 for(const p of v.proofs){hex(p.proofSHA256);hex(p.publicInputsSHA256);assert.equal(p.evidence.selfVerified??p.evidence.worker?.verified,true);assert.equal(p.evidence.resourceReceiptCompleted,true);}
 for(const p of v.proofs.filter(p=>p.relation!=='withdraw_balance')){id(p.evidence.runId);id(p.evidence.jobId);hex(p.evidence.manifestSHA256);hex(p.evidence.resultSHA256);hex(p.evidence.resourcesSHA256);}
 const w=v.proofs[2].evidence;assert.equal(w.mode,'withdraw_balance');assert.equal(w.acceptedResult,true);assert.deepEqual(w.exit,{code:0,signal:null});assert.equal(w.worker.publicInputCount,39);
 const n=v.note;hex(n.commitment);hex(n.nullifier);assert.equal(n.before.state,'LIVE');assert.equal(n.before.path.leaf,n.commitment);assert.equal(n.before.available,v.amountAtomic);assert.equal(n.after.state,'SPENT');assert.equal(n.after.available,null);assert.equal(n.after.path.leaf,n.commitment);
 assert.equal(v.withdrawal.stage,'CONFIRMED');assert.equal(v.withdrawal.statement.commitment,n.commitment);assert.equal(v.withdrawal.statement.nullifier,n.nullifier);assert.equal(v.withdrawal.proofSHA256,v.proofs[2].proofSHA256);
 assert.equal(v.redemption.status,'DISCHARGED');assert.equal(v.redemption.requestId,v.redemptionBeforeRestart.requestId);assert.equal(v.redemption.ticketId,v.redemptionBeforeRestart.ticketId);
 assert.equal(v.restart.observationOnly,true);assert.equal(v.restart.sameOriginalRuntime,true);assert.equal(v.restart.keeperChildRestarted,true);assert.equal(v.restart.sameDescriptor,true);
 assert.deepEqual(v.loss.actions,['WITHDRAW_W39','PAYOUT_NATIVE']);assert.equal(v.loss.sdkBothReportedUnknown,true);assert.equal(v.loss.withdrawPosts,1);assert.equal(v.loss.payoutPosts,1);assert.equal(v.loss.proofCountBeforeRestart,4);assert.equal(v.loss.proofCountAfterRestart,4);assert.equal(v.loss.effectsAfterRestart,0);
 assert.equal(v.mobile.nodeAesGcm,true);assert.equal(v.mobile.nodeCryptographicEntropy,true);assert.equal(v.mobile.ciphertextPersisted,true);assert.equal(v.mobile.rootPersistedToFile,false);assert.equal(v.mobile.secureStoreHardware,false);assert.equal(v.mobile.biometricHardware,false);assert.equal(v.mobile.physicalPhoneEstablished,false);
 assert.equal(v.economic.sameBirthIdentity,true);assert.equal(v.economic.sameAsset,true);assert.equal(v.economic.availableAfter,'0');assert.equal(v.economic.requestsConfirmed,true);
 return{originalDeviceRootBtcNoteExitEstablished:true,originalDeviceRootObservationRestartEstablished:true,originalDeviceRootCommonStateEstablished:true,physicalPhoneEstablished:false,nativeSelfCustody:false,independentOperators:false,fullWalletAcceptance:false,wholeBackendCrashRecoveryEstablished:false};
}
