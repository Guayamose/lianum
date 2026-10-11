/** One fixed actual bb 5.2 native key, never a proof. Run only via the bounded
 * development supervisor; no paths, settings, threads or memory env overrides. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { verifyToolchain, verifyCRS, hash, CRS, guard, resources } from '@lianum/components/resources/wallet-resources';
import { PRIVATE_RESOURCE_POLICY } from '@lianum/components/resources/private-resource-policy';
import { ROOT, NATIVE_PROFILES, KEY_FORMAT, KEY_CLASSIFICATION, nativePaths, keySettings,
  assertCompiledNative, verifyNativeVerifier, validateNativeKeyBytes, validateNativeKey, installNativePin } from '../../../experiments/engine/private-core-proof/generic-native/pin-key.mjs';

assert.equal(process.argv.length, 3, 'NATIVE_KEY_SINGLE_FIXED_MODE_REQUIRED');
const mode = process.argv[2], paths = nativePaths(mode), profile = NATIVE_PROFILES[mode];
// Actual C129 statistics measured 1,767,525 gates / a 2^21 domain. Starting
// one appropriately sized backend avoids retaining a destroyed statistics VM
// alongside a second key VM. Keep the independent 3 GiB RSS guard unchanged.
// C's measured circuit uses 2^21 rows. R's first measured build exceeded
// 2^21; its equivalent authenticated-set form removes redundant quadratic
// comparisons, but remains a large two-recursion relation. Allocate its fixed
// 4 GiB WASM address-space ceiling once, never retain a discarded statistics
// VM. The independent 3 GiB RSS ceiling and existing CRS cap still apply.
// N's measured circuit also uses 2^21 rows (1,361,759 gates). The remaining
// relations verify two recursive children or four ECDSA signatures, so give
// their one VM the same bounded address-space ceiling up front. This does not
// preallocate 4 GiB or permit a larger CRS: measured rows, actual RSS, available
// memory and time remain separately checked before any key is published.
const initialMaximumPages = mode === 'dependency' ? 32768 : 65536;
// This process-local memory ceiling is not an OS limit. The independent parent
// remains responsible for sampling the 3 GiB RSS / 2.5 GiB RAM / 5 GiB disk guard.
const parentArgs = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
// argv[0] may legitimately be the PATH spelling "node". Authenticate the
// actual owned parent executable, rather than resolving that spelling in cwd.
assert.equal(realpathSync(`/proc/${process.ppid}/exe`), realpathSync(process.execPath), 'NATIVE_KEY_NODE_SUPERVISOR_REQUIRED');
assert.equal(resolve(parentArgs[1] ?? ''), join(ROOT, 'scripts/run-bounded-development.mjs'), 'NATIVE_KEY_BOUNDED_SUPERVISOR_REQUIRED');
assert.deepEqual(parentArgs.slice(2), ['prepare-key', 'native-' + mode], 'NATIVE_KEY_FIXED_SUPERVISOR_PROFILE');
assert.deepEqual(PRIVATE_RESOURCE_POLICY.floors, { availableRAM: 2684354560, freeDisk: 5368709120 }, 'NATIVE_KEY_FIXED_RESOURCE_FLOORS');
assert.equal(PRIVATE_RESOURCE_POLICY.proofWorkerRSSLimit, 3221225472, 'NATIVE_KEY_FIXED_RSS_GUARD');
assert.equal(PRIVATE_RESOURCE_POLICY.externalSampleMilliseconds, 250, 'NATIVE_KEY_FIXED_GUARD_INTERVAL');
guard();
mkdirSync(paths.directory, { recursive: true });
const startedAt = new Date().toISOString();
const attempt = join(paths.directory, 'key-attempts', startedAt.replace(/[:.]/g, '-') + '-' + process.pid);
mkdirSync(attempt, { recursive: true });
const report = { format: KEY_FORMAT, classification: KEY_CLASSIFICATION, mode, target: profile.target,
  publicInputWords: profile.words, startedAt, phase: 'checking-pins', proofGenerated: false,
  node: process.version, bbVersion: '5.2.0', threads: 1, maximumPages: initialMaximumPages,
  settings: keySettings(mode), resourcePolicy: PRIVATE_RESOURCE_POLICY, hostLimitsChanged: false,
  supervisor: { pid: process.ppid, command: parentArgs }, phaseHistory: [], memoryProfiles: [],
  expectedRecursiveProofFields: profile.target === 'noir-recursive' ? 458 : null,
};
let sequence = 0, api;
const snapshot = phase => {
  report.phase = phase;
  report.phaseHistory.push({ phase, at: new Date().toISOString(), resources: resources() });
  writeFileSync(join(attempt, String(sequence++).padStart(3, '0') + '-' + phase + '.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
};
const transition = phase => { guard(); snapshot(phase); };
try {
  snapshot('checking-pins');
  assert.equal(existsSync(paths.prepared), false, 'NATIVE_KEY_PREVIOUS_PREPARED_ARTIFACTS_RETAINED');
  assert.equal(existsSync(paths.keyPackage), false, 'NATIVE_KEY_PREVIOUS_PIN_RETAINED');
  const compiled = assertCompiledNative(mode), { program, compressed, manifest, sources } = compiled;
  Object.assign(report, { sources, sourceTreeSHA256: manifest.sourceTreeSHA256,
    artifactSHA256: manifest.programSHA256, circuitSHA256: manifest.bytecodeSHA256,
    compiledManifestSHA256: compiled.manifestSHA256, noirVersion: program.noir_version,
    verifier: verifyNativeVerifier(), toolchain: verifyToolchain(), crs: verifyCRS() });
  report.verifierSHA256 = report.verifier.sha256;
  globalThis.fetch = async () => { throw Error('NATIVE_KEY_NETWORK_FORBIDDEN'); };
  const require = createRequire(join(ROOT, 'experiments/private-core-proof/package.json'));
  const { Barretenberg, BackendType, fieldsToStrings, deflattenFields } = await import(pathToFileURL(require.resolve('@aztec/bb.js')));
  async function initialize(maximum) {
    report.maximumPages = maximum;
    report.memoryProfiles.push({ phase: report.phase, at: new Date().toISOString(), initial: 37, maximum, threads: 1 });
    api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum } });
  }
  transition('initializing-statistics-backend');
  await initialize(initialMaximumPages);
  const circuit = { name: mode, bytecode: gunzipSync(compressed), verificationKey: new Uint8Array() };
  transition('checking-circuit-capacity');
  report.stats = await api.circuitStats({ circuit, includeGatesPerOpcode: false, settings: report.settings });
  const dyadic = report.stats.numGatesDyadic;
  assert.ok(Number.isSafeInteger(dyadic) && dyadic > 0 && Math.log2(dyadic) % 1 === 0, 'NATIVE_KEY_ACTUAL_DYADIC_REQUIRED');
  assert.ok(dyadic <= 2097152, 'NATIVE_KEY_EXISTING_PINNED_CRS_TOO_SMALL');
  assert.ok(Number.isSafeInteger(report.stats.numGates) && report.stats.numGates > 0 && report.stats.numGates <= dyadic, 'NATIVE_KEY_ACTUAL_GATE_STATS');
  if (dyadic > 1048576) {
    // An unmeasured mode stops before CRS/key allocation. Its recorded actual
    // stats can justify a fixed larger profile on the next isolated attempt.
    assert.equal(initialMaximumPages, 65536, 'NATIVE_KEY_LARGE_PROFILE_REQUIRED');
  }
  transition('initializing-pinned-crs');
  await api.srsInitSrs({ pointsBuf: readFileSync(CRS + 'bn254_g1_compressed.dat'), numPoints: 2097152,
    g2Point: readFileSync(CRS + 'bn254_g2.dat') });
  transition('generating-actual-key');
  const key = await api.circuitComputeVk({ circuit, settings: report.settings });
  const bytes = Buffer.from(key.bytes);
  // Retain actual output in this immutable attempt even if a later check fails.
  writeFileSync(join(attempt, mode + '.vk'), bytes, { flag: 'wx' });
  assert.equal(key.hash.length, 32, 'NATIVE_KEY_HASH_BYTES');
  report.keyHashField = BigInt('0x' + Buffer.from(key.hash).toString('hex')).toString();
  assert.ok(BigInt(report.keyHashField) > 0n && BigInt(report.keyHashField) < 21888242871839275222246405745257275088548364400416034343698204186575808495617n, 'NATIVE_KEY_HASH_FIELD');
  report.keyBytes = bytes.length; report.keySHA256 = hash(bytes);
  let fieldsJSON, solidity;
  if (profile.target === 'noir-recursive') {
    transition('decoding-actual-key-fields');
    const fields = fieldsToStrings((await api.vkAsFields({ verificationKey: bytes })).fields).map(value => BigInt(value).toString());
    assert.equal(fields.length, 115, 'NATIVE_KEY_OFFICIAL_FIELD_COUNT');
    assert.deepEqual(fields.map(BigInt), deflattenFields(bytes).map(BigInt), 'NATIVE_KEY_OFFICIAL_FIELDS_SERIALIZATION');
    validateNativeKeyBytes(mode, bytes, fields, dyadic);
    report.keyFields = fields.length; report.keyDecoder = 'api.vkAsFields'; report.keyFieldsComparedToSerialized = true;
    fieldsJSON = JSON.stringify(fields) + '\n'; report.keyFieldsSHA256 = hash(fieldsJSON);
    writeFileSync(join(attempt, mode + '.fields.json'), fieldsJSON, { flag: 'wx' });
  } else {
    validateNativeKeyBytes(mode, bytes, undefined, dyadic);
    transition('exporting-actual-solidity-verifier');
    solidity = (await api.circuitWriteSolidityVerifier({ verificationKey: bytes, settings: report.settings })).solidityCode;
    assert.equal(typeof solidity, 'string', 'NATIVE_KEY_SOLIDITY_RESPONSE');
    assert.ok(solidity.includes('contract HonkVerifier'), 'NATIVE_KEY_SOLIDITY_VERIFIER');
    assert.match(solidity, new RegExp('NUMBER_OF_PUBLIC_INPUTS = ' + (profile.words + 8) + ';'), 'NATIVE_KEY_SOLIDITY_PUBLIC_COUNT');
    report.soliditySHA256 = hash(solidity); report.solidityBytes = Buffer.byteLength(solidity);
    writeFileSync(join(attempt, mode + '.sol'), solidity, { flag: 'wx' });
  }
  report.actualKeyPublicInputCount = Number(BigInt('0x' + bytes.subarray(32, 64).toString('hex')));
  report.pairingPointPublicInputWords = 8;
  transition('rechecking-pins');
  const current = assertCompiledNative(mode);
  assert.equal(current.manifestSHA256, compiled.manifestSHA256, 'NATIVE_KEY_MANIFEST_CHANGED_DURING_KEY');
  assert.deepEqual(current.sources, sources, 'NATIVE_KEY_SOURCE_CHANGED_DURING_KEY');
  assert.deepEqual(verifyNativeVerifier(), report.verifier, 'NATIVE_KEY_VERIFIER_CHANGED_DURING_KEY');
  assert.deepEqual(verifyToolchain(), report.toolchain, 'NATIVE_KEY_TOOLCHAIN_CHANGED_DURING_KEY');
  assert.deepEqual(verifyCRS(), report.crs, 'NATIVE_KEY_CRS_CHANGED_DURING_KEY');
  transition('destroying-key-backend');
  await api.destroy(); api = undefined;
  report.keyCompletedAt = new Date().toISOString(); report.resourceUsage = process.resourceUsage();
  // This immutable record describes key generation; installation is recorded
  // separately in the attempt result so the provenance hash never changes.
  const provenance = { ...report, phase: 'completed', keyPackageStatus: 'see-attempt-result' };
  const provenanceJSON = JSON.stringify(provenance, null, 2) + '\n';
  const staged = join(attempt, 'prepared'); mkdirSync(staged);
  writeFileSync(join(staged, mode + '.vk'), bytes, { flag: 'wx' });
  if (fieldsJSON) writeFileSync(join(staged, mode + '.fields.json'), fieldsJSON, { flag: 'wx' });
  if (solidity) writeFileSync(join(staged, mode + '.sol'), solidity, { flag: 'wx' });
  writeFileSync(join(staged, mode + '.key.json'), provenanceJSON, { flag: 'wx' });
  transition('publishing-actual-key');
  assert.equal(existsSync(paths.prepared), false, 'NATIVE_KEY_PREPARED_APPEARED_RETAINED');
  renameSync(staged, paths.prepared);
  const expected = { artifactSHA256: report.artifactSHA256, bytecodeSHA256: report.circuitSHA256,
    sourceTreeSHA256: report.sourceTreeSHA256, compiledManifestSHA256: report.compiledManifestSHA256,
    provenanceSHA256: hash(provenanceJSON), keySHA256: report.keySHA256,
    verifierSHA256: report.verifierSHA256, keyHashField: report.keyHashField };
  writeFileSync(join(attempt, 'pin-options.json'), JSON.stringify(expected, null, 2) + '\n', { flag: 'wx' });
  if (profile.target === 'noir-recursive') {
    transition('installing-actual-recursive-key-package');
    report.pin = installNativePin(mode, expected);
  } else {
    transition('validating-published-evm-key');
    validateNativeKey(mode, expected);
  }
  snapshot('completed');
} catch (error) {
  report.failedPhase = report.phase; report.phase = 'failed';
  report.error = { name: error.name, message: error.message }; process.exitCode = 1;
} finally {
  if (api) {
    try { await api.destroy(); } catch (error) {
      report.cleanupError = { name: error.name, message: error.message }; report.phase = 'failed'; process.exitCode = 1;
    }
  }
  report.completedAt = new Date().toISOString(); report.resourceUsage = process.resourceUsage(); report.finalResources = resources();
  writeFileSync(join(attempt, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ phase: report.phase, mode, report: join(attempt, 'result.json'), stats: report.stats,
    keySHA256: report.keySHA256, error: report.error }));
}
