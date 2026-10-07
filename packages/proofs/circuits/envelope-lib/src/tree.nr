// Exact depth-four kind-1 envelope, all sixteen occupied typed leaves.
use poseidon_support::framing::{empty_leaf, node_hash};

pub fn envelope_root(domain: Field, leaves: [Field; 16]) -> Field {
    let empty = empty_leaf(domain, 1);
    for i in 0..16 { assert(leaves[i] != 0); assert(leaves[i] != empty); }
    let mut level_one: [Field; 8] = [0; 8];
    for i in 0..8 { level_one[i] = node_hash(domain, 1, 1, leaves[i * 2], leaves[i * 2 + 1]); }
    let mut level_two: [Field; 4] = [0; 4];
    for i in 0..4 { level_two[i] = node_hash(domain, 1, 2, level_one[i * 2], level_one[i * 2 + 1]); }
    let mut level_three: [Field; 2] = [0; 2];
    for i in 0..2 { level_three[i] = node_hash(domain, 1, 3, level_two[i * 2], level_two[i * 2 + 1]); }
    node_hash(domain, 1, 4, level_three[0], level_three[1])
}

