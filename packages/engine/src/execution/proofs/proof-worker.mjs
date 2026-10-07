import { assertBeginPayoutAuditLegacyJobV1 } from '../../../../proofs/src/jobs/native-flow-proof-scope-v1.mjs';
/** Fixed, offline proof worker. This is a role-bound process capability,
 * never an HTTP handler. One request, one official Wasm backend, then exit.
 * Exact circuit witnesses cross the private pipe; signing keys never do.
 * Local process separation does not establish independent or noncolluding roles.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { filePin, hash, verifyToolchain, verifyCRS, CRS, TOOLCHAIN_AUDIT_SHA256 } from '../../../../../experiments/engine/private-core-proof/wallet-notes/resources.mjs';
import { validateOwnerPin, sourceManifest, sourceTreeHash, assertOwnerArtifact } from '../../../../../experiments/engine/private-core-proof/generic-wrappers/pin-owner-key.mjs';
import { FIELD_MODULUS, PUBLIC_ABI } from '../../../../../experiments/engine/private-core-proof/generic-wrappers/abi.mjs';
import { assertWalletStatement } from '../../wallet/notes/private-wallet-note-encoding.mjs';
import { initializePrivateVerifierCRS } from '../../crypto/private-verifier-crs.mjs';
import { NATIVE_PROFILES, nativePaths, validateNativeKey, renderNativePin } from '../../../../../experiments/engine/private-core-proof/generic-native/pin-key.mjs';
import { NATIVE_PROOF_PINS } from './native-proof-pins.mjs';

export const PROOF_PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PROOF_PROTOCOL = 'LIANUM_PRIVATE_PROOF_PROCESS_V1';
export const PROOF_MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
export const PROOF_DEFAULT_MODES = Object.freeze(['authorization', 'reserve', 'refund', 'deposit_balance', 'withdraw_balance']);
export const PROOF_MODES = Object.freeze([...PROOF_DEFAULT_MODES, ...Object.keys(NATIVE_PROFILES)]);
export const PROOF_PUBLIC_WORDS = Object.freeze({ authorization: 139, reserve: 66, refund: 51, deposit_balance: 26, withdraw_balance: 39,
  ...Object.fromEntries(Object.entries(NATIVE_PROFILES).map(([mode, definition]) => [mode, definition.words])) });
const provingRoles = Object.freeze({
  owner: Object.freeze(['authorization', 'capsule', 'deposit_balance', 'withdraw_balance']),
  coordinator: Object.freeze(['reserve', 'refund']),
  dependency: Object.freeze(['dependency']), ready: Object.freeze(['ready']), receipt: Object.freeze(['admission']),
  node: Object.freeze(['node']), assembler: Object.freeze(['aggregate_pair', 'aggregate_all', 'fulfill']),
  recipient: Object.freeze(['withdraw_balance']),
});
export const PROOF_PURPOSES = Object.freeze(Object.keys(provingRoles));
export function proofRoleAllows(purpose, operation, mode) {
  if (!PROOF_PURPOSES.includes(purpose) || !PROOF_MODES.includes(mode) || !['prove', 'verify'].includes(operation)) return false;
  if (operation === 'prove') return provingRoles[purpose].includes(mode);
  if (purpose === 'coordinator') return true;
  if (purpose === 'owner') return [...PROOF_DEFAULT_MODES, 'capsule'].includes(mode);
  return provingRoles[purpose].includes(mode);
}
export function assertProofRole(purpose, operation, mode) {
  need(PROOF_PURPOSES.includes(purpose), 'PAEG_PROOF_PURPOSE');
  need(['prove', 'verify'].includes(operation), 'PAEG_PROOF_OPERATION');
  need(PROOF_MODES.includes(mode), 'PAEG_PROOF_MODE');
  if (operation === 'prove' && ['authorization', 'capsule'].includes(mode))
    need(purpose === 'owner', 'PAEG_PROOF_OWNER_CAPABILITY_REQUIRED');
  need(proofRoleAllows(purpose, operation, mode), 'PAEG_PROOF_ROLE_MODE');
}
const recursiveMode = mode => mode === 'authorization' || NATIVE_PROFILES[mode]?.target === 'noir-recursive';
const experiment = join(PROOF_PROJECT_ROOT, 'experiments/private-core-proof');
const profile = 'LIANUM_PAEG_FUNDED_4_V1';
const pins = Object.freeze({
  authorization: { keyReport: 'f06a93476466110b617f4003657fbc8341ad6f9676268b567f58c87eb2ae618f', compiled: '9176960b7934e829820f6c8e35adad0f75734ac0ef332adc8eacc76b7656b8b1' },
  reserve: { keyReport: 'd1301327de9d657d82f82b2f59dfdefcef87f39a9a425aba5c9148459fe3fb13', compiled: 'a4910ef8c7b86bf3f4407a231c0c95b6eb84a2a8f694fa29eb5cdcbfb91f08f7' },
  refund: { keyReport: 'c2e94c1a153cee26ce7b4547a3c1b57cd7730ed9400b86cf73ae9f07712ac8bb', compiled: '75014082684a738a1241fe888e61386dca5f1b533ccd780a98ad8ef8f043724d' },
  deposit_balance: { keyReport: '7aa7dacf33baec14b1d98bb48a0bdeb6115c1204b42bd970e87a5c8c23a8630e' },
  withdraw_balance: { keyReport: 'b155829f4a17d17ad516074d0e0a896fdc1f6f35ef0a129bdee9f936850744da' },
});
export const proofError = code => Object.assign(new Error(code), { code });
export function need(condition, code) { if (!condition) throw proofError(code); }
export function exactObject(value, keys) {
  need(value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'PAEG_PROOF_EXACT_FIELDS');
}
export function encodeProofMessage(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > PROOF_MAX_MESSAGE_BYTES) { bytes.fill(0); throw proofError('PAEG_PROOF_MESSAGE_SIZE'); }
  return bytes;
}
export function decodeProofMessage(bytes) {
  need(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= PROOF_MAX_MESSAGE_BYTES, 'PAEG_PROOF_MESSAGE_SIZE');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  finally { bytes.fill(0); }
}
export function wipePrivate(value) {
  if (value instanceof Uint8Array) value.fill(0);
  else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) { wipePrivate(value[key]); value[key] = null; }
  }
  // JS immutable strings cannot be reliably zeroized. Drop all owned references;
  // process exit reclaims remaining engine copies. Never promise perfect erasure.
}
const readPinnedJSON = (path, sha256) => {
  const bytes = readFileSync(path); need(hash(bytes) === sha256, 'PAEG_PROOF_FILE_PIN'); return JSON.parse(bytes);
};
const scalar = value => {
  need((typeof value === 'string' && /^(?:0|[1-9][0-9]*|0x[0-9a-fA-F]+)$/.test(value) && value.length <= 80)
    || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0), 'PAEG_PROOF_FIELD_ENCODING');
  const number = BigInt(value); need(number >= 0n && number < FIELD_MODULUS, 'PAEG_PROOF_FIELD_RANGE'); return number.toString();
};
export function normalizePublicInputs(mode, inputs) {
  need(PROOF_MODES.includes(mode), 'PAEG_PROOF_MODE');
  need(Array.isArray(inputs) && inputs.length === PROOF_PUBLIC_WORDS[mode], 'PAEG_PROOF_PUBLIC_COUNT');
  const result = inputs.map(scalar);
  if (mode === 'deposit_balance' || mode === 'withdraw_balance') assertWalletStatement(mode, result);
  else if (Object.hasOwn(NATIVE_PROFILES, mode)) {
    const definition = NATIVE_PROFILES[mode];
    result.forEach((word, index) => {
      const width = index < definition.u32 ? 32n : index < definition.u32 + definition.u8 ? 8n : 64n;
      need(BigInt(word) < (1n << width), 'PAEG_PROOF_PUBLIC_RANGE');
    });
  }
  else {
    const digestEnd = mode === 'authorization' ? 136 : mode === 'reserve' ? 64 : 48;
    result.forEach((word, index) => need(BigInt(word) < (1n << (index < digestEnd ? 32n : 64n)), 'PAEG_PROOF_PUBLIC_RANGE'));
  }
  return result;
}
export function assertExpectedInputs(mode, actual, expected) {
  const words = normalizePublicInputs(mode, actual), wanted = normalizePublicInputs(mode, expected);
  need(words.every((word, index) => word === wanted[index]), 'PAEG_PROOF_PUBLIC_INPUT_MISMATCH');
  return words;
}
// Use explicit 32-byte hex at the bb.js boundary. The private facade returns
// canonical decimal fields for Noir recursive wrapper composition.
const verifierInputs = values => values.map(value => '0x' + BigInt(value).toString(16).padStart(64, '0'));
const publicABI = mode => PUBLIC_ABI[mode].map(([name, count]) => ({ name, visibility: 'public',
  type: count === 8 ? { kind: 'array', length: 8, type: { kind: 'integer', sign: 'unsigned', width: 32 } }
    : { kind: 'integer', sign: 'unsigned', width: 64 } }));

/** Read-only integrity validation. Importing this module never starts bb.js. */
export function loadProofProfile(mode) {
  need(PROOF_MODES.includes(mode), 'PAEG_PROOF_MODE');
  if (Object.hasOwn(NATIVE_PROFILES, mode)) return loadNativeProofProfile(mode);
  const legacy = mode === 'deposit_balance' || mode === 'withdraw_balance';
  const directory = legacy ? join(experiment, 'wallet-notes/.local') : mode === 'authorization'
    ? join(PROOF_PROJECT_ROOT, '.local/development/generic-funding')
    : join(PROOF_PROJECT_ROOT, '.local/development/generic-wrappers', mode);
  const prepared = join(directory, 'prepared'), report = readPinnedJSON(join(prepared, mode + '.key.json'), pins[mode].keyReport);
  const programPath = join(directory, ...(legacy ? ['compiled'] : []), mode + '.json');
  const artifactSHA256 = legacy ? report.compiledFileSHA256 : report.artifactSHA256;
  const program = readPinnedJSON(programPath, artifactSHA256), key = readFileSync(join(prepared, mode + '.vk'));
  const target = mode === 'authorization' ? 'noir-recursive' : 'evm';
  need(report.phase === 'completed' && report.mode === mode && report.target === target, 'PAEG_PROOF_KEY_PROFILE');
  need(report.maximumPages === 32768 && report.toolchain.auditSHA256 === TOOLCHAIN_AUDIT_SHA256, 'PAEG_PROOF_TOOLCHAIN_PIN');
  need(hash(key) === report.keySHA256 && key.length === report.keyBytes, 'PAEG_PROOF_KEY_PIN');
  need(hash(Buffer.from(program.bytecode, 'base64')) === report.circuitSHA256, 'PAEG_PROOF_CIRCUIT_PIN');
  need(report.publicInputWords === PROOF_PUBLIC_WORDS[mode], 'PAEG_PROOF_PUBLIC_ABI');
  let vkFields, ownerPin, hostSourceRecords;
  if (legacy) {
    filePin(join(experiment, 'wallet-notes/circuits', mode, 'src/main.nr'), { sha256: report.sourceSHA256 });
    need(report.zeroKnowledgeEnabled === true, 'PAEG_PROOF_ZK_REQUIRED');
  } else {
    need(report.profile === profile && report.bbVersion === '5.2.0' && report.threads === 1
      && report.noirVersion === program.noir_version && report.stats.numGatesDyadic === 1048576, 'PAEG_PROOF_KEY_PROFILE');
    const compiled = readPinnedJSON(join(directory, 'compiled-manifest.json'), pins[mode].compiled);
    need(compiled.programSHA256 === artifactSHA256 && compiled.bytecodeSHA256 === report.circuitSHA256, 'PAEG_PROOF_COMPILE_PIN');
    // The compile record also inventories fixture/host scripts. Key generation
    // binds the complete Noir dependency closure; fixture edits are not ACIR.
    for (const source of compiled.source.filter(record => /\.(nr|toml)$/.test(record.path))) filePin(join(PROOF_PROJECT_ROOT, source.path), source);
    hostSourceRecords = compiled.source.filter(record => !/\.(nr|toml)$/.test(record.path)).map(record => ({
      path: record.path, compileSHA256: record.sha256, currentSHA256: filePin(join(PROOF_PROJECT_ROOT, record.path)).sha256,
    }));
    const options = readPinnedJSON(join(PROOF_PROJECT_ROOT, '.local/development/generic-funding/owner-pin-options.json'),
      'ac9dea8dc8cf534187c7373769b4e1a9118e94204d375ae6bb956358d447da8d');
    ownerPin = validateOwnerPin(options);
    assert.deepEqual(report.settings, { ipaAccumulation: false, oracleHashType: target === 'evm' ? 'keccak' : 'poseidon2', disableZk: false, optimizedSolidityVerifier: false }, 'PAEG_PROOF_ZK_SETTINGS');
    if (mode === 'authorization') {
      assertOwnerArtifact(program);
      need(sourceTreeHash(sourceManifest(PROOF_PROJECT_ROOT, options.ownerPackage)) === report.sourceTreeSHA256, 'PAEG_PROOF_SOURCE_TREE');
      vkFields = ownerPin.fields;
    } else {
      assert.deepEqual(program.abi.parameters.filter(item => item.visibility === 'public'), publicABI(mode), 'PAEG_PROOF_WRAPPER_ABI');
      need(program.abi.return_type == null && compiled.publicWords === PROOF_PUBLIC_WORDS[mode], 'PAEG_PROOF_WRAPPER_ABI');
      const sources = compiled.source.filter(source => /\.(nr|toml)$/.test(source.path));
      assert.deepEqual(report.sources, sources, 'PAEG_PROOF_SOURCE_MANIFEST');
      need(hash(JSON.stringify(sources)) === report.sourceTreeSHA256, 'PAEG_PROOF_SOURCE_TREE');
      const closure = new Map();
      for (const wrapper of ['reserve', 'refund']) {
        for (const record of sourceManifest(PROOF_PROJECT_ROOT, `experiments/private-core-proof/generic-wrappers/circuits/${wrapper}`).files) {
          closure.set(record.path, { path: record.path, sha256: record.sha256 });
        }
      }
      assert.deepEqual([...closure.values()].sort((a, b) => a.path.localeCompare(b.path)),
        [...sources].sort((a, b) => a.path.localeCompare(b.path)), 'PAEG_PROOF_COMPLETE_SOURCE_CLOSURE');
      need(report.ownerVerificationKeySHA256 === ownerPin.vkSHA256 && report.ownerSourceTreeSHA256 === ownerPin.sourceSHA256, 'PAEG_PROOF_OWNER_KEY_PIN');
      // The compiled wrapper pins a literal full owner VK, not a caller hash.
      const literal = readFileSync(join(experiment, 'generic-wrappers/lib/src/approved_owner_key.nr'), 'utf8');
      const fields = /OWNER_VK:\s*\[Field;\s*115\]\s*=\s*\[([\s\S]*?)\];/.exec(literal)?.[1].split(',').map(value => value.trim()).filter(Boolean);
      assert.deepEqual(fields, ownerPin.fields, 'PAEG_PROOF_LITERAL_OWNER_VK');
      need(literal.includes(`OWNER_VK_HASH: Field = ${ownerPin.keyHash};`), 'PAEG_PROOF_LITERAL_OWNER_HASH');
    }
  }
  if (target === 'evm') filePin(join(prepared, mode + '.sol'), { sha256: report.soliditySHA256, bytes: report.solidityBytes });
  const publicPins = { mode, target, statementWords: PROOF_PUBLIC_WORDS[mode], keySHA256: report.keySHA256,
    provenanceSHA256: pins[mode].keyReport, artifactSHA256, compiledFileSHA256: artifactSHA256,
    circuitSHA256: report.circuitSHA256, sourceTreeSHA256: report.sourceTreeSHA256 ?? report.sourceSHA256,
    ...(report.soliditySHA256 ? { soliditySHA256: report.soliditySHA256 } : {}),
    ...(ownerPin ? { ownerVerificationKeySHA256: ownerPin.vkSHA256 } : {}),
    ...(hostSourceRecords ? { hostSourceRecords } : {}) };
  return { program, key, vkFields, target, legacy, maximumPages: 32768, publicPins };
}

