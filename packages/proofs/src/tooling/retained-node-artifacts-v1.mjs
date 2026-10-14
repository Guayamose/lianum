/** Read-only N32 reuse for source-generation preparation. The original compiler
 * evidence is authenticated against the retained source archive; current host
 * sources are a separate candidate closure. No bundle/permission is issued. */
import assert from 'node:assert/strict';
import { join, relative } from 'node:path';
import { sourcePath, resourceMode, resourcePath } from '@lianum/environment';
import { NODE_PINS } from '../catalog.mjs';
import { frozenNodeTooling } from './tooling.mjs';
import { verifyToolchain, verifyCRS } from '@lianum/components/resources/wallet-resources';

export async function inspectRetainedNodeArtifactsForPreparationV1() {
  assert.equal(arguments.length, 0, 'RETAINED_NODE_PREPARATION_NO_OPTIONS');
  const original = await frozenNodeTooling();
  const { regular, hash, verifyVendor, verifyAPI, sourceManifest, assertABI,
    assertStats, canonicalKeyHash, assertKeyBytes, assertSuccessfulAttempt,
    fixedAttempt, LOCAL, ROOT, CANDIDATE, NOIR_VERSION, SETTINGS, PUBLIC_NAMES,
    LIMITS, assertHash } = original;
  const manifestPath = join(LOCAL, 'compiled', NODE_PINS.compiledManifestSHA256, 'manifest.json');
  const manifestBytes = regular(manifestPath);
  assert.equal(hash(manifestBytes), NODE_PINS.compiledManifestSHA256, 'RETAINED_NODE_ORIGINAL_MANIFEST');
  const recordedSources = JSON.parse(manifestBytes).executionSources;
  const roots = Object.freeze({candidate: 'omnichain-flat-profile/candidate-poseidon',
    'flat-reference': 'omnichain-flat-profile', golden: 'omnichain-product'});
  function executionSources() {
    assert.equal(recordedSources.length, 9, 'RETAINED_NODE_EXECUTION_CLOSURE');
    const names = new Set();
    for (const row of recordedSources) {
      assert.deepEqual(Object.keys(row).sort(), ['bytes', 'path', 'root', 'sha256']);
      assert.ok(Object.hasOwn(roots, row.root), 'RETAINED_NODE_SOURCE_ROOT');
      assert.ok(typeof row.path === 'string' && row.path && !row.path.includes('\\')
        && !row.path.split('/').some(part => !part || part === '.' || part === '..'), 'RETAINED_NODE_SOURCE_PATH');
      const name = roots[row.root] + '/' + row.path;
      assert.ok(!names.has(name), 'RETAINED_NODE_SOURCE_DUPLICATE'); names.add(name);
      // Transport the exact archived inputs as non-executable evidence. Their
      // identity remains the original compiled manifest, never current host
      // adoption or an executable compatibility alias.
      const path = resourceMode === 'candidate'
        ? resourcePath('crypto', 'evidence/retained-n32/sources/' + assertHash(row.sha256) + '.source')
        : sourcePath('archive/delivery/source-snapshot/' + name);
      const bytes = regular(path);
      assert.equal(bytes.length, row.bytes, 'RETAINED_NODE_SOURCE_BYTES');
      assert.equal(hash(bytes), row.sha256, 'RETAINED_NODE_SOURCE_PIN');
    }
    return recordedSources;
  }
  function loadCompiled() {
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
  function loadPrepared(compiled, toolchain, crs) {
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
  function loadStats(compiled, toolchain) {
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

  const toolchain = verifyToolchain(), crs = verifyCRS();
  const compiled = loadCompiled();
  assert.equal(compiled.manifestSHA256, NODE_PINS.compiledManifestSHA256, 'RETAINED_NODE_COMPILED_PIN');
  for (const [key, field] of [['artifactSHA256', 'programSHA256'], ['bytecodeSHA256', 'bytecodeSHA256'], ['sourceTreeSHA256', 'sourceTreeSHA256']])
    assert.equal(compiled.manifest[field], NODE_PINS[key], 'RETAINED_NODE_ARTIFACT_PIN');
  const statistics = loadStats(compiled, toolchain);
  assert.equal(statistics.manifestSHA256, NODE_PINS.statsManifestSHA256, 'RETAINED_NODE_STATS_PIN');
  const prepared = loadPrepared(compiled, toolchain, crs);
  assert.equal(prepared.pinFileSHA256, NODE_PINS.pinFileSHA256, 'RETAINED_NODE_PREPARED_PIN');
  assert.equal(hash(prepared.key), NODE_PINS.keySHA256, 'RETAINED_NODE_KEY_PIN');
  executionSources();
  assert.equal(hash(regular(manifestPath)), NODE_PINS.compiledManifestSHA256, 'RETAINED_NODE_MANIFEST_CHANGED');
  const receipt = Object.freeze({schema:'RETAINED_NODE_COMPILER_REUSE_V1',
    compiledManifestSHA256:compiled.manifestSHA256, preparedPinsSHA256:prepared.pinFileSHA256,
    statsManifestSHA256:statistics.manifestSHA256, programSHA256:NODE_PINS.artifactSHA256,
    keySHA256:NODE_PINS.keySHA256, compilerSources:recordedSources,
    currentHostSourcesAccepted:false, artifactBundleIssued:false, financialAcceptance:false});
  return {compiled:{...compiled,frozen:true},
    prepared:{...prepared,manifestSHA256:prepared.pinFileSHA256,manifest:prepared.provenance},receipt};
}
