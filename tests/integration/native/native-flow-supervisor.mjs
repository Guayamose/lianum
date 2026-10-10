import {NATIVE_SOURCE_ABRUPT_RESULT_V1,assertNativeSourceAbruptReleaseV1,assertNativeSourceAbruptResultV1} from '../wallet/native/native-original-source-abrupt-policy-v1.mjs';
import {nativeSourceAbruptSourcePinsV1} from '../wallet/native/native-original-source-abrupt-source-pins-v1.mjs';
import {classifyNativeSourceAbruptProcessV1,assertNativeSourceAbruptPreflightV1} from '../wallet/native/native-original-source-abrupt-process-scope-v1.mjs';
import {deviceMorphoBlueGraphSourcePinsV1,deviceExternalFlatGraphSourcePinsV1,deviceExternalFlatErc20SourcePinsV1} from '../wallet/native/device-external-flat-erc20-source-pins-v1.mjs';
import {DEVICE_MORPHO_BLUE_GRAPH_RESULT_V1,assertDeviceMorphoBlueGraphReleaseV1,assertDeviceMorphoBlueGraphResultV1,classifyDeviceMorphoBlueGraphProcessV1,DEVICE_EXTERNAL_FLAT_GRAPH_RESULT_V1,assertDeviceExternalFlatGraphReleaseV1,assertDeviceExternalFlatGraphResultV1,classifyDeviceExternalFlatGraphProcessV1,DEVICE_EXTERNAL_FLAT_ERC20_RESULT_V1,assertDeviceExternalFlatErc20ReleaseV1,assertDeviceExternalFlatErc20ResultV1,classifyDeviceExternalFlatErc20ProcessV1} from '../wallet/native/device-external-flat-erc20-policy-v1.mjs';
import {classifyExternalDefiVaultExitProcessV1,externalDefiVaultExitProcessFailureV1} from '../chains/evm/external-defi-vault-exit-process-scope-v1.mjs';
import {externalDefiVaultExitSourcePinsV1} from '../chains/evm/external-defi-vault-exit-source-pins-v1.mjs';
import {assertExternalVaultExitRecoveryReleaseV1,assertExternalDefiVaultExitRecoveryResultV1} from '../chains/evm/external-defi-vault-exit-policy-v1.mjs';
import {classifyNativeEconomicNoteProcessV1} from '../../../packages/engine/src/execution/proofs/note-native-execution-v1.mjs';
import {nativeSplClaimValidationCompilationSourcePinsV1} from '../chains/evm/native-spl-claim-validation-compilation-source-pins-v1.mjs';
import {SPL_VALIDATION_COMPILATION_RESULT_V1,assertNativeSplClaimValidationCompilationResultV1,nativeSplClaimValidationCompilationProcessFailureV1} from '../chains/evm/native-spl-claim-validation-compilation-policy-v1.mjs';
import {developmentBtcSplJupiterSourcePinsV1} from '../claims/development/development-btc-spl-jupiter-source-pins-v1.mjs';
import {DEVELOPMENT_BTC_SPL_GRAPH_RESULT,assertDevelopmentBtcSplSourceReviewV1,assertDevelopmentBtcSplJupiterResultV1} from '../claims/development/development-btc-spl-jupiter-policy-v1.mjs';
import {nativeSplClaimV1CompilationSourcePins} from '../chains/evm/native-spl-claim-v1-compilation-source-pins.mjs';
import {SPL_CLAIM_V1_COMPILATION_RESULT,SPL_CLAIM_V1_COMPILATION_DEADLINE,assertNativeSplClaimV1CompilationResult,classifyNativeSplClaimV1Preparation,nativeSplClaimV1CompilationProcessFailure} from '../chains/evm/native-spl-claim-v1-compilation-policy.mjs';
import {nativeSplClaimTokenCompilationSourcePinsV1} from '../chains/evm/native-spl-claim-token-compilation-source-pins-v1.mjs';
import {SPL_TOKEN_COMPILATION_RESULT_V1,assertNativeSplClaimTokenCompilationResultV1,nativeSplClaimTokenCompilationProcessFailureV1} from '../chains/evm/native-spl-claim-token-compilation-policy-v1.mjs';
import {classifyReservationNativeProcessV1} from '../../../packages/proofs/src/jobs/reservation-native-execution-v1.mjs';
import {classifyNodeNativeProcessV1} from '../../../packages/proofs/src/jobs/node-native-execution-v1.mjs';
import {classifyAuthorizationNativeProcessV1} from '../../../packages/proofs/src/jobs/authorization-native-execution-v1.mjs';
import {classifyI84NativeProcessV1} from '../../../packages/proofs/src/native-value/runtime/native-value-dev-live-v5-native-execution.mjs';
import {nativeSplCompilationSourcePinsV1} from '../chains/solana/native-spl-compilation-source-pins-v1.mjs';
import {SPL_COMPILATION_RESULT_V1,SPL_COMPILATION_LIMITS_V1,assertNativeSplCompilationResultV1,nativeSplCompilationProcessFailureV1,classifyNativeSplCompilerProcessV1} from '../chains/solana/native-spl-compilation-policy-v1.mjs';
import {jupiterOrcaPublicSwapSourcePinsV1} from '../chains/solana/jupiter-orca-public-swap-source-pins-v1.mjs';
import {JUPITER_SWAP_RESULT_V1,assertJupiterOrcaPublicSwapResultV1,jupiterOrcaSwapProcessFailureV1} from '../chains/solana/jupiter-orca-public-swap-policy-v1.mjs';
import {assertJupiterPublicFixtureSourceReviewV1,assertJupiterPublicSwapSourceReviewV1} from '../../../packages/backend/src/operations/deployments/defi/jupiter-official-material-v1.mjs';
import {aaveCompilationSourcePinsV1} from '../chains/evm/aave-compilation-source-pins-v1.mjs';
import {AAVE_COMPILATION_RESULT_V1,assertAaveCompilationResultV1,aaveCompilationProcessFailureV1} from '../chains/evm/aave-compilation-policy-v1.mjs';
import {aavePrivateGraphSourcePinsV1} from '../chains/evm/aave-private-graph-source-pins-v1.mjs';
import {assertAavePrivateGraphResultV1} from '../chains/evm/aave-private-graph-policy-v1.mjs';
import {assertOfficialAaveSourceReviewV1} from '../../../packages/backend/tests/fixtures/operations/deployments/system/official-aave-fixture-v1.mjs';
import { nativeWalletTronDevSourcePinsV5 } from '../wallet/native/native-wallet-tron-dev-source-pins-v5.mjs';
import { assertNativeWalletTronDevReleaseV5, assertNativeWalletTronDevResultV5, NATIVE_WALLET_TRON_DEV_RESULT_V5 } from '../wallet/native/native-wallet-tron-dev-policy-v5.mjs';
import { pairedNativeNoteSourcePinsV2 } from '../wallet/native/paired-native-note-source-pins-v2.mjs';
import { deviceOwnerDepositSourcePinsV1 } from '../wallet/native/device-owner-deposit-source-pins-v1.mjs';
import { DEVICE_DEPOSIT_RESULT_V1, assertDeviceDepositReleaseV1, assertDeviceDepositResultV1 } from '../wallet/native/device-owner-deposit-policy-v1.mjs';
import {nativeDeviceEconomicNoteSourcePinsV1} from '../wallet/native/native-device-economic-note-source-pins-v1.mjs';
import {assertNativeEconomicNoteRecoverableAnvilV1,classifyNativeEconomicNoteRestartProcessV1} from '../wallet/native/native-device-economic-note-process-scope-v1.mjs';
import {NATIVE_DEVICE_ECONOMIC_NOTE_RESULT_V1,assertNativeDeviceEconomicNoteReleaseV1,assertNativeDeviceEconomicNoteResultV1} from '../wallet/native/native-device-economic-note-policy-v1.mjs';
import {nativeDeviceEconomicSourcePinsV1} from '../wallet/native/native-device-economic-source-pins-v1.mjs';
import {assertNativeEconomicRecoverableAnvilV1,classifyNativeEconomicRestartProcessV1} from '../wallet/native/native-device-economic-process-scope-v1.mjs';
import {NATIVE_DEVICE_ECONOMIC_RESULT_V1,assertNativeDeviceEconomicReleaseV1,assertNativeDeviceEconomicResultV1} from '../wallet/native/native-device-economic-policy-v1.mjs';
import {deviceOwnerRecoverySourcePinsV1} from '../wallet/native/device-owner-recovery-source-pins-v1.mjs';
import {DEVICE_RECOVERY_RESULT_V1,assertDeviceRecoveryReleaseV1,assertDeviceRecoveryResultV1} from '../wallet/native/device-owner-recovery-policy-v1.mjs';
import {deviceOwnerExecutionSourcePinsV1} from '../wallet/native/device-owner-execution-source-pins-v1.mjs';
import {DEVICE_EXECUTION_RESULT_V1,assertDeviceExecutionReleaseV1,assertDeviceExecutionResultV1} from '../wallet/native/device-owner-execution-policy-v1.mjs';
import {deviceOwnerReservationSourcePinsV1} from '../wallet/native/device-owner-reservation-source-pins-v1.mjs';
import {DEVICE_RESERVATION_RESULT_V1,assertDeviceReservationReleaseV1,assertDeviceReservationResultV1} from '../wallet/native/device-owner-reservation-policy-v1.mjs';
import { PAIRED_NATIVE_NOTE_RESULT_V2, assertPairedNativeNoteReleaseV2, assertPairedNativeNoteResultV2 } from '../wallet/native/paired-native-note-policy-v2.mjs';
import { nativeClaimEmptyAuditSourcePins } from '../claims/metrics/native-claim-empty-audit-source-pins-v1.mjs';
import { EMPTY_AUDIT_REAL_RUN_DISABLED, EMPTY_AUDIT_RESULT, assertEmptyAuditResult, emptyAuditProcessFailure }
  from '../claims/metrics/native-claim-empty-audit-policy-v1.mjs';
import { developmentBtcSolGraphSourcePins } from '../claims/development/development-btc-sol-graph-source-pins.mjs';
import { DEVELOPMENT_BTC_SOL_GRAPH_REAL_RUN_DISABLED, DEVELOPMENT_BTC_SOL_GRAPH_RESULT, assertDevelopmentBtcSolGraphResult } from '../claims/development/development-btc-sol-graph-policy.mjs';
import { osakaSmokeSourcePins } from '../evm/osaka/development-osaka-smoke-source-pins.mjs';
import { OSAKA_SMOKE_RESULT, assertOsakaSmokeResult, osakaSmokeProcessFailure } from '../evm/osaka/development-osaka-smoke-policy.mjs';
import { developmentDefiEntrySourcePins } from '../defi/entry/development-defi-entry-source-pins.mjs';
import { DEVELOPMENT_DEFI_ENTRY_RESULT, assertDevelopmentDefiEntryResult } from '../defi/entry/development-defi-entry-policy.mjs';
import { developmentNativeClaimSourcePins } from '../claims/development/development-native-claim-source-pins.mjs';
import { DEVELOPMENT_NATIVE_CLAIM_RESULT, assertDevelopmentNativeClaimResult } from '../claims/development/development-native-claim-policy.mjs';
import { privateMetaMorphoSourcePins } from '../defi/private-metamorpho-source-pins.mjs';
import { PRIVATE_METAMORPHO_FLOW_RESULT, assertPrivateMetaMorphoResult } from '../defi/private-metamorpho-flow-policy.mjs';
import {types as coldErrorTypesV1} from 'node:util';
import {assertWrappedColdCycleReleaseV1,writeWrappedColdStageGrantV1,assertWrappedColdBoundaryV1,wrappedColdSourceIdentityV1} from '../wallet/wrapped/flows/wrapped-wallet-cold-cycle-v1.mjs';
import { parseNativeProcStat, nativeProcStatV1 as procStat, readNativeFlowRegularV1 as readRegular, nativeProcStatIntegerDiagnosticV1 } from './native-flow-owned-files-v1.mjs';
export { parseNativeProcStat } from './native-flow-owned-files-v1.mjs';
import { nativeOwnedRSSV1 } from './native-flow-owned-rss-v1.mjs';
import { classifyBeginPayoutAuditProofProcessV1, beginPayoutAuditProcessFailureV1 } from '../../../packages/proofs/src/jobs/native-flow-proof-scope-v1.mjs';
// Fixed wrapped-only loader. Generic profiles never evaluate the external bootstrap.
let wrappedSourceModuleV2 = null;
async function initializeWrappedSupervisorSourceV2() {
  assert.equal(arguments.length, 0, 'WRAPPED_SUPERVISOR_SOURCE_NO_OPTIONS');
  wrappedSourceModuleV2 ??= await import('../deployments/wrapped/wrapped-installation-source-inspector-v2.mjs');
  inspectWrappedInstallationSourcesV2();
}
function inspectWrappedInstallationSourcesV2() {
  assert.equal(arguments.length, 0, 'WRAPPED_SUPERVISOR_SOURCE_NO_OPTIONS');
  assert.ok(wrappedSourceModuleV2, 'WRAPPED_SUPERVISOR_SOURCE_NOT_INITIALIZED');
  return wrappedSourceModuleV2.inspectWrappedInstallationSourcesV2();
}
import { WRAPPED_DEPLOYMENT_ONLY_RESULT_V1, assertWrappedDeploymentOnlyReleaseV1, assertWrappedDeploymentOnlyResultV1, WRAPPED_WALLET_FIXED_RELEASE_V1, WRAPPED_WALLET_FIXED_PREFLIGHT_RELEASE_V1, WRAPPED_WALLET_FIXED_RESULT_V1, WRAPPED_WALLET_FIXED_PREFLIGHT_RESULT_V1, assertWrappedWalletFixedResultV1, assertWrappedWalletFixedPreflightResultV1 } from '../wallet/wrapped/validation/wrapped-wallet-fixed-policy-v1.mjs';
import { wrappedWalletFixedSourcePinsV1 } from '../wallet/wrapped/validation/wrapped-wallet-fixed-source-pins-v1.mjs';
import { assertBeginPayoutAuditReleaseV1 } from '../../../packages/backend/src/claims/payouts/begin-payout-audit-policy-v1.mjs';
import { BEGIN_PAYOUT_AUDIT_RESULT_V1, assertBeginPayoutAuditResultV1 } from '../claims/payouts/native-claim-begin-payout-audit-policy-v1.mjs';
import { NATIVE_WALLET_UNFUNDED_RELEASE_V1, NATIVE_WALLET_REAL_RELEASE_V1, NATIVE_WALLET_RESULT_V1,
  NATIVE_WALLET_PREFLIGHT_RESULT_V1, assertNativeWalletRealResult, assertNativeWalletUnfundedResult } from '../wallet/native/native-wallet-real-policy-v1.mjs';
import { nativeWalletRealSourcePins } from '../wallet/native/native-wallet-real-source-pins-v1.mjs';
import { POOL_GENERATION_PHASE1_RELEASE, POOL_GENERATION_PHASE2_RELEASE, PHASE1_FORMAT, PHASE2_FORMAT,
  assertPoolGenerationPhase1Result, assertPoolGenerationPhase2Result } from '../pools/pool-generation-acceptance-policy.mjs';
