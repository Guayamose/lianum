/** Canonical fixed-attempt recovery composition. The original resource owners
 * and lazy loaders are bound once here; no canonical setter or registry writer
 * escapes. Public methods retain their original signatures and guards. */
import { buildWrappedRecoveryAuthorityV1 } from "./wrapped-recovery-backend-v1.mjs";
import { buildExternalDefiBootstrapRecoveryV1 } from "./external-bootstrap-recovery-backend-v1.mjs";
import * as externalBootstrapSystem from "../../../operations/deployments/system/deploy-system.mjs";
import * as externalBootstrapProtocols from "../../../operations/deployments/defi/official-protocol-fixture-v3.mjs";
import * as externalBootstrapRouters from "../../../operations/deployments/defi/deploy-private-external-router-v1.mjs";
import * as externalBootstrapOperators from "../../../operations/operators/claims/native-operators.mjs";
import { buildWrappedSystemRecoveryV1 } from "./wrapped-system-recovery-backend-v1.mjs";
import { assertWrappedWalletCompositionReleaseV1 } from "./wrapped-composition-release-v1.mjs";
import { deviceWrappedRecoveryIdentityV1 } from "./wrapped-lifetime-record-v1.mjs";
import {
  createWrappedLifetimeRootKeyV1,
  readWrappedLifetimePrivateFileV1,
} from "./wrapped-lifetime-files-v1.mjs";
import * as canonicalEvmRuntime from "../../../chains/evm/runtime/owned-evm-v2-runtime.mjs";
import { buildWrappedPrivateLifetimeRegistryV1 } from "./wrapped-lifetime-registry-backend-v1.mjs";
import {
  EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3,
  EXTERNAL_DEFI_RECEIVER_SECTION_SCHEMA_V3,
} from "../../../chains/evm/runtime/owned-external-defi-receiver-state-v3.mjs";
import {
  isOriginalDeviceGraphSourceSectionV2,
  originalDeviceGraphSourceSectionIdentityV2,
  consumeOriginalDeviceGraphSourceSectionV2,
} from "../../../operations/recovery/device-external-flat-original-source-v2.mjs";
import { legacyDataRoot } from "@lianum/environment";
import { canonicalClaimRecordDataV1 } from "@lianum/engine/storage/records";
import { LOCAL_EVM_PROFILE } from "@lianum/engine/execution/local/local-evm";
import { assertStoppedNativeFilesV1 } from "../../../chains/shared/runtime/owned-runtime-recovery-files-v1.mjs";
import {
  createClaimRecordStore,
  openClaimRecordStore,
  observeClaimRecordStoreV1,
} from "@lianum/engine/storage/records";
const originalRecovery = buildWrappedRecoveryAuthorityV1(
  Object.freeze({
    dependencies: Object.freeze({
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
    }),
    load: Object.freeze({
      ownedBitcoinRuntime: () =>
        import("../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs"),
      ownedSolanaRuntime: () =>
        import("../../../chains/solana/runtime/owned-solana-runtime.mjs"),
      ownedTronNativeValueRuntime: () =>
        import(
          "../../../chains/tron/runtime/owned-tron-native-value-runtime.mjs"
        ),
      ownedEvmV2Runtime: () =>
        import("../../../chains/evm/runtime/owned-evm-v2-runtime.mjs"),
      wrappedClaimOwnerProcessV1: () =>
        import("../../../custody/processes/wrapped-claim-owner-process-v1.mjs"),
      wrappedControllerJournalV1: () =>
        import("../controller/wrapped-controller-journal-v1.mjs"),
      wrappedWalletRuntimeV1: () =>
        import("../../../operations/local/wrapped-wallet-runtime-v1.mjs"),
      wrappedWalletCompositionV1: () =>
        import("../../../operations/wallet/wrapped-wallet-composition-v1.mjs"),
      wrappedClaimCustodyBootstrapV1: () =>
        import(
          "../../../operations/operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs"
        ),
      flatOwnerProcess: () =>
        import("../../../custody/processes/flat-owner-process.mjs"),
      externalDefiWalletRecoveryV1: () =>
        import(
          "../../../accounts/recovery/external-defi-wallet-recovery-v1.mjs"
        ),
      externalDefiCatalogueRecoveryV1: () =>
        import(
          "../../../accounts/recovery/external-defi-catalogue-recovery-v1.mjs"
        ),
      flatJournalCatalogue: () =>
        import("../../../accounts/storage/flat-journal-catalogue.mjs"),
      externalDefiPreopenRepairAdmissionV1: () =>
        import(
          "../../authorization/external-defi-preopen-repair-admission-v1.mjs"
        ),
      externalBootstrapPrefixAdmissionV1: () =>
        import(
          "../../authorization/external-bootstrap-prefix-admission-v1.mjs"
        ),
      externalBootstrapPartialAdmissionV1: () =>
        import(
          "../../authorization/external-bootstrap-partial-admission-v1.mjs"
        ),
      externalCaptureLineageAdmissionV1: () =>
        import("../../authorization/external-capture-lineage-admission-v1.mjs"),
      externalFreshCaptureAdmissionV1: () =>
        import("../../authorization/external-fresh-capture-admission-v1.mjs"),
      nativeValueAccountAuthorityV2: () =>
        import(
          "../../../accounts/authority/native-value-account-authority-v2.mjs"
        ),
      deviceD26ObservationRecoveryV1: () =>
        import(
          "../../../accounts/authority/device-d26-observation-recovery-v1.mjs"
        ),
      nativeValueDispatchOwnerV2: () =>
        import(
          "../../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs"
        ),
      nativeOriginalSourceLifecycleV1: () =>
        import(
          "../../../operations/recovery/native-original-source-lifecycle-v1.mjs"
        ),
      nativeValueExecutionV2: () =>
        import(
          "../../../execution/native-value/execution/native-value-execution-v2.mjs"
        ),
      nativeValueOwnerProcessV2: () =>
        import("../../../custody/processes/native-value-owner-process-v2.mjs"),
      nativeValueLocalOperatorBootstrapV4: () =>
        import(
          "../../../operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs"
        ),
      nativeValueSystemV2: () =>
        import(
          "../../../operations/deployments/native-value/native-value-system-v2.mjs"
        ),
      nativeValueEconomicRecoveryV1: () =>
        import(
          "../../../operations/recovery/native-value-economic-recovery-v1.mjs"
        ),
      pairedOriginalAccountHttpV2: () =>
        import("../../../api/mobile/paired-original-account-http-v2.mjs"),
      deviceExternalFlatNoteAuthorityV1: () =>
        import(
          "../../../accounts/authority/device-external-flat-note-authority-v1.mjs"
        ),
      deviceExternalFlatOrderedObservationRecoveryV1: () =>
        import(
          "../../../accounts/recovery/device-external-flat-ordered-observation-recovery-v1.mjs"
        ),
      deviceExternalFlatSourceGraphServiceV1: () =>
        import(
          "../../../operations/local/device-external-flat-source-graph-service-v1.mjs"
        ),
      wrappedClaimOperatorBootstrapV1: () =>
        import(
          "../../../operations/operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs"
        ),
      wrappedClaimSystemV1: () =>
        import(
          "../../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs"
        ),
      metamorphoGraphDeliveryObserverV1: () =>
        import(
          "../../../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs"
        ),
      deployMorphoBluePositionV1: () =>
        import(
          "../../../operations/deployments/defi/deploy-morpho-blue-position-v1.mjs"
        ),
      deployPrivateExternalRouterV1: () =>
        import(
          "../../../operations/deployments/defi/deploy-private-external-router-v1.mjs"
        ),
    }),
  }),
);

