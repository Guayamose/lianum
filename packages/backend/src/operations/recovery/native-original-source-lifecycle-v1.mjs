/** Canonical SOURCE composition. Only this private instance binds the original
 * recovery owners and the sixteen fixed lazy resource loaders. Public methods
 * keep their signatures and original capability checks inside the backend. */
import {
  buildOriginalNativeSourceLifecycleV1,
  ORIGINAL_NATIVE_SOURCE_PROFILE_V1,
} from "./native-original-source-lifecycle-backend-v1.mjs";
import * as wrappedRecovery from "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs";
import * as deviceSourceAuthority from "./device-external-flat-original-source-v2.mjs";
import { assertOwnedEvmRecoveryStateDumpV1 } from "../../chains/evm/runtime/owned-evm-recovery-state-bound-v1.mjs";
import { buildNativeManualSessionV1 } from "../../api/accounts/native-manual-session-backend-v1.mjs";
import {
  originalActorFrameDataV1,
  reconcileNativeSourceActorCheckpointDataV1,
  reconcileNativeSourceAccountCheckpointDataV1,
} from "./source-journal/checkpoint-reconciliation-v1.mjs";
import { buildOriginalNativeSourceClockBackendV1 } from "./native-original-source-clock-backend-v1.mjs";
import { ROOT } from "@lianum/proofs/catalog";
import { Vault } from "@lianum/engine/crypto/vault";
import { NATIVE_VALUE_DEV_RELEASE_V5 } from "../releases/native-value/native-value-dev-release-v5.mjs";
import { buildOwnedEvmRuntimeBackendV1 } from "../../chains/evm/runtime/owned-evm-runtime-backend-v1.mjs";
import { buildPairedOriginalAccountActorV2 } from "../../api/mobile/paired-original-account-actor-backend-v2.mjs";
export { ORIGINAL_NATIVE_SOURCE_PROFILE_V1 };
const originalSource = buildOriginalNativeSourceLifecycleV1(
  Object.freeze({
    wrappedRecovery,
    deviceSourceAuthority,
    assertOwnedEvmRecoveryStateDumpV1,
    dependencies: Object.freeze({
      buildNativeManualSessionV1,
      originalActorFrameDataV1,
      reconcileNativeSourceActorCheckpointDataV1,
      reconcileNativeSourceAccountCheckpointDataV1,
      buildOriginalNativeSourceClockBackendV1,
      ROOT,
      Vault,
      NATIVE_VALUE_DEV_RELEASE_V5,
      buildOwnedEvmRuntimeBackendV1,
      buildPairedOriginalAccountActorV2,
    }),
    load: Object.freeze({
      nativeOriginalSourcePartsV1: () =>
        import("./native-original-source-parts-v1.mjs"),
      nativeValueAccountAuthorityV2: () =>
        import(
          "../../accounts/authority/native-value-account-authority-v2.mjs"
        ),
      wrappedRecoveryAuthorityV1: () =>
        import(
          "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs"
        ),
      nativeValueExecutionV2: () =>
        import(
          "../../execution/native-value/execution/native-value-execution-v2.mjs"
        ),
      deviceExternalFlatNoteAuthorityV1: () =>
        import(
          "../../accounts/authority/device-external-flat-note-authority-v1.mjs"
        ),
      evmDispatchGate: () =>
        import("../../chains/evm/dispatch/evm-dispatch-gate.mjs"),
      controller: () => import("../../claims/controller/controller.mjs"),
      wrappedControllerV1: () =>
        import("../../claims/wrapped/controller/wrapped-controller-v1.mjs"),
      fundedPagedNativeProviderV3: () =>
        import("../../providers/funded-paged-native-provider-v3.mjs"),
      nativeValueEvmDispatchGate: () =>
        import("../../chains/evm/dispatch/native-value-evm-dispatch-gate.mjs"),
      wrappedClaimGraphDispatchGateV1: () =>
        import(
          "../../chains/shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs"
        ),
      evmNativeValueHealthSourceV4: () =>
        import("../../chains/evm/health/evm-native-value-health-source-v4.mjs"),
      flatAccountSession: () =>
        import("../../api/accounts/flat-account-session.mjs"),
      nativeValueSystemV2: () =>
        import("../deployments/native-value/native-value-system-v2.mjs"),
      durableGenericAccountKeeper: () =>
        import("../../accounts/storage/durable-generic-account-keeper.mjs"),
      originalWalletEconomicStateV1: () =>
        import("../../accounts/state/original-wallet-economic-state-v1.mjs"),
    }),
  }),
);

