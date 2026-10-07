/** Sequential bounded public-artifact phases; requires durable checkpoint approval. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DIR, ROOT, LOCAL, LIMITS, hash, json, parse, writeNew, replace, fingerprint, otherLocks } from './common.mjs';
import { resources, resourceFailure } from '../../../packages/proofs/src/tooling/tooling.mjs';
assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []); assert.ok(!process.env.NODE_OPTIONS);
assert.equal(realpathSync(process.argv[1]), join(DIR, 'run.mjs'));
const approval = parse(join(DIR,'launch-checkpoint.json'));
assert.equal(approval.approvedToStart, true);
assert.equal(approval.programSHA256, 'ef9e5517776ee9193c62c9bd00c0421ebc63c5378b9780ad5768363cc9865d8b');
const local = join(DIR, '.local'); mkdirSync(local, { recursive: true, mode: 0o700 });
assert.equal(realpathSync(local), local);
async function supervise(mode, lineage = {}) {
  const began = performance.now();
  assert.deepEqual(otherLocks(), [], 'V3A_OTHER_HEAVY_SLOT_BUSY');
  const runId = randomUUID(), attempt = join(local, runId), lockPath = join(local, 'active.lock');
  mkdirSync(attempt, { mode: 0o700 });
  const report = { format: 'LIANUM_V3_PUBLIC_ARTIFACT_RESOURCES_V1', mode, runId, phase: 'preflight',
    limits: LIMITS, hostLimitsChanged: false, samples: 0, peakWorkerRSS: 0, minimumAvailableRAM: Number.MAX_SAFE_INTEGER,
    minimumFreeDisk: Number.MAX_SAFE_INTEGER, failures: [], outputBytes: 0, rawOutputRetained: false,
    environment: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, timeoutScope: 'entire bounded phase including imports and cleanup' };
  const save = () => replace(join(attempt, 'resources.json'), report);
  let child, interval, timeout, killTimer, closed = false, lockOwned = false, stopRequested = false, resolveClose;
  const completed = new Promise(resolve => { resolveClose = resolve; });
  const stop = failure => {
    if (closed || stopRequested) return; stopRequested = true; report.failures.push(failure); save();
    if (child?.pid) {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, LIMITS.killGraceMilliseconds);
    }
  };
  const sample = () => {
    if (closed) return;
    try {
      const current = resources(child?.pid); report.samples++; report.latestResources = current;
      report.peakWorkerRSS = Math.max(report.peakWorkerRSS, current.workerRSS);
      report.minimumAvailableRAM = Math.min(report.minimumAvailableRAM, current.availableRAM);
      report.minimumFreeDisk = Math.min(report.minimumFreeDisk, current.freeDisk);
      const failure = resourceFailure(current); if (failure) { report.failedResourceSample = current; stop(failure); }
      if (otherLocks().length) stop('V3A_OTHER_HEAVY_SLOT_BECAME_BUSY');
      save();
    } catch { stop('V3_RESOURCE_MONITOR_FAILED'); }
  };
  const terminate = () => stop('V3_PARENT_INTERRUPTED');
  const onExit = () => { if (!closed && child?.pid) child.kill('SIGKILL'); };
  try {
    save(); writeNew(lockPath, { pid: process.pid, runId, mode }); lockOwned = true;
    const initial = resources(); assert.equal(resourceFailure(initial), null, 'V3_INITIAL_RESOURCE_FLOOR');
    const pins = await fingerprint(); writeNew(join(attempt, 'pins.json'), pins);
    writeNew(join(attempt, 'request.json'), { mode, runId, lineage, durableCheckpoint: parse(join(DIR,'launch-checkpoint.json')) });
    report.pinsSHA256 = hash(json(pins)); save();
    child = spawn(process.execPath, [join(DIR, 'worker.mjs'), mode, runId],
      { cwd: ROOT, env: report.environment, stdio: ['ignore','pipe','pipe','ipc'] });
    child.once('close', (code, signal) => {
      closed = true; clearInterval(interval); clearTimeout(timeout); clearTimeout(killTimer);
      report.exitCode = code; report.signal = signal;
      if (code !== 0 || signal !== null) report.failures.push('V3_WORKER_EXIT_FAILURE');
      resolveClose();
    });
    child.once('error', () => stop('V3_CHILD_ERROR'));
    child.once('spawn', () => { report.workerPID = child.pid; report.phase = 'running'; sample(); });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
      report.outputBytes += bytes.length;
      if (report.outputBytes > LIMITS.outputBytes) stop('V3_OUTPUT_LIMIT');
    });
    process.once('SIGTERM', terminate); process.once('SIGINT', terminate); process.once('exit', onExit);
    interval = setInterval(sample, LIMITS.sampleMilliseconds);
    const remaining = LIMITS.phaseTimeoutMilliseconds - (performance.now() - began);
    assert.ok(remaining > 0, 'V3_PREFLIGHT_TIMEOUT');
    timeout = setTimeout(() => stop('V3_PHASE_TIMEOUT'), remaining);
    await completed;
    const result = parse(join(attempt, 'result.json'));
    assert.equal(result.phase, 'completed', 'V3_WORKER_RESULT_FAILED');
    assert.equal(result.runId, runId); assert.equal(result.mode, mode);
    assert.deepEqual(await fingerprint(), pins, 'V3_AFTER_WORKER_PINS_CHANGED');
    assert.deepEqual(report.failures, [], 'V3_RESOURCE_FAILURES');
    assert.equal(resourceFailure(resources()), null, 'V3_FINAL_RESOURCE_FLOOR');
    report.phase = 'completed';
  } catch (error) {
    report.phase = 'failed'; report.failure = String(error.message).slice(0, 2000);
    if (child?.pid && !closed) { stop('V3_SUPERVISOR_FAILED'); await completed; }
  } finally {
    clearInterval(interval); clearTimeout(timeout); clearTimeout(killTimer);
    process.removeListener('SIGTERM', terminate); process.removeListener('SIGINT', terminate); process.removeListener('exit', onExit);
    for (const stream of child?.stdio ?? []) stream?.destroy();
    report.lockPreserved = lockOwned; report.finalResources = resources();
    if (report.phase === 'completed' && lockOwned) {
      const lock = parse(lockPath); assert.equal(lock.pid, process.pid); assert.equal(lock.runId, runId);
      report.lockPreserved = false; save(); unlinkSync(lockPath); lockOwned = false;
    } else save();
  }
  process.stdout.write(JSON.stringify({ mode, runId, phase: report.phase, failure: report.failure ?? null,
    resultPath: join(attempt, 'result.json'), resourcesPath: join(attempt, 'resources.json') }) + '\n');
  assert.equal(report.phase, 'completed', 'V3_STOP_AFTER_FAILED_PHASE');
  return runId;
}
try {
  const stats = await supervise('stats');
  const key = await supervise('key', { stats });
  const proof = await supervise('proof', { stats, key });
  await supervise('solidity', { stats, key, proof });
} catch { process.exitCode = 1; }
