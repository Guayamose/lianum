/** Orchestration/diagnostic regressions. These execute the exact harness bodies
 * with controlled HTTP/idle observations; they establish no native economics,
 * key use, timing, node, proving or authority from the controlled substrate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync, openSync, closeSync,
  writeFileSync, fsyncSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { privateFailureDiagnostic } from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';

const source = readFileSync(new URL('./development-native-claim-flow.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('  function loadedSolanaSnapshot() {');
const end = source.indexOf('\n  try {\n    save(); fixture = ', begin);
assert.ok(begin >= 0 && end > begin);
assert.equal(source.indexOf('  function loadedSolanaSnapshot() {', begin + 1), -1);
const body = source.slice(begin, end);
const requestId = 'development_native_redemption_1';
const redemption = { requestId, amount: '3000000', maxFee: '5000' };
const metricsSchema = 'DEVELOPMENT_LOADED_SOLANA_REDEMPTION_METRICS_V1';

function report(ordinal) {
  return { schema: 'CLAIM_PRIVATE_OPERATION_METRICS_V1', operationOrdinal: ordinal,
    wallMilliseconds: 1, processUserMicroseconds: 2, processSystemMicroseconds: 3,
    cpuScope: 'PROCESS_INTERVAL_INCLUDES_SIBLING_WORK', wallScope: 'NESTED_INTERVALS_OVERLAP',
    wholeOperationScope: 'TO_LAST_METRICS_SAMPLE_NOT_TERMINAL_AUTHORITY',
    finalizationScope: 'CLEANUP_TO_LAST_SAMPLE_PARTIALLY_MEASURED',
    postFenceSamplingAndRetirementNotBudgeted: true, nonCustodyObserverSeparatePhaseNotMeasured: true,
    incomplete: false, truncated: false, peakActiveIntervals: 2, rpcCounts: null, keyUsageMeasured: false,
    labels: [{ phase: 'current', method: 'presign-payout', round: 'pre-key', invocations: 1,
      measuredIntervals: 1, wallMilliseconds: 1, maximumWallMilliseconds: 1,
      processUserMicroseconds: 2, processSystemMicroseconds: 3, secret: 'HIDDEN_RPC_BODY' }],
    secret: 'HIDDEN_NATIVE_KEY' };
}

function harness(change = () => ({})) {
  const events = [], writes = [], reply = { requestId, action: 'redeem', state: 'RECONCILIATION_REQUIRED',
    errorCode: 'CLAIM_OPERATOR_AUDIT_TOO_OLD' };
  let after = false;
  const activity = operator => ({ schema: operator.branch === 'claim' ? 'CLAIM_PRIVATE_AUDIT_ACTIVITY_V1' : 'GRAPH_PRIVATE_AUDIT_ACTIVITY_V1',
    epochScope: operator.branch === 'claim' ? 'ORIGINAL_CLAIM_V4_KEY_LEASES_ONLY' : 'ORIGINAL_GRAPH_SIGNING_NOTIFICATIONS',
    keyUseEpoch: after ? 8 : 7, originalHistoriesMeasured: true, totalKeyInvocationsMeasured: false,
    authorizationCount: 2, signedAuthorizationCount: 1, factCount: 3, signedFactCount: 1, retainedBindingCount: 1,
    busy: false, branchClosed: false, branchPoisoned: false, custodyClosed: false, custodyPoisoned: false,
    secret: 'HIDDEN_HISTORY_VALUES' });
  const context = { events, writes, reply, after: () => after, activity };
  const bindings = {
    fixture: { operators: [0, 1, 2, 3].map(index => ({ index, branch: 'claim' })),
      graphOperators: [0, 1, 2, 3].map(index => ({ index, branch: 'graph' })) },
    btcToSol: false, claimHttp: { origin: 'http://127.0.0.1:12345', clientAccess: { token: 'HIDDEN_HTTP_TOKEN' } },
    claimSession: { async idle() { events.push('idle'); after = true; return { requests: [reply] }; } },
    nativeClaimSessionController() { events.push('controller'); return {}; },
    nativeClaimSessionPrivateFailures() { events.push('failures'); return []; },
    async fetch(_url, options) { events.push('post'); reply.requestId = JSON.parse(options.body).requestId;
      return { status: 202, async json() { return { admitted: true, requestId: reply.requestId }; },
        body: { async cancel() { events.push('discard-body'); } } }; },
    claimOperatorPrivateAuditActivity(operator) { events.push('claim-activity-' + (after ? 'after' : 'before')); return activity(operator); },
    graphOperatorPrivateAuditActivity(operator) { events.push('graph-activity-' + (after ? 'after' : 'before')); return activity(operator); },
    claimOperatorPrivateAuditMetrics() { events.push('metrics-' + (after ? 'after' : 'before'));
      return { schema: 'CLAIM_PRIVATE_OPERATION_METRICS_VIEW_V1', collectionIncomplete: false,
        reports: after ? [report(10), report(11)] : [report(10)] }; },
    result: { checks: {}, claimRequests: [] },
    save() { events.push('save'); },
    writeFixturePrivate(path, value) { events.push('write-' + value.schema); writes.push({ path, value: structuredClone(value) }); },
    assert, join, privateDirectory: '/private-audit',
  };
  Object.assign(bindings, change(context));
  const make = new Function(...Object.keys(bindings), 'let controller; let loadedSolanaMetrics = null;\n' + body
    + '\nreturn { request: claimRequest, snapshot: loadedSolanaSnapshot, capture: () => loadedSolanaMetrics };');
  return { ...make(...Object.values(bindings)), ...context, bindings };
}

test('first SOL admission captures once before POST and immediately after idle, before controller/save/owner observation', async () => {
  const run = harness();
  assert.equal(await run.request('redeem', redemption), run.reply);
  run.events.push('owner-view');
  assert.equal(run.events.filter(event => event === 'post').length, 1);
  assert.ok(run.events.lastIndexOf('metrics-before') < run.events.indexOf('post'));
  assert.ok(run.events.indexOf('idle') < run.events.indexOf('metrics-after'));
  assert.ok(run.events.lastIndexOf('metrics-after') < run.events.indexOf('controller'));
  assert.ok(run.events.lastIndexOf('metrics-after') < run.events.indexOf('save'));
  assert.ok(run.events.lastIndexOf('metrics-after') < run.events.indexOf('owner-view'));
  const first = run.writes.find(write => write.value.schema === metricsSchema);
  assert.equal(first.path, '/private-audit/loaded-solana-redemption-metrics-v1.json');
  assert.equal(first.value.postIdle, true); assert.equal(first.value.incomplete, false);
  assert.equal(first.value.before.claim[0].activity.keyUseEpoch, 7);
  assert.equal(first.value.after.claim[0].activity.keyUseEpoch, 8);
  assert.deepEqual(first.value.newReports[0], { index: 0, baselineOrdinal: 10, missingReports: 0, reportOrdinals: [11] });
  const originalCapture = run.capture();
  await run.request('redeem', redemption); await run.request('resume', { requestId });
  assert.equal(run.capture(), originalCapture);
  assert.equal(run.writes.filter(write => write.value.schema === metricsSchema).length, 1);
  const json = JSON.stringify(first.value);
  for (const hidden of ['HIDDEN_', requestId, '3000000', '5000']) assert.equal(json.includes(hidden), false);
  assert.equal(Object.hasOwn(run.bindings.result.claimRequests[0], 'metrics'), false);
});

test('busy/gaps and ring limits retain partial observations without changing the original reply', async () => {
  const run = harness(context => ({
    claimOperatorPrivateAuditMetrics() { return { schema: 'CLAIM_PRIVATE_OPERATION_METRICS_VIEW_V1', collectionIncomplete: false,
      reports: context.after() ? Array.from({ length: 9 }, (_, index) => report(index + 15)) : [report(10)] }; },
    graphOperatorPrivateAuditActivity(operator) { return { ...context.activity(operator), busy: context.after() }; },
  }));
  assert.equal(await run.request('redeem', redemption), run.reply);
  const value = run.writes[0].value;
  assert.equal(value.incomplete, true); assert.equal(value.postIdle, true);
  assert.equal(value.after.graph[0].activity.busy, true);
  assert.equal(value.after.claim[0].metrics.reports.length, 8);
  assert.equal(value.newReports[0].missingReports, 4);
  assert.equal(run.reply.state, 'RECONCILIATION_REQUIRED');
  assert.equal(run.events.filter(event => event === 'post').length, 1);
});

test('a failed original idle preserves its exact error and finally records an incomplete diagnostic without another admission', async () => {
  const cause = new Error('CLAIM_OPERATOR_AUDIT_TOO_OLD');
  cause.auditBudget = { phase: 'after-graph-coverage', method: 'presign-payout', round: 'pre-key',
    elapsedMilliseconds: 30001, limitMilliseconds: 30000 };
  const error = new Error('CLAIM_ATTESTATION_UNCERTAIN', { cause });
  const diagnostic = privateFailureDiagnostic(error, 'NATIVE_CLAIM_OPERATION_FAILED');
  const run = harness(() => ({ claimSession: { async idle() { throw error; } },
    nativeClaimSessionPrivateFailures() { return [{ requestId, ...diagnostic, secret: 'HIDDEN_RPC_BODY' }]; } }));
  await assert.rejects(run.request('redeem', redemption), value => value === error && value.cause === cause);
  const value = run.writes[0].value;
  assert.equal(value.postIdle, false); assert.equal(value.incomplete, true);
  assert.deepEqual(value.failures, [diagnostic]);
  assert.equal(value.failures[0].auditBudget.limitMilliseconds, 30000);
  assert.equal(JSON.stringify(value).includes('HIDDEN_'), false);
  assert.equal(run.events.filter(event => event === 'post').length, 1);
});

test('private getter and metrics-write faults never replace the original outcome or trigger a retry', async () => {
  const error = new Error('CLAIM_OPERATOR_AUDIT_TOO_OLD');
  const run = harness(() => ({
    claimOperatorPrivateAuditActivity() { throw new Error('diagnostic getter failure'); },
    writeFixturePrivate(path) { if (path.endsWith('loaded-solana-redemption-metrics-v1.json')) throw new Error('diagnostic write failure'); },
    claimSession: { async idle() { throw error; } },
  }));
  await assert.rejects(run.request('redeem', redemption), value => value === error);
  assert.equal(run.capture().incomplete, true); assert.equal(run.capture().retentionFailed, true);
  assert.equal(run.capture().before.claim[0].activity, null);
  assert.equal(run.events.filter(event => event === 'post').length, 1);
  const normal = harness(() => ({ writeFixturePrivate(path) {
    if (path.endsWith('loaded-solana-redemption-metrics-v1.json')) throw new Error('diagnostic write failure'); } }));
  assert.equal(await normal.request('redeem', redemption), normal.reply);
  assert.equal(normal.reply.errorCode, 'CLAIM_OPERATOR_AUDIT_TOO_OLD');
  assert.equal(normal.capture().retentionFailed, true);
});

test('the original authorization-failure branch keeps its real label and never reaches confirmation/resume', async () => {
  const start = source.indexOf("      if (reply.state !== 'CONFIRMED') {");
  const finish = source.indexOf("      assert.equal(reply.state, 'CONFIRMED', reply.errorCode);", start);
  assert.ok(start >= 0 && finish > start);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const branch = new AsyncFunction('reply', 'btcToSol', 'writeFixturePrivate', 'join', 'privateDirectory',
    'controller', 'fixture', 'ticket', 'confirmOriginal', 'claimRequest', 'redemption', 'assert', source.slice(start, finish));
  let confirmations = 0, resumes = 0, controllerCalls = 0;
  const controller = { async privateNativeReceipt() { controllerCalls++; return { broadcastAttempts: 1 }; } };
  await assert.rejects(branch({ state: 'RECONCILIATION_REQUIRED', errorCode: 'CLAIM_OPERATOR_AUDIT_TOO_OLD' }, false,
    () => assert.fail('unexpected write'), join, '/private', controller, {}, { ticketId: 'original' },
    async () => { confirmations++; }, async () => { resumes++; }, redemption, assert),
  error => error instanceof assert.AssertionError && error.message.includes('CLAIM_OPERATOR_AUDIT_TOO_OLD'));
  assert.equal(controllerCalls, 0); assert.equal(confirmations, 0); assert.equal(resumes, 0);
});

test('the unchanged private writer persists the new bounded redacted snapshot with mode 0600', async () => {
  const fixtureURLs = [new URL('../../fixtures/runners/owned-flat-fixture.mjs', import.meta.url),
    new URL('../../owned-flat-fixture.mjs', import.meta.url)].filter(url => existsSync(url));
  assert.equal(fixtureURLs.length, 1, 'one public or generated fixture writer source is required');
  const fixtureSource = readFileSync(fixtureURLs[0], 'utf8');
  const start = fixtureSource.indexOf('export function writeFixturePrivate(file, value) {');
  const finish = fixtureSource.indexOf('\nexport async function ', start);
  assert.ok(start >= 0 && finish > start);
  const writer = new Function('openSync', 'writeFileSync', 'fixtureJSON', 'fsyncSync', 'closeSync', 'renameSync',
    'dirname', 'freshFixtureId', fixtureSource.slice(start + 'export '.length, finish) + '\nreturn writeFixturePrivate;')
    (openSync, writeFileSync, value => JSON.stringify(value) + '\n', fsyncSync, closeSync, renameSync,
      dirname, () => randomBytes(16).toString('hex'));
  const directory = mkdtempSync(join(tmpdir(), 'lianum-loaded-solana-host-'));
  try {
    const run = harness(() => ({ privateDirectory: directory, writeFixturePrivate: writer }));
    await run.request('redeem', redemption);
    const path = join(directory, 'loaded-solana-redemption-metrics-v1.json');
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const bytes = readFileSync(path);
    assert.ok(bytes.length < 64 * 1024);
    assert.equal(JSON.parse(bytes).authority, 'PRIVATE_DIAGNOSTIC_ONLY');
    assert.equal(bytes.includes(Buffer.from('HIDDEN_')), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
