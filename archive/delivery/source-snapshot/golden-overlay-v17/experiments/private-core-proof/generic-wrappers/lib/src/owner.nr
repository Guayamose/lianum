use crate::{approved_owner_key, bb_proof_verification};

// A0 is an intermediate proof. Its entire public statement becomes a private
// witness here: no input commitment, operation ID, graph or payout tuple leaks
// through either final public ABI.
pub fn verify(vk: [Field; 115], proof: [Field; 458], inputs: [Field; 139]) {
    assert(vk == approved_owner_key::OWNER_VK);
    bb_proof_verification::verify_honk_proof(
        vk, proof, inputs, approved_owner_key::OWNER_VK_HASH,
    );
    // Retain the exact u32 digest/u64 time interpretation at the recursion edge.
    for i in 0..136 {
        let word = inputs[i] as u32;
        assert(word as Field == inputs[i]);
    }
    for i in 136..139 {
        let timestamp = inputs[i] as u64;
        assert(timestamp as Field == inputs[i]);
    }
}

pub fn digest(inputs: [Field; 139], offset: u32) -> [u32; 8] {
    assert(offset <= 128);
    let mut words: [u32; 8] = [0; 8];
    for i in 0..8 {
        words[i] = inputs[offset + i] as u32;
        assert(words[i] as Field == inputs[offset + i]);
    }
    words
}

pub fn timestamp(inputs: [Field; 139], offset: u32) -> u64 {
    assert((offset >= 136) & (offset < 139));
    let value = inputs[offset] as u64;
    assert(value as Field == inputs[offset]);
    value
}