export function createWrappedRecoveryAuthorityV1(input) {
  return originalRecovery.createWrappedRecoveryAuthorityV1(...arguments);
}

export function openWrappedRecoveryAuthorityV1(input, expectedCheckpoint) {
  return originalRecovery.openWrappedRecoveryAuthorityV1(...arguments);
}

export function createWrappedFundedRecoveryAuthorityV1(input) {
  return originalRecovery.createWrappedFundedRecoveryAuthorityV1(...arguments);
}

export function openWrappedFundedRecoveryAuthorityV1(
  input,
  expectedCheckpoint,
) {
  return originalRecovery.openWrappedFundedRecoveryAuthorityV1(...arguments);
}

export function createWrappedTronRecoveryAuthorityV1(input) {
  return originalRecovery.createWrappedTronRecoveryAuthorityV1(...arguments);
}

export function openWrappedTronRecoveryAuthorityV1(input, expected) {
  return originalRecovery.openWrappedTronRecoveryAuthorityV1(...arguments);
}

export function createWrappedFundedTronRecoveryAuthorityV1(input) {
  return originalRecovery.createWrappedFundedTronRecoveryAuthorityV1(
    ...arguments,
  );
}

export function openWrappedFundedTronRecoveryAuthorityV1(input, expected) {
  return originalRecovery.openWrappedFundedTronRecoveryAuthorityV1(
    ...arguments,
  );
}

