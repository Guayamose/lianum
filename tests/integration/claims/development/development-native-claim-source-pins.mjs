/** Current executable sources are authenticated by the adopted generation.
 * Compiler/key publications retain their independent original evidence. */
import assert from 'node:assert/strict';
import {captureAdoptedSourceEvidence,assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
export function developmentNativeClaimSourcePins(){
 assert.equal(arguments.length,0,"CURRENT_SOURCE_PINS_NO_OPTIONS");
 const base=captureAdoptedSourceEvidence();
 assertCapturedCurrentSources(base,[
  "packages/backend/src/custody/processes/flat-owner-process.mjs",
  "packages/backend/src/proving/native-ingress/runtime/native-ingress-v3-role-process.mjs",
  "packages/backend/src/proving/native-ingress/runtime/native-ingress-v3-worker.mjs",
  "packages/components/src/resources/private-resource-policy.mjs",
  "packages/components/src/resources/private-verifier-crs.mjs",
  "packages/components/src/resources/wallet-resources.mjs",
  "packages/proofs/src/execution/proof-worker.mjs",
  "packages/proofs/src/jobs/role-process.mjs",
  "packages/proofs/src/jobs/worker.mjs",
  "tests/integration/claims/development/development-native-claim-flow.mjs",
  "tests/integration/claims/development/development-native-claim-policy.mjs",
  "tests/integration/claims/development/development-native-claim-source-pins.mjs",
  "tests/integration/claims/development/run-development-native-claim-flow.mjs",
  "tests/integration/native/native-flow-supervisor.mjs",
  "tests/integration/claims/development/development-native-claim-source-pins.mjs"
]);
 return {...base,profile:"fresh-development-native-claim-roundtrips-v1"};
}
