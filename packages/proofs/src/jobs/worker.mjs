/** Internal one-task process. Its actual parent, sources and IPC are authenticated. */
import assert from 'node:assert/strict';
import { constants, closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { ROOT, LOCAL, PROFILE, SETTINGS, LIMITS, MEMORY, DISCLOSURE, operation, pagesFor } from '../catalog.mjs';
import { argumentsFor, authenticateSupervisor, attemptPath, regular, hash, jsonBytes,
  writeNew, writeJSON, replaceJSON, ensureDirectory, circuitIdentity, versionDirectory,
  verifyAPI, verifyVendor, resourceModuleURL, verifierCRSModuleURL, loadPinned, errorCode,
  assertABI, publicWords, verifierWords, validateJob, assertStats, assertKeyBytes, canonicalKeyHash,
  claimOperation, publishArtifact, artifactPointer, loadCompiled, loadStats, loadPrepared, compiledPins,
  assertID, assertHash } from '../tooling/tooling.mjs';
import { executionSources, limitsForMode, assertSuccessfulProvingAttempt } from './proving-execution.mjs';

// Libraries cannot place witnesses or provider tuples in operational logs.
for (const name of ['log', 'info', 'debug', 'warn', 'error', 'trace']) console[name] = () => {};
globalThis.fetch = async () => { throw Error('PW_OFFLINE_REQUIRED'); };
const { spec, mode, runId } = argumentsFor(true), op = operation(mode);
const taskLimits = limitsForMode(mode);
const supervisor = authenticateSupervisor(spec, mode, runId), attempt = attemptPath(runId);
assert.ok(existsSync(attempt), 'PW_SUPERVISOR_ATTEMPT_REQUIRED');
const initialPins = JSON.parse(regular(join(attempt, 'runtime-pins.json')));
const lock = JSON.parse(regular(join(LOCAL, 'active.lock')));
const jobId = lock.jobId;
const started = performance.now();
const report = { format: 'FLAT_WALLET_WORKER_ATTEMPT_V1', profile: PROFILE, relation: spec.name,
  role: spec.role, mode, runId, jobId: jobId ?? null, phase: 'starting', startedAt: new Date().toISOString(),
  disclosure: DISCLOSURE, target: 'evm', settings: SETTINGS, limits: taskLimits, threads: taskLimits.threads,
  maximumPages: MEMORY.standard, hostLimitsChanged: false, supervisor, publicWords: spec.publicWords,
  // Public timing attribution only. No witness, caller option or performance
  // acceptance is transported here; the original seven metrics stay exact.
  initialization: { backend: { calls: 0, milliseconds: 0 },
    provingCRS: { calls: 0, milliseconds: 0, points: LIMITS.provingCRSPoints, encoding: 'BN254_G1_COMPRESSED_32_BYTES' },
    verifierCRS: { calls: 0, milliseconds: 0 } },
  records: [], metrics: { initializationMilliseconds: 0, jobPreparationMilliseconds: 0,
    witnessMilliseconds: 0, proofMilliseconds: 0, verificationMilliseconds: 0, totalMilliseconds: 0 } };
// Public bytes were derived once from the original complete compressed CRS by
// the pinned official API and reviewed. Only exact absence uses the original
// route; a present cache with wrong bytes, metadata or identity is rejected.
const FULL_PUBLIC_CRS_CACHE_PIN = '2bb84462a0bdad2f6e6dd6182c7779c30aac703115e28f32ca2cc3b57c140622';
const FULL_PUBLIC_CRS_CACHE_PATH = resolve(ROOT,
  '../../../dev/cache/public-crs/full-v1/bn254_g1_full_uncompressed.dat');
let context, helpers, api, compressedWitness, rawWitness, crsBefore, job;
let publicCRSFile, publicCRSIdentity;
const publicFileIdentity = stat => ['dev', 'ino', 'size', 'mode', 'nlink', 'mtimeNs', 'ctimeNs']
  .map(name => [name, stat[name].toString()]);
function assertPublicCRSIdentity() {
  assert.deepEqual(publicFileIdentity(fstatSync(publicCRSFile, { bigint: true })), publicCRSIdentity,
    'PW_PUBLIC_CRS_FD_CHANGED');
  assert.equal(realpathSync(FULL_PUBLIC_CRS_CACHE_PATH), FULL_PUBLIC_CRS_CACHE_PATH, 'PW_PUBLIC_CRS_SYMLINK');
  assert.deepEqual(publicFileIdentity(lstatSync(FULL_PUBLIC_CRS_CACHE_PATH, { bigint: true })), publicCRSIdentity,
    'PW_PUBLIC_CRS_PATH_CHANGED');
}
function assertPublicCRSCache() {
  if (publicCRSFile === undefined) return;
  assertPublicCRSIdentity();
  const scratch = Buffer.alloc(64 * 1024), digest = createHash('sha256');
  let position = 0;
  try {
    let bytes;
    while ((bytes = readSync(publicCRSFile, scratch, 0, scratch.length, position)) > 0) {
      position += bytes; digest.update(scratch.subarray(0, bytes));
    }
    assert.equal(position, LIMITS.provingCRSPoints * 64, 'PW_FULL_PUBLIC_CRS_CACHE_SIZE');
    assert.equal(digest.digest('hex'), assertHash(FULL_PUBLIC_CRS_CACHE_PIN), 'PW_FULL_PUBLIC_CRS_CACHE_PIN');
    assertPublicCRSIdentity();
  } finally { scratch.fill(0); }
}
function fullProvingCRSBytes() {
  assert.equal(crsBefore?.points, LIMITS.provingCRSPoints, 'PW_ORIGINAL_FULL_CRS_REQUIRED');
  // lstat, unlike existsSync, does not turn permission or IO failures into an
  // absence fallback. A dangling symlink is present and must be rejected.
  try { lstatSync(FULL_PUBLIC_CRS_CACHE_PATH); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    report.publicCRSCache = { used: false, reason: 'EXACT_CACHE_ABSENCE' };
    return regular(helpers.CRS + 'bn254_g1_compressed.dat');
  }
  assertHash(FULL_PUBLIC_CRS_CACHE_PIN);
  assert.equal(publicCRSFile, undefined, 'PW_ONE_PUBLIC_CRS_LOAD');
  assert.equal(realpathSync(FULL_PUBLIC_CRS_CACHE_PATH), FULL_PUBLIC_CRS_CACHE_PATH, 'PW_PUBLIC_CRS_SYMLINK');
  publicCRSFile = openSync(FULL_PUBLIC_CRS_CACHE_PATH, constants.O_RDONLY | constants.O_NOFOLLOW);
  const stat = fstatSync(publicCRSFile, { bigint: true });
  assert.ok(stat.isFile(), 'PW_PUBLIC_CRS_REGULAR_FILE');
  assert.equal(stat.size, BigInt(LIMITS.provingCRSPoints * 64), 'PW_FULL_PUBLIC_CRS_CACHE_SIZE');
  publicCRSIdentity = publicFileIdentity(stat);
  const bytes = readFileSync(publicCRSFile);
  assertPublicCRSIdentity();
  assert.equal(bytes.length, LIMITS.provingCRSPoints * 64, 'PW_FULL_PUBLIC_CRS_CACHE_SIZE');
  assert.equal(hash(bytes), FULL_PUBLIC_CRS_CACHE_PIN, 'PW_FULL_PUBLIC_CRS_CACHE_PIN');
  report.initialization.provingCRS.encoding = 'BN254_G1_UNCOMPRESSED_64_BYTES';
  report.publicCRSCache = { used: true, points: LIMITS.provingCRSPoints, bytes: bytes.length,
    sha256: FULL_PUBLIC_CRS_CACHE_PIN, originalFullCRSVerified: true };
  return bytes;
}
const save = () => replaceJSON(join(attempt, 'result.json'), report);
function parentDisconnected() {
  if (report.phase === 'completed') return;
  report.phase = 'failed'; report.errorCode = 'PW_PARENT_CONTROL_CHANNEL_CLOSED';
  report.completedAt = new Date().toISOString();
  try { save(); } finally {
    // This worker owns only WASM threads, never chain processes. Exit reclaims
    // the private witness even if its parent was SIGKILLed and cannot clean up.
    process.exit(1);
  }
}
if (typeof process.send === 'function') process.once('disconnect', parentDisconnected);
function phase(value) { report.phase = value; save(); }
async function measured(metric, action) {
  const began = performance.now();
  try { return await action(); } finally { report.metrics[metric] += performance.now() - began; save(); }
}
// Keep the aggregate initialization budget unchanged; these nested timers
// distinguish public backend startup from CRS decoding in the same job.
async function initialized(component, action) {
  const entry = report.initialization[component];
  const began = performance.now(); entry.calls++;
  try { return await action(); } finally { entry.milliseconds += performance.now() - began; }
}
function freezeCheck() {
  assert.deepEqual(executionSources(spec, mode), initialPins.executionSources, 'PW_RUNTIME_CHANGED_DURING_TASK');
  assert.deepEqual(verifyAPI(), initialPins.api, 'PW_API_CHANGED_DURING_TASK');
  assert.deepEqual(verifyVendor(), initialPins.vendor, 'PW_VENDOR_CHANGED_DURING_TASK');
  if (context) {
    assert.deepEqual(helpers.verifyToolchain(), context.toolchain, 'PW_TOOLCHAIN_CHANGED_DURING_TASK');
    assert.deepEqual(circuitIdentity(spec, context.toolchain), context.identity, 'PW_NOIR_CHANGED_DURING_TASK');
  }
  if (crsBefore) assert.deepEqual(helpers.verifyCRS(), crsBefore, 'PW_FULL_CRS_CHANGED_DURING_TASK');
  assertPublicCRSCache();
}
function fullCRS() {
  crsBefore = helpers.verifyCRS();
  assert.equal(crsBefore.points, LIMITS.provingCRSPoints, 'PW_FULL_CRS_POINTS');
  report.crs = crsBefore; save(); return crsBefore;
}
async function initialize(bb, maximumPages = MEMORY.standard, verifierOnly = false) {
  assert.ok([MEMORY.standard, MEMORY.dyadic21].includes(maximumPages), 'PW_FIXED_MEMORY_PROFILE');
  report.maximumPages = maximumPages;
  await measured('initializationMilliseconds', async () => {
    phase('initializing-wasm');
    api = await initialized('backend', () => bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: taskLimits.threads, skipSrsInit: true,
      // A fixed sink prevents child C++ logs becoming raw private output.
      ...(op === 'prove' ? { logger: () => {} } : {}),
      memory: { initial: 37, maximum: maximumPages } }));
    if (op === 'prove') {
      const wasm = api.backend.wasm;
      assert.equal(wasm.getNumThreads(), taskLimits.threads, 'PW_ACTUAL_FIXED_PROVING_THREADS');
      assert.ok(typeof SharedArrayBuffer === 'function'
        && wasm.getMemory().buffer instanceof SharedArrayBuffer, 'PW_PROVING_SHARED_WASM_MEMORY');
      report.wasmThreadExecution = { threads: wasm.getNumThreads(), sharedMemory: true,
        oneOwnedProcess: true, originalPreparedKeyRequired: true };
    }
    if (verifierOnly) {
      phase('initializing-verifier-crs');
      const { initializePrivateVerifierCRS } = await import(verifierCRSModuleURL);
      report.verifierCRS = await initialized('verifierCRS', () => initializePrivateVerifierCRS(api, bb.BN254_G1_GENERATOR,
        regular(helpers.CRS + 'bn254_g2.dat')));
    }
  });
}
async function provingCRS() {
  phase('initializing-full-proving-crs');
  await measured('initializationMilliseconds', () => initialized('provingCRS', async () => {
    const pointsBuf = fullProvingCRSBytes();
    try {
      return await api.srsInitSrs({ pointsBuf, numPoints: LIMITS.provingCRSPoints,
        g2Point: regular(helpers.CRS + 'bn254_g2.dat') });
    } finally { pointsBuf.fill(0); }
  }));
}
async function destroy() {
  if (!api) return;
  const owned = api; api = undefined; phase('destroying-wasm'); await owned.destroy();
}
const circuit = (compiled, key = new Uint8Array()) => ({ name: spec.name,
  bytecode: gunzipSync(compiled.compressed), verificationKey: key });
