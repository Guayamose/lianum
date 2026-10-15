// A67 verifies both fixed positions under the same literal N51 key. The
// assembler receives authenticated opaque statements, never active flags,
// capsule openings, graph topology, or receipt spend secrets.

fn digest(inputs: [Field; 51], offset: u32) -> [u32; 8] {
    assert(offset <= 40);
    let mut words: [u32; 8] = [0; 8];
    for i in 0..8 {
        words[i] = inputs[offset + i] as u32;
        assert(words[i] as Field == inputs[offset + i]);
    }
    words
}

fn byte(value: Field) -> u8 {
    let result = value as u8;
    assert(result as Field == value);
    result
}

fn timestamp(value: Field) -> u64 {
    let result = value as u64;
    assert(result as Field == value);
    result
}

fn main(
    hub_domain: pub [u32; 8],
    registry_commitment: pub [u32; 8],
    evidence_state: pub [u32; 8],
    context: pub [u32; 8],
    payouts: pub [[u32; 8]; 2],
    tags: pub [[u32; 8]; 2],
    pair_index: pub u8,
    valid_from: pub u64,
    valid_until: pub u64,
    node_proofs: [[Field; 458]; 2],
    node_inputs: [[Field; 51]; 2],
) {
    assert(pair_index < 2);
    assert(valid_from < valid_until);
    let common = [hub_domain, registry_commitment, evidence_state, context];

    // Both proofs are mandatory, including C-authenticated empty slots. Exact
    // positional coverage forbids a caller-selected mask or repeated Node.
    for child in 0..2 {
        let inputs = node_inputs[child];
        approved_node::verify(node_proofs[child], inputs);
        for field in 0..4 {
            assert(digest(inputs, field * 8) == common[field]);
        }
        assert(digest(inputs, 32) == payouts[child]);
        assert(digest(inputs, 40) == tags[child]);
        assert(byte(inputs[48]) as u32 == (pair_index as u32) * 2 + child);
        assert(timestamp(inputs[49]) == valid_from);
        assert(timestamp(inputs[50]) == valid_until);
        assert(payouts[child] != [0; 8]);
        assert(tags[child] != [0; 8]);
    }
    assert(payouts[0] != payouts[1]);
    assert(tags[0] != tags[1]);
}
