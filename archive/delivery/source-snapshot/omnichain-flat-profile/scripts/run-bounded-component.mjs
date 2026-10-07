/** One owned child, one fixed mode, external 250 ms resource supervision.
 * Run each mode separately. This script never changes host resource limits. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, LOCAL, LIMITS, DISCLOSURE, modeFromArguments, ensureDirectory,
  fixedAttempt, regular, resources, resourceFailure, replaceJSON, writeNew } from '../src/component-tooling.mjs';

let mode, attempt, report, child, interval, timeout, killTimer;
let closed = false, stopping = false, failure = null, lockOwned = false, outputBytes = 0;
let exitHandler, signalHandler;
let preflightError = null;
const lockPath = join(LOCAL, 'active.lock');
function save() { replaceJSON(join(attempt, 'resources.json'), report); }
function recordFailure(code, details = {}) {
  failure ??= code;
  report.failure = failure;
  report.failures.push({ code, at: new Date().toISOString(), ...details });
}
function stop(code, details = {}) {
  if (closed || stopping) return;
  stopping = true;
  recordFailure(code, details);
  // The exact failed sample and reason are written BEFORE the first signal.
  // If storage itself has failed, stopping the owned child remains mandatory.
  try { save(); } catch (error) {
    report.reportWriteFailure = { name: error.name, code: error.code ?? null };
  }
  if (!child?.pid) return;
  try { child.kill('SIGTERM'); } catch (error) { report.termError = error.code ?? error.name; }
  killTimer ??= setTimeout(() => {
    if (!closed) {
      report.escalatedToSIGKILLAt = new Date().toISOString();
      try { save(); } catch { /* already failing: still stop only this child */ }
      try { child.kill('SIGKILL'); } catch { /* close remains the source of exit status */ }
    }
  }, LIMITS.killGraceMilliseconds);
}
function sample() {
  if (closed) return;
  try {
    const current = resources(child?.pid);
    report.samples += 1;
    report.latestResources = current;
    report.minimumAvailableRAM = Math.min(report.minimumAvailableRAM, current.availableRAM);
    report.minimumFreeDisk = Math.min(report.minimumFreeDisk, current.freeDisk);
    report.peakWorkerRSS = Math.max(report.peakWorkerRSS, current.workerRSS);
    const reason = resourceFailure(current);
    if (reason) {
      report.failedResourceSample ??= current;
      stop(reason, { sample: current });
    } else save();
  } catch (error) {
    stop('RESOURCE_MONITOR_OR_REPORT_WRITE_FAILURE', { error: { name: error.name, code: error.code ?? null } });
  }
}
function cleanup() {
  clearInterval(interval); clearTimeout(timeout); clearTimeout(killTimer);
  if (exitHandler) process.removeListener('exit', exitHandler);
  if (signalHandler) {
    process.removeListener('SIGTERM', signalHandler);
    process.removeListener('SIGINT', signalHandler);
  }
  for (const stream of child?.stdio ?? []) stream?.destroy();
  if (lockOwned) {
    try {
      const lock = JSON.parse(regular(lockPath));
      if (lock.pid === process.pid && lock.mode === mode) unlinkSync(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT' && report) report.lockCleanupError = error.code ?? error.name;
    }
    lockOwned = false;
  }
}
try {
  mode = modeFromArguments();
  ensureDirectory(LOCAL);
  // No automatic stale-lock removal, retry, overlapping run or orphan takeover.
  writeNew(lockPath, JSON.stringify({ pid: process.pid, mode, startedAt: new Date().toISOString() }) + '\n');
  lockOwned = true;
  attempt = fixedAttempt(mode);
  assert.equal(existsSync(attempt), false, 'FLAT_ATTEMPT_HISTORY_ALREADY_EXISTS');
  ensureDirectory(attempt);
  report = { format: 'FLAT_COMPONENT_EXTERNAL_RESOURCE_REPORT_V1', mode,
    classification: 'BOUNDED_SINGLE_FLAT_COMPONENT_EXPERIMENT', disclosure: DISCLOSURE,
    startedAt: new Date().toISOString(), phase: 'preflight', node: process.version,
    limits: LIMITS, hostLimitsChanged: false, environment: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    samples: 0, failures: [], peakWorkerRSS: 0, outputBytes: 0,
    minimumAvailableRAM: Number.MAX_SAFE_INTEGER, minimumFreeDisk: Number.MAX_SAFE_INTEGER,
    timeoutScope: 'entire single mode, including all initialization and cleanup; never reset',
  };
  const initial = resources();
  report.initialResources = initial;
  report.minimumAvailableRAM = initial.availableRAM;
  report.minimumFreeDisk = initial.freeDisk;
  const initialFailure = resourceFailure(initial);
  if (initialFailure) {
    report.failedResourceSample = initial;
    recordFailure(initialFailure, { sample: initial });
    report.phase = 'failed';
    save();
    process.exitCode = 1;
  } else {
    report.phase = 'starting'; save();
    const args = [join(ROOT, 'scripts/component-worker.mjs'), mode];
    report.childExecutable = process.execPath; report.childArguments = args;
    const began = performance.now();
    // Register close/error handlers in the same synchronous turn as spawn.
    // In particular, do not sample, await, or handle a spawn error before a
    // close listener exists: failed spawns still emit close asynchronously.
    let resolveClosed;
    const completion = new Promise(resolve => { resolveClosed = resolve; });
    child = spawn(process.execPath, args, { cwd: ROOT,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.once('close', (code, signal) => {
      closed = true;
      clearInterval(interval); clearTimeout(timeout); clearTimeout(killTimer);
      if ((code !== 0 || signal !== null) && failure === null)
        recordFailure('WORKER_EXIT_FAILURE', { code, signal });
      report.exitCode = code; report.signal = signal;
      report.elapsedMilliseconds = performance.now() - began;
      report.phase = code === 0 && failure === null ? 'completed' : 'failed';
      report.completedAt = new Date().toISOString();
      try { report.finalResources = resources(); save(); } catch (error) {
        recordFailure('FINAL_RESOURCE_OR_REPORT_WRITE_FAILURE', { error: error.code ?? error.name });
        report.phase = 'failed';
      }
      resolveClosed();
    });
    child.once('error', error => stop('SPAWN_OR_CHILD_PROCESS_ERROR', { error: {
      name: error.name, code: error.code ?? null, syscall: error.syscall ?? null } }));
    child.once('spawn', () => {
      report.workerPID = child.pid; report.phase = 'running'; sample();
    });
    exitHandler = () => { if (!closed && child?.pid) { try { child.kill('SIGKILL'); } catch {} } };
    signalHandler = signal => stop('PARENT_STOPPING', { signal });
    process.once('exit', exitHandler);
    process.once('SIGTERM', signalHandler); process.once('SIGINT', signalHandler);
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
      stream.on('data', data => {
        const remaining = Math.max(0, LIMITS.outputBytes - outputBytes);
        outputBytes += data.length; report.outputBytes = outputBytes;
        try {
          if (remaining > 0) appendFileSync(join(attempt, 'worker-' + name + '.log'), data.subarray(0, remaining),
            { mode: 0o600 });
        } catch (error) { stop('OUTPUT_LOG_WRITE_FAILURE', { error: error.code ?? error.name }); }
        if (outputBytes > LIMITS.outputBytes) stop('OUTPUT_LIMIT', { observedBytes: outputBytes });
      });
      stream.once('error', error => stop('OUTPUT_STREAM_ERROR', { error: error.code ?? error.name }));
    }
    interval = setInterval(sample, LIMITS.sampleMilliseconds);
    timeout = setTimeout(() => stop('MODE_PHASE_TIMEOUT', { timeoutMilliseconds: LIMITS.phaseTimeoutMilliseconds }),
      LIMITS.phaseTimeoutMilliseconds);
    await completion;
    if (report.phase !== 'completed') process.exitCode = 1;
  }
} catch (error) {
  process.exitCode = 1;
  preflightError = String(error.message).match(/^FLAT_[A-Z0-9_]+/)?.[0] ?? 'FLAT_SUPERVISOR_FAILURE';
  if (report && attempt) {
    recordFailure('SUPERVISOR_FAILURE', { error: { name: error.name, code: error.code ?? null,
      message: String(error.message).slice(0, 1000) } });
    report.phase = 'failed';
    try { save(); } catch {}
  }
  // A synchronous setup error after spawn must not leave the owned child alive.
  if (child?.pid && !closed) {
    stop('SUPERVISOR_FAILURE');
    await new Promise(resolve => child.once('close', resolve));
  }
} finally {
  cleanup();
  if (report && attempt) {
    report.completedAt ??= new Date().toISOString();
    try { save(); } catch { process.exitCode = 1; }
  }
}
console.log(JSON.stringify({ mode: mode ?? null, phase: report?.phase ?? 'failed',
  failure: failure ?? (report ? null : 'SUPERVISOR_PREFLIGHT_FAILURE'),
  error: preflightError,
  report: attempt ? relative(ROOT, join(attempt, 'resources.json')) : null }));
