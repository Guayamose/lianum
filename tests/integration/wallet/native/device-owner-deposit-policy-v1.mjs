/** One actual D26 and one original funding wire; this report grants no
 * account/device authority and establishes no SecureStore or phone execution. */
import assert from 'node:assert/strict';
import { PRIVATE_RESOURCE_POLICY } from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
export const DEVICE_DEPOSIT_PROFILE_V1 = 'device-owner-deposit-v1';
export const DEVICE_DEPOSIT_RESULT_V1 = 'LIANUM_DEVICE_OWNER_DEPOSIT_RESULT_V1';
export const DEVICE_DEPOSIT_REAL_RELEASE_V1 = Object.freeze({
  format: 'REVIEWED_LOCAL_DEVICE_OWNER_DEPOSIT_RELEASE_V1', profile: DEVICE_DEPOSIT_PROFILE_V1,
  amountAtomic: '500', relations: ['deposit_balance'], localOnly: true,
  fakeFundsOnly: true, publicNetwork: false, phone: false,
});
export function assertDeviceDepositReleaseV1() {
  assert.equal(arguments.length, 0);
  assert.deepEqual(DEVICE_DEPOSIT_REAL_RELEASE_V1, {
    format: 'REVIEWED_LOCAL_DEVICE_OWNER_DEPOSIT_RELEASE_V1', profile: DEVICE_DEPOSIT_PROFILE_V1,
    amountAtomic: '500', relations: ['deposit_balance'], localOnly: true,
    fakeFundsOnly: true, publicNetwork: false, phone: false,
  }, 'DEVICE_DEPOSIT_RELEASE_ABSENT_OR_CHANGED');
}
export function assertDeviceDepositResultV1(result) {
  assert.equal(arguments.length, 1); assert.equal(result.format, DEVICE_DEPOSIT_RESULT_V1);
  assert.equal(result.profile, DEVICE_DEPOSIT_PROFILE_V1); assert.equal(result.phase, 'completed');
  assert.equal(result.success, true); assert.equal(result.interrupted, false); assert.equal(result.sourceUnchanged, true);
  assert.equal(result.localOnly, true); assert.equal(result.fakeFundsOnly, true);
  for (const key of ['publicNetwork','nativeGraphAcceptance','nativeProcessRestartEstablished',
    'keeperLossRecoveryEstablished','mobileNoteCustodyEstablished','tlsEstablished','reactRendererEstablished',
    'physicalPhoneEstablished','mobilePortfolioEstablished','independentInfrastructureEstablished','fullWalletAcceptance'])
    assert.equal(result[key], false, key);
  assert.equal(result.nativeExecution, null); assert.equal(result.nativeDeliveryCount, 0);
  assert.equal(result.deviceOwnerD26NodeAcceptance, true);
  assert.equal(result.proofs.length, 1); const proof = result.proofs[0];
  assert.equal(proof.relation, 'deposit_balance'); assert.equal(proof.publicWords, 26); assert.equal(proof.amountAtomic, '500');
  const evidence = proof.evidence;
  assert.deepEqual(evidence.policy, PRIVATE_RESOURCE_POLICY); assert.equal(evidence.phase, 'completed');
  assert.equal(evidence.acceptedResult, true); assert.equal(evidence.resourceReceiptCompleted, true);
  assert.equal(evidence.zeroKnowledgeEnabled, true); assert.equal(evidence.worker.verified, true);
  assert.equal(evidence.worker.zeroKnowledgeEnabled, true); assert.equal(evidence.threads, 1);
  assert.equal(evidence.maximumPages, 32768); assert.equal(evidence.worker.threads, 1);
  assert.equal(evidence.worker.maximumPages, 32768); assert.deepEqual(evidence.exit, { code: 0, signal: null });
  assert.equal(evidence.worker.proofSHA256, proof.proofSHA256);
  assert.equal(evidence.worker.publicInputsSHA256, proof.publicInputsSHA256);
  assert.equal(evidence.keySHA256, result.artifacts.noteKeys.deposit_balance);
  assert.equal(evidence.worker.keySHA256, evidence.keySHA256);
  const note = result.deviceNote;
  assert.equal(note.observation.commitment, note.localCommitment);
  assert.equal(note.observation.amount, '500'); assert.equal(note.observation.proofSHA256, proof.proofSHA256);
  assert.equal(note.observation.publicInputsSHA256, proof.publicInputsSHA256);
  assert.equal(note.receipt.status, '0x1'); assert.equal(note.receipt.transactionHash, '0x' + note.observation.transactionHash);
  assert.equal(note.receipt.blockHash, '0x' + note.observation.receiptBlockHash);
  assert.equal(note.originalSignedWireCount, 1); assert.equal(note.linuxNoteStatus, 'UNISSUED');
  assert.equal(note.linuxNoteObservedUnspent, false); assert.equal(note.transportKeyDifferentFromNoteKey, true);
  assert.equal(note.poolBacking.actualAssetBalance, '500'); assert.equal(note.poolBacking.backedAmount, '500');
  assert.equal(note.poolBacking.spent, 0); assert.equal(note.poolBacking.leaves, 1);
  assert.equal(note.proofHttp.status, 504); assert.equal(note.proofHttp.posts, 1);
  assert.equal(note.proofHttp.clientReportedUnknown, true); assert.equal(note.proofHttp.automaticRetry, false);
  assert.equal(note.fundHttp.actualAdmissionReplyDiscarded, true); assert.equal(note.fundHttp.posts, 1);
  assert.equal(note.fundHttp.clientReportedUnknown, true); assert.equal(note.fundHttp.automaticRetry, false);
  assert.equal(note.freshObservationSameOriginalWire, true); assert.equal(note.proveReplayRejected, true);
  assert.equal(note.fundReplayRejected, true); assert.equal(note.explicitFreshFundingRejected, true);
  assert.equal(note.signedConsentByteJoin, true); assert.equal(note.tlsVersion, 'TLSv1.3');
  assert.equal(note.custodyWitnessPrivateKeyAbsent, true); assert.equal(note.nativeBootstrapTransactions, 0);
  assert.equal(note.finalFinancialWireCount, 1); assert.equal(note.unrelatedOwnerCredit, '0');
  assert.equal(result.cleanup.mobileListeners.length, 1);
  assert.equal(result.cleanup.mobileListeners[0].closed, true);
  assert.equal(result.cleanup.mobileListeners[0].ownedSocketsRemaining, 0);
  for (const key of ['closedWalletListener','closedSession','closedAccount','closedOwner','closedBootstrap',
    'closedEvm','closedNativeEvm','syntheticOwnerStateRemoved','syntheticSessionJournalRemoved','syntheticAccountStateRemoved',
    'syntheticDeviceTlsMaterialRemoved']) assert.equal(result.cleanup[key], true, key);
  assert.equal(result.cleanup.errors.length, 0);
  assert.equal(result.cleanup.ownerStop.closed, true); assert.equal(result.cleanup.ownerStop.childExited, true);
  assert.equal(result.cleanup.ownerStop.generation, 1); assert.deepEqual(result.cleanup.ownerStop.exit, { code: 0, signal: null });
  for (const name of ['evm', 'nativeEvm']) {
    const { status, stop } = result.cleanup[name];
    assert.equal(status.stopped, true); assert.equal(status.exitObserved, true);
    assert.equal(status.exitCode, 0); assert.equal(status.signal, null); assert.equal(status.scratchRemoved, true);
    assert.equal(stop.pid, status.pid); assert.equal(stop.stopped, true); assert.equal(stop.forced, false);
    for (const field of ['exitObserved', 'exitCode', 'signal']) assert.equal(stop[field], status[field]);
  }
  return { deviceOwnerD26NodeAcceptance: true, mobileNoteCustodyEstablished: false,
    tlsEstablished: false, reactRendererEstablished: false, mobilePortfolioEstablished: false,
    physicalPhoneEstablished: false, nativeGraphAcceptance: false, fullWalletAcceptance: false };
}
