/** Additive shared-native I84 DATA/ABI profile, never a legacy CATALOG entry.
 * The accepted isolated compiled identity is fixed and distinct from admission.
 * Dynamic native-value role proving requires a separately reviewed versioned
 * worker/adapter; this file registers no job, backend, key or activation path. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, CATALOG, NOIR_VERSION } from '../../catalog.mjs';
import { assertABI } from '../../tooling/tooling.mjs';
import { validateJobAgainstABI } from '../../jobs/trusted-jobs.mjs';
import { NATIVE_VALUE_ADMISSION_RELATION, validateNativeValueAdmissionStatement,
  encodeNativeValueAdmissionStatement } from '@lianum/components/encoding/native-value-statements-v2';
export { NATIVE_VALUE_ADMISSION_RELATION };
export const NATIVE_VALUE_ACCEPTED_SOURCE_VERSION='4a6503d4b139e20e4d672ca39eb5d5f1f75497555ba6d55a7d6c424dcbb5d92e';
export const NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256='fa23b3b8867c0418834d3acd4eb70cf10aca558434fe0a19c84f59d05e5b614c';
export const NATIVE_VALUE_DYNAMIC_PROVING_PREREQUISITE='SEPARATE_VERSIONED_NATIVE_VALUE_ROLE_WORKER_AND_TRUSTED_JOB_ADAPTER_ABSENT';
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const NATIVE_VALUE_ADMISSION_SPEC=freeze({name:NATIVE_VALUE_ADMISSION_RELATION,symbol:'I_NATIVE_VALUE_V2',role:'local',
  publicABI:structuredClone(CATALOG.admission.publicABI),publicWords:84,
  privateNames:['domain','descriptor','readiness_blind','checkpoint_siblings','checkpoint_index','registry',
    'source_predicate','evm_profile','tron_profile','profile_siblings','profile_index','action','effect','opening','observation','wire',
    'native_evidence','sources','source_siblings','provider_key_x','provider_key_y','dispatch_signed_at','dispatch_signature',
    'delivery_risk_salt','receipt_secret','attester_indexes','attester_signatures',
    'current_revoked_entries','current_revoked_digest','current_revoked_count','current_revocation_sequence'],
  circuit:join(ROOT,'proof-relations/admission-native-value-v2')});
/** Checks the original fixed reader's exact accepted compiled identity, without
 * running shared circuitIdentity on an unregistered/new source package. */
export function assertNativeValueCompiledIdentity(context) {
  const {spec,identity,sourceVersion}=context;
  assert.equal(sourceVersion,NATIVE_VALUE_ACCEPTED_SOURCE_VERSION,'NATIVE_VALUE_ACCEPTED_COMPILED_SOURCE');
  assert.equal(createHash('sha256').update(JSON.stringify(identity)).digest('hex'),sourceVersion,'NATIVE_VALUE_EXACT_COMPILED_IDENTITY');
  for(const key of ['name','symbol','role','publicABI','privateNames','publicWords'])
    assert.deepEqual(spec[key],NATIVE_VALUE_ADMISSION_SPEC[key],'NATIVE_VALUE_FIXED_READER_SPEC');
  assert.equal(identity.relation,NATIVE_VALUE_ADMISSION_RELATION);
  for(const key of ['publicABI','privateNames','publicWords'])assert.deepEqual(identity[key],NATIVE_VALUE_ADMISSION_SPEC[key]);
  return sourceVersion;
}
/** ABI/witness shape only. Existing low-level parser's admission argument sets
 * the identical public84 length/ranges; native public/private parameter order is
 * checked first. This does not call prepareJob, select a key or prove anything. */
export function validateNativeValueAdmissionInputs(abi,inputs,statement) {
  assertABI(NATIVE_VALUE_ADMISSION_SPEC,{noir_version:NOIR_VERSION,abi});
  const checkedStatement=validateNativeValueAdmissionStatement(statement);
  const checked=validateJobAgainstABI(abi,inputs,[...encodeNativeValueAdmissionStatement(checkedStatement)],'admission');
  return freeze({statement:checkedStatement,...checked});
}
