import { assertBeginPayoutAuditGenericCliV1 } from './native-flow-proof-scope-v1.mjs';
/** Fixed CLI for non-private tasks; trusted role-process API for one private job. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import {sealPrivateProofJobV1,privateProofAuthorizationBindingV1,wipePrivateProofInputsV1} from './private-proof-transit-v1.mjs';
import { ROOT, LOCAL, PROFILE, LIMITS, DISCLOSURE, relation, operation } from '../catalog.mjs';
import { argumentsFor, attemptPath, assertID, ensureDirectory, writeJSON, regular, replaceJSON,
  resources, resourceFailure, verifyAPI, verifyVendor, hash, jsonBytes,
  errorCode, trustedParent } from '../tooling/tooling.mjs';
import { executionSources, limitsForMode } from './proving-execution.mjs';
import {standardProofResourcesV1,proofResourceMonitorErrorCodeV1} from './standard-proof-resources-v1.mjs';
import {usesNativeReservationV1,nativeReservationResourcesV1,assertNativeReservationReceiptV1} from './reservation-native-execution-v1.mjs';
import {usesNativeNodeV1,nativeNodeResourcesV1,assertNativeNodeReceiptV1} from './node-native-execution-v1.mjs';
import {usesNativeAuthorizationV1,nativeAuthorizationResourcesV1,assertNativeAuthorizationReceiptV1} from './authorization-native-execution-v1.mjs';

function dataRecord(value, names) {
  assert.ok(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, 'PW_API_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort(), 'PW_API_EXACT_FIELDS');
  for (const name of names) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value'), 'PW_API_DATA_FIELDS');
}
function transportClone(value) {
  let nodes = 0, characters = 0;
  const forbidden = /(?:proof|verification.?key|^vk$|root.?signing|master.?key|private.?key|signing.?secret|seed.?phrase)/i;
  function visit(item, depth) {
    assert.ok(++nodes <= 300000 && depth <= 32, 'PW_TRANSPORT_BOUND');
    if (typeof item === 'string') {
      characters += item.length; assert.ok(characters <= LIMITS.jobBytes, 'PW_TRANSPORT_SIZE'); return item;
    }
    if (typeof item === 'boolean' || (Number.isSafeInteger(item) && item >= 0 && !Object.is(item, -0))) return item;
    assert.ok(item && !types.isProxy(item), 'PW_TRANSPORT_VALUE');
    if (Array.isArray(item)) {
      assert.equal(Object.getPrototypeOf(item), Array.prototype, 'PW_TRANSPORT_ARRAY');
      assert.equal(Reflect.ownKeys(item).length, item.length + 1, 'PW_TRANSPORT_DENSE_ARRAY');
      return Array.from({ length: item.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        assert.ok(descriptor && Object.hasOwn(descriptor, 'value'), 'PW_TRANSPORT_DATA_ARRAY');
        return visit(descriptor.value, depth + 1);
      });
    }
    assert.equal(Object.getPrototypeOf(item), Object.prototype, 'PW_TRANSPORT_RECORD');
    return Object.fromEntries(Reflect.ownKeys(item).map(key => {
      assert.ok(typeof key === 'string' && !forbidden.test(key), 'PW_FORBIDDEN_PRIVATE_JOB_FIELD');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, 'PW_TRANSPORT_DATA_FIELDS');
      return [key, visit(descriptor.value, depth + 1)];
    }));
  }
  const clone = visit(value, 0);
  assert.ok(Buffer.byteLength(JSON.stringify(clone)) <= LIMITS.jobBytes, 'PW_TRANSPORT_SIZE');
  return clone;
}
/** INTERNAL ONLY: import this from a code-pinned role entry process. Inputs are
 * already scoped to that role; this is not a public wallet/full-witness API.
 * profile is one of two fixed process configurations, never a numeric limit.
 * jobId is a UUID generated once by the role process; ambiguity blocks reuse. */
