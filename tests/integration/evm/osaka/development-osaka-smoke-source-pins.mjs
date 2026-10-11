/** Current executable sources are authenticated by the adopted generation.
 * Compiler/key publications retain their independent original evidence. */
import assert from 'node:assert/strict';
import {captureAdoptedSourceEvidence,assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
export function osakaSmokeSourcePins(){
 assert.equal(arguments.length,0,"OSAKA_SOURCE_PINS_NO_OPTIONS");
 const base=captureAdoptedSourceEvidence();
 assertCapturedCurrentSources(base,[
  "packages/backend/src/accounts/authority/flat-account-authority.mjs",
  "packages/backend/src/api/accounts/flat-account-http.mjs",
  "packages/backend/src/api/accounts/flat-account-session.mjs",
  "packages/backend/src/custody/processes/flat-owner-process.mjs",
  "packages/backend/src/execution/account/execution/flat-native-execution.mjs",
  "packages/backend/src/execution/native/recipients/native-recipient-process.mjs",
  "packages/components/src/resources/private-resource-policy.mjs",
  "packages/components/src/resources/private-verifier-crs.mjs",
  "packages/components/src/resources/wallet-resources.mjs",
  "packages/custody/src/signing/flat-owner-custody.mjs",
  "packages/engine/src/chains/shared/linux-runtime-pins.mjs",
  "packages/engine/src/execution/accounts/generic-account-child.mjs",
  "packages/engine/src/execution/accounts/generic-account-coordinator.mjs",
  "packages/engine/src/execution/accounts/generic-account-process.mjs",
  "packages/engine/src/execution/balances/generic-balance-owner-child.mjs",
  "packages/proofs/src/execution/proof-worker.mjs",
  "packages/proofs/src/jobs/role-process.mjs",
  "packages/proofs/src/jobs/trusted-jobs.mjs",
  "packages/proofs/src/jobs/worker.mjs",
  "packages/proofs/src/toolchain/wallet-prover.mjs",
  "packages/proofs/src/verification/pinned-verifier.mjs",
  "tests/integration/runners/source-pins.mjs",
  "tests/integration/evm/osaka/development-osaka-smoke-source-pins.mjs",
  "tests/integration/evm/osaka/development-osaka-smoke.mjs",
  "tests/integration/evm/osaka/run-development-osaka-smoke.mjs",
  "tests/integration/native/native-flow-supervisor.mjs",
  "tests/integration/evm/osaka/development-osaka-smoke-source-pins.mjs"
]);
 return {...base,format:"LIANUM_DEVELOPMENT_OSAKA_SMOKE_SOURCE_CLOSURE_V1"};
}