import { poolGenerationSourcePins } from '../pools/pool-generation-source-pins.mjs';
import { CLAIM_LOADED_V3_REAL_RUN_DISABLED, validateClaimLoadedV3Result } from '../claims/inventory/native-claim-loaded-v3-policy.mjs';
import { MANUAL_WALLET_REAL_RUN_DISABLED, assertManualWalletResult } from '../wallet/manual/manual-wallet-acceptance-policy.mjs';
import { assertManualWalletRecoveryResult } from '../wallet/manual/manual-wallet-recovery-policy.mjs';
import { CLAIM_GRAPH_V3_REAL_RUN_DISABLED, validateClaimGraphV3Result } from '../claims/graph/validation/native-claim-graph-v3-policy.mjs';
import { PREFLIGHT_REAL_RUN_DISABLED, PREFLIGHT_RESULT, assertNativeIngressV3PreflightResult, preflightForbiddenProcess, PRODUCTION_PREFLIGHT_REAL_RUN_DISABLED, PRODUCTION_PREFLIGHT_RESULT, assertNativeIngressV3ProductionPreflightResult, productionPreflightForbiddenProcess } from '../claims/ingress/native-ingress-v3-preflight-policy.mjs';
/** Linux supervisor for two fixed local application flows. Importing this module
 * performs no native, compiler, proof, key-generation or installation work. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants, closeSync, createReadStream, existsSync, fstatSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync,
  renameSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT, GOLDEN, LOCAL as PROOF_LOCAL, LIMITS as PROOF_LIMITS } from '../../../packages/proofs/src/catalog.mjs';
import { PRIVATE_RESOURCE_POLICY, PRIVATE_RESOURCE_FLOORS,
  PRIVATE_PROOF_WORKER_RSS_LIMIT } from '../../../packages/engine/src/crypto/private-resource-policy.mjs';
import { nativeFlowSourcePins, accountRecoverySourcePins, assetPortfolioSourcePins, evmVaultSourcePins } from '../runners/source-pins.mjs';
import {EVM_METAMORPHO_RECOVERY_RESULT_V1,assertMetaMorphoFReleaseV1,assertEvmMetaMorphoRecoveryResultV1} from '../chains/evm/evm-metamorpho-recovery-policy-v1.mjs';
import {evmMetaMorphoRecoverySourcePinsV1} from '../chains/evm/evm-metamorpho-recovery-source-pins-v1.mjs';
import { EVM_UNISWAP_RECOVERY_RESULT, assertEvmUniswapRecoveryResult } from '../chains/evm/evm-vault-terminal-checks.mjs';
import { manualWalletSourcePins } from '../wallet/manual/manual-wallet-source-pins.mjs';
import { manualWalletBrowserSourcePins } from '../wallet/manual/manual-wallet-browser-source-pins.mjs';
import { MANUAL_WALLET_BROWSER_FORMAT, assertManualWalletBrowserResult } from '../wallet/manual/manual-wallet-browser-policy.mjs';
import { manualWalletBrowserRecoverySourcePins } from '../wallet/manual/manual-wallet-browser-recovery-source-pins.mjs';
import { MANUAL_WALLET_BROWSER_RECOVERY_FORMAT, assertManualWalletBrowserRecoveryResult } from '../wallet/manual/manual-wallet-browser-recovery-policy.mjs';
import { nativeClaimSourcePins } from '../claims/lifecycle/native-claim-source-pins.mjs';
import { UNFUNDED_HEALTH_REAL_RUN_DISABLED, UNFUNDED_HEALTH_RESULT, assertUnfundedHealthResult, unfundedHealthProcessFailure }
  from '../claims/health/native-claim-unfunded-health-policy.mjs';

// Private, fixed catalog: neither public entry accepts a profile or options.
// Paths, result formats, source roots and budgets cannot come from a request.
import {NATIVE_DEVICE_LIVE_ARMED_SHORT_RESULT_V1,assertNativeDeviceLiveArmedShortReleaseV1,assertNativeDeviceLiveArmedShortResultV1} from '../wallet/native/native-device-live-armed-short-policy-v1.mjs';
import {nativeDeviceLiveArmedShortSourcePinsV1} from '../wallet/native/native-device-live-armed-short-source-pins-v1.mjs';
import {classifyNativeLiveArmedShortProcessV1,assertNativeLiveArmedShortRecoverableAnvilV1} from '../wallet/native/native-device-live-armed-short-process-scope-v1.mjs';
import {DEVICE_F_REORG_RESULT_V1,assertDeviceFReorgReleaseV1,assertDeviceFReorgResultV1} from '../wallet/native/device-owner-original-f-reorg-policy-v1.mjs';
import {deviceOwnerFReorgSourcePinsV1} from '../wallet/native/device-owner-original-f-reorg-source-pins-v1.mjs';
const FLOW_PROFILES = Object.freeze({
  nativeSourceAbruptV1:Object.freeze({entry:join(ROOT,'integration/run-native-original-source-abrupt-v1.mjs'),worker:join(ROOT,'integration/native-original-source-abrupt-flow-v1.mjs'),local:join(ROOT,'.local/native-original-source-abrupt-v1'),resultFormat:NATIVE_SOURCE_ABRUPT_RESULT_V1,resourcesFormat:'LIANUM_NATIVE_ORIGINAL_SOURCE_ABRUPT_RESOURCES_V1',lockFormat:'LIANUM_NATIVE_ORIGINAL_SOURCE_ABRUPT_LOCK_V1',attemptFormat:'LIANUM_NATIVE_ORIGINAL_SOURCE_ABRUPT_ATTEMPT_V1',classification:'ORIGINAL_DEVICE_D26_HARD_BACKEND_EXIT_SAME_SOURCE_NEW_PID_U_S_FIRST_ARM_BEFORE_EIGHT_HOURS_NOT_F_OR_PHONE',sourcePins:nativeSourceAbruptSourcePinsV1,cleanupKeys:Object.freeze(['closedEvm','closedNativeEvm','closedNativeExecution','closedBackend'])}),
  deviceOwnerFReorgV1:Object.freeze({entry:join(ROOT,'integration/run-device-owner-original-f-reorg-v1.mjs'),worker:join(ROOT,'integration/device-owner-original-f-reorg-flow-v1.mjs'),local:join(ROOT,'.local/device-owner-original-f-reorg-v1'),resultFormat:DEVICE_F_REORG_RESULT_V1,resourcesFormat:'LIANUM_DEVICE_OWNER_ORIGINAL_F_REORG_RESOURCES_V1',lockFormat:'LIANUM_DEVICE_OWNER_ORIGINAL_F_REORG_LOCK_V1',attemptFormat:'LIANUM_DEVICE_OWNER_ORIGINAL_F_REORG_ATTEMPT_V1',classification:'ORIGINAL_DEVICE_F_EXACT_PARENT_REORG_SAME_RETAINED_WIRE_RECONFIRMATION_LOCAL_NOT_PHONE_OR_DEEP_REORG',sourcePins:deviceOwnerFReorgSourcePinsV1,cleanupKeys:Object.freeze(['closedEvm','closedNativeEvm','closedNativeExecution'])}),
  nativeDeviceLiveArmedShortV1:Object.freeze({entry:join(ROOT,'integration/run-native-value-live-armed-short-restart-v1.mjs'),worker:join(ROOT,'integration/native-value-live-armed-short-restart-flow-v1.mjs'),local:join(ROOT,'.local/native-value-live-armed-recovery-v1'),resultFormat:NATIVE_DEVICE_LIVE_ARMED_SHORT_RESULT_V1,resourcesFormat:'LIANUM_NATIVE_DEVICE_LIVE_ARMED_SHORT_RESOURCES_V1',lockFormat:'LIANUM_NATIVE_DEVICE_LIVE_ARMED_SHORT_LOCK_V1',attemptFormat:'LIANUM_NATIVE_DEVICE_LIVE_ARMED_SHORT_ATTEMPT_V1',classification:'ORIGINAL_DEVICE_D26_U_S_FRESH_ARM_PLANNED_NEW_PROCESS_BEFORE_EIGHT_HOUR_CUTOFF_NOT_F_OR_PHONE',sourcePins:nativeDeviceLiveArmedShortSourcePinsV1,cleanupKeys:Object.freeze(['closedEvm','closedNativeEvm','closedNativeExecution'])}),
  deviceExternalFlatGraphV1:Object.freeze({entry:join(ROOT,'integration/run-device-external-flat-source-graph-v1.mjs'),worker:join(ROOT,'integration/device-external-flat-erc20-flow-v1.mjs'),local:join(ROOT,'.local/device-external-flat-source-graph-v1'),resultFormat:DEVICE_EXTERNAL_FLAT_GRAPH_RESULT_V1,resourcesFormat:'LIANUM_DEVICE_EXTERNAL_FLAT_GRAPH_RESOURCES_V1',lockFormat:'LIANUM_DEVICE_EXTERNAL_FLAT_GRAPH_LOCK_V1',attemptFormat:'LIANUM_DEVICE_EXTERNAL_FLAT_GRAPH_ATTEMPT_V1',classification:'ORIGINAL_DEVICE_SOURCE_D26_TARGET_D27_U_S_GRAPH_TARGET_W39_LOCAL_NOT_PHONE_OR_RECOVERY',sourcePins:deviceExternalFlatGraphSourcePinsV1,cleanupKeys:Object.freeze(['closedDeviceService','closedMobileVault','closedMobileHost','closedEvm','setupOperatorsClosed'])}),
  deviceMorphoBlueGraphV1:Object.freeze({entry:join(ROOT,'integration/run-device-morpho-blue-private-position-v1.mjs'),worker:join(ROOT,'integration/device-external-flat-erc20-flow-v1.mjs'),local:join(ROOT,'.local/device-morpho-blue-private-position-v1'),resultFormat:DEVICE_MORPHO_BLUE_GRAPH_RESULT_V1,resourcesFormat:'LIANUM_DEVICE_MORPHO_BLUE_PRIVATE_POSITION_RESOURCES_V1',lockFormat:'LIANUM_DEVICE_MORPHO_BLUE_PRIVATE_POSITION_LOCK_V1',attemptFormat:'LIANUM_DEVICE_MORPHO_BLUE_PRIVATE_POSITION_ATTEMPT_V1',classification:'ORIGINAL_DEVICE_BLUE_PRIVATE_SUPPLY_SHARED_EXIT_REDEMPTION_LOCAL_NOT_PHONE_OR_PUBLIC_NETWORK',sourcePins:deviceMorphoBlueGraphSourcePinsV1,cleanupKeys:Object.freeze(['closedDeviceService','closedMobileVault','closedMobileHost','closedEvm','setupOperatorsClosed'])}),
  deviceExternalFlatErc20V1:Object.freeze({entry:join(ROOT,'integration/run-device-external-flat-erc20-v1.mjs'),worker:join(ROOT,'integration/device-external-flat-erc20-flow-v1.mjs'),local:join(ROOT,'.local/device-external-flat-ordered-observation-v1'),resultFormat:DEVICE_EXTERNAL_FLAT_ERC20_RESULT_V1,resourcesFormat:'LIANUM_DEVICE_EXTERNAL_FLAT_ERC20_RESOURCES_V1',lockFormat:'LIANUM_DEVICE_EXTERNAL_FLAT_ERC20_LOCK_V1',attemptFormat:'LIANUM_DEVICE_EXTERNAL_FLAT_ERC20_ATTEMPT_V1',classification:'ORIGINAL_DEVICE_EXTERNAL_FLAT_D26_W39_ORDERED_NEW_PID_OBSERVATION_NOT_PHONE_OR_ABRUPT_CRASH',sourcePins:deviceExternalFlatErc20SourcePinsV1,cleanupKeys:Object.freeze(['closedDeviceService','closedMobileVault','closedMobileHost','closedEvm','setupOperatorsClosed','originalBackendCaptured','closedSuccessor'])}),
  evmAaveExitRecoveryV1:Object.freeze({entry:join(ROOT,'integration/run-evm-aave-exit-recovery-v1.mjs'),worker:join(ROOT,'integration/evm-vault-flow.mjs'),local:join(ROOT,'.local/external-defi-owner-cycle-v1'),resultFormat:'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1',resourcesFormat:'ORIGINAL_OFFICIAL_VAULT_EXIT_RECOVERY_RESOURCES_V1',lockFormat:'ORIGINAL_OFFICIAL_VAULT_EXIT_RECOVERY_LOCK_V1',attemptFormat:'ORIGINAL_OFFICIAL_VAULT_EXIT_RECOVERY_ATTEMPT_V1',classification:'PLANNED_ORIGINAL_OFFICIAL_VAULT_EXIT_BACKEND_RECOVERY_NOT_ABRUPT_LOSS_OR_GRAPH_REOPEN',sourcePins:externalDefiVaultExitSourcePinsV1,cleanupKeys:Object.freeze(['closedEvm','closedSuccessor'])}),

  evmMetaMorphoExitRecoveryV1:Object.freeze({entry:join(ROOT,'integration/run-evm-metamorpho-exit-recovery-v1.mjs'),worker:join(ROOT,'integration/evm-vault-flow.mjs'),local:join(ROOT,'.local/external-defi-owner-cycle-v1'),resultFormat:'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1',resourcesFormat:'ORIGINAL_OFFICIAL_VAULT_EXIT_RECOVERY_RESOURCES_V1',lockFormat:'ORIGINAL_OFFICIAL_VAULT_EXIT_RECOVERY_LOCK_V1',attemptFormat:'ORIGINAL_OFFICIAL_VAULT_EXIT_RECOVERY_ATTEMPT_V1',classification:'PLANNED_ORIGINAL_OFFICIAL_VAULT_EXIT_BACKEND_RECOVERY_NOT_ABRUPT_LOSS_OR_GRAPH_REOPEN',sourcePins:externalDefiVaultExitSourcePinsV1,cleanupKeys:Object.freeze(['closedEvm','closedSuccessor'])}),

  nativeSplClaimV1CompilationOnly:Object.freeze({entry:join(ROOT,'integration/run-native-spl-claim-v1-compilation.mjs'),worker:join(ROOT,'integration/native-spl-claim-v1-compilation-worker.mjs'),local:join(ROOT,'.local/native-spl-claim-v1-compilation-only-v1'),resultFormat:SPL_CLAIM_V1_COMPILATION_RESULT,resourcesFormat:'LIANUM_SPL_CLAIM_V1_COMPILATION_RESOURCES_V1',lockFormat:'LIANUM_SPL_CLAIM_V1_COMPILATION_LOCK_V1',attemptFormat:'LIANUM_SPL_CLAIM_V1_COMPILATION_ATTEMPT_V1',classification:'ORIGINAL_CI51_V1_PUBLIC_PREPARATION_AND_TWO_VERIFIERS_NOT_PRIVATE_CREDIT',sourcePins:nativeSplClaimV1CompilationSourcePins,cleanupKeys:Object.freeze(['preparationChildrenClosed','compilerReset'])}),
  nativeSplClaimValidationCompilationOnlyV1:Object.freeze({entry:join(ROOT,'integration/run-native-spl-claim-validation-compilation-v1.mjs'),worker:join(ROOT,'integration/native-spl-claim-validation-compilation-worker-v1.mjs'),local:join(ROOT,'.local/native-spl-claim-validation-compilation-only-v1'),resultFormat:SPL_VALIDATION_COMPILATION_RESULT_V1,resourcesFormat:'LIANUM_SPL_VALIDATION_COMPILATION_RESOURCES_V1',lockFormat:'LIANUM_SPL_VALIDATION_COMPILATION_LOCK_V1',attemptFormat:'LIANUM_SPL_VALIDATION_COMPILATION_ATTEMPT_V1',classification:'NEW_SPL_USDC_CLAIM_VALIDATION_SOLIDITY_ONLY_NOT_PRIVATE_CREDIT',sourcePins:nativeSplClaimValidationCompilationSourcePinsV1,cleanupKeys:Object.freeze(['compilerReset'])}),
  nativeSplClaimTokenCompilationOnlyV1:Object.freeze({entry:join(ROOT,'integration/run-native-spl-claim-token-compilation-v1.mjs'),worker:join(ROOT,'integration/native-spl-claim-token-compilation-worker-v1.mjs'),local:join(ROOT,'.local/native-spl-claim-token-compilation-only-v1'),resultFormat:SPL_TOKEN_COMPILATION_RESULT_V1,resourcesFormat:'LIANUM_SPL_TOKEN_COMPILATION_RESOURCES_V1',lockFormat:'LIANUM_SPL_TOKEN_COMPILATION_LOCK_V1',attemptFormat:'LIANUM_SPL_TOKEN_COMPILATION_ATTEMPT_V1',classification:'NEW_SPL_USDC_CLAIM_TOKEN_SOLIDITY_ONLY_NOT_PRIVATE_CREDIT',sourcePins:nativeSplClaimTokenCompilationSourcePinsV1,cleanupKeys:Object.freeze(['compilerReset'])}),
  nativeSplCompilationOnlyV1:Object.freeze({
    entry:join(ROOT,'integration/run-native-spl-compilation-v1.mjs'),worker:join(ROOT,'integration/native-spl-compilation-worker-v1.mjs'),
    local:join(ROOT,'.local/native-spl-compilation-only-v1'),resultFormat:SPL_COMPILATION_RESULT_V1,
    resourcesFormat:'LIANUM_NATIVE_SPL_COMPILATION_RESOURCES_V1',lockFormat:'LIANUM_NATIVE_SPL_COMPILATION_LOCK_V1',attemptFormat:'LIANUM_NATIVE_SPL_COMPILATION_ATTEMPT_V1',
    classification:'NEW_NATIVE_SPL_SBF_COMPILATION_ONLY_NOT_PRIVATE_CREDIT',sourcePins:nativeSplCompilationSourcePinsV1,cleanupKeys:Object.freeze(['compilerClosed','generatedDeployKeyRemoved']),
  }),
  jupiterOrcaPublicSwapV1:Object.freeze({
    entry:join(ROOT,'integration/run-jupiter-orca-public-swap-v1.mjs'),worker:join(ROOT,'integration/jupiter-orca-public-swap-worker-v1.mjs'),
    local:join(ROOT,'.local/jupiter-orca-public-swap-v1'),resultFormat:JUPITER_SWAP_RESULT_V1,
    resourcesFormat:'LIANUM_JUPITER_ORCA_PUBLIC_SWAP_RESOURCES_V1',lockFormat:'LIANUM_JUPITER_ORCA_PUBLIC_SWAP_LOCK_V1',attemptFormat:'LIANUM_JUPITER_ORCA_PUBLIC_SWAP_ATTEMPT_V1',
    classification:'ONE_ORIGINAL_PUBLIC_JUPITER_ORCA_SWAP_NOT_PRIVATE_CREDIT',sourcePins:jupiterOrcaPublicSwapSourcePinsV1,cleanupKeys:Object.freeze(['closedSolana']),
  }),
  evmAaveCompilationOnlyV1:Object.freeze({
    entry:join(ROOT,'integration/run-evm-aave-compilation-v1.mjs'),worker:join(ROOT,'integration/aave-compilation-worker-v1.mjs'),
    local:join(ROOT,'.local/evm-aave-compilation-only-v1'),resultFormat:AAVE_COMPILATION_RESULT_V1,
    resourcesFormat:'LIANUM_AAVE_COMPILATION_RESOURCES_V1',lockFormat:'LIANUM_AAVE_COMPILATION_LOCK_V1',attemptFormat:'LIANUM_AAVE_COMPILATION_ATTEMPT_V1',
    classification:'NEW_OFFICIAL_AAVE_COMPILATION_ONLY_NOT_FINANCIAL_ACCEPTANCE',sourcePins:aaveCompilationSourcePinsV1,cleanupKeys:Object.freeze(['compilerReset']),
  }),
  nativeDeviceEconomicNoteRecoveryV1:Object.freeze({
    entry:join(ROOT,'integration/run-native-value-economic-note-recovery-v1.mjs'),worker:join(ROOT,'integration/native-value-economic-note-recovery-flow-v1.mjs'),
    local:join(ROOT,'.local/native-value-economic-note-recovery-v1'),resultFormat:NATIVE_DEVICE_ECONOMIC_NOTE_RESULT_V1,resourcesFormat:'LIANUM_NATIVE_DEVICE_ECONOMIC_NOTE_RECOVERY_RESOURCES_V1',
    lockFormat:'LIANUM_NATIVE_DEVICE_ECONOMIC_NOTE_RECOVERY_LOCK_V1',attemptFormat:'LIANUM_NATIVE_DEVICE_ECONOMIC_NOTE_RECOVERY_ATTEMPT_V1',
    classification:'NATIVE12_NOTES_ORIGINAL_PLANNED_NATIVE_ECONOMIC_RESTART_AFTER_F_SAME_DEVICE_W39_NOT_ABRUPT_CRASH_OR_PHONE',sourcePins:nativeDeviceEconomicNoteSourcePinsV1,
    cleanupKeys:Object.freeze(['closedEvm','closedNativeEvm','closedNativeExecution']),
  }),
  nativeDeviceEconomicRecoveryV1:Object.freeze({
    entry:join(ROOT,'integration/run-native-value-economic-recovery-v1.mjs'),worker:join(ROOT,'integration/native-value-economic-recovery-flow-v1.mjs'),
    local:join(ROOT,'.local/native-value-economic-recovery-v1'),resultFormat:NATIVE_DEVICE_ECONOMIC_RESULT_V1,resourcesFormat:'LIANUM_NATIVE_DEVICE_ECONOMIC_RECOVERY_RESOURCES_V1',
    lockFormat:'LIANUM_NATIVE_DEVICE_ECONOMIC_RECOVERY_LOCK_V1',attemptFormat:'LIANUM_NATIVE_DEVICE_ECONOMIC_RECOVERY_ATTEMPT_V1',
    classification:'ORIGINAL_PLANNED_NATIVE_ECONOMIC_RESTART_AFTER_F_SAME_DEVICE_W39_NOT_ABRUPT_CRASH_OR_PHONE',sourcePins:nativeDeviceEconomicSourcePinsV1,
    cleanupKeys:Object.freeze(['closedEvm','closedNativeEvm','closedNativeExecution']),
  }),
  deviceOwnerRecoveryV1:Object.freeze({
    entry:join(ROOT,'integration/run-device-owner-recovery-v1.mjs'),worker:join(ROOT,'integration/device-owner-recovery-flow-v1.mjs'),
    local:join(ROOT,'.local/device-owner-recovery-v1'),resultFormat:DEVICE_RECOVERY_RESULT_V1,resourcesFormat:'LIANUM_DEVICE_OWNER_RECOVERY_RESOURCES_V1',
    lockFormat:'LIANUM_DEVICE_OWNER_RECOVERY_LOCK_V1',attemptFormat:'LIANUM_DEVICE_OWNER_RECOVERY_ATTEMPT_V1',
    classification:'ORIGINAL_DEVICE_D26_U_S_NATIVE_I84_F_CHANGE_RECOVERY_W39_LOCAL_TLS_NODE_NOT_PHONE',sourcePins:deviceOwnerRecoverySourcePinsV1,
    cleanupKeys:Object.freeze(['closedEvm','closedNativeEvm','closedNativeExecution']),
  }),
  deviceOwnerExecutionV1:Object.freeze({
    entry:join(ROOT,'integration/run-device-owner-execution-v1.mjs'),worker:join(ROOT,'integration/device-owner-execution-flow-v1.mjs'),
    local:join(ROOT,'.local/device-owner-execution-v1'),resultFormat:DEVICE_EXECUTION_RESULT_V1,resourcesFormat:'LIANUM_DEVICE_OWNER_EXECUTION_RESOURCES_V1',
    lockFormat:'LIANUM_DEVICE_OWNER_EXECUTION_LOCK_V1',attemptFormat:'LIANUM_DEVICE_OWNER_EXECUTION_ATTEMPT_V1',
    classification:'ORIGINAL_DEVICE_D26_U_S_NATIVE_T_CHANGE_W39_LOCAL_TLS_NODE_NOT_PHONE',sourcePins:deviceOwnerExecutionSourcePinsV1,
    cleanupKeys:Object.freeze(['closedEvm','closedNativeEvm','closedNativeExecution']),
  }),
  deviceOwnerReservationV1: Object.freeze({
    entry:join(ROOT,'integration/run-device-owner-reservation-v1.mjs'), worker:join(ROOT,'integration/device-owner-reservation-flow-v1.mjs'),
    local:join(ROOT,'.local/device-owner-reservation-v1'),resultFormat:DEVICE_RESERVATION_RESULT_V1,resourcesFormat:'LIANUM_DEVICE_OWNER_RESERVATION_RESOURCES_V1',
    lockFormat:'LIANUM_DEVICE_OWNER_RESERVATION_LOCK_V1',attemptFormat:'LIANUM_DEVICE_OWNER_RESERVATION_ATTEMPT_V1',
    classification:'ORIGINAL_DEVICE_D26_U_S_LOCAL_TLS_NODE_NOT_GRAPH_EXIT_OR_PHONE',sourcePins:deviceOwnerReservationSourcePinsV1,cleanupKeys:Object.freeze(['closedEvm','closedNativeEvm']),
  }),
  deviceOwnerDepositV1: Object.freeze({
    entry: join(ROOT, 'integration/run-device-owner-deposit-v1.mjs'),
    worker: join(ROOT, 'integration/device-owner-deposit-flow-v1.mjs'),
    local: join(ROOT, '.local/device-owner-deposit-v1'),
    resultFormat: DEVICE_DEPOSIT_RESULT_V1, resourcesFormat: 'LIANUM_DEVICE_OWNER_DEPOSIT_RESOURCES_V1',
    lockFormat: 'LIANUM_DEVICE_OWNER_DEPOSIT_LOCK_V1', attemptFormat: 'LIANUM_DEVICE_OWNER_DEPOSIT_ATTEMPT_V1',
    classification: 'ONE_ORIGINAL_DEVICE_OWNED_D26_SYNTHETIC_LOCAL_FUNDING_NOT_PHONE_ACCEPTANCE',
    sourcePins: deviceOwnerDepositSourcePinsV1, cleanupKeys: Object.freeze(['closedEvm', 'closedNativeEvm']),
  }),
  pairedNativeNoteV2: Object.freeze({
    entry: join(ROOT, 'integration/run-paired-native-note-v2.mjs'),
    worker: join(ROOT, 'integration/paired-native-note-flow-v2.mjs'),
    local: join(ROOT, '.local/paired-native-note-v2'),
    resultFormat: PAIRED_NATIVE_NOTE_RESULT_V2,
    resourcesFormat: 'LIANUM_PAIRED_NATIVE_NOTE_RESOURCES_V2',
    lockFormat: 'LIANUM_PAIRED_NATIVE_NOTE_LOCK_V2', attemptFormat: 'LIANUM_PAIRED_NATIVE_NOTE_ATTEMPT_V2',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_PAIRED_ORIGINAL_ACCOUNT_NOTE_V2',
    sourcePins: pairedNativeNoteSourcePinsV2, cleanupKeys: Object.freeze(['closedEvm', 'closedNativeEvm']),
  }),
  nativeClaimEmptyAuditMetrics: Object.freeze({
    entry: join(ROOT, 'integration/claims/metrics/run-native-claim-empty-audit-v1.mjs'),
    worker: join(ROOT, 'integration/claims/metrics/native-claim-empty-audit-v1.mjs'),
    local: join(ROOT, '.local/native-claim-empty-audit-metrics-v1'),
    resultFormat: EMPTY_AUDIT_RESULT, resourcesFormat: 'LIANUM_EMPTY_ORIGINAL_AUDIT_METRICS_RESOURCES_V1',
    lockFormat: 'LIANUM_EMPTY_ORIGINAL_AUDIT_METRICS_LOCK_V1', attemptFormat: 'LIANUM_EMPTY_ORIGINAL_AUDIT_METRICS_ATTEMPT_V1',
    classification: 'BOUNDED_FRESH_EMPTY_ORIGINAL_AUDIT_METRICS_NOT_FINANCIAL_ACCEPTANCE',
    sourcePins: nativeClaimEmptyAuditSourcePins, cleanupKeys: Object.freeze(['closedEvm', 'closedBitcoin', 'closedSolana']),
  }),
  developmentOsakaSmoke: Object.freeze({
    entry: join(ROOT, 'integration/evm/osaka/run-development-osaka-smoke.mjs'),
    worker: join(ROOT, 'integration/evm/osaka/development-osaka-smoke.mjs'),
    local: join(ROOT, '.local/development-osaka-smoke-v1'),
    resultFormat: OSAKA_SMOKE_RESULT, resourcesFormat: 'LIANUM_DEVELOPMENT_OSAKA_SMOKE_RESOURCES_V1',
    lockFormat: 'LIANUM_DEVELOPMENT_OSAKA_SMOKE_LOCK_V1', attemptFormat: 'LIANUM_DEVELOPMENT_OSAKA_SMOKE_ATTEMPT_V1',
    classification: 'BOUNDED_ORIGINAL_OSAKA_DEPLOYMENT_AND_PUBLIC_SYNTHETIC_TRANSFER',
    sourcePins: osakaSmokeSourcePins, cleanupKeys: Object.freeze(['closedEvm']),
  }),
  wrappedDeploymentOnly: Object.freeze({
    entry: join(ROOT, 'integration/run-wrapped-deployment-only-v1.mjs'),
    worker: join(ROOT, 'integration/wrapped-deployment-only-v1.mjs'),
    local: join(ROOT, '.local/wrapped-deployment-only-v1'),
    resultFormat: WRAPPED_DEPLOYMENT_ONLY_RESULT_V1,
    resourcesFormat: 'WRAPPED_DEPLOYMENT_ONLY_RESOURCES_V1', lockFormat: 'WRAPPED_DEPLOYMENT_ONLY_LOCK_V1', attemptFormat: 'WRAPPED_DEPLOYMENT_ONLY_ATTEMPT_V1',
    classification: 'BOUNDED_ORIGINAL_COMBINED_DEPLOYMENT_ONLY_NOT_WALLET_ACCEPTANCE',
    sourcePins: wrappedWalletFixedSourcePinsV1, cleanupKeys: Object.freeze(['closedEvm', 'closedGraphEvm', 'closedBitcoin', 'closedSolana']),
  }),
  nativeClaimBeginPayoutAuditV1: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-begin-payout-audit-v1.mjs'),
    worker: join(ROOT, 'integration/native-claim-flow.mjs'),
    local: join(ROOT, '.local/native-claim-begin-payout-audit-v1'),
    resultFormat: BEGIN_PAYOUT_AUDIT_RESULT_V1,
    resourcesFormat: 'LIANUM_SOL_BEGIN_PAYOUT_AUDIT_RESOURCES_V1',
    lockFormat: 'LIANUM_SOL_BEGIN_PAYOUT_AUDIT_LOCK_V1',
    attemptFormat: 'LIANUM_SOL_BEGIN_PAYOUT_AUDIT_ATTEMPT_V1',
    classification: 'BOUNDED_LOADED_BEGIN_PAYOUT_AUDIT_ONLY_UNRESOLVED_REDEMPTION',
    sourcePins: nativeClaimSourcePins, cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  wrappedWalletFixedAcceptance: Object.freeze({
    entry: join(ROOT, 'integration/run-wrapped-wallet-fixed-acceptance-v1.mjs'),
    worker: join(ROOT, 'integration/wrapped-wallet-fixed-acceptance-v1.mjs'),
    local: join(ROOT, '.local/wrapped-wallet-fixed-acceptance-v1'),
    resultFormat: WRAPPED_WALLET_FIXED_RESULT_V1,
    resourcesFormat: 'WRAPPED_WALLET_FIXED_RESOURCES_V1', lockFormat: 'WRAPPED_WALLET_FIXED_LOCK_V1', attemptFormat: 'WRAPPED_WALLET_FIXED_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_VALUE_WRAPPED_WALLET_ACCEPTANCE',
    sourcePins: wrappedWalletFixedSourcePinsV1, cleanupKeys: Object.freeze(['closedEvm', 'closedGraphEvm', 'closedBitcoin', 'closedSolana']),
  }),
  wrappedWalletFixedPreflight: Object.freeze({
    entry: join(ROOT, 'integration/run-wrapped-wallet-fixed-preflight-v1.mjs'),
    worker: join(ROOT, 'integration/wrapped-wallet-fixed-preflight-v1.mjs'),
    local: join(ROOT, '.local/wrapped-wallet-fixed-preflight-v1'),
    resultFormat: WRAPPED_WALLET_FIXED_PREFLIGHT_RESULT_V1,
    resourcesFormat: 'WRAPPED_WALLET_FIXED_PREFLIGHT_RESOURCES_V1', lockFormat: 'WRAPPED_WALLET_FIXED_PREFLIGHT_LOCK_V1', attemptFormat: 'WRAPPED_WALLET_FIXED_PREFLIGHT_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_VALUE_WRAPPED_WALLET_PREFLIGHT',
    sourcePins: wrappedWalletFixedSourcePinsV1, cleanupKeys: Object.freeze(['closedEvm', 'closedGraphEvm', 'closedBitcoin', 'closedSolana']),
  }),

  nativeWalletTronDevV5:Object.freeze({entry:join(ROOT,'integration/run-native-wallet-tron-dev-v5.mjs'),
   worker:join(ROOT,'integration/native-wallet-tron-dev-v5.mjs'),local:join(ROOT,'.local/native-wallet-tron-dev-v5'),
   resultFormat:NATIVE_WALLET_TRON_DEV_RESULT_V5,resourcesFormat:'NATIVE_WALLET_TRON_DEV_RESOURCES_V5',
   lockFormat:'NATIVE_WALLET_TRON_DEV_LOCK_V5',attemptFormat:'NATIVE_WALLET_TRON_DEV_ATTEMPT_V5',
   classification:'BOUNDED_LOCAL_ORIGINAL_TRON_PRIVATE_WALLET_GRAPH_V5',sourcePins:nativeWalletTronDevSourcePinsV5,
   cleanupKeys:Object.freeze(['closedEvm','closedNativeTron']),
  }),
  nativeWalletRealAcceptance: Object.freeze({
    entry: join(ROOT, 'integration/run-native-wallet-real-acceptance-v1.mjs'),
    worker: join(ROOT, 'integration/native-wallet-real-acceptance-v1.mjs'),
    local: join(ROOT, '.local/native-wallet-real-acceptance-v1'),
    resultFormat: NATIVE_WALLET_RESULT_V1,
    resourcesFormat: 'NATIVE_WALLET_REAL_ACCEPTANCE_RESOURCES_V1',
    lockFormat: 'NATIVE_WALLET_REAL_ACCEPTANCE_LOCK_V1',
    attemptFormat: 'NATIVE_WALLET_REAL_ACCEPTANCE_ATTEMPT_V1',
    classification: 'BOUNDED_GENUINE_LOCAL_EVM_NATIVE_WALLET_ACCEPTANCE',
    sourcePins: nativeWalletRealSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedNativeEvm']),
  }),
  nativeWalletRealPreflight: Object.freeze({
    entry: join(ROOT, 'integration/run-native-wallet-real-preflight-v1.mjs'),
    worker: join(ROOT, 'integration/native-wallet-real-preflight-v1.mjs'),
    local: join(ROOT, '.local/native-wallet-real-preflight-v1'),
    resultFormat: NATIVE_WALLET_PREFLIGHT_RESULT_V1,
    resourcesFormat: 'NATIVE_WALLET_REAL_PREFLIGHT_RESOURCES_V1',
    lockFormat: 'NATIVE_WALLET_REAL_PREFLIGHT_LOCK_V1',
    attemptFormat: 'NATIVE_WALLET_REAL_PREFLIGHT_ATTEMPT_V1',
    classification: 'BOUNDED_GENUINE_LOCAL_EVM_NATIVE_WALLET_PREFLIGHT',
    sourcePins: nativeWalletRealSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedNativeEvm']),
  }),
  poolGenerationPhase1: Object.freeze({
    entry: join(ROOT, 'integration/run-pool-generation-phase1.mjs'),
    worker: join(ROOT, 'integration/pool-generation-phase1.mjs'),
    local: join(ROOT, '.local/pool-generation-phase1'),
    resultFormat: PHASE1_FORMAT,
    resourcesFormat: 'FLAT_POOL_GENERATION_PHASE1_RESOURCES_V1',
    lockFormat: 'FLAT_POOL_GENERATION_PHASE1_LOCK_V1',
    attemptFormat: 'FLAT_POOL_GENERATION_PHASE1_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_VALUE_POOL_GENERATION_PHASE1',
    sourcePins: poolGenerationSourcePins, cleanupKeys: Object.freeze(['closedEvm']),
  }),
  poolGenerationPhase2: Object.freeze({
    entry: join(ROOT, 'integration/run-pool-generation-phase2.mjs'),
    worker: join(ROOT, 'integration/pool-generation-phase2.mjs'),
    local: join(ROOT, '.local/pool-generation-phase2'),
    resultFormat: PHASE2_FORMAT,
    resourcesFormat: 'FLAT_POOL_GENERATION_PHASE2_RESOURCES_V1',
    lockFormat: 'FLAT_POOL_GENERATION_PHASE2_LOCK_V1',
    attemptFormat: 'FLAT_POOL_GENERATION_PHASE2_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_VALUE_POOL_GENERATION_PHASE2',
    sourcePins: poolGenerationSourcePins, cleanupKeys: Object.freeze(['closedEvm']),
  }),
  nativeClaimLoadedV3: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-loaded-v3-flow.mjs'),
    worker: join(ROOT, 'integration/native-claim-flow.mjs'),
    local: join(ROOT, '.local/native-claim-loaded-v3-flow'),
    resultFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_CLAIM_LOADED_V3_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_CLAIM_LOADED_V3_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_CLAIM_LOADED_V3_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_NATIVE_CLAIM_LOADED_REDEMPTION_INGRESS_V3',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeClaimGraphV3: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-graph-v3-flow.mjs'),
    worker: join(ROOT, 'integration/native-claim-flow.mjs'),
    local: join(ROOT, '.local/native-claim-graph-v3-flow'),
    resultFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_CLAIM_GRAPH_V3_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_CLAIM_GRAPH_V3_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_CLAIM_GRAPH_V3_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_NATIVE_CLAIM_GRAPH_INGRESS_V3',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeIngressV3ProductionPreflight: Object.freeze({
    entry: join(ROOT, 'integration/run-native-ingress-v3-production-preflight.mjs'),
    worker: join(ROOT, 'integration/native-ingress-v3-production-preflight-worker.mjs'),
    local: join(ROOT, '.local/native-ingress-v3-production-preflight'),
    resultFormat: PRODUCTION_PREFLIGHT_RESULT,
    resourcesFormat: 'LIANUM_NATIVE_INGRESS_V3_PRODUCTION_PREFLIGHT_RESOURCES_V1',
    lockFormat: 'LIANUM_NATIVE_INGRESS_V3_PRODUCTION_PREFLIGHT_LOCK_V1',
    attemptFormat: 'LIANUM_NATIVE_INGRESS_V3_PRODUCTION_PREFLIGHT_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_ZERO_DEPOSIT_ONE_PRODUCTION_ROLE_PROOF',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeIngressV3Preflight: Object.freeze({
    entry: join(ROOT, 'integration/run-native-ingress-v3-preflight.mjs'),
    worker: join(ROOT, 'integration/native-ingress-v3-preflight-worker.mjs'),
    local: join(ROOT, '.local/native-ingress-v3-preflight'),
    resultFormat: PREFLIGHT_RESULT,
    resourcesFormat: 'LIANUM_NATIVE_INGRESS_V3_PREFLIGHT_RESOURCES_V1',
    lockFormat: 'LIANUM_NATIVE_INGRESS_V3_PREFLIGHT_LOCK_V1',
    attemptFormat: 'LIANUM_NATIVE_INGRESS_V3_PREFLIGHT_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_ZERO_USER_DEPOSIT_INGRESS_V3_PREFLIGHT',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeClaimUnfundedHealth: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-unfunded-health.mjs'),
    worker: join(ROOT, 'integration/native-claim-unfunded-health-worker.mjs'),
    local: join(ROOT, '.local/native-claim-unfunded-health'),
    resultFormat: UNFUNDED_HEALTH_RESULT,
    resourcesFormat: 'FLAT_WALLET_UNFUNDED_CLAIM_HEALTH_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_UNFUNDED_CLAIM_HEALTH_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_UNFUNDED_CLAIM_HEALTH_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_UNFUNDED_CLAIM_HEALTH_ONLY',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeClaims: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-flow.mjs'),
    worker: join(ROOT, 'integration/native-claim-flow.mjs'),
    local: join(ROOT, '.local/native-claim-flow'),
    resultFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_NATIVE_CLAIM_FLOW',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeClaimGraph: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-graph-flow.mjs'),
    worker: join(ROOT, 'integration/native-claim-flow.mjs'),
    local: join(ROOT, '.local/native-claim-graph-flow'),
    resultFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_NATIVE_CLAIM_GRAPH_FLOW',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  nativeClaimLoadedFacts: Object.freeze({
    entry: join(ROOT, 'integration/run-native-claim-loaded-facts-probe.mjs'),
    worker: join(ROOT, 'integration/native-claim-flow.mjs'),
    local: join(ROOT, '.local/native-claim-loaded-facts-probe'),
    resultFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_LOADED_FACTS_PROBE_ONLY',
    sourcePins: nativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  manualWallet: Object.freeze({
    entry: join(ROOT, 'integration/run-manual-wallet-acceptance.mjs'),
    worker: join(ROOT, 'integration/manual-wallet-acceptance.mjs'),
    local: join(ROOT, '.local/manual-wallet-acceptance'),
    resultFormat: 'FLAT_MANUAL_WALLET_ACCEPTANCE_RESULT_V1',
    resourcesFormat: 'FLAT_MANUAL_WALLET_ACCEPTANCE_RESOURCES_V1',
    lockFormat: 'FLAT_MANUAL_WALLET_ACCEPTANCE_LOCK_V1',
    attemptFormat: 'FLAT_MANUAL_WALLET_ACCEPTANCE_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_MANUAL_EXACT_CATALOGUE_WALLET',
    sourcePins: manualWalletSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  manualWalletBrowser: Object.freeze({
    entry: join(ROOT, 'integration/run-manual-wallet-browser-acceptance.mjs'),
    worker: join(ROOT, 'integration/manual-wallet-browser-acceptance.mjs'),
    local: join(ROOT, '.local/manual-wallet-browser-acceptance'),
    resultFormat: MANUAL_WALLET_BROWSER_FORMAT,
    resourcesFormat: 'FLAT_MANUAL_WALLET_BROWSER_RESOURCES_V1',
    lockFormat: 'FLAT_MANUAL_WALLET_BROWSER_LOCK_V1',
    attemptFormat: 'FLAT_MANUAL_WALLET_BROWSER_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_SCRIPTED_DOM_EXACT_CATALOGUE_WALLET',
    sourcePins: manualWalletBrowserSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  manualWalletBrowserRecovery: Object.freeze({
    entry: join(ROOT, 'integration/run-manual-wallet-browser-timeout-recovery.mjs'),
    worker: join(ROOT, 'integration/manual-wallet-browser-timeout-recovery.mjs'),
    local: join(ROOT, '.local/manual-wallet-browser-timeout-recovery'),
    resultFormat: MANUAL_WALLET_BROWSER_RECOVERY_FORMAT,
    resourcesFormat: 'FLAT_MANUAL_WALLET_BROWSER_TIMEOUT_RECOVERY_RESOURCES_V1',
    lockFormat: 'FLAT_MANUAL_WALLET_BROWSER_TIMEOUT_RECOVERY_LOCK_V1',
    attemptFormat: 'FLAT_MANUAL_WALLET_BROWSER_TIMEOUT_RECOVERY_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_SCRIPTED_DOM_EXACT_ORIGINAL_TIMEOUT_F',
    sourcePins: manualWalletBrowserRecoverySourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  manualWalletRecovery: Object.freeze({
    entry: join(ROOT, 'integration/run-manual-wallet-timeout-recovery.mjs'),
    worker: join(ROOT, 'integration/manual-wallet-timeout-recovery.mjs'),
    local: join(ROOT, '.local/manual-wallet-timeout-recovery'),
    resultFormat: 'FLAT_MANUAL_WALLET_TIMEOUT_RECOVERY_RESULT_V1',
    resourcesFormat: 'FLAT_MANUAL_WALLET_TIMEOUT_RECOVERY_RESOURCES_V1',
    lockFormat: 'FLAT_MANUAL_WALLET_TIMEOUT_RECOVERY_LOCK_V1',
    attemptFormat: 'FLAT_MANUAL_WALLET_TIMEOUT_RECOVERY_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_MANUAL_EXACT_ORIGINAL_TIMEOUT_F',
    sourcePins: manualWalletSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  developmentBtcSplJupiterV1:Object.freeze({entry:join(ROOT,'integration/claims/development/run-development-btc-spl-jupiter-flow-v1.mjs'),worker:join(ROOT,'integration/claims/development/development-btc-spl-jupiter-flow-v1.mjs'),local:join(ROOT,'.local/development-btc-spl-jupiter-v1'),resultFormat:DEVELOPMENT_BTC_SPL_GRAPH_RESULT,resourcesFormat:'LIANUM_DEVELOPMENT_BTC_SPL_JUPITER_RESOURCES_V1',lockFormat:'LIANUM_DEVELOPMENT_BTC_SPL_JUPITER_LOCK_V1',attemptFormat:'LIANUM_DEVELOPMENT_BTC_SPL_JUPITER_ATTEMPT_V1',classification:'BOUNDED_LOCAL_PRIVATE_CBTC_SOURCE_SOL_JUPITER_USDC_CUSTODY_V1',sourcePins:developmentBtcSplJupiterSourcePinsV1,cleanupKeys:Object.freeze(['closedEvm','closedBitcoin','closedSolana'])}),
  developmentBtcSolGraph: Object.freeze({
    entry: join(ROOT, 'integration/claims/development/run-development-btc-sol-graph-flow.mjs'),
    worker: join(ROOT, 'integration/claims/development/development-btc-sol-graph-flow.mjs'),
    local: join(ROOT, '.local/development-btc-sol-graph-v1'),
    resultFormat: DEVELOPMENT_BTC_SOL_GRAPH_RESULT, resourcesFormat: 'LIANUM_DEVELOPMENT_BTC_SOL_GRAPH_RESOURCES_V1',
    lockFormat: 'LIANUM_DEVELOPMENT_BTC_SOL_GRAPH_LOCK_V1', attemptFormat: 'LIANUM_DEVELOPMENT_BTC_SOL_GRAPH_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_PRIVATE_CBTC_INVOICE_SOL_DELIVERY_V1', sourcePins: developmentBtcSolGraphSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedBitcoin', 'closedSolana']),
  }),
  developmentNativeClaims: Object.freeze({
    entry: join(ROOT, 'integration/claims/development/run-development-native-claim-flow.mjs'),
    worker: join(ROOT, 'integration/claims/development/development-native-claim-flow.mjs'),
    local: join(ROOT, '.local/development-native-claim-roundtrip-v1'),
    resultFormat: DEVELOPMENT_NATIVE_CLAIM_RESULT, resourcesFormat: 'LIANUM_DEVELOPMENT_NATIVE_CLAIM_RESOURCES_V1',
    lockFormat: 'LIANUM_DEVELOPMENT_NATIVE_CLAIM_LOCK_V1', attemptFormat: 'LIANUM_DEVELOPMENT_NATIVE_CLAIM_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_PRIVATE_NATIVE_CLAIM_ROUNDTRIPS_V1', sourcePins: developmentNativeClaimSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedBitcoin', 'closedSolana']),
  }),
  developmentDefiEntry: Object.freeze({
    entry: join(ROOT, 'integration/defi/entry/run-development-defi-entry-flow.mjs'),
    worker: join(ROOT, 'integration/defi/entry/development-defi-entry-flow.mjs'),
    local: join(ROOT, '.local/development-defi-entry-roundtrip-v1'),
    resultFormat: DEVELOPMENT_DEFI_ENTRY_RESULT, resourcesFormat: 'LIANUM_DEVELOPMENT_DEFI_ENTRY_RESOURCES_V1',
    lockFormat: 'LIANUM_DEVELOPMENT_DEFI_ENTRY_LOCK_V1', attemptFormat: 'LIANUM_DEVELOPMENT_DEFI_ENTRY_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_PUBLIC_INPUT_PRIVATE_DEFI_ENTRY_EXIT_V1', sourcePins: developmentDefiEntrySourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  privateMetaMorpho: Object.freeze({
    entry: join(ROOT, 'integration/defi/run-private-metamorpho-flow.mjs'),
    worker: join(ROOT, 'integration/defi/private-metamorpho-flow.mjs'),
    local: join(ROOT, '.local/private-metamorpho-flow'),
    resultFormat: PRIVATE_METAMORPHO_FLOW_RESULT, resourcesFormat: 'LIANUM_PRIVATE_METAMORPHO_RESOURCES_V1',
    lockFormat: 'LIANUM_PRIVATE_METAMORPHO_LOCK_V1', attemptFormat: 'LIANUM_PRIVATE_METAMORPHO_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_PRIVATE_METAMORPHO', sourcePins: privateMetaMorphoSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  evmVault: Object.freeze({
    entry: join(ROOT, 'integration/run-evm-vault-flow.mjs'),
    worker: join(ROOT, 'integration/evm-vault-flow.mjs'),
    local: join(ROOT, '.local/evm-vault-flow'),
    resultFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_EVM_VAULT_FLOW',
    sourcePins: evmVaultSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  evmUniswap: Object.freeze({
    entry: join(ROOT, 'integration/run-evm-uniswap-flow.mjs'),
    worker: join(ROOT, 'integration/evm-vault-flow.mjs'),
    local: join(ROOT, '.local/evm-uniswap-flow'),
    resultFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_EVM_UNISWAP_FLOW',
    sourcePins: evmVaultSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  evmAave: Object.freeze({
    entry: join(ROOT, 'integration/run-evm-aave-flow.mjs'),
    worker: join(ROOT, 'integration/evm-vault-flow.mjs'),
    local: join(ROOT, '.local/evm-aave-flow-v1'),
    resultFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_PRIVATE_AAVE_STATIC_GRAPH_V1',
    sourcePins: aavePrivateGraphSourcePinsV1,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  evmMetaMorphoRecoveryV1:Object.freeze({
    entry:join(ROOT,'integration/run-evm-metamorpho-recovery-flow-v1.mjs'),worker:join(ROOT,'integration/evm-vault-flow.mjs'),
    local:join(ROOT,'.local/evm-metamorpho-recovery-v1'),resultFormat:EVM_METAMORPHO_RECOVERY_RESULT_V1,
    resourcesFormat:'FLAT_WALLET_EVM_VAULT_FLOW_RESOURCES_V1',lockFormat:'FLAT_WALLET_EVM_VAULT_FLOW_LOCK_V1',
    attemptFormat:'FLAT_WALLET_EVM_VAULT_FLOW_ATTEMPT_V1',classification:'BOUNDED_LOCAL_FAKE_FUNDS_METAMORPHO_ORIGINAL_F_V1',
    sourcePins:evmMetaMorphoRecoverySourcePinsV1,cleanupKeys:Object.freeze(['closedEvm']),
  }),
  evmUniswapRecovery: Object.freeze({
    entry: join(ROOT, 'integration/run-evm-uniswap-recovery-flow.mjs'),
    worker: join(ROOT, 'integration/evm-vault-flow.mjs'),
    local: join(ROOT, '.local/evm-uniswap-recovery-flow'),
    resultFormat: EVM_UNISWAP_RECOVERY_RESULT,
    resourcesFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_EVM_VAULT_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_EVM_UNISWAP_ORIGINAL_F_RECOVERY',
    sourcePins: evmVaultSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
  nativeFlow: Object.freeze({
    entry: join(ROOT, 'integration/run-native-flow.mjs'),
    worker: join(ROOT, 'integration/native-flow.mjs'),
    local: join(ROOT, '.local/native-flow'),
    resultFormat: 'FLAT_WALLET_NATIVE_FLOW_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_NATIVE_FLOW_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_NATIVE_FLOW_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_NATIVE_FLOW_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_NATIVE_FLOW',
    sourcePins: nativeFlowSourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  accountRecovery: Object.freeze({
    entry: join(ROOT, 'integration/run-account-recovery.mjs'),
    worker: join(ROOT, 'integration/account-recovery.mjs'),
    local: join(ROOT, '.local/account-recovery'),
    resultFormat: 'FLAT_WALLET_ACCOUNT_RECOVERY_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_ACCOUNT_RECOVERY_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_ACCOUNT_RECOVERY_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_ACCOUNT_RECOVERY_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_ACCOUNT_RECOVERY',
    sourcePins: accountRecoverySourcePins,
    cleanupKeys: Object.freeze(['closedEvm', 'closedSolana', 'closedBitcoin']),
  }),
  assetPortfolio: Object.freeze({
    entry: join(ROOT, 'integration/run-asset-portfolio.mjs'),
    worker: join(ROOT, 'integration/asset-portfolio.mjs'),
    local: join(ROOT, '.local/asset-portfolio'),
    resultFormat: 'FLAT_WALLET_ASSET_PORTFOLIO_RESULT_V1',
    resourcesFormat: 'FLAT_WALLET_ASSET_PORTFOLIO_RESOURCES_V1',
    lockFormat: 'FLAT_WALLET_ASSET_PORTFOLIO_LOCK_V1',
    attemptFormat: 'FLAT_WALLET_ASSET_PORTFOLIO_ATTEMPT_V1',
    classification: 'BOUNDED_LOCAL_FAKE_FUNDS_ASSET_PORTFOLIO',
    sourcePins: assetPortfolioSourcePins,
    cleanupKeys: Object.freeze(['closedEvm']),
  }),
});
function assertFixedProfile(profile) {
  assert.ok(Object.values(FLOW_PROFILES).includes(profile),
    'NATIVE_FIXED_FLOW_PROFILE');
}
const CLEAN_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' });
const HASH = data => createHash('sha256').update(data).digest('hex');
const live = process => !/^[ZX]$/.test(process.state) || (process.liveThreadCount ?? 0) > 0;
const METRICS = Object.freeze(['availableRAMBytes', 'freeDiskBytes', 'supervisorRSSBytes',
  'mainWorkerRSSBytes', 'descendantRSSBytes', 'ownedGroupRSSBytes', 'maximumProofWorkerRSSBytes']);
export const NATIVE_FLOW_LIMITS = Object.freeze({
  minimumAvailableRAMBytes: PRIVATE_RESOURCE_FLOORS.availableRAM,
  minimumFreeDiskBytes: PRIVATE_RESOURCE_FLOORS.freeDisk,
  maximumProofOrMainRSSBytes: PRIVATE_PROOF_WORKER_RSS_LIMIT,
  sampleMilliseconds: PRIVATE_RESOURCE_POLICY.externalSampleMilliseconds,
  totalMilliseconds: 90 * 60 * 1000,
  cleanupReserveMilliseconds: 15000,
  killGraceMilliseconds: PROOF_LIMITS.killGraceMilliseconds,
  maximumOutputBytes: 4 * 1024 * 1024,
  maximumResultBytes: 8 * 1024 * 1024,
});

function integer(value) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, 'NATIVE_RESOURCE_INTEGER');
  return value;
}
function safeCode(error) {
  return typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
    ? error.code : 'UNCLASSIFIED_ERROR';
}
function failureCode(error) {
  return typeof error?.message === 'string' && /^(?:NATIVE|ENVELOPE|PW)_[A-Z0-9_]{1,100}$/.test(error.message)
    ? error.message : 'NATIVE_SUPERVISOR_ERROR';
}

// Fixed cold-flow diagnostic vocabulary. Error shape/prefix is never a
// license to publish an arbitrary string or evaluate an exception getter.
const WRAPPED_COLD_SYSTEM_CODES_V1=new Set(["EACCES", "EAGAIN", "EBUSY", "ECONNREFUSED", "ECONNRESET", "EDQUOT", "EEXIST", "EINTR", "EIO", "EMFILE", "ENFILE", "ENOENT", "ENOMEM", "ENOSPC", "ENOSYS", "EPERM", "EPIPE", "EROFS", "ESRCH", "ETIMEDOUT", "ERR_ASSERTION", "ERR_INVALID_ARG_TYPE", "ERR_INVALID_ARG_VALUE", "ERR_IPC_CHANNEL_CLOSED", "ERR_OUT_OF_RANGE", "ERR_STREAM_DESTROYED"]);
const WRAPPED_COLD_FAILURE_CODES_V1=new Set(["NATIVE_ATTEMPT_ALREADY_EXISTS", "NATIVE_CLAIM_NO_SUPERVISOR_OPTIONS", "NATIVE_CLEANUP_DEADLINE", "NATIVE_DEADLINE_CLEANUP_RESERVE", "NATIVE_DISK_FLOOR", "NATIVE_DISK_MEASUREMENT_RANGE", "NATIVE_DISK_POLICY_UNCHANGED", "NATIVE_ENTRY_SYMLINK", "NATIVE_EVIDENCE_WRITE_FAILURE", "NATIVE_EXACT_SUPERVISOR_ENTRY", "NATIVE_EXITED_CLASSIFICATION_NONLIVE", "NATIVE_FINAL_RESOURCE_MEASUREMENT_FAILURE", "NATIVE_FIXED_FLOW_PROFILE", "NATIVE_FIXED_OUTPUT_DIRECTORY", "NATIVE_FLOW_LOCK_BUSY", "NATIVE_FOREIGN_OR_STALE_HEAVY_LOCK", "NATIVE_GROUP_CONTINUITY_UNCONFIRMED", "NATIVE_GROUP_MEMBERSHIP_SCAN_INCOMPLETE", "NATIVE_GROUP_SESSION_CHANGED", "NATIVE_HASH_CONFORMANCE_LOCK", "NATIVE_HEAVY_LOCK_OWNER_CHANGED", "NATIVE_HEAVY_LOCK_OWNER_INVALID", "NATIVE_INITIALIZATION_DEADLINE", "NATIVE_LINUX_ONLY", "NATIVE_LOADED_FACTS_INCOMPLETE", "NATIVE_LOADED_FACTS_LIABILITIES", "NATIVE_LOADED_FACTS_PROOFS", "NATIVE_LOADED_FACTS_RESULT_PROFILE", "NATIVE_LOADED_FACTS_SCOPE", "NATIVE_LOCK_ATTEMPT_CHANGED", "NATIVE_LOCK_IDENTITY_CHANGED", "NATIVE_LOCK_OWNER_CHANGED", "NATIVE_LOCK_RELEASE_FAILURE", "NATIVE_LOCK_RUN_CHANGED", "NATIVE_LOCK_START_CHANGED", "NATIVE_MAIN_WORKER_RSS_LIMIT", "NATIVE_MEASURED_PROCESS_CHANGED", "NATIVE_MEMAVAILABLE_FLOOR", "NATIVE_MEMAVAILABLE_UNAVAILABLE", "NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS", "NATIVE_NO_CALLER_ARGUMENTS", "NATIVE_NO_NODE_ARGUMENTS", "NATIVE_NO_NODE_INJECTION", "NATIVE_NO_SUPERVISOR_OPTIONS", "NATIVE_OTHER_APPLICATION_LOCK", "NATIVE_OTHER_INTEGRATION_LOCK", "NATIVE_OUTPUT_ANCESTOR_DIRECTORY", "NATIVE_OUTPUT_ANCESTOR_SYMLINK", "NATIVE_OUTPUT_DIRECTORY_SYMLINK", "NATIVE_OWNED_GROUP_CLEANUP_UNCONFIRMED", "NATIVE_OWNED_GROUP_ID", "NATIVE_OWNED_GROUP_SIGNAL_FAILURE", "NATIVE_OWNED_RSS_UNAVAILABLE", "NATIVE_PRIVATE_OUTPUT_DIRECTORY", "NATIVE_PROOF_WORKER_RSS_LIMIT", "NATIVE_RAM_POLICY_UNCHANGED", "NATIVE_REPOSITORY_CWD_REQUIRED", "NATIVE_REPOSITORY_SYMLINK", "NATIVE_RESOURCE_INTEGER", "NATIVE_RESOURCE_MONITOR_FAILURE", "NATIVE_RESULT_FAKE_FUNDS_ONLY", "NATIVE_RESULT_FORMAT", "NATIVE_RESULT_LOCAL_ONLY", "NATIVE_RESULT_PHASE", "NATIVE_RESULT_PUBLIC_NETWORK", "NATIVE_RESULT_RUNTIME_CLEANUP", "NATIVE_RESULT_RUN_BINDING", "NATIVE_RESULT_SOURCE_BINDING", "NATIVE_RESULT_SUCCESS", "NATIVE_RESULT_SUPERVISOR_BINDING", "NATIVE_RESULT_WORKER_BINDING", "NATIVE_RSS_POLICY_UNCHANGED", "NATIVE_RUN_ID", "NATIVE_SAMPLE_POLICY_UNCHANGED", "NATIVE_SIGNAL_IDENTITY_CHANGED", "NATIVE_SIGNAL_IDENTITY_UNCONFIRMED", "NATIVE_SIGNAL_OWNERSHIP_UNCONFIRMED", "NATIVE_SOURCE_CLOSURE_CHANGED", "NATIVE_SUPERVISOR_ERROR", "NATIVE_SUPERVISOR_FAILURE", "NATIVE_SUPERVISOR_IDENTITY", "NATIVE_SUPERVISOR_RSS_LIMIT", "NATIVE_SUPERVISOR_SIGINT", "NATIVE_SUPERVISOR_SIGTERM", "NATIVE_SUPERVISOR_UNCAUGHT_EXCEPTION", "NATIVE_SUPERVISOR_UNHANDLED_REJECTION", "NATIVE_TOTAL_DEADLINE", "NATIVE_UNFUNDED_NO_SUPERVISOR_OPTIONS", "NATIVE_UNFUNDED_RUN_REQUIRES_FROZEN_CHECKPOINT", "NATIVE_WALLET_NO_SUPERVISOR_OPTIONS", "NATIVE_WALLET_REAL_ACCEPTANCE_ATTEMPT_V1", "NATIVE_WALLET_REAL_ACCEPTANCE_LOCK_V1", "NATIVE_WALLET_REAL_ACCEPTANCE_RESOURCES_V1", "NATIVE_WALLET_REAL_PREFLIGHT_ATTEMPT_V1", "NATIVE_WALLET_REAL_PREFLIGHT_LOCK_V1", "NATIVE_WALLET_REAL_PREFLIGHT_RESOURCES_V1", "NATIVE_WALLET_REAL_RELEASE_ABSENT", "NATIVE_WALLET_UNFUNDED_PROOF_FORBIDDEN", "NATIVE_WALLET_UNFUNDED_RELEASE_ABSENT", "NATIVE_WORKER_CLOSE_FAILURE", "NATIVE_WORKER_EXITED_WITH_LIVE_DESCENDANTS", "NATIVE_WORKER_EXIT_FAILURE", "NATIVE_WORKER_EXIT_OR_CLOSE_NOT_OBSERVED", "NATIVE_WORKER_IDENTITY_CHANGED", "NATIVE_WORKER_IDENTITY_UNOBSERVED", "NATIVE_WORKER_MISSING", "NATIVE_WORKER_NOT_STARTED", "NATIVE_WORKER_OUTPUT_ERROR", "NATIVE_WORKER_OUTPUT_LIMIT", "NATIVE_WORKER_REPORTED_FAILURE", "NATIVE_WORKER_REPORTED_UNCLASSIFIED_FAILURE", "NATIVE_WORKER_RESULT_MALFORMED", "NATIVE_WORKER_RESULT_MISSING", "NATIVE_WORKER_RESULT_REJECTED", "NATIVE_WORKER_SPAWN_OR_PROCESS_ERROR", "NATIVE_WORKER_START_IDENTITY", "NATIVE_WORKER_SYMLINK", "WRAPPED_COLD_CYCLE_NOT_RELEASED", "WRAPPED_COLD_ORIGINAL_CLAIM_CHANGED", "WRAPPED_COLD_ORIGINAL_CLAIM_REQUIRED", "WRAPPED_COLD_ORIGINAL_DEADLINE", "WRAPPED_COLD_ORIGINAL_GRANT_UNAVAILABLE", "WRAPPED_COLD_ORIGINAL_WORKER_CHANGED", "WRAPPED_COLD_PREPRINCIPAL_PROOF_FORBIDDEN", "WRAPPED_COLD_PRIOR_GROUP_NOT_GONE", "WRAPPED_COLD_PRIVATE_FILE"]);
function wrappedColdOwnErrorDataV1(error,name){try{if(!error||!['object','function'].includes(typeof error)||coldErrorTypesV1.isProxy(error))return undefined;const d=Object.getOwnPropertyDescriptor(error,name);return d&&Object.hasOwn(d,'value')?d.value:undefined;}catch{return undefined;}}
export function wrappedColdPublicErrorCodeV1(error){const code=wrappedColdOwnErrorDataV1(error,'code');return WRAPPED_COLD_SYSTEM_CODES_V1.has(code)?code:'UNCLASSIFIED_ERROR';}
export function wrappedColdPublicFailureCodeV1(error){const code=wrappedColdOwnErrorDataV1(error,'message');return WRAPPED_COLD_FAILURE_CODES_V1.has(code)?code:'NATIVE_SUPERVISOR_ERROR';}

function ensureDirectory(path, profile) {
  assertFixedProfile(profile);
  assert.ok(path === join(ROOT, '.local') || path === profile.local || path.startsWith(profile.local + sep),
    'NATIVE_FIXED_OUTPUT_DIRECTORY');
  const missing = []; let ancestor = path;
  while (!existsSync(ancestor)) { missing.push(ancestor); ancestor = dirname(ancestor); }
  assert.equal(realpathSync(ancestor), ancestor, 'NATIVE_OUTPUT_ANCESTOR_SYMLINK');
  assert.ok(lstatSync(ancestor).isDirectory(), 'NATIVE_OUTPUT_ANCESTOR_DIRECTORY');
  for (const directory of missing.reverse()) mkdirSync(directory, { mode: 0o700 });
  assert.equal(realpathSync(path), path, 'NATIVE_OUTPUT_DIRECTORY_SYMLINK');
  const stat = lstatSync(path);
  assert.ok(stat.isDirectory() && (stat.mode & 0o077) === 0, 'NATIVE_PRIVATE_OUTPUT_DIRECTORY');
}
function writeExclusive(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); return fstatSync(fd); }
  finally { closeSync(fd); }
}
const json = value => JSON.stringify(value, null, 2) + '\n';

export function assertNativeFlowRunId(value) {
  assert.ok(typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),
  'NATIVE_RUN_ID');
  return value;
}

/** Pure /proc parser used by the monitor and isolated tests. Names in stat may
 * contain spaces and parentheses; never split the comm field on whitespace. */

