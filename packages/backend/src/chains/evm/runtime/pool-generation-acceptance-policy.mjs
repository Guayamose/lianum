/** Both launches are disabled. Each requires its own reviewed source checkpoint
 * and exclusive release. No caller flag, env value or options can enable one. */
import assert from 'node:assert/strict';
export const POOL_GENERATION_PHASE1_RELEASE = null;
export const POOL_GENERATION_PHASE2_RELEASE = null;
export const PHASE1_FORMAT = 'FLAT_POOL_GENERATION_PHASE1_RESULT_V1';
export const PHASE2_FORMAT = 'FLAT_POOL_GENERATION_PHASE2_RESULT_V1';
export const POOL_GENERATION_LIMITS = Object.freeze({ maximumRegisteredPools: 8, globalCapacity: 64,
  actualRegisteredPools: 3, actualSuccessors: 1 });
export const PHASE2_PROOFS = Object.freeze(['deposit_balance', 'deposit_balance', 'withdraw_balance', 'withdraw_balance']);
export function assertPoolGenerationPhase1Result(result) {
  common(result, PHASE1_FORMAT);
  assert.deepEqual(result.proofs, []);
  assert.equal(result.userDeposits, 0);
  for (const key of ['completeRuntimeAndConstructors', 'actualCurrentReader', 'exactRejectionSelectors',
    'originalDescriptorRetained', 'originalOwnerHandoffReconciled', 'registeredReplyWithheld',
    'prospectiveDescriptorRetained', 'oldRouteReadableDuringSuccessorOutage', 'furtherAppendFenced'])
    assert.equal(result.checks[key], true, 'POOL_PHASE1_MISSING_' + key);
  assert.equal(result.fundedRecoveryAcceptance, false);
  assert.equal(result.recoveryProofAcceptance, false);
  const pending = result.retainedProspectiveRuntime;
  assert.equal(pending.allConstructorImmutables, true); assert.equal(pending.completeRuntime, true);
  assert.equal(pending.runtimeBytes, 22577); assert.equal(pending.generationCapabilityReturned, false);
  assert.equal(pending.address, result.retainedProspective.address); assert.equal(pending.codeHash, result.retainedProspective.codeHash);
  assert.deepEqual(result.rejections.rejections.map(row => row.expectedError), ['RegistrarRequired','PoolNotPinned',
    'ProspectivePoolRequired','PoolProvenanceRequired','PoolProvenanceRequired','PoolSuccessorMismatch','PoolSuccessorMismatch']);
  for (const rejection of result.rejections.rejections) {
    assert.equal(rejection.kind, 'READ_ONLY_ETH_CALL_REJECTION_NOT_MINED'); assert.match(rejection.selector, /^0x[0-9a-f]{8}$/);
  }
  assert.equal(result.rejections.originalRegistrationIdempotent, true); assert.equal(result.rejections.stateUnchanged, true);
  assert.equal(result.rejections.noTransactionsSubmitted, true);
  return { scope: 'ONE_UNFUNDED_V2_APPEND_ORIGINAL_OWNER_HANDOFF', oldFundedGenerationAcceptance: false };
}
export function assertPoolGenerationPhase2Result(result) {
  common(result, PHASE2_FORMAT);
  assert.deepEqual(result.proofs.map(row => row.relation), PHASE2_PROOFS);
  assert.deepEqual(result.economics, { originalDeposit: '7', successorDeposit: '5', originalExit: '7',
    successorExit: '5', finalOriginalBacking: '0', finalSuccessorBacking: '0', totalSupply: '1000000' });
  for (const key of ['beforeFundPreflight', 'originalFundedBeforeAppend', 'sameOriginalCatalogue',
    'sameOriginalSession', 'sameOriginalBindings', 'sameAssetAmbiguityRejected', 'explicitOwnerGenerationSelection',
    'successorOwnReviewAndConsent', 'sdkTopUpExit', 'successorAmountsUnknownDuringOutage',
    'originalExitDuringSuccessorOutage', 'originalReconcileNoSendAndGraphRecoveryStillBlocked', 'allBackingConserved',
    'noOriginalNoteMigration']) assert.equal(result.checks[key], true, 'POOL_PHASE2_MISSING_' + key);
  assert.equal(result.userDeposits, 2);
  assert.equal(result.recoveryProofAcceptance, false);
  for (const requestId of ['generation_old_topup','generation_new_topup','generation_new_exit','generation_old_exit'])
    for (const action of ['prepare','execute']) assert.ok(result.sdkEvidence.some(row => row.requestId === requestId
      && row.action === action && row.via === 'NODE_SDK_EXACT_ONLY_HTTP' && row.httpAdmission === 'VOLATILE_UI_QUEUE_ONLY'
      && row.originalJournalState === (action === 'prepare' ? 'PREPARED' : 'CONFIRMED')));
  assert.equal(result.exitReviewBindings.length, 4);
  for (const requestId of ['generation_new_exit','generation_old_exit']) for (const action of ['prepare','execute']) {
    const rows = result.exitReviewBindings.filter(row => row.requestId === requestId && row.action === action);
    assert.equal(rows.length, 1); const row = rows[0];
    for (const value of [row.generationId,row.domainCommitment,row.observed.blockHash]) assert.match(value,/^[0-9a-f]{64}$/);
    assert.match(row.pool,/^[0-9a-f]{40}$/); assert.match(row.observed.blockNumber,/^(0|[1-9][0-9]*)$/);
  }
  assert.equal(result.finalPools.length, 3);
  for (const pool of result.finalPools) { assert.equal(pool.backedAmount,'0'); assert.equal(pool.actualAssetBalance,'0');
    assert.equal(pool.liveReservations,0); }
  return { scope: 'ONE_SAME_ASSET_SUCCESSOR_ORIGINAL_FUNDED_NOTE_PRESERVED', oldFundedGenerationAcceptance: true };
}
function common(result, format) {
  assert.equal(result.format, format); assert.equal(result.phase, 'completed'); assert.equal(result.success, true);
  assert.equal(result.oneExecutionReleaseConsumed, true);
  assert.equal(result.sourceUnchanged, true); assert.equal(result.cleanup.closedEvm, true);
  assert.equal(result.localOnly, true); assert.equal(result.fakeFundsOnly, true); assert.equal(result.publicNetwork, false);
  assert.deepEqual(result.limits, POOL_GENERATION_LIMITS);
  assert.deepEqual(result.runtimeClosure.ledger.map(row => row.role), ['poseidon2Domains','hubCodec','poolRegistryCodec','hub','pool','pool']);
  for (const row of result.runtimeClosure.ledger) {
    assert.equal(row.exactCompleteRuntime, true); assert.match(row.codeHash,/^0x[0-9a-f]{64}$/);
    assert.match(row.runtimeSHA256,/^[0-9a-f]{64}$/); assert.ok(row.runtimeBytes > 0 && row.runtimeBytes <= 24576);
    if (row.role === 'hub') assert.equal(row.runtimeBytes,24415);
    if (row.role === 'pool') assert.equal(row.runtimeBytes,22577);
    if (row.role === 'poolRegistryCodec') assert.equal(row.runtimeBytes,5979);
  }
  assert.equal(result.runtimeClosure.verifierCount, 12); assert.equal(result.runtimeClosure.normalEvmLimits, true);
  for (const [key,value] of Object.entries({ MAX_REGISTERED_POOLS:8n,CAPACITY:64n,pinnedPoolCount:3n,registeredPoolCount:3n }))
    assert.equal(BigInt(result.finalRegistry.globals[key]),value);
  const original = result.originalGeneration;
  assert.match(original.generationId,/^[0-9a-f]{64}$/); assert.equal(original.poolCount,2);
  assert.match(original.descriptorSHA256,/^[0-9a-f]{64}$/); assert.equal(original.descriptorAfterSHA256,original.descriptorSHA256);
  assert.equal(original.bindingsBefore.length,1); assert.deepEqual(original.bindingsAfter,original.bindingsBefore);
  assert.equal(original.bindingsBefore[0].generationId,original.generationId);
  assert.equal(original.bindingsBefore[0].requestId,'generation_old_topup');
  for (const proof of result.proofs) { assert.match(proof.proofSHA256,/^[0-9a-f]{64}$/); assert.match(proof.publicInputsSHA256,/^[0-9a-f]{64}$/); }

  for (const key of ['fullWalletAcceptance', 'graphAcceptance', 'genericNativeValueAcceptance', 'keeperRestart',
    'nodeRestart', 'noteMigration', 'paddingReclaimed', 'repeatedRollover', 'performanceClaim']) assert.equal(result[key], false);
}
