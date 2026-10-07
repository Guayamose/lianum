/** Additive append-only acceptance closure. The shared historical compilation collector
 * stays byte-identical to its original verifier-build receipt. We retain every
 * original EVM-flow/role root, then add both fixed pool-generation entries and workers.
 * This is not a caller-selected source collector or a historical pin override. */
import assert from 'node:assert/strict';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT, FLAT, GOLDEN } from '../../../packages/proofs/src/catalog.mjs';
import { regular, hash } from '../../../packages/proofs/src/tooling/tooling.mjs';
import { manualWalletSourcePins } from '../wallet/manual/manual-wallet-source-pins.mjs';
import { loadAppendOnlyLedgerArtifacts } from '../../../packages/backend/src/operations/deployments/system/append-only-deployment-artifacts.mjs';

export function poolGenerationSourcePins() {
  assert.equal(arguments.length, 0, 'POOL_GENERATION_WALLET_SOURCE_PINS_NO_OPTIONS');
  const base = manualWalletSourcePins();
  const files = new Map(base.local.map(row => [resolve(FLAT, row.path), row]));
  const allowed = path => [ROOT, FLAT, GOLDEN].some(root => path.startsWith(root + sep));
  function visit(path) {
    assert.ok(allowed(path) && path.endsWith('.mjs'), 'POOL_GENERATION_LOCAL_EXECUTION_SOURCE_ONLY');
    if (files.has(path)) return;
    const bytes = regular(path), source = bytes.toString('utf8');
    files.set(path, { path: relative(FLAT, path).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) });
    const specifiers = new Set();
    // Match the existing fixed closure rules, including compact/multiline ESM,
    // literal dynamic imports and fixed source URLs. Spawned roots come from base.
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g)) specifiers.add(match[2]);
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm)) specifiers.add(match[2]);
    for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) specifiers.add(match[2]);
    for (const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g)) specifiers.add(match[2]);
    for (const name of specifiers) {
      if (name.startsWith('node:') || ['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/noir_wasm'].includes(name)) continue;
      assert.ok(name.startsWith('.'), 'POOL_GENERATION_STATIC_LOCAL_IMPORT');
      visit(resolve(dirname(path), name));
    }
  }
  for (const name of ['integration/run-pool-generation-phase1.mjs', 'integration/run-pool-generation-phase2.mjs',
    'integration/pool-generation-phase1.mjs', 'integration/pool-generation-phase2.mjs',
    'integration/pool-generation-acceptance.mjs', 'integration/pool-generation-checks.mjs',
    'integration/pool-generation-fixture.mjs', 'integration/pool-generation-source-pins.mjs', 'wallet-app/public/app.mjs']) visit(join(ROOT, name));
  for (const [path, row] of files) {
    const bytes = regular(path);
    assert.equal(bytes.length, row.bytes, 'POOL_GENERATION_SOURCE_CHANGED_DURING_CAPTURE');
    assert.equal(hash(bytes), row.sha256, 'POOL_GENERATION_SOURCE_CHANGED_DURING_CAPTURE');
  }
  const ledger = loadAppendOnlyLedgerArtifacts(); // public bytes only; never the key/verifier loader
  return { ...base, local: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    appendOnlyCandidate2: {
      compilerOutputSHA256: '8d7c19bdd8c52df50eb527a3f0edf80e4e6071c89ed4ec1b94eeef70299c6c02',
      standardInputSHA256: 'b97bd0b4b2f300197f7865d469d2e6cf5ef153c2adc6e1dc21ab6943e0df7a1d',
      sources: Object.entries(ledger.sourceMap).map(([name, source]) => ({ name, sha256: source.sha256 })).sort((a,b) => a.name.localeCompare(b.name)),
    } };
}
