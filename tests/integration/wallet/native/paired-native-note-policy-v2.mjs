/** Fixed local two-note acceptance metadata only. No original authority or
 * financial observation is issued by accepting the retained report here. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PRIVATE_RESOURCE_POLICY } from '@lianum/engine/crypto/private-resource-policy';
import { normalizePrivateStateObservationV1 } from '@lianum/mobile-protocol/original-account-private-state-v1';
export const PAIRED_NATIVE_NOTE_PROFILE_V2 = 'paired-native-note-v2';
export const PAIRED_NATIVE_NOTE_RESULT_V2 = 'LIANUM_PAIRED_NATIVE_NOTE_RESULT_V2';
export const PAIRED_NATIVE_NOTE_REAL_RELEASE_V2 = Object.freeze({
  format: 'REVIEWED_LOCAL_PAIRED_NATIVE_NOTE_RELEASE_V2', profile: PAIRED_NATIVE_NOTE_PROFILE_V2,
  amountAtomic: '500', relations: Object.freeze(['deposit_balance', 'withdraw_balance']),
  localOnly: true, fakeFundsOnly: true, publicNetwork: false, mobileNoteCustody: false, tls: false,
});
/** A new local scope reviewed independently from all legacy release gates.
 * The literal stays closed until review; no caller may supply a substitute. */
export function assertPairedNativeNoteReleaseV2() {
  assert.equal(arguments.length, 0, 'PAIRED_NOTE_RELEASE_NO_OPTIONS');
  assert.deepEqual(PAIRED_NATIVE_NOTE_REAL_RELEASE_V2, {
    format: 'REVIEWED_LOCAL_PAIRED_NATIVE_NOTE_RELEASE_V2', profile: PAIRED_NATIVE_NOTE_PROFILE_V2,
    amountAtomic: '500', relations: ['deposit_balance', 'withdraw_balance'],
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, mobileNoteCustody: false, tls: false,
  }, 'PAIRED_NOTE_REAL_RELEASE_ABSENT_OR_CHANGED');
  return true;
}
export const PAIRED_NATIVE_NOTE_ECONOMICS_V2 = Object.freeze({ amountAtomic: '500',
  topUpRequestId: 'paired_native_top_up_v2', exitRequestId: 'paired_native_exit_v2' });
