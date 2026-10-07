// Fixed internal schema only; native receipt bytes, K and terminal tag stay SHA.
// Official unmodified Poseidon2 package pinned by UPSTREAM-PROVENANCE.json.
// Headers are [PROFILE, version=1, purpose, payload_count]. Each call's second
// argument is the literal WHOLE tuple length, never a witness or payload count.
use poseidon::poseidon2::Poseidon2;
use crate::encoding::{PROFILE, canonical_field, raw_digest_limbs};
use crate::types::{Domain, Core, Local, Completion};

// Purpose 1: 14 payload fields; full hash message_size is 18.
pub fn domain_commitment(
    domain: Domain,
) -> Field {
    assert(domain.scope != [0; 32]);
    assert(domain.policy != [0; 32]);
    assert(domain.asset != [0; 32]);
    assert(domain.hub_domain != [0; 32]);
    assert(domain.registry_commitment != [0; 32]);
    assert(domain.verifier_set_commitment != [0; 32]);
    assert(domain.ledger_namespace != [0; 32]);
    let scope = raw_digest_limbs(domain.scope);
    let policy = raw_digest_limbs(domain.policy);
    let asset = raw_digest_limbs(domain.asset);
    let hub_domain = raw_digest_limbs(domain.hub_domain);
    let registry_commitment = raw_digest_limbs(domain.registry_commitment);
    let verifier_set_commitment = raw_digest_limbs(domain.verifier_set_commitment);
    let ledger_namespace = raw_digest_limbs(domain.ledger_namespace);
    let input: [Field; 18] = [
        PROFILE, 1, 1, 14,
        scope[0],
        scope[1],
        policy[0],
        policy[1],
        asset[0],
        asset[1],
        hub_domain[0],
        hub_domain[1],
        registry_commitment[0],
        registry_commitment[1],
        verifier_set_commitment[0],
        verifier_set_commitment[1],
        ledger_namespace[0],
        ledger_namespace[1],
    ];
    Poseidon2::hash(input, 18)
}

// Purpose 2: 12 payload fields; full hash message_size is 16.
pub fn core_leaf(
    domain: Field,
    core: Core,
    blind: [u8; 32],
) -> Field {
    assert(domain != 0);
    assert(blind != [0; 32]);
    assert(core.settle_before > 0);
    let blinding = raw_digest_limbs(blind);
    let context = raw_digest_limbs(core.context);
    let reserve_commitment = raw_digest_limbs(core.reserve_commitment);
    let reserve_nullifier = raw_digest_limbs(core.reserve_nullifier);
    let input: [Field; 16] = [
        PROFILE, 1, 2, 12,
        domain,
        0,
        0,
        blinding[0],
        blinding[1],
        context[0],
        context[1],
        reserve_commitment[0],
        reserve_commitment[1],
        reserve_nullifier[0],
        reserve_nullifier[1],
        core.settle_before as Field,
    ];
    Poseidon2::hash(input, 16)
}

// Purpose 3: 33 payload fields; full hash message_size is 37.
pub fn local_leaf(
    domain: Field,
    local: Local,
    blind: [u8; 32],
) -> Field {
    assert(domain != 0);
    assert(blind != [0; 32]);
    assert(local.slot < 4);
    let index: u8 = 4 + local.slot;
    let blinding = raw_digest_limbs(blind);
    let target_context = raw_digest_limbs(local.target_context);
    let node_commitment = raw_digest_limbs(local.node_commitment);
    let local_commitment = raw_digest_limbs(local.local_commitment);
    let dispatch_id = raw_digest_limbs(local.dispatch_id);
    let chain_domain = raw_digest_limbs(local.chain_domain);
    let evidence_policy = raw_digest_limbs(local.evidence_policy);
    let action_commitment = raw_digest_limbs(local.action_commitment);
    let payout_commitment = raw_digest_limbs(local.payout_commitment);
    let receipt_key_commitment = raw_digest_limbs(local.receipt_key_commitment);
    let receipt_rho = raw_digest_limbs(local.receipt_rho);
    let dummy_terminal_tag = raw_digest_limbs(local.dummy_terminal_tag);
    let capsule_salt = raw_digest_limbs(local.capsule_salt);
    let target_join_blind = raw_digest_limbs(local.target_join_blind);
    let input: [Field; 37] = [
        PROFILE, 1, 3, 33,
        domain,
        index as Field,
        4,
        blinding[0],
        blinding[1],
        local.slot as Field,
        local.active as Field,
        target_context[0],
        target_context[1],
        node_commitment[0],
        node_commitment[1],
        local_commitment[0],
        local_commitment[1],
        dispatch_id[0],
        dispatch_id[1],
        chain_domain[0],
        chain_domain[1],
        evidence_policy[0],
        evidence_policy[1],
        action_commitment[0],
        action_commitment[1],
        payout_commitment[0],
        payout_commitment[1],
        receipt_key_commitment[0],
        receipt_key_commitment[1],
        receipt_rho[0],
        receipt_rho[1],
        dummy_terminal_tag[0],
        dummy_terminal_tag[1],
        capsule_salt[0],
        capsule_salt[1],
        target_join_blind[0],
        target_join_blind[1],
    ];
    Poseidon2::hash(input, 37)
}

