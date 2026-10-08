/** Review gate for one actual local wallet attempt. Prior solver-only evidence
 * authorizes inspecting the runtime, never an accepted private GRAPH result. */
import assert from 'node:assert/strict';
import { NATIVE_WALLET_ECONOMICS_V1, NATIVE_WALLET_PROOF_ROLES_V1, assertNativeWalletCoreClosureV1 } from './native-wallet-real-policy-v1.mjs';
export const NATIVE_WALLET_TRON_DEV_RELEASE_V5=Object.freeze({format:'REVIEWED_LOCAL_TRON_PRIVATE_WALLET_ATTEMPT_V5',
  nativeRuntimeReportSHA256:'e9d8d1a0af8912b6af0d6fd1f811e4db89b14ef8f68e90cbe494885a9bb32cf9',
  maximumEvidenceLifetime:'300',maximumAncestry:'256',fullAuditMilliseconds:30000,
  nativeProofSchedule:NATIVE_WALLET_PROOF_ROLES_V1,localOnly:true,fakeFundsOnly:true,
  acceptedPrivateGraphEstablished:false,privateNativeCreditEstablished:false,publicNetwork:false,cloudAcceptanceEstablished:false});
export const NATIVE_WALLET_TRON_DEV_RESULT_V5='NATIVE_VALUE_TRON_DEV_WALLET_ACCEPTANCE_RESULT_V5';
export function assertNativeWalletTronDevReleaseV5(){
 assert.equal(arguments.length,0,'TRON_WALLET_DEV_RELEASE_NO_OPTIONS');
 assert.ok(NATIVE_WALLET_TRON_DEV_RELEASE_V5,'TRON_WALLET_DEV_RELEASE_UNPUBLISHED');
 assert.deepEqual(NATIVE_WALLET_TRON_DEV_RELEASE_V5,{format:'REVIEWED_LOCAL_TRON_PRIVATE_WALLET_ATTEMPT_V5',
  nativeRuntimeReportSHA256:'e9d8d1a0af8912b6af0d6fd1f811e4db89b14ef8f68e90cbe494885a9bb32cf9',
  maximumEvidenceLifetime:'300',maximumAncestry:'256',fullAuditMilliseconds:30000,
  nativeProofSchedule:NATIVE_WALLET_PROOF_ROLES_V1,localOnly:true,fakeFundsOnly:true,
  acceptedPrivateGraphEstablished:false,privateNativeCreditEstablished:false,publicNetwork:false,cloudAcceptanceEstablished:false});
 return true;
}
export function assertNativeWalletTronDevResultV5(result){
 assert.equal(arguments.length,1,'TRON_WALLET_DEV_METADATA_ARITY');
 assert.equal(result.format,NATIVE_WALLET_TRON_DEV_RESULT_V5);assert.equal(result.phase,'completed');assert.equal(result.success,true);
 for(const key of ['localOnly','fakeFundsOnly','sourceUnchanged'])assert.equal(result[key],true,key);
 assert.equal(result.publicNetwork,false);assert.equal(result.cleanup.closedEvm,true);assert.equal(result.cleanup.closedNativeTron,true);
 const cleanup=result.cleanup.tronOriginal;assert.equal(cleanup.stopped,true);assert.equal(cleanup.forced,false);
 assert.equal(cleanup.exitCode,0);assert.equal(cleanup.signal,null);
 assert.equal(result.keeperRestart,false);assert.equal(result.nodeRestart,false);
 for(const key of ['genuineArtifactsLoadedBeforeRuntimes','genuineOriginalFactories','constructorStorageVerified','sameOriginalFixture',
  'sameOriginalOwnerAccountSession','exactRegisteredNativeProfile','allTwelveVerifierLineages','emptyCurrentFullInventoryHealth',
  'nativeDeliveryAbsent','sourceFundingAbsent'])assert.equal(result.preflight[key],true,key);
 assert.equal(result.nativeProfile.family,'4');assert.match(result.nativeProfile.genesis,/^[0-9a-f]{64}$/);
 assert.equal(result.nativeProfile.publicNetwork,false);assert.equal(result.nativeProfile.publicConsensusOrFinalityVerified,false);
 for(const key of ['provenanceSHA256','admissionKeySHA256'])assert.match(result.artifacts[key],/^[0-9a-f]{64}$/);
 const clock=result.nativeClockSynchronization;assert.equal(clock.phase,'completed');assert.equal(clock.receiverObservedWallclock,true);
 assert.equal(clock.nativeClockChanged,false);assert.equal(clock.windowsChanged,false);assert.equal(clock.proofBytesUnchanged,true);
 const schedule=result.preflight.fixtureClockSchedule;assert.equal(schedule.receiverMode,'OBSERVED_WALLCLOCK_SECONDS_V1');
 assert.equal(schedule.nativeConsensusClockOriginal,true);assert.equal(schedule.syntheticBlockScheduleInstalled,false);assert.equal(schedule.windowsRenewed,false);
 assertNativeWalletCoreClosureV1(result);
 const proof=result.originalI84WorkerEvidence;
 assert.equal(proof.relation,'admission_native_value_v2');assert.equal(proof.role,'local');
 for(const key of ['runId','jobId'])assert.match(proof[key],/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 for(const key of ['manifestSHA256','resultSHA256','resourcesSHA256','runtimePinsSHA256','keyManifestSHA256','sourceVersion'])assert.match(proof[key],/^[0-9a-f]{64}$/);
 assert.equal(proof.proofSHA256,result.admissionProof.proofSHA256);assert.equal(proof.publicInputsSHA256,result.admissionProof.publicInputsSHA256);
 assert.equal(proof.sourceVersion,result.artifacts.admissionSourceVersion);assert.equal(proof.keySHA256,result.artifacts.admissionKeySHA256);assert.equal(proof.programSHA256,result.artifacts.admissionProgramSHA256);
 assert.equal(proof.publicWords,84);assert.equal(proof.backendPublicWords,92);assert.equal(proof.publicInputOffset,5);
 assert.equal(proof.selfVerified,true);assert.equal(proof.backendDestroyed,true);assert.equal(proof.workerExitCode,0);
 assert.equal(proof.workerSignal,null);assert.equal(proof.lockPreserved,false);
 assert.deepEqual(result.finalAccounting,{sourcePoolBacked:'0',sourcePoolActual:'0',unusedPoolBacked:'0',unusedPoolActual:'0',liveReservations:0,
  sourceChangeDelta:'40000',solverPayoutDelta:'10000',nativeRecipientDelta:null,nativeSenderValueAndGasAccounted:false,
  nativeSenderValueAndFeeAccounted:true,receiverFundingAndGasAccounted:true});
 const native=result.tronConservation;assert.equal(native.amountSun,NATIVE_WALLET_ECONOMICS_V1.solverNativeDeliveryAtomic);
 assert.match(native.feeSun,/^(0|[1-9][0-9]*)$/);assert.match(native.sourceDeltaSun,/^(0|[1-9][0-9]*)$/);
 assert.equal(BigInt(native.sourceDeltaSun),BigInt(native.amountSun)+BigInt(native.feeSun));
 assert.equal(native.canonicalSolidifiedOriginal,true);assert.equal(native.originalPermissionReplayRead,true);
 assert.equal(native.broadcastCount,1);assert.equal(native.recipientBalanceDeltaObserved,false);
 assert.equal(result.cleanup.syntheticPrivateFilesRemoved,true);
 return {scope:'ONE_LOCAL_TRON_SOLVER_DELIVERY_PAID_BY_ORIGINAL_PRIVATE_ACCOUNT_GRAPH',
  genuineNativeValueGraphAccepted:true,privateNativeCreditEstablished:false,fullWalletAcceptance:false,
  actualFRecoveryAcceptance:false,publicNetwork:false,publicProductionEstablished:false,cloudAcceptanceEstablished:false,
  nativeRecipientBalanceDeltaObserved:false};
}
