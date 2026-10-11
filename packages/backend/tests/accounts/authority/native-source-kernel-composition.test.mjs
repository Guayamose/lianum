/** Real SOURCE/Vault with explicitly inert native resources. No node, proof,
 * owner key, funding or financial operation is created by this HOST check. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNativeSourceHost } from "../../support/native-source-host.mjs";

test("SOURCE composition keeps resource loads behind inspection and independent families cannot consume original handles", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "lianum-source-kernel-"));
  let original;
  const host = await createNativeSourceHost(root);
  t.after(async () => {
    try {
      if (original) await host.api.closeOriginalNativeSourceCapsuleV1(original);
    } finally {
      host.restore();
      await rm(root, { recursive: true, force: true });
    }
  });
  const {
    buildOriginalNativeSourceLifecycleV1: build,
    SOURCE_LIFECYCLE_LOADERS_V1: keys,
  } = await import(
    "../../../src/operations/recovery/native-original-source-lifecycle-backend-v1.mjs"
  );
  const { Vault } = await import("@lianum/engine/crypto/vault");
  const {
    originalActorFrameDataV1,
    reconcileNativeSourceActorCheckpointDataV1,
    reconcileNativeSourceAccountCheckpointDataV1,
  } = await import(
    "../../../src/operations/recovery/source-journal/checkpoint-reconciliation-v1.mjs"
  );
  const { buildOriginalNativeSourceClockBackendV1 } = await import(
    "../../../src/operations/recovery/native-original-source-clock-backend-v1.mjs"
  );
  const { buildNativeManualSessionV1 } = await import(
    "../../../src/api/accounts/native-manual-session-backend-v1.mjs"
  );
  const { buildPairedOriginalAccountActorV2 } = await import(
    "../../../src/api/mobile/paired-original-account-actor-backend-v2.mjs"
  );
  const loads = [];
  const contracts = {
    wrappedRecovery: Object.freeze({}),
    deviceSourceAuthority: Object.freeze({}),
    assertOwnedEvmRecoveryStateDumpV1: () =>
      assert.fail("HOST_INERT_DUMP_GUARD_MUST_NOT_RUN"),
    load: Object.fromEntries(
      keys.map((name) => [
        name,
        async () => {
          loads.push(name);
          throw Error("HOST_INSPECTION_MUST_PRECEDE_RESOURCE_LOAD");
        },
      ]),
    ),
    dependencies: {
      ROOT: root,
      Vault,
      NATIVE_VALUE_DEV_RELEASE_V5: { hostSourceClosureSHA256: "ef".repeat(32) },
      buildOwnedEvmRuntimeBackendV1: () =>
        Object.freeze({
          refreshNativeValueReceiverClock: () =>
            assert.fail("HOST_NO_CLOCK_RESOURCE"),
          refreshOwnedNativeEconomicObservedGraphClockV2: () =>
            assert.fail("HOST_NO_CLOCK_RESOURCE"),
        }),
      buildPairedOriginalAccountActorV2,
      buildNativeManualSessionV1,
      originalActorFrameDataV1,
      reconcileNativeSourceActorCheckpointDataV1,
      reconcileNativeSourceAccountCheckpointDataV1,
      buildOriginalNativeSourceClockBackendV1,
    },
  };
  const first = build(contracts),
    second = build(contracts);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(second));
  assert.deepEqual(loads, []);
  assert.throws(() =>
    build({
      ...contracts,
      load: { ...contracts.load, callerModule: async () => ({}) },
    }),
  );
  assert.throws(() =>
    build({
      ...contracts,
      load: { ...contracts.load, nativeOriginalSourcePartsV1: null },
    }),
  );
  assert.throws(() => build(contracts, {}));
  original = await host.api.createOriginalNativeSourceCapsuleV1();
  assert.equal(
    host.api.originalNativeSourceCapsuleStatusV1(original).phase,
    "SEEDING",
  );
  for (const family of [first, second]) {
    assert.throws(
      () => family.assertOriginalNativeSourceCapsuleV1(original),
      /NATIVE_SOURCE_ORIGINAL_CAPSULE/,
    );
    assert.throws(
      () => family.originalNativeSourceCapsuleStatusV1(original),
      /NATIVE_SOURCE_ORIGINAL_CAPSULE/,
    );
    await assert.rejects(
      family.retainOriginalNativeSourceReferenceV1(original, "account", {}),
      /NATIVE_SOURCE_ORIGINAL_CAPSULE/,
    );
  }
  await assert.rejects(
    host.api.retainOriginalNativeSourceReferenceV1(
      { ...original },
      "account",
      {},
    ),
    /NATIVE_SOURCE_ORIGINAL_CAPSULE/,
  );
  assert.deepEqual(loads, []);
});
