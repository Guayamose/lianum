import {genericAccountIdentity,sha} from '@lianum/engine/accounts/journal';
/** Production actor families with original account/session/approval owners over
 * explicit inert native ports. Isolated families never gain canonical brands. */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../../../../../tests/integration/mobile/paired-original-account-host-fixture.mjs";
import { buildPairedOriginalAccountActorV2 } from "../../../src/api/mobile/paired-original-account-actor-backend-v2.mjs";
const source = await import(
  "../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs"
);
const account = await import(
  "../../../src/accounts/authority/native-value-account-authority-v2.mjs"
);
const basic = await import(
  "../../../src/api/accounts/flat-account-session.mjs"
);
const economic = await import(
  "../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs"
);
const pick = (namespace, names) =>
  Object.fromEntries(names.map((name) => [name, namespace[name]]));
const contracts = () => ({
  format: {genericAccountIdentity,sha},
  session: {
    assertFlatAccountSession: basic.assertFlatAccountSession,
    flatManualNativeNoteActionTarget: source.flatManualNativeNoteActionTarget,
  },
  account: pick(account, [
    "nativeValueAccountManualNoteDetails",
    "assertOwnedNativeValueAccountAuthority",
    "nativeValueOriginalRecoverySourceV1FromAccount",
  ]),
  economic: pick(economic, [
    "assertNativeEconomicRecoveryCaptureV1",
    "nativeEconomicRecoverySectionIdentityV1",
    "consumeNativeEconomicRecoverySectionV1",
  ]),
  source: pick(source, [
    "nativeSourceRecoveryOriginalReferenceV1",
    "nativeSourceRecoverySectionIdentityV1",
    "retainOriginalNativeSourceSectionV1",
    "consumeOriginalNativeSourceSectionV1",
    "resumeOriginalNativeSourceSectionV1",
    "updateOriginalNativeSourceSectionV1",
  ]),
});
test("actor family keeps real original references and canonical guards reject foreign instances", async (t) => {
  const f = await fixture(t, { execute: false }),
    first = buildPairedOriginalAccountActorV2(contracts()),
    second = buildPairedOriginalAccountActorV2(contracts());
  const input = {
    session: f.session,
    approval: f.approval,
    owner: f.world.owner,
    origin: "https://private-actor.example",
    devicePublicKey: f.device.publicKey,
  };
  const local = await first.createPairedOriginalAccountActorV2(input);
  first.assertPairedOriginalAccountActorV2(local);
  first.assertNativeActorEconomicMembershipV1(local, {
    session: f.session,
    account: f.account,
    owner: f.world.owner,
  });
  assert.throws(
    () => first.assertPairedOriginalAccountActorV2({ ...local }),
    /ORIGINAL_REQUIRED/,
  );
  assert.throws(
    () => second.assertPairedOriginalAccountActorV2(local),
    /ORIGINAL_REQUIRED/,
  );
  assert.throws(
    () => source.assertPairedOriginalAccountActorV2(local),
    /ORIGINAL_REQUIRED/,
  );
  assert.throws(
    () => source.assertPairedOriginalAccountActorAccountV2(local, f.account),
    /ORIGINAL_REQUIRED/,
  );
  assert.throws(
    () =>
      source.assertNativeActorEconomicMembershipV1(local, {
        session: f.session,
        account: f.account,
        owner: f.world.owner,
      }),
    /ORIGINAL_REQUIRED/,
  );
  const canonical = await source.createPairedOriginalAccountActorV2(input);
  source.assertPairedOriginalAccountActorV2(canonical);
  assert.throws(
    () => first.assertPairedOriginalAccountActorV2(canonical),
    /ORIGINAL_REQUIRED/,
  );
  await assert.rejects(
    first.createPairedOriginalAccountActorV2(input),
    /ALREADY_PAIRED/,
  );
  await assert.rejects(
    source.createPairedOriginalAccountActorV2(input),
    /ALREADY_PAIRED/,
  );
  local.close();
  canonical.close();
  assert.equal(f.world.sends, 0);
  assert.equal(f.world.proofs, 0);
});
