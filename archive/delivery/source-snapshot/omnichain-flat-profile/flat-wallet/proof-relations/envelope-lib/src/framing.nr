// Fixed additional envelope purposes 11..15. Every preimage is
// [PROFILE, 1, purpose, payloadFieldCount, ...payload]. All B32 values use
// constrained high128/low128 limbs. Full message_size N is a literal.
use poseidon::poseidon2::Poseidon2;
use poseidon_support::encoding::{PROFILE, raw_digest_limbs};
use crate::types::{Funding, Recovery, Settlement, Dependency, Payout};

// Purpose 11: payload 17, complete tuple N=21. operation_id retains the
// original reservation-admission predicate without a redundant stored tag.
pub fn funding_leaf(domain: Field, value: Funding, blind: [u8; 32]) -> Field {
    assert(domain != 0);
    assert(blind != [0; 32]);
    assert(value.funding_not_before < value.funding_valid_until);
    let blinding = raw_digest_limbs(blind);
    let input_commitment = raw_digest_limbs(value.input_commitment);
    let input_nullifier = raw_digest_limbs(value.input_nullifier);
    let reserve_commitment = raw_digest_limbs(value.reserve_commitment);
    let change_commitment = raw_digest_limbs(value.change_commitment);
    let operation_id = raw_digest_limbs(value.operation_id);
    let input: [Field; 21] = [
        PROFILE, 1, 11, 17,
        domain,
        1,
        1,
        blinding[0],
        blinding[1],
        input_commitment[0],
        input_commitment[1],
        input_nullifier[0],
        input_nullifier[1],
        reserve_commitment[0],
        reserve_commitment[1],
        change_commitment[0],
        change_commitment[1],
        operation_id[0],
        operation_id[1],
        value.funding_not_before as Field,
        value.funding_valid_until as Field,
    ];
    Poseidon2::hash(input, 21)
}

// Purpose 12: payload 12, complete tuple N=16.
pub fn recovery_leaf(domain: Field, value: Recovery, blind: [u8; 32]) -> Field {
    assert(domain != 0);
    assert(blind != [0; 32]);
    assert(value.settle_before > 0);
    let blinding = raw_digest_limbs(blind);
    let reserve_commitment = raw_digest_limbs(value.reserve_commitment);
    let reserve_nullifier = raw_digest_limbs(value.reserve_nullifier);
    let recovery_commitment = raw_digest_limbs(value.recovery_commitment);
    let input: [Field; 16] = [
        PROFILE, 1, 12, 12,
        domain,
        2,
        2,
        blinding[0],
        blinding[1],
        reserve_commitment[0],
        reserve_commitment[1],
        reserve_nullifier[0],
        reserve_nullifier[1],
        recovery_commitment[0],
        recovery_commitment[1],
        value.settle_before as Field,
    ];
    Poseidon2::hash(input, 16)
}

// Purpose 13: payload 20, complete tuple N=24.
pub fn settlement_leaf(domain: Field, value: Settlement, blind: [u8; 32]) -> Field {
    assert(domain != 0);
    assert(blind != [0; 32]);
    assert(value.settle_before > 0);
    let blinding = raw_digest_limbs(blind);
    let context = raw_digest_limbs(value.context);
    let reserve_commitment = raw_digest_limbs(value.reserve_commitment);
    let reserve_nullifier = raw_digest_limbs(value.reserve_nullifier);
    let output_0 = raw_digest_limbs(value.outputs[0]);
    let output_1 = raw_digest_limbs(value.outputs[1]);
    let output_2 = raw_digest_limbs(value.outputs[2]);
    let output_3 = raw_digest_limbs(value.outputs[3]);
    let input: [Field; 24] = [
        PROFILE, 1, 13, 20,
        domain,
        3,
        3,
        blinding[0],
        blinding[1],
        context[0],
        context[1],
        reserve_commitment[0],
        reserve_commitment[1],
        reserve_nullifier[0],
        reserve_nullifier[1],
        output_0[0],
        output_0[1],
        output_1[0],
        output_1[1],
        output_2[0],
        output_2[1],
        output_3[0],
        output_3[1],
        value.settle_before as Field,
    ];
    Poseidon2::hash(input, 24)
}

