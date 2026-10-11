import assert from 'node:assert/strict';
import {relation} from '@lianum/proofs/catalog';
import {createRoleProofClient} from './role-client.mjs';

/** One active scoped proof at a time, released before any subsequent phase.
 * Private callbacks receive public proof data only; they cannot replace a
 * proof, key, program, expected statement or current-state observation. */
export function createFlatProofRunner({ onProof = async () => {} } = {}) {
  assert.equal(typeof onProof, 'function'); let active = null, closed = false;
  const runner = Object.freeze({
    async prove(name, job, label) {
      assert.ok(!closed && active === null, 'FLAT_PROOF_RUNNER_UNAVAILABLE');
      const spec = relation(name);
      assert.notEqual(spec.role, 'owner', 'FLAT_PROOF_OWNER_PROCESS_REQUIRED');
      assert.ok(typeof label === 'string' && /^[a-z0-9-]{1,100}$/.exec(label)?.[0] === label, 'FLAT_PROOF_LABEL');
      const client = createRoleProofClient(spec.role);
      const operation = { client, done: null }; active = operation;
      operation.done = (async () => {
        try {
          const proof = await client.prove({ relation: name, inputs: job.inputs,
            expectedPublicInputs: job.expectedPublicInputs ?? job.publicInputs });
          await onProof({ label, relation: name, proof });
          return Object.freeze({ proof: proof.proof, publicInputs: Object.freeze([...proof.publicInputs]) });
        } finally { client.close(); active = null; }
      })();
      return operation.done;
    },
    async abort() { const original = active; if (original) { original.client.stop(); await original.done.catch(() => {}); }
      return { aborted: Boolean(original), closed: true }; },
    async close() { closed = true; await runner.abort(); return { closed: true }; },
  });
  return runner;
}