const sameIdentity = (a, b) => a && b && a.pid === b.pid && a.startTimeTicks === b.startTimeTicks;

/** Labels only: no executable, signal target or source path is selected here.
 * The V3 role owns coordination and supervision; only its backend is heavy.
 * run-bounded.mjs is import-only and intentionally has no executable identity. */
/** Fixed executable labels only. The existing shared proof lock remains the
 * owner; the native I84 backend is included in its same one-heavy-worker/RSS bound. */
export function classifyNativeWalletRealExecutable(script) {
  if(script===join(ROOT,'proof-workers/native-value-dev-live-v5-role-process.mjs'))
    return {role:'native-value-dev-live-v5-proof-role',proofWorker:false};
  if(script===join(ROOT,'proof-workers/native-value-dev-live-v5-worker.mjs'))
    return {role:'native-value-dev-live-v5-proof-worker',proofWorker:true};
  if (script === join(ROOT, 'proof-workers/native-value-live-v2-role-process.mjs'))
    return { role: 'native-value-live-v2-proof-role', proofWorker: false };
  if (script === join(ROOT, 'proof-workers/native-value-live-v2-worker.mjs'))
    return { role: 'native-value-live-v2-proof-worker', proofWorker: true };
  if (script === join(ROOT, 'mobile-core/native-value-owner-process-v2.mjs'))
    return { role: 'native-value-owner-role', proofWorker: false };
  return null;
}
export function classifyNativeIngressV3Executable(script) {
  if (script === join(ROOT, 'proof-workers/native-ingress-v3-role-process.mjs'))
    return { role: 'native-ingress-v3-proof-role', proofWorker: false };
  if (script === join(ROOT, 'proof-workers/native-ingress-v3-worker.mjs'))
    return { role: 'native-ingress-v3-proof-worker', proofWorker: true };
  return null;
}

