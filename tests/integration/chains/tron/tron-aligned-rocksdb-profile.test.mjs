/** Metadata/source regression only; never starts Java or grants native authority. */
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from '../../../../packages/proofs/src/catalog.mjs';
import { assertTronAlignedRocksDbSourceDelta, assertTronAlignedRocksDbStartupIdentity, assertTronAlignedRocksDbReleaseMetadata, assertTronAlignedRocksDbGate,
  verifyTronAlignedRocksDbCandidateBuild, TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE, TRON_ALIGNED_ROCKSDB_SOURCE_SHA256 } from './tron-aligned-rocksdb-profile.mjs';
import { assertTronAlignedRocksDbLibraryEvidence } from './tron-aligned-rocksdb-native-audit.mjs';
import { runTronAlignedRocksDbCandidateAcceptance } from './tron-candidate-acceptance.mjs';
import { OWNED_TRON_RUNTIME_RELEASE } from '../../../../packages/backend/src/chains/tron/transfers/owned-tron-node-driver.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');

test('two configuration literals invert to the actual original driver bytes; third change is rejected', async () => {
  const original = await readFile(join(ROOT, 'runtime-drivers/owned-tron-native-value/OwnedTronNativeDriver.java'));
  const candidate = await readFile(new URL('./fixtures/aligned-rocksdb-v1/source/OwnedTronNativeDriver.java', import.meta.url));
  assert.equal(sha(original), '02fdfaa75cbf4a8a4785a8db0e166286c4212047e5a0568a84d5e7fd5f28694f');
  assert.equal(sha(candidate), TRON_ALIGNED_ROCKSDB_SOURCE_SHA256);
  assertTronAlignedRocksDbSourceDelta(original, candidate);
  const thirdChange = Buffer.from(candidate.toString().replace('now-preparedAt<30000L', 'now-preparedAt<60000L'));
  assert.notDeepEqual(thirdChange, candidate);
  assert.throws(() => assertTronAlignedRocksDbSourceDelta(original, thirdChange), /ONLY_TWO_SOURCE_DELTAS/);
  assert.throws(() => assertTronAlignedRocksDbSourceDelta(original, original));
  assert.throws(() => assertTronAlignedRocksDbSourceDelta(original, Buffer.from(candidate.toString().replace('1749999999000', '1749999998000'))));
  assert.equal(1750000000000n % 3000n, 1000n); assert.equal(1749999999000n % 3000n, 0n);
});

test('candidate gate is source-owned and rejects all caller options before any inventory or runtime work', async () => {
  assert.equal(OWNED_TRON_RUNTIME_RELEASE, null);
  for (const args of [['--endpoint=http://caller'], ['--run'], [null], [{ classSHA256: 'f'.repeat(64) }]])
    assert.throws(() => assertTronAlignedRocksDbGate(args), /NO_CALLER_OPTIONS/);
  if (TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE === null) {
    assert.throws(() => assertTronAlignedRocksDbGate([]), /NEW_CANDIDATE_REVIEW_REQUIRED/);
    await assert.rejects(runTronAlignedRocksDbCandidateAcceptance(), /NEW_CANDIDATE_REVIEW_REQUIRED/);
  }
  await assert.rejects(runTronAlignedRocksDbCandidateAcceptance({ fixture: true }), /NO_RUN_OPTIONS/);
  await assert.rejects(verifyTronAlignedRocksDbCandidateBuild({ classSHA256: 'f'.repeat(64) }), /NO_BUILD_OPTIONS/);
  assert.equal(OWNED_TRON_RUNTIME_RELEASE, null);
  const owner = { pid: 123, parent: 1, start: '100', group: 123, session: 123, uid: process.getuid(), uids: Array(4).fill(process.getuid()), state: 'S', executable: '/node' };
  const birth = { ...owner, pid: 124, parent: 123, start: '101', executable: '/usr/bin/python3.12' };
  assertTronAlignedRocksDbStartupIdentity(owner, birth, { ...birth }); // Metadata only, no ChildProcess is enrolled.
  assert.throws(() => assertTronAlignedRocksDbStartupIdentity(owner, null, birth));
  for (const mutate of [v => v.start = '102', v => v.uids[1] += 1, v => v.group += 1, v => v.session += 1, v => v.parent += 1, v => v.executable = '/jdk8/bin/java']) {
    const changed = structuredClone(birth); mutate(changed);
    assert.throws(() => assertTronAlignedRocksDbStartupIdentity(owner, birth, changed));
  }
  // Run the real private startup body with synthetic ChildProcess IO. This
  // regression proves catch/closure reachability, never a native authority.
  const text = await readFile(join(ROOT,'wallet-platform/modules/chain-adapters/guarded/tron-aligned-child-opener-v1.mjs'), 'utf8');
  const body = text.slice(text.indexOf('async function startAlignedChild('), text.indexOf('export async function startOwnedTronAlignedCandidateChildV1('));
  for (const mode of ['capture-null', 'capture-throws', 'capture-throws-close-uncertain']) {
    const child = new EventEmitter(), written = [], profile = {}, files = [];
    child.pid = 2147483647; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { write: value => written.push(value), end: () => { if (mode !== 'capture-throws-close-uncertain') { child.emit('exit', 125, null); child.emit('close', 125, null); } }, destroy() {} };
    child.kill = () => { throw Error('UNKNOWN_PID_MUST_NEVER_BE_SIGNALLED'); };
    const environment = { assert, Buffer, process, Promise, AbortSignal, join,
      spawn: () => child, CANDIDATE: profile, PRODUCT: Object.freeze({}), assertOwnedTronPrivateDirectory: async () => {},
      proc: async () => null,
      alignedProc: async pid => { if (pid === process.pid) return owner; if (mode.startsWith('capture-throws')) throw Error('SYNTHETIC_CAPTURE_FAILURE'); return null; },
      assertTronAlignedRocksDbStartupIdentity,
      createTronPrivateLogCapture: () => ({ append: () => false, snapshot: () => ({ bytes: Buffer.alloc(0), metadata: { syntheticHostPrefix: true } }) }),
      bindTronCandidateChildCancellation: () => () => {},
      clearInterval() {}, clearTimeout() {}, setInterval: () => { throw Error('POLL_BEFORE_AUTHENTICATED_BIRTH'); },
      grace: async promise => mode === 'capture-throws-close-uncertain' ? undefined : promise,
      safeCode: () => 'TRON_ALIGNED_UNAUTHENTICATED_STARTUP_CLOSE_UNKNOWN', privateWrite: async (path, value) => files.push({ path, value }) };
    const actualStart = vm.runInNewContext('(' + body.trim() + ')', environment);
    let rejected;
    try { await actualStart('/synthetic-scratch', '/synthetic-audit', new AbortController().signal, profile); }
    catch (error) { rejected = error; }
    assert.ok(rejected, mode);
    if (mode === 'capture-throws-close-uncertain') {
      assert.equal(rejected.message, 'SYNTHETIC_CAPTURE_FAILURE'); assert.equal(rejected.childCleanup.stopped, false);
      assert.equal(rejected.childCleanupErrorCode, 'TRON_ALIGNED_UNAUTHENTICATED_STARTUP_CLOSE_UNKNOWN');
      assert.deepEqual(written, []); continue;
    }
    assert.equal(rejected.childCleanup.stopped, true);
    assert.equal(rejected.childCleanup.startupAuthenticated, false); assert.equal(rejected.childCleanup.exitCode, 125);
    assert.equal(rejected.childCleanup.closeObserved, true); assert.equal(rejected.childCleanup.forced, false);
    assert.deepEqual(written, []); assert.equal(files.length, 2); // No G, original command, or numeric signal.
  }

});

