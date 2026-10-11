/** Current empty-audit execution evidence; no caller roots or compiled replacements. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {projectRoot} from '@lianum/environment';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {captureAdoptedSourceEvidence,assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
export function nativeClaimEmptyAuditSourcePins(){
 assert.equal(arguments.length,0,'EMPTY_AUDIT_SOURCE_NO_OPTIONS');
 const base=captureAdoptedSourceEvidence();
 assertCapturedCurrentSources(base,[
  "tests/integration/claims/metrics/run-native-claim-empty-audit-v1.mjs",
  "tests/integration/claims/metrics/native-claim-empty-audit-v1.mjs",
  "tests/integration/claims/metrics/native-claim-empty-audit-source-pins-v1.mjs",
  "tests/integration/claims/metrics/native-claim-empty-audit-policy-v1.mjs",
  "tests/integration/native/native-flow-supervisor.mjs",
  "scripts/wallet/preparation/prepare-development-native-claims.mjs",
  "packages/backend/src/proving/native-ingress/runtime/native-claims-build-worker.mjs",
  "packages/proofs/src/jobs/run-bounded.mjs",
  "packages/proofs/src/jobs/worker.mjs",
  "packages/proofs/src/jobs/role-process.mjs",
  "packages/backend/src/proving/native-ingress/runtime/native-ingress-v3-worker.mjs",
  "packages/backend/src/proving/native-ingress/runtime/native-ingress-v3-role-process.mjs",
  "packages/backend/src/custody/processes/flat-owner-process.mjs",
  "dev",
  "scripts/development/dev",
  "scripts/layout.json",
  "scripts/development/empty_audit_lab.py",
  "scripts/development/osaka_lab.py",
  "scripts/development/workspace.py",
  "scripts/development/import_paths.py",
  "packages/proofs/src/native-ingress/tooling/native-claims-parent-death.py"
]);
 const workspaceFiles=["dev", "scripts/development/dev", "scripts/layout.json", "scripts/development/empty_audit_lab.py", "scripts/development/osaka_lab.py", "scripts/development/workspace.py", "scripts/development/import_paths.py"].map(path=>{const bytes=regular(join(projectRoot,path));return {path,bytes:bytes.length,sha256:hash(bytes)};});
 return {...base,profile:'fresh-empty-original-claim-graph-audit-metrics-v1',workspaceFiles};
}
