/** Fixed, offline derivation of public CRS bytes; no proof or private input is accepted. */
import assert from 'node:assert/strict';
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS, MEMORY } from '../../../.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/catalog.mjs';
import { hash, jsonBytes, loadPinned, regular, resourceFailure, resourceModuleURL,
  resources, verifyAPI, verifyVendor } from '../../../.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/tooling.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = resolve(HERE, '../../..');
const OUTPUT = join(REPOSITORY, '.internal/dev/cache/public-crs/full-v1');
const CACHE = join(OUTPUT, 'bn254_g1_full_uncompressed.dat');
const RECEIPT = join(OUTPUT, 'derivation.json');
const POINTS = 2097152, BYTES = POINTS * 64;
const REVIEWED_FULL_PUBLIC_CRS_SHA256 = '2bb84462a0bdad2f6e6dd6182c7779c30aac703115e28f32ca2cc3b57c140622';
const SOURCES = Object.freeze([
  ['scripts/development/public-crs/derive-full-public-crs.py', 'f64907cc6af0d13ced0fe6d958729db313a1df8a0aa5ad376d9952f4d2bc9bf8'],
  ['.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/tooling.mjs', '18ac833e360d6450f62f9d6f53744eadaed9c202ddfc0f096c720bf0152b5ddc'],
  ['.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/catalog.mjs', '5cfeba63766989166eeaff93e010431f74336f398b78cbad0d0e088a913acd69'],
  ['.internal/runtime/omnichain-product/experiments/private-core-proof/wallet-notes/resources.mjs', '415d49b3da693225700281f986d7f1658a5f1e89aa73be7f7a622afeebecdc0c'],
  ['.internal/runtime/omnichain-product/src/private-resource-policy.mjs', 'cfa5d5c298d968c0027e4bba1398a6746ab151aad24debaa1429a9232e35927c'],
  ['.internal/runtime/omnichain-product/experiments/private-core-proof/node_modules/@aztec/bb.js/src/crs/node/index.ts', '056281aaf76dd09aeb647605d9ad4763b58161e1e72a9cd87df8bc1f1959b71b'],
]);
const identity = stat => ['dev', 'ino', 'size', 'mode', 'nlink', 'mtimeNs', 'ctimeNs']
  .map(name => [name, stat[name].toString()]);