/** Unfunded profile may hash inside its original owner, but never launch a
 * proof role/backend. It shares the original process-group ownership sampler. */
export function nativeWalletUnfundedProcessFailure(processes) {
  return processes.some(item => item.proofWorker || ['native-value-live-v2-proof-role','native-value-dev-live-v5-proof-role', 'flat-proof-role',
    'economic-note-native-coordinator','native-ingress-v3-proof-role','flat-node-native-coordinator','flat-reservation-native-coordinator','flat-authorization-native-coordinator','native-value-dev-live-v5-native-coordinator'].includes(item.role)) ? 'NATIVE_WALLET_UNFUNDED_PROOF_FORBIDDEN' : null;
}

/** Source-only helper: rejects observed proof processes in the original
 * pre-principal stage. It grants no process, source or runtime capability. */
export function wrappedColdStageProcessFailureV1(index,processes){
 assert.equal(arguments.length,2);assert.ok(Number.isInteger(index)&&index>=0&&index<3);assert.ok(Array.isArray(processes));
 return index===0&&(nativeWalletUnfundedProcessFailure(processes)||processes.some(row=>row.proofWorker||row.role==='wrapped-claim-proof-role'))?'WRAPPED_COLD_PREPRINCIPAL_PROOF_FORBIDDEN':null;
}

/** An exited row cannot be reclassified from an empty /proc command line.
 * Reuse only the exact owned identity's established label and heavy flag.
 * Unknown/reused identities remain unknown; dead processes consume no budget. */
export function nativeExitedProcessClassification(process, established) {
  assert.ok(!live(process), 'NATIVE_EXITED_CLASSIFICATION_NONLIVE');
  if (!sameIdentity(process, established) || process.pgrp !== established.pgrp
    || process.session !== established.session)
    return { role: 'owned-descendant', proofWorker: false };
  return { role: established.role, proofWorker: established.proofWorker,
    ...(established.proofRelation === undefined ? {} : { proofRelation: established.proofRelation, proofOperation: established.proofOperation }) };
}

/** Preserve the same per-process 3 GiB bound for both V3 processes while
 * counting only backend workers against the one-heavy-worker invariant. */
export function nativeProofProcessResources(processes) {
  const active = processes.filter(live);
  const protectedProofProcesses = active.filter(item => item.proofWorker
    || item.role === 'native-source-original-backend' || item.role === 'economic-note-native-coordinator' || item.role === 'device-external-flat-observation-successor' || item.role === 'native-economic-successor-role' || item.role === 'flat-reservation-native-coordinator' || item.role === 'flat-node-native-coordinator' || item.role === 'native-value-dev-live-v5-native-coordinator' || item.role === 'flat-authorization-native-coordinator' || item.role === 'wrapped-claim-proof-role' || item.role === 'native-ingress-v3-proof-role' || item.role === 'native-value-live-v2-proof-role' || item.role === 'native-value-dev-live-v5-proof-role');
  // A native U uses one original Node coordinator plus its sole BB child.
  // They share the same 3GiB ceiling; splitting PIDs never enlarges it.
  const nativeUCombinedRSS = active.filter(item => item.role === 'flat-authorization-native-coordinator').map(parent =>
    integer(parent.rssBytes) + active.filter(item => item.role === 'flat-authorization-native-backend' && item.ppid === parent.pid)
      .reduce((sum, child) => sum + integer(child.rssBytes), 0));
  const nativeI84CombinedRSS=active.filter(item=>item.role==='native-value-dev-live-v5-native-coordinator').map(parent=>
    integer(parent.rssBytes)+active.filter(item=>item.role==='native-value-dev-live-v5-native-backend'&&item.ppid===parent.pid)
      .reduce((sum,child)=>sum+integer(child.rssBytes),0));
  const nativeNCombinedRSS=active.filter(item=>item.role==='flat-node-native-coordinator').map(parent=>
    integer(parent.rssBytes)+active.filter(item=>item.role==='flat-node-native-backend'&&item.ppid===parent.pid)
      .reduce((sum,child)=>sum+integer(child.rssBytes),0));
  const nativeSCombinedRSS=active.filter(item=>item.role==='flat-reservation-native-coordinator').map(parent=>
    integer(parent.rssBytes)+active.filter(item=>item.role==='flat-reservation-native-backend'&&item.ppid===parent.pid)
      .reduce((sum,child)=>sum+integer(child.rssBytes),0));
  const nativeNoteCombinedRSS=active.filter(item=>item.role==='economic-note-native-coordinator').map(parent=>
    integer(parent.rssBytes)+active.filter(item=>item.role==='economic-note-native-backend'&&item.ppid===parent.pid)
      .reduce((sum,child)=>sum+integer(child.rssBytes),0));
  return { maximumProofWorkerRSSBytes: Math.max(0,...nativeNoteCombinedRSS,...nativeSCombinedRSS,...nativeNCombinedRSS, ...nativeUCombinedRSS,...nativeI84CombinedRSS, ...protectedProofProcesses.map(item => integer(item.rssBytes))),
    liveProofWorkers:active.filter(item=>item.proofWorker).length+active.filter(parent=>parent.role==='economic-note-native-coordinator'
      &&!active.some(child=>child.role==='economic-note-native-backend'&&child.ppid===parent.pid)).length+active.filter(parent=>parent.role==='flat-reservation-native-coordinator'
      &&!active.some(child=>child.role==='flat-reservation-native-backend'&&child.ppid===parent.pid)).length+active.filter(parent=>parent.role==='flat-node-native-coordinator'
      &&!active.some(child=>child.role==='flat-node-native-backend'&&child.ppid===parent.pid)).length };
}

/** Aggregate RSS is observation only. A validator plus a prover may exceed
 * 3 GiB together while each proof/main process and the host remain in budget. */
