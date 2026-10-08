/** Collector diagnostics only. The mocked monotonic/CPU samples exercise
 * bounds and error handling; they do not measure native performance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

let wall = 0;
let user = 0;
let system = 0;
let throwSample = false;
let samples = 0;
mock.module('node:perf_hooks', { exports: { performance: { now() {
  samples++;
  if (throwSample) throw new Error('TEST_DIAGNOSTIC_SAMPLE_FAILED');
  return wall;
} } } });
mock.module('node:process', { exports: { cpuUsage() { return { user, system }; } } });
const metrics = await import('../../../src/claims/operations/operator-audit-metrics.mjs');

function operation() {
  const lifetime = metrics.createClaimOperatorMetricsLifetime();
  const token = metrics.beginClaimOperatorMetrics(lifetime);
  return { lifetime, token };
}
function complete({ lifetime, token }) {
  assert.equal(metrics.finishClaimOperatorMetrics(lifetime, token), true);
  return metrics.claimOperatorMetricsReports(lifetime).at(-1);
}

test('private samples retain numeric aggregates and immutable copies without clock/authority refresh', () => {
  wall = 0; user = 0; system = 0;
  const original = operation();
  const ticket = metrics.enterClaimOperatorMetricsPhase(original.token, 'read-vault', 'operation', 'whole-operation');
  wall = 12; user = 8; system = 3;
  assert.equal(metrics.leaveClaimOperatorMetricsPhase(ticket), true);
  const report = complete(original);
  assert.deepEqual(report.labels[0], { phase: 'read-vault', method: 'operation', round: 'whole-operation',
    invocations: 1, measuredIntervals: 1, wallMilliseconds: 12, maximumWallMilliseconds: 12,
    processUserMicroseconds: 8, processSystemMicroseconds: 3 });
  assert.equal(report.cpuScope, 'PROCESS_INTERVAL_INCLUDES_SIBLING_WORK');
  assert.equal(report.postFenceSamplingAndRetirementNotBudgeted, true);
  assert.equal(report.rpcCounts, null);
  assert.equal(report.keyUsageMeasured, false);
  const count = samples;
  wall = 90_000;
  const next = metrics.claimOperatorMetricsReports(original.lifetime).at(-1);
  assert.equal(samples, count, 'late getter does not sample or renew the operation');
  assert.deepEqual(next, report);
  assert.notEqual(next, report);
  assert.throws(() => { next.labels[0].phase = 'caller-controlled'; }, TypeError);
  assert.equal(Object.hasOwn(report, 'requestId'), false);
});

test('interval saturation loses diagnostic detail while retaining bounded state and continuation', () => {
  const original = operation();
  const tickets = [];
  let continued = 0;
  for (let index = 0; index < 65; index++) {
    tickets.push(metrics.enterClaimOperatorMetricsPhase(original.token, 'current', 'operation', 'whole-operation'));
    continued++;
  }
  assert.equal(tickets.filter(Boolean).length, 64);
  assert.equal(continued, 65);
  for (const ticket of tickets) assert.equal(metrics.leaveClaimOperatorMetricsPhase(ticket), true);
  const report = complete(original);
  assert.equal(report.peakActiveIntervals, 64);
  assert.equal(report.truncated, true);
  assert.equal(report.incomplete, true);
  assert.equal(report.labels[0].invocations, 65);
  assert.equal(report.labels[0].measuredIntervals, 64);
});

test('label cap and report lifetime cap remain bounded without a public identifier', () => {
  const original = operation();
  const phases = ['serial', 'read-vault', 'durable-save', 'read-current-view', 'current',
    'joint-current', 'v4-round', 'v4-facts-round'];
  const methods = ['operation', 'begin-payout', 'redeem', 'reserve-payout', 'debt-health'];
  for (const phase of phases) for (const method of methods) {
    const ticket = metrics.enterClaimOperatorMetricsPhase(original.token, phase, method, 'whole-operation');
    metrics.leaveClaimOperatorMetricsPhase(ticket);
  }
  const report = complete(original);
  assert.equal(report.labels.length, 32);
  assert.equal(report.truncated, true);
  for (let index = 0; index < 12; index++) {
    const token = metrics.beginClaimOperatorMetrics(original.lifetime);
    metrics.finishClaimOperatorMetrics(original.lifetime, token);
  }
  const retained = metrics.claimOperatorMetricsReports(original.lifetime);
  assert.equal(retained.length, 8);
  assert.deepEqual(retained.map(row => row.operationOrdinal), [5, 6, 7, 8, 9, 10, 11, 12]);
});

test('sampling failure and interrupted interval retirement remain diagnostics rather than exceptions', () => {
  const original = operation();
  const ticket = metrics.enterClaimOperatorMetricsPhase(original.token, 'current', 'operation', 'whole-operation');
  throwSample = true;
  try {
    assert.equal(metrics.checkpointClaimOperatorMetrics(original.token), true);
    assert.equal(metrics.leaveClaimOperatorMetricsPhase(ticket), true);
  } finally { throwSample = false; }
  const report = complete(original);
  assert.equal(report.incomplete, true);
  assert.equal(metrics.leaveClaimOperatorMetricsPhase(ticket), true, 'retired ticket grants no new interval');
  const next = operation();
  metrics.enterClaimOperatorMetricsPhase(next.token, 'read-vault', 'operation', 'whole-operation');
  assert.equal(complete(next).incomplete, true, 'unfinished interval is retired, never reused');
});

test('unknown/proxy labels cannot execute caller traps or add arbitrary disclosure fields', () => {
  const original = operation();
  let traps = 0;
  const proxy = new Proxy({}, { get() { traps++; throw new Error('CALLER_TRAP'); } });
  assert.equal(metrics.enterClaimOperatorMetricsPhase(original.token, proxy, 'operation', 'whole-operation'), null);
  assert.equal(metrics.enterClaimOperatorMetricsPhase(original.token, 'current', 'secret-address-or-amount', 'whole-operation'), null);
  assert.equal(traps, 0);
  const report = complete(original);
  assert.equal(report.incomplete, true);
  assert.deepEqual(report.labels, []);
  assert.equal(JSON.stringify(report).includes('secret-address-or-amount'), false);
});
