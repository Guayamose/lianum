/** Read-only loader for the reviewed retained ledger and verifier builds.
 * No caller paths, artifacts or pins are accepted. Loading reads and checks
 * retained files; it never starts a compiler, backend, prover, RPC or EVM. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, FLAT, GOLDEN, relation } from '../../../proof-workers/catalog.mjs';
import { regular, hash, resourceModuleURL, circuitIdentity, versionDirectory,
  loadCompiled, loadPrepared } from '../../../proof-workers/tooling.mjs';
import { GENERIC_COMPILER_PIN, deriveGenericVerifierImmutables }
  from '../../../../../omnichain-product/src/paeg/local-deployment.mjs';
import { NATIVE_SOURCE_PINS } from '../../../../../omnichain-product/src/paeg/native-deployment.mjs';
import { loadProofProfile } from '../../../../../omnichain-product/src/paeg/proof-worker.mjs';
import { FLAT_BUILD_PIN, FLAT_VERIFIER_ORDER } from './deployment-plan.mjs';

const LEDGER_SHA256 = '1ca926abfbe8a40218c6891367bbe3acf0f7b02b5990f7d933a47c1f6d61867f';
const VERIFIER_RUN = '0db5cb64-67cf-47fb-9608-4036813c4bc6';
const RESULT_SHA256 = '012e1ebd4fc9e4e5ba92abe520df85936c37182ca4a56f6d34cd0f8661c6e2d9';
const RESOURCES_SHA256 = 'e8ac563bfa686d30eb8da4c561ce1a47f789180155a8589fd737defe75ca6969';
const VERIFIER_DIRECTORY = join(ROOT, '.local/proof-workers/verifier-compilation', VERIFIER_RUN);
// The retained twelve verifier artifacts still authenticate their original
// circuits/keys. This exact host extension adds only two separate claim roles;
// every old ABI, role, parent, setting and limit was compared to canonical v18.
// No arbitrary current hash or caller-provided compatibility exception exists.
// Current host-only successors are separately reviewed: source11 adds fixed
// prove-scope dependencies; the golden worker adds the original W39 child guard.
// The left side stays the exact historical generation pin. No artifact, circuit,
// ABI, key or generation evidence is replaced by these current source checks.
const CLAIM_HOST_EXTENSIONS = Object.freeze({
  'flat-wallet/proof-workers/tooling.mjs': [
    '08604f493e9abb62d50298464ddf79d4d80613d63804bbb9e074d7bdda022323',
    '18ac833e360d6450f62f9d6f53744eadaed9c202ddfc0f096c720bf0152b5ddc'],
  'flat-wallet/proof-workers/catalog.mjs': [
    '3978f7e3d3f6d255cf1a84954e41a04c2bbf76c29ec864aefec702457ba1f122',
    '5cfeba63766989166eeaff93e010431f74336f398b78cbad0d0e088a913acd69'],
  '../omnichain-product/src/paeg/proof-worker.mjs': [
    '4cb50f068a2484b0532b7cb4bdfe56753448d4339dfea03a62924fec2a4aa22f',
    '677f7b8957ae7e2269bff32fdb4621598fb443c0aa56dd4ebcea7cbd3b340ee6'],
  'flat-wallet/wallet-platform/modules/paeg/statements.mjs': [
    '3897b317312cdc448ec5b1582a2d20f7b4d495a29d8ea1294326e619a7612d65',
    'd494115f0b5b4148b57f8715e415daf6251908941c2bbc62a7fe49c0cd17e8df'],
});
const FLAT_ROLES = Object.freeze([...FLAT_VERIFIER_ORDER.slice(0, 8).map(([role]) => role), 'deposit_intent']);
const artifactRole = role => role === 'withdraw' ? 'withdraw_output' : role;
const LEGACY_SOURCES = Object.freeze({
  deposit_balance: 'experiments/private-core-proof/wallet-notes/.local/prepared/deposit_balance.sol',
  withdraw_balance: 'experiments/private-core-proof/wallet-notes/.local/prepared/withdraw_balance.sol',
  withdraw: 'evidence/m23-wallet-capability/2026-10-03T07-20-22-656Z/verifiers/withdraw.sol',
});
const OUTPUT_SELECTION = { '*': { '': ['ast'], '*': ['abi', 'evm.bytecode.object',
  'evm.bytecode.linkReferences', 'evm.deployedBytecode.object',
  'evm.deployedBytecode.linkReferences', 'evm.deployedBytecode.immutableReferences',
  'evm.methodIdentifiers'] } };
const VERIFIER_SETTINGS = { optimizer: { enabled: true, runs: 1 }, viaIR: false,
  evmVersion: 'cancun', metadata: { bytecodeHash: 'none' }, outputSelection: OUTPUT_SELECTION };

function freeze(value, seen = new Set()) {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value); Object.values(value).forEach(child => freeze(child, seen)); Object.freeze(value);
  }
  return value;
}
function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJSON(value[key])).join(',') + '}';
}
const digestJSON = value => hash(canonicalJSON(value));
function pinnedJSON(path, expected) {
  const bytes = regular(path);
  assert.equal(hash(bytes), expected, 'FLAT_ARTIFACT_RAW_FILE_PIN');
  return JSON.parse(bytes);
}
function compilerIdentity(compilation, profile, settings) {
  assert.equal(compilation.classification, 'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');
  assert.equal(compilation.profile, profile, 'FLAT_ARTIFACT_PROFILE');
  assert.deepEqual(compilation.compiler, GENERIC_COMPILER_PIN, 'FLAT_ARTIFACT_COMPILER_PIN');
  assert.deepEqual(compilation.settings, settings, 'FLAT_ARTIFACT_COMPILER_SETTINGS');
}
function namedContract(ast, name, kind) {
  assert.equal(ast?.nodeType, 'SourceUnit', 'FLAT_ARTIFACT_SOURCE_AST');
  const matches = ast.nodes.filter(node => node.nodeType === 'ContractDefinition' && node.name === name);
  assert.equal(matches.length, 1, 'FLAT_ARTIFACT_NAMED_CONTRACT');
  assert.equal(matches[0].contractKind, kind, 'FLAT_ARTIFACT_CONTRACT_KIND');
  return matches[0];
}
function immutableDeclarations(contract) {
  const declarations = contract.nodes.filter(node => node.nodeType === 'VariableDeclaration'
    && node.mutability === 'immutable');
  const names = {};
  for (const node of declarations) {
    assert.ok(node.stateVariable && Number.isSafeInteger(node.id), 'FLAT_ARTIFACT_IMMUTABLE_DECLARATION');
    assert.ok(!Object.hasOwn(names, node.id), 'FLAT_ARTIFACT_DUPLICATE_IMMUTABLE_ID');
    names[node.id] = node.name;
  }
  assert.equal(new Set(Object.values(names)).size, declarations.length, 'FLAT_ARTIFACT_DUPLICATE_IMMUTABLE_NAME');
  return names;
}
function loadLedger() {
  const compilation = pinnedJSON(join(ROOT, '.local/contracts', FLAT_BUILD_PIN.attempt, 'compiled.json'), LEDGER_SHA256);
  compilerIdentity(compilation, 'standard', { ...VERIFIER_SETTINGS,
    optimizer: { enabled: true, runs: 200 }, viaIR: true });
  assert.equal(digestJSON(compilation.settings), FLAT_BUILD_PIN.settingsSHA256, 'FLAT_ARTIFACT_LEDGER_SETTINGS');
  const sourceMap = {};
  assert.deepEqual(Object.keys(compilation.sourceASTs).sort(), Object.keys(FLAT_BUILD_PIN.sources).sort());
  for (const [name, [sourceHash, astHash]] of Object.entries(FLAT_BUILD_PIN.sources)) {
    const bytes = regular(join(ROOT, 'contracts', name));
    assert.equal(hash(bytes), sourceHash, 'FLAT_ARTIFACT_LEDGER_SOURCE');
    sourceMap[name] = { content: bytes.toString('utf8'), sha256: sourceHash };
    const records = compilation.sources.filter(record => record.name === name);
    assert.deepEqual(records, [{ name, sha256: sourceHash, bytes: bytes.length }], 'FLAT_ARTIFACT_LEDGER_SOURCE_RECORD');
    assert.equal(digestJSON(compilation.sourceASTs[name]), astHash, 'FLAT_ARTIFACT_LEDGER_AST');
  }
  assert.equal(compilation.sources.length, Object.keys(sourceMap).length, 'FLAT_ARTIFACT_LEDGER_SOURCE_COUNT');
  const artifacts = {};
  for (const [role, [source, name, expected]] of Object.entries(FLAT_BUILD_PIN.artifacts)) {
    const artifact = compilation.contracts[source]?.[name];
    assert.ok(artifact, 'FLAT_ARTIFACT_LEDGER_MISSING');
    assert.equal(digestJSON(artifact), expected, 'FLAT_ARTIFACT_LEDGER_PIN'); artifacts[role] = artifact;
  }
  const immutableNames = {};
  for (const role of ['hub', 'pool']) {
    const [source, name] = FLAT_BUILD_PIN.artifacts[role];
    immutableNames[role] = immutableDeclarations(namedContract(compilation.sourceASTs[source], name, 'contract'));
    assert.equal(Object.keys(immutableNames[role]).length, role === 'hub' ? 15 : 17, 'FLAT_ARTIFACT_LEDGER_IMMUTABLE_COUNT');
  }
  return { compilation, sourceMap, artifacts, immutableNames };
}
function loadReports() {
  const result = pinnedJSON(join(VERIFIER_DIRECTORY, 'result.json'), RESULT_SHA256);
  const resources = pinnedJSON(join(VERIFIER_DIRECTORY, 'resources.json'), RESOURCES_SHA256);
  assert.equal(result.format, 'FLAT_GENERATED_VERIFIER_COMPILATION_V1');
  assert.equal(result.classification, 'ACTUAL_KEY_SOURCES_COMPILED_NOT_DEPLOYED_OR_PROOF_ACCEPTED');
  assert.equal(resources.format, 'FLAT_INTEGRATION_CONSTRAINT_RESOURCES_V1');
  assert.equal(resources.suite, 'verifiers');
  for (const report of [result, resources]) {
    assert.equal(report.runId, VERIFIER_RUN); assert.equal(report.phase, 'completed');
    assert.equal(report.proofGenerated, false); assert.equal(report.nativeNodesStarted, false);
  }
  assert.equal(result.keyGenerated, false); assert.equal(resources.exitCode, 0);
  assert.deepEqual(resources.failures, []); assert.equal(resources.failure ?? null, null);
  assert.deepEqual(resources.sourcePins, result.sourcePins, 'FLAT_ARTIFACT_REPORT_SOURCE_PINS');
  assert.deepEqual(result.contracts.map(row => [row.relation, row.publicWords]),
    FLAT_VERIFIER_ORDER.map(([role, words]) => [artifactRole(role), words]), 'FLAT_ARTIFACT_FIXED_VERIFIER_ROLES');
  // Check the existing loader/identity helpers used below against the reviewed
  // report. The path set is closed here, never selected by report contents.
  for (const path of ['flat-wallet/proof-workers/catalog.mjs', 'flat-wallet/proof-workers/tooling.mjs',
    'flat-wallet/wallet-platform/modules/paeg/statements.mjs',
    '../omnichain-product/experiments/private-core-proof/wallet-notes/resources.mjs',
    '../omnichain-product/src/paeg/local-deployment.mjs',
    '../omnichain-product/src/paeg/native-deployment.mjs',
    '../omnichain-product/src/paeg/proof-worker.mjs']) {
    const records = result.sourcePins.local.filter(record => record.path === path);
    assert.equal(records.length, 1, 'FLAT_ARTIFACT_LOADER_SOURCE_RECORD');
    const extension = CLAIM_HOST_EXTENSIONS[path];
    if (extension) {
      assert.equal(records[0].sha256, extension[0], 'FLAT_ARTIFACT_HISTORICAL_SOURCE_PIN');
      assert.equal(hash(regular(join(FLAT, path))), extension[1], 'FLAT_ARTIFACT_CLAIM_EXTENSION_PIN');
    } else {
      assert.equal(hash(regular(join(FLAT, path))), records[0].sha256, 'FLAT_ARTIFACT_LOADER_SOURCE_PIN');
    }
  }
  return { result, resources };
}
function verifyABI(artifact) {
  const methods = artifact.abi.filter(item => item.type === 'function');
  assert.equal(methods.length, 1, 'FLAT_ARTIFACT_VERIFIER_METHOD_COUNT');
  const method = methods[0];
  assert.equal(method.name, 'verify'); assert.equal(method.stateMutability, 'view');
  assert.deepEqual(method.inputs.map(input => input.type), ['bytes', 'bytes32[]']);
  assert.deepEqual(method.outputs.map(output => output.type), ['bool']);
  assert.deepEqual(artifact.evm.methodIdentifiers, { 'verify(bytes,bytes32[])': 'ea50d0e4' }, 'FLAT_ARTIFACT_VERIFY_SELECTOR');
  const constructors = artifact.abi.filter(item => item.type === 'constructor');
  assert.ok(constructors.length <= 1 && constructors.every(item => item.inputs.length === 0
    && item.stateMutability === 'nonpayable'), 'FLAT_ARTIFACT_VERIFIER_CONSTRUCTOR');
}
function loadVerifierBuild(row) {
  const directory = join(VERIFIER_DIRECTORY, row.relation);
  const manifest = JSON.parse(regular(join(directory, 'manifest.json')));
  assert.deepEqual(manifest, row, 'FLAT_ARTIFACT_MANIFEST_REPORT_BINDING');
  const source = row.relation + '.sol'; assert.equal(row.source, source);
  const sourceBytes = regular(join(directory, source));
  assert.equal(hash(sourceBytes), row.sourceSHA256, 'FLAT_ARTIFACT_GENERATED_SOURCE_PIN');
  const compilation = pinnedJSON(join(directory, 'compiled.json'), row.compiledSHA256);
  compilerIdentity(compilation, 'verifier', VERIFIER_SETTINGS);
  assert.deepEqual(compilation.compiler, row.compiler); assert.deepEqual(compilation.settings, row.settings);
  assert.deepEqual(compilation.sources, [{ name: source, sha256: row.sourceSHA256, bytes: sourceBytes.length }]);
  assert.deepEqual(Object.keys(compilation.sourceASTs), [source]);
  assert.deepEqual(Object.keys(compilation.contracts), [source]);
  const ast = compilation.sourceASTs[source]; assert.equal(ast.absolutePath, source);
  namedContract(ast, 'HonkVerifier', 'contract');
  const immutableNames = immutableDeclarations(namedContract(ast, 'BaseZKHonkVerifier', 'contract'));
  const immutableValues = deriveGenericVerifierImmutables(ast, row.publicWords);
  assert.deepEqual(immutableNames, row.immutableNames, 'FLAT_ARTIFACT_IMMUTABLE_NAMES');
  assert.deepEqual(immutableValues, row.immutableValues, 'FLAT_ARTIFACT_IMMUTABLE_VALUES');
  const contracts = compilation.contracts[source], artifact = contracts.HonkVerifier;
  assert.ok(artifact, 'FLAT_ARTIFACT_HONK_REQUIRED'); verifyABI(artifact);
  const summaries = Object.entries(contracts).map(([name, item]) => ({ name,
    runtimeBytes: item.evm.deployedBytecode.object.length / 2,
    creationBytes: item.evm.bytecode.object.length / 2,
    runtimeHexTemplateSHA256: hash(item.evm.deployedBytecode.object), links: item.evm.bytecode.linkReferences }));
  assert.deepEqual(summaries, row.artifacts, 'FLAT_ARTIFACT_CONTRACT_SUMMARIES');
  assert.ok(summaries.every(item => item.runtimeBytes <= 24576 && item.creationBytes <= 49152), 'FLAT_ARTIFACT_EVM_SIZE');
  for (const kind of ['bytecode', 'deployedBytecode']) {
    const references = artifact.evm[kind].linkReferences;
    assert.deepEqual(Object.keys(references), [source], 'FLAT_ARTIFACT_LINK_SOURCE');
    assert.deepEqual(Object.keys(references[source]).sort(), ['RelationsLib', 'ZKTranscriptLib'], 'FLAT_ARTIFACT_LINK_LIBRARIES');
  }
  for (const name of ['RelationsLib', 'ZKTranscriptLib']) {
    namedContract(ast, name, 'library');
    const library = contracts[name]; assert.ok(library, 'FLAT_ARTIFACT_LINK_TARGET');
    assert.deepEqual(library.evm.bytecode.linkReferences, {});
    assert.deepEqual(library.evm.deployedBytecode.linkReferences, {});
    assert.deepEqual(library.evm.deployedBytecode.immutableReferences, {});
    assert.match(library.evm.deployedBytecode.object, /^73(?:00){20}3014/, 'FLAT_ARTIFACT_GENERATED_LIBRARY_GUARD');
  }
  return { source, sourceBytes, artifact, contracts, immutableNames, immutableValues, manifest };
}
function binaryKeyHeader(key, immutableValues, words) {
  assert.equal(key.length, 59 * 32, 'FLAT_ARTIFACT_BINARY_VK_SIZE');
  const word = index => BigInt('0x' + key.subarray(index * 32, (index + 1) * 32).toString('hex'));
  assert.equal(word(0), BigInt(immutableValues.$LOG_N), 'FLAT_ARTIFACT_BINARY_VK_LOG_N');
  assert.equal(1n << word(0), BigInt(immutableValues.$N), 'FLAT_ARTIFACT_BINARY_VK_N');
  assert.equal(word(1), BigInt(words + 8), 'FLAT_ARTIFACT_BINARY_VK_PUBLIC_INPUTS');
  assert.equal(word(1), BigInt(immutableValues.$NUM_PUBLIC_INPUTS), 'FLAT_ARTIFACT_BINARY_VK_AST_INPUTS');
  assert.equal(word(2), 5n, 'FLAT_ARTIFACT_BINARY_VK_PUBLIC_OFFSET');
}
async function flatLineage(role, row, build, toolchain, crs) {
  const spec = relation(role), identity = circuitIdentity(spec, toolchain);
  const sourceVersion = hash(JSON.stringify(identity));
  assert.equal(sourceVersion, row.lineage.sourceVersion, 'FLAT_ARTIFACT_CURRENT_SOURCE_VERSION');
  const context = { spec, toolchain, identity, sourceVersion, directory: versionDirectory(spec, sourceVersion) };
  const compiled = await loadCompiled(context), prepared = await loadPrepared(context, compiled, crs);
  assert.equal(compiled.manifestSHA256, row.lineage.compiledManifestSHA256, 'FLAT_ARTIFACT_COMPILED_LINEAGE');
  assert.equal(prepared.manifestSHA256, row.lineage.keyManifestSHA256, 'FLAT_ARTIFACT_KEY_LINEAGE');
  assert.equal(hash(prepared.key), row.lineage.keySHA256, 'FLAT_ARTIFACT_ACTUAL_KEY_PIN');
  assert.equal(prepared.key.length, row.lineage.keyBytes, 'FLAT_ARTIFACT_ACTUAL_KEY_SIZE');
  assert.equal(hash(prepared.solidity), row.lineage.soliditySHA256, 'FLAT_ARTIFACT_ACTUAL_SOURCE_PIN');
  assert.ok(prepared.solidity.equals(build.sourceBytes), 'FLAT_ARTIFACT_ACTUAL_GENERATED_SOURCE');
  binaryKeyHeader(prepared.key, build.immutableValues, spec.publicWords);
  assert.equal(BigInt(build.immutableValues.$VK_HASH), BigInt(prepared.manifest.keyHashField), 'FLAT_ARTIFACT_VK_HASH_MANIFEST');
  return { ...row.lineage, kind: 'CURRENT_CIRCUIT_RETAINED_KEY_AND_GENERATED_SOURCE',
    binaryKeyLoaded: true, binaryKeyHeaderMatchesAST: true,
    keyHashField: prepared.manifest.keyHashField, astVKHashMatchesGenerationManifest: true,
    independentVKHashRecomputed: false, proofAcceptanceEstablished: false,
    retainedLimitation: 'VK_HASH is bound to the checked generation manifest; no independent cryptographic VK hash recalculation is performed.' };
}
function legacyLineage(role, row, build) {
  const expected = NATIVE_SOURCE_PINS[role]; assert.equal(row.sourceSHA256, expected, 'FLAT_ARTIFACT_GOLDEN_SOURCE_PIN');
  const sourceBytes = regular(join(GOLDEN, LEGACY_SOURCES[role]));
  assert.equal(hash(sourceBytes), expected, 'FLAT_ARTIFACT_CURRENT_GOLDEN_SOURCE');
  assert.ok(sourceBytes.equals(build.sourceBytes), 'FLAT_ARTIFACT_GOLDEN_SOURCE_EQUALITY');
  if (role === 'withdraw') return { ...row.lineage, kind: 'PINNED_GOLDEN_OUTPUT_WITHDRAWAL_SOURCE',
    binaryKeyLoaded: false, independentVKHashRecomputed: false, proofAcceptanceEstablished: false,
    retainedLimitation: 'The retained output-withdrawal source and prior acceptance reference are pinned; this loader has no current binary-key loader for that legacy role.' };
  const loaded = loadProofProfile(role);
  assert.equal(loaded.target, 'evm'); assert.equal(loaded.publicPins.statementWords, row.publicWords);
  assert.equal(loaded.publicPins.soliditySHA256, expected, 'FLAT_ARTIFACT_GOLDEN_KEY_SOURCE');
  assert.deepEqual(row.lineage, { soliditySHA256: expected, reuse: 'EXACT_GOLDEN_V17_SOURCE', ...loaded.publicPins },
    'FLAT_ARTIFACT_GOLDEN_KEY_LINEAGE');
  binaryKeyHeader(loaded.key, build.immutableValues, row.publicWords);
  return { ...row.lineage, kind: 'PINNED_GOLDEN_BALANCE_KEY_AND_SOURCE', binaryKeyLoaded: true,
    binaryKeyHeaderMatchesAST: true, independentVKHashRecomputed: false, proofAcceptanceEstablished: false,
    retainedLimitation: 'The checked legacy key report binds the key and Solidity source; no independent cryptographic VK hash recalculation is performed.' };
}

/** Load all fixed, reviewed artifacts and current retained lineage before any
 * deployment mutation. The returned data does not grant a runtime capability. */