// Purpose 4: 18 payload fields; full hash message_size is 22.
pub fn completion_commitment(
    domain: Field,
    envelope: Field,
    statement: Completion,
    blind: [u8; 32],
) -> Field {
    assert(domain != 0);
    assert(envelope != 0);
    assert(blind != [0; 32]);
    assert(statement.slot < 4);
    assert(statement.valid_from < statement.valid_until);
    let evidence_state = canonical_field(statement.evidence_state);
    let blinding = raw_digest_limbs(blind);
    let hub_domain = raw_digest_limbs(statement.hub_domain);
    let registry_commitment = raw_digest_limbs(statement.registry_commitment);
    let context = raw_digest_limbs(statement.context);
    let payout_commitment = raw_digest_limbs(statement.payout_commitment);
    let terminal_receipt_tag = raw_digest_limbs(statement.terminal_receipt_tag);
    let input: [Field; 22] = [
        PROFILE, 1, 4, 18,
        domain,
        envelope,
        blinding[0],
        blinding[1],
        hub_domain[0],
        hub_domain[1],
        registry_commitment[0],
        registry_commitment[1],
        evidence_state,
        context[0],
        context[1],
        payout_commitment[0],
        payout_commitment[1],
        terminal_receipt_tag[0],
        terminal_receipt_tag[1],
        statement.slot as Field,
        statement.valid_from as Field,
        statement.valid_until as Field,
    ];
    Poseidon2::hash(input, 22)
}

// Purpose 7: 2 payload fields; full hash message_size is 6.
pub fn authorization_leaf(
    domain: Field,
    envelope: Field,
) -> Field {
    assert(domain != 0);
    assert(envelope != 0);

    let input: [Field; 6] = [
        PROFILE, 1, 7, 2,
        domain,
        envelope,
    ];
    Poseidon2::hash(input, 6)
}

// Purpose 8: 4 payload fields; full hash message_size is 8.
pub fn receipt_leaf(
    domain: Field,
    receipt_commitment: [u8; 32],
) -> Field {
    assert(domain != 0);
    assert(receipt_commitment != [0; 32]);
    let receipt = raw_digest_limbs(receipt_commitment);
    let input: [Field; 8] = [
        PROFILE, 1, 8, 4,
        domain,
        2,
        receipt[0],
        receipt[1],
    ];
    Poseidon2::hash(input, 8)
}

// Purpose 9: 2 payload fields; full hash message_size is 6.
pub fn empty_leaf(
    domain: Field,
    tree_kind: u8,
) -> Field {
    assert(domain != 0);
    assert(tree_kind <= 2);

    let input: [Field; 6] = [
        PROFILE, 1, 9, 2,
        domain,
        tree_kind as Field,
    ];
    Poseidon2::hash(input, 6)
}

// Purpose 10: 5 payload fields; full hash message_size is 9.
pub fn node_hash(
    domain: Field,
    tree_kind: u8,
    parent_level: u8,
    left: Field,
    right: Field,
) -> Field {
    assert(domain != 0);
    assert(tree_kind <= 2);
    let depth: u8 = if tree_kind == 1 { 4 } else { 6 };
    assert((parent_level >= 1) & (parent_level <= depth));

    let input: [Field; 9] = [
        PROFILE, 1, 10, 5,
        domain,
        tree_kind as Field,
        parent_level as Field,
        left,
        right,
    ];
    Poseidon2::hash(input, 9)
}

