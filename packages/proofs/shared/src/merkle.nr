// The envelope has exactly sixteen typed leaves. Authorization and receipt
// trees use the existing six-level state::membership helper instead.
use native_support::state::node_hash;

pub fn envelope_membership(
    leaf: [u8; 32],
    siblings: [[u8; 32]; 4],
    index: u32,
    envelope: [u8; 32],
) {
    // Range-check before deriving direction bits. No truncation or wraparound.
    assert(index < 16);
    assert(leaf != [0; 32]);
    let mut current = leaf;
    for depth in 0..4 {
        current = if ((index >> depth) & 1) == 0 {
            node_hash(current, siblings[depth])
        } else {
            node_hash(siblings[depth], current)
        };
    }
    assert(current == envelope);
}

