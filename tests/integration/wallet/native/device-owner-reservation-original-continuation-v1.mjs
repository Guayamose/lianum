/** Fixed continuation of the SAME original funded D26 opening. No bootstrap,
 * Linux note adoption, arbitrary executor or proof worker is introduced. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDeviceOwnerReservationBridgeV1,awaitDeviceOwnerReservationOriginalWorkV1}
 from '../../../../packages/backend/src/accounts/authority/device-owner-reservation-bridge-v1.mjs';
import {createDeviceOwnerExecutionBridgeV1} from '../../../../packages/backend/src/accounts/authority/device-owner-execution-bridge-v1.mjs';
import {runDeviceOwnerExecutionContinuationV1} from './device-owner-execution-original-continuation-v1.mjs';
import {createPairedDeviceAccountTlsServerV1,createPairedDeviceExecutionTlsServerV1,createPairedDeviceReservationTlsServerV1} from '../../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs';
import {originalAccountAccessMessageV2} from '../../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import {deviceReservationConsentMessageV1,wipeDeviceReservationWitnessV1} from '../../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';
import {prepareDeviceOwnerReservationOriginalV1,prepareDeviceOwnerLiveArmedReservationOriginalV1} from './device-owner-reservation-original-preparation-v1.mjs';
import {verifyPrivateNotePath} from '../../../../packages/engine/src/notes/private-note-tree.mjs';
import {refreshOriginalNativeDeviceLocalObservedClockV1} from '../../../../packages/backend/src/operations/recovery/native-device-local-observed-clock-v1.mjs';
import {runNativeDeviceLiveArmedShortContinuationV1} from './native-device-live-armed-short-continuation-v1.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const verifyPath=p=>verifyPrivateNotePath({...p,root:'0x'+p.root,leaf:'0x'+p.leaf,siblings:p.siblings.map(x=>'0x'+x)});
export async function runDeviceOwnerReservationContinuationV1(context){
 const {account,owner,runtime,nativeRuntime,bootstrap,system,reader,result,stage,save,active,actor,descriptor,deviceKey,host,
  certificatePath,keyPath,transport,depositJobId,fromApp}=context;
 const executionMode=context.deviceExecution===true;
 let vault=context.vault,api,bridge,executionBridge,server,prepared,pending,witness,continuation,closed=false,providersClosed=false;
 const {signDeviceMessage}=await fromApp('custody/signing.mjs');
 const access=async()=>{active();const value=await api.access();return{access:value,signature:signDeviceMessage(deviceKey,originalAccountAccessMessageV2(value))};};
 const signed=consent=>({consent,signature:signDeviceMessage(deviceKey,deviceReservationConsentMessageV1(consent))});
 const counts=()=>({proofs:result.proofs.length,receiver:runtime.transactions.length,native:nativeRuntime.transactions.length});
 async function close(){if(closed)return;closed=true;pending?.close();if(witness)wipeDeviceReservationWitnessV1(witness);api?.close();continuation?.close();vault?.close();executionBridge?.close();bridge?.close();
  if(!executionMode)await closeProviders();}
 async function closeProviders(){if(providersClosed)return;providersClosed=true;
  if(prepared&&!context.economicLifetime?.captured){const stop=await prepared.recipient.close();assert.equal(stop.exited,true);assert.deepEqual(stop.exit,{code:0,signal:null});result.cleanup.closedDeviceRecipient=true;
   if(!prepared.custody.report().leaseIssued)await prepared.custody.close();assert.equal(prepared.custody.report().closed,true);result.cleanup.closedDeviceProvider=true;}}
 try{
  await stage('device-original-quote-U-change-and-recovery-custody');
  if(context.deviceLiveArmed)await refreshOriginalNativeDeviceLocalObservedClockV1(context.liveClocks.clock);
   prepared=context.deviceDurableSQL?context.durablePrepared:await (context.deviceLiveArmed?prepareDeviceOwnerLiveArmedReservationOriginalV1:prepareDeviceOwnerReservationOriginalV1)({runtime,system,nativeRuntime,bootstrap});
  bridge=context.deviceDurableSQL?context.durableInstalled.reservationBridge:await createDeviceOwnerReservationBridgeV1({actor,account,owner,runtime,system,poolIndex:0,
   nativePreparation:prepared.nativePreparation,invoiceSignatures:prepared.invoiceSignatures});
  const tls={certificate:readFileSync(certificatePath,'utf8'),privateKey:readFileSync(keyPath,'utf8')};
  if(executionMode){assert.ok(context.nativeExecution);executionBridge=context.deviceDurableSQL?context.durableInstalled.executionBridge:await createDeviceOwnerExecutionBridgeV1({account,reservationBridge:bridge,
   nativeExecution:context.nativeExecution,providers:[{slot:0,custody:prepared.custody,deliveryRiskSalt:prepared.deliveryRiskSalt}],runtime,system,poolIndex:0});
   server=context.deviceDurableSQL?context.durableInstalled.transport:context.deviceEconomicRecovery?await createPairedDeviceAccountTlsServerV1({depositBridge:context.originalDepositBridge,reservationBridge:bridge,executionBridge,tls})
     :await createPairedDeviceExecutionTlsServerV1({bridge:executionBridge,reservationBridge:bridge,tls});
  }else server=await createPairedDeviceReservationTlsServerV1({bridge,tls});
  api=await host.reservation.createDeviceOwnerReservationApiV1(descriptor);
  const source=await vault.readDeviceNote();if(!context.deviceEconomicRecovery)assert.equal(source.availableBalance,'500');assert.equal(source.job.jobId,depositJobId);
  const firstQuote=await api.preparation({...await access(),depositJobId,rootId:source.rootId}),quote=host.reservation.readDeviceReservationQuoteV1(firstQuote);
  const another=await api.preparation({...await access(),depositJobId,rootId:source.rootId}),again=host.reservation.readDeviceReservationQuoteV1(another);
  for(const k of ['quoteId','proposal','capsuleOptions','invoiceSignatures','poolTerms'])assert.deepEqual(again[k],quote[k],'DEVICE_US_ORIGINAL_QUOTE_RETAINED');
  if(context.deviceEconomicRecovery){
   // Provider setup and the original quote may outlive the previous 15s
   // monetary read. Renew only OBSERVE_D26 on the SAME retained bridge; no
   // proof, funding, quote window or durable note is recreated.
   const before=counts(),writes=host.evidence().writes;
   assert.equal(typeof context.refreshOriginalDepositInclusion,'function');
   const fresh=await context.refreshOriginalDepositInclusion();active();
   for(const key of ['jobId','rootId','commitment','nullifier','transactionHash'])
    assert.equal(fresh[key],result.deviceNote.observation[key],'DEVICE_C4_SAME_ORIGINAL_D26_INCLUSION');
   assert.deepEqual(counts(),before);assert.equal(host.evidence().writes,writes,'DEVICE_C4_FRESH_D26_READ_NO_WRITE');
   result.deviceFundingFreshnessBeforeU={jobId:fresh.jobId,transactionHash:fresh.transactionHash,
    observedAt:fresh.observedAt,expiresAt:fresh.expiresAt,proofsBefore:before.proofs,proofsAfter:result.proofs.length,
    receiverWiresBefore:before.receiver,receiverWiresAfter:runtime.transactions.length,nativeWiresBefore:before.native,
    nativeWiresAfter:nativeRuntime.transactions.length,encryptedWritesBefore:writes,encryptedWritesAfter:host.evidence().writes};
  }
  const review=await vault.prepareDeviceReservationFromQuote(another);assert.equal(review.sourceCommitment,result.deviceNote.localCommitment);
  assert.equal(review.changeAmount,'400');assert.equal(review.recoveryAmount,'100');assert.equal(review.budget,'100');
  assert.equal((await vault.readDeviceNote()).availableBalance,null,'DEVICE_US_PENDING_SOURCE_NOT_FREE');
  const noteSignature=await vault.signDeviceReservation(review);pending=await vault.createDeviceAuthorizationRequest(noteSignature,another);
  assert.equal(pending.custody.sourceCommitment,result.deviceNote.localCommitment);assert.equal(pending.custody.sourceNullifier,result.deviceNote.observation.nullifier);
  const durableBeforeU=host.evidence();assert.ok(durableBeforeU.ciphertextPersisted&&durableBeforeU.maximumStoredValueBytes<=2048);
  const prove=await api.challengeJob({...await access(),depositJobId,quoteId:pending.quoteId,jobId:pending.jobId,
   custody:pending.custody,statement:pending.statement,witnessSHA256:pending.witnessSHA256});
  witness=await vault.bindDeviceAuthorizationRequest(pending,prove);assert.equal(Object.hasOwn(witness,'privateKey'),false);assert.equal(Object.hasOwn(witness,'root'),false);
  const proofSubmission={...signed(prove),witness};
  await stage('device-original-U-HTTP-UNKNOWN-same-admitted-job');
  transport.dropU = true;
  await assert.rejects(api.submit(proofSubmission),/SERVICE_UNAVAILABLE|DEVICE_US_U_REPLY_LOST/);
  const proofResponse=transport.responses.find(row=>row.path==='/v1/mobile/device-reservation/jobs');assert.ok(proofResponse&&[200,504].includes(proofResponse.status));
  // Reject a duplicate while the SAME admitted proof is still pending; this
  // must not overwrite its retained completion or start another worker.
  await assert.rejects(api.submit(proofSubmission));
  await awaitDeviceOwnerReservationOriginalWorkV1(bridge);active();
  pending.close();wipeDeviceReservationWitnessV1(witness);witness=null;
  const originalAfterProof=counts();assert.equal(originalAfterProof.proofs,2);
  // Replay is rejected; it must not replace completion of the admitted U job.
  await assert.rejects(api.submit(proofSubmission));await awaitDeviceOwnerReservationOriginalWorkV1(bridge);assert.deepEqual(counts(),originalAfterProof);
  const intent=await vault.readDeviceReservationIntent();assert.equal(intent.jobId,prove.jobId);
  vault.close();vault=host.original.openLocalRootNoteVaultV1(source.rootId);
  assert.deepEqual(await vault.readDeviceReservationIntent(),intent);assert.equal((await vault.readDeviceNote()).availableBalance,null);
  result.deviceCustody={beforeU:durableBeforeU,afterReopen:host.evidence(),sameRoot:source.rootId,sameSourceCommitment:source.commitment,
   changeCommitment:pending.statement.changeCommitment,recoveryCommitment:pending.statement.recoveryCommitment,changeAmount:'400',recoveryAmount:'100',
   encryptedReadbackBeforeU:true,reopenedBeforeS:true,externalBackupEstablished:false};save();
  await stage('device-separate-original-S-reservation-consent');
  if(context.deviceLiveArmed)await refreshOriginalNativeDeviceLocalObservedClockV1(context.liveClocks.clock);
   const reserve=await api.challenge('RESERVE_S',{...await access(),jobId:prove.jobId}),reservationSubmission=signed(reserve);
  const beforeS=counts();let sReply=null,sUnknown=false;
  try{sReply=await api.submit(reservationSubmission);}catch(error){assert.match(error.message,/SERVICE_UNAVAILABLE/);sUnknown=true;}
  await awaitDeviceOwnerReservationOriginalWorkV1(bridge);active();
  assert.equal(result.proofs.length,3);assert.equal(runtime.transactions.length,beforeS.receiver+1);assert.equal(nativeRuntime.transactions.length,beforeS.native);
  await assert.rejects(api.submit(reservationSubmission));
  await assert.rejects(api.challenge('RESERVE_S',{...await access(),jobId:prove.jobId}));
  await stage('device-fresh-original-S-observation-and-repeat');
  const observe=async()=>{const consent=await api.challenge('OBSERVE_S',{...await access(),jobId:prove.jobId});
   const value=await api.submit(signed(consent));assert.equal(value.stage,'RESERVED');assert.equal(value.observation.sourceCommitment,source.commitment);
   assert.equal(value.observation.sourceNullifier,result.deviceNote.observation.nullifier);assert.equal(verifyPath(value.observation.changePath),true);assert.equal(verifyPath(value.observation.reservePath),true);return value;};
  const observed=await observe(),beforeApply=host.evidence();
  const applied=await vault.applyDeviceReservationInclusion(observed);active();
  assert.equal(applied.sourceSpentAtRetainedHead,true);assert.equal(applied.sourceCommitment,source.commitment);assert.equal(applied.availableBalance,null);
  assert.deepEqual(applied.change,{commitment:pending.statement.changeCommitment,amount:'400',includedAtRetainedHead:true,availableBalance:null});
  assert.deepEqual(applied.recovery,{commitment:pending.statement.recoveryCommitment,amount:'100',availableBalance:null,requiresOriginalFailure:true});
  const afterApply=host.evidence();assert.ok(afterApply.writes>beforeApply.writes);assert.ok(afterApply.maximumStoredValueBytes<=2048);
  vault.close();vault=host.original.openLocalRootNoteVaultV1(source.rootId);
  const reopenedS=await vault.readDeviceNote();assert.equal(reopenedS.availableBalance,null);
  assert.equal(reopenedS.localReservation.stage,'RESERVED_AT_RETAINED_HEAD');assert.equal(reopenedS.localReservation.sourceSpentAtRetainedHead,true);
  assert.equal(reopenedS.localReservation.sourceNullifier,result.deviceNote.observation.nullifier);
  assert.equal(reopenedS.localReservation.transactionHash,observed.observation.transactionHash);
  assert.equal(reopenedS.localReservation.changeCommitment,pending.statement.changeCommitment);
  assert.equal(reopenedS.localReservation.recoveryCommitment,pending.statement.recoveryCommitment);
  assert.equal(reopenedS.localReservation.changeAvailableBalance,null);assert.equal(reopenedS.localReservation.recoveryAvailableBalance,null);
  assert.deepEqual(await vault.readDeviceReservationIntent(),intent);assert.equal(host.evidence().writes,afterApply.writes);
  const beforeRepeat=counts(),writesBeforeRepeat=host.evidence().writes,repeated=await observe();
  await vault.applyDeviceReservationInclusion(repeated);active();assert.deepEqual(counts(),beforeRepeat);
  assert.equal(host.evidence().writes,writesBeforeRepeat,'DEVICE_US_IDENTICAL_S_NO_LOCAL_WRITE');
  assert.equal(repeated.observation.transactionHash,observed.observation.transactionHash);
  result.deviceCustody={...result.deviceCustody,afterOriginalS:afterApply,afterSReopen:host.evidence(),
   originalSReceiptEncrypted:true,reopenedAfterS:true,sameSourceNullifier:reopenedS.localReservation.sourceNullifier,
   repeatedSLocalWrites:0,changeFreeBalance:null,recoveryFreeBalance:null};save();
  const final=await reader.read();await reader.assertCurrent(final);
  assert.ok(final.ledger.nullifiers.includes('0x'+observed.observation.sourceNullifier));
  assert.ok(final.ledger.commitments.includes('0x'+pending.statement.changeCommitment));assert.ok(final.ledger.commitments.includes('0x'+pending.statement.reserveCommitment));
  const wires=runtime.transactions.filter(row=>row.label==='flat-account-device-reservation');assert.equal(wires.length,1);
  const receipt=await runtime.receipt('0x'+observed.observation.transactionHash);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);assert.equal(receipt.status,'0x1');
  assert.equal(wires[0].transactionHash,receipt.transactionHash);assert.equal(wires[0].request.to,system.pools[0].address);assert.equal(BigInt(wires[0].request.value??'0'),0n);
  const decodedOriginal=await account.ownerView();assert.equal(decodedOriginal.balances.available,'0');assert.equal((await owner.ownerView.summary()).notes.source.status,'UNISSUED');
  assert.equal((await vault.readDeviceNote()).availableBalance,null);assert.equal(final.ledger.publicState.actualAssetBalance,'500');assert.equal(final.ledger.publicState.backedAmount,'500');
  result.deviceReservation={jobId:prove.jobId,quoteId:prove.quoteId,statement:pending.statement,custody:pending.custody,
   proofHttp:{status:proofResponse.status,admittedPosts:1,clientUnknown:true,automaticRetry:false,explicitRejectedReplay:true},
   reservationHttp:{clientUnknown:sUnknown,actualReplyStage:sReply?.stage??null,automaticRetry:false},observation:observed.observation,receipt,
   originalReservationWireCount:1,freshObservationRepeatedWithoutEffects:true,proofReplayRejected:true,reserveReplayRejected:true,
   sameOriginalD26Opening:true,noLinuxAdoption:true,nativeDeliveryCount:0,pendingSourceAvailable:null};
  result.economics={deviceAmountAtomic:'500',reservedAtomic:'100',changeAtomic:'400',recoveryAtomic:'100',recoveryIsSubsetOfReserve:true,
   receiverFinancialTransactions:2,poolActualAtomic:final.ledger.publicState.actualAssetBalance,poolBackedAtomic:final.ledger.publicState.backedAmount,
   sourceSpent:true,linuxOwnerAvailableAtomic:'0',nativeDeliveryTransactions:0};
  result.deviceOwnerUSNodeAcceptance=true;save();
  if(executionMode){result.deviceReservationEconomics=structuredClone(result.economics);
   continuation=await (context.deviceLiveArmed?runNativeDeviceLiveArmedShortContinuationV1:runDeviceOwnerExecutionContinuationV1)({...context,vault,executionBridge,originalPrepared:prepared,originalTransport:server,reservationBridge:bridge});vault=continuation.vault;}
  return{server,close,afterExecutionClose:executionMode?closeProviders:null};
 }catch(error){if(server){const stopped=await server.close();assert.equal(stopped.closed,true);}await close();
  if(executionMode)context.deferDeviceProviderCleanup(closeProviders);throw error;}
}
