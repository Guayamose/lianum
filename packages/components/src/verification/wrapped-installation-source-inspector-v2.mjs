import {hasAdoptedSourceGeneration,assertAdoptedSourceGeneration} from './current-source-generation.mjs';
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
import { join } from 'node:path';
import { legacyDataRoot } from '@lianum/environment';

const APPROVED_WRAPPED_INSTALLATION_MANIFEST_SHA256_V2 = '58b9001db1337461301a3ae69e32f1fb292e1d68d2916ac5bac4921742c30ddd';
const INSTALLATION_ROOT = join(legacyDataRoot('wallet'), '../..');
const MANIFEST_PATH = 'drafts/wrapped-activation-installation-v2/source-manifest.json';
const BOOTSTRAP_PATH = 'omnichain-flat-profile/flat-wallet/integration/wrapped-installation-source-inspector-v2.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

import { SCHEMA, record, sourcePath, validateManifest, validateSourceBytes, validateSnapshot } from './wrapped-installation-data-v2.mjs';


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
let firstSourceMode = null, firstAdoptedGeneration = null;
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
    const adoptedMode = hasAdoptedSourceGeneration();
    const mode = adoptedMode ? 'ADOPTED_CURRENT_SOURCES' : 'ORIGINAL_INSTALLED_SOURCES';
    firstSourceMode ??= mode;
    assert.equal(mode, firstSourceMode, 'WRAPPED_INSTALLATION_SOURCE_MODE_CHANGED');
    if (adoptedMode) {
      // The explicitly reviewed generation authenticates current code. The
      // original installation manifest remains a fixed immutable data contract
      // for retained release/ABI/proof consumers; it never becomes new code.
      const adopted = assertAdoptedSourceGeneration();
      firstAdoptedGeneration ??= adopted.generation;
      assert.equal(adopted.generation, firstAdoptedGeneration, 'WRAPPED_INSTALLATION_GENERATION_CHANGED');
      assert.ok(adopted.sourceFiles.some(row => row.source ===
        'packages/components/src/verification/wrapped-installation-source-inspector-v2.mjs'),
        'WRAPPED_INSTALLATION_INSPECTOR_NOT_ADOPTED');
      const raw = fixedRead(MANIFEST_PATH, 4 * 1024 * 1024);
      if (firstManifestBytes !== null) assert.equal(raw.compare(firstManifestBytes), 0, 'WRAPPED_INSTALLATION_MANIFEST_CHANGED');
      const manifest = lastManifest ?? validateManifest(raw, APPROVED_WRAPPED_INSTALLATION_MANIFEST_SHA256_V2);
      const final = assertAdoptedSourceGeneration();
      assert.equal(final.generation, adopted.generation, 'WRAPPED_INSTALLATION_GENERATION_CHANGED');
      assert.equal(fixedRead(MANIFEST_PATH, 4 * 1024 * 1024).compare(raw), 0, 'WRAPPED_INSTALLATION_MANIFEST_CHANGED');
      firstManifestBytes ??= Buffer.from(raw); lastManifest = manifest;
      return Object.freeze({schema: SCHEMA, state: manifest.state,
        sourceCount: adopted.sources, originalSourceCount: manifest.sourceFiles.length,
        manifestSHA256: APPROVED_WRAPPED_INSTALLATION_MANIFEST_SHA256_V2,
        adoptedSourceGeneration: adopted.generation, sourceBytesMatch: true,
        immutableLifetimeEstablished: false, activationAuthorized: false});
    }
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
