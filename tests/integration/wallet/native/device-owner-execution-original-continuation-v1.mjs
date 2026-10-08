/** Fixed happy/F continuation of the original DEVICE D26/U/S, not a bootstrap.
 * Only original native executor/provider/recipient and exact mobile APIs run.
 * Linux note custody never adopts this opening; physical phone is untested. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {originalAccountAccessMessageV2} from '../../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import {deviceExecutionConsentMessageV1} from '../../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
import {deviceExitConsentMessageV1,wipeDeviceExitWitnessV1} from '../../../../packages/mobile-protocol/src/device-exit-consent-v1.mjs';
import {awaitDeviceOwnerExecutionOriginalWorkV1} from '../../../../packages/backend/src/accounts/authority/device-owner-execution-bridge-v1.mjs';
import {decodeNativeValueTerminalCalldata} from '../../../../packages/backend/src/execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs';
import {encodeFlatTransaction,FLAT_TRANSACTION_METHODS} from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),bare=value=>value.startsWith('0x')?value.slice(2):value;
export async function runDeviceOwnerExecutionContinuationV1(context){
 const {account,owner,runtime,nativeRuntime,system,reader,result,stage,save,active,descriptor,deviceKey,host,
  executionBridge,transport,fromApp,retainedProofs}=context;
 const recovery=context.deviceRecovery===true,terminalOutcome=recovery?'RECOVERED':'FULFILLED';
 let vault=context.vault,nativeApi,exitApi,pendingExit,witness,closed=false;
 const {signDeviceMessage}=await fromApp('custody/signing.mjs');
 const counts=()=>({proofs:result.proofs.length,receiver:runtime.transactions.length,native:nativeRuntime.transactions.length});
 const signed=consent=>({consent,signature:signDeviceMessage(deviceKey,deviceExecutionConsentMessageV1(consent))});
 const exitSigned=consent=>({consent,signature:signDeviceMessage(deviceKey,deviceExitConsentMessageV1(consent))});
 const access=async api=>{active();const value=await api.access();return{access:value,signature:signDeviceMessage(deviceKey,originalAccountAccessMessageV2(value))};};
 function close(){if(closed)return;closed=true;pendingExit?.close();wipeDeviceExitWitnessV1(witness);nativeApi?.close();exitApi?.close();vault?.close();}
 try{
  nativeApi=await host.execution.createDeviceOwnerExecutionApiV1(descriptor);
  exitApi=await host.exit.createDeviceOwnerExitApiV1(descriptor);
  const jobId=result.deviceReservation.jobId,rootId=result.deviceCustody.sameRoot;
  const sourceBefore=await vault.readDeviceNote();assert.equal(sourceBefore.availableBalance,null);
  assert.equal(sourceBefore.localReservation.transactionHash,result.deviceReservation.observation.transactionHash);
  assert.equal(sourceBefore.localReservation.sourceNullifier,result.deviceNote.observation.nullifier);
  await stage('device-one-native-execute-consent-after-original-S');
  const execute=await nativeApi.challenge('EXECUTE_NATIVE',{...await access(nativeApi),jobId});
  assert.equal(execute.reservationTransactionHash,result.deviceReservation.observation.transactionHash);
  assert.equal(execute.reservation.statement.inputCommitment,result.deviceNote.localCommitment);
  assert.equal(execute.lossClause,'FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
  const durable=await vault.retainDeviceExecutionIntent(execute),executionSubmission=signed(execute);
  assert.equal(durable.serverAdmissionEstablished,false);assert.equal(durable.availableBalance,null);
  const localBefore=await vault.readDeviceExecutionIntent(),encryptedBefore=host.evidence();
  assert.equal(localBefore.executeAttemptRetained,true);assert.equal(localBefore.outcome,null);assert.ok(encryptedBefore.maximumStoredValueBytes<=2048);
  vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);
  assert.deepEqual(await vault.readDeviceExecutionIntent(),localBefore,'DEVICE_NATIVE_INTENT_SURVIVES_REOPEN');
  assert.equal((await vault.readDeviceNote()).availableBalance,null);
  const beforeNative=counts(),recipientBefore=await nativeRuntime.balance(nativeRuntime.accounts[1]),senderBefore=await nativeRuntime.balance(nativeRuntime.accounts[0]);
  const receiverRecipientBefore=await runtime.balance(runtime.accounts[3]);
  transport.dropExecute=true;
  await assert.rejects(nativeApi.submit(executionSubmission),/SERVICE_UNAVAILABLE|DEVICE_NATIVE_EXECUTE_REPLY_LOST/);
  const executionHttp=transport.responses.find(row=>row.path==='/v1/mobile/device-execution/execute');
  assert.ok(executionHttp&&[200,504].includes(executionHttp.status));
  await assert.rejects(nativeApi.submit(executionSubmission)); // consumed LOCAL review, no second POST
  if(recovery){await assert.rejects(awaitDeviceOwnerExecutionOriginalWorkV1(executionBridge),error=>error.message==='DEVICE_NATIVE_FIXED_BEFORE_N0');active();
   assert.equal(result.originalExecutionFailure.retainedState.admittedReceipts,1);
   assert.equal(result.originalExecutionFailure.retainedState.executionStarted,true);
   assert.deepEqual(result.proofs.map(p=>p.relation),['deposit_balance','authorization','reservation','dependency','ready','admission_native_value_v2']);
   const beforeCutoff=await reader.read();await reader.assertCurrent(beforeCutoff);
   assert.ok(BigInt(beforeCutoff.head.timestamp)<BigInt(result.deviceReservation.statement.settleBefore));
   assert.equal(beforeCutoff.ledger.publicState.actualAssetBalance,'500');assert.equal(beforeCutoff.ledger.publicState.backedAmount,'500');
   for(const cm of result.deviceReservation.statement.outputs)if(cm!=='0'.repeat(64))assert.equal(beforeCutoff.ledger.commitments.includes('0x'+cm),false,'DEVICE_RECOVERY_NO_PAYOUT_NOTE');
   vault.close();await stage('device-original-cutoff-after-one-native-delivery-before-N0');
   await runtime.advanceTo(result.deviceReservation.statement.settleBefore); // fixed owned local fixture; original cutoff/windows are unchanged
   vault=host.original.openLocalRootNoteVaultV1(rootId);
   assert.deepEqual(await vault.readDeviceExecutionIntent(),localBefore);assert.equal((await vault.readDeviceNote()).availableBalance,null);
   const review=await nativeApi.challenge('RECOVER_NATIVE',{...await access(nativeApi),jobId});
   assert.equal(review.lossClause,'FULL_OWNER_REFUND_PROVIDER_LOSS_V1');assert.equal(review.nativeBindingSHA256,execute.nativeBindingSHA256);
   const retained=await vault.retainDeviceExecutionIntent(review);assert.equal(retained.serverAdmissionEstablished,false);
   const recoverySubmission=signed(review);transport.dropRecovery=true;
   await assert.rejects(nativeApi.submit(recoverySubmission),/SERVICE_UNAVAILABLE|DEVICE_NATIVE_RECOVERY_REPLY_LOST/);
   const response=transport.responses.find(row=>row.path==='/v1/mobile/device-execution/recover');assert.ok(response&&[200,504].includes(response.status));
   await assert.rejects(nativeApi.submit(recoverySubmission));await awaitDeviceOwnerExecutionOriginalWorkV1(executionBridge);active();
   assert.equal(transport.posts['/v1/mobile/device-execution/recover'],1);assert.equal(result.proofs.length,7);
   result.deviceRecovery={originalCutoff:result.deviceReservation.statement.settleBefore,receiverBeforeCutoff:beforeCutoff.head.timestamp,
    controlledFailure:'DEVICE_NATIVE_FIXED_BEFORE_N0',originalNativeAdmissionBeforeFailure:true,noNodeOrSettlement:true,
    recoveryIntentBeforePost:true,recoveryHttpStatus:response.status,recoveryOriginalAdmittedPosts:1,clientUnknown:true,automaticRetry:false};save();
  }else{await awaitDeviceOwnerExecutionOriginalWorkV1(executionBridge);active();}
  assert.equal(transport.posts['/v1/mobile/device-execution/execute'],1);
  assert.equal(nativeRuntime.transactions.length,beforeNative.native+1);
  assert.equal(result.proofs.length,recovery?7:11,'DEVICE_NATIVE_ORIGINAL_TERMINAL_RELATIONS');
  await stage('device-fresh-original-terminal-reconciliation-without-resend');
  const reconcile=async()=>{const consent=await nativeApi.challenge('RECONCILE_NATIVE',{...await access(nativeApi),jobId});
   const reply=await nativeApi.submit(signed(consent));assert.equal(reply.stage,terminalOutcome);assert.equal(reply.outcome,terminalOutcome);
   assert.equal(reply.executionSnapshot.admittedReceipts,1);assert.equal(reply.executionSnapshot.executionStarted,true);
   assert.deepEqual(reply.executionSnapshot.nativeExposure,[{slot:0,family:'3',status:'ADMITTED'}]);return reply;};
  const observed=await reconcile(),terminal=observed.terminal;
  const receipt=await runtime.receipt('0x'+terminal.transactionHash);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);assert.equal(receipt.status,'0x1');
  const wire=runtime.transactions.filter(row=>row.transactionHash===receipt.transactionHash);assert.equal(wire.length,1);
  assert.equal(wire[0].request.to,system.pools[0].address);assert.equal(wire[0].request.data.slice(2,10),FLAT_TRANSACTION_METHODS[recovery?'recoverGeneric':'fulfillGeneric'].selector);
  assert.equal(sha(Buffer.from(wire[0].request.data.slice(2),'hex')),terminal.calldataSHA256);
  const decoded=decodeNativeValueTerminalCalldata(wire[0].request.data);assert.equal(decoded.kind,recovery?'recovery':'settlement');
  if(recovery)assert.deepEqual(decoded.request,retainedProofs.get('original-timeout-recovery'));
  else{assert.deepEqual(decoded.request.settlement,retainedProofs.get('global-fulfillment'));
   assert.deepEqual(decoded.request.completions,Array.from({length:4},(_,i)=>retainedProofs.get('slot-'+i+'-completion')));} 
  const beforeApply=host.evidence(),applied=await vault.applyDeviceExecutionTerminal(observed);
  assert.equal(applied.outcome,terminalOutcome);assert.equal(applied.localOpeningsPreserved,true);assert.equal(applied.availableBalance,null);
  assert.ok(host.evidence().writes>beforeApply.writes);
  vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);
  assert.equal((await vault.readDeviceExecutionIntent()).transactionHash,terminal.transactionHash);
  const beforeRepeat=counts(),localWrites=host.evidence().writes,repeated=await reconcile();
  await vault.applyDeviceExecutionTerminal(repeated);assert.deepEqual(counts(),beforeRepeat);assert.equal(host.evidence().writes,localWrites);
  assert.deepEqual(repeated.terminal,terminal);
  // New signed EXECUTE and RECOVER after a terminal are explicit NEGATIVES. They cannot
  // mint a new reservation, proof, wire or F and are never automatic retries.
  for(const action of ['EXECUTE_NATIVE','RECOVER_NATIVE']){const review=await nativeApi.challenge(action,{...await access(nativeApi),jobId});
   await assert.rejects(vault.retainDeviceExecutionIntent(review));
   await assert.rejects(nativeApi.submit(signed(review)),/SERVICE_UNAVAILABLE/);}
  assert.deepEqual(counts(),beforeRepeat);
  const nativeRecord=nativeRuntime.transactions.at(-1),nativeReceipt=nativeRecord.receipt;
  assert.equal(nativeRecord.phase,'mined');assert.equal(nativeReceipt.status,'0x1');
  assert.equal(nativeRecord.request.to,nativeRuntime.accounts[1]);assert.equal(BigInt(nativeRecord.request.value),1000000n);
  await nativeRuntime.checkReceipt(nativeReceipt);await nativeRuntime.assertCanonical(nativeReceipt);
  const nativeGas=BigInt(nativeReceipt.gasUsed)*BigInt(nativeReceipt.effectiveGasPrice);
  assert.equal((await nativeRuntime.balance(nativeRuntime.accounts[1]))-recipientBefore,1000000n);
  assert.equal(senderBefore-(await nativeRuntime.balance(nativeRuntime.accounts[0])),1000000n+nativeGas);
  result.deviceNative={jobId,nativeBindingSHA256:observed.nativeBindingSHA256,terminal,receipt,
   reserveNullifier:bare(decoded.statement.reserveNullifier),originalSHash:result.deviceReservation.observation.transactionHash,originalFundingHash:result.deviceNote.observation.transactionHash,
   executionSnapshot:observed.executionSnapshot,originalExecuteAdmittedPosts:1,executeHttpPosts:transport.posts['/v1/mobile/device-execution/execute'],
   executeRejectedPostCount:transport.posts['/v1/mobile/device-execution/execute']-1,recoveryRejectedPostCount:transport.posts['/v1/mobile/device-execution/recover']-(recovery?1:0),executionHttpStatus:executionHttp.status,clientReportedUnknown:true,
   repeatedReconciliationNoEffects:true,duplicateExecuteRejected:true,recoveryAfterTerminalRejected:true,recoveryAfterTRejected:!recovery,encryptedIntentBeforeExecute:true,
   intentReopenedBeforeExecute:true,terminalEncrypted:true,terminalReopened:true,repeatedTerminalWrites:0,
   localOpeningsPreserved:true,independentMobileCanonicalRpc:false,nativeWire:{transactionHash:nativeRecord.transactionHash,receipt:nativeReceipt,
    amountAtomic:'1000000',recipientDeltaAtomic:'1000000',senderDeltaAtomic:String(1000000n+nativeGas),gasCostAtomic:String(nativeGas)}};save();
  const exits=[];let withdrawn=0n;
  for(const noteRole of recovery?['change','recovery']:['change']){const amount=noteRole==='change'?'400':'100';
  await stage('device-original-'+noteRole+'-opening-W39-separate-consents');
  const subject=await vault.readDeviceExitSubject(noteRole,bare(runtime.accounts[3]));
  assert.equal(subject.parentJobId,jobId);assert.equal(subject.amount,amount);
  assert.equal(subject.commitment,result.deviceCustody[noteRole+'Commitment']);
  const quoteHandle=await exitApi.preparation({...await access(exitApi),...Object.fromEntries(
   ['parentJobId','noteRole','rootId','noteRevision','nullifier','recipient'].map(name=>[name,subject[name]]))});
  const quote=host.exit.readDeviceExitQuoteV1(quoteHandle);assert.equal(quote.nativeBindingSHA256,observed.nativeBindingSHA256);
  pendingExit=await vault.createDeviceExitProofRequest(quoteHandle);
  const signedIntent=await vault.readDeviceExitIntent(noteRole);assert.equal(signedIntent.phase,'SIGNED');assert.equal(signedIntent.jobId,pendingExit.jobId);
  const beforeW39=host.evidence();assert.ok(beforeW39.maximumStoredValueBytes<=2048);
  const prove=await exitApi.challengeJob({...await access(exitApi),quoteId:pendingExit.quoteId,jobId:pendingExit.jobId,witnessSHA256:pendingExit.witnessSHA256});
  witness=await vault.bindDeviceExitProofRequest(pendingExit,prove);assert.equal(Object.hasOwn(witness,'privateKey'),false);assert.equal(Object.hasOwn(witness,'root'),true); // root is PUBLIC Merkle root, never AES root
  const proofSubmission={...exitSigned(prove),witness};
  await assert.rejects(exitApi.submit(proofSubmission),/SERVICE_UNAVAILABLE/);
  const proofHttp=transport.responses.filter(row=>row.path==='/v1/mobile/device-exit/jobs');assert.equal(proofHttp.length,exits.length+1);assert.equal(proofHttp.at(-1).status,504);
  await awaitDeviceOwnerExecutionOriginalWorkV1(executionBridge);active();
  pendingExit.close();wipeDeviceExitWitnessV1(witness);witness=null;
  assert.equal(result.proofs.length,(recovery?8:12)+exits.length);
  const noReproof=counts();await assert.rejects(exitApi.submit(proofSubmission));assert.deepEqual(counts(),noReproof); // exact retained consent is consumed or expired, never a new job
  vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);assert.deepEqual(await vault.readDeviceExitIntent(noteRole),signedIntent);
  const withdrawal=await exitApi.challenge('WITHDRAW_W39',{...await access(exitApi),jobId:prove.jobId}),withdrawalSubmission=exitSigned(withdrawal);
  transport.dropWithdraw=true;
  await assert.rejects(exitApi.submit(withdrawalSubmission),/SERVICE_UNAVAILABLE|DEVICE_NATIVE_WITHDRAW_REPLY_LOST/);
  const withdrawPostsBefore=transport.posts['/v1/mobile/device-exit/withdraw']-1;
  const withdrawHttp=transport.responses.filter(row=>row.path==='/v1/mobile/device-exit/withdraw').at(-1);assert.ok(withdrawHttp&&[200,504].includes(withdrawHttp.status));
  await awaitDeviceOwnerExecutionOriginalWorkV1(executionBridge);active();
  const observeExit=async()=>{const consent=await exitApi.challenge('OBSERVE_W39',{...await access(exitApi),jobId:prove.jobId});
   const value=await exitApi.submit(exitSigned(consent));assert.equal(value.stage,'CONFIRMED');assert.equal(value.statement.amount,amount);
   assert.equal(value.statement.commitment,subject.commitment);assert.equal(value.statement.nullifier,subject.nullifier);return value;};
  const exited=await observeExit(),exitReceipt=await runtime.receipt('0x'+exited.observation.transactionHash);
  await runtime.checkReceipt(exitReceipt);await runtime.assertCanonical(exitReceipt);assert.equal(exitReceipt.status,'0x1');
  const exitWires=runtime.transactions.filter(row=>row.label==='flat-account-device-exit');assert.equal(exitWires.length,exits.length+1);
  const w39=retainedProofs.get(recovery?'withdraw_balance:'+amount:'withdraw_balance');assert.ok(w39);assert.equal(exitWires.at(-1).request.data,encodeFlatTransaction('withdrawBalance',{proof:w39.proof,publicInputs:w39.publicInputs}));
  assert.equal(exitWires.at(-1).transactionHash,exitReceipt.transactionHash);withdrawn+=BigInt(amount);
  assert.equal((await runtime.balance(runtime.accounts[3]))-receiverRecipientBefore,withdrawn);
  const beforeExitApply=host.evidence(),localExit=await vault.applyDeviceExitConfirmation(exited);assert.equal(localExit.withdrawnAmount,amount);assert.equal(localExit.availableBalance,null);
  assert.ok(host.evidence().writes>beforeExitApply.writes);vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);
  const reopenedExit=await vault.readDeviceExitIntent(noteRole);assert.equal(reopenedExit.receipt.transactionHash,exited.observation.transactionHash);
  const finalBeforeRepeat=counts(),exitWrites=host.evidence().writes,repeatedExit=await observeExit();
  await vault.applyDeviceExitConfirmation(repeatedExit);assert.equal(host.evidence().writes,exitWrites);
  await assert.rejects(exitApi.submit(withdrawalSubmission));
  await assert.rejects(exitApi.challenge('WITHDRAW_W39',{...await access(exitApi),jobId:prove.jobId})); // original stage CONFIRMED cannot issue another withdrawal
  assert.deepEqual(counts(),finalBeforeRepeat);
  const exitReport={jobId:prove.jobId,parentJobId:jobId,noteRole,statement:exited.statement,observation:exited.observation,proofSHA256:exited.consentFields.proofSHA256,publicInputsSHA256:exited.consentFields.publicInputsSHA256,receipt:exitReceipt,
   originalWithdrawalAdmittedPosts:1,withdrawalHttpPosts:transport.posts['/v1/mobile/device-exit/withdraw']-withdrawPostsBefore,
   withdrawalRejectedReplayPostCount:transport.posts['/v1/mobile/device-exit/withdraw']-withdrawPostsBefore-1,confirmedWithdrawalChallengeRejected:true,withdrawalHttpStatus:withdrawHttp.status,clientReportedUnknown:true,originalWithdrawalWireCount:1,
   witnessPrivateKeyAbsent:true,custodyBeforeProof:beforeW39,encryptedSignedIntentBeforeProof:true,intentReopenedAfterProof:true,
   canonicalReceiptEncrypted:true,receiptReopened:true,repeatedLocalWrites:0,duplicateProofRejected:true,duplicateWithdrawalRejected:true,
   originalDeviceChangeOpening:noteRole==='change',originalDeviceRecoveryOpening:noteRole==='recovery',recipientDeltaAtomic:amount,availableBalance:null};
  exits.push(exitReport);save();
  }
  const final=await reader.read();await reader.assertCurrent(final);
  for(const exit of exits)assert.ok(final.ledger.nullifiers.includes('0x'+exit.statement.nullifier));
  assert.ok(final.ledger.nullifiers.includes('0x'+bare(decoded.statement.reserveNullifier)));
  assert.ok(final.ledger.nullifiers.includes('0x'+result.deviceNote.observation.nullifier));
  assert.equal(final.ledger.publicState.spent,recovery?4:3);assert.equal(final.ledger.publicState.actualAssetBalance,recovery?'0':'100');
  assert.equal(final.ledger.publicState.backedAmount,recovery?'0':'100');assert.equal(final.ledger.publicState.liveReservations,0);assert.equal(final.receiptLeaves.length,1);
  assert.equal((await account.ownerView()).balances.available,'0');assert.equal((await owner.ownerView.summary()).notes.source.status,'UNISSUED');
  assert.equal((await vault.readDeviceNote()).availableBalance,null);result.deviceExit=exits[0];if(recovery)result.deviceRecoveryExits=exits;
  result.economics={deviceAmountAtomic:'500',reserveAtomic:'100',changeWithdrawalAtomic:'400',remainingSolverPayoutAtomic:'100',
   poolActualAtomic:final.ledger.publicState.actualAssetBalance,poolBackedAtomic:final.ledger.publicState.backedAmount,liveReservations:0,
   nativeDeliveryAmountAtomic:'1000000',nativeDeliveryTransactions:1,sourceSpent:true,changeSpent:true,linuxOwnerAvailableAtomic:'0',
   recoveryAvailableBalance:null,solverPayoutExitEstablished:false};
  if(recovery){assert.equal(result.proofs.some(p=>p.relation==='node'||p.relation==='settlement'),false);
   for(const cm of result.deviceReservation.statement.outputs)if(cm!=='0'.repeat(64))assert.equal(final.ledger.commitments.includes('0x'+cm),false,'DEVICE_RECOVERY_NO_PAYOUT_NOTE');
   result.economics={deviceAmountAtomic:'500',reserveAtomic:'100',changeWithdrawalAtomic:'400',recoveryWithdrawalAtomic:'100',
    fullOwnerRefundAtomic:'500',recoveryIsSubsetOfReserve:true,solverPayoutAtomic:'0',poolActualAtomic:'0',poolBackedAtomic:'0',liveReservations:0,
    nativeDeliveryAmountAtomic:'1000000',nativeDeliveryTransactions:1,nativeProviderPrincipalLossAtomic:'1000000',nativeProviderGasLossAtomic:String(nativeGas),
    sourceSpent:true,changeSpent:true,recoverySpent:true,linuxOwnerAvailableAtomic:'0',solverPayoutExitEstablished:false};
   result.deviceOwnerNativeRecoveryNodeAcceptance=true;
  }else result.deviceOwnerNativeNodeAcceptance=true;result.nativeDeliveryCount=1;result.nativeGraphAcceptance=true;save();
  return{vault,close};
 }catch(error){close();throw error;}
}
