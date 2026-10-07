/** Fixed, offline Poseidon2 N' candidate. No protocol acceptance or speedup claim. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  renameSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
export const FLAT_ROOT = resolve(ROOT, '..');
export const GOLDEN = resolve(FLAT_ROOT, '../omnichain-product');
export const EXPERIMENT = join(GOLDEN, 'experiments/private-core-proof');
export const CIRCUIT = join(ROOT, 'circuits/node-component');
export const LOCAL = join(ROOT, '.local/component');
export const CANDIDATE = 'POSEIDON2_COMPONENT_CANDIDATE_V1';
export const VENDOR = join(ROOT, 'vendor/poseidon');
export const VENDOR_COMMIT = 'e105cdd5c79c222860d53c5dfdb8fa8012b291c0';
export const VENDOR_PROVENANCE_SHA256 = 'bba70f26507d4c6a2c3b88779fa55763353d9778cd1235acfd6afddd1edcc7a4';
export const MODES = Object.freeze(['compile', 'constraints', 'stats', 'prepare-key', 'prove', 'verify']);
export const SETTINGS = Object.freeze({ ipaAccumulation: false, oracleHashType: 'keccak',
  disableZk: false, optimizedSolidityVerifier: false });
export const LIMITS = Object.freeze({ availableRAM: 2684354560, freeDisk: 5368709120,
  workerRSS: 3221225472, sampleMilliseconds: 250, phaseTimeoutMilliseconds: 600000,
  killGraceMilliseconds: 5000, outputBytes: 1048576, threads: 1, maximumPages: 32768,
  wasmAddressSpaceBytes: 2147483648, maximumDyadicGates: 1048576, provingCRSPoints: 2097152 });
export const NOIR_VERSION = '1.0.0-beta.25+75061fab15986eedee4e7d9104ff87dd9fa4ca10';
export const PUBLIC_NAMES = Object.freeze(['domain_commitment', 'authorization_root',
  'evidence_state', 'completion_commitment']);
export const DISCLOSURE = 'One isolated Poseidon2 commitment/Merkle N-prime candidate with synthetic fixtures. Public ABI remains 32 u32 words; proof target remains evm/keccak/ZK. Poseidon2 here changes circuit commitment predicates, not the proof transcript target. This is neither old recursive N51 nor an accepted replacement for the SHA256 component. No owner authorization, funding, native finality, deployed verifier, atomic composition, performance improvement or protocol acceptance is established.';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => JSON.stringify(value, null, 2) + '\n';
export const requirePinned = createRequire(join(EXPERIMENT, 'package.json'));
const entrypoints = Object.freeze({
  '@aztec/bb.js': 'node_modules/@aztec/bb.js/dest/node-cjs/index.js',
  '@noir-lang/noir_js': 'node_modules/@noir-lang/noir_js/lib/index.cjs',
  '@noir-lang/noir_wasm': 'node_modules/@noir-lang/noir_wasm/dist/node/main.js',
});
export const loadPinned = name => {
  assert.ok(Object.hasOwn(entrypoints, name), 'FLAT_EXACT_PACKAGE_REQUIRED');
  verifyAPI();
  const path = requirePinned.resolve(name);
  assert.equal(realpathSync(path), join(EXPERIMENT, entrypoints[name]), 'FLAT_EXACT_API_ENTRYPOINT');
  return import(pathToFileURL(path));
};
export const resourceModuleURL = pathToFileURL(join(EXPERIMENT, 'wallet-notes/resources.mjs'));
export const verifierCRSModuleURL = pathToFileURL(join(GOLDEN, 'src/private-verifier-crs.mjs'));

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
    assert.equal(hash(bytes), expected, 'FLAT_OFFICIAL_API_SOURCE_PIN');
    return { path, bytes: bytes.length, sha256: expected };
  });
}

export function modeFromArguments() {
  assert.equal(process.argv.length, 3, 'FLAT_FIXED_MODE_ONLY');
  assert.equal(process.execArgv.length, 0, 'FLAT_NO_NODE_ARGUMENT_OVERRIDES');
  assert.ok(!process.env.NODE_OPTIONS, 'FLAT_NO_NODE_ENV_OVERRIDES');
  assert.ok(MODES.includes(process.argv[2]), 'FLAT_FIXED_MODE_ONLY');
  return process.argv[2];
}
export function authenticateSupervisor(mode) {
  // The platform may give the lightweight supervisor a default NODE_PATH.
  // It imports only built-ins/relative files and starts this worker with an
  // explicit clean environment. No search-path override may reach crypto.
  assert.ok(!process.env.NODE_PATH, 'FLAT_NO_WORKER_SEARCH_PATH_OVERRIDE');
  assert.equal(realpathSync(`/proc/${process.ppid}/exe`), realpathSync(process.execPath),
    'FLAT_ACTUAL_PARENT_EXECUTABLE');
  const args = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(args.length, 3, 'FLAT_EXACT_PARENT_ARGUMENTS');
  const parentScript = resolve(realpathSync(`/proc/${process.ppid}/cwd`), args[1]);
  assert.equal(parentScript, join(ROOT, 'scripts/run-bounded-component.mjs'), 'FLAT_SUPERVISOR_SCRIPT');
  assert.deepEqual(args.slice(2), [mode], 'FLAT_SUPERVISOR_MODE');
  assert.equal(realpathSync(parentScript), parentScript, 'FLAT_SUPERVISOR_SYMLINK');
  assert.equal(process.argv[1], join(ROOT, 'scripts/component-worker.mjs'), 'FLAT_EXACT_WORKER_SCRIPT');
  return { pid: process.ppid, executable: realpathSync(`/proc/${process.ppid}/exe`), arguments: args.slice(1) };
}
export function regular(path) {
  assert.equal(realpathSync(path), resolve(path), 'FLAT_FILE_SYMLINK');
  assert.ok(lstatSync(path).isFile(), 'FLAT_REGULAR_FILE');
  return readFileSync(path);
}
export function ensureDirectory(path) {
  const absolute = resolve(path);
  assert.ok(absolute === LOCAL || absolute.startsWith(LOCAL + sep)
    || absolute === join(ROOT, '.local') || absolute === join(ROOT, 'evidence')
    || absolute.startsWith(join(ROOT, 'evidence') + sep), 'FLAT_OUTPUT_LOCATION');
  const missing = []; let ancestor = absolute;
  while (!existsSync(ancestor)) { missing.push(ancestor); ancestor = dirname(ancestor); }
  assert.equal(realpathSync(ancestor), ancestor, 'FLAT_OUTPUT_ANCESTOR_SYMLINK');
  assert.ok(lstatSync(ancestor).isDirectory(), 'FLAT_OUTPUT_ANCESTOR_DIRECTORY');
  for (const directory of missing.reverse()) mkdirSync(directory, { mode: 0o700 });
  assert.equal(realpathSync(absolute), absolute, 'FLAT_OUTPUT_SYMLINK');
  assert.ok(lstatSync(absolute).isDirectory(), 'FLAT_OUTPUT_DIRECTORY');
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
  const temporary = path + '.tmp-' + process.pid;
  writeNew(temporary, jsonBytes(value));
  renameSync(temporary, path);
}
export function fixedAttempt(mode, pid = process.pid) {
  assert.ok(MODES.includes(mode) && Number.isSafeInteger(pid) && pid > 0, 'FLAT_ATTEMPT_PROFILE');
  return join(LOCAL, 'attempts', mode + '-' + pid);
}
export function resources(pid) {
  const memory = /MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'));
  assert.ok(memory, 'FLAT_MEMINFO_AVAILABLE');
  const disk = statfsSync(ROOT);
  let workerRSS = 0;
  if (pid) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      const match = /VmRSS:\s+(\d+)/.exec(status);
      if (match) workerRSS = Number(match[1]) * 1024;
      else assert.match(status, /^State:\s+[ZX]/m, 'FLAT_WORKER_RSS_UNAVAILABLE');
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
    }
  }
  const sample = { at: new Date().toISOString(), availableRAM: Number(memory[1]) * 1024,
    freeDisk: disk.bavail * disk.bsize, workerRSS };
  for (const name of ['availableRAM', 'freeDisk', 'workerRSS'])
    assert.ok(Number.isSafeInteger(sample[name]) && sample[name] >= 0, 'FLAT_RESOURCE_MEASUREMENT');
  return sample;
}
export function resourceFailure(sample) {
  if (sample.availableRAM < LIMITS.availableRAM) return 'AVAILABLE_RAM_FLOOR';
  if (sample.freeDisk < LIMITS.freeDisk) return 'DISK_FLOOR';
  if (sample.workerRSS > LIMITS.workerRSS) return 'WORKER_RSS_LIMIT';
  return null;
}

// This allowlist is deliberately exact: no repository-wide dependency access.
const packages = new Set([CIRCUIT, join(ROOT, 'lib'), VENDOR, join(FLAT_ROOT, 'lib'),
  ...['generic-graph', 'generic-native', 'generic-wrappers'].map(name => join(EXPERIMENT, name, 'lib'))]);
function record(path) {
  const bytes = regular(path);
  const base = path.startsWith(ROOT + sep) ? ROOT : path.startsWith(FLAT_ROOT + sep) ? FLAT_ROOT : GOLDEN;
  assert.ok(path.startsWith(base + sep), 'FLAT_SOURCE_RECORD_LOCATION');
  return { root: base === ROOT ? 'candidate' : base === FLAT_ROOT ? 'flat-reference' : 'golden',
    path: relative(base, path).split(sep).join('/'),
    bytes: bytes.length, sha256: hash(bytes) };
}
export function verifyVendor() {
  const provenancePath = join(VENDOR, 'UPSTREAM-PROVENANCE.json');
  const bytes = regular(provenancePath);
  assert.equal(hash(bytes), VENDOR_PROVENANCE_SHA256, 'FLAT_OFFICIAL_VENDOR_PROVENANCE_PIN');
  const provenance = JSON.parse(bytes);
  assert.equal(provenance.repository, 'https://github.com/noir-lang/poseidon', 'FLAT_OFFICIAL_VENDOR_REPOSITORY');
  assert.equal(provenance.commit, VENDOR_COMMIT, 'FLAT_OFFICIAL_VENDOR_COMMIT');
  assert.equal(provenance.license, 'Apache-2.0', 'FLAT_OFFICIAL_VENDOR_LICENSE');
  assert.ok(Array.isArray(provenance.files) && provenance.files.length === 11, 'FLAT_OFFICIAL_VENDOR_FILE_COUNT');
  const paths = [];
  function walk(directory) {
    assert.equal(realpathSync(directory), directory, 'FLAT_VENDOR_SYMLINK');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'FLAT_VENDOR_SYMLINK');
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else { assert.ok(entry.isFile(), 'FLAT_VENDOR_REGULAR_FILE'); paths.push(relative(VENDOR, path).split(sep).join('/')); }
    }
  }
  walk(VENDOR);
  assert.deepEqual(paths.sort(), [...provenance.files.map(file => file.path), 'UPSTREAM-PROVENANCE.json'].sort(),
    'FLAT_EXACT_OFFICIAL_VENDOR_FILES');
  for (const file of provenance.files) {
    assert.ok(typeof file.path === 'string' && /^(?:LICENSE|Nargo\.toml|src\/[a-zA-Z0-9_./-]+\.nr)$/.exec(file.path)?.[0] === file.path
      && !file.path.split('/').includes('..'), 'FLAT_VENDOR_FILE_PATH');
    const actual = regular(join(VENDOR, file.path));
    assert.equal(actual.length, file.bytes, 'FLAT_VENDOR_FILE_BYTES');
    assert.equal(hash(actual), file.sha256, 'FLAT_VENDOR_FILE_PIN');
  }
  return { repository: provenance.repository, commit: VENDOR_COMMIT,
    provenanceSHA256: VENDOR_PROVENANCE_SHA256, files: provenance.files };
}
export function sourceManifest() {
  verifyVendor();
  const files = new Set(), visiting = new Set(), completed = new Set();
  function visit(directory) {
    directory = resolve(directory);
    assert.ok(packages.has(directory), 'FLAT_EXACT_LOCAL_NARGO_DEPENDENCY_REQUIRED');
    assert.equal(realpathSync(directory), directory, 'FLAT_PACKAGE_SYMLINK');
    assert.ok(!visiting.has(directory), 'FLAT_DEPENDENCY_CYCLE');
    if (completed.has(directory)) return;
    visiting.add(directory);
    const config = join(directory, 'Nargo.toml'), content = regular(config).toString('utf8');
    files.add(config);
    function walk(path) {
      assert.equal(realpathSync(path), path, 'FLAT_SOURCE_SYMLINK');
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        assert.ok(!entry.isSymbolicLink(), 'FLAT_SOURCE_SYMLINK');
        const child = join(path, entry.name);
        if (entry.isDirectory()) walk(child);
        else if (entry.isFile() && entry.name.endsWith('.nr')) { regular(child); files.add(child); }
        else assert.ok(entry.isFile(), 'FLAT_SOURCE_SPECIAL_FILE');
      }
    }
    walk(join(directory, 'src'));
    let dependencies = false;
    for (const original of content.split(/\r?\n/)) {
      const line = original.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('[')) {
        assert.ok(line === '[package]' || line === '[dependencies]', 'FLAT_NARGO_UNSUPPORTED_SECTION');
        dependencies = line === '[dependencies]'; continue;
      }
      if (!dependencies) continue;
      const parsed = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*\{\s*path\s*=\s*"([^"]+)"\s*\}$/.exec(line);
      assert.ok(parsed && !/^(?:[a-z]+:|\/)/i.test(parsed[2]), 'FLAT_LOCAL_RELATIVE_DEPENDENCY_REQUIRED');
      visit(resolve(directory, parsed[2]));
    }
    visiting.delete(directory); completed.add(directory);
  }
  visit(CIRCUIT);
  assert.ok(completed.has(VENDOR), 'FLAT_POSEIDON_VENDOR_DEPENDENCY_REQUIRED');
  files.add(join(VENDOR, 'LICENSE')); files.add(join(VENDOR, 'UPSTREAM-PROVENANCE.json'));
  return [...files].sort().map(record);
}
export function executionSources() {
  return [join(ROOT, 'scripts/run-bounded-component.mjs'), join(ROOT, 'scripts/component-worker.mjs'),
    join(ROOT, 'src/component-tooling.mjs'), join(ROOT, 'src/node-fixtures.mjs'),
    join(ROOT, 'src/framing.mjs'), join(EXPERIMENT, 'wallet-notes/resources.mjs'),
    join(FLAT_ROOT, 'src/framing.mjs'),
    join(GOLDEN, 'src/private-resource-policy.mjs'), join(GOLDEN, 'src/private-verifier-crs.mjs')]
    .sort().map(record);
}
const uint = width => ({ kind: 'integer', sign: 'unsigned', width });
const array = (type, length) => ({ kind: 'array', length, type });
const digest = array(uint(8), 32);
const digestFields = names => names.map(name => ({ name, type: digest }));
const struct = (path, fields) => ({ kind: 'struct', path, fields });
const DOMAIN = struct('poseidon_support::types::Domain', digestFields(['scope', 'policy', 'asset', 'hub_domain', 'registry_commitment',
  'verifier_set_commitment', 'ledger_namespace']));
const CORE = struct('poseidon_support::types::Core', [...digestFields(['context', 'reserve_commitment', 'reserve_nullifier']),
  { name: 'settle_before', type: uint(64) }]);
const LOCAL_TERMS = struct('poseidon_support::types::Local', [{ name: 'slot', type: uint(8) }, { name: 'active', type: { kind: 'boolean' } },
  ...digestFields(['target_context', 'node_commitment', 'local_commitment', 'dispatch_id', 'chain_domain',
    'evidence_policy', 'action_commitment', 'payout_commitment', 'receipt_key_commitment', 'receipt_rho',
    'dummy_terminal_tag', 'capsule_salt', 'target_join_blind'])]);
const COMPLETION = struct('poseidon_support::types::Completion', [...digestFields(['hub_domain', 'registry_commitment', 'evidence_state',
  'context', 'payout_commitment', 'terminal_receipt_tag']), { name: 'slot', type: uint(8) },
  { name: 'valid_from', type: uint(64) }, { name: 'valid_until', type: uint(64) }]);
const STATE = struct('native_support::state::EvidenceState', [...digestFields(['hub_domain', 'registry_commitment', 'receipt_root']),
  { name: 'receipt_count', type: uint(32) }, ...digestFields(['revoked_digest']),
  { name: 'revoked_count', type: uint(32) }, { name: 'revocation_sequence', type: uint(64) }]);
const RECEIPT = struct('native_support::receipt::ReceiptRead', [...digestFields(['hub_domain', 'registry_commitment', 'global_effect_id', 'scope',
  'policy', 'local_commitment', 'dispatch_id', 'chain_domain', 'evidence_policy', 'action_commitment',
  'payout_commitment']), { name: 'valid_from', type: uint(64) }, { name: 'valid_until', type: uint(64) },
  ...digestFields(['receipt_key_commitment', 'receipt_rho'])]);
const PRIVATE_TYPES = [
  ['domain', DOMAIN], ['envelope', digest], ['authorization_siblings', array(digest, 6)],
  ['authorization_index', uint(32)], ['core', CORE], ['core_blind', digest],
  ['core_siblings', array(digest, 4)], ['local', LOCAL_TERMS], ['local_blind', digest],
  ['local_siblings', array(digest, 4)], ['completion', COMPLETION], ['completion_blind', digest],
  ['state_opening', STATE], ['own_receipt', RECEIPT], ['receipt_spend_secret', digest],
  ['receipt_siblings', array(digest, 6)], ['receipt_index', uint(32)], ['revoked_entries', array(digest, 64)],
];
export const PUBLIC_ABI = PUBLIC_NAMES.map(name => ({ name, type: array(uint(32), 8), visibility: 'public' }));
function abiType(type) {
  assert.ok(type && typeof type === 'object', 'FLAT_ABI_TYPE');
  if (type.kind === 'struct') {
    assert.deepEqual(Object.keys(type).sort(), ['fields', 'kind', 'path'], 'FLAT_STRUCT_METADATA');
    return { kind: 'struct', path: type.path, fields: type.fields.map(field => {
      assert.deepEqual(Object.keys(field).sort(), ['name', 'type'], 'FLAT_STRUCT_FIELD_METADATA');
      return { name: field.name, type: abiType(field.type) };
    }) };
  }
  if (type.kind === 'array') {
    assert.deepEqual(Object.keys(type).sort(), ['kind', 'length', 'type'], 'FLAT_ARRAY_METADATA');
    return { kind: 'array', length: type.length, type: abiType(type.type) };
  }
  return type;
}
export function assertABI(program) {
  assert.equal(program.noir_version, NOIR_VERSION, 'FLAT_PINNED_NOIR_VERSION');
  assert.ok(program.abi && Array.isArray(program.abi.parameters), 'FLAT_ABI_REQUIRED');
  assert.ok(program.abi.return_type == null, 'FLAT_NO_RETURN_ABI');
  const parameters = program.abi.parameters;
  assert.deepEqual(parameters.filter(parameter => parameter.visibility === 'public'), PUBLIC_ABI, 'FLAT_EXACT_PUBLIC_ABI');
  assert.deepEqual(parameters.map(parameter => {
    assert.deepEqual(Object.keys(parameter).sort(), ['name', 'type', 'visibility'], 'FLAT_PARAMETER_METADATA');
    assert.ok(!/(?:proof|verification.?key|^vk$)/i.test(parameter.name), 'FLAT_NO_PROOF_OR_VK_WITNESS');
    return { ...parameter, type: abiType(parameter.type) };
  }), [...PUBLIC_ABI, ...PRIVATE_TYPES.map(([name, type]) => ({ name, type, visibility: 'private' }))],
  'FLAT_EXACT_COMPLETE_ABI');
}
export function publicWords(values) {
  assert.ok(Array.isArray(values) && values.length === 32, 'FLAT_PUBLIC_WORD_COUNT');
  return values.map(value => {
    assert.ok(typeof value === 'string' || (Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)), 'FLAT_PUBLIC_WORD');
    const encoded = String(value);
    assert.ok(encoded.length <= 66 && /^(?:0x[0-9a-fA-F]+|0|[1-9][0-9]*)$/.exec(encoded)?.[0] === encoded,
      'FLAT_PUBLIC_WORD_ENCODING');
    const number = BigInt(value);
    assert.ok(number >= 0n && number <= 0xffff_ffffn, 'FLAT_PUBLIC_U32_RANGE');
    return number.toString();
  });
}
export const verifierWords = values => publicWords(values).map(value => '0x' + BigInt(value).toString(16).padStart(64, '0'));
export function assertExpectedPublic(inputs, expected) {
  const words = publicWords(PUBLIC_NAMES.flatMap(name => inputs[name]));
  assert.deepEqual(words, publicWords(expected), 'FLAT_EXPECTED_PUBLIC_INPUTS');
  return words;
}
export function assertStats(stats) {
  const dyadic = stats.numGatesDyadic;
  assert.ok(Number.isSafeInteger(dyadic) && dyadic > 0 && Number.isInteger(Math.log2(dyadic)), 'FLAT_ACTUAL_DYADIC');
  assert.ok(Number.isSafeInteger(stats.numGates) && stats.numGates > 0 && stats.numGates <= dyadic, 'FLAT_ACTUAL_GATE_STATS');
  assert.ok(dyadic <= LIMITS.maximumDyadicGates, 'FLAT_FIRST_ATTEMPT_CIRCUIT_CAP');
  return dyadic;
}
export function assertKeyBytes(key, dyadic) {
  assert.equal(key.length, 59 * 32, 'FLAT_EVM_VK_BYTES');
  const word = index => BigInt('0x' + key.subarray(index * 32, (index + 1) * 32).toString('hex'));
  assert.equal(word(0), BigInt(Math.log2(dyadic)), 'FLAT_VK_LOG2_DYADIC');
  assert.equal(word(1), 40n, 'FLAT_VK_PUBLIC_COUNT_INCLUDING_PAIRING_POINTS');
  assert.equal(word(2), 5n, 'FLAT_VK_PUBLIC_OFFSET');
}
export function canonicalKeyHash(value) {
  assert.equal(typeof value, 'string', 'FLAT_KEY_HASH_FIELD');
  assert.ok(value.length <= 77 && /^[1-9][0-9]*$/.exec(value)?.[0] === value, 'FLAT_CANONICAL_KEY_HASH_FIELD');
  assert.ok(BigInt(value) < 21888242871839275222246405745257275088548364400416034343698204186575808495617n,
    'FLAT_KEY_HASH_FIELD_RANGE');
  return value;
}
export function assertHash(value) {
  assert.ok(typeof value === 'string' && value.length === 64, 'FLAT_HASH_ENCODING');
  assert.match(value, /^[0-9a-f]{64}$/, 'FLAT_HASH_ENCODING');
  return value;
}
export function assertSuccessfulAttempt(mode, supervisorPID) {
  const directory = fixedAttempt(mode, supervisorPID);
  const resourceReport = JSON.parse(regular(join(directory, 'resources.json')));
  const result = JSON.parse(regular(join(directory, 'result.json')));
  assert.equal(resourceReport.mode, mode, 'FLAT_PREVIOUS_SUPERVISOR_MODE');
  assert.equal(resourceReport.candidate, CANDIDATE, 'FLAT_PREVIOUS_SUPERVISOR_CANDIDATE');
  assert.equal(resourceReport.phase, 'completed', 'FLAT_PREVIOUS_SUPERVISOR_SUCCEEDED');
  assert.equal(resourceReport.exitCode, 0, 'FLAT_PREVIOUS_CHILD_EXIT');
  assert.equal(resourceReport.failure ?? null, null, 'FLAT_PREVIOUS_RESOURCE_FAILURE');
  assert.deepEqual(resourceReport.failures, [], 'FLAT_PREVIOUS_SUPERVISOR_FAILURES');
  assert.deepEqual(resourceReport.limits, LIMITS, 'FLAT_PREVIOUS_RESOURCE_LIMITS');
  assert.equal(result.mode, mode, 'FLAT_PREVIOUS_WORKER_MODE');
  assert.equal(result.candidate, CANDIDATE, 'FLAT_PREVIOUS_WORKER_CANDIDATE');
  assert.equal(result.phase, 'completed', 'FLAT_PREVIOUS_WORKER_SUCCEEDED');
  assert.equal(result.supervisor.pid, supervisorPID, 'FLAT_PREVIOUS_SUPERVISOR_PID');
  return result;
}
export function loadCompiled() {
  const pointer = JSON.parse(regular(join(LOCAL, 'compiled.json')));
  assert.deepEqual(Object.keys(pointer).sort(), ['manifestSHA256', 'programSHA256', 'supervisorPID'], 'FLAT_COMPILED_POINTER');
  assertSuccessfulAttempt('compile', pointer.supervisorPID);
  const directory = join(LOCAL, 'compiled', assertHash(pointer.manifestSHA256));
  const manifestBytes = regular(join(directory, 'manifest.json')), manifest = JSON.parse(manifestBytes);
  const programBytes = regular(join(directory, 'program.json')), program = JSON.parse(programBytes);
  assert.equal(hash(manifestBytes), pointer.manifestSHA256, 'FLAT_COMPILED_MANIFEST_PIN');
  assert.equal(hash(programBytes), assertHash(pointer.programSHA256), 'FLAT_COMPILED_PROGRAM_PIN');
  assert.equal(manifest.programSHA256, pointer.programSHA256, 'FLAT_MANIFEST_PROGRAM_PIN');
  assert.equal(manifest.mode, 'node-component', 'FLAT_COMPILED_PROFILE');
  assert.equal(manifest.candidate, CANDIDATE, 'FLAT_COMPILED_CANDIDATE');
  assert.deepEqual(manifest.vendor, verifyVendor(), 'FLAT_COMPILED_VENDOR_PIN');
  assert.deepEqual(manifest.api, verifyAPI(), 'FLAT_COMPILED_API_PIN');
  assert.equal(manifest.format, 'FLAT_COMPONENT_COMPILED_MANIFEST_V1', 'FLAT_COMPILED_FORMAT');
  assert.equal(manifest.node, process.version, 'FLAT_COMPILED_NODE');
  assert.equal(manifest.noirVersion, NOIR_VERSION, 'FLAT_COMPILED_NOIR_VERSION');
  assert.equal(manifest.target, 'evm', 'FLAT_COMPILED_TARGET');
  assert.deepEqual(manifest.settings, SETTINGS, 'FLAT_COMPILED_SETTINGS');
  assert.equal(manifest.publicWords, 32, 'FLAT_COMPILED_PUBLIC_WORDS');
  assert.deepEqual(manifest.publicNames, PUBLIC_NAMES, 'FLAT_COMPILED_PUBLIC_NAMES');
  assert.deepEqual(manifest.sources, sourceManifest(), 'FLAT_COMPILED_SOURCE_CLOSURE');
  assert.equal(manifest.sourceTreeSHA256, hash(JSON.stringify(manifest.sources)), 'FLAT_COMPILED_SOURCE_HASH');
  assert.deepEqual(manifest.executionSources, executionSources(), 'FLAT_COMPILED_EXECUTION_SOURCES');
  assert.equal(manifest.executionSourceSHA256, hash(JSON.stringify(manifest.executionSources)), 'FLAT_COMPILED_EXECUTION_SOURCE_HASH');
  assertABI(program);
  const compressed = Buffer.from(program.bytecode, 'base64');
  assert.equal(compressed.toString('base64'), program.bytecode, 'FLAT_ACIR_BASE64');
  assert.ok(compressed[0] === 31 && compressed[1] === 139, 'FLAT_GZIP_ACIR');
  assert.equal(hash(compressed), manifest.bytecodeSHA256, 'FLAT_ACIR_PIN');
  return { directory, manifest, manifestSHA256: pointer.manifestSHA256, program, programBytes, compressed };
}
export function loadPrepared(compiled, toolchain, crs) {
  const directory = join(LOCAL, 'prepared');
  const pinBytes = regular(join(directory, 'generated-pins.json')), pins = JSON.parse(pinBytes);
  const provenanceBytes = regular(join(directory, 'provenance.json')), provenance = JSON.parse(provenanceBytes);
  const keyAttempt = assertSuccessfulAttempt('prepare-key', provenance.supervisorPID);
  const key = regular(join(directory, 'node-component.vk')), solidity = regular(join(directory, 'node-component.sol'));
  assert.deepEqual(Object.keys(pins).sort(), ['artifactSHA256', 'bytecodeSHA256', 'compiledManifestSHA256',
    'keyHashField', 'keySHA256', 'provenanceSHA256', 'soliditySHA256', 'sourceTreeSHA256'].sort(), 'FLAT_EXPLICIT_GENERATED_PINS');
  const expected = { artifactSHA256: compiled.manifest.programSHA256, bytecodeSHA256: compiled.manifest.bytecodeSHA256,
    compiledManifestSHA256: compiled.manifestSHA256, sourceTreeSHA256: compiled.manifest.sourceTreeSHA256,
    keySHA256: hash(key), soliditySHA256: hash(solidity), provenanceSHA256: hash(provenanceBytes) };
  for (const [name, value] of Object.entries(expected)) assert.equal(assertHash(pins[name]), value, 'FLAT_PREPARED_PIN_' + name);
  for (const [name, value] of Object.entries(expected).filter(([name]) => name !== 'provenanceSHA256'))
    assert.equal(provenance[name], value, 'FLAT_PROVENANCE_PIN_' + name);
  assert.equal(provenance.format, 'FLAT_COMPONENT_KEY_PROVENANCE_V1', 'FLAT_PROVENANCE_FORMAT');
  assert.equal(provenance.candidate, CANDIDATE, 'FLAT_PROVENANCE_CANDIDATE');
  assert.deepEqual(provenance.vendor, verifyVendor(), 'FLAT_PROVENANCE_VENDOR_PIN');
  assert.deepEqual(provenance.api, verifyAPI(), 'FLAT_PROVENANCE_API_PIN');
  assert.equal(provenance.mode, 'node-component', 'FLAT_PROVENANCE_MODE');
  assert.equal(provenance.resourceReport, relative(ROOT, join(fixedAttempt('prepare-key', provenance.supervisorPID), 'resources.json')),
    'FLAT_PROVENANCE_RESOURCE_REPORT');
  assert.equal(provenance.phase, 'completed', 'FLAT_KEY_COMPLETED');
  assert.equal(provenance.target, 'evm', 'FLAT_EVM_TARGET');
  assert.equal(provenance.proofGenerated, false, 'FLAT_KEY_IS_NOT_PROOF');
  assert.equal(provenance.publicInputWords, 32, 'FLAT_KEY_PUBLIC_WORDS');
  assert.equal(provenance.actualKeyPublicInputCount, 40, 'FLAT_KEY_ACTUAL_PUBLIC_WORDS');
  assert.equal(provenance.maximumPages, LIMITS.maximumPages, 'FLAT_KEY_MAXIMUM_PAGES');
  assert.equal(provenance.threads, 1, 'FLAT_KEY_THREADS');
  assert.equal(provenance.bbVersion, '5.2.0', 'FLAT_KEY_BB_VERSION');
  assert.equal(provenance.noirVersion, NOIR_VERSION, 'FLAT_KEY_NOIR_VERSION');
  assert.equal(provenance.node, process.version, 'FLAT_KEY_NODE_VERSION');
  assert.deepEqual(provenance.settings, SETTINGS, 'FLAT_KEY_SETTINGS');
  assert.deepEqual(provenance.limits, LIMITS, 'FLAT_KEY_LIMITS');
  assert.deepEqual(provenance.sources, compiled.manifest.sources, 'FLAT_KEY_SOURCES');
  assert.deepEqual(provenance.executionSources, executionSources(), 'FLAT_KEY_EXECUTION_SOURCES');
  assert.deepEqual(provenance.toolchain, toolchain, 'FLAT_KEY_TOOLCHAIN');
  assert.deepEqual(provenance.crs, crs, 'FLAT_KEY_FULL_CRS');
  const statistics = loadStats(compiled, toolchain);
  assert.equal(provenance.statsManifestSHA256, statistics.manifestSHA256, 'FLAT_KEY_STATS_MANIFEST');
  assert.deepEqual(provenance.stats, statistics.manifest.stats, 'FLAT_KEY_REVIEWED_STATS');
  assert.equal(provenance.keyHashField, canonicalKeyHash(pins.keyHashField), 'FLAT_KEY_HASH');
  assertKeyBytes(key, assertStats(provenance.stats));
  assert.equal(provenance.keyBytes, key.length, 'FLAT_KEY_SIZE');
  assert.equal(provenance.solidityBytes, solidity.length, 'FLAT_SOLIDITY_SIZE');
  assert.deepEqual(keyAttempt.prepared.pins, pins, 'FLAT_COMPLETED_KEY_ATTEMPT_PINS');
  assert.equal(keyAttempt.prepared.pinFileSHA256, hash(pinBytes), 'FLAT_COMPLETED_KEY_ATTEMPT_PIN_FILE');
  return { directory, key, solidity, pins, pinFileSHA256: hash(pinBytes), provenance };
}

/** Completed aggregate statistics only; never initializes CRS or a backend. */
export function loadStats(compiled, toolchain) {
  const pointer = JSON.parse(regular(join(LOCAL, 'stats.json')));
  assert.deepEqual(Object.keys(pointer).sort(), ['manifestSHA256', 'supervisorPID'], 'FLAT_STATS_POINTER');
  const prior = assertSuccessfulAttempt('stats', pointer.supervisorPID);
  const bytes = regular(join(fixedAttempt('stats', pointer.supervisorPID), 'stats-manifest.json'));
  const manifest = JSON.parse(bytes), manifestSHA256 = hash(bytes);
  assert.equal(manifestSHA256, assertHash(pointer.manifestSHA256), 'FLAT_STATS_MANIFEST_PIN');
  assert.equal(manifest.format, 'FLAT_COMPONENT_AGGREGATE_STATS_V1', 'FLAT_STATS_FORMAT');
  assert.equal(manifest.candidate, CANDIDATE, 'FLAT_STATS_CANDIDATE');
  assert.equal(manifest.compiledManifestSHA256, compiled.manifestSHA256, 'FLAT_STATS_COMPILED_PIN');
  assert.equal(manifest.artifactSHA256, compiled.manifest.programSHA256, 'FLAT_STATS_PROGRAM_PIN');
  assert.equal(manifest.bytecodeSHA256, compiled.manifest.bytecodeSHA256, 'FLAT_STATS_BYTECODE_PIN');
  assert.equal(manifest.sourceTreeSHA256, compiled.manifest.sourceTreeSHA256, 'FLAT_STATS_SOURCE_PIN');
  assert.deepEqual(manifest.executionSources, executionSources(), 'FLAT_STATS_HOST_PIN');
  assert.deepEqual(manifest.vendor, verifyVendor(), 'FLAT_STATS_VENDOR_PIN');
  assert.deepEqual(manifest.api, verifyAPI(), 'FLAT_STATS_API_PIN');
  assert.deepEqual(manifest.toolchain, toolchain, 'FLAT_STATS_TOOLCHAIN_PIN');
  assert.deepEqual(manifest.settings, SETTINGS, 'FLAT_STATS_SETTINGS');
  assert.deepEqual(manifest.limits, LIMITS, 'FLAT_STATS_LIMITS');
  assert.equal(manifest.includeGatesPerOpcode, false, 'FLAT_NO_OPCODE_PROFILING');
  assert.equal(manifest.crsInitialized, false, 'FLAT_STATS_NO_CRS');
  assert.equal(manifest.keyGenerated, false, 'FLAT_STATS_NO_KEY');
  assert.deepEqual(prior.stats, manifest.stats, 'FLAT_STATS_COMPLETED_RESULT');
  assertStats(manifest.stats);
  return { manifest, manifestSHA256, pointer };
}