export async function runBoundedProof(request) {
  dataRecord(request, ['relation', 'role', 'jobId', 'profile', 'inputs', 'expectedPublicInputs', 'authorization']);
  const spec = relation(request.relation);
  assert.equal(request.role, spec.role, 'PW_ROLE_SCOPE'); assertID(request.jobId);
  assert.ok(['standard', 'dyadic21'].includes(request.profile), 'PW_FIXED_PROOF_PROFILE');
  assert.equal(process.execArgv.length, 0, 'PW_NO_EXECUTABLE_OPTIONS');
  assert.ok(!process.env.NODE_OPTIONS, 'PW_NO_NODE_OPTIONS');
  const parent = trustedParent(spec);
  assert.equal(realpathSync(resolve(process.argv[1])), parent.script, 'PW_PINNED_ROLE_PROCESS');
  assert.deepEqual(process.argv.slice(2), parent.arguments, 'PW_PINNED_ROLE_ARGUMENTS');
  const authorization = privateProofAuthorizationBindingV1(request.authorization);
  let payload = transportClone({ type: 'flat-proof-inputs', relation: spec.name, role: spec.role,
    jobId: request.jobId, inputs: request.inputs, expectedPublicInputs: request.expectedPublicInputs, authorization });
  const mode = request.profile === 'dyadic21' ? 'prove-dyadic21' : 'prove';
  try { return await supervise(spec, mode, randomUUID(), payload); }
  finally { wipePrivateProofInputsV1(payload?.inputs); payload = undefined; }
}
async function supervise(spec, mode, runId, privatePayload = null) {
  const began = performance.now(), attempt = attemptPath(runId), lockPath = join(LOCAL, 'active.lock');
  const taskLimits=limitsForMode(spec,mode),nativeAuthorization=usesNativeAuthorizationV1(spec,mode),nativeNode=usesNativeNodeV1(spec,mode),nativeReservation=usesNativeReservationV1(spec,mode),nativeProving=nativeAuthorization||nativeNode||nativeReservation,nativeHistory=new Map();
  const originalNativeResources=nativeReservation?nativeReservationResourcesV1:nativeNode?nativeNodeResourcesV1:nativeAuthorizationResourcesV1;
  const assertOriginalNativeReceipt=nativeReservation?assertNativeReservationReceiptV1:nativeNode?assertNativeNodeReceiptV1:assertNativeAuthorizationReceiptV1;
  let report, child, interval, timeout, killTimer, completion, resolveClosed;
  let closed = false, stopping = false, failure = null, lockOwned = false, sent = false;
  let outputBytes = 0, exitHandler, termHandler, intHandler;
  const save = () => replaceJSON(join(attempt, 'resources.json'), report);
  function recordFailure(code, details = {}) {
    failure ??= code; report.failure = failure;
    report.failures.push({ code, at: new Date().toISOString(), ...details });
  }
  function stop(code, details = {}) {
    if (closed || stopping) return;
    stopping = true; recordFailure(code, details);
    // Save the exact failure sample before stopping this owned child.
    try { save(); } catch { report.reportWriteFailure = 'PW_RESOURCE_REPORT_WRITE_FAILED'; }
    if (!child?.pid) return;
    try { child.kill('SIGTERM'); } catch { report.termError = 'PW_SIGTERM_FAILED'; }
    killTimer ??= setTimeout(() => {
      if (!closed) {
        report.escalatedToSIGKILLAt = new Date().toISOString();
        try { save(); } catch {}
        try { child.kill('SIGKILL'); } catch { report.killError = 'PW_SIGKILL_FAILED'; }
      }
    }, LIMITS.killGraceMilliseconds);
  }
  function sample() {
    if (closed) return;
    try {
      const current = nativeProving ? originalNativeResources(child?.pid,nativeHistory) : standardProofResourcesV1(child);
      if(nativeProving){report.nativeMemoryScope=current.memoryScope;report.nativeChildIdentities=current.nativeChildIdentities;}
      report.samples++; report.latestResources = current;
      report.minimumAvailableRAM = Math.min(report.minimumAvailableRAM, current.availableRAM);
      report.minimumFreeDisk = Math.min(report.minimumFreeDisk, current.freeDisk);
      report.peakWorkerRSS = Math.max(report.peakWorkerRSS, current.workerRSS);
      const reason = resourceFailure(current);
      if (reason) { report.failedResourceSample ??= current; stop(reason, { sample: current }); }
      else save();
    } catch(error) { stop('PW_RESOURCE_MONITOR_FAILED', { monitorErrorCode: proofResourceMonitorErrorCodeV1(error) }); }
  }
  try {
    operation(mode); ensureDirectory(LOCAL);
    assert.equal(existsSync(attempt), false, 'PW_UNIQUE_ATTEMPT'); ensureDirectory(attempt);
    report = { format: 'FLAT_WALLET_EXTERNAL_RESOURCE_REPORT_V1', profile: PROFILE,
      relation: spec.name, mode, runId, jobId: privatePayload?.jobId ?? null,
      phase: 'preflight', startedAt: new Date().toISOString(), disclosure: DISCLOSURE,
      limits: taskLimits, hostLimitsChanged: false, samples: 0, failures: [], failure: null,
      peakWorkerRSS: 0, minimumAvailableRAM: Number.MAX_SAFE_INTEGER,
      minimumFreeDisk: Number.MAX_SAFE_INTEGER, outputBytes: 0, rawOutputRetained: false,
      environment: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      timeoutScope: 'entire task including imports, initialization and cleanup; never reset' };
    save();
    // Failed locks and one-use job claims remain for explicit review. No stale
    // lock takeover, automatic removal, implicit retry or overlapping task.
    writeJSON(lockPath, { pid: process.pid, relation: spec.name, mode, runId,
      jobId: privatePayload?.jobId ?? null, startedAt: report.startedAt }); lockOwned = true;
    if (privatePayload) writeJSON(join(LOCAL, 'job-claims', assertID(privatePayload.jobId) + '.json'),
      { jobId: privatePayload.jobId, relation: spec.name, role: spec.role, runId, startedAt: report.startedAt });
    const initial = resources(); report.initialResources = initial;
    report.minimumAvailableRAM = initial.availableRAM; report.minimumFreeDisk = initial.freeDisk;
    const initialFailure = resourceFailure(initial);
    if (initialFailure) { report.failedResourceSample = initial; recordFailure(initialFailure, { sample: initial }); }
    if (!failure) {
      const runtimePins = { executionSources: executionSources(spec, mode), api: verifyAPI(), vendor: verifyVendor() };
      writeJSON(join(attempt, 'runtime-pins.json'), runtimePins);
      report.runtimePinsSHA256 = hash(jsonBytes(runtimePins));
      const remaining = LIMITS.phaseTimeoutMilliseconds - (performance.now() - began);
      assert.ok(remaining > 0, 'PW_PREFLIGHT_TIMEOUT');
      const args = [join(ROOT, 'proof-workers/worker.mjs'), spec.name, mode, runId];
      report.childExecutable = process.execPath; report.childArguments = args; report.phase = 'starting'; save();
      completion = new Promise(resolve => { resolveClosed = resolve; });
      child = spawn(process.execPath, args, { cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
        serialization: 'json', stdio: privatePayload ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'] });
      // Close is registered immediately, before sampling or an error callback.
      child.once('close', (code, signal) => {
        closed = true; clearInterval(interval); clearTimeout(timeout); clearTimeout(killTimer);
        if ((code !== 0 || signal !== null) && failure === null) recordFailure('PW_WORKER_EXIT_FAILURE', { code, signal });
        report.exitCode = code; report.signal = signal; resolveClosed();
      });
      child.once('error', () => stop('PW_SPAWN_OR_CHILD_ERROR'));
      child.once('spawn', () => { report.workerPID = child.pid; report.phase = 'running'; sample(); });
      if (privatePayload) {
        child.on('message', message => {
          try {
            dataRecord(message, ['type', 'profile', 'relation', 'role', 'jobId', 'recipientPublicKey']);
            assert.equal(message.type, 'flat-private-proof-input-ready', 'PW_IPC_READY_TYPE');
            assert.equal(message.relation, spec.name, 'PW_IPC_RELATION');
            assert.equal(message.role, spec.role, 'PW_IPC_ROLE');
            assert.equal(message.jobId, privatePayload?.jobId, 'PW_IPC_JOB');
            assert.equal(sent, false, 'PW_SINGLE_IPC_JOB');
            sent = true;
            const packet = sealPrivateProofJobV1(message, {inputs:privatePayload.inputs,
              expectedPublicInputs:privatePayload.expectedPublicInputs,authorization:privatePayload.authorization});
            child.send(packet, error => { if (error) stop('PW_PRIVATE_IPC_SEND_FAILED'); });
            wipePrivateProofInputsV1(privatePayload.inputs); privatePayload = undefined;
          } catch { stop('PW_PRIVATE_IPC_PROTOCOL_FAILED'); }
        });
      }
      exitHandler = () => { if (!closed && child?.pid) { try { child.kill('SIGKILL'); } catch {} } };
      termHandler = () => stop('PW_PARENT_SIGTERM'); intHandler = () => stop('PW_PARENT_SIGINT');
      process.once('exit', exitHandler); process.once('SIGTERM', termHandler); process.once('SIGINT', intHandler);
      for (const stream of [child.stdout, child.stderr]) {
        stream.on('data', data => {
          outputBytes += data.length; report.outputBytes = outputBytes;
          // Count output, retain no raw library/error text or private values.
          if (outputBytes > LIMITS.outputBytes) stop('PW_OUTPUT_LIMIT', { observedBytes: outputBytes });
        });
        stream.once('error', () => stop('PW_OUTPUT_STREAM_FAILED'));
      }
      interval = setInterval(sample, LIMITS.sampleMilliseconds);
      timeout = setTimeout(() => stop('PW_TASK_TIMEOUT'), remaining);
      await completion;
      const result = JSON.parse(regular(join(attempt, 'result.json')));
      assert.equal(result.phase, 'completed', 'PW_WORKER_RESULT_FAILED');
      assert.equal(result.runId, runId, 'PW_WORKER_RESULT_RUN');
      assert.deepEqual(result.limits, taskLimits, 'PW_WORKER_FIXED_LIMITS');
      assert.equal(result.threads, taskLimits.threads, 'PW_WORKER_FIXED_THREADS');
      if(nativeProving){
        const finalNative=originalNativeResources(child.pid,nativeHistory);
        report.nativeBackendExecution=result.nativeBackendExecution;report.nativeMemoryScope=finalNative.memoryScope;
        report.outputBytes=outputBytes+(result.nativeBackendExecution?.outputBytes??0);
        assert.ok(report.outputBytes<=LIMITS.outputBytes,'PW_NATIVE_OUTPUT_LIMIT');
        report.nativeChildIdentities=finalNative.nativeChildIdentities;
        report.nativeChildrenGone=finalNative.liveNativeBackends===0&&finalNative.nativeBackendRSS===0;
        assertOriginalNativeReceipt(spec,result,report);
      }
      assert.deepEqual(executionSources(spec, mode), runtimePins.executionSources, 'PW_RUNTIME_CHANGED_AFTER_WORKER');
      assert.deepEqual(verifyAPI(), runtimePins.api, 'PW_API_CHANGED_AFTER_WORKER');
      assert.deepEqual(verifyVendor(), runtimePins.vendor, 'PW_VENDOR_CHANGED_AFTER_WORKER');
    }
  } catch (error) {
    if (report) recordFailure(errorCode(error));
    else failure = errorCode(error);
    if (child?.pid && !closed) { stop('PW_SUPERVISOR_FAILED'); await completion; }
  } finally {
    clearInterval(interval); clearTimeout(timeout); clearTimeout(killTimer);
    if (exitHandler) process.removeListener('exit', exitHandler);
    if (termHandler) process.removeListener('SIGTERM', termHandler);
    if (intHandler) process.removeListener('SIGINT', intHandler);
    for (const stream of child?.stdio ?? []) stream?.destroy();
    wipePrivateProofInputsV1(privatePayload?.inputs); privatePayload = undefined;
    if (report) {
      report.phase = failure === null && report.exitCode === 0 ? 'completed' : 'failed';
      report.elapsedMilliseconds = performance.now() - began; report.completedAt = new Date().toISOString();
      try {
        report.finalResources = nativeProving && child?.pid ? originalNativeResources(child.pid,nativeHistory) : resources();
        const finalFailure = resourceFailure(report.finalResources);
        if (finalFailure) {
          report.failedResourceSample ??= report.finalResources;
          recordFailure(finalFailure, { sample: report.finalResources }); report.phase = 'failed';
        }
        save();
      }
      catch { failure ??= 'PW_FINAL_REPORT_WRITE_FAILED'; report.phase = 'failed'; }
      report.lockPreserved = lockOwned; report.failure = failure;
      if (lockOwned && report.phase === 'completed') {
        try {
          const lock = JSON.parse(regular(lockPath));
          assert.equal(lock.runId, runId, 'PW_LOCK_OWNERSHIP'); assert.equal(lock.pid, process.pid, 'PW_LOCK_OWNER');
          // Save final success before releasing the lock. No further report
          // write occurs after a successful unlink, avoiding an unrecorded
          // write failure after failure-lock preservation became impossible.
          report.lockPreserved = false; save();
          unlinkSync(lockPath); lockOwned = false;
        } catch { failure ??= 'PW_LOCK_RELEASE_FAILED'; report.phase = 'failed'; }
      }
      if (lockOwned || report.phase !== 'completed') {
        report.lockPreserved = lockOwned; report.failure = failure;
        try { save(); } catch { failure ??= 'PW_FINAL_REPORT_WRITE_FAILED'; }
      }
    }
  }
  return Object.freeze({ relation: spec.name, mode, runId, phase: failure === null ? report?.phase ?? 'failed' : 'failed',
    errorCode: failure, report: report ? relative(ROOT, join(attempt, 'resources.json')) : null });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let status;
  try {
    assertBeginPayoutAuditGenericCliV1();
    const { spec, mode, runId } = argumentsFor();
    assert.notEqual(operation(mode), 'prove', 'PW_CLI_PROVE_DISABLED');
    status = await supervise(spec, mode, runId);
  } catch (error) { status = { phase: 'failed', errorCode: errorCode(error) }; }
  if (status.phase !== 'completed') process.exitCode = 1;
  process.stdout.write(JSON.stringify(status) + '\n');
}
