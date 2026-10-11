/** Synthetic public wire vectors captured from the pre-typing implementation.
 * These hashes fix serialization only; they confer no account/proof authority. */
import test from 'node:test';
import {boundedPermissionSha256V1} from '../src/bounded-permission-sha256-v1.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {originalAccountFramesV2} from '../../../apps/mobile/tests/helpers/original-account-frames-v2.mjs';
import * as review from '../src/original-account-review-v2.mjs';
import * as deposit from '../src/device-deposit-consent-v1.mjs';
import * as execution from '../src/device-execution-consent-v1.mjs';
import * as reservation from '../src/device-reservation-consent-v1.mjs';
import * as exit from '../src/device-exit-consent-v1.mjs';
import * as nativeDeposit from '../src/device-native-private-deposit-v2.mjs';
import * as nativeReservation from '../src/device-native-private-reservation-v2.mjs';
import * as nativeExit from '../src/device-native-private-exit-v2.mjs';

function wireVectors() {
const hash=data=>createHash('sha256').update(data).digest('hex'), h=n=>n.toString(16).padStart(64,'0');
const frames=originalAccountFramesV2({devicePublicKey:'04'+'1'.repeat(128),now:1000000});
const hashes={access:hash(review.originalAccountAccessMessageV2(frames.access)),review:hash(review.originalAccountReviewMessageV2(frames.review)),privateAccess:hash(review.privateStateAccessMessageV1(frames.access)),privateReview:hash(review.privateStateReviewMessageV1(frames.review))};
const shared={version:1,origin:frames.access.origin,pairingId:frames.access.pairingId,devicePublicKey:frames.access.devicePublicKey,challengeId:h(81),nonce:h(82),expiresAt:1015000,binding:frames.review.binding,poolTerms:{scope:h(83),policy:h(84),codeHash:h(85),assetIdentity:h(86),domainCommitment:h(87)},jobId:h(88),witnessSHA256:h(89),observed:{blockNumber:'1',blockHash:h(90),timestamp:'1200'}};
const recipient=relation=>({type:'flat-private-proof-input-ready',profile:'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1',relation,role:'owner',jobId:'native-fixture-v2',recipientPublicKey:'MCowBQYDK2VuAyEA'+'A'.repeat(43)+'='});
const depositStatement={scope:shared.poolTerms.scope,policy:shared.poolTerms.policy,epoch:'2',amount:'7',output:h(91)};
for(const action of ['PROVE_D26','FUND_D26','OBSERVE_D26']){
 const frame={...shared,profile:deposit.DEVICE_DEPOSIT_CONSENT_V1,action,statement:depositStatement,rootId:h(92),noteRevision:3,proofSHA256:action==='PROVE_D26'?null:h(93),publicInputsSHA256:action==='PROVE_D26'?null:h(94),openingDisclosure:action==='PROVE_D26'?'ONE_D26_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER':null};
 hashes[action]=hash(deposit.deviceDepositConsentMessageV1(frame));
 const native={...frame,version:2,profile:nativeDeposit.DEVICE_NATIVE_PRIVATE_DEPOSIT_V2,openingDisclosure:action==='PROVE_D26'?'ENCRYPTED_D26_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT':null,
  privateProof:action==='PROVE_D26'?{profile:nativeDeposit.DEVICE_NATIVE_PRIVATE_PROOF_V2,recipient:recipient('deposit_balance'),transcriptSHA256:h(190)}:null};
 hashes['native'+action]=hash(nativeDeposit.deviceDepositConsentEitherMessageV2(native));
 if(action==='PROVE_D26'){
  hashes.nativeDepositTranscript=hash(nativeDeposit.nativePrivateDepositTranscriptBytesV2(native));
  hashes.nativeDepositPublicInputs=hash(JSON.stringify(nativeDeposit.nativePrivateDepositPublicInputsV2(native)));
 }
}
const statement={profile:'LIANUM_PAEG_FUNDED_4_V1',scope:shared.poolTerms.scope,policy:shared.poolTerms.policy,asset:shared.poolTerms.assetIdentity,...Object.fromEntries(['operationId','inputCommitment','inputNullifier','reservationIntent','graphCommitment','treeRoot','reserveCommitment','reserveNullifier','changeCommitment','recoveryCommitment'].map((name,i)=>[name,h(100+i)])),outputs:[h(120),h(121),h(122),h(123)],fundingNotBefore:'1',fundingValidUntil:'2',settleBefore:'3'};
const custody={rootId:h(124),noteRevision:3,encryptedRecordSHA256:h(125),frameSHA256:h(126),sourceCommitment:statement.inputCommitment,sourceNullifier:statement.inputNullifier,changeCommitment:statement.changeCommitment,recoveryCommitment:statement.recoveryCommitment};
const reserved={...shared,profile:reservation.DEVICE_RESERVATION_CONSENT_V1,action:'OBSERVE_S',depositJobId:h(127),quoteId:h(128),custody,statement,proofSHA256:h(129),publicInputsSHA256:h(130),openingDisclosure:null};
for(const action of ['PROVE_U','RESERVE_S','OBSERVE_S']){
 const frame={...reserved,action,proofSHA256:action==='PROVE_U'?null:reserved.proofSHA256,publicInputsSHA256:action==='PROVE_U'?null:reserved.publicInputsSHA256,openingDisclosure:action==='PROVE_U'?reservation.DEVICE_RESERVATION_DISCLOSURE_V1:null};
 hashes[action]=hash(reservation.deviceReservationConsentMessageV1(frame));
 if(action==='PROVE_U'){
  const privateProof={profile:nativeReservation.DEVICE_NATIVE_PRIVATE_U_PROOF_V2,recipient:recipient('authorization'),resultRecipient:{...recipient('authorization'),recipientPublicKey:'MCowBQYDK2VuAyEA'+'B'.repeat(43)+'='},
   context:{domain:{scope:shared.poolTerms.scope,policy:shared.poolTerms.policy,asset:shared.poolTerms.assetIdentity,hubDomain:h(191),registryCommitment:h(192),verifierSetCommitment:h(193),ledgerNamespace:h(191)},proposalSHA256:h(194),capsuleOptionsSHA256:h(195),invoiceSignaturesSHA256:h(196),sourceAmount:'7'},transcriptSHA256:h(197)};
  const native={...frame,version:2,profile:nativeReservation.DEVICE_NATIVE_PRIVATE_RESERVATION_V2,openingDisclosure:'ENCRYPTED_U_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT',privateProof};
  hashes.nativePROVE_U=hash(nativeReservation.deviceReservationConsentEitherMessageV2(native));
  hashes.nativeReservationTranscript=hash(nativeReservation.nativePrivateReservationTranscriptBytesV2(native));
 }
}
for(const action of ['EXECUTE_NATIVE','RECONCILE_NATIVE','RECOVER_NATIVE'])hashes[action]=hash(execution.deviceExecutionConsentMessageV1({version:1,profile:execution.DEVICE_EXECUTION_CONSENT_V1,action,reservation:reserved,nativeBindingSHA256:h(131),reservationTransactionHash:h(132),executionSnapshotSHA256:h(133),lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'}));
for(const action of ['PROVE_W39','WITHDRAW_W39','OBSERVE_W39']){
 const frame={...shared,profile:exit.DEVICE_EXIT_CONSENT_V1,action,parentJobId:h(134),nativeBindingSHA256:h(135),quoteId:h(136),rootId:h(137),noteRevision:3,noteRole:'change',statement:{scope:shared.poolTerms.scope,policy:shared.poolTerms.policy,epoch:'2',root:h(138),nullifier:h(139),amount:'7',recipient:'1'.repeat(40),commitment:h(140)},proofSHA256:action==='PROVE_W39'?null:h(141),publicInputsSHA256:action==='PROVE_W39'?null:h(142),openingDisclosure:action==='PROVE_W39'?exit.DEVICE_EXIT_DISCLOSURE_V1:null};
 hashes[action]=hash(exit.deviceExitConsentMessageV1(frame));
 const native={...frame,version:2,profile:nativeExit.DEVICE_NATIVE_PRIVATE_EXIT_V2,noteRole:'deposit',openingDisclosure:action==='PROVE_W39'?'ENCRYPTED_W39_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT':null,
  privateProof:action==='PROVE_W39'?{profile:nativeExit.DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2,recipient:recipient('withdraw_balance'),path:{root:frame.statement.root,index:0,leaf:frame.statement.commitment,siblings:Array.from({length:6},(_,i)=>h(198+i))},transcriptSHA256:h(204)}:null};
 hashes['native'+action]=hash(nativeExit.deviceExitConsentEitherMessageV2(native));
 if(action==='PROVE_W39'){
  hashes.nativeExitTranscript=hash(nativeExit.nativePrivateExitTranscriptBytesV2(native));
  hashes.nativeExitPublicInputs=hash(JSON.stringify(nativeExit.nativePrivateExitPublicInputsV2(native)));
 }
}
for(const optional of [false,true]){
 const snapshot={reference:h(150),stage:'UNKNOWN',outcome:null,executionStarted:true,nativeExposure:[{slot:0,family:'3',status:'ADMITTED'}],admittedReceipts:1,errorCode:'ERROR',errorCauseCodes:['CAUSE'],...(optional?{errorAuditBudget:{phase:'after-operation',method:'operation',round:'whole-operation',elapsedMilliseconds:12,limitMilliseconds:30000}}:{}),keeperRestart:false,nodeRestart:false,fullWalletAcceptance:false,claimsEnabled:false};
 hashes['snapshot'+optional]=hash(execution.deviceExecutionSnapshotBytesV1(snapshot));
}
return hashes;
}

const EXPECTED = {
  "access": "94032fa3a52b9812645980aa2b57b86030839cde02000ddb6edea3ae3d3f21e2",
  "review": "f7580dd9c3cf2dc9dd1725551be83211c87a74d81b0a86ef9a6659ca237f1bf3",
  "privateAccess": "8eb81cc83d3387b0f4467712c912bdcd52e275747cf9400c08a2aa27d2beae86",
  "privateReview": "6dd7fb1507ca38a55bf974655d970775e3fdabd09f7a40a818376897c63cb919",
  "PROVE_D26": "a71a69634c34a0305abd6c6fd25faf61b76df46b2ea7d22e1b5d757242e40b9a",
  "nativePROVE_D26": "1ee23a14f1ccde9f012ff6257b0347f1ad2a9bc90dd7cee43c88381b557def99",
  "nativeDepositTranscript": "78340135624059d67eaad523367e3e9499674ff787508320627328ded121627f",
  "nativeDepositPublicInputs": "daee63d2d06bd92d1cdb139783dd3d8c45df2fce2d80352aff45ef7905837232",
  "FUND_D26": "358f4666de88c3f407d2948de7bde9270df0f112592781c70051e920a6d982d1",
  "nativeFUND_D26": "a92bd31f0edfb58113b03586ffa8296563cb6a082fb917a7f2ac99bcfdee2913",
  "OBSERVE_D26": "0afc9ad8fbd498be541f8264709b35af9a0aaf3b6d422d4b823674350f97689c",
  "nativeOBSERVE_D26": "504342b0221f17104c651555c33414cdc1229f96702c2809c90290ea3fa500a4",
  "PROVE_U": "87b0f7a51100efca7c983f8fd8b89ef019d94fc2491ae1ee1e9c2213f8eb5021",
  "nativePROVE_U": "f381c6c1b7247756ee8877b73103f6044c5ee898fd9c8a1618b4266f39005a46",
  "nativeReservationTranscript": "79d34b394f7c19bcc83b3c810d5b73d13c915021f45ac542fa3a99e1aaaaf819",
  "RESERVE_S": "61c8b4297f18948bee461dcaa475eefb9346e31ba580534d16da1b8f69721c5d",
  "OBSERVE_S": "c95caeaee515c02e0e8bb14b7affb122c67cbb007bee65c8c2dee539656e56e3",
  "EXECUTE_NATIVE": "10371e30d3e3e93a2a6af7e39aecb7e2906708b093f1670689f5514138b6a78b",
  "RECONCILE_NATIVE": "e306298c62b00e2abaaf41e7b70004169c47bbb99f00b8e60223b197f79f657f",
  "RECOVER_NATIVE": "e17e0d730507f6e811a725f07ab322dabde3e42e9f82eceb4e6b67967ee23b3b",
  "PROVE_W39": "e52aaf2ea74cb9c7f2b38ea5a131fdae0aa1205e4cae434bddf719b047c94325",
  "nativePROVE_W39": "c0cb20b2057a0ba0b0da1321021e21aecae284ecc71270f53700418f4c23be95",
  "nativeExitTranscript": "20ebd584fd10a2775a972badee1bf005ad62eff285ccb7c97d8e0a296f2c35e7",
  "nativeExitPublicInputs": "552313477bd4e1f18d43ba131f03674b7fff117995f0925d3b12995107cb2973",
  "WITHDRAW_W39": "03c0d9827c7f068950aa5d9072f60c67c6414dc3d98be0599e290710d558bb45",
  "nativeWITHDRAW_W39": "c41ca05f56b80a0261735a52de2855345016b8c5f1973904347f8da8850488e3",
  "OBSERVE_W39": "10e53293b875ff6894ae47c3733971a5f6ef603130b411fab5fde914223c9a4e",
  "nativeOBSERVE_W39": "9eee9c9bfd6a709d110b958db8c757a9b538726ff5a4b277da575c926ae4e413",
  "snapshotfalse": "5bfcdf471798960eecb6f0fabe9215626028870b668208cec6cbd0f9d6083255",
  "snapshottrue": "4150eb24ef3368330106f8c44901eb338682794a133e0f442f3a677bdb22dc7b"
};

test('signed consent domains and snapshots retain their exact original wire bytes', () => {
  assert.deepEqual(wireVectors(), EXPECTED);
});


test('portable permission SHA256 preserves padding boundaries, input bytes and the original size bound',()=>{
 for(const n of [0,3,55,56,63,64,8192]){
  const bytes=n===3?new TextEncoder().encode('abc'):Uint8Array.from({length:n},(_,i)=>(i*29)&255),before=bytes.slice();
  assert.equal(Buffer.from(boundedPermissionSha256V1(bytes)).toString('hex'),createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(bytes,before);
 }
 for(const bytes of [null,{},'abc',new Uint16Array(3),new Uint8Array(8193)])assert.throws(()=>boundedPermissionSha256V1(bytes),/MOBILE_PERMISSION_SHA256_BYTES/);
});