export function consumeOriginalNativeSourceAccountCheckpointV1(request) {
  return originalSource.consumeOriginalNativeSourceAccountCheckpointV1(
    ...arguments,
  );
}

export function consumeOriginalNativeSourceActorCheckpointV1(request) {
  return originalSource.consumeOriginalNativeSourceActorCheckpointV1(
    ...arguments,
  );
}

export async function createOriginalNativeSourceCapsuleV1() {
  return originalSource.createOriginalNativeSourceCapsuleV1(...arguments);
}

export function assertOriginalNativeSourceCapsuleV1(authority) {
  return originalSource.assertOriginalNativeSourceCapsuleV1(...arguments);
}

export function originalNativeSourceCapsuleStatusV1(authority) {
  return originalSource.originalNativeSourceCapsuleStatusV1(...arguments);
}

export function readOriginalNativeSourceOwnedProcessesV1(authority) {
  return originalSource.readOriginalNativeSourceOwnedProcessesV1(...arguments);
}

export async function openOriginalNativeSourceCapsuleV1() {
  return originalSource.openOriginalNativeSourceCapsuleV1(...arguments);
}

export function nativeSourceRecoverySectionIdentityV1(token, section) {
  return originalSource.nativeSourceRecoverySectionIdentityV1(...arguments);
}

export function nativeSourceRecoveryOriginalReferenceV1(token, section, name) {
  return originalSource.nativeSourceRecoveryOriginalReferenceV1(...arguments);
}

export async function nativeSourceRecoveryOwnedProcessV1(token, section, pid) {
  return originalSource.nativeSourceRecoveryOwnedProcessV1(...arguments);
}

export async function retainOriginalNativeSourceSectionV1(
  token,
  section,
  data,
) {
  return originalSource.retainOriginalNativeSourceSectionV1(...arguments);
}

export async function updateOriginalNativeSourceSectionV1(handle, data) {
  return originalSource.updateOriginalNativeSourceSectionV1(...arguments);
}

export function consumeOriginalNativeSourceSectionV1(token, section) {
  return originalSource.consumeOriginalNativeSourceSectionV1(...arguments);
}

export function resumeOriginalNativeSourceSectionV1(token, section) {
  return originalSource.resumeOriginalNativeSourceSectionV1(...arguments);
}

export async function retainOriginalNativeSourceReferenceV1(
  authority,
  section,
  resource,
) {
  return originalSource.retainOriginalNativeSourceReferenceV1(...arguments);
}

export async function createOriginalNativeSourceAccountV1(authority, input) {
  return originalSource.createOriginalNativeSourceAccountV1(...arguments);
}

export async function createOriginalNativeSourceSessionV1(authority, input) {
  return originalSource.createOriginalNativeSourceSessionV1(...arguments);
}

export async function reopenOriginalNativeSourceReferenceV1(
  authority,
  section,
  contexts,
) {
  return originalSource.reopenOriginalNativeSourceReferenceV1(...arguments);
}

export async function createOriginalNativeSourceClockPairV1(authority) {
  return originalSource.createOriginalNativeSourceClockPairV1(...arguments);
}

export function consumeOriginalNativeSourceRuntimeRequestV1(token) {
  return originalSource.consumeOriginalNativeSourceRuntimeRequestV1(
    ...arguments,
  );
}

export function originalNativeSourceRuntimeRequestIdentityV1(request) {
  return originalSource.originalNativeSourceRuntimeRequestIdentityV1(
    ...arguments,
  );
}

