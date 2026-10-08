/** Dedicated source closure; preserves the historical collector unchanged. */
import assert from 'node:assert/strict';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { ROOT, FLAT, GOLDEN, CANDIDATE, TRUSTED_JOB_SOURCES, TRUSTED_PARENTS } from '../../../../packages/proofs/src/catalog.mjs';
import { regular, hash, verifyAPI, verifyVendor } from '../../../../packages/proofs/src/tooling/tooling.mjs';

export function osakaSmokeSourcePins() {
  assert.equal(arguments.length, 0, 'OSAKA_SOURCE_PINS_NO_OPTIONS');
  const files = new Map();
  const allowed = path => [ROOT, FLAT, GOLDEN].some(root => path.startsWith(root + sep));
  function visit(path) {
    assert.ok(allowed(path) && path.endsWith('.mjs'), 'NATIVE_LOCAL_EXECUTION_SOURCE_ONLY');
    if (files.has(path)) return;
    const bytes = regular(path), source = bytes.toString('utf8');
    files.set(path, { path: relative(FLAT, path).split(sep).join('/'),
      bytes: bytes.length, sha256: hash(bytes) });
    const specifiers = new Set();
    // The local modules use literal ESM specifiers. Match imports even when a
    // compact module puts more than one declaration on the same source line.
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g))
      specifiers.add(match[2]);
    // Multiline named imports need the existing line-anchored expression too.
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm))
      specifiers.add(match[2]);
    for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) specifiers.add(match[2]);
    for (const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g))
      specifiers.add(match[2]);
    for (const specifier of specifiers) {
      if (specifier.startsWith('node:')) continue;
      if (['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/noir_wasm'].includes(specifier)) continue;
      assert.ok(specifier.startsWith('.'), 'NATIVE_STATIC_LOCAL_IMPORT');
      visit(resolve(dirname(path), specifier));
    }
  }
  const fixedFlatEntries = [
    'integration/evm/osaka/run-development-osaka-smoke.mjs',
    'integration/evm/osaka/development-osaka-smoke.mjs',
    'integration/evm/osaka/development-osaka-smoke-source-pins.mjs',
    'wallet-platform/modules/paeg/flat-native-execution.mjs',
    'wallet-platform/modules/global-state/flat-account-authority.mjs',
    'mobile-core/flat-owner-process.mjs', 'mobile-core/flat-owner-custody.mjs',
    'wallet-platform/modules/api/flat-account-session.mjs',
    'wallet-platform/modules/api/flat-account-http.mjs',
    'integration/native-flow-supervisor.mjs', 'integration/source-pins.mjs',
    'proof-workers/worker.mjs', 'proof-workers/role-process.mjs',
    'proof-workers/trusted-jobs.mjs', 'proof-workers/pinned-verifier.mjs',
    ...Object.values(TRUSTED_JOB_SOURCES).flat(),
    ...Object.values(TRUSTED_PARENTS).map(parent => parent.script),
  ];
  for (const path of new Set(fixedFlatEntries)) visit(join(ROOT, path));
  for (const path of [
    'src/paeg/proof-worker.mjs', 'src/paeg/generic-balance-owner-child.mjs',
    'src/paeg/native-recipient-process.mjs', 'src/private-verifier-crs.mjs',
    'src/private-resource-policy.mjs', 'src/chains/linux-runtime-pins.mjs',
    'experiments/private-core-proof/wallet-notes/resources.mjs',
    'experiments/private-core-proof/wallet-notes/prover.mjs',
    'src/paeg/generic-account-process.mjs', 'src/paeg/generic-account-child.mjs',
    'src/paeg/generic-account-coordinator.mjs',
  ]) visit(join(GOLDEN, path));
  // These are the fixed variable-based imports in flat tooling/worker code.
  visit(join(CANDIDATE, 'src/component-tooling.mjs'));
  return { format: 'LIANUM_DEVELOPMENT_OSAKA_SMOKE_SOURCE_CLOSURE_V1',
    local: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    officialAPI: verifyAPI(), vendor: verifyVendor() };
}
