/** Host policy regression only. This object is not native evidence. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertEmptyAuditActivity, assertEmptyAuditResult, EMPTY_AUDIT_RESULT, EMPTY_AUDIT_PROFILE, EMPTY_AUDIT_ORDER, emptyAuditProcessFailure, EMPTY_AUDIT_ACTIVITY_SCOPE }
  from './native-claim-empty-audit-policy-v1.mjs';

function activity() {
  const before = Object.fromEntries(['claim', 'graph'].map(branch => [branch,
    Array.from({ length: 4 }, () => ({ schema: branch.toUpperCase() + '_PRIVATE_AUDIT_ACTIVITY_V1',
      epochScope: branch === 'claim' ? 'ORIGINAL_CLAIM_V4_KEY_LEASES_ONLY' : 'ORIGINAL_GRAPH_SIGNING_NOTIFICATIONS',
      keyUseEpoch: 0, originalHistoriesMeasured: true, totalKeyInvocationsMeasured: false,
      authorizationCount: 0, signedAuthorizationCount: 0, factCount: 0, signedFactCount: 0,
      ...(branch === 'claim' ? { retainedBindingCount: 0 } : {}),
      busy: false, branchClosed: false, branchPoisoned: false, custodyClosed: false, custodyPoisoned: false }))]));
  return { scope: EMPTY_AUDIT_ACTIVITY_SCOPE, originalHistoriesMeasured: true,
    totalKeyInvocationsMeasured: false, before, after: structuredClone(before) };
}

test('empty audit policy rejects widened key claims, nonempty original histories and in-flight snapshots', () => {
  assert.doesNotThrow(() => assertEmptyAuditActivity(activity()));
  for (const mutate of [
    value => { value.totalKeyInvocationsMeasured = true; },
    value => { value.before.claim[0].authorizationCount = false; value.after.claim[0].authorizationCount = false; },
    value => { value.before.graph[0].signedFactCount = '0'; value.after.graph[0].signedFactCount = '0'; },
    value => { value.before.claim[0].retainedBindingCount = false; value.after.claim[0].retainedBindingCount = false; },
    value => { value.after.claim[0].keyUseEpoch++; },
    value => { value.after.graph[0].authorizationCount++; },
    value => { value.before.claim[1].signedAuthorizationCount++; },
    value => { value.after.graph[2].signedFactCount++; },
    value => { value.after.claim[2].retainedBindingCount++; },
    value => { value.after.claim[0].busy = true; },
    value => { value.after.graph[0].branchClosed = true; },
    value => { value.after.claim[0].custodyPoisoned = true; },
    value => { value.after.graph[0].epochScope = 'TOTAL_SIGNATURE_INVOCATIONS'; },
  ]) {
    const value = activity();
    mutate(value);
    assert.throws(() => assertEmptyAuditActivity(value));
  }
});

test('empty diagnostic proof exclusion rejects role adapters, owners and actual backends', () => {
  for (const role of ['flat-proof-role', 'native-ingress-v3-proof-role', 'native-value-live-v2-proof-role',
    'wrapped-claim-proof-role', 'flat-owner-role', 'recipient-role'])
    assert.equal(emptyAuditProcessFailure([{ role, proofWorker: false }]), 'EMPTY_AUDIT_OWNER_OR_PROOF_PROCESS_FORBIDDEN');
  assert.equal(emptyAuditProcessFailure([{ role: 'owned-descendant', proofWorker: true }]), 'EMPTY_AUDIT_OWNER_OR_PROOF_PROCESS_FORBIDDEN');
  assert.equal(emptyAuditProcessFailure([{ role: 'main-worker', proofWorker: false },
    { role: 'evm-runtime', proofWorker: false }, { role: 'solana-runtime', proofWorker: false },
    { role: 'bitcoin-runtime', proofWorker: false }]), null);
});

// Explicit policy metadata fixture only: no native operator/key/RPC is created.
test('empty result policy requires an integer zero owner count without widening its scope', () => {
  const empty = Object.fromEntries(['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued',
    'reservedFees', 'intentCount', 'ticketCount'].map(name => [name, '0']));
  empty.activePayout = '0'.repeat(64);
  const value = { format: EMPTY_AUDIT_RESULT, profile: EMPTY_AUDIT_PROFILE, validationScope: 'BASE_EMPTY_AUDIT_MEASURED',
    phase: 'completed', success: true, sourceUnchanged: true, localOnly: true, fakeFundsOnly: true, proofAttemptsUnchanged: true,
    loadedEquivalence: false, financialAcceptance: false, fullWalletAcceptance: false, publicNetwork: false,
    independentOperators: false, nativeSelfCustody: false, payoutAuthorizationReproduced: false, proofs: [], ownersCreated: 0,
    calls: EMPTY_AUDIT_ORDER.map(label => ({ label, completed: true, wallMilliseconds: 0, processCpuMicroseconds: 0,
      cpuScope: 'PROCESS_INTERVAL_INCLUDES_SIBLING_WORK' })), activity: activity(),
    nativeEffects: { bitcoin: 0, solana: 0, graphBitcoin: 0, graphSolana: 0 }, evmTransactionsAfterSetup: 0,
    emptyClaimState: [structuredClone(empty), structuredClone(empty)],
    claimMetrics: [0, 1, 2, 3].map(index => ({ schema: 'CLAIM_PRIVATE_OPERATION_METRICS_VIEW_V1', collectionIncomplete: false,
      reports: index < 3 ? [{ incomplete: false, truncated: false, rpcCounts: null, keyUsageMeasured: false }] : [] })),
    cleanup: { closedEvm: true, closedBitcoin: true, closedSolana: true, errors: [], evmScratch: { scratchRemoved: true },
      bitcoin: { result: { syntheticWalletsAndLedgerRemoved: true, forced: false } },
      solana: { result: { syntheticKeysAndLedgerRemoved: true, forced: false } } } };
  assert.doesNotThrow(() => assertEmptyAuditResult(value));
  for (const ownersCreated of [false, '0', null, 1, NaN, Infinity])
    assert.throws(() => assertEmptyAuditResult({ ...value, ownersCreated }));
});
