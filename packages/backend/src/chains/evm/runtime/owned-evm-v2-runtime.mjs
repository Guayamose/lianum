import {EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3,EXTERNAL_DEFI_RECEIVER_PRIVATE_SCHEMA_V3,assertOwnedExternalDefiStateDumpV3,assertOwnedExternalDefiPrivateRecordV3} from './owned-external-defi-receiver-state-v3.mjs';
import {assertOwnedEvmRecoveryStateDumpV1} from './owned-evm-recovery-state-bound-v1.mjs';
import {createNativeEconomicObservedLocalCustodyV2,createNativeEconomicLocalCustodyV2,reopenNativeEconomicLocalCustodyV2,nativeEconomicLocalCustodyPublicV2,checkNativeEconomicLocalCustodyV2,signNativeEconomicCustodyTransactionV2,prepareNativeEconomicCustodySigningV2,consumeNativeEconomicCustodySigningV2,revokeNativeEconomicCustodySigningV2,captureNativeEconomicLocalCustodyV2,closeNativeEconomicLocalCustodyV2,NATIVE_ECONOMIC_ANVIL_PIN_V2} from './native-economic-local-custody-v2.mjs';
import { shouldUseOwnedEvmStateFileV1, writeOwnedEvmStateFileV1, writeOwnedExternalDefiStateFileV3, assertOwnedEvmStateFileV1 } from './owned-evm-state-file-v1.mjs';
import { assertOwnedReceiverPreopenRepairV1, claimOwnedReceiverPreopenRepairV1 } from './owned-evm-preopen-repair-v1.mjs';
export { assertOwnedReceiverPreopenRepairV1 } from './owned-evm-preopen-repair-v1.mjs';
import { observedNativeValueReceiverSecond } from '../../shared/health/native-value-observed-clock-v1.mjs';
/** Flat-owned v2, derived from the unchanged golden local-evm runtime.
 * Trusted harness capability, never an application API. All value is fake.
 * The endpoint, executable, account count and startup arguments are private and
 * fixed here. Only a newly spawned, pinned, loopback Anvil is usable.
 */
import assert from 'node:assert/strict';
import { createHash, ECDH } from 'node:crypto';
import { open, readFile, lstat } from 'node:fs/promises';
import { assertOwnedRecoveryScratchV1, writeInitialNativeCredentialsV1, claimStoppedNativeRecoveryV1, writePrivateRuntimeRecoveryV1, readPrivateRuntimeRecoveryV1, sealStoppedNativeFilesV1, assertStoppedNativeFilesV1, cloneRuntimeRecoveryV1 } from '../../shared/runtime/owned-runtime-recovery-files-v1.mjs';
import { consumeExternalDefiReceiverRepairV1, consumeWrappedRuntimeRecoveryV1, assertNativeEconomicRecoveryCaptureV1, nativeEconomicRecoverySectionIdentityV1, externalDefiReceiverCaptureIdentityV2, consumeExternalDefiReceiverRuntimeSectionV2, deviceExternalFlatReceiverCaptureIdentityV1, consumeDeviceExternalFlatReceiverRuntimeSectionV1 } from '../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { join } from 'node:path';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { linuxRuntimePins } from '../../../../../engine/src/chains/shared/linux-runtime-pins.mjs';
import {
  pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort,
  startOwnProcess, stopOwnProcess, ownedRuntimeRpc, originalOwnedRuntimeRpcFailureV1, sleep,
} from '../../../../../engine/src/chains/shared/runtime-harness.mjs';
import { createOwnedEvmReadBatch } from './owned-evm-read-batch.mjs';
import { POOL_GENERATION_PHASE1_RELEASE, POOL_GENERATION_PHASE2_RELEASE } from '../../../../../../tests/integration/pools/pool-generation-acceptance-policy.mjs';
import { decodePrivateRevert } from '../../../../../engine/src/notes/private-asset-runtime.mjs';
import { OWNED_EVM_NATIVE_VALUE_PROFILE_V1, normalizeOwnedEvmNativeValueIntent,
  OWNED_EVM_NATIVE_VALUE_BASE_PROFILE_V1, OWNED_EVM_NATIVE_VALUE_ARBITRUM_PROFILE_V1, OWNED_EVM_NATIVE_VALUE_BNB_PROFILE_V1,
  normalizeOwnedEvmNativeValueBaseIntent, normalizeOwnedEvmNativeValueArbitrumIntent, normalizeOwnedEvmNativeValueBnbIntent,
  ownedEvmNativeValueAuditCommitments } from '../transfers/owned-evm-native-value-profile.mjs';

export const OWNED_LOCAL_EVM_V2 = 'OWNED_FLAT_LOCAL_EVM_V2';
export const OWNED_LOCAL_EVM_NATIVE_VALUE_V1 = 'OWNED_FLAT_LOCAL_EVM_NATIVE_VALUE_V1';
export const LOCAL_EVM_PROFILE = Object.freeze({
  name: 'PAEG_LOCAL_FAKE_CLOCK_V1', chainId: 31337, hardfork: 'cancun',
  genesisTimestamp: 1_900_000_210, accountCount: 5, accountBalanceWei: '10000000000000000000',
  maxGas: 30_000_000, manualMining: true, publicNetwork: false,
});
// New fixed development profile; historical Cancun/wire/recovery factories stay unchanged.
export const LOCAL_OSAKA_EVM_PROFILE_V1 = Object.freeze({ ...LOCAL_EVM_PROFILE,
  name: 'PAEG_LOCAL_OSAKA_CAPPED_GAS_V1', hardfork: 'osaka', maxGas: 16_777_216,
  blockGas: 30_000_000, enforcedTransactionGasLimit: true,
});
// Additive receiver fixture, separate from every legacy immutable clock/state.
// Actual genesis and every newly mined timestamp are sampled from host walltime;
// this neither changes host time nor relabels Java-Tron's own block timestamps.
export const LOCAL_OBSERVED_RECEIVER_PROFILE_V1=Object.freeze({...LOCAL_EVM_PROFILE,
  name:'PAEG_LOCAL_OBSERVED_WALLCLOCK_RECEIVER_V1',genesisTimestamp:null,
  clockMode:'OBSERVED_WALLCLOCK_SECONDS_V1',publicNetwork:false});
export const LOCAL_OBSERVED_RECEIVER_RELEASE_V1=Object.freeze({format:'REVIEWED_LOCAL_OBSERVED_RECEIVER_SOURCE_V1',
  clockMode:'OBSERVED_WALLCLOCK_SECONDS_V1',localOnly:true,publicNetwork:false,
  acceptedRuntimeEstablished:false,privateNativeCreditEstablished:false});
export function assertLocalObservedReceiverReleaseV1(){
 assert.equal(arguments.length,0,'LOCAL_OBSERVED_RELEASE_NO_OPTIONS');
 assert.ok(LOCAL_OBSERVED_RECEIVER_RELEASE_V1,'LOCAL_OBSERVED_RECEIVER_RELEASE_ABSENT');
 assert.deepEqual(LOCAL_OBSERVED_RECEIVER_RELEASE_V1,{format:'REVIEWED_LOCAL_OBSERVED_RECEIVER_SOURCE_V1',
  clockMode:'OBSERVED_WALLCLOCK_SECONDS_V1',localOnly:true,publicNetwork:false,
  acceptedRuntimeEstablished:false,privateNativeCreditEstablished:false});return true;
}
const observedReceiverClocks=new WeakMap();
export async function createOwnedLocalEvmObservedClockV1(){
  assert.equal(arguments.length,0,'LOCAL_OBSERVED_CLOCK_FIXED_CONSTRUCTOR');
  assertLocalObservedReceiverReleaseV1();
  return createFixedOwnedLocalEvm(LOCAL_OBSERVED_RECEIVER_PROFILE_V1);
}
/** Refresh only this new original receiver. Old factory behavior is unchanged.
 * No caller timestamp/window is accepted, and no Action/proof is rewritten. */
export async function refreshNativeValueReceiverClock(runtime){
  assert.equal(arguments.length,1,'LOCAL_OBSERVED_CLOCK_ARITY');
  assert.ok(ownedRuntimes.has(runtime),'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED');
  const clock=observedReceiverClocks.get(runtime);if(clock){clock.assertAlive();await clock.refresh();}
  return undefined;
}
/** A lower bound for this original receiver's next inclusion, not a permit.
 * No caller time or RPC observation is accepted; legacy manual mining is null. */
export function nativeValueReceiverInclusionSecondV1(runtime){
  assert.equal(arguments.length,1,'LOCAL_OBSERVED_CLOCK_ARITY');
  assert.ok(ownedRuntimes.has(runtime),'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED');
  const clock=observedReceiverClocks.get(runtime);if(!clock)return null;
  clock.assertAlive();return clock.inclusionSecond();
}
export function assertOwnedLocalEvmObservedClockV1(runtime){
  assert.equal(arguments.length,1,'LOCAL_OBSERVED_CLOCK_ARITY');const clock=observedReceiverClocks.get(runtime);
  assert.ok(clock&&ownedRuntimes.has(runtime),'LOCAL_OBSERVED_ORIGINAL_RECEIVER_REQUIRED');clock.assertAlive();return undefined;
}
// A separate fixed synthetic network, never a claim of Ethereum mainnet.
const LOCAL_NATIVE_VALUE_PROCESS_PROFILE = Object.freeze({ ...LOCAL_EVM_PROFILE,
  name: 'LOCAL_SYNTHETIC_EVM_CHAIN_ID_1', chainId: 1, genesisTimestamp: 1_900_000_310 });
// Private descriptor identity is the selector, never a caller chain/profile.
const LOCAL_NATIVE_VALUE_BASE_PROCESS_PROFILE = Object.freeze({ ...LOCAL_EVM_PROFILE,
  name: 'LOCAL_SYNTHETIC_EVM_CHAIN_ID_8453', chainId: 8453, genesisTimestamp: 1_900_000_310 });
const LOCAL_NATIVE_VALUE_ARBITRUM_PROCESS_PROFILE = Object.freeze({ ...LOCAL_EVM_PROFILE,
  name: 'LOCAL_SYNTHETIC_EVM_CHAIN_ID_42161', chainId: 42161, genesisTimestamp: 1_900_000_310 });
const LOCAL_NATIVE_VALUE_BNB_PROCESS_PROFILE = Object.freeze({ ...LOCAL_EVM_PROFILE,
  name: 'LOCAL_SYNTHETIC_EVM_CHAIN_ID_56', chainId: 56, genesisTimestamp: 1_900_000_310 });
const nativeProcessProfiles = new Map([
  [LOCAL_NATIVE_VALUE_PROCESS_PROFILE, Object.freeze({ profile: OWNED_EVM_NATIVE_VALUE_PROFILE_V1, normalize: normalizeOwnedEvmNativeValueIntent, network: 'Ethereum', client: 'Ethereum execution and consensus clients' })],
  [LOCAL_NATIVE_VALUE_BASE_PROCESS_PROFILE, Object.freeze({ profile: OWNED_EVM_NATIVE_VALUE_BASE_PROFILE_V1, normalize: normalizeOwnedEvmNativeValueBaseIntent, network: 'Base', client: 'op-geth and OP Stack derivation/finality' })],
  [LOCAL_NATIVE_VALUE_ARBITRUM_PROCESS_PROFILE, Object.freeze({ profile: OWNED_EVM_NATIVE_VALUE_ARBITRUM_PROFILE_V1, normalize: normalizeOwnedEvmNativeValueArbitrumIntent, network: 'Arbitrum', client: 'Nitro execution, derivation and finality' })],
  [LOCAL_NATIVE_VALUE_BNB_PROCESS_PROFILE, Object.freeze({ profile: OWNED_EVM_NATIVE_VALUE_BNB_PROFILE_V1, normalize: normalizeOwnedEvmNativeValueBnbIntent, network: 'BNB', client: 'BSC execution and validator consensus/finality' })],
]);
// A distinct live profile. It cannot be captured/reopened through Native10.
// Original delivery scopes remain available; only this profile separates its
// already-authorized broadcast from observed-time finality continuation.
const LOCAL_ECONOMIC_OBSERVED_RECEIVER_PROFILE_V2=Object.freeze({...LOCAL_EVM_PROFILE,
  name:'LOCAL_NATIVE_ECONOMIC_OBSERVED_RECEIVER_V2',genesisTimestamp:null});
const LOCAL_ECONOMIC_OBSERVED_GRAPH_PROFILE_V2=Object.freeze({...LOCAL_NATIVE_VALUE_PROCESS_PROFILE,
  name:'LOCAL_NATIVE_ECONOMIC_OBSERVED_GRAPH_V2',genesisTimestamp:null});
nativeProcessProfiles.set(LOCAL_ECONOMIC_OBSERVED_GRAPH_PROFILE_V2,nativeProcessProfiles.get(LOCAL_NATIVE_VALUE_PROCESS_PROFILE));
const NATIVE_ECONOMIC_OBSERVED_RUNTIME_V2=Symbol('ORIGINAL_NATIVE_ECONOMIC_OBSERVED_RUNTIME_V2');
const observedEconomicCustodyRequestsV2=new WeakMap(),observedEconomicRuntimeClocksV2=new WeakMap();
// Only the two fixed runtime factories below mint this private one-use request.
export function consumeNativeEconomicObservedCustodyRequestV2(token){
  assert.equal(arguments.length,1,'ECONOMIC_OBSERVED_CUSTODY_ARITY');
  const input=observedEconomicCustodyRequestsV2.get(token);
  assert.ok(input,'ECONOMIC_OBSERVED_ORIGINAL_CUSTODY_REQUEST');observedEconomicCustodyRequestsV2.delete(token);return input;
}
export async function createOwnedNativeEconomicObservedReceiverV2(){
  assert.equal(arguments.length,0,'ECONOMIC_OBSERVED_FIXED_CONSTRUCTOR');
  return createFixedOwnedLocalEvm(LOCAL_ECONOMIC_OBSERVED_RECEIVER_PROFILE_V2,false,null,NATIVE_ECONOMIC_OBSERVED_RUNTIME_V2);
}
export async function createOwnedNativeEconomicObservedGraphRuntimeV2(){
  assert.equal(arguments.length,0,'ECONOMIC_OBSERVED_FIXED_CONSTRUCTOR');
  return createFixedOwnedLocalEvm(LOCAL_ECONOMIC_OBSERVED_GRAPH_PROFILE_V2,false,null,NATIVE_ECONOMIC_OBSERVED_RUNTIME_V2);
}
/** The receiver/native continuation join is issued here, before any effects.
 * No public bind operation can attach an unrelated chain or caller callback. */
export async function createOwnedNativeEconomicObservedClockPairV2(){
  assert.equal(arguments.length,0,'ECONOMIC_OBSERVED_FIXED_CONSTRUCTOR');let receiver,native;
  try{
    receiver=await createOwnedNativeEconomicObservedReceiverV2();native=await createOwnedNativeEconomicObservedGraphRuntimeV2();
    assertOwnedNativeEconomicObservedReceiverV2(receiver);assertOwnedNativeEconomicObservedGraphRuntimeV2(native);
    const receiverClock=observedEconomicRuntimeClocksV2.get(receiver),nativeClock=observedEconomicRuntimeClocksV2.get(native);
    assert.equal(receiverClock.pairedNative,undefined,'ECONOMIC_OBSERVED_PAIR_ALREADY_BOUND');receiverClock.pairedNative=nativeClock;
    return Object.freeze({runtime:receiver,nativeRuntime:native});
  }catch(error){
    const failures=[];for(const resource of [native,receiver])if(resource)try{await resource.close({removeScratch:false});}catch(cleanup){failures.push(cleanup);}
    if(failures.length)throw new AggregateError([error,...failures],'ECONOMIC_OBSERVED_PAIR_STARTUP_CLEANUP_FAILED',{cause:error});throw error;
  }
}
export function assertOwnedNativeEconomicObservedReceiverV2(runtime){
  assert.equal(arguments.length,1,'ECONOMIC_OBSERVED_CLOCK_ARITY');const clock=observedEconomicRuntimeClocksV2.get(runtime);
  assert.ok(clock?.family==='receiver'&&ownedRuntimes.has(runtime)&&originalEconomicV2Runtimes.has(runtime),'ECONOMIC_OBSERVED_ORIGINAL_RECEIVER');clock.assertAlive();
}
export function assertOwnedNativeEconomicObservedGraphRuntimeV2(runtime){
  assert.equal(arguments.length,1,'ECONOMIC_OBSERVED_CLOCK_ARITY');const clock=observedEconomicRuntimeClocksV2.get(runtime);
  assert.ok(clock?.family==='graphNative'&&ownedNativeValueFamily.has(runtime)&&originalEconomicV2Runtimes.has(runtime),'ECONOMIC_OBSERVED_ORIGINAL_GRAPH');clock.assertAlive();
}
export async function refreshOwnedNativeEconomicObservedGraphClockV2(runtime){
  assert.equal(arguments.length,1,'ECONOMIC_OBSERVED_CLOCK_ARITY');assertOwnedNativeEconomicObservedGraphRuntimeV2(runtime);
  await observedEconomicRuntimeClocksV2.get(runtime).refresh();assertOwnedNativeEconomicObservedGraphRuntimeV2(runtime);
}
const ownedRuntimes = new WeakSet(), ownedNativeValueRuntimes = new WeakSet(), ownedNativeValueFamily = new WeakMap();
const ownedRuntimeGasLimits = new WeakMap(), ownedOsakaGasProbes = new WeakMap();
const nativeSourceOpeners = new WeakMap(), nativeRuntimeLiveness = new WeakMap(), nativeAuditStatesV4 = new WeakMap(), wrappedGraphOperationsV4 = new WeakMap();
let nativeRuntimeSequence = 0n;
/** One fixed negative request, exclusively on its original fresh Osaka node.
 * No options, endpoint, sender, payload or callback can be supplied. */
export async function probeOwnedOsakaTransactionGasRejectionV1(runtime) {
  assert.equal(arguments.length, 1, 'OSAKA_GAS_PROBE_NO_OPTIONS');
  const probe = ownedOsakaGasProbes.get(runtime);
  assert.ok(ownedRuntimes.has(runtime) && probe, 'OSAKA_GAS_PROBE_ORIGINAL_RUNTIME');
  return probe();
}
const NATIVE_ECONOMIC_RUNTIME_V2=Symbol('NEW_NATIVE_ECONOMIC_RUNTIME_V2'),originalEconomicV2Runtimes=new WeakSet();
const EXTERNAL_DEFI_RECEIVER_RUNTIME_V3=Symbol('ORIGINAL_EXTERNAL_DEFI_RECEIVER_RUNTIME_V3');
const originalExternalDefiReceiverV2=new WeakSet(),originalExternalDefiReceiverCapturesV2=new WeakMap();
const DEVICE_EXTERNAL_FLAT_RECEIVER_RUNTIME_V1=Symbol('ORIGINAL_DEVICE_EXTERNAL_FLAT_RECEIVER_RUNTIME_V1');
const originalDeviceExternalFlatReceiversV1=new WeakSet(),originalDeviceExternalFlatReceiverCapturesV1=new WeakMap();
const originalEvmRecoveryCapturesV1 = new WeakMap(),originalEvmRetentionArmsV1=new WeakMap(),originalEvmEconomicFencesV1=new WeakMap();
export async function armOwnedEvmRecoveryRetentionV1(runtime){assert.equal(arguments.length,1);assert.ok(ownedRuntimes.has(runtime)||ownedNativeValueFamily.has(runtime),'EVM_RETENTION_ORIGINAL_RUNTIME');const arm=originalEvmRetentionArmsV1.get(runtime);assert.ok(arm,'EVM_RETENTION_FIXED_FAMILY');return arm();}
export async function captureOwnedEvmRecoveryV1(runtime) {
  assert.equal(arguments.length,1);assert.ok(ownedRuntimes.has(runtime)||ownedNativeValueFamily.has(runtime),'EVM_RECOVERY_ORIGINAL_RUNTIME');
  assert.ok(!originalEconomicV2Runtimes.has(runtime),'EVM_ECONOMIC_V2_DISTINCT_ISSUER_REQUIRED');
  const capture=originalEvmRecoveryCapturesV1.get(runtime);assert.ok(capture,'EVM_RECOVERY_FIXED_FAMILY');return capture();
}
export async function reopenOwnedReceiverRecoveryV1(token) {
  assert.equal(arguments.length,1);const record=consumeWrappedRuntimeRecoveryV1(token,'receiver');
  return createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,record,true);
}
/** Only the native OBSERVE issuer's distinct one-use token enters here.
 * The recovered runtime remains private to its read-only service. */
export async function reopenOwnedNativeD26ObservationReceiverV1(token) {
  assert.equal(arguments.length,1);
  const {consumeNativeD26ObservationSectionV1}=await import('../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  const record=consumeNativeD26ObservationSectionV1(token,'receiver');
  return createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,record,true);
}
/** Distinct economic-native issuer; OBSERVE-only/wrapped tokens cannot enter. */
export async function reopenOwnedNativeEconomicReceiverV1(token){
  assert.equal(arguments.length,1);
  const {consumeNativeEconomicRecoverySectionV1}=await import('../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  const record=consumeNativeEconomicRecoverySectionV1(token,'receiver');
  assert.ok(['OWNED_FIXED_EVM_CAPTURE_V1','OWNED_FIXED_EVM_CAPTURE_V2'].includes(record.schema),'EVM_ECONOMIC_FIXED_CAPTURE_SCHEMA');
  return createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,record,record.schema==='OWNED_FIXED_EVM_CAPTURE_V2'?NATIVE_ECONOMIC_RUNTIME_V2:true);
}
/** Only the finite External5 issuer can reconstitute this same V2 receiver.
 * A legacy/native economic token or a serialized record cannot select it. */
export async function reopenOwnedExternalDefiReceiverV2(token){
  assert.equal(arguments.length,1);const record=consumeExternalDefiReceiverRuntimeSectionV2(token);
  assert.ok([EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3,'OWNED_FIXED_EVM_CAPTURE_V2'].includes(record.schema));assert.equal(record.family,'receiver');
  const runtime=await createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,record,record.schema===EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3?EXTERNAL_DEFI_RECEIVER_RUNTIME_V3:NATIVE_ECONOMIC_RUNTIME_V2);
  originalExternalDefiReceiverV2.add(runtime);return runtime;
}
/** Only the separate ordered device issuer's original one-use section is
 * accepted. The byte codec is V3; its External5 identity is never adopted. */