function pinnedRead(path, expected) {
  assert.equal(realpathSync(path), resolve(path), 'PUBLIC_CRS_NO_SYMLINK');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    assert.ok(before.isFile(), 'PUBLIC_CRS_REGULAR_FILE');
    assert.equal(before.size, BigInt(expected.bytes), 'PUBLIC_CRS_INPUT_BYTES');
    const bytes = readFileSync(fd);
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), identity(before), 'PUBLIC_CRS_CONCURRENT_FILE_CHANGE');
    assert.deepEqual(identity(lstatSync(path, { bigint: true })), identity(before), 'PUBLIC_CRS_PATH_CHANGED');
    assert.equal(bytes.length, expected.bytes, 'PUBLIC_CRS_INPUT_BYTES');
    assert.equal(hash(bytes), expected.sha256, 'PUBLIC_CRS_INPUT_SHA256');
    return bytes;
  } finally { closeSync(fd); }
}
function sourcePins() {
  const pins = SOURCES.map(([path, sha256]) => {
    const bytes = regular(join(REPOSITORY, path));
    assert.equal(hash(bytes), sha256, 'PUBLIC_CRS_SOURCE_PIN');
    return { path, bytes: bytes.length, sha256 };
  });
  const producer = regular(fileURLToPath(import.meta.url));
  return { pins, producer: { bytes: producer.length, sha256: hash(producer) } };
}
function outputDirectory() {
  assert.equal(realpathSync(REPOSITORY), REPOSITORY, 'PUBLIC_CRS_OUTPUT_ANCESTOR');
  const missing = []; let ancestor = OUTPUT;
  while (!existsSync(ancestor)) { missing.push(ancestor); ancestor = dirname(ancestor); }
  assert.equal(realpathSync(ancestor), ancestor, 'PUBLIC_CRS_OUTPUT_ANCESTOR');
  assert.ok(lstatSync(ancestor).isDirectory(), 'PUBLIC_CRS_OUTPUT_ANCESTOR_DIRECTORY');
  for (const directory of missing.reverse()) mkdirSync(directory, { mode: 0o700 });
  assert.equal(realpathSync(OUTPUT), OUTPUT, 'PUBLIC_CRS_OUTPUT_SYMLINK');
  assert.ok(lstatSync(OUTPUT).isDirectory(), 'PUBLIC_CRS_OUTPUT_DIRECTORY');
  assert.ok(!existsSync(CACHE) && !existsSync(RECEIPT), 'PUBLIC_CRS_FRESH_OUTPUT_REQUIRED');
}
function writePublic(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

export async function deriveOriginalFullPublicCrs() {
  assert.equal(arguments.length, 0, 'PUBLIC_CRS_NO_CALLER_CONFIGURATION');
  assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_PATH && !process.env.CRS_PATH,
    'PUBLIC_CRS_FIXED_RUNTIME_CONFIGURATION');
  assert.deepEqual(process.execArgv, ['--max-old-space-size=384'], 'PUBLIC_CRS_FIXED_NODE_OPTIONS');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2, 'PUBLIC_CRS_ORIGINAL_GUARD_REQUIRED');
  assert.equal(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1]),
    join(REPOSITORY, 'scripts/development/public-crs/derive-full-public-crs.py'), 'PUBLIC_CRS_ORIGINAL_GUARD_REQUIRED');
  const lock = JSON.parse(regular('/tmp/lianum-paeg-proof-host.lock'));
  assert.equal(lock.parentPID, process.ppid, 'PUBLIC_CRS_ORIGINAL_GUARD_LOCK');
  assert.equal(lock.mode, 'ORIGINAL_FULL_PUBLIC_CRS_V1', 'PUBLIC_CRS_ORIGINAL_GUARD_LOCK');
  const active = JSON.parse(regular(join(REPOSITORY,
    '.internal/runtime/omnichain-flat-profile/flat-wallet/.local/proof-workers/active.lock')));
  assert.equal(active.pid, process.ppid, 'PUBLIC_CRS_ORIGINAL_FLAT_GUARD_LOCK');
  assert.equal(active.parentPID, process.ppid, 'PUBLIC_CRS_ORIGINAL_FLAT_GUARD_LOCK');
  assert.equal(active.mode, 'ORIGINAL_FULL_PUBLIC_CRS_V1', 'PUBLIC_CRS_ORIGINAL_FLAT_GUARD_LOCK');
  assert.equal(LIMITS.provingCRSPoints, POINTS, 'PUBLIC_CRS_FULL_POINTS_REQUIRED');
  assert.equal(LIMITS.workerRSS, 3221225472, 'PUBLIC_CRS_ORIGINAL_RSS_LIMIT');
  outputDirectory();
  const started = performance.now(), startedAt = new Date().toISOString();
  const samples = { count: 0, maximumWorkerRSS: 0, minimumAvailableRAM: Number.MAX_SAFE_INTEGER,
    minimumFreeDisk: Number.MAX_SAFE_INTEGER };
  const sample = () => {
    const actual = resources(process.pid);
    samples.count++; samples.maximumWorkerRSS = Math.max(samples.maximumWorkerRSS, actual.workerRSS);
    samples.minimumAvailableRAM = Math.min(samples.minimumAvailableRAM, actual.availableRAM);
    samples.minimumFreeDisk = Math.min(samples.minimumFreeDisk, actual.freeDisk);
    assert.equal(resourceFailure(actual), null, 'PUBLIC_CRS_ORIGINAL_RESOURCE_LIMIT');
  };
  sample();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('PUBLIC_CRS_OFFLINE_REQUIRED'); };
  let api, compressed, g2, uncompressed, poll;
  try {
    const sources = sourcePins(), helpers = await import(resourceModuleURL);
    const snapshot = () => ({ sources: sourcePins(), api: verifyAPI(), vendor: verifyVendor(),
      toolchain: helpers.verifyToolchain(), crs: helpers.verifyCRS() });
    const before = snapshot();
    assert.deepEqual(before.sources, sources, 'PUBLIC_CRS_SOURCES_CHANGED');
    assert.equal(before.crs.points, POINTS, 'PUBLIC_CRS_FULL_ORIGINAL_CRS');
    const compressedPin = before.crs.records.find(record => record.file === 'bn254_g1_compressed.dat');
    const g2Pin = before.crs.records.find(record => record.file === 'bn254_g2.dat');
    assert.equal(compressedPin.bytes, POINTS * 32, 'PUBLIC_CRS_ORIGINAL_COMPRESSED_SIZE');
    assert.equal(g2Pin.bytes, 128, 'PUBLIC_CRS_ORIGINAL_G2_SIZE');
    compressed = pinnedRead(join(helpers.CRS, compressedPin.file), compressedPin);
    g2 = pinnedRead(join(helpers.CRS, g2Pin.file), g2Pin);
    // This process owns only the official WASM backend. Exit reclaims its memory
    // on a resource failure; no caller PID, chain service, lock or witness exists.
    poll = setInterval(() => {
      try { sample(); } catch {
        process.stderr.write('PUBLIC_CRS_ORIGINAL_RESOURCE_LIMIT\n'); process.exit(1);
      }
    }, LIMITS.sampleMilliseconds);
    const bb = await loadPinned('@aztec/bb.js');
    const backendStarted = performance.now();
    api = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1, skipSrsInit: true,
      memory: { initial: 37, maximum: MEMORY.standard }, logger: () => {} });
    const backendMilliseconds = performance.now() - backendStarted;
    sample(); const derivationStarted = performance.now();
    const derived = await api.srsInitSrs({ pointsBuf: compressed, numPoints: POINTS, g2Point: g2 });
    const derivationMilliseconds = performance.now() - derivationStarted;
    assert.ok(derived.pointsBuf instanceof Uint8Array, 'PUBLIC_CRS_OFFICIAL_BYTES_REQUIRED');
    uncompressed = derived.pointsBuf;
    assert.equal(uncompressed.length, BYTES, 'PUBLIC_CRS_FULL_UNCOMPRESSED_SIZE');
    const sha256 = hash(uncompressed);
    assert.equal(sha256, REVIEWED_FULL_PUBLIC_CRS_SHA256, 'PUBLIC_CRS_REVIEWED_DERIVATION_PIN');
    assert.equal(hash(compressed), compressedPin.sha256, 'PUBLIC_CRS_ORIGINAL_INPUT_CHANGED');
    assert.equal(hash(g2), g2Pin.sha256, 'PUBLIC_CRS_ORIGINAL_G2_CHANGED');
    sample(); const acceptanceStarted = performance.now();
    const accepted = await api.srsInitSrs({ pointsBuf: uncompressed, numPoints: POINTS, g2Point: g2 });
    const acceptanceMilliseconds = performance.now() - acceptanceStarted;
    assert.ok(accepted.pointsBuf instanceof Uint8Array, 'PUBLIC_CRS_OFFICIAL_RESPONSE_REQUIRED');
    assert.equal(accepted.pointsBuf.length, 0, 'PUBLIC_CRS_UNCOMPRESSED_RESPONSE_REVIEW_REQUIRED');
    assert.equal(hash(uncompressed), sha256, 'PUBLIC_CRS_DERIVED_BYTES_CHANGED');
    assert.equal(hash(g2), g2Pin.sha256, 'PUBLIC_CRS_ORIGINAL_G2_CHANGED');
    sample();
    await api.destroy(); api = undefined;
    const after = snapshot();
    assert.deepEqual(after, before, 'PUBLIC_CRS_ORIGINAL_PINS_CHANGED');
    sample();
    writePublic(CACHE, uncompressed);
    const generated = pinnedRead(CACHE, { bytes: BYTES, sha256 }); generated.fill(0);
    const receipt = { format: 'LIANUM_ORIGINAL_FULL_PUBLIC_CRS_DERIVATION_V1', startedAt,
      completedAt: new Date().toISOString(), points: POINTS,
      output: { path: '.internal/dev/cache/public-crs/full-v1/bn254_g1_full_uncompressed.dat', bytes: BYTES, sha256 },
      input: before.crs, before, after, backend: { kind: 'WASM', threads: 1,
        maximumPages: MEMORY.standard, destroyed: true },
      officialUncompressedAcceptance: { points: POINTS, inputBytes: BYTES, responseBytes: accepted.pointsBuf.length },
      recompression: { performed: false, reason: 'NO_OFFICIAL_RECOMPRESSION_API' },
      resources: { limits: LIMITS, ...samples }, timings: { backendMilliseconds,
        derivationMilliseconds, acceptanceMilliseconds, totalMilliseconds: performance.now() - started },
      proofGenerated: false, privateInputsAccepted: false, performanceImprovementEstablished: false };
    writePublic(RECEIPT, jsonBytes(receipt));
    return receipt;
  } finally {
    if (poll) clearInterval(poll);
    try { if (api) await api.destroy(); }
    finally {
      compressed?.fill(0); g2?.fill(0); uncompressed?.fill(0);
      globalThis.fetch = originalFetch;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'PUBLIC_CRS_FIXED_ARGUMENTS');
  try {
    const receipt = await deriveOriginalFullPublicCrs();
    process.stdout.write(JSON.stringify({ format: receipt.format, output: receipt.output,
      backendDestroyed: receipt.backend.destroyed, proofGenerated: false }) + '\n');
  } catch (error) {
    process.stderr.write((/^(?:PUBLIC_CRS_|PW_|PC23_)[A-Z0-9_]+/.exec(error.message)?.[0]
      ?? 'PUBLIC_CRS_DERIVATION_FAILED') + '\n'); process.exitCode = 1;
  }
}
