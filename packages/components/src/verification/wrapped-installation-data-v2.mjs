/** Pure immutable data contract for the historical V2 source publication.
 * Parsing and byte authentication grant no runtime identity or activation.
 * The caller supplies bytes and the independently authenticated expected hash.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
export const BOOTSTRAP_PATH = 'omnichain-flat-profile/flat-wallet/integration/wrapped-installation-source-inspector-v2.mjs';
/** @param {Uint8Array} bytes */
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const SCHEMA = 'LIANUM_WRAPPED_INSTALLATION_SOURCE_MANIFEST_V2';
const PURPOSE = 'SOURCE_AUTHENTICATION_ONLY_NO_EXECUTION_PERMISSION';
/** @type {Readonly<Record<string,string>>} */
export const ANCHOR_ROLES = Object.freeze({
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/native-claims/begin-payout-audit-policy-v1.mjs': 'raw-begin-payout-audit-release',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/wrapped-claim-release-v1.mjs': 'wrapped-claim-release',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/wrapped-wallet-release-v1.mjs': 'wrapped-account-release',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-value-wallet-host-source-pins-v4.mjs': 'native-host-table',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-value-wallet-release-v4.mjs': 'native-deployment-release',
  'omnichain-flat-profile/flat-wallet/proof-workers/wrapped-claim-proof-pins-v1.mjs': 'wrapped-proof-pins',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/api/wrapped-withdrawal-release-v1.mjs': 'wrapped-withdrawal-release',
  'omnichain-flat-profile/flat-wallet/proof-workers/native-value-wallet-role-source-pins-v4.mjs': 'native-role-table',
  'omnichain-flat-profile/flat-wallet/proof-workers/native-value-wallet-role-release-v4.mjs': 'native-role-release',
  'omnichain-flat-profile/flat-wallet/integration/wrapped-wallet-fixed-policy-v1.mjs': 'wrapped-entry-policy',
  'omnichain-flat-profile/flat-wallet/integration/native-wallet-real-release-v4.mjs': 'native-entry-policy',
});
export const REQUIRED_CONSUMERS = Object.freeze([
  'omnichain-flat-profile/flat-wallet/integration/run-wrapped-deployment-only-v1.mjs',
  'omnichain-flat-profile/flat-wallet/integration/wrapped-deployment-only-v1.mjs',
  'omnichain-flat-profile/flat-wallet/integration/run-native-claim-begin-payout-audit-v1.mjs',
  'omnichain-flat-profile/flat-wallet/integration/run-wrapped-wallet-fixed-preflight-v1.mjs',
  'omnichain-flat-profile/flat-wallet/integration/run-wrapped-wallet-fixed-acceptance-v1.mjs',
  'omnichain-flat-profile/flat-wallet/integration/native-flow-supervisor.mjs',
  'omnichain-flat-profile/flat-wallet/mobile-core/wrapped-claim-owner-process-v1.mjs',
  'omnichain-flat-profile/flat-wallet/mobile-core/flat-owner-custody.mjs',
  'omnichain-flat-profile/flat-wallet/integration/wrapped-wallet-fixed-driver-v1.mjs',
  'omnichain-flat-profile/flat-wallet/integration/wrapped-wallet-fixed-fixture-v1.mjs',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/wrapped-claim-deployment-artifacts-v1.mjs',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/wrapped-claim-proof-artifacts-v1.mjs',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/wrapped-claim-system-v1.mjs',
]);
/** @param {unknown} value @param {readonly string[]} keys
 * @returns {asserts value is Record<string,unknown>} */
