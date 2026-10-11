/** Filesystem-only producer closure over fixed roots. No caller path/profile,
 * runtime, compiler or prover. The unpublished literal is excluded to avoid a
 * self hash; its bytes are retained separately by the future lab supervisor. */
import assert from 'node:assert/strict';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { NATIVE_VALUE_DEV_MOBILE_PACKAGE_PINS_V5 } from './native-value-dev-mobile-package-pins-v5.mjs';
import { ROOT, FLAT, GOLDEN, CANDIDATE } from '@lianum/proofs/catalog';
import { NATIVE_VALUE_WALLET_HOST_SOURCE_PINS_V4 } from './native-value-wallet-host-source-pins-v4.mjs';
import { NATIVE_VALUE_DEV_REQUIRED_HOST_ROOTS_V5, NATIVE_VALUE_DEV_DEVELOPMENT_FILE_ROOTS_V5, NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5 } from './native-value-dev-release-contract-v5.mjs';
import { resolveDevelopmentWorkspaceExportV1, isDevelopmentWorkspacePackageLabelV1 } from './workspace-package-source-v1.mjs';
const MOBILE = resolve(FLAT, '../mobile-protocol');
const MOBILE_APP = resolve(FLAT, '../../../apps/mobile');
const MOBILE_PROTOCOL_PACKAGE = resolve(FLAT, '../../../packages/mobile-protocol');
const DEVELOPMENT_ROOT = resolve(FLAT, '../../..');
const roots = Object.freeze([['development-tooling/', join(DEVELOPMENT_ROOT, 'scripts/development')],
  ['development-config/', join(DEVELOPMENT_ROOT, 'scripts')], ['golden/', GOLDEN], ['candidate/', CANDIDATE],
  ['mobile-protocol/', MOBILE], ['mobile-app/', MOBILE_APP],
  ['mobile-protocol-workspace/', MOBILE_PROTOCOL_PACKAGE], ['flat/', FLAT], ['workspace-package/', join(DEVELOPMENT_ROOT, 'packages')], ['workspace-module/', DEVELOPMENT_ROOT], ['development-root/', DEVELOPMENT_ROOT]]);
