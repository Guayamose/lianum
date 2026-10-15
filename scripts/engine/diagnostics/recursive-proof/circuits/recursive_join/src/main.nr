mod bb_proof_verification;
mod approved_vk;

// Capability probe only. Child statements and proof bytes are private inputs.
// Approved key bytes are fixed, not authorized by a solver-supplied hash.
fn main(
    vk: [Field; 115],
    proof_a: [Field; 458],
    inputs_a: [Field; 11],
    proof_b: [Field; 458],
    inputs_b: [Field; 11],
    joined: pub Field,
) {
    assert(vk == approved_vk::APPROVED_VK);
    bb_proof_verification::verify_honk_proof(vk, proof_a, inputs_a, approved_vk::APPROVED_VK_HASH);
    bb_proof_verification::verify_honk_proof(vk, proof_b, inputs_b, approved_vk::APPROVED_VK_HASH);
    // Equal total payout budget, distinct downstream values, bound public sum.
    assert(inputs_a[1] + inputs_a[2] == inputs_b[1] + inputs_b[2]);
    assert(inputs_a[0] != inputs_b[0]);
    assert(joined == inputs_a[0] + inputs_b[0]);
}
