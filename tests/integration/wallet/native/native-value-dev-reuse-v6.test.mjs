/** Bounded metadata/namespace regressions; no compilation or financial execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validatePublishedW39ReuseCapsuleV6, inspectPublishedW39ReuseArtifactsV6 }
  from '../../../../packages/backend/src/operations/deployments/native-value/native-value-dev-w39-reused-artifacts-v6.mjs';
import { w39DevDigestV5 } from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-w39-contract-v5.mjs';
import { assertNativeValueArtifactBundle } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { resolveDevelopmentWorkspaceExportV1, isDevelopmentWorkspacePackageLabelV1 }
  from '../../../../packages/backend/src/operations/releases/native-value/workspace-package-source-v1.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [{ path: 'development-tooling/dev', sha256: '01'.repeat(32) },
  { path: 'scripts/prepare-development-native-value-w39-v5.mjs', sha256: '02'.repeat(32) }];
const bytes = Buffer.from(JSON.stringify(rows)), digest = w39DevDigestV5(rows);
test('retained build keeps authentic original provenance without claiming current launchers built it', () => {
  const result = validatePublishedW39ReuseCapsuleV6(bytes, digest, sha(bytes));
  assert.equal(result.recordedFiles, 2);
  assert.equal(result.currentLaunchersClaimedAsOriginal, false);
  assert.equal(result.artifactBundleIssued, false);
  assert.ok(Object.isFrozen(result));
  assert.throws(() => assertNativeValueArtifactBundle(result), /FIXED_ARTIFACT_BUNDLE_REQUIRED/);
});
test('altered raw capsule, receipt digest and rewritten historical launcher pins reject', () => {
  assert.throws(() => validatePublishedW39ReuseCapsuleV6(Buffer.concat([bytes, Buffer.from(' ')]), digest, sha(bytes)), /RECORDED_RAW_SHA/);
  assert.throws(() => validatePublishedW39ReuseCapsuleV6(bytes, 'ff'.repeat(32), sha(bytes)), /RECORDED_RECEIPT_JOIN/);
  const changed = structuredClone(rows); changed[0].sha256 = '03'.repeat(32);
  assert.throws(() => validatePublishedW39ReuseCapsuleV6(Buffer.from(JSON.stringify(changed)), w39DevDigestV5(changed), sha(bytes)), /RECORDED_RAW_SHA/);
});
test('reuse metadata rejects duplicate historical rows, escaping paths and caller options', () => {
  for (const bad of [[...rows, rows[0]], [{ path: '../private', sha256: rows[0].sha256 }]]) {
    const data = Buffer.from(JSON.stringify(bad));
    assert.throws(() => validatePublishedW39ReuseCapsuleV6(data, w39DevDigestV5(bad), sha(data)));
  }
  assert.throws(() => validatePublishedW39ReuseCapsuleV6(bytes, digest, sha(bytes), {}), /ARITY/);
  assert.throws(() => inspectPublishedW39ReuseArtifactsV6({ caller: true }), /NO_OPTIONS/);
});
test('workspace source labels accept known packages and reject escapes and private roots', () => {
  assert.equal(isDevelopmentWorkspacePackageLabelV1('workspace-package/engine/src/crypto/vault.mjs'), true);
  for (const name of ['workspace-package/unknown/src/file.mjs', 'workspace-package/engine/../file.mjs',
    'workspace-package/engine/.env', 'workspace-package/engine/.local/key', 'workspace-package/engine/node_modules/substitute'])
    assert.equal(isDevelopmentWorkspacePackageLabelV1(name), false);
});
test('workspace resolver rejects unknown packages, undeclared exports and computed selectors', () => {
  for (const name of ['@lianum/unreviewed', '@lianum/engine/src/crypto/vault.mjs', '@lianum/engine/../backend', '@lianum/engine/${target}'])
    assert.throws(() => resolveDevelopmentWorkspaceExportV1(name), /DEV_WORKSPACE_PACKAGE_/);
  assert.throws(() => resolveDevelopmentWorkspaceExportV1('@lianum/engine/accounts/keeper', {}), /ARITY/);
});
test('workspace resolver follows the existing mobile conditional default export', () => {
  const entry = resolveDevelopmentWorkspaceExportV1('@lianum/mobile-protocol');
  assert.ok(entry.manifest.endsWith('/packages/mobile-protocol/package.json'));
  assert.ok(entry.target.endsWith('/packages/mobile-protocol/src/authorization.mjs'));
  assert.match(entry.manifestSHA256, /^[0-9a-f]{64}$/);
});
