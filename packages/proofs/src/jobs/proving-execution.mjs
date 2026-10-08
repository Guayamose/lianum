/** Fixed proving execution only. No circuit/VK identity, witness or authority. */
import assert from 'node:assert/strict';
import { join, relative, sep } from 'node:path';
import { ROOT, GOLDEN, EXPERIMENT, PROFILE, LIMITS, operation } from '../catalog.mjs';
import { executionSources as originalExecutionSources, assertSuccessfulAttempt,
  attemptPath, regular, hash } from '../tooling/tooling.mjs';

// One owned process and one private job. Every resource threshold and the
// original compile/key/verification limits retain their exact values.
export const PROVING_LIMITS = Object.freeze({ ...LIMITS, threads: 4 });
// The original authorization relation alone uses eight fixed WASM threads.
// This is a runtime implementation choice, never a request/profile option.
export const AUTHORIZATION_PROVING_LIMITS = Object.freeze({ ...LIMITS, threads: 8 });
export function limitsForMode(spec, mode) {
  if (operation(mode) !== 'prove') return LIMITS;
  return spec.name === 'authorization' ? AUTHORIZATION_PROVING_LIMITS : PROVING_LIMITS;
}

// Runtime pins stay outside the original API/circuit/key identity and the
// original W39 compiler dependency closure. These bytes are already installed.
const WASM_THREAD_RUNTIME_PINS = [
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/helpers/index.js', '8890ec09bacf7216bafc411fec5b9df15964d8431a8650703cc236e6509da3f5'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/helpers/node/index.js', '9b091c5e08adab83e7c8dea7bc0f032d6504ee9caff3feb8b1059b58038ae845'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/helpers/node/node_endpoint.js', 'ae6a5f1d7a8a6b8144108a28c8f855d1d779c18190d526dd86c801aae6dcb49b'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/barretenberg_wasm_thread/index.js', '193d2443d6183a0e24cbf3231cce2f85972700925e3d9f26ae5f3fbd2c2fc9ee'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/barretenberg_wasm_thread/factory/node/index.js', 'f3c4c9236e2fec852f6a452e03aac7b6ca01909a8dca4902bbbaef14c0d8c214'],
  ['@aztec/bb.js/dest/node-cjs/barretenberg_wasm/barretenberg_wasm_thread/factory/node/thread.worker.js', '7b3b5f627b6f7ba98e0ef2902d5aedafe0e190942ef39c10ab177d4c986c473e'],
  ['comlink/dist/umd/comlink.js', '3febbaebdf9b9e2f9ef322eab194c3a35e0068d53a01022dedc99115ff620814'],
 ];
function executionRecord(path) {
  const bytes = regular(path), base = path.startsWith(ROOT + sep) ? ROOT : GOLDEN;
  assert.ok(path.startsWith(base + sep), 'PW_THREAD_EXECUTION_SOURCE_LOCATION');
  return { root: base === ROOT ? 'wallet' : 'golden',
    path: relative(base, path).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) };
}
export function executionSources(spec, mode) {
  const original = originalExecutionSources(spec, mode);
  // The imported policy itself is captured by the original before/after checks.
  const extra = [executionRecord(join(ROOT, 'proof-workers/proving-execution.mjs'))];
  if (operation(mode) === 'prove') {
    for (const [path, expected] of WASM_THREAD_RUNTIME_PINS) {
      const record = executionRecord(join(EXPERIMENT, 'node_modules', path));
      assert.equal(record.sha256, expected, 'PW_OFFICIAL_THREAD_RUNTIME_PIN');
      extra.push(record);
    }
  }
  return [...original, ...extra];
}

/** Public operational receipt only. The existing verifier still checks the
 * actual proof/public inputs against the same original prepared key next. */
export function assertSuccessfulProvingAttempt(spec, runId) {
  const directory = attemptPath(runId);
  const result = JSON.parse(regular(join(directory, 'result.json')));
  const provingLimits = result.threads === AUTHORIZATION_PROVING_LIMITS.threads
    && spec.name === 'authorization' ? AUTHORIZATION_PROVING_LIMITS : PROVING_LIMITS;
  if (result.threads !== provingLimits.threads) {
    assert.equal(result.threads, LIMITS.threads, 'PW_PRIOR_FIXED_THREADS');
    // Preserve the original validator and exact limits for retained proofs.
    return assertSuccessfulAttempt(spec, 'prove', runId);
  }
  const resource = JSON.parse(regular(join(directory, 'resources.json')));
  for (const report of [resource, result]) {
    assert.equal(report.profile, PROFILE, 'PW_PRIOR_PROFILE');
    assert.equal(report.relation, spec.name, 'PW_PRIOR_RELATION');
    assert.equal(operation(report.mode), 'prove', 'PW_PRIOR_MODE');
    assert.equal(report.runId, runId, 'PW_PRIOR_RUN');
    assert.equal(report.phase, 'completed', 'PW_PRIOR_SUCCEEDED');
    assert.deepEqual(report.limits, provingLimits, 'PW_PRIOR_LIMITS');
  }
  assert.equal(resource.exitCode, 0, 'PW_PRIOR_EXIT');
  assert.equal(resource.failure ?? null, null, 'PW_PRIOR_RESOURCE_FAILURE');
  assert.deepEqual(resource.failures, [], 'PW_PRIOR_SUPERVISOR_FAILURES');
  assert.deepEqual(result.wasmThreadExecution, { threads: provingLimits.threads, sharedMemory: true,
    oneOwnedProcess: true, originalPreparedKeyRequired: true }, 'PW_PRIOR_PROVING_THREADS');
  return result;
}
