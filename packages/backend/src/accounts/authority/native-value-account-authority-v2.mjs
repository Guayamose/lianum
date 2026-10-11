import { readOriginalNativePrivateDepositDerivationV2 } from '@lianum/proofs/jobs/native-device-private-deposit-client-v2';
import { createNativeEconomicNoteProofProcessV1, createProofProcess } from '@lianum/proofs/execution/proof-process';
import { nullifier } from '@lianum/engine/notes/private-note-encoding';
import { encodeFlatTransaction } from '../../execution/encoding/transaction-codec.mjs';
import {buildDeviceDepositBridgeBackendV1} from './device-deposit-bridge-backend-v1.mjs';
import {buildDeviceReservationBridgeBackendV1} from './device-reservation-bridge-backend-v1.mjs';
import {buildDeviceExecutionBridgeBackendV1} from './device-execution-bridge-backend-v1.mjs';
import * as originalDeviceActor from '../../operations/recovery/native-original-source-lifecycle-v1.mjs';
import {assertOwnedNativeValueProviderCustody as originalDeviceProviderGuard} from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import { decodeNativeValueTerminalCalldata } from '../../execution/encoding/terminal-calldata-codec.mjs';
import {reconcileOriginalDeviceNativeRecoveryV1} from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import {refreshOriginalNativeDeviceLocalObservedClockV1} from '../../operations/recovery/native-device-local-observed-clock-v1.mjs';
import {refreshOriginalNativeSourceObservedClockV1} from '../../operations/recovery/native-original-source-lifecycle-v1.mjs';
import {assertOwnedFlatPortfolioAccount} from './flat-portfolio-authority.mjs';
import {assertOwnedFlatManualPortfolioKeeper} from '../portfolio/flat-manual-portfolio-keeper.mjs';
import {assertOwnedFlatManualAccountKeeper} from '../storage/flat-manual-account-keeper.mjs';
import {createRecoveredDeviceInstallations} from './native-value/recovered-device-installations.mjs';
import {createLiveRecoveryLeaseFamily} from './native-value/live-recovery-leases.mjs';
import { createNativeValueAccountJournals } from './native-value/native-value-authority-journals.mjs';
import { createNativeValueDeposits } from './native-value/native-value-authority-deposits.mjs';
import { createNativeValueReservations } from './native-value/native-value-authority-reservations.mjs';
import { createNativeValueExecutionOperations } from './native-value/native-value-authority-execution.mjs';
import { createNativeValueWithdrawals } from './native-value/native-value-authority-withdrawals.mjs';
import { createNativeValueOwnerOperations } from './native-value/native-value-authority-operations.mjs';
import { createNativeValueManualLifecycle } from './native-value/native-value-authority-manual.mjs';
import { createNativeValueAccountInterface } from './native-value/native-value-authority-interface.mjs';

import { nativeSourceRecoverySectionIdentityV1, retainOriginalNativeSourceSectionV1, consumeOriginalNativeSourceSectionV1,
  updateOriginalNativeSourceSectionV1, resumeOriginalNativeSourceSectionV1 }
  from '../../operations/recovery/native-original-source-lifecycle-v1.mjs';
import { assertOriginalNativeSourceObservedClockV1 } from '../../operations/recovery/native-original-source-lifecycle-v1.mjs';

import { ownedNativeValueProviderCustodyReview as recoveryProviderReviewV1 } from '../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs';
import { assertWrappedWalletAccountReleasedV1 } from '../../operations/releases/wrapped/wrapped-wallet-release-v1.mjs';
/** Separately versioned native-value graph-only wallet binding. Historical flat modules remain unchanged. */
/** Private account authority for the fixed local flat owner. One source, one
 * authorization, and its original exits; no balance rollover is implemented.
 * The generic account keeper/journal/coordinator are reused without changes. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { Vault } from '@lianum/engine/crypto/vault';
import { assertNativeEconomicRecoveryCaptureV1, assertNativeLiveArmedRecoveryCaptureV1, nativeEconomicRecoverySectionIdentityV1, consumeNativeEconomicRecoverySectionV1 }
  from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { nativeValueOriginalRecoverySourceV1 } from '../../operations/deployments/native-value/native-value-system-v2.mjs';
import { nativeValueOwnerEconomicIdentityV1 } from '../../custody/processes/native-value-owner-process-v2.mjs';
import { ownedNativeValueProviderCustodyReview as nativeRecoveryProviderReviewV1 } from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import { assertLocalEvm } from '../../chains/evm/runtime/local-evm-ownership.mjs';

import { genericAccountIdentity, validateGenericAccountConfig, immutable, copy, sha } from '@lianum/engine/accounts/journal';
import { assertOwnedNativeValueWalletSystem as nativeSystem } from '../../operations/deployments/native-value/native-value-system-v2.mjs';
import { createNativeValueSystemStateReader as nativeReader } from '../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { assertOwnedPoolAsset } from '../../chains/shared/contracts/owned-pool-asset.mjs';
import { assertOwnedNativeValueExecution as nativeExecutionAssert, ownedNativeValueManualGraphReview as nativeGraphReview } from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import { createNativeValueTerminalObserver as nativeTerminal } from '../../execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { decodeStatement } from '@lianum/components/encoding/statements';

import { assertOwnedNativeValueOwnerProcess as nativeOwner } from '../../custody/processes/native-value-owner-process-v2.mjs';
import { createNativeValueOwnerObserver as nativeObserver, assertOwnedNativeValueOwnerObserver as nativeObserverAssert } from '../../custody/observers/native-value-owner-observer-v2.mjs';
import {createFlatProofRunner} from '@lianum/backend/proving/roles/scoped-proof-runner';
import { flatAccountAsset, flatAccountGraphBinding, flatAccountCalldataHash, validateFlatAccountOwnerObservation } from './flat-account-validation.mjs';

import { assertOwnedWrappedClaimWalletSystemV1 } from '../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs';
import { createWrappedWalletStateReaderV1 } from '../../execution/wrapped/reconciliation/wrapped-wallet-state-v1.mjs';
import { createWrappedWalletTerminalObserverV1 } from '../../execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs';
import { assertOwnedWrappedClaimOwnerProcessV1 } from '../../custody/processes/wrapped-claim-owner-process-v1.mjs';
import { createWrappedClaimOwnerObserverV1, assertOwnedWrappedClaimOwnerObserverV1 } from '../../custody/observers/wrapped-claim-owner-observer-v1.mjs';

const wrappedOwnerAccounts = new WeakSet();
export function originalDeviceNativeFReorgStateV1(account, executor, ref) {
  assert.equal(arguments.length, 3); const state = owned.get(account);
  assert.ok(state && !state.wrapped && !state.closed(), 'F_REORG_ORIGINAL_ACCOUNT_REQUIRED');
  return state.reorgState(executor, ref);
}
export async function retainOriginalDeviceNativeFReorgV1(account, executor, ref, id, phase) {
  assert.equal(arguments.length, 5); const state = owned.get(account);
  assert.ok(state && !state.wrapped && !state.closed(), 'F_REORG_ORIGINAL_ACCOUNT_REQUIRED');
  return state.retainReorg(executor, ref, id, phase);
}
export async function checkOriginalDeviceNativeFReorgPendingV1(account, executor, ref, id) {
  assert.equal(arguments.length, 4); const state = owned.get(account);
  assert.ok(state && !state.wrapped && !state.closed(), 'F_REORG_ORIGINAL_ACCOUNT_REQUIRED');
  await state.checkReorgPending(executor, ref, id);
}
export function assertOriginalDeviceNativeFReorgPendingV1(account, executor, ref, id) {
  assert.equal(arguments.length, 4); const state = owned.get(account);
  assert.ok(state && !state.wrapped && !state.closed(), 'F_REORG_ORIGINAL_ACCOUNT_REQUIRED');
  state.assertReorgPending(executor, ref, id);
}
const owned = new WeakMap(), manualGraphs = new WeakMap(), manualNotes = new WeakMap();
/** Public proof receipts retained only by the original SOURCE producer. They
 * authenticate evidence continuity, never a proof job or economic permission. */
export async function readOriginalNativeSourceProofReceiptsV1(account){
  assert.equal(arguments.length,1);assertOwnedNativeValueAccountAuthority(account);
  const state=owned.get(account);state.sourceIdentity();return state.sourceProofReceipts();
}
const sourceReceiptSHA=value=>createHash('sha256').update(value).digest('hex');
function sourceProofReceiptFrame(relation,label,proof){
  assert.ok(['deposit_balance','authorization','reservation','withdraw_balance'].includes(relation));
  const transport=transportProof(proof);if(relation==='deposit_balance')assert.equal(transport.publicInputs.length,26);else if(relation==='withdraw_balance'){assert.equal(transport.publicInputs.length,39);decodeWalletPoolInputs(relation,transport.publicInputs);}else decodeStatement(relation,transport.publicInputs);
  // These are the fixed prover's returned public metrics/evidence only. Do not
  // serialize its input, witness, job or callback envelope.
  const evidence=['deposit_balance','withdraw_balance'].includes(relation)?proof.metrics:proof.evidence;
  assert.ok(evidence&&typeof evidence==='object');
  const json=JSON.stringify(evidence);assert.ok(Buffer.byteLength(json)<=1024*1024,'NATIVE_SOURCE_ORIGINAL_PROOF_RECEIPT_BOUND');
  return {relation,label,json,sha256:sourceReceiptSHA(Buffer.from(json)),proofSHA256:sourceReceiptSHA(Buffer.from(transport.proof,'hex')),publicInputsSHA256:sha(transport.publicInputs)};
}
function restoreSourceProofReceipt(frame,proof){
  exactRecord(frame,['relation','label','json','sha256','proofSHA256','publicInputsSHA256']);
  assert.ok(['deposit_balance','authorization','reservation','withdraw_balance'].includes(frame.relation));assert.equal(typeof frame.json,'string');
  assert.ok(Buffer.byteLength(frame.json)<=1024*1024,'NATIVE_SOURCE_ORIGINAL_PROOF_RECEIPT_BOUND');assert.equal(sourceReceiptSHA(Buffer.from(frame.json)),frame.sha256);
  const transport=transportProof(proof);assert.equal(sourceReceiptSHA(Buffer.from(transport.proof,'hex')),frame.proofSHA256);assert.equal(sha(transport.publicInputs),frame.publicInputsSHA256);
  const evidence=JSON.parse(frame.json);assert.equal(JSON.stringify(evidence),frame.json);
  return {label:frame.label,relation:frame.relation,proof:{...transport,...(['deposit_balance','withdraw_balance'].includes(frame.relation)?{metrics:evidence}:{evidence})}};
}

export function nativeValueAccountManualNoteDetails(approval) {
  const retained = manualNotes.get(approval);
  assert.ok(retained, 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_REQUIRED');
  assertOwnedNativeValueAccountAuthority(retained.account); retained.check();
  return Object.freeze({ account: retained.account, body: retained.body, review: retained.review });
}

/** A copied/serialized object, another authority or closed original lifetime
 * cannot obtain manual graph authority. No caller review data is accepted. */
export function nativeValueAccountManualGraphDetails(capability) {
  const retained = manualGraphs.get(capability);
  assert.ok(retained, 'FLAT_ACCOUNT_MANUAL_GRAPH_ORIGINAL_REQUIRED');
  assertOwnedNativeValueAccountAuthority(retained.account);
  retained.check();
  return Object.freeze({ account: retained.account, body: retained.body, review: retained.review });
}
export function assertNativeValueAccountManualGraphExecution(capability) {
  nativeValueAccountManualGraphDetails(capability);
  manualGraphs.get(capability).checkRoute();
}
import { validateNativeValueManualReview } from '@lianum/custody/preparation/native-value-owner-manual-binding-v1';
import { decodeWalletPoolInputs, walletInputPublicWords } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';

import { createHash } from 'node:crypto';


import { validateGenericBalanceNativePreparation } from '@lianum/engine/execution/balances/generic-balance-native-preparation';



import { restoreNativeDeviceOriginalW39MetricsFrameV1 } from './native-device-original-w39-metrics-frame-v1.mjs';

import { assertOriginalNativeDeviceLocalObservedClockV1, assertOriginalNativeDeviceLiveArmedObservedClockV1, captureOriginalNativeDeviceLiveArmedClockCheckpointV1 } from '../../operations/recovery/native-device-local-observed-clock-v1.mjs';

const originalDeviceDepositBridge = buildDeviceDepositBridgeBackendV1(Object.freeze({
  account:Object.freeze({
    assertOwnedNativeValueAccountAuthority: assertOwnedNativeValueAccountAuthority,
    runDeviceOwnerDepositAuthorizationV1: runDeviceOwnerDepositAuthorizationV1,
    readDeviceOwnerDepositStatusV1: readDeviceOwnerDepositStatusV1,
    installOriginalNativePrivateDepositV2: installOriginalNativePrivateDepositV2,
  }),
  actor:Object.freeze({
    assertPairedOriginalAccountActorV2: originalDeviceActor.assertPairedOriginalAccountActorV2,
    assertPairedOriginalAccountActorAccountV2: originalDeviceActor.assertPairedOriginalAccountActorAccountV2,
    pairedOriginalAccountActorDescriptorV2: originalDeviceActor.pairedOriginalAccountActorDescriptorV2,
  }),
  system:Object.freeze({
    assertOwnedNativeValueWalletSystem: nativeSystem,
  }),
  observation:Object.freeze({
    createNativeValueSystemStateReader: nativeReader,
  }),
}));
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
  consumeDeviceOwnerDepositAuthorizationV1
} = originalDeviceDepositBridge;

