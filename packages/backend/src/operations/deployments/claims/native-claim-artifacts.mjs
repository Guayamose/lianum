/** Read-only source/key/compiler provenance for the bounded native claims.
 * No caller-selected build, verifier, source, path or matching-hash override.
 * Loading artifacts never compiles, proves, deploys or observes native value. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, LOCAL, FLAT, relation } from '../../../../../proofs/src/catalog.mjs';
import { regular, hash, resourceModuleURL, circuitIdentity, versionDirectory,
  loadCompiled, loadPrepared } from '../../../../../proofs/src/tooling/tooling.mjs';
import { GENERIC_COMPILER_PIN, deriveGenericVerifierImmutables }
  from '../../../../../engine/src/execution/local/local-deployment.mjs';

export const NATIVE_CLAIM_CONTRACT_PIN = Object.freeze({
  runId: 'e3e645b6-9466-4f3c-aab1-4dcaa93b7f51',
  compiledSHA256: '263757f0d143276829e9bf21548a67ac7b3931f28fcdd42825a31093c486bda9',
  manifestSHA256: '1b799fc3fad9ade30f3f7f4a432071d265deaf2a2c4075e0cc4dc7e40b559c5b',
  sourceSnapshotSHA256: 'b21f5489eb481a32e75547b8402da6b759cabba0225025bd1725aa736b4d5a25',
});
// Filled only after the two actual generated verifier sources compile under
// the resource supervisor. An incomplete checkpoint cannot deploy a fallback.
export const NATIVE_CLAIM_VERIFIER_PIN = Object.freeze({
  "runId": "5ead74d0-bb7c-4d0e-a625-87bbcf46682b",
  "resultSHA256": "827b270dd6e6537cef628efa751b97dd008f904299132f6516831217ec1310ce",
  "resourcesSHA256": "7c7d398c8fb0f926d92f7b439caa4239239a982887b140725df4ea9ab1d411ef"
});

const entries = Object.freeze({
  gateway: ['native-claims/NativeClaimGateway.sol', 'NativeClaimGateway'],
  authority: ['native-claims/NativeClaimAuthority.sol', 'NativeClaimAuthority'],
  token: ['native-claims/NativeClaimToken.sol', 'NativeClaimToken'],
  nativeClaimCodec: ['native-claims/NativeClaimCodec.sol', 'NativeClaimCodec'],
  nativeClaimValidation: ['native-claims/NativeClaimValidation.sol', 'NativeClaimValidation'],
});
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(name => JSON.stringify(name) + ':' + canonical(value[name])).join(',') + '}';
function pinnedJSON(path, expected) {
  assert.ok(typeof expected === 'string' && /^[0-9a-f]{64}$/.test(expected), 'CLAIM_ARTIFACT_PIN_REQUIRED');
  const bytes = regular(path); assert.equal(hash(bytes), expected, 'CLAIM_ARTIFACT_FILE_PIN');
  return JSON.parse(bytes);
}
function compiler(compilation, profile) {
  assert.equal(compilation.classification, 'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');
  assert.equal(compilation.profile, profile); assert.deepEqual(compilation.compiler, GENERIC_COMPILER_PIN);
  const settings = compilation.settings;
  assert.deepEqual(settings.optimizer, { enabled: true, runs: profile === 'standard' ? 200 : 1 });
  assert.equal(settings.viaIR, profile === 'standard'); assert.equal(settings.evmVersion, 'cancun');
  assert.deepEqual(settings.metadata, { bytecodeHash: 'none' });
}
function size(artifact, allowImmutables = false) {
  assert.ok(artifact?.evm?.bytecode?.object && artifact.evm.deployedBytecode.object, 'CLAIM_ARTIFACT_CONTRACT');
  assert.ok(artifact.evm.bytecode.object.length / 2 <= 49152
    && artifact.evm.deployedBytecode.object.length / 2 <= 24576, 'CLAIM_ARTIFACT_EVM_SIZE');
  if (!allowImmutables) assert.deepEqual(artifact.evm.deployedBytecode.immutableReferences, {});
}
function loadContracts() {
  const pin = NATIVE_CLAIM_CONTRACT_PIN;
  const directory = join(ROOT, '.local/native-claims-contracts', pin.runId);
  const manifest = pinnedJSON(join(directory, 'manifest.json'), pin.manifestSHA256);
  const compilation = pinnedJSON(join(directory, 'compiled.json'), pin.compiledSHA256);
  pinnedJSON(join(directory, 'source-snapshot.json'), pin.sourceSnapshotSHA256);
  assert.equal(manifest.runId, pin.runId); assert.equal(manifest.phase, 'completed');
  assert.equal(manifest.compiledSHA256, pin.compiledSHA256);
  assert.equal(manifest.sourceSnapshotSHA256, pin.sourceSnapshotSHA256);
  assert.equal(manifest.sourceUnchanged, true); assert.equal(manifest.eip170Passed, true);
  assert.equal(manifest.eip3860Passed, true); compiler(compilation, 'standard');
  assert.deepEqual(manifest.sources, compilation.sources);
  const sourceMap = {};
  for (const entry of compilation.sources) {
    assert.ok(/^[A-Za-z0-9_/-]+\.sol$/.test(entry.name)
      && !entry.name.startsWith('/') && !entry.name.split('/').includes('..'), 'CLAIM_SOURCE_PATH');
    const bytes = regular(join(ROOT, 'contracts', entry.name));
    assert.equal(hash(bytes), entry.sha256, 'CLAIM_CURRENT_CONTRACT_SOURCE');
    assert.equal(bytes.length, entry.bytes); sourceMap[entry.name] = { content: bytes.toString('utf8'), sha256: entry.sha256 };
  }
  assert.deepEqual(Object.keys(compilation.sourceASTs).sort(), Object.keys(sourceMap).sort());
  const artifacts = Object.fromEntries(Object.entries(entries).map(([role, [source, name]]) => {
    const artifact = compilation.contracts[source]?.[name]; size(artifact);
    return [role, artifact];
  }));
  return { compilation, artifacts, sourceMap,
    provenance: { ...pin, classification: 'SOURCE_COMPILER_RUNTIME_PINS_NOT_DEPLOYMENT' } };
}
function immutableNames(ast) {
  const result = {};
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.nodeType === 'VariableDeclaration' && value.mutability === 'immutable') result[value.id] = value.name;
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(ast); return result;
}
async function loadVerifiers() {
  const pin = NATIVE_CLAIM_VERIFIER_PIN;
  assert.ok(pin, 'CLAIM_VERIFIER_ARTIFACTS_NOT_PREPARED');
  const directory = join(LOCAL, 'claim-verifier-compilation', pin.runId);
  const report = pinnedJSON(join(directory, 'result.json'), pin.resultSHA256);
  const monitor = pinnedJSON(join(directory, 'resources.json'), pin.resourcesSHA256);
  assert.equal(report.format, 'FLAT_NATIVE_CLAIM_VERIFIER_COMPILATION_V1');
  for (const item of [report, monitor]) { assert.equal(item.phase, 'completed'); assert.equal(item.runId, pin.runId); }
  assert.equal(monitor.exitCode, 0); assert.deepEqual(monitor.failures, []);
  assert.equal(monitor.failure ?? null, null); assert.deepEqual(report.sourcePins, monitor.sourcePins);
  for (const record of report.sourcePins.local) {
    // Preserve the generation report and its historical host pin. The accepted
    // source11 delta only adds fixed prove-scope dependencies; circuit identity,
    // compiled/prepared readers and every other tooling byte are unchanged.
    if (record.path === 'flat-wallet/proof-workers/tooling.mjs') {
      assert.equal(record.sha256, '200240e992228e270a528d3c389f6a65b046ccf405544017cdc054a2b2b63ff5',
        'CLAIM_VERIFIER_HISTORICAL_TOOLING_SOURCE');
      assert.equal(hash(regular(join(FLAT, record.path))), '18ac833e360d6450f62f9d6f53744eadaed9c202ddfc0f096c720bf0152b5ddc',
        'CLAIM_VERIFIER_CURRENT_TOOLING_SOURCE');
    } else assert.equal(hash(regular(join(FLAT, record.path))), record.sha256, 'CLAIM_VERIFIER_EXECUTION_SOURCE');
  }
  const helpers = await import(resourceModuleURL);
  const toolchain = helpers.verifyToolchain(), crs = helpers.verifyCRS();
  assert.deepEqual(report.toolchain, toolchain); assert.deepEqual(report.crs, crs);
  assert.deepEqual(report.contracts.map(row => [row.relation, row.publicWords]),
    [['native_claim_ingress', 51], ['native_claim_discharge', 42]]);
  const verifiers = {};
  for (const [index, row] of report.contracts.entries()) {
    const spec = relation(row.relation), identity = circuitIdentity(spec, toolchain);
    const sourceVersion = hash(JSON.stringify(identity));
    assert.equal(row.lineage.sourceVersion, sourceVersion, 'CLAIM_VERIFIER_CURRENT_CIRCUIT');
    const context = { spec, identity, sourceVersion, toolchain, directory: versionDirectory(spec, sourceVersion) };
    const program = await loadCompiled(context), prepared = await loadPrepared(context, program, crs);
    assert.equal(program.manifestSHA256, row.lineage.compiledManifestSHA256);
    assert.equal(prepared.manifestSHA256, row.lineage.keyManifestSHA256);
    assert.equal(hash(prepared.key), row.lineage.keySHA256); assert.equal(prepared.key.length, 59 * 32);
    assert.equal(prepared.manifest.keyHashField, row.lineage.keyHashField);
    const source = row.relation + '.sol', sourceBytes = regular(join(directory, row.relation, source));
    assert.equal(source, row.source); assert.equal(hash(sourceBytes), row.sourceSHA256);
    assert.ok(prepared.solidity.equals(sourceBytes), 'CLAIM_GENUINE_GENERATED_SOURCE');
    assert.equal(hash(sourceBytes), row.lineage.soliditySHA256);
    const compilation = pinnedJSON(join(directory, row.relation, 'compiled.json'), row.compiledSHA256);
    compiler(compilation, 'verifier');
    assert.deepEqual(compilation.sources, [{ name: source, sha256: row.sourceSHA256, bytes: sourceBytes.length }]);
    assert.deepEqual(JSON.parse(regular(join(directory, row.relation, 'manifest.json'))), row);
    const ast = compilation.sourceASTs[source], contracts = compilation.contracts[source];
    const names = immutableNames(ast), values = deriveGenericVerifierImmutables(ast, spec.publicWords);
    assert.deepEqual(names, row.immutableNames); assert.deepEqual(values, row.immutableValues);
    assert.equal(BigInt(values.$VK_HASH), BigInt(prepared.manifest.keyHashField), 'CLAIM_GENERATED_KEY_HASH');
    const keyWord = n => BigInt('0x' + prepared.key.subarray(n * 32, (n + 1) * 32).toString('hex'));
    assert.equal(1n << keyWord(0), BigInt(values.$N)); assert.equal(keyWord(1), BigInt(spec.publicWords + 8));
    assert.equal(keyWord(2), 5n);
    for (const artifact of Object.values(contracts))
      if (artifact.evm.deployedBytecode.object) size(artifact, true);
    const artifact = contracts.HonkVerifier;
    assert.deepEqual(artifact.evm.methodIdentifiers, { 'verify(bytes,bytes32[])': 'ea50d0e4' });
    const methods = artifact.abi.filter(item => item.type === 'function');
    assert.equal(methods.length, 1); assert.equal(methods[0].stateMutability, 'view');
    assert.deepEqual(methods[0].inputs.map(item => item.type), ['bytes', 'bytes32[]']);
    assert.deepEqual(methods[0].outputs.map(item => item.type), ['bool']);
    verifiers[index === 0 ? 'CI51' : 'CO42'] = { source, sourceBytes, artifact, contracts,
      immutableNames: names, immutableValues: values, manifest: row,
      sourceCommitment: sourceVersion, keyCommitment: hash(prepared.key),
      lineage: { ...row.lineage, actualGeneratedKeyAndSource: true, proofAcceptanceEstablished: false } };
  }
  return verifiers;
}
export async function loadNativeClaimArtifacts() {
  assert.equal(arguments.length, 0, 'CLAIM_ARTIFACT_NO_OPTIONS');
  const contracts = loadContracts(), verifiers = await loadVerifiers();
  return { contracts, verifiers };
}
