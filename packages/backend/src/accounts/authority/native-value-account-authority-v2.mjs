/** Canonical native account composition. The original resource owners
 * and lazy loaders are bound once here; no canonical setter or registry writer
 * escapes. Public methods retain their original signatures and guards. */
import { buildNativeValueAccountAuthorityV2 } from "./native-value-account-backend-v2.mjs";
import {
  createOriginalNativeSourceProofReceiptCodecV1,
  transportProof,
} from "./native-value/source-proof-receipts-v1.mjs";
import { readOriginalNativePrivateDepositDerivationV2 } from "@lianum/proofs/jobs/native-device-private-deposit-client-v2";
import {
  createNativeEconomicNoteProofProcessV1,
  createProofProcess,
} from "@lianum/proofs/execution/proof-process";
import { nullifier } from "@lianum/engine/notes/private-note-encoding";
import { encodeFlatTransaction } from "../../execution/encoding/transaction-codec.mjs";
import { buildDeviceDepositBridgeBackendV1 } from "./device-deposit-bridge-backend-v1.mjs";
import { buildDeviceReservationBridgeBackendV1 } from "./device-reservation-bridge-backend-v1.mjs";
import { buildDeviceExecutionBridgeBackendV1 } from "./device-execution-bridge-backend-v1.mjs";
import * as originalDeviceActor from "../../operations/recovery/native-original-source-lifecycle-v1.mjs";
import { assertOwnedNativeValueProviderCustody as originalDeviceProviderGuard } from "../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs";
import { decodeNativeValueTerminalCalldata } from "../../execution/encoding/terminal-calldata-codec.mjs";
import { reconcileOriginalDeviceNativeRecoveryV1 } from "../../execution/native-value/execution/native-value-execution-v2.mjs";
import { refreshOriginalNativeDeviceLocalObservedClockV1 } from "../../operations/recovery/native-device-local-observed-clock-v1.mjs";
import { refreshOriginalNativeSourceObservedClockV1 } from "../../operations/recovery/native-original-source-lifecycle-v1.mjs";
import { assertOwnedFlatPortfolioAccount } from "./flat-portfolio-authority.mjs";
import { assertOwnedFlatManualPortfolioKeeper } from "../portfolio/flat-manual-portfolio-keeper.mjs";
import { assertOwnedFlatManualAccountKeeper } from "../storage/flat-manual-account-keeper.mjs";
import { createRecoveredDeviceInstallations } from "./native-value/recovered-device-installations.mjs";
import { createLiveRecoveryLeaseFamily } from "./native-value/live-recovery-leases.mjs";
import { createNativeValueAccountJournals } from "./native-value/native-value-authority-journals.mjs";
import { createNativeValueDeposits } from "./native-value/native-value-authority-deposits.mjs";
import { createNativeValueReservations } from "./native-value/native-value-authority-reservations.mjs";
import { createNativeValueExecutionOperations } from "./native-value/native-value-authority-execution.mjs";
import { createNativeValueWithdrawals } from "./native-value/native-value-authority-withdrawals.mjs";
import { createNativeValueOwnerOperations } from "./native-value/native-value-authority-operations.mjs";
import { createNativeValueManualLifecycle } from "./native-value/native-value-authority-manual.mjs";
import { createNativeValueAccountInterface } from "./native-value/native-value-authority-interface.mjs";
import {
  nativeSourceRecoverySectionIdentityV1,
  retainOriginalNativeSourceSectionV1,
  consumeOriginalNativeSourceSectionV1,
  updateOriginalNativeSourceSectionV1,
  resumeOriginalNativeSourceSectionV1,
} from "../../operations/recovery/native-original-source-lifecycle-v1.mjs";
import { assertOriginalNativeSourceObservedClockV1 } from "../../operations/recovery/native-original-source-lifecycle-v1.mjs";
import { ownedNativeValueProviderCustodyReview as recoveryProviderReviewV1 } from "../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs";
import { assertWrappedWalletAccountReleasedV1 } from "../../operations/releases/wrapped/wrapped-wallet-release-v1.mjs";
import { Vault } from "@lianum/engine/crypto/vault";
import {
  assertNativeEconomicRecoveryCaptureV1,
  assertNativeLiveArmedRecoveryCaptureV1,
  nativeEconomicRecoverySectionIdentityV1,
  consumeNativeEconomicRecoverySectionV1,
} from "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs";
import { nativeValueOriginalRecoverySourceV1 } from "../../operations/deployments/native-value/native-value-system-v2.mjs";
import { nativeValueOwnerEconomicIdentityV1 } from "../../custody/processes/native-value-owner-process-v2.mjs";
import { ownedNativeValueProviderCustodyReview as nativeRecoveryProviderReviewV1 } from "../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs";
import { assertLocalEvm } from "../../chains/evm/runtime/local-evm-ownership.mjs";
import {
  genericAccountIdentity,
  validateGenericAccountConfig,
  immutable,
  copy,
  sha,
} from "@lianum/engine/accounts/journal";
import { assertOwnedNativeValueWalletSystem as nativeSystem } from "../../operations/deployments/native-value/native-value-system-v2.mjs";
import { createNativeValueSystemStateReader as nativeReader } from "../../execution/native-value/reconciliation/native-value-system-state-v2.mjs";
import { assertOwnedPoolAsset } from "../../chains/shared/contracts/owned-pool-asset.mjs";
import {
  assertOwnedNativeValueExecution as nativeExecutionAssert,
  ownedNativeValueManualGraphReview as nativeGraphReview,
} from "../../execution/native-value/execution/native-value-execution-v2.mjs";
import { createNativeValueTerminalObserver as nativeTerminal } from "../../execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs";
import { decodeStatement } from "@lianum/components/encoding/statements";
import { assertOwnedNativeValueOwnerProcess as nativeOwner } from "../../custody/processes/native-value-owner-process-v2.mjs";
import {
  createNativeValueOwnerObserver as nativeObserver,
  assertOwnedNativeValueOwnerObserver as nativeObserverAssert,
} from "../../custody/observers/native-value-owner-observer-v2.mjs";
import { createFlatProofRunner } from "@lianum/backend/proving/roles/scoped-proof-runner";
import {
  flatAccountAsset,
  flatAccountGraphBinding,
  flatAccountCalldataHash,
  validateFlatAccountOwnerObservation,
} from "./flat-account-validation.mjs";
import { assertOwnedWrappedClaimWalletSystemV1 } from "../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs";
import { createWrappedWalletStateReaderV1 } from "../../execution/wrapped/reconciliation/wrapped-wallet-state-v1.mjs";
import { createWrappedWalletTerminalObserverV1 } from "../../execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs";
import { assertOwnedWrappedClaimOwnerProcessV1 } from "../../custody/processes/wrapped-claim-owner-process-v1.mjs";
import {
  createWrappedClaimOwnerObserverV1,
  assertOwnedWrappedClaimOwnerObserverV1,
} from "../../custody/observers/wrapped-claim-owner-observer-v1.mjs";
import { validateNativeValueManualReview } from "@lianum/custody/preparation/native-value-owner-manual-binding-v1";
import {
  decodeWalletPoolInputs,
  walletInputPublicWords,
} from "@lianum/engine/wallet/notes/private-wallet-note-encoding";
import { validateGenericBalanceNativePreparation } from "@lianum/engine/execution/balances/generic-balance-native-preparation";
import { restoreNativeDeviceOriginalW39MetricsFrameV1 } from "./native-device-original-w39-metrics-frame-v1.mjs";
import {
  assertOriginalNativeDeviceLocalObservedClockV1,
  assertOriginalNativeDeviceLiveArmedObservedClockV1,
  captureOriginalNativeDeviceLiveArmedClockCheckpointV1,
} from "../../operations/recovery/native-device-local-observed-clock-v1.mjs";
const originalNativeAccount = buildNativeValueAccountAuthorityV2(
  Object.freeze({
    dependencies: Object.freeze({
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
    }),
    load: Object.freeze({
      nativeOriginalSourceLifecycleV1: () =>
        import(
          "../../operations/recovery/native-original-source-lifecycle-v1.mjs"
        ),
      nativeValueExecutionV2: () =>
        import(
          "../../execution/native-value/execution/native-value-execution-v2.mjs"
        ),
      wrappedRecoveryAuthorityV1: () =>
        import(
          "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs"
        ),
      nativeValueOwnerManualPreparationV1: () =>
        import(
          "../../custody/preparation/native-value-owner-manual-preparation-v1.mjs"
        ),
      nativeValueSystemV2: () =>
        import(
          "../../operations/deployments/native-value/native-value-system-v2.mjs"
        ),
      wrappedClaimDispatchOwnerV1: () =>
        import(
          "../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs"
        ),
      wrappedWalletCompositionV1: () =>
        import("../../operations/wallet/wrapped-wallet-composition-v1.mjs"),
    }),
  }),
);

