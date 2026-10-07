use admission_support::{framing, statement};
use native_support::{quorum, state};
use poseidon_support::{encoding, framing as pool_framing, state as pool_state};
use poseidon_support::types::Domain;
use claim_support::facts;
use claim_support::types::{ClaimConfig, ClaimEvidence};

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
pub fn assert_registered_ingress_evidence(
    config: ClaimConfig, domain: Domain, evidence: ClaimEvidence,
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
    assert(quorum::registry_commitment(evidence.registry) == config.registry_commitment);
    assert(evidence.rule_index < 8);
    let mut rule_root = rule_commitment;
    for depth in 0..3 {
        rule_root = if (((evidence.rule_index as u32) >> depth) & 1) == 0 {
            state::node_hash(rule_root, evidence.rule_siblings[depth])
        } else { state::node_hash(evidence.rule_siblings[depth], rule_root) };
    }
    assert(rule_root == evidence.registry.rules_root);
    let gid = facts::assert_native_facts(rule, evidence.effect, evidence.wire,
        evidence.observation, evidence.native_context);
    // V3 generic ingress is selected by this relation, never by a witness flag.
    // The unchanged facts predicate accepts BTC/SOL v1 and only SOL v2; it also
    // requires distinct nonzero endpoints. Thus source cannot equal escrow.
    // Nonce authority/current nonce state remain exact-wire attester predicates,
    // bound by transaction_sha256, not independent circuit witness assertions.
    assert(evidence.observation.destination_commitment == config.escrow_endpoint_commitment);
    let facts_digest = framing::facts_statement(domain, rule_commitment,
        evidence.effect, gid, evidence.wire, evidence.observation, evidence.native_context);
    quorum::assert_quorum(evidence.registry, config.registry_commitment, facts_digest,
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
