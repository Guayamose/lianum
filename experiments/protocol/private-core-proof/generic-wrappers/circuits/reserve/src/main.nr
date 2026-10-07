use generic_wrappers::{owner, membership};
use generic_wrappers::framing::admission;

// S66. Mutable funding state belongs to this owner-independent wrapper and
// contract checks, never to the source owner's immutable A0 authorization.
fn main(
    scope: pub [u32; 8],
    policy: pub [u32; 8],
    asset: pub [u32; 8],
    base_root: pub [u32; 8],
    input_nullifier: pub [u32; 8],
    reserve_commitment: pub [u32; 8],
    change_commitment: pub [u32; 8],
    admission_tag: pub [u32; 8],
    valid_from: pub u64,
    valid_until: pub u64,
    owner_vk: [Field; 115],
    owner_proof: [Field; 458],
    owner_inputs: [Field; 139],
    input_siblings: [[u8; 32]; 6],
    input_leaf_index: u32,
) {
    owner::verify(owner_vk, owner_proof, owner_inputs);
    assert(owner::digest(owner_inputs, 0) == scope);
    assert(owner::digest(owner_inputs, 8) == policy);
    assert(owner::digest(owner_inputs, 16) == asset);
    assert(owner::digest(owner_inputs, 40) == input_nullifier);
    assert(owner::digest(owner_inputs, 72) == reserve_commitment);
    assert(owner::digest(owner_inputs, 88) == change_commitment);
    assert(admission(scope, policy, asset, owner::digest(owner_inputs, 24)) == admission_tag);

    membership::assert_member(
        owner::digest(owner_inputs, 32), input_siblings, input_leaf_index, base_root,
    );
    assert(owner::timestamp(owner_inputs, 136) <= valid_from);
    assert(valid_from < valid_until);
    assert(valid_until <= owner::timestamp(owner_inputs, 137));
}
