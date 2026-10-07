/** Fixed synthetic U/S/F cases; no proof or native-state claim. */
import assert from 'node:assert/strict';
import { runConstraintWorker } from '../../runners/constraint-worker.mjs';
import { buildSyntheticEnvelopeFixture } from '../../fixtures/proofs/envelopes/synthetic-envelope-fixture.mjs';
await runConstraintWorker({ suite: 'envelope',
  relationNames: ['authorization', 'reservation', 'recovery'],
  buildCases: async ({ hashFields }) => {
    const fixture = await buildSyntheticEnvelopeFixture({ hashFields });
    assert.equal(fixture.negativeCases.length, 6, 'ENVELOPE_EXPECTED_NEGATIVES');
    return { cases: [
      ...Object.entries(fixture.jobs).map(([relation, job]) => ({
        name: relation + '-genuine', relation, ...job, expected: true })),
      ...fixture.negativeCases.map(item => ({ ...item, expected: false })),
    ], destroy: () => fixture.destroy() };
  },
});
