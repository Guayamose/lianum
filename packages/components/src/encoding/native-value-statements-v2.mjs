/** Additive native-value I84 PUBLIC DATA codec only. The old admission codec is
 * reused solely for its byte-identical public field layout/range checks. No old
 * relation registration, private predicate, key, proof or worker authority is
 * aliased or changed. This module grants no proving/admission capability. */
import assert from 'node:assert/strict';
import { RELATIONS, encodeStatement, decodeStatement, joinReadiness } from '@lianum/components/encoding/statements';
export const NATIVE_VALUE_ADMISSION_RELATION = 'admission_native_value_v2';
export const NATIVE_VALUE_STATEMENT_PROFILE = Object.freeze({relation:NATIVE_VALUE_ADMISSION_RELATION,
  role:'local',wordCount:84,fields:Object.freeze(RELATIONS.admission.fields.map(f=>Object.freeze({...f})))});
assert.equal(RELATIONS.admission.wordCount,NATIVE_VALUE_STATEMENT_PROFILE.wordCount);
/** @param {unknown} value */
export function encodeNativeValueAdmissionStatement(value) { return encodeStatement('admission',value); }
/** @param {unknown} words */
export function decodeNativeValueAdmissionStatement(words) { return decodeStatement('admission',words); }
/** @param {unknown} value */
export function validateNativeValueAdmissionStatement(value) {
  return decodeNativeValueAdmissionStatement([...encodeNativeValueAdmissionStatement(value)]);
}
/** @param {unknown} dependency @param {unknown} ready @param {unknown} admission */
export function joinNativeValueAdmission(dependency,ready,admission) {
  const r=joinReadiness(dependency,ready),i=validateNativeValueAdmissionStatement(admission);
  for(const name of ['domainCommitment','authorizationRoot','checkpoint','readinessEvidenceState','joinCommitment',
    'readinessCommitment','readyFrom','readyUntil'])assert.equal(r[name],i[name],`BUNDLE_${name}_MISMATCH`);
  // The current purpose-18 state remains distinct from historical Ready evidence.
  return i;
}
