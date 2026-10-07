/** Exact-source local compilation and deployment. A deployed verifier is not
 * evidence of an accepted proof. The trusted caller supplies independently
 * reviewed source pins; no arbitrary script, import callback or remote compiler
 * is accepted. Nothing in this module starts a runtime or generates a proof.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { projectRoot } from '../chains/runtime-harness.mjs';
import {
  linkPrivateBytecode, derivePrivateAssetIdentity, derivePrivateAssetPoolScope,
} from '../private-asset-runtime.mjs';
import { assertLocalEvm } from './local-evm.mjs';

export const GENERIC_NATIVE_ASSET = `0x${'00'.repeat(20)}`;
export const GENERIC_SOURCE_NAMES = Object.freeze({
  deposit_balance: 'deposit_balance.sol', withdraw_balance: 'withdraw_balance.sol',
  withdraw: 'withdraw.sol', reserve_generic: 'reserve_generic.sol', recover_generic: 'recover_generic.sol',
  pool: 'PrivateGenericAssetNotePool.sol', token: 'PrivateAssetTestToken.sol',
});
export const GENERIC_INPUT_WORDS = Object.freeze({ deposit_balance: 26, withdraw_balance: 39, withdraw: 39, reserve_generic: 66, recover_generic: 51 });
export const GENERIC_POOL_SOURCE_SHA256 = '7be184488edeeb464a335696edee678112678eac3c6587ab3f5a026a4f0de9df';
export const GENERIC_TOKEN_SOURCE_SHA256 = '397538dba08caa692165e93036804c2045fb646e7edbd719899036912853461e';
export const GENERIC_COMPILER_PIN = Object.freeze({
  version: '0.8.37+commit.f401782d.Emscripten.clang',
  packageVersion: '0.8.37',
  resolved: 'https://registry.npmjs.org/solc/-/solc-0.8.37.tgz',
  integrity: 'sha512-ieUYdPDRGNKMsZpCfi9tY64Q+ASoL8tyhLuvf9cFiqDs+6ijlx8Wn2CRi0N71AlCvRx0V092rlUYu3b3PuxWlA==',
  lockSHA256: '01676bb5abe650970edb26246286dec92d8ce05d38c797723e129f4814b369c4',
  soljsonSHA256: '221d7a667378b5068d913e75fe092507e061363cd1d23b64c49ae82febabad4c',
});
const MODES = Object.freeze(Object.keys(GENERIC_INPUT_WORDS));
const EIP170_LIMIT = 24_576;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const compiledHere = new WeakSet();
const address = value => { assert.match(value, /^0x[0-9a-f]{40}$/i, 'GENERIC_ADDRESS'); return value.toLowerCase(); };
const bytes32 = value => { assert.match(value, /^0x[0-9a-f]{64}$/i, 'GENERIC_BYTES32'); return value.toLowerCase(); };
const hex = value => `0x${BigInt(value).toString(16)}`;
function word(value) {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0), 'GENERIC_ABI_SAFE_INTEGER');
  assert.ok(['number', 'bigint', 'string'].includes(typeof value), 'GENERIC_ABI_INTEGER');
  if (typeof value === 'string') assert.match(value, /^(?:0|[1-9][0-9]*|0x[0-9a-f]+)$/i, 'GENERIC_ABI_INTEGER');
  const n = BigInt(value); assert.ok(n >= 0n && n < (1n << 256n), 'GENERIC_ABI_WORD_RANGE');
  return n.toString(16).padStart(64, '0');
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item); Object.freeze(value);
  }
  return value;
}
function artifactMethod(artifact, signature) {
  const selector = artifact?.evm?.methodIdentifiers?.[signature];
  assert.match(selector, /^[0-9a-f]{8}$/i, `GENERIC_MISSING_METHOD_${signature}`);
  const matches = artifact.abi.filter(entry => entry.type === 'function' &&
    `${entry.name}(${entry.inputs.map(input => input.type).join(',')})` === signature);
  assert.equal(matches.length, 1, 'GENERIC_METHOD_ABI_MISMATCH');
  return { selector, abi: matches[0] };
}
function staticWord(type, value) {
  if (type === 'address') return word(address(value));
  if (type === 'bytes32') return bytes32(value).slice(2);
  if (type === 'bool') { assert.equal(typeof value, 'boolean', 'GENERIC_ABI_BOOLEAN'); return word(value ? 1 : 0); }
  const uint = /^uint(8|16|32|64|128|256)$/.exec(type);
  assert.ok(uint, `GENERIC_UNSUPPORTED_STATIC_ABI_${type}`);
  const encoded = word(value); assert.ok(BigInt(`0x${encoded}`) < (1n << BigInt(uint[1])), 'GENERIC_ABI_UINT_RANGE'); return encoded;
}

/** Static ABI subset used by pool/token getters and exact local approvals.
 * Signatures and selectors must both exist in the actual compiler artifact.
 */
