/** Reviewed binary candidate acceptance only. Canonical runtime/graph/credit
 * gates remain closed. Importing starts no process; exact opt-in creates one
 * fresh private Java-Tron fixture with a child-only socket syscall guard. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, lstat, realpath, readlink, mkdir, mkdtemp, writeFile, rm, statfs, open, unlink } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { beginTronCandidateLifetime, bindTronCandidateChildCancellation } from './tron-candidate-lifetime.mjs';
import { createTronPrivateLogCapture } from './tron-candidate-log-capture.mjs';
import { captureTronCandidateDiskLogs } from './tron-candidate-disk-log-capture.mjs';
import { ROOT, FLAT, GOLDEN } from '@lianum/proofs/catalog';
import { projectRoot } from '@lianum/engine/chains/shared/runtime-harness';
import { PRIVATE_RESOURCE_FLOORS } from '@lianum/engine/crypto/private-resource-policy';
import { prepareOwnedTronNative, assertPreparationCurrent, bindOwnedTronSigned, PROFILE }
  from '../../../../packages/backend/src/chains/tron/transfers/owned-tron-native-value-profile.mjs';
import { decodeTronNativeTransferWire } from '../../../../packages/backend/src/chains/tron/transfers/tron-native-transfer-wire.mjs';
import { createTronNativeTransferObserver } from '@lianum/backend/transfers/tron';
import { OWNED_TRON_RUNTIME_RELEASE, TRON_UPSTREAM }
  from '../../../../packages/backend/src/chains/tron/transfers/owned-tron-node-driver.mjs';

import { assertTronAlignedRocksDbGate, assertTronAlignedRocksDbStartupIdentity, verifyTronAlignedRocksDbCandidateBuild } from './tron-aligned-rocksdb-profile.mjs';
import { captureTronAlignedRocksDbNativeAudit } from './tron-aligned-rocksdb-native-audit.mjs';
import { startOwnedTronAlignedCandidateChildV1 } from '../../../../packages/backend/src/chains/tron/runtime/guarded/tron-aligned-child-opener-v1.mjs';
import { startFixedOwnedTronDriver } from '../../../../packages/backend/src/chains/tron/transfers/owned-tron-node-driver.mjs';
import { assertOwnedTronProductReleaseV1 } from '../../../../packages/backend/src/chains/tron/runtime/guarded/tron-product-release-v1.mjs';

export const TRON_CANDIDATE_OPT_IN = '--run-reviewed-local-candidate';
export const TRON_CANDIDATE_ACCEPTANCE_ENABLED = true;
const HERE = fileURLToPath(import.meta.url), FIXTURES = new URL('./fixtures/', import.meta.url);
const RUNTIME = join(projectRoot, '.local/owned-tron-native-value-v1');
const ACCEPTANCE = join(RUNTIME, 'candidate-acceptance');
const ORIGINAL_CANDIDATE_PROFILE = Object.freeze({ name: 'original-offline-agree-zero', acceptance: ACCEPTANCE,
  helper: fileURLToPath(new URL('tron-candidate-seccomp.py', FIXTURES)), aligned: false });
const ALIGNED_ROCKSDB_PROFILE = Object.freeze({ name: 'aligned-rocksdb-v1', acceptance: join(RUNTIME, 'aligned-rocksdb-candidate-acceptance'),
  helper: fileURLToPath(new URL('aligned-rocksdb-v1/launch.py', FIXTURES)), aligned: true });
const PRODUCT_ORIGINAL_PROFILE = Object.freeze({ name:'guarded-product-original-v1', acceptance:join(RUNTIME,'product-original-acceptance-v1'), aligned:true });
function assertPrivateCandidateProfile(profile) {
  assert.ok(profile === ORIGINAL_CANDIDATE_PROFILE || profile === ALIGNED_ROCKSDB_PROFILE || profile === PRODUCT_ORIGINAL_PROFILE, 'TRON_CANDIDATE_FIXED_PRIVATE_PROFILE');
}
function assertCandidateProfileGate(profile) {
  assertPrivateCandidateProfile(profile);
  if (profile === PRODUCT_ORIGINAL_PROFILE) { assert.deepEqual(process.argv.slice(2),[],'TRON_PRODUCT_NO_ACCEPTANCE_OPTIONS');assertOwnedTronProductReleaseV1(); }
  else if (profile === ALIGNED_ROCKSDB_PROFILE) assertTronAlignedRocksDbGate(process.argv.slice(2));
  else assertTronCandidateGate(process.argv.slice(2));
}
async function candidateInventory(profile) {
  assertPrivateCandidateProfile(profile);
  const original = await verifyTronCandidateInventory();
  return profile.aligned === true ? { ...original, newCandidate: await verifyTronAlignedRocksDbCandidateBuild() } : original;
}

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const safeCode = error => String(error?.message ?? '').match(/\bTRON_(?:CANDIDATE|ALIGNED|PRODUCT)_[A-Z0-9_]+\b/)?.[0] ?? 'TRON_CANDIDATE_ASSERTION_OR_IO_FAILED';
const provenancePins = Object.freeze({
  'candidate-artifacts-v3.json': '48aecfcb7ba0f8bdc53029a1ce9c496d15c6aab9ae8b7290ced13131b3fb7975',
  'jdk-acquisition.json': '0e2404b5ab76d082f5e29f6cb6f584c21230090b290c0d43da832f4f7239b115',
});
const absent = error => ['ENOENT', 'ESRCH'].includes(error.code);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function grace(exited, milliseconds) {
  let timer;
  try { await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, milliseconds); })]); }
  finally { clearTimeout(timer); }
}
export function assertTronCandidateGate(args) {
  assert.equal(TRON_CANDIDATE_ACCEPTANCE_ENABLED, true, 'TRON_CANDIDATE_SOURCE_REVIEW_REQUIRED');
  assert.deepEqual(args, [TRON_CANDIDATE_OPT_IN], 'TRON_CANDIDATE_EXACT_OPT_IN_REQUIRED');
  assert.equal(OWNED_TRON_RUNTIME_RELEASE, null, 'TRON_CANDIDATE_CANONICAL_GATE_UNCHANGED');
}
async function regular(path) {
  assert.equal(await realpath(path), path, 'TRON_CANDIDATE_NO_SYMLINK'); const stat = await lstat(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'TRON_CANDIDATE_REGULAR_FILE'); return readFile(path);
}
async function provenance() {
  const records = {};
  for (const [name, pin] of Object.entries(provenancePins)) {
    const bytes = await regular(fileURLToPath(new URL(name, FIXTURES)));
    assert.equal(sha(bytes), pin, 'TRON_CANDIDATE_ORIGINAL_PROVENANCE_PIN'); records[name] = JSON.parse(bytes);
  }
  const candidate = records['candidate-artifacts-v3.json'], jdk = records['jdk-acquisition.json'];
  assert.equal(candidate.runtimeRelease, null); assert.equal(candidate.nativeNodeExecuted, false);
  assert.equal(candidate.officialUpstreamCommit, TRON_UPSTREAM.commit); assert.equal(candidate.fullGradleRebuild, false);
  assert.equal(candidate.jdkArchiveSHA256, jdk.archiveSHA256);
  return { candidate, jdk };
}
export async function verifyTronCandidateInventory() {
  assert.equal(arguments.length, 0, 'TRON_CANDIDATE_NO_INVENTORY_OPTIONS');
  const { candidate, jdk } = await provenance(); assert.equal(await realpath(RUNTIME), RUNTIME);
  const expected = new Set();
  for (const row of jdk.inventory) {
    assert.ok(row.path.startsWith('jdk8u504-b01/') && !row.path.split('/').includes('..'));
    const name = row.path.slice('jdk8u504-b01/'.length), path = join(RUNTIME, 'jdk8', name); expected.add(name);
    const stat = await lstat(path);
    if (row.kind === 'symlink') {
      assert.ok(stat.isSymbolicLink()); assert.equal(await readlink(path), row.target);
      const target = await realpath(path); assert.ok(target.startsWith(join(RUNTIME, 'jdk8') + '/'));
    } else {
      assert.equal(row.kind, 'file'); const bytes = await regular(path); assert.equal(bytes.length, row.bytes);
      assert.equal(sha(bytes), row.sha256, 'TRON_CANDIDATE_JDK_PIN');
      assert.equal(stat.mode & 0o7777, Number.parseInt(row.mode.slice(2), 8), 'TRON_CANDIDATE_JDK_MODE');
    }
  }
  async function files(directory, prefix = '') {
    const rows = [];
    for (const name of await readdir(directory)) {
      const path = join(directory, name), stat = await lstat(path), rel = prefix + name;
      if (stat.isDirectory() && !stat.isSymbolicLink()) rows.push(...await files(path, rel + '/'));
      else { assert.ok(stat.isFile() || stat.isSymbolicLink()); rows.push(rel); }
    }
    return rows;
  }
  assert.deepEqual((await files(join(RUNTIME, 'jdk8'))).sort(), [...expected].sort(), 'TRON_CANDIDATE_COMPLETE_JDK_CLOSURE');
  const classes = candidate.compiledClasses;
  assert.deepEqual((await readdir(join(RUNTIME, 'driver'))).sort(), classes.map(row => row.path.split('/').at(-1)).sort());
  for (const row of classes) {
    const bytes = await regular(join(RUNTIME, 'driver', row.path.split('/').at(-1)));
    assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256, 'TRON_CANDIDATE_COMPLETE_CLASS_CLOSURE');
    assert.equal(bytes.readUInt16BE(6), row.classMajor); assert.equal(row.classMajor, 52);
  }
  assert.equal(sha(await regular(join(RUNTIME, 'FullNode-offline.jar'))), candidate.actualArtifacts.jarSHA256);
  assert.equal(sha(await regular(join(RUNTIME, 'jdk8/bin/java'))), candidate.actualArtifacts.javaSHA256);
  assert.equal(sha(await regular(join(ROOT, 'runtime-drivers/owned-tron-native-value/OwnedTronNativeDriver.java'))), candidate.driverSourceSHA256);
  const reviewed = join(RUNTIME, 'reviewed-offline-agree-zero-v1');
  const argsClass = await regular(join(reviewed, 'classes/org/tron/core/config/args/Args.class'));
  assert.equal(sha(argsClass), 'ce82095ff403f837ee02b243ab05e5ad3886b1124f2bbb3e1bf0e8165b310a70', 'TRON_CANDIDATE_REVIEWED_OFFLINE_ARGS_CLASS');
  assert.equal(sha(await regular(fileURLToPath(new URL('offline-agree-zero/source/org/tron/core/config/args/Args.java', FIXTURES)))),
    '7896412e8aa21a80331f66606f25414a589c5127e355a0289d422c72405e280d', 'TRON_CANDIDATE_REVIEWED_OFFLINE_ARGS_SOURCE');
  const buildBytes = await regular(join(reviewed, 'build-report.json')), build = JSON.parse(buildBytes);
  assert.equal(build.schema, 'LIANUM_TRON_OFFLINE_AGREE_ZERO_BUILD_V1'); assert.equal(build.success, true);
  assert.equal(build.classSHA256, sha(argsClass)); assert.equal(build.canonicalRuntimeRelease, null);
  assert.equal(build.nativeNodesStarted, false); assert.equal(build.keysOrWitnessesCreated, false);
  assert.equal(build.cleanup.ownedCompilerAndDiagnosticChildrenStopped, true); assert.equal(build.cleanup.originalCandidateUnmodified, true);
  assert.deepEqual(build.reviewedConfiguration, { ...build.originalConfiguration, agreeNodeCount: 0 });
  assert.equal(build.originalConfiguration.agreeNodeCount, 19); assert.equal(build.reviewedConfiguration.p2pDisable, true);
  assert.equal(build.inputs.sourceSHA256['source/org/tron/core/config/args/Args.java'], '7896412e8aa21a80331f66606f25414a589c5127e355a0289d422c72405e280d');
  return { classification: 'VERIFIED_ORIGINAL_CANDIDATE_WITH_REVIEWED_OFFLINE_ARGS_NOT_CANONICAL_RELEASE',
    reviewedArgsClassSHA256: sha(argsClass), reviewedArgsSourceSHA256: build.inputs.sourceSHA256['source/org/tron/core/config/args/Args.java'],
    reviewedArgsBuildReportSHA256: sha(buildBytes),
    jdkEntries: jdk.inventory.length, classes: classes.length, upstreamCommit: candidate.officialUpstreamCommit,
    javaSHA256: candidate.actualArtifacts.javaSHA256, jarSHA256: candidate.actualArtifacts.jarSHA256,
    driverSHA256: candidate.actualArtifacts.driverSHA256, driverSourceSHA256: candidate.driverSourceSHA256,
    originalProvenanceSHA256: provenancePins, fullGradleRebuild: false, originalDuplicateJarNames: true };
}
async function privateWrite(path, value) {
  await writeFile(path, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value), { mode: 0o600, flag: 'wx' });
}
async function hostResources() {
  const available = /^MemAvailable:\s+([0-9]+) kB$/m.exec(await readFile('/proc/meminfo', 'utf8'));
  assert.ok(available, 'TRON_CANDIDATE_MEMAVAILABLE_UNREADABLE'); const disk = await statfs(projectRoot, { bigint: true });
  const sample = { availableRAM: Number(available[1]) * 1024, freeDisk: Number(disk.bavail * disk.bsize) };
  assert.ok(sample.availableRAM >= PRIVATE_RESOURCE_FLOORS.availableRAM, 'TRON_CANDIDATE_MEMAVAILABLE_FLOOR');
  assert.ok(sample.freeDisk >= PRIVATE_RESOURCE_FLOORS.freeDisk, 'TRON_CANDIDATE_DISK_FLOOR'); return sample;
}
/** Data-only host classification. It issues no runtime capability. The fixed
 * acceptance obtains both snapshots directly from /proc under the same UID. */
