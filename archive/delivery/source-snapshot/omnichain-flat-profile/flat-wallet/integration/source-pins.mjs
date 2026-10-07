/** Capture complete local static-import closures for the fixed synthetic test.
 * Official compiler/ACVM/WASM packages are separately pinned by tooling.mjs. */
import assert from 'node:assert/strict';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { ROOT, FLAT, GOLDEN, CANDIDATE, TRUSTED_JOB_SOURCES, TRUSTED_PARENTS } from '../proof-workers/catalog.mjs';
import { regular, hash, verifyAPI, verifyVendor } from '../proof-workers/tooling.mjs';
import { integrationTask } from './task-catalog.mjs';

export function integrationSourcePins(suite = 'envelope') {
  const task = integrationTask(suite);
  const files = new Set();
  function visit(path) {
    assert.ok(path.startsWith(ROOT + sep) || path.startsWith(FLAT + sep) || path.startsWith(GOLDEN + sep),
      'ENVELOPE_LOCAL_SOURCE_ONLY');
    if (files.has(path)) return;
    const source = regular(path).toString('utf8'); files.add(path);
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm)) {
      const specifier = match[2];
      if (specifier.startsWith('node:')) continue;
      assert.ok(specifier.startsWith('.'), 'ENVELOPE_STATIC_LOCAL_IMPORT');
      visit(resolve(dirname(path), specifier));
    }
  }
  for (const name of [task.entry, task.worker,
    'source-pins.mjs']) visit(join(ROOT, 'integration', name));
  // Fixed dynamic import used by the worker; its API packages have separate pins.
  visit(join(GOLDEN, 'experiments/private-core-proof/wallet-notes/resources.mjs'));
  visit(join(GOLDEN, 'src/private-resource-policy.mjs'));
  return { suite, local: [...files].sort().map(path => ({ path: relative(FLAT, path), sha256: hash(regular(path)) })),
    officialAPI: verifyAPI(), vendor: verifyVendor() };
}

/** Complete execution-source closures for the two fixed application flows.
 * Separate no-argument entries prevent caller-selected commands or sources.
 * Fixed child entries are roots because spawning does not create an ESM edge.
 * Literal dynamic imports and source URLs are included as well as static ESM.
 * Official API packages and runtime binaries retain their independent pins. */
export function nativeFlowSourcePins() {
  assert.equal(arguments.length, 0, 'NATIVE_SOURCE_PINS_NO_OPTIONS');
  return fixedFlowSourcePins('native-flow');
}

export function accountRecoverySourcePins() {
  assert.equal(arguments.length, 0, 'ACCOUNT_RECOVERY_SOURCE_PINS_NO_OPTIONS');
  return fixedFlowSourcePins('account-recovery');
}
export function assetPortfolioSourcePins() {
  assert.equal(arguments.length, 0, 'ASSET_PORTFOLIO_SOURCE_PINS_NO_OPTIONS');
  return fixedFlowSourcePins('asset-portfolio');
}
export function evmVaultSourcePins() {
  assert.equal(arguments.length, 0, 'EVM_VAULT_SOURCE_PINS_NO_OPTIONS');
  return fixedFlowSourcePins('evm-vault-flow');
}

function fixedFlowSourcePins(profile) {
  assert.ok(['native-flow', 'account-recovery', 'asset-portfolio', 'evm-vault-flow'].includes(profile), 'NATIVE_FIXED_SOURCE_PROFILE');
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
    ...(profile === 'native-flow'
      ? ['integration/run-native-flow.mjs', 'integration/native-flow.mjs']
      : [...(profile === 'account-recovery'
        ? ['integration/run-account-recovery.mjs', 'integration/account-recovery.mjs']
        : profile === 'asset-portfolio'
          ? ['integration/run-asset-portfolio.mjs', 'integration/asset-portfolio.mjs']
          : ['integration/run-evm-vault-flow.mjs', 'integration/evm-vault-flow.mjs']),
        'wallet-platform/modules/paeg/flat-native-execution.mjs',
        'wallet-platform/modules/global-state/flat-account-authority.mjs',
        'mobile-core/flat-owner-process.mjs', 'mobile-core/flat-owner-custody.mjs',
        'wallet-platform/modules/api/flat-account-session.mjs',
        'wallet-platform/modules/api/flat-account-http.mjs']),
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
    ...(profile !== 'native-flow' ? [
      'src/paeg/generic-account-process.mjs', 'src/paeg/generic-account-child.mjs',
      'src/paeg/generic-account-coordinator.mjs',
    ] : []),
  ]) visit(join(GOLDEN, path));
  // These are the fixed variable-based imports in flat tooling/worker code.
  visit(join(CANDIDATE, 'src/component-tooling.mjs'));
  return { format: profile === 'native-flow' ? 'FLAT_WALLET_NATIVE_FLOW_SOURCE_CLOSURE_V1'
    : 'FLAT_WALLET_ACCOUNT_RECOVERY_SOURCE_CLOSURE_V1',
    local: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    officialAPI: verifyAPI(), vendor: verifyVendor() };
}
