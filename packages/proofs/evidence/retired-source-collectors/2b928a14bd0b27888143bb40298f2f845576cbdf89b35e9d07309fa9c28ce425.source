/** Additive fixed DOM closure. No caller-selected roots or distribution hashes. Historical collectors remain unchanged. */
import assert from 'node:assert/strict';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT, FLAT, GOLDEN } from '@lianum/proofs/catalog';
import { regular, hash } from '@lianum/proofs/tooling/tooling';
import { manualWalletBrowserSourcePins } from './manual-wallet-browser-source-pins.mjs';

export function manualWalletBrowserRecoverySourcePins() {
  assert.equal(arguments.length, 0, 'MANUAL_BROWSER_RECOVERY_SOURCE_PINS_NO_OPTIONS');
  const base = manualWalletBrowserSourcePins();
  const files = new Map(base.local.map(row => [resolve(FLAT, row.path), row]));
  const allowed = path => [ROOT, FLAT, GOLDEN].some(root => path.startsWith(root + sep));
  function visit(path, asset = false) {
    assert.ok(allowed(path));
    if (files.has(path)) return;
    const bytes = regular(path), source = bytes.toString('utf8');
    files.set(path, { path: relative(FLAT, path).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) });
    if (asset) return;
    assert.ok(path.endsWith('.mjs'), 'MANUAL_BROWSER_LOCAL_SOURCE_ONLY');
    const specifiers = new Set();
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g)) specifiers.add(match[2]);
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm)) specifiers.add(match[2]);
    for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) specifiers.add(match[2]);
    for (const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g)) specifiers.add(match[2]);
    for (const name of specifiers) {
      if (name.startsWith('node:') || ['@aztec/bb.js','@noir-lang/noir_js','@noir-lang/noir_wasm'].includes(name)) continue;
      assert.ok(name.startsWith('.'), 'MANUAL_BROWSER_STATIC_LOCAL_IMPORT');
      visit(resolve(dirname(path), name));
    }
  }
  for (const name of ['run-manual-wallet-browser-timeout-recovery','manual-wallet-browser-timeout-recovery',
    'manual-wallet-browser-recovery-source-pins','manual-wallet-browser-recovery-policy'])
    visit(join(ROOT, 'integration/' + name + '.mjs'));
  const runtime = base.walletBrowserRuntime;
  for (const [path, row] of files) {
    const bytes = regular(path);
    assert.equal(bytes.length, row.bytes); assert.equal(hash(bytes), row.sha256, 'MANUAL_BROWSER_SOURCE_CHANGED_DURING_CAPTURE');
  }
  return { ...base, format: 'FIXED_MANUAL_BROWSER_RECOVERY_SOURCE_CLOSURE_V1',
    local: [...files.values()].sort((a,b) => a.path.localeCompare(b.path)), walletBrowserRuntime: runtime };
}
