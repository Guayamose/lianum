/** Current executable sources are authenticated by the adopted generation.
 * Compiler/key publications retain their independent original evidence. */
import assert from 'node:assert/strict';
import {captureAdoptedSourceEvidence,assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
export function nativeClaimSourcePins(){
 assert.equal(arguments.length,0,"CLAIM_SOURCE_NO_OPTIONS");
 const base=captureAdoptedSourceEvidence();
 assertCapturedCurrentSources(base,[
  "packages/backend/src/custody/processes/flat-owner-process.mjs",
  "packages/components/src/resources/private-resource-policy.mjs",
  "packages/components/src/resources/private-verifier-crs.mjs",
  "packages/components/src/resources/wallet-resources.mjs",
  "packages/proofs/src/jobs/role-process.mjs",
  "packages/proofs/src/jobs/trusted-jobs.mjs",
  "packages/proofs/src/jobs/worker.mjs",
  "tests/integration/claims/graph/flows/run-native-claim-graph-flow.mjs",
  "tests/integration/claims/graph/flows/run-native-claim-graph-v3-flow.mjs",
  "tests/integration/claims/health/native-claim-unfunded-health-worker.mjs",
  "tests/integration/claims/health/run-native-claim-unfunded-health.mjs",
  "tests/integration/claims/ingress/native-claim-ingress-v3-production-proof.mjs",
  "tests/integration/claims/ingress/native-ingress-v3-preflight-policy.mjs",
  "tests/integration/claims/ingress/native-ingress-v3-preflight-worker.mjs",
  "tests/integration/claims/ingress/native-ingress-v3-preflight.mjs",
  "tests/integration/claims/ingress/native-ingress-v3-production-preflight-worker.mjs",
  "tests/integration/claims/ingress/run-native-ingress-v3-preflight.mjs",
  "tests/integration/claims/ingress/run-native-ingress-v3-production-preflight.mjs",
  "tests/integration/claims/inventory/run-native-claim-loaded-facts-probe.mjs",
  "tests/integration/claims/inventory/run-native-claim-loaded-v3-flow.mjs",
  "tests/integration/claims/lifecycle/check-native-claim-artifacts.mjs",
  "tests/integration/claims/lifecycle/native-claim-flow.mjs",
  "tests/integration/claims/lifecycle/native-claim-source-pins.mjs",
  "tests/integration/claims/lifecycle/run-native-claim-flow.mjs",
  "tests/integration/claims/payouts/run-native-claim-begin-payout-audit-v1.mjs",
  "tests/integration/fixtures/claims/ingress/owned-native-ingress-v3-preflight-fixture.mjs",
  "tests/integration/native/native-flow-supervisor.mjs",
  "tests/integration/claims/lifecycle/native-claim-source-pins.mjs"
]);
 return {...base,profile:"native-claim-flow"};
}
