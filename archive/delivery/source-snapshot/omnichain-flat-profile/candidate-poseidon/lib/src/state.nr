// Same EvidenceState ABI and canonical 64-entry vector predicates as SHA N'.
// Only the internal digest representation changes; GID bytes stay unchanged.
use native_support::state::EvidenceState;
use poseidon::poseidon2::Poseidon2;
use crate::encoding::{PROFILE, canonical_field, raw_digest_limbs};

// Purpose 5: 10 payload fields; full hash message_size is 14.
pub fn evidence_state_digest(
    domain: Field,
    state: EvidenceState,
) -> Field {
    assert(domain != 0);
    assert(state.receipt_count <= 64);
    assert(state.revoked_count <= 64);
    let receipt_root = canonical_field(state.receipt_root);
    let revoked_digest = canonical_field(state.revoked_digest);
    let hub = raw_digest_limbs(state.hub_domain);
    let registry = raw_digest_limbs(state.registry_commitment);
    let input: [Field; 14] = [
        PROFILE, 1, 5, 10,
        domain,
        hub[0],
        hub[1],
        registry[0],
        registry[1],
        receipt_root,
        state.receipt_count as Field,
        revoked_digest,
        state.revoked_count as Field,
        state.revocation_sequence as Field,
    ];
    Poseidon2::hash(input, 14)
}

// Purpose 6: 133 payload fields, all 64 B32 entries, full hash length 137.
// Return the same constrained limb cache for main's own-GID absence checks.
pub fn bounded_list_digest(
    domain: Field,
    hub_domain: [u8; 32],
    entries: [[u8; 32]; 64],
    count: u32,
) -> (Field, [[Field; 2]; 64]) {
    assert(domain != 0);
    assert(count <= 64);
    let hub = raw_digest_limbs(hub_domain);
    let mut input: [Field; 137] = [0; 137];
    input[0] = PROFILE;
    input[1] = 1;
    input[2] = 6;
    input[3] = 133;
    input[4] = domain;
    input[5] = 0x32;
    input[6] = hub[0];
    input[7] = hub[1];
    input[8] = count as Field;
    let mut encoded: [[Field; 2]; 64] = [[0; 2]; 64];
    for i in 0..64 {
        let entry = raw_digest_limbs(entries[i]);
        encoded[i] = entry;
        input[9 + i * 2] = entry[0];
        input[10 + i * 2] = entry[1];
    }
    for i in 0..64 {
        // Preserve every original canonical-vector predicate, including the
        // full pairwise distinctness checks and zero tail at a private count.
        // Two range-constrained u128 limbs injectively encode all 32 bytes;
        // pair equality/zero therefore means exactly the old byte predicate.
        if i < count {
            assert(encoded[i] != [0; 2]);
            for j in 0..64 {
                if j < i { assert(encoded[i] != encoded[j]); }
            }
        } else { assert(encoded[i] == [0; 2]); }
    }
    (Poseidon2::hash(input, 137), encoded)
}