const originalDeviceReservationBridge = buildDeviceReservationBridgeBackendV1(Object.freeze({
  account:Object.freeze({
    assertOwnedNativeValueAccountAuthority: assertOwnedNativeValueAccountAuthority,
    runDeviceOwnerReservationAuthorizationV1: runDeviceOwnerReservationAuthorizationV1,
    readDeviceOwnerReservationStatusV1: readDeviceOwnerReservationStatusV1,
    installOriginalNativePrivateReservationV2: installOriginalNativePrivateReservationV2,
    readOriginalNativePrivateReservationContextV2: readOriginalNativePrivateReservationContextV2,
  }),
  actor:Object.freeze({
    assertPairedOriginalAccountActorV2: originalDeviceActor.assertPairedOriginalAccountActorV2,
    assertPairedOriginalAccountActorAccountV2: originalDeviceActor.assertPairedOriginalAccountActorAccountV2,
    pairedOriginalAccountActorDescriptorV2: originalDeviceActor.pairedOriginalAccountActorDescriptorV2,
  }),
  system:Object.freeze({
    assertOwnedNativeValueWalletSystem: nativeSystem,
  }),
  observation:Object.freeze({
    createNativeValueSystemStateReader: nativeReader,
  }),
}));
export const {
  createDeviceOwnerReservationBridgeV1,
  createOriginalNativePrivateReservationBridgeV2,
  assertDeviceOwnerReservationDurableRequestV1,
  assertDeviceOwnerReservationBridgeV1,
  deviceOwnerReservationBridgeActorV1,
  consumeDeviceOwnerReservationAuthorizationV1,
  awaitDeviceOwnerReservationOriginalWorkV1,
  readDeviceOwnerReservationOriginalPreparationV1,
  isOriginalNativePrivateReservationBridgeV2
} = originalDeviceReservationBridge;

const originalDeviceExecutionBridge = buildDeviceExecutionBridgeBackendV1(Object.freeze({
  executor:Object.freeze({
    assertOwnedNativeValueExecution: nativeExecutionAssert,
  }),
  providers:Object.freeze({
    assertOwnedNativeValueProviderCustody: originalDeviceProviderGuard,
  }),
  reservation:Object.freeze({
    assertDeviceOwnerReservationBridgeV1: assertDeviceOwnerReservationBridgeV1,
    deviceOwnerReservationBridgeActorV1: deviceOwnerReservationBridgeActorV1,
  }),
  account:Object.freeze({
    installDeviceOwnerExecutionV1: installDeviceOwnerExecutionV1,
    readDeviceOwnerExecutionStatusV1: readDeviceOwnerExecutionStatusV1,
    runDeviceOwnerExecutionAuthorizationV1: runDeviceOwnerExecutionAuthorizationV1,
    installOriginalNativePrivateExitV2: installOriginalNativePrivateExitV2,
    assertOwnedNativeValueAccountAuthority: assertOwnedNativeValueAccountAuthority,
    prepareDeviceOwnerExitV1: prepareDeviceOwnerExitV1,
    readDeviceOwnerExitStatusV1: readDeviceOwnerExitStatusV1,
    runDeviceOwnerExitAuthorizationV1: runDeviceOwnerExitAuthorizationV1,
    readDeviceOwnerOutputBalanceV1: readDeviceOwnerOutputBalanceV1,
    readDeviceOwnerRecoveryArmTermsV1: readDeviceOwnerRecoveryArmTermsV1,
    runDeviceOwnerRecoveryArmAuthorizationV1: runDeviceOwnerRecoveryArmAuthorizationV1,
  }),
  observation:Object.freeze({
    createNativeValueSystemStateReader: nativeReader,
  }),
}));
export const {
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
  awaitDeviceOwnerExecutionOriginalWorkV1
} = originalDeviceExecutionBridge;

const liveRecoveryLeaseFamily=createLiveRecoveryLeaseFamily({
 assertAccount:assertOwnedNativeValueAccountAuthority,readAccount:account=>owned.get(account),
 assertBridge:assertDeviceOwnerExecutionBridgeV1,
 assertClock:assertOriginalNativeDeviceLocalObservedClockV1,
 assertSourceClock:assertOriginalNativeSourceObservedClockV1
});
export const {create:createDeviceOwnerLiveRecoveryLeaseV1,createSource:createOriginalNativeSourceLiveRecoveryLeaseV1,
 close:closeDeviceOwnerLiveRecoveryLeaseV1,tick:tickDeviceOwnerLiveRecoveryLeaseV1}=liveRecoveryLeaseFamily;
export function readDeviceOwnerRecoveryArmTermsV1(account,bridge,id){assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
 return owned.get(account).liveRecoveryTerms(bridge,id);}
/** Private finite logical read. Only the same account/bridge and its original
 * LIVE_ARMED clock can hold the account lock across all owner/head observations. */
export function readDeviceOwnerLiveArmedOriginalOwnerSnapshotV1(account,bridge,id){
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
  assertDeviceOwnerExecutionBridgeV1(bridge,account);reference(id);
  return owned.get(account).liveArmedOwnerSnapshot(bridge,id);
}
export function runDeviceOwnerRecoveryArmAuthorizationV1(account,bridge,cap){assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
 return owned.get(account).armLiveRecovery(consumeDeviceOwnerExecutionAuthorizationV1(bridge,cap,account));}

// Private original producer: a recovered journal can reinstall only its own
// paired pipeline. Neither HTTP IDs nor a prepared JSON object issue this mark.
const nativeDeviceRecoveredInstallations=new WeakMap();
export async function retainOriginalNativeDeviceRecoveredInstallationV1(account,actor,providerCustody){
 assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
 const module=await import('../../operations/recovery/native-original-source-lifecycle-v1.mjs');
 module.assertPairedOriginalAccountActorAccountV2(actor,account);
 const descriptor=module.pairedOriginalAccountActorDescriptorV2(actor),value=await owned.get(account).nativeDeviceRecoveredInstallation(descriptor,providerCustody);
 assertOwnedNativeValueAccountAuthority(account);module.assertPairedOriginalAccountActorAccountV2(actor,account);
 assert.deepEqual(module.pairedOriginalAccountActorDescriptorV2(actor),descriptor);
 const cap=Object.freeze(Object.defineProperty(Object.create(null),'toJSON',{value(){throw Error('NATIVE_DEVICE_RECOVERY_PRIVATE_INSTALLATION');}}));
 nativeDeviceRecoveredInstallations.set(cap,{account,actor,value});return cap;
}
export function consumeOriginalNativeDeviceRecoveredInstallationV1(cap,account,actor){
 assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
 const row=nativeDeviceRecoveredInstallations.get(cap);assert.ok(row&&row.account===account&&row.actor===actor,'NATIVE_DEVICE_RECOVERY_ORIGINAL_INSTALLATION');
 nativeDeviceRecoveredInstallations.delete(cap);return row.value;
}

const nativeDeviceSourceInstallations=new WeakMap();
export async function retainOriginalNativeDeviceSourceInstallationV1(account,actor,providerCustody) {
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);const state=owned.get(account);state.sourceIdentity();
  const module=await import('../../operations/recovery/native-original-source-lifecycle-v1.mjs');module.assertPairedOriginalAccountActorAccountV2(actor,account);
  const descriptor=module.pairedOriginalAccountActorDescriptorV2(actor),value=await state.nativeDeviceSourceInstallation(descriptor,providerCustody);
  assertOwnedNativeValueAccountAuthority(account);module.assertPairedOriginalAccountActorAccountV2(actor,account);assert.deepEqual(module.pairedOriginalAccountActorDescriptorV2(actor),descriptor);
  const cap=Object.freeze(Object.create(null));nativeDeviceSourceInstallations.set(cap,{account,actor,value});return cap;
}
export function consumeOriginalNativeDeviceSourceInstallationV1(cap,account,actor) {
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);const row=nativeDeviceSourceInstallations.get(cap);
  assert.ok(row&&row.account===account&&row.actor===actor,'NATIVE_SOURCE_ORIGINAL_INSTALLATION');nativeDeviceSourceInstallations.delete(cap);return row.value;
}
export function readOriginalNativeLiveArmedClockCheckpointV1(account,runtime){assert.equal(arguments.length,2);assertOwnedNativeValueAccountAuthority(account);return owned.get(account).liveArmedClockCheckpoint(runtime);}
const nativeDeviceLiveArmedInstallations=new WeakMap();
export async function retainOriginalNativeDeviceLiveArmedInstallationV1(account,actor,providerCustody){
 assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
 const module=await import('../../operations/recovery/native-original-source-lifecycle-v1.mjs');module.assertPairedOriginalAccountActorAccountV2(actor,account);
 const descriptor=module.pairedOriginalAccountActorDescriptorV2(actor),value=await owned.get(account).nativeDeviceLiveArmedInstallation(descriptor,providerCustody);
 assertOwnedNativeValueAccountAuthority(account);module.assertPairedOriginalAccountActorAccountV2(actor,account);assert.deepEqual(module.pairedOriginalAccountActorDescriptorV2(actor),descriptor);
 const cap=Object.freeze(Object.create(null));nativeDeviceLiveArmedInstallations.set(cap,{account,actor,value});return cap;
}
export function consumeOriginalNativeDeviceLiveArmedInstallationV1(cap,account,actor){
 assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);const row=nativeDeviceLiveArmedInstallations.get(cap);
 assert.ok(row&&row.account===account&&row.actor===actor,'NATIVE_LIVE_ARMED_ORIGINAL_INSTALLATION');nativeDeviceLiveArmedInstallations.delete(cap);return row.value;
}

/** Private successor evidence, emitted by the authentic reopened account.
 * Public proof/receipt facts only; no opening, prepared roles, root or key. */
export async function readOriginalNativeDeviceEconomicProofsV1(account){
 assert.equal(arguments.length,1);assertOwnedNativeValueAccountAuthority(account);
 return owned.get(account).nativeDeviceRecoveredProofs();
}

export async function installDeviceOwnerExecutionV1(account,bridge){
  assert.equal(arguments.length,2);assertOwnedNativeValueAccountAuthority(account);
  return owned.get(account).installDeviceExecution(bridge,consumeDeviceOwnerExecutionInstallationV1(bridge,account));
}
export async function readDeviceOwnerExecutionStatusV1(account,bridge,jobId){
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);assertDeviceOwnerExecutionBridgeV1(bridge,account);reference(jobId);
  return owned.get(account).deviceExecutionStatus(jobId,bridge);
}
export async function runDeviceOwnerExecutionAuthorizationV1(account,bridge,admission){
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
  return owned.get(account).deviceExecution(consumeDeviceOwnerExecutionAuthorizationV1(bridge,admission,account));
}

export async function installOriginalNativePrivateExitV2(account,bridge){assert.equal(arguments.length,2);assertOwnedNativeValueAccountAuthority(account);assert.equal(isOriginalNativePrivateExecutionBridgeV2(bridge),true);assertDeviceOwnerExecutionBridgeV1(bridge,account);return owned.get(account).installPrivateExit(bridge);}
export function isOriginalNativePrivateExitAccountV2(account){assert.equal(arguments.length,1);assertOwnedNativeValueAccountAuthority(account);return owned.get(account).privateExitEnabled();}
export async function prepareDeviceOwnerExitV1(account,bridge,input){
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);assertDeviceOwnerExecutionBridgeV1(bridge,account);
  return owned.get(account).deviceExitTerms(bridge,input);
}
/** Read-only monetary observation for this original device S. No W39 intent,
 * proof or withdrawal permission is issued, and no opening/root key is read. */
export async function readDeviceOwnerOutputBalanceV1(account,bridge,input){
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);assertDeviceOwnerExecutionBridgeV1(bridge,account);
  return owned.get(account).deviceOutputBalance(bridge,input);
}
export async function readDeviceOwnerExitStatusV1(account,bridge,jobId){
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);assertDeviceOwnerExecutionBridgeV1(bridge,account);reference(jobId);
  return owned.get(account).deviceExitStatus(jobId,bridge);
}
export async function runDeviceOwnerExitAuthorizationV1(account,bridge,admission){
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
  return owned.get(account).deviceExit(consumeDeviceOwnerExecutionAuthorizationV1(bridge,admission,account));
}

export async function runDeviceOwnerReservationAuthorizationV1(account,bridge,authorization) {
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
  const original=consumeDeviceOwnerReservationAuthorizationV1(bridge,authorization,account);
  return owned.get(account).deviceReservation(original);
}
export async function readDeviceOwnerReservationStatusV1(account,bridge,jobId) {
  assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
  const descriptor=assertDeviceOwnerReservationBridgeV1(bridge,account);reference(jobId);
  return owned.get(account).deviceReservationStatus(jobId,descriptor);
}

/** These seams expose no arbitrary executor/witness callback. The argument
 * must be the capability emitted by a genuine bridge after its distinct
 * signature has been authenticated and consumed. JSON never becomes a grant. */
/** Only a fixed private bridge can install this journal profile before funding. */
export async function installOriginalNativePrivateDepositV2(account,bridge){assert.equal(arguments.length,2);assertOwnedNativeValueAccountAuthority(account);assert.equal(isOriginalNativePrivateDepositBridgeV2(bridge),true);assertDeviceOwnerDepositBridgeV1(bridge,account);return owned.get(account).installPrivateDeposit(bridge);}
export function isOriginalNativePrivateDepositAccountV2(account){assert.equal(arguments.length,1);assertOwnedNativeValueAccountAuthority(account);return owned.get(account).privateDepositEnabled();}
export async function runDeviceOwnerDepositAuthorizationV1(account, bridge, authorization) {
  assert.equal(arguments.length, 3);
  assertOwnedNativeValueAccountAuthority(account);
  const original = consumeDeviceOwnerDepositAuthorizationV1(bridge, authorization, account);
  return owned.get(account).deviceDeposit(original);
}
export async function readDeviceOwnerDepositStatusV1(account, bridge, jobId) {
  assert.equal(arguments.length, 3); assertOwnedNativeValueAccountAuthority(account);
  assertDeviceOwnerDepositBridgeV1(bridge, account);
  reference(jobId); return owned.get(account).deviceDepositStatus(jobId);
}

