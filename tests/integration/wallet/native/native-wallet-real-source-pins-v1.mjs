/** Fixed native-wallet entrypoints over the adopted executable sources. */
import assert from 'node:assert/strict';
import {captureAdoptedSourceEvidence,assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
export function nativeWalletRealSourcePins(){
 assert.equal(arguments.length,0,'NATIVE_WALLET_SOURCE_PINS_NO_OPTIONS');
 const base=captureAdoptedSourceEvidence();
 assertCapturedCurrentSources(base,[
  "packages/backend/src/custody/processes/native-value-owner-process-v2.mjs",
  "packages/backend/src/proving/native-value/runtime/native-value-live-v2-role-process.mjs",
  "packages/backend/src/proving/native-value/runtime/native-value-live-v2-worker.mjs",
  "tests/integration/wallet/native/native-wallet-real-source-pins-v1.mjs",
  "tests/integration/wallet/native/native-wallet-real-acceptance-v1.mjs",
  "tests/integration/wallet/native/native-wallet-real-driver-v1.mjs",
  "tests/integration/wallet/native/native-wallet-real-preflight-v1.mjs",
  "tests/integration/wallet/native/run-native-wallet-real-acceptance-v1.mjs",
  "tests/integration/wallet/native/run-native-wallet-real-preflight-v1.mjs"
]);
 return {...base,format:'CURRENT_NATIVE_WALLET_SOURCE_CLOSURE_V1'};
}
