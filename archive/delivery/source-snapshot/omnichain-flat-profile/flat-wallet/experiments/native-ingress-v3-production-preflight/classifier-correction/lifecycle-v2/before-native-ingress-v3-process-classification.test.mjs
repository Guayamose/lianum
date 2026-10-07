import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../proof-workers/catalog.mjs';
import { classifyNativeIngressV3Executable, nativeProofProcessResources, nativeResourceFailure,
  NATIVE_FLOW_LIMITS } from './native-flow-supervisor.mjs';
import { productionPreflightForbiddenProcess, preflightForbiddenProcess,
  PREFLIGHT_REAL_RUN_DISABLED, PRODUCTION_PREFLIGHT_REAL_RUN_DISABLED } from './native-ingress-v3-preflight-policy.mjs';
const captured = JSON.parse(readFileSync(new URL('../experiments/native-ingress-v3-production-preflight/original-application-resources.json', import.meta.url)));
const classification = name => classifyNativeIngressV3Executable(join(ROOT, 'proof-workers', name));
const topology = captured.failureResourceSample.ownedProcesses.map(p => ({ ...p,
  ...(p.pid === 25 ? classification('native-ingress-v3-role-process.mjs')
    : p.pid === 32 ? classification('native-ingress-v3-worker.mjs') : {}) }));
const resource = processes => ({ ...captured.failureResourceSample, ...nativeProofProcessResources(processes) });
test('captured PID 25 coordinator plus PID 32 backend is exactly one heavy job', () => {
  assert.equal(captured.failure, 'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS');
  assert.deepEqual(topology.map(p => [p.pid, p.ppid, p.pgrp, p.session]), [[13, 6, 13, 13], [25, 13, 13, 13], [32, 25, 13, 13]]);
  assert.deepEqual(topology.slice(1).map(p => [p.role, p.proofWorker]),
    [['native-ingress-v3-proof-role', false], ['native-ingress-v3-proof-worker', true]]);
  assert.equal(resource(topology).liveProofWorkers, 1);
  assert.equal(resource(topology).maximumProofWorkerRSSBytes, Math.max(topology[1].rssBytes, topology[2].rssBytes));
  assert.equal(nativeResourceFailure(resource(topology)), null);
  assert.equal(productionPreflightForbiddenProcess(topology), null);
});
test('two actual backends still fail the original maximum-one-heavy guard', () => {
  assert.equal(nativeResourceFailure(resource([...topology, { ...topology[2], pid: 33 }])), 'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS');
});
for (const pid of [25, 32]) test(`PID ${pid} retains its own unchanged 3 GiB RSS protection`, () => {
  for (const [extra, expected] of [[0, null], [1, 'NATIVE_PROOF_WORKER_RSS_LIMIT']]) {
    const processes = topology.map(p => p.pid === pid ? { ...p, rssBytes: NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes + extra } : p);
    assert.equal(nativeResourceFailure(resource(processes)), expected);
  }
});
test('proofless route rejects both coordinator and backend independently', () => {
  for (const p of topology.slice(1)) assert.equal(preflightForbiddenProcess([p]), 'V3_PREFLIGHT_OWNER_PROOF_OR_UNKNOWN_DESCENDANT');
});
test('import-only module, wrong paths, legacy collapsed label and spoofed role flags stay rejected', () => {
  for (const name of ['native-ingress-v3-run-bounded.mjs', 'unknown.mjs']) {
    assert.equal(classification(name), null);
    assert.equal(productionPreflightForbiddenProcess([{ role: 'owned-descendant', proofWorker: false }]), 'V3_PREFLIGHT_OWNER_PROOF_OR_UNKNOWN_DESCENDANT');
  }
  assert.equal(classifyNativeIngressV3Executable('/tmp/native-ingress-v3-worker.mjs'), null);
  for (const p of [{ role: 'native-ingress-v3-proof-process', proofWorker: true },
    { role: 'native-ingress-v3-proof-role', proofWorker: true },
    { role: 'native-ingress-v3-proof-worker', proofWorker: false }])
    assert.equal(productionPreflightForbiddenProcess([p]), 'V3_PREFLIGHT_OWNER_PROOF_OR_UNKNOWN_DESCENDANT');
});
test('live and terminal-history policies agree; disallowed history cannot become success', () => {
  const history = topology.map(p => ({ ...p, lastState: 'Z', peakRSSBytes: p.rssBytes }));
  assert.equal(productionPreflightForbiddenProcess(history), null);
  assert.equal(preflightForbiddenProcess(history), 'V3_PREFLIGHT_OWNER_PROOF_OR_UNKNOWN_DESCENDANT');
  assert.equal(productionPreflightForbiddenProcess([...history, { role: 'owned-descendant', proofWorker: false, state: 'Z' }]),
    'V3_PREFLIGHT_OWNER_PROOF_OR_UNKNOWN_DESCENDANT');
  const source = readFileSync(new URL('./native-flow-supervisor.mjs', import.meta.url), 'utf8');
  assert.match(source, /productionPreflightForbiddenProcess\(sample\.ownedProcesses\)/);
  assert.match(source, /productionPreflightForbiddenProcess\(\[\.\.\.history\.values\(\)\]\)/);
  assert.match(source, /const proofResources = nativeProofProcessResources\(group\.processes\)/);
});
test('no relaxed floors, budgets, backend bound or launch gate', () => {
  assert.equal(PREFLIGHT_REAL_RUN_DISABLED, true); assert.equal(PRODUCTION_PREFLIGHT_REAL_RUN_DISABLED, true);
  assert.equal(NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes, 3221225472);
  assert.equal(NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes, 2684354560); assert.equal(NATIVE_FLOW_LIMITS.minimumFreeDiskBytes, 5368709120);
  assert.equal(NATIVE_FLOW_LIMITS.totalMilliseconds, 90 * 60 * 1000); assert.equal(NATIVE_FLOW_LIMITS.sampleMilliseconds, 250);
  assert.equal(nativeResourceFailure({ ...resource(topology), availableRAMBytes: 2684354559 }), 'NATIVE_MEMAVAILABLE_FLOOR');
  assert.equal(nativeResourceFailure({ ...resource(topology), freeDiskBytes: 5368709119 }), 'NATIVE_DISK_FLOOR');
  assert.deepEqual(nativeProofProcessResources(topology.map(p => ({ ...p, state: 'Z' }))),
    { maximumProofWorkerRSSBytes: 0, liveProofWorkers: 0 });
});