const excluded = join(ROOT, 'wallet-platform/modules/ops/native-value-dev-release-v5.mjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function pathFor(name) {
  assert.ok(typeof name === 'string' && name.length > 0 && !name.startsWith('/')
    && !name.split('/').some(part => !part || part === '.' || part === '..'), 'NATIVE_VALUE_DEV_FIXED_PATH');
  if (name.startsWith('development-')) assert.ok(NATIVE_VALUE_DEV_DEVELOPMENT_FILE_ROOTS_V5.includes(name),
    'NATIVE_VALUE_DEV_FIXED_DEVELOPMENT_SOURCE_ONLY');
  if (name.startsWith('workspace-module/')) assert.ok(NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5.includes(name),
    'NATIVE_VALUE_DEV_FIXED_WORKSPACE_MODULE_ONLY');
  if (name.startsWith('workspace-package/')) assert.ok(isDevelopmentWorkspacePackageLabelV1(name), 'NATIVE_VALUE_DEV_KNOWN_WORKSPACE_PACKAGE');
  const selected = roots.find(([prefix]) => name.startsWith(prefix));
  return join(selected?.[1] ?? ROOT, selected ? name.slice(selected[0].length) : name);
}
function label(path) {
  if (path.startsWith(ROOT + sep)) return relative(ROOT, path).split(sep).join('/');
  const fixedWorkspace = 'workspace-module/' + relative(DEVELOPMENT_ROOT, path).split(sep).join('/');
  if (NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5.includes(fixedWorkspace)) return fixedWorkspace;
  const selected = roots.find(([, root]) => path.startsWith(root + sep));
  assert.ok(selected, 'NATIVE_VALUE_DEV_LOCAL_SOURCE_ONLY');
  let name = selected[0] + relative(selected[1], path).split(sep).join('/');
  if (name.startsWith('workspace-package/')) assert.ok(isDevelopmentWorkspacePackageLabelV1(name), 'NATIVE_VALUE_DEV_KNOWN_WORKSPACE_PACKAGE');
  if (selected[0] === 'workspace-module/' && !NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5.includes(name))
    name = 'development-root/' + relative(DEVELOPMENT_ROOT, path).split(sep).join('/');
  if (name.startsWith('development-')) assert.ok(NATIVE_VALUE_DEV_DEVELOPMENT_FILE_ROOTS_V5.includes(name),
    'NATIVE_VALUE_DEV_FIXED_DEVELOPMENT_SOURCE_ONLY');
  return name;
}
function regular(path) {
  const name = label(path), selected = roots.find(([prefix]) => name.startsWith(prefix));
  let current = selected?.[1] ?? ROOT;
  assert.equal(realpathSync(current), current, 'NATIVE_VALUE_DEV_FIXED_ROOT_ALIAS');
  assert.ok(lstatSync(current).isDirectory() && !lstatSync(current).isSymbolicLink(), 'NATIVE_VALUE_DEV_FIXED_ROOT');
  for (const part of (selected ? name.slice(selected[0].length) : name).split('/')) {
    current = join(current, part); assert.ok(!lstatSync(current).isSymbolicLink(), 'NATIVE_VALUE_DEV_SOURCE_SYMLINK');
  }
  const stat = lstatSync(current);
  assert.ok(stat.isFile() && stat.size <= 128 * 1024 * 1024, 'NATIVE_VALUE_DEV_SOURCE_FILE');
  const bytes = readFileSync(current); assert.equal(bytes.length, stat.size, 'NATIVE_VALUE_DEV_SOURCE_CHANGED'); return bytes;
}
export function nativeValueDevHostSourcePinsV5() {
  assert.equal(arguments.length, 0, 'NATIVE_VALUE_DEV_SOURCE_NO_OPTIONS');
  inspectNativeValueDevMobileDependenciesV5();
  const files = new Map(), visited = new Set();
  function visit(path) {
    if (path === excluded || visited.has(path)) return;
    const name = label(path), bytes = regular(path); visited.add(path);
    files.set(name, { path: name, sha256: sha(bytes) });
    if (!path.endsWith('.mjs')) return;
    const source = bytes.toString('utf8'), names = new Set();
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g)) names.add(match[2]);
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm)) names.add(match[2]);
    for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) names.add(match[2]);
    for (const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g)) names.add(match[2]);
    for (const name of names) {
      if (name.startsWith('node:') || ['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/noir_wasm'].includes(name)) continue;
      if (name === '@lianum/mobile-protocol') { visit(join(MOBILE_PROTOCOL_PACKAGE, 'src/authorization.mjs')); continue; }
      if (name === '@lianum/mobile-protocol/original-account-v2') { visit(join(MOBILE_PROTOCOL_PACKAGE, 'src/original-account-review-v2.mjs')); continue; }
      if (name.startsWith('@lianum/')) { const entry = resolveDevelopmentWorkspaceExportV1(name); visit(entry.manifest); visit(entry.target);
        assert.equal(files.get(label(entry.manifest)).sha256, entry.manifestSHA256, 'NATIVE_VALUE_DEV_EXPORT_BINDING_CHANGED'); continue; }
      if (name.startsWith('@noble/curves/') && NATIVE_VALUE_DEV_MOBILE_PACKAGE_PINS_V5.rawFiles.some(row => row.path === 'mobile-app/node_modules/' + name)) { visit(join(MOBILE_APP, 'node_modules', name)); continue; }
      if (name.startsWith('@noble/hashes/') && NATIVE_VALUE_DEV_MOBILE_PACKAGE_PINS_V5.rawFiles.some(row => row.path === 'mobile-app/node_modules/' + name)) { visit(join(MOBILE_APP, 'node_modules', name)); continue; }
      assert.ok(name.startsWith('.'), 'NATIVE_VALUE_DEV_STATIC_LOCAL_IMPORT');
      visit(resolve(dirname(path), name));
    }
  }
  for (const row of NATIVE_VALUE_WALLET_HOST_SOURCE_PINS_V4) visit(pathFor(row.path));
  for (const name of NATIVE_VALUE_DEV_REQUIRED_HOST_ROOTS_V5) visit(pathFor(name));
  for (const [name, row] of files) assert.equal(sha(regular(pathFor(name))), row.sha256,
    'NATIVE_VALUE_DEV_SOURCE_CHANGED_DURING_CAPTURE');
  inspectNativeValueDevMobileDependenciesV5();
  return [...files.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Exact public npm versions/integrities and import bindings. Local protocol
 * symlink is allowed only for the reviewed local package root, then both copies
 * are byte-joined; no alias root or caller-provided resolution is accepted. */
export function inspectNativeValueDevMobileDependenciesV5() {
  assert.equal(arguments.length, 0, 'NATIVE_VALUE_DEV_MOBILE_PACKAGES_NO_OPTIONS');
  const pins = NATIVE_VALUE_DEV_MOBILE_PACKAGE_PINS_V5;
  for (const [path, expected] of [['mobile-app/package.json',pins.mobilePackageSHA256],
    ['mobile-app/package-lock.json',pins.packageLockSHA256],
    ['mobile-protocol-workspace/package.json',pins.localProtocolPackageSHA256]])
    assert.equal(sha(regular(pathFor(path))), expected, 'NATIVE_VALUE_DEV_PUBLIC_PACKAGE_MANIFEST_PIN');
  const lock = JSON.parse(regular(pathFor('mobile-app/package-lock.json')));
  for (const row of pins.packages) {
    const record = lock.packages['node_modules/' + row.name];
    for (const field of ['version','resolved','integrity']) assert.equal(record[field],row[field], 'NATIVE_VALUE_DEV_NOBLE_NPM_LOCK');
    const installed = JSON.parse(regular(pathFor('mobile-app/node_modules/' + row.name + '/package.json')));
    assert.equal(installed.name,row.name); assert.equal(installed.version,row.version);
  }
  for (const row of pins.rawFiles) assert.equal(sha(regular(pathFor(row.path))),row.sha256,'NATIVE_VALUE_DEV_NOBLE_RAW_PIN');
  const require = createRequire(join(MOBILE_APP, 'src/custody/signing.mjs'));
  assert.equal(realpathSync(require.resolve('@noble/curves/secp256k1.js')),
    join(MOBILE_APP,'node_modules/@noble/curves/secp256k1.js'), 'NATIVE_VALUE_DEV_NOBLE_FIXED_ENTRY');
  for (const [specifier,file] of [['@lianum/mobile-protocol','authorization.mjs'],
    ['@lianum/mobile-protocol/original-account-v2','original-account-review-v2.mjs']]) {
    assert.equal(realpathSync(require.resolve(specifier)),join(MOBILE_PROTOCOL_PACKAGE,'src',file),
      'NATIVE_VALUE_DEV_PROTOCOL_FIXED_ENTRY');
    assert.equal(sha(regular(join(MOBILE_PROTOCOL_PACKAGE,'src',file))),sha(regular(join(MOBILE,'src',file))),
      'NATIVE_VALUE_DEV_PROTOCOL_RUNTIME_JOIN');
  }
  return true;
}
