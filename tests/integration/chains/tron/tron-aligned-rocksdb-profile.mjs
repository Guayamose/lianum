/** New local candidate only. No canonical release or signing authority is issued. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../../../../packages/engine/src/chains/shared/runtime-harness.mjs';
import { ROOT } from '../../../../packages/proofs/src/catalog.mjs';
import { OWNED_TRON_RUNTIME_RELEASE } from '../../../../packages/backend/src/chains/tron/transfers/owned-tron-node-driver.mjs';

export const TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE = null;
if (TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE !== null) Object.freeze(TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE);
export const TRON_ALIGNED_ROCKSDB_SOURCE_SHA256 = 'd2f53f3def9995e159587a8c5227a0f8149bf46c0dd673801975f0a9037dffa0';
const ORIGINAL_SOURCE_SHA256 = '02fdfaa75cbf4a8a4785a8db0e166286c4212047e5a0568a84d5e7fd5f28694f';
const RUNTIME = join(projectRoot, '.local/owned-tron-native-value-v1');
const DESTINATION = join(RUNTIME, 'reviewed-aligned-rocksdb-v1');
const FIXTURE = fileURLToPath(new URL('./fixtures/aligned-rocksdb-v1/', import.meta.url));
const NAMES = ['OwnedTronNativeDriver$OwnedShutdown.class', 'OwnedTronNativeDriver.class'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function assertTronAlignedRocksDbReleaseMetadata(value) {
  assert.equal(arguments.length, 1, 'TRON_ALIGNED_RELEASE_METADATA_ARITY');
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'TRON_ALIGNED_NEW_CANDIDATE_REVIEW_REQUIRED');
  assert.deepEqual(Object.keys(value).sort(), ['buildReportSHA256', 'classSHA256', 'format', 'innerClassSHA256', 'sourceSHA256']);
  assert.equal(value.format, 'REVIEWED_LOCAL_TRON_ALIGNED_ROCKSDB_CANDIDATE_V1');
  assert.equal(value.sourceSHA256, TRON_ALIGNED_ROCKSDB_SOURCE_SHA256);
  for (const name of ['buildReportSHA256', 'classSHA256', 'innerClassSHA256']) assert.match(value[name], /^[0-9a-f]{64}$/);
  return true; // Data validation only; the fixed loader always reads its own source literal.
}
export function assertTronAlignedRocksDbGate(args) {
  assert.equal(arguments.length, 1, 'TRON_ALIGNED_GATE_ARITY');
  assert.deepEqual(args, [], 'TRON_ALIGNED_NO_CALLER_OPTIONS');
  assert.equal(OWNED_TRON_RUNTIME_RELEASE, null, 'TRON_ALIGNED_CANONICAL_GATE_UNCHANGED');
  assertTronAlignedRocksDbReleaseMetadata(TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE);
}
export function assertTronAlignedRocksDbStartupIdentity(owner, first, second) {
  assert.equal(arguments.length, 3, 'TRON_ALIGNED_STARTUP_IDENTITY_ARITY');
  assert.ok(owner && first && second, 'TRON_ALIGNED_ORIGINAL_BIRTH_REQUIRED');
  for (const row of [owner, first, second]) {
    assert.ok(Number.isSafeInteger(row.pid) && row.pid > 1);
    assert.equal(row.uid, process.getuid()); assert.deepEqual(row.uids, Array(4).fill(process.getuid()));
    assert.match(row.start, /^[0-9]+$/); assert.ok(!['Z', 'X'].includes(row.state));
  }
  for (const key of ['pid', 'parent', 'start', 'group', 'session', 'uid', 'executable'])
    assert.equal(first[key], second[key], 'TRON_ALIGNED_STARTUP_IDENTITY_CHANGED');
  assert.equal(first.parent, owner.pid); assert.equal(first.group, owner.group); assert.equal(first.session, owner.session);
  assert.match(first.executable, /^\/usr\/bin\/python3(?:\.[0-9]+)?$/, 'TRON_ALIGNED_STARTUP_MUST_BE_ORIGINAL_PYTHON');
  return true; // Metadata only; the private harness additionally owns the actual ChildProcess.
}

async function regular(path) {
  assert.equal(await realpath(path), path, 'TRON_ALIGNED_NO_SYMLINK');
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink(), 'TRON_ALIGNED_REGULAR_FILE');
  return readFile(path);
}
export function assertTronAlignedRocksDbSourceDelta(original, candidate) {
  assert.equal(arguments.length, 2);
  assert.ok(Buffer.isBuffer(original) && Buffer.isBuffer(candidate));
  const oldEngine = 'db.engine=\\"LEVELDB\\"', newEngine = 'db.engine=\\"ROCKSDB\\"';
  const oldTime = 'timestamp=\\"1750000000000\\"', newTime = 'timestamp=\\"1749999999000\\"';
  const before = original.toString('utf8'), after = candidate.toString('utf8');
  for (const value of [oldEngine, oldTime]) assert.equal(before.split(value).length - 1, 1, 'TRON_ALIGNED_OLD_LITERAL_ONCE');
  for (const value of [newEngine, newTime]) assert.equal(after.split(value).length - 1, 1, 'TRON_ALIGNED_NEW_LITERAL_ONCE');
  assert.ok(!before.includes(newEngine) && !before.includes(newTime) && !after.includes(oldEngine) && !after.includes(oldTime));
  assert.deepEqual(Buffer.from(after.replace(newEngine, oldEngine).replace(newTime, oldTime)), original, 'TRON_ALIGNED_ONLY_TWO_SOURCE_DELTAS');
}
export async function verifyTronAlignedRocksDbCandidateBuild() {
  assert.equal(arguments.length, 0, 'TRON_ALIGNED_NO_BUILD_OPTIONS');
  assertTronAlignedRocksDbGate([]);
  assert.equal(await realpath(DESTINATION), DESTINATION);
  const directory = await lstat(DESTINATION);
  assert.ok(directory.isDirectory() && directory.uid === process.getuid() && (directory.mode & 0o7777) === 0o700);
  const candidateSource = await regular(join(FIXTURE, 'source/OwnedTronNativeDriver.java'));
  assert.equal(sha(candidateSource), TRON_ALIGNED_ROCKSDB_SOURCE_SHA256);
  const originalSource = await regular(join(ROOT, 'runtime-drivers/owned-tron-native-value/OwnedTronNativeDriver.java'));
  assert.equal(sha(originalSource), ORIGINAL_SOURCE_SHA256);
  assertTronAlignedRocksDbSourceDelta(originalSource, candidateSource);
  const buildBytes = await regular(join(DESTINATION, 'build-report.json'));
  const release = TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE;
  assert.equal(sha(buildBytes), release.buildReportSHA256, 'TRON_ALIGNED_REVIEWED_BUILD_REPORT_PIN');
  const build = JSON.parse(buildBytes);
  assert.equal(build.schema, 'LIANUM_TRON_ALIGNED_ROCKSDB_BUILD_V1');
  assert.equal(build.success, true); assert.equal(build.canonicalRuntimeRelease, null); assert.equal(build.candidateRuntimeRelease, null);
  assert.equal(build.nativeNodesStarted, false); assert.equal(build.keysOrWitnessesCreated, false); assert.equal(build.historicalReportsRecreated, false);
  assert.deepEqual(build.delta, { storageEngine: 'ROCKSDB', genesisTimestampMs: '1749999999000', sourceLiteralChanges: 2 });
  assert.deepEqual(build.limits, { compilerHeapBytes: 268435456, compilerRSSBytes: 402653184, deadlineSeconds: 60, logBytes: 1048576 });
  assert.equal(build.inputs.sourceSHA256, sha(candidateSource)); assert.equal(build.inputs.originalSourceSHA256, ORIGINAL_SOURCE_SHA256);
  assert.equal(build.inputs.jdkEntries, 407); assert.equal(build.inputs.originalClasses.length, 7);
  assert.equal(build.inputs.builderSHA256, sha(await regular(join(FIXTURE, 'build.py'))));
  assert.equal(build.inputs.launcherSHA256, sha(await regular(join(FIXTURE, 'launch.py'))));
  assert.equal(build.inputs.compilerChildSHA256, sha(await regular(join(FIXTURE, 'compile-child.py'))));
  assert.equal(build.inputs.ownedProcessHelperSHA256, sha(await regular(join(resolve(ROOT, '../../../..'), 'scripts/development/ledger_owned_processes.py'))));
  assert.deepEqual(build.cleanup, { ownedCompilerStopped: true, originalInputsUnmodified: true, interrupted: false });
  assert.ok(Number.isFinite(build.compiler.milliseconds) && build.compiler.milliseconds > 0 && build.compiler.milliseconds < 60000);
  assert.equal(build.compiler.exitCode, 0); assert.equal(build.compiler.ownedChildStopped, true); assert.equal(build.compiler.forced, false);
  for (const key of ['spawnAttempted', 'popenCreated', 'spawnReturned', 'startupGranted', 'compilerExecutableObserved']) assert.equal(build.compiler[key], true);
  assert.equal(build.compiler.logTruncated, false); assert.equal(build.compiler.logBytes, build.compiler.logObservedBytes);
  assert.equal(build.compiler.cleanupBudgetMilliseconds, 10000);
  const inventory = build.compiler.processInventory;
  assert.equal(inventory.unsafeIdentityObserved, false); assert.equal(inventory.subreaperEnabled, false);
  assert.deepEqual(inventory.unknown, []); assert.equal(inventory.retained.length, 1);
  const retained = inventory.retained[0];
  const reader = build.compiler.startupReaderAcknowledged;
  assert.equal(reader.format, 'LIANUM_TRON_COMPILER_STARTUP_READER_V1');
  for (const key of ['pid', 'ppid', 'pgrp', 'session', 'startTimeTicks', 'uid', 'uids'])
    assert.deepEqual(reader.identity[key], retained.original[key]);
  for (const key of ['descriptor', 'fifoDevice', 'fifoInode']) assert.ok(Number.isSafeInteger(reader[key]) && reader[key] > 0);
  assert.equal(build.compiler.cleanupErrors.length, 0);
  assert.equal(retained.gone, true); assert.equal(retained.origin, 'ORIGINAL_POPEN_PREEXEC_PIPE');
  assert.deepEqual(retained.original.uids, [process.getuid(), process.getuid(), process.getuid(), process.getuid()]);
  assert.equal(retained.original.uid, process.getuid());
  assert.equal(retained.original.pid, retained.original.pgrp); assert.equal(retained.original.pid, retained.original.session);
  assert.equal(retained.original.ppid, inventory.ownerIdentity.pid);
  assert.deepEqual(retained.original, build.compiler.identity);
  assert.equal(inventory.events.filter(row => row.kind === 'subreaper-restored').length, 1);
  assert.equal(inventory.events.some(row => row.kind === 'signal'), false);
  assert.ok(Number.isSafeInteger(build.compiler.peakRSS) && build.compiler.peakRSS > 0 && build.compiler.peakRSS <= build.limits.compilerRSSBytes);
  assert.deepEqual(build.compiler.signalsSent, []); assert.ok(Array.isArray(build.compiler.samples) && build.compiler.samples.length > 0);
  for (const row of build.compiler.samples) assert.ok(Number.isSafeInteger(row.rss) && row.rss >= 0 && row.rss <= build.limits.compilerRSSBytes);
  const actual = (await readdir(join(DESTINATION, 'classes'))).sort(); assert.deepEqual(actual, NAMES);
  assert.deepEqual(build.outputs.map(row => row.path).sort(), NAMES);
  for (const row of build.outputs) {
    const data = await regular(join(DESTINATION, 'classes', row.path));
    assert.equal(data.length, row.bytes); assert.equal(sha(data), row.sha256); assert.equal(data.readUInt16BE(6), row.classMajor);
    assert.equal(row.classMajor, 52); assert.equal(sha(data), row.path === NAMES[1] ? release.classSHA256 : release.innerClassSHA256);
  }
  const launcherBytes = await regular(join(FIXTURE, 'launch.py'));
  assert.equal(sha(launcherBytes), build.inputs.launcherSHA256);
  return { classification: 'REVIEWED_NEW_ALIGNED_GENESIS_ROCKSDB_CANDIDATE_NOT_CANONICAL_RELEASE',
    namespace: 'reviewed-aligned-rocksdb-v1', sourceSHA256: sha(candidateSource), buildReportSHA256: sha(buildBytes),
    classSHA256: release.classSHA256, innerClassSHA256: release.innerClassSHA256, launcherSHA256: sha(launcherBytes),
    storageEngine: 'ROCKSDB', genesisTimestampMs: '1749999999000', sourceLiteralChanges: 2,
    javaTmpDirectoryIsOwnedScratch: true, nativeAcceptanceEstablished: false };
}