const reference = value => assert.ok(typeof value === 'string' && value.length === 64
  && /^[0-9a-f]+$/.exec(value)?.[0] === value, 'FLAT_ACCOUNT_REFERENCE');
const bare = value => { assert.match(value, /^0x[0-9a-f]+$/, 'FLAT_ACCOUNT_HEX'); return value.slice(2); };
const failure = code => Object.assign(new Error(code), { code });
const transportProof = proof => ({ proof: Buffer.isBuffer(proof.proof) || proof.proof instanceof Uint8Array
  ? Buffer.from(proof.proof).toString('hex') : proof.proof, publicInputs: [...proof.publicInputs] });

/** Pure presentation projection for explicit synthetic tests. This function
 * establishes no observation authority. The private producer below is the only
 * path that supplies freshly authenticated balances and terminal results. */
export function projectFlatAccountOwnerView(input) {
  exactRecord(input, ['asset', 'current', 'requests']);
  const { asset, current } = input;
  reference(asset.assetId);
  assert.ok(typeof asset.symbol === 'string' && /^[A-Z0-9]{2,12}$/.exec(asset.symbol)?.[0] === asset.symbol
    && Number.isInteger(asset.decimals) && asset.decimals >= 0 && asset.decimals <= 18,
  'FLAT_ACCOUNT_OWNER_VIEW_ASSET');
  assert.ok(Array.isArray(input.requests), 'FLAT_ACCOUNT_OWNER_VIEW_REQUESTS');
  const decimal = value => assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.exec(value)?.[0] === value
    && BigInt(value).toString() === value && BigInt(value) < (1n << 256n), 'FLAT_ACCOUNT_OWNER_VIEW_AMOUNT');
  if (current !== null) {
    exactRecord(current, ['observed', 'balances', 'backing']);
    exactRecord(current.observed, ['observedAt', 'blockNumber', 'blockHash', 'timestamp']);
    assert.ok(Number.isSafeInteger(current.observed.observedAt) && current.observed.observedAt >= 0,
      'FLAT_ACCOUNT_OWNER_VIEW_TIME');
    decimal(current.observed.blockNumber); decimal(current.observed.timestamp); reference(current.observed.blockHash);
    exactRecord(current.balances, ['available', 'reserved', 'recovery', 'locked']);
    Object.values(current.balances).forEach(decimal);
    assert.ok(BigInt(current.balances.recovery) <= BigInt(current.balances.available) + BigInt(current.balances.locked),
      'FLAT_ACCOUNT_OWNER_VIEW_RECOVERY_BALANCE');
    exactRecord(current.backing, ['held', 'liabilities', 'surplus', 'deficit']);
    Object.values(current.backing).forEach(decimal);
    assert.ok(BigInt(current.backing.held) >= BigInt(current.backing.liabilities), 'FLAT_ACCOUNT_BACKING_DEFICIT');
    assert.equal(current.backing.surplus, String(BigInt(current.backing.held) - BigInt(current.backing.liabilities)),
      'FLAT_ACCOUNT_BACKING_CHANGED');
    assert.equal(current.backing.deficit, '0', 'FLAT_ACCOUNT_BACKING_DEFICIT');
  }
  const requests = input.requests.map(request => {
    exactRecord(request, ['requestId', 'kind', 'state', 'disposition']);
    assert.ok(typeof request.requestId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.exec(request.requestId)?.[0] === request.requestId,
      'FLAT_ACCOUNT_OWNER_VIEW_REQUEST_ID');
    assert.ok(['TOP_UP', 'GRAPH', 'EXIT'].includes(request.kind), 'FLAT_ACCOUNT_OWNER_VIEW_KIND');
    assert.ok(['CONFIRMED', 'UNRESOLVED', 'STALE'].includes(request.state), 'FLAT_ACCOUNT_OWNER_VIEW_STATE');
    if (request.state === 'CONFIRMED') assert.ok(request.kind === 'GRAPH'
      ? ['FULFILLED', 'RECOVERED'].includes(request.disposition) : request.disposition === 'APPLIED',
    'FLAT_ACCOUNT_OWNER_VIEW_DISPOSITION');
    else assert.equal(request.disposition, null, 'FLAT_ACCOUNT_OWNER_VIEW_UNRESOLVED');
    return current === null && request.state === 'CONFIRMED'
      ? { requestId: request.requestId, kind: request.kind, state: 'STALE', disposition: null } : copy(request);
  });
  assert.equal(new Set(requests.map(value => value.requestId)).size, requests.length, 'FLAT_ACCOUNT_OWNER_VIEW_DUPLICATE');
  return immutable({ version: 1,
    status: current === null ? 'UNAVAILABLE' : requests.some(value => value.state === 'STALE') ? 'STALE' : 'LIVE',
    asset: { assetId: asset.assetId, symbol: asset.symbol, decimals: asset.decimals },
    observed: current?.observed ?? null, balances: current?.balances ?? null, backing: current?.backing ?? null, requests });
}

export function assertOwnedNativeValueAccountAuthority(capability, expected) {
  const state = owned.get(capability);
  assert.ok(state && state.wrapped === false && !state.closed(), 'NATIVE_VALUE_ACCOUNT_OWNED_AUTHORITY_REQUIRED');
  nativeSystem(state.runtime, state.system);
  nativeOwner(state.owner, { runtime: state.runtime, system: state.system, poolIndex: state.poolIndex });
  if (expected) for (const key of Object.keys(expected)) {
    assert.ok(['runtime', 'system', 'poolIndex', 'owner'].includes(key), 'FLAT_ACCOUNT_EXPECTED_FIELDS');
    assert.equal(state[key], expected[key], 'FLAT_ACCOUNT_OWNED_AUTHORITY_REQUIRED');
  }
}

/** Private bootstrap only. No request can choose observer, backend, endpoint,
 * proof factory, asset registry, source note, or transaction sender. */
export function assertOwnedWrappedWalletAccountAuthorityV1(capability, expected) {
  const state = owned.get(capability);
  assert.ok(state && state.wrapped === true && !state.closed(), 'WRAPPED_WALLET_ORIGINAL_ACCOUNT_REQUIRED');
  assertOwnedWrappedClaimWalletSystemV1(state.runtime, state.system);
  assertOwnedWrappedClaimOwnerProcessV1(state.owner, { runtime: state.runtime, system: state.system, poolIndex: state.poolIndex });
  if (expected) for (const key of Object.keys(expected)) {
    assert.ok(['runtime', 'system', 'poolIndex', 'owner'].includes(key), 'WRAPPED_WALLET_EXPECTED_FIELDS');
    assert.equal(state[key], expected[key], 'WRAPPED_WALLET_ORIGINAL_ACCOUNT_BINDING');
  }
}
export function wrappedWalletAccountManualGraphDetailsV1(capability) {
  const retained = manualGraphs.get(capability); assert.ok(retained, 'WRAPPED_WALLET_ORIGINAL_GRAPH_REQUIRED');
  assertOwnedWrappedWalletAccountAuthorityV1(retained.account); retained.check();
  return Object.freeze({ account: retained.account, body: retained.body, review: retained.review });
}
export function assertWrappedWalletAccountManualGraphExecutionV1(capability) {
  wrappedWalletAccountManualGraphDetailsV1(capability); manualGraphs.get(capability).checkRoute();
}
export async function createNativeValueAccountAuthority(input, callbacks = {}) { return createAccountAuthority(input, callbacks, false); }
/** New fixed economic note producer; authenticated original inputs/consents,
 * with no request, callback or retained DTO selecting a backend. */
export async function createNativeEconomicNoteAccountAuthorityV1(input,callbacks={}) {
  assert.ok(arguments.length===1||arguments.length===2,'NATIVE_ECONOMIC_NOTE_CONSTRUCTOR_ARITY');
  return createAccountAuthority(input,callbacks,false,null,true);
}
/** Original LIVE_ARMED producer, inseparable from its own issuer and clock
 * before any D26 admission. No restored journal or account DTO enters. */
export function createNativeLiveArmedNoteAccountAuthorityV1(input){assert.equal(arguments.length,1);return createNativeLiveArmedAccount(input,{});}
export function createNativeLiveArmedNoteAccountForOriginalProofCaptureV1(input,callbacks){
 assert.equal(arguments.length,2);exactRecord(callbacks,['onProof','onPrivateAudit']);
 return createNativeLiveArmedAccount(input,callbacks);
}
async function createNativeLiveArmedAccount(input,callbacks){
 exactRecord(input,['runtime','system','poolIndex','owner','nativeExecution','accountId','journalId','nativeRuntime','clock','recoveryAuthority']);
 const {nativeRuntime,clock,recoveryAuthority,...original}=input;
 const identity=assertNativeLiveArmedRecoveryCaptureV1(recoveryAuthority);
 assert.equal(nativeValueOriginalRecoverySourceV1(original.runtime,original.system),identity.sourceSHA256);
 assertOriginalNativeDeviceLiveArmedObservedClockV1(clock,{runtime:original.runtime,nativeRuntime});
 return createAccountAuthority(original,callbacks,false,null,true,{authority:recoveryAuthority,identity,clock,nativeRuntime});
}
export function assertNativeLiveArmedAccountCaptureV1(account,authority){
 assert.equal(arguments.length,2);assertOwnedNativeValueAccountAuthority(account);
 return owned.get(account).liveArmedCaptureOriginal(authority);
}
export async function createWrappedWalletAccountAuthorityV1(input) {
  assertWrappedWalletAccountReleasedV1();
  assert.equal(arguments.length, 1, 'WRAPPED_WALLET_NO_OVERRIDES');
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'owner', 'nativeExecution', 'accountId', 'journalId']);
  assertOwnedWrappedClaimWalletSystemV1(input.runtime, input.system);
  assertOwnedWrappedClaimOwnerProcessV1(input.owner, { runtime: input.runtime, system: input.system, poolIndex: input.poolIndex });
  assert.ok(input.nativeExecution !== null, 'WRAPPED_WALLET_ORIGINAL_EXECUTION_REQUIRED');
  assert.ok(!wrappedOwnerAccounts.has(input.owner), 'WRAPPED_WALLET_OWNER_ACCOUNT_ALREADY_CLAIMED');
  wrappedOwnerAccounts.add(input.owner); // uncertain construction cannot create a replacement account/journal
  return createAccountAuthority(input, {}, true);
}
/** Separate SOURCE birth, before any account method is returned. The token,
 * original clock and existing runtime/system/owner/executor are infrastructure
 * capabilities, not fields from an HTTP request or a saved account DTO. */