export function readOriginalNativeSourceRuntimeSeedV1(request) {
  return originalSource.readOriginalNativeSourceRuntimeSeedV1(...arguments);
}

export async function retainOriginalNativeSourceRuntimeSeedV1(request, data) {
  return originalSource.retainOriginalNativeSourceRuntimeSeedV1(...arguments);
}

export function resumeOriginalNativeSourceRuntimeSeedV1(request) {
  return originalSource.resumeOriginalNativeSourceRuntimeSeedV1(...arguments);
}

export async function originalNativeSourceRuntimeOwnedProcessV1(request, pid) {
  return originalSource.originalNativeSourceRuntimeOwnedProcessV1(...arguments);
}

export async function readOriginalNativeSourceRuntimeStateV1(request) {
  return originalSource.readOriginalNativeSourceRuntimeStateV1(...arguments);
}

export async function attachOriginalNativeSourceRuntimeV1(request, runtime) {
  return originalSource.attachOriginalNativeSourceRuntimeV1(...arguments);
}

export async function beginOriginalNativeSourceMutationV1(runtime) {
  return originalSource.beginOriginalNativeSourceMutationV1(...arguments);
}

export async function confirmOriginalNativeSourceMutationV1(token) {
  return originalSource.confirmOriginalNativeSourceMutationV1(...arguments);
}

export async function confirmOriginalNativeSourceBirthV1(runtime) {
  return originalSource.confirmOriginalNativeSourceBirthV1(...arguments);
}

export function readOriginalNativeSourceClockCheckpointV1(authority) {
  return originalSource.readOriginalNativeSourceClockCheckpointV1(...arguments);
}

export async function retainOriginalNativeSourceClockCheckpointV1(
  authority,
  clock,
) {
  return originalSource.retainOriginalNativeSourceClockCheckpointV1(
    ...arguments,
  );
}

export async function finishOriginalNativeSourceBirthV1(authority) {
  return originalSource.finishOriginalNativeSourceBirthV1(...arguments);
}

export async function finishOriginalNativeSourceReopenV1(authority) {
  return originalSource.finishOriginalNativeSourceReopenV1(...arguments);
}

export async function closeOriginalNativeSourceCapsuleV1(authority) {
  return originalSource.closeOriginalNativeSourceCapsuleV1(...arguments);
}

export async function createOwnedNativeDurableSourceRuntimeV1(token) {
  return originalSource.createOwnedNativeDurableSourceRuntimeV1(...arguments);
}

export function assertOwnedNativeDurableSourceRuntimeV1(runtime) {
  return originalSource.assertOwnedNativeDurableSourceRuntimeV1(...arguments);
}

export function assertOwnedNativeDurableSourceReceiverV1(runtime) {
  return originalSource.assertOwnedNativeDurableSourceReceiverV1(...arguments);
}

export function assertOwnedNativeDurableSourceGraphRuntimeV1(runtime) {
  return originalSource.assertOwnedNativeDurableSourceGraphRuntimeV1(
    ...arguments,
  );
}

export function bindOwnedNativeDurableSourceClockPairV1(receiver, native) {
  return originalSource.bindOwnedNativeDurableSourceClockPairV1(...arguments);
}

export function readOwnedNativeDurableSourceClockPairV1(receiver, native) {
  return originalSource.readOwnedNativeDurableSourceClockPairV1(...arguments);
}

export async function readOriginalNativeDurableSourceStateV1(runtime) {
  return originalSource.readOriginalNativeDurableSourceStateV1(...arguments);
}

export async function createPairedOriginalAccountActorV2(...args) {
  return originalSource.createPairedOriginalAccountActorV2(...arguments);
}

export function assertPairedOriginalAccountActorV2(...args) {
  return originalSource.assertPairedOriginalAccountActorV2(...arguments);
}

export function pairedOriginalAccountActorDescriptorV2(...args) {
  return originalSource.pairedOriginalAccountActorDescriptorV2(...arguments);
}

