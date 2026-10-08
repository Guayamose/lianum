/** Public receipt joins for the seven fixed original graph relations and
 * the genuine recipient W39 telemetry. No proof/custody authority is issued. */
import assert from 'node:assert/strict';
import { PROFILE, SETTINGS, LIMITS, CATALOG } from '../../../../packages/proofs/src/catalog.mjs';
import { PROVING_LIMITS, AUTHORIZATION_PROVING_LIMITS, AUTHORIZATION_SIXTEEN_PROVING_LIMITS, AUTHORIZATION_TWELVE_PROVING_LIMITS } from '../../../../packages/proofs/src/jobs/proving-execution.mjs';
const id = value => assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const digest = value => assert.match(value, /^[0-9a-f]{64}$/);
export const DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS = Object.freeze(['authorization','reservation','dependency','ready','admission','node','settlement']);
const specs = Object.freeze(Object.fromEntries(DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS.map(name =>
  [name, Object.freeze({ role: CATALOG[name].role, words: CATALOG[name].publicWords })])));
export function assertBtcSolGraphProofReceipts(input) {
  assert.equal(arguments.length, 1);
  const { relation, runId, jobId, manifest, result, resources, proofSHA256, publicInputsSHA256,
    manifestSHA256, resultSHA256, resourcesSHA256 } = input, spec = specs[relation];
  assert.ok(spec, 'DEVELOPMENT_CLAIM_RECEIPT_RELATION'); id(runId); id(jobId);
  for (const value of [proofSHA256, publicInputsSHA256, manifestSHA256, resultSHA256, resourcesSHA256]) digest(value);
  const profile = PROFILE;
  assert.equal(manifest.format, 'FLAT_WALLET_PUBLIC_PROOF_V1');
  assert.equal(result.format, 'FLAT_WALLET_WORKER_ATTEMPT_V1');
  assert.equal(resources.format, 'FLAT_WALLET_EXTERNAL_RESOURCE_REPORT_V1');
  for (const report of [manifest, result, resources]) {
    assert.equal(report.profile, profile); assert.equal(report.relation, relation);
    assert.equal(report.runId, runId, 'DEVELOPMENT_CLAIM_RECEIPT_RUN_ID');
    assert.equal(report.jobId, jobId, 'DEVELOPMENT_CLAIM_RECEIPT_JOB_ID');
  }
  assert.equal(manifest.role, spec.role); assert.equal(result.role, spec.role);
  assert.equal(manifest.publicWords, spec.words); assert.deepEqual(manifest.settings, SETTINGS);
  assert.deepEqual(result.settings, SETTINGS);
  // Fixed public receipt variants only. Eight/sixteen/twelve are authorization-only;
  // retained generic four/legacy one and specialized ingress one stay exact.
  const proofLimits = relation === 'authorization' && result.threads === AUTHORIZATION_TWELVE_PROVING_LIMITS.threads
    ? AUTHORIZATION_TWELVE_PROVING_LIMITS : relation === 'authorization' && result.threads === AUTHORIZATION_SIXTEEN_PROVING_LIMITS.threads
      ? AUTHORIZATION_SIXTEEN_PROVING_LIMITS : relation === 'authorization' && result.threads === AUTHORIZATION_PROVING_LIMITS.threads
      ? AUTHORIZATION_PROVING_LIMITS : result.threads === PROVING_LIMITS.threads ? PROVING_LIMITS : LIMITS;
  if (result.threads !== undefined) assert.equal(result.threads, proofLimits.threads, 'DEVELOPMENT_CLAIM_FIXED_THREADS');
  assert.deepEqual(result.limits, proofLimits); assert.deepEqual(resources.limits, proofLimits);
  if (proofLimits !== LIMITS) {
    assert.deepEqual(result.wasmThreadExecution, { threads: proofLimits.threads, sharedMemory: true,
      oneOwnedProcess: true, originalPreparedKeyRequired: true }, 'DEVELOPMENT_CLAIM_ACTUAL_THREAD_EXECUTION');
    // Join the same immutable runtime-source receipt captured by the original
    // worker, proof manifest and external guard. No caller can select sources.
    digest(result.runtimePinsSHA256);
    assert.equal(manifest.runtimePinsSHA256, result.runtimePinsSHA256, 'DEVELOPMENT_CLAIM_PROOF_THREAD_SOURCES');
    assert.equal(resources.runtimePinsSHA256, result.runtimePinsSHA256, 'DEVELOPMENT_CLAIM_GUARD_THREAD_SOURCES');
    digest(result.keyManifestSHA256);
    assert.equal(manifest.keyManifestSHA256, result.keyManifestSHA256, 'DEVELOPMENT_CLAIM_ORIGINAL_PREPARED_KEY');
    assert.equal(result.keyRecomputed, false); assert.equal(result.hostLimitsChanged, false);
    assert.ok(Number.isSafeInteger(resources.peakWorkerRSS) && resources.peakWorkerRSS >= 0
      && resources.peakWorkerRSS <= proofLimits.workerRSS, 'DEVELOPMENT_CLAIM_THREAD_RSS_LIMIT');
  }
  assert.ok(['prove', 'prove-dyadic21'].includes(result.mode)); assert.equal(resources.mode, result.mode);
  for (const report of [result, resources]) assert.equal(report.phase, 'completed', 'DEVELOPMENT_CLAIM_RECEIPT_COMPLETED');
  assert.equal(manifest.selfVerified, true); assert.equal(result.selfVerified, true);
  assert.equal(resources.exitCode, 0); assert.equal(resources.signal, null);
  assert.equal(resources.failure, null, 'DEVELOPMENT_CLAIM_RECEIPT_RESOURCE_FAILURE'); assert.deepEqual(resources.failures, []);
  assert.equal(resources.lockPreserved, false); assert.equal(resources.hostLimitsChanged, false);
  for (const name of ['errorCode', 'cleanupErrorCode', 'finalPinErrorCode']) assert.equal(result[name], undefined);
  assert.equal(manifest.proofSHA256, proofSHA256); assert.equal(manifest.publicInputsSHA256, publicInputsSHA256);
  assert.equal(manifest.sourceVersion, result.sourceVersion); assert.equal(manifest.keySHA256, result.keySHA256);
  digest(manifest.sourceVersion); digest(manifest.keySHA256);
  assert.equal(manifest.target, 'evm'); assert.equal(result.target, 'evm'); assert.equal(result.publicWords, spec.words);
  assert.equal(result.proofGenerated, true); assert.equal(result.proofSHA256, proofSHA256);
  assert.equal(result.publicInputsSHA256, publicInputsSHA256);
  return { runId, jobId, relation, sourceVersion: manifest.sourceVersion, keySHA256: manifest.keySHA256,
    selfVerified: true, resourceReceiptCompleted: true, manifestSHA256, resultSHA256, resourcesSHA256 };
}