export function wrappedRecoveryAuthorityStatusV1(authority) {
  return originalRecovery.wrappedRecoveryAuthorityStatusV1(...arguments);
}

export async function retainOriginalWrappedRecoverySectionV1(
  token,
  section,
  data,
) {
  return originalRecovery.retainOriginalWrappedRecoverySectionV1(...arguments);
}

export async function retainWrappedRuntimeRecoveryV1(
  authority,
  family,
  runtime,
) {
  return originalRecovery.retainWrappedRuntimeRecoveryV1(...arguments);
}

export async function retainWrappedSystemRecoveryV1(authority, input) {
  return originalRecovery.retainWrappedSystemRecoveryV1(...arguments);
}

export async function retainWrappedOwnersRecoveryV1(authority, input) {
  return originalRecovery.retainWrappedOwnersRecoveryV1(...arguments);
}

export async function retainWrappedKeeperRecoveryV1(authority, keeper) {
  return originalRecovery.retainWrappedKeeperRecoveryV1(...arguments);
}

export async function retainWrappedPrivateLifetimeRecoveryV1(
  authority,
  runtime,
) {
  return originalRecovery.retainWrappedPrivateLifetimeRecoveryV1(...arguments);
}

export async function retainWrappedFixtureRecoveryV1(authority, fixture) {
  return originalRecovery.retainWrappedFixtureRecoveryV1(...arguments);
}

export async function retainWrappedWalletRecoveryV1(authority, wallet) {
  return originalRecovery.retainWrappedWalletRecoveryV1(...arguments);
}

export async function prepareWrappedRecoveryFinalizationV1(authority) {
  return originalRecovery.prepareWrappedRecoveryFinalizationV1(...arguments);
}

export async function finishWrappedRecoveryCaptureV1(
  authority,
  publicationIntent,
  publicationReceipt,
) {
  return originalRecovery.finishWrappedRecoveryCaptureV1(...arguments);
}

export async function reconcileWrappedRecoveryFinalizationV1(
  input,
  publicationIntent,
) {
  return originalRecovery.reconcileWrappedRecoveryFinalizationV1(...arguments);
}

export function originalWrappedRecoverySectionIdentityV1(token, section) {
  return originalRecovery.originalWrappedRecoverySectionIdentityV1(
    ...arguments,
  );
}

export function consumeOriginalWrappedRecoverySectionV1(token, section) {
  return originalRecovery.consumeOriginalWrappedRecoverySectionV1(...arguments);
}

export function consumeWrappedRuntimeRecoveryV1(token, family) {
  return originalRecovery.consumeWrappedRuntimeRecoveryV1(...arguments);
}

