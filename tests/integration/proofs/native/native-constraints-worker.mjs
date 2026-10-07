/** One genuine signed synthetic envelope through the remaining flat relations.
 * U/S/F are already checked in their retained attempt and are not repeated. */
import assert from 'node:assert/strict';
import { runConstraintWorker } from '../../runners/constraint-worker.mjs';
import { buildSyntheticEnvelopeFixture } from '../../fixtures/proofs/envelopes/synthetic-envelope-fixture.mjs';
import { buildSyntheticNativeFixture } from '../../fixtures/runners/synthetic-native-fixture.mjs';
import { buildSyntheticCompletionFixture } from '../../fixtures/runners/synthetic-completion-fixture.mjs';

await runConstraintWorker({ suite: 'native',
  relationNames: ['dependency', 'ready', 'admission', 'node', 'settlement'],
  buildCases: async ({ hashFields, abis }) => {
    const envelope = await buildSyntheticEnvelopeFixture({ hashFields });
    try {
      const native = await buildSyntheticNativeFixture(envelope, { hashFields,
        abis: { dependency: abis.dependency, ready: abis.ready, admission: abis.admission } });
      const completion = await buildSyntheticCompletionFixture(envelope, native, { hashFields,
        abis: { node: abis.node, settlement: abis.settlement } });
      assert.equal(native.negativeCases.length, 5, 'ENVELOPE_NATIVE_NEGATIVE_COUNT');
      assert.equal(completion.negativeCases.length, 4, 'ENVELOPE_COMPLETION_NEGATIVE_COUNT');
      const cases = Object.entries(native.jobs).flatMap(([relation, jobs]) => jobs.map((job, slot) => ({
        name: relation + '-slot-' + slot, relation, inputs: job.inputs, statement: job.statement,
        publicInputs: job.expectedPublicInputs, expected: true,
      })));
      cases.push(...completion.jobs.map(job => ({ ...job, expected: true })));
      cases.push(...native.negativeCases.map(job => ({ ...job,
        publicInputs: job.expectedPublicInputs, expected: false })));
      cases.push(...completion.negativeCases.map(job => ({ ...job, expected: false })));
      assert.equal(cases.length, 20, 'ENVELOPE_COMBINED_CASE_COUNT');
      return { cases, destroy: () => envelope.destroy() };
    } catch (error) { envelope.destroy(); throw error; }
  },
});