export function originalDeviceNativeFReorgStateV1(account, executor, ref) {
  return originalNativeAccount.originalDeviceNativeFReorgStateV1(...arguments);
}

export async function retainOriginalDeviceNativeFReorgV1(
  account,
  executor,
  ref,
  id,
  phase,
) {
  return originalNativeAccount.retainOriginalDeviceNativeFReorgV1(...arguments);
}

export async function checkOriginalDeviceNativeFReorgPendingV1(
  account,
  executor,
  ref,
  id,
) {
  return originalNativeAccount.checkOriginalDeviceNativeFReorgPendingV1(
    ...arguments,
  );
}

export function assertOriginalDeviceNativeFReorgPendingV1(
  account,
  executor,
  ref,
  id,
) {
  return originalNativeAccount.assertOriginalDeviceNativeFReorgPendingV1(
    ...arguments,
  );
}

export async function readOriginalNativeSourceProofReceiptsV1(account) {
  return originalNativeAccount.readOriginalNativeSourceProofReceiptsV1(
    ...arguments,
  );
}

export function nativeValueAccountManualNoteDetails(approval) {
  return originalNativeAccount.nativeValueAccountManualNoteDetails(
    ...arguments,
  );
}

export function nativeValueAccountManualGraphDetails(capability) {
  return originalNativeAccount.nativeValueAccountManualGraphDetails(
    ...arguments,
  );
}

