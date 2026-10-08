/** Fixed happy DEVICE D26/U/S/native/T/change-W39. This is Node execution of
 * the mobile custody code, never physical-phone or full-mobile acceptance. */
import assert from 'node:assert/strict';
import {assertDeviceOwnerOutputBalanceReadsV1} from './device-owner-execution-native-checks-v1.mjs';
import {PRIVATE_RESOURCE_POLICY} from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
import {NATIVE_VALUE_LIVE_V2_SPEC} from '../../../../packages/proofs/src/native-value/metadata/native-value-live-v2-profile.mjs';
import {assertI84NativeReceiptV1} from '../../../../packages/proofs/src/native-value/runtime/native-value-dev-live-v5-native-execution.mjs';
import {assertDeviceReservationResultV1,DEVICE_RESERVATION_PROFILE_V1,DEVICE_RESERVATION_RESULT_V1} from './device-owner-reservation-policy-v1.mjs';
import {assertBtcSolGraphProofReceipts} from '../../claims/development/development-btc-sol-graph-proof-evidence.mjs';
export const DEVICE_EXECUTION_PROFILE_V1='device-owner-execution-v1',DEVICE_EXECUTION_RESULT_V1='LIANUM_DEVICE_OWNER_EXECUTION_RESULT_V1';
export const DEVICE_EXECUTION_RELATIONS_V1=Object.freeze(['deposit_balance','authorization','reservation','dependency','ready','admission_native_value_v2','node','node','node','node','settlement','withdraw_balance']);
export const DEVICE_EXECUTION_REAL_RELEASE_V1=Object.freeze({format:'REVIEWED_LOCAL_DEVICE_OWNER_EXECUTION_RELEASE_V1',profile:DEVICE_EXECUTION_PROFILE_V1,
 relations:DEVICE_EXECUTION_RELATIONS_V1,deviceAmountAtomic:'500',changeWithdrawalAtomic:'400',solverPayoutExit:false,
 localOnly:true,fakeFundsOnly:true,publicNetwork:false,phone:false});
export function assertDeviceExecutionReleaseV1(){assert.equal(arguments.length,0);
 assert.deepEqual(DEVICE_EXECUTION_REAL_RELEASE_V1,{format:'REVIEWED_LOCAL_DEVICE_OWNER_EXECUTION_RELEASE_V1',profile:DEVICE_EXECUTION_PROFILE_V1,
  relations:DEVICE_EXECUTION_RELATIONS_V1,deviceAmountAtomic:'500',changeWithdrawalAtomic:'400',solverPayoutExit:false,
  localOnly:true,fakeFundsOnly:true,publicNetwork:false,phone:false},'DEVICE_NATIVE_RELEASE_ABSENT_OR_CHANGED');}
