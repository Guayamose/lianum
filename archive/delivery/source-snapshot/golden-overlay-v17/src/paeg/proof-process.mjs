/** Trusted in-process facade for short-lived offline proof workers.
 * Authorization/capsule proving belongs to the owner. Never expose this factory as a
 * coordinator HTTP API accepting graphs. Inputs/results are private capabilities.
 * No caller command, path, environment, backend, memory or RPC override exists.
 */
import { fork } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync, fstatSync, statSync, statfsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PRIVATE_RESOURCE_POLICY } from '../private-resource-policy.mjs';
import { selectProofResourcePolicy } from './proof-resource-policy.mjs';
import { filePin } from '../../experiments/private-core-proof/wallet-notes/resources.mjs';
import {
  PROOF_PROJECT_ROOT, PROOF_PROTOCOL, PROOF_MODES, PROOF_DEFAULT_MODES, PROOF_PURPOSES, PROOF_MAX_MESSAGE_BYTES,
  proofError, need, exactObject, encodeProofMessage, decodeProofMessage,
  normalizePublicInputs, assertExpectedInputs, normalizeProofWitness,
  publicInputsFromWitness, encodePrivateProof, decodePrivateProof, loadProofProfile, wipePrivate, proofRoleAllows, assertProofRole,
} from './proof-worker.mjs';

const workerFile = fileURLToPath(new URL('./proof-worker.mjs', import.meta.url));
const nativePinsFile = fileURLToPath(new URL('./native-proof-pins.mjs', import.meta.url));
const nativeValidatorFile = fileURLToPath(new URL('../../experiments/private-core-proof/generic-native/pin-key.mjs', import.meta.url));
const proofResourcePolicyFile = fileURLToPath(new URL('./proof-resource-policy.mjs', import.meta.url));
const verifierCRSFile = fileURLToPath(new URL('../private-verifier-crs.mjs', import.meta.url));
const telemetryDirectory = join(PROOF_PROJECT_ROOT, 'evidence/paeg-proof-attempts');
const hostLockPath = '/tmp/lianum-paeg-proof-host.lock';
const operationMilliseconds = 15 * 60 * 1000, killGraceMilliseconds = 5000;
const maximumLogBytes = 1024 * 1024;
const stages = new Set(['checking-pins', 'initializing-official-wasm', 'initializing-pinned-proving-crs',
  'initializing-pinned-verifier-crs', 'private-witness-in-memory', 'actual-proof-generation',
  'actual-pinned-verification', 'legacy-proof-and-self-verification', 'legacy-independent-verification']);
let activeHostJob = null;