export function assertNativeValueAccountManualGraphExecution(capability) {
  return originalNativeAccount.assertNativeValueAccountManualGraphExecution(
    ...arguments,
  );
}

export function readDeviceOwnerRecoveryArmTermsV1(account, bridge, id) {
  return originalNativeAccount.readDeviceOwnerRecoveryArmTermsV1(...arguments);
}

export function readDeviceOwnerLiveArmedOriginalOwnerSnapshotV1(
  account,
  bridge,
  id,
) {
  return originalNativeAccount.readDeviceOwnerLiveArmedOriginalOwnerSnapshotV1(
    ...arguments,
  );
}

export function runDeviceOwnerRecoveryArmAuthorizationV1(account, bridge, cap) {
  return originalNativeAccount.runDeviceOwnerRecoveryArmAuthorizationV1(
    ...arguments,
  );
}

export async function retainOriginalNativeDeviceRecoveredInstallationV1(
  account,
  actor,
  providerCustody,
) {
  return originalNativeAccount.retainOriginalNativeDeviceRecoveredInstallationV1(
    ...arguments,
  );
}

export function consumeOriginalNativeDeviceRecoveredInstallationV1(
  cap,
  account,
  actor,
) {
  return originalNativeAccount.consumeOriginalNativeDeviceRecoveredInstallationV1(
    ...arguments,
  );
}

export async function retainOriginalNativeDeviceSourceInstallationV1(
  account,
  actor,
  providerCustody,
) {
  return originalNativeAccount.retainOriginalNativeDeviceSourceInstallationV1(
    ...arguments,
  );
}

export function consumeOriginalNativeDeviceSourceInstallationV1(
  cap,
  account,
  actor,
) {
  return originalNativeAccount.consumeOriginalNativeDeviceSourceInstallationV1(
    ...arguments,
  );
}

