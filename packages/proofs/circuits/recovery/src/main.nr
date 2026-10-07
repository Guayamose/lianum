// F41: scoped recovery, available without owner keys or foreign-node witnesses.
// The contract enforces accepted roots, now >= the original cutoff, and atomic
// consumption of the same reserve NF as T. No funding/native-truth claim here.
use poseidon_support::{encoding, framing as internal_framing, merkle};
use poseidon_support::types::{Domain, Core};
use envelope_support::{framing, legacy_note};
use envelope_support::types::Recovery;
use graph_support::sha256::words_to_bytes;

fn main(
    domain_commitment: pub [u32; 8],
    authorization_root: pub [u32; 8],
    pool_root: pub [u32; 8],
    reserve_nullifier: pub [u32; 8],
    recovery_commitment: pub [u32; 8],
    settle_before: pub u64,
    domain: Domain,
    envelope: [u8; 32],
    authorization_siblings: [[u8; 32]; 6],
    authorization_index: u32,
    core: Core,
    core_blind: [u8; 32],
    core_siblings: [[u8; 32]; 4],
    recovery: Recovery,
    recovery_blind: [u8; 32],
    recovery_siblings: [[u8; 32]; 4],
    reserve_siblings: [[u8; 32]; 6],
    reserve_leaf_index: u32,
) {
    let domain_value = encoding::canonical_field(words_to_bytes(domain_commitment));
    let authorization_value = encoding::canonical_field(words_to_bytes(authorization_root));
    let envelope_value = encoding::canonical_field(envelope);
    assert(domain_value != 0);
    assert(envelope_value != 0);
    assert(internal_framing::domain_commitment(domain) == domain_value);
    merkle::membership::<6>(domain_value, 0,
        internal_framing::authorization_leaf(domain_value, envelope_value),
        authorization_siblings, authorization_index, authorization_value);
    merkle::membership::<4>(domain_value, 1,
        internal_framing::core_leaf(domain_value, core, core_blind), core_siblings, 0, envelope_value);
    merkle::membership::<4>(domain_value, 1,
        framing::recovery_leaf(domain_value, recovery, recovery_blind), recovery_siblings, 2, envelope_value);
    assert(recovery.reserve_commitment == core.reserve_commitment);
    assert(recovery.reserve_nullifier == core.reserve_nullifier);
    assert(recovery.reserve_nullifier == words_to_bytes(reserve_nullifier));
    assert(recovery.recovery_commitment == words_to_bytes(recovery_commitment));
    assert(recovery.settle_before == core.settle_before);
    assert(recovery.settle_before == settle_before);
    // The original reserve CM and note root retain legacy SHA membership.
    legacy_note::assert_member(core.reserve_commitment, reserve_siblings, reserve_leaf_index, pool_root);
}

