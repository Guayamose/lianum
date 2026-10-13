/** Canonical fixed-attempt recovery composition. The original resource owners
 * and lazy loaders are bound once here; no canonical setter or registry writer
 * escapes. Public methods retain their original signatures and guards. */
import assert from 'node:assert/strict';
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
// These fixed loaders also serve the existing recovery owner below. The Paged
// birth path only creates isolated ledgers; it does not enter recovery or mint
// recovery capabilities.
const ownedNativeRuntimeLoaders = Object.freeze({
  bitcoin: () => import("../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs"),
  solana: () => import("../../../chains/solana/runtime/owned-solana-runtime.mjs"),
});
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
      ownedBitcoinRuntime: ownedNativeRuntimeLoaders.bitcoin,
      ownedSolanaRuntime: ownedNativeRuntimeLoaders.solana,
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

/** Fixed original three-ledger birth. No injected runtime, loader, guard or
 * recovery token is accepted. Each port retains its runtime's original guard. */
const originalPagedCohortsV3=new WeakMap();
export async function createOwnedOriginalPagedNativeRuntimesV3() {
  if (arguments.length !== 0) throw new TypeError("PAGED_NATIVE_FIXED_RUNTIME_BIRTH");
  return createOriginalPagedCohortV3(false);
}
export async function createOwnedOriginalPagedDurableNativeRuntimesV3(){assert.equal(arguments.length,0);return createOriginalPagedCohortV3(true);}
async function createOriginalPagedCohortV3(durable){
  const [bitcoin, solana] = await Promise.all([
    ownedNativeRuntimeLoaders.bitcoin(),
    ownedNativeRuntimeLoaders.solana(),
  ]);
  const started = await Promise.allSettled([
    durable?canonicalEvmRuntime.createOwnedPagedNativeDurableEvmV3():canonicalEvmRuntime.createOwnedLocalPagedNativeEvmV3(),
    bitcoin.createOwnedFlatBitcoinRuntime(),
    solana.createOwnedSolanaCohortRuntime(),
  ]);
  const failed = started.find(result => result.status === "rejected");
  if (failed) {
    await Promise.allSettled(started.filter(result => result.status === "fulfilled").map(result => result.value.close()));
    throw failed.reason;
  }
  const [evmRuntime, bitcoinRuntime, solanaRuntime] = started.map(result => result.value);
  const ports = [
    { family: "EVM", runtime: evmRuntime, assertLive: () => canonicalEvmRuntime.assertOwnedLocalPagedNativeEvmV3(evmRuntime) },
    { family: "BTC", runtime: bitcoinRuntime, assertLive: () => bitcoin.assertOwnedBitcoinRuntimeLive(bitcoinRuntime) },
    { family: "SOL", runtime: solanaRuntime, assertLive: () => solana.assertOwnedSolanaRuntimeLive(solanaRuntime) },
  ];
  try {
    for (const port of ports) port.assertLive();
    const cohort=Object.freeze(ports.map(port => Object.freeze(port)));originalPagedCohortsV3.set(cohort,{bitcoin,solana,ports});return cohort;
  } catch (error) {
    await Promise.allSettled(ports.map(port => port.runtime.close()));
    throw error;
  }
}
/** Fixed cold cohort. Only one-use tokens from the authenticated supervisor
 * enter each runtime's own private reopening path. No supplied runtime/guard. */
