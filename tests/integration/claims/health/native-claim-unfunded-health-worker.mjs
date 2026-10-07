/** Small, source-disabled real worker. This never calls the claim-flow harness,
 * creates an owner/controller, or spawns a proof role. The original supervisor
 * owns its exact process group and resource/deadline enforcement. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, LOCAL } from '../../../../packages/proofs/src/catalog.mjs';
import { createOwnedNativeClaimGraphFixture } from '../../fixtures/claims/lifecycle/owned-native-claim-fixture.mjs';
import { writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { nativeClaimSourcePins } from '../lifecycle/native-claim-source-pins.mjs';
import { nativeClaimRunDirectory } from '../lifecycle/native-claim-run-route.mjs';
import { parseNativeProcStat, assertNativeFlowRunId } from '../../native/native-flow-supervisor.mjs';
import { probeUnfundedPostFactClaimHealth, boundedUnfundedHealthError, unfundedHealthFailureDiagnostic }
  from './native-claim-unfunded-health-probe.mjs';
import { UNFUNDED_HEALTH_REAL_RUN_DISABLED, UNFUNDED_HEALTH_PROFILE, UNFUNDED_HEALTH_RESULT,
  UNFUNDED_HEALTH_LIMITATION, UNFUNDED_HEALTH_VALIDATION_SCOPE, assertUnfundedHealthResult } from './native-claim-unfunded-health-policy.mjs';

async function main() {
  assert.equal(UNFUNDED_HEALTH_REAL_RUN_DISABLED, false, 'NATIVE_UNFUNDED_RUN_REQUIRES_FROZEN_CHECKPOINT');
  assert.equal(process.argv.length, 2); assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.equal(realpathSync(process.cwd()), ROOT); assert.deepEqual(process.execArgv, []);
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  const parentEntry = realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1]));
  const local = nativeClaimRunDirectory(parentEntry, UNFUNDED_HEALTH_PROFILE);
  const lock = JSON.parse(readFileSync(join(ROOT, local, 'active.lock')));
  assert.equal(lock.format, 'FLAT_WALLET_UNFUNDED_CLAIM_HEALTH_LOCK_V1');
  assert.equal(lock.pid, process.ppid); assertNativeFlowRunId(lock.runId);
  assert.equal(lock.attempt, local + '/attempt-' + lock.runId);
  const parentIdentity = parseNativeProcStat(process.ppid, readFileSync(`/proc/${process.ppid}/stat`, 'utf8'));
  assert.equal(parentIdentity.startTimeTicks, lock.supervisorStartTimeTicks);
  const self = parseNativeProcStat(process.pid, readFileSync(`/proc/${process.pid}/stat`, 'utf8'));
  assert.equal(self.pgrp, process.pid); assert.equal(self.session, process.pid);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit');
  assert.equal(realpathSync(directory), directory); mkdirSync(privateDirectory, { mode: 0o700 });
  const proofAttempts = () => existsSync(join(LOCAL, 'attempts')) ? readdirSync(join(LOCAL, 'attempts')).sort() : [];
  const originalProofAttempts = proofAttempts();
  const result = { format: UNFUNDED_HEALTH_RESULT, profile: UNFUNDED_HEALTH_PROFILE, runId: lock.runId,
    validationScope: UNFUNDED_HEALTH_VALIDATION_SCOPE,
    phase: 'starting', success: false, localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, sourcePins: nativeClaimSourcePins(),
    loadedEquivalence: false, fullNativeGraphAcceptance: false, fullWalletAcceptance: false,
    limitation: UNFUNDED_HEALTH_LIMITATION, proofs: [], proofAttemptsUnchanged: false, stages: [],
    cleanup: { closedEvm: false, closedBitcoin: false, closedSolana: false, applicationClosed: false } };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  let fixture, interrupted = false, cleanupPromise;
  const stage = async name => {
    assert.equal(interrupted, false, 'NATIVE_UNFUNDED_INTERRUPTED');
    result.phase = name; result.stages.push({ name, at: new Date().toISOString() }); save();
    process.stdout.write(JSON.stringify({ stage: name }) + '\n');
  };
  async function audit() {
    assert.deepEqual(proofAttempts(), originalProofAttempts, 'NATIVE_UNFUNDED_PROOF_ATTEMPT');
    assert.deepEqual(result.proofs, []); result.proofAttemptsUnchanged = true;
    if (fixture) {
      assert.equal(fixture.owners.length, 0, 'NATIVE_UNFUNDED_OWNER');
      writeFixturePrivate(join(privateDirectory, 'evm.json'), { metadata: fixture.runtime.metadata,
        transactions: fixture.runtime.transactions, receipts: fixture.runtime.receipts });
      for (const [name, native] of [['custody-bitcoin', fixture.bitcoin], ['custody-solana', fixture.solana],
        ['graph-bitcoin', fixture.graphBitcoin], ['graph-solana', fixture.graphSolana]])
        writeFixturePrivate(join(privateDirectory, name + '.json'), { metadata: native.metadata, transfers: native.transfers });
      writeFixturePrivate(join(privateDirectory, 'solana-nonce-bootstrap.json'), {
        bootstrap: fixture.solana.nonceBootstrap, infrastructure: fixture.solana.nonceInfrastructure });
    }
    save();
  }
  function cleanup() {
    cleanupPromise ??= (async () => {
      try {
        if (fixture) result.cleanup = { ...result.cleanup, ...await fixture.close() };
        const value = result.cleanup;
        assert.ok(['closedEvm', 'closedBitcoin', 'closedSolana'].every(key => value[key] === true), 'NATIVE_UNFUNDED_RUNTIME_CLEANUP');
        assert.ok(['owners', 'resources', 'operators'].every(key => Array.isArray(value[key])
          && value[key].every(item => item.closed === true)), 'NATIVE_UNFUNDED_NESTED_CLEANUP');
        value.applicationClosed = true;
      } catch (error) {
        result.cleanup.applicationClosed = false; result.cleanup.error = unfundedHealthFailureDiagnostic(error, 'NATIVE_UNFUNDED_CLEANUP_FAILED');
        result.success = false; result.phase = 'failed'; result.errorCode ??= result.cleanup.error.code; process.exitCode = 1;
      }
      return result.cleanup;
    })();
    return cleanupPromise;
  }
  const stop = () => { interrupted = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  try {
    save(); fixture = await createOwnedNativeClaimGraphFixture(privateDirectory, { onStage: stage, onDeployment: audit });
    result.diagnostic = await probeUnfundedPostFactClaimHealth({ fixture, privateDirectory, stage, audit,
      onReport: async diagnostic => { result.diagnostic = diagnostic; save(); } });
    await audit();
    if (!result.diagnostic.checksPassed) {
      const failure = [...result.diagnostic.claimHealth.flatMap((health, index) => [health, result.diagnostic.claimHealthValidation[index]]),
        result.diagnostic.graphHealth, result.diagnostic.graphCheckpoint].find(value => value?.error);
      throw Object.assign(new Error(failure?.error?.code ?? 'NATIVE_UNFUNDED_HEALTH_FAILED'), failure?.error);
    }
    assert.equal(interrupted, false, 'NATIVE_UNFUNDED_INTERRUPTED');
    result.success = true; result.phase = 'completed';
  } catch (error) {
    result.success = false; result.phase = 'failed'; result.errorCode = unfundedHealthFailureDiagnostic(error, 'NATIVE_UNFUNDED_FAILED').code;
    writeFixturePrivate(join(privateDirectory, 'worker-error.json'), boundedUnfundedHealthError(error));
    if (error.fixtureCleanup) result.cleanup = { ...result.cleanup, ...error.fixtureCleanup };
    try { await audit(); } catch { result.finalAuditUnavailable = true; }
    process.exitCode = 1;
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    try { await audit(); if (result.success) assertUnfundedHealthResult(result); }
    catch (error) { result.success = false; result.phase = 'failed'; result.errorCode ??= unfundedHealthFailureDiagnostic(error, 'NATIVE_UNFUNDED_FAILED').code; process.exitCode = 1; }
    save(); process.stdout.write(JSON.stringify({ phase: result.phase, success: result.success,
      errorCode: result.errorCode ?? null, loadedEquivalence: false }) + '\n');
  }
}
await main();