export function isKnownIdleGradleDaemon(first, second) {
  if (!first || !second || !Array.isArray(first.args) || !Array.isArray(second.args)
    || !Array.isArray(first.threadTicks) || !Array.isArray(second.threadTicks) || first.state !== 'S' || second.state !== 'S'
    || first.pid !== second.pid || first.start !== second.start || first.parent !== second.parent
    || first.executable !== '/usr/lib/jvm/java-21-openjdk-amd64/bin/java'
    || second.executable !== first.executable || first.cwd !== second.cwd
    || first.args.at(-2) !== 'org.gradle.launcher.daemon.bootstrap.GradleDaemon') return false;
  const version = first.args.at(-1);
  if (!/^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(version)
    || first.cwd !== join(homedir(), '.gradle/daemon', version)
    || first.args[0] !== first.executable || JSON.stringify(first.args) !== JSON.stringify(second.args)
    || !first.threadTicks.length || JSON.stringify(first.threadTicks) !== JSON.stringify(second.threadTicks)) return false;
  return true;
}
async function gradleSnapshot(pid) {
  const row = await proc(pid); if (!row) return null;
  const executable = await readlink('/proc/' + pid + '/exe'), cwd = await readlink('/proc/' + pid + '/cwd');
  const args = (await readFile('/proc/' + pid + '/cmdline')).toString('utf8').split('\0').filter(Boolean);
  const threadTicks = [];
  for (const name of await readdir('/proc/' + pid + '/task')) {
    const text = await readFile('/proc/' + pid + '/task/' + name + '/stat', 'utf8');
    const fields = text.slice(text.lastIndexOf(') ') + 2).split(/\s+/);
    assert.ok(/^[0-9]+$/.test(name) && /^[0-9]+$/.test(fields[11]) && /^[0-9]+$/.test(fields[12]), 'TRON_CANDIDATE_GRADLE_STAT');
    if (fields[0] !== 'S') return null;
    threadTicks.push([name, fields[11], fields[12]]);
  }
  threadTicks.sort((a,b) => Number(a[0]) - Number(b[0]));
  const after = await proc(pid);
  assert.ok(after?.start === row.start && after.parent === row.parent, 'TRON_CANDIDATE_GRADLE_IDENTITY_CHANGED');
  return { ...row, executable, cwd, args, threadTicks };
}
async function noHeavyWork() {
  for (const path of ['/tmp/lianum-paeg-proof-host.lock', join(ROOT, '.local/proof-workers/active.lock'),
    join(ROOT, '.local/proof-workers-native-ingress-v3/active.lock')]) {
    try { await lstat(path); throw Error('TRON_CANDIDATE_PROOF_HOST_BUSY'); } catch (error) { if (!absent(error)) throw error; }
  }
  for (const name of await readdir('/proc')) {
    if (!/^[1-9][0-9]*$/.test(name)) continue;
    try {
      if ((await lstat('/proc/' + name)).uid !== process.getuid()) continue;
      const text = await readFile('/proc/' + name + '/stat', 'utf8'), end = text.lastIndexOf(') ');
      assert.ok(end > text.indexOf('('), 'TRON_CANDIDATE_PROCESS_STAT'); const comm = text.slice(text.indexOf('(') + 1, end);
      if (comm === 'node') {
        const args = (await readFile('/proc/' + name + '/cmdline')).toString('utf8').split('\0').filter(Boolean);
        const fixedWorkers = [join(ROOT, 'proof-workers/worker.mjs'), join(ROOT, 'proof-workers/native-claims-build-worker.mjs'),
          join(ROOT, 'proof-workers/native-ingress-v3-worker.mjs'), join(GOLDEN, 'src/paeg/proof-worker.mjs')];
        for (const argument of args.slice(1)) {
          if (argument.startsWith('-')) continue;
          assert.equal(fixedWorkers.includes(resolve(await readlink('/proc/' + name + '/cwd'), argument)), false,
            'TRON_CANDIDATE_PARALLEL_WASM_PROVER');
        }
      }
      if (comm === 'java') {
        const first = await gradleSnapshot(Number(name));
        if (first && first.executable === '/usr/lib/jvm/java-21-openjdk-amd64/bin/java'
          && first.args.at(-2) === 'org.gradle.launcher.daemon.bootstrap.GradleDaemon') {
          await wait(250);
          const second = await gradleSnapshot(Number(name));
          if (isKnownIdleGradleDaemon(first, second)) continue;
        }
      }
      assert.equal(/^(?:solana-test-val|solana-validato|agave-validator|bitcoind|anvil|bb|nargo|cargo|rustc|rust-lld|ld\.lld|cc1|cc1plus|java)$/.test(comm), false,
        'TRON_CANDIDATE_PARALLEL_HEAVY_WORK');
    } catch (error) { if (!absent(error)) throw error; }
  }
  return hostResources();
}
async function proc(pid) {
  let text; try { text = await readFile('/proc/' + pid + '/stat', 'utf8'); } catch (error) { if (absent(error)) return null; throw error; }
  const end = text.lastIndexOf(') '), fields = text.slice(end + 2).split(/\s+/);
  assert.ok(text.startsWith(pid + ' (') && end > 0 && /^[0-9]+$/.test(fields[19]), 'TRON_CANDIDATE_PROCESS_STAT');
  return { pid, parent: Number(fields[1]), start: fields[19], state: fields[0], rss: Number(fields[21]) * 4096 };
}
async function alignedProc(pid) {
  const first = await proc(pid); if (first === null) return null;
  const base = '/proc/' + pid;
  const text = await readFile(base + '/stat', 'utf8'), fields = text.slice(text.lastIndexOf(') ') + 2).split(/\s+/);
  const status = await readFile(base + '/status', 'utf8');
  const uids = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);
  assert.ok(uids, 'TRON_ALIGNED_STARTUP_UID4_REQUIRED');
  const row = { ...first, group: Number(fields[2]), session: Number(fields[3]),
    uid: (await lstat(base)).uid, uids: uids.slice(1).map(Number), executable: await readlink(base + '/exe') };
  const after = await proc(pid);
  assert.ok(after && after.start === first.start && after.parent === first.parent, 'TRON_ALIGNED_STARTUP_BIRTH_CHANGED');
  assert.equal(fields[19], first.start); assert.equal(Number(fields[1]), first.parent);
  return row;
}

