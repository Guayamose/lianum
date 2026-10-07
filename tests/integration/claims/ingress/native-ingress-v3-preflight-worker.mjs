/** Fixed source-disabled worker. Original supervisor owns every descendant. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREFLIGHT_REAL_RUN_DISABLED, PREFLIGHT_PROFILE, PREFLIGHT_RESULT, assertNativeIngressV3PreflightResult } from './native-ingress-v3-preflight-policy.mjs';
async function main() {
  assert.equal(PREFLIGHT_REAL_RUN_DISABLED, false, 'V3_PREFLIGHT_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
  const { ROOT, LOCAL } = await import('../../../../packages/proofs/src/catalog.mjs');
  const { createOwnedNativeClaimIngressV3PreflightFixture } = await import('../../fixtures/claims/ingress/owned-native-ingress-v3-preflight-fixture.mjs');
  const { probeNativeIngressV3Proofless } = await import('./native-ingress-v3-preflight.mjs');
  const { writeFixturePrivate } = await import('../../fixtures/runners/owned-flat-fixture.mjs');
  const { nativeClaimSourcePins } = await import('../lifecycle/native-claim-source-pins.mjs');
  const { nativeClaimRunDirectory } = await import('../lifecycle/native-claim-run-route.mjs');
  const { parseNativeProcStat, assertNativeFlowRunId } = await import('../../native/native-flow-supervisor.mjs');
  assert.equal(process.argv.length, 2); assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.equal(realpathSync(process.cwd()), ROOT); assert.deepEqual(process.execArgv, []);
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']); assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean); assert.equal(parent.length, 2);
  const parentEntry = realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1]));
  const local = nativeClaimRunDirectory(parentEntry, PREFLIGHT_PROFILE), lock = JSON.parse(readFileSync(join(ROOT, local, 'active.lock')));
  assert.equal(lock.format, 'LIANUM_NATIVE_INGRESS_V3_PREFLIGHT_LOCK_V1'); assert.equal(lock.pid, process.ppid); assertNativeFlowRunId(lock.runId);
  assert.equal(lock.attempt, local + '/attempt-' + lock.runId);
  assert.equal(parseNativeProcStat(process.ppid, readFileSync(`/proc/${process.ppid}/stat`, 'utf8')).startTimeTicks, lock.supervisorStartTimeTicks);
  const self = parseNativeProcStat(process.pid, readFileSync(`/proc/${process.pid}/stat`, 'utf8')); assert.equal(self.pgrp, process.pid); assert.equal(self.session, process.pid);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit');
  assert.equal(realpathSync(directory), directory); mkdirSync(privateDirectory, { mode: 0o700 });
  const proofRoots = [join(LOCAL, 'attempts'), join(ROOT, '.local/proof-workers-native-ingress-v3/attempts'),
    join(ROOT, '.local/proof-workers-native-ingress-v3/job-claims')];
  const sharedProofLock = join(LOCAL, 'active.lock'); assert.equal(existsSync(sharedProofLock), false, 'V3_PREFLIGHT_SHARED_PROOF_LOCK');
  const attempts = () => proofRoots.map(root => existsSync(root) ? readdirSync(root).sort() : []), originalAttempts = attempts();
  const result = { format: PREFLIGHT_RESULT, profile: PREFLIGHT_PROFILE, runId: lock.runId, phase: 'starting', success: false,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, supervisor: { supervisorPID: process.ppid, workerPID: process.pid },
    sourcePins: nativeClaimSourcePins(), proofs: [], proofAttemptsUnchanged: false, stages: [],
    cleanup: { closedEvm: false, closedBitcoin: false, closedSolana: false, applicationClosed: false } };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  let fixture, interrupted = false, cleanupPromise;
  const code = error => /^[A-Z][A-Z0-9_]{2,160}$/.test(error?.message ?? '') ? error.message : 'V3_PREFLIGHT_FAILED';
  const audit = async () => {
    assert.equal(existsSync(sharedProofLock), false, 'V3_PREFLIGHT_SHARED_PROOF_LOCK');
    assert.deepEqual(attempts(), originalAttempts, 'V3_PREFLIGHT_NO_NEW_PROOF_ATTEMPT'); result.proofAttemptsUnchanged = true;
    if (fixture) { assert.equal(fixture.owners.length, 0, 'V3_PREFLIGHT_NO_OWNER');
      for (const native of [fixture.bitcoin, fixture.solana, fixture.graphBitcoin, fixture.graphSolana]) assert.deepEqual(native.transfers, [], 'V3_PREFLIGHT_NO_NATIVE_EFFECT'); }
    save();
  };
  const stage = async name => { assert.equal(interrupted, false, 'V3_PREFLIGHT_INTERRUPTED'); result.phase = name; result.stages.push(name); save(); };
  const stop = () => { interrupted = true; }; process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const cleanup = () => cleanupPromise ??= (async () => {
    try {
      if (fixture) result.cleanup = { ...result.cleanup, ...await fixture.close() };
      assert.ok(['closedEvm', 'closedBitcoin', 'closedSolana'].every(k => result.cleanup[k] === true), 'V3_PREFLIGHT_RUNTIME_CLEANUP');
      assert.ok(['owners', 'resources', 'operators'].every(k => Array.isArray(result.cleanup[k]) && result.cleanup[k].every(v => v.closed === true)), 'V3_PREFLIGHT_NESTED_CLEANUP');
      result.cleanup.applicationClosed = true;
    } catch (error) { result.success = false; result.phase = 'failed'; result.errorCode ??= code(error); process.exitCode = 1; }
  })();
  try {
    save(); fixture = await createOwnedNativeClaimIngressV3PreflightFixture(privateDirectory, { onStage: stage, onDeployment: audit });
    result.diagnostic = await probeNativeIngressV3Proofless({ fixture });
    await audit(); assert.equal(interrupted, false, 'V3_PREFLIGHT_INTERRUPTED'); result.success = true; result.phase = 'completed';
  } catch (error) { result.success = false; result.phase = 'failed'; result.errorCode = code(error);
    if (error.fixtureCleanup) result.cleanup = { ...result.cleanup, ...error.fixtureCleanup }; process.exitCode = 1;
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    try { await audit(); if (result.success) assertNativeIngressV3PreflightResult(result); }
    catch (error) { result.success = false; result.phase = 'failed'; result.errorCode ??= code(error); process.exitCode = 1; }
    save(); process.stdout.write(JSON.stringify({ phase: result.phase, success: result.success, errorCode: result.errorCode ?? null }) + '\n');
  }
}
await main();