export function assertPairedOriginalAccountActorAccountV2(...args) {
  return originalSource.assertPairedOriginalAccountActorAccountV2(...arguments);
}

export function pairedOriginalAccountPublicFrameV2(value) {
  return originalSource.pairedOriginalAccountPublicFrameV2(...arguments);
}

export function fenceOriginalNativeActorEconomicRecoveryV1(...args) {
  return originalSource.fenceOriginalNativeActorEconomicRecoveryV1(
    ...arguments,
  );
}

export function captureOriginalNativeActorEconomicRecoveryV1(...args) {
  return originalSource.captureOriginalNativeActorEconomicRecoveryV1(
    ...arguments,
  );
}

export function stopCapturedNativeActorEconomicRecoveryV1(...args) {
  return originalSource.stopCapturedNativeActorEconomicRecoveryV1(...arguments);
}

export function abortNativeActorEconomicRecoveryV1(...args) {
  return originalSource.abortNativeActorEconomicRecoveryV1(...arguments);
}

export async function reopenOriginalNativeActorEconomicRecoveryV1(...args) {
  return originalSource.reopenOriginalNativeActorEconomicRecoveryV1(
    ...arguments,
  );
}

export function assertNativeActorEconomicMembershipV1(...args) {
  return originalSource.assertNativeActorEconomicMembershipV1(...arguments);
}

export function nativePairedActorEconomicSourceV1(...args) {
  return originalSource.nativePairedActorEconomicSourceV1(...arguments);
}

export function assertNativeActorSessionAccountMembershipV1(...args) {
  return originalSource.assertNativeActorSessionAccountMembershipV1(
    ...arguments,
  );
}

export function reconcileOriginalNativeActorSourceCheckpointV1(request) {
  return originalSource.reconcileOriginalNativeActorSourceCheckpointV1(
    ...arguments,
  );
}

export function retainOriginalNativeActorSourceV1(...args) {
  return originalSource.retainOriginalNativeActorSourceV1(...arguments);
}

export async function reopenOriginalNativeActorSourceV1(...args) {
  return originalSource.reopenOriginalNativeActorSourceV1(...arguments);
}

export function flatManualNativeNoteReviews(...args) {
  return originalSource.flatManualNativeNoteReviews(...arguments);
}

export function flatManualNativeNoteActionTarget(...args) {
  return originalSource.flatManualNativeNoteActionTarget(...arguments);
}

export async function createNativeValueManualGraphAccountSession(...args) {
  return originalSource.createNativeValueManualGraphAccountSession(
    ...arguments,
  );
}

export function assertNativeWalletEconomicSessionV1(...args) {
  return originalSource.assertNativeWalletEconomicSessionV1(...arguments);
}

export function fenceOriginalNativeSessionEconomicRecoveryV1(...args) {
  return originalSource.fenceOriginalNativeSessionEconomicRecoveryV1(
    ...arguments,
  );
}

export function captureOriginalNativeSessionEconomicRecoveryV1(...args) {
  return originalSource.captureOriginalNativeSessionEconomicRecoveryV1(
    ...arguments,
  );
}

export function stopCapturedNativeSessionEconomicRecoveryV1(...args) {
  return originalSource.stopCapturedNativeSessionEconomicRecoveryV1(
    ...arguments,
  );
}

export function abortNativeSessionEconomicRecoveryV1(...args) {
  return originalSource.abortNativeSessionEconomicRecoveryV1(...arguments);
}

export async function reopenOriginalNativeSessionEconomicRecoveryV1(...args) {
  return originalSource.reopenOriginalNativeSessionEconomicRecoveryV1(
    ...arguments,
  );
}

export function assertNativeSessionEconomicMembershipV1(...args) {
  return originalSource.assertNativeSessionEconomicMembershipV1(...arguments);
}

export function assertOriginalNativeSessionSourceKeeperV1(...args) {
  return originalSource.assertOriginalNativeSessionSourceKeeperV1(...arguments);
}