export function readOriginalNativeLiveArmedClockCheckpointV1(account, runtime) {
  return originalNativeAccount.readOriginalNativeLiveArmedClockCheckpointV1(
    ...arguments,
  );
}

export async function retainOriginalNativeDeviceLiveArmedInstallationV1(
  account,
  actor,
  providerCustody,
) {
  return originalNativeAccount.retainOriginalNativeDeviceLiveArmedInstallationV1(
    ...arguments,
  );
}

export function consumeOriginalNativeDeviceLiveArmedInstallationV1(
  cap,
  account,
  actor,
) {
  return originalNativeAccount.consumeOriginalNativeDeviceLiveArmedInstallationV1(
    ...arguments,
  );
}

export async function readOriginalNativeDeviceEconomicProofsV1(account) {
  return originalNativeAccount.readOriginalNativeDeviceEconomicProofsV1(
    ...arguments,
  );
}

export async function installDeviceOwnerExecutionV1(account, bridge) {
  return originalNativeAccount.installDeviceOwnerExecutionV1(...arguments);
}

export async function readDeviceOwnerExecutionStatusV1(account, bridge, jobId) {
  return originalNativeAccount.readDeviceOwnerExecutionStatusV1(...arguments);
}

export async function runDeviceOwnerExecutionAuthorizationV1(
  account,
  bridge,
  admission,
) {
  return originalNativeAccount.runDeviceOwnerExecutionAuthorizationV1(
    ...arguments,
  );
}

export async function installOriginalNativePrivateExitV2(account, bridge) {
  return originalNativeAccount.installOriginalNativePrivateExitV2(...arguments);
}

export function isOriginalNativePrivateExitAccountV2(account) {
  return originalNativeAccount.isOriginalNativePrivateExitAccountV2(
    ...arguments,
  );
}

export async function prepareDeviceOwnerExitV1(account, bridge, input) {
  return originalNativeAccount.prepareDeviceOwnerExitV1(...arguments);
}

export async function readDeviceOwnerOutputBalanceV1(account, bridge, input) {
  return originalNativeAccount.readDeviceOwnerOutputBalanceV1(...arguments);
}

export async function readDeviceOwnerExitStatusV1(account, bridge, jobId) {
  return originalNativeAccount.readDeviceOwnerExitStatusV1(...arguments);
}

export async function runDeviceOwnerExitAuthorizationV1(
  account,
  bridge,
  admission,
) {
  return originalNativeAccount.runDeviceOwnerExitAuthorizationV1(...arguments);
}

export async function runDeviceOwnerReservationAuthorizationV1(
  account,
  bridge,
  authorization,
) {
  return originalNativeAccount.runDeviceOwnerReservationAuthorizationV1(
    ...arguments,
  );
}

export async function readDeviceOwnerReservationStatusV1(
  account,
  bridge,
  jobId,
) {
  return originalNativeAccount.readDeviceOwnerReservationStatusV1(...arguments);
}

export async function installOriginalNativePrivateDepositV2(account, bridge) {
  return originalNativeAccount.installOriginalNativePrivateDepositV2(
    ...arguments,
  );
}

export function isOriginalNativePrivateDepositAccountV2(account) {
  return originalNativeAccount.isOriginalNativePrivateDepositAccountV2(
    ...arguments,
  );
}

export async function runDeviceOwnerDepositAuthorizationV1(
  account,
  bridge,
  authorization,
) {
  return originalNativeAccount.runDeviceOwnerDepositAuthorizationV1(
    ...arguments,
  );
}

export async function readDeviceOwnerDepositStatusV1(account, bridge, jobId) {
  return originalNativeAccount.readDeviceOwnerDepositStatusV1(...arguments);
}

export function projectFlatAccountOwnerView(input) {
  return originalNativeAccount.projectFlatAccountOwnerView(...arguments);
}

export function assertOwnedNativeValueAccountAuthority(capability, expected) {
  return originalNativeAccount.assertOwnedNativeValueAccountAuthority(
    ...arguments,
  );
}