export async function reopenOwnedOriginalPagedNativeRuntimesV3(tokens) {
  assert.equal(arguments.length,1);assert.deepEqual(Reflect.ownKeys(tokens).sort(),['BTC','EVM','SOL']);
  const [bitcoin,solana]=await Promise.all([ownedNativeRuntimeLoaders.bitcoin(),ownedNativeRuntimeLoaders.solana()]);
  const started=await Promise.allSettled([canonicalEvmRuntime.reopenOwnedPagedNativeEvmV3(tokens.EVM),bitcoin.reopenOwnedPagedBitcoinRecoveryV3(tokens.BTC),solana.reopenOwnedPagedSolanaRecoveryV3(tokens.SOL)]);
  const failed=started.find(result=>result.status==='rejected');if(failed){await Promise.allSettled(started.filter(result=>result.status==='fulfilled').map(result=>result.value.close()));throw failed.reason;}
  const [evmRuntime,bitcoinRuntime,solanaRuntime]=started.map(result=>result.value),ports=[{family:'EVM',runtime:evmRuntime,assertLive:()=>canonicalEvmRuntime.assertOwnedLocalPagedNativeEvmV3(evmRuntime)},{family:'BTC',runtime:bitcoinRuntime,assertLive:()=>bitcoin.assertOwnedBitcoinRuntimeLive(bitcoinRuntime)},{family:'SOL',runtime:solanaRuntime,assertLive:()=>solana.assertOwnedSolanaRuntimeLive(solanaRuntime)}];
  for(const port of ports)port.assertLive();const cohort=Object.freeze(ports.map(port=>Object.freeze(port)));originalPagedCohortsV3.set(cohort,{bitcoin,solana,ports});return cohort;
}
export async function captureOwnedOriginalPagedNativeRuntimesV3(cohort){
 assert.equal(arguments.length,1);const original=originalPagedCohortsV3.get(cohort);assert.ok(original,'PAGED_NATIVE_ORIGINAL_COHORT');for(const port of original.ports)port.assertLive();
 const [evm,bitcoin,solana]=original.ports.map(port=>port.runtime),captured=await Promise.allSettled([canonicalEvmRuntime.captureOwnedPagedEvmRecoveryV3(evm),original.bitcoin.captureOwnedPagedBitcoinRecoveryV3(bitcoin),original.solana.captureOwnedPagedSolanaRecoveryV3(solana)]);const failed=captured.find(result=>result.status==='rejected');if(failed)throw failed.reason;
 return {graphNative:captured[0].value,bitcoin:captured[1].value,solana:captured[2].value};
}

/** Closed before-birth composition from original handles, never supplied
 * callbacks. The returned mechanical methods retain those exact ownership joins. */
export async function openOriginalPagedUniswapConstructionV3(originals){
 assert.equal(arguments.length,1);const u={...originals};
 const [account,observer]=await Promise.all([import('../../../accounts/authority/device-external-flat-note-authority-v1.mjs'),import('../../../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs')]);
 function current(){canonicalEvmRuntime.assertOwnedDeviceExternalFlatReceiverLiveV1(u.runtime);externalBootstrapSystem.assertOwnedFlatSystem(u.runtime,u.system);externalBootstrapProtocols.assertOfficialProtocolFixture(u.runtime,u.protocolFixture);externalBootstrapRouters.assertOwnedPrivateExternalRouterV1(u.router,{runtime:u.runtime,system:u.system,poolIndex:1});observer.assertOwnedUniswapGraphDeliveryObserverV1(u.observer,{runtime:u.runtime,system:u.system,poolIndex:1});return account.assertOriginalDeviceExternalFlatShareNoteAuthorityV1(u.targetAccount,{runtime:u.runtime,system:u.system,poolIndex:1,deliveryObserver:u.observer});}
 current();return Object.freeze({assertLive:current,readD27(){current();return account.readOriginalDeviceExternalFlatD27PreparationV3(u.targetAccount,{runtime:u.runtime,system:u.system,poolIndex:1,deliveryObserver:u.observer});},consumeProof(terms){assert.deepEqual(Reflect.ownKeys(terms).sort(),['shareAmount','validFrom','validUntil']);current();return account.consumeOriginalDeviceExternalFlatShareProofV1(u.targetAccount,{runtime:u.runtime,system:u.system,poolIndex:1,deliveryObserver:u.observer,...terms});},descriptor(route,ownerPublicInputs){current();return observer.prepareOwnedUniswapGraphDescriptorV1({observer:u.observer,router:u.router,route,ownerPublicInputs});},bindGraph(descriptor){current();return account.bindOriginalDeviceExternalFlatShareGraphV1(u.targetAccount,{runtime:u.runtime,system:u.system,router:u.router,deliveryObserver:u.observer,descriptor});},assertPrepared(prepared,intent){current();return u.observer.assertPrepared({prepared,intent});},observeFacts(query){current();return u.observer.observeFacts(query);},assertFacts(facts){current();observer.assertOwnedUniswapGraphDeliveryFactsV1(facts,{observer:u.observer});},readEconomicFacts(facts){current();return observer.readOriginalEvmGraphDeliveryEconomicFactsV1(facts,u.observer);}});
}