export function nativeResourceFailure(sample) {
  for (const name of ['availableRAMBytes', 'freeDiskBytes', 'mainWorkerRSSBytes',
    'maximumProofWorkerRSSBytes', 'supervisorRSSBytes', 'liveProofWorkers']) integer(sample[name]);
  if (sample.availableRAMBytes < NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes) return 'NATIVE_MEMAVAILABLE_FLOOR';
  if (sample.freeDiskBytes < NATIVE_FLOW_LIMITS.minimumFreeDiskBytes) return 'NATIVE_DISK_FLOOR';
  if (sample.mainWorkerRSSBytes > NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes) return 'NATIVE_MAIN_WORKER_RSS_LIMIT';
  if (sample.maximumProofWorkerRSSBytes > NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes) return 'NATIVE_PROOF_WORKER_RSS_LIMIT';
  if (sample.supervisorRSSBytes > NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes) return 'NATIVE_SUPERVISOR_RSS_LIMIT';
  if (sample.liveProofWorkers > 1) return 'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS';
  return null;
}

/** The worker result is untrusted evidence until exit, source and cleanup
 * checks pass. Copy only this fixed public summary into the supervisor report. */
function validateResultIdentity(result, supervisorPID, workerPID, profile) {
  assertFixedProfile(profile);
  assert.equal(result?.format, profile.resultFormat, 'NATIVE_RESULT_FORMAT');
  assert.equal(result.localOnly, true, 'NATIVE_RESULT_LOCAL_ONLY');
  assert.equal(result.fakeFundsOnly, true, 'NATIVE_RESULT_FAKE_FUNDS_ONLY');
  assert.equal(result.publicNetwork, false, 'NATIVE_RESULT_PUBLIC_NETWORK');
  assert.equal(result.supervisor?.supervisorPID, supervisorPID, 'NATIVE_RESULT_SUPERVISOR_BINDING');
  assert.equal(result.supervisor?.workerPID, workerPID, 'NATIVE_RESULT_WORKER_BINDING');
}
export function validateNativeResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.nativeFlow);
}
export function validateAccountRecoveryResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.accountRecovery);
}
export function validateAssetPortfolioResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.assetPortfolio);
}
export function validateNativeClaimLoadedV3Result(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.nativeClaimLoadedV3);
}
export function validateNativeClaimLoadedFactsResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.nativeClaimLoadedFacts);
}
export function validateNativeClaimUnfundedHealthResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.nativeClaimUnfundedHealth);
}
export function validateNativeIngressV3PreflightResult(result, supervisorPID, workerPID) {
  return validateCompletedResult(result, supervisorPID, workerPID, FLOW_PROFILES.nativeIngressV3Preflight);
}
function validateCompletedResult(result, supervisorPID, workerPID, profile) {
  validateResultIdentity(result, supervisorPID, workerPID, profile);
  assert.equal(result.phase, 'completed', 'NATIVE_RESULT_PHASE');
  assert.equal(result.success, true, 'NATIVE_RESULT_SUCCESS');
  for (const key of profile.cleanupKeys)
    assert.equal(result.cleanup?.[key], true, 'NATIVE_RESULT_RUNTIME_CLEANUP');
  let scoped = {};
  if(profile===FLOW_PROFILES.nativeSourceAbruptV1)scoped=assertNativeSourceAbruptResultV1(result);
  if(profile===FLOW_PROFILES.deviceMorphoBlueGraphV1)scoped=assertDeviceMorphoBlueGraphResultV1(result);
  if(profile===FLOW_PROFILES.deviceExternalFlatGraphV1)scoped=assertDeviceExternalFlatGraphResultV1(result);
  if(profile===FLOW_PROFILES.deviceExternalFlatErc20V1)scoped=assertDeviceExternalFlatErc20ResultV1(result);
  if(profile===FLOW_PROFILES.evmMetaMorphoExitRecoveryV1||profile===FLOW_PROFILES.evmAaveExitRecoveryV1)scoped=assertExternalDefiVaultExitRecoveryResultV1(result);
  if (profile === FLOW_PROFILES.jupiterOrcaPublicSwapV1) scoped = assertJupiterOrcaPublicSwapResultV1(result);
  if (profile === FLOW_PROFILES.nativeSplClaimV1CompilationOnly) scoped = assertNativeSplClaimV1CompilationResult(result);
  if (profile === FLOW_PROFILES.nativeSplClaimValidationCompilationOnlyV1) scoped = assertNativeSplClaimValidationCompilationResultV1(result);
  if (profile === FLOW_PROFILES.nativeSplClaimTokenCompilationOnlyV1) scoped = assertNativeSplClaimTokenCompilationResultV1(result);
  if (profile === FLOW_PROFILES.evmAaveCompilationOnlyV1) scoped = assertAaveCompilationResultV1(result);
  if (profile === FLOW_PROFILES.nativeSplCompilationOnlyV1) scoped = assertNativeSplCompilationResultV1(result);
  if (profile === FLOW_PROFILES.evmAave) scoped = assertAavePrivateGraphResultV1(result);
  if (profile === FLOW_PROFILES.pairedNativeNoteV2) scoped = assertPairedNativeNoteResultV2(result);
  if(profile===FLOW_PROFILES.nativeDeviceLiveArmedShortV1)scoped=assertNativeDeviceLiveArmedShortResultV1(result);
  if(profile===FLOW_PROFILES.nativeDeviceEconomicNoteRecoveryV1)scoped=assertNativeDeviceEconomicNoteResultV1(result);
  if(profile===FLOW_PROFILES.nativeDeviceEconomicRecoveryV1)scoped=assertNativeDeviceEconomicResultV1(result);
  if(profile===FLOW_PROFILES.deviceOwnerFReorgV1)scoped=assertDeviceFReorgResultV1(result);
  if(profile===FLOW_PROFILES.deviceOwnerRecoveryV1)scoped=assertDeviceRecoveryResultV1(result);
  if(profile===FLOW_PROFILES.deviceOwnerExecutionV1)scoped=assertDeviceExecutionResultV1(result);
  if (profile === FLOW_PROFILES.deviceOwnerReservationV1) scoped = assertDeviceReservationResultV1(result);
  if (profile === FLOW_PROFILES.deviceOwnerDepositV1) scoped = assertDeviceDepositResultV1(result);
  if (profile === FLOW_PROFILES.developmentOsakaSmoke) scoped = assertOsakaSmokeResult(result);
  if (profile === FLOW_PROFILES.wrappedDeploymentOnly) scoped = assertWrappedDeploymentOnlyResultV1(result);
  if (profile === FLOW_PROFILES.nativeClaimBeginPayoutAuditV1) scoped = assertBeginPayoutAuditResultV1(result);
  if (profile === FLOW_PROFILES.wrappedWalletFixedAcceptance) scoped = assertWrappedWalletFixedResultV1(result);
  if (profile === FLOW_PROFILES.wrappedWalletFixedPreflight) scoped = assertWrappedWalletFixedPreflightResultV1(result);
  if (profile === FLOW_PROFILES.nativeWalletTronDevV5) scoped = assertNativeWalletTronDevResultV5(result);
  if (profile === FLOW_PROFILES.nativeWalletRealAcceptance) scoped = assertNativeWalletRealResult(result);
  if (profile === FLOW_PROFILES.nativeWalletRealPreflight) scoped = assertNativeWalletUnfundedResult(result);
  if (profile === FLOW_PROFILES.poolGenerationPhase1) scoped = assertPoolGenerationPhase1Result(result);
  if (profile === FLOW_PROFILES.poolGenerationPhase2) scoped = assertPoolGenerationPhase2Result(result);
  if (profile === FLOW_PROFILES.manualWallet) scoped = assertManualWalletResult(result);
  if (profile === FLOW_PROFILES.manualWalletBrowser) scoped = assertManualWalletBrowserResult(result);
  if (profile === FLOW_PROFILES.manualWalletBrowserRecovery) scoped = assertManualWalletBrowserRecoveryResult(result);
  if(profile===FLOW_PROFILES.developmentBtcSplJupiterV1)scoped=assertDevelopmentBtcSplJupiterResultV1(result);
  if (profile === FLOW_PROFILES.developmentBtcSolGraph) scoped = assertDevelopmentBtcSolGraphResult(result);
  if (profile === FLOW_PROFILES.developmentNativeClaims) scoped = assertDevelopmentNativeClaimResult(result);
  if (profile === FLOW_PROFILES.nativeClaimEmptyAuditMetrics) scoped = assertEmptyAuditResult(result);
  if (profile === FLOW_PROFILES.privateMetaMorpho) scoped = assertPrivateMetaMorphoResult(result);
  if (profile === FLOW_PROFILES.evmUniswapRecovery) scoped = assertEvmUniswapRecoveryResult(result);
  if(profile===FLOW_PROFILES.evmMetaMorphoRecoveryV1)scoped=assertEvmMetaMorphoRecoveryResultV1(result);
  if (profile === FLOW_PROFILES.developmentDefiEntry) scoped = assertDevelopmentDefiEntryResult(result);
  if (profile === FLOW_PROFILES.manualWalletRecovery) scoped = assertManualWalletRecoveryResult(result);
  if (profile === FLOW_PROFILES.nativeClaimLoadedV3) scoped = validateClaimLoadedV3Result(result);
  if (profile === FLOW_PROFILES.nativeClaimGraphV3) scoped = validateClaimGraphV3Result(result);
  if (profile === FLOW_PROFILES.nativeIngressV3ProductionPreflight) scoped = assertNativeIngressV3ProductionPreflightResult(result);
  if (profile === FLOW_PROFILES.nativeIngressV3Preflight) scoped = assertNativeIngressV3PreflightResult(result);
  if (profile === FLOW_PROFILES.nativeClaimUnfundedHealth) scoped = assertUnfundedHealthResult(result);
  if (profile === FLOW_PROFILES.nativeClaimLoadedFacts) {
    assert.equal(result.profile, 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE', 'NATIVE_LOADED_FACTS_RESULT_PROFILE');
    assert.equal(result.fullNativeGraphAcceptance, false, 'NATIVE_LOADED_FACTS_SCOPE');
    assert.equal(result.fullWalletAcceptance, false, 'NATIVE_LOADED_FACTS_SCOPE');
    assert.deepEqual(result.selectedAssets, [1], 'NATIVE_LOADED_FACTS_SCOPE');
    assert.deepEqual(result.proofs?.map(proof => proof.relation),
      ['deposit_intent', 'native_claim_ingress', 'withdraw_balance', 'native_claim_discharge'], 'NATIVE_LOADED_FACTS_PROOFS');
    const probe = result.loadedFactsProbe;
    assert.equal(probe?.scope, 'LOADED_POST_DELIVERY_FACTS_ONLY', 'NATIVE_LOADED_FACTS_SCOPE');
    for (const key of ['success', 'factualChecksPassed', 'ownerClaimFullyRedeemed', 'originalFinalizedOnce', 'retainedOriginalClaimBinding',
      'health', 'checkpoint', 'sameEvmHead', 'custodyUnchanged', 'solverSeparateLiquidity', 'noAttestationTransactionSubmitted'])
      assert.equal(probe[key], true, 'NATIVE_LOADED_FACTS_INCOMPLETE');
    for (const key of ['providerProofs', 'graphSettlement', 'fullNativeGraphAcceptance'])
      assert.equal(probe[key], false, 'NATIVE_LOADED_FACTS_SCOPE');
    assert.equal(probe.issuedClaimAmount, '3000000'); assert.equal(probe.solverNativeAmount, '1000000');
    assert.equal(probe.factsCalls, 1); assert.equal(probe.retainedGraphFactPerSigner, 1);
    assert.equal(result.acceptance?.allClaimLiabilitiesClosed, true, 'NATIVE_LOADED_FACTS_LIABILITIES');
    scoped = { scope: probe.scope, fullNativeGraphAcceptance: false, ownerClaimFullyRedeemed: true };
  }
  return { format: result.format, phase: 'completed', success: true, localOnly: true,
    fakeFundsOnly: true, publicNetwork: false, ...scoped,
    supervisor: { supervisorPID, workerPID },
    cleanup: Object.fromEntries(profile.cleanupKeys.map(key => [key, true])) };
}

/** Fixed additional profiles reuse every original budget, lock, sampler, parent
 * identity check and process-group cleanup rule. No new generic launcher. */
export async function runWrappedDeploymentOnlySupervisorV1() {
  await initializeWrappedSupervisorSourceV2();
  assert.equal(arguments.length,0);assertWrappedDeploymentOnlyReleaseV1();
  return runFixedFlowSupervisor(FLOW_PROFILES.wrappedDeploymentOnly);
}
export async function runWrappedWalletFixedAcceptanceSupervisorV1() {
  await initializeWrappedSupervisorSourceV2();
  assert.equal(arguments.length, 0); assert.ok(WRAPPED_WALLET_FIXED_RELEASE_V1, 'WRAPPED_FIXED_ACCEPTANCE_NOT_RELEASED');assertWrappedColdCycleReleaseV1();
  return runFixedFlowSupervisor(FLOW_PROFILES.wrappedWalletFixedAcceptance);
}
export async function runWrappedWalletFixedPreflightSupervisorV1() {
  await initializeWrappedSupervisorSourceV2();
  assert.equal(arguments.length, 0); assert.ok(WRAPPED_WALLET_FIXED_PREFLIGHT_RELEASE_V1, 'WRAPPED_FIXED_PREFLIGHT_NOT_RELEASED');
  return runFixedFlowSupervisor(FLOW_PROFILES.wrappedWalletFixedPreflight);
}
export async function runNativeWalletTronDevSupervisorV5(){
 assert.equal(arguments.length,0,'TRON_WALLET_DEV_SUPERVISOR_NO_OPTIONS');assertNativeWalletTronDevReleaseV5();
 return runFixedFlowSupervisor(FLOW_PROFILES.nativeWalletTronDevV5);
}
export async function runNativeWalletRealAcceptanceSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_WALLET_NO_SUPERVISOR_OPTIONS');
  assert.ok(NATIVE_WALLET_REAL_RELEASE_V1, 'NATIVE_WALLET_REAL_RELEASE_ABSENT');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeWalletRealAcceptance);
}
export async function runNativeWalletRealPreflightSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_WALLET_NO_SUPERVISOR_OPTIONS');
  assert.ok(NATIVE_WALLET_UNFUNDED_RELEASE_V1, 'NATIVE_WALLET_UNFUNDED_RELEASE_ABSENT');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeWalletRealPreflight);
}

/** The new profile's Python capsule represents the actual fixed launcher,
 * never a caller copy or an entry invoked directly by another host. Existing
 * enumerated profiles and their process predicates remain untouched. */
function assertPairedNativeNoteLauncherV2(deviceDeposit = false, deviceReservation = false, deviceExecution=false,deviceRecovery=false,deviceEconomicRecovery=false,deviceEconomicNativeNotes=false,deviceLiveArmed=false,deviceReorg=false) {
  const parentPID = process.ppid, before = procStat(parentPID);
  assert.ok(before && live(before), 'PAIRED_NOTE_ORIGINAL_LAUNCHER_UNAVAILABLE');
  assert.equal(lstatSync(`/proc/${parentPID}/stat`).uid, process.getuid(), 'PAIRED_NOTE_LAUNCHER_UID');
  const status = readFileSync(`/proc/${parentPID}/status`, 'utf8');
  const uids = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);
  assert.ok(uids && uids.slice(1).every(value => Number(value) === process.getuid()), 'PAIRED_NOTE_LAUNCHER_UID');
  const project = resolve(ROOT, '../../../..'), cwd = realpathSync(`/proc/${parentPID}/cwd`);
  assert.equal(cwd, project, 'PAIRED_NOTE_LAUNCHER_CWD');
  const argv = readFileSync(`/proc/${parentPID}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(argv.length, deviceDeposit ? 4 : 3, 'PAIRED_NOTE_LAUNCHER_ARGV');
  if (deviceDeposit) assert.equal(argv[3], deviceReorg?'--device-f-reorg':deviceLiveArmed?'--native-live-armed-short':deviceEconomicNativeNotes?'--native-economic-note-recovery':deviceEconomicRecovery?'--native-economic-recovery':deviceRecovery?'--device-recovery':deviceExecution?'--device-execution':deviceReservation ? '--device-reservation' : '--device-deposit', 'DEVICE_DEPOSIT_FIXED_LAUNCHER_ARGV');
  assert.equal(argv[1], '-B', 'PAIRED_NOTE_LAUNCHER_ARGV');
  assert.match(basename(argv[0]), /^python3(?:\.\d+)?$/, 'PAIRED_NOTE_LAUNCHER_ARGV');
  assert.equal(realpathSync(resolve(cwd, argv[2])), join(project, 'scripts/development/paired_original_account_lab.py'),
    'PAIRED_NOTE_FIXED_LAUNCHER');
  const after = procStat(parentPID);
  assert.ok(after && live(after) && sameIdentity(before, after) && before.ppid === after.ppid
    && before.pgrp === after.pgrp && before.session === after.session, 'PAIRED_NOTE_LAUNCHER_IDENTITY_CHANGED');
  assert.equal(lstatSync(`/proc/${parentPID}/stat`).uid, process.getuid(), 'PAIRED_NOTE_LAUNCHER_UID');
  const finalUids = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(readFileSync(`/proc/${parentPID}/status`, 'utf8'));
  assert.ok(finalUids && finalUids.slice(1).every(value => Number(value) === process.getuid()), 'PAIRED_NOTE_LAUNCHER_UID');
}

export async function runPairedNativeNoteSupervisorV2() {
  assert.equal(arguments.length, 0, 'PAIRED_NOTE_NO_SUPERVISOR_OPTIONS');
  assertPairedNativeNoteReleaseV2();
  assertPairedNativeNoteLauncherV2();
  await consumePairedNativeNoteStartPipeV2();
  assertPairedNativeNoteLauncherV2();
  return runFixedFlowSupervisor(FLOW_PROFILES.pairedNativeNoteV2);
}

function assertNativeSourceAbruptLauncherV1(){
  const parentPID = process.ppid, before = procStat(parentPID);
  assert.ok(before && live(before), 'NATIVE_SOURCE_ORIGINAL_LAUNCHER_UNAVAILABLE');
  assert.equal(lstatSync(`/proc/${parentPID}/stat`).uid, process.getuid(), 'NATIVE_SOURCE_LAUNCHER_UID');
  const status = readFileSync(`/proc/${parentPID}/status`, 'utf8');
  const uids = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);
  assert.ok(uids && uids.slice(1).every(value => Number(value) === process.getuid()), 'NATIVE_SOURCE_LAUNCHER_UID');
  const project = resolve(ROOT, '../../../..'), cwd = realpathSync(`/proc/${parentPID}/cwd`);
  assert.equal(cwd, project, 'NATIVE_SOURCE_LAUNCHER_CWD');
  const argv = readFileSync(`/proc/${parentPID}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(argv.length,3,'NATIVE_SOURCE_FIXED_LAUNCHER_ARGV');
  assert.equal(argv[1], '-B', 'NATIVE_SOURCE_LAUNCHER_ARGV');
  assert.match(basename(argv[0]), /^python3(?:\.\d+)?$/, 'NATIVE_SOURCE_LAUNCHER_ARGV');
  assert.equal(realpathSync(resolve(cwd, argv[2])), join(project, 'scripts/development/native_original_source_abrupt_lab_v1.py'),
    'NATIVE_SOURCE_FIXED_LAUNCHER');
  const after = procStat(parentPID);
  assert.ok(after && live(after) && sameIdentity(before, after) && before.ppid === after.ppid
    && before.pgrp === after.pgrp && before.session === after.session, 'NATIVE_SOURCE_LAUNCHER_IDENTITY_CHANGED');
  assert.equal(lstatSync(`/proc/${parentPID}/stat`).uid, process.getuid(), 'NATIVE_SOURCE_LAUNCHER_UID');
  const finalUids = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(readFileSync(`/proc/${parentPID}/status`, 'utf8'));
  assert.ok(finalUids && finalUids.slice(1).every(value => Number(value) === process.getuid()), 'NATIVE_SOURCE_LAUNCHER_UID');
}
export async function runNativeOriginalSourceAbruptSupervisorV1(){
 assert.equal(arguments.length,0,'NATIVE_SOURCE_NO_SUPERVISOR_OPTIONS');assertNativeSourceAbruptReleaseV1();
 assertNativeSourceAbruptLauncherV1();await consumePairedNativeNoteStartPipeV2();assertNativeSourceAbruptLauncherV1();
 await assertNativeSourceAbruptPreflightV1();return runFixedFlowSupervisor(FLOW_PROFILES.nativeSourceAbruptV1);
}

export async function runNativeDeviceLiveArmedShortSupervisorV1(){
  assert.equal(arguments.length,0,'NATIVE_LIVE_ARMED_SHORT_NO_SUPERVISOR_OPTIONS');assertNativeDeviceLiveArmedShortReleaseV1();
  assertPairedNativeNoteLauncherV2(true,true,true,false,true,true,true);await consumePairedNativeNoteStartPipeV2();assertPairedNativeNoteLauncherV2(true,true,true,false,true,true,true);
  await assertNativeLiveArmedShortRecoverableAnvilV1();return runFixedFlowSupervisor(FLOW_PROFILES.nativeDeviceLiveArmedShortV1);
}
export async function runNativeDeviceEconomicNoteRecoverySupervisorV1(){
  assert.equal(arguments.length,0,'NATIVE_DEVICE_ECONOMIC_NOTE_NO_SUPERVISOR_OPTIONS');assertNativeDeviceEconomicNoteReleaseV1();
  assertPairedNativeNoteLauncherV2(true,true,true,true,true,true);await consumePairedNativeNoteStartPipeV2();assertPairedNativeNoteLauncherV2(true,true,true,true,true,true);
  await assertNativeEconomicNoteRecoverableAnvilV1();
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeDeviceEconomicNoteRecoveryV1);
}

export async function runNativeDeviceEconomicRecoverySupervisorV1(){
  assert.equal(arguments.length,0,'NATIVE_DEVICE_ECONOMIC_NO_SUPERVISOR_OPTIONS');assertNativeDeviceEconomicReleaseV1();
  assertPairedNativeNoteLauncherV2(true,true,true,true,true);await consumePairedNativeNoteStartPipeV2();assertPairedNativeNoteLauncherV2(true,true,true,true,true);
  await assertNativeEconomicRecoverableAnvilV1();
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeDeviceEconomicRecoveryV1);
}

export async function runDeviceOwnerFReorgSupervisorV1(){
  assert.equal(arguments.length,0,'DEVICE_F_REORG_NO_SUPERVISOR_OPTIONS');assertDeviceFReorgReleaseV1();
  assertPairedNativeNoteLauncherV2(true,true,true,true,false,false,false,true);await consumePairedNativeNoteStartPipeV2();assertPairedNativeNoteLauncherV2(true,true,true,true,false,false,false,true);
  return runFixedFlowSupervisor(FLOW_PROFILES.deviceOwnerFReorgV1);
}

