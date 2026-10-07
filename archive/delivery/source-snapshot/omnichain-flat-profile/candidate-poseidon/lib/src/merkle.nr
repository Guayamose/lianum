// Kind 0 authorization/depth6, kind 1 envelope/depth4, kind 2 receipts/depth6.
// Every node binds domain, kind and parent level. Live leaves are occupied
// typed commitments, never zero or the tree's typed empty leaf.
use crate::encoding::canonical_field;
use crate::framing::{empty_leaf, node_hash};

fn assert_tree_depth<let DEPTH: u32>(tree_kind: u8) {
    assert(((tree_kind == 1) & (DEPTH == 4))
        | (((tree_kind == 0) | (tree_kind == 2)) & (DEPTH == 6)));
}

pub fn membership<let DEPTH: u32>(
    domain: Field,
    tree_kind: u8,
    leaf: Field,
    siblings: [[u8; 32]; DEPTH],
    index: u32,
    root: Field,
) {
    assert_tree_depth::<DEPTH>(tree_kind);
    // Bounds precede direction-bit extraction. Private original sibling bytes
    // are range-checked against Fr before reconstruction; no modular aliases.
    assert(index < (1 << DEPTH));
    assert(leaf != 0);
    assert(leaf != empty_leaf(domain, tree_kind));
    let mut current = leaf;
    for level in 0..DEPTH {
        let sibling = canonical_field(siblings[level]);
        let left = if ((index >> level) & 1) == 0 { current } else { sibling };
        let right = if ((index >> level) & 1) == 0 { sibling } else { current };
        current = node_hash(domain, tree_kind, (level + 1) as u8, left, right);
    }
    assert(current == root);
}

// Canonical empty subtree, for reuse by explicit tree construction. Zero is
// never substituted for the typed empty leaf. Level zero starts at purpose 9;
// each subsequent level uses the same kind/domain and exact parent level.
pub fn empty_subtree<let DEPTH: u32>(domain: Field, tree_kind: u8) -> Field {
    assert_tree_depth::<DEPTH>(tree_kind);
    let mut current = empty_leaf(domain, tree_kind);
    for level in 0..DEPTH {
        current = node_hash(domain, tree_kind, (level + 1) as u8, current, current);
    }
    current
}
