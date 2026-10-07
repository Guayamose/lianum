// A98 always joins pair 0 and pair 1 under the literal A67 key. This inherits
// exactly four authenticated Node positions while exposing no active count,
// dependency mask, or graph/capsule opening.

fn digest(inputs: [Field; 67], offset: u32) -> [u32; 8] {
    assert(offset <= 56);
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
    payouts: pub [[u32; 8]; 4],
    tags: pub [[u32; 8]; 4],
    valid_from: pub u64,
    valid_until: pub u64,
    pair_proofs: [[Field; 458]; 2],
    pair_inputs: [[Field; 67]; 2],
) {
    assert(valid_from < valid_until);
    let common = [hub_domain, registry_commitment, evidence_state, context];

    for pair in 0..2 {
        let inputs = pair_inputs[pair];
        approved_aggregate_pair::verify(pair_proofs[pair], inputs);
        for field in 0..4 {
            assert(digest(inputs, field * 8) == common[field]);
        }
        assert(byte(inputs[64]) as u32 == pair);
        assert(timestamp(inputs[65]) == valid_from);
        assert(timestamp(inputs[66]) == valid_until);
        for child in 0..2 {
            let slot = pair * 2 + child;
            assert(digest(inputs, 32 + child * 8) == payouts[slot]);
            assert(digest(inputs, 48 + child * 8) == tags[slot]);
        }
    }

    // Check across both pairs, not only within each A67 child. Padding uses
    // authenticated nonzero opaque commitments/tags and obeys the same rules.
    for i in 0..4 {
        assert(payouts[i] != [0; 8]);
        assert(tags[i] != [0; 8]);
        for j in 0..4 {
            if j < i {
                assert(payouts[i] != payouts[j]);
                assert(tags[i] != tags[j]);
            }
        }
    }
}