export async function runDeviceOwnerRecoverySupervisorV1(){
  assert.equal(arguments.length,0,'DEVICE_NATIVE_RECOVERY_NO_SUPERVISOR_OPTIONS');assertDeviceRecoveryReleaseV1();
  assertPairedNativeNoteLauncherV2(true,true,true,true);await consumePairedNativeNoteStartPipeV2();assertPairedNativeNoteLauncherV2(true,true,true,true);
  return runFixedFlowSupervisor(FLOW_PROFILES.deviceOwnerRecoveryV1);
}

export async function runDeviceOwnerExecutionSupervisorV1(){
  assert.equal(arguments.length,0,'DEVICE_NATIVE_NO_SUPERVISOR_OPTIONS');assertDeviceExecutionReleaseV1();
  assertPairedNativeNoteLauncherV2(true,true,true);await consumePairedNativeNoteStartPipeV2();assertPairedNativeNoteLauncherV2(true,true,true);
  return runFixedFlowSupervisor(FLOW_PROFILES.deviceOwnerExecutionV1);
}

export async function runDeviceOwnerReservationSupervisorV1(){
  assert.equal(arguments.length,0,'DEVICE_US_NO_SUPERVISOR_OPTIONS');assertDeviceReservationReleaseV1();
  assertPairedNativeNoteLauncherV2(true,true);await consumePairedNativeNoteStartPipeV2();assertPairedNativeNoteLauncherV2(true,true);
  return runFixedFlowSupervisor(FLOW_PROFILES.deviceOwnerReservationV1);
}

export async function runDeviceOwnerDepositSupervisorV1() {
  assert.equal(arguments.length, 0, 'DEVICE_DEPOSIT_NO_SUPERVISOR_OPTIONS');
  assertDeviceDepositReleaseV1();
  assertPairedNativeNoteLauncherV2(true);
  await consumePairedNativeNoteStartPipeV2();
  assertPairedNativeNoteLauncherV2(true);
  return runFixedFlowSupervisor(FLOW_PROFILES.deviceOwnerDepositV1);
}

/** One private inherited pipe, fixed original parent, before any worker is
 * admitted. EOF/error/timeout fail without starting a proof/native runtime. */
async function consumePairedNativeNoteStartPipeV2() {
  const value = process.env.LIANUM_PAIRED_ORIGINAL_START_FD_V2;
  assert.ok(typeof value === 'string' && /^[1-9][0-9]{0,5}$/.test(value), 'PAIRED_NOTE_ORIGINAL_START_PIPE_REQUIRED');
  const fd = Number(value), info = fstatSync(fd);
  assert.ok(fd >= 3 && info.isFIFO() && info.uid === process.getuid() && (info.mode & 0o077) === 0,
    'PAIRED_NOTE_ORIGINAL_START_PIPE_REQUIRED');
  await new Promise((resolveDone, rejectDone) => {
    let settled = false, count = 0;
    const stream = createReadStream(null, { fd, autoClose: true, highWaterMark: 2 });
    const finish = error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { stream.destroy(); rejectDone(error); }
      else resolveDone();
    };
    const timer = setTimeout(() => finish(Error('PAIRED_NOTE_ORIGINAL_START_PIPE_DEADLINE')), 2000);
    stream.on('data', bytes => {
      count += bytes.length;
      if (count !== 1 || bytes.length !== 1 || bytes[0] !== 0x47)
        finish(Error('PAIRED_NOTE_ORIGINAL_START_GRANT_CHANGED'));
    });
    stream.once('end', () => finish(count === 1 ? null : Error('PAIRED_NOTE_ORIGINAL_START_CANCELLED')));
    stream.once('error', () => finish(Error('PAIRED_NOTE_ORIGINAL_START_PIPE_ERROR')));
    stream.once('close', () => { if (!settled) finish(Error('PAIRED_NOTE_ORIGINAL_START_PIPE_CLOSED')); });
  });
  delete process.env.LIANUM_PAIRED_ORIGINAL_START_FD_V2;
}

