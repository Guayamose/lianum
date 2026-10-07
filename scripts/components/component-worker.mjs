/** Fixed offline worker. Never invoke directly; the authenticated supervisor
 * owns this process and all resource termination. Source-only until authorized. */
import assert from 'node:assert/strict';
import { existsSync, renameSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ROOT, LOCAL, CIRCUIT, LIMITS, SETTINGS, PUBLIC_NAMES, DISCLOSURE, NOIR_VERSION,
  resourceModuleURL, verifierCRSModuleURL, loadPinned, hash, jsonBytes, modeFromArguments,
  authenticateSupervisor, ensureDirectory, fixedAttempt, writeNew, writeJSON, replaceJSON,
  regular, sourceManifest, executionSources, assertABI, assertExpectedPublic, publicWords,
  verifierWords, assertStats, assertKeyBytes, canonicalKeyHash, loadCompiled, loadPrepared,
  assertSuccessfulAttempt } from '../../packages/components/src/component-tooling.mjs';

globalThis.fetch = async () => { throw Error('FLAT_COMPONENT_OFFLINE_REQUIRED'); };
const mode = modeFromArguments();
const supervisor = authenticateSupervisor(mode);
const attempt = fixedAttempt(mode, supervisor.pid);
assert.ok(existsSync(attempt), 'FLAT_SUPERVISOR_ATTEMPT_REQUIRED');
ensureDirectory(attempt);
assert.equal(JSON.parse(regular(join(LOCAL, 'active.lock'))).pid, supervisor.pid, 'FLAT_SUPERVISOR_LOCK');
const beganTotal = performance.now();
const report = { format: 'FLAT_COMPONENT_ATTEMPT_V1', mode,
  classification: 'SYNTHETIC_FLAT_COMPONENT_EXPERIMENT_NOT_PROTOCOL_ACCEPTANCE',
  disclosure: DISCLOSURE, startedAt: new Date().toISOString(), phase: 'checking-source',
  target: 'evm', settings: SETTINGS, limits: LIMITS, node: process.version,
  threads: 1, maximumPages: LIMITS.maximumPages, hostLimitsChanged: false,
  publicInputWords: 32, proofGenerated: false, supervisor, records: [], phaseHistory: [],
  metricDefinitions: { initializationMilliseconds: 'official BB WASM creation and CRS initialization only',
    witnessMilliseconds: 'one Noir.execute call in prove mode', proofMilliseconds: 'witness decompression and official circuitProve',
    verificationMilliseconds: 'official UltraHonkVerifierBackend calls',
    totalMilliseconds: 'complete worker mode including imports, pins, source rechecks and backend teardown',
    otherMilliseconds: 'total minus the four separately timed categories',
    supervisorElapsedMilliseconds: 'recorded separately by the parent in resources.json, including process startup/exit' },
  metrics: { initializationMilliseconds: 0, witnessMilliseconds: 0, proofMilliseconds: 0,
    verificationMilliseconds: 0, totalMilliseconds: 0 } };
