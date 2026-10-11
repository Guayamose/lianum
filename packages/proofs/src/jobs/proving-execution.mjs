/** Fixed proving execution only. No circuit/VK identity, witness or authority. */
import assert from 'node:assert/strict';
import {usesNativeReservationV1,RESERVATION_NATIVE_PINS_V1,assertNativeReservationReceiptV1} from './reservation-native-execution-v1.mjs';
import {usesNativeNodeV1,NODE_NATIVE_PINS_V1,assertNativeNodeReceiptV1} from './node-native-execution-v1.mjs';
import { usesNativeAuthorizationV1, AUTHORIZATION_NATIVE_PINS_V1, assertNativeAuthorizationReceiptV1 } from './authorization-native-execution-v1.mjs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '@lianum/environment';
import { ROOT, GOLDEN, EXPERIMENT, PROFILE, LIMITS, operation } from '../catalog.mjs';
import { executionSources as originalExecutionSources, assertSuccessfulAttempt,
  attemptPath, regular, hash } from '../tooling/tooling.mjs';

// One owned process and one private job. Every resource threshold and the
// original compile/key/verification limits retain their exact values.
export const PROVING_LIMITS = Object.freeze({ ...LIMITS, threads: 4 });
// Retained authorization proofs use the original eight-thread limits.
// This historical execution profile never becomes a request/profile option.
export const AUTHORIZATION_PROVING_LIMITS = Object.freeze({ ...LIMITS, threads: 8 });
// Retain the exact sixteen-thread execution descriptor for historical receipts.
// Its failed genuine attempt remains rejected by its original resource report.
export const AUTHORIZATION_SIXTEEN_PROVING_LIMITS = Object.freeze({ ...LIMITS, threads: 16 });
// Current authorization jobs have twelve fixed threads. No caller chooses the
// historical or current variants; prepared keys and all resource ceilings stay.
export const AUTHORIZATION_TWELVE_PROVING_LIMITS = Object.freeze({ ...LIMITS, threads: 12 });
// Only current N proving uses native12. Retained N1/N4 receipts keep their fixed original profiles.
export const RESERVATION_NATIVE_PROVING_LIMITS_V1=Object.freeze({...LIMITS,threads:12});
export const NODE_NATIVE_PROVING_LIMITS_V1=Object.freeze({...LIMITS,threads:12});
export function limitsForMode(spec, mode) {
  if (operation(mode) !== 'prove') return LIMITS;
  return spec.name === 'authorization' ? AUTHORIZATION_TWELVE_PROVING_LIMITS : spec.name==='node' ? NODE_NATIVE_PROVING_LIMITS_V1 : spec.name==='reservation' ? RESERVATION_NATIVE_PROVING_LIMITS_V1 : PROVING_LIMITS;
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
const currentSources = Object.freeze([
  fileURLToPath(new URL('../../../engine/src/crypto/private-proof-transit-v1.mjs',import.meta.url)),
  fileURLToPath(new URL('./private-device-proof-input-v2.mjs',import.meta.url)),
  fileURLToPath(new URL('./private-device-authorization-input-v2.mjs',import.meta.url)),
  fileURLToPath(new URL('./private-native-device-authorization-input-v2.mjs',import.meta.url)),
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL('./authorization-native-execution-v1.mjs',import.meta.url)),
  fileURLToPath(new URL('./node-native-execution-v1.mjs',import.meta.url)),
  fileURLToPath(new URL('./reservation-native-execution-v1.mjs',import.meta.url)),
  fileURLToPath(new URL('./standard-proof-resources-v1.mjs',import.meta.url)),
  fileURLToPath(new URL('../host/process-files.mjs',import.meta.url)),
  fileURLToPath(new URL('../host/process-rss.mjs',import.meta.url)),
]);
function executionRecord(path) {
  const bytes = regular(path), base = path.startsWith(ROOT + sep) ? ROOT : GOLDEN;
  if (currentSources.includes(path)) return {root:'active-source',path:relative(projectRoot,path).split(sep).join('/'),bytes:bytes.length,sha256:hash(bytes)};
  assert.ok(path.startsWith(base + sep), 'PW_THREAD_EXECUTION_SOURCE_LOCATION');
  return { root: base === ROOT ? 'wallet' : 'golden',
    path: relative(base, path).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) };
}
export function executionSources(spec, mode) {
  const original = originalExecutionSources(spec, mode);
  // The imported policy itself is captured by the original before/after checks.
  const extra = currentSources.map(executionRecord);
  if (usesNativeAuthorizationV1(spec,mode)||usesNativeNodeV1(spec,mode)||usesNativeReservationV1(spec,mode)) {
    for (const [path,expected] of usesNativeReservationV1(spec,mode)?RESERVATION_NATIVE_PINS_V1:usesNativeNodeV1(spec,mode)?NODE_NATIVE_PINS_V1:AUTHORIZATION_NATIVE_PINS_V1) {
      const record=executionRecord(join(EXPERIMENT,'node_modules',path));
      assert.equal(record.sha256,expected,'PW_NATIVE_OFFICIAL_PIN');extra.push(record);
    }
  }
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
  const provingLimits = spec.name==='reservation'&&result.threads===RESERVATION_NATIVE_PROVING_LIMITS_V1.threads ? RESERVATION_NATIVE_PROVING_LIMITS_V1 : spec.name==='node'&&result.threads===NODE_NATIVE_PROVING_LIMITS_V1.threads ? NODE_NATIVE_PROVING_LIMITS_V1 : spec.name === 'authorization' && result.threads === AUTHORIZATION_TWELVE_PROVING_LIMITS.threads
    ? AUTHORIZATION_TWELVE_PROVING_LIMITS : spec.name === 'authorization' && result.threads === AUTHORIZATION_SIXTEEN_PROVING_LIMITS.threads
      ? AUTHORIZATION_SIXTEEN_PROVING_LIMITS : spec.name === 'authorization' && result.threads === AUTHORIZATION_PROVING_LIMITS.threads
      ? AUTHORIZATION_PROVING_LIMITS : PROVING_LIMITS;
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
  if(spec.name==='reservation'&&result.threads===RESERVATION_NATIVE_PROVING_LIMITS_V1.threads)assertNativeReservationReceiptV1(spec,result,resource);
  else if(spec.name==='node'&&result.threads===NODE_NATIVE_PROVING_LIMITS_V1.threads)assertNativeNodeReceiptV1(spec,result,resource);
  else if (result.nativeBackendExecution !== undefined) assertNativeAuthorizationReceiptV1(spec,result,resource);
  else assert.deepEqual(result.wasmThreadExecution, { threads: provingLimits.threads, sharedMemory: true,
    oneOwnedProcess: true, originalPreparedKeyRequired: true }, 'PW_PRIOR_PROVING_THREADS');
  return result;
}
