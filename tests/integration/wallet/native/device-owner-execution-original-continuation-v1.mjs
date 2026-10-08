/** Fixed happy continuation of the original DEVICE D26/U/S, not a bootstrap.
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
  await awaitDeviceOwnerExecutionOriginalWorkV1(executionBridge);active();
  assert.equal(transport.posts['/v1/mobile/device-execution/execute'],1);
  assert.equal(nativeRuntime.transactions.length,beforeNative.native+1);
  assert.equal(result.proofs.length,11,'DEVICE_NATIVE_D26_U_S_P_R_I_N4_T');
  await stage('device-fresh-original-terminal-reconciliation-without-resend');
  const reconcile=async()=>{const consent=await nativeApi.challenge('RECONCILE_NATIVE',{...await access(nativeApi),jobId});
   const reply=await nativeApi.submit(signed(consent));assert.equal(reply.stage,'FULFILLED');assert.equal(reply.outcome,'FULFILLED');
   assert.equal(reply.executionSnapshot.admittedReceipts,1);assert.equal(reply.executionSnapshot.executionStarted,true);
   assert.deepEqual(reply.executionSnapshot.nativeExposure,[{slot:0,family:'3',status:'ADMITTED'}]);return reply;};
  const observed=await reconcile(),terminal=observed.terminal;
  const receipt=await runtime.receipt('0x'+terminal.transactionHash);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);assert.equal(receipt.status,'0x1');
  const wire=runtime.transactions.filter(row=>row.transactionHash===receipt.transactionHash);assert.equal(wire.length,1);
  assert.equal(wire[0].request.to,system.pools[0].address);assert.equal(wire[0].request.data.slice(2,10),FLAT_TRANSACTION_METHODS.fulfillGeneric.selector);
  assert.equal(sha(Buffer.from(wire[0].request.data.slice(2),'hex')),terminal.calldataSHA256);
  const decoded=decodeNativeValueTerminalCalldata(wire[0].request.data);assert.equal(decoded.kind,'settlement');
  assert.deepEqual(decoded.request.settlement,retainedProofs.get('global-fulfillment'));
  assert.deepEqual(decoded.request.completions,Array.from({length:4},(_,i)=>retainedProofs.get('slot-'+i+'-completion')));
  const beforeApply=host.evidence(),applied=await vault.applyDeviceExecutionTerminal(observed);
  assert.equal(applied.outcome,'FULFILLED');assert.equal(applied.localOpeningsPreserved,true);assert.equal(applied.availableBalance,null);
  assert.ok(host.evidence().writes>beforeApply.writes);
  vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);
  assert.equal((await vault.readDeviceExecutionIntent()).transactionHash,terminal.transactionHash);
  const beforeRepeat=counts(),localWrites=host.evidence().writes,repeated=await reconcile();
  await vault.applyDeviceExecutionTerminal(repeated);assert.deepEqual(counts(),beforeRepeat);assert.equal(host.evidence().writes,localWrites);
  assert.deepEqual(repeated.terminal,terminal);
  // New signed EXECUTE and RECOVER after T are explicit NEGATIVES. They cannot
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
   executeRejectedPostCount:transport.posts['/v1/mobile/device-execution/execute']-1,recoveryRejectedPostCount:transport.posts['/v1/mobile/device-execution/recover'],executionHttpStatus:executionHttp.status,clientReportedUnknown:true,
   repeatedReconciliationNoEffects:true,duplicateExecuteRejected:true,recoveryAfterTRejected:true,encryptedIntentBeforeExecute:true,
   intentReopenedBeforeExecute:true,terminalEncrypted:true,terminalReopened:true,repeatedTerminalWrites:0,
   localOpeningsPreserved:true,independentMobileCanonicalRpc:false,nativeWire:{transactionHash:nativeRecord.transactionHash,receipt:nativeReceipt,
    amountAtomic:'1000000',recipientDeltaAtomic:'1000000',senderDeltaAtomic:String(1000000n+nativeGas),gasCostAtomic:String(nativeGas)}};save();
  await stage('device-original-change-opening-W39-separate-consents');
  const subject=await vault.readDeviceExitSubject('change',bare(runtime.accounts[3]));
  assert.equal(subject.parentJobId,jobId);assert.equal(subject.amount,'400');assert.equal(subject.commitment,result.deviceCustody.changeCommitment);
  const quoteHandle=await exitApi.preparation({...await access(exitApi),...Object.fromEntries(
   ['parentJobId','noteRole','rootId','noteRevision','nullifier','recipient'].map(name=>[name,subject[name]]))});
  const quote=host.exit.readDeviceExitQuoteV1(quoteHandle);assert.equal(quote.nativeBindingSHA256,observed.nativeBindingSHA256);
  pendingExit=await vault.createDeviceExitProofRequest(quoteHandle);
  const signedIntent=await vault.readDeviceExitIntent('change');assert.equal(signedIntent.phase,'SIGNED');assert.equal(signedIntent.jobId,pendingExit.jobId);
  const beforeW39=host.evidence();assert.ok(beforeW39.maximumStoredValueBytes<=2048);
  const prove=await exitApi.challengeJob({...await access(exitApi),quoteId:pendingExit.quoteId,jobId:pendingExit.jobId,witnessSHA256:pendingExit.witnessSHA256});
  witness=await vault.bindDeviceExitProofRequest(pendingExit,prove);assert.equal(Object.hasOwn(witness,'privateKey'),false);assert.equal(Object.hasOwn(witness,'root'),true); // root is PUBLIC Merkle root, never AES root
  const proofSubmission={...exitSigned(prove),witness};
  await assert.rejects(exitApi.submit(proofSubmission),/SERVICE_UNAVAILABLE/);
  const proofHttp=transport.responses.filter(row=>row.path==='/v1/mobile/device-exit/jobs');assert.equal(proofHttp.length,1);assert.equal(proofHttp[0].status,504);
  await awaitDeviceOwnerExecutionOriginalWorkV1(executionBridge);active();
  pendingExit.close();wipeDeviceExitWitnessV1(witness);witness=null;
  assert.equal(result.proofs.length,12);
  const noReproof=counts();await assert.rejects(exitApi.submit(proofSubmission));assert.deepEqual(counts(),noReproof); // exact retained consent is consumed or expired, never a new job
  vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);assert.deepEqual(await vault.readDeviceExitIntent('change'),signedIntent);
  const withdrawal=await exitApi.challenge('WITHDRAW_W39',{...await access(exitApi),jobId:prove.jobId}),withdrawalSubmission=exitSigned(withdrawal);
  transport.dropWithdraw=true;
  await assert.rejects(exitApi.submit(withdrawalSubmission),/SERVICE_UNAVAILABLE|DEVICE_NATIVE_WITHDRAW_REPLY_LOST/);
  const withdrawHttp=transport.responses.find(row=>row.path==='/v1/mobile/device-exit/withdraw');assert.ok(withdrawHttp&&[200,504].includes(withdrawHttp.status));
  await awaitDeviceOwnerExecutionOriginalWorkV1(executionBridge);active();
  const observeExit=async()=>{const consent=await exitApi.challenge('OBSERVE_W39',{...await access(exitApi),jobId:prove.jobId});
   const value=await exitApi.submit(exitSigned(consent));assert.equal(value.stage,'CONFIRMED');assert.equal(value.statement.amount,'400');
   assert.equal(value.statement.commitment,subject.commitment);assert.equal(value.statement.nullifier,subject.nullifier);return value;};
  const exited=await observeExit(),exitReceipt=await runtime.receipt('0x'+exited.observation.transactionHash);
  await runtime.checkReceipt(exitReceipt);await runtime.assertCanonical(exitReceipt);assert.equal(exitReceipt.status,'0x1');
  const exitWires=runtime.transactions.filter(row=>row.label==='flat-account-device-exit');assert.equal(exitWires.length,1);
  const w39=retainedProofs.get('withdraw_balance');assert.ok(w39);assert.equal(exitWires[0].request.data,encodeFlatTransaction('withdrawBalance',{proof:w39.proof,publicInputs:w39.publicInputs}));
  assert.equal(exitWires[0].transactionHash,exitReceipt.transactionHash);assert.equal((await runtime.balance(runtime.accounts[3]))-receiverRecipientBefore,400n);
  const beforeExitApply=host.evidence(),localExit=await vault.applyDeviceExitConfirmation(exited);assert.equal(localExit.withdrawnAmount,'400');assert.equal(localExit.availableBalance,null);
  assert.ok(host.evidence().writes>beforeExitApply.writes);vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);
  const reopenedExit=await vault.readDeviceExitIntent('change');assert.equal(reopenedExit.receipt.transactionHash,exited.observation.transactionHash);
  const finalBeforeRepeat=counts(),exitWrites=host.evidence().writes,repeatedExit=await observeExit();
  await vault.applyDeviceExitConfirmation(repeatedExit);assert.equal(host.evidence().writes,exitWrites);
  await assert.rejects(exitApi.submit(withdrawalSubmission));
  await assert.rejects(exitApi.challenge('WITHDRAW_W39',{...await access(exitApi),jobId:prove.jobId})); // original stage CONFIRMED cannot issue another withdrawal
  assert.deepEqual(counts(),finalBeforeRepeat);
  const final=await reader.read();await reader.assertCurrent(final);
  assert.ok(final.ledger.nullifiers.includes('0x'+subject.nullifier));assert.ok(final.ledger.nullifiers.includes('0x'+bare(decoded.statement.reserveNullifier)));
  assert.ok(final.ledger.nullifiers.includes('0x'+result.deviceNote.observation.nullifier));assert.equal(final.ledger.publicState.spent,3);assert.equal(final.ledger.publicState.actualAssetBalance,'100');assert.equal(final.ledger.publicState.backedAmount,'100');
  assert.equal(final.ledger.publicState.liveReservations,0);assert.equal(final.receiptLeaves.length,1);
  assert.equal((await account.ownerView()).balances.available,'0');assert.equal((await owner.ownerView.summary()).notes.source.status,'UNISSUED');
  assert.equal((await vault.readDeviceNote()).availableBalance,null);
  result.deviceExit={jobId:prove.jobId,parentJobId:jobId,noteRole:'change',statement:exited.statement,observation:exited.observation,proofSHA256:exited.consentFields.proofSHA256,publicInputsSHA256:exited.consentFields.publicInputsSHA256,receipt:exitReceipt,
   originalWithdrawalAdmittedPosts:1,withdrawalHttpPosts:transport.posts['/v1/mobile/device-exit/withdraw'],
   withdrawalRejectedReplayPostCount:transport.posts['/v1/mobile/device-exit/withdraw']-1,confirmedWithdrawalChallengeRejected:true,withdrawalHttpStatus:withdrawHttp.status,clientReportedUnknown:true,originalWithdrawalWireCount:1,
   witnessPrivateKeyAbsent:true,custodyBeforeProof:beforeW39,encryptedSignedIntentBeforeProof:true,intentReopenedAfterProof:true,
   canonicalReceiptEncrypted:true,receiptReopened:true,repeatedLocalWrites:0,duplicateProofRejected:true,duplicateWithdrawalRejected:true,
   originalDeviceChangeOpening:true,recipientDeltaAtomic:'400',availableBalance:null};
  result.economics={deviceAmountAtomic:'500',reserveAtomic:'100',changeWithdrawalAtomic:'400',remainingSolverPayoutAtomic:'100',
   poolActualAtomic:final.ledger.publicState.actualAssetBalance,poolBackedAtomic:final.ledger.publicState.backedAmount,liveReservations:0,
   nativeDeliveryAmountAtomic:'1000000',nativeDeliveryTransactions:1,sourceSpent:true,changeSpent:true,linuxOwnerAvailableAtomic:'0',
   recoveryAvailableBalance:null,solverPayoutExitEstablished:false};
  result.deviceOwnerNativeNodeAcceptance=true;result.nativeDeliveryCount=1;result.nativeGraphAcceptance=true;save();
  return{vault,close};
 }catch(error){close();throw error;}
}
