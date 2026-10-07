/** Finite owned native idle runtime measurement, no proof or payment operation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statfsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createOwnedNativeRuntime } from '../src/chains/native-runtime.mjs';
import { createOwnedSolanaRuntime } from '../src/chains/solana-runtime.mjs';
import { projectRoot, sleep } from '../src/chains/runtime-harness.mjs';

assert.ok(process.argv.includes('--authorized-runtime-memory-probe'), 'OWNED_RUNTIME_MEMORY_APPROVAL_REQUIRED');
assert.equal(process.platform, 'linux', 'OWNED_RUNTIME_MEMORY_LINUX_ONLY');
const boundedLedgerProfile = process.argv.includes('--bounded-ledger-profile');
const profileName = boundedLedgerProfile ? 'PC23_BOUNDED_LEDGER_V1' : 'ORIGINAL_LOOPBACK_DEFAULT';
const selectedBinarySHA256 = boundedLedgerProfile
  ? '7d6d38cfe120c74b486104955029aa6ae4ff1de8167a602125cafeff166f2ca0'
  : 'bc082911d81efe39ffedde30d221789efc950b99617168e35305a2229ba77320';
const profileManifestPath = 'evidence/m23-bounded-ledger-profile/manifest.json';
const profileManifestSHA256 = 'f6e62a557520dc579c2bf3980805049fd9acde08a898091857f7c74b7a02972b';
const runtimeOptions = Object.freeze({ ledgerRetentionShreds: 1000000, ticksPerSlot: 64,
  ...(boundedLedgerProfile ? { resourceProfile: 'PC23_BOUNDED_LEDGER_V1' } : {}) });
const durationMs = 300000, sampleIntervalMs = 30000;
const ramFloorBytes = 3 * 1024 ** 3, diskFloorBytes = 5 * 1024 ** 3;
const start = performance.now(), startedAt = new Date().toISOString();
const sha = data => createHash('sha256').update(data).digest('hex');
const evidenceDir = join(projectRoot, 'evidence/m23-owned-runtime-memory-budget');
const evidencePath = join(evidenceDir, `${startedAt.replace(/[:.]/g, '-')}-${process.pid}.json`);
const sources = ['scripts/check-owned-runtime-memory-budget.mjs', 'src/chains/native-runtime.mjs',
  'src/chains/solana-runtime.mjs', 'src/chains/runtime-harness.mjs',
  'src/chains/linux-runtime-pins.mjs', 'contracts/LocalBitcoinDeliveryEscrow.sol'];
const report = {
  classification: 'FINITE_OWNED_THREE_CHAIN_IDLE_MEMORY_OBSERVATION_NO_PROOFS_OR_PAYMENTS',
  phase: 'RUNNING', startedAt, platform: process.platform, nodeVersion: process.version,
  requestedIdleDurationMs: durationMs, sampleIntervalMs, guardIntervalMs: 1000,
  ramFloorBytes, diskFloorBytes, ledgerRetentionShreds: 1000000, ticksPerSlot: 64,
  scope: 'Unmodified createOwnedNativeRuntime bootstrap plus createOwnedSolanaRuntime, followed by idle observation and exact-owned cleanup',
  nativeBootstrap: 'Existing helper compiles/deploys local baseline contract, creates fresh fake regtest wallets and mines fictitious funds; no payment or wallet engine operation is invoked',
  noProofGeneration: true, noPaymentOrTransfer: true, noValidatorRebuild: true,
  fixedRuntimeOptionsThroughoutProbe: true, noRuntimeSourceChangesDuringProbe: true, noBroadProcessDiscovery: true,
  resourceProfile: { name: profileName, selectedBinarySHA256,
    ...(boundedLedgerProfile ? { provenanceManifestPath: profileManifestPath, provenanceManifestSHA256: profileManifestSHA256,
      sourceDelta: 'One additional aggregate RocksDB proactive memtable flush threshold; prior loopback/no-host-limit changes retained',
      aggregateMemtableFlushThresholdBytes: 134217728, strictProcessMemoryCap: false } : {}) },
  measurements: 'Host /proc/meminfo and statfs; controller and only metadata-returned owned PIDs /proc/status and smaps_rollup in the owning exec session',
  limits: 'Idle five-minute window does not establish an hour-long bound or loaded proof/payment peak. Host MemAvailable and free disk include unrelated activity. RSS sums double-count shared mappings; PSS apportions them. No OOM inference.',
  sourcesBefore: {}, sourcesAfter: {}, samples: [], guardChecks: 0,
};
let native, solana, guardFailure, guardTimer, idleStart, shuttingDown = false;
const tracked = new Map();
function memoryFields(text) {
  return Object.fromEntries([...text.matchAll(/^([A-Za-z_]+):\s+(\d+)\s+kB\s*$/gm)].map(m => [m[1], Number(m[2]) * 1024]));
}
function processStat(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
}
function processSample(pid, role, identity) {
  try {
    const stat = processStat(pid), statusText = readFileSync(`/proc/${pid}/status`, 'utf8');
    const parentPid = Number(/^PPid:\s+(\d+)/m.exec(statusText)?.[1]);
    const startTicks = stat[19];
    if (identity && (identity.startTicks !== startTicks || parentPid !== process.pid)) {
      return { role, pid, live: false, identityChanged: true };
    }
    const status = memoryFields(statusText), rollup = memoryFields(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'));
    assert.ok(Number.isSafeInteger(rollup.Rss) && Number.isSafeInteger(rollup.Pss), 'OWNED_RUNTIME_MEMORY_ROLLUP_REQUIRED');
    return { role, pid, parentPid, live: stat[0] !== 'Z', state: stat[0], startTicks,
      rssBytes: rollup.Rss, pssBytes: rollup.Pss,
      privateBytes: (rollup.Private_Clean ?? 0) + (rollup.Private_Dirty ?? 0) + (rollup.Private_Hugetlb ?? 0),
      anonymousBytes: rollup.Anonymous ?? null,
      sharedCleanBytes: rollup.Shared_Clean ?? null, sharedDirtyBytes: rollup.Shared_Dirty ?? null,
      pssAnonBytes: rollup.Pss_Anon ?? null, pssFileBytes: rollup.Pss_File ?? null,
      statusRSSBytes: status.VmRSS ?? null, statusRSSAnonBytes: status.RssAnon ?? null,
      statusRSSFileBytes: status.RssFile ?? null, statusRSSShmemBytes: status.RssShmem ?? null,
      swapBytes: status.VmSwap ?? null, highWaterRSSBytes: status.VmHWM ?? null,
      threads: Number(/^Threads:\s+(\d+)/m.exec(statusText)?.[1]) };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return { role, pid, live: false };
    throw error;
  }
}
function track(pid, role) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid && !tracked.has(pid), 'OWNED_RUNTIME_MEMORY_EXACT_PID_REQUIRED');
  const sample = processSample(pid, role);
  assert.equal(sample.live, true, 'OWNED_RUNTIME_MEMORY_OWNED_CHILD_LIVE');
  assert.equal(sample.parentPid, process.pid, 'OWNED_RUNTIME_MEMORY_PARENT_REQUIRED');
  tracked.set(pid, { role, startTicks: sample.startTicks });
}
function resources() {
  const fs = statfsSync(projectRoot), fields = memoryFields(readFileSync('/proc/meminfo', 'utf8'));
  assert.ok(Number.isSafeInteger(fields.MemAvailable), 'OWNED_RUNTIME_MEMORY_MEMAVAILABLE_REQUIRED');
  return { memAvailableBytes: fields.MemAvailable, memFreeBytes: fields.MemFree,
    memCachedBytes: fields.Cached, reclaimableSlabBytes: fields.SReclaimable,
    freeDiskBytes: fs.bavail * fs.bsize };
}
function guard() {
  const value = resources();
  report.guardChecks++;
  report.minimumGuardMemAvailableBytes = Math.min(report.minimumGuardMemAvailableBytes ?? Infinity, value.memAvailableBytes);
  report.minimumGuardFreeDiskBytes = Math.min(report.minimumGuardFreeDiskBytes ?? Infinity, value.freeDiskBytes);
  assert.ok(value.memAvailableBytes >= ramFloorBytes, 'PC18_AVAILABLE_RAM_FLOOR');
  assert.ok(value.freeDiskBytes >= diskFloorBytes, 'PC18_DISK_FLOOR');
  return value;
}
function sample(stage) {
  const children = [...tracked].map(([pid, identity]) => processSample(pid, identity.role, identity));
  const live = children.filter(c => c.live);
  const value = { stage, elapsedMs: Math.round(performance.now() - start),
    idleElapsedMs: idleStart === undefined ? null : Math.round(performance.now() - idleStart),
    ...resources(), controller: processSample(process.pid, 'controller'), children,
    liveChildCount: live.length, childRSSBytes: live.reduce((sum, c) => sum + c.rssBytes, 0),
    childPSSBytes: live.reduce((sum, c) => sum + c.pssBytes, 0),
    childPrivateBytes: live.reduce((sum, c) => sum + c.privateBytes, 0),
    childAnonymousBytes: live.reduce((sum, c) => sum + c.anonymousBytes, 0) };
  report.samples.push(value);
  console.log(JSON.stringify({ stage, elapsedMs: value.elapsedMs, idleElapsedMs: value.idleElapsedMs,
    memAvailableBytes: value.memAvailableBytes, freeDiskBytes: value.freeDiskBytes,
    childRSSBytes: value.childRSSBytes, childPSSBytes: value.childPSSBytes,
    children: children.map(c => ({ role: c.role, pid: c.pid, live: c.live, rssBytes: c.rssBytes, pssBytes: c.pssBytes, privateBytes: c.privateBytes, anonymousBytes: c.anonymousBytes })) }));
  return value;
}
function requireResources() {
  if (guardFailure) throw guardFailure;
  return guard();
}
function safeError(error) { return /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'OWNED_RUNTIME_MEMORY_OPERATION_FAILED'; }
async function closeOwned() {
  const result = {};
  // Exact runtime handles only; no PID-based signaling or discovery.
  if (solana) { try { result.solana = await solana.close(); } catch (e) { result.solanaFailure = safeError(e); } }
  if (native) { try { await native.close(); result.nativeClosed = true; } catch (e) { result.nativeFailure = safeError(e); } }
  return result;
}
const onSignal = () => { guardFailure ??= new Error('OWNED_RUNTIME_MEMORY_INTERRUPTED'); };
process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
try {
  for (const file of sources) report.sourcesBefore[file] = sha(await readFile(join(projectRoot, file)));
  if (boundedLedgerProfile) assert.equal(sha(await readFile(join(projectRoot, profileManifestPath))), profileManifestSHA256, 'OWNED_RUNTIME_MEMORY_PROFILE_PROVENANCE_MISMATCH');
  sample('BASELINE'); requireResources();
  guardTimer = setInterval(() => {
    if (shuttingDown || guardFailure) return;
    try { guard(); } catch (error) { guardFailure = error; }
  }, 1000);
  native = await createOwnedNativeRuntime(async () => { requireResources(); });
  assert.equal(native.metadata.processIds.length, 2);
  native.metadata.processIds.forEach((pid, i) => track(pid, i === 0 ? 'evm-anvil' : 'bitcoin-core'));
  sample('NATIVE_READY'); requireResources();
  solana = await createOwnedSolanaRuntime(async () => { requireResources(); }, runtimeOptions);
  track(solana.metadata.processId, 'solana-validator');
  assert.equal(solana.metadata.runtimePins.validator[1], selectedBinarySHA256, 'OWNED_RUNTIME_MEMORY_SELECTED_BINARY_MISMATCH');
  report.resourceProfile.actualBinaryRelativePath = solana.metadata.runtimePins.validator[0];
  report.resourceProfile.actualBinarySHA256 = solana.metadata.runtimePins.validator[1];
  report.resourceProfile.sourceCommit = solana.metadata.sourceCommit;
  report.resourceProfile.sourcePatchSHA256 = solana.metadata.sourcePatchSHA256;
  report.resourceProfile.patchManifestSHA256 = solana.metadata.patchManifestSHA256;
  if (boundedLedgerProfile) {
    assert.equal(solana.metadata.resourceProfile?.name, profileName, 'OWNED_RUNTIME_MEMORY_SELECTED_PROFILE_MISMATCH');
    assert.equal(solana.metadata.patchManifestSHA256, profileManifestSHA256, 'OWNED_RUNTIME_MEMORY_RUNTIME_PROVENANCE_MISMATCH');
  }
  idleStart = performance.now();
  sample('ALL_RUNTIMES_READY'); requireResources();
  assert.equal(solana.metadata.ledgerRetention.effectiveShreds, 1000000);
  assert.equal(solana.metadata.slotTiming.effectiveTicksPerSlot, 64);
  for (let index = 1; index <= durationMs / sampleIntervalMs; index++) {
    const target = idleStart + index * sampleIntervalMs;
    while (performance.now() < target) { await sleep(Math.min(1000, target - performance.now())); requireResources(); }
    const value = sample(`IDLE_${index * sampleIntervalMs / 1000}_SECONDS`);
    assert.equal(value.liveChildCount, 3, 'OWNED_RUNTIME_MEMORY_RUNTIME_EXITED');
    assert.equal(solana.metadata.periodicSocketAudit.failure, null, 'OWNED_RUNTIME_MEMORY_ISOLATION_FAILURE');
  }
  report.observedIdleDurationMs = Math.round(performance.now() - idleStart);
  report.solanaIsolationChecks = solana.metadata.periodicSocketAudit.completedChecks;
  report.noSolanaTransfers = solana.transfers.length === 0;
  assert.equal(report.noSolanaTransfers, true);
  report.phase = 'OBSERVATION_COMPLETE';
} catch (error) {
  report.phase = 'FAILED'; report.failureCode = safeError(error); process.exitCode = 1;
  if (error.cleanup) report.startupFailureCleanup = { ownedProcessStopped: error.cleanup.ownedProcessStopped, syntheticKeysAndLedgerRemoved: error.cleanup.syntheticKeysAndLedgerRemoved, forced: error.cleanup.forced };
} finally {
  shuttingDown = true; clearInterval(guardTimer);
  sample('BEFORE_EXACT_OWNED_CLEANUP');
  report.cleanup = await closeOwned();
  const closed = sample('AFTER_EXACT_OWNED_CLEANUP');
  await sleep(5000);
  const settled = sample('AFTER_CLEANUP_5_SECONDS');
  report.exactOwnedPidsAllExited = closed.liveChildCount === 0 && settled.liveChildCount === 0;
  if (!report.exactOwnedPidsAllExited || report.cleanup.solanaFailure || report.cleanup.nativeFailure) {
    report.phase = 'FAILED_CLEANUP'; process.exitCode = 1;
  }
  for (const file of sources) report.sourcesAfter[file] = sha(await readFile(join(projectRoot, file)));
  report.sourcesUnchanged = JSON.stringify(report.sourcesBefore) === JSON.stringify(report.sourcesAfter);
  if (!report.sourcesUnchanged) { report.phase = 'FAILED_SOURCE_CHECK'; process.exitCode = 1; }
  if (guardFailure) { report.resourceOrInterruptFailure = safeError(guardFailure); report.phase = 'FAILED_GUARD_OR_INTERRUPT'; process.exitCode = 1; }
  const ready = report.samples.find(s => s.stage === 'ALL_RUNTIMES_READY');
  const idle = report.samples.filter(s => s.stage.startsWith('IDLE_'));
  const last = idle.at(-1);
  report.summary = {
    minimumObservedMemAvailableBytes: Math.min(report.minimumGuardMemAvailableBytes ?? Infinity, ...report.samples.map(s => s.memAvailableBytes)),
    minimumObservedFreeDiskBytes: Math.min(report.minimumGuardFreeDiskBytes ?? Infinity, ...report.samples.map(s => s.freeDiskBytes)),
    maximumObservedChildRSSBytes: Math.max(...report.samples.map(s => s.childRSSBytes)),
    maximumObservedChildPSSBytes: Math.max(...report.samples.map(s => s.childPSSBytes)),
    maximumObservedChildPrivateBytes: Math.max(...report.samples.map(s => s.childPrivateBytes)),
    baselineMemAvailableBytes: report.samples[0].memAvailableBytes,
    cleanup5sMemAvailableBytes: settled.memAvailableBytes,
    idleSamples: idle.length,
    roleGrowth: ready && last ? ready.children.map(first => {
      const final = last.children.find(c => c.role === first.role);
      return { role: first.role, firstRSSBytes: first.rssBytes, lastRSSBytes: final.rssBytes,
        rssGrowthBytes: final.rssBytes - first.rssBytes, pssGrowthBytes: final.pssBytes - first.pssBytes,
        privateGrowthBytes: final.privateBytes - first.privateBytes,
        anonymousGrowthBytes: final.anonymousBytes - first.anonymousBytes };
    }) : [],
  };
  report.completedAt = new Date().toISOString(); report.totalElapsedMs = Math.round(performance.now() - start);
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  const encoded = JSON.stringify(report, null, 2) + '\n';
  await writeFile(evidencePath, encoded, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ phase: report.phase, evidencePath: relative(projectRoot, evidencePath), evidenceSHA256: sha(encoded), sourcesUnchanged: report.sourcesUnchanged, exactOwnedPidsAllExited: report.exactOwnedPidsAllExited, summary: report.summary }));
}
