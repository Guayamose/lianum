/** REVIEW-ONLY, UNINSTALLED SOURCE INSPECTOR. This is not an activation entry,
 * supervisor identity, source-registration API, artifact owner, or permission.
 * The root below is a NEW proposed external installation input, not an existing
 * trusted root. It remains null. The installation authority must authenticate
 * this bootstrap's exact bytes separately: the manifest cannot hash its own
 * root-bearing consumer without recreating the cycle.
 * No local payload code is imported, even on the hypothetical populated path. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPROVED_WRAPPED_INSTALLATION_MANIFEST_SHA256_V2 = '58b9001db1337461301a3ae69e32f1fb292e1d68d2916ac5bac4921742c30ddd';
const INSTALLATION_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MANIFEST_PATH = 'drafts/wrapped-activation-installation-v2/source-manifest.json';
const BOOTSTRAP_PATH = 'omnichain-flat-profile/flat-wallet/integration/wrapped-installation-source-inspector-v2.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// BEGIN PURE DATA CONTRACT. Tests extract this section only; they do not replace
// the production root or manufacture an original supervisor/artifact identity.
const SCHEMA = 'LIANUM_WRAPPED_INSTALLATION_SOURCE_MANIFEST_V2';
const PURPOSE = 'SOURCE_AUTHENTICATION_ONLY_NO_EXECUTION_PERMISSION';
const ANCHOR_ROLES = Object.freeze({
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
const REQUIRED_CONSUMERS = Object.freeze([
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
function record(value, keys) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'WRAPPED_INSTALL_RECORD');
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'WRAPPED_INSTALL_FIELDS');
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    assert.ok(Number.isSafeInteger(value) && value >= 0, 'WRAPPED_INSTALL_INTEGER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  assert.ok(value && typeof value === 'object', 'WRAPPED_INSTALL_JSON_VALUE');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
function sourcePath(path) {
  assert.equal(typeof path, 'string');
  assert.ok(path.length <= 1024 && /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith('/') &&
    !path.split('/').some(part => !part || part === '.' || part === '..'), 'WRAPPED_INSTALL_PATH');
  assert.ok(['omnichain-flat-profile/', 'omnichain-product/',
    'drafts/native-value-verifier-preparation/', 'drafts/generic-native-admission-compile/'].some(prefix => path.startsWith(prefix)), 'WRAPPED_INSTALL_ROOT');
  assert.notEqual(path, BOOTSTRAP_PATH, 'WRAPPED_INSTALL_ROOT_MUST_BE_EXTERNAL');
  return path;
}
function validateManifest(raw, expectedDigest) {
  assert.ok(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 4 * 1024 * 1024, 'WRAPPED_INSTALL_MANIFEST_SIZE');
  assert.match(expectedDigest, /^[0-9a-f]{64}$/, 'WRAPPED_INSTALL_TRUSTED_ROOT_REQUIRED');
  assert.equal(sha(raw), expectedDigest, 'WRAPPED_INSTALL_MANIFEST_PIN');
  const text = raw.toString('utf8'), manifest = JSON.parse(text);
  assert.equal(Buffer.from(text, 'utf8').compare(raw), 0, 'WRAPPED_INSTALL_UTF8');
  assert.equal(text, canonical(manifest) + '\n', 'WRAPPED_INSTALL_CANONICAL_JSON');
  record(manifest, ['schema', 'version', 'purpose', 'state', 'sourceFiles']);
  assert.equal(manifest.schema, SCHEMA, 'WRAPPED_INSTALL_SCHEMA');
  assert.equal(manifest.version, 2, 'WRAPPED_INSTALL_VERSION');
  assert.equal(manifest.purpose, PURPOSE, 'WRAPPED_INSTALL_PURPOSE');
  assert.ok(['CLOSED_SOURCE_ONLY', 'POPULATED_SOURCE_ONLY'].includes(manifest.state), 'WRAPPED_INSTALL_STATE');
  assert.ok(Array.isArray(manifest.sourceFiles) && manifest.sourceFiles.length > 0 && manifest.sourceFiles.length <= 10000, 'WRAPPED_INSTALL_ROWS');
  let previous = '';
  const paths = new Set();
  for (const row of manifest.sourceFiles) {
    record(row, ['path', 'role', 'bytes', 'sha256']); sourcePath(row.path);
    assert.ok(row.path > previous, 'WRAPPED_INSTALL_SORT_OR_DUPLICATE'); previous = row.path;
    assert.equal(row.role, ANCHOR_ROLES[row.path] ?? 'source', 'WRAPPED_INSTALL_ROLE');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 16 * 1024 * 1024, 'WRAPPED_INSTALL_SOURCE_SIZE');
    assert.match(row.sha256, /^[0-9a-f]{64}$/, 'WRAPPED_INSTALL_SOURCE_HASH');
    paths.add(row.path); Object.freeze(row);
  }
  for (const path of [...Object.keys(ANCHOR_ROLES), ...REQUIRED_CONSUMERS])
    assert.ok(paths.has(path), 'WRAPPED_INSTALL_REQUIRED_' + path);
  Object.freeze(manifest.sourceFiles); return Object.freeze(manifest);
}
function validateSourceBytes(manifest, snapshot) {
  assert.ok(snapshot instanceof Map && snapshot.size === manifest.sourceFiles.length, 'WRAPPED_INSTALL_EXACT_SNAPSHOT');
  for (const row of manifest.sourceFiles) {
    const bytes = snapshot.get(row.path);
    assert.ok(Buffer.isBuffer(bytes), 'WRAPPED_INSTALL_SOURCE_MISSING');
    assert.equal(bytes.length, row.bytes, 'WRAPPED_INSTALL_SOURCE_BYTES');
    assert.equal(sha(bytes), row.sha256, 'WRAPPED_INSTALL_SOURCE_PIN');
  }
  return true;
}
function validateSnapshot(manifest, snapshot) {
  validateSourceBytes(manifest, snapshot);
  const known = new Set(manifest.sourceFiles.map(row=>row.path));
  for (const row of manifest.sourceFiles) {
    if (!row.path.endsWith('.mjs')) continue;
    const text = snapshot.get(row.path).toString('utf8');
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
// END PURE DATA CONTRACT.

// Only pure pathname derivation is retained. No filesystem fact, source byte,
// hash result, liveness observation or authority is cached by this map.
const fixedReadPaths = new Map();
function fixedRead(relative, maximum) {
  // Only approved-manifest rows reach here; neither callers nor environment
  // select the root, manifest, entry, hash, reader, or source content.
  assert.equal(realpathSync.native(INSTALLATION_ROOT), INSTALLATION_ROOT.replace(/\/$/, ''), 'WRAPPED_INSTALL_ROOT_SYMLINK');
  let paths = fixedReadPaths.get(relative);
  if (!paths) {
    let prefix = INSTALLATION_ROOT;
    paths = Object.freeze(relative.split('/').map(component => (prefix = join(prefix, component))));
    fixedReadPaths.set(relative, paths);
  }
  for (const path of paths) assert.equal(lstatSync(path).isSymbolicLink(), false, 'WRAPPED_INSTALL_SYMLINK');
  const path = paths.at(-1);
  const before = lstatSync(path);
  assert.ok(before.isFile() && before.size > 0 && before.size <= maximum, 'WRAPPED_INSTALL_REGULAR');
  const bytes = readFileSync(path), after = lstatSync(path);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) assert.equal(after[key], before[key], 'WRAPPED_INSTALL_CHANGED_DURING_READ');
  assert.equal(bytes.length, before.size, 'WRAPPED_INSTALL_READ_SIZE'); return bytes;
}
let firstManifestBytes = null, firstBootstrapBytes = null, lastManifest = null, permanentlyFaulted = false;
const sourceWork = { inspections: 0, elapsedMilliseconds: 0, available: true, saturated: false };
/** Bounded no-options work accounting only. No reset, configuration, source
 * bytes, paths, observation cache or authority is exposed by this snapshot. */