export function assertOwnedWrappedWalletAccountAuthorityV1(
  capability,
  expected,
) {
  return originalNativeAccount.assertOwnedWrappedWalletAccountAuthorityV1(
    ...arguments,
  );
}

export function wrappedWalletAccountManualGraphDetailsV1(capability) {
  return originalNativeAccount.wrappedWalletAccountManualGraphDetailsV1(
    ...arguments,
  );
}

export function assertWrappedWalletAccountManualGraphExecutionV1(capability) {
  return originalNativeAccount.assertWrappedWalletAccountManualGraphExecutionV1(
    ...arguments,
  );
}

export async function createNativeValueAccountAuthority(input, callbacks = {}) {
  return originalNativeAccount.createNativeValueAccountAuthority(...arguments);
}

export async function createNativeEconomicNoteAccountAuthorityV1(
  input,
  callbacks = {},
) {
  return originalNativeAccount.createNativeEconomicNoteAccountAuthorityV1(
    ...arguments,
  );
}

export function createNativeLiveArmedNoteAccountAuthorityV1(input) {
  return originalNativeAccount.createNativeLiveArmedNoteAccountAuthorityV1(
    ...arguments,
  );
}

export function createNativeLiveArmedNoteAccountForOriginalProofCaptureV1(
  input,
  callbacks,
) {
  return originalNativeAccount.createNativeLiveArmedNoteAccountForOriginalProofCaptureV1(
    ...arguments,
  );
}

export function assertNativeLiveArmedAccountCaptureV1(account, authority) {
  return originalNativeAccount.assertNativeLiveArmedAccountCaptureV1(
    ...arguments,
  );
}

export async function createWrappedWalletAccountAuthorityV1(input) {
  return originalNativeAccount.createWrappedWalletAccountAuthorityV1(
    ...arguments,
  );
}

export function createOriginalNativeSourceNoteAccountAuthorityV1(token, input) {
  return originalNativeAccount.createOriginalNativeSourceNoteAccountAuthorityV1(
    ...arguments,
  );
}

export function createOriginalNativeSourceNoteAccountForProofCaptureV1(
  token,
  input,
  callbacks,
) {
  return originalNativeAccount.createOriginalNativeSourceNoteAccountForProofCaptureV1(
    ...arguments,
  );
}

export async function captureWrappedWalletAccountForReopenV1(account) {
  return originalNativeAccount.captureWrappedWalletAccountForReopenV1(
    ...arguments,
  );
}

export async function stopCapturedWrappedWalletAccountV1(account) {
  return originalNativeAccount.stopCapturedWrappedWalletAccountV1(...arguments);
}

export async function reopenWrappedWalletAccountFromRecoveryV1(token) {
  return originalNativeAccount.reopenWrappedWalletAccountFromRecoveryV1(
    ...arguments,
  );
}

export function recoveredWrappedWalletManualGraphApprovalsV1(account) {
  return originalNativeAccount.recoveredWrappedWalletManualGraphApprovalsV1(
    ...arguments,
  );
}

export function wrappedWalletAccountPrivateInitializationV1(account) {
  return originalNativeAccount.wrappedWalletAccountPrivateInitializationV1(
    ...arguments,
  );
}

export function fenceWrappedWalletAccountRecoveryV1(account) {
  return originalNativeAccount.fenceWrappedWalletAccountRecoveryV1(
    ...arguments,
  );
}

export async function captureOriginalDeviceD26ObservationV1(input) {
  return originalNativeAccount.captureOriginalDeviceD26ObservationV1(
    ...arguments,
  );
}

export function fenceOriginalNativeAccountEconomicRecoveryV1(
  account,
  authority,
) {
  return originalNativeAccount.fenceOriginalNativeAccountEconomicRecoveryV1(
    ...arguments,
  );
}

export function captureOriginalNativeAccountEconomicRecoveryV1(account, token) {
  return originalNativeAccount.captureOriginalNativeAccountEconomicRecoveryV1(
    ...arguments,
  );
}

export function stopCapturedNativeAccountEconomicRecoveryV1(account, token) {
  return originalNativeAccount.stopCapturedNativeAccountEconomicRecoveryV1(
    ...arguments,
  );
}

