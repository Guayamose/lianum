/** Fixed internal integration jobs with an external resource monitor.
 * No caller command/path/endpoint and no private witness output. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, LOCAL, LIMITS } from '../../../packages/proofs/src/catalog.mjs';
import { resources, resourceFailure, ensureDirectory, writeJSON, replaceJSON, regular } from '../../../packages/proofs/src/tooling/tooling.mjs';
import { integrationSourcePins } from './source-pins.mjs';
import { integrationTask } from './task-catalog.mjs';

export async function runBoundedIntegrationTask(suite) {
const task = integrationTask(suite);
const script = join(ROOT, 'integration', task.entry);
assert.equal(process.argv.length, 2, 'ENVELOPE_FIXED_ARGUMENTS');
assert.equal(realpathSync(resolve(process.argv[1])), script, 'ENVELOPE_FIXED_ENTRY');
assert.deepEqual(process.execArgv, [], 'ENVELOPE_NO_EXEC_OPTIONS');
assert.ok(!process.env.NODE_OPTIONS, 'ENVELOPE_NO_NODE_OPTIONS');
const runId = randomUUID(), attempt = join(LOCAL, task.output, runId);
const lockPath = join(LOCAL, task.output + '.lock');
ensureDirectory(attempt);
const began = performance.now();
const report = { format: 'FLAT_INTEGRATION_CONSTRAINT_RESOURCES_V1', suite, runId,
  phase: 'preflight', startedAt: new Date().toISOString(), limits: LIMITS,
  nativeNodesStarted: false, proofGenerated: false, failures: [], samples: 0,
  peakWorkerRSS: 0, minimumAvailableRAM: Number.MAX_SAFE_INTEGER,
  minimumFreeDisk: Number.MAX_SAFE_INTEGER, rawOutputRetained: false };
const save = () => replaceJSON(join(attempt, 'resources.json'), report);
let child, closed = false, locked = false, interval, timeout, killTimer, completion;
const fail = code => { report.failure ??= code; report.failures.push({ code, at: new Date().toISOString() }); };
function stop(code) {
  if (closed || report.stopping) return;
  report.stopping = true; fail(code);
  try { save(); } catch { report.reportWriteFailed = true; }
  if (!child?.pid) return;
  child.kill('SIGTERM');
  killTimer = setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, LIMITS.killGraceMilliseconds);
}
function sample() {
  try {
    const current = resources(closed ? undefined : child?.pid);
    report.samples++; report.latestResources = current;
    report.peakWorkerRSS = Math.max(report.peakWorkerRSS, current.workerRSS);
    report.minimumAvailableRAM = Math.min(report.minimumAvailableRAM, current.availableRAM);
    report.minimumFreeDisk = Math.min(report.minimumFreeDisk, current.freeDisk);
    const reason = resourceFailure(current);
    if (reason) { report.failedResourceSample ??= current; stop(reason); }
    save();
  } catch { stop('ENVELOPE_RESOURCE_MONITOR_FAILED'); }
}
const onTerm = () => stop('ENVELOPE_PARENT_TERMINATED');
const onExit = () => { if (child?.pid && !closed) child.kill('SIGKILL'); };
try {
  assert.equal(existsSync(join(LOCAL, 'active.lock')), false, 'ENVELOPE_PROOF_WORKER_ACTIVE');
  writeJSON(lockPath, { runId, pid: process.pid }); locked = true;
  report.sourcePins = integrationSourcePins(suite); save(); sample();
  assert.ok(!report.failure, 'ENVELOPE_PREFLIGHT_RESOURCES');
  child = spawn(process.execPath, [join(ROOT, 'integration', task.worker), runId],
    { cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
  completion = new Promise(resolveClosed => child.once('close', (code, signal) => {
    closed = true; report.exitCode = code; report.signal = signal; resolveClosed();
  }));
  child.once('error', () => stop('ENVELOPE_WORKER_SPAWN_FAILED'));
  child.once('spawn', () => { report.workerPID = child.pid; report.phase = 'running'; sample(); });
  let outputBytes = 0;
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
    outputBytes += bytes.length; report.outputBytes = outputBytes;
    if (outputBytes > LIMITS.outputBytes) stop('ENVELOPE_WORKER_OUTPUT_LIMIT');
  });
  process.once('SIGTERM', onTerm); process.once('SIGINT', onTerm); process.once('exit', onExit);
  interval = setInterval(sample, LIMITS.sampleMilliseconds);
  timeout = setTimeout(() => stop('ENVELOPE_TOTAL_TIMEOUT'),
    Math.max(1, LIMITS.phaseTimeoutMilliseconds - (performance.now() - began)));
  await completion;
  assert.equal(report.exitCode, 0, 'ENVELOPE_WORKER_EXIT');
  assert.equal(report.signal, null, 'ENVELOPE_WORKER_SIGNAL');
  assert.deepEqual(integrationSourcePins(suite), report.sourcePins, 'ENVELOPE_SOURCE_CHANGED');
  const result = JSON.parse(regular(join(attempt, 'result.json')));
  assert.equal(result.runId, runId, 'ENVELOPE_RESULT_RUN');
  assert.equal(result.phase, 'completed', 'ENVELOPE_CONSTRAINTS_FAILED');
  report.resultAccepted = true;
} catch (error) {
  fail(String(error.message).match(/\b(?:ENVELOPE|PW)_[A-Z0-9_]+\b/)?.[0] ?? 'ENVELOPE_RUN_FAILED');
  if (child?.pid && !closed) { stop('ENVELOPE_SUPERVISOR_FAILED'); await completion; }
} finally {
  clearInterval(interval); clearTimeout(timeout); clearTimeout(killTimer);
  process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onTerm); process.removeListener('exit', onExit);
  for (const stream of child?.stdio ?? []) stream?.destroy();
  try {
    report.finalResources = resources();
    const reason = resourceFailure(report.finalResources); if (reason) fail(reason);
  } catch { fail('ENVELOPE_FINAL_RESOURCE_FAILED'); }
  report.phase = report.failure ? 'failed' : 'completed';
  report.completedAt = new Date().toISOString(); report.elapsedMilliseconds = performance.now() - began;
  report.workerClosed = closed; report.lockPreserved = locked; save();
  // A failed, closed run remains inspectable and does not auto-retry.
  if (locked && closed && report.phase === 'completed') {
    const lock = JSON.parse(readFileSync(lockPath));
    assert.equal(lock.runId, runId); assert.equal(lock.pid, process.pid);
    report.lockPreserved = false; save(); unlinkSync(lockPath);
  }
}
if (report.phase !== 'completed') process.exitCode = 1;
console.log(JSON.stringify({ runId, attempt, phase: report.phase, error: report.failure ?? null }));

}
