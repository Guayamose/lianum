/** Currentness, reciprocal coverage and scoped failure labels; no authority. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";

/** @typedef {{phase: string, method: string, round: string, elapsedMilliseconds: number, limitMilliseconds: number}} AuditBudget */
/** @typedef {{
 * live(): void, now(): number, started(): number, view(): unknown,
 * assertCurrent(view: unknown): Promise<void>, clearCache(): void,
 * labels(): {method: string, round: string}
 * }} CurrentnessPorts */
/** @param {CurrentnessPorts} ports */
export function createWrappedAuditCurrentnessV1(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, [
    "live",
    "now",
    "started",
    "view",
    "assertCurrent",
    "clearCache",
    "labels",
  ]);
  const { live, now, started, view, assertCurrent, clearCache, labels } = ports;
  for (const method of Object.values(ports))
    assert.equal(typeof method, "function");
  /** The native assertion/clock failure keeps its identity and cause. The cast
   * adds a diagnostic property; it does not admit an observation or capability.
   * @param {unknown} error @param {string} phase @param {number | undefined} elapsed */
  function auditBudgetFailure(error, phase, elapsed) {
    const fields = labels();
    const failure = /** @type {Error & {auditBudget?: AuditBudget}} */ (error);
    failure.auditBudget = Object.freeze({
      phase,
      method: fields.method,
      round: fields.round,
      elapsedMilliseconds:
        typeof elapsed === "number" && Number.isFinite(elapsed)
          ? Math.min(3_600_000, Math.max(0, Math.ceil(elapsed)))
          : 3_600_000,
      limitMilliseconds: 30_000,
    });
    return failure;
  }
  /** @param {string} [phase] */
  async function current(phase = "claim-current") {
    live();
    const withinBudget = () => {
      let elapsed;
      try {
        assert.ok(
          view() && (elapsed = now() - started()) < 30_000,
          "CLAIM_OPERATOR_AUDIT_TOO_OLD",
        );
      } catch (error) {
        throw auditBudgetFailure(error, phase, elapsed);
      }
    };
    try {
      withinBudget();
      await assertCurrent(view());
      live();
      withinBudget();
    } catch (error) {
      clearCache();
      throw error;
    }
  }
  function assertTerminalBudget() {
    const elapsed = now() - started();
    try {
      assert.ok(
        Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000,
        "CLAIM_OPERATOR_AUDIT_TOO_OLD",
      );
    } catch (error) {
      throw auditBudgetFailure(error, "synchronous-v4-fence", elapsed);
    }
  }
  return Object.freeze({ current, assertTerminalBudget });
}

/** @typedef {{setGraphSource(value: unknown): void, assertGraphSource(): void}} GraphOperation */
/** @typedef {{
 * current(phase: string): Promise<void>, custody: object | null,
 * active(): GraphOperation | null, view(): {head: unknown}, options(): unknown,
 * auditOwn(options: unknown): Promise<unknown>,
 * projection(): ((report: unknown) => Promise<unknown> | void) | null,
 * assertReconciled(report: unknown): void,
 * assertCoverage(custody: object, head: unknown): Promise<unknown>,
 * assertCoverageV4(custody: object, head: unknown): Promise<unknown>
 * }} JointPorts */
/** @param {JointPorts} ports */
export function createWrappedJointCurrentnessV1(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, [
    "current",
    "custody",
    "active",
    "view",
    "options",
    "auditOwn",
    "projection",
    "assertReconciled",
    "assertCoverage",
    "assertCoverageV4",
  ]);
  const {
    current,
    custody,
    active,
    view,
    options,
    auditOwn,
    projection,
    assertReconciled,
    assertCoverage,
    assertCoverageV4,
  } = ports;
  for (const method of [
    current,
    active,
    view,
    options,
    auditOwn,
    projection,
    assertReconciled,
    assertCoverage,
    assertCoverageV4,
  ])
    assert.equal(typeof method, "function");
  async function jointCurrent() {
    await current("before-graph-coverage");
    if (custody) {
      const operation = active();
      if (operation)
        operation.setGraphSource(await assertCoverageV4(custody, view().head));
      else {
        const report = await auditOwn(options()),
          project = projection();
        if (project) await project(report);
        else assertReconciled(report);
        await assertCoverage(custody, view().head);
      }
      await current("after-graph-coverage");
      active()?.assertGraphSource();
    }
  }
  return jointCurrent;
}

/** @param {{terms?: {action?: unknown} | null, mode?: unknown}} request
 * @param {{BEGIN_PAYOUT: unknown, REDEEM: unknown, RESERVE_PAYOUT: unknown}} actions */
export function wrappedAuditMethodV1(request, actions) {
  return request.terms?.action === actions.BEGIN_PAYOUT
    ? "begin-payout"
    : request.terms?.action === actions.REDEEM
      ? "redeem"
      : request.terms?.action === actions.RESERVE_PAYOUT
        ? "reserve-payout"
        : request.mode === "debt"
          ? "debt-health"
          : Object.hasOwn(request, "nativeId")
            ? "payout-broadcast"
            : "presign-payout";
}
