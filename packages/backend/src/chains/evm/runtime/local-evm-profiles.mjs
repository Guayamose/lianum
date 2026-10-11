/** Fixed local EVM profile data; these names grant no runtime or custody authority. */
import assert from 'node:assert/strict';

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