export function assertBtcSolRecipientWithdrawalTelemetry(input) {
  assert.equal(arguments.length, 1);
  const { returnedMetrics, storedMetrics, proofSHA256, publicInputsSHA256, telemetrySHA256 } = input;
  digest(proofSHA256); digest(publicInputsSHA256); digest(telemetrySHA256); id(returnedMetrics.id);
  assert.deepEqual(storedMetrics, returnedMetrics, 'DEVELOPMENT_CLAIM_ORIGINAL_W39_TELEMETRY');
  assert.equal(storedMetrics.classification, 'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY');
  assert.equal(storedMetrics.mode, 'withdraw_balance'); assert.equal(storedMetrics.operation, 'prove'); assert.equal(storedMetrics.purpose, 'recipient');
  assert.equal(storedMetrics.phase, 'completed'); assert.equal(storedMetrics.acceptedResult, true);
  assert.equal(storedMetrics.zeroKnowledgeEnabled, true); assert.equal(storedMetrics.worker.zeroKnowledgeEnabled, true);
  assert.deepEqual(storedMetrics.exit, { code: 0, signal: null });
  assert.equal(storedMetrics.failureCode, undefined); assert.equal(storedMetrics.telemetryWriteFailed, undefined);
  assert.equal(storedMetrics.fallbackTelemetryWriteFailed, undefined);
  assert.equal(storedMetrics.worker.verified, true); assert.equal(storedMetrics.worker.keySHA256, storedMetrics.keySHA256);
  assert.equal(storedMetrics.worker.proofSHA256, proofSHA256); assert.equal(storedMetrics.worker.publicInputsSHA256, publicInputsSHA256);
  assert.equal(storedMetrics.worker.publicInputCount, 39);
  return { ...returnedMetrics, telemetrySHA256, resourceReceiptCompleted: true };
}
