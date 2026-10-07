/** Actual compiled D27 and changed I84 only, using real Poseidon2/signatures. */
import { runConstraintWorker } from './constraint-worker.mjs';
import { buildSyntheticEvmDepositFixture } from './synthetic-evm-deposit-fixture.mjs';
await runConstraintWorker({ suite: 'evm-deposit',
  relationNames: ['deposit_intent', 'admission'],
  buildCases: buildSyntheticEvmDepositFixture,
});
