/** Audit scheduling and numeric failure retention. The operator supplies its
 * private admission guards; this mechanism cannot issue a round or sign. */
import assert from 'node:assert/strict';

/** @typedef {{profile: 'NATIVE_VALUE_ORIGINAL_AUDIT_TIMING_V1', operation: string,
 * phase: string, currentMilliseconds: number, storeMilliseconds: number,
 * nativeSourceMilliseconds: number, currentChecks: number, storeLoads: number,
 * storeCommits: number, nativeSourceObservations: number, nativeReadCount: number}} AuditTiming */
/** @param {number} started @param {number} now */
export function assertOriginalNativeAuditBudgetV4(started, now) {
  assert.ok(typeof started === 'number' && Number.isFinite(started), 'NATIVE_VALUE_PRIVATE_ROUND_TIME');
  const elapsed = now - started;
  assert.ok(elapsed >= 0 && elapsed < 30_000, 'NATIVE_VALUE_COMPLETE_AUDIT_DEADLINE');
}

/**
 * @template {{poolIndex: number}} View
 * @template {{view: View, started: number}} Shared
 * @template Result
 * @param {number} poolIndex
 * @param {(view: View) => Promise<Result>} work
 * @param {Shared | null} shared
 * @param {{admit(poolIndex: number, shared: Shared | null): void,
 * begin(): void, finish(): void, now(): number, unchanged(): Promise<unknown>,
 * assertRound(shared: Shared): void, read(poolIndex: number): Promise<View>,
 * timing(shared: Shared | null): AuditTiming | undefined,
 * activate(state: {view: View, started: number, shared: Shared | null, timing: AuditTiming}): void,
 * active(): {started: number, timing: AuditTiming} | undefined,
 * current(): Promise<unknown>, keyUsed(): boolean, poison(): void,
 * retain(cause: unknown, timing: AuditTiming & {elapsedMilliseconds: number, limitMilliseconds: number}): void}} ports
 * @returns {Promise<Result>}
 */
export async function runOriginalNativeAuditV4(poolIndex, work, shared, ports) {
  ports.admit(poolIndex, shared);
  ports.begin();
  try {
    const preflightStarted = ports.now();
    await ports.unchanged();
    if (shared !== null) ports.assertRound(shared);
    const started = shared?.started ?? ports.now();
    const view = shared?.view ?? await ports.read(poolIndex);
    const timing = ports.timing(shared);
    assert.ok(timing, 'NATIVE_VALUE_ORIGINAL_AUDIT_ROUND_REQUIRED');
    if (shared !== null) {
      timing.storeLoads++;
      timing.storeMilliseconds += ports.now() - preflightStarted;
    }
    timing.operation = 'audit';
    timing.phase = 'initial';
    ports.activate({view, started, shared, timing});
    assert.equal(view.poolIndex, poolIndex);
    await ports.current();
    const result = await work(view);
    await ports.current();
    await ports.unchanged();
    await ports.current();
    return result;
  } catch (cause) {
    const active = ports.active();
    if (active) ports.retain(cause, {...active.timing,
      elapsedMilliseconds: Math.floor(ports.now() - active.started), limitMilliseconds: 30_000});
    if (ports.keyUsed()) {
      ports.poison();
      throw new Error('NATIVE_VALUE_POST_KEY_UNCERTAIN', {cause});
    }
    throw cause;
  } finally { ports.finish(); }
}