function manifestBase(format, artifactId) {
  return { format, profile: PROFILE, relation: spec.name, sourceVersion: context.sourceVersion,
    runId, artifactId, generatedAt: new Date().toISOString() };
}
async function compile() {
  if (spec.name === 'node' || existsSync(artifactPointer(context, 'compiled'))) {
    const saved = await loadCompiled(context); report.compiled = { reused: true, ...compiledPins(saved) }; return;
  }
  const artifactId = claimOperation(context, 'compile');
  phase('compiling');
  const compiler = await loadPinned('@noir-lang/noir_wasm');
  const { program } = await compiler.compile(compiler.createFileManager(spec.circuit), undefined, () => {});
  const bytes = jsonBytes(program);
  writeNew(join(attempt, 'program.json'), bytes);
  assertABI(spec, program); freezeCheck();
  const compressed = Buffer.from(program.bytecode, 'base64');
  assert.equal(compressed.toString('base64'), program.bytecode, 'PW_CANONICAL_ACIR_BASE64');
  assert.ok(compressed[0] === 31 && compressed[1] === 139, 'PW_GZIP_ACIR');
  const manifest = { ...manifestBase('FLAT_WALLET_COMPILED_V1', artifactId), identity: context.identity,
    programSHA256: hash(bytes), bytecodeSHA256: hash(compressed), abiSHA256: hash(JSON.stringify(program.abi)) };
  report.compiled = publishArtifact(context, 'compiled', artifactId, manifest, { 'program.json': bytes });
}
async function stats() {
  const compiled = await loadCompiled(context); Object.assign(report, compiledPins(compiled));
  if (spec.name === 'node' || existsSync(artifactPointer(context, 'stats'))) {
    const saved = await loadStats(context, compiled);
    report.stats = saved.manifest.stats; report.statistics = { reused: true, manifestSHA256: saved.manifestSHA256 }; return;
  }
  const artifactId = claimOperation(context, 'stats'), bb = await loadPinned('@aztec/bb.js');
  await initialize(bb); phase('aggregate-stats');
  const result = await api.circuitStats({ circuit: circuit(compiled), includeGatesPerOpcode: false, settings: SETTINGS });
  // Store only actual aggregate fields. There is no opcode profiling output.
  report.stats = { numGates: result.numGates, numGatesDyadic: result.numGatesDyadic, numAcirOpcodes: result.numAcirOpcodes };
  writeJSON(join(attempt, 'actual-aggregate-stats.json'), report.stats); save();
  assertStats(report.stats); // Over-cap evidence already exists before refusal.
  freezeCheck(); await destroy();
  const manifest = { ...manifestBase('FLAT_WALLET_STATS_V1', artifactId), ...compiledPins(compiled),
    stats: report.stats, includeGatesPerOpcode: false, crsInitialized: false, keyGenerated: false };
  report.statistics = publishArtifact(context, 'stats', artifactId, manifest, {});
}
async function prepareKey() {
  const compiled = await loadCompiled(context), statistics = await loadStats(context, compiled);
  Object.assign(report, compiledPins(compiled)); report.stats = statistics.manifest.stats;
  const dyadic = assertStats(report.stats), maximumPages = pagesFor(mode, report.stats);
  report.maximumPages = maximumPages; report.statisticsRecomputed = false;
  if (spec.name === 'node' || existsSync(artifactPointer(context, 'prepared'))) {
    const saved = await loadPrepared(context, compiled, fullCRS());
    report.prepared = { reused: true, manifestSHA256: saved.manifestSHA256, keySHA256: hash(saved.key) }; return;
  }
  const artifactId = claimOperation(context, 'prepare-key');
  fullCRS(); const bb = await loadPinned('@aztec/bb.js');
  await initialize(bb, maximumPages); await provingCRS(); phase('generating-key');
  const generated = await api.circuitComputeVk({ circuit: circuit(compiled), settings: SETTINGS });
  const key = Buffer.from(generated.bytes); writeNew(join(attempt, 'key.vk'), key);
  assertKeyBytes(spec, key, dyadic); assert.equal(generated.hash.length, 32, 'PW_KEY_HASH_BYTES');
  const keyHashField = canonicalKeyHash(BigInt('0x' + Buffer.from(generated.hash).toString('hex')).toString());
  phase('generating-verifier');
  const solidity = (await api.circuitWriteSolidityVerifier({ verificationKey: key, settings: SETTINGS })).solidityCode;
  assert.equal(typeof solidity, 'string', 'PW_SOLIDITY_STRING');
  writeNew(join(attempt, 'verifier.sol'), solidity);
  assert.ok(solidity.includes('contract HonkVerifier'), 'PW_SOLIDITY_VERIFIER');
  assert.ok(new RegExp('NUMBER_OF_PUBLIC_INPUTS\\s*=\\s*' + (spec.publicWords + 8) + ';').test(solidity), 'PW_SOLIDITY_PUBLIC_COUNT');
  freezeCheck(); await destroy();
  const manifest = { ...manifestBase('FLAT_WALLET_KEY_V1', artifactId), identity: context.identity,
    ...compiledPins(compiled), statsManifestSHA256: statistics.manifestSHA256, crs: crsBefore,
    target: 'evm', settings: SETTINGS, publicWords: spec.publicWords, actualKeyPublicCount: spec.publicWords + 8,
    maximumPages, threads: 1, proofGenerated: false, keySHA256: hash(key), keyBytes: key.length, keyHashField,
    soliditySHA256: hash(solidity), solidityBytes: Buffer.byteLength(solidity) };
  report.prepared = publishArtifact(context, 'prepared', artifactId, manifest, { 'key.vk': key, 'verifier.sol': solidity });
  // Explicit generated pins are factual outputs of this attempt, never invented.
  writeJSON(join(attempt, 'generated-pins.json'), { ...compiledPins(compiled),
    keyManifestSHA256: report.prepared.manifestSHA256, keySHA256: manifest.keySHA256, keyHashField,
    soliditySHA256: manifest.soliditySHA256, fullCRSProvenanceSHA256: crsBefore.provenanceSHA256 });
}
async function prove() {
  assert.equal(typeof process.send, 'function', 'PW_PRIVATE_IPC_REQUIRED'); assertID(jobId);
  const compiled = await loadCompiled(context), statistics = await loadStats(context, compiled);
  const maximumPages = pagesFor(mode, statistics.manifest.stats);
  const prepared = await loadPrepared(context, compiled, fullCRS());
  Object.assign(report, compiledPins(compiled), { keySHA256: hash(prepared.key), keyManifestSHA256: prepared.manifestSHA256,
    keyRecomputed: false, maximumPages });
  phase('receiving-scoped-job');
  await measured('jobPreparationMilliseconds', async () => {
    const adapter = await import(pathToFileURL(join(ROOT, 'proof-workers/trusted-jobs.mjs')));
    assert.equal(typeof adapter.prepareJob, 'function', 'PW_TRUSTED_PREPARE_JOB');
    // Adapter installs one message listener synchronously, then awaits exactly
    // one matching bounded message. No private payload is written to disk.
    assert.equal(typeof adapter.validateJobAgainstABI, 'function', 'PW_TRUSTED_ABI_VALIDATOR');
    const pending = adapter.prepareJob({ relation: spec.name, role: spec.role, jobId });
    assert.equal(process.listenerCount('message'), 1, 'PW_ONE_JOB_LISTENER');
    const received = await pending;
    job = validateJob(spec, compiled.program, adapter.validateJobAgainstABI(compiled.program.abi,
      received.inputs, received.expectedPublicInputs, spec.name));
    assert.equal(process.listenerCount('message'), 0, 'PW_JOB_LISTENER_REMOVED');
    // Retain the liveness channel, but accept no second private message.
    process.once('message', parentDisconnected);
  });
  const bb = await loadPinned('@aztec/bb.js'), { Noir } = await loadPinned('@noir-lang/noir_js');
  await initialize(bb, maximumPages); await provingCRS(); phase('executing-witness');
  ({ witness: compressedWitness } = await measured('witnessMilliseconds', () => new Noir(compiled.program).execute(job.inputs)));
  // Drop all structured private inputs before proof publication. JS strings
  // cannot be guaranteed erased; this fresh worker exits after one task.
  const expected = job.expectedPublicInputs; job.inputs = undefined; job = undefined;
  phase('proving'); let proof, rawInputs;
  await measured('proofMilliseconds', async () => {
    rawWitness = gunzipSync(compressedWitness);
    const generated = await api.circuitProve({ circuit: circuit(compiled, prepared.key), witness: rawWitness, settings: SETTINGS });
    proof = Buffer.concat(generated.proof.map(field => Buffer.from(field)));
    rawInputs = generated.publicInputs.map(field => '0x' + Buffer.from(field).toString('hex'));
    rawWitness.fill(0); rawWitness = undefined;
  });
  compressedWitness.fill(0); compressedWitness = undefined;
  assert.ok(proof.length > 0 && proof.length % 32 === 0 && proof.length <= LIMITS.outputBytes, 'PW_PROOF_SIZE');
  writeNew(join(attempt, 'proof.bin'), proof); writeJSON(join(attempt, 'raw-public-inputs.json'), rawInputs);
  const words = publicWords(spec, rawInputs); writeJSON(join(attempt, 'public-inputs.json'), words);
  Object.assign(report, { proofSHA256: hash(proof), proofBytes: proof.length,
    publicInputsSHA256: hash(jsonBytes(words)), proofGenerated: true }); save();
  assert.deepEqual(words, expected, 'PW_PROVED_PUBLIC_INPUTS'); phase('self-verifying');
  const verified = await measured('verificationMilliseconds', () => new bb.UltraHonkVerifierBackend(api).verifyProof({
    proof, publicInputs: verifierWords(spec, words), verificationKey: prepared.key }, { verifierTarget: 'evm' }));
  assert.equal(verified, true, 'PW_GENUINE_SELF_VERIFICATION'); report.selfVerified = true;
  assert.equal((await loadPrepared(context, compiled, crsBefore)).manifestSHA256, prepared.manifestSHA256, 'PW_KEY_CHANGED_DURING_PROOF');
  freezeCheck(); await destroy();
  const artifactId = randomUUID(), manifest = { ...manifestBase('FLAT_WALLET_PUBLIC_PROOF_V1', artifactId),
    jobId, role: spec.role, ...compiledPins(compiled), target: 'evm', settings: SETTINGS,
    keyManifestSHA256: prepared.manifestSHA256, keySHA256: hash(prepared.key),
    proofSHA256: hash(proof), proofBytes: proof.length, publicInputsSHA256: hash(jsonBytes(words)),
    publicWords: spec.publicWords, selfVerified: true, runtimePinsSHA256: hash(jsonBytes(initialPins)),
    completeMetricsReport: relative(ROOT, join(attempt, 'result.json')), disclosure: DISCLOSURE };
  writeJSON(join(attempt, 'proof-manifest.json'), manifest);
  const pointer = { runId, artifactId, manifestSHA256: hash(jsonBytes(manifest)) };
  // The generated job UUID has a durable one-time claim owned by the parent.
  writeJSON(join(context.directory, 'proofs', jobId + '.json'), pointer);
  const latest = join(context.directory, 'latest-proof.json');
  if (existsSync(latest)) writeNew(join(attempt, 'previous-proof-pointer.json'), regular(latest));
  replaceJSON(latest, pointer); report.savedProof = pointer;
}
async function verify() {
  const compiled = await loadCompiled(context), prepared = await loadPrepared(context, compiled, fullCRS());
  const pointer = JSON.parse(regular(join(context.directory, 'latest-proof.json')));
  assert.deepEqual(Object.keys(pointer).sort(), ['artifactId', 'manifestSHA256', 'runId'], 'PW_PROOF_POINTER');
  assertID(pointer.artifactId);
  const prior = assertSuccessfulProvingAttempt(spec, pointer.runId), source = attemptPath(pointer.runId);
  assert.equal(prior.selfVerified, true, 'PW_PRIOR_SELF_VERIFIED');
  const manifestBytes = regular(join(source, 'proof-manifest.json')), manifest = JSON.parse(manifestBytes);
  assert.equal(hash(manifestBytes), assertHash(pointer.manifestSHA256), 'PW_PROOF_MANIFEST_HASH');
  assert.equal(manifest.format, 'FLAT_WALLET_PUBLIC_PROOF_V1', 'PW_PROOF_FORMAT');
  assert.equal(manifest.profile, PROFILE, 'PW_PROOF_PROFILE');
  assert.equal(manifest.relation, spec.name, 'PW_PROOF_RELATION');
  assert.equal(manifest.sourceVersion, context.sourceVersion, 'PW_PROOF_SOURCE_VERSION');
  assert.equal(manifest.runId, pointer.runId, 'PW_PROOF_RUN');
  assert.equal(manifest.artifactId, pointer.artifactId, 'PW_PROOF_ARTIFACT');
  assert.equal(manifest.target, 'evm', 'PW_PROOF_TARGET');
  assert.deepEqual(manifest.settings, SETTINGS, 'PW_PROOF_SETTINGS');
  for (const [name, value] of Object.entries(compiledPins(compiled))) assert.equal(manifest[name], value, 'PW_PROOF_COMPILED_PINS');
  assert.equal(manifest.keySHA256, hash(prepared.key), 'PW_PROOF_KEY');
  assert.equal(manifest.keyManifestSHA256, prepared.manifestSHA256, 'PW_PROOF_KEY_MANIFEST');
  const proof = regular(join(source, 'proof.bin')), inputBytes = regular(join(source, 'public-inputs.json'));
  const words = publicWords(spec, JSON.parse(inputBytes));
  assert.equal(hash(proof), manifest.proofSHA256, 'PW_PROOF_BYTES_HASH');
  assert.equal(proof.length, manifest.proofBytes, 'PW_PROOF_BYTES_LENGTH');
  assert.ok(proof.length > 0 && proof.length % 32 === 0 && proof.length <= LIMITS.outputBytes, 'PW_PROOF_SIZE');
  assert.equal(hash(inputBytes), manifest.publicInputsSHA256, 'PW_PROOF_PUBLIC_HASH');
  assert.equal(manifest.publicWords, spec.publicWords, 'PW_PROOF_PUBLIC_COUNT');
  assert.equal(manifest.selfVerified, true, 'PW_PROOF_SELF_VERIFIED');
  Object.assign(report, compiledPins(compiled), { sourceProofManifestSHA256: pointer.manifestSHA256,
    proofSHA256: hash(proof), publicInputsSHA256: hash(inputBytes), keySHA256: hash(prepared.key), reproved: false, keyRecomputed: false });
  const bb = await loadPinned('@aztec/bb.js'); await initialize(bb, MEMORY.standard, true);
  const verifier = new bb.UltraHonkVerifierBackend(api);
  async function verifyCase(name, bytes, inputs, expected) {
    phase(name); const began = performance.now();
    // Any throw is an operational failure. Only official boolean false counts
    // as the expected rejection; valid-proof errors are never hidden.
    const actual = await measured('verificationMilliseconds', () => verifier.verifyProof({ proof: bytes,
      publicInputs: verifierWords(spec, inputs), verificationKey: prepared.key }, { verifierTarget: 'evm' }));
    report.records.push({ name, expected, actual, milliseconds: performance.now() - began,
      proofSHA256: hash(bytes), publicInputsSHA256: hash(jsonBytes(inputs)) }); save();
    assert.equal(actual, expected, 'PW_INDEPENDENT_VERIFICATION_RESULT');
  }
  await verifyCase('genuine-proof', proof, words, true);
  const solidity = prepared.solidity.toString('utf8');
  assert.match(solidity, /uint256 constant PAIRING_POINTS_SIZE = 8;/, 'PW_LAYOUT_PAIRING');
  assert.match(solidity, /uint256 constant GROUP_ELEMENT_SIZE = 0x40;/, 'PW_LAYOUT_GROUP');
  assert.match(solidity, /uint256 constant FIELD_ELEMENT_SIZE = 0x20;/, 'PW_LAYOUT_FIELD');
  const prefix = /function loadProof\(bytes calldata proof, uint256 logN\)[\s\S]*?p\.libraSum = bytesToFr/.exec(solidity)?.[0];
  assert.ok(prefix, 'PW_LAYOUT_LIBRA_SUM');
  assert.equal((prefix.match(/bytesToG1Point\(/g) ?? []).length, 10, 'PW_LAYOUT_COMMITMENTS');
  assert.equal((prefix.match(/boundary \+= GROUP_ELEMENT_SIZE;/g) ?? []).length, 10, 'PW_LAYOUT_OFFSETS');
  const scalarStart = 28 * 32; assert.ok(proof.length >= scalarStart + 32, 'PW_LAYOUT_SCALAR_PRESENT');
  const original = BigInt('0x' + proof.subarray(scalarStart, scalarStart + 32).toString('hex'));
  assert.ok(original < 21888242871839275222246405745257275088548364400416034343698204186575808495617n, 'PW_LAYOUT_SCALAR_CANONICAL');
  const altered = Buffer.from(proof); let byteOffset = scalarStart + 31, bitMask = 1;
  if (original !== 0n) { while (altered[byteOffset] === 0) byteOffset--; bitMask = altered[byteOffset] & -altered[byteOffset]; }
  altered[byteOffset] ^= bitMask;
  report.proofMutation = { field: 'libraSum', scalarWord: 28, byteOffset, bitMask, canonicalScalarPreserved: true };
  await verifyCase('altered-proof-scalar', altered, words, false);
  // Alter a low digest word while retaining canonical Fr and u32 encoding.
  const changed = [...words];
  let index = 7;
  while (index > 0 && BigInt(changed[index]) === 0n) index--;
  const current = BigInt(changed[index]);
  changed[index] = (current === 0n ? 1n : current & (current - 1n)).toString();
  publicWords(spec, changed);
  await verifyCase('altered-public-word', proof, changed, false);
  freezeCheck();
  assert.equal((await loadPrepared(context, compiled, crsBefore)).manifestSHA256, prepared.manifestSHA256, 'PW_KEY_CHANGED_DURING_VERIFICATION');
  await destroy(); report.independentlyVerified = true;
}
try {
  freezeCheck(); helpers = await import(resourceModuleURL);
  const toolchain = helpers.verifyToolchain(); assert.equal(toolchain.barretenberg, '5.2.0', 'PW_BB_VERSION');
  const identity = circuitIdentity(spec, toolchain), sourceVersion = hash(JSON.stringify(identity));
  context = { spec, mode, runId, toolchain, identity, sourceVersion, directory: versionDirectory(spec, sourceVersion) };
  report.sourceVersion = sourceVersion; report.runtimePinsSHA256 = hash(jsonBytes(initialPins));
  report.identity = identity; report.toolchain = toolchain;
  await ({ compile, stats, 'prepare-key': prepareKey, prove, verify })[op]();
  freezeCheck(); phase('completed');
} catch (error) {
  report.phase = 'failed'; report.errorCode = errorCode(error); process.exitCode = 1;
} finally {
  compressedWitness?.fill(0); rawWitness?.fill(0); job = undefined;
  if (api) {
    try { const owned = api; api = undefined; await owned.destroy(); }
    catch (error) { report.phase = 'failed'; report.cleanupErrorCode = errorCode(error); process.exitCode = 1; }
  }
  try { freezeCheck(); } catch (error) { report.phase = 'failed'; report.finalPinErrorCode = errorCode(error); process.exitCode = 1; }
  if (publicCRSFile !== undefined) {
    try { closeSync(publicCRSFile); }
    catch (error) { report.phase = 'failed'; report.publicCRSClosureErrorCode = errorCode(error); process.exitCode = 1; }
    finally { publicCRSFile = undefined; }
  }
  report.metrics.totalMilliseconds = performance.now() - started;
  report.metrics.otherMilliseconds = report.metrics.totalMilliseconds - report.metrics.initializationMilliseconds
    - report.metrics.jobPreparationMilliseconds - report.metrics.witnessMilliseconds - report.metrics.proofMilliseconds
    - report.metrics.verificationMilliseconds;
  report.resourceUsage = process.resourceUsage(); report.completedAt = new Date().toISOString(); save();
  process.removeListener('disconnect', parentDisconnected);
  process.removeListener('message', parentDisconnected);
  if (process.connected) process.disconnect();
}
process.stdout.write(JSON.stringify({ relation: spec.name, mode, runId, phase: report.phase,
  errorCode: report.errorCode ?? null }) + '\n');