export function prepareOriginalNativeSessionKeeperSourceCheckpointV1(...args) {
  return originalSource.prepareOriginalNativeSessionKeeperSourceCheckpointV1(
    ...arguments,
  );
}

export function confirmOriginalNativeSessionKeeperSourceCheckpointV1(...args) {
  return originalSource.confirmOriginalNativeSessionKeeperSourceCheckpointV1(
    ...arguments,
  );
}

export async function createOriginalNativeSourceGraphAccountSessionV1(...args) {
  return originalSource.createOriginalNativeSourceGraphAccountSessionV1(
    ...arguments,
  );
}

export async function reopenOriginalNativeSessionSourceV1(...args) {
  return originalSource.reopenOriginalNativeSessionSourceV1(...arguments);
}

export function nativeManualGraphReviews(...args) {
  return originalSource.nativeManualGraphReviews(...arguments);
}

export function nativeManualGraphHandoffBindings(...args) {
  return originalSource.nativeManualGraphHandoffBindings(...arguments);
}

export function nativeManualGraphActionTarget(...args) {
  return originalSource.nativeManualGraphActionTarget(...arguments);
}

export function readOriginalNativeSessionWalletEconomicSnapshotV1(...args) {
  return originalSource.readOriginalNativeSessionWalletEconomicSnapshotV1(
    ...arguments,
  );
}

export function createOriginalNativeSessionWalletEconomicStateV1(...args) {
  return originalSource.createOriginalNativeSessionWalletEconomicStateV1(
    ...arguments,
  );
}

export function reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1(
  ...args
) {
  return originalSource.reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1(
    ...arguments,
  );
}

export function readOriginalNativeSessionWalletEconomicStateV1(...args) {
  return originalSource.readOriginalNativeSessionWalletEconomicStateV1(
    ...arguments,
  );
}

export function isOriginalNativeManualSessionV1(session) {
  return originalSource.isOriginalNativeManualSessionV1(...arguments);
}

