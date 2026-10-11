/** Canonical device GRAPH service composition. The original resource owners
 * and lazy loaders are bound once here; no canonical setter or registry writer
 * escapes. Public methods retain their original signatures and guards. */
import { buildDeviceExternalFlatSourceGraphServiceV1 } from "./device-external-flat-source-graph-backend-v1.mjs";
import { acquireFixedMetaRedemptionsV2 } from "./fixed-meta-redemption-acquisition-v2.mjs";
import {
  consumeOriginalDeviceGraphSourceRequestV2,
  originalDeviceGraphSourceProducerRequestsV2,
  retireOriginalDeviceGraphSourceForOrderedCaptureV2,
  armOriginalDeviceExternalFlatGraphSourceV2,
  armOriginalDeviceExternalFlatGraphSourceV3,
} from "../recovery/device-external-flat-original-source-v2.mjs";
import { Vault } from "@lianum/engine/crypto/vault";
import { canonicalClaimRecordDataV1 } from "@lianum/engine/storage/records";
import {
  retainWrappedPrivateLifetimePartV1,
  readWrappedPrivateLifetimePartV1,
  updateWrappedPrivateLifetimePartV1,
  assertWrappedPrivateLifetimePartSealedV1,
  assertWrappedPrivateLifetimeAttemptV1,
  closeWrappedPrivateLifetimeRegistryV1,
} from "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs";
import {
  assertDeviceExternalFlatRecoveryAuthorityV1,
  assertDeviceExternalFlatAccountCaptureAuthorityV1,
  originalWrappedRecoverySectionIdentityV1,
  retainOriginalWrappedRecoverySectionV1,
  consumeOriginalWrappedRecoverySectionV1,
  retainDeviceExternalFlatGraphRecoveryV1,
  retainDeviceExternalFlatGraphSystemRecoveryV1,
  retainDeviceExternalFlatLifetimeRecoveryV1,
  retainDeviceExternalFlatReceiverRuntimeV1,
  finishDeviceExternalFlatRecoveryCaptureV1,
  reopenDeviceExternalFlatReceiverRuntimeV1,
  reopenDeviceExternalFlatLifetimeRecoveryV1,
  reopenDeviceExternalFlatSystemRecoveryV1,
  reopenDeviceExternalFlatGraphRecoveryV1,
  closeDeviceExternalFlatRecoveryAuthorityV1,
} from "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs";
import { captureOwnedFlatSystemRecoveryV1 } from "../deployments/system/deploy-system.mjs";
import { assertOwnedDeviceExternalFlatReceiverV1 } from "../../chains/evm/runtime/owned-evm-v2-runtime.mjs";
import { captureOfficialAaveFixtureRecoveryV1 } from "../deployments/defi/official-aave-fixture-v1.mjs";
import { captureOfficialProtocolFixtureRecoveryV1 } from "../deployments/defi/official-protocol-fixture-v3.mjs";
import {
  captureOwnedPrivateExternalRouterRecoveryV1,
  captureOwnedPrivateMorphoBluePositionRouterV1,
  readOwnedPrivateMorphoBluePositionRouterV1,
} from "../deployments/defi/deploy-private-external-router-v1.mjs";
import {
  captureOwnedOriginalMorphoBluePositionV1,
  assertOwnedOriginalMorphoBluePositionV1,
} from "../deployments/defi/deploy-morpho-blue-position-v1.mjs";
import {
  createRetainedOwnedDeviceMetaMorphoVaultV2,
  reopenRetainedOwnedDeviceMetaMorphoVaultV2,
  createRetainedOwnedMorphoBluePositionVaultV1,
  reopenRetainedOwnedMorphoBluePositionVaultV1,
  createRetainedOwnedDeviceAaveStaticVaultV1,
  reopenRetainedOwnedDeviceAaveStaticVaultV1,
} from "../../defi/vaults/owned-metamorpho-vault.mjs";
import {
  readOriginalDeviceMetaMorphoPrivateExitRecipientV2,
  createOriginalDeviceMetaMorphoPrivateExitV2,
  captureOriginalDeviceMetaMorphoPrivateExitV2,
  reopenOriginalDeviceMetaMorphoPrivateExitV2,
  createOriginalDeviceMorphoBluePrivateExitV1,
  captureOriginalDeviceMorphoBluePrivateExitV1,
  reopenOriginalDeviceMorphoBluePrivateExitV1,
  createOriginalDeviceAaveStaticPrivateExitV1,
  captureOriginalDeviceAaveStaticPrivateExitV1,
  checkpointOriginalDeviceAaveStaticPrivateExitSourceV3,
  reopenOriginalDeviceAaveStaticPrivateExitV1,
} from "../../defi/withdrawals/device-morpho-blue-private-exit-v1.mjs";
import {
  retainOriginalDeviceExternalFlatGraphAccountV1,
  checkpointOriginalDeviceExternalFlatGraphAccountSourceV2,
  captureOriginalDeviceExternalFlatGraphAccountV1,
  reopenOriginalDeviceExternalFlatGraphShareBatchV4,
  reopenOriginalDeviceExternalFlatGraphAccountV1,
} from "../../accounts/authority/device-external-flat-note-authority-v1.mjs";
import {
  createOriginalRetainedDeviceExternalFlatPrivateMultiSourceGraphV4,
  createOriginalRetainedDeviceExternalFlatPrivateSourceGraphV2,
  checkpointOriginalDeviceExternalFlatSourceGraphSourceV2,
  captureOriginalDeviceExternalFlatSourceGraphV1,
  reopenOriginalDeviceExternalFlatSourceGraphV1,
} from "../../accounts/authority/device-external-flat-source-graph-v1.mjs";
import {
  retainOriginalDeviceExternalFlatGraphExecutionV1,
  checkpointOriginalDeviceExternalFlatGraphExecutionSourceV2,
  captureOriginalDeviceExternalFlatGraphExecutionV1,
  reopenOriginalDeviceExternalFlatGraphExecutionV1,
} from "../../execution/account/execution/flat-native-execution.mjs";
import {
  quiesceOriginalDeviceExternalFlatGraphTargetTlsServerV4,
  quiesceOriginalDeviceExternalFlatGraphTlsServerV1,
} from "../../api/mobile/device-external-flat-note-http-v1.mjs";
import {
  externalFlatExactV1,
  externalFlatUintV1,
} from "@lianum/mobile-protocol/device/source-note-v1";
import { canonicalNativeOwnerNodes } from "../../execution/native/dispatch/native-owner.mjs";
import { createFlatSystemStateReader } from "../../execution/account/reconciliation/flat-system-state.mjs";
import { createGenericBalanceNativePreparation } from "@lianum/engine/execution/balances/generic-balance-native-preparation";
import { createNativeRecipientProcess } from "../../execution/native/recipients/native-recipient-process.mjs";
import { nativeRecipientInvoiceRequest } from "@lianum/engine/execution/native/recipients/native-recipient-custody";
import { NATIVE_ADMISSION_LOSS_CLAUSE } from "@lianum/engine/execution/native/dispatch/native-admission";
import {
  assertOriginalDeviceExternalFlatNoteAuthorityV1,
  assertOriginalDeviceExternalFlatShareNoteAuthorityV1,
  createOriginalDeviceExternalFlatPrivateShareBatchV4,
  consumeOriginalDeviceExternalFlatShareProofV1,
  bindOriginalDeviceExternalFlatShareGraphV1,
} from "../../accounts/authority/device-external-flat-note-authority-v1.mjs";
import {
  createOriginalDeviceExternalFlatPrivateMultiSourceGraphV4,
  createOriginalDeviceExternalFlatPrivateSourceGraphV2,
  readOriginalDeviceExternalFlatSourceGraphProofsV1,
} from "../../accounts/authority/device-external-flat-source-graph-v1.mjs";
import { createFlatNativeExecution } from "../../execution/account/execution/flat-native-execution.mjs";
import {
  createOriginalDeviceMetaMorphoTargetTlsServerV2,
  createOriginalDeviceExternalFlatTlsServerV1,
  createOriginalDeviceExternalFlatGraphTlsServerV1,
} from "../../api/mobile/device-external-flat-note-http-v1.mjs";
import { assertOwnedFlatSystem } from "../deployments/system/deploy-system.mjs";
import { assertLocalEvm } from "../../chains/evm/runtime/local-evm-ownership.mjs";
import { assertOwnedFlatOperatorQuorum } from "../operators/claims/native-operators.mjs";
import { assertOwnedPrivateExternalRouterV1 } from "../deployments/defi/deploy-private-external-router-v1.mjs";
import {
  isOwnedMetaMorphoGraphDeliveryBatchV4,
  readOriginalMetaMorphoGraphBatchRoutersV4,
  isOwnedUniswapGraphDeliveryObserverV1,
  prepareOwnedUniswapGraphDescriptorV1,
  isOwnedAaveStaticGraphDeliveryObserverV1,
  prepareOwnedAaveStaticGraphDescriptorV1,
  isOwnedMetaMorphoGraphDeliveryObserverV1,
  prepareOwnedMetaMorphoGraphDescriptorV1,
  isOwnedMorphoBluePositionGraphDeliveryObserverV1,
  prepareOwnedMorphoBluePositionGraphDescriptorV1,
} from "../../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs";
import { assertOwnedEvmGraphDeliveryObserverV1 } from "../../chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs";
import {
  snapshotOriginalDeviceMetaMorphoProviderSlotV4,
  createOriginalDeviceMetaMorphoProviderSlotV4,
  activateOriginalDeviceMetaMorphoProviderSlotV4,
  closeOriginalDeviceMetaMorphoProviderSlotV4,
  createOwnedFlatUniswapProviderV1,
  createOwnedFlatAaveStaticProviderV1,
  createOwnedFlatMetaMorphoProviderV1,
  createOwnedFlatMorphoBluePositionProviderV1,
} from "../../providers/evm-vault-provider.mjs";
const originalGraph = buildDeviceExternalFlatSourceGraphServiceV1(
  Object.freeze({
    dependencies: Object.freeze({
      acquireFixedMetaRedemptionsV2,
      consumeOriginalDeviceGraphSourceRequestV2,
      originalDeviceGraphSourceProducerRequestsV2,
      retireOriginalDeviceGraphSourceForOrderedCaptureV2,
      armOriginalDeviceExternalFlatGraphSourceV2,
      armOriginalDeviceExternalFlatGraphSourceV3,
      Vault,
      canonicalClaimRecordDataV1,
      retainWrappedPrivateLifetimePartV1,
      readWrappedPrivateLifetimePartV1,
      updateWrappedPrivateLifetimePartV1,
      assertWrappedPrivateLifetimePartSealedV1,
      assertWrappedPrivateLifetimeAttemptV1,
      closeWrappedPrivateLifetimeRegistryV1,
      assertDeviceExternalFlatRecoveryAuthorityV1,
      assertDeviceExternalFlatAccountCaptureAuthorityV1,
      originalWrappedRecoverySectionIdentityV1,
      retainOriginalWrappedRecoverySectionV1,
      consumeOriginalWrappedRecoverySectionV1,
      retainDeviceExternalFlatGraphRecoveryV1,
      retainDeviceExternalFlatGraphSystemRecoveryV1,
      retainDeviceExternalFlatLifetimeRecoveryV1,
      retainDeviceExternalFlatReceiverRuntimeV1,
      finishDeviceExternalFlatRecoveryCaptureV1,
      reopenDeviceExternalFlatReceiverRuntimeV1,
      reopenDeviceExternalFlatLifetimeRecoveryV1,
      reopenDeviceExternalFlatSystemRecoveryV1,
      reopenDeviceExternalFlatGraphRecoveryV1,
      closeDeviceExternalFlatRecoveryAuthorityV1,
      captureOwnedFlatSystemRecoveryV1,
      assertOwnedDeviceExternalFlatReceiverV1,
      captureOfficialAaveFixtureRecoveryV1,
      captureOfficialProtocolFixtureRecoveryV1,
      captureOwnedPrivateExternalRouterRecoveryV1,
      captureOwnedPrivateMorphoBluePositionRouterV1,
      readOwnedPrivateMorphoBluePositionRouterV1,
      captureOwnedOriginalMorphoBluePositionV1,
      assertOwnedOriginalMorphoBluePositionV1,
      createRetainedOwnedDeviceMetaMorphoVaultV2,
      reopenRetainedOwnedDeviceMetaMorphoVaultV2,
      createRetainedOwnedMorphoBluePositionVaultV1,
      reopenRetainedOwnedMorphoBluePositionVaultV1,
      createRetainedOwnedDeviceAaveStaticVaultV1,
      reopenRetainedOwnedDeviceAaveStaticVaultV1,
      readOriginalDeviceMetaMorphoPrivateExitRecipientV2,
      createOriginalDeviceMetaMorphoPrivateExitV2,
      captureOriginalDeviceMetaMorphoPrivateExitV2,
      reopenOriginalDeviceMetaMorphoPrivateExitV2,
      createOriginalDeviceMorphoBluePrivateExitV1,
      captureOriginalDeviceMorphoBluePrivateExitV1,
      reopenOriginalDeviceMorphoBluePrivateExitV1,
      createOriginalDeviceAaveStaticPrivateExitV1,
      captureOriginalDeviceAaveStaticPrivateExitV1,
      checkpointOriginalDeviceAaveStaticPrivateExitSourceV3,
      reopenOriginalDeviceAaveStaticPrivateExitV1,
      retainOriginalDeviceExternalFlatGraphAccountV1,
      checkpointOriginalDeviceExternalFlatGraphAccountSourceV2,
      captureOriginalDeviceExternalFlatGraphAccountV1,
      reopenOriginalDeviceExternalFlatGraphShareBatchV4,
      reopenOriginalDeviceExternalFlatGraphAccountV1,
      createOriginalRetainedDeviceExternalFlatPrivateMultiSourceGraphV4,
      createOriginalRetainedDeviceExternalFlatPrivateSourceGraphV2,
      checkpointOriginalDeviceExternalFlatSourceGraphSourceV2,
      captureOriginalDeviceExternalFlatSourceGraphV1,
      reopenOriginalDeviceExternalFlatSourceGraphV1,
      retainOriginalDeviceExternalFlatGraphExecutionV1,
      checkpointOriginalDeviceExternalFlatGraphExecutionSourceV2,
      captureOriginalDeviceExternalFlatGraphExecutionV1,
      reopenOriginalDeviceExternalFlatGraphExecutionV1,
      quiesceOriginalDeviceExternalFlatGraphTargetTlsServerV4,
      quiesceOriginalDeviceExternalFlatGraphTlsServerV1,
      externalFlatExactV1,
      externalFlatUintV1,
      canonicalNativeOwnerNodes,
      createFlatSystemStateReader,
      createGenericBalanceNativePreparation,
      createNativeRecipientProcess,
      nativeRecipientInvoiceRequest,
      NATIVE_ADMISSION_LOSS_CLAUSE,
      assertOriginalDeviceExternalFlatNoteAuthorityV1,
      assertOriginalDeviceExternalFlatShareNoteAuthorityV1,
      createOriginalDeviceExternalFlatPrivateShareBatchV4,
      consumeOriginalDeviceExternalFlatShareProofV1,
      bindOriginalDeviceExternalFlatShareGraphV1,
      createOriginalDeviceExternalFlatPrivateMultiSourceGraphV4,
      createOriginalDeviceExternalFlatPrivateSourceGraphV2,
      readOriginalDeviceExternalFlatSourceGraphProofsV1,
      createFlatNativeExecution,
      createOriginalDeviceMetaMorphoTargetTlsServerV2,
      createOriginalDeviceExternalFlatTlsServerV1,
      createOriginalDeviceExternalFlatGraphTlsServerV1,
      assertOwnedFlatSystem,
      assertLocalEvm,
      assertOwnedFlatOperatorQuorum,
      assertOwnedPrivateExternalRouterV1,
      isOwnedMetaMorphoGraphDeliveryBatchV4,
      readOriginalMetaMorphoGraphBatchRoutersV4,
      isOwnedUniswapGraphDeliveryObserverV1,
      prepareOwnedUniswapGraphDescriptorV1,
      isOwnedAaveStaticGraphDeliveryObserverV1,
      prepareOwnedAaveStaticGraphDescriptorV1,
      isOwnedMetaMorphoGraphDeliveryObserverV1,
      prepareOwnedMetaMorphoGraphDescriptorV1,
      isOwnedMorphoBluePositionGraphDeliveryObserverV1,
      prepareOwnedMorphoBluePositionGraphDescriptorV1,
      assertOwnedEvmGraphDeliveryObserverV1,
      snapshotOriginalDeviceMetaMorphoProviderSlotV4,
      createOriginalDeviceMetaMorphoProviderSlotV4,
      activateOriginalDeviceMetaMorphoProviderSlotV4,
      closeOriginalDeviceMetaMorphoProviderSlotV4,
      createOwnedFlatUniswapProviderV1,
      createOwnedFlatAaveStaticProviderV1,
      createOwnedFlatMetaMorphoProviderV1,
      createOwnedFlatMorphoBluePositionProviderV1,
    }),
  }),
);

