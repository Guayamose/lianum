/** Pure source codecs for distinct custody leaves in the frozen V2 envelope.
 * No ownership, observed backing, deployment, signing or mint capability. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray, bytes32, ZERO } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from '../../execution/account/preparation/readiness-inputs.mjs';
import { validateClaimConfig } from '@lianum/engine/claims/framing';
import { nativeAdmissionRuleCommitment } from '@lianum/engine/execution/native/dispatch/native-admission';
import { h4, sha256, registryCommitment, pathRoot, sourceCommitment, PROFILE_SCHEMA as EVM_SCHEMA }
  from '../../chains/evm/transfers/evm-native-value-v2.mjs';
import * as NativeValue from '../../chains/shared/transfers/generic-native-value-v2.mjs';
export const CUSTODY_SCHEMA = 'LIANUM_NATIVE_CUSTODY_PROFILE_V2';
export const CUSTODY_TAG = 'LIANUM/native-custody-profile/2';
export const CUSTODY_PREDICATE = sha256('BTC_SOL_REGISTERED_CUSTODY_BACKING_AND_ORIGINAL_HISTORY_V1');
export const CUSTODY_FIELDS = Object.freeze(['schema', 'version', 'family', 'genesis', 'asset', 'nativeRuleCommitment',
  'escrowEndpointCommitment', 'custodyInventoryDomain', 'sourceSetRoot', 'predicate']);
const PROFILE_CONFIG_FIELDS = Object.freeze({ family: 'nativeFamily', genesis: 'nativeGenesis', asset: 'nativeAsset',
  nativeRuleCommitment: 'nativeRuleCommitment', escrowEndpointCommitment: 'escrowEndpointCommitment',
  custodyInventoryDomain: 'custodyInventoryDomain' });
const b32 = value => Buffer.from(bytes32(value, true), 'hex');
const u = (value, width) => Buffer.from(inputUint(value, width * 8).toString(16).padStart(width * 2, '0'), 'hex');
export function validateCustodyProfile(raw) {
  const p = cloneInput(raw); exactRecord(p, CUSTODY_FIELDS);
  assert.equal(p.schema, CUSTODY_SCHEMA, 'CUSTODY_V2_NAMED_SCHEMA');
  assert.equal(p.version, '2', 'CUSTODY_V2_VERSION');
  assert.ok(p.family === '1' || p.family === '2', 'CUSTODY_V2_BTC_SOL_ONLY');
  for (const k of CUSTODY_FIELDS.slice(3)) b32(p[k]);
  assert.equal(p.predicate, CUSTODY_PREDICATE, 'CUSTODY_V2_BACKING_PREDICATE');
  return frozenInput(p);
}
export function createCustodyProfile(raw) {
  exactRecord(raw, ['config', 'sourceSetRoot']);
  const { config, sourceSetRoot } = raw, c = validateClaimConfig(config);
  return validateCustodyProfile({ schema: CUSTODY_SCHEMA, version: '2',
    ...Object.fromEntries(Object.entries(PROFILE_CONFIG_FIELDS).map(([p, k]) => [p, c[k]])),
    sourceSetRoot, predicate: CUSTODY_PREDICATE });
}
export function custodyProfileFrame(raw) {
  const p = validateCustodyProfile(raw);
  return h4(CUSTODY_TAG, [Buffer.from(CUSTODY_SCHEMA), u(p.version, 4), u(p.family, 1),
    ...CUSTODY_FIELDS.slice(3).map(k => b32(p[k]))]);
}
export const custodyProfileCommitment = raw => sha256(custodyProfileFrame(raw));
export function assertCustodyRegistration(raw) {
  exactRecord(raw, ['config', 'registry', 'rule', 'custodyProfile', 'profilePath']);
  const { registry, rule, profilePath } = raw, config = validateClaimConfig(raw.config),
    p = validateCustodyProfile(raw.custodyProfile);
  assert.equal(registryCommitment(registry), config.registryCommitment, 'CUSTODY_V2_ENVELOPE');
  assert.equal(registry.quorum.hubDomain, config.hubDomain, 'CUSTODY_V2_HUB');
  for (const [profileName, configName] of Object.entries(PROFILE_CONFIG_FIELDS))
    assert.equal(p[profileName], config[configName], 'CUSTODY_V2_CONFIG_PROFILE');
  assert.equal(nativeAdmissionRuleCommitment(rule), p.nativeRuleCommitment, 'CUSTODY_V2_RULE');
  for (const k of ['family', 'genesis', 'asset']) assert.equal(rule[k], p[k], 'CUSTODY_V2_RULE_DOMAIN');
  assert.equal(pathRoot(custodyProfileCommitment(p), profilePath, 3), registry.quorum.rulesRoot,
    'CUSTODY_V2_TYPED_MEMBERSHIP');
  return frozenInput(cloneInput(raw));
}
/** Exactly three selected ordered sources for a witness or all four for the
 * complete registration. A label cannot establish actual independence. */
