/** Exact-source, local-only deployment of the shared native receipt hub and
 * two asset pools. Importing this module starts no compiler, chain or prover.
 * Disabled literal pins must be installed by source review, never discovered
 * from caller data. A deployment is not evidence of genuine proof acceptance.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { projectRoot } from '../../../chains/shared/runtime-harness.mjs';
import { publicKeccak256 } from '../../../crypto/private-cohort-public-native.mjs';
import { linkPrivateBytecode, derivePrivateAssetIdentity, derivePrivateAssetPoolScope } from '../../../notes/private-asset-runtime.mjs';
import { NATIVE_QUORUM_PROFILE, normalizeNativeQuorumRegistry, nativeQuorumRegistryCommitment } from '../../../evidence/native-quorum.mjs';
import { nativeHubSignatureToHost } from '../../../evidence/native-hub-messages.mjs';
import { GENERIC_COMPILER_PIN, GENERIC_NATIVE_ASSET, GENERIC_TOKEN_SOURCE_SHA256, deriveGenericVerifierImmutables } from '../../local/local-deployment.mjs';
import { loadProofProfile } from '../../proofs/proof-worker.mjs';
import { assertLocalEvm } from '../../local/local-evm.mjs';

export const NATIVE_INPUT_WORDS = Object.freeze({ deposit_balance: 26, withdraw_balance: 39,
  withdraw: 39, reserve_generic: 66, recover_generic: 51, admission: 42, fulfill: 131 });
export const NATIVE_SOURCE_NAMES = Object.freeze(Object.fromEntries([
  ...Object.keys(NATIVE_INPUT_WORDS).map(mode => [mode, `${mode}.sol`]),
  ['hub', 'PrivateNativeReceiptHub.sol'], ['pool', 'PrivateGenericNativeAssetNotePool.sol'],
  ['token', 'PrivateAssetTestToken.sol'],
]));
// S66/F51 are from the exact key reports already pinned in proof-worker.mjs.
// A caller-supplied matching hash is never an alternative to these literals.
export const NATIVE_SOURCE_PINS = Object.freeze({
  deposit_balance: '47ab7388f52b695fc33b8d71a3fbc0f022b8d50f8007967aa0e4b335ab71ea93',
  withdraw_balance: 'd1d06f9b3689f6d531b19775131cc91700772ffa0bcc5e72b083b9f7393b1824',
  withdraw: '1691a2958f1c0dfacfdc4ec721ad59635808389902750402d7ecfae94684b4b1',
  reserve_generic: '91ebee5d27774ace6446e778e7102e54ea0a16449b71a96d229ecec3f7985007',
  recover_generic: '3d16b511fe92e7a219dc41908041d76908f07bb0a7cf1cf3bdb6903b5ecc336e',
  admission: '591ede3e223e315074a65fcea2ab13d0f6160712e5cb1abdb30dfbbee2d007c7',
  fulfill: 'd8a39201f77984662fc4b897237b608c0748478f796ef5f517880ae2f3fff2b1',
  hub: 'e7169e4a98e86f4e438acf749d3e9028b4c1f756622da2a0593b1705fb7696d0',
  pool: '37cbcb7140ee2247b32f97c7fa25443ecc25c9c7d3b7a1d526d69a6b21b6dc67',
  token: GENERIC_TOKEN_SOURCE_SHA256,
});
const SOURCE_PATHS = Object.freeze({
  deposit_balance: 'experiments/private-core-proof/wallet-notes/.local/prepared/deposit_balance.sol',
  withdraw_balance: 'experiments/private-core-proof/wallet-notes/.local/prepared/withdraw_balance.sol',
  withdraw: 'evidence/m23-wallet-capability/2026-10-03T07-20-22-656Z/verifiers/withdraw.sol',
  reserve_generic: '.local/development/generic-wrappers/reserve/prepared/reserve.sol',
  recover_generic: '.local/development/generic-wrappers/refund/prepared/refund.sol',
  admission: '.local/development/generic-native/admission/prepared/admission.sol',
  fulfill: '.local/development/generic-native/fulfill/prepared/fulfill.sol',
  hub: 'contracts/PrivateNativeReceiptHub.sol', pool: 'contracts/PrivateGenericNativeAssetNotePool.sol',
  token: 'contracts/PrivateAssetTestToken.sol',
});
const MODES = Object.freeze(Object.keys(NATIVE_INPUT_WORDS));
const REQUIRED_SOURCES = Object.freeze([...MODES, 'hub', 'pool']);
const EIP170_LIMIT = 24_576, ZERO32 = `0x${'00'.repeat(32)}`;
const compiledHere = new WeakSet();
const deployedSystems = new WeakMap();

/** A live deployment capability from this module, bound to its exact owned
 * runtime. An object with alleged addresses/getters is not a state authority. */