export async function reopenOwnedDeviceExternalFlatReceiverV1(token){
  assert.equal(arguments.length,1);const record=consumeDeviceExternalFlatReceiverRuntimeSectionV1(token);
  assert.equal(record.schema,EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3,'DEVICE_EXTERNAL_FLAT_RECEIVER_FIXED_V3');assert.equal(record.family,'receiver');
  const runtime=await createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,record,DEVICE_EXTERNAL_FLAT_RECEIVER_RUNTIME_V1);
  originalDeviceExternalFlatReceiversV1.add(runtime);return runtime;
}
export async function reopenOwnedNativeEconomicGraphRuntimeV1(token){
  assert.equal(arguments.length,1);
  const {consumeNativeEconomicRecoverySectionV1}=await import('../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  const record=consumeNativeEconomicRecoverySectionV1(token,'graphNative');
  assert.ok(['OWNED_FIXED_EVM_CAPTURE_V1','OWNED_FIXED_EVM_CAPTURE_V2'].includes(record.schema),'EVM_ECONOMIC_FIXED_CAPTURE_SCHEMA');
  return createFixedOwnedLocalEvm(LOCAL_NATIVE_VALUE_PROCESS_PROFILE,false,record,record.schema==='OWNED_FIXED_EVM_CAPTURE_V2'?NATIVE_ECONOMIC_RUNTIME_V2:true);
}
export async function reopenOwnedReceiverPreopenRepairV1(token) {
  assert.equal(arguments.length,1);
  const {record,repair}=consumeExternalDefiReceiverRepairV1(token);
  return createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,record,true,repair);
}
export async function reopenOwnedGraphNativeRecoveryV1(token) {
  assert.equal(arguments.length,1);const record=consumeWrappedRuntimeRecoveryV1(token,'graphNative');
  return createFixedOwnedLocalEvm(LOCAL_NATIVE_VALUE_PROCESS_PROFILE,false,record,true);
}

/** Narrow fixed-family join. The original object, private process closure and
 * fresh health observation are required. Metadata/genesis copies grant nothing.
 * The old V1 predicate below deliberately remains chain-1-only. */
export const isOwnedLocalEvmNativeValueRuntime = runtime => ownedNativeValueFamily.has(runtime);
export async function assertOwnedLocalEvmNativeValueRuntime(runtime) {
  assert.equal(arguments.length, 1, 'OWNED_NATIVE_VALUE_FIXED_RUNTIME_ASSERTION');
  assert.ok(ownedNativeValueFamily.has(runtime), 'OWNED_NATIVE_VALUE_ORIGINAL_RUNTIME_REQUIRED');
  return runtime.health();
}
/** Synchronous original brand/process/close fence for the final key boundary.
 * This grants no replacement for a preceding complete async health check. */
export function assertOwnedLocalEvmNativeValueRuntimeLive(runtime) {
  assert.equal(arguments.length, 1, 'OWNED_NATIVE_VALUE_FIXED_RUNTIME_ASSERTION');
  const alive = nativeRuntimeLiveness.get(runtime);
  assert.ok(ownedNativeValueFamily.has(runtime) && alive, 'OWNED_NATIVE_VALUE_ORIGINAL_RUNTIME_REQUIRED');
  alive();
}
/** Fixed synchronous private-state reader. It observes the original physical
 * native-value runtime only; no caller clock, callback, snapshot or registration. */
export function readOwnedLocalEvmNativeValueAuditStateV4(runtime) {
  assert.equal(arguments.length, 1, 'WRAPPED_GRAPH_NATIVE_STATE_ARITY');
  assertOwnedLocalEvmNativeValueRuntimeLive(runtime);
  const read = nativeAuditStatesV4.get(runtime);
  assert.ok(read, 'WRAPPED_GRAPH_NATIVE_ORIGINAL_STATE_REQUIRED');
  return read();
}
/** Read-only view of one currently active original wrapped GRAPH operation.
 * Only dispatchNativeValueV1 can issue it. Caller phase/runtime substitutions
 * cannot create, advance or reopen an operation. */
export function readOwnedEvmWrappedGraphOperationV4(token, runtime, request) {
  assert.equal(arguments.length, 3, 'WRAPPED_GRAPH_OPERATION_ARITY');
  const state = wrappedGraphOperationsV4.get(token);
  assert.ok(state && state.runtime === runtime && state.request === request, 'WRAPPED_GRAPH_ORIGINAL_NATIVE_OPERATION_REQUIRED');
  return state.read();
}
/** Read-only audit identity, not a bearer capability or provider registration.
 * Same-genesis instances remain distinct and cannot exchange dispatch scopes. */
export function ownedLocalEvmNativeValueRuntimeIdentity(runtime) {
  assert.equal(arguments.length, 1, 'OWNED_NATIVE_VALUE_FIXED_RUNTIME_ASSERTION');
  const identity = ownedNativeValueFamily.get(runtime);
  assert.ok(identity, 'OWNED_NATIVE_VALUE_ORIGINAL_RUNTIME_REQUIRED');
  return identity;
}
/** Internal token-only read opener. Tokens are issued only inside the fixed
 * local-source module. No method, endpoint, transport or callback is accepted. */
export async function openOwnedLocalEvmNativeValueSource(runtime, request) {
  assert.equal(arguments.length, 2, 'OWNED_NATIVE_SOURCE_FIXED_OPENER');
  assert.ok(ownedNativeValueFamily.has(runtime), 'OWNED_NATIVE_VALUE_ORIGINAL_RUNTIME_REQUIRED');
  const { consumeOwnedEvmNativeSourceRequest } = await import('../health/owned-evm-native-value-health-source-v4.mjs');
  const sourceIndex = consumeOwnedEvmNativeSourceRequest(request, runtime);
  return nativeSourceOpeners.get(runtime)(sourceIndex);
}
export const isOwnedLocalEvmNativeValueV1 = runtime => ownedNativeValueRuntimes.has(runtime);
export async function assertOwnedLocalEvmNativeValueV1(runtime) {
  assert.ok(ownedNativeValueRuntimes.has(runtime), 'OWNED_NATIVE_VALUE_ORIGINAL_RUNTIME_REQUIRED');
  return runtime.health();
}
const poolGenerationControls = new WeakMap();
export const isOwnedLocalEvmV2 = runtime => ownedRuntimes.has(runtime);
/** Fixed launcher value, authenticated by the original private ownership map. */
export function ownedLocalEvmTransactionGasLimit(runtime) {
  assert.equal(arguments.length, 1);
  assert.ok(ownedRuntimes.has(runtime) && ownedRuntimeGasLimits.has(runtime), 'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED');
  return ownedRuntimeGasLimits.get(runtime);
}
const hex = value => `0x${BigInt(value).toString(16)}`;
const address = value => { assert.match(value, /^0x[0-9a-f]{40}$/i, 'LOCAL_EVM_ADDRESS'); return value.toLowerCase(); };
const bytes = value => { assert.match(value, /^0x(?:[0-9a-f]{2})*$/i, 'LOCAL_EVM_BYTES'); return value.toLowerCase(); };
const quantity = value => { assert.match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/i, 'LOCAL_EVM_QUANTITY'); return value; };
const blockTag = value => value === 'latest' ? value : quantity(value);
function uint(value, bits = 256) {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0), 'LOCAL_EVM_SAFE_INTEGER');
  assert.ok(['number', 'bigint', 'string'].includes(typeof value), 'LOCAL_EVM_INTEGER');
  if (typeof value === 'string') assert.match(value, /^(?:0|[1-9][0-9]*|0x[0-9a-f]+)$/i, 'LOCAL_EVM_INTEGER');
  const n = BigInt(value); assert.ok(n >= 0n && n < (1n << BigInt(bits)), 'LOCAL_EVM_INTEGER_RANGE'); return n;
}

// Canonical legacy EIP-155 transactions. Public verification only: SEC 1
// ECDSA public-key recovery on secp256k1, with OpenSSL point decompression.
// No private scalar, key import, ECDSA signing or alternate signature scheme.
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const FIELD = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const GENERATOR = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const sha = raw => createHash('sha256').update(raw).digest('hex');
const keccak = raw => publicKeccak256(raw);
const freeze = value => {
  if (value && typeof value === 'object') { for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); }
  return value;
};
const cloned = value => freeze(structuredClone(value));
const mod = (value, modulus) => (value % modulus + modulus) % modulus;
function inverse(value, modulus) {
  let [a, b, x, y] = [mod(value, modulus), modulus, 1n, 0n];
  assert.notEqual(a, 0n, 'EVM_SIGNATURE_ZERO_INVERSE');
  while (b) { const q = a / b; [a, b] = [b, a - q * b]; [x, y] = [y, x - q * y]; }
  assert.equal(a, 1n, 'EVM_SIGNATURE_INVERSE'); return mod(x, modulus);
}
function addPoint(p, q) {
  if (p === null) return q; if (q === null) return p;
  if (p[0] === q[0] && mod(p[1] + q[1], FIELD) === 0n) return null;
  const slope = p[0] === q[0] ? mod(3n * p[0] * p[0] * inverse(2n * p[1], FIELD), FIELD)
    : mod((q[1] - p[1]) * inverse(q[0] - p[0], FIELD), FIELD);
  const x = mod(slope * slope - p[0] - q[0], FIELD);
  return [x, mod(slope * (p[0] - x) - p[1], FIELD)];
}
function multiplyPoint(p, scalar) {
  let result = null, factor = p;
  for (let n = scalar; n > 0n; n >>= 1n) { if (n & 1n) result = addPoint(result, factor); factor = addPoint(factor, factor); }
  return result;
}
function recoverSender(hash, r, s, parity) {
  assert.ok(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'EVM_SIGNATURE_LOW_S');
  // Ethereum's v encodes only parity (recovery x = r), not x-overflow.
  const compressed = Buffer.from((parity ? '03' : '02') + r.toString(16).padStart(64, '0'), 'hex');
  const point = ECDH.convertKey(compressed, 'secp256k1', undefined, undefined, 'uncompressed');
  const R = [BigInt('0x' + point.subarray(1, 33).toString('hex')), BigInt('0x' + point.subarray(33).toString('hex'))];
  assert.equal(multiplyPoint(R, ORDER), null, 'EVM_SIGNATURE_POINT_ORDER');
  const z = BigInt('0x' + hash.toString('hex'));
  const Q = multiplyPoint(addPoint(multiplyPoint(R, s), multiplyPoint(GENERATOR, mod(-z, ORDER))), inverse(r, ORDER));
  assert.ok(Q, 'EVM_SIGNATURE_INFINITY');
  const check = addPoint(multiplyPoint(GENERATOR, mod(z * inverse(s, ORDER), ORDER)),
    multiplyPoint(Q, mod(r * inverse(s, ORDER), ORDER)));
  assert.ok(check && mod(check[0], ORDER) === r, 'EVM_SIGNATURE_INVALID');
  const uncompressed = Buffer.from('04' + Q.map(n => n.toString(16).padStart(64, '0')).join(''), 'hex');
  assert.deepEqual(ECDH.convertKey(uncompressed, 'secp256k1', undefined, undefined, 'uncompressed'), uncompressed,
    'EVM_SIGNATURE_PUBLIC_KEY');
  return '0x' + keccak(uncompressed.subarray(1)).subarray(12).toString('hex');
}
/** Public-only recovery primitive for independent standard ECDSA test vectors.
 * Digest/r/s are exact bare 32-byte hex; parity is 0 or 1. Never signs. */
export function recoverSecp256k1Sender({ digest, r, s, parity }) {
  for (const value of [digest, r, s]) assert.match(value, /^[0-9a-f]{64}$/, 'EVM_SIGNATURE_HEX');
  assert.ok(parity === 0 || parity === 1, 'EVM_SIGNATURE_PARITY');
  return recoverSender(Buffer.from(digest, 'hex'), BigInt('0x' + r), BigInt('0x' + s), parity);
}
function integerBytes(number) {
  const n = uint(number); if (n === 0n) return Buffer.alloc(0);
  let raw = n.toString(16); if (raw.length % 2) raw = '0' + raw; return Buffer.from(raw, 'hex');
}
function rlpLength(length, offset) {
  if (length < 56) return Buffer.from([offset + length]);
  const raw = integerBytes(length); return Buffer.concat([Buffer.from([offset + 55 + raw.length]), raw]);
}
function encodeRlp(value) {
  if (Array.isArray(value)) { const body = Buffer.concat(value.map(encodeRlp)); return Buffer.concat([rlpLength(body.length, 0xc0), body]); }
  if (value.length === 1 && value[0] < 0x80) return value;
  return Buffer.concat([rlpLength(value.length, 0x80), value]);
}
function decodeRlp(raw) {
  let position = 0;
  const read = (end, depth) => {
    assert.ok(position < end && depth <= 1, 'EVM_RLP_STRUCTURE');
    const first = raw[position++]; if (first < 0x80) return Buffer.from([first]);
    const list = first >= 0xc0, offset = list ? 0xc0 : 0x80;
    let length = first - offset;
    if (length > 55) {
      const lengthBytes = length - 55;
      assert.ok(lengthBytes <= 4 && position + lengthBytes <= end && raw[position] !== 0, 'EVM_RLP_LENGTH');
      length = Number(BigInt('0x' + raw.subarray(position, position + lengthBytes).toString('hex')));
      position += lengthBytes; assert.ok(length >= 56, 'EVM_RLP_NONCANONICAL_LENGTH');
    }
    assert.ok(position + length <= end, 'EVM_RLP_TRUNCATED'); const boundary = position + length;
    if (!list) { const body = raw.subarray(position, boundary); position = boundary;
      assert.ok(length !== 1 || body[0] >= 0x80, 'EVM_RLP_NONCANONICAL_STRING'); return body; }
    const values = []; while (position < boundary) values.push(read(boundary, depth + 1)); return values;
  };
  const decoded = read(raw.length, 0); assert.equal(position, raw.length, 'EVM_RLP_TRAILING');
  assert.deepEqual(encodeRlp(decoded), raw, 'EVM_RLP_CANONICAL'); return decoded;
}
function decodeInteger(raw) {
  assert.ok(Buffer.isBuffer(raw) && raw.length <= 32 && (raw.length === 0 || raw[0] !== 0), 'EVM_RLP_INTEGER');
  return raw.length ? BigInt('0x' + raw.toString('hex')) : 0n;
}
const unsignedFields = tx => [integerBytes(tx.nonce), integerBytes(tx.gasPrice), integerBytes(tx.gas),
  Buffer.from(tx.to?.slice(2) ?? '', 'hex'), integerBytes(tx.value), Buffer.from(tx.data.slice(2), 'hex'),
  integerBytes(tx.chainId), Buffer.alloc(0), Buffer.alloc(0)];
/** Pure canonical signing preimage for the exact prepared dispatch fields. */
export function encodeCanonicalEvmUnsignedTransaction(expected) {
  assert.ok(expected && Object.getPrototypeOf(expected) === Object.prototype, 'EVM_EXPECTED_TRANSACTION_FIELDS');
  const names = ['chainId', 'data', 'from', 'gas', 'gasPrice', 'nonce', 'to', 'value'];
  assert.deepEqual(Reflect.ownKeys(expected).sort(), names);
  for (const name of names) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(expected, name) ?? {}, 'value'),
    'EVM_EXPECTED_TRANSACTION_FIELDS');
  for (const name of ['chainId', 'gas', 'gasPrice', 'nonce', 'value']) {
    const value = expected[name];
    assert.ok(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value
      && BigInt(value).toString() === value && BigInt(value) < 1n << 256n, 'EVM_EXPECTED_TRANSACTION_INTEGER');
  }
  assert.ok(BigInt(expected.chainId) > 0n && BigInt(expected.gas) > 0n, 'EVM_EXPECTED_TRANSACTION_INTEGER');
  for (const name of ['from', 'to']) assert.ok(typeof expected[name] === 'string' && expected[name].length === 42
    && /^0x[0-9a-f]{40}$/.exec(expected[name])?.[0] === expected[name], 'EVM_EXPECTED_TRANSACTION_ADDRESS');
  assert.ok(typeof expected.data === 'string' && expected.data.length <= 262146
    && /^0x(?:[0-9a-f]{2})*$/.exec(expected.data)?.[0] === expected.data, 'EVM_EXPECTED_TRANSACTION_DATA');
  return '0x' + encodeRlp(unsignedFields(expected)).toString('hex');
}
/** Pure read-only canonical wire verifier, also used by receipt observers.
 * Supports only replay-protected legacy transactions with low-S signatures.
 */
export function decodeCanonicalEvmTransaction(rawHex) {
  assert.equal(typeof rawHex, 'string', 'EVM_WIRE_BYTES');
  assert.ok(/^0x[0-9a-f]+$/.exec(rawHex)?.[0] === rawHex && rawHex.length % 2 === 0 && rawHex.length <= 262_146, 'EVM_WIRE_BYTES');
  const raw = Buffer.from(rawHex.slice(2), 'hex'), values = decodeRlp(raw);
  assert.ok(Array.isArray(values) && values.length === 9 && values.every(Buffer.isBuffer), 'EVM_LEGACY_TRANSACTION');
  const [nonce, gasPrice, gas] = values.slice(0, 3).map(decodeInteger);
  assert.ok(values[3].length === 0 || values[3].length === 20, 'EVM_WIRE_TARGET');
  const value = decodeInteger(values[4]), v = decodeInteger(values[6]), r = decodeInteger(values[7]), s = decodeInteger(values[8]);
  assert.ok(v >= 37n, 'EVM_REPLAY_PROTECTION_REQUIRED');
  const chainId = (v - 35n) / 2n, parity = Number((v - 35n) % 2n);
  const tx = { chainId: chainId.toString(), nonce: nonce.toString(), gasPrice: gasPrice.toString(), gas: gas.toString(),
    to: values[3].length ? '0x' + values[3].toString('hex') : null, value: value.toString(), data: '0x' + values[5].toString('hex') };
  const unsignedWire = '0x' + encodeRlp(unsignedFields(tx)).toString('hex');
  const from = recoverSender(keccak(Buffer.from(unsignedWire.slice(2), 'hex')), r, s, parity);
  return freeze({ ...tx, from, unsignedWire, nativeId: '0x' + keccak(raw).toString('hex'),
    transactionSHA256: sha(raw), nativeWire: rawHex });
}
export function assertSignedEvmTransaction(rawHex, expected) {
  const signed = decodeCanonicalEvmTransaction(rawHex);
  assert.deepEqual(Object.keys(expected).sort(), ['chainId', 'data', 'from', 'gas', 'gasPrice', 'nonce', 'to', 'value'].sort(),
    'EVM_EXPECTED_TRANSACTION_FIELDS');
  for (const [name, value] of Object.entries(expected)) assert.equal(signed[name], value, 'EVM_SIGNED_' + name.toUpperCase());
  return signed;
}

export async function assertOwnedLocalEvmV2(runtime) {
  assert.ok(ownedRuntimes.has(runtime), 'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED');
  return runtime.health();
}

/** No options: caller URLs, keys, paths, existing endpoints and argv are refused.
 * close() stops this child but retains its scratch directory by default;
 * close({removeScratch:true}) or abort() explicitly remove only owned scratch.
 * An assertion after successful startup never silently destroys evidence.
 */
export async function createOwnedLocalEvmV2() {
  assert.equal(arguments.length, 0, 'LOCAL_EVM_FIXED_CONSTRUCTOR');
  return createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE);
}
/** New zero-options development lifetime, explicit Osaka plus EIP-7825 enforcement. */
export async function createOwnedLocalEvmOsakaV1() {
  assert.equal(arguments.length, 0, 'LOCAL_EVM_FIXED_CONSTRUCTOR');
  return createFixedOwnedLocalEvm(LOCAL_OSAKA_EVM_PROFILE_V1);
}
/** No options, caller endpoints, keys, chain overrides, or existing runtimes.
 * Uses chain ID 1 in a TEST-ONLY loopback fixture with its own observed genesis.
 * This factory is NOT an Ethereum mainnet provider or a generic signing API. */
export async function createOwnedLocalEvmNativeValueV1() {
  assert.equal(arguments.length, 0, 'OWNED_NATIVE_VALUE_FIXED_CONSTRUCTOR');
  return createFixedOwnedLocalEvm(LOCAL_NATIVE_VALUE_PROCESS_PROFILE);
}
/** Fixed synthetic Base wire fixture, not an OP Stack/op-geth runtime. */
export async function createOwnedLocalEvmNativeValueBaseV1() {
  assert.equal(arguments.length, 0, 'OWNED_NATIVE_VALUE_FIXED_CONSTRUCTOR');
  return createFixedOwnedLocalEvm(LOCAL_NATIVE_VALUE_BASE_PROCESS_PROFILE);
}
/** Fixed synthetic Arbitrum wire fixture, not a Nitro runtime. */
export async function createOwnedLocalEvmNativeValueArbitrumV1() {
  assert.equal(arguments.length, 0, 'OWNED_NATIVE_VALUE_FIXED_CONSTRUCTOR');
  return createFixedOwnedLocalEvm(LOCAL_NATIVE_VALUE_ARBITRUM_PROCESS_PROFILE);
}
/** Fixed synthetic BNB wire fixture, not a BSC runtime. */
export async function createOwnedLocalEvmNativeValueBnbV1() {
  assert.equal(arguments.length, 0, 'OWNED_NATIVE_VALUE_FIXED_CONSTRUCTOR');
  return createFixedOwnedLocalEvm(LOCAL_NATIVE_VALUE_BNB_PROCESS_PROFILE);
}
/** Fixed acceptance-only constructor, using the ORIGINAL launcher and private
 * ownership map. No runtime/account/endpoint, mock or brand can be supplied. */