export const {
  createOwnedLocalEvmObservedClockV1,
  refreshNativeValueReceiverClock,
  nativeValueReceiverInclusionSecondV1,
  assertOwnedLocalEvmObservedClockV1,
  consumeNativeEconomicObservedCustodyRequestV2,
  createOwnedNativeEconomicObservedReceiverV2,
  createOwnedNativeEconomicObservedGraphRuntimeV2,
  createOwnedNativeEconomicObservedClockPairV2,
  assertOwnedNativeEconomicObservedReceiverV2,
  assertOwnedNativeEconomicObservedGraphRuntimeV2,
  createOwnedNativeLiveArmedObservedClockPairV1,
  assertOwnedNativeLiveArmedReceiverV1,
  assertOwnedNativeLiveArmedGraphRuntimeV1,
  bindOwnedNativeLiveArmedObservedClockPairV1,
  readOwnedNativeLiveArmedObservedClockPairV1,
  fenceOwnedNativeLiveArmedRuntimeV1,
  captureOwnedNativeLiveArmedRuntimeV1,
  abortOwnedNativeLiveArmedRuntimeV1,
  reopenOwnedNativeLiveArmedReceiverV1,
  reopenOwnedNativeLiveArmedGraphRuntimeV1,
  refreshOwnedNativeEconomicObservedGraphClockV2,
  probeOwnedOsakaTransactionGasRejectionV1,
  createOwnedOriginalNativeFReorgReceiverV1,
  isOwnedOriginalNativeFReorgReceiverV1,
  retainOwnedOriginalFReorgProbeV1,
  rewindOwnedOriginalFReorgProbeV1,
  reemitOwnedOriginalNativeRecoveryV1,
  armOwnedEvmRecoveryRetentionV1,
  captureOwnedEvmRecoveryV1,
  reopenOwnedReceiverRecoveryV1,
  reopenOwnedNativeD26ObservationReceiverV1,
  reopenOwnedNativeEconomicReceiverV1,
  reopenOwnedExternalDefiReceiverV2,
  reopenOwnedDeviceExternalFlatReceiverV1,
  reopenOwnedNativeEconomicGraphRuntimeV1,
  reopenOwnedReceiverPreopenRepairV1,
  reopenOwnedGraphNativeRecoveryV1,
  isOwnedLocalEvmNativeValueRuntime,
  assertOwnedLocalEvmNativeValueRuntime,
  assertOwnedLocalEvmNativeValueRuntimeLive,
  readOwnedLocalEvmNativeValueAuditStateV4,
  readOwnedEvmWrappedGraphOperationV4,
  ownedLocalEvmNativeValueRuntimeIdentity,
  openOwnedLocalEvmNativeValueSource,
  isOwnedLocalEvmNativeValueV1,
  assertOwnedLocalEvmNativeValueV1,
  isOwnedLocalEvmV2,
  ownedLocalEvmTransactionGasLimit,
  assertOwnedLocalEvmV2,
  createOwnedLocalEvmV2,
  createOwnedLocalEvmOsakaV1,
  createOwnedLocalEvmNativeValueV1,
  createOwnedLocalPagedNativeEvmV3,
  assertOwnedLocalPagedNativeEvmV3,
  createOwnedLocalEvmNativeValueBaseV1,
  createOwnedLocalEvmNativeValueArbitrumV1,
  createOwnedLocalEvmNativeValueBnbV1,
  createOwnedLocalEvmV2PoolGenerationAcceptance,
  ownedPoolGenerationTransportControls,
  recoveryAnvilPinV1,
  createOwnedRecoverableReceiverV1,
  createOwnedRecoverableGraphNativeV1,
  createOwnedNativeEconomicReceiverV2,
  createOwnedNativeEconomicGraphRuntimeV2,
  createOwnedExternalDefiReceiverV2,
  assertOwnedExternalDefiReceiverV2,
  captureOwnedExternalDefiReceiverV2,
  abortOwnedExternalDefiReceiverCaptureV2,
  createOwnedDeviceExternalFlatReceiverV1,
  createOwnedDeviceExternalFlatSourceReceiverV2,
  assertOwnedDeviceExternalFlatSourceReceiverV2,
  checkpointOwnedDeviceExternalFlatSourceReceiverV2,
  reopenOwnedDeviceExternalFlatSourceReceiverV2,
  assertOwnedDeviceExternalFlatReceiverV1,
  captureOwnedDeviceExternalFlatReceiverV1,
  abortOwnedDeviceExternalFlatReceiverCaptureV1,
  isOwnedNativeEconomicRuntimeV2,
  assertOwnedNativeEconomicRuntimeRecoverableV1,
  fenceOwnedNativeEconomicRuntimeV1,
  captureOwnedNativeEconomicRuntimeV1,
  abortOwnedNativeEconomicRuntimeV1,
  createNativeEconomicLocalCustodyV2,
  createNativeEconomicObservedLocalCustodyV2,
  assertNativeEconomicGenesisV2,
  reopenNativeEconomicLocalCustodyV2,
  reopenNativeEconomicObservedLocalCustodyV2,
  nativeEconomicLocalCustodyPublicV2,
  checkNativeEconomicLocalCustodyV2,
  signNativeEconomicCustodyTransactionV2,
  captureNativeEconomicLocalCustodyV2,
  prepareNativeEconomicCustodySigningV2,
  consumeNativeEconomicCustodySigningV2,
  revokeNativeEconomicCustodySigningV2,
  closeNativeEconomicLocalCustodyV2,
  consumeOwnedEvmNativeSourceRequest,
  describeOwnedLocalEvmNativeValueSource,
  createOwnedLocalEvmNativeValueHealthSource,
  openOriginalOwnedRollupNativeValueSourcesV1,
  assertOriginalNativeSourceObservedClockV1,
  readOriginalNativeSourceClockReferencesV1,
  snapshotOriginalNativeSourceObservedClockV1,
  refreshOriginalNativeSourceObservedClockV1,
  createOriginalNativeSourceObservedClocksV1,
  reopenOriginalNativeSourceObservedClocksV1,
} = originalSource;