export async function reopenWrappedRuntimeFromAuthorityV1(authority, family) {
  return originalRecovery.reopenWrappedRuntimeFromAuthorityV1(...arguments);
}

export async function reopenWrappedSystemFromAuthorityV1(authority, input) {
  return originalRecovery.reopenWrappedSystemFromAuthorityV1(...arguments);
}

export async function reopenWrappedOwnersFromAuthorityV1(authority, input) {
  return originalRecovery.reopenWrappedOwnersFromAuthorityV1(...arguments);
}

export async function reopenWrappedKeeperFromAuthorityV1(authority, input) {
  return originalRecovery.reopenWrappedKeeperFromAuthorityV1(...arguments);
}

export async function reopenWrappedFixtureFromAuthorityV1(authority, input) {
  return originalRecovery.reopenWrappedFixtureFromAuthorityV1(...arguments);
}

export async function reopenWrappedWalletFromAuthorityV1(authority, input) {
  return originalRecovery.reopenWrappedWalletFromAuthorityV1(...arguments);
}

export async function reopenWrappedPrivateLifetimeFromAuthorityV1(
  authority,
  runtime,
) {
  return originalRecovery.reopenWrappedPrivateLifetimeFromAuthorityV1(
    ...arguments,
  );
}

export async function closeWrappedRecoveryAuthorityV1(authority) {
  return originalRecovery.closeWrappedRecoveryAuthorityV1(...arguments);
}

export function createExternalDefiRecoveryAuthorityV1(input) {
  return originalRecovery.createExternalDefiRecoveryAuthorityV1(...arguments);
}

export function openExternalDefiRecoveryAuthorityV1(input, checkpoint) {
  return originalRecovery.openExternalDefiRecoveryAuthorityV1(...arguments);
}

export function externalDefiReceiverCaptureIdentityV2(token) {
  return originalRecovery.externalDefiReceiverCaptureIdentityV2(...arguments);
}

export function consumeExternalDefiReceiverRuntimeSectionV2(token) {
  return originalRecovery.consumeExternalDefiReceiverRuntimeSectionV2(
    ...arguments,
  );
}

export async function retainExternalDefiReceiverRuntimeV2(authority, runtime) {
  return originalRecovery.retainExternalDefiReceiverRuntimeV2(...arguments);
}

export async function reopenExternalDefiReceiverRuntimeV2(authority) {
  return originalRecovery.reopenExternalDefiReceiverRuntimeV2(...arguments);
}

export async function retainExternalDefiSystemRecoveryV1(authority, input) {
  return originalRecovery.retainExternalDefiSystemRecoveryV1(...arguments);
}

export async function reopenExternalDefiSystemFromAuthorityV1(
  authority,
  input,
) {
  return originalRecovery.reopenExternalDefiSystemFromAuthorityV1(...arguments);
}

export async function retainExternalDefiOwnersRecoveryV1(authority, input) {
  return originalRecovery.retainExternalDefiOwnersRecoveryV1(...arguments);
}

export async function reopenExternalDefiOwnersFromAuthorityV1(
  authority,
  input,
) {
  return originalRecovery.reopenExternalDefiOwnersFromAuthorityV1(...arguments);
}

export async function retainExternalDefiWalletRecoveryV1(authority, wallet) {
  return originalRecovery.retainExternalDefiWalletRecoveryV1(...arguments);
}

export async function reopenExternalDefiWalletFromAuthorityV1(
  authority,
  input,
  callbacks = {},
) {
  return originalRecovery.reopenExternalDefiWalletFromAuthorityV1(...arguments);
}

export async function retainExternalDefiCatalogueRecoveryV1(
  authority,
  catalogue,
) {
  return originalRecovery.retainExternalDefiCatalogueRecoveryV1(...arguments);
}

export async function reopenExternalDefiCatalogueFromAuthorityV1(
  authority,
  input,
  callbacks = {},
) {
  return originalRecovery.reopenExternalDefiCatalogueFromAuthorityV1(
    ...arguments,
  );
}