// Mixed recovery has its own original cohort and one-use receiver tokens.
// Neither a plain section nor a caller-selected bootstrap can issue these.
const pagedUniswapRetentions=new WeakMap(),pagedUniswapCaptures=new WeakMap(),pagedUniswapRuntimeSections=new WeakMap();
export async function armOriginalPagedUniswapRuntimeRetentionV3(originals){
 assert.equal(arguments.length,1);const u={...originals};await openOriginalPagedUniswapConstructionV3(u);
 canonicalEvmRuntime.assertOwnedDeviceExternalFlatReceiverV1(u.runtime);
 const account=await import('../../../accounts/authority/device-external-flat-note-authority-v1.mjs');
 const descriptor=account.assertOriginalRetainedDeviceExternalFlatNoteAuthorityV1(u.targetAccount);
 const token=Object.freeze(Object.create(null));pagedUniswapRetentions.set(token,{runtime:u.runtime,descriptor,used:false});return token;
}
export async function captureOriginalPagedUniswapRuntimeV3(runtime,retention){
 assert.equal(arguments.length,2);const s=pagedUniswapRetentions.get(retention);assert.ok(s&&!s.used&&s.runtime===runtime,'PAGED_UNISWAP_ORIGINAL_RETENTION');canonicalEvmRuntime.assertOwnedDeviceExternalFlatReceiverV1(runtime);s.used=true;
 const token=Object.freeze(Object.create(null));pagedUniswapCaptures.set(token,{profile:'ORIGINAL_PAGED_UNISWAP_RUNTIME_CAPTURE_V3',genesis:runtime.metadata.evmGenesis,lifetime:s.descriptor.lifetime});
 try{return await canonicalEvmRuntime.captureOwnedDeviceExternalFlatReceiverV1(runtime,token);}finally{pagedUniswapCaptures.delete(token);pagedUniswapRetentions.delete(retention);}
}
export async function reopenOriginalPagedUniswapRuntimeV3(token){
 assert.equal(arguments.length,1);const {consumeOriginalPagedRuntimeRecoveryV3}=await import('../../../operations/recovery/paged-runtime-recovery-authority-v3.mjs');
 const section=consumeOriginalPagedRuntimeRecoveryV3(token,'uniswap'),one=Object.freeze(Object.create(null));pagedUniswapRuntimeSections.set(one,section);
 try{return await canonicalEvmRuntime.reopenOwnedDeviceExternalFlatReceiverV1(one);}finally{pagedUniswapRuntimeSections.delete(one);}
}
export async function reopenOriginalPagedUniswapBootstrapV3(token,runtime){
 assert.equal(arguments.length,2);canonicalEvmRuntime.assertOwnedDeviceExternalFlatReceiverV1(runtime);
 const {consumeOriginalPagedComponentRecoveryV3}=await import('../../../operations/recovery/paged-runtime-recovery-authority-v3.mjs');
 const record=consumeOriginalPagedComponentRecoveryV3(token,'uniswap');assert.equal(record.profile,'ORIGINAL_PAGED_UNISWAP_CONTEXT_COLD_RETENTION_V3');assert.equal(record.genesis,runtime.metadata.evmGenesis);assert.equal(record.directory,runtime.metadata.scratchDirectory);assert.deepEqual(record.runtimeAccounts,runtime.accounts);
 return originalRecovery.reopenPagedUniswapBootstrapPartsV3({runtime,record});
}

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
  const original=pagedUniswapCaptures.get(token);if(original){assert.equal(arguments.length,1);return structuredClone(original);}
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
  const original=pagedUniswapRuntimeSections.get(token);if(original){assert.equal(arguments.length,1);pagedUniswapRuntimeSections.delete(token);return original;}
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
