/** Tail of the SAME original F profile after a planned complete backend capture.
 * The parent keeps only its mobile vault/key and signed clients. The successor
 * supplies read-only evidence from its actual original runtime/reader/receipts;
 * no fake runtime/account facade or authority is reconstructed in this PID. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {originalAccountAccessMessageV2} from '../../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import {deviceExecutionConsentMessageV1} from '../../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
import {deviceExitConsentMessageV1,wipeDeviceExitWitnessV1} from '../../../../packages/mobile-protocol/src/device-exit-consent-v1.mjs';
import {encodeFlatTransaction,FLAT_TRANSACTION_METHODS} from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import {privateFailureDiagnostic} from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import {join} from 'node:path';
import {writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
import {privateNativeEconomicSuccessorFirstErrorV1} from './native-device-economic-private-error-v1.mjs';
import {captureAndLaunchNativeDeviceEconomicSuccessorV1,captureAndLaunchNativeDeviceNoteEconomicSuccessorV1} from './native-device-economic-launcher-v1.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),bare=s=>s.startsWith('0x')?s.slice(2):s;
export async function runNativeDeviceEconomicOriginalContinuationV1(context){
 assert.equal(arguments.length,1);assert.equal(context.deviceEconomicRecovery,true);assert.equal(context.deviceRecovery,true);
 const{result,host,descriptor,deviceKey,transport,stage,save,active,retainedProofs}=context;
 const jobId=result.deviceReservation.jobId,rootId=result.deviceCustody.sameRoot;
 let vault=context.vault,nativeApi,exitApi,outputApi,pendingExit,witness,successor,lastAudit,closed=false;
 const{signDeviceMessage}=await context.fromApp('custody/signing.mjs');
 const signed=consent=>({consent,signature:signDeviceMessage(deviceKey,deviceExecutionConsentMessageV1(consent))});
 const exitSigned=consent=>({consent,signature:signDeviceMessage(deviceKey,deviceExitConsentMessageV1(consent))});
 const access=async api=>{active();const value=await api.access();return{access:value,signature:signDeviceMessage(deviceKey,originalAccountAccessMessageV2(value))};};
 const audit=async()=>{const value=await successor.audit();active();assert.equal(value.profile,'ORIGINAL_NATIVE_ECONOMIC_SUCCESSOR_PUBLIC_AUDIT_V1');
  assert.equal(value.processId,successor.processId);assert.equal(value.sourceSHA256,successor.report.sourceSHA256);
  assert.equal(value.status.outcome,'RECOVERED');assert.equal(value.status.executionSnapshot.outcome,'RECOVERED');
  assert.equal(value.originalReceiptTreeValid,true);assert.equal(value.linuxSourceStatus,'UNISSUED');assert.equal(value.linuxAvailable,'0');
  assert.equal(value.counts.native,1);lastAudit=value;context.economicLifetime.publicAudit=value;return value;};
 const counts=()=>({proofs:result.proofs.length,...lastAudit.counts});
 function close(){if(closed)return;closed=true;pendingExit?.close();wipeDeviceExitWitnessV1(witness);nativeApi?.close();exitApi?.close();outputApi?.close();vault?.close();}
 async function readOutputs(phase,states){
  await stage('device-original-output-balance-'+phase);
  const before=counts(),writes=host.evidence().writes,subject=await vault.readDeviceOutputBalanceSubject();
  assert.equal(subject.parentJobId,jobId);assert.equal(subject.rootId,rootId);
  const permission=await access(outputApi),readPosts=transport.posts['/v1/mobile/device-execution/output-balances']??0,
   handle=await outputApi.observe({...permission,...subject});
  assert.equal(transport.posts['/v1/mobile/device-execution/output-balances'],readPosts+1);
  const value=host.outputBalance.readDeviceOutputBalanceV1(handle),original=await audit();
  assert.equal(value.authorizationSHA256,sha(originalAccountAccessMessageV2(permission.access)));
  assert.equal(value.reservationTransactionHash,result.deviceReservation.observation.transactionHash);assert.equal(value.sourceNullifier,result.deviceNote.observation.nullifier);
  assert.equal(value.sourceNullifierSpent,true);assert.equal(value.nativeOutcome,'RECOVERED');assert.deepEqual(value.observed,original.head);
  assert.ok(original.ledger.nullifiers.includes('0x'+value.sourceNullifier));
  for(const[role,amount]of[['change','400'],['recovery','100']]){const row=value[role];assert.equal(row.commitment,result.deviceCustody[role+'Commitment']);
   assert.equal(row.nullifier,subject[role+'Nullifier']);assert.equal(row.amount,amount);assert.equal(row.state,states[role]);
   assert.deepEqual(row.path,original.ledger.paths[row.commitment]);assert.equal(original.ledger.nullifiers.includes('0x'+row.nullifier),row.state==='SPENT');}
  await vault.applyDeviceOutputBalances(handle);const local=(await vault.readDeviceNote()).localReservation;
  assert.equal(local.assetIdentity,value.poolTerms.assetIdentity);assert.equal(local.domainCommitment,value.poolTerms.domainCommitment);
  const notes={};let available=0n;
  for(const role of['change','recovery']){const row=local[role],expected=states[role]==='UNSPENT'?value[role].amount:'0';
   assert.equal(row.availableBalance,expected);assert.equal(row.amount,value[role].amount);assert.equal(row.commitment,value[role].commitment);
   assert.equal(row.state,states[role]==='SPENT'?'WITHDRAWN':'UNSPENT');assert.equal(row.freshness,'OBSERVED_AT_RETAINED_HEAD');
   assert.equal(row.observation.headHash,value.observed.blockHash);notes[role]=row;available+=BigInt(expected);}
  await vault.applyDeviceOutputBalances(handle);await audit();assert.deepEqual(counts(),before);assert.equal(host.evidence().writes,writes);
  result.deviceOutputBalances.reads.push({phase,response:value,local:notes,sameAssetAvailableAtomic:available.toString(),countsBefore:before,countsAfter:counts(),
   encryptedWritesBefore:writes,encryptedWritesAfter:host.evidence().writes,originalReadPosts:transport.posts['/v1/mobile/device-execution/output-balances']-readPosts,
   originalHeadAndLedgerMatched:true,repeatedApplyNoWrites:true,originalReaderInSuccessor:true});save();
 }
 try{
  await stage('original-F-lost-reply-capture-all-backend-sections-before-terminal-apply');
  assert.equal(result.proofs.length,7);const mobileBefore=await vault.readDeviceExecutionIntent();assert.equal(mobileBefore.outcome,null);
  assert.equal((await vault.readDeviceNote()).availableBalance,null);
  successor=await (context.deviceEconomicNativeNotes?captureAndLaunchNativeDeviceNoteEconomicSuccessorV1:captureAndLaunchNativeDeviceEconomicSuccessorV1)(context);await audit();
  assert.deepEqual(await vault.readDeviceExecutionIntent(),mobileBefore,'DEVICE_CUSTODY_UNCHANGED_BY_BACKEND_CAPTURE');
  nativeApi=await host.execution.createDeviceOwnerExecutionApiV1(descriptor);exitApi=await host.exit.createDeviceOwnerExitApiV1(descriptor);
  outputApi=await host.outputBalance.createDeviceOwnerOutputBalanceApiV1(descriptor);
  await stage('new-process-fresh-signed-reconciliation-of-same-original-F');
  const reconcile=async()=>{const consent=await nativeApi.challenge('RECONCILE_NATIVE',{...await access(nativeApi),jobId}),reply=await nativeApi.submit(signed(consent));
   assert.equal(reply.stage,'RECOVERED');assert.equal(reply.outcome,'RECOVERED');assert.equal(reply.executionSnapshot.admittedReceipts,1);
   assert.equal(reply.executionSnapshot.executionStarted,true);assert.deepEqual(reply.executionSnapshot.nativeExposure,[{slot:0,family:'3',status:'ADMITTED'}]);return reply;};
  const observed=await reconcile(),terminal=observed.terminal,first=await audit(),receipt=first.terminal.receipt,wire=first.terminal.wire,decoded=first.terminal.decoded;
  assert.deepEqual(observed.terminal,first.status.terminal);assert.deepEqual(observed.executionSnapshot,first.status.executionSnapshot);
  assert.equal(receipt.transactionHash,'0x'+terminal.transactionHash);assert.equal(receipt.status,'0x1');
  assert.equal(wire.request.to,context.system.pools[0].address);assert.equal(wire.request.data.slice(2,10),FLAT_TRANSACTION_METHODS.recoverGeneric.selector);
  assert.equal(sha(Buffer.from(wire.request.data.slice(2),'hex')),terminal.calldataSHA256);assert.equal(decoded.kind,'recovery');
  assert.deepEqual(decoded.request,retainedProofs.get('original-timeout-recovery'));
  const beforeApply=host.evidence(),applied=await vault.applyDeviceExecutionTerminal(observed);
  assert.equal(applied.outcome,'RECOVERED');assert.equal(applied.localOpeningsPreserved,true);assert.equal(applied.availableBalance,null);assert.ok(host.evidence().writes>beforeApply.writes);
  vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);assert.equal((await vault.readDeviceExecutionIntent()).transactionHash,terminal.transactionHash);
  const sqlBeforeRepeat=context.deviceDurableSQL?await context.durableInfrastructure.snapshot():null;
  const beforeRepeat=counts(),writes=host.evidence().writes,repeated=await reconcile();await vault.applyDeviceExecutionTerminal(repeated);await audit();
  assert.deepEqual(counts(),beforeRepeat);assert.equal(host.evidence().writes,writes);assert.deepEqual(repeated.terminal,terminal);
  if(context.deviceDurableSQL){const sqlAfterRepeat=await context.durableInfrastructure.snapshot();assert.deepEqual(sqlAfterRepeat,sqlBeforeRepeat);assert.equal(sqlAfterRepeat.length,4);context.result.durableOriginalAdmission.reconciliationNoSqlEffectRows=true;}
  // Recovered account's original effect gate rejects new execution/recovery;
  // no used consent is renewed and no old job/wire is retried after reopen.
  for(const action of['EXECUTE_NATIVE','RECOVER_NATIVE']){const posts=transport.posts[action==='EXECUTE_NATIVE'?'/v1/mobile/device-execution/execute':'/v1/mobile/device-execution/recover']??0;
   const review=await nativeApi.challenge(action,{...await access(nativeApi),jobId});await assert.rejects(vault.retainDeviceExecutionIntent(review));
   await assert.rejects(nativeApi.submit(signed(review)),/SERVICE_UNAVAILABLE/);await audit();assert.deepEqual(counts(),beforeRepeat);
   assert.equal(transport.posts[action==='EXECUTE_NATIVE'?'/v1/mobile/device-execution/execute':'/v1/mobile/device-execution/recover'],posts+1);}
  const nativeRecord=first.nativeWire,nativeReceipt=nativeRecord.receipt,nativeGas=BigInt(nativeReceipt.gasUsed)*BigInt(nativeReceipt.effectiveGasPrice);
  assert.equal(nativeRecord.phase,'mined');assert.equal(nativeReceipt.status,'0x1');assert.equal(BigInt(nativeRecord.request.value),1000000n);
  assert.equal(BigInt(first.nativeBalances.recipient)-context.recipientBefore,1000000n);
  assert.equal(context.senderBefore-BigInt(first.nativeBalances.sender),1000000n+nativeGas);
  result.deviceNative={jobId,nativeBindingSHA256:observed.nativeBindingSHA256,terminal,receipt,reserveNullifier:bare(decoded.statement.reserveNullifier),
   originalSHash:result.deviceReservation.observation.transactionHash,originalFundingHash:result.deviceNote.observation.transactionHash,
   executionSnapshot:observed.executionSnapshot,originalExecuteAdmittedPosts:1,executeHttpPosts:transport.posts['/v1/mobile/device-execution/execute'],
   executeRejectedPostCount:transport.posts['/v1/mobile/device-execution/execute']-1,recoveryRejectedPostCount:transport.posts['/v1/mobile/device-execution/recover']-1,
   executionHttpStatus:context.executionHttp.status,clientReportedUnknown:true,repeatedReconciliationNoEffects:true,duplicateExecuteRejected:true,recoveryAfterTerminalRejected:true,
   recoveryAfterTRejected:false,encryptedIntentBeforeExecute:true,intentReopenedBeforeExecute:true,terminalEncrypted:true,terminalReopened:true,repeatedTerminalWrites:0,
   localOpeningsPreserved:true,independentMobileCanonicalRpc:false,nativeWire:{transactionHash:nativeRecord.transactionHash,receipt:nativeReceipt,amountAtomic:'1000000',recipientDeltaAtomic:'1000000',
    senderDeltaAtomic:String(1000000n+nativeGas),gasCostAtomic:String(nativeGas)}};save();
  const local=(await vault.readDeviceNote()).localReservation;assert.equal(local.changeAvailableBalance,null);assert.equal(local.recoveryAvailableBalance,null);
  result.deviceOutputBalances.terminalReopenAvailableUnknown=true;await readOutputs('after-F',{change:'UNSPENT',recovery:'UNSPENT'});
  const exits=[];let withdrawn=0n;
  for(const[noteRole,amount]of[['change','400'],['recovery','100']]){
   await stage('new-process-original-'+noteRole+'-W39-same-device-opening');const subject=await vault.readDeviceExitSubject(noteRole,bare(context.runtime.accounts[3]));
   assert.equal(subject.parentJobId,jobId);assert.equal(subject.amount,amount);assert.equal(subject.commitment,result.deviceCustody[noteRole+'Commitment']);
   const quoteHandle=await exitApi.preparation({...await access(exitApi),...Object.fromEntries(['parentJobId','noteRole','rootId','noteRevision','nullifier','recipient'].map(name=>[name,subject[name]]))});
   const quote=host.exit.readDeviceExitQuoteV1(quoteHandle);assert.equal(quote.nativeBindingSHA256,observed.nativeBindingSHA256);
   pendingExit=await vault.createDeviceExitProofRequest(quoteHandle);const signedIntent=await vault.readDeviceExitIntent(noteRole);
   assert.equal(signedIntent.phase,'SIGNED');assert.equal(signedIntent.jobId,pendingExit.jobId);const beforeW39=host.evidence();assert.ok(beforeW39.maximumStoredValueBytes<=2048);
   const prove=await exitApi.challengeJob({...await access(exitApi),quoteId:pendingExit.quoteId,jobId:pendingExit.jobId,witnessSHA256:pendingExit.witnessSHA256});
   witness=await vault.bindDeviceExitProofRequest(pendingExit,prove);assert.equal(Object.hasOwn(witness,'privateKey'),false);assert.equal(Object.hasOwn(witness,'root'),true);
   const proofSubmission={...exitSigned(prove),witness};await assert.rejects(exitApi.submit(proofSubmission),/SERVICE_UNAVAILABLE/);
   const proofHttp=transport.responses.filter(row=>row.path==='/v1/mobile/device-exit/jobs');assert.equal(proofHttp.length,exits.length+1);assert.equal(proofHttp.at(-1).status,504);
   await successor.wait();const proofAudit=await audit(),originalProof=proofAudit.exits.find(row=>row.status.jobId===prove.jobId);
   assert.ok(originalProof);await context.onProof({label:originalProof.label,relation:originalProof.relation,proof:originalProof.proof});
   assert.equal(result.proofs.length,8+exits.length);pendingExit.close();wipeDeviceExitWitnessV1(witness);witness=null;
   const noReproof=counts();await assert.rejects(exitApi.submit(proofSubmission));await audit();assert.deepEqual(counts(),noReproof);
   vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);assert.deepEqual(await vault.readDeviceExitIntent(noteRole),signedIntent);
   const withdrawal=await exitApi.challenge('WITHDRAW_W39',{...await access(exitApi),jobId:prove.jobId}),submission=exitSigned(withdrawal);
   const withdrawPostsBefore=transport.posts['/v1/mobile/device-exit/withdraw']??0;transport.dropWithdraw=true;
   await assert.rejects(exitApi.submit(submission),/SERVICE_UNAVAILABLE|DEVICE_NATIVE_WITHDRAW_REPLY_LOST/);
   const withdrawHttp=transport.responses.filter(row=>row.path==='/v1/mobile/device-exit/withdraw').at(-1);assert.ok(withdrawHttp&&[200,504].includes(withdrawHttp.status));
   await successor.wait();await audit();
   const observeExit=async()=>{const consent=await exitApi.challenge('OBSERVE_W39',{...await access(exitApi),jobId:prove.jobId}),value=await exitApi.submit(exitSigned(consent));
    assert.equal(value.stage,'CONFIRMED');assert.equal(value.statement.amount,amount);assert.equal(value.statement.commitment,subject.commitment);assert.equal(value.statement.nullifier,subject.nullifier);return value;};
   const exited=await observeExit(),original=await audit(),row=original.exits.find(item=>item.status.jobId===prove.jobId);assert.ok(row?.receipt&&row.wire);
   assert.equal(row.receipt.transactionHash,'0x'+exited.observation.transactionHash);assert.equal(row.receipt.status,'0x1');
   const w39=retainedProofs.get('withdraw_balance:'+amount);assert.ok(w39);assert.equal(row.wire.request.data,encodeFlatTransaction('withdrawBalance',{proof:w39.proof,publicInputs:w39.publicInputs}));
   withdrawn+=BigInt(amount);assert.equal(BigInt(original.receiverRecipientBalance)-context.receiverRecipientBefore,withdrawn);
   const beforeExitApply=host.evidence(),localExit=await vault.applyDeviceExitConfirmation(exited);assert.equal(localExit.withdrawnAmount,amount);assert.equal(localExit.availableBalance,null);
   assert.ok(host.evidence().writes>beforeExitApply.writes);vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);
   assert.equal((await vault.readDeviceExitIntent(noteRole)).receipt.transactionHash,exited.observation.transactionHash);
   const beforeExitRepeat=counts(),exitWrites=host.evidence().writes,repeatedExit=await observeExit();await vault.applyDeviceExitConfirmation(repeatedExit);
   assert.equal(host.evidence().writes,exitWrites);await assert.rejects(exitApi.submit(submission));await assert.rejects(exitApi.challenge('WITHDRAW_W39',{...await access(exitApi),jobId:prove.jobId}));
   await audit();assert.deepEqual(counts(),beforeExitRepeat);
   exits.push({jobId:prove.jobId,parentJobId:jobId,noteRole,statement:exited.statement,observation:exited.observation,proofSHA256:exited.consentFields.proofSHA256,
    publicInputsSHA256:exited.consentFields.publicInputsSHA256,receipt:row.receipt,originalWithdrawalAdmittedPosts:1,
    withdrawalHttpPosts:transport.posts['/v1/mobile/device-exit/withdraw']-withdrawPostsBefore,withdrawalRejectedReplayPostCount:transport.posts['/v1/mobile/device-exit/withdraw']-withdrawPostsBefore-1,
    confirmedWithdrawalChallengeRejected:true,withdrawalHttpStatus:withdrawHttp.status,clientReportedUnknown:true,originalWithdrawalWireCount:1,witnessPrivateKeyAbsent:true,custodyBeforeProof:beforeW39,
    encryptedSignedIntentBeforeProof:true,intentReopenedAfterProof:true,canonicalReceiptEncrypted:true,receiptReopened:true,repeatedLocalWrites:0,duplicateProofRejected:true,duplicateWithdrawalRejected:true,
    originalDeviceChangeOpening:noteRole==='change',originalDeviceRecoveryOpening:noteRole==='recovery',recipientDeltaAtomic:amount,availableBalance:null});save();
   const reopened=(await vault.readDeviceNote()).localReservation;assert.equal(reopened.changeAvailableBalance,null);assert.equal(reopened.recoveryAvailableBalance,null);
   await readOutputs('after-W39-'+noteRole,{change:'SPENT',recovery:noteRole==='recovery'?'SPENT':'UNSPENT'});
  }
  vault.close();vault=host.original.openLocalRootNoteVaultV1(rootId);const reopened=(await vault.readDeviceNote()).localReservation;
  assert.equal(reopened.changeAvailableBalance,null);assert.equal(reopened.recoveryAvailableBalance,null);result.deviceOutputBalances.finalReopenAvailableUnknown=true;
  await readOutputs('after-final-reopen',{change:'SPENT',recovery:'SPENT'});const final=await audit();
  for(const exit of exits)assert.ok(final.ledger.nullifiers.includes('0x'+exit.statement.nullifier));
  for(const nf of[bare(decoded.statement.reserveNullifier),result.deviceNote.observation.nullifier])assert.ok(final.ledger.nullifiers.includes('0x'+nf));
  assert.equal(final.ledger.publicState.spent,4);assert.equal(final.ledger.publicState.actualAssetBalance,'0');assert.equal(final.ledger.publicState.backedAmount,'0');assert.equal(final.ledger.publicState.liveReservations,0);
  for(const cm of result.deviceReservation.statement.outputs)if(cm!=='0'.repeat(64))assert.equal(final.ledger.commitments.includes('0x'+cm),false);
  assert.equal((await vault.readDeviceNote()).availableBalance,null);result.deviceExit=exits[0];result.deviceRecoveryExits=exits;
  result.economics={deviceAmountAtomic:'500',reserveAtomic:'100',changeWithdrawalAtomic:'400',recoveryWithdrawalAtomic:'100',fullOwnerRefundAtomic:'500',recoveryIsSubsetOfReserve:true,
   solverPayoutAtomic:'0',poolActualAtomic:'0',poolBackedAtomic:'0',liveReservations:0,nativeDeliveryAmountAtomic:'1000000',nativeDeliveryTransactions:1,
   nativeProviderPrincipalLossAtomic:'1000000',nativeProviderGasLossAtomic:String(nativeGas),sourceSpent:true,changeSpent:true,recoverySpent:true,linuxOwnerAvailableAtomic:'0',solverPayoutExitEstablished:false};
  if(context.deviceDurableSQL){const rows=await context.durableInfrastructure.snapshot();assert.equal(rows.length,6);context.result.durableOriginalAdmission.newProcessObservationOnly=true;}
  const stopped=await successor.close();result.cleanup.successor=stopped;assert.equal(stopped.originalBackendStopped,true);context.economicLifetime.successorClosed=true;
  result.deviceEconomicRestart.originalProofsAfterRestart=result.proofs.length;result.deviceEconomicRestart.noPreCaptureReproof=true;
  result.deviceEconomicRestart.sameOriginalSAndF=true;result.deviceEconomicRestart.successorClosed=true;result.deviceEconomicRestart.freshSignedReconciliationAfterReopen=true;
  result.deviceOwnerNativeRecoveryNodeAcceptance=true;result.nativeProcessRestartEstablished=true;result.keeperLossRecoveryEstablished=false;
  result.nativeDeliveryCount=1;result.nativeGraphAcceptance=true;result.nativeDeviceEconomicRestartNodeAcceptance=true;save();return{vault,close};
 }catch(error){
  // Preserve the original parent failure BEFORE waiting for owned cleanup.
  // This existing parser retains only error enums and fixed source locations.
  try{writeFixturePrivate(join(context.privateDirectory,'parent-tail-first-error-private.json'),privateNativeEconomicSuccessorFirstErrorV1(error));}
  catch{/* Diagnostic storage cannot replace the original error or its cleanup. */}
  close();if(successor)await successor.close().catch(cleanup=>{context.result.cleanup.errors.push({name:'economic-successor',code:privateFailureDiagnostic(cleanup,'NATIVE_ECONOMIC_SUCCESSOR_CLEANUP_FAILED').code});});throw error;}
}
