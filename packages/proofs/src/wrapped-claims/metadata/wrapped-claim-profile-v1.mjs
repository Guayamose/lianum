/** Closed, separately versioned wrapped CI/CO shape contract. Public data only.
 * Equal public word counts are never source, private ABI, key or role aliases.
 * No compiler, worker, backend, signing key or native runtime starts on import. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CATALOG } from '../../catalog.mjs';
import { publicWords } from '../../tooling/tooling.mjs';
import { validateJobAgainstABI } from '../../jobs/trusted-jobs.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '../../../../backend/src/execution/account/preparation/readiness-inputs.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = readFileSync(new URL('./wrapped-claim-abi-reviewed-v3.json', import.meta.url));
assert.equal(sha(bytes), '41b4d973c2b46937ac08186ec3ed4ededc27b6bec20a803e6b6900def85d6d83', 'WRAPPED_ABI_DECLARATION_PIN');
const reviewedABI = frozenInput(JSON.parse(bytes));
const expectations = reviewedABI.relations, compilerMetadata = reviewedABI.compilerMetadata;
export const WRAPPED_CLAIM_PROFILE_V1 = 'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1';
export const WRAPPED_CLAIM_RELATIONS_V1 = frozenInput({
  claim_ingress: { name: 'native_claim_ingress_nonce_registry_v3', role: 'claim_ingress', symbol: 'CI51', publicWords: 51,
    statementName: 'native_claim_ingress', sourceProfile: 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_NONCE_REGISTRY_V3',
    sourceClosureSHA256: '223465eb323d18011fd24194fd97f3848aaa3da5181a489ba5875514045d3bc0',
    builder: 'buildClaimIngressNonceRegistryV3Inputs', privateEvidencePath: 'claim_nonce_registry_v3::types::ClaimEvidenceNonceRegistryV3' },
  claim_discharge: { name: 'native_claim_discharge_registry_v2', role: 'claim_discharge', symbol: 'CO42', publicWords: 42,
    statementName: 'native_claim_discharge', sourceProfile: null,
    sourceClosureSHA256: 'eefebca26321de4e2baa07d46d710840760ed961f3384d3941521b271062db3e',
    builder: 'buildClaimDischargeRegistryV2Inputs', privateEvidencePath: 'claim_registry_v2::types::ClaimEvidenceV2' },
});
/** The returned spec is an original immutable catalog record, never authority. */
export function wrappedClaimRelationV1(role) {
  assert.equal(arguments.length, 1, 'WRAPPED_ROLE_ARITY');
  assert.equal(typeof role, 'string'); assert.ok(Object.hasOwn(WRAPPED_CLAIM_RELATIONS_V1, role), 'WRAPPED_FIXED_ROLE');
  return WRAPPED_CLAIM_RELATIONS_V1[role];
}
export function wrappedClaimPublicWordsV1(spec, words) {
  assert.equal(spec, wrappedClaimRelationV1(spec?.role), 'WRAPPED_ORIGINAL_SPEC');
  // Encoding only: actual ABI and complete private witness are checked separately.
  return publicWords(CATALOG[spec.statementName], words);
}
export function validateWrappedClaimABIV1(role, rawABI) {
  const spec = wrappedClaimRelationV1(role), abi = cloneInput(rawABI);
  exactRecord(abi, ['parameters', 'return_type', 'error_types']);
  const declaredABI = expectations[spec.name], metadata = compilerMetadata[spec.name];
  assert.deepEqual({ parameters: abi.parameters, return_type: abi.return_type }, declaredABI, 'WRAPPED_COMPLETE_PRIVATE_AND_PUBLIC_ABI');
  assert.ok(metadata, 'WRAPPED_ACTUAL_ABI_METADATA_NOT_REVIEWED');
  assert.deepEqual(abi.error_types, metadata.errorTypes, 'WRAPPED_EXACT_COMPILER_ABI_METADATA');
  const abiSHA256 = sha(JSON.stringify(abi));
  assert.equal(abiSHA256, metadata.actualABI_JSONStringify_SHA256, 'WRAPPED_FULL_ACTUAL_ABI_HASH');
  return frozenInput({ classification: 'ABI_SHAPE_CONFORMANCE_NOT_COMPILE_OR_OWNERSHIP',
    relation: spec.name, actualABI: abi, declaredABI, abiSHA256 });
}
/** Only production's fixed artifact owner may treat the actual ABI as trusted.
 * This validator establishes no compile/proof/native provenance by itself. */
export function validateWrappedClaimJobV1(role, abi, raw) {
  const spec = wrappedClaimRelationV1(role), request = cloneInput(raw);
  exactRecord(request, ['relation', 'inputs', 'expectedPublicInputs']);
  assert.equal(request.relation, spec.name, 'WRAPPED_EXACT_RELATION');
  validateWrappedClaimABIV1(role, abi);
  const expected = wrappedClaimPublicWordsV1(spec, request.expectedPublicInputs);
  return validateJobAgainstABI(abi, request.inputs, expected, spec.statementName);
}
