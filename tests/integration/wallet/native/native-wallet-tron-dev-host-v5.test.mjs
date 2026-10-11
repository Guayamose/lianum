/** Four pure source/metadata regressions. Synthetic values grant no runtime,
 * proof, signature, financial state or acceptance authority. No node starts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';
import { nativeValueOriginalAdmissionConsumer } from '../../../../packages/backend/src/execution/native-value/preparation/native-value-dev-admission-consumer-v5.mjs';
import { createNativeValueDevLiveProofClientV5 } from '../../../../packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-client.mjs';
import { nativeValueDevFinancialSourcePinsV5 } from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-financial-source-pins-v5.mjs';
import { LOCAL_OBSERVED_RECEIVER_RELEASE_V1, assertLocalObservedReceiverReleaseV1 } from '../../../../packages/backend/src/chains/evm/runtime/local-evm-profiles.mjs';
import { createOwnedLocalEvmObservedClockV1 } from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { LOCAL_TRON_WALLCLOCK_PROFILE_RELEASE_V1,assertLocalTronWallclockProfileReleaseV1,createOwnedLocalTronWallclockOperatorBootstrapV1,LOCAL_TRON_WALLCLOCK_LIMITS_V1 } from '../../../../packages/backend/src/operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import { NATIVE_WALLET_PROOF_ROLES_V1,NATIVE_WALLET_REQUEST_IDS_V1,NATIVE_WALLET_ECONOMICS_V1 } from './native-wallet-real-policy-v1.mjs';
import { NATIVE_WALLET_TRON_DEV_RESULT_V5,assertNativeWalletTronDevResultV5 } from './native-wallet-tron-dev-policy-v5.mjs';
const sha='a'.repeat(64),id='00000000-0000-4000-8000-000000000000';
function synthetic(){
 const httpEvidence=[];
 for(const requestId of NATIVE_WALLET_REQUEST_IDS_V1){
  for(const action of ['prepare','execute','reconcile'])httpEvidence.push({requestId,action,via:'NODE_SDK_EXACT_ONLY_HTTP',httpAdmission:'VOLATILE_UI_QUEUE_ONLY'});
  for(const action of ['accountPrepare','accountExecute','accountReconcile']){
   const base={requestId,action,reviewId:requestId+action,listenerId:'synthetic-listener'};
   for(const check of ['EXPLICIT_HANDOFF_CONFIRMATION','TOKENLESS_HANDOFF_COMMITMENT_VERIFIED','USED_EXACT_GRANT_REJECTED'])httpEvidence.push({...base,check});
  }
 }
 return {format:NATIVE_WALLET_TRON_DEV_RESULT_V5,phase:'completed',success:true,localOnly:true,fakeFundsOnly:true,publicNetwork:false,
  sourceUnchanged:true,funded:true,nativeDeliveryCount:1,keeperRestart:false,nodeRestart:false,fullWalletAcceptance:false,actualFRecoveryAcceptance:false,
  cleanup:{closedEvm:true,closedNativeTron:true,syntheticPrivateFilesRemoved:true,tronOriginal:{stopped:true,forced:false,exitCode:0,signal:null}},
  preflight:Object.fromEntries(['genuineArtifactsLoadedBeforeRuntimes','genuineOriginalFactories','constructorStorageVerified','sameOriginalFixture',
   'sameOriginalOwnerAccountSession','exactRegisteredNativeProfile','allTwelveVerifierLineages','emptyCurrentFullInventoryHealth','nativeDeliveryAbsent','sourceFundingAbsent']
   .map(key=>[key,true]).concat([['fixtureClockSchedule',{receiverMode:'OBSERVED_WALLCLOCK_SECONDS_V1',nativeConsensusClockOriginal:true,syntheticBlockScheduleInstalled:false,windowsRenewed:false}]])),
  nativeProfile:{family:'4',genesis:sha,publicNetwork:false,publicConsensusOrFinalityVerified:false},
  artifacts:{provenanceSHA256:sha,admissionKeySHA256:sha,admissionProgramSHA256:sha,admissionSourceVersion:sha},
  nativeClockSynchronization:{phase:'completed',receiverObservedWallclock:true,nativeClockChanged:false,windowsChanged:false,proofBytesUnchanged:true},
  economics:NATIVE_WALLET_ECONOMICS_V1,proofs:NATIVE_WALLET_PROOF_ROLES_V1.filter(([r])=>r!=='admission_native_value_v2')
   .map(([relation,publicWords])=>({relation,publicWords,proofSHA256:sha,publicInputsSHA256:sha})),
  admissionProof:{relation:'admission_native_value_v2',publicWords:84,proofSHA256:sha,publicInputsSHA256:sha,originalCanonicalCall:true,deployedVerifierAccepted:true,originalI84ArtifactBound:true},
  originalI84WorkerEvidence:{relation:'admission_native_value_v2',role:'local',runId:id,jobId:id,manifestSHA256:sha,resultSHA256:sha,resourcesSHA256:sha,
   runtimePinsSHA256:sha,keyManifestSHA256:sha,sourceVersion:sha,proofSHA256:sha,publicInputsSHA256:sha,keySHA256:sha,programSHA256:sha,
   publicWords:84,backendPublicWords:92,publicInputOffset:5,selfVerified:true,backendDestroyed:true,workerExitCode:0,workerSignal:null,lockPreserved:false},
  health:['empty','loaded-before-authorization','reserved-before-native','settled-loaded','closed'].map((phase,i)=>({phase,
   inventoryCounts:Array(3).fill(i<3?'0':'1'),exactCurrentHead:true,fullInventories:true,blockers:0,originalThirtySecondGuard:true})),
  acceptance:Object.fromEntries(['ownerAbsentDuringNativeAndSettlement','ordinaryFourSlotNTSettlement','ownerRestartedOriginal','recipientReopenedOriginal',
   'sameSessionReopened','oldListenerGrantRejected','duplicateRequestsNoEffect','payoutReplayRejected','exactSourceConservation','exactNativeConservation','sourceReservationClosed'].map(k=>[k,true])),
  confirmedRequestIds:NATIVE_WALLET_REQUEST_IDS_V1,httpEvidence,
  finalAccounting:{sourcePoolBacked:'0',sourcePoolActual:'0',unusedPoolBacked:'0',unusedPoolActual:'0',liveReservations:0,sourceChangeDelta:'40000',solverPayoutDelta:'10000',
   nativeRecipientDelta:null,nativeSenderValueAndGasAccounted:false,nativeSenderValueAndFeeAccounted:true,receiverFundingAndGasAccounted:true},
  tronConservation:{amountSun:'100000',feeSun:'42',sourceDeltaSun:'100042',canonicalSolidifiedOriginal:true,originalPermissionReplayRead:true,broadcastCount:1,recipientBalanceDeltaObserved:false}};
}
test('V5 selector requires the original system brand; no caller consumer/path opens a prover',()=>{
 assert.throws(()=>nativeValueOriginalAdmissionConsumer({}, {provenance:{schema:'LIANUM_NATIVE_VALUE_DEV_DEPLOYMENT_V5'}}),/ORIGINAL|OWNED/);
 assert.throws(()=>nativeValueOriginalAdmissionConsumer({}, {}, {}),/ARITY/);
 assert.throws(()=>createNativeValueDevLiveProofClientV5({worker:'/tmp/worker.mjs'}),/NO_OPTIONS/);
 assert.throws(()=>nativeValueDevFinancialSourcePinsV5({paths:[]}),/NO_OPTIONS/);
 const original=readFileSync(join(ROOT,'proof-workers/native-value-live-v2-worker.mjs'),'utf8');
 const current=readFileSync(join(ROOT,'proof-workers/native-value-dev-live-v5-worker.mjs'),'utf8');
 const body=source=>source.slice(source.indexOf('const expected=[...job.expectedPublicInputs]'),source.indexOf('writeNew(join(attempt,\'proof.bin\')'))
  .replaceAll('loadNativeValueDevLiveArtifactsV5','loadNativeValueLiveArtifacts');
 assert.ok(body(original).length>1000);assert.equal(body(current),body(original));
 assert.doesNotMatch(current,/circuitComputeVk|circuitWriteSolidityVerifier|persistWitness/);
});
test('synthetic metadata distinguishes real Tron facts/accounting from an invented EVM balance or private native credit',()=>{
 const scope=assertNativeWalletTronDevResultV5(synthetic());assert.equal(scope.privateNativeCreditEstablished,false);
 assert.equal(scope.nativeRecipientBalanceDeltaObserved,false);assert.equal(scope.actualFRecoveryAcceptance,false);
 for(const mutate of [v=>v.nativeProfile.family='3',v=>v.nativeClockSynchronization.windowsChanged=true,
  v=>v.finalAccounting.nativeRecipientDelta='100000',v=>v.finalAccounting.nativeSenderValueAndGasAccounted=true,
  v=>v.tronConservation.sourceDeltaSun='100000',v=>v.tronConservation.broadcastCount=2,
  v=>v.tronConservation.originalPermissionReplayRead=false,v=>v.cleanup.syntheticPrivateFilesRemoved=false]){
  const v=synthetic();mutate(v);assert.throws(()=>assertNativeWalletTronDevResultV5(v));
 }
});
test('synthetic worker evidence must join exact canonical I84 bytes, program/key and successful original cleanup',()=>{
 for(const mutate of [v=>v.originalI84WorkerEvidence.proofSHA256='b'.repeat(64),v=>v.originalI84WorkerEvidence.publicInputsSHA256='b'.repeat(64),
  v=>v.originalI84WorkerEvidence.sourceVersion='b'.repeat(64),v=>v.originalI84WorkerEvidence.selfVerified=false,
  v=>v.originalI84WorkerEvidence.backendDestroyed=false,v=>v.originalI84WorkerEvidence.workerExitCode=1,
  v=>v.originalI84WorkerEvidence.lockPreserved=true,v=>v.originalI84WorkerEvidence.resourcesSHA256='malformed',
  v=>v.cleanup.tronOriginal.forced=true,v=>v.cleanup.tronOriginal.signal='SIGABRT']){
  const v=synthetic();mutate(v);assert.throws(()=>assertNativeWalletTronDevResultV5(v));
 }
});
test('source review gates and actual clocks accept no caller schedule; 300s facts remain separate from the 30s audit guard',async()=>{
 assert.equal(LOCAL_TRON_WALLCLOCK_LIMITS_V1.maximumEvidenceLifetime,'300');assert.equal(LOCAL_TRON_WALLCLOCK_LIMITS_V1.maximumAncestry,'256');
 for(const [release,check]of [[LOCAL_OBSERVED_RECEIVER_RELEASE_V1,assertLocalObservedReceiverReleaseV1],
  [LOCAL_TRON_WALLCLOCK_PROFILE_RELEASE_V1,assertLocalTronWallclockProfileReleaseV1]]){
  if(release===null)assert.throws(()=>check(),/ABSENT/);else assert.equal(check(),true);
  assert.throws(()=>check({clock:0}),/NO_OPTIONS/);
 }
 await assert.rejects(createOwnedLocalEvmObservedClockV1({timestamp:0}),/FIXED_CONSTRUCTOR/);
 await assert.rejects(createOwnedLocalTronWallclockOperatorBootstrapV1({nativeRuntimes:[]},{profile:{maximumEvidenceLifetime:'99999'}}),/ARITY/);
 const source=readFileSync(new URL('./native-wallet-real-driver-v1.mjs',import.meta.url),'utf8');
 assert.match(source,/if\(tron\)return checkOriginalTronInclusion/);assert.match(source,/if\(tron\)\{assert.equal\(Object.hasOwn\(runtime,'advanceTo'\),false/);
 assert.match(source,/proofHash=hash\(fixtureJSON\(\[dependency,readiness\]\)\)/);
 assert.match(source,/originalThirtySecondGuard:true/);
});