function resourceSample(child) {
  const disk = statfsSync(PROOF_PROJECT_ROOT);
  const meminfo = readFileSync('/proc/meminfo', 'utf8');
  let workerRSS = 0;
  // This PID comes only from our ChildProcess. Never discover/kill by process name.
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    try { workerRSS = Number(/^VmRSS:\s+(\d+)/m.exec(readFileSync(`/proc/${child.pid}/status`, 'utf8'))?.[1] ?? 0) * 1024; }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
  }
  return { at: new Date().toISOString(), availableRAM: Number(/MemAvailable:\s+(\d+)/.exec(meminfo)?.[1]) * 1024,
    freeDisk: disk.bavail * disk.bsize, workerRSS, parentRSS: process.memoryUsage().rss };
}
function resourceTrip(sample, policy) {
  if (!Number.isSafeInteger(sample.availableRAM) || !Number.isSafeInteger(sample.freeDisk)) return 'PAEG_PROOF_RESOURCE_SAMPLE';
  if (sample.availableRAM < policy.floors.availableRAM) return 'PAEG_PROOF_AVAILABLE_RAM_FLOOR';
  if (sample.freeDisk < policy.floors.freeDisk) return 'PAEG_PROOF_DISK_FLOOR';
  if (sample.workerRSS > policy.proofWorkerRSSLimit) return 'PAEG_PROOF_WORKER_RSS_LIMIT';
  return null;
}
function acquireHostLock() {
  let fd;
  try { fd = openSync(hostLockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw proofError('PAEG_PROOF_HOST_BUSY'); throw error; }
  const identity = fstatSync(fd);
  try { writeFileSync(fd, JSON.stringify({ parentPID: process.pid, createdAt: new Date().toISOString() }) + '\n'); }
  catch (error) { closeSync(fd); unlinkSync(hostLockPath); throw error; }
  return () => {
    closeSync(fd);
    const current = statSync(hostLockPath);
    need(current.ino === identity.ino && current.dev === identity.dev, 'PAEG_PROOF_LOCK_CHANGED');
    unlinkSync(hostLockPath);
  };
}

/** Fixed repository and proving-role binding. Native modes require an explicit
 * modes list and completed literal pins; the default is the original five.
 * Strict native purposes bind their named role modes, for example
 * { purpose: 'dependency', modes: ['dependency'] }. The same
 * facade verifies independently; every call receives a fresh child/backend.
 * Pins are hashes only. Returned vkFields are public recursive VK fields,
 * never a signing key. Expected public words must come independently from caller.
 */
export function createProofProcess(options) {
  need(options && typeof options === 'object', 'PAEG_PROOF_CONFIG');
  exactObject(options, Object.hasOwn(options, 'modes') ? ['purpose', 'modes'] : ['purpose']);
  need(PROOF_PURPOSES.includes(options.purpose), 'PAEG_PROOF_PURPOSE');
  const purpose = options.purpose, modes = options.modes ?? [...PROOF_DEFAULT_MODES];
  need(Array.isArray(modes) && modes.length > 0 && new Set(modes).size === modes.length
    && modes.every(mode => PROOF_MODES.includes(mode)), 'PAEG_PROOF_MODES');
  need(modes.every(mode => proofRoleAllows(purpose, 'prove', mode) || proofRoleAllows(purpose, 'verify', mode)), 'PAEG_PROOF_ROLE_MODE');
  const allowed = new Set(modes);
  const bindings = Object.fromEntries(modes.map(mode => [mode, loadProofProfile(mode).publicPins]));
  const codePins = {
    worker: filePin(workerFile), parent: filePin(fileURLToPath(import.meta.url)),
    resourcePolicy: filePin(fileURLToPath(new URL('../private-resource-policy.mjs', import.meta.url))),
    proofResourcePolicy: filePin(proofResourcePolicyFile),
    verifierCRS: filePin(verifierCRSFile),
    ...(modes.some(mode => !PROOF_DEFAULT_MODES.includes(mode))
      ? { nativePins: filePin(nativePinsFile), nativeValidator: filePin(nativeValidatorFile) } : {}),
  };
  let closed = false, current = null, lastReport = null;

  async function run(operation, mode, input, expectedPublicInputs, label = `${operation}-${mode}`) {
    need(!closed, 'PAEG_PROOF_FACADE_CLOSED');
    need(!current && !activeHostJob, 'PAEG_PROOF_HOST_BUSY');
    need(allowed.has(mode), 'PAEG_PROOF_MODE');
    assertProofRole(purpose, operation, mode);
    need(typeof label === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(label), 'PAEG_PROOF_LABEL');
    const expected = normalizePublicInputs(mode, expectedPublicInputs);
    const loaded = loadProofProfile(mode);
    const resourcePolicy = selectProofResourcePolicy(mode, loaded.publicPins);
    need(JSON.stringify(loaded.publicPins) === JSON.stringify(bindings[mode]), 'PAEG_PROOF_BOUND_PROFILE_CHANGED');
    filePin(workerFile, codePins.worker);
    filePin(fileURLToPath(import.meta.url), codePins.parent);
    filePin(fileURLToPath(new URL('../private-resource-policy.mjs', import.meta.url)), codePins.resourcePolicy);
    filePin(proofResourcePolicyFile, codePins.proofResourcePolicy);
    filePin(verifierCRSFile, codePins.verifierCRS);
    if (codePins.nativePins) {
      filePin(nativePinsFile, codePins.nativePins); filePin(nativeValidatorFile, codePins.nativeValidator);
    }
    // Normalize into an owned copy before IPC. Exact ABI rejects signing-key and
    // unrelated graph/account properties; caller-owned objects remain untouched.
    let privateInput;
    if (operation === 'prove') {
      privateInput = normalizeProofWitness(loaded.program, input);
      assertExpectedInputs(mode, publicInputsFromWitness(loaded.program, privateInput), expected);
    } else {
      privateInput = encodePrivateProof(mode, input);
      assertExpectedInputs(mode, privateInput.publicInputs, expected);
    }
    let payload;
    try { payload = encodeProofMessage({ protocol: PROOF_PROTOCOL, purpose, operation, mode, input: privateInput, expectedPublicInputs: expected, label }); }
    finally { wipePrivate(privateInput); privateInput = null; }
    const id = randomUUID(), began = performance.now();
    const report = { classification: 'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY', id, mode, operation, purpose, label,
      startedAt: new Date().toISOString(), phase: 'before-dispatch', ...bindings[mode], policy: resourcePolicy,
      maximumPages: loaded.maximumPages, threads: 1, zeroKnowledgeEnabled: true, codePins, stages: [], resourceSamples: [],
      logs: { stdoutBytes: 0, stderrBytes: 0 }, acceptedResult: false };
    const path = join(telemetryDirectory, id + '.json');
    let child, releaseLock, monitor, deadline, killTimer, result, failure, finished = false, resultSeen = false, sequence = 0;
    let resolveDone, rejectDone;
    const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
    // abort()/close() can await reaping without producing an unhandled rejection.
    done.catch(() => {});
    const persist = () => {
      try { writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
      catch {
        report.telemetryWriteFailed = true;
        // Exact samples are also retained in error.telemetry even if both disks
        // reject writes. Only public hashes/stages/resources go to either file.
        try { writeFileSync(`/tmp/lianum-paeg-proof-abort-${id}.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
        catch { report.fallbackTelemetryWriteFailed = true; }
        throw proofError('PAEG_PROOF_TELEMETRY_WRITE');
      }
    };
    const sample = () => { const value = resourceSample(child); report.resourceSamples.push(value); return value; };
    const stop = (code, tripSample) => {
      if (finished) return done;
      failure ??= proofError(code);
      report.failedPhase ??= report.phase;
      report.phase = 'aborting'; report.failureCode = failure.code;
      if (tripSample && !report.tripSample) report.tripSample = tripSample;
      try { persist(); } catch { /* failure telemetry stays in returned error */ }
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => { if (!finished && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, killGraceMilliseconds);
      }
      return done;
    };
    const finish = (exitCode, signal) => {
      if (finished) return; finished = true;
      clearInterval(monitor); clearTimeout(deadline); clearTimeout(killTimer);
      payload?.fill(0); payload = null;
      report.exit = { code: exitCode, signal }; report.completedAt = new Date().toISOString(); report.totalMilliseconds = performance.now() - began;
      if (!failure && (exitCode !== 0 || !resultSeen)) failure = proofError('PAEG_PROOF_CHILD_EXIT');
      report.phase = failure ? 'failed' : 'completed'; report.acceptedResult = !failure;
      if (failure) report.failureCode = failure.code;
      try { persist(); } catch (error) { failure ??= error; report.phase = 'failed'; report.acceptedResult = false; }
      try { releaseLock?.(); } catch { failure ??= proofError('PAEG_PROOF_LOCK_RELEASE'); }
      current = null; activeHostJob = null; lastReport = structuredClone(report);
      for (const stream of child?.stdio ?? []) stream?.destroy();
      if (failure) { wipePrivate(result); failure.telemetry = structuredClone(report); rejectDone(failure); }
      else resolveDone({ ...result, metrics: structuredClone(report) });
    };
    current = { done, stop }; activeHostJob = current;
    try {
      mkdirSync(telemetryDirectory, { recursive: true });
      releaseLock = acquireHostLock();
      const initial = sample(); persist();
      const trip = resourceTrip(initial, resourcePolicy); if (trip) { report.tripSample = initial; throw proofError(trip); }
      child = fork(workerFile, [], { cwd: PROOF_PROJECT_ROOT, execArgv: [], serialization: 'advanced',
        env: { LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      child.once('error', () => stop('PAEG_PROOF_CHILD_SPAWN'));
      child.once('close', finish);
      report.childPID = child.pid; report.phase = 'starting-child'; persist();
      for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
        stream.on('data', bytes => {
          report.logs[name + 'Bytes'] += bytes.length; bytes.fill(0);
          if (report.logs.stdoutBytes + report.logs.stderrBytes > maximumLogBytes) stop('PAEG_PROOF_LOG_LIMIT');
        });
        stream.on('error', () => stop('PAEG_PROOF_CHILD_IO'));
      }
      let ready = false, responseBytes = 0;
      const send = (message, callback = () => {}) => {
        const encoded = encodeProofMessage(message);
        child.send(encoded, error => { encoded.fill(0); if (error) stop('PAEG_PROOF_CHILD_IO'); callback(error); });
      };
      child.on('message', bytes => {
        let message;
        try {
          need(bytes instanceof Uint8Array, 'PAEG_PROOF_PROTOCOL'); responseBytes += bytes.length;
          need(responseBytes <= PROOF_MAX_MESSAGE_BYTES + 65536, 'PAEG_PROOF_OUTPUT_LIMIT');
          message = decodeProofMessage(bytes);
          if (failure) { wipePrivate(message); return; }
          if (message.event === 'ready') {
            exactObject(message, ['event', 'protocol']); need(!ready && message.protocol === PROOF_PROTOCOL, 'PAEG_PROOF_PROTOCOL'); ready = true;
            report.phase = 'dispatching-private-input'; persist();
            child.send(payload, error => { payload?.fill(0); payload = null; if (error) stop('PAEG_PROOF_CHILD_IO'); });
          } else if (message.event === 'phase') {
            exactObject(message, ['event', 'sequence', 'stage']);
            need(ready && !resultSeen && message.sequence === sequence + 1 && stages.has(message.stage), 'PAEG_PROOF_PROTOCOL');
            sequence = message.sequence; report.phase = message.stage;
            const value = sample(); report.stages.push({ stage: message.stage, at: value.at }); persist();
            const trip = resourceTrip(value, resourcePolicy); if (trip) { stop(trip, value); return; }
            send({ event: 'phase-persisted', sequence });
          } else if (message.event === 'result') {
            exactObject(message, ['event', 'result']); need(ready && !resultSeen, 'PAEG_PROOF_PROTOCOL'); resultSeen = true;
            const value = message.result;
            exactObject(value, operation === 'prove' ? ['proofPackage', 'metrics'] : ['verified', 'metrics']);
            if (operation === 'prove') {
              result = decodePrivateProof(mode, value.proofPackage);
              assertExpectedInputs(mode, result.publicInputs, expected);
            } else { need(typeof value.verified === 'boolean', 'PAEG_PROOF_PROTOCOL'); result = { verified: value.verified }; }
            // Metrics from our fixed child are additionally restricted to the
            // hashes/counts/timings/resource/provenance fields created there.
            need(value.metrics.keySHA256 === bindings[mode].keySHA256, 'PAEG_PROOF_RESULT_PIN');
            report.worker = structuredClone(value.metrics); report.phase = 'awaiting-child-exit'; persist();
          } else if (message.event === 'failure') {
            exactObject(message, ['event', 'code']);
            need(typeof message.code === 'string' && /^PAEG_PROOF_[A-Z_]+$/.test(message.code), 'PAEG_PROOF_PROTOCOL');
            stop(message.code);
          } else throw proofError('PAEG_PROOF_PROTOCOL');
        } catch (error) { stop(/^PAEG_PROOF_[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'PAEG_PROOF_PROTOCOL'); }
        finally { wipePrivate(message); }
      });
      monitor = setInterval(() => {
        if (finished || failure) return;
        try { const value = sample(), trip = resourceTrip(value, resourcePolicy); if (trip) stop(trip, value); }
        catch { stop('PAEG_PROOF_RESOURCE_SAMPLE'); }
      }, PRIVATE_RESOURCE_POLICY.externalSampleMilliseconds);
      deadline = setTimeout(() => stop('PAEG_PROOF_OPERATION_TIMEOUT'), operationMilliseconds);
    } catch (error) {
      failure = /^PAEG_PROOF_[A-Z_]+$/.test(error?.code ?? '') ? error : proofError('PAEG_PROOF_STARTUP_FAILURE');
      if (child) stop(failure.code);
      else finish(null, null);
    }
    return done;
  }
  return Object.freeze({
    prove: (mode, input, expectedPublicInputs, label) => run('prove', mode, input, expectedPublicInputs, label),
    verify: (mode, proof, expectedPublicInputs, label) => run('verify', mode, proof, expectedPublicInputs, label),
    pins: () => structuredClone(bindings),
    report: () => lastReport && structuredClone(lastReport),
    async abort() { const job = current; if (!job) return { aborted: false, exited: true }; job.stop('PAEG_PROOF_CANCELLED'); await job.done.catch(() => {}); return { aborted: true, exited: true }; },
    async close() { closed = true; const job = current; if (job) { job.stop('PAEG_PROOF_CLOSED'); await job.done.catch(() => {}); } return { closed: true, exited: true }; },
  });
}
