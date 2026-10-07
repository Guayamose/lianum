// I84: direct nonrecursive admission. The contract MUST verify P/R/I together
// and exactly join D/G/checkpoint/readinessState/J/times and R/I's L. I alone
// does not authenticate readiness, prove pre-sign chronology or parse consensus.
use admission_support::{statement, framing, facts};
use admission_support::types::{WireBinding, NativeContext};
use readiness_support::types::ReadyDescriptor;
use readiness_support::framing as readiness_framing;
use poseidon_support::{encoding, framing as internal_framing};
use poseidon_support::state as internal_state;
use poseidon_support::types::Domain;
use native_support::{capsule, capsule_framing, receipt, state, quorum};
use graph_support::sha256::words_to_bytes;

fn main(
    domain_commitment: pub [u32; 8],
    authorization_root: pub [u32; 8],
    checkpoint: pub [u32; 8],
    readiness_evidence_state: pub [u32; 8],
    join_commitment: pub [u32; 8],
    readiness_commitment: pub [u32; 8],
    accepted_checkpoint_root: pub [u32; 8],
    admission_revocation_state: pub [u32; 8],
    receipt_leaf: pub [u32; 8],
    admission_nullifier: pub [u32; 8],
    ready_from: pub u64,
    ready_until: pub u64,
    admission_from: pub u64,
    admission_until: pub u64,
    domain: Domain,
    descriptor: ReadyDescriptor,
    readiness_blind: [u8; 32],
    checkpoint_siblings: [[u8; 32]; 6],
    checkpoint_index: u32,
    registry: quorum::Registry,
    rule: statement::Rule,
    rule_siblings: [[u8; 32]; 3],
    rule_index: u8,
    action: capsule::Action,
    effect: receipt::NativeEffect,
    opening: receipt::ReceiptRead,
    observation: statement::Observation,
    wire: WireBinding,
    native_context: NativeContext,
    provider_key_x: [u8; 32],
    provider_key_y: [u8; 32],
    dispatch_signed_at: u64,
    dispatch_signature: [u8; 64],
    delivery_risk_salt: [u8; 32],
    receipt_secret: [u8; 32],
    attester_indexes: [u8; 3],
    attester_signatures: [[u8; 64]; 3],
    current_revoked_entries: [[u8; 32]; 64],
    current_revoked_digest: [u8; 32],
    current_revoked_count: u32,
    current_revocation_sequence: u64,
) {
    let domain_value = encoding::canonical_field(words_to_bytes(domain_commitment));
    // G and historical readinessState are contract joins, not fresh-state
    // claims inside I. These calls still constrain their ORIGINAL F encodings.
    let _authorization_value = encoding::canonical_field(words_to_bytes(authorization_root));
    let _historical_state_value = encoding::canonical_field(words_to_bytes(readiness_evidence_state));
    let join_value = encoding::canonical_field(words_to_bytes(join_commitment));
    let readiness_value = encoding::canonical_field(words_to_bytes(readiness_commitment));
    let revocation_value = encoding::canonical_field(words_to_bytes(admission_revocation_state));
    let leaf_value = encoding::canonical_field(words_to_bytes(receipt_leaf));
    assert(domain_value != 0);
    assert(internal_framing::domain_commitment(domain) == domain_value);
    // Current full profile U uses the original hub-scoped key/terminal tags.
    // A namespace migration is not introduced by parameterizing these hashes.
    assert(domain.ledger_namespace == domain.hub_domain);

    assert(descriptor.scope == domain.scope);
    assert(descriptor.policy == domain.policy);
    assert(descriptor.asset == domain.asset);
    assert(descriptor.hub_domain == domain.hub_domain);
    assert(descriptor.registry_commitment == domain.registry_commitment);
    assert(descriptor.snapshot_digest == words_to_bytes(checkpoint));
    assert(descriptor.ready_from == ready_from);
    assert(descriptor.ready_until == ready_until);
    assert(ready_from < ready_until);
    assert(readiness_framing::readiness_commitment(
        domain_value, join_value, readiness_blind, descriptor,
    ) == readiness_value);
    state::membership(descriptor.snapshot_digest, checkpoint_siblings,
        checkpoint_index, words_to_bytes(accepted_checkpoint_root));

    let hub = domain.hub_domain;
    let registry_id = domain.registry_commitment;
    assert(registry.hub_domain == hub);
    assert(quorum::registry_commitment(registry) == registry_id);
    statement::assert_rule(rule);
    let rule_cm = statement::rule_commitment(rule);
    assert(rule_cm != [0; 32]);
    assert(rule_index < 8);
    let mut rule_root = rule_cm;
    for depth in 0..3 {
        rule_root = if (((rule_index as u32) >> depth) & 1) == 0 {
            state::node_hash(rule_root, rule_siblings[depth])
        } else { state::node_hash(rule_siblings[depth], rule_root) };
    }
    assert(rule_root == registry.rules_root);
    assert(rule_cm == descriptor.evidence_policy);
    assert(statement::chain_domain(rule) == descriptor.chain_domain);
    let gid = facts::assert_native_facts(rule, effect, wire, observation, native_context);

    capsule::assert_action(action);
    assert(capsule_framing::native_transfer_action(action) == descriptor.action_commitment);
    assert(action.chain_domain == descriptor.chain_domain);
    assert(statement::provider_identity(provider_key_x, provider_key_y) == action.signer_identity);
    assert(delivery_risk_salt != [0; 32]);
    let ready_inputs = framing::ready_inputs(descriptor);
    assert(action.delivery_risk_commitment == statement::delivery_risk(
        hub, registry_id, ready_inputs, action, delivery_risk_salt,
    ));
    assert(observation.source_commitment == action.source_commitment);
    assert(observation.destination_commitment == action.destination_commitment);
    assert(observation.amount == action.amount);
    assert(observation.custody_kind == action.custody_kind);
    assert(observation.custody_commitment == action.custody_commitment);

    // The exact SHA key formula is retained with its authenticated namespace.
    // The observer certifies the K extracted from the unique native location.
    let key = receipt::receipt_key_commitment(domain.ledger_namespace, receipt_secret);
    assert(key == action.receipt_key_commitment);
    assert(key == wire.wire_key_commitment);
    assert(key == opening.receipt_key_commitment);

    assert(opening.hub_domain == hub);
    assert(opening.registry_commitment == registry_id);
    assert(opening.global_effect_id == gid);
    assert(opening.scope == descriptor.scope);
    assert(opening.policy == descriptor.policy);
    assert(opening.local_commitment == descriptor.local_commitment);
    assert(opening.dispatch_id == descriptor.dispatch_id);
    assert(opening.chain_domain == action.chain_domain);
    assert(opening.evidence_policy == rule_cm);
    assert(opening.action_commitment == descriptor.action_commitment);
    assert(opening.payout_commitment == descriptor.payout_commitment);
    assert(opening.receipt_rho == action.receipt_rho);

    // Facts expiry may exceed the cutoff. Only the receipt is truncated.
    let receipt_until = if observation.evidence_until < action.settle_before {
        observation.evidence_until
    } else { action.settle_before };
    assert(opening.valid_from == observation.evidence_from);
    assert(opening.valid_until == receipt_until);
    assert(opening.valid_from < opening.valid_until);
    assert(opening.valid_from <= admission_from);
    assert(admission_from < admission_until);
    assert(admission_until <= opening.valid_until);
    assert(observation.evidence_from <= admission_from);
    assert(admission_until <= observation.evidence_until);
    assert(admission_until <= action.settle_before);

    // Historical signing window only. Admission may be later than Ready.
    assert(ready_from <= dispatch_signed_at);
    assert(dispatch_signed_at < ready_until);
    assert(action.execution_from <= dispatch_signed_at);
    assert(dispatch_signed_at < action.execution_until);
    // Preserve original one-sided dispatch/observation clock-skew allowance.
    // Long later finality is allowed; no subtraction is evaluated backwards.
    if observation.observed_at < dispatch_signed_at {
        assert(dispatch_signed_at - observation.observed_at <= rule.maximum_clock_skew);
    }
    let ready_digest = statement::ready_statement(ready_inputs);
    let dispatch_digest = statement::dispatch_statement(
        hub, registry_id, ready_digest, opening, action.delivery_risk_commitment,
        dispatch_signed_at,
    );
    statement::assert_signature(provider_key_x, provider_key_y, dispatch_signature, dispatch_digest);
    let facts_digest = framing::facts_statement(
        domain, rule_cm, effect, gid, wire, observation, native_context,
    );
    quorum::assert_quorum(registry, registry_id, facts_digest, attester_indexes, attester_signatures);

    // ReceiptCM remains the full original SHA digest, privately shared with N's
    // terminal-spend tag. Only the purpose-8 typed receipt-tree leaf is public.
    let receipt_cm = receipt::receipt_commitment(opening);
    assert(internal_framing::receipt_leaf(domain_value, receipt_cm) == leaf_value);
    assert(framing::admission_nullifier(domain.ledger_namespace, receipt_secret, gid)
        == words_to_bytes(admission_nullifier));

    // Distinct CURRENT adverse-state commitment, never historical Ready state.
    // Frozen helper constrains all 64 entries, pairwise uniqueness and padding.
    let expected_revoked = encoding::canonical_field(current_revoked_digest);
    let (computed_revoked, revoked_limbs) = internal_state::bounded_list_digest(
        domain_value, hub, current_revoked_entries, current_revoked_count,
    );
    assert(computed_revoked == expected_revoked);
    let gid_limbs = encoding::raw_digest_limbs(gid);
    for i in 0..64 {
        if i < current_revoked_count { assert(revoked_limbs[i] != gid_limbs); }
    }
    assert(framing::admission_revocation_state(domain_value, expected_revoked,
        current_revoked_count, current_revocation_sequence) == revocation_value);
}
