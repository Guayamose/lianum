/** Fixed, opt-in Linux hash-conformance supervisor. Preparing this source does
 * not run conformance. Run from the canonical repository root with no arguments.
 * Only built-ins are imported; no compiler, backend or runtime loads here.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync,
  statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// One monotonic origin. Initialization, worker work, cleanup and evidence all
// consume this same budget; neither a phase change nor a signal resets it.
const START = process.hrtime.bigint();
const STARTED_AT = new Date().toISOString();
const elapsed = () => Number(process.hrtime.bigint() - START) / 1e6;
const REPOSITORY = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SCRIPT = join(REPOSITORY, 'flat-wallet/scripts/run-hash-conformance.mjs');
const WORKER = join(REPOSITORY, 'flat-wallet/scripts/hash-conformance.mjs');
const LOCAL = join(REPOSITORY, 'flat-wallet/.local/hash-conformance');
const ATTEMPT = join(LOCAL, `attempt-${process.pid}`);
const LOCK = join(LOCAL, 'active.lock');
const REPORT = join(ATTEMPT, 'resources.json');
const RESULT = join(ATTEMPT, 'result.json');
const CLEAN_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' });
const LIMITS = Object.freeze({ minimumAvailableRAMBytes: 2684354560,
  minimumFreeDiskBytes: 5368709120, maximumOwnedGroupRSSBytes: 3221225472,
  sampleMilliseconds: 250, totalMilliseconds: 600000,
  cleanupReserveMilliseconds: 10000, killGraceMilliseconds: 5000,
  maximumOutputBytes: 1048576, maximumResultBytes: 1048576 });
const streams = {
  stdout: { bytes: 0, hash: createHash('sha256') },
  stderr: { bytes: 0, hash: createHash('sha256') },
};
let child, report, lockIdentity, workerIdentity, monitorTimer, reserveTimer, hardTimer, killTimer;
let attemptCreated = false, childExited = false, childClosed = false, groupGone = false;
let groupOwnershipLost = false, finalGroupMeasurementSucceeded = false;
let finishing = false, finished = false, stopping = false, termAt = null;
let failure = null, resolveCompletion;
const completion = new Promise(resolvePromise => { resolveCompletion = resolvePromise; });

function codeOf(error) {
  return typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
    ? error.code : 'UNCLASSIFIED_ERROR';
}
function assertionCode(error) {
  return typeof error?.message === 'string' && /^HASH_[A-Z0-9_]{1,100}$/.test(error.message)
    ? error.message : 'HASH_SUPERVISOR_ERROR';
}
function checkedInteger(value) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, 'HASH_RESOURCE_INTEGER');
  return value;
}
function readRegular(path, maximumBytes) {
  assert.equal(realpathSync(path), resolve(path), 'HASH_FILE_SYMLINK');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    assert.ok(stat.isFile() && stat.size <= maximumBytes, 'HASH_REGULAR_FILE_SIZE');
    const data = readFileSync(fd);
    assert.ok(data.length <= maximumBytes, 'HASH_REGULAR_FILE_SIZE');
    return data;
  } finally { closeSync(fd); }
}
function ensureOutputDirectory(path) {
  assert.ok(path === join(REPOSITORY, 'flat-wallet/.local') || path === LOCAL
    || path === ATTEMPT, 'HASH_FIXED_OUTPUT_DIRECTORY');
  const missing = [];
  let ancestor = path;
  while (!existsSync(ancestor)) { missing.push(ancestor); ancestor = dirname(ancestor); }
  assert.equal(realpathSync(ancestor), ancestor, 'HASH_OUTPUT_ANCESTOR_SYMLINK');
  assert.ok(lstatSync(ancestor).isDirectory(), 'HASH_OUTPUT_ANCESTOR_DIRECTORY');
  for (const directory of missing.reverse()) mkdirSync(directory, { mode: 0o700 });
  assert.equal(realpathSync(path), path, 'HASH_OUTPUT_DIRECTORY_SYMLINK');
  assert.ok(lstatSync(path).isDirectory(), 'HASH_OUTPUT_DIRECTORY');
}
function writeExclusive(path, data) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, data); fsyncSync(fd); return fstatSync(fd); }
  finally { closeSync(fd); }
}
function save() {
  if (!report || !attemptCreated) return;
  if (existsSync(REPORT)) readRegular(REPORT, 1048576);
  const temporary = join(ATTEMPT, `resources.tmp-${process.pid}`);
  writeExclusive(temporary, JSON.stringify(report, null, 2) + '\n');
  renameSync(temporary, REPORT);
}
function bestEffortSave() {
  try { save(); return true; }
  catch (error) {
    fail('HASH_EVIDENCE_WRITE_FAILURE', { errorCode: codeOf(error) });
    if (report) report.evidenceWriteFailure = codeOf(error);
    return false;
  }
}
function fail(code, details = {}) {
  failure ??= code;
  if (!report) return;
  report.failure = failure;
  if (!report.failures.some(entry => entry.code === code))
    report.failures.push({ code, at: new Date().toISOString(), elapsedMilliseconds: elapsed(), ...details });
}

// /proc is used only for measurements and group-ownership checks. Never signal a
// PID discovered here. All signals below address only -child.pid from spawn().
function procStat(pid) {
  let value;
  try { value = readFileSync(`/proc/${pid}/stat`, 'utf8'); }
  catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return null; throw error; }
  const end = value.lastIndexOf(') ');
  assert.ok(end > 0 && value.slice(0, value.indexOf(' ')) === String(pid), 'HASH_PROC_STAT');
  const fields = value.slice(end + 2).trim().split(/\s+/);
  assert.ok(fields.length >= 22 && /^[RSDZTWXIKPt]$/.test(fields[0]), 'HASH_PROC_STAT_FIELDS');
  const pgrp = Number(fields[2]), session = Number(fields[3]), startTimeTicks = fields[19];
  // Unrelated kernel processes may have group/session zero. Only owned members
  // must have group/session equal to the child PID.
  assert.ok(Number.isSafeInteger(pgrp) && pgrp >= 0 && Number.isSafeInteger(session)
    && session >= 0 && /^\d+$/.test(startTimeTicks), 'HASH_PROC_IDENTITY');
  return { pid, state: fields[0], pgrp, session, startTimeTicks };
}
function groupResources() {
  if (!child?.pid || groupGone) return { rssBytes: 0, liveCount: 0, processes: [] };
  const pgid = child.pid;
  assert.ok(Number.isSafeInteger(pgid) && pgid > 1 && pgid !== process.pid, 'HASH_OWNED_GROUP_ID');
  const processes = [];
  for (const entry of readdirSync('/proc')) {
    if (!/^[1-9]\d*$/.test(entry)) continue;
    const stat = procStat(Number(entry));
    if (!stat || stat.pgrp !== pgid) continue;
    if (stat.session !== pgid) groupOwnershipLost = true;
    assert.equal(stat.session, pgid, 'HASH_GROUP_SESSION_CHANGED');
    if (stat.pid === pgid) {
      if (workerIdentity && stat.startTimeTicks !== workerIdentity.startTimeTicks) groupOwnershipLost = true;
      if (workerIdentity) assert.equal(stat.startTimeTicks, workerIdentity.startTimeTicks, 'HASH_WORKER_PID_REUSED');
      else workerIdentity = stat;
    }
    let status;
    try { status = readFileSync(`/proc/${stat.pid}/status`, 'utf8'); }
    catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) continue; throw error; }
    // Confirm identity after reading RSS so PID reuse cannot mix measurements.
    const after = procStat(stat.pid);
    if (!after) continue;
    assert.ok(after.startTimeTicks === stat.startTimeTicks && after.pgrp === pgid
      && after.session === pgid, 'HASH_MEASURED_PROCESS_CHANGED');
    const rss = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
    assert.ok(rss || /^[ZX]$/.test(after.state), 'HASH_OWNED_RSS_UNAVAILABLE');
    processes.push({ pid: stat.pid, state: after.state, startTimeTicks: stat.startTimeTicks,
      rssBytes: checkedInteger(rss ? Number(rss[1]) * 1024 : 0) });
  }
  processes.sort((a, b) => a.pid - b.pid);
  // A /proc enumeration can race a fork/exit. Confirm absence against only the
  // owned group; signal 0 never targets a discovered PID or terminates anything.
  // Once absence is established, never adopt a reused numeric group.
  if (processes.length === 0) {
    let absent = false;
    try { process.kill(-pgid, 0); }
    catch (error) { if (error.code === 'ESRCH') absent = true; else throw error; }
    assert.ok(absent, 'HASH_GROUP_MEMBERSHIP_SCAN_INCOMPLETE');
    groupGone = true;
  }
  return { rssBytes: checkedInteger(processes.reduce((sum, item) => sum + item.rssBytes, 0)),
    liveCount: processes.filter(item => !/^[ZX]$/.test(item.state)).length, processes };
}
function resources() {
  const memory = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'));
  assert.ok(memory, 'HASH_MEMAVAILABLE_UNAVAILABLE');
  const disk = statfsSync(REPOSITORY, { bigint: true });
  const diskBytes = disk.bavail * disk.bsize;
  assert.ok(diskBytes <= BigInt(Number.MAX_SAFE_INTEGER), 'HASH_DISK_MEASUREMENT_RANGE');
  const group = groupResources();
  return { at: new Date().toISOString(), elapsedMilliseconds: elapsed(),
    availableRAMBytes: checkedInteger(Number(memory[1]) * 1024),
    freeDiskBytes: checkedInteger(Number(diskBytes)), ownedGroupRSSBytes: group.rssBytes,
    ownedGroupLiveCount: group.liveCount, ownedProcesses: group.processes };
}
function recordSample(sample) {
  report.samples += 1;
  report.latestResources = sample;
  for (const key of ['availableRAMBytes', 'freeDiskBytes', 'ownedGroupRSSBytes']) {
    report.resourceSummary[key].minimum = Math.min(report.resourceSummary[key].minimum, sample[key]);
    report.resourceSummary[key].maximum = Math.max(report.resourceSummary[key].maximum, sample[key]);
  }
  report.peakOwnedGroupLiveCount = Math.max(report.peakOwnedGroupLiveCount, sample.ownedGroupLiveCount);
}
function resourceFailure(sample) {
  if (sample.availableRAMBytes < LIMITS.minimumAvailableRAMBytes) return 'HASH_MEMAVAILABLE_FLOOR';
  if (sample.freeDiskBytes < LIMITS.minimumFreeDiskBytes) return 'HASH_DISK_FLOOR';
  if (sample.ownedGroupRSSBytes > LIMITS.maximumOwnedGroupRSSBytes) return 'HASH_OWNED_GROUP_RSS_LIMIT';
  return null;
}
function signalOwnedGroup(signal) {
  if (!child?.pid || groupGone || groupOwnershipLost) return;
  try {
    const leader = procStat(child.pid);
    if (leader && (leader.pgrp !== child.pid || leader.session !== child.pid
      || (workerIdentity && leader.startTimeTicks !== workerIdentity.startTimeTicks))) {
      groupOwnershipLost = true;
      fail('HASH_SIGNAL_OWNERSHIP_LOST'); bestEffortSave(); return;
    }
    if (leader) workerIdentity ??= leader;
  } catch (error) {
    fail('HASH_SIGNAL_IDENTITY_CHECK_FAILURE', { errorCode: codeOf(error) });
    // The original spawn-owned group remains the sole allowable target. Never
    // replace it with any group or PID discovered by a failed resource read.
  }
  const event = { signal, at: new Date().toISOString(), elapsedMilliseconds: elapsed(), group: child.pid };
  report.groupSignals.push(event);
  // Persist the triggering sample and signal intent before any group signal.
  bestEffortSave();
  try {
    if (signal === 'SIGTERM' && termAt === null) termAt = elapsed();
    process.kill(-child.pid, signal); event.sent = true;
  }
  catch (error) {
    event.sent = false; event.errorCode = codeOf(error);
    if (error.code === 'ESRCH') groupGone = true;
    else fail('HASH_OWNED_GROUP_SIGNAL_FAILURE', { signal, errorCode: codeOf(error) });
  }
  bestEffortSave();
}
function stop(code, details = {}, measuredSample) {
  fail(code, details);
  if (finished || stopping) { bestEffortSave(); return; }
  stopping = true;
  report.phase = 'stopping';
  // For every first stop, capture actual current resources BEFORE SIGTERM. A
  // failed measurement is explicit; an earlier sample is never relabeled fresh.
  try {
    const sample = measuredSample ?? resources();
    if (!measuredSample) recordSample(sample);
    report.failureResourceSample = sample;
  } catch (error) { report.failureSampleError = { code: codeOf(error), classification: assertionCode(error) }; }
  bestEffortSave();
  signalOwnedGroup('SIGTERM');
  killTimer = setTimeout(() => {
    if (finished || groupGone || termAt === null) return;
    // The grace period is measured from the actual first SIGTERM attempt.
    const remaining = LIMITS.killGraceMilliseconds - (elapsed() - termAt);
    if (remaining > 0) { killTimer = setTimeout(escalate, remaining); return; }
    escalate();
  }, LIMITS.killGraceMilliseconds);
}
function escalate() {
  if (finished || groupGone || termAt === null) return;
  if (elapsed() - termAt < LIMITS.killGraceMilliseconds) {
    killTimer = setTimeout(escalate, LIMITS.killGraceMilliseconds - (elapsed() - termAt)); return;
  }
  try { const sample = resources(); recordSample(sample); report.escalationResourceSample = sample; }
  catch (error) { report.escalationSampleError = codeOf(error); }
  signalOwnedGroup('SIGKILL');
}
function poll() {
  if (finished) return;
  try {
    const sample = resources(); recordSample(sample);
    const reason = resourceFailure(sample);
    if (reason) stop(reason, {}, sample);
    else if (!bestEffortSave()) stop('HASH_EVIDENCE_WRITE_FAILURE', {}, sample);
    if (childClosed && sample.ownedGroupLiveCount > 0)
      stop('HASH_WORKER_CLOSED_WITH_LIVE_OWNED_PROCESSES', {}, sample);
    if (childClosed && sample.ownedGroupLiveCount === 0) resolveCompletion();
  } catch (error) {
    stop('HASH_RESOURCE_MONITOR_FAILURE', { errorCode: codeOf(error), classification: assertionCode(error) });
  }
}
function releaseLock() {
  if (!lockIdentity) return;
  // Leave an active lock in place if termination or group measurement is
  // unresolved. No invocation ever takes over a stale lock automatically.
  if (child?.pid && (!childClosed || !finalGroupMeasurementSucceeded
    || report?.finalResources?.ownedGroupLiveCount !== 0 || groupOwnershipLost)) {
    report.lockRetained = true; return;
  }
  try {
    const stat = lstatSync(LOCK);
    assert.ok(stat.isFile() && stat.dev === lockIdentity.dev && stat.ino === lockIdentity.ino,
      'HASH_LOCK_IDENTITY_CHANGED');
    const value = JSON.parse(readRegular(LOCK, 4096));
    assert.equal(value.pid, process.pid, 'HASH_LOCK_OWNER_CHANGED');
    unlinkSync(LOCK); lockIdentity = null;
    if (report) report.lockReleased = true;
  } catch (error) {
    fail('HASH_LOCK_RELEASE_FAILURE', { errorCode: codeOf(error) });
    if (report) report.lockRetained = true;
  }
}
function validateWorkerResult() {
  const bytes = readRegular(RESULT, LIMITS.maximumResultBytes);
  const result = JSON.parse(bytes);
  // Only a strict allowlisted projection enters supervisor evidence. Worker
  // output is not copied here, even if it contains unexpected diagnostics.
  assert.equal(result.format, 'FLAT_WALLET_HASH_CONFORMANCE_V1', 'HASH_RESULT_FORMAT');
  assert.equal(result.classification, 'HASH_CONFORMANCE_SUCCESS', 'HASH_RESULT_CLASSIFICATION');
  assert.equal(result.success, true, 'HASH_RESULT_SUCCESS');
  assert.equal(result.supervisor?.supervisorPID, process.pid, 'HASH_RESULT_SUPERVISOR_BINDING');
  assert.equal(result.supervisor?.workerPID, child.pid, 'HASH_RESULT_WORKER_BINDING');
  assert.equal(result.cleanup?.closedAnvil, true, 'HASH_RESULT_ANVIL_NOT_CLOSED');
  const exit = result.cleanup.anvilExit;
  assert.equal(exit?.exitObserved, true, 'HASH_RESULT_ANVIL_EXIT_NOT_OBSERVED');
  assert.equal(exit.stopped, true, 'HASH_RESULT_ANVIL_NOT_STOPPED');
  assert.equal(exit.spawnErrorCode, null, 'HASH_RESULT_ANVIL_SPAWN_ERROR');
  assert.ok(Number.isSafeInteger(exit.pid) && exit.pid > 1 && exit.pid !== child.pid,
    'HASH_RESULT_ANVIL_PID');
  assert.ok((exit.exitCode === 0 && exit.signal === null)
    || (exit.exitCode === null && exit.signal === 'SIGTERM'), 'HASH_RESULT_ANVIL_EXIT_STATUS');
  assert.equal(exit.scratchRemoved, false, 'HASH_RESULT_ANVIL_SCRATCH_NOT_RETAINED');
  report.workerResult = { path: relative(REPOSITORY, RESULT).split(sep).join('/'),
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    format: result.format, classification: result.classification, success: true,
    cleanup: { closedAnvil: true, anvilExit: { pid: exit.pid, exitObserved: true,
      stopped: true, spawnErrorCode: null, exitCode: exit.exitCode,
      signal: exit.signal, scratchRemoved: false } } };
}
function finalize(deadline = false) {
  if (finishing || finished) return;
  finishing = true;
  clearInterval(monitorTimer); clearTimeout(reserveTimer); clearTimeout(hardTimer); clearTimeout(killTimer);
  if (deadline) {
    fail('HASH_TOTAL_DEADLINE', { totalMilliseconds: LIMITS.totalMilliseconds });
    try { const sample = resources(); recordSample(sample); report.deadlineResourceSample = sample; }
    catch (error) { if (report) report.deadlineSampleError = codeOf(error); }
    // Normally the 10-second reserve already sent TERM and KILL. Never shorten
    // the promised 5-second grace merely because the deadline has arrived.
    if (termAt !== null && elapsed() - termAt >= LIMITS.killGraceMilliseconds) signalOwnedGroup('SIGKILL');
  }
  if (report) {
    try {
      const sample = resources(); recordSample(sample); report.finalResources = sample;
      finalGroupMeasurementSucceeded = true;
      const reason = resourceFailure(sample);
      if (reason) fail(reason, { sample });
    } catch (error) { fail('HASH_FINAL_RESOURCE_MEASUREMENT_FAILURE', { errorCode: codeOf(error) }); }
    if (!childExited || !childClosed) fail('HASH_WORKER_EXIT_OR_CLOSE_NOT_OBSERVED');
    if (childExited && (report.workerExit.code !== 0 || report.workerExit.signal !== null))
      fail('HASH_WORKER_EXIT_FAILURE');
    if (childClosed && (report.workerClose.code !== 0 || report.workerClose.signal !== null))
      fail('HASH_WORKER_CLOSE_FAILURE');
    if (!finalGroupMeasurementSucceeded || report.finalResources.ownedGroupLiveCount !== 0
      || groupOwnershipLost) fail('HASH_OWNED_GROUP_CLEANUP_UNCONFIRMED');
    if (!failure) {
      try { validateWorkerResult(); }
      catch (error) { fail('HASH_WORKER_RESULT_REJECTED', { errorCode: codeOf(error), classification: assertionCode(error) }); }
    }
    report.output = Object.fromEntries(Object.entries(streams).map(([name, value]) =>
      [name, { bytes: value.bytes, sha256: value.hash.copy().digest('hex') }]));
    report.outputBytes = streams.stdout.bytes + streams.stderr.bytes;
    report.workerExitObserved = childExited; report.workerCloseObserved = childClosed;
    releaseLock();
    report.phase = failure ? 'failed' : 'completed';
    report.failure = failure; report.completedAt = new Date().toISOString();
    report.elapsedMilliseconds = elapsed();
    report.withinTotalDeadline = report.elapsedMilliseconds < LIMITS.totalMilliseconds;
    if (!report.withinTotalDeadline) { fail('HASH_TOTAL_DEADLINE'); report.phase = 'failed'; }
    report.normalAnvilCleanupEvidenced = !failure && report.workerResult?.cleanup.closedAnvil === true;
    bestEffortSave();
    // Evidence I/O consumes the deadline too. Never return success merely
    // because the final resource sample preceded a slow final write.
    if (elapsed() >= LIMITS.totalMilliseconds) {
      fail('HASH_TOTAL_DEADLINE'); report.phase = 'failed'; report.withinTotalDeadline = false;
      report.normalAnvilCleanupEvidenced = false; bestEffortSave();
    }
    if (failure) { report.phase = 'failed'; report.normalAnvilCleanupEvidenced = false; }
  } else releaseLock();
  finished = true;
  process.exitCode = failure ? 1 : 0;
  // A single sanitized summary, never stdout/stderr from the worker or a raw
  // thrown message, account, key, endpoint, RPC payload or environment value.
  console.log(JSON.stringify({ phase: report?.phase ?? 'failed', failure: failure ?? null,
    result: report?.resultPath ?? null, resultAccepted: Boolean(report?.workerResult),
    report: attemptCreated ? relative(REPOSITORY, REPORT).split(sep).join('/') : null,
    workerExit: report?.workerExit ?? null, workerClose: report?.workerClose ?? null,
    outputBytes: report?.outputBytes ?? 0, resourceSummary: report?.resourceSummary ?? null }));
  if (deadline) process.exit(1);
}

try {
  assert.equal(process.platform, 'linux', 'HASH_LINUX_ONLY');
  assert.equal(process.argv.length, 2, 'HASH_NO_CALLER_ARGUMENTS');
  assert.equal(process.execArgv.length, 0, 'HASH_NO_NODE_ARGUMENTS');
  assert.ok(!process.env.NODE_OPTIONS, 'HASH_NO_NODE_OPTIONS');
  assert.equal(realpathSync(REPOSITORY), REPOSITORY, 'HASH_REPOSITORY_SYMLINK');
  assert.equal(realpathSync(process.cwd()), REPOSITORY, 'HASH_REPOSITORY_CWD_REQUIRED');
  assert.equal(resolve(process.argv[1]), SCRIPT, 'HASH_EXACT_SUPERVISOR_SCRIPT');
  assert.equal(realpathSync(SCRIPT), SCRIPT, 'HASH_SUPERVISOR_SYMLINK');
  assert.equal(realpathSync(WORKER), WORKER, 'HASH_WORKER_SYMLINK');
  ensureOutputDirectory(LOCAL);
  lockIdentity = writeExclusive(LOCK, JSON.stringify({ format: 'FLAT_WALLET_HASH_CONFORMANCE_LOCK_V1',
    pid: process.pid, startedAt: STARTED_AT, supervisorStartTimeTicks: procStat(process.pid).startTimeTicks }) + '\n');
  assert.equal(existsSync(ATTEMPT), false, 'HASH_ATTEMPT_ALREADY_EXISTS');
  ensureOutputDirectory(ATTEMPT); attemptCreated = true;
  report = { format: 'FLAT_WALLET_HASH_RESOURCE_REPORT_V1',
    classification: 'BOUNDED_HASH_CONFORMANCE_ONLY', phase: 'preflight',
    startedAt: STARTED_AT, limits: LIMITS, supervisorPID: process.pid,
    node: process.version, environment: CLEAN_ENV, detachedWorker: true,
    timeoutScope: 'one immutable budget including initialization, worker, termination and evidence',
    hostLimitsChanged: false, samples: 0, peakOwnedGroupLiveCount: 0,
    resourceSummary: Object.fromEntries(['availableRAMBytes', 'freeDiskBytes', 'ownedGroupRSSBytes']
      .map(key => [key, { minimum: Number.MAX_SAFE_INTEGER, maximum: 0 }])),
    failures: [], groupSignals: [], sourceArtifacts: [],
    outputPolicy: 'count and SHA256 only; raw worker stdout/stderr are never saved or forwarded',
    resultPath: relative(REPOSITORY, RESULT).split(sep).join('/'),
  };
  report.sourceArtifacts = [SCRIPT, WORKER].map(path => {
      const bytes = readRegular(path, 1048576);
      return { path: relative(REPOSITORY, path).split(sep).join('/'), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') };
    });
  // Deadlines are absolute offsets from START, including the setup above.
  hardTimer = setTimeout(() => finalize(true), Math.max(0, LIMITS.totalMilliseconds - elapsed()));
  reserveTimer = setTimeout(() => stop('HASH_DEADLINE_CLEANUP_RESERVE'),
    Math.max(0, LIMITS.totalMilliseconds - LIMITS.cleanupReserveMilliseconds - elapsed()));
  const initial = resources(); recordSample(initial); report.initialResources = initial;
  const initialFailure = resourceFailure(initial);
  if (initialFailure) { report.failureResourceSample = initial; fail(initialFailure); }
  assert.ok(elapsed() < LIMITS.totalMilliseconds - LIMITS.cleanupReserveMilliseconds, 'HASH_INITIALIZATION_DEADLINE');
  save();
  if (!failure) {
    report.phase = 'starting'; save();
    assert.ok(elapsed() < LIMITS.totalMilliseconds - LIMITS.cleanupReserveMilliseconds,
      'HASH_INITIALIZATION_DEADLINE');
    // Linux detached:true establishes a new session/process group. Golden
    // createLocalEvm starts Anvil non-detached, so it shares this owned group.
    // No caller arguments, caller URL, PATH overrides or environment propagate.
    child = spawn(process.execPath, [WORKER], { cwd: REPOSITORY, env: CLEAN_ENV,
      detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.once('error', error => stop('HASH_WORKER_PROCESS_ERROR', { errorCode: codeOf(error) }));
    child.once('exit', (code, signal) => {
      childExited = true; report.workerExit = { code, signal, elapsedMilliseconds: elapsed() };
      if (code !== 0 || signal !== null) stop('HASH_WORKER_EXIT_FAILURE');
    });
    child.once('close', (code, signal) => {
      childClosed = true; report.workerClose = { code, signal, elapsedMilliseconds: elapsed() };
      if (code !== 0 || signal !== null) stop('HASH_WORKER_CLOSE_FAILURE');
      poll();
    });
    child.once('spawn', () => { report.workerPID = child.pid; report.ownedProcessGroup = child.pid; report.phase = 'running'; poll(); });
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
      stream.on('data', bytes => {
        streams[name].bytes += bytes.length; streams[name].hash.update(bytes);
        report.outputBytes = streams.stdout.bytes + streams.stderr.bytes;
        if (report.outputBytes > LIMITS.maximumOutputBytes) stop('HASH_WORKER_OUTPUT_LIMIT', { observedBytes: report.outputBytes });
      });
      stream.once('error', error => stop('HASH_WORKER_OUTPUT_ERROR', { stream: name, errorCode: codeOf(error) }));
    }
    process.on('SIGTERM', () => stop('HASH_SUPERVISOR_SIGTERM'));
    process.on('SIGINT', () => stop('HASH_SUPERVISOR_SIGINT'));
    process.on('uncaughtException', error => stop('HASH_SUPERVISOR_UNCAUGHT_EXCEPTION',
      { errorCode: codeOf(error), classification: assertionCode(error) }));
    process.on('unhandledRejection', error => stop('HASH_SUPERVISOR_UNHANDLED_REJECTION',
      { errorCode: codeOf(error), classification: assertionCode(error) }));
    monitorTimer = setInterval(poll, LIMITS.sampleMilliseconds);
    await completion;
  }
} catch (error) {
  fail(assertionCode(error), { errorCode: codeOf(error) });
  if (child?.pid && !childClosed) {
    stop('HASH_SUPERVISOR_FAILURE', { errorCode: codeOf(error) });
    await completion;
  }
} finally {
  finalize();
}