export function assertOwnedNativeSystem(runtime, system) {
  assert.ok(deployedSystems.has(system) && deployedSystems.get(system) === runtime,
    'NATIVE_OWNED_SYSTEM_CAPABILITY');
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const keccak = hex => `0x${publicKeccak256(Buffer.from(hex.slice(2), 'hex')).toString('hex')}`;
const address = value => { assert.match(value, /^0x[0-9a-f]{40}$/i, 'NATIVE_DEPLOY_ADDRESS'); return value.toLowerCase(); };
const bytes32 = value => { assert.match(value, /^0x[0-9a-f]{64}$/i, 'NATIVE_DEPLOY_BYTES32'); return value.toLowerCase(); };
const byteString = value => { assert.match(value, /^0x(?:[0-9a-f]{2})*$/i, 'NATIVE_DEPLOY_BYTES'); return value.toLowerCase(); };
function uint(value, width = 256) {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0), 'NATIVE_ABI_SAFE_INTEGER');
  assert.ok(['string', 'number', 'bigint'].includes(typeof value), 'NATIVE_ABI_INTEGER');
  if (typeof value === 'string') assert.match(value, /^(?:0|[1-9][0-9]*|0x[0-9a-f]+)$/i, 'NATIVE_ABI_INTEGER');
  const n = BigInt(value); assert.ok(n >= 0n && n < (1n << BigInt(width)), 'NATIVE_ABI_UINT_RANGE'); return n;
}
const word = value => uint(value).toString(16).padStart(64, '0');
function exact(value, keys, label) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, label);
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort(), label);
  for (const key of keys) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'), label);
}
function array(value, length, label) {
  assert.ok(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, label);
  assert.equal(value.length, length, label);
  assert.equal(Reflect.ownKeys(value).length, length + 1, label);
  for (let i = 0; i < length; i++) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value'), label);
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const components = rows => rows.map(([name, type]) => ({ name, type }));
export const NATIVE_ABI_SCHEMAS = freeze({
  quorumSignature: components([['signerIndex', 'uint8'], ['v', 'uint8'], ['r', 'bytes32'], ['s', 'bytes32']]),
  hubDeployment: components([['deploymentDomain', 'bytes32'], ['registryEpoch', 'uint64'], ['rulesRoot', 'bytes32'],
    ['admissionVerifier', 'address'], ['admissionVerifierCodeHash', 'bytes32'], ['pools', 'address[2]'],
    ['poolCodeHashes', 'bytes32[2]'], ['attesterX', 'uint256[4]'], ['attesterY', 'uint256[4]']]),
  poolDeployment: components([['asset', 'address'], ['deploymentDomain', 'bytes32'], ['policy', 'bytes32'],
    ['depositBalanceVerifier', 'address'], ['withdrawBalanceVerifier', 'address'], ['withdrawVerifier', 'address'],
    ['reserveGenericVerifier', 'address'], ['recoverGenericVerifier', 'address'], ['fulfillGenericVerifier', 'address'],
    ['fulfillGenericVerifierCodeHash', 'bytes32'], ['receiptHub', 'address'], ['receiptHubCodeHash', 'bytes32'],
    ['hubDomain', 'bytes32'], ['registryCommitment', 'bytes32']]),
});
const tuple = schema => ({ type: 'tuple', components: schema });
const quorumArray = { type: 'tuple[3]', components: NATIVE_ABI_SCHEMAS.quorumSignature };
const quorumSignature = '(uint8,uint8,bytes32,bytes32)[3]';
const schemaShape = inputs => inputs.map(input => ({ name: input.name, type: input.type,
  ...(input.components ? { components: schemaShape(input.components) } : {}) }));
function assertTupleSchema(input) {
  assert.ok(Array.isArray(input.components) && Object.values(NATIVE_ABI_SCHEMAS)
    .some(schema => JSON.stringify(schemaShape(input.components)) === JSON.stringify(schema)), 'NATIVE_ABI_UNKNOWN_TUPLE_SCHEMA');
}
function staticValue(input, value) {
  const fixed = /^(.*)\[([1-9][0-9]*)\]$/.exec(input.type);
  if (fixed) {
    const length = Number(fixed[2]);
    assert.ok(Number.isSafeInteger(length) && length <= 128, 'NATIVE_ABI_ARRAY_SIZE');
    array(value, length, 'NATIVE_ABI_FIXED_ARRAY');
    return value.map(item => staticValue({ ...input, type: fixed[1] }, item)).join('');
  }
  if (input.type === 'tuple') {
    assertTupleSchema(input);
    const names = input.components.map(component => component.name);
    exact(value, names, 'NATIVE_ABI_TUPLE_FIELDS');
    return input.components.map(component => staticValue(component, value[component.name])).join('');
  }
  assert.equal(input.components, undefined, 'NATIVE_ABI_UNEXPECTED_COMPONENTS');
  if (input.type === 'address') return word(address(value));
  if (input.type === 'bytes32') return bytes32(value).slice(2);
  if (input.type === 'bool') { assert.equal(typeof value, 'boolean', 'NATIVE_ABI_BOOLEAN'); return word(value ? 1 : 0); }
  const integer = /^uint(8|16|32|64|128|256)$/.exec(input.type);
  assert.ok(integer, `NATIVE_ABI_UNSUPPORTED_STATIC_${input.type}`);
  return word(uint(value, Number(integer[1])));
}
/** Known static tuples/fixed arrays only; no offsets, loose object order, or
 * generic object flattening. Unknown tuple schemas and dynamic arrays fail. */
export function nativeStaticArguments(inputs, args) {
  assert.ok(Array.isArray(inputs), 'NATIVE_ABI_INPUTS');
  array(args, inputs.length, 'NATIVE_ABI_ARGUMENT_COUNT');
  return `0x${inputs.map((input, i) => staticValue(input, args[i])).join('')}`;
}
function canonicalType(input) {
  return input.type.startsWith('tuple')
    ? `(${input.components.map(canonicalType).join(',')})${input.type.slice(5)}` : input.type;
}
function artifactMethod(artifact, signature) {
  const selector = artifact?.evm?.methodIdentifiers?.[signature];
  assert.match(selector, /^[0-9a-f]{8}$/i, `NATIVE_MISSING_METHOD_${signature}`);
  const matches = artifact.abi.filter(entry => entry.type === 'function'
    && `${entry.name}(${entry.inputs.map(canonicalType).join(',')})` === signature);
  assert.equal(matches.length, 1, 'NATIVE_METHOD_ABI_MISMATCH');
  const calculated = publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
  assert.equal(selector.toLowerCase(), calculated, 'NATIVE_METHOD_SELECTOR_MISMATCH');
  return { selector: calculated, abi: matches[0] };
}
export function nativeStaticCalldata(artifact, signature, args = []) {
  const { selector, abi } = artifactMethod(artifact, signature);
  return `0x${selector}${nativeStaticArguments(abi.inputs, args).slice(2)}`;
}
function healthArguments(health) {
  exact(health, ['healthFrom', 'healthUntil', 'healthSignatures'], 'NATIVE_HEALTH_FIELDS');
  array(health.healthSignatures, 3, 'NATIVE_HEALTH_SIGNATURE_COUNT');
  health.healthSignatures.forEach((signature, i) => {
    nativeHubSignatureToHost(signature);
    if (i) assert.ok(uint(health.healthSignatures[i - 1].signerIndex) < uint(signature.signerIndex), 'NATIVE_HEALTH_SIGNER_ORDER');
  });
  return [health.healthFrom, health.healthUntil, health.healthSignatures];
}
/** Supports only the exact verifier, S66 guarded, and I42/T131 health ABIs.
 * Structural/signature validation is not chain health or proof verification. */
export function nativeProofCalldata(artifact, signature, proof, publicInputs, extra) {
  const { selector, abi } = artifactMethod(artifact, signature);
  assert.ok(Buffer.isBuffer(proof) || proof instanceof Uint8Array, 'NATIVE_PROOF_BYTES');
  assert.ok(Array.isArray(publicInputs), 'NATIVE_PUBLIC_INPUTS');
  array(publicInputs, publicInputs.length, 'NATIVE_PUBLIC_INPUTS');
  assert.deepEqual(abi.inputs.slice(0, 2).map(input => input.type), ['bytes', 'bytes32[]'], 'NATIVE_PROOF_ABI');
  const suffix = abi.inputs.slice(2).map(canonicalType);
  let tailInputs = [];
  if (suffix.length === 0) assert.equal(extra, undefined, 'NATIVE_UNEXPECTED_PROOF_OPTIONS');
  else if (JSON.stringify(suffix) === JSON.stringify(['uint64', 'bytes32'])) {
    exact(extra, ['expectedSequence', 'expectedPostRoot'], 'NATIVE_RESERVE_GUARDS');
    tailInputs = [extra.expectedSequence, extra.expectedPostRoot];
  } else {
    assert.deepEqual(suffix, ['uint64', 'uint64', quorumSignature], 'NATIVE_PROOF_UNKNOWN_ABI');
    tailInputs = healthArguments(extra);
  }
  const staticTail = nativeStaticArguments(abi.inputs.slice(2), tailInputs).slice(2);
  const data = Buffer.from(proof), padded = Math.ceil(data.length / 32) * 32;
  const headBytes = 64 + staticTail.length / 2;
  return `0x${selector}${word(headBytes)}${word(headBytes + 32 + padded)}${staticTail}`
    + word(data.length) + data.toString('hex').padEnd(padded * 2, '0')
    + word(publicInputs.length) + publicInputs.map(word).join('');
}

/** Pure RLP CREATE address prediction, including nonce 0/127/128 boundaries.
 * Callers must obtain nonce from the owned runtime; this never guesses it. */
export function predictNativeCreateAddress(sender, nonce) {
  const n = uint(nonce, 64), a = address(sender).slice(2);
  const encodedNonce = n === 0n ? '80' : n < 128n ? n.toString(16).padStart(2, '0') : (() => {
    const raw = n.toString(16).padStart(Math.ceil(n.toString(16).length / 2) * 2, '0');
    return (128 + raw.length / 2).toString(16) + raw;
  })();
  const payload = `94${a}${encodedNonce}`;
  return `0x${publicKeccak256(Buffer.from((192 + payload.length / 2).toString(16) + payload, 'hex')).subarray(12).toString('hex')}`;
}
export function deriveNativeHubDomain(chainId, hub, deploymentDomain) {
  return `0x${sha(Buffer.from(`30${word(chainId)}${address(hub).slice(2)}${bytes32(deploymentDomain).slice(2)}`, 'hex'))}`;
}

/** Derive the full expected runtime BEFORE deployment. No observed code/getter
 * contributes any bytes or expected immutable values to this template. */
export function deriveNativeRuntimeCode({ artifact, deployedAddress, libraries = {}, immutableNames = {}, immutableValues = {}, isLibrary = false }) {
  const bytecode = artifact?.evm?.deployedBytecode;
  assert.ok(bytecode?.object, 'NATIVE_RUNTIME_ARTIFACT');
  const linked = linkPrivateBytecode(bytecode.object, bytecode.linkReferences, libraries);
  const expected = Buffer.from(linked, 'hex');
  assert.ok(expected.length <= EIP170_LIMIT, 'NATIVE_RUNTIME_EIP170_SIZE');
  const used = Object.values(bytecode.linkReferences ?? {}).flatMap(names => Object.values(names).flat())
    .map(({ start, length }) => [start, start + length]);
  const claim = (start, length) => {
    assert.ok(Number.isSafeInteger(start) && start >= 0 && start + length <= expected.length, 'NATIVE_RUNTIME_RANGE');
    assert.ok(used.every(([a, b]) => start + length <= a || start >= b), 'NATIVE_RUNTIME_OVERLAP');
    used.push([start, start + length]);
  };
  if (isLibrary) {
    assert.match(linked, /^73(?:00){20}3014/, 'NATIVE_LIBRARY_GUARD_TEMPLATE');
    claim(1, 20); Buffer.from(address(deployedAddress).slice(2), 'hex').copy(expected, 1);
  }
  const neededNames = Object.keys(bytecode.immutableReferences ?? {}).map(id => {
    assert.equal(typeof immutableNames[id], 'string', `NATIVE_UNRESOLVED_IMMUTABLE_${id}`); return immutableNames[id];
  });
  assert.equal(new Set(neededNames).size, neededNames.length, 'NATIVE_DUPLICATE_IMMUTABLE_NAME');
  // solc may fold a constructor constant (for example $MSMSize) entirely out
  // of the runtime. Permit independently derived values only for declared
  // immutable names, while requiring every surviving reference to be bound.
  exact(immutableValues, Object.keys(immutableValues), 'NATIVE_IMMUTABLE_VALUE_FIELDS');
  assert.ok(neededNames.every(name => Object.hasOwn(immutableValues, name))
    && Object.keys(immutableValues).every(name => Object.values(immutableNames).includes(name)), 'NATIVE_IMMUTABLE_VALUE_FIELDS');
  Object.values(immutableValues).forEach(value => uint(value));
  for (const [id, ranges] of Object.entries(bytecode.immutableReferences ?? {})) {
    assert.ok(Array.isArray(ranges) && ranges.length > 0, 'NATIVE_IMMUTABLE_REFERENCES');
    for (const { start, length } of ranges) {
      assert.equal(length, 32, 'NATIVE_IMMUTABLE_WIDTH'); claim(start, length);
      assert.ok(expected.subarray(start, start + length).every(byte => byte === 0), 'NATIVE_IMMUTABLE_TEMPLATE_NOT_ZERO');
      Buffer.from(word(immutableValues[immutableNames[id]]), 'hex').copy(expected, start);
    }
  }
  return `0x${expected.toString('hex')}`;
}
export function assertNativeRuntimeCode(options) {
  const expectedCode = deriveNativeRuntimeCode(options), actual = byteString(options.actualCode);
  assert.equal(actual, expectedCode, 'NATIVE_EXACT_DEPLOYED_RUNTIME');
  return { exactRuntimeMatch: true, runtimeBytes: (expectedCode.length - 2) / 2,
    runtimeSHA256: sha(Buffer.from(expectedCode.slice(2), 'hex')), codeHash: keccak(expectedCode) };
}

export function validateNativeSystemSources(sourceMap) {
  assert.ok(sourceMap && Object.getPrototypeOf(sourceMap) === Object.prototype, 'NATIVE_SOURCE_MAP');
  const modes = [...REQUIRED_SOURCES, ...(Object.hasOwn(sourceMap, 'token') ? ['token'] : [])];
  exact(sourceMap, modes, 'NATIVE_SOURCE_MAP_FIELDS');
  const sources = {};
  for (const mode of modes) {
    const pin = NATIVE_SOURCE_PINS[mode];
    assert.ok(typeof pin === 'string' && /^[0-9a-f]{64}$/.test(pin), `NATIVE_SOURCE_PROFILE_DISABLED_${mode}`);
    const record = sourceMap[mode]; exact(record, ['content', 'sha256'], 'NATIVE_SOURCE_RECORD');
    assert.ok(typeof record.content === 'string' && record.content.length > 0, 'NATIVE_SOURCE_CONTENT');
    assert.equal(record.sha256, pin, `NATIVE_SOURCE_LITERAL_PIN_${mode}`);
    assert.equal(sha(record.content), pin, `NATIVE_SOURCE_HASH_${mode}`);
    sources[mode] = { name: NATIVE_SOURCE_NAMES[mode], content: record.content, sha256: pin };
  }
  return sources;
}
/** Fixed local paths; no URL/import resolver, environment or caller pin input. */
export async function nativeSystemSources(options = {}) {
  assert.ok(options && Object.getPrototypeOf(options) === Object.prototype, 'NATIVE_SOURCE_OPTIONS');
  assert.ok(Object.keys(options).every(key => key === 'token'), 'NATIVE_SOURCE_OPTION_FIELDS');
  const token = options.token ?? false;
  assert.equal(typeof token, 'boolean', 'NATIVE_TOKEN_OPTION');
  const modes = [...REQUIRED_SOURCES, ...(token ? ['token'] : [])];
  for (const mode of modes) assert.ok(NATIVE_SOURCE_PINS[mode], `NATIVE_SOURCE_PROFILE_DISABLED_${mode}`);
  const sources = Object.fromEntries(await Promise.all(modes.map(async mode => [mode,
    { content: await readFile(join(projectRoot, SOURCE_PATHS[mode]), 'utf8'), sha256: NATIVE_SOURCE_PINS[mode] }])));
  validateNativeSystemSources(sources); return sources;
}

// Exact official module and direct Standard JSON C API, with both callback
// pointers zero. This intentionally does not import solc's network-capable wrapper.
async function compiler() {
  const toolRoot = await realpath(join(projectRoot, 'tools/solidity-js'));
  const lockBytes = await readFile(join(toolRoot, 'package-lock.json'));
  assert.equal(sha(lockBytes), GENERIC_COMPILER_PIN.lockSHA256, 'NATIVE_SOLC_LOCK_HASH');
  const pin = JSON.parse(lockBytes).packages?.['node_modules/solc'];
  for (const [key, expected] of Object.entries({ version: GENERIC_COMPILER_PIN.packageVersion,
    resolved: GENERIC_COMPILER_PIN.resolved, integrity: GENERIC_COMPILER_PIN.integrity }))
    assert.equal(pin?.[key], expected, 'NATIVE_SOLC_PACKAGE_PIN');
  const modulePath = await realpath(join(toolRoot, 'node_modules/solc/soljson.js'));
  assert.ok(modulePath.startsWith(toolRoot + sep), 'NATIVE_SOLC_PATH_ESCAPE');
  assert.equal(sha(await readFile(modulePath)), GENERIC_COMPILER_PIN.soljsonSHA256, 'NATIVE_SOLJSON_HASH');
  const soljson = createRequire(join(toolRoot, 'package.json'))(modulePath);
  assert.equal(soljson.cwrap('solidity_version', 'string', [])(), GENERIC_COMPILER_PIN.version, 'NATIVE_SOLC_BUILD');
  const compile = soljson.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
  const reset = soljson.cwrap('solidity_reset', null, []);
  return input => { try { return JSON.parse(compile(JSON.stringify(input), 0, 0)); } finally { reset(); } };
}
function assertConstructor(artifact, schema) {
  const constructors = artifact.abi.filter(item => item.type === 'constructor');
  assert.equal(constructors.length, 1, 'NATIVE_CONSTRUCTOR_COUNT');
  assert.equal(constructors[0].inputs.length, 1, 'NATIVE_CONSTRUCTOR_ARGUMENT_COUNT');
  assert.equal(constructors[0].inputs[0].type, 'tuple', 'NATIVE_CONSTRUCTOR_TUPLE');
  assert.deepEqual(schemaShape(constructors[0].inputs[0].components), schema, 'NATIVE_CONSTRUCTOR_SCHEMA');
}
export async function compileNativeSystem(sourceMap, onCompiled = async () => {}) {
  assert.equal(typeof onCompiled, 'function', 'NATIVE_COMPILE_CALLBACK');
  const sources = validateNativeSystemSources(sourceMap), lineage = {};
  // These are read-only artifact/source/key audits. No proof/backend starts.
  for (const mode of MODES.filter(mode => mode !== 'withdraw')) {
    const profile = loadProofProfile(({ reserve_generic: 'reserve', recover_generic: 'refund' })[mode] ?? mode);
    assert.equal(profile.target, 'evm', 'NATIVE_VERIFIER_EVM_TARGET');
    assert.equal(profile.publicPins.statementWords, NATIVE_INPUT_WORDS[mode], 'NATIVE_VERIFIER_PROFILE_WORDS');
    assert.equal(profile.publicPins.soliditySHA256, sources[mode].sha256, 'NATIVE_VERIFIER_SOURCE_LINEAGE');
    lineage[mode] = profile.publicPins;
  }
  const compile = await compiler(), contracts = {}, settings = {}, sourceReports = {}, immutableNames = {}, verifierImmutableValues = {}, warnings = [];
  const started = performance.now();
  for (const [mode, source] of Object.entries(sources)) {
    const ledger = mode === 'hub' || mode === 'pool';
    const sourceSettings = { optimizer: { enabled: true, runs: ledger ? 200 : 1 }, viaIR: ledger,
      evmVersion: 'cancun', metadata: { bytecodeHash: 'none' }, outputSelection: { '*': { '': ['ast'], '*': [
        'abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.object',
        'evm.deployedBytecode.linkReferences', 'evm.deployedBytecode.immutableReferences', 'evm.methodIdentifiers',
      ] } } };
    const phaseStarted = performance.now();
    const output = compile({ language: 'Solidity', sources: { [source.name]: { content: source.content } }, settings: sourceSettings });
    const errors = (output.errors ?? []).filter(error => error.severity === 'error');
    if (errors.length) throw Object.assign(new Error(`NATIVE_COMPILATION_FAILED_${mode}`), { compilerErrors: errors });
    assert.deepEqual(Object.keys(output.contracts ?? {}), [source.name], 'NATIVE_COMPILED_SOURCE_SET');
    const ast = output.sources?.[source.name]?.ast, names = {};
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable') names[String(node.id)] = node.name;
      for (const child of Object.values(node)) if (child && typeof child === 'object') {
        if (Array.isArray(child)) child.forEach(walk); else walk(child);
      }
    };
    walk(ast); immutableNames[source.name] = names;
    contracts[source.name] = output.contracts[source.name]; settings[mode] = sourceSettings;
    for (const artifact of Object.values(contracts[source.name])) if (artifact.evm.deployedBytecode.object)
      assert.ok(artifact.evm.deployedBytecode.object.length / 2 <= EIP170_LIMIT, `NATIVE_ARTIFACT_EIP170_${mode}`);
    if (MODES.includes(mode)) {
      verifierImmutableValues[mode] = deriveGenericVerifierImmutables(ast, NATIVE_INPUT_WORDS[mode]);
      const verifier = contracts[source.name].HonkVerifier, { abi } = artifactMethod(verifier, 'verify(bytes,bytes32[])');
      assert.equal(abi.stateMutability, 'view', 'NATIVE_VERIFIER_VIEW');
      assert.deepEqual(abi.outputs.map(output => output.type), ['bool'], 'NATIVE_VERIFIER_RETURN');
      const constructors = verifier.abi.filter(entry => entry.type === 'constructor');
      assert.ok(constructors.length <= 1 && constructors.every(entry => entry.inputs.length === 0), 'NATIVE_VERIFIER_CONSTRUCTOR');
    }
    sourceReports[mode] = { name: source.name, sha256: source.sha256, bytes: Buffer.byteLength(source.content), milliseconds: performance.now() - phaseStarted };
    warnings.push(...(output.errors ?? []).filter(error => error.severity !== 'error').map(error => ({ mode, message: error.formattedMessage ?? error.message })));
    await onCompiled({ mode, ...sourceReports[mode] });
  }
  const hub = contracts[NATIVE_SOURCE_NAMES.hub].PrivateNativeReceiptHub;
  const pool = contracts[NATIVE_SOURCE_NAMES.pool].PrivateGenericNativeAssetNotePool;
  assertConstructor(hub, NATIVE_ABI_SCHEMAS.hubDeployment);
  assertConstructor(pool, NATIVE_ABI_SCHEMAS.poolDeployment);
  artifactMethod(hub, `admit(bytes,bytes32[],uint64,uint64,${quorumSignature})`);
  artifactMethod(pool, `fulfillGeneric(bytes,bytes32[],uint64,uint64,${quorumSignature})`);
  artifactMethod(pool, 'reserveGenericGuarded(bytes,bytes32[],uint64,bytes32)');
  // These fields MUST be storage, avoiding a full-runtime hash fixed-point.
  assert.ok(!Object.values(immutableNames[NATIVE_SOURCE_NAMES.hub]).some(name => ['pool0CodeHash', 'pool1CodeHash'].includes(name)), 'NATIVE_HUB_CIRCULAR_CODE_HASH');
  const result = freeze({ classification: 'ACTUAL_SOURCE_COMPILATION_NOT_PROOF_ACCEPTANCE', output: { contracts },
    sourceNames: { ...NATIVE_SOURCE_NAMES }, sources: sourceReports, settings, immutableNames, verifierImmutableValues, lineage,
    compiler: { ...GENERIC_COMPILER_PIN, api: 'solidity_compile; callback=0; context=0' }, warnings,
    milliseconds: performance.now() - started, deployed: false, actualProofsVerified: false });
  compiledHere.add(result); return result;
}

