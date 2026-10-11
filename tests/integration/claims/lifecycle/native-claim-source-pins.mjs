/** Exact local execution closure for the fixed native-claim application run.
 * No request can choose another script, proof worker, directory or package. */
import assert from 'node:assert/strict';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { ROOT, FLAT, GOLDEN } from '@lianum/proofs/catalog';
import { regular, hash, verifyAPI, verifyVendor } from '@lianum/proofs/tooling/tooling';

export function nativeClaimSourcePins() {
  assert.equal(arguments.length, 0, 'CLAIM_SOURCE_NO_OPTIONS');
  const files = new Map();
  function visit(path) {
    assert.ok([ROOT, FLAT, GOLDEN].some(root => path.startsWith(root + sep))
      && path.endsWith('.mjs'), 'CLAIM_SOURCE_LOCAL_MODULE');
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
      // These exact official packages are independently lock/module-pinned by
      // verifyAPI and the original legacy proof host, not arbitrary imports.
      if (['@noir-lang/noir_js', '@noir-lang/noir_wasm', '@aztec/bb.js'].includes(name)) continue;
      assert.ok(name.startsWith('.'), 'CLAIM_SOURCE_STATIC_IMPORT');
      visit(resolve(dirname(path), name));
    }
  }
  for (const name of ['integration/run-native-claim-begin-payout-audit-v1.mjs',
    'integration/run-native-claim-loaded-v3-flow.mjs',
    'integration/run-native-claim-graph-v3-flow.mjs',
    'integration/check-native-claim-artifacts.mjs',
    'integration/run-native-ingress-v3-preflight.mjs',
    'integration/native-ingress-v3-preflight-worker.mjs', 'integration/native-ingress-v3-preflight.mjs',
    'integration/native-ingress-v3-preflight-policy.mjs', 'integration/owned-native-ingress-v3-preflight-fixture.mjs',
    'integration/run-native-ingress-v3-production-preflight.mjs', 'integration/native-ingress-v3-production-preflight-worker.mjs',
    'integration/native-claim-ingress-v3-production-proof.mjs',
    'integration/run-native-claim-flow.mjs', 'integration/run-native-claim-graph-flow.mjs',
    'integration/run-native-claim-unfunded-health.mjs', 'integration/native-claim-unfunded-health-worker.mjs',
    'integration/run-native-claim-loaded-facts-probe.mjs', 'integration/native-claim-flow.mjs',
    'integration/native-flow-supervisor.mjs', 'integration/native-claim-source-pins.mjs',
    'proof-workers/worker.mjs', 'proof-workers/role-process.mjs', 'proof-workers/trusted-jobs.mjs',
    'mobile-core/flat-owner-process.mjs']) visit(join(ROOT, name));
  for (const name of ['experiments/private-core-proof/wallet-notes/resources.mjs',
    'src/private-resource-policy.mjs', 'src/private-verifier-crs.mjs']) {
    visit(join(GOLDEN, name));
  }
  return { profile: 'native-claim-flow', local: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    officialAPI: verifyAPI(), vendor: verifyVendor() };
}