export function genericStaticCalldata(artifact, signature, args = []) {
  const { selector, abi } = artifactMethod(artifact, signature);
  assert.equal(args.length, abi.inputs.length, 'GENERIC_ABI_ARGUMENT_COUNT');
  return `0x${selector}${args.map((value, i) => staticWord(abi.inputs[i].type, value)).join('')}`;
}

/** Exact (bytes,bytes32[]) ABI, or S66's guarded four-argument ABI. */
export function genericProofCalldata(artifact, signature, proof, publicInputs, guards) {
  const { selector, abi } = artifactMethod(artifact, signature);
  assert.ok(Buffer.isBuffer(proof) || proof instanceof Uint8Array, 'GENERIC_PROOF_BYTES');
  assert.ok(Array.isArray(publicInputs), 'GENERIC_PUBLIC_INPUTS');
  const guarded = guards !== undefined;
  assert.deepEqual(abi.inputs.map(input => input.type), guarded ? ['bytes', 'bytes32[]', 'uint64', 'bytes32'] : ['bytes', 'bytes32[]'], 'GENERIC_PROOF_ABI');
  const data = Buffer.from(proof), padded = Math.ceil(data.length / 32) * 32;
  const headBytes = guarded ? 128 : 64;
  let head = word(headBytes) + word(headBytes + 32 + padded);
  if (guarded) {
    assert.ok(guards && typeof guards === 'object' && !Array.isArray(guards), 'GENERIC_GUARDS');
    assert.deepEqual(Object.keys(guards).sort(), ['expectedPostRoot', 'expectedSequence'], 'GENERIC_GUARD_FIELDS');
    head += staticWord('uint64', guards.expectedSequence) + staticWord('bytes32', guards.expectedPostRoot);
  }
  const proofTail = word(data.length) + data.toString('hex').padEnd(padded * 2, '0');
  return `0x${selector}${head}${proofTail}${word(publicInputs.length)}${publicInputs.map(word).join('')}`;
}

function sourceInput(sourceMap) {
  assert.ok(sourceMap && typeof sourceMap === 'object' && !Array.isArray(sourceMap), 'GENERIC_SOURCE_MAP');
  const required = [...MODES, 'pool'];
  assert.ok(required.every(mode => Object.hasOwn(sourceMap, mode)), 'GENERIC_MISSING_PINNED_SOURCE');
  assert.ok(Object.keys(sourceMap).every(mode => required.includes(mode) || mode === 'token'), 'GENERIC_UNKNOWN_SOURCE');
  const sources = {};
  for (const mode of [...required, ...(Object.hasOwn(sourceMap, 'token') ? ['token'] : [])]) {
    const record = sourceMap[mode];
    assert.ok(record && typeof record === 'object' && !Array.isArray(record), 'GENERIC_SOURCE_RECORD');
    assert.deepEqual(Object.keys(record).sort(), ['content', 'sha256'], 'GENERIC_SOURCE_RECORD_FIELDS');
    assert.ok(typeof record.content === 'string' && record.content.length > 0, 'GENERIC_SOURCE_CONTENT');
    assert.match(record.sha256, /^[0-9a-f]{64}$/, 'GENERIC_SOURCE_PIN');
    assert.equal(sha(record.content), record.sha256, `GENERIC_SOURCE_HASH_${mode}`);
    if (mode === 'pool') assert.equal(record.sha256, GENERIC_POOL_SOURCE_SHA256, 'GENERIC_POOL_REVIEWED_SOURCE');
    if (mode === 'token') assert.equal(record.sha256, GENERIC_TOKEN_SOURCE_SHA256, 'GENERIC_TOKEN_REVIEWED_SOURCE');
    sources[mode] = { name: GENERIC_SOURCE_NAMES[mode], content: record.content, sha256: record.sha256 };
  }
  return sources;
}

/** Interpret only the generated verifier's constant constructor profile from
 * the AST of the already hash-checked source. No deployed bytes or getter
 * responses participate in deriving these expected immutable values.
 */
