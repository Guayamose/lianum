/** Additive fixed CI51 profile. This never mutates legacy CATALOG or RELATIONS. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, CATALOG, relation } from './catalog.mjs';
import { publicWords } from './tooling.mjs';
import { validateJobAgainstABI } from './trusted-jobs.mjs';
export const NATIVE_INGRESS_V3_PROFILE = 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3';
export const NATIVE_INGRESS_V3_RELATION = 'native_claim_ingress_v3';
export const NATIVE_INGRESS_V3_SOURCE_VERSION = '65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555';
export const NATIVE_INGRESS_V3_KEY_SHA256 = '11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f';
export const NATIVE_INGRESS_V3_LOCAL = join(ROOT, '.local/proof-workers-native-ingress-v3');
export const NATIVE_INGRESS_V3_SPEC = Object.freeze({ ...CATALOG.native_claim_ingress,
  name: NATIVE_INGRESS_V3_RELATION, circuit: join(ROOT, 'experiments/native-ingress-v3/circuits/native-claim-ingress-v3') });
export function relationWithNativeIngressV3(name) {
  return name === NATIVE_INGRESS_V3_RELATION ? NATIVE_INGRESS_V3_SPEC : relation(name);
}
export function publicWordsWithNativeIngressV3(spec, values) {
  assert.equal(relationWithNativeIngressV3(spec.name), spec, 'V3_PROFILE_OWNED_SPEC');
  // ABI-only reuse, not key/proof/manifest identity substitution.
  return publicWords(spec === NATIVE_INGRESS_V3_SPEC ? CATALOG.native_claim_ingress : spec, values);
}
export function validateNativeIngressV3Job(abi, inputs, expected) {
  return validateJobAgainstABI(abi, inputs, expected, 'native_claim_ingress');
}
