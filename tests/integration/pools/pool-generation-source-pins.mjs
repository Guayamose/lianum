/** Current pool-generation sources; original append-only compiler evidence is retained. */
import assert from 'node:assert/strict';
import {captureAdoptedSourceEvidence,assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
import {loadAppendOnlyLedgerArtifacts} from '../../../packages/backend/src/operations/deployments/system/append-only-deployment-artifacts.mjs';
export function poolGenerationSourcePins(){
 assert.equal(arguments.length,0,'POOL_GENERATION_WALLET_SOURCE_PINS_NO_OPTIONS');
 const base=captureAdoptedSourceEvidence();
 assertCapturedCurrentSources(base,[
  "tests/integration/pools/run-pool-generation-phase1.mjs",
  "tests/integration/pools/run-pool-generation-phase2.mjs",
  "tests/integration/pools/pool-generation-phase1.mjs",
  "tests/integration/pools/pool-generation-phase2.mjs",
  "tests/integration/pools/pool-generation-acceptance.mjs",
  "tests/integration/pools/pool-generation-checks.mjs",
  "tests/integration/fixtures/pools/pool-generation-fixture.mjs",
  "tests/integration/pools/pool-generation-source-pins.mjs",
  "apps/wallet/src/client/app.mjs"
]);
  const ledger = loadAppendOnlyLedgerArtifacts(); // public bytes only; never the key/verifier loader
  return { ...base,
    appendOnlyCandidate2: {
      compilerOutputSHA256: '8d7c19bdd8c52df50eb527a3f0edf80e4e6071c89ed4ec1b94eeef70299c6c02',
      standardInputSHA256: 'b97bd0b4b2f300197f7865d469d2e6cf5ef153c2adc6e1dc21ab6943e0df7a1d',
      sources: Object.entries(ledger.sourceMap).map(([name, source]) => ({ name, sha256: source.sha256 })).sort((a,b) => a.name.localeCompare(b.name)),
    } };
}
