/** Real session/keeper owners over explicit inert native ports. The factory may
 * create a separate family; it cannot issue canonical SOURCE memberships. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture } from "../../../../../tests/integration/mobile/paired-original-account-host-fixture.mjs";
import { buildNativeManualSessionV1 } from "../../../src/api/accounts/native-manual-session-backend-v1.mjs";
const source = await import(
  "../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs"
);
const account = await import(
  "../../../src/accounts/authority/native-value-account-authority-v2.mjs"
);
const economic = await import(
  "../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs"
);
const system = await import(
  "../../../src/operations/deployments/native-value/native-value-system-v2.mjs"
);
const shared = await import(
  "../../../src/api/accounts/flat-manual-graph-session.mjs"
);
const pick = (namespace, names) =>
  Object.fromEntries(names.map((name) => [name, namespace[name]]));
const contracts = () => ({
  account: pick(account, [
    "assertOriginalNativeAccountSourceV1",
    "assertOwnedNativeValueAccountAuthority",
    "nativeValueAccountManualGraphDetails",
    "assertNativeValueAccountManualGraphExecution",
    "nativeValueAccountManualNoteDetails",
  ]),
  economic: {
    ...pick(economic, [
      "assertNativeEconomicRecoveryCaptureV1",
      "nativeEconomicRecoverySectionIdentityV1",
      "consumeNativeEconomicRecoverySectionV1",
    ]),
    nativeValueOriginalRecoverySourceV1:
      system.nativeValueOriginalRecoverySourceV1,
  },
  source: pick(source, [
    "nativeSourceRecoverySectionIdentityV1",
    "retainOriginalNativeSourceSectionV1",
    "consumeOriginalNativeSourceSectionV1",
    "updateOriginalNativeSourceSectionV1",
    "resumeOriginalNativeSourceSectionV1",
    "nativeSourceRecoveryOwnedProcessV1",
  ]),
  resources: {
    loadDurableKeeper: () =>
      import(
        "../../../src/accounts/storage/durable-generic-account-keeper.mjs"
      ),
    loadAccountSession: () =>
      import("../../../src/api/accounts/flat-account-session.mjs"),
    loadEconomicState: () =>
      import(
        "../../../src/accounts/state/original-wallet-economic-state-v1.mjs"
      ),
  },
});
test("native session families retain private memberships; canonical, foreign and copied references stay separate", async (t) => {
  // Before any native birth, shared HTTP selectors still admit wrapped/flat UI.
  assert.deepEqual(source.flatManualNativeNoteReviews({}), []);
  assert.equal(
    source.flatManualNativeNoteActionTarget({}, "prepare", {}),
    null,
  );
  const f = await fixture(t, { execute: false });
  const scratch = await mkdtemp(join(tmpdir(), "native-session-instance-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const first = buildNativeManualSessionV1(contracts());
  const second = buildNativeManualSessionV1(contracts());
  const input = {
    runtime: f.world.runtime,
    system: f.world.system,
    poolIndex: 0,
    account: f.account,
    journal: {
      path: join(scratch, "original-keeper.vault"),
      password: "HOST_ONLY_SESSION_TEST",
    },
  };
  const joined = await first.createNativeValueManualGraphAccountSession(input);
  t.after(() => joined.session.close());
  joined.bindManualNote(f.approval);
  const expected = {
    runtime: f.world.runtime,
    system: f.world.system,
    account: f.account,
  };
  first.assertNativeWalletEconomicSessionV1(joined.session, expected);
  assert.equal(first.isOriginalNativeManualSessionV1(joined.session), true);
  for (const invalid of [{ ...joined.session }, f.session]) {
    assert.equal(first.isOriginalNativeManualSessionV1(invalid), false);
    assert.throws(
      () => first.assertNativeWalletEconomicSessionV1(invalid, expected),
      /ORIGINAL_REQUIRED/,
    );
  }
  assert.throws(
    () => second.assertNativeWalletEconomicSessionV1(joined.session, expected),
    /ORIGINAL_REQUIRED/,
  );
  assert.throws(
    () => source.assertNativeWalletEconomicSessionV1(joined.session, expected),
    /ORIGINAL_REQUIRED/,
  );
  assert.equal(source.isOriginalNativeManualSessionV1(joined.session), false);
  assert.deepEqual(shared.flatManualGraphReviews(joined.session), []);
  assert.deepEqual(source.flatManualNativeNoteReviews(joined.session), []);
  assert.equal(
    source.flatManualNativeNoteActionTarget(joined.session, "prepare", f.body),
    null,
  );
  assert.equal(
    first.flatManualNativeNoteActionTarget(joined.session, "prepare", f.body),
    f.approval,
  );
  source.assertNativeWalletEconomicSessionV1(f.session, expected);
  await assert.rejects(
    shared.readOriginalSessionWalletEconomicSnapshotV1(f.session, {}),
    /SESSION_ARGUMENTS/,
  );
  await assert.rejects(
    shared.createOriginalSessionWalletEconomicStateV1(f.session, {}),
    /SESSION_ARGUMENTS/,
  );
  await assert.rejects(
    shared.reopenOriginalSessionWalletEconomicStateAfterCrashV1(f.session, {}),
    /SESSION_ARGUMENTS/,
  );
  assert.throws(
    () => shared.readOriginalSessionWalletEconomicStateV1(f.session, {}),
    /SESSION_ARGUMENTS/,
  );
  await assert.rejects(
    first.createNativeValueManualGraphAccountSession({
      ...input,
      journal: { ...input.journal, path: join(scratch, "replacement.vault") },
    }),
    /ALREADY_CREATED/,
  );
  assert.equal(f.world.sends, 0);
  assert.equal(f.world.proofs, 0);
});
