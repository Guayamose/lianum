import assert from 'node:assert/strict';

/** @typedef {{assertCurrent(view: object): Promise<unknown>}} CurrentReader */
/** @typedef {{reader: CurrentReader, view: object, pending: Promise<unknown> | null}} CurrentRound */

/** Shares only an outstanding physical read. The canonical operator separately
 * authenticates the quorum round and its current view before calling this
 * private instance. Settled work is never retained as a current certificate.
 */
export function createOriginalCurrentRoundChecksV4() {
  /** @type {WeakMap<object, CurrentRound>} */
  const checks = new WeakMap();
  return Object.freeze({
    /** @param {object} round @param {CurrentReader} reader @param {object} view */
    retain(round, reader, view) {
      assert.ok(!checks.has(round), 'NATIVE_VALUE_CURRENT_ROUND_ALREADY_RETAINED');
      checks.set(round, {reader, view, pending: null});
    },
    /** @param {object} round */
    revoke(round) { checks.delete(round); },
    /** @param {object | null} round @param {CurrentReader} reader @param {object} view */
    async check(round, reader, view) {
      if (round === null) return reader.assertCurrent(view);
      const current = checks.get(round);
      assert.ok(current && current.view === view, 'NATIVE_VALUE_ORIGINAL_CURRENT_ROUND_REQUIRED');
      if (current.pending === null) {
        const pending = Promise.resolve().then(() => current.reader.assertCurrent(view)).finally(() => {
          if (current.pending === pending) current.pending = null;
        });
        current.pending = pending;
      }
      return current.pending;
    },
  });
}
