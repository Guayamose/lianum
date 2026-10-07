/** Isolated candidate validation only. No production selector or artifact writer. */
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ROOT, FLAT, GOLDEN, LOCAL, CATALOG, LIMITS, SETTINGS, NOIR_VERSION } from '../../proof-workers/catalog.mjs';
import { regular, verifyAPI, verifyVendor, sourceManifest, resourceModuleURL } from '../../proof-workers/tooling.mjs';
export { ROOT, LOCAL, CATALOG, LIMITS, SETTINGS, NOIR_VERSION };
export const DIR = fileURLToPath(new URL('./', import.meta.url));
export const CANDIDATE = resolve(DIR, '../native-ingress-v3');
export const CIRCUIT = join(CANDIDATE, 'circuits/native-claim-ingress-v3');
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const parse = path => JSON.parse(regular(path));
export function assertOutput(path) {
  assert.ok(resolve(path).startsWith(join(DIR, '.local') + sep), 'V3_OUTPUT_LOCATION');
  assert.equal(realpathSync(dirname(path)), dirname(path), 'V3_OUTPUT_PARENT_SYMLINK');
}
export function writeNew(path, value) {
  assertOutput(path); writeFileSync(path, typeof value === 'string' ? value : json(value), { flag: 'wx', mode: 0o600 });
}
export function replace(path, value) {
  assertOutput(path);
  if (existsSync(path)) regular(path);
  const temp = path + '.tmp';
  writeFileSync(temp, json(value), { flag: 'wx', mode: 0o600 }); renameSync(temp, path);
}
function fileRecord(path) {
  const bytes = regular(path); return { path: relative(ROOT, path).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) };
}
function assertRecord(path, record) {
  const bytes = regular(path);
  assert.equal(bytes.length, record.bytes, 'V3_BYTES_CHANGED:' + record.path);
  assert.equal(hash(bytes), record.sha256, 'V3_HASH_CHANGED:' + record.path);
}
export async function fingerprint() {
  const source = parse(join(CANDIDATE, 'source-manifest.json'));
  assert.equal(hash(regular(join(CANDIDATE, 'source-manifest.json'))),
    'b0c8317888e6a4afff98a90b57be4f8fa839ffaf7c4d9726aa3017828553eb68', 'V3_FROZEN_SOURCE_MANIFEST');
  assert.equal(hash(JSON.stringify(source.files)), source.sourceClosureSHA256, 'V3_SOURCE_CLOSURE_HASH');
  const roots = { wallet: ROOT, flat: FLAT, golden: GOLDEN };
  for (const file of source.files) assertRecord(resolve(roots[file.root], file.path), file);
  const baseline = parse(join(CANDIDATE, 'baseline-manifest.json'));
  for (const [name, files] of Object.entries(baseline.relations))
    assert.deepEqual(sourceManifest(CATALOG[name]), files, 'V3_BASELINE_CLOSURE_CHANGED:' + name);
  for (const file of baseline.files) assertRecord(resolve(ROOT, file.path), file);
  const verification = parse(join(CANDIDATE, 'verification.json'));
  for (const file of verification.files) assertRecord(resolve(CANDIDATE, file.path), file);
  assert.equal(parse(join(CANDIDATE, 'profile.json')).activation, false, 'V3_ACTIVATION_CHANGED');
  const files = new Map();
  function visit(path) {
    path = resolve(path);
    assert.ok([ROOT, FLAT, GOLDEN].some(root => path.startsWith(root + sep)), 'V3_RUNTIME_LOCATION');
    if (files.has(path)) return;
    const bytes = regular(path); files.set(path, fileRecord(path));
    for (const match of bytes.toString('utf8').matchAll(/(?:\bfrom\s+|^\s*import\s+)(['"])([^'"]+)\1/gm)) {
      const dependency = match[2]; if (dependency.startsWith('node:')) continue;
      assert.ok(dependency.startsWith('.'), 'V3_LOCAL_RUNTIME_IMPORT');
      visit(resolve(dirname(path), dependency));
    }
  }
  for (const file of ['common.mjs', 'run.mjs', 'worker.mjs']) visit(join(DIR, file));
  visit(join(CANDIDATE, 'fixtures/synthetic-ingress-v3.mjs'));
  visit(fileURLToPath(resourceModuleURL));
  const helpers = await import(resourceModuleURL);
  return { format: 'LIANUM_V3_VALIDATION_PINS_V1', source,
    candidateVerificationSHA256: hash(regular(join(CANDIDATE, 'verification.json'))),
    baselineManifestSHA256: hash(regular(join(CANDIDATE, 'baseline-manifest.json'))),
    runtime: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    api: verifyAPI(), vendor: verifyVendor(), toolchain: helpers.verifyToolchain(),
    noirVersion: NOIR_VERSION, bbVersion: '5.2.0', settings: SETTINGS, limits: LIMITS };
}
export function verifyPinnedCO42() {
  const version = '7ddd3be0eaddf7bc08840d6fa0660ee6e6596108e35c9c1ac83ca4f76f468ea5';
  const artifact = '61d900c0-e5a2-4757-a274-c59fd0d0c645';
  const dir = join(LOCAL, 'relations/native_claim_discharge', version, 'compiled', artifact);
  const bytes = regular(join(dir, 'program.json'));
  assert.equal(hash(bytes), '5ec7d600e2f1a76d72720f2b3a35b44c4e777e7dee30f46d0be2b98a3eca39e3', 'V3_BASELINE_CO42_PROGRAM');
  const program = JSON.parse(bytes), manifest = parse(join(dir, 'manifest.json'));
  assert.equal(hash(bytes), manifest.programSHA256, 'V3_BASELINE_CO42_MANIFEST');
  assert.equal(manifest.sourceVersion, version, 'V3_BASELINE_CO42_SOURCE_VERSION');
  return { program, programSHA256: hash(bytes), manifestSHA256: hash(regular(join(dir, 'manifest.json'))), sourceVersion: version };
}
