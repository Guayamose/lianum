import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const project = resolve(root, '../..');
const hash = (bytes, alg = 'sha256', enc = 'hex') => createHash(alg).update(bytes).digest(enc);
const lockBytes = readFileSync(join(root, 'package-lock.json'));
const lock = JSON.parse(lockBytes);
const packages = [];
for (const [path, record] of Object.entries(lock.packages)) {
  if (!path) continue;
  assert.ok(record.resolved.startsWith('https://registry.npmjs.org/'));
  assert.match(record.integrity, /^sha512-[A-Za-z0-9+/]+=*$/);
  const installed = existsSync(join(root, path, 'package.json'));
  if (!installed) { assert.equal(record.optional, true); packages.push({ path, version: record.version, integrity: record.integrity, installed: false, reason: 'optional omitted' }); continue; }
  const bytes = readFileSync(join(root, path, 'package.json'));
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.version, record.version);
  const lifecycle = Object.fromEntries(Object.entries(manifest.scripts ?? {}).filter(([name]) => ['preinstall', 'install', 'postinstall', 'prepare'].includes(name)));
  if (Object.keys(lifecycle).length) {
    // Published msgpackr ships built JS. Its inspected prepare/build chain is
    // unnecessary here and remains disabled; no Rollup/build tool is installed.
    assert.equal(manifest.name, 'msgpackr');
    assert.deepEqual(lifecycle, { prepare: 'npm run build' });
    assert.equal(manifest.scripts.build, 'rollup -c && cpy index.d.ts . --rename=index.d.cts && cpy pack.d.ts . --rename=pack.d.cts && cpy unpack.d.ts . --rename=unpack.d.cts');
  }
  const digest = Buffer.from(record.integrity.slice(7), 'base64').toString('hex');
  const cachedTarball = join(root, '.local/npm-cache/_cacache/content-v2/sha512', digest.slice(0, 2), digest.slice(2, 4), digest.slice(4));
  const tarball = readFileSync(cachedTarball);
  assert.equal('sha512-' + hash(tarball, 'sha512', 'base64'), record.integrity);
  packages.push({ path, name: manifest.name, version: record.version, resolved: record.resolved, integrity: record.integrity, installed: true, lifecycle, lifecycleExecution: 'disabled; published artifacts used', packageJSONSHA256: hash(bytes), tarballSHA256: hash(tarball), tarballBytes: tarball.length });
}
const wasm = [];
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.wasm(?:\.gz)?$/.test(entry.name)) { const b = readFileSync(path); wasm.push({ path: relative(root, path).replaceAll('\\', '/'), bytes: b.length, sha256: hash(b) }); }
  }
}
scan(join(root, 'node_modules/@aztec/bb.js'));
scan(join(root, 'node_modules/@noir-lang'));
const result = { classification: 'OFFICIAL_NPM_INSTALL_PROVENANCE_NOT_PROOF', node: process.version, platform: process.platform, arch: process.arch, packageLockSHA256: hash(lockBytes), ignoreScripts: true, optionalPackagesOmitted: true, userAndGlobalNpmConfig: 'empty project-local files', registry: 'https://registry.npmjs.org/', packages, wasm };
writeFileSync(join(project, 'evidence/m7-package-provenance.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ installed: packages.filter(p => p.installed).length, locked: packages.length, wasmFiles: wasm.length, packageLockSHA256: result.packageLockSHA256, lifecycleScriptsExecuted: 0 }));
