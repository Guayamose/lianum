import {validateOwnerGraphReview} from '../../../../../apps/wallet/src/client/features/accounts/owner-graph-review-v1.mjs';
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
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { assertNativeEconomicRecoveryCaptureV1, assertNativeLiveArmedRecoveryCaptureV1, nativeEconomicRecoverySectionIdentityV1, consumeNativeEconomicRecoverySectionV1 }
  from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { nativeValueOriginalRecoverySourceV1 } from '../../operations/deployments/native-value/native-value-system-v2.mjs';
import { nativeValueOwnerEconomicIdentityV1 } from '../../../../custody/src/processes/native-value-owner-process-v2.mjs';
import { ownedNativeValueProviderCustodyReview as nativeRecoveryProviderReviewV1 } from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import { assertLocalEvm } from '../../chains/evm/runtime/local-evm-ownership.mjs';
import { createProofProcess, createNativeEconomicNoteProofProcessV1 } from '../../../../engine/src/execution/proofs/proof-process.mjs';
import { reserveProjection } from '../../../../engine/src/execution/local/local-ledger.mjs';
import { genericAccountIdentity, validateGenericAccountConfig, validateBoundRequest, validateOutcome, immutable, copy, sha }
  from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import { assertOwnedNativeValueWalletSystem as nativeSystem } from '../../operations/deployments/native-value/native-value-wallet-binding-v2.mjs';
import { createNativeValueSystemStateReader as nativeReader } from '../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { assertOwnedPoolAsset } from '../../chains/shared/contracts/owned-pool-asset.mjs';
import { assertOwnedNativeValueExecution as nativeExecutionAssert, ownedNativeValueManualGraphReview as nativeGraphReview, reconcileOriginalDeviceNativeRecoveryV1 } from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import { createNativeValueTerminalObserver as nativeTerminal, decodeNativeValueTerminalCalldata } from '../../execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { decodeStatement } from '../../execution/encoding/statements.mjs';
import { reservationWitness } from '../../execution/account/preparation/funding-inputs.mjs';
import { encodeFlatTransaction } from '../../execution/encoding/transaction-codec.mjs';
import { privateFailureDiagnostic } from '../../execution/account/reconciliation/failure-diagnostics.mjs';
import { assertOwnedNativeValueOwnerProcess as nativeOwner } from '../../../../custody/src/processes/native-value-owner-process-v2.mjs';
import { createNativeValueOwnerObserver as nativeObserver, assertOwnedNativeValueOwnerObserver as nativeObserverAssert } from '../../../../custody/src/observers/native-value-owner-observer-v2.mjs';
import { createFlatProofRunner, withFlatHash } from '../../../../proofs/src/tooling/scoped-proof-tools.mjs';
import { flatAccountAsset, flatAccountGraphBinding, flatAccountCalldataHash, validateFlatAccountOwnerObservation, validateFlatManualGraphAdmissionTime }
  from './flat-account-validation.mjs';

import { validateFlatManualReview, validateFlatManualRecords, validateFlatManualReauthorization,
  currentFlatManualAuthorization } from '../../../../custody/src/preparation/flat-owner-manual-binding.mjs';
import { assertOwnedFlatManualAccountKeeper } from '../storage/flat-manual-account-keeper.mjs';
import { assertOwnedFlatManualPortfolioKeeper } from '../portfolio/flat-manual-portfolio-keeper.mjs';
import { assertOwnedFlatPortfolioAccount } from './flat-portfolio-authority.mjs';

import { assertOwnedWrappedClaimWalletSystemV1 } from '../../operations/deployments/wrapped/wrapped-claim-wallet-binding-v1.mjs';
import { createWrappedWalletStateReaderV1 } from '../../execution/wrapped/reconciliation/wrapped-wallet-state-v1.mjs';
import { createWrappedWalletTerminalObserverV1 } from '../../execution/wrapped/reconciliation/wrapped-wallet-terminal-v1.mjs';
import { assertOwnedWrappedClaimOwnerProcessV1 } from '../../../../custody/src/processes/wrapped-claim-owner-process-v1.mjs';
import { createWrappedClaimOwnerObserverV1, assertOwnedWrappedClaimOwnerObserverV1 } from '../../../../custody/src/observers/wrapped-claim-owner-observer-v1.mjs';
import { validateWrappedClaimOperationalRegistration } from '../../claims/ingress/operational-registration-v2.mjs';
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
import { validateNativeValueManualReview, validateNativeValueManualRecords } from '../../../../custody/src/preparation/native-value-owner-manual-binding-v1.mjs';
import { consumeDeviceOwnerDepositAuthorizationV1, assertDeviceOwnerDepositBridgeV1 }
  from './device-owner-deposit-bridge-v1.mjs';
import { walletInputPublicWords, decodeWalletPoolInputs, balanceCommitment } from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { normalizeDeviceDepositWitnessV1, deviceDepositWitnessBytesV1, deviceDepositConsentMessageV1 }
  from '../../../../mobile-protocol/src/device-deposit-consent-v1.mjs';
import { createHash } from 'node:crypto';
import { nullifier } from '../../../../engine/src/notes/private-note-encoding.mjs';
import { consumeDeviceOwnerReservationAuthorizationV1,assertDeviceOwnerReservationBridgeV1 } from './device-owner-reservation-bridge-v1.mjs';
import { normalizeDeviceReservationWitnessV1,deviceReservationWitnessBytesV1,deviceReservationConsentMessageV1,
  normalizeDeviceReservationCapsuleOptionsV1,wipeDeviceReservationWitnessV1 } from '../../../../mobile-protocol/src/device-reservation-consent-v1.mjs';
import { compileFundedGraph,attachFundedSignatures,ownerAuthorizationMessage } from '../../../../engine/src/execution/graph/funded-graph.mjs';
import { validateGenericBalanceNativePreparation,genericBalanceNativeTerms } from '../../../../engine/src/execution/balances/generic-balance-native-preparation.mjs';
import { buildAuthorizedEnvelope } from '../../../../custody/src/signing/authorized-envelope.mjs';
import { createRoleProofClient } from '../../../../proofs/src/jobs/role-client.mjs';
import { encodeStatement } from '../../execution/encoding/statements.mjs';
import {consumeDeviceOwnerExecutionInstallationV1,consumeDeviceOwnerExecutionAuthorizationV1,assertDeviceOwnerExecutionBridgeV1}
  from './device-owner-execution-bridge-v1.mjs';
import {deviceExecutionConsentMessageV1} from '../../../../mobile-protocol/src/device-execution-consent-v1.mjs';
import {normalizeDeviceExitWitnessV1,deviceExitWitnessBytesV1,wipeDeviceExitWitnessV1,deviceExitConsentMessageV1}
  from '../../../../mobile-protocol/src/device-exit-consent-v1.mjs';
import {verifyPrivateNotePath} from '../../../../engine/src/notes/private-note-tree.mjs';
import {captureNativeDeviceOriginalW39MetricsFrameV1,restoreNativeDeviceOriginalW39MetricsFrameV1}
  from './native-device-original-w39-metrics-frame-v1.mjs';

import {deviceRecoveryArmConsentMessageV1,validateDeviceRecoveryArmConsentFreshV1} from '../../../../mobile-protocol/src/device-recovery-arm-consent-v1.mjs';
import {assertOriginalNativeDeviceLocalObservedClockV1,assertOriginalNativeDeviceLiveArmedObservedClockV1,captureOriginalNativeDeviceLiveArmedClockCheckpointV1,refreshOriginalNativeDeviceLocalObservedClockV1} from '../../operations/recovery/native-device-local-observed-clock-v1.mjs';
const liveRecoveryLeases=new WeakMap();
export function createDeviceOwnerLiveRecoveryLeaseV1(account,bridge,clock,nativeRuntime){
 assert.equal(arguments.length,4);assertOwnedNativeValueAccountAuthority(account);assertDeviceOwnerExecutionBridgeV1(bridge,account);
 const a=owned.get(account);assertOriginalNativeDeviceLocalObservedClockV1(clock,{runtime:a.runtime,nativeRuntime});
 const cap=Object.freeze(Object.create(null)),row={account,bridge,clock,nativeRuntime,closed:false,completion:null};
 a.installLiveRecovery(row);liveRecoveryLeases.set(cap,row);return cap;
}
export function closeDeviceOwnerLiveRecoveryLeaseV1(cap){assert.equal(arguments.length,1);const row=liveRecoveryLeases.get(cap);
 assert.ok(row,'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');row.closed=true;return row.completion??Promise.resolve();}
export function tickDeviceOwnerLiveRecoveryLeaseV1(cap){assert.equal(arguments.length,1);const row=liveRecoveryLeases.get(cap);
 assert.ok(row&&!row.closed,'DEVICE_LIVE_RECOVERY_CLOSED');if(row.completion)return row.completion;
 const task=owned.get(row.account).tickLiveRecovery(row);row.completion=task;
 task.finally(()=>{if(row.completion===task)row.completion=null;}).catch(()=>{});return task;
}
export function readDeviceOwnerRecoveryArmTermsV1(account,bridge,id){assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
 return owned.get(account).liveRecoveryTerms(bridge,id);}
export function runDeviceOwnerRecoveryArmAuthorizationV1(account,bridge,cap){assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
 return owned.get(account).armLiveRecovery(consumeDeviceOwnerExecutionAuthorizationV1(bridge,cap,account));}

