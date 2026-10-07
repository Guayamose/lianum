use admission_support::{framing, statement};
use native_support::{quorum, state};
use poseidon_support::{encoding, framing as pool_framing, state as pool_state};
use poseidon_support::types::Domain;
use claim_support::facts;
use native_value_support::framing as envelope_framing;
use crate::framing::custody_profile_commitment;
use claim_support::types::ClaimConfig;
use crate::types::ClaimEvidenceV2;

fn assert_configuration(config: ClaimConfig, domain: Domain) -> Field {
    assert(config.evm_chain_id != [0; 32]);
    assert(config.evm_genesis != [0; 32]);
    assert(config.gateway != [0; 20]);
    assert(config.gateway_code_hash != [0; 32]);
    assert(config.wrapper != [0; 20]);
    assert(config.wrapper_code_hash != [0; 32]);
    assert(config.pool != [0; 20]);
    assert(config.pool_code_hash != [0; 32]);
    assert(config.hub != [0; 20]);
    assert(config.hub_code_hash != [0; 32]);
    assert(config.claim_verifier_set_commitment != [0; 32]);
    assert(config.native_genesis != [0; 32]);
    assert(config.native_asset != [0; 32]);
    assert(config.native_rule_commitment != [0; 32]);
    assert(config.escrow_endpoint_commitment != [0; 32]);
    assert(config.custody_inventory_domain != [0; 32]);
    assert((config.native_family == 1) | (config.native_family == 2));
    assert(config.native_asset != config.wrapper_asset_identity);
    assert(config.ledger_namespace == config.hub_domain);
    assert(domain.scope == config.scope);
    assert(domain.policy == config.policy);
    assert(domain.asset == config.wrapper_asset_identity);
    assert(domain.hub_domain == config.hub_domain);
    assert(domain.registry_commitment == config.registry_commitment);
    assert(domain.ledger_namespace == config.ledger_namespace);
    // This binds every original Domain field, including its unchanged 12-role
    // verifier set. Actual deployment/code identity is authenticated onchain.
    let pool_domain = encoding::canonical_field(config.pool_domain);
    assert(pool_domain != 0);
    assert(pool_framing::domain_commitment(domain) == pool_domain);
    pool_domain
}

// Returns the original pool domain, private native GID and CURRENT revocation
// state. Contract acceptance must compare the latter to the live shared hub.
pub fn assert_registered_evidence(
    config: ClaimConfig, domain: Domain, evidence: ClaimEvidenceV2,
) -> (Field, [u8; 32], Field) {
    let pool_domain = assert_configuration(config, domain);
    let rule = evidence.rule;
    assert(rule.family == config.native_family);
    assert(rule.genesis == config.native_genesis);
    assert(rule.asset == config.native_asset);
    statement::assert_rule(rule);
    let rule_commitment = statement::rule_commitment(rule);
    assert(rule_commitment == config.native_rule_commitment);
    assert(evidence.registry.hub_domain == config.hub_domain);
    assert(envelope_framing::registry_commitment(evidence.registry) == config.registry_commitment);
    assert(evidence.profile_index < 8);
    let mut rule_root = custody_profile_commitment(config, evidence.source_set_root);
    for depth in 0..3 {
        rule_root = if (((evidence.profile_index as u32) >> depth) & 1) == 0 {
            state::node_hash(rule_root, evidence.profile_siblings[depth])
        } else { state::node_hash(evidence.profile_siblings[depth], rule_root) };
    }
    assert(rule_root == evidence.registry.rules_root);
    // Each selected signer must occupy its registered source position. These
    // commitments bind identities, not proof of operational independence.
    for i in 0..3 {
        let source = evidence.sources[i];
        assert(source.operator_identity != [0; 32]);
        assert(source.endpoint_identity != [0; 32]);
        assert(source.client_release != [0; 32]);
        assert(source.chain_configuration != [0; 32]);
        assert(evidence.attester_indexes[i] < 4);
        let mut source_root = envelope_framing::source_commitment(source);
        for depth in 0..2 {
            source_root = if (((evidence.attester_indexes[i] as u32) >> depth) & 1) == 0 {
                state::node_hash(source_root, evidence.source_siblings[i][depth])
            } else { state::node_hash(evidence.source_siblings[i][depth], source_root) };
        }
        assert(source_root == evidence.source_set_root);
        for j in 0..3 {
            if j < i {
                assert(source.operator_identity != evidence.sources[j].operator_identity);
                assert(source.endpoint_identity != evidence.sources[j].endpoint_identity);
            }
        }
    }
    let gid = facts::assert_native_facts(rule, evidence.effect, evidence.wire,
        evidence.observation, evidence.native_context);
    // Durable-nonce v2 is custody payout only. CI51 requires destination equal
    // escrow, so the facts' distinct endpoints also keep its ingress on v1.
    if evidence.wire.wire_binding_version == 2 {
        assert(evidence.observation.source_commitment == config.escrow_endpoint_commitment);
    }
    let facts_digest = framing::facts_statement(domain, rule_commitment,
        evidence.effect, gid, evidence.wire, evidence.observation, evidence.native_context);
    // Signed original 829-byte facts bind the OUTER registry via domain.
    // Only the unchanged signature library receives the authenticated INNER hash.
    quorum::assert_quorum(evidence.registry, quorum::registry_commitment(evidence.registry), facts_digest,
        evidence.attester_indexes, evidence.attester_signatures);

    // Reuse the bounded list helper unchanged: complete vector, distinct live
    // entries, original purpose/limbs and exact zero padding are constrained.
    let expected_revoked = encoding::canonical_field(evidence.current_revoked_digest);
    let (computed_revoked, revoked_limbs) = pool_state::bounded_list_digest(
        pool_domain, config.hub_domain, evidence.current_revoked_entries, evidence.current_revoked_count,
    );
    assert(computed_revoked == expected_revoked);
    let gid_limbs = encoding::raw_digest_limbs(gid);
    for i in 0..64 {
        if i < evidence.current_revoked_count { assert(revoked_limbs[i] != gid_limbs); }
    }
    let revocation_state = framing::admission_revocation_state(pool_domain, expected_revoked,
        evidence.current_revoked_count, evidence.current_revocation_sequence);
    (pool_domain, gid, revocation_state)
}