export function deriveGenericVerifierImmutables(ast, expectedPublicInputs) {
  assert.equal(ast?.nodeType, 'SourceUnit', 'GENERIC_VERIFIER_SOURCE_AST');
  const nodes = new Map();
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Number.isSafeInteger(node.id)) nodes.set(node.id, node);
    for (const value of Object.values(node)) if (value && typeof value === 'object') {
      if (Array.isArray(value)) value.forEach(walk); else walk(value);
    }
  };
  walk(ast);
  const one = (values, message) => { assert.equal(values.length, 1, message); return values[0]; };
  const honk = one(ast.nodes.filter(node => node.nodeType === 'ContractDefinition' && node.name === 'HonkVerifier'), 'GENERIC_HONK_CONTRACT_AST');
  assert.equal(honk.nodes.filter(node => node.kind === 'constructor').length, 0, 'GENERIC_HONK_UNEXPECTED_CONSTRUCTOR');
  const inherited = one(honk.baseContracts, 'GENERIC_HONK_BASE_COUNT');
  const base = nodes.get(inherited.baseName.referencedDeclaration);
  assert.equal(base?.name, 'BaseZKHonkVerifier', 'GENERIC_HONK_BASE_PROFILE');
  const constructor = one(base.nodes.filter(node => node.nodeType === 'FunctionDefinition' && node.kind === 'constructor'), 'GENERIC_HONK_BASE_CONSTRUCTOR');
  const parameters = constructor.parameters.parameters;
  assert.deepEqual(parameters.map(node => node.name), ['_N', '_logN', '_vkHash', '_numPublicInputs'], 'GENERIC_HONK_CONSTRUCTOR_PARAMETERS');
  assert.ok(parameters.every(node => node.typeDescriptions.typeString === 'uint256'), 'GENERIC_HONK_CONSTRUCTOR_TYPES');
  assert.equal(inherited.arguments.length, parameters.length, 'GENERIC_HONK_BASE_ARGUMENT_COUNT');
  const bindings = new Map(), evaluating = new Set();
  const evaluate = expression => {
    assert.ok(expression, 'GENERIC_HONK_CONSTANT_EXPRESSION');
    let result;
    if (expression.nodeType === 'Literal' && expression.kind === 'number') {
      result = BigInt(`0x${word(expression.value)}`);
    } else if (expression.nodeType === 'Identifier') {
      const id = expression.referencedDeclaration;
      if (bindings.has(id)) return bindings.get(id);
      const declaration = nodes.get(id);
      assert.ok(declaration?.nodeType === 'VariableDeclaration' && declaration.constant === true && declaration.value, 'GENERIC_HONK_NONCONSTANT_REFERENCE');
      assert.ok(!evaluating.has(id), 'GENERIC_HONK_CONSTANT_CYCLE'); evaluating.add(id);
      try { result = evaluate(declaration.value); } finally { evaluating.delete(id); }
    } else if (expression.nodeType === 'BinaryOperation' && expression.operator === '+') {
      result = evaluate(expression.leftExpression) + evaluate(expression.rightExpression);
    } else throw new Error(`GENERIC_HONK_UNSUPPORTED_CONSTANT_${expression.nodeType}`);
    word(result); return result;
  };
  const constant = (name, scope = ast.nodes) => evaluate(one(scope.filter(node => node.nodeType === 'VariableDeclaration' && node.name === name && node.constant === true), `GENERIC_HONK_CONSTANT_${name}`).value);
  const argumentNames = ['N', 'LOG_N', 'VK_HASH', 'NUMBER_OF_PUBLIC_INPUTS'];
  for (let i = 0; i < parameters.length; i++) {
    assert.equal(inherited.arguments[i].nodeType, 'Identifier', 'GENERIC_HONK_BASE_CONSTANT_ARGUMENT');
    assert.equal(nodes.get(inherited.arguments[i].referencedDeclaration)?.name, argumentNames[i], 'GENERIC_HONK_BASE_ARGUMENT_BINDING');
    bindings.set(parameters[i].id, evaluate(inherited.arguments[i]));
  }
  const names = ['$N', '$LOG_N', '$VK_HASH', '$NUM_PUBLIC_INPUTS', '$MSMSize'];
  const declarations = base.nodes.filter(node => node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable');
  assert.deepEqual(declarations.map(node => node.name).sort(), [...names].sort(), 'GENERIC_HONK_IMMUTABLE_PROFILE');
  const values = {};
  assert.equal(constructor.body.statements.length, names.length, 'GENERIC_HONK_CONSTRUCTOR_STATEMENTS');
  for (const statement of constructor.body.statements) {
    const assignment = statement.expression;
    assert.ok(statement.nodeType === 'ExpressionStatement' && assignment?.nodeType === 'Assignment' && assignment.operator === '=' && assignment.leftHandSide.nodeType === 'Identifier', 'GENERIC_HONK_CONSTRUCTOR_ASSIGNMENT');
    const declaration = nodes.get(assignment.leftHandSide.referencedDeclaration);
    assert.ok(declarations.includes(declaration) && !Object.hasOwn(values, declaration.name), 'GENERIC_HONK_IMMUTABLE_ASSIGNMENT');
    values[declaration.name] = evaluate(assignment.rightHandSide);
  }
  for (let i = 0; i < argumentNames.length; i++) assert.equal(values[names[i]], constant(argumentNames[i]), 'GENERIC_HONK_IMMUTABLE_CONSTANT_BINDING');
  assert.ok(values.$LOG_N > 0n && values.$LOG_N < 32n, 'GENERIC_HONK_LOG_N_RANGE');
  assert.equal(values.$N, 1n << values.$LOG_N, 'GENERIC_HONK_CIRCUIT_SIZE');
  assert.ok(values.$VK_HASH > 0n, 'GENERIC_HONK_VK_HASH');
  assert.equal(constant('PAIRING_POINTS_SIZE'), 8n, 'GENERIC_HONK_PAIRING_INPUT_PROFILE');
  assert.equal(values.$NUM_PUBLIC_INPUTS, BigInt(expectedPublicInputs) + constant('PAIRING_POINTS_SIZE'), 'GENERIC_HONK_PUBLIC_INPUT_BINDING');
  assert.equal(values.$MSMSize, constant('NUMBER_UNSHIFTED_ZK') + values.$LOG_N + constant('LIBRA_COMMITMENTS', base.nodes) + 2n, 'GENERIC_HONK_MSM_BINDING');
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, `0x${word(value)}`]));
}

