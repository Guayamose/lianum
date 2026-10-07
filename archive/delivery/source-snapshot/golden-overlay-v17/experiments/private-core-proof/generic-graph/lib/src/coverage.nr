// Reusable algebraic coverage constraints, NOT a native-proof verifier.
// There is intentionally no executable coverage circuit. A future consumer
// must first verify each registered Native/Empty proof against literal pinned
// verification keys and bind its authenticated public inputs to these slots.
// Passing witness values to this helper cannot establish native truth.
use crate::graph::{Statement, Witness, assert_graph};

pub struct Slot {
    pub scope: [u8; 32],
    pub policy: [u8; 32],
    pub operation_id: [u8; 32],
    pub graph_commitment: [u8; 32],
    pub index: u8,
    pub active: bool,
    pub coverage_mask: u8,
    pub prerequisite_mask: u8,
    pub node_commitment: [u8; 32],
    pub chain_domain: [u8; 32],
    pub evidence_policy: [u8; 32],
    pub action_commitment: [u8; 32],
    pub payout_commitment: [u8; 32],
    // Must be derived by the verified native leaf from scope, native domain
    // and the canonical consumed effect. It is not a caller-chosen identifier.
    pub effect_nullifier: [u8; 32],
}

pub fn join_masks(left: u8, right: u8) -> u8 {
    assert(left < 16);
    assert(right < 16);
    assert((left & right) == 0);
    left | right
}

pub fn assert_complete_coverage(statement: Statement, witness: Witness, slots: [Slot; 4]) {
    let opening = assert_graph(statement, witness);
    let mut expected_mask: u8 = 0;
    for i in 0..4 {
        let slot = slots[i];
        assert(slot.scope == statement.scope);
        assert(slot.policy == statement.policy);
        assert(slot.operation_id == statement.operation_id);
        assert(slot.graph_commitment == statement.graph_commitment);
        assert(slot.index == i as u8);
        assert(slot.node_commitment == opening.leaves[i]);
        assert(slot.prerequisite_mask == opening.dependency_masks[i]);
        if i < witness.active_count as u32 {
            assert(slot.active);
            let bit = 1 as u8 << (i as u8);
            assert(slot.coverage_mask == bit);
            expected_mask = expected_mask | bit;
            assert(slot.chain_domain == witness.chain_domains[i]);
            assert(slot.evidence_policy == witness.evidence_policies[i]);
            assert(slot.action_commitment == witness.action_commitments[i]);
            assert(slot.payout_commitment == witness.payout_commitments[i]);
            assert(slot.effect_nullifier != [0; 32]);
            for j in 0..4 {
                if j < i { assert(slot.effect_nullifier != slots[j].effect_nullifier); }
            }
        } else {
            assert(!slot.active);
            assert(slot.coverage_mask == 0);
            assert(slot.chain_domain == [0; 32]);
            assert(slot.evidence_policy == [0; 32]);
            assert(slot.action_commitment == [0; 32]);
            assert(slot.payout_commitment == [0; 32]);
            assert(slot.effect_nullifier == [0; 32]);
        }
    }
    // Fixed two-level binary aggregation algebra. Actual recursive verifiers
    // and their acyclic key pins must be added separately, never stubbed here.
    let left = join_masks(slots[0].coverage_mask, slots[1].coverage_mask);
    let right = join_masks(slots[2].coverage_mask, slots[3].coverage_mask);
    assert(join_masks(left, right) == expected_mask);
}
