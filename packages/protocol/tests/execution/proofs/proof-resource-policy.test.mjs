import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIVATE_RESOURCE_POLICY } from '../../../../components/src/resources/private-resource-policy.mjs';
import { NATIVE_2M_PROOF_RESOURCE_POLICY, selectProofResourcePolicy } from '../../../../proofs/src/execution/proof-resource-policy.mjs';

test('only verified native 2M profiles get the bounded RSS budget', () => {
  for (const mode of ['capsule', 'ready', 'node', 'admission', 'aggregate_pair', 'aggregate_all', 'fulfill']) {
    const pins = { mode, dyadicGates: 2097152, maximumPages: 65536 };
    assert.equal(selectProofResourcePolicy(mode, pins), NATIVE_2M_PROOF_RESOURCE_POLICY);
    for (const changed of [{ mode: 'authorization' }, { dyadicGates: 1048576 }, { maximumPages: 32768 }]) {
      assert.equal(selectProofResourcePolicy(mode, { ...pins, ...changed }), PRIVATE_RESOURCE_POLICY);
    }
  }
  for (const mode of ['authorization', 'reserve', 'refund', 'dependency', 'withdraw_balance', 'unknown']) {
    assert.equal(selectProofResourcePolicy(mode, { mode, dyadicGates: 2097152, maximumPages: 65536 }), PRIVATE_RESOURCE_POLICY);
  }
  const { profile, proofWorkerRSSLimit, ...unchanged } = NATIVE_2M_PROOF_RESOURCE_POLICY;
  const { profile: priorProfile, proofWorkerRSSLimit: priorRSS, ...prior } = PRIVATE_RESOURCE_POLICY;
  assert.deepEqual(unchanged, prior);
  assert.equal(proofWorkerRSSLimit - priorRSS, 536870912);
  assert.ok(Object.isFrozen(NATIVE_2M_PROOF_RESOURCE_POLICY));
});