function loadNativeProofProfile(mode) {
  need(Object.hasOwn(NATIVE_PROOF_PINS, mode), 'PAEG_PROOF_NATIVE_PROFILE_DISABLED');
  const names = ['artifactSHA256', 'bytecodeSHA256', 'sourceTreeSHA256', 'compiledManifestSHA256',
    'provenanceSHA256', 'keySHA256', 'verifierSHA256', 'keyHashField'];
  exactObject(NATIVE_PROOF_PINS[mode], names);
  // Keep the installation renderer's comment ordering independent of the
  // order used by a reviewer when writing the literal JS pin record.
  const expected = Object.fromEntries(names.map(name => [name, NATIVE_PROOF_PINS[mode][name]]));
  // Validates exact ABI, complete local source closure, official raw helper,
  // actual key/header/fields, compiled/provenance hashes, toolchain and full CRS.
  const checked = validateNativeKey(mode, expected), paths = nativePaths(mode);
  const { provenance, profile: definition } = checked;
  const program = readPinnedJSON(paths.program, expected.artifactSHA256);
  const key = readFileSync(join(paths.prepared, mode + '.vk'));
  need(hash(key) === expected.keySHA256, 'PAEG_PROOF_KEY_PIN');
  if (definition.target === 'noir-recursive') {
    const rendered = renderNativePin(checked);
    need(readFileSync(join(paths.keyPackage, 'Nargo.toml'), 'utf8') === rendered.nargo
      && readFileSync(join(paths.keyPackage, 'src/lib.nr'), 'utf8') === rendered.source, 'PAEG_PROOF_NATIVE_LITERAL_KEY');
  }
  const maximumPages = provenance.maximumPages;
  need(maximumPages === (provenance.stats.numGatesDyadic <= 1048576 ? 32768 : 65536), 'PAEG_PROOF_NATIVE_MEMORY_PROFILE');
  const publicPins = { mode, target: definition.target, statementWords: definition.words, maximumPages,
    dyadicGates: provenance.stats.numGatesDyadic, keySHA256: expected.keySHA256, provenanceSHA256: expected.provenanceSHA256,
    artifactSHA256: expected.artifactSHA256, compiledFileSHA256: expected.artifactSHA256,
    compiledManifestSHA256: expected.compiledManifestSHA256, circuitSHA256: expected.bytecodeSHA256,
    sourceTreeSHA256: expected.sourceTreeSHA256, verifierSHA256: expected.verifierSHA256,
    ...(provenance.soliditySHA256 ? { soliditySHA256: provenance.soliditySHA256 } : {}) };
  return { program, key, vkFields: checked.fields?.slice(), target: definition.target, legacy: false, maximumPages, publicPins };
}

