use generic_wrappers::{owner, membership};

// F51. Proof membership is against a contract-recognized accepted root. The
// contract enforces root acceptance, current time and unspent reserve nullifier.
fn main(
    scope: pub [u32; 8],
    policy: pub [u32; 8],
    asset: pub [u32; 8],
    accepted_root: pub [u32; 8],
    reserve_nullifier: pub [u32; 8],
    recovery_commitment: pub [u32; 8],
    settle_before: pub u64,
    valid_from: pub u64,
    valid_until: pub u64,
    owner_vk: [Field; 115],
    owner_proof: [Field; 458],
    owner_inputs: [Field; 139],
    reserve_siblings: [[u8; 32]; 6],
    reserve_leaf_index: u32,
) {
    owner::verify(owner_vk, owner_proof, owner_inputs);
    assert(owner::digest(owner_inputs, 0) == scope);
    assert(owner::digest(owner_inputs, 8) == policy);
    assert(owner::digest(owner_inputs, 16) == asset);
    assert(owner::digest(owner_inputs, 80) == reserve_nullifier);
    assert(owner::digest(owner_inputs, 128) == recovery_commitment);
    assert(owner::timestamp(owner_inputs, 138) == settle_before);

    membership::assert_member(
        owner::digest(owner_inputs, 72), reserve_siblings, reserve_leaf_index, accepted_root,
    );
    assert(settle_before <= valid_from);
    assert(valid_from < valid_until);
}
