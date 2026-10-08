/** Fixed Native12 D26/W39 planned complete economic restart after F; no abrupt-crash, Cloud or
 * phone claim. Historical profiles and their cleanup/receipt meanings remain
 * unchanged. These joins consume public original receipts, never authority. */
import assert from 'node:assert/strict';
import {assertNativeEconomicNoteReceiptV1,NOTE_NATIVE_LINEAGE_V1} from '../../../../packages/engine/src/execution/proofs/note-native-execution-v1.mjs';
import {PRIVATE_RESOURCE_POLICY} from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
import {NATIVE_VALUE_LIVE_V2_SPEC} from '../../../../packages/proofs/src/native-value/metadata/native-value-live-v2-profile.mjs';
import {assertI84NativeReceiptV1} from '../../../../packages/proofs/src/native-value/runtime/native-value-dev-live-v5-native-execution.mjs';
import {assertBtcSolGraphProofReceipts} from '../../claims/development/development-btc-sol-graph-proof-evidence.mjs';
import {assertDeviceOwnerOutputBalanceReadsV1} from './device-owner-execution-native-checks-v1.mjs';
import {DEVICE_RECOVERY_RELATIONS_V1} from './device-owner-recovery-policy-v1.mjs';
export const NATIVE_DEVICE_ECONOMIC_NOTE_PROFILE_V1='native-value-economic-note-recovery-v1';
export const NATIVE_DEVICE_ECONOMIC_NOTE_RESULT_V1='LIANUM_NATIVE_DEVICE_ECONOMIC_NOTE_RECOVERY_RESULT_V1';
// Source-reviewed permission for this one fresh, fake-funded local experiment.
// This publication does not establish a successful economic restart.
export const NATIVE_DEVICE_ECONOMIC_NOTE_REAL_RELEASE_V1=null;
const reviewed=()=>({format:'REVIEWED_LOCAL_NATIVE_DEVICE_ECONOMIC_NOTE_RECOVERY_RELEASE_V1',profile:NATIVE_DEVICE_ECONOMIC_NOTE_PROFILE_V1,
 relations:[...DEVICE_RECOVERY_RELATIONS_V1],captureAfter:'CANONICAL_F_LOST_REPLY_BEFORE_TERMINAL_APPLY',deviceAmountAtomic:'500',refundAtomic:'500',
 sameDeviceVault:true,plannedCaptureOnly:true,noteProofBackend:'NativeUnixSocket',noteProofThreads:12,independentNoteVerification:'Wasm1',localOnly:true,fakeFundsOnly:true,publicNetwork:false,phone:false,abruptCrash:false});
