/** Host-only scheduling/resource diagnostics. No proofs or native processes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assemblyNativeScenarioProfile, runAssemblyNativeIntegration } from '../../../../scripts/engine/integration/assembly/integration-private-assembly-native.mjs';
import { ASSEMBLY_WORKER_RESOURCE_FLOORS, assemblyWorkerResourceViolations } from '../../src/assembly/private-assembly-actors.mjs';

test('default profile preserves all three schedules and two consumed effect pairs', () => {
  assert.deepEqual(assemblyNativeScenarioProfile(), { name: 'full', runSuccessSchedules: true, runTimeoutSchedule: true, runPaidControlSchedule: false, completedEffectPairs: 2, requestedSchedules: ['A', 'B', 'C'] });
});
test('timeout-only profile requests one fresh C and no prior success effects', () => {
  const p = assemblyNativeScenarioProfile('timeout-only');
  assert.deepEqual(p, { name: 'timeout-only', runSuccessSchedules: false, runTimeoutSchedule: true, runPaidControlSchedule: false, completedEffectPairs: 0, requestedSchedules: ['C'] });
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.requestedSchedules));
});
test('arbitrary or mistyped scenario profiles are refused', () => {
  for (const p of ['C', 'success', '', null, true, 1, {}, []]) assert.throws(() => assemblyNativeScenarioProfile(p), /PC18_NATIVE_SCENARIO_PROFILE/);
});
test('all scenario profiles remain behind the explicit native and restored source guard', async () => {
  for (const scenarioProfile of ['full', 'timeout-only', 'paid-control']) {
    await assert.rejects(runAssemblyNativeIntegration({ scenarioProfile }), /PC18_EXPLICIT_POST_CAPABILITY_NATIVE_GO_REQUIRED/);
    await assert.rejects(runAssemblyNativeIntegration({ scenarioProfile, authorizedNativeRun: true }), /PC18_RECOVERY_ISSUANCE_ONLY_APPROVAL_REQUIRED/);
    await assert.rejects(runAssemblyNativeIntegration({ scenarioProfile, authorizedNativeRun: true, refundIssuanceOnly: true }), /PC18_REVISION4_REPAIR_REQUIRED_BEFORE_NATIVE_RUN/);
  }
});
test('measured profile enforces 2.5GiB host reserve, 5GiB disk reserve and 3GiB worker budget', () => {
  assert.deepEqual(ASSEMBLY_WORKER_RESOURCE_FLOORS, { availableRAM: 2.5 * 1024 ** 3, freeDisk: 5 * 1024 ** 3 });
  assert.deepEqual(assemblyWorkerResourceViolations({ ...ASSEMBLY_WORKER_RESOURCE_FLOORS }), []);
  assert.deepEqual(assemblyWorkerResourceViolations({ ...ASSEMBLY_WORKER_RESOURCE_FLOORS, childRSS:3*1024**3 }), []);
  assert.deepEqual(assemblyWorkerResourceViolations({ ...ASSEMBLY_WORKER_RESOURCE_FLOORS, childRSS:3*1024**3+1 }), ['childRSS']);
  assert.deepEqual(assemblyWorkerResourceViolations({ ...ASSEMBLY_WORKER_RESOURCE_FLOORS, availableRAM: ASSEMBLY_WORKER_RESOURCE_FLOORS.availableRAM - 1 }), ['availableRAM']);
  assert.deepEqual(assemblyWorkerResourceViolations({ ...ASSEMBLY_WORKER_RESOURCE_FLOORS, freeDisk: ASSEMBLY_WORKER_RESOURCE_FLOORS.freeDisk - 1 }), ['freeDisk']);
  assert.deepEqual(assemblyWorkerResourceViolations({ availableRAM: 0, freeDisk: 0 }), ['availableRAM', 'freeDisk']);
});
test('invalid numerical telemetry is not accepted as a resource observation', () => {
  for (const r of [null, {}, { availableRAM: -1, freeDisk: 1 }, { availableRAM: '1', freeDisk: 1 }, { availableRAM: Infinity, freeDisk: 1 }, { availableRAM: 1, freeDisk: NaN }]) assert.throws(() => assemblyWorkerResourceViolations(r), /PC18_WORKER_RESOURCE_SAMPLE/);
});

test('paid-control profile requests exactly one fresh A without C or unrelated-insertion stress', () => {
  assert.deepEqual(assemblyNativeScenarioProfile('paid-control'), { name: 'paid-control', runSuccessSchedules: false, runTimeoutSchedule: false, runPaidControlSchedule: true, completedEffectPairs: 1, requestedSchedules: ['A'] });
});
