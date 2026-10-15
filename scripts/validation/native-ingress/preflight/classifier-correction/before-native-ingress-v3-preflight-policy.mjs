/** Fixed, source-disabled zero-user-deposit integration. No caller override. */
import assert from 'node:assert/strict';
export const PREFLIGHT_REAL_RUN_DISABLED = true;
export const PREFLIGHT_PROFILE = 'LIANUM_NATIVE_INGRESS_V3_EMPTY_UNSIGNED_PREFLIGHT_V1';
export const PREFLIGHT_RESULT = 'LIANUM_NATIVE_INGRESS_V3_PREFLIGHT_RESULT_V1';
export function preflightForbiddenProcess(processes) {
  const allowed = new Set(['main-worker', 'evm-runtime', 'bitcoin-runtime', 'bitcoin-local-cli',
    'solana-runtime', 'solana-local-keygen', 'exited-member']);
  return processes.some(p => p.proofWorker === true || !allowed.has(p.role))
    ? 'V3_PREFLIGHT_OWNER_PROOF_OR_UNKNOWN_DESCENDANT' : null;
}
export function assertNativeIngressV3PreflightResult(result) {
  assert.equal(result.format, PREFLIGHT_RESULT); assert.equal(result.profile, PREFLIGHT_PROFILE);
  assert.equal(result.phase, 'completed'); assert.equal(result.success, true);
  assert.equal(result.proofAttemptsUnchanged, true); assert.deepEqual(result.proofs, []);
  assert.equal(result.cleanup.applicationClosed, true);
  for (const key of ['closedEvm', 'closedBitcoin', 'closedSolana']) assert.equal(result.cleanup[key], true);
  const d = result.diagnostic;
  assert.equal(d.profile, PREFLIGHT_PROFILE); assert.equal(d.checksPassed, true);
  for (const key of ['owners', 'proofs', 'userDeposits', 'economicNativeSignatures', 'economicNativeTransfers', 'postSetupEvmTransactions']) assert.equal(d[key], 0);
  assert.equal(d.independentNonceBootstraps, 2); assert.equal(d.completeClaimInventories, 2);
  assert.deepEqual(d.preparedRoutes, ['deposit', 'refund', 'redeem'].map(route => ({ route, unsignedPreparationRevalidated: true, stoppedBeforeNativeKey: true })));
  assert.equal(d.missingOriginalSignedBindingRejected, true);
  assert.equal(d.positiveIngressBroadcastAuthorization, false); assert.equal(d.nativeFinalityOrIssuanceAcceptance, false);
  assert.equal(d.deployedRetainedSyntheticProofVerified, true);
  assert.equal(d.registeredDomainIssuanceEstablished, false);
  assert.deepEqual(d.health, [{ originalHealthValidated: true }, { originalHealthValidated: true }]);
  return Object.freeze({ profile: PREFLIGHT_PROFILE, userDeposits: 0, economicNativeTransfers: 0,
    retainedSyntheticProofVerifiedByDeployedVerifier: true, positiveIngressBroadcastAuthorization: false,
    registeredDomainIssuanceEstablished: false, fullNativeGraphAcceptance: false });
}

export const PRODUCTION_PREFLIGHT_REAL_RUN_DISABLED = true;
export const PRODUCTION_PREFLIGHT_PROFILE = 'LIANUM_NATIVE_INGRESS_V3_ZERO_DEPOSIT_PRODUCTION_PROOF_V1';
export const PRODUCTION_PREFLIGHT_RESULT = 'LIANUM_NATIVE_INGRESS_V3_PRODUCTION_PREFLIGHT_RESULT_V1';
export function productionPreflightForbiddenProcess(processes) {
  return preflightForbiddenProcess(processes.filter(p => p.role !== 'native-ingress-v3-proof-process'));
}
export function assertSingleProductionProofRun({ before, after, boundary, sharedLockPresent }) {
  assert.equal(boundary.classification, 'ONE_SYNTHETIC_PROOF_THROUGH_PRODUCTION_V3_ROLE');
  assert.equal(boundary.actualProductionRoleIPC, true); assert.equal(boundary.officialPoseidon2, true);
  assert.equal(boundary.proofsGenerated, 1); assert.equal(boundary.keyGenerated, false); assert.equal(boundary.statsRegenerated, false);
  assert.equal(boundary.syntheticUnregisteredDomain, true); assert.equal(boundary.witnessPersisted, false); assert.equal(boundary.nativeNodesStarted, false);
  const { runId, jobId } = boundary.proofResult.evidence;
  for (const value of [runId, jobId]) assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(before.length, 3); assert.equal(after.length, 3);
  assert.ok(!before[1].includes(runId) && !before[2].includes(jobId + '.json'), 'V3_PRODUCTION_FRESH_JOB_REQUIRED');
  assert.deepEqual(after, [before[0], [...before[1], runId].sort(), [...before[2], jobId + '.json'].sort()], 'V3_PRODUCTION_EXACT_ONE_JOB');
  assert.equal(sharedLockPresent, false, 'V3_PRODUCTION_SHARED_LOCK_RELEASED');
  return Object.freeze({ relation: 'native_claim_ingress_v3', runId, jobId });
}
export function assertNativeIngressV3ProductionPreflightResult(result) {
  assert.equal(result.format, PRODUCTION_PREFLIGHT_RESULT); assert.equal(result.profile, PRODUCTION_PREFLIGHT_PROFILE);
  assert.equal(result.phase, 'completed'); assert.equal(result.success, true); assert.equal(result.proofAttemptsMatched, true);
  assert.equal(result.productionRoleProof.proofsGenerated, 1); assert.equal(result.productionRoleProof.actualProductionRoleIPC, true);
  assert.equal(result.productionRoleProof.keyGenerated, false); assert.equal(result.productionRoleProof.statsRegenerated, false);
  assert.equal(result.productionRoleProof.witnessPersisted, false); assert.equal(result.productionRoleProof.officialPoseidon2, true);
  assert.equal(result.proofs.length, 1); assert.equal(result.proofs[0].relation, 'native_claim_ingress_v3');
  const d = result.diagnostic;
  assert.equal(d.profile, PRODUCTION_PREFLIGHT_PROFILE); assert.equal(d.proofs, 1);
  assert.equal(d.deployedProductionSyntheticProofVerified, true); assert.equal(d.deployedRetainedSyntheticProofVerified, false);
  // Reuse only the unchanged empty-native/accounting checks, with an explicit
  // local projection. Never label this route proofless in its real result.
  const projected = { ...result, format: PREFLIGHT_RESULT, profile: PREFLIGHT_PROFILE, proofs: [], proofAttemptsUnchanged: true,
    diagnostic: { ...d, profile: PREFLIGHT_PROFILE, proofs: 0, deployedRetainedSyntheticProofVerified: true } };
  assertNativeIngressV3PreflightResult(projected);
  return Object.freeze({ profile: PRODUCTION_PREFLIGHT_PROFILE, userDeposits: 0, economicNativeTransfers: 0,
    productionRoleProofsGenerated: 1, productionSyntheticProofVerifiedByDeployedVerifier: true,
    positiveIngressBroadcastAuthorization: false, registeredDomainIssuanceEstablished: false, fullNativeGraphAcceptance: false });
}