export async function createOwnedLocalEvmV2PoolGenerationAcceptance() {
  assert.equal(arguments.length, 0, 'POOL_GENERATION_NO_RUNTIME_OPTIONS');
  assert.ok(POOL_GENERATION_PHASE1_RELEASE || POOL_GENERATION_PHASE2_RELEASE,
    'POOL_GENERATION_RUNTIME_NOT_RELEASED');
  return createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE, true);
}
export function ownedPoolGenerationTransportControls(runtime) {
  assert.equal(arguments.length, 1, 'POOL_GENERATION_CONTROL_ARGUMENTS');
  const controls = poolGenerationControls.get(runtime);
  assert.ok(ownedRuntimes.has(runtime) && controls, 'POOL_GENERATION_ORIGINAL_RUNTIME_REQUIRED');
  return controls;
}
export const recoveryAnvilPinV1=Object.freeze(['foundry-private-input-v1/anvil','1a6f12c989138147661773ecdd77896f1241ec4369d34ca7a3f2c88b5cc23ad6']);
// New local lifetimes only; historical legacy runtime pins never change.
export async function createOwnedRecoverableReceiverV1(){assert.equal(arguments.length,0);return createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,null,true);}
export async function createOwnedRecoverableGraphNativeV1(){assert.equal(arguments.length,0);return createFixedOwnedLocalEvm(LOCAL_NATIVE_VALUE_PROCESS_PROFILE,false,null,true);}
/** New lifetimes only: official Anvil, five AEAD local keys before startup,
 * no server signer/seed adoption and no conversion of an already funded node. */
export async function createOwnedNativeEconomicReceiverV2(){assert.equal(arguments.length,0);return createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,null,NATIVE_ECONOMIC_RUNTIME_V2);}
export async function createOwnedNativeEconomicGraphRuntimeV2(){assert.equal(arguments.length,0);return createFixedOwnedLocalEvm(LOCAL_NATIVE_VALUE_PROCESS_PROFILE,false,null,NATIVE_ECONOMIC_RUNTIME_V2);}
/** New External5 lifetimes only. The five original AEAD keys/genesis are
 * retained before this object is returned and before its first CREATE/send. */
export async function createOwnedExternalDefiReceiverV2(){
  assert.equal(arguments.length,0);const runtime=await createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,null,EXTERNAL_DEFI_RECEIVER_RUNTIME_V3);
  originalExternalDefiReceiverV2.add(runtime);
  try{await armOwnedEvmRecoveryRetentionV1(runtime);return runtime;}
  catch(error){try{await runtime.close();}catch(cleanup){throw new AggregateError([error,cleanup],'EXTERNAL_RECEIVER_INITIAL_RETENTION_FAILED',{cause:error});}throw error;}
}
export function assertOwnedExternalDefiReceiverV2(runtime){
  assert.equal(arguments.length,1);assert.ok(originalExternalDefiReceiverV2.has(runtime),'EXTERNAL_RECEIVER_ORIGINAL_V2_REQUIRED');
  const state=originalExternalDefiReceiverCapturesV2.get(runtime);assert.ok(state,'EXTERNAL_RECEIVER_ORIGINAL_V2_REQUIRED');state.preflight();
}
export function captureOwnedExternalDefiReceiverV2(runtime,token){
  assert.equal(arguments.length,2);assert.ok(originalExternalDefiReceiverV2.has(runtime),'EXTERNAL_RECEIVER_ORIGINAL_V2_REQUIRED');
  return originalExternalDefiReceiverCapturesV2.get(runtime).capture(token);
}
export async function abortOwnedExternalDefiReceiverCaptureV2(runtime,token){
  assert.equal(arguments.length,2);assert.ok(originalExternalDefiReceiverV2.has(runtime),'EXTERNAL_RECEIVER_ORIGINAL_V2_REQUIRED');
  return originalExternalDefiReceiverCapturesV2.get(runtime).abort(token);
}
/** New ordered-observation lifetimes only; original five-key AEAD custody
 * and public genesis are retained before return and before the first CREATE. */
