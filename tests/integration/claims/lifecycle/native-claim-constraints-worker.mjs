/** Actual compiled CI51/CO42 only, using official Poseidon2 and real signatures. */
import { runConstraintWorker } from '../../runners/constraint-worker.mjs';
import { buildSyntheticNativeClaimFixture } from '../../fixtures/claims/lifecycle/synthetic-native-claim-fixture.mjs';
await runConstraintWorker({ suite: 'native-claim',
  relationNames: ['native_claim_ingress', 'native_claim_discharge'],
  buildCases: buildSyntheticNativeClaimFixture,
});
