// Offline integrity gate only. No compiler/backend import, key generation or proof.
// All paths and expected hashes are explicit. Never search for a candidate key.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalField } from './abi.mjs';
import { OFFICIAL_VERIFIER, PROFILE } from './generate.mjs';

export const PIN_PATH = new URL('./lib/src/approved_owner_key.nr', import.meta.url);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hashValue = value => {
  assert.equal(typeof value, 'string', 'PAEG_PIN_EXPECTED_HASH_REQUIRED');
  assert.match(value, /^[0-9a-f]{64}$/, 'PAEG_PIN_SHA256_ENCODING');
  return value;
};
const hashedFile = (path, expected, label) => {
  assert.equal(typeof path, 'string', `PAEG_PIN_${label}_PATH_REQUIRED`);
  assert.ok(lstatSync(path).isFile(), `PAEG_PIN_${label}_REGULAR_FILE`);
  const bytes = readFileSync(path);
  assert.equal(sha256(bytes), hashValue(expected), `PAEG_PIN_${label}_HASH_MISMATCH`);
  return bytes;
};
function inside(root, path) {
  const name = relative(root, path);
  assert.ok(name !== '..' && !name.startsWith('..' + sep) && !isAbsolute(name), 'PAEG_PIN_SOURCE_OUTSIDE_ROOT');
  return name.split(sep).join('/');
}

/** Inventory the complete explicit local Noir dependency closure, including all
 * files under each src/. Only local one-line Nargo dependencies are supported;
 * any other dependency form fails closed instead of silently omitting a source.
 */
