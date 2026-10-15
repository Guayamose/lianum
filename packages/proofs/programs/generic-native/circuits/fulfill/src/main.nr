// T131 consumes the existing funded A0 authorization and fixed four-position
// A98 completion. A0's economics, padding and F51 recovery branch are unchanged.
// The pool must check recognized roots, current hub state/time, and freshness,
// then atomically consume this reserve nullifier and all four terminal tags.
use generic_wrappers::{owner, membership};
use native_support::capsule_framing;
use graph_support::sha256::words_to_bytes;

fn digest(inputs: [Field; 98], offset: u32) -> [u32; 8] {
    assert(offset <= 88);
    let mut words: [u32; 8] = [0; 8];
    for i in 0..8 {
        words[i] = inputs[offset + i] as u32;
        assert(words[i] as Field == inputs[offset + i]);
    }
    words
}

fn timestamp(value: Field) -> u64 {
    let result = value as u64;
    assert(result as Field == value);
    result
}

fn main(
    scope: pub [u32; 8],
    policy: pub [u32; 8],
    asset: pub [u32; 8],
    accepted_pool_root: pub [u32; 8],
    hub_domain: pub [u32; 8],
    registry_commitment: pub [u32; 8],
    evidence_state: pub [u32; 8],
    reserve_nullifier: pub [u32; 8],
    outputs: pub [[u32; 8]; 4],
    terminal_receipt_tags: pub [[u32; 8]; 4],
    settle_before: pub u64,
    valid_from: pub u64,
    valid_until: pub u64,
    owner_vk: [Field; 115],
    owner_proof: [Field; 458],
    owner_inputs: [Field; 139],
    aggregate_proof: [Field; 458],
    aggregate_inputs: [Field; 98],
    reserve_siblings: [[u8; 32]; 6],
    reserve_leaf_index: u32,
) {
    // owner::verify compares the complete VK to the frozen literal A0 key,
    // verifies its proof, and range-constrains all 139 statement fields.
    owner::verify(owner_vk, owner_proof, owner_inputs);
    approved_aggregate_all::verify(aggregate_proof, aggregate_inputs);
    assert(owner::digest(owner_inputs, 0) == scope);
    assert(owner::digest(owner_inputs, 8) == policy);
    assert(owner::digest(owner_inputs, 16) == asset);
    assert(owner::digest(owner_inputs, 80) == reserve_nullifier);
    assert(owner::timestamp(owner_inputs, 138) == settle_before);

    // Hash every exact A0 digest and time under the same literal framing C129
    // used. Neither a caller-provided context nor a partial A0 hash suffices.
    let mut owner_digests: [[u8; 32]; 17] = [[0; 32]; 17];
    for i in 0..17 {
        owner_digests[i] = words_to_bytes(owner::digest(owner_inputs, i * 8));
    }
    let owner_times = [
        owner::timestamp(owner_inputs, 136),
        owner::timestamp(owner_inputs, 137),
        owner::timestamp(owner_inputs, 138),
    ];
    let context = capsule_framing::a0_context(owner_digests, owner_times);
    assert(words_to_bytes(digest(aggregate_inputs, 24)) == context);
    assert(digest(aggregate_inputs, 0) == hub_domain);
    assert(digest(aggregate_inputs, 8) == registry_commitment);
    assert(digest(aggregate_inputs, 16) == evidence_state);
    assert(timestamp(aggregate_inputs[96]) == valid_from);
    assert(timestamp(aggregate_inputs[97]) == valid_until);
    assert(valid_from < valid_until);
    assert(valid_until <= settle_before);

    for i in 0..4 {
        // A0 authenticates exact recipient economics and nonspendable padding;
        // A98 authenticates completion for the same position under that A0.
        assert(owner::digest(owner_inputs, 96 + i * 8) == outputs[i]);
        assert(digest(aggregate_inputs, 32 + i * 8) == outputs[i]);
        assert(digest(aggregate_inputs, 64 + i * 8) == terminal_receipt_tags[i]);
        assert(outputs[i] != [0; 8]);
        assert(terminal_receipt_tags[i] != [0; 8]);
        for j in 0..4 {
            if j < i {
                assert(outputs[i] != outputs[j]);
                assert(terminal_receipt_tags[i] != terminal_receipt_tags[j]);
            }
        }
    }

    // Preserve F51's exact depth-six pool membership contract and reserve NF.
    // Accepted-root recognition and the fulfill/refund race are pool checks.
    membership::assert_member(
        owner::digest(owner_inputs, 72), reserve_siblings, reserve_leaf_index,
        accepted_pool_root,
    );
}