// Private original producer: a recovered journal can reinstall only its own
// paired pipeline. Neither HTTP IDs nor a prepared JSON object issue this mark.
const nativeDeviceRecoveredInstallations=new WeakMap();
export async function retainOriginalNativeDeviceRecoveredInstallationV1(account,actor,providerCustody){
 assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
 const module=await import('../../api/mobile/paired-original-account-actor-v2.mjs');
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

export function readOriginalNativeLiveArmedClockCheckpointV1(account,runtime){assert.equal(arguments.length,2);assertOwnedNativeValueAccountAuthority(account);return owned.get(account).liveArmedClockCheckpoint(runtime);}
const nativeDeviceLiveArmedInstallations=new WeakMap();
export async function retainOriginalNativeDeviceLiveArmedInstallationV1(account,actor,providerCustody){
 assert.equal(arguments.length,3);assertOwnedNativeValueAccountAuthority(account);
 const module=await import('../../api/mobile/paired-original-account-actor-v2.mjs');module.assertPairedOriginalAccountActorAccountV2(actor,account);
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
async function createAccountAuthority(input, callbacks, wrapped, recovery=null,nativeNote=false,liveArmedOriginal=null) {
  assert.ok(!nativeNote||!wrapped,'NATIVE_ECONOMIC_NOTE_ORIGINAL_NATIVE_ONLY');
  const wrappedExecution = wrapped ? await import('../../execution/wrapped/execution/wrapped-wallet-execution-v1.mjs') : null;
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
  if(wrapped){lifetimeRegistry=await import('../../claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs');const binding={profile:'WRAPPED_ACCOUNT_LIFETIME_V1',accountIdentity,identitySHA256,poolIndex};
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
  let idle = Promise.resolve(), releaseIdle, abortPromise, ownerViewTerminalObserver;
  const manualGraphApprovals = new Map(), nativeProviderSets = new Map(), nativeNoteApprovals = new Map();
  const deviceExecutionInstallations=new Map(),deviceExecutionProviders=new Map();
  const proofRunner = createFlatProofRunner({ onProof });
  const exclusive = async work => {
    assert.ok(!busy && !unavailable && !closed && !cancelled && !capturing, 'FLAT_ACCOUNT_UNAVAILABLE');
    busy = true; idle = new Promise(resolve => { releaseIdle = resolve; });
    try { return await work(); } finally { busy = false; releaseIdle(); releaseIdle = null; }
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
      const next = await vault.update(password, record.revision, () => changed);
      assert.equal(next.revision, record.revision + 1, 'FLAT_ACCOUNT_REVISION');
      assert.deepEqual(await vault.read(password), next, 'FLAT_ACCOUNT_READBACK');
      if(wrapped)await retainLifetime({...lifetimeState,checkpointSHA256:sha(next),pendingUpdate:null});
      record = next;
    } catch (error) { unavailable = true; throw error; }
  }
  function operation(ref) {
    reference(ref); const result = record.data.operations.find(value => value.ownerOperationRef === ref);
    assert.ok(result, 'FLAT_ACCOUNT_OWNER_PREPARATION_REQUIRED'); return result;
  }
  const update = (ref, fields) => write(data => ({ ...data, operations: data.operations.map(value =>
    value.ownerOperationRef === ref ? { ...value, ...copy(fields) } : value) }));
  // Device custody is a separate durable branch in the SAME original Vault.
  // Linux note preparation/owner acknowledgement is never used for this note.
  const deviceRows = () => record.data.deviceDeposits ?? [];
  const deviceRow = id => { reference(id); const row = deviceRows().find(value => value.jobId === id);
    assert.ok(row, 'DEVICE_DEPOSIT_ORIGINAL_JOB_REQUIRED'); return row; };
  const deviceUpdate = (id, fields) => write(data => ({ ...data,
    deviceDeposits: (data.deviceDeposits ?? []).map(row => row.jobId === id ? { ...row, ...copy(fields) } : row) }));
  const byteSHA = bytes => createHash('sha256').update(bytes).digest('hex');
  const devicePublic = row => ({ jobId: row.jobId, stage: row.stage,
    consentFields: { statement: copy(row.consent.statement), rootId: row.consent.rootId,
      noteRevision: row.consent.noteRevision, jobId: row.jobId, witnessSHA256: row.consent.witnessSHA256,
      proofSHA256: row.proofSHA256, publicInputsSHA256: row.publicInputsSHA256 },
    statement: copy(row.consent.statement), observation: copy(row.observation), errorCode: row.errorCode });
  function deviceBinding(consent) {
    assert.equal(consent.binding.accountIdentitySHA256, sha(accountIdentity), 'DEVICE_DEPOSIT_ACCOUNT_CHANGED');
    assert.equal(consent.binding.originalAccountLifetime, config.lifetime, 'DEVICE_DEPOSIT_LIFETIME_CHANGED');
    assert.equal(consent.binding.assetId, asset.assetId, 'DEVICE_DEPOSIT_ASSET_CHANGED');
    for (const field of ['scope', 'policy', 'codeHash', 'assetIdentity'])
      assert.equal(consent.poolTerms[field], asset[field], 'DEVICE_DEPOSIT_ASSET_CHANGED');
    assert.equal(consent.poolTerms.domainCommitment, identity.domainCommitment, 'DEVICE_DEPOSIT_DOMAIN_CHANGED');
    assert.equal(consent.statement.scope, asset.scope, 'DEVICE_DEPOSIT_SCOPE_CHANGED');
    assert.equal(consent.statement.policy, asset.policy, 'DEVICE_DEPOSIT_POLICY_CHANGED');
  }
  async function deviceCurrent(consent, requireEpoch) {
    await healthy(); continueWork(); deviceBinding(consent);
    const view = await reader.read(); await reader.assertCurrent(view); continueWork();
    if (requireEpoch) assert.equal(consent.statement.epoch, (BigInt(view.head.timestamp) / 600n).toString(),
      'DEVICE_DEPOSIT_EPOCH_CHANGED');
    return view;
  }
  async function observeDevice(row) {
    assert.ok(row.submission?.dispatchLatched === true, 'DEVICE_DEPOSIT_ORIGINAL_SEND_REQUIRED');
    const submission = row.submission;
    const observation = await observer.readTransaction({ kind: 'deposit', identitySHA256,
      transactionHash: submission.transactionHash, calldataSHA256: submission.calldataSHA256 });
    if (observation === null) return { ...devicePublic(row), stage: 'FUNDING_UNKNOWN' };
    // The original observer authenticates signed wire/nonce/sender, calldata,
    // actual receipt, canonical historical delta, token movement and backing.
    validateFlatAccountOwnerObservation({ identity, artifact: pool.artifact, submission,
      authorization: null, observation });
    const view = await deviceCurrent(row.consent, false), output = row.consent.statement.output;
    const indices = view.ledger.commitments
      .flatMap((leaf, index) => leaf === '0x' + output ? [index] : []);
    assert.equal(indices.length, 1, 'DEVICE_DEPOSIT_ORIGINAL_OUTPUT_REQUIRED');
    assert.ok(!view.ledger.nullifiers.includes('0x' + row.nullifier), 'DEVICE_DEPOSIT_NOTE_ALREADY_SPENT');
    const originalPath = view.ledger.tree.path(indices[0]);
    assert.equal(originalPath.leaf, '0x' + output, 'DEVICE_DEPOSIT_ORIGINAL_PATH_CHANGED');
    // Original SHA tree/RPC digests are 0x-prefixed. The mobile frame uses
    // bare bytes32; normalize only the public DTO, never the original ledger.
    const path = { root: bare(originalPath.root), index: originalPath.index,
      leaf: bare(originalPath.leaf), siblings: originalPath.siblings.map(bare) };
    await reader.assertCurrent(view); continueWork();
    const receipt = await runtime.receipt('0x' + observation.transaction.hash);
    assert.ok(receipt, 'DEVICE_DEPOSIT_ORIGINAL_RECEIPT_REQUIRED'); await runtime.checkReceipt(receipt);
    const observedAt = Date.now();
    const retained = { version: 1, profile: 'ORIGINAL_DEVICE_D26_INCLUSION_V1', jobId: row.jobId,
      rootId: row.consent.rootId, commitment: output, amount: row.consent.statement.amount,
      assetId: asset.assetId, pool: asset.pool, scope: asset.scope, policy: asset.policy,
      genesis: asset.genesis, domainCommitment: identity.domainCommitment,
      proofSHA256: row.proofSHA256, publicInputsSHA256: row.publicInputsSHA256,
      transactionHash: observation.transaction.hash, calldataSHA256: submission.calldataSHA256,
      receiptBlockHash: observation.receipt.blockHash, head: copy(view.head), path: copy(path),
      nullifier: row.nullifier, observedAt, expiresAt: observedAt + 15_000,
      nativeEffectsEstablished: true, mobileKeyCustody: true, backendOpeningDisclosure: 'ONE_D26_OPENING',
      mobileCanonicalRpcVerification: false };
    // Canonical observer revalidation may return a fresh inclusion head/path;
    // the exact historical transaction observation is permanently retained.
    if (row.stage !== 'CONFIRMED') await deviceUpdate(row.jobId, { stage: 'CONFIRMED',
      submission: { ...submission, transactionHash: observation.transaction.hash, observation }, observation: retained });
    return { ...devicePublic(deviceRow(row.jobId)), observation: retained };
  }
  async function deviceDeposit({ action, consent, witness }) {
    if(recovery?.native)assert.equal(action,'OBSERVE_D26','NATIVE_DEVICE_RECOVERY_OBSERVE_ORIGINAL_ONLY');
    return exclusive(async () => {
      deviceBinding(consent);
      if (action === 'PROVE_D26') {
        assert.ok(!wrapped && !deviceRows().some(row => row.jobId === consent.jobId
          || row.consent.statement.output === consent.statement.output), 'DEVICE_DEPOSIT_ORIGINAL_JOB_ONLY');
        assert.ok(deviceRows().length < 64, 'DEVICE_DEPOSIT_JOURNAL_CAPACITY');
        const input = normalizeDeviceDepositWitnessV1(witness), bytes = deviceDepositWitnessBytesV1(input);
        let prover;
        try {
          assert.equal(byteSHA(bytes), consent.witnessSHA256, 'DEVICE_DEPOSIT_WITNESS_CHANGED');
          const publicInputs = walletInputPublicWords('deposit_balance', input);
          const statement = decodeWalletPoolInputs('deposit_balance', publicInputs);
          for (const field of ['scope', 'policy', 'output'])
            assert.equal(statement[field].slice(2), consent.statement[field], 'DEVICE_DEPOSIT_STATEMENT_CHANGED');
          for (const field of ['epoch', 'amount']) assert.equal(statement[field], consent.statement[field], 'DEVICE_DEPOSIT_STATEMENT_CHANGED');
          await deviceCurrent(consent, true);
          await write(data => ({ ...data, deviceDeposits: [...(data.deviceDeposits ?? []), {
            jobId: consent.jobId, consent: copy(consent), stage: 'PROVING', proof: null,
            proofSHA256: null, publicInputsSHA256: null, nullifier: null, submission: null, observation: null, errorCode: null }] }));
          // No server note key/root or Linux ownerProof is involved. The fixed
          // original worker validates exact ABI/pins/VK/ZK/resources and wipes
          // its one input when the one fresh child exits.
          prover = nativeNote ? createNativeEconomicNoteProofProcessV1('owner')
            : createProofProcess({ purpose: 'owner', modes: ['deposit_balance'] });
          activeLegacy = prover;
          const result = await prover.prove('deposit_balance', input, publicInputs, 'device-deposit-d26');
          assert.equal(result.metrics.acceptedResult, true, 'DEVICE_DEPOSIT_PROOF_NOT_ACCEPTED');
          const view = await deviceCurrent(consent, true), proof = transportProof(result);
          assert.equal(await system.verify('deposit_balance', Buffer.from(proof.proof, 'hex'),
            proof.publicInputs.map(word => '0x' + BigInt(word).toString(16).padStart(64, '0')), view.header.number), true,
            'DEVICE_DEPOSIT_DEPLOYED_VERIFIER_REJECTED');
          await reader.assertCurrent(view); continueWork();
          await onProof({ label: 'device-deposit-d26', relation: 'deposit_balance', role: 'device-owner',
            proof: { ...proof, metrics: result.metrics } });
          await deviceUpdate(consent.jobId, { stage: 'PROVED', proof,
            proofSHA256: byteSHA(Buffer.from(proof.proof, 'hex')), publicInputsSHA256: sha(proof.publicInputs),
            nullifier: nullifier(Buffer.from(consent.statement.scope, 'hex'), Buffer.from(consent.statement.output, 'hex'),
              Buffer.from(input.secret)).toString('hex') });
          await onPrivateAudit({ reference: consent.jobId, phase: 'device-deposit-proof-retained', stage: 'PROVED' });
          return devicePublic(deviceRow(consent.jobId));
        } catch (error) {
          if (!unavailable && deviceRows().some(row => row.jobId === consent.jobId))
            await deviceUpdate(consent.jobId, { stage: 'FAILED', errorCode: /^[A-Z0-9_]{1,100}$/.test(error.code ?? '')
              ? error.code : 'DEVICE_DEPOSIT_PROOF_REJECTED' });
          // Private completion notification only; preserve the original proof
          // error if diagnostic retention itself is unavailable.
          await onPrivateAudit({ reference: consent.jobId, phase: 'device-deposit-proof-retained', stage: 'FAILED' }).catch(() => {});
          throw error;
        } finally {
          bytes.fill(0); for (const value of Object.values(input)) if (Array.isArray(value)) value.fill(0);
          if (prover) await prover.close(); activeLegacy = null;
        }
      }
      const row = deviceRow(consent.jobId);
      const fields = devicePublic(row).consentFields;
      for (const field of ['rootId', 'noteRevision', 'witnessSHA256', 'proofSHA256', 'publicInputsSHA256'])
        assert.equal(consent[field], fields[field], 'DEVICE_DEPOSIT_ORIGINAL_JOB_CHANGED');
      assert.deepEqual(consent.statement, fields.statement, 'DEVICE_DEPOSIT_STATEMENT_CHANGED');
      if (action === 'OBSERVE_D26') return { ...(await observeDevice(row)), authorizationSHA256: byteSHA(deviceDepositConsentMessageV1(consent)) };
      assert.equal(action, 'FUND_D26'); assert.equal(row.stage, 'PROVED', 'DEVICE_DEPOSIT_RECONCILE_ORIGINAL_ONLY');
      assert.equal(row.submission, null, 'DEVICE_DEPOSIT_RECONCILE_ORIGINAL_ONLY');
      await tokenFundingReady(consent.statement.amount);
      const view = await deviceCurrent(consent, true), capacity = view.ledger.publicState;
      assert.ok(!view.ledger.commitments.includes('0x' + consent.statement.output), 'DEVICE_DEPOSIT_OUTPUT_PRESENT');
      assert.ok(capacity.leaves + 1 + 4 * capacity.liveReservations <= 64
        && capacity.spent + 5 * capacity.liveReservations + capacity.outputCapacity + 1 <= 64, 'DEVICE_DEPOSIT_HEADROOM');
      const calldata = encodeFlatTransaction('depositBalance', row.proof);
      const submission = { kind: 'deposit', calldata, calldataSHA256: flatAccountCalldataHash(calldata),
        // Retain the original proven terms in the owner's bare-bytes32 format.
        // PROVE joined every field to these exact public inputs; the full
        // transition validator independently re-encodes the tuple below.
        publicInputs: row.proof.publicInputs, statement: copy(row.consent.statement),
        before: snapshotFromView(view), epoch: consent.statement.epoch, transactionHash: null,
        dispatchLatched: true, ownerConfirmed: false, observation: null };
      // Durable original latch FIRST. Any later exception/reply loss can only
      // observe this same original wire. No owner.bindSubmission/adoption and
      // no recovery callback can manufacture a replacement send.
      await deviceUpdate(row.jobId, { stage: 'FUNDING_UNKNOWN', fundingConsent: copy(consent), submission });
      try {
        continueWork(); const receipt = await runtime.send('flat-account-device-deposit', { to: pool.address,
          data: calldata, value: nativeAsset ? consent.statement.amount : '0' });
        await deviceUpdate(row.jobId, { submission: { ...submission, transactionHash: bare(receipt.transactionHash) } });
        return { ...(await observeDevice(deviceRow(row.jobId))), authorizationSHA256: byteSHA(deviceDepositConsentMessageV1(consent)) };
      } catch (error) {
        const hash = error.transactionRecord?.transactionHash;
        if (hash && !unavailable) await deviceUpdate(row.jobId, { submission: { ...submission, transactionHash: bare(hash) } });
        throw error;
      }
    });
  }
  // Device U/S continues the original D26 note. Its source opening is never
  // written into this Vault or adopted by the Linux owner process.
  const reservationRows=()=>record.data.deviceReservations??[];
  const reservationRow=id=>{reference(id);const row=reservationRows().find(value=>value.jobId===id);
    assert.ok(row,'DEVICE_RESERVATION_ORIGINAL_JOB_REQUIRED');return row;};
  const reservationUpdate=(id,fields)=>write(data=>({...data,deviceReservations:(data.deviceReservations??[])
    .map(row=>row.jobId===id?{...row,...copy(fields)}:row)}));
  const reservationPublic=row=>({jobId:row.jobId,stage:row.stage,consentFields:{
    ...Object.fromEntries(['depositJobId','quoteId','jobId','custody','statement','witnessSHA256'].map(name=>[name,copy(row.consent[name])])),
    proofSHA256:row.proofSHA256,publicInputsSHA256:row.publicInputsSHA256},statement:copy(row.consent.statement),
    observation:copy(row.observation),errorCode:row.errorCode});
  function reservationSubject(depositJobId,rootId,descriptor){
    const deposit=deviceRow(depositJobId);assert.equal(deposit.stage,'CONFIRMED','DEVICE_RESERVATION_D26_REQUIRED');
    assert.equal(deposit.consent.rootId,rootId,'DEVICE_RESERVATION_ROOT_CHANGED');
    for(const name of ['origin','pairingId','devicePublicKey'])assert.equal(deposit.consent[name],descriptor[name],'DEVICE_RESERVATION_DEVICE_CHANGED');
    return deposit;
  }
  function reservationBinding(consent){
    assert.equal(consent.binding.accountIdentitySHA256,sha(accountIdentity),'DEVICE_RESERVATION_ACCOUNT_CHANGED');
    assert.equal(consent.binding.originalAccountLifetime,config.lifetime,'DEVICE_RESERVATION_LIFETIME_CHANGED');
    assert.equal(consent.binding.assetId,asset.assetId,'DEVICE_RESERVATION_ASSET_CHANGED');
    for(const name of ['scope','policy','codeHash','assetIdentity'])assert.equal(consent.poolTerms[name],asset[name],'DEVICE_RESERVATION_ASSET_CHANGED');
    assert.equal(consent.poolTerms.domainCommitment,identity.domainCommitment,'DEVICE_RESERVATION_DOMAIN_CHANGED');
  }
  async function reservationCurrent(consent){await healthy();continueWork();reservationBinding(consent);
    const view=await reader.read();await reader.assertCurrent(view);continueWork();return view;}
  function originalQuote(id){reference(id);const quote=(record.data.deviceReservationQuotes??[]).find(row=>row.quoteId===id);
    assert.ok(quote,'DEVICE_RESERVATION_ORIGINAL_QUOTE_REQUIRED');return quote;}
  function originalReservationConsent(row,consent){reservationBinding(consent);
    for(const name of ['depositJobId','quoteId','jobId','witnessSHA256'])assert.equal(consent[name],row.consent[name],'DEVICE_RESERVATION_JOB_CHANGED');
    for(const name of ['custody','statement'])assert.deepEqual(consent[name],row.consent[name],'DEVICE_RESERVATION_JOB_CHANGED');
    assert.equal(consent.proofSHA256,row.proofSHA256,'DEVICE_RESERVATION_PROOF_CHANGED');
    assert.equal(consent.publicInputsSHA256,row.publicInputsSHA256,'DEVICE_RESERVATION_PROOF_CHANGED');
    reservationSubject(consent.depositJobId,consent.custody.rootId,consent);
  }
  async function reservationObservation(row){
    if(row.submission===null)return reservationPublic(row);
    const submission=row.submission,observation=await observer.readTransaction({kind:'reservation',identitySHA256,
      transactionHash:submission.transactionHash,calldataSHA256:submission.calldataSHA256});
    if(observation===null)return {...reservationPublic(row),stage:'RESERVATION_UNKNOWN'};
    validateFlatAccountOwnerObservation({identity,artifact:pool.artifact,submission,
      authorization:decodeStatement('authorization',row.authorization.publicInputs),observation});
    const view=await reservationCurrent(row.consent),statement=row.consent.statement;
    assert.ok(view.ledger.nullifiers.includes('0x'+statement.inputNullifier),'DEVICE_RESERVATION_ORIGINAL_SPEND_REQUIRED');
    const pathFor=commitment=>{const indices=view.ledger.commitments.flatMap((leaf,index)=>leaf==='0x'+commitment?[index]:[]);
      assert.equal(indices.length,1,'DEVICE_RESERVATION_ORIGINAL_OUTPUT_REQUIRED');const path=view.ledger.tree.path(indices[0]);
      return {root:bare(path.root),index:path.index,leaf:bare(path.leaf),siblings:path.siblings.map(bare)};};
    const receipt=await runtime.receipt('0x'+observation.transaction.hash);assert.ok(receipt,'DEVICE_RESERVATION_ORIGINAL_RECEIPT_REQUIRED');
    await runtime.checkReceipt(receipt);const block=await runtime.assertCanonical(receipt);
    const actual=decodeStatement('reservation',submission.publicInputs);
    const retained={profile:'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1',transactionHash:observation.transaction.hash,
      blockHash:observation.receipt.blockHash,blockNumber:BigInt(block.number).toString(),timestamp:observation.after.timestamp,
      sourceCommitment:statement.inputCommitment,sourceNullifier:statement.inputNullifier,
      changeCommitment:statement.changeCommitment,reserveCommitment:statement.reserveCommitment,
      domainCommitment:actual.domainCommitment,envelope:actual.envelope,admissionTag:actual.admissionTag,
      currentHead:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},
      changePath:pathFor(statement.changeCommitment),reservePath:pathFor(statement.reserveCommitment)};
    // Store the authentic historical transition once. Re-observation may give
    // fresh paths, but cannot alter the original transaction or authorizing time.
    if(row.observation===null)await reservationUpdate(row.jobId,{stage:'RESERVED',errorCode:null,observation:retained,
      submission:{...submission,observation}});
    await reader.assertCurrent(view);return {...reservationPublic(reservationRow(row.jobId)),observation:retained};
  }
  async function deviceReservation(original){return exclusive(async()=>{
    await healthy();continueWork();assert.ok(!wrapped,'DEVICE_RESERVATION_NATIVE_ACCOUNT_REQUIRED');
    const {action,consent}=original;
    if(recovery?.native)assert.equal(action,'OBSERVE_S','NATIVE_DEVICE_RECOVERY_OBSERVE_ORIGINAL_ONLY');
    if(action==='PREPARE_U'){
      const deposit=reservationSubject(original.depositJobId,original.rootId,original.descriptor);
      assert.equal(original.binding.accountIdentitySHA256,sha(accountIdentity),'DEVICE_RESERVATION_ACCOUNT_CHANGED');
      assert.equal(original.binding.originalAccountLifetime,config.lifetime,'DEVICE_RESERVATION_LIFETIME_CHANGED');
      await refreshLiveOperationClock();
      await observeDevice(deposit);const view=await reader.read();await reader.assertCurrent(view);
      const preparation=validateGenericBalanceNativePreparation(original.nativePreparation),nativeConfig=preparation.config;
      for(const name of ['scope','policy','asset','hubDomain','registryCommitment'])
        assert.equal(nativeConfig[name],identity.domain[name],'DEVICE_RESERVATION_PREPARATION_DOMAIN_CHANGED');
      const proposal={scope:nativeConfig.scope,policy:nativeConfig.policy,asset:nativeConfig.asset,...genericBalanceNativeTerms(preparation)};
      assert.ok(BigInt(proposal.budget)<=BigInt(deposit.consent.statement.amount),'DEVICE_RESERVATION_SOURCE_VALUE');
      assert.ok(BigInt(view.head.timestamp)>=BigInt(proposal.fundingNotBefore)&&BigInt(view.head.timestamp)<BigInt(proposal.fundingValidUntil),
        'DEVICE_RESERVATION_ORIGINAL_WINDOW');
      const quotes=record.data.deviceReservationQuotes??[];
      let quote=quotes.find(row=>row.depositJobId===deposit.jobId&&row.rootId===original.rootId);
      if(quote){assert.deepEqual(quote.preparation,preparation,'DEVICE_RESERVATION_PREPARATION_CHANGED');
        assert.deepEqual(quote.invoiceSignatures,original.invoiceSignatures,'DEVICE_RESERVATION_INVOICES_CHANGED');}
      else {assert.ok(quotes.length<8,'DEVICE_RESERVATION_QUOTE_CAPACITY');quote={quoteId:randomBytes(32).toString('hex'),
        depositJobId:deposit.jobId,rootId:original.rootId,descriptor:copy(original.descriptor),preparation,
        invoiceSignatures:copy(original.invoiceSignatures)};
        await write(data=>({...data,deviceReservationQuotes:[...(data.deviceReservationQuotes??[]),quote]}));}
      // This write is the same authenticated account lifetime. It does not
      // invalidate a consumed READ or emit a new economic grant/review.
      return {quoteId:quote.quoteId,depositJobId:deposit.jobId,rootId:original.rootId,sourceCommitment:deposit.consent.statement.output,
        sourceNullifier:deposit.nullifier,poolTerms:{scope:asset.scope,policy:asset.policy,codeHash:asset.codeHash,
          assetIdentity:asset.assetIdentity,domainCommitment:identity.domainCommitment},proposal,
        capsuleOptions:normalizeDeviceReservationCapsuleOptionsV1({nodes:preparation.nodes.map(({id,action,receiptSpendSecret})=>({id,action,receiptSpendSecret})),
          slotSalts:preparation.slotSalts}),invoiceSignatures:copy(quote.invoiceSignatures),
        observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp}};
    }
    reservationBinding(consent);const reply=value=>({...value,authorizationSHA256:byteSHA(deviceReservationConsentMessageV1(consent))});
    if(action==='PROVE_U'){
      assert.ok(!reservationRows().some(row=>row.jobId===consent.jobId||row.consent.custody.sourceCommitment===consent.custody.sourceCommitment),
        'DEVICE_RESERVATION_ORIGINAL_JOB_ALREADY_ADMITTED');
      const deposit=reservationSubject(consent.depositJobId,consent.custody.rootId,consent),quote=originalQuote(consent.quoteId);
      assert.equal(quote.depositJobId,deposit.jobId,'DEVICE_RESERVATION_QUOTE_SOURCE_CHANGED');
      assert.equal(quote.rootId,consent.custody.rootId,'DEVICE_RESERVATION_QUOTE_ROOT_CHANGED');
      for(const name of ['origin','pairingId','devicePublicKey'])assert.equal(quote.descriptor[name],consent[name],'DEVICE_RESERVATION_QUOTE_DEVICE_CHANGED');
      assert.ok(consent.custody.noteRevision>=deposit.consent.noteRevision,'DEVICE_RESERVATION_CUSTODY_REVISION');
      assert.equal(consent.custody.sourceCommitment,deposit.consent.statement.output,'DEVICE_RESERVATION_SOURCE_CHANGED');
      assert.equal(consent.custody.sourceNullifier,deposit.nullifier,'DEVICE_RESERVATION_SOURCE_NULLIFIER_CHANGED');
      const witness=normalizeDeviceReservationWitnessV1(original.witness),bytes=deviceReservationWitnessBytesV1(witness);
      let capability,ownerInputs,client;
      try{
        assert.equal(byteSHA(bytes),consent.witnessSHA256,'DEVICE_RESERVATION_WITNESS_CHANGED');
        const preparation=validateGenericBalanceNativePreparation(quote.preparation),proposal={scope:preparation.config.scope,
          policy:preparation.config.policy,asset:preparation.config.asset,...genericBalanceNativeTerms(preparation)};
        for(const name of Object.keys(proposal))assert.deepEqual(witness.input[name],proposal[name],'DEVICE_RESERVATION_PROPOSAL_CHANGED');
        assert.equal(witness.input.inputNote.value,deposit.consent.statement.amount,'DEVICE_RESERVATION_SOURCE_VALUE');
        assert.deepEqual(witness.envelopePreparation.capsuleOptions,normalizeDeviceReservationCapsuleOptionsV1({
          nodes:preparation.nodes.map(({id,action,receiptSpendSecret})=>({id,action,receiptSpendSecret})),slotSalts:preparation.slotSalts}),
          'DEVICE_RESERVATION_CAPSULES_CHANGED');
        assert.deepEqual(witness.invoiceSignatures,quote.invoiceSignatures,'DEVICE_RESERVATION_INVOICES_CHANGED');
        const compiled=compileFundedGraph(witness.input),signed=attachFundedSignatures(compiled,{ownerSignature:witness.ownerSignature,invoiceSignatures:witness.invoiceSignatures});
        assert.deepEqual(compiled.authorizationStatement,consent.statement,'DEVICE_RESERVATION_STATEMENT_CHANGED');
        assert.equal(byteSHA(ownerAuthorizationMessage(compiled.authorizationStatement)),consent.custody.frameSHA256,'DEVICE_RESERVATION_FRAME_CHANGED');
        await observeDevice(deposit);await reservationCurrent(consent);
        // Durable job latch precedes the single original owner proof. Custody
        // digests are a signed declaration; they are not a server claim about
        // encryption or the device's physical SecureStore.
        await write(data=>({...data,deviceReservations:[...(data.deviceReservations??[]),{jobId:consent.jobId,consent:copy(consent),
          stage:'PROVING',proofSHA256:null,publicInputsSHA256:null,authorization:null,rolePackets:null,submission:null,observation:null,errorCode:null}]}));
        capability=await withFlatHash(hashFields=>buildAuthorizedEnvelope({signed,domain:identity.domain,
          ...witness.envelopePreparation},{hashFields}));ownerInputs=capability.ownerAuthorizationInputs();
        const statement=capability.publicStatement(),rolePackets={};
        for(const name of ['reservation','recovery','assembler'])rolePackets[name]=capability[name]().select();
        for(const name of ['local','dependency'])rolePackets[name]=Array.from({length:4},(_,i)=>capability[name](i).select());
        capability.destroy();capability=null;client=createRoleProofClient('owner');activeDeviceOwner=client;
        const result=await client.prove({relation:'authorization',inputs:ownerInputs,expectedPublicInputs:[...encodeStatement('authorization',statement)]});
        const authorization=transportProof(result),view=await reservationCurrent(consent);
        assert.equal(await system.verify('authorization',Buffer.from(authorization.proof,'hex'),authorization.publicInputs
          .map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),view.header.number),true,'DEVICE_RESERVATION_DEPLOYED_U_REJECTED');
        flatAccountGraphBinding({authorization,rolePackets},identity);await reader.assertCurrent(view);continueWork();
        await onProof({label:'device-reservation-u',relation:'authorization',role:'device-owner',proof:result});
        await reservationUpdate(consent.jobId,{stage:'PROVED',authorization,rolePackets,proofSHA256:byteSHA(Buffer.from(authorization.proof,'hex')),
          publicInputsSHA256:sha(authorization.publicInputs)});
        await onPrivateAudit({reference:consent.jobId,phase:'device-reservation-proof-retained',stage:'PROVED'});
        return reply(reservationPublic(reservationRow(consent.jobId)));
      }catch(error){if(!unavailable&&reservationRows().some(row=>row.jobId===consent.jobId))
          await reservationUpdate(consent.jobId,{stage:'FAILED',errorCode:/^[A-Z0-9_]{1,100}$/.test(error.code??'')?error.code:'DEVICE_RESERVATION_U_REJECTED'});
        throw error;
      }finally{bytes.fill(0);wipeDeviceReservationWitnessV1(witness);capability?.destroy();ownerInputs=null;
        client?.close();activeDeviceOwner=null;}
    }
    const row=reservationRow(consent.jobId);originalReservationConsent(row,consent);
    if(action==='OBSERVE_S')return reply(await reservationObservation(row));
    assert.equal(action,'RESERVE_S');assert.equal(row.stage,'PROVED','DEVICE_RESERVATION_RECONCILE_ORIGINAL_ONLY');
    assert.equal(row.submission,null,'DEVICE_RESERVATION_RECONCILE_ORIGINAL_ONLY');
    await refreshLiveOperationClock();
    const deposit=reservationSubject(consent.depositJobId,consent.custody.rootId,consent);await observeDevice(deposit);
    // Bind these exact U packets to the account's original executor BEFORE S.
    // An already-spent historical U/S job cannot acquire a new dispatch route.
    if(nativeExecution!==null){const installation=deviceExecutionProviders.get(original.bridge);
      assert.ok(installation,'DEVICE_EXECUTION_ORIGINAL_INSTALLATION_REQUIRED');
      assert.equal(row.nativeBinding??null,null,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
      const prepared={authorization:row.authorization,rolePackets:row.rolePackets};
      const binding=await nativeExecution.prepare(row.jobId,prepared,installation.providers);
      assert.deepEqual(binding,flatAccountGraphBinding(prepared,identity),'DEVICE_EXECUTION_ORIGINAL_BINDING_CHANGED');
      await reservationUpdate(row.jobId,{nativeBinding:binding,nativeStage:'PREPARED',nativeLatched:false,
        nativeRecoveryLatched:false,nativeOutcome:null,nativeTerminal:null,nativeErrorCode:null});
    }
    const before=await reservationCurrent(consent),packet=row.rolePackets.reservation,funding=packet.funding.value;
    const index=before.ledger.commitments.indexOf('0x'+funding.inputCommitment);
    assert.ok(index>=0&&!before.ledger.nullifiers.includes('0x'+funding.inputNullifier),'DEVICE_RESERVATION_SOURCE_NOT_UNSPENT');
    const path=before.ledger.tree.path(index),job=await withFlatHash(hashFields=>reservationWitness(packet,{inputRoot:bare(path.root),
      inputPath:{leaf:bare(path.leaf),index:path.index,siblings:path.siblings.map(bare)}},{hashFields}));
    // No retry after S uncertainty either: this is one retained original job.
    await reservationUpdate(row.jobId,{stage:'RESERVING',reservationConsent:copy(consent)});
    let submission,calldata;
    try{
    const proof=await proofRunner.prove('reservation',job,'device-reservation-s'),fresh=await reservationCurrent(consent);
    for(const name of ['publicState','commitments','nullifiers'])assert.deepEqual(fresh.ledger[name],before.ledger[name],'DEVICE_RESERVATION_FRESH_S_REQUIRED');
    assert.ok(BigInt(fresh.head.timestamp)>=BigInt(funding.fundingNotBefore)&&BigInt(fresh.head.timestamp)<BigInt(funding.fundingValidUntil),
      'DEVICE_RESERVATION_ORIGINAL_WINDOW');
    const projection=reserveProjection(before.ledger,'0x'+funding.reserveCommitment,'0x'+funding.changeCommitment);
    calldata=encodeFlatTransaction('reserveGenericGuarded',{authorization:row.authorization,reservation:proof,
      expectedSequence:projection.expectedSequence,expectedPostRoot:projection.expectedPostRoot});
    submission={kind:'reservation',calldata,calldataSHA256:flatAccountCalldataHash(calldata),publicInputs:proof.publicInputs,
      statement:job.statement,before:snapshotFromView(fresh),epoch:null,transactionHash:null,dispatchLatched:true,ownerConfirmed:false,observation:null};
    await reservationUpdate(row.jobId,{stage:'RESERVATION_UNKNOWN',submission});
    }catch(error){if(!unavailable)await reservationUpdate(row.jobId,{errorCode:/^[A-Z0-9_]{1,100}$/.test(error.code??'')
      ?error.code:'DEVICE_RESERVATION_S_UNRESOLVED'});throw error;}
    try{continueWork();const receipt=await runtime.send('flat-account-device-reservation',{to:pool.address,data:calldata,value:'0'});
      await reservationUpdate(row.jobId,{submission:{...submission,transactionHash:bare(receipt.transactionHash)}});
      return reply(await reservationObservation(reservationRow(row.jobId)));
    }catch(error){const hash=error.transactionRecord?.transactionHash;
      if(!unavailable)await reservationUpdate(row.jobId,{...(hash?{submission:{...submission,transactionHash:bare(hash)}}:{}),
        errorCode:/^[A-Z0-9_]{1,100}$/.test(error.code??'')?error.code:'DEVICE_RESERVATION_SEND_UNRESOLVED'});throw error;}
  });}
  function deviceExecutionOriginal(bridge,row){
    const installation=deviceExecutionInstallations.get(bridge);assert.ok(installation,'DEVICE_EXECUTION_ORIGINAL_INSTALLATION_REQUIRED');
    assertOwnedNativeValueExecution(nativeExecution,{runtime,system,poolIndex});
    reservationSubject(row.consent.depositJobId,row.consent.custody.rootId,installation.descriptor);
    assert.ok(row.nativeBinding&&row.submission?.dispatchLatched===true,'DEVICE_EXECUTION_BINDING_BEFORE_S_REQUIRED');
    assert.deepEqual(row.nativeBinding,flatAccountGraphBinding({authorization:row.authorization,rolePackets:row.rolePackets},identity),
      'DEVICE_EXECUTION_ORIGINAL_BINDING_CHANGED');return installation;
  }
  async function deviceExecutionPublic(bridge,row){
    deviceExecutionOriginal(bridge,row);const reservation=await reservationObservation(row);
    assert.equal(reservation.stage,'RESERVED','DEVICE_EXECUTION_ORIGINAL_S_REQUIRED');
    const retained=reservationRow(row.jobId),snapshot=nativeExecution.snapshot(row.jobId);
    return {jobId:row.jobId,reservation,nativeBindingSHA256:sha(retained.nativeBinding),executionSnapshot:copy(snapshot),
      executionSnapshotSHA256:sha(snapshot),stage:retained.nativeStage,outcome:retained.nativeOutcome,
      terminal:copy(retained.nativeTerminal),errorCode:retained.nativeErrorCode,lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'};
  }
  let reorgAdmission = null;
  function reorgState(executor, ref) {
    continueWork(); assert.ok(busy && reorgAdmission?.ref === ref && reorgAdmission.executor === executor, 'F_REORG_ORIGINAL_RECONCILE_REQUIRED');
    assert.equal(executor, nativeExecution); const row = reservationRow(ref);
    deviceExecutionOriginal(reorgAdmission.bridge, row);
    // EXECUTE_NATIVE is not an admission prerequisite for original F: the
    // original retained ARM may fire after the cutoff without any EXECUTE.
    assert.ok(row.nativeRecoveryLatched && row.submission?.dispatchLatched === true, 'F_REORG_ORIGINAL_F_LATCHES_REQUIRED');
    assert.ok(row.observation && row.submission.observation, 'F_REORG_ORIGINAL_S_OBSERVATION_REQUIRED');
    assert.equal(row.observation.profile, 'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1');
    assert.equal(row.observation.transactionHash, row.submission.observation.transaction.hash, 'F_REORG_ORIGINAL_S_CHANGED');
    if (row.liveRecoveryArm) {
      assert.equal(row.liveRecoveryArm.nativeBindingSHA256, sha(row.nativeBinding), 'F_REORG_ORIGINAL_ARM_BINDING');
      assert.equal(row.liveRecoveryArm.reservationTransactionHash, row.observation.transactionHash, 'F_REORG_ORIGINAL_ARM_S');
      assert.equal(row.liveRecoveryArm.settleBefore, row.nativeBinding.settleBefore, 'F_REORG_ORIGINAL_ARM_CUTOFF');
      assert.equal(row.liveRecoveryArm.lossClause, 'FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
    }
    if (!row.nativeFReorg) assert.equal(row.nativeOutcome, 'RECOVERED');
    return { terminal: copy(row.nativeFReorg?.originalTerminal ?? row.nativeTerminal), binding: copy(row.nativeBinding), phase: row.nativeFReorg?.phase ?? null };
  }
  async function retainReorg(executor, ref, id, phase) {
    const original = reorgState(executor, ref); reference(id);
    assert.ok(['REORG_INVALIDATED', 'OBSERVATION_PENDING', 'RECONFIRMED'].includes(phase));
    const row = reservationRow(ref), old = row.nativeFReorg;
    if (old) { assert.equal(old.id, id);
      assert.ok(old.phase === phase || old.phase === 'REORG_INVALIDATED' && phase === 'OBSERVATION_PENDING'
        || old.phase === 'OBSERVATION_PENDING' && phase === 'RECONFIRMED', 'F_REORG_PHASE_REGRESSION'); }
    else assert.equal(phase, 'REORG_INVALIDATED');
    if (old?.phase === 'RECONFIRMED') return;
    await reservationUpdate(ref, { nativeTerminal: null, nativeOutcome: null, nativeStage: 'UNKNOWN', nativeErrorCode: null,
      nativeFReorg: { schema: 'ORIGINAL_DEVICE_NATIVE_F_REORG_V1', id, phase, originalTerminal: original.terminal } });
  }
  function assertReorgPending(executor, ref, id) {
    reorgState(executor, ref); const row = reservationRow(ref);
    assert.equal(row.nativeFReorg.id, id); assert.equal(row.nativeFReorg.phase, 'OBSERVATION_PENDING');
    assert.equal(row.nativeOutcome, null); assert.equal(row.nativeTerminal, null);
  }
  async function retainDeviceTerminal(row,result){
    assert.ok(['FULFILLED','RECOVERED'].includes(result.outcome),'DEVICE_EXECUTION_ORIGINAL_TERMINAL_REQUIRED');
    const receipt=result.receipt;assert.ok(receipt,'DEVICE_EXECUTION_ORIGINAL_RECEIPT_REQUIRED');await runtime.checkReceipt(receipt);
    const transaction=await runtime.transaction(receipt.transactionHash),originals=runtime.transactions.filter(value=>value.transactionHash===receipt.transactionHash);
    assert.ok(transaction&&originals.length===1,'DEVICE_EXECUTION_ORIGINAL_TRANSACTION_REQUIRED');const original=originals[0];
    assert.equal(receipt.status,'0x1');assert.equal(receipt.to,pool.address);assert.equal(transaction.from,system.sender);
    assert.equal(transaction.to,pool.address);assert.equal(transaction.input,original.request.data);
    assert.equal(transaction.value,original.request.value??'0x0');assert.equal(BigInt(transaction.nonce),BigInt(original.senderNonce));
    assert.equal(transaction.blockHash,receipt.blockHash);assert.equal(transaction.blockNumber,receipt.blockNumber);
    const calldataSHA256=flatAccountCalldataHash(transaction.input);assert.equal(result.calldataSHA256,calldataSHA256);
    const decoded=decodeNativeValueTerminalCalldata(transaction.input);
    assert.equal(decoded.kind,result.outcome==='RECOVERED'?'recovery':'settlement');
    assert.equal(decoded.statement.reserveNullifier,row.nativeBinding.reserveNullifier);
    if(result.outcome==='RECOVERED')assert.equal(decoded.statement.recoveryCommitment,row.nativeBinding.recoveryCommitment);
    // The original executor's terminal observer already validates the entire
    // historical pool/hub/backing delta. Rejoin its same signed original wire.
    await runtime.assertCanonical(receipt);
    const terminal={transactionHash:bare(receipt.transactionHash),blockHash:bare(receipt.blockHash),
      blockNumber:BigInt(receipt.blockNumber).toString(),calldataSHA256,outcome:result.outcome};
    const retained=reservationRow(row.jobId);
    if(retained.nativeTerminal!==null)assert.deepEqual(terminal,retained.nativeTerminal,'DEVICE_EXECUTION_TERMINAL_CHANGED');
    else {
      let fields = {};
      if (retained.nativeFReorg) {
        reorgState(nativeExecution, row.jobId); const previous = retained.nativeFReorg.originalTerminal;
        assert.equal(result.outcome, 'RECOVERED');
        for (const key of ['transactionHash', 'calldataSHA256', 'outcome']) assert.equal(terminal[key], previous[key], 'F_REORG_ORIGINAL_TERMINAL_CHANGED');
        assert.ok(['REORG_INVALIDATED','OBSERVATION_PENDING'].includes(retained.nativeFReorg.phase));
        fields = { nativeFReorg: { ...retained.nativeFReorg, phase: 'RECONFIRMED', receipt: terminal } };
      }
      await reservationUpdate(row.jobId,{...fields,nativeTerminal:terminal,nativeOutcome:result.outcome,nativeStage:result.outcome,nativeErrorCode:null});
    }
  }
  let liveRecovery=null;
  function requireLiveRecovery(bridge){assert.ok(nativeNote&&(!recovery||recovery.liveArmed===true)&&!wrapped&&liveRecovery&&!liveRecovery.closed&&liveRecovery.bridge===bridge,
    'DEVICE_LIVE_RECOVERY_ORIGINAL_INSTALLATION');return liveRecovery;}
  async function refreshLiveOperationClock(){
    if(liveRecovery===null)return;const lease=liveRecovery;requireLiveRecovery(lease.bridge);
    await refreshOriginalNativeDeviceLocalObservedClockV1(lease.clock);
    assert.equal(liveRecovery,lease,'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');requireLiveRecovery(lease.bridge);continueWork();
  }
  function armPublic(row){const arm=row.liveRecoveryArm;return{jobId:row.jobId,state:arm?.state??'ABSENT',settleBefore:row.nativeBinding.settleBefore,
    armSHA256:arm?.armSHA256??null,terminalOutcome:row.nativeOutcome??null};}
  function sameArm(row,consent,current){const e=consent.execution;originalReservationConsent(row,e.reservation);
    assert.equal(consent.settleBefore,row.nativeBinding.settleBefore,'DEVICE_LIVE_RECOVERY_CUTOFF_CHANGED');
    assert.equal(e.nativeBindingSHA256,current.nativeBindingSHA256);assert.equal(e.reservationTransactionHash,current.reservation.observation.transactionHash);
    assert.equal(e.executionSnapshotSHA256,current.executionSnapshotSHA256);assert.equal(e.lossClause,current.lossClause);}
  async function armLiveRecovery(original){return exclusive(async()=>{await healthy();continueWork();const {bridge,consent,action}=original;
    if(action==='ARM_RECOVERY')assert.equal(recovery,null,'DEVICE_LIVE_ARMED_NO_REARM_AFTER_RESTART');
    requireLiveRecovery(bridge);validateDeviceRecoveryArmConsentFreshV1(consent);assert.equal(action,consent.action);const row=reservationRow(consent.execution.reservation.jobId);
    const current=await deviceExecutionPublic(bridge,row);sameArm(row,consent,current);
    const digest=byteSHA(deviceRecoveryArmConsentMessageV1(consent));
    if(action==='ARM_RECOVERY'){
      const previous=row.liveRecoveryArm??null;
      assert.ok(previous===null||previous.state==='DISARMED','DEVICE_LIVE_RECOVERY_ALREADY_ARMED');
      if(previous){assert.equal(previous.nativeBindingSHA256,current.nativeBindingSHA256,'DEVICE_LIVE_RECOVERY_BINDING_CHANGED');
        assert.equal(previous.reservationTransactionHash,current.reservation.observation.transactionHash,'DEVICE_LIVE_RECOVERY_S_CHANGED');
        assert.equal(previous.settleBefore,row.nativeBinding.settleBefore);assert.equal(previous.lossClause,current.lossClause);}
      assert.equal(row.nativeOutcome,null,'DEVICE_LIVE_RECOVERY_TERMINAL');assert.equal(row.nativeRecoveryLatched,false,'DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
      await refreshLiveOperationClock();
      assert.ok(BigInt((await reader.read()).head.timestamp)<BigInt(row.nativeBinding.settleBefore),'DEVICE_LIVE_RECOVERY_ARM_BEFORE_CUTOFF');
      requireLiveRecovery(bridge);continueWork();validateDeviceRecoveryArmConsentFreshV1(consent);
      await reservationUpdate(row.jobId,{liveRecoveryArm:{state:'ARMED',armSHA256:digest,nativeBindingSHA256:current.nativeBindingSHA256,
        reservationTransactionHash:current.reservation.observation.transactionHash,settleBefore:row.nativeBinding.settleBefore,
        lossClause:current.lossClause,errorCode:null}});
    }else{assert.equal(action,'DISARM_RECOVERY');assert.equal(row.liveRecoveryArm?.state,'ARMED','DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
      assert.equal(row.nativeRecoveryLatched,false,'DEVICE_LIVE_RECOVERY_ORIGINAL_ONLY');
      if(recovery?.liveArmed){await refreshLiveOperationClock();assert.ok(BigInt((await reader.read()).head.timestamp)<BigInt(row.nativeBinding.settleBefore),'DEVICE_LIVE_RECOVERY_DISARM_BEFORE_CUTOFF');}
      requireLiveRecovery(bridge);continueWork();validateDeviceRecoveryArmConsentFreshV1(consent);
      await reservationUpdate(row.jobId,{liveRecoveryArm:{...row.liveRecoveryArm,state:'DISARMED'}});}
    return{...armPublic(reservationRow(row.jobId)),authorizationSHA256:digest};
  });}
  async function tickLiveRecovery(lease){
    assert.equal(lease,liveRecovery,'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');if(lease.closed)return{state:'CLOSED'};
    if(busy||closed||cancelled||unavailable||capturing)return{state:'BUSY'};
    if(!reservationRows().some(row=>['ARMED','FIRING','UNKNOWN'].includes(row.liveRecoveryArm?.state)))return{state:'IDLE'};
    return exclusive(async()=>{if(lease.closed)return{state:'CLOSED'};
      await refreshOriginalNativeDeviceLocalObservedClockV1(lease.clock);if(lease.closed)return{state:'CLOSED'};
      await healthy();if(lease.closed)return{state:'CLOSED'};
      for(const row of reservationRows()){
        const arm=row.liveRecoveryArm;if(!arm||!['ARMED','FIRING','UNKNOWN'].includes(arm.state))continue;
        deviceExecutionOriginal(lease.bridge,row);const current=await deviceExecutionPublic(lease.bridge,row);
        assert.equal(arm.nativeBindingSHA256,current.nativeBindingSHA256,'DEVICE_LIVE_RECOVERY_BINDING_CHANGED');
        assert.equal(arm.reservationTransactionHash,current.reservation.observation.transactionHash,'DEVICE_LIVE_RECOVERY_S_CHANGED');
        assert.equal(arm.settleBefore,row.nativeBinding.settleBefore);assert.equal(arm.lossClause,current.lossClause);
        const updateArm=fields=>reservationUpdate(row.jobId,{liveRecoveryArm:{...reservationRow(row.jobId).liveRecoveryArm,...fields}});
        if(row.nativeOutcome!==null){await updateArm({state:row.nativeOutcome});continue;}
        if(lease.closed)return{state:'CLOSED'};
        if(arm.state==='ARMED'&&!row.nativeRecoveryLatched){
          const view=await reader.read();await reader.assertCurrent(view);
          if(BigInt(view.head.timestamp)<BigInt(arm.settleBefore))continue;
          if(lease.closed)return{state:'CLOSED'};
          // Admission is latched durably BEFORE the original proof/send work.
          // Once admitted, close drains this same work; it never starts a replacement.
          await reservationUpdate(row.jobId,{liveRecoveryArm:{...arm,state:'FIRING'},nativeRecoveryLatched:true,nativeStage:'RECOVERING'});
          try{const result=await nativeExecution.recover(row.jobId);await retainDeviceTerminal(reservationRow(row.jobId),result);
            await updateArm({state:result.outcome,errorCode:null});}
          catch(error){const diagnostic=privateFailureDiagnostic(error,'DEVICE_LIVE_RECOVERY_OUTCOME_UNRESOLVED');
            await reservationUpdate(row.jobId,{nativeStage:'UNKNOWN',nativeErrorCode:diagnostic.code});
            await updateArm({state:'UNKNOWN',errorCode:diagnostic.code});throw error;}
        }else{
          // Lost reply, previous manual F or interrupted admitted work: ONLY
          // reconcile the original latches/wire. No proof/send retry on this path.
          try{const result=await nativeExecution.reconcile(row.jobId);await retainDeviceTerminal(reservationRow(row.jobId),result);
            await updateArm({state:result.outcome,errorCode:null});}
          catch(error){await updateArm({state:'UNKNOWN',errorCode:privateFailureDiagnostic(error,'DEVICE_LIVE_RECOVERY_OUTCOME_UNRESOLVED').code});throw error;}
        }
      }
      return{state:'IDLE'};
    });
  }

  async function deviceExecution(original){return exclusive(async()=>{
    await healthy();continueWork();assert.ok(!wrapped,'DEVICE_EXECUTION_NATIVE_ONLY');
    const {bridge,consent,action}=original,row=reservationRow(consent.reservation.jobId);
    if(recovery?.native)assert.equal(action,'RECONCILE_NATIVE','NATIVE_DEVICE_RECOVERY_RECONCILE_ORIGINAL_ONLY');
    deviceExecutionOriginal(bridge,row);originalReservationConsent(row,consent.reservation);
    const current=await deviceExecutionPublic(bridge,row);
    assert.equal(consent.nativeBindingSHA256,current.nativeBindingSHA256,'DEVICE_EXECUTION_BINDING_CHANGED');
    assert.equal(consent.reservationTransactionHash,current.reservation.observation.transactionHash,'DEVICE_EXECUTION_RESERVATION_CHANGED');
    assert.equal(consent.executionSnapshotSHA256,current.executionSnapshotSHA256,'DEVICE_EXECUTION_STATE_CHANGED');
    assert.equal(consent.lossClause,current.lossClause,'DEVICE_EXECUTION_LOSS_CLAUSE_CHANGED');
    // Fresh heads precede new preparation/admission, never a prepared wire,
    // current-key guard or send. Reconcile drains the same pending continuation.
    const reconcileRecovery = action === 'RECONCILE_NATIVE' && (row.nativeOutcome === 'RECOVERED' || row.nativeFReorg);
    if (!reconcileRecovery) await refreshLiveOperationClock();
    let result;
    try{
      if(action==='EXECUTE_NATIVE'){
        assert.equal(row.nativeLatched,false,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        assert.equal(row.nativeOutcome,null,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        await reservationUpdate(row.jobId,{nativeLatched:true,nativeStage:'EXECUTING',nativeExecutionConsent:copy(consent)});
        continueWork();result=await nativeExecution.execute(row.jobId);
      }else if(action==='RECOVER_NATIVE'){
        assert.equal(row.nativeRecoveryLatched,false,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        assert.equal(row.nativeOutcome,null,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
        assert.ok(BigInt((await reader.read()).head.timestamp)>=BigInt(row.nativeBinding.settleBefore),'DEVICE_EXECUTION_RECOVERY_BEFORE_CUTOFF');
        await reservationUpdate(row.jobId,{nativeRecoveryLatched:true,nativeStage:'RECOVERING',nativeRecoveryConsent:copy(consent)});
        continueWork();result=await nativeExecution.recover(row.jobId);
      }else{assert.equal(action,'RECONCILE_NATIVE');
        if (reconcileRecovery) { reorgAdmission = { executor: nativeExecution, ref: row.jobId, bridge };
          result = await reconcileOriginalDeviceNativeRecoveryV1(nativeExecution, capability, row.jobId); }
        else result=await nativeExecution.reconcile(row.jobId);}
      if (result.outcome !== null) await retainDeviceTerminal(reservationRow(row.jobId),result);
      return {...await deviceExecutionPublic(bridge,reservationRow(row.jobId)),authorizationSHA256:byteSHA(deviceExecutionConsentMessageV1(consent))};
    }catch(error){if(!unavailable&&reservationRow(row.jobId).nativeOutcome===null){const diagnostic=privateFailureDiagnostic(error,'DEVICE_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED');
        try{await reservationUpdate(row.jobId,{nativeStage:'UNKNOWN',nativeErrorCode:diagnostic.code});}catch{}}
      throw error;}finally{reorgAdmission=null;}
  });}
  const exitRows=()=>record.data.deviceExits??[];
  const exitRow=id=>{reference(id);const row=exitRows().find(value=>value.jobId===id);assert.ok(row,'DEVICE_EXIT_ORIGINAL_JOB_REQUIRED');return row;};
  const exitUpdate=(id,fields)=>write(data=>({...data,deviceExits:(data.deviceExits??[]).map(row=>row.jobId===id?{...row,...copy(fields)}:row)}));
  const exitPublic=row=>({jobId:row.jobId,stage:row.stage,statement:copy(row.consent.statement),consentFields:{
    ...Object.fromEntries(['parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','noteRevision','noteRole','statement','witnessSHA256'].map(name=>[name,copy(row.consent[name])])),
    proofSHA256:row.proofSHA256,publicInputsSHA256:row.publicInputsSHA256},observation:copy(row.observation),errorCode:row.errorCode});
  async function exitTerms(bridge,input){
    exactRecord(input,['parentJobId','noteRole','rootId','noteRevision','nullifier','recipient']);
    reference(input.nullifier);assert.match(input.recipient,/^[0-9a-f]{40}$/);assert.notEqual(input.recipient,'0'.repeat(40));assert.notEqual(input.recipient,identity.pool);
    const parent=reservationRow(input.parentJobId),installation=deviceExecutionOriginal(bridge,parent);
    assert.equal(input.rootId,parent.consent.custody.rootId,'DEVICE_EXIT_ROOT_CHANGED');
    assert.ok(Number.isSafeInteger(input.noteRevision)&&input.noteRevision>=parent.consent.custody.noteRevision,'DEVICE_EXIT_CUSTODY_REVISION');
    assert.ok(['change','recovery'].includes(input.noteRole),'DEVICE_EXIT_ORIGINAL_NOTE_ROLE');
    assert.ok(!parent.nativeFReorg || parent.nativeFReorg.phase === 'RECONFIRMED', 'F_REORG_OUTPUT_PENDING');
    const reserved=await reservationObservation(parent);assert.equal(reserved.stage,'RESERVED','DEVICE_EXIT_ORIGINAL_S_REQUIRED');
    if(input.noteRole==='recovery'){
      assert.equal(parent.nativeOutcome,'RECOVERED','DEVICE_EXIT_ORIGINAL_F_REQUIRED');assert.ok(parent.nativeTerminal,'DEVICE_EXIT_ORIGINAL_F_REQUIRED');
      const terminalReceipt=await runtime.receipt('0x'+parent.nativeTerminal.transactionHash);assert.ok(terminalReceipt);await runtime.checkReceipt(terminalReceipt);await runtime.assertCanonical(terminalReceipt);
      assert.equal(nativeExecution.snapshot(parent.jobId).outcome,'RECOVERED','DEVICE_EXIT_ORIGINAL_F_REQUIRED');
    }
    const quote=originalQuote(parent.consent.quoteId),deposit=reservationSubject(parent.consent.depositJobId,input.rootId,installation.descriptor),
      budget=BigInt(genericBalanceNativeTerms(validateGenericBalanceNativePreparation(quote.preparation)).budget),
      amount=input.noteRole==='change'?BigInt(deposit.consent.statement.amount)-budget:budget;
    assert.ok(amount>0n,'DEVICE_EXIT_POSITIVE_NOTE_REQUIRED');
    const commitment=input.noteRole==='change'?parent.nativeBinding.changeCommitment:parent.nativeBinding.recoveryCommitment,
      view=await reader.read(),indices=view.ledger.commitments.flatMap((leaf,index)=>leaf==='0x'+commitment?[index]:[]);
    assert.equal(indices.length,1,'DEVICE_EXIT_ORIGINAL_NOTE_REQUIRED');assert.ok(!view.ledger.nullifiers.includes('0x'+input.nullifier),'DEVICE_EXIT_NOTE_ALREADY_SPENT');
    const path=view.ledger.tree.path(indices[0]);await reader.assertCurrent(view);continueWork();
    return {...Object.fromEntries(['parentJobId','noteRole','rootId','noteRevision'].map(name=>[name,input[name]])),nullifierSpent:false,
      nativeBindingSHA256:sha(parent.nativeBinding),statement:{scope:asset.scope,policy:asset.policy,
      epoch:(BigInt(view.head.timestamp)/600n).toString(),root:bare(path.root),nullifier:input.nullifier,amount:amount.toString(),recipient:input.recipient,commitment},
      path:{root:bare(path.root),index:path.index,leaf:bare(path.leaf),siblings:path.siblings.map(bare)},
      poolTerms:{scope:asset.scope,policy:asset.policy,codeHash:asset.codeHash,assetIdentity:asset.assetIdentity,domainCommitment:identity.domainCommitment},
      observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp}};
  }
  async function outputBalance(bridge,input){
    exactRecord(input,['parentJobId','rootId','noteRevision','changeNullifier','recoveryNullifier']);
    reference(input.changeNullifier);reference(input.recoveryNullifier);
    const parent=reservationRow(input.parentJobId),installation=deviceExecutionOriginal(bridge,parent);
    assert.equal(input.rootId,parent.consent.custody.rootId,'DEVICE_OUTPUT_ROOT_CHANGED');
    assert.ok(Number.isSafeInteger(input.noteRevision)&&input.noteRevision>=parent.consent.custody.noteRevision,'DEVICE_OUTPUT_CUSTODY_REVISION');
    const reserved=await reservationObservation(parent);assert.equal(reserved.stage,'RESERVED','DEVICE_OUTPUT_ORIGINAL_S_REQUIRED');
    const sourceNullifier=parent.consent.statement.inputNullifier;
    assert.equal(new Set([sourceNullifier,input.changeNullifier,input.recoveryNullifier]).size,3,'DEVICE_OUTPUT_NULLIFIERS_CHANGED');
    if(parent.nativeOutcome!==null){
      assert.ok(parent.nativeTerminal,'DEVICE_OUTPUT_ORIGINAL_TERMINAL_REQUIRED');
      assert.equal(nativeExecution.snapshot(parent.jobId).outcome,parent.nativeOutcome,'DEVICE_OUTPUT_ORIGINAL_TERMINAL_CHANGED');
      const terminal=await runtime.receipt('0x'+parent.nativeTerminal.transactionHash);assert.ok(terminal);
      await runtime.checkReceipt(terminal);await runtime.assertCanonical(terminal);
    }
    const quote=originalQuote(parent.consent.quoteId),deposit=reservationSubject(parent.consent.depositJobId,input.rootId,installation.descriptor),
      budget=BigInt(genericBalanceNativeTerms(validateGenericBalanceNativePreparation(quote.preparation)).budget),
      view=await reader.read();
    assert.ok(view.ledger.nullifiers.includes('0x'+sourceNullifier),'DEVICE_OUTPUT_ORIGINAL_SOURCE_SPEND_REQUIRED');
    function note(role,amount){
      assert.ok(amount>0n,'DEVICE_OUTPUT_POSITIVE_NOTE_REQUIRED');
      const commitment=parent.nativeBinding[role==='change'?'changeCommitment':'recoveryCommitment'],nullifier=input[role+'Nullifier'];
      if(parent.nativeFReorg && parent.nativeFReorg.phase !== 'RECONFIRMED' || role==='recovery'&&parent.nativeOutcome!=='RECOVERED')return{noteRole:role,commitment,nullifier,amount:amount.toString(),state:'LOCKED',path:null};
      const indices=view.ledger.commitments.flatMap((leaf,index)=>leaf==='0x'+commitment?[index]:[]);
      assert.equal(indices.length,1,'DEVICE_OUTPUT_ORIGINAL_NOTE_REQUIRED');const path=view.ledger.tree.path(indices[0]);
      assert.equal(verifyPrivateNotePath(path),true,'DEVICE_OUTPUT_ORIGINAL_PATH');
      return{noteRole:role,commitment,nullifier,amount:amount.toString(),state:view.ledger.nullifiers.includes('0x'+nullifier)?'SPENT':'UNSPENT',
        path:{root:bare(path.root),index:path.index,leaf:bare(path.leaf),siblings:path.siblings.map(bare)}};
    }
    const change=note('change',BigInt(deposit.consent.statement.amount)-budget),recovery=note('recovery',budget);
    await reader.assertCurrent(view);continueWork();
    return{parentJobId:parent.jobId,rootId:input.rootId,noteRevision:input.noteRevision,nativeBindingSHA256:sha(parent.nativeBinding),
      reservationTransactionHash:reserved.observation.transactionHash,assetId:asset.assetId,pool:identity.pool,
      poolTerms:{scope:asset.scope,policy:asset.policy,codeHash:asset.codeHash,assetIdentity:asset.assetIdentity,domainCommitment:identity.domainCommitment},
      sourceNullifier,sourceNullifierSpent:true,nativeOutcome:parent.nativeOutcome,change,recovery,
      observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp}};
  }
  function exitBinding(consent,bridge){reservationBinding(consent);const parent=reservationRow(consent.parentJobId),installation=deviceExecutionOriginal(bridge,parent);
    assert.equal(consent.nativeBindingSHA256,sha(parent.nativeBinding),'DEVICE_EXIT_ORIGINAL_BINDING_CHANGED');
    assert.equal(consent.rootId,parent.consent.custody.rootId,'DEVICE_EXIT_ROOT_CHANGED');
    for(const name of ['origin','pairingId','devicePublicKey'])assert.equal(consent[name],installation.descriptor[name],'DEVICE_EXIT_DEVICE_CHANGED');return parent;}
  async function exitCurrent(consent,bridge,epoch){await healthy();continueWork();exitBinding(consent,bridge);const view=await reader.read();await reader.assertCurrent(view);
    if(epoch)assert.equal(consent.statement.epoch,(BigInt(view.head.timestamp)/600n).toString(),'DEVICE_EXIT_EPOCH_CHANGED');return view;}
  async function observeExit(row,bridge){
    exitBinding(row.consent,bridge);if(row.submission===null)return exitPublic(row);
    const observation=await observer.readTransaction({kind:'withdraw_'+row.consent.noteRole,identitySHA256,
      transactionHash:row.submission.transactionHash,calldataSHA256:row.submission.calldataSHA256});
    if(observation===null)return{...exitPublic(row),stage:'WITHDRAWAL_UNKNOWN'};
    validateFlatAccountOwnerObservation({identity,artifact:pool.artifact,submission:row.submission,authorization:null,observation});
    const view=await exitCurrent(row.consent,bridge,false);assert.ok(view.ledger.nullifiers.includes('0x'+row.consent.statement.nullifier),'DEVICE_EXIT_ORIGINAL_SPEND_REQUIRED');
    const receipt=await runtime.receipt('0x'+observation.transaction.hash);assert.ok(receipt);await runtime.checkReceipt(receipt);const block=await runtime.assertCanonical(receipt);
    const retained={profile:'LIANUM_DEVICE_ORIGINAL_W39_OBSERVATION_V1',jobId:row.jobId,parentJobId:row.consent.parentJobId,rootId:row.consent.rootId,
      noteRole:row.consent.noteRole,commitment:row.consent.statement.commitment,nullifier:row.consent.statement.nullifier,
      amount:row.consent.statement.amount,recipient:row.consent.statement.recipient,transactionHash:observation.transaction.hash,
      blockHash:observation.receipt.blockHash,blockNumber:BigInt(block.number).toString(),calldataSHA256:row.submission.calldataSHA256,
      timestamp:observation.after.timestamp,domainCommitment:identity.domainCommitment};
    if(row.observation!==null)assert.deepEqual(retained,row.observation,'DEVICE_EXIT_ORIGINAL_OBSERVATION_CHANGED');
    else await exitUpdate(row.jobId,{stage:'CONFIRMED',errorCode:null,observation:retained,submission:{...row.submission,observation}});
    await reader.assertCurrent(view);return exitPublic(exitRow(row.jobId));
  }
  async function deviceExit(original){return exclusive(async()=>{
    const {bridge,action,consent}=original;exitBinding(consent,bridge);const reply=value=>({...value,authorizationSHA256:byteSHA(deviceExitConsentMessageV1(consent))});
    if(action==='PROVE_W39'){
      assert.ok(!exitRows().some(row=>row.jobId===consent.jobId||row.consent.statement.commitment===consent.statement.commitment),
        'DEVICE_EXIT_ORIGINAL_JOB_ALREADY_ADMITTED');assert.ok(exitRows().length<16,'DEVICE_EXIT_JOURNAL_CAPACITY');
      const input=normalizeDeviceExitWitnessV1(original.witness),bytes=deviceExitWitnessBytesV1(input);let prover;
      try{
        assert.equal(byteSHA(bytes),consent.witnessSHA256,'DEVICE_EXIT_WITNESS_CHANGED');const publicInputs=walletInputPublicWords('withdraw_balance',input),
          statement=decodeWalletPoolInputs('withdraw_balance',publicInputs);
        for(const name of ['scope','policy','root','nullifier','recipient'])assert.equal(statement[name].slice(2),consent.statement[name],'DEVICE_EXIT_STATEMENT_CHANGED');
        for(const name of ['epoch','amount'])assert.equal(statement[name],consent.statement[name],'DEVICE_EXIT_STATEMENT_CHANGED');
        const opening={type:4,rho:Buffer.from(input.rho),x:Buffer.from(input.key_x),y:Buffer.from(input.key_y),value:input.value,secret:Buffer.from(input.secret)},
          commitment=balanceCommitment(consent.statement.scope,consent.statement.policy,opening);
        try{assert.equal(commitment.toString('hex'),consent.statement.commitment,'DEVICE_EXIT_ORIGINAL_OPENING_CHANGED');
          assert.equal(nullifier(Buffer.from(consent.statement.scope,'hex'),commitment,opening.secret).toString('hex'),consent.statement.nullifier,'DEVICE_EXIT_NULLIFIER_CHANGED');}
        finally{for(const name of ['rho','x','y','secret'])opening[name].fill(0);}
        const historicalPath={root:'0x'+consent.statement.root,leaf:'0x'+consent.statement.commitment,index:Number(input.leaf_index),
          siblings:input.siblings.map(bytes=>'0x'+Buffer.from(bytes).toString('hex'))};assert.equal(verifyPrivateNotePath(historicalPath),true,'DEVICE_EXIT_ORIGINAL_PATH_CHANGED');
        const terms=await exitTerms(bridge,{parentJobId:consent.parentJobId,noteRole:consent.noteRole,rootId:consent.rootId,noteRevision:consent.noteRevision,
          nullifier:consent.statement.nullifier,recipient:consent.statement.recipient});
        for(const name of ['scope','policy','commitment','amount','recipient','nullifier','epoch'])assert.equal(consent.statement[name],terms.statement[name],'DEVICE_EXIT_TERMS_CHANGED');
        const before=await exitCurrent(consent,bridge,true);assert.ok(before.ledger.roots.includes('0x'+consent.statement.root),'DEVICE_EXIT_ORIGINAL_ROOT_REQUIRED');
        assert.ok(!before.ledger.nullifiers.includes('0x'+consent.statement.nullifier),'DEVICE_EXIT_NOTE_ALREADY_SPENT');
        // The durable latch precedes the one original W39 worker. Neither the
        // witness nor the note/private root key is retained in the account.
        await write(data=>({...data,deviceExits:[...(data.deviceExits??[]),{jobId:consent.jobId,consent:copy(consent),stage:'PROVING',proof:null,
          proofSHA256:null,publicInputsSHA256:null,submission:null,observation:null,errorCode:null}]}));
        prover=nativeNote?createNativeEconomicNoteProofProcessV1('owner'):createProofProcess({purpose:'owner',modes:['withdraw_balance']});activeLegacy=prover;
        const result=await prover.prove('withdraw_balance',input,publicInputs,'device-exit-w39');assert.equal(result.metrics.acceptedResult,true);
        const view=await exitCurrent(consent,bridge,true),proof=transportProof(result);
        assert.equal(await system.verify('withdraw_balance',Buffer.from(proof.proof,'hex'),proof.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),
          view.header.number),true,'DEVICE_EXIT_DEPLOYED_VERIFIER_REJECTED');await reader.assertCurrent(view);continueWork();
        await onProof({label:'device-exit-w39',relation:'withdraw_balance',role:'device-owner',proof:{...proof,metrics:result.metrics}});
        await exitUpdate(consent.jobId,{stage:'PROVED',proof,proofSHA256:byteSHA(Buffer.from(proof.proof,'hex')),publicInputsSHA256:sha(proof.publicInputs),
          ...(recovery?.native?{originalPublicProofMetricsFrame:captureNativeDeviceOriginalW39MetricsFrameV1(result.metrics,proof)}:{})});
        return reply(exitPublic(exitRow(consent.jobId)));
      }catch(error){if(!unavailable&&exitRows().some(row=>row.jobId===consent.jobId))try{await exitUpdate(consent.jobId,{stage:'FAILED',
          errorCode:privateFailureDiagnostic(error,'DEVICE_EXIT_PROOF_REJECTED').code});}catch{}throw error;}
      finally{bytes.fill(0);wipeDeviceExitWitnessV1(input);if(prover)await prover.close();activeLegacy=null;}
    }
    const row=exitRow(consent.jobId);for(const name of ['parentJobId','nativeBindingSHA256','quoteId','rootId','noteRevision','noteRole','witnessSHA256'])
      assert.equal(consent[name],row.consent[name],'DEVICE_EXIT_ORIGINAL_JOB_CHANGED');assert.deepEqual(consent.statement,row.consent.statement,'DEVICE_EXIT_STATEMENT_CHANGED');
    assert.equal(consent.proofSHA256,row.proofSHA256,'DEVICE_EXIT_PROOF_CHANGED');assert.equal(consent.publicInputsSHA256,row.publicInputsSHA256,'DEVICE_EXIT_PROOF_CHANGED');
    if(action==='OBSERVE_W39')return reply(await observeExit(row,bridge));
    assert.equal(action,'WITHDRAW_W39');assert.equal(row.stage,'PROVED','DEVICE_EXIT_RECONCILE_ORIGINAL_ONLY');assert.equal(row.submission,null,'DEVICE_EXIT_RECONCILE_ORIGINAL_ONLY');
    const view=await exitCurrent(consent,bridge,true);assert.ok(view.ledger.roots.includes('0x'+consent.statement.root),'DEVICE_EXIT_ORIGINAL_ROOT_REQUIRED');
    assert.ok(!view.ledger.nullifiers.includes('0x'+consent.statement.nullifier),'DEVICE_EXIT_NOTE_ALREADY_SPENT');
    const calldata=encodeFlatTransaction('withdrawBalance',row.proof),submission={kind:'withdraw_'+consent.noteRole,calldata,calldataSHA256:flatAccountCalldataHash(calldata),
      publicInputs:row.proof.publicInputs,statement:{scope:consent.statement.scope,policy:consent.statement.policy,epoch:consent.statement.epoch,
        root:consent.statement.root,nullifier:consent.statement.nullifier,amount:consent.statement.amount,recipient:consent.statement.recipient},before:snapshotFromView(view),
      epoch:consent.statement.epoch,transactionHash:null,dispatchLatched:true,ownerConfirmed:false,observation:null};
    await exitUpdate(row.jobId,{stage:'WITHDRAWAL_UNKNOWN',withdrawalConsent:copy(consent),submission});
    try{continueWork();const receipt=await runtime.send('flat-account-device-exit',{to:pool.address,data:calldata,value:'0'});
      await exitUpdate(row.jobId,{submission:{...submission,transactionHash:bare(receipt.transactionHash)}});return reply(await observeExit(exitRow(row.jobId),bridge));}
    catch(error){if(!unavailable)try{const hash=error.transactionRecord?.transactionHash;await exitUpdate(row.jobId,{...(hash?{submission:{...submission,transactionHash:bare(hash)}}:{}),
        errorCode:privateFailureDiagnostic(error,'DEVICE_EXIT_SEND_UNRESOLVED').code});}catch{}throw error;}
  });}
  function request(value) {
    const bound = validateBoundRequest(value, config), entry = operation(bound.ownerOperationRef);
    if (wrapped) assert.equal(bound.kind, 'GRAPH', 'WRAPPED_WALLET_ORIGINAL_CLAIM_CONTROLLER_REQUIRED');
    assert.equal(bound.assetId, asset.assetId, 'FLAT_ACCOUNT_ASSET_CHANGED');
    assert.equal(bound.kind, entry.kind, 'FLAT_ACCOUNT_KIND_CHANGED');
    if (entry.request !== null) assert.deepEqual(bound, entry.request, 'FLAT_ACCOUNT_REQUEST_REBOUND');
    return { bound, entry };
  }
  async function register(ref, kind, role = null, graph = null) {
    if (wrapped) assert.equal(kind, 'GRAPH', 'WRAPPED_WALLET_ORIGINAL_CLAIM_CONTROLLER_REQUIRED');
    await healthy(); reference(ref);
    assert.ok(kind !== 'GRAPH' || nativeExecution !== null, 'FLAT_ACCOUNT_GRAPH_EXECUTION_UNAVAILABLE');
    const ownerKind = kind === 'TOP_UP' ? 'deposit' : kind === 'GRAPH' ? 'reservation' : 'withdraw_' + role;
    const preparationSHA256 = sha({ kind, ownerKind, ...(graph ? { prepared: graph.prepared,
      providers: graph.providers.map(({ custody: _capability, ...data }) => data) } : {}) });
    let entry = record.data.operations.find(value => value.ownerOperationRef === ref);
    if (entry) {
      assert.equal(entry.preparationSHA256, preparationSHA256, 'FLAT_ACCOUNT_OPERATION_REBOUND');
      if (entry.nativeBinding !== null || kind !== 'GRAPH') return { ownerOperationRef: ref, kind, assetId: asset.assetId };
    } else {
      assert.ok(!record.data.operations.some(value => value.ownerKind === ownerKind),
        'FLAT_ACCOUNT_ORIGINAL_OWNER_REFERENCE_REQUIRED');
      const summary = await owner.publicView.summary();
      assert.equal(summary.identitySHA256, identitySHA256, 'FLAT_ACCOUNT_OWNER_IDENTITY');
      if (kind !== 'GRAPH') assert.ok(['PREPARED', 'SIGNING', 'AUTHORIZED'].includes(summary.operations[ownerKind]),
        'FLAT_ACCOUNT_OWNER_PREPARATION_REQUIRED');
      else {
        // The public U was produced in the owner process. Every detached packet
        // must still be exactly that owner's original retained authorization.
        for (const name of ['reservation', 'recovery', 'assembler'])
          assert.deepEqual((await owner.roles[name]()).select(), graph.prepared.rolePackets[name], 'FLAT_ACCOUNT_ORIGINAL_PACKET');
        for (const name of ['local', 'dependency']) for (let slot = 0; slot < 4; slot++)
          assert.deepEqual((await owner.roles[name](slot)).select(), graph.prepared.rolePackets[name][slot], 'FLAT_ACCOUNT_ORIGINAL_PACKET');
      }
      if (kind === 'TOP_UP' && !nativeAsset) {
        // Approval is an explicit funding prerequisite supplied by the private
        // bootstrap, not an implicit side effect or a deposit resend policy.
        const original = await owner.ownerProof.deposit();
        await tokenFundingReady(original.statement.amount);
      }
      await write(data => ({ ...data, operations: [...data.operations, {
        ownerOperationRef: ref, kind, ownerKind, role, preparationSHA256, request: null, stage: 'READY',
        prepared: graph?.prepared ?? null, nativeBinding: null, submission: null,
        terminal: null, outcome: null, errorCode: null,
      }] }));
      entry = operation(ref);
    }
    if (kind === 'GRAPH') {
      const expected = flatAccountGraphBinding(entry.prepared, identity);
      const binding = await nativeExecution.prepare(ref, entry.prepared, graph.providers);
      assert.deepEqual(binding, expected, 'FLAT_ACCOUNT_NATIVE_BINDING_CHANGED');
      await update(ref, { nativeBinding: binding });
    }
    return { ownerOperationRef: ref, kind, assetId: asset.assetId };
  }
  function snapshotFromView(view) {
    return { identitySHA256, blockHash: view.head.hash, canonicalBlockHashBefore: view.head.hash,
      canonicalBlockHashAfter: view.head.hash, timestamp: view.head.timestamp,
      ...Object.fromEntries(['rawState', 'rawHistory', 'rawBacking'].map(key => [key, view.poolObservation[key]])) };
  }
  async function confirmOwner(ref, acknowledgeOwner = true) {
    const entry = operation(ref), submission = entry.submission;
    assert.ok(submission, 'FLAT_ACCOUNT_ORIGINAL_SUBMISSION_REQUIRED');
    const observation = await observer.readTransaction({ kind: submission.kind, identitySHA256,
      transactionHash: submission.transactionHash, calldataSHA256: submission.calldataSHA256 });
    assert.ok(observation, 'FLAT_ACCOUNT_ORIGINAL_TRANSACTION_UNRESOLVED');
    validateFlatAccountOwnerObservation({ identity, artifact: pool.artifact, submission,
      authorization: entry.prepared ? decodeStatement('authorization', entry.prepared.authorization.publicInputs) : null, observation });
    let ownerConfirmed = submission.ownerConfirmed;
    if (acknowledgeOwner && !ownerConfirmed) {
      await owner.owner.acknowledgeSubmitted({ kind: submission.kind, transactionHash: observation.transaction.hash });
      const confirmed = await owner.owner.reconcile({ kind: submission.kind });
      assert.equal(confirmed.stage, 'CONFIRMED', 'FLAT_ACCOUNT_OWNER_RECONCILIATION_REQUIRED');
      ownerConfirmed = true;
    }
    if (submission.observation === null || ownerConfirmed !== submission.ownerConfirmed) await update(ref, { submission: {
      ...submission, transactionHash: observation.transaction.hash, observation, ownerConfirmed,
    } });
    const receipt = await runtime.receipt('0x' + observation.transaction.hash);
    assert.ok(receipt, 'FLAT_ACCOUNT_ORIGINAL_RECEIPT_REQUIRED');
    await runtime.checkReceipt(receipt);
    assert.equal(bare(receipt.blockHash), observation.receipt.blockHash, 'FLAT_ACCOUNT_RECEIPT_CHANGED');
    return receipt;
  }
  async function submitOwner(ref, { proof, statement, before, calldata }) {
    const entry = operation(ref); assert.equal(entry.submission, null, 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
    if (entry.manualLifecycle || entry.nativeManualReview) await requireFixedManualEpoch(ref);
    const submission = { kind: entry.ownerKind, calldata, calldataSHA256: flatAccountCalldataHash(calldata),
      publicInputs: proof.publicInputs, statement, before, epoch: statement.epoch ?? null,
      transactionHash: null, dispatchLatched: false, ownerConfirmed: false, observation: null };
    // Persist complete exact original identity before even requesting the owner
    // latch. Any error after this point can only reconcile this original send.
    await update(ref, { submission });
    continueWork();
    const lease = await owner.owner.bindSubmission({ kind: entry.ownerKind, calldata });
    assert.equal(lease.dispatchAllowed, true, 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
    await update(ref, { submission: { ...submission, dispatchLatched: true } });
    let receipt;
    try {
      continueWork();
      receipt = await runtime.send('flat-account-' + entry.ownerKind, { to: pool.address, data: calldata,
        value: entry.kind === 'TOP_UP' && nativeAsset ? statement.amount : '0' });
      await update(ref, { submission: { ...operation(ref).submission, transactionHash: bare(receipt.transactionHash) } });
      return await confirmOwner(ref);
    } catch (error) {
      const hash = error.transactionRecord?.transactionHash;
      if (hash && !unavailable) {
        const current = operation(ref).submission;
        if (current.transactionHash !== null) assert.equal(current.transactionHash, bare(hash), 'FLAT_ACCOUNT_TRANSACTION_CHANGED');
        else await update(ref, { submission: { ...current, transactionHash: bare(hash) } });
      }
      throw error;
    } finally { await onPrivateAudit({ reference: ref, phase: 'owner-transition', receipt: receipt ?? null }); }
  }
  async function tokenFundingReady(amount) {
    if (nativeAsset) return;
    const head = await runtime.block();
    const [allowance, balance] = await Promise.all([
      pool.assetCapability.allowance(system.sender, pool.address, head.number),
      pool.assetCapability.balance(system.sender, head.number),
    ]);
    assert.equal(allowance, BigInt(amount), 'FLAT_ACCOUNT_EXACT_TOKEN_ALLOWANCE_REQUIRED');
    assert.ok(balance >= BigInt(amount), 'FLAT_ACCOUNT_TOKEN_FUNDING_BALANCE');
    await runtime.assertCanonical(head);
  }
  async function requireFixedManualEpoch(ref) {
    const entry = operation(ref), review = entry.nativeManualReview;
    if (!review) return requireManualEpoch(ref);
    validateNativeValueManualReview(review);
    const records = await owner.ownerView.nativeNotePreparations(); validateNativeValueManualRecords(records);
    const original = records.records.find(row => row.review.request.ownerOperationRef === ref);
    assert.ok(original && original.ownerState === 'PREPARED', 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_REQUIRED');
    assert.deepEqual(original.review, review, 'NATIVE_VALUE_MANUAL_NOTE_TERMS_CHANGED');
    const scope = await owner.publicView.summary();
    for (const key of ['keyScopeSHA256', 'processIdentitySHA256', 'processGeneration'])
      assert.equal(scope[key], review[key], 'NATIVE_VALUE_MANUAL_NOTE_PROCESS_CHANGED');
    assert.equal(String((await runtime.time()) / 600n), review.epoch, 'NATIVE_VALUE_MANUAL_NOTE_EPOCH_FIXED');
    const terms = await owner.ownerView.preparationTerms({ kind: review.ownerKind });
    assert.equal(terms.identitySHA256, identitySHA256, 'NATIVE_VALUE_MANUAL_NOTE_IDENTITY');
    for (const key of ['amount', 'recipient', 'epoch']) assert.equal(terms.prepared?.[key], review[key], 'NATIVE_VALUE_MANUAL_NOTE_TERMS_CHANGED');
    assert.equal(String(BigInt(terms.observed.timestamp) / 600n), review.epoch, 'NATIVE_VALUE_MANUAL_NOTE_EPOCH_FIXED');
    assert.equal(terms.prepared.submissionBound, false, 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
  }
  function nativeNoteApproval(review) {
    const ref = review.request.ownerOperationRef;
    if (nativeNoteApprovals.has(ref)) return nativeNoteApprovals.get(ref);
    const body = immutable(review.request), publicReview = immutable({
      version: 1, profile: 'ORIGINAL_MANUAL_NATIVE_VALUE_NOTE_REVIEW_V1', ...body,
      asset: { assetId: asset.assetId, symbol: asset.symbol, decimals: asset.decimals },
      originalAccountLifetime: config.lifetime, generationId: sha(accountIdentity),
      identitySHA256, accountIdentitySHA256: sha(accountIdentity), terms: review, termsSHA256: sha(review),
      actionBodySHA256: { accountPrepare: sha(body), accountExecute: sha({ requestId: body.requestId }),
        accountReconcile: sha({ requestId: body.requestId }) },
      publicNetwork: false, observation: 'ORIGINAL_OWNER_LOCAL_NOTE_TERMS_ONLY', settlementEstablished: false });
    const approval = Object.freeze(Object.defineProperty(Object.create(null), 'toJSON', {
      value() { throw failure('NATIVE_VALUE_MANUAL_NOTE_NOT_SERIALIZABLE'); } }));
    manualNotes.set(approval, { account: capability, body, review: publicReview, check() {
      assert.deepEqual(operation(ref).nativeManualReview, review, 'NATIVE_VALUE_MANUAL_NOTE_TERMS_CHANGED');
    } });
    nativeNoteApprovals.set(ref, approval); return approval;
  }
  async function executeNote(ref) {
    const manual = Boolean(operation(ref).manualLifecycle || operation(ref).nativeManualReview);
    if (manual) await requireFixedManualEpoch(ref);
    const entry = operation(ref), mode = entry.kind === 'TOP_UP' ? 'deposit_balance' : 'withdraw_balance';
    const client = nativeNote ? createNativeEconomicNoteProofProcessV1('owner')
      : createProofProcess({ purpose: 'owner', modes: [mode] }); activeLegacy = client;
    let job = null, result = null;
    try {
      for (let attempt = 0; attempt < (manual ? 1 : 2); attempt++) {
        continueWork();
        job = entry.kind === 'TOP_UP' ? await owner.ownerProof.deposit() : await owner.ownerProof.withdrawal(entry.role);
        const epoch = String((await runtime.time()) / 600n);
        if (epoch !== job.statement.epoch) {
          if (manual) { await requireFixedManualEpoch(ref); throw failure('FLAT_ACCOUNT_MANUAL_EPOCH_RACED'); }
          await owner.owner.renewEpoch({ kind: entry.ownerKind, epoch });
          job = entry.kind === 'TOP_UP' ? await owner.ownerProof.deposit() : await owner.ownerProof.withdrawal(entry.role);
        }
        if (entry.kind === 'TOP_UP') await tokenFundingReady(job.statement.amount);
        result = await client.prove(mode, job.inputs, job.publicInputs, 'flat-account-' + entry.ownerKind);
        assert.equal(result.metrics.acceptedResult, true, 'FLAT_ACCOUNT_PROOF_INCOMPLETE');
        await onProof({ label: 'flat-account-' + entry.ownerKind, relation: mode,
          proof: { ...transportProof(result), metrics: result.metrics } });
        if (String((await runtime.time()) / 600n) !== job.statement.epoch) {
          if (manual) { await requireFixedManualEpoch(ref); throw failure('FLAT_ACCOUNT_MANUAL_EPOCH_RACED'); }
          result = null; job = null; continue; }
        if (entry.kind === 'TOP_UP') await tokenFundingReady(job.statement.amount);
        const proof = transportProof(result), before = await observer.readSnapshot();
        return await submitOwner(ref, { proof, statement: job.statement, before,
          calldata: encodeFlatTransaction(entry.kind === 'TOP_UP' ? 'depositBalance' : 'withdrawBalance', proof) });
      }
      throw failure('FLAT_ACCOUNT_NOTE_EPOCH_UNAVAILABLE');
    } finally { job = null; result = null; await client.close(); activeLegacy = null; }
  }
  async function manualGraphTime(ref) {
    const approval = manualGraphApprovals.get(ref);
    if (wrapped) assert.ok(approval, 'WRAPPED_WALLET_ORIGINAL_OWNER_APPROVAL_REQUIRED');
    if (approval) {
      const retained = manualGraphs.get(approval); if (wrapped) retained.checkRoute();
      validateFlatManualGraphAdmissionTime(retained.review, String(await runtime.time()));
      if (wrapped && operation(ref).submission === null) {
        const view = await reader.read(); assert.deepEqual(view.head, retained.review.wrappedBinding.head, 'WRAPPED_WALLET_APPROVED_HEAD_CHANGED');
        await reader.assertCurrent(view);
      }
    }
  }
  async function executeGraph(ref) {
    await manualGraphTime(ref);
    const entry = operation(ref); assert.ok(entry.nativeBinding !== null, 'FLAT_ACCOUNT_NATIVE_PREPARATION_REQUIRED');
    const prepared = entry.prepared, packet = prepared.rolePackets.reservation;
    const before = await reader.read(), funding = packet.funding.value;
    const index = before.ledger.commitments.indexOf('0x' + funding.inputCommitment);
    assert.ok(index >= 0 && !before.ledger.nullifiers.includes('0x' + funding.inputNullifier), 'FLAT_ACCOUNT_SOURCE_NOT_UNSPENT');
    const path = before.ledger.tree.path(index);
    const job = await withFlatHash(hashFields => reservationWitness(packet, {
      inputRoot: bare(path.root), inputPath: { leaf: bare(path.leaf), index: path.index, siblings: path.siblings.map(bare) },
    }, { hashFields }));
    const reservation = await proofRunner.prove('reservation', job, 'flat-account-reservation');
    const fresh = await reader.read();
    assert.deepEqual(fresh.ledger.publicState, before.ledger.publicState, 'FLAT_ACCOUNT_FRESH_RESERVATION_REQUIRED');
    assert.deepEqual(fresh.ledger.commitments, before.ledger.commitments, 'FLAT_ACCOUNT_FRESH_RESERVATION_REQUIRED');
    assert.deepEqual(fresh.ledger.nullifiers, before.ledger.nullifiers, 'FLAT_ACCOUNT_FRESH_RESERVATION_REQUIRED');
    assert.ok(BigInt(fresh.head.timestamp) >= BigInt(funding.fundingNotBefore)
      && BigInt(fresh.head.timestamp) < BigInt(funding.fundingValidUntil), 'FLAT_ACCOUNT_RESERVATION_WINDOW');
    await reader.assertCurrent(fresh);
    const projection = reserveProjection(before.ledger, '0x' + funding.reserveCommitment, '0x' + funding.changeCommitment);
    await submitOwner(ref, { proof: reservation, statement: job.statement, before: snapshotFromView(fresh),
      calldata: encodeFlatTransaction('reserveGenericGuarded', { authorization: prepared.authorization, reservation,
        expectedSequence: projection.expectedSequence, expectedPostRoot: projection.expectedPostRoot }) });
    await owner.suspend();
    const lifecycle = owner.report();
    assert.equal(lifecycle.childExited, true, 'FLAT_ACCOUNT_OWNER_MUST_BE_ABSENT');
    assert.equal(lifecycle.available, false, 'FLAT_ACCOUNT_OWNER_MUST_BE_ABSENT');
    await onStage({ reference: ref, kind: 'GRAPH', stage: 'OWNER_SUSPENDED_BEFORE_NATIVE', ownerLifecycle: lifecycle });
    continueWork();
    const result = await nativeExecution.execute(ref);
    assert.equal(result.outcome, 'FULFILLED', 'FLAT_ACCOUNT_FULFILLMENT_REQUIRED');
    return result;
  }
  async function confirmTerminal(bound, result) {
    const ref = bound.ownerOperationRef, entry = operation(ref), receipt = result.receipt;
    assert.ok(receipt, 'FLAT_ACCOUNT_ORIGINAL_RECEIPT_REQUIRED');
    await runtime.checkReceipt(receipt); assert.equal(receipt.status, '0x1', 'FLAT_ACCOUNT_SUCCESS_REQUIRED');
    assert.equal(receipt.to, pool.address, 'FLAT_ACCOUNT_TERMINAL_POOL');
    const transaction = await runtime.transaction(receipt.transactionHash);
    assert.ok(transaction, 'FLAT_ACCOUNT_ORIGINAL_TRANSACTION_REQUIRED');
    const originals = runtime.transactions.filter(value => value.transactionHash === receipt.transactionHash);
    assert.equal(originals.length, 1, 'FLAT_ACCOUNT_ORIGINAL_TRANSACTION_REQUIRED');
    const original = originals[0];
    assert.equal(transaction.from, system.sender, 'FLAT_ACCOUNT_TRANSACTION_SENDER');
    assert.equal(transaction.to, pool.address, 'FLAT_ACCOUNT_TRANSACTION_POOL');
    assert.equal(transaction.input, original.request.data, 'FLAT_ACCOUNT_TRANSACTION_CHANGED');
    assert.equal(transaction.value, original.request.value ?? '0x0', 'FLAT_ACCOUNT_TRANSACTION_VALUE');
    assert.equal(BigInt(transaction.nonce), BigInt(original.senderNonce), 'FLAT_ACCOUNT_TRANSACTION_NONCE');
    assert.equal(transaction.blockHash, receipt.blockHash, 'FLAT_ACCOUNT_RECEIPT_CHANGED');
    assert.equal(transaction.blockNumber, receipt.blockNumber, 'FLAT_ACCOUNT_RECEIPT_CHANGED');
    const calldataSHA256 = flatAccountCalldataHash(transaction.input);
    if (result.calldataSHA256 !== undefined) assert.equal(result.calldataSHA256, calldataSHA256,
      'FLAT_ACCOUNT_TERMINAL_CALLDATA_CHANGED');
    if (bound.kind !== 'GRAPH') assert.equal(entry.submission.calldataSHA256, calldataSHA256,
      'FLAT_ACCOUNT_TERMINAL_CALLDATA_CHANGED');
    const disposition = result.outcome === 'RECOVERED' ? 'RECOVERED' : 'APPLIED';
    const terminal = { disposition, transactionHash: bare(receipt.transactionHash), blockHash: bare(receipt.blockHash),
      blockNumber: BigInt(receipt.blockNumber).toString(), calldataSHA256 };
    if (disposition === 'RECOVERED') { assert.equal(bound.kind, 'GRAPH'); reference(terminal.calldataSHA256); }
    const outcome = { version: 1, state: 'CONFIRMED', bindingSHA256: bound.bindingSHA256,
      assetBindingSHA256: bound.assetBindingSHA256,
      outcomeId: sha({ identitySHA256, ownerOperationRef: ref, kind: bound.kind, ...terminal }), disposition,
      blockNumber: terminal.blockNumber, blockHash: terminal.blockHash };
    if (entry.outcome !== null) {
      assert.deepEqual(terminal, entry.terminal, 'FLAT_ACCOUNT_TERMINAL_CHANGED');
      assert.deepEqual(outcome, entry.outcome, 'FLAT_ACCOUNT_OUTCOME_CHANGED');
      return copy(entry.outcome);
    }
    await update(ref, { stage: 'CONFIRMED', terminal, outcome, errorCode: null,
      ...(entry.manualLifecycle ? { manualLifecycle: { ...entry.manualLifecycle, state: 'CONFIRMED',
        history: [...entry.manualLifecycle.history, { state: 'CONFIRMED', generation: entry.manualLifecycle.generation, evidence: outcome }] } } : {}) });
    return copy(outcome);
  }
  async function reconcileOriginal(bound) {
    const entry = operation(bound.ownerOperationRef);
    // Original S observation remains mandatory even if the native terminal has
    // already been confirmed. This path never calls execute or sends again.
    const receipt = await confirmOwner(bound.ownerOperationRef, entry.kind !== 'GRAPH');
    if (entry.kind !== 'GRAPH') return confirmTerminal(bound, { receipt, outcome: 'APPLIED' });
    const result = await nativeExecution.reconcile(bound.ownerOperationRef);
    assert.ok(['FULFILLED', 'RECOVERED'].includes(result.outcome), 'FLAT_ACCOUNT_TERMINAL_REQUIRED');
    return confirmTerminal(bound, result);
  }
  async function recoverOriginal(bound) {
    const ref = bound.ownerOperationRef, entry = operation(ref);
    assert.equal(entry.kind, 'GRAPH', 'FLAT_ACCOUNT_RECOVERY_GRAPH_ONLY');
    assert.ok(entry.request !== null && entry.stage !== 'READY', 'FLAT_ACCOUNT_NOT_STARTED');
    if (entry.outcome !== null) return reconcileOriginal(bound);
    // This observes original S with no owner RPC once its prior confirmation
    // was retained. F and its own irreversible latch belong to nativeExecution.
    await confirmOwner(ref, false);
    await update(ref, { stage: 'RECOVERING', errorCode: null });
    await onStage({ reference: ref, kind: 'GRAPH', stage: 'RECOVERING' });
    continueWork();
    const result = await nativeExecution.recover(ref);
    assert.ok(['FULFILLED', 'RECOVERED'].includes(result.outcome), 'FLAT_ACCOUNT_TERMINAL_REQUIRED');
    return confirmTerminal(bound, result);
  }
  async function unresolved(ref, error) {
    const diagnostic = privateFailureDiagnostic(error, 'FLAT_ACCOUNT_ORIGINAL_OUTCOME_UNRESOLVED');
    // Preserve the first original cause before an uncertain journal write or
    // the public keeper/HTTP mapper can replace it. This private callback grants
    // no consent, key use, reconciliation, retry or replacement operation.
    try { await onPrivateAudit({ reference: ref, stage: 'account-first-failure', originalError: error, diagnostic }); }
    catch { /* Diagnostic storage must not replace the original outcome. */ }
    if (!unavailable && operation(ref).outcome === null) {
      await update(ref, { stage: 'UNKNOWN',
        ...(operation(ref).manualLifecycle ? { manualLifecycle: { ...operation(ref).manualLifecycle, state: 'UNKNOWN',
          history: [...operation(ref).manualLifecycle.history, { state: 'UNKNOWN', generation: operation(ref).manualLifecycle.generation, evidence: null }] } } : {}),
        errorCode: diagnostic.code, errorCauseCodes: diagnostic.causeCodes,
        ...(diagnostic.auditBudget ? { errorAuditBudget: diagnostic.auditBudget } : {}) });
      await onPrivateAudit({ reference: ref, stage: 'account-operation-failed',
        errorCode: diagnostic.code, errorCauseCodes: diagnostic.causeCodes,
        ...(diagnostic.auditBudget ? { auditBudget: diagnostic.auditBudget } : {}) });
    }
  }

  /** Read the already retained original outcome without journal writes, owner
   * acknowledgement, native reconcile, proof work, or new terminal discovery. */
  async function readRetainedOwnerOutcome(entry) {
    const bound = validateBoundRequest(entry.request, config);
    const outcome = validateOutcome(entry.outcome, bound), terminal = entry.terminal;
    assert.ok(terminal && entry.submission?.observation, 'FLAT_ACCOUNT_OWNER_VIEW_ORIGINAL_REQUIRED');
    const submission = entry.submission;
    const original = await observer.readTransaction({ kind: submission.kind, identitySHA256,
      transactionHash: submission.transactionHash, calldataSHA256: submission.calldataSHA256 });
    assert.ok(original, 'FLAT_ACCOUNT_OWNER_VIEW_ORIGINAL_UNAVAILABLE');
    validateFlatAccountOwnerObservation({ identity, artifact: pool.artifact, submission,
      authorization: entry.prepared ? decodeStatement('authorization', entry.prepared.authorization.publicInputs) : null,
      observation: original });
    let receipt, disposition;
    if (entry.kind === 'GRAPH') {
      const transaction = await runtime.transaction('0x' + terminal.transactionHash);
      assert.ok(transaction, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_UNAVAILABLE');
      assert.equal(flatAccountCalldataHash(transaction.input), terminal.calldataSHA256,
        'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
      const decoded = decodeNativeValueTerminalCalldata(transaction.input);
      ownerViewTerminalObserver ??= await createNativeValueTerminalObserver({ runtime, system, poolIndex });
      const observed = await ownerViewTerminalObserver.observe({ kind: decoded.kind,
        submission: { target: pool.address, calldata: transaction.input,
          calldataSHA256: terminal.calldataSHA256, transactionHash: terminal.transactionHash },
        statement: decoded.statement, binding: entry.nativeBinding });
      assert.ok(['FULFILLED', 'RECOVERED'].includes(observed.outcome), 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_REQUIRED');
      assert.equal(observed.calldataSHA256, terminal.calldataSHA256, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
      receipt = observed.receipt; disposition = observed.outcome;
      assert.equal(outcome.disposition, disposition === 'FULFILLED' ? 'APPLIED' : 'RECOVERED',
        'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    } else {
      assert.equal(original.transaction.hash, terminal.transactionHash, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
      assert.equal(submission.calldataSHA256, terminal.calldataSHA256, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
      receipt = await runtime.receipt('0x' + terminal.transactionHash); disposition = 'APPLIED';
      assert.equal(outcome.disposition, disposition, 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    }
    assert.ok(receipt, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_UNAVAILABLE');
    await runtime.checkReceipt(receipt); assert.equal(receipt.status, '0x1', 'FLAT_ACCOUNT_SUCCESS_REQUIRED');
    assert.equal(bare(receipt.transactionHash), terminal.transactionHash, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
    assert.equal(bare(receipt.blockHash), terminal.blockHash, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
    assert.equal(BigInt(receipt.blockNumber).toString(), terminal.blockNumber, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
    assert.equal(outcome.blockHash, terminal.blockHash, 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    assert.equal(outcome.blockNumber, terminal.blockNumber, 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    assert.equal(outcome.disposition, terminal.disposition, 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    assert.equal(outcome.outcomeId, sha({ identitySHA256, ownerOperationRef: bound.ownerOperationRef,
      kind: bound.kind, ...terminal }), 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    return { request: { requestId: bound.requestId, kind: bound.kind, state: 'CONFIRMED', disposition }, receipt };
  }

  async function privateOwnerView() {
    const entries = record.data.operations.filter(entry => entry.request !== null);
    const requests = entries.map(entry => ({ requestId: entry.request.requestId, kind: entry.kind,
      state: entry.outcome === null ? 'UNRESOLVED' : 'STALE', disposition: null }));
    try { await healthy(); } catch { return projectFlatAccountOwnerView({ asset, current: null, requests }); }
    const receipts = [];
    for (let index = 0; index < entries.length; index++) {
      // HTTP admission, a recover action, or journal CONFIRMED alone is never a
      // terminal disposition. Unresolved originals stay unresolved in this view.
      if (entries[index].outcome === null) continue;
      try {
        const checked = await readRetainedOwnerOutcome(entries[index]);
        requests[index] = checked.request; receipts.push({ index, receipt: checked.receipt });
      } catch { /* Preserve STALE/null, without exposing private exception data. */ }
    }
    let current = null;
    try {
      const summary = await owner.ownerView.summary(), view = await reader.read(), state = view.ledger.publicState;
      assert.equal(summary.identitySHA256, identitySHA256, 'FLAT_ACCOUNT_OWNER_VIEW_IDENTITY');
      assert.equal(summary.observed.blockHash, view.head.hash, 'FLAT_ACCOUNT_OWNER_VIEW_HEAD_CHANGED');
      assert.equal(summary.observed.timestamp, view.head.timestamp, 'FLAT_ACCOUNT_OWNER_VIEW_HEAD_CHANGED');
      for (const { index, receipt } of receipts) {
        try {
          await runtime.assertCanonical(receipt);
          assert.ok(BigInt(receipt.blockNumber) <= BigInt(view.head.number), 'FLAT_ACCOUNT_OWNER_VIEW_STALE_HEAD');
        } catch { requests[index] = { ...requests[index], state: 'STALE', disposition: null }; }
      }
      await reader.assertCurrent(view);
      current = { observed: { observedAt: Date.now(), blockNumber: view.head.number,
        blockHash: view.head.hash, timestamp: view.head.timestamp }, balances: copy(summary.balances),
      backing: { held: state.actualAssetBalance, liabilities: state.backedAmount, surplus: state.surplus, deficit: '0' } };
      return projectFlatAccountOwnerView({ asset, current, requests });
    } catch {
      // No cached amounts or fabricated zeros when the owner/head/backing is
      // unavailable. Previously successful rows are also downgraded to STALE.
      return projectFlatAccountOwnerView({ asset, current: null, requests });
    }
  }
  // Flat-specific lifecycle. No caller error, receipt copy, boolean or callback
  // can create a genuine no-dispatch capability. The marker and receipt brands
  // are local to this exact original authority and are backed by its Vault.
  let manualKeeper = null, manualPortfolio = null, manualPreparation = null;
  const manualStops = new WeakMap(), manualReceipts = new WeakMap();
  const NDRA = 'NO_DISPATCH_REAUTHORIZATION_REQUIRED';
  function validateManualLifecycle(entry) {
    const m = entry.manualLifecycle;
    exactRecord(m, ['version', 'generation', 'state', 'epoch', 'authorizationSHA256', 'history', 'noDispatch', 'pendingReauthorization']);
    assert.equal(m.version, 2); assert.ok(['TOP_UP', 'EXIT'].includes(entry.kind));
    assert.ok(Number.isInteger(m.generation) && m.generation >= 0 && m.generation <= 8);
    assert.ok(['PREPARED', 'EXECUTING', NDRA, 'REAUTHORIZING', 'UNKNOWN', 'CONFIRMED'].includes(m.state));
    reference(m.authorizationSHA256); assert.match(m.epoch, /^(0|[1-9][0-9]{0,19})$/);
    assert.ok(Array.isArray(m.history) && m.history.length <= 96);
    for (const event of m.history) {
      exactRecord(event, ['state', 'generation', 'evidence']);
      assert.ok(['PREPARED', 'EXECUTING', NDRA, 'REAUTHORIZING', 'UNKNOWN', 'CONFIRMED'].includes(event.state));
      assert.ok(Number.isInteger(event.generation) && event.generation >= 0 && event.generation <= m.generation + 1);
    }
    if (m.noDispatch !== null) {
      exactRecord(m.noDispatch, ['version', 'profile', 'bindingSHA256', 'ownerIdentitySHA256', 'accountIdentitySHA256',
        'generation', 'authorizationSHA256', 'epoch', 'observedEpoch', 'reason']);
      assert.equal(m.noDispatch.version, 1); assert.equal(m.noDispatch.profile, 'FLAT_MANUAL_NO_DISPATCH_V1');
      assert.equal(m.noDispatch.reason, 'EPOCH_EXPIRED_BEFORE_ORIGINAL_SUBMISSION');
      assert.equal(m.noDispatch.bindingSHA256, entry.request.bindingSHA256);
      assert.equal(m.noDispatch.generation, m.generation);
      assert.equal(m.noDispatch.authorizationSHA256, m.authorizationSHA256);
      assert.equal(m.noDispatch.epoch, m.epoch); assert.ok(BigInt(m.noDispatch.observedEpoch) > BigInt(m.epoch));
      assert.equal(entry.submission, null); assert.equal(entry.outcome, null); assert.equal(entry.terminal, null);
    }
    if (m.pendingReauthorization !== null) {
      validateFlatManualReauthorization(m.pendingReauthorization);
      assert.equal(m.pendingReauthorization.previousAuthorizationSHA256, m.authorizationSHA256);
      assert.equal(m.pendingReauthorization.revision, m.generation + 1);
      assert.equal(m.pendingReauthorization.priorEpoch, m.epoch); assert.ok(m.noDispatch);
    }
    if ([NDRA, 'REAUTHORIZING'].includes(m.state)) assert.ok(m.noDispatch);
  }
  function linkedManualKeeper(keeper) {
    if (manualPortfolio === null) assertOwnedFlatManualAccountKeeper(keeper, { runtime, system, poolIndex, owner, account: capability });
    else {
      assertOwnedFlatManualPortfolioKeeper(keeper, { runtime, portfolio: manualPortfolio });
      assertOwnedFlatPortfolioAccount(manualPortfolio, capability);
    }
    assert.equal(keeper, manualKeeper, 'FLAT_ACCOUNT_ORIGINAL_MANUAL_KEEPER_REQUIRED');
  }
  async function manualOwner(ref, { pending = false } = {}) {
    const entry = operation(ref), records = await owner.ownerView.manualPreparations(); validateFlatManualRecords(records);
    const original = records.records.find(value => value.review.request.ownerOperationRef === ref);
    assert.ok(original && original.ownerState === 'PREPARED', 'FLAT_ACCOUNT_MANUAL_ORIGINAL_REQUIRED');
    validateFlatManualReview(original.review);
    assert.equal(original.review.ownerIdentitySHA256, identitySHA256);
    assert.equal(original.review.accountIdentitySHA256, sha(accountIdentity));
    assert.deepEqual(original.review.asset, asset);
    for (const key of ['requestId', 'kind', 'ownerOperationRef', 'assetId'])
      assert.equal(original.review.request[key], entry.request[key], 'FLAT_ACCOUNT_MANUAL_REQUEST_CHANGED');
    const current = currentFlatManualAuthorization(original), terms = await owner.ownerView.preparationTerms({ kind: entry.ownerKind });
    assert.equal(terms.identitySHA256, identitySHA256); assert.equal(terms.kind, entry.ownerKind);
    assert.ok(['PREPARED', 'SIGNING', 'AUTHORIZED'].includes(terms.prepared?.stage));
    assert.equal(terms.prepared.submissionBound, false); assert.equal(entry.submission, null);
    for (const name of ['amount', 'recipient']) {
      assert.equal(terms.prepared[name], original.review[name]); assert.equal(terms.note?.[name], original.review[name]);
    }
    assert.equal(terms.note.status, entry.kind === 'TOP_UP' ? 'UNISSUED' : 'LOCKED');
    assert.equal(terms.note.observedUnspent, entry.kind === 'EXIT');
    assert.equal(terms.prepared.epoch, current.epoch);
    const expected = pending ? entry.manualLifecycle.pendingReauthorization : null;
    if (entry.manualLifecycle) {
      assert.equal(sha(current), expected ? sha(expected) : entry.manualLifecycle.authorizationSHA256);
      assert.equal(current.epoch, expected?.epoch ?? entry.manualLifecycle.epoch);
    }
    return { original, current, terms };
  }
  async function requireManualEpoch(ref) {
    const entry = operation(ref), m = entry.manualLifecycle;
    assert.equal(m.state, 'EXECUTING'); assert.equal(entry.stage, 'EXECUTING');
    assert.equal(entry.submission, null);
    const { terms } = await manualOwner(ref), epoch = String(BigInt(terms.observed.timestamp) / 600n);
    if (epoch === m.epoch) return;
    assert.ok(BigInt(epoch) > BigInt(m.epoch), 'FLAT_ACCOUNT_MANUAL_EPOCH_REGRESSION');
    const stop = failure('FLAT_ACCOUNT_MANUAL_EPOCH_REVIEW_REQUIRED');
    manualStops.set(stop, { ref, generation: m.generation, authorizationSHA256: m.authorizationSHA256 }); throw stop;
  }
  function manualReceipt(entry, type) {
    const m = entry.manualLifecycle;
    const data = immutable({ version: 1, type, ownerIdentitySHA256: identitySHA256, accountIdentitySHA256: sha(accountIdentity),
      request: entry.request, generation: m.generation, epoch: m.epoch, authorizationSHA256: m.authorizationSHA256,
      evidence: type === NDRA ? m.noDispatch : m.history.at(-1).evidence });
    const receipt = Object.freeze({ data, toJSON() { throw failure('FLAT_ACCOUNT_RECEIPT_NOT_SERIALIZABLE'); } });
    manualReceipts.set(receipt, { ref: entry.ownerOperationRef, type, digest: sha(data) }); return receipt;
  }
  async function retainManualNoDispatch(ref, error) {
    const marker = manualStops.get(error), entry = operation(ref), m = entry.manualLifecycle;
    assert.ok(marker && marker.ref === ref && marker.generation === m.generation
      && marker.authorizationSHA256 === m.authorizationSHA256, 'FLAT_ACCOUNT_NO_DISPATCH_PROVENANCE');
    assert.equal(entry.stage, 'EXECUTING'); assert.equal(entry.submission, null);
    const { terms } = await manualOwner(ref), observedEpoch = String(BigInt(terms.observed.timestamp) / 600n);
    assert.ok(BigInt(observedEpoch) > BigInt(m.epoch));
    const evidence = { version: 1, profile: 'FLAT_MANUAL_NO_DISPATCH_V1', bindingSHA256: entry.request.bindingSHA256,
      ownerIdentitySHA256: identitySHA256, accountIdentitySHA256: sha(accountIdentity), generation: m.generation,
      authorizationSHA256: m.authorizationSHA256, epoch: m.epoch, observedEpoch,
      reason: 'EPOCH_EXPIRED_BEFORE_ORIGINAL_SUBMISSION' };
    await update(ref, { stage: NDRA, manualLifecycle: { ...m, state: NDRA, noDispatch: evidence,
      history: [...m.history, { state: NDRA, generation: m.generation, evidence }] } });
    return manualReceipt(operation(ref), NDRA);
  }
  async function finishManualReauthorization(ref) {
    const entry = operation(ref), m = entry.manualLifecycle, accepted = m.pendingReauthorization;
    assert.ok(accepted && m.noDispatch); await manualOwner(ref, { pending: true });
    const evidence = { authorization: accepted, previousNoDispatch: m.noDispatch };
    await update(ref, { stage: 'READY', errorCode: null, manualLifecycle: { ...m, generation: accepted.revision,
      epoch: accepted.epoch, authorizationSHA256: sha(accepted), state: 'PREPARED', noDispatch: null, pendingReauthorization: null,
      history: [...m.history, { state: 'PREPARED', generation: accepted.revision, evidence }] } });
    return manualReceipt(operation(ref), 'PREPARED');
  }
  async function originalGraphPrepare(value) {
      await healthy(); const { bound, entry } = request(value);
      assert.ok(entry.kind !== 'GRAPH' || entry.nativeBinding !== null, 'FLAT_ACCOUNT_NATIVE_PREPARATION_REQUIRED');
      if (entry.kind === 'GRAPH') await manualGraphTime(bound.ownerOperationRef);
      if (entry.nativeManualReview) await requireFixedManualEpoch(bound.ownerOperationRef);
      if (entry.request === null) await update(bound.ownerOperationRef, { request: bound });
      return { version: 1, state: 'PREPARED', bindingSHA256: bound.bindingSHA256, assetBindingSHA256: bound.assetBindingSHA256 };
  }
  async function originalGraphExecute(value) {
      await healthy(); const { bound, entry } = request(value), ref = bound.ownerOperationRef;
      assert.ok(entry.request !== null, 'FLAT_ACCOUNT_NOT_PREPARED');
      if (entry.outcome !== null) return reconcileOriginal(bound);
      assert.equal(entry.stage, 'READY', 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
      await update(ref, { stage: 'EXECUTING' });
      try {
        await onStage({ reference: ref, kind: bound.kind, stage: 'EXECUTING' });
        const result = bound.kind === 'GRAPH' ? await executeGraph(ref)
          : { receipt: await executeNote(ref), outcome: 'APPLIED' };
        return await confirmTerminal(bound, result);
      } catch (error) { await unresolved(ref, error); throw error; }
  }
  async function originalGraphReconcile(value) {
      await healthy(); const { bound, entry } = request(value);
      assert.ok(['EXECUTING', 'RECOVERING', 'UNKNOWN', 'CONFIRMED'].includes(entry.stage), 'FLAT_ACCOUNT_NOT_STARTED');
      return reconcileOriginal(bound);
  }
  async function originalGraphRecover(value) {
      await healthy(); const { bound } = request(value);
      try { return await recoverOriginal(bound); }
      catch (error) { await unresolved(bound.ownerOperationRef, error); throw error; }
  }
  function checkPortfolioKeeperBinding(input) {
    exactRecord(input, ['keeper', 'portfolio']);
    assertOwnedFlatManualPortfolioKeeper(input.keeper, { runtime, portfolio: input.portfolio });
    assertOwnedFlatPortfolioAccount(input.portfolio, capability);
    assert.ok(manualKeeper === null || manualKeeper === input.keeper, 'FLAT_ACCOUNT_MANUAL_KEEPER_ALREADY_BOUND');
    if (manualKeeper === null) assert.ok(record.data.operations.every(entry => entry.request === null), 'FLAT_ACCOUNT_LEGACY_KEEPER_MIGRATION_UNSUPPORTED');
  }
  const manualLifecycle = {
    assertCanBindPortfolioKeeper: input => { checkPortfolioKeeperBinding(input); },
    bindPortfolioKeeper: input => {
      checkPortfolioKeeperBinding(input); manualPortfolio = input.portfolio; manualKeeper = input.keeper;
    },
    graphPrepare: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedManualKeeper(input.keeper);
      assert.ok(manualPortfolio, 'FLAT_ACCOUNT_ORIGINAL_PORTFOLIO_KEEPER_REQUIRED');
      const { bound, entry } = request(input.request); assert.equal(bound.kind, 'GRAPH');
      assert.equal(entry.manualLifecycle, undefined, 'FLAT_ACCOUNT_GRAPH_EPOCH_REAUTHORIZATION_FORBIDDEN');
      return originalGraphPrepare(bound);
    }),
    graphExecute: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedManualKeeper(input.keeper);
      assert.ok(manualPortfolio, 'FLAT_ACCOUNT_ORIGINAL_PORTFOLIO_KEEPER_REQUIRED');
      const { bound, entry } = request(input.request); assert.equal(bound.kind, 'GRAPH');
      assert.equal(entry.manualLifecycle, undefined, 'FLAT_ACCOUNT_GRAPH_EPOCH_REAUTHORIZATION_FORBIDDEN');
      return originalGraphExecute(bound);
    }),
    graphReconcile: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedManualKeeper(input.keeper);
      assert.ok(manualPortfolio, 'FLAT_ACCOUNT_ORIGINAL_PORTFOLIO_KEEPER_REQUIRED');
      const { bound, entry } = request(input.request); assert.equal(bound.kind, 'GRAPH');
      assert.equal(entry.manualLifecycle, undefined, 'FLAT_ACCOUNT_GRAPH_EPOCH_REAUTHORIZATION_FORBIDDEN');
      return originalGraphReconcile(bound);
    }),
    graphRecover: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedManualKeeper(input.keeper);
      assert.ok(manualPortfolio, 'FLAT_ACCOUNT_ORIGINAL_PORTFOLIO_KEEPER_REQUIRED');
      const { bound, entry } = request(input.request); assert.equal(bound.kind, 'GRAPH');
      assert.equal(entry.manualLifecycle, undefined, 'FLAT_ACCOUNT_GRAPH_EPOCH_REAUTHORIZATION_FORBIDDEN');
      return originalGraphRecover(bound);
    }),

    bindKeeper: keeper => {
      assertOwnedFlatManualAccountKeeper(keeper, { runtime, system, poolIndex, owner, account: capability });
      assert.ok(manualKeeper === null || manualKeeper === keeper, 'FLAT_ACCOUNT_MANUAL_KEEPER_ALREADY_BOUND');
      if (manualKeeper === null) assert.ok(record.data.operations.every(entry => entry.request === null), 'FLAT_ACCOUNT_LEGACY_KEEPER_MIGRATION_UNSUPPORTED');
      manualKeeper = keeper;
    },
    prepare: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedManualKeeper(input.keeper); await healthy();
      const { bound, entry } = request(input.request); assert.ok(['TOP_UP', 'EXIT'].includes(bound.kind));
      assert.equal(entry.stage, 'READY'); assert.equal(entry.submission, null);
      if (entry.manualLifecycle) { assert.deepEqual(entry.request, bound); return; }
      // Adoption is allowed only before original authority admission, never an
      // already-used generic keeper or another request/UNKNOWN journal.
      assert.equal(entry.request, null, 'FLAT_ACCOUNT_LEGACY_KEEPER_MIGRATION_UNSUPPORTED');
      const records = await owner.ownerView.manualPreparations(); validateFlatManualRecords(records);
      const original = records.records.find(row => row.review.request.ownerOperationRef === bound.ownerOperationRef);
      assert.ok(original); for (const k of ['requestId', 'kind', 'ownerOperationRef', 'assetId']) assert.equal(original.review.request[k], bound[k]);
      const current = currentFlatManualAuthorization(original);
      assert.equal(original.reauthorizations?.length ?? 0, 0, 'FLAT_ACCOUNT_LEGACY_KEEPER_MIGRATION_UNSUPPORTED');
      const m = { version: 2, generation: original.reauthorizations?.length ?? 0, state: 'PREPARED', epoch: current.epoch,
        authorizationSHA256: sha(current), history: [{ state: 'PREPARED', generation: original.reauthorizations?.length ?? 0, evidence: null }],
        noDispatch: null, pendingReauthorization: null };
      await update(bound.ownerOperationRef, { request: bound, manualLifecycle: m });
      await manualOwner(bound.ownerOperationRef);
    }),
    execute: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request', 'generation']); linkedManualKeeper(input.keeper); await healthy();
      const { bound, entry } = request(input.request), ref = bound.ownerOperationRef, m = entry.manualLifecycle;
      assert.ok(m); assert.equal(m.generation, input.generation); assert.equal(m.state, 'PREPARED'); assert.equal(entry.stage, 'READY');
      await update(ref, { stage: 'EXECUTING', manualLifecycle: { ...m, state: 'EXECUTING',
        history: [...m.history, { state: 'EXECUTING', generation: m.generation, evidence: null }] } });
      try {
        const receipt = await executeNote(ref);
        return { type: 'CONFIRMED', outcome: await confirmTerminal(bound, { receipt, outcome: 'APPLIED' }) };
      } catch (error) {
        if (manualStops.has(error)) {
          try { return { type: NDRA, receipt: await retainManualNoDispatch(ref, error) }; }
          catch (uncertain) { await unresolved(ref, uncertain); throw uncertain; }
        }
        await unresolved(ref, error); throw error;
      }
    }),
    verifyReceipt: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'receipt']); linkedManualKeeper(input.keeper); await healthy();
      const brand = manualReceipts.get(input.receipt); assert.ok(brand, 'FLAT_ACCOUNT_NO_DISPATCH_PROVENANCE');
      const entry = operation(brand.ref), m = entry.manualLifecycle;
      assert.equal(m.state, brand.type); assert.equal(sha(input.receipt.data), brand.digest);
      const current = manualReceipt(entry, brand.type); assert.deepEqual(current.data, input.receipt.data);
      await manualOwner(brand.ref); return immutable(input.receipt.data);
    }),
    observeOriginal: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedManualKeeper(input.keeper); await healthy();
      const { bound, entry } = request(input.request), m = entry.manualLifecycle; assert.ok(m);
      if (entry.submission !== null) return { type: 'CONFIRMED', outcome: await reconcileOriginal(bound) };
      if (m.pendingReauthorization) return { type: 'PREPARED', receipt: await finishManualReauthorization(bound.ownerOperationRef) };
      if (m.state === NDRA || m.state === 'PREPARED') {
        await manualOwner(bound.ownerOperationRef); return { type: m.state, receipt: manualReceipt(entry, m.state) };
      }
      return { type: 'UNKNOWN', receipt: null };
    }),
    reviewReauthorization: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request']); linkedManualKeeper(input.keeper); await healthy();
      const { bound, entry } = request(input.request), m = entry.manualLifecycle;
      assert.equal(m.state, NDRA); assert.equal(entry.stage, NDRA); assert.equal(m.pendingReauthorization, null);
      const { original, current, terms } = await manualOwner(bound.ownerOperationRef), epoch = String(BigInt(terms.observed.timestamp) / 600n);
      assert.ok(BigInt(epoch) > BigInt(current.epoch));
      const authorization = { version: 1, profile: 'FLAT_MANUAL_EPOCH_REAUTHORIZATION_V1', revision: m.generation + 1,
        request: original.review.request, ownerIdentitySHA256: identitySHA256, accountIdentitySHA256: sha(accountIdentity),
        amount: original.review.amount, recipient: original.review.recipient, role: original.review.role,
        priorEpoch: current.epoch, epoch, observed: terms.observed, previousAuthorizationSHA256: sha(current) };
      validateFlatManualReauthorization(authorization); return immutable(authorization);
    }),
    reauthorize: input => exclusive(async () => {
      exactRecord(input, ['keeper', 'request', 'authorization']); linkedManualKeeper(input.keeper); await healthy();
      validateFlatManualReauthorization(input.authorization);
      const { bound, entry } = request(input.request), ref = bound.ownerOperationRef, m = entry.manualLifecycle;
      assert.equal(m.state, NDRA); assert.equal(entry.stage, NDRA); assert.equal(m.pendingReauthorization, null);
      const { original, current, terms } = await manualOwner(ref), accepted = immutable(input.authorization);
      assert.deepEqual(accepted.request, original.review.request);
      for (const key of ['ownerIdentitySHA256', 'accountIdentitySHA256', 'amount', 'recipient', 'role']) assert.equal(accepted[key], original.review[key]);
      assert.equal(accepted.previousAuthorizationSHA256, sha(current)); assert.equal(accepted.priorEpoch, current.epoch);
      assert.equal(accepted.revision, m.generation + 1);
      if (accepted.epoch !== String(BigInt(terms.observed.timestamp) / 600n)) return { type: NDRA, receipt: manualReceipt(entry, NDRA) };
      await update(ref, { stage: 'REAUTHORIZING', manualLifecycle: { ...m, state: 'REAUTHORIZING', pendingReauthorization: accepted,
        history: [...m.history, { state: 'REAUTHORIZING', generation: m.generation, evidence: accepted }] } });
      try {
        await owner.owner.reauthorizeManualPreparation({ authorization: accepted });
        return { type: 'PREPARED', receipt: await finishManualReauthorization(ref) };
      } catch (error) {
        // An epoch can advance between the review and the owner call. Only a
        // fresh original read proving the old authorization still intact may
        // retire this *unapplied* review. Lost/uncertain writes cannot pass it.
        try {
          await healthy(); await manualOwner(ref);
          const retained = operation(ref).manualLifecycle;
          await update(ref, { stage: NDRA, manualLifecycle: { ...retained, state: NDRA, pendingReauthorization: null,
            history: [...retained.history, { state: NDRA, generation: retained.generation,
              evidence: { unappliedAuthorization: accepted, originalNoDispatch: retained.noDispatch } }] } });
          return { type: NDRA, receipt: manualReceipt(operation(ref), NDRA) };
        } catch { await unresolved(ref, error); throw error; }
      }
    }),
  };

  const authority = Object.freeze({
    assertAuthority: async expected => {
      continueWork(); await healthy(); assert.deepEqual(expected, accountIdentity, 'FLAT_ACCOUNT_JOURNAL_IDENTITY');
      return { version: 1, available: true, identity: copy(accountIdentity) };
    },
    prepare: value => exclusive(async () => {
      await healthy(); const { bound, entry } = request(value);
      assert.ok(manualKeeper === null && !nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      assert.ok(entry.kind !== 'GRAPH' || entry.nativeBinding !== null, 'FLAT_ACCOUNT_NATIVE_PREPARATION_REQUIRED');
      if (entry.kind === 'GRAPH') await manualGraphTime(bound.ownerOperationRef);
      if (entry.nativeManualReview) await requireFixedManualEpoch(bound.ownerOperationRef);
      if (entry.request === null) await update(bound.ownerOperationRef, { request: bound });
      return { version: 1, state: 'PREPARED', bindingSHA256: bound.bindingSHA256, assetBindingSHA256: bound.assetBindingSHA256 };
    }),
    execute: value => exclusive(async () => {
      await healthy(); const { bound, entry } = request(value), ref = bound.ownerOperationRef;
      assert.ok(manualKeeper === null && !nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      assert.ok(entry.request !== null, 'FLAT_ACCOUNT_NOT_PREPARED');
      if (entry.outcome !== null) return reconcileOriginal(bound);
      assert.equal(entry.stage, 'READY', 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
      await update(ref, { stage: 'EXECUTING' });
      try {
        await onStage({ reference: ref, kind: bound.kind, stage: 'EXECUTING' });
        const result = bound.kind === 'GRAPH' ? await executeGraph(ref)
          : { receipt: await executeNote(ref), outcome: 'APPLIED' };
        return await confirmTerminal(bound, result);
      } catch (error) { await unresolved(ref, error); throw error; }
    }),
    reconcile: value => exclusive(async () => {
      await healthy(); const { bound, entry } = request(value);
      assert.ok(manualKeeper === null && !nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      assert.ok(['EXECUTING', 'RECOVERING', 'UNKNOWN', 'CONFIRMED'].includes(entry.stage), 'FLAT_ACCOUNT_NOT_STARTED');
      return reconcileOriginal(bound);
    }),
    recover: value => exclusive(async () => {
      await healthy(); const { bound } = request(value);
      assert.ok(manualKeeper === null && !nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      try { return await recoverOriginal(bound); }
      catch (error) { await unresolved(bound.ownerOperationRef, error); throw error; }
    }),
    observe: value => exclusive(async () => {
      await healthy(); exactRecord(value, ['request', 'outcome', 'challenge']);
      const { bound, entry } = request(value.request);
      assert.ok(entry.outcome !== null, 'FLAT_ACCOUNT_TERMINAL_REQUIRED');
      assert.deepEqual(value.outcome, entry.outcome, 'FLAT_ACCOUNT_OUTCOME_CHANGED');
      assert.match(value.challenge, /^[0-9a-f]{32}$/, 'FLAT_ACCOUNT_CHALLENGE');
      await reconcileOriginal(bound);
      const original = await runtime.block('0x' + BigInt(entry.outcome.blockNumber).toString(16));
      assert.equal(bare(original.hash), entry.outcome.blockHash, 'FLAT_ACCOUNT_OUTCOME_REORG');
      const view = await reader.read(), state = view.ledger.publicState;
      await runtime.assertCanonical(original); await reader.assertCurrent(view);
      assert.ok(BigInt(state.actualAssetBalance) >= BigInt(state.backedAmount), 'FLAT_ACCOUNT_BACKING_DEFICIT');
      assert.equal(state.surplus, String(BigInt(state.actualAssetBalance) - BigInt(state.backedAmount)), 'FLAT_ACCOUNT_BACKING_CHANGED');
      return { version: 1, status: 'LIVE', bindingSHA256: bound.bindingSHA256, assetBindingSHA256: bound.assetBindingSHA256,
        outcomeId: entry.outcome.outcomeId, challenge: value.challenge, observedAt: Date.now(),
        blockNumber: view.head.number, blockHash: view.head.hash, canonicalOutcomeBlockHash: entry.outcome.blockHash,
        backing: { held: state.actualAssetBalance, liabilities: state.backedAmount, surplus: state.surplus, deficit: '0' } };
    }),
  });
  const capability = Object.freeze({ config, registry: config.registry, assetId: asset.assetId, authority,
    features: Object.freeze({ privateNotes: true, nativeGraph: nativeExecution !== null, automaticTokenApproval: false, manualNativeValueGraph: nativeExecution !== null, legacyManualNoteConsent: false, nativeManualNoteConsent: !wrapped, manualWrappedGraph: wrapped && nativeExecution !== null }),
    ownerView: () => exclusive(privateOwnerView),
    manualLifecycle: Object.freeze(wrapped ? {} : manualLifecycle),
    ownerActions: Object.freeze(selectOwnerActions({
      async createManualPreparation() {
        assert.equal(arguments.length, 0, 'NATIVE_VALUE_MANUAL_NOTE_ARGUMENTS');
        const { createNativeValueOwnerManualPreparation } = await import('../../../../custody/src/preparation/native-value-owner-manual-preparation-v1.mjs');
        return createNativeValueOwnerManualPreparation({ runtime, system, poolIndex, owner, account: capability });
      },
      async restoreManualPreparation() {
        assert.equal(arguments.length, 0, 'NATIVE_VALUE_MANUAL_NOTE_ARGUMENTS');
        const { restoreNativeValueOwnerManualPreparation } = await import('../../../../custody/src/preparation/native-value-owner-manual-preparation-v1.mjs');
        return restoreNativeValueOwnerManualPreparation({ runtime, system, poolIndex, owner, account: capability });
      },
      registerNativeManualNote: review => exclusive(async () => {
        validateNativeValueManualReview(review); review = immutable(review); await healthy();
        assert.equal(review.ownerIdentitySHA256, identitySHA256, 'NATIVE_VALUE_MANUAL_NOTE_IDENTITY');
        assert.equal(review.accountIdentitySHA256, sha(accountIdentity), 'NATIVE_VALUE_MANUAL_NOTE_ACCOUNT');
        assert.equal(review.generationId, sha(accountIdentity), 'NATIVE_VALUE_MANUAL_NOTE_GENERATION');
        assert.equal(review.originalAccountLifetime, config.lifetime, 'NATIVE_VALUE_MANUAL_NOTE_LIFETIME');
        assert.deepEqual(review.asset, asset, 'NATIVE_VALUE_MANUAL_NOTE_ASSET');
        const records = await owner.ownerView.nativeNotePreparations(); validateNativeValueManualRecords(records);
        const saved = records.records.find(row => row.review.request.ownerOperationRef === review.request.ownerOperationRef);
        assert.equal(saved?.ownerState, 'PREPARED', 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_REQUIRED');
        assert.deepEqual(saved.review, review, 'NATIVE_VALUE_MANUAL_NOTE_TERMS_CHANGED');
        const entry = operation(review.request.ownerOperationRef);
        assert.equal(entry.kind, review.kind); assert.equal(entry.role, review.role); assert.equal(entry.ownerKind, review.ownerKind);
        assert.equal(entry.request, null); assert.equal(entry.stage, 'READY'); assert.equal(entry.submission, null);
        assert.ok(!entry.nativeManualReview, 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_ONLY');
        await update(entry.ownerOperationRef, { nativeManualReview: review });
        await requireFixedManualEpoch(entry.ownerOperationRef);
        return nativeNoteApproval(review);
      }),
      readNativeManualNoteApproval: review => exclusive(async () => {
        validateNativeValueManualReview(review); await healthy();
        const entry = operation(review.request.ownerOperationRef);
        assert.deepEqual(entry.nativeManualReview, review, 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_REQUIRED');
        // Restoring metadata never restores a listener grant or executes.
        return nativeNoteApproval(entry.nativeManualReview);
      }),
      // Original registration observation only; no witness, write, retry,
      // admission, proof or submission. A surviving authority remains required.
      readManualRegistration: review => exclusive(async () => {
        validateNativeValueManualReview(review); await healthy();
        assert.equal(review.ownerIdentitySHA256, identitySHA256, 'FLAT_ACCOUNT_OWNER_IDENTITY');
        assert.equal(review.accountIdentitySHA256, sha(accountIdentity), 'FLAT_ACCOUNT_JOURNAL_IDENTITY');
        assert.deepEqual(review.asset, asset, 'FLAT_ACCOUNT_ASSET_CHANGED');
        const r = review.request;
        const entries = record.data.operations.filter(entry => entry.ownerOperationRef === r.ownerOperationRef
          || entry.ownerKind === review.ownerKind || entry.request?.requestId === r.requestId);
        if (entries.length === 0) return { status: 'ABSENT' };
        assert.equal(entries.length, 1, 'FLAT_ACCOUNT_MANUAL_ORIGINAL_CONFLICT');
        const entry = entries[0];
        assert.equal(entry.ownerOperationRef, r.ownerOperationRef, 'FLAT_ACCOUNT_MANUAL_ORIGINAL_CONFLICT');
        assert.equal(entry.ownerKind, review.ownerKind); assert.equal(entry.kind, review.kind);
        assert.equal(entry.role, review.role);
        assert.equal(entry.preparationSHA256, sha({ kind: review.kind, ownerKind: review.ownerKind }));
        if (entry.request !== null) {
          for (const field of ['requestId', 'kind', 'ownerOperationRef', 'assetId'])
            assert.equal(entry.request[field], r[field], 'FLAT_ACCOUNT_REQUEST_REBOUND');
          return { status: 'ALREADY_ADMITTED' };
        }
        assert.equal(entry.stage, 'READY', 'FLAT_ACCOUNT_MANUAL_ALREADY_STARTED');
        assert.equal(entry.submission, null); assert.equal(entry.outcome, null); assert.equal(entry.terminal, null);
        return { status: 'REGISTERED' };
      }),
      registerTopUp: ref => exclusive(() => register(ref, 'TOP_UP')),
      registerExit: (ref, role) => exclusive(() => {
        assert.ok(['source', 'change', 'recovery'].includes(role), 'FLAT_ACCOUNT_EXIT_ROLE');
        return register(ref, 'EXIT', role);
      }),
      registerGraph: value => exclusive(async () => {
        exactRecord(value, ['ownerOperationRef', 'prepared', 'providers']);
        const prepared = immutable(value.prepared); flatAccountGraphBinding(prepared, identity);
        assert.ok(Array.isArray(value.providers), 'FLAT_ACCOUNT_PROVIDERS');
        const providers = Object.freeze(value.providers.map(record => {
          exactRecord(record, ['slot', 'custody', 'deliveryRiskSalt']);
          const { custody, ...metadata } = record;
          return Object.freeze({ ...immutable(metadata), custody });
        }));
        const prior = nativeProviderSets.get(value.ownerOperationRef);
        if (prior) {
          assert.equal(prior.length, providers.length, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
          providers.forEach((row, i) => {
            assert.equal(row.custody, prior[i].custody, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
            assert.equal(row.slot, prior[i].slot, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
            assert.equal(row.deliveryRiskSalt, prior[i].deliveryRiskSalt, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
          });
        } else nativeProviderSets.set(value.ownerOperationRef, providers);
        return register(value.ownerOperationRef, 'GRAPH', null, { prepared, providers });
      }),
      // PRIVATE explicit owner handoff after the original U/D27/quote graph
      // registration. No HTTP caller can fabricate or alter these terms.
      approveManualNativeValueGraph: value => exclusive(async () => {
        exactRecord(value, ['requestId', 'ownerOperationRef']); value = immutable(value);
        assert.ok(typeof value.requestId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(value.requestId)?.[0] === value.requestId,
          'FLAT_ACCOUNT_REQUEST');
        await healthy(); const entry = operation(value.ownerOperationRef);
        assert.ok(entry.kind === 'GRAPH' && entry.nativeBinding && entry.request === null && entry.stage === 'READY',
          'FLAT_ACCOUNT_MANUAL_GRAPH_PREPARATION_REQUIRED');
        const route = ownedNativeValueManualGraphReview(nativeExecution, value.ownerOperationRef, { runtime, system, poolIndex });
        const terms = await owner.ownerView.graphPreparationTerms();
        assert.equal(terms.identitySHA256, identitySHA256, 'FLAT_ACCOUNT_OWNER_IDENTITY');
        for (const key of ['envelope', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore'])
          assert.equal(terms[key], route[key], 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
        assert.equal(BigInt(terms.sourceAmount), BigInt(terms.reservedAmount) + BigInt(terms.changeAmount),
          'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
        let wrappedBinding = null;
        if (wrapped) {
          const registration = validateWrappedClaimOperationalRegistration(system.custodyRegistration);
          const claim = registration.claims[poolIndex], view = await reader.read(), process = owner.report();
          assert.equal(claim.config.pool, pool.address.slice(2), 'WRAPPED_WALLET_ORIGINAL_CUSTODY_POOL');
          assert.equal(claim.config.wrapperAssetIdentity, pool.domain.asset, 'WRAPPED_WALLET_ORIGINAL_WRAPPED_ASSET');
          assert.equal(claim.config.registryCommitment, pool.domain.registryCommitment, 'WRAPPED_WALLET_ORIGINAL_REGISTRY');
          assert.ok(view.ledger.commitments.includes('0x' + entry.nativeBinding.inputCommitment), 'WRAPPED_WALLET_ORIGINAL_NOTE_REQUIRED');
          assert.ok(!view.ledger.nullifiers.includes('0x' + entry.nativeBinding.inputNullifier), 'WRAPPED_WALLET_ORIGINAL_NOTE_SPENT');
          assert.equal(process.available, true, 'WRAPPED_WALLET_ORIGINAL_OWNER_UNAVAILABLE');
          reference(process.processIdentitySHA256);
          wrappedBinding = immutable({ profile: 'WRAPPED_WALLET_ORIGINAL_CONSENT_BINDING_V1',
            accountIdentitySHA256: sha(accountIdentity), runtimeIdentitySHA256: sha({ chainId: runtime.metadata.chainId,
              genesis: runtime.metadata.evmGenesis, bootstrap: system.bootstrap }),
            systemProfile: system.profile, hub: system.hub.address, claimAuthority: system.claims.authority.address,
            registryCommitment: system.registryCommitment.slice(2), claimDomain: claim.claimDomain,
            processIdentitySHA256: process.processIdentitySHA256, processGeneration: process.generation,
            head: view.head, economicIntentSHA256: sha({ body: { requestId: value.requestId, ownerOperationRef: value.ownerOperationRef },
              route, terms, asset: asset.assetId, accountIdentity, sourceNoteCommitment: entry.nativeBinding.inputCommitment }) });
          await reader.assertCurrent(view);
        }
        const body = immutable({ requestId: value.requestId, kind: 'GRAPH',
          ownerOperationRef: value.ownerOperationRef, assetId: asset.assetId });
        const review = immutable({ version: route.graph ? 2 : 1, profile: route.graph
          ? (wrapped ? 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V2' : 'ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V3')
          : (wrapped ? 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1' : 'ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V2'),
          ...(wrapped ? { wrappedBinding } : {}),
          ...body, asset: { assetId: asset.assetId, symbol: asset.symbol, decimals: asset.decimals },
          ...route, ...terms, originalAccountLifetime: config.lifetime,
          observation: 'ORIGINAL_AUTHORIZED_TERMS_ONLY', solverOwnLiquidity: true,
          settlementEstablished: false, recovery: 'PRIVATE_ORIGINAL_CUTOFF_ONLY' });
        if(route.graph)validateOwnerGraphReview(review);
        validateFlatManualGraphAdmissionTime(review, String(await runtime.time()));
        // One retained operation has one exact human handoff identity for this
        // authority lifetime. Duplicate issuance cannot rebind its request ID.
        const existing = manualGraphApprovals.get(value.ownerOperationRef);
        if (existing) {
          const original = manualGraphs.get(existing);
          assert.deepEqual(original.body, body, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
          assert.deepEqual(original.review, review, 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
          return existing;
        }
        const approval = Object.freeze(Object.create(null));
        manualGraphs.set(approval, { account: capability, body, review, check() {
          assertOwnedNativeValueExecution(nativeExecution, { runtime, system, poolIndex });
        }, checkRoute() {
          if (wrapped) { const process = owner.report(); assert.equal(process.processIdentitySHA256, wrappedBinding.processIdentitySHA256);
            assert.equal(process.generation, wrappedBinding.processGeneration, 'WRAPPED_WALLET_OWNER_GENERATION_CHANGED'); }
          assert.deepEqual(ownedNativeValueManualGraphReview(nativeExecution, value.ownerOperationRef,
            { runtime, system, poolIndex }), route, 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
        } });
        manualGraphApprovals.set(value.ownerOperationRef, approval);
        return approval;
      }),
      recoveryCreditRequest: ref => exclusive(async () => {
        await healthy(); const entry = operation(ref);
        assert.ok(entry.request !== null && entry.kind === 'GRAPH', 'FLAT_ACCOUNT_RECOVERY_GRAPH_ONLY');
        await reconcileOriginal(entry.request); const current = operation(ref);
        assert.equal(current.outcome?.disposition, 'RECOVERED', 'FLAT_ACCOUNT_RECOVERY_NOT_CONFIRMED');
        return { transactionHash: current.terminal.transactionHash, calldataSHA256: current.terminal.calldataSHA256 };
      }),
    })),
    privateStatus: () => exclusive(async () => {
      await healthy();
      return { profile: accountProfile, keeperRestart: false, reusableBalanceRollover: false,
        operations: record.data.operations.map(({ prepared: _private, submission, ...entry }) => ({ ...copy(entry),
          submission: submission ? { kind: submission.kind, calldataSHA256: submission.calldataSHA256,
            transactionHash: submission.transactionHash, dispatchLatched: submission.dispatchLatched,
            ownerConfirmed: submission.ownerConfirmed } : null })) };
    }),
    async abort() {
      assert.ok(wrapped || !capturing, 'NATIVE_ACCOUNT_CAPTURE_OWNS_LIFETIME'); cancelled = true;
      abortPromise ??= (async () => {
        activeDeviceOwner?.stop();
        await Promise.allSettled([activeLegacy?.abort(), proofRunner.abort(), nativeExecution?.abort()]);
        await idle;
        return { cancelled: true, retainedEncryptedEvidence: true };
      })();
      return abortPromise;
    },
    async close() {
      assert.ok(wrapped || !capturing || closed, 'NATIVE_ACCOUNT_CAPTURE_OWNS_LIFETIME');
      assert.equal(busy, false, 'FLAT_ACCOUNT_BUSY');
      if (!closed) { await proofRunner.close(); closed = true; password = null; record = null;
        deviceExecutionInstallations.clear();deviceExecutionProviders.clear(); }
      return { closed: true, retainedOwnerCustody: true, retainedRuntimes: true };
    },
  });
  let recoveredDeviceInstallationIssued=false;
  const privateState={ runtime, system, poolIndex, owner, wrapped, closed: () => closed || cancelled || unavailable || (!wrapped && capturing),
    deviceDeposit, deviceReservation,deviceExecution, reorgState, retainReorg, assertReorgPending,
    async checkReorgPending(executor, ref, id) { await healthy(); assertReorgPending(executor, ref, id); },
    installLiveRecovery(row){assert.ok(nativeNote&&!wrapped&&(!recovery||recovery.liveArmed===true)&&nativeExecution!==null&&liveRecovery===null);
      assertDeviceOwnerExecutionBridgeV1(row.bridge,capability);
      if(liveArmedOriginal||recovery?.liveArmed)assertOriginalNativeDeviceLiveArmedObservedClockV1(row.clock,{runtime,nativeRuntime:liveArmedOriginal?.nativeRuntime??row.nativeRuntime});
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
    tickLiveRecovery,armLiveRecovery,
    liveArmedClockCheckpoint(expectedRuntime){assert.ok(recovery?.native&&recovery.liveArmed&&!wrapped);assert.equal(expectedRuntime,runtime);return recovery.record.observedClockSecond;},
    liveRecoveryTerms(bridge,id){return exclusive(async()=>{requireLiveRecovery(bridge);await healthy();const row=reservationRow(id);
      deviceExecutionOriginal(bridge,row);await deviceExecutionPublic(bridge,row);return armPublic(row);});},
    nativeDeviceRecoveredProofs(){return exclusive(async()=>{
      await healthy();assert.ok(recovery?.native&&!wrapped&&recoveredDeviceInstallationIssued,'NATIVE_DEVICE_RECOVERY_ORIGINAL_INSTALLATION_REQUIRED');
      const rows=exitRows();assert.ok(rows.length<=2,'NATIVE_DEVICE_RECOVERY_FIXED_EXIT_COUNT');
      return rows.map(row=>{assert.ok((row.originalPublicProofMetricsFrame||row.originalPublicProofMetrics)&&row.proof&&row.stage!=='PROVING','NATIVE_DEVICE_RECOVERY_ORIGINAL_W39_PENDING');
        assert.equal(row.proofSHA256,byteSHA(Buffer.from(row.proof.proof,'hex')));assert.equal(row.publicInputsSHA256,sha(row.proof.publicInputs));
        return{relation:'withdraw_balance',label:'device-exit-w39',proof:{...copy(row.proof),metrics:row.originalPublicProofMetricsFrame?restoreNativeDeviceOriginalW39MetricsFrameV1(row.originalPublicProofMetricsFrame,row.proof):copy(row.originalPublicProofMetrics)},status:exitPublic(row)};});
    });},
    nativeDeviceRecoveredInstallation(descriptor,providerCustody){return exclusive(async()=>{
      await healthy();assert.ok(recovery?.native&&!wrapped&&nativeExecution!==null,'NATIVE_DEVICE_RECOVERY_NATIVE_ACCOUNT_REQUIRED');
      assert.equal(recoveredDeviceInstallationIssued,false,'NATIVE_DEVICE_RECOVERY_INSTALLATION_ONCE');
      const bindings=recoveredInstallations.filter(value=>sha(value.descriptor)===sha(descriptor));
      assert.equal(bindings.length,1,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PAIRING_REQUIRED');
      const jobs=reservationRows().filter(row=>['origin','pairingId','devicePublicKey'].every(name=>row.consent[name]===descriptor[name]));
      assert.equal(jobs.length,1,'NATIVE_DEVICE_RECOVERY_FIXED_SINGLE_RESERVATION');const row=jobs[0],quote=originalQuote(row.consent.quoteId);
      assert.equal(row.stage,'RESERVED');assert.equal(row.nativeOutcome,'RECOVERED','NATIVE_DEVICE_RECOVERY_ORIGINAL_F_REQUIRED');
      assert.ok(row.nativeTerminal&&row.nativeLatched&&row.nativeRecoveryLatched&&row.submission?.dispatchLatched,'NATIVE_DEVICE_RECOVERY_ORIGINAL_TERMINAL_LATCHES');
      assert.equal(nativeExecution.snapshot(row.jobId).outcome,'RECOVERED');assert.equal(sha(quote.descriptor),sha(descriptor));
      const preparation=validateGenericBalanceNativePreparation(quote.preparation),deposit=reservationSubject(row.consent.depositJobId,row.consent.custody.rootId,descriptor);
      assert.equal(quote.depositJobId,deposit.jobId);assert.equal(quote.rootId,row.consent.custody.rootId);
      assert.equal(row.consent.statement.inputCommitment,deposit.consent.statement.output);assert.equal(row.consent.statement.inputNullifier,deposit.nullifier);
      for(const name of ['scope','policy','asset','hubDomain','registryCommitment'])assert.equal(preparation.config[name],identity.domain[name],'NATIVE_DEVICE_RECOVERY_ORIGINAL_DOMAIN_CHANGED');
      assert.equal(byteSHA(Buffer.from(row.authorization.proof,'hex')),row.proofSHA256);assert.equal(sha(row.authorization.publicInputs),row.publicInputsSHA256);
      assert.deepEqual(row.nativeBinding,flatAccountGraphBinding({authorization:row.authorization,rolePackets:row.rolePackets},identity));
      const providers=bindings[0].providers.map(value=>{assert.equal(value.slot,0);
        assert.equal(sha(nativeRecoveryProviderReviewV1(providerCustody,{runtime,system,poolIndex})),value.custodyIdentitySHA256,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PROVIDER_CHANGED');
        return Object.freeze({slot:0,custody:providerCustody,deliveryRiskSalt:value.deliveryRiskSalt});});assert.equal(providers.length,1);
      await reservationObservation(row);const receipt=await runtime.receipt('0x'+row.nativeTerminal.transactionHash);assert.ok(receipt);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);
      const view=await reader.read();assert.ok(view.ledger.nullifiers.includes('0x'+row.consent.statement.inputNullifier));assert.ok(view.ledger.nullifiers.includes('0x'+row.nativeBinding.reserveNullifier));
      assert.equal(await system.verify('authorization',Buffer.from(row.authorization.proof,'hex'),row.authorization.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),
        view.header.number),true,'NATIVE_DEVICE_RECOVERY_DEPLOYED_U_REJECTED');await reader.assertCurrent(view);continueWork();
      recoveredDeviceInstallationIssued=true;
      return Object.freeze({nativePreparation:preparation,invoiceSignatures:copy(quote.invoiceSignatures),providers:Object.freeze(providers),descriptor:copy(descriptor),
        parentJobId:row.jobId,depositJobId:deposit.jobId,rootId:row.consent.custody.rootId});
    });},

    nativeDeviceLiveArmedInstallation(descriptor,providerCustody){return exclusive(async()=>{
      await healthy();assert.ok(recovery?.native&&recovery.liveArmed&&!wrapped&&nativeExecution!==null,'NATIVE_LIVE_ARMED_ORIGINAL_REOPEN_REQUIRED');
      assert.equal(recoveredDeviceInstallationIssued,false,'NATIVE_DEVICE_RECOVERY_INSTALLATION_ONCE');
      const bindings=recoveredInstallations.filter(value=>sha(value.descriptor)===sha(descriptor));assert.equal(bindings.length,1,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PAIRING_REQUIRED');
      const jobs=reservationRows().filter(row=>['origin','pairingId','devicePublicKey'].every(name=>row.consent[name]===descriptor[name]));
      assert.equal(jobs.length,1,'NATIVE_DEVICE_RECOVERY_FIXED_SINGLE_RESERVATION');const row=jobs[0],arm=row.liveRecoveryArm,quote=originalQuote(row.consent.quoteId);
      assert.equal(row.stage,'RESERVED');
      assert.ok(arm&&['ARMED','FIRING','UNKNOWN','RECOVERED'].includes(arm.state),'NATIVE_LIVE_ARMED_ORIGINAL_PERMISSION_REQUIRED');
      const recovered=arm.state==='RECOVERED';
      if(recovered){assert.equal(row.nativeOutcome,'RECOVERED');assert.ok(row.nativeTerminal&&row.nativeRecoveryLatched&&row.submission?.dispatchLatched,'NATIVE_DEVICE_RECOVERY_ORIGINAL_TERMINAL_LATCHES');}
      else{assert.equal(row.nativeOutcome,null);assert.equal(row.nativeTerminal,null);}
      assert.match(arm.armSHA256,/^[0-9a-f]{64}$/);assert.equal(arm.settleBefore,row.nativeBinding.settleBefore);
      assert.equal(arm.nativeBindingSHA256,sha(row.nativeBinding));assert.equal(arm.reservationTransactionHash,row.observation.transactionHash);
      assert.equal(arm.lossClause,'FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
      if(arm.state!=='ARMED')assert.equal(row.nativeRecoveryLatched,true,'NATIVE_LIVE_ARMED_UNKNOWN_ONLY_OBSERVE');
      assert.equal(nativeExecution.snapshot(row.jobId).outcome,recovered?'RECOVERED':null);assert.equal(sha(quote.descriptor),sha(descriptor));
      const preparation=validateGenericBalanceNativePreparation(quote.preparation),deposit=reservationSubject(row.consent.depositJobId,row.consent.custody.rootId,descriptor);
      assert.equal(quote.depositJobId,deposit.jobId);assert.equal(quote.rootId,row.consent.custody.rootId);
      assert.equal(row.consent.statement.inputCommitment,deposit.consent.statement.output);assert.equal(row.consent.statement.inputNullifier,deposit.nullifier);
      for(const name of ['scope','policy','asset','hubDomain','registryCommitment'])assert.equal(preparation.config[name],identity.domain[name],'NATIVE_DEVICE_RECOVERY_ORIGINAL_DOMAIN_CHANGED');
      assert.equal(byteSHA(Buffer.from(row.authorization.proof,'hex')),row.proofSHA256);assert.equal(sha(row.authorization.publicInputs),row.publicInputsSHA256);
      assert.deepEqual(row.nativeBinding,flatAccountGraphBinding({authorization:row.authorization,rolePackets:row.rolePackets},identity));
      const providers=bindings[0].providers.map(value=>{assert.equal(value.slot,0);
        assert.equal(sha(nativeRecoveryProviderReviewV1(providerCustody,{runtime,system,poolIndex})),value.custodyIdentitySHA256,'NATIVE_DEVICE_RECOVERY_ORIGINAL_PROVIDER_CHANGED');
        return Object.freeze({slot:0,custody:providerCustody,deliveryRiskSalt:value.deliveryRiskSalt});});assert.equal(providers.length,1);
      await reservationObservation(row);
      if(recovered){const receipt=await runtime.receipt('0x'+row.nativeTerminal.transactionHash);assert.ok(receipt);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);}
      const view=await reader.read();assert.ok(view.ledger.nullifiers.includes('0x'+row.consent.statement.inputNullifier));
      assert.equal(view.ledger.nullifiers.includes('0x'+row.nativeBinding.reserveNullifier),recovered,'NATIVE_LIVE_ARMED_TERMINAL_RECONCILE_REQUIRED');
      assert.equal(await system.verify('authorization',Buffer.from(row.authorization.proof,'hex'),row.authorization.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),view.header.number),true,'NATIVE_DEVICE_RECOVERY_DEPLOYED_U_REJECTED');
      await reader.assertCurrent(view);continueWork();recoveredDeviceInstallationIssued=true;
      return Object.freeze({nativePreparation:preparation,invoiceSignatures:copy(quote.invoiceSignatures),providers:Object.freeze(providers),descriptor:copy(descriptor),
        parentJobId:row.jobId,depositJobId:deposit.jobId,rootId:row.consent.custody.rootId,armSHA256:arm.armSHA256,settleBefore:arm.settleBefore,state:arm.state});
    });},

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
        hasNativeExecution: nativeExecution !== null, manualMode: manualKeeper !== null || nativeRecoveryManualMode,
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
 const {consumeWrappedWalletRecoveryPartV1}=await import('../../../../../tests/integration/wallet/wrapped/flows/wrapped-wallet-acceptance-v1.mjs');
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
  const m=await import('../../api/mobile/paired-original-account-actor-v2.mjs');
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
