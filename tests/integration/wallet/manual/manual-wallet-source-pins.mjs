/** Additive manual-route closure. The shared historical compilation collector
 * stays byte-identical to its original verifier-build receipt. We retain every
 * original EVM-flow/role root, then add the fixed manual entry and worker.
 * This is not a caller-selected source collector or a historical pin override. */
import assert from 'node:assert/strict';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT, FLAT, GOLDEN } from '@lianum/proofs/catalog';
import { regular, hash } from '@lianum/proofs/tooling/tooling';
import { evmVaultSourcePins } from '../../runners/source-pins.mjs';

export function manualWalletSourcePins() {
  assert.equal(arguments.length, 0, 'MANUAL_WALLET_SOURCE_PINS_NO_OPTIONS');
  const base = evmVaultSourcePins();
  const files = new Map(base.local.map(row => [resolve(FLAT, row.path), row]));
  const allowed = path => [ROOT, FLAT, GOLDEN].some(root => path.startsWith(root + sep));
  function visit(path) {
    assert.ok(allowed(path) && path.endsWith('.mjs'), 'MANUAL_LOCAL_EXECUTION_SOURCE_ONLY');
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
      assert.ok(name.startsWith('.'), 'MANUAL_STATIC_LOCAL_IMPORT');
      visit(resolve(dirname(path), name));
    }
  }
  for (const name of ['integration/run-manual-wallet-acceptance.mjs', 'integration/manual-wallet-acceptance.mjs',
    'integration/run-manual-wallet-timeout-recovery.mjs', 'integration/manual-wallet-timeout-recovery.mjs',
    'integration/manual-wallet-source-pins.mjs']) visit(join(ROOT, name));
  for (const [path, row] of files) {
    const bytes = regular(path);
    assert.equal(bytes.length, row.bytes, 'MANUAL_SOURCE_CHANGED_DURING_CAPTURE');
    assert.equal(hash(bytes), row.sha256, 'MANUAL_SOURCE_CHANGED_DURING_CAPTURE');
  }
  return { ...base, local: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}