export async function createOwnedDeviceExternalFlatReceiverV1(){
  assert.equal(arguments.length,0);const runtime=await createFixedOwnedLocalEvm(LOCAL_EVM_PROFILE,false,null,DEVICE_EXTERNAL_FLAT_RECEIVER_RUNTIME_V1);
  originalDeviceExternalFlatReceiversV1.add(runtime);
  try{await armOwnedEvmRecoveryRetentionV1(runtime);return runtime;}
  catch(error){try{await runtime.close();}catch(cleanup){throw new AggregateError([error,cleanup],'DEVICE_EXTERNAL_FLAT_RECEIVER_INITIAL_RETENTION_FAILED',{cause:error});}throw error;}
}
export function assertOwnedDeviceExternalFlatReceiverV1(runtime){
  assert.equal(arguments.length,1);assert.ok(originalDeviceExternalFlatReceiversV1.has(runtime),'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_REQUIRED');
  const state=originalDeviceExternalFlatReceiverCapturesV1.get(runtime);assert.ok(state,'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_REQUIRED');state.preflight();
}
export function captureOwnedDeviceExternalFlatReceiverV1(runtime,token){
  assert.equal(arguments.length,2);assert.ok(originalDeviceExternalFlatReceiversV1.has(runtime),'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_REQUIRED');
  return originalDeviceExternalFlatReceiverCapturesV1.get(runtime).capture(token);
}
export async function abortOwnedDeviceExternalFlatReceiverCaptureV1(runtime,token){
  assert.equal(arguments.length,2);assert.ok(originalDeviceExternalFlatReceiversV1.has(runtime),'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_REQUIRED');
  return originalDeviceExternalFlatReceiverCapturesV1.get(runtime).abort(token);
}
export function isOwnedNativeEconomicRuntimeV2(runtime){assert.equal(arguments.length,1);return originalEconomicV2Runtimes.has(runtime);}
async function createFixedOwnedLocalEvm(processProfile, poolGenerationAcceptance = false, recovery = null, recoveryAdmitted = false, preopenRepair = null) {
  assert.ok(!poolGenerationAcceptance || processProfile === LOCAL_EVM_PROFILE, 'POOL_GENERATION_NATIVE_PROFILE_INCOMPATIBLE');
  const nativeDescriptor = nativeProcessProfiles.get(processProfile);
  const externalDefiV3=recoveryAdmitted===EXTERNAL_DEFI_RECEIVER_RUNTIME_V3;
  assert.ok(!externalDefiV3||processProfile===LOCAL_EVM_PROFILE&&!poolGenerationAcceptance&&!preopenRepair,'EXTERNAL_RECEIVER_V3_FIXED_FACTORY');
  const deviceExternalFlatV1=recoveryAdmitted===DEVICE_EXTERNAL_FLAT_RECEIVER_RUNTIME_V1;
  assert.ok(!deviceExternalFlatV1||processProfile===LOCAL_EVM_PROFILE&&!poolGenerationAcceptance&&!preopenRepair,'DEVICE_EXTERNAL_FLAT_RECEIVER_FIXED_FACTORY');
  const receiverRecoveryV3=externalDefiV3||deviceExternalFlatV1;
  const observedEconomicV2=recoveryAdmitted===NATIVE_ECONOMIC_OBSERVED_RUNTIME_V2;
  const observedClock=processProfile===LOCAL_OBSERVED_RECEIVER_PROFILE_V1||processProfile===LOCAL_ECONOMIC_OBSERVED_RECEIVER_PROFILE_V2||processProfile===LOCAL_ECONOMIC_OBSERVED_GRAPH_PROFILE_V2;
  const osaka=processProfile===LOCAL_OSAKA_EVM_PROFILE_V1;
  assert.ok(processProfile === LOCAL_EVM_PROFILE || nativeDescriptor || observedClock || osaka, 'LOCAL_EVM_PRIVATE_FIXED_PROFILE');
  const nativeValueOnly = Boolean(nativeDescriptor), nativeValueProfile = nativeDescriptor?.profile;
  const chainQuantity = hex(processProfile.chainId);

  assert.equal(process.platform, 'linux', 'LOCAL_EVM_LINUX_ONLY');
  assert.ok(!recoveryAdmitted||(!poolGenerationAcceptance&&(observedEconomicV2?recovery===null&&(processProfile===LOCAL_ECONOMIC_OBSERVED_RECEIVER_PROFILE_V2||processProfile===LOCAL_ECONOMIC_OBSERVED_GRAPH_PROFILE_V2):!observedClock&&(processProfile===LOCAL_EVM_PROFILE||processProfile===LOCAL_NATIVE_VALUE_PROCESS_PROFILE))),'EVM_PRIVATE_INPUT_FIXED_PROFILE');
  const economicV2=recoveryAdmitted===NATIVE_ECONOMIC_RUNTIME_V2||observedEconomicV2||receiverRecoveryV3;
  const runtimePin=economicV2?NATIVE_ECONOMIC_ANVIL_PIN_V2:recoveryAdmitted?recoveryAnvilPinV1:linuxRuntimePins.anvil;
  const binary = await pinnedBinary(...runtimePin);
  const recoveryFamily=nativeValueOnly?'graphNative':'receiver',recoveryPrefix=economicV2?(nativeValueOnly?'flat-economic-native-v2-':'flat-economic-receiver-v2-'):(nativeValueOnly?'flat-owned-evm-native-value-v1-':'flat-owned-evm-v2-');
  let restored=null;
  if(recovery){
    assert.ok(recoveryAdmitted===true||economicV2,'EVM_RECOVERY_PRIVATE_INPUT_ADMISSION_REQUIRED');
    assert.ok(!poolGenerationAcceptance&&!observedClock&&(processProfile===LOCAL_EVM_PROFILE||processProfile===LOCAL_NATIVE_VALUE_PROCESS_PROFILE));
    assert.equal(recovery.schema,receiverRecoveryV3?EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3:economicV2?'OWNED_FIXED_EVM_CAPTURE_V2':'OWNED_FIXED_EVM_CAPTURE_V1');assert.equal(recovery.family,recoveryFamily);assert.equal(recovery.terminal.ownedProcessStopped,true);assert.equal(recovery.terminal.forced,false);
    await assertOwnedRecoveryScratchV1(recovery.cwd,recoveryPrefix);if(preopenRepair)await assertOwnedReceiverPreopenRepairV1({record:recovery,repair:preopenRepair});else await assertStoppedNativeFilesV1(recovery.cwd,recovery.files);
    restored=await readPrivateRuntimeRecoveryV1(recovery.cwd,recovery.privateRecord);assert.equal(restored.schema,receiverRecoveryV3?EXTERNAL_DEFI_RECEIVER_PRIVATE_SCHEMA_V3:economicV2?'OWNED_FIXED_EVM_PRIVATE_RECOVERY_V2':'OWNED_FIXED_EVM_PRIVATE_RECOVERY_V1');if(receiverRecoveryV3)assertOwnedExternalDefiPrivateRecordV3(restored);assert.equal(restored.family,recoveryFamily);assert.equal(restored.cwd,recovery.cwd);assert.deepEqual(restored.runtimePin,runtimePin);assert.equal(restored.profile,processProfile.name);assert.equal(restored.processGeneration,recovery.processGeneration,'NATIVE_RECOVERY_GENERATION_MISMATCH');if(preopenRepair)await claimOwnedReceiverPreopenRepairV1({record:recovery,repair:preopenRepair});else await claimStoppedNativeRecoveryV1(recovery.cwd,recovery);
  }
  const cwd = restored?restored.cwd:await scratchDirectory(recoveryPrefix);
  let initialPrivateRecord=null,stateFilePin=null,localCustody=null,localCustodyPublic=null;
  const recoverySuffix=String(restored?restored.processGeneration+1:0)+(preopenRepair?'-repair-'+preopenRepair.repairOrdinal:'');
  let economicRecoveryFence=null;
  let recoveryCapturing=false,recoveryRetained=Boolean(restored),recoveryRpcActive=0,recoveryCaptureResult=null,recoveryCapture=null;
  const processGeneration=restored?restored.processGeneration+1:0;
  assert.ok(Number.isSafeInteger(processGeneration)&&processGeneration>=0&&processGeneration<16,'EVM_RECOVERY_GENERATION_BOUND');
  let handle, exitEvent = null, spawnError = null, closed = false, removed = false;
  let busy = false, uncertainMutation = false, uncertainSignedHash = null, accounts, genesisHash, lastTimestamp;
  let observedFinalityV2=null,observedNativeAttemptV2=null;
  // Read-only epoch for exact-original native ingress send permission. Every
  // owned EVM mutation/reconciliation claims it before its first await.
  let ingressMutationEpoch = 0n;
  let nativeReadGenerationV4 = 0n, nativeActiveReadsV4 = 0;
  const wrappedGraphObservationsV4 = new WeakMap();
  async function auditNativeReadV4(work) {
    nativeReadGenerationV4++; nativeActiveReadsV4++;
    try { return await work(); }
    finally { nativeActiveReadsV4--; nativeReadGenerationV4++; }
  }
  let closePromise, removePromise, readBatch;
  const receipts = [], transactions = [], lifecycle = [];
  const nativeSourceLifetime = new AbortController();
  // A bounded transport fault after a genuine successful registration. The
  // target is derived from the original pin/CREATE/register sends, never input.
  let successorPin = null, successorCreated = null, successorRegistered = null;
  let withholdAck = false, ackArmedOnce = false, withheldAck = false, successorReadsUnavailable = false;
  let readsWithheldOnce = false, readsRestoredOnce = false;
  const selector = name => '0x' + publicKeccak256(Buffer.from(name)).subarray(0, 4).toString('hex');
  const pinSelector = selector('pinSuccessorPool((address,address,bytes32,bytes32,bytes32,bytes32,bytes32))');
  const registerSelector = selector('registerPoolDomain(address)');
  const processStatus = () => ({
    pid: handle?.child.pid ?? null,
    exitObserved: exitEvent !== null,
    exitCode: exitEvent?.code ?? handle?.child.exitCode ?? null,
    signal: exitEvent?.signal ?? handle?.child.signalCode ?? null,
    spawnErrorCode: spawnError?.code ?? null,
    stopped: Boolean(exitEvent || spawnError),
    scratchRemoved: removed,
  });
  const assertAlive = () => {
    assert.ok(!closed && !recoveryCapturing && handle && !spawnError && !exitEvent && handle.child.signalCode === null, 'LOCAL_EVM_PROCESS_NOT_RUNNING');
    handle.assertAlive();
  };
  const close = async (options = {}) => {
    assert.deepEqual(Object.keys(options).filter(key => key !== 'removeScratch'), [], 'LOCAL_EVM_CLOSE_OPTIONS');
    assert.ok(!economicRecoveryFence||recoveryCapturing,'EVM_ECONOMIC_CAPTURE_OWNS_LIFETIME');
    if(recoveryRetained&&!recoveryCapturing&&recoveryCapture){try{await recoveryCapture();return processStatus();}catch(error){recoveryCapturing=true;try{await close(options);}catch(cleanup){throw new AggregateError([error,cleanup],'EVM_RECOVERY_CAPTURE_AND_STOP_FAILED');}throw error;}}
    const removeScratch = options.removeScratch ?? false;
    assert.equal(typeof removeScratch, 'boolean', 'LOCAL_EVM_CLEANUP_BOOLEAN');
    if (!closePromise) closePromise = (async () => {
      closed = true; nativeSourceLifetime.abort(new Error('LOCAL_EVM_PROCESS_NOT_RUNNING')); readBatch?.close();
      if(localCustody)closeNativeEconomicLocalCustodyV2(localCustody);
      if (handle) {
        const result = await stopOwnProcess(handle);
        // The ChildProcess exit event/exitCode/signalCode is evidence of exit.
        // No ps scan, missing PID or inferred absence is used.
        assert.ok(exitEvent || spawnError || handle.child.exitCode !== null || handle.child.signalCode !== null, 'LOCAL_EVM_EXIT_NOT_OBSERVED');
        lifecycle.push({ event: 'stopped-owned-process', ...result, ...processStatus() });
      }
      // Stop cancels original reads/waits first; drain that same continuation
      // before removing scratch, without inferring success or sending again.
      if(observedFinalityV2?.work)await observedFinalityV2.work;
    })();
    await closePromise;
    if (removeScratch && !removed && !recoveryRetained) {
      removePromise ??= (async () => { await removeOwnScratch(cwd); removed = true; })();
      await removePromise;
    }
    return processStatus();
  };
  try {
    const port = await unusedLoopbackPort();
    const walletConfigPath=join(cwd,'anvil-private-config.json');
    if(!restored&&!economicV2){const privateFile=await open(walletConfigPath,'wx',0o600);await privateFile.close();}
    let observedEconomicGenesisTimestamp=null;
    if(observedEconomicV2)observedEconomicGenesisTimestamp=Number(observedNativeValueReceiverSecond('0',String(Date.now())));
    if(economicV2){
      if(observedEconomicV2){
        const token=Object.freeze(Object.create(null));
        observedEconomicCustodyRequestsV2.set(token,Object.freeze({cwd,family:recoveryFamily,
          profile:Object.freeze({...processProfile,genesisTimestamp:observedEconomicGenesisTimestamp})}));
        try{localCustody=await createNativeEconomicObservedLocalCustodyV2(token);}
        finally{observedEconomicCustodyRequestsV2.delete(token);}
      }else localCustody=restored?await reopenNativeEconomicLocalCustodyV2({cwd,family:recoveryFamily,profile:processProfile},recovery.localCustody):await createNativeEconomicLocalCustodyV2({cwd,family:recoveryFamily,profile:processProfile});
      localCustodyPublic=nativeEconomicLocalCustodyPublicV2(localCustody);
      if(restored){assert.deepEqual(localCustodyPublic.accounts,restored.accounts,'EVM_ECONOMIC_RETAINED_KEYS');assert.equal(localCustodyPublic.commitment,restored.localCustodyCommitment,'EVM_ECONOMIC_RETAINED_CUSTODY_COMMITMENT');}
      initialPrivateRecord={schema:'OWNED_NATIVE_AEAD_INITIAL_RETENTION_V2',custodyCommitment:localCustodyPublic.commitment,genesis:localCustodyPublic.genesis};
    }
    const genesisTimestamp=observedEconomicV2?observedEconomicGenesisTimestamp:observedClock?Number(observedNativeValueReceiverSecond('0',String(Date.now()))):processProfile.genesisTimestamp;
    let mnemonicArgs=['--mnemonic-random','12'];
    if(restored&&!economicV2){
      assert.ok(typeof restored.mnemonic==='string'&&/^[a-z]+(?: [a-z]+){11}$/.test(restored.mnemonic),'EVM_RECOVERY_PRIVATE_MNEMONIC');
      const mnemonicPath=join(cwd,'reopen-mnemonic-'+recoverySuffix+'.txt');
      const file=await open(mnemonicPath,'wx',0o600);
      try{await file.writeFile(restored.mnemonic+'\n');await file.sync();const st=await file.stat();assert.ok(st.isFile()&&st.nlink===1&&(st.mode&0o777)===0o600,'EVM_PRIVATE_MNEMONIC_FILE');}finally{await file.close();}
      const parent=await open(cwd,'r');try{await parent.sync();}finally{await parent.close();}
      mnemonicArgs=['--mnemonic-file',mnemonicPath];
    }
    if(restored&&(economicV2||shouldUseOwnedEvmStateFileV1(restored.stateDump)))stateFilePin=receiverRecoveryV3?await writeOwnedExternalDefiStateFileV3({cwd,suffix:recoverySuffix,stateDump:restored.stateDump}):await writeOwnedEvmStateFileV1({cwd,suffix:recoverySuffix,stateDump:restored.stateDump});
    handle = startOwnProcess(binary, [
      '--host', '127.0.0.1', '--port', String(port), '--chain-id', String(processProfile.chainId),
      '--hardfork', processProfile.hardfork, '--timestamp', String(genesisTimestamp),
      // Official Anvil rejects --init together with --load-state. A V2
      // successor loads the exact captured chain, then verifies its original
      // genesis/history/accounts/receipts below; initial V2 uses the public genesis.
      ...(economicV2?['--accounts','0',...(restored?['--load-state',stateFilePin.path]:['--init',localCustodyPublic.genesis.path])]:['--accounts', '5', '--balance', '10', ...mnemonicArgs, '--config-out', walletConfigPath]),
      '--quiet', '--no-cors', '--no-mining', '--gas-limit', String(osaka ? processProfile.blockGas : processProfile.maxGas),
      ...(osaka ? ['--enable-tx-gas-limit'] : []),
      ...(stateFilePin&&!economicV2?['--load-state',stateFilePin.path]:[]),
    ], cwd);
    handle.child.once('exit', (code, signal) => { exitEvent = { code, signal }; nativeSourceLifetime.abort(new Error('LOCAL_EVM_PROCESS_NOT_RUNNING')); readBatch?.close(new Error('LOCAL_EVM_PROCESS_NOT_RUNNING')); });
    handle.child.once('error', error => { spawnError = error; nativeSourceLifetime.abort(error); readBatch?.close(new Error('LOCAL_EVM_PROCESS_NOT_RUNNING')); });
    const endpoint = `http://127.0.0.1:${port}`;
    assert.match(endpoint, /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/, 'OWNED_RPC_REQUIRES_LOOPBACK');
    readBatch = createOwnedEvmReadBatch({ assertAlive,
      postBatch: (body, signal) => fetch(endpoint, { method: 'POST', redirect: 'error', signal,
        headers: { 'Content-Type': 'application/json' }, body }),
    });
    const untrackedRpc = async (method, params = []) => {
      assertAlive();recoveryRpcActive++;
      try {
      const target = method === 'eth_call' ? params[0]?.to : method === 'eth_getCode' ? params[0] : null;
      if (poolGenerationAcceptance && successorReadsUnavailable && target === successorRegistered?.pool)
        throw new Error('POOL_GENERATION_SUCCESSOR_TRANSPORT_UNAVAILABLE');
      if (readBatch.supports(method)) { const result = await readBatch.read(method, params); assertAlive(); return result; }
      const result = await ownedRuntimeRpc(endpoint, method, params, { timeoutMs: 30_000 });
      assertAlive(); return result;
      } finally { recoveryRpcActive--; }
    };
    const rpc = nativeValueOnly ? (method, params = []) => auditNativeReadV4(() => untrackedRpc(method, params)) : untrackedRpc;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assertAlive();
      try { ready = await rpc('eth_chainId') === chainQuantity; if (ready) break; } catch { assertAlive(); }
      await sleep(100);
    }
    assert.ok(ready, 'LOCAL_EVM_STARTUP_TIMEOUT');
    assert.equal(await rpc('eth_blockNumber'), stateFilePin?restored.head.number:'0x0', 'LOCAL_EVM_INITIAL_HEAD');
    if(stateFilePin)await assertOwnedEvmStateFileV1(stateFilePin);
    const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
    assert.equal(genesis?.number, '0x0', 'LOCAL_EVM_GENESIS');
    assert.deepEqual(genesis.transactions, [], 'LOCAL_EVM_GENESIS_TRANSACTIONS');
    assert.match(genesis.hash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_GENESIS_HASH');
    assert.equal(BigInt(genesis.timestamp), BigInt(genesisTimestamp), 'LOCAL_EVM_GENESIS_TIME');
    genesisHash = genesis.hash; lastTimestamp = BigInt(genesis.timestamp);
    const serverAccounts=(await rpc('eth_accounts')).map(address);
    if(economicV2)assert.deepEqual(serverAccounts,[],'EVM_ECONOMIC_NO_SERVER_SIGNERS');
    accounts = Object.freeze(economicV2?[...localCustodyPublic.accounts]:serverAccounts);
    assert.equal(accounts.length, processProfile.accountCount, 'LOCAL_EVM_ACCOUNT_COUNT');
    assert.equal(new Set(accounts).size, accounts.length, 'LOCAL_EVM_ACCOUNT_UNIQUENESS');
    for (const account of accounts) {
      assert.equal(await rpc('eth_getTransactionCount', [account, stateFilePin?'0x0':'latest']), '0x0', 'LOCAL_EVM_FRESH_NONCE');
      assert.equal(BigInt(await rpc('eth_getBalance', [account, stateFilePin?'0x0':'latest'])), BigInt(processProfile.accountBalanceWei), 'LOCAL_EVM_FAKE_BALANCE');
      assert.equal(await rpc('eth_getCode', [account, stateFilePin?'0x0':'latest']), '0x', 'LOCAL_EVM_FRESH_ACCOUNT_CODE');
    }
    if(!restored&&!economicV2&&!poolGenerationAcceptance&&(processProfile===LOCAL_EVM_PROFILE||processProfile===LOCAL_NATIVE_VALUE_PROCESS_PROFILE)){
      const st=await lstat(walletConfigPath);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<16384);assert.equal(st.mode&0o777,0o600);
      const wallet=JSON.parse(await readFile(walletConfigPath,'utf8'));assert.deepEqual(wallet.available_accounts.map(address),accounts);
      initialPrivateRecord=await writeInitialNativeCredentialsV1(cwd,recoveryFamily,{schema:'OWNED_FIXED_EVM_INITIAL_CREDENTIALS_V1',family:recoveryFamily,profile:processProfile.name,runtimePin:[...runtimePin],accounts:[...accounts],mnemonic:wallet.wallet?.mnemonic});
    }
    if(restored){
      assert.equal(genesisHash,restored.genesisHash,'EVM_RECOVERY_GENESIS');assert.deepEqual(accounts,restored.accounts,'EVM_RECOVERY_ACCOUNTS');
      if(!stateFilePin)assert.equal(await rpc('anvil_loadState',[restored.stateDump]),true,'EVM_RECOVERY_LOAD_REJECTED');
      assert.deepEqual(await rpc('eth_getBlockByNumber',['0x0',false]),restored.genesisHeader,'EVM_RECOVERY_GENESIS_HEADER');
      assert.deepEqual(await rpc('eth_getBlockByNumber',['latest',false]),restored.head,'EVM_RECOVERY_HEAD');
      for(const row of restored.accountState){assert.equal(await rpc('eth_getBalance',[row.address,'latest']),row.balance);assert.equal(await rpc('eth_getTransactionCount',[row.address,'latest']),row.nonce);assert.equal(await rpc('eth_getCode',[row.address,'latest']),row.code);}
      assert.ok(Array.isArray(restored.transactions)&&restored.transactions.length<=512);transactions.push(...cloneRuntimeRecoveryV1(restored.transactions));
      for(const row of restored.receipts){const entry=transactions.find(x=>x.transactionHash===row.transactionHash);assert.deepEqual(entry,row);receipts.push(entry);assert.deepEqual(await rpc('eth_getTransactionReceipt',[row.transactionHash]),row.receipt,'EVM_RECOVERY_RECEIPT');}
      for(const row of transactions)if(row.transactionHash&&row.receipt)assert.equal((await rpc('eth_getBlockByNumber',[row.receipt.blockNumber,false])).hash,row.receipt.blockHash,'EVM_RECOVERY_CANONICAL');
      lifecycle.push(...cloneRuntimeRecoveryV1(restored.lifecycle));uncertainMutation=restored.uncertainMutation;uncertainSignedHash=restored.uncertainSignedHash;
      ingressMutationEpoch=BigInt(restored.ingressMutationEpoch)+1n;lastTimestamp=BigInt(restored.lastTimestamp);
      assert.equal(BigInt(restored.head.timestamp),lastTimestamp,'EVM_RECOVERY_NATIVE_CLOCK');
      lifecycle.push({event:'reopened-original-retained-state',processGeneration,originalProcessId:restored.originalProcessId,processId:handle.child.pid,originalHead:restored.head.hash});
    }
    const health = async () => {
      assertAlive();
      // Independent identity reads share one bounded batch turn. Every started
      // read settles before failure returns, including native read accounting.
      const settled = await Promise.allSettled([
        ['eth_chainId', []], ['eth_getBlockByNumber', ['0x0', false]], ['eth_accounts', []],
      ].map(async ([method, params]) => rpc(method, params)));
      // Consume in original order after drainage, so an earlier identity
      // contradiction still precedes any later transport rejection.
      const value = i => { const result = settled[i]; if (result.status === 'rejected') throw result.reason; return result.value; };
      assert.equal(value(0), chainQuantity, 'LOCAL_EVM_CHAIN_CHANGED');
      assert.equal(value(1)?.hash, genesisHash, 'LOCAL_EVM_GENESIS_CHANGED');
      assert.deepEqual(value(2).map(address), economicV2?[]:accounts, 'LOCAL_EVM_ACCOUNTS_CHANGED');
      if(economicV2)assert.deepEqual(await checkNativeEconomicLocalCustodyV2(localCustody),localCustodyPublic,'EVM_ECONOMIC_AUTHENTICATED_LOCAL_KEYS');
      return { ...processStatus(), chainId: String(processProfile.chainId), genesisHash };
    };
    const block = async (tag = 'latest') => {
      const header = await rpc('eth_getBlockByNumber', [blockTag(tag), false]);
      assert.ok(header?.hash && header.number, 'LOCAL_EVM_BLOCK_NOT_FOUND'); return header;
    };
    const assertCanonical = async snapshot => {
      const number = snapshot.blockNumber ?? snapshot.number, hash = snapshot.blockHash ?? snapshot.hash;
      assert.match(hash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_BLOCK_HASH');
      const header = await block(quantity(number));
      assert.equal(header.hash, hash, 'LOCAL_EVM_CANONICAL_BLOCK_CHANGED'); return header;
    };
    const checkReceipt = async receipt => {
      assert.match(receipt?.transactionHash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_RECEIPT_HASH');
      assert.ok(['0x0', '0x1'].includes(receipt.status), 'LOCAL_EVM_RECEIPT_STATUS');
      const authoritative = await rpc('eth_getTransactionReceipt', [receipt.transactionHash]);
      assert.deepEqual(receipt, authoritative, 'LOCAL_EVM_RECEIPT_CHANGED');
      const header = await assertCanonical(receipt);
      const index = BigInt(quantity(receipt.transactionIndex));
      assert.ok(index < BigInt(header.transactions.length), 'LOCAL_EVM_RECEIPT_INDEX');
      assert.equal(header.transactions[Number(index)], receipt.transactionHash, 'LOCAL_EVM_RECEIPT_TRANSACTION');
      return receipt;
    };
    const receipt = async hash => {
      assert.match(hash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_TRANSACTION_HASH');
      const result = await rpc('eth_getTransactionReceipt', [hash]);
      return result === null ? null : checkReceipt(result);
    };
    const transaction = async hash => {
      assert.match(hash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_TRANSACTION_HASH');
      // A read-only reconciliation seam for this runtime's original sends.
      // It never discovers another sender, signs, mines or retries a broadcast.
      assert.ok(transactions.some(entry => entry.transactionHash === hash),
        'LOCAL_EVM_TRANSACTION_NOT_OWNED');
      const result = await rpc('eth_getTransactionByHash', [hash]);
      if (result === null) return null;
      assert.equal(result.hash, hash, 'LOCAL_EVM_TRANSACTION_HASH_CHANGED');
      assert.ok(accounts.includes(address(result.from)), 'LOCAL_EVM_TRANSACTION_SENDER_CHANGED');
      const retained = transactions.find(entry => entry.transactionHash === hash && entry.signed);
      if (retained) {
        const expected = retained.prepared.transaction;
        for (const name of ['chainId', 'nonce', 'gasPrice', 'gas', 'value'])
          assert.equal(BigInt(result[name]).toString(), expected[name], 'EVM_OBSERVED_' + name.toUpperCase());
        for (const name of ['from', 'to']) assert.equal(result[name].toLowerCase(), expected[name], 'EVM_OBSERVED_' + name.toUpperCase());
        assert.equal(result.input, expected.data, 'EVM_OBSERVED_CALLDATA');
      }
      if (result.blockHash !== null) await assertCanonical(result);
      return result;
    };
    const request = (transaction, sending) => {
      assert.ok(transaction && typeof transaction === 'object' && !Array.isArray(transaction), 'LOCAL_EVM_TRANSACTION');
      assert.ok(Object.keys(transaction).every(key => ['from', 'to', 'data', 'gas', 'value'].includes(key)), 'LOCAL_EVM_TRANSACTION_FIELDS');
      const tx = { from: accounts[0], gas: hex(processProfile.maxGas), ...transaction };
      tx.from = address(tx.from); assert.ok(accounts.includes(tx.from), 'LOCAL_EVM_SENDER_NOT_OWNED');
      if (tx.to !== undefined) tx.to = address(tx.to);
      if (tx.data !== undefined) tx.data = bytes(tx.data);
      const gas = uint(tx.gas); assert.ok(gas > 0n && gas <= BigInt(processProfile.maxGas), 'LOCAL_EVM_GAS_LIMIT'); tx.gas = hex(gas);
      if (tx.value !== undefined) tx.value = hex(uint(tx.value));
      if (!sending) assert.ok(tx.to !== undefined, 'LOCAL_EVM_CALL_REQUIRES_TO');
      return tx;
    };
    const mutate = async operation => {
      assert.equal(economicRecoveryFence,null,'EVM_ECONOMIC_CAPTURE_FENCED_MUTATION');
      assert.ok(!busy, 'LOCAL_EVM_CONCURRENT_MUTATION');
      assert.ok(!observedFinalityV2||observedFinalityV2.completed,'ECONOMIC_OBSERVED_ORIGINAL_FINALITY_PENDING');
      assert.ok(!uncertainMutation, 'LOCAL_EVM_UNCERTAIN_MUTATION_REQUIRES_RECONCILIATION');
      busy = true; ingressMutationEpoch++; try { await health(); return await operation(); } finally { busy = false; }
    };
    const mineAt = async timestamp => {
      const before = await block();
      assert.equal(BigInt(before.timestamp), lastTimestamp, 'LOCAL_EVM_UNCONTROLLED_TIME');
      assert.ok(timestamp > lastTimestamp && timestamp <= BigInt(Number.MAX_SAFE_INTEGER), 'LOCAL_EVM_MONOTONIC_TIME');
      if(observedClock)assert.ok(timestamp<=BigInt(Math.floor(Date.now()/1000)),'LOCAL_OBSERVED_CLOCK_FUTURE_REJECTED');
      await rpc('evm_setNextBlockTimestamp', [Number(timestamp)]);
      await rpc('evm_mine');
      const after = await block();
      assert.equal(BigInt(after.number), BigInt(before.number) + 1n, 'LOCAL_EVM_UNCONTROLLED_MINING');
      assert.equal(BigInt(after.timestamp), timestamp, 'LOCAL_EVM_MINED_TIMESTAMP');
      lastTimestamp = timestamp; return after;
    };
    const observedInclusionSecond=()=>{
      assertAlive();
      const now=observedNativeValueReceiverSecond(lastTimestamp.toString(),String(Date.now()));
      // Equality requires the next actual second, exactly as nextObservedSecond.
      // This does not wait, mine, refresh an authorization or promise inclusion.
      return now>lastTimestamp?now:lastTimestamp+1n;
    };
    // Fixed wait for a genuinely observed later second. Never infer approval
    // from elapsed time; this changes only the new synthetic ledger's block time.
    const nextObservedSecond=async()=>{
      assert.ok(observedClock,'LOCAL_OBSERVED_CLOCK_ONLY');
      // New live economic waits alone have a fixed monotonic outer budget.
      // The legacy observed/manual profiles retain their original behavior.
      const started=observedEconomicV2?performance.now():null;
      const waitGuard=()=>{if(observedEconomicV2){assertAlive();const elapsed=performance.now()-started;
        assert.ok(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<120000,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_TIMEOUT');}};
      waitGuard();let now=observedNativeValueReceiverSecond(lastTimestamp.toString(),String(Date.now()));
      while(now===lastTimestamp){await new Promise(resolve=>setTimeout(resolve,25));assertAlive();waitGuard();
        now=observedNativeValueReceiverSecond(lastTimestamp.toString(),String(Date.now()));}
      waitGuard();return now;
    };
    const refreshObservedClock=async()=>{
      const paired=observedEconomicV2&&!nativeValueOnly?observedEconomicRuntimeClocksV2.get(runtime)?.pairedNative:null;
      // The original zero-option pair factory alone can install this join.
      // Drain its SAME already-submitted operation before the graph adapter's
      // unchanged full-facts observation; neither classification nor a DTO does.
      if(paired?.pendingFinality()){await paired.refresh();assertAlive();}
      // Waiting is not a new send permit. The original private continuation
      // owns this same chain until its exact signed transaction is finalized.
      if(observedEconomicV2&&nativeValueOnly&&observedFinalityV2&&!observedFinalityV2.completed){
        await observedFinalityV2.work;assertAlive();
        assert.ok(observedFinalityV2.completed,'ECONOMIC_OBSERVED_ORIGINAL_FINALITY_UNRESOLVED');
      }
      return mutate(async()=>{
      const now=observedNativeValueReceiverSecond(lastTimestamp.toString(),String(Date.now()));
      if(now===lastTimestamp)return;
      try{await mineAt(now);lifecycle.push({event:'observed-wallclock-refresh',timestamp:now.toString(),intentWindowsChanged:false});}
      catch(error){uncertainMutation=true;throw error;}
    });};
    const sendInternal = async (label, transaction, expectedStatus = '0x1', expectedRevert, externalNoteScope = null) => {
      assert.equal(typeof label, 'string', 'LOCAL_EVM_TRANSACTION_LABEL');
      assert.ok(['0x0', '0x1'].includes(expectedStatus), 'LOCAL_EVM_EXPECTED_STATUS');
      const tx = request(transaction, true);
      return mutate(async () => {
        const entry = { label, request: tx, senderNonce: await rpc('eth_getTransactionCount', [tx.from, 'pending']), phase: 'before-broadcast' };
        transactions.push(entry);
        let confirmed;
        try {
          // Legacy trusted setup send only; NEVER the gated delivery boundary.
          // Never retry broadcasts. A lost response is an ambiguous write.
          entry.phase = 'broadcast-result-unknown';
          if(economicV2){
            const gasPrice=await rpc('eth_gasPrice'),nonce=await rpc('eth_getTransactionCount',[tx.from,'pending']);
            assert.equal(nonce,entry.senderNonce,'EVM_ECONOMIC_SETUP_NONCE_CHANGED');
            assert.equal(await rpc('eth_getTransactionCount',[tx.from,'latest']),nonce,'EVM_ECONOMIC_SETUP_EXCLUSIVE_NONCE');
            const expected={chainId:String(processProfile.chainId),from:tx.from,to:tx.to??null,nonce:BigInt(nonce).toString(),gas:BigInt(tx.gas).toString(),gasPrice:BigInt(gasPrice).toString(),value:BigInt(tx.value??'0x0').toString(),data:tx.data??'0x'};
            let signed;
            if(externalNoteScope){
              // Private original source-note producer only. All I/O needed to
              // prepare the signing lease precedes the last permission guard.
              const prepared=Object.freeze({transaction:Object.freeze(expected)});
              const lease=await prepareNativeEconomicCustodySigningV2(localCustody,prepared);
              try{await externalNoteScope.beforeKey(expected);externalNoteScope.assertBeforeKey(expected);assertAlive();
                signed=consumeNativeEconomicCustodySigningV2(localCustody,lease,prepared);}
              finally{revokeNativeEconomicCustodySigningV2(lease);}
            }else signed=await signNativeEconomicCustodyTransactionV2(localCustody,expected);
            assertSignedEvmTransaction(signed.nativeWire,expected);entry.localSigned=cloned({...signed,expected});
            entry.transactionHash=signed.nativeId;
            if(externalNoteScope){await externalNoteScope.onSigned(signed,expected);
              await externalNoteScope.beforeBroadcast(expected);externalNoteScope.assertBeforeBroadcast(expected);assertAlive();}
            // Exact signed bytes and nonce are retained before the one broadcast.
            assert.equal(await rpc('eth_sendRawTransaction',[signed.nativeWire]),signed.nativeId,'EVM_ECONOMIC_SETUP_TRANSACTION_HASH');
          }else entry.transactionHash = await rpc('eth_sendTransaction', [tx]);
          entry.phase = 'broadcast';
          await mineAt(observedClock?await nextObservedSecond():lastTimestamp + 1n);
          confirmed = await receipt(entry.transactionHash);
          assert.ok(confirmed, 'LOCAL_EVM_RECEIPT_MISSING_AFTER_MINE');
        } catch (error) {
          uncertainMutation = true; error.transactionRecord = cloned(entry); throw error;
        }
        entry.receipt = confirmed; entry.phase = 'mined';
        entry.gasUsed = BigInt(confirmed.gasUsed).toString(); receipts.push(entry);
        if (confirmed.status === '0x0') {
          const trace = await rpc('debug_traceTransaction', [entry.transactionHash, { disableMemory: true, disableStack: true, disableStorage: true }]);
          entry.trace = { failed: trace.failed, gas: trace.gas, returnValue: trace.returnValue };
          assert.equal(trace.failed, true, 'LOCAL_EVM_REVERT_TRACE');
          entry.revert = decodePrivateRevert(trace.returnValue);
        }
        assert.equal(confirmed.status, expectedStatus, label);
        if (expectedRevert !== undefined) {
          assert.ok(entry.revert, 'LOCAL_EVM_EXPECTED_REVERT');
          if (/^0x[0-9a-f]{8}$/i.test(expectedRevert)) assert.equal(entry.revert.selector, expectedRevert.toLowerCase(), label);
          else assert.equal(entry.revert.reason, expectedRevert, label);
        }
        if (poolGenerationAcceptance && confirmed.status === '0x1') {
          if (label === 'pin exact prospective append-only pool') {
            assert.equal(successorPin, null, 'POOL_GENERATION_ONE_SUCCESSOR_ONLY');
            assert.equal(tx.data.slice(0, 10), pinSelector);
            assert.equal(tx.data.length, 10 + 7 * 64);
            successorPin = { hub: tx.to, pool: '0x' + tx.data.slice(34, 74), from: tx.from };
          } else if (label === 'deploy exact append-only successor pool') {
            assert.ok(successorPin && successorCreated === null);
            assert.equal(confirmed.contractAddress?.toLowerCase(), successorPin.pool);
            assert.equal(tx.from, successorPin.from); assert.equal(tx.to, undefined);
            successorCreated = successorPin.pool;
          } else if (label === 'register exact append-only successor domain') {
            assert.ok(successorPin && successorCreated === successorPin.pool && successorRegistered === null);
            assert.equal(tx.to, successorPin.hub); assert.equal(tx.from, successorPin.from);
            assert.equal(tx.data, registerSelector + successorPin.pool.slice(2).padStart(64, '0'));
            successorRegistered = Object.freeze({ ...successorPin, transactionHash: confirmed.transactionHash });
            if (withholdAck) {
              withholdAck = false; withheldAck = true; entry.acceptanceAcknowledgementWithheld = true;
              // The original node and receipt remain authoritative. Only this
              // caller acknowledgement is lost, so the factory retains/fences.
              throw new Error('POOL_GENERATION_WITHHELD_REGISTRATION_ACK');
            }
          }
        }
        return cloned(confirmed);
      });
    };
    // The legacy public port has no scope argument; extra caller data cannot
    // install a signing callback or bypass the private request consumer.
    const send=(label,transaction,expectedStatus='0x1',expectedRevert)=>sendInternal(label,transaction,expectedStatus,expectedRevert,null);
    const dispatchOriginalDeviceExternalFlatNoteV1=async scopedRequest=>{
      assert.equal(economicV2,true,'DEVICE_EXTERNAL_FLAT_ORIGINAL_ECONOMIC_RUNTIME');
      assertAlive();
      // Fixed literal consumer; copied scopes and callbacks cannot issue this
      // WeakMap capability. Complete this import before preparing any key.
      const {consumeOriginalDeviceExternalFlatSendV1}=await import('../../../accounts/authority/device-external-flat-note-authority-v1.mjs');
      const scope=consumeOriginalDeviceExternalFlatSendV1(scopedRequest,runtime);
      return sendInternal('device-external-flat-original-source-note',scope.transaction,'0x1',undefined,scope);
    };
    const advanceTo = timestamp => mutate(async () => {
      assert.equal(observedClock,false,'LOCAL_OBSERVED_CLOCK_NO_CALLER_TIME');
      const target = uint(timestamp, 64);
      assert.ok(target > lastTimestamp && target <= BigInt(Number.MAX_SAFE_INTEGER), 'LOCAL_EVM_MONOTONIC_TIME');
      try { return await mineAt(target); } catch (error) { uncertainMutation = true; throw error; }
    });
    const signedTransaction = async hash => {
      assert.match(hash, /^0x[0-9a-f]{64}$/, 'LOCAL_EVM_TRANSACTION_HASH');
      const entry = transactions.find(item => item.transactionHash === hash && item.signed);
      assert.ok(entry, 'EVM_NO_RETAINED_SIGNED_IDENTITY');
      assertSignedEvmTransaction(entry.signed.nativeWire, entry.prepared.transaction);
      return cloned(entry.signed);
    };
    const usedDispatches = new WeakSet();
    const persistSigned = async entry => {
      const path = join(cwd, 'signed-' + entry.transactionHash.slice(2) + '.json');
      const file = await open(path, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ schema: 'OWNED_EVM_SIGNED_WIRE_V2',
        prepared: entry.prepared, signed: entry.signed }) + '\n'); await file.sync(); }
      finally { await file.close(); }
      const directory = await open(cwd, 'r'); try { await directory.sync(); } finally { await directory.close(); }
      const expected = { schema: 'OWNED_EVM_SIGNED_WIRE_V2', prepared: entry.prepared, signed: entry.signed };
      assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected, 'EVM_DURABLE_SIGNED_WIRE_CHANGED');
    };
    /** Only the original gate-issued capability is accepted. Its callbacks
     * authenticate exact prepared facts, then perform final current P/R/health
     * checks and retain exact raw/GID/provider signature before returning.
     */
    // Only the two fixed wrappers below select the private clock branch.
    // Both retain the same original preparation, final authority and wire path.
    const dispatchOriginal = async (scopedRequest, observedClaim) => {
      assert.equal(economicRecoveryFence,null,'EVM_ECONOMIC_CAPTURE_FENCED_MUTATION');
      assert.equal(observedClock&&!observedEconomicV2,observedClaim,'LOCAL_EVM_FIXED_DISPATCH_CLOCK');
      // Fixed literal import avoids the runtime/gate/wire-codec module cycle.
      // It completes before preparation; no import/RPC is inserted after the
      // final beforeSign check and the actual sign-only RPC.
      const { assertOwnedEvmDispatchRequest } = await import('../dispatch/evm-dispatch-gate.mjs');
      const { isOwnedClaimEvmDispatchRequest, assertOwnedClaimEvmDispatchRequest } = await import('../../../claims/protocol/evm-dispatch-gate.mjs');
      const { isOwnedClaimEvmDispatchRequest: isWrapped, assertOwnedClaimEvmDispatchRequest: openWrapped } = await import('../../../claims/wrapped/protocol/wrapped-evm-dispatch-gate-v1.mjs');
      if (observedClaim) assert.ok(isOwnedClaimEvmDispatchRequest(scopedRequest),
        'LOCAL_OBSERVED_RECEIVER_ORIGINAL_CLAIM_REQUIRED');
      const claimV4 = isOwnedClaimEvmDispatchRequest(scopedRequest) || isWrapped(scopedRequest);
      const scope = observedClaim ? assertOwnedClaimEvmDispatchRequest(scopedRequest, runtime)
        : isWrapped(scopedRequest) ? openWrapped(scopedRequest, runtime) : isOwnedClaimEvmDispatchRequest(scopedRequest)
          ? assertOwnedClaimEvmDispatchRequest(scopedRequest, runtime)
          : assertOwnedEvmDispatchRequest(scopedRequest, runtime);
      assert.deepEqual(Object.keys(scope).sort(), ['beforeSign', ...(claimV4 ? ['consumeBeforeKey'] : []), 'onSigned', 'transaction'], 'EVM_SCOPED_FIELDS');
      if (claimV4) assert.equal(typeof scope.consumeBeforeKey, 'function', 'EVM_ORIGINAL_KEY_CONSUMER_V4');
      assert.equal(typeof scope.beforeSign, 'function', 'EVM_FINAL_GUARD');
      assert.equal(typeof scope.onSigned, 'function', 'EVM_DURABLE_CALLBACK');
      // Copy exact values and callback identities before the first await.
      const beforeSign = scope.beforeSign, onSigned = scope.onSigned;
      assert.deepEqual(Object.keys(scope.transaction).sort(), ['data', 'from', 'gas', 'to', 'value'], 'EVM_DISPATCH_TRANSACTION_FIELDS');
      const tx = cloned(request(scope.transaction, true));
      assert.equal(tx.value, '0x0', 'EVM_DISPATCH_ZERO_NATIVE_VALUE');
      assert.ok(tx.to && tx.data?.length >= 10 && tx.data.length <= 262_146, 'EVM_DISPATCH_CONTRACT_CALL');
      assert.ok(!usedDispatches.has(scopedRequest), 'EVM_DISPATCH_ALREADY_USED_NO_RESEND');
      return mutate(async () => {
        usedDispatches.add(scopedRequest);
        let keyUsePossible = false, outcomeKnown = false, entry, localSigningLease=null;
        try {
          const head = await block();
          assert.equal(BigInt(head.timestamp), lastTimestamp, 'LOCAL_EVM_UNCONTROLLED_TIME');
          const pending = quantity(await rpc('eth_getTransactionCount', [tx.from, 'pending']));
          const confirmed = quantity(await rpc('eth_getTransactionCount', [tx.from, 'latest']));
          assert.equal(pending, confirmed, 'EVM_PENDING_NONCE_NOT_EXCLUSIVE');
          const gasPrice = 1_000_000_000n;
          assert.ok(BigInt(head.baseFeePerGas) <= gasPrice, 'EVM_FIXED_GAS_PRICE_TOO_LOW');
          const txExact = { chainId: '31337', from: tx.from, to: tx.to, nonce: BigInt(pending).toString(),
            gasPrice: gasPrice.toString(), gas: BigInt(tx.gas).toString(), value: '0', data: tx.data };
          const signingRequest = Object.freeze({ ...tx, nonce: pending, chainId: '0x7a69', gasPrice: hex(gasPrice), type: '0x0' });
          const targetCode = bytes(await rpc('eth_getCode', [tx.to, head.number]));
          assert.notEqual(targetCode, '0x', 'EVM_DISPATCH_TARGET_NO_CODE');
          const balanceWei = BigInt(quantity(await rpc('eth_getBalance', [tx.from, head.number])));
          assert.ok(balanceWei >= BigInt(tx.gas) * gasPrice, 'EVM_DISPATCH_GAS_FUNDS');
          const estimate = BigInt(quantity(await rpc('eth_estimateGas', [signingRequest, head.number])));
          assert.ok(estimate > 0n && estimate <= BigInt(tx.gas), 'EVM_DISPATCH_GAS_ESTIMATE');
          const prepared = cloned({ genesis: genesisHash,
            head: { number: head.number, hash: head.hash, timestamp: head.timestamp }, transaction: txExact,
            unsignedWire: '0x' + encodeRlp(unsignedFields(txExact)).toString('hex'),
            funds: { balanceWei: balanceWei.toString(), estimatedGas: estimate.toString(),
              targetCodeHash: '0x' + keccak(Buffer.from(targetCode.slice(2), 'hex')).toString('hex') } });
          entry = { label: 'gated EVM vault delivery', request: tx, senderNonce: pending,
            prepared, phase: 'prepared-before-final-guard' };
          transactions.push(entry);
          if(economicV2)localSigningLease=await prepareNativeEconomicCustodySigningV2(localCustody,prepared);
          // V4 returns a genuine one-use authority, consumed only after the
          // final complete native observation of this exact preparation.
          const keyAuthorityV4 = claimV4 ? await beforeSign(prepared) : null;
          const nativeAuditStarted = performance.now();
          assert.deepEqual(await block(), head, 'EVM_PREPARED_HEAD_CHANGED');
          for (const tag of ['latest', 'pending'])
            assert.equal(await rpc('eth_getTransactionCount', [tx.from, tag]), pending, 'EVM_PREPARED_NONCE_CHANGED');
          assert.equal(await rpc('eth_getCode', [tx.to, 'latest']), targetCode, 'EVM_PREPARED_CODE_CHANGED');
          assert.equal(BigInt(await rpc('eth_getBalance', [tx.from, 'latest'])), balanceWei, 'EVM_PREPARED_BALANCE_CHANGED');
          assert.equal(BigInt(await rpc('eth_estimateGas', [signingRequest, 'latest'])), estimate, 'EVM_PREPARED_ESTIMATE_CHANGED');
          assert.deepEqual(await block(), head, 'EVM_PREPARED_HEAD_CHANGED');
          if (claimV4) {
            const authorityAuditStarted = scope.consumeBeforeKey(keyAuthorityV4, prepared);
            const terminalNow = performance.now(), elapsed = terminalNow - nativeAuditStarted;
            const authorityElapsed = terminalNow - authorityAuditStarted;
            assert.ok(Number.isFinite(authorityElapsed) && authorityElapsed >= 0 && authorityElapsed < 30_000, 'EVM_KEY_ORIGINAL_AUTHORITY_TOO_OLD');
            assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'EVM_KEY_NATIVE_OBSERVATION_TOO_OLD');
          } else assert.equal(await beforeSign(prepared), undefined, 'EVM_FINAL_GUARD_ASSERT_ONLY');
          // Immediately following the guard: no preparation, observation, file
          // I/O or other callback intervenes before actual backend key use.
          if(economicV2)assertAlive();
          keyUsePossible = true; entry.phase = 'signing-outcome-unknown';
          const raw = economicV2?consumeNativeEconomicCustodySigningV2(localCustody,localSigningLease,prepared).nativeWire:await rpc('eth_signTransaction', [signingRequest]);
          const verified = assertSignedEvmTransaction(raw, prepared.transaction);
          assert.equal(verified.unsignedWire, prepared.unsignedWire, 'EVM_SIGNED_UNSIGNED_WIRE_CHANGED');
          entry.signed = cloned({ nativeWire: verified.nativeWire, nativeId: verified.nativeId,
            transactionSHA256: verified.transactionSHA256 });
          entry.transactionHash = verified.nativeId; entry.phase = 'signed-not-yet-durable';
          await persistSigned(entry); entry.phase = 'native-signed-durable';
          // The original scoped gate persists raw/GID, creates and verifies the
          // provider signature, then durably retains that EXACT signature.
          assert.equal(await onSigned(entry.signed), undefined, 'EVM_ON_SIGNED_ASSERT_ONLY');
          entry.phase = 'provider-signature-durable';
          entry.phase = 'broadcast-result-unknown';
          const hash = await rpc('eth_sendRawTransaction', [entry.signed.nativeWire]);
          assert.equal(hash, entry.transactionHash, 'EVM_BROADCAST_HASH_CHANGED');
          entry.phase = 'broadcast';
          const includedSecond=observedClaim||observedEconomicV2?await nextObservedSecond():lastTimestamp+1n;
          if(observedEconomicV2)entry.originalObservedInclusionSecond=includedSecond.toString();
          await mineAt(includedSecond);
          const mined = await receipt(entry.transactionHash);
          assert.ok(mined, 'LOCAL_EVM_RECEIPT_MISSING_AFTER_MINE');
          const header = await assertCanonical(mined);
          assert.deepEqual(header.transactions, [entry.transactionHash], 'EVM_DISPATCH_ONE_TRANSACTION_BLOCK');
          entry.receipt = mined; entry.gasUsed = BigInt(mined.gasUsed).toString();
          entry.phase = mined.status === '0x1' ? 'mined' : 'mined-reverted'; receipts.push(entry); outcomeKnown = true;
          assert.equal(mined.status, '0x1', 'EVM_DISPATCH_REVERTED');
          return cloned({ nativeId: entry.transactionHash, transactionSHA256: entry.signed.transactionSHA256 });
        } catch (error) {
          if (keyUsePossible && !outcomeKnown) {
            uncertainMutation = true;
            // Only a lost reply to the sole durable raw broadcast can be
            // reconciled here. Signing/persistence/mining/time uncertainty is
            // a different cause and must keep the global mutation fence.
            uncertainSignedHash = entry?.signed && entry.phase === 'broadcast-result-unknown' ? entry.transactionHash : null;
            if (entry) { entry.uncertaintyCause = uncertainSignedHash ? 'original-signed-broadcast' : 'unrecoverable-signing-or-mining';
              entry.phase = 'uncertain-no-resend'; }
          }
          else if (!keyUsePossible && entry) entry.phase = 'pre-sign-rejected';
          // Do not attach the mutable internal entry to caller-visible errors.
          if (entry && error instanceof Error && Object.isExtensible(error)) {
            try { Object.defineProperty(error, 'transactionRecord', { value: cloned(entry), enumerable: true }); } catch {}
          }
          // Preserve even a frozen/primitive callback exception exactly: the
          // gate uses its identity to establish rejection before key use.
          throw error;
        } finally {if(localSigningLease)revokeNativeEconomicCustodySigningV2(localSigningLease);}
      });
    };

    const dispatch = async scopedRequest => {
      assert.equal(observedClock&&!observedEconomicV2,false,'LOCAL_OBSERVED_RECEIVER_NO_LEGACY_DISPATCH');
      return dispatchOriginal(scopedRequest,false);
    };
    // The observed receiver exposes only the original native-claim capability.
    // Generic/wrapped/copy requests fail before preparation or native key use.
    const dispatchObservedClaimV1 = async scopedRequest => {
      assert.equal(observedClock,true,'LOCAL_OBSERVED_RECEIVER_CLAIM_ONLY');
      return dispatchOriginal(scopedRequest,true);
    };

    // A separate versioned branch. Never relax the original value-zero contract
    // dispatch above. Only the fixed native-value gate can open this capability.
    const usedNativeValueLeases = new Set();
    const persistNativeValuePreparation = async prepared => {
      const retained = { schema: 'OWNED_EVM_NATIVE_VALUE_PREPARED_V1', prepared };
      const path = join(cwd, 'native-value-prepared-' + prepared.binding.leaseId + '.json');
      const file = await open(path, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(retained) + '\n'); await file.sync(); }
      finally { await file.close(); }
      const directory = await open(cwd, 'r'); try { await directory.sync(); } finally { await directory.close(); }
      assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), retained, 'OWNED_NATIVE_VALUE_PREPARATION_READBACK');
    };
    // Private continuation of this same in-flight native dispatch. Anvil
    // v1.8.4 defaults to 32 slots/epoch; finalized is best-64 (clamped to
    // genesis). Mine real empty descendants, never alias a tag or change epochs.
    // This remains inside the original mutate/epoch from before preparation.
    async function confirmOriginalNativeValueFinality(entry) {
      assert.ok(busy&&!uncertainMutation,'NATIVE_VALUE_FINALITY_ORIGINAL_MUTATION_REQUIRED');
      assert.equal(transactions.find(row=>row.transactionHash===entry.transactionHash),entry,'NATIVE_VALUE_FINALITY_ORIGINAL_RECORD_REQUIRED');
      assert.equal(entry.phase,'mined');assert.equal(entry.receipt.status,'0x1');assert.equal(entry.finalityConfirmation,undefined,'NATIVE_VALUE_FINALITY_NO_RETRY');
      const original=cloned({prepared:entry.prepared,signed:entry.signed,receipt:entry.receipt,transactionHash:entry.transactionHash,gasUsed:entry.gasUsed});
      let started=performance.now();const required=64,headers=[];
      const progress=entry.finalityConfirmation={phase:'confirming',requiredEmptyBlocks:required,confirmedEmptyBlocks:0,
        includedNumber:BigInt(original.receipt.blockNumber).toString(),includedTimestamp:null,tipNumber:null,tipTimestamp:null,finalizedNumber:null};
      entry.phase='mined-finality-pending';
      const guard=()=>{assertAlive();assert.ok(busy&&!uncertainMutation,'NATIVE_VALUE_FINALITY_ORIGINAL_MUTATION_REQUIRED');
        if(observedEconomicV2){const budget=assertOriginalObservedNativeWaitBudgetV2();
          assert.equal(budget.entry,entry,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_ENTRY');
          assert.equal(observedFinalityV2?.waitBudget,budget,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_IDENTITY');}
        assert.ok(performance.now()-started<30000,'NATIVE_VALUE_ORIGINAL_FINALITY_TIMEOUT');
        assert.deepEqual({prepared:entry.prepared,signed:entry.signed,receipt:entry.receipt,transactionHash:entry.transactionHash,gasUsed:entry.gasUsed},original,
          'NATIVE_VALUE_FINALITY_ORIGINAL_BYTES_CHANGED');};
      const finalizedAt=async tip=>{
        guard();const finalized=await rpc('eth_getBlockByNumber',['finalized',false]);guard();
        assert.ok(finalized,'NATIVE_VALUE_ORIGINAL_FINALITY_UNAVAILABLE');
        const height=BigInt(tip.number)>64n?BigInt(tip.number)-64n:0n;
        assert.equal(BigInt(finalized.number),height,'NATIVE_VALUE_FINALITY_PINNED_EPOCH_POLICY');
        assert.deepEqual(await rpc('eth_getBlockByNumber',[hex(height),false]),finalized,'NATIVE_VALUE_FINALITY_CANONICAL_TAG');guard();
        return finalized;
      };
      try {
        guard();await checkReceipt(original.receipt);const included=await assertCanonical(original.receipt);guard();
        let tip=await block();assert.deepEqual(tip,included,'NATIVE_VALUE_FINALITY_ORIGINAL_TIP_REQUIRED');
        assert.equal(BigInt(included.number),BigInt(original.prepared.head.number)+1n);
        assert.equal(BigInt(included.timestamp),BigInt(original.prepared.head.timestamp)+1n);
        Object.assign(progress,{includedTimestamp:BigInt(included.timestamp).toString(),tipNumber:BigInt(tip.number).toString(),tipTimestamp:BigInt(tip.timestamp).toString()});
        let finalized=await finalizedAt(tip);progress.finalizedNumber=BigInt(finalized.number).toString();
        assert.ok(BigInt(finalized.number)<BigInt(included.number),'NATIVE_VALUE_FINALITY_INITIAL_TAG_CHANGED');
        for(let count=0;count<required;count++){
          if(observedEconomicV2){
            // No send authority is consulted, retained or renewed here. Wait
            // outside the audit, then perform a NEW bounded current audit of
            // this original entry before its next real empty descendant.
            assert.equal(observedFinalityV2?.entry,entry,'ECONOMIC_OBSERVED_ORIGINAL_FINALITY_ENTRY');
            await waitOriginalObservedNativeSecondV2(lastTimestamp+1n);
            started=performance.now();await health();guard();
          }
          guard();assert.deepEqual(await block(),tip,'NATIVE_VALUE_FINALITY_TIP_CHANGED');
          const next=await mineAt(lastTimestamp+1n);guard();
          assert.equal(BigInt(next.number),BigInt(tip.number)+1n,'NATIVE_VALUE_FINALITY_CONTIGUOUS_HEIGHT');
          assert.equal(next.parentHash,tip.hash,'NATIVE_VALUE_FINALITY_ORIGINAL_ANCESTRY');
          assert.equal(BigInt(next.timestamp),BigInt(tip.timestamp)+1n,'NATIVE_VALUE_FINALITY_MONOTONIC_BLOCK_TIME');
          assert.deepEqual(next.transactions,[],'NATIVE_VALUE_FINALITY_EMPTY_BLOCKS_ONLY');
          headers.push(cloned(next));tip=next;
          Object.assign(progress,{confirmedEmptyBlocks:count+1,tipNumber:BigInt(tip.number).toString(),tipTimestamp:BigInt(tip.timestamp).toString()});
          finalized=await finalizedAt(tip);progress.finalizedNumber=BigInt(finalized.number).toString();
        }
        assert.deepEqual(finalized,included,'NATIVE_VALUE_FINALITY_ORIGINAL_INCLUSION_NOT_FINALIZED');
        await checkReceipt(original.receipt);assert.deepEqual(await assertCanonical(original.receipt),included);
        assert.deepEqual(await block(),tip,'NATIVE_VALUE_FINALITY_TIP_CHANGED');guard();
        const signedPath=join(cwd,'signed-'+original.transactionHash.slice(2)+'.json'),signedBytes=await readFile(signedPath);
        assert.deepEqual(JSON.parse(signedBytes),{schema:'OWNED_EVM_SIGNED_WIRE_V2',prepared:original.prepared,signed:original.signed},'NATIVE_VALUE_FINALITY_ORIGINAL_SIGNED_RECORD');
        const preparedPath=join(cwd,'native-value-prepared-'+original.prepared.binding.leaseId+'.json'),preparedBytes=await readFile(preparedPath);
        assert.deepEqual(JSON.parse(preparedBytes),{schema:'OWNED_EVM_NATIVE_VALUE_PREPARED_V1',prepared:original.prepared},'NATIVE_VALUE_FINALITY_ORIGINAL_PREPARATION');guard();
        const retained={schema:'OWNED_EVM_NATIVE_VALUE_ORIGINAL_FINALITY_V1',originalSignedRecordSHA256:sha(signedBytes),originalPreparedRecordSHA256:sha(preparedBytes),
          originalReceipt:original.receipt,originalIncludedHeader:included,confirmations:headers,actualFinalizedHeader:finalized,actualTip:tip,
          requiredEmptyBlocks:required,finalityTagAliased:false,epochPolicyChanged:false,sourceClockChanged:false,publicConsensusVerified:false};
        const path=join(cwd,'native-value-finality-'+original.transactionHash.slice(2)+'.json'),file=await open(path,'wx',0o600);
        try{await file.writeFile(JSON.stringify(retained)+'\n');await file.sync();}finally{await file.close();}
        const directory=await open(cwd,'r');try{await directory.sync();}finally{await directory.close();}
        assert.deepEqual(JSON.parse(await readFile(path,'utf8')),retained,'NATIVE_VALUE_FINALITY_DURABLE_READBACK');
        assert.equal(sha(await readFile(signedPath)),sha(signedBytes));assert.equal(sha(await readFile(preparedPath)),sha(preparedBytes));guard();
        progress.phase='completed';entry.phase='mined';
      } catch(cause){progress.phase='failed';entry.phase='mined-finality-unconfirmed';uncertainMutation=true;
        throw new Error('NATIVE_VALUE_ORIGINAL_FINALITY_UNAVAILABLE',{cause});}
    }
    // Private memory only: never journal fractional monotonic clock values or
    // let a caller, audit, refresh or continuation replace this attempt budget.
    function assertOriginalObservedNativeWaitBudgetV2(){
      assert.ok(observedEconomicV2&&nativeValueOnly,'ECONOMIC_OBSERVED_NATIVE_CLOCK_REQUIRED');
      const budget=observedNativeAttemptV2;assert.ok(budget,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_REQUIRED');
      const elapsed=performance.now()-budget.started;
      assert.ok(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<120000,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_TIMEOUT');
      return budget;
    }
    async function waitOriginalObservedNativeSecondV2(target){
      assert.ok(observedEconomicV2&&nativeValueOnly,'ECONOMIC_OBSERVED_NATIVE_CLOCK_REQUIRED');
      assert.equal(target,lastTimestamp+1n,'ECONOMIC_OBSERVED_ORIGINAL_NEXT_SECOND');
      for(;;){
        assertAlive();assertOriginalObservedNativeWaitBudgetV2();
        const now=observedNativeValueReceiverSecond(lastTimestamp.toString(),String(Date.now()));
        assertOriginalObservedNativeWaitBudgetV2();if(now>=target)return;
        await new Promise(resolve=>setTimeout(resolve,25));assertAlive();assertOriginalObservedNativeWaitBudgetV2();
      }
    }
    function beginOriginalObservedNativeFinalityV2(entry){
      assert.ok(observedEconomicV2&&nativeValueOnly&&busy&&!uncertainMutation,'ECONOMIC_OBSERVED_ORIGINAL_FINALITY_ISSUER');
      assert.ok(!observedFinalityV2||observedFinalityV2.completed,'ECONOMIC_OBSERVED_ORIGINAL_FINALITY_PENDING');
      assert.equal(transactions.find(row=>row===entry),entry);assert.equal(entry.phase,'mined');assert.equal(entry.receipt.status,'0x1');
      const prepared=entry.prepared,signed=entry.signed,waitBudget=assertOriginalObservedNativeWaitBudgetV2();
      assert.equal(waitBudget.entry,entry,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_ENTRY');
      const state={entry,prepared,signed,waitBudget,completed:false,failure:null,work:null};observedFinalityV2=state;
      entry.phase='mined-finality-pending';
      // The current dispatch mutation releases before this new continuation
      // claims the same chain. Its promise is retained before returning identity.
      state.work=new Promise(resolve=>setImmediate(resolve)).then(async()=>{
        assertAlive();assert.equal(observedFinalityV2,state);assert.equal(busy,false,'LOCAL_EVM_CONCURRENT_MUTATION');
        assert.equal(assertOriginalObservedNativeWaitBudgetV2(),waitBudget,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_IDENTITY');
        assert.equal(entry.prepared,prepared);assert.equal(entry.signed,signed);
        busy=true;ingressMutationEpoch++;entry.phase='mined';
        try{await confirmOriginalNativeValueFinality(entry);state.completed=true;}
        finally{busy=false;}
      }).catch(error=>{
        state.failure=error;entry.phase='mined-finality-unconfirmed';uncertainMutation=true;
        if(entry.finalityConfirmation)entry.finalityConfirmation.phase='failed';
      });
    }
    const dispatchNativeValueV1 = async scopedRequest => {
      assert.equal(economicRecoveryFence,null,'EVM_ECONOMIC_CAPTURE_FENCED_MUTATION');
      assert.ok(ownedNativeValueFamily.has(runtime), 'OWNED_NATIVE_VALUE_ORIGINAL_RUNTIME_REQUIRED');
      // Fixed literal and original module identity. No public brand registration,
      // dynamically selected signer, general native send, or caller callbacks.
      const { assertOwnedNativeValueEvmDispatchRequest } = await import('../dispatch/native-value-evm-dispatch-gate.mjs');
      const wrapped = await import('../../shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs');
      const wrappedV4 = wrapped.isWrappedClaimGraphDispatchRequestV1(scopedRequest);
      const scope = wrappedV4
        ? wrapped.assertOwnedNativeValueEvmDispatchRequest(scopedRequest, runtime)
        : assertOwnedNativeValueEvmDispatchRequest(scopedRequest, runtime);
      assert.deepEqual(Reflect.ownKeys(scope).sort(), ['beforeSend', 'beforeSign', 'binding', 'onSigned', 'transaction'],
        'OWNED_NATIVE_VALUE_SCOPE_FIELDS');
      for (const name of ['beforeSend', 'beforeSign', 'onSigned'])
        assert.equal(typeof scope[name], 'function', 'OWNED_NATIVE_VALUE_FIXED_GUARD');
      const beforeSign = scope.beforeSign, onSigned = scope.onSigned, beforeSend = scope.beforeSend;
      const { transaction: tx, binding } = nativeDescriptor.normalize({
        transaction: scope.transaction, binding: scope.binding }, { accounts, genesis: genesisHash });
      assert.ok(!usedDispatches.has(scopedRequest), 'OWNED_NATIVE_VALUE_REQUEST_USED_NO_RESEND');
      assert.ok(!usedNativeValueLeases.has(binding.leaseId), 'OWNED_NATIVE_VALUE_LEASE_USED_NO_RESEND');
      // Claim the exact lease before the first preparation await, including the
      // mutate health read. Any rejection consumes this original request/lease.
      usedDispatches.add(scopedRequest); usedNativeValueLeases.add(binding.leaseId);
      return mutate(async () => {
        let keyUsePossible = false, outcomeKnown = false, entry, localSigningLease=null, operationV4 = null, phaseV4 = null;
        const originalMutationV4 = ingressMutationEpoch;
        const nativeStartedV4 = performance.now();
        if(observedEconomicV2)observedNativeAttemptV2={started:nativeStartedV4,entry:null};
        const terminalV4 = authority => {
          const now = performance.now();
          for (const [name, started] of [['AUTHORITY', authority.auditStarted], ['NATIVE', authority.nativeAuditStarted]]) {
            const elapsed = now - started;
            assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'WRAPPED_GRAPH_' + name + '_TOO_OLD');
          }
        };
        const issueOperationV4 = () => {
          assert.ok(wrappedV4 && operationV4 === null && entry?.prepared, 'WRAPPED_GRAPH_FIXED_OPERATION_ISSUER');
          const originalEntry = entry, originalPrepared = entry.prepared;
          operationV4 = Object.freeze({ profile: 'OWNED_WRAPPED_GRAPH_NATIVE_OPERATION_V4' });
          wrappedGraphOperationsV4.set(operationV4, { runtime, request: scopedRequest, read() {
            assertAlive(); assert.ok(busy && !uncertainMutation && ingressMutationEpoch === originalMutationV4,
              'WRAPPED_GRAPH_ORIGINAL_ACTIVE_MUTATION_REQUIRED');
            assert.equal(entry, originalEntry); assert.equal(entry.prepared, originalPrepared);
            const expected = { 'native-key': 'prepared-before-final-guard', 'provider-key': 'native-signed-durable', 'send': 'provider-signature-durable' }[phaseV4];
            assert.ok(expected && entry.phase === expected, 'WRAPPED_GRAPH_ORIGINAL_NATIVE_PHASE_REQUIRED');
            const pending = transactions.filter(row => !['mined', 'reconciled-mined', 'pre-sign-rejected'].includes(row.phase));
            assert.equal(pending.length, 1, 'WRAPPED_GRAPH_UNRELATED_PENDING_NATIVE_HISTORY');
            assert.equal(pending[0], entry, 'WRAPPED_GRAPH_ORIGINAL_PENDING_NATIVE_HISTORY');
            const observed = wrappedGraphObservationsV4.get(originalPrepared);
            assert.ok(observed && observed.prepared === originalPrepared, 'WRAPPED_GRAPH_ORIGINAL_NATIVE_OBSERVATION_REQUIRED');
            return cloned({ family: 'EVM', profileCommitment: binding.profileCommitment,
              lifetimeId: ownedNativeValueFamily.get(runtime).instanceCommitment, phase: phaseV4,
              prepared: originalPrepared, signed: entry.signed ?? null,
              nativeAuditStarted: observed.started, physicalState: readOwnedLocalEvmNativeValueAuditStateV4(runtime) });
          } });
        };
        try {
          const head = await block();
          assert.equal(BigInt(head.timestamp), lastTimestamp, 'LOCAL_EVM_UNCONTROLLED_TIME');
          const pending = quantity(await rpc('eth_getTransactionCount', [tx.from, 'pending']));
          const confirmed = quantity(await rpc('eth_getTransactionCount', [tx.from, 'latest']));
          assert.equal(pending, confirmed, 'OWNED_NATIVE_VALUE_NONCE_NOT_EXCLUSIVE');
          const gasPrice = BigInt(nativeValueProfile.gasPrice);
          assert.ok(BigInt(head.baseFeePerGas) <= gasPrice, 'OWNED_NATIVE_VALUE_FIXED_FEE_TOO_LOW');
          const txExact = { chainId: nativeValueProfile.chainId,
            from: tx.from, to: tx.to, nonce: BigInt(pending).toString(), gasPrice: gasPrice.toString(),
            gas: BigInt(tx.gas).toString(), value: BigInt(tx.value).toString(), data: tx.data };
          const signingRequest = Object.freeze({ ...tx, nonce: pending,
            chainId: hex(txExact.chainId), gasPrice: hex(gasPrice), type: '0x0' });
          // Recipient code is observed and retained, not prohibited or mistaken
          // for evidence of recipient key control or retained native balance.
          const targetCode = bytes(await rpc('eth_getCode', [tx.to, head.number]));
          const balanceWei = BigInt(quantity(await rpc('eth_getBalance', [tx.from, head.number])));
          const maximumFeeWei = BigInt(tx.gas) * gasPrice;
          assert.ok(balanceWei >= BigInt(tx.value) + maximumFeeWei, 'OWNED_NATIVE_VALUE_SOLVER_VALUE_AND_FEE_FUNDS');
          const estimate = BigInt(quantity(await rpc('eth_estimateGas', [signingRequest, head.number])));
          // The signed gas limit already exceeds the conservative shared wire
          // floor. Cancun's actual estimate may be lower (22120 for this memo).
          assert.ok(estimate >= 22120n && estimate <= BigInt(tx.gas), 'OWNED_NATIVE_VALUE_GAS_ESTIMATE');
          const exactHead = { number: head.number, hash: head.hash, timestamp: head.timestamp };
          const targetCodeHash = '0x' + keccak(Buffer.from(targetCode.slice(2), 'hex')).toString('hex');
          const audit = ownedEvmNativeValueAuditCommitments({ binding, transaction: txExact,
            head: exactHead, balanceWei: balanceWei.toString(), estimatedGas: estimate.toString(), targetCodeHash });
          const prepared = cloned({ profile: nativeValueProfile.schema, binding,
            genesis: genesisHash, head: exactHead, transaction: txExact,
            unsignedWire: encodeCanonicalEvmUnsignedTransaction(txExact),
            funds: { balanceWei: balanceWei.toString(), estimatedGas: estimate.toString(), targetCodeHash,
              maximumFeeWei: maximumFeeWei.toString(), estimatedFeeWei: (estimate * gasPrice).toString(), ...audit } });
          entry = { label: 'gated test-only owned EVM native value V1', request: tx, senderNonce: pending,
            prepared, phase: 'native-value-preparation-not-yet-durable' };
          if(observedEconomicV2){const budget=assertOriginalObservedNativeWaitBudgetV2();
            assert.equal(budget.entry,null,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_NO_REBIND');budget.entry=entry;Object.freeze(budget);}
          transactions.push(entry);
          // Retain original nonce, unsigned wire, Action/K/P/R digests and lease
          // before key use. No durable allocation permits a replacement send.
          await persistNativeValuePreparation(prepared); entry.phase = 'prepared-before-final-guard';
          if(economicV2)localSigningLease=await prepareNativeEconomicCustodySigningV2(localCustody,prepared);
          // Complete every RPC preparation/read before the final P/R/source/
          // current-health guard. The actual private key RPC follows that guard.
          await health();
          assert.deepEqual(await block(), head, 'OWNED_NATIVE_VALUE_PREPARED_HEAD_CHANGED');
          for (const tag of ['latest', 'pending'])
            assert.equal(await rpc('eth_getTransactionCount', [tx.from, tag]), pending, 'OWNED_NATIVE_VALUE_PREPARED_NONCE_CHANGED');
          assert.equal(await rpc('eth_getCode', [tx.to, 'latest']), targetCode, 'OWNED_NATIVE_VALUE_PREPARED_CODE_CHANGED');
          assert.equal(BigInt(await rpc('eth_getBalance', [tx.from, 'latest'])), balanceWei, 'OWNED_NATIVE_VALUE_PREPARED_BALANCE_CHANGED');
          assert.equal(BigInt(await rpc('eth_estimateGas', [signingRequest, 'latest'])), estimate, 'OWNED_NATIVE_VALUE_PREPARED_ESTIMATE_CHANGED');
          assert.deepEqual(await block(), head, 'OWNED_NATIVE_VALUE_PREPARED_HEAD_CHANGED');
          if (wrappedV4) {
            wrappedGraphObservationsV4.set(prepared, { prepared, started: nativeStartedV4 });
            phaseV4 = 'native-key'; issueOperationV4();
            const authority = await beforeSign(prepared, operationV4);
            // All costly original wire work precedes private one-use consumption.
            assert.equal(encodeCanonicalEvmUnsignedTransaction(prepared.transaction), prepared.unsignedWire, 'WRAPPED_GRAPH_ORIGINAL_UNSIGNED_WIRE');
            terminalV4(wrapped.consumeWrappedGraphDispatchAuthorityV4(authority, 'native-key', operationV4, runtime, prepared, null));
          } else assert.equal(await beforeSign(prepared), undefined, 'OWNED_NATIVE_VALUE_FINAL_GUARD_ASSERT_ONLY');
          if(economicV2)assertAlive();
          if(observedEconomicV2)assert.equal(assertOriginalObservedNativeWaitBudgetV2().entry,entry,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_ENTRY');
          keyUsePossible = true; entry.phase = 'signing-outcome-unknown';
          const raw = economicV2?consumeNativeEconomicCustodySigningV2(localCustody,localSigningLease,prepared).nativeWire:await rpc('eth_signTransaction', [signingRequest]);
          const verified = assertSignedEvmTransaction(raw, prepared.transaction);
          assert.equal(verified.unsignedWire, prepared.unsignedWire, 'OWNED_NATIVE_VALUE_UNSIGNED_WIRE_CHANGED');
          entry.signed = cloned({ nativeWire: verified.nativeWire, nativeId: verified.nativeId,
            transactionSHA256: verified.transactionSHA256 });
          entry.transactionHash = verified.nativeId; entry.phase = 'signed-not-yet-durable';
          await persistSigned(entry); entry.phase = 'native-signed-durable';
          // The fixed gate verifies GID/N, persists raw native identity, signs
          // and verifies the original provider statement and retains it durably.
          if (wrappedV4) phaseV4 = 'provider-key';
          assert.equal(await (wrappedV4 ? onSigned(entry.signed, operationV4) : onSigned(entry.signed)), undefined, 'OWNED_NATIVE_VALUE_SIGNED_ASSERT_ONLY');
          entry.phase = 'provider-signature-durable';
          if (wrappedV4) {
            phaseV4 = 'send'; const authority = await beforeSend(operationV4);
            const original = assertSignedEvmTransaction(entry.signed.nativeWire, prepared.transaction);
            assert.equal(original.nativeId, entry.signed.nativeId); assert.equal(original.transactionSHA256, entry.signed.transactionSHA256);
            terminalV4(wrapped.consumeWrappedGraphDispatchAuthorityV4(authority, 'send', operationV4, runtime, prepared, entry.signed));
          } else assert.equal(await beforeSend(), undefined, 'OWNED_NATIVE_VALUE_SEND_GUARD_ASSERT_ONLY');
          if(observedEconomicV2)assert.equal(assertOriginalObservedNativeWaitBudgetV2().entry,entry,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_ENTRY');
          entry.phase = 'broadcast-result-unknown';
          const hash = await rpc('eth_sendRawTransaction', [entry.signed.nativeWire]);
          assert.equal(hash, entry.transactionHash, 'OWNED_NATIVE_VALUE_BROADCAST_HASH_CHANGED');
          entry.phase = 'broadcast';
          if(observedEconomicV2)await waitOriginalObservedNativeSecondV2(lastTimestamp+1n);
          await mineAt(lastTimestamp + 1n);
          const mined = await receipt(entry.transactionHash);
          assert.ok(mined, 'LOCAL_EVM_RECEIPT_MISSING_AFTER_MINE');
          const header = await assertCanonical(mined);
          assert.deepEqual(header.transactions, [entry.transactionHash], 'OWNED_NATIVE_VALUE_ONE_TRANSACTION_BLOCK');
          entry.receipt = mined; entry.gasUsed = BigInt(mined.gasUsed).toString();
          entry.phase = mined.status === '0x1' ? 'mined' : 'mined-reverted'; receipts.push(entry); outcomeKnown = true;
          assert.equal(mined.status, '0x1', 'OWNED_NATIVE_VALUE_REVERTED');
          if(observedEconomicV2)beginOriginalObservedNativeFinalityV2(entry);
          else await confirmOriginalNativeValueFinality(entry);
          // Receipt success reports only execution of the exact top-level
          // value transaction. It cannot prove recipient retention/key control.
          return cloned({ nativeId: entry.transactionHash, transactionSHA256: entry.signed.transactionSHA256 });
        } catch (error) {
          if (keyUsePossible && !outcomeKnown) {
            uncertainMutation = true;
            uncertainSignedHash = entry?.signed && entry.phase === 'broadcast-result-unknown' ? entry.transactionHash : null;
            if (entry) { entry.uncertaintyCause = uncertainSignedHash ? 'original-signed-broadcast' : 'unrecoverable-signing-or-mining';
              entry.phase = 'uncertain-no-resend'; }
          } else if (!keyUsePossible && entry) entry.phase = 'pre-sign-rejected';
          else if(observedEconomicV2&&keyUsePossible&&outcomeKnown&&entry){
            uncertainMutation=true;entry.phase='mined-finality-unconfirmed';
            if(entry.finalityConfirmation)entry.finalityConfirmation.phase='failed';
          }
          if (entry && error instanceof Error && Object.isExtensible(error)) {
            try { Object.defineProperty(error, 'transactionRecord', { value: cloned(entry), enumerable: true }); } catch {}
          }
          throw error;
        } finally {if(localSigningLease)revokeNativeEconomicCustodySigningV2(localSigningLease);if (operationV4) wrappedGraphOperationsV4.delete(operationV4); }
      });
    };

    /** Only the exact immutable preparation delivered to the genuine gate is
     * accepted. A copied journal/JSON object grants no current-send capability. */
    const assertNativeValuePreparedCurrent = async prepared => {
      const originalAuditStartedV4 = performance.now();
      assert.ok(ownedNativeValueFamily.has(runtime), 'OWNED_NATIVE_VALUE_ORIGINAL_RUNTIME_REQUIRED');
      const entry = transactions.find(item => item.prepared === prepared);
      assert.ok(entry && prepared.profile === nativeValueProfile.schema,
        'OWNED_NATIVE_VALUE_ORIGINAL_PREPARATION_REQUIRED');
      assert.ok(!uncertainMutation && ['prepared-before-final-guard', 'native-signed-durable',
        'provider-signature-durable'].includes(entry.phase), 'OWNED_NATIVE_VALUE_PREPARATION_NOT_LIVE');
      const expected = prepared.transaction;
      await health();
      const head = await block();
      assert.deepEqual({ number: head.number, hash: head.hash, timestamp: head.timestamp }, prepared.head,
        'OWNED_NATIVE_VALUE_CURRENT_HEAD_CHANGED');
      assert.ok(BigInt(head.baseFeePerGas) <= BigInt(expected.gasPrice), 'OWNED_NATIVE_VALUE_CURRENT_FEE_CHANGED');
      for (const tag of ['latest', 'pending'])
        assert.equal(BigInt(await rpc('eth_getTransactionCount', [expected.from, tag])).toString(), expected.nonce,
          'OWNED_NATIVE_VALUE_CURRENT_NONCE_CHANGED');
      assert.equal(BigInt(await rpc('eth_getBalance', [expected.from, 'latest'])).toString(), prepared.funds.balanceWei,
        'OWNED_NATIVE_VALUE_CURRENT_BALANCE_CHANGED');
      const code = bytes(await rpc('eth_getCode', [expected.to, 'latest']));
      assert.equal('0x' + keccak(Buffer.from(code.slice(2), 'hex')).toString('hex'), prepared.funds.targetCodeHash,
        'OWNED_NATIVE_VALUE_CURRENT_CODE_CHANGED');
      const request = { ...entry.request, nonce: hex(expected.nonce), chainId: hex(expected.chainId),
        gasPrice: hex(expected.gasPrice), type: '0x0' };
      assert.equal(BigInt(await rpc('eth_estimateGas', [request, 'latest'])).toString(), prepared.funds.estimatedGas,
        'OWNED_NATIVE_VALUE_CURRENT_ESTIMATE_CHANGED');
      assert.deepEqual(await block(), head, 'OWNED_NATIVE_VALUE_CURRENT_HEAD_CHANGED');
      assert.ok(!uncertainMutation && ['prepared-before-final-guard', 'native-signed-durable',
        'provider-signature-durable'].includes(entry.phase), 'OWNED_NATIVE_VALUE_PREPARATION_NOT_LIVE');
      wrappedGraphObservationsV4.set(prepared, { prepared, started: originalAuditStartedV4 });
    };
    /** Read-only observation of this instance's original durable signed wire.
     * It cannot clear uncertainty, re-sign, mine, resend, prove finality, or
     * establish control of the recipient or retention of the top-level value. */
    const observeNativeValueOriginal = async query => {
      assert.ok(ownedNativeValueFamily.has(runtime), 'OWNED_NATIVE_VALUE_ORIGINAL_RUNTIME_REQUIRED');
      assert.ok(query && Object.getPrototypeOf(query) === Object.prototype, 'OWNED_NATIVE_VALUE_OBSERVATION_QUERY');
      assert.deepEqual(Reflect.ownKeys(query).sort(), ['nativeId', 'nativeWire', 'transactionSHA256'],
        'OWNED_NATIVE_VALUE_OBSERVATION_FIELDS');
      for (const name of ['nativeId', 'nativeWire', 'transactionSHA256'])
        assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(query, name) ?? {}, 'value'), 'OWNED_NATIVE_VALUE_OBSERVATION_DATA');
      const { nativeId, nativeWire, transactionSHA256 } = query;
      for (const value of [nativeId, transactionSHA256]) assert.ok(typeof value === 'string'
        && /^[0-9a-f]{64}$/.exec(value)?.[0] === value, 'OWNED_NATIVE_VALUE_OBSERVATION_HASH');
      const hash = '0x' + nativeId;
      const entry = transactions.find(item => item.transactionHash === hash && item.signed);
      assert.ok(entry && entry.prepared.profile === nativeValueProfile.schema,
        'OWNED_NATIVE_VALUE_ORIGINAL_SIGNED_REQUIRED');
      assert.equal(nativeWire, entry.signed.nativeWire, 'OWNED_NATIVE_VALUE_ORIGINAL_WIRE_CHANGED');
      assert.equal(transactionSHA256, entry.signed.transactionSHA256, 'OWNED_NATIVE_VALUE_ORIGINAL_SHA_CHANGED');
      const original = await signedTransaction(hash);
      assert.deepEqual(JSON.parse(await readFile(join(cwd, 'signed-' + nativeId + '.json'), 'utf8')),
        { schema: 'OWNED_EVM_SIGNED_WIRE_V2', prepared: entry.prepared, signed: original }, 'OWNED_NATIVE_VALUE_DURABLE_WIRE_CHANGED');
      assert.deepEqual(JSON.parse(await readFile(join(cwd, 'native-value-prepared-' + entry.prepared.binding.leaseId + '.json'), 'utf8')),
        { schema: 'OWNED_EVM_NATIVE_VALUE_PREPARED_V1', prepared: entry.prepared }, 'OWNED_NATIVE_VALUE_DURABLE_PREPARATION_CHANGED');
      await health();
      const observed = await transaction(hash), included = await receipt(hash);
      if (!included) return cloned({ status: observed ? 'pending' : 'unknown', nativeId, nativeWire: null });
      assert.ok(observed, 'OWNED_NATIVE_VALUE_TRANSACTION_MISSING');
      assert.equal(BigInt(observed.type), 0n, 'OWNED_NATIVE_VALUE_OBSERVED_TRANSACTION_TYPE');
      assert.equal(observed.blockHash, included.blockHash, 'OWNED_NATIVE_VALUE_OBSERVED_RECEIPT_JOIN');
      assert.equal(observed.blockNumber, included.blockNumber, 'OWNED_NATIVE_VALUE_OBSERVED_BLOCK_JOIN');
      assert.equal(observed.transactionIndex, included.transactionIndex, 'OWNED_NATIVE_VALUE_OBSERVED_INDEX_JOIN');
      const header = await assertCanonical(included);
      assert.equal(BigInt(header.number), BigInt(entry.prepared.head.number) + 1n, 'OWNED_NATIVE_VALUE_ORIGINAL_INCLUDED_HEIGHT');
      assert.equal(BigInt(header.timestamp), BigInt(entry.prepared.head.timestamp) + 1n, 'OWNED_NATIVE_VALUE_ORIGINAL_INCLUDED_TIME');
      assert.deepEqual(header.transactions, [hash], 'OWNED_NATIVE_VALUE_ORIGINAL_INCLUDED_BLOCK');
      assert.deepEqual(await transaction(hash), observed, 'OWNED_NATIVE_VALUE_TRANSACTION_CHANGED');
      await checkReceipt(included);
      if(observedEconomicV2&&included.status==='0x1'&&entry.finalityConfirmation?.phase!=='completed')
        return cloned({status:observedFinalityV2?.entry===entry&&observedFinalityV2.failure?'unknown':'pending',nativeId,nativeWire:null});
      return cloned({ status: included.status === '0x1' ? 'observed' : 'adverse', nativeId,
        nativeWire: included.status === '0x1' ? original.nativeWire : null });
    };

    /** Read-only exact-original reconciliation; never signs, mines or sends.
     * The cause-specific latch prevents an unrelated successful signed receipt
     * from clearing deployment, time, missing-wire or unknown-key uncertainty. */
    const reconcileSignedTransaction = async hash => {
      assert.equal(economicRecoveryFence,null,'EVM_ECONOMIC_CAPTURE_FENCED_MUTATION');
      assert.match(hash, /^0x[0-9a-f]{64}$/);
      assert.ok(!observedFinalityV2||observedFinalityV2.completed,'ECONOMIC_OBSERVED_ORIGINAL_FINALITY_PENDING');
      assert.ok(!busy, 'LOCAL_EVM_CONCURRENT_MUTATION'); busy = true; ingressMutationEpoch++;
      try {
        await health();
        const entry = transactions.find(item => item.transactionHash === hash && item.signed);
        assert.ok(entry, 'EVM_RECONCILE_ORIGINAL_SIGNED_REQUIRED');
        if (entry.reconciliation && !uncertainMutation) {
          await checkReceipt(entry.reconciliation.receipt); return cloned(entry.reconciliation);
        }
        assert.ok(uncertainMutation && uncertainSignedHash === hash
          && entry.uncertaintyCause === 'original-signed-broadcast', 'EVM_RECONCILE_UNRELATED_UNCERTAINTY');
        const original = await signedTransaction(hash);
        const expected = { schema: 'OWNED_EVM_SIGNED_WIRE_V2', prepared: entry.prepared, signed: original };
        assert.deepEqual(JSON.parse(await readFile(join(cwd, 'signed-' + hash.slice(2) + '.json'), 'utf8')), expected,
          'EVM_RECONCILE_DURABLE_WIRE_CHANGED');
        assertSignedEvmTransaction(original.nativeWire, entry.prepared.transaction);
        const observed = await transaction(hash), included = await receipt(hash);
        if (!observed || !included) return null;
        assert.equal(observed.blockHash, included.blockHash, 'EVM_RECONCILE_RECEIPT_JOIN');
        const header = await assertCanonical(included), current = await block();
        assert.deepEqual(current, header, 'EVM_RECONCILE_UNCONTROLLED_HEAD');
        assert.deepEqual(header.transactions, [hash], 'EVM_RECONCILE_ONE_TRANSACTION');
        assert.equal(BigInt(header.number), BigInt(entry.prepared.head.number) + 1n, 'EVM_RECONCILE_BLOCK_NUMBER');
        assert.equal(BigInt(header.timestamp), observedEconomicV2?BigInt(entry.originalObservedInclusionSecond):BigInt(entry.prepared.head.timestamp)+1n, 'EVM_RECONCILE_BLOCK_TIME');
        for (const tag of ['latest', 'pending']) assert.equal(BigInt(await rpc('eth_getTransactionCount', [entry.request.from, tag])),
          BigInt(entry.prepared.transaction.nonce) + 1n, 'EVM_RECONCILE_NONCE');
        const reconciliation = cloned({ transactionHash: hash, transactionSHA256: original.transactionSHA256,
          receipt: included, originalUncertainty: entry.uncertaintyCause, canonicalBlockHash: header.hash });
        const path = join(cwd, 'reconciled-' + hash.slice(2) + '.json');
        const file = await open(path, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify(reconciliation)); await file.sync(); } finally { await file.close(); }
        const directory = await open(cwd, 'r'); try { await directory.sync(); } finally { await directory.close(); }
        assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), reconciliation, 'EVM_RECONCILE_READBACK');
        await checkReceipt(included); assert.deepEqual(await block(), header, 'EVM_RECONCILE_HEAD_CHANGED');
        entry.reconciliation = reconciliation; entry.receipt = included;
        entry.phase = included.status === '0x1' ? 'reconciled-mined' : 'reconciled-reverted';
        entry.gasUsed = BigInt(included.gasUsed).toString(); receipts.push(entry);
        lastTimestamp = BigInt(header.timestamp); uncertainSignedHash = null; uncertainMutation = false;
        return cloned(reconciliation);
      } finally { busy = false; }
    };
    // Whole logical native-value reads remain active through every await,
    // including disk/current checks between RPC calls. Ordinary raw/V2 method
    // identities and scheduling are unchanged.
    const logicalReadV4 = method => nativeValueOnly ? (...args) => auditNativeReadV4(() => method(...args)) : method;
    const runtime = Object.freeze({
      accounts, health: logicalReadV4(health), processStatus, block: logicalReadV4(block),
      assertCanonical: logicalReadV4(assertCanonical), receipt: logicalReadV4(receipt),
      transaction: logicalReadV4(transaction), checkReceipt: logicalReadV4(checkReceipt),
      ...(economicV2?{dispatchOriginalDeviceExternalFlatNoteV1}:{}),
      ...(nativeValueOnly ? { dispatchNativeValueV1, assertNativeValuePreparedCurrent: logicalReadV4(assertNativeValuePreparedCurrent),
        observeNativeValueOriginal: logicalReadV4(observeNativeValueOriginal) } : observedEconomicV2?{send,refreshObservedClock,dispatch}:observedClock?{send,refreshObservedClock,dispatch:dispatchObservedClaimV1}:{ send, advanceTo, dispatch }),
      signedTransaction: logicalReadV4(signedTransaction), reconcileSignedTransaction,
      call: (transaction, tag = 'latest') => rpc('eth_call', [request(transaction, false), blockTag(tag)]),
      balance: async (holder, tag = 'latest') => BigInt(await rpc('eth_getBalance', [address(holder), blockTag(tag)])),
      code: (holder, tag = 'latest') => rpc('eth_getCode', [address(holder), blockTag(tag)]),
      // Read-only EIP-1967 implementation lookup. No slot, endpoint or transaction
      // is supplied by callers; native-value profiles retain their original surface.
      ...(nativeValueOnly ? {} : { async proxyImplementation1967(holder, tag = 'latest') {
        await health(); const target = address(holder), header = await block(blockTag(tag));
        assert.notEqual(await rpc('eth_getCode', [target, header.number]), '0x', 'LOCAL_EVM_PROXY_CODE');
        const raw = await rpc('eth_getStorageAt', [target,
          '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', header.number]);
        assert.match(raw, /^0x0{24}[0-9a-f]{40}$/, 'LOCAL_EVM_PROXY_IMPLEMENTATION_WORD');
        const implementation = address('0x' + raw.slice(-40));
        assert.notEqual(implementation, '0x' + '0'.repeat(40), 'LOCAL_EVM_PROXY_IMPLEMENTATION_NONZERO');
        await assertCanonical(header); return implementation;
      }, async proxyAdmin1967(holder, tag = 'latest') {
        await health(); const target = address(holder), header = await block(blockTag(tag));
        assert.notEqual(await rpc('eth_getCode', [target, header.number]), '0x', 'LOCAL_EVM_PROXY_CODE');
        const raw = await rpc('eth_getStorageAt', [target,
          '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103', header.number]);
        assert.match(raw, /^0x0{24}[0-9a-f]{40}$/, 'LOCAL_EVM_PROXY_ADMIN_WORD');
        const admin = address('0x' + raw.slice(-40));
        assert.notEqual(admin, '0x' + '0'.repeat(40), 'LOCAL_EVM_PROXY_ADMIN_NONZERO');
        await assertCanonical(header); return admin;
      } }),
      nonce: async (holder, tag = 'pending') => {
        const sender = address(holder);
        assert.ok(accounts.includes(sender), 'LOCAL_EVM_NONCE_SENDER_NOT_OWNED');
        assert.ok(tag === 'latest' || tag === 'pending', 'LOCAL_EVM_NONCE_TAG');
        const value = await rpc('eth_getTransactionCount', [sender, tag]);
        assert.equal(typeof value, 'string', 'LOCAL_EVM_NONCE_RESULT');
        assert.match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/, 'LOCAL_EVM_NONCE_ENCODING');
        return BigInt(value);
      },
      keccak: data => rpc('web3_sha3', [bytes(data)]),
      time: async () => BigInt((await block()).timestamp),
      close, abort: () => close({ removeScratch: true }),
      get receipts() { return cloned(receipts); },
      get transactions() { return cloned(transactions); },
      get lifecycle() { return cloned(lifecycle); },
      get mutationStatus() { return Object.freeze({ busy, uncertain: uncertainMutation }); },
      get ingressSendState() {
        assertAlive();
        return Object.freeze({ epoch: ingressMutationEpoch.toString(), busy, uncertain: uncertainMutation });
      },
      metadata: Object.freeze({ version: nativeValueOnly ? OWNED_LOCAL_EVM_NATIVE_VALUE_V1 : OWNED_LOCAL_EVM_V2,
        classification: nativeValueOnly ? nativeValueProfile.classification : observedClock?'OWNED_LOCAL_OBSERVED_CLOCK_RECEIVER_V1':'OWNED_LOCAL_EVM_ONLY', profile: observedClock?Object.freeze({...processProfile,genesisTimestamp}):processProfile,
        ...(observedEconomicV2?{clockMode:'ORIGINAL_OBSERVED_WALLCLOCK_SECONDS_V2',nativeSendAuthorityMilliseconds:30000,observedFinalityWaitRenewsSendAuthority:false,restartRecoveryEstablished:false}:{}),
        chainId: String(processProfile.chainId), evmGenesis: genesisHash, freshSyntheticWallets: !restored, recoveryProcessGeneration:processGeneration, restoredOriginalState:Boolean(restored),
        ...(nativeValueOnly ? { fixtureAssurance: Object.freeze({ executionClient: 'PINNED_LOCAL_ANVIL_CANCUN',
          publicNetwork: false, publicConsensusOrFinalityVerified: false, productionClientAcceptance: 'UNVERIFIED',
          protocolSpecificExecutionEquivalent: false, nativeFunds: 'SEPARATE_SOLVER_SYNTHETIC_LIQUIDITY_NOT_CUSTODY_BACKING' }) } : {}),
        runtimePin: Object.freeze([...runtimePin]), scratchDirectory: cwd,
        processId: handle.child.pid, disclosure: nativeValueOnly ? (processProfile === LOCAL_NATIVE_VALUE_PROCESS_PROFILE
          ? 'TEST ONLY: isolated local synthetic chain ID 1 and observed synthetic genesis; not Ethereum mainnet; fake funds; no delivery, ownership, finality or proof claim'
          : `TEST ONLY: isolated local synthetic chain ID ${processProfile.chainId} and observed synthetic genesis; not public ${nativeDescriptor.network}; Anvil execution is not ${nativeDescriptor.client}; fake funds; production-client acceptance unverified; no delivery, ownership, finality or proof claim`)
          : 'Private trusted harness; transparent fake local chain; no proof claim' }),
    });
    if(!poolGenerationAcceptance&&(processProfile===LOCAL_EVM_PROFILE||processProfile===LOCAL_NATIVE_VALUE_PROCESS_PROFILE))originalEvmRecoveryCapturesV1.set(runtime,recoveryCapture=async()=>{
      if(recoveryCaptureResult)return cloneRuntimeRecoveryV1(recoveryCaptureResult);
      recoveryRetained=true;assertAlive();assert.ok(!busy&&recoveryRpcActive===0&&nativeActiveReadsV4===0,'EVM_RECOVERY_REQUIRES_QUIESCENCE');recoveryRetained=true;recoveryCapturing=true;
      try {
      const ownRead=(method,params=[])=>{handle.assertAlive();return ownedRuntimeRpc(endpoint,method,params,{timeoutMs:30000});};
      const pending=await ownRead('eth_pendingTransactions');assert.deepEqual(pending,[],'EVM_RECOVERY_PENDING_MEMPOOL_UNSUPPORTED');
      const head=await ownRead('eth_getBlockByNumber',['latest',false]),genesisHeader=await ownRead('eth_getBlockByNumber',['0x0',false]);
      assert.equal(genesisHeader.hash,genesisHash);assert.deepEqual((await ownRead('eth_accounts')).map(address),economicV2?[]:accounts);
      const accountState=[];for(const holder of accounts)accountState.push({address:holder,balance:await ownRead('eth_getBalance',[holder,'latest']),nonce:await ownRead('eth_getTransactionCount',[holder,'latest']),code:await ownRead('eth_getCode',[holder,'latest'])});
      const stateDump=await ownRead('anvil_dumpState',[true]);if(receiverRecoveryV3)assertOwnedExternalDefiStateDumpV3(stateDump);else assertOwnedEvmRecoveryStateDumpV1(stateDump);
      assert.deepEqual(await ownRead('eth_getBlockByNumber',['latest',false]),head,'EVM_RECOVERY_CAPTURE_HEAD_CHANGED');
      let mnemonic,retainedLocalCustody=null;
      if(economicV2){retainedLocalCustody=await captureNativeEconomicLocalCustodyV2(localCustody);assert.deepEqual(retainedLocalCustody.accounts,accounts);}
      else {const st=await lstat(walletConfigPath);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<16384);assert.equal(st.mode&0o777,0o600);
        const wallet=JSON.parse(await readFile(walletConfigPath,'utf8'));assert.deepEqual(wallet.available_accounts.map(address),accounts);mnemonic=wallet.wallet?.mnemonic;assert.ok(typeof mnemonic==='string'&&/^[a-z]+(?: [a-z]+){11}$/.test(mnemonic),'EVM_RECOVERY_PRIVATE_MNEMONIC');}
      const state={schema:receiverRecoveryV3?EXTERNAL_DEFI_RECEIVER_PRIVATE_SCHEMA_V3:economicV2?'OWNED_FIXED_EVM_PRIVATE_RECOVERY_V2':'OWNED_FIXED_EVM_PRIVATE_RECOVERY_V1',family:recoveryFamily,cwd,profile:processProfile.name,runtimePin:[...runtimePin],processGeneration,originalProcessId:handle.child.pid,genesisHash,genesisHeader,accounts:[...accounts],head,accountState,stateDump,...(economicV2?{localCustodyCommitment:localCustodyPublic.commitment}:{mnemonic}),lastTimestamp:lastTimestamp.toString(),ingressMutationEpoch:ingressMutationEpoch.toString(),uncertainMutation,uncertainSignedHash,transactions:cloneRuntimeRecoveryV1(transactions),receipts:cloneRuntimeRecoveryV1(receipts),lifecycle:cloneRuntimeRecoveryV1(lifecycle),sourceLineageCommitment:nativeValueOnly?(restored?.sourceLineageCommitment??ownedNativeValueFamily.get(runtime).instanceCommitment):null};
      assert.ok(state.transactions.length<=512&&state.receipts.length<=512);if(receiverRecoveryV3)assertOwnedExternalDefiPrivateRecordV3(state);const privateRecord=await writePrivateRuntimeRecoveryV1(cwd,'wrapped-runtime-capture.json',state);
      await close();const stopped=lifecycle.findLast(row=>row.event==='stopped-owned-process');assert.ok(stopped?.stopped===true&&stopped.forced===false,'EVM_RECOVERY_REQUIRES_GRACEFUL_TERMINAL');
      const files=await sealStoppedNativeFilesV1(cwd);const captured={schema:receiverRecoveryV3?EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3:economicV2?'OWNED_FIXED_EVM_CAPTURE_V2':'OWNED_FIXED_EVM_CAPTURE_V1',family:recoveryFamily,cwd,privateRecord,files,terminal:{ownedProcessStopped:true,forced:false},processGeneration,genesis:genesisHash};
      await writePrivateRuntimeRecoveryV1(cwd,'wrapped-runtime-terminal.json',captured);
      // The password is returned solely into the economic issuer's AEAD section,
      // never written to either plaintext runtime snapshot/terminal JSON.
      recoveryCaptureResult=economicV2?{...captured,localCustody:retainedLocalCustody}:captured;return cloneRuntimeRecoveryV1(recoveryCaptureResult);
    } catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'EVM_RECOVERY_CAPTURE_AND_STOP_FAILED');}throw error;}
    });
    if(originalEvmRecoveryCapturesV1.has(runtime))originalEvmEconomicFencesV1.set(runtime,{
      preflight(){assertAlive();assert.deepEqual(runtimePin,economicV2?NATIVE_ECONOMIC_ANVIL_PIN_V2:recoveryAnvilPinV1,'EVM_ECONOMIC_ORIGINAL_RECOVERABLE_BINARY_REQUIRED');
        assert.ok(!busy&&recoveryRpcActive===0&&nativeActiveReadsV4===0,'EVM_ECONOMIC_CAPTURE_REQUIRES_QUIESCENCE');},
      fence(authority){const identity=assertNativeEconomicRecoveryCaptureV1(authority);assertAlive();
        assert.deepEqual(runtimePin,economicV2?NATIVE_ECONOMIC_ANVIL_PIN_V2:recoveryAnvilPinV1,'EVM_ECONOMIC_ORIGINAL_RECOVERABLE_BINARY_REQUIRED');
        assert.ok(economicRecoveryFence===null&&!busy&&recoveryRpcActive===0&&nativeActiveReadsV4===0,'EVM_ECONOMIC_CAPTURE_REQUIRES_QUIESCENCE');
        economicRecoveryFence=cloneRuntimeRecoveryV1(identity);recoveryRetained=true;},
      async capture(token){const identity=nativeEconomicRecoverySectionIdentityV1(token,recoveryFamily);
        assert.deepEqual(identity,economicRecoveryFence,'EVM_ECONOMIC_ORIGINAL_CAPTURE_TOKEN');return recoveryCapture();},
      async abort(token){const identity=nativeEconomicRecoverySectionIdentityV1(token,recoveryFamily);
        assert.deepEqual(identity,economicRecoveryFence,'EVM_ECONOMIC_ORIGINAL_CAPTURE_TOKEN');recoveryCapturing=true;await close();
        return {closed:true,recoveryIncomplete:true};}
    });
    if(economicV2&&!nativeValueOnly){let originalCaptureToken=null;
      originalExternalDefiReceiverCapturesV2.set(runtime,{
        preflight(){assertAlive();assert.deepEqual(runtimePin,NATIVE_ECONOMIC_ANVIL_PIN_V2);
          assert.ok(economicRecoveryFence===null&&!busy&&recoveryRpcActive===0&&nativeActiveReadsV4===0,'EXTERNAL_RECEIVER_CAPTURE_REQUIRES_QUIESCENCE');},
        capture(token){const identity=externalDefiReceiverCaptureIdentityV2(token);assertAlive();
          assert.deepEqual(runtimePin,NATIVE_ECONOMIC_ANVIL_PIN_V2);
          assert.ok(originalCaptureToken===null&&economicRecoveryFence===null&&!busy&&recoveryRpcActive===0&&nativeActiveReadsV4===0,'EXTERNAL_RECEIVER_CAPTURE_REQUIRES_QUIESCENCE');
          originalCaptureToken=token;economicRecoveryFence=cloneRuntimeRecoveryV1(identity);recoveryRetained=true;
          return recoveryCapture();},
        async abort(token){assert.equal(token,originalCaptureToken,'EXTERNAL_RECEIVER_ORIGINAL_CAPTURE_TOKEN');
          // Cleanup uses this exact retained write token even after issuer fault.
          recoveryCapturing=true;await close();return {closed:true,recoveryIncomplete:true};}
      });
    }
    if(deviceExternalFlatV1){let originalDeviceCaptureToken=null;
      originalDeviceExternalFlatReceiverCapturesV1.set(runtime,{
        preflight(){assertAlive();assert.deepEqual(runtimePin,NATIVE_ECONOMIC_ANVIL_PIN_V2);
          assert.ok(economicRecoveryFence===null&&!busy&&recoveryRpcActive===0&&nativeActiveReadsV4===0,'DEVICE_EXTERNAL_FLAT_RECEIVER_CAPTURE_REQUIRES_QUIESCENCE');},
        capture(token){const identity=deviceExternalFlatReceiverCaptureIdentityV1(token);assertAlive();
          assert.deepEqual(runtimePin,NATIVE_ECONOMIC_ANVIL_PIN_V2);
          assert.ok(originalDeviceCaptureToken===null&&economicRecoveryFence===null&&!busy&&recoveryRpcActive===0&&nativeActiveReadsV4===0,'DEVICE_EXTERNAL_FLAT_RECEIVER_CAPTURE_REQUIRES_QUIESCENCE');
          originalDeviceCaptureToken=token;economicRecoveryFence=cloneRuntimeRecoveryV1(identity);recoveryRetained=true;
          return recoveryCapture();},
        async abort(token){assert.ok(originalDeviceCaptureToken!==null,'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_CAPTURE_TOKEN');assert.equal(token,originalDeviceCaptureToken,'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_CAPTURE_TOKEN');
          // The exact original write token remains the cleanup identity after
          // issuer fault; it grants neither a second capture nor a new open.
          recoveryCapturing=true;await close();return {closed:true,recoveryIncomplete:true};}
      });
    }
    if(originalEvmRecoveryCapturesV1.has(runtime))originalEvmRetentionArmsV1.set(runtime,()=>{assertAlive();assert.equal(processGeneration,0,'EVM_RETENTION_ORIGINAL_GENERATION');assert.ok(initialPrivateRecord&&!busy&&transactions.length===0,'EVM_RETENTION_BEFORE_NATIVE_EFFECTS');recoveryRetained=true;return cloneRuntimeRecoveryV1({schema:'OWNED_NATIVE_INITIAL_RETENTION_V1',family:recoveryFamily,cwd,processGeneration,initialPrivateRecord});});
    if(economicV2)originalEconomicV2Runtimes.add(runtime);
    if(observedClock&&!nativeValueOnly)observedReceiverClocks.set(runtime,{refresh:refreshObservedClock,assertAlive,inclusionSecond:observedInclusionSecond});
    if(observedEconomicV2)observedEconomicRuntimeClocksV2.set(runtime,{family:recoveryFamily,refresh:refreshObservedClock,assertAlive,
      pendingFinality:()=>Boolean(observedFinalityV2&&!observedFinalityV2.completed)});
    if (nativeValueOnly) {
      // Live original object identity is authoritative; this commitment only
      // records a process/scratch/observed-network/session identity for audit.
      const instanceCommitment = sha(JSON.stringify({ schema: 'OWNED_LOCAL_EVM_NATIVE_VALUE_INSTANCE_V1',
        sequence: (++nativeRuntimeSequence).toString(), processId: handle.child.pid, scratchDirectory: cwd,
        chainId: String(processProfile.chainId), genesis: genesisHash, accounts }));
      ownedNativeValueFamily.set(runtime, freeze({ schema: 'OWNED_LOCAL_EVM_NATIVE_VALUE_IDENTITY_V1',
        instanceCommitment, chainId: String(processProfile.chainId), genesis: genesisHash,
        classification: nativeValueProfile.classification, executionClient: 'PINNED_LOCAL_ANVIL_CANCUN',
        publicNetwork: false, publicConsensusOrFinalityVerified: false, productionClientAcceptance: 'UNVERIFIED',
        protocolSpecificExecutionEquivalent: false, nativeFunds: 'SEPARATE_SOLVER_SYNTHETIC_LIQUIDITY_NOT_CUSTODY_BACKING' }));
      nativeRuntimeLiveness.set(runtime, assertAlive);
      nativeAuditStatesV4.set(runtime, () => {
        assertAlive();
        const complete = new Set(['mined', 'reconciled-mined', 'pre-sign-rejected']);
        return cloned({ profile: 'OWNED_WRAPPED_GRAPH_NATIVE_AUDIT_STATE_V4', family: 'EVM',
          lifetimeId: instanceCommitment, genesis: genesisHash,
          readGeneration: nativeReadGenerationV4.toString(), activeReads: nativeActiveReadsV4,
          readsIdle: nativeActiveReadsV4 === 0, mutationGeneration: ingressMutationEpoch.toString(),
          activeMutations: busy ? 1 : 0, busy, closed, uncertain: uncertainMutation,
          pending: transactions.some(row => !complete.has(row.phase)),
          adverseHistory: transactions.some(row => ['mined-reverted', 'reconciled-reverted', 'uncertain-no-resend'].includes(row.phase)
            || Boolean(row.adverseReason)),
          transactions, receipts, lifecycle, lastTimestamp: lastTimestamp.toString() });
      });
      nativeSourceOpeners.set(runtime, async sourceIndex => {
        assert.ok(Number.isSafeInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < 4 && !Object.is(sourceIndex, -0),
          'OWNED_NATIVE_SOURCE_FIXED_SLOT');
        await health();
        let sourceRequestSequence = 0;
        // This private source path issues a fresh request on every invocation.
        // No shared observation, finality alias, cache or four-copy shortcut.
        const sourceRpc = async (method, params, outerSignal) => auditNativeReadV4(async () => {
          assertAlive(); assert.ok(outerSignal instanceof AbortSignal, 'OWNED_NATIVE_SOURCE_ABORT_SIGNAL');
          outerSignal.throwIfAborted();
          const signal = AbortSignal.any([outerSignal, nativeSourceLifetime.signal, AbortSignal.timeout(10000)]);
          const id = ++sourceRequestSequence;
          const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
          const length = response.headers.get('content-length');
          if (!response.ok || !(length === null || /^(0|[1-9][0-9]*)$/.exec(length)?.[0] === length && Number(length) <= 8 * 1024 * 1024)) {
            await response.body?.cancel().catch(() => {});
            throw new Error(response.ok ? 'OWNED_NATIVE_SOURCE_RESPONSE_SIZE' : 'OWNED_NATIVE_SOURCE_HTTP_STATUS');
          }
          const reader = response.body.getReader(), chunks = []; let size = 0;
          try { while (true) { signal.throwIfAborted(); const part = await reader.read(); if (part.done) break;
            size += part.value.byteLength; assert.ok(size <= 8 * 1024 * 1024, 'OWNED_NATIVE_SOURCE_RESPONSE_SIZE'); chunks.push(part.value); }
          } catch (cause) { await reader.cancel().catch(() => {}); throw cause; } finally { reader.releaseLock(); }
          signal.throwIfAborted(); assertAlive();
          const reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          assert.ok(reply && Object.getPrototypeOf(reply) === Object.prototype, 'OWNED_NATIVE_SOURCE_RPC_REPLY');
          assert.deepEqual(Object.keys(reply).sort(), ['id', 'jsonrpc', 'result'], 'OWNED_NATIVE_SOURCE_RPC_REPLY');
          assert.equal(reply.jsonrpc, '2.0'); assert.equal(reply.id, id); return reply.result;
        });
        const readClient = async signal => {
          const value = await sourceRpc('web3_clientVersion', [], signal);
          assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 512, 'OWNED_NATIVE_SOURCE_CLIENT_VERSION');
          return value;
        };
        const clientVersion = await readClient(AbortSignal.timeout(10000));
        const identity = ownedNativeValueFamily.get(runtime);
        const descriptor = freeze({ recoveryLineage: { sourceLineageCommitment:restored?.sourceLineageCommitment??identity.instanceCommitment, currentInstanceCommitment:identity.instanceCommitment, processGeneration }, identity: {
          endpointIdentity: sha('LIANUM/owned-local-evm-source/4\0' + (restored?.sourceLineageCommitment??identity.instanceCommitment) + '/' + sourceIndex),
          clientRelease: sha(clientVersion),
          chainConfiguration: sha(JSON.stringify({ schema: 'OWNED_LOCAL_EVM_NATIVE_SOURCE_CONFIGURATION_V4',
            chainId: identity.chainId, genesis: genesisHash, processProfile, runtimePin: [...runtimePin],
            executionProfile: nativeValueProfile, clientRelease: sha(clientVersion) })) },
          sourceIndex: String(sourceIndex), chainId: identity.chainId, genesis: genesisHash.slice(2),
          instanceCommitment: identity.instanceCommitment, clientVersion, classification: 'OWNED_LOCAL_EVM_COMMON_NODE_SOURCE_V4',
          commonHost: true, commonNode: true, publicNetwork: false, productionClientAcceptance: 'UNVERIFIED' });
        const assertCurrent = async () => {
          await health(); assert.equal(await readClient(AbortSignal.timeout(10000)), clientVersion, 'OWNED_NATIVE_SOURCE_CLIENT_CHANGED');
          assert.equal(ownedNativeValueFamily.get(runtime), identity, 'OWNED_NATIVE_SOURCE_INSTANCE_CHANGED'); assertAlive();
        };
        const callTrace = freeze({ tracer: 'callTracer', timeout: '5s', reexec: 128, tracerConfig: { onlyTopCall: true, withLog: false } });
        const stateTrace = freeze({ tracer: 'prestateTracer', timeout: '5s', reexec: 128,
          tracerConfig: { diffMode: false, disableCode: false, disableStorage: true } });
        const transport = async (method, params, options) => {
          assertAlive(); assert.ok(options && Object.getPrototypeOf(options) === Object.prototype);
          assert.deepEqual(Reflect.ownKeys(options), ['signal']);
          assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'signal') ?? {}, 'value'));
          const signal = options.signal; assert.ok(signal instanceof AbortSignal); signal.throwIfAborted();
          assert.ok(Array.isArray(params), 'OWNED_NATIVE_SOURCE_PARAMS');
          const values = structuredClone(params);
          if (method === 'eth_chainId') assert.equal(values.length, 0);
          else if (method === 'eth_getBlockByNumber') {
            assert.equal(values.length, 2); assert.equal(values[1], false);
            assert.ok(['latest', 'finalized', 'safe'].includes(values[0]) || typeof values[0] === 'string'
              && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.exec(values[0])?.[0] === values[0] && values[0].length <= 66, 'OWNED_NATIVE_SOURCE_BLOCK_TAG');
          } else if (['eth_getTransactionByHash', 'eth_getTransactionReceipt', 'debug_traceTransaction'].includes(method)) {
            assert.equal(values.length, method === 'debug_traceTransaction' ? 2 : 1);
            assert.ok(typeof values[0] === 'string' && /^0x[0-9a-f]{64}$/.exec(values[0])?.[0] === values[0], 'OWNED_NATIVE_SOURCE_TRANSACTION');
            const retained = transactions.find(entry => entry.transactionHash === values[0] && entry.signed
              && entry.prepared.profile === nativeValueProfile.schema);
            assert.ok(retained, 'OWNED_NATIVE_SOURCE_ORIGINAL_SIGNED_REQUIRED');
            assertSignedEvmTransaction(retained.signed.nativeWire, retained.prepared.transaction);
            if (method === 'debug_traceTransaction') assert.deepEqual(values[1], values[1]?.tracer === 'callTracer' ? callTrace : stateTrace,
              'OWNED_NATIVE_SOURCE_FIXED_TRACE');
          } else throw new Error('OWNED_NATIVE_SOURCE_READ_ONLY_METHOD');
          assert.equal(await readClient(signal), clientVersion, 'OWNED_NATIVE_SOURCE_CLIENT_CHANGED');
          const result = await sourceRpc(method, values, signal); assertAlive(); return cloned(result);
        };
        return Object.freeze({ descriptor, transport, assertCurrent,
          now() { assertAlive(); const milliseconds = lastTimestamp * 1000n;
            assert.ok(milliseconds >= 0n && milliseconds <= BigInt(Number.MAX_SAFE_INTEGER), 'OWNED_NATIVE_SOURCE_CLOCK_RANGE');
            return Number(milliseconds); } });
      });
      if (processProfile === LOCAL_NATIVE_VALUE_PROCESS_PROFILE) ownedNativeValueRuntimes.add(runtime);
    } else { ownedRuntimes.add(runtime); ownedRuntimeGasLimits.set(runtime, processProfile.maxGas); }
    if (osaka) {
      let probeUsed = false;
      ownedOsakaGasProbes.set(runtime, () => {
        assert.ok(!probeUsed, 'OSAKA_GAS_PROBE_ONE_ATTEMPT_ONLY');
        // Claim the one permitted attempt before the first await; the original
        // mutation guard still rejects concurrent work and existing uncertainty.
        probeUsed = true;
        return mutate(async () => {
          const snapshot = async () => {
            const settled = await Promise.allSettled([
              block(), rpc('eth_getTransactionCount', [accounts[0], 'latest']),
              rpc('eth_getTransactionCount', [accounts[0], 'pending']),
              rpc('eth_getTransactionCount', [accounts[4], 'latest']),
              rpc('eth_getTransactionCount', [accounts[4], 'pending']),
              rpc('eth_getBalance', [accounts[0], 'latest']),
              rpc('eth_getBalance', [accounts[4], 'latest']), rpc('eth_pendingTransactions'),
            ]);
            const values = settled.map(row => { if (row.status === 'rejected') throw row.reason; return row.value; });
            const [head, sourceLatest, sourcePending, targetLatest, targetPending,
              sourceBalance, targetBalance, pending] = values;
            assert.deepEqual(pending, [], 'OSAKA_GAS_PROBE_EMPTY_MEMPOOL');
            assert.equal(sourceLatest, sourcePending, 'OSAKA_GAS_PROBE_EXCLUSIVE_NONCE');
            assert.equal(targetLatest, targetPending, 'OSAKA_GAS_PROBE_EXCLUSIVE_NONCE');
            return { head, sourceLatest, sourcePending, targetLatest, targetPending,
              sourceBalance, targetBalance, journalLength: transactions.length,
              receiptLength: receipts.length, timestamp: lastTimestamp.toString() };
          };
          const before = await snapshot();
          assert.equal(before.head.number, '0x0', 'OSAKA_GAS_PROBE_FRESH_GENESIS_ONLY');
          assert.equal(before.journalLength, 0, 'OSAKA_GAS_PROBE_FRESH_GENESIS_ONLY');
          assert.equal(before.receiptLength, 0, 'OSAKA_GAS_PROBE_FRESH_GENESIS_ONLY');
          assert.equal(BigInt(before.sourceLatest), 0n, 'OSAKA_GAS_PROBE_FRESH_GENESIS_ONLY');
          assert.equal(BigInt(before.targetLatest), 0n, 'OSAKA_GAS_PROBE_FRESH_GENESIS_ONLY');
          assert.equal(BigInt(before.sourceBalance), BigInt(processProfile.accountBalanceWei), 'OSAKA_GAS_PROBE_FRESH_GENESIS_ONLY');
          assert.equal(BigInt(before.targetBalance), BigInt(processProfile.accountBalanceWei), 'OSAKA_GAS_PROBE_FRESH_GENESIS_ONLY');
          // Deliberately bypass ONLY this runtime's request cap for ONE fixed
          // node rejection. A successful or ambiguous response poisons the
          // original mutation fence and requires owned cleanup; it never retries.
          uncertainMutation = true;
          let failure;
          try {
            await rpc('eth_sendTransaction', [{ from: accounts[0], to: accounts[4],
              gas: '0x1000001', value: '0x0', data: '0x' }]);
          } catch (error) { failure = originalOwnedRuntimeRpcFailureV1(error); }
          assert.equal(failure?.schema, 'ORIGINAL_OWNED_LOOPBACK_RPC_FAILURE_V1', 'OSAKA_GAS_PROBE_NODE_REJECTION_REQUIRED');
          assert.equal(failure.method, 'eth_sendTransaction', 'OSAKA_GAS_PROBE_NODE_REJECTION_REQUIRED');
          assert.equal(failure.message?.text,
            'intrinsic gas too high -- tx.gas_limit > resolved tx gas limit cap',
            'OSAKA_GAS_PROBE_EXACT_CAP_REJECTION');
          assert.equal(failure.message.omitted, false, 'OSAKA_GAS_PROBE_EXACT_CAP_REJECTION');
          assert.ok(Number.isInteger(failure.rpcCode), 'OSAKA_GAS_PROBE_NODE_REJECTION_REQUIRED');
          const after = await snapshot();
          await health(); await assertCanonical(before.head);
          assert.deepEqual(after, before, 'OSAKA_GAS_PROBE_UNEXPECTED_EFFECT');
          uncertainMutation = false;
          return cloned({ schema: 'ORIGINAL_OWNED_OSAKA_NODE_GAS_REJECTION_V1', gas: '16777217',
            cap: '16777216', attempts: 1, zeroValue: true, originalNodeRejection: failure,
            originalStateUnchanged: true, before, after });
        });
      });
    }
    if (poolGenerationAcceptance) poolGenerationControls.set(runtime, Object.freeze({
      withholdNextSuccessorRegistrationAcknowledgement() {
        assert.equal(arguments.length, 0); assertAlive();
        assert.ok(!busy && !ackArmedOnce && successorPin === null, 'POOL_GENERATION_ACK_FAULT_ONCE_BEFORE_APPEND');
        ackArmedOnce = true; withholdAck = true;
      },
      withholdSuccessorReads() {
        assert.equal(arguments.length, 0); assertAlive();
        assert.ok(!busy && successorRegistered && !readsWithheldOnce, 'POOL_GENERATION_SUCCESSOR_READ_FAULT_ONCE');
        readsWithheldOnce = true; successorReadsUnavailable = true;
      },
      restoreSuccessorReads() {
        assert.equal(arguments.length, 0); assertAlive();
        assert.ok(!busy && successorRegistered && readsWithheldOnce && !readsRestoredOnce, 'POOL_GENERATION_SUCCESSOR_RESTORE_ONCE');
        readsRestoredOnce = true; successorReadsUnavailable = false;
      },
      status() { assert.equal(arguments.length, 0); return cloned({ successor: successorRegistered,
        acknowledgementWithheld: withheldAck, successorReadsUnavailable }); },
    }));
    await health(); return runtime;
  } catch (error) {
    try { error.cleanup = await close({ removeScratch: true }); } catch (cleanupError) { error.cleanupError = cleanupError; }
    throw error;
  }
}

