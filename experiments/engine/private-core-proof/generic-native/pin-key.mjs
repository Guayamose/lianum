// Offline integrity and pin installation only: no compiler, backend, key or proof run.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filePin, hash, verifyToolchain, verifyCRS } from '../wallet-notes/resources.mjs';
import { canonicalField } from '../generic-wrappers/abi.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const NATIVE = 'experiments/private-core-proof/generic-native';
export const OFFICIAL_VERIFIER_SHA256 = '258cd5979844a2627688e6efcad07637b1e90624b3af77e0dc3e6ff45a9aa84c';
export const NOIR_VERSION = '1.0.0-beta.25+75061fab15986eedee4e7d9104ff87dd9fa4ca10';
export const KEY_FORMAT = 'LIANUM_PAEG_GENERIC_NATIVE_KEY_PROVENANCE_V1';
export const KEY_CLASSIFICATION = 'ACTUAL_OFFICIAL_GENERIC_NATIVE_KEY_GENERATION_NOT_PROOF';
const integer = width => ({ kind: 'integer', sign: 'unsigned', width });
const digest = () => ({ kind: 'array', length: 8, type: integer(32) });
function profile(words, target, digests, arrays, bytes, times) {
  const parameters = [
    ...digests.map(name => ({ name, type: digest(), visibility: 'public' })),
    ...arrays.map(([name, length]) => ({ name, type: { kind: 'array', length, type: digest() }, visibility: 'public' })),
    ...bytes.map(name => ({ name, type: integer(8), visibility: 'public' })),
    ...times.map(name => ({ name, type: integer(64), visibility: 'public' })),
  ];
  const u32 = (digests.length + arrays.reduce((sum, [, n]) => sum + n, 0)) * 8;
  assert.equal(u32 + bytes.length + times.length, words);
  return Object.freeze({ words, target, parameters, u32, u8: bytes.length, u64: times.length });
}
export const NATIVE_PROFILES = Object.freeze({
  capsule: profile(129, 'noir-recursive', ['scope','policy','asset','hub_domain','registry_commitment','context','reserve_commitment','reserve_nullifier'], [['local_capsule_commitments',4],['dependency_capsule_commitments',4]], [], ['settle_before']),
  dependency: profile(50, 'noir-recursive', ['hub_domain','registry_commitment','context','target_context','dependency_capsule_commitment','snapshot_digest'], [], [], ['valid_from','valid_until']),
  ready: profile(98, 'noir-recursive', ['scope','policy','asset','hub_domain','registry_commitment','snapshot_digest','local_commitment','dispatch_id','chain_domain','evidence_policy','action_commitment','payout_commitment'], [], [], ['ready_from','ready_until']),
  node: profile(51, 'noir-recursive', ['hub_domain','registry_commitment','evidence_state','context','payout_commitment','terminal_receipt_tag'], [], ['slot'], ['valid_from','valid_until']),
  admission: profile(42, 'evm', ['hub_domain','registry_commitment','accepted_checkpoint_root','global_effect_id','receipt_commitment'], [], [], ['admission_from','admission_until']),
  aggregate_pair: profile(67, 'noir-recursive', ['hub_domain','registry_commitment','evidence_state','context'], [['payouts',2],['tags',2]], ['pair_index'], ['valid_from','valid_until']),
  aggregate_all: profile(98, 'noir-recursive', ['hub_domain','registry_commitment','evidence_state','context'], [['payouts',4],['tags',4]], [], ['valid_from','valid_until']),
  fulfill: profile(131, 'evm', ['scope','policy','asset','accepted_pool_root','hub_domain','registry_commitment','evidence_state','reserve_nullifier'], [['outputs',4],['terminal_receipt_tags',4]], [], ['settle_before','valid_from','valid_until']),
});
export function nativePaths(mode) {
  assert.ok(Object.hasOwn(NATIVE_PROFILES, mode), 'NATIVE_KEY_FIXED_MODE_REQUIRED');
  const directory = join(ROOT, '.local/development/generic-native', mode);
  return { directory, prepared: join(directory, 'prepared'), program: join(directory, mode + '.json'),
    manifest: join(directory, 'compiled-manifest.json'), circuit: join(ROOT, NATIVE, 'circuits', mode),
    keyPackage: join(ROOT, NATIVE, 'keys', mode) };
}
export const keySettings = mode => {
  nativePaths(mode);
  return { ipaAccumulation: false, oracleHashType: NATIVE_PROFILES[mode].target === 'evm' ? 'keccak' : 'poseidon2',
    disableZk: false, optimizedSolidityVerifier: false };
};
function regular(path) {
  assert.equal(realpathSync(path), resolve(path), 'NATIVE_PIN_SYMLINK');
  assert.ok(lstatSync(path).isFile(), 'NATIVE_PIN_REGULAR_FILE');
  return readFileSync(path);
}
const expectedHash = value => {
  assert.equal(typeof value, 'string', 'NATIVE_PIN_EXPECTED_HASH_REQUIRED');
  assert.match(value, /^[0-9a-f]{64}$/, 'NATIVE_PIN_SHA256_ENCODING');
  return value;
};