export function consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(
  token,
  kind,
) {
  return originalGraph.consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(
    ...arguments,
  );
}

export function assertOriginalDeviceExternalFlatGraphWorkspaceV1(
  workspace,
  input,
) {
  return originalGraph.assertOriginalDeviceExternalFlatGraphWorkspaceV1(
    ...arguments,
  );
}

export function normalizeOriginalDeviceExternalFlatMultiDeliveriesV4(raw) {
  return originalGraph.normalizeOriginalDeviceExternalFlatMultiDeliveriesV4(
    ...arguments,
  );
}

export function isOriginalDeviceExternalFlatMultiGraphWorkspaceV4(workspace) {
  return originalGraph.isOriginalDeviceExternalFlatMultiGraphWorkspaceV4(
    ...arguments,
  );
}

export function readOriginalDeviceExternalFlatMultiGraphBindingsV4(
  workspace,
  input,
) {
  return originalGraph.readOriginalDeviceExternalFlatMultiGraphBindingsV4(
    ...arguments,
  );
}

export function createOriginalDeviceExternalFlatMultiGraphServiceV4(input) {
  return originalGraph.createOriginalDeviceExternalFlatMultiGraphServiceV4(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceExternalFlatMultiGraphServiceV4(
  input,
) {
  return originalGraph.createOriginalRetainedDeviceExternalFlatMultiGraphServiceV4(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceMetaMorphoMultiUnderlyingServiceV2(
  input,
) {
  return originalGraph.createOriginalRetainedDeviceMetaMorphoMultiUnderlyingServiceV2(
    ...arguments,
  );
}

export function readOriginalDeviceExternalFlatMultiGraphContextV4(service) {
  return originalGraph.readOriginalDeviceExternalFlatMultiGraphContextV4(
    ...arguments,
  );
}

export async function prepareOriginalDeviceExternalFlatGraphWorkspaceV1(
  workspace,
  bridge,
  input,
) {
  return originalGraph.prepareOriginalDeviceExternalFlatGraphWorkspaceV1(
    ...arguments,
  );
}

export function createOriginalDeviceExternalFlatSourceGraphServiceV1(input) {
  return originalGraph.createOriginalDeviceExternalFlatSourceGraphServiceV1(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceExternalFlatSourceGraphServiceV1(
  input,
) {
  return originalGraph.createOriginalRetainedDeviceExternalFlatSourceGraphServiceV1(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceMorphoBluePositionGraphServiceV1(
  input,
) {
  return originalGraph.createOriginalRetainedDeviceMorphoBluePositionGraphServiceV1(
    ...arguments,
  );
}

export async function createOriginalRetainedDeviceAaveStaticGraphServiceV1(
  input,
) {
  return originalGraph.createOriginalRetainedDeviceAaveStaticGraphServiceV1(
    ...arguments,
  );
}

export async function createOriginalRetainedDeviceUniswapGraphServiceV1(input) {
  return originalGraph.createOriginalRetainedDeviceUniswapGraphServiceV1(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceExternalFlatGraphSourceServiceV2(
  input,
) {
  return originalGraph.createOriginalRetainedDeviceExternalFlatGraphSourceServiceV2(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceUniswapGraphSourceServiceV2(input) {
  return originalGraph.createOriginalRetainedDeviceUniswapGraphSourceServiceV2(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceExternalFlatGraphSourceServiceV3(
  input,
) {
  return originalGraph.createOriginalRetainedDeviceExternalFlatGraphSourceServiceV3(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceUniswapGraphSourceServiceV3(input) {
  return originalGraph.createOriginalRetainedDeviceUniswapGraphSourceServiceV3(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceAaveStaticGraphSourceServiceV3(
  input,
) {
  return originalGraph.createOriginalRetainedDeviceAaveStaticGraphSourceServiceV3(
    ...arguments,
  );
}

export function createOriginalRetainedDeviceMetaMorphoUnderlyingServiceV2(
  input,
) {
  return originalGraph.createOriginalRetainedDeviceMetaMorphoUnderlyingServiceV2(
    ...arguments,
  );
}

export async function originalDeviceExternalFlatGraphSourceBirthV2(service) {
  return originalGraph.originalDeviceExternalFlatGraphSourceBirthV2(
    ...arguments,
  );
}

export async function checkpointOriginalDeviceExternalFlatGraphSourceV2(
  service,
  token,
) {
  return originalGraph.checkpointOriginalDeviceExternalFlatGraphSourceV2(
    ...arguments,
  );
}

export function readOriginalDeviceGraphSourceObservationResourcesV2(
  service,
  token,
) {
  return originalGraph.readOriginalDeviceGraphSourceObservationResourcesV2(
    ...arguments,
  );
}

export async function checkpointOriginalDeviceExternalFlatGraphObservationSourceV2(
  service,
  token,
) {
  return originalGraph.checkpointOriginalDeviceExternalFlatGraphObservationSourceV2(
    ...arguments,
  );
}

export function wrapOriginalDeviceGraphSourceObservationV2(
  service,
  token,
  close,
) {
  return originalGraph.wrapOriginalDeviceGraphSourceObservationV2(...arguments);
}

export function readOriginalDeviceExternalFlatSourceGraphServiceProofsV1(
  service,
) {
  return originalGraph.readOriginalDeviceExternalFlatSourceGraphServiceProofsV1(
    ...arguments,
  );
}

export function captureOriginalDeviceExternalFlatGraphServiceV1(service) {
  return originalGraph.captureOriginalDeviceExternalFlatGraphServiceV1(
    ...arguments,
  );
}

export async function retainOriginalDeviceExternalFlatGraphServiceSectionV1(
  service,
  token,
) {
  return originalGraph.retainOriginalDeviceExternalFlatGraphServiceSectionV1(
    ...arguments,
  );
}

export async function retainOriginalDeviceExternalFlatGraphSystemV1(
  service,
  token,
) {
  return originalGraph.retainOriginalDeviceExternalFlatGraphSystemV1(
    ...arguments,
  );
}

export async function reopenOriginalDeviceExternalFlatGraphServiceSectionV1(
  input,
) {
  return originalGraph.reopenOriginalDeviceExternalFlatGraphServiceSectionV1(
    ...arguments,
  );
}

export function readOriginalDeviceExternalFlatMultiGraphObservationContextV4(
  service,
) {
  return originalGraph.readOriginalDeviceExternalFlatMultiGraphObservationContextV4(
    ...arguments,
  );
}

export async function reopenOriginalDeviceExternalFlatGraphServiceV1(input) {
  return originalGraph.reopenOriginalDeviceExternalFlatGraphServiceV1(
    ...arguments,
  );
}

export function readOriginalDeviceExternalFlatGraphObservationContextV1(
  service,
) {
  return originalGraph.readOriginalDeviceExternalFlatGraphObservationContextV1(
    ...arguments,
  );
}

export function readOriginalDeviceMorphoBlueGraphObservationContextV1(service) {
  return originalGraph.readOriginalDeviceMorphoBlueGraphObservationContextV1(
    ...arguments,
  );
}
export const {} = originalGraph;
