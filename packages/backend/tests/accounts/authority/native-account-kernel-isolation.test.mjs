/** Complete native account implementation with real encrypted storage. The lower
 * chain/owner/reader/prover ports are inert and cannot accept a financial action. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flatOwnerIdentity } from "@lianum/custody/owner";
import { derivePrivateAssetIdentity } from "@lianum/engine/notes/private-asset-runtime";
import * as canonical from "../../../src/accounts/authority/native-value-account-authority-v2.mjs";
import {
  buildNativeValueAccountAuthorityV2 as build,
  NATIVE_ACCOUNT_LOADERS_V1 as loaderNames,
} from "../../../src/accounts/authority/native-value-account-backend-v2.mjs";
import {
  createOriginalNativeSourceProofReceiptCodecV1,
  transportProof,
} from "./../../../src/accounts/authority/native-value/source-proof-receipts-v1.mjs";
import { readOriginalNativePrivateDepositDerivationV2 } from "@lianum/proofs/jobs/native-device-private-deposit-client-v2";
import {
  createNativeEconomicNoteProofProcessV1,
  createProofProcess,
} from "@lianum/proofs/execution/proof-process";
import { nullifier } from "@lianum/engine/notes/private-note-encoding";
import { encodeFlatTransaction } from "./../../../src/execution/encoding/transaction-codec.mjs";
import { buildDeviceDepositBridgeBackendV1 } from "./../../../src/accounts/authority/device-deposit-bridge-backend-v1.mjs";
import { buildDeviceReservationBridgeBackendV1 } from "./../../../src/accounts/authority/device-reservation-bridge-backend-v1.mjs";
import { buildDeviceExecutionBridgeBackendV1 } from "./../../../src/accounts/authority/device-execution-bridge-backend-v1.mjs";
import * as originalDeviceActor from "./../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs";
import { assertOwnedNativeValueProviderCustody as originalDeviceProviderGuard } from "./../../../src/chains/shared/dispatch/native-value-dispatch-owner-v2.mjs";
import { decodeNativeValueTerminalCalldata } from "./../../../src/execution/encoding/terminal-calldata-codec.mjs";
import { reconcileOriginalDeviceNativeRecoveryV1 } from "./../../../src/execution/native-value/execution/native-value-execution-v2.mjs";
import { refreshOriginalNativeDeviceLocalObservedClockV1 } from "./../../../src/operations/recovery/native-device-local-observed-clock-v1.mjs";
import { refreshOriginalNativeSourceObservedClockV1 } from "./../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs";
import { assertOwnedFlatPortfolioAccount } from "./../../../src/accounts/authority/flat-portfolio-authority.mjs";
import { assertOwnedFlatManualPortfolioKeeper } from "./../../../src/accounts/portfolio/flat-manual-portfolio-keeper.mjs";
import { assertOwnedFlatManualAccountKeeper } from "./../../../src/accounts/storage/flat-manual-account-keeper.mjs";
import { createRecoveredDeviceInstallations } from "./../../../src/accounts/authority/native-value/recovered-device-installations.mjs";
import { createLiveRecoveryLeaseFamily } from "./../../../src/accounts/authority/native-value/live-recovery-leases.mjs";
import { createNativeValueAccountJournals } from "./../../../src/accounts/authority/native-value/native-value-authority-journals.mjs";
import { createNativeValueDeposits } from "./../../../src/accounts/authority/native-value/native-value-authority-deposits.mjs";
import { createNativeValueReservations } from "./../../../src/accounts/authority/native-value/native-value-authority-reservations.mjs";
import { createNativeValueExecutionOperations } from "./../../../src/accounts/authority/native-value/native-value-authority-execution.mjs";
import { createNativeValueWithdrawals } from "./../../../src/accounts/authority/native-value/native-value-authority-withdrawals.mjs";
import { createNativeValueOwnerOperations } from "./../../../src/accounts/authority/native-value/native-value-authority-operations.mjs";
import { createNativeValueManualLifecycle } from "./../../../src/accounts/authority/native-value/native-value-authority-manual.mjs";
import { createNativeValueAccountInterface } from "./../../../src/accounts/authority/native-value/native-value-authority-interface.mjs";
import {
  nativeSourceRecoverySectionIdentityV1,
  retainOriginalNativeSourceSectionV1,
  consumeOriginalNativeSourceSectionV1,
  updateOriginalNativeSourceSectionV1,
  resumeOriginalNativeSourceSectionV1,
} from "./../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs";
import { assertOriginalNativeSourceObservedClockV1 } from "./../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs";
import { ownedNativeValueProviderCustodyReview as recoveryProviderReviewV1 } from "./../../../src/chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs";
import { assertWrappedWalletAccountReleasedV1 } from "./../../../src/operations/releases/wrapped/wrapped-wallet-release-v1.mjs";
import { Vault } from "@lianum/engine/crypto/vault";
import {
  assertNativeEconomicRecoveryCaptureV1,
  assertNativeLiveArmedRecoveryCaptureV1,
  nativeEconomicRecoverySectionIdentityV1,
  consumeNativeEconomicRecoverySectionV1,
} from "./../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs";
import { nativeValueOriginalRecoverySourceV1 } from "./../../../src/operations/deployments/native-value/native-value-system-v2.mjs";
import { nativeValueOwnerEconomicIdentityV1 } from "./../../../src/custody/processes/native-value-owner-process-v2.mjs";
import { ownedNativeValueProviderCustodyReview as nativeRecoveryProviderReviewV1 } from "./../../../src/chains/shared/dispatch/native-value-dispatch-owner-v2.mjs";
import { assertLocalEvm } from "./../../../src/chains/evm/runtime/local-evm-ownership.mjs";
import {
  genericAccountIdentity,
  validateGenericAccountConfig,
  immutable,
  copy,
  sha,
} from "@lianum/engine/accounts/journal";
import { assertOwnedNativeValueWalletSystem as nativeSystem } from "./../../../src/operations/deployments/native-value/native-value-system-v2.mjs";
import { createNativeValueSystemStateReader as nativeReader } from "./../../../src/execution/native-value/reconciliation/native-value-system-state-v2.mjs";
import { assertOwnedPoolAsset } from "./../../../src/chains/shared/contracts/owned-pool-asset.mjs";
import {
  assertOwnedNativeValueExecution as nativeExecutionAssert,
  ownedNativeValueManualGraphReview as nativeGraphReview,
} from "./../../../src/execution/native-value/execution/native-value-execution-v2.mjs";
import { createNativeValueTerminalObserver as nativeTerminal } from "./../../../src/execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs";
import { decodeStatement } from "@lianum/components/encoding/statements";
import { assertOwnedNativeValueOwnerProcess as nativeOwner } from "./../../../src/custody/processes/native-value-owner-process-v2.mjs";
import {
  createNativeValueOwnerObserver as nativeObserver,
  assertOwnedNativeValueOwnerObserver as nativeObserverAssert,
} from "./../../../src/custody/observers/native-value-owner-observer-v2.mjs";
import { createFlatProofRunner } from "@lianum/backend/proving/roles/scoped-proof-runner";
import {
  flatAccountAsset,
  flatAccountGraphBinding,
  flatAccountCalldataHash,
  validateFlatAccountOwnerObservation,
} from "./../../../src/accounts/authority/flat-account-validation.mjs";
import { assertOwnedWrappedClaimWalletSystemV1 } from "./../../../src/operations/deployments/wrapped/wrapped-claim-system-v1.mjs";
import { createWrappedWalletStateReaderV1 } from "./../../../src/execution/wrapped/reconciliation/wrapped-wallet-state-v1.mjs";
import { createWrappedWalletTerminalObserverV1 } from "./../../../src/execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs";
import { assertOwnedWrappedClaimOwnerProcessV1 } from "./../../../src/custody/processes/wrapped-claim-owner-process-v1.mjs";
import {
  createWrappedClaimOwnerObserverV1,
  assertOwnedWrappedClaimOwnerObserverV1,
} from "./../../../src/custody/observers/wrapped-claim-owner-observer-v1.mjs";
import { validateNativeValueManualReview } from "@lianum/custody/preparation/native-value-owner-manual-binding-v1";
import {
  decodeWalletPoolInputs,
  walletInputPublicWords,
} from "@lianum/engine/wallet/notes/private-wallet-note-encoding";
import { validateGenericBalanceNativePreparation } from "@lianum/engine/execution/balances/generic-balance-native-preparation";
import { restoreNativeDeviceOriginalW39MetricsFrameV1 } from "./../../../src/accounts/authority/native-device-original-w39-metrics-frame-v1.mjs";
import {
  assertOriginalNativeDeviceLocalObservedClockV1,
  assertOriginalNativeDeviceLiveArmedObservedClockV1,
  captureOriginalNativeDeviceLiveArmedClockCheckpointV1,
} from "./../../../src/operations/recovery/native-device-local-observed-clock-v1.mjs";

test("native account implementation owns encrypted account state and isolated families cannot enter the canonical owner", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "native-account-kernel-"));
  let account;
  t.after(async () => {
    try {
      if (account) await account.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const runtime = {
      metadata: {
        scratchDirectory: directory,
        chainId: "31337",
        evmGenesis: "0x" + "22".repeat(32),
      },
    },
    owner = Object.freeze({}),
    assetCapability = Object.freeze({});
  const domain = Object.fromEntries(
    [
      "scope",
      "policy",
      "asset",
      "hubDomain",
      "registryCommitment",
      "ledgerNamespace",
      "verifierSetCommitment",
    ].map((key, i) => [key, (i + 1).toString(16).padStart(2, "0").repeat(32)]),
  );
  domain.ledgerNamespace = domain.hubDomain;
  domain.asset = derivePrivateAssetIdentity(
    31337,
    "0x" + "00".repeat(20),
    "0x" + "00".repeat(32),
  ).slice(2);
  const identity = flatOwnerIdentity({
    pool: "11".repeat(20),
    domain,
    domainCommitment: "1".padStart(64, "0"),
  });
  const system = {
      bootstrap: { profile: "EXPLICIT_INERT_HOST" },
      pools: [
        {
          asset: "0x" + "00".repeat(20),
          codeHash: "0x" + "33".repeat(32),
          assetCapability,
          assetMetadata: null,
        },
      ],
    },
    observer = Object.freeze({ identity }),
    reader = Object.freeze({
      read: () => assert.fail("HOST_NO_CHAIN_READ"),
      assertCurrent: () => assert.fail("HOST_NO_CHAIN_READ"),
    });
  const context = (input) => {
    assert.equal(input.runtime, runtime);
    assert.equal(input.system, system);
    assert.equal(input.poolIndex, 0);
  };
  let resourceLoads = 0,
    proofCalls = 0,
    closed = 0,
    aborted = 0;
  const dependencies = {
    createOriginalNativeSourceProofReceiptCodecV1,
    transportProof,
    readOriginalNativePrivateDepositDerivationV2,
    createNativeEconomicNoteProofProcessV1,
    createProofProcess,
    nullifier,
    encodeFlatTransaction,
    buildDeviceDepositBridgeBackendV1,
    buildDeviceReservationBridgeBackendV1,
    buildDeviceExecutionBridgeBackendV1,
    originalDeviceActor,
    originalDeviceProviderGuard,
    decodeNativeValueTerminalCalldata,
    reconcileOriginalDeviceNativeRecoveryV1,
    refreshOriginalNativeDeviceLocalObservedClockV1,
    refreshOriginalNativeSourceObservedClockV1,
    assertOwnedFlatPortfolioAccount,
    assertOwnedFlatManualPortfolioKeeper,
    assertOwnedFlatManualAccountKeeper,
    createRecoveredDeviceInstallations,
    createLiveRecoveryLeaseFamily,
    createNativeValueAccountJournals,
    createNativeValueDeposits,
    createNativeValueReservations,
    createNativeValueExecutionOperations,
    createNativeValueWithdrawals,
    createNativeValueOwnerOperations,
    createNativeValueManualLifecycle,
    createNativeValueAccountInterface,
    nativeSourceRecoverySectionIdentityV1,
    retainOriginalNativeSourceSectionV1,
    consumeOriginalNativeSourceSectionV1,
    updateOriginalNativeSourceSectionV1,
    resumeOriginalNativeSourceSectionV1,
    assertOriginalNativeSourceObservedClockV1,
    recoveryProviderReviewV1,
    assertWrappedWalletAccountReleasedV1,
    Vault,
    assertNativeEconomicRecoveryCaptureV1,
    assertNativeLiveArmedRecoveryCaptureV1,
    nativeEconomicRecoverySectionIdentityV1,
    consumeNativeEconomicRecoverySectionV1,
    nativeValueOriginalRecoverySourceV1,
    nativeValueOwnerEconomicIdentityV1,
    nativeRecoveryProviderReviewV1,
    assertLocalEvm,
    genericAccountIdentity,
    validateGenericAccountConfig,
    immutable,
    copy,
    sha,
    nativeSystem,
    nativeReader,
    assertOwnedPoolAsset,
    nativeExecutionAssert,
    nativeGraphReview,
    nativeTerminal,
    decodeStatement,
    nativeOwner,
    nativeObserver,
    nativeObserverAssert,
    createFlatProofRunner,
    flatAccountAsset,
    flatAccountGraphBinding,
    flatAccountCalldataHash,
    validateFlatAccountOwnerObservation,
    assertOwnedWrappedClaimWalletSystemV1,
    createWrappedWalletStateReaderV1,
    createWrappedWalletTerminalObserverV1,
    assertOwnedWrappedClaimOwnerProcessV1,
    createWrappedClaimOwnerObserverV1,
    assertOwnedWrappedClaimOwnerObserverV1,
    validateNativeValueManualReview,
    decodeWalletPoolInputs,
    walletInputPublicWords,
    validateGenericBalanceNativePreparation,
    restoreNativeDeviceOriginalW39MetricsFrameV1,
    assertOriginalNativeDeviceLocalObservedClockV1,
    assertOriginalNativeDeviceLiveArmedObservedClockV1,
    captureOriginalNativeDeviceLiveArmedClockCheckpointV1,
  };
  Object.assign(dependencies, {
    nativeSystem: (r, s) => {
      assert.equal(r, runtime);
      assert.equal(s, system);
    },
    assertLocalEvm: async (r) => assert.equal(r, runtime),
    nativeOwner: (o, input) => {
      assert.equal(o, owner);
      context(input);
    },
    nativeObserver: async (input) => {
      context(input);
      return observer;
    },
    nativeObserverAssert: (o, input) => {
      assert.equal(o, observer);
      context(input);
    },
    nativeReader: async (input) => {
      context(input);
      return reader;
    },
    assertOwnedPoolAsset: (r, cap) => {
      assert.equal(r, runtime);
      assert.equal(cap, assetCapability);
    },
    createFlatProofRunner: () =>
      Object.freeze({
        run: () => {
          proofCalls++;
          assert.fail("HOST_NO_PROOF");
        },
        abort: async () => {
          aborted++;
        },
        close: async () => {
          closed++;
        },
      }),
  });
  const contracts = {
    dependencies,
    load: Object.fromEntries(
      loaderNames.map((name) => [
        name,
        async () => {
          resourceLoads++;
          throw Error("HOST_NO_RESOURCE_LOAD");
        },
      ]),
    ),
  };
  const first = build(contracts),
    second = build(contracts);
  assert.throws(() => build(contracts, {}));
  assert.throws(() =>
    build({
      ...contracts,
      load: { ...contracts.load, callerModule: async () => ({}) },
    }),
  );
  account = await first.createNativeValueAccountAuthority({
    runtime,
    system,
    poolIndex: 0,
    owner,
    nativeExecution: null,
    accountId: "host_native_account",
    journalId: "host_native_journal",
  });
  first.assertOwnedNativeValueAccountAuthority(account, {
    runtime,
    system,
    poolIndex: 0,
    owner,
  });
  assert.throws(
    () => canonical.assertOwnedNativeValueAccountAuthority(account),
    /OWNED_AUTHORITY_REQUIRED/,
  );
  assert.throws(
    () => second.assertOwnedNativeValueAccountAuthority(account),
    /OWNED_AUTHORITY_REQUIRED/,
  );
  assert.throws(
    () => first.assertOwnedNativeValueAccountAuthority({ ...account }),
    /OWNED_AUTHORITY_REQUIRED/,
  );
  assert.throws(
    () => first.assertOwnedNativeValueAccountAuthority(account, { owner: {} }),
    /OWNED_AUTHORITY_REQUIRED/,
  );
  assert.equal(resourceLoads, 0);
  assert.equal(proofCalls, 0);
  await account.abort();
  await account.abort();
  assert.equal(aborted, 1);
  await account.close();
  await account.close();
  assert.throws(
    () => first.assertOwnedNativeValueAccountAuthority(account),
    /OWNED_AUTHORITY_REQUIRED/,
  );
  account = null;
  assert.equal(closed, 1);
  assert.equal(aborted, 1);
});