export function abortNativeAccountEconomicRecoveryV1(account, token) {
  return originalNativeAccount.abortNativeAccountEconomicRecoveryV1(
    ...arguments,
  );
}

export async function reopenOriginalNativeAccountEconomicRecoveryV1(
  token,
  contexts,
) {
  return originalNativeAccount.reopenOriginalNativeAccountEconomicRecoveryV1(
    ...arguments,
  );
}

export function nativeValueOriginalRecoverySourceV1FromAccount(account) {
  return originalNativeAccount.nativeValueOriginalRecoverySourceV1FromAccount(
    ...arguments,
  );
}

export async function reopenOriginalNativeAccountSourceV1(token, contexts) {
  return originalNativeAccount.reopenOriginalNativeAccountSourceV1(
    ...arguments,
  );
}

export function assertOriginalNativeAccountSourceV1(account, identity) {
  return originalNativeAccount.assertOriginalNativeAccountSourceV1(
    ...arguments,
  );
}

export async function installOriginalNativePrivateReservationV2(
  account,
  bridge,
) {
  return originalNativeAccount.installOriginalNativePrivateReservationV2(
    ...arguments,
  );
}

export function isOriginalNativePrivateReservationAccountV2(account) {
  return originalNativeAccount.isOriginalNativePrivateReservationAccountV2(
    ...arguments,
  );
}

export function readOriginalNativePrivateReservationContextV2(
  account,
  bridge,
  fields,
) {
  return originalNativeAccount.readOriginalNativePrivateReservationContextV2(
    ...arguments,
  );
}

export function isOriginalNativePrivateWorkerAccountV3(account) {
  return originalNativeAccount.isOriginalNativePrivateWorkerAccountV3(
    ...arguments,
  );
}
export const {
  createDeviceOwnerDepositBridgeV1,
  createOriginalNativePrivateDepositBridgeV2,
  isOriginalNativePrivateDepositBridgeV2,
  createOriginalNativePrivateWorkerDepositBridgeV3,
  isOriginalNativePrivateWorkerDepositBridgeV3,
  assertDeviceOwnerDepositDurableRequestV1,
  awaitDeviceOwnerDepositOriginalProofV1,
  awaitDeviceOwnerDepositOriginalFundingV1,
  awaitDeviceOwnerDepositOriginalObservationV1,
  deviceOwnerDepositBridgeActorV1,
  assertDeviceOwnerDepositBridgeV1,
  consumeDeviceOwnerDepositAuthorizationV1,
  createDeviceOwnerReservationBridgeV1,
  createOriginalNativePrivateReservationBridgeV2,
  assertDeviceOwnerReservationDurableRequestV1,
  assertDeviceOwnerReservationBridgeV1,
  deviceOwnerReservationBridgeActorV1,
  consumeDeviceOwnerReservationAuthorizationV1,
  awaitDeviceOwnerReservationOriginalWorkV1,
  readDeviceOwnerReservationOriginalPreparationV1,
  isOriginalNativePrivateReservationBridgeV2,
  createDeviceOwnerExecutionBridgeV1,
  createOriginalNativePrivateExecutionBridgeV2,
  isOriginalNativePrivateExecutionBridgeV2,
  createOriginalNativePrivateWorkerExecutionBridgeV3,
  isOriginalNativePrivateWorkerExecutionBridgeV3,
  assertDeviceOwnerExecutionDurableRequestV1,
  assertDeviceOwnerExecutionBridgeV1,
  consumeDeviceOwnerExecutionInstallationV1,
  deviceOwnerExecutionBridgeActorV1,
  assertDeviceOwnerExecutionTransportBindingsV1,
  consumeDeviceOwnerExecutionAuthorizationV1,
  awaitDeviceOwnerExecutionOriginalWorkV1,
  createDeviceOwnerLiveRecoveryLeaseV1,
  createOriginalNativeSourceLiveRecoveryLeaseV1,
  closeDeviceOwnerLiveRecoveryLeaseV1,
  tickDeviceOwnerLiveRecoveryLeaseV1,
} = originalNativeAccount;
