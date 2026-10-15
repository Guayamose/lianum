use generic_wrappers::owner;
use generic_native_support::capsule::{Statement, Witness, assert_capsules};
use graph_support::sha256::words_to_bytes;

// C129 is owner-produced before exit. A0 is verified exactly once with the
// existing literal full VK/hash, never a host boolean or caller-chosen key pin.
// This source is not a compiled/proven/activated C profile or a C key pin.
fn main(
    scope: pub [u32; 8],
    policy: pub [u32; 8],
    asset: pub [u32; 8],
    hub_domain: pub [u32; 8],
    registry_commitment: pub [u32; 8],
    context: pub [u32; 8],
    reserve_commitment: pub [u32; 8],
    reserve_nullifier: pub [u32; 8],
    local_capsule_commitments: pub [[u32; 8]; 4],
    dependency_capsule_commitments: pub [[u32; 8]; 4],
    settle_before: pub u64,
    owner_vk: [Field; 115],
    owner_proof: [Field; 458],
    owner_inputs: [Field; 139],
    witness: Witness,
) {
    owner::verify(owner_vk, owner_proof, owner_inputs);
    let mut owner_digests: [[u8; 32]; 17] = [[0; 32]; 17];
    for i in 0..17 { owner_digests[i] = words_to_bytes(owner::digest(owner_inputs, i * 8)); }
    let owner_times = [owner::timestamp(owner_inputs, 136), owner::timestamp(owner_inputs, 137),
        owner::timestamp(owner_inputs, 138)];
    let mut local_commitments: [[u8; 32]; 4] = [[0; 32]; 4];
    let mut dependency_commitments: [[u8; 32]; 4] = [[0; 32]; 4];
    for i in 0..4 {
        local_commitments[i] = words_to_bytes(local_capsule_commitments[i]);
        dependency_commitments[i] = words_to_bytes(dependency_capsule_commitments[i]);
    }
    assert_capsules(Statement {
        scope: words_to_bytes(scope), policy: words_to_bytes(policy), asset: words_to_bytes(asset),
        hub_domain: words_to_bytes(hub_domain), registry_commitment: words_to_bytes(registry_commitment),
        context: words_to_bytes(context), reserve_commitment: words_to_bytes(reserve_commitment),
        reserve_nullifier: words_to_bytes(reserve_nullifier), local_capsule_commitments: local_commitments,
        dependency_capsule_commitments: dependency_commitments, settle_before,
    }, owner_digests, owner_times, witness);
}