// Purpose 14: payload 70, complete tuple N=74.
pub fn dependency_leaf(domain: Field, value: Dependency, blind: [u8; 32]) -> Field {
    assert(domain != 0);
    assert(blind != [0; 32]);
    assert(value.target_slot < 4);
    assert(value.dependency_count <= 3);
    for i in 0..3 { assert(value.predecessors[i].source_slot < 4); }
    let index: u8 = 8 + value.target_slot;
    let blinding = raw_digest_limbs(blind);
    let target_context = raw_digest_limbs(value.target_context);
    let predecessor_0_source_node_commitment = raw_digest_limbs(value.predecessors[0].source_node_commitment);
    let predecessor_0_source_local_commitment = raw_digest_limbs(value.predecessors[0].source_local_commitment);
    let predecessor_0_source_dispatch_id = raw_digest_limbs(value.predecessors[0].source_dispatch_id);
    let predecessor_0_chain_domain = raw_digest_limbs(value.predecessors[0].chain_domain);
    let predecessor_0_evidence_policy = raw_digest_limbs(value.predecessors[0].evidence_policy);
    let predecessor_0_action_commitment = raw_digest_limbs(value.predecessors[0].action_commitment);
    let predecessor_0_payout_commitment = raw_digest_limbs(value.predecessors[0].payout_commitment);
    let predecessor_0_receipt_key_commitment = raw_digest_limbs(value.predecessors[0].receipt_key_commitment);
    let predecessor_0_receipt_rho = raw_digest_limbs(value.predecessors[0].receipt_rho);
    let predecessor_1_source_node_commitment = raw_digest_limbs(value.predecessors[1].source_node_commitment);
    let predecessor_1_source_local_commitment = raw_digest_limbs(value.predecessors[1].source_local_commitment);
    let predecessor_1_source_dispatch_id = raw_digest_limbs(value.predecessors[1].source_dispatch_id);
    let predecessor_1_chain_domain = raw_digest_limbs(value.predecessors[1].chain_domain);
    let predecessor_1_evidence_policy = raw_digest_limbs(value.predecessors[1].evidence_policy);
    let predecessor_1_action_commitment = raw_digest_limbs(value.predecessors[1].action_commitment);
    let predecessor_1_payout_commitment = raw_digest_limbs(value.predecessors[1].payout_commitment);
    let predecessor_1_receipt_key_commitment = raw_digest_limbs(value.predecessors[1].receipt_key_commitment);
    let predecessor_1_receipt_rho = raw_digest_limbs(value.predecessors[1].receipt_rho);
    let predecessor_2_source_node_commitment = raw_digest_limbs(value.predecessors[2].source_node_commitment);
    let predecessor_2_source_local_commitment = raw_digest_limbs(value.predecessors[2].source_local_commitment);
    let predecessor_2_source_dispatch_id = raw_digest_limbs(value.predecessors[2].source_dispatch_id);
    let predecessor_2_chain_domain = raw_digest_limbs(value.predecessors[2].chain_domain);
    let predecessor_2_evidence_policy = raw_digest_limbs(value.predecessors[2].evidence_policy);
    let predecessor_2_action_commitment = raw_digest_limbs(value.predecessors[2].action_commitment);
    let predecessor_2_payout_commitment = raw_digest_limbs(value.predecessors[2].payout_commitment);
    let predecessor_2_receipt_key_commitment = raw_digest_limbs(value.predecessors[2].receipt_key_commitment);
    let predecessor_2_receipt_rho = raw_digest_limbs(value.predecessors[2].receipt_rho);
    let capsule_salt = raw_digest_limbs(value.capsule_salt);
    let target_join_blind = raw_digest_limbs(value.target_join_blind);
    let input: [Field; 74] = [
        PROFILE, 1, 14, 70,
        domain,
        index as Field,
        5,
        blinding[0],
        blinding[1],
        value.target_slot as Field,
        target_context[0],
        target_context[1],
        value.dependency_count as Field,
        value.predecessors[0].source_slot as Field,
        predecessor_0_source_node_commitment[0],
        predecessor_0_source_node_commitment[1],
        predecessor_0_source_local_commitment[0],
        predecessor_0_source_local_commitment[1],
        predecessor_0_source_dispatch_id[0],
        predecessor_0_source_dispatch_id[1],
        predecessor_0_chain_domain[0],
        predecessor_0_chain_domain[1],
        predecessor_0_evidence_policy[0],
        predecessor_0_evidence_policy[1],
        predecessor_0_action_commitment[0],
        predecessor_0_action_commitment[1],
        predecessor_0_payout_commitment[0],
        predecessor_0_payout_commitment[1],
        predecessor_0_receipt_key_commitment[0],
        predecessor_0_receipt_key_commitment[1],
        predecessor_0_receipt_rho[0],
        predecessor_0_receipt_rho[1],
        value.predecessors[1].source_slot as Field,
        predecessor_1_source_node_commitment[0],
        predecessor_1_source_node_commitment[1],
        predecessor_1_source_local_commitment[0],
        predecessor_1_source_local_commitment[1],
        predecessor_1_source_dispatch_id[0],
        predecessor_1_source_dispatch_id[1],
        predecessor_1_chain_domain[0],
        predecessor_1_chain_domain[1],
        predecessor_1_evidence_policy[0],
        predecessor_1_evidence_policy[1],
        predecessor_1_action_commitment[0],
        predecessor_1_action_commitment[1],
        predecessor_1_payout_commitment[0],
        predecessor_1_payout_commitment[1],
        predecessor_1_receipt_key_commitment[0],
        predecessor_1_receipt_key_commitment[1],
        predecessor_1_receipt_rho[0],
        predecessor_1_receipt_rho[1],
        value.predecessors[2].source_slot as Field,
        predecessor_2_source_node_commitment[0],
        predecessor_2_source_node_commitment[1],
        predecessor_2_source_local_commitment[0],
        predecessor_2_source_local_commitment[1],
        predecessor_2_source_dispatch_id[0],
        predecessor_2_source_dispatch_id[1],
        predecessor_2_chain_domain[0],
        predecessor_2_chain_domain[1],
        predecessor_2_evidence_policy[0],
        predecessor_2_evidence_policy[1],
        predecessor_2_action_commitment[0],
        predecessor_2_action_commitment[1],
        predecessor_2_payout_commitment[0],
        predecessor_2_payout_commitment[1],
        predecessor_2_receipt_key_commitment[0],
        predecessor_2_receipt_key_commitment[1],
        predecessor_2_receipt_rho[0],
        predecessor_2_receipt_rho[1],
        capsule_salt[0],
        capsule_salt[1],
        target_join_blind[0],
        target_join_blind[1],
    ];
    Poseidon2::hash(input, 74)
}

// Purpose 15: payload 8, complete tuple N=12.
pub fn payout_leaf(domain: Field, value: Payout, blind: [u8; 32]) -> Field {
    assert(domain != 0);
    assert(blind != [0; 32]);
    assert(value.slot < 4);
    let index: u8 = 12 + value.slot;
    let blinding = raw_digest_limbs(blind);
    let commitment = raw_digest_limbs(value.commitment);
    let input: [Field; 12] = [
        PROFILE, 1, 15, 8,
        domain,
        index as Field,
        6,
        blinding[0],
        blinding[1],
        value.slot as Field,
        commitment[0],
        commitment[1],
    ];
    Poseidon2::hash(input, 12)
}
