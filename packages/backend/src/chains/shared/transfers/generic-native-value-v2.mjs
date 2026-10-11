/** One explicit generic source-profile union, selected only by named schema.
 * The new I relation computes the selected tagged frame and zeroes the other
 * witness branch. Same public ABI never licenses an old admission key. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray, digestBytes } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";
import * as E from '../../evm/transfers/evm-native-value-v2.mjs';
import * as T from '../../tron/transfers/tron-native-graph-profile.mjs';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier } from '@lianum/engine/evidence/native-quorum';
export const RELATION = E.RELATION;
export const SEMANTIC_PROFILE = 'LIANUM_GENERIC_NATIVE_VALUE_ADMISSION_V2';
export const EVM_PREDICATE = E.sha256('LIANUM_EVM_NATIVE_VALUE_EXACT_K_ADMISSION_V2');
export const TRON_PREDICATE = E.sha256('LIANUM_TRON_NATIVE_VALUE_EXACT_K_ADMISSION_V2');
export const sha256 = E.sha256;
export const registryCommitment = E.registryCommitment;
export const sourceCommitment = E.sourceCommitment;
export const pathRoot = E.pathRoot;
export const sourceToNoir = E.sourceToNoir;
export const observationToNoir = E.observationToNoir;
export const evidenceToNoir = E.evidenceToNoir;
function codec(profile) {
  const p = cloneInput(profile);
  assert.ok(p.schema === E.PROFILE_SCHEMA || p.schema === T.PROFILE_SCHEMA, 'GENERIC_NATIVE_VALUE_NAMED_PROFILE');
  return p.schema === E.PROFILE_SCHEMA ? E : T;
}
export const validateProfile = raw => codec(raw).validateProfile(raw);
export const profileCommitment = raw => codec(raw).profileCommitment(raw);
export const factsSchema = policy => codec(policy.profile).FACTS_SCHEMA;
export function chainDomain(raw) {
  const p = validateProfile(raw); return p.schema === E.PROFILE_SCHEMA ? E.chainDomain(p) : T.tronGraphChainDomain(p.genesis, p.asset);
}
export function assertRegistration(raw, registry, path) {
  const profile = validateProfile(raw), cm = registryCommitment(registry);
  assert.equal(pathRoot(profileCommitment(profile), path, 3), registry.quorum.rulesRoot, 'GENERIC_NATIVE_VALUE_PROFILE_MEMBERSHIP'); return cm;
}
export function assertSource(raw, source) {
  const profile = validateProfile(raw); exactRecord(source, ['identity', 'index', 'siblings']);
  assert.equal(pathRoot(sourceCommitment(source.identity), { index: source.index, siblings: source.siblings }, 2), profile.sourceSetRoot,
    'GENERIC_NATIVE_VALUE_SOURCE_POSITION'); return frozenInput(cloneInput(source));
}
export const validateFacts = (raw, policy) => codec(policy.profile).validateFacts(raw, policy);
export const encodeFacts = (raw, policy) => codec(policy.profile).encodeFacts(raw, policy);
export const factsDigest = (raw, policy) => sha256(encodeFacts(raw, policy));
const evmIntegers = ['version', 'chainId', 'maximumAncestry', 'maximumEvidenceLifetime', 'maximumBlockAgeMs', 'maximumClockSkewMs', 'maximumQueryMs'];
const evmDigests = ['genesis', 'asset', 'sourceSetRoot', 'finalityPolicy', 'tracePolicy', 'obligation'];
const tronIntegers = ['version', 'maximumAncestry', 'maximumTaposDistance', 'maximumEvidenceLifetime', 'maximumBlockAgeMs', 'maximumClockSkewMs', 'maximumQueryMs'];
const tronDigests = ['genesis', 'asset', 'sourceSetRoot', 'finalityPolicy', 'permissionPolicy', 'taposExpiryPolicy', 'obligation'];
const snake = key => key.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
function branch(profile, ints, digests) {
  return Object.fromEntries([...ints.map(k => [snake(k), profile ? profile[k] : '0']),
    ...digests.map(k => [snake(k), profile ? digestBytes(profile[k]) : Array(32).fill(0)])]);
}
/** Exact zero padding is enforced again by union.nr, not just this builder. */
export function profileToNoir(raw) {
  const profile = validateProfile(raw), evm = profile.schema === E.PROFILE_SCHEMA;
  return { source_predicate: digestBytes(evm ? EVM_PREDICATE : TRON_PREDICATE),
    evm_profile: branch(evm ? profile : null, evmIntegers, evmDigests),
    tron_profile: branch(evm ? null : profile, tronIntegers, tronDigests) };
}
export function nativeWireBytes(wire, policy) {
  assert.equal(typeof wire, 'string');
  if (codec(policy.profile) === E) { assert.match(wire, /^0x(?:[0-9a-f]{2})+$/); return Buffer.from(wire.slice(2), 'hex'); }
  assert.match(wire, /^(?:[0-9a-f]{2})+$/); return Buffer.from(wire, 'hex');
}
export function assertFactsQuorum(certificates, policy, sources) {
  fixedArray(certificates, 3); fixedArray(sources, 3);
  let first, frame; const indexes = [], signatures = [];
  certificates.forEach((certificate, i) => {
    exactRecord(certificate, ['schema', 'signerIndex', 'facts', 'frameHex', 'digest', 'signature']);
    assert.equal(certificate.schema, factsSchema(policy), 'GENERIC_NATIVE_VALUE_CERTIFICATE_SCHEMA');
    const facts = validateFacts(certificate.facts, policy), bytes = encodeFacts(facts, policy);
    assert.equal(certificate.frameHex, bytes.toString('hex')); assert.equal(certificate.digest, sha256(bytes));
    if (frame) assert.ok(frame.equals(bytes), 'GENERIC_NATIVE_VALUE_FACTS_DISAGREE'); else { first = facts; frame = bytes; }
    const source = assertSource(policy.profile, sources[i]); assert.equal(source.index, certificate.signerIndex, 'GENERIC_NATIVE_VALUE_SIGNER_SOURCE');
    indexes.push(Number(inputUint(certificate.signerIndex, 8, 3n))); signatures.push(certificate.signature);
  });
  createNativeQuorumHostVerifier({ registry: policy.registry.quorum, expectedRegistryCommitment: nativeQuorumRegistryCommitment(policy.registry.quorum) })
    .assertQuorumForMessage({ messageBytes: frame, indexes, signatures });
  return frozenInput({ facts: first, indexes, signatures });
}
