/** Fixed short original ARMED restart, never proof of post-cutoff recovery. */
import assert from 'node:assert/strict';
import {assertNativeEconomicNoteReceiptV1,NOTE_NATIVE_LINEAGE_V1} from '@lianum/proofs/execution/note-native-execution-v1';
import {assertBtcSolGraphProofReceipts} from '../../claims/development/development-btc-sol-graph-proof-evidence.mjs';
export const NATIVE_DEVICE_LIVE_ARMED_SHORT_PROFILE_V1='native-value-live-armed-recovery-v1';
export const NATIVE_DEVICE_LIVE_ARMED_SHORT_RESULT_V1='LIANUM_NATIVE_DEVICE_LIVE_ARMED_SHORT_RESULT_V1';
export const NATIVE_DEVICE_LIVE_ARMED_SHORT_RELEASE_V1=Object.freeze({profile:NATIVE_DEVICE_LIVE_ARMED_SHORT_PROFILE_V1,captureAfter:'ORIGINAL_S_AND_FRESH_DEVICE_ARM_BEFORE_CUTOFF',relations:['deposit_balance','authorization','reservation'],localOnly:true,fakeFundsOnly:true,publicNetwork:false,phone:false,postCutoffRecovery:false});
export function assertNativeDeviceLiveArmedShortReleaseV1(){assert.equal(arguments.length,0);assert.deepEqual(NATIVE_DEVICE_LIVE_ARMED_SHORT_RELEASE_V1,{profile:NATIVE_DEVICE_LIVE_ARMED_SHORT_PROFILE_V1,captureAfter:'ORIGINAL_S_AND_FRESH_DEVICE_ARM_BEFORE_CUTOFF',relations:['deposit_balance','authorization','reservation'],localOnly:true,fakeFundsOnly:true,publicNetwork:false,phone:false,postCutoffRecovery:false},'NATIVE_LIVE_ARMED_SHORT_RELEASE_ABSENT_OR_CHANGED');}
export function assertNativeDeviceLiveArmedShortResultV1(r){
 assert.equal(arguments.length,1);assert.equal(r.format,NATIVE_DEVICE_LIVE_ARMED_SHORT_RESULT_V1);assert.equal(r.profile,NATIVE_DEVICE_LIVE_ARMED_SHORT_PROFILE_V1);
 for(const k of ['success','sourceUnchanged','deviceOwnerD26NodeAcceptance','deviceOwnerUSNodeAcceptance','nativeLiveArmedShortRestartNodeAcceptance','nativeProcessRestartEstablished'])assert.equal(r[k],true,k);
 assert.equal(r.phase,'completed');assert.equal(r.nativeDeliveryCount,0);assert.equal(r.nativeExecution,'ORIGINAL_DEVICE_NATIVE_EXECUTOR_V1');
 for(const k of ['nativeGraphAcceptance','keeperLossRecoveryEstablished','physicalPhoneEstablished','mobileNoteCustodyEstablished','fullWalletAcceptance','publicNetwork','postCutoffRecoveryEstablished'])assert.equal(r[k],false,k);
 assert.deepEqual(r.proofs.map(p=>p.relation),['deposit_balance','authorization','reservation']);assert.equal(new Set(r.proofs.map(p=>p.proofSHA256)).size,3);
 const d=r.proofs[0],e=d.evidence;assert.equal(d.publicWords,26);assert.equal(d.amountAtomic,'500');assert.equal(e.keySHA256,r.artifacts.noteKeys.deposit_balance);
 for(const [k,v]of Object.entries(NOTE_NATIVE_LINEAGE_V1.deposit_balance))assert.equal(e[k],v);
 assert.equal(e.phase,'completed');assert.equal(e.acceptedResult,true);assert.equal(e.resourceReceiptCompleted,true);assert.deepEqual(e.exit,{code:0,signal:null});assertNativeEconomicNoteReceiptV1('deposit_balance',e.worker,e);
 assert.equal(e.worker.proofSHA256,d.proofSHA256);assert.equal(e.worker.publicInputsSHA256,d.publicInputsSHA256);
 for(const p of r.proofs.slice(1)){const q=p.evidence;assertBtcSolGraphProofReceipts({relation:p.relation,runId:q.runId,jobId:q.jobId,manifest:q.manifest,result:q.result,resources:q.resources,proofSHA256:p.proofSHA256,publicInputsSHA256:p.publicInputsSHA256,manifestSHA256:q.manifestSHA256,resultSHA256:q.resultSHA256,resourcesSHA256:q.resourcesSHA256});assert.equal(q.keySHA256,r.artifacts.graphKeys[p.relation]);}
 const note=r.deviceNote,s=r.deviceReservation,c=r.deviceCustody,a=r.liveArmedRestart;
 assert.equal(note.originalSignedWireCount,1);assert.equal(note.observation.amount,'500');assert.equal(note.observation.commitment,note.localCommitment);assert.equal(note.unrelatedOwnerCredit,'0');
 for(const k of ['fundReplayRejected','explicitFreshFundingRejected','signedConsentByteJoin','transportKeyDifferentFromNoteKey','custodyWitnessPrivateKeyAbsent'])assert.equal(note[k],true,k);
 assert.equal(note.tlsVersion,'TLSv1.3');assert.equal(s.originalReservationWireCount,1);assert.equal(s.receipt.status,'0x1');assert.equal(s.receipt.transactionHash,'0x'+s.observation.transactionHash);
 assert.equal(s.observation.sourceCommitment,note.localCommitment);assert.equal(s.observation.sourceNullifier,note.observation.nullifier);assert.equal(s.sameOriginalD26Opening,true);assert.equal(s.noLinuxAdoption,true);
 for(const k of ['encryptedReadbackBeforeU','reopenedBeforeS','originalSReceiptEncrypted','reopenedAfterS'])assert.equal(c[k],true,k);
 assert.equal(c.changeCommitment,s.statement.changeCommitment);assert.equal(c.recoveryCommitment,s.statement.recoveryCommitment);assert.equal(c.changeFreeBalance,null);assert.equal(c.recoveryFreeBalance,null);
 assert.equal(BigInt(s.statement.settleBefore)-BigInt(a.preparationStartedSecond),28800n,'NATIVE_LIVE_ARMED_ORIGINAL_EIGHT_HOURS');
 for(const k of ['sameArm','sameS','sameDeviceVault','freshSignedArmRead','noEarlyF','sameOriginalJournal','sameProviderCustody','originalSectionsStoppedBeforeReopen'])assert.equal(a[k],true,k);
 assert.equal(a.armBefore.state,'ARMED');assert.equal(a.armAfter.state,'ARMED');for(const k of ['jobId','settleBefore','armSHA256','terminalOutcome'])assert.equal(a.armBefore[k],a.armAfter[k]);
 assert.equal(a.armBefore.jobId,s.jobId);assert.equal(a.armBefore.settleBefore,s.statement.settleBefore);assert.equal(a.armBefore.terminalOutcome,null);
 assert.ok(BigInt(a.before.head.timestamp)<BigInt(s.statement.settleBefore));assert.ok(BigInt(a.after.head.timestamp)<BigInt(s.statement.settleBefore));
 assert.equal(a.before.counts.native,0);assert.deepEqual(a.after.counts,a.before.counts);assert.deepEqual(a.after.ledger,a.before.ledger);assert.equal(a.after.status.outcome,null);assert.equal(a.after.status.terminal,null);
 assert.equal(a.after.arm.armSHA256,a.armBefore.armSHA256);assert.equal(a.after.linuxSourceStatus,'UNISSUED');assert.equal(a.after.linuxAvailable,'0');
 const restart=a.capture;assert.notEqual(restart.originalProcess.pid,restart.successorProcess.pid);assert.equal(restart.successorProcess.ppid,restart.originalProcess.pid);for(const k of ['pgrp','session'])assert.equal(restart.successorProcess[k],restart.originalProcess[k]);
 assert.equal(restart.receipt.processId,restart.successorProcess.pid);assert.equal(restart.receipt.sourceSHA256,restart.sourceSHA256);assert.equal(restart.receipt.originalProcessLifetimeDifferent,true);assert.equal(restart.receipt.issuerClosed,true);assert.equal(restart.receipt.originalSectionsStoppedBeforeCheckpoint,true);
 assert.equal(restart.before.proofCount,3);assert.equal(restart.before.nativeWireCount,0);assert.equal(restart.parentDeviceVaultRetained,true);assert.equal(restart.abruptCrashRecoveryEstablished,false);assert.equal(restart.parentProcessExitEstablished,false);
 for(const stopped of [restart.stoppedOriginals.receiver,restart.stoppedOriginals.native]){assert.equal(stopped.stopped,true);assert.equal(stopped.exitObserved,true);assert.equal(stopped.exitCode,0);assert.equal(stopped.signal,null);}
 assert.deepEqual(r.economics,{deviceAmountAtomic:'500',reservedAtomic:'100',changeAtomic:'400',recoveryAtomic:'100',recoveryIsSubsetOfReserve:true,receiverFinancialTransactions:2,poolActualAtomic:'500',poolBackedAtomic:'500',sourceSpent:true,linuxOwnerAvailableAtomic:'0',nativeDeliveryTransactions:0});
 assert.equal(r.cleanup.successor.originalChildProcessClosed,true);assert.equal(r.cleanup.successor.originalBackendStopped,true);assert.deepEqual(r.cleanup.successor.exit,{code:0,signal:null});assert.deepEqual(r.cleanup.successor.close,{code:0,signal:null});
 for(const k of ['closedEvm','closedNativeEvm','closedNativeExecution','closedSession','closedAccount','closedOwner','closedBootstrap','closedDeviceProvider','closedDeviceRecipient','closedWalletListener','originalRecoveryStateRetained'])assert.equal(r.cleanup[k],true,k);assert.deepEqual(r.cleanup.errors,[]);
 return{nativeLiveArmedShortRestartNodeAcceptance:true,nativeProcessRestartEstablished:true,nativeGraphAcceptance:false,nativeDeliveryCount:0,postCutoffRecoveryEstablished:false,fullWalletAcceptance:false,physicalPhoneEstablished:false,mobileNoteCustodyEstablished:false,tlsEstablished:false,reactRendererEstablished:false,mobilePortfolioEstablished:false};
}