export const PAIRED_NATIVE_NOTE_CHECKS_V2 = Object.freeze([
  'genuineV5ArtifactsBeforeRuntime', 'originalNativeFactoryAndBootstrap',
  'originalNativeNoteConsentAndExactHttp', 'originalTopUpAdmissionReplyLostOnce',
  'genuineTopUpReceiptAndBacking', 'mobileOriginalHttpAndNobleSignatures',
  'genericMobileServiceWithoutBalances', 'mobileUnsignedDisclosureRejected',
  'mobileReadAndReconcileOnlyAlreadyAdmitted', 'originalMobileHttpReplyLostOnceNoRetry',
  'consumedMobilePermissionRejected', 'ownerChildRestartPreservedScopeAndCheckpoint',
  'oldMobileReviewRejectedAfterOwnerRestart', 'freshOriginalObservationAfterRestart',
  'genuineSourceExitReceiptAndBacking', 'crossRequestMobilePermissionRejected',
  'duplicateNoteRequestsNoProofOrSend', 'nativeBootstrapRuntimeUntouched',
  'exactTwoFreshOriginalProofReceipts', 'originalSourcesUnchanged',
]);
const digest = value => assert.match(value, /^[0-9a-f]{64}$/, 'PAIRED_NOTE_DIGEST');
const id = value => assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  'PAIRED_NOTE_PROOF_ATTEMPT');
export function assertPairedNativeNoteResultV2(result) {
  assert.equal(arguments.length, 1, 'PAIRED_NOTE_POLICY_NO_OPTIONS');
  assert.equal(result.format, PAIRED_NATIVE_NOTE_RESULT_V2);
  assert.equal(result.profile, PAIRED_NATIVE_NOTE_PROFILE_V2);
  id(result.runId); assert.equal(result.phase, 'completed'); assert.equal(result.success, true);
  assert.equal(result.interrupted, false); assert.equal(result.sourceUnchanged, true);
  assert.equal(result.localOnly, true); assert.equal(result.fakeFundsOnly, true);
  assert.equal(result.pairedOriginalAccountNodeAcceptance, true);
  for (const name of ['publicNetwork', 'nativeGraphAcceptance', 'nativeProcessRestartEstablished',
    'keeperLossRecoveryEstablished', 'mobileNoteCustodyEstablished', 'tlsEstablished',
    'reactRendererEstablished', 'physicalPhoneEstablished', 'mobilePortfolioEstablished',
    'independentInfrastructureEstablished', 'fullWalletAcceptance']) assert.equal(result[name], false);
  assert.equal(result.nativeExecution, null); assert.equal(result.nativeDeliveryCount, 0);
  assert.deepEqual(Object.keys(result.checks).sort(), [...PAIRED_NATIVE_NOTE_CHECKS_V2].sort());
  for (const name of PAIRED_NATIVE_NOTE_CHECKS_V2) assert.equal(result.checks[name], true, name);
  assert.ok(Array.isArray(result.proofs) && result.proofs.length === 2);
  assert.deepEqual(result.proofs.map(row => row.relation), ['deposit_balance', 'withdraw_balance']);
  assert.equal(new Set(result.proofs.map(row => row.evidence.id)).size, 2);
  assert.equal(new Set(result.proofs.map(row => row.proofSHA256)).size, 2);
  for (const [index, proof] of result.proofs.entries()) {
    for (const name of ['proofSHA256', 'publicInputsSHA256']) digest(proof[name]);
    assert.equal(proof.publicWords, index === 0 ? 26 : 39); assert.equal(proof.amountAtomic, '500');
    const evidence = proof.evidence; id(evidence.id); digest(evidence.telemetrySHA256);
    assert.equal(evidence.classification, 'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY');
    assert.equal(evidence.mode, proof.relation); assert.equal(evidence.operation, 'prove');
    assert.equal(evidence.purpose, 'owner'); assert.equal(evidence.phase, 'completed');
    assert.equal(evidence.acceptedResult, true); assert.equal(evidence.resourceReceiptCompleted, true);
    assert.deepEqual(evidence.policy, PRIVATE_RESOURCE_POLICY);
    assert.equal(evidence.threads, 1); assert.equal(evidence.maximumPages, 32768);
    assert.equal(evidence.worker.threads, 1); assert.equal(evidence.worker.maximumPages, 32768);
    for (const field of ['failureCode', 'telemetryWriteFailed', 'fallbackTelemetryWriteFailed']) assert.equal(evidence[field], undefined);
    assert.equal(evidence.zeroKnowledgeEnabled, true); assert.equal(evidence.worker.zeroKnowledgeEnabled, true);
    assert.equal(evidence.worker.verified, true); assert.deepEqual(evidence.exit, { code: 0, signal: null });
    assert.equal(evidence.worker.proofSHA256, proof.proofSHA256);
    assert.equal(evidence.worker.publicInputsSHA256, proof.publicInputsSHA256);
    assert.equal(evidence.worker.publicInputCount, proof.publicWords);
    digest(evidence.keySHA256); digest(result.artifacts.noteKeys[proof.relation]);
    assert.equal(evidence.keySHA256, result.artifacts.noteKeys[proof.relation]);
    assert.equal(evidence.worker.keySHA256, evidence.keySHA256);
  }
  assert.ok(Array.isArray(result.notes) && result.notes.length === 2);
  assert.deepEqual(result.notes.map(row => row.requestId), [PAIRED_NATIVE_NOTE_ECONOMICS_V2.topUpRequestId,
    PAIRED_NATIVE_NOTE_ECONOMICS_V2.exitRequestId]);
  assert.equal(new Set(result.notes.map(row => row.transactionHash)).size, 2);
  for (const [index, note] of result.notes.entries()) {
    assert.equal(note.kind, index === 0 ? 'TOP_UP' : 'EXIT'); assert.equal(note.state, 'CONFIRMED');
    assert.equal(note.amountAtomic, '500'); assert.equal(note.receipt.status, '0x1');
    assert.equal(note.transactionHash, note.receipt.transactionHash);
    assert.match(note.transactionHash, /^0x[0-9a-f]{64}$/); digest(note.outcome.blockHash);
    assert.equal(note.receipt.blockHash, '0x' + note.outcome.blockHash);
    assert.equal(BigInt(note.receipt.blockNumber).toString(), note.outcome.blockNumber);
    assert.equal(note.originalObservation.status, 'LIVE');
    assert.equal(note.originalObservation.canonicalOutcomeBlockHash, note.outcome.blockHash);
    const amount = index === 0 ? '500' : '0';
    assert.deepEqual(note.originalObservation.backing, { held: amount, liabilities: amount, surplus: '0', deficit: '0' });
    assert.deepEqual(note.observedOwnerView.backing, note.originalObservation.backing);
    assert.equal(note.observedOwnerView.status, 'LIVE');
    assert.deepEqual(note.observedOwnerView.balances, { available: amount, reserved: '0', recovery: '0', locked: '0' });
    assert.equal(note.observedPool.actualAssetBalance, amount); assert.equal(note.observedPool.backedAmount, amount);
    assert.equal(note.observedPool.liveReservations, 0); assert.equal(note.observedPool.spent, index);
    assert.equal(note.originalTransactionCount, 1); assert.equal(note.actualCanonicalReceiptVerified, true);
    assert.equal(note.calldataJoinedToOriginalProof, true);
    assert.equal(note.proofSHA256, result.proofs[index].proofSHA256);
  }
  assert.ok(Number.isSafeInteger(result.economics.setupTransactions) && result.economics.setupTransactions > 0);
  assert.equal(result.economics.finalReceiverTransactions, result.economics.setupTransactions + 2);
  assert.equal(result.economics.nativeBootstrapTransactions, 0);
  assert.equal(result.topUpAdmissionLoss.executeHttpRequests, 1);
  assert.equal(result.topUpAdmissionLoss.discardedActualAdmissionReply, true);
  assert.equal(result.topUpAdmissionLoss.sdkReportedUnknown, true);
  assert.equal(result.economics.depositTransactions, 1); assert.equal(result.economics.exitTransactions, 1);
  assert.equal(result.economics.recipientDeltaAtomic, '500');
  const observedGasCost = result.notes.reduce((sum, note) => sum + BigInt(note.receipt.gasUsed) * BigInt(note.receipt.effectiveGasPrice), 0n);
  assert.ok(observedGasCost > 0n); assert.equal(result.economics.totalObservedGasCostAtomic, String(observedGasCost));
  assert.equal(result.economics.payerDeltaAtomic, String(500n + BigInt(result.economics.totalObservedGasCostAtomic)));
  assert.deepEqual(result.economics.finalBacking, { held: '0', liabilities: '0', surplus: '0', deficit: '0' });
  assert.equal(result.economics.finalPoolActualAtomic, '0'); assert.equal(result.economics.finalPoolBackedAtomic, '0');
  assert.equal(result.economics.finalOwnerAvailableAtomic, '0'); assert.equal(result.economics.finalSpentCount, 1);
  const restart = result.ownerRestart;
  assert.equal(restart.sameOriginalOwnerCapability, true); assert.equal(restart.childExited, true);
  for (const scope of [restart.before, restart.after]) {
    assert.ok(Number.isSafeInteger(scope.processGeneration) && scope.processGeneration >= 1);
    for (const field of ['identitySHA256', 'keyScopeSHA256', 'processIdentitySHA256']) digest(scope[field]);
  }
  digest(restart.accountLifetimeBefore); digest(restart.accountLifetimeAfter);
  assert.equal(restart.after.processGeneration, restart.before.processGeneration + 1);
  for (const field of ['identitySHA256', 'keyScopeSHA256', 'processIdentitySHA256'])
    assert.equal(restart.after[field], restart.before[field]);
  assert.equal(restart.accountLifetimeAfter, restart.accountLifetimeBefore);
  digest(restart.checkpointBeforeSHA256); digest(restart.checkpointAfterSHA256);
  assert.equal(restart.checkpointBeforeSHA256, restart.checkpointAfterSHA256);
  for (const name of ['Before', 'After']) assert.equal(restart['checkpoint' + name + 'SHA256'],
    createHash('sha256').update(JSON.stringify(restart['checkpoint' + name])).digest('hex'));
  assert.deepEqual(restart.checkpointAfter, restart.checkpointBefore);
  assert.equal(restart.checkpointBefore.version, 1); assert.equal(restart.checkpointBefore.pending, null);
  assert.equal(restart.checkpointBefore.identitySHA256, restart.before.identitySHA256);
  assert.ok(Number.isSafeInteger(restart.checkpointBefore.acknowledged.revision) && restart.checkpointBefore.acknowledged.revision > 0);
  digest(restart.checkpointBefore.acknowledged.stateSHA256);
  assert.equal(restart.oldSignedReviewRejected, true); assert.equal(restart.newOriginalKeyCreated, false);
  const loss = result.mobileHttpReplyLoss;
  assert.equal(loss.actualHttpStatus, 200); assert.equal(loss.responseBodyDeliveredToApi, false);
  assert.ok(Number.isSafeInteger(loss.diagnosticsPostsBefore) && loss.diagnosticsPostsBefore >= 0);
  assert.equal(loss.diagnosticsPostsAfter, loss.diagnosticsPostsBefore + 1);
  assert.equal(loss.noAutomaticResubmit, true); assert.equal(loss.actualNetworkOutage, false);
  assert.ok(Array.isArray(result.mobileRequests) && result.mobileRequests.length === 7);
  assert.deepEqual(result.mobileRequests.map(row => row.action), ['read', 'reconcile', 'read', 'read', 'reconcile', 'read', 'reconcile']);
  for (const [index, row] of result.mobileRequests.entries()) {
    const note = result.notes[index < 5 ? 0 : 1];
    assert.equal(row.requestId, note.requestId); assert.equal(row.originalHttpReplyLost, index === 1);
    assert.equal(row.consumedLeaseRejected, true); assert.equal(row.originalServerReplayRejected, true);
    assert.equal(row.noNewProofOrSend, true);
    assert.equal(row.transport, 'SIGNED_HTTPS_DESCRIPTOR_TRANSLATED_TO_OWNED_LOOPBACK_NO_TLS');
    if (index === 1) {
      // No completed V2 response was delivered: retain the independent original
      // session admission/request, never construct a substitute mobile binding.
      assert.equal(row.binding, null); assert.equal(row.admission, null);
      const admission = row.originalSessionAdmission, request = row.originalSessionRequest;
      assert.equal(admission.action, 'reconcile'); assert.equal(admission.requestId, note.requestId);
      assert.equal(admission.state, 'SUCCEEDED'); assert.equal(admission.errorCode, null);
      assert.ok(Number.isSafeInteger(admission.sequence) && admission.sequence > 0);
      assert.equal(request.requestId, note.requestId); assert.equal(request.kind, note.kind); assert.equal(request.state, 'CONFIRMED');
      continue;
    }
    assert.equal(row.originalSessionAdmission, null); assert.equal(row.originalSessionRequest, null);
    assert.equal(row.binding.requestId, note.requestId); assert.equal(row.binding.kind, note.kind); assert.equal(row.binding.amountAtomic, '500');
    assert.equal(row.binding.originalAccountLifetime, restart.accountLifetimeBefore);
    assert.equal(row.binding.observedProcessGeneration, index < 3 ? restart.before.processGeneration : restart.after.processGeneration);
    assert.equal(row.binding.requestState, 'CONFIRMED'); assert.equal(row.binding.authorityStage, 'CONFIRMED');
    assert.equal(row.binding.submission.transactionHash, note.transactionHash.slice(2));
    if (row.action === 'read') assert.equal(row.admission, null);
    else {
      assert.equal(row.admission.admitted, true); assert.equal(row.admission.action, 'reconcile');
      assert.equal(row.admission.requestId, note.requestId); assert.equal(row.admission.state, 'SUCCEEDED');
      assert.equal(row.admission.errorCode, null);
    }
  }
  // Earlier diagnostic-only reports remain diagnostic-only. A new private
  // state scope needs both original observations and unchanged effect/journal
  // counts; an added true flag cannot upgrade an old report.
  assert.ok(result.pairedOriginalPrivateStateReadNodeAcceptance === undefined
    || typeof result.pairedOriginalPrivateStateReadNodeAcceptance === 'boolean');
  if (result.pairedOriginalPrivateStateReadNodeAcceptance === true) {
    assert.ok(Array.isArray(result.mobileStateReads) && result.mobileStateReads.length === 2);
    for (const [index, row] of result.mobileStateReads.entries()) {
      const note = result.notes[index], observed = normalizePrivateStateObservationV1(row.observation);
      assert.equal(observed.status, 'LIVE'); assert.equal(observed.binding.requestId, note.requestId);
      assert.equal(observed.binding.kind, note.kind);
      assert.equal(observed.binding.originalAccountLifetime, restart.accountLifetimeBefore);
      assert.equal(observed.binding.observedProcessGeneration, index === 0 ? restart.before.processGeneration : restart.after.processGeneration);
      assert.equal(observed.binding.submission.transactionHash, note.transactionHash.slice(2));
      assert.equal(observed.request.state, 'CONFIRMED'); assert.equal(observed.request.disposition, 'APPLIED');
      assert.deepEqual(observed.balances, note.observedOwnerView.balances);
      assert.deepEqual(observed.backing, note.observedOwnerView.backing);
      assert.deepEqual(row.before, row.after);
      assert.equal(row.before.proofs, index + 1); assert.equal(row.before.nativeTransactions, 0);
      assert.equal(row.journalRevisionBefore, row.journalRevisionAfter);
      assert.equal(row.admissionsBefore, row.admissionsAfter);
      assert.equal(row.transport, 'SIGNED_HTTPS_DESCRIPTOR_TRANSLATED_TO_OWNED_LOOPBACK_NO_TLS');
    }
  }
  assert.equal(result.cleanup.closedEvm, true); assert.equal(result.cleanup.closedNativeEvm, true);
  assert.equal(result.cleanup.closedOwner, true); assert.equal(result.cleanup.closedSession, true);
  assert.equal(result.cleanup.ownerStop.closed, true); assert.equal(result.cleanup.ownerStop.childExited, true);
  assert.equal(result.cleanup.ownerStop.generation, restart.after.processGeneration);
  assert.deepEqual(result.cleanup.ownerStop.exit, { code: 0, signal: null });
  assert.equal(result.cleanup.closedAccount, true); assert.equal(result.cleanup.closedBootstrap, true);
  assert.equal(result.cleanup.syntheticOwnerStateRemoved, true);
  assert.equal(result.cleanup.syntheticSessionJournalRemoved, true); assert.equal(result.cleanup.syntheticAccountStateRemoved, true);
  assert.deepEqual(result.cleanup.errors, []);
  assert.equal(result.cleanup.closedWalletListener, true);
  assert.ok(Array.isArray(result.cleanup.mobileListeners) && result.cleanup.mobileListeners.length === 2);
  for (const closed of result.cleanup.mobileListeners) {
    assert.equal(closed.closed, true); assert.equal(closed.listenerClosed, true);
    assert.equal(closed.ownedSocketsRemaining, 0); assert.equal(closed.originalDiagnosticsInFlight, 0);
  }
  for (const name of ['evm', 'nativeEvm']) {
    const row = result.cleanup[name];
    assert.equal(row.status.stopped, true); assert.equal(row.status.exitObserved, true);
    assert.equal(row.status.exitCode, 0); assert.equal(row.status.signal, null); assert.equal(row.status.scratchRemoved, true);
    assert.equal(row.stop.pid, row.status.pid); assert.equal(row.stop.stopped, true); assert.equal(row.stop.forced, false);
    for (const field of ['exitObserved', 'exitCode', 'signal']) assert.equal(row.stop[field], row.status[field]);
  }
  return Object.freeze({ pairedOriginalAccountNodeAcceptance: true,
    pairedOriginalPrivateStateReadNodeAcceptance: result.pairedOriginalPrivateStateReadNodeAcceptance === true,
    mobileNoteCustodyEstablished: false, tlsEstablished: false, reactRendererEstablished: false,
    physicalPhoneEstablished: false, mobilePortfolioEstablished: false, fullWalletAcceptance: false });
}
