/** DATA policy over the original authenticated catalogue, never a grant.
 * A durable new non-EXIT binding consumes one admission unit before its child
 * is called. Failures, withdrawals and pool rotation do not refund that unit.
 * These are count limits per catalogue, not a coin fee or global Sybil defence. */
import assert from 'node:assert/strict';
export const FLAT_ADMISSION_LIMITS_V1 = Object.freeze({
  profile: 'NONREFUNDABLE_ORIGINAL_CATALOGUE_ADMISSION_V1',
  maximumFreshAdmissions: 64, maximumGenerations: 8,
});
export function projectFlatAdmissionBudgetV1(data) {
  assert.ok(data && Array.isArray(data.bindings) && Array.isArray(data.generations), 'FLAT_CATALOGUE_ADMISSION_RECORD');
  const requests = new Set(), references = new Set(), generations = new Set();
  let consumed = 0;
  for (const row of data.bindings) {
    const request = row.request;
    assert.ok(request && ['TOP_UP', 'GRAPH', 'EXIT'].includes(request.kind)
      && typeof request.requestId === 'string' && typeof request.ownerOperationRef === 'string'
      && !requests.has(request.requestId) && !references.has(request.ownerOperationRef), 'FLAT_CATALOGUE_ADMISSION_BINDINGS');
    requests.add(request.requestId); references.add(request.ownerOperationRef);
    if (request.kind !== 'EXIT') consumed++;
  }
  for (const row of data.generations) {
    assert.ok(typeof row.generationId === 'string' && !generations.has(row.generationId), 'FLAT_CATALOGUE_ADMISSION_GENERATIONS');
    generations.add(row.generationId);
  }
  assert.ok(generations.size >= 1 && generations.size <= FLAT_ADMISSION_LIMITS_V1.maximumGenerations,
    'FLAT_CATALOGUE_GENERATION_CAPACITY');
  return Object.freeze({ ...FLAT_ADMISSION_LIMITS_V1, consumed, remaining: Math.max(0, FLAT_ADMISSION_LIMITS_V1.maximumFreshAdmissions - consumed),
    generations: generations.size, remainingGenerations: FLAT_ADMISSION_LIMITS_V1.maximumGenerations - generations.size,
    nonrefundable: true, monetaryFee: null, globalSybilProtection: false });
}
export function assertFlatFreshAdmissionV1(data) {
  const value = projectFlatAdmissionBudgetV1(data);
  assert.ok(value.remaining > 0, 'FLAT_CATALOGUE_ADMISSION_BUDGET_EXHAUSTED'); return value;
}
export function assertFlatGenerationAdmissionV1(data) {
  const value = assertFlatFreshAdmissionV1(data);
  assert.ok(value.remainingGenerations > 0, 'FLAT_CATALOGUE_GENERATION_CAPACITY'); return value;
}
