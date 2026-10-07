/** Test-only diagnostic lifecycle. No runtime brand, RPC, key or restore API. */
import assert from 'node:assert/strict';

export function createReplayLifecycle({ stopProcess, removeScratch, cleanupMilliseconds }) {
  assert.ok(Number.isSafeInteger(cleanupMilliseconds) && cleanupMilliseconds > 0 && cleanupMilliseconds <= 10000);
  const abort = new AbortController();
  let handle, scratch, closeObserved, closed = false, spawnError = null, cleanupPromise;
  const report = { exitObserved: false, scratchRemoved: false };
  const stop = reason => {
    if (!abort.signal.aborted) abort.abort(new Error(reason));
    // Signal only the exact child returned by this probe's spawn. This does
    // not claim exit, finalize cleanup or race unfinished resource acquisition.
    if (handle?.child.pid && !closed && handle.child.exitCode === null && handle.child.signalCode === null)
      handle.child.kill('SIGTERM');
  };
  return Object.freeze({ signal: abort.signal, report, stop,
    async acquireScratch(create) {
      abort.signal.throwIfAborted();
      const path = await create(); scratch = path;
      // A scratch path created while aborting must still be removed in finally.
      abort.signal.throwIfAborted(); return path;
    },
    async acquirePort(create) {
      abort.signal.throwIfAborted(); const port = await create(); abort.signal.throwIfAborted(); return port;
    },
    spawn(create) {
      abort.signal.throwIfAborted(); assert.equal(handle, undefined, 'REPLAY_SPAWN_ONCE');
      handle = create();
      closeObserved = new Promise(resolve => { handle.child.once('close', () => { closed = true; resolve(); }); });
      handle.child.once('error', error => { spawnError = error; stop('REPLAY_SPAWN_FAILED'); });
      return handle;
    },
    cleanup() {
      // The caller invokes only after its acquisition/work promise settles.
      // Timeout/signal callbacks call stop(), never this memoized teardown.
      return cleanupPromise ??= (async () => {
        let timer;
        const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('REPLAY_CLEANUP_TIMEOUT')), cleanupMilliseconds); });
        try {
          if (handle) {
            if (spawnError && !handle.child.pid) report.spawnFailedWithoutChild = true;
            else await Promise.race([(async () => { await stopProcess(handle, { graceMs: 3000 }); await closeObserved; })(), deadline]);
            assert.ok(closed || (spawnError && !handle.child.pid), 'REPLAY_CHILD_EXIT_UNOBSERVED');
            report.exitObserved = closed; report.exitCode = handle.child.exitCode; report.signal = handle.child.signalCode;
          }
          if (scratch) { await Promise.race([removeScratch(scratch), deadline]); report.scratchRemoved = true; }
          return report;
        } finally { clearTimeout(timer); }
      })();
    },
  });
}
