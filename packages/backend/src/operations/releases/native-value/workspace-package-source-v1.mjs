/** Resolve explicitly exported workspace modules for development source capture.
 * Package declarations and imported implementation bytes are captured separately.
 * This resolver neither changes a release nor issues an artifact capability. */
import assert from 'node:assert/strict';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { FLAT } from '@lianum/proofs/catalog';

const PACKAGES = resolve(FLAT, '../../../packages');
const names = new Set(['backend', 'engine', 'protocol', 'proofs', 'custody', 'crypto', 'components', 'environment', 'mobile-protocol']);
export function isDevelopmentWorkspacePackageLabelV1(name) {
  if (typeof name !== 'string' || !name.startsWith('workspace-package/')) return false;
  const parts = name.slice('workspace-package/'.length).split('/');
  return names.has(parts[0]) && parts.length > 1 && parts.every(part => /^[a-zA-Z0-9_.-]+$/.test(part) && part !== '.' && part !== '..'
    && part !== 'node_modules' && part !== '.local' && part !== '.git' && !part.startsWith('.env'));
}
function physical(path) {
  assert.equal(realpathSync(path), path, 'DEV_WORKSPACE_PACKAGE_PHYSICAL_PATH');
  const info = lstatSync(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 1024 * 1024, 'DEV_WORKSPACE_PACKAGE_REGULAR_FILE');
  return path;
}
function conditional(value, depth = 0) {
  assert.ok(depth < 8, 'DEV_WORKSPACE_PACKAGE_CONDITION_DEPTH');
  if (typeof value === 'string') return value;
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'DEV_WORKSPACE_PACKAGE_CONDITION');
  // Node evaluates active conditions in declaration order. Type declarations
  // are intentionally inactive for the runtime source closure.
  for (const [condition, target] of Object.entries(value))
    if (['node', 'import', 'default'].includes(condition)) return conditional(target, depth + 1);
  assert.fail('DEV_WORKSPACE_PACKAGE_RUNTIME_CONDITION_REQUIRED');
}
export function resolveDevelopmentWorkspaceExportV1(specifier) {
  assert.equal(arguments.length, 1, 'DEV_WORKSPACE_PACKAGE_ARITY');
  assert.equal(typeof specifier, 'string');
  const match = /^@lianum\/([a-z-]+)(?:\/([a-zA-Z0-9_./-]+))?$/.exec(specifier);
  assert.ok(match && names.has(match[1]), 'DEV_WORKSPACE_PACKAGE_KNOWN_NAME');
  const packageRoot = join(PACKAGES, match[1]), manifest = physical(join(packageRoot, 'package.json'));
  const manifestBytes = readFileSync(manifest), data = JSON.parse(manifestBytes);
  assert.equal(data.name, '@lianum/' + match[1], 'DEV_WORKSPACE_PACKAGE_NAME');
  const key = match[2] ? './' + match[2] : '.';
  assert.ok(!key.slice(2).split('/').some(part => part === '.' || part === '..'), 'DEV_WORKSPACE_PACKAGE_SUBPATH');
  const selected = typeof data.exports === 'string' && key === '.' ? data.exports : data.exports?.[key];
  assert.ok(selected !== undefined, 'DEV_WORKSPACE_PACKAGE_DECLARED_EXPORT');
  const target = conditional(selected);
  assert.ok(typeof target === 'string' && target.startsWith('./'), 'DEV_WORKSPACE_PACKAGE_DECLARED_EXPORT');
  const label = 'workspace-package/' + match[1] + '/' + target.slice(2);
  assert.ok(isDevelopmentWorkspacePackageLabelV1(label), 'DEV_WORKSPACE_PACKAGE_PUBLIC_TARGET');
  const targetPath = physical(join(packageRoot, target.slice(2)));
  return Object.freeze({ manifest, target: targetPath,
    manifestSHA256: createHash('sha256').update(manifestBytes).digest('hex') });
}