export async function loadFlatVerifierArtifacts() {
  assert.equal(arguments.length, 0, 'FLAT_ARTIFACT_NO_ARGUMENTS');
  const { result, resources } = loadReports();
  const helpers = await import(resourceModuleURL);
  const toolchain = helpers.verifyToolchain(), crs = helpers.verifyCRS();
  assert.deepEqual(toolchain, result.toolchain, 'FLAT_ARTIFACT_TOOLCHAIN');
  assert.deepEqual(crs, result.crs, 'FLAT_ARTIFACT_CRS');
  const verifiers = {};
  for (const [index, [role]] of FLAT_VERIFIER_ORDER.entries()) {
    const row = result.contracts[index], build = loadVerifierBuild(row);
    const lineage = FLAT_ROLES.includes(role)
      ? await flatLineage(role, row, build, toolchain, crs) : legacyLineage(role, row, build);
    const { sourceBytes, ...publicBuild } = build;
    verifiers[role] = { ...publicBuild, lineage };
  }
  assert.deepEqual(helpers.verifyToolchain(), toolchain, 'FLAT_ARTIFACT_TOOLCHAIN_CHANGED');
  assert.deepEqual(helpers.verifyCRS(), crs, 'FLAT_ARTIFACT_CRS_CHANGED');
  return freeze({ verifiers, provenance: {
    classification: 'RETAINED_ARTIFACTS_VALIDATED_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE',
    verifierRun: VERIFIER_RUN, verifierResultSHA256: RESULT_SHA256,
    verifierResourcesSHA256: RESOURCES_SHA256, toolchain, crs,
    completedVerifierCompilation: result.completedAt, verifierCompilationExitCode: resources.exitCode,
    roleMapping: Object.fromEntries(FLAT_VERIFIER_ORDER.map(([role]) => [role, artifactRole(role)])),
    compilerStarted: false, backendStarted: false, proofGenerated: false, chainObserved: false,
    independentVKHashRecomputed: false,
    limitations: ['Retained key/source lineage is not proof acceptance.',
      'Solidity VK_HASH is checked against generation metadata for the eight flat roles, not independently recalculated.',
      'The legacy output-withdrawal role retains source-only lineage and its prior acceptance reference.'],
  } });
}

export async function loadFlatDeploymentArtifacts() {
  assert.equal(arguments.length, 0, 'FLAT_ARTIFACT_NO_ARGUMENTS');
  const ledger = loadLedger(), retained = await loadFlatVerifierArtifacts();
  const { classification, ...provenance } = retained.provenance;
  return freeze({ ledger, verifiers: retained.verifiers, provenance: { classification,
    ledgerAttempt: FLAT_BUILD_PIN.attempt, ledgerCompiledSHA256: LEDGER_SHA256, ...provenance } });
}
