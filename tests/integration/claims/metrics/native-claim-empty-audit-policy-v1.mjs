/** Draft diagnostic policy; no financial acceptance or old release activation. */
import assert from 'node:assert/strict';

export const EMPTY_AUDIT_REAL_RUN_DISABLED = true;
export const EMPTY_AUDIT_PROFILE = 'FRESH_EMPTY_ORIGINAL_CLAIM_GRAPH_AUDIT_METRICS_V1';
export const EMPTY_AUDIT_RESULT = 'LIANUM_FRESH_EMPTY_ORIGINAL_AUDIT_METRICS_RESULT_V1';
export const EMPTY_AUDIT_ACTIVITY_SCOPE = 'ORIGINAL_V4_EPOCH_AND_PERSISTED_HISTORIES_ONLY';
export const EMPTY_AUDIT_ORDER = Object.freeze(['claim-0', 'claim-1', 'claim-2', 'graph-0', 'graph-1', 'graph-2']);

export function emptyAuditProcessFailure(processes) {
  const forbidden = new Set(['flat-proof-worker', 'golden-note-proof-worker', 'flat-proof-role',
    'flat-owner-role', 'golden-owner-role', 'recipient-role', 'native-ingress-v3-proof-worker',
    'native-ingress-v3-proof-role', 'native-value-live-v2-proof-worker', 'native-value-live-v2-proof-role',
    'wrapped-claim-proof-worker', 'wrapped-claim-proof-role', 'wrapped-owner-role']);
  return processes.some(row => row.proofWorker === true || forbidden.has(row.role))
    ? 'EMPTY_AUDIT_OWNER_OR_PROOF_PROCESS_FORBIDDEN' : null;
}

export function assertEmptyAuditActivity(value) {
  assert.equal(value.scope, EMPTY_AUDIT_ACTIVITY_SCOPE);
  assert.equal(value.originalHistoriesMeasured, true);
  assert.equal(value.totalKeyInvocationsMeasured, false);
  for (const phase of ['before', 'after']) {
    assert.equal(value[phase].claim.length, 4);
    assert.equal(value[phase].graph.length, 4);
    for (const branch of ['claim', 'graph']) {
      for (const row of value[phase][branch]) {
        assert.equal(row.schema, branch.toUpperCase() + '_PRIVATE_AUDIT_ACTIVITY_V1');
        assert.equal(row.epochScope, branch === 'claim'
          ? 'ORIGINAL_CLAIM_V4_KEY_LEASES_ONLY' : 'ORIGINAL_GRAPH_SIGNING_NOTIFICATIONS');
        assert.equal(row.originalHistoriesMeasured, true);
        assert.equal(row.totalKeyInvocationsMeasured, false);
        assert.equal(Number.isSafeInteger(row.keyUseEpoch), true);
        assert.equal(row.keyUseEpoch, 0);
        for (const name of ['authorizationCount', 'signedAuthorizationCount', 'factCount', 'signedFactCount']) {
          assert.equal(Number.isSafeInteger(row[name]), true);
          assert.equal(row[name], 0, 'EMPTY_AUDIT_HISTORIES_MUST_REMAIN_EMPTY');
        }
        if (branch === 'claim') {
          assert.equal(Number.isSafeInteger(row.retainedBindingCount), true);
          assert.equal(row.retainedBindingCount, 0);
        }
        for (const name of ['busy', 'branchClosed', 'branchPoisoned', 'custodyClosed', 'custodyPoisoned']) assert.equal(row[name], false);
      }
    }
  }
  assert.deepEqual(value.after, value.before, 'EMPTY_AUDIT_ACTIVITY_CHANGED');
}

export function assertEmptyAuditResult(value) {
  assert.equal(value.format, EMPTY_AUDIT_RESULT);
  assert.equal(value.profile, EMPTY_AUDIT_PROFILE);
  assert.equal(value.validationScope, 'BASE_EMPTY_AUDIT_MEASURED');
  assert.equal(value.phase, 'completed');
  assert.equal(value.success, true);
  for (const name of ['sourceUnchanged', 'localOnly', 'fakeFundsOnly', 'proofAttemptsUnchanged'])
    assert.equal(value[name], true);
  for (const name of ['loadedEquivalence', 'financialAcceptance', 'fullWalletAcceptance',
    'publicNetwork', 'independentOperators', 'nativeSelfCustody', 'payoutAuthorizationReproduced'])
    assert.equal(value[name], false);
  assert.deepEqual(value.proofs, []);
  assert.equal(Number.isSafeInteger(value.ownersCreated), true);
  assert.equal(value.ownersCreated, 0);
  assert.deepEqual(value.calls.map(row => row.label), EMPTY_AUDIT_ORDER);
  for (const row of value.calls) {
    assert.equal(row.completed, true);
    for (const name of ['wallMilliseconds', 'processCpuMicroseconds']) {
      assert.equal(Number.isFinite(row[name]), true);
      assert.ok(row[name] >= 0 && row[name] <= 3_600_000_000);
    }
    assert.equal(row.cpuScope, 'PROCESS_INTERVAL_INCLUDES_SIBLING_WORK');
  }
  assertEmptyAuditActivity(value.activity);
  assert.deepEqual(value.nativeEffects, { bitcoin: 0, solana: 0, graphBitcoin: 0, graphSolana: 0 });
  assert.equal(value.evmTransactionsAfterSetup, 0);
  assert.equal(value.emptyClaimState.length, 2);
  for (const row of value.emptyClaimState) {
    for (const name of ['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued',
      'reservedFees', 'intentCount', 'ticketCount']) assert.equal(row[name], '0');
    assert.equal(row.activePayout, '0'.repeat(64));
  }
  assert.equal(value.claimMetrics.length, 4);
  for (let index = 0; index < value.claimMetrics.length; index++) {
    const view = value.claimMetrics[index];
    assert.equal(view.schema, 'CLAIM_PRIVATE_OPERATION_METRICS_VIEW_V1');
    assert.equal(view.collectionIncomplete, false);
    assert.equal(view.reports.length, index < 3 ? 1 : 0);
    for (const report of view.reports) {
      assert.equal(report.incomplete, false);
      assert.equal(report.truncated, false);
      assert.equal(report.rpcCounts, null);
      assert.equal(report.keyUsageMeasured, false);
    }
  }
  for (const name of ['closedEvm', 'closedBitcoin', 'closedSolana']) assert.equal(value.cleanup[name], true);
  assert.deepEqual(value.cleanup.errors, []);
  assert.equal(value.cleanup.evmScratch.scratchRemoved, true);
  assert.equal(value.cleanup.bitcoin.result.syntheticWalletsAndLedgerRemoved, true);
  assert.equal(value.cleanup.bitcoin.result.forced, false);
  assert.equal(value.cleanup.solana.result.syntheticKeysAndLedgerRemoved, true);
  assert.equal(value.cleanup.solana.result.forced, false);
  return { scope: EMPTY_AUDIT_PROFILE, originalAuditCalls: 6, proofs: 0,
    originalV4EpochDelta: 0, newPersistedAuthorizations: 0, newPersistedFacts: 0,
    totalKeyInvocationsMeasured: false, loadedEquivalence: false, financialAcceptance: false };
}