// The pinned ABI is the only accepted witness shape, including nested structs.
// In particular, an opening's public key and secret are not a signing key.
function normalizeABI(type, value) {
  if (type.kind === 'array') {
    need(Array.isArray(value) && value.length === type.length, 'PAEG_PROOF_WITNESS_SHAPE');
    return value.map(item => normalizeABI(type.type, item));
  }
  if (type.kind === 'struct') {
    exactObject(value, type.fields.map(field => field.name));
    return Object.fromEntries(type.fields.map(field => [field.name, normalizeABI(field.type, value[field.name])]));
  }
  if (type.kind === 'boolean') {
    need(typeof value === 'boolean', 'PAEG_PROOF_WITNESS_BOOLEAN'); return value;
  }
  need(type.kind === 'integer' || type.kind === 'field', 'PAEG_PROOF_UNSUPPORTED_ABI');
  const result = scalar(value);
  if (type.kind === 'integer') need(type.sign === 'unsigned' && BigInt(result) < (1n << BigInt(type.width)), 'PAEG_PROOF_WITNESS_RANGE');
  return result;
}
export function normalizeProofWitness(program, input) {
  const parameters = program.abi.parameters;
  exactObject(input, parameters.map(parameter => parameter.name));
  return Object.fromEntries(parameters.map(parameter => [parameter.name, normalizeABI(parameter.type, input[parameter.name])]));
}
export function publicInputsFromWitness(program, input) {
  return program.abi.parameters.filter(parameter => parameter.visibility === 'public').flatMap(parameter => [input[parameter.name]].flat(Infinity));
}
export function encodePrivateProof(mode, proof) {
  need(PROOF_MODES.includes(mode), 'PAEG_PROOF_MODE');
  need(proof && proof.proof instanceof Uint8Array && proof.proof.length > 0 && proof.proof.length <= 2 * 1024 * 1024, 'PAEG_PROOF_BYTES');
  const result = { proof: Buffer.from(proof.proof).toString('base64'), publicInputs: normalizePublicInputs(mode, proof.publicInputs) };
  if (recursiveMode(mode)) {
    for (const [name, length] of [['proofFields', 458], ['vkFields', 115]]) {
      need(Array.isArray(proof[name]) && proof[name].length === length, 'PAEG_PROOF_RECURSIVE_FIELDS');
      result[name] = proof[name].map(scalar);
    }
  }
  return result;
}
export function decodePrivateProof(mode, value) {
  need(PROOF_MODES.includes(mode), 'PAEG_PROOF_MODE');
  exactObject(value, ['proof', 'publicInputs', ...(recursiveMode(mode) ? ['proofFields', 'vkFields'] : [])]);
  need(typeof value.proof === 'string' && value.proof.length > 0 && value.proof.length <= 2800000, 'PAEG_PROOF_BYTES');
  const proof = Buffer.from(value.proof, 'base64');
  need(proof.toString('base64') === value.proof && proof.length <= 2 * 1024 * 1024, 'PAEG_PROOF_BYTES');
  const result = { proof, publicInputs: normalizePublicInputs(mode, value.publicInputs) };
  if (recursiveMode(mode)) {
    for (const [name, length] of [['proofFields', 458], ['vkFields', 115]]) {
      need(Array.isArray(value[name]) && value[name].length === length, 'PAEG_PROOF_RECURSIVE_FIELDS');
      result[name] = value[name].map(scalar);
    }
  }
  return result;
}