export async function runDevelopmentOsakaSmokeSupervisor() {
  assert.equal(arguments.length, 0, 'OSAKA_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.developmentOsakaSmoke);
}
export async function runNativeFlowSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeFlow);
}
export async function runAccountRecoverySupervisor() {
  assert.equal(arguments.length, 0, 'ACCOUNT_RECOVERY_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.accountRecovery);
}
export async function runAssetPortfolioSupervisor() {
  assert.equal(arguments.length, 0, 'ASSET_PORTFOLIO_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.assetPortfolio);
}
export async function runPoolGenerationPhase1Supervisor() {
  assert.equal(arguments.length, 0, 'POOL_GENERATION_NO_SUPERVISOR_OPTIONS');
  assert.ok(POOL_GENERATION_PHASE1_RELEASE, 'POOL_GENERATION_PHASE1_REQUIRES_EXCLUSIVE_CHECKPOINT');
  return runFixedFlowSupervisor(FLOW_PROFILES.poolGenerationPhase1);
}
export async function runPoolGenerationPhase2Supervisor() {
  assert.equal(arguments.length, 0, 'POOL_GENERATION_NO_SUPERVISOR_OPTIONS');
  assert.ok(POOL_GENERATION_PHASE2_RELEASE, 'POOL_GENERATION_PHASE2_REQUIRES_EXCLUSIVE_CHECKPOINT');
  return runFixedFlowSupervisor(FLOW_PROFILES.poolGenerationPhase2);
}
export async function runManualWalletSupervisor() {
  assert.equal(arguments.length, 0, 'MANUAL_WALLET_NO_SUPERVISOR_OPTIONS');
  assert.equal(MANUAL_WALLET_REAL_RUN_DISABLED, false, 'MANUAL_WALLET_REQUIRES_EXCLUSIVE_CHECKPOINTED_SLOT');
  return runFixedFlowSupervisor(FLOW_PROFILES.manualWallet);
}
export async function runManualWalletBrowserSupervisor() {
  assert.equal(arguments.length, 0, 'MANUAL_BROWSER_NO_SUPERVISOR_OPTIONS');
  assert.equal(MANUAL_WALLET_REAL_RUN_DISABLED, false, 'MANUAL_BROWSER_REQUIRES_EXCLUSIVE_CHECKPOINTED_SLOT');
  return runFixedFlowSupervisor(FLOW_PROFILES.manualWalletBrowser);
}
export async function runManualWalletBrowserRecoverySupervisor() {
  assert.equal(arguments.length, 0, 'MANUAL_BROWSER_RECOVERY_NO_SUPERVISOR_OPTIONS');
  assert.equal(MANUAL_WALLET_REAL_RUN_DISABLED, false, 'MANUAL_BROWSER_RECOVERY_REQUIRES_EXCLUSIVE_CHECKPOINTED_SLOT');
  return runFixedFlowSupervisor(FLOW_PROFILES.manualWalletBrowserRecovery);
}
export async function runManualWalletRecoverySupervisor() {
  assert.equal(arguments.length, 0, 'MANUAL_WALLET_RECOVERY_NO_SUPERVISOR_OPTIONS');
  assert.equal(MANUAL_WALLET_REAL_RUN_DISABLED, false, 'MANUAL_WALLET_REQUIRES_EXCLUSIVE_CHECKPOINTED_SLOT');
  return runFixedFlowSupervisor(FLOW_PROFILES.manualWalletRecovery);
}
export async function runDevelopmentBtcSplJupiterSupervisorV1(){assert.equal(arguments.length,0,'SPL_GRAPH_FIXED_SUPERVISOR_NO_OPTIONS');assertDevelopmentBtcSplSourceReviewV1();return runFixedFlowSupervisor(FLOW_PROFILES.developmentBtcSplJupiterV1);}
export async function runDevelopmentBtcSolGraphSupervisor() {
  assert.equal(arguments.length, 0, 'DEVELOPMENT_BTC_SOL_NO_SUPERVISOR_OPTIONS');
  assert.equal(DEVELOPMENT_BTC_SOL_GRAPH_REAL_RUN_DISABLED, false, 'DEVELOPMENT_BTC_SOL_REQUIRES_REVIEWED_EXCLUSIVE_CHECKPOINT');
  return runFixedFlowSupervisor(FLOW_PROFILES.developmentBtcSolGraph);
}
export async function runNativeClaimEmptyAuditMetricsSupervisor() {
  assert.equal(arguments.length, 0, 'EMPTY_AUDIT_NO_SUPERVISOR_OPTIONS');
  assert.equal(EMPTY_AUDIT_REAL_RUN_DISABLED, false, 'EMPTY_AUDIT_REQUIRES_REVIEWED_EXCLUSIVE_CHECKPOINT');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimEmptyAuditMetrics);
}

export async function runDevelopmentNativeClaimSupervisor() {
  assert.equal(arguments.length, 0, 'DEVELOPMENT_CLAIM_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.developmentNativeClaims);
}

export async function runDevelopmentDefiEntrySupervisor() {
  assert.equal(arguments.length, 0, 'DEVELOPMENT_DEFI_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.developmentDefiEntry);
}

export async function runPrivateMetaMorphoSupervisor() {
  assert.equal(arguments.length, 0, 'PRIVATE_METAMORPHO_SUPERVISOR_NO_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.privateMetaMorpho);
}
export async function runEvmVaultSupervisor() {
  assert.equal(arguments.length, 0, 'EVM_VAULT_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.evmVault);
}
export async function runJupiterOrcaPublicSwapSupervisorV1(){
  assert.equal(arguments.length,0,'JUPITER_SWAP_SUPERVISOR_NO_OPTIONS');
  assertJupiterPublicFixtureSourceReviewV1();assertJupiterPublicSwapSourceReviewV1();
  return runFixedFlowSupervisor(FLOW_PROFILES.jupiterOrcaPublicSwapV1);
}
export async function runNativeSplClaimV1CompilationSupervisor(){assert.equal(arguments.length,0,'SPL_CLAIM_V1_COMPILATION_NO_OPTIONS');return runFixedFlowSupervisor(FLOW_PROFILES.nativeSplClaimV1CompilationOnly);}
export async function runNativeSplClaimValidationCompilationSupervisorV1(){assert.equal(arguments.length,0,'SPL_VALIDATION_COMPILATION_SUPERVISOR_NO_OPTIONS');return runFixedFlowSupervisor(FLOW_PROFILES.nativeSplClaimValidationCompilationOnlyV1);}
export async function runNativeSplClaimTokenCompilationSupervisorV1(){assert.equal(arguments.length,0,'SPL_TOKEN_COMPILATION_SUPERVISOR_NO_OPTIONS');return runFixedFlowSupervisor(FLOW_PROFILES.nativeSplClaimTokenCompilationOnlyV1);}
export async function runEvmAaveCompilationSupervisorV1(){
  assert.equal(arguments.length,0,'AAVE_COMPILATION_SUPERVISOR_NO_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.evmAaveCompilationOnlyV1);
}
export async function runEvmAaveSupervisorV1() {
  assert.equal(arguments.length,0,'AAVE_SUPERVISOR_NO_OPTIONS');assertOfficialAaveSourceReviewV1();
  return runFixedFlowSupervisor(FLOW_PROFILES.evmAave);
}
export async function runEvmUniswapSupervisor() {
  assert.equal(arguments.length, 0, 'EVM_UNISWAP_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.evmUniswap);
}
export async function runEvmMetaMorphoRecoverySupervisorV1(){
  assert.equal(arguments.length,0,'EVM_METAMORPHO_F_NO_SUPERVISOR_OPTIONS');assertMetaMorphoFReleaseV1();
  return runFixedFlowSupervisor(FLOW_PROFILES.evmMetaMorphoRecoveryV1);
}
export async function runEvmUniswapRecoverySupervisor() {
  assert.equal(arguments.length, 0, 'EVM_UNISWAP_RECOVERY_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.evmUniswapRecovery);
}
export async function runNativeClaimSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_CLAIM_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaims);
}
export async function runNativeClaimGraphSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_CLAIM_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimGraph);
}
export async function runNativeClaimLoadedFactsSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_CLAIM_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimLoadedFacts);
}
export async function runNativeClaimUnfundedHealthSupervisor() {
  assert.equal(arguments.length, 0, 'NATIVE_UNFUNDED_NO_SUPERVISOR_OPTIONS');
  assert.equal(UNFUNDED_HEALTH_REAL_RUN_DISABLED, false, 'NATIVE_UNFUNDED_RUN_REQUIRES_FROZEN_CHECKPOINT');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimUnfundedHealth);
}
export async function runNativeIngressV3PreflightSupervisor() {
  assert.equal(arguments.length, 0, 'V3_PREFLIGHT_NO_SUPERVISOR_OPTIONS');
  assert.equal(PREFLIGHT_REAL_RUN_DISABLED, false, 'V3_PREFLIGHT_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeIngressV3Preflight);
}
export async function runNativeIngressV3ProductionPreflightSupervisor() {
  assert.equal(arguments.length, 0, 'V3_PRODUCTION_PREFLIGHT_NO_SUPERVISOR_OPTIONS');
  assert.equal(PRODUCTION_PREFLIGHT_REAL_RUN_DISABLED, false, 'V3_PRODUCTION_PREFLIGHT_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeIngressV3ProductionPreflight);
}
export async function runNativeClaimBeginPayoutAuditSupervisorV1() {
  assert.equal(arguments.length, 0, 'CLAIM_BEGIN_AUDIT_NO_SUPERVISOR_OPTIONS');
  assertBeginPayoutAuditReleaseV1();
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimBeginPayoutAuditV1);
}
export async function runNativeClaimLoadedV3Supervisor() {
  assert.equal(arguments.length, 0, 'CLAIM_LOADED_V3_NO_SUPERVISOR_OPTIONS');
  assert.equal(CLAIM_LOADED_V3_REAL_RUN_DISABLED, false, 'CLAIM_LOADED_V3_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimLoadedV3);
}
export async function runNativeClaimGraphV3Supervisor() {
  assert.equal(arguments.length, 0, 'CLAIM_GRAPH_V3_NO_SUPERVISOR_OPTIONS');
  assert.equal(CLAIM_GRAPH_V3_REAL_RUN_DISABLED, false, 'CLAIM_GRAPH_V3_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeClaimGraphV3);
}
export async function runNativeSplCompilationSupervisorV1() {
  assert.equal(arguments.length,0,'SPL_COMPILATION_NO_SUPERVISOR_OPTIONS');
  return runFixedFlowSupervisor(FLOW_PROFILES.nativeSplCompilationOnlyV1);
}
async function runFixedFlowSupervisor(profile) {
  assertFixedProfile(profile);
  const coldCycle=profile===FLOW_PROFILES.wrappedWalletFixedAcceptance;
  const publicErrorCode=coldCycle?wrappedColdPublicErrorCodeV1:safeCode,publicFailureCode=coldCycle?wrappedColdPublicFailureCodeV1:failureCode;
  const wrappedSourceBinding = profile === FLOW_PROFILES.wrappedDeploymentOnly || profile === FLOW_PROFILES.wrappedWalletFixedAcceptance || profile === FLOW_PROFILES.wrappedWalletFixedPreflight;
  if (wrappedSourceBinding) inspectWrappedInstallationSourcesV2();
  const { entry: ENTRY, worker: WORKER, local: LOCAL } = profile;
  const LOCK = join(LOCAL, 'active.lock');
  const began = process.hrtime.bigint(), startedAt = new Date().toISOString();
  const elapsed = () => Number(process.hrtime.bigint() - began) / 1e6;
  const runId = assertNativeFlowRunId(randomUUID());
  const attempt = join(LOCAL, `attempt-${runId}`), reportPath = join(attempt, 'resources.json');
  const resultPath = join(attempt, 'result.json'), sourcePath = join(attempt, 'source-pins.json');
  const streams = Object.fromEntries(['stdout', 'stderr'].map(key => [key, { bytes: 0, hash: createHash('sha256') }]));
  const identities = new Map(), history = new Map();
  let report, child, lockIdentity, workerIdentity, sourcePins, failure = null;
  let attemptCreated = false, workerSpawned = false, childExited = false, childClosed = false;
  let groupGone = false, groupOwnershipLost = false, finalGroupMeasurementSucceeded = false;
  let stopping = false, finished = false, finishing = false, termAt = null;
  let monitorTimer, reserveTimer, hardTimer, killTimer, cleanupTimer, resolveCompletion;
  let completion = new Promise(resolveDone => { resolveCompletion = resolveDone; });

  function fail(code, details = {}) {
    failure ??= code;
    if (!report) return;
    report.failure = failure;
    if (!report.failures.some(item => item.code === code))
      report.failures.push({ code, elapsedMilliseconds: elapsed(), at: new Date().toISOString(), ...details });
  }
  function save() {
    if (!report || !attemptCreated) return;
    if (existsSync(reportPath)) readRegular(reportPath);
    const temporary = join(attempt, `resources.tmp-${process.pid}`);
    writeExclusive(temporary, json(report)); renameSync(temporary, reportPath);
  }
  function bestEffortSave() {
    try { save(); return true; }
    catch (error) {
      fail('NATIVE_EVIDENCE_WRITE_FAILURE', { errorCode: publicErrorCode(error) });
      if (report) report.evidenceWriteFailure = publicErrorCode(error);
      return false;
    }
  }
  function classify(pid) {
    if (pid === child.pid) return { role: 'main-worker', proofWorker: false };
    // Used for a label only. Neither command lines nor executable paths leave
    // this function, and they never select a signal target or executable.
    const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    if (profile === FLOW_PROFILES.nativeClaimBeginPayoutAuditV1) {
      const scoped = classifyBeginPayoutAuditProofProcessV1(argv); if (scoped) return scoped;
    }
    if(profile===FLOW_PROFILES.nativeSplCompilationOnlyV1)return classifyNativeSplCompilerProcessV1(argv,readlinkSync(`/proc/${pid}/exe`));
    if(profile===FLOW_PROFILES.nativeSplClaimV1CompilationOnly){const p=classifyNativeSplClaimV1Preparation(argv);if(p)return p;}
    const script = argv[1];
    const nativeStat=procStat(pid),nativeParent=nativeStat?procStat(nativeStat.ppid):null;
    if(profile===FLOW_PROFILES.deviceExternalFlatGraphV1){const scoped=classifyDeviceExternalFlatGraphProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);if(scoped)return scoped;}
    if(profile===FLOW_PROFILES.deviceMorphoBlueGraphV1){const scoped=classifyDeviceMorphoBlueGraphProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);if(scoped)return scoped;}
    if(profile===FLOW_PROFILES.deviceExternalFlatErc20V1){const scoped=classifyDeviceExternalFlatErc20ProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);if(scoped)return scoped;}
    if(profile===FLOW_PROFILES.evmMetaMorphoExitRecoveryV1||profile===FLOW_PROFILES.evmAaveExitRecoveryV1){const scoped=classifyExternalDefiVaultExitProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);if(scoped)return scoped;}
    if(profile===FLOW_PROFILES.nativeSourceAbruptV1){const scoped=classifyNativeSourceAbruptProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),nativeParent?{pid:nativeParent.pid,startTimeTicks:nativeParent.startTimeTicks,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);if(scoped)return scoped;}
    if(profile===FLOW_PROFILES.nativeDeviceLiveArmedShortV1){const scoped=classifyNativeLiveArmedShortProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);if(scoped)return scoped;}
    if(profile===FLOW_PROFILES.nativeDeviceEconomicNoteRecoveryV1){const scoped=classifyNativeEconomicNoteRestartProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),
      nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);if(scoped)return scoped;}
    if(profile===FLOW_PROFILES.nativeDeviceEconomicRecoveryV1){const scoped=classifyNativeEconomicRestartProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),
      nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);if(scoped)return scoped;}
    const noteNative=classifyNativeEconomicNoteProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),
      nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);
    if(noteNative)return noteNative;
    const i84Native=classifyI84NativeProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),
      nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);
    if(i84Native)return i84Native;
    const reservationNative=classifyReservationNativeProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),
      nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);
    if(reservationNative)return reservationNative;
    const nodeNative=classifyNodeNativeProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),
      nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);
    if(nodeNative)return nodeNative;
    const native=classifyAuthorizationNativeProcessV1(argv,readlinkSync(`/proc/${pid}/exe`),
      nativeParent?{pid:nativeParent.pid,argv:readFileSync(`/proc/${nativeParent.pid}/cmdline`,'utf8').split('\0').filter(Boolean)}:null);
    if(native)return native;
    const nativeWallet = classifyNativeWalletRealExecutable(script);
    if (nativeWallet) return nativeWallet;
    const v3 = classifyNativeIngressV3Executable(script);
    if (v3) return v3;
    if (script === join(ROOT, 'proof-workers/wrapped-claim-worker-v1.mjs')) return { role: 'wrapped-claim-proof-worker', proofWorker: true };
    if (script === join(ROOT, 'proof-workers/wrapped-claim-role-process-v1.mjs')) return { role: 'wrapped-claim-proof-role', proofWorker: false };
    if (script === join(ROOT, 'mobile-core/wrapped-claim-owner-process-v1.mjs')) return { role: 'wrapped-owner-role', proofWorker: false };
    if (script === join(ROOT, 'proof-workers/worker.mjs')) return { role: 'flat-proof-worker', proofWorker: true };
    if (script === join(GOLDEN, 'src/paeg/proof-worker.mjs')) return { role: 'golden-note-proof-worker', proofWorker: true };
    if (script === join(ROOT, 'proof-workers/role-process.mjs')) return { role: 'flat-proof-role', proofWorker: false };
    if (script === join(ROOT, 'mobile-core/flat-owner-process.mjs')) return { role: 'flat-owner-role', proofWorker: false };
    if (script === join(GOLDEN, 'src/paeg/native-recipient-process.mjs')
      || script === join(ROOT, 'integration/native-recipient-child.mjs')) return { role: 'recipient-role', proofWorker: false };
    if (script === join(GOLDEN, 'src/paeg/generic-balance-owner-child.mjs')) return { role: 'golden-owner-role', proofWorker: false };
    const executable = basename(readlinkSync(`/proc/${pid}/exe`));
    const runtime = { anvil: 'evm-runtime', bitcoind: 'bitcoin-runtime',
      'bitcoin-cli': 'bitcoin-local-cli', 'solana-test-validator': 'solana-runtime',
      'agave-validator': 'solana-runtime', 'solana-keygen': 'solana-local-keygen' }[executable];
    return { role: runtime ?? 'owned-descendant', proofWorker: false };
  }
  function groupResources() {
    if (!child?.pid || groupGone) return { rssBytes: 0, liveCount: 0, processes: [] };
    const pgid = child.pid;
    assert.ok(Number.isSafeInteger(pgid) && pgid > 1 && pgid !== process.pid, 'NATIVE_OWNED_GROUP_ID');
    const group = [], escaped = [];
    for (const entry of readdirSync('/proc')) {
      if (!/^[1-9]\d*$/.test(entry)) continue;
      const stat = procStat(Number(entry));
      if (!stat) continue;
      const known = identities.get(stat.pid);
      if (known && sameIdentity(known, stat) && (stat.pgrp !== pgid || stat.session !== pgid)) escaped.push(stat);
      if (stat.pgrp === pgid) group.push(stat);
    }
    if (escaped.length || group.some(stat => stat.session !== pgid)) {
      groupOwnershipLost = true;
      if (report) report.escapedOwnedProcesses = escaped;
      throw Error('NATIVE_GROUP_SESSION_CHANGED');
    }
    const leader = group.find(stat => stat.pid === pgid);
    if (leader && (!workerIdentity || !sameIdentity(leader, workerIdentity))) {
      groupOwnershipLost = true; throw Error('NATIVE_WORKER_IDENTITY_CHANGED');
    }
    // An observed process identity must anchor continuity if the leader has
    // exited. Never adopt a reused numeric group merely because its ID matches.
    if (group.length && !leader && !group.some(stat => sameIdentity(stat, identities.get(stat.pid)))) {
      groupOwnershipLost = true; throw Error('NATIVE_GROUP_CONTINUITY_UNCONFIRMED');
    }
    const processes = [];
    for (const observed of group) {
      let measured = nativeOwnedRSSV1(observed); if (measured === null) continue;
      const stat = measured.stat, established = history.get(`${stat.pid}:${stat.startTimeTicks}`);
      let classification;
      try {
        classification = live(stat) ? classify(stat.pid)
          : nativeExitedProcessClassification(stat, history.get(`${stat.pid}:${stat.startTimeTicks}`));
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
        // Missing cmdline/exe during exit cannot erase measured sibling memory.
        // An unclassified original identity receives the stricter proof bound.
        classification = sameIdentity(stat, established)
          ? { role: established.role, proofWorker: established.proofWorker,
            ...(established.proofRelation === undefined ? {} : { proofRelation: established.proofRelation, proofOperation: established.proofOperation }) }
          : { role: 'owned-descendant', proofWorker: true };
      }
      let after = procStat(stat.pid); if (!after) continue;
      assert.ok(sameIdentity(stat, after) && after.pgrp === pgid && after.session === pgid,
        'NATIVE_MEASURED_PROCESS_CHANGED');
      if (!live(after) && measured.liveThreadCount === undefined) {
        const exiting = nativeOwnedRSSV1(after); if (exiting === null) continue;
        measured = { ...exiting, rssBytes: Math.max(measured.rssBytes, exiting.rssBytes) }; after = exiting.stat;
      }
      if ((measured.liveThreadCount ?? 0) > 0 && classification.role === 'owned-descendant' && !sameIdentity(stat, established))
        classification = { role: 'owned-descendant', proofWorker: true };
      identities.set(after.pid, after);
      processes.push({ ...after, ...classification, rssBytes: integer(measured.rssBytes), rssSource: measured.rssSource,
        ...(measured.liveThreadCount === undefined ? {} : { liveThreadCount: measured.liveThreadCount }) });
    }
    processes.sort((a, b) => a.pid - b.pid);
    if (!processes.length) {
      let absent = false;
      try { process.kill(-pgid, 0); }
      catch (error) { if (error.code === 'ESRCH') absent = true; else throw error; }
      assert.ok(absent, 'NATIVE_GROUP_MEMBERSHIP_SCAN_INCOMPLETE');
      groupGone = true;
    }
    return { rssBytes: integer(processes.reduce((sum, item) => sum + item.rssBytes, 0)),
      liveCount: processes.filter(live).length, processes };
  }
  function assertHeavyLocks() {
    const lockPaths = [[join(PROOF_LOCAL, 'active.lock'), 'pid'], ['/tmp/lianum-paeg-proof-host.lock', 'parentPID']];
    for (const [path, ownerField] of lockPaths) {
      if (!existsSync(path)) continue;
      let value;
      try { value = JSON.parse(readRegular(path, 4096)); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const pid = value[ownerField];
      assert.ok(Number.isSafeInteger(pid) && pid > 1, 'NATIVE_HEAVY_LOCK_OWNER_INVALID');
      const owner = procStat(pid);
      // A role may acquire its lock between the group scan and this read. An
      // unchanged live leader safely anchors that newly born group member.
      const leader = child?.pid ? procStat(child.pid) : null;
      const anchored = sameIdentity(owner, identities.get(pid)) || sameIdentity(leader, workerIdentity);
      if (!owner && !existsSync(path)) continue; // A normally released lock raced its owner's exit.
      assert.ok(child?.pid && owner && owner.pgrp === child.pid && owner.session === child.pid
        && anchored, 'NATIVE_FOREIGN_OR_STALE_HEAVY_LOCK');
      const after = procStat(pid);
      assert.ok(sameIdentity(owner, after) && after.pgrp === child.pid && after.session === child.pid,
        'NATIVE_HEAVY_LOCK_OWNER_CHANGED');
      identities.set(pid, after);
    }
  }
  function assertOtherIntegrationLocks() {
    for (const name of ['envelope-constraints', 'native-constraints', 'completion-constraints', 'pinned-verification', 'verifier-compilation'])
      assert.equal(existsSync(join(PROOF_LOCAL, name + '.lock')), false, 'NATIVE_OTHER_INTEGRATION_LOCK');
    assert.equal(existsSync(join(ROOT, '.local/hash-conformance/active.lock')), false, 'NATIVE_HASH_CONFORMANCE_LOCK');
    assertOtherApplicationLocks();
  }
  function assertOtherApplicationLocks() {
    for (const other of Object.values(FLOW_PROFILES))
      if (other !== profile && join(other.local, 'active.lock') !== LOCK) assert.equal(existsSync(join(other.local, 'active.lock')), false,
        'NATIVE_OTHER_APPLICATION_LOCK');
  }
  function resources() {
    const memory = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'));
    assert.ok(memory, 'NATIVE_MEMAVAILABLE_UNAVAILABLE');
    const disk = statfsSync(ROOT, { bigint: true }), diskBytes = disk.bavail * disk.bsize;
    assert.ok(diskBytes <= BigInt(Number.MAX_SAFE_INTEGER), 'NATIVE_DISK_MEASUREMENT_RANGE');
    const group = groupResources(), main = group.processes.find(item => item.pid === child?.pid);
    const proofResources = nativeProofProcessResources(group.processes);
    return { at: new Date().toISOString(), elapsedMilliseconds: elapsed(),
      availableRAMBytes: integer(Number(memory[1]) * 1024), freeDiskBytes: integer(Number(diskBytes)),
      supervisorRSSBytes: integer(process.memoryUsage().rss), mainWorkerRSSBytes: main?.rssBytes ?? 0,
      descendantRSSBytes: integer(group.rssBytes - (main?.rssBytes ?? 0)), ownedGroupRSSBytes: group.rssBytes,
      ...proofResources, ownedGroupLiveCount: group.liveCount, ownedProcesses: group.processes };
  }
  function recordSample(sample) {
    report.samples++; report.latestResources = sample;
    for (const key of METRICS) {
      report.resourceSummary[key].minimum = Math.min(report.resourceSummary[key].minimum, sample[key]);
      report.resourceSummary[key].maximum = Math.max(report.resourceSummary[key].maximum, sample[key]);
    }
    report.peakOwnedGroupLiveCount = Math.max(report.peakOwnedGroupLiveCount, sample.ownedGroupLiveCount);
    for (const item of sample.ownedProcesses) {
      const key = `${item.pid}:${item.startTimeTicks}`, prior = history.get(key);
      if (!prior) history.set(key, { ...item, firstObservedMilliseconds: sample.elapsedMilliseconds,
        lastObservedMilliseconds: sample.elapsedMilliseconds, peakRSSBytes: item.rssBytes });
      else { prior.lastObservedMilliseconds = sample.elapsedMilliseconds;
        prior.peakRSSBytes = Math.max(prior.peakRSSBytes, item.rssBytes); prior.lastState = item.state; }
    }
    report.processHistory = [...history.values()];
  }
  function signalOwnedGroup(signal) {
    if (!child?.pid || groupGone || groupOwnershipLost || !workerIdentity) return false;
    try {
      const sample = resources(); recordSample(sample);
      if (!sample.ownedGroupLiveCount) return true;
      const anchor = sample.ownedProcesses.find(item => live(item) && sameIdentity(item, identities.get(item.pid)));
      assert.ok(anchor, 'NATIVE_SIGNAL_IDENTITY_UNCONFIRMED');
      // Check the same identity immediately before signaling the original
      // spawn-owned group. No discovered PID/group is ever a signal target.
      const current = procStat(anchor.pid);
      assert.ok(sameIdentity(current, anchor) && current.pgrp === child.pid && current.session === child.pid,
        'NATIVE_SIGNAL_IDENTITY_CHANGED');
    } catch (error) {
      fail('NATIVE_SIGNAL_OWNERSHIP_UNCONFIRMED', { errorCode: publicErrorCode(error), classification: publicFailureCode(error) });
      bestEffortSave(); return false;
    }
    const event = { signal, group: child.pid, elapsedMilliseconds: elapsed(), at: new Date().toISOString() };
    report.groupSignals.push(event); bestEffortSave();
    try {
      if (signal === 'SIGTERM' && termAt === null) termAt = elapsed();
      process.kill(-child.pid, signal); event.sent = true;
    } catch (error) {
      event.sent = false; event.errorCode = publicErrorCode(error);
      if (error.code === 'ESRCH') groupGone = true;
      else fail('NATIVE_OWNED_GROUP_SIGNAL_FAILURE', { signal, errorCode: publicErrorCode(error) });
    }
    bestEffortSave(); return event.sent === true || groupGone;
  }
  function escalate() {
    if (finished || groupGone || termAt === null) return;
    const remaining = NATIVE_FLOW_LIMITS.killGraceMilliseconds - (elapsed() - termAt);
    if (remaining > 0) { killTimer = setTimeout(escalate, remaining); return; }
    try { const sample = resources(); recordSample(sample); report.escalationResourceSample = sample; }
    catch (error) { report.escalationSampleError = publicErrorCode(error); }
    signalOwnedGroup('SIGKILL');
  }
  function stop(code, details = {}, measuredSample) {
    fail(code, details);
    if (finished || stopping) { bestEffortSave(); return; }
    stopping = true;
    if (report) report.phase = 'stopping';
    try {
      const sample = measuredSample ?? resources();
      if (!measuredSample) recordSample(sample);
      report.failureResourceSample = sample;
    } catch (error) { if (report) report.failureSampleError = { errorCode: publicErrorCode(error), classification: publicFailureCode(error) }; }
    bestEffortSave();
    if (!child?.pid) { resolveCompletion(); return; }
    signalOwnedGroup('SIGTERM');
    killTimer = setTimeout(escalate, NATIVE_FLOW_LIMITS.killGraceMilliseconds);
    cleanupTimer = setTimeout(() => finalize('NATIVE_CLEANUP_DEADLINE'), NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds);
  }
  function poll() {
    if (finished || finishing || !report) return;
    try {
      if (wrappedSourceBinding) {
        try { inspectWrappedInstallationSourcesV2(); }
        catch (error) { stop('NATIVE_RESOURCE_MONITOR_FAILURE', { errorCode: publicErrorCode(error), classification: publicFailureCode(error) }); }
      }
      // Source failure stays latched, while original owned-group cleanup and
      // completion observation remain reachable on this and later polls.
      const sample = resources(); recordSample(sample);
      const reason = nativeResourceFailure(sample);
      if (reason) stop(reason, {}, sample);
      if(profile===FLOW_PROFILES.evmMetaMorphoExitRecoveryV1||profile===FLOW_PROFILES.evmAaveExitRecoveryV1){const forbidden=externalDefiVaultExitProcessFailureV1([...history.values()]);if(forbidden)stop(forbidden,{},sample);}
      if((profile===FLOW_PROFILES.nativeDeviceEconomicRecoveryV1||profile===FLOW_PROFILES.nativeDeviceEconomicNoteRecoveryV1||profile===FLOW_PROFILES.nativeDeviceLiveArmedShortV1)&&[...history.values()].some(row=>row.role==='native-economic-unexpected-process'))
        stop('NATIVE_ECONOMIC_FIXED_PROCESS_REQUIRED',{},sample);
      if(profile===FLOW_PROFILES.nativeSourceAbruptV1&&[...history.values()].some(row=>row.role==='native-source-unexpected-process'))stop('NATIVE_SOURCE_FIXED_PROCESS_REQUIRED',{},sample);
      if((profile===FLOW_PROFILES.deviceExternalFlatErc20V1||profile===FLOW_PROFILES.deviceExternalFlatGraphV1||profile===FLOW_PROFILES.deviceMorphoBlueGraphV1)&&[...history.values()].some(row=>row.role==='device-external-flat-unexpected-process'))stop('DEVICE_EXTERNAL_FLAT_FIXED_PROCESS_REQUIRED',{},sample);
      if (profile === FLOW_PROFILES.jupiterOrcaPublicSwapV1) {
        const forbidden = jupiterOrcaSwapProcessFailureV1([...history.values()]);
        if(forbidden)stop(forbidden,{},sample);
      }
      if(profile===FLOW_PROFILES.nativeSplClaimV1CompilationOnly){const forbidden=nativeSplClaimV1CompilationProcessFailure([...history.values()]);if(forbidden)stop(forbidden,{},sample);if(sample.elapsedMilliseconds>SPL_CLAIM_V1_COMPILATION_DEADLINE)stop('SPL_CLAIM_V1_COMPILATION_FIXED_DEADLINE',{},sample);}
      if(profile===FLOW_PROFILES.nativeSplClaimValidationCompilationOnlyV1){const forbidden=nativeSplClaimValidationCompilationProcessFailureV1([...history.values()]);if(forbidden)stop(forbidden,{},sample);if(sample.elapsedMilliseconds>60000)stop('SPL_VALIDATION_COMPILATION_FIXED_DEADLINE',{},sample);}
      if(profile===FLOW_PROFILES.nativeSplClaimTokenCompilationOnlyV1){const forbidden=nativeSplClaimTokenCompilationProcessFailureV1([...history.values()]);if(forbidden)stop(forbidden,{},sample);if(sample.elapsedMilliseconds>60000)stop('SPL_TOKEN_COMPILATION_FIXED_DEADLINE',{},sample);}
      if (profile === FLOW_PROFILES.evmAaveCompilationOnlyV1) {
        const forbidden = aaveCompilationProcessFailureV1([...history.values()]);
        if(forbidden)stop(forbidden,{},sample);
      }
      if(profile===FLOW_PROFILES.nativeSplCompilationOnlyV1){
        const forbidden=nativeSplCompilationProcessFailureV1([...history.values()]);if(forbidden)stop(forbidden,{},sample);
        if(sample.elapsedMilliseconds>SPL_COMPILATION_LIMITS_V1.deadlineMilliseconds)stop('SPL_COMPILATION_FIXED_DEADLINE',{},sample);
      }
      if (profile === FLOW_PROFILES.nativeClaimBeginPayoutAuditV1) {
        const forbidden = beginPayoutAuditProcessFailureV1([...history.values()]);
        if (forbidden) stop(forbidden, {}, sample);
      }
      if (profile === FLOW_PROFILES.nativeIngressV3ProductionPreflight) {
        const forbidden = productionPreflightForbiddenProcess(sample.ownedProcesses);
        if (forbidden) stop(forbidden, {}, sample);
      }
      if (profile === FLOW_PROFILES.nativeIngressV3Preflight) {
        const forbidden = preflightForbiddenProcess(sample.ownedProcesses);
        if (forbidden) stop(forbidden, {}, sample);
      }
      if(coldCycle&&report.activeColdStage===0){const forbidden=wrappedColdStageProcessFailureV1(0,sample.ownedProcesses);if(forbidden)stop(forbidden,{},sample);}
      if (profile === FLOW_PROFILES.wrappedWalletFixedPreflight || profile === FLOW_PROFILES.wrappedDeploymentOnly) {
        const forbidden = nativeWalletUnfundedProcessFailure(sample.ownedProcesses) || (sample.ownedProcesses.some(p => p.proofWorker || p.role === 'wrapped-claim-proof-role') ? 'WRAPPED_PREFLIGHT_PROOF_FORBIDDEN' : null);
        if (forbidden) stop(forbidden, {}, sample);
      }
      if (profile === FLOW_PROFILES.developmentOsakaSmoke) {
        const forbidden = osakaSmokeProcessFailure(sample.ownedProcesses);
        if (forbidden) stop(forbidden, {}, sample);
      }
      if (profile === FLOW_PROFILES.nativeWalletRealPreflight) {
        const forbidden = nativeWalletUnfundedProcessFailure(sample.ownedProcesses);
        if (forbidden) stop(forbidden, {}, sample);
      }
      if (profile === FLOW_PROFILES.nativeClaimUnfundedHealth) {
        const forbidden = unfundedHealthProcessFailure(sample.ownedProcesses);
        if (forbidden) stop(forbidden, {}, sample);
      }
      if (profile === FLOW_PROFILES.nativeClaimEmptyAuditMetrics) {
        const forbidden = emptyAuditProcessFailure(sample.ownedProcesses);
        if (forbidden) stop(forbidden, {}, sample);
      }
      // Failed proof attempts deliberately retain their lock. That lock is
      // evidence, not an unrelated group we are allowed to stop or clean up.
      if (!stopping && !childExited) { assertHeavyLocks(); assertOtherIntegrationLocks(); }
      if (!bestEffortSave()) stop('NATIVE_EVIDENCE_WRITE_FAILURE', {}, sample);
      if (childExited && sample.ownedGroupLiveCount > 0)
        stop('NATIVE_WORKER_EXITED_WITH_LIVE_DESCENDANTS', {}, sample);
      if (childClosed && sample.ownedGroupLiveCount === 0 && (!coldCycle||groupGone)) resolveCompletion();
    } catch (error) {
      stop('NATIVE_RESOURCE_MONITOR_FAILURE', { errorCode: publicErrorCode(error), classification: publicFailureCode(error),
        ...(nativeProcStatIntegerDiagnosticV1(error) ? { procStatIntegerDiagnostic: nativeProcStatIntegerDiagnosticV1(error) } : {}),
        stackFrames: typeof error?.stack === 'string' ? error.stack.split('\n')
          .filter(line => /^\s+at /.test(line)).slice(0, 12) : [] });
    }
  }
  function releaseLock() {
    if (!lockIdentity) return;
    if (child?.pid && (!childClosed || !finalGroupMeasurementSucceeded
      || report?.finalResources?.ownedGroupLiveCount !== 0 || groupOwnershipLost)) {
      if (report) report.lockRetained = true; return;
    }
    try {
      const stat = lstatSync(LOCK), value = JSON.parse(readRegular(LOCK, 4096));
      assert.ok(stat.isFile() && stat.ino === lockIdentity.ino && stat.dev === lockIdentity.dev,
        'NATIVE_LOCK_IDENTITY_CHANGED');
      assert.equal(value.pid, process.pid, 'NATIVE_LOCK_OWNER_CHANGED');
      assert.equal(value.runId, runId, 'NATIVE_LOCK_RUN_CHANGED');
      assert.equal(value.attempt, relative(ROOT, attempt), 'NATIVE_LOCK_ATTEMPT_CHANGED');
      assert.equal(value.supervisorStartTimeTicks, report.supervisorIdentity.startTimeTicks, 'NATIVE_LOCK_START_CHANGED');
      unlinkSync(LOCK); lockIdentity = null; report.lockReleased = true;
    } catch (error) { fail('NATIVE_LOCK_RELEASE_FAILURE', { errorCode: publicErrorCode(error) }); report.lockRetained = true; }
  }
  function finalize(deadlineFailure = null) {
    if (finishing || finished) return;
    finishing = true;
    clearInterval(monitorTimer);
    for (const timer of [reserveTimer, hardTimer, killTimer, cleanupTimer]) clearTimeout(timer);
    if (deadlineFailure) {
      fail(deadlineFailure);
      if (termAt !== null && elapsed() - termAt >= NATIVE_FLOW_LIMITS.killGraceMilliseconds) signalOwnedGroup('SIGKILL');
    }
    if (report) {
      try {
        const sample = resources(); recordSample(sample); report.finalResources = sample;
        finalGroupMeasurementSucceeded = true;
        const reason = nativeResourceFailure(sample); if (reason) fail(reason, { sample });
      } catch (error) { fail('NATIVE_FINAL_RESOURCE_MEASUREMENT_FAILURE', { errorCode: publicErrorCode(error) }); }
      if(profile===FLOW_PROFILES.evmMetaMorphoExitRecoveryV1||profile===FLOW_PROFILES.evmAaveExitRecoveryV1){const forbidden=externalDefiVaultExitProcessFailureV1([...history.values()]);if(forbidden)fail(forbidden);}
      if((profile===FLOW_PROFILES.nativeDeviceEconomicRecoveryV1||profile===FLOW_PROFILES.nativeDeviceEconomicNoteRecoveryV1||profile===FLOW_PROFILES.nativeDeviceLiveArmedShortV1)&&[...history.values()].some(row=>row.role==='native-economic-unexpected-process'))
        fail('NATIVE_ECONOMIC_FIXED_PROCESS_REQUIRED');
      if(profile===FLOW_PROFILES.nativeSourceAbruptV1&&[...history.values()].some(row=>row.role==='native-source-unexpected-process'))fail('NATIVE_SOURCE_FIXED_PROCESS_REQUIRED');
      if((profile===FLOW_PROFILES.deviceExternalFlatErc20V1||profile===FLOW_PROFILES.deviceExternalFlatGraphV1||profile===FLOW_PROFILES.deviceMorphoBlueGraphV1)&&[...history.values()].some(row=>row.role==='device-external-flat-unexpected-process'))fail('DEVICE_EXTERNAL_FLAT_FIXED_PROCESS_REQUIRED');
      if (!workerSpawned) fail('NATIVE_WORKER_NOT_STARTED');
      else if (!childExited || !childClosed) fail('NATIVE_WORKER_EXIT_OR_CLOSE_NOT_OBSERVED');
      if (profile === FLOW_PROFILES.wrappedWalletFixedPreflight || profile === FLOW_PROFILES.wrappedDeploymentOnly) {
        const forbidden = nativeWalletUnfundedProcessFailure([...history.values()]) || ([...history.values()].some(p => p.proofWorker || p.role === 'wrapped-claim-proof-role') ? 'WRAPPED_PREFLIGHT_PROOF_FORBIDDEN' : null);
        if (forbidden) fail(forbidden);
      }
      if (profile === FLOW_PROFILES.jupiterOrcaPublicSwapV1) {
        const forbidden = jupiterOrcaSwapProcessFailureV1([...history.values()]);
        if(forbidden)fail(forbidden);
      }
      if(profile===FLOW_PROFILES.nativeSplClaimV1CompilationOnly){const forbidden=nativeSplClaimV1CompilationProcessFailure([...history.values()]);if(forbidden)fail(forbidden);if(elapsed()>SPL_CLAIM_V1_COMPILATION_DEADLINE)fail('SPL_CLAIM_V1_COMPILATION_FIXED_DEADLINE');}
      if(profile===FLOW_PROFILES.nativeSplClaimValidationCompilationOnlyV1){const forbidden=nativeSplClaimValidationCompilationProcessFailureV1([...history.values()]);if(forbidden)fail(forbidden);if(elapsed()>60000)fail('SPL_VALIDATION_COMPILATION_FIXED_DEADLINE');}
      if(profile===FLOW_PROFILES.nativeSplClaimTokenCompilationOnlyV1){const forbidden=nativeSplClaimTokenCompilationProcessFailureV1([...history.values()]);if(forbidden)fail(forbidden);if(elapsed()>60000)fail('SPL_TOKEN_COMPILATION_FIXED_DEADLINE');}
      if (profile === FLOW_PROFILES.evmAaveCompilationOnlyV1) {
        const forbidden = aaveCompilationProcessFailureV1([...history.values()]);
        if(forbidden)fail(forbidden);
      }
      if(profile===FLOW_PROFILES.nativeSplCompilationOnlyV1){
        const forbidden=nativeSplCompilationProcessFailureV1([...history.values()]);if(forbidden)fail(forbidden);
        if(elapsed()>SPL_COMPILATION_LIMITS_V1.deadlineMilliseconds)fail('SPL_COMPILATION_FIXED_DEADLINE');
      }
      if (profile === FLOW_PROFILES.developmentOsakaSmoke) {
        const forbidden = osakaSmokeProcessFailure([...history.values()]);
        if (forbidden) fail(forbidden);
      }
      if (profile === FLOW_PROFILES.nativeWalletRealPreflight) {
        const forbidden = nativeWalletUnfundedProcessFailure([...history.values()]);
        if (forbidden) fail(forbidden);
      }
      if (profile === FLOW_PROFILES.nativeClaimUnfundedHealth) {
        const forbidden = unfundedHealthProcessFailure([...history.values()]);
        if (forbidden) fail(forbidden);
      }
      if (profile === FLOW_PROFILES.nativeClaimEmptyAuditMetrics) {
        const forbidden = emptyAuditProcessFailure([...history.values()]);
        if (forbidden) fail(forbidden);
      }
      if (profile === FLOW_PROFILES.nativeClaimBeginPayoutAuditV1) {
        const forbidden = beginPayoutAuditProcessFailureV1([...history.values()], true);
        if (forbidden) fail(forbidden);
      }
      if (profile === FLOW_PROFILES.nativeIngressV3ProductionPreflight) {
        const forbidden = productionPreflightForbiddenProcess([...history.values()]); if (forbidden) fail(forbidden);
      }
      if (profile === FLOW_PROFILES.nativeIngressV3Preflight) {
        const forbidden = preflightForbiddenProcess([...history.values()]); if (forbidden) fail(forbidden);
      }
      if (childExited && (report.workerExit.code !== 0 || report.workerExit.signal !== null)) fail('NATIVE_WORKER_EXIT_FAILURE');
      if (childClosed && (report.workerClose.code !== 0 || report.workerClose.signal !== null)) fail('NATIVE_WORKER_CLOSE_FAILURE');
      if (workerSpawned && (!finalGroupMeasurementSucceeded || report.finalResources?.ownedGroupLiveCount !== 0
        || groupOwnershipLost)) fail('NATIVE_OWNED_GROUP_CLEANUP_UNCONFIRMED');
      if (sourcePins) {
        try {
          if (wrappedSourceBinding) inspectWrappedInstallationSourcesV2();
          assert.deepEqual(profile.sourcePins(), sourcePins, 'NATIVE_SOURCE_CLOSURE_CHANGED');
          report.sourceClosureUnchanged = true;
        } catch (error) {
          fail('NATIVE_SOURCE_CLOSURE_CHANGED', { errorCode: publicErrorCode(error), classification: publicFailureCode(error) });
        }
      }
      if (workerSpawned && childClosed) {
        try {
          const bytes = readRegular(resultPath), parsed = JSON.parse(bytes);
          validateResultIdentity(parsed, process.pid, child.pid, profile);
          assert.equal(assertNativeFlowRunId(parsed.runId), runId, 'NATIVE_RESULT_RUN_BINDING');
          assert.deepEqual(parsed.sourcePins, sourcePins, 'NATIVE_RESULT_SOURCE_BINDING');
          const resultMetadata = { runId, path: relative(ROOT, resultPath), bytes: bytes.length, sha256: HASH(bytes) };
          if (parsed.phase === 'failed' && parsed.success === false) {
            report.workerResult = { ...resultMetadata, format: parsed.format, phase: 'failed', success: false,
              errorCode: coldCycle ? 'WRAPPED_FIXED_ORIGINAL_ACCEPTANCE_INCOMPLETE' : typeof parsed.errorCode === 'string' && /^[A-Z][A-Z0-9_]{2,160}$/.test(parsed.errorCode)
                ? parsed.errorCode : 'NATIVE_WORKER_REPORTED_UNCLASSIFIED_FAILURE',
              cleanup: Object.fromEntries(['closedEvm', 'closedSolana', 'closedBitcoin']
                .map(key => [key, [true, false, null].includes(parsed.cleanup?.[key]) ? parsed.cleanup[key] : 'unreported'])) };
            fail('NATIVE_WORKER_REPORTED_FAILURE', { classification: report.workerResult.errorCode });
          } else {
            report.workerResult = { ...validateCompletedResult(parsed, process.pid, child.pid, profile), ...resultMetadata };
            if(coldCycle){assert.equal(report.coldRecoveryStages.length,3);assert.equal(report.coldRecoveryComplete,true);assert.equal(new Set(report.coldRecoveryStages.map(row=>row.workerIdentity.pid+':'+row.workerIdentity.startTimeTicks)).size,3);}
            report.resultAccepted = !failure;
          }
        } catch (error) {
          fail(!existsSync(resultPath) ? 'NATIVE_WORKER_RESULT_MISSING' : error instanceof SyntaxError
            ? 'NATIVE_WORKER_RESULT_MALFORMED' : 'NATIVE_WORKER_RESULT_REJECTED',
            { errorCode: publicErrorCode(error), classification: publicFailureCode(error) });
        }
      }
      report.output = Object.fromEntries(Object.entries(streams).map(([key, item]) =>
        [key, { bytes: item.bytes, sha256: item.hash.copy().digest('hex') }]));
      report.workerSpawned = workerSpawned; report.workerExitObserved = childExited; report.workerCloseObserved = childClosed;
      report.ownedGroupCleanupConfirmed = finalGroupMeasurementSucceeded
        && report.finalResources.ownedGroupLiveCount === 0 && !groupOwnershipLost;
      report.completedAt = new Date().toISOString(); report.elapsedMilliseconds = elapsed();
      report.withinTotalDeadline = elapsed() < NATIVE_FLOW_LIMITS.totalMilliseconds;
      if (!report.withinTotalDeadline) fail('NATIVE_TOTAL_DEADLINE');
      report.phase = failure ? 'failed' : 'completed';
      // Persist outcome first. An evidence failure preserves the lock so an
      // ambiguous attempt cannot silently be treated as reusable success.
      const saved = bestEffortSave();
      if (saved) releaseLock(); else report.lockRetained = Boolean(lockIdentity);
      report.phase = failure ? 'failed' : 'completed'; report.failure = failure;
      bestEffortSave();
      if (elapsed() >= NATIVE_FLOW_LIMITS.totalMilliseconds) {
        fail('NATIVE_TOTAL_DEADLINE'); report.phase = 'failed'; report.withinTotalDeadline = false; bestEffortSave();
      }
    }
    finished = true; resolveCompletion();
    process.exitCode = failure ? 1 : 0;
    for (const stream of child?.stdio ?? []) stream?.destroy();
    process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
    process.removeListener('uncaughtException', onUncaught); process.removeListener('unhandledRejection', onRejected);
    console.log(JSON.stringify({ phase: report?.phase ?? 'failed', failure,
      runId,
      attempt: attemptCreated ? relative(ROOT, attempt) : null,
      workerFailure: report?.workerResult?.errorCode ?? null,
      resultAccepted: report?.resultAccepted === true, ownedGroupCleanupConfirmed: report?.ownedGroupCleanupConfirmed === true,
      workerExit: report?.workerExit ?? null, workerClose: report?.workerClose ?? null,
      resourceSummary: report?.resourceSummary ?? null }));
    if (deadlineFailure) process.exit(1);
  }
  const onTerm = () => stop('NATIVE_SUPERVISOR_SIGTERM');
  const onInt = () => stop('NATIVE_SUPERVISOR_SIGINT');
  const onUncaught = error => stop('NATIVE_SUPERVISOR_UNCAUGHT_EXCEPTION', { errorCode: publicErrorCode(error), classification: publicFailureCode(error) });
  const onRejected = error => stop('NATIVE_SUPERVISOR_UNHANDLED_REJECTION', { errorCode: publicErrorCode(error), classification: publicFailureCode(error) });

  try {
    assert.equal(process.platform, 'linux', 'NATIVE_LINUX_ONLY');
    assert.equal(process.argv.length, 2, 'NATIVE_NO_CALLER_ARGUMENTS');
    assert.deepEqual(process.execArgv, [], 'NATIVE_NO_NODE_ARGUMENTS');
    assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'NATIVE_NO_NODE_INJECTION');
    assert.equal(realpathSync(ROOT), ROOT, 'NATIVE_REPOSITORY_SYMLINK');
    assert.equal(realpathSync(process.cwd()), ROOT, 'NATIVE_REPOSITORY_CWD_REQUIRED');
    assert.equal(resolve(process.argv[1]), ENTRY, 'NATIVE_EXACT_SUPERVISOR_ENTRY');
    assert.equal(realpathSync(ENTRY), ENTRY, 'NATIVE_ENTRY_SYMLINK');
    assert.equal(NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes, PROOF_LIMITS.availableRAM, 'NATIVE_RAM_POLICY_UNCHANGED');
    assert.equal(NATIVE_FLOW_LIMITS.minimumFreeDiskBytes, PROOF_LIMITS.freeDisk, 'NATIVE_DISK_POLICY_UNCHANGED');
    assert.equal(NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes, PROOF_LIMITS.workerRSS, 'NATIVE_RSS_POLICY_UNCHANGED');
    assert.equal(NATIVE_FLOW_LIMITS.sampleMilliseconds, PROOF_LIMITS.sampleMilliseconds, 'NATIVE_SAMPLE_POLICY_UNCHANGED');
    ensureDirectory(LOCAL, profile);
    assert.equal(existsSync(attempt), false, 'NATIVE_ATTEMPT_ALREADY_EXISTS');
    ensureDirectory(attempt, profile); attemptCreated = true;
    const supervisorIdentity = procStat(process.pid);
    assert.ok(supervisorIdentity, 'NATIVE_SUPERVISOR_IDENTITY');
    report = { format: profile.resourcesFormat,
      classification: profile.classification, phase: 'preflight', startedAt, runId,
      ...(coldCycle?{coldRecoveryStages:[],coldRecoveryComplete:false}:{}),
      supervisorPID: process.pid, supervisorIdentity, node: process.version, limits: NATIVE_FLOW_LIMITS,
      resourcePolicy: PRIVATE_RESOURCE_POLICY, proofPhaseTimeoutMilliseconds: PROOF_LIMITS.phaseTimeoutMilliseconds,
      environment: CLEAN_ENV, detachedWorker: true, hostLimitsChanged: false,
      timeoutScope: 'one fixed 90-minute flow budget including setup, cleanup and evidence; per-proof budgets unchanged',
      aggregateGroupRSSPolicy: 'measurement only; 3 GiB applies independently to main and each proof worker',
      localOnly: true, fakeFundsOnly: true, publicNetwork: false,
      outputPolicy: 'count and SHA256 only; no raw worker stdout/stderr, argv, environment or witness export',
      samples: 0, peakOwnedGroupLiveCount: 0, resultAccepted: false, failure: null, failures: [], groupSignals: [],
      processHistory: [], resourceSummary: Object.fromEntries(METRICS.map(key =>
        [key, { minimum: Number.MAX_SAFE_INTEGER, maximum: 0 }])) };
    save();
    assert.equal(existsSync(LOCK), false, 'NATIVE_FLOW_LOCK_BUSY');
    assertOtherApplicationLocks();
    lockIdentity = writeExclusive(LOCK, json({ format: profile.lockFormat, pid: process.pid, runId,
      supervisorStartTimeTicks: supervisorIdentity.startTimeTicks, startedAt, attempt: relative(ROOT, attempt) }));
    writeExclusive(join(attempt, 'attempt.json'), json({ format: profile.attemptFormat,
      startedAt, runId, supervisorIdentity, worker: relative(ROOT, WORKER), entry: relative(ROOT, ENTRY),
      limits: NATIVE_FLOW_LIMITS, environment: CLEAN_ENV, localOnly: true, fakeFundsOnly: true, publicNetwork: false }));
    assert.equal(existsSync(WORKER), true, 'NATIVE_WORKER_MISSING');
    assert.equal(realpathSync(WORKER), WORKER, 'NATIVE_WORKER_SYMLINK');
    hardTimer = setTimeout(() => finalize('NATIVE_TOTAL_DEADLINE'), Math.max(0, NATIVE_FLOW_LIMITS.totalMilliseconds - elapsed()));
    reserveTimer = setTimeout(() => stop('NATIVE_DEADLINE_CLEANUP_RESERVE'),
      Math.max(0, NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds - elapsed()));
    const initial = resources(); recordSample(initial); report.initialResources = initial;
    const reason = nativeResourceFailure(initial);
    if (reason) { report.failureResourceSample = initial; fail(reason); }
    assertHeavyLocks();
    assertOtherIntegrationLocks();
    if (wrappedSourceBinding) inspectWrappedInstallationSourcesV2();
    sourcePins = profile.sourcePins();
    writeExclusive(sourcePath, json(sourcePins));
    report.sourcePinsSHA256 = HASH(readRegular(sourcePath)); report.sourcePins = sourcePins;
    save();
    assert.ok(elapsed() < NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds,
      'NATIVE_INITIALIZATION_DEADLINE');
    if (!failure) {
      process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
      process.on('uncaughtException', onUncaught); process.on('unhandledRejection', onRejected);
      if(coldCycle)writeExclusive(join(LOCAL,'cold-release-'+assertWrappedColdCycleReleaseV1()+'.consumed.json'),json({schema:'WRAPPED_FIXED_COLD_ONE_ATTEMPT_V1',runId,supervisorIdentity,startedAt,sourceSHA256:wrappedColdSourceIdentityV1(sourcePins)}));
      let previousBoundary=null;
      for(let stageIndex=0;stageIndex<(coldCycle?3:1);stageIndex++){
        if(failure||stopping)break;
        if(coldCycle){completion=new Promise(resolveDone=>{resolveCompletion=resolveDone;});child=null;workerIdentity=null;workerSpawned=false;childExited=false;childClosed=false;groupGone=false;
          delete report.workerExit;delete report.workerClose;delete report.workerPID;delete report.workerIdentity;report.activeColdStage=stageIndex;}
      report.phase = 'starting'; save();
      if (wrappedSourceBinding) inspectWrappedInstallationSourcesV2();
      child = spawn(process.execPath, [WORKER], { cwd: ROOT, env: CLEAN_ENV, detached: true,
        stdio: ['ignore', 'pipe', 'pipe'] });
      child.once('error', error => stop('NATIVE_WORKER_SPAWN_OR_PROCESS_ERROR', { errorCode: publicErrorCode(error) }));
      child.once('exit', (code, signal) => {
        childExited = true; report.workerExit = { code, signal, elapsedMilliseconds: elapsed() };
        if (code !== 0 || signal !== null) stop('NATIVE_WORKER_EXIT_FAILURE');
        poll();
      });
      child.once('close', (code, signal) => {
        childClosed = true; report.workerClose = { code, signal, elapsedMilliseconds: elapsed() };
        if (code !== 0 || signal !== null) stop('NATIVE_WORKER_CLOSE_FAILURE');
        poll();
      });
      child.once('spawn', () => {
        try {
          workerSpawned = true; workerIdentity = procStat(child.pid);
          assert.ok(workerIdentity && workerIdentity.pgrp === child.pid && workerIdentity.session === child.pid,
            'NATIVE_WORKER_START_IDENTITY');
          identities.set(child.pid, workerIdentity);
          report.workerPID = child.pid; report.workerIdentity = workerIdentity;
          if(coldCycle)writeWrappedColdStageGrantV1({attempt,runId,sourceSHA256:wrappedColdSourceIdentityV1(sourcePins),deadlineMs:Date.parse(startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds,index:stageIndex,
            worker:{pid:workerIdentity.pid,startTimeTicks:workerIdentity.startTimeTicks},supervisor:{pid:supervisorIdentity.pid,startTimeTicks:supervisorIdentity.startTimeTicks},previous:previousBoundary});
          report.ownedProcessGroup = child.pid; report.phase = 'running'; poll();
        } catch (error) { stop('NATIVE_WORKER_IDENTITY_UNOBSERVED', { errorCode: publicErrorCode(error), classification: publicFailureCode(error) }); }
      });
      for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
        stream.on('data', bytes => {
          streams[name].bytes += bytes.length; streams[name].hash.update(bytes);
          report.outputBytes = streams.stdout.bytes + streams.stderr.bytes;
          if (report.outputBytes > NATIVE_FLOW_LIMITS.maximumOutputBytes)
            stop('NATIVE_WORKER_OUTPUT_LIMIT', { observedBytes: report.outputBytes });
        });
        stream.once('error', error => stop('NATIVE_WORKER_OUTPUT_ERROR', { stream: name, errorCode: publicErrorCode(error) }));
      }
      monitorTimer = setInterval(poll, NATIVE_FLOW_LIMITS.sampleMilliseconds);
      await completion;
        clearInterval(monitorTimer);monitorTimer=null;
        if(coldCycle&&!failure&&!stopping){
          const finalStageSample=resources();recordSample(finalStageSample);assert.equal(groupGone,true,'WRAPPED_COLD_PRIOR_GROUP_NOT_GONE');assert.equal(finalStageSample.ownedGroupLiveCount,0);
          assert.equal(childExited,true);assert.equal(childClosed,true);assert.deepEqual(report.workerExit.code,0);assert.equal(report.workerExit.signal,null);assert.equal(report.workerClose.code,0);assert.equal(report.workerClose.signal,null);
          const forbidden=wrappedColdStageProcessFailureV1(stageIndex,[...history.values()]);assert.equal(forbidden,null,'WRAPPED_COLD_PREPRINCIPAL_PROOF_FORBIDDEN');
          inspectWrappedInstallationSourcesV2();assert.deepEqual(profile.sourcePins(),sourcePins,'NATIVE_SOURCE_CLOSURE_CHANGED');assertHeavyLocks();assertOtherIntegrationLocks();
          const stageBytes=readRegular(resultPath),stageResult=JSON.parse(stageBytes);validateResultIdentity(stageResult,process.pid,child.pid,profile);assert.equal(stageResult.runId,runId);assert.deepEqual(stageResult.sourcePins,sourcePins);
          writeExclusive(join(attempt,'cold-stage-'+stageIndex+'-result.json'),stageBytes);
          if(stageIndex<2)previousBoundary=assertWrappedColdBoundaryV1(stageResult,{attempt,runId,sourceSHA256:wrappedColdSourceIdentityV1(sourcePins),deadlineMs:Date.parse(startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds,index:stageIndex});
          else{validateCompletedResult(stageResult,process.pid,child.pid,profile);report.coldRecoveryComplete=true;}
          report.coldRecoveryStages.push({index:stageIndex,workerIdentity:{pid:workerIdentity.pid,startTimeTicks:workerIdentity.startTimeTicks},exit:{code:0,signal:null},close:{code:0,signal:null},ownedGroupGone:true,resultSHA256:HASH(stageBytes),boundary:stageIndex<2?previousBoundary:null});save();
        }
      }

    }
  } catch (error) {
    fail(publicFailureCode(error), { errorCode: publicErrorCode(error) });
    if (child?.pid && !childClosed) { stop('NATIVE_SUPERVISOR_FAILURE'); await completion; }
  } finally { finalize(); }
  return report;
}