const verifierField = Object.freeze({ deposit_balance: 'depositBalanceVerifier', withdraw_balance: 'withdrawBalanceVerifier',
  withdraw: 'withdrawVerifier', reserve_generic: 'reserveGenericVerifier', recover_generic: 'recoverGenericVerifier', fulfill: 'fulfillGenericVerifier' });
function contract(compilation, mode, name) {
  const artifact = compilation.output.contracts[NATIVE_SOURCE_NAMES[mode]]?.[name];
  assert.ok(artifact, `NATIVE_MISSING_ARTIFACT_${mode}:${name}`); return artifact;
}
function checkedPoolOptions(pools) {
  array(pools, 2, 'NATIVE_EXACTLY_TWO_POOLS');
  return pools.map(pool => {
    exact(pool, ['policy', 'deploymentDomain'], 'NATIVE_POOL_OPTION_FIELDS');
    const policy = bytes32(pool.policy), deploymentDomain = bytes32(pool.deploymentDomain);
    assert.ok(policy !== ZERO32 && deploymentDomain !== ZERO32, 'NATIVE_POOL_NONZERO_DOMAIN');
    return { policy, deploymentDomain };
  });
}
/** A pure proposal, not a deployment capability. All addresses, domains,
 * constructor words and runtime hashes are derived before hub creation.
 * Compilation supplied directly here is untrusted until deployNativeSystem
 * checks the private compile capability; getters never establish expectations. */