export function record(value, keys) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'WRAPPED_INSTALL_RECORD');
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'WRAPPED_INSTALL_FIELDS');
}
/** @param {unknown} value @returns {string} */
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    assert.ok(Number.isSafeInteger(value) && value >= 0, 'WRAPPED_INSTALL_INTEGER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  assert.ok(value && typeof value === 'object', 'WRAPPED_INSTALL_JSON_VALUE');
  record(value,Object.keys(value));
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
/** @param {unknown} path @returns {string} */
export function sourcePath(path) {
  assert.ok(typeof path === 'string');
  assert.ok(path.length <= 1024 && /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith('/') &&
    !path.split('/').some(part => !part || part === '.' || part === '..'), 'WRAPPED_INSTALL_PATH');
  assert.ok(['omnichain-flat-profile/', 'omnichain-product/',
    'drafts/native-value-verifier-preparation/', 'drafts/generic-native-admission-compile/'].some(prefix => path.startsWith(prefix)), 'WRAPPED_INSTALL_ROOT');
  assert.notEqual(path, BOOTSTRAP_PATH, 'WRAPPED_INSTALL_ROOT_MUST_BE_EXTERNAL');
  return path;
}
/** @typedef {{path:string,role:string,bytes:number,sha256:string}} SourceRow */
/** @typedef {{schema:typeof SCHEMA,version:2,purpose:typeof PURPOSE,state:'CLOSED_SOURCE_ONLY'|'POPULATED_SOURCE_ONLY',sourceFiles:SourceRow[]}} SourceManifest */
/** @param {unknown} raw @param {unknown} expectedDigest @returns {Readonly<SourceManifest>} */
export function validateManifest(raw, expectedDigest) {
  assert.ok(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 4 * 1024 * 1024, 'WRAPPED_INSTALL_MANIFEST_SIZE');
  assert.ok(typeof expectedDigest==='string','WRAPPED_INSTALL_TRUSTED_ROOT_REQUIRED');
  assert.match(expectedDigest, /^[0-9a-f]{64}$/, 'WRAPPED_INSTALL_TRUSTED_ROOT_REQUIRED');
  assert.equal(sha(raw), expectedDigest, 'WRAPPED_INSTALL_MANIFEST_PIN');
  const text = raw.toString('utf8');
  /** @type {unknown} */
  const manifest = JSON.parse(text);
  assert.equal(Buffer.from(text, 'utf8').compare(raw), 0, 'WRAPPED_INSTALL_UTF8');
  assert.equal(text, canonical(manifest) + '\n', 'WRAPPED_INSTALL_CANONICAL_JSON');
  assertManifestFields(manifest);return Object.freeze(manifest);
}
/** @param {unknown} row @returns {asserts row is SourceRow} */
function assertSourceRow(row) {
  record(row,['path','role','bytes','sha256']);sourcePath(row.path);
  assert.ok(typeof row.path==='string');assert.ok(typeof row.role==='string');
  assert.ok(typeof row.bytes==='number'&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=16*1024*1024,'WRAPPED_INSTALL_SOURCE_SIZE');
  assert.ok(typeof row.sha256==='string','WRAPPED_INSTALL_SOURCE_HASH');assert.match(row.sha256,/^[0-9a-f]{64}$/,'WRAPPED_INSTALL_SOURCE_HASH');
}
/** @param {unknown} manifest @returns {asserts manifest is SourceManifest} */
function assertManifestFields(manifest) {
  record(manifest, ['schema', 'version', 'purpose', 'state', 'sourceFiles']);
  assert.equal(manifest.schema, SCHEMA, 'WRAPPED_INSTALL_SCHEMA');
  assert.equal(manifest.version, 2, 'WRAPPED_INSTALL_VERSION');
  assert.equal(manifest.purpose, PURPOSE, 'WRAPPED_INSTALL_PURPOSE');
  assert.ok(manifest.state==='CLOSED_SOURCE_ONLY'||manifest.state==='POPULATED_SOURCE_ONLY', 'WRAPPED_INSTALL_STATE');
  assert.ok(Array.isArray(manifest.sourceFiles) && manifest.sourceFiles.length > 0 && manifest.sourceFiles.length <= 10000, 'WRAPPED_INSTALL_ROWS');
  /** @type {unknown[]} */
  const rows=manifest.sourceFiles;
  let previous = '';
  const paths = new Set();
  for (const row of rows) {
    assertSourceRow(row);
    assert.ok(row.path > previous, 'WRAPPED_INSTALL_SORT_OR_DUPLICATE'); previous = row.path;
    assert.equal(row.role, ANCHOR_ROLES[row.path] ?? 'source', 'WRAPPED_INSTALL_ROLE');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 16 * 1024 * 1024, 'WRAPPED_INSTALL_SOURCE_SIZE');
    assert.match(row.sha256, /^[0-9a-f]{64}$/, 'WRAPPED_INSTALL_SOURCE_HASH');
    paths.add(row.path); Object.freeze(row);
  }
  for (const path of [...Object.keys(ANCHOR_ROLES), ...REQUIRED_CONSUMERS])
    assert.ok(paths.has(path), 'WRAPPED_INSTALL_REQUIRED_' + path);
  Object.freeze(manifest.sourceFiles);
}
/** @param {SourceManifest} manifest @param {ReadonlyMap<string,Uint8Array>} snapshot */
export function validateSourceBytes(manifest, snapshot) {
  assert.ok(snapshot instanceof Map && snapshot.size === manifest.sourceFiles.length, 'WRAPPED_INSTALL_EXACT_SNAPSHOT');
  for (const row of manifest.sourceFiles) {
    const bytes = snapshot.get(row.path);
    assert.ok(Buffer.isBuffer(bytes), 'WRAPPED_INSTALL_SOURCE_MISSING');
    assert.equal(bytes.length, row.bytes, 'WRAPPED_INSTALL_SOURCE_BYTES');
    assert.equal(sha(bytes), row.sha256, 'WRAPPED_INSTALL_SOURCE_PIN');
  }
  return true;
}
/** @param {SourceManifest} manifest @param {ReadonlyMap<string,Uint8Array>} snapshot */
export function validateSnapshot(manifest, snapshot) {
  validateSourceBytes(manifest, snapshot);
  const known = new Set(manifest.sourceFiles.map(row=>row.path));
  for (const row of manifest.sourceFiles) {
    if (!row.path.endsWith('.mjs')) continue;
    const bytes=snapshot.get(row.path);assert.ok(Buffer.isBuffer(bytes),'WRAPPED_INSTALL_SOURCE_MISSING');
    const text = bytes.toString('utf8');
    for (const match of text.matchAll(/(?:\bfrom\s+|^\s*import\s+|\bimport\s*\(\s*)(['"])([^'"]+)\1/gm)) {
      const specifier = match[2]; if (specifier.startsWith('node:')) continue;
      if (row.path === 'omnichain-product/experiments/private-core-proof/wallet-notes/prover.mjs' &&
          ['@noir-lang/noir_js','@aztec/bb.js'].includes(specifier)) continue;
      assert.ok(specifier.startsWith('.'), 'WRAPPED_INSTALL_FIXED_IMPORT');
      const target = posix.normalize(posix.join(posix.dirname(row.path),specifier));
      if (target === BOOTSTRAP_PATH) continue; // The ONE independently installed external TCB module.
      sourcePath(target); assert.ok(known.has(target), 'WRAPPED_INSTALL_UNPINNED_IMPORT_' + target);
    }
  }
  return true;
}
