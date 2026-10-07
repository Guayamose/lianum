/** Fixture lifecycle only; supplies no runtime, signing or graph capability. */
import assert from 'node:assert/strict';

export const BITCOIN_ACCEPTANCE_GUARD_POLICY = Object.freeze({ sampleMilliseconds: 250, totalMilliseconds: 120_000 });
const code = error => String(error?.message ?? '').match(/\bBITCOIN_ACCEPTANCE_[A-Z0-9_]+\b/)?.[0]
  ?? 'BITCOIN_ACCEPTANCE_RESOURCE_MONITOR_FAILED';

export function startBitcoinAcceptanceGuard(closeOwned, sampleResources) {
  assert.equal(arguments.length, 2); assert.equal(typeof closeOwned, 'function'); assert.equal(typeof sampleResources, 'function');
  let failure = null, cleanupFailure = null, cleanupPromise, sampler, deadline, sampling, finishing = false, finished = false;
  let resolveFailure; const failed = new Promise(resolve => resolveFailure = resolve);
  const clear = () => { clearInterval(sampler); clearTimeout(deadline); };
  const close = () => cleanupPromise ??= Promise.resolve().then(closeOwned);
  function stop(reason) {
    if (finished) return;
    failure ??= reason; finishing = true; clear(); resolveFailure(failure);
    // Every shutdown goes through the original runtime's own close method.
    // No PID discovery, signal forwarding, retry or substitute runtime.
    void close().catch(() => { cleanupFailure = 'BITCOIN_ACCEPTANCE_OWNED_CLEANUP_FAILED'; });
  }
  const onTerm = () => stop('BITCOIN_ACCEPTANCE_OWNER_SIGTERM');
  const onInt = () => stop('BITCOIN_ACCEPTANCE_OWNER_SIGINT');
  process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
  sampler = setInterval(() => {
    if (finishing || sampling) return;
    sampling = Promise.resolve().then(sampleResources).catch(error => {
      if (!finishing) stop(code(error));
    }).finally(() => { sampling = null; });
  }, BITCOIN_ACCEPTANCE_GUARD_POLICY.sampleMilliseconds);
  deadline = setTimeout(() => stop('BITCOIN_ACCEPTANCE_TOTAL_DEADLINE'), BITCOIN_ACCEPTANCE_GUARD_POLICY.totalMilliseconds);
  return Object.freeze({
    failed,
    assertActive() { if (failure) throw Error(failure); assert.equal(finishing, false, 'BITCOIN_ACCEPTANCE_GUARD_CLOSED'); },
    get failure() { return failure; },
    async finish() {
      if (finished) return { failure, cleanupFailure, cleanup: await close() };
      finishing = true; clear();
      try {
        if (sampling) await sampling;
        const cleanup = await close(); return { failure, cleanupFailure, cleanup };
      } catch (error) {
        cleanupFailure = 'BITCOIN_ACCEPTANCE_OWNED_CLEANUP_FAILED'; throw error;
      } finally {
        finished = true; process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
      }
    },
  });
}