/** Hash verification happens before loading the exact installed soljson module.
 * Bind the official compiler's Standard JSON C API directly with null callback
 * pointers, avoiding the wrapper's remote-version loader altogether.
 */
async function compiler() {
  const toolRoot = await realpath(join(projectRoot, 'tools/solidity-js'));
  const lockBytes = await readFile(join(toolRoot, 'package-lock.json'));
  assert.equal(sha(lockBytes), GENERIC_COMPILER_PIN.lockSHA256, 'GENERIC_SOLC_LOCK_HASH');
  const pin = JSON.parse(lockBytes).packages?.['node_modules/solc'];
  assert.equal(pin?.version, GENERIC_COMPILER_PIN.packageVersion, 'GENERIC_SOLC_VERSION_PIN');
  assert.equal(pin.resolved, GENERIC_COMPILER_PIN.resolved, 'GENERIC_SOLC_ORIGIN_PIN');
  assert.equal(pin.integrity, GENERIC_COMPILER_PIN.integrity, 'GENERIC_SOLC_INTEGRITY_PIN');
  const modulePath = await realpath(join(toolRoot, 'node_modules/solc/soljson.js'));
  assert.ok(modulePath.startsWith(toolRoot + sep), 'GENERIC_SOLC_PATH_ESCAPE');
  assert.equal(sha(await readFile(modulePath)), GENERIC_COMPILER_PIN.soljsonSHA256, 'GENERIC_SOLJSON_HASH');
  const require = createRequire(join(toolRoot, 'package.json'));
  const soljson = require(modulePath);
  const version = soljson.cwrap('solidity_version', 'string', [])();
  assert.equal(version, GENERIC_COMPILER_PIN.version, 'GENERIC_SOLC_BUILD');
  const compile = soljson.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
  const reset = soljson.cwrap('solidity_reset', null, []);
  return { version, compile: input => { try { return compile(JSON.stringify(input), 0, 0); } finally { reset(); } } };
}

/** Compile only supplied, hash-checked sources. Each self-contained generated
 * verifier has its own namespace and conservative legacy compiler settings.
 * Pool settings match scripts/compile-generic-pool.mjs. No source is fetched.
 */
