/** Dedicated current collector; historical nativeClaimSourcePins is unchanged. */
import assert from 'node:assert/strict';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import { ROOT, FLAT, GOLDEN } from '../../../../packages/proofs/src/catalog.mjs';
import { regular, hash, verifyAPI, verifyVendor } from '../../../../packages/proofs/src/tooling/tooling.mjs';
export function nativeClaimEmptyAuditSourcePins() {
  assert.equal(arguments.length, 0); const files = new Map();
  // This new diagnostic accepts only the generated public workspace runtime,
  // never a caller path or an unrelated historical restoration tree.
  const workspace = resolve(ROOT, '../../../..');
  assert.equal(join(workspace, '.internal/runtime/omnichain-flat-profile/flat-wallet'), ROOT, 'EMPTY_AUDIT_FIXED_WORKSPACE_RUNTIME');
  assert.equal(realpathSync(workspace), workspace, 'EMPTY_AUDIT_PHYSICAL_WORKSPACE_REQUIRED');
  function visit(path) {
    assert.ok([ROOT, FLAT, GOLDEN].some(root => path.startsWith(root + sep)) && path.endsWith('.mjs'));
    if (files.has(path)) return;
    const bytes = regular(path), source = bytes.toString('utf8');
    files.set(path, { path: relative(FLAT, path).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) });
    const imports = new Set();
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g)) imports.add(match[2]);
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm)) imports.add(match[2]);
    for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) imports.add(match[2]);
    for (const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g)) imports.add(match[2]);
    for (const name of imports) {
      if (name.startsWith('node:')) continue;
      if (['@noir-lang/noir_js', '@noir-lang/noir_wasm', '@aztec/bb.js'].includes(name)) continue;
      assert.ok(name.startsWith('.'), 'DEVELOPMENT_CLAIM_LOCAL_SOURCE_IMPORT'); visit(resolve(dirname(path), name));
    }
  }
  for (const name of ['integration/claims/metrics/run-native-claim-empty-audit-v1.mjs',
    'integration/claims/metrics/native-claim-empty-audit-v1.mjs',
    'integration/claims/metrics/native-claim-empty-audit-source-pins-v1.mjs',
    'integration/claims/metrics/native-claim-empty-audit-policy-v1.mjs',
    'integration/native-flow-supervisor.mjs', 'scripts/prepare-development-native-claims.mjs',
    'proof-workers/native-claims-build-worker.mjs', 'proof-workers/run-bounded.mjs', 'proof-workers/worker.mjs', 'proof-workers/role-process.mjs',
    'proof-workers/native-ingress-v3-worker.mjs', 'proof-workers/native-ingress-v3-role-process.mjs',
    'mobile-core/flat-owner-process.mjs']) visit(join(ROOT, name));
  for (const name of ['src/paeg/proof-worker.mjs', 'experiments/private-core-proof/wallet-notes/resources.mjs',
    'src/private-resource-policy.mjs', 'src/private-verifier-crs.mjs']) visit(join(GOLDEN, name));
  const workspaceFiles = ['dev', 'scripts/development/dev', 'scripts/layout.json',
    'scripts/development/empty_audit_lab.py', 'scripts/development/osaka_lab.py',
    'scripts/development/workspace.py', 'scripts/development/import_paths.py'].map(path => {
    const bytes = regular(join(workspace, path));
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
  // The public preparer's literal Python guardian is executed via spawn, not
  // an ESM import. Pin it explicitly alongside the recursively visited worker.
  const runtimeHelpers = ['proof-workers/native-claims-parent-death.py'].map(path => {
    const bytes = regular(join(ROOT, path));
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
  return { profile: 'fresh-empty-original-claim-graph-audit-metrics-v1',
    workspaceFiles, runtimeHelpers,
    local: [...files.values()].sort((a,b) => a.path.localeCompare(b.path)), officialAPI: verifyAPI(), vendor: verifyVendor() };
}