async function sourcePins(profile) {
  assertPrivateCandidateProfile(profile);
  const paths = [HERE,
    fileURLToPath(new URL('./tron-aligned-rocksdb-profile.mjs', import.meta.url)),
    fileURLToPath(new URL('./tron-aligned-rocksdb-native-audit.mjs', import.meta.url)),
    fileURLToPath(new URL('./run-reviewed-aligned-rocksdb-candidate.mjs', import.meta.url)),
    ...(profile===PRODUCT_ORIGINAL_PROFILE?[fileURLToPath(new URL('./run-tron-product-original-acceptance-v1.mjs',import.meta.url))]:[]),
    fileURLToPath(new URL('aligned-rocksdb-v1/launch.py', FIXTURES)),
    fileURLToPath(new URL('aligned-rocksdb-v1/build.py', FIXTURES)),
    fileURLToPath(new URL('aligned-rocksdb-v1/compile-child.py', FIXTURES)),
    join(resolve(ROOT, '../../../..'), 'scripts/development/ledger_owned_processes.py'),
    fileURLToPath(new URL('aligned-rocksdb-v1/source/OwnedTronNativeDriver.java', FIXTURES)), fileURLToPath(new URL('./tron-candidate-lifetime.mjs', import.meta.url)),
    fileURLToPath(new URL('./tron-candidate-log-capture.mjs', import.meta.url)),
    fileURLToPath(new URL('./tron-candidate-disk-log-capture.mjs', import.meta.url)), fileURLToPath(new URL('tron-candidate-seccomp.py', FIXTURES)),
    ...Object.keys(provenancePins).map(name => fileURLToPath(new URL(name, FIXTURES))),
    fileURLToPath(new URL('offline-agree-zero/source/org/tron/core/config/args/Args.java', FIXTURES)),
    join(ROOT, 'runtime-drivers/owned-tron-native-value/OwnedTronNativeDriver.java')];
  if (profile.aligned === true) {
    const visited = new Set();
    async function visit(path) {
      assert.ok([ROOT, FLAT, GOLDEN,resolve(FLAT,'../mobile-protocol')].some(root => path.startsWith(root + '/')) && path.endsWith('.mjs'), 'TRON_ALIGNED_LOCAL_SOURCE_CLOSURE');
      if (visited.has(path)) return; visited.add(path);
      const source = (await regular(path)).toString('utf8');
      const names = new Set();
      for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g)) names.add(match[2]);
      for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm)) names.add(match[2]);
      for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) names.add(match[2]);
      for (const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g)) names.add(match[2]);
      for (const name of names) {
        if (name.startsWith('node:') || ['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/noir_wasm'].includes(name)) continue;
        assert.ok(name.startsWith('.'), 'TRON_ALIGNED_LOCAL_IMPORT_ONLY');
        await visit(resolve(dirname(path), name));
      }
    }
    for (const path of paths.filter(path => path.endsWith('.mjs'))) await visit(path);
    paths.push(...visited);
  }
  return Object.fromEntries(await Promise.all([...new Set(paths)].map(async path => [relative(ROOT, path), sha(await regular(path))])));
}
async function startOriginalChild(directory, audit, signal, profile) {
  if (profile === ALIGNED_ROCKSDB_PROFILE) return startOwnedTronAlignedCandidateChildV1(directory, audit, signal);
  assertPrivateCandidateProfile(profile);
  assert.ok(signal instanceof AbortSignal); if (signal.aborted) throw signal.reason;
  const helper = profile.helper;
  // No inherited socket descriptors; Python closes every FD above stdio before
  // exec. Complete binary/native closure was authenticated before spawning.
  const child = spawn('/usr/bin/python3', [helper, directory], { cwd: directory,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let original;
  let exit, closeReceipt, resolveExit, resolveClose; const closedOriginal = new Promise(resolve => resolveClose = resolve); const exited = new Promise(resolve => resolveExit = resolve);
  child.once('exit', (code, signal) => { exit = { code, signal }; resolveExit(exit); });
  child.once('close', (code, signal) => { closeReceipt = { code, signal }; resolveClose(closeReceipt); });
  let buffer = '', pending, resolveReady, rejectReady, closed = false, failure, closePromise, releaseCancellation;
  const rawStdout = createTronPrivateLogCapture(), stderr = createTronPrivateLogCapture();
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => {}); // Early birth failures retain cleanup without unhandled readiness rejection.
  const fail = error => { failure ??= error; pending?.reject(error); pending = null; rejectReady(error); };
  child.once('error', () => fail(Error('TRON_CANDIDATE_CHILD_EXEC_FAILED')));
  child.once('exit', () => { if (!closed) fail(Error('TRON_CANDIDATE_CHILD_EXITED')); });
  child.stderr.on('data', bytes => { if (stderr.append(bytes)) fail(Error('TRON_CANDIDATE_PRIVATE_LOG_BOUND')); });
  child.stdout.on('data', bytes => {
    if (rawStdout.append(bytes)) return fail(Error('TRON_CANDIDATE_PRIVATE_LOG_BOUND'));
    if (failure) return; // Keep the bounded diagnostic prefix; protocol work has already failed.
    buffer += bytes.toString('utf8'); if (buffer.length > 65536) return fail(Error('TRON_CANDIDATE_PROTOCOL_BOUND'));
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); let result;
      try { result = JSON.parse(line); } catch { return fail(Error('TRON_CANDIDATE_PROTOCOL_JSON')); }
      if (resolveReady && result.kind === 'ready') { resolveReady(result); resolveReady = null; }
      else if (pending) { const p = pending; pending = null; result.error ? p.reject(Error('TRON_CANDIDATE_DRIVER_REJECTED_OR_UNKNOWN')) : p.resolve(result); }
      else return fail(Error('TRON_CANDIDATE_UNSOLICITED_RESPONSE'));
    }
  });
  const started = Date.now(); let sampled = false, checkRunning, readySeen = false, alignedJavaIdentity, alignedJavaArgv;
  let alignedGrantSent = false;
  async function identity({ terminal = false } = {}) {
    const row = await (profile === ALIGNED_ROCKSDB_PROFILE ? alignedProc(child.pid) : proc(child.pid)); if (!row) { assert.ok(terminal && exit, 'TRON_CANDIDATE_CHILD_DISAPPEARED'); return null; }
    assert.ok(original, 'TRON_CANDIDATE_BIRTH_UNAUTHENTICATED');
    if (profile === ALIGNED_ROCKSDB_PROFILE) {
      for (const key of ['group', 'session', 'uid']) assert.equal(row[key], original[key], 'TRON_ALIGNED_LIVE_IDENTITY_CHANGED');
      assert.deepEqual(row.uids, Array(4).fill(process.getuid()), 'TRON_ALIGNED_LIVE_UID4_CHANGED');
    }
    assert.equal(row.start, original.start, 'TRON_CANDIDATE_PID_REPLACED'); assert.equal(row.parent, process.pid, 'TRON_CANDIDATE_CHILD_REPARENTED');
    const executable = await readlink('/proc/' + child.pid + '/exe');
    if (profile === ALIGNED_ROCKSDB_PROFILE) {
      if (executable === join(RUNTIME, 'jdk8/bin/java')) {
        assert.equal(alignedGrantSent, true, 'TRON_ALIGNED_JAVA_BEFORE_ORIGINAL_GRANT');
        const observedArgv = (await readFile('/proc/' + child.pid + '/cmdline')).toString('utf8').split('\0').filter(Boolean);
        const expectedArgv = [join(RUNTIME, 'jdk8/bin/java'), '-Xms256m', '-Xmx1536m', '-XX:ActiveProcessorCount=2', '-Djava.net.preferIPv4Stack=true',
          '-Djava.io.tmpdir=' + join(directory, 'jni-tmp'), '-cp',
          join(directory, 'reviewed-new-driver-classes') + ':' + join(directory, 'reviewed-original-classes') + ':' + join(RUNTIME, 'FullNode-offline.jar'), 'OwnedTronNativeDriver'];
        assert.deepEqual(observedArgv, expectedArgv, 'TRON_ALIGNED_EXACT_ORIGINAL_JAVA_ARGV');
        const after = await alignedProc(child.pid);
        for (const key of ['pid', 'parent', 'start', 'group', 'session', 'uid', 'executable'])
          assert.equal(after?.[key], row[key], 'TRON_ALIGNED_JAVA_TRANSITION_IDENTITY_CHANGED');
        assert.deepEqual(after.uids, original.uids);
        alignedJavaIdentity ??= { ...after }; alignedJavaArgv ??= observedArgv;
      } else {
        assert.equal(alignedJavaIdentity, undefined, 'TRON_ALIGNED_JAVA_TRANSITION_REVERSED');
        assert.equal(executable, original.executable, 'TRON_ALIGNED_STARTUP_EXECUTABLE_CHANGED');
      }
    }
    if (readySeen) assert.equal(executable, join(RUNTIME, 'jdk8/bin/java'), 'TRON_CANDIDATE_JAVA_IDENTITY');
    else assert.ok(executable === join(RUNTIME, 'jdk8/bin/java') || /^\/usr\/bin\/python3(?:\.[0-9]+)?$/.test(executable), 'TRON_CANDIDATE_STARTUP_IDENTITY');
    assert.ok(row.rss <= 2147483648, 'TRON_CANDIDATE_CHILD_RSS_LIMIT'); return { ...row, executable };
  }
  async function auditNative() {
    if (signal.aborted) throw signal.reason;
    assert.ok(!failure && !exit, 'TRON_CANDIDATE_ORIGINAL_LIVE_CHILD'); const row = await identity();
    const status = await readFile('/proc/' + child.pid + '/status', 'utf8');
    // The same original PID hashes its fixed binaries in Python before arming
    // the filter. Java must never run during that unarmed startup interval.
    if (row.executable === join(RUNTIME, 'jdk8/bin/java')) {
      assert.match(status, /^NoNewPrivs:\s+1$/m); assert.match(status, /^Seccomp:\s+2$/m);
    } else assert.equal(readySeen, false, 'TRON_CANDIDATE_UNGUARDED_JAVA');
    if (row.executable === join(RUNTIME, 'jdk8/bin/java')) {
      const unix = (await readFile('/proc/' + child.pid + '/net/unix', 'utf8')).trim().split('\n').slice(1)
        .map(line => line.trim().split(/\s+/));
      for (const name of await readdir('/proc/' + child.pid + '/fd')) {
        let descriptor; try { descriptor = await readlink('/proc/' + child.pid + '/fd/' + name); } catch (error) { if (absent(error)) continue; throw error; }
        const socket = /^socket:\[([0-9]+)\]$/.exec(descriptor);
        if (!socket) continue;
        // JDK8 FileDispatcher owns an anonymous AF_UNIX pair. The filter
        // denies socket() and every network socketpair before Java executes.
        const entries = unix.filter(fields => fields[6] === socket[1]);
        assert.equal(entries.length, 1, 'TRON_CANDIDATE_NETWORK_SOCKET_FOUND');
        assert.equal(entries[0].length, 7, 'TRON_CANDIDATE_NAMED_SOCKET_FOUND');
      }
    }
    await hostResources(); assert.ok(Date.now() - started < 300000, 'TRON_CANDIDATE_FUNCTIONAL_DEADLINE'); sampled = true;
  }
  let interval;
  function beginPolling() {
    interval = setInterval(() => { checkRunning ??= auditNative().catch(fail).finally(() => { checkRunning = null; }); }, 250);
    interval.unref();
  }
  async function command(kind, args = []) {
    assert.ok(['HEALTH', 'PREPARE', 'CURRENT', 'ARMKEY', 'ARMSEND', 'SIGN', 'BROADCAST', 'OBSERVE', 'SOURCEBLOCK', 'SOURCESOLID', 'SOURCETX', 'SOURCEINFO', 'SOURCEREPLAY', 'CLOSE'].includes(kind));
    for (const value of args) assert.ok(typeof value === 'string' && /^[0-9a-f]+$/.test(value) && value.length <= 2048);
    assert.equal(pending, undefined, 'TRON_CANDIDATE_COMMAND_BUSY'); if (failure) throw failure;
    await auditNative(); let timeout;
    try { return await Promise.race([new Promise((resolve, reject) => { pending = { resolve, reject }; child.stdin.write([kind, ...args].join('\t') + '\n'); }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('TRON_CANDIDATE_COMMAND_OUTCOME_UNKNOWN')), 10000); })]);
    } catch (error) { fail(error); throw error; } finally { clearTimeout(timeout); pending = undefined; }
  }
  function close() { return closePromise ??= closeOriginal(); }
  async function closeOriginal() {
    if (closed) throw Error('TRON_CANDIDATE_DUPLICATE_INTERNAL_CLOSE'); clearInterval(interval); if (checkRunning) await checkRunning; closed = true;
    try { if (original && !failure && !exit) await command('CLOSE'); } catch { /* Never resend any economic command. */ }
    child.stdin.end(); let forced = false;
    try {
      if (profile === ALIGNED_ROCKSDB_PROFILE && !original) {
        // EOF rejects in the fixed Python gate before Java. Unknown identity
        // never authorizes numeric signalling, a CLOSE command, or acceptance.
        if (!closeReceipt) await grace(closedOriginal, 2500);
        assert.ok(closeReceipt, 'TRON_ALIGNED_UNAUTHENTICATED_STARTUP_CLOSE_UNKNOWN');
        if (Number.isSafeInteger(child.pid)) {
          assert.ok(exit, 'TRON_ALIGNED_UNAUTHENTICATED_STARTUP_EXIT_UNKNOWN');
          assert.equal(await proc(child.pid), null, 'TRON_ALIGNED_UNAUTHENTICATED_CHILD_STILL_PRESENT');
        }
        const errLog = stderr.snapshot(), outLog = rawStdout.snapshot();
        await privateWrite(join(audit, 'stderr-private.log'), errLog.bytes);
        await privateWrite(join(audit, 'stdout-private.log'), outLog.bytes);
        return { stopped: true, exitCode: closeReceipt.code, signal: closeReceipt.signal, forced: false,
          originalChildSpawned: Number.isSafeInteger(child.pid), exitObserved: Boolean(exit), closeObserved: true, startupAuthenticated: false, nativeOrderlyExit: false, sampledResourceFloorsHeld: false,
          privateStreamCapture: { stdout: outLog.metadata, stderr: errLog.metadata } };
      }
      if (!exit) await grace(exited, 30000);
      if (!exit) { await identity(); child.kill('SIGTERM'); await grace(exited, 5000); }
      if (!exit) { await identity(); forced = true; child.kill('SIGKILL'); await grace(exited, 5000); }
      assert.ok(exit, 'TRON_CANDIDATE_EXIT_UNKNOWN'); assert.equal(await proc(child.pid), null, 'TRON_CANDIDATE_CHILD_STILL_PRESENT');
      const errLog = stderr.snapshot(), outLog = rawStdout.snapshot();
      await privateWrite(join(audit, 'stderr-private.log'), errLog.bytes);
      await privateWrite(join(audit, 'stdout-private.log'), outLog.bytes);
      let nativeFatalTrace = null;
      const fatalPath = join(directory, 'hs_err_pid' + child.pid + '.log');
      try {
        const fatalStat = await lstat(fatalPath);
        assert.ok(fatalStat.isFile() && !fatalStat.isSymbolicLink() && fatalStat.uid === process.getuid(), 'TRON_CANDIDATE_FATAL_TRACE_ORIGINAL_FILE');
        assert.ok(fatalStat.size <= 16 * 1024 * 1024, 'TRON_CANDIDATE_FATAL_TRACE_BOUND');
        const fatalBytes = await regular(fatalPath);
        await privateWrite(join(audit, 'jvm-fatal-private.log'), fatalBytes);
        nativeFatalTrace = { retainedPrivate: true, bytes: fatalBytes.length, sha256: sha(fatalBytes) };
      } catch (error) { if (!absent(error)) throw error; }
      const privateDiskLogCapture = await captureTronCandidateDiskLogs(directory, audit);
      return { stopped: true, exitCode: exit.code, signal: exit.signal, forced,
        nativeOrderlyExit: exit.code === 0 && exit.signal === null && !forced, sampledResourceFloorsHeld: sampled,
        nativeFatalTrace, privateDiskLogCapture, privateStreamCapture: { stdout: outLog.metadata, stderr: errLog.metadata } };
    } finally { releaseCancellation?.(); child.stdin.destroy(); }
  }
  releaseCancellation = bindTronCandidateChildCancellation(signal, fail, close);
  let timeout;
  try {
    if (profile === ALIGNED_ROCKSDB_PROFILE) {
      const owner = await alignedProc(process.pid), first = await alignedProc(child.pid), second = await alignedProc(child.pid);
      assertTronAlignedRocksDbStartupIdentity(owner, first, second);
      assert.ok(!signal.aborted && !failure && !exit && !closed, 'TRON_ALIGNED_STARTUP_CANCELLED');
      original = second; alignedGrantSent = true;
      child.stdin.write(Buffer.from('G')); // One private grant, before any original command.
    } else {
      original = await proc(child.pid); assert.ok(original?.parent === process.pid, 'TRON_CANDIDATE_ORIGINAL_CHILD');
    }
    beginPolling();
    const hello = await Promise.race([ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('TRON_CANDIDATE_STARTUP_TIMEOUT')), 120000); })]);
    readySeen = true; await auditNative(); assert.equal(hello.metadata.classification, 'LOCAL_SYNTHETIC_TRON_JAVA_TRON_CONSENSUS');
    assert.equal(hello.metadata.upstreamCommit, TRON_UPSTREAM.commit); assert.match(hello.metadata.genesis, /^0000000000000000[0-9a-f]{48}$/);
    let alignedNativeAudit;
    if (profile === ALIGNED_ROCKSDB_PROFILE) {
      alignedNativeAudit = await captureTronAlignedRocksDbNativeAudit(directory, await identity());
      await privateWrite(join(audit, 'jni-maps-ready-private.log'), alignedNativeAudit.maps);
      await privateWrite(join(audit, 'original-aligned-rocksdb-ready-audit.json'), alignedNativeAudit.evidence);
    }
    return { hello, command, auditNative, close, alignedNativeAudit: alignedNativeAudit?.evidence ?? null,
      alignedStartupIdentityEvidence: profile === ALIGNED_ROCKSDB_PROFILE ? {
        format: 'LIANUM_TRON_ALIGNED_PYTHON_JAVA_TRANSITION_V1', pythonBirth: original, javaFirstObservation: alignedJavaIdentity,
        grantOctet: 'G', authorizedExecTransitions: 1, originalJavaArgv: alignedJavaArgv } : null,
      async captureAlignedNativeAudit() {
        assert.equal(profile, ALIGNED_ROCKSDB_PROFILE); await auditNative();
        return captureTronAlignedRocksDbNativeAudit(directory, await identity());
      } };
  } catch (error) {
    if (profile === ALIGNED_ROCKSDB_PROFILE) {
      try { error.childCleanup = await close(); }
      catch (cleanupError) {
        error.childCleanup = { stopped: false, startupAuthenticated: false, nativeOrderlyExit: false };
        error.childCleanupErrorCode = safeCode(cleanupError);
      }
      throw error; // Preserve original capture/admission failure even when cleanup is uncertain.
    }
    error.childCleanup = await close(); throw error;
  } finally { clearTimeout(timeout); }
}
// Private port adapter over the newly acquired original factory. No caller
// driver/profile/command or endpoint can reach this fixed acceptance entry.
function productCommandPorts(driver,lifetime) {
 const ports={HEALTH:[0,()=>driver.health()],PREPARE:[2,(...v)=>driver.prepare(...v)],CURRENT:[1,v=>driver.current(v)],
  ARMKEY:[1,v=>driver.armKey(v)],ARMSEND:[1,v=>driver.armSend(v)],SIGN:[2,(...v)=>driver.sign(...v)],
  BROADCAST:[3,(...v)=>driver.broadcast(...v)],OBSERVE:[1,v=>driver.observe(v)],SOURCEBLOCK:[1,v=>driver.readBlock(v)],
  SOURCESOLID:[0,()=>driver.readSolidBlock()],SOURCETX:[1,v=>driver.readTransaction(v)],SOURCEINFO:[1,v=>driver.readTransactionInfo(v)],
  SOURCEREPLAY:[2,(...v)=>driver.readReplay(...v)]};
 return async(kind,args=[])=>{lifetime.assertActive();assert.ok(Object.hasOwn(ports,kind),'TRON_PRODUCT_FIXED_ACCEPTANCE_PORT');
  assert.equal(args.length,ports[kind][0],'TRON_PRODUCT_FIXED_ACCEPTANCE_ARITY');const value=await ports[kind][1](...args);lifetime.assertActive();return value;};
}
async function exerciseOriginalTronEconomy(lifetime,profile,original,audit,report,checks,before,inventory) {
 assertPrivateCandidateProfile(profile);
    const metadata=profile===PRODUCT_ORIGINAL_PROFILE?original.metadata:original.hello.metadata;
    const command=profile===PRODUCT_ORIGINAL_PROFILE?productCommandPorts(original,lifetime):original.command; report.genesis = metadata.genesis;
    if (profile.aligned === true) {
      report.originalAlignedNativeAudit = original.alignedNativeAudit; report.originalAlignedStartupIdentityEvidence = original.alignedStartupIdentityEvidence;
      checks.actualRocksDbStoresCheckpointAndOriginalJNI = true;
    }
    const health = await command('HEALTH'); assert.ok(BigInt(health.head.number) >= 2n);
    const wireKeyCommitment = randomBytes(32).toString('hex'), intent = { ownerAddress: metadata.solverEndpoint,
      recipientAddress: metadata.recipientEndpoint, amountSun: '1000000', wireKeyCommitment };
    // Data-only fixture framing, never a dispatch proof or authority capability.
    const binding = Object.fromEntries(['leaseId', 'profileCommitment', 'actionCommitment', 'readyStatement',
      'dependencyProofSHA256', 'readyProofSHA256'].map(name => [name, sha('UNREGISTERED_CANDIDATE_ONLY/' + name + '/' + wireKeyCommitment)]));
    Object.assign(binding, { genesis: metadata.genesis, receiptKeyCommitment: wireKeyCommitment });
    const raw = await command('PREPARE', [intent.amountSun, wireKeyCommitment]);
    const prepared = prepareOwnedTronNative({ binding, intent, snapshot: raw.snapshot, nowMs: raw.timestampMs });
    assert.equal(prepared.unsignedWire, raw.unsignedWire); await privateWrite(join(audit, 'original-prepared.json'), { raw, prepared });
    await command('ARMKEY', [raw.preparationId]); assertPreparationCurrent(prepared, await command('CURRENT', [raw.preparationId]), String(Date.now()));
    const signed = await command('SIGN', [raw.preparationId, raw.unsignedWire]);
    assert.deepEqual(bindOwnedTronSigned(prepared.transaction, signed.nativeWire), signed); const decoded = decodeTronNativeTransferWire(signed.nativeWire);
    assert.equal(decoded.signature.signerAddress, metadata.solverEndpoint); await privateWrite(join(audit, 'original-signed.json'), signed);
    checks.originalCodecAndRecoveredSigner = true;
    await command('ARMSEND', [raw.preparationId]); assertPreparationCurrent(prepared, await command('CURRENT', [raw.preparationId]), String(Date.now()));
    assert.deepEqual(await command('BROADCAST', [raw.preparationId, signed.nativeId, signed.transactionSHA256]), { nativeId: signed.nativeId, accepted: true });
    checks.originalBroadcastOnce = true; let observed;
    // Only original read-only commands. No send, key arm, speculative mining,
    // latest-state authority fallback or softened finality test.
    async function retainPendingAudit(index) {
      const before = await command('HEALTH');
      const info = await command('SOURCEINFO', [signed.nativeId]);
      const transaction = await command('SOURCETX', [signed.nativeId]);
      const solid = await command('SOURCESOLID');
      const head = await command('SOURCEBLOCK', [before.head.number]);
      const included = info.blockNumber === undefined ? null : await command('SOURCEBLOCK', [info.blockNumber]);
      const after = await command('HEALTH');
      const infoPresent = info.id !== undefined, transactionPresent = transaction.txID !== undefined;
      const pending = { infoPresent, transactionPresent, infoIdentityMatches: infoPresent && info.id === signed.nativeId,
        transactionIdentityMatches: transactionPresent && transaction.txID === signed.nativeId,
        transactionRawMatchesOriginal: transactionPresent && transaction.raw_data_hex === decoded.rawDataHex,
        pendingPoolSize: before.pendingCount, headContainsOriginal: head.transactions.some(value => value.txID === signed.nativeId),
        headHeight: before.head.number, solidHeight: solid.block_header.raw_data.number,
        receiptHeight: info.blockNumber ?? null, receiptResult: info.result ?? null,
        originalPendingBranch: !infoPresent ? 'NO_ORIGINAL_TRANSACTION_INFO' : !transactionPresent ? 'NO_ORIGINAL_TRANSACTION'
          : BigInt(solid.block_header.raw_data.number) < BigInt(info.blockNumber) ? 'ORIGINAL_RECEIPT_BLOCK_NOT_SOLIDIFIED'
          : 'READS_ADVANCED_AFTER_PENDING_OBSERVATION',
        headStableDuringRead: before.head.id === after.head.id && before.solid.id === after.solid.id,
        canonicalReceiptBlockContainsOriginal: included !== null && included.transactions.some(value => value.txID === signed.nativeId) };
      report.lastPendingDiagnostic = pending;
      await privateWrite(join(audit, 'pending-readonly-' + String(index).padStart(3, '0') + '.json'),
        { before, info, transaction, solid, head, included, after, pending });
    }

    for (let count = 0; count < 120; count++) {
      observed = await command('OBSERVE', [signed.nativeId]); if (observed.status === 'observed') break;
      assert.equal(observed.status, 'pending', 'TRON_CANDIDATE_NATIVE_OUTCOME_UNKNOWN');
      if (count % 20 === 0) await retainPendingAudit(count); await wait(500);
    }
    if (observed.status === 'pending') await retainPendingAudit(120);
    assert.equal(observed.status, 'observed', 'TRON_CANDIDATE_NATIVE_FINALITY_TIMEOUT'); assert.equal(observed.nativeWire, signed.nativeWire);
    const info = await command('SOURCEINFO', [signed.nativeId]), block = await command('SOURCEBLOCK', [info.blockNumber]);
    const replay = await command('SOURCEREPLAY', [signed.nativeId, block.blockID]);
    assert.equal(replay.schema, 'LIANUM_TRON_PRETRANSACTION_REPLAY_CONTEXT_V1'); assert.equal(replay.genesis, metadata.genesis);
    assert.equal(replay.nativeId, signed.nativeId); assert.equal(replay.transactionSHA256, signed.transactionSHA256);
    assert.equal(replay.blockId, block.blockID); assert.equal(replay.blockHeight, info.blockNumber);
    assert.equal(replay.ownerAddress, decoded.signature.signerAddress); assert.equal(replay.ownerPermission.type, 'Owner');
    assert.equal(replay.ownerPermission.id, '0'); assert.equal(replay.ownerPermission.threshold, '1');
    assert.deepEqual(replay.ownerPermission.keys, [{ address: decoded.signature.signerAddress, weight: '1' }]);
    assert.equal(block.transactions[Number(replay.transactionIndex)].txID, signed.nativeId);
    checks.originalContainingBlockPermissionPrestate = true;
    const expected = Object.fromEntries(['nativeId', 'transactionSHA256', 'ownerAddress', 'recipientAddress', 'amountSun',
      'refBlockBytes', 'refBlockHash', 'timestampMs', 'expirationMs', 'wireKeyCommitment'].map(name => [name, decoded[name]]));
    const observer = createTronNativeTransferObserver({ chain: 'tron', genesisHash: metadata.genesis,
      original: { nativeWire: signed.nativeWire, expected }, transport: async (path, body) => {
        if (path === '/walletsolidity/getblockbynum') return command('SOURCEBLOCK', [String(body.num)]);
        if (path === '/walletsolidity/getnowblock') return command('SOURCESOLID');
        if (path === '/walletsolidity/gettransactionbyid') { assert.equal(body.value, signed.nativeId); return command('SOURCETX', [signed.nativeId]); }
        if (path === '/walletsolidity/gettransactioninfobyid') { assert.equal(body.value, signed.nativeId); return command('SOURCEINFO', [signed.nativeId]); }
        throw Error('TRON_CANDIDATE_FIXED_READ_COMMAND');
      } });
    const first = await observer.observe({ nativeId: signed.nativeId }); assert.equal(first.status, 'observed', first.reason);
    const repeated = await observer.observe({ nativeId: signed.nativeId }); assert.equal(repeated.status, 'observed', repeated.reason);
    assert.deepEqual(repeated.evidence.inclusion, first.evidence.inclusion); checks.originalReadOnlyObserverRepeated = true;
    const final = await command('HEALTH'); assert.equal(BigInt(raw.snapshot.ownerBalanceSun) - BigInt(final.ownerBalanceSun),
      BigInt(intent.amountSun) + BigInt(info.fee)); assert.ok(BigInt(info.fee) <= BigInt(PROFILE.maximumFeeSun));
    checks.originalOwnerAmountAndFeeDelta = true; await original.auditNative(); checks.childNetworkSocketGuardAndAnonymousUnixOnly = true;
    await privateWrite(join(audit, 'original-native-observation.json'), { info, block, replay, first, repeated, final });
    if (profile.aligned === true) {
      const afterNative = await original.captureAlignedNativeAudit();
      assert.deepEqual(afterNative.evidence.libraries, original.alignedNativeAudit.libraries);
      assert.deepEqual(afterNative.evidence.stores, original.alignedNativeAudit.stores);
      await privateWrite(join(audit, 'jni-maps-observed-private.log'), afterNative.maps);
      await privateWrite(join(audit, 'original-aligned-rocksdb-observed-audit.json'), afterNative.evidence);
      checks.actualRocksDbJNIAndStoreMarkersUnchanged = true;
    }
    assert.deepEqual(await candidateInventory(profile), inventory); assert.deepEqual(await sourcePins(profile), before);
    lifetime.assertActive(); checks.signalDeadlineAndOwnedChildCancellationInstalled = true;
    checks.sourceAndOriginalBinaryClosureUnchanged = true; report.amountSun = intent.amountSun; report.feeSun = info.fee;
    report.nativeId = signed.nativeId; report.containingBlock = block.blockID; return true;
}
async function executeTronCandidateAcceptance(lifetime, profile) {
  assert.equal(arguments.length, 2); lifetime.assertActive(); assertCandidateProfileGate(profile); await noHeavyWork();
  const before = await sourcePins(profile), inventory = await candidateInventory(profile);
  await mkdir(profile.acceptance, { recursive: true, mode: 0o700 }); const audit = await mkdtemp(join(profile.acceptance, 'attempt-'));
  const scratch = await mkdtemp(join(profile.acceptance, 'scratch-')); let original, cleanup, success = false, errorCode = null;
  const checks = {}, report = { schema: 'LIANUM_TRON_BINARY_CANDIDATE_ACCEPTANCE_V1', scope: 'native-candidate-solver-only',
    ...(profile === ALIGNED_ROCKSDB_PROFILE ? { candidateProfile: 'aligned-rocksdb-v1', candidateRuntimeRelease: null } : {}),
    canonicalRuntimeRelease: null, publicNetwork: false, privateCreditEstablished: false,
    registeredGraphAuthorizationEstablished: false, nativeProcessRestartEstablished: false, inventory };
  try {
    lifetime.assertActive(); original = await startOriginalChild(scratch, audit, lifetime.signal, profile); checks.nativeConsensusProducedNewBlocks = true;
    success=await exerciseOriginalTronEconomy(lifetime,profile,original,audit,report,checks,before,inventory);
  } catch (error) { errorCode = safeCode(error); cleanup = error.childCleanup;
    if (profile === ALIGNED_ROCKSDB_PROFILE && Buffer.isBuffer(error.alignedPrivateMaps))
      await privateWrite(join(audit, 'jni-maps-rejected-private.log'), error.alignedPrivateMaps);
    await privateWrite(join(audit, 'stopped-private.json'), { errorCode, diagnostic: String(error.stack ?? error).slice(0, 8000) });
  } finally {
    try { if (original) cleanup = await original.close(); } catch (error) { errorCode ??= safeCode(error); }
    if (cleanup?.stopped === true) { await rm(scratch, { recursive: true }); checks.syntheticKeysAndLedgerRemoved = true; }
    else success = false;
    if (lifetime.signal.aborted) { success = false; errorCode ??= safeCode(lifetime.signal.reason); }
    success = success && !errorCode && cleanup?.nativeOrderlyExit === true && cleanup?.forced === false;
    Object.assign(report, { success, errorCode, checks, cleanup: cleanup ?? null,
      disclosures: ['Genuine Java-Tron consensus with fresh synthetic genesis and fixture funds',
        'socket() and network socketpair syscalls denied before Java exec including JNI; only anonymous AF_UNIX stdio channels/JDK pairs and local pipes allowed',
        profile === ALIGNED_ROCKSDB_PROFILE
          ? 'All7 originals retained; only new driver2class shadows with aligned genesis and official ROCKSDB; unchanged Args overlay, Manager, recorder, JAR and JDK; owned java.io.tmpdir declared; no full rebuild or JNI fix claim'
          : 'All7 original classes retained exactly; their original package overlay uses one newly compiled and pinned Args offline-zero delta before the unchanged JAR; no full source rebuild claim',
        'Trusted same-host native source; no independent operators or public-network consensus acceptance',
        'No canonical release, private claims, proof, graph admission, private credit or process-loss recovery established'] });
    await privateWrite(join(audit, 'report.json'), report);
  }
  return { report, reportPath: join(audit, 'report.json') };
}
async function runFixedTronCandidate(profile) {
  assert.equal(arguments.length, 1); assertCandidateProfileGate(profile);
  const directory = ACCEPTANCE;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  assert.equal(await realpath(directory), directory, 'TRON_CANDIDATE_LOCK_DIRECTORY_PATH');
  const lockPath = join(directory, 'active.lock'), owner = await open(lockPath, 'wx', 0o600);
  const identity = await owner.stat(); const lifetime = beginTronCandidateLifetime(); let result;
  try {
    await owner.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), fixedLocalFixture: true }));
    await owner.sync();
    result = await executeTronCandidateAcceptance(lifetime, profile); return result;
  } finally {
    lifetime.finish(); await owner.close();
    if (result?.report.cleanup?.stopped === true && result?.report.checks?.syntheticKeysAndLedgerRemoved === true) {
      const retained = await lstat(lockPath);
      assert.ok(retained.isFile() && !retained.isSymbolicLink() && retained.ino === identity.ino
        && retained.dev === identity.dev && retained.uid === process.getuid(), 'TRON_CANDIDATE_LOCK_OWNER');
      await unlink(lockPath);
    }
  }
}
export async function runTronCandidateAcceptance() {
  assert.equal(arguments.length, 0, 'TRON_CANDIDATE_NO_RUN_OPTIONS');
  return runFixedTronCandidate(ORIGINAL_CANDIDATE_PROFILE);
}
export async function runTronAlignedRocksDbCandidateAcceptance() {
  assert.equal(arguments.length, 0, 'TRON_ALIGNED_NO_RUN_OPTIONS');
  return runFixedTronCandidate(ALIGNED_ROCKSDB_PROFILE);
}
/** Fresh local product factory acceptance. No private wallet/credit/GRAPH.
 * The original candidate keeps its own 300s profile. This one-send fixture uses
 * a 300s economic phase AFTER the fixed 90min factory's guarded startup. */
