use generic_graph::sha256::{sha256, words_to_bytes};

// Existing legacy depth-six note tree, not the PAEG graph tree.
// Its node hash has the exact byte prefix 0x01 and no length framing.
fn node(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    let mut message: [u8; 65] = [0; 65];
    message[0] = 1;
    for i in 0..32 {
        message[1 + i] = left[i];
        message[33 + i] = right[i];
    }
    sha256::<65, 128>(message)
}

pub fn assert_member(
    commitment: [u32; 8],
    siblings: [[u8; 32]; 6],
    leaf_index: u32,
    root: [u32; 8],
) {
    assert(leaf_index < 64);
    let mut current = words_to_bytes(commitment);
    for depth in 0..6 {
        current = if ((leaf_index >> depth) & 1) == 0 {
            node(current, siblings[depth])
        } else {
            node(siblings[depth], current)
        };
    }
    assert(current == words_to_bytes(root));
}
