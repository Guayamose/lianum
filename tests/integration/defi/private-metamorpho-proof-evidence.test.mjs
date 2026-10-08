/** Public metadata only. No cryptographic proof or runtime is created. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPrivateMetaMorphoProofTelemetry } from './private-metamorpho-proof-evidence.mjs';
function input(relation) {
  const proofSHA256 = 'a'.repeat(64), publicInputsSHA256 = 'b'.repeat(64);
  const metrics = { classification: 'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY',
    id: '11111111-1111-4111-8111-111111111111', mode: relation, operation: 'prove', purpose: 'owner',
    phase: 'completed', acceptedResult: true, exit: { code: 0, signal: null }, zeroKnowledgeEnabled: true,
    keySHA256: 'c'.repeat(64), worker: { verified: true, zeroKnowledgeEnabled: true, keySHA256: 'c'.repeat(64),
      proofSHA256, publicInputsSHA256, publicInputCount: relation === 'deposit_balance' ? 26 : 39 } };
  return { relation, returnedMetrics: metrics, storedMetrics: structuredClone(metrics), proofSHA256,
    publicInputsSHA256, telemetrySHA256: 'd'.repeat(64) };
}
test('funding and EXIT bind their original completed telemetry to the retained proof bytes', () => {
  for (const relation of ['deposit_balance', 'withdraw_balance']) {
    assert.equal(assertPrivateMetaMorphoProofTelemetry(input(relation)).resourceReceiptCompleted, true);
    for (const mutate of [value => value.proofSHA256 = '0'.repeat(64), value => value.publicInputsSHA256 = '0'.repeat(64),
      value => value.storedMetrics.id = '22222222-2222-4222-8222-222222222222',
      value => value.returnedMetrics.acceptedResult = value.storedMetrics.acceptedResult = false,
      value => value.returnedMetrics.exit = value.storedMetrics.exit = { code: 1, signal: null },
      value => value.returnedMetrics.failureCode = value.storedMetrics.failureCode = 'PAEG_PROOF_LOCK_RELEASE',
      value => value.returnedMetrics.worker.verified = value.storedMetrics.worker.verified = false,
      value => value.returnedMetrics.worker.zeroKnowledgeEnabled = value.storedMetrics.worker.zeroKnowledgeEnabled = false]) {
      const value = input(relation); mutate(value); assert.throws(() => assertPrivateMetaMorphoProofTelemetry(value));
    }
  }
});