export async function runTronProductOriginalAcceptanceV1() {
 assert.equal(arguments.length,0,'TRON_PRODUCT_NO_ACCEPTANCE_OPTIONS');assertCandidateProfileGate(PRODUCT_ORIGINAL_PROFILE);
 const profile=PRODUCT_ORIGINAL_PROFILE;let lifetime,original,cleanup,success=false,errorCode=null;
 let audit,releaseCancellation;const checks={},report={schema:'LIANUM_TRON_PRODUCT_ORIGINAL_FACTORY_ACCEPTANCE_V1',scope:'local-original-product-driver-solver-only',
  canonicalRuntimeRelease:null,publicNetwork:false,privateCreditEstablished:false,registeredGraphAuthorizationEstablished:false,
  privateWalletAcceptanceEstablished:false,nativeProcessRestartEstablished:false,productDriverFixedMilliseconds:5400000,fixtureEconomicMaximumMilliseconds:300000};
 try {
  await noHeavyWork();const before=await sourcePins(profile),inventory=await candidateInventory(profile);report.inventory=inventory;
  await mkdir(profile.acceptance,{recursive:true,mode:0o700});assert.equal(await realpath(profile.acceptance),profile.acceptance);
  const info=await lstat(profile.acceptance);assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o7777)===0o700);
  audit=await mkdtemp(join(profile.acceptance,'attempt-'));await privateWrite(join(audit,'source-pins-before.json'),before);
  original=await startFixedOwnedTronDriver();lifetime=beginTronCandidateLifetime();
  releaseCancellation=bindTronCandidateChildCancellation(lifetime.signal,()=>{},()=>original.close());lifetime.assertActive();checks.nativeConsensusProducedNewBlocks=true;
  report.originalDriverAuditDirectory=original.auditDirectory;report.originalScratch=original.directory;
  success=await exerciseOriginalTronEconomy(lifetime,profile,original,audit,report,checks,before,inventory);
  await privateWrite(join(audit,'source-pins-after.json'),await sourcePins(profile));
 }catch(error){errorCode=safeCode(error);cleanup=error.productCleanup??error.childCleanup;
  if(audit)await privateWrite(join(audit,'stopped-private.json'),{errorCode,diagnostic:String(error.stack??error).slice(0,8000)});
 }finally{
  try{if(original)cleanup=await original.close();}catch(error){errorCode??=safeCode(error);cleanup=error.productCleanup??cleanup;}
  if(cleanup?.stopped===true&&cleanup.scratchRemoved===true&&cleanup.syntheticKeysAndLedgerRemoved===true)checks.syntheticKeysAndLedgerRemoved=true;
  if(lifetime?.signal.aborted){success=false;errorCode??=safeCode(lifetime.signal.reason);}
  success=success&&!errorCode&&cleanup?.stopped===true&&cleanup?.nativeOrderlyExit===true&&cleanup?.forced===false&&cleanup?.exitCode===0&&cleanup?.signal===null
   &&cleanup?.sourceUnchanged===true&&checks.syntheticKeysAndLedgerRemoved===true;
  Object.assign(report,{success,errorCode,checks,cleanup:cleanup??null,
   disclosures:['Fresh product driver from the original zero-option factory; one synthetic 1000000sun transfer and original canonical permission/observer checks',
    'Original factory/startup is bounded by its fixed 90min lifetime and original startup guard; economic phase starts after acquisition and uses unchanged 300s harness cancellation',
    'No original wallet graph or private credit established',
    'Original seven classes/JAR/JDK/Args and aligned two classes retained; genuine JNI/maps/rocksdb observations and owned cleanup required',
    'No canonical runtime release, public network/Cloud, I84/private claims, process-loss recovery or private wallet acceptance established']});
  releaseCancellation?.();lifetime?.finish();if(audit)await privateWrite(join(audit,'report.json'),report);
 }
 return {report,reportPath:audit?join(audit,'report.json'):null};
}
if (process.argv[1] && resolve(process.argv[1]) === HERE) {
  try { const result = await runTronCandidateAcceptance(); console.log(JSON.stringify(result)); process.exitCode = result.report.success ? 0 : 1; }
  catch (error) { console.error(safeCode(error)); process.exitCode = 2; }
}