export function assertCustodySources(raw, sources, indexes) {
  const p = validateCustodyProfile(raw);
  assert.ok(Array.isArray(indexes) && [3, 4].includes(indexes.length), 'CUSTODY_V2_SOURCE_COUNT');
  fixedArray(indexes, indexes.length); fixedArray(sources, indexes.length);
  const operators = new Set(), endpoints = new Set(); let previous = -1n;
  sources.forEach((source, i) => {
    exactRecord(source, ['identity', 'index', 'siblings']);
    const index = inputUint(indexes[i], 8, 3n);
    assert.ok(index > previous, 'CUSTODY_V2_ORDERED_SOURCES'); previous = index;
    assert.equal(source.index, indexes[i], 'CUSTODY_V2_SIGNER_SOURCE');
    assert.equal(pathRoot(sourceCommitment(source.identity), { index: source.index, siblings: source.siblings }, 2),
      p.sourceSetRoot, 'CUSTODY_V2_SOURCE_MEMBERSHIP');
    for (const [key, set] of [['operatorIdentity', operators], ['endpointIdentity', endpoints]]) {
      assert.ok(!set.has(source.identity[key]), 'CUSTODY_V2_DUPLICATE_SOURCE'); set.add(source.identity[key]);
    }
  });
  return frozenInput(cloneInput(sources));
}
/** Complete inventory for a future combined deployment. Every nonzero leaf is
 * typed and supplied with all four registered sources. This is NOT the current
 * graph-only ownership reader and cannot activate a combined operator. */
export function assertCombinedAdapterRegistrationsV2(raw) {
  const input = cloneInput(raw); exactRecord(input, ['registry', 'profiles']);
  registryCommitment(input.registry);
  assert.ok(Array.isArray(input.profiles) && input.profiles.length > 0 && input.profiles.length <= 7,
    'COMBINED_V2_PROFILE_COUNT');
  fixedArray(input.profiles, input.profiles.length);
  const leaves = Array(8).fill(ZERO), digests = new Set(), chains = new Set();
  for (const entry of input.profiles) {
    exactRecord(entry, ['kind', 'profile', 'profilePath', 'sources']);
    assert.ok(['custody', 'native-value'].includes(entry.kind), 'COMBINED_V2_TYPED_KIND');
    const custody = entry.kind === 'custody';
    const profile = custody ? validateCustodyProfile(entry.profile) : NativeValue.validateProfile(entry.profile);
    const digest = custody ? custodyProfileCommitment(profile) : NativeValue.profileCommitment(profile);
    const position = Number(inputUint(entry.profilePath.index, 8, 7n));
    assert.equal(leaves[position], ZERO, 'COMBINED_V2_DUPLICATE_POSITION'); leaves[position] = digest;
    assert.ok(!digests.has(digest), 'COMBINED_V2_DUPLICATE_PROFILE'); digests.add(digest);
    const chain = custody ? 'CUSTODY:' + profile.family : profile.schema === EVM_SCHEMA ? 'EVM:' + profile.chainId : 'TRON';
    assert.ok(!chains.has(chain), 'COMBINED_V2_DUPLICATE_CHAIN'); chains.add(chain);
    assert.equal(pathRoot(digest, entry.profilePath, 3), input.registry.quorum.rulesRoot, 'COMBINED_V2_PROFILE_MEMBERSHIP');
    fixedArray(entry.sources, 4);
    if (custody) assertCustodySources(profile, entry.sources, ['0', '1', '2', '3']);
    else {
      const operators = new Set(), endpoints = new Set();
      entry.sources.forEach((source, i) => {
        NativeValue.assertSource(profile, source);
        assert.equal(source.index, String(i), 'COMBINED_V2_ORDERED_SOURCE');
        for (const [key, set] of [['operatorIdentity', operators], ['endpointIdentity', endpoints]]) {
          assert.ok(!set.has(source.identity[key]), 'COMBINED_V2_DUPLICATE_SOURCE'); set.add(source.identity[key]);
        }
      });
    }
  }
  let level = leaves;
  while (level.length > 1) level = Array.from({ length: level.length / 2 }, (_, i) =>
    sha256(Buffer.from('01' + level[2 * i] + level[2 * i + 1], 'hex')));
  assert.equal(level[0], input.registry.quorum.rulesRoot, 'COMBINED_V2_COMPLETE_ROOT');
  for (const entry of input.profiles) entry.sources.forEach((source, i) =>
    assert.equal(source.identity.operatorIdentity, input.profiles[0].sources[i].identity.operatorIdentity,
      'COMBINED_V2_SAME_OPERATOR_SLOT'));
  return frozenInput(input);
}
