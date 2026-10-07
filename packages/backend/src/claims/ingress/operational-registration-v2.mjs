/** Complete public registration/configuration join for the prospective combined
 * profile. This validator is data only. It cannot mint an owned observer,
 * runtime, system, bootstrap, signer, custody capability or credit. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray } from '../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../execution/account/preparation/readiness-inputs.mjs';
import { validateClaimConfig, claimDomainCommitment } from '../protocol/framing.mjs';
import { assertCombinedAdapterRegistrationsV2, assertCustodyRegistration, custodyProfileCommitment } from '../protocol/registry-envelope-v2.mjs';
import { profileCommitment, registryCommitment } from '../../chains/shared/transfers/generic-native-value-v2.mjs';

export const WRAPPED_CLAIM_OPERATIONAL_PROFILE = 'BTC_SOL_CUSTODY_WITH_GENERIC_NATIVE_VALUE_V2';
export function validateWrappedClaimOperationalRegistration(raw) {
  const data = cloneInput(raw);
  exactRecord(data, ['registry', 'profiles', 'claims']);
  const complete = assertCombinedAdapterRegistrationsV2({ registry: data.registry, profiles: data.profiles });
  fixedArray(data.claims, 2);
  const custody = complete.profiles.filter(entry => entry.kind === 'custody');
  const graph = complete.profiles.filter(entry => entry.kind === 'native-value');
  assert.equal(custody.length, 2, 'WRAPPED_CLAIM_EXACT_BTC_SOL_CUSTODY');
  assert.ok(graph.length >= 1 && graph.length <= 5, 'WRAPPED_CLAIM_GENERIC_VALUE_INVENTORY');
  const configurations = data.claims.map((entry, i) => {
    exactRecord(entry, ['config', 'rule', 'profileCommitment']);
    const config = validateClaimConfig(entry.config);
    assert.equal(config.nativeFamily, String(i + 1), 'WRAPPED_CLAIM_FIXED_BTC_SOL_ORDER');
    const matches = custody.filter(row => custodyProfileCommitment(row.profile) === entry.profileCommitment);
    assert.equal(matches.length, 1, 'WRAPPED_CLAIM_TYPED_CUSTODY_REQUIRED');
    const registration = matches[0];
    assertCustodyRegistration({ config, registry: complete.registry, rule: entry.rule,
      custodyProfile: registration.profile, profilePath: registration.profilePath });
    assert.equal(config.ledgerNamespace, complete.registry.quorum.hubDomain, 'WRAPPED_CLAIM_SHARED_NAMESPACE');
    assert.equal(config.registryCommitment, registryCommitment(complete.registry), 'WRAPPED_CLAIM_WRAPPED_REGISTRY');
    return { config, rule: entry.rule, registration, claimDomain: claimDomainCommitment(config) };
  });
  for (const name of ['evmChainId', 'evmGenesis', 'hub', 'hubCodeHash', 'hubDomain', 'ledgerNamespace',
    'registryCommitment', 'claimVerifierSetCommitment'])
    assert.equal(configurations[0].config[name], configurations[1].config[name], 'WRAPPED_CLAIM_SAME_DEPLOYMENT_' + name);
  for (const name of ['gateway', 'wrapper', 'pool', 'poolDomain', 'scope', 'policy', 'wrapperAssetIdentity', 'custodyInventoryDomain'])
    assert.notEqual(configurations[0].config[name], configurations[1].config[name], 'WRAPPED_CLAIM_DISTINCT_' + name);
  assert.notEqual(configurations[0].claimDomain, configurations[1].claimDomain, 'WRAPPED_CLAIM_DISTINCT_DOMAINS');
  return frozenInput({ profile: WRAPPED_CLAIM_OPERATIONAL_PROFILE, registry: complete.registry,
    profiles: complete.profiles, claims: configurations,
    graphProfileCommitments: graph.map(entry => profileCommitment(entry.profile)),
    authorityGranted: false });
}
