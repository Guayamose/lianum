/** Separately versioned dynamic native-value admission role. This never registers
 * a relation in the historical catalog, job parser or legacy role client. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, CATALOG } from './catalog.mjs';
import { publicWords } from './tooling.mjs';
import { NATIVE_VALUE_ADMISSION_SPEC, NATIVE_VALUE_ACCEPTED_SOURCE_VERSION,
  validateNativeValueAdmissionInputs } from './native-value-v2-profile.mjs';
import { decodeNativeValueAdmissionStatement } from '../wallet-platform/modules/paeg/native-value-statements-v2.mjs';
export const NATIVE_VALUE_LIVE_V2_ABI_SHA256='548072fa8bf66cfdc893aefca2f9145e50de445a9f491cde1a21253198e7aab0';
export const NATIVE_VALUE_LIVE_V2_PROFILE='LIANUM_DYNAMIC_NATIVE_VALUE_ADMISSION_V2';
export const NATIVE_VALUE_LIVE_V2_SPEC=NATIVE_VALUE_ADMISSION_SPEC;
export const NATIVE_VALUE_LIVE_V2_SOURCE_VERSION=NATIVE_VALUE_ACCEPTED_SOURCE_VERSION;
export const NATIVE_VALUE_LIVE_V2_KEY_SHA256='c343da4850c47cc443dd017676661fd71b9864b792b3702ef6af8f2d53609d5e';
export const NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256='36c4e838f8cdc9f7483b16057bb754f54990d9aba5ffc0ca9c90e06dee510414';
export const NATIVE_VALUE_LIVE_V2_LOCAL=join(ROOT,'.local/proof-workers-native-value-live-v2');
export function nativeValueLivePublicWords(spec,values) {
  assert.equal(spec,NATIVE_VALUE_LIVE_V2_SPEC,'NV2_OWNED_SPEC');
  return publicWords(CATALOG.admission,values); // Byte/range codec only.
}
export function validateNativeValueLiveV2Job(abi,inputs,expected) {
  assert.equal(createHash('sha256').update(JSON.stringify(abi)).digest('hex'),NATIVE_VALUE_LIVE_V2_ABI_SHA256,'NV2_EXACT_ACCEPTED_TYPED_ABI');
  const words=nativeValueLivePublicWords(NATIVE_VALUE_LIVE_V2_SPEC,expected);
  const checked=validateNativeValueAdmissionInputs(abi,inputs,decodeNativeValueAdmissionStatement(words));
  return {inputs:checked.inputs,expectedPublicInputs:checked.expectedPublicInputs};
}
