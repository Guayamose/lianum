/** Reconciliation order only. Canonical transaction, calldata, state and backing
 * verification stay in the owned terminal observer supplied by the keeper. */
import assert from 'node:assert/strict';

/** @typedef {'recovery' | 'settlement'} TerminalKind */
/** @typedef {'RECOVERED' | 'FULFILLED'} TerminalOutcome */
/** @typedef {{slot: number, leaf: string, opening: {globalEffectId: string}}} AdmissionReceipt */
/** @typedef {{slot: number, status: 'POSSIBLE' | 'ADMITTED', nativeId: string | null}} Exposure */
/** @typedef {{outcome: TerminalOutcome}} TerminalObservation */
/** @typedef {{recoverySubmission: unknown | null, settlementSubmission: unknown | null,
 * receipts: AdmissionReceipt[], exposures: Exposure[]}} Operation */
/** @typedef {{slot: number, adapter: {reconcile(): Promise<{receipt?: Omit<AdmissionReceipt, 'slot'> | null}>}}} Admission */
/** @typedef {{receipts?: AdmissionReceipt[], exposures?: Exposure[],
 * outcome?: TerminalOutcome, stage?: TerminalOutcome, errorCode?: null}} ReconciliationPatch */

/**
 * @template View
 * @template {TerminalObservation} Result
 * @param {string} reference
 * @param {{operation(reference: string): Operation,
 * admissions: Iterable<[string, Admission]>, read(): Promise<View>,
 * assertReceipt(view: View, leaf: string): unknown,
 * update(reference: string, patch: ReconciliationPatch): Promise<unknown>,
 * observe(reference: string, kind: TerminalKind): Promise<Result>}} ports
 * @returns {Promise<Result>}
 */
export async function reconcileRetainedTerminalV2(reference, ports) {
  const entry = ports.operation(reference);
  /** @type {TerminalKind[]} */
  const kinds = [];
  if (entry.recoverySubmission) kinds.push('recovery');
  if (entry.settlementSubmission) kinds.push('settlement');

  // A retained terminal attempt must not depend on an unavailable native
  // adapter. Recovery alone leaves any unresolved native exposure unknown.
  if (!kinds.length) {
    for (const [key, original] of ports.admissions) {
      if (!key.startsWith(reference + ':')
          || ports.operation(reference).receipts.some(receipt => receipt.slot === original.slot)) continue;
      const result = await original.adapter.reconcile();
      assert.ok(result.receipt, 'FLAT_EXECUTION_PARTIAL_DELIVERY_REQUIRES_RECOVERY');
      const receipt = {slot: original.slot, ...result.receipt};
      const view = await ports.read();
      ports.assertReceipt(view, receipt.leaf);
      await ports.update(reference, {
        receipts: [...ports.operation(reference).receipts, receipt],
        exposures: ports.operation(reference).exposures.map(exposure => exposure.slot === original.slot
          ? {...exposure, status: 'ADMITTED', nativeId: receipt.opening.globalEffectId} : exposure),
      });
    }
  }
  assert.ok(kinds.length, 'FLAT_EXECUTION_PARTIAL_DELIVERY_REQUIRES_RECOVERY');

  /** @type {Result | undefined} */
  let observed;
  /** @type {unknown} */
  let originalError;
  for (const kind of kinds) {
    try { observed = await ports.observe(reference, kind); break; }
    catch (error) { originalError ??= error; }
  }
  if (!observed) throw originalError;
  await ports.update(reference, {outcome: observed.outcome, stage: observed.outcome, errorCode: null});
  return observed;
}