test('metadata cannot substitute an old release, source, malformed pin or extra path for the fixed new candidate', () => {
  const fixture = { format: 'REVIEWED_LOCAL_TRON_ALIGNED_ROCKSDB_CANDIDATE_V1', sourceSHA256: TRON_ALIGNED_ROCKSDB_SOURCE_SHA256,
    buildReportSHA256: 'a'.repeat(64), classSHA256: 'b'.repeat(64), innerClassSHA256: 'c'.repeat(64) };
  assertTronAlignedRocksDbReleaseMetadata(fixture); // Synthetic data; never installs this in the module gate.
  for (const mutate of [v => v.format = 'LIANUM_TRON_BINARY_CANDIDATE_ACCEPTANCE_V1', v => v.sourceSHA256 = 'f'.repeat(64),
    v => v.classSHA256 = 'caller-pin', v => v.innerClassSHA256 = null, v => v.outputDirectory = '/tmp/caller']) {
    const value = structuredClone(fixture); mutate(value); assert.throws(() => assertTronAlignedRocksDbReleaseMetadata(value));
  }
  assert.throws(() => assertTronAlignedRocksDbReleaseMetadata(null));
  assert.throws(() => assertTronAlignedRocksDbReleaseMetadata(fixture, { override: true }));
});

test('a loaded JNI inventory requires the original RocksDB bytes and own scratch, not a jar entry or LevelDB', () => {
  const fixture = [{ kind: 'ROCKSDB', sha256: 'a0be18d4ba46f4e68ea762050b68c9958e208599c1480040526cc37400fb01af',
    bytes: 8412693, path: '/synthetic-own-scratch/jni-tmp/librocksdbjni-synthetic.so', ownedPrivateScratch: true, mappedByOriginalJavaChild: true }];
  assertTronAlignedRocksDbLibraryEvidence(fixture); // Classification fixture; no /proc evidence is manufactured.
  for (const mutate of [v => v[0].sha256 = 'f'.repeat(64), v => v[0].bytes = 1, v => v[0].ownedPrivateScratch = false,
    v => v[0].mappedByOriginalJavaChild = false, v => v[0].kind = 'LEVELDB', v => v.push({ ...v[0], kind: 'LEVELDB' })]) {
    const value = structuredClone(fixture); mutate(value); assert.throws(() => assertTronAlignedRocksDbLibraryEvidence(value));
  }
  assert.throws(() => assertTronAlignedRocksDbLibraryEvidence([]));
});