export function wrappedSourceWorkDiagnosticV2() {
  assert.equal(arguments.length, 0, 'WRAPPED_SOURCE_WORK_NO_OPTIONS');
  return Object.freeze({ schema: 'WRAPPED_SOURCE_WORK_DIAGNOSTIC_V2', ...sourceWork,
    elapsedMilliseconds: Math.ceil(sourceWork.elapsedMilliseconds) });
}
/** Source inspection only, never returns a capability or original-owner brand.
 * Per-call reads and a permanent drift latch do not establish immutable storage
 * between calls. Original consumers recheck this boundary before their existing
 * allocation/effect/authority gates. A separately reviewed installation freeze
 * remains required; no atomic ESM-load protection is claimed. The real null
 * branch reads no payload source/artifact. */
export function inspectWrappedInstallationSourcesV2() {
  assert.equal(arguments.length, 0, 'WRAPPED_INSTALL_NO_OPTIONS');
  assert.ok(APPROVED_WRAPPED_INSTALLATION_MANIFEST_SHA256_V2 !== null, 'WRAPPED_INSTALLATION_TRUST_INPUT_ABSENT');
  assert.equal(permanentlyFaulted, false, 'WRAPPED_INSTALLATION_PERMANENTLY_FAULTED');
  const workStarted = performance.now();
  sourceWork.inspections = Math.min(1_000_000_000, sourceWork.inspections + 1);
  sourceWork.saturated ||= sourceWork.inspections === 1_000_000_000;
  try {
    const bootstrap = fixedRead(BOOTSTRAP_PATH, 128 * 1024);
    if (firstBootstrapBytes !== null) assert.equal(bootstrap.compare(firstBootstrapBytes), 0, 'WRAPPED_INSTALLATION_BOOTSTRAP_CHANGED');
    const raw = fixedRead(MANIFEST_PATH, 4 * 1024 * 1024);
    if (firstManifestBytes !== null) assert.equal(raw.compare(firstManifestBytes), 0, 'WRAPPED_INSTALLATION_MANIFEST_CHANGED');
    // Pure parsing/import closure is unchanged when the pinned manifest and
    // every freshly read source hash are identical. Reuse no filesystem or RPC
    // observation: all fixed reads, drift checks and byte hashes still run.
    const manifest = lastManifest ?? validateManifest(raw, APPROVED_WRAPPED_INSTALLATION_MANIFEST_SHA256_V2);
    const snapshot = new Map(manifest.sourceFiles.map(row => [row.path, fixedRead(row.path, 16 * 1024 * 1024)]));
    if (lastManifest === null) validateSnapshot(manifest, snapshot);
    else validateSourceBytes(manifest, snapshot);
    const finalRaw = fixedRead(MANIFEST_PATH, 4 * 1024 * 1024);
    assert.equal(finalRaw.compare(raw), 0, 'WRAPPED_INSTALLATION_MANIFEST_CHANGED');
    firstManifestBytes ??= Buffer.from(raw); firstBootstrapBytes ??= Buffer.from(bootstrap); lastManifest = manifest;
    return Object.freeze({schema: SCHEMA, state: manifest.state, sourceCount: manifest.sourceFiles.length,
      manifestSHA256: APPROVED_WRAPPED_INSTALLATION_MANIFEST_SHA256_V2, sourceBytesMatch: true,
      immutableLifetimeEstablished: false, activationAuthorized: false});
  } catch (error) { permanentlyFaulted = true; throw error; }
  finally {
    const elapsed = performance.now() - workStarted;
    if (Number.isFinite(elapsed) && elapsed >= 0) {
      sourceWork.elapsedMilliseconds = Math.min(1_000_000_000_000, sourceWork.elapsedMilliseconds + elapsed);
      sourceWork.saturated ||= sourceWork.elapsedMilliseconds === 1_000_000_000_000;
    } else sourceWork.available = false;
  }
}

