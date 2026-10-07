/** Isolated host cleanup tests. Execute only the checked-in cleanup function
 * with synthetic resource handles; never import/run the native harness, start
 * a chain/proof worker, inspect a process, or touch an integration lock. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./native-claim-flow.mjs', import.meta.url), 'utf8');
const cleanupSource = source.match(/^  async function cleanup\(\) \{[\s\S]*?^  \}\n(?=  const stop =)/m)?.[0];
assert.ok(cleanupSource, 'checked-in cleanup function boundary required');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(options = {}) {
  const events = [], process = { exitCode: 0 }, exit = deferred();
  let leased = true, keeperClosed = false, exited = false, replacement, sessionClosed = false;
  const current = { close() {
    events.push('current-controller');
    if (options.controllerError) throw Error('COMBINED_OPERATOR_CLOSED_OR_POISONED');
    assert.equal(leased, true); leased = false;
  } };
  const context = {
    assert, process, closed: false,
    safeCode: error => error.message.split('\n')[0],
    result: { success: true, phase: 'completed', cleanup: {}, ...(options.originalError ? { errorCode: options.originalError } : {}) },
    controller: { close() { throw Error('CLAIM_CONTROLLER_CLOSED'); } },
    claimSession: { async close() {
      if (sessionClosed) return;
      events.push('claim-session'); replacement = current; sessionClosed = true;
    } },
    claimHttp: { async close() {
      events.push('claim-http'); if (options.httpError) throw Error('NATIVE_CLAIM_HTTP_CLOSE_FAILED');
    } },
    nativeClaimSessionController(session) { assert.equal(session, context.claimSession); assert.equal(sessionClosed, true); return replacement; },
    controllerKeeper: {
      status: () => ({ closed: keeperClosed, controllerOpen: leased, keeperRestart: true, keeperProcessId: 12345, keeperProcessExited: exited }),
      async close() {
        events.push('keeper'); assert.equal(leased, false, 'CLAIM_KEEPER_CONTROLLER_STILL_OPEN'); keeperClosed = true;
        if (options.delayExit) await exit.promise;
        exited = !options.missingExit;
      },
    },
    http: undefined, session: undefined, accountKeeper: undefined, accounts: [], portfolio: undefined,
    graphExecution: { async close() { events.push('graph'); } }, proofClients: {},
    fixture: { async close() {
      events.push('fixture'); return { closedEvm: true, closedBitcoin: true, closedSolana: true,
        owners: [{ closed: true }], resources: [{ closed: !options.resourceError }], operators: [{ closed: true }] };
    } },
  };
  const cleanup = vm.runInNewContext('(' + cleanupSource + ')', context);
  return { cleanup, context, events, exit, releaseLease() { leased = false; } };
}

test('cleanup drains the session replacement and every concurrent caller waits for keeper exit', async () => {
  const f = fixture({ delayExit: true }); let firstDone = false, secondDone = false;
  const first = f.cleanup().then(value => { firstDone = true; return value; });
  while (!f.events.includes('keeper')) await new Promise(resolve => setImmediate(resolve));
  const second = f.cleanup().then(value => { secondDone = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(firstDone, false); assert.equal(secondDone, false); assert.ok(!f.events.includes('fixture'));
  f.exit.resolve(); const result = await first; assert.equal(await second, result);
  assert.deepEqual(f.events, ['claim-http', 'claim-session', 'graph', 'current-controller', 'keeper', 'fixture']);
  assert.equal(result.closedController, true); assert.equal(result.closedKeeper, true); assert.equal(result.application.closed, true);
  assert.equal(result.application.keeper.exitObserved, true); assert.equal(result.application.errors.length, 0);
  assert.equal(f.context.result.success, true); assert.equal(f.context.process.exitCode, 0);
});

test('controller and keeper failures remain visible even when fixture resources all close', async () => {
  const f = fixture({ controllerError: true, originalError: 'FLAT_OPERATOR_SIGNING_UNCERTAIN' });
  const result = await f.cleanup();
  assert.equal(result.closedEvm, true); assert.equal(result.closedController, false); assert.equal(result.closedKeeper, false);
  assert.equal(result.application.closed, false); assert.equal(result.application.keeper.exitObserved, false);
  assert.equal(result.application.keeper.controllerOpen, true);
  assert.deepEqual(Array.from(result.application.errors, row => row.name), ['claimController', 'claimKeeper']);
  assert.equal(f.context.result.errorCode, 'FLAT_OPERATOR_SIGNING_UNCERTAIN');
  assert.equal(f.context.result.success, false); assert.equal(f.context.result.phase, 'failed'); assert.equal(f.context.process.exitCode, 1);
  assert.ok(f.events.includes('fixture'));
});

test('a keeper close reply without observed process exit cannot certify cleanup', async () => {
  const f = fixture({ missingExit: true }), result = await f.cleanup();
  assert.equal(result.closedKeeper, false); assert.equal(result.application.closed, false);
  assert.equal(result.application.keeper.processId, 12345); assert.equal(result.application.keeper.exitObserved, false);
  assert.equal(result.application.errors[0].errorCode, 'NATIVE_CLAIM_KEEPER_EXIT_NOT_OBSERVED');
  assert.equal(f.context.result.errorCode, 'NATIVE_CLAIM_CLEANUP_FAILED'); assert.equal(f.context.result.success, false);
});

test('a failed HTTP close still drains the session and stops its replacement keeper', async () => {
  const f = fixture({ httpError: true }), result = await f.cleanup();
  assert.equal(result.closedController, true); assert.equal(result.closedKeeper, true); assert.equal(result.application.closed, false);
  assert.equal(result.application.errors.length, 1); assert.equal(result.application.errors[0].name, 'claimHttp');
  assert.ok(f.events.includes('claim-session')); assert.ok(f.events.includes('fixture'));
});

test('an already released controller from a failed reopen does not prevent child cleanup', async () => {
  const f = fixture(); f.releaseLease();
  const result = await f.cleanup();
  assert.ok(!f.events.includes('current-controller')); assert.equal(result.closedController, true);
  assert.equal(result.closedKeeper, true); assert.equal(result.application.closed, true);
});

test('a nested fixture resource failure prevents a clean report despite all node exit flags', async () => {
  const f = fixture({ resourceError: true }), result = await f.cleanup();
  assert.equal(result.closedEvm, true); assert.equal(result.closedKeeper, true); assert.equal(result.application.closed, false);
  assert.equal(result.application.errors[0].errorCode, 'NATIVE_CLAIM_FIXTURE_CLEANUP_INCOMPLETE');
  assert.equal(f.context.result.success, false);
});