export function assertNativeDeviceEconomicNoteReleaseV1(){assert.equal(arguments.length,0);assert.deepEqual(NATIVE_DEVICE_ECONOMIC_NOTE_REAL_RELEASE_V1,reviewed(),'NATIVE_DEVICE_ECONOMIC_NOTE_RELEASE_ABSENT_OR_CHANGED');}
export function assertNativeDeviceEconomicNoteResultV1(r){
 assert.equal(arguments.length,1);assert.equal(r.format,NATIVE_DEVICE_ECONOMIC_NOTE_RESULT_V1);assert.equal(r.profile,NATIVE_DEVICE_ECONOMIC_NOTE_PROFILE_V1);
 for(const key of['success','sourceUnchanged','nativeEconomicNoteProofsNodeAcceptance','nativeDeviceEconomicRestartNodeAcceptance','deviceOwnerD26NodeAcceptance','deviceOwnerUSNodeAcceptance',
  'deviceOwnerNativeRecoveryNodeAcceptance','nativeGraphAcceptance','nativeProcessRestartEstablished'])assert.equal(r[key],true,key);
 assert.equal(r.phase,'completed');assert.equal(r.nativeExecution,'ORIGINAL_DEVICE_NATIVE_EXECUTOR_V1');assert.equal(r.nativeDeliveryCount,1);
 for(const key of['publicNetwork','keeperLossRecoveryEstablished','mobileNoteCustodyEstablished','tlsEstablished','reactRendererEstablished','physicalPhoneEstablished',
  'mobilePortfolioEstablished','independentInfrastructureEstablished','fullWalletAcceptance'])assert.equal(r[key],false,key);
 assert.deepEqual(r.proofs.map(p=>p.relation),DEVICE_RECOVERY_RELATIONS_V1);assert.equal(new Set(r.proofs.map(p=>p.proofSHA256)).size,9);
 assert.equal(new Set(r.proofs.map(p=>p.evidence.runId??p.evidence.id)).size,9);
 for(const[index,amount]of[[0,'500'],[7,'400'],[8,'100']]){const p=r.proofs[index],e=p.evidence;
  assert.equal(p.publicWords,index===0?26:39);assert.equal(p.amountAtomic,amount);assert.deepEqual(e.policy,PRIVATE_RESOURCE_POLICY);
  assert.equal(e.phase,'completed');assert.equal(e.acceptedResult,true);assert.equal(e.resourceReceiptCompleted,true);
  assert.equal(e.zeroKnowledgeEnabled,true);assert.equal(e.worker.verified,true);assert.equal(e.worker.zeroKnowledgeEnabled,true);
  assert.equal(e.worker.proofSHA256,p.proofSHA256);assert.equal(e.worker.publicInputsSHA256,p.publicInputsSHA256);
  assert.equal(e.keySHA256,r.artifacts.noteKeys[p.relation]);
  for(const[key,pin]of Object.entries(NOTE_NATIVE_LINEAGE_V1[p.relation]))assert.equal(e[key],pin,'DEVICE_ECONOMIC_NOTE_ORIGINAL_LINEAGE');
  assert.equal(e.threads,12);assert.equal(e.maximumPages,null);assert.equal(e.preparedMaximumPages,32768);
  assert.equal(e.lockPreserved,false);assert.deepEqual(e.exit,{code:0,signal:null});
  assertNativeEconomicNoteReceiptV1(p.relation,e.worker,e);}
 for(const p of r.proofs.filter(p=>['authorization','reservation','dependency','ready','recovery'].includes(p.relation))){const e=p.evidence;
  assertBtcSolGraphProofReceipts({relation:p.relation,runId:e.runId,jobId:e.jobId,manifest:e.manifest,result:e.result,resources:e.resources,
   proofSHA256:p.proofSHA256,publicInputsSHA256:p.publicInputsSHA256,manifestSHA256:e.manifestSHA256,resultSHA256:e.resultSHA256,resourcesSHA256:e.resourcesSHA256});
  assert.equal(e.keySHA256,r.artifacts.graphKeys[p.relation]);}
 const i=r.proofs[5],ie=i.evidence;assert.equal(i.publicWords,84);assert.equal(i.originalCanonicalCall,true);assert.equal(i.deployedVerifierAccepted,true);
 assert.equal(ie.keySHA256,r.artifacts.admissionKey);assert.equal(ie.programSHA256,r.artifacts.admissionProgram);
 for(const receipt of[ie.manifest,ie.result,ie.resources]){assert.equal(receipt.runId,ie.runId);assert.equal(receipt.jobId,ie.jobId);assert.equal(receipt.runtimePinsSHA256,ie.runtimePinsSHA256);}
 assert.equal(ie.manifest.proofSHA256,i.proofSHA256);assert.equal(ie.manifest.publicInputsSHA256,i.publicInputsSHA256);
 if(ie.result.nativeBackendExecution)assertI84NativeReceiptV1(NATIVE_VALUE_LIVE_V2_SPEC,ie.result,ie.resources);
 else{assert.equal(ie.result.maximumPages,65536);assert.equal(ie.result.threads,1);}
 assert.equal(ie.result.keyRecomputed,false);assert.equal(ie.result.keyGenerated,false);assert.equal(ie.result.selfVerified,true);assert.equal(ie.result.backendDestroyed,true);
 assert.equal(ie.result.witnessPersisted,false);assert.equal(ie.result.phase,'completed');assert.equal(ie.resources.phase,'completed');assert.equal(ie.resources.failure,null);
 assert.deepEqual(ie.resources.failures,[]);assert.equal(ie.resources.exitCode,0);assert.equal(ie.resources.signal,null);assert.equal(ie.resources.lockPreserved,false);
 const d=r.deviceNote;assert.equal(d.observation.amount,'500');assert.equal(d.transportKeyDifferentFromNoteKey,true);assert.equal(d.custodyWitnessPrivateKeyAbsent,true);
 assert.equal(d.originalSignedWireCount,1);assert.equal(d.fundReplayRejected,true);assert.equal(d.explicitFreshFundingRejected,true);assert.equal(d.signedConsentByteJoin,true);
 assert.equal(d.tlsVersion,'TLSv1.3');assert.equal(d.unrelatedOwnerCredit,'0');assert.equal(d.observation.commitment,d.localCommitment);
 const s=r.deviceReservation;assert.equal(s.originalReservationWireCount,1);assert.equal(s.sameOriginalD26Opening,true);assert.equal(s.noLinuxAdoption,true);
 for(const key of['proofReplayRejected','reserveReplayRejected','freshObservationRepeatedWithoutEffects'])assert.equal(s[key],true);
 assert.equal(s.observation.sourceCommitment,d.localCommitment);assert.equal(s.observation.sourceNullifier,d.observation.nullifier);assert.equal(s.receipt.status,'0x1');
 assert.equal(s.proofHttp.admittedPosts,1);assert.ok([200,504].includes(s.proofHttp.status));assert.equal(s.proofHttp.automaticRetry,false);assert.equal(s.pendingSourceAvailable,null);
 const c=r.deviceCustody;for(const key of['encryptedReadbackBeforeU','reopenedBeforeS','originalSReceiptEncrypted','reopenedAfterS'])assert.equal(c[key],true);
 assert.equal(c.changeAmount,'400');assert.equal(c.recoveryAmount,'100');assert.equal(c.sameSourceCommitment,d.localCommitment);assert.equal(c.sameSourceNullifier,d.observation.nullifier);
 for(const evidence of[c.beforeU,c.afterReopen,c.afterOriginalS,c.afterSReopen])assert.ok(evidence.ciphertextPersisted&&evidence.maximumStoredValueBytes<=2048);
 const f=r.deviceRecovery;assert.equal(f.controlledFailure,'DEVICE_NATIVE_FIXED_BEFORE_N0');assert.equal(f.originalNativeAdmissionBeforeFailure,true);assert.equal(f.noNodeOrSettlement,true);
 assert.equal(f.recoveryOriginalAdmittedPosts,1);assert.equal(f.clientUnknown,true);assert.equal(f.automaticRetry,false);assert.equal(f.recoveryIntentBeforePost,true);
 assert.ok([200,504].includes(f.recoveryHttpStatus));assert.ok(BigInt(f.receiverBeforeCutoff)<BigInt(f.originalCutoff));assert.equal(f.originalCutoff,s.statement.settleBefore);
 assert.equal(r.originalExecutionFailure.retainedState.admittedReceipts,1);assert.equal(r.originalExecutionFailure.retainedState.executionStarted,true);
 const restart=r.deviceEconomicRestart;assert.equal(restart.profile,'ORIGINAL_PLANNED_NATIVE_DEVICE_RESTART_V1');assert.match(restart.sourceSHA256,/^[a-f0-9]{64}$/);
 for(const key of['originalSectionsStoppedBeforeReopen','parentDeviceVaultRetained','noPreCaptureReproof','sameOriginalSAndF','successorClosed','freshSignedReconciliationAfterReopen'])assert.equal(restart[key],true);
 assert.equal(restart.parentProcessExitEstablished,false);assert.equal(restart.abruptCrashRecoveryEstablished,false);assert.equal(restart.originalProofsBeforeRestart,7);assert.equal(restart.originalProofsAfterRestart,9);
 assert.notEqual(restart.originalProcess.pid,restart.successorProcess.pid);assert.equal(restart.successorProcess.ppid,restart.originalProcess.pid);
 for(const key of['pgrp','session'])assert.equal(restart.successorProcess[key],restart.originalProcess[key]);
 assert.equal(restart.receipt.processId,restart.successorProcess.pid);assert.equal(restart.receipt.sourceSHA256,restart.sourceSHA256);
 for(const key of['originalProcessLifetimeDifferent','originalSectionsStoppedBeforeCheckpoint','issuerClosed'])assert.equal(restart.receipt[key],true);
 assert.equal(restart.before.proofCount,7);assert.equal(restart.before.nativeWireCount,1);
 for(const resource of[restart.stoppedOriginals.receiver,restart.stoppedOriginals.native]){assert.equal(resource.stopped,true);assert.equal(resource.exitObserved,true);assert.equal(resource.exitCode,0);assert.equal(resource.signal,null);}
 assert.equal(restart.stoppedOriginals.owner.childExited,true);assert.equal(restart.stoppedOriginals.owner.closed,true);
 assert.equal(restart.stoppedOriginals.transport.closed,true);assert.equal(restart.stoppedOriginals.transport.ownedSocketsRemaining,0);
 const n=r.deviceNative;assert.equal(n.jobId,s.jobId);assert.equal(n.originalSHash,s.observation.transactionHash);assert.equal(n.originalFundingHash,d.observation.transactionHash);
 assert.equal(n.terminal.outcome,'RECOVERED');assert.equal(n.executionSnapshot.outcome,'RECOVERED');assert.equal(n.executionSnapshot.admittedReceipts,1);
 assert.equal(n.receipt.status,'0x1');assert.equal(n.receipt.transactionHash,'0x'+n.terminal.transactionHash);assert.equal(n.originalExecuteAdmittedPosts,1);
 assert.equal(n.executeHttpPosts,2);assert.equal(n.executeRejectedPostCount,1);assert.equal(n.recoveryRejectedPostCount,1);assert.equal(n.repeatedTerminalWrites,0);
 for(const key of['repeatedReconciliationNoEffects','duplicateExecuteRejected','recoveryAfterTerminalRejected','localOpeningsPreserved','terminalEncrypted','terminalReopened'])assert.equal(n[key],true);
 assert.equal(n.nativeWire.amountAtomic,'1000000');assert.equal(n.nativeWire.recipientDeltaAtomic,'1000000');assert.equal(BigInt(n.nativeWire.senderDeltaAtomic),1000000n+BigInt(n.nativeWire.gasCostAtomic));
 assert.equal(r.deviceRecoveryExits.length,2);
 for(const[index,role,amount]of[[0,'change','400'],[1,'recovery','100']]){const x=r.deviceRecoveryExits[index],p=r.proofs[7+index];
  assert.equal(x.noteRole,role);assert.equal(x.parentJobId,s.jobId);assert.equal(x.statement.amount,amount);assert.equal(x.statement.commitment,c[role+'Commitment']);
  assert.equal(x.statement.nullifier,x.observation.nullifier);assert.equal(x.receipt.transactionHash,'0x'+x.observation.transactionHash);assert.equal(x.receipt.status,'0x1');
  assert.equal(x.proofSHA256,p.proofSHA256);assert.equal(x.publicInputsSHA256,p.publicInputsSHA256);assert.equal(x.originalWithdrawalAdmittedPosts,1);
  assert.ok([1,2].includes(x.withdrawalHttpPosts));assert.equal(x.withdrawalRejectedReplayPostCount,x.withdrawalHttpPosts-1);assert.equal(x.confirmedWithdrawalChallengeRejected,true);
  assert.equal(x.originalWithdrawalWireCount,1);assert.ok([200,504].includes(x.withdrawalHttpStatus));assert.equal(x.recipientDeltaAtomic,amount);assert.equal(x.repeatedLocalWrites,0);
  for(const key of['witnessPrivateKeyAbsent','encryptedSignedIntentBeforeProof','intentReopenedAfterProof','canonicalReceiptEncrypted','receiptReopened','duplicateProofRejected','duplicateWithdrawalRejected'])assert.equal(x[key],true);}
 assertDeviceOwnerOutputBalanceReadsV1(r,true);
 assert.deepEqual(r.economics,{deviceAmountAtomic:'500',reserveAtomic:'100',changeWithdrawalAtomic:'400',recoveryWithdrawalAtomic:'100',fullOwnerRefundAtomic:'500',recoveryIsSubsetOfReserve:true,
  solverPayoutAtomic:'0',poolActualAtomic:'0',poolBackedAtomic:'0',liveReservations:0,nativeDeliveryAmountAtomic:'1000000',nativeDeliveryTransactions:1,
  nativeProviderPrincipalLossAtomic:'1000000',nativeProviderGasLossAtomic:n.nativeWire.gasCostAtomic,sourceSpent:true,changeSpent:true,recoverySpent:true,linuxOwnerAvailableAtomic:'0',solverPayoutExitEstablished:false});
 for(const key of['closedEvm','closedNativeEvm','closedNativeExecution','closedSession','closedAccount','closedOwner','closedBootstrap','closedDeviceProvider','closedDeviceRecipient',
  'closedWalletListener','originalRecoveryStateRetained'])assert.equal(r.cleanup[key],true);
 assert.deepEqual(r.cleanup.errors,[]);assert.equal(r.cleanup.successor.originalBackendStopped,true);assert.equal(r.cleanup.successor.originalChildProcessClosed,true);
 assert.equal(r.cleanup.successor.processId,restart.successorProcess.pid);assert.deepEqual(r.cleanup.successor.exit,{code:0,signal:null});assert.deepEqual(r.cleanup.successor.close,{code:0,signal:null});
 assert.equal(r.cleanup.syntheticAccountStateRemoved,false);assert.equal(r.cleanup.syntheticOwnerStateRemoved,false);assert.equal(r.cleanup.syntheticSessionJournalRemoved,false);
 for(const row of r.cleanup.mobileListeners){assert.equal(row.closed,true);assert.equal(row.ownedSocketsRemaining,0);assert.equal(row.originalDiagnosticsInFlight,0);}
 return{nativeEconomicNoteProofsNodeAcceptance:true,nativeDeviceEconomicRestartNodeAcceptance:true,deviceOwnerNativeRecoveryNodeAcceptance:true,nativeProcessRestartEstablished:true,plannedCaptureOnly:true,
  keeperLossRecoveryEstablished:false,nativeGraphAcceptance:true,nativeDeliveryCount:1,mobileNoteCustodyEstablished:false,tlsEstablished:false,reactRendererEstablished:false,
  mobilePortfolioEstablished:false,physicalPhoneEstablished:false,fullWalletAcceptance:false};
}
