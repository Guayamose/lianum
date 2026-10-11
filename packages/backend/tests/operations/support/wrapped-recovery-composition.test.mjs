/** Complete private recovery owners with real encrypted storage and inert native
 * resources. Independent maps must reject both canonical and copied handles. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as canonical from "../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs";
import {
  buildWrappedRecoveryAuthorityV1 as build,
  WRAPPED_RECOVERY_LOADERS_V1 as loaderNames,
} from "../../../src/claims/wrapped/recovery/wrapped-recovery-backend-v1.mjs";
import { buildExternalDefiBootstrapRecoveryV1 } from "./../../../src/claims/wrapped/recovery/external-bootstrap-recovery-backend-v1.mjs";
import * as externalBootstrapSystem from "./../../../src/operations/deployments/system/deploy-system.mjs";
import * as externalBootstrapProtocols from "./../../../src/operations/deployments/defi/official-protocol-fixture-v3.mjs";
import * as externalBootstrapRouters from "./../../../src/operations/deployments/defi/deploy-private-external-router-v1.mjs";
import * as externalBootstrapOperators from "./../../../src/operations/operators/claims/native-operators.mjs";
import { buildWrappedSystemRecoveryV1 } from "./../../../src/claims/wrapped/recovery/wrapped-system-recovery-backend-v1.mjs";
import { assertWrappedWalletCompositionReleaseV1 } from "./../../../src/claims/wrapped/recovery/wrapped-composition-release-v1.mjs";
import { deviceWrappedRecoveryIdentityV1 } from "./../../../src/claims/wrapped/recovery/wrapped-lifetime-record-v1.mjs";
import {
  createWrappedLifetimeRootKeyV1,
  readWrappedLifetimePrivateFileV1,
} from "./../../../src/claims/wrapped/recovery/wrapped-lifetime-files-v1.mjs";
import * as canonicalEvmRuntime from "./../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs";
import { buildWrappedPrivateLifetimeRegistryV1 } from "./../../../src/claims/wrapped/recovery/wrapped-lifetime-registry-backend-v1.mjs";
import {
  EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3,
  EXTERNAL_DEFI_RECEIVER_SECTION_SCHEMA_V3,
} from "./../../../src/chains/evm/runtime/owned-external-defi-receiver-state-v3.mjs";
import {
  isOriginalDeviceGraphSourceSectionV2,
  originalDeviceGraphSourceSectionIdentityV2,
  consumeOriginalDeviceGraphSourceSectionV2,
} from "./../../../src/operations/recovery/device-external-flat-original-source-v2.mjs";
import { legacyDataRoot } from "@lianum/environment";
import { canonicalClaimRecordDataV1 } from "@lianum/engine/storage/records";
import { LOCAL_EVM_PROFILE } from "@lianum/engine/execution/local/local-evm";
import { assertStoppedNativeFilesV1 } from "./../../../src/chains/shared/runtime/owned-runtime-recovery-files-v1.mjs";
import {
  createClaimRecordStore,
  openClaimRecordStore,
  observeClaimRecordStoreV1,
} from "@lianum/engine/storage/records";

test("private wrapped recovery families reject canonical, copied and foreign handles before loading resources", async (t) => {
  const loads = [],
    attempts = [],
    opened = [];
  const contracts = {
    dependencies: {
      buildExternalDefiBootstrapRecoveryV1,
      externalBootstrapSystem,
      externalBootstrapProtocols,
      externalBootstrapRouters,
      externalBootstrapOperators,
      buildWrappedSystemRecoveryV1,
      assertWrappedWalletCompositionReleaseV1,
      deviceWrappedRecoveryIdentityV1,
      createWrappedLifetimeRootKeyV1,
      readWrappedLifetimePrivateFileV1,
      canonicalEvmRuntime,
      buildWrappedPrivateLifetimeRegistryV1,
      EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3,
      EXTERNAL_DEFI_RECEIVER_SECTION_SCHEMA_V3,
      isOriginalDeviceGraphSourceSectionV2,
      originalDeviceGraphSourceSectionIdentityV2,
      consumeOriginalDeviceGraphSourceSectionV2,
      legacyDataRoot,
      canonicalClaimRecordDataV1,
      LOCAL_EVM_PROFILE,
      assertStoppedNativeFilesV1,
      createClaimRecordStore,
      openClaimRecordStore,
      observeClaimRecordStoreV1,
    },
    load: Object.fromEntries(
      loaderNames.map((name) => [
        name,
        async () => {
          loads.push(name);
          throw Error("HOST_INSPECTION_MUST_PRECEDE_RESOURCE_LOAD");
        },
      ]),
    ),
  };
  const first = build(contracts),
    second = build(contracts);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(second));
  assert.deepEqual(loads, []);
  assert.throws(() => build(contracts, {}));
  assert.throws(() =>
    build({
      ...contracts,
      load: { ...contracts.load, callerModule: async () => ({}) },
    }),
  );
  assert.throws(() =>
    build({
      ...contracts,
      load: { ...contracts.load, ownedEvmV2Runtime: null },
    }),
  );
  assert.throws(() =>
    build({
      ...contracts,
      dependencies: { ...contracts.dependencies, callerAuthority: canonical },
    }),
  );
  t.after(async () => {
    try {
      for (const [api, handle] of opened.reverse())
        await api.closeWrappedRecoveryAuthorityV1(handle);
    } finally {
      for (const root of attempts)
        await rm(root, { recursive: true, force: true });
    }
  });
  async function create(api) {
    const runId = randomUUID(),
      root = join(
        legacyDataRoot("wallet"),
        ".local/wrapped-wallet-fixed-acceptance-v1",
        "attempt-" + runId,
      ),
      directory = join(root, "private-audit");
    attempts.push(root);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const input = {
      directory,
      runId,
      sourceSHA256: "ab".repeat(32),
      deadlineMs: Date.now() + 60000,
    };
    const handle = await api.createWrappedRecoveryAuthorityV1(input);
    opened.push([api, handle]);
    assert.equal(
      api.wrappedRecoveryAuthorityStatusV1(handle).phase,
      "CAPTURING",
    );
    const objects = join(directory, 'recovery', 'authority.vault', 'objects');
    const encryptedFiles = await readdir(objects);
    assert.ok(encryptedFiles.length > 0);
    for (const filename of encryptedFiles) {
      const encrypted = await readFile(join(objects, filename));
      assert.equal(encrypted.includes(Buffer.from(runId)), false);
    }
    return handle;
  }
  const original = await create(canonical),
    isolated = await create(first);
  for (const [api, handle] of [
    [first, original],
    [second, original],
    [canonical, isolated],
    [second, isolated],
    [first, { ...isolated }],
  ]) {
    assert.throws(
      () => api.wrappedRecoveryAuthorityStatusV1(handle),
      /WRAPPED_RECOVERY_ORIGINAL_AUTHORITY/,
    );
    await assert.rejects(
      api.retainWrappedRuntimeRecoveryV1(handle, "receiver", {}),
      /WRAPPED_RECOVERY_ORIGINAL_IDLE_AUTHORITY/,
    );
    await assert.rejects(
      api.retainOriginalWrappedRecoverySectionV1(handle, "receiver", {}),
      /WRAPPED_RECOVERY_ORIGINAL_CAPTURE_TOKEN/,
    );
  }
  assert.throws(() => canonical.wrappedRecoveryAuthorityStatusV1(original, {}));
  assert.deepEqual(loads, []);
  assert.equal(
    first.wrappedRecoveryAuthorityStatusV1(isolated).uncertain,
    false,
  );
  assert.equal(
    canonical.wrappedRecoveryAuthorityStatusV1(original).uncertain,
    false,
  );
});
