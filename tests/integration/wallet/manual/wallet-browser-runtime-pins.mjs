/** Fixed browser distribution pins. Playwright bytes were compared with
 * the exact npm tarball SRI; Chrome is the installed reviewed local package. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { closeSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const WALLET_BROWSER_VERSION = '144.0.7559.132';
const PLAYWRIGHT_VERSION = '1.64.0';
const PLAYWRIGHT_SRI = 'sha512-T9r+MZkTECl2+oUcZ26YgZzTrYidTsIhYYkJix+6iDOymOb1FB2RLLSOxRGnZGv5DStt+aduIVbt+E8WygXYpg==';
const PACKAGE_TREE = '19e9df8d71b7acb3dda74ef93d33c470ecde8d2de13f43da342ec691188578f5';
const CHROME_TREE = '0955a0800c1b617417d4e71d01bc2e9e07d999dcb044961dce2556ac4d56f894';
const CHROME_ROOT = '/opt/google/chrome';

function distribution(root, count, bytes, tree) {
  assert.equal(realpathSync(root), root, 'BROWSER_DISTRIBUTION_SYMLINK');
  const files = new Map();
  function visit(relative = '') {
    const path = join(root, relative), before = lstatSync(path);
    assert.equal(before.isSymbolicLink(), false, 'BROWSER_DISTRIBUTION_SYMLINK');
    if (before.isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        assert.match(name, /^[A-Za-z0-9_.-]+$/, 'BROWSER_FIXED_DISTRIBUTION_PATH');
        visit(relative ? relative + '/' + name : name);
      }
      return;
    }
    assert.equal(before.isFile(), true, 'BROWSER_DISTRIBUTION_REGULAR_FILE');
    assert.ok(before.size > 0 && before.size < 512 * 1024 ** 2);
    const fd = openSync(path, 'r'), buffer = Buffer.allocUnsafe(1024 ** 2), digest = createHash('sha256');
    try { let read; while ((read = readSync(fd, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0, read)); }
    finally { closeSync(fd); }
    const after = lstatSync(path);
    for (const key of ['dev','ino','size','mtimeMs','ctimeMs']) assert.equal(after[key], before[key], 'BROWSER_DISTRIBUTION_CHANGED_WHILE_READING');
    files.set(relative, { bytes: before.size, sha256: digest.digest('hex') });
  }
  visit();
  const records = Object.fromEntries([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const total = [...files.values()].reduce((sum, row) => sum + row.bytes, 0);
  assert.equal(files.size, count, 'BROWSER_DISTRIBUTION_FILE_COUNT');
  assert.equal(total, bytes, 'BROWSER_DISTRIBUTION_BYTE_COUNT');
  assert.equal(createHash('sha256').update(JSON.stringify(records)).digest('hex'), tree, 'BROWSER_REVIEWED_DISTRIBUTION_HASH');
  return { fileCount: count, bytes, treeSHA256: tree, files: records };
}

export function walletBrowserRuntimePins() {
  assert.equal(arguments.length, 0, 'BROWSER_RUNTIME_PINS_NO_OPTIONS');
  const require = createRequire(import.meta.url);
  const path = realpathSync(require.resolve('playwright-core/package.json'));
  const pkg = require(path);
  assert.equal(pkg.name, 'playwright-core'); assert.equal(pkg.version, PLAYWRIGHT_VERSION);
  return { format: 'FIXED_WALLET_BROWSER_RUNTIME_PINS_V1',
    playwright: { version: PLAYWRIGHT_VERSION, npmTarballIntegrity: PLAYWRIGHT_SRI,
      ...distribution(dirname(path), 115, 13655528, PACKAGE_TREE) },
    chrome: { version: WALLET_BROWSER_VERSION, binary: CHROME_ROOT + '/chrome',
      ...distribution(CHROME_ROOT, 258, 395614967, CHROME_TREE) } };
}
