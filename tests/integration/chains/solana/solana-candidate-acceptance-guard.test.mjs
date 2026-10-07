/** Host-only lifecycle guard tests: synthetic /proc, resources and signal sink.
 * No process is spawned or signalled. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const golden = fileURLToPath(new URL('../../../omnichain-product/', import.meta.url));
const executable = golden + '.local/linux-runtimes/HOST_ONLY/solana-test-validator';
let fixture;
const missing = () => Object.assign(Error('HOST_ONLY_MISSING'), { code: 'ENOENT' });
const named = module => Object.fromEntries(Object.entries(module).filter(([key]) => key !== 'default' && key !== 'module.exports'));
mock.module('node:fs', { exports: { ...named(fs),
  lstatSync(path) { return fixture.actualProc ? fs.lstatSync(path) : { uid: fixture.uid ?? process.getuid() }; },
  readdirSync(path) { assert.equal(path, '/proc');
    if (fixture.denyEnumeration) throw Object.assign(Error('HOST_ONLY_DENIED'), { code: 'EACCES' });
    if (fixture.actualProc) return fs.readdirSync(path);
    return fixture.live ? ['987654'] : []; },
  readlinkSync(path) { if (fixture.actualProc) return fs.readlinkSync(path);
    assert.equal(path, '/proc/987654/exe'); if (!fixture.live) throw missing();
    if (fixture.denyExe) throw Object.assign(Error('HOST_ONLY_DENIED'), { code: 'EACCES' });
    return fixture.executable; },
  readFileSync(path) {
    if (path === `/proc/${process.pid}/task/${process.pid}/children`) {
      fixture.childrenReads = (fixture.childrenReads ?? 0) + 1;
      if (fixture.missingChildren) throw missing();
      return fixture.live ? '987654' : '';
    }
    if (fixture.actualProc) return fs.readFileSync(path, 'utf8');
    if (path === '/proc/meminfo') return `MemAvailable: ${fixture.availableRAM / 1024} kB\n`;
    assert.equal(path, '/proc/987654/stat'); if (!fixture.live) throw missing();
    if (fixture.denyStat) throw Object.assign(Error('HOST_ONLY_DENIED'), { code: 'EACCES' });
    if (fixture.malformedStat) return 'HOST_ONLY_MALFORMED_STAT';
    const fields = Array(25).fill('0'); fields[0] = 'S'; fields[1] = String(fixture.ppid); fields[19] = fixture.start;
    return '987654 (' + (fixture.command ?? 'solana-test-val') + ') ' + fields.join(' ');
  },
  statfsSync(path, options) { return fixture.actualProc ? fs.statfsSync(path, options) : { bavail: 5368709120n, bsize: 1n }; },
} });
const runtimeBrands = new WeakSet();
mock.module(new URL('../wallet-platform/modules/chain-adapters/owned-solana-runtime.mjs', import.meta.url).href, { exports: {
  assertOwnedSolanaRuntime(runtime) { assert.ok(runtimeBrands.has(runtime), 'HOST_ONLY_BRANDED_RUNTIME_REQUIRED'); },
} });
const { createCandidateResourceGuard, assertCandidateNoParallelHeavyWork } = await import('./solana-candidate-acceptance-guard.mjs');
const signals = [];
mock.method(process, 'kill', (pid, signal) => { signals.push({ pid, signal }); fixture.live = false; });
const reset = extra => { signals.length = 0; fixture = { live: true, ppid: process.pid, start: '1234',
  executable, availableRAM: 2684354560, ...extra }; };

test('guard rejects parallel heavy work before runtime creation', () => {
  reset(); assert.throws(() => assertCandidateNoParallelHeavyWork(), /PARALLEL_HEAVY_WORK/);
  assert.deepEqual(signals, []);
});

test('other-user processes are outside the concurrent developer-job scan', () => {
  reset({ uid: process.getuid() + 1 });
  assert.doesNotThrow(() => assertCandidateNoParallelHeavyWork());
  assert.deepEqual(signals, []);
});

for (const command of ['systemd', '(sd-pam)', 'ssh-agent']) {
  test('unrelated ' + command + ' does not require privileged executable visibility', () => {
    reset({ command, ppid: process.pid + 1, denyExe: true });
    assert.doesNotThrow(() => assertCandidateNoParallelHeavyWork()); assert.deepEqual(signals, []);
  });
}

test('an unreadable developer job is blocked and a truncated heavy command is rejected before exe', () => {
  reset({ command: 'unknown-job', ppid: process.pid + 1, denyExe: true });
  assert.throws(() => assertCandidateNoParallelHeavyWork(), /PROCESS_IDENTITY_UNREADABLE/);
  reset({ command: 'solana-test-val', ppid: process.pid + 1, denyExe: true });
  assert.throws(() => assertCandidateNoParallelHeavyWork(), /PARALLEL_HEAVY_WORK/);
  assert.deepEqual(signals, []);
});

test('unrelated parent is rejected before inaccessible executable inspection', async () => {
  reset({ ppid: process.pid + 1, denyExe: true });
  const guard = createCandidateResourceGuard(); assert.doesNotThrow(() => guard.check());
  assert.deepEqual(await guard.finish(), { sampledResourceFloorsHeld: true, ownedChildGone: true, forced: false });
  assert.deepEqual(signals, []);
});

test('resource failure signals only the captured exact owned child and verifies it is gone', async () => {
  reset(); const guard = createCandidateResourceGuard(); guard.verifyRuntimePID(987654);
  fixture.availableRAM -= 1024;
  assert.throws(() => guard.check(), /MEMAVAILABLE_FLOOR/);
  assert.deepEqual(signals, [{ pid: 987654, signal: 'SIGTERM' }]);
  await assert.rejects(guard.finish(), /MEMAVAILABLE_FLOOR/);
});

test('PID replacement is never adopted or signalled', async () => {
  reset(); const guard = createCandidateResourceGuard(); guard.verifyRuntimePID(987654);
  fixture.start = '5678';
  assert.throws(() => guard.check()); await assert.rejects(guard.finish());
  assert.deepEqual(signals, []);
});

test('cleanup failure still stops the exact owned child before reporting failure', async () => {
  reset(); const guard = createCandidateResourceGuard(); guard.verifyRuntimePID(987654);
  await assert.rejects(guard.finish(), /CHILD_STILL_RUNNING/);
  assert.deepEqual(signals, [{ pid: 987654, signal: 'SIGTERM' }]);
  assert.equal(fixture.live, false);
});

test('successful owned cleanup clears guard and leaves signal sink untouched', async () => {
  reset(); const guard = createCandidateResourceGuard(); guard.verifyRuntimePID(987654); fixture.live = false;
  assert.deepEqual(await guard.finish(), { sampledResourceFloorsHeld: true, ownedChildGone: true, forced: false });
  assert.deepEqual(signals, []);
});

for (const lostVisibility of ['denyStat', 'denyExe', 'malformedStat']) {
  test('captured child ' + lostVisibility + ' neither signals nor claims cleanup', async () => {
    reset(); const guard = createCandidateResourceGuard(); guard.verifyRuntimePID(987654);
    fixture[lostVisibility] = true;
    assert.throws(() => guard.check());
    assert.throws(() => guard.verifyRuntimePID(987654));
    await assert.rejects(guard.finish(), /PROCESS_IDENTITY_UNREADABLE|PROCESS_STAT_MALFORMED/);
    assert.deepEqual(signals, []);
  });
}

for (const changed of ['executable', 'parent']) {
  test('same-start-time ' + changed + ' change stays unknown and is never signalled', async () => {
    reset(); const guard = createCandidateResourceGuard(); guard.verifyRuntimePID(987654);
    if (changed === 'executable') fixture.executable = golden + '.local/linux-runtimes/CHANGED/solana-test-validator';
    else fixture.ppid = process.pid + 1;
    assert.throws(() => guard.check());
    await assert.rejects(guard.finish(), /PROCESS_IDENTITY_CHANGED/);
    assert.deepEqual(signals, []);
  });
}

test('after construction abort uses only branded original runtime close', async () => {
  reset(); const guard = createCandidateResourceGuard(); guard.verifyRuntimePID(987654);
  let closes = 0;
  const runtime = { metadata: { processId: 987654 }, close() { closes++; fixture.live = false; } };
  runtimeBrands.add(runtime); guard.bindOwnedRuntime(runtime); fixture.availableRAM -= 1024;
  assert.throws(() => guard.check(), /MEMAVAILABLE_FLOOR/);
  await assert.rejects(guard.finish(), /MEMAVAILABLE_FLOOR/);
  assert.equal(closes, 1); assert.deepEqual(signals, []);
});

test('runtime close failure never falls back to direct signalling', async () => {
  reset(); const guard = createCandidateResourceGuard(); guard.verifyRuntimePID(987654);
  let closes = 0;
  const runtime = { metadata: { processId: 987654 }, close() { closes++; throw Error('HOST_ONLY_DENIED_CLOSE'); } };
  runtimeBrands.add(runtime); guard.bindOwnedRuntime(runtime);
  await assert.rejects(guard.finish(), /CHILD_STILL_RUNNING/);
  assert.equal(closes, 1); assert.deepEqual(signals, []);
});

test('missing task children interface uses enumerated verified direct children', async () => {
  reset({ missingChildren: true }); const guard = createCandidateResourceGuard();
  guard.verifyRuntimePID(987654); guard.check(); fixture.live = false;
  assert.deepEqual(await guard.finish(), { sampledResourceFloorsHeld: true, ownedChildGone: true, forced: false });
  assert.equal(fixture.childrenReads ?? 0, 0); assert.deepEqual(signals, []);
});

test('enumerated unrelated validator is never adopted as this process child', async () => {
  reset({ missingChildren: true, ppid: process.pid + 1 }); const guard = createCandidateResourceGuard();
  assert.throws(() => guard.verifyRuntimePID(987654), /OWNED_CHILD_REQUIRED/);
  await assert.rejects(guard.finish(), /OWNED_CHILD_REQUIRED/); assert.deepEqual(signals, []);
});

test('denied PID enumeration is not interpreted as an empty child set', async () => {
  reset({ missingChildren: true, denyEnumeration: true }); const guard = createCandidateResourceGuard();
  assert.throws(() => guard.check()); await assert.rejects(guard.finish()); assert.deepEqual(signals, []);
});

test('actual current proc reads work without task children interface or any validator', async () => {
  reset({ actualProc: true, missingChildren: true, live: false });
  const guard = createCandidateResourceGuard();
  try { guard.check(); }
  finally { assert.deepEqual(await guard.finish(), { sampledResourceFloorsHeld: true, ownedChildGone: true, forced: false }); }
  assert.equal(fixture.childrenReads ?? 0, 0); assert.deepEqual(signals, []);
});