export function sourceManifest(sourceRoot, ownerPackage) {
  assert.equal(typeof sourceRoot, 'string', 'PAEG_PIN_SOURCE_ROOT_REQUIRED');
  assert.equal(typeof ownerPackage, 'string', 'PAEG_PIN_OWNER_PACKAGE_REQUIRED');
  const root = realpathSync(sourceRoot);
  const entry = resolve(root, ownerPackage);
  const packages = new Set(), records = new Map();
  function add(path) {
    const name = inside(root, path);
    assert.ok(lstatSync(path).isFile(), 'PAEG_PIN_SOURCE_REGULAR_FILE');
    const bytes = readFileSync(path);
    records.set(name, { path: name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  function sourceDirectory(path) {
    assert.ok(lstatSync(path).isDirectory(), 'PAEG_PIN_SOURCE_DIRECTORY');
    assert.equal(realpathSync(path), path, 'PAEG_PIN_SOURCE_SYMLINK');
    for (const name of readdirSync(path).sort()) {
      const file = resolve(path, name), stat = lstatSync(file);
      assert.ok(!stat.isSymbolicLink(), 'PAEG_PIN_SOURCE_SYMLINK');
      if (stat.isDirectory()) sourceDirectory(file);
      else add(file);
    }
  }
  function visit(path) {
    inside(root, path);
    assert.equal(realpathSync(path), path, 'PAEG_PIN_PACKAGE_SYMLINK');
    if (packages.has(path)) return;
    packages.add(path);
    const configPath = resolve(path, 'Nargo.toml');
    add(configPath);
    sourceDirectory(resolve(path, 'src'));
    let dependencies = false;
    for (const raw of readFileSync(configPath, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('[')) {
        assert.ok(!/^\[dependencies\./.test(line), 'PAEG_PIN_UNSUPPORTED_DEPENDENCY');
        dependencies = line === '[dependencies]';
        continue;
      }
      if (dependencies) {
        const match = /^\w+\s*=\s*\{\s*path\s*=\s*"([^"\n]+)"\s*\}\s*(?:#.*)?$/.exec(line);
        assert.ok(match, 'PAEG_PIN_UNSUPPORTED_DEPENDENCY');
        visit(resolve(path, match[1]));
      }
    }
  }
  visit(entry);
  const files = [...records.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.ok(files.some(file => file.path === inside(root, resolve(entry, 'src/main.nr'))), 'PAEG_PIN_A0_MAIN_MISSING');
  return { format: 'LIANUM_PAEG_A0_SOURCE_MANIFEST_V1', ownerPackage: inside(root, entry), files };
}

export const sourceTreeHash = manifest => sha256(Buffer.from(JSON.stringify(manifest)));
const integer = width => ({ kind: 'integer', sign: 'unsigned', width });
const digest = () => ({ kind: 'array', length: 8, type: integer(32) });
export const OWNER_PUBLIC_ABI = Object.freeze([
  ...['scope', 'policy', 'asset', 'operation_id', 'input_commitment', 'input_nullifier',
    'reservation_intent', 'graph_commitment', 'tree_root', 'reserve_commitment',
    'reserve_nullifier', 'change_commitment'].map(name => ({ name, type: digest(), visibility: 'public' })),
  { name: 'outputs', type: { kind: 'array', length: 4, type: digest() }, visibility: 'public' },
  { name: 'recovery_commitment', type: digest(), visibility: 'public' },
  ...['funding_not_before', 'funding_valid_until', 'settle_before']
    .map(name => ({ name, type: integer(64), visibility: 'public' })),
]);

export function assertOwnerArtifact(program) {
  assert.ok(program && typeof program === 'object', 'PAEG_PIN_ARTIFACT');
  assert.deepEqual(program.abi?.parameters?.filter(parameter => parameter.visibility === 'public'), OWNER_PUBLIC_ABI, 'PAEG_PIN_PUBLIC139_ABI');
  assert.ok(program.abi.return_type === null || program.abi.return_type === undefined, 'PAEG_PIN_UNEXPECTED_RETURN');
  assert.equal(typeof program.bytecode, 'string', 'PAEG_PIN_BYTECODE');
  assert.ok(program.bytecode.length > 0, 'PAEG_PIN_BYTECODE');
  const bytecode = Buffer.from(program.bytecode, 'base64');
  assert.equal(bytecode.toString('base64'), program.bytecode, 'PAEG_PIN_BYTECODE_ENCODING');
  assert.ok(bytecode.length > 2 && bytecode[0] === 31 && bytecode[1] === 139, 'PAEG_PIN_COMPRESSED_ACIR');
  return bytecode;
}

/** Validate complete serialized 32-byte BE fields without initializing bb.js. */
export function validateKeyFields(bytes, fields) {
  assert.equal(bytes.length, 115 * 32, 'PAEG_PIN_VK_BYTES');
  assert.ok(Array.isArray(fields) && fields.length === 115, 'PAEG_PIN_VK_FIELDS');
  const normalized = fields.map(value => canonicalField(value));
  for (let i = 0; i < 115; i++) {
    assert.equal(BigInt(normalized[i]), BigInt('0x' + bytes.subarray(i * 32, (i + 1) * 32).toString('hex')), 'PAEG_PIN_VK_FIELD_BYTES_MISMATCH');
  }
  assert.ok(normalized.some(value => value !== '0'), 'PAEG_PIN_ZERO_VK');
  return normalized;
}

/** Require independently reviewed hashes: this does not recompute a VK or prove
 * the provenance truthful. Actual compilation/key generation is done elsewhere.
 */
export function validateOwnerPin(options) {
  const artifactBytes = hashedFile(options.artifact, options.expectedArtifactSha256, 'ARTIFACT');
  const provenanceBytes = hashedFile(options.provenance, options.expectedProvenanceSha256, 'PROVENANCE');
  const vkBytes = hashedFile(options.vk, options.expectedVkSha256, 'VK');
  const program = JSON.parse(artifactBytes), provenance = JSON.parse(provenanceBytes);
  const bytecode = assertOwnerArtifact(program);
  assert.equal(sha256(bytecode), hashValue(options.expectedBytecodeSha256), 'PAEG_PIN_BYTECODE_HASH_MISMATCH');
  const sources = sourceManifest(options.sourceRoot, options.ownerPackage);
  const sourceSHA256 = sourceTreeHash(sources);
  assert.equal(sourceSHA256, hashValue(options.expectedSourceTreeSha256), 'PAEG_PIN_SOURCE_TREE_MISMATCH');
  const verifier = readFileSync(new URL('./lib/src/bb_proof_verification.nr', import.meta.url));
  assert.equal(sha256(verifier), hashValue(options.expectedVerifierSha256), 'PAEG_PIN_VERIFIER_HASH_MISMATCH');
  assert.deepEqual(verifier, readFileSync(OFFICIAL_VERIFIER), 'PAEG_PIN_OFFICIAL_VERIFIER_MISMATCH');
  const fields = validateKeyFields(vkBytes, JSON.parse(readFileSync(options.vkFields, 'utf8')));
  const keyHash = canonicalField(options.expectedKeyHash);
  assert.notEqual(keyHash, '0', 'PAEG_PIN_ZERO_KEY_HASH');

  assert.equal(provenance.format, 'LIANUM_PAEG_A0_KEY_PROVENANCE_V1', 'PAEG_PIN_PROVENANCE_FORMAT');
  assert.equal(provenance.classification, 'ACTUAL_OFFICIAL_VERIFICATION_KEY_GENERATION_NOT_PROOF', 'PAEG_PIN_PROVENANCE_CLASSIFICATION');
  assert.equal(provenance.phase, 'completed', 'PAEG_PIN_INCOMPLETE_KEY');
  assert.equal(provenance.mode, 'authorization', 'PAEG_PIN_OWNER_MODE');
  assert.equal(provenance.profile, PROFILE, 'PAEG_PIN_OWNER_PROFILE');
  assert.equal(provenance.target, 'noir-recursive', 'PAEG_PIN_TARGET');
  assert.equal(provenance.publicInputWords, 139, 'PAEG_PIN_PUBLIC_COUNT');
  assert.equal(provenance.keyFields, 115, 'PAEG_PIN_KEY_COUNT');
  assert.equal(provenance.keyHashField, keyHash, 'PAEG_PIN_KEY_HASH');
  assert.equal(provenance.keySHA256, options.expectedVkSha256, 'PAEG_PIN_VK_PROVENANCE');
  assert.equal(provenance.artifactSHA256, options.expectedArtifactSha256, 'PAEG_PIN_ARTIFACT_PROVENANCE');
  assert.equal(provenance.circuitSHA256, options.expectedBytecodeSha256, 'PAEG_PIN_BYTECODE_PROVENANCE');
  assert.equal(provenance.sourceTreeSHA256, sourceSHA256, 'PAEG_PIN_SOURCE_PROVENANCE');
  assert.deepEqual(provenance.sources, sources, 'PAEG_PIN_SOURCE_MANIFEST_PROVENANCE');
  assert.equal(provenance.verifierSHA256, options.expectedVerifierSha256, 'PAEG_PIN_VERIFIER_PROVENANCE');
  assert.equal(provenance.noirVersion, program.noir_version, 'PAEG_PIN_COMPILER_PROVENANCE');
  assert.ok(typeof provenance.noirVersion === 'string' && provenance.noirVersion.length > 0, 'PAEG_PIN_COMPILER_VERSION');
  assert.ok(typeof provenance.bbVersion === 'string' && provenance.bbVersion.length > 0, 'PAEG_PIN_BACKEND_VERSION');
  assert.equal(provenance.keyDecoder, 'api.vkAsFields', 'PAEG_PIN_OFFICIAL_FIELD_DECODER');
  assert.equal(provenance.keyFieldsComparedToSerialized, true, 'PAEG_PIN_OFFICIAL_FIELD_COMPARISON');
  assert.deepEqual(provenance.settings, {
    ipaAccumulation: false, oracleHashType: 'poseidon2', disableZk: false, optimizedSolidityVerifier: false,
  }, 'PAEG_PIN_RECURSIVE_ZK_SETTINGS');
  return { fields, keyHash, sources, sourceSHA256, artifactSHA256: options.expectedArtifactSha256,
    bytecodeSHA256: options.expectedBytecodeSha256, vkSHA256: options.expectedVkSha256,
    provenanceSHA256: options.expectedProvenanceSha256, verifierSHA256: options.expectedVerifierSha256 };
}

function renderPin(checked) {
  const { fields, keyHash, ...audit } = checked;
  return `// Generated only by pin-owner-key.mjs after explicit actual artifact checks.
// Exact full A0 key pin. This integrity record is not proof acceptance evidence.
// ${JSON.stringify(audit)}
pub global OWNER_VK: [Field; 115] = [
${fields.map(field => `    ${field}`).join(',\n')}
];
pub global OWNER_VK_HASH: Field = ${keyHash};
`;
}

export function installOwnerPin(options) {
  const checked = validateOwnerPin(options), source = renderPin(checked);
  if (existsSync(PIN_PATH)) {
    const existing = readFileSync(PIN_PATH, 'utf8');
    if (existing === source) return { ...checked, changed: false };
    assert.ok(!options.check, 'PAEG_PIN_EXISTING_SOURCE_MISMATCH');
    assert.equal(sha256(existing), hashValue(options.replaceExistingSha256), 'PAEG_PIN_REPLACEMENT_REQUIRES_EXISTING_HASH');
  } else assert.ok(!options.check, 'PAEG_OWNER_KEY_PIN_MISSING');
  // One write, only after every artifact/provenance/source/field check above.
  writeFileSync(PIN_PATH, source);
  return { ...checked, changed: true };
}

function parseOptions(argv) {
  const options = {};
  const flags = new Set(['artifact', 'provenance', 'vk', 'vk-fields', 'source-root', 'owner-package',
    'expected-artifact-sha256', 'expected-provenance-sha256', 'expected-vk-sha256',
    'expected-bytecode-sha256', 'expected-source-tree-sha256', 'expected-verifier-sha256',
    'expected-key-hash', 'replace-existing-sha256']);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i].replace(/^--/, '');
    if (flag === 'check') { options.check = true; continue; }
    assert.ok(argv[i].startsWith('--') && flags.has(flag), `PAEG_PIN_UNKNOWN_OPTION: ${argv[i]}`);
    const key = flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    assert.ok(!(key in options) && argv[i + 1] && !argv[i + 1].startsWith('--'), 'PAEG_PIN_OPTION_VALUE');
    options[key] = argv[++i];
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--manifest') {
    assert.equal(args.length, 3, 'Usage: --manifest SOURCE_ROOT OWNER_PACKAGE');
    const manifest = sourceManifest(args[1], args[2]);
    console.log(JSON.stringify({ sourceTreeSHA256: sourceTreeHash(manifest), sources: manifest }, null, 2));
  } else {
    assert.ok(args.length > 0, 'PAEG_OWNER_KEY_PIN_MISSING: supply actual artifacts and independently reviewed expected hashes');
    const result = installOwnerPin(parseOptions(args));
    console.log(JSON.stringify({ classification: 'ACTUAL_A0_PIN_INTEGRITY_CHECK_NOT_PROOF', changed: result.changed,
      vkSHA256: result.vkSHA256, sourceTreeSHA256: result.sourceSHA256 }));
  }
}