export function createExternalDefiFundedRecoveryAuthorityV1(input) {
  return originalRecovery.createExternalDefiFundedRecoveryAuthorityV1(
    ...arguments,
  );
}

export function openExternalDefiFundedRecoveryAuthorityV1(input, checkpoint) {
  return originalRecovery.openExternalDefiFundedRecoveryAuthorityV1(
    ...arguments,
  );
}

export async function publishExternalDefiRecoveryCaptureV1(
  authority,
  inventorySHA256,
) {
  return originalRecovery.publishExternalDefiRecoveryCaptureV1(...arguments);
}

export async function readExternalDefiRecoveryPublicationV1(
  input,
  inventorySHA256,
  options,
) {
  return originalRecovery.readExternalDefiRecoveryPublicationV1(...arguments);
}

export async function prepareExternalDefiReceiverRepairV1() {
  return originalRecovery.prepareExternalDefiReceiverRepairV1(...arguments);
}

export async function openExternalDefiReceiverRepairAuthorityV1() {
  return originalRecovery.openExternalDefiReceiverRepairAuthorityV1(
    ...arguments,
  );
}

export function consumeExternalDefiReceiverRepairV1(token) {
  return originalRecovery.consumeExternalDefiReceiverRepairV1(...arguments);
}

export async function prepareExternalDefiBootstrapPartialSuccessorV1() {
  return originalRecovery.prepareExternalDefiBootstrapPartialSuccessorV1(
    ...arguments,
  );
}

export async function prepareExternalDefiBootstrapPrefixContinuationV1() {
  return originalRecovery.prepareExternalDefiBootstrapPrefixContinuationV1(
    ...arguments,
  );
}

export async function openExternalDefiBootstrapPartialSuccessorV1() {
  return originalRecovery.openExternalDefiBootstrapPartialSuccessorV1(
    ...arguments,
  );
}

export async function openExternalDefiBootstrapPrefixContinuationV1() {
  return originalRecovery.openExternalDefiBootstrapPrefixContinuationV1(
    ...arguments,
  );
}

export async function createExternalDefiSuccessorCaptureV1(
  authority,
  inventorySHA256,
) {
  return originalRecovery.createExternalDefiSuccessorCaptureV1(...arguments);
}

export async function prepareExternalDefiCompletedCaptureAdoptionV1() {
  return originalRecovery.prepareExternalDefiCompletedCaptureAdoptionV1(
    ...arguments,
  );
}

export async function openExternalDefiCaptureLineageV1() {
  return originalRecovery.openExternalDefiCaptureLineageV1(...arguments);
}

export function createNativeDeviceD26ObservationRecoveryV1(input) {
  return originalRecovery.createNativeDeviceD26ObservationRecoveryV1(
    ...arguments,
  );
}

export function openNativeDeviceD26ObservationRecoveryV1(
  input,
  expectedCheckpoint,
) {
  return originalRecovery.openNativeDeviceD26ObservationRecoveryV1(
    ...arguments,
  );
}

export async function retainNativeDeviceD26ObservationRecoveryV1(
  authority,
  input,
) {
  return originalRecovery.retainNativeDeviceD26ObservationRecoveryV1(
    ...arguments,
  );
}

export function consumeNativeD26ObservationSectionV1(token, section) {
  return originalRecovery.consumeNativeD26ObservationSectionV1(...arguments);
}

export async function reopenNativeDeviceD26ObservationV1(authority) {
  return originalRecovery.reopenNativeDeviceD26ObservationV1(...arguments);
}

export function closeNativeDeviceD26ObservationRecoveryV1(authority) {
  return originalRecovery.closeNativeDeviceD26ObservationRecoveryV1(
    ...arguments,
  );
}

export function createNativeProviderRecoveryAuthorityV1(input) {
  return originalRecovery.createNativeProviderRecoveryAuthorityV1(...arguments);
}

