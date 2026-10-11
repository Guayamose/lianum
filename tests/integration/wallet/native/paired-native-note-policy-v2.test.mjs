/** Synthetic retained-report metadata only: no proof, runtime, signer or
 * financial capability is constructed by these tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PRIVATE_RESOURCE_POLICY } from '@lianum/engine/crypto/private-resource-policy';
import { PAIRED_NATIVE_NOTE_PROFILE_V2, PAIRED_NATIVE_NOTE_RESULT_V2,
  PAIRED_NATIVE_NOTE_CHECKS_V2, PAIRED_NATIVE_NOTE_REAL_RELEASE_V2, assertPairedNativeNoteReleaseV2, assertPairedNativeNoteResultV2 }
  from './paired-native-note-policy-v2.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const digest = mark => mark.repeat(64);
const uuid = mark => mark.repeat(8) + '-' + mark.repeat(4) + '-4' + mark.repeat(3) + '-8' + mark.repeat(3) + '-' + mark.repeat(12);
const copy = value => structuredClone(value);
function retainedReportMetadata() {
  const proofs = ['deposit_balance', 'withdraw_balance'].map((relation, index) => {
    const proofSHA256 = digest(String(index + 1)), publicInputsSHA256 = digest(String(index + 3)), keySHA256 = digest('a');
    return { relation, proofSHA256, publicInputsSHA256, publicWords: index === 0 ? 26 : 39, amountAtomic: '500',
      evidence: { id: uuid(String(index + 1)), telemetrySHA256: digest('d'),
        classification: 'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY', mode: relation,
        operation: 'prove', purpose: 'owner', phase: 'completed', acceptedResult: true, resourceReceiptCompleted: true,
        zeroKnowledgeEnabled: true, policy: copy(PRIVATE_RESOURCE_POLICY), threads: 1, maximumPages: 32768,
        keySHA256, exit: { code: 0, signal: null }, worker: { zeroKnowledgeEnabled: true,
          verified: true, threads: 1, maximumPages: 32768, keySHA256, proofSHA256, publicInputsSHA256,
          publicInputCount: index === 0 ? 26 : 39 } } };
  });
  const notes = proofs.map((proof, index) => {
    const amount = index === 0 ? '500' : '0', blockHash = digest(String(index + 5)), transactionHash = '0x' + digest(String(index + 7));
    const backing = { held: amount, liabilities: amount, surplus: '0', deficit: '0' };
    return { requestId: index === 0 ? 'paired_native_top_up_v2' : 'paired_native_exit_v2',
      kind: index === 0 ? 'TOP_UP' : 'EXIT', state: 'CONFIRMED', amountAtomic: '500', transactionHash,
      receipt: { transactionHash, status: '0x1', blockHash: '0x' + blockHash, blockNumber: '0x' + (index + 10).toString(16),
        gasUsed: '0xa', effectiveGasPrice: '0x32' },
      outcome: { blockHash, blockNumber: String(index + 10) },
      originalObservation: { status: 'LIVE', canonicalOutcomeBlockHash: blockHash, backing: copy(backing) },
      observedOwnerView: { status: 'LIVE', backing: copy(backing),
        balances: { available: amount, reserved: '0', recovery: '0', locked: '0' } },
      observedPool: { actualAssetBalance: amount, backedAmount: amount, liveReservations: 0, spent: index },
      originalTransactionCount: 1, actualCanonicalReceiptVerified: true, calldataJoinedToOriginalProof: true,
      proofSHA256: proof.proofSHA256 };
  });
  const checkpoint = { version: 1, identitySHA256: digest('b'), pending: null,
    acknowledged: { revision: 7, stateSHA256: digest('c') } };
  const ownerScope = { identitySHA256: digest('b'), keyScopeSHA256: digest('c'),
    processIdentitySHA256: digest('d'), processGeneration: 1 };
  const stopped = (pid) => { const status = { pid, stopped: true, exitObserved: true, exitCode: 0, signal: null, scratchRemoved: true };
    return { status, stop: { ...status, event: 'stopped-owned-process', forced: false, scratchRemoved: false } }; };
  const result = { format: PAIRED_NATIVE_NOTE_RESULT_V2, profile: PAIRED_NATIVE_NOTE_PROFILE_V2, runId: uuid('3'),
    phase: 'completed', success: true, interrupted: false, sourceUnchanged: true,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, nativeExecution: null,
    pairedOriginalAccountNodeAcceptance: true, nativeDeliveryCount: 0,
    artifacts: { noteKeys: { deposit_balance: digest('a'), withdraw_balance: digest('a') } }, proofs, notes,
    checks: Object.fromEntries(PAIRED_NATIVE_NOTE_CHECKS_V2.map(name => [name, true])),
    topUpAdmissionLoss: { executeHttpRequests: 1, discardedActualAdmissionReply: true, sdkReportedUnknown: true },
    mobileHttpReplyLoss: { actualHttpStatus: 200, responseBodyDeliveredToApi: false, diagnosticsPostsBefore: 1,
      diagnosticsPostsAfter: 2, noAutomaticResubmit: true, actualNetworkOutage: false },
    economics: { setupTransactions: 44, finalReceiverTransactions: 46, nativeBootstrapTransactions: 0,
      depositTransactions: 1, exitTransactions: 1, recipientDeltaAtomic: '500', payerDeltaAtomic: '1500',
      totalObservedGasCostAtomic: '1000', finalBacking: { held: '0', liabilities: '0', surplus: '0', deficit: '0' },
      finalPoolActualAtomic: '0', finalPoolBackedAtomic: '0', finalOwnerAvailableAtomic: '0', finalSpentCount: 1 },
    ownerRestart: { sameOriginalOwnerCapability: true, childExited: true, before: ownerScope,
      after: { ...ownerScope, processGeneration: 2 }, accountLifetimeBefore: digest('f'), accountLifetimeAfter: digest('f'),
      checkpointBefore: checkpoint, checkpointAfter: copy(checkpoint), checkpointBeforeSHA256: sha(JSON.stringify(checkpoint)),
      checkpointAfterSHA256: sha(JSON.stringify(checkpoint)), oldSignedReviewRejected: true, newOriginalKeyCreated: false },
    cleanup: { closedEvm: true, closedNativeEvm: true, closedOwner: true, closedAccount: true,
      closedSession: true, closedBootstrap: true, closedWalletListener: true, errors: [],
      syntheticOwnerStateRemoved: true, syntheticSessionJournalRemoved: true, syntheticAccountStateRemoved: true,
      ownerStop: { closed: true, childExited: true, generation: 2, exit: { code: 0, signal: null } },
      mobileListeners: [0, 1].map(() => ({ closed: true, listenerClosed: true, ownedSocketsRemaining: 0, originalDiagnosticsInFlight: 0 })),
      evm: stopped(100), nativeEvm: stopped(101) } };
  for (const field of ['nativeGraphAcceptance', 'nativeProcessRestartEstablished', 'keeperLossRecoveryEstablished',
    'mobileNoteCustodyEstablished', 'tlsEstablished', 'reactRendererEstablished', 'physicalPhoneEstablished',
    'mobilePortfolioEstablished', 'independentInfrastructureEstablished', 'fullWalletAcceptance']) result[field] = false;
  result.mobileRequests = ['read', 'reconcile', 'read', 'read', 'reconcile', 'read', 'reconcile'].map((action, index) => {
    const note = notes[index < 5 ? 0 : 1];
    return { requestId: note.requestId, action,
      binding: index === 1 ? null : { requestId: note.requestId, kind: note.kind, amountAtomic: '500', originalAccountLifetime: digest('f'),
        observedProcessGeneration: index < 3 ? 1 : 2, requestState: 'CONFIRMED', authorityStage: 'CONFIRMED',
        submission: { transactionHash: note.transactionHash.slice(2) } },
      admission: action === 'read' || index === 1 ? null : { admitted: true, action, requestId: note.requestId, state: 'SUCCEEDED', errorCode: null },
      originalHttpReplyLost: index === 1,
      originalSessionAdmission: index === 1 ? { sequence: 3, action: 'reconcile', requestId: note.requestId, state: 'SUCCEEDED', errorCode: null } : null,
      originalSessionRequest: index === 1 ? { requestId: note.requestId, kind: note.kind, state: 'CONFIRMED' } : null, consumedLeaseRejected: true, originalServerReplayRejected: true,
      noNewProofOrSend: true, transport: 'SIGNED_HTTPS_DESCRIPTOR_TRANSLATED_TO_OWNED_LOOPBACK_NO_TLS' };
  });
  return result;
}
function rejected(mutator) { const result = retainedReportMetadata(); mutator(result); assert.throws(() => assertPairedNativeNoteResultV2(result)); }
test('metadata-only accepted shape retains scope and the fixed release gate never accepts caller values', () => {
  const scope = assertPairedNativeNoteResultV2(retainedReportMetadata());
  assert.equal(scope.pairedOriginalAccountNodeAcceptance, true);
  assert.equal(scope.pairedOriginalPrivateStateReadNodeAcceptance, false); assert.equal(scope.physicalPhoneEstablished, false);
  assert.equal(scope.mobileNoteCustodyEstablished, false); assert.equal(scope.tlsEstablished, false);
  if (PAIRED_NATIVE_NOTE_REAL_RELEASE_V2 === null) assert.throws(() => assertPairedNativeNoteReleaseV2(), /RELEASE_ABSENT_OR_CHANGED/);
  else assert.equal(assertPairedNativeNoteReleaseV2(), true);
  assert.throws(() => assertPairedNativeNoteReleaseV2({}), /NO_OPTIONS/);
});
test('cached success cannot replace either specific genuine proof marker or joined bytes/settings', () => {
  for (const index of [0, 1]) {
    rejected(row => { row.proofs[index].evidence.acceptedResult = false; row.proofs[index].evidence.selfVerified = true; });
    rejected(row => { row.proofs[index].evidence.worker.proofSHA256 = digest('e'); });
    rejected(row => { row.proofs[index].evidence.worker.publicInputsSHA256 = digest('e'); });
    rejected(row => { row.proofs[index].evidence.policy.proofWorkerRSSLimit++; });
    rejected(row => { row.proofs[index].evidence.maximumPages++; });
    rejected(row => { row.proofs[index].evidence.worker.zeroKnowledgeEnabled = false; });
  }
  rejected(row => { row.proofs[1].publicWords = 26; });
  rejected(row => { row.proofs.push(copy(row.proofs[1])); });
});
test('actual-send inventory and financial observations are required independently from diagnostic flags', () => {
  rejected(row => { row.economics.finalReceiverTransactions++; });
  rejected(row => { row.economics.depositTransactions++; });
  rejected(row => { row.economics.nativeBootstrapTransactions++; });
  rejected(row => { row.economics.recipientDeltaAtomic = '0'; });
  rejected(row => { row.notes[0].receipt.gasUsed = '0xb'; });
  rejected(row => { row.notes[0].observedOwnerView.balances.available = '0'; });
  rejected(row => { row.notes[1].originalObservation.backing.liabilities = '500'; });
  rejected(row => { row.notes[1].receipt.blockHash = '0x' + digest('e'); });
  rejected(row => { row.topUpAdmissionLoss.executeHttpRequests++; });
  rejected(row => { row.mobileRequests[0].binding.requestState = 'PREPARED'; });
  rejected(row => { row.mobileRequests[1].originalSessionAdmission.state = 'FAILED'; });
  rejected(row => { row.mobileRequests[6].binding.submission.transactionHash = digest('e'); });
});
test('same encrypted checkpoint and new generation are required; permissions cannot cross requests or replay', () => {
  rejected(row => { row.ownerRestart.after.processGeneration = 1; });
  rejected(row => { row.ownerRestart.before.processGeneration = '1'; row.ownerRestart.after.processGeneration = '11';
    for (const [index, value] of row.mobileRequests.entries()) if (value.binding) value.binding.observedProcessGeneration = index < 3 ? '1' : '11'; });
  for (const name of ['identitySHA256', 'keyScopeSHA256', 'processIdentitySHA256']) rejected(row => {
    row.ownerRestart.before[name] = 'bad'; row.ownerRestart.after[name] = 'bad'; });
  rejected(row => { row.ownerRestart.accountLifetimeBefore = 'bad'; row.ownerRestart.accountLifetimeAfter = 'bad';
    for (const value of row.mobileRequests) if (value.binding) value.binding.originalAccountLifetime = 'bad'; });
  rejected(row => { row.ownerRestart.after.keyScopeSHA256 = digest('e'); });
  rejected(row => { row.ownerRestart.checkpointAfter.acknowledged.revision++; });
  rejected(row => { row.ownerRestart.checkpointAfter.acknowledged.revision++; row.ownerRestart.checkpointBefore.acknowledged.revision++; });
  rejected(row => { row.ownerRestart.accountLifetimeAfter = digest('e'); });
  rejected(row => { row.mobileRequests[3].binding.observedProcessGeneration = 1; });
  rejected(row => { row.mobileRequests[5].binding.requestId = row.notes[0].requestId; });
  rejected(row => { row.mobileRequests[1].consumedLeaseRejected = false; });
  rejected(row => { row.mobileHttpReplyLoss.responseBodyDeliveredToApi = true; });
});
test('malformed, widened scope, interrupted and incomplete original cleanup remain rejected metadata', () => {
  for (const row of [null, {}, { proofs: null }, { proofs: 3 }]) assert.throws(() => assertPairedNativeNoteResultV2(row));
  rejected(row => { row.proofs = {}; }); rejected(row => { row.mobileRequests = null; });
  rejected(row => { row.physicalPhoneEstablished = true; }); rejected(row => { row.interrupted = true; });
  rejected(row => { row.cleanup.errors.push({ name: 'owner', code: 'FAILED' }); });
  rejected(row => { row.cleanup.nativeEvm.stop.forced = true; });
  rejected(row => { row.cleanup.evm.stop.exitCode = 1; });
  rejected(row => { row.cleanup.mobileListeners[0].originalDiagnosticsInFlight = 1; });
  rejected(row => { row.cleanup.closedSession = false; });
  rejected(row => { row.cleanup.ownerStop.exit.signal = 'SIGKILL'; });
  for (const name of ['syntheticOwnerStateRemoved', 'syntheticSessionJournalRemoved', 'syntheticAccountStateRemoved'])
    rejected(row => { row.cleanup[name] = false; });
});

test('a cached diagnostic acceptance cannot claim private balance reading without both original state observations', () => {
  for (const missing of [undefined, [], [{ observation: { status: 'LIVE', balances: { available: '500' } } }]]) {
    rejected(row => { row.pairedOriginalPrivateStateReadNodeAcceptance = true; row.mobileStateReads = missing; });
  }
});


test('new device native happy profile stays closed before runtime or caller options', async () => {
 const {DEVICE_EXECUTION_REAL_RELEASE_V1,assertDeviceExecutionReleaseV1}=await import('./device-owner-execution-policy-v1.mjs');
 if(DEVICE_EXECUTION_REAL_RELEASE_V1===null)assert.throws(()=>assertDeviceExecutionReleaseV1(),/DEVICE_NATIVE_RELEASE_ABSENT_OR_CHANGED/);
 else assertDeviceExecutionReleaseV1();
 assert.throws(()=>assertDeviceExecutionReleaseV1({release:{},runtime:{}}));
 const {runDeviceOwnerExecutionFlowV1}=await import('./paired-native-note-flow-v2.mjs');
 await assert.rejects(runDeviceOwnerExecutionFlowV1({runtime:{},nativeExecution:{}}),/DEVICE_NATIVE_FIXED_NO_OPTIONS/);
 if(DEVICE_EXECUTION_REAL_RELEASE_V1===null)await assert.rejects(runDeviceOwnerExecutionFlowV1(),/DEVICE_NATIVE_RELEASE_ABSENT_OR_CHANGED/);
});


test('fixed device F profile rejects publication absence and caller resources', async () => {
 const {DEVICE_RECOVERY_REAL_RELEASE_V1,assertDeviceRecoveryReleaseV1}=await import('./device-owner-recovery-policy-v1.mjs');
 if(DEVICE_RECOVERY_REAL_RELEASE_V1===null)assert.throws(()=>assertDeviceRecoveryReleaseV1(),/DEVICE_NATIVE_RELEASE_ABSENT_OR_CHANGED/);
 else assertDeviceRecoveryReleaseV1();
 assert.throws(()=>assertDeviceRecoveryReleaseV1({cutoff:'0',executor:{}}));
 const {runDeviceOwnerRecoveryFlowV1}=await import('./paired-native-note-flow-v2.mjs');
 await assert.rejects(runDeviceOwnerRecoveryFlowV1({cutoff:'0',executor:{}}),/DEVICE_NATIVE_RECOVERY_FIXED_NO_OPTIONS/);
 if(DEVICE_RECOVERY_REAL_RELEASE_V1===null)await assert.rejects(runDeviceOwnerRecoveryFlowV1(),/DEVICE_NATIVE_RELEASE_ABSENT_OR_CHANGED/);
});


test('planned native economic successor accepts only its fixed reviewed release and zero-argument entry', async () => {
 const {NATIVE_DEVICE_ECONOMIC_REAL_RELEASE_V1,assertNativeDeviceEconomicReleaseV1}=await import('./native-device-economic-policy-v1.mjs');
 if(NATIVE_DEVICE_ECONOMIC_REAL_RELEASE_V1===null)assert.throws(()=>assertNativeDeviceEconomicReleaseV1(),/NATIVE_DEVICE_ECONOMIC_RELEASE_ABSENT_OR_CHANGED/);
 else assertNativeDeviceEconomicReleaseV1();
 assert.throws(()=>assertNativeDeviceEconomicReleaseV1({checkpoint:{},runtime:{},backend:()=>{}}));
 const {runNativeDeviceEconomicRecoveryFlowV1}=await import('./paired-native-note-flow-v2.mjs');
 await assert.rejects(runNativeDeviceEconomicRecoveryFlowV1({checkpoint:{},runtime:{}}),/NATIVE_DEVICE_ECONOMIC_FIXED_NO_OPTIONS/);
 if(NATIVE_DEVICE_ECONOMIC_REAL_RELEASE_V1===null)await assert.rejects(runNativeDeviceEconomicRecoveryFlowV1(),/NATIVE_DEVICE_ECONOMIC_RELEASE_ABSENT_OR_CHANGED/);
});

test('Native12 note recovery keeps a distinct null-by-default release and fixed entry', async () => {
 const {NATIVE_DEVICE_ECONOMIC_NOTE_REAL_RELEASE_V1,assertNativeDeviceEconomicNoteReleaseV1}=await import('./native-device-economic-note-policy-v1.mjs');
 if(NATIVE_DEVICE_ECONOMIC_NOTE_REAL_RELEASE_V1===null)assert.throws(()=>assertNativeDeviceEconomicNoteReleaseV1(),/NATIVE_DEVICE_ECONOMIC_NOTE_RELEASE_ABSENT_OR_CHANGED/);
 else assertNativeDeviceEconomicNoteReleaseV1();
 assert.throws(()=>assertNativeDeviceEconomicNoteReleaseV1({backend:'Wasm',checkpoint:{}}));
 const {runNativeDeviceEconomicNoteRecoveryFlowV1}=await import('./paired-native-note-flow-v2.mjs');
 await assert.rejects(runNativeDeviceEconomicNoteRecoveryFlowV1({backend:'Wasm',checkpoint:{}}),/NATIVE_DEVICE_ECONOMIC_NOTE_FIXED_NO_OPTIONS/);
 if(NATIVE_DEVICE_ECONOMIC_NOTE_REAL_RELEASE_V1===null)await assert.rejects(runNativeDeviceEconomicNoteRecoveryFlowV1(),/NATIVE_DEVICE_ECONOMIC_NOTE_RELEASE_ABSENT_OR_CHANGED/);
});
