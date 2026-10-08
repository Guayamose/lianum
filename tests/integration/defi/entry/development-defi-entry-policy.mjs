/** Result checks only. Cannot grant original protocol or private authority. */
import assert from 'node:assert/strict';
export const DEVELOPMENT_DEFI_ENTRY_PROFILE='FRESH_D27_UNISWAP_METAMORPHO_PRIVATE_ENTRY_EXIT_V1';
export const DEVELOPMENT_DEFI_ENTRY_RESULT='LIANUM_DEVELOPMENT_DEFI_ENTRY_RESULT_V1';
export function assertDevelopmentDefiEntryResult(value) {
  assert.equal(value.format,DEVELOPMENT_DEFI_ENTRY_RESULT);assert.equal(value.profile,DEVELOPMENT_DEFI_ENTRY_PROFILE);
  assert.equal(value.success,true);assert.equal(value.phase,'completed');
  for(const key of ['localOnly','fakeFundsOnly','sourceUnchanged','protocolInputPublic'])assert.equal(value[key],true);
  for(const key of ['publicNetwork','registeredLegAdmissionEstablished','privatePAEGConversionEstablished','graphExecutionEstablished','providerReimbursementEstablished',
    'independentOperators','nativeProcessRestartEstablished','keeperLossRecoveryEstablished','fullWalletAcceptance'])
    assert.equal(value[key],false,'DEVELOPMENT_DEFI_ENTRY_SCOPE');
  assert.equal(value.cleanup.closedEvm,true);assert.equal(value.cleanup.evm.stopped,true);assert.equal(value.cleanup.evm.scratchRemoved,true);
  assert.deepEqual(value.cleanup.errors,[]);assert.deepEqual(value.proofs.map(proof=>proof.relation),['deposit_intent','withdraw_balance','deposit_intent','withdraw_balance']);
  assert.equal(new Set(value.proofs.map(proof=>proof.proofSHA256)).size,4);
  for(const proof of value.proofs) {
    assert.match(proof.proofSHA256,/^[0-9a-f]{64}$/);assert.match(proof.publicInputsSHA256,/^[0-9a-f]{64}$/);
    assert.equal(proof.evidence.resourceReceiptCompleted,true,'DEVELOPMENT_DEFI_ORIGINAL_PROOF_CLEANUP');
    if(proof.relation==='deposit_intent') {
      assert.equal(proof.evidence.selfVerified,true);
      for(const field of ['manifestSHA256','resourcesSHA256','resultSHA256'])assert.match(proof.evidence[field],/^[0-9a-f]{64}$/);
    }else{assert.equal(proof.evidence.acceptedResult,true);assert.match(proof.evidence.telemetrySHA256,/^[0-9a-f]{64}$/);}
  }
  assert.deepEqual(value.cycles.map(cycle=>cycle.protocol),['UNISWAP_V3_EXACT_OUTPUT_SINGLE','METAMORPHO_V1_EXACT_SHARE_MINT']);
  assert.deepEqual(value.cycles.map(cycle=>cycle.outputAmount),['1000','1000000000000000000']);
  for(const cycle of value.cycles) {
    assert.ok(BigInt(cycle.inputSpent)>0n);
    for(const key of ['originalD27PrivateEntry','originalPrivateExit','ownerOfflineDuringDelivery','ownerAndCoordinatorRestartNoSend',
      'duplicateNoEffect','originalObservationCopyRejected','protocolAllowancesCleared','privateLiabilitiesClosed','publicOutput'])
      assert.equal(cycle[key],true,'DEVELOPMENT_DEFI_ORIGINAL_PRIVATE_LIFECYCLE');
  }
  assert.equal(value.cycles[1].metamorphoReplyDiscardAndOriginalReconcile,true);
  assert.equal(value.checks.originalProtocolPrivateEntryAndExit,true);
  return {scope:'PUBLIC_PROTOCOL_INPUT_D27_PRIVATE_OUTPUT_AND_ORIGINAL_EXIT',protocolInputPublic:true,
    originalPrivateProtocolEntry:true,originalPrivateExit:true,publicOutput:true,registeredLegAdmissionEstablished:false,privatePAEGConversionEstablished:false,
    graphExecutionEstablished:false,providerReimbursementEstablished:false,fullWalletAcceptance:false};
}