export function createOriginalNativeSourceNoteAccountAuthorityV1(token,input) {
  assert.equal(arguments.length,2);return createOriginalNativeSourceAccount(token,input,{});
}
export function createOriginalNativeSourceNoteAccountForProofCaptureV1(token,input,callbacks) {
  assert.equal(arguments.length,3);return createOriginalNativeSourceAccount(token,input,callbacks);
}
async function createOriginalNativeSourceAccount(token,input,callbacks) {
  exactRecord(input,['runtime','system','poolIndex','owner','nativeExecution','accountId','journalId','clock','nativeRuntime']);
  const {clock,nativeRuntime,...original}=input;
  const identity=nativeSourceRecoverySectionIdentityV1(token,'account');
  assert.equal(identity.profile,'NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1');
  assert.equal(nativeValueOriginalRecoverySourceV1(original.runtime,original.system),identity.sourceSHA256);
  assert.notEqual(original.nativeExecution,null,'NATIVE_SOURCE_ORIGINAL_EXECUTOR_REQUIRED');
  assertOriginalNativeSourceObservedClockV1(clock,{runtime:original.runtime,nativeRuntime});
  return createAccountAuthority(original,callbacks,false,null,true,null,{token,identity,clock,nativeRuntime,handle:null});
}
async function createAccountAuthority(input, callbacks, wrapped, recovery=null,nativeNote=false,liveArmedOriginal=null,nativeSourceOriginal=null) {
  assert.ok(!nativeNote||!wrapped,'NATIVE_ECONOMIC_NOTE_ORIGINAL_NATIVE_ONLY');
  const wrappedExecution = wrapped ? await import("../../execution/native-value/execution/native-value-execution-v2.mjs") : null;
  const assertOwnedNativeValueWalletSystem = wrapped ? assertOwnedWrappedClaimWalletSystemV1 : nativeSystem;
  const createNativeValueSystemStateReader = wrapped ? createWrappedWalletStateReaderV1 : nativeReader;
  const assertOwnedNativeValueExecution = wrapped ? wrappedExecution.assertOwnedWrappedWalletExecutionV1 : nativeExecutionAssert;
  const ownedNativeValueManualGraphReview = wrapped ? wrappedExecution.ownedWrappedWalletManualGraphReviewV1 : nativeGraphReview;
  const createNativeValueTerminalObserver = wrapped ? createWrappedWalletTerminalObserverV1 : nativeTerminal;
  const assertOwnedNativeValueOwnerProcess = wrapped ? assertOwnedWrappedClaimOwnerProcessV1 : nativeOwner;
  const createNativeValueOwnerObserver = wrapped ? createWrappedClaimOwnerObserverV1 : nativeObserver;
  const assertOwnedNativeValueOwnerObserver = wrapped ? assertOwnedWrappedClaimOwnerObserverV1 : nativeObserverAssert;
  const accountProfile = wrapped ? 'FIXED_LOCAL_WRAPPED_WALLET_ACCOUNT_V1' : nativeNote?'FIXED_LOCAL_NATIVE_ECONOMIC_NOTE_ACCOUNT_V1':'FIXED_LOCAL_NATIVE_VALUE_ACCOUNT_V2';
  // Wrapped issuance/discharge uses its original CI/CO controller. Native note
  // consent or legacy records are never adopted as wrapped TOP_UP/EXIT authority.
  const selectOwnerActions = methods => wrapped ? {
    registerGraph: methods.registerGraph, approveManualWrappedGraph: methods.approveManualNativeValueGraph,
    recoveryCreditRequest: methods.recoveryCreditRequest,
  } : methods;
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'owner', 'nativeExecution', 'accountId', 'journalId']);
  exactRecord(callbacks, Object.keys(callbacks));
  assert.ok(Object.keys(callbacks).every(key => ['onStage', 'onProof', 'onPrivateAudit'].includes(key)),
    'FLAT_ACCOUNT_CALLBACKS');
  const { runtime, system, poolIndex, owner, nativeExecution, accountId, journalId } = input;
  const onStage = callbacks.onStage ?? (async () => {}), onProof = callbacks.onProof ?? (async () => {}),
    onPrivateAudit = callbacks.onPrivateAudit ?? (async () => {});
  for (const callback of [onStage, onProof, onPrivateAudit]) assert.equal(typeof callback, 'function');
  assert.ok(poolIndex === 0 || poolIndex === 1, 'FLAT_ACCOUNT_POOL');
  assertOwnedNativeValueWalletSystem(runtime, system); await assertLocalEvm(runtime);
  assertOwnedNativeValueOwnerProcess(owner, { runtime, system, poolIndex });
  if (nativeExecution !== null) assertOwnedNativeValueExecution(nativeExecution, { runtime, system, poolIndex });
  const observer = await createNativeValueOwnerObserver({ runtime, system, poolIndex });
  const reader = await createNativeValueSystemStateReader({ runtime, system, poolIndex });
  const identity = immutable(observer.identity), identitySHA256 = sha(identity), pool = system.pools[poolIndex];
  const nativeAsset = pool.asset === '0x' + '0'.repeat(40);
  assertOwnedPoolAsset(runtime, pool.assetCapability);
  const asset = flatAccountAsset({ identity, chainId: runtime.metadata.chainId,
    genesis: bare(runtime.metadata.evmGenesis), poolCodeHash: bare(pool.codeHash), assetMetadata: pool.assetMetadata });
  const lifetime = sha({ profile: accountProfile, genesis: asset.genesis,
    identity, poolCodeHash: bare(pool.codeHash), bootstrap: system.bootstrap });
  const config = validateGenericAccountConfig({ accountId, journalId, lifetime, registry: [asset] });
  const accountIdentity = genericAccountIdentity(config);
  const directory = recovery?recovery.record.directory:await mkdtemp(join(runtime.metadata.scratchDirectory, 'native-value-account-authority-v2-'));
  const vault = new Vault(join(directory, 'operations.vault'));
  let password = recovery?recovery.record.password:'synthetic-' + randomBytes(32).toString('hex');
  let record = recovery?await vault.read(password):await vault.create({ version: 1, identitySHA256, accountIdentity, operations: [] }, password);
  if(recovery){
    if (recovery.native) { assert.equal(recovery.record.identitySHA256, identitySHA256);
      assert.deepEqual(recovery.record.accountIdentity, accountIdentity); }
    assert.equal(record.data.identitySHA256,identitySHA256,'WRAPPED_ACCOUNT_ORIGINAL_OWNER_CHANGED');
    assert.deepEqual(record.data.accountIdentity,accountIdentity,'WRAPPED_ACCOUNT_ORIGINAL_IDENTITY_CHANGED');
    assert.equal(sha(record),recovery.record.checkpointSHA256,'WRAPPED_ACCOUNT_ORIGINAL_CHECKPOINT_CHANGED');
  }
  assert.deepEqual(await vault.read(password), record, 'FLAT_ACCOUNT_INITIAL_READBACK');
  let lifetimeHandle=null,lifetimeState=null,lifetimeRegistry=null;
  if(wrapped){lifetimeRegistry=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');const binding={profile:'WRAPPED_ACCOUNT_LIFETIME_V1',accountIdentity,identitySHA256,poolIndex};
    lifetimeState={directory,password,checkpointSHA256:sha(record),pendingUpdate:null};
    if(recovery){const original=await lifetimeRegistry.readWrappedPrivateLifetimePartV1(runtime,'wallet-account-'+poolIndex,binding);assert.equal(sha(original.privateState),sha(lifetimeState),'WRAPPED_ACCOUNT_REGISTRY_CHECKPOINT_CHANGED');lifetimeHandle=original.handle;}
    else lifetimeHandle=await lifetimeRegistry.retainWrappedPrivateLifetimePartV1(runtime,'wallet-account-'+poolIndex,binding,lifetimeState);
  }
  async function retainLifetime(next){if(wrapped){await lifetimeRegistry.updateWrappedPrivateLifetimePartV1(lifetimeHandle,next);lifetimeState=copy(next);}}

  let nativeCaptureIdentity = null, nativeCaptureRecord = null, nativeCaptureOwnerIdentity = null;
  let nativeRecoveryManualMode = recovery?.native ? recovery.record.manualMode : false;
  const recoveredInstallations = recovery?.native ? copy(recovery.record.providerBindings.installations) : [];
  const reboundInstallations = new Set();
  let busy = false, unavailable = false, closed = false, cancelled = false, capturing=false, captureStarted=false, captureProviders=null, captureProviderBindings=null, activeLegacy = null, activeDeviceOwner = null;
  let idle = Promise.resolve(), releaseIdle, abortPromise;
  let sourceHandle=nativeSourceOriginal?.handle??null,sourceRecord=null,sourceOperation=false;
  if(recovery?.source)recovery.sourceObservationRequired=recovery.record.interruptedOperation===true;
  const manualGraphApprovals = new Map(), nativeProviderSets = new Map(), nativeNoteApprovals = new Map();
  const deviceExecutionInstallations=new Map(),deviceExecutionProviders=new Map();
  // All operations share these live bindings: one lock, one Vault and one capability.
  // Getters retain initialization order and observe every later state replacement.

  const proofRunner = createFlatProofRunner({onProof:async event=>{
    if(nativeSourceOriginal&&event.label==='device-reservation-s'){
      const rows=reservationRows();assert.equal(rows.length,1);assert.equal(rows[0].stage,'RESERVING');
      await reservationUpdate(rows[0].jobId,{originalSourceReservationProof:transportProof(event.proof),
        originalSourceReservationReceipt:sourceProofReceiptFrame(event.relation,event.label,event.proof)});
    }
    await onProof(event);
  }});
  const exclusive = async work => {
    assert.ok(!busy && !unavailable && !closed && !cancelled && !capturing, 'FLAT_ACCOUNT_UNAVAILABLE');
    busy = true; idle = new Promise(resolve => { releaseIdle = resolve; });
    try {
      if(sourceHandle){sourceOperation=true;await updateSourceRecord({kind:'ADMITTED_OPERATION',revision:record.revision,checkpointSHA256:sha(record)});}
      const value=await work();
      if(sourceHandle){await healthy();await updateSourceRecord(null);sourceOperation=false;}
      return value;
    } catch(error) {if(sourceHandle)unavailable=true;throw error;}
    finally { busy = false; releaseIdle(); releaseIdle = null; }
  };
  const continueWork = () => assert.ok(!cancelled && !closed, 'FLAT_ACCOUNT_CANCELLED');
  async function healthy() {
    assert.ok(!unavailable && !closed, 'FLAT_ACCOUNT_UNAVAILABLE');
    assertOwnedNativeValueWalletSystem(runtime, system);
    assertOwnedNativeValueOwnerProcess(owner, { runtime, system, poolIndex });
    assertOwnedNativeValueOwnerObserver(observer, { runtime, system, poolIndex });
    if (nativeExecution !== null) assertOwnedNativeValueExecution(nativeExecution, { runtime, system, poolIndex });
    assertOwnedPoolAsset(runtime, pool.assetCapability);
    await assertLocalEvm(runtime);
    assert.deepEqual(await vault.read(password), record, 'FLAT_ACCOUNT_STORAGE_CHANGED');
    for (const entry of record.data.operations) {
      if (entry.manualLifecycle) validateManualLifecycle(entry);
      if (entry.nativeManualReview) validateNativeValueManualReview(entry.nativeManualReview);
    }
  }
  async function write(change) {
    try {
      await healthy();
      const changed=change(copy(record.data));for(const entry of changed.operations)if(entry.manualLifecycle)validateManualLifecycle(entry);
      if(wrapped)await retainLifetime({...lifetimeState,pendingUpdate:{revision:record.revision+1,dataSHA256:sha(changed)}});
      if(sourceHandle)await updateSourceRecord({kind:'ACCOUNT_CAS',revision:record.revision+1,
        checkpointSHA256:sha({revision:record.revision+1,data:changed})});
      const next = await vault.update(password, record.revision, () => changed);
      assert.equal(next.revision, record.revision + 1, 'FLAT_ACCOUNT_REVISION');
      assert.deepEqual(await vault.read(password), next, 'FLAT_ACCOUNT_READBACK');
      if(wrapped)await retainLifetime({...lifetimeState,checkpointSHA256:sha(next),pendingUpdate:null});
      record = next;
      if(sourceHandle)await updateSourceRecord(sourceOperation
        ?{kind:'ADMITTED_OPERATION',revision:record.revision,checkpointSHA256:sha(record)}:null);
    } catch (error) { unavailable = true; throw error; }
  }
  function originalSourceAccountRecord() {
    assert.ok(nativeSourceOriginal&&!wrapped&&nativeNote,'NATIVE_SOURCE_ORIGINAL_ACCOUNT_REQUIRED');
    assertOriginalNativeSourceObservedClockV1(nativeSourceOriginal.clock,{runtime,nativeRuntime:nativeSourceOriginal.nativeRuntime});
    const binding=row=>({slot:row.slot,deliveryRiskSalt:row.deliveryRiskSalt,
      custodyIdentitySHA256:sha(nativeRecoveryProviderReviewV1(row.custody,{runtime,system,poolIndex}))});
    return {schema:'ORIGINAL_NATIVE_SOURCE_NOTE_ACCOUNT_SEED_V1',sourceSHA256:nativeSourceOriginal.identity.sourceSHA256,
      poolIndex,directory,password,accountId,journalId,checkpointSHA256:sha(record),identitySHA256,accountIdentity:copy(accountIdentity),
      ownerIdentity:copy(nativeValueOwnerEconomicIdentityV1(owner,{runtime,system,poolIndex})),hasNativeExecution:nativeExecution!==null,
      manualMode:hasManualKeeper()||nativeRecoveryManualMode,
      interruptedOperation:recovery?.sourceObservationRequired===true,
      providerBindings:{operations:[...nativeProviderSets].map(([reference,providers])=>({reference,providers:providers.map(binding)})),
        installations:sourceInstallationBindings(binding)}};
  }
  function sourceInstallationPreparation(value) {
    exactRecord(value,['nativePreparation','invoiceSignatures']);
    const nativePreparation=validateGenericBalanceNativePreparation(value.nativePreparation);
    for(const name of ['scope','policy','asset','hubDomain','registryCommitment'])
      assert.equal(nativePreparation.config[name],identity.domain[name],'NATIVE_SOURCE_ORIGINAL_PREPARATION_DOMAIN_CHANGED');
    assert.ok(Array.isArray(value.invoiceSignatures)&&value.invoiceSignatures.length===nativePreparation.nodes.length,
      'NATIVE_SOURCE_ORIGINAL_INVOICES_CHANGED');
    return {nativePreparation,invoiceSignatures:copy(value.invoiceSignatures)};
  }
  function sourceInstallationBindings(binding) {
    const retained=new Map(recoveredInstallations.map(row=>[sha(row.descriptor),copy(row)]));
    for(const row of deviceExecutionInstallations.values()) {
      assert.ok(row.sourcePreparation,'NATIVE_SOURCE_ORIGINAL_INSTALLATION_PREPARATION_REQUIRED');
      retained.set(sha(row.descriptor),{descriptor:copy(row.descriptor),providers:row.providers.map(binding),
        preparation:sourceInstallationPreparation(row.sourcePreparation)});
    }
    return [...retained.values()];
  }
  function originalSourceContinuationInstallation(bridge){return recoveredDeviceInstallations.originalSourceContinuationInstallation(bridge);}
  async function updateSourceRecord(candidate) {
    const next={schema:'ORIGINAL_NATIVE_SOURCE_ACCOUNT_SECTION_V1',sourceSHA256:nativeSourceOriginal.identity.sourceSHA256,
      ownedProcesses:[],confirmed:originalSourceAccountRecord(),candidate};
    await updateOriginalNativeSourceSectionV1(sourceHandle,next);sourceRecord=copy(next);
  }
  function operation(ref) {
    reference(ref); const result = record.data.operations.find(value => value.ownerOperationRef === ref);
    assert.ok(result, 'FLAT_ACCOUNT_OWNER_PREPARATION_REQUIRED'); return result;
  }
  const update = (ref, fields) => write(data => ({ ...data, operations: data.operations.map(value =>
    value.ownerOperationRef === ref ? { ...value, ...copy(fields) } : value) }));
  const journals = createNativeValueAccountJournals({ readRecord: () => record, write });
  function trackProof(client) { activeLegacy = client; }
  function releaseProof() { activeLegacy = null; }
  function trackDeviceOwner(client) { activeDeviceOwner = client; }
  function releaseDeviceOwner() { activeDeviceOwner = null; }
  async function abortAccount() {
    assert.ok(wrapped || !capturing, 'NATIVE_ACCOUNT_CAPTURE_OWNS_LIFETIME');
    cancelled = true;
    abortPromise ??= (async () => {
      activeDeviceOwner?.stop();
      await Promise.allSettled([activeLegacy?.abort(), proofRunner.abort(), nativeExecution?.abort()]);
      await idle;
      return {
        cancelled: true,
        retainedEncryptedEvidence: true
      };
    })();
    return abortPromise;
  }
  async function closeAccount() {
    assert.ok(wrapped || !capturing || closed, 'NATIVE_ACCOUNT_CAPTURE_OWNS_LIFETIME');
    assert.equal(busy, false, 'FLAT_ACCOUNT_BUSY');
    if (!closed) {
      await proofRunner.close();
      closed = true;
      password = null;
      record = null;
      deviceExecutionInstallations.clear();
      deviceExecutionProviders.clear();
    }
    return {
      closed: true,
      retainedOwnerCustody: true,
      retainedRuntimes: true
    };
  }
  // Device custody is a separate durable branch in the SAME original Vault.
  // Linux note preparation/owner acknowledgement is never used for this note.

  // Device custody is a separate durable branch in the SAME original Vault.
  // Linux note preparation/owner acknowledgement is never used for this note.

  const {
    privateReservationEnabled,
    installPrivateReservation,
    privateReservationContext,
    reservationRows,
    reservationRow,
    reservationUpdate,
    reservationPublic,
    reservationSubject,
    reservationBinding,
    originalQuote,
    originalReservationConsent,
    reservationObservation,
    deviceReservation
  } = createNativeValueReservations({
    originalBridges: Object.freeze({
      isOriginalNativePrivateReservationBridgeV2,
    }),
    journal: Object.freeze({
      append: journals.reservations.append,
      appendQuote: journals.reservations.appendQuote,
      installProfile: journals.reservations.installProfile,
      patch: journals.reservations.patch,
      profile: journals.reservations.profile,
      quotes: journals.reservations.quotes,
      rows: journals.reservations.rows
    }),
    lifecycle: Object.freeze({
      continueWork,
      exclusive,
      healthy,
      isUnavailable: () => unavailable,
      releaseDeviceOwner,
      trackDeviceOwner
    }),
    profile: Object.freeze({
      accountIdentity,
      asset,
      config,
      identity,
      identitySHA256,
      nativeNote,
      wrapped
    }),
    deposits: Object.freeze({
      deviceRow: (...args) => deviceRow(...args),
      deviceRows: (...args) => deviceRows(...args),
      observeDevice: (...args) => observeDevice(...args),
      privateDepositEnabled: (...args) => privateDepositEnabled(...args)
    }),
    chain: Object.freeze({
      nativeExecution,
      observer,
      pool,
      reader,
      runtime,
      system
    }),
    format: Object.freeze({
      bare,
      byteSHA: (...args) => byteSHA(...args),
      reference,
      sourceProofReceiptFrame,
      transportProof
    }),
    continuity: Object.freeze({
      nativeSourceOriginal,
      originalSourceContinuationInstallation,
      recovery
    }),
    exits: Object.freeze({
      exitRows: (...args) => exitRows(...args)
    }),
    execution: Object.freeze({
      refreshLiveOperationClock: (...args) => refreshLiveOperationClock(...args)
    }),
    proofs: Object.freeze({
      onPrivateAudit,
      onProof,
      proofRunner
    }),
    approvals: Object.freeze({
      deviceExecutionProviders
    }),
    operations: Object.freeze({
      snapshotFromView: (...args) => snapshotFromView(...args)
    })
  });

  const privateWorkerEnabled=()=>record.data.deviceNativePrivateWorkerProfile==='ORIGINAL_NATIVE_NOTE_PRIVATE_WORKER_INPUT_V3';
  const {
    privateExitEnabled,
    installPrivateExit,
    exitRows,
    exitRow,
    exitPublic,
    exitTerms,
    outputBalance,
    exitBinding,
    deviceExit
  } = createNativeValueWithdrawals({
    originalBridges: Object.freeze({
      isOriginalNativePrivateWorkerExecutionBridgeV3,
      assertDeviceOwnerExecutionBridgeV1,
      isOriginalNativePrivateExecutionBridgeV2,
    }),
    journal: Object.freeze({
      append: journals.withdrawals.append,
      installProfile: journals.withdrawals.installProfile,
      patch: journals.withdrawals.patch,
      profile: journals.withdrawals.profile,
      rows: journals.withdrawals.rows
    }),
    reservations: Object.freeze({
      originalQuote: (...args) => originalQuote(...args),
      reservationBinding: (...args) => reservationBinding(...args),
      reservationObservation: (...args) => reservationObservation(...args),
      reservationRow: (...args) => reservationRow(...args),
      reservationRows: (...args) => reservationRows(...args),
      reservationSubject: (...args) => reservationSubject(...args)
    }),
    lifecycle: Object.freeze({
      continueWork,
      exclusive,
      healthy,
      isUnavailable: () => unavailable,
      releaseProof,
      trackProof
    }),
    profile: Object.freeze({
      asset,
      identity,
      identitySHA256,
      nativeNote,
      wrapped
    }),
    deposits: Object.freeze({
      deviceBinding: (...args) => deviceBinding(...args),
      deviceRow: (...args) => deviceRow(...args),
      deviceRows: (...args) => deviceRows(...args),
      observeDevice: (...args) => observeDevice(...args),
      privateDepositEnabled: (...args) => privateDepositEnabled(...args),
      privateWorkerEnabled: (...args) => privateWorkerEnabled(...args)
    }),
    chain: Object.freeze({
      nativeExecution,
      observer,
      pool,
      reader,
      runtime,
      system
    }),
    format: Object.freeze({
      bare,
      byteSHA: (...args) => byteSHA(...args),
      reference,
      sourceProofReceiptFrame,
      transportProof
    }),
    account: Object.freeze({
      capability: () => capability
    }),
    execution: Object.freeze({
      deviceExecutionOriginal: (...args) => deviceExecutionOriginal(...args)
    }),
    proofs: Object.freeze({
      onProof
    }),
    continuity: Object.freeze({
      nativeSourceOriginal,
      recovery
    }),
    operations: Object.freeze({
      snapshotFromView: (...args) => snapshotFromView(...args)
    })
  });

  const {
    deviceRows,
    privateDepositEnabled,
    installPrivateDeposit,
    deviceRow,
    byteSHA,
    devicePublic,
    deviceBinding,
    observeDevice,
    deviceDeposit
  } = createNativeValueDeposits({
    originalBridges: Object.freeze({
      isOriginalNativePrivateWorkerDepositBridgeV3,
      isOriginalNativePrivateDepositBridgeV2,
    }),
    journal: Object.freeze({
      append: journals.deposits.append,
      installProfile: journals.deposits.installProfile,
      installWorkerProfile: journals.deposits.installWorkerProfile,
      patch: journals.deposits.patch,
      profile: journals.deposits.profile,
      rows: journals.deposits.rows,
      workerProfile: journals.deposits.workerProfile
    }),
    lifecycle: Object.freeze({
      continueWork,
      exclusive,
      healthy,
      isUnavailable: () => unavailable,
      releaseProof,
      trackProof
    }),
    profile: Object.freeze({
      accountIdentity,
      asset,
      config,
      identity,
      identitySHA256,
      nativeAsset,
      nativeNote,
      wrapped
    }),
    chain: Object.freeze({
      observer,
      pool,
      reader,
      runtime,
      system
    }),
    deposits: Object.freeze({
      privateWorkerEnabled: (...args) => privateWorkerEnabled(...args)
    }),
    reservations: Object.freeze({
      reservationRows: (...args) => reservationRows(...args)
    }),
    exits: Object.freeze({
      exitRows: (...args) => exitRows(...args)
    }),
    format: Object.freeze({
      bare,
      reference,
      sourceProofReceiptFrame,
      transportProof, copy, sha,
      validateObservation: validateFlatAccountOwnerObservation,
      calldataHash: flatAccountCalldataHash, walletInputPublicWords, decodeWalletPoolInputs,
      nullifier, encodeTransaction: encodeFlatTransaction
    }),
    continuity: Object.freeze({
      nativeSourceOriginal,
      recovery
    }),
    proofs: Object.freeze({
      onPrivateAudit,
      createNativeEconomicNoteProofProcessV1, createProofProcess,
      readOriginalNativePrivateDepositDerivationV2,
      onProof
    }),
    operations: Object.freeze({
      snapshotFromView: (...args) => snapshotFromView(...args),
      tokenFundingReady: (...args) => tokenFundingReady(...args)
    })
  });

  // Device U/S continues the original D26 note. Its source opening is never
  // written into this Vault or adopted by the Linux owner process.

  // Device U/S continues the original D26 note. Its source opening is never
  // written into this Vault or adopted by the Linux owner process.

  // Device U/S continues the original D26 note. Its source opening is never
  // written into this Vault or adopted by the Linux owner process.

  const {
    deviceExecutionOriginal,
    deviceExecutionPublic,
    reorgState,
    retainReorg,
    assertReorgPending,
    requireLiveRecovery,
    refreshLiveOperationClock,
    armPublic,
    armLiveRecovery,
    liveArmedOwnerSnapshot,
    tickLiveRecovery,
    deviceExecution
  } = createNativeValueExecutionOperations({
    originalRecovery: Object.freeze({
      refreshOriginalNativeSourceObservedClockV1,
      assertOriginalNativeSourceObservedClockV1,
      refreshOriginalNativeDeviceLocalObservedClockV1,
      assertOriginalNativeDeviceLiveArmedObservedClockV1,
      nativeValueOriginalRecoverySourceV1,
      reconcileOriginalDeviceNativeRecoveryV1,
    }),
    approvals: Object.freeze({
      deviceExecutionInstallations
    }),
    chain: Object.freeze({
      assertOwnedNativeValueExecution,
      nativeExecution,
      owner,
      pool,
      poolIndex,
      reader,
      runtime,
      system
    }),
    reservations: Object.freeze({
      originalReservationConsent: (...args) => originalReservationConsent(...args),
      reservationObservation: (...args) => reservationObservation(...args),
      reservationRow: (...args) => reservationRow(...args),
      reservationRows: (...args) => reservationRows(...args),
      reservationSubject: (...args) => reservationSubject(...args),
      reservationUpdate: (...args) => reservationUpdate(...args)
    }),
    profile: Object.freeze({
      identity,
      nativeNote,
      wrapped
    }),
    lifecycle: Object.freeze({
      continueWork,
      exclusive,
      healthy,
      isBusy: () => busy,
      isCancelled: () => cancelled,
      isCapturing: () => capturing,
      isClosed: () => closed,
      isUnavailable: () => unavailable,
      whenIdle: () => idle
    }),
    format: Object.freeze({
      bare,
      byteSHA: (...args) => byteSHA(...args),
      reference, sha, copy, graphBinding: flatAccountGraphBinding, calldataHash: flatAccountCalldataHash, decodeTerminal: decodeNativeValueTerminalCalldata
    }),
    continuity: Object.freeze({
      lease: () => liveRecovery,
      nativeSourceOriginal,
      originalSourceContinuationInstallation,
      recovery
    }),
    operations: Object.freeze({
      privateOwnerView: (...args) => privateOwnerView(...args)
    }),
    account: Object.freeze({
      capability: () => capability
    })
  });

  let liveRecovery=null;

  const {
    request,
    register,
    snapshotFromView,
    tokenFundingReady,
    requireFixedManualEpoch,
    nativeNoteApproval,
    executeNote,
    manualGraphTime,
    executeGraph,
    confirmTerminal,
    reconcileOriginal,
    recoverOriginal,
    unresolved,
    privateOwnerView
  } = createNativeValueOwnerOperations({
    journal: Object.freeze({
      append: journals.operations.append,
      rows: journals.operations.rows
    }),
    profile: Object.freeze({
      accountIdentity,
      asset,
      config,
      identity,
      identitySHA256,
      nativeAsset,
      nativeNote,
      wrapped
    }),
    operations: Object.freeze({
      operation: (...args) => operation(...args),
      update: (...args) => update(...args)
    }),
    lifecycle: Object.freeze({
      continueWork,
      healthy,
      isUnavailable: () => unavailable,
      releaseProof,
      trackProof
    }),
    format: Object.freeze({
      bare,
      failure,
      projectFlatAccountOwnerView,
      reference,
      transportProof
    }),
    chain: Object.freeze({
      createNativeValueTerminalObserver,
      nativeExecution,
      observer,
      owner,
      pool,
      poolIndex,
      reader,
      runtime,
      system
    }),
    proofs: Object.freeze({
      onPrivateAudit,
      onProof,
      onStage,
      proofRunner
    }),
    manual: Object.freeze({
      requireManualEpoch: (...args) => requireManualEpoch(...args)
    }),
    approvals: Object.freeze({
      manualGraphApprovals,
      manualGraphs,
      manualNotes,
      nativeNoteApprovals
    }),
    account: Object.freeze({
      capability: () => capability
    })
  });

  // Flat-specific lifecycle. No caller error, receipt copy, boolean or callback
  // can create a genuine no-dispatch capability. The marker and receipt brands
  // are local to this exact original authority and are backed by its Vault.

  // Flat-specific lifecycle. No caller error, receipt copy, boolean or callback
  // can create a genuine no-dispatch capability. The marker and receipt brands
  // are local to this exact original authority and are backed by its Vault.

  // Flat-specific lifecycle. No caller error, receipt copy, boolean or callback
  // can create a genuine no-dispatch capability. The marker and receipt brands
  // are local to this exact original authority and are backed by its Vault.

  const {
    validateManualLifecycle,
    requireManualEpoch,
    manualLifecycle,
    hasManualKeeper
  } = createNativeValueManualLifecycle({
    originalKeepers: Object.freeze({
      assertOwnedFlatManualAccountKeeper,
      assertOwnedFlatManualPortfolioKeeper,
      assertOwnedFlatPortfolioAccount,
    }),
    journal: Object.freeze({
      rows: journals.operations.rows
    }),
    format: Object.freeze({
      failure,
      reference
    }),
    chain: Object.freeze({
      owner,
      poolIndex,
      runtime,
      system
    }),
    account: Object.freeze({
      capability: () => capability
    }),
    operations: Object.freeze({
      confirmTerminal: (...args) => confirmTerminal(...args),
      executeGraph: (...args) => executeGraph(...args),
      executeNote: (...args) => executeNote(...args),
      manualGraphTime: (...args) => manualGraphTime(...args),
      operation: (...args) => operation(...args),
      reconcileOriginal: (...args) => reconcileOriginal(...args),
      recoverOriginal: (...args) => recoverOriginal(...args),
      request: (...args) => request(...args),
      requireFixedManualEpoch: (...args) => requireFixedManualEpoch(...args),
      unresolved: (...args) => unresolved(...args),
      update: (...args) => update(...args)
    }),
    profile: Object.freeze({
      accountIdentity,
      asset,
      identitySHA256
    }),
    lifecycle: Object.freeze({
      exclusive,
      healthy
    }),
    proofs: Object.freeze({
      onStage
    })
  });

  const {
    capability
  } = createNativeValueAccountInterface({
    loadOriginalManualPreparation: () => import('../../custody/preparation/native-value-owner-manual-preparation-v1.mjs'),
    lifecycle: Object.freeze({
      abort: abortAccount,
      close: closeAccount,
      continueWork,
      exclusive,
      healthy
    }),
    journal: Object.freeze({
      rows: journals.operations.rows
    }),
    profile: Object.freeze({
      accountIdentity,
      accountProfile,
      asset,
      config,
      identity,
      identitySHA256,
      nativeRecoveryManualMode,
      wrapped
    }),
    operations: Object.freeze({
      confirmTerminal: (...args) => confirmTerminal(...args),
      executeGraph: (...args) => executeGraph(...args),
      executeNote: (...args) => executeNote(...args),
      manualGraphTime: (...args) => manualGraphTime(...args),
      nativeNoteApproval: (...args) => nativeNoteApproval(...args),
      operation: (...args) => operation(...args),
      privateOwnerView: (...args) => privateOwnerView(...args),
      reconcileOriginal: (...args) => reconcileOriginal(...args),
      recoverOriginal: (...args) => recoverOriginal(...args),
      register: (...args) => register(...args),
      request: (...args) => request(...args),
      requireFixedManualEpoch: (...args) => requireFixedManualEpoch(...args),
      unresolved: (...args) => unresolved(...args),
      update: (...args) => update(...args)
    }),
    manual: Object.freeze({
      hasKeeper: hasManualKeeper,
      manualLifecycle
    }),
    proofs: Object.freeze({
      onStage
    }),
    chain: Object.freeze({
      assertOwnedNativeValueExecution,
      nativeExecution,
      ownedNativeValueManualGraphReview,
      owner,
      pool,
      poolIndex,
      reader,
      runtime,
      system
    }),
    format: Object.freeze({
      bare,
      reference
    }),
    selection: Object.freeze({
      selectOwnerActions
    }),
    approvals: Object.freeze({
      manualGraphApprovals,
      manualGraphs,
      nativeProviderSets
    })
  });

  const recoveredDeviceInstallations=createRecoveredDeviceInstallations({
    lifecycle:{exclusive,healthy,continueWork},chain:{runtime,system,poolIndex,nativeExecution,reader},continuity:{recovery,nativeSourceOriginal,wrapped},
    records:{readRecord:()=>record,recoveredInstallations,reservationRows,reservationObservation,reservationSubject,originalQuote,exitRows,exitPublic,
      findExecutionInstallation:bridge=>deviceExecutionProviders.get(bridge)??deviceExecutionInstallations.get(bridge)},
    format:{sha,copy,byteSHA},validation:{identity,sourceInstallationPreparation,validateGenericBalanceNativePreparation,flatAccountGraphBinding,nativeRecoveryProviderReviewV1,
      assertOriginalNativeSourceObservedClockV1,restoreNativeDeviceOriginalW39MetricsFrameV1}
  });
  const privateState={ runtime, system, poolIndex, owner, wrapped, closed: () => closed || cancelled || unavailable || (!wrapped && capturing),
    async retainSource(){assert.ok(nativeSourceOriginal&&!sourceHandle&&!busy&&!unavailable&&!closed&&!capturing&&recovery===null);
      await healthy();assert.equal(record.revision,0,'NATIVE_SOURCE_ACCOUNT_BEFORE_EFFECTS_REQUIRED');assert.equal(record.data.operations.length,0);
      sourceRecord={schema:'ORIGINAL_NATIVE_SOURCE_ACCOUNT_SECTION_V1',sourceSHA256:nativeSourceOriginal.identity.sourceSHA256,ownedProcesses:[],confirmed:originalSourceAccountRecord(),candidate:null};
      sourceHandle=await retainOriginalNativeSourceSectionV1(nativeSourceOriginal.token,'account',sourceRecord);},
    sourceIdentity(){assert.ok(nativeSourceOriginal&&!closed&&!unavailable);return nativeSourceOriginal.identity;},
    async sourceProofReceipts(){const originalWork=idle;await originalWork;return exclusive(async()=>{
      await healthy();assert.ok(nativeSourceOriginal,'NATIVE_SOURCE_ORIGINAL_ACCOUNT_REQUIRED');
      const receipts=[];
      for(const row of deviceRows())if(row.originalSourceProofReceipt)receipts.push(restoreSourceProofReceipt(row.originalSourceProofReceipt,row.proof));
      for(const row of reservationRows()){
        if(row.originalSourceAuthorizationReceipt)receipts.push(restoreSourceProofReceipt(row.originalSourceAuthorizationReceipt,row.authorization));
        if(row.originalSourceReservationReceipt)receipts.push(restoreSourceProofReceipt(row.originalSourceReservationReceipt,row.originalSourceReservationProof));
      }
      for(const row of exitRows())if(row.originalSourceExitReceipt)receipts.push(restoreSourceProofReceipt(row.originalSourceExitReceipt,row.proof));
      assert.ok(receipts.length<=5,'NATIVE_SOURCE_ORIGINAL_PROOF_RECEIPT_COUNT');return receipts;
    });},
    deviceDeposit,privateWorkerEnabled,installPrivateReservation,privateReservationContext,privateReservationEnabled,installPrivateDeposit,privateDepositEnabled,installPrivateExit,privateExitEnabled, deviceReservation,deviceExecution, reorgState, retainReorg, assertReorgPending,
    async checkReorgPending(executor, ref, id) { await healthy(); assertReorgPending(executor, ref, id); },
    installLiveRecovery(row){assert.ok(nativeNote&&!wrapped&&(!recovery||recovery.liveArmed===true||recovery.source===true)&&nativeExecution!==null&&liveRecovery===null);
      assertDeviceOwnerExecutionBridgeV1(row.bridge,capability);
      if(liveArmedOriginal||recovery?.liveArmed)assertOriginalNativeDeviceLiveArmedObservedClockV1(row.clock,{runtime,nativeRuntime:liveArmedOriginal?.nativeRuntime??row.nativeRuntime});
      if(nativeSourceOriginal){assert.equal(row.clock,nativeSourceOriginal.clock);assert.equal(row.nativeRuntime,nativeSourceOriginal.nativeRuntime);
        assertOriginalNativeSourceObservedClockV1(row.clock,{runtime,nativeRuntime:row.nativeRuntime});}
      liveRecovery=row;},
    liveArmedCaptureOriginal(authority){const identity=assertNativeLiveArmedRecoveryCaptureV1(authority);
      assert.ok(liveArmedOriginal&&recovery===null&&liveArmedOriginal.authority===authority,'NATIVE_LIVE_ARMED_ORIGINAL_BEFORE_FUNDING');
      assert.deepEqual(identity,liveArmedOriginal.identity);
      const rows=reservationRows();assert.equal(rows.length,1,'NATIVE_LIVE_ARMED_FIXED_RESERVATION');const row=rows[0],arm=row.liveRecoveryArm;
      assert.ok(arm&&['ARMED','FIRING','UNKNOWN','RECOVERED'].includes(arm.state),'NATIVE_LIVE_ARMED_ORIGINAL_PERMISSION_REQUIRED');
      assert.equal(row.stage,'RESERVED');
      if(arm.state==='RECOVERED'){assert.equal(row.nativeOutcome,'RECOVERED');assert.ok(row.nativeTerminal&&row.nativeRecoveryLatched&&row.submission?.dispatchLatched,'NATIVE_DEVICE_RECOVERY_ORIGINAL_TERMINAL_LATCHES');
        assert.equal(nativeExecution.snapshot(row.jobId).outcome,'RECOVERED');}
      else{assert.equal(row.nativeOutcome,null);assert.equal(row.nativeTerminal,null);}
      assert.match(arm.armSHA256,/^[0-9a-f]{64}$/);assert.equal(arm.settleBefore,row.nativeBinding.settleBefore);
      assert.equal(arm.nativeBindingSHA256,sha(row.nativeBinding));
      assert.equal(arm.reservationTransactionHash,row.observation.transactionHash);
      assert.equal(arm.lossClause,'FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
      if(arm.state!=='ARMED')assert.equal(row.nativeRecoveryLatched,true,'NATIVE_LIVE_ARMED_UNKNOWN_ONLY_OBSERVE');
      return Object.freeze({parentJobId:row.jobId,armSHA256:arm.armSHA256,settleBefore:arm.settleBefore,state:arm.state});
    },
    tickLiveRecovery,armLiveRecovery,liveArmedOwnerSnapshot,
    liveArmedClockCheckpoint(expectedRuntime){assert.ok(recovery?.native&&recovery.liveArmed&&!wrapped);assert.equal(expectedRuntime,runtime);return recovery.record.observedClockSecond;},
    liveRecoveryTerms(bridge,id){return exclusive(async()=>{requireLiveRecovery(bridge);await healthy();const row=reservationRow(id);
      deviceExecutionOriginal(bridge,row);await deviceExecutionPublic(bridge,row);return armPublic(row);});},
    ...recoveredDeviceInstallations,

    deviceExit,deviceExitTerms(bridge,input){return exclusive(async()=>{await healthy();return exitTerms(bridge,input);});},
    deviceOutputBalance(bridge,input){return exclusive(async()=>{await healthy();return outputBalance(bridge,input);});},
    deviceExitStatus(id,bridge){return exclusive(async()=>{await healthy();const row=exitRow(id);exitBinding(row.consent,bridge);return exitPublic(row);});},
    installDeviceExecution(bridge,installation){return exclusive(async()=>{
      await healthy();assert.ok(!wrapped&&nativeExecution!==null,'DEVICE_EXECUTION_ORIGINAL_EXECUTOR_REQUIRED');
      assert.equal(installation.nativeExecution,nativeExecution,'DEVICE_EXECUTION_EXECUTOR_REBOUND');
      assert.ok(!deviceExecutionInstallations.has(bridge)&&!deviceExecutionProviders.has(installation.reservationBridge),
        'DEVICE_EXECUTION_ORIGINAL_INSTALLATION_ONCE');
      // Installation after a source reservation is forbidden even though the
      // executor's pure packet decoder itself does not read the source ledger.
      const matching = reservationRows().filter(row => ['origin','pairingId','devicePublicKey'].every(name=>row.consent[name]===installation.descriptor[name]));
      if (matching.some(row => row.submission !== null)) {
        const retained = recoveredInstallations.find(row => sha(row.descriptor) === sha(installation.descriptor));
        assert.ok(retained && !reboundInstallations.has(sha(retained.descriptor)), 'DEVICE_EXECUTION_INSTALL_BEFORE_S_REQUIRED');
        const actual = installation.providers.map(row => ({ slot: row.slot, deliveryRiskSalt: row.deliveryRiskSalt,
          custodyIdentitySHA256: sha(nativeRecoveryProviderReviewV1(row.custody, { runtime, system, poolIndex })) }));
        assert.deepEqual(actual, retained.providers, 'NATIVE_ACCOUNT_ORIGINAL_PROVIDERS_CHANGED');
        for (const row of matching) if (row.submission !== null) {
          assert.ok(row.nativeBinding && row.submission.dispatchLatched, 'DEVICE_EXECUTION_BINDING_BEFORE_S_REQUIRED');
          assert.deepEqual(row.nativeBinding, flatAccountGraphBinding({ authorization: row.authorization, rolePackets: row.rolePackets }, identity));
        }
        reboundInstallations.add(sha(retained.descriptor));
      }
      if(nativeSourceOriginal) {
        const originalPreparation=sourceInstallationPreparation(readDeviceOwnerReservationOriginalPreparationV1(installation.reservationBridge,capability));
        if(recovery?.source) {
          const retained=recoveredInstallations.filter(row=>sha(row.descriptor)===sha(installation.descriptor));
          assert.equal(retained.length,1,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PAIRING_REQUIRED');
          assert.deepEqual(originalPreparation,sourceInstallationPreparation(retained[0].preparation),'NATIVE_SOURCE_ORIGINAL_INSTALLATION_CHANGED');
          const actual=installation.providers.map(row=>({slot:row.slot,deliveryRiskSalt:row.deliveryRiskSalt,
            custodyIdentitySHA256:sha(nativeRecoveryProviderReviewV1(row.custody,{runtime,system,poolIndex}))}));
          assert.deepEqual(actual,retained[0].providers,'NATIVE_ACCOUNT_ORIGINAL_PROVIDERS_CHANGED');
        }
        installation={...installation,sourcePreparation:originalPreparation};
      }
      deviceExecutionInstallations.set(bridge,installation);deviceExecutionProviders.set(installation.reservationBridge,installation);
      return{installed:true,originalExecutor:true};});},
    deviceExecutionStatus(id,bridge){return exclusive(async()=>{await healthy();const row=reservationRow(id);deviceExecutionOriginal(bridge,row);
      await refreshLiveOperationClock();return deviceExecutionPublic(bridge,row);});},
    deviceReservationStatus(id,descriptor) { return exclusive(async()=>{await healthy();const row=reservationRow(id);
      reservationSubject(row.consent.depositJobId,row.consent.custody.rootId,descriptor);return reservationPublic(row);}); },
    deviceDepositStatus(id) { return exclusive(async () => { await healthy(); return devicePublic(deviceRow(id)); }); },
    async captureDeviceD26Observation(jobId){
      assert.ok(!wrapped&&!busy&&!closed&&!cancelled&&!unavailable&&!capturing,'NATIVE_D26_RECOVERY_ORIGINAL_IDLE_ACCOUNT');
      // Fence the original account BEFORE the first await. A snapshot copy or
      // a restored ID cannot bypass this private branch.
      capturing=true;
      try{
        await healthy();const row=deviceRow(jobId);deviceBinding(row.consent);
        assert.ok(['FUNDING_UNKNOWN','CONFIRMED'].includes(row.stage),'NATIVE_D26_RECOVERY_ADMITTED_FUNDING_REQUIRED');
        assert.equal(row.submission?.dispatchLatched,true);assert.ok(row.proof&&row.nullifier);
        assert.equal(byteSHA(Buffer.from(row.proof.proof,'hex')),row.proofSHA256,'NATIVE_D26_RECOVERY_PROOF_CHANGED');
        assert.equal(sha(row.proof.publicInputs),row.publicInputsSHA256);
        const m=await import('../../operations/deployments/native-value/native-value-system-v2.mjs');
        const systemRecord=await m.captureNativeValueD26ObservationSystemV1(runtime,system);
        const snapshot={schema:'ORIGINAL_NATIVE_DEVICE_D26_OBSERVATION_V1',poolIndex,identity:copy(identity),
          identitySHA256,asset:copy(asset),accountIdentity:copy(accountIdentity),config:copy(config),row:copy(row),system:systemRecord};
        await proofRunner.close();if(nativeExecution!==null)await nativeExecution.close();
        const stopped=await owner.close();assert.deepEqual(stopped,{closed:true,childExited:true});
        const report=owner.report();assert.equal(report.closed,true);assert.equal(report.childExited,true);
        m.stopCapturedNativeValueD26ObservationSystemV1(runtime,system);
        closed=true;password=null;record=null;deviceExecutionInstallations.clear();deviceExecutionProviders.clear();
        return snapshot;
      }catch(error){unavailable=true;throw error;}
    },
    nativeFence(authority) {
      assert.equal(nativeSourceOriginal,null,'NATIVE_SOURCE_ACCOUNT_LEGACY_CAPTURE_DENIED');
      const admitted = assertNativeEconomicRecoveryCaptureV1(authority);
      if(admitted.profile==='NATIVE_VALUE_LIVE_ARMED_RECOVERY_V1')privateState.liveArmedCaptureOriginal(authority);
      else assert.equal(liveArmedOriginal,null,'NATIVE_LIVE_ARMED_DISTINCT_CAPTURE');
      assert.ok(!wrapped && !busy && !closed && !cancelled && !unavailable && !capturing, 'NATIVE_ACCOUNT_ORIGINAL_IDLE_REQUIRED');
      assert.equal(nativeValueOriginalRecoverySourceV1(runtime, system), admitted.sourceSHA256, 'NATIVE_ACCOUNT_ORIGINAL_SOURCE_CHANGED');
      nativeCaptureOwnerIdentity = nativeValueOwnerEconomicIdentityV1(owner, { runtime, system, poolIndex });
      if (nativeExecution !== null) nativeExecutionAssert(nativeExecution, { runtime, system, poolIndex });
      const selected = [...nativeProviderSets].map(([reference, rows]) => ({ reference, providers: rows.map(row => ({ ...row })) }));
      const installationBindings = [...deviceExecutionInstallations.values()].map(value => ({
        descriptor: copy(value.descriptor), providers: value.providers.map(row => ({ ...row })) }));
      const all = [...selected.flatMap(value => value.providers), ...installationBindings.flatMap(value => value.providers)];
      assert.ok(all.every(row => row.slot === 0 && row.custody === all[0]?.custody), 'NATIVE_ACCOUNT_FIXED_ORIGINAL_PROVIDER_REQUIRED');
      const providerBinding = row => ({ slot: row.slot, deliveryRiskSalt: row.deliveryRiskSalt,
        custodyIdentitySHA256: sha(nativeRecoveryProviderReviewV1(row.custody, { runtime, system, poolIndex })) });
      captureProviders = selected;
      captureProviderBindings = { operations: selected.map(({ reference, providers }) => ({ reference, providers: providers.map(providerBinding) })),
        installations: installationBindings.map(({ descriptor, providers }) => ({ descriptor, providers: providers.map(providerBinding) })) };
      nativeCaptureIdentity = admitted; capturing = true; // no asynchronous gap admits another request
      return Object.freeze({ owner, nativeExecution, providers: Object.freeze(all.map(row => row.custody)) });
    },
    async nativeCapture(token) {
      const admitted = nativeEconomicRecoverySectionIdentityV1(token, 'account');
      assert.ok(!wrapped && capturing && !closed && !captureStarted, 'NATIVE_ACCOUNT_ORIGINAL_CAPTURE_REQUIRED');
      assert.deepEqual(admitted, nativeCaptureIdentity); captureStarted = true;
      // Other sections may already be fenced: only this exact same encrypted
      // journal is read. No original economic capability is reconstructed.
      assert.deepEqual(await vault.read(password), record, 'FLAT_ACCOUNT_STORAGE_CHANGED');
      nativeCaptureRecord = { schema: liveArmedOriginal?'ORIGINAL_NATIVE_LIVE_ARMED_ACCOUNT_RECOVERY_V1':nativeNote?'ORIGINAL_NATIVE_NOTE_ACCOUNT_ECONOMIC_RECOVERY_V1':'ORIGINAL_NATIVE_ACCOUNT_ECONOMIC_RECOVERY_V1', sourceSHA256: admitted.sourceSHA256,
        poolIndex, directory, password, accountId, journalId, checkpointSHA256: sha(record),
        identitySHA256, accountIdentity: copy(accountIdentity), ownerIdentity: copy(nativeCaptureOwnerIdentity),
        hasNativeExecution: nativeExecution !== null, manualMode: hasManualKeeper() || nativeRecoveryManualMode,
        providerBindings: copy(captureProviderBindings),...(liveArmedOriginal?{observedClockSecond:captureOriginalNativeDeviceLiveArmedClockCheckpointV1(liveArmedOriginal.clock)}:{}) };
      return copy(nativeCaptureRecord);
    },
    async nativeStop(token) {
      assert.deepEqual(nativeEconomicRecoverySectionIdentityV1(token, 'account'), nativeCaptureIdentity);
      assert.ok(!wrapped && capturing && nativeCaptureRecord && !busy && !closed, 'NATIVE_ACCOUNT_CAPTURE_OWNS_LIFETIME');
      await proofRunner.close();
      assert.equal(sha(await vault.read(password)), nativeCaptureRecord.checkpointSHA256, 'FLAT_ACCOUNT_STORAGE_CHANGED');
      // Executor, provider, owner and operator lifetimes belong to their own
      // issuer sections. Closing this coordinator grants no permission to send.
      closed = true; password = null; record = null; nativeCaptureRecord = null;
      deviceExecutionInstallations.clear(); deviceExecutionProviders.clear();
      manualGraphApprovals.clear(); nativeNoteApprovals.clear(); nativeProviderSets.clear();
      return { closed: true, originalResourcesStopped: true };
    },
    async nativeAbort(token) {
      assert.deepEqual(nativeEconomicRecoverySectionIdentityV1(token, 'account'), nativeCaptureIdentity);
      assert.ok(!wrapped && capturing, 'NATIVE_ACCOUNT_CAPTURE_OWNS_LIFETIME');
      activeDeviceOwner?.stop(); await proofRunner.abort(); await idle; await proofRunner.close();
      closed = true; password = null; record = null;
      deviceExecutionInstallations.clear(); deviceExecutionProviders.clear();
      return { closed: true, originalResourcesStopped: true };
    },
    initialization(){assert.ok(wrapped&&!closed&&!capturing);return {directory,password,accountId,journalId,poolIndex};},
    fence(){assert.ok(wrapped&&!busy&&!closed&&!cancelled&&!unavailable&&!capturing,'WRAPPED_ACCOUNT_ORIGINAL_CAPTURE_REQUIRED');capturing=true;
      captureProviders=[...nativeProviderSets].map(([reference,rows])=>({reference,providers:rows.map(row=>({...row}))}));captureProviderBindings=captureProviders.map(({reference,providers})=>({reference,providers:providers.map(row=>({slot:row.slot,deliveryRiskSalt:row.deliveryRiskSalt,custodyIdentitySHA256:sha(recoveryProviderReviewV1(row.custody,{runtime,system,poolIndex}))}))}));return captureProviders;},
    async capture(){
      if(!capturing)privateState.fence();assert.ok(!captureStarted,'WRAPPED_ACCOUNT_CAPTURE_ONCE');captureStarted=true;
      assert.deepEqual(await vault.read(password),record,'FLAT_ACCOUNT_STORAGE_CHANGED');
      const m=await import('../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs');
      const providers=captureProviders;
      const providerBindings=captureProviderBindings;
      const approvals=[...manualGraphApprovals.values()].map(approval=>{const original=manualGraphs.get(approval);return {body:copy(original.body),review:copy(original.review)};});
      return {record:{schema:'WRAPPED_ORIGINAL_ACCOUNT_RECOVERY_V1',poolIndex,directory,password,accountId,journalId,
        checkpointSHA256:sha(record),providerBindings,approvals},providers};
    },
    recoveredApprovals:()=>[...manualGraphApprovals.values()],
  };
  owned.set(capability,privateState);
  if(recovery && !recovery.native){
    const m=await import('../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs');
    const restored=recovery.providers.map(({reference,providers})=>({reference,providers:providers.map(row=>({slot:row.slot,deliveryRiskSalt:row.deliveryRiskSalt,
      custodyIdentitySHA256:sha(m.ownedNativeValueProviderCustodyReview(row.custody,{runtime,system,poolIndex}))}))}));
    assert.equal(sha(restored),sha(recovery.record.providerBindings),'WRAPPED_ACCOUNT_ORIGINAL_PROVIDERS_CHANGED');
    for(const {reference,providers}of recovery.providers)nativeProviderSets.set(reference,Object.freeze(providers.map(row=>Object.freeze({...row}))));
    for(const retained of recovery.record.approvals){
      const body=immutable(retained.body),review=immutable(retained.review),entry=operation(body.ownerOperationRef);
      assert.equal(body.assetId,asset.assetId);assert.equal(review.originalAccountLifetime,config.lifetime);assert.equal(review.ownerOperationRef,entry.ownerOperationRef);
      const approval=Object.freeze(Object.create(null));
      manualGraphs.set(approval,{account:capability,body,review,check(){assertOwnedNativeValueExecution(nativeExecution,{runtime,system,poolIndex});},
        checkRoute(){throw Error('WRAPPED_ACCOUNT_RECOVERED_CONSENT_REVIEW_REQUIRED');}});
      manualGraphApprovals.set(body.ownerOperationRef,approval);
    }
  }
  if (recovery?.native) {
    const restored = recovery.providers.map(({ reference, providers }) => ({ reference, providers: providers.map(row => ({
      slot: row.slot, deliveryRiskSalt: row.deliveryRiskSalt,
      custodyIdentitySHA256: sha(nativeRecoveryProviderReviewV1(row.custody, { runtime, system, poolIndex })) })) }));
    assert.deepEqual(restored, recovery.record.providerBindings.operations, 'NATIVE_ACCOUNT_ORIGINAL_PROVIDERS_CHANGED');
    for (const { reference, providers } of recovery.providers)
      nativeProviderSets.set(reference, Object.freeze(providers.map(row => Object.freeze({ ...row }))));
    // Original pairings/manual keepers are separate private producers. Persisted
    // IDs or signatures cannot recreate their WeakMap authority after restart.
    manualGraphApprovals.clear(); nativeNoteApprovals.clear();
  }
  if(nativeSourceOriginal&&!recovery){try{await privateState.retainSource();}catch(error){unavailable=true;await proofRunner.close();closed=true;password=null;record=null;throw error;}}
  return capability;
}

/** Private bootstrap only. Serialized records alone never establish ownership;
 * reopen consumes an ephemeral fixed wallet-recovery dispatcher capability. */
export async function captureWrappedWalletAccountForReopenV1(account){
 const state=owned.get(account);assert.ok(state?.wrapped,'WRAPPED_ACCOUNT_ORIGINAL_REQUIRED');return state.capture();
}
export async function stopCapturedWrappedWalletAccountV1(account){
 const state=owned.get(account);assert.ok(state?.wrapped,'WRAPPED_ACCOUNT_ORIGINAL_REQUIRED');return account.close();
}
export async function reopenWrappedWalletAccountFromRecoveryV1(token){
 const {consumeWrappedWalletRecoveryPartV1}=await import('../../operations/wallet/wrapped-wallet-composition-v1.mjs');
 const retained=consumeWrappedWalletRecoveryPartV1(token,'account');exactRecord(retained,['input','record','providers']);
 exactRecord(retained.record,['schema','poolIndex','directory','password','accountId','journalId','checkpointSHA256','providerBindings','approvals']);
 assert.equal(retained.record.schema,'WRAPPED_ORIGINAL_ACCOUNT_RECOVERY_V1');
 assert.equal(retained.input.poolIndex,retained.record.poolIndex);assert.equal(retained.input.accountId,retained.record.accountId);assert.equal(retained.input.journalId,retained.record.journalId);
 assertWrappedWalletAccountReleasedV1();assert.equal(wrappedOwnerAccounts.has(retained.input.owner),false,'WRAPPED_WALLET_OWNER_ALREADY_LEASED');wrappedOwnerAccounts.add(retained.input.owner);
 return createAccountAuthority(retained.input,{},true,retained);
}
export function recoveredWrappedWalletManualGraphApprovalsV1(account){
 const state=owned.get(account);assert.ok(state?.wrapped,'WRAPPED_ACCOUNT_ORIGINAL_REQUIRED');assertOwnedNativeValueAccountAuthority(account);return Object.freeze(state.recoveredApprovals());
}

export function wrappedWalletAccountPrivateInitializationV1(account){const state=owned.get(account);assert.ok(state?.wrapped);return state.initialization();}

export function fenceWrappedWalletAccountRecoveryV1(account){const state=owned.get(account);assert.ok(state?.wrapped);return state.fence();}

/** Fixed native retention producer. No record/path/descriptor supplied by caller
 * can mint recovery: original account and paired actor references are required. */
export async function captureOriginalDeviceD26ObservationV1(input) {
  assert.equal(arguments.length,1);exactRecord(input,['actor','account','runtime','system','jobId']);
  const {actor,account,runtime,system,jobId}=input;reference(jobId);
  assertOwnedNativeValueAccountAuthority(account,{runtime,system});
  const m=await import('../../operations/recovery/native-original-source-lifecycle-v1.mjs');
  m.assertPairedOriginalAccountActorAccountV2(actor,account);
  const descriptor=copy(m.pairedOriginalAccountActorDescriptorV2(actor));
  const data=await owned.get(account).captureDeviceD26Observation(jobId);actor.close();
  assert.equal(data.row.consent.origin,descriptor.origin);assert.equal(data.row.consent.pairingId,descriptor.pairingId);
  assert.equal(data.row.consent.devicePublicKey,descriptor.devicePublicKey);
  return {...data,descriptor};
}

/** Original native section only. A wrapped or D26 observation token, copied
 * account, caller callback or restored DTO cannot reconstruct this authority. */
export function fenceOriginalNativeAccountEconomicRecoveryV1(account, authority) {
  assert.equal(arguments.length, 2); const state = owned.get(account);
  assert.ok(state?.wrapped === false, 'NATIVE_ACCOUNT_ORIGINAL_REQUIRED'); return state.nativeFence(authority);
}
export function captureOriginalNativeAccountEconomicRecoveryV1(account, token) {
  assert.equal(arguments.length, 2); const state = owned.get(account);
  assert.ok(state?.wrapped === false, 'NATIVE_ACCOUNT_ORIGINAL_REQUIRED'); return state.nativeCapture(token);
}
export function stopCapturedNativeAccountEconomicRecoveryV1(account, token) {
  assert.equal(arguments.length, 2); const state = owned.get(account);
  assert.ok(state?.wrapped === false, 'NATIVE_ACCOUNT_ORIGINAL_REQUIRED'); return state.nativeStop(token);
}
export function abortNativeAccountEconomicRecoveryV1(account, token) {
  assert.equal(arguments.length, 2); const state = owned.get(account);
  assert.ok(state?.wrapped === false, 'NATIVE_ACCOUNT_ORIGINAL_REQUIRED'); return state.nativeAbort(token);
}
export async function reopenOriginalNativeAccountEconomicRecoveryV1(token, contexts) {
  assert.equal(arguments.length, 2); exactRecord(contexts, ['runtime', 'system', 'owner', 'nativeExecution', 'providerCustody']);
  const { runtime, system, owner, nativeExecution, providerCustody } = contexts;
  const admitted = nativeEconomicRecoverySectionIdentityV1(token, 'account');
  assert.equal(nativeValueOriginalRecoverySourceV1(runtime, system), admitted.sourceSHA256);
  const retained = consumeNativeEconomicRecoverySectionV1(token, 'account');
  exactRecord(retained, ['schema', 'sourceSHA256', 'poolIndex', 'directory', 'password', 'accountId', 'journalId',
    'checkpointSHA256', 'identitySHA256', 'accountIdentity', 'ownerIdentity', 'hasNativeExecution', 'manualMode', 'providerBindings',...(admitted.profile==='NATIVE_VALUE_LIVE_ARMED_RECOVERY_V1'?['observedClockSecond']:[])]);
  // Only the original one-use recovery issuer can supply this sealed section.
  // Its producer lineage is retained, never inferred from a caller DTO/option.
  assert.ok(['ORIGINAL_NATIVE_ACCOUNT_ECONOMIC_RECOVERY_V1','ORIGINAL_NATIVE_NOTE_ACCOUNT_ECONOMIC_RECOVERY_V1','ORIGINAL_NATIVE_LIVE_ARMED_ACCOUNT_RECOVERY_V1'].includes(retained.schema),
    'NATIVE_ACCOUNT_ORIGINAL_RECOVERY_PROFILE');
  const liveArmed=retained.schema==='ORIGINAL_NATIVE_LIVE_ARMED_ACCOUNT_RECOVERY_V1';
  assert.equal(liveArmed,admitted.profile==='NATIVE_VALUE_LIVE_ARMED_RECOVERY_V1','NATIVE_LIVE_ARMED_DISTINCT_ACCOUNT_TOKEN');
  if(liveArmed)assert.ok(typeof retained.observedClockSecond==='string'&&/^[1-9][0-9]{0,19}$/.test(retained.observedClockSecond),'NATIVE_LIVE_ARMED_ORIGINAL_CLOCK_CHECKPOINT');
  const nativeNote=liveArmed||retained.schema==='ORIGINAL_NATIVE_NOTE_ACCOUNT_ECONOMIC_RECOVERY_V1';
  assert.equal(retained.sourceSHA256, admitted.sourceSHA256);
  assert.equal(typeof retained.manualMode, 'boolean'); assert.equal(typeof retained.hasNativeExecution, 'boolean');
  const actualOwner = nativeValueOwnerEconomicIdentityV1(owner, { runtime, system, poolIndex: retained.poolIndex });
  for (const name of ['identitySHA256', 'processIdentitySHA256']) assert.equal(actualOwner[name], retained.ownerIdentity[name], 'NATIVE_ACCOUNT_ORIGINAL_OWNER_CHANGED');
  assert.ok(actualOwner.generation > retained.ownerIdentity.generation, 'NATIVE_ACCOUNT_OWNER_SUCCESSOR_REQUIRED');
  assert.equal(retained.hasNativeExecution, nativeExecution !== null, 'NATIVE_ACCOUNT_ORIGINAL_EXECUTOR_CHANGED');
  if (nativeExecution !== null) nativeExecutionAssert(nativeExecution, { runtime, system, poolIndex: retained.poolIndex });
  exactRecord(retained.providerBindings, ['operations', 'installations']);
  const provider = row => { exactRecord(row, ['slot', 'deliveryRiskSalt', 'custodyIdentitySHA256']); assert.equal(row.slot, 0);
    assert.equal(sha(nativeRecoveryProviderReviewV1(providerCustody, { runtime, system, poolIndex: retained.poolIndex })), row.custodyIdentitySHA256,
      'NATIVE_ACCOUNT_ORIGINAL_PROVIDERS_CHANGED'); return { slot: row.slot, deliveryRiskSalt: row.deliveryRiskSalt, custody: providerCustody }; };
  const providers = retained.providerBindings.operations.map(row => { exactRecord(row, ['reference', 'providers']);
    return { reference: row.reference, providers: row.providers.map(provider) }; });
  for (const installation of retained.providerBindings.installations) {
    exactRecord(installation, ['descriptor', 'providers']); installation.providers.forEach(provider);
  }
  return createAccountAuthority({ runtime, system, poolIndex: retained.poolIndex, owner, nativeExecution,
    accountId: retained.accountId, journalId: retained.journalId }, {}, false, { native: true, liveArmed, record: retained, providers },nativeNote);
}

/** Fixed private actor producer: source is read only from an authentic live
 * account/system, never from a descriptor or request-selected account ID. */
export function nativeValueOriginalRecoverySourceV1FromAccount(account) {
  assert.equal(arguments.length, 1); assertOwnedNativeValueAccountAuthority(account);
  const state = owned.get(account); return nativeValueOriginalRecoverySourceV1(state.runtime, state.system);
}

/** Abrupt SOURCE opening is possible only after the capsule has proved every
 * former process absent and all sections confirmed. Pending work stays UNKNOWN. */
export async function reopenOriginalNativeAccountSourceV1(token,contexts) {
  assert.equal(arguments.length,2);exactRecord(contexts,['runtime','system','owner','nativeExecution','providerCustody','clock','nativeRuntime']);
  const identity=nativeSourceRecoverySectionIdentityV1(token,'account');assert.equal(identity.profile,'NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1');
  const {runtime,system,owner,nativeExecution,providerCustody,clock,nativeRuntime}=contexts;
  assert.equal(nativeValueOriginalRecoverySourceV1(runtime,system),identity.sourceSHA256);
  assertOriginalNativeSourceObservedClockV1(clock,{runtime,nativeRuntime});
  const section=consumeOriginalNativeSourceSectionV1(token,'account');
  exactRecord(section,['schema','sourceSHA256','ownedProcesses','confirmed','candidate']);
  assert.equal(section.schema,'ORIGINAL_NATIVE_SOURCE_ACCOUNT_SECTION_V1');assert.equal(section.sourceSHA256,identity.sourceSHA256);
  assert.deepEqual(section.ownedProcesses,[]);assert.equal(section.candidate,null,'NATIVE_SOURCE_PENDING_ONLY_UNKNOWN');
  const retained=section.confirmed;
  exactRecord(retained,['schema','sourceSHA256','poolIndex','directory','password','accountId','journalId','checkpointSHA256',
    'identitySHA256','accountIdentity','ownerIdentity','hasNativeExecution','manualMode','providerBindings',...(Object.hasOwn(retained,'interruptedOperation')?['interruptedOperation']:[])]);
  if(Object.hasOwn(retained,'interruptedOperation'))assert.equal(typeof retained.interruptedOperation,'boolean','NATIVE_SOURCE_ORIGINAL_INTERRUPTION');
  assert.equal(retained.schema,'ORIGINAL_NATIVE_SOURCE_NOTE_ACCOUNT_SEED_V1');assert.equal(retained.sourceSHA256,identity.sourceSHA256);
  assert.equal(typeof retained.manualMode,'boolean');assert.equal(retained.hasNativeExecution,true);assert.notEqual(nativeExecution,null);
  const actualOwner=nativeValueOwnerEconomicIdentityV1(owner,{runtime,system,poolIndex:retained.poolIndex});
  for(const name of ['identitySHA256','processIdentitySHA256'])assert.equal(actualOwner[name],retained.ownerIdentity[name],'NATIVE_SOURCE_ORIGINAL_OWNER_CHANGED');
  assert.ok(actualOwner.generation>retained.ownerIdentity.generation,'NATIVE_SOURCE_ORIGINAL_OWNER_SUCCESSOR_REQUIRED');
  nativeExecutionAssert(nativeExecution,{runtime,system,poolIndex:retained.poolIndex});
  exactRecord(retained.providerBindings,['operations','installations']);
  const provider=row=>{exactRecord(row,['slot','deliveryRiskSalt','custodyIdentitySHA256']);assert.equal(row.slot,0);
    assert.equal(sha(nativeRecoveryProviderReviewV1(providerCustody,{runtime,system,poolIndex:retained.poolIndex})),row.custodyIdentitySHA256,'NATIVE_SOURCE_ORIGINAL_PROVIDER_CHANGED');
    return {slot:row.slot,deliveryRiskSalt:row.deliveryRiskSalt,custody:providerCustody};};
  const providers=retained.providerBindings.operations.map(row=>{exactRecord(row,['reference','providers']);return {reference:row.reference,providers:row.providers.map(provider)};});
  for(const row of retained.providerBindings.installations){exactRecord(row,['descriptor','providers','preparation']);exactRecord(row.preparation,['nativePreparation','invoiceSignatures']);validateGenericBalanceNativePreparation(row.preparation.nativePreparation);row.providers.forEach(provider);}
  const handle=await resumeOriginalNativeSourceSectionV1(token,'account');
  return createAccountAuthority({runtime,system,poolIndex:retained.poolIndex,owner,nativeExecution,accountId:retained.accountId,journalId:retained.journalId},
    {},false,{native:true,source:true,record:retained,providers},true,null,{token,identity,clock,nativeRuntime,handle});
}
export function assertOriginalNativeAccountSourceV1(account,identity) {
  assert.equal(arguments.length,2);assertOwnedNativeValueAccountAuthority(account);assert.deepEqual(owned.get(account).sourceIdentity(),identity);
}

export async function installOriginalNativePrivateReservationV2(account,bridge){assert.equal(arguments.length,2);assertDeviceOwnerReservationBridgeV1(bridge,account);assert.ok(isOriginalNativePrivateReservationBridgeV2(bridge),'NATIVE_PRIVATE_U_ORIGINAL_BRIDGE');const row=owned.get(account);assert.ok(row,'NATIVE_PRIVATE_U_ORIGINAL_ACCOUNT');return row.installPrivateReservation(bridge);}
export function isOriginalNativePrivateReservationAccountV2(account){assert.equal(arguments.length,1);const row=owned.get(account);assert.ok(row,'NATIVE_PRIVATE_U_ORIGINAL_ACCOUNT');return row.privateReservationEnabled();}
export function readOriginalNativePrivateReservationContextV2(account,bridge,fields){assert.equal(arguments.length,3);assertDeviceOwnerReservationBridgeV1(bridge,account);assert.ok(isOriginalNativePrivateReservationBridgeV2(bridge));const row=owned.get(account);assert.ok(row);return row.privateReservationContext(bridge,copy(fields));}

export function isOriginalNativePrivateWorkerAccountV3(account){assert.equal(arguments.length,1);assertOwnedNativeValueAccountAuthority(account);return owned.get(account).privateWorkerEnabled();}
