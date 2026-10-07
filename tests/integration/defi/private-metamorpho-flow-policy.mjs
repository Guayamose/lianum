import assert from 'node:assert/strict';

export const PRIVATE_METAMORPHO_FLOW_RESULT = 'LIANUM_PRIVATE_METAMORPHO_FLOW_RESULT_V1';
export function assertPrivateMetaMorphoResult(value) {
  assert.equal(value.format, PRIVATE_METAMORPHO_FLOW_RESULT);
  assert.equal(value.success, true); assert.equal(value.phase, 'completed');
  for (const name of ['localOnly', 'fakeFundsOnly', 'sourceUnchanged']) assert.equal(value[name], true);
  for (const name of ['publicNetwork', 'keeperLossRecoveryEstablished', 'nativeProcessRestartEstablished',
    'privatePAEGConversionEstablished', 'fullWalletAcceptance']) assert.equal(value[name], false, 'PRIVATE_METAMORPHO_ACCEPTANCE_SCOPE');
  assert.equal(value.cleanup?.closedEvm, true, 'PRIVATE_METAMORPHO_ORIGINAL_NODE_CLEANUP');
  assert.equal(value.cleanup.evm?.stopped, true); assert.equal(value.cleanup.evm?.scratchRemoved, true);
  assert.deepEqual(value.proofs?.map(item => item.relation), ['deposit_balance', 'withdraw_balance'],
    'PRIVATE_METAMORPHO_TWO_GENUINE_NOTE_PROOFS');
  for (const proof of value.proofs) {
    assert.equal(proof.evidence?.acceptedResult, true, 'PRIVATE_METAMORPHO_PROOF_ACCEPTANCE');
    assert.match(proof.proofSHA256, /^[0-9a-f]{64}$/); assert.match(proof.publicInputsSHA256, /^[0-9a-f]{64}$/);
  }
  assert.notEqual(value.proofs[0].proofSHA256, value.proofs[1].proofSHA256);
  for (const name of ['originalPrivateShareFunding', 'originalNoteRestoredWithoutSend', 'originalPrivateExitAndBacking',
    'completedResponseDeliberatelyDiscarded', 'originalJournalRecoveryWithoutResend', 'underlyingRestoredAndPrivateLiabilitiesClosed'])
    assert.equal(value.checks?.[name], true, 'PRIVATE_METAMORPHO_ORIGINAL_LIFECYCLE');
  for (const requestId of ['metamorpho_share_funding', 'metamorpho_original_share_exit']) {
    for (const action of ['prepare', 'execute']) assert.ok(value.accountRequests.some(item => item.requestId === requestId
      && item.action === action && item.via === 'ORIGINAL_FLAT_ACCOUNT_HTTP'), 'PRIVATE_METAMORPHO_ACCOUNT_HTTP');
  }
  assert.equal(value.accepted?.shares, '1000000000000000000');
  assert.equal(value.accepted?.underlying, '1000000');
  assert.equal(value.accepted?.originalPrivateExitBound, true); assert.equal(value.accepted?.publicRedemption, true);
  assert.equal(value.accepted?.protocol, 'OFFICIAL_METAMORPHO');
  return { scope: 'PRIVATE_SHARE_NOTE_EXIT_AND_PUBLIC_METAMORPHO_REDEMPTION',
    originalPrivateExitBound: true, duplicateNoEffect: true, publicRedemption: true,
    nativeProcessRestartEstablished: false, privatePAEGConversionEstablished: false, fullWalletAcceptance: false };
}