async function execute(request, phase) {
  exactObject(request, ['protocol', 'purpose', 'operation', 'mode', 'input', 'expectedPublicInputs', 'label']);
  need(request.protocol === PROOF_PROTOCOL, 'PAEG_PROOF_PROTOCOL');
  assertProofRole(request.purpose, request.operation, request.mode);
  need(typeof request.label === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(request.label), 'PAEG_PROOF_LABEL');
  await phase('checking-pins');
  const loaded = loadProofProfile(request.mode), expected = normalizePublicInputs(request.mode, request.expectedPublicInputs);
  const toolchain = verifyToolchain(), crs = verifyCRS();
  let witness, rawWitness, input, api, proof;
  globalThis.fetch = async () => { throw proofError('PAEG_PROOF_OFFLINE_REQUIRED'); };
  const metrics = { ...loaded.publicPins, zeroKnowledgeEnabled: true, maximumPages: loaded.maximumPages, threads: 1, toolchain, crs };
  try {
    if (request.operation === 'prove') {
      input = normalizeProofWitness(loaded.program, request.input);
      assertExpectedInputs(request.mode, publicInputsFromWitness(loaded.program, input), expected);
    } else {
      proof = decodePrivateProof(request.mode, request.input);
      assertExpectedInputs(request.mode, proof.publicInputs, expected);
      metrics.proofSHA256 = hash(proof.proof); metrics.publicInputsSHA256 = hash(JSON.stringify(proof.publicInputs));
      metrics.proofBytes = proof.proof.length; metrics.publicInputCount = proof.publicInputs.length;
    }
    if (loaded.legacy) {
      // Historical module performs its own exact pins, official CRS and verifier.
      // Parent remains the external 250 ms watchdog and owns this entire child.
      await phase(request.operation === 'prove' ? 'legacy-proof-and-self-verification' : 'legacy-independent-verification');
      const { proveWallet, verifyWallet } = await import('../../../../../experiments/engine/private-core-proof/wallet-notes/prover.mjs');
      if (request.operation === 'prove') proof = await proveWallet(request.mode, input, request.label);
      else return { verified: (await verifyWallet(request.mode, { ...proof, publicInputs: verifierInputs(proof.publicInputs) }, request.label)).verified, metrics };
    } else {
      await phase('initializing-official-wasm');
      const require = createRequire(join(experiment, 'package.json'));
      const { Noir } = await import(pathToFileURL(require.resolve('@noir-lang/noir_js')));
      const { Barretenberg, BackendType, UltraHonkVerifierBackend, BN254_G1_GENERATOR, deflattenFields } = await import(pathToFileURL(require.resolve('@aztec/bb.js')));
      api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: loaded.maximumPages } });
      await phase(request.operation === 'prove' ? 'initializing-pinned-proving-crs' : 'initializing-pinned-verifier-crs');
      if (request.operation === 'verify') metrics.verifierCRS = await initializePrivateVerifierCRS(api, BN254_G1_GENERATOR, readFileSync(CRS + 'bn254_g2.dat'));
      else await api.srsInitSrs({ pointsBuf: readFileSync(CRS + 'bn254_g1_compressed.dat'), numPoints: crs.points, g2Point: readFileSync(CRS + 'bn254_g2.dat') });
      if (request.operation === 'prove') {
        await phase('private-witness-in-memory');
        let began = performance.now(); ({ witness } = await new Noir(loaded.program).execute(input));
        metrics.witnessMilliseconds = performance.now() - began;
        wipePrivate(input); input = null; wipePrivate(request.input); request.input = null;
        await phase('actual-proof-generation'); began = performance.now();
        // Same official API used by UltraHonkBackend.generateProof, supplying
        // the already prepared VK instead of its empty-key fallback. Never call
        // circuitComputeVk or export/rewrite a key during an operation.
        rawWitness = gunzipSync(witness);
        const generated = await api.circuitProve({ witness: rawWitness,
          circuit: { name: request.mode, bytecode: gunzipSync(Buffer.from(loaded.program.bytecode, 'base64')), verificationKey: loaded.key },
          settings: { ipaAccumulation: false, oracleHashType: loaded.target === 'evm' ? 'keccak' : 'poseidon2', disableZk: false, optimizedSolidityVerifier: false } });
        proof = { proof: Buffer.concat(generated.proof.map(field => Buffer.from(field))),
          publicInputs: generated.publicInputs.map(field => '0x' + Buffer.from(field).toString('hex')) };
        rawWitness.fill(0); rawWitness = null;
        metrics.proofMilliseconds = performance.now() - began;
        witness.fill(0); witness = null;
      }
      assertExpectedInputs(request.mode, proof.publicInputs, expected);
      if (recursiveMode(request.mode)) {
        const proofFields = deflattenFields(proof.proof).map(scalar);
        need(proofFields.length === 458, 'PAEG_PROOF_RECURSIVE_FIELDS');
        if (request.operation === 'verify') {
          assert.deepEqual(proof.vkFields.map(scalar), loaded.vkFields, 'PAEG_PROOF_RECURSIVE_KEY');
          assert.deepEqual(proof.proofFields.map(scalar), proofFields, 'PAEG_PROOF_RECURSIVE_BYTES');
        }
        proof = { ...proof, proofFields, vkFields: loaded.vkFields };
      }
      await phase('actual-pinned-verification'); const began = performance.now();
      metrics.verified = await new UltraHonkVerifierBackend(api).verifyProof({ proof: proof.proof, publicInputs: verifierInputs(proof.publicInputs), verificationKey: loaded.key }, { verifierTarget: loaded.target });
      metrics.verificationMilliseconds = performance.now() - began;
      if (request.operation === 'verify') return { verified: metrics.verified, metrics };
      need(metrics.verified === true, 'PAEG_PROOF_SELF_VERIFICATION_FAILED');
    }
    proof.publicInputs = assertExpectedInputs(request.mode, proof.publicInputs, expected);
    metrics.verified = true;
    metrics.proofSHA256 = hash(proof.proof); metrics.publicInputsSHA256 = hash(JSON.stringify(proof.publicInputs));
    metrics.proofBytes = proof.proof.length; metrics.publicInputCount = proof.publicInputs.length;
    return { proofPackage: encodePrivateProof(request.mode, proof), metrics };
  } finally {
    witness?.fill(0); rawWitness?.fill(0); wipePrivate(input); wipePrivate(request.input);
    if (api) await api.destroy();
  }
}