export function buildNativeDeploymentPlan(input) {
  exact(input, ['compilation', 'chainId', 'sender', 'nextNonce', 'deploymentDomain', 'registryEpoch', 'rulesRoot', 'attesterKeys', 'pools', 'verifiers', 'asset', 'assetCodeHash'], 'NATIVE_PLAN_FIELDS');
  const { compilation } = input, sender = address(input.sender), nonce = uint(input.nextNonce, 64);
  assert.ok(nonce + 2n < (1n << 64n) - 1n, 'NATIVE_CREATE_NONCE_LIMIT');
  assert.equal(uint(input.chainId), 31337n, 'NATIVE_PLAN_LOCAL_CHAIN');
  const deploymentDomain = bytes32(input.deploymentDomain), rulesRoot = bytes32(input.rulesRoot);
  assert.ok(deploymentDomain !== ZERO32 && rulesRoot !== ZERO32, 'NATIVE_HUB_NONZERO_DOMAIN');
  const pools = checkedPoolOptions(input.pools), registryEpoch = uint(input.registryEpoch, 64).toString();
  const asset = address(input.asset), assetCodeHash = bytes32(input.assetCodeHash);
  const assetIdentity = derivePrivateAssetIdentity(input.chainId, asset, assetCodeHash);
  exact(input.verifiers, MODES, 'NATIVE_PLAN_VERIFIERS');
  const verifiers = Object.fromEntries(MODES.map(mode => {
    const record = input.verifiers[mode]; exact(record, ['address', 'codeHash'], 'NATIVE_PLAN_VERIFIER_FIELDS');
    const verifier = { address: address(record.address), codeHash: bytes32(record.codeHash) };
    assert.ok(verifier.address !== GENERIC_NATIVE_ASSET && verifier.codeHash !== ZERO32 && verifier.codeHash !== keccak('0x'), 'NATIVE_PLAN_VERIFIER_PIN');
    return [mode, verifier];
  }));
  const hubAddress = predictNativeCreateAddress(sender, nonce);
  const poolAddresses = [1n, 2n].map(offset => predictNativeCreateAddress(sender, nonce + offset));
  const hubDomain = deriveNativeHubDomain(input.chainId, hubAddress, deploymentDomain);
  const registry = normalizeNativeQuorumRegistry({ profile: NATIVE_QUORUM_PROFILE, hubDomain: hubDomain.slice(2), registryEpoch,
    rulesRoot: rulesRoot.slice(2), keys: input.attesterKeys });
  const registryCommitment = `0x${nativeQuorumRegistryCommitment(registry)}`;
  const hubValues = { deploymentDomain, hubDomain, registryCommitment, registryEpoch, rulesRoot,
    admissionVerifier: verifiers.admission.address, admissionVerifierCodeHash: verifiers.admission.codeHash,
    pool0: poolAddresses[0], pool1: poolAddresses[1] };
  const hubArtifact = contract(compilation, 'hub', 'PrivateNativeReceiptHub');
  const poolArtifact = contract(compilation, 'pool', 'PrivateGenericNativeAssetNotePool');
  assertConstructor(hubArtifact, NATIVE_ABI_SCHEMAS.hubDeployment);
  assertConstructor(poolArtifact, NATIVE_ABI_SCHEMAS.poolDeployment);
  const hubRuntime = deriveNativeRuntimeCode({ artifact: hubArtifact, deployedAddress: hubAddress,
    immutableNames: compilation.immutableNames[NATIVE_SOURCE_NAMES.hub], immutableValues: hubValues });
  const hubCodeHash = keccak(hubRuntime);
  const poolPlans = pools.map((pool, index) => {
    const poolAddress = poolAddresses[index];
    const scope = derivePrivateAssetPoolScope(input.chainId, poolAddress, pool.deploymentDomain, assetIdentity);
    const configuration = { asset, deploymentDomain: pool.deploymentDomain, policy: pool.policy };
    const immutableValues = { ...configuration, assetCodeHash, assetIdentity, scope };
    for (const [mode, field] of Object.entries(verifierField)) {
      configuration[field] = verifiers[mode].address; immutableValues[field] = verifiers[mode].address;
      immutableValues[`${field}CodeHash`] = verifiers[mode].codeHash;
    }
    configuration.fulfillGenericVerifierCodeHash = verifiers.fulfill.codeHash;
    Object.assign(configuration, { receiptHub: hubAddress, receiptHubCodeHash: hubCodeHash, hubDomain, registryCommitment });
    Object.assign(immutableValues, { receiptHub: hubAddress, receiptHubCodeHash: hubCodeHash, hubDomain, registryCommitment });
    const runtimeCode = deriveNativeRuntimeCode({ artifact: poolArtifact, deployedAddress: poolAddress,
      immutableNames: compilation.immutableNames[NATIVE_SOURCE_NAMES.pool], immutableValues });
    return { address: poolAddress, nonce: (nonce + BigInt(index) + 1n).toString(), configuration, immutableValues,
      runtimeCode, codeHash: keccak(runtimeCode), constructorData: nativeStaticArguments([tuple(NATIVE_ABI_SCHEMAS.poolDeployment)], [configuration]) };
  });
  const configuration = { deploymentDomain, registryEpoch, rulesRoot,
    admissionVerifier: verifiers.admission.address, admissionVerifierCodeHash: verifiers.admission.codeHash,
    pools: poolAddresses, poolCodeHashes: poolPlans.map(pool => pool.codeHash),
    attesterX: registry.keys.map(key => `0x${key.x}`), attesterY: registry.keys.map(key => `0x${key.y}`) };
  return freeze({ classification: 'PREDICTED_LOCAL_DEPLOYMENT_NOT_CHAIN_EVIDENCE', chainId: '31337', sender,
    hubDomain, registryCommitment, registry, asset, assetCodeHash, assetIdentity,
    hub: { address: hubAddress, nonce: nonce.toString(), configuration, immutableValues: hubValues,
      runtimeCode: hubRuntime, codeHash: hubCodeHash,
      constructorData: nativeStaticArguments([tuple(NATIVE_ABI_SCHEMAS.hubDeployment)], [configuration]) }, pools: poolPlans });
}

