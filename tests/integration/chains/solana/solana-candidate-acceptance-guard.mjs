/** Fixed host resource/lifecycle guards. This does not change any OS limits.
 * Only a verified direct child may be signalled, including during bootstrap
 * before the owned runtime returns its close capability. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, readlinkSync, statfsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOwnedSolanaRuntime } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs';
import { PRIVATE_RESOURCE_POLICY, PRIVATE_RESOURCE_FLOORS, PRIVATE_PROOF_WORKER_RSS_LIMIT }
  from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
const GOLDEN = fileURLToPath(new URL('../../../omnichain-product/', import.meta.url));
const TOTAL_MILLISECONDS = 10 * 60 * 1000;
const absent = error => ['ENOENT', 'ESRCH'].includes(error.code);
const proc = pid => {
  let text;
  try { text = readFileSync(`/proc/${pid}/stat`, 'utf8'); }
  catch (error) { if (absent(error)) return null; throw Error('SOLANA_CANDIDATE_PROCESS_IDENTITY_UNREADABLE'); }
  const end = text.lastIndexOf(') '), first = text.indexOf(' ');
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && end > first && text.slice(0, first) === String(pid),
    'SOLANA_CANDIDATE_PROCESS_STAT_MALFORMED');
  const fields = text.slice(end + 2).trim().split(/\s+/);
  assert.ok(fields.length >= 22 && /^[RSDZTWXIKPt]$/.test(fields[0]) && /^[0-9]+$/.test(fields[1])
    && Number.isSafeInteger(Number(fields[1])) && /^[0-9]+$/.test(fields[19]), 'SOLANA_CANDIDATE_PROCESS_STAT_MALFORMED');
  let executable;
  try { executable = readlinkSync(`/proc/${pid}/exe`); }
  catch (error) {
    if (absent(error)) {
      // An absent executable alone can mean an unreadable or zombie process.
      // Only a second absent stat establishes that this PID actually vanished.
      try { readFileSync(`/proc/${pid}/stat`, 'utf8'); }
      catch (again) { if (absent(again)) return null; }
    }
    throw Error('SOLANA_CANDIDATE_PROCESS_IDENTITY_UNREADABLE');
  }
  assert.ok(typeof executable === 'string' && executable.startsWith('/'), 'SOLANA_CANDIDATE_PROCESS_EXECUTABLE_MALFORMED');
  return { pid, ppid: Number(fields[1]), startTimeTicks: fields[19], executable };
};
export function candidateHostResourceFailure(sample) {
  for (const field of ['availableRAM', 'freeDisk', 'mainRSS']) assert.ok(Number.isSafeInteger(sample[field]) && sample[field] >= 0);
  if (sample.availableRAM < PRIVATE_RESOURCE_FLOORS.availableRAM) return 'SOLANA_CANDIDATE_MEMAVAILABLE_FLOOR';
  if (sample.freeDisk < PRIVATE_RESOURCE_FLOORS.freeDisk) return 'SOLANA_CANDIDATE_DISK_FLOOR';
  if (sample.mainRSS > PRIVATE_PROOF_WORKER_RSS_LIMIT) return 'SOLANA_CANDIDATE_MAIN_RSS_LIMIT';
  return null;
}
function resources() {
  const match = /^MemAvailable:\s+([0-9]+) kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'));
  assert.ok(match, 'SOLANA_CANDIDATE_MEMAVAILABLE_UNREADABLE');
  const disk = statfsSync(GOLDEN, { bigint: true });
  return { availableRAM: Number(match[1]) * 1024, freeDisk: Number(disk.bavail * disk.bsize), mainRSS: process.memoryUsage().rss };
}
const heavy = /^(?:solana-test-validator|agave-validator|solana-validator|bitcoind|anvil|bb|nargo|cargo|rustc|rust-lld|ld\.lld|cc1|cc1plus)$/;
export function assertCandidateNoParallelHeavyWork() {
  for (const name of readdirSync('/proc')) {
    if (!/^[1-9][0-9]*$/.test(name)) continue;
    const row = proc(Number(name)); if (!row || row.pid === process.pid) continue;
    assert.equal(heavy.test(basename(row.executable)), false, 'SOLANA_CANDIDATE_PARALLEL_HEAVY_WORK');
  }
  const failure = candidateHostResourceFailure(resources()); if (failure) throw Error(failure);
}
export function createCandidateResourceGuard() {
  assert.equal(arguments.length, 0, 'SOLANA_CANDIDATE_FIXED_GUARD');
  let owned = null, failure = null, closed = false, forced = false, killTimer;
  let ownedRuntime = null, runtimeClosePromise = null, signalDenied = false;
  const started = Date.now();
  function capture() {
    // The executor exposes PID enumeration/stat/exe but may omit task/*/children.
    // Discover direct children through the supported /proc interface instead;
    // denied or malformed identity reads still throw rather than imply absence.
    const candidates = readdirSync('/proc').filter(name => /^[1-9][0-9]*$/.test(name));
    assert.ok(candidates.length <= 4096, 'SOLANA_CANDIDATE_PROCESS_ENUMERATION_BOUND');
    for (const name of candidates) {
      const row = proc(Number(name));
      if (!row || row.ppid !== process.pid || basename(row.executable) !== 'solana-test-validator') continue;
      assert.ok(row.executable.startsWith(join(GOLDEN, '.local/linux-runtimes') + '/'), 'SOLANA_CANDIDATE_CHILD_EXECUTABLE');
      if (owned) assert.equal(row.pid + ':' + row.startTimeTicks, owned.pid + ':' + owned.startTimeTicks, 'SOLANA_CANDIDATE_MULTIPLE_VALIDATORS');
      else owned = row;
    }
  }
  const current = () => {
    if (!owned) return null; const row = proc(owned.pid);
    if (!row || row.startTimeTicks !== owned.startTimeTicks) return null;
    assert.ok(row.ppid === owned.ppid && row.executable === owned.executable, 'SOLANA_CANDIDATE_PROCESS_IDENTITY_CHANGED');
    return row;
  };
  function signal(signal) {
    if (signalDenied || ownedRuntime) return;
    let row;
    try { row = current(); } catch (error) { failure ??= error; return; }
    if (!row) return;
    try { process.kill(owned.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') { signalDenied = true; failure ??= Error('SOLANA_CANDIDATE_OWNED_SIGNAL_FAILED'); } }
  }
  function requestOwnedClose() {
    runtimeClosePromise ??= Promise.resolve().then(() => ownedRuntime.close()).catch(() => {
      failure ??= Error('SOLANA_CANDIDATE_RUNTIME_CLOSE_FAILED');
    });
    return runtimeClosePromise;
  }
  function stop(code) {
    failure ??= Error(code);
    try { capture(); } catch { /* Failure is latched; never adopt an uncertain child. */ }
    if (ownedRuntime) { void requestOwnedClose(); return; }
    signal('SIGTERM');
    if (signalDenied) return;
    killTimer ??= setTimeout(() => {
      try { if (current()) { forced = true; signal('SIGKILL'); } } catch (error) { failure ??= error; }
    }, 30000);
    killTimer.unref();
  }
  function check() {
    if (closed) return;
    try {
      capture(); if (owned) current();
      const code = candidateHostResourceFailure(resources());
      if (code || Date.now() - started > TOTAL_MILLISECONDS) stop(code ?? 'SOLANA_CANDIDATE_FUNCTIONAL_DEADLINE');
    } catch (error) { stop(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'SOLANA_CANDIDATE_RESOURCE_READ_FAILED'); }
  }
  const timer = setInterval(check, PRIVATE_RESOURCE_POLICY.externalSampleMilliseconds); timer.unref();
  const onSignal = () => stop('SOLANA_CANDIDATE_INTERRUPTED');
  process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
  return Object.freeze({ check() { check(); if (failure) throw failure; },
    verifyRuntimePID(pid) {
      try { capture(); const row = current(); assert.ok(row && row.pid === pid, 'SOLANA_CANDIDATE_OWNED_CHILD_REQUIRED'); }
      catch (error) { failure ??= error; throw error; }
    },
    bindOwnedRuntime(runtime) {
      assertOwnedSolanaRuntime(runtime); assert.equal(ownedRuntime, null, 'SOLANA_CANDIDATE_RUNTIME_ALREADY_BOUND');
      const row = current(); assert.ok(row && row.pid === runtime.metadata.processId, 'SOLANA_CANDIDATE_OWNED_CHILD_REQUIRED');
      ownedRuntime = runtime; clearTimeout(killTimer);
    },
    async finish() {
      closed = true; clearInterval(timer); clearTimeout(killTimer);
      process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal);
      if (runtimeClosePromise) await runtimeClosePromise;
      if (current() && ownedRuntime) {
        await requestOwnedClose();
        assert.equal(current(), null, 'SOLANA_CANDIDATE_CHILD_STILL_RUNNING');
      }
      if (current()) {
        assert.equal(signalDenied, false, 'SOLANA_CANDIDATE_SIGNAL_DENIED_EXIT_UNKNOWN');
        failure ??= Error('SOLANA_CANDIDATE_CHILD_STILL_RUNNING'); signal('SIGTERM');
        const gracefulDeadline = Date.now() + 30000;
        while (current() && Date.now() < gracefulDeadline) await new Promise(resolve => setTimeout(resolve, 100));
        if (current()) { forced = true; signal('SIGKILL'); }
        const forcedDeadline = Date.now() + 5000;
        while (current() && Date.now() < forcedDeadline) await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(current(), null, 'SOLANA_CANDIDATE_CHILD_STILL_RUNNING');
      if (failure) throw failure; return { sampledResourceFloorsHeld: true, ownedChildGone: true, forced }; } });
}
