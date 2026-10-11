/** Internal artifact and source validation. No backend is created on import. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  renameSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { types } from 'node:util';
import { ENVIRONMENT_MODULE_URL, projectRoot } from '@lianum/environment';
import { WALLET_RESOURCES_MODULE_URL } from '@lianum/components/resources/wallet-resources';
import { PRIVATE_VERIFIER_CRS_MODULE_URL } from '@lianum/components/resources/private-verifier-crs';
import { ROOT, FLAT, CANDIDATE, GOLDEN, EXPERIMENT, LOCAL, PROFILE, LIMITS, SETTINGS,
  NOIR_VERSION, MODES, CATALOG, NODE_PINS, TRUSTED_JOB_SOURCES, TRUSTED_PARENTS, relation, operation, pagesFor } from '../catalog.mjs';
import { decodeStatement } from '@lianum/components/encoding/statements';
export { hash, jsonBytes };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => JSON.stringify(value, null, 2) + '\n';
export const resourceModuleURL = new URL('../../../components/src/resources/wallet-resources.mjs', import.meta.url);
export const verifierCRSModuleURL = new URL('../../../components/src/resources/private-verifier-crs.mjs', import.meta.url);
assert.equal(WALLET_RESOURCES_MODULE_URL, resourceModuleURL.href, 'RESOURCE_MODULE_IDENTITY');
assert.equal(PRIVATE_VERIFIER_CRS_MODULE_URL, verifierCRSModuleURL.href, 'VERIFIER_CRS_MODULE_IDENTITY');
assert.equal(ENVIRONMENT_MODULE_URL, new URL('../../../environment/src/paths.mjs', import.meta.url).href, 'RESOURCE_ENVIRONMENT_IDENTITY');
// Current process entries are source modules; ROOT remains public artifacts/job state.
const boundedEntry = fileURLToPath(new URL('../jobs/run-bounded.mjs', import.meta.url));
const workerEntry = fileURLToPath(new URL('../jobs/worker.mjs', import.meta.url));
const roleEntry = fileURLToPath(new URL('../jobs/role-process.mjs', import.meta.url));
const currentJobSources = Object.freeze({
  'proof-workers/trusted-jobs.mjs': fileURLToPath(new URL('../jobs/trusted-jobs.mjs', import.meta.url)),
  'wallet-platform/modules/paeg/statements.mjs': fileURLToPath(new URL('../../../components/src/encoding/statements.mjs', import.meta.url)),
  'proof-workers/role-process.mjs': roleEntry,
});
const currentFixedSources = Object.freeze([
  fileURLToPath(new URL('../catalog.mjs', import.meta.url)), fileURLToPath(import.meta.url), workerEntry, boundedEntry,
  currentJobSources['wallet-platform/modules/paeg/statements.mjs'],
  fileURLToPath(resourceModuleURL), fileURLToPath(verifierCRSModuleURL),
  fileURLToPath(new URL('../../../components/src/resources/private-resource-policy.mjs', import.meta.url)),
]);
const currentScopeSources = Object.freeze([
  fileURLToPath(new URL('../jobs/native-flow-proof-scope-v1.mjs', import.meta.url)),
  fileURLToPath(new URL('../host/process-files.mjs', import.meta.url)),
  fileURLToPath(new URL('../jobs/begin-payout-audit-policy-v1.mjs', import.meta.url)),
  fileURLToPath(new URL('../../../components/src/encoding/commitments.mjs', import.meta.url)),
]);
const currentObservedSources = new Set([...currentFixedSources,...currentScopeSources,...Object.values(currentJobSources)]);
const requirePinned = createRequire(join(EXPERIMENT, 'package.json'));
const VENDOR = join(CANDIDATE, 'vendor/poseidon');
const VENDOR_COMMIT = 'e105cdd5c79c222860d53c5dfdb8fa8012b291c0';
const VENDOR_PROVENANCE_SHA256 = 'bba70f26507d4c6a2c3b88779fa55763353d9778cd1235acfd6afddd1edcc7a4';

const entrypoints = Object.freeze({
  '@aztec/bb.js': 'node_modules/@aztec/bb.js/dest/node-cjs/index.js',
  '@noir-lang/noir_js': 'node_modules/@noir-lang/noir_js/lib/index.cjs',
  '@noir-lang/noir_wasm': 'node_modules/@noir-lang/noir_wasm/dist/node/main.js',
});
export const loadPinned = name => {
  assert.ok(Object.hasOwn(entrypoints, name), 'PW_EXACT_PACKAGE_REQUIRED');
  verifyAPI();
  const path = requirePinned.resolve(name);
  assert.equal(realpathSync(path), join(EXPERIMENT, entrypoints[name]), 'PW_EXACT_API_ENTRYPOINT');
  return import(pathToFileURL(path));
};

// Exact installed official source/API bytes, captured by read-only hashing.
// createRequire.resolve chooses CJS for bb.js and noir_js; pin the runtime
// actually imported, not merely the package's parallel ESM distribution.
const API_PINS = [
  ['@aztec/bb.js/src/barretenberg/index.ts', '2c46d64be23c8c9926ce11dab144604b97d3fa46806f6529df8b1dca95a0c24c'],
  ['@aztec/bb.js/src/barretenberg/backend.ts', 'f24c6fd2a367e1dc6374d2663b73eebc33554eb8a15a0c846307affc7129f5d1'],
  ['@aztec/bb.js/src/bb_backends/node/index.ts', '014475cc8343518f2a999383291e7f44ec21d89fde46d8ea8989a2f5e491d6c3'],
  ['@aztec/bb.js/src/bb_backends/wasm.ts', '624b6975add94244221bad21cec08594bcbb4bd5d390ccdb411857d4e7e64d85'],
  ['@aztec/bb.js/dest/node-cjs/index.js', '10e54908426f203209e59971d46d07ca818c676af3524a0ce145903d7b48207b'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg/index.js', '1c5b1d1bebdc9894d2dacc0c69acf7273a491c6a2fb0fd0867b26e55106183fb'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg/backend.js', '44fcacc11a6251e36b409bee292af3eeb90098e1a537c55de625b636e1d78d00'],
  ['@aztec/bb.js/dest/node-cjs/bb_backends/node/index.js', 'b1caddec7153b257ce5af10a5554cd320f936171abd329e82b08d11c57ed5a48'],
  ['@aztec/bb.js/dest/node-cjs/bb_backends/wasm.js', '2920cfbf1125ba3c6018ffe4c8ac36a25ea6c1483fe54c1f0c20d177a5caf458'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/index.js', '623794e57a63739bb9be964b6b73171d5da585d924dcb5014051345a0fb2120b'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/barretenberg_wasm_main/index.js', '2cdafb1b5e1d03bfe68058199b9276ebdb6c0d6eb911f21b6466ca4e24445aeb'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/barretenberg_wasm_base/index.js', 'ce7f26958319577f8242e019bc7f66aad570afc012075df958c8ab668a8bee72'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/fetch_code/node/index.js', '9e72c7c2ec81ee8a2778c7ba6b3e5ce5659ec02d73b9409bf05f894fa9eb7697'],
  ['@aztec/bb.js/dest/node-cjs/cbind/generated/async.js', 'de556a92d1fe5bc2c3c819f02827cccca997a4bdb9eeb7a0c7828276405cab2c'],
  ['@aztec/bb.js/dest/node-cjs/cbind/generated/api_types.js', '948bd85d071d74e264c83b52b55644d0ca65aa252175e930a92ee2d784d6c17d'],
  ['@aztec/bb.js/dest/node-cjs/cbind/generated/curve_constants.js', '37d1026c0605a0cbfe95ddfa234e54ee0afc7dc16bb9305dc7f68c8d60b43a08'],
  ['@noir-lang/noir_js/lib/index.cjs', '07e18989229ca6721f69c1816306d029792762438baed13b213a9bd4ab274dca'],
  ['@noir-lang/noir_js/lib/program.cjs', 'a5acfbab2a37d07995ab6e4ccdea5d567d4f27774e5299f860f4baca10e60ec8'],
  ['@noir-lang/noir_js/lib/witness_generation.cjs', '02d055e2651f9df50f5a9196c729360968f7f8240f5ca66f30ce63dda0981346'],
  ['@noir-lang/noir_wasm/dist/node/main.js', '958b65cce651de985a3bbe7fd89cd7ddf30c4fda47903e53194543b9c224cbe1'],
];
export function verifyAPI() {
  return API_PINS.map(([path, expected]) => {
    const absolute = join(EXPERIMENT, 'node_modules', path), bytes = regular(absolute);
    assert.equal(hash(bytes), expected, 'PW_OFFICIAL_API_SOURCE_PIN');
    return { path, bytes: bytes.length, sha256: expected };
  });
}


export function regular(path) {
  assert.equal(realpathSync(path), resolve(path), 'PW_FILE_SYMLINK');
  assert.ok(lstatSync(path).isFile(), 'PW_REGULAR_FILE');
  return readFileSync(path);
}
export function ensureDirectory(path) {
  const absolute = resolve(path);
  assert.ok(absolute === LOCAL || absolute.startsWith(LOCAL + sep)
    || absolute === join(ROOT, '.local') || absolute === join(ROOT, 'evidence')
    || absolute.startsWith(join(ROOT, 'evidence') + sep), 'PW_OUTPUT_LOCATION');
  const missing = []; let ancestor = absolute;
  while (!existsSync(ancestor)) { missing.push(ancestor); ancestor = dirname(ancestor); }
  assert.equal(realpathSync(ancestor), ancestor, 'PW_OUTPUT_ANCESTOR_SYMLINK');
  assert.ok(lstatSync(ancestor).isDirectory(), 'PW_OUTPUT_ANCESTOR_DIRECTORY');
  for (const directory of missing.reverse()) mkdirSync(directory, { mode: 0o700 });
  assert.equal(realpathSync(absolute), absolute, 'PW_OUTPUT_SYMLINK');
  assert.ok(lstatSync(absolute).isDirectory(), 'PW_OUTPUT_DIRECTORY');
  return absolute;
}
export function writeNew(path, value) {
  ensureDirectory(dirname(path));
  writeFileSync(path, value, { flag: 'wx', mode: 0o600 });
}
export function writeJSON(path, value) { writeNew(path, jsonBytes(value)); }
export function replaceJSON(path, value) {
  ensureDirectory(dirname(path));
  if (existsSync(path)) regular(path);
  const temporary = path + '.tmp-' + randomUUID();
  writeNew(temporary, jsonBytes(value));
  renameSync(temporary, path);
}

export function resources(pid) {
  const memory = /MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'));
  assert.ok(memory, 'PW_MEMINFO_AVAILABLE');
  const disk = statfsSync(ROOT);
  let workerRSS = 0;
  if (pid) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      const match = /VmRSS:\s+(\d+)/.exec(status);
      if (match) workerRSS = Number(match[1]) * 1024;
      else assert.match(status, /^State:\s+[ZX]/m, 'PW_WORKER_RSS_UNAVAILABLE');
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
    }
  }
  const sample = { at: new Date().toISOString(), availableRAM: Number(memory[1]) * 1024,
    freeDisk: disk.bavail * disk.bsize, workerRSS };
  for (const name of ['availableRAM', 'freeDisk', 'workerRSS'])
    assert.ok(Number.isSafeInteger(sample[name]) && sample[name] >= 0, 'PW_RESOURCE_MEASUREMENT');
  return sample;
}
export function resourceFailure(sample) {
  if (sample.availableRAM < LIMITS.availableRAM) return 'AVAILABLE_RAM_FLOOR';
  if (sample.freeDisk < LIMITS.freeDisk) return 'DISK_FLOOR';
  if (sample.workerRSS > LIMITS.workerRSS) return 'WORKER_RSS_LIMIT';
  return null;
}


export function verifyVendor() {
  const provenancePath = join(VENDOR, 'UPSTREAM-PROVENANCE.json');
  const bytes = regular(provenancePath);
  assert.equal(hash(bytes), VENDOR_PROVENANCE_SHA256, 'PW_OFFICIAL_VENDOR_PROVENANCE_PIN');
  const provenance = JSON.parse(bytes);
  assert.equal(provenance.repository, 'https://github.com/noir-lang/poseidon', 'PW_OFFICIAL_VENDOR_REPOSITORY');
  assert.equal(provenance.commit, VENDOR_COMMIT, 'PW_OFFICIAL_VENDOR_COMMIT');
  assert.equal(provenance.license, 'Apache-2.0', 'PW_OFFICIAL_VENDOR_LICENSE');
  assert.ok(Array.isArray(provenance.files) && provenance.files.length === 11, 'PW_OFFICIAL_VENDOR_FILE_COUNT');
  const paths = [];
  function walk(directory) {
    assert.equal(realpathSync(directory), directory, 'PW_VENDOR_SYMLINK');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'PW_VENDOR_SYMLINK');
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else { assert.ok(entry.isFile(), 'PW_VENDOR_REGULAR_FILE'); paths.push(relative(VENDOR, path).split(sep).join('/')); }
    }
  }
  walk(VENDOR);
  assert.deepEqual(paths.sort(), [...provenance.files.map(file => file.path), 'UPSTREAM-PROVENANCE.json'].sort(),
    'PW_EXACT_OFFICIAL_VENDOR_FILES');
  for (const file of provenance.files) {
    assert.ok(typeof file.path === 'string' && /^(?:LICENSE|Nargo\.toml|src\/[a-zA-Z0-9_./-]+\.nr)$/.exec(file.path)?.[0] === file.path
      && !file.path.split('/').includes('..'), 'PW_VENDOR_FILE_PATH');
    const actual = regular(join(VENDOR, file.path));
    assert.equal(actual.length, file.bytes, 'PW_VENDOR_FILE_BYTES');
    assert.equal(hash(actual), file.sha256, 'PW_VENDOR_FILE_PIN');
  }
  return { repository: provenance.repository, commit: VENDOR_COMMIT,
    provenanceSHA256: VENDOR_PROVENANCE_SHA256, files: provenance.files };
}

export function errorCode(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return /^(?:PW_|PROOF_JOB_)[A-Z0-9_]+/.exec(message)?.[0] ?? 'PW_OPERATION_FAILED';
}
export function assertID(value) {
  assert.ok(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(value)?.[0] === value,
    'PW_GENERATED_UUID_REQUIRED');
  return value;
}
export function assertHash(value) {
  assert.ok(typeof value === 'string' && /^[0-9a-f]{64}$/.exec(value)?.[0] === value, 'PW_HASH_ENCODING');
  return value;
}
export const attemptPath = id => join(LOCAL, 'attempts', assertID(id));
export function argumentsFor(worker = false) {
  assert.equal(process.execArgv.length, 0, 'PW_NO_EXECUTABLE_OPTIONS');
  assert.ok(!process.env.NODE_OPTIONS, 'PW_NO_NODE_OPTIONS');
  assert.equal(process.argv.length, worker ? 5 : 4, 'PW_FIXED_ARGUMENTS');
  const spec = relation(process.argv[2]), mode = process.argv[3]; operation(mode);
  const runId = worker ? assertID(process.argv[4]) : randomUUID();
  return { spec, mode, runId };
}
export function authenticateSupervisor(spec, mode, runId) {
  assert.ok(!process.env.NODE_PATH, 'PW_CLEAN_WORKER_ENVIRONMENT');
  const allowedEnvironment = ['LANG', 'PATH'];
  // Node may expose its own fixed IPC bootstrap variables on some builds.
  // These are created by spawn, never copied from the calling environment.
  if (operation(mode) === 'prove') {
    for (const [name, value] of [['NODE_CHANNEL_FD', '3'], ['NODE_CHANNEL_SERIALIZATION_MODE', 'json']]) {
      if (Object.hasOwn(process.env, name)) {
        assert.equal(process.env[name], value, 'PW_EXACT_IPC_BOOTSTRAP'); allowedEnvironment.push(name);
      }
    }
  }
  assert.deepEqual(Object.keys(process.env).sort(), allowedEnvironment.sort(), 'PW_EXACT_WORKER_ENVIRONMENT');
  assert.equal(process.env.PATH, '/usr/bin:/bin', 'PW_EXACT_WORKER_PATH');
  assert.equal(process.env.LANG, 'C.UTF-8', 'PW_EXACT_WORKER_LANG');
  const executable = realpathSync(`/proc/${process.ppid}/exe`);
  assert.equal(executable, realpathSync(process.execPath), 'PW_ACTUAL_PARENT_EXECUTABLE');
  const args = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  const script = resolve(realpathSync(`/proc/${process.ppid}/cwd`), args[1]);
  if (operation(mode) === 'prove') {
    const configured = trustedParent(spec);
    assert.equal(script, configured.script, 'PW_EXACT_ROLE_PARENT_SCRIPT');
    assert.deepEqual(args.slice(1), [args[1], ...configured.arguments], 'PW_EXACT_ROLE_PARENT_ARGUMENTS');
    assert.equal(typeof process.send, 'function', 'PW_PRIVATE_IPC_REQUIRED');
  } else {
    assert.equal(args.length, 4, 'PW_EXACT_PARENT_ARGUMENTS');
    assert.equal(script, boundedEntry, 'PW_EXACT_PARENT_SCRIPT');
    assert.deepEqual(args.slice(2), [spec.name, mode], 'PW_EXACT_PARENT_RELATION_MODE');
  }
  assert.equal(realpathSync(script), script, 'PW_PARENT_SCRIPT_SYMLINK');
  assert.equal(process.argv[1], workerEntry, 'PW_EXACT_WORKER_SCRIPT');
  const lock = JSON.parse(regular(join(LOCAL, 'active.lock')));
  assert.equal(lock.pid, process.ppid, 'PW_PARENT_LOCK_PID');
  assert.equal(lock.runId, runId, 'PW_PARENT_LOCK_RUN');
  assert.equal(lock.relation, spec.name, 'PW_PARENT_LOCK_RELATION');
  assert.equal(lock.mode, mode, 'PW_PARENT_LOCK_MODE');
  return { pid: process.ppid, executable, arguments: args.slice(1), runId };
}
export function trustedParent(spec) {
  const configured = TRUSTED_PARENTS[spec.name];
  assert.ok(configured && typeof configured.script === 'string' && Array.isArray(configured.arguments), 'PW_TRUSTED_PARENT_NOT_CONFIGURED');
  assert.equal(configured.script, 'proof-workers/role-process.mjs', 'PW_PARENT_SOURCE_MUST_BE_PINNED');
  assert.ok(TRUSTED_JOB_SOURCES[spec.name].includes(configured.script), 'PW_PARENT_SOURCE_MUST_BE_PINNED');
  const script = roleEntry;
  regular(script);
  assert.ok(configured.arguments.every(value => typeof value === 'string'), 'PW_FIXED_PARENT_ARGUMENTS');
  return { script, arguments: configured.arguments };
}
function record(path) {
  const bytes = regular(path);
  if (currentObservedSources.has(path)) return {root:'active-source',path:relative(projectRoot,path).split(sep).join('/'),bytes:bytes.length,sha256:hash(bytes)};
  const base = path.startsWith(ROOT + sep) ? ROOT : path.startsWith(FLAT + sep) ? FLAT : GOLDEN;
  assert.ok(path.startsWith(base + sep), 'PW_SOURCE_LOCATION');
  return { root: base === ROOT ? 'wallet' : base === FLAT ? 'flat' : 'golden',
    path: relative(base, path).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) };
}
const packages = new Set([
  ...Object.values(CATALOG).map(item => item.circuit),
  ...['envelope-lib', 'readiness-lib', 'admission-lib', 'native-claim-lib']
    .map(name => join(ROOT, 'proof-relations', name)),
  join(CANDIDATE, 'lib'), VENDOR, join(FLAT, 'lib'),
  ...['generic-graph', 'generic-native', 'generic-wrappers', 'generic-funding'].map(name => join(EXPERIMENT, name, 'lib')),
]);
export function sourceManifest(spec) {
  verifyVendor();
  const files = new Set(), visiting = new Set(), done = new Set();
  function visit(directory) {
    assert.ok(packages.has(directory), 'PW_EXACT_LOCAL_NARGO_DEPENDENCY');
    assert.equal(realpathSync(directory), directory, 'PW_PACKAGE_SYMLINK');
    assert.ok(!visiting.has(directory), 'PW_DEPENDENCY_CYCLE');
    if (done.has(directory)) return;
    visiting.add(directory);
    const config = join(directory, 'Nargo.toml'), text = regular(config).toString('utf8');
    files.add(config);
    function walk(path) {
      assert.equal(realpathSync(path), path, 'PW_SOURCE_SYMLINK');
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        assert.ok(!entry.isSymbolicLink(), 'PW_SOURCE_SYMLINK');
        const child = join(path, entry.name);
        if (entry.isDirectory()) walk(child);
        else { assert.ok(entry.isFile(), 'PW_SOURCE_SPECIAL_FILE');
          if (entry.name.endsWith('.nr')) { regular(child); files.add(child); } }
      }
    }
    walk(join(directory, 'src'));
    let dependencies = false;
    for (const original of text.split(/\r?\n/)) {
      const line = original.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('[')) {
        assert.ok(['[package]', '[dependencies]'].includes(line), 'PW_NARGO_SECTION');
        dependencies = line === '[dependencies]'; continue;
      }
      if (!dependencies) continue;
      const parsed = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*\{\s*path\s*=\s*"([^"]+)"\s*\}$/.exec(line);
      assert.ok(parsed && !/^(?:[a-z]+:|\/)/i.test(parsed[2]), 'PW_LOCAL_RELATIVE_DEPENDENCY');
      visit(resolve(directory, parsed[2]));
    }
    visiting.delete(directory); done.add(directory);
  }
  visit(spec.circuit);
  assert.ok(done.has(VENDOR) || spec.name === 'deposit_intent', 'PW_VENDOR_IN_CLOSURE');
  // D27 deliberately retains the original SHA note/signature primitives and
  // introduces no unused Poseidon dependency merely to satisfy this collector.
  if (done.has(VENDOR)) {
    files.add(join(VENDOR, 'LICENSE')); files.add(join(VENDOR, 'UPSTREAM-PROVENANCE.json'));
  }
  return [...files].sort().map(record);
}
// Pin the active implementations here, outside the resources being verified.
// All locations are fixed literals; resource modules supply neither paths nor
// hashes. Keep historical records and reject manifests with a different closure.
const activeResourceSources = Object.freeze([
  ['active-components', 'file-integrity.mjs', new URL('../../../components/src/file-integrity.mjs', import.meta.url).href],
  ['active-components', 'resources/private-resource-policy.mjs', new URL('../../../components/src/resources/private-resource-policy.mjs', import.meta.url).href],
  ['active-components', 'resources/private-verifier-crs.mjs', new URL('../../../components/src/resources/private-verifier-crs.mjs', import.meta.url).href],
  ['active-components', 'resources/wallet-resources.mjs', new URL('../../../components/src/resources/wallet-resources.mjs', import.meta.url).href],
  ['active-environment', 'paths.mjs', new URL('../../../environment/src/paths.mjs', import.meta.url).href],
].map(entry => Object.freeze(entry)));

export function activeResourceSourceRecords() {
  return activeResourceSources.map(([root, path, url]) => {
    const absolute = fileURLToPath(url);
    const bytes = regular(absolute);
    return {root, path, bytes: bytes.length, sha256: hash(bytes)};
  });
}

export function executionSources(spec, mode) {
  const fixed = [...currentFixedSources, join(CANDIDATE, 'src/component-tooling.mjs')];
  if (operation(mode) === 'prove') {
    // The adapter grammar remains closed. Map its three historical labels to
    // their executing owners; no arbitrary package import is admitted.
    fixed.push(...currentScopeSources);
    const jobPaths = TRUSTED_JOB_SOURCES[spec.name];
    assert.deepEqual(jobPaths, Object.keys(currentJobSources), 'PW_TRUSTED_JOB_SOURCES_NOT_CONFIGURED');
    const allowed = new Set([...fixed, ...Object.values(currentJobSources)]);
    for (const path of jobPaths.map(path => currentJobSources[path])) {
      const text = regular(path).toString('utf8');
      // Deliberately narrow module grammar. No computed import/require, process
      // spawning, networking or direct package resolution in a trusted adapter.
      assert.ok(!/\b(?:require|createRequire|eval|Function)\s*\(/.test(text), 'PW_JOB_DYNAMIC_CODE');
      const imports = [...text.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)(['"])([^'"]+)\1/g)];
      assert.equal((text.match(/\bimport\s*\(/g) ?? []).length,
        imports.filter(match => /import\s*\(/.test(match[0])).length, 'PW_JOB_COMPUTED_IMPORT');
      for (const [, , name] of imports) {
        if (['node:assert/strict', 'node:crypto', 'node:buffer', 'node:util'].includes(name)) continue;
        const target = name === '@lianum/components/encoding/statements'
          ? currentJobSources['wallet-platform/modules/paeg/statements.mjs']
          : name.startsWith('.') ? resolve(dirname(path), name) : null;
        assert.ok(allowed.has(target), 'PW_JOB_IMPORT_CLOSURE');
      }
      fixed.push(path);
    }
  }
  return [...new Set(fixed)].sort().map(record).concat(activeResourceSourceRecords());
}
export function assertABI(spec, program) {
  assert.equal(program.noir_version, NOIR_VERSION, 'PW_NOIR_VERSION');
  const abi = program.abi;
  assert.ok(abi && Array.isArray(abi.parameters) && abi.return_type == null, 'PW_VOID_ABI');
  assert.deepEqual(abi.parameters.filter(item => item.visibility === 'public'), spec.publicABI, 'PW_EXACT_PUBLIC_ABI');
  assert.deepEqual(abi.parameters.map(item => item.name), [...spec.publicABI.map(item => item.name), ...spec.privateNames], 'PW_EXACT_PARAMETER_ORDER');
  const forbidden = /(?:proof|verification.?key|^vk$|root.?signing|master.?key|private.?key|signing.?secret|seed.?phrase)/i;
  function checkType(type) {
    assert.ok(type && typeof type === 'object', 'PW_ABI_TYPE');
    if (type.kind === 'array') {
      assert.ok(Number.isSafeInteger(type.length) && type.length >= 0 && type.length <= 4096, 'PW_ABI_ARRAY_BOUND');
      checkType(type.type);
    } else if (type.kind === 'struct') {
      assert.ok(typeof type.path === 'string' && !forbidden.test(type.path), 'PW_ABI_STRUCT_PATH');
      assert.ok(Array.isArray(type.fields), 'PW_ABI_STRUCT_FIELDS');
      for (const field of type.fields) { assert.ok(!forbidden.test(field.name), 'PW_FORBIDDEN_PRIVATE_ABI'); checkType(field.type); }
    } else if (type.kind === 'integer') {
      assert.equal(type.sign, 'unsigned', 'PW_UNSIGNED_ABI');
      assert.ok([8, 16, 32, 64, 128].includes(type.width), 'PW_INTEGER_ABI_WIDTH');
    } else assert.ok(['boolean', 'field'].includes(type.kind), 'PW_ABI_KIND');
  }
  for (let i = 0; i < abi.parameters.length; i++) {
    const parameter = abi.parameters[i];
    assert.deepEqual(Object.keys(parameter).sort(), ['name', 'type', 'visibility'], 'PW_ABI_PARAMETER_FIELDS');
    assert.equal(parameter.visibility, i < spec.publicABI.length ? 'public' : 'private', 'PW_ABI_VISIBILITY');
    assert.ok(!forbidden.test(parameter.name), 'PW_FORBIDDEN_PRIVATE_ABI'); checkType(parameter.type);
  }
}
export function publicWords(spec, values) {
  assert.ok(Array.isArray(values) && values.length === spec.publicWords, 'PW_PUBLIC_WORD_COUNT');
  const widths = spec.publicABI.flatMap(item => item.type.kind === 'integer' ? [64]
    : Array(item.type.type.kind === 'array' ? 32 : 8).fill(32));
  const normalized = values.map((value, index) => {
    assert.ok(typeof value === 'string' || (Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)), 'PW_PUBLIC_INTEGER');
    const text = String(value);
    assert.ok(text.length <= 66 && /^(?:0x[0-9a-fA-F]+|0|[1-9][0-9]*)$/.exec(text)?.[0] === text, 'PW_PUBLIC_ENCODING');
    const number = BigInt(text);
    assert.ok(number >= 0n && number < (1n << BigInt(widths[index])), 'PW_PUBLIC_WIDTH');
    return number.toString();
  });
  decodeStatement(spec.name, normalized); // Includes original canonical Fr encoding.
  return normalized;
}
export const verifierWords = (spec, values) => publicWords(spec, values).map(value => '0x' + BigInt(value).toString(16).padStart(64, '0'));
function plain(value, keys) {
  assert.ok(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, 'PW_PLAIN_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort(), 'PW_EXACT_RECORD_FIELDS');
  for (const key of keys) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'), 'PW_DATA_PROPERTY');
}
export function validateJob(spec, program, job) {
  plain(job, ['inputs', 'expectedPublicInputs']);
  plain(job.inputs, program.abi.parameters.map(item => item.name));
  function value(type, data) {
    if (type.kind === 'array') {
      assert.ok(Array.isArray(data) && !types.isProxy(data) && Object.getPrototypeOf(data) === Array.prototype, 'PW_JOB_ARRAY');
      assert.equal(data.length, type.length, 'PW_JOB_ARRAY_LENGTH');
      assert.equal(Reflect.ownKeys(data).length, data.length + 1, 'PW_JOB_DENSE_ARRAY');
      return data.map(item => value(type.type, item));
    }
    if (type.kind === 'struct') {
      plain(data, type.fields.map(field => field.name));
      return Object.fromEntries(type.fields.map(field => [field.name, value(field.type, data[field.name])]));
    }
    if (type.kind === 'boolean') { assert.equal(typeof data, 'boolean', 'PW_JOB_BOOLEAN'); return data; }
    const text = String(data);
    assert.ok(typeof data === 'string' || (Number.isSafeInteger(data) && data >= 0 && !Object.is(data, -0)), 'PW_JOB_INTEGER');
    assert.ok(text.length <= 78 && /^(?:0x[0-9a-fA-F]+|0|[1-9][0-9]*)$/.exec(text)?.[0] === text, 'PW_JOB_INTEGER_ENCODING');
    const number = BigInt(text), limit = type.kind === 'field' ? 21888242871839275222246405745257275088548364400416034343698204186575808495617n : 1n << BigInt(type.width);
    assert.ok(number >= 0n && number < limit, 'PW_JOB_INTEGER_RANGE');
    return text;
  }
  const inputs = Object.fromEntries(program.abi.parameters.map(item => [item.name, value(item.type, job.inputs[item.name])]));
  assert.ok(Buffer.byteLength(JSON.stringify(inputs)) <= LIMITS.jobBytes, 'PW_JOB_SIZE');
  const expected = publicWords(spec, job.expectedPublicInputs);
  assert.deepEqual(publicWords(spec, spec.publicABI.flatMap(item => [inputs[item.name]].flat(3))), expected, 'PW_EXPECTED_PUBLIC_INPUTS');
  return { inputs, expectedPublicInputs: expected };
}
export function assertStats(stats) {
  assert.ok(Number.isSafeInteger(stats.numGates) && stats.numGates > 0, 'PW_ACTUAL_GATE_COUNT');
  assert.ok(Number.isSafeInteger(stats.numGatesDyadic) && stats.numGatesDyadic >= stats.numGates
    && Number.isInteger(Math.log2(stats.numGatesDyadic)), 'PW_ACTUAL_DYADIC');
  assert.ok(stats.numGatesDyadic <= LIMITS.maximumDyadicGates, 'PW_DYADIC_CAP');
  return stats.numGatesDyadic;
}
export function assertKeyBytes(spec, key, dyadic) {
  assert.equal(key.length, 59 * 32, 'PW_EVM_VK_BYTES');
  const word = i => BigInt('0x' + key.subarray(i * 32, (i + 1) * 32).toString('hex'));
  assert.equal(word(0), BigInt(Math.log2(dyadic)), 'PW_VK_LOG2_DYADIC');
  assert.equal(word(1), BigInt(spec.publicWords + 8), 'PW_VK_PUBLIC_COUNT');
  assert.equal(word(2), 5n, 'PW_VK_PUBLIC_OFFSET');
}
export function canonicalKeyHash(value) {
  assert.ok(typeof value === 'string' && value.length <= 77 && /^[1-9][0-9]*$/.exec(value)?.[0] === value, 'PW_KEY_HASH_ENCODING');
  assert.ok(BigInt(value) < 21888242871839275222246405745257275088548364400416034343698204186575808495617n, 'PW_KEY_HASH_FIELD');
  return value;
}
export function circuitIdentity(spec, toolchain) {
  return { format: 'FLAT_WALLET_CIRCUIT_IDENTITY_V1', profile: PROFILE, relation: spec.name,
    sources: sourceManifest(spec), vendor: verifyVendor(), api: verifyAPI(), toolchain,
    noirVersion: NOIR_VERSION, bbVersion: '5.2.0', target: 'evm', settings: SETTINGS,
    publicABI: spec.publicABI, privateNames: spec.privateNames, publicWords: spec.publicWords };
}
export const versionDirectory = (spec, sourceVersion) => join(LOCAL, 'relations', spec.name, assertHash(sourceVersion));
export function assertSuccessfulAttempt(spec, op, runId) {
  const directory = attemptPath(runId);
  const resource = JSON.parse(regular(join(directory, 'resources.json'))), result = JSON.parse(regular(join(directory, 'result.json')));
  for (const report of [resource, result]) {
    assert.equal(report.profile, PROFILE, 'PW_PRIOR_PROFILE');
    assert.equal(report.relation, spec.name, 'PW_PRIOR_RELATION');
    assert.equal(operation(report.mode), op, 'PW_PRIOR_MODE');
    assert.equal(report.runId, runId, 'PW_PRIOR_RUN');
    assert.equal(report.phase, 'completed', 'PW_PRIOR_SUCCEEDED');
    assert.deepEqual(report.limits, LIMITS, 'PW_PRIOR_LIMITS');
  }
  assert.equal(resource.exitCode, 0, 'PW_PRIOR_EXIT');
  assert.equal(resource.failure ?? null, null, 'PW_PRIOR_RESOURCE_FAILURE');
  assert.deepEqual(resource.failures, [], 'PW_PRIOR_SUPERVISOR_FAILURES');
  return result;
}
export function claimOperation(context, op) {
  assert.ok(['compile', 'stats', 'prepare-key'].includes(op), 'PW_CLAIM_MODE');
  const path = join(context.directory, 'claims', op + '.json');
  assert.equal(existsSync(path), false, 'PW_PREVIOUS_ATTEMPT_REQUIRES_EXPLICIT_REVIEW');
  const artifactId = randomUUID();
  writeJSON(path, { runId: context.runId, artifactId, relation: context.spec.name, operation: op,
    sourceVersion: context.sourceVersion, createdAt: new Date().toISOString() });
  return artifactId;
}
export function artifactPointer(context, kind) { return join(context.directory, kind + '.json'); }
export function publishArtifact(context, kind, artifactId, manifest, files) {
  const directory = join(context.directory, kind, assertID(artifactId));
  ensureDirectory(directory);
  for (const [name, bytes] of Object.entries(files)) {
    assert.ok(['program.json', 'key.vk', 'verifier.sol'].includes(name), 'PW_ARTIFACT_FILE');
    writeNew(join(directory, name), bytes);
  }
  writeJSON(join(directory, 'manifest.json'), manifest);
  const pointer = { runId: context.runId, artifactId, manifestSHA256: hash(jsonBytes(manifest)) };
  writeJSON(artifactPointer(context, kind), pointer);
  return pointer;
}
function readArtifact(context, kind, op) {
  const pointer = JSON.parse(regular(artifactPointer(context, kind)));
  plain(pointer, ['runId', 'artifactId', 'manifestSHA256']);
  const prior = assertSuccessfulAttempt(context.spec, op, pointer.runId);
  assert.equal(prior.sourceVersion, context.sourceVersion, 'PW_PRIOR_SOURCE_VERSION');
  const resultKey = { compiled: 'compiled', stats: 'statistics', prepared: 'prepared' }[kind];
  assert.deepEqual(prior[resultKey], pointer, 'PW_COMPLETED_ATTEMPT_ARTIFACT_POINTER');
  const directory = join(context.directory, kind, assertID(pointer.artifactId));
  const bytes = regular(join(directory, 'manifest.json')), manifest = JSON.parse(bytes);
  assert.equal(hash(bytes), assertHash(pointer.manifestSHA256), 'PW_ARTIFACT_MANIFEST_HASH');
  assert.equal(manifest.profile, PROFILE, 'PW_ARTIFACT_PROFILE');
  assert.equal(manifest.relation, context.spec.name, 'PW_ARTIFACT_RELATION');
  assert.equal(manifest.sourceVersion, context.sourceVersion, 'PW_ARTIFACT_SOURCE_VERSION');
  assert.equal(manifest.runId, pointer.runId, 'PW_ARTIFACT_RUN');
  assert.equal(manifest.artifactId, pointer.artifactId, 'PW_ARTIFACT_ID');
  return { directory, manifest, manifestSHA256: pointer.manifestSHA256, pointer };
}
let candidateTooling;
export async function frozenNodeTooling() {
  const path = join(CANDIDATE, 'src/component-tooling.mjs');
  assert.equal(hash(regular(path)), NODE_PINS.toolingSHA256, 'PW_FROZEN_NODE_TOOLING');
  candidateTooling ??= await import(pathToFileURL(path));
  return candidateTooling;
}
export async function loadCompiled(context) {
  const { spec } = context;
  if (spec.name === 'node') {
    const original = (await frozenNodeTooling()).loadCompiled();
    assert.equal(original.manifestSHA256, NODE_PINS.compiledManifestSHA256, 'PW_FROZEN_NODE_COMPILED');
    for (const [key, field] of [['artifactSHA256', 'programSHA256'], ['bytecodeSHA256', 'bytecodeSHA256'], ['sourceTreeSHA256', 'sourceTreeSHA256']])
      assert.equal(original.manifest[field], NODE_PINS[key], 'PW_FROZEN_NODE_ARTIFACT');
    assertABI(spec, original.program);
    return { ...original, frozen: true };
  }
  const stored = readArtifact(context, 'compiled', 'compile');
  assert.equal(stored.manifest.format, 'FLAT_WALLET_COMPILED_V1', 'PW_COMPILED_FORMAT');
  assert.deepEqual(stored.manifest.identity, context.identity, 'PW_COMPILED_IDENTITY');
  const programBytes = regular(join(stored.directory, 'program.json')), program = JSON.parse(programBytes);
  assert.equal(hash(programBytes), stored.manifest.programSHA256, 'PW_COMPILED_PROGRAM_HASH');
  assert.equal(hash(JSON.stringify(program.abi)), stored.manifest.abiSHA256, 'PW_COMPILED_ABI_HASH');
  assertABI(spec, program);
  const compressed = Buffer.from(program.bytecode, 'base64');
  assert.equal(compressed.toString('base64'), program.bytecode, 'PW_CANONICAL_ACIR_BASE64');
  assert.ok(compressed[0] === 31 && compressed[1] === 139, 'PW_GZIP_ACIR');
  assert.equal(hash(compressed), stored.manifest.bytecodeSHA256, 'PW_COMPILED_ACIR_HASH');
  return { ...stored, program, programBytes, compressed };
}
export function compiledPins(compiled) {
  return { compiledManifestSHA256: compiled.manifestSHA256, artifactSHA256: compiled.manifest.programSHA256,
    bytecodeSHA256: compiled.manifest.bytecodeSHA256 };
}
export async function loadStats(context, compiled) {
  if (context.spec.name === 'node') {
    const saved = (await frozenNodeTooling()).loadStats(compiled, context.toolchain);
    assert.equal(saved.manifestSHA256, NODE_PINS.statsManifestSHA256, 'PW_FROZEN_NODE_STATS');
    return saved;
  }
  const saved = readArtifact(context, 'stats', 'stats');
  assert.equal(saved.manifest.format, 'FLAT_WALLET_STATS_V1', 'PW_STATS_FORMAT');
  for (const [name, value] of Object.entries(compiledPins(compiled))) assert.equal(saved.manifest[name], value, 'PW_STATS_COMPILED_PINS');
  assert.equal(saved.manifest.includeGatesPerOpcode, false, 'PW_AGGREGATE_STATS_ONLY');
  assert.equal(saved.manifest.crsInitialized, false, 'PW_STATS_NO_CRS');
  assert.equal(saved.manifest.keyGenerated, false, 'PW_STATS_NO_KEY');
  assertStats(saved.manifest.stats);
  return saved;
}
export async function loadPrepared(context, compiled, crs) {
  if (context.spec.name === 'node') {
    const original = (await frozenNodeTooling()).loadPrepared(compiled, context.toolchain, crs);
    assert.equal(original.pinFileSHA256, NODE_PINS.pinFileSHA256, 'PW_FROZEN_NODE_KEY_PINS');
    assert.equal(hash(original.key), NODE_PINS.keySHA256, 'PW_FROZEN_NODE_VK');
    return { ...original, manifestSHA256: original.pinFileSHA256, manifest: original.provenance };
  }
  const saved = readArtifact(context, 'prepared', 'prepare-key'), statistics = await loadStats(context, compiled);
  const manifest = saved.manifest;
  assert.equal(manifest.format, 'FLAT_WALLET_KEY_V1', 'PW_KEY_FORMAT');
  for (const [name, value] of Object.entries(compiledPins(compiled))) assert.equal(manifest[name], value, 'PW_KEY_COMPILED_PINS');
  assert.equal(manifest.statsManifestSHA256, statistics.manifestSHA256, 'PW_KEY_STATS');
  assert.deepEqual(manifest.identity, context.identity, 'PW_KEY_IDENTITY');
  assert.deepEqual(manifest.crs, crs, 'PW_KEY_FULL_CRS');
  assert.deepEqual(manifest.settings, SETTINGS, 'PW_KEY_SETTINGS');
  assert.equal(manifest.target, 'evm', 'PW_KEY_TARGET');
  assert.equal(manifest.proofGenerated, false, 'PW_KEY_IS_NOT_PROOF');
  const key = regular(join(saved.directory, 'key.vk')), solidity = regular(join(saved.directory, 'verifier.sol'));
  const dyadic = assertStats(statistics.manifest.stats);
  assertKeyBytes(context.spec, key, dyadic);
  assert.equal(hash(key), manifest.keySHA256, 'PW_KEY_HASH');
  assert.equal(hash(solidity), manifest.soliditySHA256, 'PW_SOLIDITY_HASH');
  assert.equal(key.length, manifest.keyBytes, 'PW_KEY_SIZE');
  assert.equal(solidity.length, manifest.solidityBytes, 'PW_SOLIDITY_SIZE');
  canonicalKeyHash(manifest.keyHashField);
  assert.equal(manifest.publicWords, context.spec.publicWords, 'PW_KEY_PUBLIC_WORDS');
  assert.equal(manifest.actualKeyPublicCount, context.spec.publicWords + 8, 'PW_KEY_ACTUAL_PUBLIC_COUNT');
  assert.equal(manifest.maximumPages, dyadic === 2097152 ? 65536 : 32768, 'PW_KEY_FIXED_MEMORY_PROFILE');
  return { ...saved, key, solidity, pins: { keySHA256: manifest.keySHA256, keyHashField: manifest.keyHashField } };
}
