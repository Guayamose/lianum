/** UNTESTED DRAFT. Fixed fresh empty inventory diagnostic, never a payout flow. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpuUsage } from 'node:process';
import { ROOT, LOCAL, GOLDEN } from '../../../../packages/proofs/src/catalog.mjs';
import { NATIVE_INGRESS_V3_LOCAL } from '../../../../packages/proofs/src/native-ingress/metadata/native-ingress-v3-profile.mjs';
import { claimOperatorPrivateAuditActivity, claimOperatorPrivateAuditMetrics }
  from '../../../../packages/backend/src/claims/operations/operators.mjs';
import { graphOperatorPrivateAuditActivity }
  from '../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { privateFailureDiagnostic }
  from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import { createOwnedNativeClaimGraphV3Fixture } from '../../fixtures/claims/lifecycle/owned-native-claim-fixture.mjs';
import { writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { EMPTY_AUDIT_PROFILE, EMPTY_AUDIT_RESULT, EMPTY_AUDIT_ACTIVITY_SCOPE,
  EMPTY_AUDIT_ORDER, assertEmptyAuditActivity } from './native-claim-empty-audit-policy-v1.mjs';
import { nativeClaimEmptyAuditSourcePins } from './native-claim-empty-audit-source-pins-v1.mjs';

const LOCAL_RUN = '.local/native-claim-empty-audit-metrics-v1';
const ENTRY = join(ROOT, 'integration/claims/metrics/run-native-claim-empty-audit-v1.mjs');
const code = error => String(error?.message ?? '').match(/\b(?:EMPTY_AUDIT|CLAIM|FLAT|COMBINED_OPERATOR|SOLANA|BITCOIN|NATIVE|LOCAL_EVM)_[A-Z0-9_]+\b/)?.[0]
  ?? 'EMPTY_AUDIT_FAILED';

export async function runNativeClaimEmptyAudit() {
  assert.equal(arguments.length, 0, 'EMPTY_AUDIT_NO_WORKER_OPTIONS');
  assert.equal(process.argv.length, 2);
  assert.deepEqual(process.execArgv, []);
  assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin');
  assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])), ENTRY);
  const lock = JSON.parse(readFileSync(join(ROOT, LOCAL_RUN, 'active.lock')));
  assert.equal(lock.pid, process.ppid);
  assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, LOCAL_RUN + '/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt);
  const privateDirectory = join(directory, 'private-audit');
  mkdirSync(privateDirectory, { mode: 0o700 });
  const result = { format: EMPTY_AUDIT_RESULT, profile: EMPTY_AUDIT_PROFILE, runId: lock.runId,
    validationScope: 'BASE_EMPTY_AUDIT_MEASURED', startedAt: new Date().toISOString(), phase: 'starting', success: false,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, nativeSelfCustody: false,
    independentOperators: false, loadedEquivalence: false, financialAcceptance: false,
    fullWalletAcceptance: false, payoutAuthorizationReproduced: false,
    sourcePins: nativeClaimEmptyAuditSourcePins(),
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid },
    proofs: [], ownersCreated: 0, calls: [], stages: [], cleanup: { errors: [] },
    disclosure: [
      'Fresh original empty CLAIM/GRAPH operator inventories only; six explicit audit() calls.',
      'Bootstrap has real synthetic keys, native transactions and contract deployments; audit-phase comparisons start after bind.',
      'Original CLAIM V4 epochs and persisted histories are measured; total legacy or ephemeral key invocations are not measured.',
      'CLAIM interval reports are partial and overlapping. CPU includes process siblings; no RPC or queue measurement is collected.',
      'This does not reproduce presign, BEGIN_PAYOUT, loaded inventories, full quorum signing or native process recovery.',
    ] };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  const stage = async name => {
    result.phase = name;
    result.stages.push({ name, at: new Date().toISOString() });
    save();
    process.stdout.write(JSON.stringify({ stage: name }) + '\n');
  };
  const attempts = () => [join(LOCAL, 'attempts'), join(NATIVE_INGRESS_V3_LOCAL, 'attempts'),
    join(GOLDEN, 'evidence/paeg-proof-attempts')].map(path => ({ path,
    files: existsSync(path) ? readdirSync(path).sort() : [] }));
  const beforeProofAttempts = attempts();
  let fixture, interrupted = false;
  const stop = () => { interrupted = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  const beforeCall = () => assert.equal(interrupted, false, 'EMPTY_AUDIT_INTERRUPTED');
  const activity = () => {
    const before = nativeClaimEmptyAuditSourcePins();
    assert.deepEqual(before, result.sourcePins, 'EMPTY_AUDIT_SNAPSHOT_SOURCE_CHANGED');
    const rows = {
      claim: fixture.operators.map(operator => claimOperatorPrivateAuditActivity(operator)),
      graph: fixture.graphOperators.map(operator => graphOperatorPrivateAuditActivity(operator)),
    };
    for (const branch of ['claim', 'graph'])
      for (const row of rows[branch]) assert.equal(row.busy, false, 'EMPTY_AUDIT_SNAPSHOT_BUSY');
    assert.deepEqual(nativeClaimEmptyAuditSourcePins(), before, 'EMPTY_AUDIT_SNAPSHOT_SOURCE_CHANGED');
    return rows;
  };
  try {
    beforeCall();
    fixture = await createOwnedNativeClaimGraphV3Fixture(privateDirectory, { onStage: stage });
    beforeCall();
    assert.equal(fixture.operators.length, 4);
    assert.equal(fixture.graphOperators.length, 4);
    assert.equal(fixture.owners.length, 0);
    const transactionsAfterSetup = fixture.runtime.transactions.length;
    result.activity = { scope: EMPTY_AUDIT_ACTIVITY_SCOPE, originalHistoriesMeasured: true,
      totalKeyInvocationsMeasured: false, before: activity(), after: null };
    result.activity.after = result.activity.before;
    assertEmptyAuditActivity(result.activity);
    const callTargets = [...fixture.operators.slice(0, 3), ...fixture.graphOperators.slice(0, 3)];
    for (let index = 0; index < callTargets.length; index++) {
      beforeCall();
      await stage('audit-' + EMPTY_AUDIT_ORDER[index]);
      const started = performance.now(), cpu = cpuUsage();
      // This is the exact original facade; no health/sign/facts/authorization
      // call is selected. Await drains it fully before the next original audit.
      await callTargets[index].audit();
      const finished = performance.now(), cpuAfter = cpuUsage();
      result.calls.push({ label: EMPTY_AUDIT_ORDER[index], completed: true,
        wallMilliseconds: finished - started,
        processCpuMicroseconds: cpuAfter.user - cpu.user + cpuAfter.system - cpu.system,
        cpuScope: 'PROCESS_INTERVAL_INCLUDES_SIBLING_WORK' });
      beforeCall();
      save();
    }
    result.activity.after = activity();
    assertEmptyAuditActivity(result.activity);
    result.claimMetrics = fixture.operators.map(operator => claimOperatorPrivateAuditMetrics(operator));
    const final = await fixture.observer.read();
    await fixture.observer.assertCurrent(final);
    result.emptyClaimState = final.gateways.map(gateway => Object.fromEntries(
      ['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees',
        'intentCount', 'ticketCount', 'activePayout'].map(name => [name, gateway[name]])));
    result.nativeEffects = { bitcoin: fixture.bitcoin.transfers.length, solana: fixture.solana.transfers.length,
      graphBitcoin: fixture.graphBitcoin.transfers.length, graphSolana: fixture.graphSolana.transfers.length };
    result.evmTransactionsAfterSetup = fixture.runtime.transactions.length - transactionsAfterSetup;
    assert.equal(fixture.owners.length, 0);
    assert.deepEqual(attempts(), beforeProofAttempts, 'EMPTY_AUDIT_PROOF_ATTEMPT_CHANGED');
    result.proofAttemptsUnchanged = true;
    assert.deepEqual(nativeClaimEmptyAuditSourcePins(), result.sourcePins, 'EMPTY_AUDIT_SOURCE_CHANGED');
    result.sourceUnchanged = true;
    beforeCall();
    result.success = true;
  } catch (error) {
    result.success = false;
    result.failureCode = code(error);
    writeFixturePrivate(join(privateDirectory, 'error.json'), {
      code: result.failureCode, diagnostic: privateFailureDiagnostic(error), stack: error.stack });
    if (fixture) {
      try {
        result.claimMetrics = fixture.operators.map(operator => claimOperatorPrivateAuditMetrics(operator));
        if (result.activity) result.activity.after = activity();
      } catch (diagnosticError) {
        result.diagnosticIncomplete = true;
        writeFixturePrivate(join(privateDirectory, 'diagnostic-error.json'), {
          code: code(diagnosticError), stack: diagnosticError.stack });
      }
    } else if (error.fixtureCleanup) result.cleanup = error.fixtureCleanup;
  } finally {
    if (fixture) {
      try {
        const close = await fixture.close();
        result.cleanup = { ...close, errors: [] };
        for (const name of ['closedEvm', 'closedBitcoin', 'closedSolana'])
          if (close[name] !== true) result.cleanup.errors.push('EMPTY_AUDIT_' + name.toUpperCase() + '_UNCONFIRMED');
        for (const row of [...close.operators, ...close.resources, ...close.owners])
          if (row.closed !== true) result.cleanup.errors.push('EMPTY_AUDIT_APPLICATION_CLOSE_UNCONFIRMED');
        result.cleanup.evmScratch = await fixture.runtime.close({ removeScratch: true });
      } catch (cleanupError) {
        result.cleanup.errors ??= [];
        result.cleanup.errors.push('EMPTY_AUDIT_CLEANUP_UNCONFIRMED');
        writeFixturePrivate(join(privateDirectory, 'cleanup-error.json'), {
          code: code(cleanupError), stack: cleanupError.stack });
      }
    }
    if (result.cleanup.errors?.length) result.success = false;
    result.phase = result.success ? 'completed' : 'rejected';
    result.finishedAt = new Date().toISOString();
    save();
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
  }
  process.stdout.write(JSON.stringify({ phase: result.phase, success: result.success,
    code: result.failureCode ?? null, auditCalls: result.calls.length, proofs: 0 }) + '\n');
  if (!result.success) process.exitCode = 1;
}

await runNativeClaimEmptyAudit();
