/** Complete diagnostic owners over explicit inert host ports. No factory, runtime, key,
 * compiler, proof worker, historical fixture or network is started. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createWrappedAuditCurrentnessV1,
  createWrappedJointCurrentnessV1,
  wrappedAuditMethodV1,
} from "../../../../src/claims/wrapped/operations/wrapped-audit-currentness-v1.mjs";
import { privateFailureDiagnostic } from "../../../../src/execution/account/reconciliation/failure-diagnostics.mjs";
const source = readFileSync(
  new URL(
    "../../../../src/claims/wrapped/operations/wrapped-operators-v1.mjs",
    import.meta.url,
  ),
  "utf8",
);
function makeCurrent(baseline, times, activeView = {}) {
  let samples = 0,
    reads = 0,
    cachedView = activeView;
  const ports = {
    live() {},
    now: () => times[Math.min(samples++, times.length - 1)],
    started: () => 0,
    view: () => activeView,
    assertCurrent: async () => {
      reads++;
    },
    clearCache: () => {
      cachedView = undefined;
    },
    labels: () => ({ method: "begin-payout", round: "initial-preparation" }),
  };
  const actual = createWrappedAuditCurrentnessV1(ports);
  // Prior public predicate, written as ordinary test code. No generated JS.
  async function originalCurrent() {
    ports.live();
    const withinBudget = () =>
      assert.ok(
        activeView && ports.now() - ports.started() < 30_000,
        "CLAIM_OPERATOR_AUDIT_TOO_OLD",
      );
    try {
      withinBudget();
      await ports.assertCurrent(activeView);
      ports.live();
      withinBudget();
    } catch (error) {
      ports.clearCache();
      throw error;
    }
  }
  return {
    ...actual,
    current: baseline ? originalCurrent : actual.current,
    cached: () => cachedView,
    samples: () => samples,
    reads: () => reads,
  };
}
async function outcome(api) {
  try {
    await api.current();
    return "PASS";
  } catch (error) {
    return error.message;
  }
}

test("diagnostics preserve original early predicates and exact clock/RPC counts including nonfinite negatives", async () => {
  for (const times of [
    [-Infinity],
    [-1],
    [-0],
    [0],
    [29999],
    [30000],
    [Infinity],
    [NaN],
    [0, 30000],
    [0, Infinity],
    [0, -1],
  ]) {
    const a = makeCurrent(true, times),
      b = makeCurrent(false, times);
    assert.equal(await outcome(a), await outcome(b));
    assert.equal(a.samples(), b.samples());
    assert.equal(a.reads(), b.reads());
    assert.equal(a.cached() === undefined, b.cached() === undefined);
  }
  const a = makeCurrent(true, [0], null),
    b = makeCurrent(false, [0], null);
  assert.equal(await outcome(a), await outcome(b));
  assert.equal(a.samples(), 0);
  assert.equal(b.samples(), 0);
});

test("claim deadline emits only fixed method/round/phase and bounded counts without another clock sample", async () => {
  const api = makeCurrent(false, [0, 30000]);
  await assert.rejects(api.current("after-graph-coverage"), (error) => {
    assert.deepEqual(privateFailureDiagnostic(error).auditBudget, {
      phase: "after-graph-coverage",
      method: "begin-payout",
      round: "initial-preparation",
      elapsedMilliseconds: 30000,
      limitMilliseconds: 30000,
    });
    assert.ok(Object.isFrozen(error.auditBudget));
    return true;
  });
  assert.equal(api.samples(), 2);
  assert.equal(api.reads(), 1);
});

test("terminal V4 predicate stays strict and samples the same clock exactly once", () => {
  for (const n of [-Infinity, -1, -0, 0, 29999, 30000, Infinity, NaN]) {
    const api = makeCurrent(false, [n]),
      expected = Number.isFinite(n) && n >= 0 && n < 30000;
    if (expected) api.assertTerminalBudget();
    else
      assert.throws(
        () => api.assertTerminalBudget(),
        (error) => error.auditBudget.phase === "synchronous-v4-fence",
      );
    assert.equal(api.samples(), 1);
  }
});

test("reciprocal GRAPH order is retained and currentness still runs before and after its await", async () => {
  const events = [],
    active = {
      setGraphSource: () => events.push("capture"),
      assertGraphSource: () => events.push("assert"),
    };
  const run = createWrappedJointCurrentnessV1({
    current: async (phase) => events.push(phase),
    custody: {},
    active: () => active,
    view: () => ({ head: {} }),
    options: () => ({}),
    auditOwn: async () => assert.fail("HOST_NO_LEGACY_AUDIT"),
    projection: () => null,
    assertReconciled: () => assert.fail("HOST_NO_LEGACY_AUDIT"),
    assertCoverage: async () => assert.fail("HOST_NO_LEGACY_AUDIT"),
    assertCoverageV4: async () => {
      events.push("graph-read");
      return {};
    },
  });
  await run();
  assert.deepEqual(events, [
    "before-graph-coverage",
    "graph-read",
    "capture",
    "after-graph-coverage",
    "assert",
  ]);
});

test("new method labels never project request fields, and full-round starts remain before journal/view reads", () => {
  const label = wrappedAuditMethodV1;
  const A = { BEGIN_PAYOUT: "b", REDEEM: "r", RESERVE_PAYOUT: "v" };
  for (const [request, want] of [
    [{ terms: { action: "b" } }, "begin-payout"],
    [{ terms: { action: "r" } }, "redeem"],
    [{ terms: { action: "v" } }, "reserve-payout"],
    [{ mode: "debt" }, "debt-health"],
    [{ nativeId: "SYNTHETIC_PRIVATE_ID" }, "payout-broadcast"],
    [{ mode: "SYNTHETIC_PRIVATE_MODE" }, "presign-payout"],
  ])
    assert.equal(label(request, A), want);
  assert.match(
    source,
    /auditMethod = 'operation'; auditRound = 'whole-operation'; started = performance\.now\(\);\n    try \{\n      await readVault\(\); activeView = await readCurrentView\(\);/,
  );
  assert.match(
    source,
    /auditRound = round;[\s\S]*?quiet\.release\(\);\n      started = beginWrappedClaimAuditRoundV4\(custody\); await readVault\(\); activeView = await readCurrentView\(\);/,
  );
  for (const round of ["existing-authorization", "pre-key", "persisted-return"])
    assert.ok(source.includes("await freshRound('" + round + "')"));
});

test("shared diagnostic prerequisite rejects invalid scoped data without invoking getters/proxies", () => {
  const good = {
    phase: "after-graph-coverage",
    method: "begin-payout",
    round: "initial-preparation",
    elapsedMilliseconds: 30000,
    limitMilliseconds: 30000,
  };
  const diagnose = (b) =>
    privateFailureDiagnostic(
      Object.assign(new Error("CLAIM_OPERATOR_AUDIT_TOO_OLD"), {
        auditBudget: b,
      }),
    );
  assert.deepEqual(diagnose(good).auditBudget, good);
  for (const bad of [
    { ...good, extra: "SYNTHETIC_PRIVATE" },
    { ...good, method: "CLAIM_SYNTHETIC_ID" },
    { ...good, round: "x" },
    { ...good, phase: "x" },
    { ...good, elapsedMilliseconds: NaN },
    { ...good, elapsedMilliseconds: -0 },
    { ...good, elapsedMilliseconds: 3600001 },
    { ...good, limitMilliseconds: 30001 },
    Object.assign(Object.create(null), good),
    { ...good, [Symbol("x")]: 1 },
    new Proxy(good, {
      ownKeys() {
        throw Error("invoked");
      },
    }),
    Object.defineProperty({ ...good }, "method", {
      get() {
        throw Error("invoked");
      },
    }),
  ])
    assert.equal(diagnose(bad).auditBudget, undefined);
});

test("currentness keeps the original RPC failure, clears the cache once and does not sample another clock", async () => {
  const view = Object.freeze({}),
    failure = Error("HOST_ORIGINAL_RPC_FAILURE");
  let samples = 0,
    cleared = 0,
    reads = 0;
  const api = createWrappedAuditCurrentnessV1({
    live() {},
    now() {
      samples++;
      return 0;
    },
    started: () => 0,
    view: () => view,
    async assertCurrent(value) {
      assert.equal(value, view);
      reads++;
      throw failure;
    },
    clearCache() {
      cleared++;
    },
    labels: () => ({ method: "begin-payout", round: "initial-preparation" }),
  });
  await assert.rejects(api.current(), (error) => error === failure);
  assert.deepEqual(
    { samples, cleared, reads },
    { samples: 1, cleared: 1, reads: 1 },
  );
});

test("joint currentness preserves custody-free and original legacy projection branches", async () => {
  for (const mode of ["no-custody", "projection", "reconciled"]) {
    const events = [],
      custody = mode === "no-custody" ? null : Object.freeze({}),
      head = Object.freeze({}),
      options = Object.freeze({}),
      report = Object.freeze({});
    const run = createWrappedJointCurrentnessV1({
      current: async (phase) => events.push(phase),
      custody,
      active: () => null,
      view: () => ({ head }),
      options: () => options,
      async auditOwn(value) {
        assert.equal(value, options);
        events.push("audit");
        return report;
      },
      projection: () =>
        mode === "projection"
          ? async (value) => {
              assert.equal(value, report);
              events.push("projection");
            }
          : null,
      assertReconciled(value) {
        assert.equal(value, report);
        events.push("reconciled");
      },
      async assertCoverage(value, original) {
        assert.equal(value, custody);
        assert.equal(original, head);
        events.push("coverage");
      },
      async assertCoverageV4() {
        assert.fail("HOST_NO_V4_BRANCH");
      },
    });
    await run();
    assert.deepEqual(
      events,
      mode === "no-custody"
        ? ["before-graph-coverage"]
        : [
            "before-graph-coverage",
            "audit",
            mode,
            "coverage",
            "after-graph-coverage",
          ],
    );
  }
});

test("joint currentness captures on the original operation and checks the active operation again after its await", async () => {
  const events = [],
    source = Object.freeze({});
  const first = {
    setGraphSource(value) {
      assert.equal(value, source);
      events.push("first-capture");
    },
    assertGraphSource() {
      assert.fail("HOST_STALE_OPERATION");
    },
  };
  const second = {
    setGraphSource() {
      assert.fail("HOST_FOREIGN_CAPTURE");
    },
    assertGraphSource() {
      events.push("second-assert");
    },
  };
  let active = first;
  const run = createWrappedJointCurrentnessV1({
    current: async (phase) => events.push(phase),
    custody: {},
    active: () => active,
    view: () => ({ head: {} }),
    options: () => ({}),
    auditOwn: async () => assert.fail("HOST_NO_LEGACY_AUDIT"),
    projection: () => null,
    assertReconciled: () => assert.fail("HOST_NO_LEGACY_AUDIT"),
    assertCoverage: async () => assert.fail("HOST_NO_LEGACY_AUDIT"),
    async assertCoverageV4() {
      events.push("graph-read");
      active = second;
      return source;
    },
  });
  await run();
  assert.deepEqual(events, [
    "before-graph-coverage",
    "graph-read",
    "first-capture",
    "after-graph-coverage",
    "second-assert",
  ]);
});
