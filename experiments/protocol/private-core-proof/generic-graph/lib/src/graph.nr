use crate::framing;

// Exactly one bounded profile. Count, order, edges, domain and evidence policy
// are witnesses, never source-generation parameters or chain-specific branches.
pub struct Statement {
    pub scope: [u8; 32],
    pub policy: [u8; 32],
    pub operation_id: [u8; 32],
    pub graph_commitment: [u8; 32],
    pub expires_at: u64,
    pub reserved_commitment: [u8; 32],
    pub recovery_commitment: [u8; 32],
}

pub struct Witness {
    pub nonce: [u8; 32],
    pub active_count: u8,
    pub node_ids: [[u8; 64]; 4],
    pub node_id_lengths: [u8; 4],
    pub dependency_counts: [u8; 4],
    pub dependency_indexes: [[u8; 3]; 4],
    pub chain_domains: [[u8; 32]; 4],
    pub evidence_policies: [[u8; 32]; 4],
    pub action_commitments: [[u8; 32]; 4],
    pub payout_commitments: [[u8; 32]; 4],
}

pub struct Opening {
    pub leaves: [[u8; 32]; 4],
    pub dependency_masks: [u8; 4],
    pub tree_root: [u8; 32],
}

fn is_alphanumeric(byte: u8) -> bool {
    ((byte >= 48) & (byte <= 57))
        | ((byte >= 65) & (byte <= 90))
        | ((byte >= 97) & (byte <= 122))
}

fn assert_node_id(bytes: [u8; 64], length: u8) {
    assert((length >= 1) & (length <= 64));
    assert(is_alphanumeric(bytes[0]));
    for j in 0..64 {
        if j < length as u32 {
            assert(is_alphanumeric(bytes[j]) | (bytes[j] == 46) | (bytes[j] == 95) | (bytes[j] == 45));
        } else { assert(bytes[j] == 0); }
    }
}

fn dependency_mask(index: u32, count: u8, dependencies: [u8; 3]) -> u8 {
    assert(count <= 3);
    let mut mask: u8 = 0;
    for d in 0..3 {
        if d < count as u32 {
            // Every edge goes strictly backwards. This implies active parents,
            // no self edge, no cycle and no edge into padding.
            assert((dependencies[d] as u32) < index);
            if d > 0 { assert(dependencies[d] > dependencies[d - 1]); }
            mask = mask | (1 as u8 << dependencies[d]);
        } else { assert(dependencies[d] == 0); }
    }
    mask
}

pub fn assert_graph(statement: Statement, witness: Witness) -> Opening {
    assert(statement.scope != [0; 32]);
    assert(statement.policy != [0; 32]);
    assert(statement.operation_id != [0; 32]);
    assert(statement.reserved_commitment != [0; 32]);
    assert(statement.recovery_commitment != [0; 32]);
    assert(statement.expires_at > 0);
    assert(witness.nonce != [0; 32]);
    assert((witness.active_count >= 1) & (witness.active_count <= 4));

    let mut leaves: [[u8; 32]; 4] = [[0; 32]; 4];
    let mut dependency_masks: [u8; 4] = [0; 4];
    for i in 0..4 {
        if i < witness.active_count as u32 {
            assert_node_id(witness.node_ids[i], witness.node_id_lengths[i]);
            assert(witness.chain_domains[i] != [0; 32]);
            assert(witness.evidence_policies[i] != [0; 32]);
            assert(witness.action_commitments[i] != [0; 32]);
            assert(witness.payout_commitments[i] != [0; 32]);
            for j in 0..4 {
                if j < i {
                    // ASCII IDs have unique zero-padded representations.
                    assert(witness.node_ids[i] != witness.node_ids[j]);
                }
            }
            let mask = dependency_mask(i, witness.dependency_counts[i], witness.dependency_indexes[i]);
            dependency_masks[i] = mask;
            let salt = framing::node_salt(witness.nonce, witness.node_ids[i], witness.node_id_lengths[i]);
            leaves[i] = framing::node(
                statement.scope, statement.policy, statement.operation_id,
                [i as u8, mask], witness.chain_domains[i], witness.evidence_policies[i],
                witness.action_commitments[i], witness.payout_commitments[i], salt,
            );
        } else {
            // Inactive witness data cannot carry hidden obligations or dangling
            // edges. Padding commitments are domain-separated and index-bound.
            assert(witness.node_ids[i] == [0; 64]);
            assert(witness.node_id_lengths[i] == 0);
            assert(witness.dependency_counts[i] == 0);
            assert(witness.dependency_indexes[i] == [0; 3]);
            assert(witness.chain_domains[i] == [0; 32]);
            assert(witness.evidence_policies[i] == [0; 32]);
            assert(witness.action_commitments[i] == [0; 32]);
            assert(witness.payout_commitments[i] == [0; 32]);
            leaves[i] = framing::empty_node(
                statement.scope, statement.policy, statement.operation_id, [i as u8], witness.nonce,
            );
        }
    }
    let left = framing::tree(leaves[0], leaves[1]);
    let right = framing::tree(leaves[2], leaves[3]);
    let tree_root = framing::tree(left, right);
    let commitment = framing::graph(
        statement.scope, statement.policy, statement.operation_id,
        statement.expires_at, statement.reserved_commitment, statement.recovery_commitment,
        tree_root, [witness.active_count], witness.nonce,
    );
    assert(commitment == statement.graph_commitment);
    Opening { leaves, dependency_masks, tree_root }
}