export async function compileGenericPool(sourceMap, onCompiled = async () => {}) {
  assert.equal(typeof onCompiled, 'function', 'GENERIC_COMPILE_CALLBACK');
  const sources = sourceInput(sourceMap), solc = await compiler();
  const contracts = {}, settings = {}, sourceReports = {}, immutableNames = {}, verifierImmutableValues = {}, warnings = [];
  const started = performance.now();
  for (const [mode, source] of Object.entries(sources)) {
    const sourceSettings = {
      optimizer: { enabled: true, runs: mode === 'pool' ? 200 : 1 },
      viaIR: mode === 'pool', evmVersion: 'cancun', metadata: { bytecodeHash: 'none' },
      outputSelection: { '*': { '': ['ast'], '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.object', 'evm.deployedBytecode.linkReferences', 'evm.deployedBytecode.immutableReferences', 'evm.methodIdentifiers'] } },
    };
    const input = { language: 'Solidity', sources: { [source.name]: { content: source.content } }, settings: sourceSettings };
    const phaseStarted = performance.now();
    const output = JSON.parse(solc.compile(input));
    const errors = (output.errors ?? []).filter(error => error.severity === 'error');
    if (errors.length) { const error = new Error(`GENERIC_COMPILATION_FAILED_${mode}`); error.compilerErrors = errors; throw error; }
    assert.ok(output.contracts?.[source.name], `GENERIC_COMPILED_SOURCE_MISSING_${mode}`);
    assert.deepEqual(Object.keys(output.contracts), [source.name], 'GENERIC_UNSUPPLIED_COMPILED_SOURCE');
    contracts[source.name] = output.contracts[source.name]; settings[mode] = sourceSettings;
    const names = {};
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable') names[String(node.id)] = node.name;
      for (const value of Object.values(node)) if (value && typeof value === 'object') {
        if (Array.isArray(value)) value.forEach(walk); else walk(value);
      }
    };
    walk(output.sources?.[source.name]?.ast); immutableNames[source.name] = names;
    sourceReports[mode] = { name: source.name, sha256: source.sha256, bytes: Buffer.byteLength(source.content), milliseconds: performance.now() - phaseStarted };
    warnings.push(...(output.errors ?? []).filter(error => error.severity !== 'error').map(error => ({ mode, message: error.formattedMessage ?? error.message })));
    if (MODES.includes(mode)) {
      verifierImmutableValues[mode] = deriveGenericVerifierImmutables(output.sources[source.name].ast, GENERIC_INPUT_WORDS[mode]);
      const artifact = contracts[source.name].HonkVerifier;
      const { abi } = artifactMethod(artifact, 'verify(bytes,bytes32[])');
      assert.equal(abi.stateMutability, 'view', 'GENERIC_VERIFIER_VIEW');
      assert.deepEqual(abi.outputs.map(output => output.type), ['bool'], 'GENERIC_VERIFIER_RETURN');
    }
    await onCompiled({ mode, ...sourceReports[mode] });
  }
  const pool = contracts[GENERIC_SOURCE_NAMES.pool]?.PrivateGenericAssetNotePool;
  assert.ok(pool?.evm?.deployedBytecode?.object, 'GENERIC_POOL_ARTIFACT_MISSING');
  assert.ok(pool.evm.deployedBytecode.object.length / 2 <= EIP170_LIMIT, 'GENERIC_POOL_EIP170_SIZE');
  assert.deepEqual(pool.abi.find(item => item.type === 'constructor')?.inputs.map(input => input.type),
    ['address', 'bytes32', 'bytes32', 'address', 'address', 'address', 'address', 'address'], 'GENERIC_CONSTRUCTOR_ABI');
  artifactMethod(pool, 'reserveGenericGuarded(bytes,bytes32[],uint64,bytes32)');
  artifactMethod(pool, 'recoverGeneric(bytes,bytes32[])');
  const result = freeze({ classification: 'ACTUAL_SOURCE_COMPILATION_NOT_PROOF_ACCEPTANCE', output: { contracts },
    sourceNames: { ...GENERIC_SOURCE_NAMES }, sources: sourceReports, settings, immutableNames, verifierImmutableValues,
    compiler: { ...GENERIC_COMPILER_PIN, api: 'solidity_compile; callback=0; context=0' },
    warnings, milliseconds: performance.now() - started, deployed: false, actualProofsVerified: false });
  compiledHere.add(result); return result;
}

/** Compare every runtime byte, substituting only compiler-declared link and
 * immutable locations. Immutable values must match independently computed
 * constructor expectations; no blanket masking can hide incorrect values.
 */