// Exact directional inner-row contract. These checks validate literal data;
// they neither accept a root/hash/path/reader from callers nor mint authority.
const DEFERRED_INNER_ANCHORS = Object.freeze([
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/wrapped-claim-release-v1.mjs',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/wrapped-wallet-release-v1.mjs',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/api/wrapped-withdrawal-release-v1.mjs',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-value-wallet-host-source-pins-v4.mjs',
  'omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-value-wallet-release-v4.mjs',
  'omnichain-flat-profile/flat-wallet/proof-workers/native-value-wallet-role-source-pins-v4.mjs',
  'omnichain-flat-profile/flat-wallet/proof-workers/native-value-wallet-role-release-v4.mjs',
]);
function logicalSource(row) {
  record(row, ['root', 'path', 'sha256']);
  const prefixes = {wallet: 'omnichain-flat-profile/flat-wallet/', flat: 'omnichain-flat-profile/', golden: 'omnichain-product/'};
  assert.ok(Object.hasOwn(prefixes, row.root), 'WRAPPED_INSTALL_INNER_ROOT');
  return sourcePath(prefixes[row.root] + row.path);
}
function accountProjection() {
  const excluded = new Set(DEFERRED_INNER_ANCHORS), rows = [];
  for (const row of lastManifest.sourceFiles) {
    if (excluded.has(row.path)) continue;
    const selected = [['wallet','omnichain-flat-profile/flat-wallet/'],['golden','omnichain-product/'],['flat','omnichain-flat-profile/']].find(([,prefix])=>row.path.startsWith(prefix));
    if (selected) rows.push({root: selected[0], path: row.path.slice(selected[1].length), sha256: row.sha256});
  }
  return rows.sort((a,b)=>(a.root+'/'+a.path)<(b.root+'/'+b.path)?-1:1);
}
export function assertWrappedAccountSourceRowsV2(rows) {
  assert.equal(arguments.length, 1, 'WRAPPED_INSTALL_ACCOUNT_ROWS_ARITY'); inspectWrappedInstallationSourcesV2();
  assert.deepEqual(rows, accountProjection(), 'WRAPPED_INSTALL_ACCOUNT_DIRECTIONAL_ROWS'); return true;
}
export function assertWrappedWithdrawalSourceRowsV2(rows) {
  assert.equal(arguments.length, 1, 'WRAPPED_INSTALL_WITHDRAWAL_ROWS_ARITY'); inspectWrappedInstallationSourcesV2();
  assert.deepEqual(rows, accountProjection(), 'WRAPPED_INSTALL_WITHDRAWAL_DIRECTIONAL_ROWS'); return true;
}
export function assertWrappedProofHostRowsV2(rows) {
  assert.equal(arguments.length, 1, 'WRAPPED_INSTALL_PROOF_ROWS_ARITY'); inspectWrappedInstallationSourcesV2();
  assert.ok(Array.isArray(rows) && rows.length > 0, 'WRAPPED_INSTALL_PROOF_ROWS');
  const byPath = new Map(lastManifest.sourceFiles.map(row=>[row.path,row]));
  const excluded = new Set([...DEFERRED_INNER_ANCHORS, 'omnichain-flat-profile/flat-wallet/proof-workers/wrapped-claim-proof-pins-v1.mjs']);
  const seen = new Set();
  for (const row of rows) {
    record(row,['root','path','bytes','sha256']);
    const path = logicalSource({root:row.root,path:row.path,sha256:row.sha256});
    assert.ok(!excluded.has(path) && !seen.has(path), 'WRAPPED_INSTALL_PROOF_ANCHOR_OR_DUPLICATE'); seen.add(path);
    const expected = byPath.get(path); assert.ok(expected, 'WRAPPED_INSTALL_PROOF_SOURCE_NOT_INSTALLED');
    assert.equal(row.bytes,expected.bytes); assert.equal(row.sha256,expected.sha256);
  }
  return true;
}
