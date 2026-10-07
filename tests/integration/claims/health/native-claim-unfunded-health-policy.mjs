/** Fixed diagnostic policy. A separate reviewed source checkpoint is required
 * before either real-run entry can execute. No caller option overrides it. */
import assert from 'node:assert/strict';

export const UNFUNDED_HEALTH_REAL_RUN_DISABLED = true;
export const UNFUNDED_HEALTH_PROFILE = 'SOLANA_UNFUNDED_POST_FACT_CLAIM_HEALTH_DIAGNOSTIC';
export const UNFUNDED_HEALTH_VALIDATION_SCOPE = 'ORIGINAL_CLAIM_HEALTH_VALIDATION_ONLY_V1';
export const UNFUNDED_HEALTH_RESULT = 'FLAT_WALLET_UNFUNDED_CLAIM_HEALTH_RESULT_V1';
export const UNFUNDED_HEALTH_LIMITATION = 'Empty claim supply and histories only; success does not establish loaded equivalence or full native graph acceptance.';

export function unfundedHealthProcessFailure(processes) {
  const forbidden = ['flat-proof-worker', 'golden-note-proof-worker', 'flat-proof-role',
    'flat-owner-role', 'golden-owner-role', 'recipient-role'];
  return processes.some(value => value.proofWorker === true || forbidden.includes(value.role))
    ? 'NATIVE_UNFUNDED_OWNER_OR_PROOF_PROCESS' : null;
}

export function assertUnfundedHealthResult(result) {
  assert.equal(result.profile, UNFUNDED_HEALTH_PROFILE, 'NATIVE_UNFUNDED_RESULT_PROFILE');
  assert.equal(result.format, UNFUNDED_HEALTH_RESULT, 'NATIVE_UNFUNDED_RESULT_FORMAT');
  assert.equal(result.validationScope, UNFUNDED_HEALTH_VALIDATION_SCOPE, 'NATIVE_UNFUNDED_VALIDATION_SCOPE');
  assert.equal(result.loadedEquivalence, false, 'NATIVE_UNFUNDED_SCOPE');
  assert.equal(result.fullNativeGraphAcceptance, false, 'NATIVE_UNFUNDED_SCOPE');
  assert.equal(result.fullWalletAcceptance, false, 'NATIVE_UNFUNDED_SCOPE');
  assert.deepEqual(result.proofs, [], 'NATIVE_UNFUNDED_PROOFS');
  assert.equal(result.proofAttemptsUnchanged, true, 'NATIVE_UNFUNDED_PROOFS');
  assert.equal(result.cleanup?.applicationClosed, true, 'NATIVE_UNFUNDED_CLEANUP');
  const d = result.diagnostic;
  assert.equal(d?.scope, UNFUNDED_HEALTH_PROFILE, 'NATIVE_UNFUNDED_SCOPE');
  assert.equal(d.validationScope, UNFUNDED_HEALTH_VALIDATION_SCOPE, 'NATIVE_UNFUNDED_VALIDATION_SCOPE');
  assert.equal(d.loadedEquivalence, false, 'NATIVE_UNFUNDED_SCOPE');
  for (const key of ['completed', 'checksPassed', 'originalFinalizedOnce', 'custodyUnchanged', 'sameEvmHead',
    'noAttestationTransactionSubmitted', 'solverSeparateLiquidity']) assert.equal(d[key], true, 'NATIVE_UNFUNDED_INCOMPLETE');
  for (const key of ['owners', 'proofs', 'userDeposits', 'claimSupply', 'claimIntents', 'claimTickets', 'evmTransactionsAfterSetup'])
    assert.equal(d[key], 0, 'NATIVE_UNFUNDED_ZERO_EFFECT');
  assert.equal(d.solverNativeAmount, '1000000');
  assert.equal(d.transfers, 1); assert.equal(d.originalReconciliations, 1); assert.equal(d.factsCalls, 1);
  assert.equal(d.retainedGraphFactPerSigner, 1);
  assert.deepEqual(d.nativeEffects, { custodyBitcoin: 0, custodySolana: 0, graphBitcoin: 0, graphSolana: 1 });
  assert.deepEqual(d.claimHealth, [0, 1].map(domainIndex => ({ domainIndex, mode: 'ingress', calls: 1, ok: true })));
  assert.deepEqual(d.claimHealthValidation, [0, 1].map(domainIndex => ({ domainIndex, calls: 1, ok: true,
    assertOnlyResult: true, originalBytesUnchanged: true })));
  assert.deepEqual(d.graphHealth, { calls: 1, ok: true });
  assert.deepEqual(d.graphCheckpoint, { calls: 1, ok: true });
  return { scope: UNFUNDED_HEALTH_PROFILE, validationScope: UNFUNDED_HEALTH_VALIDATION_SCOPE,
    loadedEquivalence: false, fullNativeGraphAcceptance: false,
    owners: 0, proofs: 0, userDeposits: 0, graphTransfers: 1, factsCalls: 1, claimHealthDomains: [0, 1],
    originalAuthorizationBytesUnchanged: true, validationAssertOnly: true, claimHealthValidationCalls: 2 };
}