let phaseSequence = 0, api, witness, rawWitness;
let sourceBefore, hostBefore, toolchainBefore, crsBefore, resourceHelpers;
const save = () => replaceJSON(join(attempt, 'result.json'), report);
function phase(name) {
  report.phase = name;
  report.phaseHistory.push({ phase: name, at: new Date().toISOString(), milliseconds: performance.now() - beganTotal });
  writeJSON(join(attempt, String(phaseSequence++).padStart(3, '0') + '-' + name + '.json'), report);
  save();
}
async function measured(metric, operation) {
  const began = performance.now();
  try { return await operation(); } finally { report.metrics[metric] += performance.now() - began; save(); }
}
function freezeCheck() {
  report.sourcesAfter = sourceManifest(); report.executionSourcesAfter = executionSources();
  report.finalSourceCheckAt = new Date().toISOString();
  assert.deepEqual(report.sourcesAfter, sourceBefore, 'FLAT_SOURCE_CHANGED_DURING_MODE');
  assert.deepEqual(report.executionSourcesAfter, hostBefore, 'FLAT_EXECUTION_SOURCE_CHANGED_DURING_MODE');
  assert.deepEqual(resourceHelpers.verifyToolchain(), toolchainBefore, 'FLAT_TOOLCHAIN_CHANGED_DURING_MODE');
  if (crsBefore) assert.deepEqual(resourceHelpers.verifyCRS(), crsBefore, 'FLAT_FULL_CRS_CHANGED_DURING_MODE');
}
function fullCRS() {
  crsBefore = resourceHelpers.verifyCRS(); report.crs = crsBefore; save();
  assert.equal(crsBefore.points, LIMITS.provingCRSPoints, 'FLAT_FULL_PROVING_CRS_POINTS');
  return crsBefore;
}
async function initializeWasm(bb, verifierOnly = false) {
  await measured('initializationMilliseconds', async () => {
    phase('initializing-official-wasm');
    api = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
      skipSrsInit: true, memory: { initial: 37, maximum: LIMITS.maximumPages } });
    if (verifierOnly) {
      phase('initializing-pinned-verifier-crs');
      const { initializePrivateVerifierCRS } = await import(verifierCRSModuleURL);
      report.verifierCRS = await initializePrivateVerifierCRS(api, bb.BN254_G1_GENERATOR,
        regular(resourceHelpers.CRS + 'bn254_g2.dat'));
    }
  });
}
async function provingCRS() {
  phase('initializing-full-pinned-proving-crs');
  await measured('initializationMilliseconds', () => api.srsInitSrs({
    pointsBuf: regular(resourceHelpers.CRS + 'bn254_g1_compressed.dat'),
    numPoints: LIMITS.provingCRSPoints, g2Point: regular(resourceHelpers.CRS + 'bn254_g2.dat') }));
}
async function destroyWasm() {
  if (!api) return;
  phase('destroying-official-wasm');
  const owned = api; api = undefined;
  await owned.destroy();
}
function compiledPins(compiled) {
  return { artifactSHA256: compiled.manifest.programSHA256,
    bytecodeSHA256: compiled.manifest.bytecodeSHA256, compiledManifestSHA256: compiled.manifestSHA256,
    sourceTreeSHA256: compiled.manifest.sourceTreeSHA256 };
}
function checkCompiledStill(compiled) {
  const current = loadCompiled();
  assert.equal(current.manifestSHA256, compiled.manifestSHA256, 'FLAT_COMPILED_CHANGED_DURING_MODE');
}
async function fixtures() {
  const module = await import('../../packages/components/src/node-fixtures.mjs');
  assert.equal(typeof module.positiveFixtures, 'function', 'FLAT_POSITIVE_FIXTURES');
  assert.equal(typeof module.negativeFixtures, 'function', 'FLAT_NEGATIVE_FIXTURES');
  const positive = module.positiveFixtures(), negative = module.negativeFixtures();
  assert.ok(Array.isArray(positive) && positive.length >= 2 && positive.length <= 32, 'FLAT_POSITIVE_FIXTURE_BOUND');
  assert.ok(Array.isArray(negative) && negative.length > 0 && negative.length <= 128, 'FLAT_NEGATIVE_FIXTURE_BOUND');
  const names = new Set();
  for (const item of [...positive, ...negative]) {
    assert.ok(item && typeof item.name === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(item.name), 'FLAT_FIXTURE_NAME');
    assert.ok(!names.has(item.name), 'FLAT_DUPLICATE_FIXTURE_NAME'); names.add(item.name);
    assert.ok(item.inputs && typeof item.inputs === 'object', 'FLAT_FIXTURE_INPUTS');
    publicWords(item.expectedPublicInputs);
    assert.ok(item.expectedFailureLayer === undefined || ['constraint', 'abi'].includes(item.expectedFailureLayer),
      'FLAT_NEGATIVE_FAILURE_LAYER');
  }
  assert.ok(positive.some(item => item.inputs.local?.active === true), 'FLAT_ACTIVE_POSITIVE_REQUIRED');
  assert.ok(positive.some(item => item.inputs.local?.active === false), 'FLAT_PADDING_POSITIVE_REQUIRED');
  return { positive, negative };
}
// Only known ABI/constraint failures from the actual Noir.execute call count.
// A timeout, missing dependency, source mismatch or WASM trap never passes.
function classifyConstraintError(error) {
  const text = String(error?.message ?? error);
  if (/out of memory|memory access|unreachable|fetch|network|module not found|ENOENT|abort|timeout/i.test(text)) return null;
  if (/Cannot satisfy constraint|Unsatisfied constraint|Assertion failed|assertion failed|assertion failed at|Failed to solve blackbox|BlackBoxFunctionFailed/i.test(text)) return 'constraint';
  if (/ABI encoding|ABI encode|cannot encode|expected (?:a |an )?(?:field|integer|array|boolean)|missing (?:parameter|argument|field)|does not fit|out of range|invalid value for/i.test(text)) return 'abi';
  return null;
}
async function compile() {
  phase('compiling-fixed-circuit');
  const compiler = await loadPinned('@noir-lang/noir_wasm');
  const { program } = await compiler.compile(compiler.createFileManager(CIRCUIT), undefined, () => {});
  // Retain the actual compiler output even if ABI/pin checks subsequently fail.
  const programBytes = jsonBytes(program);
  writeNew(join(attempt, 'program.json'), programBytes);
  assertABI(program); freezeCheck();
  const manifest = { format: 'FLAT_COMPONENT_COMPILED_MANIFEST_V1', mode: 'node-component',
    sources: sourceBefore, sourceTreeSHA256: hash(JSON.stringify(sourceBefore)),
    executionSources: hostBefore, executionSourceSHA256: hash(JSON.stringify(hostBefore)),
    programSHA256: hash(programBytes), bytecodeSHA256: hash(Buffer.from(program.bytecode, 'base64')),
    noirVersion: program.noir_version, publicNames: PUBLIC_NAMES, publicWords: 32, node: process.version,
    toolchain: toolchainBefore, target: 'evm', settings: SETTINGS };
  const manifestBytes = jsonBytes(manifest), manifestSHA256 = hash(manifestBytes);
  writeNew(join(attempt, 'compiled-manifest.json'), manifestBytes);
  const destination = join(LOCAL, 'compiled', manifestSHA256);
  if (existsSync(destination)) {
    assert.equal(hash(regular(join(destination, 'manifest.json'))), manifestSHA256, 'FLAT_EXISTING_COMPILED_MANIFEST');
    assert.equal(hash(regular(join(destination, 'program.json'))), manifest.programSHA256, 'FLAT_EXISTING_COMPILED_PROGRAM');
  } else {
    const staged = join(attempt, 'compiled'); ensureDirectory(staged);
    writeNew(join(staged, 'manifest.json'), manifestBytes); writeNew(join(staged, 'program.json'), programBytes);
    ensureDirectory(join(LOCAL, 'compiled')); renameSync(staged, destination);
  }
  const pointer = { manifestSHA256, programSHA256: manifest.programSHA256, supervisorPID: supervisor.pid };
  const currentPath = join(LOCAL, 'compiled.json');
  if (existsSync(currentPath)) {
    const current = JSON.parse(regular(currentPath));
    if (current.manifestSHA256 !== manifestSHA256) {
      assert.equal(existsSync(join(LOCAL, 'prepared')), false, 'FLAT_PREPARED_KEY_RETAINED_SOURCE_CHANGE_REQUIRES_NEW_PROFILE');
      writeJSON(join(attempt, 'previous-compiled-pointer.json'), current);
      replaceJSON(currentPath, pointer);
    } else {
      assert.equal(current.programSHA256, pointer.programSHA256, 'FLAT_UNCHANGED_COMPILED_PROGRAM');
      // Artifacts remain immutable. Keep an existing completed pointer; a
      // failed original attempt can be superseded only by this explicit run.
      let successful = false;
      try { assertSuccessfulAttempt('compile', current.supervisorPID); successful = true; } catch {}
      if (!successful) {
        writeJSON(join(attempt, 'previous-compiled-pointer.json'), current);
        replaceJSON(currentPath, pointer);
      }
    }
  } else writeJSON(currentPath, pointer);
  report.compiled = pointer; report.abiSHA256 = hash(JSON.stringify(program.abi));
}
async function constraints() {
  const compiled = loadCompiled(); Object.assign(report, compiledPins(compiled));
  const { positive, negative } = await fixtures();
  const { Noir } = await loadPinned('@noir-lang/noir_js');
  const noir = new Noir(compiled.program);
  for (const [shouldPass, cases] of [[true, positive], [false, negative]]) {
    for (const item of cases) {
      phase('constraint-' + String(report.records.length).padStart(3, '0'));
      // Expected outputs describe public ABI words. Negative fixtures can
      // deliberately mismatch those values inside constraints; do not let a
      // host precheck masquerade as an actual constraint rejection.
      const expected = publicWords(item.expectedPublicInputs);
      const started = performance.now(); let actualPass = false, errorLayer = null;
      let caseWitness;
      try {
        const result = await noir.execute(item.inputs);
        caseWitness = result.witness; actualPass = true;
      } catch (error) {
        if (shouldPass) throw error;
        errorLayer = classifyConstraintError(error);
        assert.ok(errorLayer, 'FLAT_NEGATIVE_UNCLASSIFIED_EXECUTION_FAILURE');
        assert.equal(errorLayer, item.expectedFailureLayer ?? 'constraint', 'FLAT_NEGATIVE_WRONG_FAILURE_LAYER');
      } finally { caseWitness?.fill(0); }
      const record = { name: item.name, expectedPass: shouldPass, actualPass, failureLayer: errorLayer,
        inputSHA256: hash(JSON.stringify(item.inputs)), expectedPublicInputsSHA256: hash(JSON.stringify(expected)),
        milliseconds: performance.now() - started, witnessExported: false };
      report.records.push(record); save();
      assert.equal(actualPass, shouldPass, 'FLAT_CONSTRAINT_RESULT');
      if (shouldPass) assertExpectedPublic(item.inputs, expected);
    }
  }
  checkCompiledStill(compiled); freezeCheck();
  report.positiveCount = positive.length; report.negativeCount = negative.length;
}
async function prepareKey() {
  const compiled = loadCompiled(); Object.assign(report, compiledPins(compiled));
  if (existsSync(join(LOCAL, 'prepared'))) {
    const checked = loadPrepared(compiled, toolchainBefore, fullCRS());
    report.prepared = { unchanged: true, pins: checked.pins, pinFileSHA256: checked.pinFileSHA256 };
    freezeCheck(); return;
  }
  const bb = await loadPinned('@aztec/bb.js');
  await initializeWasm(bb);
  const circuit = { name: 'node-component', bytecode: gunzipSync(compiled.compressed), verificationKey: new Uint8Array() };
  phase('measuring-actual-circuit');
  report.stats = await api.circuitStats({ circuit, includeGatesPerOpcode: false, settings: SETTINGS });
  // Save actual stats before enforcing the first-attempt cap. A too-large
  // circuit cannot reach CRS initialization, VK generation or any proof.
  save(); writeJSON(join(attempt, 'actual-circuit-stats.json'), report.stats);
  const dyadic = assertStats(report.stats);
  fullCRS(); await provingCRS();
  phase('generating-actual-evm-key');
  const keyResult = await api.circuitComputeVk({ circuit, settings: SETTINGS });
  const key = Buffer.from(keyResult.bytes);
  writeNew(join(attempt, 'node-component.vk'), key);
  assertKeyBytes(key, dyadic); assert.equal(keyResult.hash.length, 32, 'FLAT_VK_HASH_BYTES');
  const keyHashField = canonicalKeyHash(BigInt('0x' + Buffer.from(keyResult.hash).toString('hex')).toString());
  phase('exporting-actual-evm-verifier');
  const solidity = (await api.circuitWriteSolidityVerifier({ verificationKey: key, settings: SETTINGS })).solidityCode;
  assert.equal(typeof solidity, 'string', 'FLAT_SOLIDITY_RESPONSE');
  writeNew(join(attempt, 'node-component.sol'), solidity);
  assert.ok(solidity.includes('contract HonkVerifier'), 'FLAT_SOLIDITY_VERIFIER');
  assert.match(solidity, /NUMBER_OF_PUBLIC_INPUTS\s*=\s*40;/, 'FLAT_SOLIDITY_PUBLIC_COUNT');
  checkCompiledStill(compiled); freezeCheck(); await destroyWasm();
  const provenance = { format: 'FLAT_COMPONENT_KEY_PROVENANCE_V1', phase: 'completed',
    classification: 'ACTUAL_OFFICIAL_EVM_KEY_GENERATION_NOT_PROOF', disclosure: DISCLOSURE,
    mode: 'node-component', target: 'evm', ...compiledPins(compiled),
    keySHA256: hash(key), keyBytes: key.length, keyHashField,
    soliditySHA256: hash(solidity), solidityBytes: Buffer.byteLength(solidity),
    sources: sourceBefore, executionSources: hostBefore, toolchain: toolchainBefore, crs: crsBefore,
    stats: report.stats, settings: SETTINGS, limits: LIMITS, maximumPages: LIMITS.maximumPages,
    threads: 1, bbVersion: '5.2.0', noirVersion: NOIR_VERSION, node: process.version,
    publicInputWords: 32, actualKeyPublicInputCount: 40, pairingPointPublicInputWords: 8,
    proofGenerated: false, startedAt: report.startedAt, completedAt: new Date().toISOString(),
    initializationMilliseconds: report.metrics.initializationMilliseconds,
    totalMilliseconds: performance.now() - beganTotal, supervisorPID: supervisor.pid,
    resourceReport: relative(ROOT, join(attempt, 'resources.json')) };
  const provenanceBytes = jsonBytes(provenance);
  const pins = { ...compiledPins(compiled), keySHA256: hash(key), keyHashField,
    soliditySHA256: hash(solidity), provenanceSHA256: hash(provenanceBytes) };
  writeNew(join(attempt, 'key-provenance.json'), provenanceBytes);
  writeJSON(join(attempt, 'generated-pins.json'), pins);
  const staged = join(attempt, 'prepared'); ensureDirectory(staged);
  writeNew(join(staged, 'node-component.vk'), key); writeNew(join(staged, 'node-component.sol'), solidity);
  writeNew(join(staged, 'provenance.json'), provenanceBytes); writeJSON(join(staged, 'generated-pins.json'), pins);
  assert.equal(existsSync(join(LOCAL, 'prepared')), false, 'FLAT_PREPARED_KEY_APPEARED');
  phase('installing-prepared-key-once'); renameSync(staged, join(LOCAL, 'prepared'));
  // Future modes also require this worker AND its external supervisor to have
  // completed successfully. That external result does not exist until exit.
  report.prepared = { unchanged: false, pins, pinFileSHA256: hash(jsonBytes(pins)) };
}
async function prove() {
  const compiled = loadCompiled(), prepared = loadPrepared(compiled, toolchainBefore, fullCRS());
  Object.assign(report, compiledPins(compiled), { keySHA256: prepared.pins.keySHA256,
    generatedPinFileSHA256: prepared.pinFileSHA256, keyRecomputed: false });
  const { positive } = await fixtures();
  const fixture = positive.find(item => item.inputs.local.active === true);
  const expected = assertExpectedPublic(fixture.inputs, fixture.expectedPublicInputs);
  report.fixture = { name: fixture.name, inputSHA256: hash(JSON.stringify(fixture.inputs)),
    expectedPublicInputsSHA256: hash(JSON.stringify(expected)) };
  const bb = await loadPinned('@aztec/bb.js'), { Noir } = await loadPinned('@noir-lang/noir_js');
  await initializeWasm(bb); await provingCRS();
  phase('executing-active-witness');
  ({ witness } = await measured('witnessMilliseconds', () => new Noir(compiled.program).execute(fixture.inputs)));
  phase('proving-with-exact-prepared-key');
  let proof, rawPublicInputs;
  await measured('proofMilliseconds', async () => {
    rawWitness = gunzipSync(witness);
    const generated = await api.circuitProve({ witness: rawWitness,
      circuit: { name: 'node-component', bytecode: gunzipSync(compiled.compressed), verificationKey: prepared.key },
      settings: SETTINGS });
    proof = Buffer.concat(generated.proof.map(field => Buffer.from(field)));
    rawPublicInputs = generated.publicInputs.map(field => '0x' + Buffer.from(field).toString('hex'));
    rawWitness.fill(0); rawWitness = undefined;
  });
  witness.fill(0); witness = undefined;
  writeNew(join(attempt, 'proof.bin'), proof); writeJSON(join(attempt, 'raw-public-inputs.json'), rawPublicInputs);
  report.proofGenerated = true; report.proofBytes = proof.length; report.proofSHA256 = hash(proof); save();
  const inputs = publicWords(rawPublicInputs);
  assert.deepEqual(inputs, expected, 'FLAT_ACTUAL_PROOF_PUBLIC_INPUTS');
  assert.ok(proof.length > 0 && proof.length <= LIMITS.outputBytes && proof.length % 32 === 0, 'FLAT_ACTUAL_PROOF_BYTES');
  // Preserve actual public output even if self-verification fails next.
  writeJSON(join(attempt, 'public-inputs.json'), inputs);
  report.publicInputsSHA256 = hash(jsonBytes(inputs));
  phase('self-verifying-actual-proof');
  report.selfVerified = await measured('verificationMilliseconds', () => new bb.UltraHonkVerifierBackend(api)
    .verifyProof({ proof, publicInputs: verifierWords(inputs), verificationKey: prepared.key }, { verifierTarget: 'evm' }));
  assert.equal(report.selfVerified, true, 'FLAT_GENUINE_SELF_VERIFICATION');
  checkCompiledStill(compiled); freezeCheck();
  const checked = loadPrepared(compiled, toolchainBefore, crsBefore);
  assert.equal(checked.pinFileSHA256, prepared.pinFileSHA256, 'FLAT_PREPARED_CHANGED_DURING_PROOF');
  await destroyWasm();
  const proofManifest = { format: 'FLAT_COMPONENT_PUBLIC_PROOF_V1', target: 'evm', fixtureName: fixture.name,
    expectedPublicInputs: expected, ...compiledPins(compiled), generatedPinFileSHA256: prepared.pinFileSHA256,
    keySHA256: prepared.pins.keySHA256, proofSHA256: hash(proof), proofBytes: proof.length,
    publicInputsSHA256: hash(jsonBytes(inputs)), selfVerified: true,
    metricsThroughArtifactPublication: { ...report.metrics, totalMilliseconds: performance.now() - beganTotal },
    completeMetricsReport: relative(ROOT, join(attempt, 'result.json')),
    sourceFreezeSHA256: hash(JSON.stringify(hostBefore)), disclosure: DISCLOSURE };
  writeJSON(join(attempt, 'proof-manifest.json'), proofManifest);
  const pointer = { supervisorPID: supervisor.pid, manifestSHA256: hash(jsonBytes(proofManifest)) };
  if (existsSync(join(LOCAL, 'saved-proof.json')))
    writeNew(join(attempt, 'previous-proof-pointer.json'), regular(join(LOCAL, 'saved-proof.json')));
  replaceJSON(join(LOCAL, 'saved-proof.json'), pointer);
  report.savedProof = pointer;
}
async function verify() {
  const compiled = loadCompiled(), prepared = loadPrepared(compiled, toolchainBefore, fullCRS());
  const pointer = JSON.parse(regular(join(LOCAL, 'saved-proof.json')));
  assert.deepEqual(Object.keys(pointer).sort(), ['manifestSHA256', 'supervisorPID'], 'FLAT_PROOF_POINTER');
  const prior = assertSuccessfulAttempt('prove', pointer.supervisorPID);
  assert.equal(prior.selfVerified, true, 'FLAT_COMPLETED_PROOF_SELF_VERIFICATION');
  const proofAttempt = fixedAttempt('prove', pointer.supervisorPID);
  const manifestBytes = regular(join(proofAttempt, 'proof-manifest.json')), manifest = JSON.parse(manifestBytes);
  assert.equal(hash(manifestBytes), pointer.manifestSHA256, 'FLAT_SAVED_PROOF_MANIFEST');
  assert.equal(manifest.format, 'FLAT_COMPONENT_PUBLIC_PROOF_V1', 'FLAT_SAVED_PROOF_FORMAT');
  assert.equal(manifest.target, 'evm', 'FLAT_SAVED_PROOF_TARGET');
  const proof = regular(join(proofAttempt, 'proof.bin')), inputBytes = regular(join(proofAttempt, 'public-inputs.json'));
  const inputs = publicWords(JSON.parse(inputBytes));
  assert.equal(hash(proof), manifest.proofSHA256, 'FLAT_SAVED_PROOF_BYTES');
  assert.equal(proof.length, manifest.proofBytes, 'FLAT_SAVED_PROOF_LENGTH');
  assert.ok(proof.length > 32 && proof.length <= LIMITS.outputBytes && proof.length % 32 === 0, 'FLAT_SAVED_PROOF_SHAPE');
  assert.equal(hash(inputBytes), manifest.publicInputsSHA256, 'FLAT_SAVED_PUBLIC_INPUTS');
  assert.deepEqual(inputs, publicWords(manifest.expectedPublicInputs), 'FLAT_SAVED_EXPECTED_PUBLIC_INPUTS');
  for (const [name, value] of Object.entries(compiledPins(compiled))) assert.equal(manifest[name], value, 'FLAT_SAVED_PROOF_' + name);
  assert.equal(manifest.keySHA256, prepared.pins.keySHA256, 'FLAT_SAVED_PROOF_KEY');
  assert.equal(manifest.generatedPinFileSHA256, prepared.pinFileSHA256, 'FLAT_SAVED_PROOF_GENERATED_PINS');
  Object.assign(report, compiledPins(compiled), { proofSHA256: hash(proof), keySHA256: prepared.pins.keySHA256,
    sourceProofManifestSHA256: hash(manifestBytes), reproved: false, keyRecomputed: false });
  const bb = await loadPinned('@aztec/bb.js');
  await initializeWasm(bb, true);
  const verifier = new bb.UltraHonkVerifierBackend(api);
  const verifyCase = async (name, bytes, words, expected) => {
    phase(name);
    const began = performance.now();
    // Throws are always failures, including malformed negatives. Only an
    // explicit official boolean false counts as a rejection in this profile.
    const actual = await measured('verificationMilliseconds', () => verifier.verifyProof({
      proof: bytes, publicInputs: verifierWords(words), verificationKey: prepared.key }, { verifierTarget: 'evm' }));
    report.records.push({ name, expected, actual, milliseconds: performance.now() - began,
      proofSHA256: hash(bytes), publicInputsSHA256: hash(JSON.stringify(words)), rejectionKind: actual === false ? 'verifier-false' : null });
    save(); assert.equal(actual, expected, 'FLAT_INDEPENDENT_VERIFIER_' + name);
  };
  await verifyCase('genuine-saved-proof', proof, inputs, true);
  // bb 5.2 EVM ZK serialization: 8 pairing-point limbs, then 10 G1
  // commitments (2 words each), then the libraSum scalar at word 28.
  // Check the actual generated verifier layout before choosing the byte.
  // Mutating a terminal curve coordinate could instead cause a parser throw.
  const solidity = prepared.solidity.toString('utf8');
  assert.match(solidity, /uint256 constant PAIRING_POINTS_SIZE = 8;/, 'FLAT_PROOF_LAYOUT_PAIRING_POINTS');
  assert.match(solidity, /uint256 constant GROUP_ELEMENT_SIZE = 0x40;/, 'FLAT_PROOF_LAYOUT_GROUP_SIZE');
  assert.match(solidity, /uint256 constant FIELD_ELEMENT_SIZE = 0x20;/, 'FLAT_PROOF_LAYOUT_FIELD_SIZE');
  const prefix = /function loadProof\(bytes calldata proof, uint256 logN\)[\s\S]*?p\.libraSum = bytesToFr/.exec(solidity)?.[0];
  assert.ok(prefix, 'FLAT_PROOF_LAYOUT_LIBRA_SUM');
  assert.equal((prefix.match(/bytesToG1Point\(/g) ?? []).length, 10, 'FLAT_PROOF_LAYOUT_COMMITMENTS');
  assert.equal((prefix.match(/boundary \+= GROUP_ELEMENT_SIZE;/g) ?? []).length, 10, 'FLAT_PROOF_LAYOUT_GROUP_OFFSETS');
  const scalarWord = 28, scalarStart = scalarWord * 32;
  assert.ok(proof.length >= scalarStart + 32, 'FLAT_PROOF_LAYOUT_SCALAR_PRESENT');
  const originalScalar = BigInt('0x' + proof.subarray(scalarStart, scalarStart + 32).toString('hex'));
  assert.ok(originalScalar < 21888242871839275222246405745257275088548364400416034343698204186575808495617n,
    'FLAT_PROOF_LAYOUT_CANONICAL_SCALAR');
  const alteredProof = Buffer.from(proof);
  let byteOffset = scalarStart + 31, bitMask = 1;
  if (originalScalar !== 0n) {
    while (alteredProof[byteOffset] === 0) byteOffset -= 1;
    bitMask = alteredProof[byteOffset] & -alteredProof[byteOffset];
  }
  // Clear one existing set bit, or change zero to one: always canonical.
  alteredProof[byteOffset] ^= bitMask;
  report.proofMutation = { field: 'libraSum', scalarWord, byteOffset, bitMask,
    originalProofSHA256: hash(proof), alteredProofSHA256: hash(alteredProof), canonicalScalarPreserved: true };
  await verifyCase('altered-proof-bit', alteredProof, inputs, false);
  const alteredInputs = [...inputs]; alteredInputs[0] = (BigInt(alteredInputs[0]) ^ 1n).toString();
  await verifyCase('altered-public-word', proof, alteredInputs, false);
  checkCompiledStill(compiled); freezeCheck();
  assert.equal(loadPrepared(compiled, toolchainBefore, crsBefore).pinFileSHA256, prepared.pinFileSHA256,
    'FLAT_PREPARED_CHANGED_DURING_VERIFICATION');
  await destroyWasm(); report.independentlyVerified = true;
}

try {
  phase('checking-source');
  sourceBefore = sourceManifest(); hostBefore = executionSources();
  report.sources = sourceBefore; report.executionSources = hostBefore;
  report.sourceTreeSHA256 = hash(JSON.stringify(sourceBefore));
  report.executionSourceSHA256 = hash(JSON.stringify(hostBefore));
  resourceHelpers = await import(resourceModuleURL);
  toolchainBefore = resourceHelpers.verifyToolchain(); report.toolchain = toolchainBefore;
  assert.equal(toolchainBefore.barretenberg, '5.2.0', 'FLAT_PINNED_BB_VERSION');
  await ({ compile, constraints, 'prepare-key': prepareKey, prove, verify })[mode]();
  freezeCheck(); phase('completed');
} catch (error) {
  report.phase = 'failed';
  report.error = { name: error.name, code: error.code ?? null, message: String(error.message).slice(0, 2000) };
  process.exitCode = 1;
} finally {
  witness?.fill(0); rawWitness?.fill(0);
  if (api) {
    try { const owned = api; api = undefined; await owned.destroy(); }
    catch (error) {
      report.phase = 'failed'; report.cleanupError = { name: error.name, message: String(error.message).slice(0, 1000) };
      process.exitCode = 1;
    }
  }
  // Preserve failed attempt evidence and any generated artifacts. No retry.
  if (sourceBefore && hostBefore && toolchainBefore) {
    try { freezeCheck(); }
    catch (error) {
      report.phase = 'failed'; report.finalPinError = { name: error.name, message: String(error.message).slice(0, 1000) };
      process.exitCode = 1;
    }
  }
  report.metrics.totalMilliseconds = performance.now() - beganTotal;
  report.metrics.otherMilliseconds = report.metrics.totalMilliseconds - report.metrics.initializationMilliseconds
    - report.metrics.witnessMilliseconds - report.metrics.proofMilliseconds - report.metrics.verificationMilliseconds;
  report.completedAt = new Date().toISOString(); report.resourceUsage = process.resourceUsage();
  save();
}
console.log(JSON.stringify({ mode, phase: report.phase, report: relative(ROOT, join(attempt, 'result.json')),
  error: report.error?.code ?? (report.error ? 'COMPONENT_MODE_FAILED' : null) }));