export function openNativeProviderRecoveryAuthorityV1(
  input,
  expectedCheckpoint,
) {
  return originalRecovery.openNativeProviderRecoveryAuthorityV1(...arguments);
}

export function assertNativeProviderRecoveryAuthorityV1(authority) {
  return originalRecovery.assertNativeProviderRecoveryAuthorityV1(...arguments);
}

export function nativeProviderRecoverySectionIdentityV1(token) {
  return originalRecovery.nativeProviderRecoverySectionIdentityV1(...arguments);
}

export function consumeNativeProviderRecoverySectionV1(token) {
  return originalRecovery.consumeNativeProviderRecoverySectionV1(...arguments);
}

export async function retainNativeProviderRecoveryV1(authority, custody) {
  return originalRecovery.retainNativeProviderRecoveryV1(...arguments);
}

export async function reopenNativeProviderFromAuthorityV1(authority, contexts) {
  return originalRecovery.reopenNativeProviderFromAuthorityV1(...arguments);
}

export function closeNativeProviderRecoveryAuthorityV1(authority) {
  return originalRecovery.closeNativeProviderRecoveryAuthorityV1(...arguments);
}

export function createNativeLiveArmedRecoveryAuthorityV1(input) {
  return originalRecovery.createNativeLiveArmedRecoveryAuthorityV1(
    ...arguments,
  );
}

export function openNativeLiveArmedRecoveryAuthorityV1(input, expected) {
  return originalRecovery.openNativeLiveArmedRecoveryAuthorityV1(...arguments);
}

export function assertNativeLiveArmedRecoveryCaptureV1(authority) {
  return originalRecovery.assertNativeLiveArmedRecoveryCaptureV1(...arguments);
}

export function nativeLiveArmedRecoverySectionIdentityV1(token, section) {
  return originalRecovery.nativeLiveArmedRecoverySectionIdentityV1(
    ...arguments,
  );
}

export function consumeNativeLiveArmedRecoverySectionV1(token, section) {
  return originalRecovery.consumeNativeLiveArmedRecoverySectionV1(...arguments);
}

export function createNativeEconomicRecoveryAuthorityV1(input) {
  return originalRecovery.createNativeEconomicRecoveryAuthorityV1(...arguments);
}

export function openNativeEconomicRecoveryAuthorityV1(
  input,
  expectedCheckpoint,
) {
  return originalRecovery.openNativeEconomicRecoveryAuthorityV1(...arguments);
}

export function createNativeEconomicNoteRecoveryAuthorityV1(input) {
  return originalRecovery.createNativeEconomicNoteRecoveryAuthorityV1(
    ...arguments,
  );
}

export function openNativeEconomicNoteRecoveryAuthorityV1(
  input,
  expectedCheckpoint,
) {
  return originalRecovery.openNativeEconomicNoteRecoveryAuthorityV1(
    ...arguments,
  );
}

export function assertNativeEconomicRecoveryCaptureV1(authority) {
  return originalRecovery.assertNativeEconomicRecoveryCaptureV1(...arguments);
}

export function nativeEconomicRecoverySectionIdentityV1(token, section) {
  return originalRecovery.nativeEconomicRecoverySectionIdentityV1(...arguments);
}

export function consumeNativeEconomicRecoverySectionV1(token, section) {
  return originalRecovery.consumeNativeEconomicRecoverySectionV1(...arguments);
}

export function closeNativeEconomicRecoveryAuthorityV1(authority) {
  return originalRecovery.closeNativeEconomicRecoveryAuthorityV1(...arguments);
}

export function retainNativeEconomicRecoveryV1(authority, request) {
  return originalRecovery.retainNativeEconomicRecoveryV1(...arguments);
}

export function retainNativeLiveArmedRecoveryV1(authority, request) {
  return originalRecovery.retainNativeLiveArmedRecoveryV1(...arguments);
}

