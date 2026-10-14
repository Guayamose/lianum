import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFlatAdmissionBudgetV1, assertFlatFreshAdmissionV1, assertFlatGenerationAdmissionV1 }
  from '../../../src/accounts/storage/flat-admission-budget-v1.mjs';
const record = () => ({ generations: [{ generationId: 'original' }], bindings: [] });
const binding = (id, kind) => ({ request: { requestId: id, kind, ownerOperationRef: 'original-owner-' + id } });
test('recycling all capital does not refund durable fresh admissions across generations', () => {
  const data = record();
  for (let n = 0; n < 64; n++) {
    assertFlatFreshAdmissionV1(data);
    data.bindings.push(binding('deposit-' + n, n % 2 ? 'GRAPH' : 'TOP_UP'));
    // A completed withdrawal may return every coin; the count remains spent.
    data.bindings.push(binding('exit-' + n, 'EXIT'));
    if (n % 8 === 0 && n > 0) data.generations.push({ generationId: 'successor-' + n });
  }
  const frozen = Object.freeze({ generations: Object.freeze(data.generations), bindings: Object.freeze(data.bindings) });
  assert.equal(projectFlatAdmissionBudgetV1(frozen).consumed, 64);
  assert.equal(projectFlatAdmissionBudgetV1(frozen).remaining, 0);
  assert.equal(projectFlatAdmissionBudgetV1(frozen).monetaryFee, null);
  assert.throws(() => assertFlatFreshAdmissionV1(frozen), /ADMISSION_BUDGET_EXHAUSTED/);
  assert.throws(() => assertFlatGenerationAdmissionV1(frozen), /ADMISSION_BUDGET_EXHAUSTED/);
  assert.deepEqual(projectFlatAdmissionBudgetV1(structuredClone(frozen)), projectFlatAdmissionBudgetV1(frozen));
});
test('generation count is bounded independently; duplicate or rebound journal bindings are rejected', () => {
  const data = record(); data.generations.push(...Array.from({ length: 7 }, (_, n) => ({ generationId: 'next-' + n })));
  assert.equal(projectFlatAdmissionBudgetV1(data).remaining, 64);
  assert.throws(() => assertFlatGenerationAdmissionV1(data), /GENERATION_CAPACITY/);
  data.bindings.push(binding('same', 'TOP_UP'), binding('same', 'EXIT'));
  assert.throws(() => projectFlatAdmissionBudgetV1(data), /ADMISSION_BINDINGS/);
});
