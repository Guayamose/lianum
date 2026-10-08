import assert from 'node:assert/strict';
import { assertOwnedNativeValueSystem } from '../../../operations/deployments/native-value/native-value-system-v2.mjs';
import { NATIVE_VALUE_DEV_SCHEMA_V5 } from '../../../operations/releases/native-value/native-value-dev-release-contract-v5.mjs';
import { loadNativeValueLiveArtifacts } from '../../../../../proofs/src/native-value/metadata/native-value-live-v2-artifacts.mjs';
import { loadNativeValueDevLiveArtifactsV5 } from '../../../../../proofs/src/native-value/metadata/native-value-dev-live-v5-artifacts.mjs';
import { createNativeValueLiveProofClient } from '../../../../../proofs/src/native-value/runtime/native-value-live-v2-client.mjs';
import { createNativeValueDevLiveProofClientV5 } from '../../../../../proofs/src/native-value/runtime/native-value-dev-live-v5-client.mjs';
export function nativeValueOriginalAdmissionConsumer(runtime,system){
 assert.equal(arguments.length,2,'NATIVE_VALUE_ADMISSION_CONSUMER_ARITY');
 assertOwnedNativeValueSystem(runtime,system);
 const development=system.provenance.schema===NATIVE_VALUE_DEV_SCHEMA_V5;
 return Object.freeze({development,load:development?loadNativeValueDevLiveArtifactsV5:loadNativeValueLiveArtifacts,
  createClient:development?createNativeValueDevLiveProofClientV5:createNativeValueLiveProofClient});
}