/** Exactly the compiler's local Nargo/.nr closure, including every record and
 * byte count. Reject cycles, symlinks and unsupported dependencies outright. */
export function nativeSourceManifest(mode) {
  const files = new Set(), complete = new Set(), visiting = new Set();
  function visit(directory) {
    directory = resolve(directory);
    assert.ok(directory.startsWith(resolve(ROOT) + sep), 'NATIVE_PIN_SOURCE_OUTSIDE_PROJECT');
    assert.equal(realpathSync(directory), directory, 'NATIVE_PIN_PACKAGE_SYMLINK');
    assert.ok(!visiting.has(directory), 'NATIVE_PIN_DEPENDENCY_CYCLE');
    if (complete.has(directory)) return;
    visiting.add(directory);
    const config = join(directory, 'Nargo.toml');
    const configuration = regular(config).toString('utf8');
    files.add(config);
    function walk(path) {
      assert.equal(realpathSync(path), path, 'NATIVE_PIN_SOURCE_SYMLINK');
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        assert.ok(!entry.isSymbolicLink(), 'NATIVE_PIN_SOURCE_SYMLINK');
        const child = join(path, entry.name);
        if (entry.isDirectory()) walk(child);
        else if (entry.isFile() && entry.name.endsWith('.nr')) { regular(child); files.add(child); }
      }
    }
    walk(join(directory, 'src'));
    let dependencies = false;
    for (const original of configuration.split(/\r?\n/)) {
      const line = original.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('[')) {
        assert.ok(!/^\[dependencies\./.test(line), 'NATIVE_PIN_UNSUPPORTED_DEPENDENCY');
        dependencies = line === '[dependencies]'; continue;
      }
      if (!dependencies) continue;
      const parsed = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*\{\s*path\s*=\s*"([^"]+)"\s*\}$/.exec(line);
      assert.ok(parsed, 'NATIVE_PIN_LOCAL_DEPENDENCY_REQUIRED');
      visit(resolve(directory, parsed[2]));
    }
    visiting.delete(directory); complete.add(directory);
  }
  visit(nativePaths(mode).circuit);
  return [...files].sort().map(path => ({ path: relative(ROOT, path).split(sep).join('/'), ...filePin(path) }));
}
export function assertCompiledNative(mode) {
  const paths = nativePaths(mode), profile = NATIVE_PROFILES[mode];
  const manifestBytes = regular(paths.manifest), manifest = JSON.parse(manifestBytes);
  const artifactBytes = regular(paths.program), program = JSON.parse(artifactBytes);
  assert.equal(manifest.relation, mode, 'NATIVE_PIN_COMPILED_MODE');
  assert.equal(manifest.node, process.version, 'NATIVE_PIN_COMPILED_NODE');
  assert.equal(program.noir_version, NOIR_VERSION, 'NATIVE_PIN_EXACT_COMPILER_VERSION');
  assert.equal(manifest.noirVersion, program.noir_version, 'NATIVE_PIN_COMPILER_PROVENANCE');
  assert.equal(manifest.publicWords, profile.words, 'NATIVE_PIN_PUBLIC_WORDS');
  assert.deepEqual(manifest.publicNames, profile.parameters.map(p => p.name), 'NATIVE_PIN_PUBLIC_ORDER');
  assert.deepEqual(program.abi?.parameters?.filter(p => p.visibility === 'public'), profile.parameters, 'NATIVE_PIN_EXACT_PUBLIC_ABI');
  assert.ok(program.abi.return_type === null || program.abi.return_type === undefined, 'NATIVE_PIN_UNEXPECTED_RETURN');
  assert.equal(typeof program.bytecode, 'string', 'NATIVE_PIN_BYTECODE');
  const compressed = Buffer.from(program.bytecode, 'base64');
  assert.equal(compressed.toString('base64'), program.bytecode, 'NATIVE_PIN_BYTECODE_ENCODING');
  assert.ok(compressed.length > 2 && compressed[0] === 31 && compressed[1] === 139, 'NATIVE_PIN_COMPRESSED_ACIR');
  assert.equal(hash(artifactBytes), expectedHash(manifest.programSHA256), 'NATIVE_PIN_COMPILED_FILE');
  assert.equal(hash(compressed), expectedHash(manifest.bytecodeSHA256), 'NATIVE_PIN_BYTECODE_HASH');
  const sources = nativeSourceManifest(mode);
  assert.deepEqual(sources, manifest.source, 'NATIVE_PIN_EXACT_SOURCE_CLOSURE');
  assert.equal(hash(JSON.stringify(sources)), expectedHash(manifest.sourceTreeSHA256), 'NATIVE_PIN_SOURCE_TREE');
  return { paths, profile, manifest, program, compressed, sources, manifestSHA256: hash(manifestBytes) };
}
export function verifyNativeVerifier() {
  const official = regular(join(ROOT, 'experiments/pc5-proof-probe/circuits/recursive_join/src/bb_proof_verification.nr'));
  const installed = regular(join(ROOT, NATIVE, 'recursive-verifier/src/lib.nr'));
  assert.equal(hash(official), OFFICIAL_VERIFIER_SHA256, 'NATIVE_PIN_OFFICIAL_VERIFIER_HASH');
  assert.deepEqual(installed, official, 'NATIVE_PIN_BYTE_EXACT_OFFICIAL_VERIFIER');
  const config = regular(join(ROOT, NATIVE, 'recursive-verifier/Nargo.toml')).toString('utf8');
  assert.match(config, /^name\s*=\s*"bb_honk_verifier"\s*$/m, 'NATIVE_PIN_VERIFIER_PACKAGE_NAME');
  assert.match(config, /^type\s*=\s*"lib"\s*$/m, 'NATIVE_PIN_VERIFIER_PACKAGE_TYPE');
  return { sha256: hash(installed), nargoSHA256: hash(config) };
}
export function validateNativeKeyBytes(mode, bytes, fields, dyadic) {
  const profile = NATIVE_PROFILES[mode]; nativePaths(mode);
  assert.equal(bytes.length, (profile.target === 'noir-recursive' ? 115 : 59) * 32, 'NATIVE_PIN_KEY_SIZE');
  const header = i => BigInt('0x' + bytes.subarray(i * 32, (i + 1) * 32).toString('hex'));
  assert.ok(Number.isSafeInteger(dyadic) && dyadic > 0 && dyadic <= 2097152 && Math.log2(dyadic) % 1 === 0, 'NATIVE_PIN_CIRCUIT_CAPACITY');
  assert.equal(header(0), BigInt(Math.log2(dyadic)), 'NATIVE_PIN_KEY_CIRCUIT_SIZE');
  // bb 5.2 carries eight pairing-point limbs in addition to the Noir public ABI.
  assert.equal(header(1), BigInt(profile.words + 8), 'NATIVE_PIN_KEY_ACTUAL_PUBLIC_COUNT');
  assert.equal(header(2), 5n, 'NATIVE_PIN_KEY_PUBLIC_OFFSET');
  if (profile.target === 'noir-recursive') {
    assert.ok(Array.isArray(fields) && fields.length === 115, 'NATIVE_PIN_FULL_KEY_FIELDS');
    const normalized = fields.map(field => canonicalField(field));
    for (let i = 0; i < 115; i++) assert.equal(BigInt(normalized[i]), header(i), 'NATIVE_PIN_KEY_FIELD_BYTES');
    assert.ok(normalized.slice(3).some(value => value !== '0'), 'NATIVE_PIN_ZERO_KEY');
    return normalized;
  }
  return undefined;
}