export function assertDeviceExecutionResultV1(r){assert.equal(arguments.length,1);assert.equal(r.format,DEVICE_EXECUTION_RESULT_V1);assert.equal(r.profile,DEVICE_EXECUTION_PROFILE_V1);
 assert.equal(r.phase,'completed');assert.equal(r.success,true);assert.equal(r.sourceUnchanged,true);assert.equal(r.deviceOwnerNativeNodeAcceptance,true);
 assert.equal(r.nativeExecution,'ORIGINAL_DEVICE_NATIVE_EXECUTOR_V1');assert.equal(r.nativeGraphAcceptance,true);assert.equal(r.nativeDeliveryCount,1);
 assert.deepEqual(r.proofs.map(p=>p.relation),DEVICE_EXECUTION_RELATIONS_V1);
 // Verify the already retained HISTORICAL D26/U/S prefix with its own original
 // policy. This metadata projection issues no authority and does not claim the
 // FINAL pool is unchanged after native settlement and device change withdrawal.
 assertDeviceReservationResultV1({...r,format:DEVICE_RESERVATION_RESULT_V1,profile:DEVICE_RESERVATION_PROFILE_V1,proofs:r.proofs.slice(0,3),
  economics:r.deviceReservationEconomics,nativeExecution:null,nativeGraphAcceptance:false,nativeDeliveryCount:0});
 for(const p of r.proofs.filter(p=>['dependency','ready','node','settlement'].includes(p.relation))){const e=p.evidence;
  assertBtcSolGraphProofReceipts({relation:p.relation,runId:e.runId,jobId:e.jobId,manifest:e.manifest,result:e.result,resources:e.resources,
   proofSHA256:p.proofSHA256,publicInputsSHA256:p.publicInputsSHA256,manifestSHA256:e.manifestSHA256,resultSHA256:e.resultSHA256,resourcesSHA256:e.resourcesSHA256});
  assert.equal(e.keySHA256,r.artifacts.graphKeys[p.relation]);assert.equal(e.result.threads,p.relation==='node'&&e.result.nativeBackendExecution?12:4);}
 const i=r.proofs[5],e=i.evidence;assert.equal(i.publicWords,84);assert.equal(i.originalCanonicalCall,true);assert.equal(i.deployedVerifierAccepted,true);
 assert.equal(e.keySHA256,r.artifacts.admissionKey);assert.equal(e.programSHA256,r.artifacts.admissionProgram);
 for(const report of [e.manifest,e.result,e.resources]){assert.equal(report.runId,e.runId);assert.equal(report.jobId,e.jobId);
  assert.equal(report.relation,'admission_native_value_v2');assert.equal(report.runtimePinsSHA256,e.runtimePinsSHA256);}
 assert.equal(e.manifest.proofSHA256,i.proofSHA256);assert.equal(e.manifest.publicInputsSHA256,i.publicInputsSHA256);
 assert.equal(e.manifest.publicWords,84);assert.equal(e.manifest.backendPublicWords,92);assert.equal(e.manifest.publicInputOffset,5);
 if(e.result.nativeBackendExecution)assertI84NativeReceiptV1(NATIVE_VALUE_LIVE_V2_SPEC,e.result,e.resources);
 else{assert.equal(e.result.maximumPages,65536);assert.equal(e.result.threads,1);}
 assert.equal(e.result.keyRecomputed,false);assert.equal(e.result.keyGenerated,false);
 assert.equal(e.result.backendDestroyed,true);assert.equal(e.result.selfVerified,true);assert.equal(e.result.witnessPersisted,false);
 assert.equal(e.result.phase,'completed');assert.equal(e.resources.phase,'completed');assert.equal(e.resources.failure,null);assert.deepEqual(e.resources.failures,[]);
 assert.equal(e.resources.exitCode,0);assert.equal(e.resources.signal,null);assert.equal(e.resources.lockPreserved,false);
 const w=r.proofs[11],we=w.evidence;assert.equal(w.publicWords,39);assert.equal(w.amountAtomic,'400');
 assert.deepEqual(we.policy,PRIVATE_RESOURCE_POLICY);assert.equal(we.phase,'completed');assert.equal(we.acceptedResult,true);
 assert.equal(we.resourceReceiptCompleted,true);assert.equal(we.zeroKnowledgeEnabled,true);assert.equal(we.worker.verified,true);
 assert.equal(we.worker.zeroKnowledgeEnabled,true);assert.equal(we.keySHA256,r.artifacts.noteKeys.withdraw_balance);
 assert.equal(we.worker.proofSHA256,w.proofSHA256);assert.equal(we.worker.publicInputsSHA256,w.publicInputsSHA256);
 assert.equal(we.threads,1);assert.equal(we.maximumPages,32768);assert.deepEqual(we.exit,{code:0,signal:null});
 assert.equal(new Set(r.proofs.map(p=>p.proofSHA256)).size,12);assert.equal(new Set(r.proofs.map(p=>p.evidence.runId??p.evidence.id)).size,12);
 const clock=r.deviceNativeClock;assert.equal(clock.phase,'completed');assert.equal(clock.nativeClockChanged,false);assert.equal(clock.originalWindowsChanged,false);
 assert.equal(clock.nativeHeadBefore,clock.nativeHeadAfter);assert.equal(clock.receiverCheckpointSecond,clock.plannedNativeInclusion);
 const n=r.deviceNative;for(const k of ['repeatedReconciliationNoEffects','duplicateExecuteRejected','recoveryAfterTRejected','encryptedIntentBeforeExecute',
  'intentReopenedBeforeExecute','terminalEncrypted','terminalReopened','localOpeningsPreserved'])assert.equal(n[k],true);
 assert.equal(n.jobId,r.deviceReservation.jobId);assert.equal(n.originalSHash,r.deviceReservation.observation.transactionHash);
 assert.equal(n.originalFundingHash,r.deviceNote.observation.transactionHash);assert.equal(n.originalExecuteAdmittedPosts,1);assert.equal(n.executeHttpPosts,2);assert.equal(n.executeRejectedPostCount,1);assert.equal(n.recoveryRejectedPostCount,1);assert.ok([200,504].includes(n.executionHttpStatus));
 assert.equal(n.clientReportedUnknown,true);assert.equal(n.repeatedTerminalWrites,0);assert.equal(n.independentMobileCanonicalRpc,false);
 assert.equal(n.terminal.outcome,'FULFILLED');assert.equal(n.executionSnapshot.outcome,'FULFILLED');assert.equal(n.executionSnapshot.admittedReceipts,1);
 assert.equal(n.receipt.transactionHash,'0x'+n.terminal.transactionHash);assert.equal(n.receipt.blockHash,'0x'+n.terminal.blockHash);assert.equal(n.receipt.status,'0x1');
 assert.equal(n.nativeWire.receipt.status,'0x1');assert.equal(n.nativeWire.amountAtomic,'1000000');assert.equal(n.nativeWire.recipientDeltaAtomic,'1000000');
 assert.equal(BigInt(n.nativeWire.senderDeltaAtomic),1000000n+BigInt(n.nativeWire.gasCostAtomic));
 const x=r.deviceExit;for(const k of ['witnessPrivateKeyAbsent','encryptedSignedIntentBeforeProof','intentReopenedAfterProof','canonicalReceiptEncrypted',
  'receiptReopened','duplicateProofRejected','duplicateWithdrawalRejected','originalDeviceChangeOpening'])assert.equal(x[k],true);
 assert.equal(x.parentJobId,n.jobId);assert.equal(x.noteRole,'change');assert.equal(x.statement.commitment,r.deviceCustody.changeCommitment);assert.equal(x.statement.amount,'400');
 assert.equal(x.statement.nullifier,x.observation.nullifier);assert.equal(x.receipt.status,'0x1');assert.equal(x.receipt.transactionHash,'0x'+x.observation.transactionHash);
 assert.equal(x.proofSHA256,w.proofSHA256);assert.equal(x.originalWithdrawalAdmittedPosts,1);assert.ok([1,2].includes(x.withdrawalHttpPosts));assert.equal(x.withdrawalRejectedReplayPostCount,x.withdrawalHttpPosts-1);assert.equal(x.confirmedWithdrawalChallengeRejected,true);assert.equal(x.originalWithdrawalWireCount,1);
 assert.ok([200,504].includes(x.withdrawalHttpStatus));assert.equal(x.recipientDeltaAtomic,'400');assert.equal(x.repeatedLocalWrites,0);assert.equal(x.availableBalance,null);
 assert.ok(x.custodyBeforeProof.maximumStoredValueBytes<=2048);
 assert.deepEqual(r.economics,{deviceAmountAtomic:'500',reserveAtomic:'100',changeWithdrawalAtomic:'400',remainingSolverPayoutAtomic:'100',
  poolActualAtomic:'100',poolBackedAtomic:'100',liveReservations:0,nativeDeliveryAmountAtomic:'1000000',nativeDeliveryTransactions:1,
  sourceSpent:true,changeSpent:true,linuxOwnerAvailableAtomic:'0',recoveryAvailableBalance:null,solverPayoutExitEstablished:false});
 assertDeviceOwnerOutputBalanceReadsV1(r,false);
 assert.equal(r.cleanup.closedNativeExecution,true);
 return{deviceOwnerNativeNodeAcceptance:true,deviceOwnerUSNodeAcceptance:true,deviceOwnerD26NodeAcceptance:true,nativeGraphAcceptance:true,nativeDeliveryCount:1,
  mobileNoteCustodyEstablished:false,tlsEstablished:false,reactRendererEstablished:false,mobilePortfolioEstablished:false,physicalPhoneEstablished:false,
  nativeProcessRestartEstablished:false,keeperLossRecoveryEstablished:false,independentInfrastructureEstablished:false,fullWalletAcceptance:false};}