/** All local mutations remain on the owned runtime. Errors retain receipts and
 * partial deployments; the caller retains lifecycle/cleanup responsibility. */
export async function deployNativeSystem(runtime, options) {
  await assertLocalEvm(runtime);
  assert.ok(options && Object.getPrototypeOf(options) === Object.prototype, 'NATIVE_DEPLOYMENT_OPTIONS');
  assert.ok(Object.keys(options).every(key => ['sources', 'compilation', 'deploymentDomain', 'registryEpoch', 'rulesRoot', 'attesterKeys', 'pools', 'asset', 'initialSupply', 'onDeployment'].includes(key)), 'NATIVE_DEPLOYMENT_OPTION_FIELDS');
  assert.ok(Boolean(options.sources) !== Boolean(options.compilation), 'NATIVE_ONE_COMPILATION_INPUT');
  assert.equal(typeof runtime.nonce, 'function', 'NATIVE_OWNED_NONCE_API_REQUIRED');
  const compilation = options.compilation ?? await compileNativeSystem(options.sources);
  assert.ok(compiledHere.has(compilation), 'NATIVE_COMPILATION_CAPABILITY_REQUIRED');
  const deploymentDomain = bytes32(options.deploymentDomain), rulesRoot = bytes32(options.rulesRoot);
  assert.ok(deploymentDomain !== ZERO32 && rulesRoot !== ZERO32, 'NATIVE_HUB_NONZERO_DOMAIN');
  const pools = checkedPoolOptions(options.pools), registryEpoch = uint(options.registryEpoch, 64).toString();
  // Validate public registry keys before any transaction. The real hub domain
  // is recomputed from its actual prospective CREATE address after verifiers.
  const checkedRegistry = normalizeNativeQuorumRegistry({ profile: NATIVE_QUORUM_PROFILE, hubDomain: ZERO32.slice(2), registryEpoch,
    rulesRoot: rulesRoot.slice(2), keys: options.attesterKeys });
  assert.ok(options.asset === undefined || options.asset === GENERIC_NATIVE_ASSET || options.asset === 'local-test-token', 'NATIVE_ASSET_PROFILE');
  const onDeployment = options.onDeployment ?? (async () => {});
  assert.equal(typeof onDeployment, 'function', 'NATIVE_DEPLOYMENT_CALLBACK');
  const sender = address(runtime.accounts[0]), deployments = [], deployedLibraries = new Map(), activeLibraries = new Set();
  let plan;
  const deploy = async (source, name, args, immutableValues, libraries, isLibrary = false, planned) => {
    const artifact = compilation.output.contracts[source]?.[name]; assert.ok(artifact, 'NATIVE_DEPLOY_ARTIFACT');
    const nonce = await runtime.nonce(sender, 'pending');
    if (planned) assert.equal(nonce, BigInt(planned.nonce), 'NATIVE_DEPLOY_NONCE_CHANGED');
    const expectedAddress = predictNativeCreateAddress(sender, nonce);
    if (planned) assert.equal(expectedAddress, planned.address, 'NATIVE_DEPLOY_ADDRESS_CHANGED');
    const inputs = artifact.abi.find(item => item.type === 'constructor')?.inputs ?? [];
    const constructorData = nativeStaticArguments(inputs, args);
    if (planned) assert.equal(constructorData, planned.constructorData, 'NATIVE_DEPLOY_CONSTRUCTOR_CHANGED');
    const expectedRuntime = deriveNativeRuntimeCode({ artifact, deployedAddress: expectedAddress, libraries,
      immutableNames: compilation.immutableNames[source], immutableValues, isLibrary });
    if (planned) assert.equal(expectedRuntime, planned.runtimeCode, 'NATIVE_DEPLOY_RUNTIME_CHANGED');
    const creation = `0x${linkPrivateBytecode(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, libraries)}${constructorData.slice(2)}`;
    const receipt = await runtime.send(`deploy ${source}:${name}`, { from: sender, data: creation });
    assert.equal(address(receipt.contractAddress), expectedAddress, 'NATIVE_ACTUAL_CREATE_ADDRESS');
    const records = runtime.transactions.filter(record => record.transactionHash === receipt.transactionHash);
    assert.equal(records.length, 1, 'NATIVE_DEPLOY_TRANSACTION_RECORD');
    const transaction = records[0];
    assert.equal(transaction.phase, 'mined', 'NATIVE_DEPLOY_TRANSACTION_PHASE');
    assert.equal(address(transaction.request.from), sender, 'NATIVE_DEPLOY_TRANSACTION_SENDER');
    assert.equal(uint(transaction.senderNonce), nonce, 'NATIVE_DEPLOY_TRANSACTION_NONCE');
    assert.equal(transaction.request.data, creation, 'NATIVE_DEPLOY_TRANSACTION_CREATION');
    assert.equal(await runtime.nonce(sender, 'pending'), nonce + 1n, 'NATIVE_DEPLOY_NEXT_NONCE');
    const actualCode = await runtime.code(expectedAddress, receipt.blockNumber);
    const match = assertNativeRuntimeCode({ artifact, actualCode, deployedAddress: expectedAddress, libraries,
      immutableNames: compilation.immutableNames[source], immutableValues, isLibrary });
    assert.equal(await runtime.keccak(expectedRuntime), match.codeHash, 'NATIVE_INDEPENDENT_KECCAK_MATCH');
    await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
    const record = { source, contractName: name, address: expectedAddress, nonce: nonce.toString(), receipt,
      libraries: { ...libraries }, immutableValues, constructorArgumentsSHA256: sha(Buffer.from(constructorData.slice(2), 'hex')),
      creationBytes: (creation.length - 2) / 2, creationSHA256: sha(Buffer.from(creation.slice(2), 'hex')), ...match, proofAcceptanceClaim: false };
    freeze(record); deployments.push(record); await onDeployment(record); return record;
  };
  const librariesFor = async artifact => {
    const libraries = {};
    for (const references of [artifact.evm.bytecode.linkReferences, artifact.evm.deployedBytecode.linkReferences])
      for (const [source, names] of Object.entries(references ?? {})) for (const name of Object.keys(names)) {
        const key = `${source}:${name}`;
        if (!deployedLibraries.has(key)) {
          assert.ok(!activeLibraries.has(key), 'NATIVE_CYCLIC_LIBRARY_LINK'); activeLibraries.add(key);
          const dependency = compilation.output.contracts[source]?.[name]; assert.ok(dependency, 'NATIVE_MISSING_LIBRARY');
          const linked = await librariesFor(dependency);
          deployedLibraries.set(key, await deploy(source, name, [], {}, linked, true)); activeLibraries.delete(key);
        }
        libraries[key] = deployedLibraries.get(key).address;
      }
    return libraries;
  };
  try {
    const verifiers = {};
    for (const mode of MODES) {
      const artifact = contract(compilation, mode, 'HonkVerifier'), libraries = await librariesFor(artifact);
      verifiers[mode] = { ...await deploy(NATIVE_SOURCE_NAMES[mode], 'HonkVerifier', [], compilation.verifierImmutableValues[mode], libraries), artifact };
    }
    let asset = GENERIC_NATIVE_ASSET, assetCodeHash = ZERO32, tokenArtifact;
    if (options.asset === 'local-test-token') {
      tokenArtifact = contract(compilation, 'token', 'PrivateAssetTestToken');
      const supply = uint(options.initialSupply ?? 1_000_000_000n); assert.ok(supply > 0n, 'NATIVE_TOKEN_SUPPLY');
      const token = await deploy(NATIVE_SOURCE_NAMES.token, 'PrivateAssetTestToken', [supply], {}, await librariesFor(tokenArtifact));
      asset = token.address; assetCodeHash = token.codeHash;
    } else assert.equal(options.initialSupply, undefined, 'NATIVE_NATIVE_SUPPLY_OPTION');
    plan = buildNativeDeploymentPlan({ compilation, chainId: runtime.metadata.chainId, sender,
      nextNonce: await runtime.nonce(sender, 'pending'), deploymentDomain, registryEpoch, rulesRoot,
      attesterKeys: checkedRegistry.keys, pools, asset, assetCodeHash,
      verifiers: Object.fromEntries(MODES.map(mode => [mode, { address: verifiers[mode].address, codeHash: verifiers[mode].codeHash }])) });
    const hubRecord = await deploy(NATIVE_SOURCE_NAMES.hub, 'PrivateNativeReceiptHub', [plan.hub.configuration], plan.hub.immutableValues, {}, false, plan.hub);
    const poolRecords = [];
    for (const pool of plan.pools) poolRecords.push(await deploy(NATIVE_SOURCE_NAMES.pool, 'PrivateGenericNativeAssetNotePool', [pool.configuration], pool.immutableValues, {}, false, pool));
    const facade = (record, artifact) => ({ ...record, artifact, selectors: artifact.evm.methodIdentifiers,
      data: (signature, args = []) => nativeStaticCalldata(artifact, signature, args),
      call: (signature, args = [], block = 'latest') => runtime.call({ to: record.address, data: nativeStaticCalldata(artifact, signature, args) }, block) });
    const hub = facade(hubRecord, contract(compilation, 'hub', 'PrivateNativeReceiptHub'));
    hub.proofData = (proof, inputs, health) => {
      assert.equal(inputs?.length, NATIVE_INPUT_WORDS.admission, 'NATIVE_ADMISSION_PUBLIC_COUNT');
      return nativeProofCalldata(hub.artifact, `admit(bytes,bytes32[],uint64,uint64,${quorumSignature})`, proof, inputs, health);
    };
    const poolFacades = poolRecords.map((record, index) => {
      const pool = facade(record, contract(compilation, 'pool', 'PrivateGenericNativeAssetNotePool'));
      Object.assign(pool, plan.pools[index].immutableValues);
      pool.proofData = (mode, proof, inputs, extra) => {
        const method = ({ deposit_balance: 'depositBalance', withdraw_balance: 'withdrawBalance', withdraw: 'withdraw',
          reserve_generic: 'reserveGenericGuarded', recover_generic: 'recoverGeneric', fulfill: 'fulfillGeneric' })[mode];
        assert.ok(method, 'NATIVE_POOL_PROOF_MODE'); assert.equal(inputs?.length, NATIVE_INPUT_WORDS[mode], 'NATIVE_POOL_PUBLIC_COUNT');
        const suffix = mode === 'reserve_generic' ? ',uint64,bytes32' : mode === 'fulfill' ? `,uint64,uint64,${quorumSignature}` : '';
        return nativeProofCalldata(pool.artifact, `${method}(bytes,bytes32[]${suffix})`, proof, inputs, extra);
      };
      pool.guardedReserveData = (proof, inputs, guards) => pool.proofData('reserve_generic', proof, inputs, guards);
      pool.fulfillData = (proof, inputs, health) => pool.proofData('fulfill', proof, inputs, health);
      pool.fundingTransactionValue = amount => { const n = uint(amount, 64); assert.ok(n > 0n, 'NATIVE_DEPOSIT_AMOUNT'); return asset === GENERIC_NATIVE_ASSET ? `0x${n.toString(16)}` : '0x0'; };
      pool.beforeDeposit = async (amount, from = runtime.accounts[0]) => {
        assert.ok(uint(amount, 64) > 0n, 'NATIVE_DEPOSIT_AMOUNT');
        return tokenArtifact ? runtime.send('approve exact local native-pool deposit', { from, to: asset,
          data: nativeStaticCalldata(tokenArtifact, 'approve(address,uint256)', [pool.address, amount]) }) : null;
      };
      pool.snapshot = async () => {
        const header = await runtime.block();
        const [rawState, rawHistory, rawBacking] = await Promise.all(['canonicalState()', 'canonicalRootHistory()', 'canonicalBacking()'].map(signature => pool.call(signature, [], header.number)));
        await runtime.assertCanonical(header);
        return { header, blockNumber: header.number, blockHash: header.hash, scope: pool.scope, policy: pool.policy, asset, assetIdentity: plan.assetIdentity, rawState, rawHistory, rawBacking };
      };
      return pool;
    });
    // Getters are post-deployment corroboration only. Expected values above
    // came exclusively from the source, public configuration and nonce plan.
    for (const [name, value] of Object.entries({ ...plan.hub.immutableValues, pool0CodeHash: plan.pools[0].codeHash, pool1CodeHash: plan.pools[1].codeHash }))
      assert.equal((await hub.call(`${name}()`)).toLowerCase(), `0x${word(value)}`, `NATIVE_HUB_GETTER_${name}`);
    for (const pool of poolFacades) {
      for (const [name, value] of Object.entries(pool.immutableValues))
        assert.equal((await pool.call(`${name}()`)).toLowerCase(), `0x${word(value)}`, `NATIVE_POOL_GETTER_${name}`);
      assert.equal(BigInt(await pool.call('GENERIC_FULFILLMENT_ENABLED()')), 1n, 'NATIVE_FULFILLMENT_ENABLED');
      assert.equal(BigInt(await pool.call('EPOCH_SECONDS()')), 600n, 'NATIVE_LEGACY_EPOCH');
      assert.equal(BigInt(await hub.call('isRegisteredPool(address)', [pool.address])), 1n, 'NATIVE_POOL_REGISTRATION');
    }
    const system = { classification: 'OWNED_LOCAL_NATIVE_SYSTEM_NOT_PROOF_ACCEPTANCE', compilation, plan,
      deployments: freeze([...deployments]), verifiers: freeze(verifiers),
      hub: freeze(hub), pools: freeze(poolFacades), asset, assetCodeHash, assetIdentity: plan.assetIdentity, registry: plan.registry,
      hubDomain: plan.hubDomain, registryCommitment: plan.registryCommitment,
      verify: async (mode, proof, inputs, block = 'latest') => {
        assert.ok(MODES.includes(mode), 'NATIVE_VERIFY_MODE'); assert.equal(inputs?.length, NATIVE_INPUT_WORDS[mode], 'NATIVE_VERIFY_PUBLIC_COUNT');
        const verifier = verifiers[mode], result = await runtime.call({ to: verifier.address,
          data: nativeProofCalldata(verifier.artifact, 'verify(bytes,bytes32[])', proof, inputs) }, block);
        assert.ok(result === `0x${word(0)}` || result === `0x${word(1)}`, 'NATIVE_VERIFY_BOOL'); return result === `0x${word(1)}`;
      },
      assetBalance: async (holder, block = 'latest') => tokenArtifact ? BigInt(await runtime.call({ to: asset,
        data: nativeStaticCalldata(tokenArtifact, 'balanceOf(address)', [holder]) }, block)) : runtime.balance(holder, block),
      get receipts() { return runtime.receipts; },
    };
    deployedSystems.set(system, runtime);
    return Object.freeze(system);
  } catch (error) {
    error.partialDeployments = deployments; error.localReceipts = runtime.receipts; if (plan) error.deploymentPlan = plan; throw error;
  }
}
