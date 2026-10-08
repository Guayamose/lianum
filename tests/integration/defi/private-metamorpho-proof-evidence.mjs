/** Data-only checks of the original proof process public telemetry. This does
 * not issue any proof, original-account, runtime or private EXIT authority. */
import assert from 'node:assert/strict';
export function assertPrivateMetaMorphoProofTelemetry(value) {
  assert.equal(arguments.length, 1);
  const { relation, returnedMetrics, storedMetrics, proofSHA256, publicInputsSHA256, telemetrySHA256 } = value;
  assert.ok(['deposit_balance', 'withdraw_balance'].includes(relation));
  for (const digest of [proofSHA256, publicInputsSHA256, telemetrySHA256]) assert.match(digest, /^[0-9a-f]{64}$/);
  assert.match(returnedMetrics.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(returnedMetrics, storedMetrics, 'PRIVATE_METAMORPHO_ORIGINAL_TELEMETRY');
  assert.equal(storedMetrics.classification, 'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY');
  assert.equal(storedMetrics.mode, relation); assert.equal(storedMetrics.operation, 'prove');
  assert.equal(storedMetrics.purpose, 'owner'); assert.equal(storedMetrics.phase, 'completed');
  assert.equal(storedMetrics.acceptedResult, true); assert.deepEqual(storedMetrics.exit, { code: 0, signal: null });
  for (const field of ['failureCode', 'telemetryWriteFailed', 'fallbackTelemetryWriteFailed']) assert.equal(storedMetrics[field], undefined);
  assert.equal(storedMetrics.zeroKnowledgeEnabled, true); assert.equal(storedMetrics.worker.zeroKnowledgeEnabled, true);
  assert.equal(storedMetrics.worker.verified, true);
  assert.match(storedMetrics.keySHA256, /^[0-9a-f]{64}$/);
  assert.equal(storedMetrics.worker.keySHA256, storedMetrics.keySHA256);
  assert.equal(storedMetrics.worker.proofSHA256, proofSHA256);
  assert.equal(storedMetrics.worker.publicInputsSHA256, publicInputsSHA256);
  assert.equal(storedMetrics.worker.publicInputCount, relation === 'deposit_balance' ? 26 : 39);
  return { ...returnedMetrics, telemetrySHA256, resourceReceiptCompleted: true };
}