export function assertGenericRuntimeCode({ artifact, actualCode, deployedAddress, libraries, immutableNames, immutableValues = {}, isLibrary = false }) {
  assert.match(actualCode, /^0x(?:[0-9a-f]{2})+$/i, 'GENERIC_DEPLOYED_CODE_MISSING');
  const template = linkPrivateBytecode(artifact.evm.deployedBytecode.object, artifact.evm.deployedBytecode.linkReferences, libraries);
  const expected = Buffer.from(template, 'hex'), actual = Buffer.from(actualCode.slice(2), 'hex');
  assert.equal(actual.length, expected.length, 'GENERIC_DEPLOYED_CODE_LENGTH');
  assert.ok(actual.length <= EIP170_LIMIT, 'GENERIC_DEPLOYED_EIP170_SIZE');
  const used = [];
  if (isLibrary && /^73(?:00){20}3014/.test(template)) {
    Buffer.from(address(deployedAddress).slice(2), 'hex').copy(expected, 1); used.push([1, 21]);
  }
  for (const [id, ranges] of Object.entries(artifact.evm.deployedBytecode.immutableReferences ?? {})) {
    const name = immutableNames[id];
    assert.ok(name && Object.hasOwn(immutableValues, name), `GENERIC_UNRESOLVED_IMMUTABLE_${id}`);
    const value = Buffer.from(word(immutableValues[name]), 'hex');
    for (const { start, length } of ranges) {
      assert.ok(Number.isSafeInteger(start) && start >= 0 && length === 32 && start + length <= actual.length, 'GENERIC_IMMUTABLE_RANGE');
      assert.ok(used.every(([a, b]) => start + length <= a || start >= b), 'GENERIC_IMMUTABLE_OVERLAP');
      used.push([start, start + length]); value.copy(expected, start);
    }
  }
  assert.deepEqual(actual, expected, 'GENERIC_EXACT_DEPLOYED_RUNTIME');
  return { exactRuntimeMatch: true, runtimeBytes: actual.length, runtimeSHA256: sha(actual) };
}

/** Runtime lifecycle stays with the caller. On any assertion or failed
 * deployment, partial deployments/receipts remain accessible for diagnosis.
 * Native asset is the default. A token requires the exact pinned token source
 * and is freshly deployed here, never an arbitrary caller-selected contract.
 */
