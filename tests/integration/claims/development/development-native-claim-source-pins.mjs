/** Dedicated current collector; historical nativeClaimSourcePins is unchanged. */
import assert from 'node:assert/strict';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT, FLAT, GOLDEN } from '@lianum/proofs/catalog';
import { regular, hash, verifyAPI, verifyVendor } from '@lianum/proofs/tooling/tooling';
const MOBILE_PROTOCOL = resolve(FLAT, '../mobile-protocol');
export function developmentNativeClaimSourcePins() {
  assert.equal(arguments.length, 0); const files = new Map();
  function visit(path) {
    assert.ok([ROOT, FLAT, GOLDEN, MOBILE_PROTOCOL].some(root => path.startsWith(root + sep)) && path.endsWith('.mjs'),
      'DEVELOPMENT_CLAIM_FIXED_SOURCE_ROOT');
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
  for (const name of ['integration/claims/development/run-development-native-claim-flow.mjs',
    'integration/claims/development/development-native-claim-flow.mjs',
    'integration/claims/development/development-native-claim-source-pins.mjs',
    'integration/claims/development/development-native-claim-policy.mjs',
    'integration/native-flow-supervisor.mjs', 'proof-workers/worker.mjs', 'proof-workers/role-process.mjs',
    'proof-workers/native-ingress-v3-worker.mjs', 'proof-workers/native-ingress-v3-role-process.mjs',
    'mobile-core/flat-owner-process.mjs']) visit(join(ROOT, name));
  for (const name of ['src/paeg/proof-worker.mjs', 'experiments/private-core-proof/wallet-notes/resources.mjs',
    'src/private-resource-policy.mjs', 'src/private-verifier-crs.mjs']) visit(join(GOLDEN, name));
  return { profile: 'fresh-development-native-claim-roundtrips-v1',
    local: [...files.values()].sort((a,b) => a.path.localeCompare(b.path)), officialAPI: verifyAPI(), vendor: verifyVendor() };
}
