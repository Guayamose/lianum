/** Compilation provenance only. The original full V5 walker remains unchanged;
 * financial consumers retain their independent current full closure. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, FLAT, GOLDEN, CANDIDATE } from '../../../../../proofs/src/catalog.mjs';
import { nativeValueDevHostSourcePinsV5 } from './native-value-dev-source-pins-v5.mjs';
import { cloneInput } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { W39_DEV_SOURCE_V5, w39DevDigestV5 } from './native-value-dev-w39-contract-v5.mjs';
const DEVELOPMENT = resolve(FLAT, '../../..');
const roots = Object.freeze([
  ['development-tooling/', join(DEVELOPMENT, 'scripts/development')], ['development-config/', join(DEVELOPMENT, 'scripts')],
  ['golden/', GOLDEN], ['candidate/', CANDIDATE], ['flat/', FLAT],
  ['mobile-protocol/', resolve(FLAT, '../mobile-protocol')], ['mobile-app/', resolve(FLAT, '../../../apps/mobile')],
  ['mobile-protocol-workspace/', resolve(FLAT, '../../../packages/mobile-protocol')],
  ['workspace-module/', DEVELOPMENT], ['development-root/', DEVELOPMENT],
]);
const fixedRoots = Object.freeze(['scripts/prepare-development-native-value-w39-v5.mjs',
  'development-root/dev', 'development-tooling/dev', 'development-tooling/native_value_w39.py',
  'development-tooling/native_value_ledger.py', 'development-tooling/native_artifact_tasks.py',
  'development-tooling/ledger_owned_processes.py', 'development-tooling/workspace.py',
  'development-tooling/import_paths.py', 'development-config/layout.json']);
const sha = b => createHash('sha256').update(b).digest('hex');
function validName(name) {
  assert.ok(typeof name === 'string' && name.length > 0 && !name.startsWith('/')
    && !name.split('/').some(part => !part || part === '.' || part === '..'), 'W39_DEPENDENCY_FIXED_LABEL');
}
function pathFor(name) {
  validName(name); const selected = roots.find(([prefix]) => name.startsWith(prefix));
  return join(selected?.[1] ?? ROOT, selected ? name.slice(selected[0].length) : name);
}
function bytesFor(name) {
  const path = pathFor(name); assert.equal(realpathSync(path), path, 'W39_DEPENDENCY_SOURCE_ALIAS');
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 128 * 1024 * 1024, 'W39_DEPENDENCY_REGULAR_FILE');
  const bytes = readFileSync(path); assert.equal(bytes.length, stat.size, 'W39_DEPENDENCY_SOURCE_CHANGED'); return bytes;
}
function rows(value) {
  assert.ok(Array.isArray(value) && value.length > 0, 'W39_DEPENDENCY_SOURCE_ROWS');
  const result = new Map();
  for (const row of cloneInput(value)) {
    assert.ok(row && typeof row === 'object' && !Array.isArray(row));
    assert.deepEqual(Object.keys(row).sort(), ['path', 'sha256']); validName(row.path);
    assert.match(row.sha256, /^[0-9a-f]{64}$/); assert.ok(!result.has(row.path), 'W39_DEPENDENCY_DUPLICATE_LABEL');
    result.set(row.path, row);
  }
  return result;
}
/** Pure metadata join, no capability or caller-selected filesystem access. */
export function validateW39DevCompilerSourceCapsuleV5(dependencies, recordedBytes, receiptDigest, publishedRawSHA256) {
  assert.equal(arguments.length, 4, 'W39_DEPENDENCY_METADATA_ARITY');
  assert.ok(Buffer.isBuffer(recordedBytes));
  assert.equal(sha(recordedBytes), publishedRawSHA256, 'W39_DEPENDENCY_RECORDED_RAW_SHA');
  const recorded = JSON.parse(recordedBytes); assert.equal(w39DevDigestV5(recorded), receiptDigest, 'W39_DEPENDENCY_RECORDED_RECEIPT_JOIN');
  const historical = rows(recorded), current = rows(dependencies);
  for (const [name, row] of current) {
    assert.ok(historical.has(name), 'W39_DEPENDENCY_NOT_IN_ORIGINAL_BUILD');
    assert.deepEqual(row, historical.get(name), 'W39_DEPENDENCY_ACTUAL_COMPILER_SOURCE_CHANGED');
  }
  return true;
}
/** Zero-option dependency slice discovered from the actual compiler entry's
 * imports. No fixture exclusion list and no new module claimed as historical.
 * File ownership/capture comes from the original fixed full source walker. */
export function nativeValueDevW39CompilerSourcePinsV5() {
  assert.equal(arguments.length, 0, 'W39_DEPENDENCY_NO_OPTIONS');
  const full = nativeValueDevHostSourcePinsV5(), captured = rows(full);
  const byPath = new Map(), selected = new Map();
  for (const row of full) {
    const path = pathFor(row.path);
    assert.ok(!byPath.has(path), 'W39_DEPENDENCY_PHYSICAL_ALIAS'); byPath.set(path, row);
  }
  function visit(path) {
    const row = byPath.get(path); assert.ok(row, 'W39_DEPENDENCY_OUTSIDE_ORIGINAL_WALK');
    if (selected.has(row.path)) return;
    const bytes = bytesFor(row.path); assert.equal(sha(bytes), row.sha256, 'W39_DEPENDENCY_CAPTURE_CHANGED');
    selected.set(row.path, row);
    if (!path.endsWith('.mjs')) return;
    const source = bytes.toString('utf8'), names = new Set();
    // Same static import syntax as the original walker; it supplies the entire
    // authenticated path/byte universe rather than taking paths from callers.
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g)) names.add(match[2]);
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm)) names.add(match[2]);
    for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) names.add(match[2]);
    for (const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g)) names.add(match[2]);
    for (const name of names) {
      if (name.startsWith('node:') || ['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/noir_wasm'].includes(name)) continue;
      assert.ok(name.startsWith('.'), 'W39_DEPENDENCY_STATIC_LOCAL_IMPORT'); visit(resolve(dirname(path), name));
    }
  }
  for (const name of fixedRoots) { assert.ok(captured.has(name), 'W39_DEPENDENCY_FIXED_ROOT_MISSING'); visit(pathFor(name)); }
  for (const [name, row] of selected) assert.equal(sha(bytesFor(name)), row.sha256, 'W39_DEPENDENCY_CHANGED_AFTER_CAPTURE');
  return [...selected.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
/** These raw Noir/Nargo/program/VK/Solidity/compiler inputs were recorded in
 * generation/component receipts, not as newly invented rows in raw636. */
export function assertW39DevOriginalCompilerInputsV5() {
  assert.equal(arguments.length, 0, 'W39_DEPENDENCY_INPUT_NO_OPTIONS');
  return ['noir', 'nargo', 'program', 'key', 'solidity', 'compiled'].map(name => {
    const path = W39_DEV_SOURCE_V5[name], bytes = bytesFor(path);
    assert.equal(sha(bytes), W39_DEV_SOURCE_V5[name + 'SHA256'], 'W39_DEPENDENCY_ORIGINAL_RAW_INPUT_CHANGED');
    return { path, sha256: sha(bytes) };
  });
}