export async function deployGenericPool(runtime, options) {
  await assertLocalEvm(runtime);
  assert.ok(options && typeof options === 'object' && !Array.isArray(options), 'GENERIC_DEPLOYMENT_OPTIONS');
  assert.ok(Object.keys(options).every(key => ['sources', 'compilation', 'policy', 'deploymentDomain', 'asset', 'initialSupply', 'onDeployment'].includes(key)), 'GENERIC_DEPLOYMENT_OPTION_FIELDS');
  assert.ok(Boolean(options.sources) !== Boolean(options.compilation), 'GENERIC_ONE_COMPILATION_INPUT');
  const policy = bytes32(options.policy), deploymentDomain = bytes32(options.deploymentDomain);
  assert.ok(BigInt(policy) !== 0n && BigInt(deploymentDomain) !== 0n, 'GENERIC_NONZERO_DOMAIN');
  assert.ok(options.asset === undefined || options.asset === GENERIC_NATIVE_ASSET || options.asset === 'local-test-token', 'GENERIC_ASSET_PROFILE');
  const onDeployment = options.onDeployment ?? (async () => {});
  assert.equal(typeof onDeployment, 'function', 'GENERIC_DEPLOYMENT_CALLBACK');
  const compilation = options.compilation ?? await compileGenericPool(options.sources);
  assert.ok(compiledHere.has(compilation), 'GENERIC_COMPILATION_CAPABILITY_REQUIRED');
  const deployments = [], deployed = new Map(), active = new Set();
  const contract = (source, name) => {
    const artifact = compilation.output.contracts[source]?.[name];
    assert.ok(artifact, `GENERIC_MISSING_ARTIFACT_${source}:${name}`); return artifact;
  };
  const deploy = async (source, name, args = [], immutableValues = {}, isLibrary = false) => {
    const key = `${source}:${name}`;
    if (deployed.has(key)) { assert.equal(args.length, 0, 'GENERIC_LIBRARY_CONSTRUCTOR_REUSE'); return deployed.get(key); }
    assert.ok(!active.has(key), 'GENERIC_CYCLIC_LIBRARY_LINK'); active.add(key);
    const artifact = contract(source, name), libraries = {}, linkedLibraries = [];
    const constructorInputs = artifact.abi.find(item => item.type === 'constructor')?.inputs ?? [];
    assert.equal(args.length, constructorInputs.length, 'GENERIC_CONSTRUCTOR_ARGUMENT_COUNT');
    for (const references of [artifact.evm.bytecode.linkReferences, artifact.evm.deployedBytecode.linkReferences]) {
      for (const [librarySource, names] of Object.entries(references ?? {})) for (const libraryName of Object.keys(names)) {
        const libraryKey = `${librarySource}:${libraryName}`;
        if (!libraries[libraryKey]) {
          const library = await deploy(librarySource, libraryName, [], {}, true);
          libraries[libraryKey] = library.address; linkedLibraries.push({ source: librarySource, name: libraryName, address: library.address });
        }
      }
    }
    assert.ok(artifact.evm.deployedBytecode.object.length / 2 <= EIP170_LIMIT, 'GENERIC_ARTIFACT_EIP170_SIZE');
    const constructorData = args.map((value, i) => staticWord(constructorInputs[i].type, value)).join('');
    const bytecode = linkPrivateBytecode(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, libraries) + constructorData;
    const receipt = await runtime.send(`deploy ${key}`, { data: `0x${bytecode}` });
    const deployedAddress = address(receipt.contractAddress);
    const code = await runtime.code(deployedAddress, receipt.blockNumber);
    const values = typeof immutableValues === 'function' ? await immutableValues(deployedAddress) : immutableValues;
    const match = assertGenericRuntimeCode({ artifact, actualCode: code, deployedAddress, libraries,
      immutableNames: compilation.immutableNames[source], immutableValues: values, isLibrary });
    await runtime.assertCanonical(receipt);
    const record = { source, contractName: name, address: deployedAddress, linkedLibraries, receipt,
      constructorArgumentsSHA256: sha(Buffer.from(constructorData, 'hex')),
      creationBytes: bytecode.length / 2, creationSHA256: sha(Buffer.from(bytecode, 'hex')),
      codeHash: await runtime.keccak(code), immutableValues: values, ...match, proofAcceptanceClaim: false };
    deployments.push(record); deployed.set(key, record); active.delete(key);
    await onDeployment(record); return record;
  };
  try {
    const verifiers = {};
    for (const mode of MODES) {
      const source = GENERIC_SOURCE_NAMES[mode], record = await deploy(source, 'HonkVerifier', [], compilation.verifierImmutableValues[mode]);
      verifiers[mode] = { ...record, artifact: contract(source, 'HonkVerifier') };
    }
    let asset = GENERIC_NATIVE_ASSET, tokenArtifact;
    if (options.asset === 'local-test-token') {
      tokenArtifact = contract(GENERIC_SOURCE_NAMES.token, 'PrivateAssetTestToken');
      const supply = options.initialSupply ?? 1_000_000_000n;
      assert.ok(BigInt(`0x${word(supply)}`) > 0n, 'GENERIC_TOKEN_SUPPLY');
      asset = (await deploy(GENERIC_SOURCE_NAMES.token, 'PrivateAssetTestToken', [supply])).address;
    } else assert.equal(options.initialSupply, undefined, 'GENERIC_NATIVE_SUPPLY_OPTION');
    const assetCodeHash = asset === GENERIC_NATIVE_ASSET ? `0x${'00'.repeat(32)}` : await runtime.keccak(await runtime.code(asset));
    const assetIdentity = derivePrivateAssetIdentity(runtime.metadata.chainId, asset, assetCodeHash);
    const verifierFields = {
      deposit_balance: 'depositBalanceVerifier', withdraw_balance: 'withdrawBalanceVerifier',
      withdraw: 'withdrawVerifier', reserve_generic: 'reserveGenericVerifier', recover_generic: 'recoverGenericVerifier',
    };
    const values = { asset, assetCodeHash, assetIdentity, deploymentDomain, policy };
    for (const mode of MODES) {
      values[verifierFields[mode]] = verifiers[mode].address;
      values[`${verifierFields[mode]}CodeHash`] = verifiers[mode].codeHash;
    }
    const pool = await deploy(GENERIC_SOURCE_NAMES.pool, 'PrivateGenericAssetNotePool',
      [asset, deploymentDomain, policy, ...MODES.map(mode => verifiers[mode].address)],
      poolAddress => ({ ...values, scope: derivePrivateAssetPoolScope(runtime.metadata.chainId, poolAddress, deploymentDomain, assetIdentity) }));
    const artifact = contract(GENERIC_SOURCE_NAMES.pool, 'PrivateGenericAssetNotePool');
    const data = (signature, args = []) => genericStaticCalldata(artifact, signature, args);
    const call = (signature, args = [], block = 'latest') => runtime.call({ to: pool.address, data: data(signature, args) }, block);
    const scope = derivePrivateAssetPoolScope(runtime.metadata.chainId, pool.address, deploymentDomain, assetIdentity);
    for (const [name, value] of Object.entries({ ...values, scope })) {
      assert.equal((await call(`${name}()`)).toLowerCase(), `0x${word(value)}`, `GENERIC_IMMUTABLE_GETTER_${name}`);
    }
    assert.equal(BigInt(await call('EPOCH_SECONDS()')), 600n, 'GENERIC_EPOCH_SECONDS');
    assert.equal(BigInt(await call('GENERIC_FULFILLMENT_ENABLED()')), 0n, 'GENERIC_FULFILLMENT_MUST_BE_DISABLED');
    const proofData = (mode, proof, publicInputs, guards) => {
      assert.ok(MODES.includes(mode), 'GENERIC_PROOF_MODE');
      assert.equal(publicInputs?.length, GENERIC_INPUT_WORDS[mode], 'GENERIC_PUBLIC_INPUT_COUNT');
      const method = { deposit_balance: 'depositBalance', withdraw_balance: 'withdrawBalance', withdraw: 'withdraw', reserve_generic: 'reserveGenericGuarded', recover_generic: 'recoverGeneric' }[mode];
      if (mode === 'reserve_generic') assert.ok(guards, 'GENERIC_RESERVE_GUARDS_REQUIRED');
      else assert.equal(guards, undefined, 'GENERIC_UNEXPECTED_GUARDS');
      return genericProofCalldata(artifact, `${method}(bytes,bytes32[]${mode === 'reserve_generic' ? ',uint64,bytes32' : ''})`, proof, publicInputs, guards);
    };
    const verify = async (mode, proof, publicInputs, block = 'latest') => {
      assert.ok(MODES.includes(mode), 'GENERIC_VERIFIER_MODE');
      assert.equal(publicInputs?.length, GENERIC_INPUT_WORDS[mode], 'GENERIC_PUBLIC_INPUT_COUNT');
      const verifier = verifiers[mode];
      const result = await runtime.call({ to: verifier.address, data: genericProofCalldata(verifier.artifact, 'verify(bytes,bytes32[])', proof, publicInputs) }, block);
      assert.ok(result === `0x${word(0)}` || result === `0x${word(1)}`, 'GENERIC_VERIFIER_BOOL');
      return result === `0x${word(1)}`;
    };
    const assetData = (signature, args = []) => {
      assert.ok(tokenArtifact, 'GENERIC_NATIVE_HAS_NO_TOKEN_ABI'); return genericStaticCalldata(tokenArtifact, signature, args);
    };
    return { address: pool.address, artifact, asset, assetCodeHash, assetIdentity, scope, policy, deploymentDomain,
      compilation, deployments, verifiers, selectors: artifact.evm.methodIdentifiers, data, call, proofData,
      guardedReserveData: (proof, inputs, guards) => proofData('reserve_generic', proof, inputs, guards),
      verify, send: runtime.send, assetData,
      assetBalance: async (holder, block = 'latest') => asset === GENERIC_NATIVE_ASSET ? runtime.balance(holder, block) :
        BigInt(await runtime.call({ to: asset, data: assetData('balanceOf(address)', [holder]) }, block)),
      fundingTransactionValue: amount => { const n = BigInt(`0x${staticWord('uint64', amount)}`); assert.ok(n > 0n, 'GENERIC_DEPOSIT_AMOUNT'); return asset === GENERIC_NATIVE_ASSET ? hex(n) : '0x0'; },
      beforeDeposit: async (amount, from = runtime.accounts[0]) => {
        assert.ok(BigInt(`0x${staticWord('uint64', amount)}`) > 0n, 'GENERIC_DEPOSIT_AMOUNT');
        return asset === GENERIC_NATIVE_ASSET ? null : runtime.send('approve exact local deposit', { from, to: asset, data: assetData('approve(address,uint256)', [pool.address, amount]) });
      },
      snapshot: async () => {
        const header = await runtime.block();
        const [rawState, rawHistory, rawBacking] = await Promise.all([
          call('canonicalState()', [], header.number), call('canonicalRootHistory()', [], header.number), call('canonicalBacking()', [], header.number),
        ]);
        await runtime.assertCanonical(header);
        return { header, blockNumber: header.number, blockHash: header.hash, scope, policy, asset, assetIdentity, rawState, rawHistory, rawBacking };
      },
      get receipts() { return runtime.receipts; },
    };
  } catch (error) {
    error.partialDeployments = deployments; error.localReceipts = runtime.receipts;
    // The caller decides whether to retain or clean up its owned runtime.
    throw error;
  }
}