/** Original runtime remains readable for the fixed capture checks. Every public
 * mutation/dispatch/reconcile is fenced synchronously, and close belongs to its
 * issuer until genuine dump+transaction/history retention and owned stop finish. */
export function assertOwnedNativeEconomicRuntimeRecoverableV1(runtime){
 assert.equal(arguments.length,1);assert.ok(!originalExternalDefiReceiverV2.has(runtime),'EXTERNAL_RECEIVER_DISTINCT_ISSUER_REQUIRED');assert.ok(!originalDeviceExternalFlatReceiversV1.has(runtime),'DEVICE_EXTERNAL_FLAT_RECEIVER_DISTINCT_ISSUER_REQUIRED');const privateState=originalEvmEconomicFencesV1.get(runtime);assert.ok(privateState,'EVM_ECONOMIC_ORIGINAL_RUNTIME_REQUIRED');privateState.preflight();
}
export function fenceOwnedNativeEconomicRuntimeV1(runtime,authority){
 assert.equal(arguments.length,2);assert.ok(!originalExternalDefiReceiverV2.has(runtime),'EXTERNAL_RECEIVER_DISTINCT_ISSUER_REQUIRED');assert.ok(!originalDeviceExternalFlatReceiversV1.has(runtime),'DEVICE_EXTERNAL_FLAT_RECEIVER_DISTINCT_ISSUER_REQUIRED');const privateState=originalEvmEconomicFencesV1.get(runtime);assert.ok(privateState,'EVM_ECONOMIC_ORIGINAL_RUNTIME_REQUIRED');privateState.fence(authority);
}
export async function captureOwnedNativeEconomicRuntimeV1(runtime,token){
 assert.equal(arguments.length,2);assert.ok(!originalExternalDefiReceiverV2.has(runtime),'EXTERNAL_RECEIVER_DISTINCT_ISSUER_REQUIRED');assert.ok(!originalDeviceExternalFlatReceiversV1.has(runtime),'DEVICE_EXTERNAL_FLAT_RECEIVER_DISTINCT_ISSUER_REQUIRED');const privateState=originalEvmEconomicFencesV1.get(runtime);assert.ok(privateState,'EVM_ECONOMIC_ORIGINAL_RUNTIME_REQUIRED');return privateState.capture(token);
}
export async function abortOwnedNativeEconomicRuntimeV1(runtime,token){
 assert.equal(arguments.length,2);assert.ok(!originalExternalDefiReceiverV2.has(runtime),'EXTERNAL_RECEIVER_DISTINCT_ISSUER_REQUIRED');assert.ok(!originalDeviceExternalFlatReceiversV1.has(runtime),'DEVICE_EXTERNAL_FLAT_RECEIVER_DISTINCT_ISSUER_REQUIRED');const privateState=originalEvmEconomicFencesV1.get(runtime);assert.ok(privateState,'EVM_ECONOMIC_ORIGINAL_RUNTIME_REQUIRED');return privateState.abort(token);
}
