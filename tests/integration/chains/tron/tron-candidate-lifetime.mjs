/** Local fixture cancellation only. Never grants a runtime or signing token. */
import assert from 'node:assert/strict';
export const TRON_CANDIDATE_TOTAL_MILLISECONDS = 300_000;
export function beginTronCandidateLifetime() {
  assert.equal(arguments.length, 0, 'TRON_CANDIDATE_LIFETIME_NO_OPTIONS');
  const controller = new AbortController(); let finished = false;
  const stop = code => { if (!finished && !controller.signal.aborted) controller.abort(Error(code)); };
  const onTerm = () => stop('TRON_CANDIDATE_OWNER_SIGTERM_ORIGINAL_OUTCOME_UNKNOWN');
  const onInt = () => stop('TRON_CANDIDATE_OWNER_SIGINT_ORIGINAL_OUTCOME_UNKNOWN');
  process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
  const timer = setTimeout(() => stop('TRON_CANDIDATE_TOTAL_DEADLINE_ORIGINAL_OUTCOME_UNKNOWN'), TRON_CANDIDATE_TOTAL_MILLISECONDS);
  return Object.freeze({ signal: controller.signal,
    assertActive() { if (controller.signal.aborted) throw controller.signal.reason;
      assert.equal(finished, false, 'TRON_CANDIDATE_LIFETIME_ALREADY_FINISHED'); },
    finish() { if (finished) return; finished = true; clearTimeout(timer);
      process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt); },
  });
}
/** The caller supplies only its already-owned child close operation. The abort
 * rejects pending protocol work before requesting one idempotent cleanup. */
export function bindTronCandidateChildCancellation(signal, failPending, closeOwned) {
  assert.equal(arguments.length, 3); assert.ok(signal instanceof AbortSignal);
  assert.equal(typeof failPending, 'function'); assert.equal(typeof closeOwned, 'function');
  let cleanupPromise;
  const abort = () => {
    failPending(signal.reason);
    cleanupPromise ??= Promise.resolve().then(closeOwned);
    // The acceptance's finally block awaits the same close result and records
    // any cleanup failure; suppress only an unhandled rejection in this hook.
    void cleanupPromise.catch(() => {});
  };
  signal.addEventListener('abort', abort);
  if (signal.aborted) abort();
  return () => signal.removeEventListener('abort', abort);
}