export function runEvmMetaMorphoExitRecoverySupervisorV1(){assert.equal(arguments.length,0);assertExternalVaultExitRecoveryReleaseV1();return runFixedFlowSupervisor(FLOW_PROFILES.evmMetaMorphoExitRecoveryV1);}
export function runEvmAaveExitRecoverySupervisorV1(){assert.equal(arguments.length,0);assertExternalVaultExitRecoveryReleaseV1();return runFixedFlowSupervisor(FLOW_PROFILES.evmAaveExitRecoveryV1);}

export async function runDeviceExternalFlatErc20SupervisorV1(){assert.equal(arguments.length,0);assertDeviceExternalFlatErc20ReleaseV1();await assertNativeEconomicRecoverableAnvilV1();return runFixedFlowSupervisor(FLOW_PROFILES.deviceExternalFlatErc20V1);}

export async function runDeviceExternalFlatGraphSupervisorV1(){assert.equal(arguments.length,0);assertDeviceExternalFlatGraphReleaseV1();await assertNativeEconomicRecoverableAnvilV1();return runFixedFlowSupervisor(FLOW_PROFILES.deviceExternalFlatGraphV1);}

export async function runDeviceMorphoBlueGraphSupervisorV1(){assert.equal(arguments.length,0);assertDeviceMorphoBlueGraphReleaseV1();await assertNativeEconomicRecoverableAnvilV1();return runFixedFlowSupervisor(FLOW_PROFILES.deviceMorphoBlueGraphV1);}