export function reopenNativeEconomicFromAuthorityV1(authority) {
  return originalRecovery.reopenNativeEconomicFromAuthorityV1(...arguments);
}

export function reopenNativeLiveArmedFromAuthorityV1(authority) {
  return originalRecovery.reopenNativeLiveArmedFromAuthorityV1(...arguments);
}

export async function retainNativeEconomicBootstrapV1(authority, bootstrap) {
  return originalRecovery.retainNativeEconomicBootstrapV1(...arguments);
}

export async function reopenExternalDefiVaultExitOwnersRecoveryV1(
  authority,
  input,
) {
  return originalRecovery.reopenExternalDefiVaultExitOwnersRecoveryV1(
    ...arguments,
  );
}

export async function retainExternalDefiVaultExitSystemRecoveryV1(
  authority,
  input,
) {
  return originalRecovery.retainExternalDefiVaultExitSystemRecoveryV1(
    ...arguments,
  );
}

export async function reopenExternalDefiVaultExitSystemRecoveryV1(
  authority,
  input,
) {
  return originalRecovery.reopenExternalDefiVaultExitSystemRecoveryV1(
    ...arguments,
  );
}

export async function retainExternalDefiVaultCatalogueRecoveryV1(
  authority,
  input,
) {
  return originalRecovery.retainExternalDefiVaultCatalogueRecoveryV1(
    ...arguments,
  );
}

export async function reopenExternalDefiVaultCatalogueRecoveryV1(
  authority,
  input,
) {
  return originalRecovery.reopenExternalDefiVaultCatalogueRecoveryV1(
    ...arguments,
  );
}

export function createDeviceExternalFlatRecoveryAuthorityV1(input) {
  return originalRecovery.createDeviceExternalFlatRecoveryAuthorityV1(
    ...arguments,
  );
}

export function openDeviceExternalFlatRecoveryAuthorityV1(input, checkpoint) {
  return originalRecovery.openDeviceExternalFlatRecoveryAuthorityV1(
    ...arguments,
  );
}

export function assertDeviceExternalFlatRecoveryAuthorityV1(authority) {
  return originalRecovery.assertDeviceExternalFlatRecoveryAuthorityV1(
    ...arguments,
  );
}

export function deviceExternalFlatReceiverCaptureIdentityV1(token) {
  return originalRecovery.deviceExternalFlatReceiverCaptureIdentityV1(
    ...arguments,
  );
}

export function deviceExternalFlatAccountCaptureIdentityV1(token) {
  return originalRecovery.deviceExternalFlatAccountCaptureIdentityV1(
    ...arguments,
  );
}

export function assertDeviceExternalFlatAccountCaptureAuthorityV1(
  authority,
  token,
) {
  return originalRecovery.assertDeviceExternalFlatAccountCaptureAuthorityV1(
    ...arguments,
  );
}

export function consumeDeviceExternalFlatReceiverRuntimeSectionV1(token) {
  return originalRecovery.consumeDeviceExternalFlatReceiverRuntimeSectionV1(
    ...arguments,
  );
}

export async function retainDeviceExternalFlatAccountRecoveryV1(
  authority,
  account,
) {
  return originalRecovery.retainDeviceExternalFlatAccountRecoveryV1(
    ...arguments,
  );
}

export async function retainDeviceExternalFlatSystemRecoveryV1(
  authority,
  input,
) {
  return originalRecovery.retainDeviceExternalFlatSystemRecoveryV1(
    ...arguments,
  );
}

export async function retainDeviceExternalFlatLifetimeRecoveryV1(
  authority,
  runtime,
) {
  return originalRecovery.retainDeviceExternalFlatLifetimeRecoveryV1(
    ...arguments,
  );
}

export async function retainDeviceExternalFlatReceiverRuntimeV1(
  authority,
  runtime,
) {
  return originalRecovery.retainDeviceExternalFlatReceiverRuntimeV1(
    ...arguments,
  );
}

