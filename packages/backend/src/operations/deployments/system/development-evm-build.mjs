/** Reviewed public rebuild identity for the disposable development laboratory.
 * This is a NEW build, never a replacement historical receipt. No caller pins,
 * paths or release switches are accepted. The old artifact path remains intact. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';
import { regular, hash } from '@lianum/proofs/tooling/tooling';
export const DEVELOPMENT_EVM_DIRECTORY = join(ROOT, '.local/development-evm/v1');
export const DEVELOPMENT_EVM_BUILD_PIN = Object.freeze({
  manifestSHA256: '2c35cb4017e7afc3844422e0e93e1e68651459bc51aea123d60b7be692de4958',
  ledgerSHA256: 'bb77b03d81ac04dc933c2889577458497a97b344515336ce5d28237a62b7133b',
  routerSHA256: '1521de22c45bfaeb8a554d6600337db745a4baef3cfb71b7de729d166cf639b6',
});
export function developmentEvmBuildAvailable() {
  assert.equal(arguments.length, 0);
  return existsSync(join(DEVELOPMENT_EVM_DIRECTORY, 'manifest.json'));
}
export function assertDevelopmentEvmBuildBytes(bytes) {
  assert.equal(arguments.length, 1);
  assert.ok(Buffer.isBuffer(bytes), 'DEVELOPMENT_EVM_MANIFEST_BYTES');
  assert.ok(DEVELOPMENT_EVM_BUILD_PIN.manifestSHA256, 'DEVELOPMENT_EVM_BUILD_NOT_REVIEWED');
  assert.equal(hash(bytes), DEVELOPMENT_EVM_BUILD_PIN.manifestSHA256, 'DEVELOPMENT_EVM_MANIFEST_PIN');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.format, 'LIANUM_DEVELOPMENT_EVM_BUILD_V1');
  assert.equal(manifest.classification, 'REBUILT_PUBLIC_ARTIFACTS_FOR_NEW_LOCAL_LAB_NOT_HISTORICAL_ACCEPTANCE');
  assert.equal(manifest.ledgerSHA256, DEVELOPMENT_EVM_BUILD_PIN.ledgerSHA256);
  assert.equal(manifest.routerSHA256, DEVELOPMENT_EVM_BUILD_PIN.routerSHA256);
  for (const flag of ['nativeNodesStarted','proofGenerated','historicalReportsRecreated']) assert.equal(manifest[flag], false);
  return manifest;
}

export function readDevelopmentEvmBuild() {
  assert.equal(arguments.length, 0);
  return assertDevelopmentEvmBuildBytes(regular(join(DEVELOPMENT_EVM_DIRECTORY, 'manifest.json')));
}