function send(value) {
  return new Promise((resolve, reject) => {
    const bytes = encodeProofMessage(value);
    process.send(bytes, error => { bytes.fill(0); error ? reject(error) : resolve(); });
  });
}
export async function runProofWorker() {
  need(typeof process.send === 'function' && process.connected, 'PAEG_PROOF_PRIVATE_IPC_REQUIRED');
  let accepted = false, sequence = 0, pendingAck;
  const terminate = () => process.exit(2);
  process.once('disconnect', terminate);
  process.on('message', async bytes => {
    let request;
    try {
      request = decodeProofMessage(bytes);
      if (accepted) {
        exactObject(request, ['event', 'sequence']);
        need(request.event === 'phase-persisted' && request.sequence === sequence && pendingAck, 'PAEG_PROOF_ONE_REQUEST');
        const resolve = pendingAck; pendingAck = null; resolve(); return;
      }
      accepted = true;
      const phase = async stage => {
        const ack = new Promise(resolve => { pendingAck = resolve; });
        await send({ event: 'phase', sequence: ++sequence, stage });
        await ack;
      };
      assertBeginPayoutAuditLegacyJobV1(request.purpose, request.operation, request.mode);
      const result = await execute(request, phase);
      await send({ event: 'result', result });
      // Only proof packages and requests carry private material. Metrics are
      // public hashes/provenance and can reference immutable shared constants;
      // mutating those after a successful verification would turn it into a
      // spurious child failure before the required clean exit.
      wipePrivate(result.proofPackage); wipePrivate(request);
      process.removeListener('disconnect', terminate);
      process.disconnect(); process.exit(0);
    } catch (error) {
      wipePrivate(request);
      const code = /^PAEG_PROOF_[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'PAEG_PROOF_TOOLCHAIN_OR_CONSTRAINT_FAILURE';
      await send({ event: 'failure', code }).catch(() => {});
      process.removeListener('disconnect', terminate);
      if (process.connected) process.disconnect(); process.exit(1);
    }
  });
  await send({ event: 'ready', protocol: PROOF_PROTOCOL });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) runProofWorker().catch(() => process.exit(1));