export function finishDeviceExternalFlatRecoveryCaptureV1(authority) {
  return originalRecovery.finishDeviceExternalFlatRecoveryCaptureV1(
    ...arguments,
  );
}

export async function reopenDeviceExternalFlatReceiverRuntimeV1(authority) {
  return originalRecovery.reopenDeviceExternalFlatReceiverRuntimeV1(
    ...arguments,
  );
}

export async function reopenDeviceExternalFlatLifetimeRecoveryV1(
  authority,
  runtime,
) {
  return originalRecovery.reopenDeviceExternalFlatLifetimeRecoveryV1(
    ...arguments,
  );
}

export async function reopenDeviceExternalFlatSystemRecoveryV1(
  authority,
  input,
) {
  return originalRecovery.reopenDeviceExternalFlatSystemRecoveryV1(
    ...arguments,
  );
}

export async function reopenDeviceExternalFlatAccountRecoveryV1(
  authority,
  input,
) {
  return originalRecovery.reopenDeviceExternalFlatAccountRecoveryV1(
    ...arguments,
  );
}

export function closeDeviceExternalFlatRecoveryAuthorityV1(authority) {
  return originalRecovery.closeDeviceExternalFlatRecoveryAuthorityV1(
    ...arguments,
  );
}

export function retainDeviceExternalFlatGraphRecoveryV1(authority, service) {
  return originalRecovery.retainDeviceExternalFlatGraphRecoveryV1(...arguments);
}

export function retainDeviceExternalFlatGraphSystemRecoveryV1(
  authority,
  service,
) {
  return originalRecovery.retainDeviceExternalFlatGraphSystemRecoveryV1(
    ...arguments,
  );
}

export function reopenDeviceExternalFlatGraphRecoveryV1(authority, input) {
  return originalRecovery.reopenDeviceExternalFlatGraphRecoveryV1(...arguments);
}
export const {
  createWrappedPrivateLifetimeRegistryV1,
  openWrappedPrivateLifetimeRegistryV1,
  retainWrappedPrivateLifetimePartV1,
  readWrappedPrivateLifetimePartV1,
  updateWrappedPrivateLifetimePartV1,
  assertWrappedPrivateLifetimePartSealedV1,
  wrappedPrivateLifetimeRegistryCheckpointV1,
  closeWrappedPrivateLifetimeRegistryV1,
  retainWrappedPrivateLifetimeRegistryForReopenV1,
  reopenWrappedPrivateLifetimeRegistryFromAuthorityV1,
  retainWrappedPrivateLifetimeIndexedPartV1,
  readWrappedPrivateLifetimeIndexedPartV1,
  wrappedPrivateLifetimeRegistryIdentityV1,
  assertWrappedPrivateLifetimeAttemptV1,
  assertStoppedWrappedPrivateLifetimeAttemptV1,
  assertWrappedPrivateLifetimePartsV1,
  wrappedPrivateLifetimeRuntimeCheckpointV1,
  assertWrappedPrivateLifetimeRegistryRuntimeV1,
  reopenOriginalDeviceGraphSourceRegistryV2,
  createWrappedWalletAcceptanceSystemV1,
  consumeWrappedSystemRecoveryPartV1,
  retainWrappedWalletSystemForReopenV1,
  reopenWrappedWalletAcceptanceSystemV1,
  createExternalDefiBootstrapRecoveryV1,
  retainExternalDefiBootstrapForReopenV1,
  consumeExternalDefiBootstrapPartV1,
  assertCanonicalExternalBootstrapSectionV2,
  reopenExternalDefiBootstrapFromAuthorityV1,
  retainExternalDefiVaultExitSystemForReopenV1,
  reopenExternalDefiVaultExitSystemFromAuthorityV1,
  reopenOriginalDeviceExternalFlatSystemRecordV1,
  reopenOriginalDeviceExternalFlatGraphSystemRecordV1,
} = originalRecovery;