/** Expected hashes are explicit review pins. This verifies integrity, not a proof. */
export function validateNativeKey(mode, expected) {
  const compiled = assertCompiledNative(mode), { paths, profile, manifest } = compiled;
  assert.ok(expected && typeof expected === 'object', 'NATIVE_PIN_EXPECTED_PINS_REQUIRED');
  const provenanceBytes = regular(join(paths.prepared, mode + '.key.json'));
  const keyBytes = regular(join(paths.prepared, mode + '.vk'));
  const provenance = JSON.parse(provenanceBytes), verifier = verifyNativeVerifier();
  for (const [name, actual] of Object.entries({ artifactSHA256: manifest.programSHA256,
    bytecodeSHA256: manifest.bytecodeSHA256, sourceTreeSHA256: manifest.sourceTreeSHA256,
    compiledManifestSHA256: compiled.manifestSHA256, provenanceSHA256: hash(provenanceBytes),
    keySHA256: hash(keyBytes), verifierSHA256: verifier.sha256 })) {
    assert.equal(actual, expectedHash(expected[name]), 'NATIVE_PIN_EXPECTED_' + name);
  }
  assert.equal(provenance.format, KEY_FORMAT, 'NATIVE_PIN_FORMAT');
  assert.equal(provenance.classification, KEY_CLASSIFICATION, 'NATIVE_PIN_CLASSIFICATION');
  assert.equal(provenance.phase, 'completed', 'NATIVE_PIN_KEY_NOT_COMPLETED');
  assert.equal(provenance.mode, mode, 'NATIVE_PIN_MODE');
  assert.equal(provenance.target, profile.target, 'NATIVE_PIN_TARGET');
  assert.equal(provenance.publicInputWords, profile.words, 'NATIVE_PIN_PUBLIC_COUNT');
  assert.equal(provenance.actualKeyPublicInputCount, profile.words + 8, 'NATIVE_PIN_ACTUAL_PUBLIC_COUNT');
  assert.equal(provenance.pairingPointPublicInputWords, 8, 'NATIVE_PIN_PAIRING_POINTS');
  assert.equal(provenance.keyBytes, keyBytes.length, 'NATIVE_PIN_KEY_BYTES_PROVENANCE');
  assert.equal(provenance.proofGenerated, false, 'NATIVE_PIN_NOT_PROOF');
  assert.equal(provenance.bbVersion, '5.2.0', 'NATIVE_PIN_BACKEND_VERSION');
  assert.equal(provenance.noirVersion, NOIR_VERSION, 'NATIVE_PIN_NOIR_VERSION');
  assert.equal(provenance.node, process.version, 'NATIVE_PIN_NODE_VERSION');
  assert.deepEqual(provenance.toolchain, verifyToolchain(), 'NATIVE_PIN_TOOLCHAIN');
  assert.deepEqual(provenance.crs, verifyCRS(), 'NATIVE_PIN_CRS');
  assert.deepEqual(provenance.settings, keySettings(mode), 'NATIVE_PIN_SETTINGS');
  assert.deepEqual(provenance.sources, compiled.sources, 'NATIVE_PIN_SOURCES');
  assert.deepEqual(provenance.verifier, verifier, 'NATIVE_PIN_VERIFIER');
  for (const name of ['artifactSHA256','sourceTreeSHA256','compiledManifestSHA256','keySHA256','verifierSHA256'])
    assert.equal(provenance[name], expected[name], 'NATIVE_PIN_PROVENANCE_' + name);
  assert.equal(provenance.circuitSHA256, expected.bytecodeSHA256, 'NATIVE_PIN_PROVENANCE_BYTECODE');
  const keyHash = canonicalField(expected.keyHashField);
  assert.notEqual(keyHash, '0', 'NATIVE_PIN_ZERO_KEY_HASH');
  assert.equal(provenance.keyHashField, keyHash, 'NATIVE_PIN_HASH_FIELD');
  assert.equal(provenance.threads, 1, 'NATIVE_PIN_THREADS');
  assert.equal(provenance.maximumPages, provenance.stats.numGatesDyadic <= 1048576 ? 32768 : 65536, 'NATIVE_PIN_MEMORY_PROFILE');
  const fields = profile.target === 'noir-recursive'
    ? JSON.parse(regular(join(paths.prepared, mode + '.fields.json'))) : undefined;
  const normalized = validateNativeKeyBytes(mode, keyBytes, fields, provenance.stats.numGatesDyadic);
  if (profile.target === 'noir-recursive') {
    assert.equal(provenance.keyFields, 115, 'NATIVE_PIN_FIELD_COUNT');
    assert.equal(provenance.keyDecoder, 'api.vkAsFields', 'NATIVE_PIN_OFFICIAL_DECODER');
    assert.equal(provenance.keyFieldsComparedToSerialized, true, 'NATIVE_PIN_FIELD_COMPARISON');
    assert.equal(provenance.expectedRecursiveProofFields, 458, 'NATIVE_PIN_EXPECTED_PROOF_SHAPE');
    assert.equal(provenance.keyFieldsSHA256, hash(regular(join(paths.prepared, mode + '.fields.json'))), 'NATIVE_PIN_FIELDS_FILE');
  } else {
    const solidity = regular(join(paths.prepared, mode + '.sol'));
    assert.equal(hash(solidity), provenance.soliditySHA256, 'NATIVE_PIN_SOLIDITY');
    assert.equal(solidity.length, provenance.solidityBytes, 'NATIVE_PIN_SOLIDITY_BYTES');
  }
  return { mode, profile, fields: normalized, keyHash, provenance, expected: { ...expected } };
}
export function renderNativePin(checked) {
  const { mode, profile, fields, keyHash, expected } = checked;
  assert.equal(profile.target, 'noir-recursive', 'NATIVE_PIN_RECURSIVE_LIBRARY_ONLY');
  assert.equal(fields.length, 115, 'NATIVE_PIN_RENDER_FULL_KEY');
  const u8End = profile.u32 + profile.u8;
  return {
    nargo: `[package]\nname = "approved_${mode}_key"\ntype = "lib"\nauthors = ["Lianum bounded protocol development"]\n\n[dependencies]\nbb_honk_verifier = { path = "../../recursive-verifier" }\n`,
    source: `// Actual complete ${mode} VK pin; generated only after official key success.\n// Key integrity is not proof acceptance or production activation.\n// ${JSON.stringify(expected)}\npub global VK: [Field; 115] = [\n${fields.map(field => '    ' + field).join(',\n')}\n];\npub global VK_HASH: Field = ${keyHash};\n\npub fn verify(proof: [Field; 458], inputs: [Field; ${profile.words}]) {\n    bb_honk_verifier::verify_honk_proof(VK, proof, inputs, VK_HASH);\n    for i in 0..${profile.u32} {\n        let value = inputs[i] as u32;\n        assert(value as Field == inputs[i]);\n    }\n${profile.u8 ? `    for i in ${profile.u32}..${u8End} {\n        let value = inputs[i] as u8;\n        assert(value as Field == inputs[i]);\n    }\n` : ''}    for i in ${u8End}..${profile.words} {\n        let value = inputs[i] as u64;\n        assert(value as Field == inputs[i]);\n    }\n}\n`,
  };
}
export function installNativePin(mode, expected, { check = false } = {}) {
  const checked = validateNativeKey(mode, expected), paths = nativePaths(mode);
  const rendered = renderNativePin(checked);
  assert.equal(resolve(paths.keyPackage, '../../recursive-verifier'), join(ROOT, NATIVE, 'recursive-verifier'), 'NATIVE_PIN_DEPENDENCY_PATH');
  if (existsSync(paths.keyPackage)) {
    assert.deepEqual(readdirSync(paths.keyPackage).sort(), ['Nargo.toml','src'], 'NATIVE_PIN_EXISTING_PACKAGE_LAYOUT');
    assert.deepEqual(readdirSync(join(paths.keyPackage, 'src')), ['lib.nr'], 'NATIVE_PIN_EXISTING_SOURCE_LAYOUT');
    assert.equal(regular(join(paths.keyPackage, 'Nargo.toml')).toString(), rendered.nargo, 'NATIVE_PIN_EXISTING_PACKAGE_MISMATCH_RETAINED');
    assert.equal(regular(join(paths.keyPackage, 'src/lib.nr')).toString(), rendered.source, 'NATIVE_PIN_EXISTING_KEY_MISMATCH_RETAINED');
    return { changed: false, mode, keySHA256: expected.keySHA256 };
  }
  assert.ok(!check, 'NATIVE_PIN_PACKAGE_MISSING');
  mkdirSync(dirname(paths.keyPackage), { recursive: true });
  const staged = paths.keyPackage + '.staging-' + process.pid + '-' + Date.now();
  mkdirSync(staged); mkdirSync(join(staged, 'src'));
  writeFileSync(join(staged, 'Nargo.toml'), rendered.nargo, { flag: 'wx' });
  writeFileSync(join(staged, 'src/lib.nr'), rendered.source, { flag: 'wx' });
  assert.ok(!existsSync(paths.keyPackage), 'NATIVE_PIN_PACKAGE_APPEARED');
  renameSync(staged, paths.keyPackage);
  return { changed: true, mode, keySHA256: expected.keySHA256 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2); nativePaths(mode);
  const expected = {}, names = new Set(['artifactSHA256','bytecodeSHA256','sourceTreeSHA256','compiledManifestSHA256','provenanceSHA256','keySHA256','verifierSHA256','keyHashField']);
  let check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') { assert.ok(!check, 'NATIVE_PIN_DUPLICATE_CHECK'); check = true; continue; }
    const name = args[i].slice(2);
    assert.ok(args[i].startsWith('--') && names.has(name) && !Object.hasOwn(expected, name), 'NATIVE_PIN_UNKNOWN_OR_DUPLICATE_OPTION');
    assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), 'NATIVE_PIN_EXPECTED_VALUE');
    expected[name] = args[++i];
  }
  console.log(JSON.stringify(installNativePin(mode, expected, { check })));
}
